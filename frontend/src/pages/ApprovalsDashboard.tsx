import { useState, useEffect, useCallback, useRef } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { Loader2, CheckCircle, XCircle, Clock, ShieldAlert, RefreshCw } from "lucide-react";
import api from "../api/axios";

interface AccessRequest {
  id: number;
  reason: string;
  createdAt: string;
  Requester: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  File: {
    id: number;
    filename: string;
    department: string;
  };
}

interface MfaRequest {
  id: number;
  status: string;
  createdAt: string;
  User?: {
    id: number;
    email: string;
    name: string;
  };
}

const ApprovalsDashboard = () => {
  const [activeTab, setActiveTab] = useState<"access" | "mfa">("access");
  
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [mfaRequests, setMfaRequests] = useState<MfaRequest[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // States for duration dropdown
  const [approveDuration, setApproveDuration] = useState<Record<number, string>>({});
  const [approveDownload, setApproveDownload] = useState<Record<number, boolean>>({});

  // Reject Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectType, setRejectType] = useState<"access" | "mfa">("access");
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchRequests = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get("/api/access-requests/pending");
      setRequests(res.data.requests || []);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Network error. Could not fetch requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchMfaRequests = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get("/api/mfa/requests");
      setMfaRequests(res.data || []);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Network error. Could not fetch MFA requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refreshCurrent = useCallback((silent = false) => {
    if (activeTab === "access") fetchRequests(silent);
    else fetchMfaRequests(silent);
  }, [activeTab, fetchRequests, fetchMfaRequests]);

  // Initial load + re-fetch when tab changes
  useEffect(() => {
    refreshCurrent(false);
  }, [activeTab]);

  // 30-second auto-polling (silent background refresh)
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      refreshCurrent(true);
    }, 30000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [refreshCurrent]);

  const handleApprove = async (id: number) => {
    const duration = approveDuration[id] || "1_hour";
    const allowDownload = approveDownload[id] || false;
    setProcessingId(id);
    try {
      await api.post(`/api/access-requests/${id}/approve`, { duration, allowDownload });
      setRequests(requests.filter(req => req.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || "Network error or failure to approve.");
    } setProcessingId(null);
  };

  const openRejectModal = (id: number, type: "access" | "mfa" = "access") => {
    setRejectRequestId(id);
    setRejectType(type);
    setRejectReason("");
    setRejectModalOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectRequestId || !rejectReason.trim()) return;
    setProcessingId(rejectRequestId);
    try {
      if (rejectType === "access") {
        await api.post(`/api/access-requests/${rejectRequestId}/reject`, { reason: rejectReason });
        setRequests(requests.filter(req => req.id !== rejectRequestId));
      } else {
        await api.post(`/api/mfa/reject/${rejectRequestId}`, { reason: rejectReason });
        setMfaRequests(mfaRequests.filter(req => req.id !== rejectRequestId));
      }
      setRejectModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.message || "Network error or failure to reject.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleMfaApprove = async (id: number) => {
    setProcessingId(id);
    try {
      await api.post(`/api/mfa/approve/${id}`, {});
      setMfaRequests(mfaRequests.filter(req => req.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || "Failure to approve MFA reset.");
    } setProcessingId(null);
  };

  // Left handleMfaApprove, removed handleMfaReject directly since it goes through modal

  const handleDurationChange = (id: number, duration: string) => {
    setApproveDuration({ ...approveDuration, [id]: duration });
  };

  const handleDownloadChange = (id: number, allowed: boolean) => {
    setApproveDownload({ ...approveDownload, [id]: allowed });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      
      {rejectModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-lg shadow-lg border border-border flex flex-col relative p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Reject {rejectType === "access" ? "Access" : "MFA Reset"} Request
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Please provide a reason for rejecting this {rejectType === "access" ? "access" : "MFA reset"} request.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. You do not have permission for this file..."
              className="w-full h-32 p-3 bg-background border border-border rounded-md text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-md bg-secondary hover:bg-secondary/80 transition text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={processingId === rejectRequestId || !rejectReason.trim()}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {processingId === rejectRequestId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-8 relative overflow-y-auto">
        <div className="absolute top-6 right-8 z-50">
          <UserProfileCard />
        </div>

        <div className="max-w-5xl mx-auto mt-4">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Admin Approvals</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage pending requests for your organization.
              </p>
            </div>
            <button
              onClick={() => refreshCurrent(false)}
              disabled={loading || refreshing}
              className="mr-14 px-4 py-2 rounded-md bg-secondary border border-border text-sm text-foreground hover:bg-secondary/80 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border mb-6">
            <button
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "access"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              onClick={() => setActiveTab("access")}
            >
              File Access
            </button>
            <button
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "mfa"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              onClick={() => setActiveTab("mfa")}
            >
              MFA Resets
            </button>
          </div>

          {error && (
            <div className="p-4 mb-6 rounded bg-destructive/10 border border-destructive/20 text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center mt-20">
              <Loader2 className="animate-spin w-8 h-8 text-primary" />
            </div>
          ) : activeTab === "access" && requests.length === 0 ? (
            <div className="text-center p-10 bg-secondary/50 rounded-lg border border-border">
              <p className="text-muted-foreground">No pending file access requests.</p>
            </div>
          ) : activeTab === "mfa" && mfaRequests.length === 0 ? (
            <div className="text-center p-10 bg-secondary/50 rounded-lg border border-border">
              <p className="text-muted-foreground">No pending MFA reset requests.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {activeTab === "access" && requests.map((req) => (
                <div key={req.id} className="glass-card p-6 border border-border flex flex-col md:flex-row gap-6 md:items-center justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-1 bg-secondary rounded text-muted-foreground uppercase tracking-wider">
                        Request #{req.id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(req.createdAt).toLocaleString()}
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-bold">
                      {req.File?.filename || "Unknown File"}
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        ({req.File?.department || "N/A"})
                      </span>
                    </h3>
                    
                    <div className="text-sm border-l-2 border-primary/50 pl-3 py-1 my-2">
                      <p className="text-foreground"><span className="text-muted-foreground">Requester:</span> {req.Requester?.name || req.Requester?.email} ({req.Requester?.role})</p>
                      <p className="text-foreground mt-1"><span className="text-muted-foreground">Reason:</span> {req.reason}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 min-w-[200px] p-4 bg-secondary/30 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <select 
                        value={approveDuration[req.id] || "1_hour"}
                        onChange={(e) => handleDurationChange(req.id, e.target.value)}
                        className="bg-background border border-border text-foreground text-xs rounded p-1 flex-1"
                      >
                        <option value="30_minutes">30 Minutes</option>
                        <option value="1_hour">1 Hour</option>
                        <option value="2_hours">2 Hours</option>
                        <option value="1_day">1 Day</option>
                      </select>
                    </div>
                    
                    <div className="flex gap-2 items-center px-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs group">
                        <div className="relative flex items-center">
                          <input 
                            type="checkbox" 
                            checked={approveDownload[req.id] || false}
                            onChange={(e) => handleDownloadChange(req.id, e.target.checked)}
                            className="peer appearance-none w-4 h-4 rounded-sm border border-border bg-background checked:bg-primary checked:border-primary transition-all duration-200 cursor-pointer"
                          />
                          <svg className="absolute w-3 h-3 text-primary-foreground opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                        <span className="text-muted-foreground group-hover:text-foreground transition-colors select-none">Allow Download</span>
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={processingId === req.id}
                        className="flex-1 py-2 bg-success/10 text-success border border-success/20 hover:bg-success/20 rounded-md transition text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {processingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Approve
                      </button>
                      <button
                        onClick={() => openRejectModal(req.id, "access")}
                        disabled={processingId === req.id}
                        className="flex-1 py-2 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 rounded-md transition text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {processingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {activeTab === "mfa" && mfaRequests.map((req) => (
                <div key={req.id} className="glass-card p-6 border border-border flex flex-col md:flex-row gap-6 md:items-center justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-1 bg-warning/20 rounded text-warning uppercase tracking-wider">
                        MFA Reset
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(req.createdAt).toLocaleString()}
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-warning" />
                      PIN Reset Requested
                    </h3>
                    
                    <div className="text-sm border-l-2 border-primary/50 pl-3 py-1 my-2">
                      <p className="text-foreground"><span className="text-muted-foreground">User:</span> {req.User?.name || "N/A"} ({req.User?.email})</p>
                      <p className="text-muted-foreground mt-1 text-xs">Approving this will clear the user's current MFA PIN and allow them to set a new one on their next login or from their settings.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 min-w-[200px] p-4 bg-secondary/30 rounded-lg border border-border/50 justify-center">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleMfaApprove(req.id)}
                        disabled={processingId === req.id}
                        className="flex-1 py-2 bg-success/10 text-success border border-success/20 hover:bg-success/20 rounded-md transition text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {processingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Approve
                      </button>
                      <button
                        onClick={() => openRejectModal(req.id, "mfa")}
                        disabled={processingId === req.id}
                        className="flex-1 py-2 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 rounded-md transition text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {processingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}

            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ApprovalsDashboard;
