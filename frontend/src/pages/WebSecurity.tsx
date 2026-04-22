import { useState, useEffect, useCallback } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, RefreshCw, ShieldAlert, Zap, Globe, Search, Clock } from "lucide-react";
import api from "../api/axios";

interface WebScan {
  id: string;
  status: string;
  scan_type?: string;
  createdAt: string;
  vulnerabilities?: { target?: string, findings?: any[], scanType?: string };
}

const WebSecurity = () => {
  const { toast } = useToast();
  const [scans, setScans] = useState<WebScan[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [scanType, setScanType] = useState("Quick");
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [filterTargetUrl, setFilterTargetUrl] = useState("");
  const [filterTimeRange, setFilterTimeRange] = useState("all");
  const [activeScanSessionId, setActiveScanSessionId] = useState<number | null>(null);

  const fetchWebScans = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterTargetUrl) params.targetFilter = filterTargetUrl;
      if (filterTimeRange !== "all") params.timeRange = filterTimeRange;

      const res = await api.get('/api/websecurity/scans', { params });
      setScans(res.data.scans || []);
    } catch (error) {
      console.error("Failed to fetch web scans:", error);
    } finally {
      setLoading(false);
    }
  }, [filterTargetUrl, filterTimeRange]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchWebScans();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [fetchWebScans]);

  const startSecurityAudit = async () => {
    if (!targetUrl) return;
    setScanning(true);
    setActiveScanSessionId(null);
    setLogs([`[JARVIS] Establishing secure connection for ${scanType} Audit...`]);

    try {
      const token = localStorage.getItem("ztg_token");
      const API_BASE = "http://localhost:5000";
      
      const response = await fetch(`${API_BASE}/api/websecurity/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ targetUrl, scanType })
      });

      if (!response.body) throw new Error("Server streaming not supported.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // keep incomplete line buffer
          
          lines.forEach(line => {
             const trimmed = line.trim();
             if (trimmed) {
                if (trimmed === "---FINISHED---") {
                   // Acknowledge Finish Command
                } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                   // JSON appended at end — extract sessionScanId
                   try {
                     const parsed = JSON.parse(trimmed);
                     if (parsed.scanId) setActiveScanSessionId(null); // scan done
                   } catch {}
                } else if (trimmed.includes("Session ID:")) {
                   // Capture session ID from stream for stop button
                   const match = trimmed.match(/Session ID:\s*(\d+)/);
                   if (match) setActiveScanSessionId(Number(match[1]));
                   setLogs(prev => [...prev, trimmed]);
                } else {
                   setLogs(prev => [...prev, trimmed]);
                }
             }
          });
        }
      }

      await fetchWebScans();
      setLogs(prev => [...prev, `[JARVIS] Audit reporting concluded natively. Table dynamically updated.`]);
    } catch (err: any) {
      setLogs(prev => [...prev, `[ERROR] ${err.message || "Failed to execute streaming scan."}`]);
      // error is already visible in the JARVIS terminal above
    } finally {
      setScanning(false);
      setActiveScanSessionId(null);
    }
  };

  const stopScan = async () => {
    // Immediate UI reset — don't wait for backend
    setScanning(false);
    setActiveScanSessionId(null);
    setLogs(prev => [
      ...prev,
      "[SYSTEM] Emergency Stop Initiated. Process Terminated."
    ]);

    // Fire the kill request and await audit record creation
    try {
      const token = localStorage.getItem("ztg_token");
      const stopRes = await fetch("http://localhost:5000/api/websecurity/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ sessionScanId: activeScanSessionId })
      });
      const stopData = await stopRes.json();
      const auditId = stopData.auditId ?? "N/A";
      setLogs(prev => [
        ...prev,
        `[JARVIS] Scan terminated. Audit log ID: ${auditId} generated as CANCELLED.`
      ]);
      // Immediately refresh history table so CANCELLED row appears
      await fetchWebScans();
    } catch (err: any) {
      setLogs(prev => [...prev, `[ERROR] Stop API failed: ${err.message}`]);
    }
  };

  const downloadAuditReport = async (id: string | number) => {
    try {
      const res = await api.get(`/api/websecurity/report/${id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Security_Audit_Report_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err: any) {
      toast({ title: "Download Failed", description: "Could not download the audit report. Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 p-8 relative overflow-y-auto">
        <div className="absolute top-6 right-8 z-50">
          <UserProfileCard />
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Web Security</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Vulnerability scanning and threat assessment
            </p>
          </div>
          <button
            onClick={fetchWebScans}
            className="mr-14 px-4 py-2 rounded-md bg-secondary border border-border text-sm text-foreground hover:bg-secondary/80 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="glass-card p-6 mb-6 flex flex-col gap-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" /> Security Scanner
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-4">
                <div className="relative">
                  <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    value={scanType}
                    onChange={(e) => setScanType(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-secondary/50 border border-border text-foreground appearance-none cursor-pointer outline-none focus:border-primary text-sm transition-colors"
                  >
                    <option className="bg-background text-foreground" value="Quick">Quick Scan</option>
                    <option className="bg-background text-foreground" value="Stealth">Stealth Scan</option>
                    <option className="bg-background text-foreground" value="Vuln">Vulnerability Scan</option>
                    <option className="bg-background text-foreground" value="Full">Full Scan</option>
                    <option className="bg-background text-foreground" value="HEADER_AUDIT">Header Audit</option>
                    <option className="bg-background text-foreground" value="SSL_SCAN">SSL/TLS Scan (Deep Audit)</option>
                    <option className="bg-background text-foreground" value="CMS_SCAN">CMS Detection</option>
                  </select>
                </div>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="Enter target URL (e.g., http://localhost:5000)"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary/50 border border-border text-foreground outline-none focus:border-primary text-sm transition-colors placeholder:text-muted-foreground"
                  />
                </div>
                <button
                  onClick={scanning ? stopScan : startSecurityAudit}
                  disabled={!scanning && !targetUrl}
                  className={`px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full md:w-auto whitespace-nowrap text-sm ${
                    scanning
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {scanning && <Loader2 className="w-4 h-4 animate-spin" />}
                  {scanning ? "Stop Scan" : "Start Security Audit"}
                </button>
              </div>

              <div className="bg-black/90 text-green-400 font-mono text-xs p-4 rounded-md h-40 overflow-y-auto w-full border border-border shadow-inner mt-2">
                {logs.length === 0 ? (
                  <span className="opacity-50">System Idle. Awaiting commands...</span>
                ) : (
                  logs.map((log, i) => {
                    const isSSLAlert = log.includes("Grade C") || log.includes("Grade D") || log.includes("Grade F") || log.toLowerCase().includes("expired") || log.includes("Weak Ciphers");
                    const isMissingHeaders = log.includes("MISSING HEADERS");
                    const isOutdatedCMS = log.includes("OUTDATED CMS");
                    
                    return (
                      <div key={i} className={scanType === "Full" ? "text-cyan-400" : ""}>
                        {log.startsWith("[ALERT]") || isSSLAlert || isOutdatedCMS ? (
                          <span className="text-red-400 font-bold">{log}</span>
                        ) : log.startsWith("[SYSTEM]") ? (
                          <span className="text-red-500 font-bold animate-pulse">{log}</span>
                        ) : isMissingHeaders ? (
                          <span className="text-orange-400 font-bold">{log}</span>
                        ) : log.startsWith("[ERROR]") ? (
                          <span className="text-destructive font-bold">{log}</span>
                        ) : log.startsWith("[JARVIS]") ? (
                          <span className="text-primary font-bold">{log}</span>
                        ) : log.startsWith("[SYS]") ? (
                           <span className="text-muted-foreground">{log}</span>
                        ) : (
                          <span>{log}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search Target URL..."
                  value={filterTargetUrl}
                  onChange={(e) => setFilterTargetUrl(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary/50 border border-border text-foreground outline-none focus:border-primary text-sm transition-colors placeholder:text-muted-foreground"
                />
              </div>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <select
                  value={filterTimeRange}
                  onChange={(e) => setFilterTimeRange(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 rounded-lg bg-secondary/50 border border-border text-foreground appearance-none cursor-pointer outline-none focus:border-primary text-sm transition-colors"
                >
                  <option className="bg-background text-foreground" value="all">All Time</option>
                  <option className="bg-background text-foreground" value="24_hours">Last 24 Hours</option>
                  <option className="bg-background text-foreground" value="7_days">Last 7 Days</option>
                  <option className="bg-background text-foreground" value="30_days">Last 30 Days</option>
                </select>
              </div>
              <button
                onClick={() => {
                  setFilterTargetUrl("");
                  setFilterTimeRange("all");
                }}
                className="px-6 py-2 border border-border rounded-lg hover:bg-secondary text-foreground text-sm font-medium transition-colors whitespace-nowrap"
              >
                Clear Filters
              </button>
            </div>

            <div className="glass-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                    <tr>
                      <th className="px-6 py-4 font-medium">Target URL</th>
                      <th className="px-6 py-4 font-medium">Scan Type</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Timestamp</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {scans.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No scans found</td></tr>
                    ) : (
                      scans.map((scan) => {
                        // Normalize: prefer DB scan_type, fall back to vulnerabilities.scanType,
                        // then the raw scanType field. Always uppercase for display + lookup.
                        const rawLabel = scan.scan_type || scan.vulnerabilities?.scanType || "Unknown";

                        // Map raw backend keys → human-readable full names
                        const rawToFull: Record<string, string> = {
                          "Quick":        "Quick Scan",
                          "Stealth":      "Stealth Scan",
                          "Vuln":         "Vulnerability Scan",
                          "Full":         "Full Scan",
                          "HEADER_AUDIT": "Header Audit",
                          "SSL_SCAN":     "SSL/TLS Scan",
                          "CMS_SCAN":     "CMS Detection",
                        };
                        // If it's a raw key (e.g. "Quick"), convert; otherwise keep as-is (e.g. "Quick Scan")
                        const fullName = rawToFull[rawLabel] ?? rawLabel;
                        // Uppercase for display
                        const typeLabel = fullName.toUpperCase();

                        const scanTypeBadgeMap: Record<string, string> = {
                          "QUICK SCAN":         "bg-pink-900/40 text-pink-400 border-pink-500/50",
                          "STEALTH SCAN":       "bg-stone-900/60 text-stone-400 border-stone-500/60",
                          "VULNERABILITY SCAN": "bg-orange-900/40 text-orange-400 border-orange-500/50",
                          "FULL SCAN":          "bg-red-900/40 text-red-400 border-red-500/50",
                          "HEADER AUDIT":       "bg-amber-900/40 text-amber-400 border-amber-500/50",
                          "SSL/TLS SCAN":       "bg-cyan-900/40 text-cyan-400 border-cyan-500/50",
                          "CMS DETECTION":      "bg-purple-900/40 text-purple-400 border-purple-500/50",
                        };
                        const typeBadge = scanTypeBadgeMap[typeLabel] ?? "bg-secondary/50 text-foreground border-border";

                        return (
                          <tr
                            key={scan.id}
                            className="transition-all duration-200 hover:bg-white/[0.04] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] cursor-default"
                          >
                            <td className="px-6 py-4 font-medium text-foreground">{scan.vulnerabilities?.target || "N/A"}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-3 py-1 rounded-md text-[11px] font-bold tracking-wider whitespace-nowrap border ${typeBadge}`}>
                                {typeLabel}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-3 py-1 rounded-md text-[11px] font-bold tracking-wider whitespace-nowrap border ${
                                scan.status === "COMPLETED" ? "bg-emerald-900/40 text-emerald-400 border-emerald-500/50" :
                                scan.status === "CANCELLED" ? "bg-red-950 text-red-400 border-red-700" :
                                                              "bg-yellow-900/40 text-yellow-400 border-yellow-500/50"
                              }`}>
                                {scan.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-muted-foreground tabular-nums">
                              {new Date(scan.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {scan.status === "COMPLETED" ? (
                                <button
                                  onClick={() => downloadAuditReport(scan.id)}
                                  className="px-3 py-1.5 bg-secondary text-foreground hover:bg-primary/20 hover:text-primary rounded transition-colors inline-flex items-center gap-2 text-xs"
                                  title="Download Audit Report"
                                >
                                  <Download className="w-3 h-3" />
                                  Download Audit Report
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground/50 italic select-none">
                                  No Report Available
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default WebSecurity;
