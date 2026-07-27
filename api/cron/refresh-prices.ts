import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findAllCompanies, updateCompanyPrice } from '../../lib/models/company.js';
import { refreshPricesBatched } from '../../lib/services/stockPriceService.js';
import { requireCron } from '../../lib/auth.js';

/**
 * Cron job endpoint for automated daily price refresh
 * Configured in vercel.json to run at:
 * - 7:30 AM ET (12:30 UTC) on weekdays (before PDF generation)
 * - 4:00 PM ET (20:00 UTC) on weekdays (end of day)
 * 
 * This endpoint can also be called manually if needed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCron(req, res)) return;

  try {
    const companies = await findAllCompanies();

    console.log(`[Cron] Starting price refresh for ${companies.length} companies`);

    const settledResults = await refreshPricesBatched(
      companies.map((c) => c.ticker),
      updateCompanyPrice
    );

    const successCount = settledResults.filter(r => r.success).length;
    console.log(`[Cron] Completed: ${successCount}/${companies.length} prices updated`);
    
    return res.json({
      message: 'Price refresh completed',
      timestamp: new Date().toISOString(),
      total: companies.length,
      successful: successCount,
      results: settledResults,
    });
  } catch (error) {
    console.error('[Cron] Error in price refresh job:', error);
    return res.status(500).json({ error: 'Failed to refresh prices' });
  }
}

