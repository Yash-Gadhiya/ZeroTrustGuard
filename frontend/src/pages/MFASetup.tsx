import { useState } from "react";
import api from "../api/axios";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function MFASetup() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();

  const handleSetup = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/mfa/set-pin", { pin });
      setSuccess(true);
      setTimeout(() => navigate(-1), 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to setup MFA PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <main className="flex-1 p-8 relative flex items-center justify-center">
        <div className="absolute top-6 right-8 z-50">
          <UserProfileCard />
        </div>

        <div className="glass-card max-w-md w-full p-8 border border-border rounded-xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] rounded-full pointer-events-none" />

          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Multi-Factor Authentication</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Secure your account with a 4-digit PIN for sensitive actions and logins.
              </p>
            </div>
          </div>

          {!success && (
            <div className="space-y-6 flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-full space-y-2">
                <label className="text-sm font-medium text-foreground text-center block mb-4">Set 4-Digit Security PIN</label>
                <div className="space-y-4 pt-4">
                  <input
                    type="password"
                    className="form-input w-full p-3 rounded-lg border border-border bg-secondary text-foreground focus:ring-2 focus:ring-primary/50 text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                  />
                  
                  {error && <p className="text-destructive text-sm text-center bg-destructive/10 p-2 rounded">{error}</p>}
                  
                  <button
                    onClick={handleSetup}
                    disabled={loading || pin.length !== 4}
                    className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg shadow-md hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
                    {loading ? "Saving..." : "Setup PIN"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in duration-500 py-8">
              <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center border border-success/30">
                <ShieldCheck className="w-10 h-10 text-success" />
              </div>
              <h2 className="text-xl font-bold text-foreground">PIN Enabled!</h2>
              <p className="text-sm text-muted-foreground">
                Your account is now protected. Redirecting...
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
