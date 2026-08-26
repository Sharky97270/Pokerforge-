/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — GÉOMÉTRIE DE LA TABLE DU TRAINER (source unique).

   Ce module répond à UNE question et à une seule : « où poser un objet sur le
   feutre pour qu'un joueur comprenne la main en deux secondes ? ». Il ne connaît
   rien au poker — il reçoit des positions de sièges en % du conteneur et rend
   des points en % du conteneur.

   ── POURQUOI IL EXISTE ────────────────────────────────────────────────────
   Le placement des marqueurs (mise, blinde, bouton D) vivait auparavant sur un
   ANNEAU elliptique concentrique au feutre, aux proportions DIFFÉRENTES de
   celles du feutre (rayons .55 rx / .41 ry). Prendre l'angle normalisé d'un
   siège sur cet anneau ne rend donc pas la même DIRECTION : le marqueur part
   de côté. Mesuré avant refonte, écart angulaire entre l'axe siège→pot et l'axe
   siège→mise :

       1T   moyenne 47°, maximum 76°   (5 mises sur 7 au-delà de 35°)
       2T   8°     3T  3°     4T  14°

   Conséquence directe et mesurée en 1T : le tas de la SB tombait plus près du
   BTN que de la SB (ratio d'attribution 0.87 < 1). Autrement dit, la table ne
   permettait pas de savoir QUI avait misé — le critère « gold master » de la
   mission.

   ── LE MODÈLE ─────────────────────────────────────────────────────────────
   Un seul axe, celui du §4 de la mission :

       marqueur = centreSiège + normalize(centrePot − centreSiège) × L

   `normalize` n'a de sens VISUEL qu'en pixels : les coordonnées sont en % d'un
   conteneur qui n'est pas carré, donc un vecteur unitaire en % pointe ailleurs
   qu'à l'écran. Tout le calcul se fait donc en px, et ne revient en % qu'à la
   fin.

   L est borné par trois choses, dans cet ordre :
     1. un DÉGAGEMENT DU SIÈGE (§17) — demi-bloc du joueur + demi-marqueur : en
        deçà, le tas est posé sur l'avatar ou sur les cartes de son propriétaire ;
     2. un DÉGAGEMENT DU POT (§15) — au-delà, le tas se confond avec le pot et
        on ne peut plus reconstruire les contributions ;
     3. la BANDE CENTRALE INTERDITE (§16) — board + pot. Si l'axe la traverse, on
        RECULE le marqueur vers son joueur ; le point reste sur l'axe.

   Reculer ne suffit pas pour les sièges de l'AXE VERTICAL (le Hero en bas-centre,
   et le siège haut-centre des structures paires) : leur rayon traverse le board
   de part en part. Ceux-là seulement obtiennent une POCHE LATÉRALE — comme dans
   tous les clients de poker pour la main du Hero. Elle est bornée par
   `MARKER_MAX_POCKET_RATIO` × (distance au voisin le plus proche) : c'est CETTE
   borne, et non l'angle, qui garantit qu'un tas reste attribuable à son joueur.

   ── LA BANDE CENTRALE EST CALCULÉE, PAS SAISIE ────────────────────────────
   L'ancienne zone interdite était un rectangle en % réglé à la main, faux dans
   les deux sens selon le mode (mesuré : demi-largeur réelle du board 23.8 % en
   1T pour 20 % déclarés, 12.4 % en 4T pour 19 % déclarés). Elle est désormais
   DÉRIVÉE des mêmes nombres que le rendu — taille de carte du board, zoom de
   densité, gouttière, ancre verticale — si bien qu'elle ne peut plus diverger.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  trainerDensity,
  trainerMarkerClearance,
  trainerDealerAngleOffset,
  trainerSeatBlockPx,
  CARD_BASE_HEIGHT,
  BOARD_CARD_SIZE_BY_TABLES,
} from "./trainerDensity.js";
import { trainerTableGeometry, trainerBoardPosition, trainerPotPosition } from "./trainerVisualConfig.js";

/* Toutes les tailles de carte de styles.js partagent la même proportion
   (19/26, 24/33, 34/47, 48/66, 60/83, 76/104, 95/130) à ±1 % près. */
export const CARD_ASPECT_RATIO = 0.727;

/* Gouttière du board, AVANT zoom, telle que le rendu la passe en `gap`.
   Le 1T en passe 5 quand les cinq cartes sont là (6 en deçà) : c'est le cas à
   CINQ cartes qui décide de l'emprise, donc c'est lui qu'on décrit. */
export const BOARD_GAP_BY_TABLES = { 1: 5, 2: 5, 3: 3, 4: 3 };

/* ── RATIO D'ASPECT DU FEUTRE — CONSTANTE DE LA MARQUE (§6/§19) ────────────
   Mesuré AVANT correction, largeur/hauteur du feutre par mode :
       1T 1.34 … 1.54 (il respirait avec le bandeau de décision !)
       2T 1.16  ← quasi un CERCLE, le défaut signalé dans la vidéo
       3T 1.71 … 1.95      4T 1.79
   Une table qui change de forme change les angles des sièges, les distances au
   pot et donc la place de chaque mise : aucune calibration ne peut tenir sur les
   quatre modes à la fois.

   ── POURQUOI 1.70 ET PAS LE RATIO DU 1T ───────────────────────────────────
   La mission demande de prendre le 1T comme référence. Essayé, mesuré, rejeté :
   la cellule d'une tuile 3T/4T est LARGE ET COURTE (417×260 px à 1600×950), donc
   sa hauteur est le budget rare. Y imposer un ovale plus haut ne rend pas de
   hauteur — ça retire de la LARGEUR, et la largeur est justement la seule bande
   libre du feutre (le board occupe le centre, les blocs de sièges les bords) :
       ratio 1.55 → feutre 4T 257×166 au lieu de 354×198, soit −39 % de surface,
                    et l'écart angulaire des mises remonte à 61-68° parce que les
                    blocs de sièges, eux, ne rétrécissent pas ;
       ratio 1.42 → −19 % de largeur, sièges voisins qui se touchent.
   À l'inverse le 1T, lui, a de la LARGEUR à revendre : sa zone fait 866 px de
   large pour un feutre de 606. On rend donc au 1T en largeur ce que la constante
   lui prend en hauteur (marges latérales 15 % → 9 %, cf. WEB_GEOMETRY_BY_COUNT),
   et le feutre 1T passe de 606×428 à ~710×418 : plus grand, et enfin de forme
   constante. Mesuré après correction, les quatre modes rendent exactement 1.70.

   Ce que la constante NE fige pas, volontairement : la TAILLE. La cellule décide
   encore de la taille de la table, jamais de sa forme. */
