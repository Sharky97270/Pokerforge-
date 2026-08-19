/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-density.mjs — LA DENSITÉ EST UNE SOURCE UNIQUE

   Le défaut que ce fichier empêche de revenir : les dimensions des objets de
   table vivaient en DOUBLE — une valeur en JSX (`cfg.dbtnSz` : 13px en 3T,
   10px en 4T) et une autre en CSS (`.dealer-btn{width:22px!important}`). La
   seconde gagnait, et le bouton D mesurait 22px sur les quatre modes.

   On verrouille donc trois propriétés :
     1. MONOTONIE — chaque grandeur décroît (ou reste stable) de 1T à 4T. Une
        valeur qui remonterait signifie qu'un mode plus dense affiche plus gros
        que son voisin, ce qui était le cas avant refonte (avatar 3T = 29.6px
        contre 29.2px en 4T, à zoom près : indiscernables).
     2. LE 1T EST INTACT — le mode `normal` est la référence visuelle validée ;
        aucune de ses valeurs ne doit bouger sans décision explicite.
     3. LE PONT CSS EST FIDÈLE — `trainerDensityVars()` publie TOUS les jetons,
        avec la bonne unité. Un jeton oublié = une règle CSS qui retombe sur son
        `fallback` et redevient une valeur en dur.

   La conformité VISUELLE (sièges sur l'anneau, chevauchements, uniformité des
   tuiles) est mesurée à part, dans un vrai navigateur :
   scripts/trainer-mt-geometry.mjs --tables=3T --n=30
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  TRAINER_DENSITY_ORDER,
  TRAINER_DENSITY_TOKENS,
  TRAINER_DENSITY_TIGHT,
  trainerDensity,
  trainerDensityName,
  trainerDensityVars,
  densityVarName,
  trainerBoardCardHeight,
  MARKER_CLEARANCE_BY_TYPE,
  trainerMarkerClearance,
  trainerMarkerApproachMax,
  trainerDealerAngleOffset,
} from "./src/trainerDensity.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* ══ 1 — la table des modes ══ */
eq(TRAINER_DENSITY_ORDER, ["normal", "medium", "compact", "dense"], "ordre des densités");
for (const [n, name] of [[1, "normal"], [2, "medium"], [3, "compact"], [4, "dense"]]) {
  eq(trainerDensityName(n), name, `${n}T → ${name}`);
}
eq(trainerDensityName(9), "dense", "au-delà de 4 tables → la densité la plus forte");

/* ══ 2 — MONOTONIE : rien ne grossit quand la tuile rétrécit ══
   `markerApproachMax` est exclu : c'est un PLAFOND de rapprochement, il doit au
   contraire se desserrer quand la table est petite (le risque s'inverse — un
   marqueur perdu au milieu du tapis plutôt que collé au joueur). */
const DECROISSANTS = [
  "avatarSize", "avatarRing", "seatZoom", "seatGap", "nameplateFs",
  "dealerSize", "blindScale", "betScale",
  "boardGap", "potH",
  "actionBtnMinH", "actionBtnPadY", "actionGap",
  "actionLabelFs", "actionSizingFs", "sizingBtnH", "sizingBtnFs", "stepperH",
  "markerClearance",
];
for (const token of DECROISSANTS) {
  for (let i = 1; i < TRAINER_DENSITY_ORDER.length; i++) {
    const prev = TRAINER_DENSITY_TOKENS[TRAINER_DENSITY_ORDER[i - 1]][token];
    const cur = TRAINER_DENSITY_TOKENS[TRAINER_DENSITY_ORDER[i]][token];
    ok(typeof prev === "number" && typeof cur === "number", `${token} numérique en ${TRAINER_DENSITY_ORDER[i]}`);
    ok(cur <= prev, `${token} : ${TRAINER_DENSITY_ORDER[i]} (${cur}) ≤ ${TRAINER_DENSITY_ORDER[i - 1]} (${prev})`);
  }
}
/* `markerApproachMax` n'est PAS monotone, et c'est voulu : c'est un plafond
   réglé par mesure, pas une dimension. Ce qui doit rester vrai, c'est que les
   modes denses — ceux où les marqueurs retombaient sur le plancher, groupés au
   milieu du tapis — le desserrent par rapport au 1T, et qu'aucun ne parte à la
   dérive (un plafond trop haut colle le marqueur à l'avatar). */
