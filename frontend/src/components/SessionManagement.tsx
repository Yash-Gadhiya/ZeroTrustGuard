import { useState, useEffect, useCallback } from "react";
import { MonitorOff, Shield, Loader2, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from "../api/axios";
import { PinModal } from "@/components/PinModal";

interface Session {
  id: number;
  userId: number;
  jti: string;
  role: string;
  ip: string;
  userAgent: string;
  expiresAt: string;
  createdAt: string;
  User?: {
    email: string;
    name: string;
    department: string;
    role: string;
  };
}

interface Props {
  currentJti?: string; // pass req.user.jti so we can highlight/protect own session
}

export function SessionManagement({ currentJti }: Props) {
  const { toast } = useToast();
  const [sessions, setSessions]     = useState<Session[]>([]);
  const [loading, setLoading]       = useState(true);
  const [kickTarget, setKickTarget] = useState<Session | null>(null);
  const [pinError, setPinError]     = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get("/api/sessions");
      setSessions(res.data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const iv = setInterval(fetchSessions, 60_000);
    return () => clearInterval(iv);
  }, [fetchSessions]);

  const handleKick = async (pin: string) => {
    if (!kickTarget) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/sessions/${kickTarget.jti}`, {
        headers: { "x-mfa-pin": pin },
      });
      setSessions(prev => prev.filter(s => s.jti !== kickTarget.jti));
      setKickTarget(null);
      setPinError("");
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to revoke session.";
      if (err.response?.data?.mfaRequired) {
        setPinError(msg);
      } else {
        setKickTarget(null);
        toast({ title: "Session Revocation Failed", description: msg, variant: "destructive" });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const formatUA = (ua: string) => {
    if (!ua) return "Unknown";
    if (ua.includes("Chrome"))  return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari"))  return "Safari";
    if (ua.includes("Edge"))    return "Edge";
    return ua.slice(0, 28);
  };

  const formatExpiry = (iso: string) => {
    const d = new Date(iso);
    const mins = Math.round((d.getTime() - Date.now()) / 60000);
    if (mins <= 0) return "Expired";
    if (mins < 60) return `${mins}m remaining`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m remaining`;
  };

  return (
    <>
      <PinModal
        isOpen={!!kickTarget}
        onClose={() => { setKickTarget(null); setPinError(""); }}
        onSubmit={handleKick}
        error={pinError}
        title="Force-Kick Session"
        description={`Enter your authenticator code to revoke the session for ${kickTarget?.User?.email || kickTarget?.jti}`}
      />

      <div
        style={{
          background: "rgba(15,23,42,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "24px",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "rgba(96,165,250,0.15)", borderRadius: 8, padding: 8, display: "flex" }}>
              <Wifi size={18} color="#60a5fa" />
            </div>
            <div>
              <h3 style={{ color: "#f8fafc", fontWeight: 700, fontSize: 14, margin: 0 }}>
                Active Sessions
              </h3>
              <p style={{ color: "#64748b", fontSize: 11, margin: 0 }}>
                {sessions.length} live session{sessions.length !== 1 ? "s" : ""} · Auto-refresh 30s
              </p>
            </div>
          </div>
          <button
            onClick={fetchSessions}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
            <Loader2 size={24} color="#60a5fa" className="animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
            No active sessions found.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sessions.map(session => {
              const isOwn = session.jti === currentJti;
              const roleColor = session.role === "admin" || session.role === "super_admin" ? "#f97316" : "#60a5fa";
              return (
                <div
                  key={session.jti}
                  style={{
                    background: isOwn ? "rgba(96,165,250,0.06)" : "rgba(255,255,255,0.03)",
                    border: isOwn ? "1px solid rgba(96,165,250,0.25)" : "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* Icon */}
                  <Shield size={18} color={isOwn ? "#60a5fa" : "#475569"} style={{ flexShrink: 0 }} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {session.User?.email || `User #${session.userId}`}
                      </span>
                      {isOwn && (
                        <span style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                          YOU
                        </span>
                      )}
                      <span style={{ background: `${roleColor}1A`, color: roleColor, fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                        {session.role?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span style={{ color: "#64748b", fontSize: 11 }}>📍 {session.ip || "Unknown IP"}</span>
                      <span style={{ color: "#64748b", fontSize: 11 }}>🌐 {formatUA(session.userAgent)}</span>
                      <span style={{ color: "#64748b", fontSize: 11 }}>⏳ {formatExpiry(session.expiresAt)}</span>
                      <span style={{ color: "#64748b", fontSize: 11 }}>🕐 {new Date(session.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {/* Force-kick */}
                  {!isOwn && (
                    <button
                      onClick={() => setKickTarget(session)}
                      disabled={actionLoading}
                      style={{
                        background: "rgba(239,68,68,0.1)", color: "#ef4444",
                        border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8,
                        padding: "6px 12px", fontSize: 12, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      <MonitorOff size={14} />
                      Force Kick
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
