import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../auth';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { decrypt, encrypt } from '../../integrations/crypto';
import { writeAudit } from '../../domain/audit';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { implicitAck } from '../../domain/acknowledge';

export const calendarRoutes = Router();
calendarRoutes.use(requireAuth);

const createEventSchema = z.object({
  leadId: z.string(),
  title: z.string().max(200),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  attendeeEmail: z.string().email().optional(),
});

// ── Create Google Calendar event ──────────────────────────────────────────────
calendarRoutes.post('/events', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = createEventSchema.strict().parse(req.body);

    await withTenant(r.workspaceId, async (client) => {
      // Check connection
      const { rows: connRows } = await client.query<{
        encrypted_tokens: string;
        expires_at: Date;
        status: string;
        id: string;
      }>(
        `SELECT id, encrypted_tokens, expires_at, status
         FROM calendar_connection WHERE user_id = $1 AND workspace_id = $2 AND provider = 'google'`,
        [r.userId, r.workspaceId],
      );

      if (!connRows[0]) throw new AppError(409, 'calendar_not_connected', 'Google Calendar is not connected');
      if (connRows[0].status === 'needs_reconnect') throw new AppError(409, 'needs_reconnect', 'Google Calendar needs reconnection');

      let tokens = JSON.parse(await decrypt(connRows[0].encrypted_tokens, r.workspaceId, 'google')) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      // Refresh token if expiring within 60s
      const { config } = await import('../../config');
      if (connRows[0].expires_at < new Date(Date.now() + 60000)) {
        if (!tokens.refresh_token) {
          await client.query(`UPDATE calendar_connection SET status = 'needs_reconnect' WHERE id = $1`, [connRows[0].id]);
          throw new AppError(409, 'needs_reconnect', 'Token expired — please reconnect Google Calendar');
        }
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: tokens.refresh_token,
            client_id: config.GOOGLE_CLIENT_ID ?? '',
            client_secret: config.GOOGLE_CLIENT_SECRET ?? '',
            grant_type: 'refresh_token',
          }),
        });
        const newTokens = await refreshRes.json() as { access_token?: string; expires_in?: number; error?: string };
        if (!refreshRes.ok || !newTokens.access_token) {
          await client.query(`UPDATE calendar_connection SET status = 'needs_reconnect' WHERE id = $1`, [connRows[0].id]);
          throw new AppError(409, 'needs_reconnect', `Token refresh failed: ${newTokens.error}`);
        }
        tokens = { ...tokens, ...newTokens };
        const encrypted = await encrypt(JSON.stringify(tokens), r.workspaceId, 'google');
        const expiresAt = new Date(Date.now() + ((newTokens.expires_in ?? 3600) * 1000));
        await client.query(`UPDATE calendar_connection SET encrypted_tokens = $1, expires_at = $2 WHERE id = $3`, [encrypted, expiresAt, connRows[0].id]);
      }

      // Create Google Calendar event
      const eventPayload = {
        summary: body.title,
        start: { dateTime: body.startAt },
        end: { dateTime: body.endAt },
        ...(body.attendeeEmail && { attendees: [{ email: body.attendeeEmail }] }),
      };

      const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload),
      });

      if (!gcalRes.ok) {
        const err = await gcalRes.json() as { error?: { message?: string } };
        throw new AppError(502, 'calendar_error', err.error?.message ?? 'Google Calendar API error');
      }

      const gcalEvent = await gcalRes.json() as { id: string };

      const appointmentId = `appt_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO appointment (id, workspace_id, lead_id, user_id, title, start_at, end_at, google_event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [appointmentId, r.workspaceId, body.leadId, r.userId, body.title, body.startAt, body.endAt, gcalEvent.id],
      );

      await implicitAck(client, r.workspaceId, body.leadId, r.userId);
      await writeAudit(client, { workspaceId: r.workspaceId, userId: r.userId, type: 'appointment.created', entityType: 'appointment', entityId: appointmentId, actor: 'user' });

      res.status(201).json({ appointmentId, googleEventId: gcalEvent.id });
    });
  } catch (err) { next(err); }
});
