/* ══════════════════════════════════════════════════════════════════════════
   trainerExtraCallers.js — LE SUIVEUR RÉPOND À LA RELANCE (C12)

   POURQUOI CE MODULE EXISTE
   Un spot de squeeze pose un SUIVEUR entre l'ouvreur et Hero : « CO ouvre à
   2.5, BTN suit, Hero squeeze ». Le générateur s'arrêtait là. Le BTN n'était
   jamais rappelé à parler — ni fold, ni call — et le coup complet le faisait
   entrer au flop avec ses 2.5bb pendant que les deux autres y entraient à 12bb.

   Tant que le coup complet refusait le multiway, cela ne se voyait pas. Depuis
   que `fullHandEngine` joue N joueurs, cet engagement inachevé produit un
   PALIER — un side pot parfaitement calculé, décrivant une situation qui ne
   peut pas exister : au poker, le tour d'enchères préflop se ferme quand tout
   le monde a égalé. Le side pot était juste ; l'histoire était fausse.

   Ce module fait parler ce siège. La décision est heuristique et le dit :
   elle compare une ÉQUITÉ CALCULÉE (matrice 169×169 du dépôt, pondérée par le
   card removal) à la cote du pot, avec une marge de position assumée.

   ── CE QU'IL NE FAIT PAS, ET POURQUOI ─────────────────────────────────────
   Le suiveur ne PEUT PAS re-relancer (cold 4-bet). Ce n'est pas un oubli :
   une re-relance rouvrirait la parole à Hero, dont la décision est déjà prise
   et déjà notée. Modéliser un 4-bet reviendrait à annuler l'exercice après
   coup. La limite est publiée par `EXTRA_CALLER_LIMITS` plutôt que passée sous
   silence.

   Module PUR (aucune dépendance React/DOM), entièrement testable.
   ══════════════════════════════════════════════════════════════════════════ */

import { handKey, preflopEquityVsRange, preflopStrength, rangeThreshold, strengthAtPercentile } from "./trainerVillainHand.js";
import { PF_HANDS } from "./solver/core/pushfold.js";

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = v => Math.round(num(v) * 2) / 2;      // demi-blinde
const EPS = 0.011;

/* ── LA RANGE DU RELANCEUR, EN CLAIR ───────────────────────────────────────
   Un squeeze est étroit. On construit la range comme le HAUT de la
   distribution des 169 mains : `pct` % des mains, seuil pris sur la même
   distribution que le reste du modèle du Vilain. Aucune table écrite à la
   main — c'est la même source que la force préflop. */
export const SQUEEZE_RANGE_PCT = 6;        // ~ 66+/AJs+/AQo+ ; assumé, pas solvé
export const OPEN_RANGE_PCT = 20;          // relance ordinaire, plus large

const CACHE_RANGE = new Map();
export function rangeFreqs(pct) {
  const cle = Math.max(1, Math.min(100, num(pct) || SQUEEZE_RANGE_PCT));
  if (CACHE_RANGE.has(cle)) return CACHE_RANGE.get(cle);
  const seuil = strengthAtPercentile(cle);
  const freqs = {};
  for (const k of PF_HANDS) {
    const f = preflopEquityVsRange(k, null);
    if (f != null && f >= seuil) freqs[k] = 1;
  }
  CACHE_RANGE.set(cle, freqs);
  return freqs;
}

/* Marge d'équité exigée en plus de la cote du pot. Elle n'est pas cosmétique :
   le suiveur jouera tout le coup HORS DE POSITION contre un relanceur qui a
   l'initiative, et il reste des joueurs derrière lui. Trois points d'équité
   est un ordre de grandeur assumé — pas une valeur solvée. */
export const MARGE_POSITION = 0.03;

export const EXTRA_CALLER_LIMITS = {
  peutRelancer: false,
  raison: "une re-relance rouvrirait la parole à Hero, dont la décision est déjà notée",
  methode: "équité calculée (169×169, card removal) contre la range supposée du relanceur, comparée à la cote du pot",
  provenance: "heuristique",
};

/* ──────────────────────────────────────────────────────────────────────────
   extraCallerDecision — un siège, une décision.

   entrées :
     hand        ses deux cartes
     engage      ce qu'il a DÉJÀ mis sur la street
     niveau      le total qu'il faut atteindre pour rester
     restant     son tapis
     pot         le pot AVANT sa décision
     vpip        son profil (largeur de range)
     raiserPct   largeur supposée de la range du relanceur

   sortie : { action:"CALL"|"FOLD", aPayer, to, equite, coteRequise, allIn, raison }
   ────────────────────────────────────────────────────────────────────────── */
