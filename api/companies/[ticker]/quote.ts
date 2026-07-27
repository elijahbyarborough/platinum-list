import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCompleteQuote } from '../../../lib/services/stockPriceService.js';
import { requireAuth } from '../../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ticker } = req.query;
    const normalizedTicker = (ticker as string).toUpperCase();
    
    const quote = await getCompleteQuote(normalizedTicker);
    
    return res.json({
      ticker: normalizedTicker,
      price: quote.price,
      companyName: quote.companyName,
      fiscalYearEnd: quote.fiscalYearEnd,
    });
  } catch (error) {
    console.error('Error fetching quote:', error);
    return res.status(500).json({ error: 'Failed to fetch quote' });
  }
}

