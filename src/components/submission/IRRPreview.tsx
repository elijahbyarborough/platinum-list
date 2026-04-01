import { useMemo, useState } from 'react';
import { calculate5YearIRRPreview } from '@/utils/irrCalculator';
import { formatPercentage, formatPrice, formatMultiple } from '@/utils/formatting';
import { cn } from '@/lib/utils';
import { MetricType } from '@/types/company';

interface EstimateData {
  fiscal_year: number;
  metric_value: number | null;
  dividend_value: number | null;
  ma_value?: number | null;
}

interface IRRPreviewProps {
  currentPrice: number | null;
  exitMultiple: number | null;
  fiscalYearEndDate: string;
  estimates: EstimateData[];
  metricType?: MetricType;
}

// Get IRR color class based on value
function getIRRColorClass(irr: number | null): string {
  if (irr === null) return 'text-muted-foreground';
  
  const percentage = irr * 100;
  if (percentage >= 15) return 'text-[hsl(var(--irr-excellent))]';
  if (percentage >= 10) return 'text-[hsl(var(--irr-good))]';
  if (percentage >= 5) return 'text-[hsl(var(--irr-moderate))]';
  if (percentage >= 0) return 'text-[hsl(var(--irr-low))]';
  return 'text-[hsl(var(--irr-negative))]';
}

function getIRRBackgroundClass(irr: number | null): string {
  if (irr === null) return 'bg-secondary/50';
  
  const percentage = irr * 100;
  if (percentage >= 15) return 'bg-[hsl(var(--irr-excellent))]/10';
  if (percentage >= 10) return 'bg-[hsl(var(--irr-good))]/10';
  if (percentage >= 5) return 'bg-[hsl(var(--irr-moderate))]/10';
  if (percentage >= 0) return 'bg-[hsl(var(--irr-low))]/10';
  return 'bg-[hsl(var(--irr-negative))]/10';
}

