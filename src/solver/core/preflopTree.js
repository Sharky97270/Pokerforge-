/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · ARBRE PRÉFLOP AVEC CONTINUATION POSTFLOP (§54 · §38 · §66)

   POURQUOI CE MODULE N'EXISTAIT PAS
   `buildPostflopTree` documente une hypothèse qui lui est propre : « les deux
   camps sont à égalité quand une street s'ouvre ». C'est vrai après le flop —
   une rue se termine toujours par un check-check ou un call. Le préflop la viole
   par construction : la petite blinde a posté 0.5, la grosse 1. Le premier nœud
   fait face à une mise que personne n'a choisi de faire.

   Deux verrous suivaient de là, et ce module les lève tous les deux :

     V1 — CONTRIBUTIONS INÉGALES À LA RACINE. L'arbre démarre ici avec
          `betsV = sb`, `betsH = bb`, et le premier à parler affronte la
          différence. Rien d'autre ne change : le reste de la mécanique
          (fold / call / relance typée / tapis) est celle de l'arbre postflop.

     V2 — LE CALENDRIER DES CARTES. Turn et river révèlent une carte ; **le flop
          en révèle trois**. Les nœuds portent désormais leur position sur le
          board (`cardsVisible`, `cardsBefore` → `cardsAfter`), et le préflop
          déclare 0 puis 3. Cette généralisation vit dans `gametree.js` et
          `multistreet.js` ; vérifiée neutre sur les arbres postflop, EV
          identiques au bit près.

   ── LA CONTINUATION EST LE CŒUR DU SUJET, PAS UN SUPPLÉMENT ─────────────────
   Une ouverture préflop ne vaut presque rien par elle-même : sa valeur se
   réalise après le flop. Un arbre préflop qui s'arrêterait à l'abattage
   supposerait que personne ne mise plus jamais — ce qui n'est pas une
   approximation neutre, c'est un autre jeu.

   `postflopStreets` dit combien de rues de mise suivent le flop :

     0 → les joueurs vont à l'abattage sans miser. C'est une APPROXIMATION
         assumée (« checked down »), utile quand les tapis sont si courts que
         presque tout se termine préflop, et **elle est déclarée** :
         `continuation:"CHECKED_DOWN"`.
     n → l'arbre postflop est GREFFÉ après le flop, avec le pot et les tapis
         que le préflop a réellement produits. `continuation:"SOLVED"`.

   Le greffage réutilise `buildPostflopTree` tel quel — construire un second
   moteur postflop aurait garanti deux comportements divergents.

   ── CE QUE CE MODULE NE FAIT PAS ────────────────────────────────────────────
   Il ne décide pas si les sizings préflop sont CLASSABLES. Construire un arbre
   et pouvoir départager deux ouvertures sont deux choses différentes : la
   seconde dépend de la convergence atteinte et de l'écart mesuré, ce qui se
   décide au-dessus, sur mesure, jamais ici.
   ══════════════════════════════════════════════════════════════════════════ */

import { buildPostflopTree } from "./gametree.js";
import { resolveSizing, toSizingSpec, jamSizing, SizingType } from "../../sizing/sizingSpec.js";

const EPS = 1e-9;
const HERO = 0, VILL = 1;   // HERO = grosse blinde (OOP postflop) · VILL = petite blinde / bouton

/* Cartes révélées à chaque transition depuis le préflop : flop 3, turn 1, river 1. */
export const PREFLOP_CARD_SCHEDULE = [3, 1, 1];

let _pid = 0;
const mk = (o) => ({ id: _pid++, ...o });

/* ══════════════════════════════════════════════════════════════════════════
   Décale un sous-arbre postflop pour qu'il s'insère après le préflop.

   Trois décalages, et chacun corrige une confusion qui serait silencieuse :

     · les IDENTIFIANTS — `buildPostflopTree` repart de 0. Sans décalage, deux
       nœuds distincts partageraient un id, et les tables de regret du solveur
       (indexées par id) se mélangeraient. Aucune erreur ne serait levée : les
       stratégies se contamineraient, simplement.
     · les CARTES — le flop du sous-arbre est à 0 carte chez lui, à 3 ici.
     · les RUES — `street 0` du sous-arbre est le flop, donc la rue 1 de la main.
       Sans ce décalage, `extractStreetStrategy` — qui ne garde que `street === 0`
       — extrairait les nœuds de flop comme s'ils étaient préflop.
   ══════════════════════════════════════════════════════════════════════════ */
function graftPostflop(root, { idOffset, cardOffset, streetOffset }) {
  const vu = new Set();
  (function walk(n) {
    if (!n || vu.has(n)) return;
    vu.add(n);
    n.id += idOffset;
    if (n.cardsVisible != null) n.cardsVisible += cardOffset;
    if (n.cardsBefore != null) n.cardsBefore += cardOffset;
    if (n.cardsAfter != null) n.cardsAfter += cardOffset;
    if (n.street != null) n.street += streetOffset;
    if (n.kind === "decision") for (const a of n.actions) walk(n.children[a]);
    else if (n.kind === "chance") walk(n.next);
  })(root);
  return { root, count: vu.size };
}

