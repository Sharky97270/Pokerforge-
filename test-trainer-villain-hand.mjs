/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-villain-hand — C12 / G5 : LE VILAIN REGARDE SES CARTES

   L'audit relevait : « `villainDecide` décide par tirage aléatoire pondéré par
   le profil, la position, le SPR et le field. **Sa main n'entre dans aucune de
   ces formules.** C'est défendable pour un drill de spot isolé — mais alors le
   résultat de la main n'est pas une information de poker. »

   Ce fichier verrouille la moitié manquante : la main existe, elle est tirée
   dans la range du profil, et elle INFLÉCHIT la décision.

   Ce qu'il ne prétend pas : que le Vilain joue une stratégie résolue. Le
   tirage pondéré subsiste — il porte le style du joueur. La main lui donne
   un sens.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  preflopStrength, rangeThreshold, dealVillainHand, villainHandStrength,
  handTilt, tiltDecision, TILT_MAX, strengthAtPercentile, neutralStrength, NEUTRAL_STRENGTH,
} from "./src/trainerVillainHand.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 0.02) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

const C = (r, s) => ({ r, s });
const graine = n => { let s = n >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

/* ── 1. L'ordre des mains préflop est celui du poker ────────────────────── */
{
  const AA = preflopStrength([C("A", "♠"), C("A", "♥")]);
  const KK = preflopStrength([C("K", "♠"), C("K", "♥")]);
  const AKs = preflopStrength([C("A", "♠"), C("K", "♠")]);
  const AKo = preflopStrength([C("A", "♠"), C("K", "♥")]);
  const T9s = preflopStrength([C("T", "♠"), C("9", "♠")]);
  const _72o = preflopStrength([C("7", "♠"), C("2", "♥")]);
  const _22 = preflopStrength([C("2", "♠"), C("2", "♥")]);

  ok(AA > KK, `AA (${AA.toFixed(2)}) > KK (${KK.toFixed(2)})`);
  /* Une première version divisait par 36 et plaçait AKo à 0.97, AU-DESSUS de
     KK : l'ordre du poker était inversé. Le plafond des non-paires (0.86) le
     garantit désormais. */
  ok(KK > AKs, `KK (${KK.toFixed(2)}) > AKs (${AKs.toFixed(2)}) — une grosse paire passe devant`);
  ok(preflopStrength([C("Q", "♠"), C("Q", "♥")]) > AKs, "QQ aussi");
  ok(preflopStrength([C("J", "♠"), C("J", "♥")]) > AKo, "JJ passe devant AK dépareillé");
  ok(AKs > AKo, "assortie vaut mieux que dépareillée");
  ok(AKo > T9s, `AK dépareillé > T9 assorti`);
  ok(T9s > _72o, `T9s (${T9s.toFixed(2)}) > 72o (${_72o.toFixed(2)})`);
  ok(_22 > _72o, "la plus petite paire bat la pire main non appariée");
  ok(_72o < 0.25, `72o est bien en bas de la distribution (${_72o.toFixed(2)})`);
  ok(AA >= 0.99, "AA est au sommet");
  /* Monotonie : à couleur et écart constants, plus haut = plus fort. */
  for (const r of ["3", "5", "8", "T", "Q"]) {
    const bas = preflopStrength([C(r, "♠"), C("2", "♥")]);
    const haut = preflopStrength([C("A", "♠"), C("2", "♥")]);
    ok(haut > bas, `A2o > ${r}2o`);
  }
}

/* ── 2. La range découle du VPIP ────────────────────────────────────────── */
{
  ok(rangeThreshold(12) > rangeThreshold(48), "un nit a un seuil de range plus haut qu'une station");
  /* Le seuil est un QUANTILE : « VPIP 24 % » sélectionne le haut 24 % de la
     distribution réelle des 169 mains, pondérée par les combinaisons. */
  near(rangeThreshold(24), strengthAtPercentile(24), "le seuil EST le quantile du VPIP");
  ok(rangeThreshold(12) > rangeThreshold(24), "12 % est plus sélectif que 24 %");
  ok(rangeThreshold(0) > 0 && rangeThreshold(0) < 1, "un VPIP absent donne un seuil plausible");
  ok(rangeThreshold(200) <= 0.95 && rangeThreshold(-5) <= 0.95, "le seuil reste borné");
}

/* ── 3. La main tirée respecte la range du profil ───────────────────────── */
{
  const mesure = (vpip, n = 600) => {
    const rng = graine(20260824 + vpip);
    let somme = 0, dansRange = 0, doublons = 0;
    const heroHand = [C("A", "♣"), C("K", "♣")];
    for (let t = 0; t < n; t++) {
      const d = dealVillainHand({ used: heroHand, vpip, rng });
      somme += d.strength;
      if (d.dansLaRange) dansRange++;
      const cles = [...heroHand, ...d.hand].map(c => c.r + c.s);
      if (new Set(cles).size !== cles.length) doublons++;
    }
    return { moyenne: somme / n, dansRange: dansRange / n, doublons };
  };
  const nit = mesure(12), station = mesure(48), reg = mesure(24);
  eq(nit.doublons, 0, "aucune carte du Vilain ne double celles d'Hero");
  eq(station.doublons, 0, "idem pour une station");
  ok(nit.moyenne > reg.moyenne, `un nit reçoit des mains plus fortes (${nit.moyenne.toFixed(2)} > ${reg.moyenne.toFixed(2)})`);
  ok(reg.moyenne > station.moyenne, `un reg plus fortes qu'une station (${reg.moyenne.toFixed(2)} > ${station.moyenne.toFixed(2)})`);
  ok(station.dansRange > 0.9, `une station trouve presque toujours une main dans sa range (${(station.dansRange * 100).toFixed(0)} %)`);

  /* Le board est exclu lui aussi. */
  const rng = graine(99);
  const used = [C("A", "♣"), C("K", "♣"), C("Q", "♦"), C("7", "♥"), C("2", "♠")];
  for (let t = 0; t < 200; t++) {
    const d = dealVillainHand({ used, vpip: 30, rng });
    const cles = [...used, ...d.hand].map(c => c.r + c.s);
    eq(new Set(cles).size, cles.length, "la main tirée évite les cartes du board");
    passed--; // une assertion par tirage serait du bruit : on en garde une
  }
  passed++;
}

/* ── 4. La force lue dépend de la street ────────────────────────────────── */
{
  const main = [C("K", "♥"), C("K", "♠")];
  const pre = villainHandStrength(main, []);
  eq(pre.source, "preflop", "sans board, on lit la force de départ");
  ok(pre.strength > 0.9, "KK est une main de départ très forte");
  const flop = villainHandStrength(main, [C("K", "♦"), C("7", "♣"), C("2", "♥")]);
  eq(flop.source, "postflop", "avec un board, on lit la main réalisée");
  ok(flop.strength > 0.3, `brelan de rois au flop : force ${flop.strength.toFixed(2)}`);
  const rate = villainHandStrength([C("7", "♥"), C("2", "♣")], [C("A", "♦"), C("K", "♣"), C("Q", "♥")]);
  ok(rate.strength < flop.strength, "72 sur AKQ vaut moins qu'un brelan");
  eq(villainHandStrength(null, []).source, "inconnue", "sans main, la source le dit");
  near(villainHandStrength(null, []).strength, 0.5, "et la force est neutre, pas inventée");
}

/* ── 5. L'inflexion va dans le sens du poker, et reste bornée ───────────── */
{
  const fort = handTilt(0.9, { neutre: 0.45, sens: +1 });
  const faible = handTilt(0.1, { neutre: 0.45, sens: +1 });
  ok(fort > 1, `une main forte augmente l'agression (×${fort.toFixed(2)})`);
  ok(faible < 1, `une main faible la réduit (×${faible.toFixed(2)})`);
  ok(handTilt(0.9, { neutre: 0.45, sens: -1 }) < 1, "et diminue le fold");
  near(handTilt(0.45, { neutre: 0.45 }), 1, "à la médiane, la main ne change rien");
  /* Bornes : la main compte, elle ne décide jamais seule. */
  for (const f of [0, 0.01, 0.5, 0.99, 1, 5, -3, NaN]) {
    const t = handTilt(f, { neutre: 0.45 });
    ok(t >= 0.1 && t <= 2.5, `multiplicateur borné pour force=${f} (×${t.toFixed(2)})`);
  }
  ok(TILT_MAX <= 1, "l'amplitude maximale ne peut pas inverser une probabilité");
  /* Une force absente laisse le comportement d'avant : ×1 exactement. */
  near(handTilt(undefined, { neutre: 0.5 }), 1, "sans force connue, aucun effet");
}

/* ── 6. La décision penche dans le bon sens ─────────────────────────────── */
{
  const base = { fold: 0.4, call: 0.4, raise: 0.2 };
  const avecNuts = tiltDecision(base, 0.95, 0.45);
  const avecAir = tiltDecision(base, 0.05, 0.45);
  ok(avecNuts.raise > base.raise, `main forte : plus de relance (${avecNuts.raise.toFixed(2)} > ${base.raise})`);
  ok(avecNuts.fold < base.fold, `main forte : moins de fold (${avecNuts.fold.toFixed(2)} < ${base.fold})`);
  ok(avecAir.fold > base.fold, `main faible : plus de fold (${avecAir.fold.toFixed(2)})`);
  ok(avecAir.raise < base.raise, "main faible : moins de relance");
  for (const d of [avecNuts, avecAir]) {
    near(d.fold + d.call + d.raise, 1, "les probabilités somment à 1");
    for (const v of Object.values(d)) ok(v >= 0, "aucune probabilité négative");
  }
  /* Le bluff ne disparaît pas : une main faible relance encore parfois. */
  ok(avecAir.raise > 0, `une main faible garde une part de bluff (${avecAir.raise.toFixed(3)})`);
  /* Une distribution vide ne produit pas de NaN. */
  const vide = tiltDecision({ fold: 0, call: 0, raise: 0 }, 0.8);
  near(vide.fold + vide.call + vide.raise, 1, "une distribution vide reste normalisée");
}

/* ── 7. Mesure d'ensemble : la main change RÉELLEMENT le comportement ───── */
{
  /* Le cœur du défaut G5 : avant, deux mains opposées produisaient exactement
     la même distribution de décisions. On mesure l'écart. */
  const base = { fold: 0.45, call: 0.35, raise: 0.20 };
  const nuts = tiltDecision(base, 0.95, 0.45);
  const air = tiltDecision(base, 0.05, 0.45);
  const ecartFold = Math.abs(nuts.fold - air.fold);
  const ecartRaise = Math.abs(nuts.raise - air.raise);
  ok(ecartFold > 0.25, `la main déplace le fold de ${(ecartFold * 100).toFixed(0)} points`);
  ok(ecartRaise > 0.10, `et la relance de ${(ecartRaise * 100).toFixed(0)} points`);
  /* Sans main (force neutre), la distribution reste celle du profil. */
  const neutre = tiltDecision(base, 0.45, 0.45);
  near(neutre.fold, base.fold, "sans information de main, le profil décide seul");
  near(neutre.raise, base.raise, "idem pour la relance");
}

/* ── 8. Le point neutre est celui de la DISTRIBUTION, pas d'une intuition ── */
{
  /* Le défaut trouvé au navigateur : le point neutre postflop était fixé à
     0.22 alors que la médiane mesurée au flop vaut 0.075. Presque toute main
     tombait « sous la moyenne » — le Vilain se couchait à tout va, et 17 coups
     complets sur 17 revenaient à Hero. Une référence fausse suffit à vider une
     correction de son sens. */
  eq(neutralStrength(0), NEUTRAL_STRENGTH.preflop, "sans board : médiane préflop");
  eq(neutralStrength(3), NEUTRAL_STRENGTH.flop, "flop");
  eq(neutralStrength(4), NEUTRAL_STRENGTH.turn, "turn");
  eq(neutralStrength(5), NEUTRAL_STRENGTH.river, "river");
  ok(NEUTRAL_STRENGTH.flop < NEUTRAL_STRENGTH.turn, "la médiane monte du flop au turn");
  ok(NEUTRAL_STRENGTH.turn < NEUTRAL_STRENGTH.river, "et du turn à la river");
  ok(NEUTRAL_STRENGTH.flop < 0.15, `la médiane au flop est BASSE (${NEUTRAL_STRENGTH.flop}) — 0.22 était très au-dessus`);
  near(NEUTRAL_STRENGTH.preflop, strengthAtPercentile(50), "la médiane préflop EST le quantile 50 de la distribution exacte");

  /* Avec la bonne référence, une main médiane ne penche d'aucun côté — et la
     moitié des mains penchent de chaque côté. C'est ce qui rétablit
     l'équilibre des issues. */
  for (const [nb, nom] of [[3, "flop"], [4, "turn"], [5, "river"]]) {
    const n = neutralStrength(nb);
    near(handTilt(n, { neutre: n }), 1, `${nom} : à la médiane, aucune inflexion`);
    ok(handTilt(n * 2, { neutre: n, sens: +1 }) > 1, `${nom} : au-dessus, plus d'agression`);
    ok(handTilt(n / 2, { neutre: n, sens: +1 }) < 1, `${nom} : en dessous, moins`);
  }

  /* Mesure d'ensemble : sur des tirages réels, la moitié des mains doit se
     situer de part et d'autre du point neutre. Une référence décalée se voit
     immédiatement ici. */
  const RANKS2 = "23456789TJQKA", SUITS2 = "♠♥♦♣";
  const rng = graine(31337);
  const toC = i => ({ r: RANKS2[i >> 2], s: SUITS2[i & 3] });
  for (const nb of [3, 4, 5]) {
    let dessus = 0;
    const N = 4000;
    for (let t = 0; t < N; t++) {
      const s = new Set(); while (s.size < 2 + nb) s.add(Math.floor(rng() * 52));
      const cs = [...s].map(toC);
      const f = villainHandStrength(cs.slice(0, 2), cs.slice(2)).strength;
      if (f > neutralStrength(nb)) dessus++;
    }
    const part = dessus / N;
    ok(part > 0.30 && part < 0.70, `board de ${nb} : ${(part * 100).toFixed(0)} % des mains au-dessus du neutre (équilibré)`);
  }
}

console.log(`✅ Vilain — décision infléchie par sa main (C12/G5) — ${passed} assertions OK`);
