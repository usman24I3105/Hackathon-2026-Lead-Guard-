import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { withTenant } from '../../db/tenant';
import { appPool } from '../../db/pool';
import { AppError } from '../errors';
import { requireAuth, requirePermission, type AuthRequest } from '../auth';
import { writeSecurityEvent } from '../../security/security-events';
import { deleteAllUserSessions } from '../../security/sessions';
import { hashToken, generateSessionToken } from '../../security/sessions';

export const teamRoutes = Router();

teamRoutes.use(requireAuth);

// ── List team members ─────────────────────────────────────────────────────────
teamRoutes.get('/', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, email, name, role, permissions, status, in_rotation, max_open_leads,
                telegram_chat_id, backup_user_id, manager_user_id, created_at
         FROM "user" WHERE workspace_id = $1 ORDER BY name`,
        [r.workspaceId],
      );
      res.json({ members: rows });
    });
  } catch (err) {
    next(err);
  }
});

// ── Invite member ─────────────────────────────────────────────────────────────
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['user', 'admin', 'owner']).default('user'),
  permissions: z.array(z.string()).default([]),
});

teamRoutes.post('/invite', requirePermission('team.manage'), async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = inviteSchema.strict().parse(req.body);

    await withTenant(r.workspaceId, async (client) => {
      // Privilege check: caller can only grant permissions they hold
      const { rows: callerRows } = await client.query<{ role: string; permissions: string[] }>(
        `SELECT role, permissions FROM "user" WHERE id = $1 AND workspace_id = $2`,
        [r.userId, r.workspaceId],
      );
      const caller = callerRows[0];
      if (!caller) throw new AppError(404, 'not_found', 'Caller not found');

      // Admin cannot create Owner
      if (body.role === 'owner' && caller.role !== 'owner') {
        throw new AppError(403, 'forbidden', 'Only an Owner can create another Owner');
      }

      // Cannot grant permissions you don't hold (Owner has all)
      if (caller.role !== 'owner') {
        for (const p of body.permissions) {
          if (!caller.permissions.includes(p)) {
            throw new AppError(403, 'forbidden', `Cannot grant permission: ${p}`);
          }
        }
      }

      const token = generateSessionToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO invite (id, workspace_id, email, role, permissions, token_hash, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `inv_${randomUUID().slice(0, 12)}`,
          r.workspaceId,
          body.email,
          body.role,
          JSON.stringify(body.permissions),
          tokenHash,
          expiresAt,
          r.userId,
        ],
      );

      res.status(201).json({ inviteToken: token, expiresAt });
    });
  } catch (err) {
    next(err);
  }
});

// ── Accept invite ─────────────────────────────────────────────────────────────
const acceptInviteSchema = z.object({
  token: z.string(),
  name: z.string().min(1).max(100),
  password: z.string(),
});

teamRoutes.post('/accept-invite', async (req, res, next) => {
  try {
    const { token, name, password } = acceptInviteSchema.strict().parse(req.body);
    const { validatePasswordPolicy } = await import('../../security/password');
    const { hashPassword } = await import('../../security/password');

    const tokenHash = hashToken(token);
    const now = new Date();

    const { rows } = await appPool.query<{
      id: string;
      workspace_id: string;
      email: string;
      role: string;
      permissions: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT id, workspace_id, email, role, permissions, expires_at, used_at
       FROM invite WHERE token_hash = $1`,
      [tokenHash],
    );

    const invite = rows[0];
    if (!invite || invite.used_at || invite.expires_at < now) {
      return next(new AppError(404, 'not_found', 'Invite not found or expired'));
    }

    validatePasswordPolicy(password, invite.email.split('@')[0]);
    const passwordHash = await hashPassword(password);
    const userId = `u_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    await withTenant(invite.workspace_id, async (client) => {
      await client.query(
        `INSERT INTO "user" (id, workspace_id, email, password_hash, name, role, permissions)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, invite.workspace_id, invite.email, passwordHash, name, invite.role, invite.permissions],
      );
      await client.query(
        `UPDATE invite SET used_at = $1 WHERE id = $2`,
        [now, invite.id],
      );
    });

    res.status(201).json({ userId, workspaceId: invite.workspace_id });
  } catch (err) {
    next(err);
  }
});

