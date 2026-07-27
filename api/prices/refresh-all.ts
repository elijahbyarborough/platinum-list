import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findAllCompanies, updateCompanyPrice } from '../../lib/models/company.js';
import { refreshPricesBatched } from '../../lib/services/stockPriceService.js';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const companies = await findAllCompanies();
    const results = await refreshPricesBatched(
      companies.map((c) => c.ticker),
      updateCompanyPrice
    );

    return res.json({
      total: companies.length,
      results,
    });
  } catch (error) {
    console.error('Error refreshing prices:', error);
    return res.status(500).json({ error: 'Failed to refresh prices' });
  }
}
