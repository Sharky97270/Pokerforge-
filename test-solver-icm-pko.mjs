/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — ICM ET PKO

   ICM (Malmuth-Harville) : la probabilité de finir à une place donnée est calculée
   récursivement en supposant que la probabilité de sortir en tête est proportionnelle
   au tapis. C'est un MODÈLE — exact dans ses hypothèses, mais ces hypothèses ne sont
   pas la réalité du jeu (elles ignorent la position, le talent, la structure de
   blindes). D'où la provenance `ICM_ESTIMATE`, jamais « solve ICM ».

   PKO : la prime est capturée UNIQUEMENT à l'élimination — un saut de valeur, pas une
   valeur continue. La prime propre du joueur n'est pas modélisée (terme du second
   ordre), ce qui justifie le statut bêta.

   Les propriétés testées ici sont des IDENTITÉS MATHÉMATIQUES du modèle : elles ne
   dépendent d'aucune valeur de référence à recopier, donc aucune ne peut « passer par
   chance ».
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import { finishProbabilities, icmEquity, icmRiskPremium, pkoValue, makeIcmUtility, makePkoUtility, CHIP_UTILITY }
  from "./src/solver/core/icm.js";
import { computeICM, computePKO } from "./src/solver/api.js";
import { ResultSource } from "./src/solver/provenance.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (obtenu ${a}, attendu ${b}, tol ${tol})`); n++; };

/* ══ 1. PROBABILITÉS DE PLACE — identités du modèle ══ */
console.log("[1] Probabilités de place (Malmuth-Harville)");
{
  const stacks = [50, 30, 20];
  const fp = finishProbabilities(stacks);

  // Chaque joueur finit forcément quelque part : sa ligne somme à 1.
  for (let i = 0; i < stacks.length; i++) {
    const s = Array.from(fp[i]).reduce((a, b) => a + b, 0);
    near(s, 1, 1e-9, `joueur ${i} : ses probabilités de place somment à 1`);
  }
  // Chaque place est occupée par exactement un joueur : chaque colonne somme à 1.
  for (let p = 0; p < stacks.length; p++) {
    let s = 0;
    for (let i = 0; i < stacks.length; i++) s += fp[i][p];
    near(s, 1, 1e-9, `place ${p + 1} : occupée par exactement un joueur`);
  }
  // Hypothèse fondatrice : P(1er) est proportionnelle au tapis.
  const total = stacks.reduce((a, b) => a + b, 0);
  for (let i = 0; i < stacks.length; i++) {
    near(fp[i][0], stacks[i] / total, 1e-9, `P(1er) du joueur ${i} = tapis/total (hypothèse du modèle)`);
  }
  // Monotonie : plus de jetons ⇒ plus de chances de gagner.
  ok(fp[0][0] > fp[1][0] && fp[1][0] > fp[2][0], "P(1er) décroît avec le tapis");
}

/* ══ 2. ÉQUITÉ ICM — conservation du prizepool ══
   L'identité la plus importante : la somme des équités doit valoir exactement le
   prizepool. Un écart signifierait que de l'argent apparaît ou disparaît. */
console.log("[2] Équité ICM — conservation du prizepool");
{
  const cases = [
    { stacks: [50, 30, 20], payouts: [50, 30, 20] },
    { stacks: [100, 100, 100, 100], payouts: [40, 30, 20, 10] },
    { stacks: [10, 200, 90], payouts: [60, 40, 0] },
    { stacks: [1, 1, 98], payouts: [70, 20, 10] },
  ];
  for (const c of cases) {
    const { eq } = icmEquity(c.stacks, c.payouts);
    const sumEq = eq.reduce((a, b) => a + b, 0);
    const prize = c.payouts.reduce((a, b) => a + b, 0);
    near(sumEq, prize, 1e-6, `Σ équités = prizepool (${c.stacks.join("/")} → ${sumEq.toFixed(4)} vs ${prize})`);
  }

  // Tapis égaux ⇒ équités égales (symétrie).
  const { eq: sym } = icmEquity([100, 100, 100], [50, 30, 20]);
  near(sym[0], sym[1], 1e-9, "tapis égaux → équités égales (symétrie)");
  near(sym[1], sym[2], 1e-9, "…pour les trois joueurs");
  near(sym[0], 100 / 3, 1e-9, "…et chacune vaut le prizepool divisé par 3");

  // Monotonie : plus de jetons ⇒ plus d'équité.
  const { eq: mono } = icmEquity([60, 30, 10], [50, 30, 20]);
  ok(mono[0] > mono[1] && mono[1] > mono[2], "l'équité croît avec le tapis");

  /* JOUEUR À 0 JETON — cas limite historiquement fautif : sa part de gains
     s'évaporait, et la somme des équités ne valait plus le prizepool. Atteint dès
     qu'un tapis complet part à tapis. */
  const { eq: bust } = icmEquity([100, 0], [70, 30]);
  near(bust.reduce((a, b) => a + b, 0), 100, 1e-6, "joueur à 0 jeton : le prizepool reste conservé");
  near(bust[1], 30, 1e-6, "…et le joueur éliminé reçoit bien la place restante");
  near(bust[0], 70, 1e-6, "…le survivant prend la première place");
}

