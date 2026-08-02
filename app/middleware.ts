import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { hmacMatches } from '@/lib/auth/gate';

export const config = {
  // Run on every route EXCEPT:
  //  • /api/verify  — the login endpoint itself
  //  • /gate        — the access-gate page
  //  • /_next/*     — Next.js internals
  //  • /favicon.ico — browser auto-request
  matcher: [
    '/((?!api/verify|gate|_next/static|_next/image|favicon.ico).*)',
  ],
};

const COOKIE_NAME = 'arken_session';

export async function middleware(req: NextRequest) {
  // ── Access gate TEMPORARILY DISABLED — all routes pass through freely. ──
  // To re-enable the gate, flip this flag back to `true`. The gate logic and
  // helpers (serveGate / isValidToken / hmacMatches) below stay wired up, so
  // nothing else needs to change.
  const GATE_ENABLED = false;
  if (!GATE_ENABLED) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.ARKEN_PASSWORD ?? '';

  // If env var is missing, fail closed
  if (!secret) {
    return serveGate(req);
  }

  if (token && (await isValidToken(token, secret))) {
    // Valid session — pass through to the app
    return NextResponse.next();
  }

  // No valid session — send to the gate
  return serveGate(req);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serveGate(req: NextRequest) {
  // Redirect to the STATIC public/gate.html (served directly by Next — no
  // serverless function, no fs read; safe on Vercel). The matcher already
  // excludes anything starting with "gate", so /gate.html is never intercepted;
  // this guard is belt-and-suspenders against loops.
  if (req.nextUrl.pathname === '/gate.html') return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/gate.html';
  return NextResponse.redirect(url);
}

/**
 * Accepts a token if it matches the HMAC for the CURRENT hour OR the PREVIOUS
 * hour (gives a ~1h grace window either side of rollover). The constant-time
 * comparison lives inside hmacMatches (lib/auth/gate).
 */
async function isValidToken(token: string, secret: string): Promise<boolean> {
  const hour = Math.floor(Date.now() / 1000 / 3600);
  return (
    (await hmacMatches(token, secret, hour)) ||
    (await hmacMatches(token, secret, hour - 1))
  );
}
