-- PostgreSQL Schema for Platinum List App
-- Run this against your Vercel Postgres database

-- Company table
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  fiscal_year_end_date DATE NOT NULL,
  metric_type VARCHAR(30) NOT NULL CHECK(metric_type IN ('GAAP EPS', 'Norm. EPS', 'Mgmt. EPS', 'FCFPS', 'DEPS', 'NAVPS', 'BVPS', 'DPS', 'Other')),
  current_stock_price DECIMAL(12,4),
  price_last_updated TIMESTAMPTZ,
  scenario VARCHAR(10) NOT NULL DEFAULT 'base' CHECK(scenario IN ('base', 'bull', 'bear')),
  analyst_initials VARCHAR(5) NOT NULL CHECK(analyst_initials IN ('EY', 'TR', 'JM', 'BB', 'NM')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Estimates table - stores metrics and dividends by absolute fiscal year and metric type
-- Each company can have multiple metric types (EPS, FCFPS, etc.) stored independently
CREATE TABLE IF NOT EXISTS estimates (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  metric_type VARCHAR(30) NOT NULL CHECK(metric_type IN ('GAAP EPS', 'Norm. EPS', 'Mgmt. EPS', 'FCFPS', 'DEPS', 'NAVPS', 'BVPS', 'DPS', 'Other')),
  metric_value DECIMAL(12,4),
  dividend_value DECIMAL(12,4),
  ma_value DECIMAL(12,4),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, fiscal_year, metric_type)
);

-- Exit Multiples table
CREATE TABLE IF NOT EXISTS exit_multiples (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  time_horizon_years INTEGER NOT NULL,
  multiple DECIMAL(8,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, time_horizon_years)
);

-- Submission Log table
CREATE TABLE IF NOT EXISTS submission_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  analyst_initials VARCHAR(5) NOT NULL CHECK(analyst_initials IN ('EY', 'TR', 'JM', 'BB', 'NM')),
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  snapshot_data JSONB NOT NULL
);

-- Change Logs table (tracks edits and deletions)
CREATE TABLE IF NOT EXISTS change_logs (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  company_name TEXT NOT NULL,
  change_type VARCHAR(20) NOT NULL CHECK(change_type IN ('edit', 'deletion')),
  analyst_initials VARCHAR(5) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  before_snapshot JSONB,           -- Used for edits (before state)
  after_snapshot JSONB,            -- Used for edits (after state)
  snapshot_data JSONB              -- Used for deletions (deleted state)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_ticker ON companies(ticker);
CREATE INDEX IF NOT EXISTS idx_companies_updated_at ON companies(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_company_id ON estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_fiscal_year ON estimates(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_estimates_metric_type ON estimates(metric_type);
CREATE INDEX IF NOT EXISTS idx_exit_multiples_company_id ON exit_multiples(company_id);
CREATE INDEX IF NOT EXISTS idx_submission_logs_company_id ON submission_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_submission_logs_submitted_at ON submission_logs(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_at ON change_logs(changed_at DESC);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for auto-updating timestamps
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_estimates_updated_at ON estimates;
CREATE TRIGGER update_estimates_updated_at
    BEFORE UPDATE ON estimates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_exit_multiples_updated_at ON exit_multiples;
CREATE TRIGGER update_exit_multiples_updated_at
    BEFORE UPDATE ON exit_multiples
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

