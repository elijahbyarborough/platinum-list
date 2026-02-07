import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db.js';
import { findAllCompanies, updateCompanyPrice } from '../../lib/models/company.js';
import { findEstimatesByCompanyId } from '../../lib/models/estimates.js';
import { findExitMultiplesByCompanyId } from '../../lib/models/exitMultiple.js';
import { calculate5YearIRR, hasSufficientDataForIRR } from '../../lib/utils/irrCalculator.js';
import { getPrice } from '../../lib/services/stockPriceService.js';
import { put } from '@vercel/blob';
import PDFDocument from 'pdfkit';

/**
 * Generate a PDF snapshot of the dashboard
 * This endpoint is called by Vercel Cron at 8:00 AM ET daily
 * It automatically refreshes prices before generating the PDF to ensure fresh data
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is called from Vercel Cron (optional security check)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow manual calls in development or when CRON_SECRET is not set
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Refresh prices before generating PDF to ensure fresh data
    console.log('[Snapshot] Refreshing prices before PDF generation...');
    const allCompanies = await findAllCompanies();
    const refreshPromises = allCompanies.map(async (company) => {
      try {
        const price = await getPrice(company.ticker);
        if (price !== null) {
          await updateCompanyPrice(company.ticker, price);
          console.log(`[Snapshot] Updated ${company.ticker}: $${price}`);
        }
      } catch (error) {
        console.error(`[Snapshot] Error refreshing price for ${company.ticker}:`, error);
      }
    });
    await Promise.all(refreshPromises);
    console.log('[Snapshot] Price refresh completed');

    // Get today's date in ET timezone for the snapshot
    // The cron runs at 8:00 AM ET, so we use today's date
    const now = new Date();
    // Use Intl.DateTimeFormat to properly get date components in ET timezone
    const etDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const snapshotDate = `${etDateParts.find(p => p.type === 'year')?.value}-${etDateParts.find(p => p.type === 'month')?.value}-${etDateParts.find(p => p.type === 'day')?.value}`;

    // Check if snapshot already exists for today
    const existing = await sql`
      SELECT id FROM dashboard_snapshots WHERE snapshot_date = ${snapshotDate}
    `;

    if (existing.rows.length > 0) {
      return res.json({ message: 'Snapshot already exists for today', snapshotDate });
    }

    // Fetch all companies with estimates and IRR calculations
    const companies = await findAllCompanies();
    const enrichedCompanies = await Promise.all(
      companies.map(async (company) => {
        const estimates = await findEstimatesByCompanyId(company.id!, company.metric_type);
        const exitMultiples = await findExitMultiplesByCompanyId(company.id!, 5);
        const exitMultiple = exitMultiples.length > 0 ? exitMultiples[0].multiple : null;

        let irr: number | null = null;
        if (exitMultiple && hasSufficientDataForIRR(company, estimates)) {
          irr = calculate5YearIRR(company, estimates, exitMultiple);
        }

        return {
          ...company,
          estimates,
          exit_multiple_5yr: exitMultiple,
          irr_5yr: irr,
        };
      })
    );

    // Generate PDF directly from data (faster than HTML-to-PDF)
    // Pass the actual creation time to show in PDF
    const actualTime = new Date();
    const pdfBuffer = await generatePDFFromData(enrichedCompanies, snapshotDate, actualTime);

    // Upload PDF to Vercel Blob Storage
    const blob = await put(`snapshots/${snapshotDate}.pdf`, pdfBuffer, {
      access: 'public',
      contentType: 'application/pdf',
    });

    // Store snapshot metadata in database
    await sql`
      INSERT INTO dashboard_snapshots (snapshot_date, pdf_url)
      VALUES (${snapshotDate}, ${blob.url})
      ON CONFLICT (snapshot_date) DO NOTHING
    `;

    return res.json({
      success: true,
      snapshotDate,
      pdfUrl: blob.url,
    });
  } catch (error: any) {
    console.error('Error generating snapshot:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate snapshot',
    });
  }
}

async function generatePDFFromData(companies: any[], date: string, createdAt: Date): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const sortedCompanies = [...companies].sort((a, b) => {
        const aIRR = a.irr_5yr ?? -Infinity;
        const bIRR = b.irr_5yr ?? -Infinity;
        return bIRR - aIRR;
      });

      const formatPercentage = (val: number | null) => {
        if (val === null || val === undefined) return '—';
        return `${(val * 100).toFixed(1)}%`;
      };

      const formatPrice = (val: number | null) => {
        if (val === null || val === undefined) return '—';
        return `$${val.toFixed(2)}`;
      };

      const formatMultiple = (val: number | null) => {
        if (val === null || val === undefined) return '—';
        return `${val.toFixed(1)}x`;
      };

      const formatDate = (dateStr: string | Date | null | undefined) => {
        if (!dateStr) return '—';
        // Handle Date objects by converting to ISO string
        const dateString = dateStr instanceof Date ? dateStr.toISOString() : String(dateStr);
        // Extract just the date part (YYYY-MM-DD) to avoid timezone issues with DATE types
        const datePart = dateString.split('T')[0]; // Get YYYY-MM-DD
        const [year, month, day] = datePart.split('-').map(Number);
        // Format directly without timezone to preserve the date as stored
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[month - 1]} ${day}, ${year}`;
      };

      // PDF margin: 0.1 inch = 7.2 points (72 points per inch) - DO NOT CHANGE
      // PDFKit margin: single number applies uniformly to all sides
      const PDF_MARGIN = 7.2;
      const doc = new PDFDocument({ margin: PDF_MARGIN, size: 'LETTER' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Get the actual margin values from PDFKit (they're set after document creation)
      // PDFKit's margin affects automatic text flow, but explicit coordinates are absolute from page edge
      const leftMargin = doc.page.margins.left;
      const topMargin = doc.page.margins.top;
      
      // Header - use explicit coordinates to match table positioning exactly
      // Start at the actual left margin position
      doc.fontSize(20).fillColor('black').text('Platinum List | IRR Tracker', leftMargin, topMargin);
      // Format the actual creation time in ET - use toLocaleTimeString directly on the Date object
      const timeStr = createdAt.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        timeZone: 'America/New_York',
        hour12: true 
      });
      doc.fontSize(10).fillColor('#666666').text(`Dashboard Snapshot @ ${timeStr} ET on ${date}`, leftMargin, doc.y);
      doc.moveDown(2);

      // Column positions - use the actual left margin from the document to ensure alignment
      // All explicit coordinates are absolute from page edge (0,0 is top-left)
      const colTicker = leftMargin;
      const colCompany = leftMargin + 62;   // Ticker column width = 62
      const colReturn = colCompany + 154;   // Company column width = 154
      const colPrice = colReturn + 45;    // 5Y Return column width = 45
      const colExit = colPrice + 55;     // Price column width = 55
      const colAnalyst = colExit + 130;  // Exit Multiple column width = 130
      const PAGE_WIDTH = 612; // Letter size page width in points
      const rightMargin = doc.page.margins.right;
      const rightEdge = PAGE_WIDTH - rightMargin;  // Page width minus actual right margin
      const colUpdated = colAnalyst + 40;  // Analyst column width = 40
      const updatedWidth = rightEdge - colUpdated;  // Use remaining space for Updated column

      // Table headers
      doc.fontSize(9).fillColor('black').font('Helvetica-Bold');
      const headerY = doc.y;
      doc.text('Ticker', colTicker, headerY, { width: 63 });
      doc.text('Company', colCompany, headerY, { width: 147 });
      doc.text('5Y Return', colReturn, headerY, { align: 'center', width: 45 });
      doc.text('Price', colPrice, headerY, { align: 'center', width: 55 });
      doc.text('Exit Multiple', colExit, headerY, { align: 'center', width: 130 });
      doc.text('Analyst', colAnalyst, headerY, { align: 'center', width: 40 });
      doc.text('Updated', colUpdated, headerY, { align: 'right', width: updatedWidth });

      // Draw header line
      doc.moveTo(colTicker, headerY + 15).lineTo(rightEdge, headerY + 15).stroke();
      doc.y = headerY + 18;

      // Table rows
      doc.font('Helvetica').fontSize(9);
      sortedCompanies.forEach((company, index) => {
        // Check if we need a new page
        if (doc.y > 750) {
          doc.addPage();
          // Redraw headers on new page
          const newHeaderY = doc.y;
          doc.font('Helvetica-Bold').fontSize(9);
          doc.text('Ticker', colTicker, newHeaderY, { width: 68 });
          doc.text('Company', colCompany, newHeaderY, { width: 155 });
          doc.text('5Y Return', colReturn, newHeaderY, { align: 'center', width: 45 });
          doc.text('Price', colPrice, newHeaderY, { align: 'center', width: 55 });
          doc.text('Exit Multiple', colExit, newHeaderY, { align: 'center', width: 130 });
          doc.text('Analyst', colAnalyst, newHeaderY, { align: 'center', width: 40 });
          doc.text('Updated', colUpdated, newHeaderY, { align: 'right', width: updatedWidth });
          doc.moveTo(colTicker, newHeaderY + 15).lineTo(rightEdge, newHeaderY + 15).stroke();
          doc.y = newHeaderY + 18;
          doc.font('Helvetica');
        }

        const y = doc.y;

        // Alternate row background (subtle)
        if (index % 2 === 0) {
          doc.rect(colTicker, y - 6, rightEdge - colTicker, 18).fillColor('#f5f5f5').fill().fillColor('black');
        }

        doc.fontSize(9);
        doc.text(company.ticker || '—', colTicker, y, { width: 63 });
        doc.text((company.company_name || '—').substring(0, 30), colCompany, y, { width: 147 });
        doc.text(formatPercentage(company.irr_5yr), colReturn, y, { align: 'center', width: 45 });
        doc.text(formatPrice(company.current_stock_price), colPrice, y, { align: 'center', width: 55 });
        const exitMultipleText = `${formatMultiple(company.exit_multiple_5yr)}${company.exit_multiple_5yr ? ` (${company.metric_type})` : ''}`;
        doc.text(exitMultipleText, colExit, y, { align: 'center', width: 130 });
        doc.text(company.analyst_initials || '—', colAnalyst, y, { align: 'center', width: 40 });
        doc.text(formatDate(company.updated_at), colUpdated, y, { align: 'right', width: updatedWidth });

        doc.y = y + 18;
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
