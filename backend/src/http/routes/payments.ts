import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../auth';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import Stripe from 'stripe';

export const paymentRoutes = Router();
paymentRoutes.use(requireAuth);

// ── Create Stripe Checkout session ────────────────────────────────────────────
const checkoutSchema = z.object({
  opportunityId: z.string(),
  amountCents: z.number().int().min(1),
  currency: z.string().default('usd'),
  description: z.string().optional(),
});

paymentRoutes.post('/checkout', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    const body = checkoutSchema.strict().parse(req.body);
    const { config } = await import('../../config');
    if (!config.STRIPE_SECRET_KEY) throw new AppError(503, 'not_configured', 'Stripe not configured');

    const stripe = new Stripe(config.STRIPE_SECRET_KEY);

    await withTenant(r.workspaceId, async (client) => {
      // Verify opportunity exists in workspace
      const { rows } = await client.query(
        `SELECT id FROM opportunity WHERE id = $1 AND workspace_id = $2`,
        [body.opportunityId, r.workspaceId],
      );
      if (!rows[0]) throw new AppError(404, 'not_found', 'Opportunity not found');

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: body.currency,
            product_data: { name: body.description ?? 'LeadGuard Payment' },
            unit_amount: body.amountCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${config.PUBLIC_BASE_URL}/payments/success?session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.PUBLIC_BASE_URL}/payments/cancel`,
      });

      const paymentId = `pay_${randomUUID().slice(0, 12)}`;
      await client.query(
        `INSERT INTO payment (id, workspace_id, opportunity_id, stripe_session_id, status, amount_cents)
         VALUES ($1, $2, $3, $4, 'pending', $5)`,
        [paymentId, r.workspaceId, body.opportunityId, session.id, body.amountCents],
      );

      res.json({ url: session.url, sessionId: session.id, paymentId });
    });
  } catch (err) { next(err); }
});

// ── List payments for opportunity ─────────────────────────────────────────────
paymentRoutes.get('/opportunity/:id', async (req, res, next) => {
  const r = req as unknown as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, status, amount_cents, refunded_cents, created_at
         FROM payment WHERE opportunity_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
        [req.params['id'], r.workspaceId],
      );
      res.json({ payments: rows });
    });
  } catch (err) { next(err); }
});
