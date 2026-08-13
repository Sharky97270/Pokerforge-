/* Tests — Replayer : analyse IA sécurisée (§2/§6/§8/§10/§13/§14/§18/§19/§20/§23).
   Lancement : node test-replayer-ai-analysis.mjs

   Ce que cette suite verrouille :
     • le HandState normalisé décrit fidèlement la main et refuse le n'importe quoi ;
     • le package solveur transporte SA PROVENANCE et son niveau de confiance ;
     • aucun chiffre stratégique ne peut venir du modèle (schéma sans champ numérique) ;
     • la clé de cache change quand une version change (et pas autrement) ;
     • les erreurs serveur produisent des messages PokerForge, jamais des bruts ;
     • un leak n'est jamais « établi » sous le seuil d'échantillon ;
     • le frontend ne contient plus aucune logique de clé API utilisateur.        */
import { readFileSync } from "node:fs";
import { parseHand } from "./src/replayer/handModel.js";
import { computeAllSnapshots } from "./src/replayer/stateEngine.js";
import { buildHandState, validateHandState, spotLabel, lastStreetOf } from "./src/replayer/handState.js";
import { buildSolverPackage, buildTarget, PROV, PROV_META, cardToInt, SOLVER_PACKAGE_VERSION } from "./src/replayer/solverPackage.js";
import {
  analysisCacheKey, hashKey, mapServerError, validateAnalysis, AI_ERRORS,
  getCachedAnalysis, putCachedAnalysis, listAnalyses, clearAnalysisCache,
  requestAnalysis, analyzeWithCache, LOADING_STEPS, PROMPT_VERSION,
} from "./src/replayer/aiAnalysis.js";
import {
  countHandPatterns, handObservations, accumulate, detectLeaks,
  emptyAggregate, LEAK_PATTERNS,
} from "./src/replayer/leakEngine.js";
import { publishAnalysisContext, readAnalysisContext, clearAnalysisContext, toCoachContext } from "./src/replayer/handoff.js";

let passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.error("  ✗ " + m); } }
function section(t) { console.log("\n── " + t); }

/* sessionStorage minimal pour tester la passerelle en Node. */
globalThis.sessionStorage = (() => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
})();

const HH = `PokerStars Hand #900001: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'AI' 6-max Seat #3 is the button
Seat 1: Hero ($200 in chips)
Seat 3: Villain ($200 in chips)
Seat 5: Player5 ($200 in chips)
Hero: posts small blind $1
Player5: posts big blind $2
Dealt to Hero [Qs Jh]
Villain: raises $4 to $6
Hero: calls $5
Player5: folds
*** FLOP *** [Ah Kd 7c]
Hero: checks
Villain: bets $7
Hero: calls $7
*** TURN *** [Ah Kd 7c] [2s]
Hero: checks
Villain: bets $19
Hero: folds`;

const hand = parseHand(HH, 0);
const snaps = computeAllSnapshots(hand);
const hs = buildHandState(hand);

/* Moteur heuristique injecté (même stub que la suite decisionAnalysis). */
const stubCtx = {
  buildScenario: () => ({ street: "Flop" }),
  solve: () => ({
    ok: true,
    alts: [
      { action: "Bet", freq: 55, evBb: 0.5, comment: "Bet value." },
      { action: "Call", freq: 30, evBb: 0.2, comment: "Call correct." },
      { action: "Check", freq: 10, evBb: 0.4, comment: "Check range." },
      { action: "Fold", freq: 5, evBb: 0, comment: "Fold le reste." },
    ],
    coach: { explanation: "Explication heuristique." },
  }),
};

