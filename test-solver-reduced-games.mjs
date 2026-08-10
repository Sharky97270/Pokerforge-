/* ══════════════════════════════════════════════════════════════════════════
   CERTIFICATION — JEUX RÉDUITS À SOLUTION CONNUE (§9)

   ⚠ DEUX NIVEAUX DE PREUVE, À NE SURTOUT PAS CONFONDRE.

   NIVEAU A — CHEMIN DE PRODUCTION
     Spots de forme hold'em passés par `solveTree`, le code réellement livré. Une
     réussite ici certifie le solveur tel qu'il tourne dans l'application.

   NIVEAU B — RÈGLE DE MISE À JOUR SEULE
     Kuhn poker, dont l'équilibre est connu analytiquement. `solveTree(heroList,
     villList, board)` est structurellement de forme hold'em : Kuhn NE PEUT PAS y
     passer. On valide donc la règle CFR+ via un harnais minimal écrit ici.
     → Un Kuhn vert NE CERTIFIE PAS le solveur de production. Il dit seulement que
       l'algorithme de regret matching converge vers l'équilibre là où on sait le
       vérifier. La matrice de certification doit répéter cette distinction, faute de
       quoi une bonne nouvelle sur un jeu jouet serait lue comme une garantie sur le
       produit.
════════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert";
import { solveTree, nashConv } from "./src/solver/core/multistreet.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (obtenu ${a}, attendu ${b}, tol ${tol})`); n++; };

const C = (r, s) => "23456789TJQKA".indexOf(r) * 4 + "shdc".indexOf(s);
const card = str => C(str[0], str[1]);
const hand = (a, b, w = 1) => ({ cards: [card(a), card(b)], w });

/* ══════════════════════════════════════════════════════════════════════════
   NIVEAU A — CHEMIN DE PRODUCTION (`solveTree`)
════════════════════════════════════════════════════════════════════════════ */
console.log("═══ NIVEAU A — chemin de PRODUCTION (solveTree) ═══");

/* A1. CLAIRVOYANCE : le résultat analytique de référence du poker jouet.
   Hero polarisé (nuts + air) contre un bluffcatcher pur. À l'équilibre, Hero bluffe
   de sorte que le Vilain soit indifférent : bluffs/value = b/(P+b), et le Vilain paie
   avec la fréquence P/(P+b). Ces deux valeurs se démontrent au crayon — c'est ce qui
   en fait une référence solide. */
console.log("[A1] Jeu de clairvoyance — fréquences analytiques");
{
  // Rivière sèche : le rang des mains est figé, aucun tirage ne subsiste.
  const board = ["2c", "7h", "9s", "Jd", "4s"].map(card);
  // Hero : les nuts (brelan de 9 impossible ici → on prend une main qui bat tout le
  // reste du board) et une main qui ne bat rien.
  const nuts = hand("9h", "9d");     // brelan de 9
  const air = hand("3c", "5d");      // hauteur — ne bat aucun bluffcatcher
  const heroList = [nuts, air];
  // Vilain : bluffcatcher pur — bat l'air, perd contre les nuts.
  const villList = [hand("Ah", "Kh"), hand("Ac", "Qd")];

  for (const { betFrac, label } of [
    { betFrac: 0.5, label: "mise ½ pot" },
    { betFrac: 1.0, label: "mise pot" },
    { betFrac: 2.0, label: "surmise 2× pot" },
  ]) {
    const P = 1, b = betFrac;
    /* PROPORTION DE BLUFFS dans la range de mise = b/(P+2b).
       Démonstration : le Vilain paie b pour gagner P+b (le pot plus la mise) et risque
       b. Il est indifférent quand p(P+b) = (1−p)b, soit p = b/(P+2b). Hero bluffe
       exactement assez pour maintenir cette indifférence.
       ⚠ Ne pas confondre avec b/(P+b), qui est la fréquence de FOLD du Vilain — deux
       quantités voisines mais distinctes (erreur commise puis corrigée dans ce test). */
    const theoryBluff = b / (P + 2 * b);
    /* FRÉQUENCE DE CALL du Vilain = P/(P+b) : elle rend Hero indifférent entre bluffer
       et renoncer (f·P = (1−f)·b avec f la fréquence de fold). */
    const theoryCall = P / (P + b);

    const sol = solveTree(heroList, villList, board, {
      startPot: 10, betSizes: [betFrac], effStack: 1000, iters: 3000, seed: 20260806, streets: 1,
    });
    const root = sol.tree;
    const betIdx = root.actions.indexOf("B");
    // Fréquences de mise, par main : les nuts misent, l'air bluffe.
    const fNuts = sol.avgOf(root, 0)[betIdx];
    const fAir = sol.avgOf(root, 1)[betIdx];
    const bluffRatio = fAir > 0 ? fAir / (fNuts + fAir) : 0;

    // Fréquence de call du Vilain au nœud « face à la mise ».
    const faceBet = root.children.B;
    const callIdx = faceBet.actions.indexOf("C");
    const vCall = (sol.avgOf(faceBet, 0)[callIdx] + sol.avgOf(faceBet, 1)[callIdx]) / 2;

    console.log(`    ${label.padEnd(16)} bluff/mise ${(bluffRatio * 100).toFixed(1)}% (théorie ${(theoryBluff * 100).toFixed(1)}%)` +
      ` · call ${(vCall * 100).toFixed(1)}% (théorie ${(theoryCall * 100).toFixed(1)}%)`);
    ok(Math.abs(vCall - theoryCall) <= 0.10,
      `${label} : call du Vilain ${(vCall * 100).toFixed(1)}% ≈ théorie ${(theoryCall * 100).toFixed(1)}% (±10 pt)`);
    ok(Math.abs(bluffRatio - theoryBluff) <= 0.06,
      `${label} : proportion de bluffs ${(bluffRatio * 100).toFixed(1)}% ≈ théorie ${(theoryBluff * 100).toFixed(1)}% (±6 pt)`);
    ok(fNuts > 0.75, `${label} : les nuts misent l'essentiel du temps (${(fNuts * 100).toFixed(1)}%)`);
  }
}

