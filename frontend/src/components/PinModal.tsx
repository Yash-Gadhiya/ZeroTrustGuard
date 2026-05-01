import React, { useState, useRef, useEffect } from "react";
import { Loader2, X, Lock } from "lucide-react";

/**
 * PinModal — 4-digit PIN challenge modal for post-login sensitive actions.
 * Each slot shows a dot (●) via type="password" instead of the raw digit.
 *
 * For the login TOTP step (6-digit), use TotpModal instead.
 */

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  loading?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
}

export function PinModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  error = null,
  title = "Action Requires PIN",
  description = "Enter your 4-digit security PIN to proceed.",
}: PinModalProps) {
  const [digits, setDigits] = useState<string[]>(Array(4).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const submitLock = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setDigits(Array(4).fill(""));
      submitLock.current = false;
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!loading) submitLock.current = false;
  }, [loading]);

  if (!isOpen) return null;

  const pin = digits.join("");

  const handleChange = (index: number, value: string) => {
    // Extract only the last digit typed (ignores browser password masking artifacts)
    const digit = value.replace(/\D/g, "").slice(-1);
    const updated = [...digits];
    updated[index] = digit;
    setDigits(updated);
    if (digit && index < 3) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        // Clear current slot
        const updated = [...digits];
        updated[index] = "";
        setDigits(updated);
      } else if (index > 0) {
        // Move to previous slot and clear it
        const updated = [...digits];
        updated[index - 1] = "";
        setDigits(updated);
        inputRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
    }
    if (e.key === "Enter" && pin.length === 4 && !loading) handleSubmit();
  };

  const handlePaste = (e: React.ClipboardEvent, startIndex: number) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;
    const updated = [...digits];
    pasted.split("").forEach((d, i) => {
      if (startIndex + i < 4) updated[startIndex + i] = d;
    });
    setDigits(updated);
    inputRefs.current[Math.min(startIndex + pasted.length, 3)]?.focus();
  };

  const handleSubmit = () => {
    if (submitLock.current || loading || pin.length !== 4) return;
    submitLock.current = true;
    onSubmit(pin);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-background border border-border rounded-xl max-w-xs w-full shadow-2xl overflow-hidden relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex flex-col items-center text-center space-y-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* 4 password slots — browser renders dots automatically */}
            <div className="flex justify-center gap-3">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoComplete="off"
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={(e) => handlePaste(e, i)}
                  className={`w-14 h-14 text-center text-2xl font-mono font-bold rounded-xl border-2 bg-secondary text-foreground
                    focus:outline-none transition-all select-none
                    ${digit ? "border-primary bg-primary/10" : "border-border"}
                    focus:border-primary focus:ring-2 focus:ring-primary/20`}
                />
              ))}
            </div>

            {error && (
              <p className="text-destructive text-sm text-center bg-destructive/10 p-2 rounded-md">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={pin.length !== 4 || loading}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-md shadow-md hover:bg-primary/90
                transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
