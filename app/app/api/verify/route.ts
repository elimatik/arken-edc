import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeToken, timingSafeEqual } from '@/lib/auth/gate';

export const runtime = 'edge';

// POST /api/verify
// Body: { password: string }
// On match  → sets httpOnly session cookie, returns 200
// On miss   → returns 401
// The password lives ONLY in the ARKEN_PASSWORD env var — never in this file.

const COOKIE_NAME = 'arken_session';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

export async function POST(req: NextRequest) {
  console.log('[verify] POST received, password length:',
    (await req.clone().json())?.password?.length ?? 'no body');
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