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
// v2 : distinction EV / fréquence d'équilibre.
// v3 : le modèle reçoit un POKER STATE normalisé — action sémantique de Hero
//      (FOLD_TO_OPEN, THREE_BET, CHECK_RAISE…), action affrontée, options
//      légales, provenance. Il n'a plus à reconstruire le coup depuis du texte,
//      et une garde rejette toute valeur numérique absente des données.
//      Changer cette version invalide le cache (§20).
const PROMPT_VERSION = "pokerforge-hand-analysis-v3";
const FUNCTION_VERSION = "analyze-hand-2.1.0";
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

// §3 — vocabulaire fermé des actions. Le modèle CHOISIT dans cette liste ; il
// ne rédige pas le nom de l'action, donc il ne peut pas écrire « open » là où
// PokerForge a calculé « 3-bet ».
const SEMANTIC_ACTIONS = [
  "OPEN_RAISE", "LIMP", "OVERLIMP", "ISO_RAISE", "CALL_OPEN", "THREE_BET",
  "CALL_THREE_BET", "FOUR_BET", "CALL_FOUR_BET", "FIVE_BET", "FOLD_TO_OPEN",
  "FOLD_TO_THREE_BET", "FOLD_TO_FOUR_BET", "CHECK_OPTION", "CHECK", "BET",
  "DONK_BET", "CALL_BET", "RAISE_BET", "CHECK_RAISE", "CALL_RAISE", "RERAISE",
  "FOLD_TO_BET", "FOLD_TO_RAISE", "ALL_IN", "FOLD", "UNKNOWN",
];

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    // §7 — les deux actions sont des ÉNUMÉRATIONS, pas du texte libre.
    heroAction: { type: "string", enum: SEMANTIC_ACTIONS },
    recommendedAction: { type: "string", enum: SEMANTIC_ACTIONS },
    strategicReason: { type: "string" },
    observation: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    warnings: { type: "array", items: { type: "string" } },
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
  required: [
    "summary", "heroAction", "recommendedAction", "strategicReason", "observation",
    "confidence", "warnings", "verdict", "streets", "keyConcepts", "detectedLeaks",
    "coachAdvice", "dataGaps",
  ],
  additionalProperties: false,
};

// ══════════════════════════════════════════════════════════════════════════
// §9 — PROMPT SYSTÈME : règle anti-hallucination.
// ══════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Tu es PokerForge AI Coach.

═══ RÈGLE FONDAMENTALE ═══
LE MOTEUR CALCULE ET DÉCRIT LE SPOT. TU EXPLIQUES.
TU NE RECONSTRUIS JAMAIS LE COUP.

Le bloc POKER STATE décrit la main : positions, historique, dernier agresseur,
action que Hero affronte, action qu'il a choisie, options légales. Ces faits
sont ÉTABLIS. Tu ne les redéduis pas, tu ne les contredis pas, tu ne les
complètes pas. Si un fait n'y figure pas, il est INCONNU — dis-le.

═══ 1. VOCABULAIRE DES ACTIONS ═══
Le nom de chaque action est DÉJÀ CALCULÉ. Emploie exactement celui-là.
  • pokerState.heroAction        = ce que Hero a fait
  • pokerState.facingAction      = ce qu'il affrontait
  • solverData.target.recommendedSemantic = l'action recommandée
Les champs heroAction et recommendedAction de ta réponse doivent REPRODUIRE
ces valeurs à l'identique. Tu ne les choisis pas.

En mode TOUTE LA MAIN, le bloc « DÉCISIONS HERO » liste chaque décision avec
son nom déjà calculé : n'attribue à Hero aucune action absente de cette liste.

Conséquences, sans exception :
  • Hero affronte OPEN_RAISE → il ne peut PAS « ouvrir ». Ses options sont
    fold, call, ou 3-bet. N'écris jamais « ouvrir » ni « open » dans ce cas.
  • Hero affronte THREE_BET → fold, call, ou 4-bet.
  • Une relance face à une mise est un raise (ou un check-raise), pas un bet.
  • Payer une mise est un call, pas un bet.
Utilise la traduction française fournie (heroActionFr, facingActionFr).

