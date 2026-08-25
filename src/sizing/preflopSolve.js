/* ══════════════════════════════════════════════════════════════════════════
   PFASE · RÉSOLUTION PRÉFLOP AVEC CONTINUATION POSTFLOP (§54 · §38 · §66)

   Ce module répond à la question que `preflopSizing.js` ne pouvait que poser :
   **quelle ouverture vaut le plus ?**

   Jusqu'ici la réponse était `rankable:false`, et le motif était juste : l'EV
   d'une ouverture se réalise après le flop, et le moteur ne construisait pas la
   suite. `preflopTree.js` la construit désormais — l'arbre préflop se prolonge
   par un arbre postflop greffé, avec le pot et les tapis que le préflop a
   réellement produits.

   ── CE QUE LA CONTINUATION CHANGE, MESURÉ ───────────────────────────────────
   Valeur d'un limp à la racine, mêmes ranges, seul l'horizon change :

     tapis 20 bb   abattage direct −0.746   flop −0.161   trois rues −0.024
     tapis 60 bb   abattage direct −1.007   flop +0.602   trois rues +0.914

   À 60 bb, limper passe de clairement perdant à clairement gagnant. Ce n'est pas
   un décalage de quelques centièmes : **c'est un changement de signe**. Une
   valeur préflop calculée sans continuation ne se contente pas d'être imprécise,
   elle conclut l'inverse.

   ── DEUX APPROXIMATIONS, TOUTES DEUX DÉCLARÉES ──────────────────────────────
   1. L'ABATTAGE DIRECT (`postflopStreets: 0`) suppose que personne ne mise après
      le flop. C'est un autre jeu, et un classement bâti dessus ne vaut rien :
      `rankable:false`, sans discussion.
   2. L'ÉCHANTILLON DE BOARDS. Depuis le préflop, chaque itération tire un flop
      neuf, donc un contexte neuf, donc de nouvelles tables — un solve à trois
      rues épuise 4 Go en une cinquantaine de secondes. La continuation est donc
      résolue sur un ensemble FIXE de K runouts. La stratégie est exacte sur ce
      sous-jeu, approchée sur le jeu complet, et la solution le porte
      (`boardAbstraction`).

   ── LE VERROU QUI COMPTE ────────────────────────────────────────────────────
   `rankable` n'est jamais une intention. Il est vrai seulement si :

     · la continuation a été RÉSOLUE (pas d'abattage direct), ET
     · l'écart d'EV entre les ouvertures dépasse le plancher de mesure, obtenu
       en re-résolvant avec une autre graine — la même discipline que le reste de
       PFASE.

   Sinon `rankable:false`, avec le motif. Un classement produit sous le bruit
   serait une opinion présentée comme une mesure (§0).
   ══════════════════════════════════════════════════════════════════════════ */

import { buildPreflopTree, preflopTreeStats } from "../solver/core/preflopTree.js";
import { solveTree, nodeActionEVs } from "../solver/core/multistreet.js";
import { rangeComboList } from "../solver/core/combos.js";
import { toSizingSpec, specKey, specLabel, roundEv, roundAmount } from "./sizingSpec.js";
import { EPS } from "./config.js";

/* Réglages par défaut. Volontairement modestes : un solve préflop avec
   continuation coûte des dizaines de secondes, et mieux vaut un résultat rendu
   qu'un onglet figé. */
export const DEFAULT_PREFLOP_SOLVE = Object.freeze({
  iterations: 1200,
  /* Runouts de l'échantillon fixe. En dessous de ~16 la stratégie colle aux
     boards tirés ; au-dessus de ~48 la mémoire redevient le facteur limitant. */
  boardPool: 24,
  postflopStreets: 3,
  /* Sizings postflop de la continuation. Un seul suffit à faire exister le jeu
     postflop ; en ajouter renchérit l'arbre sans changer le CLASSEMENT préflop,
     qui est ce qu'on mesure ici. */
  postflopBetSizes: [0.75],
  seed: 20260825,
  /* Graine de contrôle du CFR. Elle ne fait varier QUE l'ordre d'échantillonnage :
     le sous-jeu (l'ensemble des runouts) reste identique. */
  seedProbe: 777001,
  /* Graine de l'ÉCHANTILLON DE BOARDS. Séparée de `seed` pour une raison
     mesurée : quand les deux étaient confondues, changer de graine changeait tout
     le sous-jeu, et le « bruit » relevé valait 2.07 bb — davantage que n'importe
     quel écart entre sizings. On mesurait la variance du tirage de boards, pas
     l'incertitude sur le classement. */
  boardSeed: 424242,
  /* Seconde graine de boards : elle mesure à quel point le classement DÉPEND de
     l'échantillon tiré. C'est une incertitude sur la généralisation au jeu
     complet, distincte du bruit de convergence — les additionner rendrait les
     deux inutilisables. */
  boardSeedProbe: 909091,
  maxRaisesPreflop: 3,
  /* Facteur de sécurité sur le bruit observé, comme ailleurs dans PFASE. */
  noiseSafety: 2,
});

