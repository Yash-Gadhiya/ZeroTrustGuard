import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import SOCDashboard from "./pages/SOCDashboard";
import AdminUsers from "./pages/AdminUsers";
import FileManagement from "./pages/FileManagement";
import EmployeeUpload from "./pages/EmployeeUpload";
import AddUser from "./pages/AddUser";
import ApprovalsDashboard from "./pages/ApprovalsDashboard";
import MFASetup from "./pages/MFASetup";
import WebSecurity from "./pages/WebSecurity";

const queryClient = new QueryClient();

const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) => {
  const token = localStorage.getItem("ztg_token");
  const role = localStorage.getItem("ztg_role");

  if (!token) return <Navigate to="/login" replace />;

  if (!allowedRoles.includes(role || "")) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <BrowserRouter>
        <Routes>

          {/* Login */}
          <Route path="/login" element={<Login />} />

          {/* Employee Dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["intern", "staff", "senior"]}>
                <EmployeeDashboard />
              </ProtectedRoute>
            }
          />

          {/* SOC Dashboard */}
          <Route
            path="/soc"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <SOCDashboard />
              </ProtectedRoute>
            }
          />

          {/* Web Security */}
          <Route
            path="/web-security"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <WebSecurity />
              </ProtectedRoute>
            }
          />

          {/* Admin File Management */}
          <Route
            path="/files"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <FileManagement />
              </ProtectedRoute>
            }
          />

          {/* Employee Upload */}
          <Route
            path="/employee-upload"
            element={
              <ProtectedRoute allowedRoles={["intern", "staff", "senior"]}>
                <EmployeeUpload />
              </ProtectedRoute>
            }
          />

          {/* Admin User Management */}
          <Route
            path="/soc/users"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />

          {/* Add User Page */}
          <Route
            path="/add-user"
            element={
              <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
                <AddUser />
              </ProtectedRoute>
            }
          />

          {/* Approvals Dashboard */}
          <Route
            path="/approvals"
            element={
              <ProtectedRoute allowedRoles={["staff", "senior", "admin", "super_admin"]}>
                <ApprovalsDashboard />
              </ProtectedRoute>
            }
          />

          {/* Root Redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* MFA Setup Page */}
          <Route
            path="/mfa-setup"
            element={<MFASetup />}
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>

    </TooltipProvider>
  </QueryClientProvider>
);

export default App;