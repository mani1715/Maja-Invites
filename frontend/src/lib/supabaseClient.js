// Supabase browser client — single instance reused across the app.
// Auth flow: PKCE for security. Session persisted in localStorage so refresh
// keeps the user signed in. URL detection enabled so OAuth + magic-link
// callbacks (?code=...) hydrate the session automatically on /auth/callback.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Don't crash the app — just log. Pages that don't need Supabase still work.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY are not set'
  );
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'wedding-supabase-auth', // distinct from legacy 'admin_token'
    },
  }
);

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export default supabase;
