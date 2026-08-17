/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : VALIDATEUR POKER (§4, §5, §7)

   Deux barrières, de part et d'autre de l'appel IA :

     ① AVANT  — validatePokerState : le spot décrit est-il jouable ?
                Un état incohérent (call face à un check, 3-bet sans open,
                check face à une mise) n'est PAS envoyé au modèle. On journalise
                et on affiche un état contrôlé, plutôt que de demander à une IA
                d'expliquer une situation qui n'existe pas.

     ② APRÈS  — validateAiResponse : la réponse cite-t-elle UNIQUEMENT ce
                qu'on lui a donné ? Le schéma de sortie interdit déjà les champs
                numériques, mais rien n'empêche un modèle d'écrire « 3-bet à
                7bb » DANS SA PROSE. C'est exactement le bug de production :
                le texte disait « ouvrir à 2.1bb » pour une big blind face à un
                open. On scanne donc les nombres du texte et on rejette ceux qui
                n'existent nulle part dans les données sources.

   Module PUR → testable en Node, et répliqué côté edge function.
═══════════════════════════════════════════════════════════════ */
import { SEM, familyOf, semFr } from "./pokerState.js";

const EPS = 1e-4;

/* ═══════════════════════════════════════════════════════════════
   §4 — MATRICE DE LÉGALITÉ

   Ce que Hero peut faire face à chaque situation. C'est la table de vérité
   du poker, pas une heuristique : elle ne dépend d'aucun réglage.
═══════════════════════════════════════════════════════════════ */
export const FACING_MATRIX = {
  [SEM.OPEN_RAISE]:  [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.THREE_BET],
  [SEM.ISO_RAISE]:   [SEM.FOLD_TO_OPEN, SEM.CALL_OPEN, SEM.THREE_BET],
  [SEM.THREE_BET]:   [SEM.FOLD_TO_THREE_BET, SEM.CALL_THREE_BET, SEM.FOUR_BET],
  [SEM.FOUR_BET]:    [SEM.FOLD_TO_FOUR_BET, SEM.CALL_FOUR_BET, SEM.FIVE_BET],
  [SEM.FIVE_BET]:    [SEM.FOLD_TO_FOUR_BET, SEM.CALL_FOUR_BET],
  [SEM.LIMP]:        [SEM.FOLD, SEM.OVERLIMP, SEM.LIMP, SEM.ISO_RAISE, SEM.CHECK_OPTION],
  [SEM.BET]:         [SEM.FOLD_TO_BET, SEM.CALL_BET, SEM.RAISE_BET, SEM.CHECK_RAISE],
  [SEM.DONK_BET]:    [SEM.FOLD_TO_BET, SEM.CALL_BET, SEM.RAISE_BET, SEM.CHECK_RAISE],
  [SEM.RAISE_BET]:   [SEM.FOLD_TO_RAISE, SEM.CALL_RAISE, SEM.RERAISE],
  [SEM.CHECK_RAISE]: [SEM.FOLD_TO_RAISE, SEM.CALL_RAISE, SEM.RERAISE],
  [SEM.RERAISE]:     [SEM.FOLD_TO_RAISE, SEM.CALL_RAISE, SEM.RERAISE],
  [SEM.CHECK]:       [SEM.CHECK, SEM.BET, SEM.DONK_BET],
};

/**
 * §4 — Le spot est-il cohérent ?
 * @returns {{valid:boolean, errors:string[], warnings:string[]}}
 */