═══ 2. AUCUN NOMBRE INVENTÉ ═══
Tu ne produis JAMAIS un nombre. Tu ne peux CITER que des valeurs présentes
dans les données transmises : sizing, stack, pot, cote, équité, EV, fréquence,
nombre de joueurs. Une réponse contenant une valeur absente des données est
rejetée automatiquement et l'analyse est perdue.

En particulier, si le sizing recommandé n'est pas fourni
(recommendedSizingBb = null), n'en propose AUCUN. Écris par exemple :
« Le 3-bet est préféré selon les données disponibles ; le sizing exact n'est
pas disponible pour ce spot. »

Une équité n'a de sens qu'attachée à SA street : ne transpose jamais l'équité
d'une street à une autre.

Tu n'inventes pas non plus : une action adverse, une position, un profil de
vilain, une range précise, un nombre de joueurs, ni une lecture de solveur.

═══ 3. PROVENANCE : LE TON SUIT LA DONNÉE ═══
solverData.target.origin dicte la formulation :
  • SOLVER_EXACT / SOLVER_LOOKUP  → « La solution calculée indique… »
  • SOLVER_APPROXIMATION (CFR)    → « Le calcul CFR indique… », en précisant
    que les ranges d'entrée restent estimées : ce n'est pas un solve GTO complet.
  • POKERFORGE_HEURISTIC          → « Selon l'estimation PokerForge disponible
    pour ce spot… ». JAMAIS présenté comme une vérité GTO.
  • UNAVAILABLE                   → « Les données disponibles ne permettent pas
    d'établir cette conclusion avec suffisamment de fiabilité. »

strategyScope compte autant : "range" signifie que les fréquences décrivent le
mix de TOUTE la range à ce nœud, PAS la stratégie de la main précise de Hero.
Dans ce cas, ne dis jamais « tu dois fold X % du temps avec cette main ».

Deux mesures d'écart, à ne jamais confondre :
  • metric "ev"        → une perte d'EV en big blinds ;
  • metric "frequency" → un écart à la fréquence d'équilibre, en points de
    pourcentage. Ici on ne parle NI d'EV perdue NI de bb.

═══ 4. QUALITÉ PÉDAGOGIQUE ═══
Ton explication doit répondre, dans cet ordre : quel était le contexte exact ?
qu'a fait Hero ? quelle action est recommandée et pourquoi ? en quoi consiste
l'erreur stratégique s'il y en a une ? quel principe généraliser ? que
travailler ensuite ?

