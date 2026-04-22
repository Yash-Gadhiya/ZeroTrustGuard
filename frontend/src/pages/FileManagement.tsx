import { useState, useEffect, useCallback } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { PinModal } from "@/components/PinModal";
import { useToast } from "@/hooks/use-toast";
import api from "../api/axios";
import { socApi } from "@/lib/api";
import {
  Upload, FileText, Download, Pencil, Trash2,
  Search, Filter, RefreshCw, X, AlertTriangle, Loader2,
  ShieldCheck, Lock, FileUp, FolderOpen,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SocFile {
  id: number;
  filename: string;
  originalName?: string;
  department: string;
  sensitivityLevel?: string;
  target_department?: string | string[];
  allowedRoles?: string[];
  createdAt: string;
  User: { name: string; email: string; role: string };
}

const DEPT_COLORS: Record<string, string> = {
  "All Departments": "bg-blue-900/40 text-blue-400 border border-blue-500/50",
  "IT":              "bg-cyan-900/40 text-cyan-400 border border-cyan-500/50",
  "HR":              "bg-purple-900/40 text-purple-400 border border-purple-500/50",
  "ACCOUNTS":        "bg-amber-900/40 text-amber-400 border border-amber-500/50",
  "MARKETING":       "bg-pink-900/40 text-pink-400 border border-pink-500/50",
};

const SENSITIVITY_STYLE: Record<string, string> = {
  low:      "bg-green-900/30 text-green-400 border-green-500/30",
  high:     "bg-orange-900/30 text-orange-400 border-orange-500/30",
  critical: "bg-red-900/30 text-red-400 border-red-500/30",
};

const ALL_DEPTS = ["All Departments", "IT", "HR", "ACCOUNTS", "MARKETING"];

// ── Component ─────────────────────────────────────────────────────────────────
const FileManagement = () => {
  const { toast } = useToast();
  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"upload" | "files">("files");

  // ── Upload state ─────────────────────────────────────────────────────────
  const [file,               setFile]               = useState<File | null>(null);
  const [allowIntern,        setAllowIntern]        = useState(false);
  const [allowStaff,         setAllowStaff]         = useState(true);
  const [allowSenior,        setAllowSenior]        = useState(true);
  const [sensitivity,        setSensitivity]        = useState("low");
  const [targetDepartments,  setTargetDepartments]  = useState<string[]>(["All Departments"]);
  const [uploading,          setUploading]          = useState(false);
  const [uploadSuccess,      setUploadSuccess]      = useState(false);

  // ── Files list state ──────────────────────────────────────────────────────
  const [files,          setFiles]          = useState<SocFile[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [searchEmail,    setSearchEmail]    = useState("");
  const [filterDept,     setFilterDept]     = useState("");
  const [filterSens,     setFilterSens]     = useState("");

  // ── File action state ─────────────────────────────────────────────────────
  const [pinModalOpen,     setPinModalOpen]     = useState(false);
  const [fileToDownload,   setFileToDownload]   = useState<{ id: number; filename: string } | null>(null);
  const [downloadPinError, setDownloadPinError] = useState("");
  const [deleteModalOpen,  setDeleteModalOpen]  = useState(false);
  const [editModalOpen,    setEditModalOpen]    = useState(false);
  const [selectedFile,     setSelectedFile]     = useState<SocFile | null>(null);
  const [editTargetDepts,  setEditTargetDepts]  = useState<string[]>([]);
  const [editAllowedRoles, setEditAllowedRoles] = useState<string[]>([]);
  const [actionLoading,    setActionLoading]    = useState(false);

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchFiles = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await socApi.getSocFiles({});
      setFiles(res.data.files || []);
    } catch (err) {
      console.error("Failed to fetch files", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredFiles = files.filter(f => {
    const matchEmail = !searchEmail || (f.User?.email || "").toLowerCase().includes(searchEmail.toLowerCase());
    const matchDept  = !filterDept || f.department === filterDept;
    const matchSens  = !filterSens || f.sensitivityLevel === filterSens;
    return matchEmail && matchDept && matchSens;
  });

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filteredFiles.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchEmail, filterDept, filterSens]);

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadFile = async () => {
    if (!file) { toast({ title: "No File Selected", description: "Please select a file before uploading.", variant: "destructive" }); return; }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("allowIntern",        String(allowIntern));
    formData.append("allowStaff",         String(allowStaff));
    formData.append("allowSenior",        String(allowSenior));
    formData.append("sensitivityLevel",   sensitivity);
    formData.append("targetDepartments",  JSON.stringify(targetDepartments));
    try {
      await api.post("/api/files/upload", formData);
      setUploadSuccess(true);
      setFile(null); setAllowIntern(false); setAllowStaff(true);
      setAllowSenior(true); setSensitivity("low"); setTargetDepartments(["All Departments"]);
      setTimeout(() => { setUploadSuccess(false); setActiveTab("files"); fetchFiles(true); }, 1500);
    } catch (err: any) { toast({ title: "Upload Failed", description: err?.response?.data?.message || "File upload failed. Please try again.", variant: "destructive" }); }
    finally { setUploading(false); }
  };

  // ── File actions ──────────────────────────────────────────────────────────
  const handleDownload = (id: number, filename: string) => {
    setFileToDownload({ id, filename });
    setDownloadPinError("");
    setPinModalOpen(true);
  };

  const processDownload = async (pin: string) => {
    if (!fileToDownload) return;
    try {
      const res = await api.get(`/api/files/download/${fileToDownload.id}`, {
        responseType: "blob",
        headers: { "x-mfa-pin": pin },
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = fileToDownload.filename;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); a.remove();
      setPinModalOpen(false); setFileToDownload(null);
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const data = JSON.parse(text);
          if (data.mfaRequired) { setDownloadPinError(data.message || "Invalid PIN"); return; }
          toast({ title: "Download Failed", description: data.message || "Download failed.", variant: "destructive" });
        } catch { toast({ title: "Download Failed", description: "Could not parse server response.", variant: "destructive" }); }
      } else {
        toast({ title: "Download Failed", description: err.response?.data?.message || "Network error during download.", variant: "destructive" });
      }
      setPinModalOpen(false);
    }
  };

  const confirmDeleteFile = async () => {
    if (!selectedFile) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/files/${selectedFile.id}`);
      setDeleteModalOpen(false); setSelectedFile(null);
      setFiles(prev => prev.filter(f => f.id !== selectedFile.id));
    } catch (err: any) { toast({ title: "Delete Failed", description: err?.response?.data?.message || "Failed to delete file.", variant: "destructive" }); }
    finally { setActionLoading(false); }
  };

  const openEditModal = (file: SocFile) => {
    let targets: string[] = [];
    if (typeof file.target_department === "string") {
      try { targets = JSON.parse(file.target_department); } catch { targets = [file.target_department]; }
    } else if (Array.isArray(file.target_department)) {
      targets = file.target_department;
    } else { targets = ["All Departments"]; }
    setSelectedFile(file);
    setEditTargetDepts(targets);
    setEditAllowedRoles(file.allowedRoles || ["admin", "senior", "staff", "intern"]);
    setEditModalOpen(true);
  };

  const confirmUpdatePermissions = async () => {
    if (!selectedFile) return;
    setActionLoading(true);
    try {
      await api.patch(`/api/files/${selectedFile.id}/permissions`, {
        targetDepartments: editTargetDepts,
        allowedRoles: editAllowedRoles,
      });
      setEditModalOpen(false); setSelectedFile(null);
      fetchFiles(true);
    } catch (err: any) { toast({ title: "Update Failed", description: err?.response?.data?.message || "Failed to update permissions.", variant: "destructive" }); }
    finally { setActionLoading(false); }
  };

  const parseDepts = (f: SocFile): string[] => {
    if (typeof f.target_department === "string") {
      try { return JSON.parse(f.target_department); } catch { return [f.target_department]; }
    }
    return Array.isArray(f.target_department) ? f.target_department : ["All Departments"];
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <PinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSubmit={processDownload}
        error={downloadPinError}
        title="Download Secured File"
        description={`Enter your 6-digit authenticator code to download "${fileToDownload?.filename}"`}
      />

      {/* Delete confirmation */}
      {deleteModalOpen && selectedFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 rounded-xl border border-destructive/20 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-destructive">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-xl font-bold">Confirm Deletion</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              Permanently delete <span className="font-semibold text-foreground">"{selectedFile.originalName || selectedFile.filename}"</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button disabled={actionLoading} onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-sm hover:bg-secondary rounded-lg border border-border">Cancel</button>
              <button disabled={actionLoading} onClick={confirmDeleteFile}
                className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 flex items-center gap-2">
                {actionLoading && <Loader2 className="animate-spin w-4 h-4" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit permissions */}
      {editModalOpen && selectedFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg p-6 rounded-xl border border-primary/20 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" /> Edit File Permissions
              </h2>
              <button onClick={() => setEditModalOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Editing: <span className="font-semibold text-foreground">{selectedFile.originalName || selectedFile.filename}</span>
            </p>
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-3 block">Target Departments</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_DEPTS.map(dept => {
                    const sel = editTargetDepts.includes(dept);
                    return (
                      <button key={dept} onClick={() => {
                        if (dept === "All Departments") { setEditTargetDepts(["All Departments"]); return; }
                        let nd = editTargetDepts.filter(d => d !== "All Departments");
                        nd = sel ? nd.filter(d => d !== dept) : [...nd, dept];
                        setEditTargetDepts(nd.length === 0 ? ["All Departments"] : nd);
                      }}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${sel ? "bg-primary/20 border-primary text-primary" : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/50"}`}>
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-3 block">Allowed Roles</label>
                <div className="flex flex-wrap gap-2">
                  {["admin", "senior", "staff", "intern"].map(role => {
                    const sel = editAllowedRoles.includes(role);
                    const mandatory = role === "admin";
                    return (
                      <button key={role} disabled={mandatory}
                        onClick={() => sel
                          ? setEditAllowedRoles(editAllowedRoles.filter(r => r !== role))
                          : setEditAllowedRoles([...editAllowedRoles, role])}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${sel ? "bg-primary/20 border-primary text-primary" : "bg-secondary/50 border-border text-muted-foreground"} ${mandatory ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50"}`}>
                        {role.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button disabled={actionLoading} onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-secondary">Discard</button>
              <button disabled={actionLoading} onClick={confirmUpdatePermissions}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2">
                {actionLoading && <Loader2 className="animate-spin w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FolderOpen className="w-6 h-6 text-primary" /> File Management
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Upload, manage, and control access to organisation files.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => fetchFiles(false)} disabled={loading}
                className="px-4 py-2 rounded-lg bg-secondary border border-border text-sm hover:bg-secondary/80 transition-colors inline-flex items-center gap-2 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
              <div className="mr-14"><UserProfileCard /></div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total Files",    value: files.length,                                           cls: "text-primary",   bg: "from-primary/10 to-primary/5",       border: "border-primary/20"   },
              { label: "Critical Files", value: files.filter(f => f.sensitivityLevel === "critical").length, cls: "text-red-400",   bg: "from-red-900/20 to-red-900/5",       border: "border-red-500/20"   },
              { label: "Shared Broadly", value: files.filter(f => JSON.stringify(f.target_department).includes("All")).length, cls: "text-amber-400", bg: "from-amber-900/20 to-amber-900/5", border: "border-amber-500/20" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border ${s.border} bg-gradient-to-br ${s.bg} p-4`}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className={`text-3xl font-black font-mono mt-1 ${s.cls}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Tab buttons */}
          <div className="flex gap-1 mb-5 bg-secondary/40 border border-border rounded-xl p-1 w-fit">
            {([
              { id: "files",  label: "All Files",   icon: <FileText className="w-4 h-4" />,  count: filteredFiles.length },
              { id: "upload", label: "Upload File",  icon: <FileUp className="w-4 h-4" />,   count: null  },
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
                {tab.icon}
                {tab.label}
                {tab.count !== null && (
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id ? "bg-white/20" : "bg-secondary text-muted-foreground"
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── UPLOAD TAB ───────────────────────────────────────────────────── */}
          {activeTab === "upload" && (
            <div className="glass-card rounded-xl border border-border p-8">
              <div className="grid grid-cols-2 gap-8">

                {/* ── LEFT COLUMN: File + Sensitivity ───────────────────────── */}
                <div className="flex flex-col gap-6">

                  {/* Drop zone */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <FileUp className="w-4 h-4 text-primary" /> Select File
                    </label>
                    <label className="flex flex-col items-center justify-center w-full h-52 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group">
                      <Upload className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors mb-3" />
                      {file ? (
                        <div className="text-center px-4">
                          <p className="text-sm font-semibold text-foreground truncate max-w-xs">{file.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                          <span className="mt-2 inline-block text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                            ✓ Ready to upload
                          </span>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Click to choose a file</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Any file type supported</p>
                        </div>
                      )}
                      <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>

                  {/* Sensitivity */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-primary" /> Sensitivity Level
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { val: "low",      label: "Low",      desc: "General use",       cls: "border-green-500/40 text-green-400 bg-green-900/20"   },
                        { val: "high",     label: "High",     desc: "Confidential",      cls: "border-orange-500/40 text-orange-400 bg-orange-900/20" },
                        { val: "critical", label: "Critical", desc: "Restricted access", cls: "border-red-500/40 text-red-400 bg-red-900/20"          },
                      ].map(s => (
                        <button key={s.val} onClick={() => setSensitivity(s.val)}
                          className={`p-4 rounded-xl border-2 transition-all text-left ${
                            sensitivity === s.val ? s.cls + " font-bold" : "border-border bg-secondary/30 text-muted-foreground hover:border-border/80"
                          }`}>
                          <p className="text-sm font-semibold">{s.label}</p>
                          <p className="text-[11px] mt-0.5 opacity-70">{s.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── RIGHT COLUMN: Roles + Departments + Button ────────────── */}
                <div className="flex flex-col gap-6">

                  {/* Access roles */}
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" /> Access Permissions
                    </label>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: "intern", val: allowIntern,  set: setAllowIntern,  forced: false },
                        { key: "staff",  val: allowStaff,   set: setAllowStaff,   forced: false },
                        { key: "senior", val: allowSenior,  set: setAllowSenior,  forced: false },
                        { key: "admin",  val: true,         set: () => {},        forced: true  },
                      ].map(r => (
                        <button key={r.key}
                          disabled={r.forced}
                          onClick={() => r.set(!r.val)}
                          className={`p-4 rounded-xl border-2 transition-all text-center ${
                            r.val
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-secondary/30 text-muted-foreground"
                          } ${r.forced ? "opacity-60 cursor-default" : "hover:border-primary/50"}`}>
                          <p className="text-xs font-bold uppercase">{r.key}</p>
                          <p className="text-[10px] mt-1 opacity-70">{r.val ? "✓ Allowed" : "Blocked"}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Target departments */}
                  <div className="flex-1">
                    <label className="text-sm font-semibold text-foreground mb-3 block">
                      Target Departments
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_DEPTS.map(dept => {
                        const isSelected = targetDepartments.includes(dept);
                        return (
                          <button key={dept} type="button"
                            onClick={() => {
                              if (dept === "All Departments") { setTargetDepartments(["All Departments"]); return; }
                              let nd = targetDepartments.filter(d => d !== "All Departments");
                              nd = isSelected ? nd.filter(d => d !== dept) : [...nd, dept];
                              setTargetDepartments(nd.length === 0 ? ["All Departments"] : nd);
                            }}
                            className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${
                              isSelected
                                ? "bg-primary/20 border-primary text-primary"
                                : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/50"
                            }`}>
                            {dept}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3">
                      Employees in the selected departments will be able to see this file.
                    </p>
                  </div>

                  {/* Upload button — pinned to bottom of right column */}
                  <button onClick={uploadFile} disabled={uploading || !file}
                    className={`w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all ${
                      uploadSuccess
                        ? "bg-green-600 text-white"
                        : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    }`}>
                    {uploading ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Uploading…</>
                    ) : uploadSuccess ? (
                      <><ShieldCheck className="w-5 h-5" /> Uploaded! Redirecting…</>
                    ) : (
                      <><Upload className="w-5 h-5" /> Upload File</>
                    )}
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* ── FILES TAB ────────────────────────────────────────────────────── */}
          {activeTab === "files" && (
            <div>
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input type="text" placeholder="Filter by uploader email…" value={searchEmail}
                    onChange={e => setSearchEmail(e.target.value)}
                    className="pl-8 pr-4 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground focus:border-primary focus:outline-none w-64" />
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                    className="pl-8 pr-4 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground focus:border-primary focus:outline-none">
                    <option value="">All Depts</option>
                    {["IT","HR","ACCOUNTS","MARKETING"].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <select value={filterSens} onChange={e => setFilterSens(e.target.value)}
                  className="px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground focus:border-primary focus:outline-none">
                  <option value="">All Sensitivity</option>
                  <option value="low">Low</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                {(searchEmail || filterDept || filterSens) && (
                  <button onClick={() => { setSearchEmail(""); setFilterDept(""); setFilterSens(""); }}
                    className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border border-border rounded-lg hover:bg-secondary/50 transition-colors">
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{filteredFiles.length} files</span>
              </div>

              {/* Table */}
              <div className="glass-card rounded-xl border border-border overflow-hidden">
                {loading ? (
                  <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm">Loading files…</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                        <tr>
                          <th className="px-6 py-4 font-medium">File Name</th>
                          <th className="px-6 py-4 font-medium">Sensitivity</th>
                          <th className="px-6 py-4 font-medium">Uploader Dept</th>
                          <th className="px-6 py-4 font-medium">Visible To</th>
                          <th className="px-6 py-4 font-medium">Uploaded By</th>
                          <th className="px-6 py-4 font-medium">Upload Date</th>
                          <th className="px-6 py-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {paged.length === 0 && (
                          <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                            No files found
                          </td></tr>
                        )}
                        {paged.map(file => {
                          const targets = parseDepts(file);
                          const sensStyle = SENSITIVITY_STYLE[file.sensitivityLevel || "low"] || SENSITIVITY_STYLE.low;
                          return (
                            <tr key={file.id} className="hover:bg-secondary/20 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                  <span className="font-medium truncate max-w-[200px]" title={file.filename}>
                                    {file.originalName || file.filename}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase border ${sensStyle}`}>
                                  {file.sensitivityLevel || "low"}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-muted-foreground">{file.department || "—"}</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {targets.map(t => (
                                    <span key={t} className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${DEPT_COLORS[t] || "bg-secondary text-foreground border border-border"}`}>
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-sm">{file.User?.name || "—"}</p>
                                <p className="text-xs text-muted-foreground">{file.User?.email}</p>
                              </td>
                              <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(file.createdAt).toLocaleString()}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => handleDownload(file.id, file.originalName || file.filename)}
                                    className="p-1.5 bg-secondary text-foreground hover:bg-primary/20 hover:text-primary rounded-lg transition-colors border border-border" title="Download">
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openEditModal(file)}
                                    className="p-1.5 bg-secondary text-foreground hover:bg-primary/20 hover:text-primary rounded-lg transition-colors border border-border" title="Edit Permissions">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => { setSelectedFile(file); setDeleteModalOpen(true); }}
                                    className="p-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg transition-colors border border-destructive/20" title="Delete">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {!loading && filteredFiles.length > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-4 px-1 text-sm text-muted-foreground">
                  <span>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredFiles.length)} of {filteredFiles.length}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(1)} disabled={safePage === 1}
                      className="px-2 py-1 text-xs rounded border border-border bg-secondary disabled:opacity-40 hover:bg-secondary/60">«</button>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                      className="px-3 py-1 text-xs rounded border border-border bg-secondary disabled:opacity-40 hover:bg-secondary/60">‹ Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                      .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                        if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(n); return acc;
                      }, [])
                      .map((item, idx) => item === "..." ? (
                        <span key={`e-${idx}`} className="px-2 text-xs text-muted-foreground">…</span>
                      ) : (
                        <button key={item} onClick={() => setPage(item as number)}
                          className={`px-3 py-1 text-xs rounded border transition-colors ${safePage === item ? "border-primary bg-primary/10 text-primary font-bold" : "border-border bg-secondary hover:bg-secondary/60"}`}>
                          {item}
                        </button>
                      ))
                    }
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                      className="px-3 py-1 text-xs rounded border border-border bg-secondary disabled:opacity-40 hover:bg-secondary/60">Next ›</button>
                    <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
                      className="px-2 py-1 text-xs rounded border border-border bg-secondary disabled:opacity-40 hover:bg-secondary/60">»</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default FileManagement;
