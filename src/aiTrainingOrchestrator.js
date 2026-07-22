/* ══════════════════════════════════════════════════════════════════════════
   aiTrainingOrchestrator.js — AI TRAINING ORCHESTRATOR (Mission Master §57, Phase 15)

   Transforme une demande en langage naturel en TrainingConfig, puis en
   contraintes résolues, prêtes pour le SpotGenerator :

     NL → TrainingConfig → ConstraintEngine → (SpotGenerator → Validator → Strategy)

   Exemples (§57) :
     « Fais-moi travailler BB vs BTN 20-30bb. » → positions + stack
     « Prépare-moi sur mes leaks. »             → adaptiveMode leak-hunter
     « Je joue une TF ce soir. »                → phase Table Finale + prépa tournoi

   IMPORTANT (§6/§28) : l'orchestrateur NE DÉCIDE PAS de la stratégie GTO. Il ne
   fait que MAPPER une intention utilisateur vers des champs de configuration
   déterministes (mots-clés → TrainingConfig). Aucune invention de solution.

   Module PUR (aucune dépendance React/DOM).
   ══════════════════════════════════════════════════════════════════════════ */

import { buildTrainingConfig, normalizeTrainingConfig, DEFAULT_TRAINING_CONFIG } from "./trainingConfig.js";
import { resolveTrainingConstraints } from "./constraintEngine.js";

/* Presets de stack disponibles (bb) — on aligne toute valeur détectée dessus. */
const STACK_PRESETS = [5, 10, 15, 20, 25, 30, 40, 60, 100, 150, 200];
const POSITIONS = ["UTG+1", "UTG", "LJ", "MP", "HJ", "CO", "BTN", "SB", "BB"]; // UTG+1 avant UTG (matching)

/* Mots-clés → nom de type de spot (§13). */
const SPOT_TYPE_KEYWORDS = [
  [/\bpush\s*\/?\s*fold\b|\bpush(?:\s*or\s*fold)?\b|\bshove\b|\bjam\b/, "Push/Fold"],
  [/\bsqueeze\b/, "Squeeze"],
  [/\b4[\s-]?bet\b/, "4bet"],
  [/\b3[\s-]?bet\b/, "3bet"],
  [/\bc[\s-]?bet\b|\bcontinuation\b/, "C-bet Flop"],
  [/\bcheck[\s-]?raise\b|\bx\/?r\b/, "Check/Raise"],
  [/\bprobe\b/, "Probe Bet"],
  [/\bdonk\b/, "Donk Bet"],
  [/\bturn\s+barrel\b|\bbarrel\b/, "Turn Barrel"],
  [/\bbluff\s*catch\b|\bbluffcatch\b/, "Bluff Catch"],
  [/\bvalue\s*bet\b/, "Value Bet"],
  [/\boverbet\b/, "Overbet"],
  [/\bcall\s*down\b/, "Call Down"],
  [/\bdéfense\s*bb\b|\bdefense\s*bb\b|\bbb\s*defense\b/, "Défense BB"],
  [/\bopen\s*raise\b|\bopen\b|\brfi\b/, "Open Raise"],
  [/\bblind\s*vs\s*blind\b|\bbvb\b/, "Blind vs Blind"],
  [/\briver\b/, "River Decision"],
];

/* Mots-clés → phase de tournoi (§14). */
const PHASE_KEYWORDS = [
  [/\btable\s*finale\b|\bfinal\s*table\b|\btf\b/, "Table Finale"],
  [/\bheads?\s*[- ]?up\b|\btête\s*à\s*tête\b|\bhu\b/, "Heads-Up"],
  [/\btop\s*3\b/, "Top 3"],
  [/\bdemi[- ]?finale\b/, "Demi-finale"],
  [/\bbulle\b|\bbubble\b/, "Bubble"],
  [/\bitm\b|\bin\s*the\s*money\b/, "ITM"],
  [/\blate\s*game\b|\bfin\s*de\s*tournoi\b/, "Late Game"],
  [/\bmiddle\s*game\b|\bmilieu\b/, "Middle Game"],
  [/\bearly\s*game\b|\bdébut\b|\bdebut\b/, "Early Game"],
];

