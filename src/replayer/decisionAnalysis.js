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
  const live = snapshot.players.filter(p=>!p.folded);
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
  // Hero jam (pas de mise à payer) ou Hero call/fold face à un jam
  const toCall = Math.max(0, (vil.committed||0) - (hero.committed||0));
  const facing = toCall > 0;
  if(facing){ if(played!==ACT.CALL && played!==ACT.FOLD) return null; }
  else      { if(played!==ACT.ALLIN && played!==ACT.FOLD) return null; }

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
  // EV Loss : sans EV absolue, on mesure l'écart de fréquence à l'optimum pur.
  // Une décision jouée dans la range majoritaire = correcte ; sinon pénalité
  // proportionnelle à l'écart (honnête : c'est une mesure de fréquence).
  const playedPct = played===ACT.FOLD ? (100-aggPct) : aggPct;
  const evLoss = playedPct>=50 ? 0 : rb((50-playedPct)/50 * 1.2);
  return {
    source:"solver",
    provenance: sol.precompiled ? "solver-library" : "solver-live",
    note:`Solveur push/fold HU (${stack}bb), exploitabilité ≈ ${sol.exploitability ?? 0}.`,
    alternatives, bestAction,
    recommended: alternatives.find(a=>a.action===bestAction),
    evLoss, meta:{ stack, notation, facing, aggPct },
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
    metric:"frequency",
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
  const sc = buildScenario(hand, step);
  if(!sc) return null;
  const res = solve(sc);
  if(!res || res.ok===false) return null;
  const alternatives = (res.alts||[]).map(a=>({
    action: canonFromLabel(a.action),
    label: a.action,
    freq: a.freq ?? null,
    evBb: typeof a.evBb==="number" ? a.evBb : null,
    comment: a.comment || "",
  })).filter(a=>a.action);
  if(!alternatives.length) return null;
  const evs = alternatives.filter(a=>typeof a.evBb==="number");
  const bestEv = evs.length ? Math.max(...evs.map(a=>a.evBb)) : null;
  const best = evs.length ? evs.find(a=>a.evBb===bestEv)
                          : alternatives.slice().sort((a,b)=>(b.freq||0)-(a.freq||0))[0];
  return {
    source:"heuristic", provenance:"heuristic-engine",
    note:"Estimation heuristique (pas une solution GTO exacte).",
    alternatives, bestAction:best?.action || null, recommended:best,
    bestEv, coach:res.coach || null, reco:res.reco || null,
  };
}

/**
 * Analyse UNE décision Hero à l'étape `step`.
 * @param ctx { buildScenario(hand,step), solve(scenario), solvePushFold? }
 * @returns null si l'étape n'est pas une décision Hero.
 */
export function analyzeDecision(hand, step, snapshot, ctx={}){
  const ev = snapshot?.currentEvent;
  if(!hand || !ev) return null;
  const played = canonFromEvent(ev.type);
  if(!played) return null;                       // pas une action
  if(ev.playerId !== hand.heroId) return null;   // pas une décision Hero
  const hero = snapshot.players.find(p=>p.id===hand.heroId);

  /* Ordre de priorité des références (§19) : ce qui est réellement CALCULÉ
     passe avant ce qui est estimé. Push/fold exact, puis CFR postflop, puis
     heuristique. */
  const solved = trySolverPushFold(snapshot, hero, ev, { solve:ctx.solvePushFold });
  const base = solved || tryCfrPostflop(ctx, step) || tryHeuristic(hand, step, ctx);
  if(!base){
    return { step, street:snapshot.street, isHeroDecision:true,
      played, playedLabel:ev.label, source:"none",
      note:"Aucune référence stratégique disponible pour ce spot.",
      alternatives:[], evLoss:null, metric:"ev", ...classifyEvLoss(null) };
  }

  // Correspondance action jouée ↔ alternative de référence
  let match = base.alternatives.find(a=>a.action===played);
  if(!match && played===ACT.BET) match = base.alternatives.find(a=>a.action===ACT.RAISE);
  if(!match && played===ACT.RAISE) match = base.alternatives.find(a=>a.action===ACT.BET);
  if(!match && played===ACT.ALLIN) match = base.alternatives.find(a=>a.action===ACT.RAISE);

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
      source:base.source, provenance:base.provenance, note:base.note,
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
    source:base.source, provenance:base.provenance, note:base.note,
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
