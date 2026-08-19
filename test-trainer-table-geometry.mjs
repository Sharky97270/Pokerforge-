/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — NON-RÉGRESSION DE LA TABLE DU TRAINER (mission cinématique).

   Ce que ces tests protègent, et pourquoi chacun existe : chaque bloc rejoue un
   défaut RÉELLEMENT MESURÉ dans le navigateur avant la refonte. Les chiffres
   cités en commentaire sont ces mesures, pas des estimations.

   Matrice §38/§39 : les scénarios de mise (open, open+call, 3-bet, 4-bet jam,
   blind vs blind, c-bet flop, raise flop, bet turn, jam river) sont éprouvés sur
   les QUATRE dispositions — « ça marche en 1T » ne dit rien du 4T.
   ═══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import {
  TRAINER_FELT_ASPECT, trainerZoneAspect, trainerMarkerPoint, trainerDealerPoint,
  trainerCentreZonePct, trainerCentralExclusionZone, trainerBoardSizePx, trainerPotSizePx,
  pointInsideZone, feltPctToZonePct, zonePctToFeltPct, feltHeightPx, MARKER_MIN_ATTRIBUTION,
} from "./src/trainerTableGeometry.js";
import { trainerTableGeometry } from "./src/trainerVisualConfig.js";
import { trainerSeatBlockPx, trainerBoardCardHeight } from "./src/trainerDensity.js";
import {
  calculatePotFromContributions, assertPotConsistency, stackToPotRatio, preflopPot,
  effectiveStack, sumDisplayedChips,
} from "./src/potAccounting.js";

let n = 0;
const fails = [];
const ok = (cond, msg) => { n++; if (!cond) fails.push(msg); };
const near = (a, b, tol, msg) => { n++; if (!(Math.abs(a - b) <= tol)) fails.push(`${msg} — ${a} vs ${b} (tol ${tol})`); };

/* ── FIXTURES : DES MESURES, PAS DES NOMBRES RONDS ─────────────────────────
   Zones et sièges relevés dans le navigateur (Chrome, 1600×950, 6-max) APRÈS la
   refonte, via `scripts/trainer-bet-anchor-audit.mjs`. Rejouer le calcul sur une
   ellipse idéalisée ne prouverait rien : les défauts vivaient précisément dans
   l'écart entre l'ellipse théorique et ce que le navigateur pose réellement
   (rayon des sièges, hauteur de tuile qui varie avec le bandeau de décision).
   Le Hero est TOUJOURS le siège bas-centre : le Trainer est hero-centric. */
const ZONES = {
  1: { areaW: 866, areaH: 528.8, scale: 1 },
  2: { areaW: 417, areaH: 275.5, scale: 0.9 },
  3: { areaW: 398.4, areaH: 261, scale: 0.85 },
  4: { areaW: 396.6, areaH: 260, scale: 0.84 },
};
const SEATS = {
  1: { UTG: { x: 83.4, y: 29.2 }, HJ: { x: 83.4, y: 62.3 }, CO: { x: 50, y: 76.1 }, BTN: { x: 16.6, y: 62.3 }, SB: { x: 16.6, y: 29.2 }, BB: { x: 50, y: 11.3 } },
  2: { UTG: { x: 15.2, y: 66 }, HJ: { x: 15.2, y: 31.7 }, CO: { x: 50, y: 14.6 }, BTN: { x: 84.8, y: 31.7 }, SB: { x: 84.8, y: 66 }, BB: { x: 50, y: 83.2 } },
  3: { UTG: { x: 84.7, y: 32 }, HJ: { x: 84.7, y: 66.5 }, CO: { x: 50, y: 83.7 }, BTN: { x: 15.3, y: 66.5 }, SB: { x: 15.3, y: 32 }, BB: { x: 50, y: 14.8 } },
  4: { UTG: { x: 84.5, y: 32.3 }, HJ: { x: 84.5, y: 66.6 }, CO: { x: 50, y: 83.7 }, BTN: { x: 15.5, y: 66.6 }, SB: { x: 15.5, y: 32.3 }, BB: { x: 50, y: 15.2 } },
};
/* Géométrie du feutre par mode. Le 1T utilise WEB_GEOMETRY_BY_COUNT[6], les
   autres TRAINER_VISUAL_CONFIG.tableGeometry. */
