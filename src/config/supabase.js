// PokerForge — Supabase runtime configuration.
// Vercel/Vite expose public frontend variables only when they are prefixed with VITE_.
// The fallback keeps the current local prototype working until production env vars are set.

const env = import.meta.env || {};

const FALLBACK_SUPABASE_URL = "https://uspwvzbvjnuwdmvhoegk.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcHd2emJ2am51d2RtdmhvZWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjkzMDYsImV4cCI6MjA5NzMwNTMwNn0.hNZURnCvTcztXw3PoNltfmgmcfvhnmmcwiYHS3UmP9M";

export const SUPABASE_URL = env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
export const APP_ENV = env.VITE_APP_ENV || "local";

export function supabaseFunctionUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

export function supabaseAnonHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  };
}
