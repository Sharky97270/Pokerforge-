/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — LE POT PRÉFLOP EST RECONSTRUCTIBLE DEPUIS LA TABLE (§3/§24/§37).

   Ce que ces tests protègent : le critère d'acceptation de la mission — « on
   doit pouvoir reconstruire 0.5 + 1 + 2.5 = 4bb simplement en regardant la
   table ». Au préflop il est vérifiable sans rien savoir de l'historique, parce
   que tout ce qui est dans le pot y a été mis sur cette street :

       pot == Σ des montants que la table peint (mises + blindes)

   Le défaut mesuré avant correction n'était pas une erreur d'arithmétique mais
   une absence de données : trois fabriques de spots préflop posaient un pot
   TIRÉ AU SORT (`pot = rndI(8,14)`) ou ÉCRIT EN DUR (`pot: 36`, quelles que
   soient les positions), sans aucune séquence d'actions derrière. Le pot ne
   pouvait donc pas être peint. Les tests ci-dessous vérifient que les trois
   fabriques passent désormais par une vraie ligne préflop, et que cette ligne
   satisfait l'égalité pour TOUTES les combinaisons de positions — pas seulement
   pour celles que le générateur tire souvent.
   ═══════════════════════════════════════════════════════════════════════════ */
import {
  playPreflop, buildPreflopLine, paintedPreflopAmounts, paintedPreflopTotal,
  attachPreflopLine, preflopKind, preflopSeats, preflopRoleOk, resolvePreflopRoles,
  blindOf, PREFLOP_BLINDS,
} from "./src/preflopLine.js";
import { preflopPot } from "./src/potAccounting.js";
import { SPOTS, POSITIONS_BY_SIZE } from "./src/data/content.js";
import { SpotGenerationEngine, createTrainingSpotFromHand } from "./src/spotAiEngine.js";

let n = 0;
const fails = [];
const ok = (cond, msg) => { n++; if (!cond) fails.push(msg); };
const near = (a, b, msg, tol = 0.011) => { n++; if (!(Math.abs(a - b) <= tol)) fails.push(`${msg} — ${a} vs ${b}`); };

/* ── 1. LE MOTEUR : UN TOUR D'ENCHÈRES, PAS UNE FORMULE ─────────────────────
   Les blindes sont déjà dans le pot avant la première action ; une relance
   « TO » ne rajoute que la différence. C'est précisément ce que les anciennes
   formules oubliaient. */
{
  const vide = playPreflop({ seats: POSITIONS_BY_SIZE[6], script: [] });
  near(vide.pot, 1.5, "aucune action : le pot vaut les deux blindes");
  near(vide.committed.SB, 0.5, "la SB est engagée dès la donne");
  near(vide.committed.BB, 1, "la BB est engagée dès la donne");
  ok(vide.errors.length === 0, "un tour vide n'est pas une erreur");

  const open = playPreflop({ seats: POSITIONS_BY_SIZE[6], script: [{ pos: "BTN", act: "RAISE", to: 2.5 }] });
  near(open.pot, 4, "open 2.5 du BTN : 2.5 + 0.5 + 1 = 4bb");
  near(open.highest, 2.5, "la mise à suivre est l'open");

  /* LE CAS QUI A COÛTÉ UNE BLINDE À CHAQUE FOIS : une SB qui ouvre à 3 a engagé
     3, pas 3.5 — sa blinde est DÉJÀ dans sa relance. */
  const sbOpen = playPreflop({ seats: POSITIONS_BY_SIZE[6], script: [{ pos: "SB", act: "RAISE", to: 3 }] });
  near(sbOpen.committed.SB, 3, "la blinde postée est comprise dans la relance");
  near(sbOpen.pot, 4, "SB ouvre à 3 : pot = 3 + 1, et surtout pas 3.5 + 1");

  const call = playPreflop({
    seats: POSITIONS_BY_SIZE[6],
    script: [{ pos: "CO", act: "RAISE", to: 2.5 }, { pos: "BTN", act: "CALL" }],
  });
  near(call.committed.BTN, 2.5, "suivre, c'est s'aligner sur la mise en cours");
  near(call.pot, 6.5, "open + call : 2.5 + 2.5 + les deux blindes");

  /* Un pot 3-bet où le 3-betteur est un blindeur : le piège historique. */
  const troisBet = playPreflop({
    seats: POSITIONS_BY_SIZE[6],
    script: [{ pos: "BTN", act: "RAISE", to: 2.5 }, { pos: "SB", act: "FOLD" }, { pos: "BB", act: "3BET", to: 9 }],
  });
  near(troisBet.pot, 12, "3-bet de la BB à 9 sur un open à 2.5 : pot = 12bb");
  const derniere = troisBet.actions[troisBet.actions.length - 1];
  near(derniere.potAfterAction, 12, "l'historique affiche le même pot que le moteur");
  near(derniere.amountBb, 9, "l'historique porte l'engagement TOTAL du siège");

  const illegal = playPreflop({
    seats: POSITIONS_BY_SIZE[6],
    script: [{ pos: "CO", act: "FOLD" }, { pos: "CO", act: "RAISE", to: 3 }],
  });
  ok(illegal.errors.some(e => /couché/.test(e)), "un joueur couché qui relance est signalé, pas absorbé");

  const sousMise = playPreflop({
    seats: POSITIONS_BY_SIZE[6],
    script: [{ pos: "CO", act: "RAISE", to: 5 }, { pos: "BTN", act: "RAISE", to: 3 }],
  });
  ok(sousMise.errors.some(e => /sous la mise/.test(e)), "une relance sous la mise en cours est signalée");
}