export const TRAINER_FELT_ASPECT = 1.70;

/* Ratio de la ZONE (le conteneur) qui produit ce ratio de FEUTRE, compte tenu
   des marges de géométrie du mode. */
export function trainerZoneAspect(numTables = 1, geometry = null) {
  const g = geometry || trainerTableGeometry(numTables);
  const kw = 100 - (g.left || 0) - (g.right || 0);
  const kh = 100 - (g.top || 0) - (g.bottom || 0);
  if (!(kw > 0) || !(kh > 0)) return TRAINER_FELT_ASPECT;
  return +(TRAINER_FELT_ASPECT * (kh / kw)).toFixed(4);
}

/* ── ANCRES DU CENTRE — une seule source pour le rendu ET pour le placement ──
   Ces deux fonctions rendent EXACTEMENT le % où le rendu pose le pot et le
   board. Elles étaient auparavant recalculées en ligne dans le JSX, à deux
   endroits (1T et mosaïque), avec des décalages différents : la cible des mises
   ne pouvait donc pas être le pot réel. §26. */
export function trainerPotAnchorPoint(numTables = 1, { hasBoard = false, seatCount = 6, isMobile = false, potYByCount = null, potYPreflopByCount = null } = {}) {
  const base = trainerPotPosition(numTables, hasBoard);
  if (isMobile) return { x: base.x, y: hasBoard ? 31 : 37 };
  const table = hasBoard ? potYByCount : potYPreflopByCount;
  const y0 = (table && table[seatCount] != null) ? table[seatCount] : base.y;
  if (numTables === 1) return { x: base.x, y: y0 };
  const tight = numTables >= 3;
  return { x: base.x, y: y0 + (hasBoard ? (tight ? 0 : 5) : (tight ? 4 : 10)) };
}

export function trainerBoardAnchorPoint(numTables = 1, { seatCount = 6, isMobile = false, boardYByCount = null } = {}) {
  const base = trainerBoardPosition(numTables);
  if (isMobile) return { x: base.x, y: 46 };
  const y0 = (boardYByCount && boardYByCount[seatCount] != null) ? boardYByCount[seatCount] : base.y;
  if (numTables === 1) return { x: base.x, y: y0 };
  return { x: base.x, y: y0 + (numTables >= 3 ? 3 : 7) };
}

/* ── LE COULOIR CENTRAL EST CALCULÉ, PLUS RÉGLÉ À LA MAIN (§15/§16/§26) ────
   Entre le bas du bloc du siège HAUT et le haut des cartes du HERO, une seule
   colonne doit loger le pot ET le board. Les ancres verticales étaient des
   tables saisies à la main (WEB_POT_Y_BY_COUNT / WEB_BOARD_Y_BY_COUNT), calées
   sur des feutres qui n'existent plus depuis que le ratio est constant. Mesuré
   juste après ce changement :
       2T  pot↔board  +0.1 px   board↔cartes Hero  −10.6 px  (board SOUS la main)
       3T  pot↔board  +0.6 px   board↔cartes Hero   −6.1 px
   On mesure donc le couloir réellement disponible et on y répartit les deux
   blocs. Les tables historiques restent le REPLI : au tout premier rendu, aucune
   dimension n'est encore mesurée.

   Rendu en % de la ZONE (repère des sièges) ; le rendu, qui peint pot et board
   DANS le feutre, reconvertit via `zonePctToFeltPct`. */
export function zonePctToFeltPct(pt, geometry) {
  const g = geometry || {};
  const w = 100 - (g.left || 0) - (g.right || 0);
  const h = 100 - (g.top || 0) - (g.bottom || 0);
  return { x: w ? (pt.x - (g.left || 0)) * 100 / w : pt.x, y: h ? (pt.y - (g.top || 0)) * 100 / h : pt.y };
}

