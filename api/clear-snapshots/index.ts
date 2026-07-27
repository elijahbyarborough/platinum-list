import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db.js';
import { del } from '@vercel/blob';
import { requireAuth } from '../../lib/auth.js';

/**
 * Clear all snapshots from blob storage and database
 * WARNING: This deletes all historical snapshots
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all snapshot URLs from database
    const { rows } = await sql`
      SELECT pdf_url FROM dashboard_snapshots
    `;

    // Delete all files from blob storage
    const deletePromises = rows.map(async (row) => {
      try {
        // del() accepts the full URL
        await del(row.pdf_url);
        console.log(`Deleted blob: ${row.pdf_url}`);
      } catch (error) {
        console.error(`Error deleting blob ${row.pdf_url}:`, error);
        // Continue even if one fails
      }
    });

    await Promise.all(deletePromises);

    // Delete all records from database
    await sql`DELETE FROM dashboard_snapshots`;

    return res.json({
      success: true,
      message: `Deleted ${rows.length} snapshots from blob storage and database`,
      deletedCount: rows.length,
    });
  } catch (error: any) {
    console.error('Error clearing snapshots:', error);
    return res.status(500).json({
      error: 'Failed to clear snapshots',
    });
  }
}
