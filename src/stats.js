// PokerForge — stats d'entrainement persistees (pf_stats2), extraites de App.jsx (Phase 3.3)
import { T } from "./theme.js";

export const STATS_DEFAULT={
  sessions:0,totalSpots:0,totalAnalyses:0,
  streak:0,streakRecord:0,lastDate:null,
  weekData:[0,0,0,0,0,0,0],   // derniers 7 jours (% précision)
  weekSpots:[0,0,0,0,0,0,0],  // spots par jour
  xp:0,level:1,
  catAcc:{},    // {cat: {ok,total}}
  posAcc:{},    // {pos: {ok,total}}
  fmtAcc:{},    // {fmt: {ok,total}}
  leaks:[],     // [{cat, acc, count}] triés par taux d'erreur
  domainPct:{}, // {domaine: %}
  improvements:[],  // [{date, delta, metric}]
  analysesCount:0,
  lastGrade:null,
  allPct:[],    // historique de précision par session
};
export function loadStats(){
  try{const s=localStorage.getItem("pf_stats2");return s?{...STATS_DEFAULT,...JSON.parse(s)}:STATS_DEFAULT;}
  catch{return STATS_DEFAULT;}
}
export function saveStats(st){try{localStorage.setItem("pf_stats2",JSON.stringify(st));}catch{}}

export function loadHistory(){try{const s=localStorage.getItem("pf_history");return s?JSON.parse(s):[];}catch{return [];}}

export function calcPokerIQ(stats){
  const noData=!stats||stats.sessions===0;
  // Score de base pour nouveau joueur
  if(noData){
    return{
      overall:0,
      rank:"—",rankCol:T.text4,
      breakdown:{preflop:0,postflop:0,icm:0,mental:0,exploit:0,theory:0},
      label:"Commencez à jouer pour obtenir votre Poker IQ",
    };
  }
  const ca=stats.catAcc||{};
  // Agréger les catégories
  const avg=(...keys)=>{
    const vals=keys.map(k=>ca[k]).filter(v=>v&&v.total>0).map(v=>Math.round(v.ok/v.total*100));
    return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null;
  };
  const avgPct=stats.allPct?.length>0?Math.round(stats.allPct.reduce((a,b)=>a+b,0)/stats.allPct.length):50;
  // Sub-scores (0-100 → mapped to 0-100 scale, then ELO-like 500-1000)
  const preflop=avg("RFI","Vs Open","Vs 3-bet","Vs 4-bet")??avgPct;
  const postflop=avg("Flop","Turn","River","Cbet")??Math.round(avgPct*0.95);
  const icm=avg("ICM","GTO")??Math.round(avgPct*0.9);
  const mental=Math.min(100,Math.round((stats.streak||0)*3+(stats.sessions||0)*2+avgPct*0.5));
  const exploit=avg("RFI","Vs Open")??Math.round(avgPct*0.92);
  const theory=avg("GTO","Vs 3-bet","Vs 4-bet")??Math.round(avgPct*0.88);
  // Score global pondéré (Elo-like : 500-999)
  const raw=(preflop*.25+postflop*.2+icm*.15+mental*.1+exploit*.15+theory*.15);
  const overall=Math.round(500+raw*4.5);
  // Rang
  const rankInfo=overall>=950?{r:"Shark 🦈",c:"#9B5CFF"}:overall>=900?{r:"Elite",c:"#FFC247"}:overall>=850?{r:"Crusher",c:"#10D87A"}:overall>=800?{r:"Grinder",c:"#1F8BFF"}:overall>=750?{r:"Régulier",c:"#34D8FF"}:overall>=700?{r:"Intermédiaire",c:"#9FB0CC"}:{r:"Débutant",c:"#6F81A8"};
  return{
    overall,rank:rankInfo.r,rankCol:rankInfo.c,
    breakdown:{preflop,postflop,icm,mental:Math.min(99,mental),exploit,theory},
    label:`${stats.sessions} sessions · ${stats.totalSpots||0} spots travaillés`,
  };
}

export function buildDailyProgram(stats){
  const leaks=stats?.leaks||[];
  const iq=calcPokerIQ(stats);
  const {preflop,postflop,icm}=iq.breakdown;
  // Identifier les 3 priorités du jour
  const scores=[
    {label:"Préflop (RFI/3bet)",score:preflop,cats:["RFI","Vs Open","Vs 3-bet"],spots:6},
    {label:"Postflop (C-bet/Turn)",score:postflop,cats:["Flop","Turn","River"],spots:8},
    {label:"ICM / Tournois",score:icm,cats:["ICM","GTO"],spots:6},
  ].sort((a,b)=>a.score-b.score);
  // Leak principal
  const mainLeak=leaks[0]||{cat:"Général",acc:stats?.allPct?.length>0?Math.round(stats.allPct.reduce((a,b)=>a+b,0)/stats.allPct.length):50};
  const gainEstimate=(mainLeak.acc?Math.max(0,(75-mainLeak.acc)*0.05):0).toFixed(1);
  return{program:scores,mainLeak,gainEstimate,totalSpots:scores.reduce((s,p)=>s+p.spots,0)};
}
