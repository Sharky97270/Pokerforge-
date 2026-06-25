/* ══════════════════════════════════════════════════════════════
   PokerForge — Client API Solver (Supabase Edge Functions + REST)
   • /functions/v1/solver-analyze  → analyse d'un scénario
   • /functions/v1/ranges-compare  → comparaison de 2 ranges
   • table solver_spots (RLS)       → save/list/delete spots (compte)
   Chaque appel a un FALLBACK local pour ne jamais casser l'UI.
════════════════════════════════════════════════════════════════ */
import { authClient } from "./auth.js";

const SUPA_URL = "https://uspwvzbvjnuwdmvhoegk.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcHd2emJ2am51d2RtdmhvZWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjkzMDYsImV4cCI6MjA5NzMwNTMwNn0.hNZURnCvTcztXw3PoNltfmgmcfvhnmmcwiYHS3UmP9M";
const FN = (n) => `${SUPA_URL}/functions/v1/${n}`;

async function callFn(name, body, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(FN(name), {
      method: "POST",
      headers: { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json" },
      body: JSON.stringify(body || {}), signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, _neterr: true, error: "HTTP " + r.status };
    return await r.json();
  } catch (e) { clearTimeout(t); return { ok: false, _neterr: true, error: String(e && e.message || e) }; }
}

/* Analyse d'un scénario (POST /api/solver/analyze). */
export async function apiSolverAnalyze(payload) { return await callFn("solver-analyze", payload); }
/* Comparaison de 2 ranges (POST /api/ranges/compare). */
export async function apiRangesCompare(a, b, action = "r") { return await callFn("ranges-compare", { a, b, action }); }

/* ── Persistance des spots (table solver_spots, RLS par utilisateur) ── */
async function currentUser() { try { const { data } = await authClient.auth.getUser(); return data && data.user; } catch { return null; } }

export async function apiSaveSpot(spot) {
  const user = await currentUser();
  if (!user) return { ok: false, offline: true };       // → l'appelant bascule sur localStorage
  try {
    const { error } = await authClient.from("solver_spots").insert({
      user_id: user.id, hand_id: spot.handId || null, street: spot.street || null,
      hero_pos: spot.heroPos || null, vil_pos: spot.vilPos || null,
      scenario: spot.scenario || {}, result: spot.result || null, reco: spot.reco || null,
      leak: !!spot.leak, note: spot.note || null, tags: spot.tags || [],
    });
    return { ok: !error, error: error && error.message };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
export async function apiListSpots() {
  const user = await currentUser();
  if (!user) return { ok: false, offline: true, spots: [] };
  try {
    const { data, error } = await authClient.from("solver_spots").select("*").order("created_at", { ascending: false }).limit(100);
    return { ok: !error, spots: data || [], error: error && error.message };
  } catch (e) { return { ok: false, error: String(e && e.message || e), spots: [] }; }
}
export async function apiDeleteSpot(id) {
  try { const { error } = await authClient.from("solver_spots").delete().eq("id", id); return { ok: !error }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
