import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard"; // Added Import
import { PinModal } from "@/components/PinModal";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
  FileText,
  Trash2,
  Download,
  Search,
  Filter,
  Calendar,
  X,
  Pencil
} from "lucide-react";

import api from "../api/axios";
import { socApi } from "@/lib/api";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ... Alert and Log interfaces ...
interface Alert {
  id: string;
  riskScore: number;
  status: string;
  action: string;
  department: string | null;
  createdAt: string;
  admin_comment?: string;
  User?: {
    email: string;
    department: string;
  };
}

interface Log {
  id: string;
  userId: string;
  action: string;
  resource: string;
  department: string | null;
  grantedBy: string | null;
  createdAt: string;
  User?: {
    email: string;
    name: string;
  };
}

interface SocFile {
  id: number;
  filename: string;
  originalName?: string;
  department: string;
  target_department?: string | string[];
  allowedRoles?: string[];
  createdAt: string;
  User: {
    name: string;
    email: string;
    role: string;
  };
}

interface DashboardStats {
  totalUsers: number;
  totalFiles: number;
  totalRequests: number;
  totalAlerts: number;
}

const SOCDashboard = () => {
  // ... existing state and fetchData logic ...
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [files, setFiles] = useState<SocFile[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalFiles: 0,
    totalRequests: 0,
    totalAlerts: 0
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"alerts" | "logs" | "files">("alerts");
  const navigate = useNavigate();

  // Filters
  const [searchEmail, setSearchEmail] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [timeRange, setTimeRange] = useState("all");
  const [customRangeModalOpen, setCustomRangeModalOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState("");
  const [tempEndDate, setTempEndDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // PIN Modal State
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [fileToDownload, setFileToDownload] = useState<{id: number, filename: string} | null>(null);
  const [downloadPinError, setDownloadPinError] = useState("");

  // Delete/Edit Modals
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SocFile | null>(null);
  const [editTargetDepts, setEditTargetDepts] = useState<string[]>([]);
  const [editAllowedRoles, setEditAllowedRoles] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (timeRange !== "all") {
        if (timeRange === "custom" && (!startDate || !endDate)) {
          // Skip
        } else {
          params.timeRange = timeRange;
          if (timeRange === "custom") {
            params.startDate = startDate;
            params.endDate = endDate;
          }
        }
      }
      if (searchEmail) params.searchEmail = searchEmail;
      if (filterDepartment) params.department = filterDepartment;

      const [alertsResult, logsResult, filesResult, statsResult] = await Promise.allSettled([
        socApi.getAlerts(params),
        socApi.getLogs(params),
        socApi.getSocFiles(params),
        socApi.getDashboardStats(params)
      ]);

      if (alertsResult.status === 'fulfilled') {
        setAlerts(alertsResult.value.data.alerts || alertsResult.value.data || []);
      }
      if (logsResult.status === 'fulfilled') {
        setLogs(logsResult.value.data.logs || logsResult.value.data || []);
      }
      if (filesResult.status === 'fulfilled') {
        setFiles(filesResult.value.data.files || []);
      }
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value.data);
      }
    } catch (error) {
      console.error("Failed to fetch SOC Dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [timeRange, startDate, endDate, searchEmail, filterDepartment]);

  useEffect(() => {
    // Add debouncing specifically if they are typing email live to avoid spamming the backend
    const timeout = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timeout);
  }, [fetchData]);

  const confirmDeleteFile = async () => {
    if (!selectedFile) return;
    const fileId = selectedFile.id;
    setActionLoading(true);
    try {
      await api.delete(`/api/files/${fileId}`);
      setDeleteModalOpen(false);
      setSelectedFile(null);
      // SURGICAL REFRESH: Remove from state immediately
      setFiles(prev => prev.filter(f => f.id !== fileId));
      fetchData(); // Still refresh to update counters (Total Files)
    } catch (error) {
      alert("Failed to delete file");
    } finally {
      setActionLoading(false);
    }
  };

  const confirmUpdatePermissions = async () => {
    if (!selectedFile) return;
    setActionLoading(true);
    try {
      await api.patch(`/api/files/${selectedFile.id}/permissions`, {
        targetDepartments: editTargetDepts,
        allowedRoles: editAllowedRoles
      });
      setEditModalOpen(false);
      setSelectedFile(null);
      fetchData();
    } catch (error) {
      alert("Failed to update permissions");
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (file: SocFile) => {
    let targets: string[] = [];
    if (typeof file.target_department === "string") {
      try {
        targets = JSON.parse(file.target_department);
      } catch {
        targets = [file.target_department];
      }
    } else if (Array.isArray(file.target_department)) {
      targets = file.target_department;
    } else {
      targets = ["All Departments"];
    }

    setSelectedFile(file);
    setEditTargetDepts(targets);
    setEditAllowedRoles(file.allowedRoles || ["admin", "senior", "staff", "intern"]);
    setEditModalOpen(true);
  };

  // The `.filter` blocks below are left intact but are technically redundant now 
  // since the backend applies the isolation exactly as requested! This ensures strict UX bounds.
  const filteredAlerts = alerts.filter(a => {
    const matchEmail = !searchEmail || (a.User?.email || "").toLowerCase().includes(searchEmail.toLowerCase());
    const matchDept = !filterDepartment || (a.department || a.User?.department) === filterDepartment;
    return matchEmail && matchDept;
  });

  const filteredLogs = logs.filter(l => {
    const matchEmail = !searchEmail || (l.User?.email || "").toLowerCase().includes(searchEmail.toLowerCase());
    const matchDept = !filterDepartment || l.department === filterDepartment;
    return matchEmail && matchDept;
  });

  const filteredFiles = files.filter(f => {
    const matchEmail = !searchEmail || (f.User?.email || "").toLowerCase().includes(searchEmail.toLowerCase());
    const matchDept = !filterDepartment || f.department === filterDepartment;
    return matchEmail && matchDept;
  });

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
        headers: { "x-mfa-pin": pin }
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileToDownload.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      
      setPinModalOpen(false);
      setFileToDownload(null);
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
  };

  // Stats and Data processing logic stays exactly as you provided
  const totalAlerts = alerts.length;
  const openAlerts = alerts.filter((a) => a.status !== "RESOLVED").length;
  const resolvedAlerts = alerts.filter((a) => a.status === "RESOLVED").length;

  const statusCounts: Record<string, number> = {};
  alerts.forEach((a) => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const riskBuckets = [
    { range: "0-20", count: 0 }, { range: "21-40", count: 0 },
    { range: "41-60", count: 0 }, { range: "61-80", count: 0 },
    { range: "81-100", count: 0 },
  ];
  alerts.forEach((a) => {
    if (typeof a.riskScore === "number") {
      const idx = Math.min(Math.floor(a.riskScore / 20), 4);
      if (riskBuckets[idx]) riskBuckets[idx].count++;
    }
  });

  const PIE_COLORS = ["hsl(210, 100%, 56%)", "hsl(142, 71%, 45%)", "hsl(45, 93%, 47%)", "hsl(0, 72%, 51%)", "hsl(190, 95%, 50%)"];

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      {/* Added 'relative' to main to anchor the UserProfileCard */}
      <main className="flex-1 p-8 relative overflow-y-auto">
        <PinModal
          isOpen={pinModalOpen}
          onClose={() => setPinModalOpen(false)}
          onSubmit={processDownload}
          error={downloadPinError}
          title="Download Secured File"
          description={`Enter PIN to download ${fileToDownload?.filename}`}
        />

        {customRangeModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-card w-full max-w-md rounded-lg shadow-lg border border-border flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" /> Custom Time Range
                </h3>
                <button 
                  onClick={() => { setCustomRangeModalOpen(false); setTimeRange("all"); }} 
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Start Date</label>
                    <input 
                      type="date" 
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">End Date</label>
                    <input 
                      type="date" 
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
                      value={tempEndDate}
                      onChange={(e) => setTempEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button 
                    onClick={() => { setCustomRangeModalOpen(false); setTimeRange("all"); }} 
                    className="px-4 py-2 text-sm font-medium bg-secondary text-foreground rounded-md hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if(tempStartDate && tempEndDate) {
                        setStartDate(tempStartDate);
                        setEndDate(tempEndDate);
                        setCustomRangeModalOpen(false);
                      } else {
                        alert("Please select both start and end dates.");
                      }
                    }} 
                    className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  >
                    Apply Range
                  </button>
                </div>
              </div>
            </div>
          </div>
         )}
        
        {/* User Profile Card Pinned to Top Right */}
        <div className="absolute top-6 right-8 z-50">
          <UserProfileCard />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">SOC Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Security Operations Center — Real-time threat monitoring
            </p>
          </div>
          {/* Refresh button pushed slightly left of the Profile Card */}
          <button
            onClick={fetchData}
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
            {/* Stat Cards, Charts, and Tables remain exactly as your original code */}
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
               <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Users</p>
                    <p className="text-3xl font-bold font-mono text-foreground mt-1">{stats.totalUsers}</p>
                  </div>
                  <Activity className="w-8 h-8 text-primary opacity-50" />
                </div>
              </div>
              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Files</p>
                    <p className="text-3xl font-bold font-mono text-success mt-1">{stats.totalFiles}</p>
                  </div>
                  <FileText className="w-8 h-8 text-success opacity-50" />
                </div>
              </div>
              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Access Requests</p>
                    <p className="text-3xl font-bold font-mono text-warning mt-1">{stats.totalRequests}</p>
                  </div>
                  <Clock className="w-8 h-8 text-warning opacity-50" />
                </div>
              </div>
              <div className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">High Risk Alerts</p>
                    <p className="text-3xl font-bold font-mono text-destructive mt-1">{stats.totalAlerts}</p>
                  </div>
                  <ShieldAlert className="w-8 h-8 text-destructive opacity-50" />
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
               {/* ... Pie and Bar Charts ... */}
               <div className="glass-card p-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Dashboard Overview</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={[
                    { name: 'Total Users', count: stats.totalUsers },
                    { name: 'Total Files', count: stats.totalFiles },
                    { name: 'Total Requests', count: stats.totalRequests },
                    { name: 'Total Alerts', count: stats.totalAlerts }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 16%)" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={{ stroke: "hsl(222, 30%, 16%)" }} />
                    <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={{ stroke: "hsl(222, 30%, 16%)" }} />
                    <Tooltip contentStyle={{ backgroundColor: "rgba(30, 41, 59, 0.9)", border: "1px solid hsl(222, 30%, 16%)", borderRadius: "6px", color: "#ffffff", fontSize: "12px" }} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#ffffff" }} />
                    <Bar dataKey="count" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="glass-card p-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Alert Status Distribution</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" stroke="none">
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "rgba(30, 41, 59, 0.9)", border: "1px solid hsl(222, 30%, 16%)", borderRadius: "6px", color: "#ffffff", fontSize: "12px" }} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#ffffff" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="glass-card p-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Risk Score Distribution</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={riskBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 16%)" />
                    <XAxis dataKey="range" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={{ stroke: "hsl(222, 30%, 16%)" }} />
                    <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={{ stroke: "hsl(222, 30%, 16%)" }} />
                    <Tooltip contentStyle={{ backgroundColor: "rgba(30, 41, 59, 0.9)", border: "1px solid hsl(222, 30%, 16%)", borderRadius: "6px", color: "#ffffff", fontSize: "12px" }} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#ffffff" }} />
                    <Bar dataKey="count" fill="hsl(210, 100%, 56%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border mb-6">
              <button
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === "alerts"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
                onClick={() => setActiveTab("alerts")}
              >
                Security Alerts
              </button>
              <button
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === "logs"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
                onClick={() => setActiveTab("logs")}
              >
                Activity Logs
              </button>
              <button
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === "files"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
                onClick={() => setActiveTab("files")}
              >
                Uploaded Files
              </button>
            </div>

            {/* Filter Bar */}
            <div className="glass-card p-4 rounded-lg border border-border mb-6 flex flex-col md:flex-row gap-4 items-center justify-between bg-secondary/20">
              <div className="flex gap-4 items-center w-full">
                 <div className="relative flex-1 max-w-sm">
                   <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                   <input
                     type="text"
                     placeholder="Filter by User Email..."
                     className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground"
                     value={searchEmail}
                     onChange={(e) => setSearchEmail(e.target.value)}
                   />
                 </div>
                 <div className="relative max-w-xs w-48">
                   <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                   <select
                     className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground appearance-none"
                     value={filterDepartment}
                     onChange={(e) => setFilterDepartment(e.target.value)}
                   >
                     <option value="">All Departments</option>
                     <option value="IT">IT</option>
                     <option value="HR">HR</option>
                     <option value="ACCOUNTS">ACCOUNTS</option>
                   </select>
                 </div>
                 <div className="relative max-w-xs w-48">
                   <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                   <select
                     className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-md focus:border-primary focus:outline-none text-foreground appearance-none"
                     value={timeRange}
                     onChange={(e) => {
                       const val = e.target.value;
                       setTimeRange(val);
                       if (val === "custom") {
                         setCustomRangeModalOpen(true);
                       }
                     }}
                   >
                     <option value="all">All Time</option>
                     <option value="24_hours">Last 24 Hours</option>
                     <option value="7_days">Last 7 Days</option>
                     <option value="3_months">Last 3 Months</option>
                     <option value="1_year">Last 1 Year</option>
                     <option value="custom">Custom Range</option>
                   </select>
                 </div>
              </div>
              {(searchEmail || filterDepartment || timeRange !== "all") && (
                <button
                  onClick={() => { setSearchEmail(""); setFilterDepartment(""); setTimeRange("all"); }}
                  className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/50 rounded-md whitespace-nowrap"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Tables Section */}
            <div className="glass-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                    {activeTab === "alerts" && (
                      <tr>
                        <th className="px-6 py-4 font-medium">Alert ID</th>
                        <th className="px-6 py-4 font-medium min-w-[200px] whitespace-nowrap">User Email</th>
                        <th className="px-6 py-4 font-medium">Department</th>
                        <th className="px-6 py-4 font-medium min-w-[180px] whitespace-nowrap">Action</th>
                        <th className="px-6 py-4 font-medium">Risk Score</th>
                        <th className="px-6 py-4 font-medium">Created</th>
                        <th className="px-6 py-4 font-medium text-right">Actions</th>
                      </tr>
                    )}
                    {activeTab === "logs" && (
                      <tr>
                        <th className="px-6 py-4 font-medium">Timestamp</th>
                        <th className="px-6 py-4 font-medium">User ID</th>
                        <th className="px-6 py-4 font-medium">User Email</th>
                        {/* <th className="px-6 py-4 font-medium">User Name</th> */}
                        <th className="px-6 py-4 font-medium">Department</th>
                        <th className="px-6 py-4 font-medium">Action</th>
                        <th className="px-6 py-4 font-medium">Resource</th>
                        {/* <th className="px-6 py-4 font-medium">Granted By</th> */}
                      </tr>
                    )}
                    {activeTab === "files" && (
                      <tr>
                        <th className="px-6 py-4 font-medium">File Name</th>
                        <th className="px-6 py-4 font-medium">Dept Origin</th>
                        <th className="px-6 py-4 font-medium">Target Dept</th>
                        <th className="px-6 py-4 font-medium">Uploaded By</th>
                        <th className="px-6 py-4 font-medium">Upload Date</th>
                        <th className="px-6 py-4 font-medium text-right">Actions</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeTab === "alerts" && filteredAlerts.length === 0 && (
                      <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No alerts found</td></tr>
                    )}
                    {activeTab === "logs" && filteredLogs.length === 0 && (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No activity logs found</td></tr>
                    )}
                    {activeTab === "files" && filteredFiles.length === 0 && (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No files uploaded yet</td></tr>
                    )}

                    {activeTab === "alerts" && filteredAlerts.map((alert) => (
                      <tr key={alert.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs">{alert.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{alert.User?.email || "N/A"}</td>
                        <td className="px-6 py-4">{alert.department || alert.User?.department || "N/A"}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            alert.action === 'ACCOUNT_UNBLOCK' ? 'text-primary bg-primary/10' :
                            alert.action === 'DELETE_USER' ? 'text-destructive bg-destructive/10' :
                            alert.action === 'ADMIN_BLOCK' || alert.action === 'ACCOUNT_LOCKOUT' ? 'text-warning bg-warning/10' :
                            'text-foreground'
                          }`}>
                            {alert.action || "N/A"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            (alert.riskScore || 0) >= 80 ? "bg-destructive/20 text-destructive" :
                            (alert.riskScore || 0) >= 50 ? "bg-warning/20 text-warning" :
                            "bg-success/20 text-success"
                          }`}>
                            {alert.riskScore}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {new Date(alert.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              if (alert.User?.email) {
                                navigate(`/soc/users?email=${encodeURIComponent(alert.User.email)}`);
                              }
                            }}
                            className="text-xs px-4 py-1.5 bg-primary/10 text-primary font-medium rounded hover:bg-primary/20 transition-colors"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}

                    {activeTab === "logs" && filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono">{log.userId}</td>
                        <td className="px-6 py-4">{log.User?.email || "N/A"}</td>
                        {/* <td className="px-6 py-4">{log.User?.name || "N/A"}</td> */}
                        <td className="px-6 py-4">{log.department || "N/A"}</td>
                        <td className="px-6 py-4 font-medium">{log.action}</td>
                        <td className="px-6 py-4 text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                          {log.resource || "N/A"}
                        </td>
                        {/* <td className="px-6 py-4">{log.grantedBy?.email || "N/A"}</td> */}
                      </tr>
                    ))}

                    {activeTab === "files" && filteredFiles.map((file) => (
                      <tr key={file.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-6 py-4 font-medium">{file.filename}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-secondary text-foreground">
                            {file.department || "N/A"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              let targets: string[] = [];
                              if (typeof file.target_department === "string") {
                                try { targets = JSON.parse(file.target_department); } catch { targets = [file.target_department]; }
                              } else if (Array.isArray(file.target_department)) {
                                targets = file.target_department;
                              } else {
                                targets = ["All Departments"];
                              }

                              const deptColors: Record<string, string> = {
                                "All Departments": "bg-blue-900/40 text-blue-400 border border-blue-500/50",
                                "IT":              "bg-cyan-900/40 text-cyan-400 border border-cyan-500/50",
                                "HR":              "bg-purple-900/40 text-purple-400 border border-purple-500/50",
                                "ACCOUNTS":        "bg-amber-900/40 text-amber-400 border border-amber-500/50",
                                "MARKETING":       "bg-pink-900/40 text-pink-400 border border-pink-500/50",
                              };

                              return targets.map(t => (
                                <span key={t} className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${deptColors[t] || "bg-secondary text-foreground"}` }>
                                  {t}
                                </span>
                              ));
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {file.User ? file.User.email : "Unknown"}
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {new Date(file.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                               onClick={() => handleDownload(file.id, file.originalName || file.filename)}
                               className="p-1.5 bg-secondary text-foreground hover:bg-primary/20 hover:text-primary rounded transition-colors"
                               title="Download File"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                               onClick={() => openEditModal(file)}
                               className="p-1.5 bg-secondary text-foreground hover:bg-primary/20 hover:text-primary rounded transition-colors"
                               title="Edit Permissions"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                               onClick={() => { setSelectedFile(file); setDeleteModalOpen(true); }}
                               className="p-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded transition-colors"
                               title="Delete File"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && selectedFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 border border-destructive/20 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-destructive">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-xl font-bold">Confirm Deletion</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to permanently delete <span className="font-semibold text-foreground">"{selectedFile.originalName || selectedFile.filename}"</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                disabled={actionLoading}
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-sm font-medium hover:bg-secondary rounded-md"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={confirmDeleteFile}
                className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 flex items-center gap-2"
              >
                {actionLoading && <Loader2 className="animate-spin w-4 h-4" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Permissions Modal */}
      {editModalOpen && selectedFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg p-6 border border-primary/20 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Edit File Permissions</h2>
              <button onClick={() => setEditModalOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-6">
              {/* Depts */}
              <div>
                <label className="text-sm font-medium mb-3 block">Target Departments</label>
                <div className="flex flex-wrap gap-2">
                  {["All Departments", "IT", "HR", "ACCOUNTS", "MARKETING"].map(dept => {
                    const isSelected = editTargetDepts.includes(dept);
                    return (
                      <button
                        key={dept}
                        onClick={() => {
                          if (dept === "All Departments") {
                            setEditTargetDepts(["All Departments"]);
                          } else {
                            let newD = editTargetDepts.filter(d => d !== "All Departments");
                            if (isSelected) {
                              newD = newD.filter(d => d !== dept);
                              if (newD.length === 0) newD = ["All Departments"];
                            } else { newD.push(dept); }
                            setEditTargetDepts(newD);
                          }
                        }}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-all ${isSelected ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary/50 border-border text-muted-foreground'}`}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Roles */}
              <div>
                <label className="text-sm font-medium mb-3 block">Access Permissions (Roles)</label>
                <div className="flex flex-wrap gap-2">
                  {["admin", "senior", "staff", "intern"].map(role => {
                    const isSelected = editAllowedRoles.includes(role);
                    const isMandatory = role === "admin";
                    return (
                      <button
                        key={role}
                        disabled={isMandatory}
                        onClick={() => {
                          if (isSelected) setEditAllowedRoles(editAllowedRoles.filter(r => r !== role));
                          else setEditAllowedRoles([...editAllowedRoles, role]);
                        }}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-all ${isSelected ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary/50 border-border text-muted-foreground'} ${isMandatory ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {role.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                disabled={actionLoading}
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 text-sm"
              >
                Discard
              </button>
              <button
                disabled={actionLoading}
                onClick={confirmUpdatePermissions}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2"
              >
                {actionLoading && <Loader2 className="animate-spin w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SOCDashboard;