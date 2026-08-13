/* ═══════════════════════════════════════════════════════════════
   PokerForge — tests du SYSTÈME D'ANCRAGE de table (Replayer).

   Ce que ces tests protègent, concrètement : la régression qui a motivé la
   refonte. L'ancienne règle poussait tout siège centré de +20 points en x ;
   sur une table 6-max, la mise de Hero (BTN, x=50) atterrissait à x=70 alors
   que le CO est à x=85 — les jetons étaient PLUS PRÈS du CO que de leur
   propriétaire. Le test `appartenance` échoue si cela revient, quelle que
   soit la manière dont l'ancre est calculée.
═══════════════════════════════════════════════════════════════ */
import {
  makeTableFrame, buildTableAnchors, auditBetOwnership,
  seatDirection, rectAround, rectOverlap, rotateAroundCenter, distPx,
  betDistanceFor, clampInsideFelt,
} from "./src/components/table/tableAnchors.js";
import { heroCentricSeatRing, feltGeometry } from "./src/components/table/geometry.js";

let pass = 0, fail = 0;
const ok = (cond, label, extra = "") => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
};
const section = t => console.log(`\n── ${t}`);

/* ── Fixture calibrée sur des MESURES réelles ──
   Valeurs relevées dans le DOM du Replayer en 1680×1050 (zone de table
   805×663 px), via `node scripts/replayer-bet-audit.mjs --rects` :
     bloc siège villain   88 × 126 px, centré sur le point de siège
     bloc siège Hero     104 × 171 px, centré (grandes cartes fermées)
     bloc siège du haut   88 × 126 px, ancré à 40 % (translate -50%,-40%)
     board  x 40.3–59.7 %  y 43.5–53.5 %
     pot    x 47.9–52.1 %  y 34.9–43.1 %
   Rejouer ce relevé si la mise en page de la table change. */
const GEOM = feltGeometry(0, 6);
const BOX = { width: 805, height: 663 };
const FRAME = makeTableFrame({ ...BOX, geometry: GEOM });

const POS6 = ["BTN", "SB", "BB", "UTG", "HJ", "CO"];
const RING6 = heroCentricSeatRing(POS6, "BTN", { geometry: GEOM });

const SEAT_PX = { hero: { w: 104, h: 171 }, villain: { w: 88, h: 126 } };
function seatRectFor(c, frame, isHero) {
  const px = isHero ? SEAT_PX.hero : SEAT_PX.villain;
  const hw = px.w / 2 / frame.kx, h = px.h / frame.ky;
  // Les sièges du haut sont ancrés à 40 % de leur hauteur (translate -50%,-40%),
  // les autres à 50 % — c'est ce que fait `seatTransform` dans la table.
  const anchorY = c.y <= 24 ? 0.4 : 0.5;
  return { x0: c.x - hw, x1: c.x + hw, y0: c.y - h * anchorY, y1: c.y + h * (1 - anchorY) };
}
function buildSeats(positions, ring, heroPos, frame = FRAME) {
  return positions.map((pos, i) => {
    const c = ring[pos];
    const isHero = pos === heroPos;
    return { id: `p${i}`, pos, x: c.x, y: c.y, isHero, rect: seatRectFor(c, frame, isHero) };
  });
}
const SEATS6 = buildSeats(POS6, RING6, "BTN");
const BET_SIZE = { w: 66, h: 46 };
/* Board et pot avec leur halo de respiration (§10), comme dans la table. */
const ZONES = [
  { id: "board", rect: { x0: 39.6, y0: 42.6, x1: 60.4, y1: 54.4 } },
  { id: "pot", rect: { x0: 46.2, y0: 32.8, x1: 53.8, y1: 45.2 } },
];

const build = (seats, opts = {}) => buildTableAnchors({
  seats, frame: FRAME, staticZones: ZONES,
  betSize: BET_SIZE, dealerSize: { w: 25, h: 25 },
  buttonSeatId: seats.find(s => s.isHero)?.id,
  ...opts,
});