export function extraCallerDecision({
  hand = null, engage = 0, niveau = 0, restant = 0, pot = 0,
  vpip = 24, raiserPct = SQUEEZE_RANGE_PCT,
} = {}) {
  const dejaMis = round(engage);
  const cible = round(niveau);
  const tapis = Math.max(0, round(restant));
  const manque = round(cible - dejaMis);

  /* Rien à payer : le siège a déjà égalé, il n'a aucune décision à prendre. */
  if (manque <= EPS) {
    return { action: "CALL", aPayer: 0, to: dejaMis, equite: null, coteRequise: 0, allIn: false, raison: "déjà à niveau" };
  }
  /* Plus de tapis : il est à tapis, il ne peut ni suivre ni se coucher. */
  if (tapis <= EPS) {
    return { action: "CALL", aPayer: 0, to: dejaMis, equite: null, coteRequise: 0, allIn: true, raison: "déjà à tapis" };
  }

  const aPayer = Math.min(manque, tapis);
  const potM = Math.max(0, round(pot));
  const coteRequise = aPayer / (potM + aPayer);      // équité minimale pour être rentable

  const cle = handKey(hand);
  const equite = cle ? preflopEquityVsRange(cle, rangeFreqs(raiserPct)) : null;
  const force = preflopStrength(hand);
  const seuilProfil = rangeThreshold(vpip);

  /* Une main illisible ne prend pas de décision inventée : elle se couche.
     C'est la seule sortie qui ne fabrique pas d'argent ni d'information. */
  if (equite == null) {
    return { action: "FOLD", aPayer: 0, to: dejaMis, equite: null, coteRequise, allIn: false, raison: "main illisible" };
  }

  /* Deux conditions, toutes deux nécessaires :
       ① la cote du pot est payée, marge de position comprise ;
       ② la main est dans la range du profil — un nit ne suit pas hors range
          parce que le prix est bon. */
  const cotePayee = equite >= coteRequise + MARGE_POSITION;
  const dansSaRange = force >= seuilProfil;
  const suit = cotePayee && dansSaRange;

  const pct = v => `${Math.round(v * 1000) / 10} %`;
  const raison = suit
    ? `équité ${pct(equite)} ≥ cote ${pct(coteRequise)} + marge ${pct(MARGE_POSITION)}`
    : !cotePayee
      ? `équité ${pct(equite)} < cote ${pct(coteRequise)} + marge ${pct(MARGE_POSITION)}`
      : `main hors range du profil (force ${pct(force)} < seuil ${pct(seuilProfil)})`;

  return {
    action: suit ? "CALL" : "FOLD",
    aPayer: suit ? aPayer : 0,
    to: suit ? round(dejaMis + aPayer) : dejaMis,
    equite, coteRequise,
    allIn: suit && aPayer >= tapis - EPS,
    raison,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   resolveExtraCallers — tous les sièges supplémentaires, dans l'ordre.

   Le pot GRANDIT au fur et à mesure : le deuxième suiveur voit la cote que le
   premier vient de créer. Traiter les décisions en parallèle sur un pot figé
   donnerait des cotes fausses à tout le monde sauf au premier.

   sortie : { decisions:[…], suiveurs:[pos], couches:[pos], potApres, totalPaye }
   ────────────────────────────────────────────────────────────────────────── */
export function resolveExtraCallers({
  extras = [], niveau = 0, pot = 0, engagements = {}, tapis = {},
  hands = {}, vpips = {}, raiserPct = SQUEEZE_RANGE_PCT, vpipDefaut = 24,
} = {}) {
  let potCourant = Math.max(0, round(pot));
  let totalPaye = 0;
  const decisions = [], suiveurs = [], couches = [];

  for (const e of extras) {
    const pos = typeof e === "string" ? e : (e && (e.pos || e.position));
    if (!pos) continue;
    const d = extraCallerDecision({
      hand: hands[pos] || (e && e.hand) || null,
      engage: num(engagements[pos]),
      niveau,
      restant: num(tapis[pos]),
      pot: potCourant,
      vpip: vpips[pos] ?? (e && (e.vpip ?? e.vpipPct)) ?? vpipDefaut,
      raiserPct,
    });
    decisions.push({ pos, ...d });
    if (d.action === "CALL") {
      suiveurs.push(pos);
      potCourant = round(potCourant + d.aPayer);
      totalPaye = round(totalPaye + d.aPayer);
    } else {
      couches.push(pos);
    }
  }
  return { decisions, suiveurs, couches, potApres: potCourant, totalPaye };
}

/* ── CONTRÔLE : APRÈS RÉSOLUTION, LE PRÉFLOP EST CLOS ─────────────────────
   Tout siège encore assis a le MÊME engagement, sauf s'il est à tapis. C'est
   exactement l'invariant `F10-flop-non-egalise` de l'audit navigateur, rendu
   testable hors navigateur. Retourne la liste des écarts ; vide = clos. */
export function auditPreflopClos({ seats = {}, niveau = 0, assis = [] } = {}) {
  const problems = [];
  const cible = round(niveau);
  for (const p of assis) {
    const s = seats[p];
    if (!s) { problems.push({ code: "siege-inconnu", position: p }); continue; }
    const total = round(s.total ?? s.committed ?? 0);
    const restant = round(s.remaining ?? s.stack ?? 0);
    if (Math.abs(total - cible) <= EPS) continue;
    if (total < cible - EPS && restant > EPS) {
      problems.push({ code: "engagement-inferieur", position: p, total, niveau: cible, restant });
    } else if (total > cible + EPS) {
      problems.push({ code: "engagement-superieur", position: p, total, niveau: cible });
    }
  }
  return problems;
}
