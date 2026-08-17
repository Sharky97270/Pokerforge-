/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : CLIENT D'ANALYSE IA (§4/§17/§18/§20/§26/§28)

   Le navigateur n'appelle JAMAIS un fournisseur d'IA directement.
   Il appelle l'endpoint PokerForge (edge function `analyze-hand`), qui
   détient seul le secret et orchestre le fournisseur.

     Browser → PokerForge backend → OpenAI → backend → Browser

   Ce module gère : clé de cache (§20), historique local (§28), messages
   d'erreur PokerForge (§18) et étapes de chargement (§17). Il ne fabrique
   AUCUN chiffre : les valeurs mathématiques viennent du package solveur.

   Les helpers de cache/clé sont PURS (store injectable) → testables en Node.
═══════════════════════════════════════════════════════════════ */
import { supabaseFunctionUrl, supabaseAnonHeaders } from "../config/supabase.js";
import { SOLVER_PACKAGE_VERSION } from "./solverPackage.js";
import { validatePokerState, validateAiResponse } from "./pokerStateValidator.js";

/* Version du prompt serveur attendue (doit rester alignée avec l'edge function).
   v3 : le modèle reçoit un POKER STATE normalisé (action sémantique, action
   affrontée, options légales, provenance) et ne reconstruit plus le coup
   depuis du texte libre. Changer cette version invalide le cache (§20). */
export const PROMPT_VERSION = "pokerforge-hand-analysis-v3";
export const CLIENT_VERSION = "replayer-ai-2.0.0";
export const ANALYSIS_MODES = ["decision", "full_hand"];

const CACHE_KEY = "pf_rep_ai_cache";
const CACHE_MAX = 40;              // analyses conservées localement
const DEFAULT_TIMEOUT = 45000;

/* ── Store injectable : localStorage en navigateur, mémoire en Node ── */
const _mem = new Map();
const memoryStore = {
  getItem: k => (_mem.has(k) ? _mem.get(k) : null),
  setItem: (k, v) => { _mem.set(k, String(v)); },
  removeItem: k => { _mem.delete(k); },
};
export function defaultStore() {
  try { if (typeof localStorage !== "undefined" && localStorage) return localStorage; } catch { /* SSR/node */ }
  return memoryStore;
}

