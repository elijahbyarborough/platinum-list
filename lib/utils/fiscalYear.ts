/**
 * Fiscal Year utilities for handling fiscal year calculations
 */

import { Estimate } from '../db.js';

/**
 * Get the current fiscal year based on fiscal year end date
 * @param fiscalYearEndDate - Date string (YYYY-MM-DD) when fiscal year ends
 * @returns The current fiscal year number
 */
export function getCurrentFiscalYear(fiscalYearEndDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const fye = new Date(fiscalYearEndDate);
  fye.setHours(0, 0, 0, 0);
  
  // Create this year's FYE date
  const fyeThisYear = new Date(today.getFullYear(), fye.getMonth(), fye.getDate());
  
  // If we've passed this year's FYE, we're in the next fiscal year
  if (today > fyeThisYear) {
    return today.getFullYear() + 1;
  }
  
  return today.getFullYear();
}

/**
 * Calculate the year fraction remaining in the current fiscal year
 * @param fiscalYearEndDate - Date string (YYYY-MM-DD) when fiscal year ends
 * @returns Year fraction (0-1), where 1.0 = start of fiscal year, 0.0 = end of fiscal year
 */
export function calculateYearFraction(fiscalYearEndDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const fye = new Date(fiscalYearEndDate);
  fye.setHours(0, 0, 0, 0);
  
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
 * @param estimates - Array of estimates with fiscal_year, metric_value, dividend_value
 * @param fiscalYear - The fiscal year to look up
 * @returns The metric value or null if not found
 */
export function getMetricForYear(estimates: Estimate[], fiscalYear: number): number | null {
  const estimate = estimates.find(e => e.fiscal_year === fiscalYear);
  return estimate?.metric_value ?? null;
}

/**
 * Get dividend value for a specific fiscal year from estimates array
 * @param estimates - Array of estimates with fiscal_year, metric_value, dividend_value
 * @param fiscalYear - The fiscal year to look up
 * @returns The dividend value or null if not found
 */
export function getDividendForYear(estimates: Estimate[], fiscalYear: number): number | null {
  const estimate = estimates.find(e => e.fiscal_year === fiscalYear);
  return estimate?.dividend_value ?? null;
}

/**
 * Get M&A value per share for a specific fiscal year from estimates array
 */
export function getMaValueForYear(estimates: Estimate[], fiscalYear: number): number | null {
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
  
  const fye = new Date(fiscalYearEndDate);
  fye.setHours(0, 0, 0, 0);
  
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
  
  const fye = new Date(fiscalYearEndDate);
  fye.setHours(0, 0, 0, 0);
  
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
 * @param startYear - The first fiscal year
 * @param count - Number of years to generate
 * @returns Array of fiscal year numbers
 */
export function generateFiscalYears(startYear: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => startYear + i);
}
