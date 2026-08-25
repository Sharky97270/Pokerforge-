/* ══════════════════════════════════════════════════════════════════════════
   PFASE · GÉNÉRATEUR DE CANDIDATS (Mission §8)

   « Ce ne sont PAS des recommandations. Ce sont des ACTIONS CANDIDATES à
   évaluer. » — §8, mot pour mot.

   Rien ici ne décide qu'un sizing est bon. Ce module répond à une seule
   question : quelles actions sont MATÉRIELLEMENT JOUABLES dans cet état, et
   lesquelles sont distinctes les unes des autres ? Le tri par EV vient après, et
   ailleurs (`dynamicOptimizer.js`).

   Deux filtres, tous deux mathématiques et non stratégiques :
     1. JOUABILITÉ — un sizing qui dépasse le tapis N'EST PAS un sizing, c'est un
        jam ; un sizing sous la relance minimale n'existe pas.
     2. DISTINCTION — deux specs qui produisent le même montant sont la même
        action. Les garder tous deux créerait deux branches identiques dans
        l'arbre, entre lesquelles le solveur répartirait arbitrairement des
        fréquences — un artefact qui ressemble à de la stratégie.

   C'est ce second filtre qui fait, à lui seul, la « pertinence » du mode
   AUTOMATIC : à SPR 1.2, « 150% du pot », « 200% du pot » et « jam » sont le
   même montant, et il n'en reste qu'un. Aucune règle du type « board sec → 33% »
   n'est écrite nulle part, ni ici ni ailleurs (interdit §0).

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { DEFAULT_CANDIDATE_PROFILE, DEFAULT_COMBINATION_BUDGET, EPS, withDefaults } from "./config.js";
import {
  SizingType, potSizing, geometricSizing, previousBetSizing, bbSizing, jamSizing,
  resolveSizing, specKey, specLabel, normalizeSpec,
} from "./sizingSpec.js";
import { sizingContextFrom } from "./gameState.js";

/* ── Profils de candidats livrés ───────────────────────────────────────────
   Un profil décrit une AMPLEUR d'exploration, pas une opinion stratégique. */
export const CANDIDATE_PROFILES = Object.freeze({
  standard: DEFAULT_CANDIDATE_PROFILE,
  wide: Object.freeze({
    potFractions: Object.freeze([0.20, 0.25, 0.30, 0.33, 0.40, 0.50, 0.60, 0.66, 0.75, 0.80, 1.00, 1.25, 1.50, 2.00]),
    raiseMultiples: Object.freeze([2.0, 2.2, 2.5, 2.75, 3.0, 3.5, 4.0]),
    openMultiples: Object.freeze([2.0, 2.2, 2.5, 2.75, 3.0, 3.5, 4.0, 4.5]),
    geometric: true, jam: true,
  }),
  narrow: Object.freeze({
    potFractions: Object.freeze([0.33, 0.66, 1.00]),
    raiseMultiples: Object.freeze([2.5, 3.0]),
    openMultiples: Object.freeze([2.5, 3.0]),
    geometric: true, jam: true,
  }),
});

export function candidateProfile(nameOrProfile) {
  if (nameOrProfile && typeof nameOrProfile === "object") return withDefaults(DEFAULT_CANDIDATE_PROFILE, nameOrProfile);
  return CANDIDATE_PROFILES[nameOrProfile] || CANDIDATE_PROFILES.standard;
}

/* ══════════════════════════════════════════════════════════════════════════
   generateSizingCandidates

   Entrée : l'état canonique (§7) + un profil. Sortie :
     { bets:[Candidate], raises:[Candidate], context, dropped:[…], profile }
   avec Candidate = { spec, key, label, amountBb, additionalBb, potFraction,
                      allIn, source:"profile"|"geometric"|"jam" }

   `dropped` conserve CE QUI A ÉTÉ ÉCARTÉ ET POURQUOI — sans cette trace, un
   candidat absent ressemble à un oubli du moteur.
   ══════════════════════════════════════════════════════════════════════════ */
