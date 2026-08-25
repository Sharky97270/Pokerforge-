/* ══════════════════════════════════════════════════════════════════════════
   PFASE · EXTRACTION DE STRATÉGIE (Mission §17, §29, §33, §38, §39, §93)

   Transforme une solution CFR (objet vivant, porteur de closures et de tableaux
   typés) en DONNÉES PURES stockables et transmissibles à un Worker, au Trainer,
   au Replayer et au Coach.

   ── PÉRIMÈTRE ASSUMÉ : LA RUE COURANTE ──────────────────────────────────────
   On extrait les nœuds de décision de la STREET 0 de l'arbre — c'est-à-dire la
   rue du board fourni. Les rues suivantes ne sont PAS extraites, et c'est
   volontaire, pour deux raisons qui vont dans le même sens :

     1. TAILLE. La stratégie d'un nœud de turn dépend de la carte tombée : le
        moteur indexe ses tables par runout. Extraire la turn, ce serait extraire
        jusqu'à 48 stratégies par nœud, puis 47 de plus à la river. La solution
        pèserait des dizaines de mégaoctets pour un usage que personne n'a.

     2. JUSTESSE (§38/§39). « Le sizing proposé à la turn dépend du nouvel état.
        Ne pas réutiliser naïvement le sizing flop. » Rejouer la turn à partir
        d'une extraction figée du flop reviendrait exactement à cela. La bonne
        réponse est de RE-RÉSOUDRE au nouvel état — pot, tapis et SPR ayant
        changé — ce que fait le Trainer à chaque transition de rue.

   La solution porte donc `coversStreetsAhead:false` : un consommateur qui aurait
   besoin de la turn sait qu'il doit demander une nouvelle solution, au lieu de
   lire un champ absent et de se rabattre sur autre chose.
   ══════════════════════════════════════════════════════════════════════════ */

import { EPS } from "./config.js";
import { roundTo, roundAmount, specKey, specLabel } from "./sizingSpec.js";
import { checkStrategyNormalization } from "./metrics.js";

/* Sémantique d'un label d'action de l'arbre, en TYPES STRICTS (§37).
   « Ne jamais qualifier un CALL de BET. » Le label du moteur est une lettre ;
   sa traduction est faite ICI, une fois, et jamais devinée ailleurs. */
export function actionTypeOfLabel(label, node) {
  const l = String(label);
  if (l === "X") return node && node.toCall > EPS.amount ? "CALL" : "CHECK";
  if (l === "F") return "FOLD";
  if (l === "C") return "CALL";
  if (l === "J") return "ALL_IN";
  if (l.startsWith("R")) return "RAISE";
  if (l.startsWith("B")) return "BET";
  return "BET";
}

/* Montant ENGAGÉ EN PLUS par l'action, lu sur l'arbre (jamais recalculé depuis
   un libellé — c'est précisément le bug historique `betFracFromLabel`). */
export function actionAmountOf(node, label) {
  const child = node.children ? node.children[label] : null;
  if (!child) return { additionalBb: 0, toBb: 0 };
  const before = node.player === 0 ? node.betsH : node.betsV;
  const after = node.player === 0 ? (child.betsH ?? before) : (child.betsV ?? before);
  const additional = Math.max(0, after - before);
  return { additionalBb: roundAmount(additional), toBb: roundAmount(after) };
}

/* Chemin d'un nœud depuis la racine, sous forme de labels joints par « | ».
   La racine porte le chemin vide "". */
export const pathKey = (path) => (path || []).join("|");

/* ══════════════════════════════════════════════════════════════════════════
   extractStreetStrategy — nœuds de décision de la rue courante.

   Sortie (plain data, clonable) :
   {
     coversStreetsAhead:false,
     nodes: {
       "<path>": {
         path:[…], player, actions:[…], actionTypes:{label→type},
         sizings:{ label→{ specKey, label, additionalBb, toBb, potFraction } },
         aggregate:{ label→fréquence 0..1 },   // pondérée par la range
         byClass:{ "AKs":{ label→fréquence } },
         potBb, toCallBb, normalization:{ ok, sum }
       }
     },
     classes:[…]     // classes de mains présentes dans la range du joueur
   }
   ══════════════════════════════════════════════════════════════════════════ */