/* ══════════════════════════════════════════════════════════════════════════
   buildPreflopTree
   ══════════════════════════════════════════════════════════════════════════ */
export function buildPreflopTree(opts = {}) {
  const sb = num(opts.sb, 0.5);
  const bb = num(opts.bb, 1);
  const ante = Math.max(0, num(opts.ante, 0));
  const effStack = Math.max(0, num(opts.effStack, 100));
  const maxRaises = Math.max(1, Math.round(num(opts.maxRaisesPreflop, 3)));
  const allowJam = opts.allowJam !== false;
  const postflopStreets = Math.max(0, Math.round(num(opts.postflopStreets, 0)));
  const minBet = num(opts.minBet, bb);

  /* Sizings TYPÉS, par niveau de relance. Un « open » n'est pas un « 3bet » :
     l'un se dit en grosses blindes, l'autre en multiple de la mise affrontée. */
  const levelSpecs = (list, fallback) => {
    const out = (Array.isArray(list) ? list : []).map(toSizingSpec).filter(Boolean);
    return out.length ? out : fallback;
  };
  const openSpecs = levelSpecs(opts.openSpecs, []);
  const reraiseSpecs = levelSpecs(opts.reraiseSpecs, []);

  /* Antes : de l'argent mort dans le pot avant toute décision. */
  const deadAnte = ante * 2;
  _pid = 0;

  /* Ce qu'il reste à un joueur qui a déjà engagé `bets`. */
  const remain = (bets) => Math.max(0, effStack - bets);

  /* ── LA FIN DU PRÉFLOP ────────────────────────────────────────────────────
     Le préflop se clôt quand les deux camps sont à égalité (`level`). Ce qui
     suit dépend de `postflopStreets`, et le champ `continuation` le dit. */
  function afterPreflop(level, allIn, path) {
    const pot = round(deadAnte + 2 * level);
    const behind = remain(level);
    /* Plus personne ne peut miser : on va à l'abattage, sans approximation. */
    if (allIn || behind <= EPS || postflopStreets === 0) {
      return mk({
        kind: "chance", street: 0, pot, betsH: level, betsV: level,
        cardsBefore: 0, cardsAfter: 5,
        /* Les cinq cartes tombent d'un coup : il n'y a plus de décision. */
        continuation: allIn || behind <= EPS ? "ALL_IN_RUNOUT" : "CHECKED_DOWN",
        next: mk({ kind: "terminal", result: "showdown", street: 1, pot, betsH: level, betsV: level, cardsVisible: 5 }),
      });
    }
    /* ── GREFFE DE L'ARBRE POSTFLOP ───────────────────────────────────────
       Le pot et les tapis passés ici sont ceux que le préflop a RÉELLEMENT
       produits. C'est ce qui fait que la valeur d'une ouverture intègre ce qui
       la suit, au lieu de la supposer. */
    const sub = buildPostflopTree({
      ...(opts.postflopOpts || {}),
      startPot: pot,
      effStack: behind,
      streets: postflopStreets,
    });
    const idOffset = _pid;
    const { count } = graftPostflop(sub, { idOffset, cardOffset: 3, streetOffset: 1 });
    _pid += count;
    return mk({
      kind: "chance", street: 0, pot, betsH: level, betsV: level,
      cardsBefore: 0, cardsAfter: 3, continuation: "SOLVED",
      next: sub,
    });
  }

  /* ── UN JOUEUR FACE À UNE MISE ────────────────────────────────────────────
     Même structure que l'arbre postflop : F / C / relances typées / tapis. La
     seule différence tient à la racine, où le « niveau affronté » est la grosse
     blinde que personne n'a choisi de miser. */
  function facing(betsH, betsV, who, nRaises, aggAllIn, path) {
    const pot = round(deadAnte + betsH + betsV);
    const myBets = who === HERO ? betsH : betsV;
    const oppBets = who === HERO ? betsV : betsH;
    const toCall = round(Math.max(0, oppBets - myBets));
    const node = mk({
      kind: "decision", player: who, street: 0, cardsVisible: 0,
      pot, betsH, betsV, toCall, actions: [], children: {}, path: path.slice(),
      sizingSpecs: {},
    });

    /* FOLD — sauf si rien n'est à payer (on ne se couche pas devant un check). */
    if (toCall > EPS) {
      node.actions.push("F");
      node.children.F = mk({
        kind: "terminal", result: who === HERO ? "foldH" : "foldV",
        street: 0, cardsVisible: 0, pot, betsH, betsV,
      });
    }

    /* CALL / CHECK — clôt le préflop si une relance a déjà eu lieu ou si
       l'option de la grosse blinde est consommée. */
    const callAmt = Math.min(toCall, remain(myBets));
    const cH = who === HERO ? round(betsH + callAmt) : betsH;
    const cV = who === VILL ? round(betsV + callAmt) : betsV;
    const level = Math.max(cH, cV);
    const callerAllIn = remain(who === HERO ? cH : cV) <= EPS;
    const label = toCall > EPS ? "C" : "X";
    node.actions.push(label);
    /* L'option de la grosse blinde : si VILL a simplement complété (limp) et que
       HERO n'a pas encore parlé, le préflop n'est PAS clos — HERO peut relancer.
       Sans cela, l'arbre supprimerait l'iso-raise, qui est précisément le sizing
       que le §54 sait construire. */
    const bbAToujoursLOption = who === VILL && nRaises === 0 && Math.abs(level - bb) <= EPS;
    node.children[label] = bbAToujoursLOption
      ? facing(cH, cV, HERO, 0, false, [...path, label])
      : afterPreflop(level, aggAllIn || callerAllIn, [...path, label]);

    /* RELANCES TYPÉES — ouverture si personne n'a encore relancé, sur-relance
       ensuite. L'unité change avec le niveau, et c'est voulu (§6). */
    if (nRaises < maxRaises && !aggAllIn && remain(myBets) > EPS) {
      const specs = nRaises === 0 && openSpecs.length ? openSpecs
        : reraiseSpecs.length ? reraiseSpecs : openSpecs;
      const ctxBase = {
        pot, effectiveRemaining: remain(myBets), alreadyCommitted: myBets,
        facingLevel: oppBets, minIncrement: Math.max(minBet, toCall || minBet),
        bb, streetsRemaining: 1 + postflopStreets,
      };
      const vus = new Set();
      let idx = 0;
      const liste = allowJam && !specs.some(s => s.type === SizingType.JAM)
        ? [...specs, jamSizing()] : specs;
      for (const spec of liste) {
        const r = resolveSizing(spec, ctxBase);
        /* §34 — une relance sous le minimum légal n'est pas relevée au minimum :
           elle n'existe pas. La promouvoir inventerait une action. */
        if (!r || r.clamped === "minimum légal") continue;
        /* `computedAmount` est le TOTAL atteint (« to X »), la grandeur unique du
           moteur comme du Trainer. Lire un champ inexistant rendait `NaN` pour
           TOUS les sizings, et la déduplication — qui compare des chaînes —
           n en gardait alors qu un seul : l arbre perdait le tapis sans qu aucune
           erreur ne soit levée. */
        const to = round(r.computedAmount);
        if (!Number.isFinite(to)) continue;
        if (to <= oppBets + EPS) continue;                 // ne relance rien
        const cle = to.toFixed(4);
        if (vus.has(cle)) continue;                        // doublon après quantification
        vus.add(cle);
        const rH = who === HERO ? to : betsH;
        const rV = who === VILL ? to : betsV;
        const raiseAllIn = remain(to) <= EPS;
        const lbl = spec.type === SizingType.JAM ? "J" : `R${idx++}`;
        node.actions.push(lbl);
        node.sizingSpecs[lbl] = spec;
        node.children[lbl] = facing(rH, rV, who === HERO ? VILL : HERO, nRaises + 1, raiseAllIn, [...path, lbl]);
      }
    }
    return node;
  }

  /* ── LA RACINE : contributions INÉGALES ───────────────────────────────────
     VILL (petite blinde / bouton) parle le premier et affronte la différence
     entre les deux blindes. C'est exactement ce que l'arbre postflop ne savait
     pas représenter. */
  const root = facing(bb, sb, VILL, 0, false, []);
  return Object.assign(root, {
    isPreflopRoot: true,
    blinds: { sb, bb, ante },
    cardSchedule: PREFLOP_CARD_SCHEDULE.slice(),
    postflopStreets,
    continuationKind: postflopStreets === 0 ? "CHECKED_DOWN" : "SOLVED",
  });
}

function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v) { return Math.round(v * 1e6) / 1e6; }

/* Statistiques d'arbre — utiles pour dire ce qui a été construit avant de le
   résoudre, et pour refuser un arbre manifestement hors budget. */
export function preflopTreeStats(root) {
  let decision = 0, chance = 0, terminal = 0, maxDepth = 0, showdowns = 0, folds = 0;
  const vu = new Set();
  (function walk(n, d) {
    if (!n || vu.has(n)) return;
    vu.add(n);
    maxDepth = Math.max(maxDepth, d);
    if (n.kind === "decision") { decision++; for (const a of n.actions) walk(n.children[a], d + 1); }
    else if (n.kind === "chance") { chance++; walk(n.next, d + 1); }
    else { terminal++; if (n.result === "showdown") showdowns++; else folds++; }
  })(root, 0);
  return { decision, chance, terminal, showdowns, folds, maxDepth, total: decision + chance + terminal };
}
