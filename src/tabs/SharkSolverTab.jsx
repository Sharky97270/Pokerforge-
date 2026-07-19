// PokerForge — Shark Solver : moteur CFR+, equite, exploit/ICM/PKO + UI (extrait de App.jsx, Phase 3.3)
import React, { useState, useEffect, useMemo } from "react";
import { T } from "../theme.js";
import { ResultSource, resultMeta, RESULT_SOURCE_LEGEND, RangeSource, rangeMeta, isCalculated } from "../solver/provenance.js";
// SharkSolver Core — moteur isolé (Phases 6-13) : Card/Combo/Evaluator/Equity/CFR.
import { EQ_RANKVAL, EQ_SUITIDX, exactComboList, singleHandList, sideComboList, cardLabel } from "../solver/core/combos.js";
// §17 : l'UI consomme la SOLVER API (provenance + convergence), jamais le CFR en direct.
import { computeEquity, solveSubgame } from "../solver/api.js";
import "./SharkSolverTab.css";

/* ═══════════════════════════════════════════════════════
   SHARK SOLVER — Analyse GTO & Détection de leaks
════════════════════════════════════════════════════════ */

const RANKS=["A","K","Q","J","T","9","8","7","6","5","4","3","2"];

/* Construit une fréquence GTO réaliste par main selon position + action + stack */
function buildSolverFreqs(heroPos, action, stack=100, vsPos="BB"){
  const deep=stack>=80, mid=stack>=40&&stack<80, short=stack<40;
  const posIdx={UTG:0,LJ:0,HJ:1,CO:2,BTN:3,SB:4,BB:5}[heroPos]||0;
  const posBonus=posIdx; // 0=UTG tight, 3=BTN loose, 4=SB medium
  const res={};

  // helpers
  const rfi=(r,c=0,f=0)=>({r,c,f:f||100-r-c});
  const def=(r,c=0,f=0)=>({r,c,f:f||100-r-c}); // r=raise/3bet, c=call, f=fold

  /* ── RFI (open raise first in) ── */
  if(action==="rfi"){
    // Paires
    const ppOpen=[100,100,100,100,95,90,85,75+(posBonus*5),65+(posBonus*5),55+(posBonus*8),45+(posBonus*8),35+(posBonus*8),25+(posBonus*8)];
    RANKS.forEach((r,i)=>{
      const pct=Math.min(100,ppOpen[i]);
      res[r+r]=rfi(pct,0,100-pct);
    });
    // Suited combos
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const k=RANKS[i]+RANKS[j]+"s";
      const gap=j-i, topcard=i, kicker=j;
      let r=0;
      if(topcard===0){// Ax
        r=kicker<=4?100:kicker<=6?95:kicker<=8?85+(posBonus*3):kicker<=10?70+(posBonus*4):50+(posBonus*6);
      } else if(topcard===1){// Kx
        r=kicker<=2?100:kicker<=4?95:kicker<=6?85+(posBonus*4):kicker<=8?60+(posBonus*6):30+(posBonus*8);
      } else if(topcard===2){// Qx
        r=kicker<=3?100:kicker<=5?85+(posBonus*4):kicker<=7?60+(posBonus*7):25+(posBonus*8);
      } else if(topcard===3){// Jx
        r=kicker<=4?95:kicker<=6?75+(posBonus*5):kicker<=8?45+(posBonus*8):15+(posBonus*8);
      } else if(topcard<=5){// T9x
        r=gap<=2?80+(posBonus*4):gap<=4?50+(posBonus*7):15+(posBonus*8);
      } else {
        r=gap<=1?65+(posBonus*6):gap<=3?35+(posBonus*8):10+(posBonus*6);
      }
      r=Math.min(100,Math.max(0,Math.round(r)));
      res[k]=rfi(r,0,100-r);
    }
    // Offsuit combos
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const k=RANKS[i]+RANKS[j]+"o";
      const gap=j-i, topcard=i, kicker=j;
      let r=0;
      if(topcard===0){// Ax
        r=kicker<=1?100:kicker<=3?90:kicker<=5?75+(posBonus*4):kicker<=7?45+(posBonus*6):15+(posBonus*6);
      } else if(topcard===1){// Kx
        r=kicker<=2?95:kicker<=4?70+(posBonus*5):kicker<=6?35+(posBonus*6):5+(posBonus*5);
      } else if(topcard===2){// Qx
        r=kicker<=3?85+(posBonus*3):kicker<=5?45+(posBonus*7):kicker<=7?15+(posBonus*7):0;
      } else if(topcard===3){// Jx
        r=kicker<=4?70+(posBonus*5):kicker<=6?25+(posBonus*8):kicker<=8?5+(posBonus*6):0;
      } else if(topcard<=5){
        r=gap===1?55+(posBonus*7):gap===2?20+(posBonus*8):0;
      } else {
        r=0;
      }
      r=Math.min(100,Math.max(0,Math.round(r)));
      // RFI offsuit: pure raise ou pure fold sauf mix sur proches
      const mix=r>10&&r<90;
      res[k]=mix?rfi(r,0,100-r):r>=50?rfi(100,0,0):rfi(0,0,100);
    }
  }

  /* ── FACING OPEN (3bet / call / fold) ── */
  else if(action==="vs_open"){
    const defBonus=["BTN","CO","BB","SB"].includes(heroPos)?2:0;
    RANKS.forEach((r,i)=>{
      let tb=0,c=0;
      if(i<=1){tb=100;}
      else if(i===2){tb=deep?80:100; c=100-tb;}
      else if(i===3){tb=50+(defBonus*5); c=35; }
      else if(i<=5){tb=15+(defBonus*5); c=65+(defBonus*5);}
      else if(i<=8){tb=5; c=deep?65:50;}
      else {c=deep?45:30;}
      const f=Math.max(0,100-tb-c);
      res[r+r]=def(tb,c,f);
    });
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const ks=RANKS[i]+RANKS[j]+"s", ko=RANKS[i]+RANKS[j]+"o";
      const ti=i, ki=j;
      let tbs=0,cs=0,tbo=0,co=0;
      if(ti===0){// Ax suited
        tbs=ki<=1?100:ki<=3?70+(defBonus*5):ki<=5?30+(defBonus*8):ki<=8?15+(defBonus*5):5;
        cs=ki<=1?0:ki<=3?30:ki<=5?55:ki<=8?60:50;
      } else if(ti===1){// Kx
        tbs=ki<=2?60+(defBonus*5):ki<=4?20+(defBonus*5):ki<=6?10:0;
        cs=ki<=2?30:ki<=4?60:ki<=6?65:45;
      } else if(ti<=3){// QJ
        tbs=ki<=3?(ti===2?20:10)+(defBonus*5):ki<=5?5+(defBonus*3):0;
        cs=ki<=3?60:ki<=5?55:ki<=8?40:25;
      } else {
        tbs=ki-ti<=2?5+(defBonus*3):0;
        cs=ki-ti<=1?45:ki-ti<=2?35:ki-ti<=3?25:10;
      }
      if(ti===0){// Ax offsuit
        tbo=ki<=1?100:ki<=2?60+(defBonus*5):ki<=3?20+(defBonus*5):0;
        co=ki<=1?0:ki<=2?30:ki<=3?55:ki<=5?40:20;
      } else if(ti===1){
        tbo=ki<=2?50+(defBonus*5):0; co=ki<=2?40:ki<=4?45:30;
      } else if(ti<=3){
        tbo=ki<=4&&ti===2?10+(defBonus*5):0; co=ki<=4?35:20;
      } else {
        co=ki-ti===1?25:10;
      }
      [tbs,cs,tbo,co].forEach(v=>Math.min(100,Math.max(0,v)));
      res[ks]=def(tbs,cs,Math.max(0,100-tbs-cs));
      res[ko]=def(tbo,co,Math.max(0,100-tbo-co));
    }
  }

  /* ── VS 3BET (4bet / call / fold) ── */
  else if(action==="vs_3bet"){
    RANKS.forEach((r,i)=>{
      let fb=0,c=0;
      if(i<=1){fb=100;}
      else if(i===2){fb=deep?70:100; c=100-fb;}
      else if(i===3){fb=35; c=55;}
      else if(i<=5){fb=10; c=deep?75:60;}
      else if(i<=8){fb=0; c=short?0:45;}
      else {fb=0; c=0;}
      res[r+r]=def(fb,c,Math.max(0,100-fb-c));
    });
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const ks=RANKS[i]+RANKS[j]+"s",ko=RANKS[i]+RANKS[j]+"o";
      let fbs=0,cs=0,fbo=0,co=0;
      if(i===0){
        fbs=j<=1?100:j===2?60:j<=4?15+(posBonus*3):5;
        cs=j<=1?0:j===2?30:j<=4?75:j<=6?65:50;
        fbo=j<=1?90:j===2?45:0;
        co=j<=1?10:j===2?45:j===3?55:j<=5?35:0;
      } else if(i===1){
        fbs=j<=2?55:j<=4?10:0; cs=j<=2?35:j<=4?70:55;
        fbo=j<=2?40:0; co=j<=2?45:j<=4?55:30;
      } else if(i<=3){
        fbs=j<=4&&i===2?10:0; cs=j<=4?55:j<=6?40:20;
        co=j<=4&&i===2?30:j<=5?20:5;
      } else {
        cs=j-i<=1?35:j-i<=2?20:5;
      }
      res[ks]=def(fbs,cs,Math.max(0,100-fbs-cs));
      res[ko]=def(fbo,co,Math.max(0,100-fbo-co));
    }
  }

  /* ── CBET IP (bet / check) ── */
  else if(action==="cbet_ip"){
    RANKS.forEach((r,i)=>{
      const b=i<=4?90:i<=7?70:i<=9?50:35;
      res[r+r]=def(b,0,100-b);
    });
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const ks=RANKS[i]+RANKS[j]+"s",ko=RANKS[i]+RANKS[j]+"o";
      const top=i<=1&&j<=3,bway=i<=4&&j<=4;
      const bs=top?95:bway?80:i<=4&&j-i<=3?70:i<=7&&j-i<=2?55:35;
      const bo=top?85:bway?65:i<=4&&j-i<=2?55:25;
      res[ks]=def(bs,0,100-bs);
      res[ko]=def(bo,0,100-bo);
    }
  }

  /* ── FACING BET OOP (call / raise / fold) ── */
  else if(action==="vs_bet"){
    RANKS.forEach((r,i)=>{
      const raise=i<=2?15:i<=4?5:0;
      const call=i<=3?80:i<=6?65:i<=9?45:25;
      res[r+r]=def(raise,call,Math.max(0,100-raise-call));
    });
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const ks=RANKS[i]+RANKS[j]+"s",ko=RANKS[i]+RANKS[j]+"o";
      const top=i<=1&&j<=2,bway=i<=4&&j<=4;
      const rs=top?20:bway?8:i<=4&&j-i<=2?5:0;
      const cs=top?75:bway?65:i<=4&&j-i<=3?55:i<=7&&j-i<=2?40:20;
      const ro=top?12:bway?4:0;
      const co=top?70:bway?55:i<=3&&j-i<=2?45:20;
      res[ks]=def(rs,cs,Math.max(0,100-rs-cs));
      res[ko]=def(ro,co,Math.max(0,100-ro-co));
    }
  }

  return res;
}

/* Couleurs des actions */
const ACT_COLORS={
  r:{col:"#10D87A",dim:"rgba(16,216,122,.15)",label:"Raise/3bet"},
  c:{col:"#1F8BFF",dim:"rgba(31,139,255,.15)",label:"Call"},
  f:{col:"rgba(60,60,90,.6)",dim:"rgba(30,30,60,.3)",label:"Fold"},
};

/* Nom lisible pour action */
const ACTION_LABELS={
  rfi:"Open (RFI)",vs_open:"Face Open (3bet/call/fold)",
  vs_3bet:"Face 3-bet (4bet/call/fold)",cbet_ip:"C-bet IP",vs_bet:"Face Bet OOP",
};

/* Score de force heuristique d'une main (0-100, relatif) */
function handStrengthScore(handKey){
  const isPair=handKey.length===2;
  const isSuited=handKey.endsWith("s");
  const i1=RANKS.indexOf(handKey[0]),i2=RANKS.indexOf(handKey[1]);
  if(isPair)return Math.max(10,100-i1*7);
  const lo=Math.min(i1,i2),hi=Math.max(i1,i2),gap=hi-lo;
  let score=92-(lo+hi)*2.2-gap*2.5;
  if(isSuited)score+=8;
  return Math.max(3,Math.min(98,Math.round(score)));
}

/* Catégorie de force (pour pondérer 3bet/4bet/jam) */
function handTier(handKey){
  if(["AA","KK","QQ","AKs","AKo"].includes(handKey))return"premium";
  if(["JJ","TT","99","AQs","AQo","AJs","KQs","KQo"].includes(handKey))return"strong";
  return"mid";
}

/* Détermine ce que représente le bucket "agressif" (r) selon le scénario/mode */
function primaryActionColor(scenario,mode){
  const stack=scenario.stack||100;
  const{action}=scenario;
  if((action==="rfi"||action==="vs_open")&&stack<=20){
    return{key:"jam",label:"Jam / All-in",color:T.red};
  }
  if(action==="rfi")return{key:"open",label:"Open",color:T.green};
  if(action==="vs_open")return{key:"threebet",label:"3-bet",color:T.purple};
  if(action==="vs_3bet")return{key:"fourbet",label:"4-bet",color:"#FF8A3D"};
  if(action==="cbet_ip")return{key:"bet",label:"Bet (C-bet)",color:T.green};
  if(action==="vs_bet")return{key:"raise",label:"Raise / Check-raise",color:T.purple};
  return{key:"open",label:"Open",color:T.green};
}

/* Correspondance action Hero → action Villain pour la range de réponse */
const VILLAIN_ACTION_MAP={rfi:"vs_open",vs_open:"rfi",vs_3bet:"vs_open",cbet_ip:"vs_bet",vs_bet:"cbet_ip"};

/* Range de réponse du Villain — réutilise buildSolverFreqs avec rôles inversés */
function buildVillainResponseFreqs(scenario,stack){
  const vAction=VILLAIN_ACTION_MAP[scenario.action]||"vs_open";
  return buildSolverFreqs(scenario.vsPos,vAction,stack||scenario.stack||100,scenario.heroPos);
}

/* Traduit un spot Entraîneur (acts/street hétérogènes) vers un scénario Shark Solver
   (5 actions normalisées). Heuristique best-effort : utilisée pour le cross-link
   Entraîneur → Solver afin de pré-remplir un spot proche plutôt que pertinent à 100%. */
export function buildScenarioFromTrainerParams(params){
  const heroPos=params.heroPos||"BTN";
  const vsPos=params.vsPos||"BB";
  const stack=params.stack||100;
  const isPostflop=params.street&&params.street!=="Preflop";
  const labels=(params.acts||[]).map(a=>(a.l||"").toLowerCase());
  const ids=(params.acts||[]).map(a=>a.id);
  let action;
  if(isPostflop){
    action=ids.includes("CHECK")?"cbet_ip":"vs_bet";
  }else if(labels.some(l=>l.includes("4-bet"))){
    action="vs_3bet";
  }else if(labels.some(l=>l.includes("3-bet"))){
    action="vs_open";
  }else if(labels.some(l=>l.includes("open"))){
    action="rfi";
  }else{
    action="vs_open";
  }
  const street=(action==="cbet_ip"||action==="vs_bet")?(isPostflop?params.street:"Flop"):"Preflop";
  return{
    id:`live-${heroPos}-${action}-${vsPos}-${stack}`,
    label:`${heroPos} ${ACTION_LABELS[action]||action} vs ${vsPos}`,
    heroPos,vsPos,action,stack,street,
  };
}

/* Subdivise le bucket agrégé "r" en 3bet/4bet/jam selon force de main + profondeur */
function splitRaiseBucket(handKey,freq,stack,scenarioAction){
  const f=freq||{r:0,c:0,f:100};
  const r=f.r||0,c=f.c||0,fo=f.f||0;
  if(r<=0)return{fold:fo,call:c,threebet:0,fourbet:0,jam:0};
  const tier=handTier(handKey);
  const short=(stack||100)<=20;
  let jamShare,fourbetShare,threebetShare;
  if(scenarioAction==="vs_3bet"){
    jamShare=short?0.75:tier==="premium"?0.35:0.2;
    fourbetShare=1-jamShare; threebetShare=0;
  }else if(short){
    jamShare=tier==="premium"?0.85:tier==="strong"?0.6:0.45;
    threebetShare=1-jamShare; fourbetShare=0;
  }else{
    jamShare=tier==="premium"?0.12:0.03;
    fourbetShare=tier==="premium"?0.18:tier==="strong"?0.08:0.02;
    threebetShare=Math.max(0,1-jamShare-fourbetShare);
  }
  return{
    fold:fo,call:c,
    threebet:Math.round(r*threebetShare),
    fourbet:Math.round(r*fourbetShare),
    jam:Math.round(r*jamShare),
  };
}

/* EV heuristique en bb — déterministe, toujours étiquetée "estimée" dans l'UI */
function estimateEV(handKey,freq,role,stack=100,mode="gto",extra={}){
  const f=freq||{r:0,c:0,f:100};
  const s=handStrengthScore(handKey);
  const base=(s-50)/50;
  let ev;
  if(f.r>0&&f.r>=Math.max(f.c,f.f)){
    ev=base*(stack*0.05)+(f.r/100)*0.8;
  }else if(f.c>0&&f.c>=Math.max(f.r,f.f)){
    ev=base*(stack*0.025)+0.1;
  }else{
    ev=base*0.05;
  }
  if(role==="villain")ev=-ev*0.6;
  if(mode==="icm"&&extra.riskPremium)ev-=extra.riskPremium*stack*0.04;
  if(mode==="pko"&&extra.bountyEV)ev+=extra.bountyEV;
  if(mode==="exploit"&&extra.evDelta)ev+=extra.evDelta;
  return Math.round(ev*100)/100;
}

/* Scénarios prédéfinis */
const SOLVER_SCENARIOS=[
  {id:"btn_rfi",label:"BTN Open",heroPos:"BTN",vsPos:"BB",action:"rfi",stack:100,street:"Preflop"},
  {id:"co_rfi",label:"CO Open",heroPos:"CO",vsPos:"BB",action:"rfi",stack:100,street:"Preflop"},
  {id:"hj_rfi",label:"HJ Open",heroPos:"HJ",vsPos:"BB",action:"rfi",stack:100,street:"Preflop"},
  {id:"utg_rfi",label:"UTG Open",heroPos:"UTG",vsPos:"BB",action:"rfi",stack:100,street:"Preflop"},
  {id:"sb_rfi",label:"SB Open",heroPos:"SB",vsPos:"BB",action:"rfi",stack:100,street:"Preflop"},
  {id:"bb_vs_btn",label:"BB vs BTN",heroPos:"BB",vsPos:"BTN",action:"vs_open",stack:100,street:"Preflop"},
  {id:"bb_vs_co",label:"BB vs CO",heroPos:"BB",vsPos:"CO",action:"vs_open",stack:100,street:"Preflop"},
  {id:"bb_vs_utg",label:"BB vs UTG",heroPos:"BB",vsPos:"UTG",action:"vs_open",stack:100,street:"Preflop"},
  {id:"btn_vs_3bet",label:"BTN vs 3-bet",heroPos:"BTN",vsPos:"BB",action:"vs_3bet",stack:100,street:"Preflop"},
  {id:"co_vs_3bet",label:"CO vs 3-bet",heroPos:"CO",vsPos:"BB",action:"vs_3bet",stack:100,street:"Preflop"},
  {id:"ip_cbet",label:"C-bet IP Flop",heroPos:"BTN",vsPos:"BB",action:"cbet_ip",stack:95,street:"Flop"},
  {id:"oop_vs_bet",label:"OOP vs Bet",heroPos:"BB",vsPos:"BTN",action:"vs_bet",stack:95,street:"Flop"},
  {id:"icm_ft",label:"ICM Final Table",heroPos:"CO",vsPos:"BB",action:"rfi",stack:25,street:"Preflop",
    icmParams:{playersLeft:9,paid:9,heroStack:25,avgStack:27,payouts:[24,18,14,11,9,7,5.5,4,3]}},
  {id:"pko_bounty",label:"PKO Bounty Spot",heroPos:"BTN",vsPos:"SB",action:"rfi",stack:15,street:"Preflop",
    pkoParams:{heroBounty:8,villainBounty:6,avgBounty:7,effectiveStack:15,coverage:1.2}},
  {id:"shortstack_pf",label:"Shortstack 15bb Push/Fold",heroPos:"UTG",vsPos:"BB",action:"rfi",stack:15,street:"Preflop"},
];

/* Clé de main pour une cellule (i=ligne, j=colonne) */
function cellKey(i,j){
  if(i===j)return RANKS[i]+RANKS[i];
  if(i<j)return RANKS[i]+RANKS[j]+"s";
  return RANKS[j]+RANKS[i]+"o";
}

/* Couleur dominante d'une fréquence */
function domColor(freq){
  if(!freq)return"rgba(20,20,35,.8)";
  const{r=0,c=0,f=100}=freq;
  if(r>=50)return`rgba(16,216,122,${0.3+r/250})`;
  if(c>=50)return`rgba(31,139,255,${0.25+c/280})`;
  if(r+c<20)return"rgba(30,30,55,.7)";
  return`rgba(155,92,255,${0.2+(r+c)/350})`;
}

/* ── Profils d'exploitation Vilain (10) — multiplicateurs directionnels ── */
const EXPLOIT_PROFILES=[
  {id:"reg",label:"Reg",desc:"Régulier proche du GTO — peu d'exploit fiable disponible.",foldVsRaise:1.0,callVsBet:1.0,threeBet:1.0,jam:1.0},
  {id:"fish_passif",label:"Fish passif",desc:"Overfold face à l'agression, 3-bet quasi jamais.",foldVsRaise:1.35,callVsBet:1.2,threeBet:0.4,jam:0.6},
  {id:"fish_agressif",label:"Fish agressif",desc:"Sur-call et sur-relance avec des mains faibles.",foldVsRaise:0.7,callVsBet:1.4,threeBet:1.5,jam:1.4},
  {id:"nit",label:"Nit",desc:"Range ultra resserrée, fold massif sous pression.",foldVsRaise:1.5,callVsBet:0.7,threeBet:0.5,jam:0.5},
  {id:"lag",label:"LAG",desc:"Très agressif, 3-bet et relance large.",foldVsRaise:0.75,callVsBet:0.9,threeBet:1.6,jam:1.3},
  {id:"maniac",label:"Maniac",desc:"Shove/relance quasi systématique, fold quasi nul.",foldVsRaise:0.5,callVsBet:1.1,threeBet:1.8,jam:1.8},
  {id:"calling_station",label:"Calling station",desc:"Call presque tout, ne fold jamais, 3-bet rarement.",foldVsRaise:0.5,callVsBet:1.6,threeBet:0.3,jam:0.5},
  {id:"winamax_micro",label:"Population Winamax micro",desc:"Micro-limites : passif, call trop large, fold trop peu face à l'agression.",foldVsRaise:0.7,callVsBet:1.45,threeBet:0.45,jam:0.7},
  {id:"winamax_low",label:"Population Winamax low stakes",desc:"Low stakes : légèrement plus tight, 3-bet sous-développé, overfold BB.",foldVsRaise:1.15,callVsBet:1.2,threeBet:0.7,jam:0.85},
  {id:"mtt_standard",label:"Population MTT standard",desc:"3-bet polarisé, défense BB large, ICM-conscient.",foldVsRaise:0.95,callVsBet:1.1,threeBet:1.25,jam:0.9},
];

/* Ajuste les fréquences selon le profil populationnel — toujours "estimation heuristique" */
function applyExploitAdjustment(freqs,profile,scenario){
  const adjusted={},details={};
  Object.entries(freqs).forEach(([k,f])=>{
    const r0=f.r||0,c0=f.c||0,f0=f.f||0;
    let r=r0*(profile.threeBet??1),c=c0*(profile.callVsBet??1),fo=f0*(profile.foldVsRaise??1);
    if((scenario.stack||100)<=20)r*=(profile.jam??1);
    const tot=r+c+fo||1;
    r=Math.round(r/tot*100);c=Math.round(c/tot*100);fo=Math.max(0,100-r-c);
    const newFreq={r,c,f:fo};
    adjusted[k]=newFreq;
    const evDelta=Math.round(((r-r0)*0.012+(c-c0)*0.006)*100)/100;
    let reason=null;
    if(Math.abs(r-r0)>=8){
      reason=r>r0
        ?`${profile.label} sous-défend face à l'agression : élargir ici exploite ce leak.`
        :`${profile.label} sur-défend déjà ce spot : resserrer pour ne pas gaspiller de combos.`;
    }else if(Math.abs(c-c0)>=8){
      reason=c>c0
        ?`${profile.label} a tendance à sur-payer — value bet/3bet plus large rentable.`
        :`${profile.label} fold trop souvent face au call — privilégier la value pure.`;
    }
    details[k]={gtoFreq:{r:r0,c:c0,f:f0},exploitFreq:newFreq,evDelta,reason};
  });
  return{freqs:adjusted,details};
}

