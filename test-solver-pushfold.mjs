/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — PUSH/FOLD PRÉFLOP (comble le trou prioritaire de la matrice)

   POURQUOI PAS UN SECOND SOLVEUR.
   `solvePushFold` résout par fictitious play. Réécrire un fictitious play donnerait
   une « référence » partageant l'algorithme, donc ses éventuels biais — une preuve
   circulaire. Pour certifier un ÉQUILIBRE, la bonne méthode n'est pas de le
   recalculer mais de VÉRIFIER qu'aucune déviation n'est profitable, avec une fonction
   de gain écrite séparément.

   CE QUI EST CERTIFIÉ ICI : la logique de résolution du jeu (gains, pondération par
   card removal, condition d'équilibre).
   CE QUI NE L'EST PAS : la matrice d'équité préflop `preflopEquity.js`, artefact de
   données avec son propre bruit documenté (±0,26 pt en moyenne). Mon calcul
   indépendant la consomme aussi — un biais de la matrice serait invisible ici et doit
   être traité séparément.

   MODÈLE (heads-up, blindes 0,5 / 1, tapis effectif S) :
     SB couche            → −0,5
     SB jam, BB couche    → +1
     SB jam, BB paie      → S·(2·eq − 1)
     BB face au jam       : coucher −1 · payer S·(2·eq_bb − 1)
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import { solvePushFold, pfEquity, PF_HANDS, pfExploitability, pfRangePct, pfToFreqs }
  from "./src/solver/core/pushfold.js";
import { comboCardsInt } from "./src/solver/core/combos.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (obtenu ${a}, attendu ${b}, tol ${tol})`); n++; };

const N = PF_HANDS.length;
const idxOf = h => PF_HANDS.indexOf(h);

/* ══════════════════════════════════════════════════════════════════════════
   PONDÉRATION PAR CARD REMOVAL — calculée indépendamment.
   Poids de la confrontation (i, j) = nombre de couples de combos DISJOINTS.
   Un simple produit des nombres de combos surestimerait les recouvrements (AA vs AA
   en est le cas extrême : 6×6 = 36 couples, mais seulement 0 sont disjoints… en
   réalité 6·5/2·… — d'où le comptage explicite plutôt qu'une formule.)
════════════════════════════════════════════════════════════════════════════ */
let _W = null;
function refWeights() {
  if (_W) return _W;
  const combos = PF_HANDS.map(h => comboCardsInt(h));
  _W = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let count = 0;
      for (const a of combos[i]) for (const b of combos[j]) {
        if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) count++;
      }
      _W[i][j] = count; _W[j][i] = count;
    }
  }
  return _W;
}
function refComboCounts() {
  return PF_HANDS.map(h => comboCardsInt(h).length);
}

/* ── GAINS, écrits depuis le modèle (indépendamment de l'implémentation) ── */
/** EV de SB s'il jam la main i, face à la range de call du BB. */
function refSbJamEV(i, bbCall, S) {
  const W = refWeights();
  let wCall = 0, wFold = 0, evCall = 0;
  for (let j = 0; j < N; j++) {
    const w = W[i][j];
    if (w <= 0) continue;
    const c = bbCall[j];
    wCall += w * c;
    wFold += w * (1 - c);
    if (c > 0) {
      const eq = pfEquity(i, j) / 100;          // équité de SB dans l'affrontement
      evCall += w * c * (S * (2 * eq - 1));
    }
  }
  const tot = wCall + wFold;
  return tot ? (wFold * 1 + evCall) / tot : 1;  // BB couche → +1
}
/** EV de BB s'il paie le jam avec la main j, face à la range de jam du SB. */
function refBbCallEV(j, sbJam, S) {
  const W = refWeights();
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) {
    const w = sbJam[i] * W[j][i];
    if (w <= 0) continue;
    const eqBB = (100 - pfEquity(i, j)) / 100;  // équité de BB = complément
    num += w * (S * (2 * eqBB - 1));
    den += w;
  }
  return den ? num / den : 0;
}

/* Exploitabilité calculée avec MES fonctions de gain : gain qu'obtiendrait chaque
   camp en déviant vers sa meilleure réponse. Deux valeurs ≈ 0 ⟺ équilibre. */
function refExploitability(sbJam, bbCall, S) {
  const nc = refComboCounts();
  let cur = 0, best = 0, wtot = 0;
  for (let i = 0; i < N; i++) {
    const w = nc[i], ev = refSbJamEV(i, bbCall, S);
    cur += w * (sbJam[i] * ev + (1 - sbJam[i]) * -0.5);   // −0,5 = coucher la SB
    best += w * Math.max(ev, -0.5);
    wtot += w;
  }
  let curB = 0, bestB = 0, wB = 0;
  for (let j = 0; j < N; j++) {
    const w = nc[j], ev = refBbCallEV(j, sbJam, S);
    curB += w * (bbCall[j] * ev + (1 - bbCall[j]) * -1);  // −1 = coucher la BB
    bestB += w * Math.max(ev, -1);
    wB += w;
  }
  return { sbGain: (best - cur) / wtot, bbGain: (bestB - curB) / wB };
}

