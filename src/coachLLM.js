/* ══════════════════════════════════════════════════════════════
   PokerForge — Client Coach AI LLM (edge function coach-chat)
   La clé OpenAI reste CÔTÉ SERVEUR (secret de l'edge function).
   Le frontend n'envoie que le message + le contexte poker déjà
   construit par le moteur déterministe (coachEngine/coachAgents).
   Fallback propre : { ok:false, noKey/​_neterr } → l'UI montre le
   contenu déterministe + un message clair.
════════════════════════════════════════════════════════════════ */
import { supabaseAnonHeaders, supabaseFunctionUrl } from "./config/supabase.js";

/* mode : "chat" | "explain" | "debrief" | "mental" | "tournoi"
   context : objet poker compact (main normalisée, leaks, profil…) — JAMAIS de clé/secret. */
export async function coachChat({ mode = "chat", userMessage, messages, context } = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(supabaseFunctionUrl("coach-chat"), {
      method: "POST",
      headers: supabaseAnonHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ mode, userMessage, messages, context }), signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, _neterr: true, error: "Coach AI indisponible (HTTP " + r.status + ")." };
    return await r.json();
  } catch (e) { clearTimeout(t); return { ok: false, _neterr: true, error: "Coach AI injoignable." }; }
}

/* Indique si l'IA LLM est disponible (clé serveur configurée). Mémorisé pour éviter les pings. */
let _llmStatus = null;
export async function coachLLMAvailable() {
  if (_llmStatus !== null) return _llmStatus;
  const r = await coachChat({ mode: "chat", userMessage: "ping" }, 8000);
  _llmStatus = !!(r && (r.ok || (!r.noKey && !r._neterr)));
  return _llmStatus;
}
export function resetLLMStatus() { _llmStatus = null; }
