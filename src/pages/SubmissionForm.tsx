import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { EstimatesTable } from '@/components/submission/EstimatesTable';
import { TickerAutocomplete } from '@/components/submission/TickerAutocomplete';
import { FiscalYearPicker } from '@/components/submission/FiscalYearPicker';
import { IRRPreview } from '@/components/submission/IRRPreview';
import { api } from '@/utils/api';
import { CompanyFormData, MetricType, AnalystInitials, EstimateFormData } from '@/types/company';
import { formatPrice, formatDateTime } from '@/utils/formatting';
import { authHeaders } from '@/utils/authToken';

export default function SubmissionForm() {
  const navigate = useNavigate();
  const { ticker } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [stockPrice, setStockPrice] = useState<number | null>(null);
  const [priceLastUpdated, setPriceLastUpdated] = useState<string | null>(null);
  const [refreshingPrice, setRefreshingPrice] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const [showOverrideDate, setShowOverrideDate] = useState(false);

  const [formData, setFormData] = useState<CompanyFormData>({
    ticker: ticker?.toUpperCase() || '',
    company_name: '',
    fiscal_year_end_date: '',
    metric_type: 'GAAP EPS',
    analyst_initials: 'EY',
    exit_multiple_5yr: null,
    estimates: [],
    override_updated_at: null,
  });

  // Load existing company data if editing
  const {
    data: existingCompany,
    isLoading: loadingCompany,
    error: companyError,
  } = useQuery({
    queryKey: ['company', ticker],
    queryFn: () => api.getCompany(ticker!),
    enabled: !!ticker,
  });

  // Load original submission data to get the locked price
  const { data: submissionData, isLoading: loadingSubmission } = useQuery({
    queryKey: ['submission', ticker],
    queryFn: () => api.getSubmissionForEdit(ticker!),
    enabled: !!ticker,
  });

  // Reset form when navigating to /submit (new submission, not edit)
  // Use location.key to detect navigation even when staying on the same route
  useEffect(() => {
    if (!ticker && location.pathname === '/submit') {
      // Reset form state for new submission
      setFormData({
        ticker: '',
        company_name: '',
        fiscal_year_end_date: '',
        metric_type: 'GAAP EPS',
        analyst_initials: 'EY',
        exit_multiple_5yr: null,
        estimates: [],
        override_updated_at: null,
      });
      setStockPrice(null);
      setPriceLastUpdated(null);
      setSubmissionSuccess(null);
    }
  }, [location.key, location.pathname, ticker]);

  useEffect(() => {
    if (existingCompany) {
      setFormData({
        ticker: existingCompany.ticker,
        company_name: existingCompany.company_name,
        fiscal_year_end_date: existingCompany.fiscal_year_end_date,
        metric_type: existingCompany.metric_type,
        analyst_initials: existingCompany.analyst_initials,
        exit_multiple_5yr: existingCompany.exit_multiple_5yr || null,
        estimates: existingCompany.estimates || [],
        override_updated_at: null,
      });
    }
  }, [existingCompany]);

  // Set price from original submission when editing (locked price)
  useEffect(() => {
    if (submissionData && ticker) {
      setStockPrice(submissionData.price_at_submission);
      setPriceLastUpdated(submissionData.price_submitted_at);
    }
  }, [submissionData, ticker]);

  const handleTickerSelect = async (selectedTicker: string, companyName: string) => {
    const normalizedTicker = selectedTicker.toUpperCase();
    setFormData((prev) => ({
      ...prev,
      ticker: normalizedTicker,
      company_name: companyName,
    }));
    
    // Fetch stock price and fiscal year end for the selected ticker
    await refreshStockPrice(normalizedTicker);
  };

  const refreshStockPrice = async (tickerToRefresh?: string) => {
    const tickerSymbol = tickerToRefresh || formData.ticker;
    if (!tickerSymbol) return;

    // Abort any in-flight fetch so a slow response for a previously selected
    // ticker can't overwrite this one's price/fiscal year
    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;

    setRefreshingPrice(true);
    setQuoteError(null);
    try {
      // Use the quote endpoint which doesn't require the company to exist
      const response = await fetch(`/api/companies/${tickerSymbol}/quote`, {
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.price !== null) {
          setStockPrice(data.price);
          setPriceLastUpdated(new Date().toISOString());
        } else {
          setQuoteError(`No price available for ${tickerSymbol}. Try Refresh, or submit without a price.`);
        }
        // Auto-populate fiscal year end if available
        if (data.fiscalYearEnd) {
          setFormData((prev) => ({
            ...prev,
            fiscal_year_end_date: data.fiscalYearEnd,
          }));
        }
      } else {
        setQuoteError(`Could not fetch a price for ${tickerSymbol}. Try Refresh.`);
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Error fetching stock price:', error);
        setQuoteError(`Could not fetch a price for ${tickerSymbol}. Try Refresh.`);
      }
    } finally {
      if (quoteAbortRef.current === controller) {
        setRefreshingPrice(false);
      }
    }
  };

  const createCompanyMutation = useMutation({
    mutationFn: api.createCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      const dateString = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      setSubmissionSuccess(`Submission accepted at ${timeString} on ${dateString}`);
    },
    onError: (error: Error) => {
      console.error('Submission error:', error);
      alert(`Failed to submit: ${error.message || 'Unknown error'}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.ticker || !formData.company_name || !formData.fiscal_year_end_date) {
      alert('Please fill in all required fields');
      return;
    }

    // New submissions lock in the price permanently — warn before locking in nothing
    if (!ticker && stockPrice === null) {
      const proceed = window.confirm(
        'No stock price was fetched, so this submission will be saved without one and the IRR cannot be calculated. Submit anyway?'
      );
      if (!proceed) return;
    }

    // Prepare submission data
    // For new submissions, include the stock price
    // For edits, don't send price - it stays locked to original submission
    const submissionData = {
      ...formData,
      current_stock_price: ticker ? undefined : stockPrice,
      price_last_updated: ticker ? undefined : priceLastUpdated,
      // Tell the API whether this is an edit (from /edit/:ticker) or new submission (from /submit)
      isEdit: !!ticker,
    };

    createCompanyMutation.mutate(submissionData);
  };

  const handleEstimatesChange = (estimates: EstimateFormData[]) => {
    setFormData(prev => ({ ...prev, estimates }));
  };

  // When editing, don't render the form until the existing data has loaded —
  // otherwise a slow/failed load shows an empty form that could be submitted
  // as an "edit" wiping the real estimates
  if (ticker && (loadingCompany || loadingSubmission)) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading {ticker}…
        </div>
      </div>
    );
  }

  if (ticker && companyError) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-destructive font-medium">Could not load {ticker} for editing.</p>
          <p className="text-sm text-muted-foreground">{(companyError as Error).message}</p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-grid-pattern">
      <div className="container mx-auto px-6 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            {ticker ? 'Edit Estimates' : 'New Submission'}
          </h1>
          <p className="text-muted-foreground">
            {ticker ? `Updating estimates for ${ticker}` : 'Add a new company with earnings estimates'}
          </p>
        </div>

        {/* Edit Warning Banner */}
        {ticker && (
          <div className="mb-8 flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-500">You are editing previously submitted estimates</p>
              <p className="text-xs text-muted-foreground mt-1">
                This page is for correcting mistakes only. If you need to submit new estimates, go to New Submission instead.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Company Information Section */}
          <section className="form-section">
            <h2 className="form-section-title flex items-center gap-2">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Company Information
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="ticker">Ticker Symbol</Label>
                <TickerAutocomplete
                  value={formData.ticker}
                  onChange={(value) => setFormData({ ...formData, ticker: value })}
                  onSelect={handleTickerSelect}
                  disabled={!!ticker}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="e.g., Apple Inc."
                  disabled={!!ticker}
                  required
                />
              </div>

              {/* Stock Price Display */}
              <div className="space-y-2">
                <Label>{ticker ? 'Price at Submission' : 'Current Stock Price'}</Label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-12 px-4 rounded-lg bg-secondary/50 border border-border flex items-center">
                    {refreshingPrice ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-muted-foreground text-sm">Fetching...</span>
                      </div>
                    ) : stockPrice !== null ? (
                      <span className="font-mono text-xl font-semibold text-[hsl(var(--irr-excellent))]">
                        {formatPrice(stockPrice)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  {!ticker && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => refreshStockPrice()}
                      disabled={!formData.ticker || refreshingPrice}
                      className="h-12 px-4"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </Button>
                  )}
                  {ticker && (
                    <div className="px-3 py-2 text-xs text-muted-foreground bg-secondary rounded-lg">
                      Locked
                    </div>
                  )}
                </div>
                {quoteError && !ticker && (
                  <p className="text-xs text-destructive">{quoteError}</p>
                )}
                {priceLastUpdated && !ticker && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {formatDateTime(priceLastUpdated)}
                  </p>
                )}
                {ticker && priceLastUpdated && (
                  <p className="text-xs text-muted-foreground">
                    Submitted: {formatDateTime(priceLastUpdated)}
                  </p>
                )}
              </div>

              <div>
                <FiscalYearPicker
                  value={formData.fiscal_year_end_date}
                  onChange={(date) => setFormData({ ...formData, fiscal_year_end_date: date, estimates: [] })}
                  required
                />
              </div>
              
              {/* Override Updated Date - Hidden by default, only for new submissions (Excel imports) */}
              {!ticker && (
                <div className="space-y-2">
                  {!showOverrideDate ? (
                    <button
                      type="button"
                      onClick={() => setShowOverrideDate(true)}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Set override date for Excel imports
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="override_updated_at">Override Updated Date (Optional)</Label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowOverrideDate(false);
                            setFormData({ ...formData, override_updated_at: null });
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Hide
                        </button>
                      </div>
                      <Input
                        id="override_updated_at"
                        type="datetime-local"
                        value={formData.override_updated_at || ''}
                        onChange={(e) => setFormData({ ...formData, override_updated_at: e.target.value || null })}
                        placeholder="Leave blank to use submission time"
                        className="font-mono h-12 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground">
                        For Excel imports: Set the date when these estimates were actually created. Dashboard will show this date, but submission log will show when you submitted.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Analysis Settings Section */}
          <section className="form-section">
            <h2 className="form-section-title flex items-center gap-2">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Analysis Settings
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="metric_type">Metric Type</Label>
                <Select
                  id="metric_type"
                  value={formData.metric_type}
                  onChange={(e) => {
                    const newMetricType = e.target.value as MetricType;
                    // When metric type changes, clear estimates (start fresh)
                    // Old estimates for other metric types remain in the database untouched
                    setFormData({ 
                      ...formData, 
                      metric_type: newMetricType,
                      estimates: [],
                      exit_multiple_5yr: null  // Also clear exit multiple since it's specific to the metric
                    });
                  }}
                  required
                >
                  <option value="GAAP EPS">GAAP EPS</option>
                  <option value="Norm. EPS">Norm. EPS</option>
                  <option value="Mgmt. EPS">Mgmt. EPS</option>
                  <option value="FCFPS">FCFPS</option>
                  <option value="DEPS">DEPS</option>
                  <option value="NAVPS">NAVPS</option>
                  <option value="BVPS">BVPS</option>
                  <option value="DPS">DPS</option>
                  <option value="Other">Other</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="exit_multiple_5yr">5-Year Exit Multiple</Label>
                <Input
                  id="exit_multiple_5yr"
                  type="number"
                  step="0.1"
                  value={formData.exit_multiple_5yr === null ? '' : formData.exit_multiple_5yr}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      exit_multiple_5yr: e.target.value === '' ? null : parseFloat(e.target.value),
                    })
                  }
                  placeholder="e.g., 15.5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="analyst_initials">Analyst</Label>
                <Select
                  id="analyst_initials"
                  value={formData.analyst_initials}
                  onChange={(e) => setFormData({ ...formData, analyst_initials: e.target.value as AnalystInitials })}
                  required
                >
                  <option value="EY">EY</option>
                  <option value="TR">TR</option>
                  <option value="JM">JM</option>
                  <option value="BB">BB</option>
                  <option value="NM">NM</option>
                </Select>
              </div>
            </div>
          </section>

          {/* Estimates Section */}
          <section className="form-section">
            <h2 className="form-section-title flex items-center gap-2">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Earnings Estimates
            </h2>
            
            <EstimatesTable
              fiscalYearEndDate={formData.fiscal_year_end_date}
              estimates={formData.estimates}
              onEstimatesChange={handleEstimatesChange}
              metricType={formData.metric_type}
            />
          </section>

          {/* IRR Preview */}
          <IRRPreview
            currentPrice={stockPrice}
            exitMultiple={formData.exit_multiple_5yr}
            fiscalYearEndDate={formData.fiscal_year_end_date}
            estimates={formData.estimates}
            metricType={formData.metric_type}
          />

          {/* Action Buttons */}
          <div className="flex items-center gap-4 pt-4">
            <Button 
              type="submit" 
              disabled={createCompanyMutation.isPending}
              size="lg"
              className="min-w-[180px]"
            >
              {createCompanyMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {ticker ? 'Edit Estimates' : 'Submit Estimates'}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => navigate('/dashboard')}
            >
              Cancel
            </Button>
          </div>
          
          {submissionSuccess && (
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {submissionSuccess}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
