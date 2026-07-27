import { useState, useMemo, type CSSProperties } from 'react';
import { CompanyWithEstimates } from '@/types/company';
import { formatPrice, formatPercentage, formatMultiple, formatDate, formatDateTime } from '@/utils/formatting';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';

interface CompaniesTableProps {
  companies: CompanyWithEstimates[];
}

type SortField = 'ticker' | 'company_name' | 'current_stock_price' | 'exit_multiple_5yr' | 'irr_5yr' | 'updated_at' | 'analyst_initials';
type SortDirection = 'asc' | 'desc';

// Get IRR color style based on value with gradual scaling
function getIRRColorStyle(irr: number | null | undefined): CSSProperties | undefined {
  if (irr === null || irr === undefined) return undefined;
  
  const percentage = irr * 100;
  
  // Color stops:
  // < 6%: red (hsl(0, 72%, 51%))
  // 6-10%: yellow (hsl(50, 100%, 50%))
  // 10-15%: light green (hsl(142, 50%, 50%))
  // >= 15%: solid green (hsl(142, 76%, 45%))
  
  let h: number, s: number, l: number;
  
  if (percentage < 6) {
    // Red zone: 0-6%
    h = 0;
    s = 72;
    l = 51;
  } else if (percentage < 10) {
    // Yellow zone: 6-10% - interpolate from red to yellow
    const t = (percentage - 6) / 4; // 0 to 1 across 6-10%
    h = 0 + (50 - 0) * t; // Interpolate from red (0) to yellow (50)
    s = 72 + (100 - 72) * t;
    l = 51 + (50 - 51) * t;
  } else if (percentage < 15) {
    // Light green zone: 10-15% - interpolate from yellow to light green
    const t = (percentage - 10) / 5; // 0 to 1 across 10-15%
    h = 50 + (142 - 50) * t; // Interpolate from yellow (50) to green (142)
    s = 100 + (50 - 100) * t;
    l = 50;
  } else {
    // Solid green zone: >= 15%
    h = 142;
    s = 76;
    l = 45;
  }
  
  return {
    color: `hsl(${h}, ${s}%, ${l}%)`,
    fontWeight: 600,
  };
}

// Get IRR background gradient for visual indicator
function getIRRBackground(irr: number | null | undefined): string {
  if (irr === null || irr === undefined) return '';
  
  const percentage = irr * 100;
  if (percentage >= 15) return 'bg-gradient-to-r from-[hsl(142,76%,45%,0.15)] to-transparent';
  if (percentage >= 10) return 'bg-gradient-to-r from-[hsl(142,50%,40%,0.12)] to-transparent';
  if (percentage >= 5) return 'bg-gradient-to-r from-[hsl(45,93%,47%,0.1)] to-transparent';
  if (percentage >= 0) return 'bg-gradient-to-r from-[hsl(16,85%,50%,0.1)] to-transparent';
  return 'bg-gradient-to-r from-[hsl(0,72%,51%,0.1)] to-transparent';
}

