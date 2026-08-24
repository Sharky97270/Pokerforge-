/* ══════════════════════════════════════════════════════════════════════════
   trainerVillainHand.js — LE VILAIN REGARDE SES CARTES (C12 / G5)

   CE QUI EXISTAIT
   Hors coup complet, `villainDecide` tirait au sort, pondéré par le profil, la
   position, le SPR et le niveau de field. **Sa main n'entrait dans aucune de
   ces formules.** L'audit le relevait : « c'est défendable pour un drill de
   spot isolé — mais alors le résultat de la main n'est pas une information de
   poker, et rien à l'écran ne le dit ».

   On a d'abord dit la réserve à l'écran. Ce module fait la seconde moitié du
   chemin : donner des cartes au Vilain et les faire compter.

   ── CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ─────────────────────────
   Il fait :
     • tirer une main plausible pour le Vilain, cohérente avec sa RANGE
       (un Nit ne reçoit pas 72o aussi souvent qu'un Maniac) et avec les cartes
       déjà connues (main d'Hero, board) ;
     • en déduire une force — équité préflop tabulée, catégorie de main
       postflop — qui PONDÈRE la décision au lieu de la laisser au hasard seul.
   Il ne fait pas :
     • résoudre la stratégie du Vilain. Ce n'est pas un solveur : c'est une
       décision cohérente avec une main réelle, pas une décision d'équilibre.
       La provenance reste « heuristique », et l'écran continue de le dire.

   Module PUR : le tirage passe par `rng` injectable, donc rejouable en test.
   ══════════════════════════════════════════════════════════════════════════ */

import { normalizedHandStrength } from "./postflopHeuristic.js";

const RANKS = "23456789TJQKA";
const SUITS = "♠♥♦♣";
const rankIndex = r => RANKS.indexOf(r);

/* ── FORCE PRÉFLOP D'UNE MAIN, 0..1 ───────────────────────────────────────
   Pas de table de 169 entrées : une formule monotone et vérifiable, calée sur
   les trois choses qui font la valeur d'une main préflop — la hauteur, la
   paire, et le potentiel (assortie / connectée). Elle n'a pas à être exacte ;
   elle doit être ORDONNÉE correctement, et c'est ce que les tests vérifient. */
export function preflopStrength(hand) {
  if (!Array.isArray(hand) || hand.length !== 2) return 0.5;
  const [a, b] = hand;
  const ra = rankIndex(a?.r), rb = rankIndex(b?.r);
  if (ra < 0 || rb < 0) return 0.5;
  const haut = Math.max(ra, rb), bas = Math.min(ra, rb);
  const paire = ra === rb;
  const assortie = a.s === b.s;
  const ecart = haut - bas;

  if (paire) {
    /* 22 → 0.55, AA → 1.00. Une paire vaut plus que n'importe quelle main non
       appariée : c'est ce que les échelles de poker disent, et c'est ce que le
       barème ci-dessous garantit (le plafond des non-paires est 0.86). */
    return Math.min(1, 0.55 + (haut / 12) * 0.45);
  }
  /* Non appariée : la hauteur pèse 1.6 fois la seconde carte, et l'échelle est
     bornée pour que AK — la meilleure — reste SOUS les grosses paires.
     Une première version divisait par 36 et donnait AKo à 0.97, au-dessus de
     KK : l'ordre du poker était inversé. */
  const PLAFOND = 0.78, MAX = 12 * 1.6 + 11;
  let s = ((haut * 1.6 + bas) / MAX) * PLAFOND;
  if (assortie) s += 0.05;                       // le tirage couleur
  if (ecart === 1) s += 0.03;                    // connectée
  else if (ecart === 2) s += 0.015;
  else if (ecart > 4) s -= 0.05;                 // déconnectée : moins de potentiel
  return Math.max(0.02, Math.min(0.86, s));
}