/* ═══════════════ 1. Appartenance (§27) ═══════════════ */
section("Appartenance des jetons — le propriétaire est le siège le plus proche");
{
  const { bets } = build(SEATS6);
  const audit = auditBetOwnership(SEATS6, bets, FRAME);
  for (const a of audit) {
    ok(a.ok, `mise ${a.pos} attribuable à son joueur`,
      `${a.ownerDist}px de ${a.pos} mais ${a.rivalDist}px de ${a.rivalId}`);
  }
  // Le cas exact de la capture : Hero=BTN en bas-centre, CO à sa droite.
  const hero = SEATS6.find(s => s.pos === "BTN");
  const co = SEATS6.find(s => s.pos === "CO");
  const b = bets[hero.id];
  const dHero = distPx(FRAME, b, hero), dCo = distPx(FRAME, b, co);
  ok(dCo > dHero * 1.4, "BTN/CO : la mise de Hero est nettement plus proche de BTN",
    `BTN ${Math.round(dHero)}px vs CO ${Math.round(dCo)}px`);
  // L'ancienne formule (x = seat.x + 20) plaçait la mise à x=70 : on vérifie
  // qu'aucune ancre ne retombe dans cette zone intermédiaire BTN↔CO.
  const mid = { x: (hero.x + co.x) / 2, y: (hero.y + co.y) / 2 };
  ok(distPx(FRAME, b, mid) > distPx(FRAME, b, hero),
    "la mise de Hero n'est pas dans la zone intermédiaire BTN↔CO");
}

/* ═══════════════ 2. Direction : la mise est SUR le vecteur siège→centre ═══════════════ */
section("Géométrie — mise posée entre le joueur et le centre");
{
  const { bets } = build(SEATS6);
  for (const s of SEATS6) {
    const b = bets[s.id];
    const dSeatCenter = distPx(FRAME, s, { x: FRAME.cx, y: FRAME.cy });
    const dBetCenter = distPx(FRAME, b, { x: FRAME.cx, y: FRAME.cy });
    ok(dBetCenter < dSeatCenter, `${s.pos} : la mise est plus près du centre que le siège`,
      `${Math.round(dBetCenter)} vs ${Math.round(dSeatCenter)}`);
    const dir = seatDirection(s, FRAME);
    const v = { x: (b.x - s.x) * FRAME.kx, y: (b.y - s.y) * FRAME.ky };
    const len = Math.hypot(v.x, v.y) || 1;
    const cos = (v.x * dir.x + v.y * dir.y) / len;
    // ≥ cos(50°) : la mise reste dans le secteur du joueur, jamais derrière lui.
    ok(cos > 0.64, `${s.pos} : la mise reste dans le secteur du joueur`, `cos=${cos.toFixed(2)}`);
  }
}

/* ═══════════════ 3. Isotropie (§6) — table elliptique ═══════════════ */
section("Isotropie — même distance réelle en haut/bas et à gauche/droite");
{
  const { bets } = build(SEATS6);
  const d = pos => {
    const s = SEATS6.find(x => x.pos === pos);
    return distPx(FRAME, bets[s.id], s);
  };
  // Sièges de flanc (gauche/droite) vs siège du haut : contraintes différentes
  // (le bloc Hero est bien plus haut), mais rien ne doit varier du simple au
  // double entre deux villains symétriques.
  const bb = d("BB"), hj = d("HJ");
  ok(Math.abs(bb - hj) < 6, "BB et HJ (symétriques) reçoivent la même distance",
    `${Math.round(bb)} vs ${Math.round(hj)}`);
  const sb = d("SB"), co = d("CO");
  ok(Math.abs(sb - co) < 6, "SB et CO (symétriques) reçoivent la même distance",
    `${Math.round(sb)} vs ${Math.round(co)}`);
  // En % purs (sans correction d'aspect), un siège du haut recevrait une mise
  // ~1,3× plus « longue » qu'un siège de flanc sur cette table. On vérifie que
  // le calcul se fait bien en px : distances comparables.
  const utg = d("UTG");
  ok(utg / bb < 1.8 && bb / utg < 1.8, "haut vs flanc : rapport de distance raisonnable",
    `UTG ${Math.round(utg)} / BB ${Math.round(bb)}`);
}