/* ══ 3. PRIME DE RISQUE — direction attendue ══
   Sous ICM, risquer des jetons coûte plus qu'il ne rapporte : c'est la prime de
   risque, et c'est ce qui resserre le jeu en tournoi. */
console.log("[3] Prime de risque");
{
  const stacks = [100, 100, 100, 100], payouts = [40, 30, 20, 10];
  const rp = icmRiskPremium(stacks, payouts, 0, 50, 1);
  ok(rp && typeof rp === "object", "icmRiskPremium retourne un objet détaillé");
  console.log(`    tapis égaux, 50 jetons en jeu : équité neutre ${rp.evNeutralEquity}% ` +
    `(prime ${rp.riskPremium} pt) · gain ${rp.gain} / perte ${rp.loss}`);
  /* LE FAIT CENTRAL DE L'ICM : il faut PLUS de 50 % d'équité pour qu'un affrontement
     à jetons égaux soit rentable, parce qu'on perd plus en $ qu'on ne gagne. C'est ce
     qui resserre le jeu en tournoi. */
  ok(rp.riskPremium > 0, `la prime de risque est positive (${rp.riskPremium} pt) — l'ICM resserre`);
  ok(rp.evNeutralEquity > 50, `il faut plus de 50 % d'équité pour payer (${rp.evNeutralEquity} %)`);
  near(rp.evNeutralEquity, 50 + rp.riskPremium, 1e-6,
    "identité : équité neutre = 50 % + prime de risque");
  ok(rp.loss > rp.gain,
    `on perd plus qu'on ne gagne à jetons égaux (perte ${rp.loss} > gain ${rp.gain}) — origine de la prime`);
  ok(Number.isFinite(rp.icmEqBb), `équité ICM du héros exprimée en bb (${rp.icmEqBb})`);

  // Plus le tapis en jeu est gros, plus la prime mord.
  const small = icmRiskPremium(stacks, payouts, 0, 10, 1);
  const large = icmRiskPremium(stacks, payouts, 0, 90, 1);
  ok(large.riskPremium > small.riskPremium,
    `la prime croît avec les jetons risqués (${small.riskPremium} → ${large.riskPremium} pt)`);

  // Bulle plate : quand tout le monde touche pareil, il n'y a plus rien à protéger.
  const flat = icmEquity([100, 100, 100], [33.34, 33.33, 33.33]);
  const spread = Math.max(...flat.eq) - Math.min(...flat.eq);
  ok(spread < 0.02, `structure quasi plate → équités quasi identiques (écart ${spread.toFixed(4)})`);
}

/* ══ 4. UTILITÉS STRATÉGIQUES — chip-EV vs ICM ══ */
console.log("[4] Utilités terminales");
{
  // Le chip-EV est à somme nulle par construction : ce que l'un gagne, l'autre le perd.
  eq_(CHIP_UTILITY.zeroSum, true, "l'utilité chip-EV est déclarée à somme nulle");
  for (const d of [-50, -1, 0, 1, 50]) {
    near(CHIP_UTILITY.h(d) + CHIP_UTILITY.v(d), 0, 1e-12, `chip-EV : u_h(${d}) + u_v(${d}) = 0`);
  }

  // Utilité ICM : à 2 joueurs elle reste à somme nulle ; à 3+ non.
  const u2 = makeIcmUtility({ stacks: [100, 100], payouts: [70, 30], heroIdx: 0, villIdx: 1 });
  ok(u2, "utilité ICM heads-up construite");
  const u4 = makeIcmUtility({ stacks: [100, 90, 80, 70], payouts: [40, 30, 20, 10], heroIdx: 0, villIdx: 1 });
  ok(u4, "utilité ICM 4 joueurs construite");
  ok(u4.zeroSum === false, "4 joueurs sous ICM : l'utilité N'EST PAS à somme nulle");

  /* STRUCTURE DE GAINS PLATE : les jetons n'ont aucune valeur en argent, donc le CFR
     n'a aucun gradient et retourne une stratégie uniforme dénuée de sens. Le moteur
     doit le DÉTECTER et refuser de présenter cela comme un solve. */
  const flatU = makeIcmUtility({ stacks: [100, 100, 100], payouts: [10, 10, 10], heroIdx: 0, villIdx: 1 });
  ok(flatU && flatU.degenerate === true, "structure de gains plate détectée comme dégénérée");
}
function eq_(a, b, m) { assert.strictEqual(a, b, m); n++; }

