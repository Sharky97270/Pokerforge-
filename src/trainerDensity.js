/* ═══════════════════════════════════════════════════════════════
   PokerForge — DENSITÉ D'AFFICHAGE DU TRAINER (source unique).

   Le problème que ce module remplace : les dimensions des objets posés sur la
   table (avatar, bouton D, blindes, mises, board, boutons d'action) vivaient
   éparpillées entre `TRAINING_LAYOUT` (inline JSX) et une trentaine de règles
   `!important` de styles.js. Les deux se contredisaient — mesuré avant refonte :
   `cfg.dbtnSz` valait 13px en 3T et 10px en 4T, mais `.dealer-btn{width:22px
   !important}` gagnait, et le bouton D faisait 22px sur les QUATRE modes, soit
   13 % de la hauteur du feutre en 3T/4T contre 3 % en 1T.

   Le remplacement n'est PAS un `transform:scale()` global (§9 de la mission :
   texte flou, cibles de clic rognées, ancres déplacées). C'est un jeu de
   dimensions RÉELLES par mode, publié à la fois :
     • en JS  → `trainerDensity(n)` pour les tailles passées en props ;
     • en CSS → `trainerDensityVars(n)` pose des variables sur la tuile `.tw`,
       consommées par les règles `.grid2/.grid3/.grid4`.
   Une seule valeur par grandeur, donc, et elle est la même des deux côtés.

   Échelle : 1T normal · 2T medium · 3T compact · 4T dense. Les tuiles 3T et 4T
   ont presque la même taille (mesuré 361px et 360px de haut à 1680×910 : la
   mosaïque 3T est une grille 2×2 dont la 3ᵉ cellule est centrée), donc `dense`
   n'est qu'un cran sous `compact` — pas une rupture.
═══════════════════════════════════════════════════════════════ */

export const TRAINER_DENSITY_ORDER = ["normal", "medium", "compact", "dense"];

export const TRAINER_DENSITY_BY_TABLES = {
  1: "normal",
  2: "medium",
  3: "compact",
  4: "dense",
};

/* Chaque jeton est une DIMENSION, pas un facteur d'échelle — sauf ceux dont le
   nom finit par `Zoom`/`Scale`, qui pilotent une grappe entière (le zoom CSS
   préserve le centre de l'élément, donc les ancres restent calées sur l'anneau).

   Les valeurs de `normal` reproduisent EXACTEMENT le 1T livré : ce mode est la
   référence visuelle validée, il ne doit rien changer. */
