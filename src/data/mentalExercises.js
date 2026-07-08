const DIFFICULTIES = ["Débutant", "Intermédiaire", "Avancé", "Pro"];

const CATEGORY_BLUEPRINTS = [
  {
    key: "tilt",
    category: "Tilt & émotions",
    short: "Tilt",
    icon: "⚡",
    color: "#ff5d7a",
    tags: ["tilt", "bad beat", "émotions"],
    recommendedWhen: ["bad_beat", "tilt_score_high", "frustration", "session_live"],
    goal: "Revenir à une décision neutre après une charge émotionnelle.",
    titles: [
      "Reset après bad beat", "Reset après cooler", "Stop revenge tilt", "Tilt d’injustice",
      "Tilt après erreur", "Tilt après setup", "Tilt silencieux", "Tilt de fatigue",
      "Winner tilt", "Overconfidence control", "Spew control", "Reset après hero call raté",
      "Acceptation du suckout", "Reset après bulle", "Stop clic impulsif", "Pause obligatoire 3 minutes",
      "Reconnexion A-game", "Tilt multi-table", "Stop perte de contrôle", "Contrôle de la colère",
      "Bad Beat Simulator", "Tilt Check"
    ],
  },
  {
    key: "concentration",
    category: "Concentration",
    short: "Focus",
    icon: "◎",
    color: "#34d8ff",
    tags: ["focus", "attention", "autopilot"],
    recommendedWhen: ["focus_low", "multitabling", "autopilot", "fatigue_medium"],
    goal: "Ralentir la décision et ramener toute l’attention sur le spot en cours.",
    titles: [
      "Focus tunnel 2 minutes", "Table scan mental", "Attention switching", "Deep focus",
      "Anti-distraction", "Single decision mode", "Présence à la décision", "Lecture lente du spot",
      "Scan stack-position-action", "Contrôle du regard", "Respiration focus", "Recentrage avant décision",
      "10 décisions sans autopilote", "Routine anti-scroll", "Stop multitâche", "A/B/C Game Detector"
    ],
  },
  {
    key: "respiration",
    category: "Respiration & récupération",
    short: "Respiration",
    icon: "↻",
    color: "#20c7ff",
    tags: ["respiration", "stress", "récupération"],
    recommendedWhen: ["stress_high", "after_big_pot", "pre_session", "post_session"],
    goal: "Faire redescendre l’activation physique pour retrouver un rythme stable.",
    titles: [
      "Respiration 60 secondes", "Box breathing 4-4-4-4", "Respiration 4-7-8",
      "Cohérence cardiaque 5 minutes", "Respiration anti-stress", "Respiration pré-session",
      "Respiration post-session", "Respiration après gros pot perdu", "Respiration avant table finale",
      "Respiration anti-panique", "Micro-pause régénérante", "Relâchement épaules/mâchoire",
      "Scan corporel express"
    ],
  },
  {
    key: "discipline",
    category: "Discipline & stop-loss",
    short: "Discipline",
    icon: "◆",
    color: "#1f8bff",
    tags: ["discipline", "stop-loss", "bankroll"],
    recommendedWhen: ["discipline_low", "impulsive_call", "volume_high", "bankroll_pressure"],
    goal: "Transformer une règle décidée à froid en action tenue à chaud.",
    titles: [
      "Définir stop-loss émotionnel", "Respect du stop-loss", "Quitter une session B-game",
      "Pause après 3 erreurs mentales", "Protection bankroll mentale", "Check impulsivité avant call",
      "Refuser le gamble émotionnel", "Stop session forcée", "Discipline de volume",
      "Discipline de review", "Routine de fermeture session"
    ],
  },
  {
    key: "variance",
    category: "Variance & résilience",
    short: "Variance",
    icon: "≈",
    color: "#8f68ff",
    tags: ["variance", "résilience", "downswing"],
    recommendedWhen: ["downswing", "results_oriented", "lost_good_decision", "variance_fatigue"],
    goal: "Séparer qualité de décision, résultat court terme et confiance long terme.",
    titles: [
      "Recentrage EV", "Simulation 10 flips perdus", "Simulation 20 buy-ins down",
      "Variance acceptance", "Courbe EV vs résultat", "Ne pas regarder le résultat",
      "Décision > résultat", "Répéter la logique long terme", "Mentalité volume long terme",
      "Résilience après downswing", "Relecture de mains bien jouées perdues", "Neutralité face au run",
      "Variance Trainer"
    ],
  },
  {
    key: "confiance",
    category: "Confiance",
    short: "Confiance",
    icon: "✦",
    color: "#ffc247",
    tags: ["confiance", "A-game", "motivation"],
    recommendedWhen: ["confidence_low", "comparison", "after_mistake", "motivation_low"],
    goal: "Construire une confiance stable basée sur les preuves de compétence.",
    titles: [
      "Confidence builder", "Journal des bons plays", "Liste de preuves de compétence",
      "Mémoire d’un bon fold", "Mémoire d’un bon hero call", "Reconnexion aux progrès",
      "Confiance stable", "Stop comparaison aux autres", "Se parler comme un coach",
      "Préparer son A-game", "Réactivation motivation"
    ],
  },
  {
    key: "pression",
    category: "Décision sous pression",
    short: "Pression",
    icon: "⏱",
    color: "#ff8a3d",
    tags: ["pression", "bulle", "table finale"],
    recommendedWhen: ["bubble", "final_table", "big_pot", "icm_stress"],
    goal: "Rester lent, précis et lucide quand l’enjeu émotionnel monte.",
    titles: [
      "Spot timer 6 secondes", "Spot timer 10 secondes", "Décision lente sur gros pot",
      "Bubble pressure", "Table finale pressure", "ICM stress control", "All-in decision breathing",
      "Stop peur de bust", "Accepter l’agression", "Neutraliser la pression du gain", "Pressure Timer"
    ],
  },
  {
    key: "fatigue",
    category: "Fatigue & énergie",
    short: "Fatigue",
    icon: "⚙",
    color: "#10d87a",
    tags: ["fatigue", "énergie", "B-game"],
    recommendedWhen: ["fatigue_high", "late_session", "low_energy", "c_game_detected"],
    goal: "Identifier la baisse d’énergie avant qu’elle ne transforme la session en C-game.",
    titles: [
      "Test fatigue 30 secondes", "Test temps de réaction", "Test attention visuelle",
      "Pause hydratation", "Pause étirement", "Micro-sieste recommandée",
      "Détection B-game fatigue", "Arrêter avant C-game", "Routine énergie pré-session"
    ],
  },
  {
    key: "tournoi",
    category: "Préparation tournoi",
    short: "Tournoi",
    icon: "♛",
    color: "#ffd15a",
    tags: ["tournoi", "pré-session", "winaseries"],
    recommendedWhen: ["pre_session", "mtt", "ko", "big_field", "final_table"],
    goal: "Entrer en tournoi avec un contrat mental clair et une énergie maîtrisée.",
    titles: [
      "Warm-up MTT 5 minutes", "Warm-up KO", "Warm-up ICM", "Warm-up table finale",
      "Prépa gros field", "Prépa WinaSeries", "Prépa session longue", "Objectif mental du jour",
      "Contrat mental pré-session", "Visualisation d’un bad beat accepté"
    ],
  },
  {
    key: "postsession",
    category: "Post-session",
    short: "Post-session",
    icon: "▣",
    color: "#6ea8ff",
    tags: ["post-session", "journal", "review"],
    recommendedWhen: ["post_session", "review", "after_session", "mistake_review"],
    goal: "Clôturer proprement la session sans jugement et convertir l’expérience en plan.",
    titles: [
      "Débrief émotionnel", "Débrief A/B/C Game", "Identifier le moment de bascule",
      "3 mains sans jugement", "1 erreur technique / 1 erreur mentale", "Bilan fatigue",
      "Bilan discipline", "Objectif demain", "Journal automatique IA"
    ],
  },
];

