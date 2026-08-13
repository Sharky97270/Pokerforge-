// ══════════════════════════════════════════════════════════════════════════
// PokerForge — edge function « analyze-hand »
//
// ENDPOINT D'ANALYSE IA DU REPLAYER (cahier des charges §4 → §27).
//
//   Browser → PokerForge backend (ce fichier) → OpenAI → backend → Browser
//
// Le navigateur n'a JAMAIS la clé : elle vit ici, dans le secret d'environnement
// OPENAI_API_KEY (déjà utilisé par les autres fonctions PokerForge).
//
// RÈGLE ABSOLUE (§1/§9) : « LE SOLVEUR CALCULE. L'IA EXPLIQUE. »
// Les fréquences, EV et équités arrivent DÉJÀ CALCULÉES dans `solverData`.
// Le modèle n'a pas le droit d'en produire : le schéma de sortie ne contient
// aucun champ numérique de stratégie, et l'UI affiche les chiffres depuis
// `solverData`, pas depuis le texte du modèle.
//
// Sécurité : auth obligatoire (§22), validation stricte du payload (§23),
// rate limit serveur configurable (§21), logs sans secret (§24), estimation
// de coût (§25), prompt versionné (§26).
// ══════════════════════════════════════════════════════════════════════════
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Versions (§26) : toute analyse enregistre celles qui l'ont produite ──
const PROMPT_VERSION = "pokerforge-hand-analysis-v1";
const FUNCTION_VERSION = "analyze-hand-1.0.0";
const DEFAULT_MODEL = "gpt-4.1-mini";

// Tarifs USD / million de tokens — sert UNIQUEMENT à estimer un coût interne (§25).
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4.1-mini": { in: 0.40, out: 1.60 },
  "gpt-4.1": { in: 2.00, out: 8.00 },
  "gpt-4o-mini": { in: 0.15, out: 0.60 },
  "gpt-4o": { in: 2.50, out: 10.00 },
};

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extra },
  });
}
function fail(code: string, status: number, extra: Record<string, unknown> = {}) {
  // §18 : jamais de stack trace ni de message fournisseur brut vers le client.
  return json({ ok: false, code, ...extra }, status);
}

// ══════════════════════════════════════════════════════════════════════════
// §22 — AUTHENTIFICATION : un utilisateur PokerForge connecté, pas la clé anon.
// ══════════════════════════════════════════════════════════════════════════
function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
function jwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const pad = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(pad + "=".repeat((4 - pad.length % 4) % 4)));
  } catch { return null; }
}
async function authenticate(req: Request): Promise<{ userId: string; email: string | null } | null> {
  const token = bearer(req);
  if (!token) return null;
  const claims = jwtClaims(token);
  // La clé anon est un JWT valide de rôle "anon" : elle ne vaut PAS une session.
  if (!claims || claims.role !== "authenticated" || !claims.sub) return null;

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u?.id) return null;
    return { userId: String(u.id), email: u.email ? String(u.email) : null };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════
// §21 — RATE LIMIT serveur (fenêtre glissante, quotas configurables).
// Best-effort par instance : protège du spam bouton, des boucles frontend et
// des appels parallèles accidentels. Pour un quota strict multi-instances,
// brancher une table Postgres (voir docs/replayer/AI_ANALYSIS.md).
// ══════════════════════════════════════════════════════════════════════════
const HITS = new Map<string, number[]>();
function rateLimit(userId: string, premium: boolean) {
  const windowMs = num(Deno.env.get("PF_AI_RATE_WINDOW_S"), 60) * 1000;
  const max = premium
    ? num(Deno.env.get("PF_AI_RATE_PREMIUM"), 20)
    : num(Deno.env.get("PF_AI_RATE_STANDARD"), 6);
  const now = Date.now();
  const arr = (HITS.get(userId) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    HITS.set(userId, arr);
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000), max };
  }
  arr.push(now);
  HITS.set(userId, arr);
  if (HITS.size > 5000) HITS.clear();          // garde-fou mémoire
  return { allowed: true, retryAfter: 0, max };
}

