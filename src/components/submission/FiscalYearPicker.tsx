import { useMemo, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCurrentFiscalYear, parseDateOnly } from '@/utils/fiscalYear';

interface FiscalYearPickerProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function FiscalYearPicker({ value, onChange, required }: FiscalYearPickerProps) {
  const [userHasEdited, setUserHasEdited] = useState(false);
  const [fiscalYearInput, setFiscalYearInput] = useState<string>('');

  // Calculate current fiscal year based on the date
  const calculatedFiscalYear = useMemo(() => {
    if (!value) return null;
    return getCurrentFiscalYear(value);
  }, [value]);

  // Sync fiscal year input with calculated value when date changes (only if user hasn't edited)
  useEffect(() => {
    if (calculatedFiscalYear !== null && !userHasEdited) {
      setFiscalYearInput(calculatedFiscalYear.toString());
    }
  }, [calculatedFiscalYear, userHasEdited]);

  // Initialize fiscal year input when value is first set
  useEffect(() => {
    if (calculatedFiscalYear !== null && fiscalYearInput === '') {
      setFiscalYearInput(calculatedFiscalYear.toString());
    }
  }, [calculatedFiscalYear, fiscalYearInput]);

  // Handle date input change
  const handleDateChange = (newValue: string) => {
    setUserHasEdited(true);
    onChange(newValue);
  };

  // Handle fiscal year input change - update the date to match
  const handleFiscalYearChange = (newFY: string) => {
    setFiscalYearInput(newFY);
    setUserHasEdited(true);
    
    const fyNum = parseInt(newFY, 10);
    if (!isNaN(fyNum) && fyNum >= 1900 && fyNum <= 2200 && value) {
      // Keep the month/day, swap in the entered year. Format from local
      // components — toISOString() would shift the date across midnight UTC.
      const existingDate = parseDateOnly(value);
      const month = String(existingDate.getMonth() + 1).padStart(2, '0');
      const day = String(existingDate.getDate()).padStart(2, '0');
      onChange(`${fyNum}-${month}-${day}`);
    }
  };

  // Show "Estimated" if there's a value but user hasn't manually edited it
  const showEstimated = value && !userHasEdited;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="fiscal_year_end_date">Next Fiscal Year End</Label>
        <div className="relative">
          <Input
            id="fiscal_year_end_date"
            type="date"
            value={value}
            onChange={(e) => handleDateChange(e.target.value)}
            required={required}
            className="font-mono h-12 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          />
          {showEstimated && (
            <span className="absolute right-12 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-xs italic pointer-events-none">
              Estimated
            </span>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="current_fiscal_year">Current Fiscal Year</Label>
        <div className="relative">
          <div className="h-12 px-4 rounded-lg bg-secondary/50 border border-border flex items-center">
            <span className="text-muted-foreground font-mono mr-1">FY</span>
            <input
              id="current_fiscal_year"
              type="number"
              value={fiscalYearInput}
              onChange={(e) => handleFiscalYearChange(e.target.value)}
              className="font-mono text-lg bg-transparent border-none outline-none w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="2025"
            />
          </div>
          {showEstimated && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-xs italic pointer-events-none">
              Estimated
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
