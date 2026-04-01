import { sql } from '@vercel/postgres';

// Re-export sql for direct queries
export { sql };

// Type definitions
export type MetricType = 'GAAP EPS' | 'Norm. EPS' | 'Mgmt. EPS' | 'FCFPS' | 'DEPS' | 'NAVPS' | 'BVPS' | 'DPS' | 'Other';
export type Scenario = 'base' | 'bull' | 'bear';
export type AnalystInitials = 'EY' | 'TR' | 'JM' | 'BB' | 'NM';

export interface Company {
  id?: number;
  ticker: string;
  company_name: string;
  fiscal_year_end_date: string; // Date string (YYYY-MM-DD)
  metric_type: MetricType;
  current_stock_price: number | null;
  price_last_updated: string | null;
  scenario: Scenario;
  analyst_initials: AnalystInitials;
  created_at?: string;
  updated_at?: string;
}

export interface Estimate {
  id?: number;
  company_id: number;
  fiscal_year: number; // Absolute year (e.g., 2026, 2027)
  metric_type: MetricType;
  metric_value: number | null;
  dividend_value: number | null;
  ma_value: number | null;
  created_at?: string;
  updated_at?: string;
}

// Company with estimates attached (for API responses)
export interface CompanyWithEstimates extends Company {
  estimates: Estimate[];
}

export interface ExitMultiple {
  id?: number;
  company_id: number;
  time_horizon_years: number;
  multiple: number;
  created_at?: string;
  updated_at?: string;
}

export interface SubmissionLog {
  id?: number;
  company_id: number;
  analyst_initials: AnalystInitials;
  submitted_at?: string;
  snapshot_data: string;
}

// Utility to convert database row to proper types
export function parseCompanyRow(row: any): Company {
  return {
    ...row,
    fiscal_year_end_date: row.fiscal_year_end_date instanceof Date 
      ? row.fiscal_year_end_date.toISOString().split('T')[0]
      : row.fiscal_year_end_date,
    current_stock_price: row.current_stock_price ? Number(row.current_stock_price) : null,
  };
}

export function parseEstimateRow(row: any): Estimate {
  return {
    ...row,
    fiscal_year: Number(row.fiscal_year),
    metric_type: row.metric_type,
    metric_value: row.metric_value ? Number(row.metric_value) : null,
    dividend_value: row.dividend_value ? Number(row.dividend_value) : null,
    ma_value: row.ma_value ? Number(row.ma_value) : null,
  };
}

export function parseExitMultipleRow(row: any): ExitMultiple {
  return {
    ...row,
    multiple: row.multiple ? Number(row.multiple) : 0,
  };
}