const CENTRE_GAP_PX = 6;
export function trainerCentreLayout({
  seats, heroPos = null, numTables = 1, hasBoard = false, ringGeom = null,
  geometry = null, tight = false, avatarPx = 0, avatarHeroPx = 0,
} = {}) {
  if (!seats || !ringGeom || !(ringGeom.areaH > 0)) return null;
  const area = areaPx(ringGeom, numTables, geometry);
  const d = trainerDensity(numTables, { tight });
  const avatarR = (d.avatarSize || 40) / 2;
  const zoom = d.seatZoom || 1;
  const ys = Object.values(seats).map(s => s.y).filter(v => typeof v === "number");
  if (!ys.length) return null;
  /* ── PLANCHER DU BLOC LE PLUS HAUT — CE QUI PEND SOUS LUI A CHANGÉ ────────
     Ce calcul lisait « avatar + plaque ». C'était vrai quand la grappe d'un
     siège haut se terminait par sa plaque. Depuis que les zones suivent l'axe
     radial (cf. trainerSeatAnchors), le côté INTÉRIEUR d'un siège haut porte
     ses CARTES — la plaque, elle, est partie vers l'extérieur de la table.

     Or une carte est bien plus profonde qu'une plaque : en 1T, 66 px contre
     ~23. Le couloir démarrait donc 40 px trop haut, et le pot venait se poser
     sur la main du joueur du haut. Mesuré : cartes ↔ pot, 1874 px² de
     recouvrement.

     `trainerSeatBlockPx().towardPot` est déjà la grandeur juste — c'est celle
     qu'utilise le placement des marqueurs pour la zone de sécurité du joueur
     (§17). L'employer ici fait qu'un seul nombre décrit désormais « jusqu'où
     descend un siège », partout. */
  const topBlock = trainerSeatBlockPx(numTables, { hero: false, opts: { tight }, avatarPx });
  const topY = Math.min(...ys) * area.h / 100 + topBlock.towardPot;
  // Plafond du bloc du HERO : ses cartes, ouvertes et au plus grand format.
  const heroSeat = heroPos && seats[heroPos] ? seats[heroPos] : null;
  /* +6 px de marge sur le bloc du Hero : sa grappe porte, en plus des cartes, un
     liseré de halo et le badge « à toi ». Sans cette marge, le board tombait
     encore 3.3 px sur sa main en 2T (mesuré) — l'estimation était juste, mais
     juste trop juste. */
  const heroY = heroSeat
    ? heroSeat.y * area.h / 100 - trainerSeatBlockPx(numTables, { hero: true, opts: { tight }, avatarPx: avatarHeroPx || avatarPx }).towardPot - 6
    : Math.max(...ys) * area.h / 100 - (avatarR + 40) * zoom;
  const pot = trainerPotSizePx(numTables, { tight });
  const available = heroY - topY - 2 * CENTRE_GAP_PX;
  /* Le board est dimensionné AVEC le couloir qu'on vient de mesurer : c'est le
     même nombre qui décide de sa taille et de sa place, donc les deux ne
     peuvent plus se contredire. */
  const board = hasBoard ? trainerBoardSizePx(numTables, { tight, feltH: feltHeightPx(ringGeom, numTables, geometry), corridorPx: available }) : null;
  const needed = pot.h + (board ? CENTRE_GAP_PX + board.cardH : 0);
  const corridor = Math.max(needed, available);
  /* Couloir SATURÉ (mesuré : mosaïque 4T à 1366×768, feutre de 133 px de haut —
     37 px disponibles pour 51 px de pot + board). Il faut alors choisir QUI
     déborde. Laisser le groupe démarrer sous le siège du haut fait déborder par
     le bas, donc sur la MAIN DU HERO — c'est le pire des deux : le §16 donne la
     priorité au board et le §17 protège la zone du joueur. On remonte donc le
     groupe.

     ── CE QUE LE GROUPE EFFLEURE EN REMONTANT A CHANGÉ ────────────────────
     Avant l'axe radial, remonter faisait toucher la PLAQUE du siège haut, et
     la borne était donc sa hauteur. Depuis, le côté intérieur d'un siège haut
     porte ses CARTES ; c'est elles que le pot vient effleurer. Le choix reste
     le bon — les cartes d'un adversaire sont des DOS, ils ne portent aucune
     information, alors que la main du Hero en porte toute — mais la borne doit
     suivre l'objet : on n'autorise l'empiètement que sur la profondeur de
     cartes du bloc, jamais jusqu'à l'avatar, qui doit rester entièrement
     lisible (c'est lui qui identifie le joueur). */
  const deficit = Math.max(0, needed - available);
  const empietementMax = Math.max(0, topBlock.towardPot - (avatarR * zoom)) * 0.9;
  const start = topY + CENTRE_GAP_PX + (corridor - needed) / 2 - Math.min(deficit, empietementMax);
  const potCy = start + pot.h / 2;
  const boardCy = board ? potCy + pot.h / 2 + CENTRE_GAP_PX + board.cardH / 2 : null;
  const toPct = v => v * 100 / area.h;
  return { potY: +toPct(potCy).toFixed(2), boardY: board ? +toPct(boardCy).toFixed(2) : null };
}

/* ── LE BOARD SUIT LA TAILLE DU FEUTRE (§21/§34) ──────────────────────────
   Les zooms de densité sont calés sur une fenêtre de référence. Ils ne suffisent
   pas : à 1366×768 la mosaïque 4T tombe à 226×133 px de feutre, et un board de
   37 px y occupe 28 % de la hauteur — il repassait alors sur les cartes du Hero
   (mesuré −18.6 px). On vise donc une FRACTION de la hauteur du feutre, bornée
   par le zoom du mode (jamais plus gros) et par un plancher de lisibilité
   (jamais illisible). C'est le §21 appliqué littéralement : les décorations se
   réduisent avant les informations poker, et le board ne descend jamais sous le
   seuil où on ne lit plus les rangs. */
export const BOARD_HEIGHT_RATIO = 0.21;
export const BOARD_MIN_CARD_H = 20;

/* ── LE COULOIR LIBRE, MESURÉ SANS LE BOARD ────────────────────────────────
   Hauteur réellement disponible entre le bas du bloc du siège le plus HAUT et
   le haut du bloc du HERO. Elle ne dépend que des sièges — donc on peut la
   calculer AVANT de décider de la taille du board, et rompre la circularité
   « le board a besoin de place / la place dépend du board ». */
export function trainerCorridorPx({ seats, heroPos = null, numTables = 1, ringGeom = null, geometry = null, tight = false, avatarPx = 0, avatarHeroPx = 0 } = {}) {
  if (!seats || !ringGeom || !(ringGeom.areaH > 0)) return 0;
  const area = areaPx(ringGeom, numTables, geometry);
  const ys = Object.values(seats).map(s => s.y).filter(v => typeof v === "number");
  if (!ys.length) return 0;
  const topY = Math.min(...ys) * area.h / 100 + trainerSeatBlockPx(numTables, { hero: false, opts: { tight }, avatarPx }).towardPot;
  const heroSeat = heroPos && seats[heroPos] ? seats[heroPos] : null;
  if (!heroSeat) return 0;
  const heroY = heroSeat.y * area.h / 100 - trainerSeatBlockPx(numTables, { hero: true, opts: { tight }, avatarPx: avatarHeroPx || avatarPx }).towardPot - 6;
  return Math.max(0, heroY - topY - 2 * CENTRE_GAP_PX);
}

/**
 * @param corridorPx  hauteur libre entre le siège haut et le Hero, si connue.
 */
export function trainerBoardZoom(numTables = 1, { feltH = 0, tight = false, corridorPx = 0 } = {}) {
  const base = CARD_BASE_HEIGHT[BOARD_CARD_SIZE_BY_TABLES[numTables] || "lg"] || 66;
  const density = trainerDensity(numTables, { tight }).boardZoom || 1;
  if (!(feltH > 0)) return density;
  let plafond = feltH * BOARD_HEIGHT_RATIO;
  /* ── LE BOARD SE MESURE À LA PLACE QU'IL A, PAS SEULEMENT AU FEUTRE ──────
     Le plafond ne regardait que la hauteur du feutre. Or ce n'est pas le feutre
     qui manque : c'est la colonne entre le bas des cartes du siège haut et le
     haut de la main du Hero. Mesuré en 1T à 1366x768, feutre de 284 px pour un
     couloir de 39 : le board tenait ses 21 % du feutre (59 px) et se posait
     donc sur le pot et sur les cartes du siège du haut — 8 tables sur 14.
     On lui donne ce qui reste après le pot, avec les deux écarts. Le plancher
     de lisibilité reste souverain : sous BOARD_MIN_CARD_H on préfère assumer un
     chevauchement plutôt que rendre un board qu'on ne peut plus lire (§21). */
  if (corridorPx > 0) {
    const potH = trainerDensity(numTables, { tight }).potH || 20;
    plafond = Math.min(plafond, corridorPx - potH - 2 * CENTRE_GAP_PX);
  }
  return +Math.min(density, Math.max(BOARD_MIN_CARD_H / base, plafond / base)).toFixed(3);
}

