import { getMetricForYear, getDividendForYear, getMaValueForYear, calculateYearFraction, getCurrentFiscalYear, getFiscalYearForDate, calculateYearFractionForDate } from './fiscalYear.js';
import { Company, Estimate } from '../db.js';

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
 * Calculate 5-year Expected Return (IRR) for a company
 * 
 * Formula:
 * 1. futurePrice = interpolatedMetric × exitMultiple
 * 2. priceCAGR = (futurePrice / currentPrice)^(1/5) - 1
 * 3. totalDividends = sum of dividends for years 1-5 (with year 5 interpolated)
 * 4. avgDividendYield = (totalDividends / 5) / currentPrice
 * 5. expectedReturn = priceCAGR + avgDividendYield
 * 
 * The "5-year forward" metric is calculated as exactly 5 years from today,
 * not "Year 5 of the fiscal cycle"
 * 
 * @param company - Company object with fiscal year end date
 * @param estimates - Array of estimates for the company
 * @param exitMultiple - Exit multiple for 5-year horizon
 * @returns Calculated IRR as decimal (e.g., 0.15 for 15%) or null if insufficient data
 */
export function calculate5YearIRR(
  company: Company,
  estimates: Estimate[],
  exitMultiple: number
): number | null {
  if (!company.current_stock_price || company.current_stock_price <= 0) {
    return null; // Need current price
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate the date exactly 5 years from today
  const fiveYearsFromNow = new Date(today);
  fiveYearsFromNow.setFullYear(today.getFullYear() + 5);
  
  // Get the fiscal year for the 5-year forward date
  const forwardFY = getFiscalYearForDate(fiveYearsFromNow, company.fiscal_year_end_date);
  const nextFY = forwardFY + 1;
  
  // Get metrics for the fiscal years we need to interpolate between
  const forwardMetric = getMetricForYear(estimates, forwardFY);
  const nextMetric = getMetricForYear(estimates, nextFY);

  if (forwardMetric === null || nextMetric === null) {
    return null; // Insufficient data
  }

  // Calculate year fraction for the 5-year forward date within its fiscal year
  const yearFraction = calculateYearFractionForDate(fiveYearsFromNow, company.fiscal_year_end_date);

  // Interpolate: (yearFraction × forwardFY) + ((1 - yearFraction) × nextFY)
  // yearFraction = 1.0 at start of FY, 0.0 at end of FY
  // So if we're early in the FY, use more of forwardFY; if late, use more of nextFY
  const interpolatedMetric = (yearFraction * forwardMetric) + ((1 - yearFraction) * nextMetric);

  // Interpolate M&A value at 5-year mark (same interpolation logic as metric)
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

  // Calculate future price: (EPS * Multiple) + M&A Value
  const futurePrice = (interpolatedMetric * exitMultiple) + interpolatedMaValue;
  
  // Calculate price CAGR: (futurePrice / currentPrice)^(1/5) - 1
  const priceCAGR = Math.pow(futurePrice / company.current_stock_price, 1 / 5) - 1;
  
  // Calculate IRR using cash flows with proper timing
  // Build cash flow array: [-currentPrice at t=0, dividends at their times, +futurePrice at t=5]
  const currentFY = getCurrentFiscalYear(company.fiscal_year_end_date);
  const fye = new Date(company.fiscal_year_end_date);
  fye.setHours(0, 0, 0, 0);
  
  const cashFlows: number[] = [-company.current_stock_price]; // Initial investment (negative)
  const times: number[] = [0]; // Time 0
  
  // Calculate the fraction remaining in the current fiscal year
  const currentYearFraction = calculateYearFractionForDate(today, company.fiscal_year_end_date);
  
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
  const currentFYDiv = getDividendForYear(estimates, currentFY);
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
    const div = getDividendForYear(estimates, fy);
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
  const fy5Div = getDividendForYear(estimates, currentFY + 5);
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
  
  // Add final price at exactly 5 years
  cashFlows.push(futurePrice);
  times.push(5.0);
  
  // Calculate IRR using Newton-Raphson
  const irr = calculateIRR(cashFlows, times);
  
  return irr;
}

/**
 * Check if company has sufficient data for 5-year IRR calculation
 * Requires: Metrics for the fiscal year that contains the 5-year forward date and the next fiscal year
 */
export function hasSufficientDataForIRR(
  company: Company,
  estimates: Estimate[]
): boolean {
  if (!company.current_stock_price || company.current_stock_price <= 0) {
    return false;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate the date exactly 5 years from today
  const fiveYearsFromNow = new Date(today);
  fiveYearsFromNow.setFullYear(today.getFullYear() + 5);
  
  // Get the fiscal year for the 5-year forward date
  const forwardFY = getFiscalYearForDate(fiveYearsFromNow, company.fiscal_year_end_date);
  const nextFY = forwardFY + 1;
  
  const forwardMetric = getMetricForYear(estimates, forwardFY);
  const nextMetric = getMetricForYear(estimates, nextFY);
  
  return (
    forwardMetric !== null &&
    nextMetric !== null
  );
}
