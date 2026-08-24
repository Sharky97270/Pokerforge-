/* ══════════════════════════════════════════════════════════════════════════
   test-trainer-honesty — C10 · C11 · C13 : AUCUN BADGE INJUSTIFIÉ

   Deux défauts mesurés :
     G3  « Seuil Nash : top X% » désignait le produit de DEUX CONSTANTES
         (une table par position × un coefficient de profondeur). Écart mesuré
         face au solveur du dépôt : +10,2 points à 15bb.
     G4  le mode Exploit ne se distinguait du GTO que par `freq × 1,08` — sans
         dépendre du profil, et sans changer la meilleure action.

   Règles verrouillées :
     ① dans le domaine certifié, le seuil est CALCULÉ et porte ses paramètres ;
     ② hors domaine, le mot « Nash » (et « GTO », « équilibre », « exact »)
        est interdit — le libellé devient « Repère heuristique » ;
     ③ un ajustement exploitant ne publie NI fréquence NI EV fabriquée, et
        chaque adaptation porte la donnée qui la fonde.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { jamThreshold, jamThresholdNote, assertNoOverclaim, JAM_PROVENANCE } from "./src/trainerJamThreshold.js";
import { exploitAdjustment, assertExploitHonesty, EXPLOIT_MODE_LABEL, EXPLOIT_PANEL_LABEL, REFERENCES } from "./src/trainerExploit.js";
import { solvePreflopPushFold } from "./src/solver/api.js";
import { applySolverStrategy, STRATEGY_ENGINES, STRATEGY_CONFIDENCE } from "./src/trainerStrategyProvider.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* Spot DANS le domaine : SB jam vs BB, cash chip-EV, profondeur tabulée. */
const dansDomaine = depth => ({
  hpos: "SB", vpos: "BB", street: "Preflop", stack: `${depth}bb`, nplayers: 2,
  fmt: "Cash Heads-Up", toCall: 0,
  acts: [{ id: "FOLD", l: "Fold" }, { id: "ALLIN", l: "All-in" }],
});

/* ── 1. Dans le domaine : le seuil est CALCULÉ ──────────────────────────── */
{
  for (const d of [6, 10, 15, 20, 25]) {
    const s = jamThreshold(dansDomaine(d), { solve: solvePreflopPushFold });
    eq(s.provenance, JAM_PROVENANCE.SOLVER, `${d}bb : provenance solveur`);
    eq(s.engine, "solvePreflopPushFold", `${d}bb : moteur nommé`);
    ok(s.exact, `${d}bb : marqué exact`);
    ok(s.value > 0 && s.value <= 100, `${d}bb : fréquence plausible (${s.value}%)`);
    /* Les paramètres sont AFFICHÉS : sans eux, « équilibre » ne dit pas de
       quel jeu on parle. */
    eq(s.params.modele, "SB jam / BB call, heads-up", `${d}bb : modèle dit`);
    eq(s.params.bareme, "chip-EV (sans ICM)", `${d}bb : barème dit`);
    eq(s.params.profondeurBb, d, `${d}bb : profondeur dite`);
    /* La valeur doit correspondre à ce que le solveur publie, pas s'en approcher. */
    eq(s.value, Math.round(solvePreflopPushFold(d).sbJamPct * 10) / 10, `${d}bb : la valeur EST celle du solveur`);
  }
  /* Monotonie : plus court ⇒ range plus large. C'est une propriété du calcul,
     pas de la table de constantes. */
  const suite = [6, 10, 15, 20, 25].map(d => jamThreshold(dansDomaine(d), { solve: solvePreflopPushFold }).value);
  for (let i = 1; i < suite.length; i++) ok(suite[i] < suite[i - 1], `${suite[i]}% < ${suite[i - 1]}% (range plus serrée en profondeur)`);

  /* Écart avec l'ancienne table de constantes : c'est ce que le correctif rend. */
  const ancien = { 6: 65, 10: 65, 15: 55, 20: 47, 25: 40 };
  const ecarts = Object.keys(ancien).map(d => Math.abs(ancien[d] - jamThreshold(dansDomaine(+d), { solve: solvePreflopPushFold }).value));
  ok(Math.max(...ecarts) > 5, `l'ancienne table s'écartait de ${Math.max(...ecarts).toFixed(1)} points du calcul`);
}

/* ── 2. Hero à la BB : c'est la range de CALL, pas celle de jam ─────────── */
{
  const bb = { ...dansDomaine(10), hpos: "BB", vpos: "SB", toCall: 10,
    acts: [{ id: "FOLD", l: "Fold" }, { id: "CALL", l: "Call all-in" }] };
  const s = jamThreshold(bb, { solve: solvePreflopPushFold });
  if (s.provenance === JAM_PROVENANCE.SOLVER) {
    eq(s.value, Math.round(solvePreflopPushFold(10).bbCallPct * 10) / 10, "la BB lit la range de CALL, pas celle de jam");
    ok(/call/i.test(s.label), `le libellé le dit (${s.label})`);
  } else {
    ok(s.reasons.length > 0, `hors domaine avec raison : ${s.reasons[0]}`);
  }
}

