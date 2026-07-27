import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findAllSubmissionLogs } from '../lib/models/submissionLog.js';
import { findCompanyById } from '../lib/models/company.js';
import { findExitMultiplesByCompanyId } from '../lib/models/exitMultiple.js';
import { findEstimatesByCompanyId } from '../lib/models/estimates.js';
import { calculate5YearIRR, hasSufficientDataForIRR } from '../lib/utils/irrCalculator.js';
import { Company, Estimate } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const logs = await findAllSubmissionLogs();
    
    // Enrich each log with company data and calculations
    const enrichedPromises = logs.map(async (log) => {
      // Parse snapshot data (company state at submission time)
      const snapshot = JSON.parse(log.snapshot_data);
      
      // Get current company data for ticker and name
      const currentCompany = await findCompanyById(log.company_id!);
      
      // Get exit multiple
      const exitMultiples = await findExitMultiplesByCompanyId(log.company_id!, 5);
      const exitMultiple = exitMultiples.length > 0 ? exitMultiples[0].multiple : null;
      
      // Extract estimates from snapshot - handle both old and new formats
      let estimates: Estimate[] = [];
      if (snapshot.estimates && Array.isArray(snapshot.estimates)) {
        // New format: estimates array included in snapshot
        estimates = snapshot.estimates;
      }
      
      // For IRR calculation, use current estimates from DB if snapshot doesn't have them
      if (estimates.length === 0 && currentCompany) {
        estimates = await findEstimatesByCompanyId(currentCompany.id!);
      }
      
      // Calculate IRR if we have enough data
      let irr: number | null = null;
      if (exitMultiple && currentCompany && estimates.length > 0) {
        if (hasSufficientDataForIRR(currentCompany, estimates)) {
          irr = calculate5YearIRR(currentCompany, estimates, exitMultiple);
        }
      }
      
      return {
        id: log.id,
        ticker: currentCompany?.ticker || snapshot.ticker,
        company_name: currentCompany?.company_name || snapshot.company_name,
        price_at_submission: snapshot.current_stock_price,
        exit_multiple: exitMultiple,
        metric_type: snapshot.metric_type,
        irr_5yr: irr,
        submitted_at: log.submitted_at,
        analyst_initials: log.analyst_initials,
      };
    });

    const enriched = await Promise.all(enrichedPromises);
    
    return res.json(enriched);
  } catch (error) {
    console.error('Error fetching submission logs:', error);
    return res.status(500).json({ error: 'Failed to fetch submission logs' });
  }
}
