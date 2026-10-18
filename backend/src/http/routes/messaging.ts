import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../auth';
import { withTenant } from '../../db/tenant';
import { implicitAck } from '../../domain/acknowledge';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { AppError } from '../errors';

export const messagingRoutes = Router();
messagingRoutes.use(requireAuth);

// ── Send WhatsApp message ─────────────────────────────────────────────────────
const sendSchema = z.object({
  contactId: z.string(),
  leadId: z.string().optional(),
  body: z.string().max(4096),
});

messagingRoutes.post('/send', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const { contactId, leadId, body } = sendSchema.strict().parse(req.body);
    await withTenant(r.workspaceId, async (client) => {
      // Check opted-out
      const { rows } = await client.query<{ opted_out: boolean; phone_e164: string }>(
        `SELECT opted_out, phone_e164 FROM contact WHERE id = $1 AND workspace_id = $2`,
        [contactId, r.workspaceId],
      );
      if (!rows[0]) throw new AppError(404, 'not_found', 'Contact not found');
      if (rows[0].opted_out) throw new AppError(409, 'opted_out', 'Contact has opted out');

      const { config } = await import('../../config');
      const client2 = await import('twilio');
      const twilioClient = client2.default(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

      const msg = await twilioClient.messages.create({
        from: config.TWILIO_WHATSAPP_FROM ?? '',
        to: `whatsapp:${rows[0].phone_e164}`,
        body,
      });

      const messageId = `msg_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO message (id, workspace_id, contact_id, lead_id, direction, channel, body, provider_sid, status)
         VALUES ($1, $2, $3, $4, 'outbound', 'whatsapp', $5, $6, 'sent')`,
        [messageId, r.workspaceId, contactId, leadId ?? null, body, msg.sid],
      );

      if (leadId) await implicitAck(client, r.workspaceId, leadId, r.userId);
    });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

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