/* ── 2. L'ÉGALITÉ, SUR TOUTE LA MATRICE DES POSITIONS ───────────────────────
   Un générateur ne tire pas toutes les positions à la même fréquence : un test
   sur « le cas courant » ne prouve rien du cas rare, qui est justement celui
   que l'utilisateur finit par croiser. On balaie donc tout. */
const KINDS = [
  { kind: "rfi", cat: "RFI", toCall: 0 },
  { kind: "vsOpen", cat: "Vs Open", toCall: 2 },
  { kind: "squeeze", cat: "Vs Open", toCall: 1.5, desc: "squeeze", multiway: [{}] },
  { kind: "vs3bet", cat: "Vs 3-bet", toCall: 6.5 },
  { kind: "vs4bet", cat: "Vs 4-bet", toCall: 18 },
];
{
  let combos = 0, legales = 0;
  for (const taille of [6, 9]) {
    const seats = POSITIONS_BY_SIZE[taille];
    for (const k of KINDS) {
      for (const hero of seats) for (const villain of seats) {
        if (hero === villain) continue;
        combos++;
        const spot = { street: "Preflop", cat: k.cat, desc: k.desc, hpos: hero, vpos: villain, toCall: k.toCall, multiway: k.multiway, nplayers: taille };
        const line = buildPreflopLine(spot);
        if (!line) { fails.push(`ligne absente — ${k.kind} ${hero} vs ${villain}`); n++; continue; }
        // L'égalité doit tenir MÊME sur une combinaison de positions impossible :
        // ce qui est peint doit toujours expliquer le pot, sinon la table ment.
        near(paintedPreflopTotal(line), line.pot, `pot peint = pot moteur — ${taille}J ${k.kind} ${hero} vs ${villain}`);
        if (preflopRoleOk({ kind: k.kind, hero, villain, seats: line.seats })) {
          legales++;
          ok(line.errors.length === 0, `séquence jouable — ${taille}J ${k.kind} ${hero} vs ${villain} (${line.errors.join(", ")})`);
          if (k.toCall > 0) near(line.toCall, k.toCall, `Hero paie ce que le spot annonce — ${k.kind} ${hero} vs ${villain}`);
        }
      }
    }
  }
  ok(combos > 400, `la matrice est balayée en entier (${combos} combinaisons)`);
  ok(legales > 150, `et elle contient assez de combinaisons jouables (${legales})`);
}

