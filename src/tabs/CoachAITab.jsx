// PokerForge — Coach AI : diagnostic, leaks, plan, evenement, career, live, analyse de main (extrait de App.jsx, Phase 3.3)
import React, { useState, useEffect, useRef, useMemo } from "react";
import { T } from "../theme.js";
import { analyzeHandHistory, parseSessionText } from "../coachEngine.js";
import { CoachAIOrchestrator, VILLAIN_PROFILES as CE_VILLAIN_PROFILES, FIELDS as CE_FIELDS } from "../coachAgents.js";
import { coachChat } from "../coachLLM.js";
import { calcPokerIQ, buildDailyProgram, loadStats, loadHistory, loadHands, saveHands } from "../stats.js";
import { MiniCard } from "../components/table/Cards.jsx";
import MentalGameTab from "./MentalGameTab.jsx";

/* ══════════════════════════════════════════════════════════════
   COACH AI — Modèles de données & générateurs (basés sur stats réelles)
════════════════════════════════════════════════════════════ */

/* ── Bibliothèque de leaks (label, sévérité, description, correction) ── */
const LEAK_LIBRARY={
  "3-bet":{label:"3-bet trop tight",icon:"🎯",severity:"Moyen",cats:["Vs Open","RFI"],
    desc:"Tu sur-folds face aux 3-bets et tu 3-bet trop rarement en position.",
    correction:"Travailler les ranges de 3-bet par position et stack depth."},
  "Squeeze":{label:"Squeeze manqué",icon:"💀",severity:"Élevé",cats:["Vs Open","ICM"],
    desc:"Tu laisses passer des spots de squeeze profitables en cold-4-bet/squeeze.",
    correction:"Identifier les spots multiway où le squeeze est +EV."},
  "Open":{label:"Open-raise trop large",icon:"📏",severity:"Faible",cats:["RFI"],
    desc:"Tes ranges d'ouverture sont trop larges depuis les positions précoces.",
    correction:"Resserrer les ranges RFI en EP/MP selon stack depth."},
  "Cbet":{label:"C-bet non-adaptatif",icon:"🃏",severity:"Moyen",cats:["Flop","Cbet"],
    desc:"Ton c-bet flop ne s'adapte pas à la texture du board.",
    correction:"Travailler les sizings de c-bet selon texture (sec/connecté/dynamique)."},
  "River":{label:"Overcall river hors position",icon:"🌊",severity:"Élevé",cats:["River","Bluffcatch"],
    desc:"Tu calls trop souvent les rivers hors-position face à une range polarisée.",
    correction:"Travailler les spots bluffcatch river vs range polarisée."},
  "ICM":{label:"ICM mal intégré",icon:"🏆",severity:"Élevé",cats:["ICM","Final Table"],
    desc:"Tes décisions en bulle/table finale ignorent l'impact ICM sur l'équité réelle.",
    correction:"Travailler des spots ICM bulle et table finale avec calcul d'équité $."},
  "Bluff":{label:"Bluff river sous-utilisé",icon:"🎭",severity:"Moyen",cats:["River","Bluff"],
    desc:"Tu bluffes trop peu en river quand ta range de value est trop étroite.",
    correction:"Identifier les combos bluff naturels (blockers) en river."},
  "Double barrel":{label:"Double barrel trop rare",icon:"🔥",severity:"Moyen",cats:["Turn","Cbet"],
    desc:"Tu abandonnes trop de pots au turn après un c-bet flop checké.",
    correction:"Travailler les turns barrel selon l'évolution du board et des ranges."},
  "BB Defense":{label:"Défense BB trop loose",icon:"🛡️",severity:"Élevé",cats:["BB Defense","Vs Open"],
    desc:"Tu défends ta BB avec des mains trop faibles face aux opens tardifs.",
    correction:"Resserrer la défense BB selon position d'open et stack."},
  "PKO":{label:"Reshove PKO sous-optimal",icon:"💰",severity:"Moyen",cats:["PKO","ICM"],
    desc:"Tes ranges de reshove en PKO n'intègrent pas correctement la valeur du bounty.",
    correction:"Travailler les ranges reshove 15-30bb avec bounty equity."},
};

/* ── 17 catégories de diagnostic ── */
const DIAGNOSTIC_CATEGORIES=[
  {id:"preflop",label:"Préflop",icon:"🎴",cats:["RFI","Vs Open","Vs 3-bet","Vs 4-bet"]},
  {id:"flop",label:"Flop",icon:"🟢",cats:["Flop","Cbet"]},
  {id:"turn",label:"Turn",icon:"🔵",cats:["Turn"]},
  {id:"river",label:"River",icon:"🌊",cats:["River","Bluffcatch"]},
  {id:"3bet-pots",label:"3-bet pots",icon:"⚔️",cats:["Vs 3-bet","Vs Open"]},
  {id:"4bet-pots",label:"4-bet pots",icon:"💣",cats:["Vs 4-bet"]},
  {id:"srp",label:"Single Raised Pots",icon:"📋",cats:["RFI","Cbet"]},
  {id:"bb-defense",label:"BB Defense",icon:"🛡️",cats:["Vs Open","BB Defense"]},
  {id:"cbet",label:"C-bet",icon:"🃏",cats:["Cbet","Flop"]},
  {id:"check-raise",label:"Check-raise",icon:"↩️",cats:["Flop","Turn"]},
  {id:"bluffcatch",label:"Bluffcatch",icon:"🕵️",cats:["River","Bluffcatch"]},
  {id:"value",label:"Value bet",icon:"💎",cats:["River","Turn"]},
  {id:"icm",label:"ICM",icon:"🏆",cats:["ICM","GTO"]},
  {id:"pko",label:"PKO",icon:"💰",cats:["ICM","Vs Open"]},
  {id:"hu",label:"Heads-Up",icon:"⚡",cats:["RFI","Vs Open"]},
  {id:"final-table",label:"Final Table",icon:"🏁",cats:["ICM","GTO"]},
  {id:"mental",label:"Mental game",icon:"🧘",cats:[]},
];

function buildDiagnostic(stats){
  const ca=stats?.catAcc||{};
  const iq=calcPokerIQ(stats);
  return DIAGNOSTIC_CATEGORIES.map(d=>{
    let score;
    if(d.id==="mental"){score=iq.breakdown.mental||0;}
    else{
      const vals=d.cats.map(c=>ca[c]).filter(v=>v&&v.total>0).map(v=>Math.round(v.ok/v.total*100));
      score=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
    }
    const hasData=score>0;
    const level=!hasData?"Non évalué":score>=80?"Avancé":score>=65?"Intermédiaire":score>=45?"Régulier":"Débutant";
    const levelCol=!hasData?T.text4:score>=80?T.green:score>=65?T.cyan:score>=45?T.amber:T.red;
    const evo=(stats?.improvements||[]).find(i=>d.cats.includes(i.metric));
    return{
      ...d,score,hasData,level,levelCol,
      evolution:evo?{delta:evo.delta,date:evo.date}:null,
      recommendation:!hasData
        ?`Joue des spots ${d.label.toLowerCase()} pour débloquer ce diagnostic.`
        :score>=80?`Continue sur ta lancée — ${d.label} est un point fort.`
        :score>=65?`${d.label} est correct, encore quelques répétitions pour stabiliser.`
        :`Priorité : retravailler ${d.label.toLowerCase()} en profondeur.`,
    };
  });
}

/* ── Top leaks formatés pour Coach AI ── */
function buildLeakReports(stats){
  const leaks=stats?.leaks||[];
  if(!leaks.length)return[];
  return leaks.slice(0,5).map((l,i)=>{
    const lib=LEAK_LIBRARY[l.cat]||{label:`Leak ${l.cat}`,icon:"⚠️",severity:"Moyen",cats:[l.cat],desc:`Précision faible en ${l.cat} (${l.acc}%).`,correction:`Travailler des spots ${l.cat}.`};
    const impactEv=Math.max(0.5,((75-(l.acc||50))*0.08)).toFixed(1);
    return{
      rank:i+1,cat:l.cat,acc:l.acc,count:l.count||0,
      label:lib.label,icon:lib.icon,severity:lib.severity,
      impactEv,desc:lib.desc,correction:lib.correction,trainCats:lib.cats,
    };
  });
}

/* ── Career Mode : objectifs majeurs ── */
const CAREER_GOALS=[
  {id:"wina-series",label:"Gagner une Wina Series",icon:"🏆",
    desc:"Décrocher un titre sur une étape de la Winamax Series.",
    steps:[
      {label:"Maîtriser les ranges 20bb",cats:["RFI","Vs Open"]},
      {label:"BTN vs BB en profondeur",cats:["Vs Open","Vs 3-bet","Flop"]},
      {label:"PKO 15-30bb",cats:["RFI","ICM"]},
      {label:"Final Table ICM",cats:["ICM","GTO"]},
    ]},
  {id:"pokerstars-event",label:"Performer sur un event PokerStars",icon:"⭐",
    desc:"Atteindre une table finale sur un event majeur PokerStars (SCOOP/WCOOP).",
    steps:[
      {label:"MTT online deep stack",cats:["Flop","Turn","River"]},
      {label:"Adaptation pool PokerStars",cats:["Vs Open","Vs 3-bet"]},
      {label:"Multi-stacking",cats:["RFI","Vs Open"]},
      {label:"ICM late stage",cats:["ICM","GTO"]},
    ]},
  {id:"partypoker-event",label:"Performer sur un event PartyPoker",icon:"🎖️",
    desc:"Réaliser un score significatif sur la série PartyPoker.",
    steps:[
      {label:"Pool recreational",cats:["RFI","Vs Open"]},
      {label:"Value-based play",cats:["Flop","Turn","River"]},
      {label:"Bankroll management",cats:[]},
      {label:"Bubble play",cats:["ICM","GTO"]},
    ]},
  {id:"mtt-2-5",label:"Devenir gagnant MTT 2€-5€",icon:"📈",
    desc:"Atteindre une rentabilité long-terme stable sur les micro stakes 2-5€.",
    steps:[
      {label:"Fondamentaux préflop",cats:["RFI","Vs Open"]},
      {label:"C-bet de base",cats:["Flop"]},
      {label:"BB Defense",cats:["Vs Open","Vs 3-bet"]},
      {label:"Discipline bankroll",cats:[]},
    ]},
  {id:"mtt-10-20",label:"Devenir gagnant MTT 10€-20€",icon:"📊",
    desc:"Passer le palier low stakes 10-20€ en restant rentable.",
    steps:[
      {label:"Ranges 3-bet avancées",cats:["Vs 3-bet","Vs 4-bet"]},
      {label:"Turn/River play",cats:["Turn","River"]},
      {label:"ICM bulle",cats:["ICM"]},
      {label:"Exploits population",cats:["RFI","Vs Open"]},
    ]},
  {id:"mtt-50",label:"Devenir gagnant MTT 50€",icon:"💼",
    desc:"S'imposer sur le palier 50€, plus régulier et exigeant.",
    steps:[
      {label:"GTO solver basics",cats:["GTO"]},
      {label:"4-bet pots",cats:["Vs 4-bet"]},
      {label:"Final table ICM",cats:["ICM","GTO"]},
      {label:"Mental game avancé",cats:[]},
    ]},
  {id:"bankroll-100-1000",label:"Monter une bankroll 100€ → 1000€",icon:"💰",
    desc:"Faire croître une bankroll de départ via une gestion stricte du risque.",
    steps:[
      {label:"Sélection de stakes adaptée",cats:[]},
      {label:"Discipline de mise",cats:["RFI","Vs Open"]},
      {label:"Suivi de variance",cats:[]},
      {label:"Move-up rules",cats:["ICM","GTO"]},
    ]},
  {id:"gto-85",label:"Améliorer mon score GTO à 85%",icon:"🎯",
    desc:"Atteindre 85% de précision globale sur l'ensemble des catégories.",
    steps:[
      {label:"Combler les leaks prioritaires",cats:[]},
      {label:"Préflop solide",cats:["RFI","Vs Open","Vs 3-bet","Vs 4-bet"]},
      {label:"Postflop cohérent",cats:["Flop","Turn","River"]},
      {label:"ICM maîtrisé",cats:["ICM","GTO"]},
    ]},
  {id:"crush-micro",label:"Crush les micro/low stakes",icon:"🦈",
    desc:"Dominer durablement les tables micro/low stakes.",
    steps:[
      {label:"Exploits population",cats:["RFI","Vs Open"]},
      {label:"Value max",cats:["Flop","Turn","River"]},
      {label:"C-bet adaptatif",cats:["Flop"]},
      {label:"Volume régulier",cats:[]},
    ]},
  {id:"crush-high",label:"Crush les high stakes",icon:"💎",
    desc:"Performer face à des regs sur les high stakes.",
    steps:[
      {label:"GTO avancé",cats:["GTO"]},
      {label:"4-bet/5-bet pots",cats:["Vs 3-bet","Vs 4-bet"]},
      {label:"HU endgame",cats:["ICM","GTO"]},
      {label:"Mental élite",cats:[]},
    ]},
  {id:"major-ft",label:"Atteindre une table finale majeure",icon:"🏁",
    desc:"Se qualifier pour la table finale d'un event majeur (EPT/WSOP/WPT).",
    steps:[
      {label:"Deep stack MTT",cats:["Flop","Turn","River"]},
      {label:"Bubble play",cats:["ICM"]},
      {label:"ICM Nash",cats:["ICM","GTO"]},
      {label:"Final table dynamics",cats:["ICM","GTO"]},
    ]},
  {id:"solid-reg",label:"Devenir un régulier MTT solide",icon:"🧠",
    desc:"Construire une base technique et mentale stable pour jouer en régulier.",
    steps:[
      {label:"Routine de session",cats:[]},
      {label:"Préflop cohérent",cats:["RFI","Vs Open","Vs 3-bet"]},
      {label:"Postflop cohérent",cats:["Flop","Turn","River"]},
      {label:"Mental game",cats:[]},
    ]},
];

