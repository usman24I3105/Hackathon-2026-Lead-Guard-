import { AppError } from '../http/errors';

// Per (email, ip) and per-email failure tracking (in-memory for single process)
// Map key: `email:ip` or `email`  → { count, lockedUntil }
type Attempt = { count: number; lockedUntil: Date | null };

const failureMap = new Map<string, Attempt>();

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 15 * 60 * 1000; // 15 minutes

function getDelay(count: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, count - 1), MAX_DELAY_MS);
}

/**
 * Check if a login attempt is currently locked out.
 * Throws 429 if locked; call BEFORE verifying password.
 */
export function checkLockout(email: string, ip: string): void {
  const now = new Date();
  for (const key of [`${email}:${ip}`, email]) {
    const attempt = failureMap.get(key);
    if (attempt?.lockedUntil && attempt.lockedUntil > now) {
      const retryAfter = Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 1000);
      throw new AppError(429, 'rate_limited', 'Too many failed login attempts', { retryAfter });
    }
  }
}

/**
 * Record a failed login attempt and update backoff.
 */
export function recordFailure(email: string, ip: string): void {
  const now = new Date();
  for (const key of [`${email}:${ip}`, email]) {
    const attempt = failureMap.get(key) ?? { count: 0, lockedUntil: null };
    attempt.count += 1;
    const delay = getDelay(attempt.count);
    attempt.lockedUntil = new Date(now.getTime() + delay);
    failureMap.set(key, attempt);
  }
}

/**
 * Clear lockout on successful login.
 */
export function clearLockout(email: string, ip: string): void {
  failureMap.delete(`${email}:${ip}`);
  failureMap.delete(email);
}

// Periodic cleanup of expired entries (every 5 minutes)
setInterval(() => {
  const now = new Date();
  for (const [key, attempt] of failureMap.entries()) {
    if (attempt.lockedUntil && attempt.lockedUntil < now) {
      failureMap.delete(key);
    }
  }
}, 5 * 60 * 1000);
