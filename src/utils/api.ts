import { CompanyWithEstimates, CompanyFormData } from '@/types/company';
import { ApiResponse, RefreshPricesResponse } from '@/types/api';
import { SubmissionLogEntry } from '@/types/submissionLog';
import { EditComparison, Change } from '@/types/editHistory';
import { authHeaders, handleUnauthorized } from '@/utils/authToken';

// In production (Vercel), API is same-origin. In development, proxy handles it.
const API_BASE_URL = '/api';

interface DashboardSnapshot {
  id: number;
  snapshot_date: string;
  pdf_url: string;
  created_at: string;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired. Please enter your PIN again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Companies
  getCompanies: (): Promise<CompanyWithEstimates[]> => {
    return fetchApi<CompanyWithEstimates[]>('/companies');
  },

  getCompany: (ticker: string): Promise<CompanyWithEstimates> => {
    return fetchApi<CompanyWithEstimates>(`/companies/${ticker}`);
  },

  getSubmissionForEdit: (ticker: string): Promise<{
    ticker: string;
    company_name: string;
    submitted_at: string;
    price_at_submission: number | null;
    price_submitted_at: string | null;
  }> => {
    return fetchApi(`/companies/${ticker}/submission`);
  },

  createCompany: (data: CompanyFormData): Promise<CompanyWithEstimates> => {
    return fetchApi<CompanyWithEstimates>('/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  refreshPrice: (ticker: string): Promise<CompanyWithEstimates> => {
    return fetchApi<CompanyWithEstimates>(`/companies/${ticker}/refresh-price`, {
      method: 'POST',
    });
  },

  refreshAllPrices: (): Promise<RefreshPricesResponse> => {
    return fetchApi<RefreshPricesResponse>('/prices/refresh-all', {
      method: 'POST',
    });
  },

  // Submission Logs
  getSubmissionLogs: (): Promise<SubmissionLogEntry[]> => {
    return fetchApi<SubmissionLogEntry[]>('/submission-logs');
  },

  deleteSubmissionLog: (id: number): Promise<{ success: boolean }> => {
    return fetchApi<{ success: boolean }>(`/submission-logs/${id}`, {
      method: 'DELETE',
    });
  },

  // Edit History (legacy)
  getEditHistory: (): Promise<EditComparison[]> => {
    return fetchApi<EditComparison[]>('/edit-history');
  },

  // Changes (edits + deletions)
  getChanges: (): Promise<Change[]> => {
    return fetchApi<Change[]>('/changes');
  },

  // Dashboard Snapshots
  getDashboardSnapshots: (): Promise<DashboardSnapshot[]> => {
    return fetchApi<DashboardSnapshot[]>('/dashboard-snapshots');
  },
};
