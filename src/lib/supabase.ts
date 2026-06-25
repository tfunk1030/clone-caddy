import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// When Supabase isn't configured we run in a local "demo" mode (auth state held
// in localStorage) so the app is fully usable without a backend. Set
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable real auth.
export const isSupabaseConfigured = Boolean(url && anon);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anon!)
  : null;
