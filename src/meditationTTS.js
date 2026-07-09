/* PokerForge — client TTS des méditations (edge function meditation-tts).
   Voix naturelles OpenAI, pilotables (femme douce / femme / homme / homme grave).
   La clé reste côté serveur. Repli propre : si l'API est indisponible ou sans clé,
   l'appelant bascule sur la voix du navigateur (speechSynthesis). */

import { supabaseAnonHeaders, supabaseFunctionUrl } from "./config/supabase.js";

const FN = supabaseFunctionUrl("meditation-tts");
const HEADERS = supabaseAnonHeaders({ "Content-Type": "application/json" });

/* 4 timbres proposés à l'utilisateur (+ "off" = silence, géré côté UI) */
export const TTS_VOICES = [
  { id: "f_soft", label: "Femme douce",  gender: "female" },
  { id: "f",      label: "Femme",        gender: "female" },
  { id: "m",      label: "Homme",        gender: "male"   },
  { id: "m_deep", label: "Homme grave",  gender: "male"   },
];

/* Disponibilité (mémorisée) : ping gratuit, ne consomme pas de crédit OpenAI. */
let _status = null; // null=inconnu · true/false
export async function ttsAvailable(timeoutMs = 7000) {
  if (_status !== null) return _status;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(FN, { method: "POST", headers: HEADERS, body: JSON.stringify({ ping: true }), signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) { _status = false; return false; }
    const j = await r.json();
    _status = !!(j && j.ok && j.hasKey);
  } catch { _status = false; }
  return _status;
}
export function resetTTSStatus() { _status = null; }

/* Phase de séance (voix adaptative) : le ton évolue avec l'avancement.
   On la bucketise pour garder le cache efficace (3 phases seulement). */
const phaseOf = p => (p >= 0.66 ? 2 : p >= 0.33 ? 1 : 0);

/* Cache mémoire des pistes déjà générées (clé = voix|phase|durée|texte). */
const _cache = new Map();
const cacheKey = (text, voice, opts) => `${voice}|${phaseOf(opts.progress||0)}|${opts.duration||0}|${text}`;

/* Retourne une URL blob jouable (<audio>.src) ou null si échec → repli navigateur.
   opts : { speed, category, duration, progress } — pilote le ton adaptatif. */
export async function fetchTTSUrl(text, voice = "m_deep", opts = {}, timeoutMs = 40000) {
  const k = cacheKey(text, voice, opts);
  if (_cache.has(k)) return _cache.get(k);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const payload = { text, voice, speed: opts.speed ?? 0.95, category: opts.category || "", duration: opts.duration || 5, progress: opts.progress || 0 };
    const r = await fetch(FN, { method: "POST", headers: HEADERS, body: JSON.stringify(payload), signal: ctrl.signal });
    clearTimeout(t);
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.includes("audio")) { _status = false; return null; } // JSON => noKey/erreur
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    _cache.set(k, url);
    return url;
  } catch { return null; }
}

/* Pré-génère une piste en tâche de fond (paragraphe suivant) sans bloquer. */
export function prefetchTTS(text, voice, opts) {
  if (!text) return;
  fetchTTSUrl(text, voice, opts).catch(() => {});
}
