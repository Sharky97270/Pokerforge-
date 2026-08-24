/* ══════════════════════════════════════════════════════════════════════════
   test-pot-distribution — C8 : POT PRINCIPAL, SIDE POTS ET JETON INDIVISIBLE

   Le moteur savait verser un pot à deux joueurs. Dès qu'un troisième est à
   tapis pour un montant différent, un seul pot ne suffit plus : un joueur à
   tapis pour 5bb ne peut pas remporter les 40bb que deux autres se sont
   disputés au-dessus de lui. Le Trainer « bloquait » ces configurations par
   construction — c'est-à-dire sans le dire, et sans savoir les calculer.

   Ce fichier verrouille la règle pour N joueurs :
     ① découpage par paliers, du plus petit tapis au plus grand ;
     ② un joueur couché alimente les pots mais n'en dispute aucun ;
     ③ la portion non suivie revient à son propriétaire, jamais au pot ;
     ④ à égalité le pot se partage, et le demi-blind indivisible va à l'OOP ;
     ⑤ rien ne se perd, rien ne se crée : Σ versements == Σ engagements.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  buildPots, distributePots, partager, auditDistribution,
  potDistributionSupport, auditPlausibility, roundChip, CHIP_UNIT,
} from "./src/potDistribution.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 0.011) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

const conserve = (r, m) => { eq(auditDistribution(r), [], m); };
const somme = o => roundChip(Object.values(o).reduce((a, v) => a + v, 0));

/* ── 1. Heads-up : un seul palier, aucun side pot ───────────────────────── */
{
  const { pots, uncalled } = buildPots({ hero: 20, villain: 20 });
  eq(pots.length, 1, "deux tapis égaux → un seul pot");
  near(pots[0].montant, 40, "le pot vaut la somme des engagements");
  eq(pots[0].disputePar.sort(), ["hero", "villain"], "les deux le disputent");
  eq(uncalled, null, "rien de non suivi");
}

/* ── 2. La mise non suivie n'entre dans aucun pot ───────────────────────── */
{
  /* Hero mise 40, le Vilain n'a que 5 : 35 n'ont été suivis par personne. */
  const { pots, uncalled } = buildPots({ hero: 40, villain: 5 });
  eq(uncalled.joueur, "hero", "l'excédent revient à Hero");
  near(uncalled.montant, 35, "35bb non suivis");
  eq(pots.length, 1, "un seul pot disputé");
  near(pots[0].montant, 10, "le pot disputé vaut 2 × 5bb");
  const r = distributePots({ contributions: { hero: 40, villain: 5 }, ranking: { hero: 0, villain: 1 } });
  near(r.payouts.villain, 10, "le court remporte 10bb, pas 45bb");
  near(r.payouts.hero, 35, "Hero récupère sa mise non suivie");
  near(somme(r.payouts), 45, "conservation");
  conserve(r, "conservation sur mise non suivie");
}

/* ── 3. Trois joueurs, tapis inégaux : un pot principal + un side pot ───── */
{
  /* A à tapis pour 5, B pour 25, C couvre : 5/25/25. */
  const contributions = { A: 5, B: 25, C: 25 };
  const { pots, uncalled } = buildPots(contributions);
  eq(uncalled, null, "B et C se couvrent : rien de non suivi");
  eq(pots.length, 2, "un pot principal + un side pot");
  near(pots[0].montant, 15, "pot principal = 3 × 5bb");
  eq(pots[0].disputePar.sort(), ["A", "B", "C"], "les trois disputent le pot principal");
  near(pots[1].montant, 40, "side pot = 2 × 20bb");
  eq(pots[1].disputePar.sort(), ["B", "C"], "A n'a pas atteint le side pot");

  /* A a la meilleure main : il gagne le principal, pas le side pot. */
  const r = distributePots({ contributions, ranking: { A: 3, B: 2, C: 1 } });
  near(r.payouts.A, 15, "A (le plus court) remporte le pot principal seul");
  near(r.payouts.B, 40, "B remporte le side pot");
  ok(!r.payouts.C, "C ne touche rien");
  near(somme(r.payouts), 55, "conservation : 5 + 25 + 25");
  conserve(r, "conservation à trois joueurs");
  /* Sans side pot, A aurait encaissé 55bb — c'est exactement ce que la règle
     interdit. */
  ok(r.payouts.A < 55, `A ne peut pas encaisser plus que ce qu'il a couvert (${r.payouts.A} < 55)`);
}

/* ── 4. Un joueur couché alimente sans disputer ─────────────────────────── */
{
  const contributions = { A: 10, B: 30, C: 30 };
  const r = distributePots({ contributions, folded: ["A"], ranking: { B: 2, C: 1 } });
  const { pots } = buildPots(contributions, ["A"]);
  eq(pots[0].disputePar.sort(), ["B", "C"], "A a payé le pot principal mais ne le dispute pas");
  near(r.payouts.B, 70, "B remporte les deux pots : 30 + 40");
  ok(!r.payouts.A, "A, couché, ne touche rien");
  near(somme(r.payouts), 70, "conservation");
  conserve(r, "conservation avec un couché");
}

