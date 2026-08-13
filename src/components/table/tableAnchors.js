/* ═══════════════════════════════════════════════════════════════
   PokerForge — SYSTÈME D'ANCRAGE POSITIONNEL DE TABLE.

   Source UNIQUE des points remarquables d'une table (§24) :

       seatAnchor   → où est posé le bloc siège (avatar + plaque + cartes)
       betAnchor    → où sont posés les jetons de mise de ce siège
       dealerAnchor → où est posé le bouton D
       boardBounds / potBounds / seatBounds → zones protégées

   Principe (§3/§6) : la mise d'un joueur est posée sur le vecteur

       centre du siège → centre de la table

   à une distance dérivée de la géométrie réelle (taille du bloc siège,
   taille du badge de mise, rayon du feutre) — jamais d'offset codé en dur
   par position. La table étant ELLIPTIQUE et les coordonnées exprimées en
   POURCENTAGES d'une zone rectangulaire, tout calcul vectoriel est fait en
   PIXELS (via `frame.kx/ky`) puis reconverti : sans cela un « même » push de
   10 % ne représente pas la même distance à l'horizontale et à la verticale,
   et les sièges des flancs reçoivent une mise deux fois plus lointaine que
   ceux du haut.

   Quand le point théorique tombe dans une zone protégée (cartes du joueur
   lui-même, board, pot, siège voisin, autre mise, bouton dealer), il est
   décalé TANGENTIELLEMENT — c.-à-d. en tournant autour du centre de la
   table, à distance du centre constante (§10). Le décalage tangentiel garde
   la mise sur son propre « rayon » visuel : elle ne part jamais vers un
   autre joueur. Un terme de coût explicite (`ownership`) interdit d'ailleurs
   toute solution où un siège VOISIN serait plus proche des jetons que leur
   propriétaire — c'est le critère §27 encodé dans le solveur lui-même.

   Module PUR (aucun React, aucun DOM) → testable.
   Toutes les coordonnées publiques sont en % de la zone de table.
═══════════════════════════════════════════════════════════════ */

export const ANCHOR_DEFAULTS = {
  /* Distance de base de la mise, en fraction de la distance siège→centre. */
  betReach: 0.30,
  /* Bornes en px : sur une table très petite un ratio pur colle les jetons à
     l'avatar ; sur une très grande il les envoie au milieu du feutre. */
  betMinPx: 40,
  betMaxPx: 132,
  /* Part maximale de la distance siège→centre que la mise peut parcourir.
     Au-delà elle quitte « son » joueur pour flotter au centre. */
  betReachMax: 0.46,
  /* Marge de sécurité autour des boîtes lors des tests de collision. */
  padPx: 6,
  /* Balayage tangentiel : pas et amplitude maximale. */
  sweepStepDeg: 2,
  sweepMaxDeg: 76,
  /* Essais radiaux (multiplicateurs de la distance de base), essayés d'abord
     SANS décalage latéral puis combinés au balayage tangentiel. */
  radialTries: [1, 1.18, 1.34, 0.86, 0.68],
  /* Côté préféré du balayage tangentiel (+1 = sens horaire vu de la table). */
  preferSide: 1,
  /* Le point doit rester à ≤ feltFill × rayon du feutre (jetons sur le tapis). */
  feltFill: 0.82,
  /* Marge d'appartenance : le siège propriétaire doit être plus proche des
     jetons que n'importe quel autre siège, d'au moins cette marge (px). */
  ownershipMarginPx: 26,
  /* Part maximale de la distance au VOISIN LE PLUS PROCHE que la mise peut
     parcourir. C'est la garde décisive sur les tables serrées (9 joueurs sur
     un écran court : les sièges ne sont plus qu'à ~75 px) — sans elle, une
     mise poussée « normalement » finit à mi-chemin entre deux joueurs. */
  neighbourReach: 0.44,
  /* Poids des zones dans le coût. Recouvrir SON PROPRE bloc est un défaut de
     lisibilité mineur et réversible ; recouvrir celui du voisin est une erreur
     d'attribution. Quand la place manque vraiment, mieux vaut mordre sur ses
     propres cartes que devenir ambigu (§27 prime sur §10).
     Exception : le bloc de HERO contient ses cartes FACE VISIBLE — les masquer
     coûte presque aussi cher que de gêner un voisin, donc le solveur ira
     chercher un angle bien plus large avant de s'y résoudre. */
  ownSeatWeight: 0.3,
  ownHeroSeatWeight: 0.92,
};

