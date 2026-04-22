import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileUp, Lock, ShieldCheck, Loader2, FolderOpen,
} from "lucide-react";
import api from "../api/axios";

const ALL_DEPTS = ["All Departments", "IT", "HR", "ACCOUNTS", "MARKETING"];

const EmployeeUpload = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const role = localStorage.getItem("ztg_role") || "intern";

  const isIntern = role === "intern";
  const isStaff  = role === "staff";
  const isSenior = role === "senior";

  const [file,              setFile]              = useState<File | null>(null);
  const [sensitivity,       setSensitivity]       = useState("low");
  const [targetDepartments, setTargetDepartments] = useState<string[]>(["All Departments"]);
  const [allowIntern,       setAllowIntern]       = useState(false);
  const [allowStaff,        setAllowStaff]        = useState(true);
  const [allowSenior,       setAllowSenior]       = useState(true);
  const [uploading,         setUploading]         = useState(false);
  const [uploadSuccess,     setUploadSuccess]     = useState(false);
  const [dragOver,          setDragOver]          = useState(false);

  // Pre-fill department from profile
  useEffect(() => {
    api.get("/api/auth/profile").then(res => {
      const dept = res.data?.user?.department || res.data?.department || "";
      if (dept) setTargetDepartments([dept]);
    }).catch(() => {});
  }, []);

  // Role-based permission defaults
  useEffect(() => {
    if (isIntern) {
      setAllowIntern(true); setAllowStaff(true); setAllowSenior(true);
      setSensitivity("low");
    } else if (isStaff) {
      setAllowIntern(false); setAllowStaff(true); setAllowSenior(true);
    } else if (isSenior) {
      setAllowIntern(false); setAllowStaff(false); setAllowSenior(true);
    }
  }, [role]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const toggleDept = (dept: string) => {
    if (dept === "All Departments") { setTargetDepartments(["All Departments"]); return; }
    let nd = targetDepartments.filter(d => d !== "All Departments");
    nd = nd.includes(dept) ? nd.filter(d => d !== dept) : [...nd, dept];
    setTargetDepartments(nd.length === 0 ? ["All Departments"] : nd);
  };

  const uploadFile = async () => {
    if (!file) { toast({ title: "No File Selected", description: "Please select a file before uploading.", variant: "destructive" }); return; }
    setUploading(true);
    const formData = new FormData();
    formData.append("file",              file);
    formData.append("allowIntern",       String(allowIntern));
    formData.append("allowStaff",        String(allowStaff));
    formData.append("allowSenior",       String(allowSenior));
    formData.append("sensitivityLevel",  sensitivity);
    formData.append("targetDepartments", JSON.stringify(targetDepartments));
    try {
      await api.post("/api/files/upload", formData);
      setUploadSuccess(true);
      setFile(null);
      setTimeout(() => { setUploadSuccess(false); navigate("/dashboard"); }, 1800);
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.response?.data?.message || err.response?.data?.error || "Upload failed. Please try again.", variant: "destructive" });
    } finally { setUploading(false); }
  };

  // Sensitivity options available by role
  const sensOptions = [
    { val: "low",      label: "Low",      desc: "General use",       cls: "border-green-500/40 text-green-400 bg-green-900/20",   disabled: false           },
    { val: "high",     label: "High",     desc: "Confidential",      cls: "border-orange-500/40 text-orange-400 bg-orange-900/20", disabled: isIntern        },
    { val: "critical", label: "Critical", desc: "Restricted access", cls: "border-red-500/40 text-red-400 bg-red-900/20",          disabled: isIntern || isStaff },
  ];

  const roleCards = [
    { key: "intern",  label: "Intern",  val: allowIntern,  toggle: () => setAllowIntern(!allowIntern),  forced: isIntern,  forcedOn: isIntern  },
    { key: "staff",   label: "Staff",   val: allowStaff,   toggle: () => setAllowStaff(!allowStaff),    forced: isIntern || isStaff, forcedOn: isIntern || isStaff },
    { key: "senior",  label: "Senior",  val: allowSenior,  toggle: () => setAllowSenior(!allowSenior),  forced: isIntern || isStaff || isSenior, forcedOn: true },
    { key: "admin",   label: "Admin",   val: true,          toggle: () => {},                            forced: true,      forcedOn: true  },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />

      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FolderOpen className="w-6 h-6 text-primary" /> Upload File
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Share files securely with your department or the organisation.
              </p>
            </div>
            <div className="mr-14"><UserProfileCard /></div>
          </div>

          {/* Main upload card — two-column grid matching admin FileManagement */}
          <div className="glass-card rounded-xl border border-border p-8">
            <div className="grid grid-cols-2 gap-8">

              {/* ── LEFT COLUMN: Drop Zone + Sensitivity ────────────────────── */}
              <div className="flex flex-col gap-6">

                {/* Drop zone */}
                <div>
                  <label className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <FileUp className="w-4 h-4 text-primary" /> Select File
                  </label>
                  <label
                    className={`flex flex-col items-center justify-center w-full h-52 border-2 border-dashed rounded-xl cursor-pointer transition-all group ${
                      dragOver
                        ? "border-primary bg-primary/10 scale-[1.01]"
                        : "border-border hover:border-primary/50 hover:bg-primary/5"
                    }`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
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
                        <p className="text-sm text-muted-foreground">Click to choose or drag & drop</p>
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
                    {sensOptions.map(s => (
                      <button
                        key={s.val}
                        disabled={s.disabled}
                        onClick={() => !s.disabled && setSensitivity(s.val)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          sensitivity === s.val && !s.disabled
                            ? s.cls + " font-bold"
                            : s.disabled
                              ? "border-border bg-secondary/20 text-muted-foreground/30 cursor-not-allowed"
                              : "border-border bg-secondary/30 text-muted-foreground hover:border-border/80"
                        }`}
                      >
                        <p className="text-sm font-semibold">{s.label}</p>
                        <p className="text-[11px] mt-0.5 opacity-70">{s.desc}</p>
                      </button>
                    ))}
                  </div>
                  {isIntern && (
                    <p className="text-[11px] text-muted-foreground mt-2 pl-1">
                      Interns can only upload Low sensitivity files.
                    </p>
                  )}
                </div>
              </div>

              {/* ── RIGHT COLUMN: Roles + Departments + Button ───────────────── */}
              <div className="flex flex-col gap-6">

                {/* Access permissions */}
                <div>
                  <label className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" /> Access Permissions
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {roleCards.map(r => (
                      <button
                        key={r.key}
                        disabled={r.forced}
                        onClick={r.toggle}
                        className={`p-4 rounded-xl border-2 transition-all text-center ${
                          r.val
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary/30 text-muted-foreground"
                        } ${r.forced ? "opacity-60 cursor-default" : "hover:border-primary/50"}`}
                      >
                        <p className="text-xs font-bold uppercase">{r.label}</p>
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
                        <button
                          key={dept}
                          type="button"
                          onClick={() => toggleDept(dept)}
                          className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${
                            isSelected
                              ? "bg-primary/20 border-primary text-primary"
                              : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
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
                <button
                  onClick={uploadFile}
                  disabled={uploading || !file}
                  className={`w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all ${
                    uploadSuccess
                      ? "bg-green-600 text-white"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  }`}
                >
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

        </div>
      </main>
    </div>
  );
};

export default EmployeeUpload;
