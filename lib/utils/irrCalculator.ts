/**
 * 5-year expected-return (IRR) calculator.
 *
 * Single source of truth used by BOTH the serverless API (dashboard, PDF
 * snapshots) and the browser (submission form preview via
 * src/utils/irrCalculator.ts, which re-exports this module). Keep it free of
 * imports from lib/db.ts or anything Node-specific — any change here shows up
 * identically on both sides.
 */

import {
  EstimateLike,
  getMetricForYear,
  getDividendForYear,
  getMaValueForYear,
  getCurrentFiscalYear,
  getFiscalYearForDate,
  calculateYearFractionForDate,
  parseDateOnly,
} from './fiscalYear.js';

export type { EstimateLike };

// Structural type satisfied by the DB Company row and snapshot objects
export interface CompanyLike {
  fiscal_year_end_date: string;
  current_stock_price: number | null;
}

const MIN_RATE = -0.99;
const MAX_RATE = 10;

function npvAt(rate: number, cashFlows: number[], times: number[]): number {
  let npv = 0;
  for (let j = 0; j < cashFlows.length; j++) {
    npv += cashFlows[j] * Math.pow(1 + rate, -times[j]);
  }
  return npv;
}

/**
 * Solve for IRR: Newton-Raphson first (fast), bisection as fallback.
 * With this cash-flow shape (one negative flow at t=0, positive flows after)
 * NPV is strictly decreasing in rate, so if NPV changes sign on
 * [MIN_RATE, MAX_RATE] bisection is guaranteed to find the root — deeply
 * negative expected returns now come back as numbers instead of null.
 */
function calculateIRR(cashFlows: number[], times: number[]): number | null {
  if (cashFlows.length !== times.length || cashFlows.length < 2) {
    return null;
  }

  const tolerance = 1e-6;

  // Newton-Raphson
  let rate = 0.1; // Start with 10%
  for (let i = 0; i < 100; i++) {
    let npv = 0;
    let npvDerivative = 0;
    for (let j = 0; j < cashFlows.length; j++) {
      const cf = cashFlows[j];
      const t = times[j];
      const discountFactor = Math.pow(1 + rate, -t);
      npv += cf * discountFactor;
      npvDerivative -= t * cf * discountFactor / (1 + rate);
    }

    if (Math.abs(npv) < tolerance) {
      return rate;
    }
    if (Math.abs(npvDerivative) < tolerance) {
      break; // Flat derivative — fall through to bisection
    }

    rate = rate - npv / npvDerivative;
    if (rate < MIN_RATE || rate > MAX_RATE) {
      break; // Overshot the bracket — fall through to bisection
    }
  }

  // Bisection fallback on [MIN_RATE, MAX_RATE]
  let lo = MIN_RATE;
  let hi = MAX_RATE;
  let npvLo = npvAt(lo, cashFlows, times);
  const npvHi = npvAt(hi, cashFlows, times);
  if (npvLo === 0) return lo;
  if (npvHi === 0) return hi;
  if (npvLo * npvHi > 0) {
    return null; // No root in bracket (e.g. all-positive or all-negative flows)
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npvAt(mid, cashFlows, times);
    if (Math.abs(npvMid) < tolerance || (hi - lo) / 2 < 1e-9) {
      return mid;
    }
    if (npvLo * npvMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      npvLo = npvMid;
    }
  }
  return (lo + hi) / 2;
}

interface InterpolationResult {
  forwardFY: number;
  nextFY: number;
  forwardMetric: number | null;
  nextMetric: number | null;
  yearFraction: number;
  interpolatedMetric: number | null;
  interpolatedMaValue: number;
}

/**
 * Interpolate the metric and M&A value at the date exactly 5 years from today.
 * The "5-year forward" metric is calculated as exactly 5 years out, not
 * "Year 5 of the fiscal cycle".
 */
