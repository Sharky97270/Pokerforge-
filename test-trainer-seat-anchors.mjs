/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-seat-anchors — les zones d'un siège pointent-elles vers le
   centre, et le font-elles pour TOUTES les structures ?

   Ce que ces assertions protègent, et pourquoi elles sont écrites sur des
   fonctions PURES plutôt que sur des captures : la disposition d'un siège
   dépend de sa POSITION SUR L'ANNEAU, et un tirage de spot au hasard ne visite
   pas les six positions. Une vérification au navigateur ne prouve donc rien sur
   le siège qu'elle n'a pas tiré — c'est la leçon déjà payée sur la mission
   « cinématique des mises ».

   Les fixtures de sièges sont MESURÉES dans le navigateur (mêmes relevés que
   test-trainer-table-geometry) : une ellipse idéalisée ne rendrait pas les
   mêmes axes.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import fs from "node:fs";
import {
  seatAxis, seatAxisClear, seatDirection, seatFlexDirection, oppositeAxis,
  trainerSeatZones, trainerAllSeatZones, DIAGONAL_BIAS, SEAT_AXES,
} from "./src/trainerSeatAnchors.js";

let n = 0;
const echecs = [];
const ok = (cond, msg) => { n++; if (!cond) echecs.push(msg); };
const eq = (a, b, msg) => { n++; if (a !== b) echecs.push(`${msg} — attendu ${b}, obtenu ${a}`); };

/* Zone 1T mesurée à 1366×768 (cf. audit trainer-geometry). */
const AREA = { w: 589.6, h: 360 };
/* Centre du feutre en % de la zone, marges WEB_GEOMETRY_BY_COUNT[6]. */
const CENTRE = { x: 50, y: 47.5 };
/* Sièges 6-max mesurés au navigateur. */
const SEATS_6 = {
  BB:  { x: 50,   y: 14.3 },   // haut-centre
  SB:  { x: 16.6, y: 30.9 },   // flanc gauche haut
  BTN: { x: 16.6, y: 64.1 },   // flanc gauche bas
  CO:  { x: 50,   y: 73.8 },   // bas-centre (Hero)
  HJ:  { x: 83.4, y: 64.1 },   // flanc droit bas
  UTG: { x: 83.4, y: 30.9 },   // flanc droit haut
};

/* ── 1. L'AXE POINTE TOUJOURS VERS LE CENTRE ──────────────────────────────
   Propriété la plus simple et la plus importante : quel que soit le siège, la
   composante de l'axe retenu dans la direction du centre doit être positive.
   Un siège dont les cartes partent à l'opposé du board est le défaut signalé
   sur le BB. */
const COMPOSANTE = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
for (const [pos, seat] of Object.entries(SEATS_6)) {
  const axe = seatAxis(seat, CENTRE, AREA);
  ok(SEAT_AXES.includes(axe), `${pos} : axe connu (${axe})`);
  const d = seatDirection(seat, CENTRE, AREA);
  const u = COMPOSANTE[axe];
  ok(d.x * u.x + d.y * u.y > 0, `${pos} : l'axe ${axe} va bien vers le centre`);
}

/* ── 2. LES SIÈGES DE FLANC NE SONT PLUS TRAITÉS COMME DES SIÈGES DU HAUT ──
   C'est le défaut d'origine : une règle verticale (« y <= 40 ») envoyait les
   cartes d'un joueur de flanc au-dessus de sa tête. */
eq(seatAxis(SEATS_6.SB, CENTRE, AREA), "right", "SB (flanc gauche) : cartes vers la DROITE");
eq(seatAxis(SEATS_6.BTN, CENTRE, AREA), "right", "BTN (flanc gauche) : cartes vers la DROITE");
eq(seatAxis(SEATS_6.UTG, CENTRE, AREA), "left", "UTG (flanc droit) : cartes vers la GAUCHE");
eq(seatAxis(SEATS_6.HJ, CENTRE, AREA), "left", "HJ (flanc droit) : cartes vers la GAUCHE");
eq(seatAxis(SEATS_6.BB, CENTRE, AREA), "down", "BB (haut-centre) : cartes VERS LE BAS");
eq(seatAxis(SEATS_6.CO, CENTRE, AREA), "up", "CO/Hero (bas-centre) : cartes VERS LE HAUT");

