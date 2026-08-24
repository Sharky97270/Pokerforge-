/* ══════════════════════════════════════════════════════════════════════════
   trainerStrategyProvider.js — STRATEGY PROVIDER (Mission Master §28)

   Branche le SOLVEUR au Trainer pour la SOLUTION des spots. Principe directeur
   (§2/§6) : « LE SOLVEUR CALCULE. L'IA EXPLIQUE. » — la vérité stratégique d'un
   spot n'est jamais inventée.

   Aujourd'hui la solution VALIDÉE disponible en interne est le push/fold préflop
   heads-up (solvePreflopPushFold, exploitabilité ≈ 0). Pour ces spots, la bonne
   action / les fréquences viennent du solveur (provenance EXACT_CALCULATION).
   Pour les autres spots, on retourne la solution existante du template avec une
   provenance HONNÊTE (`heuristic`) — aucune fabrication.

   `resolveSpotStrategy(spot)` → {
     solved, source: "solver"|"heuristic", ok, freq, provenance, note, meta
   }

   Module PUR. Dépend de la Solver API (pushfold).
   ══════════════════════════════════════════════════════════════════════════ */

import { solvePreflopPushFold } from "./solver/api.js";
import { lookupPreflopChart } from "./solver/preflopCharts.js";
import { pushFoldDomain, scopeLimitLabel } from "./trainerSolutionScope.js";

/* ── QUI A PRODUIT CETTE SOLUTION, ET DANS QUELLE VERSION (C13) ─────────────
   Trois moteurs seulement, chacun nommé et versionné. La version n'est pas
   décorative : elle permet de dire d'une solution archivée si elle a été
   produite par le moteur courant ou par un plus ancien. */
export const STRATEGY_ENGINES = {
  solver: { name: "solvePreflopPushFold", version: "1.0", exact: true, label: "🦈 Solveur" },
  chart: { name: "preflopCharts", version: "1.0", exact: false, label: "📊 Chart" },
  heuristic: { name: "trainer-template", version: "1.0", exact: false, label: "≈ Heuristique" },
};
/* La confiance DÉCOULE de la source ; elle ne se règle pas à la main. Un
   template n'est pas « moyennement fiable » : il n'est pas calculé. */
export const STRATEGY_CONFIDENCE = { solver: "exact", chart: "documented", heuristic: "none" };

const RANKS = "23456789TJQKA";
const rIdx = (r) => RANKS.indexOf(r);

/* Deux cartes {r,s} → notation de range ("AA", "AKs", "72o"). */
export function handNotation(cards) {
  if (!Array.isArray(cards) || cards.length < 2 || !cards[0] || !cards[1]) return null;
  let a = cards[0], b = cards[1];
  if (rIdx(a.r) < rIdx(b.r)) { const t = a; a = b; b = t; } // rang haut en premier
  if (a.r === b.r) return a.r + b.r;                        // paire
  return a.r + b.r + (a.s === b.s ? "s" : "o");
}

const AGG_IDS = new Set(["ALLIN", "PUSH", "SHOVE", "JAM"]);
function isAggAct(act) {
  const id = String(act?.id || "").toUpperCase();
  if (AGG_IDS.has(id)) return true;
  return /all-?in|push|jam|shove|tapis/i.test(`${act?.l || ""} ${act?.label || ""}`);
}
function isFoldAct(act) { return String(act?.id || "").toUpperCase() === "FOLD"; }
function isCallAct(act) { return String(act?.id || "").toUpperCase() === "CALL"; }

