// Browser Supabase client. Uses ONLY the public anon key (read-only via RLS policies).
// The service-role key must never be used here and is never prefixed with VITE_.
import { createClient } from '@supabase/supabase-js';

const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

/** False when the variables are missing or still contain the .env.example placeholders. */
export const isSupabaseConfigured = Boolean(url && anonKey && !/your-/.test(`${url}${anonKey}`));

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