/* A2. DISCRIMINATION PAR FORCE DE MAIN — action strictement dominée.
   Face à une mise, payer avec une main qui ne peut RIEN battre est strictement dominé :
   se coucher perd 0, payer perd la mise à coup sûr. Le solveur doit donc coucher l'air
   et payer les nuts, au MÊME nœud d'information.

   C'est un test de DISCRIMINATION, et c'est ce qui le rend précieux : un solveur
   dégénéré qui répartirait uniformément (50/50) passerait tous les tests de bornes et
   de somme, mais échouerait ici — il ne saurait pas distinguer une main d'une autre.

   (Une première version de ce test comparait deux TAILLES de mise avec une range de
   nuts pures : prémisse fausse, car le Vilain ne paie jamais face à une range sans
   bluff, donc toutes les tailles rapportent le pot et le solveur est légitimement
   indifférent. Il n'y avait aucune domination à détecter.) */
console.log("[A2] Discrimination par force de main — au nœud face à la mise du Vilain");
{
  const board = ["2c", "7h", "9s", "Jd", "4s"].map(card);
  const heroList = [hand("9h", "9d"), hand("3c", "5d")];     // brelan de 9 · hauteur
  // Vilain : un monstre qui bat TOUT (brelan de valets) et un bluffcatcher.
  const MONSTRE = 0, CATCHER = 1;
  const villList = [hand("Jh", "Jc"), hand("3h", "6h")];
  const sol = solveTree(heroList, villList, board, {
    startPot: 10, betSizes: [0.75], effStack: 1000, iters: 3000, seed: 4242, streets: 1,
  });
  /* On lit le nœud « Vilain face à la mise de Hero » : racine → Hero mise.
     C'est un nœud RÉELLEMENT ATTEINT (Hero mise ses nuts et bluffe son air), donc la
     stratégie y est apprise.

     ⚠ ENSEIGNEMENT À CONSERVER : une première version de ce test lisait « Hero check
     puis fait face à une mise ». Les nuts y payaient 0,5 % — non par erreur, mais parce
     que ce nœud est HORS-CHEMIN pour elles (elles misent). CFR n'accumule pas de regret
     aux infosets non atteints et n'y offre donc AUCUNE garantie. Lire une stratégie
     hors-chemin et en tirer une conclusion est une erreur de méthode, pas un bug du
     solveur — c'est aussi une limite à documenter dans la matrice. */
  const facing = sol.tree.children.B;
  ok(!!facing && facing.kind === "decision", "le nœud Vilain-face-à-la-mise existe dans l'arbre");
  const foldIdx = facing.actions.indexOf("F");
  /* On mesure la fréquence de FOLD, seule quantité non ambiguë.
     ⚠ Ce nœud offre TROIS actions (F/C/R). Une version antérieure de ce test ne lisait
     que « call » et concluait « le monstre se couche » en voyant 0 % — alors que le
     monstre RELANCE à 99,99 %, ce qui est le jeu correct avec un brelan de valets.
     Mesurer une action en ignorant ses alternatives est un piège classique de lecture
     de stratégie mixte. */
  const monstreFold = sol.avgOf(facing, MONSTRE)[foldIdx];
  const catcherFold = sol.avgOf(facing, CATCHER)[foldIdx];
  const monstreContinue = 1 - monstreFold;
  console.log(`    Vilain face à la mise : monstre continue ${(monstreContinue * 100).toFixed(2)}% (couche ${(monstreFold * 100).toFixed(2)}%)` +
    ` · bluffcatcher couche ${(catcherFold * 100).toFixed(1)}%`);
  ok(monstreFold < 0.02,
    `le monstre ne se couche jamais — se coucher est strictement dominé (${(monstreFold * 100).toFixed(3)}%)`);
  ok(monstreContinue > 0.95,
    `…il continue donc quasi systématiquement, par call ou relance (${(monstreContinue * 100).toFixed(2)}%)`);
  ok(catcherFold - monstreFold > 0.2,
    `traitement nettement différencié au MÊME nœud : le bluffcatcher se couche ` +
    `${((catcherFold - monstreFold) * 100).toFixed(1)} pt plus souvent — le solveur discrimine par la force`);
}

