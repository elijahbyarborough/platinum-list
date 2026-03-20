import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export interface StockQuote {
  price: number | null;
  companyName: string | null;
  fiscalYearEnd?: string | null; // Date string YYYY-MM-DD
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

/**
 * Search for ticker symbols
 */
export async function searchTickers(query: string): Promise<SearchResult[]> {
  try {
    const results = await yahooFinance.search(query);
    return results.quotes
      .filter((quote: any) => quote.symbol)
      .slice(0, 10)
      .map((quote: any) => ({
        symbol: quote.symbol,
        name: quote.longname || quote.shortname || quote.symbol,
        exchange: quote.exchange,
        type: quote.quoteType,
      }));
  } catch (error) {
    console.error(`Error searching for ${query}:`, error);
    return [];
  }
}

/**
 * Fetch current stock price by ticker
 */
export async function getPrice(ticker: string): Promise<number | null> {
  try {
    const quote = await yahooFinance.quote(ticker);
    return quote.regularMarketPrice || null;
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch company name by ticker
 */
export async function getCompanyName(ticker: string): Promise<string | null> {
  try {
    const quote = await yahooFinance.quote(ticker);
    return quote.longName || quote.shortName || null;
  } catch (error) {
    console.error(`Error fetching company name for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch both price and company name
 */
export async function getQuote(ticker: string): Promise<StockQuote> {
  try {
    const quote = await yahooFinance.quote(ticker);
    return {
      price: quote.regularMarketPrice || null,
      companyName: quote.longName || quote.shortName || null,
      fiscalYearEnd: null,
    };
  } catch (error) {
    console.error(`Error fetching quote for ${ticker}:`, error);
    return {
      price: null,
      companyName: null,
      fiscalYearEnd: null,
    };
  }
}

/**
 * Fetch fiscal year end date from quoteSummary
 * @returns Next fiscal year end date as YYYY-MM-DD string
 */
export async function getFiscalYearEnd(ticker: string): Promise<string | null> {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ['defaultKeyStatistics', 'calendarEvents'],
    });

    // Try defaultKeyStatistics for fiscal year end
    if (summary.defaultKeyStatistics?.lastFiscalYearEnd) {
      const lastFiscalYearEnd = summary.defaultKeyStatistics.lastFiscalYearEnd;
      if (lastFiscalYearEnd) {
        const baseDate = new Date(lastFiscalYearEnd);
        
        // Use UTC methods to avoid timezone shifts
        const month = baseDate.getUTCMonth();
        const day = baseDate.getUTCDate();
        
        const today = new Date();
        const currentYear = today.getFullYear();
        
        // Create date using UTC to avoid timezone issues
        let nextFiscalYearEnd = new Date(Date.UTC(currentYear, month, day));
        
        // Check if this year's FYE has passed (compare in local time)
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const fyeLocal = new Date(currentYear, month, day);
        
        if (fyeLocal <= todayStart) {
          nextFiscalYearEnd = new Date(Date.UTC(currentYear + 1, month, day));
        }
        
        // Format as YYYY-MM-DD using UTC values
        const year = nextFiscalYearEnd.getUTCFullYear();
        const m = String(nextFiscalYearEnd.getUTCMonth() + 1).padStart(2, '0');
        const d = String(nextFiscalYearEnd.getUTCDate()).padStart(2, '0');
        
        return `${year}-${m}-${d}`;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching fiscal year end for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch complete quote including fiscal year end
 */
export async function getCompleteQuote(ticker: string): Promise<StockQuote> {
  try {
    const quote = await yahooFinance.quote(ticker);
    
    let fiscalYearEnd: string | null = null;
    try {
      fiscalYearEnd = await getFiscalYearEnd(ticker);
    } catch (fyeError) {
      console.warn(`Could not fetch fiscal year end for ${ticker}:`, fyeError);
    }

    return {
      price: quote.regularMarketPrice || null,
      companyName: quote.longName || quote.shortName || null,
      fiscalYearEnd: fiscalYearEnd,
    };
  } catch (error) {
    console.error(`Error fetching complete quote for ${ticker}:`, error);
    return {
      price: null,
      companyName: null,
      fiscalYearEnd: null,
    };
  }
}