/* ── 3. Hors domaine : plus jamais le mot « Nash » ──────────────────────── */
{
  const horsDomaine = [
    { nom: "6-max au BTN", spot: { hpos: "BTN", vpos: "BB", street: "Preflop", stack: "25bb", nplayers: 6, fmt: "Cash 6-max", toCall: 0, acts: [{ id: "FOLD" }, { id: "ALLIN" }] } },
    { nom: "profondeur hors table", spot: { ...dansDomaine(60), stack: "60bb" } },
    { nom: "ICM", spot: { ...dansDomaine(12), fmt: "Spin & Go" } },
    { nom: "PKO", spot: { ...dansDomaine(12), fmt: "MTT PKO" } },
    { nom: "postflop", spot: { ...dansDomaine(12), street: "Flop" } },
    { nom: "tapis fractionnaire", spot: { ...dansDomaine(12), stack: "12.5bb" } },
  ];
  for (const c of horsDomaine) {
    const s = jamThreshold(c.spot, { solve: solvePreflopPushFold });
    eq(s.provenance, JAM_PROVENANCE.HEURISTIC, `${c.nom} : provenance heuristique`);
    eq(s.label, "Repère heuristique", `${c.nom} : libellé requalifié`);
    eq(s.badge, "≈ Heuristique", `${c.nom} : badge honnête`);
    ok(!s.exact, `${c.nom} : jamais marqué exact`);
    ok(s.reasons.length > 0, `${c.nom} : la raison est publiée (${s.reasons[0]})`);
    eq(assertNoOverclaim(s.label, s.provenance), null, `${c.nom} : le libellé ne revendique rien`);
    const note = jamThresholdNote(s, { shoveIsBest: true });
    eq(assertNoOverclaim(note, s.provenance), null, `${c.nom} : la phrase pédagogique non plus`);
    ok(/non calculé|repère indicatif/i.test(note), `${c.nom} : la note dit que ce n'est pas calculé`);
  }
}

/* ── 4. Le garde-fou de vocabulaire attrape bien les surévaluations ─────── */
{
  ok(assertNoOverclaim("Seuil Nash : top 55%", JAM_PROVENANCE.HEURISTIC) !== null, "« Nash » sur une heuristique est refusé");
  ok(assertNoOverclaim("Solution GTO exacte", JAM_PROVENANCE.HEURISTIC) !== null, "« GTO » aussi");
  ok(assertNoOverclaim("calcul exact", JAM_PROVENANCE.HEURISTIC) !== null, "« exact » aussi");
  eq(assertNoOverclaim("Repère heuristique : top 55%", JAM_PROVENANCE.HEURISTIC), null, "un libellé honnête passe");
  eq(assertNoOverclaim("Range de jam d'équilibre", JAM_PROVENANCE.SOLVER), null, "le solveur a le droit au vocabulaire d'équilibre");
}

/* ── 5. C11 — l'ajustement exploitant dépend de données réelles ─────────── */
{
  const station = { vpip: 48, pfr: 8, foldToCbet: 18, callCbet: 72, raiseCbet: 10, bluffFreq: 5, foldToRaise: 25, cbetFreq: 20 };
  const nit = { vpip: 12, pfr: 10, foldToCbet: 74, callCbet: 20, raiseCbet: 6, bluffFreq: 6, foldToRaise: 80, cbetFreq: 45 };
  const reg = { ...REFERENCES };

  const aStation = exploitAdjustment({ profile: station, profileName: "Calling Station", street: "Flop", facingBet: false, position: "BTN", depthBb: 100 });
  const aNit = exploitAdjustment({ profile: nit, profileName: "Nit", street: "Flop", facingBet: false, position: "BTN", depthBb: 100 });
  const aReg = exploitAdjustment({ profile: reg, profileName: "Reg", street: "Flop", facingBet: false, position: "BTN", depthBb: 100 });

  ok(aStation.applies, "une station produit un ajustement");
  ok(aNit.applies, "un nit aussi");
  ok(!aReg.applies, "un profil à la référence n'en produit aucun — pas d'ajustement inventé");
  ok(aStation.direction !== aNit.direction, `les deux profils divergent (${aStation.direction} vs ${aNit.direction})`);
  eq(aStation.direction, "value", "contre une station : value, pas de bluff");
  eq(aNit.direction, "bluff", "contre un nit : plus d'agression");

  /* Chaque justification porte le chiffre qui la fonde. */
  for (const a of [aStation, aNit]) {
    ok(a.justifications.length > 0, `${a.provenance.contexte} : au moins une justification`);
    for (const j of a.justifications) {
      ok(Number.isFinite(j.valeur), `${j.signal} porte sa valeur mesurée (${j.valeur})`);
      ok(Number.isFinite(j.reference), `${j.signal} porte sa référence (${j.reference})`);
      ok(typeof j.effet === "string" && j.effet.length > 8, `${j.signal} porte son effet`);
    }
  }

  /* AUCUNE fréquence, AUCUNE EV fabriquée. */
  for (const a of [aStation, aNit, aReg]) {
    eq(a.frequency, null, "un ajustement heuristique ne publie pas de fréquence");
    eq(a.evDelta, null, "ni d'EV");
    eq(assertExploitHonesty(a), [], "aucune surévaluation détectée");
    ok(a.keepsBestAction, "l'action de référence n'est pas remplacée");
    eq(a.provenance.exact, false, "jamais marqué exact");
    eq(a.panel, EXPLOIT_PANEL_LABEL, "l'encart porte son nom honnête");
    eq(a.mode, EXPLOIT_MODE_LABEL, "le mode aussi");
  }

  /* Le préflop et le postflop ne lisent pas les mêmes signaux. */
  const pre = exploitAdjustment({ profile: station, profileName: "Calling Station", street: "Preflop", facingBet: false });
  const post = exploitAdjustment({ profile: station, profileName: "Calling Station", street: "Flop", facingBet: false });
  ok(pre.justifications.map(j => j.signal).join() !== post.justifications.map(j => j.signal).join(),
    "les signaux dépendent de la street");

  /* Sans profil, rien n'est affirmé. */
  const vide = exploitAdjustment({ profile: null });
  ok(!vide.applies, "aucun profil → aucun ajustement");
  eq(vide.frequency, null, "et surtout aucun chiffre");
}

