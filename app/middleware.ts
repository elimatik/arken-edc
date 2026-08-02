import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = {
  // Run on every route EXCEPT:
  //  • /api/verify  — legacy verify endpoint (unused by the gate now)
  //  • /gate        — the gate page (also covers the static /gate.html)
  //  • /_next/*     — Next.js internals
  //  • /favicon.ico — browser auto-request
  matcher: [
    '/((?!api/verify|gate|_next/static|_next/image|favicon.ico).*)',
  ],
};

const NDA_COOKIE = 'arken_nda';

export function middleware(req: NextRequest) {
  // Every visitor must accept the NDA gate first. The gate form (public/gate.html)
  // sets a non-httpOnly `arken_nda=accepted` cookie on submit; until that cookie
  // is present, redirect to the static gate. No password / session HMAC anymore.
  if (req.cookies.get(NDA_COOKIE)?.value === 'accepted') {
    return NextResponse.next();
  }
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
