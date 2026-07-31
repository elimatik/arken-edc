import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

// POST /api/verify
// Body: { password: string }
// On match  → sets httpOnly session cookie, returns 200
// On miss   → returns 401
// The password lives ONLY in the ARKEN_PASSWORD env var — never in this file.

const COOKIE_NAME = 'arken_session';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supplied: string = (body?.password ?? '').trim();
    const expected: string = (process.env.ARKEN_PASSWORD ?? '').trim();

    if (!expected) {
      // Env var not set — fail closed, never open
      return NextResponse.json(
        { error: 'Server configuration error.' },
        { status: 500 }
      );
    }

    // Constant-time comparison to prevent timing attacks
    const match = timingSafeEqual(supplied, expected);

    if (!match) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    }

    // Build the session token: HMAC-SHA256(timestamp|secret) so it's
    // verifiable in middleware without a database
    const token = await makeToken(expected);

    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison so an attacker can't
 * infer password length from response timing.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // Pad shorter one so lengths always match
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length; // non-zero if lengths differ
  for (let i = 0; i < len; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * HMAC-SHA256 token = base64url(HMAC(secret, "arken:" + flooredHour))
 * Tokens naturally expire when the floored-hour changes AND the cookie
 * maxAge has elapsed. Middleware verifies by recomputing the same HMAC.
 */
export async function makeToken(secret: string): Promise<string> {
  const hour = Math.floor(Date.now() / 1000 / 3600); // changes every hour
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
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}