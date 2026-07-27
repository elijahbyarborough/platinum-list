import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findCompanyByTicker, updateCompanyPrice } from '../../../lib/models/company.js';
import { getQuote } from '../../../lib/services/stockPriceService.js';
import { requireAuth } from '../../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ticker } = req.query;
    const normalizedTicker = (ticker as string).toUpperCase();
    
    const company = await findCompanyByTicker(normalizedTicker);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const quote = await getQuote(normalizedTicker);
    
    if (quote.price !== null) {
      await updateCompanyPrice(normalizedTicker, quote.price);
      company.current_stock_price = quote.price;
      company.price_last_updated = new Date().toISOString();
    }
    
    return res.json({
      ...company,
      price_updated: quote.price !== null,
      price: quote.price,
    });
  } catch (error) {
    console.error('Error refreshing price:', error);
    return res.status(500).json({ error: 'Failed to refresh price' });
  }
}