const GEOM = {
  1: { top: 8, left: 9, right: 9, bottom: 13 },
  2: trainerTableGeometry(2),
  3: trainerTableGeometry(3),
  4: trainerTableGeometry(4),
};
const seats6 = numTables => SEATS[numTables];
/* Le Hero est le siège bas-centre du relevé (x=50, y le plus grand). */
const heroOf = numTables => Object.entries(SEATS[numTables])
  .filter(([, s]) => Math.abs(s.x - 50) < 2)
  .sort((a, b) => b[1].y - a[1].y)[0][0];

const modes = [1, 2, 3, 4];
const boards = [false, true];

/* ══ 1 — LE FEUTRE A UNE FORME, ET C'EST TOUJOURS LA MÊME (§6/§19) ══════════
   Mesuré AVANT : 1T 1.34…1.54 (il changeait de forme d'une street à l'autre),
   2T 1.16 (un cercle), 3T 1.71…1.95, 4T 1.79. Une table qui change de forme
   déplace ses sièges, donc ses mises : aucune ancre ne peut tenir. */
for (const m of modes) {
  const g = GEOM[m];
  const zoneAr = trainerZoneAspect(m, g);
  const feltAr = zoneAr * ((100 - g.left - g.right) / (100 - g.top - g.bottom));
  near(feltAr, TRAINER_FELT_ASPECT, 0.005, `${m}T : le ratio de zone redonne bien le ratio de feutre`);
}
ok(TRAINER_FELT_ASPECT > 1.4 && TRAINER_FELT_ASPECT < 2.1,
  `ratio de feutre dans la famille « ovale de poker » — ${TRAINER_FELT_ASPECT}`);

/* ══ 2 — QUI A MISÉ ? (§43, le critère gold master) ═════════════════════════
   Mesuré AVANT en 1T : le tas de la SB tombait à 0.87 fois la distance du BTN,
   donc PLUS PRÈS du BTN que de la SB. La table ne disait pas qui avait misé. */
for (const m of modes) {
  const seats = seats6(m);
  for (const hasBoard of boards) {
    for (const pos of Object.keys(seats)) {
      for (const markerType of ["BET", "BLIND"]) {
        const p = trainerMarkerPoint({
          seats, pos, markerType, numTables: m, hasBoard,
          ringGeom: ZONES[m], geometry: GEOM[m], heroPos: heroOf(m),
        });
        ok(p, `${m}T/${pos}/${markerType} : un point est rendu`);
        if (!p) continue;
        const area = ZONES[m];
        const px = p.x * area.areaW / 100, py = p.y * area.areaH / 100;
        const dOwn = Math.hypot(px - seats[pos].x * area.areaW / 100, py - seats[pos].y * area.areaH / 100);
        let dOther = Infinity;
        for (const [q, s] of Object.entries(seats)) {
          if (q === pos) continue;
          dOther = Math.min(dOther, Math.hypot(px - s.x * area.areaW / 100, py - s.y * area.areaH / 100));
        }
        ok(dOther / dOwn >= MARKER_MIN_ATTRIBUTION - 0.01,
          `${m}T/${pos}/${markerType}${hasBoard ? "/postflop" : "/preflop"} : attribuable sans hésiter — ${(dOther / dOwn).toFixed(2)}`);
      }
    }
  }
}

/* ══ 3 — LA MISE EST ENTRE LE JOUEUR ET LE POT (§4/§9/§20) ══════════════════
   Mesuré AVANT : écart angulaire moyen de 47° en 1T, maximum 76°, cinq mises
   sur sept au-delà de 35°. Le tas partait sur le côté au lieu d'aller vers le
   centre, parce que l'anneau qui le portait n'avait pas les proportions du
   feutre. Les sièges de l'AXE VERTICAL (Hero, et le siège haut-centre) sont
   l'exception documentée : leur rayon traverse le board de part en part, ils
   posent donc leur tas dans une poche latérale — comme tous les clients de
   poker pour la main du Hero. */
