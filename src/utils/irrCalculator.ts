/**
 * Client-side IRR calculator for preview purposes
 */

import { getCurrentFiscalYear } from './fiscalYear';

interface EstimateData {
  fiscal_year: number;
  metric_value: number | null;
  dividend_value: number | null;
  ma_value?: number | null;
}

interface IRRInput {
  currentPrice: number | null;
  exitMultiple: number | null;
  fiscalYearEndDate: string;
  estimates: EstimateData[];
}

interface IRRResult {
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
 * Get the fiscal year for a specific date
 */
function getFiscalYearForDate(date: Date, fiscalYearEndDate: string): number {
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  const fye = new Date(fiscalYearEndDate);
  fye.setHours(0, 0, 0, 0);
  
  const fyeThisYear = new Date(checkDate.getFullYear(), fye.getMonth(), fye.getDate());
  
  if (checkDate > fyeThisYear) {
    return checkDate.getFullYear() + 1;
  }
  
  return checkDate.getFullYear();
}

/**
 * Calculate the year fraction for a specific date within its fiscal year
 * @returns Year fraction (0-1), where 1.0 = start of fiscal year, 0.0 = end of fiscal year
 */
function calculateYearFractionForDate(date: Date, fiscalYearEndDate: string): number {
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  const fye = new Date(fiscalYearEndDate);
  fye.setHours(0, 0, 0, 0);
  
  const fiscalYear = getFiscalYearForDate(checkDate, fiscalYearEndDate);
  
  const fiscalYearStart = new Date(fiscalYear - 1, fye.getMonth(), fye.getDate());
  fiscalYearStart.setDate(fiscalYearStart.getDate() + 1); // Day after FYE = start of new FY
  fiscalYearStart.setHours(0, 0, 0, 0);
  
  // End of fiscal year is the start of the next fiscal year (ensures full 365/366 days)
  const fiscalYearEnd = new Date(fiscalYear, fye.getMonth(), fye.getDate());
  fiscalYearEnd.setDate(fiscalYearEnd.getDate() + 1); // Day after FYE = start of next FY
  fiscalYearEnd.setHours(0, 0, 0, 0);
  
  // Calculate exact fraction using milliseconds (handles leap years automatically)
  const msFromStart = checkDate.getTime() - fiscalYearStart.getTime();
  const msInYear = fiscalYearEnd.getTime() - fiscalYearStart.getTime();
  
  // Calculate fraction of year elapsed (0.0 = start of year, 1.0 = end of year)
  const fractionElapsed = msFromStart / msInYear;
  
  // Return fraction remaining (1.0 = start of year, 0.0 = end of year)
  return Math.max(0, Math.min(1, 1 - fractionElapsed));
}

/**
 * Get metric value for a specific fiscal year from estimates array
 */
function getMetricForYear(estimates: EstimateData[], fiscalYear: number): number | null {
  const estimate = estimates.find(e => e.fiscal_year === fiscalYear);
  return estimate?.metric_value ?? null;
}

/**
 * Get dividend value for a specific fiscal year from estimates array
 */
function getDividendForYear(estimates: EstimateData[], fiscalYear: number): number | null {
  const estimate = estimates.find(e => e.fiscal_year === fiscalYear);
  return estimate?.dividend_value ?? null;
}

/**
 * Get M&A value per share for a specific fiscal year from estimates array
 */
function getMaValueForYear(estimates: EstimateData[], fiscalYear: number): number | null {
  const estimate = estimates.find(e => e.fiscal_year === fiscalYear);
  return estimate?.ma_value ?? null;
}

/**
 * Calculate the fiscal year end date for a given fiscal year
 */
function getFiscalYearEndDate(fiscalYear: number, fiscalYearEndDate: string): Date {
  const fye = new Date(fiscalYearEndDate);
  const fyeDate = new Date(fiscalYear, fye.getMonth(), fye.getDate());
  fyeDate.setHours(0, 0, 0, 0);
  return fyeDate;
}

/**
 * Calculate IRR using Newton-Raphson method
 * Cash flows: [initial investment (negative), ...dividends, final price]
 * Times: [0, ...dividend times in years, 5]
 */
function calculateIRR(cashFlows: number[], times: number[]): number | null {
  if (cashFlows.length !== times.length || cashFlows.length < 2) {
    return null;
  }

  // Initial guess: use a simple approximation
  let rate = 0.1; // Start with 10%
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let i = 0; i < maxIterations; i++) {
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
      break; // Can't converge
    }

    rate = rate - npv / npvDerivative;

    // Prevent negative rates or rates that are too high
    if (rate < -0.99 || rate > 10) {
      return null;
    }
  }

  return null; // Didn't converge
}

/**
 * Calculate 5-year Expected Return (IRR) from form data
 */
