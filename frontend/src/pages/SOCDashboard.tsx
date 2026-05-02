import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { socket, connectSocket, disconnectSocket } from "@/lib/socket";
import { AppSidebar } from "@/components/AppSidebar";
import UserProfileCard from "@/components/UserProfileCard";
import { UBAWidget } from "@/components/UBAWidget";
import { SessionManagement } from "@/components/SessionManagement";
import {
  Activity, AlertTriangle, FileText, ShieldAlert,
  Users, RefreshCw, TrendingUp, Clock, CheckCircle2,
} from "lucide-react";
import { socApi } from "@/lib/api";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface Alert {
  id: string;
  riskScore: number;
  status: string;
  action: string;
  department: string | null;
  createdAt: string;
  User?: { email: string; department: string };
}

interface DashboardStats {
  totalUsers: number;
  totalFiles: number;
  totalRequests: number;
  totalAlerts: number;
}

const PIE_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4",
];

const RISK_BAND_COLORS: Record<string, string> = {
  "0-20":   "#22c55e",
  "21-40":  "#86efac",
  "41-60":  "#facc15",
  "61-80":  "#f97316",
  "81-100": "#ef4444",
};

/* Custom label rendered OUTSIDE the arc */
const renderOutsideLabel = ({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
  if (percent < 0.04) return null;
  const RADIAN  = Math.PI / 180;
  const r       = outerRadius + 28;
  const x       = cx + r * Math.cos(-midAngle * RADIAN);
  const y       = cy + r * Math.sin(-midAngle * RADIAN);
  const anchor  = x > cx ? "start" : "end";
  return (
    <text x={x} y={y} fill="#94a3b8" textAnchor={anchor} dominantBaseline="central" fontSize={10} fontWeight={600}>
      {`${name}: ${(percent * 100).toFixed(0)}%`}
    </text>
  );
};


const SOCDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats,  setStats]  = useState<DashboardStats>({
    totalUsers: 0, totalFiles: 0, totalRequests: 0, totalAlerts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Current session JTI for SessionManagement "YOU" badge
  const currentJti = (() => {
    try {
      const token = localStorage.getItem("ztg_token") || "";
      return JSON.parse(atob(token.split(".")[1])).jti as string;
    } catch { return undefined; }
  })();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsRes, statsRes] = await Promise.allSettled([
        socApi.getAlerts({}),
        socApi.getDashboardStats({}),
      ]);
      if (alertsRes.status === "fulfilled")
        setAlerts(alertsRes.value.data.alerts || alertsRes.value.data || []);
      if (statsRes.status === "fulfilled")
        setStats(statsRes.value.data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("SOC Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Real-time via Socket.IO (replaces 20s setInterval) ────────────────────
  useEffect(() => {
    connectSocket();
    const refresh = () => fetchData();
    socket.on("new_activity",   refresh);
    socket.on("update_activity", refresh);
    socket.on("new_alert",      refresh);
    socket.on("update_alert",   refresh);
    return () => {
      socket.off("new_activity",   refresh);
      socket.off("update_activity", refresh);
      socket.off("new_alert",      refresh);
      socket.off("update_alert",   refresh);
      disconnectSocket();
    };
  }, [fetchData]);

  // SSE live alerts — fixed key: ztg_token
  useEffect(() => {
    const token = localStorage.getItem("ztg_token") || "";
    const base  = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
    const es    = new EventSource(`${base}/api/soc/stream?token=${token}`);
    es.addEventListener("new-alert", (e) => {
      try {
        const alert = JSON.parse(e.data);
        setAlerts(prev => [alert, ...prev]);
        toast({
          title: `🚨 New Alert — Risk ${alert.riskScore}/100`,
          description: alert.reason || alert.action,
          variant: alert.riskScore >= 65 ? "destructive" : "default",
          duration: 8000,
        });
      } catch { /* ignore malformed */ }
    });
    es.onerror = () => {};
    return () => es.close();
  }, []);

  // ── Chart data ────────────────────────────────────────────────────────────
  const statusCounts: Record<string, number> = {};
  alerts.forEach(a => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const riskBuckets = [
    { range: "0–20",   count: 0, fill: RISK_BAND_COLORS["0-20"]   },
    { range: "21–40",  count: 0, fill: RISK_BAND_COLORS["21-40"]  },
    { range: "41–60",  count: 0, fill: RISK_BAND_COLORS["41-60"]  },
    { range: "61–80",  count: 0, fill: RISK_BAND_COLORS["61-80"]  },
    { range: "81–100", count: 0, fill: RISK_BAND_COLORS["81-100"] },
  ];
  alerts.forEach(a => {
    if (typeof a.riskScore === "number") {
      const idx = Math.min(Math.floor(a.riskScore / 20), 4);
      if (riskBuckets[idx]) riskBuckets[idx].count++;
    }
  });

  const openAlerts     = alerts.filter(a => !["RESOLVED", "REJECTED"].includes(a.status)).length;
  const resolvedAlerts = alerts.filter(a => a.status === "RESOLVED").length;
  const criticalAlerts = alerts.filter(a => (a.riskScore ?? 0) >= 80).length;

  // ── Stat cards ────────────────────────────────────────────────────────────
  const statCards = [
    {
      label: "Total Users",
      value: stats.totalUsers,
      icon: Users,
      gradient: "from-blue-600/20 to-blue-800/10",
      border: "border-blue-500/20",
      text: "text-blue-400",
      path: "/soc/users",
    },
    {
      label: "Open Alerts",
      value: openAlerts,
      icon: AlertTriangle,
      gradient: "from-red-600/20 to-red-800/10",
      border: "border-red-500/20",
      text: "text-red-400",
      path: "/activity-logs?tab=alerts&alertStatus=unresolved",
    },
    {
      label: "Resolved",
      value: resolvedAlerts,
      icon: CheckCircle2,
      gradient: "from-green-600/20 to-green-800/10",
      border: "border-green-500/20",
      text: "text-green-400",
      path: "/activity-logs?tab=alerts&alertStatus=RESOLVED",
    },
    {
      label: "Critical (≥80)",
      value: criticalAlerts,
      icon: ShieldAlert,
      gradient: "from-orange-600/20 to-orange-800/10",
      border: "border-orange-500/20",
      text: "text-orange-400",
      path: "/activity-logs?tab=logs&riskRange=81-100",
    },
    {
      label: "Total Files",
      value: stats.totalFiles,
      icon: FileText,
      gradient: "from-purple-600/20 to-purple-800/10",
      border: "border-purple-500/20",
      text: "text-purple-400",
      path: "/file-management",
    },
    {
      label: "Access Requests",
      value: stats.totalRequests,
      icon: Activity,
      gradient: "from-cyan-600/20 to-cyan-800/10",
      border: "border-cyan-500/20",
      text: "text-cyan-400",
      path: "/approvals?tab=history",
    },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <main className="flex-1 overflow-y-auto">
        {/* ── Top bar ───────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              Security Operations Center
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Last refresh: {lastRefresh.toLocaleTimeString()} · auto-refresh 20s
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-sm text-foreground transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <UserProfileCard />
          </div>
        </div>

        <div className="p-8 space-y-8">

          {/* ── Stat cards ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {statCards.map(card => (
              <button
                key={card.label}
                onClick={() => navigate(card.path)}
                className={`relative overflow-hidden rounded-xl border ${card.border} bg-gradient-to-br ${card.gradient} p-5 backdrop-blur-sm text-left w-full group hover:scale-[1.03] hover:shadow-lg transition-all duration-200 cursor-pointer`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider leading-none mb-2">
                      {card.label}
                    </p>
                    <p className={`text-3xl font-black font-mono ${card.text} leading-none`}>
                      {loading ? "—" : card.value}
                    </p>
                  </div>
                  <card.icon className={`w-5 h-5 ${card.text} opacity-60 shrink-0 mt-0.5 group-hover:opacity-100 transition-opacity`} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity">Click to view →</p>
              </button>
            ))}
          </div>

          {/* ── Charts row ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Alert Status Donut — 2 cols */}
            <div className="lg:col-span-2 glass-card rounded-xl border border-border p-6">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Alert Status</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Click a slice → filter alerts</p>
                </div>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>

              {pieData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  No alerts yet
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                      <Pie
                        data={pieData}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={72}
                        paddingAngle={3} dataKey="value"
                        stroke="none"
                        isAnimationActive={false}
                        label={renderOutsideLabel}
                        labelLine={{ stroke: "#475569", strokeWidth: 1 }}
                        onClick={(entry: any) => {
                          if (entry?.name)
                            navigate(`/activity-logs?tab=alerts&alertStatus=${encodeURIComponent(entry.name)}`);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#f8fafc", fontSize: "12px" }}
                        itemStyle={{ color: "#f8fafc" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                    {pieData.map((d, i) => (
                      <button
                        key={d.name}
                        onClick={() => navigate(`/activity-logs?tab=alerts&alertStatus=${encodeURIComponent(d.name)}`)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {d.name} ({d.value})
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Risk Score Distribution — 3 cols */}
            <div className="lg:col-span-3 glass-card rounded-xl border border-border p-6">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Risk Score Distribution</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Click a bar → filter logs by risk band</p>
                </div>
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={riskBuckets}
                  style={{ cursor: "pointer" }}
                  onClick={(data: any) => {
                    const range = data?.activePayload?.[0]?.payload?.range;
                    if (range) {
                      // Convert display range (61–80) back to URL format (61-80)
                      const urlRange = range.replace("–", "-");
                      navigate(`/activity-logs?tab=logs&riskRange=${encodeURIComponent(urlRange)}`);
                    }
                  }}
                  margin={{ top: 10, right: 8, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" vertical={false} />
                  <XAxis dataKey="range" tick={{ fill: "hsl(215,20%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(215,20%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#f8fafc", fontSize: "12px" }}
                    itemStyle={{ color: "#f8fafc" }}
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {riskBuckets.map((b, i) => (
                      <Cell key={i} fill={b.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── System Overview BarChart ─────────────────────────────────── */}
          <div className="glass-card rounded-xl border border-border p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm text-foreground">System Overview</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Click a bar to drill-down</p>
              </div>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={[
                  { name: "Users",    count: stats.totalUsers,    fill: "#3b82f6", path: "/soc/users" },
                  { name: "Files",    count: stats.totalFiles,    fill: "#8b5cf6", path: "/file-management" },
                  { name: "Requests", count: stats.totalRequests, fill: "#06b6d4", path: "/approvals" },
                  { name: "Alerts",   count: stats.totalAlerts,   fill: "#ef4444", path: "/activity-logs?tab=alerts" },
                ]}
                style={{ cursor: "pointer" }}
                onClick={(data: any) => {
                  const path = data?.activePayload?.[0]?.payload?.path;
                  if (path) navigate(path);
                }}
                margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "hsl(215,20%,55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(215,20%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#f8fafc", fontSize: "12px" }}
                  itemStyle={{ color: "#f8fafc" }}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {[
                    { fill: "#3b82f6" }, { fill: "#8b5cf6" }, { fill: "#06b6d4" }, { fill: "#ef4444" },
                  ].map((b, i) => <Cell key={i} fill={b.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Analytics Row: UBA + Sessions ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UBAWidget />
            <SessionManagement currentJti={currentJti} />
          </div>

          {/* ── Quick-links to Activity Logs ────────────────────────────── */}
          <div className="glass-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-sm text-foreground mb-4">Quick Filters → Activity Logs</h3>
            <div className="flex flex-wrap gap-3">
              {[
                { label: "🔴 All Alerts",        path: "/activity-logs?tab=alerts" },
                { label: "⛔ Critical Logs",     path: "/activity-logs?tab=logs&riskRange=81-100" },
                { label: "🚫 Blocked Actions",   path: "/activity-logs?tab=logs&decision=BLOCK" },
                { label: "🔐 MFA Challenges",    path: "/activity-logs?tab=logs&decision=MFA_REQUIRED" },
                { label: "🔎 Needs Review",      path: "/activity-logs?tab=logs&decision=REVIEW" },
                { label: "🟡 High Risk (61-80)", path: "/activity-logs?tab=logs&riskRange=61-80" },
                { label: "📁 All Files",         path: "/activity-logs?tab=files" },
              ].map(q => (
                <button
                  key={q.label}
                  onClick={() => navigate(q.path)}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/60 border border-border text-foreground hover:text-primary hover:border-primary/40 transition-all"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default SOCDashboard;