/* ═══════════════════════════════════════════════════════════════
   §6 — HANDSTATE NORMALISÉ
═══════════════════════════════════════════════════════════════ */
section("§6 — HandState normalisé");
ok(!!hs, "buildHandState produit un objet");
ok(hs.handId === "900001", "handId repris du parser");
ok(hs.site === "PokerStars" && hs.format === "Cash" && hs.game === "NLHE", "site / format / jeu normalisés");
ok(hs.tableSize === 3 && hs.players.length === 3, "tableSize cohérent avec les joueurs");
ok(hs.hero && hs.hero.position === "SB", "position Hero extraite");
ok(JSON.stringify(hs.hero.cards) === JSON.stringify(["Qs", "Jh"]), "cartes Hero au format compact");
ok(JSON.stringify(hs.board.flop) === JSON.stringify(["Ah", "Kd", "7c"]), "flop reconstruit depuis les événements");
ok(hs.board.turn === "2s" && hs.board.river === null, "turn présent, river absente");
ok(hs.potBB > 0, "pot calculé en bb");
ok(hs.actions.every(a => a.step != null && a.action), "chaque action porte son step et son type");
ok(hs.actions.some(a => a.isHero), "les actions Hero sont marquées");
ok(!hs.actions.some(a => a.action === "deal"), "les deals ne sont pas dupliqués dans les actions");
ok(lastStreetOf(hs) === "turn", "dernière street jouée = turn");
ok(typeof spotLabel(hs) === "string" && spotLabel(hs).includes("SB"), "libellé de spot lisible");

section("§23 — Validation stricte du HandState");
ok(validateHandState(hs).valid, "un HandState réel est valide");
ok(!validateHandState(null).valid, "null est refusé");
ok(!validateHandState({ ...hs, format: "PLO" }).valid, "format inconnu refusé");
ok(!validateHandState({ ...hs, tableSize: 42 }).valid, "tableSize hors bornes refusée");
ok(!validateHandState({ ...hs, hero: { ...hs.hero, cards: ["Zz", "Jh"] } }).valid, "carte invalide refusée");
ok(!validateHandState({ ...hs, board: { flop: ["Ah", "Kd"], turn: null, river: null } }).valid, "flop incomplet refusé");
ok(!validateHandState({ ...hs, board: { flop: null, turn: "2s", river: null } }).valid, "turn sans flop refusé");
ok(!validateHandState({ ...hs, hero: { ...hs.hero, cards: ["Ah", "Ah"] } }).valid, "cartes dupliquées refusées");
ok(!validateHandState({ ...hs, actions: [{ action: "teleport" }] }).valid, "action inconnue refusée");
ok(!validateHandState({ ...hs, actions: new Array(401).fill({ action: "fold" }) }).valid, "trop d'actions refusé");

/* ═══════════════════════════════════════════════════════════════
   §7/§8/§19 — PACKAGE SOLVEUR + PROVENANCE
═══════════════════════════════════════════════════════════════ */
section("§7/§8 — Package solveur et provenance");
const pkg = buildSolverPackage(hand, snaps, hs, stubCtx);
ok(!!pkg, "buildSolverPackage produit un package");
ok(pkg.solverVersion === SOLVER_PACKAGE_VERSION, "le package porte sa version");
ok(pkg.decisions.length > 0, "les décisions Hero sont extraites");
ok(pkg.decisions.every(d => Object.values(PROV).includes(d.source)), "chaque décision porte une provenance connue");
ok(pkg.decisions.every(d => d.strategy === null || Object.values(d.strategy).every(v => v >= 0 && v <= 1)),
  "les fréquences sont des fractions 0..1");
ok(typeof pkg.totalEvLossBB === "number", "EV perdue totale agrégée");
ok([1, 2, 3, 4].includes(pkg.level), "niveau de confiance dans 1..4");
ok(pkg.level === 3 && pkg.status === "estimated", "spot non solvable → niveau 3 (estimations)");
ok(typeof pkg.disclaimer === "string" && pkg.disclaimer.length > 0, "un avertissement accompagne les estimations");
ok(pkg.sources.includes(PROV.HEURISTIC), "la provenance heuristique est exposée telle quelle");
ok(!pkg.sources.includes(PROV.AI_INTERPRETATION), "aucune donnée IA dans le package solveur");

section("§16 — Badges : donnée calculée ≠ interprétation IA");
ok(PROV_META[PROV.SOLVER].computed === true, "SOLVER est marqué « calculé »");
ok(PROV_META[PROV.EQUITY_EXACT].computed === true, "EQUITY_EXACT est marqué « calculé »");
ok(PROV_META[PROV.HEURISTIC].computed === false, "HEURISTIC n'est pas marqué « calculé »");
ok(PROV_META[PROV.AI_INTERPRETATION].computed === false, "l'IA n'est jamais marquée « calculée »");
ok(PROV_META[PROV.AI_INTERPRETATION].color !== PROV_META[PROV.SOLVER].color, "couleurs distinctes IA / solveur");

