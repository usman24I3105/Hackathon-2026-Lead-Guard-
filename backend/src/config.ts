import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().default(0),

  // Database
  DATABASE_URL_APP: z.string().min(1),
  DATABASE_URL_WORKER: z.string().min(1),
  DATABASE_URL_MIGRATOR: z.string().min(1),

  // Secrets
  APP_SECRET: z.string().min(32),
  APP_SECRET_KEY_VERSION: z.coerce.number().default(1),
  APP_SECRET_PREVIOUS: z.string().optional(),

  // Sessions
  SESSION_IDLE_MINUTES: z.coerce.number().default(60),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().default(30),
  COOKIE_NAME: z.string().default('__Host-sid'),
  REAUTH_WINDOW_MINUTES: z.coerce.number().default(10),

  // Limits
  RATE_GLOBAL_PER_MIN: z.coerce.number().default(300),
  RATE_USER_PER_MIN: z.coerce.number().default(120),
  SSE_MAX_PER_USER: z.coerce.number().default(3),
  SSE_MAX_PER_WORKSPACE: z.coerce.number().default(100),
  BODY_LIMIT_KB: z.coerce.number().default(100),

  // Demo
  DEMO_OWNER_PASSWORD: z.string().optional(),
  DEMO_USER_PASSWORD: z.string().optional(),

  // Providers
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;

export const corsOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim());
export const allowedOrigins = [...new Set([...corsOrigins, config.PUBLIC_BASE_URL.replace(/\/$/, '')])];