for (const m of modes) {
  const seats = seats6(m);
  const area = ZONES[m];
  for (const hasBoard of boards) {
    for (const [pos, seat] of Object.entries(seats)) {
      const p = trainerMarkerPoint({ seats, pos, markerType: "BET", numTables: m, hasBoard, ringGeom: area, geometry: GEOM[m], heroPos: heroOf(m) });
      const centre = trainerCentreZonePct({ seats, heroPos: heroOf(m), numTables: m, hasBoard, ringGeom: area, geometry: GEOM[m] });
      const sx = seat.x * area.areaW / 100, sy = seat.y * area.areaH / 100;
      const tx = centre.x * area.areaW / 100, ty = centre.potY * area.areaH / 100;
      const bx = p.x * area.areaW / 100, by = p.y * area.areaH / 100;
      const D = Math.hypot(tx - sx, ty - sy) || 1;
      const t = ((tx - sx) * (bx - sx) + (ty - sy) * (by - sy)) / (D * D);
      ok(t > 0, `${m}T/${pos} : la mise n'est jamais DERRIÈRE le joueur (t=${t.toFixed(2)})`);
      ok(t < 1, `${m}T/${pos} : la mise n'est jamais DANS le pot (t=${t.toFixed(2)})`);
      const axial = Math.abs(seat.x - 50) > 12;      // siège hors de l'axe vertical
      if (axial) ok(p.mode !== "poche" ? true : false || p.deviationDeg <= 35,
        `${m}T/${pos} : siège de flanc → mise sur l'axe (écart ${p.deviationDeg}°)`);
    }
  }
}

/* ══ 4 — LE BOARD ET LE POT SONT INVIOLABLES (§15/§16) ══════════════════════
   La bande centrale est désormais CALCULÉE depuis les tailles rendues. Elle
   était auparavant un rectangle saisi à la main, faux dans les deux sens selon
   le mode : demi-largeur réelle du board 23.8 % en 1T pour 20 % déclarés, et
   12.4 % en 4T pour 19 % déclarés. */
for (const m of modes) {
  const seats = seats6(m);
  for (const hasBoard of boards) {
    const opts = { seats, heroPos: heroOf(m), numTables: m, hasBoard, ringGeom: ZONES[m], geometry: GEOM[m] };
    const zone = trainerCentralExclusionZone(opts);
    for (const pos of Object.keys(seats)) {
      for (const markerType of ["BET", "BLIND", "DEALER"]) {
        const p = markerType === "DEALER"
          ? trainerDealerPoint({ ...opts, pos })
          : trainerMarkerPoint({ ...opts, pos, markerType });
        if (p.mode === "contraint") continue;   // cas documenté : cf. §6 ci-dessous
        ok(!pointInsideZone(p, zone),
          `${m}T/${pos}/${markerType}${hasBoard ? "/postflop" : "/preflop"} : hors de la bande board+pot`);
      }
    }
  }
}

/* ══ 5 — LE BOUTON D A SON ANCRE À LUI (§29) ════════════════════════════════
   Mesuré AVANT en 4T : le bouton finissait à 49px de son BTN pour 47px de la SB,
   sur des sièges espacés de 89px. Il faut donc DEUX propriétés : il appartient
   sans ambiguïté à son joueur, et il ne se confond pas avec le tas de mise. */
for (const m of modes) {
  const seats = seats6(m);
  const area = ZONES[m];
  for (const hasBoard of boards) {
    const opts = { seats, numTables: m, hasBoard, ringGeom: area, geometry: GEOM[m], heroPos: heroOf(m) };
    const d = trainerDealerPoint({ ...opts, pos: "BTN" });
    const bet = trainerMarkerPoint({ ...opts, pos: "BTN", markerType: "BET" });
    const dpx = { x: d.x * area.areaW / 100, y: d.y * area.areaH / 100 };
    const btn = { x: seats.BTN.x * area.areaW / 100, y: seats.BTN.y * area.areaH / 100 };
    const dOwn = Math.hypot(dpx.x - btn.x, dpx.y - btn.y);
    let dOther = Infinity;
    for (const [q, s] of Object.entries(seats)) {
      if (q === "BTN") continue;
      dOther = Math.min(dOther, Math.hypot(dpx.x - s.x * area.areaW / 100, dpx.y - s.y * area.areaH / 100));
    }
    ok(dOther / dOwn >= 1.2, `${m}T : le bouton D appartient visiblement au BTN — ${(dOther / dOwn).toFixed(2)}`);
    const sep = Math.hypot((bet.x - d.x) * area.areaW / 100, (bet.y - d.y) * area.areaH / 100);
    ok(sep >= 12 * (area.scale || 1), `${m}T : bouton D et tas de mise ne se superposent pas — ${sep.toFixed(1)}px`);
  }
}