function parseStackBb(stack) {
  const n = Number(String(stack ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* Un spot est-il un push/fold préflop résoluble par le solveur HU ?

   ATTENTION — la version précédente ne testait QUE la forme du spot : préflop,
   tapis entier ≤ 30bb, couple fold/jam présent. Elle ne regardait ni le nombre
   de joueurs encore dans le coup, ni le barème de gains. Le moteur, lui, est
   déclaré heads-up et chip-EV pur. Un « BTN 25bb — Push ou fold ? » de Cash
   6-max passait donc le test et ressortait à l'écran badgé « calcul exact »
   alors que le modèle appliqué (SB jam vs BB, blindes postées) ne décrivait pas
   ce spot.

   La question du domaine est désormais posée à `pushFoldDomain`, qui répond
   AVEC les motifs de refus. Voir src/trainerSolutionScope.js. */
export function isSolvablePushFold(spot) {
  if (!spot) return false;
  return pushFoldDomain(spot).inDomain;
}

/* Catégorie de spot préflop → action de chart. Les `cat` du générateur sont
   "RFI" / "Vs Open" / "Vs 3-bet" / "Vs 4-bet". */
const CAT_TO_CHART_ACTION = {
  "rfi": "rfi", "open raise": "rfi",
  "vs open": "vs_open", "défense bb": "vs_open", "defense bb": "vs_open",
  "vs 3-bet": "vs_3bet", "vs 3bet": "vs_3bet",
  "vs 4-bet": "vs_4bet", "vs 4bet": "vs_4bet",
};

/* Tente de résoudre un spot PRÉFLOP depuis un chart embarqué. Retourne null si aucun
   chart ne couvre ce spot — null = « on ne sait pas », l'appelant retombe alors sur
   l'heuristique. On ne devine jamais une fréquence.
   Provenance "chart" : ces nombres sont LUS, pas calculés ici (§2). */
export function resolveFromChart(spot, opts = {}) {
  if (!spot) return null;
  if (!/^pre/i.test(spot.street || "Preflop")) return null;        // charts = préflop
  const action = CAT_TO_CHART_ACTION[String(spot.cat || "").toLowerCase().trim()];
  if (!action) return null;
  const handKey = handNotation(spot.hand);
  if (!handKey) return null;
  const hit = (opts.lookup || lookupPreflopChart)({
    heroPos: spot.hpos, vsPos: spot.vpos, action,
    stackBb: parseStackBb(spot.stack), handKey, format: opts.format,
  });
  if (!hit) return null;

  const acts = Array.isArray(spot.acts) ? spot.acts : [];
  const aggIdx = acts.findIndex(a => isAggAct(a) || /open|raise|relanc|bet|3-?bet|4-?bet/i.test(`${a?.id || ""} ${a?.l || ""}`));
  const callIdx = acts.findIndex(isCallAct);
  const foldIdx = acts.findIndex(isFoldAct);
  if (aggIdx < 0 && callIdx < 0) return null;                      // rien à mapper

  const freq = {};
  for (const a of acts) if (a?.id) freq[a.id] = 0;
  const put = (i, v) => { if (i >= 0 && acts[i]?.id) freq[acts[i].id] = Math.round(v * 10) / 10; };
  put(aggIdx, hit.freqs.r);
  put(callIdx, hit.freqs.c);
  put(foldIdx, hit.freqs.f);

  let okIdx = -1, best = -1;
  acts.forEach((a, i) => { const v = a?.id ? (freq[a.id] || 0) : 0; if (v > best) { best = v; okIdx = i; } });

  const approx = hit.exactStack ? "" : ` (chart ${hit.stackUsed}bb appliqué à ${parseStackBb(spot.stack)}bb)`;
  return {
    solved: true, ok: okIdx, freq,
    source: "chart", provenance: "preflop-chart",
    note: `Chart préflop « ${hit.chartLabel} » — ${handKey}${approx}. Source : ${hit.attribution}. Fréquences LUES, non calculées ici.`,
    meta: { engine: "chart", chartId: hit.chartId, attribution: hit.attribution,
            stackUsed: hit.stackUsed, exactStack: hit.exactStack, handKey },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   resolveSpotStrategy — solution du spot. Solveur si résoluble, sinon chart, sinon
   heuristique.
   ────────────────────────────────────────────────────────────────────────── */
export function resolveSpotStrategy(spot, opts = {}) {
  const acts = Array.isArray(spot?.acts) ? spot.acts : [];
  const domain = pushFoldDomain(spot);
  if (!domain.inDomain) {
    // Pas solvable en interne → un CHART préflop peut prendre le relais s'il en existe
    // un pour ce spot. Aucun chart n'est livré avec l'app : sans données chargées, ceci
    // renvoie null et on retombe sur l'heuristique (comportement historique).
    const chart = resolveFromChart(spot, opts);
    if (chart) return { ...chart, scope: domain.scope, limits: domain.reasons };
    /* Repli HONNÊTE. On garde les nombres du template — ils servent d'entraînement —
       mais on dit d'où ils viennent ET pourquoi le solveur n'a pas pris la main.
       Sans ce motif, l'écran affichait « heuristique » sans jamais expliquer que
       le spot était simplement hors du domaine résolu. */
    const why = scopeLimitLabel(domain);
    return {
      solved: false, source: "heuristic", provenance: "template",
      ok: spot?.ok, freq: spot?.freq,
      note: `Estimation heuristique (template). Non résolu en interne — ${why}.`,
      scope: domain.scope, limits: domain.reasons, meta: null,
    };
  }
  const hand = handNotation(spot.hand);
  const stack = parseStackBb(spot.stack);
  const facing = Math.max(0, Number(spot.toCall) || 0) > 0;
  const sol = (opts.solve || solvePreflopPushFold)(stack);
  const freqMap = facing ? sol?.bbCall : sol?.sbJam;
  const hf = hand && freqMap ? freqMap[hand] : null;
  if (!hf) {
    return { solved: false, source: "heuristic", provenance: "template",
      ok: spot?.ok, freq: spot?.freq, note: "Main introuvable dans la solution solveur — repli template.", meta: null };
  }

  // Indices des actions : agressive (jam ou call) vs fold.
  const aggIdx = facing ? acts.findIndex(isCallAct) : acts.findIndex(isAggAct);
  const foldIdx = acts.findIndex(isFoldAct);
  if (aggIdx < 0 || foldIdx < 0) {
    return { solved: false, source: "heuristic", provenance: "template", ok: spot?.ok, freq: spot?.freq,
      note: "Actions jam/fold non identifiables — repli template.", meta: null };
  }

  const aggPct = hf.r;                       // % jam (ou % call) GTO
  const ok = aggPct >= 50 ? aggIdx : foldIdx; // action majoritaire
  const aggId = acts[aggIdx].id, foldId = acts[foldIdx].id;
  const freq = { [aggId]: Math.round(aggPct * 10) / 10, [foldId]: Math.round((100 - aggPct) * 10) / 10 };

  return {
    solved: true,
    source: "solver",
    provenance: sol.precompiled ? "solver-library" : "solver-live",
    ok, freq,
    note: facing
      ? `Solveur push/fold heads-up chip-EV (${stack}bb) : call ${aggPct}% avec ${hand}.`
      : `Solveur push/fold heads-up chip-EV (${stack}bb) : jam ${aggPct}% avec ${hand}.`,
    scope: domain.scope,
    /* Même dans le domaine, le résultat n'est pas « exact » au sens absolu : la
       matrice d'équité porte un bruit déclaré (≈ ±0.26 pt, cf. §24 du solveur) et
       le modèle est chip-EV. On l'écrit plutôt que de le taire. */
    limits: [
      "chip-EV pur — aucune contrainte ICM/PKO",
      "précision bornée par la matrice d'équité (bruit ≈ ±0.26 pt)",
    ],
    meta: { stack, hand, facing, aggPct, exploitability: sol.exploitability, rangeSource: sol.rangeSource },
  };
}

/* Applique la solution solveur À UN SPOT (mutation additive) quand elle existe.
   Écrit `ok`/`freq` calculés + `strategySource`/`strategyNote` pour l'affichage
   honnête (§2). Ne touche PAS aux spots non résolubles. Retourne le spot. */
export function applySolverStrategy(spot, opts = {}) {
  if (!spot) return spot;
  const r = resolveSpotStrategy(spot, opts);
  spot.strategySource = r.source;        // "solver" | "chart" | "heuristic"
  spot.strategyProvenance = r.provenance;
  spot.strategyNote = r.note;
  /* Le périmètre voyage AVEC le spot : c'est lui qui autorise l'écran à écrire
     « calcul exact » ou, au contraire, à afficher la limite. Sans ces deux
     champs, l'affichage n'avait aucun moyen de distinguer un push/fold vraiment
     heads-up d'un BTN de 6-max. */
  spot.strategyScope = r.scope || null;
  spot.strategyLimits = Array.isArray(r.limits) ? r.limits : [];
  /* ── LA FICHE DE PROVENANCE COMPLÈTE (C13) ────────────────────────────────
     Le périmètre et le motif de repli voyageaient déjà avec le spot. Il y
     manquait deux champs que la mission exige : la VERSION du moteur qui a
     produit la solution, et la CONFIANCE qu'on peut lui accorder. Sans eux,
     deux solutions « heuristique » sont indiscernables — celle qui vient d'un
     chart attribué et celle qui vient d'un template.

     La confiance n'est pas une note inventée : elle découle de la source.
     Un template ne peut pas être « moyennement fiable », il est non calculé. */
  spot.strategyEngine = STRATEGY_ENGINES[r.source] || STRATEGY_ENGINES.heuristic;
  spot.strategyConfidence = STRATEGY_CONFIDENCE[r.source] || "none";
  spot.strategyPayoutModel = (r.scope && r.scope.payout) || null;
  spot.strategyFallbackReason = r.solved ? null : (Array.isArray(r.limits) && r.limits[0]) || r.note || null;
  if (r.solved) {
    spot.ok = r.ok;
    spot.freq = { ...(spot.freq || {}), ...r.freq };
    spot.best = spot.acts?.[r.ok]?.l ?? spot.best;
    spot.solverMeta = r.meta;
  }
  return spot;
}
