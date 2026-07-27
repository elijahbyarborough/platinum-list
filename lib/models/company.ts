import { sql, parseCompanyRow, Company, SqlFn } from '../db.js';

export async function findAllCompanies(): Promise<Company[]> {
  // Only return companies that have at least one submission log entry
  const { rows } = await sql`
    SELECT DISTINCT c.*
    FROM companies c
    INNER JOIN submission_logs sl ON c.id = sl.company_id
    ORDER BY c.updated_at DESC
  `;
  return rows.map(parseCompanyRow);
}

export async function findCompanyByTicker(ticker: string): Promise<Company | null> {
  const { rows } = await sql`
    SELECT * FROM companies WHERE ticker = ${ticker}
  `;
  return rows.length > 0 ? parseCompanyRow(rows[0]) : null;
}

export async function findCompanyById(id: number): Promise<Company | null> {
  const { rows } = await sql`
    SELECT * FROM companies WHERE id = ${id}
  `;
  return rows.length > 0 ? parseCompanyRow(rows[0]) : null;
}

/**
 * Atomic upsert keyed on ticker for the submission flow. Sets updated_at
 * explicitly (there is deliberately no updated_at trigger on companies — see
 * updateCompanyPrice) to overrideUpdatedAt if given, otherwise now.
 */
export async function upsertCompanyForSubmission(
  tx: SqlFn,
  data: Omit<Company, 'id' | 'created_at' | 'updated_at'>,
  overrideUpdatedAt: string | null = null
): Promise<Company> {
  const { rows } = await tx`
    INSERT INTO companies (
      ticker, company_name, fiscal_year_end_date, metric_type,
      current_stock_price, price_last_updated, scenario, analyst_initials, updated_at
    ) VALUES (
      ${data.ticker}, ${data.company_name}, ${data.fiscal_year_end_date}, ${data.metric_type},
      ${data.current_stock_price}, ${data.price_last_updated}, ${data.scenario}, ${data.analyst_initials},
      COALESCE(${overrideUpdatedAt}::timestamptz, CURRENT_TIMESTAMP)
    )
    ON CONFLICT (ticker) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      fiscal_year_end_date = EXCLUDED.fiscal_year_end_date,
      metric_type = EXCLUDED.metric_type,
      current_stock_price = EXCLUDED.current_stock_price,
      price_last_updated = EXCLUDED.price_last_updated,
      scenario = EXCLUDED.scenario,
      analyst_initials = EXCLUDED.analyst_initials,
      updated_at = EXCLUDED.updated_at
    RETURNING *
  `;
  return parseCompanyRow(rows[0]);
}

// Deliberately does NOT touch updated_at: that column means "last analyst
// submission" and drives the dashboard sort and the PDF's Updated column,
// while this runs from a twice-daily price cron.
export async function updateCompanyPrice(ticker: string, price: number): Promise<void> {
  await sql`
    UPDATE companies
    SET current_stock_price = ${price}, price_last_updated = CURRENT_TIMESTAMP
    WHERE ticker = ${ticker}
  `;
}
