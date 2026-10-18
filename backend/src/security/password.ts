import argon2 from 'argon2';
import { AppError } from '../http/errors';

// OWASP-minimum argon2id parameters (Password Storage Cheat Sheet 2024)
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,  // 19 MiB
  timeCost: 2,
  parallelism: 1,
  raw: false as const,
};

const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

// Short list of very common passwords
const COMMON_PASSWORDS = new Set([
  'password', '123456789', '1234567890', 'qwertyuiop', 'iloveyou',
  'sunshine', 'letmein!!', 'password1', 'password12', 'password123',
]);

/**
 * Hash a password using argon2id with OWASP parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against its stored hash.
 * Returns true on match. Returns false (never throws) on mismatch.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Returns true if the stored hash should be rehashed (parameters changed).
 */
export async function needsRehash(hash: string): Promise<boolean> {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

/**
 * Validate password policy. Throws AppError on violation.
 */
export function validatePasswordPolicy(password: string, emailLocalPart?: string): void {
  if (password.length < MIN_LENGTH) {
    throw new AppError(400, 'validation_error', `Password must be at least ${MIN_LENGTH} characters`);
  }
  if (password.length > MAX_LENGTH) {
    throw new AppError(400, 'validation_error', `Password must be at most ${MAX_LENGTH} characters`);
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new AppError(400, 'validation_error', 'Password is too common');
  }
  if (emailLocalPart && password.toLowerCase().includes(emailLocalPart.toLowerCase())) {
    throw new AppError(400, 'validation_error', 'Password must not contain your email address');
  }
}