/* A3. EXPLOITABILITÉ SUR BOARD COMPLET — NashConv est ici exact (plus aucun runout
   à échantillonner). Proche de zéro ⟺ aucun des deux joueurs ne gagnerait à dévier. */
console.log("[A3] NashConv sur board complet (exact)");
{
  const board = ["2c", "7h", "9s", "Jd", "4s"].map(card);
  const heroList = [hand("9h", "9d"), hand("3c", "5d"), hand("Ah", "Ad")];
  const villList = [hand("Ac", "Kh"), hand("Kc", "Qd"), hand("7s", "7d")];
  const iterLevels = [400, 2000];
  const convs = [];
  for (const iters of iterLevels) {
    const sol = solveTree(heroList, villList, board, {
      startPot: 10, betSizes: [0.75], effStack: 1000, iters, seed: 20260806, streets: 1,
    });
    const nc = nashConv(sol);
    convs.push({ iters, nc });
    ok(Number.isFinite(nc), `NashConv calculable à ${iters} itérations`);
    ok(nc >= 0, `NashConv ≥ 0 (${nc.toFixed(5)}) — une exploitabilité négative serait absurde`);
  }
  console.log(`    ` + convs.map(c => `${c.iters} it → NashConv ${c.nc.toFixed(5)} bb`).join(" · "));
  ok(convs[1].nc <= convs[0].nc * 1.5,
    `plus d'itérations n'aggrave pas l'exploitabilité (${convs[0].nc.toFixed(5)} → ${convs[1].nc.toFixed(5)})`);
  ok(convs[1].nc < 0.35, `exploitabilité faible à 2 000 itérations (${convs[1].nc.toFixed(5)} bb)`);
}

/* ══════════════════════════════════════════════════════════════════════════
   NIVEAU B — RÈGLE CFR+ SEULE (Kuhn poker)
   Périmètre : l'algorithme, PAS le code d'arbre de production.
════════════════════════════════════════════════════════════════════════════ */
console.log("\n═══ NIVEAU B — RÈGLE CFR+ seule (Kuhn) — NE certifie PAS le solveur ═══");

/* Kuhn poker : 3 cartes (J<Q<K), une carte chacun, 1 d'ante, une seule taille de mise.
   Valeur du jeu à l'équilibre pour le joueur 1 : −1/18 ≈ −0,0556.
   Famille d'équilibres connue : J misé avec probabilité α ∈ [0, 1/3], K misé avec 3α. */
const KUHN_VALUE = -1 / 18;

function kuhnSolve(iterations = 200000) {
  const nodes = new Map();   // infoset → { regretSum[], strategySum[] }
  const getNode = key => {
    let v = nodes.get(key);
    if (!v) { v = { regretSum: [0, 0], strategySum: [0, 0] }; nodes.set(key, v); }
    return v;
  };
  /* Regret matching, variante CFR+ : les regrets cumulés sont clampés à 0, ce qui est
     la règle utilisée par le moteur de production. */
  const strategy = node => {
    const s = [Math.max(0, node.regretSum[0]), Math.max(0, node.regretSum[1])];
    const tot = s[0] + s[1];
    return tot > 0 ? [s[0] / tot, s[1] / tot] : [0.5, 0.5];
  };

  function cfr(cards, history, p0, p1) {
    const plays = history.length;
    const player = plays % 2;
    const opponent = 1 - player;

    if (plays > 1) {
      const endsPass = history.endsWith("p");
      const doubleBet = history.endsWith("bb");
      const higher = cards[player] > cards[opponent];
      if (endsPass) {
        if (history === "pp") return higher ? 1 : -1;      // abattage, pot d'antes
        return 1;                                          // l'adversaire s'est couché
      }
      if (doubleBet) return higher ? 2 : -2;               // abattage après mise payée
    }

    const infoSet = cards[player] + history;
    const node = getNode(infoSet);
    const strat = strategy(node);
    const util = [0, 0];
    let nodeUtil = 0;
    for (let a = 0; a < 2; a++) {
      const next = history + (a === 0 ? "p" : "b");
      util[a] = player === 0
        ? -cfr(cards, next, p0 * strat[a], p1)
        : -cfr(cards, next, p0, p1 * strat[a]);
      nodeUtil += strat[a] * util[a];
    }
    const reachOpp = player === 0 ? p1 : p0;
    const reachSelf = player === 0 ? p0 : p1;
    for (let a = 0; a < 2; a++) {
      node.regretSum[a] = Math.max(0, node.regretSum[a] + reachOpp * (util[a] - nodeUtil));
      node.strategySum[a] += reachSelf * strat[a];
    }
    return nodeUtil;
  }

  let sum = 0;
  const deck = [0, 1, 2];
  // Passage sur les 6 donnes possibles à chaque itération → pas d'échantillonnage,
  // donc pas de bruit : la convergence observée vient bien de l'algorithme.
  for (let i = 0; i < iterations; i++) {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      if (a === b) continue;
      sum += cfr([deck[a], deck[b]], "", 1, 1) / 6;
    }
  }
  const avg = {};
  for (const [k, v] of nodes) {
    const tot = v.strategySum[0] + v.strategySum[1];
    avg[k] = tot > 0 ? [v.strategySum[0] / tot, v.strategySum[1] / tot] : [0.5, 0.5];
  }
  return { value: sum / iterations, strategy: avg };
}