/* Hauteur du feutre en px, déduite de la zone mesurée et des marges du mode. */
export function feltHeightPx(ringGeom, numTables = 1, geometry = null) {
  if (!ringGeom || !(ringGeom.areaH > 0)) return 0;
  const g = geometry || trainerTableGeometry(numTables);
  return ringGeom.areaH * (100 - (g.top || 0) - (g.bottom || 0)) / 100;
}

/* Encombrement RENDU du board (5 emplacements réservés — le rendu garde la
   largeur complète pour que turn/river n'aient pas à recentrer les cartes). */
export function trainerBoardSizePx(numTables = 1, opts = {}) {
  const z = trainerBoardZoom(numTables, opts);
  const cardH = (CARD_BASE_HEIGHT[BOARD_CARD_SIZE_BY_TABLES[numTables] || "lg"] || 66) * z;
  const cardW = cardH * CARD_ASPECT_RATIO;
  const gap = (BOARD_GAP_BY_TABLES[numTables] ?? 4) * z;
  return { cardW: +cardW.toFixed(1), cardH: +cardH.toFixed(1), totalW: +(5 * cardW + 4 * gap).toFixed(1) };
}

/* Encombrement du bloc POT. La hauteur est un jeton de densité ; la largeur est
   dominée par « POT 14.5bb » et suit la hauteur de près (mesuré 84/30, 69/24,
   61/18, 69/17 → facteur 2.8 à 4.1, on retient le majorant). */
/* Le 1T rend le pot SUR UNE LIGNE — grappe de jetons, « POT », montant — là où
   la mosaïque l'empile en colonne. Sa largeur ne suit donc pas du tout le même
   rapport à sa hauteur : mesuré à 1366x768, bloc de 115 à 152 px pour 30 px de
   haut une fois les piles bornées (§27), contre 69/17 en 4T. Un facteur unique
   décrivait forcément l'un des deux de travers — et c'est le 1T qu'il
   sous-estimait, celui-là même où les tas venaient se coller au pot. */
const POT_WIDTH_FACTOR_BY_TABLES = { 1: 5.2, 2: 4.1, 3: 4.1, 4: 4.1 };
export function trainerPotSizePx(numTables = 1, opts = {}) {
  const h = trainerDensity(numTables, opts).potH || 20;
  const f = POT_WIDTH_FACTOR_BY_TABLES[numTables] ?? 4.1;
  return { w: +(h * f).toFixed(1), h: +h.toFixed(1) };
}

/* Dimensions nominales de la zone, en px, quand aucune mesure n'est encore
   disponible (premier rendu). Seul le RATIO compte pour la direction — et il
   est désormais constant, donc ce repli donne la bonne direction. */
function areaPx(ringGeom, numTables, geometry) {
  const w = ringGeom && ringGeom.areaW > 0 ? ringGeom.areaW : 800;
  const h = ringGeom && ringGeom.areaH > 0 ? ringGeom.areaH : 800 / trainerZoneAspect(numTables, geometry);
  return { w, h };
}

/* ── BANDE CENTRALE INTERDITE (§15/§16) ───────────────────────────────────
   Union du board (s'il y en a un) et du pot, plus une marge. Aucun tas, aucune
   blinde, aucun bouton D ne peut s'y poser. */
export function trainerCentreZonePct(o = {}) {
  const { numTables = 1, hasBoard = false, seatCount = 6, isMobile = false, geometry = null } = o;
  const c = trainerCentreLayout(o);
  if (c) return { x: 50, potY: c.potY, boardY: c.boardY };
  const p = feltPctToZonePct(trainerPotAnchorPoint(numTables, { hasBoard, seatCount, isMobile, potYByCount: o.potYByCount, potYPreflopByCount: o.potYPreflopByCount }), geometry);
  const b = hasBoard ? feltPctToZonePct(trainerBoardAnchorPoint(numTables, { seatCount, isMobile, boardYByCount: o.boardYByCount }), geometry) : null;
  return { x: p.x, potY: p.y, boardY: b ? b.y : null };
}

/* Les mêmes ancres, en % du FEUTRE : c'est le repère dans lequel le rendu peint
   le pot et le board (ils vivent DANS `.felt-oval`). Une seule source, deux
   repères — jamais deux calculs. */
export function trainerCentreAnchorsFelt(o = {}) {
  const c = trainerCentreZonePct(o);
  return {
    pot: zonePctToFeltPct({ x: c.x, y: c.potY }, o.geometry),
    board: c.boardY == null ? null : zonePctToFeltPct({ x: c.x, y: c.boardY }, o.geometry),
  };
}

export function trainerCentralExclusionZone(o = {}) {
  const { numTables = 1, hasBoard = false, ringGeom = null, geometry = null, padPct = 1.5, tight = false } = o;
  const area = areaPx(ringGeom, numTables, geometry);
  const pot = trainerPotSizePx(numTables, { tight });
  const c = trainerCentreZonePct(o);
  let xMin = c.x - pot.w / 2 / area.w * 100;
  let xMax = c.x + pot.w / 2 / area.w * 100;
  let yMin = c.potY - pot.h / 2 / area.h * 100;
  let yMax = c.potY + pot.h / 2 / area.h * 100;
  if (hasBoard && c.boardY != null) {
    const b = trainerBoardSizePx(numTables, { tight, feltH: feltHeightPx(ringGeom, numTables, geometry), corridorPx: trainerCorridorPx(o) });
    xMin = Math.min(xMin, c.x - b.totalW / 2 / area.w * 100);
    xMax = Math.max(xMax, c.x + b.totalW / 2 / area.w * 100);
    yMin = Math.min(yMin, c.boardY - b.cardH / 2 / area.h * 100);
    yMax = Math.max(yMax, c.boardY + b.cardH / 2 / area.h * 100);
  }
  return { xMin: xMin - padPct, xMax: xMax + padPct, yMin: yMin - padPct, yMax: yMax + padPct };
}

