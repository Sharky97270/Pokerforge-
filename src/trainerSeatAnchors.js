/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — ZONES D'UN SIÈGE DU TRAINER (§3 / §4 / §5 / §6 / §17).

   Ce module répond à une question que `trainerTableGeometry` ne traite pas :
   une fois qu'on sait OÙ est assis un joueur, comment sont disposés autour de
   lui son avatar, ses cartes, sa plaque et son badge d'état ?

   ── CE QU'IL REMPLACE, ET CE QUI CLOCHAIT ─────────────────────────────────
   La disposition était décidée par un SEUIL VERTICAL, écrit deux fois dans le
   rendu :

       className={coord.y<=40 ? "pf-seat-inverted" : ""}
       transform = y<=24 ? "translate(-50%,-40%)"
                 : y>=68 ? "translate(-50%,-49%)"
                 :         "translate(-50%,-50%)"

   Deux conséquences, toutes deux mesurées au navigateur (1T, 6-max, 1366×768,
   n=8) :

   1. LES CARTES NE POINTENT PAS VERS LE CENTRE. Le seuil ne connaît que « en
      haut » et « en bas ». Un joueur de FLANC — UTG à x=9, BTN à x=91 — reçoit
      donc ses cartes AU-DESSUS de sa tête alors que le centre est à son côté.
      Écart angulaire mesuré entre l'axe siège→pot et l'axe avatar→cartes :
      moyenne 29.6°, maximum 81.8° ; 6 relevés sur 16 au-delà de 35°. Le pire
      cas est exactement celui signalé dans la mission : les cartes du BB
      empilées sous son avatar, sans rapport avec la table.

   2. L'AVATAR N'EST PAS SUR L'ANNEAU. Le point de l'anneau positionne le BLOC
      (cartes + avatar + plaque), pas l'avatar ; le `translate(…,-40%)` est une
      correction à la main qui ne peut pas suivre un bloc dont le contenu
      change (cartes ouvertes ou non, plaque sur une ou deux lignes, badge
      Fold). Rayon normalisé du centre d'avatar sur l'ellipse du feutre —
      ρ = 1 signifiant « posé sur l'anneau doré » :

          moyenne 0.88, minimum 0.64
          CO 0.68   BTN 0.69   BB 0.71   ← un tiers du rayon À L'INTÉRIEUR

      C'est la mesure du défaut « SB et BB trop centrés » : ces joueurs ne sont
      pas assis au bord de la table, ils sont assis dans le tapis.

   ── LE MODÈLE ─────────────────────────────────────────────────────────────
   Une seule grandeur commande tout : la direction du siège vers le centre,
   calculée EN PIXELS (un vecteur unitaire en pourcentages d'un conteneur non
   carré pointe ailleurs qu'à l'écran — c'est le piège déjà documenté dans
   `trainerTableGeometry`).

       d = normalize(centre − siège)          en px
       axe = la composante dominante de d     → "up" | "down" | "left" | "right"

   `axe` nomme le côté INTÉRIEUR du siège. Tout en découle :

       cartes  → du côté `axe`            (entre le joueur et le board)
       plaque  → à l'opposé de `axe`      (vers l'extérieur de la table)
       statut  → au-delà de la plaque     (§19 : jamais sur l'anneau, jamais
                                           sur les cartes)

   L'ordre du §17, de l'extérieur vers l'intérieur, est donc obtenu par
   construction et non par réglage :

       STATUT · PLAQUE · AVATAR · CARTES · (mise) · CENTRE

   ── POURQUOI QUATRE AXES ET PAS UN ANGLE CONTINU ──────────────────────────
   Une rotation continue de la grappe serait plus « juste » géométriquement et
   franchement pire à l'usage : un nom de joueur incliné de 37° ne se lit plus,
   et deux cartes tournées ne se superposent plus proprement. Les clients de
   poker professionnels quantifient tous cette direction. On garde donc quatre
   axes — mais le choix de l'axe, lui, est CALCULÉ, jamais saisi.

   ── SEUIL D'ARBITRAGE ─────────────────────────────────────────────────────
   Un siège en diagonale (haut-gauche) a deux composantes du même ordre. On
   privilégie l'axe VERTICAL en cas d'égalité approchée (`DIAGONAL_BIAS`) :
   une table de poker est plus large que haute (ratio 1.70), donc la place
   libre entre un siège et le board est plus généreuse verticalement, et une
   grappe empilée est plus compacte en largeur qu'en hauteur.

   Module PUR : il ne connaît ni React, ni le DOM, ni le poker. Testé par
   `test-trainer-seat-anchors.mjs`.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Un siège dont la direction vers le centre est presque diagonale doit
   trancher. Au-delà de ce rapport |dx|/|dy|, on considère l'axe horizontal
   comme réellement dominant. 1.0 rendrait l'axe instable pour les sièges de
   coin (un pixel de plus bascule la grappe) ; 1.25 laisse une bande morte. */
