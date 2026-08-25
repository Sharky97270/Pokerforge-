/* ══════════════════════════════════════════════════════════════════════════
   PFASE · SOLUTION DE MAIN COMPLÈTE (mission « coup complet », §38/§66/§104)

   Deux objets, deux natures — et les confondre est précisément la faute que ce
   module existe pour rendre impossible.

     DecisionSolution  — ce que produit `solveOptimizedTree` : la solution d'UN
                         nœud de décision, à UN état de jeu.
     HandSolution      — une TRAJECTOIRE : plusieurs décisions reliées, chacune
                         découlant de l'action prise à la précédente.

   ── CE QUI DISTINGUE UNE TRAJECTOIRE D'UN SAC DE SOLUTIONS ──────────────────
   Rien, si l'on se contente de mettre quatre solutions dans un tableau. C'est
   pourquoi ce module ne se contente pas de les ranger : il VÉRIFIE que chacune
   découle de la précédente.

   Concrètement, quand Hero mise 9 bb sur un pot de 12 et que le Vilain paie, la
   décision suivante doit se présenter avec un pot de 30 bb et des tapis réduits
   de 9. Si l'état de la décision suivante ne correspond pas, ce n'est pas la
   même main : `chainConsistent:false`, avec l'écart chiffré. Aucun champ agrégé
   n'est publié sur une chaîne incohérente.

   ── CE QUE `coversStreetsAhead` NE PEUT PAS DEVENIR ─────────────────────────
   « Rejouer quatre solutions indépendantes ≠ résoudre une main multi-street. »

   Le champ est DÉRIVÉ de chaque solve (`streetsSolved`), jamais de la longueur
   de la chaîne. Une main de quatre décisions dont chacune n'a valorisé qu'une
   rue reste une main dont aucune décision n'a d'horizon : la HandSolution le
   dit décision par décision, et son résumé ne peut pas l'inventer.

   Ce que la chaîne apporte, elle, est réel et se dit autrement : chaque rue est
   RE-RÉSOLUE à son état effectif, avec la carte réellement tombée. C'est
   meilleur que de rejouer une table figée du flop (§38/§39) — et c'est une
   propriété de la chaîne, pas un horizon de valeur. `chainKind` la nomme.
   ══════════════════════════════════════════════════════════════════════════ */

import { EPS, SIZING_ENGINE_VERSION, SOLUTION_SCHEMA_VERSION } from "./config.js";
import { roundAmount, roundEv } from "./sizingSpec.js";

export const HAND_SOLUTION_SCHEMA_VERSION = 1;

/* Nature de la chaîne. Aucune de ces valeurs ne vaut « meilleure » : elles
   décrivent COMMENT la valeur a été obtenue, ce qui est une autre question. */
export const ChainKind = Object.freeze({
  /* Chaque rue re-résolue à son état effectif, carte réellement tombée comprise.
     C'est ce que fait le Trainer, et c'est le comportement correct. */
  RESOLVED_PER_STREET: "RESOLVED_PER_STREET",
  /* Une seule décision : il n'y a pas de chaîne. */
  SINGLE_DECISION: "SINGLE_DECISION",
  /* Décisions présentes mais dont l'enchaînement n'a pas pu être vérifié. */
  UNVERIFIED: "UNVERIFIED",
});

const STREET_ORDER = ["PREFLOP", "FLOP", "TURN", "RIVER"];

/* ══════════════════════════════════════════════════════════════════════════
   expectedStateAfter — CE QUE L'ACTION DOIT PRODUIRE

   Arithmétique pure, indépendante de tout solveur : c'est précisément ce qui en
   fait un bon contrôle. Si la décision suivante n'arrive pas avec ces valeurs,
   quelque chose s'est perdu entre les deux — et mieux vaut le dire que d'agréger
   deux états qui ne décrivent pas la même main.

   `action.additionalBb` est l'engagement SUPPLÉMENTAIRE du joueur qui parle.
   `calledBy` : nombre d'adversaires qui ont suivi (0 si l'action a emporté le pot).
   ══════════════════════════════════════════════════════════════════════════ */