function interpolateAtFiveYears(
  estimates: EstimateLike[],
  fiscalYearEndDate: string,
  today: Date,
  fiveYearsFromNow: Date
): InterpolationResult {
  const forwardFY = getFiscalYearForDate(fiveYearsFromNow, fiscalYearEndDate);
  const nextFY = forwardFY + 1;

  const forwardMetric = getMetricForYear(estimates, forwardFY);
  const nextMetric = getMetricForYear(estimates, nextFY);

  // yearFraction = 1.0 at start of FY, 0.0 at end of FY.
  // Early in the FY -> weight forwardFY more; late -> weight nextFY more.
  const yearFraction = calculateYearFractionForDate(fiveYearsFromNow, fiscalYearEndDate);

  const interpolatedMetric = (forwardMetric !== null && nextMetric !== null)
    ? (yearFraction * forwardMetric) + ((1 - yearFraction) * nextMetric)
    : null;

  // Interpolate M&A value at the 5-year mark (same interpolation logic as metric)
  const forwardMaValue = getMaValueForYear(estimates, forwardFY);
  const nextMaValue = getMaValueForYear(estimates, nextFY);
  let interpolatedMaValue = 0;
  if (forwardMaValue !== null && nextMaValue !== null) {
    interpolatedMaValue = (yearFraction * forwardMaValue) + ((1 - yearFraction) * nextMaValue);
  } else if (forwardMaValue !== null) {
    interpolatedMaValue = forwardMaValue;
  } else if (nextMaValue !== null) {
    interpolatedMaValue = nextMaValue;
  }

  return { forwardFY, nextFY, forwardMetric, nextMetric, yearFraction, interpolatedMetric, interpolatedMaValue };
}

/**
 * Build the dated cash-flow series: [-currentPrice at t=0, dividends at their
 * (midpoint) payment times, +exitPrice at t=5].
 */
function buildCashFlows(
  currentPrice: number,
  fiscalYearEndDate: string,
  estimates: EstimateLike[],
  exitPrice: number,
  today: Date,
  fiveYearsFromNow: Date
): { cashFlows: number[]; times: number[] } {
  const currentFY = getCurrentFiscalYear(fiscalYearEndDate);
  const fye = parseDateOnly(fiscalYearEndDate);

  const cashFlows: number[] = [-currentPrice]; // Initial investment (negative)
  const times: number[] = [0]; // Time 0

  // Fraction remaining in the current fiscal year
  const currentYearFraction = calculateYearFractionForDate(today, fiscalYearEndDate);

  const msPerYear = 1000 * 60 * 60 * 24 * 365.25;

  const getFiscalYearDates = (fiscalYear: number): { start: Date; end: Date } => {
    const fyStart = new Date(fiscalYear - 1, fye.getMonth(), fye.getDate());
    fyStart.setDate(fyStart.getDate() + 1); // Day after previous FYE
    fyStart.setHours(0, 0, 0, 0);

    const fyEnd = new Date(fiscalYear, fye.getMonth(), fye.getDate());
    fyEnd.setHours(0, 0, 0, 0);

    return { start: fyStart, end: fyEnd };
  };

  const pushFlow = (amount: number, paymentMs: number) => {
    const yearsFromToday = (paymentMs - today.getTime()) / msPerYear;
    if (amount > 0 && yearsFromToday > 0 && yearsFromToday <= 5) {
      cashFlows.push(amount);
      times.push(yearsFromToday);
    }
  };

  // Current fiscal year dividend: pro-rated for remaining time, paid at the
  // midpoint between today and FY end
  const currentFYDiv = getDividendForYear(estimates, currentFY);
  if (currentFYDiv && currentFYDiv > 0) {
    const { end: currentFYEnd } = getFiscalYearDates(currentFY);
    if (currentFYEnd <= fiveYearsFromNow) {
      const partialDiv = currentYearFraction * currentFYDiv;
      const paymentMs = today.getTime() + (currentFYEnd.getTime() - today.getTime()) * 0.5;
      pushFlow(partialDiv, paymentMs);
    }
  }

  // Full fiscal year dividends (FY+1 through FY+4), paid at the FY midpoint
  for (let fy = currentFY + 1; fy <= currentFY + 4; fy++) {
    const div = getDividendForYear(estimates, fy);
    if (div && div > 0) {
      const { start: fyStart, end: fyEnd } = getFiscalYearDates(fy);
      if (fyEnd <= fiveYearsFromNow) {
        const paymentMs = fyStart.getTime() + (fyEnd.getTime() - fyStart.getTime()) * 0.5;
        pushFlow(div, paymentMs);
      }
    }
  }

  // Final fiscal year dividend (FY+5): full if the FY ends within 5 years,
  // otherwise pro-rated up to the 5-year mark; paid at the period midpoint
  const fy5Div = getDividendForYear(estimates, currentFY + 5);
  if (fy5Div && fy5Div > 0) {
    const { start: fy5Start, end: fy5End } = getFiscalYearDates(currentFY + 5);
    if (fy5End <= fiveYearsFromNow) {
      const paymentMs = fy5Start.getTime() + (fy5End.getTime() - fy5Start.getTime()) * 0.5;
      pushFlow(fy5Div, paymentMs);
    } else {
      const fy5Ms = fy5End.getTime() - fy5Start.getTime();
      const elapsedMs = fiveYearsFromNow.getTime() - fy5Start.getTime();
      const fraction = Math.max(0, Math.min(1, elapsedMs / fy5Ms));
      const partialDiv = fraction * fy5Div;
      const paymentMs = fy5Start.getTime() + (fiveYearsFromNow.getTime() - fy5Start.getTime()) * 0.5;
      pushFlow(partialDiv, paymentMs);
    }
  }

  // Exit price at exactly 5 years
  cashFlows.push(exitPrice);
  times.push(5.0);

  return { cashFlows, times };
}

