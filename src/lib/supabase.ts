import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Validate that the URL is a proper https:// URL (not a key accidentally pasted in the wrong field)
const isValidUrl = (val: string | undefined): boolean => {
  if (!val) return false;
  try {
    const u = new URL(val);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const urlOk = isValidUrl(supabaseUrl);
const keyOk = typeof supabaseAnonKey === 'string' && supabaseAnonKey.length > 10;

// Safe diagnostic log — shows format hint without exposing full values
console.log('[supabase] env check →', {
  VITE_SUPABASE_URL:
    !supabaseUrl       ? '❌ MISSING' :
    urlOk              ? `✅ set (${supabaseUrl.slice(0, 24)}...)` :
    `❌ INVALID — "${supabaseUrl.slice(0, 16)}..." (must be https://xxxx.supabase.co)`,
  VITE_SUPABASE_ANON_KEY:
    !supabaseAnonKey   ? '❌ MISSING' :
    keyOk              ? `✅ set (${supabaseAnonKey.slice(0, 8)}...)` :
    '❌ TOO SHORT',
});

/**
 * True only when both env vars are present AND the URL is a valid https:// URL.
 * App.tsx uses this flag to show a config error screen without crashing.
 */
export const supabaseConfigured: boolean = urlOk && keyOk;

if (!supabaseConfigured) {
  console.error(
    '[supabase] ❌ Configuration error — env vars missing or invalid.\n' +
    'Fix: Vercel → Project → Settings → Environment Variables\n' +
    '  VITE_SUPABASE_URL      = https://xxxx.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY = eyJ... (anon/public JWT, NOT the publishable key)'
  );
}

// Use a safe placeholder URL/key so createClient never throws synchronously.
// If misconfigured, all network calls will fail gracefully at runtime.
// The explicit cast to SupabaseClient<any> keeps salon.ts types stable.
export const supabase: SupabaseClient<any> = (() => {
  try {
    return createClient(
      urlOk ? supabaseUrl! : 'https://placeholder.supabase.co',
      keyOk ? supabaseAnonKey! : 'eyJplaceholder.placeholder.placeholder',
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      }
    );
  } catch (err) {
    console.error('[supabase] createClient threw — using stub:', err);
    // Last-resort stub; all DB calls will fail gracefully at network level
    return createClient(
      'https://placeholder.supabase.co',
      'eyJplaceholder.placeholder.placeholder'
    );
  }
})();
