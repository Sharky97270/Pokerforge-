const FREQUENCY_OPTIONS = [
  { label: "Jamais", value: 0 },
  { label: "Rarement", value: 1 },
  { label: "Parfois", value: 2 },
  { label: "Souvent", value: 3 },
  { label: "Toujours", value: 4 },
];

const ADHERENCE_OPTIONS = [
  { label: "Jamais", value: 0 },
  { label: "Rarement", value: 1 },
  { label: "Parfois", value: 2 },
  { label: "Souvent", value: 3 },
  { label: "Toujours", value: 4 },
];

export const MENTAL_DIAGNOSTIC_SECTIONS = [
  { id: "tilt", title: "Tilt & Émotions", short: "Tilt", icon: "coach" },
  { id: "discipline", title: "Discipline", short: "Discipline", icon: "trainer" },
  { id: "concentration", title: "Concentration", short: "Focus", icon: "solver" },
  { id: "bankroll", title: "Bankroll", short: "Bankroll", icon: "ranges" },
  { id: "routine", title: "Routine & Habitudes", short: "Routine", icon: "settings" },
];

const FIRST_OPTIONS = [
  { label: "Garder mon calme, ça fait partie du jeu", value: 0 },
  { label: "Être un peu agacé mais rester focus", value: 1 },
  { label: "Être frustré et perdre ma concentration", value: 2 },
  { label: "Vouloir me refaire immédiatement", value: 3 },
  { label: "Devenir énervé et jouer n’importe comment", value: 4 },
];

const SECTION_QUESTIONS = {
  tilt: [
    ["badbeat", "Tilt bad beat", "Quand tu perds un gros pot ou subis un bad beat, tu as tendance à :", "risk", 1.3, FIRST_OPTIONS],
    ["frustration", "Tilt frustration", "Après plusieurs coups perdus, ma frustration influence mes décisions.", "risk", 1.2],
    ["injustice", "Sentiment d’injustice", "Une décision adverse chanceuse me semble injuste longtemps après le coup.", "risk", 1],
    ["ego", "Tilt d’ego", "Je veux prouver que je suis meilleur face à un joueur qui me provoque.", "risk", 1.15],
    ["chase", "Envie de se refaire", "Après une perte, je cherche à récupérer rapidement l’argent perdu.", "risk", 1.3],
    ["spew", "Spew", "Après une erreur, il m’arrive d’enchaîner des décisions trop agressives.", "risk", 1.25],
    ["impatience", "Tilt impatience", "Quand les cartes tardent à venir, je force l’action.", "risk", 1],
    ["clarity", "Perte de lucidité", "Sous pression émotionnelle, je distingue moins bien une bonne décision d’un bon résultat.", "risk", 1.2],
    ["error", "Gestion de l’erreur", "Je parviens à accepter une erreur et à revenir immédiatement au processus.", "positive", 1.2],
    ["failed_bluff", "Bluff raté", "Après un bluff raté, je reste capable de jouer la main suivante normalement.", "positive", 1.05],
  ],
  discipline: [
    ["stop_loss", "Respect stop-loss", "Je respecte mon stop-loss même si je me sens capable de continuer.", "positive", 1.25],
    ["planning", "Respect planning", "Je respecte les horaires et la durée prévus pour mes sessions.", "positive", 1],
    ["selection", "Sélection de tournois", "Je sélectionne mes parties selon mon niveau et mon plan, pas selon l’envie du moment.", "positive", 1],
    ["brm", "Respect bankroll", "Je respecte systématiquement mes règles de bankroll.", "positive", 1.3],
    ["move_up", "Montée de limite", "Je monte de limite avant d’avoir validé les critères prévus.", "risk", 1.2],
    ["stop_tired", "Arrêt fatigue", "Je sais arrêter une session lorsque ma lucidité baisse.", "positive", 1.2],
    ["volume", "Volume raisonnable", "J’adapte mon volume à mon énergie réelle.", "positive", 1],
    ["review", "Review régulière", "Je review mes décisions importantes avec régularité.", "positive", 1],
    ["study", "Étude hors table", "Je réserve du temps à l’étude hors des sessions.", "positive", .9],
    ["plan", "Suivi du plan", "Je suis capable de tenir un plan de jeu malgré une mauvaise série.", "positive", 1.15],
  ],
  concentration: [
    ["duration", "Durée de focus", "Je conserve une attention stable pendant toute la durée prévue.", "positive", 1.1],
    ["distractions", "Distractions", "Les notifications ou événements extérieurs détournent mon attention.", "risk", 1],
    ["multitabling", "Multitabling", "Je joue parfois davantage de tables que je peux en gérer correctement.", "risk", 1.2],
    ["phone", "Téléphone", "Je consulte mon téléphone pendant que des décisions sont en cours.", "risk", 1],
    ["autopilot", "Autopilot", "Je clique automatiquement sans reconstruire la situation.", "risk", 1.3],
    ["clarity_drop", "Baisse de lucidité", "Je remarque rapidement quand ma qualité de réflexion baisse.", "positive", 1.1],
    ["fast_decisions", "Décisions rapides", "Je valide certaines décisions trop vite pour éviter l’inconfort.", "risk", 1.2],
    ["too_many_tables", "Tables trop nombreuses", "Je réduis le nombre de tables dès que mon attention se dégrade.", "positive", 1.1],
    ["cognitive_fatigue", "Fatigue cognitive", "La fatigue mentale me fait oublier des informations importantes.", "risk", 1.15],
    ["late_session", "Fin de session", "Mes décisions restent structurées en fin de session.", "positive", 1.05],
  ],
  bankroll: [
    ["fear_loss", "Peur de perdre", "La peur de perdre influence mes calls, folds ou mises.", "risk", 1.3],
    ["scared_money", "Scared money", "Le montant engagé m’empêche parfois de prendre la décision théoriquement correcte.", "risk", 1.3],
    ["shots", "Shots agressifs", "Je prends des shots plus agressifs que mon plan ne le permet.", "risk", 1.2],
    ["move_down", "Refus de redescendre", "J’accepte de redescendre de limite lorsque ma bankroll l’exige.", "positive", 1.3],
    ["financial_pressure", "Pression financière", "J’utilise parfois le poker pour résoudre une pression financière immédiate.", "risk", 1.35],
    ["buy_in", "Buy-in trop élevé", "Certains buy-ins joués sont émotionnellement trop importants pour moi.", "risk", 1.2],
    ["tracking", "Suivi bankroll", "Je connais précisément ma bankroll et mes limites autorisées.", "positive", 1.1],
    ["risk_management", "Gestion du risque", "Mes prises de risque suivent des règles écrites et stables.", "positive", 1.1],
    ["adapted_volume", "Volume adapté", "Mon volume est cohérent avec ma bankroll et ma variance.", "positive", 1],
    ["swings", "Stabilité face aux swings", "Je reste émotionnellement stable pendant les variations de bankroll.", "positive", 1.2],
  ],
  routine: [
    ["warmup", "Routine warm-up", "Je réalise un warm-up structuré avant mes sessions.", "positive", 1.15],
    ["postsession", "Routine post-session", "Je prends quelques minutes pour débriefer après mes sessions.", "positive", 1.1],
    ["journal", "Journal mental", "Je note mes émotions, déclencheurs et décisions clés.", "positive", 1],
    ["breaks", "Pauses", "Je planifie des pauses avant que la fatigue ne s’installe.", "positive", 1],
    ["sleep", "Sommeil", "Je renonce à jouer lorsque mon sommeil est insuffisant.", "positive", 1.25],
    ["sport", "Activité physique", "Mon hygiène de vie soutient régulièrement mon niveau d’énergie.", "positive", .85],
    ["hydration", "Hydratation", "Je prépare eau et environnement avant de lancer une session.", "positive", .8],
    ["preparation", "Préparation", "Je vérifie mon état mental avant de m’asseoir aux tables.", "positive", 1.1],
    ["session_goal", "Objectif de session", "Je définis un objectif de processus mesurable avant de jouer.", "positive", 1],
    ["mistakes", "Analyse des erreurs", "Je transforme mes erreurs en exercices concrets plutôt qu’en jugement personnel.", "positive", 1.15],
  ],
};