/* ── 3. LE SENS DU FLEX MET LES CARTES DU BON CÔTÉ ────────────────────────
   L'ordre du DOM est « cartes ▸ avatar ▸ plaque ». C'est le sens du flex qui
   décide de quel côté tombent les cartes ; s'en tromper inverse la grappe. */
eq(seatFlexDirection("up"), "column", "axe up → colonne (cartes au-dessus)");
eq(seatFlexDirection("down"), "column-reverse", "axe down → colonne inversée");
eq(seatFlexDirection("left"), "row", "axe left → rangée (cartes à gauche)");
eq(seatFlexDirection("right"), "row-reverse", "axe right → rangée inversée");
for (const a of SEAT_AXES) eq(oppositeAxis(oppositeAxis(a)), a, `opposé(opposé(${a})) = ${a}`);

/* ── 4. UN VECTEUR UNITAIRE SE CALCULE EN PIXELS ──────────────────────────
   Le piège documenté dans trainerTableGeometry : la zone n'est pas carrée, donc
   normaliser en pourcentages pointe ailleurs qu'à l'écran. On le vérifie sur un
   cas où les deux réponses diffèrent. */
{
  const carre = { w: 400, h: 400 };
  const plat = { w: 800, h: 200 };
  const siege = { x: 20, y: 30 };
  const dCarre = seatDirection(siege, CENTRE, carre);
  const dPlat = seatDirection(siege, CENTRE, plat);
  ok(Math.abs(dCarre.x - dPlat.x) > 0.05,
    `la direction dépend bien de la FORME du conteneur (${dCarre.x.toFixed(2)} vs ${dPlat.x.toFixed(2)})`);
}

/* ── 5. LA BANDE MORTE DIAGONALE EST STABLE ───────────────────────────────
   Un siège quasi diagonal ne doit pas basculer d'un axe à l'autre au moindre
   pixel : sans bande morte, la grappe d'un siège de coin change de forme quand
   la fenêtre bouge d'un cheveu. */
{
  const zone = { w: 400, h: 400 };
  // dx = dy exactement → l'axe vertical doit l'emporter (DIAGONAL_BIAS > 1)
  eq(seatAxis({ x: 30, y: 30 }, { x: 50, y: 50 }, zone), "down", "diagonale parfaite → axe vertical");
  ok(DIAGONAL_BIAS > 1, "la bande morte existe (DIAGONAL_BIAS > 1)");
  // juste au-delà de la bande morte, l'horizontal reprend la main
  const axe = seatAxis({ x: 20, y: 45 }, { x: 50, y: 50 }, zone);
  eq(axe, "right", "composante horizontale nettement dominante → axe horizontal");
}

/* ── 6. LE DÉGAGEMENT PEUT CHANGER L'AXE, MAIS SEULEMENT EN DERNIER RECOURS ─
   Premier essai de cette règle : « le moindre chevauchement gagne ». Mesuré au
   navigateur, l'écart angulaire des cartes remontait de 6.1° à 36.5° et deux
   voisins se retrouvaient cartes contre cartes. On vérifie donc les DEUX
   comportements : l'axe radial tient quand il effleure, il cède quand il est
   massivement dedans. */
{
  const zone = { w: 589.6, h: 360 };
  const cartes = { w: 63, h: 41 };
  // bande centrale large, façon board 1T
  const bande = { xMin: 30, xMax: 70, yMin: 33, yMax: 59 };
  // Un siège de flanc dont les cartes EFFLEURENT la bande garde son axe radial.
  const effleure = seatAxisClear({ seat: SEATS_6.BTN, centre: CENTRE, area: zone, forbidden: bande, cardsPx: cartes, avatarPx: 44, gapPx: 5 });
  eq(effleure, "right", "flanc qui effleure la bande : l'axe radial tient");
  // Sans bande, on retombe évidemment sur l'axe pur.
  eq(seatAxisClear({ seat: SEATS_6.BTN, centre: CENTRE, area: zone, cardsPx: cartes, avatarPx: 44 }), "right",
    "sans bande interdite : axe purement radial");
  // Un siège sur l'axe vertical n'a pas de secondaire : il ne peut pas basculer.
  eq(seatAxisClear({ seat: { x: 50, y: 14.3 }, centre: CENTRE, area: zone, forbidden: { xMin: 0, xMax: 100, yMin: 0, yMax: 100 }, cardsPx: cartes, avatarPx: 44 }), "down",
    "siège pile sur l'axe vertical : aucun secondaire, l'axe tient");
}

