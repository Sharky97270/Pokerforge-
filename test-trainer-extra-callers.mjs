/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-extra-callers — C12 : LE SUIVEUR RÉPOND À LA RELANCE

   Ce que ce fichier prouve :
     ① un siège déjà à niveau n'a aucune décision à prendre ;
     ② la décision dépend de la COTE : la même main suit à bon prix et se
        couche à mauvais prix ;
     ③ elle dépend de la MAIN : au même prix, AA suit et 72o se couche ;
     ④ elle dépend du PROFIL : un nit ne suit pas hors de sa range même quand
        le prix est bon ;
     ⑤ le pot grandit entre deux suiveurs — le second voit la cote que le
        premier vient de créer ;
     ⑥ après résolution, le tour d'enchères préflop est CLOS : tout siège
        encore assis a le même engagement, sauf s'il est à tapis ;
     ⑦ le module ne prétend pas savoir re-relancer, et le dit.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import {
  extraCallerDecision, resolveExtraCallers, auditPreflopClos, rangeFreqs,
  SQUEEZE_RANGE_PCT, MARGE_POSITION, EXTRA_CALLER_LIMITS,
} from "./src/trainerExtraCallers.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const near = (a, b, m, tol = 0.001) => { assert.ok(Math.abs(a - b) <= tol, `${m} (attendu ${b}, obtenu ${a})`); passed++; };

const C = (r, s) => ({ r, s });
const AA = [C("A", "♠"), C("A", "♥")];
const AKs = [C("A", "♠"), C("K", "♠")];
const T9s = [C("T", "♦"), C("9", "♦")];
const SEPT_DEUX = [C("7", "♣"), C("2", "♦")];

/* ── 1. Rien à payer, rien à décider ─────────────────────────────────────── */
{
  const d = extraCallerDecision({ hand: SEPT_DEUX, engage: 2.5, niveau: 2.5, restant: 100, pot: 8 });
  eq(d.action, "CALL", "un siège déjà à niveau reste, il ne « suit » rien");
  near(d.aPayer, 0, "et ne paie rien");
  ok(/déjà à niveau/.test(d.raison), `la raison le dit : « ${d.raison} »`);

  const tapis = extraCallerDecision({ hand: AA, engage: 2.5, niveau: 40, restant: 0, pot: 60 });
  eq(tapis.action, "CALL", "un siège déjà à tapis ne peut pas se coucher");
  ok(tapis.allIn, "et il est signalé à tapis");
}

/* ── 2. La cote décide ───────────────────────────────────────────────────── */
{
  /* Même main, même profil, deux prix. À 2bb à payer dans un pot de 20, la
     cote est de 9 % ; à 40bb dans un pot de 20, elle est de 66 %. */
  const bonPrix = extraCallerDecision({ hand: T9s, engage: 2.5, niveau: 4.5, restant: 100, pot: 20, vpip: 40 });
  const mauvaisPrix = extraCallerDecision({ hand: T9s, engage: 2.5, niveau: 42.5, restant: 100, pot: 20, vpip: 40 });
  eq(bonPrix.action, "CALL", `T9s suit à 2bb dans 20 (cote ${Math.round(bonPrix.coteRequise * 100)} %)`);
  eq(mauvaisPrix.action, "FOLD", `T9s se couche à 40bb dans 20 (cote ${Math.round(mauvaisPrix.coteRequise * 100)} %)`);
  ok(mauvaisPrix.coteRequise > bonPrix.coteRequise, "la cote exigée monte avec le prix");
  near(mauvaisPrix.aPayer, 0, "un siège qui se couche ne paie rien");
}

/* ── 3. La main décide ───────────────────────────────────────────────────── */
{
  const prix = { engage: 2.5, niveau: 12, restant: 100, pot: 17, vpip: 40 };
  const forte = extraCallerDecision({ hand: AA, ...prix });
  const faible = extraCallerDecision({ hand: SEPT_DEUX, ...prix });
  eq(forte.action, "CALL", "AA suit");
  eq(faible.action, "FOLD", "72o se couche au même prix");
  ok(forte.equite > faible.equite, `et l'équité les sépare (${forte.equite.toFixed(3)} > ${faible.equite.toFixed(3)})`);
  near(forte.to, 12, "le suiveur atteint EXACTEMENT le niveau demandé");
}