export function extractStreetStrategy(solution, { includeByClass = true, maxClasses = 200 } = {}) {
  if (!solution || !solution.tree || typeof solution.avgOf !== "function") return null;
  const nodes = {};
  const seenClasses = new Set();

  /* Index des combos par classe de main, une fois pour chaque camp. */
  const classIndex = (list) => {
    const m = new Map();
    for (let i = 0; i < list.length; i++) {
      const k = list[i].key;
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    return m;
  };
  const idxH = classIndex(solution.heroList || []);
  const idxV = classIndex(solution.villList || []);

  (function walk(node, path) {
    if (!node) return;
    if (node.kind === "chance") return;             // on n'entre pas dans la rue suivante
    if (node.kind === "terminal") return;
    if (node.street !== 0) return;                  // rue courante uniquement (cf. en-tête)

    const isHero = node.player === 0;
    const list = isHero ? solution.heroList : solution.villList;
    const weights = isHero ? solution.wH : solution.wV;
    const byClassIdx = isHero ? idxH : idxV;
    const na = node.actions.length;

    /* Fréquences AGRÉGÉES sur toute la range (pondérées). */
    const agg = new Array(na).fill(0);
    let wsum = 0;
    for (let c = 0; c < list.length; c++) {
      const w = weights[c] || 0;
      if (w <= 0) continue;
      const d = solution.avgOf(node, c, "");
      for (let k = 0; k < na; k++) agg[k] += w * d[k];
      wsum += w;
    }
    const aggregate = {};
    node.actions.forEach((lbl, k) => { aggregate[lbl] = wsum > 0 ? roundTo(agg[k] / wsum, 6) : 0; });

    /* Fréquences PAR CLASSE de main — ce que le Trainer lit pour la main du
       joueur. `reduceRange` ne garde qu'un représentant par classe ; on agrège
       donc sur les index de la classe. */
    const byClass = {};
    if (includeByClass) {
      let n = 0;
      for (const [key, idxs] of byClassIdx) {
        if (n++ >= maxClasses) break;
        seenClasses.add(key);
        const acc = new Array(na).fill(0);
        let ws = 0;
        for (const c of idxs) {
          const w = weights[c] || 0;
          const d = solution.avgOf(node, c, "");
          for (let k = 0; k < na; k++) acc[k] += w * d[k];
          ws += w;
        }
        if (ws <= 0) continue;
        const row = {};
        node.actions.forEach((lbl, k) => { row[lbl] = roundTo(acc[k] / ws, 6); });
        byClass[key] = row;
      }
    }

    const sizings = {}, actionTypes = {};
    for (const lbl of node.actions) {
      const amt = actionAmountOf(node, lbl);
      const spec = node.sizingSpecs ? node.sizingSpecs[lbl] : null;
      actionTypes[lbl] = actionTypeOfLabel(lbl, node);
      sizings[lbl] = {
        specKey: spec ? specKey(spec) : null,
        specLabel: spec ? specLabel(spec) : null,
        spec: spec || null,
        additionalBb: amt.additionalBb,
        toBb: amt.toBb,
        /* Fraction du pot AVANT l'action — la grandeur que l'UI affiche. */
        potFraction: node.pot > EPS.amount ? roundTo(amt.additionalBb / node.pot, 4) : null,
      };
    }

    nodes[pathKey(path)] = {
      path: path.slice(),
      nodeId: node.id,
      player: node.player,
      actions: node.actions.slice(),
      actionTypes,
      sizings,
      aggregate,
      byClass,
      potBb: roundAmount(node.pot),
      toCallBb: roundAmount(node.toCall || 0),
      normalization: checkStrategyNormalization(aggregate),
    };

    for (const a of node.actions) walk(node.children[a], [...path, a]);
  })(solution.tree, []);

  return {
    coversStreetsAhead: false,
    coversStreetsNote: "Stratégie de la rue courante uniquement. Les rues suivantes se re-résolvent au nouvel état (pot, tapis et SPR changent) — voir §38/§39.",
    nodes,
    classes: [...seenClasses].sort(),
    nodeCount: Object.keys(nodes).length,
  };
}

/* Fréquences d'un nœud pour une classe de main donnée, avec repli explicite sur
   l'agrégat de range. Le repli est SIGNALÉ (`source`) — une fréquence de range
   n'est pas la fréquence d'une main, et le Coach doit pouvoir le dire. */
export function nodeStrategyFor(strategy, path, handClass) {
  const node = strategy && strategy.nodes ? strategy.nodes[pathKey(path)] : null;
  if (!node) return null;
  if (handClass && node.byClass && node.byClass[handClass]) {
    return { freqs: node.byClass[handClass], source: "hand-class", node };
  }
  return {
    freqs: node.aggregate, source: "range-aggregate", node,
    note: handClass ? `${handClass} absente de la range solvée — fréquences de la range entière` : null,
  };
}

/* Les actions LÉGALES d'un nœud, prêtes pour des boutons (§71).
   Rien n'est ajouté qui n'existe pas dans la solution : c'est la règle §71
   (« Ils ne doivent jamais contenir des options absentes de la solution active »). */
export function legalActionsFromNode(node) {
  if (!node) return [];
  return node.actions.map(lbl => ({
    label: lbl,
    actionType: node.actionTypes[lbl],
    additionalBb: node.sizings[lbl].additionalBb,
    toBb: node.sizings[lbl].toBb,
    potFraction: node.sizings[lbl].potFraction,
    specKey: node.sizings[lbl].specKey,
    specLabel: node.sizings[lbl].specLabel,
    frequency: node.aggregate[lbl],
  }));
}