export const DIAGONAL_BIAS = 1.25;

export const SEAT_AXES = ["up", "down", "left", "right"];

/* Sens de lecture d'une grappe en colonne/rangée pour que les CARTES tombent
   du côté `axe`, l'ordre du DOM restant « cartes ▸ avatar ▸ plaque ». */
const FLEX_BY_AXIS = {
  up: "column",            // le centre est au-dessus → cartes au-dessus
  down: "column-reverse",  // le centre est en dessous → cartes en dessous
  left: "row",             // le centre est à gauche → cartes à gauche
  right: "row-reverse",    // le centre est à droite → cartes à droite
};

/* Vecteur unitaire siège → centre, EN PIXELS.
   @param seat   {x,y} en % du conteneur
   @param centre {x,y} en % du conteneur
   @param area   {w,h} du conteneur en px */
export function seatDirection(seat, centre, area) {
  const w = area && area.w > 0 ? area.w : 800;
  const h = area && area.h > 0 ? area.h : 470;
  const dx = (centre.x - seat.x) * w / 100;
  const dy = (centre.y - seat.y) * h / 100;
  const L = Math.hypot(dx, dy);
  if (!(L > 0)) return { x: 0, y: 1, lengthPx: 0 };
  return { x: dx / L, y: dy / L, lengthPx: +L.toFixed(2) };
}

/**
 * Axe intérieur d'un siège : de quel côté se trouve le centre de la table.
 * C'est LA décision dont dépendent cartes, plaque et badge d'état.
 */
export function seatAxis(seat, centre, area) {
  const d = seatDirection(seat, centre, area);
  if (!(d.lengthPx > 0)) return "up";
  const horizontal = Math.abs(d.x) > Math.abs(d.y) * DIAGONAL_BIAS;
  if (horizontal) return d.x > 0 ? "right" : "left";
  return d.y > 0 ? "down" : "up";
}

/** Sens du flex de la grappe, pour l'axe donné. */
export function seatFlexDirection(axis) {
  return FLEX_BY_AXIS[axis] || FLEX_BY_AXIS.up;
}

/* Boîte qu'occuperait la zone des cartes si on retenait `axis`, en % du
   conteneur. Une paire de cartes est LARGE et PEU PROFONDE : posée à la
   verticale elle avance de sa hauteur, posée à l'horizontale elle avance de sa
   LARGEUR — deux fois plus. C'est toute la différence entre les deux
   candidats, et c'est elle qui décide. */