/* ── 3. LES SIÈGES NE DISPARAISSENT PAS ─────────────────────────────────────
   Un siège perdu, c'est un engagement qui sort du pot sans que rien ne le
   dise. Hero et le Vilain doivent toujours figurer dans l'anneau retenu. */
{
  const s9 = preflopSeats({ nplayers: 6, hero: "MP", villain: "BB" });
  ok(s9.includes("MP") && s9.includes("BB"), "une position hors format est conservée, pas ignorée");
  ok(s9.indexOf("MP") < s9.indexOf("CO"), "…et elle garde sa place dans l'ordre d'action");
  const s6 = preflopSeats({ nplayers: 6, hero: "BTN", villain: "BB" });
  ok(s6.join(",") === POSITIONS_BY_SIZE[6].join(","), "un spot 6-max garde l'anneau 6-max");
}

/* ── 4. LES RÔLES ONT UN ORDRE, ET C'EST LE VILAIN QUI SE DÉPLACE ───────────
   « CO vs 3-bet HJ » demande une main qui n'existe pas : le HJ a déjà parlé
   quand le CO ouvre. Avant correction, la table montrait le vilain à la fois
   couché ET 3-betteur, et ses jetons peuplaient un pot que personne n'avait
   construit. Le Trainer étant hero-centric, on ne déplace jamais Hero. */
{
  ok(!preflopRoleOk({ kind: "vs3bet", hero: "CO", villain: "HJ", seats: POSITIONS_BY_SIZE[6] }), "un 3-betteur ne peut pas parler avant l'ouvreur");
  ok(preflopRoleOk({ kind: "vs3bet", hero: "CO", villain: "BB", seats: POSITIONS_BY_SIZE[6] }), "…mais après, oui");
  ok(!preflopRoleOk({ kind: "vsOpen", hero: "UTG", villain: "BB", seats: POSITIONS_BY_SIZE[6] }), "UTG parle en premier : il n'affronte aucune ouverture");
  ok(!preflopRoleOk({ kind: "squeeze", hero: "BB", villain: "BTN", seats: POSITIONS_BY_SIZE[6] }), "sans siège non-blindé entre l'ouvreur et Hero, il n'y a personne à squeezer");

  const r = resolvePreflopRoles({ kind: "vs3bet", hero: "CO", villain: "HJ" });
  ok(r.ok && r.repaired, "une combinaison impossible est réparée");
  ok(r.hero === "CO", "Hero ne bouge jamais : sa position est le sujet de l'exercice");
  ok(preflopRoleOk({ kind: "vs3bet", hero: r.hero, villain: r.villain, seats: r.seats }), "…et la réparation est jouable");

  const sq = resolvePreflopRoles({ kind: "squeeze", hero: "BB", villain: "BTN" });
  ok(sq.ok && preflopRoleOk({ kind: "squeeze", hero: "BB", villain: sq.villain, seats: sq.seats }), "un squeeze impossible recule l'ouverture");
  const impossible = resolvePreflopRoles({ kind: "vsOpen", hero: "UTG", villain: "BB" });
  ok(!impossible.ok, "quand aucun siège ne peut tenir le rôle, on le dit plutôt que d'inventer");
}

/* ── 5. CE QUE LA TABLE PEINT — UN SEUL TAS PAR JOUEUR ──────────────────────
   La blinde postée n'est pas un jeton en plus : c'est le début de l'engagement.
   Un SB qui ouvre à 2.5 montre 2.5, pas « 0.5 + 2.5 ». */
{
  const line = buildPreflopLine({ street: "Preflop", cat: "Vs Open", hpos: "BB", vpos: "SB", toCall: 2 });
  const peint = paintedPreflopAmounts(line);
  const sb = peint.find(c => c.pos === "SB");
  near(sb.amount, 3, "le SB ouvreur montre son engagement, pas sa blinde");
  ok(sb.source === "mise", "…et c'est bien une mise");
  const bb = peint.find(c => c.pos === "BB");
  near(bb.amount, 1, "la BB qui n'a pas encore parlé montre sa blinde");
  ok(bb.source === "blinde", "…et c'est bien un marqueur de blinde");
  ok(peint.every(c => c.amount > 0), "aucun tas vide n'est peint");
  ok(peint.length === 2, "les sièges couchés sans blinde ne peignent rien");

  /* Les blindes MORTES restent peintes : de l'argent qui n'appartient plus à
     personne, mais qui est dans le pot. Les effacer casserait la somme. */
  const dead = buildPreflopLine({ street: "Preflop", cat: "Vs 3-bet", hpos: "BTN", vpos: "BB", toCall: 6.5 });
  ok(paintedPreflopAmounts(dead).some(c => c.pos === "SB" && c.source === "blinde"), "la blinde d'un joueur couché reste visible");
  near(paintedPreflopTotal(dead), dead.pot, "…parce que sans elle la somme ne tombe plus");
}

