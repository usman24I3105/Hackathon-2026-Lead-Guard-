import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { appPool, workerPool } from '../../db/pool';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { requireAuth, type AuthRequest } from '../auth';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordPolicy,
} from '../../security/password';
import { createSession, deleteSession } from '../../security/sessions';
import { checkLockout, recordFailure, clearLockout } from '../../security/lockout';
import { writeSecurityEvent } from '../../security/security-events';
import { loginRateLimit } from '../../security/limits';

export const authRoutes = Router();

// ── Signup ────────────────────────────────────────────────────────────────────
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  name: z.string().min(1).max(100),
  workspaceName: z.string().min(2).max(80),
});

authRoutes.post('/signup', async (req, res, next) => {
  try {
    const body = signupSchema.strict().parse(req.body);
    const { email, password, name, workspaceName } = body;

    validatePasswordPolicy(password, email.split('@')[0]);

    const passwordHash = await hashPassword(password);
    const workspaceId = `ws_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const userId = `u_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    // Check email uniqueness across all workspaces (BYPASSRLS)
    const { rows: existing } = await workerPool.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [email],
    );
    if (existing.length > 0) {
      return next(new AppError(409, 'email_taken', 'Email already in use'));
    }

    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.workspace_id', workspaceId]);

      const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
        + '-' + randomUUID().slice(0, 6);

      await client.query(
        `INSERT INTO workspace (id, name, slug) VALUES ($1, $2, $3)`,
        [workspaceId, workspaceName, slug],
      );

      // Create default pipeline
      const pipelineId = `pip_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO pipeline (id, workspace_id, name, position) VALUES ($1, $2, $3, 0)`,
        [pipelineId, workspaceId, 'Default Pipeline'],
      );

      // Create default stages
      const stages = ['New', 'Contacted', 'Proposal', 'Won', 'Lost'];
      for (let i = 0; i < stages.length; i++) {
        await client.query(
          `INSERT INTO stage (id, workspace_id, pipeline_id, name, position) VALUES ($1, $2, $3, $4, $5)`,
          [`stg_${randomUUID().slice(0, 12)}`, workspaceId, pipelineId, stages[i], i],
        );
      }

      // Create owner user
      await client.query(
        `INSERT INTO "user" (id, workspace_id, email, password_hash, name, role, permissions, status, in_rotation)
         VALUES ($1, $2, $3, $4, $5, 'owner', '[]', 'available', true)`,
        [userId, workspaceId, email, passwordHash, name],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await createSession(res, userId, workspaceId);

    writeSecurityEvent({ type: 'login_ok', req, userId, workspaceId }).catch(() => {});

    res.status(201).json({ userId, workspaceId });
  } catch (err) {
    next(err);
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRoutes.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const body = loginSchema.strict().parse(req.body);
    const { email, password } = body;
    const ip = req.ip ?? 'unknown';

    checkLockout(email, ip);

    // SECURITY DEFINER lookup — pre-tenant (session/user by email before workspace is known)
    const { rows } = await workerPool.query<{
      id: string;
      workspace_id: string;
      password_hash: string;
      role: string;
      permissions: string[];
      name: string;
      email: string;
    }>(
      `SELECT id, workspace_id, password_hash, role, permissions, name, email
       FROM "user" WHERE email = $1`,
      [email],
    );

    // Same message for unknown email and wrong password (constant-time path)
    const user = rows[0];
    const hashToCompare = user?.password_hash ?? '$argon2id$v=19$m=19456,t=2,p=1$fakehashtopreventtiming';
    const match = await verifyPassword(hashToCompare, password);

    if (!user || !match) {
      recordFailure(email, ip);
      writeSecurityEvent({ type: 'login_failed', req, details: { email } }).catch(() => {});
      return next(new AppError(401, 'invalid_credentials', 'Invalid email or password'));
    }

    clearLockout(email, ip);

    // Rehash if parameters changed
    if (await needsRehash(user.password_hash)) {
      const newHash = await hashPassword(password);
      await workerPool.query(`UPDATE "user" SET password_hash = $1 WHERE id = $2`, [newHash, user.id]);
    }

    // Rotate session on login
    await createSession(res, user.id, user.workspace_id);

    writeSecurityEvent({ type: 'login_ok', req, userId: user.id, workspaceId: user.workspace_id }).catch(() => {});

    res.json({
      userId: user.id,
      workspaceId: user.workspace_id,
      name: user.name,
      role: user.role,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: user.workspace_id,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Me ────────────────────────────────────────────────────────────────────────
authRoutes.get('/me', requireAuth, async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, email, name, role, permissions, status, in_rotation, telegram_chat_id
         FROM "user" WHERE id = $1 AND workspace_id = $2`,
        [r.userId, r.workspaceId],
      );
      if (!rows[0]) return next(new AppError(404, 'not_found', 'User not found'));
      res.json(rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
authRoutes.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await deleteSession(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Reauth (SEC-10 Should) ────────────────────────────────────────────────────
const reauthSchema = z.object({ password: z.string() });

authRoutes.post('/reauth', requireAuth, async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const { password } = reauthSchema.strict().parse(req.body);
    const { rows } = await appPool.query<{ password_hash: string }>(
      `SELECT password_hash FROM "user" WHERE id = $1`,
      [r.userId],
    );
    if (!rows[0] || !(await verifyPassword(rows[0].password_hash, password))) {
      return next(new AppError(401, 'invalid_credentials', 'Invalid password'));
    }
    const { recordReauth } = await import('../../security/sessions');
    await recordReauth(r.sessionId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
