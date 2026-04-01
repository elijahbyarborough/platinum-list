import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Change, EditChange, DeletionChange } from '@/types/editHistory';
import { api } from '@/utils/api';
import { formatDate, formatDateTime, formatMultiple, formatPercentage, formatPrice } from '@/utils/formatting';
import { cn } from '@/lib/utils';

// Get IRR color class based on value
function getIRRColorClass(irr: number | null | undefined): string {
  if (irr === null || irr === undefined) return 'text-muted-foreground';
  
  const percentage = irr * 100;
  if (percentage >= 15) return 'irr-excellent';
  if (percentage >= 10) return 'irr-good';
  if (percentage >= 5) return 'irr-moderate';
  if (percentage >= 0) return 'irr-low';
  return 'irr-negative';
}

function EstimatesGrid({ 
  estimates, 
  compareEstimates,
  showChanges = false,
  metricType
}: { 
  estimates: { fiscal_year: number; metric_value: number | null; dividend_value: number | null; ma_value?: number | null }[];
  compareEstimates?: { fiscal_year: number; metric_value: number | null; dividend_value: number | null; ma_value?: number | null }[];
  showChanges?: boolean;
  metricType?: string;
}) {
  const sortedEstimates = [...estimates].sort((a, b) => a.fiscal_year - b.fiscal_year);
  
  const compareMap = new Map<number, typeof estimates[0]>();
  if (compareEstimates) {
    for (const est of compareEstimates) {
      compareMap.set(est.fiscal_year, est);
    }
  }
  
  if (sortedEstimates.length === 0) {
    return <span className="text-muted-foreground text-xs">No estimates</span>;
  }
  
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="text-xs font-mono w-full">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left pr-2 font-normal">FY</th>
              <th className="text-right pr-2 font-normal">{metricType || 'Metric'}</th>
              <th className="text-right pr-2 font-normal">Div</th>
              <th className="text-right font-normal">M&A</th>
            </tr>
          </thead>
          <tbody>
            {sortedEstimates.map((est) => {
              const compareEst = compareMap.get(est.fiscal_year);
              const metricChanged = showChanges && compareEst && compareEst.metric_value !== est.metric_value;
              const divChanged = showChanges && compareEst && compareEst.dividend_value !== est.dividend_value;
              const maChanged = showChanges && compareEst && (compareEst.ma_value ?? null) !== (est.ma_value ?? null);

              return (
                <tr key={est.fiscal_year}>
                  <td className="pr-2 text-muted-foreground">{est.fiscal_year}</td>
                  <td className={cn(
                    "text-right pr-2",
                    metricChanged && "bg-primary/20 border border-primary/50 rounded"
                  )}>
                    {est.metric_value !== null ? est.metric_value.toFixed(2) : '—'}
                  </td>
                  <td className={cn(
                    "text-right pr-2",
                    divChanged && "bg-primary/20 border border-primary/50 rounded"
                  )}>
                    {est.dividend_value !== null ? est.dividend_value.toFixed(2) : '—'}
                  </td>
                  <td className={cn(
                    "text-right",
                    maChanged && "bg-primary/20 border border-primary/50 rounded"
                  )}>
                    {est.ma_value !== null && est.ma_value !== undefined ? est.ma_value.toFixed(2) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditChangeRow({ change, isExpanded, onToggle }: { change: EditChange; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className={cn(
      "rounded-lg bg-card border border-border/50 overflow-hidden transition-all",
      isExpanded && "ring-1 ring-primary/30"
    )}>
      {/* Compact Header - Always Visible */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded">
            Edit
          </span>
          <span className="font-mono font-semibold">{change.ticker}</span>
          <span className="text-muted-foreground text-sm hidden sm:inline">{change.company_name}</span>
        </div>
        <div className="flex items-center gap-4">
          {/* IRR Change */}
          <div className="flex items-center gap-2 text-sm">
            <span className={cn('font-mono', getIRRColorClass(change.before.irr_5yr))}>
              {change.before.irr_5yr !== null ? formatPercentage(change.before.irr_5yr) : '—'}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className={cn('font-mono', getIRRColorClass(change.after.irr_5yr))}>
              {change.after.irr_5yr !== null ? formatPercentage(change.after.irr_5yr) : '—'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline">
            {formatDateTime(change.changed_at)}
          </span>
          <svg 
            className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border/50">
          <div className="p-4 text-xs text-muted-foreground md:hidden">
            {formatDateTime(change.changed_at)}
          </div>
          <div className="p-6 pt-2 md:pt-6">
            {/* Original Submission Info */}
            {change.before.original_submitted_at && (
              <div className="mb-6 pb-4 border-b border-border/50">
                <div className="text-xs text-muted-foreground mb-1">Original Submission</div>
                <div className="text-sm">{formatDateTime(change.before.original_submitted_at)}</div>
              </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Before Column */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    Before
                  </h4>
                </div>
                
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Price</div>
                      <div className="font-mono">
                        {change.before.current_stock_price !== null ? (
                          formatPrice(change.before.current_stock_price)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Exit Multiple</div>
                      <div className="font-mono">
                        {change.before.exit_multiple !== null ? (
                          <span>
                            {formatMultiple(change.before.exit_multiple)}
                            <span className="text-muted-foreground text-xs ml-1 font-sans">({change.before.metric_type})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">5Y Return</div>
                      <div className={cn('font-mono text-lg font-semibold', getIRRColorClass(change.before.irr_5yr))}>
                        {change.before.irr_5yr !== null ? formatPercentage(change.before.irr_5yr) : '—'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Estimates</div>
                    <EstimatesGrid estimates={change.before.estimates} metricType={change.before.metric_type} />
                  </div>
                </div>
              </div>

              {/* After Column */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <h4 className="font-semibold text-sm uppercase tracking-wider text-primary">
                    After
                  </h4>
                </div>
                
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Price</div>
                      <div className="font-mono">
                        {change.after.current_stock_price !== null ? (
                          formatPrice(change.after.current_stock_price)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Exit Multiple</div>
                      <div className="font-mono">
                        {change.after.exit_multiple !== null ? (
                          <span>
                            {formatMultiple(change.after.exit_multiple)}
                            <span className="text-muted-foreground text-xs ml-1 font-sans">({change.after.metric_type})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">5Y Return</div>
                      <div className={cn('font-mono text-lg font-semibold', getIRRColorClass(change.after.irr_5yr))}>
                        {change.after.irr_5yr !== null ? formatPercentage(change.after.irr_5yr) : '—'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Estimates</div>
                    <EstimatesGrid 
                      estimates={change.after.estimates} 
                      compareEstimates={change.before.estimates}
                      showChanges={true}
                      metricType={change.after.metric_type}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeletionChangeRow({ change, isExpanded, onToggle }: { change: DeletionChange; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className={cn(
      "rounded-lg bg-card border border-destructive/30 overflow-hidden transition-all",
      isExpanded && "ring-1 ring-destructive/30"
    )}>
      {/* Compact Header - Always Visible */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-destructive/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-xs font-medium bg-destructive/20 text-destructive rounded">
            Deleted
          </span>
          <span className="font-mono font-semibold">{change.ticker}</span>
          <span className="text-muted-foreground text-sm hidden sm:inline">{change.company_name}</span>
        </div>
        <div className="flex items-center gap-4">
          {/* IRR at deletion */}
          <div className="flex items-center gap-2 text-sm">
            <span className={cn('font-mono', getIRRColorClass(change.deleted.irr_5yr))}>
              {change.deleted.irr_5yr !== null ? formatPercentage(change.deleted.irr_5yr) : '—'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline">
            {formatDateTime(change.changed_at)}
          </span>
          <svg 
            className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-destructive/30">
          <div className="p-4 text-xs text-muted-foreground md:hidden">
            {formatDateTime(change.changed_at)}
          </div>
          <div className="p-6 pt-2 md:pt-6">
            {/* Original Submission Info */}
            {change.deleted.original_submitted_at && (
              <div className="mb-6 pb-4 border-b border-destructive/30">
                <div className="text-xs text-muted-foreground mb-1">Original Submission</div>
                <div className="text-sm">{formatDateTime(change.deleted.original_submitted_at)}</div>
              </div>
            )}
            
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <h4 className="font-semibold text-sm uppercase tracking-wider text-destructive">
                  Deleted Submission
                </h4>
              </div>
              
              <div className="space-y-3">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Price</div>
                    <div className="font-mono">
                      {change.deleted.current_stock_price !== null ? (
                        formatPrice(change.deleted.current_stock_price)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Exit Multiple</div>
                    <div className="font-mono">
                      {change.deleted.exit_multiple !== null ? (
                        <span>
                          {formatMultiple(change.deleted.exit_multiple)}
                          <span className="text-muted-foreground text-xs ml-1 font-sans">({change.deleted.metric_type})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">5Y Return</div>
                    <div className={cn('font-mono text-lg font-semibold', getIRRColorClass(change.deleted.irr_5yr))}>
                      {change.deleted.irr_5yr !== null ? formatPercentage(change.deleted.irr_5yr) : '—'}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-2">Estimates at Time of Deletion</div>
                  <EstimatesGrid estimates={change.deleted.estimates} metricType={change.deleted.metric_type} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditHistory() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const { data: changes = [], isLoading, error } = useQuery({
    queryKey: ['changes'],
    queryFn: api.getChanges,
  });

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading changes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center p-8 rounded-lg bg-card border border-destructive/20">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Data</h3>
          <p className="text-muted-foreground text-sm">Unable to fetch changes. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-grid-pattern">
      <div className="container mx-auto px-6 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight mb-1">All Changes</h1>
          <p className="text-muted-foreground">History of all edits and deletions</p>
        </div>

        {changes.length === 0 ? (
          <div className="rounded-xl bg-card border border-border/50 p-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">No changes yet</h3>
            <p className="text-muted-foreground text-sm">Change history will appear here once companies are edited or deleted</p>
          </div>
        ) : (
          <div className="space-y-2">
            {changes.map((change, index) => {
              const id = `${change.type}-${index}`;
              return change.type === 'edit' ? (
                <EditChangeRow 
                  key={id} 
                  change={change} 
                  isExpanded={expandedId === id}
                  onToggle={() => toggleExpanded(id)}
                />
              ) : (
                <DeletionChangeRow 
                  key={id} 
                  change={change} 
                  isExpanded={expandedId === id}
                  onToggle={() => toggleExpanded(id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
