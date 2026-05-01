import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { PinModal } from "@/components/PinModal";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, ShieldOff, ShieldCheck, Clock, Users,
  Search, RefreshCw, AlertTriangle, Timer,
} from "lucide-react";

// ── Interfaces ────────────────────────────────────────────────────────────────
interface User {
  id: number;
  name: string | null;
  email: string;
  role: string;
  department: string | null;
  designation: string | null;
  is_blocked: boolean;
  block_reason: string | null;
  blocked_until: string | null;
}

interface MfaRequest {
  id: number;
  reason: string;
  createdAt: string;
  User: { id: number; email: string; name: string; department: string | null };
}

type ActionType = "delete" | "toggle-block" | "lockout" | "unlock-lockout";

const LOCKOUT_DURATIONS = [
  { value: "15m", label: "15 Minutes" },
  { value: "1h",  label: "1 Hour"    },
  { value: "4h",  label: "4 Hours"   },
  { value: "24h", label: "24 Hours"  },
  { value: "7d",  label: "7 Days"    },
];

const roleBadge = (role: string) => {
  const map: Record<string, string> = {
    admin:       "bg-purple-900/30 text-purple-400 border-purple-500/30",
    super_admin: "bg-red-900/30 text-red-400 border-red-500/30",
    senior:      "bg-blue-900/30 text-blue-400 border-blue-500/30",
    staff:       "bg-cyan-900/30 text-cyan-400 border-cyan-500/30",
    intern:      "bg-gray-900/30 text-gray-400 border-gray-500/30",
  };
  return map[role] || "bg-secondary text-muted-foreground border-border";
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [users,       setUsers]       = useState<User[]>([]);
  const [mfaRequests, setMfaRequests] = useState<MfaRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  const [searchEmail,   setSearchEmail]   = useState(searchParams.get("email") || "");
  const [selectedDept,  setSelectedDept]  = useState("all");
  const [selectedRole,  setSelectedRole]  = useState("all");

  // PIN modal state
  const [pinModalOpen,  setPinModalOpen]  = useState(false);
  const [adminPinError, setAdminPinError] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    type: ActionType; id: number; extra?: string
  } | null>(null);

  // Lockout modal state
  const [lockoutModalUser, setLockoutModalUser] = useState<User | null>(null);
  const [lockoutDuration,  setLockoutDuration]  = useState("1h");

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [usersRes, mfaRes] = await Promise.all([
        api.get("/api/soc/users"),
        api.get("/api/mfa/requests"),
      ]);
      setUsers(usersRes.data.filter((u: User) => u.role !== "super_admin"));
      setMfaRequests(mfaRes.data || []);
    } catch (err) {
      console.error("Failed to fetch data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── MFA request handlers ───────────────────────────────────────────────────
  const handleMfaResponse = async (id: number, action: "approve" | "reject") => {
    if (action === "reject") {
      const reason = window.prompt("Reason for rejecting this MFA reset request:");
      if (!reason?.trim()) return;
      try {
        await api.post(`/api/mfa/reject/${id}`, { reason });
        fetchAll(true);
      } catch (err: any) { toast({ title: "Reject Failed", description: err.response?.data?.message || "Failed to reject.", variant: "destructive" }); }
    } else {
      if (!window.confirm("Approve this MFA reset request?")) return;
      try {
        await api.post(`/api/mfa/approve/${id}`, {});
        fetchAll(true);
      } catch (err: any) { toast({ title: "Approve Failed", description: err.response?.data?.message || "Failed to approve.", variant: "destructive" }); }
    }
  };

  // ── PIN-gated actions ─────────────────────────────────────────────────────
  const triggerAction = (type: ActionType, id: number, extra?: string) => {
    setLockoutModalUser(null);   // dismiss lockout picker first
    setPendingAction({ type, id, extra });
    setAdminPinError("");
    setPinModalOpen(true);
  };

  const processAdminAction = async (pin: string) => {
    if (!pendingAction) return;
    const headers = { "x-mfa-pin": pin };
    try {
      const { type, id, extra } = pendingAction;
      if (type === "delete") {
        await api.delete(`/api/users/${id}`, { headers });
      } else if (type === "toggle-block") {
        await api.put(`/api/soc/users/${id}/toggle-block`, {}, { headers });
      } else if (type === "lockout") {
        await api.post(`/api/soc/users/${id}/lockout`, { duration: extra }, { headers });
      } else if (type === "unlock-lockout") {
        await api.post(`/api/soc/users/${id}/unlock-lockout`, {}, { headers });
      }
      setPinModalOpen(false);
      setPendingAction(null);
      setLockoutModalUser(null);
      fetchAll(true);
    } catch (err: any) {
      if (err.response?.data?.pinRequired) {
        setAdminPinError(err.response?.data?.message || "Incorrect PIN");
      } else {
        setPinModalOpen(false);
        setPendingAction(null);
        toast({ title: "Action Failed", description: err.response?.data?.message || "Action failed.", variant: "destructive" });
      }
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const allDepts = [...new Set(users.map(u => u.department).filter(Boolean))] as string[];

  const filteredUsers = users.filter(u => {
    const matchDept  = selectedDept === "all" || u.department === selectedDept;
    const matchRole  = selectedRole === "all" || u.role === selectedRole;
    const matchEmail = !searchEmail || u.email.toLowerCase().includes(searchEmail.toLowerCase());
    return matchDept && matchRole && matchEmail;
  });

  const isLockedOut = (u: User) =>
    !u.is_blocked && u.blocked_until && new Date(u.blocked_until) > new Date();

  const statusOf = (u: User): "active" | "locked" | "blocked" =>
    u.is_blocked ? "blocked" : isLockedOut(u) ? "locked" : "active";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />

      <PinModal
        isOpen={pinModalOpen}
        onClose={() => { setPinModalOpen(false); setPendingAction(null); }}
        onSubmit={processAdminAction}
        error={adminPinError}
        title="Admin Action Required"
        description="Enter your 4-digit security PIN to proceed."
      />

      {/* ── Lockout duration picker modal ────────────────────────────────── */}
      {lockoutModalUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Timer className="w-5 h-5 text-warning" />
              <h2 className="text-lg font-bold">Temporary Lockout</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-1">Locking out:</p>
            <p className="text-sm font-medium text-foreground mb-4">{lockoutModalUser.email}</p>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Duration</label>
            <select
              value={lockoutDuration}
              onChange={e => setLockoutDuration(e.target.value)}
              className="mt-1 mb-6 w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {LOCKOUT_DURATIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 mb-6 text-xs text-warning">
              ⚠️ The user will be blocked from all API access until the lockout expires or is manually cleared. They will receive an account suspension email.
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setLockoutModalUser(null)}
                className="flex-1 py-2 rounded-lg bg-secondary text-foreground text-sm hover:bg-secondary/70 transition-colors border border-border"
              >
                Cancel
              </button>
              <button
                onClick={() => triggerAction("lockout", lockoutModalUser.id, lockoutDuration)}
                className="flex-1 py-2 rounded-lg bg-warning/10 text-warning text-sm font-medium hover:bg-warning/20 border border-warning/30 transition-colors flex items-center justify-center gap-2"
              >
                <Timer className="w-4 h-4" /> Apply Lockout
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6 text-primary" /> User Management
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage access, lockouts, and user accounts across your org.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchAll(false)}
                disabled={loading || refreshing}
                className="px-4 py-2 rounded-lg bg-secondary border border-border text-sm hover:bg-secondary/80 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
              <div className="mr-14"><UserProfileCard /></div>
            </div>
          </div>

          {/* Status overview pills */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Active",   value: users.filter(u => statusOf(u) === "active").length,   cls: "text-green-400", bg: "from-green-900/20 to-green-900/10", border: "border-green-500/20" },
              { label: "Locked Out", value: users.filter(u => statusOf(u) === "locked").length, cls: "text-yellow-400", bg: "from-yellow-900/20 to-yellow-900/10", border: "border-yellow-500/20" },
              { label: "Blocked",  value: users.filter(u => statusOf(u) === "blocked").length,  cls: "text-red-400",   bg: "from-red-900/20 to-red-900/10",   border: "border-red-500/20"   },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border ${s.border} bg-gradient-to-br ${s.bg} p-4`}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className={`text-3xl font-black font-mono mt-1 ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Pending MFA Requests */}
          {mfaRequests.length > 0 && (
            <div className="glass-card rounded-xl border border-amber-500/20 bg-amber-900/10 mb-6 overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-500/20 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Pending MFA Reset Requests
                </h3>
                <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">{mfaRequests.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium">User</th>
                      <th className="px-6 py-3 text-left font-medium">Dept</th>
                      <th className="px-6 py-3 text-left font-medium">Reason</th>
                      <th className="px-6 py-3 text-left font-medium">Submitted</th>
                      <th className="px-6 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mfaRequests.map(req => (
                      <tr key={req.id} className="hover:bg-secondary/20">
                        <td className="px-6 py-3">
                          <p className="font-medium">{req.User.name}</p>
                          <p className="text-xs text-muted-foreground">{req.User.email}</p>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">{req.User.department || "—"}</td>
                        <td className="px-6 py-3 text-muted-foreground max-w-xs truncate">{req.reason || "—"}</td>
                        <td className="px-6 py-3 text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleString()}</td>
                        <td className="px-6 py-3 text-right space-x-2">
                          <button onClick={() => handleMfaResponse(req.id, "reject")}
                            className="px-3 py-1 text-xs rounded border border-border bg-secondary hover:bg-destructive/10 hover:text-destructive transition-colors">Reject</button>
                          <button onClick={() => handleMfaResponse(req.id, "approve")}
                            className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Approve</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by email…"
                value={searchEmail}
                onChange={e => setSearchEmail(e.target.value)}
                className="pl-8 pr-4 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground focus:border-primary focus:outline-none w-64"
              />
            </div>
            <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
              className="px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground focus:border-primary focus:outline-none">
              <option value="all">All Departments</option>
              {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
              className="px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground focus:border-primary focus:outline-none">
              <option value="all">All Roles</option>
              {["intern","staff","senior","admin"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <span className="text-xs text-muted-foreground ml-auto">{filteredUsers.length} users</span>
          </div>

          {/* Users table */}
          <div className="glass-card rounded-xl border border-border overflow-hidden">
            {loading ? (
              <div className="py-16 flex justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                    <tr>
                      <th className="px-6 py-4 font-medium">User</th>
                      <th className="px-6 py-4 font-medium">Department</th>
                      <th className="px-6 py-4 font-medium">Role</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium text-center">Lockout</th>
                      <th className="px-6 py-4 font-medium text-center">Block</th>
                      <th className="px-6 py-4 font-medium text-right">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">No users found</td></tr>
                    )}
                    {filteredUsers.map(user => {
                      const status = statusOf(user);
                      return (
                        <tr key={user.id} className="hover:bg-secondary/20 transition-colors">
                          {/* User */}
                          <td className="px-6 py-4">
                            <p className="font-medium">{user.name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                            {user.designation && <p className="text-xs text-muted-foreground/70 mt-0.5">{user.designation}</p>}
                          </td>
                          {/* Dept */}
                          <td className="px-6 py-4 text-muted-foreground">{user.department || "—"}</td>
                          {/* Role */}
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${roleBadge(user.role)}`}>{user.role}</span>
                          </td>
                          {/* Status */}
                          <td className="px-6 py-4">
                            {status === "blocked" && (
                              <div>
                                <span className="px-2 py-1 rounded text-xs font-bold bg-red-900/30 text-red-400 border border-red-500/20">⛔ BLOCKED</span>
                                {user.block_reason && <p className="text-[10px] text-muted-foreground mt-1">{user.block_reason}</p>}
                              </div>
                            )}
                            {status === "locked" && (
                              <div>
                                <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-900/30 text-yellow-400 border border-yellow-500/20">🔒 LOCKED</span>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  Until {new Date(user.blocked_until!).toLocaleString()}
                                </p>
                              </div>
                            )}
                            {status === "active" && (
                              <span className="px-2 py-1 rounded text-xs font-bold bg-green-900/30 text-green-400 border border-green-500/20">✓ ACTIVE</span>
                            )}
                          </td>

                          {/* Lockout column */}
                          <td className="px-6 py-4 text-center">
                            {status === "locked" ? (
                              <button
                                onClick={() => triggerAction("unlock-lockout", user.id)}
                                className="px-3 py-1.5 text-xs rounded-lg bg-green-900/20 text-green-400 border border-green-500/20 hover:bg-green-900/40 transition-colors flex items-center gap-1 mx-auto"
                              >
                                <ShieldCheck className="w-3 h-3" /> Clear
                              </button>
                            ) : (
                              <button
                                onClick={() => { setLockoutModalUser(user); setLockoutDuration("1h"); }}
                                disabled={status === "blocked"}
                                className="px-3 py-1.5 text-xs rounded-lg bg-yellow-900/20 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-900/40 transition-colors flex items-center gap-1 mx-auto disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Timer className="w-3 h-3" /> Lockout
                              </button>
                            )}
                          </td>

                          {/* Block/Unblock column */}
                          <td className="px-6 py-4 text-center">
                            {user.is_blocked ? (
                              <button
                                onClick={() => triggerAction("toggle-block", user.id)}
                                className="px-3 py-1.5 text-xs rounded-lg bg-green-900/20 text-green-400 border border-green-500/20 hover:bg-green-900/40 transition-colors flex items-center gap-1 mx-auto"
                              >
                                <ShieldCheck className="w-3 h-3" /> Unblock
                              </button>
                            ) : (
                              <button
                                onClick={() => triggerAction("toggle-block", user.id)}
                                className="px-3 py-1.5 text-xs rounded-lg bg-red-900/20 text-red-400 border border-red-500/20 hover:bg-red-900/40 transition-colors flex items-center gap-1 mx-auto"
                              >
                                <ShieldOff className="w-3 h-3" /> Block
                              </button>
                            )}
                          </td>

                          {/* Delete */}
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => triggerAction("delete", user.id)}
                              className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 transition-colors"
                              title="Delete user"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Timer className="w-3 h-3 text-yellow-400" /><strong className="text-yellow-400">Lockout</strong> = time-limited, auto-expires</span>
            <span className="flex items-center gap-1.5"><ShieldOff className="w-3 h-3 text-red-400" /><strong className="text-red-400">Block</strong> = permanent until admin unblocks</span>
          </div>
        </div>
      </main>
    </div>
  );
}