export function generateSizingCandidates({ state, profile, budget, includeRaises = true } = {}) {
  const prof = candidateProfile(profile);
  const bud = withDefaults(DEFAULT_COMBINATION_BUDGET, budget);
  if (!state) return { bets: [], raises: [], context: null, dropped: [{ reason: "état de jeu absent" }], profile: prof };

  const ctx = sizingContextFrom(state);
  const preflop = state.street === "PREFLOP";
  const facing = state.currentBet > EPS.amount;

  const dropped = [];
  /* ── Candidats de MISE (aucune mise à affronter) ──
     Au préflop la référence du poker est la grosse blinde, pas le pot : proposer
     « 33% du pot » pour une ouverture produirait 0.5bb, qui n'est pas une
     ouverture légale. C'est une question d'UNITÉ, pas de stratégie. */
  const betSpecs = [];
  if (preflop && !facing) {
    for (const m of prof.openMultiples) betSpecs.push({ spec: bbSizing(m), source: "profile" });
  } else {
    for (const f of prof.potFractions) betSpecs.push({ spec: potSizing(f), source: "profile" });
  }
  if (prof.geometric) {
    /* Un sizing géométrique par horizon possible : « au tapis en 1 rue », « en 2 »,
       « en 3 ». Ce sont trois montants différents, donc trois candidats. */
    for (let n = 1; n <= state.streetsRemaining; n++) betSpecs.push({ spec: geometricSizing(n), source: "geometric" });
  }
  if (prof.jam) betSpecs.push({ spec: jamSizing(), source: "jam" });

  /* ── Candidats de RELANCE (une mise est affrontée) ──
     Le multiple de la mise précédente est ici l'unité naturelle (§6). On y
     ajoute les fractions de pot, le géométrique et le jam : un solveur doit
     pouvoir sur-relancer en pourcentage de pot comme en multiple. */
  const raiseSpecs = [];
  if (includeRaises) {
    for (const m of prof.raiseMultiples) raiseSpecs.push({ spec: previousBetSizing(m), source: "profile" });
    for (const f of prof.potFractions) raiseSpecs.push({ spec: potSizing(f), source: "profile" });
    if (prof.geometric) for (let n = 1; n <= state.streetsRemaining; n++) raiseSpecs.push({ spec: geometricSizing(n), source: "geometric" });
    if (prof.jam) raiseSpecs.push({ spec: jamSizing(), source: "jam" });
  }

  const bets = materialize(betSpecs, ctx, { facing: false, state, dropped, kind: "bet" });
  const raises = includeRaises && facing
    ? materialize(raiseSpecs, ctx, { facing: true, state, dropped, kind: "raise" })
    : [];

  return {
    bets: trimCandidates(bets, bud.maxCandidates, dropped, "bet"),
    raises: trimCandidates(raises, bud.maxCandidates, dropped, "raise"),
    context: ctx,
    dropped,
    profile: prof,
    /* Ce que le générateur a VU — sert au débogage et au rapport (§95). */
    meta: {
      street: state.street, pot: state.pot, effectiveStack: state.effectiveStack,
      spr: state.spr, currentBet: state.currentBet, amountToCall: state.amountToCall,
      minimumRaise: state.minimumRaise, maximumRaise: state.maximumRaise,
      allInOnly: state.allInOnly, streetsRemaining: state.streetsRemaining,
      generatedBets: bets.length, generatedRaises: raises.length,
    },
  };
}

/* Résout chaque spec dans le contexte, écarte l'injouable, déduplique par
   MONTANT (et non par type de spec). */
