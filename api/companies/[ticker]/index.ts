import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findCompanyByTicker } from '../../../lib/models/company.js';
import { findEstimatesByCompanyId } from '../../../lib/models/estimates.js';
import { findExitMultiplesByCompanyId } from '../../../lib/models/exitMultiple.js';
import { requireAuth } from '../../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ticker } = req.query;
    const normalizedTicker = (ticker as string).toUpperCase();
    
    const company = await findCompanyByTicker(normalizedTicker);
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Fetch estimates for the company's active metric type
    const estimates = await findEstimatesByCompanyId(company.id!, company.metric_type);
    
    // Fetch exit multiples
    const exitMultiples = await findExitMultiplesByCompanyId(company.id!, 5);
    const exitMultiple = exitMultiples.length > 0 ? exitMultiples[0].multiple : null;
    
    return res.json({
      ...company,
      estimates,
      exit_multiple_5yr: exitMultiple,
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    return res.status(500).json({ error: 'Failed to fetch company' });
  }
}
