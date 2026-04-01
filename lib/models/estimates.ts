import { sql, parseEstimateRow, Estimate, MetricType } from '../db.js';

/**
 * Find all estimates for a company, optionally filtered by metric type.
 * If metricType is provided, returns only estimates for that metric.
 * If not provided, returns all estimates for the company (all metric types).
 */
export async function findEstimatesByCompanyId(
  companyId: number,
  metricType?: MetricType
): Promise<Estimate[]> {
  if (metricType) {
    const { rows } = await sql`
      SELECT * FROM estimates
      WHERE company_id = ${companyId} AND metric_type = ${metricType}
      ORDER BY fiscal_year ASC
    `;
    return rows.map(parseEstimateRow);
  } else {
    const { rows } = await sql`
      SELECT * FROM estimates
      WHERE company_id = ${companyId}
      ORDER BY fiscal_year ASC
    `;
    return rows.map(parseEstimateRow);
  }
}

/**
 * Find a specific estimate by company, fiscal year, and metric type.
 */
export async function findEstimate(
  companyId: number,
  fiscalYear: number,
  metricType: MetricType
): Promise<Estimate | null> {
  const { rows } = await sql`
    SELECT * FROM estimates
    WHERE company_id = ${companyId} AND fiscal_year = ${fiscalYear} AND metric_type = ${metricType}
  `;
  return rows.length > 0 ? parseEstimateRow(rows[0]) : null;
}

/**
 * Insert or update an estimate. The unique key is (company_id, fiscal_year, metric_type).
 * This means different metric types can have their own estimates for the same fiscal year.
 */
export async function upsertEstimate(
  companyId: number,
  fiscalYear: number,
  metricType: MetricType,
  metricValue: number | null,
  dividendValue: number | null,
  maValue: number | null = null
): Promise<Estimate> {
  const { rows } = await sql`
    INSERT INTO estimates (company_id, fiscal_year, metric_type, metric_value, dividend_value, ma_value)
    VALUES (${companyId}, ${fiscalYear}, ${metricType}, ${metricValue}, ${dividendValue}, ${maValue})
    ON CONFLICT (company_id, fiscal_year, metric_type)
    DO UPDATE SET
      metric_value = ${metricValue},
      dividend_value = ${dividendValue},
      ma_value = ${maValue},
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  return parseEstimateRow(rows[0]);
}

/**
 * Upsert multiple estimates for a company with a specific metric type.
 * Old estimates for other metric types are NOT touched.
 */
export async function upsertEstimates(
  companyId: number,
  metricType: MetricType,
  estimates: { fiscal_year: number; metric_value: number | null; dividend_value: number | null; ma_value?: number | null }[]
): Promise<Estimate[]> {
  const results: Estimate[] = [];

  for (const est of estimates) {
    // Only upsert if there's actual data
    if (est.metric_value !== null || est.dividend_value !== null || est.ma_value !== null) {
      const result = await upsertEstimate(
        companyId,
        est.fiscal_year,
        metricType,
        est.metric_value,
        est.dividend_value,
        est.ma_value ?? null
      );
      results.push(result);
    }
  }
  
  return results;
}

/**
 * Delete a specific estimate by company, fiscal year, and metric type.
 */
export async function deleteEstimate(
  companyId: number,
  fiscalYear: number,
  metricType: MetricType
): Promise<void> {
  await sql`
    DELETE FROM estimates
    WHERE company_id = ${companyId} AND fiscal_year = ${fiscalYear} AND metric_type = ${metricType}
  `;
}

/**
 * Delete all estimates for a company with a specific metric type.
 * If metricType is not provided, deletes ALL estimates for the company.
 */
export async function deleteAllEstimatesForCompany(
  companyId: number,
  metricType?: MetricType
): Promise<void> {
  if (metricType) {
    await sql`
      DELETE FROM estimates 
      WHERE company_id = ${companyId} AND metric_type = ${metricType}
    `;
  } else {
    await sql`
      DELETE FROM estimates WHERE company_id = ${companyId}
    `;
  }
}

