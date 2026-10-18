import { Router } from 'express';
import type { PoolClient } from 'pg';
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

const updateEventSchema = z.object({
  title: z.string().max(200).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  attendeeEmail: z.string().email().optional(),
});

/**
 * Helper: get active access token or refresh automatically.
 */
async function getValidGoogleToken(client: PoolClient, workspaceId: string, userId: string): Promise<string | null> {
  const { rows: connRows } = await client.query<{
    id: string;
    encrypted_tokens: string;
    expires_at: Date;
    status: string;
  }>(
    `SELECT id, encrypted_tokens, expires_at, status
     FROM calendar_connection WHERE user_id = $1 AND workspace_id = $2 AND provider = 'google'`,
    [userId, workspaceId],
  );

  if (!connRows[0] || connRows[0].status === 'needs_reconnect') {
    return null;
  }

  let tokens = JSON.parse(await decrypt(connRows[0].encrypted_tokens, workspaceId, 'google')) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const { config } = await import('../../config');
  if (connRows[0].expires_at < new Date(Date.now() + 60000)) {
    if (!tokens.refresh_token) {
      await client.query(`UPDATE calendar_connection SET status = 'needs_reconnect' WHERE id = $1`, [connRows[0].id]);
      return null;
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
      return null;
    }
    tokens = { ...tokens, ...newTokens };
    const encrypted = await encrypt(JSON.stringify(tokens), workspaceId, 'google');
    const expiresAt = new Date(Date.now() + ((newTokens.expires_in ?? 3600) * 1000));
    await client.query(`UPDATE calendar_connection SET encrypted_tokens = $1, expires_at = $2 WHERE id = $3`, [encrypted, expiresAt, connRows[0].id]);
  }

  return tokens.access_token;
}

// ── GET /status: Connection status for current user + team if manager ──────────
calendarRoutes.get('/status', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows: userRows } = await client.query<{ role: string; permissions: string[] }>(
        `SELECT role, permissions FROM "user" WHERE id = $1 AND workspace_id = $2`,
        [r.userId, r.workspaceId],
      );
      const user = userRows[0];
      const isManager = user?.role === 'owner' || user?.role === 'admin' || user?.permissions?.includes('team.manage');

      const { rows: myConn } = await client.query<{
        id: string;
        expires_at: Date;
        status: string;
      }>(
        `SELECT id, expires_at, status FROM calendar_connection
         WHERE user_id = $1 AND workspace_id = $2 AND provider = 'google'`,
        [r.userId, r.workspaceId],
      );

      let teamStatus: Array<{ id: string; name: string; email: string; status: string; connected: boolean }> | undefined;
      if (isManager) {
        const { rows: teamRows } = await client.query<{
          id: string;
          name: string;
          email: string;
          conn_status: string | null;
        }>(
          `SELECT u.id, u.name, u.email, cc.status AS conn_status
           FROM "user" u
           LEFT JOIN calendar_connection cc ON cc.user_id = u.id AND cc.workspace_id = u.workspace_id AND cc.provider = 'google'
           WHERE u.workspace_id = $1
           ORDER BY u.name ASC`,
          [r.workspaceId],
        );
        teamStatus = teamRows.map(t => ({
          id: t.id,
          name: t.name,
          email: t.email,
          status: t.conn_status ?? 'not_connected',
          connected: t.conn_status === 'connected',
        }));
      }

      res.json({
        connected: myConn[0]?.status === 'connected',
        status: myConn[0]?.status ?? 'not_connected',
        expiresAt: myConn[0]?.expires_at ?? null,
        provider: 'google',
        ...(teamStatus && { team: teamStatus }),
      });
    });
  } catch (err) { next(err); }
});