export function expectedStateAfter(state, action = {}) {
  if (!state) return null;
  const mise = Math.max(0, +action.additionalBb || 0);
  const suiveurs = action.calledBy == null ? 1 : Math.max(0, +action.calledBy || 0);
  return {
    /* Le pot gagne la mise du joueur PLUS celle de chaque suiveur. */
    pot: roundAmount(state.pot + mise * (1 + suiveurs)),
    /* Le tapis effectif est celui du plus court : il perd la mise dès qu'elle
       est suivie, et rien du tout si personne ne suit (le coup s'arrête). */
    effectiveStack: roundAmount(Math.max(0, state.effectiveStack - (suiveurs > 0 ? mise : 0))),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   linkDecisions — LA VÉRIFICATION, avant toute agrégation

   `decisions` : [{ solution, action:{actionType, additionalBb, calledBy}, label }]
   dans l'ordre de jeu. Chaque `solution` est une PFSolution.
   ══════════════════════════════════════════════════════════════════════════ */
export function linkDecisions(decisions = [], { tolerance = 0.01 } = {}) {
  const list = (Array.isArray(decisions) ? decisions : []).filter(d => d && d.solution);
  if (!list.length) return { ok: false, reason: "aucune décision fournie", links: [] };

  const links = [];
  const problems = [];
  for (let i = 0; i < list.length - 1; i++) {
    const cur = list[i], next = list[i + 1];
    const attendu = expectedStateAfter(
      { pot: cur.solution.pot, effectiveStack: cur.solution.effectiveStacks },
      cur.action || {},
    );
    const ecartPot = Math.abs((next.solution.pot ?? 0) - attendu.pot);
    const ecartTapis = Math.abs((next.solution.effectiveStacks ?? 0) - attendu.effectiveStack);
    /* L'ordre des rues doit AVANCER : une turn ne suit pas une river. */
    const iCur = STREET_ORDER.indexOf(cur.solution.street);
    const iNext = STREET_ORDER.indexOf(next.solution.street);
    const rueAvance = iCur >= 0 && iNext >= 0 && iNext > iCur;
    /* Et le board de la rue suivante doit PROLONGER celui de la précédente :
       une main ne change pas de flop en cours de route. */
    const bCur = (cur.solution.board || []).join(",");
    const bNext = (next.solution.board || []).join(",");
    const boardProlonge = bNext.startsWith(bCur);

    const ok = ecartPot <= tolerance && ecartTapis <= tolerance && rueAvance && boardProlonge;
    if (!ok) {
      if (ecartPot > tolerance) problems.push(`décision ${i} → ${i + 1} : pot attendu ${attendu.pot}, reçu ${next.solution.pot} (écart ${roundAmount(ecartPot)})`);
      if (ecartTapis > tolerance) problems.push(`décision ${i} → ${i + 1} : tapis effectif attendu ${attendu.effectiveStack}, reçu ${next.solution.effectiveStacks}`);
      if (!rueAvance) problems.push(`décision ${i} → ${i + 1} : la rue ne progresse pas (${cur.solution.street} → ${next.solution.street})`);
      if (!boardProlonge) problems.push(`décision ${i} → ${i + 1} : le board ne prolonge pas le précédent (${bCur} → ${bNext})`);
    }
    links.push({ from: i, to: i + 1, ok, attendu, ecartPot: roundAmount(ecartPot), ecartTapis: roundAmount(ecartTapis), rueAvance, boardProlonge });
  }
  return { ok: problems.length === 0, problems, links };
}

/* ══════════════════════════════════════════════════════════════════════════
   buildHandSolution — L'ASSEMBLAGE

   Ne publie AUCUN champ agrégé qu'il n'a pas pu vérifier. Une chaîne incohérente
   rend `ok:false` avec ses écarts : c'est plus utile qu'un objet bien formé
   décrivant une main qui n'a pas eu lieu.
   ══════════════════════════════════════════════════════════════════════════ */
export function buildHandSolution({ decisions = [], handId = null, tolerance = 0.01 } = {}) {
  const list = (Array.isArray(decisions) ? decisions : []).filter(d => d && d.solution);
  if (!list.length) return { ok: false, reason: "aucune décision fournie" };

  const chain = linkDecisions(list, { tolerance });
  const first = list[0].solution, last = list[list.length - 1].solution;

  /* ── L'HORIZON, DÉCISION PAR DÉCISION — jamais agrégé en un seul « oui » ──
     Une main peut parfaitement contenir une décision de flop à horizon complet
     et une décision de river qui n'en a aucun (il n'y a plus rien après). Écrire
     un seul booléen pour la main entière effacerait cette différence. */
  const perDecision = list.map((d, i) => {
    const strat = d.solution.strategy || {};
    return {
      index: i,
      street: d.solution.street,
      board: (d.solution.board || []).slice(),
      pot: d.solution.pot,
      effectiveStacks: d.solution.effectiveStacks,
      spr: d.solution.spr,
      solutionId: d.solution.solutionId,
      gameStateHash: d.solution.gameStateHash,
      /* Stratégie, EV, sizing, provenance, précision, convergence — tels que la
         solution les porte. Rien n'est recalculé ici : ce module relie, il ne
         résout pas. */
      selectedSizes: d.solution.selectedSizes || null,
      evLossBb: d.solution.simplificationMetrics ? d.solution.simplificationMetrics.absoluteEVLoss : null,
      measurementFloorBb: d.solution.measurement ? d.solution.measurement.floor : null,
      distinguishable: d.solution.distinguishable !== false,
      provenance: d.solution.source,
      strategyKind: d.solution.strategyKind || "EQUILIBRIUM",
      convergence: d.solution.convergence || null,
      status: d.solution.status,
      /* LES DEUX VÉRITÉS, séparées (cf. strategyExtract) */
      streetsValued: strat.streetsValued ?? null,
      coversStreetsAhead: strat.coversStreetsAhead === true,
      exposesStreetsAhead: strat.exposesStreetsAhead === true,
      action: d.action || null,
      label: d.label || null,
    };
  });

  const streetsCovered = [...new Set(perDecision.map(d => d.street))].filter(Boolean);
  const streetsNotCovered = STREET_ORDER.filter(s => !streetsCovered.includes(s));

  const chainKind = list.length === 1 ? ChainKind.SINGLE_DECISION
    : chain.ok ? ChainKind.RESOLVED_PER_STREET
      : ChainKind.UNVERIFIED;

  return {
    ok: chain.ok,
    reason: chain.ok ? null : "la chaîne de décisions n'est pas cohérente",
    problems: chain.problems,

    handId: handId || `HS-${first.gameStateHash || "?"}-${list.length}`,
    schemaVersion: HAND_SOLUTION_SCHEMA_VERSION,
    sizingEngineVersion: SIZING_ENGINE_VERSION,
    solutionSchemaVersion: SOLUTION_SCHEMA_VERSION,

    /* ── ÉTAT INITIAL, tel que la première décision l'a vu ── */
    initial: {
      street: first.street,
      board: (first.board || []).slice(),
      pot: first.pot,
      effectiveStacks: first.effectiveStacks,
      spr: first.spr,
      positions: (first.players || []).map(p => p.position),
      players: (first.players || []).map(p => ({ position: p.position, stack: p.stack, committedTotal: p.committedTotal })),
      heroRange: first.heroRange || null,
      villainRanges: first.villainRanges || null,
      blinds: first.blinds || null,
      actionHistory: (first.actionHistory || []).slice(),
      gameType: first.gameType || null,
      evaluationModel: first.evaluationModel || null,
    },
    /* ── ÉTAT FINAL atteint ── */
    final: { street: last.street, board: (last.board || []).slice(), pot: last.pot, effectiveStacks: last.effectiveStacks },

    decisions: perDecision,
    links: chain.links,

    /* ── CE QUE LA CHAÎNE EST, ET CE QU'ELLE N'EST PAS ────────────────────────
       `chainConsistent` dit que chaque décision découle de la précédente.
       `chainKind` dit COMMENT la valeur a été obtenue.
       Aucun des deux ne dit qu'un solve unique a couvert toute la main — et
       aucun ne peut être mis à `true` par un appelant. */
    chainConsistent: chain.ok,
    chainKind,
    chainNote: chainKind === ChainKind.RESOLVED_PER_STREET
      ? "Chaque rue a été RE-RÉSOLUE à son état effectif, avec la carte réellement tombée. C'est le comportement correct (§38/§39) — et ce n'est pas un solve unique couvrant la main."
      : chainKind === ChainKind.SINGLE_DECISION
        ? "Une seule décision : il n'y a pas de chaîne."
        : "Enchaînement non vérifié — les états ne se suivent pas.",

    streetsCovered,
    streetsNotCovered,
    /* ── L'HORIZON DE LA MAIN — DÉRIVÉ, ET DÉLIBÉRÉMENT CONSERVATEUR ──────────
       Vrai seulement si CHAQUE décision non terminale a réellement valorisé les
       rues qui la suivaient. Une seule décision myope dans la chaîne suffit à le
       rendre faux : c'est elle qui a été prise sans voir la suite, et c'est ce
       que le joueur doit savoir. */
    everyDecisionValuedItsFuture: perDecision.every((d, i) =>
      i === perDecision.length - 1 ? true : d.coversStreetsAhead),
    /* Un seul solve a-t-il couvert toute la main ? Sur une chaîne, jamais. */
    singleSolveCoversHand: false,
    singleSolveNote: "Une HandSolution relie des solves distincts. Elle ne devient jamais l'équivalent d'un solve unique couvrant la main entière — juxtaposer des décisions ne crée pas d'horizon.",

    /* Le maillon faible gouverne l'annonce : une main n'est pas plus fiable que
       sa décision la moins fiable. */
    weakest: perDecision.reduce((m, d) => {
      if (!m) return d;
      const rank = (x) => (x.status === "COMPLETE" ? 2 : x.status === "PARTIAL" ? 1 : 0);
      return rank(d) < rank(m) ? d : m;
    }, null),
    totalEvLossBb: roundEv(perDecision.reduce((a, d) => a + (d.evLossBb || 0), 0)),
    anyDistinguishable: perDecision.some(d => d.distinguishable),
  };
}

/* Résumé lisible, dans la forme que le §49 demande. */
export function describeHandSolution(hs) {
  if (!hs || !hs.ok) return [`Main non exploitable${hs && hs.problems && hs.problems.length ? ` — ${hs.problems[0]}` : ""}`];
  const out = [];
  out.push(`Main ${hs.handId} · ${hs.decisions.length} décision(s) · rues ${hs.streetsCovered.join(" → ")}`);
  for (const d of hs.decisions) {
    const h = d.coversStreetsAhead
      ? `valeur sur ${d.streetsValued} rues`
      : "valeur sur la rue seule";
    out.push(`  ${d.street} · pot ${d.pot}bb · ${(d.selectedSizes?.bets || []).map(b => b.label).join(" · ") || "—"} · ${h}`);
  }
  out.push(hs.chainNote);
  if (!hs.everyDecisionValuedItsFuture) {
    out.push("Attention : au moins une décision a été prise sans que les rues suivantes participent à sa valeur.");
  }
  return out;
}