section("Décision ciblée (curseur)");
const heroStep = snaps.findIndex(s => s.currentEvent?.playerId === hand.heroId
  && ["fold", "check", "call", "bet", "raise", "allin"].includes(s.currentEvent?.type));
const target = buildTarget(hand, snaps, stubCtx, heroStep);
ok(!!target, "une décision Hero produit un bloc cible");
ok(target.step === heroStep, "le bloc cible pointe la bonne étape");
ok(Object.values(PROV).includes(target.source), "le bloc cible porte une provenance");
const dealStep = snaps.findIndex(s => s.currentEvent?.type === "deal-flop");
ok(buildTarget(hand, snaps, stubCtx, dealStep) === null, "une étape sans décision Hero ne fabrique rien");
ok(buildTarget(hand, snaps, stubCtx, null) === null, "step null → aucune cible");

section("Encodage des cartes (moteur d'équité)");
ok(cardToInt("2s") === 0, "2s → 0");
ok(cardToInt("Ac") === 51, "Ac → 51");
ok(cardToInt("Zz") === null, "carte invalide → null");

/* ═══════════════════════════════════════════════════════════════
   §20 — CLÉ DE CACHE
═══════════════════════════════════════════════════════════════ */
section("§20 — Clé de cache et versions");
const base = { handId: "900001", analysisMode: "decision", step: 4 };
ok(analysisCacheKey(base) === analysisCacheKey(base), "clé déterministe");
ok(analysisCacheKey(base) !== analysisCacheKey({ ...base, analysisMode: "full_hand" }), "le mode change la clé");
ok(analysisCacheKey(base) !== analysisCacheKey({ ...base, step: 5 }), "l'étape change la clé");
ok(analysisCacheKey(base) !== analysisCacheKey({ ...base, solverVersion: "solver-pkg-2.0.0" }), "la version solveur change la clé");
ok(analysisCacheKey(base) !== analysisCacheKey({ ...base, promptVersion: "v2" }), "la version de prompt change la clé");
ok(analysisCacheKey(base) !== analysisCacheKey({ ...base, modelVersion: "gpt-x" }), "la version de modèle change la clé");
ok(analysisCacheKey(base).startsWith("decision:"), "la clé est préfixée par le mode");
ok(hashKey("a") !== hashKey("b"), "hash discriminant");

section("Cache : HIT / MISS / historique");
const store = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; })();
const fakeAnalysis = {
  summary: "Résumé.", verdict: { rating: "good", heroAction: "call", preferredAction: "call", rationale: "ok" },
  streets: { preflop: { status: "good", analysis: "x" }, flop: { status: "neutral", analysis: "x" },
             turn: { status: "mistake", analysis: "x" }, river: { status: "not_played", analysis: "" } },
  keyConcepts: ["blockers"], detectedLeaks: [], coachAdvice: "Conseil.", dataGaps: [],
};
putCachedAnalysis("decision:abcd1234", { handId: "900001", analysis: fakeAnalysis }, store);
ok(getCachedAnalysis("decision:abcd1234", store)?.analysis.summary === "Résumé.", "lecture du cache");
ok(getCachedAnalysis("decision:zzzz", store) === null, "clé absente → null");
ok(listAnalyses(store).length === 1, "historique listé");
clearAnalysisCache(store);
ok(listAnalyses(store).length === 0, "purge du cache");

/* ═══════════════════════════════════════════════════════════════
   §10 — VALIDATION DE LA RÉPONSE STRUCTURÉE
═══════════════════════════════════════════════════════════════ */
section("§10 — Schéma de réponse");
ok(validateAnalysis(fakeAnalysis).valid, "réponse conforme acceptée");
ok(!validateAnalysis(null).valid, "réponse vide refusée");
ok(!validateAnalysis({ ...fakeAnalysis, summary: "" }).valid, "summary vide refusé");
ok(!validateAnalysis({ ...fakeAnalysis, verdict: { rating: "parfait" } }).valid, "rating inconnu refusé");
ok(!validateAnalysis({ ...fakeAnalysis, streets: { preflop: { status: "good", analysis: "" } } }).valid, "streets incomplètes refusées");
ok(!validateAnalysis({ ...fakeAnalysis, keyConcepts: "blockers" }).valid, "keyConcepts non tableau refusé");
ok(!validateAnalysis({ ...fakeAnalysis, coachAdvice: 12 }).valid, "coachAdvice non textuel refusé");