/* ── 4. Le profil décide aussi ───────────────────────────────────────────── */
{
  /* Prix très favorable, main correcte mais hors de la range d'un nit. */
  const prix = { hand: T9s, engage: 2.5, niveau: 4, restant: 100, pot: 30 };
  const large = extraCallerDecision({ ...prix, vpip: 45 });
  const nit = extraCallerDecision({ ...prix, vpip: 8 });
  eq(large.action, "CALL", "un joueur large suit");
  eq(nit.action, "FOLD", "un nit se couche malgré le prix");
  ok(/hors range/.test(nit.raison), `et la raison est la range, pas la cote : « ${nit.raison} »`);
  near(large.coteRequise, nit.coteRequise, "les deux voyaient pourtant la même cote");
}

/* ── 5. La marge de position est réellement appliquée ────────────────────── */
{
  ok(MARGE_POSITION > 0, "une marge de position est exigée en plus de la cote");
  /* On construit un prix où l'équité tombe entre la cote et la cote + marge :
     sans marge le siège suivrait, avec marge il se couche. */
  let trouve = null;
  for (let niveau = 3; niveau <= 60 && !trouve; niveau += 0.5) {
    const d = extraCallerDecision({ hand: AKs, engage: 2.5, niveau, restant: 200, pot: 20, vpip: 60 });
    if (d.equite != null && d.equite >= d.coteRequise && d.equite < d.coteRequise + MARGE_POSITION) trouve = d;
  }
  ok(trouve, "il existe un prix où l'équité paie la cote mais pas la marge");
  if (trouve) eq(trouve.action, "FOLD", "et à ce prix le siège se couche");
}

/* ── 6. Le pot grandit entre deux suiveurs ───────────────────────────────── */
{
  const r = resolveExtraCallers({
    extras: [{ pos: "CO" }, { pos: "BTN" }],
    niveau: 12, pot: 17,
    engagements: { CO: 2.5, BTN: 2.5 },
    tapis: { CO: 100, BTN: 100 },
    hands: { CO: AA, BTN: AA },
    vpips: { CO: 40, BTN: 40 },
  });
  eq(r.suiveurs, ["CO", "BTN"], "les deux suivent");
  near(r.totalPaye, 19, "chacun complète 9.5bb");
  near(r.potApres, 36, "le pot final vaut 17 + 9.5 + 9.5");
  /* Le second a vu une cote MEILLEURE que le premier : le pot avait grandi. */
  const [d1, d2] = r.decisions;
  ok(d2.coteRequise < d1.coteRequise,
     `le second voit une cote plus douce (${d2.coteRequise.toFixed(3)} < ${d1.coteRequise.toFixed(3)})`);
}

/* ── 7. Un suiveur à tapis court ne paie que ce qu'il a ──────────────────── */
{
  const r = resolveExtraCallers({
    extras: [{ pos: "BTN" }],
    niveau: 40, pot: 60,
    engagements: { BTN: 2.5 },
    tapis: { BTN: 6 },
    hands: { BTN: AA },
    vpips: { BTN: 30 },
  });
  eq(r.suiveurs, ["BTN"], "AA suit à tapis");
  near(r.totalPaye, 6, "il paie son tapis, pas les 37.5 demandés");
  ok(r.decisions[0].allIn, "et il est signalé à tapis");
}

/* ── 8. Après résolution, le préflop est CLOS ────────────────────────────── */
{
  /* Le cas mesuré au navigateur : BB 15, CO 16.5, BTN 2.5 — un « side pot »
     qui décrivait une ligne préflop inachevée. */
  const avant = auditPreflopClos({
    seats: { BB: { total: 15, remaining: 85 }, CO: { total: 15, remaining: 85 }, BTN: { total: 2.5, remaining: 97.5 } },
    niveau: 15, assis: ["BB", "CO", "BTN"],
  });
  eq(avant.length, 1, "avant résolution : un siège n'a pas égalé");
  eq(avant[0].code, "engagement-inferieur", "et l'écart est nommé");
  eq(avant[0].position, "BTN", "c'est le suiveur");

  /* Après : soit il a complété, soit il n'est plus assis. */
  const apresCall = auditPreflopClos({
    seats: { BB: { total: 15, remaining: 85 }, CO: { total: 15, remaining: 85 }, BTN: { total: 15, remaining: 85 } },
    niveau: 15, assis: ["BB", "CO", "BTN"],
  });
  eq(apresCall, [], "après un call : le tour est clos");

  const apresFold = auditPreflopClos({
    seats: { BB: { total: 15, remaining: 85 }, CO: { total: 15, remaining: 85 }, BTN: { total: 2.5, remaining: 97.5 } },
    niveau: 15, assis: ["BB", "CO"],
  });
  eq(apresFold, [], "après un fold : le siège n'est plus assis, ses jetons restent au pot");

  /* Un siège À TAPIS en dessous du niveau n'est pas un écart : il ne PEUT pas
     égaler. C'est précisément ce qui produit un side pot légitime. */
  const aTapis = auditPreflopClos({
    seats: { BB: { total: 15, remaining: 85 }, BTN: { total: 6, remaining: 0 } },
    niveau: 15, assis: ["BB", "BTN"],
  });
  eq(aTapis, [], "un tapis court sous le niveau est légitime — c'est un vrai side pot");
}

