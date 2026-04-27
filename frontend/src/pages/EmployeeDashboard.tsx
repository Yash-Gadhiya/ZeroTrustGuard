import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import {
  Loader2, Download, Lock, FileText, X, FolderOpen,
  Clock, CheckCircle, XCircle, Eye,
} from "lucide-react";
import api from "../api/axios";
import { PinModal } from "@/components/PinModal";
import { SecureFileViewer } from "@/components/SecureFileViewer";
import { useToast } from "@/hooks/use-toast";

interface FileItem {
  id: number;
  filename: string;
  originalName?: string;
  department: string;
  target_department?: string;
  sensitivityLevel?: string;
  canView: boolean;
  canDownload: boolean;
  createdAt: string;
}

const SENSITIVITY_STRIP: Record<string, string> = {
  low:      "bg-green-500",
  high:     "bg-orange-500",
  critical: "bg-red-500",
};
const DEPT_COLORS: Record<string, string> = {
  "All Departments": "bg-blue-900/40 text-blue-400 border border-blue-500/40",
  "IT":              "bg-cyan-900/40 text-cyan-400 border border-cyan-500/40",
  "HR":              "bg-purple-900/40 text-purple-400 border border-purple-500/40",
  "ACCOUNTS":        "bg-amber-900/40 text-amber-400 border border-amber-500/40",
  "MARKETING":       "bg-pink-900/40 text-pink-400 border border-pink-500/40",
};