// ══════════════════════════════════════════════════════════════════════════
// §23 — VALIDATION DU PAYLOAD (réplique serveur de validateHandState).
// ══════════════════════════════════════════════════════════════════════════
const CARD_RE = /^(?:10|[2-9TJQKA])[shdc]$/;
const POS_RE = /^(?:UTG|UTG\+1|UTG\+2|MP|MP\+1|HJ|LJ|CO|BTN|SB|BB|\?)$/;
const ACTIONS = ["post", "fold", "check", "call", "bet", "raise", "allin", "deal", "showdown", "end"];

function validateHandState(hs: any): string[] {
  const e: string[] = [];
  const isNum = (v: any) => typeof v === "number" && Number.isFinite(v);
  if (!hs || typeof hs !== "object") return ["handState absent"];
  if (!hs.handId || String(hs.handId).length > 80) e.push("handId invalide");
  if (!hs.site || String(hs.site).length > 40) e.push("site invalide");
  if (!["MTT", "Cash"].includes(hs.format)) e.push("format invalide");
  if (!isNum(hs.tableSize) || hs.tableSize < 2 || hs.tableSize > 10) e.push("tableSize hors bornes");
  if (!hs.hero) e.push("hero absent");
  else {
    if (!POS_RE.test(String(hs.hero.position))) e.push("position Hero invalide");
    if (!Array.isArray(hs.hero.cards) || hs.hero.cards.length > 2) e.push("cartes Hero invalides");
    else if (hs.hero.cards.some((c: any) => !CARD_RE.test(String(c)))) e.push("format de carte Hero invalide");
    if (!isNum(hs.hero.stackBB) || hs.hero.stackBB < 0 || hs.hero.stackBB > 100000) e.push("stack Hero hors bornes");
  }
  if (!Array.isArray(hs.players) || hs.players.length < 2 || hs.players.length > 10) e.push("players hors bornes");
  if (!Array.isArray(hs.actions)) e.push("actions absentes");
  else if (hs.actions.length > 400) e.push("trop d'actions");
  else if (hs.actions.some((a: any) => !ACTIONS.includes(a?.action))) e.push("type d'action inconnu");
  const b = hs.board || {};
  const board = [...(b.flop || []), b.turn, b.river].filter(Boolean);
  if (board.length > 5) e.push("board > 5 cartes");
  if (board.some((c: any) => !CARD_RE.test(String(c)))) e.push("format de carte board invalide");
  if (b.flop && b.flop.length !== 3) e.push("flop incomplet");
  if (b.turn && !b.flop) e.push("turn sans flop");
  if (b.river && !b.turn) e.push("river sans turn");
  if (!isNum(hs.potBB) || hs.potBB < 0) e.push("pot invalide");
  return e;
}

// ══════════════════════════════════════════════════════════════════════════
// §10 — SCHÉMA DE SORTIE STRICT. Aucun champ de fréquence/EV/équité : le modèle
// ne peut PAS renvoyer de chiffre stratégique, même s'il le voulait.
// ══════════════════════════════════════════════════════════════════════════
const streetSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["good", "neutral", "mistake", "not_played"] },
    analysis: { type: "string" },
  },
  required: ["status", "analysis"],
  additionalProperties: false,
};
const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    verdict: {
      type: "object",
      properties: {
        rating: { type: "string", enum: ["excellent", "good", "neutral", "mistake", "blunder"] },
        heroAction: { type: "string" },
        preferredAction: { type: "string" },
        rationale: { type: "string" },
      },
      required: ["rating", "heroAction", "preferredAction", "rationale"],
      additionalProperties: false,
    },
    streets: {
      type: "object",
      properties: { preflop: streetSchema, flop: streetSchema, turn: streetSchema, river: streetSchema },
      required: ["preflop", "flop", "turn", "river"],
      additionalProperties: false,
    },
    keyConcepts: { type: "array", items: { type: "string" } },
    detectedLeaks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          street: { type: "string", enum: ["preflop", "flop", "turn", "river"] },
          description: { type: "string" },
        },
        required: ["type", "severity", "street", "description"],
        additionalProperties: false,
      },
    },
    coachAdvice: { type: "string" },
    dataGaps: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "verdict", "streets", "keyConcepts", "detectedLeaks", "coachAdvice", "dataGaps"],
  additionalProperties: false,
};