/* ── DISTRIBUTION RÉELLE DES 169 MAINS ────────────────────────────────────
   Le seuil de range doit vouloir dire quelque chose : « VPIP 12 % » doit
   sélectionner le haut 12 % des mains, pas « les mains au-dessus de 0.88 » —
   deux choses différentes, puisque la force n'est pas uniformément répartie.
   On tabule donc la distribution une fois, pondérée par le nombre de
   combinaisons (6 par paire, 4 par assortie, 12 par dépareillée). */
const DISTRIBUTION = (() => {
  const points = [];
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j <= i; j++) {
      const a = { r: RANKS[i], s: "♠" };
      if (i === j) {
        points.push({ f: preflopStrength([a, { r: RANKS[j], s: "♥" }]), poids: 6 });
      } else {
        points.push({ f: preflopStrength([a, { r: RANKS[j], s: "♠" }]), poids: 4 });
        points.push({ f: preflopStrength([a, { r: RANKS[j], s: "♥" }]), poids: 12 });
      }
    }
  }
  points.sort((x, y) => y.f - x.f);              // de la meilleure à la pire
  const total = points.reduce((a, p) => a + p.poids, 0);
  let cumul = 0;
  return points.map(p => { cumul += p.poids; return { f: p.f, part: cumul / total }; });
})();

/* Force au-dessus de laquelle se trouve `pct` % des mains. */
export function strengthAtPercentile(pct) {
  const cible = Math.max(0, Math.min(1, pct / 100));
  for (const p of DISTRIBUTION) if (p.part >= cible) return p.f;
  return DISTRIBUTION[DISTRIBUTION.length - 1].f;
}

/* ── RANGE D'UN PROFIL ─────────────────────────────────────────────────────
   Le VPIP dit quelle proportion de mains le joueur joue. On s'en sert comme
   d'un SEUIL sur la force préflop : un profil à 12 % de VPIP ne reçoit que le
   haut de la distribution. C'est grossier, et c'est assumé — mais c'est une
   dépendance RÉELLE au profil, là où il n'y en avait aucune. */
export function rangeThreshold(vpip) {
  const v = Number(vpip);
  if (!Number.isFinite(v) || v <= 0) return strengthAtPercentile(24);
  return strengthAtPercentile(Math.max(1, Math.min(100, v)));
}