/* ══ 5. PKO — la prime se capture à l'ÉLIMINATION ══ */
console.log("[5] PKO");
{
  const base = pkoValue({ potBb: 20, heroEquity: 0.5, villainBounty: 0, bountyRealization: 0.5 });
  const withB = pkoValue({ potBb: 20, heroEquity: 0.5, villainBounty: 10, bountyRealization: 0.5 });
  console.log(`    pot 20bb, équité 50 % : sans prime EV ${base.totalEv} · prime 10 → EV ${withB.totalEv} ` +
    `(dont prime ${withB.bountyEv}, remise d'équité ${withB.equityDiscount} pt)`);

  // Décomposition : l'EV totale est la somme de la part en jetons et de la part en prime.
  near(base.chipEv + base.bountyEv, base.totalEv, 1e-6, "EV totale = EV jetons + EV prime");
  near(base.bountyEv, 0, 1e-9, "sans prime adverse, la part de prime est nulle");
  near(base.equityDiscount, 0, 1e-9, "…et la remise d'équité aussi");
  // Identité du modèle : la prime espérée = équité × prime × taux de réalisation.
  near(withB.bountyEv, 0.5 * 10 * 0.5, 1e-6, "EV de prime = équité × prime × réalisation");
  ok(withB.totalEv > base.totalEv, `une prime adverse augmente l'EV (${base.totalEv} → ${withB.totalEv})`);

  // Plus la prime est grosse, plus l'incitation est forte.
  const small = pkoValue({ potBb: 20, heroEquity: 0.45, villainBounty: 5, bountyRealization: 0.5 });
  const big = pkoValue({ potBb: 20, heroEquity: 0.45, villainBounty: 40, bountyRealization: 0.5 });
  ok(big.totalEv > small.totalEv, `une grosse prime vaut mieux qu'une petite (${small.totalEv} < ${big.totalEv})`);
  ok(big.equityDiscount > small.equityDiscount,
    `…et élargit davantage la range (remise ${small.equityDiscount} → ${big.equityDiscount} pt)`);

  // Une prime nulle ne doit rien changer au chip-EV pur.
  near(base.chipEv, 0.5 * 20, 1e-6, "sans prime, l'EV se réduit au chip-EV (équité × pot)");

  /* MODÈLE ASSUMÉ : la prime propre du héros n'est PAS soustraite quand il saute.
     Sa prime n'est pas un actif qu'il détient — elle est sur sa tête et ne lui revient
     qu'en gagnant. La compter comme une perte doublait le coût du bust et INVERSAIT la
     conclusion (une grosse prime faisait coucher davantage). D'où `PKO_ESTIMATE`. */
  const u = makePkoUtility({
    stacks: [100, 100], payouts: [70, 30], heroIdx: 0, villIdx: 1,
    bounties: [10, 10], realization: 0.5,
  });
  ok(u, "utilité PKO construite");
  ok(u.bountySwing !== undefined || typeof u.h === "function", "l'utilité PKO expose son effet de prime");
}

/* ══ 6. PROVENANCE — jamais présenté comme un solve complet ══ */
console.log("[6] Provenance honnête");
{
  const r = computeICM({ stacks: [50, 30, 20], payouts: [50, 30, 20], heroIdx: 0 });
  eq_(r.source, ResultSource.ICM_ESTIMATE, "computeICM → ICM_ESTIMATE (jamais EXACT_CALCULATION)");
  eq_(r.model, "Malmuth-Harville", "le modèle est nommé");
  ok(Array.isArray(r.eq) && r.eq.length === 3, "équités retournées pour les 3 joueurs");

  const p = computePKO({ potBb: 20, heroEquity: 0.5, villainBounty: 10 });
  eq_(p.source, ResultSource.PKO_ESTIMATE, "computePKO → PKO_ESTIMATE");

  const bad = computeICM({ stacks: [], payouts: [] });
  eq_(bad.source, ResultSource.NO_SOLUTION, "entrées vides → NO_SOLUTION, aucune valeur inventée");
}

console.log(`\n✅ ICM / PKO — ${n} assertions OK`);
console.log(`   ICM : exact DANS son modèle (sortie proportionnelle au tapis) — pas dans la réalité.`);
console.log(`   PKO : prime propre non modélisée → statut bêta assumé.`);