/* ══════════════════════════════════════════════════════════════════════════
   solvePreflopSizings — résout, mesure, et ne classe que ce qui est mesurable
   ══════════════════════════════════════════════════════════════════════════ */
export function solvePreflopSizings({
  state, heroRange, villainRange, openSpecs = [], reraiseSpecs = [], config = {},
} = {}) {
  const cfg = { ...DEFAULT_PREFLOP_SOLVE, ...config };
  if (!state || state.street !== "PREFLOP") {
    return { ok: false, reason: "solve préflop demandé sur une autre rue" };
  }
  const opens = (Array.isArray(openSpecs) ? openSpecs : []).map(toSizingSpec).filter(Boolean);
  if (!opens.length) return { ok: false, reason: "aucun sizing d'ouverture à comparer" };

  const hl = rangeComboList(heroRange || {});
  const vl = rangeComboList(villainRange || {});
  if (!hl.length || !vl.length) return { ok: false, reason: "range vide" };

  const bb = (state.blinds && state.blinds.bb) || 1;
  const sb = (state.blinds && state.blinds.sb) || bb / 2;
  const ante = state.ante || 0;
  const effStack = state.effectiveStack;

  const construire = () => buildPreflopTree({
    sb, bb, ante, effStack,
    minBet: state.minBet || bb,
    openSpecs: opens,
    reraiseSpecs: (Array.isArray(reraiseSpecs) ? reraiseSpecs : []).map(toSizingSpec).filter(Boolean),
    allowJam: true,
    maxRaisesPreflop: cfg.maxRaisesPreflop,
    postflopStreets: cfg.postflopStreets,
    postflopOpts: { betSizes: cfg.postflopBetSizes, allowJam: true },
  });

  const t0 = Date.now();
  const tree = construire();
  const stats = preflopTreeStats(tree);

  const resoudre = (seed, boardSeed) => {
    const t = construire();
    const sol = solveTree(hl, vl, [], {
      tree: t, startPot: ante * 2, iters: cfg.iterations, seed, boardSeed,
      boardPool: cfg.postflopStreets > 0 ? cfg.boardPool : 0,
    });
    return { sol, ev: nodeActionEVs(sol, [], { samples: Math.min(cfg.boardPool || 60, 60) }) };
  };

  /* Trois solves, trois rôles distincts :
       · principal — le résultat ;
       · controle  — MÊME sous-jeu, autre graine CFR → bruit de convergence ;
       · autreJeu  — AUTRE échantillon de boards → dépendance à l'échantillon. */
  let principal, controle, autreJeu;
  try {
    principal = resoudre(cfg.seed, cfg.boardSeed);
    controle = resoudre(cfg.seedProbe, cfg.boardSeed);
    autreJeu = cfg.postflopStreets > 0 ? resoudre(cfg.seed, cfg.boardSeedProbe) : null;
  } catch (e) {
    return { ok: false, reason: `solve préflop impossible : ${(e && e.message) || e}`, treeStats: stats };
  }
  if (!principal.ev || !principal.ev.available) {
    return { ok: false, reason: `EV par action indisponible à la racine : ${principal.ev && principal.ev.reason}`, treeStats: stats };
  }

  /* ── LES OUVERTURES, ET SEULEMENT ELLES ───────────────────────────────────
     La racine porte aussi F, C et J. Ce qu'on compare, ce sont les OUVERTURES
     candidates : les autres actions sont du contexte, pas des concurrentes. */
  const labels = tree.actions.filter(l => /^R\d+$/.test(l));
  const parSizing = labels.map((lbl, i) => {
    const spec = tree.sizingSpecs[lbl] || opens[i] || null;
    const enfant = tree.children[lbl];
    return {
      label: lbl,
      spec,
      specKey: spec ? specKey(spec) : null,
      specLabel: spec ? specLabel(spec) : null,
      toBb: enfant ? roundAmount(Math.max(enfant.betsH, enfant.betsV)) : null,
      ev: roundEv(principal.ev.byAction[lbl]),
      evProbe: controle.ev && controle.ev.available ? roundEv(controle.ev.byAction[lbl]) : null,
      evAutreEchantillon: autreJeu && autreJeu.ev && autreJeu.ev.available ? roundEv(autreJeu.ev.byAction[lbl]) : null,
    };
  }).filter(x => x.ev != null && Number.isFinite(x.ev));

  if (parSizing.length < 2) {
    return {
      ok: true, rankable: false,
      reason: "moins de deux ouvertures jouables à comparer — rien à classer",
      sizings: parSizing, treeStats: stats, elapsedMs: Date.now() - t0,
      continuation: tree.continuationKind,
    };
  }

  /* ── LE PLANCHER DE MESURE ────────────────────────────────────────────────
     Écart entre deux graines, majoré du facteur de sécurité. Sur un solve dont
     les runouts sont échantillonnés, c'est le bruit qu'on ne saura pas
     distinguer d'un écart réel. */
  const ecarts = parSizing
    .filter(x => x.evProbe != null)
    .map(x => Math.abs(x.ev - x.evProbe));
  const bruit = ecarts.length ? Math.max(...ecarts) : Infinity;
  const plancher = roundEv(bruit * cfg.noiseSafety);

  /* ── LA SECONDE INCERTITUDE : le classement tient-il sur un AUTRE tirage ? ──
     Elle ne borne pas la même chose. Le plancher ci-dessus dit ce qu'on sait
     mesurer SUR CE SOUS-JEU ; celui-ci dit à quel point le sous-jeu lui-même a
     décidé du résultat. Un classement stable sur un échantillon mais qui
     s'inverse sur un autre n'a rien appris du jeu complet. */
  const ecartsBoards = parSizing
    .filter(x => x.evAutreEchantillon != null)
    .map(x => Math.abs(x.ev - x.evAutreEchantillon));
  const bruitBoards = ecartsBoards.length ? Math.max(...ecartsBoards) : null;

  const trie = [...parSizing].sort((a, b) => b.ev - a.ev);
  const meilleur = trie[0], second = trie[1];
  const ecartMeilleur = roundEv(meilleur.ev - second.ev);

  /* ── LE VERROU ────────────────────────────────────────────────────────────
     Deux conditions, toutes deux nécessaires. Ni l'une ni l'autre n'est un
     réglage : la première décrit le jeu résolu, la seconde ce qu'on sait
     mesurer. */
  const continuationResolue = tree.continuationKind === "SOLVED" && cfg.postflopStreets > 0;
  const ecartMesurable = Number.isFinite(plancher) && ecartMeilleur > plancher + EPS.ev;
  const rankable = continuationResolue && ecartMesurable;

  /* L'ordre obtenu tient-il sur l'autre échantillon de boards ? Question
     distincte de `rankable`, et posée séparément. */
  const ordreIci = [...parSizing].sort((a, b) => b.ev - a.ev).map(x => x.label).join(">");
  const ordreLaBas = autreJeu && parSizing.every(x => x.evAutreEchantillon != null)
    ? [...parSizing].sort((a, b) => b.evAutreEchantillon - a.evAutreEchantillon).map(x => x.label).join(">")
    : null;
  const memeOrdre = ordreLaBas != null ? ordreIci === ordreLaBas : null;
  const generalise = rankable && memeOrdre === true
    && bruitBoards != null && ecartMeilleur > bruitBoards + EPS.ev;

  const motifs = [];
  if (!continuationResolue) {
    motifs.push("la continuation postflop n'a pas été résolue : la valeur d'une ouverture supposerait que personne ne mise après le flop, ce qui est un autre jeu");
  }
  if (!ecartMesurable) {
    motifs.push(`l'écart entre la meilleure ouverture et la suivante (${ecartMeilleur} bb) ne dépasse pas le plancher de mesure (${plancher} bb) — les classer serait présenter du bruit comme un résultat`);
  }

  return {
    ok: true,
    rankable,
    reason: rankable ? null : motifs.join(" · "),
    reasons: motifs,
    /* Le classement N'EST PUBLIÉ QUE s'il est mesurable. Le publier avec un
       drapeau à côté inviterait à ignorer le drapeau. */
    ranking: rankable ? trie.map((x, i) => ({ rank: i + 1, ...x, delta: roundEv(x.ev - meilleur.ev) })) : null,
    sizings: parSizing,
    best: rankable ? { label: meilleur.label, specLabel: meilleur.specLabel, toBb: meilleur.toBb, ev: meilleur.ev } : null,
    measurement: {
      floor: plancher,
      seedNoise: roundEv(bruit),
      gapBestToSecond: ecartMeilleur,
      seeds: [cfg.seed, cfg.seedProbe],
      note: "plancher obtenu en re-résolvant le MÊME sous-jeu avec une autre graine CFR : c'est l'écart qu'on ne saura pas distinguer du bruit de convergence.",
      /* Deux incertitudes, deux noms. */
      boardSampleNoise: bruitBoards == null ? null : roundEv(bruitBoards),
      sameOrderOnOtherSample: memeOrdre,
      generalizes: generalise,
      generalizesNote: memeOrdre === false
        ? "l'ordre des sizings CHANGE sur un autre échantillon de runouts : ce classement décrit le sous-jeu tiré, pas le jeu complet."
        : generalise
          ? "l'ordre tient sur un second échantillon de runouts, et l'écart dépasse la variance entre échantillons."
          : "l'ordre tient, mais l'écart ne dépasse pas la variance entre échantillons de runouts : il décrit ce sous-jeu.",
    },
    continuation: {
      kind: tree.continuationKind,
      postflopStreets: cfg.postflopStreets,
      /* L'abstraction de boards voyage avec le résultat — elle décrit ce qui a
         RÉELLEMENT été résolu. */
      boardAbstraction: principal.sol.boardAbstraction || null,
    },
    treeStats: stats,
    evByAction: principal.ev.byAction,
    evByClass: principal.ev.byClass,
    heroEv: principal.sol.ev,
    iterations: cfg.iterations,
    elapsedMs: Date.now() - t0,
  };
}
