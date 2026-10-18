import crypto from 'crypto';
import type { Request, Response } from 'express';
import { workerPool } from '../db/pool';
import { config } from '../config';

export type SessionUser = {
  sessionId: string;
  userId: string;
  workspaceId: string;
  reauthAt: Date | null;
};

/**
 * Generate a new session token (32 random bytes, hex).
 * Stored as SHA-256 hash in DB; raw token sent to browser.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a session row and set the __Host-sid cookie.
 */
export async function createSession(
  res: Response,
  userId: string,
  workspaceId: string,
): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.SESSION_ABSOLUTE_DAYS * 86400 * 1000);
  const lastActiveAt = now;

  await workerPool.query(
    `INSERT INTO session (id, user_id, workspace_id, token_hash, expires_at, last_active_at, created_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $5)`,
    [userId, workspaceId, tokenHash, expiresAt, lastActiveAt],
  );

  setSessionCookie(res, token, expiresAt);
  return token;
}

/**
 * Look up a session by raw token. Updates last_active_at.
 * Returns null if not found, expired, or idle-timed-out.
 */
export async function getSession(req: Request): Promise<SessionUser | null> {
  const token = req.cookies?.[config.COOKIE_NAME];
  if (!token || typeof token !== 'string') return null;

  const tokenHash = hashToken(token);
  const now = new Date();
  const idleCutoff = new Date(now.getTime() - config.SESSION_IDLE_MINUTES * 60 * 1000);

  const { rows } = await workerPool.query<{
    id: string;
    user_id: string;
    workspace_id: string;
    reauth_at: Date | null;
    expires_at: Date;
    last_active_at: Date;
  }>(
    `SELECT id, user_id, workspace_id, reauth_at, expires_at, last_active_at
     FROM session
     WHERE token_hash = $1 AND expires_at > $2 AND last_active_at > $3`,
    [tokenHash, now, idleCutoff],
  );

  if (!rows[0]) return null;
  const row = rows[0];

  // Update last_active_at
  await workerPool.query(`UPDATE session SET last_active_at = $1 WHERE id = $2`, [now, row.id]);

  return {
    sessionId: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    reauthAt: row.reauth_at,
  };
}

/**
 * Rotate session ID (on login, password/role change, step-up).
 */
export async function rotateSession(
  res: Response,
  oldSessionId: string,
  userId: string,
  workspaceId: string,
): Promise<void> {
  await workerPool.query(`DELETE FROM session WHERE id = $1`, [oldSessionId]);
  await createSession(res, userId, workspaceId);
}

/**
 * Delete a single session (logout).
 */
export async function deleteSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[config.COOKIE_NAME];
  if (token) {
    const tokenHash = hashToken(token);
    await workerPool.query(`DELETE FROM session WHERE token_hash = $1`, [tokenHash]);
  }
  clearSessionCookie(res);
}

/**
 * Delete all sessions for a user (e.g. permission change, password reset).
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  await workerPool.query(`DELETE FROM session WHERE user_id = $1`, [userId]);
}

/**
 * Record reauth timestamp on the current session.
 */
export async function recordReauth(sessionId: string): Promise<void> {
  await workerPool.query(`UPDATE session SET reauth_at = NOW() WHERE id = $1`, [sessionId]);
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(config.COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,          // browsers accept Secure on http://localhost
    sameSite: 'lax',       // lax so Google OAuth redirect carries the cookie
    path: '/',
    expires: expiresAt,
    // No Domain — required for __Host- prefix
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(config.COOKIE_NAME, { path: '/', httpOnly: true, secure: true });
}
