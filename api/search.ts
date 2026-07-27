import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchTickers } from '../lib/services/stockPriceService.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const query = req.query.q as string;
    
    if (!query || query.length < 1) {
      return res.json([]);
    }
    
    const results = await searchTickers(query);
    return res.json(results);
  } catch (error) {
    console.error('Error searching tickers:', error);
    return res.status(500).json({ error: 'Failed to search tickers' });
  }
}