export const TRAINER_DENSITY_TOKENS = {
  normal: {
    /* ── Sièges ── */
    avatarSize: 68,          // diamètre du médaillon (px)
    avatarRing: 7,           // épaisseur du halo décoratif (::before inset)
    seatZoom: 1,             // densité de la grappe (cartes+plaque+badges)
    seatGap: 3,              // écart avatar ↔ cartes / plaque (px)
    nameplateFs: 11,
    /* ── Marqueurs ── */
    dealerSize: 22,
    blindScale: 1,
    betScale: 1,
    /* ── Centre ── */
    boardZoom: 1,
    boardGap: 8,
    potH: 30,
    /* ── Zone de décision ── */
    actionPad: "8px 10px 10px",
    actionBtnMinH: 52,
    actionBtnPadY: 8,
    actionGap: 5,
    actionLabelFs: 13,
    actionSizingFs: 10,
    sizingBtnH: 20,
    sizingBtnFs: 9,
    stepperH: 20,
    /* ── Placement ── */
    seatRingFactor: 1,       // multiplicateur du rayon des sièges
    betOffset: 1,            // multiplicateur du rapprochement des mises
    markerClearance: 1,      // ↓ voir MARKER_CLEARANCE_PX (TrainerTab)
    markerApproachMax: 1.3,
    underMaxH: 9999,
  },
  medium: {
    avatarSize: 46,
    avatarRing: 5,
    seatZoom: 0.95,
    seatGap: 2,
    nameplateFs: 10.5,
    dealerSize: 17,
    blindScale: 0.84,
    betScale: 0.88,
    boardZoom: 0.45,
    boardGap: 5,
    potH: 24,
    /* ── ZONE DE DÉCISION DU 2T — ÉLARGIE, ET VOICI SUR QUOI (§6) ──────────
       La tuile 2T n'a qu'UNE rangée : sa cellule fait 761px de haut à 1600×950
       quand celle du 4T en fait 377. Mesuré : la zone de table y dispose de
       592px et n'en consomme que 304, parce que le feutre est déjà à 94 % de la
       LARGEUR de la cellule et que sa hauteur en découle (394/1.70 = 232). Ces
       288px ne peuvent donc pas revenir au feutre sans changer sa forme — ce
       que TRAINER_FELT_ASPECT interdit. Ils reviennent au seul autre contenu
       fonctionnel de la tuile : le bandeau de décision, ramené de l'échelle
       « compacte » du 3T à celle du 1T. Le feutre ne bouge ni en taille ni en
       forme (vérifiable : npm run audit:finitions → 2T 394×232).
       PLAFOND : l'échelle du 1T, jamais au-delà. La monotonie « rien ne grossit
       quand la tuile rétrécit » est un invariant testé (test-trainer-density) ;
       ces jetons sont donc posés ÉGAUX à ceux de `normal`, pas au-dessus. */
    actionPad: "7px 9px 7px",
    actionBtnMinH: 52,
    actionBtnPadY: 8,
    actionGap: 5,
    actionLabelFs: 13,
    actionSizingFs: 10,
    sizingBtnH: 20,
    sizingBtnFs: 9,
    stepperH: 20,
    seatRingFactor: 1,
    betOffset: 1,
    markerClearance: 0.7,
    markerApproachMax: 1.24,
    underMaxH: 300,
  },
  compact: {
    avatarSize: 30,
    avatarRing: 3.5,
    seatZoom: 0.86,
    seatGap: 1,
    nameplateFs: 9.5,
    dealerSize: 13,
    blindScale: 0.6,
    betScale: 0.72,
    boardZoom: 0.56,
    boardGap: 3,
    potH: 18,
    actionPad: "3px 5px 3px",
    actionBtnMinH: 30,
    actionBtnPadY: 3,
    actionGap: 3,
    actionLabelFs: 11,
    actionSizingFs: 8,
    sizingBtnH: 13,
    sizingBtnFs: 7.5,
    stepperH: 14,
    seatRingFactor: 1,
    betOffset: 1,
    markerClearance: 0.55,
    markerApproachMax: 1.34,
    underMaxH: 88,
  },
  dense: {
    avatarSize: 28,
    avatarRing: 3,
    seatZoom: 0.84,
    seatGap: 1,
    nameplateFs: 9,
    dealerSize: 11.5,
    blindScale: 0.54,
    betScale: 0.66,
    boardZoom: 0.79,
    boardGap: 2,
    potH: 17,
    actionPad: "2px 5px 2px",
    actionBtnMinH: 28,
    actionBtnPadY: 2,
    actionGap: 3,
    actionLabelFs: 10.5,
    actionSizingFs: 7.5,
    sizingBtnH: 12,
    sizingBtnFs: 7,
    stepperH: 13,
    seatRingFactor: 1,
    betOffset: 1,
    markerClearance: 0.52,
    markerApproachMax: 1.36,
    underMaxH: 88,
  },
};

/* Écran étroit ou court : la tuile perd de la largeur (mosaïque à nombre de
   colonnes constant) sans que rien de ce qu'on y pose ne rétrécisse. On descend
   donc d'un demi-cran, sur les grandeurs qui coûtent de la place et sur elles
   seules — les polices de décision ne bougent pas (lisibilité, §5). */
export const TRAINER_DENSITY_TIGHT = {
  normal: {},
  medium: { avatarSize: 42, seatZoom: 0.88, boardZoom: 0.40 },
  compact: { avatarSize: 27, seatZoom: 0.8, boardZoom: 0.50, blindScale: 0.54, betScale: 0.66 },
  dense: { avatarSize: 25, seatZoom: 0.78, boardZoom: 0.71, blindScale: 0.5, betScale: 0.62 },
};

