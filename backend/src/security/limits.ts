import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AppError } from '../http/errors';

/**
 * SEC-1: Global per-IP rate limit
 */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_GLOBAL_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, 'rate_limited', 'Too many requests'));
  },
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * SEC-1: Per-authenticated-user rate limit
 */
export const userRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_USER_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, 'rate_limited', 'Too many requests'));
  },
  keyGenerator: (req) => (req as Request & { userId?: string }).userId ?? req.ip ?? 'unknown',
  skip: (req) => !(req as Request & { userId?: string }).userId,
});

/**
 * SEC-1: Stricter login rate limit
 */
export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, 'rate_limited', 'Too many login attempts'));
  },
});

/**
 * SEC-1: Public form rate limit per IP
 */
export const publicFormRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, 'rate_limited', 'Form submission limit reached'));
  },
});

/**
 * SEC-1: Webhook failure throttle
 */
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, 'rate_limited', 'Webhook rate limit exceeded'));
  },
});

// ── Body size middleware ──────────────────────────────────────────────────────

/**
 * SEC-1: Enforce BODY_LIMIT_KB on JSON bodies.
 * Express's built-in `limit` option handles this when body-parser / express.json is configured.
 * We additionally check Content-Length early for webhooks.
 */
export function webhookSizeLimit(req: Request, _res: Response, next: NextFunction): void {
  const maxBytes = 128 * 1024; // 128 kB for webhook raw bodies
  const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
  if (contentLength > maxBytes) {
    next(new AppError(413, 'payload_too_large', 'Request body too large'));
    return;
  }
  next();
}

// ── SSE connection tracking ───────────────────────────────────────────────────

const sseByUser = new Map<string, number>();
const sseByWorkspace = new Map<string, number>();

export function trackSseOpen(userId: string, workspaceId: string): void {
  sseByUser.set(userId, (sseByUser.get(userId) ?? 0) + 1);
  sseByWorkspace.set(workspaceId, (sseByWorkspace.get(workspaceId) ?? 0) + 1);
}

export function trackSseClose(userId: string, workspaceId: string): void {
  const u = (sseByUser.get(userId) ?? 1) - 1;
  if (u <= 0) sseByUser.delete(userId);
  else sseByUser.set(userId, u);
  const w = (sseByWorkspace.get(workspaceId) ?? 1) - 1;
  if (w <= 0) sseByWorkspace.delete(workspaceId);
  else sseByWorkspace.set(workspaceId, w);
}

export function checkSseCap(userId: string, workspaceId: string): boolean {
  if ((sseByUser.get(userId) ?? 0) >= config.SSE_MAX_PER_USER) return false;
  if ((sseByWorkspace.get(workspaceId) ?? 0) >= config.SSE_MAX_PER_WORKSPACE) return false;
  return true;
}
