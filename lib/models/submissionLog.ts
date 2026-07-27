import { sql, SubmissionLog, AnalystInitials, SqlFn } from '../db.js';

function parseSubmissionLogRow(row: any): SubmissionLog {
  return {
    ...row,
    snapshot_data: typeof row.snapshot_data === 'string'
      ? row.snapshot_data
      : JSON.stringify(row.snapshot_data),
  };
}

export async function createSubmissionLog(data: {
  company_id: number;
  analyst_initials: AnalystInitials;
  snapshot_data: string;
}, q: SqlFn = sql): Promise<SubmissionLog> {
  const { rows } = await q`
    INSERT INTO submission_logs (company_id, analyst_initials, snapshot_data)
    VALUES (${data.company_id}, ${data.analyst_initials}, ${data.snapshot_data}::jsonb)
    RETURNING *
  `;
  return parseSubmissionLogRow(rows[0]);
}

export async function findSubmissionLogsByCompanyId(companyId: number): Promise<SubmissionLog[]> {
  const { rows } = await sql`
    SELECT * FROM submission_logs
    WHERE company_id = ${companyId}
    ORDER BY submitted_at DESC
  `;
  return rows.map(parseSubmissionLogRow);
}

export async function findLatestSubmissionLogByCompanyId(companyId: number, q: SqlFn = sql): Promise<SubmissionLog | null> {
  const { rows } = await q`
    SELECT * FROM submission_logs
    WHERE company_id = ${companyId}
    ORDER BY submitted_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return parseSubmissionLogRow(rows[0]);
}

export async function findAllSubmissionLogs(): Promise<SubmissionLog[]> {
  const { rows } = await sql`
    SELECT * FROM submission_logs
    ORDER BY submitted_at DESC
  `;
  return rows.map(parseSubmissionLogRow);
}

export async function updateSubmissionLog(id: number, data: {
  analyst_initials: AnalystInitials;
  snapshot_data: string;
}, q: SqlFn = sql): Promise<SubmissionLog> {
  const { rows } = await q`
    UPDATE submission_logs
    SET analyst_initials = ${data.analyst_initials},
        snapshot_data = ${data.snapshot_data}::jsonb,
        submitted_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;
  return parseSubmissionLogRow(rows[0]);
}