const SPECIAL_INTERACTIVE = {
  "Bad Beat Simulator": "bad-beat-simulator",
  "Tilt Check": "tilt-check",
  "A/B/C Game Detector": "abc-detector",
  "Variance Trainer": "variance-trainer",
  "Pressure Timer": "pressure-timer",
};

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function difficultyFor(index) {
  if (index < 4) return "Débutant";
  if (index < 9) return "Intermédiaire";
  if (index < 15) return "Avancé";
  return "Pro";
}

function durationFor(categoryKey, index, title) {
  if (/60 secondes|30 secondes|pause 3 minutes/i.test(title)) return /60 secondes|30 secondes/i.test(title) ? 1 : 3;
  if (/5 minutes|cohérence|warm-up|débrief|journal/i.test(title)) return 5;
  if (categoryKey === "tournoi") return 6 + (index % 4);
  if (categoryKey === "postsession") return 4 + (index % 4);
  return 2 + (index % 5);
}

function xpFor(difficulty, duration) {
  const base = { Débutant: 10, Intermédiaire: 15, Avancé: 20, Pro: 30 }[difficulty] || 15;
  return base + Math.min(10, Math.max(0, duration - 2) * 2);
}

function stepsFor(category, title) {
  const intro = `Identifie le signal principal : ${title.toLowerCase()}.`;
  const breathe = "Pose les mains hors de la souris et respire lentement pendant 20 secondes.";
  const poker = category.key === "variance"
    ? "Répète : ma mission est la décision correcte, pas le résultat immédiat."
    : category.key === "discipline"
      ? "Relis la règle décidée à froid et transforme-la en action observable."
      : category.key === "concentration"
        ? "Reformule le spot : position, stacks, action précédente, range adverse."
        : category.key === "tournoi"
          ? "Écris l’objectif mental du bloc : rythme, patience, pas de résultat."
          : "Reviens à une intention simple : une décision claire, une main à la fois.";
  return [
    intro,
    breathe,
    poker,
    "Note ton niveau mental actuel de 0 à 10.",
    "Reprends uniquement avec un plan clair pour les 3 prochaines décisions.",
  ];
}