export function pointInsideZone(pt, zone) {
  return pt.x >= zone.xMin && pt.x <= zone.xMax && pt.y >= zone.yMin && pt.y <= zone.yMax;
}

/* ── UN MARQUEUR N'EST PAS UN POINT (§1/§2/§26/§27) ────────────────────────
   Le placement testait le CENTRE du marqueur contre la bande centrale. Or un
   badge de mise fait 104 px de large en 1T : son centre peut être hors zone
   pendant que la moitié du badge est posée sur le board ou sur le pot. Mesuré
   sur 16 tirages : 5 mises sur le board, et des tas à 4 px du bloc du pot —
   c'est-à-dire exactement le défaut « les jetons se rapprochent excessivement
   du pot, on ne sait plus qui a misé ».

   On teste donc la BOÎTE. C'est la même zone interdite, lue avec la taille
   réelle de l'objet qu'on y pose. */
export function boxOverlapsZone(pt, halfPct, zone) {
  return pt.x + halfPct.w >= zone.xMin && pt.x - halfPct.w <= zone.xMax
      && pt.y + halfPct.h >= zone.yMin && pt.y - halfPct.h <= zone.yMax;
}

/* ── DEUX REPÈRES, ET C'ÉTAIT LE PIÈGE ────────────────────────────────────
   La table du Trainer superpose deux systèmes de coordonnées en pourcentages,
   et rien ne le disait :
     • le POT et le BOARD sont rendus DANS `.felt-oval` → % du FEUTRE ;
     • les SIÈGES, les MISES, les BLINDES et le bouton D sont rendus dans
       `.training-table-zone`, hors du feutre (sinon `overflow:hidden` rognerait
       les avatars posés sur le rail) → % de la ZONE.
   Confondre les deux décale tout d'un demi-jeu de marges. Mesuré en 2T : le
   board déclaré à y=56 est peint à y=53.45 de la zone, et sa demi-largeur passe
   de 27.6 % (feutre) à 23.6 % (zone). C'est ce décalage qui faisait basculer des
   sièges de flanc dans la poche latérale alors que leur axe était dégagé
   (mesuré : jusqu'à 50° d'écart en 2T, et un tas du BTN plus proche de la SB).
   Tout ce module raisonne donc en % de la ZONE, et convertit à l'entrée. */
export function feltPctToZonePct(pt, geometry) {
  const g = geometry || {};
  const w = 100 - (g.left || 0) - (g.right || 0);
  const h = 100 - (g.top || 0) - (g.bottom || 0);
  return { x: (g.left || 0) + pt.x * w / 100, y: (g.top || 0) + pt.y * h / 100 };
}

/* ── BUDGETS DE PLACEMENT ──────────────────────────────────────────────────
   `MARKER_TRAVEL` : où se pose le marqueur sur le segment siège→pot, en
   fraction. 0 = sur le joueur, 1 = dans le pot. Un tiers rend le tas trop
   collé au bloc de siège en mosaïque ; au-delà de la moitié il se lit comme
   déjà collecté. Le bouton D, lui, APPARTIENT au joueur (§29) : il reste tout
   près de lui, sur son propre anneau, et ne peut donc jamais se confondre avec
   son tas.

   `*_CLEAR_PX` : demi-encombrements réels, en px, mesurés en 1T (bloc de siège
   ~150 × 170, badge de mise ~104 × 44, tas de blinde ~61 × 64, bouton D 22).
   Ils sont ramenés à la taille réelle des objets du mode par
   `trainerMarkerClearance` — sans quoi, sur un feutre 4T, un budget calé en 1T
   dépasse le demi-axe et tout retombe sur le plancher (défaut connu). */
export const MARKER_TRAVEL = { BET: 0.42, BLIND: 0.42, DEALER: 0.20 };
export const MARKER_POT_CLEAR_PX = { BET: 54, BLIND: 48, DEALER: 40 };
/* Demi-encombrement du MARQUEUR lui-même (badge de mise borné à 104 px en 1T,
   96 px en compact ; tas de blinde ; bouton D). Sert à savoir de combien il faut
   dégager le bloc du joueur et la bande centrale. */
/* Largeur du feutre déduite de la zone mesurée et des marges du mode — pendant
   horizontal de `feltHeightPx`. */
export function feltWidthPxOf(area, geometry, numTables = 1) {
  const g = geometry || trainerTableGeometry(numTables);
  const w = area && area.w > 0 ? area.w : 0;
  return w > 0 ? w * (100 - (g.left || 0) - (g.right || 0)) / 100 : 0;
}

/* ── PLAFOND DE LARGEUR DU BADGE DE MISE (§23/§36) ─────────────────────────
   Une fraction de la table, bornée haut par la valeur nominale du mode (rien ne
   grossit quand la fenêtre grandit) et bas par la lisibilité du montant. */
export const BET_BADGE_FELT_RATIO = 0.17;
export const BET_BADGE_MIN_W = 70;
export const BET_BADGE_NOMINAL_W = { 1: 104, 2: 96, 3: 96, 4: 96 };
export function betBadgeMaxWidthPx(numTables = 1, feltW = 0) {
  const nominal = BET_BADGE_NOMINAL_W[numTables] ?? 96;
  if (!(feltW > 0)) return nominal;
  return +Math.max(BET_BADGE_MIN_W, Math.min(nominal, feltW * BET_BADGE_FELT_RATIO)).toFixed(1);
}

export const MARKER_HALF_PX = {
  BET: { w: 52, h: 22 },
  BLIND: { w: 31, h: 24 },
  DEALER: { w: 11, h: 11 },
};
/* ── LA BORNE QUI COMPTE : L'ATTRIBUTION (§43) ─────────────────────────────
   Un tas doit rester PLUS PRÈS de son joueur que de n'importe quel autre, avec
   de la marge. C'est la seule propriété dont dépend « qui a misé », et c'est
   exactement celle que l'ancien placement perdait (mesuré en 1T : tas de la SB à
   0.87 fois la distance du BTN, donc plus près du BTN que de la SB).

   Borner la poche par une fraction de l'écart au voisin ne suffit pas : cet
   écart se mesure de siège à siège, alors que le tas, lui, part vers le CENTRE —
   il se rapproche du voisin bien plus vite que la fraction ne le laisse croire
   (mesuré : une poche à 0.50 de l'écart rendait encore un ratio de 0.75). On
   borne donc la poche par le critère lui-même.

   Conséquence assumée en 1T : les cartes du Hero sont énormes (95×130 par carte,
   soit 99 px de demi-bloc, quand la poche autorisée en fait ~105) — son tas
   mord donc le bord de sa propre main. C'est le bon arbitrage : chevaucher SES
   cartes se lit sans ambiguïté, être attribué au voisin non. */