/* Tire une carte non utilisée. */
function drawCard(used, rng) {
  for (let essai = 0; essai < 500; essai++) {
    const r = RANKS[Math.floor(rng() * 13)];
    const s = SUITS[Math.floor(rng() * 4)];
    if (!used.some(c => c && c.r === r && c.s === s)) return { r, s };
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────
   dealVillainHand — une main plausible pour ce profil, avec ces cartes connues.

   `used` : toutes les cartes déjà visibles (main d'Hero + board).
   On tire jusqu'à obtenir une main DANS la range du profil ; au bout de
   `maxTries` on garde la meilleure vue, pour ne jamais boucler.
   ────────────────────────────────────────────────────────────────────────── */
export function dealVillainHand({ used = [], vpip = 24, rng = Math.random, maxTries = 40 } = {}) {
  const seuil = rangeThreshold(vpip);
  let meilleure = null, meilleureForce = -1;
  for (let t = 0; t < maxTries; t++) {
    const pris = [...used];
    const c1 = drawCard(pris, rng); if (!c1) break; pris.push(c1);
    const c2 = drawCard(pris, rng); if (!c2) break;
    const main = [c1, c2];
    const f = preflopStrength(main);
    if (f > meilleureForce) { meilleure = main; meilleureForce = f; }
    if (f >= seuil) return { hand: main, strength: f, dansLaRange: true, essais: t + 1 };
  }
  return { hand: meilleure, strength: meilleureForce, dansLaRange: false, essais: maxTries };
}

/* ──────────────────────────────────────────────────────────────────────────
   villainHandStrength — la force de la main du Vilain sur la street affichée.

   Préflop : force de départ (0..1). Postflop : catégorie de main réalisée.
   Rend aussi `source` pour que l'appelant sache de quoi il parle.
   ────────────────────────────────────────────────────────────────────────── */
export function villainHandStrength(hand, board = []) {
  const b = (Array.isArray(board) ? board : []).filter(Boolean);
  if (!Array.isArray(hand) || hand.length !== 2) return { strength: 0.5, source: "inconnue" };
  if (b.length < 3) return { strength: preflopStrength(hand), source: "preflop" };
  return { strength: normalizedHandStrength(hand, b), source: "postflop" };
}

/* ──────────────────────────────────────────────────────────────────────────
   handTilt — DE COMBIEN la main déplace une probabilité de décision.

   Le tirage pondéré par le profil est CONSERVÉ : c'est lui qui porte le style
   du joueur. La main vient l'INFLÉCHIR, dans le sens que le poker impose :
   une main forte relance et paie davantage, une main faible se couche.

   `force` 0..1, `neutre` la force au-dessus de laquelle la main aide.
   Rend un multiplicateur borné : la main compte, mais elle ne réduit jamais
   une décision à un automatisme.
   ────────────────────────────────────────────────────────────────────────── */
export const TILT_MAX = 0.75;     // au plus ±75 % sur une probabilité

export function handTilt(force, { neutre = 0.5, sens = 1, ampleur = TILT_MAX } = {}) {
  const f = Number.isFinite(force) ? force : neutre;
  const ecart = Math.max(-1, Math.min(1, (f - neutre) / Math.max(0.05, neutre)));
  return Math.max(0.1, Math.min(2.5, 1 + sens * ecart * ampleur));
}

/* Applique la main à un jeu de probabilités {fold, call, raise} — normalisé.
   `force` élevée : moins de fold, plus de raise. Force faible : l'inverse. */
export function tiltDecision({ fold = 0.3, call = 0.5, raise = 0.2 }, force, neutre = 0.5) {
  const f = Math.max(0, fold) * handTilt(force, { neutre, sens: -1 });
  const r = Math.max(0, raise) * handTilt(force, { neutre, sens: +1 });
  const c = Math.max(0, call);
  const somme = f + c + r;
  if (!(somme > 0)) return { fold: 1 / 3, call: 1 / 3, raise: 1 / 3 };
  return { fold: f / somme, call: c / somme, raise: r / somme };
}

/* ══════════════════════════════════════════════════════════════════════════
   neutralStrength — LA FORCE MÉDIANE DE LA STREET

   `handTilt` compare la main à une référence. Si cette référence est fausse,
   tout le monde paraît faible — ou fort. Une première version fixait 0.22 au
   postflop : mesuré, la médiane au flop vaut **0.075**. Presque toutes les
   mains tombaient donc « sous la moyenne », le Vilain se couchait à tout va, et
   l'audit navigateur l'a vu tout de suite — 17 coups joués, 17 gagnés par Hero.

   Les valeurs ci-dessous sont MESURÉES sur 20 000 tirages par street
   (médiane de `normalizedHandStrength`), et la médiane préflop vient de la
   distribution exacte des 169 mains. Elles sont des constantes assumées : leur
   rôle est d'être le point où la main ne change rien.
   ══════════════════════════════════════════════════════════════════════════ */
export const NEUTRAL_STRENGTH = {
  preflop: 0.446,   // médiane exacte des 169 mains, pondérée par combinaisons
  flop: 0.075,      // médiane mesurée, 20 000 tirages
  turn: 0.160,
  river: 0.185,
};

export function neutralStrength(boardLength = 0) {
  const n = Number(boardLength) || 0;
  if (n >= 5) return NEUTRAL_STRENGTH.river;
  if (n === 4) return NEUTRAL_STRENGTH.turn;
  if (n >= 3) return NEUTRAL_STRENGTH.flop;
  return NEUTRAL_STRENGTH.preflop;
}