/* ───────────────────────── repère ───────────────────────── */

/**
 * Repère de table : convertit les % en px et porte l'ellipse du feutre.
 * @param width/height  taille MESURÉE de la zone de table, en px
 * @param geometry      insets du feutre ({top,left,right,bottom} en %)
 */
export function makeTableFrame({ width = 0, height = 0, geometry } = {}) {
  const g = geometry || { top: 10, left: 8, right: 8, bottom: 12 };
  const w = width > 0 ? width : 100;
  const h = height > 0 ? height : 100;
  return {
    width: w,
    height: h,
    kx: w / 100,          // px par 1 % horizontal
    ky: h / 100,          // px par 1 % vertical
    cx: (g.left + (100 - g.right)) / 2,
    cy: (g.top + (100 - g.bottom)) / 2,
    rx: (100 - g.left - g.right) / 2,
    ry: (100 - g.top - g.bottom) / 2,
    geometry: g,
  };
}

const toPx = (f, p) => ({ x: p.x * f.kx, y: p.y * f.ky });
const toPct = (f, p) => ({ x: p.x / f.kx, y: p.y / f.ky });
const centerPct = f => ({ x: f.cx, y: f.cy });

/** Distance en PIXELS entre deux points exprimés en %. */
export function distPx(f, a, b) {
  return Math.hypot((a.x - b.x) * f.kx, (a.y - b.y) * f.ky);
}

/** Vecteur unitaire (en px) du siège vers le centre de la table. */
export function seatDirection(seat, frame) {
  const s = toPx(frame, seat);
  const c = toPx(frame, centerPct(frame));
  const dx = c.x - s.x, dy = c.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len, len };
}

/** Point situé à `distancePx` du siège, sur le vecteur siège→centre. */
export function pointAlongSeatVector(seat, frame, distancePx) {
  const d = seatDirection(seat, frame);
  const s = toPx(frame, seat);
  return toPct(frame, { x: s.x + d.x * distancePx, y: s.y + d.y * distancePx });
}

/** Rotation d'un point autour du centre de la table (décalage TANGENTIEL). */
export function rotateAroundCenter(pt, frame, rad) {
  const c = toPx(frame, centerPct(frame));
  const p = toPx(frame, pt);
  const dx = p.x - c.x, dy = p.y - c.y;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return toPct(frame, { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos });
}

/** Ramène un point à l'intérieur de l'ellipse du feutre. */
export function clampInsideFelt(pt, frame, fill = ANCHOR_DEFAULTS.feltFill) {
  const rx = frame.rx * fill, ry = frame.ry * fill;
  const nx = (pt.x - frame.cx) / (rx || 1);
  const ny = (pt.y - frame.cy) / (ry || 1);
  const r = Math.hypot(nx, ny);
  if (r <= 1) return pt;
  return { x: frame.cx + (pt.x - frame.cx) / r, y: frame.cy + (pt.y - frame.cy) / r };
}

/* ───────────────────────── boîtes ───────────────────────── */

/** Rect (%) centré sur un point, à partir d'une taille en px. */
export function rectAround(center, sizePx, frame, padPx = 0) {
  const hw = (sizePx.w / 2 + padPx) / frame.kx;
  const hh = (sizePx.h / 2 + padPx) / frame.ky;
  return { x0: center.x - hw, y0: center.y - hh, x1: center.x + hw, y1: center.y + hh };
}