/* ═══════════════ 4. Collisions (§10) ═══════════════ */
section("Collisions — aucune mise ne recouvre une zone protégée");
{
  const activeBets = SEATS6.map(s => s.id);
  const { bets } = build(SEATS6, { activeBets });
  const boxes = SEATS6.map(s => ({ pos: s.pos, r: rectAround(bets[s.id], BET_SIZE, FRAME, 0) }));
  for (const z of ZONES)
    for (const b of boxes)
      ok(rectOverlap(b.r, z.rect) < 0.4, `mise ${b.pos} ne recouvre pas ${z.id}`,
        `${rectOverlap(b.r, z.rect).toFixed(2)}%²`);
  for (const s of SEATS6)
    for (const b of boxes)
      ok(rectOverlap(b.r, s.rect) < 0.6, `mise ${b.pos} ne recouvre pas le siège ${s.pos}`,
        `${rectOverlap(b.r, s.rect).toFixed(2)}%²`);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      ok(rectOverlap(boxes[i].r, boxes[j].r) < 0.2,
        `mises ${boxes[i].pos} et ${boxes[j].pos} disjointes`);
}

/* ═══════════════ 5. Sur le tapis ═══════════════ */
section("Les jetons restent sur le feutre");
{
  const { bets } = build(SEATS6);
  for (const s of SEATS6) {
    const b = bets[s.id];
    const n = Math.hypot((b.x - FRAME.cx) / FRAME.rx, (b.y - FRAME.cy) / FRAME.ry);
    ok(n <= 0.86, `mise ${s.pos} à l'intérieur de l'ellipse du feutre`, `r=${n.toFixed(2)}`);
  }
}

/* ═══════════════ 6. Bouton dealer (§20) ═══════════════ */
section("Bouton dealer — associé au BTN, sans conflit avec sa mise");
{
  const { bets, dealer } = build(SEATS6, { activeBets: SEATS6.map(s => s.id) });
  const btn = SEATS6.find(s => s.isHero);
  ok(!!dealer, "un point dealer est produit");
  let nearest = null, nd = Infinity;
  for (const s of SEATS6) { const d = distPx(FRAME, dealer, s); if (d < nd) { nd = d; nearest = s.pos; } }
  ok(nearest === btn.pos, "le bouton D est le plus proche du BTN", `plus proche de ${nearest}`);
  const dBet = distPx(FRAME, dealer, bets[btn.id]);
  ok(dBet > 34, "le bouton D ne se superpose pas à la mise du BTN", `${Math.round(dBet)}px`);
  const dRect = rectAround(dealer, { w: 25, h: 25 }, FRAME, 0);
  for (const s of SEATS6)
    ok(rectOverlap(dRect, s.rect) < 0.35, `bouton D ne recouvre pas le siège ${s.pos}`);
}

/* ═══════════════ 7. Déterminisme (§19) ═══════════════ */
section("Déterminisme — même état, même position");
{
  const a = build(SEATS6), b = build(SEATS6);
  let same = true;
  for (const s of SEATS6)
    if (a.bets[s.id].x !== b.bets[s.id].x || a.bets[s.id].y !== b.bets[s.id].y) same = false;
  ok(same, "deux appels successifs donnent des ancres identiques");
  ok(a.dealer.x === b.dealer.x && a.dealer.y === b.dealer.y, "le bouton D est déterministe");

  // L'ancre ne doit PAS dépendre du montant : une pile qui grossit pendant la
  // street ne doit pas faire glisser le tas sous le curseur de l'utilisateur.
  const petit = buildTableAnchors({ seats: SEATS6, frame: FRAME, staticZones: ZONES, betSize: BET_SIZE, dealerSize: { w: 25, h: 25 } });
  const gros = buildTableAnchors({ seats: SEATS6, frame: FRAME, staticZones: ZONES, betSize: BET_SIZE, dealerSize: { w: 25, h: 25 }, activeBets: [] });
  for (const s of SEATS6)
    ok(Math.abs(petit.bets[s.id].x - gros.bets[s.id].x) < 0.01,
      `ancre ${s.pos} indépendante des mises réellement posées`);
}

