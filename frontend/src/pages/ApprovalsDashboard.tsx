import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle, XCircle, Clock, ShieldAlert, RefreshCw,
  History, FileText, ChevronDown, ChevronUp,
} from "lucide-react";
import api from "../api/axios";

// ── Interfaces ────────────────────────────────────────────────────────────────
interface AccessRequest {
  id: number;
  reason: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
  Requester: { id: number; name: string; email: string; role: string };
  File: { id: number; filename: string; department: string };
}

interface MfaRequest {
  id: number;
  status: string;
  createdAt: string;
  User?: { id: number; email: string; name: string };
}

type Tab = "access" | "mfa" | "history";
type EmpTab = "file" | "mfa";

const PAGE_SIZES = [10, 25, 50];

const statusBadge = (status: string) => {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "bg-green-900/30 text-green-400 border border-green-500/30";
  if (s === "rejected") return "bg-red-900/30 text-red-400 border border-red-500/30";
  return "bg-yellow-900/30 text-yellow-400 border border-yellow-500/30";
};

const ApprovalsDashboard = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab) || "access"
  );

  const [requests,    setRequests]    = useState<AccessRequest[]>([]);
  const [mfaRequests, setMfaRequests] = useState<MfaRequest[]>([]);
  const [history,     setHistory]     = useState<AccessRequest[]>([]);

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState("");

  const [processingId, setProcessingId] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Duration + download options per request
  const [approveDuration, setApproveDuration] = useState<Record<number, string>>({});
  const [approveDownload, setApproveDownload] = useState<Record<number, boolean>>({});

  // Reject modal
  const [rejectModalOpen,  setRejectModalOpen]  = useState(false);
  const [rejectType,       setRejectType]       = useState<"access" | "mfa">("access");
  const [rejectRequestId,  setRejectRequestId]  = useState<number | null>(null);
  const [rejectReason,     setRejectReason]     = useState("");

  // History pagination + filter
  const [historyPage,       setHistoryPage]       = useState(1);
  const [historyPageSize,   setHistoryPageSize]   = useState(25);
  const [historyFilter,     setHistoryFilter]     = useState<"all" | "approved" | "rejected">("all");
  const [historyExpanded,   setHistoryExpanded]   = useState<number | null>(null);

  // ── Fetchers ────────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await api.get("/api/access-requests/pending");
      setRequests(res.data.requests || []);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not fetch requests.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchMfaRequests = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await api.get("/api/mfa/requests");
      setMfaRequests(res.data || []);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not fetch MFA requests.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await api.get("/api/access-requests/history");
      setHistory(res.data.history || []);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not fetch history.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  const refreshCurrent = useCallback((silent = false) => {
    if (activeTab === "access")  fetchRequests(silent);
    else if (activeTab === "mfa") fetchMfaRequests(silent);
    else fetchHistory(silent);
  }, [activeTab, fetchRequests, fetchMfaRequests, fetchHistory]);

  useEffect(() => { refreshCurrent(false); }, [activeTab]);

  // 30s silent background poll
  useEffect(() => {
    pollingRef.current = setInterval(() => refreshCurrent(true), 30_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [refreshCurrent]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleApprove = async (id: number) => {
    const duration    = approveDuration[id] || "1_hour";
    const allowDownload = approveDownload[id] || false;
    setProcessingId(id);
    try {
      await api.post(`/api/access-requests/${id}/approve`, { duration, allowDownload });
      setRequests(r => r.filter(req => req.id !== id));
    } catch (err: any) { toast({ title: "Approve Failed", description: err.response?.data?.message || "Failed to approve.", variant: "destructive" }); }
    setProcessingId(null);
  };

  const openRejectModal = (id: number, type: "access" | "mfa" = "access") => {
    setRejectRequestId(id); setRejectType(type); setRejectReason(""); setRejectModalOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectRequestId || !rejectReason.trim()) return;
    setProcessingId(rejectRequestId);
    try {
      if (rejectType === "access") {
        await api.post(`/api/access-requests/${rejectRequestId}/reject`, { reason: rejectReason });
        setRequests(r => r.filter(req => req.id !== rejectRequestId));
      } else {
        await api.post(`/api/mfa/reject/${rejectRequestId}`, { reason: rejectReason });
        setMfaRequests(r => r.filter(req => req.id !== rejectRequestId));
      }
      setRejectModalOpen(false);
    } catch (err: any) { toast({ title: "Reject Failed", description: err.response?.data?.message || "Failed to reject.", variant: "destructive" }); }
    finally { setProcessingId(null); }
  };

  const handleMfaApprove = async (id: number) => {
    setProcessingId(id);
    try {
      await api.post(`/api/mfa/approve/${id}`, {});
      setMfaRequests(r => r.filter(req => req.id !== id));
    } catch (err: any) { toast({ title: "MFA Approve Failed", description: err.response?.data?.message || "Failed to approve MFA reset.", variant: "destructive" }); }
    setProcessingId(null);
  };

  // ── Derived history data ────────────────────────────────────────────────────
  const filteredHistory = historyFilter === "all"
    ? history
    : history.filter(h => h.status === historyFilter);

  const histTotal  = filteredHistory.length;
  const histPages  = Math.max(1, Math.ceil(histTotal / historyPageSize));
  const safePage   = Math.min(historyPage, histPages);
  const histStart  = (safePage - 1) * historyPageSize;
  const pagedHist  = filteredHistory.slice(histStart, histStart + historyPageSize);

  const tabCounts = {
    access:  requests.length,
    mfa:     mfaRequests.length,
    history: history.filter(h => h.status === historyFilter || historyFilter === "all").length,
  };

  // ── Role-based view split ─────────────────────────────────────────────────
  const role = localStorage.getItem("ztg_role") || "intern";
  const isAdmin = role === "admin" || role === "super_admin";

  // ── Employee state ────────────────────────────────────────────────────────
  const [empFileReqs,  setEmpFileReqs]  = useState<any[]>([]);
  const [empMfaReqs,   setEmpMfaReqs]   = useState<any[]>([]);
  const [empTab,       setEmpTab]       = useState<EmpTab>("file");
  const [empLoading,   setEmpLoading]   = useState(true);
  const [empError,     setEmpError]     = useState("");

  useEffect(() => {
    if (!isAdmin) {
      fetchEmpData();
    }
  }, [isAdmin]);

  const fetchEmpData = async () => {
    setEmpLoading(true); setEmpError("");
    try {
      const [fileRes, mfaRes] = await Promise.all([
        api.get("/api/access-requests/my-requests"),
        api.get("/api/mfa/my-requests"),
      ]);
      setEmpFileReqs(fileRes.data.requests || []);
      setEmpMfaReqs(mfaRes.data || []);
    } catch (err: any) {
      setEmpError(err.response?.data?.message || "Could not load your requests.");
    } finally { setEmpLoading(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  // ▸ EMPLOYEE VIEW — read-only, user-scoped
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen bg-background text-foreground">
        <AppSidebar />
        <main className="flex-1 p-8 relative overflow-y-auto">
          <div className="absolute top-6 right-8 z-50"><UserProfileCard /></div>
          <div className="max-w-5xl mx-auto mt-4">

            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">My Requests</h1>
                <p className="text-sm text-muted-foreground mt-1">Track all your submitted file access and MFA requests.</p>
              </div>
              <button onClick={fetchEmpData} disabled={empLoading}
                className="mr-14 px-4 py-2 rounded-lg bg-secondary border border-border text-sm hover:bg-secondary/80 transition-colors inline-flex items-center gap-2 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${empLoading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Total Requests",  value: empFileReqs.length + empMfaReqs.length, cls: "text-primary",    bg: "from-primary/10 to-primary/5",       border: "border-primary/20"   },
                { label: "Approved",        value: [...empFileReqs, ...empMfaReqs].filter(r => r.status === "approved").length, cls: "text-green-400",  bg: "from-green-900/20 to-green-900/5",   border: "border-green-500/20" },
                { label: "Pending",         value: [...empFileReqs, ...empMfaReqs].filter(r => r.status === "pending").length,  cls: "text-yellow-400", bg: "from-yellow-900/20 to-yellow-900/5", border: "border-yellow-500/20"},
              ].map(s => (
                <div key={s.label} className={`rounded-xl border ${s.border} bg-gradient-to-br ${s.bg} p-5`}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`text-3xl font-black font-mono ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-5 bg-secondary/40 border border-border rounded-xl p-1 w-fit">
              {([ { id: "file", label: "File Access Requests", count: empFileReqs.length }, { id: "mfa", label: "MFA Requests", count: empMfaReqs.length } ] as const).map(tab => (
                <button key={tab.id} onClick={() => setEmpTab(tab.id)}
                  className={`px-5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                    empTab === tab.id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}>
                  {tab.label}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${ empTab === tab.id ? "bg-white/20" : "bg-secondary text-muted-foreground"}`}>{tab.count}</span>
                </button>
              ))}
            </div>

            {empError && (
              <div className="p-4 mb-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">{empError}</div>
            )}

            {empLoading ? (
              <div className="flex justify-center mt-16"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
            ) : (
              <div className="glass-card border border-border rounded-xl overflow-hidden">
                {empTab === "file" ? (
                  empFileReqs.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
                      <CheckCircle className="w-10 h-10 opacity-30" />
                      <p>No file access requests yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                          <tr>
                            <th className="px-5 py-4 font-medium">File</th>
                            <th className="px-5 py-4 font-medium">Reason</th>
                            <th className="px-5 py-4 font-medium">Submitted</th>
                            <th className="px-5 py-4 font-medium">Status</th>
                            <th className="px-5 py-4 font-medium">Feedback</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {empFileReqs.map((req: any) => (
                            <tr key={req.id} className="hover:bg-secondary/20 transition-colors">
                              <td className="px-5 py-4 font-medium max-w-[180px] truncate" title={req.File?.filename}>
                                {req.File?.filename || "Unknown File"}
                                <span className="block text-xs text-muted-foreground">{req.File?.department}</span>
                              </td>
                              <td className="px-5 py-4 text-xs text-muted-foreground max-w-[180px] truncate" title={req.reason}>{req.reason || "—"}</td>
                              <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">{new Date(req.createdAt).toLocaleString()}</td>
                              <td className="px-5 py-4">
                                <span className={`px-2 py-1 rounded text-[10px] font-semibold capitalize ${statusBadge(req.status)}`}>{req.status}</span>
                              </td>
                              <td className="px-5 py-4 text-xs max-w-[200px] truncate" title={req.rejectionReason || ""}>
                                {req.status === "rejected" ? (<span className="text-red-400">{req.rejectionReason || "No reason given"}</span>) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : (
                  empMfaReqs.length === 0 ? (
                    <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
                      <CheckCircle className="w-10 h-10 opacity-30" />
                      <p>No MFA requests yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                          <tr>
                            <th className="px-5 py-4 font-medium">Type</th>
                            <th className="px-5 py-4 font-medium">Submitted</th>
                            <th className="px-5 py-4 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {empMfaReqs.map((req: any) => (
                            <tr key={req.id} className="hover:bg-secondary/20 transition-colors">
                              <td className="px-5 py-4 font-medium">MFA Reset Request</td>
                              <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">{new Date(req.createdAt).toLocaleString()}</td>
                              <td className="px-5 py-4">
                                <span className={`px-2 py-1 rounded text-[10px] font-semibold capitalize ${statusBadge(req.status)}`}>{req.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── ADMIN VIEW — full existing behaviour below ───────────────────────────
  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />

      {/* Reject modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-lg shadow-lg border border-border p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Reject {rejectType === "access" ? "Access" : "MFA Reset"} Request
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Provide a reason for rejection.</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. You do not have permission for this file..."
              className="w-full h-32 p-3 bg-background border border-border rounded-md text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-md bg-secondary hover:bg-secondary/80 transition text-sm font-medium">
                Cancel
              </button>
              <button onClick={handleRejectSubmit}
                disabled={processingId === rejectRequestId || !rejectReason.trim()}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                {processingId === rejectRequestId && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-8 relative overflow-y-auto">
        <div className="absolute top-6 right-8 z-50"><UserProfileCard /></div>

        <div className="max-w-6xl mx-auto mt-4">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Admin Approvals</h1>
              <p className="text-sm text-muted-foreground mt-1">Manage pending & historical requests.</p>
            </div>
            <button
              onClick={() => refreshCurrent(false)}
              disabled={loading || refreshing}
              className="mr-14 px-4 py-2 rounded-md bg-secondary border border-border text-sm text-foreground hover:bg-secondary/80 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border mb-6 gap-1">
            {(["access", "mfa", "history"] as Tab[]).map(tab => (
              <button
                key={tab}
                className={`px-5 py-2.5 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "access"  && <FileText className="w-4 h-4" />}
                {tab === "mfa"     && <ShieldAlert className="w-4 h-4" />}
                {tab === "history" && <History className="w-4 h-4" />}
                {tab === "access" ? "File Access" : tab === "mfa" ? "MFA Resets" : "Request History"}
                <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground font-mono">
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>

          {error && (
            <div className="p-4 mb-6 rounded bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
          )}

          {/* ── PENDING ACCESS REQUESTS ─────────────────────────────────────── */}
          {activeTab === "access" && (
            <>
              {loading ? (
                <div className="flex justify-center mt-20"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
              ) : requests.length === 0 ? (
                <div className="text-center p-10 bg-secondary/50 rounded-lg border border-border">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-muted-foreground">No pending file access requests.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {requests.map(req => (
                    <div key={req.id} className="glass-card p-6 border border-border flex flex-col md:flex-row gap-6 md:items-center justify-between rounded-xl">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-1 bg-secondary rounded text-muted-foreground uppercase tracking-wider">Request #{req.id}</span>
                          <span className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleString()}</span>
                        </div>
                        <h3 className="text-lg font-bold">
                          {req.File?.filename || "Unknown File"}
                          <span className="text-sm font-normal text-muted-foreground ml-2">({req.File?.department || "N/A"})</span>
                        </h3>
                        <div className="text-sm border-l-2 border-primary/50 pl-3 py-1">
                          <p><span className="text-muted-foreground">Requester:</span> {req.Requester?.name || req.Requester?.email} <span className="text-xs text-muted-foreground">({req.Requester?.role})</span></p>
                          <p className="mt-1"><span className="text-muted-foreground">Reason:</span> {req.reason}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 min-w-[200px] p-4 bg-secondary/30 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <select
                            value={approveDuration[req.id] || "1_hour"}
                            onChange={e => setApproveDuration({ ...approveDuration, [req.id]: e.target.value })}
                            className="bg-background border border-border text-foreground text-xs rounded p-1 flex-1"
                          >
                            <option value="30_minutes">30 Minutes</option>
                            <option value="1_hour">1 Hour</option>
                            <option value="2_hours">2 Hours</option>
                            <option value="1_day">1 Day</option>
                          </select>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input type="checkbox"
                            checked={approveDownload[req.id] || false}
                            onChange={e => setApproveDownload({ ...approveDownload, [req.id]: e.target.checked })}
                            className="w-4 h-4 rounded border border-border bg-background checked:bg-primary" />
                          <span className="text-muted-foreground">Allow Download</span>
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(req.id)} disabled={processingId === req.id}
                            className="flex-1 py-2 bg-success/10 text-success border border-success/20 hover:bg-success/20 rounded-md transition text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                            {processingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            Approve
                          </button>
                          <button onClick={() => openRejectModal(req.id, "access")} disabled={processingId === req.id}
                            className="flex-1 py-2 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 rounded-md transition text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                            {processingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── PENDING MFA REQUESTS ────────────────────────────────────────── */}
          {activeTab === "mfa" && (
            <>
              {loading ? (
                <div className="flex justify-center mt-20"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
              ) : mfaRequests.length === 0 ? (
                <div className="text-center p-10 bg-secondary/50 rounded-lg border border-border">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-muted-foreground">No pending MFA reset requests.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {mfaRequests.map(req => (
                    <div key={req.id} className="glass-card p-6 border border-border flex flex-col md:flex-row gap-6 md:items-center justify-between rounded-xl">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-1 bg-warning/20 rounded text-warning uppercase tracking-wider">MFA Reset</span>
                          <span className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleString()}</span>
                        </div>
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-warning" /> PIN Reset Requested
                        </h3>
                        <div className="text-sm border-l-2 border-primary/50 pl-3 py-1">
                          <p><span className="text-muted-foreground">User:</span> {req.User?.name || "N/A"} <span className="text-xs text-muted-foreground">({req.User?.email})</span></p>
                          <p className="text-muted-foreground mt-1 text-xs">Approving clears the current MFA PIN and allows the user to set a new one.</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 min-w-[200px] p-4 bg-secondary/30 rounded-lg border border-border/50 justify-center">
                        <div className="flex gap-2">
                          <button onClick={() => handleMfaApprove(req.id)} disabled={processingId === req.id}
                            className="flex-1 py-2 bg-success/10 text-success border border-success/20 hover:bg-success/20 rounded-md transition text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                            {processingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            Approve
                          </button>
                          <button onClick={() => openRejectModal(req.id, "mfa")} disabled={processingId === req.id}
                            className="flex-1 py-2 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 rounded-md transition text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                            {processingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── REQUEST HISTORY TAB ─────────────────────────────────────────── */}
          {activeTab === "history" && (
            <>
              {loading ? (
                <div className="flex justify-center mt-20"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
              ) : (
                <>
                  {/* Summary stats */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: "Total Processed", value: history.length, color: "text-foreground", bg: "from-secondary/60 to-secondary/30", border: "border-border" },
                      { label: "Approved",         value: history.filter(h => h.status === "approved").length, color: "text-green-400",  bg: "from-green-900/20 to-green-900/10",  border: "border-green-500/20" },
                      { label: "Rejected",         value: history.filter(h => h.status === "rejected").length, color: "text-red-400",    bg: "from-red-900/20 to-red-900/10",      border: "border-red-500/20" },
                    ].map(s => (
                      <div key={s.label} className={`rounded-xl border ${s.border} bg-gradient-to-br ${s.bg} p-5`}>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-3xl font-black font-mono ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Filter + page-size row */}
                  <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                    <div className="flex gap-2">
                      {(["all", "approved", "rejected"] as const).map(f => (
                        <button key={f} onClick={() => { setHistoryFilter(f); setHistoryPage(1); }}
                          className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors capitalize ${
                            historyFilter === f
                              ? f === "approved" ? "bg-green-900/40 text-green-400 border-green-500/40"
                                : f === "rejected" ? "bg-red-900/40 text-red-400 border-red-500/40"
                                : "bg-primary/10 text-primary border-primary/30"
                              : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                          }`}>
                          {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Show</span>
                      <select value={historyPageSize} onChange={e => { setHistoryPageSize(Number(e.target.value)); setHistoryPage(1); }}
                        className="px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground focus:border-primary focus:outline-none">
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <span>entries &nbsp;·&nbsp; Showing <strong className="text-foreground">{histTotal === 0 ? 0 : histStart + 1}–{Math.min(histStart + historyPageSize, histTotal)}</strong> of <strong className="text-foreground">{histTotal}</strong></span>
                    </div>
                  </div>

                  {/* History table */}
                  {filteredHistory.length === 0 ? (
                    <div className="text-center p-10 bg-secondary/50 rounded-lg border border-border">
                      <History className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No {historyFilter === "all" ? "" : historyFilter} requests found.</p>
                    </div>
                  ) : (
                    <div className="glass-card border border-border rounded-xl overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                          <tr>
                            <th className="px-5 py-4 font-medium">#</th>
                            <th className="px-5 py-4 font-medium">File</th>
                            <th className="px-5 py-4 font-medium">Requester</th>
                            <th className="px-5 py-4 font-medium">Role</th>
                            <th className="px-5 py-4 font-medium">Status</th>
                            <th className="px-5 py-4 font-medium">Processed</th>
                            <th className="px-5 py-4 font-medium">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {pagedHist.map(h => (
                            <>
                              <tr key={h.id} className="hover:bg-secondary/30 transition-colors">
                                <td className="px-5 py-4 font-mono text-xs text-muted-foreground">#{h.id}</td>
                                <td className="px-5 py-4 font-medium">
                                  {h.File?.filename || "—"}
                                  <span className="block text-xs text-muted-foreground">{h.File?.department}</span>
                                </td>
                                <td className="px-5 py-4">
                                  <p className="font-medium">{h.Requester?.name || "—"}</p>
                                  <p className="text-xs text-muted-foreground">{h.Requester?.email}</p>
                                </td>
                                <td className="px-5 py-4">
                                  <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-secondary text-muted-foreground">{h.Requester?.role}</span>
                                </td>
                                <td className="px-5 py-4">
                                  <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${statusBadge(h.status)}`}>{h.status}</span>
                                </td>
                                <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">{new Date(h.updatedAt).toLocaleString()}</td>
                                <td className="px-5 py-4">
                                  <button
                                    onClick={() => setHistoryExpanded(historyExpanded === h.id ? null : h.id)}
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                  >
                                    {historyExpanded === h.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    {historyExpanded === h.id ? "Hide" : "Show"}
                                  </button>
                                </td>
                              </tr>
                              {historyExpanded === h.id && (
                                <tr key={`${h.id}-expanded`}>
                                  <td colSpan={7} className="px-5 pb-4 bg-secondary/20">
                                    <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                                      <div><span className="text-muted-foreground">Original Reason: </span>{h.reason || "—"}</div>
                                      {h.rejectionReason && (
                                        <div><span className="text-muted-foreground">Rejection Reason: </span>
                                          <span className="text-red-400">{h.rejectionReason}</span>
                                        </div>
                                      )}
                                      <div><span className="text-muted-foreground">Submitted: </span>{new Date(h.createdAt).toLocaleString()}</div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pagination */}
                  {histTotal > historyPageSize && (
                    <div className="flex items-center justify-end gap-1 mt-4">
                      <button onClick={() => setHistoryPage(1)} disabled={safePage === 1}
                        className="px-2 py-1 text-xs rounded border border-border bg-secondary text-foreground disabled:opacity-40 hover:bg-secondary/60">«</button>
                      <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                        className="px-3 py-1 text-xs rounded border border-border bg-secondary text-foreground disabled:opacity-40 hover:bg-secondary/60">‹ Prev</button>
                      {Array.from({ length: histPages }, (_, i) => i + 1)
                        .filter(n => n === 1 || n === histPages || Math.abs(n - safePage) <= 1)
                        .reduce<(number | "...")[]>((acc, n, i, arr) => {
                          if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("...");
                          acc.push(n); return acc;
                        }, [])
                        .map((item, idx) =>
                          item === "..." ? (
                            <span key={`e-${idx}`} className="px-2 py-1 text-xs text-muted-foreground">…</span>
                          ) : (
                            <button key={item} onClick={() => setHistoryPage(item as number)}
                              className={`px-3 py-1 text-xs rounded border transition-colors ${
                                safePage === item ? "border-primary bg-primary/10 text-primary font-bold" : "border-border bg-secondary text-foreground hover:bg-secondary/60"
                              }`}>{item}</button>
                          )
                        )}
                      <button onClick={() => setHistoryPage(p => Math.min(histPages, p + 1))} disabled={safePage === histPages}
                        className="px-3 py-1 text-xs rounded border border-border bg-secondary text-foreground disabled:opacity-40 hover:bg-secondary/60">Next ›</button>
                      <button onClick={() => setHistoryPage(histPages)} disabled={safePage === histPages}
                        className="px-2 py-1 text-xs rounded border border-border bg-secondary text-foreground disabled:opacity-40 hover:bg-secondary/60">»</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

        </div>
      </main>
    </div>
  );
};

export default ApprovalsDashboard;
