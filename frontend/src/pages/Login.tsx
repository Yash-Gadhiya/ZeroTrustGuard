import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2, AlertCircle } from "lucide-react";
import { authApi } from "@/lib/api";
import api from "../api/axios";
import { PinModal } from "@/components/PinModal";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // MFA States
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState("");

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await authApi.login(email, password);

      if (res.data.mfaSetupRequired) {
        localStorage.setItem("ztg_temp_token", res.data.setupToken);
        navigate("/mfa-setup");
        return;
      }

      if (res.data.mfaRequired) {
        setTempToken(res.data.tempToken);
        setShowMfaModal(true);
      } else {
        completeLogin(res.data.token, res.data.role);
      }

    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (pin: string) => {
    setMfaLoading(true);
    setMfaError("");
    try {
      // [H1] Updated endpoint from verify-pin (4-digit) to verify (6-digit TOTP)
      const res = await api.post("/api/mfa/verify", { token: pin }, {
        headers: { Authorization: `Bearer ${tempToken}` }
      });
      setShowMfaModal(false);
      completeLogin(res.data.token, res.data.role);
    } catch (err: any) {
      setMfaError(err.response?.data?.message || "Invalid PIN");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleResetRequest = async (message: string) => {
    setMfaLoading(true);
    setMfaError("");
    try {
      const res = await api.post("/api/mfa/request-change", { reason: message }, {
        headers: { Authorization: `Bearer ${tempToken}` }
      });
      // Close modal and show success logic on main page if needed, or alert
      alert(res.data.message || "Reset request submitted successfully. Please check your Dashboard's 'My Requests' tab if accessible, or contact the IT department directly to follow up on this request.");
      setShowMfaModal(false);
      setTempToken("");
    } catch (err: any) {
      setMfaError(err.response?.data?.message || "Failed to submit reset request.");
    } finally {
      setMfaLoading(false);
    }
  };

  const completeLogin = (token: string, role: string) => {
    localStorage.setItem("ztg_token", token);
    localStorage.setItem("ztg_role", role);

    if (role === "admin" || role === "super_admin") {
      navigate("/soc");
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen login-bg flex items-center justify-center p-4">
      <PinModal
        isOpen={showMfaModal}
        onClose={() => setShowMfaModal(false)}
        onSubmit={handleMfaSubmit}
        loading={mfaLoading}
        error={mfaError}
        title="MFA Verification"
        description="Enter the 6-digit code from your authenticator app."
        onRequestReset={handleResetRequest}
      />
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 glow-border">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">ZeroTrustGuard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zero Trust Insider Threat Protection
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="glass-card p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Sign In</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Access the security operations center
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-md bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                placeholder="analyst@zerotrust.io"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-md bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              "Sign In"
            )}
          </button>

          <p className="text-[11px] text-center text-muted-foreground">
            Protected by Zero Trust Architecture
          </p>
        </form>
                {/* Dev Bypass
        <div className="mt-4 glass-card p-4 space-y-3">
          <p className="text-xs text-muted-foreground text-center uppercase tracking-wider">
            Dev Bypass (no backend needed)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleDevBypass("/dashboard")}
              className="flex-1 py-2 rounded-md bg-secondary border border-border text-sm text-foreground hover:bg-accent transition-colors"
            >
              Employee Dashboard
            </button>
            <button
              onClick={() => handleDevBypass("/soc")}
              className="flex-1 py-2 rounded-md bg-secondary border border-border text-sm text-foreground hover:bg-accent transition-colors"
            >
              SOC Dashboard
            </button>
          </div>
        </div> */}
      </div>
    </div>
  );
};

export default Login;