export function IRRPreview({
  currentPrice,
  exitMultiple,
  fiscalYearEndDate,
  estimates,
  metricType = 'GAAP EPS',
}: IRRPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const result = useMemo(() => {
    return calculate5YearIRRPreview({
      currentPrice,
      exitMultiple,
      fiscalYearEndDate,
      estimates,
    });
  }, [currentPrice, exitMultiple, fiscalYearEndDate, estimates]);

  const hasIRR = result.irr !== null;

  return (
    <section className="form-section">
      <h2 className="form-section-title flex items-center gap-2">
        <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        5-Year Expected Return Calculation
      </h2>
      
      {hasIRR ? (
        <div className="space-y-6">
          {/* Main IRR Display */}
          <div className={cn(
            "text-center p-6 rounded-xl border border-border/50 transition-all duration-300",
            getIRRBackgroundClass(result.irr)
          )}>
            <div className="text-sm text-muted-foreground mb-2 uppercase tracking-wider">
              Expected Annual Return (IRR)
            </div>
            <div className={cn(
              "text-5xl font-bold font-mono tracking-tight",
              getIRRColorClass(result.irr)
            )}>
              {formatPercentage(result.irr)}
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className={cn(
            "grid grid-cols-2 gap-4",
            result.interpolatedMaValue ? "md:grid-cols-4" : "md:grid-cols-6"
          )}>
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                5Y FWD {metricType}
              </div>
              <div className="text-lg font-semibold font-mono">
                {result.interpolatedMetric?.toFixed(2) || '—'}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                {metricType} Multiple
              </div>
              <div className="text-lg font-semibold font-mono">
                {exitMultiple !== null ? formatMultiple(exitMultiple) : '—'}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                {result.interpolatedMaValue ? 'EPS-Implied Price' : 'Future Price'}
              </div>
              <div className="text-lg font-semibold font-mono">
                {formatPrice(result.futurePrice)}
              </div>
            </div>
            {result.interpolatedMaValue && (
              <>
                <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    M&A Value
                  </div>
                  <div className="text-lg font-semibold font-mono">
                    {formatPrice(result.interpolatedMaValue)}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Total Price
                  </div>
                  <div className="text-lg font-semibold font-mono">
                    {formatPrice(result.totalPrice)}
                  </div>
                </div>
              </>
            )}
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Price CAGR
              </div>
              <div className="text-lg font-semibold font-mono">
                {formatPercentage(result.priceCAGR)}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Avg. Div Yield
              </div>
              <div className="text-lg font-semibold font-mono">
                {formatPercentage(result.dividendYield)}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Average Dividend
              </div>
              <div className="text-lg font-semibold font-mono">
                {result.averageDividend !== null ? formatPrice(result.averageDividend) : '—'}
              </div>
            </div>
          </div>

          {/* Expandable Explainer Section */}
          <div className="rounded-lg bg-secondary/20 border border-border/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-sm">How is the IRR calculated?</span>
              </div>
              <svg
                className={cn(
                  "w-5 h-5 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-180"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4 text-sm text-muted-foreground">
                <div className="pt-2 border-t border-border/30">
                  <h4 className="font-semibold text-foreground mb-2">IRR Calculation</h4>
                  <p className="mb-3">
                    The Internal Rate of Return (IRR) is calculated using a time-value-of-money approach that accounts for 
                    the exact timing of all cash flows over the 5-year period. The IRR is the discount rate that makes the 
                    net present value (NPV) of all cash flows equal to zero.
                  </p>
                  <div className="bg-background/50 rounded p-3 font-mono text-xs mb-3">
                    <div className="text-foreground mb-1">Cash Flows:</div>
                    <div>• Initial investment: -Current Price (at time 0)</div>
                    <div>• Dividends: Paid at midpoint of each fiscal year period</div>
                    <div>• Final value: +Total Price (at exactly 5 years)</div>
                    <div>  where Total Price = (EPS × Multiple) + M&A Value</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground mb-2">Price CAGR</h4>
                  <p className="mb-2">
                    The Price Compound Annual Growth Rate (CAGR) measures the annualized price appreciation from the current 
                    price to the future price.
                  </p>
                  <div className="bg-background/50 rounded p-3 font-mono text-xs">
                    <div className="text-foreground mb-1">Formula:</div>
                    <div>Price CAGR = (Future Price / Current Price)<sup>(1/5)</sup> - 1</div>
                    <div className="mt-2 text-muted-foreground">
                      Where Future Price = (5-Year Forward {metricType} × Exit Multiple) + M&A Value
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground mb-2">Dividend Calculation</h4>
                  <p className="mb-2">
                    Dividends are calculated with proper timing based on when they're received during each fiscal year:
                  </p>
                  <ul className="list-disc list-inside space-y-1 mb-2 ml-2">
                    <li><strong>Current Fiscal Year:</strong> Pro-rated dividend based on time remaining, paid at midpoint between today and fiscal year end</li>
                    <li><strong>Full Fiscal Years (FY+1 to FY+4):</strong> Full dividend amounts, paid at midpoint of each fiscal year</li>
                    <li><strong>Final Fiscal Year (FY+5):</strong> Pro-rated dividend based on fraction elapsed by 5-year mark, paid at midpoint between FY start and 5-year date</li>
                  </ul>
                  <div className="bg-background/50 rounded p-3 font-mono text-xs">
                    <div className="text-foreground mb-1">Average Dividend Formula:</div>
                    <div>Avg Div = [({'{'}% remaining × Current FY Div{'}'}) + FY1 + FY2 + FY3 + FY4 + ({'{'}(1 - % remaining) × FY5 Div{'}'})] / 5</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground mb-2">How They Combine</h4>
                  <p className="mb-2">
                    The IRR calculation uses Newton-Raphson iteration to solve for the discount rate where the sum of all 
                    discounted cash flows equals zero. This naturally combines:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Price appreciation (from current price to future price)</li>
                    <li>Dividend income (received at specific times throughout the 5-year period)</li>
                    <li>Time value of money (earlier cash flows are worth more than later ones)</li>
                  </ul>
                  <p className="mt-2 text-xs italic">
                    Note: The IRR is not simply Price CAGR + Dividend Yield. It's a true time-weighted return that accounts 
                    for the exact timing of all cash flows, making it more accurate than a simple addition.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 px-4 rounded-xl bg-secondary/20 border border-border/30">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
            <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-muted-foreground mb-3 font-medium">Cannot calculate IRR</div>
          <div className="text-sm">
            <span className="text-muted-foreground">Missing data:</span>
            <ul className="mt-2 space-y-1">
              {result.missingData.map((item, idx) => (
                <li key={idx} className="flex items-center justify-center gap-2 text-muted-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