export const MARKER_MIN_ATTRIBUTION = 1.3;
export const MARKER_MAX_POCKET_RATIO = 0.50;

function nearestNeighbourDistancePx(seats, pos, area) {
  const me = seats[pos];
  if (!me) return Infinity;
  let best = Infinity;
  for (const [p, s] of Object.entries(seats)) {
    if (p === pos || !s) continue;
    const d = Math.hypot((s.x - me.x) * area.w / 100, (s.y - me.y) * area.h / 100);
    if (d < best) best = d;
  }
  return best;
}

/* Côté de la poche : à l'opposé du voisin le plus proche EN ANGLE, pour ne pas
   empiéter sur son couloir. */
function pocketSide(seats, pos, dir, area) {
  const me = seats[pos];
  const perp = { x: -dir.y, y: dir.x };
  let sum = 0;
  for (const [p, s] of Object.entries(seats)) {
    if (p === pos || !s) continue;
    const vx = (s.x - me.x) * area.w / 100, vy = (s.y - me.y) * area.h / 100;
    const d = Math.hypot(vx, vy) || 1;
    // Un voisin proche pèse plus qu'un voisin lointain.
    sum += (vx * perp.x + vy * perp.y) / (d * d);
  }
  return sum > 0 ? -1 : 1;
}

const clampPct = (v, min = 3, max = 97) => Math.max(min, Math.min(max, v));

/**
 * Point d'un marqueur de siège, en % du conteneur.
 *
 * @param seats        { POS: {x,y} } en % du conteneur
 * @param pos          siège propriétaire
 * @param markerType   "BET" | "BLIND" | "DEALER"
 * @param ringGeom     { areaW, areaH, scale } mesurés — sinon repli nominal
 * @returns { x, y, mode, deviationDeg, travel }  (`mode` : "axial" | "recule" | "poche")
 */