/** Aire de recouvrement de deux rects (%²). 0 = disjoints. */
export function rectOverlap(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

export function rectCenter(r) { return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; }

/**
 * Distance (px) entre l'origine et la sortie d'une boîte, le long de `dir`.
 * Sert à savoir de combien il faut pousser une mise pour dégager le bloc
 * siège de son PROPRE joueur (cartes comprises) — la « distance adaptée à la
 * géométrie » du §6, dérivée et non devinée.
 */
export function rayExitDistance(origin, dir, rect, frame) {
  const o = toPx(frame, origin);
  const r = {
    x0: rect.x0 * frame.kx, x1: rect.x1 * frame.kx,
    y0: rect.y0 * frame.ky, y1: rect.y1 * frame.ky,
  };
  if (o.x < r.x0 || o.x > r.x1 || o.y < r.y0 || o.y > r.y1) return 0;
  let t = Infinity;
  if (Math.abs(dir.x) > 1e-6) {
    const tx = dir.x > 0 ? (r.x1 - o.x) / dir.x : (r.x0 - o.x) / dir.x;
    if (tx >= 0) t = Math.min(t, tx);
  }
  if (Math.abs(dir.y) > 1e-6) {
    const ty = dir.y > 0 ? (r.y1 - o.y) / dir.y : (r.y0 - o.y) / dir.y;
    if (ty >= 0) t = Math.min(t, ty);
  }
  return Number.isFinite(t) ? t : 0;
}

/* ───────────────────────── solveur d'ancre ───────────────────────── */

/**
 * Place une ancre sur le vecteur siège→centre, puis la décale tangentiellement
 * tant qu'elle heurte une zone protégée ou qu'un autre siège lui « vole » la
 * propriété visuelle des jetons.
 *
 * @param seat        coord du siège (%)
 * @param frame       repère (makeTableFrame)
 * @param zones       [{id, rect}] zones protégées (%)
 * @param size        {w,h} taille en px de l'objet à poser
 * @param distancePx  distance de base sur le vecteur
 * @param rivals      [{id,x,y}] centres des AUTRES sièges (test d'appartenance)
 * @returns {x, y, sweptDeg, cost, blocked:[ids]}
 */
export function resolveAnchor({ seat, frame, zones = [], size, distancePx, rivals = [], opts = {} }) {
  const cfg = { ...ANCHOR_DEFAULTS, ...opts };

  // Marge d'appartenance ADAPTÉE à l'écartement réel des sièges : exiger 26 px
  // de marge n'a pas de sens quand deux joueurs ne sont séparés que de 75 px.
  const nearestSeatGap = rivals.reduce((m, r) => Math.min(m, distPx(frame, seat, r)), Infinity);
  const margin = Number.isFinite(nearestSeatGap)
    ? Math.min(cfg.ownershipMarginPx, nearestSeatGap * 0.22)
    : cfg.ownershipMarginPx;

  const evaluate = pt => {
    const box = rectAround(pt, size, frame, cfg.padPx);
    let area = 0;
    const blocked = [];
    for (const z of zones) {
      const a = rectOverlap(box, z.rect);
      if (a > 0) { area += a * (z.weight ?? 1); if ((z.weight ?? 1) > 0.5) blocked.push(z.id); }
    }
    // Coût d'APPARTENANCE : le propriétaire doit rester le siège le plus proche.
    const own = distPx(frame, pt, seat);
    let nearestRival = Infinity;
    for (const r of rivals) nearestRival = Math.min(nearestRival, distPx(frame, pt, r));
    const deficit = Math.max(0, own + margin - nearestRival);
    // Pondération volontairement forte : mieux vaut un léger chevauchement
    // décoratif qu'une mise attribuable au voisin (§27 > §10).
    const cost = area + deficit * 0.75;
    return { cost, area, blocked, own, nearestRival };
  };

  const attempt = (deg, kd) => {
    const p0 = pointAlongSeatVector(seat, frame, distancePx * kd);
    const pt = clampInsideFelt(deg ? rotateAroundCenter(p0, frame, deg * Math.PI / 180) : p0, frame, cfg.feltFill);
    return { pt, deg, ...evaluate(pt) };
  };

  /* 1) Sur le vecteur PUR (aucun décalage latéral) : c'est la lecture idéale
     du §4 — joueur, mise, pot alignés. On essaie d'abord d'y arriver en jouant
     seulement sur la DISTANCE, avant d'envisager le moindre décalage. */
  let best = attempt(0, 1);
  if (best.cost <= 0) return { x: best.pt.x, y: best.pt.y, sweptDeg: 0, cost: 0, blocked: [] };
  for (const kd of cfg.radialTries) {
    if (kd === 1) continue;
    const c = attempt(0, kd);
    if (c.cost <= 0) return { x: c.pt.x, y: c.pt.y, sweptDeg: 0, cost: 0, blocked: [] };
    if (c.cost < best.cost - 1e-9) best = c;
  }

  /* 2) Sinon seulement, décalage TANGENTIEL, du plus petit angle au plus grand. */
  const side = cfg.preferSide >= 0 ? 1 : -1;
  for (let deg = cfg.sweepStepDeg; deg <= cfg.sweepMaxDeg; deg += cfg.sweepStepDeg) {
    for (const sg of [side, -side]) {
      for (const kd of cfg.radialTries) {
        const c = attempt(sg * deg, kd);
        if (c.cost <= 0) return { x: c.pt.x, y: c.pt.y, sweptDeg: c.deg, cost: 0, blocked: [] };
        if (c.cost < best.cost - 1e-9) best = c;
      }
    }
  }
  return { x: best.pt.x, y: best.pt.y, sweptDeg: best.deg, cost: best.cost, blocked: best.blocked };
}

/* ───────────────────────── API de haut niveau ───────────────────────── */

/**
 * Distance de mise d'un siège : assez pour sortir de SON PROPRE bloc (cartes
 * comprises), sans jamais dépasser `betReachMax` de la distance au centre.
 */
export function betDistanceFor(seat, frame, seatRect, size, opts = {}, neighbours = []) {
  const cfg = { ...ANCHOR_DEFAULTS, ...opts };
  const dir = seatDirection(seat, frame);
  const base = Math.min(
    Math.max(dir.len * cfg.betReach, cfg.betMinPx),
    cfg.betMaxPx,
  );
  let clearance = 0;
  if (seatRect) {
    // sortie du bloc siège + demi-hauteur du badge projetée sur la direction
    const half = Math.abs(dir.x) * size.w / 2 + Math.abs(dir.y) * size.h / 2;
    clearance = rayExitDistance(seat, dir, seatRect, frame) + half + cfg.padPx * 2;
  }
  /* Deux plafonds, et le plus contraignant gagne :
       • ne pas dériver vers le centre de la table (betReachMax) ;
       • ne pas s'approcher du voisin (neighbourReach) — décisif en 9-max sur
         écran court, où l'écart entre sièges tombe sous 80 px. */
  const gap = neighbours.reduce((m, r) => Math.min(m, distPx(frame, seat, r)), Infinity);
  const caps = [dir.len * cfg.betReachMax];
  if (Number.isFinite(gap)) caps.push(gap * cfg.neighbourReach);
  return Math.max(cfg.betMinPx * 0.6, Math.min(Math.max(base, clearance), ...caps));
}

/**
 * Construit TOUTES les ancres d'une table en une passe, en tenant compte des
 * collisions croisées (une mise déjà posée devient une zone protégée pour la
 * suivante — §10 « otherBetBounds »).
 *
 * @param seats     [{id, pos, x, y, isHero, rect?}]  (rect = bloc siège, %)
 * @param frame     makeTableFrame(...)
 * @param staticZones [{id,rect}] board / pot / autres
 * @param betSize   {w,h} px du BetDisplay
 * @param dealerSize {w,h} px du bouton dealer
 * @param buttonSeatId id du siège BTN (bouton dealer)
 * @param activeBets   Set/array des ids ayant réellement des jetons posés
 * @returns { bets:{[id]:{x,y,sweptDeg}}, dealer:{x,y}|null, zones:[...] }
 */
export function buildTableAnchors({
  seats = [],
  frame,
  staticZones = [],
  betSize = { w: 62, h: 42 },
  dealerSize = { w: 22, h: 22 },
  buttonSeatId = null,
  activeBets = null,
  dealerReachCapPx = 74,
  opts = {},
}) {
  const cfg = { ...ANCHOR_DEFAULTS, ...opts };
  const zones = [...staticZones];
  // Les blocs sièges sont toujours protégés (une mise ne doit masquer ni un
  // avatar, ni une plaque, ni des cartes — les siennes comme celles du voisin).
  for (const s of seats) if (s.rect) zones.push({ id: `seat:${s.pos || s.id}`, seatId: s.id, rect: s.rect });

  const wants = id => !activeBets || (activeBets.has ? activeBets.has(id) : activeBets.includes(id));
  // Hero d'abord : son bloc (grandes cartes fermées) est le plus contraignant,
  // il doit choisir avant que les autres ne réservent la place.
  const order = [...seats].sort((a, b) => (b.isHero ? 1 : 0) - (a.isHero ? 1 : 0));

  const bets = {};
  const placed = [];
  for (const s of order) {
    const rivals = seats.filter(o => o.id !== s.id).map(o => ({ id: o.id, x: o.x, y: o.y }));
    const distance = betDistanceFor(s, frame, s.rect, betSize, cfg, rivals);
    // Son propre bloc pèse moins que celui des voisins : quand la table est
    // trop serrée pour tout satisfaire, la mise mord sur SES cartes plutôt que
    // de dériver vers le joueur d'à côté.
    const ownWeight = s.isHero ? cfg.ownHeroSeatWeight : cfg.ownSeatWeight;
    const weighted = [...zones, ...placed].map(z =>
      z.seatId === s.id ? { ...z, weight: ownWeight } : z);
    const a = resolveAnchor({
      seat: s, frame, zones: weighted, size: betSize, distancePx: distance, rivals, opts: cfg,
    });
    bets[s.id] = { x: a.x, y: a.y, sweptDeg: a.sweptDeg, cost: a.cost, blocked: a.blocked };
    // Seules les mises RÉELLEMENT posées encombrent la table pour les suivantes.
    if (wants(s.id)) placed.push({ id: `bet:${s.pos || s.id}`, rect: rectAround(a, betSize, frame, cfg.padPx) });
  }

  /* Bouton dealer — même système, mais du CÔTÉ OPPOSÉ au balayage de la mise
     du BTN : les deux objets appartiennent au même siège et se disputeraient
     sinon la même place (§20). Distance plus courte → il reste « collé » au
     joueur, comme sur une vraie table. */
  let dealer = null;
  const btn = seats.find(s => s.id === buttonSeatId);
  if (btn) {
    const betSwept = bets[btn.id]?.sweptDeg || 0;
    // Le bouton et la mise appartiennent au MÊME siège : sans cette règle ils
    // se disputent la même place et le joueur se retrouve avec deux objets
    // empilés d'un côté et rien de l'autre (§20).
    const side = betSwept > 0 ? -1 : betSwept < 0 ? 1 : -cfg.preferSide;
    const dir = seatDirection(btn, frame);
    const half = Math.abs(dir.x) * dealerSize.w / 2 + Math.abs(dir.y) * dealerSize.h / 2;
    /* Portée : juste assez pour sortir du bloc siège… mais pas plus que le
       double d'un avatar. Sur un siège de flanc, le bloc se traverse en ~44 px
       et le bouton se pose proprement à côté de la plaque. Sur le siège du bas
       (Hero), le bloc mesure ~110 px de haut à cause des grandes cartes : le
       laisser aller si loin détacherait le bouton de son joueur — on plafonne,
       et c'est le balayage tangentiel qui le pose À CÔTÉ des cartes. */
    const exit = btn.rect ? rayExitDistance(btn, dir, btn.rect, frame) : 0;
    const distance = Math.min(
      exit + half + cfg.padPx,
      (dealerReachCapPx || 74),
      dir.len * 0.34,
    );
    const a = resolveAnchor({
      seat: btn, frame, zones: [...zones, ...placed], size: dealerSize, distancePx: distance,
      rivals: seats.filter(o => o.id !== btn.id).map(o => ({ id: o.id, x: o.x, y: o.y })),
      // Essais radiaux DÉCROISSANTS d'abord : à angle égal, le bouton le plus
      // proche de son joueur gagne.
      opts: { ...cfg, preferSide: side, sweepMaxDeg: 66, radialTries: [0.62, 0.8, 1, 1.22] },
    });
    dealer = { x: a.x, y: a.y, sweptDeg: a.sweptDeg };
  }

  return { bets, dealer, zones };
}

/**
 * Contrôle d'appartenance (§27) — utilisable en test comme en audit navigateur.
 * @returns [{id, ownerDist, rivalId, rivalDist, ok}]
 */
export function auditBetOwnership(seats, bets, frame, marginPx = 0) {
  return seats.map(s => {
    const b = bets[s.id];
    if (!b) return { id: s.id, pos: s.pos, ok: true, skipped: true };
    const ownerDist = distPx(frame, b, s);
    let rivalId = null, rivalDist = Infinity;
    for (const o of seats) {
      if (o.id === s.id) continue;
      const d = distPx(frame, b, o);
      if (d < rivalDist) { rivalDist = d; rivalId = o.pos || o.id; }
    }
    return {
      id: s.id, pos: s.pos,
      ownerDist: Math.round(ownerDist), rivalId, rivalDist: Math.round(rivalDist),
      ok: ownerDist + marginPx <= rivalDist,
    };
  });
}
