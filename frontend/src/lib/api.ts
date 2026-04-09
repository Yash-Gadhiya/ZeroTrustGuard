import api from "../api/axios";

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/api/auth/login", { email, password }),
};

export const accessApi = {
  accessSensitive: () => api.get("/api/access-sensitive"),
};

export const socApi = {
  getAlerts: (params?: any) => api.get("/api/security/alerts", { params }), // Updated from /api/soc/alerts
  updateAlert: (id: string) => api.patch(`/api/security/alerts/${id}/resolve`),
  rejectAlert: (id: string, comment: string) => api.patch(`/api/security/alerts/${id}/reject`, { admin_comment: comment }),
  getLogs: (params?: any) => api.get("/api/activity-logs", { params }), // Updated from /api/soc/logs
  getSocFiles: (params?: any) => api.get("/api/files/all", { params }),
  getDashboardStats: (params?: any) => api.get("/api/dashboard/stats", { params }),
};

export default api;