export function validatePokerState(ps) {
  const errors = [], warnings = [];
  if (!ps || typeof ps !== "object") return { valid: false, errors: ["pokerState absent"], warnings };

  const facingBet = (ps.toCallBB ?? 0) > EPS;
  const legal = ps.legalActions || [];

  /* ── Structure minimale ── */
  if (!ps.hero?.position || ps.hero.position === "?") errors.push("position Hero inconnue");
  if (!["preflop", "flop", "turn", "river"].includes(ps.street)) errors.push(`street invalide (${ps.street})`);
  if (!Number.isFinite(ps.tableSize) || ps.tableSize < 2 || ps.tableSize > 10) errors.push("tableSize hors bornes");
  if (!Number.isFinite(ps.playersInHand) || ps.playersInHand < 2) errors.push("moins de 2 joueurs dans le coup");

  /* ── Positions : uniques, et Hero présent ── */
  const pos = (ps.players || []).map(p => p.position);
  if (new Set(pos).size !== pos.length) errors.push("positions dupliquées à la table");
  if (!pos.includes(ps.hero?.position)) errors.push("Hero absent de la table");

  /* ── Board cohérent avec la street ── */
  const need = { preflop: 0, flop: 3, turn: 4, river: 5 }[ps.street];
  if (need != null && ps.boardCount !== need) errors.push(`board ${ps.boardCount} cartes pour ${ps.street} (attendu ${need})`);

  /* ── §4 : règles d'action ── */
  if (facingBet && legal.includes(SEM.CHECK)) errors.push("CHECK proposé alors qu'une mise est à suivre");
  if (facingBet && legal.includes(SEM.CHECK_OPTION)) errors.push("CHECK proposé alors qu'une mise est à suivre");
  if (!facingBet) {
    const call = legal.find(a => familyOf(a) === "CALL");
    if (call) errors.push(`CALL (${call}) proposé alors qu'il n'y a rien à payer`);
  }

  /* ── §4 : l'ouverture n'existe que dans un pot non ouvert ── */
  if (ps.heroAction === SEM.OPEN_RAISE && ps.betLevel > 1)
    errors.push(`OPEN_RAISE annoncé alors que le pot est déjà ouvert (betLevel ${ps.betLevel})`);
  if (ps.heroAction === SEM.THREE_BET && ps.betLevel !== 2)
    errors.push(`THREE_BET annoncé hors d'un pot ouvert une fois (betLevel ${ps.betLevel})`);
  if (ps.heroAction === SEM.FOUR_BET && ps.betLevel !== 3)
    errors.push(`FOUR_BET annoncé hors d'un pot 3-bet (betLevel ${ps.betLevel})`);

  /* ── §4 : l'action jouée doit faire partie des options légales ── */
  if (ps.heroAction && ps.heroAction !== SEM.UNKNOWN && !legal.includes(ps.heroAction))
    errors.push(`action Hero ${ps.heroAction} hors des options légales [${legal.join(", ")}]`);

  /* ── §4 : cohérence avec la matrice « face à » ── */
  if (ps.facingAction && FACING_MATRIX[ps.facingAction]) {
    const allowed = FACING_MATRIX[ps.facingAction];
    for (const a of legal) {
      if (!allowed.includes(a))
        errors.push(`${a} impossible face à ${ps.facingAction} (attendu : ${allowed.join("/")})`);
    }
  }

  /* ── Cohérence économique ── */
  if (ps.toCallBB != null && ps.toCallBB < 0) errors.push("toCall négatif");
  if (ps.potBB != null && ps.potBB < 0) errors.push("pot négatif");
  if (facingBet && !ps.lastAggressor && ps.street !== "preflop")
    errors.push("mise à suivre sans agresseur identifié");

  /* ── Avertissements (n'empêchent pas l'analyse) ── */
  if (!ps.hero?.cards?.length) warnings.push("cartes Hero inconnues — pas d'évaluation de main");
  if (ps.effectiveStackBB == null) warnings.push("tapis effectif indéterminé");

  return { valid: errors.length === 0, errors, warnings };
}

/* ═══════════════════════════════════════════════════════════════
   §5 — INVENTAIRE DES NOMBRES AUTORISÉS

   Le principe : une valeur numérique n'a le droit d'apparaître dans le texte
   que si elle EXISTE dans les données transmises. On construit donc la liste
   exhaustive des nombres du PokerState + du package solveur, et tout ce qui
   n'y figure pas est une invention.
═══════════════════════════════════════════════════════════════ */

/* Clés dont la valeur n'est PAS une quantité de poker : indices d'événements,
   numéros de siège, compteurs internes, durées. Les inclure élargissait
   l'inventaire à des entiers arbitraires (un `step: 7` autorisait « 7bb ») et
   affaiblissait la garde exactement là où elle doit mordre. */
