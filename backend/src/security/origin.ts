import type { Request, Response, NextFunction } from 'express';
import { allowedOrigins } from '../config';
import { writeSecurityEvent } from './security-events';
import { AppError } from '../http/errors';

/**
 * SEC-1: Origin / Referer check on mutating routes.
 * Webhook routes are exempt (signature-gated separately).
 */
export function originCheck(req: Request, _res: Response, next: NextFunction): void {
  // Only check mutating methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const origin = req.headers['origin'] ?? extractOriginFromReferer(req.headers['referer']);
  if (!origin) {
    writeSecurityEvent({
      type: 'origin_rejected',
      req,
      details: { reason: 'missing_origin' },
    }).catch(() => {});
    return next(new AppError(403, 'forbidden', 'Missing Origin header'));
  }

  const normalised = origin.replace(/\/$/, '');
  if (!allowedOrigins.includes(normalised)) {
    writeSecurityEvent({
      type: 'origin_rejected',
      req,
      details: { origin, allowed: allowedOrigins },
    }).catch(() => {});
    return next(new AppError(403, 'forbidden', 'Origin not allowed'));
  }

  next();
}

function extractOriginFromReferer(referer?: string): string | undefined {
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * SEC-1: CSRF custom-header check (second layer after Origin check).
 * Requires X-CSRF-Token: 1 on all mutating authenticated requests.
 */
export function csrfCheck(req: Request, _res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }
  if (!req.headers['x-csrf-token']) {
    return next(new AppError(403, 'forbidden', 'Missing CSRF header'));
  }
  next();
}
