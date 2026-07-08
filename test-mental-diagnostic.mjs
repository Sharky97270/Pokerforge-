import assert from "node:assert/strict";
import { FULL_MENTAL_DIAGNOSTIC_QUESTIONS, QUICK_MENTAL_DIAGNOSTIC_QUESTIONS } from "./src/data/mentalDiagnosticData.js";
import { calculateMentalDiagnosticResult } from "./src/mentalDiagnosticEngine.js";
import { EMPTY_MENTAL_BEHAVIOR } from "./src/mentalBehaviorTracking.js";

assert.equal(QUICK_MENTAL_DIAGNOSTIC_QUESTIONS.length, 10, "Le diagnostic rapide doit contenir 10 questions");
assert.equal(FULL_MENTAL_DIAGNOSTIC_QUESTIONS.length, 50, "Le diagnostic complet doit contenir 50 questions");

const allQuestions = [...QUICK_MENTAL_DIAGNOSTIC_QUESTIONS, ...FULL_MENTAL_DIAGNOSTIC_QUESTIONS];
assert.equal(new Set(allQuestions.map(question => question.id)).size, allQuestions.length, "Chaque question doit avoir un id unique");
allQuestions.forEach(question => {
  assert.ok(question.category && question.subCategory, `${question.id}: catégorie manquante`);
  assert.ok(question.options.length >= 2, `${question.id}: options manquantes`);
  question.options.forEach(option => assert.ok(Number.isFinite(option.value), `${question.id}: valeur d'option invalide`));
});

for (const mode of ["quick", "full"]) {
  const questions = mode === "quick" ? QUICK_MENTAL_DIAGNOSTIC_QUESTIONS : FULL_MENTAL_DIAGNOSTIC_QUESTIONS;
  for (const value of [0, 4]) {
    const answers = Object.fromEntries(questions.map(question => [question.id, value]));
    const result = calculateMentalDiagnosticResult(answers, EMPTY_MENTAL_BEHAVIOR, [], mode);
    assert.ok(result.globalMentalScore >= 0 && result.globalMentalScore <= 100, `${mode}: score hors limites`);
    assert.ok(result.confidenceScore >= 0 && result.confidenceScore <= 100, `${mode}: confiance hors limites`);
    assert.ok(!Object.values(result).some(item => typeof item === "number" && Number.isNaN(item)), `${mode}: NaN détecté`);
    assert.equal(result.answeredCount, questions.length, `${mode}: réponses non comptabilisées`);
    assert.equal(result.sevenDayPlan.length, 7, `${mode}: plan 7 jours incomplet`);
  }
}

const contradictory = Object.fromEntries(FULL_MENTAL_DIAGNOSTIC_QUESTIONS.map((question, index) => [question.id, index % 2 ? 0 : 4]));
const first = calculateMentalDiagnosticResult(contradictory, EMPTY_MENTAL_BEHAVIOR, [], "full");
const second = calculateMentalDiagnosticResult(contradictory, EMPTY_MENTAL_BEHAVIOR, [first], "full");
assert.ok(second.progressComparison, "La comparaison historique doit être calculée");
assert.ok(second.warnings.some(warning => warning.includes("données observées") || warning.includes("données")), "L'absence de données comportementales doit être signalée");

console.log("mental diagnostic tests passed");
