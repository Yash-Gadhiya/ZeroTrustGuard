import { useState, useRef } from "react";
import api from "../api/axios";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { Loader2, ShieldCheck, Smartphone, Copy, CheckCircle2, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

type SetupStep = "idle" | "qr" | "confirm" | "done" | "request" | "requested";

export default function MFASetup() {
  const [step, setStep]         = useState<SetupStep>("idle");
  const [qrCode, setQrCode]     = useState<string>("");
  const [backupCode, setBackupCode] = useState<string>("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const otpInput = digits.join("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);

  const navigate = useNavigate();

  // ── Step 1: Generate QR code ─────────────────────────────────────────────
  const handleGenerateQR = async () => {
    setLoading(true);
    setError(null);
    try {
      const tempToken = localStorage.getItem("ztg_temp_token");
      const headers = tempToken ? { Authorization: `Bearer ${tempToken}` } : {};
      const res = await api.post("/api/mfa/setup", {}, { headers });
      setQrCode(res.data.qrCode);
      setBackupCode(res.data.backupCode);
      setStep("qr");
    } catch (err: any) {
      // Backend signals that this user already has MFA and needs admin approval to reset
      if (err.response?.data?.needsApproval) {
        setStep("request");
        setError(null);
      } else {
        setError(err.response?.data?.message || "Failed to generate QR code. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitResetRequest = async () => {
    if (!requestReason.trim()) return;
    setRequestLoading(true);
    setError(null);
    try {
      await api.post("/api/mfa/request-change", { reason: requestReason });
      setStep("requested");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to submit request. Please try again.");
    } finally {
      setRequestLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];

    if (value.length > 1) {
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
    if (e.key === "Enter" && otpInput.length === 6 && !loading) {
      handleConfirmSetup();
    }
  };

  // ── Step 2: Confirm first TOTP code ──────────────────────────────────────
  const handleConfirmSetup = async () => {
    if (otpInput.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const tempToken = localStorage.getItem("ztg_temp_token");
      const headers = tempToken ? { Authorization: `Bearer ${tempToken}` } : {};
      const res = await api.post("/api/mfa/verify", { token: otpInput, confirmSetup: true }, { headers });
      
      // Setup successful, save the returned real tokens and remove temp token
      localStorage.removeItem("ztg_temp_token");
      if (res.data.token) {
        localStorage.setItem("ztg_token", res.data.token);
        localStorage.setItem("ztg_role", res.data.role);
      }

      setStep("done");
      setTimeout(() => {
        if (res.data.role === "admin" || res.data.role === "super_admin") {
          navigate("/soc");
        } else {
          navigate("/dashboard");
        }
      }, 2500);
    } catch (err: any) {
      setError(err.response?.data?.message || "Invalid code. Make sure your device time is correct.");
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCode = () => {
    navigator.clipboard.writeText(backupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

          {/* Header */}
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              {step === "done"
                ? <CheckCircle2 className="w-8 h-8 text-green-500" />
                : <Smartphone className="w-8 h-8 text-primary" />
              }
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {step === "done"      ? "MFA Activated!" :
                 step === "request"   ? "Reset Authenticator" :
                 step === "requested" ? "Request Sent" :
                 "Setup Authenticator App"}
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                {step === "idle"      && "Protect your account with Google Authenticator or Authy."}
                {step === "qr"        && "Scan the QR code with your authenticator app."}
                {step === "confirm"   && "Enter the 6-digit code from your app to confirm."}
                {step === "done"      && "Your account is now protected. Redirecting..."}
                {step === "request"   && "Submit a request below to have an admin reset your MFA."}
                {step === "requested" && "Waiting for admin approval."}
              </p>
            </div>
          </div>

          {/* ── Step: Idle ── */}
          {step === "idle" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400">
              <div className="bg-secondary/50 rounded-lg p-4 border border-border space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">How it works</p>
                <ol className="text-sm text-foreground space-y-1 list-decimal list-inside">
                  <li>Install <strong>Google Authenticator</strong> or <strong>Authy</strong></li>
                  <li>Scan the QR code shown on the next screen</li>
                  <li>Enter the 6-digit code to activate</li>
                </ol>
              </div>
              {error && <p className="text-destructive text-sm text-center bg-destructive/10 p-2 rounded">{error}</p>}
              <button
                onClick={handleGenerateQR}
                disabled={loading}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg shadow-md hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
                {loading ? "Generating..." : "Generate QR Code"}
              </button>
            </div>
          )}

          {/* ── Step: Request Admin Approval ── */}
          {step === "request" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400">
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                <p className="text-sm text-warning font-semibold mb-1">Admin Approval Required</p>
                <p className="text-xs text-muted-foreground">
                  Your MFA authenticator is already configured. To reset it and generate a new QR code,
                  an admin must approve your request. Please provide a reason below.
                </p>
              </div>
              {error && <p className="text-destructive text-sm text-center bg-destructive/10 p-2 rounded">{error}</p>}
              <textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="e.g. Got a new phone and need to re-enroll my authenticator app..."
                className="w-full h-28 p-3 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <button
                onClick={handleSubmitResetRequest}
                disabled={requestLoading || !requestReason.trim()}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {requestLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
                {requestLoading ? "Submitting..." : "Submit Reset Request"}
              </button>
            </div>
          )}

          {/* ── Step: Request Submitted ── */}
          {step === "requested" && (
            <div className="flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in duration-500 py-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-semibold">Request Submitted!</p>
              <p className="text-xs text-muted-foreground">
                Your MFA reset request has been sent to an admin for review.
                You can track the status in the <strong>My Requests</strong> tab of your dashboard.
                If urgent, please contact the IT department directly.
              </p>
            </div>
          )}

          {/* ── Step: Show QR ── */}
          {step === "qr" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">
              <div className="flex justify-center">
                <div className="p-3 bg-white rounded-xl border border-border shadow-inner">
                  <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48" />
                </div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Manual entry key (if QR scan fails)</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-foreground break-all flex-1">{backupCode}</code>
                  <button onClick={copyBackupCode} className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                onClick={() => setStep("confirm")}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <KeyRound className="w-5 h-5" />
                I've scanned the QR code
              </button>
            </div>
          )}

          {/* ── Step: Confirm OTP ── */}
          {step === "confirm" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Enter the 6-digit code shown in your app</p>
              </div>

              {/* Slot-style OTP input */}
              <div className="flex justify-center gap-2">
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={`w-10 h-12 text-center text-xl font-mono font-bold rounded-lg border-2 bg-secondary text-foreground focus:outline-none transition-all
                      ${digit ? "border-primary bg-primary/10" : "border-border"}
                      focus:border-primary focus:ring-2 focus:ring-primary/20`}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Tap the boxes above then type your code, or type directly
              </p>

              {error && <p className="text-destructive text-sm text-center bg-destructive/10 p-2 rounded">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep("qr"); setDigits(Array(6).fill("")); setError(null); }}
                  className="flex-1 py-3 bg-secondary text-foreground rounded-lg border border-border hover:bg-accent transition-all text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmSetup}
                  disabled={otpInput.length !== 6 || loading}
                  className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {loading ? "Verifying..." : "Activate MFA"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in duration-500 py-4">
              <p className="text-sm text-muted-foreground">
                TOTP is now active. You'll need your authenticator app every time you log in.
              </p>
              <div className="w-full bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <p className="text-xs text-green-500 font-medium">✓ Google Authenticator compatible</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
