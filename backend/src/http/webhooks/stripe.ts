import { Router } from 'express';
import Stripe from 'stripe';
import { workerPool } from '../../db/pool';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { writeSecurityEvent } from '../../security/security-events';
import { webhookRateLimit } from '../../security/limits';
import { hub } from '../../realtime/hub';
import { writeAudit } from '../../domain/audit';
import logger from '../logger';
import { randomUUID } from 'crypto';

// Stripe event type allowlist (SEC-5)
const ALLOWED_STRIPE_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
  'charge.refunded',
]);

export const stripeWebhook = Router();
stripeWebhook.use(webhookRateLimit);

/**
 * BE-9: Stripe webhook
 * Path: /webhooks/stripe/:hookToken
 */
stripeWebhook.post('/:hookToken', async (req, res, next) => {
  try {
    const { rows: tokenRows } = await workerPool.query<{
      workspace_id: string;
      encrypted_config: string;
    }>(
      `SELECT ic.workspace_id, ic.encrypted_config
       FROM integration_config ic
       WHERE ic.hook_token_hash = encode(sha256($1::bytea), 'hex')
         AND ic.provider = 'stripe'`,
      [req.params['hookToken']],
    );

    if (!tokenRows[0]) {
      writeSecurityEvent({ type: 'webhook_rejected', req, details: { reason: 'unknown_token', provider: 'stripe' } }).catch(() => {});
      return next(new AppError(404, 'not_found', 'Webhook endpoint not found'));
    }

    const workspaceId = tokenRows[0].workspace_id;
    const { config } = await import('../../config');
    const webhookSecret = config.STRIPE_WEBHOOK_SECRET ?? '';
    const secretKey = config.STRIPE_SECRET_KEY ?? '';

    if (!secretKey) return next(new AppError(503, 'not_configured', 'Stripe not configured'));

    const stripe = new Stripe(secretKey);
    const rawBody = req.body as Buffer;
    const signature = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      writeSecurityEvent({ type: 'webhook_rejected', req, workspaceId, details: { reason: 'invalid_signature', provider: 'stripe' } }).catch(() => {});
      return next(new AppError(400, 'bad_request', 'Invalid Stripe signature'));
    }

    // SEC-5: Ignore non-allowlisted event types silently
    if (!ALLOWED_STRIPE_EVENTS.has(event.type)) {
      logger.info({ eventType: event.type }, 'Stripe event ignored (not in allowlist)');
      return res.json({ ok: true });
    }

    await withTenant(workspaceId, async (client) => {
      // Dedupe on event.id
      const { rowCount } = await client.query(
        `INSERT INTO integration_event (workspace_id, provider, external_id, event_type, status)
         VALUES ($1, 'stripe', $2, $3, 'ok')
         ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
        [workspaceId, event.id, event.type],
      );

      if (rowCount === 0) {
        logger.info({ eventId: event.id }, 'Duplicate Stripe event ignored');
        return;
      }

      const session = event.data.object as Stripe.Checkout.Session;
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

      switch (event.type) {
        case 'checkout.session.completed': {
          const amountCents = session.amount_total ?? 0;
          const paymentId = `pay_${randomUUID().slice(0, 12)}`;
          await client.query(
            `INSERT INTO payment (id, workspace_id, opportunity_id, stripe_session_id, status, amount_cents)
             SELECT $1, $2, o.id, $3, 'paid', $4
             FROM opportunity o
             WHERE o.workspace_id = $2
             LIMIT 1
             ON CONFLICT DO NOTHING`,
            [paymentId, workspaceId, session.id, amountCents],
          );
          await writeAudit(client, { workspaceId, type: 'payment.paid', entityType: 'payment', entityId: paymentId, actor: 'system', after: { amountCents, sessionId: session.id } });
          hub.emit(workspaceId, 'payment.updated', { paymentId, status: 'paid', amountCents });
          break;
        }
        case 'checkout.session.expired': {
          await client.query(
            `UPDATE payment SET status = 'expired', updated_at = NOW()
             WHERE stripe_session_id = $1 AND workspace_id = $2`,
            [session.id, workspaceId],
          );
          hub.emit(workspaceId, 'payment.updated', { sessionId: session.id, status: 'expired' });
          break;
        }
        case 'payment_intent.payment_failed': {
          if (paymentIntentId) {
            await client.query(
              `UPDATE payment SET status = 'failed', updated_at = NOW()
               WHERE stripe_session_id IN (
                 SELECT id FROM (SELECT $1::text) x
               ) AND workspace_id = $2`,
              [paymentIntentId, workspaceId],
            );
          }
          break;
        }
        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          const refundedCents = charge.amount_refunded ?? 0;
          await client.query(
            `UPDATE payment SET status = 'refunded', refunded_cents = $1, updated_at = NOW()
             WHERE stripe_session_id IN (
               SELECT cs.id FROM integration_event ie
               JOIN payment p ON p.stripe_session_id = ie.external_id
               WHERE p.workspace_id = $2
             ) AND workspace_id = $2`,
            [refundedCents, workspaceId],
          );
          hub.emit(workspaceId, 'payment.updated', { status: 'refunded', refundedCents });
          break;
        }
      }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
