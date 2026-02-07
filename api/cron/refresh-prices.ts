import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findAllCompanies, updateCompanyPrice } from '../../lib/models/company.js';
import { getPrice } from '../../lib/services/stockPriceService.js';

/**
 * Cron job endpoint for automated daily price refresh
 * Configured in vercel.json to run at:
 * - 7:30 AM ET (12:30 UTC) on weekdays (before PDF generation)
 * - 4:00 PM ET (20:00 UTC) on weekdays (end of day)
 * 
 * This endpoint can also be called manually if needed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify the request is from Vercel Cron (in production)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow manual calls in development or when CRON_SECRET is not set
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const companies = await findAllCompanies();
    const results: Array<{
      ticker: string;
      success: boolean;
      price?: number | null;
      error?: string;
    }> = [];
    
    console.log(`[Cron] Starting price refresh for ${companies.length} companies`);
    
    // Process all companies in parallel
    const pricePromises = companies.map(async (company) => {
      try {
        const price = await getPrice(company.ticker);
        
        if (price !== null) {
          await updateCompanyPrice(company.ticker, price);
          console.log(`[Cron] Updated ${company.ticker}: $${price}`);
          return {
            ticker: company.ticker,
            success: true,
            price,
          };
        } else {
          console.log(`[Cron] No price available for ${company.ticker}`);
          return {
            ticker: company.ticker,
            success: false,
            error: 'Price unavailable',
          };
        }
      } catch (error) {
        console.error(`[Cron] Error refreshing price for ${company.ticker}:`, error);
        return {
          ticker: company.ticker,
          success: false,
          error: 'Failed to fetch price',
        };
      }
    });

    const settledResults = await Promise.all(pricePromises);
    
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

