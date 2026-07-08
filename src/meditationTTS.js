/* PokerForge — client TTS des méditations (edge function meditation-tts).
   Voix naturelles OpenAI, pilotables (femme douce / femme / homme / homme grave).
   La clé reste côté serveur. Repli propre : si l'API est indisponible ou sans clé,
   l'appelant bascule sur la voix du navigateur (speechSynthesis). */

const SUPA_URL = "https://uspwvzbvjnuwdmvhoegk.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcHd2emJ2am51d2RtdmhvZWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjkzMDYsImV4cCI6MjA5NzMwNTMwNn0.hNZURnCvTcztXw3PoNltfmgmcfvhnmmcwiYHS3UmP9M";
const FN = `${SUPA_URL}/functions/v1/meditation-tts`;
const HEADERS = { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json" };

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

/* Cache mémoire des pistes déjà générées (clé = voix|allure|texte). */
const _cache = new Map();
const cacheKey = (text, voice, speed) => `${voice}|${speed}|${text}`;

/* Retourne une URL blob jouable (<audio>.src) ou null si échec → repli navigateur. */
export async function fetchTTSUrl(text, voice = "f", speed = 0.95, timeoutMs = 30000) {
  const k = cacheKey(text, voice, speed);
  if (_cache.has(k)) return _cache.get(k);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(FN, { method: "POST", headers: HEADERS, body: JSON.stringify({ text, voice, speed }), signal: ctrl.signal });
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
export function prefetchTTS(text, voice, speed) {
  if (!text) return;
  fetchTTSUrl(text, voice, speed).catch(() => {});
}
