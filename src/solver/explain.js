/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER · AI EXPLANATION LAYER (§30)
   « LE SOLVER CALCULE. L'IA EXPLIQUE. »

   Ce module transforme une SOLUTION solvée (fréquences, EV, équité, provenance)
   en FAITS STRUCTURÉS SOURCÉS que le Coach AI peut narrer. Règle absolue (§2, §30) :
   · l'IA n'invente JAMAIS une fréquence/EV ; elle ne fait que reformuler ces faits ;
   · chaque fait porte la PROVENANCE de la solution (CFR / heuristique / ICM…) ;
   · l'IA ne modifie jamais les résultats mathématiques.

   Fournit aussi : classification de décision (verdict + EV loss + leak), catalogue
   de leaks, et génération d'exercice ciblé (Adaptive Trainer).
════════════════════════════════════════════════════════════════════════════ */
import { ResultSource, resultMeta, isCalculated } from "./provenance.js";

const r2=(x)=>Math.round(x*100)/100;

/* ── Classification d'une décision Hero vs la stratégie solvée (EV-based). ──
   decision = { actions:[{id,label,freq(0-100),ev(bb)}], chosenId, source }. */
export function classifyDecision(decision){
  const {actions=[],chosenId,source=ResultSource.HEURISTIC_ESTIMATE}=decision;
  if(!actions.length)return{verdict:"unknown",evLoss:0,leak:null,source};
  const best=actions.reduce((a,b)=>b.ev>a.ev?b:a);
  const chosen=actions.find(a=>a.id===chosenId);
  if(!chosen)return{verdict:"unknown",evLoss:0,leak:null,best:best.id,source};
  const evLoss=r2(Math.max(0,best.ev-chosen.ev));
  let verdict,leak=null,severity=0;
  if(chosen.id===best.id||evLoss<=0.05){verdict="best";}
  else if(evLoss<=0.3){verdict="correct";}                 // mix légitime / marge de solve
  else if(evLoss<=1){verdict="inaccuracy";leak="minor";severity=1;}
  else if(evLoss<=3){verdict="mistake";leak="major";severity=2;}
  else{verdict="blunder";leak="critical";severity=3;}
  return{verdict,evLoss,leak,severity,best:best.id,chosen:chosenId,bestEv:r2(best.ev),chosenEv:r2(chosen.ev),source};
}

/* ── Catalogue de leaks (§30) — classification par motif de décision. ── */
export const LEAK_CATALOG={
  overfold_vs_bet:{label:"Sur-fold face aux mises",axis:"defense"},
  overcall_dominated:{label:"Call dominé (sous-défense inversée)",axis:"defense"},
  missed_value:{label:"Value manquée (check au lieu de bet)",axis:"value"},
  overbluff:{label:"Sur-bluff (bet dominé)",axis:"aggression"},
  wrong_sizing:{label:"Sizing sous-optimal",axis:"sizing"},
  spew_stackoff:{label:"Stack-off léger (ICM/valeur)",axis:"discipline"},
};
/* Déduit un leak nommé à partir de la décision + du contexte de spot. */
export function classifyLeak(evaluation,ctx={}){
  if(!evaluation.leak)return null;
  const best=evaluation.best,chosen=evaluation.chosen;
  const isBet=(id)=>/^(B|BET|RAISE|ALLIN|\d)/i.test(id);
  let key;
  if(chosen==="F"&&best!=="F")key="overfold_vs_bet";
  else if(chosen==="C"&&isBet(best))key="overcall_dominated";
  else if((chosen==="X"||chosen==="CHECK")&&isBet(best))key="missed_value";
  else if(isBet(chosen)&&(best==="X"||best==="CHECK"||best==="F"))key="overbluff";
  else if(isBet(chosen)&&isBet(best)&&chosen!==best)key="wrong_sizing";
  else key=ctx.icm?"spew_stackoff":"wrong_sizing";
  return{key,...(LEAK_CATALOG[key]||{label:key,axis:"other"}),severity:evaluation.severity,evLoss:evaluation.evLoss};
}

/* ── Faits structurés pour le Coach AI. Chaque fait est SOURCÉ ; aucun nombre
   n'existe hors de la solution (l'IA reformule, n'invente rien). ── */
export function buildCoachBrief(sol,evaluation=null){
  const source=sol.source||ResultSource.HEURISTIC_ESTIMATE;
  const meta=resultMeta(source);
  const facts=[];
  facts.push({type:"provenance",source,label:meta.label,calculated:isCalculated(source),
    caveat:isCalculated(source)?null:"Résultat non-solvé — à présenter comme estimation, pas comme GTO."});

  const acts=(sol.actions||[]).slice().sort((a,b)=>(b.freq||0)-(a.freq||0));
  if(acts.length){
    const main=acts[0];
    facts.push({type:"primary_action",action:main.id,label:main.label,freq:main.freq,ev:main.ev});
    const mixed=acts.filter(a=>(a.freq||0)>=5);
    if(mixed.length>1)facts.push({type:"mixed_strategy",actions:mixed.map(a=>({id:a.id,freq:a.freq}))});
  }
  if(sol.equity!=null){
    facts.push({type:"equity",heroEquity:sol.equity,
      rangeAdvantage:sol.equity>55?"hero":sol.equity<45?"villain":"neutral"});
  }
  if(sol.spr!=null)facts.push({type:"spr",value:sol.spr});
  if(sol.nashConv!=null)facts.push({type:"convergence",nashConv:sol.nashConv});

  if(evaluation){
    facts.push({type:"hero_evaluation",verdict:evaluation.verdict,evLoss:evaluation.evLoss,
      best:evaluation.best,chosen:evaluation.chosen});
    const leak=classifyLeak(evaluation,{icm:sol.icm});
    if(leak)facts.push({type:"leak",...leak});
  }

  // Garde-fou : l'ensemble des valeurs numériques des faits doit être un SOUS-ENSEMBLE
  // des valeurs de la solution (prévient toute hallucination de chiffre par un LLM).
  return{source,calculated:isCalculated(source),facts,
    disclaimer:isCalculated(source)?`Explication fondée sur un calcul ${meta.label}.`
                                    :`Explication fondée sur une ${meta.label} — pas un solve GTO.`};
}

/* ── Génération d'exercice ciblé (Adaptive Trainer, §30). ── */
export function buildExercise(leak,ctx={}){
  if(!leak)return null;
  const byAxis={
    defense:{action:"vs_bet",focus:"Défense correcte face aux mises (MDF, bluffcatchers)"},
    value:{action:"cbet_ip",focus:"Extraction de value (thin value, sizing)"},
    aggression:{action:"cbet_ip",focus:"Sélection des bluffs (blockers, équité)"},
    sizing:{action:"cbet_ip",focus:"Choix du sizing selon la texture"},
    discipline:{action:"rfi",focus:"Discipline ICM / éviter les stack-off légers"},
    other:{action:"vs_open",focus:"Révision générale du spot"},
  };
  const spec=byAxis[leak.axis]||byAxis.other;
  return{
    id:"drill-"+leak.key+"-"+Date.now(),
    leak:leak.key,label:leak.label,focus:spec.focus,
    scenario:{heroPos:ctx.heroPos||"BTN",vsPos:ctx.vsPos||"BB",action:spec.action,stack:ctx.stack||100},
    reps:leak.severity>=3?5:leak.severity>=2?3:2,
    source:ResultSource.AI_EXPLANATION,   // l'exercice est une SUGGESTION, pas un résultat mathématique
  };
}