export function trainerMarkerPoint({
  seats, pos, markerType = "BET", numTables = 1, hasBoard = false, ringGeom = null,
  geometry = null, isMobile = false, tight = false, seatCount: seatCountArg = null,
  heroPos = null, sideBiasPx = 0, avoid = null, avatarPx = 0, avatarHeroPx = 0,
  potYByCount = null, potYPreflopByCount = null, boardYByCount = null,
} = {}) {
  const seat = seats && seats[pos];
  if (!seat) return null;
  const seatCount = seatCountArg || Object.keys(seats).length || 6;
  const area = areaPx(ringGeom, numTables, geometry);
  const centreOpts = { seats, heroPos, numTables, hasBoard, ringGeom, geometry, isMobile, tight, seatCount, avatarPx, avatarHeroPx, potYByCount, potYPreflopByCount, boardYByCount };
  const centre = trainerCentreZonePct(centreOpts);
  const potPt = { x: centre.x, y: centre.potY };

  const sx = seat.x * area.w / 100, sy = seat.y * area.h / 100;
  const tx = potPt.x * area.w / 100, ty = potPt.y * area.h / 100;
  const D = Math.hypot(tx - sx, ty - sy);
  if (!(D > 0)) return { x: seat.x, y: seat.y, mode: "axial", deviationDeg: 0, travel: 0 };
  const dir = { x: (tx - sx) / D, y: (ty - sy) / D };
  const perp = { x: -dir.y, y: dir.x };

  const k = trainerMarkerClearance(numTables, markerType);
  const half = MARKER_HALF_PX[markerType] || MARKER_HALF_PX.BET;
  /* ── LE BADGE DE MISE SUIT LA TABLE, LUI AUSSI (§23/§36) ─────────────────
     Sa largeur maximale était un nombre de pixels (104 en 1T). Sur un feutre de
     710 px c'est 15 % de la table ; sur un feutre de 483 c'est 21 %, et le
     couloir libre de chaque côté du board n'en fait plus que 126. La recherche
     ne trouvait alors AUCUN point axial dégagé et basculait en poche latérale :
     mesuré, 13 mises sur 16 au-delà de 35° d'écart, alors que le placement
     lui-même était juste. Ce n'est pas le placement qu'il fallait corriger,
     c'est l'objet qu'on place.
     Le plafond reste la valeur nominale — sur grand écran rien ne change — et
     le plancher garantit qu'un montant reste lisible (§36). */
  const betMaxW = betBadgeMaxWidthPx(numTables, feltWidthPxOf(area, geometry, numTables));
  const halfW = (markerType === "BET" ? betMaxW / 2 : half.w) * k;
  const halfH = half.h * k;
  /* ── ZONE DE SÉCURITÉ DU JOUEUR (§17) ──
     Le bloc d'un siège n'est pas un disque : il est LARGE (deux cartes côte à
     côte) et surtout PROFOND du côté du pot (les cartes sont peintes entre
     l'avatar et le centre). En 1T le Hero, seul à avoir ses cartes ouvertes au
     grand format, occupe 99 px de demi-largeur et 177 px de profondeur — pour
     une distance au pot de 159 px. Aucun point de l'axe ne peut donc dégager son
     bloc : c'est ce qui posait le bouton D SUR sa main (vu à l'image). Le bloc
     entre donc dans la recherche au même titre que le board. */
  const estHero = heroPos != null && pos === heroPos;
  const block = trainerSeatBlockPx(numTables, { hero: estHero, opts: { tight }, avatarPx: estHero ? (avatarHeroPx || avatarPx) : avatarPx });
  const needAlong = block.towardPot + halfH + 6;      // dégager le bloc EN PROFONDEUR
  const needSide = block.halfW + halfW + 6;           // …ou le contourner PAR LE CÔTÉ

  /* Demi-encombrement du marqueur, en % du conteneur : c'est dans ce repère
     que vit la zone interdite. */
  const halfPct = { w: halfW * 100 / area.w, h: halfH * 100 / area.h };

  const lMax = Math.max(12, D - (MARKER_POT_CLEAR_PX[markerType] || 46) * k);
  const lWish = Math.min(lMax, Math.max(12, (MARKER_TRAVEL[markerType] || 0.42) * D));

  const zone = trainerCentralExclusionZone(centreOpts);
  const toPct = (x, y) => ({ x: clampPct(x * 100 / area.w), y: clampPct(y * 100 / area.h) });
  const side = pocketSide(seats, pos, dir, area);
  // Attribution d'un candidat : sa distance à SON siège contre sa distance au
  // siège étranger le plus proche.
  const attribution = (l, off) => {
    const px = sx + dir.x * l + perp.x * off * side, py = sy + dir.y * l + perp.y * off * side;
    const dOwn = Math.hypot(px - sx, py - sy) || 1;
    let dOther = Infinity;
    for (const [p, s] of Object.entries(seats)) {
      if (p === pos || !s) continue;
      const d = Math.hypot(px - s.x * area.w / 100, py - s.y * area.h / 100);
      if (d < dOther) dOther = d;
    }
    return dOther / dOwn;
  };
  const maxOff = MARKER_MAX_POCKET_RATIO * nearestNeighbourDistancePx(seats, pos, area);

  /* Deux obstacles, deux façons d'en sortir : ALLER PLUS LOIN sur l'axe (le bloc
     du joueur est derrière) ou S'ÉCARTER (le board est devant). On balaie donc
     le plan (l, écart) et on garde le point le PLUS AXIAL — l'écart est un coût,
     jamais un but. */
  const ok = (l, off) => {
    if (off < needSide && l < needAlong) return false;              // dans son propre bloc
    if (l > lMax) return false;                                     // sur le pot
    if (attribution(l, off) < MARKER_MIN_ATTRIBUTION) return false; // chez le voisin (§43)
    const px = sx + dir.x * l + perp.x * off * side, py = sy + dir.y * l + perp.y * off * side;
    // Objets à ne pas recouvrir qui ne sont ni le board, ni le pot, ni un siège :
    // en pratique le tas de mise, dont le bouton D doit rester distinct (§29).
    if (avoid) for (const a of avoid) {
      if (!a) continue;
      if (Math.hypot(px - a.x * area.w / 100, py - a.y * area.h / 100) < (a.minPx || 0)) return false;
    }
    /* La BOÎTE du marqueur, pas son centre : un badge de 104 px de large peut
       avoir son centre hors zone et la moitié de son corps sur le board. */
    return !boxOverlapsZone(toPct(px, py), halfPct, zone);
  };
  const emit = (l, off, mode) => {
    const p = toPct(sx + dir.x * l + perp.x * off * side, sy + dir.y * l + perp.y * off * side);
    return { ...p, mode, deviationDeg: +(Math.atan2(off, Math.max(1, l)) * 180 / Math.PI).toFixed(1), travel: +(l / D).toFixed(3) };
  };

  // 1) strictement sur l'axe — d'abord la position idéale, puis en s'éloignant du
  //    joueur (le bloc), puis en s'en rapprochant (le board).
  const step = Math.max(3, D * 0.04);
  const bias = Math.min(sideBiasPx, maxOff);
  for (let l = lWish; l <= lMax + 1e-6; l += step) if (ok(l, bias)) return emit(l, bias, l <= lWish + 1e-6 ? "axial" : "avance");
  for (let l = lWish - step; l >= needAlong; l -= step) if (ok(l, bias)) return emit(l, bias, "recule");

  // 2) l'axe est bouché de bout en bout (Hero et siège haut-centre : le board
  //    barre la route, leurs propres cartes aussi) → POCHE LATÉRALE, du strict
  //    minimum, bornée par l'écart au voisin.
  /* ── LA POCHE COMMENCE PETITE, PAS À SA VALEUR MAXIMALE ──────────────────
     Elle démarrait à `needSide` — l'écart qu'il faut pour CONTOURNER le bloc du
     joueur. Or ce besoin ne s'applique qu'aux points proches du joueur (c'est
     la première ligne de `ok`) : passé `needAlong`, un écart de quelques pixels
     suffit à dégager la bande centrale. En partant de needSide on sautait
     directement à ~43 px de côté sur un feutre de 261 px de haut, là où 8
     auraient suffi. Mesuré en 3T sur un siège de flanc : 41.7° d'écart pour un
     placement qui en admettait 17.
     On balaie donc du plus petit écart au plus grand, et on s'arrête au premier
     qui passe : l'écart reste un coût, jamais un but. */
  const pasOff = Math.max(4, maxOff * 0.08);
  for (let off = Math.max(pasOff, bias); off <= maxOff + 1e-6; off += pasOff) {
    for (let l = lWish; l >= 12; l -= step) if (ok(l, off)) return emit(l, off, "poche");
    for (let l = lWish + step; l <= lMax + 1e-6; l += step) if (ok(l, off)) return emit(l, off, "poche");
  }
  /* 3) Rien ne dégage à la fois le bloc du joueur et la bande centrale (cas du
        Hero en 1T : ses cartes ouvertes sont plus larges que la poche que
        l'attribution autorise). On garde alors ce qui EST négociable — le
        chevauchement de ses propres cartes — et on préserve ce qui ne l'est pas :
        l'attribution.

        ── CE REPLI IGNORAIT LA BANDE CENTRALE, ET ÇA SE VOYAIT ──────────────
        Il ne regardait que l'attribution : quand la recherche échouait, le tas
        pouvait donc atterrir en plein sur le board. Mesuré, 4 mises sur 16 y
        étaient posées — et toutes venaient d'ici, pas des étapes 1 et 2 qui,
        elles, testent la zone.
        Un repli n'a pas le droit d'être aveugle : il choisit toujours un point,
        mais parmi ceux qui restent attribuables il prend celui qui MORD LE
        MOINS sur le centre. On ne garantit plus zéro recouvrement — la place
        n'existe pas — on garantit le moins mauvais, et c'est vérifiable. */
  const l3 = Math.min(lWish, lMax);
  const morsure = (l, off) => {
    const px = sx + dir.x * l + perp.x * off * side, py = sy + dir.y * l + perp.y * off * side;
    const p = toPct(px, py);
    const w = Math.min(p.x + halfPct.w, zone.xMax) - Math.max(p.x - halfPct.w, zone.xMin);
    const h = Math.min(p.y + halfPct.h, zone.yMax) - Math.max(p.y - halfPct.h, zone.yMin);
    return w > 0 && h > 0 ? w * h : 0;
  };
  let best = 0, pire = Infinity;
  for (let off = 0; off <= maxOff; off += Math.max(2, maxOff * 0.05)) {
    if (attribution(l3, off) < MARKER_MIN_ATTRIBUTION) break;
    const m = morsure(l3, off);
    if (m < pire) { pire = m; best = off; }
    if (m === 0) break;                 // rien de mieux à espérer
  }
  /* Si même l'axe pur (off = 0) n'est pas attribuable, c'est que la profondeur
     souhaitée emmène le tas trop loin du joueur : on le RAPPROCHE de lui jusqu'à
     ce qu'il redevienne le sien. Mieux vaut un tas collé à son joueur qu'un tas
     qu'on ne sait pas à qui attribuer (§43). */
  let l4 = l3;
  while (l4 > 14 && attribution(l4, best) < MARKER_MIN_ATTRIBUTION) l4 -= Math.max(3, l3 * 0.06);
  return emit(Math.max(14, l4), best, "contraint");
}

