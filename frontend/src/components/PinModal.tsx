import React, { useState } from "react";
import { Loader2, ShieldAlert, X } from "lucide-react";

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
  title = "Authentication Required",
  description = "Please enter your 4-digit PIN to continue."
}: PinModalProps) {
  const [pin, setPin] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === 4) {
      onSubmit(pin);
    }
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
              <ShieldAlert className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••"
                maxLength={4}
                autoFocus
              />
            </div>
            
            {error && (
              <p className="text-destructive text-sm text-center bg-destructive/10 p-2 rounded-md">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pin.length !== 4 || loading}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-md shadow-md hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
