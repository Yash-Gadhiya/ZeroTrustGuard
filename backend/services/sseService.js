/**
 * sseService.js
 *
 * Server-Sent Events (SSE) service for real-time SOC alerts.
 *
 * Replaces Socket.io — SSE is HTTP-based (no server restructure needed),
 * works on all hosting platforms including Render free tier, and is
 * perfectly suited for one-way server → browser push.
 *
 * Usage:
 *   Backend: call emitSOCAlert(payload) anywhere (alertService, controllers)
 *   Frontend: const es = new EventSource('/api/soc/stream', { withCredentials: true })
 *             es.addEventListener('new-alert', e => JSON.parse(e.data))
 */

"use strict";

// Active SSE client connections — Map<userId, Response[]>
// Multiple tabs from the same admin are tracked separately
const clients = new Map();

/**
 * Register a new SSE client connection.
 * Called by the GET /api/soc/stream route.
 */
function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, []);
  clients.get(userId).push(res);

  // Remove from map when connection closes
  res.on("close", () => {
    const remaining = (clients.get(userId) || []).filter(r => r !== res);
    if (remaining.length === 0) {
      clients.delete(userId);
    } else {
      clients.set(userId, remaining);
    }
  });
}

/**
 * Broadcast a new SOC alert to ALL connected SOC admin clients.
 * @param {object} payload  - The alert data to push (will be JSON-stringified)
 */
function emitSOCAlert(payload) {
  const data = JSON.stringify(payload);
  let sent = 0;
  for (const responses of clients.values()) {
    for (const res of responses) {
      try {
        res.write(`event: new-alert\ndata: ${data}\n\n`);
        sent++;
      } catch {
        // Connection already closed — will be cleaned up by the 'close' listener
      }
    }
  }
  if (sent > 0) {
    console.log(`[SSE] Pushed new-alert to ${sent} client(s)`);
  }
}

/**
 * Number of currently connected SSE clients (for diagnostics).
 */
function connectedCount() {
  let total = 0;
  for (const arr of clients.values()) total += arr.length;
  return total;
}

module.exports = { addClient, emitSOCAlert, connectedCount };
