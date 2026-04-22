# 🛡️ ZeroTrustGuard 

ZeroTrustGuard is an advanced, full-stack Security Operations Center (SOC) platform designed for comprehensive Insider Threat Protection, Vulnerability Scanning, and Secure File Management. Built with a modern technology stack, it enforces strict Zero Trust principles across user authentication, access control, and network traffic.

## ✨ Key Features

* **Multi-Factor Authentication (MFA):** Enforces TOTP-based (Authenticator App) two-factor authentication for sensitive administrative actions, with self-service reset requests and admin approval workflows.
* **Granular Role-Based Access Control (RBAC):** Hierarchical permission system (Intern < Staff < Senior < Admin < Super Admin) protecting routes, file access, and approval chains.
* **Temporal File Access:** Users must request access to sensitive files. Approvals are strictly temporary, and cron jobs automatically revoke access when the granted duration expires.
* **Active Session Management:** Real-time visibility into all active JWT sessions across the organization. Administrators can instantly force-kick users, terminating their sessions dynamically.
* **Web Application Firewall (WAF):** Custom middleware intercepts incoming requests, blocking malicious traffic patterns, SQL injection attempts, and known bad actors.
* **Real-Time Web Security Scanner:** Integrated network and web vulnerability scanning (Quick, Stealth, CMS, Headers, SSL/TLS) streaming live terminal output to the dashboard.
* **Comprehensive Audit Logging:** Every action, access request, and security event is logged. Features high-performance CSV/PDF streaming exports and automated 12-month data retention purging.
* **Modern Premium UI:** A fully responsive, dark-mode-first aesthetic built with React, Tailwind CSS, Lucide Icons, and a unified toast notification system.

---

## 🛠️ Technology Stack

* **Frontend:** React (Vite), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons.
* **Backend:** Node.js, Express.js, Socket.IO (for real-time events).
* **Database:** PostgreSQL, Sequelize ORM.
* **Security:** JSON Web Tokens (JWT), Speakeasy (TOTP), bcrypt, Zod (Input Validation), Node-Cron.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **PostgreSQL** (v14 or higher)
- **Nmap** (must be added to System PATH for the Web Scanner)

### 2. Database Setup
1. Open pgAdmin 4 or `psql`.
2. Create a NEW database named `zerotrust`:
   ```sql
   CREATE DATABASE zerotrust;
   ```
3. The backend will automatically create all tables on its first run via Sequelize sync.

### 3. Backend Configuration
1. Navigate to the `/backend` folder.
2. Copy `.env.example` and rename it to `.env` (or create a new `.env` file).
3. Populate your configuration:
   ```env
   PORT=5000
   DB_NAME=zerotrust
   DB_USER=postgres
   DB_PASS=YOUR_POSTGRES_PASSWORD_HERE
   DB_HOST=localhost
   JWT_SECRET=your_super_secret_random_key_here
   ```
   *Note: Ensure `DB_PASS` matches your local Postgres password. To generate a strong JWT secret, run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.*

### 4. Running the Application

**Option A: Start both servers simultaneously (from the root folder)**
```bash
npm install
npm run dev
```

**Option B: Start separately**
1. **Backend:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```
2. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

## 🌐 Accessing the Platform

* **Frontend:** `http://localhost:8081`
* **Backend API:** `http://localhost:5000`

### Default Admin Login
* **Email:** `admin@ztg.com`
* **Password:** `admin123`

---

## 👥 Demo User Accounts

The platform comes pre-configured with several user accounts across different departments to demonstrate the RBAC and approval hierarchies. 

*All demo accounts use the password: `intern123`, `staff123`, or `senior123` depending on their role.*

### IT Department
* `it.intern1@ztg.com` (Intern - Level 1)
* `it.staff1@ztg.com` (Staff - Level 2)
* `it.senior1@ztg.com` (Senior - Level 3)

### Accounts Department
* `acc.intern1@ztg.com` (Intern - Level 1)
* `acc.staff1@ztg.com` (Staff - Level 2)
* `acc.senior1@ztg.com` (Senior - Level 3)

### HR Department
* `hr.intern1@ztg.com` (Intern - Level 1)
* `hr.staff1@ztg.com` (Staff - Level 2)
* `hr.senior1@ztg.com` (Senior - Level 3)

---

## 🔒 Role Access Matrix

| Route | Authorized Roles |
| :--- | :--- |
| `/dashboard` | `intern`, `staff`, `senior` |
| `/employee-upload` | `intern`, `staff`, `senior` |
| `/approvals` | `staff`, `senior`, `admin`, `super_admin` |
| `/mfa-setup` | *All Roles* |
| `/soc` | `admin`, `super_admin` |
| `/web-security` | `admin`, `super_admin` |
| `/files` | `admin`, `super_admin` |
| `/soc/users` | `admin`, `super_admin` |
| `/add-user` | `admin`, `super_admin` |

---
*ZeroTrustGuard — Continuous Verification. Assumed Breach. Least Privilege.*
