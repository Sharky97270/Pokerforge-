/* ══════════════════════════════════════════════════════════════════════════
   PFASE · SIZINGS D'OUVERTURE PRÉFLOP (mission §54)

   § 54 nomme des paramètres précis : « baseRaise, additionalPerLimp,
   additionalPerCaller, ipSizing, oopSizing ». Ce module les fournit.

   ── CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ──────────────────────────
   Il CONSTRUIT des montants d'ouverture corrects au regard de l'état : une
   ouverture à 2.5 bb devient 4.5 bb derrière deux limpeurs, parce qu'un open
   qui ignore les limpeurs offre une cote absurde à quatre joueurs. C'est de
   l'arithmétique de table, et elle est vérifiable.

   Il ne PRÉTEND PAS départager ces montants. Classer des sizings d'ouverture
   demanderait de comparer leur EV, or l'EV d'une ouverture préflop se réalise
   presque entièrement APRÈS le flop : il faudrait résoudre l'arbre complet des
   trois rues suivantes pour chaque candidat. Ce n'est pas à la portée du moteur
   (L1), et un classement produit sans cela serait une opinion déguisée en
   mesure — exactement ce que le §0 interdit.

   La conséquence est assumée et visible : au préflop, PFASE OFFRE des sizings
   et n'en RETIENT aucun par comparaison. `rankable:false` le porte, et
   `trainingSolutionResolver` continue de refuser le préflop pour toute
   prétention stratégique.

   ── POURQUOI DEUX BASES, IP ET OOP ──────────────────────────────────────────
   Ce n'est pas une préférence de style. En position, l'ouvreur réalise mieux son
   équité postflop et peut donc ouvrir plus petit à profit égal ; hors de
   position, il lui faut refuser plus de cote. Les deux valeurs sont des
   PARAMÈTRES déclarés, pas des vérités : elles décrivent une structure d'arbre,
   et le module ne les présente jamais comme optimales.
   ══════════════════════════════════════════════════════════════════════════ */

import { EPS } from "./config.js";
import { ActionType } from "./gameState.js";

/* Paramètres du §54, avec des valeurs par défaut usuelles — DÉCLARÉES comme des
   conventions de structure, jamais comme un résultat de calcul. */
export const DEFAULT_PREFLOP_TREE = Object.freeze({
  /* Ouverture de base, en grosses blindes. */
  ipSizing: 2.5,
  oopSizing: 3.0,
  /* Ce qu'on ajoute par limpeur déjà entré, et par payeur d'une ouverture
     (cold-call) déjà derrière — deux populations distinctes, deux paramètres. */
  additionalPerLimp: 1.0,
  additionalPerCaller: 1.0,
  /* Multiples appliqués à la mise affrontée pour les 3-bet et 4-bet. Même
     remarque : ce sont des structures d'arbre, pas des recommandations. */
  threeBetIp: 3.0,
  threeBetOop: 4.0,
  fourBet: 2.2,
});

/* ══════════════════════════════════════════════════════════════════════════
   preflopContext — LIRE LA TABLE, ne rien supposer

   Un limpeur et un payeur d'ouverture engagent tous deux des jetons sans
   relancer ; les confondre fausserait le montant, puisque §54 leur donne deux
   paramètres différents. On les distingue par ce qui les précède : un limpeur
   paie alors que personne n'a encore relancé, un caller paie APRÈS une relance.
   ══════════════════════════════════════════════════════════════════════════ */
export function preflopContext(state) {
  if (!state || state.street !== "PREFLOP") {
    return { ok: false, reason: "contexte préflop demandé sur une autre rue" };
  }
  const hist = state.actionHistory || [];
  let limpers = 0, callers = 0, raises = 0, opener = null;
  for (const a of hist) {
    const t = a.actionType;
    if (t === ActionType.RAISE || t === ActionType.BET || t === ActionType.ALL_IN) {
      raises++;
      if (raises === 1) opener = a.position || null;
      continue;
    }
    if (t === ActionType.CALL) {
      /* Avant toute relance : c'est un limpeur. Après : un cold-caller. */
      if (raises === 0) limpers++; else callers++;
    }
  }
  /* La position d'Hero par rapport à l'ouvreur détermine IP/OOP au sens de ce
     module. Sans ouvreur (Hero ouvre lui-même), on retombe sur l'ordre de parole
     postflop, que `gameState` a déjà établi. */
  const actor = state.actorPosition || null;
  return {
    ok: true,
    limpers, callers, raises, opener,
    facingRaise: raises > 0,
    /* `null` quand la table ne permet pas de trancher — et le champ vaut alors
       `null`, pas `false` : « on ne sait pas » n'est pas « hors de position ». */
    heroInPosition: positionIsIP(actor, opener, state),
    actorPosition: actor,
  };
}

/* Ordre de parole postflop : BTN et CO parlent après les blindes et l'UTG.
   Table volontairement explicite plutôt qu'un calcul d'index — les tables à
   6 et 9 joueurs n'ont pas les mêmes sièges, et une formule cacherait le cas
   particulier du bouton. */
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG1", "UTG2", "LJ", "HJ", "MP", "MP1", "MP2", "CO", "BTN"];
function positionIsIP(actor, opener, state) {
  if (!actor) return null;
  if (!opener) {
    /* Hero ouvre : « en position » se lit par rapport à la table entière. Le
       bouton et le cutoff le sont ; les blindes ne le sont jamais. */
    if (actor === "BTN") return true;
    if (actor === "SB" || actor === "BB") return false;
    return POSTFLOP_ORDER.indexOf(actor) >= POSTFLOP_ORDER.indexOf("CO");
  }
  const ia = POSTFLOP_ORDER.indexOf(actor), io = POSTFLOP_ORDER.indexOf(opener);
  if (ia < 0 || io < 0) return null;
  return ia > io;
}

