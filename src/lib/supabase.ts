import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Debug log (safe — only logs presence, never the values)
if (import.meta.env.DEV || import.meta.env.MODE === 'production') {
  console.log('[supabase] env check →', {
    VITE_SUPABASE_URL: supabaseUrl ? `set (${supabaseUrl.slice(0, 20)}...)` : '❌ MISSING',
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? `set (${supabaseAnonKey.slice(0, 8)}...)` : '❌ MISSING',
  });
}

/** True when both env vars are present and non-empty */
export const supabaseConfigured =
  typeof supabaseUrl === 'string' && supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === 'string' && supabaseAnonKey.length > 0;

if (!supabaseConfigured) {
  console.error(
    '[supabase] ❌ Missing environment variables.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Vercel → Settings → Environment Variables.'
  );
}

// Always export a client — if misconfigured it will fail at runtime (network calls),
// not at module-load time, giving React a chance to render the error screen.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
