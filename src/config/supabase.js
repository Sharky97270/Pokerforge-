// PokerForge — Supabase runtime configuration.
// Vercel/Vite expose public frontend variables only when they are prefixed with VITE_.
// The fallback keeps the current local prototype working until production env vars are set.

const env = import.meta.env || {};

const FALLBACK_SUPABASE_URL = "https://uspwvzbvjnuwdmvhoegk.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcHd2emJ2am51d2RtdmhvZWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjkzMDYsImV4cCI6MjA5NzMwNTMwNn0.hNZURnCvTcztXw3PoNltfmgmcfvhnmmcwiYHS3UmP9M";

/* Normalise l'URL du projet vers sa SEULE forme valide : l'origine.
   Supabase attend `https://<ref>.supabase.co`, jamais un sous-chemin. Le
   dashboard affiche aussi des URLs d'API (`.../rest/v1`, `.../auth/v1`) et il
   est facile de coller la mauvaise dans la variable d'environnement. Le résultat
   est silencieux et global : le client construit alors `/rest/v1/auth/v1/token`,
   `/rest/v1/functions/v1/<fn>`… et TOUT casse d'un coup — connexion, synchro
   cloud, edge functions — avec un « Invalid path specified in request URL »
   (PGRST125) qui ne dit rien de la cause.
   On coupe donc tout chemin, toute query et tout slash final. */
function normalizeProjectUrl(raw, fallback) {
  const v = String(raw || "").trim();
  if (!v) return fallback;
  try { return new URL(v).origin; } catch { return fallback; }
}

export const SUPABASE_URL = normalizeProjectUrl(env.VITE_SUPABASE_URL, FALLBACK_SUPABASE_URL);
export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY).trim();
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