section("§9 — Aucun chiffre stratégique dans le contrat de sortie");
const schemaSrc = readFileSync("./supabase/functions/analyze-hand/index.ts", "utf8");
const schemaBlock = schemaSrc.slice(schemaSrc.indexOf("const ANALYSIS_SCHEMA"), schemaSrc.indexOf("// §9"));
ok(!/type:\s*"number"/.test(schemaBlock), "le schéma de sortie ne contient AUCUN champ numérique");
ok(!/\b(frequency|freq|equity|ev|evLoss)\b\s*:/i.test(schemaBlock), "aucun champ de fréquence/EV/équité côté modèle");
ok(/anti|inventer/i.test(schemaSrc), "le prompt système porte la règle anti-hallucination");
ok(schemaSrc.includes("PROMPT_VERSION"), "le prompt est versionné");
ok(schemaSrc.includes(`"${PROMPT_VERSION}"`), "la version de prompt serveur correspond au client");

/* ═══════════════════════════════════════════════════════════════
   §18 — ERREURS PROPRES
═══════════════════════════════════════════════════════════════ */
section("§18 — Gestion des erreurs");
ok(mapServerError(401).error.code === "UNAUTHENTICATED", "401 → connexion requise");
ok(mapServerError(429).error.code === "RATE_LIMIT", "429 → limite atteinte");
ok(mapServerError(503).error.code === "NO_KEY", "503 → IA indisponible");
ok(mapServerError(500).error.code === "PROVIDER", "500 → fournisseur indisponible");
ok(mapServerError(400).error.code === "INVALID_INPUT", "400 → main invalide");
ok(mapServerError(200, { code: "TIMEOUT" }).error.code === "TIMEOUT", "code serveur explicite respecté");
ok(mapServerError(429, { retryAfter: 12 }).error.retryAfter === 12, "délai de réessai transmis");
ok(Object.values(AI_ERRORS).every(e => !/stack|Error:|undefined|http/i.test(e.message)),
  "aucun message d'erreur ne fuit de détail technique");
ok(AI_ERRORS.NO_KEY.message.includes("SharkSolver"), "le fallback rappelle que le solveur reste accessible");
ok(LOADING_STEPS.length === 3, "trois étapes de chargement (§17)");

section("§22 — Authentification obligatoire côté client");
const noToken = await requestAnalysis({ handState: hs, tokenProvider: async () => null });
ok(noToken.ok === false && noToken.error.code === "UNAUTHENTICATED", "sans session, aucun appel n'est tenté");
let called = false;
await requestAnalysis({ handState: hs, tokenProvider: async () => null, fetchImpl: async () => { called = true; return {}; } });
ok(called === false, "aucune requête réseau sans session");

section("Appel backend : chemin nominal et cache");
let seenUrl = null, seenBody = null, seenHeaders = null;
const fakeFetch = async (url, init) => {
  seenUrl = url; seenHeaders = init.headers; seenBody = JSON.parse(init.body);
  return { ok: true, status: 200, json: async () => ({ ok: true, analysis: fakeAnalysis, meta: { model: "gpt-4.1-mini" } }) };
};
const good = await requestAnalysis({ handState: hs, solverData: pkg, analysisMode: "decision", step: 4,
  fetchImpl: fakeFetch, tokenProvider: async () => "jwt-utilisateur" });
ok(good.ok === true, "réponse valide acceptée");
ok(String(seenUrl).includes("/functions/v1/analyze-hand"), "la requête part vers l'endpoint PokerForge");
ok(!/api\.openai\.com|api\.anthropic\.com/.test(String(seenUrl)), "aucun appel direct à un fournisseur d'IA");
ok(seenHeaders.Authorization === "Bearer jwt-utilisateur", "le jeton utilisateur est transmis");
ok(!JSON.stringify(seenBody).includes("sk-"), "aucune clé dans le corps de requête");
ok(seenBody.handState && seenBody.solverData, "le payload porte HandState + données solveur");
ok(seenBody.raw === undefined && seenBody.hh === undefined, "la hand history brute n'est pas envoyée (§27)");