/* ── RAPPROCHEMENT DES MARQUEURS : UN BUDGET PAR TYPE ───────────────────────
   `markerClearance` ci-dessus est le facteur GÉNÉRAL du mode. Il ne suffit pas :
   les trois marqueurs ne butent pas sur le même obstacle et n'ont pas la même
   taille, et l'écart se creuse en mosaïque.

   Mesuré en 3T (feutre 360×184, demi-axes 180×92), avant cette table :
     · siège BTN      ρ = 0.930   (sur l'anneau)
     · bouton D       ρ = 0.639
     · tas de mise    ρ = 0.515   ← à mi-chemin du centre, « impossible à
                                    rattacher visuellement à son joueur » (§4)
   Le tas restait au plancher parce que son budget (154px, calé sur les cartes
   du Hero en 1T) reste énorme sur un feutre de 184px de haut. Et comme le
   bouton, lui, avançait, les deux se croisaient : boutonD↔mise, 23 cas sur 60.

   On sépare donc les trois budgets par mode. L'ordre voulu, du plus externe au
   plus interne, est : siège → bouton D → blinde/mise → pot/board. Le bouton
   appartient au JOUEUR, il reste donc collé à son siège ; le tas s'avance vers
   le pot, mais pas au-delà du rayon où il cesse d'être lisible comme « la mise
   de ce joueur-là ». */
export const MARKER_CLEARANCE_BY_TYPE = {
  normal:  { BLIND: 1,    DEALER: 1,    BET: 1 },
  medium:  { BLIND: 0.7,  DEALER: 0.7,  BET: 0.7 },
  compact: { BLIND: 0.55, DEALER: 0.55, BET: 0.55 },
  dense:   { BLIND: 0.52, DEALER: 0.52, BET: 0.52 },
};
/* Une tentative de budget PAR TYPE (bouton D plus externe, tas plus interne) a
   été mesurée et REJETÉE : à budget dealer 0.30, le bouton atteint bien son
   siège mais tombe sur la PLAQUE de son joueur pour les sièges du haut — la
   grappe n'est pas symétrique (cartes au-dessus de l'avatar, plaque en dessous),
   donc « vers le centre » traverse la plaque en haut et les cartes en bas.
   Mesuré, 3T, n=24 : boutonD↔plaque 0→40, avatar↔mise 0→22. Les trois marqueurs
   partagent donc le même budget, et c'est le décalage ANGULAIRE du bouton qui
   règle sa cohabitation avec le tas (voir DEALER_ANGLE_OFFSET). */
/* Le plafond suit la même logique que le budget : il protège l'aération en 1T,
   il doit se desserrer là où le risque est l'inverse. */
export const MARKER_APPROACH_MAX_BY_TYPE = {
  normal:  { BLIND: 1.3,  DEALER: 1.3,  BET: 1.3 },
  medium:  { BLIND: 1.24, DEALER: 1.24, BET: 1.24 },
  compact: { BLIND: 1.34, DEALER: 1.34, BET: 1.34 },
  dense:   { BLIND: 1.36, DEALER: 1.36, BET: 1.36 },
};
/* Écran étroit : on resserre les trois d'un cran (le feutre y est bien plus
   petit sans que les objets suivent). */
export const MARKER_APPROACH_MAX_TIGHT = { compact: 1.18, dense: 1.18 };

/* ── DÉCALAGE ANGULAIRE DU BOUTON D, en fraction d'écart entre deux sièges ──
   Le bouton et le tas de mise du BTN vivent sur des rayons voisins ; ce qui les
   sépare est un angle. À 0.34 (valeur historique), l'arc mesuré en 3T vaut 33px
   pour un besoin de 37.5 (demi-badge 31 + demi-bouton 6.5) : il manquait 4px, et
   c'est le chevauchement boutonD↔mise qui subsistait.

   Élargir ce décalage avait été testé puis REJETÉ en 1T : le bouton allait alors
   rencontrer les CARTES du voisin. Ce qui a changé depuis, c'est la taille du
   bouton — 22px sur les quatre modes avant, 13px en 3T et 11.5px en 4T
   maintenant — et celle des grappes voisines. L'arbitrage se rouvre donc, mais
   UNIQUEMENT en mosaïque : le 1T garde 0.34, sa mesure d'origine tenant toujours. */
/* REVU avec la géométrie radiale (trainerTableGeometry) : le bouton D et le tas
   de mise ne partagent PLUS le même rayon — le bouton se pose à 20 % du segment
   siège→pot, la mise à 42 %. Ils sont donc déjà séparés de ~22 % de ce segment
   (49 px mesurés en 4T) sans aucun décalage angulaire. L'angle n'a plus qu'un
   travail : éviter la PLAQUE du joueur, juste sous son avatar. Les valeurs
   ci-dessus, calibrées quand les deux marqueurs se disputaient le même anneau,
   éloignaient désormais le bouton de son propre BTN — mesuré 50 à 60 px sur un
   feutre 4T de 198 px de haut, soit le tiers de la table. */
