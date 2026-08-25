/* ══════════════════════════════════════════════════════════════════════════
   PFASE · TEXTURES DE BOARD (Mission §53)

   « Créer des propriétés dérivées SÉPARÉES DU SOLVER. Elles servent au filtrage,
   aux reports, aux explications. Elles ne doivent pas devenir des heuristiques
   cachées remplaçant le solve. »

   Cette dernière phrase est la raison d'être du fichier. Une texture est un FAIT
   OBSERVABLE sur cinq cartes — « ce board est monotone », « il est apparié ».
   Ce n'est jamais une consigne. Aucune fonction ici ne rend un sizing, une
   fréquence ou une action ; c'est structurellement impossible, il n'y a rien
   d'autre que des booléens et des comptages.

   Le danger que cela écarte est concret : PokerForge contient déjà des lignes du
   type « board sec → c-bet 33 % » (SOLVER_SIZINGS, postflopHeuristic). Les
   textures rendent ces raccourcis TENTANTS. On les fournit donc explicitement
   nues, pour le filtrage et l'explication — pas pour la décision.

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { cardKey } from "./gameState.js";

const RANKS = "23456789TJQKA";
const rankOf = (k) => RANKS.indexOf(k[0]);
const suitOf = (k) => k[1];

/* ══════════════════════════════════════════════════════════════════════════
   boardTexture — propriétés dérivées d'un board de 3 à 5 cartes.
   Retourne null si le board est illisible : on ne décrit pas ce qu'on n'a pas lu.
   ══════════════════════════════════════════════════════════════════════════ */
export function boardTexture(board) {
  const keys = (board || []).map(cardKey);
  if (!keys.length || keys.some(k => !k)) return null;
  if (new Set(keys).size !== keys.length) return null;   // carte dupliquée : board impossible

  const ranks = keys.map(rankOf).sort((a, b) => b - a);
  const suits = keys.map(suitOf);
  const suitCounts = {};
  for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
  const maxSuit = Math.max(...Object.values(suitCounts));
  const distinctSuits = Object.keys(suitCounts).length;

  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const paired = counts[0] >= 2;
  const trips = counts[0] >= 3;
  const doublePaired = counts.filter(c => c >= 2).length >= 2;

  /* Connexité : nombre de paires de cartes distantes d'au plus 2 rangs. Mesure
     descriptive, pas un jugement — « connecté » ne dit pas « joue plus gros ». */
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  let gapsSmall = 0;
  for (let i = 0; i < uniqueRanks.length - 1; i++) {
    if (uniqueRanks[i] - uniqueRanks[i + 1] <= 2) gapsSmall++;
  }
  const span = uniqueRanks.length > 1 ? uniqueRanks[0] - uniqueRanks[uniqueRanks.length - 1] : 0;

  /* Possibilité de quinte : au moins trois rangs distincts dans une fenêtre de 5. */
  let straightPossible = false;
  for (let lo = 0; lo <= 12 - 4 && !straightPossible; lo++) {
    const inWindow = uniqueRanks.filter(r => r >= lo && r <= lo + 4).length;
    if (inWindow >= 3) straightPossible = true;
  }
  /* La roue : l'As compte aussi comme le 1. */
  if (!straightPossible && uniqueRanks.includes(12)) {
    const low = uniqueRanks.filter(r => r <= 3).length;
    if (low >= 2) straightPossible = true;
  }

  const highCard = uniqueRanks[0];
  return {
    cards: keys,
    street: keys.length === 3 ? "FLOP" : keys.length === 4 ? "TURN" : keys.length === 5 ? "RIVER" : null,
    /* ── Couleur ── */
    monotone: maxSuit === keys.length,
    twoTone: maxSuit === 2 && keys.length === 3,
    rainbow: distinctSuits === keys.length,
    flushPossible: maxSuit >= 3,
    maxSuitCount: maxSuit,
    /* ── Rangs ── */
    paired, doublePaired, trips,
    /* ── Structure ── */
    connected: gapsSmall >= 2,
    disconnected: gapsSmall === 0,
    straightPossible,
    span,
    /* ── Hauteur ── */
    highCard: RANKS[highCard],
    highCardIndex: highCard,
    aceHigh: highCard === 12,
    broadway: highCard >= 8,          // T ou plus
    lowBoard: highCard <= 6,          // 8 ou moins
    /* ── Étiquettes agrégées, pour le filtrage et les reports (§52) ── */
    tags: buildTags({ maxSuit, keys, distinctSuits, paired, doublePaired, trips, gapsSmall, straightPossible, highCard }),
  };
}

