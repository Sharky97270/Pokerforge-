/* ══════════════════════════════════════════════════════════════════════════
   PFASE · REPRÉSENTATION D'UN SIZING (Mission §6, §25, §72, §73, §74)

   RÈGLE FONDATRICE (§72)
   Un sizing n'est JAMAIS une chaîne. « 33% » n'est pas un sizing : c'est
   l'affichage d'un sizing. Le bug historique de PokerForge — `betFracFromLabel`
   qui relit `/33/` dans le TEXTE d'un bouton pour reconstruire une fraction —
   vient exactement de là. Ici, un sizing est un objet typé :

     { type, value?, streetsRemaining? }

   et il ne devient un montant que par `resolveSizing(spec, ctx)`, qui rend
   `computedAmount` en bb ET la fraction de pot équivalente. Le libellé est
   dérivé de l'objet, jamais l'inverse.

   QUATRE TYPES NATIFS
     pot          fraction du pot courant           { type:"pot", value:0.75 }
     geometric    amène au tapis en N rues          { type:"geometric", streetsRemaining:2 }
     previousBet  multiple de la mise affrontée     { type:"previousBet", value:2.5 }
     bb           multiple de la grosse blinde      { type:"bb", value:2.5 }   (préflop)
     jam          all-in explicite                  { type:"jam" }

   `jam` est une ACTION à part entière (§74) et non « 999% du pot » : son montant
   ne se déduit pas du pot mais du tapis, et son libellé est JAM (jamais « AI »,
   ambigu avec l'intelligence artificielle — §25).

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { EPS, DEFAULT_ROUNDING } from "./config.js";

export const SizingType = Object.freeze({
  POT: "pot",
  GEOMETRIC: "geometric",
  PREVIOUS_BET: "previousBet",
  BB: "bb",
  JAM: "jam",
});

/* Unités d'affichage (§25). `JAM` remplace `AI` pour lever l'ambiguïté. */
export const SIZING_UNIT_LABEL = Object.freeze({
  pot: "%",
  geometric: "e",       // « e » = géométrique (exponentiel vers le tapis)
  previousBet: "x",
  bb: "bb",
  jam: "JAM",
});

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

/* ── CONSTRUCTEURS ─────────────────────────────────────────────────────────
   Passer par eux garantit qu'un spec est toujours bien formé. */
export const potSizing = (fraction) => ({ type: SizingType.POT, value: num(fraction) });
export const geometricSizing = (streetsRemaining) => ({ type: SizingType.GEOMETRIC, streetsRemaining: Math.max(1, Math.round(num(streetsRemaining) || 1)) });
export const previousBetSizing = (mult) => ({ type: SizingType.PREVIOUS_BET, value: num(mult) });
export const bbSizing = (mult) => ({ type: SizingType.BB, value: num(mult) });
export const jamSizing = () => ({ type: SizingType.JAM });

/* Un nombre nu vaut une fraction de pot — rétro-compatibilité avec l'API
   existante de `buildPostflopTree`, dont `betSizes` est un tableau de nombres.
   C'est le SEUL endroit qui accepte cette forme dégradée. */
export function toSizingSpec(x) {
  if (x && typeof x === "object" && x.type) return normalizeSpec(x);
  const n = num(x);
  if (!Number.isFinite(n)) return null;
  return potSizing(n);
}

export function normalizeSpec(spec) {
  if (!spec || typeof spec !== "object") return null;
  const t = String(spec.type);
  if (t === SizingType.JAM) return { type: SizingType.JAM };
  if (t === SizingType.GEOMETRIC) {
    const n = Math.round(num(spec.streetsRemaining));
    return Number.isFinite(n) && n >= 1 ? { type: t, streetsRemaining: n } : null;
  }
  if (t === SizingType.POT || t === SizingType.PREVIOUS_BET || t === SizingType.BB) {
    const v = num(spec.value);
    return Number.isFinite(v) && v > 0 ? { type: t, value: v } : null;
  }
  return null;
}

export function isValidSpec(spec) { return normalizeSpec(spec) != null; }

/* Identité TEXTUELLE d'un spec — sert au hash canonique et à la déduplication.
   Volontairement compacte et stable : elle entre dans des clés de cache. */
export function specKey(spec) {
  const s = normalizeSpec(spec);
  if (!s) return "invalid";
  if (s.type === SizingType.JAM) return "jam";
  if (s.type === SizingType.GEOMETRIC) return `geo:${s.streetsRemaining}`;
  const v = roundTo(s.value, DEFAULT_ROUNDING.fractionDecimals);
  return `${s.type}:${v}`;
}