export const DEALER_ANGLE_OFFSET = { normal: 0.20, medium: 0.22, compact: 0.24, dense: 0.24 };

export function trainerDealerAngleOffset(numTables = 1) {
  return DEALER_ANGLE_OFFSET[trainerDensityName(numTables)] ?? 0.34;
}

/** Facteur de budget de dégagement d'un marqueur, pour un mode donné. */
export function trainerMarkerClearance(numTables = 1, markerType = "BET") {
  const t = MARKER_CLEARANCE_BY_TYPE[trainerDensityName(numTables)];
  return (t && t[markerType]) ?? trainerDensity(numTables).markerClearance ?? 1;
}
/** Plafond de rapprochement d'un marqueur, pour un mode donné. */
export function trainerMarkerApproachMax(numTables = 1, markerType = "BET", opts = {}) {
  const name = trainerDensityName(numTables);
  if (opts.tight && MARKER_APPROACH_MAX_TIGHT[name] != null) return MARKER_APPROACH_MAX_TIGHT[name];
  const t = MARKER_APPROACH_MAX_BY_TYPE[name];
  return (t && t[markerType]) ?? trainerDensity(numTables).markerApproachMax ?? 1.3;
}

/* Hauteur nominale des tailles de carte de styles.js (.card-sm/md/lg/xl/2xl).
   Le board n'utilise pas la même TAILLE DE BASE selon le mode (2xl en 1T, xl en
   2T, lg en 3T, md en 4T) : `boardZoom` seul n'est donc pas comparable d'un mode
   à l'autre — un zoom plus grand sur une base plus petite peut rendre une carte
   plus petite. La grandeur qui compte, et la seule qu'on peut contrôler, est la
   hauteur RENDUE. */
export const CARD_BASE_HEIGHT = { xs: 26, sm: 33, smp: 39, md: 47, lg: 66, xl: 83, "2xl": 104, "3xl": 130, "1t-hero-bottom": 66, "1t-hero-top": 61, "1t-board": 79, "1t-villain-back": 41 };
export const CARD_BASE_WIDTH = { xs: 19, sm: 24, smp: 28, md: 34, lg: 48, xl: 60, "2xl": 76, "3xl": 95, "1t-hero-bottom": 48, "1t-hero-top": 44, "1t-board": 57, "1t-villain-back": 30 };
/* ── LE BOARD DU 1T N'EST PAS UN « 2xl » MIS À L'ÉCHELLE ───────────────────
   Le rendu 1T donne au board la taille dédiée `.card-1t-board` (57x79 px,
   gouttière 5) et NE lui applique aucun zoom de densité : la variable
   `--pf-d-board-zoom` n'est consommée que par `.grid2/3/4`. Déclarer « 2xl »
   ici faisait décrire un board de 235x60 px là où on en peignait un de 305x79.

   Ce n'est pas une imprécision d'affichage : cette taille alimente la BANDE
   CENTRALE INTERDITE et le couloir pot/board. Une erreur de 70 px en largeur
   et 19 px en hauteur, c'est un board qui déborde de 35 px de chaque côté de sa
   propre zone d'exclusion — d'où, mesuré, les cartes d'un siège de flanc posées
   dessus (2578 px²) et le pot qui le chevauche (562 px²). */
export const BOARD_CARD_SIZE_BY_TABLES = { 1: "1t-board", 2: "xl", 3: "lg", 4: "md" };
/* Cartes posées SUR UN SIÈGE. Elles décident de l'encombrement du bloc de
   joueur, donc de la place qui reste pour son tas de mise — le Hero, seul à
   avoir ses cartes ouvertes au grand format, occupe bien plus que ses voisins
   (1T : 95×130 par carte contre 48×66 pour un dos). Ces deux tables sont la
   source unique : `TRAINING_LAYOUT` (rendu) et `trainerSeatBlockPx` (placement)
   les lisent toutes les deux, sans quoi la zone de sécurité du joueur décrirait
   un bloc qui n'est pas celui qu'on peint. */
