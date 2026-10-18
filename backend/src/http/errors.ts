import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from './logger';

/**
 * Standard error shape matching API-CONTRACT.md:
 * { error: { code, message, requestId, details? } }
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, 'Application error');
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details && { details: err.details }),
      },
    });
    return;
  }

  // Postgres errors
  const pgError = err as { code?: string; constraint?: string };
  if (pgError?.code === '23505') {
    res.status(409).json({
      error: { code: 'conflict', message: 'Resource already exists', requestId },
    });
    return;
  }
  if (pgError?.code === 'P0001') {
    // Raised by our triggers (audit mutation / truncate)
    res.status(403).json({
      error: { code: 'forbidden', message: (err as Error).message, requestId },
    });
    return;
  }

  // Body parser errors (payload too large)
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'payload_too_large', message: 'Request body too large', requestId },
    });
    return;
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid request payload',
        requestId,
        details: { issues: err.issues },
      },
    });
    return;
  }

  // Unknown errors — never leak stack traces
  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'internal_error', message: 'An unexpected error occurred', requestId },
  });
}