/* Resserre jam/raise selon une prime de risque ICM simplifiée */
function applyICMAdjustment(freqs,icmParams,scenario){
  if(!icmParams)return{freqs,foldedHands:[],riskPremium:0};
  const{heroStack=scenario.stack||25,avgStack=heroStack,payouts=[]}=icmParams;
  const stackRatio=avgStack>0?heroStack/avgStack:1;
  const payoutSteepness=payouts.length>=2?(payouts[0]-payouts[payouts.length-1])/(payouts[0]||1):0.5;
  const riskPremium=Math.round(Math.max(0,Math.min(0.8,(1-stackRatio)*0.5+payoutSteepness*0.3))*100)/100;
  const adjusted={},foldedHands=[];
  Object.entries(freqs).forEach(([k,f])=>{
    let r=f.r||0,c=f.c||0,fo=f.f||0;
    const cut=Math.round(r*riskPremium*0.6);
    if(cut>0&&r>0){
      r=Math.max(0,r-cut);
      fo+=cut;
      if(r===0&&(f.r||0)>0)foldedHands.push(k);
    }
    adjusted[k]={r,c,f:fo};
  });
  return{freqs:adjusted,foldedHands,riskPremium};
}

/* Élargit le jam selon le ratio bounty/stack effectif (fold equity bounty) */
function applyPKOAdjustment(freqs,pkoParams,scenario){
  if(!pkoParams)return{freqs,widenedHands:[],bountyFactor:0};
  const{heroBounty=0,effectiveStack=scenario.stack||15}=pkoParams;
  const bountyFactor=effectiveStack>0?Math.round(Math.min(0.6,heroBounty/effectiveStack*0.4)*100)/100:0;
  const adjusted={},widenedHands=[];
  Object.entries(freqs).forEach(([k,f])=>{
    let r=f.r||0,c=f.c||0,fo=f.f||0;
    const add=Math.round(fo*bountyFactor*0.5);
    if(add>0&&fo>0){
      r+=add;fo-=add;
      if((f.r||0)===0&&r>0)widenedHands.push(k);
    }
    adjusted[k]={r,c,f:fo};
  });
  return{freqs:adjusted,widenedHands,bountyFactor};
}

/* Décomposition ChipEV / BountyEV / TotalEV pour une main donnée en mode PKO */
function pkoEvBreakdown(handKey,freq,pkoParams,stack){
  const chipEV=estimateEV(handKey,freq,"hero",stack,"chipev");
  const bountyEV=pkoParams?Math.round(((freq?.r||0)/100)*(pkoParams.heroBounty||0)*0.15*100)/100:0;
  return{chipEV,bountyEV,totalEV:Math.round((chipEV+bountyEV)*100)/100};
}

/* Combos premium bloqués par les cartes de la main sélectionnée */
function buildHandBlockers(handKey){
  const isPair=handKey.length===2;
  const cards=isPair?[handKey[0],handKey[0]]:[handKey[0],handKey[1]];
  const PREMIUMS=["AA","KK","QQ","AKs","AKo"];
  const blocked=[];
  PREMIUMS.forEach(p=>{
    if(p===handKey)return;
    const pCards=p.length===2?[p[0],p[0]]:[p[0],p[1]];
    const overlap=pCards.filter(c=>cards.includes(c)).length;
    if(overlap>0)blocked.push({hand:p,count:overlap});
  });
  return blocked;
}

/* Tags d'explication IA disponibles par mode */
const SOLVER_TAGS_BY_MODE={
  gto:["Bloqueurs","Jouabilité","Equity"],
  exploit:["Jouabilité","Fold Equity","Bloqueurs"],
  icm:["ICM Pressure","Risk Premium","Bloqueurs"],
  pko:["Bounty Value","Fold Equity","Bloqueurs"],
  chipev:["Equity","Jouabilité","Bloqueurs"],
};

/* Explication IA pédagogique pour la main sélectionnée — jamais d'invention GTO */
function explainHand(handKey,scenario,freq,mode="gto",extra={}){
  const f=freq||{r:0,c:0,f:100};
  const dom=f.r>0&&f.r>=Math.max(f.c,f.f)?"r":f.c>0&&f.c>=Math.max(f.r,f.f)?"c":"f";
  const pac=primaryActionColor(scenario,mode);
  const blockers=buildHandBlockers(handKey);
  const isSuited=handKey.endsWith("s"),isPair=handKey.length===2;
  const sentences=[];

  if(dom==="r"){
    sentences.push(`${handKey} fait partie de la range de ${pac.label.toLowerCase()} de ${scenario.heroPos} à ${f.r}% de fréquence.`);
  }else if(dom==="c"){
    sentences.push(`${handKey} privilégie le call ici (${f.c}%) — assez solide pour continuer sans sur-engager le stack.`);
  }else{
    sentences.push(`${handKey} est un fold quasi pur (${f.f}%) — trop faible pour défendre dans ce spot face à ${scenario.vsPos}.`);
  }

  if(blockers.length>0){
    sentences.push(`Bloqueurs : ${handKey} retire des combos de ${blockers.map(b=>b.hand).join(", ")}, ce qui réduit la probabilité que ${scenario.vsPos} tienne ces mains.`);
  }

  if(isSuited){
    sentences.push("La couleur ajoute de la jouabilité postflop et de l'équité en multiway.");
  }else if(!isPair){
    sentences.push(`En offsuit, ${handKey} dépend davantage du fold equity que de sa réalisation d'équité brute.`);
  }

  if(mode==="icm"&&extra.riskPremium){
    sentences.push(`En ICM, la prime de risque (≈${Math.round(extra.riskPremium*100)}%) réduit la fréquence de jam par rapport au ChipEV pur.`);
  }
  if(mode==="pko"&&extra.bountyFactor){
    sentences.push(`La prime de bounty élargit la range de shove d'environ ${Math.round(extra.bountyFactor*100)}% via le fold equity supplémentaire.`);
  }
  if(mode==="exploit"&&extra.reason){
    sentences.push(extra.reason);
  }

  const tags=(SOLVER_TAGS_BY_MODE[mode]||SOLVER_TAGS_BY_MODE.gto).filter(tag=>{
    if(tag==="Bloqueurs")return blockers.length>0;
    if(tag==="ICM Pressure"||tag==="Risk Premium")return mode==="icm";
    if(tag==="Bounty Value")return mode==="pko";
    if(tag==="Fold Equity")return mode==="exploit"||mode==="pko";
    return true;
  });

  return{text:sentences.join(" "),tags};
}

/* 3-5 insights auto-générés pour "Notes & Insights" */
function buildSolverInsights(scenario,freqs,mode){
  const pac=primaryActionColor(scenario,mode);
  const insights=[];
  let total=0,raised=0;
  Object.entries(freqs).forEach(([k,f])=>{
    const combos=k.length===2?6:k.endsWith("s")?4:12;
    total+=combos;raised+=combos*((f.r||0)/100);
  });
  const pct=total>0?Math.round(raised/total*100):0;
  insights.push(`${scenario.heroPos} ${pac.label.toLowerCase()} environ ${pct}% des combos dans ce spot (${scenario.stack||100}bb).`);
  const premiums=["AA","KK","QQ","AKs","AKo"].filter(k=>(freqs[k]?.r||0)>=90);
  if(premiums.length>=3)insights.push(`Les mains fortes dominantes (${premiums.slice(0,4).join(", ")}) sont toujours dans l'action agressive.`);
  const mixed=Object.entries(freqs).filter(([,f])=>(f.r||0)>10&&(f.r||0)<90&&((f.c||0)>10||(f.f||0)>10)).length;
  if(mixed>0)insights.push(`${mixed} mains jouent en fréquence mixte — garder un équilibre entre value et bluffs (ex. suited connectors, Ax suited bas).`);
  const foldPct=total>0?Math.round(Object.entries(freqs).reduce((a,[k,f])=>a+(k.length===2?6:k.endsWith("s")?4:12)*((f.f||0)/100),0)/total*100):0;
  if(foldPct>0)insights.push(`${foldPct}% de la range part au fold — chaque main continuée doit avoir un plan postflop clair.`);

  if(scenario.action==="vs_open"){
    insights.push(`${scenario.vsPos} doit défendre suffisamment large pour ne pas être exploitable par un sur-open de ${scenario.heroPos}.`);
  }
  if(scenario.action==="rfi"&&(scenario.stack||100)<=20){
    insights.push(`À ${scenario.stack}bb, la décision est quasi binaire (push/fold) — toute fréquence intermédiaire reste une approximation.`);
  }
  if(mode==="exploit"){
    insights.push("En mode Exploit, certaines mains s'écartent du GTO pour cibler les tendances du profil sélectionné — toujours signalé comme estimation.");
  }
  if(mode==="icm"){
    insights.push("En ICM, les mains marginales basculent vers le fold car la prime de risque dépasse le gain ChipEV pur.");
  }
  if(mode==="pko"){
    insights.push("En PKO, le bounty élargit la range de shove au-delà du ChipEV pur grâce au fold equity supplémentaire.");
  }
  if(scenario.action==="cbet_ip"||scenario.action==="vs_bet"){
    insights.push(`Sur ce board, ${scenario.heroPos} a l'avantage de range — privilégier un sizing qui exploite ce déséquilibre.`);
  }
  return insights.slice(0,5);
}

/* Ordre des positions pour cohérence d'ouverture (qui parle en premier préflop) */
const POS_ORDER={UTG:0,LJ:1,HJ:1,CO:2,BTN:3,SB:4,BB:5};

/* Moteur de validation "spot impossible" — appliqué au formulaire custom + barre + ICM/PKO
   params: {heroPos,vsPos,action,stack,stackHero,stackVillain,pot,blinds,antes,icmParams,pkoParams} */
function validateSpot(params){
  const{heroPos,vsPos,action,stack,stackHero,stackVillain,pot,icmParams,pkoParams}=params;
  const IMPOSSIBLE="Spot impossible : cette séquence d'action ne peut pas exister avec les stacks, blinds ou sizings sélectionnés.";
  const INSUFFICIENT="Données insuffisantes pour fournir une solution fiable.";
  // ── positions ──
  if(heroPos&&vsPos&&heroPos===vsPos){
    return{ok:false,reason:IMPOSSIBLE,detail:`${heroPos} ne peut pas être à la fois Hero et Villain. Choisis deux positions distinctes.`,fix:{vsPos:heroPos==="BB"?"BTN":"BB"}};
  }
  // ── cohérence positionnelle préflop selon l'action ──
  if(heroPos&&vsPos&&POS_ORDER[heroPos]!=null&&POS_ORDER[vsPos]!=null){
    const hi=POS_ORDER[heroPos],vi=POS_ORDER[vsPos];
    if(action==="rfi"&&hi>vi){
      return{ok:false,reason:IMPOSSIBLE,detail:`En open (RFI), Hero (${heroPos}) parle avant Vilain (${vsPos}) : ${heroPos} agit après ${vsPos}, ce n'est donc pas un simple open. Actions possibles : face à open (3-bet/call/fold).`,fix:{action:"vs_open"}};
    }
    if(action==="vs_open"&&hi<vi){
      return{ok:false,reason:IMPOSSIBLE,detail:`Pour faire face à un open, Vilain (${vsPos}) doit parler avant Hero (${heroPos}). Ici ${heroPos} parle en premier : c'est un open de Hero.`,fix:{action:"rfi"}};
    }
  }
  // ── stacks ──
  const stk=stack!=null?stack:(stackHero!=null&&stackVillain!=null?Math.min(stackHero,stackVillain):null);
  if(stackHero!=null&&(stackHero<=0||stackHero>1000)){
    return{ok:false,reason:IMPOSSIBLE,detail:`Stack Hero de ${stackHero}bb hors limites (1-1000bb).`,fix:{stackHero:Math.min(1000,Math.max(1,stackHero||100))}};
  }
  if(stackVillain!=null&&(stackVillain<=0||stackVillain>1000)){
    return{ok:false,reason:IMPOSSIBLE,detail:`Stack Vilain de ${stackVillain}bb hors limites (1-1000bb).`,fix:{stackVillain:Math.min(1000,Math.max(1,stackVillain||100))}};
  }
  if(stk!=null&&(stk<=0||stk>1000)){
    return{ok:false,reason:IMPOSSIBLE,detail:`Stack effectif de ${stk}bb hors limites (1-1000bb).`,fix:{stack:Math.min(1000,Math.max(1,stk||100))}};
  }
  // ── pot cohérent ──
  if(pot!=null&&pot<=0){
    return{ok:false,reason:IMPOSSIBLE,detail:"Le pot doit être strictement positif (blinds + antes au minimum).",fix:null};
  }
  // ── profondeur insuffisante pour la séquence ──
  if(action==="vs_3bet"&&stk!=null&&stk<10){
    return{ok:false,reason:IMPOSSIBLE,detail:`À ${stk}bb effectif, la séquence open → 3-bet → 4-bet n'a pas assez de profondeur restante (raise impossible, stack insuffisant). Joue plutôt open ou push/fold.`,fix:{action:"rfi"}};
  }
  if((action==="cbet_ip"||action==="vs_bet")&&stk!=null&&stk<2){
    return{ok:false,reason:IMPOSSIBLE,detail:`À ${stk}bb effectif il ne reste plus de mise possible postflop : le tapis est déjà engagé (all-in de fait).`,fix:{stack:5}};
  }
  if(icmParams){
    const{playersLeft,payouts,heroStack,avgStack}=icmParams;
    if(payouts&&playersLeft&&payouts.length>playersLeft){
      return{ok:false,reason:IMPOSSIBLE,detail:"Le nombre de payouts dépasse le nombre de joueurs restants.",fix:{payouts:payouts.slice(0,playersLeft)}};
    }
    if(!heroStack||!avgStack||heroStack<=0||avgStack<=0){
      return{ok:false,reason:INSUFFICIENT,detail:"Stack Hero ou stack moyen manquant pour le calcul ICM.",fix:null};
    }
  }
  if(pkoParams){
    const{heroBounty,effectiveStack}=pkoParams;
    if(!effectiveStack||effectiveStack<=0){
      return{ok:false,reason:INSUFFICIENT,detail:"Stack effectif manquant pour le calcul PKO.",fix:null};
    }
    if(heroBounty<0){
      return{ok:false,reason:IMPOSSIBLE,detail:"Le bounty ne peut pas être négatif.",fix:{heroBounty:0}};
    }
  }
  return{ok:true};
}

/* Sizings types par catégorie d'action — onglet "Sizings" */
const SOLVER_SIZINGS={
  rfi:{label:"Open (RFI)",sizes:["2.2bb (6-max)","2.5bb (Full ring)","3bb (vs limpeurs)"]},
  vs_open:{label:"3-bet",sizes:["7-8bb IP (≈3x)","9-11bb OOP (≈3.5-4x)","Squeeze : +1bb par limpeur"]},
  vs_3bet:{label:"4-bet",sizes:["2.2-2.5x le 3bet (deep)","All-in (≤25bb effectif)"]},
  cbet_ip:{label:"C-bet",sizes:["33% pot (board sec)","50-75% pot (board dynamique)","Overbet 125%+ (avantage de range fort)"]},
  vs_bet:{label:"Raise / Check-raise",sizes:["2.5-3x la mise adverse","All-in si ≤30bb effectif"]},
};

/* ═══════════════════════════════════════════════════════
   PARSING DE MAIN + MATH DU SPOT + ÉQUITÉ (heuristiques)
════════════════════════════════════════════════════════ */
const SUIT_CHARS={s:"♠",h:"♥",d:"♦",c:"♣","♠":"♠","♥":"♥","♦":"♦","♣":"♣"};
function normRank(ch){
  const u=(ch||"").toUpperCase();
  return RANKS.includes(u)?u:null;
}
/* Parse "A5s", "KQo", "99", "AsAd", "A♠5♠", "AK" → clé matrice normalisée */
function parseHandToken(raw){
  if(!raw||!raw.trim())return{valid:false,key:null,error:"Saisis une main (ex. AKs, 99, A♠5♠)."};
  const t=raw.trim().replace(/10/g,"T");
  const explicitSuited=/s$/i.test(t)&&!/♠|♥|♦|♣/.test(t);
  const explicitOff=/o$/i.test(t);
  const ranks=[],suits=[];
  for(let k=0;k<t.length;k++){
    const c=t[k];
    const r=normRank(c);
    if(r){ranks.push(r);continue;}
    const su=SUIT_CHARS[c]||SUIT_CHARS[c.toLowerCase()];
    if(su)suits.push(su);
  }
  if(ranks.length<2)return{valid:false,key:null,error:`"${raw}" : il faut deux rangs (ex. A et 5).`};
  const r1=ranks[0],r2=ranks[1];
  const i1=RANKS.indexOf(r1),i2=RANKS.indexOf(r2);
  const hi=i1<=i2?r1:r2,lo=i1<=i2?r2:r1;
  if(hi===lo){
    if(suits.length>=2&&suits[0]===suits[1])return{valid:false,key:null,error:"Une paire ne peut pas être assortie (2 couleurs identiques impossibles)."};
    return{valid:true,key:hi+lo,isPair:true,isSuited:false,combos:6,suits:suits.slice(0,2)};
  }
  let suff;
  if(suits.length>=2)suff=suits[0]===suits[1]?"s":"o";
  else if(explicitSuited)suff="s";
  else if(explicitOff)suff="o";
  else suff="s";
  return{valid:true,key:hi+lo+suff,isPair:false,isSuited:suff==="s",combos:suff==="s"?4:12,suits:suits.length>=2?suits.slice(0,2):null};
}
/* Affiche le combo exact (avec couleurs) ou le générique */
function comboLabel(parse){
  if(!parse||!parse.valid)return"";
  if(parse.suits&&parse.suits.length>=2)return parse.key[0]+parse.suits[0]+parse.key[1]+parse.suits[1];
  return parse.key;
}

/* Équité heuristique main vs range (0-100) — estimée, sans board exact */
function handEquityVsRange(heroKey,villainFreqs){
  const hs=handStrengthScore(heroKey);
  let wSum=0,w=0;
  Object.entries(villainFreqs||{}).forEach(([k,f])=>{
    const cont=((f.r||0)+(f.c||0))/100;
    if(cont<=0)return;
    const combos=k.length===2?6:k.endsWith("s")?4:12;
    const ww=combos*cont;
    wSum+=handStrengthScore(k)*ww;w+=ww;
  });
  const vAvg=w?wSum/w:50;
  return Math.max(4,Math.min(96,Math.round(50+(hs-vAvg)*0.55)));
}
function handVsHandEquity(aKey,bKey){
  const diff=handStrengthScore(aKey)-handStrengthScore(bKey);
  return Math.max(4,Math.min(96,Math.round(50+diff*0.6)));
}
function rangeVsRangeEquity(heroFreqs,villainFreqs){
  const h=rangeMetrics(heroFreqs),v=rangeMetrics(villainFreqs);
  return Math.max(5,Math.min(95,Math.round(50+(h.avgStrength-v.avgStrength)/3)));
}
/* Fold equity = part de fold de la range adverse (pondérée combos) */

/* ── Node Lock : agrégats combo-weighted d'une range (fold/call/raise en %) ── */
function villainAggOf(freqs){
  let t=0,f=0,c=0,r=0;
  Object.entries(freqs).forEach(([k,fr])=>{
    const n=k.length===2?6:k.endsWith("s")?4:12;
    t+=n;f+=n*((fr.f||0)/100);c+=n*((fr.c||0)/100);r+=n*((fr.r||0)/100);
  });
  if(!t)return{f:0,c:0,r:0,combos:0};
  return{f:Math.round(f/t*1000)/10,c:Math.round(c/t*1000)/10,r:Math.round(r/t*1000)/10,combos:Math.round(t)};
}
/* Re-scale chaque main vers les agrégats cibles (node lock), puis renormalise à 100 */
function applyNodeLockToFreqs(freqs,target){
  let cur=freqs;
  for(let pass=0;pass<4;pass++){
    const base=villainAggOf(cur);
    const ratio={f:base.f>0?target.f/base.f:0,c:base.c>0?target.c/base.c:0,r:base.r>0?target.r/base.r:0};
    const out={};
    Object.entries(cur).forEach(([k,fr])=>{
      let f=(fr.f||0)*ratio.f,c=(fr.c||0)*ratio.c,r=(fr.r||0)*ratio.r;
      const sum=f+c+r;
      if(sum<=0){out[k]={...fr};return;}
      out[k]={f:Math.round(f/sum*1000)/10,c:Math.round(c/sum*1000)/10,r:Math.round(r/sum*1000)/10};
    });
    cur=out;
  }
  return cur;
}
/* Recommandation d'adaptation (heuristique) selon l'écart lock vs base */
function nodeLockAdvice(base,lock,pot){
  const dF=lock.f-base.f,dC=lock.c-base.c,dR=lock.r-base.r;
  const evGain=Math.round(dF/100*pot*100)/100;
  const cands=[];
  if(dF>=5)cands.push({mag:dF,col:"#00e58a",txt:`Vilain sur-folde (+${Math.round(dF)} pts) : élargis ton agression — ~+${evGain}bb d EV immédiate par tentative (heuristique).`});
  if(dF<=-5)cands.push({mag:-dF,col:"#ffbf3c",txt:`Vilain sous-folde (${Math.round(dF)} pts) : bluffe moins, value-bet plus large et plus gros.`});
  if(dR>=3)cands.push({mag:dR,col:"#ff4d6d",txt:`Vilain relance davantage (+${Math.round(dR)} pts) : resserre ta range et 4bet/jam plus de value.`});
  if(dR<=-3)cands.push({mag:-dR,col:"#00e58a",txt:`Vilain relance moins (${Math.round(dR)} pts) : tu peux jouer plus de mains marginales sans crainte du 3bet.`});
  if(dC>=5)cands.push({mag:dC,col:"#ffbf3c",txt:`Vilain sur-call (+${Math.round(dC)} pts) : privilégie la value, réduis les bluffs et grossis tes sizings.`});
  if(!cands.length)return{col:"#8ea4c7",txt:"Écart faible vs GTO estimé — l adaptation reste marginale."};
  cands.sort((a,b)=>b.mag-a.mag);
  return cands[0];
}
function rangeFoldPct(freqs){
  let w=0,fold=0;
  Object.entries(freqs||{}).forEach(([k,f])=>{
    const combos=k.length===2?6:k.endsWith("s")?4:12;
    w+=combos;fold+=combos*((f.f||0)/100);
  });
  return w?Math.round(fold/w*100):0;
}
/* Combos continuant (raise+call) dans une range */
function continuingCombos(freqs){
  let c=0;
  Object.entries(freqs||{}).forEach(([k,f])=>{
    const combos=k.length===2?6:k.endsWith("s")?4:12;
    c+=combos*(((f.r||0)+(f.c||0))/100);
  });
  return Math.round(c);
}

/* Pot / mise à payer / SPR / pot odds / MDF à partir du stack effectif */
function spotMath(action,effective,blinds,antes,potOverride){
  const ante=antes||0,bb=blinds||1;
  let pot,facingBet,heroIsAggressor;
  switch(action){
    case "rfi": pot=1.5*bb+ante; facingBet=2.3*bb; heroIsAggressor=true; break;
    case "vs_open": pot=2.5*bb+1*bb+0.5*bb+ante; facingBet=1.5*bb; heroIsAggressor=false; break;
    case "vs_3bet": pot=9*bb+2.5*bb+1*bb+0.5*bb+ante; facingBet=6.5*bb; heroIsAggressor=false; break;
    case "cbet_ip": pot=5.5*bb+ante; facingBet=pot*0.66; heroIsAggressor=true; break;
    case "vs_bet": {const base=5.5*bb+ante; facingBet=base*0.66; pot=base+facingBet; heroIsAggressor=false; break;}
    default: pot=1.5*bb+ante; facingBet=2.3*bb; heroIsAggressor=true;
  }
  if(potOverride!=null&&potOverride>0)pot=potOverride;
  const eff=effective>0?effective:1;
  const spr=pot>0?Math.round(eff/pot*10)/10:0;
  const potOdds=facingBet>0?Math.round(facingBet/(pot+facingBet)*100):0;
  const mdf=facingBet>0?Math.round(pot/(pot+facingBet)*100):0;
  return{pot:Math.round(pot*10)/10,facingBet:Math.round(facingBet*10)/10,spr,potOdds,mdf,heroIsAggressor};
}

/* ═══════════════════════════════════════════════════════
   MOTEUR D'ÉQUITÉ RÉEL — énumération de combos (Monte-Carlo all-in)
   Évaluateur 7 cartes exact (meilleure main de 5 parmi 7).
   Cartes encodées 0..51 : rang = (carte>>2)+2 (2..14), couleur = carte&3.
════════════════════════════════════════════════════════ */

/* Parse un board "Ah Kd 7c", "As Ks Qs Jh", "2c3c4c5c6c" → {valid,cards:[ints],error} */
function parseBoardToken(raw){
  if(!raw||!raw.trim())return{valid:true,cards:[],error:null};
  const t=raw.trim().replace(/10/g,"T");
  const cards=[];
  let i=0;
  while(i<t.length){
    const ch=t[i];
    if(ch===" "||ch===","){i++;continue;}
    const r=normRank(ch);
    if(r==null)return{valid:false,cards:[],error:`Carte invalide près de "${t.slice(i,i+2)}".`};
    // couleur suivante (lettre s/h/d/c ou symbole)
    let j=i+1;
    while(j<t.length&&(t[j]===" "||t[j]===",")) j++;
    const sc=t[j];
    const suit=EQ_SUITIDX[sc]!=null?EQ_SUITIDX[sc]:(EQ_SUITIDX[(sc||"").toLowerCase()]!=null?EQ_SUITIDX[sc.toLowerCase()]:null);
    if(suit==null)return{valid:false,cards:[],error:`Couleur manquante pour ${r} (utilise s/h/d/c ou ♠♥♦♣).`};
    const ri=EQ_RANKVAL.indexOf(r);
    const card=ri*4+suit;
    if(cards.includes(card))return{valid:false,cards:[],error:`Carte en double : ${r}${"shdc"[suit]}.`};
    cards.push(card);
    i=j+1;
  }
  if(cards.length>5)return{valid:false,cards:[],error:"Un board comporte au plus 5 cartes."};
  if(cards.length===1||cards.length===2)return{valid:false,cards:[],error:"Board = 3 (flop), 4 (turn) ou 5 (river) cartes."};
  return{valid:true,cards,error:null};
}

/* ── Switch Main / Range ── */
function HandRangeToggle({value,onChange,color}){
  return(
    <div style={{display:"inline-flex",borderRadius:7,border:`1px solid ${T.border}`,overflow:"hidden",flexShrink:0}}>
      {[["range","RANGE"],["hand","MAIN"]].map(([m,lab])=>(
        <button key={m} onClick={()=>onChange(m)} style={{padding:"4px 13px",fontSize:9.5,fontWeight:800,cursor:"pointer",border:"none",fontFamily:T.stats,letterSpacing:".05em",
          background:value===m?color:"transparent",color:value===m?"#06101f":T.text3}}>{lab}</button>
      ))}
    </div>
  );
}