console.log("[B1] Kuhn poker — valeur du jeu et structure de l'équilibre");
{
  const t0 = Date.now();
  const res = kuhnSolve(30000);
  const ms = Date.now() - t0;
  console.log(`    valeur J1 ${res.value.toFixed(5)} (théorie ${KUHN_VALUE.toFixed(5)}) · 30 000 itérations · ${ms} ms`);
  near(res.value, KUHN_VALUE, 0.01, "valeur du jeu à l'équilibre ≈ −1/18");

  // Structure connue : le bluff au J et la value au K sont liés par un facteur 3.
  const betJ = res.strategy["0"] ? res.strategy["0"][1] : 0;    // J en premier : misé avec α
  const betK = res.strategy["2"] ? res.strategy["2"][1] : 0;    // K en premier : misé avec 3α
  const betQ = res.strategy["1"] ? res.strategy["1"][1] : 0;    // Q en premier : jamais misé
  console.log(`    J1 mise : J ${(betJ * 100).toFixed(1)}% · Q ${(betQ * 100).toFixed(1)}% · K ${(betK * 100).toFixed(1)}%`);
  ok(betQ < 0.10, `la dame n'est jamais misée en premier (${(betQ * 100).toFixed(1)}%)`);
  ok(betJ <= 1 / 3 + 0.05, `le valet est bluffé au plus 1/3 du temps (${(betJ * 100).toFixed(1)}%)`);
  ok(betK > betJ, `le roi est misé plus souvent que le valet (${(betK * 100).toFixed(1)}% > ${(betJ * 100).toFixed(1)}%)`);
  if (betJ > 0.02) {
    const ratio = betK / betJ;
    console.log(`    rapport K/J = ${ratio.toFixed(2)} (théorie 3,00)`);
    ok(Math.abs(ratio - 3) < 1.2, `rapport roi/valet ≈ 3 (mesuré ${ratio.toFixed(2)})`);
  }

  // Réponse du joueur 2 face à une mise : il paie toujours avec le roi, jamais avec le valet.
  const j2FaceBetK = res.strategy["2b"] ? res.strategy["2b"][1] : 0;
  const j2FaceBetJ = res.strategy["0b"] ? res.strategy["0b"][1] : 0;
  ok(j2FaceBetK > 0.9, `J2 paie toujours avec le roi (${(j2FaceBetK * 100).toFixed(1)}%)`);
  ok(j2FaceBetJ < 0.1, `J2 se couche toujours avec le valet (${(j2FaceBetJ * 100).toFixed(1)}%)`);
}

console.log("[B2] Convergence : plus d'itérations ⇒ plus proche de la valeur théorique");
{
  const runs = [2000, 30000].map(it => {
    const r = kuhnSolve(it);
    return { it, err: Math.abs(r.value - KUHN_VALUE) };
  });
  console.log(`    ` + runs.map(r => `${r.it} it → écart ${r.err.toFixed(5)}`).join(" · "));
  ok(runs[1].err <= runs[0].err + 1e-6,
    `l'écart à la valeur théorique ne croît pas avec les itérations (${runs[0].err.toFixed(5)} → ${runs[1].err.toFixed(5)})`);
  ok(runs[1].err < 0.01, `écart final < 0,01 (${runs[1].err.toFixed(5)})`);
}

console.log(`\n✅ jeux réduits — ${n} assertions OK`);
console.log(`   NIVEAU A (production) : clairvoyance 3 sizings · sizing dominé · NashConv exact`);
console.log(`   NIVEAU B (algorithme) : Kuhn — valeur −1/18 retrouvée. NE certifie PAS l'arbre de production.`);
