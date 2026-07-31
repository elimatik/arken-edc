import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
 * Accepts a token if it matches the HMAC for the CURRENT hour
 * OR the PREVIOUS hour (gives a ~1h grace window either side of rollover).
 */
async function isValidToken(token: string, secret: string): Promise<boolean> {
  const hour = Math.floor(Date.now() / 1000 / 3600);
  return (
    (await hmacMatches(token, secret, hour)) ||
    (await hmacMatches(token, secret, hour - 1))
  );
}

async function hmacMatches(
  token: string,
  secret: string,
  hour: number
): Promise<boolean> {
  try {
    const message = `arken:${hour}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(message)
    );
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // Constant-time comparison
    return timingSafeEqual(token, expected);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}