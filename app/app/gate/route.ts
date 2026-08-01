import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// Serve the access gate as a raw static HTML file — no React, no hydration.
// The middleware rewrites unauthenticated requests to /gate, which hits this
// handler. Node runtime + dynamic so the file is read at request time.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const html = readFileSync(join(process.cwd(), 'public', 'gate.html'), 'utf-8');
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
