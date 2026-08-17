/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : ANALYSE DES DÉCISIONS (Phase D, §21/§22/§29)

   Principe directeur (§22, identique au Trainer) :
   « LE SOLVEUR CALCULE. L'IA EXPLIQUE. »
   La référence stratégique n'est JAMAIS inventée :
     • si le spot est réellement solvable (push/fold préflop HU ≤30bb, table
       pré-solvée exploitabilité ≈ 0) → source "solver" ;
     • sinon → moteur heuristique injecté, source "heuristic" affichée
       honnêtement (EV = estimations, pas de vérité GTO).

   Module PUR : le constructeur de scénario et le moteur heuristique sont
   INJECTÉS (pas d'import du Replayer) → testable en Node.
═══════════════════════════════════════════════════════════════ */
import { solvePreflopPushFold } from "../solver/api.js";
import { handNotation } from "../trainerStrategyProvider.js";
/* Action sémantique → famille canonique : la table de correspondance n'existe
   qu'à UN endroit (pokerState), on ne la duplique pas ici. */
import { familyOf, buildPokerState } from "./pokerState.js";

const rb = v => Math.round(v*100)/100;

/* ── Familles d'actions canoniques ── */
export const ACT = { FOLD:"FOLD", CHECK:"CHECK", CALL:"CALL", BET:"BET", RAISE:"RAISE", ALLIN:"ALLIN" };

/* Type d'événement du modèle → famille canonique. */
export function canonFromEvent(type){
  switch(type){
    case "fold": return ACT.FOLD;
    case "check": return ACT.CHECK;
    case "call": return ACT.CALL;
    case "bet": return ACT.BET;
    case "raise": return ACT.RAISE;
    case "allin": return ACT.ALLIN;
    default: return null;
  }
}
/* Libellé d'action (moteur heuristique / solveur) → famille canonique.
   L'ordre des tests compte : all-in avant bet/raise, 3-bet avant bet. */
export function canonFromLabel(label){
  const s = String(label||"");
  if(/all-?in|jam|shove|push|tapis/i.test(s)) return ACT.ALLIN;
  if(/fold/i.test(s)) return ACT.FOLD;
  if(/check/i.test(s)) return ACT.CHECK;
  if(/3-?bet|4-?bet|5-?bet|raise|open|relance/i.test(s)) return ACT.RAISE;
  if(/limp|call/i.test(s)) return ACT.CALL;
  if(/c-?bet|bet|mise/i.test(s)) return ACT.BET;
  return null;
}

/* ── Barème (§29) : EV Loss (bb) → classification + note ── */
export const CLASS = {
  EXCELLENTE:"EXCELLENTE", BONNE:"BONNE", IMPRECISION:"IMPRECISION",
  ERREUR:"ERREUR", CRITIQUE:"ERREUR_CRITIQUE", INCONNUE:"NON_EVALUEE",
};
const SCALE = [
  { max:0.02, cls:CLASS.EXCELLENTE, grade:"A+", verdict:"Excellente décision" },
  { max:0.10, cls:CLASS.BONNE,      grade:"A",  verdict:"Bonne décision" },
  { max:0.40, cls:CLASS.IMPRECISION,grade:"B",  verdict:"Imprécision" },
  { max:1.50, cls:CLASS.ERREUR,     grade:"C",  verdict:"Erreur" },
  { max:Infinity, cls:CLASS.CRITIQUE, grade:"D", verdict:"Erreur critique" },
];
export function classifyEvLoss(evLoss){
  if(evLoss==null || !Number.isFinite(evLoss))
    return { cls:CLASS.INCONNUE, grade:"—", verdict:"Non évaluée" };
  const l = Math.max(0, evLoss);
  return SCALE.find(s=>l<=s.max);
}

/* ── Barème « écart de fréquence » (points de %) ──
   Le CFR renvoie des FRÉQUENCES d'équilibre, pas des EV par action. Convertir
   un écart de fréquence en bb serait fabriquer un chiffre que le solveur n'a
   pas produit — exactement ce que ce projet s'interdit. On classe donc sur
   l'écart lui-même, et l'UI l'annonce comme tel.
   Lecture : jouer une action que l'équilibre joue déjà souvent est correct ;
   plus on s'éloigne de l'action majoritaire, plus la décision est exploitable. */
const FREQ_SCALE = [
  { max:5,        cls:CLASS.EXCELLENTE, grade:"A+", verdict:"Conforme à l'équilibre" },
  { max:15,       cls:CLASS.BONNE,      grade:"A",  verdict:"Proche de l'équilibre" },
  { max:35,       cls:CLASS.IMPRECISION,grade:"B",  verdict:"Écart notable" },
  { max:60,       cls:CLASS.ERREUR,     grade:"C",  verdict:"Action minoritaire" },
  { max:Infinity, cls:CLASS.CRITIQUE,   grade:"D",  verdict:"Action hors équilibre" },
];
export function classifyFreqGap(gap){
  if(gap==null || !Number.isFinite(gap))
    return { cls:CLASS.INCONNUE, grade:"—", verdict:"Non évaluée" };
  return FREQ_SCALE.find(s=>Math.max(0,gap)<=s.max);
}

/* ── Chemin SOLVEUR : push/fold préflop heads-up (seule surface solvée) ── */
function trySolverPushFold(snapshot, hero, ev, opts={}){
  if(!snapshot || !hero || !ev) return null;
  if(snapshot.street!=="preflop") return null;
  /* Hero est ACTIF au moment de sa décision — même si cette décision est un
     fold. Le snapshot l'ayant déjà marqué `folded`, le compter comme couché
     faisait échouer le test heads-up et privait de verdict exactement le cas
     où il est le plus utile : « avais-je raison de jeter cette main ? ». */
  const live = snapshot.players.filter(p=>!p.folded || p.id===hero.id);
  if(live.length!==2) return null;                       // heads-up uniquement
  const vil = live.find(p=>p.id!==hero.id);
  if(!vil) return null;
  const eff = Math.min(hero.stack + hero.committed, vil.stack + vil.committed);
  if(!(eff>0) || eff>30) return null;                    // hors zone fiable
  const stack = Math.round(eff);
  if(Math.abs(eff-stack)>1e-9) return null;              // tapis entier (lookup)
  const notation = handNotation(hero.hole);
  if(!notation) return null;
  const played = canonFromEvent(ev.type);

  /* ── Quel NŒUD push/fold est-on en train de jouer ? ──
     Deux pièges rendaient ce test systématiquement faux, et ce chemin
     « solveur exact » ne s'est en réalité jamais déclenché :

     1. Le tapis n'est pas toujours typé `allin`. Les rooms écrivent
        « raises $38 to $40 and is all-in » et le parser en fait un `raise` :
        exiger `played===ACT.ALLIN` excluait tous les jams réels. On regarde
        donc l'ÉTAT du joueur (tapis engagé) plutôt que le libellé.

     2. Le snapshot a DÉJÀ appliqué l'action de Hero. Après son call, ses mises
        égalent celles du vilain, donc `toCall` valait 0 et « Hero paie un jam »
        était lu comme « Hero ouvre ». On détermine le rôle par le tapis du
        VILAIN (que l'action de Hero ne peut pas modifier), pas par un écart de
        mises post-action.

     Le modèle résolu est le push/fold HU classique : SB jette son tapis, BB
     paie ou se couche. On refuse tout autre nœud plutôt que d'y plaquer la
     mauvaise matrice. */
  const heroAllIn = played===ACT.ALLIN || hero.allIn === true;
  const facing = vil.allIn === true;                     // un tapis adverse précède
  if(facing){
    if(hero.pos!=="BB") return null;                     // matrice bbCall = BB face au jam SB
    if(played!==ACT.CALL && played!==ACT.FOLD) return null;
  } else {
    if(hero.pos!=="SB") return null;                     // matrice sbJam = jam du SB
    if(!heroAllIn && played!==ACT.FOLD) return null;
  }

  const sol = (opts.solve || solvePreflopPushFold)(stack);
  const freqMap = facing ? sol?.bbCall : sol?.sbJam;
  const hf = freqMap ? freqMap[notation] : null;
  if(!hf) return null;

  const aggPct = hf.r;                                   // % jam (ou % call) GTO
  const aggAct = facing ? ACT.CALL : ACT.ALLIN;
  const alternatives = [
    { action:aggAct, label:facing?"Call":"All-in", freq:rb(aggPct), evBb:null,
      comment:`Solveur push/fold HU ${stack}bb — ${facing?"call":"jam"} ${rb(aggPct)}% avec ${notation}.` },
    { action:ACT.FOLD, label:"Fold", freq:rb(100-aggPct), evBb:null,
      comment:"Fold le complément de la range." },
  ];
  const bestAction = aggPct>=50 ? aggAct : ACT.FOLD;
  /* Le lookup push/fold donne des FRÉQUENCES d'équilibre, pas des EV par action.
     On mesure donc, comme pour le CFR, l'écart à la fréquence d'équilibre — et
     surtout on le DÉCLARE (`metric`), au lieu de convertir cet écart en bb et
     de l'afficher sous le libellé « EV perdue ». La stratégie est exacte ; la
     perte d'EV, elle, n'a jamais été calculée. */
  return {
    source:"solver",
    provenance: sol.precompiled ? "solver-library" : "solver-live",
    metric:"frequency", strategyScope:"hand",
    note:`Solveur push/fold HU (${stack}bb), exploitabilité ≈ ${sol.exploitability ?? 0}.`,
    alternatives, bestAction,
    recommended: alternatives.find(a=>a.action===bestAction),
    meta:{ stack, notation, facing, aggPct },
  };
}

/* ── Chemin CFR POSTFLOP : solution pré-calculée par le Worker ──
   Le solve est asynchrone (CPU-bound, ~0,6 à 10 s) : il ne peut pas vivre dans
   une fonction pure et synchrone. Le Replayer le lance en arrière-plan et
   dépose le résultat plain-data dans `ctx.cfr[step]` ; on le consomme ici.
   Absent → on retombe simplement sur l'heuristique, sans rien signaler de
   faux à l'utilisateur. */
function tryCfrPostflop(ctx, step){
  const block = ctx?.cfr?.[step];
  if(!block || !block.freqByAction) return null;
  const alternatives = Object.entries(block.freqByAction).map(([action,freq])=>({
    action, label: block.labels?.[action] || action,
    freq: rb(freq), evBb: null,
    comment: "",
  }));
  if(!alternatives.length) return null;
  return {
    source:"solver", provenance:block.provenance || "cfr-experimental",
    metric:"frequency", strategyScope:"hand",
    note: block.note || "Solution CFR postflop (ranges heuristiques).",
    alternatives,
    bestAction: block.bestAction || null,
    recommended: alternatives.find(a=>a.action===block.bestAction) || null,
    cfr: block,
  };
}

/* ── Chemin HEURISTIQUE : moteur de scénario injecté ── */
function tryHeuristic(hand, step, ctx){
  const { buildScenario, solve } = ctx;
  if(typeof buildScenario!=="function" || typeof solve!=="function") return null;
  const sc = buildScenario(hand, step, ctx.snaps);
  if(!sc) return null;
  const res = solve(sc);
  if(!res || res.ok===false) return null;
  /* `sem` (action sémantique : OPEN_RAISE, THREE_BET, CHECK_RAISE…) est la
     forme désormais autoritaire. `canonFromLabel` reste le repli pour les
     scénarios saisis à la main dans l'onglet Solver, où aucun contexte de mise
     n'existe. */
  const alternatives = (res.alts||[]).map(a=>({
    action: (a.sem && familyOf(a.sem)) || canonFromLabel(a.action),
    sem: a.sem || null,
    label: a.action,
    freq: a.freq ?? null,
    evBb: typeof a.evBb==="number" ? a.evBb : null,
    sizingBb: typeof a.sizingBb==="number" ? a.sizingBb : null,
    comment: a.comment || "",
  })).filter(a=>a.action);
  if(!alternatives.length) return null;
  const evs = alternatives.filter(a=>typeof a.evBb==="number");
  const bestEv = evs.length ? Math.max(...evs.map(a=>a.evBb)) : null;
  const best = evs.length ? evs.find(a=>a.evBb===bestEv)
                          : alternatives.slice().sort((a,b)=>(b.freq||0)-(a.freq||0))[0];

  /* Le moteur peut répondre POUR LA MAIN de Hero (table de range préflop
     indexée par notation) plutôt que pour sa range entière. Dans ce cas il
     renvoie des FRÉQUENCES sans EV : on mesure alors l'écart à la fréquence,
     exactement comme pour le CFR. Fabriquer une EV à partir d'une table de
     fréquences serait inventer un chiffre que rien n'a calculé. */
  if(res.metric==="frequency"){
    return {
      source:"heuristic", provenance:"heuristic-engine",
      metric:"frequency", strategyScope:res.strategyScope || "hand",
      note:`Table de range PokerForge pour ${res.handNotation || "cette main"} — fréquences estimées, pas une solution GTO.`,
      alternatives, bestAction:best?.action || null, recommended:best,
      bestEv:null, coach:res.coach || null, reco:res.reco || null,
    };
  }

  return {
    source:"heuristic", provenance:"heuristic-engine",
    /* PORTÉE des fréquences (§5/§9) : le moteur heuristique décrit le mix d'une
       RANGE entière à ce nœud, pas la stratégie de la main précise de Hero.
       Afficher « fold 48 % » à côté de K8o laisse croire que 48 % s'applique à
       K8o ; c'est faux, et le coach doit le dire. Le solveur exact et le CFR,
       eux, répondent bien pour la main (ou sa classe) → scope "hand". */
    strategyScope:"range",
    note:"Estimation heuristique : fréquences de la RANGE à ce nœud, pas la stratégie de cette main précise. Ce n'est pas une solution GTO.",
    alternatives, bestAction:best?.action || null, recommended:best,
    bestEv, coach:res.coach || null, reco:res.reco || null,
  };
}

/* ── Nom SÉMANTIQUE de l'action recommandée (§3) ──
   C'est ici que « raise » devient « 3-bet ». Le solveur push/fold et le CFR
   raisonnent en familles mécaniques (RAISE, CALL…) parce que c'est ce que
   leurs arbres manipulent ; le contexte de mise, lui, sait comment cette
   famille s'appelle DANS CE SPOT. Sans cette traduction, un coach recommande
   « raise » à une big blind face à un open — techniquement vrai, mais
   pédagogiquement faux : l'action s'appelle un 3-bet. */
function semanticRecommendation(base, pokerState){
  if(!base) return null;
  if(base.recommended?.sem) return base.recommended.sem;          // heuristique typée
  const fam = base.recommended?.action || base.bestAction || null;
  if(!fam || !pokerState) return null;
  const match = (pokerState.legalActions || []).find(a => familyOf(a) === fam);
  if(match) return match;
  /* ALLIN n'a pas d'entrée dans les actions légales (c'est un sizing, pas une
     action) : on le rattache à l'agression légale du nœud. */
  if(fam === ACT.ALLIN) return (pokerState.legalActions || []).find(a => familyOf(a) === ACT.RAISE) || null;
  return null;
}

/**
 * Analyse UNE décision Hero à l'étape `step`.
 * @param ctx { buildScenario(hand,step,snaps), solve(scenario), solvePushFold?, snaps? }
 * @returns null si l'étape n'est pas une décision Hero.
 */
export function analyzeDecision(hand, step, snapshot, ctx={}){
  const ev = snapshot?.currentEvent;
  if(!hand || !ev) return null;
  const played = canonFromEvent(ev.type);
  if(!played) return null;                       // pas une action
  if(ev.playerId !== hand.heroId) return null;   // pas une décision Hero
  const hero = snapshot.players.find(p=>p.id===hand.heroId);

  /* Description sémantique du spot (§2/§3). Elle décrit le COUP — qui a ouvert,
     ce que Hero affronte, ce qu'il pouvait faire — indépendamment de la
     référence stratégique choisie plus bas. */
  let pokerState = null;
  try { pokerState = buildPokerState(hand, ctx.snaps, step); } catch { pokerState = null; }

  /* Ordre de priorité des références (§19) : ce qui est réellement CALCULÉ
     passe avant ce qui est estimé. Push/fold exact, puis CFR postflop, puis
     heuristique. */
  const solved = trySolverPushFold(snapshot, hero, ev, { solve:ctx.solvePushFold });
  const base = solved || tryCfrPostflop(ctx, step) || tryHeuristic(hand, step, ctx);
  if(!base){
    return { step, street:snapshot.street, isHeroDecision:true,
      played, playedLabel:ev.label, source:"none", pokerState,
      heroSemantic:pokerState?.heroAction||null, recommendedSemantic:null,
      note:"Aucune référence stratégique disponible pour ce spot.",
      alternatives:[], evLoss:null, metric:"ev", ...classifyEvLoss(null) };
  }

  // Correspondance action jouée ↔ alternative de référence
  let match = base.alternatives.find(a=>a.action===played);
  if(!match && played===ACT.BET) match = base.alternatives.find(a=>a.action===ACT.RAISE);
  if(!match && played===ACT.RAISE) match = base.alternatives.find(a=>a.action===ACT.BET);
  if(!match && played===ACT.ALLIN) match = base.alternatives.find(a=>a.action===ACT.RAISE);
  /* Réciproque indispensable : les rooms écrivent « raises $38 to $40 and is
     all-in », que le parser type `raise`. Sans cette correspondance, un jam
     réel ne retrouvait pas l'alternative ALLIN de la matrice push/fold et
     restait « non évalué ». */
  if(!match && (played===ACT.RAISE || played===ACT.BET)) match = base.alternatives.find(a=>a.action===ACT.ALLIN);

  /* Référence en FRÉQUENCES (CFR) : on mesure l'écart à l'action d'équilibre
     majoritaire, en points de %. Aucune EV n'est fabriquée — le solveur n'en
     a pas produit. */
  if(base.metric==="frequency"){
    const bestFreq = Math.max(...base.alternatives.map(a=>a.freq ?? 0));
    const playedFreq = match?.freq ?? null;
    const freqGap = playedFreq==null ? null : rb(Math.max(0, bestFreq - playedFreq));
    return {
      step, street:snapshot.street, isHeroDecision:true,
      played, playedLabel:ev.label, playedMatch:match||null,
      pokerState, heroSemantic:pokerState?.heroAction||null,
      recommendedSemantic:semanticRecommendation(base, pokerState),
      source:base.source, provenance:base.provenance, note:base.note, strategyScope:base.strategyScope||null,
      recommended:base.recommended||null, bestAction:base.bestAction||null,
      alternatives:base.alternatives, coach:base.coach||null,
      evLoss:null, metric:"frequency", freqGap, playedFreq, bestFreq,
      cfr:base.cfr||null, ...classifyFreqGap(freqGap),
    };
  }

  let evLoss = base.evLoss ?? null;
  if(evLoss==null){
    if(match && typeof match.evBb==="number" && typeof base.bestEv==="number"){
      evLoss = rb(Math.max(0, base.bestEv - match.evBb));
    } else if(!match){
      evLoss = null;                              // action hors référence → non évaluée
    } else {
      evLoss = played===base.bestAction ? 0 : null;
    }
  }
  const verdict = classifyEvLoss(evLoss);
  return {
    step, street:snapshot.street, isHeroDecision:true,
    played, playedLabel:ev.label, playedMatch:match||null,
    pokerState, heroSemantic:pokerState?.heroAction||null,
    recommendedSemantic:semanticRecommendation(base, pokerState),
    source:base.source, provenance:base.provenance, note:base.note, strategyScope:base.strategyScope||null,
    recommended:base.recommended||null, bestAction:base.bestAction||null,
    alternatives:base.alternatives, coach:base.coach||null,
    evLoss, metric:"ev", ...verdict,
  };
}

/**
 * Analyse TOUTE la main (§29) : chaque décision Hero, classée.
 * @param snapshots tableau des snapshots (computeAllSnapshots)
 */
export function analyzeHand(hand, snapshots, ctx={}){
  const decisions = [];
  if(hand && Array.isArray(snapshots)){
    snapshots.forEach((snap,i)=>{
      const d = analyzeDecision(hand, i, snap, ctx);
      if(d) decisions.push(d);
    });
  }
  const rated = decisions.filter(d=>typeof d.evLoss==="number");
  const totalEvLoss = rb(rated.reduce((a,d)=>a+d.evLoss,0));
  const counts = decisions.reduce((acc,d)=>{ acc[d.cls]=(acc[d.cls]||0)+1; return acc; },{});
  const errors = decisions.filter(d=>d.cls===CLASS.ERREUR||d.cls===CLASS.CRITIQUE);
  const worst = rated.slice().sort((a,b)=>b.evLoss-a.evLoss)[0] || null;
  const sources = new Set(decisions.map(d=>d.source));
  return {
    decisions, counts, totalEvLoss, errors, worst,
    rated: rated.length,
    source: sources.has("solver") ? (sources.size>1?"mixed":"solver") : (sources.has("heuristic")?"heuristic":"none"),
  };
}