/* Progressions naturelles suggérées une fois un objectif atteint */
const CAREER_NEXT_GOAL={
  "mtt-2-5":"mtt-10-20","mtt-10-20":"mtt-50","mtt-50":"crush-high",
  "crush-micro":"mtt-10-20","bankroll-100-1000":"mtt-10-20",
  "gto-85":"crush-high","solid-reg":"mtt-50",
};
function avgCatAcc(catAcc,cats){
  if(!cats||!cats.length)return null;
  const vals=cats.map(c=>catAcc?.[c]).filter(v=>v&&v.total>0).map(v=>Math.round(v.ok/v.total*100));
  return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null;
}
function buildCareerProgress(stats,goalId){
  const goal=CAREER_GOALS.find(g=>g.id===goalId)||CAREER_GOALS[0];
  const iq=calcPokerIQ(stats);
  const globalPct=Math.max(0,Math.min(100,Math.round(((iq.overall||500)-500)/4.5)));
  const catAcc=stats?.catAcc||{};
  const steps=goal.steps.map(s=>{
    const cats=s.cats||[];
    const catPct=avgCatAcc(catAcc,cats);
    const pct=catPct!=null?catPct:globalPct;
    return{label:s.label,cats,pct,done:pct>=70,current:false};
  });
  const firstNotDone=steps.findIndex(s=>!s.done);
  const currentIdx=firstNotDone===-1?steps.length-1:firstNotDone;
  steps[currentIdx].current=!steps[currentIdx].done;
  const completed=steps.every(s=>s.done);
  const progressPct=Math.round(steps.reduce((a,s)=>a+s.pct,0)/steps.length);
  return{goal,progressPct,steps,currentStep:steps[currentIdx],completed,nextGoalId:CAREER_NEXT_GOAL[goalId]||null};
}

/* ── Niveau global du joueur ── */
const LEVEL_LABELS=[
  {min:0,label:"Débutant"},
  {min:700,label:"Régulier micro/low stakes"},
  {min:750,label:"Régulier confirmé"},
  {min:800,label:"Grinder solide"},
  {min:850,label:"Crusher"},
  {min:900,label:"Elite"},
  {min:950,label:"Shark 🦈"},
];
function levelLabelFor(overall){
  let lbl=LEVEL_LABELS[0].label;
  for(const l of LEVEL_LABELS)if(overall>=l.min)lbl=l.label;
  return lbl;
}

/* ── localStorage : event prep / career goal / missions / historique ── */
function loadCoachEvent(){try{return JSON.parse(localStorage.getItem("pf_coach_event")||"null");}catch{return null;}}
export function saveCoachEvent(ep){try{localStorage.setItem("pf_coach_event",JSON.stringify(ep));}catch{}}
function clearCoachEvent(){try{localStorage.removeItem("pf_coach_event");}catch{}}
function loadCareerGoal(){try{return localStorage.getItem("pf_career_goal")||null;}catch{return null;}}
function saveCareerGoal(id){try{localStorage.setItem("pf_career_goal",id);}catch{}}
function loadCoachHistory(){try{return JSON.parse(localStorage.getItem("pf_coach_history")||"[]");}catch{return[];}}
function logCoachHistory(entry){
  const h=loadCoachHistory();
  h.unshift({...entry,date:new Date().toISOString()});
  try{localStorage.setItem("pf_coach_history",JSON.stringify(h.slice(0,50)));}catch{}
  return h;
}
function loadMissionsDone(){try{return JSON.parse(localStorage.getItem("pf_coach_missions_done")||"{}");}catch{return{};}}
function toggleMissionDone(id){
  const done=loadMissionsDone();
  done[id]=!done[id];
  try{localStorage.setItem("pf_coach_missions_done",JSON.stringify(done));}catch{}
  return done;
}

/* ── Bibliothèque de missions (gamification / Career Mode) ── */
const MISSION_LIBRARY=[
  {id:"m-spots-20",label:"Travailler 20 spots ciblés",icon:"🎯",xp:80,type:"daily"},
  {id:"m-streak",label:"Jouer une session aujourd'hui",icon:"🔥",xp:40,type:"daily"},
  {id:"m-solver-range",label:"Étudier une range dans le Solver",icon:"🧮",xp:50,type:"daily"},
  {id:"m-mental-check",label:"Faire le check mental du jour",icon:"🧘",xp:30,type:"daily"},
  {id:"m-import-10",label:"Importer 10 mains dans le Replayer",icon:"📥",xp:60,type:"weekly"},
  {id:"m-fix-leak",label:"Corriger un leak prioritaire",icon:"🛠️",xp:100,type:"weekly"},
  {id:"m-bubble-sim",label:"Faire une simulation de bulle",icon:"🎈",xp:120,type:"weekly"},
  {id:"m-debrief",label:"Débriefer ta dernière session",icon:"📝",xp:70,type:"weekly"},
];
function buildMissions(stats){
  const done=loadMissionsDone();
  const dailyKey=new Date().toDateString();
  if(done._day!==dailyKey){
    MISSION_LIBRARY.filter(m=>m.type==="daily").forEach(m=>{done[m.id]=false;});
    done._day=dailyKey;
    try{localStorage.setItem("pf_coach_missions_done",JSON.stringify(done));}catch{}
  }
  return MISSION_LIBRARY.map(m=>({...m,done:!!done[m.id]}));
}

/* ── Profil global Coach AI (Vue d'ensemble) ── */
function buildCoachProfile(stats){
  const iq=calcPokerIQ(stats);
  const gtoScore=Math.max(0,Math.min(100,Math.round(((iq.overall||500)-500)/4.5)));
  const program=buildDailyProgram(stats);
  const leaks=buildLeakReports(stats);
  const careerGoalId=loadCareerGoal();
  const career=careerGoalId?buildCareerProgress(stats,careerGoalId):null;
  const event=loadCoachEvent();
  const priorityLeak=leaks[0]||null;
  const dailyMission=program.program[0]||null;
  const hasData=!!(stats&&stats.sessions>0);
  return{
    hasData,
    levelLabel:hasData?levelLabelFor(iq.overall):"Profil non évalué",
    gtoScore,rank:iq.rank,rankCol:iq.rankCol,
    activeGoal:career?.goal||null,
    careerProgress:career?career.progressPct:null,
    targetEvent:event,
    priorityLeak,dailyMission,
    recentProgress:(stats?.improvements||[]).slice(0,2),
    nextStep:event?(event.daysLeft<0&&(event.daysLeftEnd??0)<0
        ?`Événement terminé : ajoute ton bilan pour ${event.event.name}`
        :`Continuer la préparation : ${event.event.name}`)
      :career?(career.completed
          ?`Objectif "${career.goal.label}" atteint ! Choisis un nouvel objectif Career Mode.`
          :`Prochaine étape : ${career.currentStep?.label}`)
      :dailyMission?`Lancer la mission du jour : ${dailyMission.label}`
      :"Joue ta première session pour activer ton profil Coach AI.",
  };
}

/* ── Event Preparation Engine ── */
const EVENT_MENTAL_ROUTINE=[
  "Routine pré-session : 5 min de respiration, rappel de l'objectif du jour.",
  "Check émotionnel avant chaque table : niveau d'énergie, stress, focus.",
  "Plan anti-tilt : pause obligatoire de 5 min après un bad beat important.",
  "Rappel d'objectif entre les niveaux : décisions, pas résultats.",
  "Pause guidée toutes les 90 minutes pour rester frais sur la durée.",
];
function daysUntil(dateStr){
  const d=new Date(dateStr+"T00:00:00");
  return Math.ceil((d-new Date())/86400000);
}
export function buildEventPreparation(ev,stats){
  const skills=ev.prep||[];
  const daysLeft=daysUntil(ev.start);
  const daysLeftEnd=daysUntil(ev.end);
  const isLive=ev.type==="live";
  const hasBounty=(ev.formats||[]).some(f=>f==="KO"||f==="PKO"||f==="Mystery");
  const hasSatellite=(ev.formats||[]).some(f=>f==="Satellite");
  const highStakes=(ev.buyinMax||0)>=1000;

  let plan;
  if(daysLeft>=30){
    plan=[
      {day:"J-30",theme:`Fondamentaux ${ev.formats?.[0]||"MTT"}`,focus:skills[0]||"Stratégie générale",spots:20},
      {day:"J-14",theme:skills[1]||"Approfondissement technique",focus:skills[1]||"Approfondissement technique",spots:25},
      {day:"J-7",theme:skills[2]||"Spots avancés",focus:skills[2]||"Spots avancés",spots:20},
      {day:"J-1",theme:"Routine veille d'event",focus:"Révision rapide + mental",spots:10},
    ];
  }else if(daysLeft>=14){
    plan=[
      {day:"J-14",theme:skills[0]||`Fondamentaux ${ev.formats?.[0]||"MTT"}`,focus:skills[0]||"Stratégie générale",spots:25},
      {day:"J-7",theme:skills[1]||skills[2]||"Spots avancés",focus:skills[1]||skills[2]||"Spots avancés",spots:20},
      {day:"J-1",theme:"Routine veille d'event",focus:"Révision rapide + mental",spots:10},
    ];
  }else if(daysLeft>=2){
    plan=[
      {day:`J-${daysLeft}`,theme:`Sprint ${skills[0]||ev.formats?.[0]||"MTT"}`,focus:skills.slice(0,2).join(" + ")||"Spots prioritaires",spots:25},
      {day:"J-1",theme:"Routine veille d'event",focus:"Révision rapide + mental",spots:10},
    ];
  }else if(daysLeft>=0){
    plan=[
      {day:daysLeft===0?"J-0":"J-1",theme:"Dernière ligne droite",focus:"Révision express + routine mentale, pas de nouveaux concepts",spots:8},
    ];
  }else if(daysLeftEnd>=0){
    plan=[
      {day:"Jour J",theme:"Pendant l'événement",focus:"Applique ta routine mentale entre les niveaux/tables",spots:0},
    ];
  }else{
    plan=[];
  }

  const checklist=[
    "Vérifier le format exact (structure, niveaux, antes/bounty)",
    "Revoir les ranges adaptées au stack de départ",
    "Préparer sa routine mentale (warm-up + pauses)",
    "Relire ses leaks prioritaires identifiés par Coach AI",
    "Planifier les pauses et l'hydratation/alimentation",
  ];
  if(isLive){
    checklist.push("Préparer son sac (pièce d'identité, vêtements, écouteurs)");
    checklist.push("Vérifier le trajet et l'heure d'enregistrement (late reg)");
  }else{
    checklist.push("Tester la connexion internet + solution de secours (4G)");
    checklist.push("Configurer le poste de jeu (tables, son, notifications coupées)");
  }
  if(hasBounty)checklist.push("Réviser les ajustements de range bounty (call-off vs shove)");
  if(hasSatellite)checklist.push("Réviser la stratégie ICM satellite (survie > accumulation)");
  if(highStakes)checklist.push("Relire sa gestion de bankroll avant ce buy-in");

  const tips=[];
  tips.push(isLive
    ?"Format live : prévois large pour le trajet et le late reg, garde de l'eau et des snacks à table."
    :"Format online : ferme les apps annexes et choisis un nombre de tables confortable pour ce field.");
  if(hasBounty)tips.push("Bounty/PKO : ajuste tes ranges de call vs all-in selon la valeur de la prime, surtout en early game.");
  if(hasSatellite)tips.push("Satellite : priorise la survie ICM, évite les spots marginaux même +EV en chips.");
  if(highStakes)tips.push(`Buy-in élevé (${ev.buyinDisplay}) : ne joue ce stake que s'il correspond à ta bankroll actuelle.`);
  if(ev.gtd)tips.push(`Field important attendu (${ev.gtdDisplay}) : gère ton énergie sur la durée, la variance sera plus longue.`);

  return{
    event:ev,daysLeft,daysLeftEnd,
    plan,planDone:plan.map(()=>false),
    checklist,checklistDone:checklist.map(()=>false),
    mentalRoutine:EVENT_MENTAL_ROUTINE,requiredSkills:skills,tips,
    notes:"",
    createdAt:new Date().toISOString(),
  };
}

