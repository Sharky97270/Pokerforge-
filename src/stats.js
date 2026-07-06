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

export function loadHands(){try{const s=localStorage.getItem("pf_hands");return s?JSON.parse(s):[];}catch{return [];}}
export function saveHands(h){try{localStorage.setItem("pf_hands",JSON.stringify(h.slice(0,100)));}catch{}}

export function safeStore(key,obj){
  try{
    const json=JSON.stringify(obj);
    const cs=_checksum(json);
    const payload=JSON.stringify({v:1,cs,d:json});
    // Vérification quota (5 MB total)
    const used=Object.keys(localStorage).reduce((a,k)=>{
      const value=localStorage.getItem(k);
      return a+(value?value.length:0);
    },0);
    if(used>4_800_000){console.warn("PF: localStorage presque plein, nettoyage ancien historique");
      const hist=localStorage.getItem("pf_history");
      if(hist){try{const h=JSON.parse(JSON.parse(hist).d||hist);localStorage.setItem("pf_history",JSON.stringify({v:1,cs:_checksum("[]"),d:"[]"}));}catch{}}}
    localStorage.setItem(key,payload);
  }catch(e){console.warn("PF safeStore:",e);}
}
export function safeLoad(key,fallback){
  try{
    const raw=localStorage.getItem(key);
    if(!raw)return fallback;
    // Tenter format sécurisé
    const outer=JSON.parse(raw);
    if(outer&&outer.v===1&&outer.cs&&outer.d){
      if(_checksum(outer.d)!==outer.cs){console.warn("PF: checksum mismatch, données ignorées");return fallback;}
      return JSON.parse(outer.d);
    }
    // Rétrocompat — ancien format sans enveloppe
    return outer;
  }catch{return fallback;}
}

// ── Remplacement des fonctions de stockage ────────────────────────────────
function loadHistorySafe(){try{return safeLoad("pf_history_s",[]);}catch{return [];}}
function saveHistorySafe(h){safeStore("pf_history_s",h.slice(0,50));saveHistory(h);}// double écriture transition
export function loadHandsSafe(){try{return safeLoad("pf_hands_s",[]);}catch{return [];}}
export function saveHandsSafe(h){safeStore("pf_hands_s",h.slice(0,100));saveHands(h);}
export function loadStatsSafe(){
  const d=safeLoad("pf_stats_s",null);
  return d?{...STATS_DEFAULT,...d}:loadStats();
}
export function saveStatsSafe(st){safeStore("pf_stats_s",st);saveStats(st);}