Interdit : « cette main a une bonne équité » sans raison stratégique
supplémentaire, et toute généralité qui vaudrait pour n'importe quelle main.
Emploie le vocabulaire précis (open, flat, 3-bet, 4-bet, c-bet, check-raise,
donk bet, avantage de range, avantage de nuts, MDF, cote du pot, réalisation
d'équité, blockers, construction de range) UNIQUEMENT quand les données
permettent réellement de l'affirmer.

═══ 5. EN CAS DE DOUTE ═══
Signale-le explicitement (champs warnings et dataGaps) plutôt que de compléter
par une supposition. Une incertitude annoncée est un bon coaching ; une
affirmation inventée détruit la confiance.

Réponds en français, ton direct et pédagogique, sans flatterie.
Une street non jouée a le statut "not_played" et une analyse vide.`;

// Les faits saillants sont énoncés EN CLAIR avant le JSON : un modèle suit
// beaucoup mieux une contrainte écrite en toutes lettres qu'un champ noyé dans
// un objet de 3 ko. Le JSON reste là pour l'exhaustivité.
function spotBriefing(ps: any, target: any): string[] {
  if (!ps) return ["(Aucune description sémantique disponible pour cette décision.)"];
  const out = [
    "── FAITS ÉTABLIS PAR LE MOTEUR — NE PAS LES RECALCULER ──",
    `Street : ${ps.street}${ps.board?.length ? ` · board ${ps.board.join(" ")}` : ""}`,
    `Hero : ${ps.hero?.position}${ps.hero?.cards?.length ? ` avec ${ps.hero.cards.join("")}` : " (cartes inconnues)"} · ${ps.hero?.inPosition === true ? "en position" : ps.hero?.inPosition === false ? "hors de position" : "position relative inconnue"}`,
    `Joueurs encore dans le coup : ${ps.playersInHand} (table ${ps.tableSize}).`,
  ];
  if (ps.lastAggressor) {
    out.push(`Dernier agresseur : ${ps.lastAggressor.position} — ${ps.lastAggressor.semantic} (${ps.lastAggressor.semanticFr}) à ${ps.lastAggressor.toAmountBB}bb.`);
  } else if (ps.limpers?.length) {
    out.push(`Aucune relance : ${ps.limpers.length} limp(s) — ${ps.limpers.join(", ")}.`);
  } else {
    out.push("Pot non ouvert : personne n'a encore misé volontairement.");
  }
  out.push(
    ps.facingAction
      ? `HERO AFFRONTE : ${ps.facingAction} (${ps.facingActionFr}).`
      : "HERO N'AFFRONTE AUCUNE MISE.",
    `ACTION JOUÉE PAR HERO : ${ps.heroAction} (${ps.heroActionFr}). Recopie cette valeur dans heroAction.`,
    `OPTIONS LÉGALES À CE NŒUD : ${(ps.legalActions || []).join(", ")}. Aucune autre action n'existe ici.`,
    ps.toCallBB > 0
      ? `À payer : ${ps.toCallBB}bb dans un pot de ${ps.potBB}bb${ps.potOddsPct != null ? ` (cote du pot ${ps.potOddsPct} %)` : ""}.`
      : `Rien à payer. Pot : ${ps.potBB}bb.`,
    ps.effectiveStackBB != null ? `Tapis effectif : ${ps.effectiveStackBB}bb.` : "Tapis effectif : non disponible.",
  );
  if (target?.recommendedSemantic) {
    out.push(`ACTION RECOMMANDÉE PAR POKERFORGE : ${target.recommendedSemantic} (${target.recommendedSemanticFr}). Recopie cette valeur dans recommendedAction.`);
  } else {
    out.push("ACTION RECOMMANDÉE : indisponible — dis-le explicitement au lieu d'en choisir une.");
  }
  out.push(
    target?.recommendedSizingBb != null
      ? `Sizing recommandé : ${target.recommendedSizingBb}bb`
        + (target.recommendedSizingOrigin === "POKERFORGE_HEURISTIC"
          ? " — sizing CONVENTIONNEL calculé depuis la mise réelle de l'adversaire, pas une lecture de solveur : présente-le comme un repère usuel, pas comme la taille optimale."
          : ".")
      : "Sizing recommandé : NON DISPONIBLE — n'en invente aucun, indique qu'il n'est pas disponible.",
  );
  if (ps.actionHistory?.length) {
    out.push("Historique complet :");
    for (const a of ps.actionHistory) {
      out.push(`  · ${a.street} — ${a.position}${a.isHero ? " (Hero)" : ""} : ${a.semantic}${a.toAmountBB != null ? ` → ${a.toAmountBB}bb` : ""}`);
    }
  }
  return out;
}

// Mode « main complète » : les faits établis de CHAQUE décision Hero. Sans ce
// bloc, le modèle recevait le JSON brut et redevenait libre de nommer les
// actions lui-même — exactement ce qu'on interdit en mode décision. Les noms
// viennent du même moteur validé ; le modèle les recopie.
function decisionsBriefing(sd: any): string[] {
  const ds = Array.isArray(sd?.decisions) ? sd.decisions : [];
  if (!ds.length) return ["(Aucune décision Hero évaluable dans cette main.)"];
  const out = ["── DÉCISIONS HERO — FAITS ÉTABLIS PAR LE MOTEUR, NE PAS LES RECALCULER ──"];
  ds.forEach((d: any, i: number) => {
    const bits = [
      `${i + 1}. ${d.street}`,
      d.heroPosition ? `Hero ${d.heroPosition}` : null,
      d.facingAction
        ? `face à ${d.facingAction} (${d.facingActionFr})${d.aggressorPosition ? ` de ${d.aggressorPosition}${d.aggressorToBb != null ? ` à ${d.aggressorToBb}bb` : ""}` : ""}`
        : "sans mise à suivre",
      `A JOUÉ : ${d.heroSemantic || d.played} (${d.heroSemanticFr || d.playedLabel})`,
      d.recommendedSemantic
        ? `RECOMMANDÉ : ${d.recommendedSemantic} (${d.recommendedSemanticFr})`
        : "RECOMMANDÉ : indisponible — dis-le",
      d.recommendedSizingBb != null ? `sizing ${d.recommendedSizingBb}bb (repère usuel)` : "sizing non disponible",
      d.legalActions?.length ? `options légales : ${d.legalActions.join(", ")}` : null,
      `provenance ${d.source}`,
      d.metric === "frequency"
        ? (d.freqGapPts != null ? `écart à l'équilibre ${d.freqGapPts} pts` : "écart non chiffré")
        : (d.evLossBB != null ? `EV perdue estimée ${d.evLossBB}bb` : "EV perdue non chiffrée"),
    ].filter(Boolean);
    out.push("  · " + bits.join(" · "));
  });
  out.push("Emploie EXACTEMENT ces noms d'action. N'en invente aucun autre, et n'attribue à Hero aucune action absente de cette liste.");
  return out;
}