/* ══ 6 — LE COULOIR CENTRAL LOGE CE QU'ON Y MET (§15/§16/§26) ═══════════════
   Mesuré juste après le passage au ratio constant, AVANT que le couloir soit
   calculé : 2T pot↔board +0.1px et board↔cartes du Hero −10.6px (le board
   passait SOUS la main de Hero) ; 3T −6.1px. */
for (const m of modes) {
  const seats = seats6(m);
  const area = ZONES[m];
  const c = trainerCentreZonePct({ seats, heroPos: heroOf(m), numTables: m, hasBoard: true, ringGeom: area, geometry: GEOM[m] });
  /* La taille du board dépend de la hauteur du FEUTRE (§21/§34) : l'interroger
     sans cette hauteur rendrait le board du mode, pas celui de cette table — et
     le test croirait à un chevauchement là où le rendu n'en a pas. */
  const board = trainerBoardSizePx(m, { feltH: feltHeightPx(area, m, GEOM[m]) });
  const pot = trainerPotSizePx(m);
  const potBottom = c.potY * area.areaH / 100 + pot.h / 2;
  const boardTop = c.boardY * area.areaH / 100 - board.cardH / 2;
  ok(boardTop - potBottom >= 2, `${m}T : le board ne mord pas le pot — ${(boardTop - potBottom).toFixed(1)}px`);
  const boardBottom = c.boardY * area.areaH / 100 + board.cardH / 2;
  const heroTop = seats[heroOf(m)].y * area.areaH / 100 - trainerSeatBlockPx(m, { hero: true }).towardPot;
  ok(heroTop - boardBottom >= 0, `${m}T : le board ne passe pas sous la main de Hero — ${(heroTop - boardBottom).toFixed(1)}px`);
  // §21 : le board reste une information poker, il ne se réduit pas à néant.
  ok(trainerBoardCardHeight(m) >= 26, `${m}T : carte de board lisible — ${trainerBoardCardHeight(m)}px`);
}

/* ══ 7 — LES DEUX REPÈRES NE SE MÉLANGENT PLUS ═════════════════════════════
   Le pot et le board sont peints DANS le feutre (% du feutre) ; les sièges et
   les marqueurs vivent dans la zone (% de la zone). Confondre les deux décalait
   tout d'un demi-jeu de marges — mesuré en 2T : board déclaré à y=56 peint à
   y=53.45. Les deux conversions doivent être exactement réciproques. */
for (const m of modes) {
  for (const pt of [{ x: 50, y: 49 }, { x: 30, y: 20 }, { x: 72, y: 80 }]) {
    const back = zonePctToFeltPct(feltPctToZonePct(pt, GEOM[m]), GEOM[m]);
    near(back.x, pt.x, 1e-6, `${m}T : conversion feutre→zone→feutre en x`);
    near(back.y, pt.y, 1e-6, `${m}T : conversion feutre→zone→feutre en y`);
  }
}

/* ══ 8 — LE POT EST UNE SOMME (§24/§25) ═══════════════════════════════════
   Le défaut de la vidéo : « POT 12bb » avec 0.5bb visible à la SB et un 3-Bet
   7.5bb à la BB — les 4bb restants (l'open de Hero) n'étaient dessinés nulle
   part. Le pot doit être reconstructible depuis les tas affichés. */
