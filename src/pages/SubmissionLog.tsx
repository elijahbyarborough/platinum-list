import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { SubmissionLogEntry } from '@/types/submissionLog';
import { api } from '@/utils/api';
import { formatPrice, formatPercentage, formatMultiple, formatDate, formatDateTime } from '@/utils/formatting';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

export default function SubmissionLog() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['submissionLogs'],
    queryFn: api.getSubmissionLogs,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteSubmissionLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionLogs'] });
      setDeleteConfirm(null);
    },
    onError: (err: Error) => {
      setDeleteConfirm(null);
      alert(`Failed to delete submission: ${err.message || 'Unknown error'}`);
    },
  });

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading submission log...</p>
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
          <p className="text-muted-foreground text-sm">Unable to fetch submission logs. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-grid-pattern">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Submission Log</h1>
            <p className="text-muted-foreground">Historical record of all submissions to the library</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/edit-history')}
            className="gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            See All Changes
          </Button>
        </div>

        {/* Table Section */}
        <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-border/50">
            <h2 className="text-lg font-semibold">All Submissions</h2>
            <p className="text-sm text-muted-foreground">
              Complete history of all estimate submissions, ordered by most recent
            </p>
          </div>
          
          {logs.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">No submissions yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Submission history will appear here once estimates are submitted</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="cursor-pointer hover:text-foreground transition-colors group">
                      <span className="flex items-center">
                        Ticker
                      </span>
                    </th>
                    <th className="cursor-pointer hover:text-foreground transition-colors group">
                      <span className="flex items-center">
                        Company
                      </span>
                    </th>
                    <th className="cursor-pointer hover:text-foreground transition-colors group text-right">
                      <span className="flex items-center justify-end">
                        Price at Submission
                      </span>
                    </th>
                    <th className="cursor-pointer hover:text-foreground transition-colors group text-right">
                      <span className="flex items-center justify-end">
                        Exit Multiple
                      </span>
                    </th>
                    <th className="cursor-pointer hover:text-foreground transition-colors group text-right min-w-[160px]">
                      <span className="flex items-center justify-end">
                        5Y Return
                      </span>
                    </th>
                    <th className="cursor-pointer hover:text-foreground transition-colors group">
                      <span className="flex items-center">
                        Submitted At
                      </span>
                    </th>
                    <th className="cursor-pointer hover:text-foreground transition-colors group">
                      <span className="flex items-center">
                        Analyst
                      </span>
                    </th>
                    <th className="text-right">
                      <span className="flex items-center justify-end">
                        Actions
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="transition-all duration-150">
                      <td className="font-semibold font-mono text-foreground">
                        {log.ticker}
                      </td>
                      <td className="text-foreground">
                        {log.company_name}
                      </td>
                      <td className="text-right font-mono">
                        {formatPrice(log.price_at_submission) || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-right font-mono">
                        {log.exit_multiple !== null && log.exit_multiple !== undefined ? (
                          <span>
                            {formatMultiple(log.exit_multiple)}
                            <span className="text-muted-foreground text-xs ml-1 font-sans">({log.metric_type})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={cn('text-right font-mono text-base', getIRRColorClass(log.irr_5yr))}>
                        {log.irr_5yr !== null && log.irr_5yr !== undefined ? (
                          formatPercentage(log.irr_5yr)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-muted-foreground text-sm">
                        {formatDateTime(log.submitted_at) || '—'}
                      </td>
                      <td>
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-xs font-medium">
                          {log.analyst_initials}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/edit/${log.ticker}`);
                            }}
                            className="gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </Button>
                          {deleteConfirm === log.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(log.id);
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                {deleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm(null);
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(log.id);
                              }}
                              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