/* ═══════════════ 8. Responsive (§23) ═══════════════ */
section("Responsive — le système suit la table, pas la page");
{
  for (const [w, h] of [[1100, 820], [805, 663], [560, 430], [1400, 560]]) {
    const f = makeTableFrame({ width: w, height: h, geometry: GEOM });
    const seats = buildSeats(POS6, RING6, "BTN", f);
    const { bets } = buildTableAnchors({
      seats, frame: f, staticZones: ZONES, betSize: BET_SIZE,
      dealerSize: { w: 25, h: 25 }, buttonSeatId: "p0",
    });
    const audit = auditBetOwnership(seats, bets, f);
    ok(audit.every(a => a.ok), `${w}×${h} : toutes les mises restent attribuables`,
      audit.filter(a => !a.ok).map(a => a.pos).join(","));
  }
}

/* ═══════════════ 9. Autres tailles de table ═══════════════ */
section("Toutes les structures supportées (2 à 9 joueurs)");
{
  const TABLES = {
    2: ["BTN", "BB"],
    3: ["BTN", "SB", "BB"],
    4: ["BTN", "SB", "BB", "UTG"],
    5: ["BTN", "SB", "BB", "UTG", "CO"],
    6: POS6,
    8: ["BTN", "SB", "BB", "UTG", "UTG+1", "LJ", "HJ", "CO"],
    9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO"],
  };
  for (const [n, positions] of Object.entries(TABLES)) {
    const g = feltGeometry(0, +n);
    const f = makeTableFrame({ ...BOX, geometry: g });
    const ring = heroCentricSeatRing(positions, "BTN", { geometry: g });
    const seats = buildSeats(positions, ring, "BTN", f);
    const { bets, dealer } = buildTableAnchors({
      seats, frame: f, staticZones: ZONES, betSize: BET_SIZE,
      dealerSize: { w: 25, h: 25 }, buttonSeatId: "p0",
    });
    const audit = auditBetOwnership(seats, bets, f);
    const ko = audit.filter(a => !a.ok);
    ok(ko.length === 0, `table ${n} joueurs : chaque mise appartient visuellement à son siège`,
      ko.map(a => `${a.pos}→${a.rivalId}`).join(","));
    let nearest = null, nd = Infinity;
    for (const s of seats) { const d = distPx(f, dealer, s); if (d < nd) { nd = d; nearest = s.pos; } }
    ok(nearest === "BTN", `table ${n} joueurs : bouton D rattaché au BTN`, `→ ${nearest}`);
  }
}

/* ═══════════════ 10. Primitives ═══════════════ */
section("Primitives géométriques");
{
  // Une rotation autour du centre conserve la distance au centre (en px).
  const p = { x: 20, y: 70 };
  const r = rotateAroundCenter(p, FRAME, 0.4);
  const c = { x: FRAME.cx, y: FRAME.cy };
  ok(Math.abs(distPx(FRAME, p, c) - distPx(FRAME, r, c)) < 0.5,
    "le décalage tangentiel conserve la distance au centre");
  // Le clamp ramène bien un point hors feutre sur l'ellipse.
  const out = clampInsideFelt({ x: 200, y: 200 }, FRAME, 0.8);
  const n = Math.hypot((out.x - FRAME.cx) / (FRAME.rx * 0.8), (out.y - FRAME.cy) / (FRAME.ry * 0.8));
  ok(Math.abs(n - 1) < 1e-6, "clampInsideFelt ramène sur l'ellipse", `n=${n}`);
  // La distance de mise est bornée par la fraction de la distance au centre.
  const hero = SEATS6.find(s => s.isHero);
  const d = betDistanceFor(hero, FRAME, hero.rect, BET_SIZE);
  ok(d <= seatDirection(hero, FRAME).len * 0.46 + 1e-6,
    "la mise ne dépasse jamais 46 % de la distance au centre");
  ok(d > 0, "la distance de mise est positive");
}

console.log(`\n${fail === 0 ? "✓" : "✗"} ancrage Replayer : ${pass} ok, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
