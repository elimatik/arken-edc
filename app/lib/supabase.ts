import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Don't throw when the env vars are absent — Next.js evaluates this module during
// static generation (SSG) at build time, where they may not be present. Warn and
// fall back to placeholders so the build completes; at runtime on Vercel the real
// NEXT_PUBLIC_SUPABASE_* vars are injected and the client works normally.
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables — running in build/SSG mode')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
)