/* ── 6. Le facteur 1,08 a disparu ───────────────────────────────────────── */
{
  /* L'ancien mode Exploit publiait `Math.round(freq*1.08)`. Un ajustement ne
     peut plus produire un nombre proche d'une fréquence de référence, parce
     qu'il n'en produit aucun. */
  const a = exploitAdjustment({
    profile: { vpip: 48, pfr: 8, foldToCbet: 18, callCbet: 72, raiseCbet: 10, bluffFreq: 5, foldToRaise: 25 },
    profileName: "Calling Station", street: "Flop",
    baseline: { actionId: "BET75", actionLabel: "Bet 75%", frequency: 62 },
  });
  eq(a.frequency, null, "aucune fréquence exploit");
  eq(a.baseline.frequency, 62, "la fréquence de RÉFÉRENCE reste intacte et identifiée comme telle");
  ok(!Object.values(a).some(v => v === Math.round(62 * 1.08)), "le produit 62 × 1,08 n'apparaît nulle part");
}


/* ── 7. C13 — la fiche de provenance est complete ───────────────────────── */
{
  const jam = { hpos: "SB", vpos: "BB", street: "Preflop", stack: "10bb", nplayers: 2, fmt: "Cash Heads-Up", toCall: 0,
    hand: [{ r: "A", s: "♠" }, { r: "K", s: "♥" }],
    acts: [{ id: "FOLD", l: "Fold" }, { id: "ALLIN", l: "All-in" }], ok: 1, freq: { FOLD: 40, ALLIN: 60 } };
  const hors = { ...jam, hpos: "BTN", vpos: "BB", nplayers: 6, fmt: "Cash 6-max", stack: "80bb" };

  for (const [nom, spot] of [["dans le domaine", { ...jam }], ["hors domaine", { ...hors }]]) {
    const s = applySolverStrategy(spot);
    ok(!!s.strategySource, nom + " : moteur publie (" + s.strategySource + ")");
    ok(!!s.strategyEngine && !!s.strategyEngine.name, nom + " : nom du moteur publie");
    ok(!!s.strategyEngine.version, nom + " : version publiee (" + s.strategyEngine.version + ")");
    ok(!!s.strategyConfidence, nom + " : confiance publiee (" + s.strategyConfidence + ")");
    ok(Array.isArray(s.strategyLimits), nom + " : limites publiees");
    eq(s.strategyConfidence, STRATEGY_CONFIDENCE[s.strategySource], nom + " : la confiance DECOULE de la source");
    eq(s.strategyEngine.exact, STRATEGY_ENGINES[s.strategySource].exact, nom + " : exactitude coherente avec la source");
    /* Une solution non resolue DOIT dire pourquoi. */
    if (s.strategySource !== "solver") {
      ok(!!s.strategyFallbackReason, nom + " : motif de repli publie");
      eq(s.strategyEngine.exact, false, nom + " : jamais marque exact");
      eq(s.strategyConfidence !== "exact", true, nom + " : jamais confiance exacte");
    }
  }
  /* Le badge d une heuristique ne peut pas contenir le vocabulaire du solveur. */
  eq(assertNoOverclaim(STRATEGY_ENGINES.heuristic.label, JAM_PROVENANCE.HEURISTIC), null, "le badge heuristique ne revendique rien");
  ok(/Heuristique/i.test(STRATEGY_ENGINES.heuristic.label), "et il se nomme pour ce qu il est");
}

console.log(`✅ honnêteté du Trainer — Nash / Exploit / provenance (C10/C11) — ${passed} assertions OK`);