function inwardBox({ seat, axis, area, cardsPx, avatarPx, gapPx }) {
  const w = area && area.w > 0 ? area.w : 800;
  const h = area && area.h > 0 ? area.h : 470;
  const r = avatarPx / 2;
  const vertical = axis === "up" || axis === "down";
  const avance = r + gapPx + (vertical ? cardsPx.h : cardsPx.w) / 2;
  const demiW = (vertical ? cardsPx.w : cardsPx.h) / 2;
  const demiH = (vertical ? cardsPx.h : cardsPx.w) / 2;
  const cx = seat.x + (axis === "left" ? -avance * 100 / w : axis === "right" ? avance * 100 / w : 0);
  const cy = seat.y + (axis === "up" ? -avance * 100 / h : axis === "down" ? avance * 100 / h : 0);
  return {
    xMin: cx - demiW * 100 / w, xMax: cx + demiW * 100 / w,
    yMin: cy - demiH * 100 / h, yMax: cy + demiH * 100 / h,
  };
}

const aire = (a, b) => {
  const w = Math.min(a.xMax, b.xMax) - Math.max(a.xMin, b.xMin);
  const h = Math.min(a.yMax, b.yMax) - Math.max(a.yMin, b.yMin);
  return w > 0 && h > 0 ? w * h : 0;
};

/**
 * ── L'AXE TIENT COMPTE DE LA PLACE DISPONIBLE (§26) ────────────────────────
 *
 * `seatAxis` seul rend la direction du centre, et c'est la bonne réponse en
 * géométrie pure. Elle ne suffit pas : le centre d'une table de poker est
 * occupé par une BANDE HORIZONTALE — cinq cartes de board, larges de la moitié
 * du feutre. Un siège de flanc qui pousse ses cartes vers le centre les envoie
 * donc droit dedans. Mesuré après le passage au radial : cartes ↔ board,
 * 2578 px² pour un siège de flanc, contre 469 quand elles étaient au-dessus de
 * lui — la radialité gagnée coûtait un recouvrement quatre fois pire.
 *
 * On ne renonce pas au radial pour autant : on choisit, entre l'axe DOMINANT
 * et son SECONDAIRE (l'autre composante de la même direction), celui dont la
 * zone de cartes empiète le moins sur la bande centrale. Les deux candidats
 * pointent vers le centre ; c'est l'encombrement qui départage, pas une règle
 * de siège. À égalité, le dominant l'emporte — la géométrie garde le dernier
 * mot quand rien ne s'y oppose.
 */
export function seatAxisClear({ seat, centre, area, forbidden = null, cardsPx = null, avatarPx = 40, gapPx = 4 } = {}) {
  const dominant = seatAxis(seat, centre, area);
  if (!forbidden || !cardsPx || !(cardsPx.w > 0) || !(cardsPx.h > 0)) return dominant;
  const d = seatDirection(seat, centre, area);
  const vertical = dominant === "up" || dominant === "down";
  /* Le secondaire est l'autre composante de la MÊME direction : il pointe donc
     lui aussi vers le centre. Un siège pile sur un axe n'en a pas. */
  const secondaire = vertical
    ? (Math.abs(d.x) < 1e-6 ? null : (d.x > 0 ? "right" : "left"))
    : (Math.abs(d.y) < 1e-6 ? null : (d.y > 0 ? "down" : "up"));
  if (!secondaire) return dominant;
  const opts = { seat, area, cardsPx, avatarPx, gapPx };
  const boxD = inwardBox({ ...opts, axis: dominant });
  const chevD = aire(boxD, forbidden);
  const chevS = aire(inwardBox({ ...opts, axis: secondaire }), forbidden);
  /* ── ON NE QUITTE L'AXE RADIAL QU'EN DERNIER RECOURS ──────────────────────
     Premier essai : « le moindre chevauchement gagne ». Mesuré, c'était pire
     que le mal — l'écart angulaire des cartes remontait de 6.1° à 36.5° de
     moyenne (SB à 82°), et deux sièges voisins basculés sur le même axe se
     retrouvaient cartes contre cartes (2 recouvrements « cartes ↔ cartes » là
     où il n'y en avait aucun). Effleurer le bord du board coûte moins cher que
     perdre la ligne joueur → cartes → centre, qui est TOUT ce que la mission
     demande de rendre lisible.
     On ne bascule donc que si l'axe radial pose les cartes MAJORITAIREMENT sur
     la bande centrale, et seulement si le secondaire fait nettement mieux. */
  const aireBox = Math.max(1e-6, (boxD.xMax - boxD.xMin) * (boxD.yMax - boxD.yMin));
  if (chevD < aireBox * 0.5) return dominant;
  return chevS < chevD * 0.5 ? secondaire : dominant;
}

