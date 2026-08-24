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
     • en déduire une force — ÉQUITÉ PRÉFLOP CALCULÉE depuis la matrice 169×169
       du dépôt, catégorie de main réalisée postflop — qui PONDÈRE la décision
       au lieu de la laisser au hasard seul.
   Il ne fait pas :
     • résoudre la stratégie du Vilain. L'équité, elle, est calculée et sa
       provenance est publiée (`PREFLOP_EQUITY_PROVENANCE`) ; la STRATÉGIE qui
       s'en sert reste heuristique, et l'écran continue de le dire.

   Module PUR : le tirage passe par `rng` injectable, donc rejouable en test.
   ══════════════════════════════════════════════════════════════════════════ */

import { normalizedHandStrength } from "./postflopHeuristic.js";
import { PF_HANDS, pfEquity, pfCardRemovalWeights, pfComboCounts, PF_MATRIX_META } from "./solver/core/pushfold.js";

const RANKS = "23456789TJQKA";
const SUITS = "♠♥♦♣";
const rankIndex = r => RANKS.indexOf(r);

/* Clé canonique d'une main : « AA », « AKs », « AKo ». C'est l'index de la
   matrice d'équité du dépôt. */
export function handKey(hand) {
  if (!Array.isArray(hand) || hand.length !== 2) return null;
  const [a, b] = hand;
  const ra = rankIndex(a?.r), rb = rankIndex(b?.r);
  if (ra < 0 || rb < 0) return null;
  const haut = RANKS[Math.max(ra, rb)], bas = RANKS[Math.min(ra, rb)];
  if (ra === rb) return haut + haut;
  return haut + bas + (a.s === b.s ? "s" : "o");
}

/* ══════════════════════════════════════════════════════════════════════════
   ÉQUITÉ PRÉFLOP — CALCULÉE, PLUS ESTIMÉE

   La première version notait les mains avec un barème maison : hauteur ×1.6,
   bonus assortie, malus déconnectée. Il était correctement ORDONNÉ, mais ce
   n'était pas une équité — juste une intuition chiffrée, et sa provenance
   restait « heuristique ».

   Le dépôt embarque pourtant la vraie matrice : `src/solver/data/preflopEquity.js`,
   169×169 équités all-in, générée hors ligne, avec ses métadonnées et son bruit
   documenté. `pushfold.js` sait déjà la lire et pondère par le CARD REMOVAL
   (une main ne peut pas affronter une main qui partage ses cartes).

   `preflopEquityVsRandom` en tire, pour chaque main, son équité moyenne contre
   une main quelconque — un nombre CALCULÉ, avec une provenance nommée :

       eq(i) = Σ_j W[i][j] · eq(i,j) / Σ_j W[i][j]

   Ce que ce n'est pas : une équité contre la range réelle de l'adversaire.
   `preflopEquityVsRange` existe pour ça et accepte des poids ; par défaut on
   prend l'adversaire quelconque, et on le dit.
   ══════════════════════════════════════════════════════════════════════════ */
export const PREFLOP_EQUITY_PROVENANCE = {
  engine: "solver/data/preflopEquity.js",
  method: "équité all-in 169×169, pondérée par le card removal",
  iterations: PF_MATRIX_META.iters,
  matchups: PF_MATRIX_META.matchups,
  noise: PF_MATRIX_META.matrixNoise,
  reference: "adversaire quelconque (main uniforme)",
};

const HAND_INDEX = (() => {
  const m = new Map();
  PF_HANDS.forEach((k, i) => m.set(k, i));
  return m;
})();

/* Équité d'une main contre une RANGE pondérée (par défaut : uniforme). */
export function preflopEquityVsRange(key, freqs = null) {
  const i = HAND_INDEX.get(key);
  if (i == null) return null;
  const W = pfCardRemovalWeights();
  let num = 0, den = 0;
  for (let j = 0; j < PF_HANDS.length; j++) {
    const poidsRange = freqs ? (Number(freqs[PF_HANDS[j]]) || 0) : 1;
    if (poidsRange <= 0) continue;
    const w = W[i][j] * poidsRange;
    if (w <= 0) continue;
    num += w * pfEquity(i, j);
    den += w;
  }
  return den ? num / den / 100 : null;   // 0..1
}

/* Table calculée UNE fois : équité de chacune des 169 mains vs main quelconque. */
const EQUITY_VS_RANDOM = (() => {
  const t = new Map();
  for (const k of PF_HANDS) t.set(k, preflopEquityVsRange(k, null));
  return t;
})();

export function preflopEquityVsRandom(key) {
  const v = EQUITY_VS_RANDOM.get(key);
  return v == null ? null : v;
}

/* ── FORCE PRÉFLOP D'UNE MAIN, 0..1 ───────────────────────────────────────
   C'est désormais son ÉQUITÉ contre une main quelconque — un nombre calculé,
   pas un barème. Une main illisible rend 0.5 (neutre), jamais une valeur
   inventée. */
export function preflopStrength(hand) {
  const k = handKey(hand);
  if (!k) return 0.5;
  const eq = preflopEquityVsRandom(k);
  return eq == null ? 0.5 : eq;
}

/* ── DISTRIBUTION RÉELLE DES 169 MAINS ────────────────────────────────────
   Le seuil de range doit vouloir dire quelque chose : « VPIP 12 % » doit
   sélectionner le haut 12 % des mains. On tabule donc la distribution des
   équités, pondérée par le nombre de COMBINAISONS réellement distribuables
   (6 par paire, 4 par assortie, 12 par dépareillée) — les combos viennent
   eux aussi du solveur, pas d'une hypothèse. */
const DISTRIBUTION = (() => {
  const combos = pfComboCounts();
  const points = PF_HANDS.map((k, i) => ({ f: preflopEquityVsRandom(k), poids: combos[i] }))
    .filter(p => p.f != null && p.poids > 0);
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
  /* Médiane EXACTE de la distribution des équités, pondérée par les combos.
     Elle vaut ~0.50 : une main quelconque gagne une fois sur deux contre une
     autre main quelconque — c est la définition même de l équité, et c est ce
     qui rend cette référence vérifiable au lieu d être choisie. */
  preflop: strengthAtPercentile(50),
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
