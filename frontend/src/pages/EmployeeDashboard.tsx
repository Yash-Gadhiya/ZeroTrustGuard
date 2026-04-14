import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { Loader2, Download, Lock, FileText, X } from "lucide-react";
import api from "../api/axios";
import { PinModal } from "@/components/PinModal";
import { SecureFileViewer } from "@/components/SecureFileViewer";

interface FileItem {
  id: number;
  filename: string;
  originalName?: string;
  department: string;
  target_department?: string;
  canView: boolean;
  canDownload: boolean;
  createdAt: string;
}

const EmployeeDashboard = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("")
  const [userDept, setUserDept] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"files" | "history">("files");
  const [history, setHistory] = useState<any[]>([]);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [fileToProcess, setFileToProcess] = useState<{id: number, filename: string, originalName: string, action: 'view' | 'download'} | null>(null);
  const [downloadPinError, setDownloadPinError] = useState("");

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFilename, setViewerFilename] = useState<string>("");

  useEffect(() => {
    if (activeTab === "files") {
      fetchFiles();
    } else {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/files/my-files");
      setFiles(res.data.files);
      // Infer department from first file or profile
      if (res.data.files?.length > 0 && !userDept) {
        setUserDept(res.data.files[0].department || "");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Network error. Could not fetch files.");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const [fileRes, mfaRes] = await Promise.all([
        api.get("/api/access-requests/my-requests"),
        api.get("/api/mfa/my-requests")
      ]);

      const accessReqs = (fileRes.data.requests || []).map((r: any) => ({ ...r, reqType: 'access' }));
      const mfaReqs = (mfaRes.data || []).map((r: any) => ({ ...r, reqType: 'mfa' }));

      const combined = [...accessReqs, ...mfaReqs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setHistory(combined);
    } catch (err: any) {
      setError(err.response?.data?.message || "Network error. Could not fetch history.");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (id: number, filename: string, originalName: string, action: 'view' | 'download') => {
    setFileToProcess({ id, filename, originalName, action });
    setDownloadPinError("");
    setPinModalOpen(true);
  };

  const closeViewer = () => {
    if (viewerUrl) {
      window.URL.revokeObjectURL(viewerUrl);
      setViewerUrl(null);
      setViewerFilename("");
    }
  };

  const processAction = async (pin: string) => {
    if (!fileToProcess) return;

    if (fileToProcess.action === 'view') {
      try {
        const res = await api.get(`/api/files/view/${fileToProcess.id}`, {
          responseType: "blob",
          headers: { "x-mfa-pin": pin }
        });
        const mimeType = res.headers['content-type'] || 'application/octet-stream';
        const blob = new Blob([res.data], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        
        setViewerUrl(url);
        setViewerFilename(fileToProcess.originalName || fileToProcess.filename);

        setPinModalOpen(false);
        setFileToProcess(null);
      } catch (err: any) {
        if (err.response && err.response.data instanceof Blob) {
          const text = await err.response.data.text();
          try {
              const data = JSON.parse(text);
              if (data.mfaRequired) {
                  setDownloadPinError(data.message || "Invalid PIN");
                  return;
              }
              alert(data.message || "View failed.");
          } catch {
              alert("View failed.");
          }
        } else {
          alert(err.response?.data?.message || "Network error during view.");
        }
        setPinModalOpen(false);
      }
    } else {
      try {
        const res = await api.get(`/api/files/download/${fileToProcess.id}`, {
          responseType: "blob",
          headers: { "x-mfa-pin": pin }
        });

        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = fileToProcess.originalName || fileToProcess.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

        setPinModalOpen(false);
        setFileToProcess(null);
      } catch (err: any) {
        if (err.response && err.response.data instanceof Blob) {
          const text = await err.response.data.text();
          try {
              const data = JSON.parse(text);
              if (data.mfaRequired) {
                  setDownloadPinError(data.message || "Invalid PIN");
                  return;
              }
              alert(data.message || "Download failed.");
          } catch {
              alert("Download failed.");
          }
        } else {
          alert(err.response?.data?.message || "Network error during download.");
        }
        setPinModalOpen(false);
      }
    }
  };

  const openRequestModal = (fileId: number) => {
    setSelectedFileId(fileId);
    setReason("");
    setRequestModalOpen(true);
  };

  const submitAccessRequest = async () => {
    if (!reason.trim()) {
      alert("Please provide a reason.");
      return;
    }

    setRequestLoading(true);
    try {
      await api.post("/api/files/request-access", {
        fileId: selectedFileId,
        reason,
      });

      alert("Access requested successfully!");
      setRequestModalOpen(false);
      setSelectedFileId(null);
    } catch (err: any) {
      alert(err.response?.data?.message || "Network error or failed to request access.");
    } finally {
      setRequestLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <PinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSubmit={processAction}
        error={downloadPinError}
        title={fileToProcess?.action === 'view' ? "View Secured File" : "Download Secured File"}
        description={`Enter your 6-digit authenticator code to ${fileToProcess?.action} ${fileToProcess?.originalName || fileToProcess?.filename}`}
      />
      
      <SecureFileViewer
        url={viewerUrl}
        filename={viewerFilename}
        onClose={closeViewer}
      />

      <main className="flex-1 p-8 relative overflow-y-auto">
        <div className="absolute top-6 right-8 z-50">
          <UserProfileCard />
        </div>

        <div className="max-w-4xl mx-auto mt-4">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Department File Access</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View target files or track your request history.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border mb-6">
            <button
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "files"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              onClick={() => setActiveTab("files")}
            >
              Available Files
            </button>
            <button
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "history"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              onClick={() => setActiveTab("history")}
            >
              My Requests
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
          ) : activeTab === "files" && files.length === 0 ? (
            <div className="text-center p-10 bg-secondary/50 rounded-lg border border-border">
              <p className="text-muted-foreground">No files found for your department.</p>
            </div>
          ) : activeTab === "history" && history.length === 0 ? (
            <div className="text-center p-10 bg-secondary/50 rounded-lg border border-border">
              <p className="text-muted-foreground">No requests found.</p>
            </div>
          ) : activeTab === "files" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {files.map((file) => (
                <div key={file.id} className="glass-card p-6 border border-border flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-secondary rounded-lg">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    {!file.canView && !file.canDownload && (
                      <Lock className="w-5 h-5 text-warning" />
                    )}
                  </div>

                  <h3 className="font-semibold text-lg truncate mb-1" title={file.originalName || file.filename}>
                    {file.originalName || file.filename}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Added: {new Date(file.createdAt).toLocaleDateString()}
                  </p>

                  {/* Visibility badge */}
                  {(() => {
                    const tg = file.target_department || "All Departments";
                    const visColors: Record<string, string> = {
                      "All Departments": "bg-emerald-900/40 text-emerald-400 border border-emerald-500/50",
                      "IT":              "bg-cyan-900/40 text-cyan-400 border border-cyan-500/50",
                      "HR":              "bg-purple-900/40 text-purple-400 border border-purple-500/50",
                      "ACCOUNTS":        "bg-amber-900/40 text-amber-400 border border-amber-500/50",
                      "MARKETING":       "bg-pink-900/40 text-pink-400 border border-pink-500/50",
                    };
                    return (
                      <span className={`inline-block mb-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${visColors[tg] || "bg-secondary text-foreground"}`}>
                        {tg === "All Departments" ? "🌐 All Depts" : `🔒 ${tg} only`}
                      </span>
                    );
                  })()}

                  <div className="mt-auto pt-4 border-t border-border flex gap-2">
                    {file.canView ? (
                      <>
                        <button
                           onClick={() => handleAction(file.id, file.filename, file.originalName || file.filename, 'view')}
                          className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition flex items-center justify-center gap-2 text-sm font-medium"
                        >
                          <FileText className="w-4 h-4" />
                          View
                        </button>
                        {file.canDownload && (
                          <button
                            onClick={() => handleAction(file.id, file.filename, file.originalName || file.filename, 'download')}
                            className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition flex items-center justify-center gap-2 text-sm font-medium"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => openRequestModal(file.id)}
                        className="w-full py-2 px-4 bg-secondary text-foreground rounded hover:bg-secondary/80 transition flex items-center justify-center gap-2 text-sm font-medium border border-border"
                      >
                        <Lock className="w-4 h-4" />
                        Request Access
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Type</th>
                      <th className="px-6 py-4 font-medium">Details</th>
                      <th className="px-6 py-4 font-medium">Your Reason</th>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Admin Feedback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((req) => (
                      <tr key={`${req.reqType}-${req.id}`} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-6 py-4">
                          {req.reqType === "mfa" ? (
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                              🔑 MFA Reset
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-secondary text-muted-foreground border border-border">
                              📁 File Access
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-medium max-w-[160px] truncate" title={req.reqType === "mfa" ? "MFA Authenticator Reset" : (req.File?.filename || "Unknown File")}>
                          {req.reqType === "mfa" ? (
                            <span className="text-muted-foreground italic">Authenticator Reset</span>
                          ) : (
                            req.File?.filename || "Unknown File"
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-[180px] truncate text-xs text-muted-foreground" title={req.reason || ""}>
                          {req.reason || <span className="italic">—</span>}
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(req.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              req.status === "rejected" ? "bg-destructive/20 text-destructive" :
                              req.status === "approved" ? "bg-success/20 text-success" :
                              "bg-warning/20 text-warning"
                            }`}
                          >
                            {req.status.toUpperCase()}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 max-w-[200px] truncate text-xs"
                          title={req.status === "rejected" ? (req.adminMessage || req.admin_comment || "") : undefined}
                        >
                          {req.status === "rejected" ? (
                            <span className="text-destructive font-medium">
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
          )}
        </div>
      </main>

      {/* Request Access Modal */}
      {requestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md p-6 rounded-lg shadow-lg border border-border relative">
            <button
              onClick={() => setRequestModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-4">Request Access</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Please provide a business justification for needing access to this file.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Needed for Q3 financial review..."
              className="w-full h-32 p-3 bg-background border border-border rounded-md text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRequestModalOpen(false)}
                className="px-4 py-2 rounded-md hover:bg-secondary transition text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={submitAccessRequest}
                disabled={requestLoading || !reason.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {requestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
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