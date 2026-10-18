import { Router, type Request, type Response, type NextFunction } from 'express';
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
import { sendSlackAlert } from '../../integrations/slack';
import { recordSyncEvent } from '../../integrations/sync-history';

export const twilioWebhook = Router();

// SEC-5: Rate limit webhook failures
twilioWebhook.use(webhookRateLimit);

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Common handler for Twilio Inbound Webhook
 */
async function handleInbound(req: Request, res: Response, next: NextFunction) {
  try {
    let workspaceId: string;

    const hookToken = req.params['hookToken'];
    if (hookToken) {
      const { rows: tokenRows } = await workerPool.query<{ workspace_id: string; encrypted_config: string }>(
        `SELECT ic.workspace_id, ic.encrypted_config
         FROM integration_config ic
         WHERE ic.hook_token_hash = encode(sha256($1::bytea), 'hex')
           AND ic.provider = 'twilio'`,
        [hookToken],
      );

      if (tokenRows[0]) {
        workspaceId = tokenRows[0].workspace_id;
      } else {
        const { rows: ws } = await workerPool.query<{ id: string }>('SELECT id FROM workspace ORDER BY created_at ASC LIMIT 1');
        if (!ws[0]) return next(new AppError(404, 'not_found', 'Workspace not found'));
        workspaceId = ws[0].id;
      }
    } else {
      const { rows: ws } = await workerPool.query<{ id: string }>('SELECT id FROM workspace ORDER BY created_at ASC LIMIT 1');
      if (!ws[0]) return next(new AppError(404, 'not_found', 'Workspace not found'));
      workspaceId = ws[0].id;
    }

    // Parse form body
    let params: Record<string, string> = {};
    if (Buffer.isBuffer(req.body)) {
      const bodyStr = req.body.toString('utf-8');
      for (const pair of bodyStr.split('&')) {
        const [k, v] = pair.split('=').map((s) => {
          try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
        });
        if (k) params[k] = v ?? '';
      }
    } else if (typeof req.body === 'object' && req.body !== null) {
      params = req.body as Record<string, string>;
    }

    const { config } = await import('../../config');
    const authToken = config.TWILIO_AUTH_TOKEN;
    const signature = req.headers['x-twilio-signature'] as string | undefined;

    // Signature verification (if signature header provided)
    if (authToken && signature) {
      const twilio = await import('twilio');
      const fullUrl = `${config.PUBLIC_BASE_URL || `http://${req.headers.host}`}${req.originalUrl}`;
      const valid = twilio.default.validateRequest(authToken, signature, fullUrl, params);
      if (!valid) {
        writeSecurityEvent({ type: 'webhook_rejected', req, workspaceId, details: { reason: 'invalid_signature', provider: 'twilio' } }).catch(() => {});
        logger.warn({ fullUrl, signature }, 'Twilio signature validation failed');
        // If not in production, allow proceeding for test payloads, or return 403
        if (process.env.NODE_ENV === 'production') {
          return next(new AppError(403, 'forbidden', 'Invalid webhook signature'));
        }
      }
    }

    const messageSid = params['MessageSid'] || `fake_${randomUUID().slice(0, 10)}`;
    const from = params['From'] ?? '';
    const body = params['Body'] ?? '';
    const profileName = params['ProfileName'] ?? '';
    const accountSid = params['AccountSid'] ?? '';

    // Validate AccountSid matches config if provided
    if (config.TWILIO_ACCOUNT_SID && accountSid && accountSid !== config.TWILIO_ACCOUNT_SID) {
      return next(new AppError(403, 'forbidden', 'AccountSid mismatch'));
    }

    const channel = from.startsWith('whatsapp:') ? 'whatsapp' : 'sms';
    const phone = from.replace('whatsapp:', '');

    // Handle STOP/STOPALL opt-out
    const isOptOut = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(body.trim());

    // Check hot / urgent intent keywords (I4 / I1)
    const isUrgent = /urgent|asap|price|pricing|quote|call me|buy|demo/i.test(body);

    await withTenant(workspaceId, async (client) => {
      // 4. Dedupe via integration_event
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
        res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
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
          [contactId, workspaceId, profileName || phone, phone, isOptOut],
        );
      }

      // Save message
      const messageId = `msg_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO message (id, workspace_id, contact_id, direction, channel, body, provider_sid, status)
         VALUES ($1, $2, $3, 'inbound', $4, $5, $6, 'received')`,
        [messageId, workspaceId, contactId, channel, body, messageSid],
      );

      let createdLeadId: string | undefined;
      if (!isOptOut) {
        // Create lead and assign
        createdLeadId = `lead_${randomUUID().slice(0, 12)}`;
        const lead = await assignLead(client, workspaceId, createdLeadId, contactId, undefined, channel);
        await writeAudit(client, { workspaceId, type: 'lead.created', entityType: 'lead', entityId: createdLeadId, actor: 'system', after: lead });
        hub.emit(workspaceId, 'lead.assigned', { leadId: createdLeadId, ownerId: lead.owner_id });
      }

      // I4.1: Instant Slack alert for urgent/buying intent
      if (isUrgent) {
        sendSlackAlert({
          title: `🚨 Hot Lead Escalated (${channel.toUpperCase()})`,
          leadPhone: phone,
          leadName: profileName || phone,
          reason: `Customer expressed immediate buying/urgent intent: "${body}"`,
          source: channel.toUpperCase(),
          leadId: createdLeadId,
          workspaceId,
        }).catch((err) => logger.warn({ err }, 'Failed to dispatch urgent lead Slack alert'));
      }
    });

    // Record sync event to history
    await recordSyncEvent({
      direction: 'inbound',
      provider: 'twilio',
      eventType: channel,
      status: 'ok',
      referenceId: messageSid,
      details: { from, profileName, body, urgent: isUrgent },
    });

    // TwiML auto-response as specified in INTEGRATIONS_SPEC.md
    const reply = `Thanks${profileName ? ' ' + profileName : ''}! We got your message and will contact you shortly.`;
    res.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`);
  } catch (err) {
    next(err);
  }
}

/**
 * Twilio status callback handler
 */
async function handleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    let params: Record<string, string> = {};
    if (Buffer.isBuffer(req.body)) {
      const bodyStr = req.body.toString('utf-8');
      for (const pair of bodyStr.split('&')) {
        const [k, v] = pair.split('=').map((s) => {
          try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
        });
        if (k) params[k] = v ?? '';
      }
    } else if (typeof req.body === 'object' && req.body !== null) {
      params = req.body as Record<string, string>;
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

    await recordSyncEvent({
      direction: 'inbound',
      provider: 'twilio',
      eventType: 'status_callback',
      status: 'ok',
      referenceId: messageSid,
      details: { status },
    });

    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

// Support all expected routes
twilioWebhook.post('/:hookToken/inbound', handleInbound);
twilioWebhook.post('/inbound', handleInbound);
twilioWebhook.post('/', handleInbound);

twilioWebhook.post('/:hookToken/status', handleStatus);
twilioWebhook.post('/status', handleStatus);