/* Mots-clés → format (id §16 UI, famille interne dérivée par buildTrainingConfig). */
const FORMAT_KEYWORDS = [
  [/\bmystery\b/, { formatDetail: "Mystery KO", format: "MTT Bounty/PKO" }],
  [/\bpko\b|\bprogressive\b/, { formatDetail: "PKO", format: "MTT Bounty/PKO" }],
  [/\bko\b|\bknockout\b|\bbounty\b/, { formatDetail: "KO", format: "MTT Bounty/PKO" }],
  [/\bsatellite\b|\bsate\b/, { formatDetail: "Satellite", format: "MTT ICM" }],
  [/\bsit\s*&?\s*go\b|\bsng\b|\bsit\s*and\s*go\b/, { formatDetail: "Sit&Go", format: "MTT ICM" }],
  [/\bspin\b|\bexpresso\b|\bhyper\b/, { formatDetail: "Expresso / Spin", format: "Spin & Go" }],
  [/\bcash\s*game\b|\bcash\b/, { formatDetail: "Cash Game", format: "Cash 6-max" }],
  [/\bmtt\b|\btournoi\b|\btournament\b/, { formatDetail: "MTT", format: "MTT ChipEV" }],
];

/* Mots-clés → mode adaptatif (id §9). */
const ADAPTIVE_KEYWORDS = [
  [/\bleaks?\b|\bfuites?\b/, "leak-hunter"],
  [/\brévision\b|\brevision\b|\berreurs?\b|\bmistakes?\b/, "review-errors"],
  [/\bintensif\b|\bchallenge\b|\bdifficile\b|\bhard\b/, "intensive"],
  [/\bmental\b|\bfocus\b|\bcalme\b/, "mental-focus"],
  [/\btournoi\b|\btournament\b|\bprépa\b|\bprepa\b|\btf\s*ce\s*soir\b|\bmtt\b/, "tournament-prep"],
];

function nearestStack(bb) {
  return STACK_PRESETS.reduce((best, p) => (Math.abs(p - bb) < Math.abs(best - bb) ? p : best), STACK_PRESETS[0]);
}

/* ──────────────────────────────────────────────────────────────────────────
   parseTrainingRequest — NL → patch de TrainingConfig (champs canoniques).
   Retourne { patch, matched } (matched = liste d'intentions reconnues, pour un
   retour utilisateur type « J'ai compris : … »).
   ────────────────────────────────────────────────────────────────────────── */