function getTodayAndFiveYearsOut(): { today: Date; fiveYearsFromNow: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fiveYearsFromNow = new Date(today);
  fiveYearsFromNow.setFullYear(today.getFullYear() + 5);
  return { today, fiveYearsFromNow };
}

/**
 * Calculate the 5-year expected return (IRR) for a company.
 *
 * Exit price at t=5 is (interpolated metric x exit multiple) + interpolated
 * M&A value; dividends are laid out at their estimated payment midpoints and
 * the IRR is solved from the full dated cash-flow series.
 *
 * @returns IRR as a decimal (e.g., 0.15 for 15%) or null if insufficient data
 */
export function calculate5YearIRR(
  company: CompanyLike,
  estimates: EstimateLike[],
  exitMultiple: number
): number | null {
  if (!company.current_stock_price || company.current_stock_price <= 0) {
    return null; // Need current price
  }

  const { today, fiveYearsFromNow } = getTodayAndFiveYearsOut();

  const interp = interpolateAtFiveYears(estimates, company.fiscal_year_end_date, today, fiveYearsFromNow);
  if (interp.interpolatedMetric === null) {
    return null; // Insufficient data
  }

  // Exit price: (metric x multiple) + M&A value
  const exitPrice = (interp.interpolatedMetric * exitMultiple) + interp.interpolatedMaValue;

  const { cashFlows, times } = buildCashFlows(
    company.current_stock_price,
    company.fiscal_year_end_date,
    estimates,
    exitPrice,
    today,
    fiveYearsFromNow
  );

  return calculateIRR(cashFlows, times);
}

/**
 * Check if company has sufficient data for the 5-year IRR calculation:
 * a positive current price plus metric estimates for the fiscal year containing
 * the 5-year forward date and the following fiscal year.
 */
export function hasSufficientDataForIRR(
  company: CompanyLike,
  estimates: EstimateLike[]
): boolean {
  if (!company.current_stock_price || company.current_stock_price <= 0) {
    return false;
  }

  const { fiveYearsFromNow } = getTodayAndFiveYearsOut();
  const forwardFY = getFiscalYearForDate(fiveYearsFromNow, company.fiscal_year_end_date);

  return (
    getMetricForYear(estimates, forwardFY) !== null &&
    getMetricForYear(estimates, forwardFY + 1) !== null
  );
}