export function CompaniesTable({ companies }: CompaniesTableProps) {
  const [sortField, setSortField] = useState<SortField>('irr_5yr');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const isMobile = useIsMobile();

  const sortedCompanies = useMemo(() => {
    const sorted = [...companies];

    // Separate companies with valid IRRs from those without
    const withIRR = sorted.filter(c => c.irr_5yr !== null && c.irr_5yr !== undefined);
    const withoutIRR = sorted.filter(c => c.irr_5yr === null || c.irr_5yr === undefined);

    // Sort companies with IRRs
    withIRR.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'irr_5yr':
          aValue = a.irr_5yr ?? -Infinity;
          bValue = b.irr_5yr ?? -Infinity;
          break;
        case 'ticker':
          aValue = a.ticker;
          bValue = b.ticker;
          break;
        case 'company_name':
          aValue = a.company_name;
          bValue = b.company_name;
          break;
        case 'current_stock_price':
          aValue = a.current_stock_price ?? 0;
          bValue = b.current_stock_price ?? 0;
          break;
        case 'exit_multiple_5yr':
          aValue = a.exit_multiple_5yr ?? 0;
          bValue = b.exit_multiple_5yr ?? 0;
          break;
        case 'updated_at':
          aValue = new Date(a.updated_at || 0).getTime();
          bValue = new Date(b.updated_at || 0).getTime();
          break;
        case 'analyst_initials':
          aValue = a.analyst_initials;
          bValue = b.analyst_initials;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // When sorting by IRR, put companies without IRR at the bottom
    if (sortField === 'irr_5yr') {
      return [...withIRR, ...withoutIRR];
    }

    // Otherwise, sort all companies together
    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'ticker':
          aValue = a.ticker;
          bValue = b.ticker;
          break;
        case 'company_name':
          aValue = a.company_name;
          bValue = b.company_name;
          break;
        case 'current_stock_price':
          aValue = a.current_stock_price ?? 0;
          bValue = b.current_stock_price ?? 0;
          break;
        case 'exit_multiple_5yr':
          aValue = a.exit_multiple_5yr ?? 0;
          bValue = b.exit_multiple_5yr ?? 0;
          break;
        case 'updated_at':
          aValue = new Date(a.updated_at || 0).getTime();
          bValue = new Date(b.updated_at || 0).getTime();
          break;
        case 'analyst_initials':
          aValue = a.analyst_initials;
          bValue = b.analyst_initials;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [companies, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    const isActive = sortField === field;
    return (
      <span className={cn(
        'ml-1 inline-flex transition-colors',
        isActive ? 'text-primary' : 'text-muted-foreground/50'
      )}>
        {isActive ? (
          sortDirection === 'asc' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )
        ) : (
          <svg className="w-4 h-4 opacity-0 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        )}
      </span>
    );
  };

  if (sortedCompanies.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
          <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">No companies yet</h3>
        <p className="text-muted-foreground text-sm mb-4">Add your first company to start tracking estimates</p>
      </div>
    );
  }

  // Mobile view - only show Ticker, 5Y Return, and Price
  if (isMobile) {
    return (
      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th
                className="cursor-pointer hover:text-foreground transition-colors group pl-4 pr-2"
                onClick={() => handleSort('ticker')}
              >
                <span className="flex items-center text-xs">
                  Ticker
                  <SortIcon field="ticker" />
                </span>
              </th>
              <th
                className="cursor-pointer hover:text-foreground transition-colors group text-right px-2"
                onClick={() => handleSort('irr_5yr')}
              >
                <span className="flex items-center justify-end text-xs">
                  <span className="text-primary font-semibold">5Y Return</span>
                  <SortIcon field="irr_5yr" />
                </span>
              </th>
              <th
                className="cursor-pointer hover:text-foreground transition-colors group text-right pr-4 pl-2"
                onClick={() => handleSort('current_stock_price')}
              >
                <span className="flex items-center justify-end text-xs">
                  Price
                  <SortIcon field="current_stock_price" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedCompanies.map((company, index) => (
              <tr
                key={company.id}
                className="transition-all duration-150"
              >
                <td className="font-semibold font-mono text-foreground pl-4 pr-2 text-sm">
                  {company.ticker}
                </td>
                <td className="text-right font-mono text-sm sm:text-base px-2" style={getIRRColorStyle(company.irr_5yr)}>
                  {company.irr_5yr !== null && company.irr_5yr !== undefined ? (
                    formatPercentage(company.irr_5yr)
                  ) : (
                    <span
                      title="IRR unavailable — needs a current stock price, an exit multiple, and metric estimates covering the 5-year forward window"
                      className="text-muted-foreground"
                    >
                      —
                    </span>
                  )}
                </td>
                <td
                  className="text-right font-mono text-sm pr-4 pl-2"
                  title={company.price_last_updated ? formatDateTime(company.price_last_updated) : 'Never updated'}
                >
                  {formatPrice(company.current_stock_price) || <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Desktop view - show all columns
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th
              className="cursor-pointer hover:text-foreground transition-colors group"
              onClick={() => handleSort('ticker')}
            >
              <span className="flex items-center">
                Ticker
                <SortIcon field="ticker" />
              </span>
            </th>
            <th
              className="cursor-pointer hover:text-foreground transition-colors group"
              onClick={() => handleSort('company_name')}
            >
              <span className="flex items-center">
                Company
                <SortIcon field="company_name" />
              </span>
            </th>
            <th
              className="cursor-pointer hover:text-foreground transition-colors group text-right min-w-[160px]"
              onClick={() => handleSort('irr_5yr')}
            >
              <span className="flex items-center justify-end">
                <span className="text-primary font-semibold">5Y Return</span>
                <SortIcon field="irr_5yr" />
              </span>
            </th>
            <th
              className="cursor-pointer hover:text-foreground transition-colors group text-right"
              onClick={() => handleSort('current_stock_price')}
            >
              <span className="flex items-center justify-end">
                Price
                <SortIcon field="current_stock_price" />
              </span>
            </th>
            <th
              className="cursor-pointer hover:text-foreground transition-colors group"
              onClick={() => handleSort('exit_multiple_5yr')}
            >
              <span className="flex items-center">
                Exit Multiple
                <SortIcon field="exit_multiple_5yr" />
              </span>
            </th>
            <th
              className="cursor-pointer hover:text-foreground transition-colors group"
              onClick={() => handleSort('analyst_initials')}
            >
              <span className="flex items-center">
                Analyst
                <SortIcon field="analyst_initials" />
              </span>
            </th>
            <th
              className="cursor-pointer hover:text-foreground transition-colors group"
              onClick={() => handleSort('updated_at')}
            >
              <span className="flex items-center">
                Updated
                <SortIcon field="updated_at" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedCompanies.map((company, index) => (
            <tr
              key={company.id}
              className="transition-all duration-150"
            >
              <td className="font-semibold font-mono text-foreground">
                {company.ticker}
              </td>
              <td className="text-foreground">
                {company.company_name}
              </td>
              <td className="text-right font-mono text-base" style={getIRRColorStyle(company.irr_5yr)}>
                {company.irr_5yr !== null && company.irr_5yr !== undefined ? (
                  formatPercentage(company.irr_5yr)
                ) : (
                  <span
                    title="IRR unavailable — needs a current stock price, an exit multiple, and metric estimates covering the 5-year forward window"
                    className="text-muted-foreground"
                  >
                    —
                  </span>
                )}
              </td>
              <td
                className="text-right font-mono"
                title={company.price_last_updated ? formatDateTime(company.price_last_updated) : 'Never updated'}
              >
                {formatPrice(company.current_stock_price) || <span className="text-muted-foreground">—</span>}
              </td>
              <td className="font-mono">
                {company.exit_multiple_5yr !== null && company.exit_multiple_5yr !== undefined ? (
                  <span>
                    {formatMultiple(company.exit_multiple_5yr)}
                    <span className="text-muted-foreground text-xs ml-1 font-sans">({company.metric_type})</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-xs font-medium">
                  {company.analyst_initials}
                </span>
              </td>
              <td className="text-foreground">
                {formatDate(company.updated_at) || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