/* ── 5. Trois paliers distincts ─────────────────────────────────────────── */
{
  const contributions = { A: 5, B: 15, C: 40, D: 40 };
  const { pots, uncalled } = buildPots(contributions);
  eq(uncalled, null, "C et D se couvrent");
  eq(pots.length, 3, "trois paliers → trois pots");
  near(pots[0].montant, 20, "principal = 4 × 5");
  near(pots[1].montant, 30, "side 1 = 3 × 10");
  near(pots[2].montant, 50, "side 2 = 2 × 25");
  near(pots[0].montant + pots[1].montant + pots[2].montant, 100, "somme = 5+15+40+40");
  const r = distributePots({ contributions, ranking: { A: 4, B: 3, C: 2, D: 1 } });
  near(r.payouts.A, 20, "A gagne le principal");
  near(r.payouts.B, 30, "B gagne le premier side pot");
  near(r.payouts.C, 50, "C gagne le second");
  near(somme(r.payouts), 100, "conservation sur trois paliers");
  conserve(r, "conservation trois paliers");
}

/* ── 6. Égalité : le pot se partage, le jeton indivisible va à l'OOP ────── */
{
  const r = distributePots({ contributions: { hero: 10, villain: 10 }, ranking: { hero: 1, villain: 1 }, oddChipTo: "villain" });
  near(r.payouts.hero, 10, "moitié / moitié");
  near(r.payouts.villain, 10, "idem");
  conserve(r, "conservation sur un split pair");

  /* Pot impair au demi-blind : 4.5 + 4.5 = 9 ; 9.5 se coupe en 5 / 4.5. */
  eq(partager(9, ["a", "b"], "b"), { b: 4.5, a: 4.5 }, "pot pair : moitié / moitié");
  const impair = partager(9.5, ["a", "b"], "b");
  near(impair.a + impair.b, 9.5, "le partage impair conserve le pot");
  near(impair.b, 5, "le demi-blind indivisible va au destinataire désigné");
  near(impair.a, 4.5, "l'autre reçoit le reste");
  /* Trois gagnants, pot non divisible par 3. */
  const trois = partager(10, ["a", "b", "c"], "c");
  near(trois.a + trois.b + trois.c, 10, "trois parts conservent le pot");
  ok(trois.c >= trois.a && trois.c >= trois.b, "le destinataire désigné reçoit le surplus");
  for (const v of Object.values(trois)) {
    near(Math.round(v / CHIP_UNIT) * CHIP_UNIT, v, "chaque part est un multiple du demi-blind");
  }
}

/* ── 7. Égalité sur un side pot seulement ───────────────────────────────── */
{
  const contributions = { A: 10, B: 30, C: 30 };
  /* B et C à égalité, A moins bon : A perd, B et C partagent les deux pots. */
  const r = distributePots({ contributions, ranking: { A: 1, B: 5, C: 5 }, oddChipTo: "B" });
  near(r.payouts.B + r.payouts.C, 70, "B et C se partagent tout");
  ok(!r.payouts.A, "A ne touche rien");
  near(somme(r.payouts), 70, "conservation");
  conserve(r, "conservation sur égalité de side pot");
}

/* ── 8. Balayage aléatoire : rien ne se perd, rien ne se crée ───────────── */
{
  let seed = 20260824 >>> 0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  let cas = 0, ecarts = 0, avecSidePot = 0, avecUncalled = 0, avecSplit = 0;
  for (let t = 0; t < 3000; t++) {
    const n = 2 + Math.floor(rnd() * 4);            // 2 à 5 joueurs
    const noms = ["A", "B", "C", "D", "E"].slice(0, n);
    const contributions = {};
    for (const j of noms) contributions[j] = roundChip(0.5 + rnd() * 60);
    const folded = noms.filter(() => rnd() < 0.25);
    if (folded.length === noms.length) folded.pop();
    /* Un joueur couché ne peut pas avoir engagé PLUS que tous les joueurs encore
       debout : il aurait été le dernier miseur, et le coup serait fini. On borne
       donc les couchés au maximum des vivants — sinon on mesure une situation
       que le poker ne produit pas. */
    const vivants = noms.filter(j => !folded.includes(j));
    const maxVivant = Math.max(...vivants.map(j => contributions[j]));
    for (const j of folded) contributions[j] = Math.min(contributions[j], maxVivant);
    const ranking = {};
    for (const j of noms) if (!folded.includes(j)) ranking[j] = Math.floor(rnd() * 3);
    const r = distributePots({ contributions, folded, ranking, oddChipTo: noms[0] });
    cas++;
    if (auditDistribution(r).length) ecarts++;
    const engage = roundChip(Object.values(contributions).reduce((a, v) => a + v, 0));
    if (Math.abs(somme(r.payouts) - engage) > 0.011) ecarts++;
    for (const v of Object.values(r.payouts)) if (v < 0) ecarts++;
    /* Aucun joueur ne peut recevoir plus que ce que les autres ont pu couvrir
       au-dessus de son propre engagement. */
    for (const [j, v] of Object.entries(r.payouts)) {
      const plafond = roundChip(Object.entries(contributions)
        .reduce((a, [k, c]) => a + Math.min(c, contributions[j]), 0));
      const nonSuivi = r.uncalled && r.uncalled.joueur === j ? r.uncalled.montant : 0;
      if (v > plafond + nonSuivi + 0.011) ecarts++;
    }
    if (r.pots.length > 1) avecSidePot++;
    if (r.uncalled) avecUncalled++;
    if (r.detail.some(d => d.gagnants.length > 1)) avecSplit++;
  }
  eq(cas, 3000, "3 000 configurations tirées (2 à 5 joueurs)");
  eq(ecarts, 0, "0 écart de conservation, de plafond ou de signe");
  ok(avecSidePot > 200, `${avecSidePot} configurations avec side pot(s)`);
  ok(avecUncalled > 200, `${avecUncalled} configurations avec mise non suivie`);
  ok(avecSplit > 100, `${avecSplit} configurations avec partage`);
}

