import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../auth';
import { withTenant } from '../../db/tenant';
import { implicitAck } from '../../domain/acknowledge';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { AppError } from '../errors';
import { recordSyncEvent } from '../../integrations/sync-history';

export const messagingRoutes = Router();
messagingRoutes.use(requireAuth);

const sendSchema = z.object({
  contactId: z.string().optional(),
  leadId: z.string().optional(),
  to: z.string().optional(),
  body: z.string().max(4096),
  isWhatsApp: z.boolean().optional(),
  optedOut: z.boolean().optional(),
});

async function handleSendMessage(req: any, res: any, next: any) {
  const r = req as AuthRequest;
  try {
    const { contactId, leadId, to, body, isWhatsApp, optedOut } = sendSchema.parse(req.body);

    if (optedOut) {
      return res.status(400).json({ error: 'Contact has opted out and cannot be messaged.' });
    }

    if (!contactId && !to) {
      throw new AppError(400, 'validation_error', 'Either contactId or to phone number is required');
    }

    await withTenant(r.workspaceId, async (client) => {
      let resolvedContactId = contactId;
      let targetPhone = to || '';

      if (resolvedContactId) {
        const { rows } = await client.query<{ opted_out: boolean; phone_e164: string }>(
          `SELECT opted_out, phone_e164 FROM contact WHERE id = $1 AND workspace_id = $2`,
          [resolvedContactId, r.workspaceId],
        );
        if (!rows[0]) throw new AppError(404, 'not_found', 'Contact not found');
        if (rows[0].opted_out) {
          return res.status(400).json({ error: 'Contact has opted out (STOP received). Messaging is disabled for compliance.' });
        }
        targetPhone = rows[0].phone_e164;
      } else if (targetPhone) {
        const cleanPhone = targetPhone.replace('whatsapp:', '');
        const { rows } = await client.query<{ id: string; opted_out: boolean }>(
          `SELECT id, opted_out FROM contact WHERE phone_e164 = $1 AND workspace_id = $2`,
          [cleanPhone, r.workspaceId],
        );
        if (rows[0]) {
          resolvedContactId = rows[0].id;
          if (rows[0].opted_out) {
            return res.status(400).json({ error: 'Contact has opted out (STOP received). Messaging is disabled for compliance.' });
          }
        }
      }

      const { config } = await import('../../config');
      const client2 = await import('twilio');
      const twilioClient = client2.default(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

      // Determine channel
      const useWhatsApp = isWhatsApp !== undefined
        ? isWhatsApp
        : (to?.startsWith('whatsapp:') || !!config.TWILIO_WHATSAPP_FROM);

      const fromNumber = useWhatsApp
        ? (config.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886')
        : (config.TWILIO_PHONE_NUMBER || '+17372508034');

      const recipient = useWhatsApp && !targetPhone.startsWith('whatsapp:')
        ? `whatsapp:${targetPhone}`
        : targetPhone;

      const statusCallback = `${config.PUBLIC_BASE_URL}/webhook/status`;

      try {
        const msg = await twilioClient.messages.create({
          from: fromNumber,
          to: recipient,
          body,
          statusCallback,
        });

        const messageId = `msg_${randomUUID().slice(0, 12)}`;
        if (resolvedContactId) {
          await client.query(
            `INSERT INTO message (id, workspace_id, contact_id, leadId, direction, channel, body, provider_sid, status)
             VALUES ($1, $2, $3, $4, 'outbound', $5, $6, $7, $8)
             ON CONFLICT DO NOTHING`,
            [messageId, r.workspaceId, resolvedContactId, leadId ?? null, useWhatsApp ? 'whatsapp' : 'sms', body, msg.sid, msg.status || 'sent'],
          ).catch(async () => {
            // fallback without leadId column if schema difference
            await client.query(
              `INSERT INTO message (id, workspace_id, contact_id, direction, channel, body, provider_sid, status)
               VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7)`,
              [messageId, r.workspaceId, resolvedContactId, useWhatsApp ? 'whatsapp' : 'sms', body, msg.sid, msg.status || 'sent'],
            );
          });
        }

        if (leadId) await implicitAck(client, r.workspaceId, leadId, r.userId);

        await recordSyncEvent({
          direction: 'outbound',
          provider: 'twilio',
          eventType: useWhatsApp ? 'whatsapp' : 'sms',
          status: 'ok',
          referenceId: msg.sid,
          details: { to: recipient, status: msg.status },
        });

        res.status(200).json({
          success: true,
          ok: true,
          messageSid: msg.sid,
          status: msg.status,
        });
      } catch (err: any) {
        await recordSyncEvent({
          direction: 'outbound',
          provider: 'twilio',
          eventType: useWhatsApp ? 'whatsapp' : 'sms',
          status: 'failed',
          details: { error: err.message, code: err.code },
        });
        res.status(err.status || 500).json({
          error: err.message,
          code: err.code,
        });
      }
    });
  } catch (err) { next(err); }
}

messagingRoutes.post('/send', handleSendMessage);

// ── List messages for contact ─────────────────────────────────────────────────
messagingRoutes.get('/contact/:contactId', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, direction, body, status, created_at FROM message
         WHERE contact_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 50`,
        [req.params['contactId'], r.workspaceId],
      );
      res.json({ messages: rows });
    });
  } catch (err) { next(err); }
});