for (const name of ["compact", "dense"]) {
  ok(TRAINER_DENSITY_TOKENS[name].markerApproachMax > TRAINER_DENSITY_TOKENS.normal.markerApproachMax,
    `${name} : plafond de rapprochement desserré vs 1T`);
}
for (const name of TRAINER_DENSITY_ORDER) {
  const m = TRAINER_DENSITY_TOKENS[name].markerApproachMax;
  ok(m >= 1.1 && m <= 1.8, `${name} : plafond de rapprochement dans les bornes utiles — ${m}`);
}

/* Le BOARD se compare en hauteur RENDUE, pas en facteur de zoom : sa taille de
   base change avec le mode (2xl → xl → lg → md), si bien qu'un zoom plus grand
   peut produire une carte plus petite. C'est précisément le piège qui avait
   laissé le board 4T à 15.6×21.6px (illisible) pendant que le 3T tenait 24×33. */
/* Depuis que le feutre a un ratio CONSTANT (trainerTableGeometry), le board est
   dimensionné en fraction de la hauteur du feutre et non plus mode par mode. Or
   les tuiles 3T et 4T sont quasi identiques : leurs boards le sont donc aussi, à
   0.1px près. Exiger une décroissance STRICTE reviendrait à exiger un défaut.
   L'invariant utile est qu'aucun mode plus dense ne porte un board plus GRAND
   que le précédent de façon visible (tolérance 2 %). */
for (let i = 1; i < TRAINER_DENSITY_ORDER.length; i++) {
  const prev = trainerBoardCardHeight(i);
  const cur = trainerBoardCardHeight(i + 1);
  ok(cur <= prev * 1.02, `carte de board : ${i + 1}T (${cur}px) ≤ ${i}T (${prev}px) à 2 % près`);
}
/* Les pas 1T→2T et 2T→3T sont volontairement grands : la tuile l'est aussi
   (725px de haut en 2T, 344px en 3T). Le pas 3T→4T, lui, doit rester DOUX —
   mesuré, ces deux mosaïques donnent des tuiles quasi identiques (361px et
   360px), donc un board deux fois plus petit en 4T ne serait pas de la densité
   mais un défaut. C'était le cas avant : 24×33 en 3T contre 15.6×21.6 en 4T. */
ok(trainerBoardCardHeight(4) >= trainerBoardCardHeight(3) * 0.8,
  `board 4T proche du 3T (${trainerBoardCardHeight(4)} vs ${trainerBoardCardHeight(3)})`);
ok(trainerBoardCardHeight(4) >= 26, `board 4T lisible — ${trainerBoardCardHeight(4)}px`);
ok(trainerBoardCardHeight(3) >= 28, `board 3T lisible — ${trainerBoardCardHeight(3)}px`);

/* ══ 3 — LISIBILITÉ : les réductions restent bornées ══
   La mission dit explicitement « je ne demande pas de rendre les joueurs
   minuscules ». On borne donc par le bas ce dont dépend la lecture. */
for (const name of TRAINER_DENSITY_ORDER) {
  const d = TRAINER_DENSITY_TOKENS[name];
  ok(d.avatarSize >= 26, `${name} : avatar ≥ 26px (reconnaissable) — ${d.avatarSize}`);
  ok(d.dealerSize >= 10, `${name} : bouton D ≥ 10px (identifiable) — ${d.dealerSize}`);
  ok(d.actionLabelFs >= 10, `${name} : libellé d'action ≥ 10px (lisible) — ${d.actionLabelFs}`);
  ok(d.actionBtnMinH >= 28, `${name} : bouton d'action ≥ 28px (cliquable) — ${d.actionBtnMinH}`);
  ok(d.sizingBtnH >= 12, `${name} : preset de sizing ≥ 12px (cliquable) — ${d.sizingBtnH}`);
  ok(d.nameplateFs >= 9, `${name} : plaque ≥ 9px (lisible) — ${d.nameplateFs}`);
}
/* Le bouton D ne doit jamais dominer l'avatar auquel il est rattaché. */
for (const name of TRAINER_DENSITY_ORDER) {
  const d = TRAINER_DENSITY_TOKENS[name];
  ok(d.dealerSize <= d.avatarSize * 0.55, `${name} : bouton D discret face à l'avatar (${d.dealerSize} vs ${d.avatarSize})`);
}

