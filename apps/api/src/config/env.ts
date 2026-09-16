import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_BASE_PATH: z.string().default('/api/v1'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  /** Optional comma-separated DNS servers for Node's resolver (helps when SRV lookups fail locally). */
  DNS_SERVERS: z.string().optional().default(''),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  BREVO_API_KEY: z.string().optional().default(''),
  EMAIL_FROM_NAME: z.string().default('PharmaOS'),
  EMAIL_FROM_ADDRESS: z.string().default('no-reply@localhost'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional().default(''),
  /** Plan billing (Razorpay). Leave empty to keep plan changes offline/manual. */
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  /** SMS: MSG91 (India) or Twilio. Leave empty to log to console. */
  MSG91_AUTH_KEY: z.string().optional().default(''),
  MSG91_SENDER_ID: z.string().optional().default(''),
  MSG91_TEMPLATE_ID: z.string().optional().default(''),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_FROM_NUMBER: z.string().optional().default(''),
  /** WhatsApp Business (Meta Cloud API). Leave empty to log to console. */
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  /** Web push (VAPID). Generate once with `npx web-push generate-vapid-keys`. */
  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().optional().default('mailto:support@localhost'),
  /** 32+ char secret used to encrypt per-organization AI keys at rest (defaults to the JWT secret). */
  AI_ENCRYPTION_KEY: z.string().optional().default(''),
  /** Signing secret for public document share links (defaults to the JWT secret). */
  SHARE_LINK_SECRET: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';