/* Hash déterministe (FNV-1a 32 bits) — clé de cache stable et courte. */
export function hashKey(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Clé de cache (§20) : handId + version solveur + version prompt + mode
 * (+ version modèle quand elle est connue, après la première réponse).
 */
export function analysisCacheKey({ handId, analysisMode = "decision", step = null,
                                   solverVersion = SOLVER_PACKAGE_VERSION,
                                   promptVersion = PROMPT_VERSION, modelVersion = "" } = {}) {
  const raw = [handId || "?", solverVersion, promptVersion, modelVersion, analysisMode,
               analysisMode === "decision" && step != null ? `s${step}` : ""].join("|");
  return `${analysisMode}:${hashKey(raw)}`;
}

/* ── Cache / historique local (§28) ── */
export function readCache(store = defaultStore()) {
  try { return JSON.parse(store.getItem(CACHE_KEY) || "{}") || {}; } catch { return {}; }
}
function writeCache(obj, store = defaultStore()) {
  try {
    const entries = Object.entries(obj).sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0)).slice(0, CACHE_MAX);
    store.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* quota dépassé : le cache est un confort, pas une dépendance */ }
}
export function getCachedAnalysis(key, store = defaultStore()) {
  const c = readCache(store);
  return c[key] || null;
}
export function putCachedAnalysis(key, record, store = defaultStore()) {
  const c = readCache(store);
  c[key] = { ...record, createdAt: record?.createdAt || Date.now() };
  writeCache(c, store);
  return c[key];
}
export function listAnalyses(store = defaultStore()) {
  return Object.entries(readCache(store))
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
export function clearAnalysisCache(store = defaultStore()) {
  try { store.removeItem(CACHE_KEY); } catch { /* noop */ }
}

/* ── Messages d'erreur PokerForge (§18) — jamais de stack trace ni d'erreur brute ── */
export const AI_ERRORS = {
  UNAUTHENTICATED: { code: "UNAUTHENTICATED", title: "Connexion requise",
    message: "Connecte-toi à ton compte PokerForge pour lancer l'analyse IA.", retryable: false },
  NO_KEY: { code: "NO_KEY", title: "Analyse IA indisponible",
    message: "Analyse IA temporairement indisponible. Les données SharkSolver restent accessibles.", retryable: false },
  RATE_LIMIT: { code: "RATE_LIMIT", title: "Trop d'analyses",
    message: "Limite d'analyses atteinte — réessaie dans un instant.", retryable: true },
  TIMEOUT: { code: "TIMEOUT", title: "Analyse trop longue",
    message: "L'analyse prend plus de temps que prévu.", retryable: true },
  INVALID_INPUT: { code: "INVALID_INPUT", title: "Main invalide",
    message: "Cette main n'a pas pu être validée — réimporte-la depuis la hand history.", retryable: false },
  INVALID_OUTPUT: { code: "INVALID_OUTPUT", title: "Réponse inexploitable",
    message: "La réponse de l'IA n'a pas pu être validée. Les données SharkSolver restent accessibles.", retryable: true },
  /* §4/§5 — état contrôlé : mieux vaut ne rien affirmer qu'affirmer faux. */
  INCOHERENT_STATE: { code: "INCOHERENT_STATE", title: "Analyse suspendue",
    message: "Les données de cette main ne sont pas cohérentes entre elles — PokerForge préfère ne rien affirmer plutôt que de produire une explication fausse.", retryable: false },
  FABRICATED_DATA: { code: "FABRICATED_DATA", title: "Réponse rejetée",
    message: "La réponse citait des valeurs absentes des données PokerForge : elle a été rejetée. Les chiffres SharkSolver restent affichés.", retryable: true },
  PROVIDER: { code: "PROVIDER", title: "Analyse IA indisponible",
    message: "Analyse IA temporairement indisponible. Les données SharkSolver restent accessibles.", retryable: true },
  NETWORK: { code: "NETWORK", title: "Connexion perdue",
    message: "Impossible de joindre PokerForge — vérifie ta connexion.", retryable: true },
  UNKNOWN: { code: "UNKNOWN", title: "Analyse IA indisponible",
    message: "Analyse IA temporairement indisponible. Les données SharkSolver restent accessibles.", retryable: true },
};
export function aiError(code, extra = {}) {
  const base = AI_ERRORS[code] || AI_ERRORS.UNKNOWN;
  return { ok: false, error: { ...base, ...extra } };
}
/* Statut HTTP / code serveur → erreur PokerForge (§18). */
export function mapServerError(status, payload = {}) {
  const code = String(payload.code || "").toUpperCase();
  if (AI_ERRORS[code]) return aiError(code, payload.retryAfter ? { retryAfter: payload.retryAfter } : {});
  if (status === 401 || status === 403) return aiError("UNAUTHENTICATED");
  if (status === 400 || status === 422) return aiError("INVALID_INPUT");
  if (status === 429) return aiError("RATE_LIMIT", payload.retryAfter ? { retryAfter: payload.retryAfter } : {});
  if (status === 503) return aiError("NO_KEY");
  if (status >= 500) return aiError("PROVIDER");
  return aiError("UNKNOWN");
}

/* ── Étapes de chargement affichées (§17) ── */
export const LOADING_STEPS = [
  "Lecture de la main…",
  "Analyse stratégique…",
  "Interprétation PokerForge AI…",
];

/* ── Validation de la réponse structurée (§10) — le client refuse ce qu'il ne
   reconnaît pas plutôt que d'afficher un objet à moitié rempli. ── */
export const RATINGS = ["excellent", "good", "neutral", "mistake", "blunder"];
export const STREET_STATUS = ["good", "neutral", "mistake", "not_played"];
export function validateAnalysis(a) {
  const errors = [];
  if (!a || typeof a !== "object") return { valid: false, errors: ["réponse vide"] };
  if (typeof a.summary !== "string" || !a.summary.trim()) errors.push("summary manquant");
  if (!a.verdict || typeof a.verdict !== "object") errors.push("verdict manquant");
  else if (!RATINGS.includes(a.verdict.rating)) errors.push("rating inconnu");
  if (!a.streets || typeof a.streets !== "object") errors.push("streets manquant");
  else {
    for (const s of ["preflop", "flop", "turn", "river"]) {
      const st = a.streets[s];
      if (!st) { errors.push(`street ${s} manquante`); continue; }
      if (!STREET_STATUS.includes(st.status)) errors.push(`status ${s} inconnu`);
    }
  }
  if (!Array.isArray(a.keyConcepts)) errors.push("keyConcepts manquant");
  if (!Array.isArray(a.detectedLeaks)) errors.push("detectedLeaks manquant");
  if (typeof a.coachAdvice !== "string") errors.push("coachAdvice manquant");
  return { valid: errors.length === 0, errors };
}

/* ── §4 : contrôle AVANT envoi ──
   Le backend refait ces vérifications ; on les fait aussi ici pour ne pas
   dépenser un appel payant sur un spot dont on sait déjà qu'il est mal décrit.
   Un `pokerState` absent (main hors périmètre) n'est PAS une erreur : on laisse
   simplement passer, le prompt saura qu'il n'a pas de description sémantique. */
export function preflightCheck({ solverData, analysisMode }) {
  if (analysisMode === "full_hand") return { ok: true };
  const ps = solverData?.target?.pokerState;
  if (!ps) return { ok: true };
  const v = validatePokerState(ps);
  return v.valid ? { ok: true } : { ok: false, errors: v.errors };
}

/* Jeton de session Supabase (§22) — chargé dynamiquement pour garder ce module
   importable en Node (les tests n'ont ni navigateur ni session). */
async function accessToken() {
  try {
    const { getSession } = await import("../auth.js");
    const s = await getSession();
    return s?.access_token || null;
  } catch { return null; }
}

/**
 * Demande une analyse au backend PokerForge (§4/§5).
 * Le payload ne contient QUE le HandState normalisé + les données solveur :
 * jamais de hand history brute, jamais de clé, jamais de données de compte.
 *
 * @returns {Promise<{ok:true, analysis, meta}|{ok:false, error}>}
 */
export async function requestAnalysis({ handState, solverData, analysisMode = "decision",
                                        step = null, language = "fr", timeoutMs = DEFAULT_TIMEOUT,
                                        fetchImpl, tokenProvider } = {}) {
  if (!ANALYSIS_MODES.includes(analysisMode)) return aiError("INVALID_INPUT");
  if (!handState) return aiError("INVALID_INPUT");

  /* §4 — un spot incohérent ne part pas au modèle. On journalise pour le
     diagnostic et on affiche un état contrôlé. */
  const pre = preflightCheck({ solverData, analysisMode });
  if (!pre.ok) {
    try { console.warn("[PokerForge] PokerState incohérent — analyse suspendue :", pre.errors); } catch { /* noop */ }
    return aiError("INCOHERENT_STATE", { detail: pre.errors.slice(0, 3).join(" · ") });
  }

  const token = await (tokenProvider || accessToken)();
  if (!token) return aiError("UNAUTHENTICATED");

  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) return aiError("NETWORK");

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await doFetch(supabaseFunctionUrl("analyze-hand"), {
      method: "POST",
      headers: supabaseAnonHeaders({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
      body: JSON.stringify({
        handId: handState.handId, analysisMode, step, language,
        clientVersion: CLIENT_VERSION,
        handState, solverData,
      }),
      signal: ctrl?.signal,
    });
    if (timer) clearTimeout(timer);
    let payload = {};
    try { payload = await res.json(); } catch { payload = {}; }
    if (!res.ok) return mapServerError(res.status, payload);
    if (payload.ok === false) return mapServerError(200, payload);
    const check = validateAnalysis(payload.analysis);
    if (!check.valid) return aiError("INVALID_OUTPUT", { detail: check.errors.slice(0, 3).join(", ") });

    /* §5/§7 — dernière barrière AVANT l'affichage. Le backend a déjà rejeté et
       régénéré ; ce second passage protège contre une version de fonction plus
       ancienne encore déployée, et rend la garde testable côté client. */
    const fact = validateAiResponse(payload.analysis, {
      pokerState: solverData?.target?.pokerState || null, solverData,
    });
    if (!fact.valid) {
      try { console.warn("[PokerForge] Réponse IA rejetée :", fact.errors); } catch { /* noop */ }
      return aiError("FABRICATED_DATA", { detail: fact.errors.slice(0, 2).join(" · ") });
    }
    return { ok: true, analysis: payload.analysis, meta: payload.meta || {} };
  } catch (e) {
    if (timer) clearTimeout(timer);
    if (e && e.name === "AbortError") return aiError("TIMEOUT");
    return aiError("NETWORK");
  }
}

/**
 * Analyse avec cache (§20/§28) : une main déjà analysée dans la même version
 * de solveur/prompt/mode n'est jamais repayée.
 */
export async function analyzeWithCache(params = {}) {
  const { handState, analysisMode = "decision", step = null, force = false, store = defaultStore() } = params;
  const key = analysisCacheKey({ handId: handState?.handId, analysisMode, step });
  if (!force) {
    const hit = getCachedAnalysis(key, store);
    if (hit?.analysis) return { ok: true, analysis: hit.analysis, meta: { ...(hit.meta || {}), cache: "HIT", key } };
  }
  const res = await requestAnalysis(params);
  if (res.ok) {
    putCachedAnalysis(key, {
      handId: handState?.handId || null, analysisMode, step,
      analysis: res.analysis, meta: { ...res.meta, cache: "MISS" },
    }, store);
    return { ...res, meta: { ...res.meta, cache: "MISS", key } };
  }
  return res;
}