/** Axe opposé — le côté EXTÉRIEUR, où vivent plaque et badge d'état (§19). */
export function oppositeAxis(axis) {
  return axis === "up" ? "down" : axis === "down" ? "up" : axis === "left" ? "right" : "left";
}

/**
 * Les quatre zones d'un siège, en % du conteneur, mesurées depuis le CENTRE DE
 * L'AVATAR — qui est lui-même le point de l'anneau (§8).
 *
 * Ces points ne servent pas à positionner le DOM (le rendu empile la grappe
 * autour de l'avatar, c'est plus robuste qu'une somme d'offsets) : ils servent
 * à RAISONNER — savoir où sera chaque zone avant de placer un tas de mise, et
 * pouvoir vérifier au navigateur que ce qu'on a placé est bien là.
 *
 * @param block {halfW, towardPot} encombrement du bloc, cf. trainerSeatBlockPx
 */
export function trainerSeatZones({ seat, centre, area, block = null, avatarPx = 40, gapPx = 4 } = {}) {
  if (!seat || !centre) return null;
  const w = area && area.w > 0 ? area.w : 800;
  const h = area && area.h > 0 ? area.h : 470;
  const axis = seatAxis(seat, centre, area);
  const d = seatDirection(seat, centre, area);
  const r = avatarPx / 2;
  const b = block || { halfW: r * 1.15, towardPot: r + gapPx + 33 };
  /* Un décalage EN PIXELS le long de l'axe, rendu en % du conteneur. On ne
     projette pas sur `d` : l'axe est quantifié, donc le décalage suit l'axe
     retenu, pas la diagonale exacte — sinon la grappe et les zones décriraient
     deux géométries différentes. */
  const along = (px, sens) => {
    const u = axis === "up" ? { x: 0, y: -1 } : axis === "down" ? { x: 0, y: 1 }
            : axis === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
    return { x: +(seat.x + u.x * px * sens * 100 / w).toFixed(2), y: +(seat.y + u.y * px * sens * 100 / h).toFixed(2) };
  };
  /* Profondeur des cartes : demi-avatar + écart + demi-carte. `towardPot`
     mesure jusqu'au BORD du bloc, la zone veut son CENTRE. */
  const profondeurCartes = (r + gapPx + (b.towardPot - r - gapPx) / 2) || r + gapPx;
  return {
    axe: axis,
    direction: { x: +d.x.toFixed(4), y: +d.y.toFixed(4) },
    flexDirection: seatFlexDirection(axis),
    avatarAnchor: { x: seat.x, y: seat.y },
    cardsAnchor: along(profondeurCartes, +1),
    labelAnchor: along(r + gapPx + 10, -1),
    statusAnchor: along(r + gapPx + 28, -1),
  };
}

/**
 * Toutes les zones d'une table, en une passe.
 * @param seats  { POS: {x,y} } en % du conteneur
 */
export function trainerAllSeatZones({ seats, centre, area, blockOf = null, avatarOf = null, gapPx = 4 } = {}) {
  const out = {};
  for (const [pos, seat] of Object.entries(seats || {})) {
    if (!seat) continue;
    out[pos] = trainerSeatZones({
      seat, centre, area, gapPx,
      block: blockOf ? blockOf(pos) : null,
      avatarPx: avatarOf ? avatarOf(pos) : 40,
    });
  }
  return out;
}
