import { sql, parseExitMultipleRow, ExitMultiple, SqlFn } from '../db.js';

export async function findExitMultiplesByCompanyId(
  companyId: number,
  timeHorizon?: number,
  q: SqlFn = sql
): Promise<ExitMultiple[]> {
  if (timeHorizon !== undefined) {
    const { rows } = await q`
      SELECT * FROM exit_multiples
      WHERE company_id = ${companyId} AND time_horizon_years = ${timeHorizon}
    `;
    return rows.map(parseExitMultipleRow);
  }

  const { rows } = await sql`
    SELECT * FROM exit_multiples
    WHERE company_id = ${companyId}
    ORDER BY time_horizon_years
  `;
  return rows.map(parseExitMultipleRow);
}

export async function upsertExitMultiple(data: ExitMultiple, q: SqlFn = sql): Promise<ExitMultiple> {
  const { rows } = await q`
    INSERT INTO exit_multiples (company_id, time_horizon_years, multiple)
    VALUES (${data.company_id}, ${data.time_horizon_years}, ${data.multiple})
    ON CONFLICT (company_id, time_horizon_years)
    DO UPDATE SET multiple = EXCLUDED.multiple, updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  return parseExitMultipleRow(rows[0]);
}

export async function deleteExitMultiplesByCompanyId(companyId: number): Promise<void> {
  await sql`DELETE FROM exit_multiples WHERE company_id = ${companyId}`;
}

export async function deleteExitMultiple(
  companyId: number,
  timeHorizon: number,
  q: SqlFn = sql
): Promise<void> {
  await q`
    DELETE FROM exit_multiples
    WHERE company_id = ${companyId} AND time_horizon_years = ${timeHorizon}
  `;
}

