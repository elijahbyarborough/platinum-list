import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withTransaction } from '../../lib/db.js';
import { findAllCompanies, findCompanyByTicker, upsertCompanyForSubmission } from '../../lib/models/company.js';
import { findEstimatesByCompanyId, replaceEstimates, deleteAllEstimatesForCompany } from '../../lib/models/estimates.js';
import { findExitMultiplesByCompanyId, upsertExitMultiple, deleteExitMultiple } from '../../lib/models/exitMultiple.js';
import { createSubmissionLog, findLatestSubmissionLogByCompanyId, updateSubmissionLog } from '../../lib/models/submissionLog.js';
import { calculate5YearIRR, hasSufficientDataForIRR } from '../../lib/utils/irrCalculator.js';
import { requireAuth } from '../../lib/auth.js';

const METRIC_TYPES = ['GAAP EPS', 'Norm. EPS', 'Mgmt. EPS', 'FCFPS', 'DEPS', 'NAVPS', 'BVPS', 'DPS', 'Other'];
const ANALYST_INITIALS = ['EY', 'TR', 'JM', 'BB', 'NM', 'RM']; // JM and BB are legacy: valid in the DB, hidden from the dropdown
const SCENARIOS = ['base', 'bull', 'bear'];

function isNumberOrNull(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/** Returns an error message, or null if the payload is valid. Normalizes ticker in place. */
function validateSubmission(data: any): string | null {
  if (typeof data?.ticker !== 'string') return 'ticker must be a string';
  data.ticker = data.ticker.toUpperCase().trim();
  if (!/^[A-Z0-9.\-]{1,10}$/.test(data.ticker)) return 'ticker must be 1-10 characters (letters, digits, . or -)';
  if (typeof data.company_name !== 'string' || !data.company_name.trim() || data.company_name.length > 255) {
    return 'company_name must be a non-empty string (max 255 chars)';
  }
  if (typeof data.fiscal_year_end_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.fiscal_year_end_date)) {
    return 'fiscal_year_end_date must be a YYYY-MM-DD string';
  }
  if (!METRIC_TYPES.includes(data.metric_type)) return `metric_type must be one of: ${METRIC_TYPES.join(', ')}`;
  if (!ANALYST_INITIALS.includes(data.analyst_initials)) return `analyst_initials must be one of: ${ANALYST_INITIALS.join(', ')}`;
  if (data.scenario !== undefined && data.scenario !== null && !SCENARIOS.includes(data.scenario)) {
    return `scenario must be one of: ${SCENARIOS.join(', ')}`;
  }
  if (!isNumberOrNull(data.exit_multiple_5yr)) return 'exit_multiple_5yr must be a number or null';
  if (!isNumberOrNull(data.current_stock_price)) return 'current_stock_price must be a number or null';
  if (data.override_updated_at !== undefined && data.override_updated_at !== null) {
    if (typeof data.override_updated_at !== 'string' || Number.isNaN(Date.parse(data.override_updated_at))) {
      return 'override_updated_at must be a valid date string or null';
    }
  }
  if (data.estimates !== undefined) {
    if (!Array.isArray(data.estimates)) return 'estimates must be an array';
    for (const est of data.estimates) {
      if (!Number.isInteger(est?.fiscal_year) || est.fiscal_year < 1900 || est.fiscal_year > 2200) {
        return 'each estimate needs an integer fiscal_year';
      }
      if (!isNumberOrNull(est.metric_value) || !isNumberOrNull(est.dividend_value) || !isNumberOrNull(est.ma_value)) {
        return 'estimate values must be numbers or null';
      }
    }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      // GET /api/companies - Get all companies with estimates and IRR
      const companies = await findAllCompanies();

      if (companies.length === 0) {
        return res.json([]);
      }

      // Enrich each company with estimates, exit multiples, and IRR
      const enrichedCompanies = await Promise.all(
        companies.map(async (company) => {
          // Fetch estimates for the company's ACTIVE metric type only
          const estimates = await findEstimatesByCompanyId(company.id!, company.metric_type);

          // Fetch exit multiples
          const exitMultiples = await findExitMultiplesByCompanyId(company.id!, 5);
          const exitMultiple = exitMultiples.length > 0 ? exitMultiples[0].multiple : null;

          // Calculate IRR if we have sufficient data
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

      return res.json(enrichedCompanies);
    }

    if (req.method === 'POST') {
      // POST /api/companies - Create or update company (upsert by ticker)
      const data = req.body;

      const validationError = validateSubmission(data);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      // Check if company already exists
      const existingCompany = await findCompanyByTicker(data.ticker);

      // isEdit is explicitly passed from the frontend:
      // - true when user is on /edit/:ticker page (editing an existing submission)
      // - false when user is on /submit page (new submission, even if company exists)
      const isEdit = data.isEdit === true;

      // For edits, get the original submission price from the snapshot (not the refreshed price)
      let originalSubmissionPrice: number | null = null;
      let originalPriceTimestamp: string | null = null;
      if (isEdit && existingCompany) {
        const existingLog = await findLatestSubmissionLogByCompanyId(existingCompany.id!);
        if (existingLog) {
          const snapshot = typeof existingLog.snapshot_data === 'string'
            ? JSON.parse(existingLog.snapshot_data)
            : existingLog.snapshot_data;
          originalSubmissionPrice = snapshot.current_stock_price ?? null;
          originalPriceTimestamp = snapshot.price_last_updated ?? null;
        }
      }

      const exitMultipleValue = data.exit_multiple_5yr ?? null;
      const estimatesData = data.estimates || [];
      const overrideUpdatedAt = (!isEdit && data.override_updated_at) || null;

      // Store old metric type before updating (for edit logic)
      const oldMetricType = existingCompany?.metric_type;
      const metricTypeChanged = isEdit && existingCompany && oldMetricType !== data.metric_type;

      // If editing and metric type changed, fetch old estimates before deletion for change log
      let oldEstimates: any[] = [];
      if (metricTypeChanged && oldMetricType && existingCompany?.id) {
        oldEstimates = await findEstimatesByCompanyId(existingCompany.id, oldMetricType);
      }

      // All writes (and the reads that feed the snapshot) happen atomically:
      // a failure anywhere rolls the whole submission back
      const result = await withTransaction(async (tx) => {
        // When editing, preserve the original submission price (locked)
        // When new submission, use the new price from the form
        const company = await upsertCompanyForSubmission(tx, {
          ticker: data.ticker,
          company_name: data.company_name,
          fiscal_year_end_date: data.fiscal_year_end_date,
          metric_type: data.metric_type,
          current_stock_price: (isEdit && existingCompany)
            ? originalSubmissionPrice
            : (data.current_stock_price ?? null),
          price_last_updated: (isEdit && existingCompany)
            ? originalPriceTimestamp
            : (data.price_last_updated ?? null),
          scenario: data.scenario || 'base',
          analyst_initials: data.analyst_initials,
        }, overrideUpdatedAt);

        // If editing and metric type changed, delete the old metric type's estimates.
        // Edits are corrections, not real historical data; the old values remain
        // in change_logs
        if (metricTypeChanged && oldMetricType) {
          await deleteAllEstimatesForCompany(company.id!, oldMetricType, tx);
        }

        // Replace the active metric type's estimates wholesale so cleared years
        // are actually removed. Other metric types' estimates are untouched.
        await replaceEstimates(tx, company.id!, data.metric_type, estimatesData);

        if (exitMultipleValue !== null) {
          await upsertExitMultiple({
            company_id: company.id!,
            time_horizon_years: 5,
            multiple: exitMultipleValue,
          }, tx);
        } else if (isEdit) {
          // Analyst cleared the multiple during an edit — remove it
          await deleteExitMultiple(company.id!, 5, tx);
        }

        // Build the after-snapshot from within the transaction so it sees the writes above
        const estimates = await findEstimatesByCompanyId(company.id!, company.metric_type, tx);
        const exitMultiplesForSnapshot = await findExitMultiplesByCompanyId(company.id!, 5, tx);
        const exitMultipleForSnapshot = exitMultiplesForSnapshot.length > 0 ? exitMultiplesForSnapshot[0].multiple : null;

        let afterIRR: number | null = null;
        if (exitMultipleForSnapshot && hasSufficientDataForIRR(company, estimates)) {
          afterIRR = calculate5YearIRR(company, estimates, exitMultipleForSnapshot);
        }

        const afterSnapshot = {
          ...company,
          estimates,
          exit_multiple_5yr: exitMultipleForSnapshot,
          irr_5yr: afterIRR,
        };
        const snapshotData = JSON.stringify(afterSnapshot);

        if (isEdit && existingCompany) {
          // EDIT MODE: User clicked "Edit" on an existing submission
          // Get the existing log to capture the "before" state
          const existingLog = await findLatestSubmissionLogByCompanyId(company.id!, tx);
          if (existingLog) {
            const beforeSnapshot = typeof existingLog.snapshot_data === 'string'
              ? JSON.parse(existingLog.snapshot_data)
              : existingLog.snapshot_data;

            // If metric type changed during edit, update the before snapshot with the old estimates
            // This ensures the change log shows what was actually in the database before deletion
            if (metricTypeChanged && oldMetricType && oldEstimates.length > 0) {
              beforeSnapshot.metric_type = oldMetricType;
              beforeSnapshot.estimates = oldEstimates;
              // Recalculate IRR with the old estimates
              const oldExitMultiple = beforeSnapshot.exit_multiple_5yr;
              if (oldExitMultiple && hasSufficientDataForIRR(beforeSnapshot, oldEstimates)) {
                beforeSnapshot.irr_5yr = calculate5YearIRR(beforeSnapshot, oldEstimates, oldExitMultiple);
              } else {
                beforeSnapshot.irr_5yr = null;
              }
            } else {
              // Add the original submission timestamp to the before snapshot
              beforeSnapshot.original_submitted_at = existingLog.submitted_at;

              // Calculate IRR for the before state if not already present
              if (beforeSnapshot.irr_5yr === undefined) {
                const beforeEstimates = beforeSnapshot.estimates || [];
                const beforeExitMultiple = beforeSnapshot.exit_multiple_5yr;
                if (beforeExitMultiple && hasSufficientDataForIRR(beforeSnapshot, beforeEstimates)) {
                  beforeSnapshot.irr_5yr = calculate5YearIRR(beforeSnapshot, beforeEstimates, beforeExitMultiple);
                } else {
                  beforeSnapshot.irr_5yr = null;
                }
              }
            }

            // Ensure original_submitted_at is set
            if (!beforeSnapshot.original_submitted_at) {
              beforeSnapshot.original_submitted_at = existingLog.submitted_at;
            }

            // Log the edit to change_logs for history tracking
            const beforeJson = JSON.stringify(beforeSnapshot);

            await tx`
              INSERT INTO change_logs (ticker, company_name, change_type, analyst_initials, before_snapshot, after_snapshot)
              VALUES (${company.ticker}, ${company.company_name}, 'edit', ${data.analyst_initials}, ${beforeJson}::jsonb, ${snapshotData}::jsonb)
            `;

            // Update the existing submission log (replace with new data)
            await updateSubmissionLog(existingLog.id!, {
              analyst_initials: data.analyst_initials,
              snapshot_data: snapshotData,
            }, tx);
          } else {
            // No existing log found (shouldn't happen, but create one just in case)
            await createSubmissionLog({
              company_id: company.id!,
              analyst_initials: data.analyst_initials,
              snapshot_data: snapshotData,
            }, tx);
          }
        } else {
          // NEW SUBMISSION MODE: User submitted from /submit page
          // ALWAYS create a new submission log entry, even if company already existed
          await createSubmissionLog({
            company_id: company.id!,
            analyst_initials: data.analyst_initials,
            snapshot_data: snapshotData,
          }, tx);
        }

        return { company, estimates, exitMultiple: exitMultipleForSnapshot, irr: afterIRR };
      });

      return res.json({
        ...result.company,
        estimates: result.estimates,
        exit_multiple_5yr: result.exitMultiple,
        irr_5yr: result.irr,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    // Log the full error server-side but do not leak DB details to the client
    console.error('Error in /api/companies:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