const store2 = (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; })();
let calls = 0;
const countingFetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ ok: true, analysis: fakeAnalysis, meta: {} }) }; };
const p1 = { handState: hs, solverData: pkg, analysisMode: "decision", step: 4, store: store2,
  fetchImpl: countingFetch, tokenProvider: async () => "jwt" };
const r1 = await analyzeWithCache(p1);
const r2 = await analyzeWithCache(p1);
ok(r1.meta.cache === "MISS" && r2.meta.cache === "HIT", "deuxième analyse identique servie par le cache");
ok(calls === 1, "le fournisseur n'est appelé qu'une fois");
const r3 = await analyzeWithCache({ ...p1, force: true });
ok(calls === 2 && r3.meta.cache === "MISS", "forçage → nouvel appel");

section("Réponse invalide et erreurs réseau");
const badOut = await requestAnalysis({ handState: hs, tokenProvider: async () => "jwt",
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, analysis: { summary: "x" } }) }) });
ok(badOut.ok === false && badOut.error.code === "INVALID_OUTPUT", "réponse hors schéma rejetée");
const netErr = await requestAnalysis({ handState: hs, tokenProvider: async () => "jwt",
  fetchImpl: async () => { throw new Error("boom"); } });
ok(netErr.ok === false && netErr.error.code === "NETWORK", "erreur réseau → message PokerForge");
ok(!/boom/.test(JSON.stringify(netErr)), "le message technique n'est pas exposé");
const rl = await requestAnalysis({ handState: hs, tokenProvider: async () => "jwt",
  fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ code: "RATE_LIMIT", retryAfter: 8 }) }) });
ok(rl.error.code === "RATE_LIMIT" && rl.error.retryAfter === 8, "limite serveur remontée proprement");

/* ═══════════════════════════════════════════════════════════════
   §13/§14 — MOTIFS & LEAKS
═══════════════════════════════════════════════════════════════ */
section("§13 — Observations de CETTE main");
const counts = countHandPatterns(hand, snaps, pkg.decisions);
ok(Object.keys(counts).length > 0, "des compteurs sont produits");
ok(Object.values(counts).every(c => c.hits <= c.opps), "jamais plus de succès que d'opportunités");
ok(counts.OVER_CALL_FLOP && counts.OVER_CALL_FLOP.hits === 1, "le call flop face à une mise est détecté");
const obs = handObservations(hand, snaps, pkg.decisions);
ok(Array.isArray(obs) && obs.length > 0, "des observations sont produites");
ok(obs.every(o => o.scope === "hand"), "toutes les observations sont marquées « cette main »");
ok(obs.every(o => !/leak récurrent|tu fais toujours/i.test(o.text)), "aucune observation ne parle de leak récurrent");

section("§14 — Leaks récurrents et seuil d'échantillon");
let agg = emptyAggregate();
agg = accumulate(agg, { OVER_CALL_FLOP: { hits: 3, opps: 3 } }, "h1");
ok(agg.hands === 1, "une main comptée");
agg = accumulate(agg, { OVER_CALL_FLOP: { hits: 1, opps: 1 } }, "h1");
ok(agg.hands === 1, "la même main n'est pas comptée deux fois");
agg = accumulate(agg, { OVER_CALL_FLOP: { hits: 2, opps: 2 } }, "h2");
ok(agg.counters.OVER_CALL_FLOP.opps === 5, "les opportunités s'additionnent");
const smallLeaks = detectLeaks(agg);
ok(smallLeaks.length === 1, "un pattern déviant est repéré");
ok(smallLeaks[0].established === false, "sous le seuil : tendance, pas leak établi");
ok(smallLeaks[0].confidence === "low", "confiance basse sur petit échantillon");
let big = emptyAggregate();
big = accumulate(big, { OVER_CALL_FLOP: { hits: 80, opps: 100 } }, "hx");
const bigLeaks = detectLeaks(big);
ok(bigLeaks[0].established === true, "au-delà du seuil : leak établi");
ok(bigLeaks[0].severity === "high", "écart important → sévérité haute");
ok(bigLeaks[0].reference === LEAK_PATTERNS.OVER_CALL_FLOP.reference, "la référence est transportée");
ok(bigLeaks[0].samples === 100, "l'échantillon est transporté");
let clean = emptyAggregate();
clean = accumulate(clean, { OVER_CALL_FLOP: { hits: 45, opps: 100 } }, "hy");
ok(detectLeaks(clean).length === 0, "une fréquence conforme ne produit aucun leak");

