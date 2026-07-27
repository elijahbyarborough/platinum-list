/**
 * Fiscal Year utilities for handling fiscal year calculations.
 *
 * This is the single source of truth, used by BOTH the serverless API and the
 * browser bundle (src/utils/fiscalYear.ts re-exports it). Keep it free of
 * imports from lib/db.ts or anything Node-specific.
 */

// Structural type satisfied by both the DB Estimate row and the form's estimate data
export interface EstimateLike {
  fiscal_year: number;
  metric_value: number | null;
  dividend_value: number | null;
  ma_value?: number | null;
}

/**
 * Parse a YYYY-MM-DD date string as LOCAL midnight.
 * `new Date('YYYY-MM-DD')` parses as UTC midnight, so reading it back with
 * local getters (getMonth/getDate) shifts the date back a day anywhere west of
 * UTC — which silently moved fiscal-year-end dates. Never mix the two.
 */
export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get the current fiscal year based on fiscal year end date
 * @param fiscalYearEndDate - Date string (YYYY-MM-DD) when fiscal year ends
 * @returns The current fiscal year number
 */
export function getCurrentFiscalYear(fiscalYearEndDate: string): number {
  return getFiscalYearForDate(new Date(), fiscalYearEndDate);
}

/**
 * Calculate the year fraction remaining in the current fiscal year
 * @param fiscalYearEndDate - Date string (YYYY-MM-DD) when fiscal year ends
 * @returns Year fraction (0-1), where 1.0 = start of fiscal year, 0.0 = end of fiscal year
 */
export function calculateYearFraction(fiscalYearEndDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const fye = parseDateOnly(fiscalYearEndDate);

  // Create this year's and next year's FYE dates
  let targetFYE = new Date(today.getFullYear(), fye.getMonth(), fye.getDate());

  // If we've passed this year's FYE, use next year's
  if (today > targetFYE) {
    targetFYE = new Date(today.getFullYear() + 1, fye.getMonth(), fye.getDate());
  }

  const daysUntilFYE = Math.ceil((targetFYE.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Normalize to 0-1 range (365 days in a year)
  return Math.max(0, Math.min(1, daysUntilFYE / 365));
}

/**
 * Get metric value for a specific fiscal year from estimates array
 */
export function getMetricForYear(estimates: EstimateLike[], fiscalYear: number): number | null {
  const estimate = estimates.find(e => e.fiscal_year === fiscalYear);
  return estimate?.metric_value ?? null;
}

/**
 * Get dividend value for a specific fiscal year from estimates array
 */
export function getDividendForYear(estimates: EstimateLike[], fiscalYear: number): number | null {
  const estimate = estimates.find(e => e.fiscal_year === fiscalYear);
  return estimate?.dividend_value ?? null;
}

/**
 * Get M&A value per share for a specific fiscal year from estimates array
 */
export function getMaValueForYear(estimates: EstimateLike[], fiscalYear: number): number | null {
  const estimate = estimates.find(e => e.fiscal_year === fiscalYear);
  return estimate?.ma_value ?? null;
}

/**
 * Get the fiscal year for a specific date
 * @param date - The date to check
 * @param fiscalYearEndDate - Date string (YYYY-MM-DD) when fiscal year ends
 * @returns The fiscal year number for that date
 */
export function getFiscalYearForDate(date: Date, fiscalYearEndDate: string): number {
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  const fye = parseDateOnly(fiscalYearEndDate);

  // Create the FYE date in the same year as the check date
  const fyeThisYear = new Date(checkDate.getFullYear(), fye.getMonth(), fye.getDate());

  // If we've passed this year's FYE, we're in the next fiscal year
  if (checkDate > fyeThisYear) {
    return checkDate.getFullYear() + 1;
  }

  return checkDate.getFullYear();
}

/**
 * Calculate the year fraction for a specific date within its fiscal year
 * @param date - The date to check
 * @param fiscalYearEndDate - Date string (YYYY-MM-DD) when fiscal year ends
 * @returns Year fraction (0-1), where 1.0 = start of fiscal year, 0.0 = end of fiscal year
 */
export function calculateYearFractionForDate(date: Date, fiscalYearEndDate: string): number {
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  const fye = parseDateOnly(fiscalYearEndDate);

  // Get the fiscal year for this date
  const fiscalYear = getFiscalYearForDate(checkDate, fiscalYearEndDate);

  // Calculate the start of this fiscal year (day after previous FYE)
  const fiscalYearStart = new Date(fiscalYear - 1, fye.getMonth(), fye.getDate());
  fiscalYearStart.setDate(fiscalYearStart.getDate() + 1); // Day after FYE = start of new FY
  fiscalYearStart.setHours(0, 0, 0, 0);

  // Calculate the end of this fiscal year (start of next fiscal year, which is the day after this FYE)
  // This ensures msInYear represents the full 365/366 days
  const fiscalYearEnd = new Date(fiscalYear, fye.getMonth(), fye.getDate());
  fiscalYearEnd.setDate(fiscalYearEnd.getDate() + 1); // Day after FYE = start of next FY
  fiscalYearEnd.setHours(0, 0, 0, 0);

  // Calculate exact days from start of FY to check date (as a fraction)
  const msFromStart = checkDate.getTime() - fiscalYearStart.getTime();
  const msInYear = fiscalYearEnd.getTime() - fiscalYearStart.getTime();

  // Calculate fraction of year elapsed (0.0 = start of year, 1.0 = end of year)
  const fractionElapsed = msFromStart / msInYear;

  // Return fraction remaining (1.0 = start of year, 0.0 = end of year)
  // This accounts for leap years automatically since msInYear will be different
  return Math.max(0, Math.min(1, 1 - fractionElapsed));
}

/**
 * Generate an array of fiscal years starting from a base year
 */
export function generateFiscalYears(startYear: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => startYear + i);
}

/**
 * Fiscal years for the estimates table, starting from the current fiscal year
 */
export function getFiscalYears(fiscalYearEndDate: string, count: number = 8): number[] {
  return generateFiscalYears(getCurrentFiscalYear(fiscalYearEndDate), count);
}

/**
 * Fiscal year display labels, e.g. "FY 2026"
 */
export function getFiscalYearLabels(fiscalYearEndDate: string, count: number = 8): string[] {
  return getFiscalYears(fiscalYearEndDate, count).map(year => `FY ${year}`);
}
