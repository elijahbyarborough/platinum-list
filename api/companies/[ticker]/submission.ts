import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findCompanyByTicker } from '../../../lib/models/company.js';
import { findLatestSubmissionLogByCompanyId } from '../../../lib/models/submissionLog.js';
import { requireAuth } from '../../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  const { ticker } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const company = await findCompanyByTicker((ticker as string).toUpperCase());
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const submissionLog = await findLatestSubmissionLogByCompanyId(company.id!);
    if (!submissionLog) {
      return res.status(404).json({ error: 'No submission found for this company' });
    }

    // Parse the snapshot to get the original submission data
    const snapshot = typeof submissionLog.snapshot_data === 'string'
      ? JSON.parse(submissionLog.snapshot_data)
      : submissionLog.snapshot_data;

    return res.json({
      ticker: company.ticker,
      company_name: company.company_name,
      submitted_at: submissionLog.submitted_at,
      price_at_submission: snapshot.current_stock_price,
      price_submitted_at: snapshot.price_last_updated,
    });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return res.status(500).json({ error: 'Failed to fetch submission' });
  }
}

