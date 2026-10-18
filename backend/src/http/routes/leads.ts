import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { requireAuth, type AuthRequest } from '../auth';
import { publicFormRateLimit } from '../../security/limits';
import { assignLead } from '../../domain/assignment';
import { writeAudit } from '../../domain/audit';
import { hub } from '../../realtime/hub';

export const leadRoutes = Router();

// ── Public lead intake form (no auth) ─────────────────────────────────────────
const publicFormSchema = z.object({
  formToken: z.string(),
  name: z.string().max(200),
  phone: z.string().max(30),
  email: z.string().email().optional(),
  message: z.string().max(2000).optional(),
  website: z.string().optional(), // honeypot
});

leadRoutes.post('/intake', publicFormRateLimit, async (req, res, next) => {
  try {
    const body = publicFormSchema.strict().parse(req.body);

    // Honeypot check
    if (body.website) {
      return res.status(201).json({ ok: true }); // Silent no-op
    }

    // Resolve workspace from form token (worker pool — definer function)
    const { workerPool } = await import('../../db/pool');
    const { rows: tokenRows } = await workerPool.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM integration_config
       WHERE hook_token_hash = encode(sha256($1::bytea), 'hex') AND provider = 'form'`,
      [body.formToken],
    );
    if (!tokenRows[0]) return next(new AppError(404, 'not_found', 'Form not found'));

    const workspaceId = tokenRows[0].workspace_id;

    // Per-phone rate limit (3/hour via DB)
    const normalizedPhone = normalizePhone(body.phone);
    const { rows: phoneCount } = await workerPool.query(
      `SELECT COUNT(*) AS cnt FROM lead
       WHERE workspace_id = $1
       AND created_at > NOW() - INTERVAL '1 hour'
       AND contact_id IN (SELECT id FROM contact WHERE workspace_id = $1 AND phone_e164 = $2)`,
      [workspaceId, normalizedPhone],
    );
    if (parseInt((phoneCount[0] as { cnt: string }).cnt) >= 3) {
      return next(new AppError(429, 'rate_limited', 'Too many submissions from this number'));
    }

    await withTenant(workspaceId, async (client) => {
      // Contact match or create
      let contactId: string;
      const { rows: contacts } = await client.query<{ id: string }>(
        `SELECT id FROM contact WHERE workspace_id = $1 AND phone_e164 = $2`,
        [workspaceId, normalizedPhone],
      );
      if (contacts[0]) {
        contactId = contacts[0].id;
      } else {
        contactId = `con_${randomUUID().slice(0, 12)}`;
        await client.query(
          `INSERT INTO contact (id, workspace_id, name, phone_e164) VALUES ($1, $2, $3, $4)`,
          [contactId, workspaceId, body.name, normalizedPhone],
        );
      }

      // Get first stage of first pipeline
      const { rows: stageRows } = await client.query<{ id: string; pipeline_id: string }>(
        `SELECT s.id, s.pipeline_id FROM stage s
         JOIN pipeline p ON p.id = s.pipeline_id
         WHERE p.workspace_id = $1
         ORDER BY p.position, s.position LIMIT 1`,
        [workspaceId],
      );
      if (!stageRows[0]) throw new AppError(500, 'setup_error', 'No pipeline configured');

      // Create opportunity
      const opportunityId = `opp_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO opportunity (id, workspace_id, contact_id, pipeline_id, stage_id, name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [opportunityId, workspaceId, contactId, stageRows[0].pipeline_id, stageRows[0].id, body.name],
      );

      // Create lead
      const leadId = `lead_${randomUUID().slice(0, 12)}`;
      const lead = await assignLead(client, workspaceId, leadId, contactId, opportunityId, 'form');

      await writeAudit(client, {
        workspaceId,
        type: 'lead.created',
        entityType: 'lead',
        entityId: leadId,
        actor: 'system',
        after: lead,
      });

      // Emit SSE
      hub.emit(workspaceId, 'lead.assigned', { leadId, ownerId: lead.owner_id });
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Recovery queue (must be before /:id) ──────────────────────────────────────
leadRoutes.get('/recovery', requireAuth, async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT l.id, l.state, l.recovery_reason, l.escalation_count, l.created_at,
                c.name AS contact_name, c.phone_e164
         FROM lead l
         JOIN contact c ON c.id = l.contact_id
         WHERE l.workspace_id = $1 AND l.state = 'recovery'
         ORDER BY l.created_at DESC`,
        [r.workspaceId],
      );
      res.json({ leads: rows, total: rows.length });
    });
  } catch (err) {
    next(err);
  }
});

// ── Get lead ──────────────────────────────────────────────────────────────────
leadRoutes.get('/:id', requireAuth, async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT l.*, c.name AS contact_name, c.phone_e164, c.email AS contact_email
         FROM lead l
         JOIN contact c ON c.id = l.contact_id
         WHERE l.id = $1 AND l.workspace_id = $2`,
        [req.params['id'], r.workspaceId],
      );
      if (!rows[0]) return next(new AppError(404, 'not_found', 'Lead not found'));
      res.json(rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

// ── List leads ────────────────────────────────────────────────────────────────
leadRoutes.get('/', requireAuth, async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT l.id, l.state, l.escalation_count, l.escalation_level,
                l.owner_id, l.created_at, l.ack_deadline,
                c.name AS contact_name, c.phone_e164
         FROM lead l
         JOIN contact c ON c.id = l.contact_id
         WHERE l.workspace_id = $1
         ORDER BY l.created_at DESC LIMIT 100`,
        [r.workspaceId],
      );
      res.json({ leads: rows, total: rows.length });
    });
  } catch (err) {
    next(err);
  }
});

// ── Acknowledge lead ──────────────────────────────────────────────────────────
leadRoutes.post('/:id/ack', requireAuth, async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { acknowledge } = await import('../../domain/acknowledge');
      await acknowledge(client, r.workspaceId, req.params['id'] as string, r.userId);
      res.json({ ok: true });
    });
  } catch (err) {
    next(err);
  }
});

// ── Create lead (manual) ──────────────────────────────────────────────────────
const createLeadSchema = z.object({
  contactId: z.string(),
  opportunityId: z.string().optional(),
  source: z.enum(['manual', 'whatsapp', 'form']).default('manual'),
});

leadRoutes.post('/', requireAuth, async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = createLeadSchema.strict().parse(req.body);
    await withTenant(r.workspaceId, async (client) => {
      const leadId = `lead_${randomUUID().slice(0, 12)}`;
      const lead = await assignLead(client, r.workspaceId, leadId, body.contactId, body.opportunityId, body.source);
      hub.emit(r.workspaceId, 'lead.assigned', { leadId, ownerId: lead.owner_id });
      res.status(201).json(lead);
    });
  } catch (err) {
    next(err);
  }
});



function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) return `+${digits}`;
  return digits;
}
