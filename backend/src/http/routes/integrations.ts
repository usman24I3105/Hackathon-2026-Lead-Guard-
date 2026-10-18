import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireAuth, requirePermission, type AuthRequest } from '../auth';
import { AppError } from '../errors';
import { withTenant } from '../../db/tenant';
import { writeAudit } from '../../domain/audit';
import { encrypt, decrypt } from '../../integrations/crypto';
import { generateSessionToken, hashToken } from '../../security/sessions';
import { hub } from '../../realtime/hub';

export const integrationsRoutes = Router();
integrationsRoutes.use(requireAuth);

const PROVIDERS = ['twilio', 'stripe', 'telegram', 'google', 'slack'] as const;
type Provider = (typeof PROVIDERS)[number];

// ── List integrations ─────────────────────────────────────────────────────────
integrationsRoutes.get('/', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const { config } = await import('../../config');
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query<{
        provider: string;
        last_ok_at: Date | null;
        last_error: string | null;
        updated_at: Date;
        status: string;
      }>(
        `SELECT provider, last_ok_at, last_error, updated_at,
                CASE WHEN encrypted_config IS NOT NULL THEN 'configured' ELSE 'not_configured' END AS status
         FROM integration_config WHERE workspace_id = $1`,
        [r.workspaceId],
      );

      const map = new Map<string, any>(rows.map(row => [row.provider, row]));

      // Merge environment configurations
      const result = PROVIDERS.map((p) => {
        const existing = map.get(p);
        let envConfigured = false;
        let maskedSecret: string | undefined;

        if (p === 'twilio' && config.TWILIO_ACCOUNT_SID) {
          envConfigured = true;
          maskedSecret = `...${config.TWILIO_ACCOUNT_SID.slice(-4)}`;
        } else if (p === 'stripe' && config.STRIPE_SECRET_KEY) {
          envConfigured = true;
          maskedSecret = `...${config.STRIPE_SECRET_KEY.slice(-4)}`;
        } else if (p === 'slack' && config.SLACK_WEBHOOK_URL) {
          envConfigured = true;
          maskedSecret = `...${config.SLACK_WEBHOOK_URL.slice(-4)}`;
        } else if (p === 'google' && config.GOOGLE_CLIENT_ID) {
          envConfigured = true;
          maskedSecret = `...${config.GOOGLE_CLIENT_ID.slice(-4)}`;
        } else if (p === 'telegram' && config.TELEGRAM_BOT_TOKEN) {
          envConfigured = true;
          maskedSecret = `...${config.TELEGRAM_BOT_TOKEN.slice(-4)}`;
        }

        const isConfigured = existing?.status === 'configured' || envConfigured;
        return {
          provider: p,
          status: isConfigured ? 'configured' : 'not_configured',
          last_ok_at: existing?.last_ok_at ?? (envConfigured ? new Date() : null),
          last_error: existing?.last_error ?? null,
          updated_at: existing?.updated_at ?? new Date(),
          maskedSecret,
        };
      });

      res.json({ integrations: result });
    });
  } catch (err) { next(err); }
});

// ── POST /slack/test: Send demo/test Slack alert ─────────────────────────────
integrationsRoutes.post('/slack/test', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const { sendSlackAlert } = await import('../../integrations/slack');
    const ok = await sendSlackAlert({
      title: '🚨 Demo Alert — Lead Escalation',
      leadName: 'Alice Smith',
      leadPhone: '+1 (555) 123-4567',
      source: 'WHATSAPP',
      reason: 'Urgent buying intent: Requested pricing quote and callback ASAP',
      amount: '450.00',
      leadId: 'lead_dbefb99d-c35',
      workspaceId: r.workspaceId,
    });
    res.json({ ok, success: ok, message: 'Test alert dispatched to Slack channel' });
  } catch (err) { next(err); }
});

// ── GET /sync/history: Sync history endpoint ──────────────────────────────────
integrationsRoutes.get('/sync/history', async (req, res, next) => {
  try {
    const { getSyncHistory } = await import('../../integrations/sync-history');
    const limit = Number(req.query.limit) || 100;
    res.json({ success: true, history: getSyncHistory(limit) });
  } catch (err) { next(err); }
});

// ── Update integration config ─────────────────────────────────────────────────
const updateIntegrationSchema = z.object({
  config: z.record(z.string()),
});