const NON_QUANTITY_KEY = /^(?:step|seat|order|index|betLevel|level|samples|solveMs|durationMs|nashConv|boardCount|createdAt|_.*)$/i;

/** Parcourt récursivement un objet et collecte les nombres CITABLES. */
export function collectNumbers(obj, out = new Set(), depth = 0) {
  if (depth > 8 || obj == null) return out;
  if (typeof obj === "number") { if (Number.isFinite(obj)) out.add(obj); return out; }
  if (Array.isArray(obj)) { for (const v of obj) collectNumbers(v, out, depth + 1); return out; }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (NON_QUANTITY_KEY.test(k)) continue;
      collectNumbers(v, out, depth + 1);
    }
    return out;
  }
  return out;
}

/**
 * Liste des nombres citables, avec leurs arrondis usuels.
 * Une fréquence stockée en 0.62 s'écrit « 62 % » : les deux formes sont
 * autorisées, sinon le coach ne pourrait plus citer ses propres données.
 */
export function allowedNumbers(sources) {
  const raw = collectNumbers(sources);
  const out = new Set();
  const add = n => { if (Number.isFinite(n) && n >= 0) out.add(Math.round(n * 100) / 100); };
  for (const n of raw) {
    add(n);
    add(Math.round(n));                 // 2.04bb cité « 2bb »
    add(Math.round(n * 10) / 10);       // 2.04bb cité « 2.0bb »
    if (n > 0 && n <= 1) add(Math.round(n * 100));       // fraction → pourcentage
    if (n >= 1) add(Math.round(n * 100) / 100);
  }
  /* 0, 1 et 100 sont des constantes de langage (« 100 % de sa range », « 1bb »
     = la grosse blinde, toujours réelle) : les interdire produirait du faux
     positif pur. On s'arrête là : ajouter 2 rendrait « 2bb » toujours citable,
     et c'est précisément le genre de sizing qu'on cherche à empêcher. */
  [0, 1, 100].forEach(add);
  return out;
}

/* Motifs à neutraliser AVANT le scan : ce sont des NOMS, pas des mesures.
   On NE neutralise PAS les notations de main (« A5s », « T9o », « 73 ») :
   elles ne portent jamais d'unité, donc le scan ci-dessous les ignore déjà —
   alors qu'un motif « deux rangs collés » avalait « 73 % » et laissait passer
   une fréquence inventée. Le filtre le plus sûr est l'unité, pas la forme. */
const TOKEN_NOISE = [
  /\b\d\s?-?\s?bet\b/gi,          // 3-bet, 4bet, 5 bet
  /\bc-?bet\b/gi,
  /\b\d+-max\b/gi,
  /\bUTG\+\d\b/gi,
  /\bMP\+\d\b/gi,
];

/* Nombres porteurs d'une UNITÉ poker — ceux qui engagent une affirmation.
   La lookbehind interdit de démarrer au milieu d'un mot : sans elle, « A2x »
   produirait un faux positif sur « 2x ». */
const UNIT_NUMBER = /(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(%|bb\b|blindes?\b|x\b|pots?\b)/gi;

/**
 * §5 — Un texte cite-t-il un nombre absent des données ?
 * @returns {{clean:boolean, foreign:Array<{value:number, unit:string, excerpt:string}>}}
 */
export function scanForeignNumbers(text, allowed) {
  const foreign = [];
  if (!text || typeof text !== "string") return { clean: true, foreign };
  let s = text;
  for (const re of TOKEN_NOISE) s = s.replace(re, " ");

  let m;
  UNIT_NUMBER.lastIndex = 0;
  while ((m = UNIT_NUMBER.exec(s))) {
    const value = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(value)) continue;
    /* Comparaison EXACTE contre l'inventaire. La tolérance d'arrondi vit dans
       `allowedNumbers` (une source de 2.04 autorise « 2 » et « 2.0 ») et va
       donc dans un seul sens. L'appliquer aussi ici — « 2.1 arrondi à 2, c'est
       bon » — rouvrirait exactement la porte qu'on ferme : le sizing inventé
       « 2.1bb » passerait pour l'open réel à 2bb. */
    if (allowed.has(Math.round(value * 100) / 100)) continue;
    foreign.push({
      value, unit: m[2].toLowerCase(),
      excerpt: s.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20).trim(),
    });
  }
  return { clean: foreign.length === 0, foreign };
}

