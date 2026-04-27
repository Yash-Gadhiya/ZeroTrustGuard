import React, { useState, useRef, useEffect } from "react";
import { Loader2, ShieldAlert, X, Smartphone } from "lucide-react";

interface OtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (token: string) => void;
  loading?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  onRequestReset?: (message: string) => void;
}

export function PinModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  error = null,
  title = "Authentication Required",
  description = "Enter the 6-digit code from your authenticator app.",
  onRequestReset,
}: OtpModalProps) {
  // 6 individual digit slots for a premium OTP input feel
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setDigits(Array(6).fill(""));
      setIsResetMode(false);
      setResetMessage("");
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const token = digits.join("");

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];

    if (value.length > 1) {
      // Handle paste — distribute digits across slots
      const pasted = value.replace(/\D/g, "").slice(0, 6);
      const filled = pasted.split("");
      const updated = [...digits];
      filled.forEach((d, i) => { if (index + i < 6) updated[index + i] = d; });
      setDigits(updated);
      const nextIndex = Math.min(index + filled.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newDigits[index] = value;
    setDigits(newDigits);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isResetMode && onRequestReset) {
      if (!resetMessage.trim()) return;
      onRequestReset(resetMessage);
      return;
    }
    if (token.length === 6 && !loading) onSubmit(token);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-background border border-border rounded-xl max-w-sm w-full shadow-2xl overflow-hidden relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex flex-col items-center text-center space-y-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isResetMode ? (
              <>
                {/* 6-digit OTP slot input */}
                <div className="flex justify-center gap-2">
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      className={`w-10 h-12 text-center text-xl font-mono font-bold rounded-lg border-2 bg-secondary text-foreground focus:outline-none transition-all
                        ${digit ? "border-primary" : "border-border"}
                        focus:border-primary focus:ring-2 focus:ring-primary/20`}
                    />
                  ))}
                </div>

                {error && (
                  <p className="text-destructive text-sm text-center bg-destructive/10 p-2 rounded-md">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={token.length !== 6 || loading}
                  className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-md shadow-md hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify Code"}
                </button>

                {onRequestReset && (
                  <button
                    type="button"
                    onClick={() => setIsResetMode(true)}
                    className="w-full text-xs text-primary hover:underline"
                  >
                    Lost Authenticator? Request Reset
                  </button>
                )}
                
                <p className="text-xs text-center text-muted-foreground mt-4">
                  Codes refresh every 30 seconds
                </p>
              </>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="text-sm text-muted-foreground text-center">
                  Please provide a reason for your MFA reset request (e.g. "Got a new phone"). Our administrators will review it.
                </p>
                
                <textarea
                  value={resetMessage}
                  onChange={(e) => setResetMessage(e.target.value)}
                  placeholder="Reason for reset..."
                  className="w-full p-3 rounded-lg border-2 border-border bg-secondary text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                  required
                />

                {error && (
                  <p className="text-destructive text-sm text-center bg-destructive/10 p-2 rounded-md">
                    {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsResetMode(false)}
                    className="flex-1 py-3 bg-secondary text-foreground font-semibold rounded-md hover:bg-secondary/80 transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!resetMessage.trim() || loading}
                    className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-md shadow-md hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