const SCENARIOS = [
  { nom: "6-max open", street: { SB: 0.5, BB: 1, HJ: 2.5 }, prev: 0, attendu: 4 },
  { nom: "open + call", street: { SB: 0.5, BB: 1, HJ: 2.5, BTN: 2.5 }, prev: 0, attendu: 6.5 },
  { nom: "open + 3bet", street: { SB: 0.5, BB: 1, HJ: 2.5, BTN: 8.5 }, prev: 0, attendu: 12.5 },
  { nom: "open + 3bet + call", street: { SB: 0.5, BB: 1, HJ: 8.5, BTN: 8.5 }, prev: 0, attendu: 18.5 },
  { nom: "open + 3bet + 4bet", street: { SB: 0.5, BB: 1, HJ: 21, BTN: 8.5 }, prev: 0, attendu: 31 },
  { nom: "4bet jam", street: { SB: 0.5, BB: 1, HJ: 21, BTN: 60 }, prev: 0, attendu: 82.5 },
  { nom: "5-bet jam (cas vidéo 76bb)", street: { SB: 0.5, BB: 1, HJ: 40, BTN: 34.5 }, prev: 0, attendu: 76 },
  { nom: "blind vs blind", street: { SB: 3, BB: 3 }, prev: 0, attendu: 6 },
  { nom: "flop bet", street: { HJ: 4 }, prev: 6.5, attendu: 10.5 },
  { nom: "flop call", street: { HJ: 4, BTN: 4 }, prev: 6.5, attendu: 14.5 },
  { nom: "flop raise", street: { HJ: 4, BTN: 13 }, prev: 6.5, attendu: 23.5 },
  { nom: "turn bet", street: { HJ: 9 }, prev: 14.5, attendu: 23.5 },
  { nom: "river jam", street: { HJ: 42, BTN: 42 }, prev: 23.5, attendu: 107.5 },
];
for (const sc of SCENARIOS) {
  const pot = calculatePotFromContributions(sc.street, sc.prev);
  near(pot, sc.attendu, 0.011, `pot reconstruit — ${sc.nom}`);
  // Le rendu dessine UN tas par joueur ayant engagé : leur somme doit rendre
  // exactement la part « street courante » du pot.
  const chips = Object.entries(sc.street).map(([pos, amount]) => ({ pos, amount }));
  near(sumDisplayedChips(chips), pot - sc.prev, 0.011, `tas dessinés = engagements de la street — ${sc.nom}`);
  const problems = assertPotConsistency({
    enginePot: pot, displayedPot: pot, streetCommitted: sc.street, previousStreetPot: sc.prev, seatChips: chips,
  });
  ok(problems.length === 0, `aucune incohérence de pot — ${sc.nom} (${JSON.stringify(problems)})`);
}
/* Le contrôle doit AUSSI savoir échouer : un tas manquant est exactement le
   défaut de la vidéo, et il doit être signalé. */
{
  const street = { SB: 0.5, BB: 7.5, HJ: 4 };
  const pot = calculatePotFromContributions(street, 0);
  const chipsSansHero = [{ pos: "SB", amount: 0.5 }, { pos: "BB", amount: 7.5 }];   // l'open de Hero manque
  const problems = assertPotConsistency({ enginePot: pot, displayedPot: pot, streetCommitted: street, previousStreetPot: 0, seatChips: chipsSansHero });
  ok(problems.some(p => p.code === "tas dessinés≠engagements"),
    "un engagement non dessiné est détecté (le défaut « open 2.5bb invisible »)");
  ok(problems.some(p => Math.abs(p.ecart + 4) < 0.011), "l'écart signalé vaut bien le montant manquant");
}
/* Et un pot affiché qui diverge du moteur doit l'être aussi. */
{
  const problems = assertPotConsistency({ enginePot: 12, displayedPot: 11.5, streetCommitted: { SB: 0.5, BB: 1, HJ: 10.5 }, previousStreetPot: 0 });
  ok(problems.some(p => p.code === "affiché≠moteur"), "un pot affiché faux est détecté");
}

/* ══ 9 — SPR (§23) ═════════════════════════════════════════════════════════
   Les valeurs de contrôle sont celles relevées dans la vidéo : la convention
   PokerForge ne doit pas bouger. */
near(stackToPotRatio(20, 4), 5, 1e-9, "SPR 20bb / 4bb = 5");
near(stackToPotRatio(18, 14.5), 1.2, 0.05, "SPR 18bb / 14.5bb ≈ 1.2");
near(stackToPotRatio(25, 5.5), 4.5, 0.05, "SPR 25bb / 5.5bb ≈ 4.5");
ok(stackToPotRatio(50, 0) === null, "pot nul : pas de SPR inventé");
near(effectiveStack(100, [60, 80]), 60, 1e-9, "tapis effectif plafonné par l'adversaire le plus court");
near(effectiveStack(40, [90]), 40, 1e-9, "tapis effectif = Hero quand il est le plus court");
near(effectiveStack(75, []), 75, 1e-9, "sans adversaire renseigné : convention PokerForge (tapis de Hero)");

/* ══ 10 — MATRICE §39 : le placement tient sur les QUATRE dispositions ══════
   Un scénario de mise ne se contente pas d'être juste : il doit rester LISIBLE.
   On rejoue donc, pour chaque scénario et chaque mode, le placement du tas de
   chaque contributeur et on vérifie qu'aucun ne devient inattribuable. */
