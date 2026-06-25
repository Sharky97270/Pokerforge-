/* ════════════════════════════════════════════════════════════════════════
   PokerForge — SYSTÈME D'AGENTS SPÉCIALISÉS COACH AI
   ------------------------------------------------------------------------
   Coach AI = une ÉQUIPE de coachs, pas un chatbot générique.
   8 agents déterministes + un orchestrateur central (CoachAIOrchestrator).

   Entrée  : le résultat du moteur (analyzeHandHistory de coachEngine.js)
             + des options (profil vilain, field, suivi mental, historique…).
   Sortie  : CoachAIAnalysis { handSummary, score, gtoInsight, exploitInsight,
             icmInsight, leakInsight, mentalInsight, careerInsight, agents,
             suggestedActions, trainerHandoff, planUpdates, careerUpdates, warnings }

   Logique d'intervention : tous les agents ne parlent pas toujours.
   Le Mental Coach reste TOUJOURS visible dans la colonne agents.
═══════════════════════════════════════════════════════════════════════════ */

/* ───────── Profils vilain & field (pour l'Exploit Advisor) ───────── */
const VILLAIN_PROFILES = {
  fish:    { label: "Fish passif",      adj: { valueThin: +2, bluff: -2, foldTo: -2 } },
  station: { label: "Calling station",  adj: { valueThin: +3, bluff: -3, foldTo: -3 } },
  nit:     { label: "Nit",              adj: { valueThin: -1, bluff: +2, foldTo: +3, steal: +2 } },
  tag:     { label: "Reg TAG",          adj: { valueThin: 0, bluff: 0, foldTo: 0 } },
  lag:     { label: "LAG",              adj: { valueThin: +1, bluff: -1, foldTo: -1, callDown: +2 } },
  bounty:  { label: "Bounty hunter",    adj: { valueThin: +2, bluff: -2, foldTo: -2 } },
};
const FIELDS = {
  low: { label: "Field low stakes", note: "Field exploitable : value épaisse, peu de bluffs, peu de hero-folds." },
  mid: { label: "Field mid stakes", note: "Field équilibré : reste proche du GTO, exploite seulement les écarts marqués." },
  high:{ label: "Field high stakes", note: "Field tough : équilibre tes ranges, attention aux contre-exploits." },
};