/* ── 6. NON-RÉGRESSION DES DEUX FORMULES CORRIGÉES ──────────────────────────
   Les chiffres viennent des mesures écran de la mission. La ligne doit les
   retrouver toute seule — et rester d'accord avec `preflopPot`. */
{
  const defense = buildPreflopLine({ street: "Preflop", cat: "Vs Open", hpos: "BB", vpos: "BTN", toCall: 1.5 });
  near(defense.pot, 4, "défense de blinde vs BTN : 4bb (l'ancienne formule rendait 5)");
  near(defense.pot, preflopPot({ commitments: { BTN: 2.5, BB: 1 }, deadBlinds: { SB: 0.5 } }), "la ligne et preflopPot disent la même chose");

  const vs3 = buildPreflopLine({ street: "Preflop", cat: "Vs 3-bet", hpos: "BTN", vpos: "BB", toCall: 5 });
  near(vs3.pot, 10.5, "face à un 3-bet de la BB : 10.5bb (l'ancienne formule rendait 11.5)");
  near(vs3.pot, preflopPot({ commitments: { BTN: 2.5, BB: 7.5 }, deadBlinds: { SB: 0.5 } }), "idem côté 3-bet");

  const bvb = buildPreflopLine({ street: "Preflop", cat: "Vs Open", hpos: "BB", vpos: "SB", toCall: 2 });
  near(bvb.pot, 4, "blind vs blind : le cas vu à l'écran à 7.5bb");
}

/* ── 7. LES SPOTS STATIQUES ─────────────────────────────────────────────────
   Six des dix-sept spots préflop du catalogue portaient un pot faux, écrit à la
   main. Ils sont servis tels quels au joueur : leur pot alimente les cotes du
   pot et le SPR affichés. */
{
  const preflop = SPOTS.filter(s => /^pre/i.test(s.street || ""));
  ok(preflop.length >= 15, `le catalogue préflop est bien celui qu'on croit (${preflop.length} spots)`);
  for (const s of preflop) {
    const line = buildPreflopLine(s);
    ok(!!line, `spot statique ${s.id} : la ligne se construit`);
    if (!line) continue;
    ok(line.errors.length === 0, `spot statique ${s.id} : séquence jouable (${line.errors.join(", ")})`);
    near(paintedPreflopTotal(line), s.pot, `spot statique ${s.id} : pot annoncé = jetons peints`);
    if (s.toCall > 0) near(line.toCall, s.toCall, `spot statique ${s.id} : Hero paie ce qui est annoncé`);
  }
}

/* ── 8. LES SPOTS DU MOTEUR IA ──────────────────────────────────────────────
   Ceux-là écrivaient `pot: 13.5` et `pot: 36` en dur, quelles que soient les
   positions tirées — alors que la blinde morte vaut 0.5bb si le vilain est BB,
   1bb s'il est SB et 1.5bb si les deux se couchent. On force toutes les paires
   de positions, y compris celles qu'un filtre en langage naturel peut demander
   (« UTG vs HJ ») et que le moteur n'aurait jamais tirées seul. */
{
  const seats = POSITIONS_BY_SIZE[6];
  let testes = 0, faux = 0, impossibles = 0;
  for (const hero of seats) for (const villain of seats) {
    if (hero === villain) continue;
    for (let k = 0; k < 12; k++) {
      const spot = SpotGenerationEngine.generateSpot({ heroPosition: hero, villainPosition: villain });
      if (!spot || !/^pre/i.test(spot.street || "")) continue;
      testes++;
      const line = spot.line || buildPreflopLine(spot);
      if (!line) { faux++; continue; }
      if (Math.abs(paintedPreflopTotal(line) - spot.pot) > 0.011) faux++;
      if (line.errors.length) impossibles++;
    }
  }
  ok(testes > 150, `assez de spots IA préflop éprouvés (${testes})`);
  ok(faux === 0, `aucun pot IA irreconstructible (${faux} sur ${testes})`);
  ok(impossibles === 0, `aucune séquence IA impossible (${impossibles} sur ${testes})`);
  ok(SpotGenerationEngine.generateSpot({ heroPosition: "CO", villainPosition: "HJ" }).hpos === "CO",
    "un filtre de position garde la position de Hero, même quand le vilain doit bouger");
}