/* Echelle des cartes du Hero. Elle doit etre MONOTONE et proportionnee au
   feutre : mesure, la main du Hero occupait 17 % de la hauteur du feutre en 1T,
   31 % en 2T, 18 % en 3T et 16 % en 4T. Le 2T etait calibre quand son ovale
   etait presque rond, donc bien plus haut — depuis que sa forme est fixe, cette
   main mangeait le couloir central et le board revenait dessus (mesure : 1.7 px
   d ecart, soit un contact a l image). */
export const HERO_CARD_SIZE_BY_TABLES = { 1: "3xl", 2: "smp", 3: "smp", 4: "smp" };
/* 1T : le rendu passe `1t-villain-back` (30x41), pas « lg » (48x66). Décrire un
   dos de carte 60 % trop profond gonfle la zone de sécurité du joueur, donc
   repousse son tas de 25 px vers le pot et fait démarrer le couloir central
   25 px trop bas — deux défauts pour une seule ligne fausse. */
export const VILLAIN_CARD_SIZE_BY_TABLES = { 1: "1t-villain-back", 2: "sm", 3: "xs", 4: "xs" };
/* Le siège Hero du BAS en 1T n'utilise PAS cfg.heroCard : le rendu lui donne une
   taille dediee (.card-1t-hero-bottom, 48x66). C'est elle qui decide de
   l'encombrement reel de sa main, donc de la place qui reste pour son tas et
   pour le board. Prendre "3xl" (95x130) faisait croire a un bloc 2.6 fois plus
   profond qu'il ne l'est — mesure : couloir annonce a -28px quand le navigateur
   en montre +19. */
export const HERO_SEAT_CARD_SIZE_BY_TABLES = { 1: "1t-hero-bottom", 2: "smp", 3: "smp", 4: "smp" };

/**
 * Encombrement du BLOC d'un siège, en px, mesuré depuis le centre de l'avatar :
 *  - `halfW`      : demi-largeur (paire de cartes, la plus large des deux formes) ;
 *  - `towardPot`  : ce qui dépasse DU CÔTÉ DU POT (rayon d'avatar + écart + carte).
 * C'est la « PLAYER_SAFE_ZONE » du §17, exprimée là où elle sert : dans le calcul
 * du placement des marqueurs.
 */
export function trainerSeatBlockPx(numTables = 1, { hero = false, opts = {}, avatarPx = 0, axis = null } = {}) {
  const d = trainerDensity(numTables, opts);
  const key = (hero ? HERO_SEAT_CARD_SIZE_BY_TABLES : VILLAIN_CARD_SIZE_BY_TABLES)[numTables] || "sm";
  const cw = CARD_BASE_WIDTH[key] || 24;
  const ch = CARD_BASE_HEIGHT[key] || 33;
  const gap = d.seatGap || 2;
  const zoom = d.seatZoom || 1;
  /* `avatarPx` porte la taille RÉELLEMENT peinte, quand l'appelant la connaît.
     Depuis que le médaillon est une fraction du feutre (§7), le jeton de
     densité n'en est plus que le PLAFOND. S'en servir ici décrirait un bloc de
     joueur plus profond que celui qu'on peint, et repousserait le tas de mise
     d'autant vers le centre — mesuré, 4 mises revenues sur le board pour 24 px
     d'écart entre l'avatar décrit (68) et l'avatar peint (44). */
  const avatarR = (avatarPx > 0 ? avatarPx : (d.avatarSize || 40)) / 2;
  /* ── UN BLOC DE SIÈGE N'A PLUS LA MÊME FORME SELON SON AXE ───────────────
     Ce calcul décrivait une pile VERTICALE : profondeur = rayon d'avatar +
     écart + HAUTEUR d'une carte, largeur = la paire côte à côte. C'était vrai
     tant que toutes les grappes étaient empilées de haut en bas.

     Depuis que les zones suivent l'axe radial, un siège de FLANC pose sa paire
     de cartes À CÔTÉ de son avatar : sa profondeur vers le centre n'est plus la
     hauteur d'une carte mais la LARGEUR DE LA PAIRE — deux fois plus — et sa
     largeur perpendiculaire n'est plus que la hauteur d'une carte.
     Décrire le bloc de travers revient à autoriser un tas de mise ou un bouton
     D à se poser sur les cartes de leur propre joueur : mesuré en 4T,
     « cartes ↔ bouton » 23 fois et « cartes ↔ mise » 14 fois. */
  const paireW = 2 * cw + gap;
  const horizontal = axis === "left" || axis === "right";
  return {
    halfW: +((horizontal ? Math.max(ch / 2, avatarR * 1.15) : Math.max(cw + gap / 2, avatarR * 1.15)) * zoom).toFixed(1),
    towardPot: +((avatarR + gap + (horizontal ? paireW : ch)) * zoom).toFixed(1),
  };
}

