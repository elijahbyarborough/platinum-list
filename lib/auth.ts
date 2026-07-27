import { createHmac, timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Auth model: the PIN lives ONLY in the APP_PIN env var. The login endpoint
 * exchanges a correct PIN for a token (an HMAC derived from the PIN), which the
 * client sends as `Authorization: Bearer <token>` on every API call. Rotating
 * APP_PIN invalidates all outstanding tokens.
 *
 * In local development (no APP_PIN set, not production) auth is skipped so the
 * app works without env setup. In production, missing APP_PIN fails closed.
 */

const TOKEN_CONTEXT = 'platinum-list-token-v1';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export function computeToken(pin: string): string {
  return createHmac('sha256', pin).update(TOKEN_CONTEXT).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function verifyPin(pin: string): boolean {
  const appPin = process.env.APP_PIN;
  if (!appPin) return !isProduction();
  return safeEqual(pin, appPin);
}

function hasValidToken(req: VercelRequest): boolean {
  const appPin = process.env.APP_PIN;
  if (!appPin) return !isProduction();
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  return safeEqual(header.slice('Bearer '.length), computeToken(appPin));
}

/**
 * Guard for user-facing API routes. Returns true if the request is authorized;
 * otherwise sends a 401 and returns false. Call at the top of every handler:
 *   if (!requireAuth(req, res)) return;
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  if (hasValidToken(req)) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

/**
 * Guard for cron routes. Accepts the Vercel cron secret, or a logged-in user's
 * token (so the endpoints can still be triggered manually). Fails closed in
 * production if CRON_SECRET is unset.
 */
export function requireCron(req: VercelRequest, res: VercelResponse): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const header = req.headers.authorization;
  if (cronSecret && header === `Bearer ${cronSecret}`) return true;
  if (hasValidToken(req)) return true;
  if (!cronSecret && !isProduction()) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}
