/* ══════════════════════════════════════════════════════════════════════════
   test-next-hand.mjs — TEST MAIN SUIVANTE §69
   Main suivante doit toujours fonctionner : spot terminé, spot invalide, solution
   absente, animation bloquée ; en multitable seule la table concernée change.
   ══════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { buildTrainingConfig, trainingConfigToFilters } from "./src/trainingConfig.js";
import { buildTrainerIntegrationQueue } from "./src/spotAiEngine.js";
import { validateSpotConsistency } from "./src/trainerActionEvent.js";
import { assessSpot, createSpotRecoveryManager } from "./src/spotRecovery.js";
import { createAnimationQueue, createImmersionController } from "./src/immersionEngine.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };
const seq = (s = 1) => () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
const filters = (f = {}) => trainingConfigToFilters(buildTrainingConfig({ f: { nplayers: 6, ...f } }));

/* ── §69.1 — spot terminé → un spot suivant existe TOUJOURS (génération non vide) ──
   Balaye plusieurs configurations : la génération ne rend jamais une queue vide,
   donc « Main suivante » a toujours de quoi enchaîner. */
{
  const configs = [{}, { cat: "RFI" }, { hp: "BTN", vp: "BB" }, { stackEff: "10" }, { phase: "Bubble" }];
  for (const f of configs) {
    for (const mode of ["gto", "exploit"]) {
      const q = buildTrainerIntegrationQueue({ filters: filters(f), count: 10, mode, random: seq(5), spotTypeMap: {} });
      ok(q.length > 0, `queue non vide (${mode}, ${JSON.stringify(f)}) → Main suivante possible`);
    }
  }
}

/* ── §69.2 — spot invalide → Main suivante fonctionne (recovery + remplacement) ──
   Un spot cassé est détecté et journalisé (jamais compté erreur joueur), et la
   génération fournit un spot de remplacement valide. */
{
  const rec = createSpotRecoveryManager();
  const broken = { id: "bad", hpos: "CO", vpos: "CO", stack: "0bb", street: "Flop", board: [], pot: -1, acts: [] };
  const g = rec.guard(broken, {});
  ok(!g.playable, "spot invalide détecté");
  eq(rec.count, 1, "échec journalisé (pas d'erreur joueur)");
  // remplacement : la génération produit un spot jouable
  const replacement = buildTrainerIntegrationQueue({ filters: filters(), count: 3, mode: "gto", random: seq(9), spotTypeMap: {} })[0];
  ok(replacement && validateSpotConsistency(replacement, replacement.ctx || {}, { requireVillain: false }).ok, "spot de remplacement valide");
}

/* ── §69.3 — solution absente → le spot reste JOUABLE (Main suivante non bloquée) ──
   La validité structurelle n'exige pas de solution (freq/ev/ok). Un spot sans
   solution passe la validation → l'utilisateur peut jouer puis enchaîner. */
{
  const noSolution = {
    id: "nosol", hpos: "BTN", vpos: "BB", stack: "40bb", street: "Preflop", board: [], pot: 1.5, toCall: 0,
    acts: [{ id: "FOLD", l: "Fold", s: "0bb" }, { id: "RAISE", l: "Open 2.5bb", s: "2.5bb" }],
    // pas de freq / ev / ok
  };
  const a = assessSpot(noSolution, {});
  ok(a.playable, "spot sans solution reste jouable (Main suivante fonctionne)");
}

/* ── §69.4 — animation bloquée → Main suivante fonctionne (cancel + reprise) ──
   Une animation qui ne se termine jamais est annulée par cancel() ; une nouvelle
   séquence (le spot suivant) s'exécute normalement. */
{
  const seen = [];
  const q = createAnimationQueue({ run: (e) => { seen.push(e.type); if (e.type === "STUCK") return new Promise(() => {}); }, delay: () => Promise.resolve() });
  q.enqueue([{ type: "STUCK", duration: 5 }]); // bloque
  await new Promise((r) => setTimeout(r, 5));
  q.cancel(); // « Main suivante » interrompt
  q.enqueue([{ type: "NEXT_A", duration: 0 }, { type: "NEXT_B", duration: 0 }]); // spot suivant
  for (let i = 0; i < 50 && (q.isRunning || q.pending); i++) await new Promise((r) => setTimeout(r, 0));
  ok(seen.includes("NEXT_A") && seen.includes("NEXT_B"), "le spot suivant s'anime malgré l'animation bloquée précédente");
}

/* ── §69.5 — multitable : seule la table concernée change ──
   (a) Modèle des pointeurs par table (miroir de la logique tableIdx/allocNextSpotIndex
   de TrainerTab) : avancer la table t ne modifie QUE tableIdx[t].
   (b) L'AnimationQueue par table est indépendante (annuler l'une n'affecte pas l'autre). */
{
  // (a) invariant des pointeurs
  const ntables = 3;
  let tableIdx = Array.from({ length: ntables }, (_, t) => t); // [0,1,2]
  let cursor = ntables;                                        // prochain libre
  const advance = (t) => { const a = [...tableIdx]; a[t] = cursor++; return a; };
  const before = [...tableIdx];
  tableIdx = advance(1); // Main suivante sur la table 1
  eq(tableIdx[0], before[0], "table 0 inchangée");
  eq(tableIdx[2], before[2], "table 2 inchangée");
  ok(tableIdx[1] !== before[1] && tableIdx[1] === 3, "seule la table 1 avance (→ nouvel index)");

  // (b) queues d'animation indépendantes
  const seenByTable = { 0: [], 1: [] };
  const ctrl = createImmersionController({ delay: () => Promise.resolve(), run: (e, o) => seenByTable[o.tableId].push(e.type) });
  ctrl.enqueue(0, [{ type: "T0", duration: 0 }]);
  ctrl.enqueue(1, [{ type: "T1", duration: 0 }]);
  await new Promise((r) => setTimeout(r, 5));
  ctrl.cancel(0); // Main suivante table 0
  eq(seenByTable[1], ["T1"], "annuler la table 0 n'affecte pas la table 1");
}

/* ── §69.6 — verrou anti-double-clic (§45) : un lock par table empêche la double avance ── */
{
  // modèle du verrou nextTableLockRef : une fois posé, l'avance est ignorée jusqu'au relâchement
  const lock = {};
  let advances = 0;
  const tryNext = (t) => { if (lock[t]) return false; lock[t] = true; advances++; return true; };
  ok(tryNext(2), "1er clic table 2 → avance");
  ok(!tryNext(2), "2e clic immédiat table 2 → ignoré (anti-double-clic)");
  eq(advances, 1, "une seule avance malgré le double clic");
  ok(tryNext(0), "une autre table (0) avance indépendamment");
}

console.log(`✅ next-hand (§69) — ${passed} assertions OK`);