/* ── BOUTON DEALER (§29) ───────────────────────────────────────────────────
   Anchor PROPRE, distincte de celle des mises, mais sur le MÊME axe : le bouton
   se pose à 20 % du segment siège→pot, la mise à 42 %. Ils ne peuvent donc plus
   se disputer le même dégagement — c'était le dernier conflit du modèle
   précédent, où les deux vivaient sur le même anneau et où seul un large
   décalage ANGULAIRE les séparait.

   Ce décalage angulaire est justement ce qu'il faut abandonner. Une rotation
   autour du pot déplace le bouton d'un ARC, dont la longueur croît avec le rayon
   du siège : mesuré en 4T, le bouton finissait à 49 px de son BTN pour 47 px de
   la SB, sur des sièges espacés de 89 px — impossible de dire à qui il
   appartenait. On garde donc l'axe et on ne s'écarte que d'un DÉCALAGE LATÉRAL
   EN PIXELS, du même ordre que la moitié du badge de mise : assez pour ne jamais
   passer dessous, trop peu pour partir chez le voisin. */
const DEALER_SIDE_PX = 30;
export function trainerDealerPoint({
  seats, pos, numTables = 1, hasBoard = false, ringGeom = null, geometry = null,
  isMobile = false, tight = false, heroPos = null, avatarPx = 0, avatarHeroPx = 0,
  potYByCount = null, potYPreflopByCount = null, boardYByCount = null,
} = {}) {
  const seat = seats && seats[pos];
  if (!seat) return null;
  const seatCount = Object.keys(seats).length || 6;
  const area = areaPx(ringGeom, numTables, geometry);
  const common = { seats, pos, numTables, hasBoard, seatCount, ringGeom, geometry, isMobile, tight, heroPos, avatarPx, avatarHeroPx, potYByCount, potYPreflopByCount, boardYByCount };
  // Le tas de mise de ce même joueur : le bouton doit s'en écarter, sans quoi
  // les deux marqueurs du BTN se recouvrent (défaut historique, 22×22 px).
  const bet = trainerMarkerPoint({ ...common, markerType: "BET" });
  /* `trainerDealerAngleOffset` n'exprime plus un angle mais l'INTENSITÉ d'un
     décalage LATÉRAL, relative à sa valeur nominale. Il passe par la recherche
     validée : appliqué après coup, il repoussait le bouton dans le board (siège
     haut-centre en 1T) ou sur le tas (2T, 3.9 px d'écart mesurés). */
  const k = trainerMarkerClearance(numTables, "DEALER");
  const sideBiasPx = DEALER_SIDE_PX * (trainerDealerAngleOffset(numTables) / 0.20) * k;
  return trainerMarkerPoint({
    ...common, markerType: "DEALER", sideBiasPx,
    avoid: bet ? [{ x: bet.x, y: bet.y, minPx: 26 * k }] : null,
  });
}

/* ═══════════════════════════════════════════════════════════════
   §13 — ÉCHELLE DE PROFONDEUR DE LA TABLE

   Une seule source pour l'ordre d'empilement, lue par le CSS (via les
   variables `--pf-z-*` posées sur `:root`) ET par les styles en ligne du
   Trainer. Le rôle de cette échelle n'est pas de renuméroter l'existant :
   ce sont les valeurs RÉELLEMENT mesurées au rendu. Elle sert à ce que
   personne n'ait plus à deviner « au-dessus de quoi » poser une couche —
   et à ce qu'un correctif local du genre `z-index: 9999` ne soit plus la
   seule façon de s'en sortir. Un `9999` posé ici gagnerait contre les
   info-bulles ET les modales, et créerait le conflit suivant.

   Ordre, du fond vers la surface :
     feutre → board → pot → mise → siège → bouton dealer → survol → modale

   Le bouton dealer passe DEVANT la mise : les deux vivent sur le même
   segment siège→pot (cf. MARKER_TRAVEL) et, quand la place manque, c'est
   le bouton qui doit rester lisible — il désigne une position, la mise se
   relit dans le pot.

   `test-trainer-table-geometry.mjs` vérifie que le CSS déclare exactement
   ces valeurs : sans ce test, JS et CSS dériveraient en silence.
═══════════════════════════════════════════════════════════════ */
export const TABLE_Z = {
  felt: 0,        // feutre + anneau doré : le fond
  board: 6,       // cartes communes
  pot: 7,         // lecture du pot, juste au-dessus du board
  bet: 18,        // tas de jetons d'un siège (.pf-seat-action-zone)
  seat: 20,       // grappe de siège (cartes ▸ avatar ▸ plaque)
  dealer: 25,     // bouton D — devant la mise, cf. ci-dessus
  hover: 200,     // info-bulle de survol (profil vilain…)
  modal: 2500,    // plein écran : ranges, solution
};

/* Bloc CSS à injecter sur `:root`. Écrit ici pour que la valeur ne soit
   jamais recopiée à la main dans la feuille de style. */
export function tableZCssVars() {
  return Object.entries(TABLE_Z).map(([k, v]) => `--pf-z-${k}:${v};`).join("");
}