integrationsRoutes.put('/:provider', requirePermission('integrations.manage'), async (req, res, next) => {
  const r = req as AuthRequest;
  const provider = req.params['provider'] as Provider;
  if (!PROVIDERS.includes(provider)) return next(new AppError(404, 'not_found', 'Unknown provider'));

  try {
    const body = updateIntegrationSchema.strict().parse(req.body);
    const encrypted = await encrypt(JSON.stringify(body.config), r.workspaceId, provider);

    // Generate a new hook token for webhook providers
    const hookToken = generateSessionToken();
    const hookTokenHash = hashToken(hookToken);

    await withTenant(r.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO integration_config (id, workspace_id, provider, encrypted_config, hook_token_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, provider)
         DO UPDATE SET encrypted_config = $4, hook_token_hash = $5, updated_at = NOW()`,
        [`ic_${randomUUID().slice(0, 12)}`, r.workspaceId, provider, encrypted, hookTokenHash],
      );

      await writeAudit(client, {
        workspaceId: r.workspaceId,
        userId: r.userId,
        type: 'integration.changed',
        entityType: 'integration',
        entityId: provider,
        actor: 'user',
        after: { provider, updated: true },
      });
    });

    hub.emit(r.workspaceId, 'config.changed', { type: 'integration', provider });
    res.json({ ok: true, hookToken });
  } catch (err) { next(err); }
});

// ── Integration event log ──────────────────────────────────────────────────────
integrationsRoutes.get('/:provider/events', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, event_type, status, created_at FROM integration_event
         WHERE workspace_id = $1 AND provider = $2
         ORDER BY created_at DESC LIMIT 50`,
        [r.workspaceId, req.params['provider']],
      );
      res.json({ events: rows });
    });
  } catch (err) { next(err); }
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
integrationsRoutes.get('/google/connect', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const { config } = await import('../../config');
    if (!config.GOOGLE_CLIENT_ID) return next(new AppError(503, 'not_configured', 'Google not configured'));

    const state = Buffer.from(JSON.stringify({ sessionId: r.sessionId, ts: Date.now() })).toString('base64url');
    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: config.GOOGLE_REDIRECT_URI ?? '',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar',
      access_type: 'offline',
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } catch (err) { next(err); }
});

integrationsRoutes.get('/google/callback', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const { code } = req.query as { code?: string };
    if (!code) return next(new AppError(400, 'validation_error', 'Missing code'));

    const { config } = await import('../../config');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID ?? '',
        client_secret: config.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: config.GOOGLE_REDIRECT_URI ?? '',
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!tokenRes.ok || !tokens.access_token) throw new AppError(400, 'oauth_error', tokens.error ?? 'OAuth failed');

    const encrypted = await encrypt(JSON.stringify(tokens), r.workspaceId, 'google');
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

    await withTenant(r.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO calendar_connection (id, workspace_id, user_id, encrypted_tokens, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, 'connected')
         ON CONFLICT (workspace_id, user_id, provider)
         DO UPDATE SET encrypted_tokens = $4, expires_at = $5, status = 'connected', updated_at = NOW()`,
        [`cal_${randomUUID().slice(0, 12)}`, r.workspaceId, r.userId, encrypted, expiresAt],
      );
    });

    res.redirect('/settings/integrations?google=connected');
  } catch (err) { next(err); }
});

integrationsRoutes.delete('/google/disconnect', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query<{ encrypted_tokens: string }>(
        `SELECT encrypted_tokens FROM calendar_connection WHERE user_id = $1 AND workspace_id = $2 AND provider = 'google'`,
        [r.userId, r.workspaceId],
      );

      if (rows[0]) {
        try {
          const tokens = JSON.parse(await decrypt(rows[0].encrypted_tokens, r.workspaceId, 'google')) as { refresh_token?: string };
          if (tokens.refresh_token) {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.refresh_token}`, { method: 'POST' });
          }
        } catch {
          // Log but don't fail — delete tokens even if revoke fails
        }
        await client.query(
          `DELETE FROM calendar_connection WHERE user_id = $1 AND workspace_id = $2`,
          [r.userId, r.workspaceId],
        );
        await writeAudit(client, {
          workspaceId: r.workspaceId,
          userId: r.userId,
          type: 'integration.changed',
          entityType: 'integration',
          entityId: 'google',
          actor: 'user',
          after: { action: 'disconnected' },
        });
      }
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