/* ── 9. Le domaine supporté dit ce qu'il couvre, et ce qu'il ne couvre pas ─
   Ce bloc affirmait « trois joueurs : le coup complet ne se joue pas ». Ce
   n'est plus vrai : le moteur joue N joueurs et les side pots sont exercés
   (voir test-full-hand-multiway). Ce qui reste refusé est une table qui n'en
   est pas une, et une table plus grande que celles que le Trainer propose. */
{
  const hu = potDistributionSupport({ players: ["hero", "villain"], engine: "fullHand" });
  ok(hu.supported, "le heads-up est jouable jusqu'au bout");
  ok(!hu.needsSidePots, "et n'a pas besoin de side pots");
  const trois = potDistributionSupport({ players: ["A", "B", "C"], engine: "fullHand" });
  ok(trois.supported, "trois joueurs : le coup complet se joue désormais");
  ok(trois.needsSidePots, "et la configuration réclame des side pots");
  eq(trois.reason, null, "aucune raison de refus à afficher");
  const neuf = potDistributionSupport({ players: Array.from({ length: 9 }, (_, i) => `p${i}`), engine: "fullHand" });
  ok(neuf.supported, "une table de 9 reste dans le domaine");
  const seul = potDistributionSupport({ players: ["hero"], engine: "fullHand" });
  ok(!seul.supported, "un seul joueur : il n'y a pas de pot à disputer");
  ok(/au moins deux/i.test(seul.reason), `et la raison est dite : « ${seul.reason} »`);
  const dix = potDistributionSupport({ players: Array.from({ length: 10 }, (_, i) => `p${i}`), engine: "fullHand" });
  ok(!dix.supported, "au-delà de 9, la table ne vient pas du produit");
  ok(/n'existe pas/i.test(dix.reason), `et la raison est dite : « ${dix.reason} »`);
  /* Le calcul à trois reste correct — c'est lui qui n'avait jamais été exercé. */
  const r = distributePots({ contributions: { A: 5, B: 25, C: 25 }, ranking: { A: 3, B: 2, C: 1 } });
  eq(auditDistribution(r), [], "la distribution à trois est calculée correctement");
}


/* ── 10. Entrée IMPOSSIBLE : le pot est rendu, jamais égaré ─────────────── */
{
  /* Un joueur couché ayant engagé plus que tous les joueurs debout ne peut pas
     exister au poker. Le module ne doit pas pour autant perdre des jetons : le
     palier que plus personne ne dispute retourne EXACTEMENT à ceux qui l ont
     alimenté. Mesuré avant correction : 4bb crédités à trois joueurs qui
     n avaient rien mis dans ce side pot. */
  const contributions = { A: 10.5, B: 60.5, C: 37.5 };
  const r = distributePots({ contributions, folded: ["B", "C"], ranking: { A: 0 } });
  conserve(r, "conservation malgré une entrée impossible");
  near(somme(r.payouts), 108.5, "la somme versée égale la somme engagée");
  const signaux = auditPlausibility(r);
  ok(signaux.length > 0, "l entrée impossible est SIGNALÉE, pas absorbée en silence");
  eq(signaux[0].code, "pot-sans-pretendant", "et nommée pour ce qu elle est");
  /* Le side pot orphelin (54bb) a été alimenté par B ET C, à 27bb chacun
     au-dessus du tapis de A : il leur est rendu dans ces proportions. */
  const orphelin = r.detail.find(d => d.sansPretendant);
  ok(orphelin, "le pot orphelin figure au détail");
  eq(Object.keys(orphelin.parts).sort(), ["B", "C"], "il est rendu à ses deux contributeurs");
  near(orphelin.parts.B, 27, "B récupère ce qu il y avait mis");
  near(orphelin.parts.C, 27, "C aussi");
  near(orphelin.parts.B + orphelin.parts.C, orphelin.montant, "et la somme rendue égale le pot");
  /* Et un joueur qui n a pas alimenté ce palier ne touche rien de ce palier. */
  ok(!Object.keys(orphelin.parts).includes("A"), "A n a pas atteint ce palier : il n en reçoit rien");
}

console.log(`✅ distribution du pot — side pots et jeton indivisible (C8) — ${passed} assertions OK`);
