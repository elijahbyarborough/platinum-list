import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  const { id } = req.query;
  const logId = parseInt(id as string, 10);

  if (isNaN(logId)) {
    return res.status(400).json({ error: 'Invalid submission log ID' });
  }

  if (req.method === 'DELETE') {
    try {
      // First, get the submission log data to preserve in change_logs
      const { rows: logRows } = await sql`
        SELECT sl.*, c.ticker, c.company_name
        FROM submission_logs sl
        JOIN companies c ON sl.company_id = c.id
        WHERE sl.id = ${logId}
      `;

      if (logRows.length === 0) {
        return res.status(404).json({ error: 'Submission log not found' });
      }

      const log = logRows[0];

      // Parse and enhance snapshot with original submission time
      const snapshotData = typeof log.snapshot_data === 'string'
        ? JSON.parse(log.snapshot_data)
        : log.snapshot_data;
      snapshotData.original_submitted_at = log.submitted_at;
      const enhancedSnapshot = JSON.stringify(snapshotData);

      // Log the deletion to change_logs before deleting
      await sql`
        INSERT INTO change_logs (ticker, company_name, change_type, analyst_initials, snapshot_data)
        VALUES (${log.ticker}, ${log.company_name}, 'deletion', ${log.analyst_initials}, ${enhancedSnapshot}::jsonb)
      `;

      // Now delete the submission log
      await sql`
        DELETE FROM submission_logs WHERE id = ${logId}
      `;

      return res.json({ success: true, message: 'Submission log deleted' });
    } catch (error) {
      console.error('Error deleting submission log:', error);
      return res.status(500).json({ error: 'Failed to delete submission log' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