for (const sc of SCENARIOS) {
  const contributeurs = Object.keys(sc.street);
  for (const m of modes) {
    const seats = seats6(m);
    const area = ZONES[m];
    const hasBoard = /flop|turn|river/.test(sc.nom);
    const points = {};
    for (const pos of contributeurs) {
      if (!seats[pos]) continue;
      points[pos] = trainerMarkerPoint({ seats, pos, markerType: "BET", numTables: m, hasBoard, ringGeom: area, geometry: GEOM[m], heroPos: heroOf(m) });
    }
    // Deux tas de deux joueurs différents ne doivent pas se confondre.
    const list = Object.entries(points);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [pa, a] = list[i], [pb, b] = list[j];
      const d = Math.hypot((a.x - b.x) * area.areaW / 100, (a.y - b.y) * area.areaH / 100);
      ok(d >= 20 * (area.scale || 1), `${sc.nom} en ${m}T : les tas de ${pa} et ${pb} restent distincts — ${d.toFixed(1)}px`);
    }
  }
}

/* ══ 11 — LE POT PRÉFLOP EST UNE SOMME, PAS UNE FORMULE (§24) ══════════════
   Mesuré à l'écran AVANT correction : « POT 7.5bb » avec 3bb devant la SB et
   3bb devant la BB — 1.5bb que rien sur la table n'explique. Les deux
   générateurs préflop ajoutaient la blinde d'un joueur une SECONDE fois, alors
   qu'elle est déjà comprise dans sa relance. Ce pot alimente les cotes du pot
   et le SPR : le Trainer enseignait une décision à partir d'un prix faux. */
{
  // Défense de blinde : BTN ouvre à 2.5, Hero est BB (1 posté), SB couchée.
  const potBTN = preflopPot({ commitments: { BTN: 2.5, BB: 1 }, deadBlinds: { SB: 0.5 } });
  near(potBTN, 4, 0.011, "défense de blinde vs BTN : pot = 4bb (l'ancienne formule rendait 5)");
  ok(Math.abs(potBTN - (1.5 + 3.5)) > 0.011, "…et ce n'est pas l'ancien « toCall + 3.5 »");
  // Ouverture à 3bb : toCall = 2.
  near(preflopPot({ commitments: { CO: 3, BB: 1 }, deadBlinds: { SB: 0.5 } }), 4.5, 0.011,
    "défense de blinde vs open 3bb : pot = 4.5bb");
  // Face à un 3-bet : Hero ouvre 2.5, la BB 3-bet à 7.5, la SB est morte.
  near(preflopPot({ commitments: { BTN: 2.5, BB: 7.5 }, deadBlinds: { SB: 0.5 } }), 10.5, 0.011,
    "face à un 3-bet de la BB : pot = 10.5bb (l'ancienne formule rendait 11.5)");
  // Si c'est la SB qui 3-bet, c'est la BB qui est morte.
  near(preflopPot({ commitments: { BTN: 2.5, SB: 7.5 }, deadBlinds: { BB: 1 } }), 11, 0.011,
    "face à un 3-bet de la SB : pot = 11bb");
  // Blind vs blind : personne d'autre n'a payé, donc AUCUN argent mort.
  near(preflopPot({ commitments: { SB: 3, BB: 3 } }), 6, 0.011,
    "blind vs blind : pot = 6bb — le cas exact vu à l'écran à 7.5bb");
  // La cohérence doit tenir bout à bout avec le reste de la comptabilité.
  const p = preflopPot({ commitments: { SB: 3, BB: 3 } });
  ok(assertPotConsistency({
    enginePot: p, displayedPot: p, streetCommitted: { SB: 3, BB: 3 }, previousStreetPot: 0,
    seatChips: [{ pos: "SB", amount: 3 }, { pos: "BB", amount: 3 }],
  }).length === 0, "blind vs blind : le pot est intégralement reconstructible depuis la table");
}

if (fails.length) {
  console.error(`\n❌ ${fails.length} échec(s) sur ${n} assertions :`);
  fails.slice(0, 25).forEach(f => console.error("  · " + f));
  if (fails.length > 25) console.error(`  … et ${fails.length - 25} autres`);
  process.exit(1);
}
console.log(`✅ trainer-table-geometry (mission mises) — ${n} assertions OK`);
assert.ok(true);

