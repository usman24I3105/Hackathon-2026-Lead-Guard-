import { Router } from 'express';

// Public routes (no auth) — e.g. form token resolution, invite landing
export const publicRoutes = Router();

// The public form intake is handled in /api/leads/intake (no auth required there)
// This router serves as a placeholder for any additional public endpoints
publicRoutes.get('/ping', (_req, res) => {
  res.json({ ok: true });
});