// ── GET /busy: Check busy slots for an employee ──────────────────────────────
calendarRoutes.get('/busy', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const targetUserId = (req.query.userId as string) || r.userId;
    const start = req.query.start as string;
    const end = req.query.end as string;

    if (!start || !end) {
      throw new AppError(400, 'invalid_request', 'start and end query parameters (ISO-8601) are required');
    }

    await withTenant(r.workspaceId, async (client) => {
      // 1. Internal appointments
      const { rows: apptRows } = await client.query<{
        id: string;
        title: string;
        start_at: Date;
        end_at: Date;
      }>(
        `SELECT id, title, start_at, end_at FROM appointment
         WHERE workspace_id = $1 AND user_id = $2
           AND start_at < $4 AND end_at > $3
         ORDER BY start_at ASC`,
        [r.workspaceId, targetUserId, start, end],
      );

      const busySlots: Array<{ start: string; end: string; title?: string; source: 'internal' | 'google' }> =
        apptRows.map(a => ({
          start: a.start_at.toISOString(),
          end: a.end_at.toISOString(),
          title: a.title,
          source: 'internal',
        }));

      // 2. Google freeBusy query if token available
      try {
        const accessToken = await getValidGoogleToken(client, r.workspaceId, targetUserId);
        if (accessToken) {
          const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timeMin: start,
              timeMax: end,
              items: [{ id: 'primary' }],
            }),
          });
          if (gcalRes.ok) {
            const data = await gcalRes.json() as {
              calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
            };
            const googleBusy = data.calendars?.primary?.busy ?? [];
            for (const b of googleBusy) {
              busySlots.push({ start: b.start, end: b.end, source: 'google' });
            }
          }
        }
      } catch {
        // Fall back gracefully to internal appointments if Google API is unreachable
      }

      res.json({ busy: busySlots, total: busySlots.length });
    });
  } catch (err) { next(err); }
});