// ══════════════════════════════════════════════════════════════════════════
// §9 — PROMPT SYSTÈME : règle anti-hallucination.
// ══════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Tu es PokerForge AI Coach.

Les données solveur fournies sont la SEULE source quantitative de vérité.

Tu n'es pas autorisé à inventer une fréquence, une EV, une équité, une range
exacte, une stratégie de solveur ou une valeur ICM. Tu ne produis JAMAIS de
nouveau nombre : tu ne peux citer que des valeurs présentes dans les données
transmises, et uniquement en les nommant telles quelles.

Lorsqu'une information mathématique est absente ou marquée indisponible, tu
l'indiques explicitement (champ dataGaps) au lieu de l'estimer.

Quand la provenance d'une valeur est HEURISTIC, tu la présentes comme une
estimation PokerForge et jamais comme un résultat GTO.

Tu peux : interpréter les données, expliquer les mécanismes poker, identifier
les erreurs stratégiques, comparer les décisions et produire du coaching clair.

Ne présente jamais une estimation linguistique comme un résultat GTO.
Réponds en français, ton direct et pédagogique, sans flatterie.
Une street non jouée a le statut "not_played" et une analyse vide.`;

function userPrompt(body: any) {
  const mode = body.analysisMode === "full_hand" ? "TOUTE LA MAIN" : "LA DÉCISION HERO CIBLÉE";
  const sd = body.solverData || {};
  const lines = [
    `MODE D'ANALYSE : ${mode}.`,
    body.analysisMode === "decision" && sd.target
      ? `Décision ciblée : street ${sd.target.street}, action jouée « ${sd.target.playedLabel || sd.target.played} », provenance ${sd.target.source}.`
      : "Analyse chaque street effectivement jouée, puis conclus.",
    `Niveau de confiance des données : ${sd.level ?? "?"} (${sd.levelLabel ?? "inconnu"}).`,
    sd.disclaimer ? `AVERTISSEMENT À RESPECTER : ${sd.disclaimer}` : "",
    "",
    "── HANDSTATE NORMALISÉ ──",
    JSON.stringify(body.handState),
    "",
    "── DONNÉES SOLVEUR (source quantitative de vérité) ──",
    JSON.stringify(sd),
  ].filter(Boolean);
  return lines.join("\n");
}