/* ══ 1. PONDÉRATION — la mienne doit reproduire celle du moteur ══ */
console.log("[1] Card removal — pondération recalculée indépendamment");
{
  const W = refWeights();
  // AA contre AA : 6 combos chacun, mais tout couple partage forcément une carte ?
  // Non : {A♠A♥} et {A♦A♣} sont disjoints. Comptage explicite attendu = 6·6 − (couples
  // partageant au moins une carte). On vérifie la valeur par un calcul direct.
  const aa = idxOf("AA");
  let direct = 0;
  const cs = comboCardsInt("AA");
  for (const a of cs) for (const b of cs) {
    if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) direct++;
  }
  near(W[aa][aa], direct, 0, `AA vs AA : ${direct} couples de combos disjoints`);
  ok(direct < 36, "…soit strictement moins que 6×6 — le recouvrement est bien retiré");

  const ak = idxOf("AKo");
  ok(W[aa][ak] > 0 && W[aa][ak] < 6 * 12, "AA vs AKo : recouvrement partiel pris en compte");
  // Symétrie de la pondération.
  let asym = 0;
  for (let i = 0; i < N; i += 7) for (let j = 0; j < N; j += 11) if (W[i][j] !== W[j][i]) asym++;
  near(asym, 0, 0, "la pondération est symétrique");
}

/* ══ 2. ÉQUILIBRE — aucune déviation profitable (vérification indépendante) ══
   C'est LA propriété qui définit un équilibre de Nash. Elle est vérifiée ici avec des
   fonctions de gain écrites séparément de celles du moteur. */
console.log("[2] Condition d'équilibre — exploitabilité mesurée indépendamment");
{
  const stacks = [8, 12, 15, 20];
  for (const S of stacks) {
    const sol = solvePushFold(S, { iters: 1500 });
    const mine = refExploitability(sol.sbJam, sol.bbCall, S);
    const theirs = pfExploitability(sol.sbJam, sol.bbCall, S);
    console.log(`    ${String(S).padStart(2)}bb · exploitabilité indépendante SB ${mine.sbGain.toFixed(5)} / BB ${mine.bbGain.toFixed(5)}` +
      ` · moteur SB ${theirs.sbGain.toFixed(5)} / BB ${theirs.bbGain.toFixed(5)}`);
    ok(mine.sbGain >= -1e-9, `${S}bb : le gain de déviation SB est positif ou nul (définition)`);
    ok(mine.bbGain >= -1e-9, `${S}bb : idem côté BB`);
    ok(mine.sbGain < 0.02, `${S}bb : SB ne peut quasiment pas améliorer (${mine.sbGain.toFixed(5)} bb)`);
    ok(mine.bbGain < 0.02, `${S}bb : BB ne peut quasiment pas améliorer (${mine.bbGain.toFixed(5)} bb)`);
    // Les deux mesures indépendantes doivent concorder.
    near(mine.sbGain, theirs.sbGain, 1e-6, `${S}bb : exploitabilité SB identique aux deux calculs`);
    near(mine.bbGain, theirs.bbGain, 1e-6, `${S}bb : exploitabilité BB identique aux deux calculs`);
  }
}

/* ══ 3. STRUCTURE DE SEUIL — chaque main est du bon côté de sa frontière ══
   À l'équilibre, une main jammée doit avoir EV(jam) ≥ EV(fold), et une main couchée
   l'inverse. C'est une vérification main par main, plus fine qu'une moyenne : une
   erreur locale sur quelques mains se noierait dans l'exploitabilité agrégée. */
console.log("[3] Structure de seuil — cohérence main par main");
{
  const S = 12;
  const sol = solvePushFold(S, { iters: 1500 });
  let violations = 0, checked = 0;
  for (let i = 0; i < N; i++) {
    const ev = refSbJamEV(i, sol.bbCall, S);
    const f = sol.sbJam[i];
    if (f > 0.98 && ev < -0.5 - 1e-3) violations++;      // jammée alors que fold est mieux
    if (f < 0.02 && ev > -0.5 + 1e-3) violations++;      // couchée alors que jam est mieux
    checked++;
  }
  near(violations, 0, 0, `SB : ${checked} mains vérifiées, 0 du mauvais côté du seuil`);

  let vBB = 0;
  for (let j = 0; j < N; j++) {
    const ev = refBbCallEV(j, sol.sbJam, S);
    const f = sol.bbCall[j];
    if (f > 0.98 && ev < -1 - 1e-3) vBB++;
    if (f < 0.02 && ev > -1 + 1e-3) vBB++;
  }
  near(vBB, 0, 0, `BB : 0 main du mauvais côté du seuil`);
}