/* Libellé lisible, DÉRIVÉ du spec (jamais l'inverse — §72). */
export function specLabel(spec) {
  const s = normalizeSpec(spec);
  if (!s) return "—";
  switch (s.type) {
    case SizingType.JAM: return "JAM";
    case SizingType.GEOMETRIC: return `géo ${s.streetsRemaining}e`;
    case SizingType.PREVIOUS_BET: return `${trimNum(s.value)}x`;
    case SizingType.BB: return `${trimNum(s.value)}bb`;
    case SizingType.POT: default: return `${trimNum(s.value * 100)}%`;
  }
}

function trimNum(v) {
  const r = Math.round(num(v) * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

/* ── ARRONDI CENTRALISÉ (§73) ──────────────────────────────────────────────
   Un montant arrondi ici l'est PARTOUT : c'est ce qui évite « 3.29 UI /
   3.3 solveur / 3.25 Trainer » comptés comme trois actions différentes. */
export function roundTo(v, decimals) {
  const p = Math.pow(10, decimals);
  const n = num(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * p) / p;
}
export function roundAmount(v, rounding = DEFAULT_ROUNDING) {
  const step = rounding.betStepBb;
  const r = roundTo(v, rounding.amountDecimals);
  if (!(step > 0)) return r;
  /* Quantification au pas de mise de la table : on TRONQUE (un montant ne doit
     jamais grandir au-dessus de ce que le tapis permet — cf. `floorStep` du
     Trainer, corrigé pour la même raison). */
  return Math.floor(Math.round((r / step) * 1e6) / 1e6) * step;
}
export function roundFraction(v, rounding = DEFAULT_ROUNDING) { return roundTo(v, rounding.fractionDecimals); }
export function roundEv(v, rounding = DEFAULT_ROUNDING) { return roundTo(v, rounding.evDecimals); }

/* ══════════════════════════════════════════════════════════════════════════
   SIZING GÉOMÉTRIQUE (§6)

   « Ne jamais coder geometric = 75%. Le sizing géométrique dépend du SPR. »

   On cherche la fraction de pot x telle que N mises de taille x, chacune suivie,
   amènent exactement les tapis à zéro.

   Après une mise de x·P suivie, le pot devient P·(1 + 2x). Après N rues :
       P_final = P · (1 + 2x)^N
   On veut que chaque joueur ait investi tout son tapis effectif S derrière :
       P_final = P + 2S
   D'où :
       (1 + 2x)^N = (P + 2S) / P = 1 + 2·SPR
       x = ( (1 + 2·SPR)^(1/N) − 1 ) / 2

   Contrôle : N = 1 → x = SPR, donc x·P = S = tapis. C'est bien l'all-in en une
   mise. Le résultat dépend donc ENTIÈREMENT du SPR, comme exigé.
   ══════════════════════════════════════════════════════════════════════════ */
export function geometricFraction({ pot, effectiveRemaining, streetsRemaining }) {
  const P = num(pot), S = num(effectiveRemaining), N = Math.max(1, Math.round(num(streetsRemaining) || 1));
  if (!(P > 0) || !(S > 0)) return null;
  const spr = S / P;
  const x = (Math.pow(1 + 2 * spr, 1 / N) - 1) / 2;
  return Number.isFinite(x) && x > 0 ? x : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTEXTE DE RÉSOLUTION

   Tout ce dont un spec a besoin pour devenir un montant. Les grandeurs sont en
   bb et proviennent TOUJOURS de `gameState.js` (source unique §7) — jamais
   recalculées ici.

     pot                pot AVANT l'action
     effectiveRemaining ce que l'acteur peut encore engager sur cette street
                        (déjà borné par ce que l'adversaire peut couvrir)
     alreadyCommitted   ce que l'acteur a déjà mis sur la street
     facingLevel        engagement total de l'agresseur sur la street (0 si aucun)
     minIncrement       relance minimale légale (dernier incrément, ≥ minBet)
     bb                 valeur d'une grosse blinde (1 par convention interne)
     streetsRemaining   rues restantes, pour le géométrique
   ══════════════════════════════════════════════════════════════════════════ */

/* Résout un spec en montant. Rend TOUJOURS un objet décrivant le résultat ET
   les contraintes appliquées — jamais un simple nombre, parce qu'un montant
   écrêté au tapis n'est pas le même objet stratégique qu'un montant libre. */
export function resolveSizing(spec, ctx, rounding = DEFAULT_ROUNDING) {
  const s = normalizeSpec(spec);
  if (!s) return null;
  const pot = num(ctx?.pot) || 0;
  const remaining = Math.max(0, num(ctx?.effectiveRemaining) || 0);
  const committed = Math.max(0, num(ctx?.alreadyCommitted) || 0);
  const facing = Math.max(0, num(ctx?.facingLevel) || 0);
  const minIncrement = Math.max(0, num(ctx?.minIncrement) || 0);
  const bb = num(ctx?.bb) > 0 ? num(ctx.bb) : 1;
  const streets = Math.max(1, Math.round(num(ctx?.streetsRemaining) || 1));

  if (remaining <= EPS.amount) return null;   // rien à engager : aucune mise possible

  /* `raw` = TOTAL atteint sur la street (« to X »), grandeur unique du Trainer
     comme du moteur. Chaque type sait produire ce total. */
  let raw, note = null;
  switch (s.type) {
    case SizingType.JAM:
      raw = committed + remaining;
      break;
    case SizingType.POT: {
      /* Fraction du pot AVANT l'action, plus ce qu'il faut pour égaler
         l'agresseur. Un « bet 75% » face à rien vaut 0.75·P ; un « raise 75% »
         face à une mise vaut « payer, puis relancer de 75% du pot ainsi
         constitué » — la convention universelle des solveurs. */
      const toCall = Math.max(0, facing - committed);
      const potAfterCall = pot + toCall;
      raw = facing + s.value * potAfterCall;
      break;
    }
    case SizingType.PREVIOUS_BET: {
      if (!(facing > EPS.amount)) return null;   // pas de mise affrontée : type inapplicable
      raw = s.value * facing;                    // « raise TO 2.5× la mise »
      break;
    }
    case SizingType.BB:
      raw = s.value * bb;
      break;
    case SizingType.GEOMETRIC: {
      const toCall = Math.max(0, facing - committed);
      const potAfterCall = pot + toCall;
      const behind = remaining - toCall;         // ce qui reste APRÈS avoir payé
      if (!(behind > EPS.amount)) { raw = committed + remaining; note = "tapis atteint avant la séquence géométrique"; break; }
      const f = geometricFraction({ pot: potAfterCall, effectiveRemaining: behind, streetsRemaining: Math.min(streets, s.streetsRemaining) });
      if (f == null) return null;
      raw = facing + f * potAfterCall;
      break;
    }
    default: return null;
  }

  const maxTo = committed + remaining;
  /* Minimum légal : une relance doit dépasser la mise affrontée d'au moins
     l'incrément précédent. Une ouverture doit valoir au moins la mise minimale. */
  const minTo = facing > EPS.amount
    ? facing + Math.max(minIncrement, EPS.amount)
    : committed + Math.max(minIncrement, EPS.amount);

  let to = raw, clamped = null;
  if (to > maxTo - EPS.amount) { to = maxTo; clamped = "tapis"; }
  else if (to < minTo - EPS.amount) { to = Math.min(minTo, maxTo); clamped = "minimum légal"; }

  const amount = roundAmount(to, rounding);
  const additional = Math.max(0, roundAmount(amount - committed, rounding));
  const allIn = amount >= maxTo - EPS.amount;
  const toCall = Math.max(0, facing - committed);
  const potAfterCall = pot + toCall;
  return {
    spec: s,
    key: specKey(s),
    label: specLabel(s),
    /* `computedAmount` (§72) : le TOTAL atteint sur la street, en bb. */
    computedAmount: amount,
    /* ce qui quitte réellement le tapis */
    additionalChips: additional,
    /* fraction de pot ÉQUIVALENTE — utile pour comparer des specs de types
       différents, et pour alimenter `buildPostflopTree` dont l'unité est la
       fraction de pot. Rapportée au pot après paiement, cohérente avec POT. */
    potFraction: potAfterCall > EPS.amount ? roundFraction((amount - facing) / potAfterCall, rounding) : null,
    allIn,
    clamped,
    note,
    minTo: roundAmount(Math.min(minTo, maxTo), rounding),
    maxTo: roundAmount(maxTo, rounding),
  };
}

/* Résout une liste de specs et DÉDUPLIQUE par montant effectif : deux specs de
   types différents qui produisent le même montant sont la même action, et les
   faire coexister dans un arbre créerait deux branches identiques (donc des
   fréquences partagées arbitrairement entre elles). */
export function resolveSizingList(specs, ctx, rounding = DEFAULT_ROUNDING) {
  const out = [];
  const seen = new Set();
  for (const raw of specs || []) {
    const r = resolveSizing(raw, ctx, rounding);
    if (!r) continue;
    if (r.additionalChips <= EPS.amount) continue;      // action nulle
    const dedupe = String(Math.round(r.computedAmount / Math.max(EPS.amount, 1e-3)));
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(r);
  }
  out.sort((a, b) => a.computedAmount - b.computedAmount);
  return out;
}

/* Deux résolutions désignent-elles la même action ? (§37 : ne jamais confondre
   deux montants voisins avec deux actions distinctes.) */
export function sameSizing(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.computedAmount - b.computedAmount) <= EPS.amount;
}
