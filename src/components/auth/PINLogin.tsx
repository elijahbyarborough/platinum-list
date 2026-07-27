import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function PINLogin() {
  const { authenticate } = useAuth();
  const [pin, setPin] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const submitPin = async (digits: string[]) => {
    setChecking(true);
    const ok = await authenticate(digits.join(''));
    setChecking(false);
    if (!ok) {
      setError(true);
      setPin(['', '', '', '']);
      inputRefs.current[0]?.focus();
    } else {
      inputRefs.current[3]?.blur();
    }
  };

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError(false);

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // If all 4 digits are entered, check PIN
    if (newPin.every(digit => digit !== '') && index === 3) {
      submitPin(newPin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    if (/^\d{4}$/.test(pastedText)) {
      const digits = pastedText.split('');
      setPin(digits);
      setError(false);
      submitPin(digits);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-secondary/20 p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(160,70%,40%)] flex items-center justify-center shadow-lg">
              <span className="text-background font-bold text-xl">PL</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(160,70%,40%)] bg-clip-text text-transparent">
                Platinum
              </span>
              <span className="text-foreground ml-2">List</span>
            </h1>
          </div>
        </div>

        {/* PIN Input Container */}
        <div className="bg-card border border-border/50 rounded-2xl p-8 shadow-xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-2">Enter PIN</h2>
            <p className="text-sm text-muted-foreground">Please enter your 4-digit PIN to continue</p>
            <p className="text-xs text-muted-foreground/70 italic mt-1">Hint: Office Suite #</p>
          </div>

          <div className="flex justify-center gap-3 mb-4">
            {pin.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                disabled={checking}
                className={cn(
                  'w-14 h-14 text-center text-2xl font-semibold rounded-xl border-2 transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2',
                  error
                    ? 'border-destructive bg-destructive/10 focus:ring-destructive focus:border-destructive'
                    : digit
                    ? 'border-primary bg-primary/10 focus:ring-primary focus:border-primary text-foreground'
                    : 'border-border bg-background focus:ring-primary focus:border-primary text-foreground'
                )}
                autoComplete="off"
              />
            ))}
          </div>

          {error && (
            <div className="text-center">
              <p className="text-sm text-destructive font-medium">Incorrect PIN. Please try again.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
