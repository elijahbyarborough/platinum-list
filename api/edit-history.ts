import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findAllSubmissionLogs } from '../lib/models/submissionLog.js';
import { findCompanyById } from '../lib/models/company.js';
import { findExitMultiplesByCompanyId } from '../lib/models/exitMultiple.js';
import { Estimate } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

interface EditComparison {
  ticker: string;
  company_name: string;
  before: {
    submitted_at: string;
    analyst_initials: string;
    exit_multiple: number | null;
    metric_type: string;
    estimates: Estimate[];
  };
  after: {
    submitted_at: string;
    analyst_initials: string;
    exit_multiple: number | null;
    metric_type: string;
    estimates: Estimate[];
  };
}

// Helper to extract estimates from snapshot (handles both old and new formats)
function extractEstimatesFromSnapshot(snapshot: any): Estimate[] {
  // New format: estimates array
  if (snapshot.estimates && Array.isArray(snapshot.estimates)) {
    return snapshot.estimates;
  }
  
  // Old format: fy1_metric, fy1_div, etc. - convert to estimates format
  // Note: Old format used relative years, so we can't determine exact fiscal year
  // Just return empty array for old snapshots
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const allLogs = await findAllSubmissionLogs();
    
    // Group logs by company_id
    const logsByCompany = new Map<number, typeof allLogs>();
    for (const log of allLogs) {
      if (!logsByCompany.has(log.company_id)) {
        logsByCompany.set(log.company_id, []);
      }
      logsByCompany.get(log.company_id)!.push(log);
    }
    
    const comparisons: EditComparison[] = [];
    
    // For each company, compare consecutive submissions
    for (const [companyId, logs] of logsByCompany.entries()) {
      // Sort by submitted_at to ensure chronological order
      const sortedLogs = logs.sort((a, b) => {
        const dateA = new Date(a.submitted_at || 0).getTime();
        const dateB = new Date(b.submitted_at || 0).getTime();
        return dateA - dateB;
      });
      
      // Get current company info
      const company = await findCompanyById(companyId);
      if (!company) continue;
      
      // Get exit multiples
      const exitMultiples = await findExitMultiplesByCompanyId(companyId, 5);
      const exitMultiple = exitMultiples.length > 0 ? exitMultiples[0].multiple : null;
      
      // Compare each pair of consecutive submissions
      for (let i = 0; i < sortedLogs.length - 1; i++) {
        const beforeLog = sortedLogs[i];
        const afterLog = sortedLogs[i + 1];
        
        const beforeSnapshot = JSON.parse(beforeLog.snapshot_data);
        const afterSnapshot = JSON.parse(afterLog.snapshot_data);
        
        comparisons.push({
          ticker: company.ticker,
          company_name: company.company_name,
          before: {
            submitted_at: beforeLog.submitted_at || '',
            analyst_initials: beforeLog.analyst_initials,
            exit_multiple: exitMultiple,
            metric_type: beforeSnapshot.metric_type,
            estimates: extractEstimatesFromSnapshot(beforeSnapshot),
          },
          after: {
            submitted_at: afterLog.submitted_at || '',
            analyst_initials: afterLog.analyst_initials,
            exit_multiple: exitMultiple,
            metric_type: afterSnapshot.metric_type,
            estimates: extractEstimatesFromSnapshot(afterSnapshot),
          },
        });
      }
    }
    
    // Sort by most recent edit first
    comparisons.sort((a, b) => {
      const dateA = new Date(a.after.submitted_at).getTime();
      const dateB = new Date(b.after.submitted_at).getTime();
      return dateB - dateA;
    });
    
    return res.json(comparisons);
  } catch (error) {
    console.error('Error fetching edit history:', error);
    return res.status(500).json({ error: 'Failed to fetch edit history' });
  }
}