/* ───────── Helpers ───────── */
function aHeroSeat(norm) { return (norm.players || []).find(p => p.isHero) || null; }
function aHeroStackBb(norm) { const h = aHeroSeat(norm); return h ? h.stackBb : null; }
function aCardRank(c) { const r = String(c).slice(0, -1); return { "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14 }[r] || parseInt(r) || 0; }
function aBoardTexture(boardArr) {
  // boardArr = ["Tc","6h","2s"] (strings). Analyse simple de texture flop.
  const cards = (boardArr || []).slice(0, 3);
  if (cards.length < 3) return { wet: false, paired: false, suited: false, connected: false, label: "—" };
  const ranks = cards.map(aCardRank).sort((a, b) => b - a);
  const suits = cards.map(c => String(c).slice(-1));
  const paired = ranks[0] === ranks[1] || ranks[1] === ranks[2];
  const suited = suits[0] === suits[1] && suits[1] === suits[2];
  const twoTone = new Set(suits).size === 2;
  const span = ranks[0] - ranks[2];
  const connected = span <= 4 && !paired;
  const wet = suited || twoTone || connected;
  const label = paired ? "appariée" : suited ? "monocolore" : connected ? "connectée" : twoTone ? "bicolore" : "sèche";
  return { wet, paired, suited, connected, twoTone, label };
}
function aStreetFr(st) { return { preflop: "Préflop", flop: "Flop", turn: "Turn", river: "River" }[st] || st; }
function aPotType(norm) {
  const pf = norm.actionsByStreet.preflop || [];
  const raises = pf.filter(a => ["raise", "allin"].includes(a.type)).length;
  if (raises >= 3) return "4-bet+";
  if (raises === 2) return "3-bet pot";
  if (raises === 1) return "Single raised pot";
  return "Limped pot";
}

/* ════════════════════ 1. HAND ANALYST ════════════════════ */
function agentHandAnalyst(norm, engine) {
  const kd = engine.analysisSummary.keyDecision;
  const heroIP = ["BTN", "CO", "HJ"].includes(norm.heroPos);
  const techTags = [];
  techTags.push(aPotType(norm));
  techTags.push(heroIP ? "IP" : "OOP");
  if (norm.heroCards && norm.heroCards.length >= 2) techTags.push(norm.heroCards.map(c => (c && c.r ? c.r + c.s : String(c))).join(" "));
  if (kd) techTags.push(`décision ${aStreetFr(kd.street)}`);
  if (norm.showdown) techTags.push("showdown");
  // line alternative : si une erreur touche la street clé, propose l'inverse
  let alt = null;
  const m = (engine.mistakes || []).find(x => kd && x.street === kd.street);
  if (m) {
    if (/big-call|hero-call|cold-call|call/.test(m.tag)) alt = "Envisage un fold (ou un raise polarisé) plutôt que de payer passivement.";
    else if (/limp/.test(m.tag)) alt = "Open-raise au lieu de limper, ou fold les mains trop faibles.";
    else if (/overbet|tiny|sizing/.test(m.tag)) alt = "Recalibre la taille de mise vers un sizing standard adapté à la texture.";
    else if (/station|passive/.test(m.tag)) alt = "Prends l'initiative (bet/raise) ou lâche, évite de suivre par inertie.";
    else alt = "Une line plus disciplinée existe — voir Leak Detective.";
  }
  return {
    active: true,
    summary: engine.analysisSummary.lineSummary,
    keyDecision: kd,
    heroAction: kd ? kd.heroAction : "—",
    alternativeLine: alt,
    techTags,
  };
}

/* ════════════════════ 2. GTO ANALYST ════════════════════ */
function agentGtoAnalyst(norm, engine) {
  const kd = engine.analysisSummary.keyDecision;
  const evLoss = (engine.mistakes || []).reduce((a, m) => a + (m.evLossBb || 0), 0);
  // sizing recommandé selon street + texture
  let sizing = "Sizing standard adapté à la texture.";
  if (kd && kd.street !== "preflop") {
    const tex = aBoardTexture(norm.boardByStreet.flop);
    if (kd.street === "flop") sizing = tex.wet ? "Flop humide → 66–75% pot (protection/déni d'équité)." : "Flop sec → 25–33% pot (range bet).";
    else if (kd.street === "turn") sizing = "Turn → 60–75% pot pour polariser et charger le pot.";
    else if (kd.street === "river") sizing = "River → choisis entre value (66–100% pot) et bluff polarisé ; sinon check.";
  } else {
    sizing = norm.gameType === "tournament" ? "Open 2–2.3bb (MTT), 3-bet 3x IP / 4x OOP." : "Open 2.2–2.5bb, 3-bet 3x IP / 4x OOP.";
  }
  // meilleure action
  let bestAction, explanation;
  const m = kd ? (engine.mistakes || []).find(x => x.street === kd.street) : null;
  if (m) {
    bestAction = "Action à corriger";
    explanation = m.text;
  } else if (kd) {
    bestAction = `${kd.heroAction} défendable`;
    explanation = "Ta décision est cohérente avec une stratégie d'équilibre raisonnable sur ce spot.";
  } else {
    bestAction = "Line globalement saine";
    explanation = "Aucune décision critique isolée.";
  }
  return {
    active: true,
    bestAction, sizing,
    frequency: "Fréquences exactes non disponibles (nécessite un solver complet).",
    evLossBb: Math.round(evLoss * 100) / 100,
    explanation,
    disclaimer: engine.scoreData.disclaimer,
  };
}

/* ════════════════════ 3. EXPLOIT ADVISOR ════════════════════ */
function agentExploitAdvisor(norm, engine, opt) {
  const prof = VILLAIN_PROFILES[opt.villainProfile];
  const field = FIELDS[opt.field];
  if (!prof && !field) return { active: false };
  let line = [], potentialError = null, reco = null;
  if (prof) {
    const a = prof.adj;
    if (a.valueThin >= 2) { line.push("Value-bet plus fin (3 streets de value avec tes mains moyennes-fortes)."); reco = "Élargis ta value, réduis les bluffs."; }
    if (a.bluff <= -2) { line.push("Coupe les bluffs : ce profil paie trop."); potentialError = "Bluffer un joueur qui ne fold jamais = brûler des jetons."; }
    if (a.foldTo >= 2) { line.push("Augmente tes bluffs et tes vols : ce profil sur-fold."); potentialError = "Payer ses rares mises de value = perdre gros."; }
    if (a.steal >= 2) line.push("Vole plus large ses blindes / open-folds.");
    if (a.callDown >= 2) { line.push("Élargis tes call-downs : il bluffe trop."); }
    if (opt.villainProfile === "tag") { line.push("Vise ses ranges cappées (sur-fold turn/river) et attaque les spots où il check."); reco = "Reste équilibré, exploite seulement les écarts nets."; }
    if (opt.villainProfile === "bounty") { line.push("Il paie large pour la prime → value épaisse, bluffs réduits, attention aux call-offs."); potentialError = "Bluffer un bounty-hunter incentivé à payer."; }
  }
  if (field) line.push(field.note);
  return {
    active: true,
    profile: prof ? prof.label : null,
    field: field ? field.label : null,
    exploitLine: line,
    fieldAdaptation: field ? field.note : (prof ? `Adapté au profil ${prof.label}.` : null),
    potentialError,
    recommendation: reco || "Ajuste l'amplitude de l'exploit à ta lecture réelle du vilain.",
  };
}

/* ════════════════════ 4. ICM / PKO EXPERT ════════════════════ */
function agentIcmExpert(norm, engine, opt) {
  if (norm.gameType !== "tournament") return { active: false };
  const stack = aHeroStackBb(norm);
  const stage = opt.tourStage || "auto";
  const tt = norm.tournamentType || "Regular";
  const isBounty = /KO|PKO|Mystery|Bounty/i.test(tt);
  let pressure, adjustment, bustRisk;
  if (stack == null) { pressure = "inconnue"; }
  else if (stack <= 12) { pressure = "très short (push/fold)"; }
  else if (stack <= 25) { pressure = "short (resteal / shove large)"; }
  else if (stack <= 45) { pressure = "moyen (jeu prudent en pots multiway)"; }
  else { pressure = "profond (joue post-flop normalement)"; }

  const tight = (stage === "bubble" || stage === "ft" || (stack != null && stack <= 25));
  if (isBounty) {
    adjustment = "PKO/KO : call un peu plus LARGE quand tu couvres (la prime ajoute de l'EV), mais reste discipliné quand tu es couvert.";
  } else if (tight) {
    adjustment = "Contexte ICM tendu (bulle/FT/short) : resserre les call-offs marginaux, privilégie la survie aux jetons.";
  } else {
    adjustment = "ICM modéré : accumule des jetons sans prendre de flips marginaux inutiles.";
  }
  bustRisk = (stack != null && stack <= 20 && (engine.analysisSummary.keyDecision?.heroAction || "").match(/All-in|Call/i))
    ? "Élevé — une élimination ici coûte cher en équité tournoi."
    : "Modéré.";

  return {
    active: true,
    stage: stage === "auto" ? "déduit du stack" : stage,
    tournamentType: tt,
    icmImpact: `Pression de stack : ${pressure}. ${tight ? "L'ICM pèse fortement sur les décisions marginales." : "L'ICM reste un facteur secondaire ici."}`,
    bountyImpact: isBounty ? "Prime en jeu : la valeur d'élimination justifie des call-offs plus larges quand tu couvres le vilain." : "Pas de bounty.",
    adjustment,
    bustRisk,
    stackPressure: pressure,
    note: "Estimation ICM heuristique — un calcul ICM exact nécessite les stacks de toute la table et la structure des paliers.",
  };
}

/* ════════════════════ 5. LEAK DETECTIVE ════════════════════ */
const LEAK_FAMILY = {
  "preflop:open-limp": "Préflop — entrées passives",
  "preflop:sb-limp": "Préflop — jeu SB",
  "preflop:cold-call-oop": "Préflop — défense OOP",
  "sizing:open-large": "Sizing — préflop",
  "sizing:overbet": "Sizing — postflop",
  "sizing:tiny": "Sizing — postflop",
  "postflop:no-cbet": "Postflop — c-bet",
  "postflop:donk": "Postflop — lines OOP",
  "postflop:station": "Discipline — passivité",
  "postflop:passive": "Discipline — agressivité",
  "river:big-call": "River — bluff-catch",
  "river:hero-call": "River — bluff-catch",
};
// Les tags de mistake (river:big-call, postflop:station) → tag de leak canonique (clé des recos/drills).
const MISTAKE_TO_LEAK = {
  "river:big-call": "river:hero-call",
  "postflop:station": "postflop:passive",
};
function agentLeakDetective(norm, engine, opt) {
  const mistakes = engine.mistakes || [];
  if (!mistakes.length && !(engine.leakTags || []).length) return { active: false };
  // leak principal = mistake de plus haute gravité
  const sorted = [...mistakes].sort((a, b) => (b.severity || 0) - (a.severity || 0) || (b.evLossBb || 0) - (a.evLossBb || 0));
  const top = sorted[0];
  const rawTag = top ? top.tag : engine.leakTags[0];
  const tag = MISTAKE_TO_LEAK[rawTag] || rawTag;   // tag canonique
  const pastLeaks = opt.pastLeaks || [];
  const freq = pastLeaks.filter(t => t === tag || t === rawTag).length;
  const severity = top ? top.severity : 1;
  const priority = Math.min(100, severity * 25 + freq * 12);
  const reco = (engine.trainingRecommendations || []).find(r => r.leak === tag) || (engine.trainingRecommendations || [])[0] || null;
  return {
    active: true,
    mainLeak: top ? top.text : tag,
    tag,
    family: LEAK_FAMILY[tag] || "Général",
    severity,
    severityLabel: severity >= 3 ? "Majeur" : severity === 2 ? "Moyen" : "Mineur",
    frequency: freq,
    frequencyLabel: freq >= 3 ? `Récurrent (${freq}× dans ton historique)` : freq >= 1 ? `Déjà vu ${freq}× ` : "1ʳᵉ occurrence",
    priority,
    drill: reco ? reco.drill : null,
    drillLabel: reco ? reco.label : "Drill ciblé",
  };
}

/* ════════════════════ 6. TRAINING BUILDER ════════════════════ */
function agentTrainingBuilder(norm, engine, leakInsight) {
  if (!leakInsight || !leakInsight.active) return { active: false };
  const drill = leakInsight.drill || { trainerMode: "spot" };
  const trainerParams = {
    hpos: norm.heroPos !== "?" ? norm.heroPos : "BTN",
    vpos: (norm.players.find(p => !p.isHero && p.pos && p.pos !== norm.heroPos) || {}).pos || "BB",
    street: aStreetFr(engine.analysisSummary.keyDecision?.street || "preflop"),
    tableSize: norm.tableSize,
    ...drill,
  };
  return {
    active: true,
    drillTemplate: { label: `20 spots — ${leakInsight.drillLabel}`, count: 20, ...drill },
    trainerParams,
    missionPlan: { label: `Mission hebdo : corriger « ${leakInsight.family} »`, target: 100, leak: leakInsight.tag },
    nextBestAction: leakInsight.severity >= 2 ? "Lance un drill de 20 spots dès maintenant." : "Ajoute ce leak à ton plan et révise-le cette semaine.",
  };
}

/* ════════════════════ 7. MENTAL COACH (agent central) ════════════════════ */
function agentMentalCoach(norm, engine, opt) {
  const flags = [];
  const kd = engine.analysisSummary.keyDecision;
  const heroResult = norm.heroResultBb;
  const decisionMs = opt.decisionMs || null;

  // 1) Hero call river important → ego/hero call
  if ((engine.leakTags || []).includes("river:hero-call")) {
    flags.push({
      patternType: "Hero call forcé / ego call",
      reflectionQuestion: "Avant de payer river : quelle portion de bluffs réaliste le vilain a-t-il vraiment dans cette ligne ?",
      advice: "Ajoute une étape mentale d'1 question avant chaque call river coûteux.",
      correctiveRoutine: "Règle des 3R : Range du vilain → Ratio value/bluff → Réelle nécessité de payer.",
      mentalExercise: "Exercice « bluff-catch lucide » (Mental Game).",
      warmup: null,
      stopLoss: null,
    });
  }
  // 2) ICM / peur de bust / chip chasing
  if (norm.gameType === "tournament") {
    const stack = aHeroStackBb(norm);
    if (stack != null && stack <= 25 && /All-in|Call|Bet|Raise/i.test(kd?.heroAction || "")) {
      flags.push({
        patternType: "Pression ICM — survie vs jetons",
        reflectionQuestion: "Ce spot privilégie-t-il le gain de jetons immédiat au détriment de ta survie tournoi ?",
        advice: "Sous pression ICM, la survie a souvent plus de valeur qu'un flip marginal.",
        correctiveRoutine: "Avant un call-off short : me demander « est-ce que je couvre / suis-je couvert ? ».",
        mentalExercise: "Visualisation « deep run » avant la bulle.",
        warmup: "Warm-up ICM (rappel des paliers).",
        stopLoss: null,
      });
    }
  }
  // 3) Sizing impulsif sous pression
  if ((engine.leakTags || []).some(t => t.startsWith("sizing:"))) {
    flags.push({
      patternType: "Sizing impulsif",
      reflectionQuestion: "As-tu comparé 2 tailles de mise avant de cliquer ?",
      advice: "Prends 5 secondes pour comparer 2 sizings (value vs déni d'équité) avant chaque mise.",
      correctiveRoutine: "Routine « 2 sizings » : nommer 2 tailles possibles, choisir selon l'objectif.",
      mentalExercise: "Drill sizing (Entraîneur, mode Street).",
      warmup: null,
      stopLoss: null,
    });
  }
  // 4) Grosse perte → tilt / envie de se refaire
  if (heroResult != null && heroResult <= -25) {
    flags.push({
      patternType: "Risque de tilt / envie de se refaire",
      reflectionQuestion: "Après cette main, ton prochain spot sera-t-il joué à froid ou pour « te refaire » ?",
      advice: "Une grosse perte ne justifie jamais un relâchement de discipline sur la main suivante.",
      correctiveRoutine: "Respiration 3× + relecture du process avant de continuer.",
      mentalExercise: "Reset anti-tilt (Mental Game).",
      warmup: null,
      stopLoss: "Si 2ᵉ grosse perte d'affilée : pause de 5 min (stop-loss mental).",
    });
  }
  // 5) Passivité / autopilot
  if ((engine.leakTags || []).includes("postflop:passive")) {
    flags.push({
      patternType: "Autopilot / passivité",
      reflectionQuestion: "As-tu suivi par habitude, ou avec un vrai plan pour les streets suivantes ?",
      advice: "Joue avec intention : chaque call doit avoir un plan turn/river.",
      correctiveRoutine: "Avant de payer : « quel est mon plan si la prochaine carte change tout ? ».",
      mentalExercise: "Exercice de concentration / présence.",
      warmup: "Warm-up focus (3 min) avant session.",
      stopLoss: null,
    });
  }
  // 6) Précipitation (si temps de décision dispo et très court sur une grosse décision)
  if (decisionMs != null && decisionMs < 2500 && kd && kd.potBb > 20) {
    flags.push({
      patternType: "Précipitation",
      reflectionQuestion: "Décision rapide sur un gros pot : as-tu pris le temps d'évaluer les ranges ?",
      advice: "Sur les gros pots, impose-toi un délai minimum de réflexion.",
      correctiveRoutine: "Compter jusqu'à 3 avant d'agir sur tout pot > 20bb.",
      mentalExercise: "Routine tempo (Mental Game).",
      warmup: null,
      stopLoss: null,
    });
  }

  const active = opt.mentalTracking || flags.length > 0;
  // Si suivi activé mais aucun pattern : message de renforcement positif
  if (active && !flags.length) {
    flags.push({
      patternType: "Discipline OK",
      reflectionQuestion: "Qu'est-ce qui a rendu cette décision lucide ? (à reproduire)",
      advice: "Pas de signal émotionnel négatif détecté — bonne maîtrise sur cette main.",
      correctiveRoutine: "Continue ta routine pré-décision habituelle.",
      mentalExercise: null, warmup: null, stopLoss: null,
    });
  }
  return { active, flags, emotionalSpot: flags.some(f => /tilt|ego|précipitation|ICM/i.test(f.patternType)) };
}

/* ════════════════════ 8. CAREER COACH ════════════════════ */
function agentCareerCoach(norm, engine, leakInsight, opt) {
  const score = engine.scoreData.score;
  const goal = opt.careerGoal || null; // {id,label} éventuel
  const masteryImpact = score >= 85 ? "+ Maîtrise confirmée sur ce type de spot."
    : score >= 70 ? "+ Légère progression — spot globalement bien joué."
    : score >= 50 ? "± Spot à consolider pour progresser."
    : "− Spot identifié comme axe de travail prioritaire.";
  let goalLink = goal ? `Objectif actif : ${goal.label || goal}.` : "Aucun objectif Career Mode actif — en choisir un accélère ta progression.";
  if (leakInsight && leakInsight.active && goal) goalLink += ` Ce leak (« ${leakInsight.family} ») impacte directement ta progression.`;
  return {
    active: true,
    masteryImpact,
    goalLink,
    progressionReco: score >= 70 ? "Maintiens le rythme et varie les spots travaillés." : "Concentre ta prochaine session sur le leak principal détecté.",
    careerMission: leakInsight && leakInsight.active ? `Career : résoudre « ${leakInsight.family} » (objectif maîtrise 80%).` : "Career : enchaîner 3 sessions de review propres.",
  };
}

/* ════════════════════ ORCHESTRATEUR CENTRAL ════════════════════ */
function CoachAIOrchestrator(engine, options = {}) {
  const warnings = [...(engine.parseWarnings || [])];
  if (!engine || !engine.ok) {
    return { ok: false, error: engine?.error || "Analyse moteur indisponible.", warnings };
  }
  const norm = engine.normalized;
  const opt = options || {};

  // ── Exécution conditionnelle des agents ──
  const handSummary = agentHandAnalyst(norm, engine);
  const gtoInsight = agentGtoAnalyst(norm, engine);
  const exploitInsight = agentExploitAdvisor(norm, engine, opt);
  const icmInsight = agentIcmExpert(norm, engine, opt);
  const leakInsight = agentLeakDetective(norm, engine, opt);
  const trainerHandoff = agentTrainingBuilder(norm, engine, leakInsight);
  const mentalInsight = agentMentalCoach(norm, engine, opt);
  const careerInsight = agentCareerCoach(norm, engine, leakInsight, opt);

  // ── Colonne d'agents (toujours présents, statut actif/veille) ──
  const agents = [
    { id: "hand",    name: "Hand Analyst",    icon: "🃏", color: "#34D8FF", active: true,
      headline: handSummary.heroAction, lines: [handSummary.summary, handSummary.alternativeLine && ("Alternative : " + handSummary.alternativeLine)].filter(Boolean), tags: handSummary.techTags },
    { id: "gto",     name: "GTO Analyst",     icon: "📐", color: "#10D87A", active: true,
      headline: gtoInsight.bestAction, lines: [gtoInsight.explanation, "Sizing : " + gtoInsight.sizing, gtoInsight.evLossBb ? `EV estimée perdue ≈ ${gtoInsight.evLossBb}bb` : null, gtoInsight.frequency].filter(Boolean) },
    { id: "exploit", name: "Exploit Advisor", icon: "🎯", color: "#FF8A3D", active: exploitInsight.active,
      headline: exploitInsight.active ? (exploitInsight.profile || exploitInsight.field || "Adaptation field") : "Renseigne un profil vilain / field",
      lines: exploitInsight.active ? [...(exploitInsight.exploitLine || []), exploitInsight.potentialError && ("⚠ " + exploitInsight.potentialError), exploitInsight.recommendation].filter(Boolean) : ["En veille — sélectionne un profil de vilain ou un field pour activer l'analyse exploitante."] },
    { id: "icm",     name: "ICM / PKO Expert", icon: "🏆", color: "#FFC247", active: icmInsight.active,
      headline: icmInsight.active ? icmInsight.stackPressure : "Hors tournoi",
      lines: icmInsight.active ? [icmInsight.icmImpact, icmInsight.bountyImpact, icmInsight.adjustment, "Risque de bust : " + icmInsight.bustRisk, icmInsight.note].filter(Boolean) : ["En veille — aucun contexte tournoi détecté."] },
    { id: "leak",    name: "Leak Detective",  icon: "🔍", color: "#FF4560", active: leakInsight.active,
      headline: leakInsight.active ? `${leakInsight.family} · ${leakInsight.severityLabel}` : "Aucun leak majeur",
      lines: leakInsight.active ? [leakInsight.mainLeak, leakInsight.frequencyLabel, `Priorité de travail : ${leakInsight.priority}/100`, "Drill : " + leakInsight.drillLabel].filter(Boolean) : ["Aucune fuite flagrante sur cette main — continue ton review."] },
    { id: "training",name: "Training Builder", icon: "🛠️", color: "#9B5CFF", active: trainerHandoff.active,
      headline: trainerHandoff.active ? trainerHandoff.drillTemplate.label : "En attente d'un leak",
      lines: trainerHandoff.active ? [trainerHandoff.nextBestAction, trainerHandoff.missionPlan.label].filter(Boolean) : ["S'active après détection d'un leak ou d'une erreur importante."] },
    { id: "mental",  name: "Mental Coach",    icon: "🧠", color: "#FF5D9E", active: mentalInsight.active, central: true,
      headline: mentalInsight.active ? (mentalInsight.flags[0]?.patternType || "Suivi mental") : "Active le suivi mental",
      lines: mentalInsight.active ? mentalInsight.flags.map(f => f.advice) : ["En veille — active le suivi mental ou laisse-moi détecter un pattern émotionnel."] },
    { id: "career",  name: "Career Coach",    icon: "🚀", color: "#34D8FF", active: true,
      headline: careerInsight.masteryImpact, lines: [careerInsight.goalLink, careerInsight.progressionReco].filter(Boolean) },
  ];

  // ── Actions concrètes (obligatoires) ──
  const suggestedActions = [
    { id: "replay-trainer", label: "Rejouer ce spot dans l'entraîneur", icon: "🎯" },
    { id: "drill-similar",  label: "Créer un drill de spots similaires", icon: "🧩" },
    { id: "add-leak-plan",  label: "Ajouter le leak à mon plan", icon: "📅", disabled: !leakInsight.active },
    { id: "add-mental-note",label: "Ajouter une note mentale", icon: "📝" },
    { id: "add-mental-routine", label: "Ajouter une routine mentale", icon: "🧘", disabled: !mentalInsight.active },
    { id: "compare-hands",  label: "Comparer avec mes autres mains", icon: "📊" },
    { id: "save-tag",       label: "Sauvegarder / taguer la main", icon: "🔖" },
    { id: "open-replayer",  label: "Ouvrir dans le replayer", icon: "📽️" },
  ];

  // ── Mises à jour de plan / career (proposées, appliquées par l'UI) ──
  const planUpdates = leakInsight.active ? [{ leak: leakInsight.tag, family: leakInsight.family, priority: leakInsight.priority, drill: leakInsight.drill }] : [];
  if (mentalInsight.active && mentalInsight.flags.length && mentalInsight.flags[0].correctiveRoutine) {
    planUpdates.push({ mental: true, routine: mentalInsight.flags[0].correctiveRoutine, pattern: mentalInsight.flags[0].patternType });
  }
  const careerUpdates = careerInsight.active ? [{ mission: careerInsight.careerMission, impact: careerInsight.masteryImpact }] : [];

  return {
    ok: true,
    handSummary, score: engine.scoreData,
    gtoInsight, exploitInsight: exploitInsight.active ? exploitInsight : null,
    icmInsight: icmInsight.active ? icmInsight : null,
    leakInsight: leakInsight.active ? leakInsight : null,
    mentalInsight: mentalInsight.active ? mentalInsight : null,
    careerInsight,
    agents,
    suggestedActions,
    trainerHandoff: trainerHandoff.active ? trainerHandoff : null,
    planUpdates, careerUpdates, warnings,
  };
}

export {
  CoachAIOrchestrator,
  VILLAIN_PROFILES, FIELDS,
  // agents exportés pour tests unitaires éventuels
  agentHandAnalyst, agentGtoAnalyst, agentExploitAdvisor, agentIcmExpert,
  agentLeakDetective, agentTrainingBuilder, agentMentalCoach, agentCareerCoach,
};