/* ── 9. La range du relanceur est construite, pas écrite ─────────────────── */
{
  const squeeze = rangeFreqs(SQUEEZE_RANGE_PCT);
  const large = rangeFreqs(40);
  const nSqueeze = Object.keys(squeeze).length, nLarge = Object.keys(large).length;
  ok(nSqueeze > 0 && nSqueeze < nLarge, `une range de squeeze est plus étroite (${nSqueeze} mains contre ${nLarge})`);
  ok(squeeze.AA === 1, "AA est dans toute range");
  ok(squeeze["72o"] === undefined, "72o n'est dans aucune range de squeeze");
  ok(large["72o"] === undefined, "ni même dans une range à 40 %");
  /* La range est un SOUS-ensemble de la plus large : les seuils sont cohérents. */
  const inclus = Object.keys(squeeze).every(k => large[k] === 1);
  ok(inclus, "la range étroite est incluse dans la large");
}

/* ── 10. Ce que le module ne sait pas faire est DIT ──────────────────────── */
{
  eq(EXTRA_CALLER_LIMITS.peutRelancer, false, "le suiveur ne re-relance pas");
  ok(/rouvrirait la parole/.test(EXTRA_CALLER_LIMITS.raison), `et la raison est publiée : « ${EXTRA_CALLER_LIMITS.raison} »`);
  eq(EXTRA_CALLER_LIMITS.provenance, "heuristique", "la provenance n'est pas surévaluée");
  ok(!/GTO|Nash|solveur|solv/i.test(JSON.stringify(EXTRA_CALLER_LIMITS)),
     "aucun mot de solveur dans la fiche de provenance");
}

/* ── 11. Échantillon : aucune décision ne fabrique de jetons ─────────────── */
{
  let seed = 20260825 >>> 0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const RANKS = "23456789TJQKA", SUITS = "♠♥♦♣";
  let n = 0, calls = 0, folds = 0, ecarts = 0;
  for (let t = 0; t < 2000; t++) {
    const d = new Set();
    while (d.size < 2) d.add(Math.floor(rnd() * 52));
    const hand = [...d].map(i => ({ r: RANKS[i >> 2], s: SUITS[i & 3] }));
    const engage = [0.5, 1, 2.5][Math.floor(rnd() * 3)];
    const niveau = engage + Math.round(rnd() * 60 * 2) / 2;
    const restant = Math.round(rnd() * 190 * 2) / 2 + 1;
    const pot = Math.round(rnd() * 60 * 2) / 2 + 1;
    const dec = extraCallerDecision({ hand, engage, niveau, restant, pot, vpip: 10 + rnd() * 50 });
    n++;
    if (dec.action === "CALL") calls++; else folds++;
    /* Un fold ne paie rien ; un call ne paie jamais plus que le tapis ni plus
       que ce qui manque pour atteindre le niveau. */
    if (dec.action === "FOLD" && dec.aPayer !== 0) ecarts++;
    if (dec.aPayer > restant + 0.011) ecarts++;
    if (dec.aPayer > niveau - engage + 0.011) ecarts++;
    if (dec.to > niveau + 0.011) ecarts++;
  }
  eq(ecarts, 0, `0 montant illégal sur ${n} décisions`);
  ok(calls > 100 && folds > 100, `échantillon bilatéral : ${calls} calls / ${folds} folds`);
}

console.log(`✅ suiveur supplémentaire — le tour préflop se ferme (C12) — ${passed} assertions OK`);
