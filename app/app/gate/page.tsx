// app/gate/page.tsx
// This route serves the access gate. Middleware rewrites un-authed requests here.
// It is excluded from the middleware matcher so it never loops.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Arken EDC · Access',
  robots: { index: false, follow: false },
};

// The gate is a self-contained client page — import it as a Client Component
// so the inline script (password check → /api/verify) works normally.
import GateClient from './GateClient';

export default function GatePage() {
  return <GateClient />;
}

