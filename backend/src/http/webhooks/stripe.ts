import { Router, type Request, type Response, type NextFunction } from 'express';
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
import { sendSlackAlert } from '../../integrations/slack';
import { recordSyncEvent } from '../../integrations/sync-history';

// Stripe event type allowlist (SEC-5)
const ALLOWED_STRIPE_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
  'charge.refunded',
]);

export const stripeWebhook = Router();
stripeWebhook.use(webhookRateLimit);

async function handleStripeWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    let workspaceId: string;
    const hookToken = req.params['hookToken'];

    if (hookToken) {
      const { rows: tokenRows } = await workerPool.query<{
        workspace_id: string;
        encrypted_config: string;
      }>(
        `SELECT ic.workspace_id, ic.encrypted_config
         FROM integration_config ic
         WHERE ic.hook_token_hash = encode(sha256($1::bytea), 'hex')
           AND ic.provider = 'stripe'`,
        [hookToken],
      );

      if (tokenRows[0]) {
        workspaceId = tokenRows[0].workspace_id;
      } else {
        const { rows: ws } = await workerPool.query<{ id: string }>('SELECT id FROM workspace ORDER BY created_at ASC LIMIT 1');
        if (!ws[0]) return next(new AppError(404, 'not_found', 'Workspace not found'));
        workspaceId = ws[0].id;
      }
    } else {
      const { rows: ws } = await workerPool.query<{ id: string }>('SELECT id FROM workspace ORDER BY created_at ASC LIMIT 1');
      if (!ws[0]) return next(new AppError(404, 'not_found', 'Workspace not found'));
      workspaceId = ws[0].id;
    }

    const { config } = await import('../../config');
    const webhookSecret = config.STRIPE_WEBHOOK_SECRET ?? '';
    const secretKey = config.STRIPE_SECRET_KEY ?? '';

    if (!secretKey) return next(new AppError(503, 'not_configured', 'Stripe not configured'));

    const stripe = new Stripe(secretKey);
    const rawBody = req.body as Buffer;
    const signature = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err: any) {
        writeSecurityEvent({ type: 'webhook_rejected', req, workspaceId, details: { reason: 'invalid_signature', provider: 'stripe' } }).catch(() => {});
        logger.warn({ err: err.message }, 'Stripe webhook signature validation failed');
        if (process.env.NODE_ENV === 'production') {
          return next(new AppError(400, 'bad_request', 'Invalid Stripe signature'));
        }
        // In local/test fallback, parse body if available
        try {
          event = JSON.parse(rawBody.toString('utf-8')) as Stripe.Event;
        } catch {
          return next(new AppError(400, 'bad_request', 'Invalid Stripe payload'));
        }
      }
    } else {
      try {
        event = JSON.parse(rawBody.toString('utf-8')) as Stripe.Event;
      } catch {
        return next(new AppError(400, 'bad_request', 'Invalid payload'));
      }
    }

    // SEC-5: Ignore non-allowlisted event types silently
    if (!ALLOWED_STRIPE_EVENTS.has(event.type)) {
      logger.info({ eventType: event.type }, 'Stripe event ignored (not in allowlist)');
      return res.json({ received: true });
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
          const oppId = (session.metadata?.opportunityId as string) || null;

          // Check if payment already recorded as pending
          const { rows: existingPay } = await client.query<{ id: string }>(
            `UPDATE payment
             SET status = 'paid', updated_at = NOW()
             WHERE stripe_session_id = $1 AND workspace_id = $2
             RETURNING id`,
            [session.id, workspaceId],
          );

          let paymentId = existingPay[0]?.id;
          if (!paymentId) {
            paymentId = `pay_${randomUUID().slice(0, 12)}`;
            await client.query(
              `INSERT INTO payment (id, workspace_id, opportunity_id, stripe_session_id, status, amount_cents)
               SELECT $1, $2, COALESCE($3, o.id), $4, 'paid', $5
               FROM opportunity o
               WHERE o.workspace_id = $2
               LIMIT 1
               ON CONFLICT DO NOTHING`,
              [paymentId, workspaceId, oppId, session.id, amountCents],
            );
          }

          if (oppId) {
            await client.query(
              `UPDATE opportunity SET status = 'won', updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
              [oppId, workspaceId],
            );
          }

          await writeAudit(client, {
            workspaceId,
            type: 'payment.paid',
            entityType: 'payment',
            entityId: paymentId,
            actor: 'system',
            after: { amountCents, sessionId: session.id, opportunityId: oppId },
          });

          hub.emit(workspaceId, 'payment.updated', { paymentId, status: 'paid', amountCents });

          // I4 / I2: Dispatch Slack alert
          sendSlackAlert({
            title: '💵 Payment Collected!',
            text: `💵 Payment Collected: $${(amountCents / 100).toFixed(2)} (Session: ${session.id})`,
            amount: (amountCents / 100).toFixed(2),
            workspaceId,
          }).catch((err) => logger.warn({ err }, 'Failed to dispatch Stripe payment Slack alert'));

          // Record sync history
          await recordSyncEvent({
            direction: 'inbound',
            provider: 'stripe',
            eventType: 'checkout.session.completed',
            status: 'ok',
            referenceId: session.id,
            details: { amountCents, opportunityId: oppId },
          });
          break;
        }

        case 'checkout.session.expired': {
          await client.query(
            `UPDATE payment SET status = 'expired', updated_at = NOW()
             WHERE stripe_session_id = $1 AND workspace_id = $2`,
            [session.id, workspaceId],
          );
          hub.emit(workspaceId, 'payment.updated', { sessionId: session.id, status: 'expired' });

          await recordSyncEvent({
            direction: 'inbound',
            provider: 'stripe',
            eventType: 'checkout.session.expired',
            status: 'ok',
            referenceId: session.id,
          });
          break;
        }

        case 'payment_intent.payment_failed': {
          if (paymentIntentId) {
            await client.query(
              `UPDATE payment SET status = 'failed', updated_at = NOW()
               WHERE stripe_session_id = $1 AND workspace_id = $2`,
              [paymentIntentId, workspaceId],
            );
          }
          await recordSyncEvent({
            direction: 'inbound',
            provider: 'stripe',
            eventType: 'payment_intent.payment_failed',
            status: 'ok',
            referenceId: paymentIntentId ?? session.id,
          });
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          const refundedCents = charge.amount_refunded ?? 0;
          await client.query(
            `UPDATE payment SET status = 'refunded', refunded_cents = $1, updated_at = NOW()
             WHERE workspace_id = $2 AND stripe_session_id = $3`,
            [refundedCents, workspaceId, charge.payment_intent as string || charge.id],
          );
          hub.emit(workspaceId, 'payment.updated', { status: 'refunded', refundedCents });

          await recordSyncEvent({
            direction: 'inbound',
            provider: 'stripe',
            eventType: 'charge.refunded',
            status: 'ok',
            referenceId: charge.id,
            details: { refundedCents },
          });
          break;
        }
      }
    });

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}

stripeWebhook.post('/:hookToken', handleStripeWebhook);
stripeWebhook.post('/', handleStripeWebhook);