/* ── §7/§23 — L'AVATAR EST UNE FRACTION DE LA TABLE ────────────────────────
   Le 1T calculait son médaillon en PIXELS (« 70 pour le Hero, 64 sinon »), et
   un point de rupture CSS lui en retranchait 10 sur les écrans courts. Deux
   nombres saisis à la main pour une grandeur qui doit suivre la table : sur un
   feutre de 483 px de large, l'avatar en occupait 11.2 % contre 7.8 % sur un
   feutre de 710. Le même écran rendait donc une table « serrée » ou « aérée »
   selon sa hauteur, et le §24 (« les avatars ne doivent jamais dominer la
   table ») n'était vérifié que sur les grandes fenêtres.

   La fraction retenue rend, à taille de fenêtre de référence, un médaillon
   ~18 % plus petit que l'actuel — c'est le §7 pris au mot — et elle vaut
   désormais pour TOUTES les tailles de fenêtre.

   Ce que la fonction rend est la valeur à passer en `--avatar-size` ; la règle
   CSS de base y ajoute son liseré (`calc(var(--avatar-size) + 14px)`), d'où la
   soustraction. Cette constante est publiée pour que le jour où le liseré
   change, une seule ligne bouge. */
export const AVATAR_FELT_RATIO = 0.090;
export const AVATAR_MIN_PAINTED_PX = 32;
export const AVATAR_CSS_PADDING_PX = 14;
export const AVATAR_HERO_BOOST = 1.09;
export function trainerAvatarPaintedPx({ feltW = 0, hero = false, dense = 1 } = {}) {
  const base = feltW > 0 ? feltW * AVATAR_FELT_RATIO : 78;
  return Math.max(AVATAR_MIN_PAINTED_PX, Math.round(base * (hero ? AVATAR_HERO_BOOST : 1) * dense));
}
/** Valeur à passer en `--avatar-size` pour obtenir la taille peinte voulue. */
export function trainerAvatarSizeVar(opts = {}) {
  return Math.max(16, trainerAvatarPaintedPx(opts) - AVATAR_CSS_PADDING_PX);
}

/** Hauteur rendue d'une carte du board, en px, pour un mode donné. */
export function trainerBoardCardHeight(numTables = 1, opts = {}) {
  const base = CARD_BASE_HEIGHT[BOARD_CARD_SIZE_BY_TABLES[numTables] || "lg"] || 66;
  return +(base * trainerDensity(numTables, opts).boardZoom).toFixed(1);
}

export function trainerDensityName(numTables = 1) {
  return TRAINER_DENSITY_BY_TABLES[numTables] || (numTables > 4 ? "dense" : "medium");
}

/**
 * Jetons de densité d'un mode.
 * @param numTables 1..4
 * @param opts.tight écran étroit/court → demi-cran plus dense
 */
export function trainerDensity(numTables = 1, opts = {}) {
  const name = trainerDensityName(numTables);
  const base = TRAINER_DENSITY_TOKENS[name];
  return opts.tight ? { ...base, ...(TRAINER_DENSITY_TIGHT[name] || {}) } : { ...base };
}

/* Nom de variable CSS d'un jeton : `avatarSize` → `--pf-d-avatar-size`. */
export function densityVarName(token) {
  return `--pf-d-${String(token).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

const UNITLESS = new Set(["seatZoom", "blindScale", "betScale", "boardZoom", "seatRingFactor", "betOffset", "markerClearance", "markerApproachMax"]);
const RAW = new Set(["actionPad"]);

/**
 * Style inline à poser sur la tuile (`.tw`) : publie TOUS les jetons en
 * variables CSS. Les règles `.grid2/3/4` les consomment — plus aucune dimension
 * de table n'est écrite en dur dans styles.js.
 */
export function trainerDensityVars(numTables = 1, opts = {}) {
  const d = trainerDensity(numTables, opts);
  const out = { "--pf-density": trainerDensityName(numTables) };
  for (const [k, v] of Object.entries(d)) {
    out[densityVarName(k)] = RAW.has(k) ? String(v) : UNITLESS.has(k) ? String(v) : `${v}px`;
  }
  return out;
}
