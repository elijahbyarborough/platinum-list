import type { VercelRequest, VercelResponse } from '@vercel/node';
import { computeToken, verifyPin } from '../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pin = req.body?.pin;
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be 4 digits' });
  }

  const appPin = process.env.APP_PIN;
  if (!appPin && (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production')) {
    return res.status(500).json({ error: 'Auth not configured: set the APP_PIN environment variable' });
  }

  if (!verifyPin(pin)) {
    // Slow down brute-force attempts
    await new Promise((resolve) => setTimeout(resolve, 500));
    return res.status(401).json({ error: 'Incorrect PIN' });
  }

  // Local dev with no APP_PIN configured: issue a token derived from the entered PIN
  return res.json({ token: computeToken(appPin ?? pin) });
}