/* ═══════════════════════════════════════════════════════════════
   §30/§32 — PASSERELLE VERS TRAINER / COACH AI
═══════════════════════════════════════════════════════════════ */
section("§30/§32 — Contexte structuré Replayer → Trainer / Coach");
clearAnalysisContext();
ok(readAnalysisContext() === null, "aucun contexte au départ");
publishAnalysisContext({ handId: hs.handId, handState: hs, solverData: pkg, analysis: fakeAnalysis,
  concepts: ["blockers"], observations: obs, spot: spotLabel(hs) });
const ctx = readAnalysisContext(hs.handId);
ok(!!ctx && ctx.handId === hs.handId, "contexte relu pour la bonne main");
ok(readAnalysisContext("autre-main") === null, "un contexte d'une autre main n'est pas servi");
const coachCtx = toCoachContext(ctx);
ok(coachCtx.solver && coachCtx.solver.level === pkg.level, "le niveau solveur est transmis au Coach");
ok(Array.isArray(coachCtx.concepts), "les concepts sont transmis");
ok(!JSON.stringify(coachCtx).includes("PokerStars Hand #"), "aucune hand history brute transmise au LLM (§27)");
clearAnalysisContext();
ok(readAnalysisContext() === null, "purge du contexte");

/* ═══════════════════════════════════════════════════════════════
   §2/§33 — PLUS AUCUNE CLÉ CÔTÉ NAVIGATEUR
═══════════════════════════════════════════════════════════════ */
section("§2/§33 — Absence totale de clé API côté frontend");
const replayerSrc = readFileSync("./src/tabs/ReplayerTab.jsx", "utf8");
ok(!/api\.anthropic\.com|api\.openai\.com/.test(replayerSrc), "aucun appel direct à un fournisseur d'IA");
ok(!/x-api-key|anthropic-dangerous-direct-browser-access/.test(replayerSrc), "aucun en-tête de clé fournisseur");
ok(!/sk-ant|sk-proj|placeholder.*sk-/.test(replayerSrc), "aucun exemple de clé dans l'UI");
ok(!/Clé API requise/.test(replayerSrc), "le message « Clé API requise » a disparu");
ok(!/storeApiKey|readApiKey|saveApiKeyLocal/.test(replayerSrc), "la logique de stockage de clé est supprimée");
ok(!/type="password"/.test(replayerSrc), "aucun champ de saisie de clé");
ok(/localStorage\.removeItem\("pf_ak"\)/.test(replayerSrc), "les anciennes clés stockées sont purgées");
ok(!/NEXT_PUBLIC_|VITE_OPENAI|VITE_ANTHROPIC|REACT_APP_/.test(replayerSrc), "aucune variable publique de clé");
const clientSrc = readFileSync("./src/replayer/aiAnalysis.js", "utf8");
ok(!/api\.openai\.com|api\.anthropic\.com/.test(clientSrc), "le client d'analyse n'appelle aucun fournisseur");
ok(clientSrc.includes('supabaseFunctionUrl("analyze-hand")'), "le client vise bien l'endpoint PokerForge");
const fnSrc = schemaSrc;
ok(/Deno\.env\.get\("OPENAI_API_KEY"\)/.test(fnSrc), "la clé n'est lue que côté serveur");
ok(!/OPENAI_API_KEY/.test(replayerSrc) && !/OPENAI_API_KEY/.test(clientSrc), "le nom du secret n'apparaît pas côté client");
ok(/authenticate\(req\)/.test(fnSrc) && fnSrc.indexOf("authenticate(req)") < fnSrc.indexOf("api.openai.com"),
  "l'authentification précède tout appel payant (§22)");
ok(/rateLimit\(/.test(fnSrc), "le rate limit serveur existe (§21)");
ok(/console\.log|console\.error/.test(fnSrc) && !/console\.(log|error)[^\n]*key/i.test(fnSrc),
  "les logs n'exposent jamais la clé (§24)");
ok(/costUsd/.test(fnSrc), "l'estimation de coût est journalisée (§25)");

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} assertions OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
