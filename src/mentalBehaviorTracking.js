export const EMPTY_MENTAL_BEHAVIOR = Object.freeze({
  averageDecisionTime: null,
  bigPotDecisionTime: null,
  actionChangesBeforeValidation: null,
  solutionRevealRate: null,
  sessionAbandonRate: null,
  averageSessionDuration: null,
  performanceDropAfterMinutes: null,
  repeatedPositionErrors: null,
  repeatedStreetErrors: null,
  warmupCompletionRate: null,
  postSessionCompletionRate: null,
  exerciseProgress: null,
  sessionFrequency: null,
  averageTechnicalScore: null,
});

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getMentalBehaviorData(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem("pf_mental_behavior");
    if (!raw) return { ...EMPTY_MENTAL_BEHAVIOR, status: "insufficient" };
    const parsed = JSON.parse(raw);
    const normalized = Object.fromEntries(Object.keys(EMPTY_MENTAL_BEHAVIOR).map(key => [key, finiteOrNull(parsed?.[key])]));
    const availableCount = Object.values(normalized).filter(value => value !== null).length;
    return { ...normalized, status: availableCount >= 5 ? "available" : "insufficient", availableCount };
  } catch {
    return { ...EMPTY_MENTAL_BEHAVIOR, status: "insufficient" };
  }
}

export function mentalBehaviorSummary(data = EMPTY_MENTAL_BEHAVIOR) {
  const availableCount = Object.keys(EMPTY_MENTAL_BEHAVIOR).filter(key => data?.[key] !== null && data?.[key] !== undefined).length;
  return {
    availableCount,
    hasObservedData: availableCount >= 5,
    message: availableCount >= 5
      ? "Les réponses sont recoupées avec des données comportementales PokerForge."
      : "Je n’ai pas encore assez de données observées, cette analyse repose principalement sur tes réponses.",
  };
}
