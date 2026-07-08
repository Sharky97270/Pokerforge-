import { MENTAL_DIAGNOSTIC_SECTIONS, getMentalDiagnosticQuestions } from "./data/mentalDiagnosticData.js";
import { mentalBehaviorSummary } from "./mentalBehaviorTracking.js";

const clamp = value => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
const answerValue = answer => clamp((Number(answer) / 4) * 100);

const LEAK_META = {
  "Tilt bad beat": ["Respiration 3 minutes", "Le résultat du coup déclenche une réponse émotionnelle rapide."],
  "Tilt frustration": ["Recentrage après bad beat", "La frustration réduit la qualité d’attention."],
  "Envie de se refaire": ["Stop-loss mental", "La récupération immédiate pousse vers des décisions forcées."],
  "Spew": ["Journal post-session", "Une erreur peut provoquer une chaîne de décisions impulsives."],
  "Autopilot": ["Anti-autopilot", "La fatigue et le volume favorisent les décisions automatiques."],
  "Peur de perdre": ["Routine warm-up", "La pression financière déforme l’évaluation du risque."],
  "Scared money": ["Routine warm-up", "Le montant engagé prend le dessus sur le processus."],
  "Sommeil": ["Downswing contrôlé", "La fatigue augmente le risque d’autopilot."],
};

const EXERCISES = ["Anti-autopilot", "Respiration 3 minutes", "Stop-loss mental", "Journal post-session", "Routine warm-up", "Downswing contrôlé", "Recentrage après bad beat"];

export function normalizeMentalAnswer(question, rawValue) {
  const risk = answerValue(rawValue);
  return question.polarity === "risk" ? 100 - risk : risk;
}

export function calculateMentalDiagnosticResult(answers = {}, behaviorData = {}, previousResults = [], mode = "full") {
  const questions = getMentalDiagnosticQuestions(mode);
  const answered = questions.filter(question => answers[question.id] !== undefined);
  const weighted = new Map();
  const risks = [];

  answered.forEach(question => {
    const score = normalizeMentalAnswer(question, answers[question.id]);
    const bucket = weighted.get(question.categoryId) || { total: 0, weight: 0 };
    bucket.total += score * question.weight;
    bucket.weight += question.weight;
    weighted.set(question.categoryId, bucket);
    if (question.polarity === "risk") risks.push({
      id: question.id,
      name: question.subCategory,
      riskScore: clamp(100 - score),
      categoryId: question.categoryId,
      weight: question.weight,
    });
  });

  const categoryScores = Object.fromEntries(MENTAL_DIAGNOSTIC_SECTIONS.map(section => {
    const bucket = weighted.get(section.id);
    return [section.id, bucket?.weight ? clamp(bucket.total / bucket.weight) : null];
  }));
  const availableScores = Object.values(categoryScores).filter(Number.isFinite);
  const baseGlobal = availableScores.length ? availableScores.reduce((sum, value) => sum + value, 0) / availableScores.length : 0;
  const sortedRisks = risks.sort((a, b) => (b.riskScore * b.weight) - (a.riskScore * a.weight));
  const topLeaks = sortedRisks.slice(0, 5).map((leak, index) => {
    const [exercise, cause] = LEAK_META[leak.name] || [EXERCISES[index % EXERCISES.length], `Une tendance ${leak.name.toLowerCase()} mérite une vérification sur plusieurs sessions.`];
    const priority = leak.riskScore >= 76 ? "critique" : leak.riskScore >= 56 ? "élevée" : leak.riskScore >= 36 ? "moyenne" : "basse";
    return { ...leak, priority, impact: clamp(leak.riskScore * leak.weight), exercise, cause };
  });

  const completion = questions.length ? answered.length / questions.length : 0;
  const behavior = mentalBehaviorSummary(behaviorData);
  const responseValues = answered.map(question => Number(answers[question.id]));
  const spread = responseValues.length ? Math.max(...responseValues) - Math.min(...responseValues) : 0;
  const contradictionPenalty = responseValues.length >= 8 && spread === 0 ? 8 : 0;
  const confidenceScore = clamp((mode === "full" ? 42 : 28) + completion * (mode === "full" ? 42 : 32) + (behavior.hasObservedData ? 16 : 0) - contradictionPenalty);
  const confidenceLevel = confidenceScore >= 88 ? "très élevée" : confidenceScore >= 70 ? "élevée" : confidenceScore >= 45 ? "moyenne" : "faible";
  const globalMentalScore = clamp(baseGlobal * .92 + 4);
  const level = globalMentalScore >= 85 ? "Elite" : globalMentalScore >= 70 ? "Solide" : globalMentalScore >= 50 ? "En construction" : "Fragile";
  const rootCauses = topLeaks.slice(0, 3).map(leak => ({ title: leak.name, chain: `${leak.cause} → ${leak.exercise} → suivi 7 jours` }));
  const recommendedExercises = [...new Set(topLeaks.map(leak => leak.exercise).concat(EXERCISES))].slice(0, 5);
  const sevenDayPlan = Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    exercise: recommendedExercises[index % recommendedExercises.length],
    objective: index < 2 ? "Observer sans juger" : index < 5 ? "Stabiliser le processus" : "Mesurer les progrès",
    duration: index % 3 === 0 ? 10 : 5,
    indicator: index % 2 === 0 ? "Niveau de tilt /10" : "Décisions conscientes",
  }));
  const previous = previousResults?.[0] || null;
  const progressComparison = previous ? {
    previousScore: previous.globalMentalScore,
    currentScore: globalMentalScore,
    delta: globalMentalScore - previous.globalMentalScore,
  } : null;
  const warnings = [];
  if (answered.length < 10) warnings.push("Données insuffisantes : réponds à davantage de questions pour stabiliser le profil estimé.");
  if (!behavior.hasObservedData) warnings.push(behavior.message);
  if (contradictionPenalty) warnings.push("Réponses très uniformes : cohérence à confirmer avec des données de jeu.");

  return {
    mode,
    completedAt: new Date().toISOString(),
    answeredCount: answered.length,
    totalQuestions: questions.length,
    globalMentalScore,
    confidenceScore,
    confidenceLevel,
    level,
    categoryScores,
    riskScores: Object.fromEntries(topLeaks.map(leak => [leak.name, leak.riskScore])),
    topLeaks,
    rootCauses,
    recommendedExercises,
    sevenDayPlan,
    progressComparison,
    warnings,
    behaviorSummary: behavior,
  };
}