// Extraction du JSON de la Responses API (output_text, sinon parcours de output).
function extractJson(payload: any): any | null {
  const direct = typeof payload?.output_text === "string" ? payload.output_text : null;
  let raw = direct;
  if (!raw && Array.isArray(payload?.output)) {
    for (const item of payload.output) {
      for (const c of item?.content || []) {
        if (typeof c?.text === "string") { raw = c.text; break; }
      }
      if (raw) break;
    }
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function validateAnalysis(a: any): string[] {
  const e: string[] = [];
  if (!a || typeof a !== "object") return ["réponse vide"];
  if (typeof a.summary !== "string" || !a.summary.trim()) e.push("summary manquant");
  if (!a.verdict || !["excellent", "good", "neutral", "mistake", "blunder"].includes(a.verdict?.rating)) e.push("verdict invalide");
  for (const s of ["preflop", "flop", "turn", "river"]) {
    if (!["good", "neutral", "mistake", "not_played"].includes(a.streets?.[s]?.status)) e.push(`street ${s} invalide`);
  }
  if (!Array.isArray(a.keyConcepts)) e.push("keyConcepts manquant");
  if (!Array.isArray(a.detectedLeaks)) e.push("detectedLeaks manquant");
  if (typeof a.coachAdvice !== "string") e.push("coachAdvice manquant");
  return e;
}

// ══════════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("METHOD", 405);

  const t0 = Date.now();
  const key = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("PF_AI_MODEL") || DEFAULT_MODEL;

  let body: any = {};
  try { body = await req.json(); } catch { return fail("INVALID_INPUT", 400, { detail: "corps illisible" }); }

  // Sonde de disponibilité (aucun appel payant, aucune donnée exposée).
  if (body.ping) return json({ ok: true, hasKey: !!key, promptVersion: PROMPT_VERSION, version: FUNCTION_VERSION });

  // §22 — auth obligatoire AVANT tout appel externe payant.
  const user = await authenticate(req);
  if (!user) return fail("UNAUTHENTICATED", 401);

  // §21 — rate limit.
  const premium = body.tier === "premium";
  const rl = rateLimit(user.userId, premium);
  if (!rl.allowed) return fail("RATE_LIMIT", 429, { retryAfter: rl.retryAfter });

  // §23 — validation.
  const mode = body.analysisMode === "full_hand" ? "full_hand" : "decision";
  const errs = validateHandState(body.handState);
  if (errs.length) return fail("INVALID_INPUT", 400, { detail: errs.slice(0, 4).join(", ") });
  const payloadSize = JSON.stringify(body.handState || {}).length + JSON.stringify(body.solverData || {}).length;
  if (payloadSize > 120_000) return fail("INVALID_INPUT", 413, { detail: "payload trop volumineux" });

  if (!key) return fail("NO_KEY", 503);

  // ── Appel fournisseur : OpenAI Responses API, sortie JSON strictement typée ──
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), num(Deno.env.get("PF_AI_TIMEOUT_MS"), 40000));
  let payload: any = null;
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt({ ...body, analysisMode: mode }) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "pokerforge_hand_analysis",
            schema: ANALYSIS_SCHEMA,
            strict: true,
          },
        },
        max_output_tokens: mode === "full_hand" ? 1600 : 900,
      }),
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      // §24 : on journalise le code fournisseur, jamais la clé ni l'en-tête d'auth.
      console.error(JSON.stringify({
        evt: "provider_error", status: r.status, model,
        user: user.userId.slice(0, 8), detail: detail.slice(0, 200),
      }));
      if (r.status === 429) return fail("RATE_LIMIT", 429, { retryAfter: 30 });
      return fail("PROVIDER", 502);
    }
    payload = await r.json();
  } catch (e) {
    clearTimeout(timeout);
    const aborted = (e as Error)?.name === "AbortError";
    console.error(JSON.stringify({ evt: aborted ? "provider_timeout" : "provider_neterr", model }));
    return fail(aborted ? "TIMEOUT" : "PROVIDER", aborted ? 504 : 502);
  }

  const analysis = extractJson(payload);
  const bad = validateAnalysis(analysis);
  if (bad.length) {
    console.error(JSON.stringify({ evt: "invalid_output", model, errors: bad.slice(0, 4) }));
    return fail("INVALID_OUTPUT", 502);
  }

  // §25 — estimation de coût interne.
  const usage = payload?.usage || {};
  const inTok = Number(usage.input_tokens || 0);
  const outTok = Number(usage.output_tokens || 0);
  const price = PRICING[model];
  const costUsd = price ? Math.round(((inTok * price.in + outTok * price.out) / 1e6) * 1e6) / 1e6 : null;

  // §24 — log technique sans aucun secret.
  console.log(JSON.stringify({
    evt: "analysis_ok",
    ts: new Date().toISOString(),
    user: user.userId.slice(0, 8),
    handId: String(body.handId || body.handState?.handId || "").slice(0, 40),
    mode, provider: "openai", model,
    promptVersion: PROMPT_VERSION,
    solverVersion: body.solverData?.solverVersion || null,
    solverLevel: body.solverData?.level ?? null,
    durationMs: Date.now() - t0,
    inputTokens: inTok, outputTokens: outTok,
    costUsd, cache: "MISS", status: "ok",
  }));

  return json({
    ok: true,
    analysis,
    meta: {
      provider: "openai", model,
      promptVersion: PROMPT_VERSION,
      functionVersion: FUNCTION_VERSION,
      solverVersion: body.solverData?.solverVersion || null,
      analysisMode: mode,
      durationMs: Date.now() - t0,
      usage: { inputTokens: inTok, outputTokens: outTok },
      costUsd,
      rateLimit: { max: rl.max, tier: premium ? "premium" : "standard" },
      createdAt: new Date().toISOString(),
    },
  });
});