// ── GET /events: List appointments ───────────────────────────────────────────
calendarRoutes.get('/events', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const leadId = req.query.leadId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    await withTenant(r.workspaceId, async (client) => {
      let query = `
        SELECT a.id, a.title, a.start_at, a.end_at, a.google_event_id, a.created_at,
               l.id AS lead_id, l.state AS lead_state,
               c.id AS contact_id, c.name AS contact_name, c.email AS contact_email, c.phone_e164,
               u.id AS user_id, u.name AS user_name, u.email AS user_email
        FROM appointment a
        JOIN lead l ON l.id = a.lead_id
        JOIN contact c ON c.id = l.contact_id
        JOIN "user" u ON u.id = a.user_id
        WHERE a.workspace_id = $1
      `;
      const params: any[] = [r.workspaceId];

      if (leadId) {
        params.push(leadId);
        query += ` AND a.lead_id = $${params.length}`;
      }
      if (userId) {
        params.push(userId);
        query += ` AND a.user_id = $${params.length}`;
      }
      if (from) {
        params.push(from);
        query += ` AND a.start_at >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        query += ` AND a.end_at <= $${params.length}`;
      }

      query += ` ORDER BY a.start_at ASC`;

      const { rows } = await client.query(query, params);
      res.json({ appointments: rows, total: rows.length });
    });
  } catch (err) { next(err); }
});

// ── POST /events: Create Google Calendar event + local appointment ─────────────
calendarRoutes.post('/events', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = createEventSchema.strict().parse(req.body);

    await withTenant(r.workspaceId, async (client) => {
      // Check connection
      const { rows: connRows } = await client.query<{
        id: string;
        encrypted_tokens: string;
        expires_at: Date;
        status: string;
      }>(
        `SELECT id, encrypted_tokens, expires_at, status
         FROM calendar_connection WHERE user_id = $1 AND workspace_id = $2 AND provider = 'google'`,
        [r.userId, r.workspaceId],
      );

      if (!connRows[0]) throw new AppError(409, 'calendar_not_connected', 'Google Calendar is not connected');
      if (connRows[0].status === 'needs_reconnect') throw new AppError(409, 'needs_reconnect', 'Google Calendar needs reconnection');

      const accessToken = await getValidGoogleToken(client, r.workspaceId, r.userId);
      if (!accessToken) throw new AppError(409, 'needs_reconnect', 'Google Calendar token expired or invalid — please reconnect');

      // Create Google Calendar event
      const eventPayload = {
        summary: body.title,
        start: { dateTime: body.startAt },
        end: { dateTime: body.endAt },
        ...(body.attendeeEmail && { attendees: [{ email: body.attendeeEmail }] }),
      };

      const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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
      await writeAudit(client, {
        workspaceId: r.workspaceId,
        userId: r.userId,
        type: 'appointment.created',
        entityType: 'appointment',
        entityId: appointmentId,
        actor: 'user',
      });

      res.status(201).json({ appointmentId, googleEventId: gcalEvent.id });
    });
  } catch (err) { next(err); }
});

// ── PATCH /events/:id: Update/reschedule an appointment ───────────────────────
calendarRoutes.patch('/events/:id', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = updateEventSchema.strict().parse(req.body);

    await withTenant(r.workspaceId, async (client) => {
      const { rows: apptRows } = await client.query<{
        id: string;
        title: string;
        start_at: Date;
        end_at: Date;
        google_event_id: string | null;
        user_id: string;
      }>(
        `SELECT id, title, start_at, end_at, google_event_id, user_id
         FROM appointment WHERE id = $1 AND workspace_id = $2`,
        [req.params.id, r.workspaceId],
      );

      if (!apptRows[0]) throw new AppError(404, 'not_found', 'Appointment not found');
      const appt = apptRows[0];

      const newTitle = body.title ?? appt.title;
      const newStart = body.startAt ?? appt.start_at.toISOString();
      const newEnd = body.endAt ?? appt.end_at.toISOString();

      // Sync to Google Calendar if linked
      if (appt.google_event_id) {
        try {
          const accessToken = await getValidGoogleToken(client, r.workspaceId, appt.user_id);
          if (accessToken) {
            await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.google_event_id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                summary: newTitle,
                start: { dateTime: newStart },
                end: { dateTime: newEnd },
                ...(body.attendeeEmail && { attendees: [{ email: body.attendeeEmail }] }),
              }),
            });
          }
        } catch {
          // Continue updating local appointment even if Google API is offline
        }
      }

      const { rows: updated } = await client.query(
        `UPDATE appointment
         SET title = $1, start_at = $2, end_at = $3
         WHERE id = $4 AND workspace_id = $5
         RETURNING id, title, start_at, end_at, google_event_id`,
        [newTitle, newStart, newEnd, req.params.id, r.workspaceId],
      );

      await writeAudit(client, {
        workspaceId: r.workspaceId,
        userId: r.userId,
        type: 'appointment.updated',
        entityType: 'appointment',
        entityId: String(req.params.id),
        before: { title: appt.title, start_at: appt.start_at, end_at: appt.end_at },
        after: { title: newTitle, start_at: newStart, end_at: newEnd },
        actor: 'user',
      });

      res.json({ appointment: updated[0] });
    });
  } catch (err) { next(err); }
});

// ── DELETE /events/:id: Cancel an appointment ─────────────────────────────────
calendarRoutes.delete('/events/:id', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows: apptRows } = await client.query<{
        id: string;
        title: string;
        google_event_id: string | null;
        user_id: string;
      }>(
        `SELECT id, title, google_event_id, user_id
         FROM appointment WHERE id = $1 AND workspace_id = $2`,
        [req.params.id, r.workspaceId],
      );

      if (!apptRows[0]) throw new AppError(404, 'not_found', 'Appointment not found');
      const appt = apptRows[0];

      if (appt.google_event_id) {
        try {
          const accessToken = await getValidGoogleToken(client, r.workspaceId, appt.user_id);
          if (accessToken) {
            await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.google_event_id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          }
        } catch {
          // Log but continue deletion
        }
      }

      await client.query(`DELETE FROM appointment WHERE id = $1 AND workspace_id = $2`, [req.params.id, r.workspaceId]);

      await writeAudit(client, {
        workspaceId: r.workspaceId,
        userId: r.userId,
        type: 'appointment.cancelled',
        entityType: 'appointment',
        entityId: String(req.params.id),
        before: { title: appt.title },
        actor: 'user',
      });

      res.status(204).end();
    });
  } catch (err) { next(err); }
});