const EmployeeDashboard = () => {
  const { toast } = useToast();
  const [files,   setFiles]   = useState<FileItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [pendingFileIds, setPendingFileIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [activeTab, setActiveTab] = useState<"files" | "history">("files");

  // Request-access modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [selectedFileId,   setSelectedFileId]   = useState<number | null>(null);
  const [reason,           setReason]           = useState("");
  const [requestLoading,   setRequestLoading]   = useState(false);

  // PIN / view / download
  const [pinModalOpen,     setPinModalOpen]   = useState(false);
  const [pinLoading,       setPinLoading]     = useState(false);
  const [fileToProcess,    setFileToProcess]  = useState<{ id: number; filename: string; originalName: string; action: "view" | "download" } | null>(null);
  const [pinError,         setPinError]       = useState("");
  const [viewerUrl,        setViewerUrl]      = useState<string | null>(null);
  const [viewerFilename,   setViewerFilename] = useState("");

  useEffect(() => {
    if (activeTab === "files") fetchFiles();
    else fetchHistory();
  }, [activeTab]);

  const fetchFiles = async () => {
    setLoading(true); setError("");
    try {
      const [filesRes, reqRes] = await Promise.all([
        api.get("/api/files/my-files"),
        api.get("/api/access-requests/my-requests"),
      ]);
      setFiles(filesRes.data.files || []);
      const pending = new Set<number>(
        (reqRes.data.requests || [])
          .filter((r: any) => r.status === "pending")
          .map((r: any) => r.fileId as number)
      );
      setPendingFileIds(pending);
    } catch (err: any) {
      setError(err.response?.data?.message || "Network error. Could not fetch files.");
    } finally { setLoading(false); }
  };

  const fetchHistory = async () => {
    setLoading(true); setError("");
    try {
      const [fileRes, mfaRes] = await Promise.all([
        api.get("/api/access-requests/my-requests"),
        api.get("/api/mfa/my-requests"),
      ]);
      const accessReqs = (fileRes.data.requests || []).map((r: any) => ({ ...r, reqType: "access" }));
      const mfaReqs    = (mfaRes.data || []).map((r: any) => ({ ...r, reqType: "mfa" }));
      const combined   = [...accessReqs, ...mfaReqs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setHistory(combined);
    } catch (err: any) {
      setError(err.response?.data?.message || "Network error.");
    } finally { setLoading(false); }
  };

  const handleAction = (id: number, filename: string, originalName: string, action: "view" | "download") => {
    setFileToProcess({ id, filename, originalName, action });
    setPinError(""); setPinModalOpen(true);
  };

  const closeViewer = () => {
    if (viewerUrl) { window.URL.revokeObjectURL(viewerUrl); setViewerUrl(null); setViewerFilename(""); }
  };

  const processAction = async (pin: string) => {
    if (!fileToProcess) return;
    setPinLoading(true);
    try {
      if (fileToProcess.action === "view") {
        try {
          const res = await api.get(`/api/files/view/${fileToProcess.id}`, {
            responseType: "blob", headers: { "x-mfa-pin": pin },
          });
          const blob = new Blob([res.data], { type: res.headers["content-type"] || "application/octet-stream" });
          setViewerUrl(window.URL.createObjectURL(blob));
          setViewerFilename(fileToProcess.originalName || fileToProcess.filename);
          setPinModalOpen(false); setFileToProcess(null);
        } catch (err: any) { await handleFileError(err, "View"); }
      } else {
        try {
          const res = await api.get(`/api/files/download/${fileToProcess.id}`, {
            responseType: "blob", headers: { "x-mfa-pin": pin },
          });
          const url = window.URL.createObjectURL(new Blob([res.data]));
          const a = document.createElement("a");
          a.href = url; a.download = fileToProcess.originalName || fileToProcess.filename;
          document.body.appendChild(a); a.click();
          window.URL.revokeObjectURL(url); a.remove();
          setPinModalOpen(false); setFileToProcess(null);
        } catch (err: any) { await handleFileError(err, "Download"); }
      }
    } finally {
      setPinLoading(false);
    }
  };

  const handleFileError = async (err: any, action: string) => {
    if (err.response?.data instanceof Blob) {
      const text = await err.response.data.text();
      try {
        const data = JSON.parse(text);
        if (data.blocked) {
          toast({ title: "⛔ Access Blocked", description: `Risk score too high (${data.riskScore}/100).`, variant: "destructive", duration: 7000 });
          setPinModalOpen(false); return;
        }
        if (data.mfaRequired) { setPinError(data.message || "Invalid code"); return; }
        toast({ title: `${action} Failed`, description: data.message || "Unexpected error.", variant: "destructive" });
      } catch { toast({ title: `${action} Failed`, description: "Unexpected error.", variant: "destructive" }); }
    } else {
      if (err.response?.data?.blocked) {
        toast({ title: "⛔ Access Blocked", description: `Risk score too high (${err.response.data.riskScore}/100).`, variant: "destructive", duration: 7000 });
      } else {
        toast({ title: `${action} Failed`, description: err.response?.data?.message || "Network error.", variant: "destructive" });
      }
    }
    setPinModalOpen(false);
  };

  const openRequestModal = (fileId: number) => { setSelectedFileId(fileId); setReason(""); setRequestModalOpen(true); };

  const submitAccessRequest = async () => {
    if (!reason.trim()) { toast({ title: "Reason Required", description: "Please provide a reason for your access request.", variant: "destructive" }); return; }
    setRequestLoading(true);
    try {
      await api.post("/api/files/request-access", { fileId: selectedFileId, reason });
      toast({ title: "Request Submitted", description: "Your access request has been sent for review." });
      // Mark this file as pending so the button updates immediately
      if (selectedFileId) {
        setPendingFileIds(prev => new Set(prev).add(selectedFileId));
      }
      setRequestModalOpen(false); setSelectedFileId(null);
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to submit request.";
      toast({ title: "Request Failed", description: msg, variant: "destructive" });
      setRequestModalOpen(false);
    } finally { setRequestLoading(false); }
  };

  // Derived stats
  const availableCount = files.filter(f => f.canView || f.canDownload).length;
  const pendingCount   = history.filter(h => h.status === "pending" || h.status === "open").length;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />

      <PinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSubmit={processAction}
        loading={pinLoading}
        error={pinError}
        title={fileToProcess?.action === "view" ? "View Secured File" : "Download Secured File"}
        description={`Enter your 6-digit authenticator code to ${fileToProcess?.action} ${fileToProcess?.originalName || fileToProcess?.filename}`}
      />
      <SecureFileViewer url={viewerUrl} filename={viewerFilename} onClose={closeViewer} />

      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* ── Header ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FolderOpen className="w-6 h-6 text-primary" /> Department File Access
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                View and download your department's files securely.
              </p>
            </div>
            <div className="mr-14"><UserProfileCard /></div>
          </div>

          {/* ── Stats row ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total Files",       value: files.length,  cls: "text-primary",   bg: "from-primary/10 to-primary/5",       border: "border-primary/20",   icon: <FileText className="w-5 h-5 text-primary" /> },
              { label: "Accessible to You", value: availableCount, cls: "text-green-400", bg: "from-green-900/20 to-green-900/5",   border: "border-green-500/20", icon: <CheckCircle className="w-5 h-5 text-green-400" /> },
              { label: "Pending Requests",  value: pendingCount,   cls: "text-yellow-400",bg: "from-yellow-900/20 to-yellow-900/5", border: "border-yellow-500/20",icon: <Clock className="w-5 h-5 text-yellow-400" /> },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border ${s.border} bg-gradient-to-br ${s.bg} p-5 flex items-start gap-4`}>
                <div className="p-2 rounded-lg bg-background/40">{s.icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`text-3xl font-black font-mono ${s.cls}`}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────── */}
          <div className="flex gap-1 mb-6 bg-secondary/40 border border-border rounded-xl p-1 w-fit">
            {([
              { id: "files",   label: "Available Files", icon: <FileText className="w-4 h-4" /> },
              { id: "history", label: "My Requests",      icon: <Clock className="w-4 h-4" /> },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="p-4 mb-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* ── FILES TAB ─────────────────────────────────────────────── */}
          {activeTab === "files" && (
            loading ? (
              <div className="flex justify-center mt-20">
                <Loader2 className="animate-spin w-8 h-8 text-primary" />
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-24 bg-secondary/30 rounded-xl border border-border">
                <FolderOpen className="w-12 h-12 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No files found for your department.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {files.map(file => {
                  const tg  = file.target_department || "All Departments";
                  const sen = file.sensitivityLevel || "low";
                  const deptStyle = DEPT_COLORS[tg as keyof typeof DEPT_COLORS] ?? "bg-secondary text-muted-foreground border border-border";
                  return (
                    <div
                      key={file.id}
                      className="glass-card rounded-xl border border-border flex flex-col overflow-hidden group hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
                    >
                      {/* Sensitivity color strip */}
                      <div className={`h-1 w-full ${SENSITIVITY_STRIP[sen] ?? "bg-green-500"}`} />

                      <div className="p-5 flex flex-col flex-1">
                        {/* Icon + lock */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-3 bg-secondary/60 rounded-lg group-hover:bg-primary/10 transition-colors">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          {!file.canView && !file.canDownload && (
                            <Lock className="w-4 h-4 text-yellow-500 mt-1" />
                          )}
                        </div>

                        {/* Filename */}
                        <h3 className="font-semibold truncate mb-1" title={file.originalName || file.filename}>
                          {file.originalName || file.filename}
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                          Added: {new Date(file.createdAt).toLocaleDateString()}
                        </p>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${deptStyle}`}>
                            {tg === "All Departments" ? "🌐 All Depts" : `🔒 ${tg}`}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                            sen === "critical" ? "bg-red-900/30 text-red-400 border-red-500/30" :
                            sen === "high"     ? "bg-orange-900/30 text-orange-400 border-orange-500/30" :
                            "bg-green-900/30 text-green-400 border-green-500/30"
                          }`}>
                            {sen}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="mt-auto pt-4 border-t border-border flex gap-2">
                          {file.canView ? (
                            <>
                              <button
                                onClick={() => handleAction(file.id, file.filename, file.originalName || file.filename, "view")}
                                className="flex-1 py-2 px-3 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition flex items-center justify-center gap-1.5 text-xs font-semibold"
                              >
                                <Eye className="w-3.5 h-3.5" /> View
                              </button>
                              {file.canDownload && (
                                <button
                                  onClick={() => handleAction(file.id, file.filename, file.originalName || file.filename, "download")}
                                  className="flex-1 py-2 px-3 bg-secondary/80 text-foreground border border-border rounded-lg hover:bg-secondary transition flex items-center justify-center gap-1.5 text-xs font-semibold"
                                >
                                  <Download className="w-3.5 h-3.5" /> Download
                                </button>
                              )}
                            </>
                          ) : pendingFileIds.has(file.id) ? (
                            <button disabled
                              className="w-full py-2 px-3 bg-yellow-900/20 text-yellow-400 border border-yellow-500/20 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold cursor-default opacity-80"
                            >
                              <Clock className="w-3.5 h-3.5" /> Request Pending
                            </button>
                          ) : (
                            <button
                              onClick={() => openRequestModal(file.id)}
                              className="w-full py-2 px-3 bg-secondary/50 text-muted-foreground border border-border rounded-lg hover:bg-secondary hover:text-foreground transition flex items-center justify-center gap-1.5 text-xs font-semibold"
                            >
                              <Lock className="w-3.5 h-3.5" /> Request Access
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── HISTORY TAB ───────────────────────────────────────────── */}
          {activeTab === "history" && (
            loading ? (
              <div className="flex justify-center mt-20">
                <Loader2 className="animate-spin w-8 h-8 text-primary" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-24 bg-secondary/30 rounded-xl border border-border">
                <Clock className="w-12 h-12 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No requests found.</p>
              </div>
            ) : (
              <div className="glass-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                      <tr>
                        <th className="px-5 py-4 font-medium">Type</th>
                        <th className="px-5 py-4 font-medium">Details</th>
                        <th className="px-5 py-4 font-medium">Reason</th>
                        <th className="px-5 py-4 font-medium">Date</th>
                        <th className="px-5 py-4 font-medium">Status</th>
                        <th className="px-5 py-4 font-medium">Admin Feedback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {history.map(req => (
                        <tr key={`${req.reqType}-${req.id}`} className="hover:bg-secondary/20 transition-colors">
                          <td className="px-5 py-4">
                            {req.reqType === "mfa" ? (
                              <span className="px-2 py-1 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                🔑 MFA Reset
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded text-[10px] font-semibold bg-secondary text-muted-foreground border border-border">
                                📁 File Access
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 font-medium max-w-[160px] truncate text-sm" title={req.reqType === "mfa" ? "MFA Authenticator Reset" : (req.File?.filename || "Unknown")}>
                            {req.reqType === "mfa" ? (
                              <span className="text-muted-foreground italic text-xs">Authenticator Reset</span>
                            ) : (req.File?.filename || "Unknown File")}
                          </td>
                          <td className="px-5 py-4 max-w-[180px] truncate text-xs text-muted-foreground" title={req.reason || ""}>
                            {req.reason || <span className="italic">—</span>}
                          </td>
                          <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(req.createdAt).toLocaleString()}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold ${
                              req.status === "rejected" ? "bg-red-900/30 text-red-400 border border-red-500/30" :
                              req.status === "approved" ? "bg-green-900/30 text-green-400 border border-green-500/30" :
                              "bg-yellow-900/30 text-yellow-400 border border-yellow-500/30"
                            }`}>
                              {req.status === "approved" && <CheckCircle className="w-3 h-3" />}
                              {req.status === "rejected" && <XCircle className="w-3 h-3" />}
                              {req.status === "pending"  && <Clock className="w-3 h-3" />}
                              {req.status?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-4 max-w-[200px] truncate text-xs"
                            title={req.status === "rejected" ? (req.adminMessage || req.admin_comment || "") : undefined}>
                            {req.status === "rejected" ? (
                              <span className="text-red-400 font-medium">
                                {req.adminMessage || req.admin_comment || "No reason provided"}
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

        </div>
      </main>

      {/* ── Request Access Modal ───────────────────────────────────── */}
      {requestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 rounded-xl shadow-2xl border border-border relative">
            <button onClick={() => setRequestModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" /> Request Access
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Provide a business justification (minimum 10 characters).
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 500))}
              placeholder="e.g. Needed for Q3 financial review..."
              className={`w-full h-28 p-3 bg-background border rounded-lg text-sm mb-1 focus:outline-none focus:ring-2 resize-none transition-colors ${
                reason.length > 0 && reason.trim().length < 10
                  ? "border-destructive focus:ring-destructive"
                  : "border-border focus:ring-primary"
              }`}
            />
            <div className="flex items-center justify-between mb-4">
              {reason.length > 0 && reason.trim().length < 10 ? (
                <p className="text-xs text-destructive">{10 - reason.trim().length} more character{10 - reason.trim().length !== 1 ? "s" : ""} needed</p>
              ) : <span />}
              <p className="text-xs text-muted-foreground ml-auto">{reason.length}/500</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setRequestModalOpen(false)}
                className="px-4 py-2 rounded-lg hover:bg-secondary border border-border transition text-sm font-medium">
                Cancel
              </button>
              <button onClick={submitAccessRequest}
                disabled={requestLoading || reason.trim().length < 10}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                {requestLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDashboard;