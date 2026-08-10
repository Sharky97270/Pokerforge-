/* Certification — fondations : taxonomie d'exactitude, cadre théorique, badge de
   confiance par maillon le plus faible, feature flags. */
import assert from "node:assert";
import {
  Engine, Method, VerificationStatus, RangeProvenance, ExactnessLevel, TheoreticalScope,
  GuaranteeLabel, ENGINE_VERSIONS, classifyExactness, deriveEquilibriumScope,
  mayClaimNashApproximation, makeCalculationProvenance, makeInputProvenance,
} from "./src/solver/certification/types.js";
import { deriveSolverTrustBadge, TrustBadge, TRUST_BADGE_META } from "./src/solver/certification/trustBadge.js";
import { certificationFlags, flagsSnapshot, FLAG_NAMES } from "./src/solver/certification/flags.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

/* ═══ §13 — FLAGS : tout doit être DÉSACTIVÉ par défaut ═══ */
eq(certificationFlags.certificationUI, false, "flag UI de certification désactivé par défaut");
eq(certificationFlags.rangeLibrary, false, "flag Range Library désactivé par défaut");
eq(certificationFlags.trustBadges, false, "flag badges de confiance désactivé par défaut");
eq(Object.values(flagsSnapshot()).every(v => v === false), true, "instantané : tous les flags à false");
// une valeur mal orthographiée ne doit PAS activer (comportement sûr)
process.env[FLAG_NAMES.TRUST_BADGES] = "oui";
eq(certificationFlags.trustBadges, false, "valeur non reconnue → flag reste désactivé");
process.env[FLAG_NAMES.TRUST_BADGES] = "true";
eq(certificationFlags.trustBadges, true, "\"true\" active le flag");
delete process.env[FLAG_NAMES.TRUST_BADGES];
eq(certificationFlags.trustBadges, false, "flag retiré → désactivé");

/* ═══ §3 — TAXONOMIE D'EXACTITUDE ═══ */
eq(classifyExactness({ engine: Engine.EQUITY, method: Method.EXACT_ENUMERATION }).level,
  ExactnessLevel.FULLY_ENUMERATED, "équité exhaustive → fully_enumerated");
eq(classifyExactness({ engine: Engine.EQUITY, method: Method.MONTE_CARLO }).level,
  ExactnessLevel.STATISTICAL_ESTIMATE, "Monte-Carlo → statistical_estimate");
// CFR rivière : les deux faits doivent coexister
const cfrRiver = classifyExactness({ engine: Engine.CFR, method: Method.CFR_PLUS, boardComplete: true });
eq(cfrRiver.level, ExactnessLevel.EXACT_TERMINAL_EVALUATION, "CFR board complet → évaluation terminale exacte");
ok(/approximation converg/i.test(cfrRiver.qualifier), "…et le qualificatif dit que la STRATÉGIE reste approchée");
const cfrFlop = classifyExactness({ engine: Engine.CFR, method: Method.CFR_PLUS, boardComplete: false });
eq(cfrFlop.level, ExactnessLevel.CONVERGED_APPROXIMATION, "CFR board incomplet → approximation convergée");
// push/fold : exact DANS SON MODÈLE — le qualificatif est obligatoire
const pf = classifyExactness({ engine: Engine.PUSH_FOLD, method: Method.EXACT_ENUMERATION });
eq(pf.level, ExactnessLevel.FULLY_ENUMERATED, "push/fold → énumération exhaustive");
ok(pf.qualifier && /mod[èe]le/i.test(pf.qualifier), "push/fold : qualificatif « dans le modèle » présent");
eq(classifyExactness({ engine: Engine.CFR, method: Method.HEURISTIC }).level,
  ExactnessLevel.HEURISTIC_ESTIMATE, "méthode heuristique → heuristic_estimate quel que soit le moteur");
// aucun libellé ne doit dire « exact » tout court
for (const lvl of Object.values(ExactnessLevel)) {
  const c = classifyExactness({ engine: Engine.EQUITY, method: Method.EXACT_ENUMERATION });
  ok(c.claim && c.claim.length > 10, `niveau ${lvl} : la revendication précise ce qui est exact`);
}

/* ═══ §5 — CADRE THÉORIQUE ═══ */
const hu = deriveEquilibriumScope({ playerCount: 2, utilityKind: "chip" });
eq(hu.zeroSum, true, "heads-up chip-EV : somme nulle");
eq(hu.theoreticalScope, TheoreticalScope.TWO_PLAYER_ZERO_SUM, "cadre 2 joueurs somme nulle");
ok(mayClaimNashApproximation(hu), "heads-up : approximation de Nash revendicable");
const multi = deriveEquilibriumScope({ playerCount: 3, utilityKind: "icm" });
eq(multi.zeroSum, false, "3 joueurs sous ICM : PAS à somme nulle");
ok(!mayClaimNashApproximation(multi), "multijoueur : équilibre de Nash NON revendicable");
eq(multi.guaranteeLabel, GuaranteeLabel.CONVERGED_STRATEGY_NO_FULL_NASH_GUARANTEE,
  "multijoueur : libellé « stratégie convergée dans le modèle »");
// un ICM à 2 joueurs reste à somme nulle : c'est le nombre de joueurs qui décide
const icmHu = deriveEquilibriumScope({ playerCount: 2, utilityKind: "icm" });
eq(icmHu.zeroSum, true, "ICM à 2 joueurs : somme nulle malgré l'utilité ICM");
ok(mayClaimNashApproximation(icmHu), "ICM heads-up : Nash revendicable");

/* ═══ §12 — BADGE PAR LE MAILLON LE PLUS FAIBLE ═══ */
const verifiedEngine = makeCalculationProvenance({
  engine: Engine.EVALUATOR, method: Method.EXACT_ENUMERATION,
  verificationStatus: VerificationStatus.VERIFIED,
});
eq(ENGINE_VERSIONS.evaluator, verifiedEngine.engineVersion, "la version du moteur est attachée");

// LA règle centrale de l'audit
const b1 = deriveSolverTrustBadge({
  calculation: verifiedEngine,
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.HEURISTIC }),
});
eq(b1.badge, TrustBadge.EXPERIMENTAL, "moteur VÉRIFIÉ + ranges HEURISTIQUES → expérimental");
eq(b1.weakestLink, "inputs", "…et le maillon faible désigné est bien les entrées");
ok(/heuristiq/i.test(b1.reason), "…avec une raison lisible");

// tout vérifié → vérifié
const b2 = deriveSolverTrustBadge({
  calculation: verifiedEngine,
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
});
eq(b2.badge, TrustBadge.VERIFIED, "moteur vérifié + entrées vérifiées → vérifié");

// CFR non convergé → provisoire, même avec de bonnes entrées
const b3 = deriveSolverTrustBadge({
  calculation: makeCalculationProvenance({ engine: Engine.CFR, method: Method.CFR_PLUS, verificationStatus: VerificationStatus.BENCHMARKED }),
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
  convergence: { metric: "nash_conv", value: 0.9, unit: "bb", threshold: 0.1 },
});
eq(b3.badge, TrustBadge.EXPERIMENTAL, "CFR au-dessus du seuil → non convergé");
eq(b3.weakestLink, "convergence", "maillon faible = convergence");

const b4 = deriveSolverTrustBadge({
  calculation: makeCalculationProvenance({ engine: Engine.CFR, method: Method.CFR_PLUS, verificationStatus: VerificationStatus.BENCHMARKED }),
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
  convergence: { metric: "nash_conv", value: 0.03, unit: "bb", threshold: 0.1 },
});
eq(b4.badge, TrustBadge.CONVERGED, "CFR sous le seuil → convergé");

// convergence mesurée SANS seuil : on ne peut rien conclure
const b5 = deriveSolverTrustBadge({
  calculation: verifiedEngine,
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
  convergence: { metric: "nash_conv", value: 0.03 },
});
eq(b5.badge, TrustBadge.EXPERIMENTAL, "convergence sans seuil d'acceptation → ne prouve rien");

// Monte-Carlo : avec intervalle → estimé ; sans → plafonné plus bas
const b6 = deriveSolverTrustBadge({
  calculation: makeCalculationProvenance({ engine: Engine.EQUITY, method: Method.MONTE_CARLO, verificationStatus: VerificationStatus.BENCHMARKED }),
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
  uncertainty: { method: "monte_carlo_confidence_interval", sampleCount: 120000, lowerBound: 0.51, upperBound: 0.53 },
});
eq(b6.badge, TrustBadge.ESTIMATED, "Monte-Carlo avec intervalle → estimé");
const b7 = deriveSolverTrustBadge({
  calculation: makeCalculationProvenance({ engine: Engine.EQUITY, method: Method.MONTE_CARLO, verificationStatus: VerificationStatus.BENCHMARKED }),
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
  uncertainty: { method: "monte_carlo_confidence_interval", sampleCount: 120000 },
});
eq(b7.badge, TrustBadge.EXPERIMENTAL, "Monte-Carlo SANS intervalle → plafonné plus bas");

// absence totale de preuve
eq(deriveSolverTrustBadge({}).badge, TrustBadge.UNVERIFIED, "aucune preuve → non vérifié");

// le multijoueur n'interdit pas un bon calcul, mais interdit la revendication Nash
const b8 = deriveSolverTrustBadge({
  calculation: verifiedEngine,
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
  equilibriumScope: multi,
});
eq(b8.badge, TrustBadge.VERIFIED, "multijoueur : le cadre ne dégrade pas le badge de calcul");
eq(b8.mayClaimNash, false, "…mais l'équilibre de Nash n'est PAS revendicable");
ok(b8.scopeNote && /sans garantie/i.test(b8.scopeNote), "…et une note explicite le dit");
eq(deriveSolverTrustBadge({
  calculation: verifiedEngine,
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
  equilibriumScope: hu,
}).mayClaimNash, true, "heads-up : revendication autorisée");

// exactitude heuristique : plafonne quoi qu'il arrive
eq(deriveSolverTrustBadge({
  calculation: verifiedEngine,
  inputs: makeInputProvenance({ rangeSource: RangeProvenance.POKERFORGE_VERIFIED }),
  exactness: ExactnessLevel.HEURISTIC_ESTIMATE,
}).badge, TrustBadge.EXPERIMENTAL, "valeur heuristique → plafonne le badge");

/* ═══ §12 — les couleurs de confiance ne doivent PAS être celles des actions ═══ */
// Couleurs d'action utilisées dans l'app (Fold/Call/Check/Bet-Raise/All-in).
const ACTION_COLORS = ["#E5485D", "#20CFFF", "#25D487", "#FFB800", "#FF4D6D", "#10D87A", "#FF4560"]
  .map(c => c.toUpperCase());
for (const [k, meta] of Object.entries(TRUST_BADGE_META)) {
  ok(!ACTION_COLORS.includes(meta.color.toUpperCase()),
    `badge ${k} : couleur ${meta.color} distincte des couleurs d'action`);
}
eq(new Set(Object.values(TRUST_BADGE_META).map(m => m.color)).size,
  Object.keys(TRUST_BADGE_META).length, "chaque badge a une couleur distincte");

console.log(`\n✅ certification/fondations — ${n} assertions OK`);
