import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../auth';
import { AppError } from '../errors';
import { checkSseCap } from '../../security/limits';
import { hub } from '../../realtime/hub';

export const streamRoutes = Router();

streamRoutes.get('/', requireAuth, (req, res, next) => {
  const r = req as AuthRequest;

  if (!checkSseCap(r.userId, r.workspaceId)) {
    return next(new AppError(429, 'rate_limited', 'SSE connection limit reached'));
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  hub.add({ workspaceId: r.workspaceId, userId: r.userId, res });

  // Keep-alive handled by hub heartbeat
});