export function calculate5YearIRRPreview(input: IRRInput): IRRResult {
  const missingData: string[] = [];
  
  // Check for required data
  if (!input.currentPrice || input.currentPrice <= 0) {
    missingData.push('Current stock price');
  }
  
  if (!input.exitMultiple || input.exitMultiple <= 0) {
    missingData.push('Exit multiple');
  }
  
  if (!input.fiscalYearEndDate) {
    missingData.push('Fiscal year end date');
  }
  
  if (!input.fiscalYearEndDate) {
    return {
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
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate the date exactly 5 years from today
  const fiveYearsFromNow = new Date(today);
  fiveYearsFromNow.setFullYear(today.getFullYear() + 5);
  
  // Get the fiscal year for the 5-year forward date
  const forwardFY = getFiscalYearForDate(fiveYearsFromNow, input.fiscalYearEndDate);
  const nextFY = forwardFY + 1;
  
  const forwardMetric = getMetricForYear(input.estimates, forwardFY);
  const nextMetric = getMetricForYear(input.estimates, nextFY);
  
  if (forwardMetric === null) {
    missingData.push(`FY ${forwardFY} metric estimate`);
  }
  
  if (nextMetric === null) {
    missingData.push(`FY ${nextFY} metric estimate`);
  }
  
  // If missing required data, return early
  if (missingData.length > 0) {
    return {
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
  }
  
  const currentPrice = input.currentPrice!;
  const exitMultiple = input.exitMultiple!;
  
  // Calculate year fraction for the 5-year forward date within its fiscal year
  const yearFraction = calculateYearFractionForDate(fiveYearsFromNow, input.fiscalYearEndDate);
  
  // Interpolate: (yearFraction × forwardFY) + ((1 - yearFraction) × nextFY)
  const interpolatedMetric = (yearFraction * forwardMetric!) + ((1 - yearFraction) * nextMetric!);

  // Interpolate M&A value at 5-year mark (same interpolation logic as metric)
  const forwardMaValue = getMaValueForYear(input.estimates, forwardFY);
  const nextMaValue = getMaValueForYear(input.estimates, nextFY);
  let interpolatedMaValue = 0;
  if (forwardMaValue !== null && nextMaValue !== null) {
    interpolatedMaValue = (yearFraction * forwardMaValue) + ((1 - yearFraction) * nextMaValue);
  } else if (forwardMaValue !== null) {
    interpolatedMaValue = forwardMaValue;
  } else if (nextMaValue !== null) {
    interpolatedMaValue = nextMaValue;
  }

  // Calculate future price: EPS * Multiple (the EPS-implied price)
  const futurePrice = interpolatedMetric * exitMultiple;

  // Total price includes M&A value added on top
  const totalPrice = futurePrice + interpolatedMaValue;

  // Calculate price CAGR based on total price (what you actually receive at exit)
  const priceCAGR = Math.pow(totalPrice / currentPrice, 1 / 5) - 1;
  
  // Calculate IRR using cash flows with proper timing
  // Build cash flow array: [-currentPrice at t=0, dividends at their times, +futurePrice at t=5]
  const currentFY = getCurrentFiscalYear(input.fiscalYearEndDate);
  const fye = new Date(input.fiscalYearEndDate);
  fye.setHours(0, 0, 0, 0);
  
  const cashFlows: number[] = [-currentPrice]; // Initial investment (negative)
  const times: number[] = [0]; // Time 0
  
  // Calculate the fraction remaining in the current fiscal year
  const currentYearFraction = calculateYearFractionForDate(today, input.fiscalYearEndDate);
  
  // Helper function to get fiscal year start and end dates
  const getFiscalYearDates = (fiscalYear: number): { start: Date; end: Date } => {
    const fyStart = new Date(fiscalYear - 1, fye.getMonth(), fye.getDate());
    fyStart.setDate(fyStart.getDate() + 1); // Day after previous FYE
    fyStart.setHours(0, 0, 0, 0);
    
    const fyEnd = new Date(fiscalYear, fye.getMonth(), fye.getDate());
    fyEnd.setHours(0, 0, 0, 0);
    
    return { start: fyStart, end: fyEnd };
  };
  
  // Handle current fiscal year dividend (partial, paid proportionally between today and FY end)
  const currentFYDiv = getDividendForYear(input.estimates, currentFY);
  if (currentFYDiv && currentFYDiv > 0) {
    const { end: currentFYEnd } = getFiscalYearDates(currentFY);
    
    // Only include if FY end is within 5 years
    if (currentFYEnd <= fiveYearsFromNow) {
      // Pro-rate the dividend for remaining time
      const partialDiv = currentYearFraction * currentFYDiv;
      
      if (partialDiv > 0) {
        // Payment time is proportionally between today and FY end
        // Use the midpoint (1/2 of the way through the remaining period)
        const msRemaining = currentFYEnd.getTime() - today.getTime();
        const paymentOffset = msRemaining * 0.5; // Midpoint
        const paymentDate = new Date(today.getTime() + paymentOffset);
        
        const msDiff = paymentDate.getTime() - today.getTime();
        const yearsFromToday = msDiff / (1000 * 60 * 60 * 24 * 365.25);
        
        if (yearsFromToday > 0 && yearsFromToday <= 5) {
          cashFlows.push(partialDiv);
          times.push(yearsFromToday);
        }
      }
    }
  }
  
  // Handle full fiscal year dividends (FY+1 through FY+4, paid proportionally between FY start and end)
  for (let fy = currentFY + 1; fy <= currentFY + 4; fy++) {
    const div = getDividendForYear(input.estimates, fy);
    if (div && div > 0) {
      const { start: fyStart, end: fyEnd } = getFiscalYearDates(fy);
      
      // Only include if FY end is within 5 years
      if (fyEnd <= fiveYearsFromNow) {
        // Payment time is proportionally between FY start and end
        // Use the midpoint (1/2 of the way through the fiscal year)
        const fyMs = fyEnd.getTime() - fyStart.getTime();
        const paymentOffset = fyMs * 0.5; // Midpoint
        const paymentDate = new Date(fyStart.getTime() + paymentOffset);
        
        const msDiff = paymentDate.getTime() - today.getTime();
        const yearsFromToday = msDiff / (1000 * 60 * 60 * 24 * 365.25);
        
        if (yearsFromToday > 0 && yearsFromToday <= 5) {
          cashFlows.push(div);
          times.push(yearsFromToday);
        }
      }
    }
  }
  
  // Handle final fiscal year dividend (FY+5, partial if needed, paid between FY start and 5-year mark)
  const fy5Div = getDividendForYear(input.estimates, currentFY + 5);
  if (fy5Div && fy5Div > 0) {
    const { start: fy5Start, end: fy5End } = getFiscalYearDates(currentFY + 5);
    
    if (fy5End <= fiveYearsFromNow) {
      // Full dividend if FY5 ends before 5-year mark
      // Payment time is proportionally between FY start and end
      // Use the midpoint (1/2 of the way through the fiscal year)
      const fy5Ms = fy5End.getTime() - fy5Start.getTime();
      const paymentOffset = fy5Ms * 0.5; // Midpoint
      const paymentDate = new Date(fy5Start.getTime() + paymentOffset);
      
      const msDiff = paymentDate.getTime() - today.getTime();
      const yearsFromToday = msDiff / (1000 * 60 * 60 * 24 * 365.25);
      if (yearsFromToday > 0 && yearsFromToday <= 5) {
        cashFlows.push(fy5Div);
        times.push(yearsFromToday);
      }
    } else {
      // Partial dividend if FY5 extends beyond 5-year mark
      // Calculate what fraction of FY5 has elapsed by the 5-year mark
      const fy5Ms = fy5End.getTime() - fy5Start.getTime();
      const elapsedMs = fiveYearsFromNow.getTime() - fy5Start.getTime();
      const fraction = Math.max(0, Math.min(1, elapsedMs / fy5Ms));
      const partialDiv = fraction * fy5Div;
      
      if (partialDiv > 0) {
        // Payment time is proportionally between FY start and 5-year mark
        // Use the midpoint (1/2 of the way through the period)
        const periodMs = fiveYearsFromNow.getTime() - fy5Start.getTime();
        const paymentOffset = periodMs * 0.5; // Midpoint
        const paymentDate = new Date(fy5Start.getTime() + paymentOffset);
        
        const msDiff = paymentDate.getTime() - today.getTime();
        const yearsFromToday = msDiff / (1000 * 60 * 60 * 24 * 365.25);
        if (yearsFromToday > 0 && yearsFromToday <= 5) {
          cashFlows.push(partialDiv);
          times.push(yearsFromToday);
        }
      }
    }
  }
  
  // Add final price at exactly 5 years (total price includes M&A value)
  const fiveYearsTime = 5.0;
  cashFlows.push(totalPrice);
  times.push(fiveYearsTime);
  
  // Calculate IRR using Newton-Raphson
  const irr = calculateIRR(cashFlows, times);
  
  // Calculate average dividend for display (using the old formula for reference)
  const avgCurrentFYDiv = getDividendForYear(input.estimates, currentFY) ?? 0;
  const avgFy1Div = getDividendForYear(input.estimates, currentFY + 1) ?? 0;
  const avgFy2Div = getDividendForYear(input.estimates, currentFY + 2) ?? 0;
  const avgFy3Div = getDividendForYear(input.estimates, currentFY + 3) ?? 0;
  const avgFy4Div = getDividendForYear(input.estimates, currentFY + 4) ?? 0;
  const avgFy5Div = getDividendForYear(input.estimates, currentFY + 5) ?? 0;
  
  const totalDividends = (currentYearFraction * avgCurrentFYDiv) + 
                         avgFy1Div + avgFy2Div + avgFy3Div + avgFy4Div + 
                         ((1 - currentYearFraction) * avgFy5Div);
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
