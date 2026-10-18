import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../auth';
import { withTenant } from '../../db/tenant';
import { AppError } from '../errors';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import Stripe from 'stripe';
import { recordSyncEvent } from '../../integrations/sync-history';

export const paymentRoutes = Router();
paymentRoutes.use(requireAuth);

// ── Create Stripe Checkout session (Schema 1: internal) ──────────────────────
const checkoutSchema = z.object({
  opportunityId: z.string().optional(),
  contactId: z.string().optional(),
  amountCents: z.number().int().min(1),
  currency: z.string().default('usd'),
  description: z.string().optional(),
  title: z.string().optional(),
  customerEmail: z.string().email().optional(),
});

async function handleCreateSession(req: any, res: any, next: any) {
  const r = req as AuthRequest;
  try {
    const body = checkoutSchema.parse(req.body);
    const { config } = await import('../../config');
    if (!config.STRIPE_SECRET_KEY) throw new AppError(503, 'not_configured', 'Stripe not configured');

    const stripe = new Stripe(config.STRIPE_SECRET_KEY);

    await withTenant(r.workspaceId, async (client) => {
      let oppId = body.opportunityId;
      if (oppId) {
        // Verify opportunity exists in workspace
        const { rows } = await client.query(
          `SELECT id FROM opportunity WHERE id = $1 AND workspace_id = $2`,
          [oppId, r.workspaceId],
        );
        if (!rows[0]) throw new AppError(404, 'not_found', 'Opportunity not found');
      } else {
        // Find or create default opportunity for workspace
        const { rows } = await client.query<{ id: string }>(
          `SELECT id FROM opportunity WHERE workspace_id = $1 LIMIT 1`,
          [r.workspaceId],
        );
        oppId = rows[0]?.id;
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: body.customerEmail,
        metadata: {
          opportunityId: oppId || '',
          contactId: body.contactId || '',
        },
        line_items: [{
          price_data: {
            currency: body.currency,
            product_data: { name: body.title || body.description || 'LeadGuard Payment' },
            unit_amount: body.amountCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${config.PUBLIC_BASE_URL}/payments/success?session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.PUBLIC_BASE_URL}/payments/cancel`,
      });

      const paymentId = `pay_${randomUUID().slice(0, 12)}`;
      if (oppId) {
        await client.query(
          `INSERT INTO payment (id, workspace_id, opportunity_id, stripe_session_id, status, amount_cents)
           VALUES ($1, $2, $3, $4, 'pending', $5)`,
          [paymentId, r.workspaceId, oppId, session.id, body.amountCents],
        );
      }

      await recordSyncEvent({
        direction: 'outbound',
        provider: 'stripe',
        eventType: 'checkout_session_created',
        status: 'ok',
        referenceId: session.id,
        details: { amountCents: body.amountCents, opportunityId: oppId },
      });

      res.json({
        success: true,
        url: session.url,
        checkoutUrl: session.url,
        sessionId: session.id,
        paymentId,
      });
    });
  } catch (err) { next(err); }
}

paymentRoutes.post('/checkout', handleCreateSession);
paymentRoutes.post('/create-checkout-session', handleCreateSession);
paymentRoutes.post('/create-session', handleCreateSession);

// ── List all payments ─────────────────────────────────────────────────────────
paymentRoutes.get('/', async (req, res, next) => {
  const r = req as AuthRequest;
  try {
    await withTenant(r.workspaceId, async (client) => {
      const { rows } = await client.query<{
        id: string;
        opportunity_id: string | null;
        contact_id: string | null;
        status: string;
        amount_cents: number;
        refunded_cents: number;
        created_at: Date;
      }>(
        `SELECT p.id, p.opportunity_id, o.contact_id, p.status, p.amount_cents, p.refunded_cents, p.created_at
         FROM payment p
         LEFT JOIN opportunity o ON o.id = p.opportunity_id
         WHERE p.workspace_id = $1
         ORDER BY p.created_at DESC LIMIT 100`,
        [r.workspaceId],
      );
      res.json({
        payments: rows.map(r => ({
          id: r.id,
          contactId: r.contact_id || '',
          amountCents: r.amount_cents,
          status: r.status,
          memo: 'Payment',
          createdAt: r.created_at.toISOString(),
        })),
      });
    });
  } catch (err) { next(err); }
});
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