function userPrompt(body: any) {
  const mode = body.analysisMode === "full_hand" ? "TOUTE LA MAIN" : "LA DÉCISION HERO CIBLÉE";
  const sd = body.solverData || {};
  const ps = sd.target?.pokerState || null;
  const lines = [
    `MODE D'ANALYSE : ${mode}.`,
    body.analysisMode === "decision"
      ? ""
      : "Analyse chaque street effectivement jouée, puis conclus.",
    "",
    ...(body.analysisMode === "decision" ? spotBriefing(ps, sd.target) : decisionsBriefing(sd)),
    "",
    "── PROVENANCE ET TON IMPOSÉ ──",
    sd.target?.origin
      ? `Provenance : ${sd.target.origin}. Formulation imposée : « ${sd.target.originPhrase} … ».`
      : `Niveau de confiance des données : ${sd.level ?? "?"} (${sd.levelLabel ?? "inconnu"}).`,
    sd.target?.strategyScope === "range"
      ? "PORTÉE : les fréquences décrivent le mix de la RANGE ENTIÈRE à ce nœud, pas la stratégie de la main précise de Hero. Ne les attribue pas à sa main."
      : sd.target?.strategyScope === "hand"
        ? "PORTÉE : les fréquences valent pour la main (ou la classe de main) de Hero."
        : "",
    sd.target?.metric === "frequency"
      ? "MESURE : pour cette décision le solveur fournit des FRÉQUENCES d'équilibre, pas des EV. N'écris jamais « EV perdue » ni un chiffre en bb pour cette décision ; parle d'écart à la fréquence d'équilibre."
      : "",
    sd.equity?.street
      ? `ÉQUITÉ : la valeur fournie vaut pour la street ${sd.equity.street} uniquement.`
      : "",
    sd.disclaimer ? `AVERTISSEMENT À RESPECTER : ${sd.disclaimer}` : "",
    "",
    "── VALEURS CITABLES ──",
    "Tu ne peux citer AUCUN nombre absent des deux blocs JSON ci-dessous.",
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
// §4 — COHÉRENCE DU SPOT (réplique serveur de validatePokerState).
// Le frontend fait déjà ce contrôle ; le refaire ici garantit qu'aucun client
// modifié ou périmé ne peut pousser un état incohérent jusqu'au modèle.
// ══════════════════════════════════════════════════════════════════════════
const FACING_MATRIX: Record<string, string[]> = {
  OPEN_RAISE: ["FOLD_TO_OPEN", "CALL_OPEN", "THREE_BET"],
  ISO_RAISE: ["FOLD_TO_OPEN", "CALL_OPEN", "THREE_BET"],
  THREE_BET: ["FOLD_TO_THREE_BET", "CALL_THREE_BET", "FOUR_BET"],
  FOUR_BET: ["FOLD_TO_FOUR_BET", "CALL_FOUR_BET", "FIVE_BET"],
  FIVE_BET: ["FOLD_TO_FOUR_BET", "CALL_FOUR_BET"],
  LIMP: ["FOLD", "OVERLIMP", "LIMP", "ISO_RAISE", "CHECK_OPTION"],
  BET: ["FOLD_TO_BET", "CALL_BET", "RAISE_BET", "CHECK_RAISE"],
  DONK_BET: ["FOLD_TO_BET", "CALL_BET", "RAISE_BET", "CHECK_RAISE"],
  RAISE_BET: ["FOLD_TO_RAISE", "CALL_RAISE", "RERAISE"],
  CHECK_RAISE: ["FOLD_TO_RAISE", "CALL_RAISE", "RERAISE"],
  RERAISE: ["FOLD_TO_RAISE", "CALL_RAISE", "RERAISE"],
  CHECK: ["CHECK", "BET", "DONK_BET"],
};
const CALL_ACTIONS = ["LIMP", "OVERLIMP", "CALL_OPEN", "CALL_THREE_BET", "CALL_FOUR_BET", "CALL_BET", "CALL_RAISE"];

function validatePokerStateServer(ps: any, mode: string): string[] {
  // Une main hors périmètre (pas de description sémantique) n'est pas une
  // erreur : le prompt saura qu'il n'a pas de faits établis à recopier.
  if (mode !== "decision" || !ps) return [];
  const e: string[] = [];
  const facingBet = (ps.toCallBB ?? 0) > 1e-4;
  const legal: string[] = ps.legalActions || [];

  if (facingBet && (legal.includes("CHECK") || legal.includes("CHECK_OPTION")))
    e.push("CHECK proposé alors qu'une mise est à suivre");
  if (!facingBet) {
    const c = legal.find((a) => CALL_ACTIONS.includes(a));
    if (c) e.push(`CALL (${c}) proposé alors qu'il n'y a rien à payer`);
  }
  if (ps.heroAction === "OPEN_RAISE" && ps.betLevel > 1)
    e.push(`OPEN_RAISE annoncé alors que le pot est déjà ouvert (betLevel ${ps.betLevel})`);
  if (ps.heroAction === "THREE_BET" && ps.betLevel !== 2)
    e.push(`THREE_BET annoncé hors d'un pot ouvert une fois (betLevel ${ps.betLevel})`);
  if (ps.heroAction && ps.heroAction !== "UNKNOWN" && legal.length && !legal.includes(ps.heroAction))
    e.push(`action Hero ${ps.heroAction} hors des options légales`);
  if (ps.facingAction && FACING_MATRIX[ps.facingAction]) {
    const allowed = FACING_MATRIX[ps.facingAction];
    for (const a of legal) if (!allowed.includes(a)) e.push(`${a} impossible face à ${ps.facingAction}`);
  }
  const need: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
  if (need[ps.street] != null && ps.boardCount !== need[ps.street])
    e.push(`board ${ps.boardCount} cartes pour ${ps.street}`);
  return [...new Set(e)];
}

// ══════════════════════════════════════════════════════════════════════════
// §5/§7 — GARDE ANTI-INVENTION (réplique serveur de pokerStateValidator.js).
//
// Le schéma interdit les champs numériques ; il n'interdit pas au modèle
// d'écrire « 3-bet à 7bb » DANS SA PROSE. C'était le bug de production. On
// inventorie donc les nombres réellement transmis et on rejette tout nombre
// PORTEUR D'UNE UNITÉ (bb, %, x) absent de cet inventaire.
// ══════════════════════════════════════════════════════════════════════════
// Clés dont la valeur n'est pas une quantité de poker : indices d'événements,
// sièges, compteurs internes. Les inclure autorisait des montants arbitraires
// (un `step: 7` rendait « 7bb » citable).
const NON_QUANTITY_KEY = /^(?:step|seat|order|index|betLevel|level|samples|solveMs|durationMs|nashConv|boardCount|createdAt|_.*)$/i;

function collectNumbers(obj: any, out: Set<number>, depth = 0): Set<number> {
  if (depth > 8 || obj == null) return out;
  if (typeof obj === "number") { if (Number.isFinite(obj)) out.add(obj); return out; }
  if (Array.isArray(obj)) { for (const v of obj) collectNumbers(v, out, depth + 1); return out; }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (NON_QUANTITY_KEY.test(k)) continue;
      collectNumbers(v, out, depth + 1);
    }
    return out;
  }
  return out;
}
function allowedNumbers(sources: unknown): Set<number> {
  const raw = collectNumbers(sources, new Set<number>());
  const out = new Set<number>();
  const add = (n: number) => { if (Number.isFinite(n) && n >= 0) out.add(Math.round(n * 100) / 100); };
  for (const n of raw) {
    add(n);
    add(Math.round(n));                                   // 2.04bb cité « 2bb »
    add(Math.round(n * 10) / 10);
    if (n > 0 && n <= 1) add(Math.round(n * 100));        // fraction → pourcentage
  }
  [0, 1, 100].forEach(add);                               // constantes de langage
  return out;
}
// Motifs à neutraliser : ce sont des NOMS, pas des mesures. On n'y met PAS les
// notations de main : sans unité elles ne déclenchent rien, alors qu'un motif
// « deux rangs collés » avalerait « 73 % » et laisserait passer une fréquence
// inventée. Le filtre fiable est l'unité, pas la forme du token.
const TOKEN_NOISE: RegExp[] = [
  /\b\d\s?-?\s?bet\b/gi, /\bc-?bet\b/gi, /\b\d+-max\b/gi,
  /\bUTG\+\d\b/gi, /\bMP\+\d\b/gi,
];
// La lookbehind évite de démarrer au milieu d'un mot (« A2x » → pas « 2x »).
const UNIT_NUMBER = /(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(%|bb\b|blindes?\b|x\b|pots?\b)/gi;

function analysisTexts(a: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => { if (typeof v === "string" && v.trim()) out.push(v); };
  push(a?.summary); push(a?.strategicReason); push(a?.observation);
  push(a?.coachAdvice); push(a?.verdict?.rationale);
  (a?.keyConcepts || []).forEach(push);
  (a?.warnings || []).forEach(push);
  (a?.dataGaps || []).forEach(push);
  for (const s of ["preflop", "flop", "turn", "river"]) push(a?.streets?.[s]?.analysis);
  (a?.detectedLeaks || []).forEach((l: any) => push(l?.description));
  return out;
}

/** @returns liste des problèmes ; vide = réponse acceptable. */
function guardAnalysis(a: any, body: any): string[] {
  const errs: string[] = [];
  const sd = body.solverData || {};
  const ps = sd.target?.pokerState || null;

  // §7 — l'action recommandée doit être celle du moteur, pas un choix du modèle.
  const engineReco = sd.target?.recommendedSemantic || null;
  if (engineReco && a?.recommendedAction && a.recommendedAction !== engineReco) {
    errs.push(`recommendedAction "${a.recommendedAction}" ≠ moteur "${engineReco}"`);
  }
  if (ps?.heroAction && a?.heroAction && a.heroAction !== ps.heroAction) {
    errs.push(`heroAction "${a.heroAction}" ≠ action jouée "${ps.heroAction}"`);
  }
  if (ps?.legalActions?.length && a?.recommendedAction && !ps.legalActions.includes(a.recommendedAction)) {
    errs.push(`recommendedAction "${a.recommendedAction}" hors des actions légales`);
  }

  // Mode « main complète » : pas de décision unique à confronter, mais le
  // modèle ne doit pas pour autant attribuer à Hero une action qu'il n'a jamais
  // jouée, ni recommander une action qu'aucun nœud de la main n'autorisait.
  if (!ps && Array.isArray(sd.decisions) && sd.decisions.length) {
    const played = sd.decisions.map((d: any) => d.heroSemantic).filter(Boolean);
    const reco = sd.decisions.map((d: any) => d.recommendedSemantic).filter(Boolean);
    if (played.length && a?.heroAction && !played.includes(a.heroAction)) {
      errs.push(`heroAction "${a.heroAction}" ne correspond à aucune décision de la main`);
    }
    if (reco.length && a?.recommendedAction && !reco.includes(a.recommendedAction)) {
      errs.push(`recommendedAction "${a.recommendedAction}" ne correspond à aucun nœud de la main`);
    }
  }

  // §5 — aucun nombre inventé.
  const allowed = allowedNumbers({ hs: body.handState, sd });
  for (const t of analysisTexts(a)) {
    let s = t;
    for (const re of TOKEN_NOISE) s = s.replace(re, " ");
    UNIT_NUMBER.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = UNIT_NUMBER.exec(s))) {
      const v = parseFloat(m[1].replace(",", "."));
      if (!Number.isFinite(v)) continue;
      if (allowed.has(Math.round(v * 100) / 100)) continue;
      errs.push(`valeur inventée "${m[0].trim()}"`);
    }
  }
  return [...new Set(errs)];
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

  // §4 — un spot incohérent ne part PAS au modèle : on ne demande pas à une IA
  // d'expliquer une situation qui n'existe pas. État contrôlé, pas d'appel payant.
  const psErrs = validatePokerStateServer(body.solverData?.target?.pokerState, mode);
  if (psErrs.length) {
    console.error(JSON.stringify({
      evt: "incoherent_state", user: user.userId.slice(0, 8),
      handId: String(body.handId || "").slice(0, 40), errors: psErrs.slice(0, 4),
    }));
    return fail("INCOHERENT_STATE", 422, { detail: psErrs.slice(0, 3).join(" · ") });
  }

  if (!key) return fail("NO_KEY", 503);

  // ── Appel fournisseur : OpenAI Responses API, sortie JSON strictement typée ──
  // §7 — DEUX tentatives au plus. Si la première réponse invente une valeur ou
  // recommande une autre action que le moteur, on la rejette et on régénère en
  // nommant la faute. Une réponse encore fautive n'est pas « corrigée » : elle
  // est refusée. C'est le critère Gold Master — mieux vaut pas d'analyse qu'une
  // analyse fausse.
  const basePrompt = userPrompt({ ...body, analysisMode: mode });
  let payload: any = null;
  let analysis: any = null;
  let guardErrs: string[] = [];
  let attempts = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts = attempt + 1;
    const correction = guardErrs.length
      ? `\n\n── TA RÉPONSE PRÉCÉDENTE A ÉTÉ REJETÉE ──\n${guardErrs.map(e => "• " + e).join("\n")}\n`
        + "Reprends l'analyse en corrigeant EXACTEMENT ces points. Recopie heroAction et "
        + "recommendedAction depuis les faits établis, et ne cite aucune valeur numérique "
        + "absente des données transmises. Si une valeur manque, dis qu'elle n'est pas disponible."
      : "";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), num(Deno.env.get("PF_AI_TIMEOUT_MS"), 40000));
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: basePrompt + correction },
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

    analysis = extractJson(payload);
    const bad = validateAnalysis(analysis);
    if (bad.length) {
      console.error(JSON.stringify({ evt: "invalid_output", model, errors: bad.slice(0, 4) }));
      return fail("INVALID_OUTPUT", 502);
    }

    guardErrs = guardAnalysis(analysis, body);
    if (!guardErrs.length) break;
    console.warn(JSON.stringify({
      evt: "guard_rejected", attempt: attempts, model,
      handId: String(body.handId || "").slice(0, 40), errors: guardErrs.slice(0, 4),
    }));
  }

  if (guardErrs.length) {
    console.error(JSON.stringify({
      evt: "guard_failed", attempts, model,
      handId: String(body.handId || "").slice(0, 40), errors: guardErrs.slice(0, 4),
    }));
    return fail("FABRICATED_DATA", 502, { detail: guardErrs.slice(0, 2).join(" · ") });
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
    /* §11 — traçabilité inter-couches : ces trois champs permettent de
       confronter a posteriori ce que le moteur a décrit et ce que l'IA a dit. */
    heroAction: body.solverData?.target?.pokerState?.heroAction ?? null,
    facingAction: body.solverData?.target?.pokerState?.facingAction ?? null,
    recommendedAction: body.solverData?.target?.recommendedSemantic ?? null,
    origin: body.solverData?.target?.origin ?? null,
    equityStreet: body.solverData?.equity?.street ?? null,
    guardAttempts: attempts,
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
      guardAttempts: attempts,
      origin: body.solverData?.target?.origin ?? null,
      durationMs: Date.now() - t0,
      usage: { inputTokens: inTok, outputTokens: outTok },
      costUsd,
      rateLimit: { max: rl.max, tier: premium ? "premium" : "standard" },
      createdAt: new Date().toISOString(),
    },
  });
});