/* ── Plan d'entraînement (quotidien / hebdomadaire) ── */
const PLAN_WEEKDAYS=["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
function buildTrainingPlan(stats){
  const program=buildDailyProgram(stats);
  const leaks=buildLeakReports(stats);
  const daily=program.program.map((p,i)=>({
    day:`Session ${i+1}`,theme:p.label,duree:`${Math.round(p.spots*1.5)} min`,spots:p.spots,
    objTech:`Améliorer ${p.label.toLowerCase()}`,
    objMental:i===0?"Rester concentré sur le process, pas le résultat":"Garder un rythme stable",
    difficulte:p.score<50?"Élevée":p.score<70?"Moyenne":"Standard",cats:p.cats,
  }));
  const weekly=PLAN_WEEKDAYS.map((day,i)=>{
    const fromLeak=leaks[i%Math.max(1,leaks.length)];
    const fromDaily=daily[i%daily.length];
    const theme=fromLeak?.label||fromDaily.theme;
    const spots=fromLeak?Math.max(15,Math.min(30,fromLeak.count+10)):fromDaily.spots;
    return{
      day,theme,duree:`${Math.round(spots*1.5)} min`,spots,
      objTech:`Travailler ${theme.toLowerCase()}`,
      objMental:i%2===0?"Décision par décision, sans jugement du résultat":"Garder l'énergie stable sur la session",
      difficulte:i<2?"Élevée":"Moyenne",cats:fromLeak?.trainCats||fromDaily.cats||[],
    };
  });
  return{daily,weekly};
}

/* ── Career Mode : recommandations + planning hebdo liés à l'étape en cours ── */
function buildCareerMissions(stats,progress){
  if(progress.completed)return[];
  const{currentStep}=progress;
  const cats=currentStep.cats||[];
  const leaks=buildLeakReports(stats);
  const missions=[];
  if(cats.length){
    missions.push({icon:"🎯",text:`Travaille ${cats.length>1?"les catégories":"la catégorie"} ${cats.join(", ")} — vise 15 à 20 spots ciblés dans l'Entraîneur.`});
    missions.push({icon:"🧮",text:`Révise les ranges ${cats[0]} correspondantes dans le Solver.`});
  }else{
    missions.push({icon:"🧘",text:`"${currentStep.label}" est un axe mental/discipline — pas de spot dédié : note tes observations après chaque session.`});
  }
  const relatedLeak=leaks.find(l=>cats.includes(l.cat)||(l.trainCats||[]).some(c=>cats.includes(c)));
  if(relatedLeak)missions.push({icon:"🛠️",text:`Corrige ton leak prioritaire lié : ${relatedLeak.label} — ${relatedLeak.correction}`});
  else if(!cats.length&&leaks[0])missions.push({icon:"🛠️",text:`Corrige ton leak prioritaire : ${leaks[0].label} — ${leaks[0].correction}`});
  else missions.push({icon:"📊",text:`Suis l'évolution de "${currentStep.label}" (${currentStep.pct}%) dans Diagnostic.`});
  return missions;
}
function buildCareerWeekly(progress){
  const notDone=progress.steps.filter(s=>!s.done);
  const pool=notDone.length?notDone:progress.steps;
  return PLAN_WEEKDAYS.map((day,i)=>{
    if(i===PLAN_WEEKDAYS.length-1){
      return{day,theme:"Bilan de la semaine",focus:"Relire ses notes, vérifier sa progression dans Diagnostic, ajuster l'objectif si besoin.",spots:0};
    }
    const step=pool[i%pool.length];
    const cats=step.cats||[];
    return{
      day,theme:step.label,
      focus:cats.length?`Spots ciblés : ${cats.join(", ")}`:"Travail mental/discipline — pas de spot dédié",
      spots:cats.length?15:0,
    };
  });
}

/* ── Coach Live : suggestions contextuelles + réponses canned ── */
const COACH_LIVE_SUGGESTIONS={
  dash:["Quel est mon objectif prioritaire aujourd'hui ?","Explique-moi mon score GTO actuel"],
  trainer:["Pourquoi cette réponse est-elle correcte ?","Donne-moi un indice sur ce spot"],
  solver:["Pourquoi cette range est-elle correcte ?","Compare cette range avec mes leaks"],
  ranges:["Explique cette range","Compare cette range avec mes leaks"],
  pratique:["Quelle est ma main la plus coûteuse récemment ?","Analyse ce spot"],
  replayer:["Qu'aurais-je dû faire ici ?","Ajoute cette main à mon plan d'entraînement"],
  coach:["Que dois-je travailler cette semaine ?","Comment progresser vers mon objectif ?"],
  community:["Quels joueurs ont un profil proche du mien ?","Recommande-moi une discussion"],
};
const COACH_LIVE_REPLIES={
  default:"Je note ta question — en attendant la connexion complète au moteur IA, voici une réponse basée sur ton profil actuel : concentre-toi sur ton leak prioritaire et la mission du jour, c'est le chemin le plus efficace vers ta progression.",
};

/* ══════════════════════════════════════════════════════════════
   MENTAL GAME — Centre de coaching mental premium
   Contenu piloté par données (éditable) + persistance localStorage.
   Pour mettre à jour le contenu : éditer MENTAL_CONTENT ci-dessous
   (ou, à terme, brancher Supabase/JSON distant — mêmes champs).
════════════════════════════════════════════════════════════ */

const COACHAI_NAV=[
  ["overview","🏠 Vue d'ensemble"],
  ["analyze","🔬 Analyser une main"],
  ["diagnostic","🩺 Diagnostic"],
  ["leaks","🔍 Leaks"],
  ["plan","📅 Plan"],
  ["event","🎯 Événement"],
  ["career","🚀 Career Mode"],
  ["live","💬 Coach Live"],
  ["mental","🧠 Mental Game"],
  ["history","🕓 Historique"],
  ["tools","🛠️ Outils"],
];

/* ═══════════════════════════════════════════════════════════════
   COACH AI — ANALYSER UNE MAIN (moteur multi-room coachEngine.js)
   Input multi-source → normalisation → table + timeline + analyse + score.
═══════════════════════════════════════════════════════════════ */
function ceSplitCard(str){return{r:String(str).slice(0,-1),s:String(str).slice(-1)};}
const CE_SEV_COL={1:"#FFC247",2:"#FF8A3D",3:"#FF4560"};
const CE_SEV_LBL={1:"Mineur",2:"Moyen",3:"Majeur"};
const CE_CONF={high:{l:"Élevée",c:"#10D87A"},medium:{l:"Moyenne",c:"#FFC247"},low:{l:"Faible",c:"#FF8A3D"}};
const CE_ROOMS=[["Winamax","#FF4560"],["PokerStars","#FFC247"],["GGPoker","#1F8BFF"],["PartyPoker","#FF8A3D"],["888","#10D87A"],["Unibet","#10D87A"],["PMU/iPoker","#9B5CFF"],["WPN/ACR","#34D8FF"],["Chico","#c090ff"],["Ignition","#FFC247"]];

/* Table compacte alimentée par les données NORMALISÉES (tableData + step timeline) */
function CoachAnalyzeTable({tableData,timeline,step}){
  const seats=tableData.seats||[];
  const n=Math.max(seats.length,2);
  // Hero en bas : on réordonne le cercle pour que le Hero soit à 90°
  const heroI=Math.max(0,seats.findIndex(s=>s.isHero));
  const cur=timeline[step]||null;
  const board=cur?cur.board:(tableData.board||[]);
  const pot=cur?cur.potAfterBb:tableData.potBb;
  const activeActor=cur?cur.actor:null;
  const rx=40,ry=37;
  return(
    <div style={{position:"relative",width:"100%",aspectRatio:"1.5/1",minHeight:240,
      background:"radial-gradient(ellipse at center,#0d5a3a 0%,#0a3d2a 55%,#06231a 100%)",
      borderRadius:"50%/42%",border:"3px solid #0a2a1e",boxShadow:"inset 0 0 40px rgba(0,0,0,.55)",margin:"0 auto",maxWidth:520}}>
      {/* Board + pot au centre */}
      <div style={{position:"absolute",left:"50%",top:"42%",transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
        <div style={{display:"flex",gap:3}}>
          {board.length?board.map((c,i)=>{const{r,s}=ceSplitCard(c);return <MiniCard key={i} r={r} s={s}/>;}):<span style={{fontSize:9,color:"rgba(255,255,255,.4)",fontFamily:T.stats}}>—</span>}
        </div>
        <div style={{background:"rgba(0,0,0,.4)",borderRadius:20,padding:"3px 12px",border:"1px solid rgba(255,194,71,.3)"}}>
          <span style={{fontFamily:T.brand,fontSize:14,fontWeight:900,color:T.gold}}>{pot!=null?pot:0}</span>
          <span style={{fontSize:8,color:"rgba(255,255,255,.6)",marginLeft:3,fontFamily:T.stats}}>bb POT</span>
        </div>
      </div>
      {/* Sièges */}
      {seats.map((s,i)=>{
        const rel=((i-heroI)%n+n)%n;            // 0 = Hero
        const theta=(90+rel*(360/n))*Math.PI/180;
        const x=50+rx*Math.cos(theta), y=50+ry*Math.sin(theta);
        const active=activeActor&&s.name===activeActor;
        const col=s.isHero?T.gold:active?"#34D8FF":"rgba(255,255,255,.65)";
        return(
          <div key={i} style={{position:"absolute",left:`${x}%`,top:`${y}%`,transform:"translate(-50%,-50%)",
            display:"flex",flexDirection:"column",alignItems:"center",gap:2,opacity:s.folded?.4:1,
            zIndex:active?5:2,minWidth:54}}>
            {/* cartes (hero ou shown) */}
            {(s.isHero&&s.holeCards.length)||s.shown.length?(
              <div style={{display:"flex",gap:2}}>
                {(s.holeCards.length?s.holeCards:s.shown).map((c,j)=><MiniCard key={j} r={String(c).slice(0,-1)} s={String(c).slice(-1)}/>)}
              </div>
            ):null}
            <div style={{background:s.isHero?"rgba(255,194,71,.16)":active?"rgba(52,216,255,.16)":"rgba(3,13,42,.85)",
              border:`1.5px solid ${s.isHero?T.gold:active?"#34D8FF":"#1A3A80"}`,borderRadius:9,padding:"3px 7px",textAlign:"center",
              boxShadow:active?"0 0 10px rgba(52,216,255,.5)":"0 2px 6px rgba(0,0,0,.5)"}}>
              <div style={{fontFamily:T.brand,fontSize:9,fontWeight:900,color:col,lineHeight:1}}>{s.pos||"?"}</div>
              <div style={{fontSize:7.5,color:"rgba(255,255,255,.7)",fontFamily:T.stats,maxWidth:50,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
              <div style={{fontSize:8,color:"#10D87A",fontFamily:T.stats,fontWeight:700}}>{s.stackBb!=null?s.stackBb+"bb":"—"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* historique des leaks (récurrence) — persistant, par appareil */
function ceLoadLeakHist(){try{return JSON.parse(localStorage.getItem("pf_coach_leak_hist")||"[]");}catch{return [];}}
function cePushLeakHist(tags){try{const h=ceLoadLeakHist();const next=[...h,...(tags||[])].slice(-200);localStorage.setItem("pf_coach_leak_hist",JSON.stringify(next));}catch{}}
function ceLoadPlan(){try{return JSON.parse(localStorage.getItem("pf_coach_plan")||"[]");}catch{return [];}}
function ceSavePlan(p){try{localStorage.setItem("pf_coach_plan",JSON.stringify(p.slice(0,80)));}catch{}}

function CoachAnalyzeHand({onGoTrainer,onNav,onGoReplayer,initialRaw,onInitialConsumed}){
  const[raw,setRaw]=useState("");
  const[result,setResult]=useState(null);
  const[coach,setCoach]=useState(null);    // sortie de l'orchestrateur (agents)
  const[step,setStep]=useState(0);
  const[ovCards,setOvCards]=useState("");
  const[ovBb,setOvBb]=useState("");
  const[vProfile,setVProfile]=useState("");
  const[field,setField]=useState("");
  const[tourStage,setTourStage]=useState("auto");
  const[mentalTrack,setMentalTrack]=useState(false);
  const[toast,setToast]=useState(null);
  const[savedHands]=useState(()=>{try{return loadHands();}catch{return [];}});
  const[llmText,setLlmText]=useState(null);const[llmBusy,setLlmBusy]=useState(false);
  const fileRef=useRef();
  const flash=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),2600);};
  // Explication IA premium : envoie l'analyse déterministe (vérité technique) au LLM pour une explication en langage naturel.
  async function explainAI(){
    if(!result||!result.ok||llmBusy)return;
    setLlmBusy(true);setLlmText(null);
    const a=result.analysisSummary||{};
    const context={meta:result.meta,resume:a.lineSummary,decisionCle:a.keyDecision,meilleureAction:a.bestActionEstimate,
      score:result.scoreData&&{score:result.scoreData.score,grade:result.scoreData.grade,confiance:result.scoreData.confidence},
      erreurs:(result.mistakes||[]).map(m=>m.text),leaks:result.leakTags,pointsPositifs:result.goodPoints,
      flagsMentaux:(result.mentalFlags||[]).map(f=>f.patternType)};
    const r=await coachChat({mode:"explain",userMessage:"Explique ce spot à un joueur (coaching premium, concis, actionnable) en t'appuyant sur les DONNÉES fournies.",context});
    setLlmBusy(false);
    if(r&&r.ok&&r.text)setLlmText(r.text);
    else if(r&&r.noKey)setLlmText("⚙️ L'explication IA nécessite une clé OpenAI configurée côté serveur (secret OPENAI_API_KEY de l'edge function coach-chat). L'analyse technique ci-dessus reste 100% disponible sans clé.");
    else setLlmText("⚠ "+((r&&r.error)||"Coach IA momentanément indisponible.")+" — l'analyse technique ci-dessus reste disponible.");
  }

  function options(){
    const o={mentalTracking:mentalTrack,tourStage,pastLeaks:ceLoadLeakHist()};
    if(vProfile)o.villainProfile=vProfile;
    if(field)o.field=field;
    try{const g=loadCareerGoal&&loadCareerGoal();if(g){const goal=(typeof CAREER_GOALS!=="undefined"?CAREER_GOALS.find(x=>x.id===g):null);o.careerGoal=goal?{id:goal.id,label:goal.label}:{id:g,label:g};}}catch{}
    return o;
  }
  function analyzeText(txt,extra){
    if(!txt||txt.trim().length<15){setResult({ok:false,error:"Colle d'abord une main (texte de la room).",parseWarnings:[]});setCoach(null);return;}
    let r;try{r=analyzeHandHistory(txt,extra||{});}catch(e){r={ok:false,error:"Erreur : "+(e.message||e),parseWarnings:[]};}
    setResult(r);setStep(0);setLlmText(null);
    if(r&&r.ok){
      let c=null;try{c=CoachAIOrchestrator(r,options());}catch(e){c=null;}
      setCoach(c);
      if(r.leakTags&&r.leakTags.length)cePushLeakHist(r.leakTags);
    }else setCoach(null);
  }
  function run(extra){analyzeText(raw,extra);}
  function loadFile(e){
    const f=e.target.files&&e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=ev=>{const txt=ev.target.result||"";setRaw(txt);analyzeText(txt);};
    rd.readAsText(f,"utf-8");
    e.target.value="";
  }
  function reAnalyzeManual(){
    const extra={};
    if(ovCards.trim())extra.heroCards=ovCards.trim();
    if(ovBb.trim()&&!isNaN(parseFloat(ovBb)))extra.bb=parseFloat(ovBb);
    run(extra);
  }
  // HH entrante depuis le Replayer → pré-remplit et analyse automatiquement
  useEffect(()=>{
    if(initialRaw&&String(initialRaw).trim().length>15){setRaw(initialRaw);analyzeText(initialRaw);onInitialConsumed&&onInitialConsumed();}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initialRaw]);
  /* ── ACTIONS CONCRÈTES ── */
  function doAction(id){
    if(!result||!result.ok)return;
    const th=coach&&coach.trainerHandoff;
    switch(id){
      case "replay-trainer": onGoTrainer&&onGoTrainer(th?th.trainerParams:undefined); break;
      case "drill-similar":  onGoTrainer&&onGoTrainer(th?th.drillTemplate:undefined); break;
      case "open-replayer":  if(onGoReplayer)onGoReplayer(raw); else flash("Replayer indisponible"); break;
      case "add-leak-plan": {
        const li=coach&&coach.leakInsight; if(!li){flash("Aucun leak à ajouter");break;}
        const plan=ceLoadPlan();plan.unshift({type:"leak",tag:li.tag,family:li.family,priority:li.priority,drill:li.drill,ts:Date.now()});ceSavePlan(plan);
        flash("✓ Leak ajouté à ton plan"); break;
      }
      case "add-mental-note": {
        try{const m=loadMental();m.journal=m.journal||[];m.journal.unshift({type:"coachai",date:new Date().toISOString().slice(0,10),text:`Spot ${meta?meta.heroPos:""} — ${result.analysisSummary.lineSummary}`,hand:meta?meta.handId:null});saveMental(m);flash("✓ Note ajoutée au journal mental");}catch{flash("Erreur journal");} break;
      }
      case "add-mental-routine": {
        const mi=coach&&coach.mentalInsight; if(!mi||!mi.flags.length){flash("Aucune routine à créer");break;}
        try{const m=loadMental();m.journal=m.journal||[];const f=mi.flags[0];m.journal.unshift({type:"routine",date:new Date().toISOString().slice(0,10),text:`Routine anti-«${f.patternType}» : ${f.correctiveRoutine}`});saveMental(m);
          const plan=ceLoadPlan();plan.unshift({type:"mental",pattern:f.patternType,routine:f.correctiveRoutine,ts:Date.now()});ceSavePlan(plan);
          flash("✓ Routine mentale ajoutée");}catch{flash("Erreur routine");} break;
      }
      case "compare-hands": {
        const li=coach&&coach.leakInsight;const hist=ceLoadLeakHist();const n=li?hist.filter(t=>t===li.tag).length:0;
        flash(li?`Ce leak « ${li.family} » apparaît ${n}× dans ton historique`:"Pas de leak récurrent détecté");
        onNav&&onNav("leaks"); break;
      }
      case "save-tag": {
        try{const hands=loadHands();const tag=coach&&coach.leakInsight?coach.leakInsight.tag:(meta?meta.sourceSite:"main");
          hands.unshift({id:Date.now(),desc:`${meta?meta.sourceSite:"?"} ${meta?meta.heroPos:""} — score ${sc?sc.score:"?"}`,site:meta?meta.sourceSite:"?",gameType:meta?meta.gameType:"cash",score:sc?sc.score:"?",tag,hh:raw.slice(0,4000),emotional:!!(coach&&coach.mentalInsight&&coach.mentalInsight.emotionalSpot)});
          saveHands(hands);flash("✓ Main sauvegardée"+(coach&&coach.mentalInsight&&coach.mentalInsight.emotionalSpot?" (spot émotionnel)":""));}catch{flash("Erreur sauvegarde");} break;
      }
      default: break;
    }
  }
  const tl=result&&result.ok?result.actionTimeline:[];
  const meta=result&&result.ok?result.meta:null;
  const sc=result&&result.ok?result.scoreData:null;
  const isTour=meta&&meta.gameType==="tournament";

  return(
    <div className="cai-pane">
      <div className="cai-hero">
        <div className="cai-hero-title">🔬 Analyser une main</div>
        <div className="cai-hero-sub">Importe une main de <b>n'importe quelle room</b> — Coach AI la normalise, reconstruit le coup et l'analyse.</div>
      </div>

      {/* ── INPUT ── */}
      <div className="cai-card" style={{marginBottom:14}}>
        <div className="cai-card-h">1 · Importer la main</div>
        <textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Colle ici l'historique de main (Winamax, PokerStars, GG, PartyPoker, 888, iPoker/PMU…)"
          className="rephh" style={{width:"100%",minHeight:120,resize:"vertical",fontFamily:T.stats,fontSize:11,background:"#030D2A",color:T.text2,border:"1px solid #152D6E",borderRadius:8,padding:10}}/>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10,alignItems:"center"}}>
          <div className="cai-btn" onClick={()=>run()}>⚡ Analyser</div>
          <div className="cai-btn cai-btn-ghost" onClick={()=>fileRef.current&&fileRef.current.click()}>📁 Fichier .txt / .hh</div>
          <input ref={fileRef} type="file" accept=".txt,.hh,.log,text/plain" onChange={loadFile} style={{display:"none"}}/>
          {raw&&<div className="cai-btn cai-btn-ghost" onClick={()=>{setRaw("");setResult(null);setCoach(null);}}>✕ Effacer</div>}
          <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>Support .zip à venir</span>
        </div>
        {/* Contexte optionnel → active Exploit Advisor / ICM / Mental Coach */}
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10,alignItems:"center"}}>
          <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>Contexte (active les agents) :</span>
          <select value={vProfile} onChange={e=>setVProfile(e.target.value)} style={{padding:"4px 7px",borderRadius:6,border:"1px solid #1A3A80",background:"#030D2A",color:T.text2,fontSize:9.5,fontFamily:T.stats}}>
            <option value="">Profil vilain…</option>
            {Object.entries(CE_VILLAIN_PROFILES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={field} onChange={e=>setField(e.target.value)} style={{padding:"4px 7px",borderRadius:6,border:"1px solid #1A3A80",background:"#030D2A",color:T.text2,fontSize:9.5,fontFamily:T.stats}}>
            <option value="">Field…</option>
            {Object.entries(CE_FIELDS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          {isTour&&(
            <select value={tourStage} onChange={e=>setTourStage(e.target.value)} style={{padding:"4px 7px",borderRadius:6,border:"1px solid #1A3A80",background:"#030D2A",color:T.text2,fontSize:9.5,fontFamily:T.stats}}>
              {[["auto","Stage auto"],["early","Début"],["bubble","Bulle"],["itm","ITM"],["ft","Table finale"]].map(([k,l])=><option key={k} value={k}>{l}</option>)}
            </select>
          )}
          <label style={{display:"flex",alignItems:"center",gap:4,fontSize:9.5,color:mentalTrack?"#FF5D9E":T.text3,fontFamily:T.stats,cursor:"pointer"}}>
            <input type="checkbox" checked={mentalTrack} onChange={e=>setMentalTrack(e.target.checked)}/>🧠 Suivi mental
          </label>
          {result&&result.ok&&<div className="cai-btn cai-btn-ghost" style={{padding:"4px 10px"}} onClick={()=>run()}>↻ Ré-analyser</div>}
        </div>
        {savedHands.length>0&&(
          <div style={{marginTop:10}}>
            <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,marginBottom:5}}>Depuis l'historique PokerForge :</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {savedHands.slice(0,8).map((h,i)=>(
                <span key={i} onClick={()=>{setRaw(h.hh||"");setResult(null);}} style={{cursor:"pointer",padding:"3px 9px",borderRadius:14,fontSize:8.5,fontFamily:T.stats,
                  color:T.text2,background:"rgba(255,255,255,.04)",border:"1px solid #1A3A80"}}>{h.site||"HH"} · {(h.desc||"").slice(0,16)}</span>
              ))}
            </div>
          </div>
        )}
        {!result&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:12}}>
            {CE_ROOMS.map(([n,c])=>(<span key={n} style={{padding:"2px 8px",borderRadius:14,fontSize:8,fontWeight:700,color:c,border:`1px solid ${c}33`,background:c+"0d",fontFamily:T.stats}}>{n}</span>))}
          </div>
        )}
      </div>

      {/* ── ERREUR / COMPLÉTION MANUELLE ── */}
      {result&&!result.ok&&(
        <div className="cai-card" style={{marginBottom:14,borderColor:"rgba(255,69,96,.4)"}}>
          <div className="cai-card-h" style={{color:T.red}}>⚠ Lecture incomplète</div>
          <div style={{fontSize:11,color:T.text2,marginBottom:8,lineHeight:1.6}}>{result.error}</div>
          {result.sourceSite&&<div style={{fontSize:9,color:T.text4,marginBottom:8,fontFamily:T.stats}}>Room détectée : <b style={{color:T.text2}}>{result.sourceSite}</b></div>}
          {(result.parseWarnings||[]).length>0&&(
            <ul style={{margin:"0 0 10px",paddingLeft:18}}>
              {result.parseWarnings.map((w,i)=><li key={i} style={{fontSize:9.5,color:T.text3,marginBottom:3,fontFamily:T.stats}}>{w}</li>)}
            </ul>
          )}
          <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,marginBottom:6}}>Complète le contexte manquant puis ré-analyse :</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={ovCards} onChange={e=>setOvCards(e.target.value)} placeholder="Cartes Hero (ex: Ah Kd)" style={{padding:"5px 9px",borderRadius:7,border:"1px solid #1A3A80",background:"#030D2A",color:T.text2,fontSize:10,fontFamily:T.stats,width:140}}/>
            <input value={ovBb} onChange={e=>setOvBb(e.target.value)} placeholder="Big blind (ex: 1)" style={{padding:"5px 9px",borderRadius:7,border:"1px solid #1A3A80",background:"#030D2A",color:T.text2,fontSize:10,fontFamily:T.stats,width:110}}/>
            <div className="cai-btn" onClick={reAnalyzeManual}>↻ Ré-analyser</div>
          </div>
        </div>
      )}

      {/* ── RÉSULTAT ── */}
      {result&&result.ok&&(
        <>
          {/* Warnings */}
          {(result.parseWarnings||[]).length>0&&(
            <div style={{background:"rgba(255,194,71,.08)",border:"1px solid rgba(255,194,71,.3)",borderRadius:8,padding:"8px 12px",marginBottom:12}}>
              {result.parseWarnings.map((w,i)=><div key={i} style={{fontSize:9,color:T.gold,fontFamily:T.stats}}>⚠ {w}</div>)}
            </div>
          )}
          {/* Meta */}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
            {[
              meta.sourceSite,
              meta.gameType==="tournament"?(meta.tournamentType||"MTT"):"Cash",
              meta.format,
              `${meta.tableSize} joueurs`,
              `Hero ${meta.heroPos}`,
              `Blindes ${meta.blinds.sb}/${meta.blinds.bb}`,
              meta.showdown?"Showdown ✓":"Sans showdown",
            ].map((x,i)=><span key={i} style={{padding:"3px 9px",borderRadius:14,fontSize:9,fontWeight:600,color:T.text2,background:"rgba(255,255,255,.04)",border:"1px solid #1A3A80",fontFamily:T.stats}}>{x}</span>)}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1.15fr 1fr",gap:14,alignItems:"start"}} className="cai-analyze-grid">
            {/* COLONNE GAUCHE : table + timeline */}
            <div>
              <div className="cai-card">
                <div className="cai-card-h">Table reconstruite</div>
                <CoachAnalyzeTable tableData={result.tableData} timeline={tl} step={step}/>
                {/* Timeline */}
                <div style={{marginTop:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div className="cai-btn cai-btn-ghost" style={{padding:"4px 10px"}} onClick={()=>setStep(s=>Math.max(0,s-1))}>‹</div>
                    <input type="range" min={0} max={Math.max(0,tl.length-1)} value={step} onChange={e=>setStep(parseInt(e.target.value))} style={{flex:1}}/>
                    <div className="cai-btn cai-btn-ghost" style={{padding:"4px 10px"}} onClick={()=>setStep(s=>Math.min(tl.length-1,s+1))}>›</div>
                  </div>
                  {tl[step]&&(
                    <div style={{background:"rgba(0,0,0,.25)",borderRadius:8,padding:"8px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,textTransform:"uppercase"}}>{tl[step].streetFr} · {tl[step].pos}</span>
                        <div style={{fontSize:11,fontWeight:700,color:tl[step].isHero?T.gold:T.text2,fontFamily:T.stats}}>{tl[step].isHero?"HERO":tl[step].actor} — {tl[step].label}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <span style={{fontFamily:T.brand,fontSize:13,fontWeight:900,color:T.gold}}>{tl[step].potAfterBb}bb</span>
                        <div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>POT</div>
                      </div>
                    </div>
                  )}
                  <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,textAlign:"center",marginTop:5}}>Action {step+1} / {tl.length}</div>
                </div>
              </div>
            </div>

            {/* COLONNE DROITE : score + analyse */}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* Score */}
              <div className="cai-card">
                <div className="cai-card-h">Score de la main</div>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{position:"relative",width:78,height:78,flexShrink:0}}>
                    <svg viewBox="0 0 100 100" style={{transform:"rotate(-90deg)"}}>
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9"/>
                      <circle cx="50" cy="50" r="42" fill="none" stroke={sc.score>=70?"#10D87A":sc.score>=50?"#FFC247":"#FF4560"} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${sc.score*2.64} 264`}/>
                    </svg>
                    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontFamily:T.brand,fontSize:22,fontWeight:900,color:"#fff"}}>{sc.score}</span>
                      <span style={{fontSize:7,color:T.text4}}>/ 100</span>
                    </div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:800,color:sc.score>=70?T.green:sc.score>=50?T.gold:T.red}}>{sc.grade} · {sc.label}</div>
                    <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginTop:3}}>Confiance : <b style={{color:CE_CONF[sc.confidence].c}}>{CE_CONF[sc.confidence].l}</b></div>
                    {[["Préflop",sc.subScores.preflop],["Postflop",sc.subScores.postflop],["Sizing",sc.subScores.sizing],["Discipline",sc.subScores.discipline]].map(([l,v])=>(
                      <div key={l} style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                        <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,width:54}}>{l}</span>
                        <div style={{flex:1,height:4,borderRadius:3,background:"rgba(255,255,255,.08)"}}><div style={{width:v+"%",height:"100%",borderRadius:3,background:v>=70?"#10D87A":v>=50?"#FFC247":"#FF4560"}}/></div>
                        <span style={{fontSize:8,color:T.text3,fontFamily:T.stats,width:20,textAlign:"right"}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{fontSize:8,color:T.text4,fontStyle:"italic",marginTop:9,lineHeight:1.5}}>{sc.disclaimer}</div>
              </div>

              {/* Résumé de la line + décision clé */}
              <div className="cai-card">
                <div className="cai-card-h">Résumé & décision clé</div>
                <div style={{fontSize:10,color:T.text2,lineHeight:1.6,marginBottom:8}}>{result.analysisSummary.lineSummary}</div>
                {result.analysisSummary.keyDecision&&(
                  <div style={{background:"rgba(52,216,255,.07)",border:"1px solid rgba(52,216,255,.25)",borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:8,color:"#34D8FF",fontFamily:T.stats,textTransform:"uppercase",fontWeight:700,marginBottom:3}}>Décision clé · {result.analysisSummary.keyDecision.streetFr}</div>
                    <div style={{fontSize:10,color:T.text2}}>Hero : <b>{result.analysisSummary.keyDecision.heroAction}</b></div>
                    <div style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>Face à : {result.analysisSummary.keyDecision.facing} · Pot {result.analysisSummary.keyDecision.potBb}bb</div>
                    <div style={{fontSize:9.5,color:T.gold,marginTop:5}}>💡 {result.analysisSummary.bestActionEstimate}</div>
                  </div>
                )}
              </div>

              {/* Erreurs */}
              {result.mistakes.length>0&&(
                <div className="cai-card">
                  <div className="cai-card-h">Erreurs détectées ({result.mistakes.length})</div>
                  {result.mistakes.map((m,i)=>(
                    <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:i<result.mistakes.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
                      <span style={{flexShrink:0,fontSize:7.5,fontWeight:800,color:CE_SEV_COL[m.severity],border:`1px solid ${CE_SEV_COL[m.severity]}55`,borderRadius:10,padding:"1px 6px",height:"fit-content",fontFamily:T.stats}}>{CE_SEV_LBL[m.severity]}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,color:T.text2,lineHeight:1.5}}>{m.text}</div>
                        {m.evLossBb!=null&&<div style={{fontSize:8,color:T.red,fontFamily:T.stats,marginTop:2}}>EV estimée perdue ≈ {m.evLossBb}bb</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Points positifs + sizing */}
              {(result.goodPoints.length>0||result.sizingNotes.length>0)&&(
                <div className="cai-card">
                  {result.goodPoints.length>0&&<><div className="cai-card-h">Points positifs</div>
                    {result.goodPoints.map((g,i)=><div key={i} style={{fontSize:9.5,color:T.green,marginBottom:4,lineHeight:1.5}}>✓ {g}</div>)}</>}
                  {result.sizingNotes.length>0&&<><div className="cai-card-h" style={{marginTop:result.goodPoints.length?10:0}}>Sizing</div>
                    {result.sizingNotes.map((g,i)=><div key={i} style={{fontSize:9.5,color:T.text3,marginBottom:4,lineHeight:1.5}}>📏 {g}</div>)}</>}
                </div>
              )}

              {/* Leaks + recommandations d'entraînement */}
              <div className="cai-card">
                <div className="cai-card-h">Leaks & entraînement recommandé</div>
                {result.leakTags.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:9}}>
                    {result.leakTags.map((t,i)=><span key={i} style={{padding:"2px 8px",borderRadius:12,fontSize:8,fontWeight:700,color:"#FF8A3D",background:"rgba(255,138,61,.1)",border:"1px solid rgba(255,138,61,.3)",fontFamily:T.stats}}>{t}</span>)}
                  </div>
                )}
                {result.trainingRecommendations.map((r,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"6px 0",borderBottom:i<result.trainingRecommendations.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,fontWeight:700,color:T.text2}}>{r.label}</div>
                      <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{r.hint}</div>
                    </div>
                    <div className="cai-btn cai-btn-ghost" style={{padding:"4px 10px",flexShrink:0}} onClick={()=>onGoTrainer&&onGoTrainer(r.drill)}>🎯 Drill</div>
                  </div>
                ))}
              </div>

              {/* Flags mentaux */}
              {result.mentalFlags.length>0&&(
                <div className="cai-card" style={{borderColor:"rgba(155,92,255,.3)"}}>
                  <div className="cai-card-h" style={{color:"#9B5CFF"}}>🧠 Signaux mentaux</div>
                  {result.mentalFlags.map((f,i)=><div key={i} style={{fontSize:9.5,color:T.text3,marginBottom:4,lineHeight:1.5}}>• {f.note}</div>)}
                  <div className="cai-btn cai-btn-ghost" style={{marginTop:6}} onClick={()=>onNav&&onNav("mental")}>Ouvrir le Mental Game</div>
                </div>
              )}

            </div>
          </div>

          {/* ══ EXPLICATION IA PREMIUM (LLM par-dessus l'analyse technique) ══ */}
          <div className="cai-card" style={{marginTop:14,borderColor:"rgba(155,92,255,.3)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:llmText?9:0}}>
              <span style={{fontFamily:T.brand,fontSize:12,fontWeight:900,color:"#B69BFF"}}>🤖 Explication IA premium</span>
              <span style={{fontSize:8,color:T.text4,fontFamily:T.stats}}>par-dessus l'analyse technique ci-dessus</span>
              <div className="cai-btn" style={{marginLeft:"auto",padding:"5px 12px",fontSize:9.5,opacity:llmBusy?.6:1}} onClick={explainAI}>{llmBusy?"Rédaction…":llmText?"↻ Régénérer":"✨ Générer l'explication"}</div>
            </div>
            {llmBusy&&<div style={{display:"flex",gap:5,alignItems:"center",color:"#B69BFF",fontFamily:T.stats,fontSize:10}}><div className="aidot"/><div className="aidot"/><div className="aidot"/> Le coach IA rédige…</div>}
            {llmText&&!llmBusy&&<div style={{fontSize:10.5,color:T.text2,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{llmText}</div>}
            {!llmText&&!llmBusy&&<div style={{fontSize:9,color:T.text4,fontFamily:T.stats,marginTop:6,fontStyle:"italic"}}>Transforme l'analyse technique en coaching clair et personnalisé (nécessite la clé OpenAI côté serveur).</div>}
          </div>

          {/* ══ AGENTS SPÉCIALISÉS (orchestrateur) ══ */}
          {coach&&coach.ok&&(
            <div style={{marginTop:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,margin:"0 2px 10px"}}>
                <span style={{fontFamily:T.brand,fontSize:13,fontWeight:900,color:T.text,letterSpacing:".04em"}}>👥 AGENTS SPÉCIALISÉS</span>
                <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{coach.agents.filter(a=>a.active).length}/{coach.agents.length} actifs sur ce spot</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(248px,1fr))",gap:10}}>
                {coach.agents.map(a=>(
                  <div key={a.id} className="cai-card" style={{padding:"11px 12px",opacity:a.active?1:.62,
                    borderColor:a.central?"rgba(255,93,158,.45)":a.active?a.color+"55":"#0F2258",
                    background:a.central?"rgba(255,93,158,.05)":undefined,position:"relative"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                      <span style={{fontSize:15}}>{a.icon}</span>
                      <span style={{fontFamily:T.brand,fontSize:10.5,fontWeight:800,color:a.color,flex:1}}>{a.name}{a.central?" ★":""}</span>
                      <span style={{fontSize:7,fontWeight:800,fontFamily:T.stats,padding:"1px 6px",borderRadius:8,
                        color:a.active?"#10D87A":T.text4,background:a.active?"rgba(16,216,122,.12)":"rgba(255,255,255,.04)",
                        border:`1px solid ${a.active?"rgba(16,216,122,.3)":"#1A3A80"}`}}>{a.active?"ACTIF":"VEILLE"}</span>
                    </div>
                    {a.headline&&<div style={{fontSize:10,fontWeight:700,color:T.text2,marginBottom:5,lineHeight:1.4}}>{a.headline}</div>}
                    {(a.lines||[]).slice(0,4).map((l,i)=><div key={i} style={{fontSize:9,color:T.text3,lineHeight:1.5,marginBottom:3,fontFamily:T.stats}}>{a.active?"• ":""}{l}</div>)}
                    {a.tags&&a.tags.length>0&&(
                      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                        {a.tags.slice(0,5).map((t,i)=><span key={i} style={{fontSize:7,fontWeight:700,color:a.color,background:a.color+"14",border:`1px solid ${a.color}33`,borderRadius:8,padding:"1px 6px",fontFamily:T.stats}}>{t}</span>)}
                      </div>
                    )}
                    {a.id==="mental"&&a.active&&<div className="cai-btn cai-btn-ghost" style={{padding:"3px 9px",marginTop:8,fontSize:9}} onClick={()=>onNav&&onNav("mental")}>🧠 Mental Game</div>}
                  </div>
                ))}
              </div>

              {/* ── Actions concrètes obligatoires ── */}
              <div className="cai-card" style={{marginTop:12}}>
                <div className="cai-card-h">Actions</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {coach.suggestedActions.map(act=>(
                    <div key={act.id} className={act.disabled?"cai-btn cai-btn-ghost":(act.id==="replay-trainer"||act.id==="drill-similar"?"cai-btn":"cai-btn cai-btn-ghost")}
                      style={{opacity:act.disabled?.4:1,cursor:act.disabled?"not-allowed":"pointer",fontSize:9.5}}
                      onClick={()=>!act.disabled&&doAction(act.id)}>{act.icon} {act.label}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"rgba(8,20,48,.97)",border:"1px solid rgba(52,216,255,.4)",borderRadius:10,padding:"10px 18px",color:T.text,fontSize:11,fontFamily:T.stats,boxShadow:"0 8px 30px rgba(0,0,0,.6)"}}>{toast}</div>}
    </div>
  );
}

export default function CoachAITab({unit,onGoTrainer,onGoReplayer,jumpTo,onJumped,seed,onSeedApplied,NavIcon,CoachTab}){
  const[sub,setSub]=useState(()=>localStorage.getItem("pf_coach_sub")||"mental");
  const[stats,setStats]=useState(()=>loadStats());
  const[analyzeSeed,setAnalyzeSeed]=useState(null);  // HH entrante (Replayer → Coach AI)
  useEffect(()=>{localStorage.setItem("pf_coach_sub",sub);},[sub]);
  useEffect(()=>{if(jumpTo){setSub(jumpTo);onJumped&&onJumped();}},[jumpTo]);
  useEffect(()=>{if(seed){setAnalyzeSeed(seed);setSub("analyze");onSeedApplied&&onSeedApplied();}},[seed]);
  const refresh=()=>setStats({...loadStats()});
  const profile=useMemo(()=>buildCoachProfile(stats),[stats]);
  return(
    <div className="coachai">
      <div className="coachai-nav">
        {COACHAI_NAV.map(([id,label])=>(
          <div key={id} className={`coachai-ntab${sub===id?" on":""}`} onClick={()=>setSub(id)}>{label}</div>
        ))}
      </div>
      <div className="coachai-body">
        {sub==="overview"  && <CoachOverview profile={profile} onGoTrainer={onGoTrainer} onNav={setSub}/>}
        {sub==="analyze"   && <CoachAnalyzeHand onGoTrainer={onGoTrainer} onGoReplayer={onGoReplayer} onNav={setSub} initialRaw={analyzeSeed} onInitialConsumed={()=>setAnalyzeSeed(null)}/>}
        {sub==="diagnostic"&& <CoachDiagnostic stats={stats} onGoTrainer={onGoTrainer}/>}
        {sub==="leaks"     && <CoachLeaks stats={stats} onGoTrainer={onGoTrainer}/>}
        {sub==="plan"      && <CoachPlan stats={stats} onGoTrainer={onGoTrainer}/>}
        {sub==="event"     && <CoachEvent onGoTrainer={onGoTrainer} onRefresh={refresh}/>}
        {sub==="career"    && <CoachCareer stats={stats} onGoTrainer={onGoTrainer} onRefresh={refresh}/>}
        {sub==="live"      && <CoachLive profile={profile}/>}
        {sub==="mental"    && <MentalGameTab onGoTrainer={onGoTrainer} NavIcon={NavIcon}/>}
        {sub==="history"   && <CoachHistory stats={stats}/>}
        {sub==="tools"     && <CoachTab unit={unit} onGoTrainer={onGoTrainer}/>}
      </div>
    </div>
  );
}

/* ── 1. Vue d'ensemble ── */
function CoachOverview({profile,onGoTrainer,onNav}){
  const{hasData,levelLabel,gtoScore,rank,rankCol,activeGoal,careerProgress,targetEvent,priorityLeak,dailyMission,nextStep,recentProgress}=profile;
  return(
    <div className="cai-pane">
      <div className="cai-hero">
        <div className="cai-hero-title">🧠 Coach AI — Centre de pilotage</div>
        <div className="cai-hero-sub" style={{marginBottom:14}}>
          {hasData?`Niveau actuel : ${levelLabel}`:"Joue ta première session pour activer ton profil Coach AI."}
        </div>
        <div className="cai-grid3" style={{marginBottom:0}}>
          <div className="cai-card">
            <div className="cai-card-h">Score GTO global</div>
            <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:8}}>
              <span style={{fontFamily:T.brand,fontSize:30,fontWeight:800,color:rankCol}}>{gtoScore}</span>
              <span style={{fontSize:11,color:T.text3}}>/ 100</span>
            </div>
            <div className="cai-progress-wrap"><div className="cai-progress-bar" style={{width:gtoScore+"%"}}/></div>
            <div style={{fontSize:9,color:T.text3,marginTop:6,fontFamily:T.stats}}>Rang : <span style={{color:rankCol,fontWeight:700}}>{rank}</span></div>
          </div>
          <div className="cai-card">
            <div className="cai-card-h">Objectif actif</div>
            {activeGoal?(
              <>
                <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:8}}>{activeGoal.icon} {activeGoal.label}</div>
                <div className="cai-progress-wrap"><div className="cai-progress-bar" style={{width:(careerProgress||0)+"%"}}/></div>
                <div style={{fontSize:9,color:T.text3,marginTop:6}}>{careerProgress}% de progression</div>
              </>
            ):(
              <>
                <div style={{fontSize:10.5,color:T.text3,marginBottom:10,lineHeight:1.6}}>Aucun objectif Career Mode sélectionné.</div>
                <div className="cai-btn cai-btn-ghost" onClick={()=>onNav("career")}>🚀 Choisir un objectif</div>
              </>
            )}
          </div>
          <div className="cai-card">
            <div className="cai-card-h">Événement ciblé</div>
            {targetEvent?(
              <>
                <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:6}}>{targetEvent.event.flag} {targetEvent.event.name}</div>
                <div style={{fontSize:9.5,color:T.text3,marginBottom:8}}>{targetEvent.daysLeft>0?`Dans ${targetEvent.daysLeft} jours`:"En cours / passé"}</div>
                <div className="cai-btn cai-btn-ghost" onClick={()=>onNav("event")}>🎯 Voir la préparation</div>
              </>
            ):(
              <>
                <div style={{fontSize:10.5,color:T.text3,marginBottom:10,lineHeight:1.6}}>Aucun événement en préparation.</div>
                <div className="cai-btn cai-btn-ghost" onClick={()=>onNav("event")}>📅 Préparer un événement</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="cai-grid2">
        <div className="cai-card">
          <div className="cai-card-h">⚠️ Leak prioritaire</div>
          {priorityLeak?(
            <>
              <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:4}}>{priorityLeak.icon} {priorityLeak.label}</div>
              <div style={{fontSize:10,color:T.text3,marginBottom:10,lineHeight:1.6}}>{priorityLeak.desc}</div>
              <div className="cai-btn" onClick={()=>onNav("leaks")}>🛠️ Travailler ce leak</div>
            </>
          ):<div style={{fontSize:10.5,color:T.text3,lineHeight:1.6}}>Aucun leak détecté pour le moment — continue à jouer pour affiner ton diagnostic.</div>}
        </div>
        <div className="cai-card">
          <div className="cai-card-h">⚡ Mission du jour</div>
          {dailyMission?(
            <>
              <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:4}}>{dailyMission.label}</div>
              <div style={{fontSize:10,color:T.text3,marginBottom:10}}>{dailyMission.spots} spots recommandés · Score actuel {dailyMission.score}%</div>
              <div className="cai-btn cai-btn-gold" onClick={onGoTrainer}>🚀 Lancer la session</div>
            </>
          ):<div style={{fontSize:10.5,color:T.text3,lineHeight:1.6}}>Lance une première session pour générer ta mission du jour.</div>}
        </div>
      </div>

      {recentProgress.length>0&&(
        <div className="cai-card" style={{marginBottom:14}}>
          <div className="cai-card-h">📈 Progression récente</div>
          {recentProgress.map((imp,i)=>(
            <div key={i} style={{fontSize:10.5,color:imp.delta>0?T.green:T.red,fontFamily:T.stats,marginBottom:4}}>
              {imp.delta>0?"↑ +":"↓ "}{Math.abs(imp.delta)}% {imp.metric} · {imp.date}
            </div>
          ))}
        </div>
      )}

      <div className="cai-card" style={{background:"linear-gradient(135deg,rgba(31,139,255,.1),rgba(155,92,255,.08))",borderColor:"rgba(155,92,255,.3)"}}>
        <div className="cai-card-h">🧭 Prochaine étape conseillée</div>
        <div style={{fontSize:11.5,color:"#fff",marginBottom:12,lineHeight:1.6}}>{nextStep}</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <div className="cai-btn" onClick={onGoTrainer}>Continuer ma progression →</div>
          <div className="cai-btn cai-btn-ghost" onClick={()=>onNav("diagnostic")}>📊 Voir mon diagnostic complet</div>
        </div>
      </div>
    </div>
  );
}

/* ── 2. Diagnostic (17 domaines) ── */
function CoachDiagnostic({stats,onGoTrainer}){
  const diag=useMemo(()=>buildDiagnostic(stats),[stats]);
  const weak=useMemo(()=>diag.filter(d=>d.hasData).sort((a,b)=>a.score-b.score)[0],[diag]);
  return(
    <div className="cai-pane">
      <div className="cai-hero" style={{padding:"16px 20px"}}>
        <div className="cai-hero-title" style={{fontSize:15}}>🩺 Diagnostic complet — 17 domaines</div>
        <div className="cai-hero-sub">Analyse détaillée de ton niveau par domaine de jeu, basée sur tes sessions réelles.</div>
      </div>
      <div className="cai-grid3">
        {diag.map(d=>(
          <div key={d.id} className="cai-diag-card">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:T.body}}>{d.icon} {d.label}</span>
              {d.evolution&&<span style={{fontSize:9,color:d.evolution.delta>0?T.green:T.red,fontFamily:T.stats}}>{d.evolution.delta>0?"↑":"↓"}{Math.abs(d.evolution.delta)}%</span>}
            </div>
            <div className="cai-diag-score" style={{color:d.levelCol,marginBottom:4}}>{d.hasData?d.score+"%":"—"}</div>
            <div className="cai-pill" style={{background:d.levelCol+"18",color:d.levelCol,border:`1px solid ${d.levelCol}44`,marginBottom:8}}>{d.level}</div>
            <div style={{fontSize:9.5,color:T.text3,lineHeight:1.6}}>{d.recommendation}</div>
          </div>
        ))}
      </div>
      <div className="cai-card">
        <div className="cai-card-h">💡 Recommandation immédiate</div>
        <div style={{fontSize:11,color:"#C9D4E8",marginBottom:12,lineHeight:1.6}}>
          {weak?`Ton domaine le plus fragile actuellement est "${weak.label}" (${weak.score}%). ${weak.recommendation}`:"Joue quelques sessions pour débloquer une recommandation personnalisée."}
        </div>
        <div className="cai-btn" onClick={onGoTrainer}>🚀 Lancer une session ciblée</div>
      </div>
    </div>
  );
}

/* ── 3. Leaks (top 5) ── */
function CoachLeaks({stats,onGoTrainer}){
  const leaks=useMemo(()=>buildLeakReports(stats),[stats]);
  const sevCol={"Élevé":T.red,"Moyen":T.amber,"Faible":T.cyan};
  return(
    <div className="cai-pane">
      <div className="cai-hero" style={{padding:"16px 20px"}}>
        <div className="cai-hero-title" style={{fontSize:15}}>🔍 Top {Math.max(leaks.length,5)} Leaks détectés</div>
        <div className="cai-hero-sub">Classés par impact estimé sur ton EV — corrige-les en priorité.</div>
      </div>
      {leaks.length===0&&(
        <div className="cai-card"><div style={{fontSize:11,color:T.text3,lineHeight:1.6}}>Aucun leak détecté pour le moment. Joue des sessions dans l'Entraîneur pour générer ton analyse de leaks.</div></div>
      )}
      {leaks.map(l=>(
        <div key={l.rank} className="cai-leak-card">
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:8,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:22}}>{l.icon}</span>
              <div>
                <div style={{fontSize:12.5,fontWeight:800,color:"#fff"}}>#{l.rank} {l.label}</div>
                <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats}}>{l.cat} · {l.acc}% précision · {l.count} occurrences</div>
              </div>
            </div>
            <span className="cai-pill" style={{background:sevCol[l.severity]+"18",color:sevCol[l.severity],border:`1px solid ${sevCol[l.severity]}44`}}>Impact {l.severity}</span>
          </div>
          <div style={{fontSize:10.5,color:"#C9D4E8",marginBottom:6,lineHeight:1.6}}>{l.desc}</div>
          <div style={{fontSize:9.5,color:T.text3,marginBottom:10}}>≈ <span style={{color:T.gold,fontWeight:700}}>-{l.impactEv} BB/100</span> estimé · Correction : {l.correction}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <div className="cai-btn" onClick={onGoTrainer}>🛠️ Travailler ce leak</div>
            <div className="cai-btn cai-btn-ghost" onClick={onGoTrainer}>⚡ Lancer un training ciblé</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 4. Plan d'entraînement ── */
function CoachPlan({stats,onGoTrainer}){
  const[mode,setMode]=useState("daily");
  const[myPlan,setMyPlan]=useState(()=>{try{return ceLoadPlan();}catch{return [];}});
  const plan=useMemo(()=>buildTrainingPlan(stats),[stats]);
  const rows=mode==="daily"?plan.daily:plan.weekly;
  const removeItem=(idx)=>{const next=myPlan.filter((_,i)=>i!==idx);setMyPlan(next);ceSavePlan(next);};
  return(
    <div className="cai-pane">
      <div className="cai-hero" style={{padding:"16px 20px"}}>
        <div className="cai-hero-title" style={{fontSize:15}}>📅 Plan d'entraînement</div>
        <div className="cai-hero-sub">Programme généré à partir de tes diagnostics et de tes leaks actuels.</div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          {[["daily","Aujourd'hui"],["weekly","Cette semaine"]].map(([id,l])=>(
            <div key={id} className={`cai-btn${mode===id?"":" cai-btn-ghost"}`} onClick={()=>setMode(id)}>{l}</div>
          ))}
        </div>
      </div>

      {/* Mon plan personnel — items ajoutés depuis l'analyse de mains (Coach AI) */}
      {myPlan.length>0&&(
        <div className="cai-card" style={{margin:"0 0 14px"}}>
          <div className="cai-card-h">🎯 Mon plan personnel ({myPlan.length})</div>
          {myPlan.map((it,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:i<myPlan.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
              <span style={{fontSize:14,flexShrink:0}}>{it.type==="mental"?"🧠":"🔍"}</span>
              <div style={{flex:1,minWidth:0}}>
                {it.type==="mental"?(
                  <>
                    <div style={{fontSize:10.5,fontWeight:700,color:"#B69BFF"}}>Routine : {it.pattern}</div>
                    <div style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>{it.routine}</div>
                  </>
                ):(
                  <>
                    <div style={{fontSize:10.5,fontWeight:700,color:T.text2}}>{it.family||it.tag}</div>
                    <div style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>Priorité {it.priority||"—"}/100</div>
                  </>
                )}
              </div>
              {it.type!=="mental"&&<div className="cai-btn cai-btn-ghost" style={{padding:"4px 10px",flexShrink:0}} onClick={()=>onGoTrainer&&onGoTrainer(it.drill)}>🎯 Drill</div>}
              <div onClick={()=>removeItem(i)} title="Retirer" style={{cursor:"pointer",color:T.text4,fontSize:14,flexShrink:0,padding:"0 4px"}}>✕</div>
            </div>
          ))}
        </div>
      )}
      {rows.map((r,i)=>(
        <div key={i} className="cai-plan-row">
          <div className="cai-plan-day">{mode==="daily"?r.day:r.day}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:3}}>{r.theme}</div>
            <div style={{fontSize:9.5,color:T.text3,marginBottom:6}}>{r.duree} · {r.spots} spots · Difficulté {r.difficulte}</div>
            <div style={{fontSize:10,color:"#9FB0CC",marginBottom:2}}>🎯 Objectif technique : {r.objTech}</div>
            <div style={{fontSize:10,color:"#9FB0CC"}}>🧘 Objectif mental : {r.objMental}</div>
          </div>
          <div className="cai-btn cai-btn-ghost" onClick={onGoTrainer} style={{flexShrink:0}}>Lancer →</div>
        </div>
      ))}
    </div>
  );
}

/* ── 5. Préparation d'événement ── */
function CoachEvent({onGoTrainer,onRefresh}){
  const[ep,setEp]=useState(()=>loadCoachEvent());
  function prepare(ev){
    const built=buildEventPreparation(ev,loadStats());
    saveCoachEvent(built);setEp(built);onRefresh&&onRefresh();
  }
  function toggleCheck(i){
    if(!ep)return;
    const checklistDone=ep.checklistDone?[...ep.checklistDone]:ep.checklist.map(()=>false);
    checklistDone[i]=!checklistDone[i];
    const updated={...ep,checklistDone};
    setEp(updated);saveCoachEvent(updated);
  }
  function togglePlanDone(i){
    if(!ep)return;
    const plan=ep.plan||[];
    const planDone=ep.planDone?[...ep.planDone]:plan.map(()=>false);
    planDone[i]=!planDone[i];
    const updated={...ep,planDone};
    setEp(updated);saveCoachEvent(updated);
  }
  function saveNotes(v){
    const updated={...ep,notes:v};
    setEp(updated);saveCoachEvent(updated);
  }
  function cancelPrep(){clearCoachEvent();setEp(null);onRefresh&&onRefresh();}
  if(!ep){
    const upcoming=POKER_EVENTS
      .filter(e=>daysUntil(e.end)>=0)
      .sort((a,b)=>new Date(a.start)-new Date(b.start))
      .slice(0,6);
    return(
      <div className="cai-pane">
        <div className="cai-hero">
          <div className="cai-hero-title">🎯 Préparation d'événement</div>
          <div className="cai-hero-sub">Choisis un événement à venir : Coach AI génère un plan de préparation, une checklist et des conseils adaptés à son format.</div>
        </div>
        <div className="cai-card">
          <div className="cai-card-h">Événements à venir</div>
          {upcoming.map(ev=>{
            const d=daysUntil(ev.start);
            return(
              <div key={ev.id} className="cai-plan-row cai-evpick" onClick={()=>prepare(ev)}>
                <div className="cai-plan-day">{d>0?`J-${d}`:"🔴 Live"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:3}}>{ev.flag} {ev.name}</div>
                  <div style={{fontSize:9.5,color:T.text3}}>{ev.loc} · {ev.gtdDisplay} · {ev.buyinDisplay}</div>
                </div>
                <div className="cai-btn cai-btn-gold" style={{flexShrink:0}}>🎯 Préparer</div>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:10.5,color:T.text3,lineHeight:1.7}}>
          💡 Tu peux aussi lancer une préparation depuis le hub "Événements Poker" du Dashboard ou depuis le Solver.
        </div>
      </div>
    );
  }
  const{event:ev,daysLeft,mentalRoutine,requiredSkills}=ep;
  const daysLeftEnd=ep.daysLeftEnd??daysUntil(ev.end);
  const plan=ep.plan||[];
  const planDone=ep.planDone||plan.map(()=>false);
  const checklist=ep.checklist||[];
  const checklistDone=ep.checklistDone||checklist.map(()=>false);
  const tips=ep.tips||[];
  const doneCount=checklistDone.filter(Boolean).length;
  const planDoneCount=planDone.filter(Boolean).length;
  const isFinished=plan.length===0;
  return(
    <div className="cai-pane">
      <div className="cai-hero">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
          <div>
            <div className="cai-hero-title">{ev.flag} {ev.name}</div>
            <div className="cai-hero-sub">{ev.loc} · {ev.gtdDisplay} · {ev.buyinDisplay}</div>
          </div>
          <span className="cai-pill" style={{background:"rgba(255,194,71,.12)",color:T.gold,border:"1px solid rgba(255,194,71,.35)",fontSize:11,padding:"6px 14px"}}>
            {daysLeft>0?`J-${daysLeft}`:daysLeft===0?"C'est aujourd'hui !":daysLeftEnd>=0?"🔴 Événement en cours":"✅ Terminé"}
          </span>
        </div>
        <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
          <div className="cai-btn cai-btn-gold" onClick={onGoTrainer}>🎮 Simuler cet événement</div>
          <div className="cai-btn cai-btn-ghost" onClick={cancelPrep}>🔁 Changer d'événement</div>
        </div>
      </div>

      {isFinished?(
        <div className="cai-card" style={{marginBottom:14}}>
          <div className="cai-card-h">📝 Bilan de l'événement</div>
          <div style={{fontSize:10.5,color:T.text3,marginBottom:10,lineHeight:1.6}}>
            Cet événement est terminé. Note tes enseignements clés — Coach AI les conserve dans ton historique de préparation.
          </div>
          <textarea value={ep.notes||""} onChange={e=>saveNotes(e.target.value)}
            placeholder="Qu'as-tu bien/mal joué ? Quels spots retravailler la prochaine fois ?"
            style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,color:T.text,fontFamily:T.stats,fontSize:11,padding:"8px 10px",outline:"none",resize:"vertical",minHeight:80,lineHeight:1.6,boxSizing:"border-box"}}/>
        </div>
      ):(
        <div className="cai-card" style={{marginBottom:14}}>
          <div className="cai-card-h">📋 Plan de préparation ({planDoneCount}/{plan.length})</div>
          {plan.map((p,i)=>(
            <div key={i} className="cai-plan-row" style={{marginBottom:i===plan.length-1?0:8}}>
              <div className={`goal-check ${planDone[i]?"done":""}`} onClick={()=>togglePlanDone(i)} style={{cursor:"pointer"}}>{planDone[i]?"✓":""}</div>
              <div className="cai-plan-day">{p.day}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:700,color:planDone[i]?"#5A728E":"#fff",marginBottom:3,textDecoration:planDone[i]?"line-through":"none"}}>{p.theme}</div>
                <div style={{fontSize:9.5,color:T.text3}}>{p.spots>0?`${p.spots} spots · `:""}Focus : {p.focus}</div>
              </div>
              <div className="cai-btn cai-btn-ghost" onClick={onGoTrainer} style={{flexShrink:0}}>Lancer →</div>
            </div>
          ))}
        </div>
      )}

      <div className="cai-grid2">
        <div className="cai-card">
          <div className="cai-card-h">✅ Checklist jour J ({doneCount}/{checklist.length})</div>
          {checklist.map((c,i)=>(
            <div key={i} className="goal-item" onClick={()=>toggleCheck(i)} style={{cursor:"pointer"}}>
              <div className={`goal-check ${checklistDone[i]?"done":""}`}>{checklistDone[i]?"✓":""}</div>
              <div className={`goal-label ${checklistDone[i]?"done":""}`}>{c}</div>
            </div>
          ))}
        </div>
        <div className="cai-card">
          <div className="cai-card-h">🧘 Routine mentale</div>
          {mentalRoutine.map((m,i)=>(
            <div key={i} style={{fontSize:10.5,color:"#C9D4E8",marginBottom:8,lineHeight:1.6,paddingLeft:14,borderLeft:"2px solid rgba(155,92,255,.3)"}}>{m}</div>
          ))}
        </div>
      </div>

      {tips.length>0&&(
        <div className="cai-card">
          <div className="cai-card-h">💡 Conseils spécifiques à cet événement</div>
          {tips.map((t,i)=>(
            <div key={i} style={{fontSize:10.5,color:"#C9D4E8",marginBottom:8,lineHeight:1.6,paddingLeft:14,borderLeft:"2px solid rgba(255,194,71,.35)"}}>{t}</div>
          ))}
        </div>
      )}

      <div className="cai-card">
        <div className="cai-card-h">🧩 Compétences requises pour cet événement</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {requiredSkills.map((s,i)=>(<span key={i} className="cai-pill" style={{background:"rgba(31,139,255,.1)",color:"#7FB8FF",border:"1px solid rgba(31,139,255,.3)"}}>{s}</span>))}
        </div>
      </div>
    </div>
  );
}

/* ── 6. Career Mode ── */
function CoachCareer({stats,onGoTrainer,onRefresh}){
  const[goalId,setGoalId]=useState(()=>loadCareerGoal());
  function pick(id){saveCareerGoal(id);setGoalId(id);onRefresh&&onRefresh();}
  function reset(){try{localStorage.removeItem("pf_career_goal");}catch{}setGoalId(null);onRefresh&&onRefresh();}
  if(!goalId){
    return(
      <div className="cai-pane">
        <div className="cai-hero">
          <div className="cai-hero-title">🚀 Career Mode</div>
          <div className="cai-hero-sub">Choisis ton objectif principal — Coach AI connectera Dashboard, Entraîneur, Solver, Replayer et Mains autour de cette progression.</div>
        </div>
        <div className="cai-grid3">
          {CAREER_GOALS.map(g=>(
            <div key={g.id} className="cai-goal-card" onClick={()=>pick(g.id)}>
              <div style={{fontSize:22,marginBottom:8}}>{g.icon}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:6}}>{g.label}</div>
              <div style={{fontSize:9.5,color:T.text3,lineHeight:1.6}}>{g.desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const progress=buildCareerProgress(stats,goalId);
  const missions=buildMissions(stats);
  const recommendations=buildCareerMissions(stats,progress);
  const weekly=buildCareerWeekly(progress);
  const nextGoal=progress.nextGoalId?CAREER_GOALS.find(g=>g.id===progress.nextGoalId):null;
  return(
    <div className="cai-pane">
      <div className="cai-hero">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
          <div>
            <div className="cai-hero-title">{progress.goal.icon} {progress.goal.label}</div>
            <div className="cai-hero-sub">{progress.goal.desc}</div>
          </div>
          <div className="cai-btn cai-btn-ghost" onClick={reset}>🔄 Changer d'objectif</div>
        </div>
        <div style={{marginTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.text3,marginBottom:5}}>
            <span>Progression globale</span><span style={{color:T.gold,fontWeight:700}}>{progress.progressPct}%</span>
          </div>
          <div className="cai-progress-wrap"><div className="cai-progress-bar" style={{width:progress.progressPct+"%"}}/></div>
        </div>
      </div>

      {progress.completed&&(
        <div className="cai-card" style={{marginBottom:14,border:"1px solid rgba(255,194,71,.35)",background:"rgba(255,194,71,.06)"}}>
          <div className="cai-card-h">🏆 Objectif atteint !</div>
          <div style={{fontSize:11,color:"#C9D4E8",marginBottom:12,lineHeight:1.7}}>
            Toutes les étapes de "<b style={{color:T.gold}}>{progress.goal.label}</b>" sont validées. Coach AI te recommande de viser un nouvel objectif pour continuer ta progression.
          </div>
          {nextGoal?(
            <div className="cai-plan-row cai-evpick" onClick={()=>pick(nextGoal.id)}>
              <div className="cai-plan-day">{nextGoal.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:3}}>{nextGoal.label}</div>
                <div style={{fontSize:9.5,color:T.text3}}>{nextGoal.desc}</div>
              </div>
              <div className="cai-btn cai-btn-gold" style={{flexShrink:0}}>🚀 Commencer</div>
            </div>
          ):(
            <div className="cai-btn cai-btn-gold" onClick={reset}>🔄 Choisir un nouvel objectif</div>
          )}
        </div>
      )}

      <div className="cai-grid2">
        <div className="cai-card">
          <div className="cai-card-h">🗺️ Étapes de progression</div>
          {progress.steps.map((s,i)=>(
            <div key={i} className="cai-step">
              <div className={`cai-step-dot ${s.done?"done":s.current?"current":""}`}>{s.done?"✓":i+1}</div>
              <div style={{flex:1,fontSize:11,color:s.done?T.text3:"#fff",textDecoration:s.done?"line-through":"none"}}>{s.label}</div>
              <span className="cai-pill" style={{background:"rgba(255,255,255,.06)",color:T.text3,marginRight:s.current?8:0}}>{s.pct}%</span>
              {s.current&&<span className="cai-pill" style={{background:"rgba(255,194,71,.12)",color:T.gold,border:"1px solid rgba(255,194,71,.35)"}}>En cours</span>}
            </div>
          ))}
        </div>
        <div className="cai-card">
          <div className="cai-card-h">🏅 Missions & gamification</div>
          {missions.map(m=>(
            <div key={m.id} className="goal-item" onClick={()=>{toggleMissionDone(m.id);onRefresh&&onRefresh();}} style={{cursor:"pointer"}}>
              <div className={`goal-check ${m.done?"done":""}`}>{m.done?"✓":""}</div>
              <div className={`goal-label ${m.done?"done":""}`}>{m.icon} {m.label} <span style={{color:T.text4,fontSize:9}}>({m.type})</span></div>
              <div className="goal-xp">+{m.xp} XP</div>
            </div>
          ))}
        </div>
      </div>

      {!progress.completed&&(
        <div className="cai-card" style={{marginBottom:14}}>
          <div className="cai-card-h">🎯 Recommandations pour "{progress.currentStep.label}"</div>
          {recommendations.map((r,i)=>(
            <div key={i} style={{fontSize:10.5,color:"#C9D4E8",marginBottom:8,lineHeight:1.6,paddingLeft:14,borderLeft:"2px solid rgba(255,194,71,.35)"}}>{r.icon} {r.text}</div>
          ))}
          <div className="cai-btn cai-btn-gold" onClick={onGoTrainer} style={{marginTop:6}}>🚀 Travailler cette étape</div>
        </div>
      )}

      {!progress.completed&&(
        <div className="cai-card">
          <div className="cai-card-h">📅 Planning de la semaine</div>
          {weekly.map((w,i)=>(
            <div key={i} className="cai-plan-row" style={{marginBottom:i===weekly.length-1?0:8}}>
              <div className="cai-plan-day">{w.day.slice(0,3)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:3}}>{w.theme}</div>
                <div style={{fontSize:9.5,color:T.text3}}>{w.spots>0?`${w.spots} spots · `:""}{w.focus}</div>
              </div>
              {w.spots>0&&<div className="cai-btn cai-btn-ghost" onClick={onGoTrainer} style={{flexShrink:0}}>Lancer →</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 7. Coach Live ── */
function CoachLive({profile}){
  const[messages,setMessages]=useState(()=>[
    {from:"coach",text:`Bonjour ! ${profile.hasData?`Ton score GTO est actuellement de ${profile.gtoScore}/100.`:"Je n'ai pas encore de données sur tes sessions."} ${profile.nextStep}`},
  ]);
  const[input,setInput]=useState("");
  const[thinking,setThinking]=useState(false);
  const[llmOff,setLlmOff]=useState(false);
  const scrollRef=useRef(null);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[messages,thinking]);
  function ctx(){
    return {profile:{gtoScore:profile.gtoScore,level:profile.levelLabel,rank:profile.rank,
      priorityLeak:profile.priorityLeak&&(profile.priorityLeak.label||profile.priorityLeak.cat),
      objectif:profile.activeGoal&&profile.activeGoal.label,prochaineEtape:profile.nextStep,hasData:profile.hasData}};
  }
  async function send(text){
    const t=(text||input).trim();
    if(!t||thinking)return;
    const hist=[...messages,{from:"user",text:t}];
    setMessages(hist);setInput("");logCoachHistory({type:"coach-live",text:t});
    setThinking(true);
    const llmHist=hist.slice(-8).map(m=>({role:m.from==="coach"?"assistant":"user",content:m.text}));
    const r=await coachChat({mode:"chat",messages:llmHist,context:ctx()});
    setThinking(false);
    if(r&&r.ok&&r.text){setMessages(m=>[...m,{from:"coach",text:r.text}]);}
    else if(r&&r.noKey){setLlmOff(true);setMessages(m=>[...m,{from:"coach",text:"⚙️ L'IA conversationnelle nécessite une clé OpenAI configurée côté serveur (voir Paramètres / config). En attendant, voici une réponse basée sur tes données : "+COACH_LIVE_REPLIES.default}]);}
    else{setMessages(m=>[...m,{from:"coach",text:"⚠ "+((r&&r.error)||"Coach AI momentanément indisponible.")+" "+COACH_LIVE_REPLIES.default}]);}
  }
  return(
    <div className="cai-pane">
      <div className="cai-hero" style={{padding:"16px 20px"}}>
        <div className="cai-hero-title" style={{fontSize:15}}>💬 Coach Live {llmOff&&<span style={{fontSize:8,fontWeight:700,color:T.amber,background:"rgba(255,194,71,.1)",border:"1px solid rgba(255,194,71,.3)",borderRadius:8,padding:"1px 7px",marginLeft:6}}>IA hors-ligne</span>}</div>
        <div className="cai-hero-sub">Pose une question sur ta progression, tes leaks ou ta préparation — Coach AI te répond en contexte.</div>
      </div>
      <div ref={scrollRef} className="cai-card" style={{minHeight:200,maxHeight:420,overflowY:"auto",marginBottom:14}}>
        {messages.map((m,i)=>(
          <div key={i} className="cai-chat-msg">
            <div className="cai-chat-avatar">{m.from==="coach"?"🧠":"🎮"}</div>
            <div className="cai-chat-bubble" style={{whiteSpace:"pre-wrap"}}>{m.text}</div>
          </div>
        ))}
        {thinking&&(
          <div className="cai-chat-msg">
            <div className="cai-chat-avatar">🧠</div>
            <div className="cai-chat-bubble"><span style={{display:"inline-flex",gap:4}}><div className="aidot"/><div className="aidot"/><div className="aidot"/></span></div>
          </div>
        )}
      </div>
      <div style={{marginBottom:12}}>
        {(COACH_LIVE_SUGGESTIONS.coach||[]).map((s,i)=>(
          <span key={i} className="cai-chat-suggest" onClick={()=>send(s)}>{s}</span>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Écris ta question..." style={{flex:1,background:"rgba(7,27,68,.6)",border:"1px solid #152D6E",borderRadius:9,padding:"10px 14px",color:"#fff",fontSize:11,fontFamily:T.body,outline:"none"}}/>
        <div className="cai-btn" onClick={()=>send()}>Envoyer</div>
      </div>
    </div>
  );
}

/* ── 8. Historique ── */
function CoachHistory({stats}){
  const hist=useMemo(()=>loadCoachHistory(),[]);
  const sessions=(stats?.allPct||[]).slice(-10).reverse();
  return(
    <div className="cai-pane">
      <div className="cai-hero" style={{padding:"16px 20px"}}>
        <div className="cai-hero-title" style={{fontSize:15}}>🕓 Historique de progression</div>
        <div className="cai-hero-sub">Suivi de tes interactions Coach AI et de l'évolution de ta précision.</div>
      </div>
      <div className="cai-grid2">
        <div className="cai-card">
          <div className="cai-card-h">📈 Dernières sessions</div>
          {sessions.length===0&&<div style={{fontSize:10.5,color:T.text3}}>Aucune session enregistrée.</div>}
          {sessions.map((p,i)=>(
            <div key={i} className="cai-hist-row">
              <div className="cai-hist-dot" style={{background:p>=70?T.green:p>=50?T.amber:T.red}}/>
              <div style={{flex:1,fontSize:10.5,color:"#C9D4E8"}}>Session #{stats.allPct.length-i}</div>
              <div style={{fontSize:11,fontWeight:700,color:p>=70?T.green:p>=50?T.amber:T.red,fontFamily:T.stats}}>{p}%</div>
            </div>
          ))}
        </div>
        <div className="cai-card">
          <div className="cai-card-h">💬 Activité Coach AI</div>
          {hist.length===0&&<div style={{fontSize:10.5,color:T.text3}}>Aucune interaction enregistrée pour le moment.</div>}
          {hist.slice(0,10).map((h,i)=>(
            <div key={i} className="cai-hist-row">
              <div className="cai-hist-dot" style={{background:T.purple}}/>
              <div style={{flex:1,fontSize:10.5,color:"#C9D4E8"}}>{h.text||h.type}</div>
              <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{new Date(h.date).toLocaleDateString("fr-FR")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Coach Live : bouton flottant global ── */
export function CoachFloatingButton({tab,onGoCoach}){
  const[open,setOpen]=useState(false);
  const visibleTabs=["trainer","pratique","replayer","coach","community"];
  if(!visibleTabs.includes(tab))return null;
  const suggestions=COACH_LIVE_SUGGESTIONS[tab]||COACH_LIVE_SUGGESTIONS.coach;
  return(
    <>
      {open&&(
        <div className="cai-fab-panel">
          <div className="cai-fab-head">
            <span style={{fontSize:16}}>🧠</span>
            <span style={{fontFamily:T.brand,fontSize:12,fontWeight:800,color:"#fff"}}>Coach AI</span>
            <span style={{marginLeft:"auto",cursor:"pointer",color:T.text3,fontSize:14}} onClick={()=>setOpen(false)}>✕</span>
          </div>
          <div className="cai-fab-body">
            <div className="cai-chat-msg">
              <div className="cai-chat-avatar">🧠</div>
              <div className="cai-chat-bubble">{COACH_LIVE_REPLIES.default}</div>
            </div>
            <div style={{marginTop:6}}>
              {suggestions.map((s,i)=>(
                <span key={i} className="cai-chat-suggest" onClick={()=>{logCoachHistory({type:"coach-live",text:s});onGoCoach();}}>{s}</span>
              ))}
            </div>
          </div>
          <div className="cai-fab-foot">
            <div className="cai-btn" style={{width:"100%",justifyContent:"center"}} onClick={onGoCoach}>🧠 Ouvrir Coach AI</div>
          </div>
        </div>
      )}
      <div className="cai-fab" onClick={()=>setOpen(o=>!o)}>🧠 Coach AI</div>
    </>
  );
}
