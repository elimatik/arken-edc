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
  // If already on /gate, don't loop
  if (req.nextUrl.pathname === '/gate') return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/gate';
  return NextResponse.rewrite(url);
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