export interface IRRInput {
  currentPrice: number | null;
  exitMultiple: number | null;
  fiscalYearEndDate: string;
  estimates: EstimateLike[];
}

export interface IRRResult {
  irr: number | null;
  priceCAGR: number | null;
  dividendYield: number | null;
  averageDividend: number | null;
  futurePrice: number | null;
  interpolatedMetric: number | null;
  interpolatedMaValue: number | null;
  totalPrice: number | null;
  missingData: string[];
}

/**
 * Rich version of the calculation for the submission form preview: same IRR as
 * calculate5YearIRR, plus the display components (price CAGR, average dividend
 * yield, interpolated values) and a list of what's missing.
 */
export function calculate5YearIRRPreview(input: IRRInput): IRRResult {
  const missingData: string[] = [];

  if (!input.currentPrice || input.currentPrice <= 0) {
    missingData.push('Current stock price');
  }
  if (!input.exitMultiple || input.exitMultiple <= 0) {
    missingData.push('Exit multiple');
  }
  if (!input.fiscalYearEndDate) {
    missingData.push('Fiscal year end date');
  }

  const emptyResult: IRRResult = {
    irr: null,
    priceCAGR: null,
    dividendYield: null,
    averageDividend: null,
    futurePrice: null,
    interpolatedMetric: null,
    interpolatedMaValue: null,
    totalPrice: null,
    missingData,
  };

  if (!input.fiscalYearEndDate) {
    return emptyResult;
  }

  const { today, fiveYearsFromNow } = getTodayAndFiveYearsOut();

  const interp = interpolateAtFiveYears(input.estimates, input.fiscalYearEndDate, today, fiveYearsFromNow);
  if (interp.forwardMetric === null) {
    missingData.push(`FY ${interp.forwardFY} metric estimate`);
  }
  if (interp.nextMetric === null) {
    missingData.push(`FY ${interp.nextFY} metric estimate`);
  }

  if (missingData.length > 0) {
    return { ...emptyResult, missingData };
  }

  const currentPrice = input.currentPrice!;
  const exitMultiple = input.exitMultiple!;
  const interpolatedMetric = interp.interpolatedMetric!;
  const interpolatedMaValue = interp.interpolatedMaValue;

  // The metric-implied price, with M&A value added on top for the total at exit
  const futurePrice = interpolatedMetric * exitMultiple;
  const totalPrice = futurePrice + interpolatedMaValue;

  // Price CAGR based on the total exit price (what you actually receive)
  const priceCAGR = Math.pow(totalPrice / currentPrice, 1 / 5) - 1;

  const { cashFlows, times } = buildCashFlows(
    currentPrice,
    input.fiscalYearEndDate,
    input.estimates,
    totalPrice,
    today,
    fiveYearsFromNow
  );
  const irr = calculateIRR(cashFlows, times);

  // Average dividend for display (legacy formula, shown for reference)
  const currentFY = getCurrentFiscalYear(input.fiscalYearEndDate);
  const currentYearFraction = calculateYearFractionForDate(today, input.fiscalYearEndDate);
  const divFor = (fy: number) => getDividendForYear(input.estimates, fy) ?? 0;
  const totalDividends = (currentYearFraction * divFor(currentFY)) +
    divFor(currentFY + 1) + divFor(currentFY + 2) + divFor(currentFY + 3) + divFor(currentFY + 4) +
    ((1 - currentYearFraction) * divFor(currentFY + 5));
  const averageDividend = totalDividends / 5;
  const avgDividendYield = averageDividend / currentPrice;

  return {
    irr,
    priceCAGR,
    dividendYield: avgDividendYield,
    averageDividend,
    futurePrice,
    interpolatedMetric,
    interpolatedMaValue: interpolatedMaValue > 0 ? interpolatedMaValue : null,
    totalPrice,
    missingData: [],
  };
}