/* ══ 4 — LE 1T EST INTACT ══
   Valeurs relevées sur le 1T livré. Les changer, c'est toucher au mode de
   référence : ce test est là pour que ce soit un choix, pas un effet de bord. */
const REF_1T = { avatarSize: 68, dealerSize: 22, blindScale: 1, betScale: 1, boardZoom: 1, seatZoom: 1, markerClearance: 1, markerApproachMax: 1.3 };
for (const [k, v] of Object.entries(REF_1T)) {
  eq(TRAINER_DENSITY_TOKENS.normal[k], v, `1T inchangé — ${k} = ${v}`);
}

/* ══ 5 — ÉCRAN ÉTROIT : un demi-cran, jamais un cran de plus ══
   Le mode `tight` doit rester DANS l'intervalle de son mode : plus dense que
   lui-même, mais jamais plus dense que le mode suivant, sinon le 3T étroit
   afficherait plus petit que le 4T large. */
for (let i = 0; i < TRAINER_DENSITY_ORDER.length; i++) {
  const name = TRAINER_DENSITY_ORDER[i];
  const base = TRAINER_DENSITY_TOKENS[name];
  const tight = trainerDensity(i + 1, { tight: true });
  for (const [k, v] of Object.entries(TRAINER_DENSITY_TIGHT[name] || {})) {
    ok(v <= base[k], `${name} étroit : ${k} ≤ mode large (${v} ≤ ${base[k]})`);
    eq(tight[k], v, `${name} étroit : ${k} appliqué`);
  }
  // Les jetons non surchargés restent ceux du mode.
  for (const k of Object.keys(base)) {
    if (k in (TRAINER_DENSITY_TIGHT[name] || {})) continue;
    eq(tight[k], base[k], `${name} étroit : ${k} hérité du mode`);
  }
}
eq(trainerDensity(1, { tight: true }), TRAINER_DENSITY_TOKENS.normal, "1T ne se densifie jamais");

/* ══ 6 — LE PONT CSS ══ */
eq(densityVarName("avatarSize"), "--pf-d-avatar-size", "nom de variable dérivé du jeton");
eq(densityVarName("actionBtnMinH"), "--pf-d-action-btn-min-h", "nom de variable — sigle en fin");
for (const n of [1, 2, 3, 4]) {
  const d = trainerDensity(n);
  const vars = trainerDensityVars(n);
  eq(vars["--pf-density"], trainerDensityName(n), `${n}T : nom de densité publié`);
  for (const k of Object.keys(d)) {
    const name = densityVarName(k);
    ok(name in vars, `${n}T : ${k} publié en CSS (${name})`);
  }
  // Longueurs en px, facteurs sans unité — une inversion casse silencieusement
  // la règle CSS qui les consomme (zoom:30px est invalide, width:0.86 aussi).
  eq(vars["--pf-d-avatar-size"], `${d.avatarSize}px`, `${n}T : avatarSize en px`);
  eq(vars["--pf-d-dealer-size"], `${d.dealerSize}px`, `${n}T : dealerSize en px`);
  eq(vars["--pf-d-seat-zoom"], String(d.seatZoom), `${n}T : seatZoom sans unité`);
  eq(vars["--pf-d-board-zoom"], String(d.boardZoom), `${n}T : boardZoom sans unité`);
  eq(vars["--pf-d-blind-scale"], String(d.blindScale), `${n}T : blindScale sans unité`);
  eq(vars["--pf-d-action-pad"], d.actionPad, `${n}T : actionPad brut (raccourci CSS)`);
}

/* ══ 6bis — PLACEMENT DES MARQUEURS ══
   L'ordre radial voulu est : siège (le plus externe) → bouton D → blinde/mise →
   centre. Le budget de dégagement va donc en DÉCROISSANT quand on veut que le
   marqueur reste près du joueur… mais il doit rester le MÊME pour les trois en
   mosaïque : une tentative de le différencier a posé le bouton D sur la plaque
   des sièges du haut (mesuré : boutonD↔plaque 0→40 sur 24 tirages). */
