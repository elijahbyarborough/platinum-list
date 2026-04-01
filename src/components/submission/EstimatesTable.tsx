import { useState, useEffect, useMemo } from 'react';
import { getFiscalYears } from '@/utils/fiscalYear';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MetricType } from '@/types/company';

interface EstimateData {
  fiscal_year: number;
  metric_value: number | null;
  dividend_value: number | null;
  ma_value: number | null;
}

interface EstimatesTableProps {
  fiscalYearEndDate: string;
  estimates: EstimateData[];
  onEstimatesChange: (estimates: EstimateData[]) => void;
  metricType?: MetricType;
}

export function EstimatesTable({
  fiscalYearEndDate,
  estimates,
  onEstimatesChange,
  metricType = 'GAAP EPS',
}: EstimatesTableProps) {
  const [isPasteActive, setIsPasteActive] = useState<'metrics' | 'dividends' | 'ma_value' | null>(null);

  // Generate fiscal years based on fiscal year end date
  const fiscalYears = useMemo(() => {
    if (!fiscalYearEndDate) return [];
    return getFiscalYears(fiscalYearEndDate, 8);
  }, [fiscalYearEndDate]);

  // Initialize estimates when fiscal years change
  useEffect(() => {
    if (fiscalYears.length > 0 && estimates.length === 0) {
      const initialEstimates = fiscalYears.map(year => ({
        fiscal_year: year,
        metric_value: null,
        dividend_value: null,
        ma_value: null,
      }));
      onEstimatesChange(initialEstimates);
    }
  }, [fiscalYears, estimates.length, onEstimatesChange]);

  // Get value for a specific fiscal year
  const getEstimate = (fiscalYear: number): EstimateData => {
    return estimates.find(e => e.fiscal_year === fiscalYear) || {
      fiscal_year: fiscalYear,
      metric_value: null,
      dividend_value: null,
      ma_value: null,
    };
  };

  // Update metric for a specific fiscal year
  const handleMetricChange = (fiscalYear: number, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    if (numValue !== null && isNaN(numValue)) return;

    const newEstimates = fiscalYears.map(year => {
      const existing = getEstimate(year);
      if (year === fiscalYear) {
        return { ...existing, metric_value: numValue };
      }
      return existing;
    });
    onEstimatesChange(newEstimates);
  };

  // Update dividend for a specific fiscal year
  const handleDividendChange = (fiscalYear: number, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    if (numValue !== null && isNaN(numValue)) return;

    const newEstimates = fiscalYears.map(year => {
      const existing = getEstimate(year);
      if (year === fiscalYear) {
        return { ...existing, dividend_value: numValue };
      }
      return existing;
    });
    onEstimatesChange(newEstimates);
  };

  // Update M&A value for a specific fiscal year
  const handleMaValueChange = (fiscalYear: number, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    if (numValue !== null && isNaN(numValue)) return;

    const newEstimates = fiscalYears.map(year => {
      const existing = getEstimate(year);
      if (year === fiscalYear) {
        return { ...existing, ma_value: numValue };
      }
      return existing;
    });
    onEstimatesChange(newEstimates);
  };

  const handlePaste = (e: React.ClipboardEvent, rowType: 'metrics' | 'dividends' | 'ma_value', startYear?: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get clipboard data - try multiple formats for Windows compatibility
    let pastedData = '';
    try {
      pastedData = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
    } catch (err) {
      console.error('Error reading clipboard:', err);
      return;
    }
    
    if (!pastedData || pastedData.trim() === '') {
      return;
    }
    
    // Handle Windows line endings (\r\n) and Unix (\n), split by tabs
    // Excel on Windows typically uses \r\n for line breaks and \t for column separators
    const lines = pastedData.split(/\r?\n/).filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
      return;
    }
    
    // Use the first line (single row paste)
    // Split by tabs - Excel uses tabs to separate columns
    const firstLine = lines[0];
    const values = firstLine.split(/\t/)
      .map(v => v.trim())
      .filter(v => v !== '');

    if (values.length === 0) {
      return;
    }

    // Ensure we have estimates array
    const currentEstimates = estimates.length > 0 ? estimates : fiscalYears.map(year => ({
      fiscal_year: year,
      metric_value: null,
      dividend_value: null,
      ma_value: null,
    }));

    const newEstimates = [...currentEstimates];

    // If we know the starting year (from the input that received paste), start there
    // Otherwise start at the first column
    const startIndex = startYear !== undefined ? fiscalYears.indexOf(startYear) : 0;

    values.forEach((value, idx) => {
      const targetIndex = startIndex + idx;
      if (targetIndex >= 0 && targetIndex < fiscalYears.length) {
        const targetYear = fiscalYears[targetIndex];
        const estimateIndex = newEstimates.findIndex(e => e.fiscal_year === targetYear);
        
        if (estimateIndex >= 0) {
          // Parse the value, removing commas and handling various number formats
          const cleanedValue = value.replace(/,/g, '').replace(/\$/g, '').trim();
          const numValue = cleanedValue ? parseFloat(cleanedValue) : null;
          const validValue = numValue !== null && !isNaN(numValue) ? numValue : null;
          
          if (rowType === 'metrics') {
            newEstimates[estimateIndex] = {
              ...newEstimates[estimateIndex],
              metric_value: validValue,
            };
          } else if (rowType === 'dividends') {
            newEstimates[estimateIndex] = {
              ...newEstimates[estimateIndex],
              dividend_value: validValue,
            };
          } else if (rowType === 'ma_value') {
            newEstimates[estimateIndex] = {
              ...newEstimates[estimateIndex],
              ma_value: validValue,
            };
          }
        }
      }
    });

    onEstimatesChange(newEstimates);
    setIsPasteActive(rowType);
    setTimeout(() => setIsPasteActive(null), 1000);
  };

  if (!fiscalYearEndDate) {
    return (
      <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
        Select a fiscal year end date to enter estimates
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Paste instruction banner */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Excel Paste Supported</p>
          <p className="text-xs text-muted-foreground">
            Select a row and paste (Ctrl/Cmd+V) tab-separated values directly from Excel
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full">
          <thead>
            <tr className="bg-[hsl(var(--table-header))]">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 w-28">
                Fiscal Year
              </th>
              {fiscalYears.map((year) => (
                <th 
                  key={year} 
                  className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 min-w-[80px]"
                >
                  FY {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Metrics Row */}
            <tr 
              onPaste={(e) => handlePaste(e, 'metrics')}
              onPasteCapture={(e) => handlePaste(e, 'metrics')}
              className={cn(
                "transition-all duration-300",
                isPasteActive === 'metrics' && "bg-primary/10"
              )}
            >
              <td className="px-4 py-3 bg-[hsl(var(--table-row-odd))] border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{metricType}</span>
                </div>
              </td>
              {fiscalYears.map((year) => {
                const estimate = getEstimate(year);
                return (
                  <td key={year} className="px-1 py-2 bg-[hsl(var(--table-row-odd))] border-b border-border/30">
                    <Input
                      type="number"
                      step="0.01"
                      value={estimate.metric_value === null ? '' : estimate.metric_value}
                      onChange={(e) => handleMetricChange(year, e.target.value)}
                      onPaste={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePaste(e, 'metrics', year);
                      }}
                      onPasteCapture={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePaste(e, 'metrics', year);
                      }}
                      className="h-9 text-center text-sm px-2 bg-background/50"
                      placeholder="—"
                    />
                  </td>
                );
              })}
            </tr>

            {/* Dividends Row */}
            <tr
              onPaste={(e) => handlePaste(e, 'dividends')}
              onPasteCapture={(e) => handlePaste(e, 'dividends')}
              className={cn(
                "transition-all duration-300",
                isPasteActive === 'dividends' && "bg-primary/10"
              )}
            >
              <td className="px-4 py-3 bg-[hsl(var(--table-row-even))] border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">Dividends</span>
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                    Per Share
                  </span>
                </div>
              </td>
              {fiscalYears.map((year) => {
                const estimate = getEstimate(year);
                return (
                  <td key={year} className="px-1 py-2 bg-[hsl(var(--table-row-even))] border-b border-border/30">
                    <Input
                      type="number"
                      step="0.01"
                      value={estimate.dividend_value === null ? '' : estimate.dividend_value}
                      onChange={(e) => handleDividendChange(year, e.target.value)}
                      onPaste={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePaste(e, 'dividends', year);
                      }}
                      onPasteCapture={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePaste(e, 'dividends', year);
                      }}
                      className="h-9 text-center text-sm px-2 bg-background/50"
                      placeholder="—"
                    />
                  </td>
                );
              })}
            </tr>

            {/* M&A Value Row */}
            <tr
              onPaste={(e) => handlePaste(e, 'ma_value')}
              onPasteCapture={(e) => handlePaste(e, 'ma_value')}
              className={cn(
                "transition-all duration-300",
                isPasteActive === 'ma_value' && "bg-primary/10"
              )}
            >
              <td className="px-4 py-3 bg-[hsl(var(--table-row-odd))]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">M&A Value</span>
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                    Per Share
                  </span>
                </div>
              </td>
              {fiscalYears.map((year) => {
                const estimate = getEstimate(year);
                return (
                  <td key={year} className="px-1 py-2 bg-[hsl(var(--table-row-odd))]">
                    <Input
                      type="number"
                      step="0.01"
                      value={estimate.ma_value === null ? '' : estimate.ma_value}
                      onChange={(e) => handleMaValueChange(year, e.target.value)}
                      onPaste={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePaste(e, 'ma_value', year);
                      }}
                      onPasteCapture={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePaste(e, 'ma_value', year);
                      }}
                      className="h-9 text-center text-sm px-2 bg-background/50"
                      placeholder="—"
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Keyboard shortcut hint */}
      <div className="flex items-center justify-end gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] font-mono">Tab</kbd>
          <span>Next cell</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] font-mono">⌘V</kbd>
          <span>Paste from Excel</span>
        </span>
      </div>
    </div>
  );
}
