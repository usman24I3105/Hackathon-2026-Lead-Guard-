import express from 'express';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import cors from 'cors';
import { config, corsOrigins } from '../config';
import { helmetMiddleware } from '../security/headers';
import { originCheck, csrfCheck } from '../security/origin';
import { globalRateLimit, userRateLimit } from '../security/limits';
import { errorHandler, AppError } from './errors';
import { getSession } from '../security/sessions';
import { authRoutes } from './routes/auth';
import { teamRoutes } from './routes/team';
import { leadRoutes } from './routes/leads';
import { crmRoutes } from './routes/crm';
import { dashboardRoutes } from './routes/dashboard';
import { auditRoutes } from './routes/audit';
import { integrationsRoutes } from './routes/integrations';
import { messagingRoutes } from './routes/messaging';
import { paymentRoutes } from './routes/payments';
import { calendarRoutes } from './routes/calendar';
import { publicRoutes } from './routes/public';
import { streamRoutes } from './routes/stream';
import { twilioWebhook } from './webhooks/twilio';
import { stripeWebhook } from './webhooks/stripe';
import path from 'path';

export function buildApp(): express.Application {
  const app = express();

  // ── Trust proxy ──────────────────────────────────────────────────────────────
  app.set('trust proxy', config.TRUST_PROXY);

  // ── 1. requestId + X-Server-Time ─────────────────────────────────────────────
  app.use((req, res, next) => {
    const id = randomUUID();
    (req as express.Request & { requestId: string }).requestId = id;
    res.setHeader('X-Request-Id', id);
    res.setHeader('X-Server-Time', new Date().toISOString());
    next();
  });

  // ── 2. helmet + CSP ──────────────────────────────────────────────────────────
  app.use(helmetMiddleware);

  // ── 3. CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new AppError(403, 'forbidden', 'Origin not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );

  // ── 4. Raw body for webhooks (must come before json parser) ──────────────────
  app.use('/webhooks', express.raw({ type: '*/*', limit: '128kb' }));

  // ── 5. JSON body parser ──────────────────────────────────────────────────────
  app.use(
    express.json({ limit: `${config.BODY_LIMIT_KB}kb` }),
  );

  // ── 6. Cookie parser ─────────────────────────────────────────────────────────
  app.use(cookieParser());

  // ── 7. Global rate limit ─────────────────────────────────────────────────────
  app.use(globalRateLimit);

  // ── 8. Session middleware (attach user to request) ────────────────────────────
  app.use(async (req, _res, next) => {
    try {
      const session = await getSession(req);
      if (session) {
        (req as express.Request & { userId: string; workspaceId: string; sessionId: string; reauthAt: Date | null }).userId = session.userId;
        (req as express.Request & { userId: string; workspaceId: string; sessionId: string; reauthAt: Date | null }).workspaceId = session.workspaceId;
        (req as express.Request & { userId: string; workspaceId: string; sessionId: string; reauthAt: Date | null }).sessionId = session.sessionId;
        (req as express.Request & { userId: string; workspaceId: string; sessionId: string; reauthAt: Date | null }).reauthAt = session.reauthAt;
      }
    } catch {
      // Session errors are non-fatal — treat as unauthenticated
    }
    next();
  });

  // ── 9. Per-user rate limit ────────────────────────────────────────────────────
  app.use(userRateLimit);

  // ── 10. Origin + CSRF check (authenticated mutating routes only) ──────────────
  // Webhook routes are exempt (handled in their own middleware)
  app.use(/^(?!\/webhooks)/, originCheck);
  app.use(/^(?!\/webhooks)/, csrfCheck);

  // ── Health check (no auth required) ──────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // ── Webhooks (signature-gated, no session/CSRF) ───────────────────────────────
  app.use('/webhooks/twilio', twilioWebhook);
  app.use('/webhooks/stripe', stripeWebhook);

  // ── API routes ────────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/integrations', integrationsRoutes);
  app.use('/api/messaging', messagingRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/stream', streamRoutes);
  app.get('/api/me', (req, res, next) => {
    req.url = '/me';
    authRoutes(req, res, next);
  });

  // ── Serve built React app ─────────────────────────────────────────────────────
  const publicDir = path.join(__dirname, '../../public');
  const indexHtml = path.join(publicDir, 'index.html');
  app.use(express.static(publicDir));
  app.get('*', (_req, res, next) => {
    if (fs.existsSync(indexHtml)) {
      res.sendFile(indexHtml);
    } else {
      next();
    }
  });

  // ── Error handler (must be last) ──────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