/* ── 9. UNE MAIN IMPORTÉE DEVIENT UN EXERCICE JOUABLE ───────────────────────
   Le Replayer transforme une main réelle en spot. Son pot était calculé par une
   formule (`toCall*2 + 1.5`) : sur la table, il ne correspondait à rien. */
{
  const spot = createTrainingSpotFromHand({ heroPos: "BB", vpos: "CO", street: "Preflop", toCall: 2, pot: 99 });
  const line = spot.line || buildPreflopLine(spot);
  near(paintedPreflopTotal(line), spot.pot, "main importée : le pot redevient une somme");
  ok(spot.pot !== 99, "…et le pot annoncé par l'import ne survit pas s'il ne se reconstruit pas");
}

/* ── 10. attachPreflopLine NE TOUCHE PAS AU POSTFLOP ────────────────────────
   L'égalité ne tient qu'au préflop : postflop, les streets précédentes sont
   déjà collectées au centre et n'appartiennent plus à personne. */
{
  const flop = attachPreflopLine({ street: "Flop", cat: "Flop", hpos: "BTN", vpos: "BB", pot: 7, toCall: 0, board: [1, 2, 3] });
  near(flop.pot, 7, "un spot postflop garde son pot");
  ok(!flop.line, "…et ne reçoit pas de ligne préflop");

  const idem = attachPreflopLine({ street: "Preflop", cat: "Vs Open", hpos: "BB", vpos: "CO", toCall: 2, pot: 0 });
  const deuxFois = attachPreflopLine({ ...idem });
  near(deuxFois.pot, idem.pot, "attacher deux fois la ligne ne change rien (idempotence)");
}

/* ── 11. LA NATURE DU SPOT SE LIT COMME LA TABLE LA LIT ─────────────────────
   `preflopKind` doit trancher exactement comme le rendu, sinon la ligne
   raconterait une histoire et la table en peindrait une autre. */
{
  ok(preflopKind({ cat: "RFI", toCall: 0 }) === "rfi", "toCall nul : Hero ouvre le pot");
  ok(preflopKind({ cat: "ICM", toCall: 0 }) === "rfi", "un push/fold est un first-in");
  ok(preflopKind({ cat: "Vs Open", toCall: 2 }) === "vsOpen", "une défense face à une ouverture");
  ok(preflopKind({ cat: "Vs Open", toCall: 2, multiway: [{ pos: "BTN" }] }) === "squeeze", "un suiveur déclaré fait le squeeze");
  ok(preflopKind({ cat: "Vs Open", toCall: 2, desc: "Squeeze vs CO" }) === "squeeze", "…le libellé aussi");
  ok(preflopKind({ cat: "Vs 3-bet", toCall: 6 }) === "vs3bet", "face à un 3-bet");
  ok(preflopKind({ cat: "Vs 4-bet", toCall: 18 }) === "vs4bet", "face à un 4-bet");
}

/* ── 12. LES BLINDES SONT UNE RÈGLE, PAS UN RÉGLAGE ─────────────────────────*/
{
  near(PREFLOP_BLINDS.SB, 0.5, "SB = 0.5bb");
  near(PREFLOP_BLINDS.BB, 1, "BB = 1bb");
  near(blindOf("BTN"), 0, "un siège sans blinde n'engage rien à la donne");
}

if (fails.length) {
  console.error(`\n❌ ligne préflop — ${fails.length} échec(s) sur ${n} assertions :`);
  fails.forEach(f => console.error("   · " + f));
  process.exit(1);
}
console.log(`✅ ligne préflop (§3/§24/§37) — ${n} assertions OK`);
console.log("   Le pot préflop est une somme reconstructible depuis la table,");
console.log("   pour les trois fabriques de spots et toutes les positions.");
