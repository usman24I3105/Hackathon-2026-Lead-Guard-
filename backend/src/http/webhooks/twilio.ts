import { Router } from 'express';
import { randomUUID } from 'crypto';
import { workerPool } from '../../db/pool';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { assignLead } from '../../domain/assignment';
import { writeAudit } from '../../domain/audit';
import { hub } from '../../realtime/hub';
import { webhookRateLimit } from '../../security/limits';
import { writeSecurityEvent } from '../../security/security-events';
import logger from '../logger';

export const twilioWebhook = Router();

// SEC-5: Rate limit webhook failures
twilioWebhook.use(webhookRateLimit);

/**
 * BE-8: Twilio inbound WhatsApp webhook
 * Path: /webhooks/twilio/:hookToken/inbound
 * Raw body required for signature validation.
 */
twilioWebhook.post('/:hookToken/inbound', async (req, res, next) => {
  try {
    // 1. Resolve workspace from hook token
    const { rows: tokenRows } = await workerPool.query<{ workspace_id: string; encrypted_config: string }>(
      `SELECT ic.workspace_id, ic.encrypted_config
       FROM integration_config ic
       WHERE ic.hook_token_hash = encode(sha256($1::bytea), 'hex')
         AND ic.provider = 'twilio'`,
      [req.params['hookToken']],
    );
    if (!tokenRows[0]) {
      writeSecurityEvent({ type: 'webhook_rejected', req, details: { reason: 'unknown_token', provider: 'twilio' } }).catch(() => {});
      return next(new AppError(404, 'not_found', 'Webhook endpoint not found'));
    }
    const workspaceId = tokenRows[0].workspace_id;

    // 2. Verify Twilio signature BEFORE parsing body
    const { config } = await import('../../config');
    const authToken = config.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const twilio = await import('twilio');
      const url = `${config.PUBLIC_BASE_URL}${req.originalUrl}`;
      const rawBody = req.body as Buffer;
      const signature = req.headers['x-twilio-signature'] as string;

      // Parse form body for signature validation
      const formBody: Record<string, string> = {};
      const bodyStr = rawBody.toString('utf-8');
      for (const pair of bodyStr.split('&')) {
        const [k, v] = pair.split('=').map(decodeURIComponent);
        if (k) formBody[k] = v ?? '';
      }

      const valid = twilio.default.validateRequest(authToken, signature, url, formBody);
      if (!valid) {
        writeSecurityEvent({ type: 'webhook_rejected', req, workspaceId, details: { reason: 'invalid_signature', provider: 'twilio' } }).catch(() => {});
        return next(new AppError(403, 'forbidden', 'Invalid webhook signature'));
      }
    }

    // 3. Parse form body
    const rawBody = req.body as Buffer;
    const params: Record<string, string> = {};
    for (const pair of rawBody.toString('utf-8').split('&')) {
      const [k, v] = pair.split('=').map(decodeURIComponent);
      if (k) params[k] = v ?? '';
    }

    const messageSid = params['MessageSid'] ?? '';
    const from = params['From'] ?? '';
    const body = params['Body'] ?? '';
    const accountSid = params['AccountSid'] ?? '';

    // Validate AccountSid matches workspace config
    if (config.TWILIO_ACCOUNT_SID && accountSid !== config.TWILIO_ACCOUNT_SID) {
      return next(new AppError(403, 'forbidden', 'AccountSid mismatch'));
    }

    // Normalize phone from whatsapp:+xxx to E.164
    const phone = from.replace('whatsapp:', '');

    // Handle STOP/STOPALL opt-out
    const isOptOut = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(body.trim());

    await withTenant(workspaceId, async (client) => {
      // 4. Dedupe via integration_event (INSERT ... ON CONFLICT DO NOTHING)
      const { rowCount: dupeCheck } = await client.query(
        `INSERT INTO integration_event (workspace_id, provider, external_id, event_type, status)
         VALUES ($1, 'twilio', $2, 'inbound', 'ok')
         ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
        [workspaceId, messageSid],
      );

      if (dupeCheck === 0) {
        logger.info({ messageSid }, 'Duplicate Twilio inbound event ignored');
        await client.query(
          `UPDATE integration_event SET status = 'duplicate' WHERE workspace_id = $1 AND provider = 'twilio' AND external_id = $2`,
          [workspaceId, messageSid],
        );
        return;
      }

      // Contact match or create
      let contactId: string;
      const { rows: contacts } = await client.query<{ id: string; opted_out: boolean }>(
        `SELECT id, opted_out FROM contact WHERE workspace_id = $1 AND phone_e164 = $2`,
        [workspaceId, phone],
      );

      if (contacts[0]) {
        contactId = contacts[0].id;
        if (isOptOut) {
          await client.query(`UPDATE contact SET opted_out = true WHERE id = $1`, [contactId]);
          await writeAudit(client, { workspaceId, type: 'contact.opted_out', entityType: 'contact', entityId: contactId, actor: 'system' });
        }
      } else {
        contactId = `con_${randomUUID().slice(0, 12)}`;
        await client.query(
          `INSERT INTO contact (id, workspace_id, name, phone_e164, opted_out) VALUES ($1, $2, $3, $4, $5)`,
          [contactId, workspaceId, phone, phone, isOptOut],
        );
      }

      // Save message
      const messageId = `msg_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO message (id, workspace_id, contact_id, direction, channel, body, provider_sid, status)
         VALUES ($1, $2, $3, 'inbound', 'whatsapp', $4, $5, 'received')`,
        [messageId, workspaceId, contactId, body, messageSid],
      );

      if (!isOptOut) {
        // Create lead and assign
        const leadId = `lead_${randomUUID().slice(0, 12)}`;
        const lead = await assignLead(client, workspaceId, leadId, contactId, undefined, 'whatsapp');
        await writeAudit(client, { workspaceId, type: 'lead.created', entityType: 'lead', entityId: leadId, actor: 'system', after: lead });
        hub.emit(workspaceId, 'lead.assigned', { leadId, ownerId: lead.owner_id });
      }
    });

    res.status(200).type('text/xml').send('<Response></Response>');
  } catch (err) {
    next(err);
  }
});

/**
 * Twilio status callback
 * Path: /webhooks/twilio/:hookToken/status
 */
twilioWebhook.post('/:hookToken/status', async (req, res, next) => {
  try {
    const rawBody = req.body as Buffer;
    const params: Record<string, string> = {};
    for (const pair of rawBody.toString('utf-8').split('&')) {
      const [k, v] = pair.split('=').map(decodeURIComponent);
      if (k) params[k] = v ?? '';
    }

    const { MessageSid: messageSid, MessageStatus: status } = params;
    if (!messageSid || !status) {
      res.sendStatus(200);
      return;
    }

    await workerPool.query(
      `UPDATE message SET status = $1 WHERE provider_sid = $2`,
      [status.toLowerCase(), messageSid],
    );

    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});
