import { useEffect, useState } from "react";
import api from "../api/axios";
import { AppSidebar } from "@/components/AppSidebar";
import { PinModal } from "@/components/PinModal";
import { Trash2 } from "lucide-react";

interface User {
  id: number;
  email: string;
  role: string;
  department: string | null;
  is_blocked: boolean;
  block_reason: string | null;
}

interface MfaRequest {
  id: number;
  reason: string;
  createdAt: string;
  User: {
    id: number;
    email: string;
    name: string;
    department: string | null;
  };
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedDept, setSelectedDept] = useState("all");

  const token = localStorage.getItem("ztg_token");

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'delete' | 'toggle', id: number } | null>(null);
  const [adminPinError, setAdminPinError] = useState("");

  const fetchUsers = async () => {
    try {
      const res = await api.get("/api/soc/users");
      const filtered = res.data.filter(
        (u: User) => u.role !== "admin" && u.role !== "super_admin"
      );
      setUsers(filtered);
    } catch (err) {
      console.error("Failed to fetch users");
    }
  };

  const [mfaRequests, setMfaRequests] = useState<MfaRequest[]>([]);

  const fetchMfaRequests = async () => {
    try {
      const res = await api.get("/api/mfa/requests");
      setMfaRequests(res.data);
    } catch (err) {
      console.error("Failed to fetch MFA requests");
    }
  };

  const handleMfaResponse = async (id: number, action: 'approve' | 'reject') => {
    let reason = "";
    if (action === "reject") {
      const input = window.prompt("Please provide a reason for rejecting this MFA reset request:");
      if (input === null || !input.trim()) return; // User cancelled or empty
      reason = input.trim();
    } else {
      if (!window.confirm("Are you sure you want to approve this MFA reset request?")) return;
    }

    try {
      await api.post(`/api/mfa/${action}/${id}`, { reason });
      fetchMfaRequests();
    } catch (err: any) {
      alert(err.response?.data?.message || `Failed to ${action} request`);
    }
  };

  const confirmToggleBlock = (id: number) => {
    setPendingAction({ type: 'toggle', id });
    setAdminPinError("");
    setPinModalOpen(true);
  };

  const confirmDeleteUser = (id: number) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    setPendingAction({ type: 'delete', id });
    setAdminPinError("");
    setPinModalOpen(true);
  };

  const processAdminAction = async (pin: string) => {
    if (!pendingAction) return;
    try {
      const headers = { "x-mfa-pin": pin };
      
      if (pendingAction.type === 'delete') {
        await api.delete(`/api/users/${pendingAction.id}`, { headers });
      } else if (pendingAction.type === 'toggle') {
        await api.put(`/api/soc/users/${pendingAction.id}/toggle-block`, {}, { headers });
      }
      
      setPinModalOpen(false);
      setPendingAction(null);
      fetchUsers();
    } catch (err: any) {
      if (err.response?.data?.mfaRequired) {
        setAdminPinError(err.response?.data?.message || "Invalid PIN");
      } else {
        setPinModalOpen(false);
        setPendingAction(null);
        alert(err.response?.data?.message || "Failed to perform admin action.");
      }
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchMfaRequests();
  }, []);

  const filteredUsers =
    selectedDept === "all"
      ? users
      : users.filter((u) => u.department === selectedDept);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <PinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSubmit={processAdminAction}
        error={adminPinError}
        title="Admin Action Required"
        description="Enter your 6-digit authenticator code to proceed."
      />

      <main className="flex-1 p-8 overflow-auto">
        <h1 className="text-2xl font-bold text-foreground mb-4">
          User Management
        </h1>

        {/* Department Filter */}
        <div className="mb-4">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 rounded-md bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="all">All Departments</option>
            <option value="HR">HR</option>
            <option value="IT">IT</option>
            <option value="ACCOUNTS">ACCOUNTS</option>
          </select>
        </div>

        {/* MFA Reset Requests Table */}
        {mfaRequests.length > 0 && (
          <div className="glass-card mb-8">
            <div className="p-4 border-b border-border bg-primary/5 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-primary">
                Pending MFA Reset Requests
              </h3>
              <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
                {mfaRequests.length} Pending
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Department</th>
                    <th>Reason</th>
                    <th>Date</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mfaRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <div>
                          <p className="font-medium text-foreground">{req.User.name}</p>
                          <p className="text-xs text-muted-foreground">{req.User.email}</p>
                        </div>
                      </td>
                      <td>{req.User.department || "—"}</td>
                      <td className="max-w-xs truncate" title={req.reason || "No reason provided"}>
                        {req.reason || <span className="text-muted-foreground italic">No reason provided</span>}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {new Date(req.createdAt).toLocaleString()}
                      </td>
                      <td className="text-right space-x-2">
                        <button
                          onClick={() => handleMfaResponse(req.id, "reject")}
                          className="px-3 py-1 bg-secondary text-foreground text-xs rounded hover:bg-destructive/10 hover:text-destructive transition-colors border border-border"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleMfaResponse(req.id, "approve")}
                          className="px-3 py-1 bg-primary text-primary-foreground text-xs rounded shadow-md hover:bg-primary/90 transition-colors"
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Existing User Table */}
        <div className="glass-card">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h3 className="text-sm font-medium text-foreground">
              Directory Users
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Toggle Block</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.department || "—"}</td>
                    <td>
                      {user.is_blocked ? (
                        <span className="text-destructive font-semibold text-xs">
                          BLOCKED
                        </span>
                      ) : (
                        <span className="text-success font-semibold text-xs">
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td>
                      {/* Toggle Switch */}
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!user.is_blocked}
                          onChange={() => confirmToggleBlock(user.id)}
                          className="sr-only peer"
                        />
                        <div className="relative w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:bg-success after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => confirmDeleteUser(user.id)}
                        className="p-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded transition-colors inline-block"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center text-muted-foreground py-6"
                    >
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}