// ── Get member ────────────────────────────────────────────────────────────────
teamRoutes.get('/:id', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, email, name, role, permissions, status, in_rotation, max_open_leads,
                telegram_chat_id, backup_user_id, manager_user_id
         FROM "user" WHERE id = $1 AND workspace_id = $2`,
        [req.params['id'], r.workspaceId],
      );
      if (!rows[0]) return next(new AppError(404, 'not_found', 'Member not found'));
      res.json(rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

// ── Update member permissions ─────────────────────────────────────────────────
const updatePermissionsSchema = z.object({
  permissions: z.array(z.string()),
  role: z.enum(['user', 'admin', 'owner']).optional(),
});

teamRoutes.put('/:id/permissions', requirePermission('team.manage'), async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = updatePermissionsSchema.strict().parse(req.body);

    await withTenant(r.workspaceId, async (client) => {
      const [callerRes, targetRes] = await Promise.all([
        client.query<{ role: string; permissions: string[] }>(
          `SELECT role, permissions FROM "user" WHERE id = $1 AND workspace_id = $2`,
          [r.userId, r.workspaceId],
        ),
        client.query<{ role: string }>(
          `SELECT role FROM "user" WHERE id = $1 AND workspace_id = $2`,
          [req.params['id'], r.workspaceId],
        ),
      ]);

      const caller = callerRes.rows[0];
      const target = targetRes.rows[0];
      if (!caller || !target) throw new AppError(404, 'not_found', 'User not found');

      // Admin cannot promote to Owner
      if (body.role === 'owner' && caller.role !== 'owner') {
        throw new AppError(403, 'forbidden', 'Only an Owner can create another Owner');
      }

      // Cannot grant permissions you don't hold
      if (caller.role !== 'owner') {
        for (const p of body.permissions) {
          if (!caller.permissions.includes(p)) {
            throw new AppError(403, 'forbidden', `Cannot grant permission: ${p}`);
          }
        }
      }

      // Cannot edit your own permissions upward
      if (req.params['id'] === r.userId) {
        throw new AppError(403, 'forbidden', 'Cannot edit your own permissions');
      }

      await client.query(
        `UPDATE "user" SET permissions = $1${body.role ? ', role = $3' : ''} WHERE id = $2 AND workspace_id = $4`,
        body.role
          ? [JSON.stringify(body.permissions), req.params['id'], body.role, r.workspaceId]
          : [JSON.stringify(body.permissions), req.params['id'], r.workspaceId],
      );

      // Rotate sessions of affected user
      await deleteAllUserSessions(req.params['id'] as string);

      res.json({ ok: true });
    });
  } catch (err) {
    next(err);
  }
});

// ── Update member status ──────────────────────────────────────────────────────
const updateStatusSchema = z.object({
  status: z.enum(['available', 'busy', 'on_leave']),
});

teamRoutes.put('/:id/status', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  try {
    const body = updateStatusSchema.strict().parse(req.body);
    const targetId = req.params['id'];

    await withTenant(r.workspaceId, async (client) => {
      // Can only change own status or requires team.manage
      if (targetId !== r.userId) {
        const { rows } = await client.query<{ permissions: string[]; role: string }>(
          `SELECT permissions, role FROM "user" WHERE id = $1 AND workspace_id = $2`,
          [r.userId, r.workspaceId],
        );
        const u = rows[0];
        if (!u || (u.role !== 'owner' && !u.permissions.includes('team.manage'))) {
          writeSecurityEvent({ type: 'forbidden', req, userId: r.userId, workspaceId: r.workspaceId }).catch(() => {});
          throw new AppError(403, 'forbidden', 'Cannot change another member\'s status');
        }
      }

      const { rows } = await client.query(
        `SELECT id FROM "user" WHERE id = $1 AND workspace_id = $2`,
        [targetId, r.workspaceId],
      );
      if (!rows[0]) throw new AppError(404, 'not_found', 'Member not found');

      await client.query(
        `UPDATE "user" SET status = $1, ${body.status === 'available' ? 'held_reason = NULL,' : ''} updated_at = NOW()
         WHERE id = $2 AND workspace_id = $3`,
        [body.status, targetId, r.workspaceId],
      );

      // If going on_leave, trigger absence reassignment (BE-7)
      if (body.status === 'on_leave') {
        const { handleAbsence } = await import('../../domain/absence');
        await handleAbsence(client, r.workspaceId, targetId, req);
      }

      res.json({ ok: true, status: body.status });
    });
  } catch (err) {
    next(err);
  }
});