function materialize(entries, ctx, { facing, state, dropped, kind }) {
  const out = [];
  const byAmount = new Map();
  for (const e of entries) {
    const spec = normalizeSpec(e.spec);
    if (!spec) { dropped.push({ kind, spec: e.spec, reason: "spec invalide" }); continue; }
    /* Un multiple de la mise précédente n'a aucun sens sans mise précédente. */
    if (spec.type === SizingType.PREVIOUS_BET && !facing) {
      dropped.push({ kind, key: specKey(spec), reason: "aucune mise affrontée" });
      continue;
    }
    const r = resolveSizing(spec, ctx);
    if (!r) { dropped.push({ kind, key: specKey(spec), reason: "non résoluble dans cet état" }); continue; }
    if (r.additionalChips <= EPS.amount) { dropped.push({ kind, key: specKey(spec), reason: "montant nul" }); continue; }
    /* ── SOUS LE MINIMUM LÉGAL : ÉCARTÉ, JAMAIS RELEVÉ (§34) ──────────────
       `resolveSizing` remonte au minimum légal ; c'est utile pour un curseur,
       pas pour un candidat. Un « 1.5× la mise » promu en « 2× » ferait évaluer
       un sizing que l'utilisateur n'a pas proposé, et le rendrait indiscernable
       d'un vrai « 2× ». On teste donc l'écrêtage lui-même, et pas seulement le
       montant final — qui, après écrêtage, est légal par construction. */
    if (facing && r.clamped === "minimum légal") {
      dropped.push({ kind, key: specKey(spec), reason: `sous la relance minimale (${state.minimumRaise}bb) — écarté plutôt que relevé` });
      continue;
    }
    if (facing && !r.allIn && r.computedAmount < state.minimumRaise - EPS.amount) {
      dropped.push({ kind, key: specKey(spec), reason: `sous la relance minimale (${state.minimumRaise}bb)` });
      continue;
    }
    const amtKey = String(Math.round(r.computedAmount * 1000));
    const prev = byAmount.get(amtKey);
    if (prev) {
      /* Doublon : on garde le spec le plus EXPLICATIF. Un jam reste un jam
         (§74) ; sinon on garde celui déjà présent et on trace l'éviction. */
      if (spec.type === SizingType.JAM && prev.spec.type !== SizingType.JAM) {
        prev.spec = spec; prev.key = specKey(spec); prev.label = specLabel(spec); prev.source = e.source;
      }
      dropped.push({ kind, key: specKey(spec), reason: `même montant que ${prev.key} (${prev.amountBb}bb)`, duplicateOf: prev.key });
      continue;
    }
    const cand = {
      spec, key: specKey(spec), label: specLabel(spec), source: e.source,
      amountBb: r.computedAmount, additionalBb: r.additionalChips,
      potFraction: r.potFraction, allIn: r.allIn, clamped: r.clamped,
    };
    byAmount.set(amtKey, cand);
    out.push(cand);
  }
  out.sort((a, b) => a.amountBb - b.amountBb);
  return out;
}

/* Réduit une liste au budget en conservant l'ÉTENDUE (petites, moyennes,
   grandes tailles) plutôt que le début de la liste. Un échantillonnage régulier
   est déterministe et se justifie : garder les N premières supprimerait toutes
   les grosses tailles, ce qui biaiserait la sélection avant toute mesure d'EV.
   Le tapis, quand il existe, est toujours conservé (c'est une action à part). */
export function trimCandidates(list, maxCount, dropped = [], kind = "bet") {
  if (!maxCount || list.length <= maxCount) return list;
  const jamIdx = list.findIndex(c => c.spec.type === SizingType.JAM);
  const keep = new Set();
  if (jamIdx >= 0) keep.add(jamIdx);
  const slots = maxCount - keep.size;
  for (let i = 0; i < slots; i++) {
    const idx = Math.round((i * (list.length - 1)) / Math.max(1, slots - 1));
    keep.add(idx);
  }
  const out = [];
  list.forEach((c, i) => {
    if (keep.has(i)) out.push(c);
    else dropped.push({ kind, key: c.key, reason: `budget de candidats (${maxCount}) atteint` });
  });
  return out;
}

/* Candidats explicitement FOURNIS par l'utilisateur (modes FIXED et DYNAMIC).
   Même pipeline de matérialisation : un candidat utilisateur injouable est
   écarté avec sa raison, jamais rattrapé en silence. */
export function materializeUserCandidates({ state, betSpecs = [], raiseSpecs = [] } = {}) {
  if (!state) return { bets: [], raises: [], dropped: [{ reason: "état de jeu absent" }] };
  const ctx = sizingContextFrom(state);
  const dropped = [];
  const facing = state.currentBet > EPS.amount;
  const bets = materialize(betSpecs.map(s => ({ spec: s, source: "user" })), ctx, { facing: false, state, dropped, kind: "bet" });
  const raises = materialize(raiseSpecs.map(s => ({ spec: s, source: "user" })), ctx, { facing: true, state, dropped, kind: "raise" });
  return { bets, raises, dropped, context: ctx };
}
