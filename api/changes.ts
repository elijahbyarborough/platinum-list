import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, Estimate } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

interface ChangeSnapshot {
  submitted_at: string;
  original_submitted_at?: string;
  analyst_initials: string;
  exit_multiple: number | null;
  metric_type: string;
  estimates: Estimate[];
  irr_5yr: number | null;
  current_stock_price: number | null;
}

interface EditChange {
  type: 'edit';
  ticker: string;
  company_name: string;
  changed_at: string;
  before: ChangeSnapshot;
  after: ChangeSnapshot;
}

interface DeletionChange {
  type: 'deletion';
  ticker: string;
  company_name: string;
  changed_at: string;
  deleted: ChangeSnapshot;
}

type Change = EditChange | DeletionChange;

// Helper to extract estimates from snapshot (handles both old and new formats)
function extractEstimatesFromSnapshot(snapshot: any): Estimate[] {
  // New format: estimates array
  if (snapshot.estimates && Array.isArray(snapshot.estimates)) {
    return snapshot.estimates;
  }
  
  // Old format: fy1_metric, fy1_div, etc. - return empty for old snapshots
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const changes: Change[] = [];
    
    // Get all changes from change_logs (both edits and deletions)
    const { rows: changeLogs } = await sql`
      SELECT * FROM change_logs 
      ORDER BY changed_at DESC
    `;
    
    for (const log of changeLogs) {
      if (log.change_type === 'edit') {
        // Edit: has before_snapshot and after_snapshot
        const beforeSnapshot = typeof log.before_snapshot === 'string'
          ? JSON.parse(log.before_snapshot)
          : log.before_snapshot;
        const afterSnapshot = typeof log.after_snapshot === 'string'
          ? JSON.parse(log.after_snapshot)
          : log.after_snapshot;
        
        if (beforeSnapshot && afterSnapshot) {
          changes.push({
            type: 'edit',
            ticker: log.ticker,
            company_name: log.company_name,
            changed_at: log.changed_at,
            before: {
              submitted_at: log.changed_at,
              original_submitted_at: beforeSnapshot.original_submitted_at || undefined,
              analyst_initials: beforeSnapshot.analyst_initials || log.analyst_initials,
              exit_multiple: beforeSnapshot.exit_multiple_5yr ?? null,
              metric_type: beforeSnapshot.metric_type,
              estimates: extractEstimatesFromSnapshot(beforeSnapshot),
              irr_5yr: beforeSnapshot.irr_5yr ?? null,
              current_stock_price: beforeSnapshot.current_stock_price ?? null,
            },
            after: {
              submitted_at: log.changed_at,
              analyst_initials: log.analyst_initials,
              exit_multiple: afterSnapshot.exit_multiple_5yr ?? null,
              metric_type: afterSnapshot.metric_type,
              estimates: extractEstimatesFromSnapshot(afterSnapshot),
              irr_5yr: afterSnapshot.irr_5yr ?? null,
              current_stock_price: afterSnapshot.current_stock_price ?? null,
            },
          });
        }
      } else if (log.change_type === 'deletion') {
        // Deletion: has snapshot_data
        const snapshot = typeof log.snapshot_data === 'string'
          ? JSON.parse(log.snapshot_data)
          : log.snapshot_data;
        
        if (snapshot) {
          changes.push({
            type: 'deletion',
            ticker: log.ticker,
            company_name: log.company_name,
            changed_at: log.changed_at,
            deleted: {
              submitted_at: log.changed_at,
              original_submitted_at: snapshot.original_submitted_at || undefined,
              analyst_initials: log.analyst_initials,
              exit_multiple: snapshot.exit_multiple_5yr ?? null,
              metric_type: snapshot.metric_type,
              estimates: extractEstimatesFromSnapshot(snapshot),
              irr_5yr: snapshot.irr_5yr ?? null,
              current_stock_price: snapshot.current_stock_price ?? null,
            },
          });
        }
      }
    }
    
    // Changes are already sorted by changed_at DESC from the query
    return res.json(changes);
  } catch (error) {
    console.error('Error fetching changes:', error);
    return res.status(500).json({ error: 'Failed to fetch changes' });
  }
}
