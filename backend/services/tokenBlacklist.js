"use strict";

/**
 * Token Blacklist — In-Memory JWT Revocation Store
 *
 * Holds the `jti` (JWT ID) values of tokens that have been explicitly revoked
 * (via logout or admin block). Every revoked `jti` also stores its expiry time
 * so entries are automatically pruned and memory doesn't grow unbounded.
 *
 * Production note: For multi-process or clustered deployments, swap this Map
 * for a Redis TTL key. The external interface (add/has/delete) stays the same.
 */

// Map<jti: string, expiresAt: number (unix ms)>
const store = new Map();

const blacklist = {
  /**
   * Add a token to the blacklist.
   * @param {string} jti - The JWT ID claim
   * @param {number} expiresAt - Token expiry as a Unix timestamp (seconds, from jwt payload)
   */
  add(jti, expiresAt) {
    if (!jti) return;
    store.set(jti, expiresAt * 1000); // convert to ms
  },

  /** Returns true if the jti is currently blacklisted and NOT yet expired */
  has(jti) {
    if (!jti || !store.has(jti)) return false;
    const exp = store.get(jti);
    if (Date.now() > exp) {
      store.delete(jti); // lazy-prune expired entries
      return false;
    }
    return true;
  },

  /** Manually remove a jti (optional — used for testing) */
  delete(jti) {
    store.delete(jti);
  },

  /** Returns total number of active revoked tokens (for monitoring) */
  size() {
    return store.size;
  }
};

// ── Auto-prune every 30 minutes ───────────────────────────────────────────────
// Removes expired entries so the in-memory store doesn't grow indefinitely
setInterval(() => {
  const now = Date.now();
  let pruned = 0;
  for (const [jti, exp] of store) {
    if (now > exp) {
      store.delete(jti);
      pruned++;
    }
  }
  if (pruned > 0) {
    console.log(`[TokenBlacklist] Pruned ${pruned} expired token(s). Active: ${store.size}`);
  }
}, 30 * 60 * 1000).unref(); // .unref() so it doesn't keep the process alive

module.exports = blacklist;
