// ════════════════════════════════════════════════════════════════════════════
// Access-gate crypto helpers — shared by the /api/verify route (issues the
// session token) and the middleware (verifies it). These live here, NOT in the
// route file: Next.js route modules may only export request handlers (GET/POST/…)
// plus a few reserved config constants, so a helper export like `makeToken`
// breaks the build. Web-Crypto only (Edge-runtime safe).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Constant-time string comparison so an attacker can't infer password/token
 * length or content from response timing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // Compare over the longer length so timing doesn't leak which is shorter.
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length; // non-zero if lengths differ
  for (let i = 0; i < len; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * HMAC-SHA256(secret, "arken:<hour>") → base64url (no padding). The hour bucket
 * makes tokens naturally rotate; middleware accepts the current or previous hour.
 */
async function hmacToken(secret: string, hour: number): Promise<string> {
  const message = `arken:${hour}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  // Build the binary string without spreading the typed array (spread of
  // Uint8Array needs es2015+/downlevelIteration; a loop is target-independent).
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build the session token for the CURRENT hour bucket. Verifiable in middleware
 * without a database by recomputing the same HMAC.
 */
export async function makeToken(secret: string): Promise<string> {
  const hour = Math.floor(Date.now() / 1000 / 3600); // changes every hour
  return hmacToken(secret, hour);
}

/**
 * True if `token` equals the HMAC for the given hour bucket (constant-time).
 */
export async function hmacMatches(token: string, secret: string, hour: number): Promise<boolean> {
  try {
    const expected = await hmacToken(secret, hour);
    return timingSafeEqual(token, expected);
  } catch {
    return false;
  }
}