/* ── 7. LES ZONES SONT DU BON CÔTÉ, ET SÉPARÉES ───────────────────────────
   §17 : de l'extérieur vers l'intérieur, STATUT · PLAQUE · AVATAR · CARTES.
   On vérifie l'ORDRE le long de l'axe, pas des coordonnées absolues. */
for (const [pos, seat] of Object.entries(SEATS_6)) {
  const z = trainerSeatZones({ seat, centre: CENTRE, area: AREA, avatarPx: 44, gapPx: 5 });
  ok(z != null, `${pos} : zones calculées`);
  const u = COMPOSANTE[z.axe];
  // Projection sur l'axe, en % (le signe seul nous intéresse).
  const proj = p => (p.x - seat.x) * u.x + (p.y - seat.y) * u.y;
  ok(proj(z.cardsAnchor) > 0, `${pos} : les cartes sont du côté du centre`);
  ok(proj(z.labelAnchor) < 0, `${pos} : la plaque est du côté extérieur`);
  ok(proj(z.statusAnchor) < proj(z.labelAnchor), `${pos} : le badge d'état est PLUS EXTERNE que la plaque (§19)`);
  eq(z.avatarAnchor.x, seat.x, `${pos} : l'avatar EST le point d'anneau (x)`);
  eq(z.avatarAnchor.y, seat.y, `${pos} : l'avatar EST le point d'anneau (y)`);
}

/* ── 8. TOUTES LES STRUCTURES, PAS SEULEMENT LE 6-MAX ─────────────────────
   La mission demande 6 / 7 / 9 joueurs. On génère des anneaux réguliers et on
   vérifie la propriété qui compte partout : l'axe va vers le centre. */
for (const nb of [6, 7, 8, 9]) {
  const seats = {};
  for (let i = 0; i < nb; i++) {
    const a = Math.PI / 2 + (2 * Math.PI * i) / nb;   // Hero en bas-centre
    seats[`S${i}`] = { x: 50 + Math.cos(a) * 41, y: 47.5 + Math.sin(a) * 32 };
  }
  const zones = trainerAllSeatZones({ seats, centre: CENTRE, area: AREA, avatarOf: () => 44 });
  eq(Object.keys(zones).length, nb, `${nb} joueurs : une zone par siège`);
  for (const [pos, z] of Object.entries(zones)) {
    const u = COMPOSANTE[z.axe];
    const d = seatDirection(seats[pos], CENTRE, AREA);
    ok(d.x * u.x + d.y * u.y > 0, `${nb} joueurs / ${pos} : l'axe va vers le centre`);
  }
}

/* ── 9. GARDE-FOU : PAS D'ACCENT GRAVE DANS styles.js ─────────────────────
   styles.js est un TEMPLATE LITERAL. Un accent grave posé dans un commentaire
   CSS le termine en plein milieu : la page devient blanche et l'erreur pointe
   des centaines de lignes plus loin. Ce piège a coûté deux sessions ; il n'a
   aucune raison d'être re-payé une troisième fois.
   Les quatre seuls accents graves légitimes sont les délimiteurs des deux
   exports. */
{
  const src = fs.readFileSync(new URL("./src/styles.js", import.meta.url), "utf8");
  const accents = (src.match(/`/g) || []).length;
  eq(accents, 4, `styles.js : 4 accents graves exactement (les délimiteurs), trouvé ${accents}`);
}

if (echecs.length) {
  console.error(`❌ ${echecs.length} échec(s) sur ${n} assertions :`);
  for (const e of echecs) console.error("  · " + e);
  process.exit(1);
}
console.log(`✅ trainer-seat-anchors (zones radiales) — ${n} assertions OK`);
assert.ok(true);
