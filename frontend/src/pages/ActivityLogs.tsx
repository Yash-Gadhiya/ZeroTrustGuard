import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, AlertTriangle, FileText, Loader2, RefreshCw,
  Search, Filter, Clock, Calendar, X,
} from "lucide-react";
import api, { socApi } from "@/lib/api";


// ── Interfaces ──────────────────────────────────────────────────────────────
interface Alert {
  id: string;
  riskScore: number;
  status: string;
  action: string;
  resource?: string;
  department: string | null;
  ipAddress?: string;
  userAgent?: string;
  decision?: string;
  resolved?: boolean;
  createdAt: string;
  updatedAt?: string;
  admin_comment?: string;
  User?: { email: string; department: string; name?: string };
}

interface Log {
  id: string;
  userId: string;
  action: string;
  resource: string;
  department: string | null;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt?: string;
  riskScore?: number;
  decision?: string;
  status?: string;
  resolved?: boolean;
  User?: { email: string; name: string; department?: string };
}

type Tab = "alerts" | "logs";

// ── Risk range labels ────────────────────────────────────────────────────────
const RISK_LABELS: Record<string, string> = {
  "0-20":   "🟢 Low (0–20)",
  "21-40":  "🟢 Low (21–40)",
  "41-60":  "🟡 Medium (41–60)",
  "61-80":  "🔴 High (61–80)",
  "81-100": "⛔ Critical (81–100)",
};

