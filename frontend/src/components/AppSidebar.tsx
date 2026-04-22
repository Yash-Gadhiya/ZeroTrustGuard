import { useNavigate, useLocation } from "react-router-dom";
import {
  Shield,
  LayoutDashboard,
  Activity,
  AlertTriangle,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Upload,
  UserPlus,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { useState, useEffect } from "react";
import api from "../api/axios";

export function AppSidebar() {

  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const storedRole = localStorage.getItem("ztg_role");
    setRole(storedRole);
  }, []);

  // Fetch pending approval count for admin roles
  useEffect(() => {
    if (role !== "admin" && role !== "super_admin") return;

    const fetchPending = async () => {
      try {
        const [accessRes, mfaRes] = await Promise.allSettled([
          api.get("/api/access-requests/pending"),
          api.get("/api/mfa/requests")
        ]);
        const accessCount = accessRes.status === "fulfilled"
          ? (accessRes.value.data.requests || []).length : 0;
        const mfaCount = mfaRes.status === "fulfilled"
          ? (mfaRes.value.data || []).length : 0;
        setPendingCount(accessCount + mfaCount);
      } catch (_) {}
    };

    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [role]);

  const handleLogout = async () => {
    try {
      // Tell the backend to destroy the ActiveSession row & blacklist the JWT
      await api.post("/api/auth/logout");
    } catch (_) {
      // Even if the API call fails, clear local state so the user is logged out
    } finally {
      localStorage.removeItem("ztg_token");
      localStorage.removeItem("ztg_role");
      localStorage.removeItem("ztg_temp_token"); // clear MFA enrollment temp token
      navigate("/login");
    }
  };

  const navItems =
    role === "admin" || role === "super_admin"
      ? [
          { title: "SOC Dashboard",   path: "/soc",            icon: AlertTriangle },
          { title: "Web Security",     path: "/web-security",   icon: ShieldCheck },
          { title: "Activity Logs",    path: "/activity-logs",  icon: Activity },
          { title: "User Management", path: "/soc/users", icon: Users },

          // NEW OPTION
          { title: "Add User", path: "/add-user", icon: UserPlus },
          { title: "File Management", path: "/files", icon: Upload },
          { title: "Approvals", path: "/approvals", icon: ShieldCheck, badge: pendingCount },
          { title: "MFA Setup", path: "/mfa-setup", icon: Shield },
        ]
      : [
          { title: "Employee Dashboard", path: "/dashboard",  icon: LayoutDashboard },
          { title: "Upload File",        path: "/employee-upload", icon: Upload },
          { title: "My Activity",        path: "/my-activity",    icon: Activity },
          { title: "My Requests",        path: "/approvals",      icon: FileText },
          { title: "MFA Setup",          path: "/mfa-setup",      icon: Shield },
        ];

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-64"
      } min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300`}
    >

      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>

        {!collapsed && (
          <div>
            <h1 className="text-sm font-bold">ZeroTrustGuard</h1>
            <p className="text-[10px] text-muted-foreground">
              Threat Protection
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {

          const isActive = location.pathname === item.path;
          const badge = (item as any).badge;

          return (
            <button
              key={item.title}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-sidebar-accent"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1 text-left">{item.title}</span>
              )}
              {!collapsed && badge > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold leading-none">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );

        })}
      </nav>

      {/* Footer — always pinned at bottom */}
      <div className="p-3 border-t border-sidebar-border mt-auto shrink-0">


        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-destructive/10 text-destructive"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Logout</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex justify-center py-2"
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>

      </div>

    </aside>
  );
}