/* Champs textuels d'une réponse, à plat. */
export function analysisTexts(a) {
  if (!a || typeof a !== "object") return [];
  const out = [];
  const push = v => { if (typeof v === "string" && v.trim()) out.push(v); };
  push(a.explanation); push(a.strategicReason); push(a.mistake);
  push(a.observation); push(a.coachAdvice); push(a.summary);
  push(a.verdict?.rationale);
  (a.concepts || []).forEach(push);
  (a.warnings || []).forEach(push);
  for (const s of ["preflop", "flop", "turn", "river"]) push(a.streets?.[s]?.analysis);
  (a.detectedLeaks || []).forEach(l => push(l?.description));
  return out;
}

/**
 * §7 — Validation complète d'une réponse IA contre les faits PokerForge.
 *
 * @param analysis  réponse structurée du modèle
 * @param facts     { pokerState, solverData }
 * @returns {{valid:boolean, errors:string[], foreign:Array}}
 */
export function validateAiResponse(analysis, facts = {}) {
  const errors = [];
  const ps = facts.pokerState || null;
  const allowed = allowedNumbers({ ps: facts.pokerState, sd: facts.solverData });

  if (!analysis || typeof analysis !== "object") return { valid: false, errors: ["réponse vide"], foreign: [] };

  /* ── §7 : l'action recommandée doit être CELLE du moteur ── */
  const engineReco = facts.solverData?.target?.recommendedSemantic ?? facts.recommendedSemantic ?? null;
  if (engineReco && analysis.recommendedAction && analysis.recommendedAction !== engineReco)
    errors.push(`recommendedAction « ${analysis.recommendedAction} » ≠ moteur « ${engineReco} »`);
  if (ps && analysis.recommendedAction && !(ps.legalActions || []).includes(analysis.recommendedAction))
    errors.push(`recommendedAction « ${analysis.recommendedAction} » hors des actions légales`);
  if (ps && analysis.heroAction && analysis.heroAction !== ps.heroAction)
    errors.push(`heroAction « ${analysis.heroAction} » ≠ action réellement jouée « ${ps.heroAction} »`);

  /* ── §5 : aucun nombre inventé ── */
  const foreign = [];
  for (const t of analysisTexts(analysis)) {
    const r = scanForeignNumbers(t, allowed);
    foreign.push(...r.foreign);
  }
  if (foreign.length)
    errors.push(`valeur(s) absente(s) des données : ${foreign.slice(0, 3).map(f => f.value + f.unit).join(", ")}`);

  return { valid: errors.length === 0, errors, foreign };
}

/* Message affichable quand le pipeline refuse d'analyser (§4/§5). */
export function controlledFailureMessage(errors = []) {
  return {
    title: "Analyse suspendue",
    message: "Les données de cette main ne sont pas cohérentes entre elles : "
      + "PokerForge préfère ne rien affirmer plutôt que de produire une explication fausse.",
    detail: errors.slice(0, 3).join(" · "),
  };
}

/* Formulation imposée quand la donnée n'existe pas (§5). Le coach doit dire
   qu'il ne sait pas — jamais compléter par une valeur plausible. */
export const NO_DATA_PHRASES = {
  sizing: "le sizing exact n'est pas disponible pour ce spot",
  ev: "la perte d'EV n'est pas chiffrable sur ce spot",
  frequency: "aucune fréquence d'équilibre n'est disponible pour ce spot",
  equity: "l'équité n'a pas pu être calculée pour ce spot",
  solver: "les données disponibles ne permettent pas d'établir cette conclusion avec suffisamment de fiabilité",
};

export { semFr };
