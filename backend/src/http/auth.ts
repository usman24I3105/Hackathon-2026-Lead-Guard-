import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errors';
import { writeSecurityEvent } from '../security/security-events';
import { appPool } from '../db/pool';
import { config } from '../config';

export type AuthRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> = Request<P, ResBody, ReqBody, ReqQuery> & {
  requestId: string;
  userId: string;
  workspaceId: string;
  sessionId: string;
  reauthAt: Date | null;
};

/**
 * Require an authenticated session. Attaches userId/workspaceId/sessionId to the request.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const r = req as AuthRequest;
  if (!r.userId) {
    return next(new AppError(401, 'unauthorized', 'Authentication required'));
  }
  next();
}

/**
 * Require a specific permission flag on the authenticated user.
 * Owner bypasses all permission checks.
 * Admin bypasses all except actions explicitly restricted to Owner.
 */
export function requirePermission(flag: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const r = req as AuthRequest;
    if (!r.userId) {
      return next(new AppError(401, 'unauthorized', 'Authentication required'));
    }

    try {
      const { rows } = await appPool.query<{ role: string; permissions: string[] }>(
        `SELECT role, permissions FROM "user" WHERE id = $1 AND workspace_id = $2`,
        [r.userId, r.workspaceId],
      );
      const user = rows[0];
      if (!user) {
        return next(new AppError(401, 'unauthorized', 'User not found'));
      }

      if (user.role === 'owner') return next(); // Owner passes all
      if (user.permissions.includes(flag)) return next();

      writeSecurityEvent({
        type: 'forbidden',
        req,
        userId: r.userId,
        workspaceId: r.workspaceId,
        details: { requiredPermission: flag },
      }).catch(() => {});

      return next(new AppError(403, 'forbidden', 'Insufficient permissions'));
    } catch (err) {
      next(err);
    }
  };
}

/**
 * SEC-10: Step-up reauth for sensitive actions.
 * Changing permissions, roles, or integrations requires a reauth within REAUTH_WINDOW_MINUTES.
 */
export function requireReauth(req: Request, _res: Response, next: NextFunction): void {
  const r = req as AuthRequest;
  if (!r.userId) {
    return next(new AppError(401, 'unauthorized', 'Authentication required'));
  }
  if (!r.reauthAt) {
    return next(new AppError(401, 'reauth_required', 'Step-up authentication required'));
  }
  const windowMs = (config.REAUTH_WINDOW_MINUTES ?? 10) * 60 * 1000;
  if (Date.now() - new Date(r.reauthAt).getTime() > windowMs) {
    return next(new AppError(401, 'reauth_required', 'Re-authentication expired'));
  }
  next();
}

