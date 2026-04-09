import axios from "axios";

const API_BASE = "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE,
});

// ✅ Attach token automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("ztg_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Handle responses properly (NO overriding messages)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 🔒 Handle unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem("ztg_token");
      localStorage.removeItem("ztg_role");
      window.location.href = "/login";
    }

    // ⚠️ Handle forbidden (DO NOT override backend message)
    if (error.response?.status === 403) {
      const backendMessage = error.response?.data?.message;

      // Keep original message
      error.message = backendMessage || "Access denied";

      console.warn("403 Error:", backendMessage);
    }

    return Promise.reject(error);
  }
);

export default api;