/* ══════════════════════════════════════════════════════════════════════════
   preflopOpenAmountBb — LE MONTANT, ET SA DÉCOMPOSITION

   Renvoie toujours le détail du calcul, pas seulement le total. C'est ce qui
   permet à l'écran de dire « 2.5 bb + 2 limpeurs × 1 bb = 4.5 bb » au lieu
   d'afficher un nombre que personne ne peut vérifier.
   ══════════════════════════════════════════════════════════════════════════ */
export function preflopOpenAmountBb(state, params = {}) {
  const p = { ...DEFAULT_PREFLOP_TREE, ...params };
  const ctx = preflopContext(state);
  if (!ctx.ok) return { ok: false, reason: ctx.reason };

  if (ctx.facingRaise) {
    /* Face à une relance, l'unité naturelle n'est plus la blinde mais la mise
       affrontée (§6) : un 3-bet se dit « ×3 de l'open », pas « 9 bb ». */
    const mult = ctx.raises >= 2 ? p.fourBet : (ctx.heroInPosition ? p.threeBetIp : p.threeBetOop);
    return {
      ok: true, kind: ctx.raises >= 2 ? "4bet" : "3bet",
      multipleOfFacing: mult,
      /* Chaque cold-caller déjà entré ajoute une part, comme pour l'open : il
         grossit le pot que le relanceur doit refuser de partager. */
      addedForCallers: p.additionalPerCaller * ctx.callers,
      context: ctx,
      breakdown: `${mult}× la mise affrontée${ctx.callers ? ` + ${ctx.callers} payeur(s) × ${p.additionalPerCaller}` : ""}`,
    };
  }

  const base = ctx.heroInPosition === true ? p.ipSizing : p.oopSizing;
  const addLimp = p.additionalPerLimp * ctx.limpers;
  const addCall = p.additionalPerCaller * ctx.callers;
  const total = base + addLimp + addCall;
  return {
    ok: true, kind: ctx.limpers > 0 ? "iso" : "open",
    amountBb: Math.round(total * 100) / 100,
    base, addLimp, addCall,
    context: ctx,
    breakdown: `${base} bb${ctx.limpers ? ` + ${ctx.limpers} limpeur(s) × ${p.additionalPerLimp}` : ""}`
      + `${ctx.callers ? ` + ${ctx.callers} payeur(s) × ${p.additionalPerCaller}` : ""}`
      + ` = ${Math.round(total * 100) / 100} bb`,
    /* §0 — ce montant décrit une STRUCTURE d'arbre. Il n'a pas été comparé à un
       autre par mesure d'EV, et rien en aval ne doit le présenter comme retenu. */
    rankable: false,
    rankableNote: "montant d'ouverture construit à partir de l'état, non comparé par EV : classer des sizings préflop exigerait de résoudre les trois rues suivantes (cf. LIMITATIONS L1).",
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   preflopCandidates — l'ensemble des ouvertures LÉGALES et distinctes

   On part du montant du §54 et on l'entoure de variantes usuelles. Deux règles :

     · les doublons sont écartés APRÈS quantification au pas de la table — deux
       paramètres différents peuvent produire le même montant, et proposer deux
       fois « 4.5 bb » sous deux étiquettes serait un faux choix ;
     · rien sous la relance minimale légale n'est proposé, et rien au-dessus du
       tapis effectif. Un montant injouable n'est pas un candidat (§34).
   ══════════════════════════════════════════════════════════════════════════ */
export function preflopCandidates(state, params = {}) {
  const r = preflopOpenAmountBb(state, params);
  if (!r.ok) return { ok: false, reason: r.reason };
  const bb = (state.blinds && state.blinds.bb) || 1;
  const step = state.betStepBb || 0.5;
  const minTo = Math.max(state.minimumRaise || 0, bb);
  const maxTo = (state.actorCommittedStreet || 0) + (state.effectiveStack || 0);

  const bruts = r.kind === "3bet" || r.kind === "4bet"
    ? [r.multipleOfFacing * state.currentBet + r.addedForCallers * bb,
       (r.multipleOfFacing - 0.5) * state.currentBet + r.addedForCallers * bb,
       (r.multipleOfFacing + 0.5) * state.currentBet + r.addedForCallers * bb]
    : [r.amountBb * bb, (r.amountBb - 0.5) * bb, (r.amountBb + 0.5) * bb, (r.amountBb + 1) * bb];

  const vus = new Set();
  const candidats = [], ecartes = [];
  for (const brut of bruts) {
    const q = Math.round(brut / step) * step;
    const arrondi = Math.round(q * 100) / 100;
    if (arrondi < minTo - EPS.amount) { ecartes.push({ montant: arrondi, raison: `sous la relance minimale légale (${minTo} bb)` }); continue; }
    if (arrondi > maxTo + EPS.amount) { ecartes.push({ montant: arrondi, raison: `au-dessus du tapis effectif (${maxTo} bb)` }); continue; }
    const cle = arrondi.toFixed(2);
    if (vus.has(cle)) { ecartes.push({ montant: arrondi, raison: "doublon après quantification au pas de la table" }); continue; }
    vus.add(cle);
    candidats.push({ toBb: arrondi, multipleOfBb: Math.round((arrondi / bb) * 100) / 100 });
  }
  return {
    ok: true, kind: r.kind, principal: candidats[0] || null,
    candidats, ecartes, breakdown: r.breakdown, context: r.context,
    rankable: false, rankableNote: r.rankableNote,
  };
}