export const FULL_MENTAL_DIAGNOSTIC_QUESTIONS = MENTAL_DIAGNOSTIC_SECTIONS.flatMap(section =>
  SECTION_QUESTIONS[section.id].map(([slug, subCategory, text, polarity, weight, options], index) => ({
    id: `${section.id}_${slug}_${String(index + 1).padStart(2, "0")}`,
    category: section.title,
    categoryId: section.id,
    subCategory,
    text,
    type: "single-choice",
    options: options || (polarity === "positive" ? ADHERENCE_OPTIONS : FREQUENCY_OPTIONS),
    weight,
    polarity,
    tags: [section.id, slug, polarity],
  }))
);

const QUICK_SOURCE_IDS = [
  "tilt_badbeat_01", "routine_sleep_05", "concentration_distractions_02",
  "discipline_volume_07", "tilt_spew_06", "discipline_move_up_05",
  "tilt_chase_05", "concentration_duration_01", "tilt_injustice_03", "bankroll_fear_loss_01",
];

export const QUICK_MENTAL_DIAGNOSTIC_QUESTIONS = QUICK_SOURCE_IDS.map((id, index) => {
  const source = FULL_MENTAL_DIAGNOSTIC_QUESTIONS.find(question => question.id === id);
  return { ...source, id: `quick_${String(index + 1).padStart(2, "0")}_${source.id}`, quickIndex: index };
});

export function getMentalDiagnosticQuestions(mode = "full") {
  return mode === "quick" ? QUICK_MENTAL_DIAGNOSTIC_QUESTIONS : FULL_MENTAL_DIAGNOSTIC_QUESTIONS;
}

export const MENTAL_BENEFITS = [
  ["solver", "Analyse avancée", "50+ questions pour un diagnostic complet et précis."],
  ["ranges", "Données réelles", "Basé sur tes réponses et ton comportement sur PokerForge."],
  ["trainer", "Évolution", "Compare tes résultats dans le temps et mesure tes progrès."],
  ["coach", "Coaching IA", "Recommandations personnalisées par le Coach AI."],
  ["legal", "Confidentiel", "Tes données sont privées et sécurisées à 100%."],
];