for (const name of TRAINER_DENSITY_ORDER) {
  const c = MARKER_CLEARANCE_BY_TYPE[name];
  ok(c && typeof c.BLIND === "number" && typeof c.DEALER === "number" && typeof c.BET === "number",
    `${name} : un budget de dégagement pour chacun des trois marqueurs`);
  ok(c.BLIND === c.DEALER && c.DEALER === c.BET,
    `${name} : les trois marqueurs partagent le budget (leçon de l'essai rejeté)`);
}
for (let i = 1; i < TRAINER_DENSITY_ORDER.length; i++) {
  const prev = MARKER_CLEARANCE_BY_TYPE[TRAINER_DENSITY_ORDER[i - 1]].BET;
  const cur = MARKER_CLEARANCE_BY_TYPE[TRAINER_DENSITY_ORDER[i]].BET;
  ok(cur <= prev, `budget de dégagement : ${TRAINER_DENSITY_ORDER[i]} ≤ ${TRAINER_DENSITY_ORDER[i - 1]}`);
}
for (const n of [1, 2, 3, 4]) {
  for (const type of ["BLIND", "DEALER", "BET"]) {
    const c = trainerMarkerClearance(n, type);
    ok(c > 0 && c <= 1, `${n}T/${type} : budget dans (0,1] — ${c}`);
    const m = trainerMarkerApproachMax(n, type);
    ok(m >= 1.1 && m <= 1.9, `${n}T/${type} : plafond dans les bornes utiles — ${m}`);
  }
  ok(trainerMarkerApproachMax(3, "BET", { tight: true }) <= trainerMarkerApproachMax(3, "BET"),
    "écran étroit : le plafond se resserre");
}
/* ── LE DÉCALAGE DU BOUTON D A CHANGÉ DE NATURE ──────────────────────────
   Ce n'est plus une fraction d'ÉCART ANGULAIRE entre deux sièges, mais
   l'intensité d'un décalage LATÉRAL EN PIXELS (cf. trainerTableGeometry,
   DEALER_SIDE_PX). La raison est mesurée : une rotation autour du pot déplace le
   bouton d'un ARC dont la longueur croît avec le rayon du siège, si bien qu'en 4T
   il finissait à 49px de son BTN pour 47px de la SB — sur des sièges espacés de
   89px, donc impossible à attribuer. Le bouton et le tas de mise sont désormais
   séparés RADIALEMENT (20 % du segment siège→pot contre 42 %), et l'écart latéral
   n'a plus qu'à éviter la plaque du joueur.

   Ce qui doit rester vrai : l'intensité est positive (sinon bouton et tas se
   superposent) et bornée (sinon le bouton part chez le voisin — c'est exactement
   le défaut qu'on vient de corriger). */
for (const n of [1, 2, 3, 4]) {
  const o = trainerDealerAngleOffset(n);
  ok(o > 0 && o <= 0.3, `${n}T : intensité du décalage latéral du bouton D dans les bornes utiles — ${o}`);
}
ok(trainerDealerAngleOffset(4) >= trainerDealerAngleOffset(1),
  "mosaïque : décalage au moins aussi franc qu'en 1T (les objets y sont plus serrés)");

/* ══ 7 — la région sous la table est bornée en multi ══
   C'est elle qui garantit l'égalité géométrique des tuiles (§7 de la mission) :
   en 3T/4T sa hauteur est FIXE, donc le feutre ne dépend plus de ce qui est
   affiché dessous (barre de décision, verdict, bilan de coup complet). */
ok(TRAINER_DENSITY_TOKENS.compact.underMaxH === TRAINER_DENSITY_TOKENS.dense.underMaxH,
  "3T et 4T partagent la même hauteur de région sous la table");
for (const name of ["compact", "dense"]) {
  const d = TRAINER_DENSITY_TOKENS[name];
  const barre = d.actionBtnMinH + d.sizingBtnH + d.stepperH + 3 * d.actionGap;
  ok(d.underMaxH >= barre, `${name} : la région sous la table loge la barre de commande (${d.underMaxH} ≥ ${barre})`);
}
ok(TRAINER_DENSITY_TOKENS.normal.underMaxH > 1000, "1T : aucune borne (la table n'est pas en mosaïque)");

console.log(`✅ test-trainer-density — ${passed} assertions OK`);
