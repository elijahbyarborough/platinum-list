import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

interface TickerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (ticker: string, companyName: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export function TickerAutocomplete({
  value,
  onChange,
  onSelect,
  disabled,
  required,
}: TickerAutocompleteProps) {
  // Use internal state for the input text so we don't depend on parent re-renders
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync internal state if parent value changes (e.g., form reset)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions when inputValue changes
  useEffect(() => {
    if (disabled || inputValue.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(inputValue)}`,
          { signal: controller.signal }
        );
        if (response.ok) {
          const results: SearchResult[] = await response.json();
          // Filter out empty results from Yahoo
          const valid = results.filter((r) => r && r.symbol);
          setSuggestions(valid);
          setShowSuggestions(valid.length > 0);
          setSelectedIndex(-1);
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Error fetching suggestions:', error);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [inputValue, disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const upper = e.target.value.toUpperCase();
      setInputValue(upper);
      onChange(upper);
    },
    [onChange]
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setInputValue(result.symbol);
      onChange(result.symbol);
      onSelect(result.symbol, result.name);
      setShowSuggestions(false);
      setSuggestions([]);
    },
    [onChange, onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          id="ticker"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="e.g., AAPL"
          required={required}
          disabled={disabled}
          autoComplete="off"
          className="font-mono uppercase"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {!disabled && showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-popover border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="max-h-64 overflow-auto">
            {suggestions.map((result, index) => (
              <button
                key={result.symbol}
                type="button"
                className={cn(
                  'w-full px-4 py-3 text-left transition-colors duration-150',
                  'border-b border-border/30 last:border-b-0',
                  'focus:outline-none',
                  index === selectedIndex
                    ? 'bg-primary/10'
                    : 'hover:bg-secondary/50'
                )}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-foreground">
                      {result.symbol}
                    </span>
                    <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {result.name}
                    </span>
                  </div>
                  {result.exchange && (
                    <span className="text-xs text-muted-foreground/70 bg-secondary px-2 py-0.5 rounded">
                      {result.exchange}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Keyboard hint */}
          <div className="px-4 py-2 bg-secondary/30 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">↵</kbd>
              Select
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