function buildTags({ maxSuit, keys, distinctSuits, paired, doublePaired, trips, gapsSmall, straightPossible, highCard }) {
  const t = [];
  if (maxSuit === keys.length) t.push("monotone");
  else if (maxSuit >= 3) t.push("flush-possible");
  else if (maxSuit === 2) t.push("two-tone");
  if (distinctSuits === keys.length) t.push("rainbow");
  if (trips) t.push("trips");
  else if (doublePaired) t.push("double-paired");
  else if (paired) t.push("paired");
  if (gapsSmall >= 2) t.push("connected");
  else if (gapsSmall === 0) t.push("disconnected");
  if (straightPossible) t.push("straight-possible");
  if (highCard === 12) t.push("ace-high");
  else if (highCard >= 8) t.push("broadway");
  else if (highCard <= 6) t.push("low-card");
  return t;
}

/* Un board correspond-il à un filtre de textures ? Sert aux reports agrégés
   (§52) : « toutes les solutions sur board monotone », par exemple. */
export function matchesTexture(board, filter = {}) {
  const t = boardTexture(board);
  if (!t) return false;
  for (const [k, v] of Object.entries(filter)) {
    if (v == null) continue;
    if (k === "tags") { if (!v.every(tag => t.tags.includes(tag))) return false; continue; }
    if (t[k] !== v) return false;
  }
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   AGRÉGATION (§52) — la couche de données des futurs Aggregated Reports.

   On ne construit pas l'écran ; on garantit que le FORMAT des solutions permet
   de l'écrire. C'est exactement ce que §52 demande : « NE PAS concevoir un
   format de solution qui empêcherait cette évolution. »
   ══════════════════════════════════════════════════════════════════════════ */
export function aggregateSolutions(solutions, { groupBy = "tag" } = {}) {
  const groups = new Map();
  for (const s of solutions || []) {
    if (!s || !s.board) continue;
    const t = boardTexture(s.board);
    if (!t) continue;
    const keys = groupBy === "tag" ? t.tags
      : groupBy === "street" ? [s.street]
        : groupBy === "potType" ? [s.potType]
          : groupBy === "complexity" ? [s.sizingComplexity]
            : groupBy === "spr" ? [sprBucket(s.spr)]
              : ["all"];
    for (const k of keys) {
      if (!groups.has(k)) groups.set(k, { key: k, n: 0, evLoss: [], sizings: new Map(), betFreq: [] });
      const g = groups.get(k);
      g.n++;
      if (s.simplificationMetrics && typeof s.simplificationMetrics.absoluteEVLoss === "number") {
        g.evLoss.push(s.simplificationMetrics.absoluteEVLoss);
      }
      for (const b of (s.selectedSizes?.bets || [])) g.sizings.set(b.label, (g.sizings.get(b.label) || 0) + 1);
      /* Fréquence de mise agrégée à la racine, si la stratégie est là. */
      const root = s.strategy && s.strategy.nodes ? s.strategy.nodes[""] : null;
      if (root && root.aggregate) {
        const bet = Object.entries(root.aggregate)
          .filter(([lbl]) => lbl !== "X" && lbl !== "F" && lbl !== "C")
          .reduce((a, [, v]) => a + v, 0);
        g.betFreq.push(bet);
      }
    }
  }
  return [...groups.values()].map(g => ({
    key: g.key, n: g.n,
    evLossMean: mean(g.evLoss), evLossMax: g.evLoss.length ? Math.max(...g.evLoss) : null,
    betFrequencyMean: mean(g.betFreq),
    sizings: [...g.sizings.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
  })).sort((a, b) => b.n - a.n);
}
const mean = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10000) / 10000 : null);
export function sprBucket(spr) {
  if (spr == null) return "spr-inconnu";
  if (spr < 1) return "spr<1";
  if (spr < 2) return "spr 1-2";
  if (spr < 4) return "spr 2-4";
  if (spr < 8) return "spr 4-8";
  if (spr < 15) return "spr 8-15";
  return "spr 15+";
}