/* ══ 4. ANCRAGES DE BON SENS — vérifiables sans solveur ══ */
console.log("[4] Ancrages qualitatifs");
{
  const sol = solvePushFold(12, { iters: 1500 });
  const g = h => sol.sbJam[idxOf(h)];
  const c = h => sol.bbCall[idxOf(h)];
  ok(g("AA") > 0.99, `AA jam toujours (${(g("AA") * 100).toFixed(1)}%)`);
  ok(g("KK") > 0.99, `KK jam toujours (${(g("KK") * 100).toFixed(1)}%)`);
  ok(g("72o") < 0.05, `72o ne jam jamais à 12bb (${(g("72o") * 100).toFixed(1)}%)`);
  ok(c("AA") > 0.99, `BB paie toujours avec AA (${(c("AA") * 100).toFixed(1)}%)`);
  ok(c("72o") < 0.05, `BB ne paie jamais avec 72o (${(c("72o") * 100).toFixed(1)}%)`);
  /* ⚠ L'équilibre push/fold est génériquement en stratégies PURES : à 12bb la range de
     jam couvre 52,6 % des combos, et les mains y sont à 100 % ou à 0 %. Comparer deux
     mains situées du MÊME CÔTÉ du seuil est donc vide de sens (AKs et K7o jamment
     toutes deux à 100 %). On teste la monotonie au sens large, et le strict uniquement
     entre mains séparées par le seuil. */
  ok(g("AKs") >= g("K7o"), `monotonie : AKs (${(g("AKs") * 100).toFixed(0)}%) ≥ K7o (${(g("K7o") * 100).toFixed(0)}%)`);
  ok(g("AKs") > g("32o"), `AKs jam, 32o non (${(g("AKs") * 100).toFixed(0)}% > ${(g("32o") * 100).toFixed(0)}%)`);
  ok(c("AA") >= c("Q8o"), "BB : monotonie AA ≥ Q8o");
  ok(c("AA") > c("72o"), "BB paie AA mais jamais 72o");
  // Le seuil sépare bien la range en deux : peu de mains en fréquence intermédiaire.
  let mixtes = 0;
  for (let i = 0; i < N; i++) if (sol.sbJam[i] > 0.05 && sol.sbJam[i] < 0.95) mixtes++;
  ok(mixtes <= 8, `stratégie quasi pure : seulement ${mixtes} mains en fréquence mixte sur ${N}`);
}

/* ══ 5. MONOTONIE EN TAPIS — plus le tapis est court, plus on jam large ══
   Conséquence directe du modèle : à tapis court les blindes pèsent davantage
   relativement au risque. Une inversion signalerait une erreur de signe. */
console.log("[5] Monotonie : tapis court ⇒ range de jam plus large");
{
  const pcts = [];
  for (const S of [6, 10, 15, 20, 25]) {
    const sol = solvePushFold(S, { iters: 1200 });
    pcts.push({ S, pct: pfRangePct(sol.sbJam), call: pfRangePct(sol.bbCall) });
  }
  console.log("    " + pcts.map(p => `${p.S}bb: jam ${p.pct.toFixed(1)}% / call ${p.call.toFixed(1)}%`).join(" · "));
  for (let i = 0; i < pcts.length - 1; i++) {
    ok(pcts[i].pct >= pcts[i + 1].pct - 1.5,
      `range de jam décroissante ${pcts[i].S}bb (${pcts[i].pct.toFixed(1)}%) ≥ ${pcts[i + 1].S}bb (${pcts[i + 1].pct.toFixed(1)}%)`);
  }
  ok(pcts[0].pct > pcts[pcts.length - 1].pct + 10,
    `écart net entre 6bb (${pcts[0].pct.toFixed(1)}%) et 25bb (${pcts[pcts.length - 1].pct.toFixed(1)}%)`);
}

/* ══ 6. DÉTERMINISME ET FORMAT ══ */
console.log("[6] Déterminisme et conversion de format");
{
  const a = solvePushFold(10, { iters: 800 });
  const b = solvePushFold(10, { iters: 800 });
  let diff = 0;
  for (let i = 0; i < N; i++) if (Math.abs(a.sbJam[i] - b.sbJam[i]) > 1e-12) diff++;
  near(diff, 0, 0, "même tapis + mêmes itérations → solution identique (aucun aléa)");

  const freqs = pfToFreqs(a.sbJam);
  ok(Object.keys(freqs).length === N, `pfToFreqs produit les ${N} classes de mains`);
  const sample = freqs["AA"];
  near(sample.r + sample.f, 100, 0.2, "les fréquences d'une main somment à 100");
  ok(sample.r > 99, "AA : la fréquence de jam est portée par `r` (action agressive)");
}

console.log(`\n✅ push/fold — ${n} assertions OK`);
console.log(`   Certifie la LOGIQUE DE RÉSOLUTION (gains, card removal, équilibre).`);
console.log(`   NE certifie PAS la matrice d'équité preflopEquity.js (bruit ±0,26 pt documenté).`);
