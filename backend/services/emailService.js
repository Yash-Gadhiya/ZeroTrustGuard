/**
 * emailService.js
 *
 * Centralised email delivery using nodemailer + Mailtrap SMTP.
 *
 * Setup (one-time):
 *   1. Go to https://mailtrap.io → Email Testing → Inboxes → SMTP Settings → Nodemailer
 *   2. Copy host/port/user/pass into backend/.env (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS)
 *   3. Set SMTP_FROM to your preferred sender display name
 *
 * All sendX() helpers are non-fatal — an email failure NEVER crashes the request.
 */

"use strict";

const nodemailer = require("nodemailer");

// ── Transporter — configured from .env ───────────────────────────────────────
// Compatible with both Mailtrap (port 2525) and Gmail (port 587 + STARTTLS)
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io",
  port:   parseInt(process.env.SMTP_PORT || "2525"),
  secure: parseInt(process.env.SMTP_PORT || "2525") === 465, // true only for port 465 (SSL)
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
  tls: {
    rejectUnauthorized: false, // allows self-signed certs in dev
  },
});

// ── Base sender ───────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER) {
    // Silently skip if not configured — dev environments without .env filled in
    console.warn(`[EMAIL] SMTP not configured — skipping email to ${to}: "${subject}"`);
    return;
  }
  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || '"ZeroTrustGuard" <no-reply@zerotrustguard.com>',
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] ✅ Sent "${subject}" → ${to}`);
  } catch (err) {
    // Non-fatal — never crash the request because of an email failure
    console.error(`[EMAIL] ❌ Failed to send to ${to}:`, err.message);
  }
}

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
function wrap(title, body) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:8px;overflow:hidden">
    <div style="background:#1e293b;padding:24px 32px;border-bottom:1px solid #334155">
      <h1 style="margin:0;font-size:20px;color:#60a5fa">🛡️ ZeroTrustGuard</h1>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 16px;font-size:18px;color:#f1f5f9">${title}</h2>
      ${body}
    </div>
    <div style="padding:16px 32px;background:#1e293b;border-top:1px solid #334155;font-size:12px;color:#64748b;text-align:center">
      This is an automated security notification from ZeroTrustGuard. Do not reply to this email.
    </div>
  </div>`;
}

// ── Email templates ───────────────────────────────────────────────────────────

/**
 * File access request APPROVED
 */
async function sendAccessApproved(userEmail, fileName, expiresAt) {
  const expiry = expiresAt ? new Date(expiresAt).toLocaleString() : "as granted";
  await sendEmail(
    userEmail,
    "✅ File Access Approved — ZeroTrustGuard",
    wrap("Your Access Request Was Approved", `
      <p>Your request to access the following file has been <strong style="color:#4ade80">approved</strong>:</p>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:6px;padding:16px;margin:16px 0">
        <strong>📄 File:</strong> ${fileName}<br/>
        <strong>⏰ Access expires:</strong> ${expiry}
      </div>
      <p>Log in to ZeroTrustGuard and navigate to <strong>My Files</strong> to access it.</p>
      <p style="color:#94a3b8;font-size:13px">Access will be automatically revoked after the granted period.</p>
    `)
  );
}

/**
 * File access request REJECTED
 */
async function sendAccessRejected(userEmail, fileName, reason) {
  await sendEmail(
    userEmail,
    "❌ File Access Rejected — ZeroTrustGuard",
    wrap("Your Access Request Was Rejected", `
      <p>Your request to access the following file has been <strong style="color:#f87171">rejected</strong>:</p>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:6px;padding:16px;margin:16px 0">
        <strong>📄 File:</strong> ${fileName}<br/>
        <strong>💬 Reason from admin:</strong> <span style="color:#fbbf24">${reason}</span>
      </div>
      <p>If you believe this is in error, please contact your department administrator.</p>
    `)
  );
}

/**
 * MFA reset request APPROVED
 */
async function sendMfaResetApproved(userEmail) {
  await sendEmail(
    userEmail,
    "🔑 MFA Reset Approved — ZeroTrustGuard",
    wrap("Your MFA Reset Was Approved", `
      <p>Your request to reset your authenticator has been <strong style="color:#4ade80">approved</strong>.</p>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:6px;padding:16px;margin:16px 0">
        <strong>Next steps:</strong>
        <ol style="margin:8px 0;padding-left:20px;color:#94a3b8">
          <li>Log in to ZeroTrustGuard</li>
          <li>Go to <strong style="color:#e2e8f0">MFA Setup</strong> in the sidebar</li>
          <li>Scan the new QR code with your authenticator app (Google Authenticator / Authy)</li>
        </ol>
      </div>
      <p style="color:#94a3b8;font-size:13px">Your old authenticator codes are no longer valid.</p>
    `)
  );
}

/**
 * MFA reset request REJECTED
 */
async function sendMfaResetRejected(userEmail, reason) {
  await sendEmail(
    userEmail,
    "❌ MFA Reset Rejected — ZeroTrustGuard",
    wrap("Your MFA Reset Request Was Rejected", `
      <p>Your request to reset your authenticator has been <strong style="color:#f87171">rejected</strong>.</p>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:6px;padding:16px;margin:16px 0">
        <strong>💬 Reason from admin:</strong> <span style="color:#fbbf24">${reason}</span>
      </div>
      <p>If you have lost access to your authenticator device, contact your IT department directly.</p>
    `)
  );
}

/**
 * Account SUSPENDED / BLOCKED by admin
 */
async function sendAccountSuspended(userEmail) {
  await sendEmail(
    userEmail,
    "⚠️ Account Suspended — ZeroTrustGuard",
    wrap("Your Account Has Been Suspended", `
      <p>Your ZeroTrustGuard account has been <strong style="color:#f87171">suspended</strong> by a SOC administrator.</p>
      <div style="background:#1e293b;border:1px solid #f87171;border-radius:6px;padding:16px;margin:16px 0;border-left:4px solid #f87171">
        You will not be able to log in until the suspension is lifted.
      </div>
      <p>Contact your IT administrator or SOC team urgently to resolve this issue.</p>
    `)
  );
}

/**
 * Temporary access AUTO-EXPIRED by the cron worker
 */
async function sendAccessExpired(userEmail, fileId) {
  await sendEmail(
    userEmail,
    "⏰ Temporary File Access Expired — ZeroTrustGuard",
    wrap("Your Temporary Access Has Expired", `
      <p>Your temporary access to <strong>File #${fileId}</strong> has <strong style="color:#fbbf24">automatically expired</strong>.</p>
      <p>If you still need access, submit a new access request from your dashboard.</p>
    `)
  );
}


module.exports = {
  sendAccessApproved,
  sendAccessRejected,
  sendMfaResetApproved,
  sendMfaResetRejected,
  sendAccountSuspended,
  sendAccessExpired,
};