export default function ActivityLogs() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab) || "alerts"
  );

  // ── Filters (pre-populated from URL for chart→logs deep-link) ────────────
  const [searchEmail,       setSearchEmail]       = useState(searchParams.get("searchEmail") || "");
  const [filterDepartment,  setFilterDepartment]  = useState(searchParams.get("department")  || "");
  const [filterDecision,    setFilterDecision]    = useState(searchParams.get("decision")    || "");
  const [filterRiskRange,   setFilterRiskRange]   = useState(searchParams.get("riskRange")   || "");
  const [filterAlertStatus, setFilterAlertStatus] = useState(searchParams.get("alertStatus") || "");
  const [timeRange,         setTimeRange]         = useState(searchParams.get("timeRange")   || "all");
  const [startDate,         setStartDate]         = useState(searchParams.get("startDate")   || "");
  const [endDate,           setEndDate]           = useState(searchParams.get("endDate")     || "");
  const [customRangeModalOpen, setCustomRangeModalOpen] = useState(false);
  const [tempStartDate,     setTempStartDate]     = useState("");
  const [tempEndDate,       setTempEndDate]       = useState("");

  // ── Data ─────────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs,   setLogs]   = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Detail drawer ─────────────────────────────────────────────────────────
  const [drawerRecord, setDrawerRecord] = useState<Alert | Log | null>(null);

  // Close drawer on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerRecord(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Export ────────────────────────────────────────────────────────────────
  const [exportLoading, setExportLoading] = useState<"csv" | "pdf" | null>(null);

  // ── Computed filters ──────────────────────────────────────────────────────
  const buildParams = useCallback(() => {
    const params: Record<string, string> = {};
    if (timeRange !== "all") {
      if (!(timeRange === "custom" && (!startDate || !endDate))) {
        params.timeRange = timeRange;
        if (timeRange === "custom") { params.startDate = startDate; params.endDate = endDate; }
      }
    }
    if (searchEmail)      params.searchEmail = searchEmail;
    if (filterDepartment) params.department  = filterDepartment;
    return params;
  }, [timeRange, startDate, endDate, searchEmail, filterDepartment]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      const [alertsRes, logsRes] = await Promise.allSettled([
        socApi.getAlerts(params),
        socApi.getLogs(params),
      ]);
      if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data.alerts || alertsRes.value.data || []);
      if (logsRes.status   === "fulfilled") setLogs(logsRes.value.data.logs     || logsRes.value.data   || []);
    } catch (err) {
      console.error("ActivityLogs fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Auto-switch tab based on URL params from chart navigation
  useEffect(() => {
    const urlTab = searchParams.get("tab") as Tab | null;
    if (urlTab) setActiveTab(urlTab);
    else if (searchParams.get("riskRange")) setActiveTab("logs");
    else if (searchParams.get("decision"))  setActiveTab("logs");
    else if (searchParams.get("alertStatus")) setActiveTab("alerts");
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  // Auto-refresh every 20s
  useEffect(() => {
    const iv = setInterval(fetchData, 20_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // ── Client-side filtering for alerts tab
  const filteredAlerts = alerts.filter(a => {
    const matchEmail  = !searchEmail || (a.User?.email || "").toLowerCase().includes(searchEmail.toLowerCase());
    const matchDept   = !filterDepartment || (a.department || a.User?.department) === filterDepartment;
    const matchStatus = !filterAlertStatus
      ? true
      : filterAlertStatus === "unresolved"
        ? !["RESOLVED", "REJECTED"].includes(a.status)
        : a.status === filterAlertStatus;
    return matchEmail && matchDept && matchStatus;
  });

  const filteredLogs = logs.filter(l => {
    const matchEmail  = !searchEmail || (l.User?.email || "").toLowerCase().includes(searchEmail.toLowerCase());
    const matchDept   = !filterDepartment || l.department === filterDepartment;
    const matchDecision = !filterDecision || (l.decision || "").toUpperCase() === filterDecision.toUpperCase();
    const matchRisk = !filterRiskRange ? true : (() => {
      const [lo, hi] = filterRiskRange.split("-").map(Number);
      const r = l.riskScore ?? 0;
      return r >= lo && r <= hi;
    })();
    return matchEmail && matchDept && matchDecision && matchRisk;
  });


  const hasFilters = searchEmail || filterDepartment || filterDecision || filterRiskRange || filterAlertStatus || timeRange !== "all";

  const clearFilters = () => {
    setSearchEmail(""); setFilterDepartment(""); setFilterDecision("");
    setFilterRiskRange(""); setFilterAlertStatus(""); setTimeRange("all"); setStartDate(""); setEndDate("");
    setSearchParams({});
  };

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Reset to page 1 whenever active data set or tab changes
  useEffect(() => { setPage(1); }, [activeTab, searchEmail, filterDepartment, filterDecision, filterRiskRange, filterAlertStatus, timeRange]);

  const currentData =
    activeTab === "alerts" ? filteredAlerts : filteredLogs;

  const totalPages  = Math.max(1, Math.ceil(currentData.length / pageSize));
  const safeePage   = Math.min(page, totalPages);
  const pageStart   = (safeePage - 1) * pageSize;
  const pageEnd     = Math.min(pageStart + pageSize, currentData.length);
  const pagedAlerts = activeTab === "alerts" ? filteredAlerts.slice(pageStart, pageEnd) : [];
  const pagedLogs   = activeTab === "logs"   ? filteredLogs.slice(pageStart, pageEnd)   : [];

  // ── Export ────────────────────────────────────────────────────────────────
  const downloadExport = async (format: "csv" | "pdf") => {
    setExportLoading(format);
    try {
      const params: Record<string, string> = { format };
      const bp = buildParams();
      Object.assign(params, bp);
      const res = await api.get("/api/activity-logs/export", { params, responseType: "blob" });
      const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const ext  = format === "pdf" ? "pdf" : "csv";
      const mime = format === "pdf" ? "application/pdf" : "text/csv";
      const blob = new Blob([res.data], { type: mime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `AuditTrail_${ts}.${ext}`;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); a.remove();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast({ title: "Export Failed", description: e.response?.data?.message || "Export failed. Please try again.", variant: "destructive" });
    } finally { setExportLoading(null); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const tabCount = { alerts: filteredAlerts.length, logs: filteredLogs.length };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      {/* ── Detail Drawer ────────────────────────────────────────────── */}
      {drawerRecord && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerRecord(null)}
          />
          {/* Panel */}
          <div className="fixed right-0 top-0 h-full z-[90] w-full max-w-[480px] bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">Log Details</h2>
                  <p className="text-xs text-muted-foreground font-mono">ID: {drawerRecord.id}</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerRecord(null)}
                className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Action + Risk banner */}
              <div className="rounded-xl border border-border bg-secondary/20 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Action</p>
                  <p className="text-base font-bold text-foreground">
                    {'action' in drawerRecord ? drawerRecord.action : '—'}
                  </p>
                </div>
                {'riskScore' in drawerRecord && drawerRecord.riskScore != null && (
                  <div className={`px-4 py-2 rounded-lg text-center ${
                    (drawerRecord.riskScore ?? 0) >= 80 ? 'bg-red-900/30 border border-red-500/30' :
                    (drawerRecord.riskScore ?? 0) >= 60 ? 'bg-orange-900/30 border border-orange-500/30' :
                    (drawerRecord.riskScore ?? 0) >= 30 ? 'bg-yellow-900/30 border border-yellow-500/30' :
                    'bg-green-900/30 border border-green-500/30'
                  }`}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score</p>
                    <p className={`text-2xl font-black font-mono ${
                      (drawerRecord.riskScore ?? 0) >= 80 ? 'text-red-400' :
                      (drawerRecord.riskScore ?? 0) >= 60 ? 'text-orange-400' :
                      (drawerRecord.riskScore ?? 0) >= 30 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>{drawerRecord.riskScore}</p>
                  </div>
                )}
              </div>

              {/* Status + Decision row */}
              <div className="grid grid-cols-2 gap-3">
                {'status' in drawerRecord && drawerRecord.status && (
                  <div className="rounded-lg border border-border bg-secondary/10 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Status</p>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      drawerRecord.status === 'RESOLVED' ? 'bg-green-900/30 text-green-400' :
                      drawerRecord.status === 'REJECTED' ? 'bg-red-900/30 text-red-400' :
                      drawerRecord.status === 'FAILED'   ? 'bg-red-900/20 text-red-300' :
                      drawerRecord.status === 'SUCCESS'  ? 'bg-green-900/20 text-green-300' :
                      'bg-yellow-900/30 text-yellow-400'
                    }`}>{drawerRecord.status}</span>
                  </div>
                )}
                {'decision' in drawerRecord && drawerRecord.decision && (
                  <div className="rounded-lg border border-border bg-secondary/10 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Decision</p>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      drawerRecord.decision === 'BLOCK'        ? 'bg-red-900/30 text-red-400' :
                      drawerRecord.decision === 'REVIEW'       ? 'bg-orange-900/30 text-orange-400' :
                      drawerRecord.decision === 'MFA_REQUIRED' ? 'bg-yellow-900/30 text-yellow-400' :
                      'bg-green-900/30 text-green-400'
                    }`}>{drawerRecord.decision}</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <hr className="border-border" />

              {/* Field grid */}
              {([
                { label: 'User Email',   value: drawerRecord.User?.email },
                { label: 'User Name',    value: (drawerRecord.User as { name?: string })?.name },
                { label: 'Department',   value: drawerRecord.department || drawerRecord.User?.department },
                { label: 'Resource',     value: (drawerRecord as { resource?: string }).resource },
                { label: 'IP Address',   value: (drawerRecord as { ipAddress?: string }).ipAddress },
                { label: 'Resolved',     value: (drawerRecord as { resolved?: boolean }).resolved != null ? ((drawerRecord as { resolved?: boolean }).resolved ? 'Yes' : 'No') : undefined },
                { label: 'Created At',   value: new Date(drawerRecord.createdAt).toLocaleString() },
                { label: 'Updated At',   value: (drawerRecord as { updatedAt?: string }).updatedAt ? new Date((drawerRecord as { updatedAt?: string }).updatedAt!).toLocaleString() : undefined },
              ] as { label: string; value: string | undefined }[])
                .filter(f => f.value)
                .map(f => (
                  <div key={f.label} className="flex flex-col gap-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.label}</p>
                    <p className="text-sm text-foreground font-medium break-words">{f.value}</p>
                  </div>
                ))
              }

              {/* User Agent — full width */}
              {(drawerRecord as { userAgent?: string }).userAgent && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">User Agent</p>
                  <p className="text-xs text-muted-foreground font-mono break-all bg-secondary/30 p-2 rounded">{(drawerRecord as { userAgent?: string }).userAgent}</p>
                </div>
              )}

              {/* Admin comment */}
              {(drawerRecord as { admin_comment?: string }).admin_comment && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-900/10 p-3">
                  <p className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">Admin Comment</p>
                  <p className="text-sm text-foreground">{(drawerRecord as { admin_comment?: string }).admin_comment}</p>
                </div>
              )}

            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-border bg-secondary/20 flex gap-3">
              {'User' in drawerRecord && drawerRecord.User?.email && (
                <button
                  onClick={() => { setDrawerRecord(null); navigate(`/soc/users?email=${encodeURIComponent(drawerRecord.User!.email)}`); }}
                  className="flex-1 py-2 text-xs font-medium rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                >
                  View User Profile
                </button>
              )}
              <button
                onClick={() => setDrawerRecord(null)}
                className="flex-1 py-2 text-xs font-medium rounded-lg bg-secondary text-foreground border border-border hover:bg-secondary/60 transition-colors"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </>
      )}

      {/* Custom date range modal */}
      {customRangeModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-lg shadow-lg border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" /> Custom Time Range
              </h3>
              <button onClick={() => { setCustomRangeModalOpen(false); setTimeRange("all"); }}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {["Start", "End"].map(label => (
                <div key={label}>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">{label} Date</label>
                  <input type="date"
                    value={label === "Start" ? tempStartDate : tempEndDate}
                    onChange={e => label === "Start" ? setTempStartDate(e.target.value) : setTempEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <button onClick={() => { setCustomRangeModalOpen(false); setTimeRange("all"); }}
                className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md">Cancel</button>
              <button onClick={() => {
                if (tempStartDate && tempEndDate) {
                  setStartDate(tempStartDate); setEndDate(tempEndDate); setCustomRangeModalOpen(false);
                } else {
                  toast({ title: "Select Both Dates", description: "Please select both a start and end date.", variant: "destructive" });
                }
              }} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md">Apply Range</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 p-8 relative overflow-y-auto">
        <div className="absolute top-6 right-8 z-50"><UserProfileCard /></div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Activity className="w-6 h-6 text-primary" /> Activity Logs
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Full audit trail · auto-refresh 20s
            </p>
          </div>
          <div className="flex items-center gap-3 mr-14">
            <button onClick={fetchData}
              className="px-4 py-2 rounded-md bg-secondary border border-border text-sm hover:bg-secondary/80 transition-colors inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={() => navigate("/soc")}
              className="px-4 py-2 rounded-md bg-secondary border border-border text-sm hover:bg-secondary/80 transition-colors">
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filterAlertStatus && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400 border border-blue-500/30">
                Status: {filterAlertStatus === "unresolved" ? "Open (unresolved)" : filterAlertStatus}
                <button onClick={() => setFilterAlertStatus("")}><X className="w-3 h-3 ml-1" /></button>
              </span>
            )}
            {filterRiskRange && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-orange-900/30 text-orange-400 border border-orange-500/30">
                Risk: {RISK_LABELS[filterRiskRange] || filterRiskRange}
                <button onClick={() => setFilterRiskRange("")}><X className="w-3 h-3 ml-1" /></button>
              </span>
            )}
            {filterDecision && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400 border border-blue-500/30">
                Decision: {filterDecision}
                <button onClick={() => setFilterDecision("")}><X className="w-3 h-3 ml-1" /></button>
              </span>
            )}
            {filterDepartment && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-purple-900/30 text-purple-400 border border-purple-500/30">
                Dept: {filterDepartment}
                <button onClick={() => setFilterDepartment("")}><X className="w-3 h-3 ml-1" /></button>
              </span>
            )}
            {searchEmail && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-teal-900/30 text-teal-400 border border-teal-500/30">
                Email: {searchEmail}
                <button onClick={() => setSearchEmail("")}><X className="w-3 h-3 ml-1" /></button>
              </span>
            )}
            <button onClick={clearFilters} className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground bg-secondary/50 rounded-full">
              Clear all
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div className="glass-card p-4 rounded-lg border border-border mb-4 flex flex-wrap gap-3 items-center bg-secondary/20">
          {/* Email */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Filter by email..." value={searchEmail} onChange={e => setSearchEmail(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground" />
          </div>

          {/* Department */}
          <div className="relative w-36">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground appearance-none">
              <option value="">All Depts</option>
              <option value="IT">IT</option>
              <option value="HR">HR</option>
              <option value="ACCOUNTS">ACCOUNTS</option>
            </select>
          </div>

          {/* Decision (logs only) */}
          {activeTab === "logs" && (
            <div className="relative w-40">
              <select value={filterDecision} onChange={e => setFilterDecision(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground appearance-none">
                <option value="">All Decisions</option>
                <option value="ALLOW">ALLOW</option>
                <option value="MFA_REQUIRED">MFA REQUIRED</option>
                <option value="REVIEW">REVIEW</option>
                <option value="BLOCK">BLOCK</option>
              </select>
            </div>
          )}

          {/* Risk range (logs only) */}
          {activeTab === "logs" && (
            <div className="relative w-44">
              <select value={filterRiskRange} onChange={e => setFilterRiskRange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground appearance-none">
                <option value="">All Risk Levels</option>
                <option value="0-20">🟢 Low (0–20)</option>
                <option value="21-40">🟢 Low (21–40)</option>
                <option value="41-60">🟡 Medium (41–60)</option>
                <option value="61-80">🔴 High (61–80)</option>
                <option value="81-100">⛔ Critical (81–100)</option>
              </select>
            </div>
          )}

          {/* Time range */}
          <div className="relative w-40">
            <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select value={timeRange} onChange={e => {
              setTimeRange(e.target.value);
              if (e.target.value === "custom") setCustomRangeModalOpen(true);
            }} className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground appearance-none">
              <option value="all">All Time</option>
              <option value="24_hours">Last 24h</option>
              <option value="7_days">Last 7 Days</option>
              <option value="3_months">Last 3 Months</option>
              <option value="1_year">Last 1 Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Export (logs tab only) */}
          {activeTab === "logs" && (
            <div className="flex gap-2 ml-auto">
              <button id="al-export-csv" onClick={() => downloadExport("csv")} disabled={exportLoading !== null}
                className="px-3 py-2 text-xs font-medium text-green-400 bg-green-900/20 hover:bg-green-900/30 border border-green-800/40 rounded-md inline-flex items-center gap-1 transition-colors disabled:opacity-50">
                {exportLoading === "csv" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} CSV
              </button>
              <button id="al-export-pdf" onClick={() => downloadExport("pdf")} disabled={exportLoading !== null}
                className="px-3 py-2 text-xs font-medium text-blue-400 bg-blue-900/20 hover:bg-blue-900/30 border border-blue-800/40 rounded-md inline-flex items-center gap-1 transition-colors disabled:opacity-50">
                {exportLoading === "pdf" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mb-6">
          {(["alerts", "logs"] as Tab[]).map(tab => (
            <button key={tab}
              className={`px-5 py-2 font-medium text-sm border-b-2 transition-colors capitalize flex items-center gap-2 ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "alerts" && <AlertTriangle className="w-4 h-4" />}
              {tab === "logs"   && <Activity className="w-4 h-4" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground font-mono">
                {tabCount[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="glass-card border border-border rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">

                {/* ── Table headers ── */}
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                  {activeTab === "alerts" && (
                    <tr>
                      <th className="px-6 py-4 font-medium">Alert ID</th>
                      <th className="px-6 py-4 font-medium min-w-[200px]">User Email</th>
                      <th className="px-6 py-4 font-medium">Department</th>
                      <th className="px-6 py-4 font-medium min-w-[180px]">Action</th>
                      <th className="px-6 py-4 font-medium">Risk Score</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Created</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  )}
                  {activeTab === "logs" && (
                    <tr>
                      <th className="px-6 py-4 font-medium">Timestamp</th>
                      <th className="px-6 py-4 font-medium">User Email</th>
                      <th className="px-6 py-4 font-medium">Department</th>
                      <th className="px-6 py-4 font-medium">Action</th>
                      <th className="px-6 py-4 font-medium">Resource</th>
                      <th className="px-6 py-4 font-medium">Risk</th>
                      <th className="px-6 py-4 font-medium">Decision</th>
                    </tr>
                  )}
                </thead>

                {/* ── Table body ── */}
                <tbody className="divide-y divide-border">

                  {/* ALERTS */}
                  {activeTab === "alerts" && pagedAlerts.length === 0 && (
                    <tr><td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">No alerts found</td></tr>
                  )}
                  {activeTab === "alerts" && pagedAlerts.map(alert => (
                    <tr
                      key={alert.id}
                      className="hover:bg-secondary/40 transition-colors cursor-pointer"
                      onClick={() => setDrawerRecord(alert)}
                    >
                      <td className="px-6 py-4 font-mono text-xs">{alert.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{alert.User?.email || "N/A"}</td>
                      <td className="px-6 py-4">{alert.department || alert.User?.department || "N/A"}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          alert.action === "ACCOUNT_UNBLOCK" ? "text-primary bg-primary/10" :
                          alert.action === "DELETE_USER" ? "text-destructive bg-destructive/10" :
                          alert.action === "ADMIN_BLOCK" || alert.action === "ACCOUNT_LOCKOUT" ? "text-warning bg-warning/10" :
                          "text-foreground"
                        }`}>{alert.action || "N/A"}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          (alert.riskScore || 0) >= 80 ? "bg-destructive/20 text-destructive" :
                          (alert.riskScore || 0) >= 50 ? "bg-warning/20 text-warning" :
                          "bg-success/20 text-success"
                        }`}>{alert.riskScore}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          alert.status === "RESOLVED" ? "bg-green-900/30 text-green-400" :
                          alert.status === "REJECTED" ? "bg-red-900/30 text-red-400" :
                          "bg-yellow-900/30 text-yellow-400"
                        }`}>{alert.status || "OPEN"}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={e => {
                          e.stopPropagation();
                          if (alert.User?.email) navigate(`/soc/users?email=${encodeURIComponent(alert.User.email)}`);
                        }} className="text-xs px-4 py-1.5 bg-primary/10 text-primary font-medium rounded hover:bg-primary/20 transition-colors">
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* LOGS */}
                  {activeTab === "logs" && pagedLogs.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">No activity logs found</td></tr>
                  )}
                  {activeTab === "logs" && pagedLogs.map(log => {
                    const risk = log.riskScore ?? 0;
                    const riskCls =
                      risk >= 85 ? "bg-red-900/40 text-red-400 border border-red-500/50" :
                      risk >= 65 ? "bg-orange-900/40 text-orange-400 border border-orange-500/50" :
                      risk >= 30 ? "bg-yellow-900/40 text-yellow-400 border border-yellow-500/50" :
                      "bg-green-900/40 text-green-400 border border-green-500/50";
                    const decisionCls =
                      log.decision === "BLOCK"        ? "bg-red-900/30 text-red-400" :
                      log.decision === "REVIEW"       ? "bg-orange-900/30 text-orange-400" :
                      log.decision === "MFA_REQUIRED" ? "bg-yellow-900/30 text-yellow-400" :
                      "bg-green-900/30 text-green-400";
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-secondary/40 transition-colors cursor-pointer"
                        onClick={() => setDrawerRecord(log)}
                      >
                        <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{log.User?.email || `User #${log.userId}`}</td>
                        <td className="px-6 py-4">{log.department || "—"}</td>
                        <td className="px-6 py-4 font-medium">{log.action}</td>
                        <td className="px-6 py-4 text-xs text-muted-foreground font-mono truncate max-w-[160px]">{log.resource || "—"}</td>
                        <td className="px-6 py-4">
                          {log.riskScore != null
                            ? <span className={`px-2 py-1 rounded text-xs font-bold ${riskCls}`}>
                                {risk >= 85 ? "⛔" : risk >= 65 ? "🔴" : risk >= 30 ? "🟡" : "🟢"} {risk}
                              </span>
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </td>
                        <td className="px-6 py-4">
                          {log.decision
                            ? <span className={`px-2 py-1 rounded text-xs font-bold ${decisionCls}`}>{log.decision}</span>
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}

                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Pagination bar ────────────────────────────────────────────── */}
        {!loading && currentData.length > 0 && (
          <div className="flex items-center justify-between mt-4 px-1">
            {/* Entries-per-page selector */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground focus:border-primary focus:outline-none"
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>entries &nbsp;·&nbsp; Showing <strong className="text-foreground">{pageStart + 1}–{pageEnd}</strong> of <strong className="text-foreground">{currentData.length}</strong></span>
            </div>

            {/* Page buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={safeePage === 1}
                className="px-2 py-1 text-xs rounded border border-border bg-secondary text-foreground disabled:opacity-40 hover:bg-secondary/60 transition-colors"
              >«</button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safeePage === 1}
                className="px-3 py-1 text-xs rounded border border-border bg-secondary text-foreground disabled:opacity-40 hover:bg-secondary/60 transition-colors"
              >‹ Prev</button>

              {/* Page number pills */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - safeePage) <= 1)
                .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "..." ? (
                    <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${
                        safeePage === item
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border bg-secondary text-foreground hover:bg-secondary/60"
                      }`}
                    >{item}</button>
                  )
                )
              }

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safeePage === totalPages}
                className="px-3 py-1 text-xs rounded border border-border bg-secondary text-foreground disabled:opacity-40 hover:bg-secondary/60 transition-colors"
              >Next ›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safeePage === totalPages}
                className="px-2 py-1 text-xs rounded border border-border bg-secondary text-foreground disabled:opacity-40 hover:bg-secondary/60 transition-colors"
              >»</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