/* ── Zone de configuration du spot : Hero / Vilain indépendants ── */
function SpotConfigPanel(props){
  const{scenario,onUpdateScenario,heroMode,setHeroMode,heroHand,setHeroHand,heroParse,
    villainMode,setVillainMode,villainHand,setVillainHand,villainParse,
    villainAction,setVillainAction,
    stackHero,setStackHero,stackVillain,setStackVillain}=props;
  const villainAutoAction=VILLAIN_ACTION_MAP[scenario.action]||"vs_open";
  const villainActionIndep=villainAction!=null;
  const fieldStyle={width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontFamily:T.stats,fontSize:11,padding:"6px 8px",outline:"none",boxSizing:"border-box"};
  const lbl={fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",marginBottom:4,fontWeight:700};
  // fonction (pas composant) → l'input garde le focus à la frappe
  function renderSide({side,pos,color,mode,setMode,hand,setHand,parse,stackV,setStackV,onPos,actionEl}){
    return(
      <div key={side} style={{flex:1,minWidth:250,background:T.bg,border:`1px solid ${side==="hero"?"rgba(52,216,255,.32)":"rgba(155,92,255,.32)"}`,borderRadius:10,padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontFamily:T.brand,fontWeight:900,fontSize:13,letterSpacing:".1em",color}}>{side==="hero"?"🎯 HERO":"🃏 VILAIN"}</span>
          <span style={{marginLeft:"auto"}}><HandRangeToggle value={mode} onChange={setMode} color={color}/></span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><div style={lbl}>POSITION</div>
            <select value={pos} onChange={e=>onPos(e.target.value)} style={fieldStyle}>
              {SOLVER_POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
            </select></div>
          <div><div style={lbl}>STACK (bb)</div>
            <input type="number" min={1} value={stackV} onChange={e=>setStackV(Math.max(0,Number(e.target.value)))} style={fieldStyle}/></div>
        </div>
        <div style={{marginBottom:10}}><div style={lbl}>ACTION</div>{actionEl}</div>
        {mode==="hand"?(
          <div>
            <div style={lbl}>MAIN EXACTE</div>
            <input type="text" value={hand} onChange={e=>setHand(e.target.value)} placeholder="ex. A♠5♠, AKs, KQo, 99"
              style={{...fieldStyle,borderColor:hand&&parse&&!parse.valid?T.red:T.border}}/>
            {hand&&parse&&(parse.valid
              ?<div style={{marginTop:5,fontSize:9.5,color:T.green,fontFamily:T.stats,fontWeight:700}}>✓ {comboLabel(parse)} · {parse.combos} combos</div>
              :<div style={{marginTop:5,fontSize:9.5,color:T.red,fontFamily:T.stats}}>⚠ {parse.error}</div>)}
          </div>
        ):(
          <div style={{fontSize:9.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>Range complète {pos} affichée dans la matrice {side==="hero"?"Hero":"Vilain"}.</div>
        )}
      </div>
    );
  }
  return(
    <div className="cai-card" style={{marginBottom:12,padding:"12px 14px"}}>
      <div className="cai-card-h" style={{marginBottom:10}}>⚙️ CONFIGURATION DU SPOT — HERO vs VILAIN</div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {renderSide({side:"hero",pos:scenario.heroPos,color:T.cyan,mode:heroMode,setMode:setHeroMode,hand:heroHand,setHand:setHeroHand,parse:heroParse,stackV:stackHero,setStackV:setStackHero,onPos:v=>onUpdateScenario({heroPos:v}),
          actionEl:<select value={scenario.action} onChange={e=>onUpdateScenario({action:e.target.value})} style={fieldStyle}>{Object.entries(ACTION_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>})}
        {renderSide({side:"villain",pos:scenario.vsPos,color:T.purple,mode:villainMode,setMode:setVillainMode,hand:villainHand,setHand:setVillainHand,parse:villainParse,stackV:stackVillain,setStackV:setStackVillain,onPos:v=>onUpdateScenario({vsPos:v}),
          actionEl:<select value={villainActionIndep?villainAction:"__auto"} onChange={e=>setVillainAction(e.target.value==="__auto"?null:e.target.value)} style={fieldStyle}>
            <option value="__auto">Auto — réponse déduite ({ACTION_LABELS[villainAutoAction]||villainAutoAction})</option>
            {Object.entries(ACTION_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>})}
      </div>
      <div style={{marginTop:8,fontSize:8.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>
        Mode d'analyse : <b style={{color:heroMode==="hand"?T.cyan:T.text3}}>{heroMode==="hand"?"Main Hero":"Range Hero"}</b> vs <b style={{color:villainMode==="hand"?T.purple:T.text3}}>{villainMode==="hand"?"Main Vilain":"Range Vilain"}</b> · action Vilain : <b style={{color:villainActionIndep?T.purple:T.text3}}>{villainActionIndep?(ACTION_LABELS[villainAction]||villainAction)+" (indépendante)":"déduite de l'action Hero"}</b>. Équité calculée par énumération de combos (all-in).
      </div>
    </div>
  );
}

/* ── Barre stacks : effectif / blinds / antes / pot / SPR / board ── */
function SpotStacksBar(props){
  const{stackHero,stackVillain,blinds,setBlinds,antes,setAntes,potOverride,setPotOverride,math,boardInput,setBoardInput,boardParse}=props;
  const eff=Math.min(stackHero||0,stackVillain||0);
  const numStyle={width:62,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontFamily:T.stats,fontSize:11,padding:"5px 7px",outline:"none"};
  const boardCards=boardParse&&boardParse.valid?boardParse.cards:[];
  const boardErr=boardParse&&!boardParse.valid?boardParse.error:null;
  const cell=(label,value,color,big)=>(
    <div style={{textAlign:"center",padding:"2px 12px",borderRight:`1px solid ${T.border}`}}>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",marginBottom:3}}>{label}</div>
      <div style={{fontFamily:T.brand,fontWeight:900,fontSize:big?16:13,color:color||T.text}}>{value}</div>
    </div>
  );
  return(
    <div className="cai-card" style={{marginBottom:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontFamily:T.brand,fontSize:11,fontWeight:900,letterSpacing:".1em",color:T.gold}}>💰 STACKS & POT</span>
      <div style={{display:"flex",alignItems:"center",marginLeft:6}}>
        {cell("STACK HERO",`${stackHero}bb`,T.cyan)}
        {cell("STACK VILAIN",`${stackVillain}bb`,T.purple)}
        {cell("STACK EFFECTIF",`${eff}bb`,T.gold,true)}
        {cell("POT",`${math.pot}bb`,T.text)}
        {cell("SPR",math.spr,T.green,true)}
      </div>
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:T.text3,fontFamily:T.stats}}>Blinds (bb)
          <input type="number" step={0.5} min={0.5} value={blinds} onChange={e=>setBlinds(Math.max(0.5,Number(e.target.value)))} style={numStyle}/></label>
        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:T.text3,fontFamily:T.stats}}>Antes (bb)
          <input type="number" step={0.1} min={0} value={antes} onChange={e=>setAntes(Math.max(0,Number(e.target.value)))} style={numStyle}/></label>
        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:T.text3,fontFamily:T.stats}}>Pot
          <input type="number" step={0.5} min={0} value={potOverride??""} placeholder="auto" onChange={e=>setPotOverride(e.target.value===""?null:Math.max(0,Number(e.target.value)))} style={numStyle}/></label>
        {potOverride!=null&&<button onClick={()=>setPotOverride(null)} style={{padding:"4px 8px",borderRadius:6,fontSize:8.5,fontWeight:700,cursor:"pointer",border:`1px solid ${T.border}`,background:"transparent",color:T.text3,fontFamily:T.stats}}>↺ auto</button>}
      </div>
      <div style={{flexBasis:"100%",display:"flex",alignItems:"center",gap:8,marginTop:6,paddingTop:8,borderTop:`1px solid ${T.border}`,flexWrap:"wrap"}}>
        <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",fontWeight:700}}>BOARD</span>
        <input type="text" value={boardInput} onChange={e=>setBoardInput(e.target.value)} placeholder="flop/turn/river — ex. Ah Kd 7c (vide = préflop / équité all-in)"
          style={{flex:1,minWidth:220,background:T.bg,border:`1px solid ${boardErr?T.red:T.border}`,borderRadius:6,color:T.text,fontFamily:T.stats,fontSize:11,padding:"5px 8px",outline:"none"}}/>
        {boardCards.length>0&&<div style={{display:"flex",gap:4}}>{boardCards.map((c,i)=>{const red=(c&3)===1||(c&3)===2;return(
          <span key={i} style={{fontFamily:T.brand,fontWeight:900,fontSize:13,padding:"2px 6px",borderRadius:5,background:T.bg,border:`1px solid ${T.border}`,color:red?"#FF6B7A":T.text}}>{cardLabel(c)}</span>);})}</div>}
        {boardErr&&<span style={{fontSize:9,color:T.red,fontFamily:T.stats}}>⚠ {boardErr}</span>}
        {!boardErr&&boardCards.length===0&&<span style={{fontSize:9,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>équité all-in préflop</span>}
        {!boardErr&&boardCards.length>0&&<span style={{fontSize:9,color:T.green,fontFamily:T.stats}}>équité {boardCards.length===5?"river (exacte)":boardCards.length===4?"turn":"flop"} sur texture réelle</span>}
      </div>
    </div>
  );
}

/* ── Bandeau de stats clés (Equity / Fold Eq / Pot Odds / MDF / SPR / combos) ── */
function SolverStatsBar(props){
  const{equityHero,equityVillain,foldEquity,math,effective,combosAvail,combosBlocked,mode,riskPremium,bountyFactor}=props;
  const chip=(label,value,color,sub)=>(
    <div style={{flex:"1 1 110px",minWidth:96,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px"}}>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".08em",marginBottom:3}}>{label}</div>
      <div style={{fontFamily:T.brand,fontWeight:900,fontSize:15,color:color||T.text}}>{value}</div>
      {sub&&<div style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginTop:1}}>{sub}</div>}
    </div>
  );
  return(
    <div className="cai-card" style={{marginBottom:12,padding:"12px 14px"}}>
      {/* Équité/EV/SPR vivent dans RÉSULTAT DU SPOT + RÉSUMÉ (colonne droite) → ici
          uniquement les métriques de décision NON dupliquées (§39). */}
      <div className="cai-card-h" style={{marginBottom:10}}>📊 MÉTRIQUES DE DÉCISION <span style={{fontSize:8,color:T.text4,fontWeight:400,fontStyle:"italic",marginLeft:6}}>pot odds / défense / combos — calcul réel</span></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {chip("POT ODDS",`${math.potOdds}%`,T.gold,`à payer ${math.facingBet}bb`)}
        {chip("MDF",`${math.mdf}%`,T.blue,"défense mini")}
        {chip("SPR",math.spr,T.green)}
        {chip("COMBOS DISPO",combosAvail,T.cyan,"continuation Hero")}
        {chip("COMBOS BLOQUÉS",combosBlocked==null?"—":combosBlocked,T.text3,"premiums bloqués")}
        {mode==="icm"&&chip("RISK PREMIUM",`${Math.round((riskPremium||0)*100)}%`,T.red,"prime ICM")}
        {mode==="pko"&&chip("BOUNTY FACTOR",`+${Math.round((bountyFactor||0)*100)}%`,"#FF8A3D","élargissement jam")}
      </div>
    </div>
  );
}

/* ── Panneau Solveur CFR (résolution à la demande) ── */
const CFR_BET_SIZES=[[0.33,"33%"],[0.5,"50%"],[0.66,"66%"],[1,"100%"],[1.5,"150%"]];
function SolverCFRPanel({result,busy,onSolve,betFrac,setBetFrac,boardCards,overlay,setOverlay}){
  const street=boardCards.length===5?"River (showdown exact)":boardCards.length===4?"Turn (runouts)":boardCards.length===3?"Flop (runouts)":"Préflop (runouts complets)";
  // §40 : le CFR résout un sous-jeu POSTFLOP (check/bet). Sur préflop, son arbre ne
  // correspond pas à l'action préflop (open/3-bet/fold) → on désactive pour ne pas
  // afficher des sizings absents du vrai arbre.
  const preflop=boardCards.length<3;
  const stat=(label,value,color,sub)=>(
    <div style={{flex:"1 1 120px",minWidth:104,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px"}}>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".08em",marginBottom:3}}>{label}</div>
      <div style={{fontFamily:T.brand,fontWeight:900,fontSize:15,color:color||T.text}}>{value}</div>
      {sub&&<div style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginTop:1}}>{sub}</div>}
    </div>
  );
  return(
    <div className="cai-card" style={{marginTop:14,padding:"14px 16px",border:`1px solid rgba(155,92,255,.35)`}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <span style={{fontFamily:T.brand,fontSize:13,fontWeight:900,letterSpacing:".1em",color:T.purple}}>🧠 SOLVEUR CFR</span>
        <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>GTO réel — sous-jeu heads-up 1 street (check/bet · call/fold), ranges réelles, régret-matching CFR+</span>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>Sizing bet</span>
          <div style={{display:"inline-flex",borderRadius:7,border:`1px solid ${T.border}`,overflow:"hidden"}}>
            {CFR_BET_SIZES.map(([f,lab])=>(
              <button key={f} onClick={()=>setBetFrac(f)} style={{padding:"4px 10px",fontSize:9.5,fontWeight:800,cursor:"pointer",border:"none",fontFamily:T.stats,
                background:betFrac===f?T.purple:"transparent",color:betFrac===f?"#06101f":T.text3}}>{lab}</button>
            ))}
          </div>
          <button onClick={onSolve} disabled={busy||preflop} title={preflop?"Sélectionne un board (flop/turn/river)":""} style={{padding:"7px 16px",borderRadius:8,fontSize:10.5,fontWeight:800,cursor:busy?"wait":preflop?"not-allowed":"pointer",border:"none",fontFamily:T.stats,letterSpacing:".05em",
            background:busy?"rgba(155,92,255,.3)":preflop?"rgba(255,255,255,.06)":"linear-gradient(135deg,#9B5CFF,#34D8FF)",color:preflop?T.text4:"#06101f"}}>
            {busy?"⏳ Calcul…":"▶ Résoudre (CFR)"}
          </button>
        </div>
      </div>
      <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginBottom:(result&&!preflop)?10:0}}>
        Texture : <b style={{color:T.cyan}}>{street}</b> · Hero (range/main affichée) en premier de parole (OOP) vs Vilain. Le pot et les stacks viennent de la barre ci-dessus.
      </div>
      {preflop&&(
        <div style={{marginTop:8,padding:"8px 10px",borderRadius:8,background:"rgba(255,176,32,.08)",border:"1px solid rgba(255,176,32,.3)",fontSize:9,color:"#FFB020",fontFamily:T.stats}}>
          ⓘ Le Solveur CFR résout un <b>sous-jeu postflop</b> (check/bet). Renseigne un <b>board</b> (flop/turn/river) pour résoudre. En préflop, la stratégie affichée reste la range <b>heuristique</b> (open/3-bet/fold).
        </div>
      )}
      {result?(
        <>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {stat("HERO ROOT",`bet ${result.heroBet}%`,T.green,`small ${result.heroBetS}% · big ${result.heroBetB}% · check ${result.heroCheck}%`)}
            {stat(`VILAIN vs BET ${result.betSPct}%`,`call ${result.villCallVsBetS}%`,T.blue,`fold ${result.villFoldVsBetS}% · raise ${result.villRaiseVsBetS}%`)}
            {stat(`VILAIN vs BET ${result.betBPct}%`,`call ${result.villCallVsBetB}%`,T.blue,`fold ${result.villFoldVsBetB}% · raise ${result.villRaiseVsBetB}%`)}
            {stat("VILAIN (si Hero check)",`bet ${result.villBetVsCheck}%`,T.purple,`check ${result.villCheckVsCheck}%`)}
            {stat("HERO face au stab",`call ${result.heroCallVsStab}%`,T.cyan,`check-raise ${result.heroCheckRaise}% · fold ${result.heroFoldVsStab}%`)}
            {stat("EV HERO (sous-jeu)",`${result.heroEV>=0?"+":""}${result.heroEV}bb`,result.heroEV>=0?T.green:"#FF6B7A","vs 0 = neutre")}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,flexWrap:"wrap"}}>
            <button onClick={()=>setOverlay(o=>!o)} style={{padding:"6px 12px",borderRadius:7,fontSize:9.5,fontWeight:800,cursor:"pointer",border:`1px solid ${overlay?T.green:T.border}`,fontFamily:T.stats,
              background:overlay?"rgba(16,216,122,.15)":"transparent",color:overlay?T.green:T.text3}}>
              {overlay?"✓ Stratégie CFR affichée sur la matrice Hero":"📊 Afficher la stratégie CFR sur la matrice Hero"}
            </button>
            {overlay&&<span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>cellules colorées par fréquence de bet d'équilibre (vert = bet, gris = check)</span>}
          </div>
          <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginTop:8,fontStyle:"italic"}}>
            {result.iters} itérations CFR+ · {result.nH}×{result.nV} combos (bornés) · pot {result.pot}bb · 2 sizings Hero ({result.betSPct}% / {result.betBPct}% pot) · check-raise & raise vilain inclus{result.complete?" · showdown exact":" · équité par runouts"}. Solveur de spot 1-street — pas un arbre multi-rue complet.
          </div>
        </>
      ):(
        <div style={{fontSize:10,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>Choisis un sizing puis « Résoudre » : le moteur calcule la stratégie d'équilibre (Nash approché) Hero/Vilain pour ce sous-jeu et son EV.</div>
      )}
    </div>
  );
}

/* ── Grille de matrice 13×13 réutilisable (Hero / Villain) ── */
function SolverMatrixGrid({title,posLabel,freqs,pac,scenario,mode,side,selectedCell,setSelectedCell,hoveredCell,setHoveredCell,filterAction,cellSize=24,markHands=[],markColor,cfrMap}){
  return(
    <div style={{flex:1,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontFamily:T.brand,fontSize:11,fontWeight:900,letterSpacing:".12em",color:side==="hero"?T.cyan:T.purple}}>{title}</span>
        <span style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>{posLabel}</span>
        {side==="villain"&&<span style={{marginLeft:"auto",fontSize:8,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>réponse estimée</span>}
      </div>
      <div style={{display:"flex",marginLeft:cellSize+2,marginBottom:2,gap:1}}>
        {RANKS.map(r=>(
          <div key={r} className="shark-rank" style={{width:cellSize,flexShrink:0,textAlign:"center",fontSize:cellSize>=30?11:9.5,fontWeight:800,color:T.text3,fontFamily:T.stats}}>{r}</div>
        ))}
      </div>
      {RANKS.map((row,i)=>(
        <div key={row} style={{display:"flex",gap:1,marginBottom:1,alignItems:"center"}}>
          <div className="shark-rank" style={{width:cellSize,textAlign:"center",fontSize:cellSize>=30?11:9.5,fontWeight:800,color:T.text3,fontFamily:T.stats,flexShrink:0}}>{row}</div>
          {RANKS.map((col,j)=>{
            const key=cellKey(i,j);
            const freq=freqs[key]||{r:0,c:0,f:100};
            const isSelected=selectedCell&&selectedCell.key===key;
            const isHovered=hoveredCell===key;
            const isPair=i===j, isSuited=i<j;
            const dominated=filterAction!=="all"&&(freq[filterAction]||0)<40;
            const ev=estimateEV(key,freq,side==="villain"?"villain":"hero",scenario.stack||100,mode);
            const marked=markHands.includes(key);
            const cfr=cfrMap?cfrMap[key]:null; // {bet,raiseCall} ou undefined
            return(
              <div key={col} className="shark-cell"
                onClick={()=>setSelectedCell(isSelected?null:{key,i,j,isPair,isSuited})}
                onMouseEnter={()=>setHoveredCell(key)}
                onMouseLeave={()=>setHoveredCell(null)}
                title={cfr?`${key} — CFR : bet ${cfr.bet}% · check ${100-cfr.bet}%`:`${key} — ${pac.label} ${freq.r||0}% · Call ${freq.c||0}% · Fold ${freq.f||0}% · EV≈${ev>=0?"+":""}${ev}bb (estimée)`}
                style={{
                  width:cellSize,height:cellSize,flexShrink:0,borderRadius:3,cursor:"pointer",
                  overflow:"hidden",position:"relative",
                  border:`1px solid ${isSelected?"rgba(255,194,71,.85)":marked?(markColor||T.gold):isHovered?"rgba(255,255,255,.25)":"transparent"}`,
                  opacity:dominated?.3:1,
                  transition:"all .1s",
                  transform:isHovered?"scale(1.18)":"scale(1)",
                  zIndex:isHovered?10:1,
                  boxShadow:isSelected?`0 0 0 2px ${T.gold}`:isHovered?"0 2px 8px rgba(0,0,0,.5)":"none",
                }}>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column"}}>
                  {cfr?(<>
                    {cfr.bet>0&&<div style={{flex:cfr.bet,background:T.green,opacity:.5+cfr.bet/250}}/>}
                    {100-cfr.bet>0&&<div style={{flex:100-cfr.bet,background:"rgba(110,118,140,.55)"}}/>}
                  </>):(<>
                    {(freq.r||0)>0&&<div style={{flex:freq.r,background:pac.color,opacity:.55+freq.r/300}}/>}
                    {(freq.c||0)>0&&<div style={{flex:freq.c,background:T.blue,opacity:.5+freq.c/350}}/>}
                    {(freq.f||0)>0&&<div style={{flex:freq.f,background:"rgba(110,118,140,.55)"}}/>}
                  </>)}
                </div>
                {!cfr&&<div style={{position:"absolute",left:0,right:0,bottom:0,height:cellSize>=30?3:2,background:ev>=0?T.green:"#7A1020"}}/>}
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  fontSize:cellSize<=22?7:cellSize<=28?9:11,fontWeight:800,color:"rgba(255,255,255,.95)",
                  fontFamily:T.stats,letterSpacing:-.3,lineHeight:1,textShadow:"0 1px 3px rgba(0,0,0,.9)"}}>
                  {key}
                  {cfr&&<span style={{fontSize:cellSize>=30?8:6.5,fontWeight:700,color:"rgba(255,255,255,.8)",marginTop:1}}>{cfr.bet}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── Légende couleur obligatoire (Open/Call/3bet/4bet/Jam/Fold/Mix/EV) ── */
function SolverLegend({pac}){
  const activeKey=({bet:"open",raise:"threebet"})[pac.key]||pac.key;
  const baseItems=[
    {key:"open",label:"Open / Bet",color:T.green},
    {key:"call",label:"Call",color:T.blue},
    {key:"threebet",label:"3-bet / Raise",color:T.purple},
    {key:"fourbet",label:"4-bet",color:"#FF8A3D"},
    {key:"jam",label:"Jam / Shove / All-in",color:T.red},
    {key:"fold",label:"Fold",color:"rgba(110,118,140,.8)"},
  ];
  return(
    <div className="cai-card" style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",padding:"8px 12px",marginTop:10,marginBottom:0}}>
      {baseItems.map(it=>(
        <div key={it.key} style={{display:"flex",alignItems:"center",gap:5,opacity:activeKey===it.key?1:.5}}>
          <div style={{width:13,height:13,borderRadius:3,background:it.color,boxShadow:activeKey===it.key?`0 0 8px ${it.color}`:"none",flexShrink:0}}/>
          <span style={{fontSize:8.5,color:activeKey===it.key?T.text:T.text3,fontFamily:T.stats,fontWeight:activeKey===it.key?700:400}}>{it.label}{activeKey===it.key?" ← actif ici":""}</span>
        </div>
      ))}
      <div style={{width:1,height:14,background:T.border}}/>
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        <div style={{width:13,height:13,borderRadius:3,background:`linear-gradient(90deg,${T.green},${T.blue},rgba(110,118,140,.8))`,flexShrink:0}}/>
        <span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>Mix (dégradé)</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        <div style={{width:13,height:4,borderRadius:2,background:T.green,flexShrink:0}}/>
        <span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>EV positive</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        <div style={{width:13,height:4,borderRadius:2,background:"#7A1020",flexShrink:0}}/>
        <span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>Erreur / EV négative</span>
      </div>
    </div>
  );
}

/* ── Constantes UI top-bar ── */
const SOLVER_POSITIONS=["UTG","HJ","CO","BTN","SB","BB"];
const SOLVER_POT_TYPES=[
  {id:"limp",label:"Limp / RFI",action:"rfi"},
  {id:"srp",label:"SRP (vs Open)",action:"vs_open"},
  {id:"3bet",label:"Pot 3-bet (vs 3bet)",action:"vs_3bet"},
  {id:"4bet",label:"Pot 4-bet (approx.)",action:"vs_3bet"},
];
const SOLVER_FORMATS=["Cash","MTT","PKO","Satellite","Final Table"];
const SOLVER_MODES=[
  {id:"gto",label:"GTO"},
  {id:"exploit",label:"EXPLOIT"},
  {id:"icm",label:"ICM"},
  {id:"pko",label:"PKO"},
  {id:"chipev",label:"ChipEV"},
];

/* ── Petits sélecteurs réutilisables pour la barre supérieure ── */
function BreadcrumbSelect({label,value,options,optionLabels,color,onChange}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:5,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 8px 4px 10px"}}>
      <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".1em"}}>{label}</span>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{background:"transparent",border:"none",color,fontFamily:T.brand,fontSize:12,fontWeight:900,outline:"none",cursor:"pointer"}}>
        {options.map(o=><option key={o} value={o} style={{color:"#000"}}>{optionLabels?optionLabels[o]:o}</option>)}
      </select>
    </div>
  );
}
function FilterSelect({label,value,onChange,options,wide}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".1em"}}>{label}</span>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,color:T.text2,fontFamily:T.stats,fontSize:10,padding:"4px 8px",outline:"none",cursor:"pointer",minWidth:wide?160:0}}>
        {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
function NumField({label,value,onChange,step=1}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      <span style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>{label}</span>
      <input type="number" step={step} value={value??0} onChange={e=>onChange(Number(e.target.value))}
        style={{width:64,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontFamily:T.stats,fontSize:10,padding:"4px 6px",outline:"none"}}/>
    </div>
  );
}
function IcmParamsPanel({icmParams,setIcmParams,scenario}){
  const p=icmParams||{playersLeft:9,paid:9,heroStack:scenario.stack||25,avgStack:scenario.stack||25,payouts:[]};
  const patch=(k,v)=>setIcmParams({...p,[k]:v});
  return(
    <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"center",marginTop:8,padding:"8px 12px",background:"rgba(155,92,255,.05)",border:"1px solid rgba(155,92,255,.18)",borderRadius:8}}>
      <span style={{fontSize:9,fontWeight:700,color:T.purple,fontFamily:T.stats,letterSpacing:".1em"}}>PARAMÈTRES ICM</span>
      <NumField label="Joueurs restants" value={p.playersLeft} onChange={v=>patch("playersLeft",v)}/>
      <NumField label="Places payées" value={p.paid} onChange={v=>patch("paid",v)}/>
      <NumField label="Stack Hero (bb)" value={p.heroStack} onChange={v=>patch("heroStack",v)}/>
      <NumField label="Stack moyen (bb)" value={p.avgStack} onChange={v=>patch("avgStack",v)}/>
      <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>Payouts : {p.payouts?.length?p.payouts.join(" / "):"non renseignés"}</div>
    </div>
  );
}
function PkoParamsPanel({pkoParams,setPkoParams,scenario}){
  const p=pkoParams||{heroBounty:0,villainBounty:0,avgBounty:0,effectiveStack:scenario.stack||15,coverage:1};
  const patch=(k,v)=>setPkoParams({...p,[k]:v});
  return(
    <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"center",marginTop:8,padding:"8px 12px",background:"rgba(255,138,61,.05)",border:"1px solid rgba(255,138,61,.18)",borderRadius:8}}>
      <span style={{fontSize:9,fontWeight:700,color:"#FF8A3D",fontFamily:T.stats,letterSpacing:".1em"}}>PARAMÈTRES PKO</span>
      <NumField label="Bounty Hero ($)" value={p.heroBounty} onChange={v=>patch("heroBounty",v)}/>
      <NumField label="Bounty Villain ($)" value={p.villainBounty} onChange={v=>patch("villainBounty",v)}/>
      <NumField label="Bounty moyen ($)" value={p.avgBounty} onChange={v=>patch("avgBounty",v)}/>
      <NumField label="Stack effectif (bb)" value={p.effectiveStack} onChange={v=>patch("effectiveStack",v)}/>
      <NumField label="Couverture" value={p.coverage} onChange={v=>patch("coverage",v)} step={0.1}/>
    </div>
  );
}

/* ── Barre supérieure : arbre de décision interactif + modes + filtres ── */
function SolverModeBar({scenario,onUpdateScenario,mode,setMode,exploitProfileId,setExploitProfileId,icmParams,setIcmParams,pkoParams,setPkoParams,format,setFormat,potType,setPotType,validation,onApplyFix,showParams,setShowParams}){
  const stack=scenario.stack||100;
  const baseStackOpts=["10","15","20","30","40","60","100"];
  const stackOpts=baseStackOpts.includes(String(stack))?baseStackOpts:[...baseStackOpts,String(stack)].sort((a,b)=>Number(a)-Number(b));
  return(
    <div style={{borderBottom:`1px solid ${T.border}`,background:`linear-gradient(90deg,rgba(155,92,255,.06),rgba(52,216,255,.04))`,padding:"8px 14px",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
          <BreadcrumbSelect label="HERO" value={scenario.heroPos} options={SOLVER_POSITIONS} color={T.gold} onChange={v=>onUpdateScenario({heroPos:v})}/>
          <span style={{color:T.text4,fontSize:12}}>→</span>
          <BreadcrumbSelect label="ACTION" value={scenario.action} options={Object.keys(ACTION_LABELS)} optionLabels={ACTION_LABELS} color={T.purple} onChange={v=>onUpdateScenario({action:v})}/>
          <span style={{color:T.text4,fontSize:12}}>→</span>
          <BreadcrumbSelect label="VS" value={scenario.vsPos} options={SOLVER_POSITIONS} color={T.text} onChange={v=>onUpdateScenario({vsPos:v})}/>
          <span style={{color:T.text4,fontSize:12}}>→</span>
          <BreadcrumbSelect label="STACK" value={String(stack)} options={stackOpts} optionLabels={Object.fromEntries(stackOpts.map(v=>[v,v+"bb"]))} color={T.cyan} onChange={v=>onUpdateScenario({stack:Number(v)})}/>
          {(scenario.action==="cbet_ip"||scenario.action==="vs_bet")&&(
            <div className="cai-pill" style={{fontSize:9}}>📍 {scenario.street||"Flop"}</div>
          )}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:4,flexWrap:"wrap"}}>
          {SOLVER_MODES.map(m=>(
            <button key={m.id} onClick={()=>setMode(m.id)} style={{padding:"6px 14px",borderRadius:7,fontSize:10.5,fontWeight:900,cursor:"pointer",border:"1px solid",fontFamily:T.stats,letterSpacing:".06em",
              background:mode===m.id?"linear-gradient(135deg,rgba(155,92,255,.25),rgba(52,216,255,.18))":"transparent",
              color:mode===m.id?T.cyan:T.text3,
              borderColor:mode===m.id?"rgba(52,216,255,.5)":T.border,
              boxShadow:mode===m.id?`0 0 14px rgba(52,216,255,.25)`:"none"}}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginTop:8}}>
        <FilterSelect label="POT TYPE" value={potType} onChange={v=>{setPotType(v);const pt=SOLVER_POT_TYPES.find(p=>p.id===v);if(pt)onUpdateScenario({action:pt.action});}} options={SOLVER_POT_TYPES.map(p=>[p.id,p.label])}/>
        <FilterSelect label="FORMAT" value={format} onChange={setFormat} options={SOLVER_FORMATS.map(f=>[f,f])}/>
        {mode==="exploit"&&(
          <FilterSelect label="PROFIL VILAIN" value={exploitProfileId} onChange={setExploitProfileId} options={EXPLOIT_PROFILES.map(p=>[p.id,p.label])} wide/>
        )}
        <button onClick={()=>setShowParams(v=>!v)} style={{padding:"5px 10px",borderRadius:6,fontSize:9,fontWeight:700,cursor:"pointer",border:`1px solid ${T.border}`,background:"transparent",color:T.text3,fontFamily:T.stats}}>
          ⚙ Paramètres {showParams?"▲":"▼"}
        </button>
      </div>

      {(showParams||mode==="icm")&&<IcmParamsPanel icmParams={icmParams} setIcmParams={setIcmParams} scenario={scenario}/>}
      {(showParams||mode==="pko")&&<PkoParamsPanel pkoParams={pkoParams} setPkoParams={setPkoParams} scenario={scenario}/>}

      {!validation.ok&&(
        <div style={{marginTop:8,padding:"10px 12px",borderRadius:8,background:"rgba(255,69,96,.08)",border:"1px solid rgba(255,69,96,.3)",display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{fontSize:16}}>⚠</span>
          <div style={{flex:1}}>
            <div style={{fontSize:10.5,fontWeight:700,color:T.red,fontFamily:T.stats}}>{validation.reason}</div>
            <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,marginTop:2}}>{validation.detail}</div>
          </div>
          {validation.fix&&(
            <button onClick={()=>onApplyFix(validation.fix)} style={{padding:"5px 12px",borderRadius:6,fontSize:9,fontWeight:700,cursor:"pointer",border:"none",fontFamily:T.stats,background:"linear-gradient(135deg,#FFC247,#FFC247)",color:"#0a0800",flexShrink:0}}>
              Corriger automatiquement
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Colonne gauche : scénario actuel + 15 scénarios + custom ── */
/* ── Mini-carte (rang + couleur) pour Board / Hero dans la colonne gauche ── */
function SsCardPill({c}){
  const lab=cardLabel(c);const red=lab.includes("♥")||lab.includes("♦");
  return <span className="ss-cardpill" style={{color:red?"#ff7d9c":"#e6f0ff",borderColor:red?"rgba(255,125,156,.4)":"rgba(120,170,255,.4)"}}>{lab}</span>;
}
/* ── COLONNE GAUCHE (§36-§39) : SCÉNARIO · RANGE SOURCE · FILTRES & BLOCKERS ·
   SOLVER ENGINE. Lecture seule + bouton « Modifier » qui révèle le sélecteur de
   scénarios (préchargés + custom), qui ne monopolise plus la colonne (§54). ── */
function SolverSidebar({scenario,setScenario,onResetCell,savedSpots,setSavedSpots,showCustomForm,setShowCustomForm,newSpot,setNewSpot,format,
  effective,math,board,heroParse,heroMode,villainMode,heroCombosN,villainCombosN,antes}){
  const selStyle={width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontFamily:T.stats,fontSize:10,padding:"5px 7px",outline:"none"};
  const newSpotValidation=useMemo(()=>validateSpot({heroPos:newSpot.hero,vsPos:newSpot.vs,action:newSpot.action,stack:newSpot.stack}),[newSpot]);
  const editing=showCustomForm;
  // Provenance réelle des ranges (§37) : main saisie = utilisateur, sinon heuristique.
  const heroRangeSrc=heroMode==="hand"?RangeSource.USER_DEFINED:RangeSource.HEURISTIC;
  const vilRangeSrc=villainMode==="hand"?RangeSource.USER_DEFINED:RangeSource.HEURISTIC;
  const heroCards=heroMode==="hand"&&heroParse?.valid&&heroParse.suits?exactComboList(heroParse)?.[0]?.cards:null;
  const deadCards=[...(board||[]),...(heroCards||[])];
  const structure=antes>0?"Ante":"No Ante";
  const rake=format==="Cash"?"5% (Cap 3bb)":"0% (tournoi)";
  // Action précédente déduite de l'action du scénario.
  const prevAction={rfi:["Premier à parler (RFI)"],vs_open:[`${scenario.vsPos} raise`],
    vs_3bet:[`${scenario.heroPos} raise`,`${scenario.vsPos} 3-bet`],
    cbet_ip:["Raise / call préflop","Flop checké au Hero"],vs_bet:["Raise / call préflop",`${scenario.vsPos} bet`]}[scenario.action]||["—"];

  function applyNewSpot(){
    if(!newSpotValidation.ok)return;
    const sc={id:"custom-"+Date.now(),label:newSpot.title||`${newSpot.hero} vs ${newSpot.vs} — ${ACTION_LABELS[newSpot.action]||newSpot.action}`,
      heroPos:newSpot.hero,vsPos:newSpot.vs,action:newSpot.action,stack:newSpot.stack,
      street:["cbet_ip","vs_bet"].includes(newSpot.action)?"Flop":"Preflop"};
    setScenario(sc);
    onResetCell();
    if(newSpot.title){
      const spot={...sc,note:newSpot.note};
      const updated=[spot,...savedSpots];
      setSavedSpots(updated);
      localStorage.setItem("pf_custom_spots",JSON.stringify(updated));
    }
    setNewSpot({title:"",hero:"BTN",vs:"BB",action:"rfi",stack:100,note:""});
    setShowCustomForm(false);
  }
  const InfoRow=({label,children,strong})=>(
    <div className="ss-inforow"><span className="ss-inforow-k">{label}</span><span className="ss-inforow-v" style={strong?{color:"#dceaff",fontWeight:800}:undefined}>{children}</span></div>
  );

  return(
    <div className="shark-left-col" style={{width:238,flexShrink:0,background:T.surface,borderRight:`1px solid ${T.border}`,overflowY:"auto",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"12px 12px 10px",display:"flex",flexDirection:"column",gap:11}}>

        {/* ── SCÉNARIO ── */}
        <div className="ss-scen-card">
          <div className="ss-scen-head">
            <span className="ss-panel-title">SCÉNARIO</span>
            <button className="ss-modif-btn" onClick={()=>setShowCustomForm(v=>!v)}>{editing?"✕ Fermer":"Modifier"}</button>
          </div>
          {!editing&&<>
            <div style={{fontFamily:T.brand,fontSize:12.5,fontWeight:900,color:T.text,margin:"2px 0 8px"}}>{scenario.label}</div>
            <div className="ss-inforow" style={{alignItems:"flex-start"}}>
              <span className="ss-inforow-k">Positions</span>
              <span className="ss-inforow-v" style={{textAlign:"right"}}>
                <span style={{color:T.cyan,fontWeight:800}}>Hero ({scenario.heroPos})</span><br/>
                <span style={{color:T.purple,fontWeight:800}}>Villain ({scenario.vsPos})</span>
              </span>
            </div>
            <InfoRow label="Stack effectif" strong>{effective} bb</InfoRow>
            <InfoRow label="Pot" strong>{math?.pot??"—"} bb</InfoRow>
            <div className="ss-inforow"><span className="ss-inforow-k">Board</span>
              <span className="ss-inforow-v">{board&&board.length?<span className="ss-cardrow">{board.map((c,i)=><SsCardPill key={i} c={c}/>)}</span>:<span style={{color:T.text4}}>préflop</span>}</span></div>
            <div className="ss-inforow"><span className="ss-inforow-k">Hero</span>
              <span className="ss-inforow-v">{heroCards?<span className="ss-cardrow">{heroCards.map((c,i)=><SsCardPill key={i} c={c}/>)}</span>:<span style={{color:T.text4}}>range</span>}</span></div>
            <div className="ss-inforow" style={{alignItems:"flex-start"}}><span className="ss-inforow-k">Action préc.</span>
              <span className="ss-inforow-v" style={{textAlign:"right",lineHeight:1.4}}>{prevAction.map((a,i)=><React.Fragment key={i}>{a}{i<prevAction.length-1&&<br/>}</React.Fragment>)}</span></div>
            <InfoRow label="Structure">{structure}</InfoRow>
            <InfoRow label="Rake">{rake}</InfoRow>
            <InfoRow label="Ranges">Définies</InfoRow>
          </>}
        </div>

        {/* ── Sélecteur (préchargés + custom) révélé par « Modifier » ── */}
        {editing&&(
          <div className="ss-picker">
            <div className="ss-panel-title" style={{marginBottom:6}}>SCÉNARIOS PRÉCHARGÉS</div>
            <div style={{maxHeight:220,overflowY:"auto",marginBottom:8}}>
              {SOLVER_SCENARIOS.map(sc=>(
                <div key={sc.id} onClick={()=>{setScenario(sc);onResetCell();setShowCustomForm(false);}}
                  style={{padding:"6px 9px",borderRadius:6,marginBottom:3,cursor:"pointer",
                    background:scenario.id===sc.id?"rgba(52,216,255,.12)":T.bg,
                    border:`1px solid ${scenario.id===sc.id?"rgba(52,216,255,.4)":T.border}`,
                    borderLeft:`3px solid ${scenario.id===sc.id?T.cyan:"transparent"}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:scenario.id===sc.id?T.cyan:T.text,fontFamily:T.stats}}>{sc.label}</div>
                  <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,marginTop:1}}>{sc.street} · {sc.stack}bb{sc.icmParams?" · ICM":sc.pkoParams?" · PKO":""}</div>
                </div>
              ))}
              {savedSpots.map(sp=>(
                <div key={sp.id} style={{padding:"6px 9px",borderRadius:6,marginBottom:3,cursor:"pointer",
                  background:scenario.id===sp.id?"rgba(255,194,71,.1)":T.bg,border:`1px solid ${scenario.id===sp.id?"rgba(255,194,71,.3)":T.border}`,
                  display:"flex",alignItems:"center",gap:6}} onClick={()=>{setScenario(sp);onResetCell();setShowCustomForm(false);}}>
                  <div style={{flex:1}}><div style={{fontSize:9.5,fontWeight:700,color:T.gold,fontFamily:T.stats}}>{sp.label}</div>
                    <div style={{fontSize:8,color:T.text3,fontFamily:T.stats}}>{sp.heroPos} vs {sp.vsPos} · {sp.stack}bb</div></div>
                  <div onClick={e=>{e.stopPropagation();const u=savedSpots.filter(s=>s.id!==sp.id);setSavedSpots(u);localStorage.setItem("pf_custom_spots",JSON.stringify(u));}} style={{fontSize:10,color:T.red,cursor:"pointer",opacity:.6,padding:2}}>✕</div>
                </div>
              ))}
            </div>
            <div className="ss-panel-title" style={{marginBottom:6}}>NOUVEAU SCÉNARIO</div>
          </div>
        )}
        {editing&&(
          <div style={{marginTop:10,background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 10px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,marginBottom:3}}>HERO</div>
                <select value={newSpot.hero} onChange={e=>setNewSpot(s=>({...s,hero:e.target.value}))} style={selStyle}>
                  {SOLVER_POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,marginBottom:3}}>VILLAIN</div>
                <select value={newSpot.vs} onChange={e=>setNewSpot(s=>({...s,vs:e.target.value}))} style={selStyle}>
                  {SOLVER_POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,marginBottom:3}}>ACTION</div>
                <select value={newSpot.action} onChange={e=>setNewSpot(s=>({...s,action:e.target.value}))} style={selStyle}>
                  {Object.entries(ACTION_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,marginBottom:3}}>STACK (bb)</div>
                <input type="number" value={newSpot.stack} onChange={e=>setNewSpot(s=>({...s,stack:Number(e.target.value)}))} style={selStyle}/>
              </div>
            </div>
            <input type="text" placeholder="Titre (optionnel → sauvegarde)" value={newSpot.title} onChange={e=>setNewSpot(s=>({...s,title:e.target.value}))}
              style={{...selStyle,marginBottom:8}}/>
            {!newSpotValidation.ok&&(
              <div style={{marginBottom:8,padding:"6px 8px",borderRadius:6,background:"rgba(255,69,96,.08)",border:"1px solid rgba(255,69,96,.25)"}}>
                <div style={{fontSize:9,fontWeight:700,color:T.red,fontFamily:T.stats}}>{newSpotValidation.reason}</div>
                <div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,marginTop:2}}>{newSpotValidation.detail}</div>
              </div>
            )}
            <button onClick={applyNewSpot} disabled={!newSpotValidation.ok} style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:10,fontWeight:700,cursor:newSpotValidation.ok?"pointer":"not-allowed",border:"none",fontFamily:T.stats,
              background:newSpotValidation.ok?"linear-gradient(135deg,#FFC247,#FFC247)":"rgba(255,255,255,.05)",color:newSpotValidation.ok?"#0a0800":T.text4}}>
              🦈 Analyser ce spot
            </button>
          </div>
        )}

        {/* ── RANGES SOURCE (§37) — provenance réelle des ranges ── */}
        <div className="ss-panel">
          <div className="ss-panel-title">RANGES SOURCE</div>
          <div className="ss-src-row"><span className="ss-inforow-k">Hero</span>
            <span className="ss-src-tag" style={{color:rangeMeta(heroRangeSrc).color,borderColor:rangeMeta(heroRangeSrc).color}}>{rangeMeta(heroRangeSrc).label}</span></div>
          <div className="ss-src-row"><span className="ss-inforow-k">Villain</span>
            <span className="ss-src-tag" style={{color:rangeMeta(vilRangeSrc).color,borderColor:rangeMeta(vilRangeSrc).color}}>{rangeMeta(vilRangeSrc).label}</span></div>
        </div>

        {/* ── FILTRES & BLOCKERS (§38) — infos issues du Combo Engine ── */}
        <div className="ss-panel">
          <div className="ss-panel-title">FILTRES &amp; BLOCKERS</div>
          <div className="ss-inforow" style={{alignItems:"flex-start"}}><span className="ss-inforow-k">Dead cards</span>
            <span className="ss-inforow-v">{deadCards.length?<span className="ss-cardrow">{deadCards.map((c,i)=><SsCardPill key={i} c={c}/>)}</span>:<span style={{color:T.text4}}>aucune</span>}</span></div>
          <div className="ss-inforow"><span className="ss-inforow-k">Cartes connues retirées</span>
            <span className="ss-toggle on" title="Le moteur retire toujours les cartes connues (card removal)"><span/></span></div>
          <div className="ss-panel-sub">Combos restants</div>
          <InfoRow label="Hero"><b style={{color:T.cyan}}>{heroCombosN??"—"}</b> / 1326</InfoRow>
          <InfoRow label="Villain"><b style={{color:T.purple}}>{villainCombosN??"—"}</b> / 1326</InfoRow>
        </div>

        {/* ── SOLVER ENGINE — état du moteur ── */}
        <div className="ss-engine-card">
          <div className="ss-eng-name"><span className="ss-eng-dot"/>SOLVER ENGINE</div>
          <div className="ss-eng-ver">CORE V1.0.0</div>
          <div className="ss-eng-status">Status : <b>Idle</b></div>
        </div>
      </div>
    </div>
  );
}

/* ── Champ d'édition manuelle de la main (panneau) ── */
function HandEditField({onPickHand}){
  const[v,setV]=useState("");
  const p=v?parseHandToken(v):null;
  return(
    <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
      <div style={{fontSize:8.5,color:T.text3,letterSpacing:".1em",fontFamily:T.stats,marginBottom:6}}>MODIFIER LA MAIN MANUELLEMENT</div>
      <div style={{display:"flex",gap:6}}>
        <input type="text" value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&p?.valid){onPickHand(v);setV("");}}}
          placeholder="ex. A♠5♠, AKs, 99" style={{flex:1,background:T.bg,border:`1px solid ${v&&p&&!p.valid?T.red:T.border}`,borderRadius:6,color:T.text,fontFamily:T.stats,fontSize:10.5,padding:"6px 8px",outline:"none"}}/>
        <button onClick={()=>{if(p?.valid){onPickHand(v);setV("");}}} disabled={!p?.valid}
          style={{padding:"6px 12px",borderRadius:6,fontSize:9.5,fontWeight:700,cursor:p?.valid?"pointer":"not-allowed",border:"none",fontFamily:T.stats,background:p?.valid?"linear-gradient(135deg,#FFC247,#FFC247)":"rgba(255,255,255,.05)",color:p?.valid?"#0a0800":T.text4}}>OK</button>
      </div>
      {v&&p&&!p.valid&&<div style={{marginTop:4,fontSize:9,color:T.red,fontFamily:T.stats}}>⚠ {p.error}</div>}
    </div>
  );
}

/* ── Panneau droit : Main sélectionnée (Hero + Villain + IA) ── */
function SolverSelectedHandPanel({selectedCell,scenario,mode,heroFreqs,villainFreqs,pac,exploitDetails,icmResult,pkoResult,heroParse,equityHero,foldEquity,math,onPickHand}){
  if(!selectedCell){
    return(
      <div className="cai-card" style={{flex:1,minWidth:300,maxWidth:400,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:200,gap:14}}>
        <div style={{textAlign:"center",color:T.text4}}>
          <div style={{fontSize:36,marginBottom:8}}>🦈</div>
          <div style={{fontFamily:T.stats,fontSize:12,letterSpacing:".08em"}}>Clique sur une main</div>
          <div style={{fontFamily:T.stats,fontSize:10,marginTop:4}}>ou saisis-la ci-dessous pour analyser Hero &amp; Vilain</div>
        </div>
        {onPickHand&&<div style={{width:"100%",padding:"0 18px"}}><HandEditField onPickHand={onPickHand}/></div>}
      </div>
    );
  }
  const{key,isPair,isSuited}=selectedCell;
  const stack=scenario.stack||100;
  const heroFreq=heroFreqs[key]||{r:0,c:0,f:100};
  const villainFreq=villainFreqs[key]||{r:0,c:0,f:100};
  const exploitDetail=exploitDetails?exploitDetails[key]:null;
  const isIcmFolded=icmResult?.foldedHands?.includes(key);
  const isPkoWidened=pkoResult?.widenedHands?.includes(key);
  const pkoBreak=mode==="pko"?pkoEvBreakdown(key,heroFreq,scenario.pkoParams,stack):null;
  const heroEV=estimateEV(key,heroFreq,"hero",stack,mode,{
    riskPremium:icmResult?.riskPremium,bountyEV:pkoBreak?.bountyEV,evDelta:exploitDetail?.evDelta,
  });
  const villainSplit=splitRaiseBucket(key,villainFreq,stack,scenario.action);
  const explanation=explainHand(key,scenario,heroFreq,mode,{
    riskPremium:icmResult?.riskPremium,
    bountyFactor:pkoResult?.bountyFactor,
    reason:exploitDetail?.reason,
  });
  const dom=heroFreq.r>0&&heroFreq.r>=Math.max(heroFreq.c,heroFreq.f)?"r":heroFreq.c>0&&heroFreq.c>=Math.max(heroFreq.r,heroFreq.f)?"c":"f";

  const comboExact=heroParse&&heroParse.valid?comboLabel(heroParse):null;

  return(
    <div className="cai-card" style={{flex:1,minWidth:300,maxWidth:400,padding:"16px 18px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{fontFamily:T.brand,fontSize:24,fontWeight:900,color:T.gold,textShadow:`0 0 20px ${T.goldGlow}`}}>{key}</div>
        <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,letterSpacing:".06em"}}>{isPair?"Paire":isSuited?"Suited":"Offsuit"}{comboExact?` · combo ${comboExact}`:""}</div>
        <div style={{marginLeft:"auto",fontSize:9,color:T.text3,fontFamily:T.stats}}>{isPair?6:isSuited?4:12} combos</div>
      </div>

      {/* Equity / Fold equity vs range Vilain */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1,background:T.bg,border:`1px solid rgba(52,216,255,.3)`,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
          <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,letterSpacing:".1em",marginBottom:3}}>EQUITY vs VILAIN</div>
          <div style={{fontSize:14,fontWeight:900,fontFamily:T.brand,color:T.cyan}}>{equityHero!=null?equityHero+"%":"—"}</div>
        </div>
        <div style={{flex:1,background:T.bg,border:`1px solid rgba(16,216,122,.3)`,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
          <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,letterSpacing:".1em",marginBottom:3}}>FOLD EQUITY</div>
          <div style={{fontSize:14,fontWeight:900,fontFamily:T.brand,color:T.green}}>{foldEquity!=null?foldEquity+"%":"—"}</div>
        </div>
        {math&&<div style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
          <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,letterSpacing:".1em",marginBottom:3}}>POT ODDS</div>
          <div style={{fontSize:14,fontWeight:900,fontFamily:T.brand,color:T.gold}}>{math.potOdds}%</div>
        </div>}
      </div>

      {/* EV dérivées de l'équité réelle (modèle) */}
      {math&&equityHero!=null&&(()=>{
        const e=equityHero/100,FE=(foldEquity||0)/100,p=math.pot,bet=math.facingBet;
        const evCall=Math.round((e*(p+bet)-bet)*100)/100;
        const evBet=Math.round((FE*p+(1-FE)*(e*(p+2*bet)-bet))*100)/100;
        const evCheck=Math.round((e*p)*100)/100;
        const row=(l,v,c)=>(
          <div style={{flex:1,textAlign:"center",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 4px"}}>
            <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,letterSpacing:".08em",marginBottom:2}}>{l}</div>
            <div style={{fontSize:12.5,fontWeight:900,fontFamily:T.brand,color:v>=0?c:"#FF6B7A"}}>{v>=0?"+":""}{v}bb</div>
          </div>
        );
        return(<>
          <div style={{fontSize:8.5,color:T.text3,letterSpacing:".1em",fontFamily:T.stats,marginBottom:6}}>EV SELON ÉQUITÉ (modèle pot/équité)</div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {row("EV CALL",evCall,T.blue)}
            {row("EV BET",evBet,T.green)}
            {row("EV CHECK",evCheck,T.cyan)}
          </div>
          <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginTop:-6,marginBottom:10,fontStyle:"italic"}}>EV = équité×pot − mise, avec fold equity ({foldEquity||0}%) sur le bet. Pour la stratégie d'équilibre exacte, lance le Solveur CFR.</div>
        </>);
      })()}

      {/* Rôle / Action / Fréquence / EV */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
          <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,letterSpacing:".1em",marginBottom:3}}>RÔLE</div>
          <div style={{fontSize:10.5,fontWeight:700,color:T.text,fontFamily:T.stats}}>{scenario.heroPos} → {scenario.vsPos}</div>
        </div>
        <div style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
          <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,letterSpacing:".1em",marginBottom:3}}>ACTION {mode==="exploit"?"EXPLOIT":mode.toUpperCase()}</div>
          <div style={{fontSize:10.5,fontWeight:700,color:dom==="r"?pac.color:dom==="c"?T.blue:T.text3,fontFamily:T.stats}}>{dom==="r"?pac.label:dom==="c"?"Call":"Fold"}</div>
        </div>
        <div style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
          <div style={{fontSize:8,color:T.text3,fontFamily:T.stats,letterSpacing:".1em",marginBottom:3}}>EV ESTIMÉE</div>
          <div style={{fontSize:13,fontWeight:900,fontFamily:T.brand,color:heroEV>=0?T.green:"#FF6B7A"}}>{heroEV>=0?"+":""}{heroEV}bb</div>
        </div>
      </div>

      {/* Actions GTO/Exploit Hero */}
      <div style={{fontSize:8.5,color:T.text3,letterSpacing:".1em",fontFamily:T.stats,marginBottom:6}}>ACTIONS {mode==="exploit"?"EXPLOIT":"GTO"} HERO</div>
      {[
        {k:"r",label:pac.label,col:pac.color},
        {k:"c",label:"Call / Flat",col:T.blue},
        {k:"f",label:"Fold",col:"rgba(120,120,160,.7)"},
      ].map(({k,label,col})=>{
        const pct=heroFreq[k]||0;
        if(pct===0)return null;
        const gtoPct=exploitDetail?exploitDetail.gtoFreq[k]:null;
        return(
          <div key={k} style={{marginBottom:9}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:10.5,fontWeight:700,color:col,fontFamily:T.stats}}>{label}</span>
              <span style={{fontFamily:T.brand,fontSize:13,fontWeight:900,color:col}}>
                {pct}%{gtoPct!=null&&gtoPct!==pct?<span style={{fontSize:9,color:T.text4,fontFamily:T.stats,marginLeft:5}}>(GTO {gtoPct}%)</span>:null}
              </span>
            </div>
            <div style={{height:9,background:"rgba(255,255,255,.05)",borderRadius:5,overflow:"hidden",position:"relative"}}>
              <div style={{width:pct+"%",height:"100%",background:col,borderRadius:5,opacity:.85}}/>
              {gtoPct!=null&&gtoPct!==pct&&<div style={{position:"absolute",top:0,left:gtoPct+"%",width:2,height:"100%",background:T.gold}}/>}
            </div>
          </div>
        );
      })}
      {exploitDetail?.evDelta?(
        <div style={{fontSize:9,color:exploitDetail.evDelta>=0?T.green:"#FF6B7A",fontFamily:T.stats,marginBottom:8}}>
          Écart EV vs GTO : {exploitDetail.evDelta>=0?"+":""}{exploitDetail.evDelta}bb (estimée)
        </div>
      ):null}

      {/* Réponse Villain */}
      <div style={{fontSize:8.5,color:T.text3,letterSpacing:".1em",fontFamily:T.stats,margin:"12px 0 6px"}}>RÉPONSE VILLAIN ({scenario.vsPos}, estimée)</div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {[
          {k:"fold",label:"Fold",val:villainSplit.fold,col:"rgba(120,120,160,.7)"},
          {k:"call",label:"Call",val:villainSplit.call,col:T.blue},
          {k:"threebet",label:"3-bet",val:villainSplit.threebet,col:T.purple},
          {k:"fourbet",label:"4-bet",val:villainSplit.fourbet,col:"#FF8A3D"},
          {k:"jam",label:"Jam / All-in",val:villainSplit.jam,col:T.red},
        ].filter(r=>r.val>0).map(r=>{
          const villFreqForEV={r:r.k==="fold"||r.k==="call"?0:r.val,c:r.k==="call"?r.val:0,f:r.k==="fold"?r.val:0};
          const ev=estimateEV(key,villFreqForEV,"villain",stack,mode);
          return(
            <div key={r.k} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 8px",background:T.bg,borderRadius:6,border:`1px solid ${T.border}`}}>
              <span style={{fontSize:10,fontWeight:700,color:r.col,fontFamily:T.stats}}>{r.label}</span>
              <span style={{fontSize:10,color:T.text2,fontFamily:T.stats}}>{r.val}%</span>
              <span style={{fontSize:9.5,fontFamily:T.brand,fontWeight:900,color:ev>=0?T.green:"#FF6B7A"}}>{ev>=0?"+":""}{ev}bb</span>
            </div>
          );
        })}
      </div>

      {isIcmFolded&&(
        <div style={{marginTop:8,padding:"6px 8px",borderRadius:6,background:"rgba(255,69,96,.08)",border:"1px solid rgba(255,69,96,.25)",fontSize:9,color:T.red,fontFamily:T.stats}}>
          ⚠ ICM : cette main bascule en fold (jam en ChipEV) — prime de risque ≈{Math.round((icmResult?.riskPremium||0)*100)}%
        </div>
      )}
      {isPkoWidened&&(
        <div style={{marginTop:8,padding:"6px 8px",borderRadius:6,background:"rgba(16,216,122,.08)",border:"1px solid rgba(16,216,122,.25)",fontSize:9,color:T.green,fontFamily:T.stats}}>
          ✓ PKO : cette main devient un shove grâce au fold equity bounty (fold pur en ChipEV)
        </div>
      )}
      {pkoBreak&&(
        <div style={{marginTop:8,display:"flex",gap:6}}>
          {[["ChipEV",pkoBreak.chipEV],["BountyEV",pkoBreak.bountyEV],["TotalEV",pkoBreak.totalEV]].map(([l,v])=>(
            <div key={l} style={{flex:1,textAlign:"center",background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 4px"}}>
              <div style={{fontSize:8,color:T.text3,fontFamily:T.stats}}>{l}</div>
              <div style={{fontSize:11,fontWeight:900,fontFamily:T.brand,color:v>=0?T.green:"#FF6B7A"}}>{v>=0?"+":""}{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Explication IA */}
      <div style={{marginTop:12,padding:"10px 12px",background:T.bg,borderRadius:8,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:8.5,color:T.cyan,letterSpacing:".1em",fontFamily:T.stats,fontWeight:700,marginBottom:6}}>EXPLICATION IA</div>
        <div style={{fontSize:10,color:T.text2,lineHeight:1.7,fontFamily:T.stats}}>{explanation.text}</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8}}>
          {explanation.tags.map(tag=>(
            <span key={tag} className="cai-pill" style={{fontSize:8.5}}>{tag}</span>
          ))}
        </div>
      </div>

      {onPickHand&&<HandEditField onPickHand={onPickHand}/>}
    </div>
  );
}

/* Force moyenne (pondérée combos) + part de combos premium d'une range "raise" */
function rangeMetrics(freqs){
  let wSum=0,wTot=0,nutCombos=0,totCombos=0;
  Object.entries(freqs).forEach(([k,f])=>{
    const combos=k.length===2?6:k.endsWith("s")?4:12;
    const w=combos*((f.r||0)/100);
    wSum+=handStrengthScore(k)*w;wTot+=w;
    if(handTier(k)==="premium")nutCombos+=w;
    totCombos+=w;
  });
  return{avgStrength:wTot?Math.round(wSum/wTot):0,nutPct:totCombos?Math.round(nutCombos/totCombos*100):0,totCombos:Math.round(totCombos)};
}

/* ── Arbre de décision (bas) — branches cliquables avec freq/EV/couleur ── */
function SolverDecisionTree({scenario,mode,pac,stats,evByBucket,selectedCell,heroFreqs,filterAction,setFilterAction}){
  const selFreq=selectedCell?heroFreqs[selectedCell.key]:null;
  const branches=[
    {k:"r",label:pac.label,col:pac.color,pct:selFreq?selFreq.r:stats.raisedPct,ev:evByBucket.r},
    {k:"c",label:"Call",col:T.blue,pct:selFreq?selFreq.c:stats.calledPct,ev:evByBucket.c},
    {k:"f",label:"Fold",col:"rgba(120,120,160,.8)",pct:selFreq?selFreq.f:stats.foldedPct,ev:evByBucket.f},
  ];
  return(
    <div className="cai-card" style={{flex:1,minWidth:240}}>
      <div className="cai-card-h">🌳 ARBRE DE DÉCISION</div>
      <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginBottom:10}}>
        {scenario.heroPos} {ACTION_LABELS[scenario.action]||scenario.action} vs {scenario.vsPos}
        {selectedCell?` · main ${selectedCell.key}`:" · range complète"}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {branches.filter(b=>b.pct>0).map(b=>(
          <div key={b.k} onClick={()=>setFilterAction(filterAction===b.k?"all":b.k)}
            style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,cursor:"pointer",
              background:filterAction===b.k?`${b.col}22`:T.bg,border:`1px solid ${filterAction===b.k?b.col:T.border}`,transition:"all .12s"}}>
            <div style={{width:10,height:10,borderRadius:3,background:b.col,flexShrink:0}}/>
            <span style={{fontSize:10.5,fontWeight:700,color:T.text,fontFamily:T.stats,flex:1}}>{b.label}</span>
            <span style={{fontSize:11,fontWeight:900,fontFamily:T.brand,color:b.col}}>{b.pct}%</span>
            <span style={{fontSize:9.5,fontFamily:T.brand,fontWeight:700,color:b.ev>=0?T.green:"#FF6B7A",minWidth:48,textAlign:"right"}}>{b.ev>=0?"+":""}{b.ev}bb</span>
          </div>
        ))}
      </div>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginTop:8,fontStyle:"italic"}}>EV agrégées estimées (heuristique) · clique pour filtrer la matrice</div>
    </div>
  );
}

/* ── EV par action — barres horizontales ── */
function SolverEVChart({scenario,mode,pac,evByBucket,selectedCell,heroFreqs,villainFreqs}){
  const stack=scenario.stack||100;
  let bars;
  if(selectedCell){
    const heroFreq=heroFreqs[selectedCell.key]||{r:0,c:0,f:100};
    const villainFreq=villainFreqs[selectedCell.key]||{r:0,c:0,f:100};
    const villainSplit=splitRaiseBucket(selectedCell.key,villainFreq,stack,scenario.action);
    bars=[
      {label:`Hero ${pac.label}`,val:estimateEV(selectedCell.key,heroFreq,"hero",stack,mode),col:pac.color},
      {label:"Hero Call",val:estimateEV(selectedCell.key,{...heroFreq,r:0,f:0,c:100},"hero",stack,mode),col:T.blue},
      {label:"Hero Fold",val:0,col:"rgba(120,120,160,.8)"},
      {label:"Villain Fold",val:estimateEV(selectedCell.key,{r:0,c:0,f:100},"villain",stack,mode),col:"rgba(120,120,160,.8)"},
      {label:"Villain 3-bet",val:villainSplit.threebet>0?estimateEV(selectedCell.key,{r:villainSplit.threebet,c:0,f:0},"villain",stack,mode):null,col:T.purple},
      {label:"Villain Jam",val:villainSplit.jam>0?estimateEV(selectedCell.key,{r:villainSplit.jam,c:0,f:0},"villain",stack,mode):null,col:T.red},
    ].filter(b=>b.val!=null);
  }else{
    bars=[
      {label:pac.label,val:evByBucket.r,col:pac.color},
      {label:"Call",val:evByBucket.c,col:T.blue},
      {label:"Fold",val:evByBucket.f,col:"rgba(120,120,160,.8)"},
    ];
  }
  const maxAbs=Math.max(0.4,...bars.map(b=>Math.abs(b.val)));
  return(
    <div className="cai-card" style={{flex:1,minWidth:240}}>
      <div className="cai-card-h">📊 EV PAR ACTION {selectedCell?`— ${selectedCell.key}`:"— range complète"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:4}}>
        {bars.map(b=>(
          <div key={b.label}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:9.5,color:T.text2,fontFamily:T.stats}}>{b.label}</span>
              <span style={{fontSize:10.5,fontWeight:900,fontFamily:T.brand,color:b.val>=0?T.green:"#FF6B7A"}}>{b.val>=0?"+":""}{b.val}bb</span>
            </div>
            <div style={{height:8,background:"rgba(255,255,255,.05)",borderRadius:4,overflow:"hidden",position:"relative"}}>
              <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:T.border}}/>
              <div style={{position:"absolute",height:"100%",borderRadius:4,
                left:b.val>=0?"50%":(50-Math.abs(b.val)/maxAbs*50)+"%",
                width:Math.abs(b.val)/maxAbs*50+"%",
                background:b.val>=0?T.green:"#FF6B7A",opacity:.8}}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginTop:8,fontStyle:"italic"}}>Valeurs estimées (heuristique) en bb — pas un calcul solver exact.</div>
    </div>
  );
}

/* ── Détails stratégiques (tabs) ── */
const SOLVER_DETAILS_TABS=["Fréquences","EV","Sizings","Comparaison","Bloqueurs","Equity","Range Advantage","Nut Advantage"];
function SolverDetailsTabs({scenario,mode,pac,heroFreqs,villainFreqs,selectedCell,exploitDetails,detailsTab,setDetailsTab,stats,evByBucket}){
  const isPostflop=scenario.action==="cbet_ip"||scenario.action==="vs_bet";
  const heroFreq=selectedCell?heroFreqs[selectedCell.key]:null;
  const villainFreq=selectedCell?villainFreqs[selectedCell.key]:null;
  const exploitDetail=selectedCell&&exploitDetails?exploitDetails[selectedCell.key]:null;
  const heroMetrics=useMemo(()=>rangeMetrics(heroFreqs),[heroFreqs]);
  const villainMetrics=useMemo(()=>rangeMetrics(villainFreqs),[villainFreqs]);

  return(
    <div className="cai-card" style={{flex:1.4,minWidth:280}}>
      <div className="cai-card-h">📐 DÉTAILS STRATÉGIQUES</div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
        {SOLVER_DETAILS_TABS.map(t=>(
          <button key={t} onClick={()=>setDetailsTab(t)} style={{padding:"4px 9px",borderRadius:14,fontSize:8.5,fontWeight:700,cursor:"pointer",border:"1px solid",fontFamily:T.stats,
            background:detailsTab===t?"rgba(52,216,255,.14)":"transparent",
            color:detailsTab===t?T.cyan:T.text3,borderColor:detailsTab===t?"rgba(52,216,255,.4)":T.border}}>
            {t}
          </button>
        ))}
      </div>

      {detailsTab==="Fréquences"&&(
        heroFreq?(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>Main {selectedCell.key} — Hero ({scenario.heroPos}) vs Villain ({scenario.vsPos})</div>
            {[["Hero "+pac.label,heroFreq.r,pac.color],["Hero Call",heroFreq.c,T.blue],["Hero Fold",heroFreq.f,"rgba(120,120,160,.8)"],
              ["Villain "+pac.label,villainFreq?.r||0,pac.color],["Villain Call",villainFreq?.c||0,T.blue],["Villain Fold",villainFreq?.f||0,"rgba(120,120,160,.8)"]]
              .filter(([,v])=>v>0).map(([l,v,c])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:T.stats}}>
                <span style={{color:c,fontWeight:700}}>{l}</span><span style={{color:T.text2}}>{v}%</span>
              </div>
            ))}
          </div>
        ):(
          <div style={{display:"flex",gap:16}}>
            {[["Hero "+pac.label,stats.raisedPct,pac.color],["Call",stats.calledPct,T.blue],["Fold",stats.foldedPct,"rgba(120,120,160,.8)"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{fontFamily:T.brand,fontSize:18,fontWeight:900,color:c}}>{v}%</div>
                <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
        )
      )}

      {detailsTab==="EV"&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[["Hero "+pac.label,evByBucket.r,pac.color],["Hero Call",evByBucket.c,T.blue],["Hero Fold",evByBucket.f,"rgba(120,120,160,.8)"]].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:T.stats}}>
              <span style={{color:c,fontWeight:700}}>{l}</span>
              <span style={{color:v>=0?T.green:"#FF6B7A",fontWeight:900,fontFamily:T.brand}}>{v>=0?"+":""}{v}bb</span>
            </div>
          ))}
          <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic",marginTop:4}}>EV agrégées (combo-weighted) sur la range complète — estimation heuristique.</div>
        </div>
      )}

      {detailsTab==="Sizings"&&(()=>{
        const sz=SOLVER_SIZINGS[scenario.action];
        if(!sz)return <div style={{fontSize:10,color:T.text3,fontFamily:T.stats}}>Aucun sizing type pour cette action.</div>;
        return(
          <div>
            <div style={{fontSize:10,fontWeight:700,color:T.gold,fontFamily:T.stats,marginBottom:6}}>{sz.label}</div>
            {sz.sizes.map(s=>(
              <div key={s} style={{fontSize:10,color:T.text2,fontFamily:T.stats,padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>• {s}</div>
            ))}
          </div>
        );
      })()}

      {detailsTab==="Comparaison"&&(
        mode!=="exploit"?(
          <div style={{fontSize:10,color:T.text3,fontFamily:T.stats,lineHeight:1.7}}>
            Passe en mode <b style={{color:T.cyan}}>EXPLOIT</b> et choisis un profil populationnel pour comparer la fréquence GTO et la fréquence Exploit (avec écart EV estimé) main par main.
          </div>
        ):!selectedCell?(
          <div style={{fontSize:10,color:T.text3,fontFamily:T.stats}}>Sélectionne une main pour voir le comparatif GTO vs Exploit.</div>
        ):(
          <div>
            <div style={{fontSize:10,fontFamily:T.stats,marginBottom:6}}>Main {selectedCell.key}</div>
            {["r","c","f"].map(b=>{
              const g=exploitDetail?.gtoFreq[b]||0, ex=exploitDetail?.exploitFreq[b]||0;
              if(g===0&&ex===0)return null;
              const label=b==="r"?pac.label:b==="c"?"Call":"Fold";
              return(
                <div key={b} style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:T.stats,padding:"3px 0"}}>
                  <span style={{color:T.text2}}>{label}</span>
                  <span><span style={{color:T.gold}}>GTO {g}%</span> → <span style={{color:T.cyan}}>Exploit {ex}%</span></span>
                </div>
              );
            })}
            <div style={{marginTop:8,fontSize:9.5,color:T.text2,fontFamily:T.stats,lineHeight:1.6}}>{exploitDetail?.reason||"Pas d'écart significatif vs GTO pour ce profil."}</div>
            <div style={{marginTop:4,fontSize:10,fontWeight:900,fontFamily:T.brand,color:(exploitDetail?.evDelta||0)>=0?T.green:"#FF6B7A"}}>
              Écart EV estimé : {(exploitDetail?.evDelta||0)>=0?"+":""}{exploitDetail?.evDelta||0}bb
            </div>
          </div>
        )
      )}

      {detailsTab==="Bloqueurs"&&(
        !selectedCell?(
          <div style={{fontSize:10,color:T.text3,fontFamily:T.stats}}>Sélectionne une main pour voir les combos premium qu'elle bloque.</div>
        ):(()=>{
          const blockers=buildHandBlockers(selectedCell.key);
          if(blockers.length===0)return <div style={{fontSize:10,color:T.text3,fontFamily:T.stats}}>{selectedCell.key} ne bloque aucun combo premium (AA/KK/QQ/AKs/AKo).</div>;
          return(
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {blockers.map(b=>(
                <div key={b.hand} className="cai-pill" style={{fontSize:9}}>{b.hand} (−{b.count} combo{b.count>1?"s":""})</div>
              ))}
            </div>
          );
        })()
      )}

      {detailsTab==="Equity"&&(
        isPostflop?(
          <div>
            <div style={{fontFamily:T.brand,fontSize:20,fontWeight:900,color:T.cyan}}>{Math.max(5,Math.min(95,Math.round(50+(heroMetrics.avgStrength-villainMetrics.avgStrength)/4)))}%</div>
            <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,marginTop:4}}>Équité estimée de la range Hero vs range Villain sur {scenario.street||"Flop"} (heuristique, sans board réel).</div>
          </div>
        ):(
          <div style={{fontSize:10,color:T.text3,fontFamily:T.stats,lineHeight:1.7}}>L'équité précise nécessite un board (flop/turn/river). Disponible pour les scénarios postflop (C-bet IP / vs Bet) — pour ce spot préflop, utilise l'onglet Fréquences/EV.</div>
        )
      )}

      {detailsTab==="Range Advantage"&&(
        isPostflop?(
          <div>
            <div style={{display:"flex",gap:16}}>
              <div><div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>HERO</div><div style={{fontFamily:T.brand,fontSize:16,fontWeight:900,color:T.cyan}}>{heroMetrics.avgStrength}</div></div>
              <div><div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>VILLAIN</div><div style={{fontFamily:T.brand,fontSize:16,fontWeight:900,color:T.purple}}>{villainMetrics.avgStrength}</div></div>
            </div>
            <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,marginTop:6}}>
              {heroMetrics.avgStrength>=villainMetrics.avgStrength?`Hero a l'avantage de range (+${heroMetrics.avgStrength-villainMetrics.avgStrength} pts) — privilégier un sizing plus large.`:`Villain a l'avantage de range (+${villainMetrics.avgStrength-heroMetrics.avgStrength} pts) — jouer prudemment.`}
            </div>
          </div>
        ):(
          <div style={{fontSize:10,color:T.text3,fontFamily:T.stats,lineHeight:1.7}}>Le Range Advantage se calcule sur un board donné. Disponible pour les scénarios postflop — pour ce spot préflop, voir l'onglet Fréquences.</div>
        )
      )}

      {detailsTab==="Nut Advantage"&&(
        isPostflop?(
          <div>
            <div style={{display:"flex",gap:16}}>
              <div><div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>HERO NUTS</div><div style={{fontFamily:T.brand,fontSize:16,fontWeight:900,color:T.cyan}}>{heroMetrics.nutPct}%</div></div>
              <div><div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>VILLAIN NUTS</div><div style={{fontFamily:T.brand,fontSize:16,fontWeight:900,color:T.purple}}>{villainMetrics.nutPct}%</div></div>
            </div>
            <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,marginTop:6}}>Part de combos premium (AA/KK/QQ/AKs/AKo) dans la range de mise de chaque joueur.</div>
          </div>
        ):(
          <div style={{fontSize:10,color:T.text3,fontFamily:T.stats,lineHeight:1.7}}>Le Nut Advantage nécessite un board. Disponible pour les scénarios postflop — pour ce spot préflop, voir l'onglet Bloqueurs.</div>
        )
      )}
    </div>
  );
}

/* ── Notes & Insights : insights IA auto-générés + notes manuelles (pf_solver_notes) ── */
function SolverNotesPanel({scenario,freqs,mode,notes,setNotes,showNoteForm,setShowNoteForm}){
  const insights=useMemo(()=>buildSolverInsights(scenario,freqs,mode),[scenario,freqs,mode]);
  const[draft,setDraft]=useState("");
  const scenarioNotes=notes.filter(n=>n.scenarioId===scenario.id);

  function addNote(){
    if(!draft.trim())return;
    const note={id:"note-"+Date.now(),scenarioId:scenario.id,scenarioLabel:scenario.label,text:draft.trim(),date:new Date().toLocaleDateString("fr-FR")};
    const updated=[note,...notes];
    setNotes(updated);
    localStorage.setItem("pf_solver_notes",JSON.stringify(updated));
    setDraft("");
    setShowNoteForm(false);
  }
  function removeNote(id){
    const updated=notes.filter(n=>n.id!==id);
    setNotes(updated);
    localStorage.setItem("pf_solver_notes",JSON.stringify(updated));
  }

  return(
    <div className="cai-card" style={{marginTop:14}}>
      <div className="cai-card-h">📝 NOTES &amp; INSIGHTS</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {insights.map((txt,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:10.5,fontFamily:T.stats,color:T.text2,lineHeight:1.6}}>
            <span className="cai-pill" style={{fontSize:8,flexShrink:0,marginTop:1}}>🦈 IA</span>
            <span>{txt}</span>
          </div>
        ))}
      </div>

      {scenarioNotes.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
          {scenarioNotes.map(n=>(
            <div key={n.id} style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:10,fontFamily:T.stats,color:T.text2,background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 8px"}}>
              <span style={{flex:1,lineHeight:1.6}}>{n.text}<div style={{fontSize:8,color:T.text4,marginTop:2}}>{n.date}</div></span>
              <span onClick={()=>removeNote(n.id)} style={{cursor:"pointer",color:T.red,opacity:.6,fontSize:10}}>✕</span>
            </div>
          ))}
        </div>
      )}

      {showNoteForm?(
        <div style={{display:"flex",gap:6,marginTop:10}}>
          <input type="text" autoFocus value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addNote();}}
            placeholder="Ta note sur ce spot..." style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontFamily:T.stats,fontSize:10,padding:"6px 8px",outline:"none"}}/>
          <button onClick={addNote} style={{padding:"6px 12px",borderRadius:6,fontSize:9,fontWeight:700,cursor:"pointer",border:"none",fontFamily:T.stats,background:"linear-gradient(135deg,#FFC247,#FFC247)",color:"#0a0800"}}>Ajouter</button>
          <button onClick={()=>{setShowNoteForm(false);setDraft("");}} style={{padding:"6px 10px",borderRadius:6,fontSize:9,fontWeight:700,cursor:"pointer",border:`1px solid ${T.border}`,background:"transparent",color:T.text3,fontFamily:T.stats}}>✕</button>
        </div>
      ):(
        <button onClick={()=>setShowNoteForm(true)} style={{marginTop:10,padding:"6px 12px",borderRadius:6,fontSize:9.5,fontWeight:700,cursor:"pointer",border:`1px solid ${T.border}`,background:"transparent",color:T.cyan,fontFamily:T.stats}}>
          + Ajouter une note
        </button>
      )}
    </div>
  );
}

/* ── Barre d'actions bas de page (Reset/Exporter/Sauvegarder/cross-links/Node Lock) ── */
function SolverActionBar({scenario,mode,setMode,onReset,onSave,onExport,onGoTrainer,onGoReplayer,setShowNoteForm}){
  const btnStyle={padding:"8px 14px",borderRadius:8,fontSize:10,fontWeight:700,cursor:"pointer",border:`1px solid ${T.border}`,background:"transparent",color:T.text2,fontFamily:T.stats,letterSpacing:".04em"};
  return(
    <div className="cai-card shark-action-bar" style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <button onClick={onReset} style={btnStyle}>↺ Reset</button>
      <button onClick={onExport} style={btnStyle}>📤 Exporter</button>
      <button onClick={onSave} style={{...btnStyle,color:T.gold,borderColor:"rgba(255,194,71,.35)"}}>💾 Sauvegarder scénario</button>
      <button onClick={()=>setMode(mode==="exploit"?"gto":"exploit")} style={{...btnStyle,color:mode==="exploit"?T.cyan:T.text2,borderColor:mode==="exploit"?"rgba(52,216,255,.4)":T.border}}>⚖ Comparer GTO / Exploit</button>
      <div style={{width:1,height:20,background:T.border}}/>
      <button onClick={onGoTrainer} className="cai-btn" style={{fontSize:10}}>🎯 Travailler ce spot dans l'Entraîneur</button>
      <button onClick={onGoReplayer} className="cai-btn cai-btn-ghost" style={{fontSize:10}}>↗ Envoyer vers Replayer</button>
      <button onClick={()=>setShowNoteForm(true)} className="cai-btn cai-btn-ghost" style={{fontSize:10}}>📝 Ajouter une note</button>
      <button disabled title="Node Lock : verrouillage de nœuds dans l'arbre — fonction en développement" style={{...btnStyle,marginLeft:"auto",opacity:.45,cursor:"not-allowed"}}>🔒 Node Lock — Fonction en développement</button>
    </div>
  );
}


/* ═══ Cartes du visuel validé (script Codex) ═══ */
function SolverEquityDonut({hero=50,size=92}){
  const r=(size-14)/2,c=2*Math.PI*r;
  const heroLen=c*Math.max(0,Math.min(100,hero))/100;
  return(
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#122a4a" strokeWidth="9"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#7c3cff" strokeWidth="9"
        strokeDasharray={`${c-heroLen} ${heroLen}`} strokeDashoffset={-heroLen} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#00aaff" strokeWidth="9"
        strokeDasharray={`${heroLen} ${c-heroLen}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{filter:"drop-shadow(0 0 6px rgba(0,170,255,.6))"}}/>
      <text x="50%" y="46%" textAnchor="middle" fill="#f4f8ff" fontSize="13" fontWeight="900" fontFamily="'JetBrains Mono',monospace">{Math.round(hero)}%</text>
      <text x="50%" y="62%" textAnchor="middle" fill="#8ea4c7" fontSize="7" fontFamily="Inter,sans-serif">HERO</text>
    </svg>
  );
}

function SolverSummaryCard({scenario,mode,stackHero,stackVillain,effective,math,equityHero,villainActionEff,onReset}){
  const modeLabel=(SOLVER_MODES.find(m=>m.id===mode)||{}).l||mode.toUpperCase();
  return(
    <div className="ss-card">
      <div className="ss-card-title">Résumé du spot</div>
      <div className="ss-summary-rows">
        <div className="ss-summary-row"><span>Stacks</span><strong>{stackHero}bb vs {stackVillain}bb</strong></div>
        <div className="ss-summary-row"><span>Stack effectif</span><strong>{effective}bb</strong></div>
        <div className="ss-summary-row"><span>Pot</span><strong>{math.pot}bb</strong></div>
        <div className="ss-summary-row"><span>SPR</span><strong>{math.spr}</strong></div>
        <div className="ss-summary-row"><span>Action Hero</span><strong>{ACTION_LABELS[scenario.action]||scenario.action} {scenario.heroPos}</strong></div>
        <div className="ss-summary-row"><span>Réponse {scenario.vsPos}</span><strong>{ACTION_LABELS[villainActionEff]||"Auto"}</strong></div>
        <div className="ss-summary-row"><span>Mode</span><strong>{modeLabel}</strong></div>
      </div>
      <div className="ss-equity-wrap">
        <SolverEquityDonut hero={equityHero}/>
        <div className="ss-equity-legend">
          <div style={{fontSize:8,color:"#8ea4c7",letterSpacing:".08em",fontWeight:800}}>ÉQUITÉ GLOBALE</div>
          <span style={{color:"#54b8ff"}}>{scenario.heroPos} <b style={{color:"#9fd4ff"}}>{Math.round(equityHero*10)/10}%</b></span>
          <span style={{color:"#b18cff"}}>{scenario.vsPos} <b style={{color:"#cdb2ff"}}>{Math.round((100-equityHero)*10)/10}%</b></span>
          <span style={{fontSize:8,color:"#8ea4c7",fontStyle:"italic"}}>Énumération réelle de combos</span>
        </div>
      </div>
      <button className="ss-btn" style={{marginTop:10,justifyContent:"center"}} onClick={onReset}>✎ Réinitialiser le spot</button>
    </div>
  );
}

function SolverQualityCard({cfr,busy}){
  const done=!!cfr;
  const conv=done?(cfr.complete?98:82):null;
  return(
    <div className="ss-card">
      <div className="ss-card-title">Qualité de la solution</div>
      {busy?(
        <div style={{fontSize:10,color:"#54b8ff",fontFamily:"Inter,sans-serif"}}>⏳ Calcul CFR en cours…</div>
      ):done?(
        <div className="ss-quality">
          <SolverEquityDonut hero={conv} size={72}/>
          <ul className="ss-quality-list" style={{margin:0,padding:0}}>
            <li>{cfr.complete?"Convergence atteinte":"Convergence partielle"}</li>
            <li>Itérations : {cfr.iters?.toLocaleString?.()||cfr.iters}</li>
            <li>Combos explorés : {(cfr.nH||0)+(cfr.nV||0)}</li>
            <li className={cfr.complete?"":"off"}>Runouts complets</li>
          </ul>
        </div>
      ):(
        <ul className="ss-quality-list" style={{margin:0,padding:0}}>
          <li className="off">CFR non lancé — mode heuristique</li>
          <li className="off">Précision : estimation</li>
          <li className="off">Lancer « Résoudre (CFR) » ci-dessus</li>
        </ul>
      )}
      <div style={{fontSize:8,color:"#8ea4c7",fontStyle:"italic",marginTop:8,fontFamily:"Inter,sans-serif"}}>
        CFR heuristique bêta — préflop/river simplifiés, pas un solver complet.
      </div>
    </div>
  );
}

function SolverInsightsCard({scenario,heroFreqs,mode,onAddNote}){
  const insights=useMemo(()=>buildSolverInsights(scenario,heroFreqs,mode),[scenario,heroFreqs,mode]);
  return(
    <div className="ss-card">
      <div className="ss-card-title">Insights & notes</div>
      <ul className="ss-insights" style={{margin:0,padding:0}}>
        {insights.map((t,i)=><li key={i}>{t}</li>)}
      </ul>
      <button className="ss-btn" style={{marginTop:6}} onClick={onAddNote}>＋ Ajouter une note</button>
    </div>
  );
}

function SolverGainsCard(){
  return(
    <div className="ss-card ss-gains">
      <div className="ss-card-title">Ce que tu gagneras</div>
      <ul style={{margin:0,padding:0}}>
        <li>Lecture complète du spot et des ranges.</li>
        <li>Décision optimale GTO et exploitable.</li>
        <li>Analyse détaillée des forces et faiblesses.</li>
        <li>Export & entraînement intégrés.</li>
      </ul>
      <img src="/assets/mental/neon-brain-card.jpg" alt="" draggable="false"/>
    </div>
  );
}

function SolverQuickActions({onGoTrainer,onGoReplayer,onExport,onSave,mode,setMode,onNodeLock}){
  return(
    <div className="ss-card">
      <div className="ss-card-title">Actions rapides</div>
      <div className="ss-actions">
        <button className="ss-btn primary" onClick={onGoTrainer}>🎯 Travailler ce spot dans l'entraîneur</button>
        <button className="ss-btn" onClick={onGoReplayer}>📤 Envoyer vers Replayer</button>
        <button className="ss-btn gold" onClick={onSave}>💾 Sauvegarder scénario</button>
        <button className="ss-btn" onClick={onExport}>📄 Exporter (JSON)</button>
        <button className="ss-btn violet" onClick={()=>setMode(mode==="exploit"?"gto":"exploit")}>⚖ Comparer GTO / Exploit</button>
        <button className="ss-btn violet" onClick={onNodeLock}>🔒 Node Lock <small>BÊTA</small></button>
      </div>
    </div>
  );
}


/* ═══ Arbre de décision V2 — ligne stratégique + Node Lock fonctionnel ═══ */

/* ── Arbre multi-street : noeuds Flop/Turn/River (CFR sur la street du board, projections heuristiques sinon) ── */
const SUIT_COL={"♥":"#ff4d6d","♦":"#ff9f43","♣":"#00e58a","♠":"#9fd4ff"};
function buildMultiStreetNodes({math,board,cfrResult,betFrac}){
  const bLen=board.length;
  const mdfFold=Math.min(78,Math.round(betFrac/(1+betFrac)*100*1.12+6));
  const cbetBase=cfrResult&&bLen<=3?cfrResult.heroBet:62;
  const defs=[
    {name:"Flop", verb:"C-bet", n:3, hero:cbetBase,                         vf:mdfFold,   vr:11},
    {name:"Turn", verb:"Barrel",n:4, hero:Math.round(cbetBase*0.72),        vf:mdfFold-4, vr:9},
    {name:"River",verb:"Bet",   n:5, hero:Math.round(cbetBase*0.55),        vf:mdfFold+4, vr:5},
  ];
  let pot=math.pot;
  return defs.map(d=>{
    const dec=cd=>({r:EQ_RANKVAL[cd>>2],s:"♠♥♦♣"[cd%4]});
    const streetCards=(d.n===3?board.slice(0,3):board.slice(d.n-1,d.n)).map(dec);
    const known=bLen>=d.n;
    const isCfrStreet=cfrResult&&((bLen<=3&&d.n===3)||(bLen===4&&d.n===4)||(bLen===5&&d.n===5));
    const hero=isCfrStreet?cfrResult.heroBet:d.hero;
    const vil=isCfrStreet
      ?{f:cfrResult.villFoldVsBetS,c:cfrResult.villCallVsBetS,r:cfrResult.villRaiseVsBetS}
      :{f:Math.max(0,d.vf),c:Math.max(0,100-d.vf-d.vr),r:d.vr};
    const node={name:d.name,verb:d.verb,cards:known?streetCards:null,hero,check:100-hero,vil,pot:Math.round(pot*10)/10,
      src:isCfrStreet?"CFR":"projection heuristique",cfr:!!isCfrStreet};
    pot=Math.round(node.pot*(1+2*betFrac)*10)/10; // pot de la street suivante si bet-call
    return node;
  });
}
function SolverDecisionTreeV2({scenario,mode,pac,stats,evByBucket,heroFreqs,villainFreqs,villainAggBase,nodeLock,setNodeLock,nodeLockOpen,setNodeLockOpen,filterAction,setFilterAction,math,cfrResult,board=[],betFrac=0.66}){
  const agg=useMemo(()=>villainAggOf(villainFreqs),[villainFreqs]);
  const [draft,setDraft]=useState(null);
  const [streetDepth,setStreetDepth]=useState(5); // 0=préflop seul · 3/4/5 = profondeur
  const cur=draft||nodeLock||{f:villainAggBase.f,c:villainAggBase.c,r:villainAggBase.r};
  function setPart(k,v){
    v=Math.max(0,Math.min(100,Number(v)||0));
    const others=["f","c","r"].filter(x=>x!==k);
    const rest=Math.max(0,100-v);
    const oSum=cur[others[0]]+cur[others[1]];
    const next={...cur,[k]:v,
      [others[0]]:oSum>0?Math.round(cur[others[0]]/oSum*rest*10)/10:rest/2,
      [others[1]]:oSum>0?Math.round(cur[others[1]]/oSum*rest*10)/10:rest/2};
    setDraft(next);
  }
  const advice=nodeLock?nodeLockAdvice(villainAggBase,nodeLock,math.pot):null;
  const vLabel=(ACTION_LABELS[scenario.action]||"")==="Open"?"3bet":"Raise";
  const nodes=[
    {k:"f",label:`${scenario.vsPos} Fold`,col:"#8ea4c7",pct:agg.f,sub:`gain immédiat +${math.pot}bb`},
    {k:"c",label:`${scenario.vsPos} Call`,col:"#00aaff",pct:agg.c,sub:`${Math.round(agg.combos*agg.c/100)} combos`},
    {k:"r",label:`${scenario.vsPos} ${vLabel}`,col:"#7c3cff",pct:agg.r,sub:`${Math.round(agg.combos*agg.r/100)} combos`},
  ];
  return(
    <div className="ss-card">
      <div className="ss-card-title" style={{justifyContent:"space-between"}}>
        <span style={{display:"flex",alignItems:"center",gap:7}}>Arbre de décision</span>
        <button className="ss-btn violet" style={{width:"auto",padding:"3px 8px",fontSize:8}}
          onClick={()=>{setNodeLockOpen(!nodeLockOpen);setDraft(null);}}>
          🔒 Node Lock{nodeLock?" ●":""}
        </button>
      </div>
      <div style={{textAlign:"center",marginBottom:8}}>
        <div style={{display:"inline-block",padding:"6px 14px",borderRadius:9,background:"rgba(0,229,138,.12)",border:"1px solid rgba(0,229,138,.5)",fontFamily:"'Space Grotesk',sans-serif",fontSize:10.5,fontWeight:900,color:"#7dffc8"}}>
          {scenario.heroPos} {ACTION_LABELS[scenario.action]||scenario.action} · {stats.raisedPct}% ({stats.raisedCombos} combos) · EV {evByBucket.r>=0?"+":""}{evByBucket.r}bb
        </div>
        <div style={{color:"#3d5a80",fontSize:11,lineHeight:"10px"}}>▼</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {nodes.map(n=>(
          <div key={n.k} onClick={()=>setFilterAction(filterAction===n.k?"all":n.k)}
            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,cursor:"pointer",
              background:filterAction===n.k?`${n.col}22`:"#081527",border:`1px solid ${filterAction===n.k?n.col:"rgba(0,180,255,.18)"}`,transition:"all .12s"}}>
            <div style={{width:9,height:9,borderRadius:3,background:n.col,flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:700,color:"#f4f8ff",fontFamily:"Inter,sans-serif",flex:1}}>{n.label}</span>
            <span style={{fontSize:8.5,color:"#8ea4c7",fontFamily:"Inter,sans-serif"}}>{n.sub}</span>
            <span style={{fontSize:11,fontWeight:900,fontFamily:"'JetBrains Mono',monospace",color:n.col,minWidth:44,textAlign:"right"}}>{n.pct}%</span>
          </div>
        ))}
      </div>
      {nodeLock&&<div style={{marginTop:6,fontSize:8.5,color:"#cdb2ff",fontFamily:"Inter,sans-serif"}}>🔒 Lock actif — cible F {Math.round(nodeLock.f)}% / C {Math.round(nodeLock.c)}% / R {Math.round(nodeLock.r)}%{Math.abs(agg.f-nodeLock.f)>1.5?` · atteint ${agg.f}% (mains pures conservées)`:""} · base GTO F {villainAggBase.f}%</div>}
      {/* ── Multi-street ── */}
      <div style={{display:"flex",gap:4,margin:"8px 0 6px",flexWrap:"wrap"}}>
        {[["Préflop",0],["Flop",3],["Turn",4],["River",5],["Multi",5]].map(([l,d],i)=>(
          <button key={l} onClick={()=>setStreetDepth(l==="Multi"?5:d)}
            style={{padding:"3px 9px",borderRadius:6,fontSize:8,fontWeight:800,cursor:"pointer",fontFamily:"'Space Grotesk',sans-serif",letterSpacing:".04em",
              border:`1px solid ${(l==="Multi"&&streetDepth===5&&i===4)||streetDepth===d&&l!=="Multi"?"#00aaff":"rgba(0,180,255,.22)"}`,
              background:streetDepth===d?"rgba(0,170,255,.14)":"#081527",color:streetDepth===d?"#9fd4ff":"#8ea4c7"}}>{l}</button>
        ))}
      </div>
      {streetDepth>0&&buildMultiStreetNodes({math,board,cfrResult,betFrac}).filter(n=>({Flop:3,Turn:4,River:5})[n.name]<=streetDepth).map(n=>(
        <div key={n.name}>
          <div style={{textAlign:"center",margin:"2px 0",color:"#3d5a80",fontSize:11,lineHeight:"10px"}}>▼</div>
          <div style={{padding:"7px 10px",borderRadius:8,background:"#081527",border:`1px solid ${n.cfr?"rgba(124,60,255,.4)":"rgba(0,180,255,.16)"}`,fontFamily:"Inter,sans-serif",fontSize:9,color:"#c9dcf5",lineHeight:1.55}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <b style={{color:"#9fd4ff",fontSize:9.5}}>{n.name}</b>
              {n.cards?<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:800}}>{n.cards.map((c,k)=><span key={k} style={{color:SUIT_COL[c.s]||"#9fd4ff",marginRight:3}}>{c.r}{c.s}</span>)}</span>
                :<span style={{color:"#5d738f",fontStyle:"italic",fontSize:8}}>carte non saisie</span>}
              <span style={{marginLeft:"auto",fontSize:7.5,fontWeight:900,padding:"1px 6px",borderRadius:4,
                border:`1px solid ${n.cfr?"rgba(124,60,255,.55)":"rgba(141,164,199,.35)"}`,color:n.cfr?"#cdb2ff":"#8ea4c7"}}>{n.src}</span>
            </div>
            {scenario.vsPos} call → <b style={{color:"#00e58a"}}>{n.verb} {n.hero}%</b> · Check {n.check}%
            <span style={{color:"#5d738f"}}> · pot ~{n.pot}bb</span><br/>
            vs {n.verb.toLowerCase()} : Fold <b>{n.vil.f}%</b> · Call <b>{n.vil.c}%</b> · Raise <b>{n.vil.r}%</b>
          </div>
        </div>
      ))}
      {streetDepth>0&&!cfrResult&&(
        <div style={{marginTop:5,fontSize:8,color:"#8ea4c7",fontStyle:"italic",fontFamily:"Inter,sans-serif"}}>
          💡 Lance « Résoudre (CFR) » pour remplacer la street du board par un calcul réel.
        </div>
      )}
      {nodeLockOpen&&(
        <div style={{marginTop:8,padding:"9px 10px",borderRadius:9,background:"rgba(124,60,255,.08)",border:"1px solid rgba(124,60,255,.4)"}}>
          <div style={{fontSize:8.5,fontWeight:900,color:"#cdb2ff",letterSpacing:".06em",marginBottom:6,fontFamily:"'Space Grotesk',sans-serif"}}>NODE LOCK — RÉPONSE {scenario.vsPos} (bêta)</div>
          <div style={{display:"flex",gap:8}}>
            {[["f","Fold"],["c","Call"],["r",vLabel]].map(([k,l])=>(
              <label key={k} style={{flex:1,fontSize:8,color:"#8ea4c7",fontFamily:"Inter,sans-serif"}}>{l} %
                <input type="number" min="0" max="100" step="1" value={Math.round(cur[k])}
                  onChange={e=>setPart(k,e.target.value)}
                  style={{width:"100%",marginTop:3,padding:"5px 6px",borderRadius:7,border:"1px solid rgba(124,60,255,.45)",background:"#0a1224",color:"#f4f8ff",fontFamily:"'JetBrains Mono',monospace",fontSize:11,boxSizing:"border-box"}}/>
              </label>
            ))}
          </div>
          <div style={{display:"flex",gap:7,marginTop:8}}>
            <button className="ss-btn primary" style={{flex:1,justifyContent:"center",padding:"6px"}}
              onClick={()=>{setNodeLock({f:cur.f,c:cur.c,r:cur.r});setDraft(null);}}>Appliquer</button>
            <button className="ss-btn" style={{flex:1,justifyContent:"center",padding:"6px"}}
              onClick={()=>{setNodeLock(null);setDraft(null);}}>Réinitialiser (GTO)</button>
          </div>
          {advice&&<div style={{marginTop:8,fontSize:9,color:advice.col,fontFamily:"Inter,sans-serif",lineHeight:1.5}}>💡 {advice.txt}</div>}
          <div style={{marginTop:5,fontSize:7.5,color:"#8ea4c7",fontStyle:"italic",fontFamily:"Inter,sans-serif"}}>La range Vilain est re-pondérée main par main — équité, fold equity et matrices se recalculent (heuristique).</div>
        </div>
      )}
      <div style={{fontSize:8,color:"#5d738f",fontFamily:"Inter,sans-serif",marginTop:7,fontStyle:"italic"}}>Clique une branche pour filtrer les matrices · estimations heuristiques</div>
    </div>
  );
}

function SolverFooterBar({mode,validation}){
  const modeLabel=(SOLVER_MODES.find(m=>m.id===mode)||{}).l||mode.toUpperCase();
  return(
    <div className="ss-footer">
      <span><span className="dot"/>Données à jour</span>
      <span>Base : <b>heuristique PokerForge</b> · équité par énumération</span>
      <span style={{marginLeft:"auto"}}>Précision : <b>{validation&&!validation.ok?"spot à corriger":"estimation"}</b></span>
      <span>Mode : <b>{modeLabel}</b></span>
    </div>
  );
}

/* ── SolveID déterministe (reproductibilité minimale, §15) ──
   Même spot (positions, action, mode, stack, board) → même ID. */
function makeSolveId(scenario,board,mode,effective){
  const raw=`${scenario.heroPos}|${scenario.vsPos}|${scenario.action}|${mode}|${effective}|${(board||[]).join(",")}|${scenario.street||""}`;
  let h=0;for(let i=0;i<raw.length;i++){h=(h*31+raw.charCodeAt(i))>>>0;}
  return "SHK-"+h.toString(16).toUpperCase().padStart(8,"0").slice(0,8);
}
function fmtIters(n){
  if(!n||n<1000)return String(n||0);
  if(n<1e6)return (n/1e3).toFixed(n<1e4?1:0)+"K";
  if(n<1e9)return (n/1e6).toFixed(n<1e7?1:0)+"M";
  return (n/1e9).toFixed(1)+"Md";
}
/* Type de pot depuis l'action (§34 "Spot"). */
function spotPotType(action){
  if(action==="rfi")return"RFI";
  if(action==="vs_open")return"SRP";
  if(action==="vs_3bet")return"3BP";
  if(action==="cbet_ip"||action==="vs_bet")return"SRP";
  return"SRP";
}
/* ── BARRE DE CONTEXTE SUPÉRIEURE (§34) — HONNÊTE.
   Tant qu'aucun CFR n'a tourné, on n'invente PAS d'itérations / NashConv :
   la provenance par défaut est HEURISTIQUE (§2, §58). ── */
function SolverTopBar({mode,format,scenario,effective,solveId,cfrResult,resultSource}){
  const meta=resultMeta(resultSource);
  // « solved » = la stratégie CFR est RÉELLEMENT affichée (pas seulement calculée en
  // arrière-plan). Sinon on affiche l'heuristique → badge/itérations honnêtes.
  const solved=isCalculated(resultSource)&&!!cfrResult;
  const modeLabel={gto:"GTO",exploit:"Exploit",icm:"ICM",pko:"PKO",chipev:"ChipEV"}[mode]||"GTO";
  const iterN=solved?cfrResult.iters*(cfrResult.nH+cfrResult.nV):0;
  const cell=(label,value,valueColor)=>(
    <div className="ss-tb-cell">
      <span className="ss-tb-label">{label}</span>
      <span className="ss-tb-value" style={valueColor?{color:valueColor}:undefined}>{value}</span>
    </div>
  );
  return(
    <div className="ss-topbar">
      <div className="ss-tb-brand">SHARK SOLVER <span className="ss-tb-core">CORE V1</span></div>
      {cell("Mode",modeLabel)}
      {cell("Format",format==="Cash"?"Cash 6Max":format)}
      {cell("Street",scenario.street||"Preflop")}
      {cell("Spot",spotPotType(scenario.action))}
      {cell("Stacks (eff.)",effective+"bb")}
      <div className="ss-tb-sep"/>
      {cell("Solve ID",solveId)}
      {/* Provenance globale — badge honnête (heuristique par défaut) */}
      <div className="ss-tb-cell">
        <span className="ss-tb-label">Confiance</span>
        <span className="ss-tb-badge" style={{color:meta.color,borderColor:meta.color,boxShadow:`0 0 10px ${meta.glow}`}}>{meta.short}</span>
      </div>
      {cell("Itérations",solved?fmtIters(iterN):"—")}
      {/* NashConv/exploitabilité : borne réelle calculée par le Convergence Engine (§14). */}
      {cell("NashConv",solved?"≈"+cfrResult.exploitBb+" bb":"—",solved?"#8ea4c7":undefined)}
    </div>
  );
}
/* ── LÉGENDE DE PROVENANCE (§52) — nature de l'info, PAS les actions poker.
   Code couleur distinct du code couleur d'action (§58). ── */
function SolverProvenanceLegend({activeSource,precision,modeLabel}){
  return(
    <div className="ss-footer ss-prov-legend">
      {RESULT_SOURCE_LEGEND.map(src=>{
        const m=resultMeta(src);const on=src===activeSource;
        return(
          <span key={src} className="ss-prov-item" style={on?{opacity:1}:{opacity:.55}}>
            <span className="ss-prov-dot" style={{background:m.color,boxShadow:on?`0 0 7px ${m.color}`:"none"}}/>
            <b style={{color:on?m.color:"#c9dcf5"}}>{m.label}</b>
          </span>
        );
      })}
      <span style={{marginLeft:"auto"}}>Précision : <b>{precision}</b></span>
      <span>Mode : <b>{modeLabel}</b></span>
    </div>
  );
}

/* ── STRATÉGIE — FRÉQUENCES (§41) : gros blocs lisibles, code couleur ACTION.
   Badge de provenance (HEUR / CFR) — n'affiche que les actions réelles (§40). ── */
function SolverStrategyPanel({blocks,source,evTotal}){
  const meta=resultMeta(source);
  return(
    <div className="ss-card2 ss-strat">
      <div className="ss-card2-head">
        <span className="ss-panel-title">STRATÉGIE — FRÉQUENCES (HERO)</span>
        <span className="ss-src-tag" style={{color:meta.color,borderColor:meta.color,boxShadow:`0 0 10px ${meta.glow}`}}>{meta.label}</span>
      </div>
      <div className="ss-freq-blocks" style={{gridTemplateColumns:`repeat(${blocks.length},1fr)`}}>
        {blocks.map(b=>(
          <div key={b.id} className="ss-freq-block" style={{background:`linear-gradient(180deg,${b.color}22,${b.color}08)`,borderColor:`${b.color}66`}}>
            <span className="ss-freq-label" style={{color:b.color}}>{b.label}</span>
            <span className="ss-freq-pct">{b.pct}%</span>
          </div>
        ))}
      </div>
      <div className="ss-freq-ev" style={{gridTemplateColumns:`110px repeat(${blocks.length},1fr)`}}>
        <div className="ss-freq-evcell ss-freq-evtot"><span>EV total (pondéré)</span><b style={{color:evTotal>=0?"#10D87A":"#FF5D6C"}}>{evTotal>=0?"+":""}{evTotal} bb</b></div>
        {blocks.map(b=>(
          <div key={b.id} className="ss-freq-evcell">
            <span>EV {b.label}</span>
            <b style={{color:b.ev==null?"#7f97ba":b.ev>=0?"#10D87A":"#FF5D6C"}}>{b.ev==null?"—":(b.ev>=0?"+":"")+b.ev+" bb"}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
/* ── STATUT DU SOLVE (§44) — HONNÊTE : itérations réelles si CFR lancé ; les
   métriques de convergence (NashConv, exploitability) restent « n/d » tant que
   le Convergence Engine (§14) n'existe pas. Jamais de 98% inventé (§58). ── */
function SolverSolveStatus({source,cfrResult}){
  const solved=isCalculated(source)&&!!cfrResult;
  const meta=resultMeta(source);
  const iterN=cfrResult?cfrResult.iters*(cfrResult.nH+cfrResult.nV):0;
  // Métriques RÉELLES issues du Convergence Engine (§14) — plus de « n/d ».
  const rows=[
    ["Itérations",solved?fmtIters(iterN):"—"],
    ["Stabilité strat.",solved?cfrResult.stability+" %":"—"],
    ["Regret moyen",solved?cfrResult.avgRegret+" bb":"—"],
    ["Exploit. (borne)",solved?"≈ "+cfrResult.exploitBb+" bb":"—"],
    ["Solveur",solved?"CFR+":"—"],
    ["Précision",solved?"1-street HU":"Heuristique"],
    ["Status",solved?(cfrResult.convStatus||"Résolu"):"Non lancé"],
  ];
  return(
    <div className="ss-card2 ss-solvestat">
      <div className="ss-card2-head"><span className="ss-panel-title">STATUT DU SOLVE</span></div>
      <div className="ss-conv">
        <div className="ss-conv-ring" style={{borderColor:solved?"#34B4FF":"#2a3a55",boxShadow:solved?"0 0 18px rgba(52,180,255,.35)":"none"}}>
          <span className="ss-conv-txt" style={{color:solved?"#9fd4ff":"#6a7690",fontSize:solved?16:14}}>{solved?cfrResult.stability+"%":"Idle"}</span>
          <span className="ss-conv-sub">{solved?"stabilité":"heuristique"}</span>
        </div>
        <div className="ss-conv-rows">
          {rows.map(([k,v])=>(
            <div key={k} className="ss-conv-row"><span>{k}</span><b style={k==="Status"?{color:solved?"#10D87A":"#FFB020"}:undefined}>{v}</b></div>
          ))}
        </div>
      </div>
      <div className="ss-conv-note">{solved?"Stabilité & regret calculés par le Convergence Engine (§14). Exploitabilité = borne sup. estimée depuis le regret moyen.":"Lance « Résoudre (CFR) » (panneau Solveur CFR) pour une stratégie calculée."}</div>
    </div>
  );
}

/* ── SOURCE DU RÉSULTAT (§46) — panneau critique : la provenance de CHAQUE
   valeur affichée, sans ambiguïté. Utilise le module provenance central. ── */
function SolverResultSourcePanel({strategySource,equitySource}){
  const s=resultMeta(strategySource),e=resultMeta(equitySource);
  const rows=[{k:"Stratégie / Fréquences",m:s},{k:"Équité (vs range)",m:e},{k:"EV par action",m:s}];
  return(
    <div className="ss-card ss-resultsrc">
      <div className="ss-panel-title" style={{marginBottom:9}}>⬡ SOURCE DU RÉSULTAT</div>
      {rows.map((r,i)=>(
        <div key={i} className="ss-rsrc-row">
          <span className="ss-rsrc-k">{r.k}</span>
          <span className="ss-src-tag" style={{color:r.m.color,borderColor:r.m.color,boxShadow:`0 0 8px ${r.m.glow}`}}>{r.m.label}</span>
        </div>
      ))}
      <div className="ss-rsrc-desc" style={{borderColor:s.color+"55",background:s.color+"0d"}}>
        <b style={{color:s.color}}>{s.label}</b> — {s.desc}
      </div>
    </div>
  );
}
/* ── RÉSULTAT DU SPOT (§45) — distingue clairement ÉQUITÉ (part du pot à
   l'abattage) et EV (gain espéré de l'action). Ce ne sont PAS la même chose. ── */
function SolverSpotResultPanel({equityHero,equityVillain,foldEquity,math,evTotal,strategySource}){
  const meta=resultMeta(strategySource);
  const cell=(label,value,color)=>(
    <div className="ss-res-cell"><span>{label}</span><b style={color?{color}:undefined}>{value}</b></div>
  );
  return(
    <div className="ss-card">
      <div className="ss-panel-title" style={{marginBottom:9}}>🎯 RÉSULTAT DU SPOT</div>
      <div className="ss-res-grid">
        {cell("Equity Hero",equityHero+"%","#34B4FF")}
        {cell("Equity Villain",equityVillain+"%","#9B5CFF")}
        {cell("Fold Equity",Math.round(foldEquity)+"%","#FFB020")}
        {cell(`EV Hero (${meta.short})`,(evTotal>=0?"+":"")+evTotal+" bb",evTotal>=0?"#10D87A":"#FF5D6C")}
        {cell("Pot actuel",(math?.pot??"—")+" bb")}
        {cell("Pot après action","—","#7f97ba")}
      </div>
      <div className="ss-res-note"><b>Équité</b> = part du pot à l'abattage · <b>EV</b> = gain espéré de l'action. Ce ne sont pas la même chose.</div>
    </div>
  );
}

export default function SharkSolverTab({initialScenario=null,onGoTrainer=null,onGoReplayer=null,onInitialApplied=null}={}){
  const[scenario,setScenarioRaw]=useState(initialScenario||SOLVER_SCENARIOS[0]);
  const[mode,setMode]=useState(scenario.icmParams?"icm":scenario.pkoParams?"pko":"gto");
  const[exploitProfileId,setExploitProfileId]=useState(EXPLOIT_PROFILES[0].id);
  const[icmParams,setIcmParams]=useState(scenario.icmParams||null);
  const[pkoParams,setPkoParams]=useState(scenario.pkoParams||null);
  const[format,setFormat]=useState("Cash");
  const[potType,setPotType]=useState(()=>{
    const pt=SOLVER_POT_TYPES.find(p=>p.action===scenario.action);
    return pt?pt.id:"srp";
  });
  const[selectedCell,setSelectedCell]=useState(null);
  const[hoveredCell,setHoveredCell]=useState(null);
  const[filterAction,setFilterAction]=useState("all");
  const[detailsTab,setDetailsTab]=useState("Fréquences");
  const[showParams,setShowParams]=useState(false);
  const[notes,setNotes]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("pf_solver_notes"))||[];}catch{return[];}
  });
  const[showNoteForm,setShowNoteForm]=useState(false);
  const[savedSpots,setSavedSpots]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("pf_custom_spots"))||[];}catch{return[];}
  });
  const[showCustomForm,setShowCustomForm]=useState(false);
  const[newSpot,setNewSpot]=useState({title:"",hero:"BTN",vs:"BB",action:"rfi",stack:100,note:""});
  const[mobileMatrixTab,setMobileMatrixTab]=useState("hero");

  /* ── Config indépendante Hero / Vilain + stacks + pot ── */
  const initStack=scenario.stack||100;
  const[stackHero,setStackHero]=useState(initStack);
  const[stackVillain,setStackVillain]=useState(initStack);
  const[blinds,setBlinds]=useState(1);
  const[antes,setAntes]=useState(0);
  const[potOverride,setPotOverride]=useState(null);
  const[heroMode,setHeroMode]=useState("range");
  const[heroHand,setHeroHand]=useState("");
  const[villainMode,setVillainMode]=useState("range");
  const[villainHand,setVillainHand]=useState("");
  const[villainAction,setVillainAction]=useState(null); // null = action déduite de Hero
  const[boardInput,setBoardInput]=useState("");
  const[cfrBetFrac,setCfrBetFrac]=useState(0.66);
  const[cfrResult,setCfrResult]=useState(null);
  const[cfrSource,setCfrSource]=useState(ResultSource.CFR_SOLVE); // CFR_SOLVE ou PRESOLVED_LIBRARY (§16)
  const[cfrBusy,setCfrBusy]=useState(false);
  const[cfrOverlay,setCfrOverlay]=useState(false);
  const[nodeLock,setNodeLock]=useState(null);      // {f,c,r} agrégats verrouillés (Node Lock)
  const[nodeLockOpen,setNodeLockOpen]=useState(false);

  const heroParse=useMemo(()=>heroHand?parseHandToken(heroHand):null,[heroHand]);
  const villainParse=useMemo(()=>villainHand?parseHandToken(villainHand):null,[villainHand]);
  const boardParse=useMemo(()=>parseBoardToken(boardInput),[boardInput]);
  /* Un résultat CFR ne vaut que pour le board sur lequel il a été calculé */
  useEffect(()=>{setCfrResult(null);setCfrOverlay(false);},[boardInput]);
  const board=boardParse.valid?boardParse.cards:[];

  function resetSelection(){
    setSelectedCell(null);
    setHoveredCell(null);
    setFilterAction("all");
  }

  function selectScenario(sc){
    setScenarioRaw(sc);
    resetSelection();
    setIcmParams(sc.icmParams||null);
    setPkoParams(sc.pkoParams||null);
    const s=sc.stack||100;
    setStackHero(s);
    setStackVillain(s);
    setHeroMode("range");setVillainMode("range");
    setHeroHand("");setVillainHand("");
    setVillainAction(null);
    setCfrResult(null);setCfrOverlay(false);
    setNodeLock(null);setNodeLockOpen(false);
    setMode(m=>{
      if(sc.icmParams)return"icm";
      if(sc.pkoParams)return"pko";
      if(m==="icm"||m==="pko")return"gto";
      return m;
    });
  }

  useEffect(()=>{
    if(initialScenario){
      selectScenario(initialScenario);
      onInitialApplied&&onInitialApplied();
    }
  },[initialScenario]);

  function onUpdateScenario(patch){
    setScenarioRaw(sc=>{
      const merged={...sc,...patch};
      merged.id="live-"+merged.heroPos+"-"+merged.action+"-"+merged.vsPos+"-"+merged.stack;
      merged.label=`${merged.heroPos} ${ACTION_LABELS[merged.action]||merged.action} vs ${merged.vsPos}`;
      merged.street=(merged.action==="cbet_ip"||merged.action==="vs_bet")?(sc.street&&sc.street!=="Preflop"?sc.street:"Flop"):"Preflop";
      return merged;
    });
    setSelectedCell(null);
  }

  /* Synchronise le sélecteur "Type de pot" avec l'action courante du scénario */
  useEffect(()=>{
    const current=SOLVER_POT_TYPES.find(p=>p.id===potType);
    if(!current||current.action!==scenario.action){
      const pt=SOLVER_POT_TYPES.find(p=>p.action===scenario.action);
      setPotType(pt?pt.id:"srp");
    }
  },[scenario.action]);

  /* Initialise des paramètres ICM/PKO par défaut quand on bascule sur ces modes sans données */
  useEffect(()=>{
    if(mode==="icm"&&!icmParams){
      setIcmParams({playersLeft:9,paid:9,heroStack:scenario.stack||25,avgStack:scenario.stack||25,payouts:[]});
    }
    if(mode==="pko"&&!pkoParams){
      setPkoParams({heroBounty:0,villainBounty:0,avgBounty:0,effectiveStack:scenario.stack||15,coverage:1});
    }
  },[mode]);

  /* Stack effectif = min(Hero, Vilain) → pilote le recalcul des ranges */
  const effective=Math.max(1,Math.min(stackHero||0,stackVillain||0));
  const stack=effective;

  /* Garde scenario.stack synchronisé sur le stack effectif (EV, panneaux, labels) */
  useEffect(()=>{
    setScenarioRaw(sc=>sc.stack===effective?sc:{...sc,stack:effective});
  },[effective]);

  /* Action Vilain : indépendante si choisie, sinon réponse déduite de l'action Hero */
  const villainActionEff=villainAction||VILLAIN_ACTION_MAP[scenario.action]||"vs_open";

  /* ── Fréquences de base (heuristique GTO), recalculées sur le stack effectif ── */
  const heroFreqsBase=useMemo(()=>buildSolverFreqs(scenario.heroPos,scenario.action,effective,scenario.vsPos),[scenario.heroPos,scenario.action,scenario.vsPos,effective]);
  const villainFreqsBase=useMemo(()=>buildSolverFreqs(scenario.vsPos,villainActionEff,effective,scenario.heroPos),[scenario.vsPos,villainActionEff,scenario.heroPos,effective]);

  const exploitProfile=useMemo(()=>EXPLOIT_PROFILES.find(p=>p.id===exploitProfileId)||EXPLOIT_PROFILES[0],[exploitProfileId]);

  /* ── Ajustements selon le mode actif ── */
  const heroExploit=useMemo(()=>mode==="exploit"?applyExploitAdjustment(heroFreqsBase,exploitProfile,scenario):null,[mode,heroFreqsBase,exploitProfile,scenario]);
  const villainExploit=useMemo(()=>mode==="exploit"?applyExploitAdjustment(villainFreqsBase,exploitProfile,scenario):null,[mode,villainFreqsBase,exploitProfile,scenario]);
  const icmResult=useMemo(()=>mode==="icm"?applyICMAdjustment(heroFreqsBase,icmParams,scenario):null,[mode,heroFreqsBase,icmParams,scenario]);
  const pkoResult=useMemo(()=>mode==="pko"?applyPKOAdjustment(heroFreqsBase,pkoParams,scenario):null,[mode,heroFreqsBase,pkoParams,scenario]);

  const heroFreqs=heroExploit?heroExploit.freqs:icmResult?icmResult.freqs:pkoResult?pkoResult.freqs:heroFreqsBase;
  const villainFreqsPreLock=villainExploit?villainExploit.freqs:villainFreqsBase;
  const villainAggBase=useMemo(()=>villainAggOf(villainFreqsPreLock),[villainFreqsPreLock]);
  const villainFreqs=useMemo(()=>nodeLock?applyNodeLockToFreqs(villainFreqsPreLock,nodeLock):villainFreqsPreLock,[villainFreqsPreLock,nodeLock]);
  const exploitDetails=heroExploit?heroExploit.details:null;

  const pac=useMemo(()=>primaryActionColor(scenario,mode),[scenario,mode]);
  const villainPac=useMemo(()=>primaryActionColor({...scenario,heroPos:scenario.vsPos,vsPos:scenario.heroPos,action:villainActionEff,stack:effective},mode),[scenario,mode,villainActionEff,effective]);

  /* ── Stats globales (combo-weighted) sur la range Hero ── */
  const stats=useMemo(()=>{
    let total=0,raised=0,called=0,folded=0;
    Object.entries(heroFreqs).forEach(([k,f])=>{
      const combos=k.length===2?6:k.endsWith("s")?4:12;
      total+=combos;
      raised+=combos*((f.r||0)/100);
      called+=combos*((f.c||0)/100);
      folded+=combos*((f.f||0)/100);
    });
    return{
      totalCombos:Math.round(total),
      raisedCombos:Math.round(raised),
      calledCombos:Math.round(called),
      foldedCombos:Math.round(folded),
      raisedPct:total?Math.round(raised/total*100):0,
      calledPct:total?Math.round(called/total*100):0,
      foldedPct:total?Math.round(folded/total*100):0,
    };
  },[heroFreqs]);

  /* ── EV agrégées par bucket (Open/Raise, Call, Fold) — estimation heuristique ── */
  const evByBucket=useMemo(()=>{
    const acc={r:{sum:0,w:0},c:{sum:0,w:0}};
    Object.entries(heroFreqs).forEach(([k,f])=>{
      const combos=k.length===2?6:k.endsWith("s")?4:12;
      const extra={
        riskPremium:icmResult?icmResult.riskPremium:undefined,
        bountyEV:mode==="pko"?pkoEvBreakdown(k,f,pkoParams,stack).bountyEV:undefined,
        evDelta:exploitDetails?exploitDetails[k]?.evDelta:undefined,
      };
      ["r","c"].forEach(b=>{
        const w=combos*((f[b]||0)/100);
        if(w<=0)return;
        const fb=b==="r"?f:{r:0,c:100,f:0};
        acc[b].sum+=estimateEV(k,fb,"hero",stack,mode,extra)*w;
        acc[b].w+=w;
      });
    });
    return{
      r:acc.r.w?Math.round(acc.r.sum/acc.r.w*100)/100:0,
      c:acc.c.w?Math.round(acc.c.sum/acc.c.w*100)/100:0,
      f:0,
    };
  },[heroFreqs,scenario,mode,icmResult,pkoParams,exploitDetails,stack]);

  /* ── Blocs de STRATÉGIE (§41) — actions RÉELLES du moteur, honnêtes (§40).
     Défaut = buckets heuristiques (pac / Call / Fold). Après CFR (overlay) =
     Check / Bet small / Bet big réellement résolus. Jamais un sizing inventé. ── */
  const strategyBlocks=useMemo(()=>{
    if(cfrOverlay&&cfrResult){
      return[
        {id:"check",label:"Check",pct:cfrResult.heroCheck,color:"#34B4FF",ev:null},
        {id:"bets",label:`Bet ${cfrResult.betSPct}%`,pct:cfrResult.heroBetS,color:"#10D87A",ev:null},
        {id:"betb",label:`Bet ${cfrResult.betBPct}%`,pct:cfrResult.heroBetB,color:"#FF8A3D",ev:null},
      ];
    }
    const b=[{id:"r",label:pac.label,pct:stats.raisedPct,color:pac.color,ev:evByBucket.r}];
    if(stats.calledPct>0)b.push({id:"c",label:"Call",pct:stats.calledPct,color:"#1F8BFF",ev:evByBucket.c});
    b.push({id:"f",label:"Fold",pct:stats.foldedPct,color:"#5a6a88",ev:0});
    return b;
  },[cfrOverlay,cfrResult,pac,stats,evByBucket]);
  // Provenance de la stratégie affichée : CFR_SOLVE (calculé) ou PRESOLVED_LIBRARY
  // (rechargé, §16) quand l'overlay CFR est actif ; sinon heuristique.
  const strategySource=(cfrOverlay&&cfrResult)?(cfrSource||ResultSource.CFR_SOLVE):ResultSource.HEURISTIC_ESTIMATE;
  const evTotalWeighted=(cfrOverlay&&cfrResult)?cfrResult.heroEV
    :Math.round((stats.raisedPct*evByBucket.r+stats.calledPct*evByBucket.c)/100*100)/100;

  /* ── Math du spot : pot, SPR, pot odds, MDF (sur stack effectif) ── */
  const math=useMemo(()=>spotMath(scenario.action,effective,blinds,antes,potOverride),[scenario.action,effective,blinds,antes,potOverride]);

  /* ── Équité Hero/Vilain — calcul RÉEL par énumération de combos (Monte-Carlo all-in) ── */
  const heroKey=heroMode==="hand"&&heroParse?.valid?heroParse.key:null;
  const villainKey=villainMode==="hand"&&villainParse?.valid?villainParse.key:null;
  const heroComboList=useMemo(()=>sideComboList(heroMode==="hand",heroParse,heroKey,heroFreqs),[heroMode,heroParse,heroKey,heroFreqs]);
  const villainComboList=useMemo(()=>sideComboList(villainMode==="hand",villainParse,villainKey,villainFreqs),[villainMode,villainParse,villainKey,villainFreqs]);
  // moins d'itérations quand une seule combo (main vs main) → précision suffisante et rapide
  // Équité : énumération EXACTE si le nombre de runouts est calculable, sinon
  // Monte-Carlo (§10). La provenance affichée (EXACT vs APPROXIMATION) en découle.
  const equityRes=useMemo(()=>computeEquity(heroComboList,villainComboList,board,{iters:2500}),[heroComboList,villainComboList,boardInput]);
  const equityHero=equityRes.equity;
  const equityVillain=100-equityHero;
  const equitySource=equityRes.source; // provenance fournie par la Solver API (§17)

  /* Équité de la main sélectionnée vs le camp Vilain (range ou main), sur le board courant */
  const selectedEquity=useMemo(()=>{
    if(!selectedCell)return null;
    const hList=(heroKey&&selectedCell.key===heroKey&&exactComboList(heroParse))||singleHandList(selectedCell.key);
    return computeEquity(hList,villainComboList,board,{iters:1800}).equity;
  },[selectedCell,heroKey,heroParse,villainComboList,boardInput]);
  const foldEquity=useMemo(()=>villainKey?(villainFreqs[villainKey]?.f||0):villainAggOf(villainFreqs).f,[villainKey,villainFreqs]);
  /* ── Lancement du moteur CFR (à la demande) ── */
  function runCFR(){
    setCfrBusy(true);
    setTimeout(()=>{
      try{
        // §17 : passe par la Solver API ; s.result garde la forme attendue (+ convergence).
        const s=solveSubgame(heroFreqs,villainFreqs,board,math.pot,cfrBetFrac,{maxCombos:50,iters:400,runouts:board.length===5?0:60});
        setCfrResult(s.result);setCfrSource(s.source); // §16 : CFR_SOLVE ou PRESOLVED_LIBRARY
      }catch(e){setCfrResult(null);}
      setCfrBusy(false);
    },30);
  }

  const combosAvail=useMemo(()=>continuingCombos(heroFreqs),[heroFreqs]);
  const combosBlocked=selectedCell?buildHandBlockers(selectedCell.key).reduce((a,b)=>a+b.count,0)
    :(heroKey?buildHandBlockers(heroKey).reduce((a,b)=>a+b.count,0):null);

  /* Sélectionne automatiquement la cellule correspondant à la main Hero saisie */
  useEffect(()=>{
    if(heroMode==="hand"&&heroParse?.valid){
      const k=heroParse.key;
      const i=RANKS.indexOf(k[0]),j=k.length===2?i:RANKS.indexOf(k[1]);
      const isPair=k.length===2,isSuited=k.endsWith("s");
      let ri,rj;
      if(isPair){ri=i;rj=i;}
      else if(isSuited){ri=Math.min(i,j);rj=Math.max(i,j);}
      else{ri=Math.max(i,j);rj=Math.min(i,j);}
      setSelectedCell({key:k,i:ri,j:rj,isPair,isSuited});
    }
  },[heroMode,heroParse]);

  /* Sélection manuelle d'une main depuis le panneau (édition) */
  function pickHand(token){
    const p=parseHandToken(token);
    if(!p.valid)return;
    const k=p.key;
    const i=RANKS.indexOf(k[0]),j=k.length===2?i:RANKS.indexOf(k[1]);
    const isPair=k.length===2,isSuited=k.endsWith("s");
    let ri,rj;
    if(isPair){ri=i;rj=i;}
    else if(isSuited){ri=Math.min(i,j);rj=Math.max(i,j);}
    else{ri=Math.max(i,j);rj=Math.min(i,j);}
    setSelectedCell({key:k,i:ri,j:rj,isPair,isSuited});
    if(heroMode==="hand")setHeroHand(token);
  }

  /* ── Validation du spot (détection "spot impossible" / données insuffisantes) ── */
  const validation=useMemo(()=>validateSpot({
    heroPos:scenario.heroPos,vsPos:scenario.vsPos,action:scenario.action,
    stack:effective,stackHero,stackVillain,pot:potOverride,blinds,antes,
    icmParams:mode==="icm"?icmParams:null,
    pkoParams:mode==="pko"?pkoParams:null,
  }),[scenario.heroPos,scenario.vsPos,scenario.action,effective,stackHero,stackVillain,potOverride,blinds,antes,mode,icmParams,pkoParams]);

  function onApplyFix(fix){
    if(!fix)return;
    const scPatch={};
    ["heroPos","vsPos","action"].forEach(k=>{if(fix[k]!=null)scPatch[k]=fix[k];});
    if(Object.keys(scPatch).length)onUpdateScenario(scPatch);
    if(fix.stack!=null){setStackHero(fix.stack);setStackVillain(fix.stack);}
    if(fix.stackHero!=null)setStackHero(fix.stackHero);
    if(fix.stackVillain!=null)setStackVillain(fix.stackVillain);
    if(fix.payouts&&icmParams)setIcmParams({...icmParams,payouts:fix.payouts});
    if(fix.heroBounty!=null){
      setPkoParams(p=>({...(p||{heroBounty:0,villainBounty:0,avgBounty:0,effectiveStack:scenario.stack||15,coverage:1}),heroBounty:fix.heroBounty}));
    }
  }

  /* ── Actions de la barre du bas ── */
  function onReset(){
    selectScenario(SOLVER_SCENARIOS[0]);
    setExploitProfileId(EXPLOIT_PROFILES[0].id);
    setFormat("Cash");
    setDetailsTab("Fréquences");
  }

  function onExport(){
    const data={
      scenario,mode,exploitProfileId,icmParams,pkoParams,
      heroFreqs,villainFreqs,stats,evByBucket,
      notes:notes.filter(n=>n.scenarioId===scenario.id),
      exportedAt:new Date().toISOString(),
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`shark-solver-${scenario.id}.json`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function onSave(){
    const spot={...scenario,id:"custom-"+Date.now(),label:scenario.label+" (sauvegardé)",note:""};
    const updated=[spot,...savedSpots];
    setSavedSpots(updated);
    localStorage.setItem("pf_custom_spots",JSON.stringify(updated));
  }

  function handleGoTrainer(){
    if(!onGoTrainer)return;
    onGoTrainer({heroPos:scenario.heroPos,vsPos:scenario.vsPos,action:scenario.action,stack:scenario.stack,street:scenario.street});
  }
  function handleGoReplayer(){
    if(!onGoReplayer)return;
    onGoReplayer({heroPos:scenario.heroPos,vsPos:scenario.vsPos,action:scenario.action,stack:scenario.stack});
  }

  const heroSizing=(()=>{
    if((scenario.action==="rfi"||scenario.action==="vs_open")&&stack<=20)return"";
    const sz=SOLVER_SIZINGS[scenario.action];
    return sz?sz.sizes[0]:"";
  })();

  const solveId=makeSolveId(scenario,board,mode,effective);
  // Provenance globale = celle de la stratégie RÉELLEMENT AFFICHÉE (overlay CFR ou
  // heuristique). Cohérente avec les blocs + le panneau Source du Résultat.
  const resultSourceTop=strategySource;
  const modeLabelTop={gto:"GTO",exploit:"Exploit",icm:"ICM",pko:"PKO",chipev:"ChipEV"}[mode]||"GTO";
  return(
    <div className="ss-page">
      <SolverTopBar
        mode={mode} format={format} scenario={scenario} effective={effective}
        solveId={solveId} cfrResult={cfrResult} resultSource={resultSourceTop}
      />

      <SolverModeBar
        scenario={scenario} onUpdateScenario={onUpdateScenario}
        mode={mode} setMode={setMode}
        exploitProfileId={exploitProfileId} setExploitProfileId={setExploitProfileId}
        icmParams={icmParams} setIcmParams={setIcmParams}
        pkoParams={pkoParams} setPkoParams={setPkoParams}
        format={format} setFormat={setFormat}
        potType={potType} setPotType={setPotType}
        validation={validation} onApplyFix={onApplyFix}
        showParams={showParams} setShowParams={setShowParams}
      />

      <div className="ss-body">
        <SolverSidebar
          scenario={scenario} setScenario={selectScenario} onResetCell={resetSelection}
          savedSpots={savedSpots} setSavedSpots={setSavedSpots}
          showCustomForm={showCustomForm} setShowCustomForm={setShowCustomForm}
          newSpot={newSpot} setNewSpot={setNewSpot}
          format={format}
          effective={effective} math={math} board={board}
          heroParse={heroParse} heroMode={heroMode} villainMode={villainMode}
          heroCombosN={heroComboList.length} villainCombosN={villainComboList.length}
          antes={antes}
        />

        <div className="ss-main">
          <SpotConfigPanel
            scenario={scenario} onUpdateScenario={onUpdateScenario}
            heroMode={heroMode} setHeroMode={setHeroMode} heroHand={heroHand} setHeroHand={setHeroHand} heroParse={heroParse}
            villainMode={villainMode} setVillainMode={setVillainMode} villainHand={villainHand} setVillainHand={setVillainHand} villainParse={villainParse}
            villainAction={villainAction} setVillainAction={setVillainAction}
            stackHero={stackHero} setStackHero={setStackHero} stackVillain={stackVillain} setStackVillain={setStackVillain}
          />
          {/* ── STRATÉGIE — FRÉQUENCES + STATUT DU SOLVE (§41, §44) ── */}
          <div className="ss-strat-row">
            <SolverStrategyPanel blocks={strategyBlocks} source={strategySource} evTotal={evTotalWeighted}/>
            <SolverSolveStatus source={strategySource} cfrResult={cfrOverlay?cfrResult:null}/>
          </div>
          <SpotStacksBar
            stackHero={stackHero} stackVillain={stackVillain}
            blinds={blinds} setBlinds={setBlinds} antes={antes} setAntes={setAntes}
            potOverride={potOverride} setPotOverride={setPotOverride} math={math}
            boardInput={boardInput} setBoardInput={setBoardInput} boardParse={boardParse}
          />
          <SolverStatsBar
            equityHero={equityHero} equityVillain={equityVillain} foldEquity={foldEquity}
            math={math} effective={effective} combosAvail={combosAvail} combosBlocked={combosBlocked}
            mode={mode} riskPremium={icmResult?.riskPremium} bountyFactor={pkoResult?.bountyFactor}
          />
          <SolverLegend pac={pac}/>

          <div className="shark-matrix-tabs" style={{display:"none",gap:6,marginBottom:8}}>
            <button className={`shark-matrix-tab${mobileMatrixTab==="hero"?" on":""}`} onClick={()=>setMobileMatrixTab("hero")}>HERO RANGE</button>
            <button className={`shark-matrix-tab${mobileMatrixTab==="villain"?" on":""}`} onClick={()=>setMobileMatrixTab("villain")}>VILLAIN RANGE</button>
          </div>
          <div className="ss-center">
            <div className={`ss-center-col shark-matrix-pane${mobileMatrixTab==="hero"?" shark-pane-active":""}`}>
              <SolverMatrixGrid
                title={heroMode==="hand"?"HERO — MAIN":"HERO RANGE"} posLabel={`${scenario.heroPos} — ${heroMode==="hand"&&heroParse?.valid?comboLabel(heroParse):pac.label+(heroSizing?" "+heroSizing:"")}`}
                freqs={heroFreqs} pac={pac} scenario={scenario} mode={mode} side="hero"
                selectedCell={selectedCell} setSelectedCell={setSelectedCell}
                hoveredCell={hoveredCell} setHoveredCell={setHoveredCell}
                filterAction={filterAction} cellSize={27}
                markHands={[...(mode==="icm"?(icmResult?.foldedHands||[]):mode==="pko"?(pkoResult?.widenedHands||[]):[]),...(heroKey?[heroKey]:[])]}
                markColor={heroKey?T.cyan:mode==="icm"?T.red:mode==="pko"?T.green:undefined}
                cfrMap={cfrOverlay&&cfrResult?cfrResult.heroByKey:null}
              />
            </div>
            <div className="ss-center-col tree">
              <SolverDecisionTreeV2
                scenario={scenario} mode={mode} pac={pac} stats={stats} evByBucket={evByBucket}
                heroFreqs={heroFreqs} villainFreqs={villainFreqs} villainAggBase={villainAggBase}
                nodeLock={nodeLock} setNodeLock={setNodeLock}
                nodeLockOpen={nodeLockOpen} setNodeLockOpen={setNodeLockOpen}
                filterAction={filterAction} setFilterAction={setFilterAction}
                math={math} cfrResult={cfrResult} board={board} betFrac={cfrBetFrac}
              />
              <SolverDetailsTabs
                scenario={scenario} mode={mode} pac={pac}
                heroFreqs={heroFreqs} villainFreqs={villainFreqs}
                selectedCell={selectedCell} exploitDetails={exploitDetails}
                detailsTab={detailsTab} setDetailsTab={setDetailsTab}
                stats={stats} evByBucket={evByBucket}
              />
            </div>
            <div className={`ss-center-col shark-matrix-pane${mobileMatrixTab==="villain"?" shark-pane-active":""}`}>
              <SolverMatrixGrid
                title={villainMode==="hand"?"VILAIN — MAIN":"VILAIN RANGE"} posLabel={`${scenario.vsPos} — ${villainMode==="hand"&&villainParse?.valid?comboLabel(villainParse):villainPac.label}`}
                freqs={villainFreqs} pac={villainPac} scenario={scenario} mode={mode} side="villain"
                selectedCell={selectedCell} setSelectedCell={setSelectedCell}
                hoveredCell={hoveredCell} setHoveredCell={setHoveredCell}
                filterAction={filterAction} cellSize={27}
                markHands={villainKey?[villainKey]:[]}
                markColor={villainKey?T.purple:undefined}
              />
            </div>
          </div>

          <div style={{marginTop:12}}>
            <SolverSelectedHandPanel
              selectedCell={selectedCell} scenario={scenario} mode={mode}
              heroFreqs={heroFreqs} villainFreqs={villainFreqs} pac={pac}
              exploitDetails={exploitDetails} icmResult={icmResult} pkoResult={pkoResult}
              heroParse={heroKey&&selectedCell&&selectedCell.key===heroKey?heroParse:null}
              equityHero={selectedEquity} foldEquity={foldEquity} math={math}
              onPickHand={pickHand}
            />
          </div>

          <div className="ss-bottom">
            <SolverInsightsCard scenario={scenario} heroFreqs={heroFreqs} mode={mode} onAddNote={()=>setShowNoteForm(true)}/>
            <SolverGainsCard/>
            <SolverQuickActions onGoTrainer={handleGoTrainer} onGoReplayer={handleGoReplayer} onExport={onExport} onSave={onSave} mode={mode} setMode={setMode} onNodeLock={()=>{setNodeLockOpen(true);document.querySelector('.ss-center-col.tree')?.scrollIntoView({behavior:'smooth',block:'center'});}}/>
          </div>

          <SolverNotesPanel
            scenario={scenario} freqs={heroFreqs} mode={mode}
            notes={notes} setNotes={setNotes}
            showNoteForm={showNoteForm} setShowNoteForm={setShowNoteForm}
          />
        </div>

        <div className="ss-right">
          <SolverSummaryCard
            scenario={scenario} mode={mode} stackHero={stackHero} stackVillain={stackVillain}
            effective={effective} math={math} equityHero={equityHero}
            villainActionEff={villainActionEff} onReset={onReset}
          />
          <SolverSpotResultPanel
            equityHero={equityHero} equityVillain={equityVillain} foldEquity={foldEquity}
            math={math} evTotal={evTotalWeighted} strategySource={strategySource}
          />
          <SolverResultSourcePanel strategySource={strategySource} equitySource={equitySource}/>
          <SolverEVChart
            scenario={scenario} mode={mode} pac={pac} evByBucket={evByBucket}
            selectedCell={selectedCell} heroFreqs={heroFreqs} villainFreqs={villainFreqs}
          />
          <SolverCFRPanel
            result={cfrResult} busy={cfrBusy} onSolve={runCFR}
            betFrac={cfrBetFrac} setBetFrac={setCfrBetFrac} boardCards={board}
            overlay={cfrOverlay} setOverlay={setCfrOverlay}
          />
          <SolverQualityCard cfr={cfrResult} busy={cfrBusy}/>
        </div>
      </div>

      <SolverProvenanceLegend
        activeSource={resultSourceTop}
        precision={validation&&!validation.ok?"spot à corriger":cfrResult?"CFR · 1-street":"estimation"}
        modeLabel={modeLabelTop}
      />
    </div>
  );
}
