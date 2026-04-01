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
  metric_value: number | null;
  dividend_value: number | null;
  ma_value: number | null;
  created_at?: string;
  updated_at?: string;
}

// Company with estimates attached (for API responses)
export interface CompanyWithEstimates extends Company {
  estimates: Estimate[];
  // Computed fields
  exit_multiple_5yr?: number | null;
  irr_5yr?: number | null;
}

// Estimate data for form inputs (without company_id)
export interface EstimateFormData {
  fiscal_year: number;
  metric_value: number | null;
  dividend_value: number | null;
  ma_value: number | null;
}

export interface CompanyFormData {
  ticker: string;
  company_name: string;
  fiscal_year_end_date: string;
  metric_type: MetricType;
  analyst_initials: AnalystInitials;
  exit_multiple_5yr: number | null;
  estimates: EstimateFormData[];
  override_updated_at?: string | null; // Optional override for updated_at date (for Excel imports)
}