function shortDescriptionFor(category, title) {
  const lower = title.toLowerCase();
  if (lower.includes("simulator")) return "Simulation guidée pour apprendre à encaisser un bad beat sans spew.";
  if (lower.includes("check")) return "Questionnaire express pour mesurer ton risque de tilt avant de continuer.";
  if (lower.includes("timer")) return "Exercice de ralentissement avant les décisions sous pression.";
  if (lower.includes("warm-up")) return "Routine courte pour entrer dans la session avec un mental cadré.";
  if (lower.includes("débrief") || lower.includes("journal")) return "Débrief structuré pour transformer la session en apprentissage concret.";
  return `${category.goal} Exercice guidé, rapide et compatible avec une session en cours.`;
}

function buildExercise(category, title, index) {
  const difficulty = difficultyFor(index);
  const duration = durationFor(category.key, index, title);
  const interactive = SPECIAL_INTERACTIVE[title] || null;
  const tags = [...new Set([
    ...category.tags,
    category.short.toLowerCase(),
    ...title.toLowerCase().split(/[\s’'-]+/).filter(word => word.length > 3).slice(0, 4),
  ])];
  return {
    id: `${category.key}_${slugify(title)}`,
    title,
    category: category.category,
    categoryKey: category.key,
    categoryShort: category.short,
    icon: category.icon,
    color: category.color,
    duration,
    xp: xpFor(difficulty, duration),
    difficulty,
    tags,
    shortDescription: shortDescriptionFor(category, title),
    goal: category.goal,
    whenToUse: [
      `Quand ${category.short.toLowerCase()} devient le facteur limitant.`,
      "Avant de continuer une session si la décision suivante risque d’être émotionnelle.",
      "Après une main ou un bloc qui a modifié ton rythme mental.",
    ],
    benefits: [
      "Décisions plus lentes et plus lisibles.",
      "Moins de clics impulsifs.",
      "Meilleure séparation entre émotion, EV et résultat.",
    ],
    steps: stepsFor(category, title),
    recommendedWhen: [...new Set([...category.recommendedWhen, ...tags])],
    mode: interactive ? "interactive" : "guided",
    interactive,
    sortWeight: index,
  };
}

export const MENTAL_EXERCISES = CATEGORY_BLUEPRINTS.flatMap(category =>
  category.titles.map((title, index) => buildExercise(category, title, index))
);

export const MENTAL_EXERCISE_FILTERS = [
  { id: "all", label: "Tous", type: "all" },
  { id: "tilt", label: "Tilt", type: "category", value: "tilt" },
  { id: "concentration", label: "Concentration", type: "category", value: "concentration" },
  { id: "confiance", label: "Confiance", type: "category", value: "confiance" },
  { id: "discipline", label: "Discipline", type: "category", value: "discipline" },
  { id: "variance", label: "Variance", type: "category", value: "variance" },
  { id: "respiration", label: "Respiration", type: "category", value: "respiration" },
  { id: "fatigue", label: "Fatigue", type: "category", value: "fatigue" },
  { id: "pre_session", label: "Pré-session", type: "tag", value: "pré-session" },
  { id: "post_session", label: "Post-session", type: "category", value: "postsession" },
  { id: "tournoi", label: "Tournoi", type: "category", value: "tournoi" },
  { id: "bubble", label: "Bubble", type: "tag", value: "bubble" },
  { id: "final_table", label: "Table finale", type: "tag", value: "table finale" },
  { id: "downswing", label: "Downswing", type: "tag", value: "downswing" },
  { id: "beginner", label: "Débutant", type: "difficulty", value: "Débutant" },
  { id: "intermediate", label: "Intermédiaire", type: "difficulty", value: "Intermédiaire" },
  { id: "advanced", label: "Avancé", type: "difficulty", value: "Avancé" },
  { id: "pro", label: "Pro", type: "difficulty", value: "Pro" },
];

export const MENTAL_EXERCISE_SORTS = [
  { id: "recommended", label: "Recommandé par l’IA" },
  { id: "duration", label: "Durée" },
  { id: "xp", label: "XP" },
  { id: "difficulty", label: "Difficulté" },
  { id: "not_done", label: "Non terminé" },
  { id: "recent", label: "Récemment utilisé" },
];

const DIFFICULTY_RANK = Object.fromEntries(DIFFICULTIES.map((difficulty, index) => [difficulty, index]));

export function mentalExerciseStatus(progress = {}, id) {
  return progress[id]?.status || "non commencé";
}

export function mentalExerciseProgressValue(status) {
  if (status === "terminé") return 100;
  if (status === "en cours") return 45;
  return 0;
}

export function exerciseMatchesFilter(exercise, filterId) {
  const filter = MENTAL_EXERCISE_FILTERS.find(item => item.id === filterId) || MENTAL_EXERCISE_FILTERS[0];
  if (filter.type === "all") return true;
  if (filter.type === "category") return exercise.categoryKey === filter.value;
  if (filter.type === "difficulty") return exercise.difficulty === filter.value;
  if (filter.type === "tag") {
    const needle = filter.value.toLowerCase();
    return exercise.tags.some(tag => tag.toLowerCase().includes(needle)) ||
      exercise.recommendedWhen.some(tag => tag.toLowerCase().includes(needle)) ||
      exercise.title.toLowerCase().includes(needle);
  }
  return true;
}

export function scoreExerciseRecommendation(exercise, mentalState = {}) {
  let score = 0;
  const scores = mentalState.scores || {};
  if (exercise.categoryKey === "tilt" && (scores.tiltControl || 0) < 62) score += 35;
  if (exercise.categoryKey === "concentration" && (scores.concentration || 0) < 65) score += 30;
  if (exercise.categoryKey === "discipline" && (scores.discipline || 0) < 65) score += 28;
  if (exercise.categoryKey === "confiance" && (scores.confidence || 0) < 65) score += 26;
  if (exercise.categoryKey === "variance" && (scores.patience || 0) < 65) score += 24;
  if (exercise.categoryKey === "fatigue" && (mentalState.postReviews || []).some(review => review.score < 55)) score += 18;
  if ((mentalState.downswing || false) && exercise.recommendedWhen.includes("downswing")) score += 25;
  if (exercise.mode === "interactive") score += 8;
  score += Math.max(0, 10 - exercise.sortWeight);
  return score;
}

export function sortMentalExercises(list, sortId, mentalState = {}) {
  const progress = mentalState.mentalExerciseProgress || {};
  const history = mentalState.mentalExerciseHistory || [];
  const recentRank = new Map(history.map((entry, index) => [entry.id, index]));
  return [...list].sort((a, b) => {
    if (sortId === "duration") return a.duration - b.duration || b.xp - a.xp;
    if (sortId === "xp") return b.xp - a.xp || a.duration - b.duration;
    if (sortId === "difficulty") return (DIFFICULTY_RANK[a.difficulty] ?? 9) - (DIFFICULTY_RANK[b.difficulty] ?? 9);
    if (sortId === "not_done") {
      const ad = progress[a.id]?.status === "terminé" ? 1 : 0;
      const bd = progress[b.id]?.status === "terminé" ? 1 : 0;
      return ad - bd || b.xp - a.xp;
    }
    if (sortId === "recent") {
      return (recentRank.get(a.id) ?? 9999) - (recentRank.get(b.id) ?? 9999) || a.title.localeCompare(b.title);
    }
    return scoreExerciseRecommendation(b, mentalState) - scoreExerciseRecommendation(a, mentalState) || b.xp - a.xp;
  });
}

export function recommendMentalExercises(mentalState = {}) {
  const sorted = sortMentalExercises(MENTAL_EXERCISES, "recommended", mentalState);
  const priority = sorted[0];
  const secondary = sorted.find(item => item.categoryKey !== priority?.categoryKey) || sorted[1];
  const mission = priority
    ? `Terminer "${priority.title}" aujourd’hui puis noter le ressenti avant/après.`
    : "Terminer un exercice mental court aujourd’hui.";
  const reminder = priority?.categoryKey === "tilt"
    ? "Si le tilt dépasse 7/10, pause obligatoire avant toute nouvelle décision."
    : priority?.categoryKey === "fatigue"
      ? "Si la fatigue est haute, réduire le volume est une décision gagnante."
      : "La décision correcte prime sur le résultat court terme.";
  return { priority, secondary, mission, reminder };
}