export function parseTrainingRequest(text = "") {
  const raw = String(text || "");
  const t = raw.toLowerCase();
  const patch = {};
  const matched = [];
  const note = (intent, value) => matched.push({ intent, value });

  // ── Positions : « X vs Y » → héro X, villain Y ──
  const vsMatch = t.match(/\b(utg\+1|utg|lj|mp|hj|co|btn|sb|bb)\b\s*(?:vs|versus|contre|face à|face a)\s*\b(utg\+1|utg|lj|mp|hj|co|btn|sb|bb)\b/i);
  if (vsMatch) {
    patch.heroPosition = vsMatch[1].toUpperCase();
    patch.villainPosition = vsMatch[2].toUpperCase();
    note("positions", `${patch.heroPosition} vs ${patch.villainPosition}`);
  } else {
    // position héro seule
    for (const p of POSITIONS) {
      const re = new RegExp(`\\b${p.replace("+", "\\+")}\\b`, "i");
      if (re.test(t)) { patch.heroPosition = p; note("heroPosition", p); break; }
    }
  }

  // ── Stack : « 20-30bb » (fourchette) ou « 25bb » ──
  const range = t.match(/(\d+)\s*[-àa]\s*(\d+)\s*bb/);
  const single = t.match(/(\d+)\s*bb/);
  if (range) {
    const mid = (Number(range[1]) + Number(range[2])) / 2;
    patch.stackDepth = String(nearestStack(mid));
    note("stackDepth", `${patch.stackDepth}bb (fourchette ${range[1]}-${range[2]})`);
  } else if (single) {
    patch.stackDepth = String(nearestStack(Number(single[1])));
    note("stackDepth", `${patch.stackDepth}bb`);
  } else if (/\bcourt\b|\bcourte\b|\bshort\b|\btapis\b/.test(t)) {
    patch.stackDepth = "10"; note("stackDepth", "tapis court (10bb)");
  } else if (/\bprofond\b|\bdeep\b/.test(t)) {
    patch.stackDepth = "100"; note("stackDepth", "profond (100bb)");
  }

  // ── Format ──
  for (const [re, val] of FORMAT_KEYWORDS) {
    if (re.test(t)) { Object.assign(patch, val); note("format", val.formatDetail); break; }
  }
  // ── Phase de tournoi ──
  for (const [re, val] of PHASE_KEYWORDS) {
    if (re.test(t)) { patch.tournamentPhase = val; note("tournamentPhase", val); break; }
  }
  // ── Mode adaptatif ──
  for (const [re, val] of ADAPTIVE_KEYWORDS) {
    if (re.test(t)) { patch.adaptiveMode = val; note("adaptiveMode", val); break; }
  }
  // ── Mode GTO / Exploit (§6) ──
  if (/\bexploit\w*\b/.test(t)) { patch.trainingMode = "exploit"; note("trainingMode", "exploit"); }
  else if (/\bgto\b/.test(t)) { patch.trainingMode = "gto"; note("trainingMode", "gto"); }

  // ── Types de spot (multi) ──
  const spotTypes = [];
  for (const [re, name] of SPOT_TYPE_KEYWORDS) {
    if (re.test(t) && !spotTypes.includes(name)) spotTypes.push(name);
  }
  if (spotTypes.length) { patch.spotTypes = spotTypes; note("spotTypes", spotTypes.join(", ")); }

  // ── « mes leaks » / « mains issues de mes HH » → workOn ──
  if (/\bmes\s+leaks?\b|\bmes\s+fuites?\b/.test(t)) {
    patch.workOn = ["Mes leaks détectés"]; patch.adaptiveMode = patch.adaptiveMode || "leak-hunter";
    note("workOn", "Mes leaks détectés");
  }

  // ── Longueur de session ──
  if (/\bsprint\b/.test(t)) { patch.sessionLength = 20; note("sessionLength", 20); }
  else if (/\bmarathon\b/.test(t)) { patch.sessionLength = 100; note("sessionLength", 100); }
  else if (/\billimit\w*\b|\binfini\b/.test(t)) { patch.sessionLength = 999; note("sessionLength", 999); }
  else if (/\bstandard\b/.test(t)) { patch.sessionLength = 50; note("sessionLength", 50); }
  else {
    const spots = t.match(/(\d+)\s*spots?\b/);
    if (spots) {
      const n = [20, 50, 100].reduce((b, p) => (Math.abs(p - Number(spots[1])) < Math.abs(b - Number(spots[1])) ? p : b), 20);
      patch.sessionLength = n; note("sessionLength", n);
    }
  }

  // ── Nombre de tables ──
  const tables = t.match(/(\d)\s*tables?\b/) || t.match(/\b(\d)\s*t\b/);
  if (tables) {
    const n = Math.max(1, Math.min(4, Number(tables[1])));
    patch.tableCount = n; note("tableCount", n);
  }

  return { patch, matched, text: raw };
}

/* ──────────────────────────────────────────────────────────────────────────
   orchestrateTrainingRequest — réalise le flux complet §57 :
   NL → TrainingConfig (fusionné au config de base) → ConstraintEngine.
   Retourne { config, constraints, matched, patch }.
   ────────────────────────────────────────────────────────────────────────── */
export function orchestrateTrainingRequest(text = "", baseConfig = DEFAULT_TRAINING_CONFIG) {
  const { patch, matched } = parseTrainingRequest(text);
  const base = normalizeTrainingConfig(baseConfig);
  const merged = normalizeTrainingConfig({ ...base, ...patch });
  const constraints = resolveTrainingConstraints(merged);
  return {
    config: constraints.resolved, // config jouable (contraintes auto-résolues)
    constraints,
    matched,
    patch,
    understood: matched.length > 0,
  };
}

/* Petit résumé humain des intentions comprises (retour utilisateur). */
export function describeUnderstanding(matched = []) {
  if (!matched.length) return "Je n'ai pas reconnu de critère précis — j'utilise ta configuration actuelle.";
  return "J'ai compris : " + matched.map((m) => `${m.intent} = ${m.value}`).join(" · ");
}
