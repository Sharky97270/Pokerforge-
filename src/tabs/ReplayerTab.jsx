// PokerForge — Replayer : parser multi-room, rejeu pas-a-pas, analyse IA, solver de spot (extrait de App.jsx, Phase 3.3)
import React, { useState, useEffect, useRef, useMemo } from "react";
import { T } from "../theme.js";
import { useIsMobile } from "../utils/ui.js";
import { apiSolverAnalyze, apiRangesCompare, apiSaveSpot, apiListSpots, apiDeleteSpot } from "../solverApi.js";
import { loadStats, saveStats, saveStatsSafe, loadHands, saveHands } from "../stats.js";
import { POSITIONS_BY_SIZE, SPOTS } from "../data/content.js";
import { MiniCard, Card, CardFlip } from "../components/table/Cards.jsx";
import RangesTab from "./RangesTab.jsx";
/* Ranges heuristiques du solveur — source unique (SharkSolver). `solveScenario`
   les utilisait sans les importer → ReferenceError silencieuse (bug préexistant). */
import { buildSolverFreqs } from "../solver/preflopRanges.js";
/* ── Replayer refonte v1 : moteur normalisé + table immersive ── */
import { parseSession as pfParseSessionV2 } from "../replayer/handModel.js";
import { computeSnapshot, computeAllSnapshots } from "../replayer/stateEngine.js";
import ReplayTableImmersive from "../replayer/ReplayTableImmersive.jsx";
import DecisionPanel from "../replayer/DecisionPanel.jsx";
/* ── Analyse IA sécurisée : HandState normalisé → SharkSolver → backend → IA ── */
import { buildHandState, spotLabel } from "../replayer/handState.js";
import { publishAnalysisContext } from "../replayer/handoff.js";
import { buildSolverPackage, buildTarget, heroEquity } from "../replayer/solverPackage.js";
import { analyzeWithCache, LOADING_STEPS } from "../replayer/aiAnalysis.js";
import AiAnalysisPanel from "../replayer/AiAnalysisPanel.jsx";
import { recordHand, handObservations } from "../replayer/leakEngine.js";
/* ── Solveur CFR postflop : pré-solve en arrière-plan (Web Worker) ── */
import { buildReplayerCfrRequest, cfrResultToBlock, solvableSteps } from "../replayer/postflopSolve.js";
import { solvePostflopAsync, isCfrWorkerAvailable } from "../solver/cfrPostflopClient.js";
import { getSession, onAuthChange } from "../auth.js";

/* Enrichit un NormalizedHand de champs de compatibilité (seats/actions/site…)
   pour les panneaux existants (header, solveur, analyse), et pré-calcule les
   snapshots (mémoïsés) → pas de reparse au changement d'étape (§34).
   Le `step` indexe désormais les ÉVÉNEMENTS (blinds/deals/actions). */
function hydrateReplayHand(nh){
  if(!nh || !nh.valid) return nh;
  const snaps = computeAllSnapshots(nh);
  const nameOf = id => nh.players.find(p=>p.id===id)?.name || "";
  const cap = s => s ? s[0].toUpperCase()+s.slice(1) : s;
  const actions = nh.events.map((e,i)=>{
    const snap = snaps[i] || {};
    return {
      street: cap(e.street), actor: nameOf(e.playerId), action: e.label,
      type: e.type, amt: e.amount ?? null, pot: snap.potTotal ?? 0,
      board: snap.board || [], isHero: e.playerId===nh.heroId, isErr:false, note:null, step:i,
    };
  });
  const seats = nh.players.map(p=>({
    name:p.name, stack:p.stackStart, seat:p.seat, pos:p.pos,
    isHero:p.isHero, hole:p.hole, shown:p.shown, stats:p.stats,
    profile: p.isHero?"Hero":undefined,
  }));
  // Champs filtrables pour la bibliothèque (§8)
  const preflopRaises = nh.events.filter(e=>e.street==="preflop" && (e.type==="raise"||e.type==="allin")).length;
  const potType = preflopRaises>=3?"4Bet+":preflopRaises===2?"3Bet":preflopRaises===1?"SRP":"Limped";
  const lastEv = [...nh.events].reverse().find(e=>["fold","check","call","bet","raise","allin"].includes(e.type));
  const lastStreet = cap(lastEv?.street||"preflop");
  const hasAllin = nh.events.some(e=>e.type==="allin");
  // Stack Hero en début de main (déjà en bb) → filtre « Stack (BB) » (§1).
  const heroStackBb = nh.players.find(p=>p.isHero)?.stackStart ?? null;
  return { ...nh, site:nh.room, fmt:nh.format, bb:nh.bbSize, hasShowdown:!!nh.showdown,
    potType, lastStreet, hasAllin, heroStackBb,
    seats, actions, steps:actions, _snaps:snaps };
}

/* Notes du Replayer par main (clé = handId), persistées + synchro cloud (pf_*) */
function repLoadNotes(){try{return JSON.parse(localStorage.getItem("pf_rep_notes")||"{}");}catch{return {};}}
function repSaveNotes(o){try{localStorage.setItem("pf_rep_notes",JSON.stringify(o));}catch{}}

/* ── §2/§33 — PURGE DES CLÉS API UTILISATEUR ──
   Le Replayer appelait autrefois le fournisseur d'IA DEPUIS LE NAVIGATEUR avec
   une clé saisie par l'utilisateur (stockée en localStorage). Cette logique est
   supprimée : la clé vit désormais uniquement côté serveur (edge function
   `analyze-hand`). On efface au chargement toute trace des anciens stockages —
   un utilisateur qui avait saisi sa clé ne doit plus l'avoir sur sa machine. */
(function purgeLegacyApiKeys(){
  try{
    localStorage.removeItem("pf_ak");
    localStorage.removeItem("pf_apikey");
    sessionStorage.removeItem("pf_ak");
    sessionStorage.removeItem("pf_apikey");
  }catch{ /* stockage indisponible : rien à purger */ }
})();

function sanitizeHH(raw){
  if(typeof raw!=="string")return "";
  // Limite taille (3 Mo — couvre les grosses sessions de hand history)
  let s=raw.slice(0,3_000_000);
  // Supprime balises HTML / scripts potentiels
  s=s.replace(/<script[\s\S]*?<\/script>/gi,"")
     .replace(/<[^>]+>/g,"")
     .replace(/javascript:/gi,"")
     .replace(/on\w+=/gi,"");
  return s;
}

const _apiCallLog=[];
function _canCallApi(){
  const now=Date.now();
  // Purge appels > 60s
  while(_apiCallLog.length&&now-_apiCallLog[0]>60_000)_apiCallLog.shift();
  // Max 5 appels / minute
  if(_apiCallLog.length>=5)return false;
  _apiCallLog.push(now);
  return true;
}
function _secondsUntilNextCall(){
  if(_apiCallLog.length<5)return 0;
  return Math.ceil((60_000-(Date.now()-_apiCallLog[0]))/1000);
}

function incrementAnalysesCount(){
  const st=loadStats();
  st.totalAnalyses=(st.totalAnalyses||0)+1;
  st.analysesCount=(st.analysesCount||0)+1;
  saveStats(st);saveStatsSafe(st);
}

function validateReplayActionSequence(hand){
  const e=[];
  if(!hand||!Array.isArray(hand.actions)||!hand.actions.length)return{valid:false,errors:["main sans actions"]};
  const ord={Preflop:0,Flop:1,Turn:2,River:3};
  let last=-1;const folded=new Set();
  for(const a of hand.actions){
    const si=ord[a.street]??0;
    if(si<last)e.push(`street régresse vers ${a.street}`);
    last=Math.max(last,si);
    if(folded.has(a.actor))e.push(`${a.actor} agit après s'être couché`);
    if(/Fold/i.test(a.action||""))folded.add(a.actor);
  }
  return{valid:e.length===0,errors:e};
}
function validateVisibleBetSequence(hand){
  const e=[];
  if(!hand||!Array.isArray(hand.actions))return{valid:false,errors:["main sans actions"]};
  let prevStreet=null,betSeen=false;
  for(const a of hand.actions){
    if(a.street!==prevStreet){betSeen=/^pre/i.test(a.street);prevStreet=a.street;} // préflop : blinds = mise
    const lab=a.action||"";
    if(/Call/i.test(lab)&&!betSeen)e.push(`Call sans mise préalable (${a.street})`);
    if(/Bet|Raise|All-?in/i.test(lab))betSeen=true;
  }
  return{valid:e.length===0,errors:e};
}

/* ═══════════════════════════════════════
   REPLAYER TAB — avec fix API, listing, stats villain, detection format
═══════════════════════════════════════ */
const SAMPLE_HH=`PokerStars Hand #234589012: Hold'em No Limit ($1/$2) - 2025/05/20
Table 'Andromeda IX' 6-max Seat #3 is the button
Seat 1: Hero ($200.50 in chips)
Seat 3: Villain ($187.00 in chips)
Seat 5: Player5 ($243.00 in chips)
Hero: posts small blind $1
Player5: posts big blind $2
Dealt to Hero [Qs Jh]
Villain: raises $4 to $6
Hero: calls $5
Player5: folds
FLOP [Ah Kd 7c]
Hero: checks
Villain: bets $7
Hero: calls $7
TURN [Ah Kd 7c] [2s]
Hero: checks
Villain: bets $19
Hero: calls $19
RIVER [Ah Kd 7c 2s] [9h]
Hero: checks
Villain: bets $60
Hero: folds`;

/* Detection Cash vs MTT dans le hand history */
function detectGameType(txt){
  const t=txt.toLowerCase();
  if(t.includes("tournament")||t.includes("tournoi")||t.includes("level")||t.includes("ante")||t.includes("bounty")||t.includes("buyin"))return "mtt";
  return "cash";
}

/* Analyse patterns rapide */
function quickAnalysis(hh){
  const lines=hh.toLowerCase();const errors=[];let score=8;
  const gameType=detectGameType(hh);
  if(lines.includes("calls")&&lines.includes("flop"))errors.push("Flop call — verifiez equity vs cbet range");
  if(lines.includes("calls")&&lines.includes("turn"))errors.push("Turn call — double barrel = range value forte");
  if(lines.includes("folds")&&lines.includes("river"))errors.push("Fold river — verifiez pot odds vs equity residuelle");
  if(!lines.includes("raise")&&!lines.includes("3-bet"))errors.push("Aucun 3-bet detecte — frequence optimale ?");
  if(gameType==="mtt"&&lines.includes("fold"))errors.push("ICM bubble factor — fold equity reduite en MTT");
  return{score:Math.max(3,score-errors.length),errors,note:`Analyse rapide patterns (${gameType==="mtt"?"MTT":"Cash Game"})`,gameType};
}

/* ══════════════════════════════════════════════════════
   REPLAY TIMELINE V2 — Barre de progression style GTO Wizard
══════════════════════════════════════════════════════ */
function ReplayTimelineV2({hand,step,setStep,playing,setPlaying}){
  if(!hand)return null;
  const streets=["Preflop","Flop","Turn","River"].filter(s=>hand.actions.some(a=>a.street===s));
  const pct=hand.actions.length>1?(step/(hand.actions.length-1)*100):0;
  const curStreet=hand.actions[Math.max(0,Math.min(step,hand.actions.length-1))]?.street;
  const markers=streets.map(s=>({
    s,pct:hand.actions.length>1
      ?(hand.actions.findIndex(a=>a.street===s)/(hand.actions.length-1)*100):0
  }));
  const onClick=e=>{
    const r=e.currentTarget.getBoundingClientRect();
    setStep(Math.max(0,Math.min(hand.actions.length-1,
      Math.round(((e.clientX-r.left)/r.width)*(hand.actions.length-1)))));
    setPlaying(false);
  };
  const jumpTo=s=>{const i=hand.actions.findIndex(a=>a.street===s);if(i>=0){setStep(i);setPlaying(false);}};
  return(
    <div style={{padding:"6px 2px 2px",userSelect:"none"}}>
      <div style={{position:"relative",height:7,background:"rgba(255,255,255,.07)",borderRadius:4,
        cursor:"pointer",marginBottom:7}} onClick={onClick}>
        <div style={{height:"100%",width:pct+"%",
          background:"linear-gradient(90deg,#1F8BFF 0%,#7C3AFF 55%,#FFC247 100%)",
          borderRadius:4,transition:"width .12s linear"}}/>
        <div style={{position:"absolute",left:pct+"%",top:"50%",
          transform:"translate(-50%,-50%)",
          width:15,height:15,borderRadius:"50%",
          background:"#fff",
          boxShadow:"0 0 12px rgba(255,194,71,.9),0 2px 8px rgba(0,0,0,.5)",
          border:"2px solid rgba(255,194,71,.85)",
          transition:"left .12s linear",pointerEvents:"none",zIndex:2}}/>
        {markers.filter(m=>m.pct>1&&m.pct<99).map(m=>(
          <div key={m.s} style={{position:"absolute",left:m.pct+"%",top:-4,bottom:-4,
            width:2,background:"rgba(255,255,255,.22)",transform:"translateX(-50%)",
            pointerEvents:"none",borderRadius:1}}/>
        ))}
      </div>
      <div style={{position:"relative",height:16}}>
        {markers.map(m=>(
          <div key={m.s} onClick={()=>jumpTo(m.s)} style={{
            position:"absolute",left:m.pct+"%",transform:"translateX(-50%)",
            fontSize:9,fontWeight:m.s===curStreet?700:400,fontFamily:T.stats,
            color:m.s===curStreet?T.gold:T.text4,cursor:"pointer",whiteSpace:"nowrap",
            transition:"color .15s",padding:"1px 5px",borderRadius:3,
            background:m.s===curStreet?"rgba(255,194,71,.08)":"transparent",
          }}>{m.s}</div>
        ))}
        <div style={{position:"absolute",right:0,top:0,fontSize:8.5,fontFamily:T.stats,color:T.text4}}>
          {step+1} / {hand.actions.length}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   REPLAY CONTROL BAR — Boutons premium style cockpit
══════════════════════════════════════════════════════ */
function ReplayControlBar({hand,step,setStep,playing,setPlaying,playSpeed,setPlaySpeed,onCinema,cinema}){
  if(!hand)return null;
  const jumpStreets=["Flop","Turn","River"].filter(s=>hand.actions.some(a=>a.street===s));
  const Btn=({l,f,primary,active,title:t,w=28,h=28})=>(
    <button onClick={f} title={t||""} style={{
      width:w,height:h,borderRadius:6,cursor:"pointer",fontFamily:T.stats,
      fontSize:primary?15:11,display:"flex",alignItems:"center",justifyContent:"center",
      background:primary?(active?"rgba(255,194,71,.22)":"rgba(255,255,255,.09)"):
        active?"rgba(155,92,255,.14)":"rgba(255,255,255,.05)",
      border:`1px solid ${primary?(active?"rgba(255,194,71,.5)":"rgba(255,255,255,.15)"):
        active?"rgba(155,92,255,.35)":"rgba(255,255,255,.09)"}`,
      color:primary?(active?T.gold:"#e0eaff"):active?T.purple:T.text3,
      boxShadow:primary&&active?"0 0 18px rgba(255,194,71,.28)":"none",
      transition:"all .13s",
    }}>{l}</button>
  );
  return(
    <div style={{display:"flex",alignItems:"center",gap:5,padding:"6px 2px 2px",flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:3,alignItems:"center"}}>
        <Btn l="⏮" f={()=>{setStep(0);setPlaying(false);}} t="Début"/>
        <Btn l="◀◀" f={()=>setStep(s=>Math.max(0,s-1))} t="Action précédente"/>
        <Btn l={playing?"⏸":"▶"} primary active={playing} f={()=>setPlaying(p=>!p)} w={36} h={36} t={playing?"Pause":"Lecture"}/>
        <Btn l="▶▶" f={()=>setStep(s=>Math.min(hand.actions.length-1,s+1))} t="Action suivante"/>
        <Btn l="⏭" f={()=>{setStep(hand.actions.length-1);setPlaying(false);}} t="Fin"/>
      </div>
      <div style={{display:"flex",gap:2,padding:"3px",background:"rgba(255,255,255,.04)",
        borderRadius:6,border:"1px solid rgba(255,255,255,.07)"}}>
        {[.5,1,2,4].map(s=>(
          <button key={s} onClick={()=>setPlaySpeed(s)} style={{
            height:22,padding:"0 7px",borderRadius:4,fontSize:9,fontWeight:700,cursor:"pointer",
            background:playSpeed===s?"rgba(255,194,71,.18)":"transparent",
            border:`1px solid ${playSpeed===s?"rgba(255,194,71,.42)":"transparent"}`,
            color:playSpeed===s?T.gold:T.text4,fontFamily:T.stats,transition:"all .12s",
          }}>{s}×</button>
        ))}
      </div>
      <div style={{display:"flex",gap:3,marginLeft:4}}>
        {jumpStreets.map(s=>(
          <button key={s} onClick={()=>{const i=hand.actions.findIndex(a=>a.street===s);if(i>=0){setStep(i);setPlaying(false);}}} style={{
            height:26,padding:"0 10px",borderRadius:5,fontSize:8.5,fontWeight:700,cursor:"pointer",
            background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",
            color:T.text3,fontFamily:T.stats,transition:"all .12s",
          }}>{s}</button>
        ))}
      </div>
      <button onClick={onCinema} title="Mode cinéma" style={{
        marginLeft:"auto",height:26,padding:"0 11px",borderRadius:5,fontSize:11,cursor:"pointer",
        background:cinema?"rgba(155,92,255,.14)":"rgba(255,255,255,.04)",
        border:`1px solid ${cinema?"rgba(155,92,255,.35)":"rgba(255,255,255,.08)"}`,
        color:cinema?T.purple:T.text4,fontFamily:T.stats,transition:"all .13s",display:"flex",alignItems:"center",gap:4,
      }}>
        <span style={{fontSize:12}}>{cinema?"⊠":"⊡"}</span>
        <span style={{fontSize:8.5,fontWeight:700}}>{cinema?"Normal":"Cinéma"}</span>
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   HAND HISTORY PANEL — Panneau droit premium avec export
══════════════════════════════════════════════════════ */
function HandHistoryPanel({hand,step,onStep}){
  if(!hand)return(
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",gap:10,padding:"20px"}}>
      <div style={{fontSize:30,opacity:.5}}>📋</div>
      <div style={{fontSize:9.5,color:T.text4,fontFamily:T.stats,textAlign:"center",lineHeight:1.7}}>
        L'historique des actions<br/>apparaîtra ici après<br/>le chargement d'une main
      </div>
    </div>
  );
  const streets=["Preflop","Flop","Turn","River"];
  const byStreet={};
  hand.actions.forEach(a=>{if(!byStreet[a.street])byStreet[a.street]=[];byStreet[a.street].push(a);});
  const actColor=(a)=>{
    if(a.isErr)return T.red;
    if(a.isHero)return"#60A5FA";
    const l=(a.action||"").toLowerCase();
    if(l.includes("fold"))return"rgba(255,69,96,.7)";
    if(l.includes("raise")||l.includes("bet"))return"#7EB8FF";
    if(l.includes("call"))return"#34D399";
    return T.text3;
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{flex:1,overflowY:"auto"}}>
        {streets.filter(s=>byStreet[s]).map(street=>{
          const first=byStreet[street][0];
          return(
            <div key={street}>
              <div style={{padding:"6px 12px",
                background:"linear-gradient(90deg,rgba(7,27,68,.95),rgba(5,14,40,.95))",
                borderTop:"1px solid #0F2258",display:"flex",alignItems:"center",
                gap:8,position:"sticky",top:0,zIndex:2}}>
                <span style={{fontFamily:T.brand,fontSize:8,color:T.amber,
                  letterSpacing:".14em",fontWeight:700}}>{street.toUpperCase()}</span>
                {first?.board?.length>0&&(
                  <div style={{display:"flex",gap:3}}>
                    {first.board.map((c,i)=><Card key={i} r={c.r} s={c.s} size="xs"/>)}
                  </div>
                )}
                {first?.pot&&<span style={{marginLeft:"auto",fontSize:8,color:T.text4,fontFamily:T.stats}}>
                  Pot <span style={{color:T.gold,fontWeight:700}}>${first.pot}</span></span>}
              </div>
              {byStreet[street].map((a,i)=>{
                const active=a.step===step;
                return(
                  <div key={i} onClick={()=>onStep(a.step)} style={{
                    display:"flex",alignItems:"center",gap:6,padding:"5px 12px",
                    background:active?"rgba(31,139,255,.08)":"transparent",
                    borderLeft:`2px solid ${active?"#1F8BFF":a.isHero?"rgba(31,139,255,.15)":"transparent"}`,
                    cursor:"pointer",transition:"background .1s",
                  }}
                  onMouseEnter={e=>{if(!active)e.currentTarget.style.background="rgba(255,255,255,.03)";}}
                  onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}>
                    <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,minWidth:18,flexShrink:0}}>{street[0]}{a.step+1}</span>
                    <span style={{fontSize:9,fontWeight:a.isHero?700:400,color:a.isHero?"#7EB8FF":T.text3,
                      fontFamily:T.stats,minWidth:50,overflow:"hidden",textOverflow:"ellipsis",
                      whiteSpace:"nowrap",flexShrink:0}}>{a.actor}</span>
                    <span style={{flex:1,fontSize:9.5,fontWeight:a.isHero?700:500,color:actColor(a),
                      fontFamily:T.stats,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {a.action}{a.amt?` · ${a.amt}$`:""}
                    </span>
                    {a.ev&&<span style={{fontSize:8,flexShrink:0,marginLeft:4,fontFamily:T.stats,
                      color:(a.ev.includes("-")||a.ev==="fold")&&a.ev!=="correct"?T.red:T.green}}>
                      {a.ev==="ok"||a.ev==="correct"?"✓":a.ev}</span>}
                    {a.isErr&&!a.ev&&<span style={{fontSize:8,color:T.red,flexShrink:0}}>⚠</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{padding:"10px 12px",borderTop:"1px solid #0F2258",flexShrink:0}}>
        <button className="btn btns" style={{width:"100%",fontSize:9,display:"flex",
          alignItems:"center",justifyContent:"center",gap:5,padding:"7px"}}>
          📤 Exporter la main
        </button>
      </div>
    </div>
  );
}

/* Composant : listing complet des coups par street */
function HandListing({hand,step,onStep}){
  if(!hand)return null;
  const streets=["Preflop","Flop","Turn","River"];
  const byStreet={};
  hand.actions.forEach(a=>{
    if(!byStreet[a.street])byStreet[a.street]=[];
    byStreet[a.street].push(a);
  });
  return(
    <div className="hand-listing">
      <div className="hand-listing-hdr">
        <span style={{fontSize:9,color:T.text3,fontFamily:T.stats,letterSpacing:".15em",textTransform:"uppercase",fontWeight:700}}>Historique des actions</span>
        <span className={`fmt-badge ${hand.gameType==="mtt"?"fmt-mtt":"fmt-cash"}`}>{hand.gameType==="mtt"?"MTT":"Cash"}</span>
      </div>
      {streets.filter(s=>byStreet[s]).map(street=>{
        const firstAct=byStreet[street][0];
        const lastAct=byStreet[street][byStreet[street].length-1];
        const potStart=firstAct?.pot;
        return(
        <div key={street}>
          {/* Header de street enrichi */}
          <div style={{
            padding:"6px 13px",background:"linear-gradient(90deg,#071B44,#0f0f1a)",
            borderTop:"1px solid #0F2258",borderBottom:"1px solid #0F2258",
            display:"flex",alignItems:"center",gap:8,
          }}>
            <span style={{fontFamily:T.brand,fontSize:8,color:T.amber,letterSpacing:".12em",fontWeight:700}}>{street.toUpperCase()}</span>
            {firstAct?.board?.length>0&&(
              <div style={{display:"flex",gap:3}}>
                {firstAct.board.map((c,i)=><Card key={i} r={c.r} s={c.s} size="xs"/>)}
              </div>
            )}
            {potStart&&<span style={{marginLeft:"auto",fontSize:8.5,color:T.text3,fontFamily:T.stats}}>Pot <span style={{color:T.gold,fontWeight:700}}>${potStart}</span></span>}
          </div>
          {/* Actions de la street */}
          {byStreet[street].map((a,i)=>(
            <div
              key={i}
              className={`action-row ${a.step===step?"active":""} ${a.isHero?"hero":""} ${a.isErr?"error":""}`}
              onClick={()=>onStep(a.step)}
            >
              <span className="ar-street">{street[0]}{a.step+1}</span>
              <span className="ar-player" style={{color:a.isHero?T.gold:T.text2}}>{a.actor}</span>
              <span className="ar-action" style={{
                color:a.isErr?T.red:a.isHero?T.gold:a.action.toLowerCase().includes("fold")?T.red:a.action.toLowerCase().includes("raise")||a.action.toLowerCase().includes("bet")?T.blue:T.green
              }}>
                {a.action}{a.amt?` · ${a.amt}$`:""}
              </span>
              {a.ev&&(
                <span className="ar-ev" style={{color:a.ev.includes("-")?T.red:a.ev==="correct"||a.ev==="ok"?T.green:T.text2}}>
                  {a.ev==="ok"?"✓":a.ev==="correct"?"✓ Correct":a.ev}
                </span>
              )}
            </div>
          ))}
        </div>
        );
      })}
    </div>
  );
}

/* ── Écran d'accueil premium (aucune main chargée) ── */
function RepEmptyState({handList,onImport,onGoTrainer}){
  const totalAnalyzed=handList.length;
  const avgScore=handList.length?Math.round(handList.reduce((a,h)=>a+(Number(h.score)||5),0)/handList.length):0;
  const recentSites=[...new Set(handList.slice(0,5).map(h=>h.site))].filter(Boolean);
  return(
    <div style={{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>
      {/* Hero */}
      <div style={{textAlign:"center",padding:"20px 0 8px"}}>
        <div style={{fontSize:38,filter:"drop-shadow(0 0 20px rgba(255,194,71,.5))",marginBottom:6}}>♠</div>
        <div style={{fontFamily:T.brand,fontSize:16,color:T.gold,fontWeight:900,letterSpacing:".08em",marginBottom:4}}>REPLAYER POKERFORGE</div>
        <div style={{fontSize:11,color:T.text3,fontFamily:T.stats}}>Importez une main pour lancer l'analyse</div>
      </div>

      {/* Quick access */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
        {[
          {ico:"📂",lbl:"Importer",sub:"Drag & drop ou coller",fn:onImport,accent:T.blue},
          {ico:"⚡",lbl:"Analyse IA",sub:"SharkSolver + PokerForge AI",fn:onImport,accent:T.gold},
          {ico:"🎯",lbl:"Trainer",sub:"Travailler un spot",fn:onGoTrainer,accent:T.green},
          {ico:"📋",lbl:"Bibliothèque",sub:`${totalAnalyzed} main${totalAnalyzed!==1?"s":""} sauvegardée${totalAnalyzed!==1?"s":""}`,fn:null,accent:T.purple},
        ].map((b,i)=>(
          <div key={i} onClick={b.fn||undefined} style={{padding:"10px 11px",background:"#071B44",border:`1px solid ${b.accent}22`,borderRadius:9,cursor:b.fn?"pointer":"default",transition:"all .14s",display:"flex",gap:9,alignItems:"center"}}
            onMouseEnter={e=>b.fn&&(e.currentTarget.style.background="#0B2560")}
            onMouseLeave={e=>b.fn&&(e.currentTarget.style.background="#071B44")}
          >
            <span style={{fontSize:18}}>{b.ico}</span>
            <div>
              <div style={{fontFamily:T.stats,fontSize:11,fontWeight:700,color:T.text}}>{b.lbl}</div>
              <div style={{fontFamily:T.stats,fontSize:9,color:T.text4,marginTop:1}}>{b.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats rapides */}
      {totalAnalyzed>0&&(
        <div style={{background:"#071B44",border:"1px solid #152D6E",borderRadius:9,padding:"10px 12px"}}>
          <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",fontWeight:700,marginBottom:8}}>STATISTIQUES</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {[
              {n:totalAnalyzed,l:"Mains analysées",c:T.blue},
              {n:avgScore?`${avgScore}/10`:"—",l:"Score moyen",c:avgScore>=7?T.green:avgScore>=5?T.gold:T.red},
              {n:recentSites[0]||"—",l:"Room principale",c:T.text2},
            ].map((s,i)=>(
              <div key={i} style={{textAlign:"center",padding:"6px",background:"rgba(255,255,255,.02)",borderRadius:6}}>
                <div style={{fontFamily:T.brand,fontSize:16,fontWeight:900,color:s.c}}>{s.n}</div>
                <div style={{fontFamily:T.stats,fontSize:8.5,color:T.text4,marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dernières mains */}
      {handList.length>0&&(
        <div>
          <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",fontWeight:700,marginBottom:6}}>DERNIÈRES MAINS</div>
          {handList.slice(0,4).map(h=>(
            <div key={h.id} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 9px",background:"#040B1F",border:"1px solid #0F2258",borderRadius:7,marginBottom:4,cursor:"pointer",transition:"border-color .12s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#1A3A80"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#0F2258"}
            >
              <span style={{fontSize:14}}>{h.gameType==="mtt"?"🏆":"💵"}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:T.stats,fontSize:10,color:T.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.desc}</div>
                <div style={{fontFamily:T.stats,fontSize:8.5,color:T.text4}}>{h.site}</div>
              </div>
              <span style={{fontFamily:T.brand,fontSize:12,fontWeight:900,color:Number(h.score)>=7?T.green:Number(h.score)>=5?T.gold:T.red,flexShrink:0}}>{h.score}/10</span>
            </div>
          ))}
        </div>
      )}

      {/* Rooms supportées */}
      <div style={{marginTop:"auto"}}>
        <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",fontWeight:700,marginBottom:5,textTransform:"uppercase"}}>Rooms supportées</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {[{n:"PokerStars",c:"#FFC247"},{n:"Winamax",c:"#FF4560"},{n:"GGPoker",c:"#1F8BFF"},{n:"888",c:"#10D87A"},{n:"PMU",c:"#FF4560"}].map(s=>(
            <span key={s.n} style={{padding:"2px 8px",borderRadius:20,fontSize:8,fontWeight:700,color:s.c,border:`1px solid ${s.c}33`,background:s.c+"0d",fontFamily:T.stats}}>{s.n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── HandHistoryList : liste des mains importées (pagination, surlignage, click) ── */
/* Petit sélecteur de filtre (pills). */
function HHFilter({label,options,value,onChange}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:3,flexWrap:"wrap"}}>
      <span style={{fontSize:7,color:T.text4,fontFamily:T.stats,letterSpacing:".06em",fontWeight:700,minWidth:34}}>{label}</span>
      {options.map(o=>{
        const on=value===o.v;
        return(
          <button key={String(o.v)} onClick={()=>onChange(o.v)} style={{
            padding:"1px 7px",borderRadius:20,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:T.stats,
            background:on?"rgba(255,194,71,.14)":"transparent",
            border:`1px solid ${on?"rgba(255,194,71,.4)":"rgba(255,255,255,.08)"}`,
            color:on?T.gold:T.text4,transition:"all .1s"}}>{o.l}</button>
        );
      })}
    </div>
  );
}

/* Section repliable du panneau de filtres (§1 : « organisés en sections
   repliables »). Ouverte par défaut, refermable d'un clic sur son en-tête. */
function HHFilterSection({title,active,children,defaultOpen=true}){
  const[open,setOpen]=useState(defaultOpen);
  return(
    <div style={{borderBottom:"1px solid rgba(255,255,255,.05)"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%",display:"flex",alignItems:"center",gap:5,padding:"6px 2px",
        background:"transparent",border:0,cursor:"pointer",fontFamily:T.stats,textAlign:"left"}}>
        <span style={{fontSize:8,color:open?T.text3:T.text4,transition:"transform .15s",transform:open?"rotate(90deg)":"none",display:"inline-block",width:8}}>›</span>
        <span style={{flex:1,fontSize:7.5,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:open?T.text3:T.text4}}>{title}</span>
        {active&&<span style={{width:5,height:5,borderRadius:"50%",background:T.gold,flexShrink:0}}/>}
      </button>
      {open&&<div style={{display:"flex",flexDirection:"column",gap:5,padding:"0 0 8px 13px"}}>{children}</div>}
    </div>
  );
}

function HandHistoryList({session,activeIdx,onSelect,unit,onSwitchLot}){
  const[page,setPage]=useState(0);
  const[showFilters,setShowFilters]=useState(false);   // §1 : repliés par défaut
  const[fPos,setFPos]=useState("all");
  const[fStreet,setFStreet]=useState("all");
  const[fResult,setFResult]=useState("all");
  const[fPot,setFPot]=useState("all");
  const[fShow,setFShow]=useState("all");
  const[fStack,setFStack]=useState("all");
  const[fSite,setFSite]=useState("all");
  // Lignes plus basses (§1) → on en affiche davantage sans allonger le panneau.
  const PER=14;
  const hands=session?.hands||[];
  const fmtRes=v=>unit==="BB"?`${v>=0?"+":""}${v}bb`:`${v>=0?"+":""}${(v*2).toFixed(1)}$`;

  // Options dynamiques selon les mains présentes (§8 : ne pas afficher ce qui n'existe pas)
  const posOpts=useMemo(()=>{
    const set=[...new Set(hands.map(h=>h.heroPos).filter(Boolean))];
    return [{v:"all",l:"Toutes"},...set.map(p=>({v:p,l:p}))];
  },[hands]);
  const potOpts=useMemo(()=>{
    const set=[...new Set(hands.map(h=>h.potType).filter(Boolean))];
    return [{v:"all",l:"Tous"},...set.map(p=>({v:p,l:p}))];
  },[hands]);
  const siteOpts=useMemo(()=>{
    const set=[...new Set(hands.map(h=>h.site).filter(Boolean))];
    return [{v:"all",l:"Tous"},...set.map(p=>({v:p,l:p}))];
  },[hands]);
  // Tranches de stack effectif Hero (bb) — seules celles réellement peuplées.
  const STACK_BANDS=[
    {v:"s0",l:"≤ 20bb",min:0,max:20},
    {v:"s1",l:"20-40bb",min:20,max:40},
    {v:"s2",l:"40-80bb",min:40,max:80},
    {v:"s3",l:"> 80bb",min:80,max:Infinity},
  ];
  const stackOpts=useMemo(()=>{
    const used=STACK_BANDS.filter(b=>hands.some(h=>h.heroStackBb!=null&&h.heroStackBb>b.min&&h.heroStackBb<=b.max));
    return used.length>1?[{v:"all",l:"Tous"},...used.map(b=>({v:b.v,l:b.l}))]:[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hands]);

  const filtered=useMemo(()=>hands.filter(h=>{
    if(fPos!=="all"&&h.heroPos!==fPos)return false;
    if(fStreet!=="all"&&h.lastStreet!==fStreet)return false;
    if(fResult==="win"&&!(h.resultBb>0))return false;
    if(fResult==="loss"&&!(h.resultBb<0))return false;
    if(fPot!=="all"&&h.potType!==fPot)return false;
    if(fShow==="yes"&&!h.hasShowdown)return false;
    if(fShow==="no"&&h.hasShowdown)return false;
    if(fSite!=="all"&&h.site!==fSite)return false;
    if(fStack!=="all"){
      const b=STACK_BANDS.find(x=>x.v===fStack);
      if(!b||h.heroStackBb==null||!(h.heroStackBb>b.min&&h.heroStackBb<=b.max))return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[hands,fPos,fStreet,fResult,fPot,fShow,fSite,fStack]);

  const activeCount=[fPos,fStreet,fResult,fPot,fShow,fSite,fStack].filter(v=>v!=="all").length;
  const resetFilters=()=>{setFPos("all");setFStreet("all");setFResult("all");setFPot("all");setFShow("all");setFSite("all");setFStack("all");};

  useEffect(()=>{setPage(0);},[fPos,fStreet,fResult,fPot,fShow,fSite,fStack]);
  const pages=Math.max(1,Math.ceil(filtered.length/PER));
  const safePage=Math.min(page,pages-1);
  const slice=filtered.slice(safePage*PER,safePage*PER+PER);
  const lotCount=session?.lotCount||1;
  const lotIndex=session?.lotIndex||0;

  return(
    <div style={{position:"relative",display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,padding:"8px 10px 7px",borderBottom:"1px solid #152D6E",flexShrink:0}}>
        <span style={{flex:1,fontFamily:T.brand,fontSize:10,fontWeight:900,color:T.text2,letterSpacing:".08em"}}>BIBLIOTHÈQUE DES MAINS</span>
        <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{filtered.length===hands.length?`${hands.length}`:`${filtered.length}/${hands.length}`} main{hands.length>1?"s":""}</span>
        {/* Entonnoir : ouvre/ferme le panneau de filtres (§1). Discret, pastille
            dorée quand au moins un filtre est actif. */}
        {hands.length>1&&(
          <button onClick={()=>setShowFilters(v=>!v)} title={showFilters?"Masquer les filtres":"Filtrer les mains"}
            style={{position:"relative",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",
              borderRadius:6,cursor:"pointer",flexShrink:0,transition:"all .15s",
              background:showFilters?"rgba(255,194,71,.12)":"transparent",
              border:`1px solid ${showFilters||activeCount?"rgba(255,194,71,.4)":"#152D6E"}`,
              color:showFilters||activeCount?T.gold:T.text4}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            {activeCount>0&&<span style={{position:"absolute",top:-3,right:-3,minWidth:11,height:11,borderRadius:6,background:T.gold,color:"#04122E",fontSize:7,fontWeight:900,fontFamily:T.stats,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 2px"}}>{activeCount}</span>}
          </button>
        )}
      </div>

      {/* Sélecteur de lot (§4) */}
      {lotCount>1&&onSwitchLot&&(
        <div style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderBottom:"1px solid #0F2258",flexShrink:0,flexWrap:"wrap"}}>
          <span style={{fontSize:7.5,color:T.text4,fontFamily:T.stats,fontWeight:700}}>LOT</span>
          {Array.from({length:lotCount}).map((_,i)=>(
            <button key={i} onClick={()=>onSwitchLot(i)} style={{
              padding:"2px 8px",borderRadius:6,fontSize:8.5,fontWeight:700,cursor:"pointer",fontFamily:T.stats,
              background:i===lotIndex?"rgba(52,216,255,.14)":"transparent",
              border:`1px solid ${i===lotIndex?"rgba(52,216,255,.4)":"rgba(255,255,255,.08)"}`,
              color:i===lotIndex?"#34D8FF":T.text4}}>{i+1}</button>
          ))}
        </div>
      )}

      {/* Panneau de filtres dépliable (§1/§8) — masqué par défaut : la liste des
          mains reste seule visible tant qu'on n'a pas cliqué l'entonnoir.
          En SURCOUCHE du panneau (et non inséré au-dessus de la liste) : la
          hauteur de la bibliothèque ne bouge pas et la liste n'est jamais
          comprimée à deux lignes quand on ouvre les filtres. */}
      {hands.length>1&&showFilters&&(
        <div style={{position:"absolute",top:35,left:0,right:0,bottom:0,zIndex:6,
          display:"flex",flexDirection:"column",overflow:"hidden",
          background:"#050E24",borderTop:"1px solid #0F2258"}}>
          {/* Corps défilant : les actions du bas restent toujours atteignables. */}
          <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"2px 11px 4px"}}>
          <HHFilterSection title="Position" active={fPos!=="all"}>
            <HHFilter label="POS" options={posOpts} value={fPos} onChange={setFPos}/>
          </HHFilterSection>
          {stackOpts.length>0&&(
            <HHFilterSection title="Stack (BB)" active={fStack!=="all"}>
              <HHFilter label="STACK" options={stackOpts} value={fStack} onChange={setFStack}/>
            </HHFilterSection>
          )}
          {potOpts.length>2&&(
            <HHFilterSection title="Action préflop" active={fPot!=="all"}>
              <HHFilter label="POT" options={potOpts} value={fPot} onChange={setFPot}/>
            </HHFilterSection>
          )}
          <HHFilterSection title="Street" active={fStreet!=="all"}>
            <HHFilter label="STREET" options={[{v:"all",l:"Toutes"},{v:"Preflop",l:"PF"},{v:"Flop",l:"Flop"},{v:"Turn",l:"Turn"},{v:"River",l:"River"}]} value={fStreet} onChange={setFStreet}/>
          </HHFilterSection>
          <HHFilterSection title="Résultat (EV)" active={fResult!=="all"||fShow!=="all"}>
            <HHFilter label="RÉSULT" options={[{v:"all",l:"Tous"},{v:"win",l:"Gagné"},{v:"loss",l:"Perdu"}]} value={fResult} onChange={setFResult}/>
            <HHFilter label="SD" options={[{v:"all",l:"Tous"},{v:"yes",l:"Oui"},{v:"no",l:"Non"}]} value={fShow} onChange={setFShow}/>
          </HHFilterSection>
          {siteOpts.length>2&&(
            <HHFilterSection title="Format / Site" active={fSite!=="all"}>
              <HHFilter label="SITE" options={siteOpts} value={fSite} onChange={setFSite}/>
            </HHFilterSection>
          )}
          </div>
          <div style={{display:"flex",gap:5,flexShrink:0,padding:"7px 11px 8px",borderTop:"1px solid #0F2258",background:"rgba(0,0,0,.25)"}}>
            <button onClick={resetFilters} disabled={!activeCount} style={{
              flex:1,padding:"5px",borderRadius:6,fontSize:8.5,fontWeight:700,fontFamily:T.stats,
              cursor:activeCount?"pointer":"default",transition:"all .15s",
              background:activeCount?"rgba(255,69,96,.07)":"transparent",
              border:`1px solid ${activeCount?"rgba(255,69,96,.28)":"#152D6E"}`,
              color:activeCount?"#FF6080":T.text4}}>
              ↺ Réinitialiser les filtres
            </button>
            <button onClick={()=>setShowFilters(false)} style={{
              flex:1,padding:"5px",borderRadius:6,fontSize:8.5,fontWeight:700,fontFamily:T.stats,cursor:"pointer",
              background:"rgba(255,194,71,.09)",border:"1px solid rgba(255,194,71,.32)",color:T.gold}}>
              ✓ Voir {filtered.length} main{filtered.length>1?"s":""}
            </button>
          </div>
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",padding:"6px"}}>
        {slice.map((h)=>{
          const gi=hands.indexOf(h);const on=gi===activeIdx;
          const col=h.resultBb>0?T.green:h.resultBb<0?T.red:T.text4;
          // Ligne compacte (§1) : n° · cartes · spot + méta sur une seule ligne · EV.
          const meta=[h.gameType==="mtt"?"MTT":"Cash",h.site,`${h.tableSize||(h.seats?.length||0)} joueurs`,(h.dateStr||"").slice(0,10)]
            .filter(Boolean).join(" · ");
          return(
            <div key={h.id} onClick={()=>onSelect(gi)} style={{
              display:"flex",alignItems:"center",gap:7,padding:"4px 8px",marginBottom:2,borderRadius:6,cursor:"pointer",
              background:on?"rgba(255,194,71,.1)":"rgba(255,255,255,.02)",
              border:`1px solid ${on?"rgba(255,194,71,.4)":"#0F2258"}`,
              borderLeft:`3px solid ${on?T.gold:"transparent"}`,transition:"all .12s"}}>
              <span style={{fontFamily:T.stats,fontSize:8.5,color:on?T.gold:T.text4,fontWeight:700,minWidth:15,textAlign:"right"}}>{gi+1}</span>
              <span style={{display:"flex",gap:2,flexShrink:0}}>
                {(h.heroCards&&h.heroCards.length>=2)?h.heroCards.slice(0,2).map((c,i)=><MiniCard key={i} r={c.r} s={c.s}/>):<span style={{fontSize:8,color:T.text4}}>??</span>}
              </span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:4,minWidth:0}}>
                  <span style={{fontSize:9,fontWeight:700,color:on?T.text:T.text2,fontFamily:T.stats,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.25}}>{h.spot}</span>
                  {h.potType&&h.potType!=="SRP"&&h.potType!=="Limped"&&<span style={{fontSize:6.5,fontWeight:800,color:"#C090FF",background:"rgba(155,92,255,.12)",border:"1px solid rgba(155,92,255,.3)",borderRadius:3,padding:"0 3px",flexShrink:0}}>{h.potType}</span>}
                  {h.hasAllin&&<span style={{fontSize:6.5,fontWeight:800,color:T.red,background:"rgba(255,69,96,.12)",border:"1px solid rgba(255,69,96,.3)",borderRadius:3,padding:"0 3px",flexShrink:0}}>AI</span>}
                </div>
                <div title={meta} style={{fontSize:7.5,color:T.text4,fontFamily:T.stats,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.25}}>
                  {meta}
                </div>
              </div>
              <span style={{fontFamily:T.brand,fontSize:9.5,fontWeight:800,color:col,flexShrink:0}}>{fmtRes(h.resultBb)}</span>
            </div>
          );
        })}
        {hands.length===0&&<div style={{textAlign:"center",color:T.text4,fontSize:9.5,padding:"20px 0",fontFamily:T.stats}}>Aucune main chargée.</div>}
        {hands.length>0&&filtered.length===0&&<div style={{textAlign:"center",color:T.text4,fontSize:9.5,padding:"20px 0",fontFamily:T.stats}}>Aucune main ne correspond aux filtres.</div>}
      </div>
      {pages>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"6px",borderTop:"1px solid #152D6E",flexShrink:0}}>
          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={safePage===0} style={{padding:"3px 9px",borderRadius:6,border:"1px solid #1A3A80",background:"transparent",color:safePage===0?T.text4:T.text2,fontSize:11,cursor:safePage===0?"default":"pointer"}}>‹</button>
          <span style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>{safePage+1} / {pages}</span>
          <button onClick={()=>setPage(p=>Math.min(pages-1,p+1))} disabled={safePage>=pages-1} style={{padding:"3px 9px",borderRadius:6,border:"1px solid #1A3A80",background:"transparent",color:safePage>=pages-1?T.text4:T.text2,fontSize:11,cursor:safePage>=pages-1?"default":"pointer"}}>›</button>
        </div>
      )}
    </div>
  );
}

/* ── Résumé session complète ── */
function SessionSummary({session,unit}){
  if(!session)return null;
  const hands=session.hands;
  const totalBb=Math.round(hands.reduce((a,h)=>a+(h.resultBb||0),0)*10)/10;
  const wins=hands.filter(h=>h.resultBb>0).length;
  const best=[...hands].sort((a,b)=>b.resultBb-a.resultBb)[0];
  const worst=[...hands].sort((a,b)=>a.resultBb-b.resultBb)[0];
  const fmtV=v=>unit==="BB"?`${v>=0?"+":""}${v}bb`:`${v>=0?"+":""}${(v*2).toFixed(1)}$`;
  return(
    <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"11px 12px"}}>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,marginBottom:7}}>Résumé de la session</div>
      {[["Site",session.site||session.room],["Format",session.format||session.fmt],["Joueurs",`${session.players} joueurs`],["Mains",session.lotCount>1?`${session.count} (lot ${(session.lotIndex||0)+1}/${session.lotCount}) · ${session.total} total`:`${session.total??session.count} mains`],["Date",session.date||"—"]].map(([l,v])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
          <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{l}</span>
          <span style={{fontSize:8.5,fontWeight:600,color:T.text2,fontFamily:T.stats,maxWidth:"60%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(v)}</span>
        </div>
      ))}
      {/* Comptes de validation à l'import (§6/§31) */}
      {(session.duplicates>0||session.incomplete>0)&&(
        <div style={{display:"flex",gap:6,marginTop:7,flexWrap:"wrap"}}>
          <span style={{fontSize:8,fontWeight:700,color:T.green,background:"rgba(16,216,122,.1)",border:"1px solid rgba(16,216,122,.25)",borderRadius:5,padding:"2px 6px",fontFamily:T.stats}}>✓ {session.imported} importées</span>
          {session.duplicates>0&&<span style={{fontSize:8,fontWeight:700,color:T.gold,background:"rgba(255,194,71,.1)",border:"1px solid rgba(255,194,71,.25)",borderRadius:5,padding:"2px 6px",fontFamily:T.stats}}>⧉ {session.duplicates} doublon{session.duplicates>1?"s":""}</span>}
          {session.incomplete>0&&<span style={{fontSize:8,fontWeight:700,color:T.red,background:"rgba(255,69,96,.1)",border:"1px solid rgba(255,69,96,.25)",borderRadius:5,padding:"2px 6px",fontFamily:T.stats}}>⚠ {session.incomplete} incomplète{session.incomplete>1?"s":""}</span>}
        </div>
      )}
      <div style={{display:"flex",gap:6,marginTop:8}}>
        <div style={{flex:1,textAlign:"center",background:"rgba(0,0,0,.25)",borderRadius:6,padding:"6px 4px"}}>
          <div style={{fontFamily:T.brand,fontSize:14,fontWeight:900,color:totalBb>=0?T.green:T.red}}>{fmtV(totalBb)}</div>
          <div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>Résultat total</div>
        </div>
        <div style={{flex:1,textAlign:"center",background:"rgba(0,0,0,.25)",borderRadius:6,padding:"6px 4px"}}>
          <div style={{fontFamily:T.brand,fontSize:14,fontWeight:900,color:T.cyan}}>{hands.length?Math.round(wins/hands.length*100):0}%</div>
          <div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>Mains gagnées</div>
        </div>
      </div>
      {best&&<div style={{marginTop:6,fontSize:8.5,color:T.text3,fontFamily:T.stats}}>🏆 Meilleur : <b style={{color:T.green}}>{best.spot} {fmtV(best.resultBb)}</b></div>}
      {worst&&worst.resultBb<0&&<div style={{marginTop:2,fontSize:8.5,color:T.text3,fontFamily:T.stats}}>📉 Pire : <b style={{color:T.red}}>{worst.spot} {fmtV(worst.resultBb)}</b></div>}
    </div>
  );
}

/* ── Résumé main unique ── */
function SingleHandSummary({hand,unit}){
  if(!hand)return null;
  const fmtV=v=>unit==="BB"?`${v>=0?"+":""}${v}bb`:`${v>=0?"+":""}${(v*2).toFixed(1)}$`;
  return(
    <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"11px 12px"}}>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,marginBottom:7}}>Informations de la main</div>
      {[["Site",hand.site],["Format",hand.fmt],["Joueurs",`${hand.tableSize??(hand.seats?.length||0)} joueurs`],["Main ID",`#${hand.handId}`],["Spot",hand.spot],["Date",hand.dateStr||"—"]].map(([l,v])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
          <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{l}</span>
          <span style={{fontSize:8.5,fontWeight:600,color:T.text2,fontFamily:T.stats,maxWidth:"60%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(v)}</span>
        </div>
      ))}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8,padding:"6px 8px",background:"rgba(0,0,0,.25)",borderRadius:6}}>
        <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>Résultat Hero</span>
        <span style={{fontFamily:T.brand,fontSize:15,fontWeight:900,color:hand.resultBb>=0?T.green:T.red}}>{fmtV(hand.resultBb)}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REPLAYER · SOLVER — moteur heuristique (« Analyse estimée »)
   Dérive un scénario depuis la main + step, recommande une action,
   construit les ranges Hero/Vilain (buildSolverFreqs) et l'explication.
═══════════════════════════════════════════════════════════════ */
const SOLVER_VPROFILES=[
  {id:"Nit",adj:{fold:+2,bluff:-1,value:-1}},{id:"Fish",adj:{fold:-2,bluff:-2,value:+2}},
  {id:"TAG",adj:{fold:0,bluff:0,value:0}},{id:"LAG",adj:{fold:-1,bluff:+1,value:0}},
  {id:"Reg",adj:{fold:0,bluff:0,value:0}},{id:"Maniac",adj:{fold:-2,bluff:+2,value:+1}},
];
const RSOLV_MODES=[["gto","GTO"],["exploit","Exploit"],["icm","ICM"],["chipev","ChipEV"]];
const RSOLV_FORMATS=["Cash","MTT","KO","PKO"];
const SOLVER_POS=["UTG","HJ","CO","BTN","SB","BB"];
/* Board "A♥ K♦ 7♣" ou "Ah Kd 7c" → [{r,s}]. Local et tolérant : `parseBoardToken`
   (SharkSolver) n'était pas importé ici ET renvoie {valid,cards:[ints]}, pas un
   tableau — d'où un comptage toujours nul (« board incomplet ») en postflop. */
function ceParseBoardCards(str){
  const m=String(str||"").replace(/10/g,"T").match(/[2-9TJQKAtjqka][shdc♠♥♦♣]/g)||[];
  return m.map(tok=>({r:tok[0].toUpperCase(),s:tok[1]}));
}
function ceBoardCount(str){ return ceParseBoardCards(str).length; }
function scenarioFromHand(hand,step){
  if(!hand||!hand.events)return null;
  try{
    const snap=computeSnapshot(hand,step);
    const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
    const hero=snap.players.find(p=>p.isHero)||snap.players[0];
    const heroPos=hero?.pos||hand.heroPos||"BTN";
    const heroStack=Math.max(0,Math.round(hero?.stack||100));
    let vil=snap.players.find(p=>!p.isHero&&p.pos===hand.vilPos)||snap.players.find(p=>!p.isHero&&!p.folded)||snap.players.find(p=>!p.isHero);
    const vilPos=vil?.pos||hand.vilPos||"BB";
    const vilStack=Math.max(0,Math.round(vil?.stack||100));
    const street=cap(snap.street)||"Preflop";
    const board=(snap.board||[]).map(c=>c.r+c.s).join(" ");
    const heroCards=(hero?.hole||[]).map(c=>c.r+c.s).join(" ");
    /* Action précédente = dernière action d'un ADVERSAIRE sur la MÊME street,
       avant l'étape courante (et non l'action de Hero lui-même — sinon le
       moteur croyait Hero « non confronté » et proposait des alternatives
       d'ouverture face à une mise). */
    const prevEv=hand.events.slice(0,step).reverse()
      .find(e=>["bet","raise","allin","call","check"].includes(e.type)
        && e.playerId!==hand.heroId && e.street===snap.street);
    const prevAction=prevEv?prevEv.label:"—";
    return {format:hand.gameType==="mtt"?"MTT":"Cash",players:snap.players.length,heroPos,vilPos,
      heroStack,vilStack,potBb:Math.round(snap.potTotal*10)/10,board,heroCards,street,prevAction,
      villainProfile:"Reg",mode:"gto"};
  }catch{return null;}
}
const SOLVER_DEFAULT_SC={format:"Cash",players:6,heroPos:"BTN",vilPos:"BB",heroStack:100,vilStack:100,potBb:1.5,board:"",heroCards:"",street:"Preflop",prevAction:"—",villainProfile:"Reg",mode:"gto"};
function solveScenario(sc){
  const fixes=[];
  const need={Preflop:0,Flop:3,Turn:4,River:5}[sc.street]??0;
  const bc=ceBoardCount(sc.board);
  if(sc.heroStack<=0)return {ok:false,error:"Scénario impossible — stack Hero insuffisant.",why:"stack",fix:{heroStack:100}};
  if(sc.heroPos===sc.vilPos)return {ok:false,error:"Scénario incohérent — Hero et Vilain à la même position.",why:"position",fix:{vilPos:sc.heroPos==="BB"?"BTN":"BB"}};
  if(sc.potBb<0)return {ok:false,error:"Scénario incohérent — pot négatif.",why:"pot",fix:{potBb:1.5}};
  if(need>0&&bc<need)return {ok:false,error:`Board incomplet pour ${sc.street} (${bc}/${need} cartes).`,why:"board",fix:{board:["As","Kd","7h","2c","9s"].slice(0,need).join(" ")}};
  const eff=Math.min(sc.heroStack,sc.vilStack);
  const spr=sc.street==="Preflop"?null:Math.round((eff/Math.max(0.5,sc.potBb))*10)/10;
  const exploit=sc.mode==="exploit"; const icm=sc.mode==="icm";
  const prof=SOLVER_VPROFILES.find(p=>p.id===sc.villainProfile)||SOLVER_VPROFILES[4];
  const ip=["BTN","CO","HJ"].includes(sc.heroPos);
  const facing=/raise|bet|3-?bet|all-?in|relance|mise/i.test(sc.prevAction||"");
  let heroAct,vilAct,heroLabel,vilLabel,reco,alts,coach;
  if(sc.street==="Preflop"){
    if(!facing){
      heroAct="rfi"; heroLabel="Open RFI"; vilAct="rfi"; vilLabel="Range d'ouverture";
      const openSz=sc.format==="Cash"?(ip?2.3:2.5):2.1;
      reco={action:"Open",label:`Open ${openSz}bb`,freq:ip?78:62,evBb:+(0.18+(ip?0.06:0)).toFixed(2),sizing:`${openSz}bb`,confidence:"Moyenne"};
      alts=[
        {action:"Open",freq:ip?78:62,evBb:+(0.18).toFixed(2),comment:`Sizing standard ${openSz}bb.`},
        {action:"Fold",freq:ip?20:36,evBb:0,comment:"Mains hors range d'ouverture."},
        {action:"Limp",freq:2,evBb:-0.2,comment:"Rare, déconseillé (sauf SB)."},
      ];
      coach={explanation:`En ${sc.heroPos} (${ip?"in position":"out of position"}), ouvre ta range RFI à ${openSz}bb. Plus tu es proche du bouton, plus ta range s'élargit.`,
        mistake:"Open trop large UTG/HJ ou limp passif.",exploit:`vs ${prof.id} : ${prof.id==="Nit"?"vole plus large ses blindes":prof.id==="Fish"?"value-bet épais post-flop":"reste équilibré"}.`};
    } else {
      heroAct="vs_open"; heroLabel="Défense vs Open"; vilAct="rfi"; vilLabel="Range d'open estimée";
      const threeBetSz=ip?3:4;
      reco={action:eff<25?"3-Bet/Fold":"3-Bet ou Call",label:`3-Bet ${threeBetSz}x ou Call IP`,freq:38,evBb:+0.12,sizing:`${threeBetSz}x`,confidence:"Moyenne"};
      alts=[
        {action:"3-Bet",freq:exploit&&prof.adj.fold>0?24:18,evBb:+0.2,comment:prof.adj.fold>0?"Élargis les bluff-3bets (il sur-fold).":"Value + bluffs équilibrés."},
        {action:"Call",freq:ip?34:22,evBb:+0.08,comment:ip?"Cold-call IP correct.":"Call OOP capé — prudence."},
        {action:"Fold",freq:48,evBb:0,comment:"Défends ~MDF, fold le reste."},
      ];
      coach={explanation:`Face à l'open, en ${sc.heroPos}, choisis entre 3-bet (value+bluff) et call ${ip?"IP":"OOP"}. À ${eff}bb effectifs, ${eff<25?"privilégie 3-bet/fold (peu de jeu post-flop)":"tu peux call et jouer post-flop"}.`,
        mistake:"Cold-call OOP trop large, ou 3-bet sans plan.",exploit:`vs ${prof.id} : ${prof.adj.fold>0?"3-bet bluff plus":prof.adj.fold<0?"value-3bet, coupe les bluffs":"équilibre"}.`};
    }
  } else {
    heroAct="rfi"; heroLabel="Range (continuation)"; vilAct="rfi"; vilLabel="Range estimée";
    const tex=(()=>{try{const cs=ceParseBoardCards(sc.board).slice(0,3);if(cs.length<3)return "—";const rk=cs.map(c=>c.r);const su=cs.map(c=>c.s);const paired=rk[0]===rk[1]||rk[1]===rk[2]||rk[0]===rk[2];const mono=su[0]===su[1]&&su[1]===su[2];return paired?"appariée":mono?"monocolore":"dispersée";}catch{return "—";}})();
    const wet=tex!=="dispersée";
    if(facing){
      const toCall=Math.max(0.5,sc.potBb*0.5); const potOdds=Math.round(toCall/(sc.potBb+toCall)*100);
      reco={action:"Call/Fold selon équité",label:wet?"Prudence (board humide)":"Bluff-catch possible",freq:50,evBb:0,sizing:"—",confidence:"Estimée"};
      alts=[
        {action:"Call",freq:exploit&&prof.adj.fold<0?60:45,evBb:+0.05,comment:`Pot odds ≈ ${potOdds}% — call si ton équité dépasse ce seuil.`},
        {action:"Raise",freq:wet?18:12,evBb:+0.1,comment:wet?"Raise value/semi-bluff sur board dynamique.":"Raise polarisé."},
        {action:"Fold",freq:40,evBb:0,comment:"Fold les mains sous le seuil de pot odds."},
      ];
      coach={explanation:`${sc.street} ${tex}, SPR ${spr}. Face à une mise, compare ton équité aux pot odds (${potOdds}%). ${wet?"Board humide : attention aux tirages.":"Board sec : bluff-catch plus large."}`,
        mistake:"Call river de curiosité / fold trop fort vs sizing faible.",exploit:`vs ${prof.id} : ${prof.adj.bluff>0?"hero-call plus (il bluffe)":prof.adj.value>0?"fold tes bluff-catchs faibles (il value)":"équilibre"}.`};
    } else {
      const cbet=ip?(wet?66:33):(wet?75:40);
      reco={action:"C-bet",label:`C-bet ${cbet}% pot`,freq:wet?55:70,evBb:+0.14,sizing:`${cbet}% pot`,confidence:"Estimée"};
      alts=[
        {action:"Bet",freq:wet?55:70,evBb:+0.14,comment:`Sizing ${cbet}% adapté à un board ${tex}.`},
        {action:"Check",freq:wet?45:30,evBb:+0.05,comment:wet?"Check une partie de ta range sur board humide.":"Check-back tes mains moyennes."},
        {action:"All-in",freq:spr&&spr<2?20:3,evBb:+0.1,comment:spr&&spr<2?"SPR bas : jam value/semi-bluff.":"Réservé aux spots polarisés."},
      ];
      coach={explanation:`${sc.street} ${tex}, SPR ${spr}, ${ip?"IP":"OOP"}. C-bet ${cbet}% : ${wet?"sur board humide, mise plus gros et plus polarisé":"sur board sec, range-bet petit"}.`,
        mistake:"C-bet automatique 100% sur board humide multiway.",exploit:`vs ${prof.id} : ${prof.adj.fold>0?"c-bet bluff plus (il fold trop)":prof.adj.fold<0?"value-bet, coupe les bluffs (il call)":"équilibre"}.`};
    }
  }
  const heroFreqs=buildSolverFreqs(sc.heroPos,heroAct,eff,sc.vilPos);
  const vilFreqs=buildSolverFreqs(sc.vilPos,vilAct,eff,sc.heroPos);
  const heroPct=(()=>{const v=Object.values(heroFreqs);if(!v.length)return 0;const played=v.filter(x=>(x.r||0)+(x.c||0)>=40).length;return Math.round(played/v.length*100);})();
  if(icm&&reco){reco.confidence="ICM (estimée)";if(alts[0])alts[0].comment+=" ⚖ ICM : resserre les call-offs marginaux.";}
  return {ok:true,estimated:true,
    spot:{heroPos:sc.heroPos,heroStack:sc.heroStack,vilPos:sc.vilPos,vilStack:sc.vilStack,street:sc.street,potBb:sc.potBb,spr,board:sc.board,heroCards:sc.heroCards,prevAction:sc.prevAction,eff},
    reco,alts,coach,
    heroRange:{freqs:heroFreqs,label:heroLabel,pos:sc.heroPos,pct:heroPct},
    vilRange:{freqs:vilFreqs,label:vilLabel,pos:sc.vilPos},
    fixes};
}
function loadSolverSpots(){try{return JSON.parse(localStorage.getItem("pf_solver_spots")||"[]");}catch{return [];}}
function saveSolverSpots(a){try{localStorage.setItem("pf_solver_spots",JSON.stringify(a.slice(0,120)));}catch{}}
function ReplayerSolverTab({hand,step,unit,onGoTrainer,onGoRanges}){
  const[sc,setSc]=useState(()=>scenarioFromHand(hand,step)||SOLVER_DEFAULT_SC);
  const[res,setRes]=useState(null);
  const[busy,setBusy]=useState(false);
  const[selH,setSelH]=useState(null);const[hovH,setHovH]=useState(null);
  const[selV,setSelV]=useState(null);const[hovV,setHovV]=useState(null);
  const[toast,setToast]=useState(null);
  const[source,setSource]=useState("local");   // "api" | "local"
  const[libOpen,setLibOpen]=useState(false);const[spots,setSpots]=useState([]);const[spotsSrc,setSpotsSrc]=useState("local");
  const deb=useRef();const reqId=useRef(0);
  const flash=(m)=>{setToast(m);setTimeout(()=>setToast(null),2600);};
  useEffect(()=>{const n=scenarioFromHand(hand,step);if(n)setSc(s=>({...n,villainProfile:s.villainProfile,mode:s.mode}));},[hand,step]);
  // Recalcul temps réel : appel API (edge function) avec fallback local + garde anti-race.
  useEffect(()=>{
    setBusy(true);clearTimeout(deb.current);const myId=++reqId.current;
    deb.current=setTimeout(async()=>{
      let r=null,src="local";
      const api=await apiSolverAnalyze(sc).catch(()=>({_neterr:true}));
      if(api&&!api._neterr&&api.ok===true){
        const eff=api.spot&&api.spot.eff!=null?api.spot.eff:Math.min(sc.heroStack,sc.vilStack);
        const ha=(api.ranges&&api.ranges.heroAction)||"rfi", va=(api.ranges&&api.ranges.vilAction)||"rfi";
        const heroFreqs=buildSolverFreqs(sc.heroPos,ha,eff,sc.vilPos);
        const vilFreqs=buildSolverFreqs(sc.vilPos,va,eff,sc.heroPos);
        const vals=Object.values(heroFreqs);const heroPct=vals.length?Math.round(vals.filter(x=>(x.r||0)+(x.c||0)>=40).length/vals.length*100):0;
        r={...api,heroRange:{freqs:heroFreqs,label:(api.ranges&&api.ranges.heroLabel)||"Range",pos:sc.heroPos,pct:heroPct},vilRange:{freqs:vilFreqs,label:(api.ranges&&api.ranges.vilLabel)||"Range",pos:sc.vilPos}};
        src="api";
      } else if(api&&!api._neterr&&api.ok===false){
        r=api;src="api"; // scénario impossible validé côté serveur
      } else {
        try{r=solveScenario(sc);}catch(e){r={ok:false,error:"Erreur d'analyse — scénario non résolu."};}
        src="local";
      }
      if(reqId.current!==myId)return; // résultat périmé → ignoré
      setRes(r);setSource(src);setBusy(false);
    },330);
    return()=>clearTimeout(deb.current);
  },[sc]);
  const upd=(k,v)=>setSc(s=>({...s,[k]:v}));
  const resync=()=>{const n=scenarioFromHand(hand,step);if(n){setSc(s=>({...n,villainProfile:s.villainProfile,mode:s.mode}));flash("↻ Resynchronisé sur la main");}};
  const sel={padding:"5px 7px",borderRadius:7,border:"1px solid #1A3A80",background:"#030D2A",color:T.text2,fontSize:10,fontFamily:T.stats,outline:"none",width:"100%"};
  const lbl={fontSize:8.5,color:T.text4,fontFamily:T.stats,fontWeight:700,letterSpacing:".04em",marginBottom:3,display:"block"};
  async function saveSpot(){
    const api=await apiSaveSpot({handId:hand?.handId,street:sc.street,heroPos:sc.heroPos,vilPos:sc.vilPos,scenario:sc,result:res&&res.ok?{reco:res.reco,alts:res.alts}:null,reco:res?.reco?.label});
    if(api&&api.ok){flash("✓ Spot sauvegardé sur ton compte");return;}
    const sp=loadSolverSpots();sp.unshift({id:Date.now(),handId:hand?.handId||null,street:sc.street,heroPos:sc.heroPos,vilPos:sc.vilPos,reco:res?.reco?.label,mode:sc.mode,board:sc.board,heroCards:sc.heroCards,date:new Date().toISOString().slice(0,10),tags:[]});saveSolverSpots(sp);
    flash(api&&api.offline?"✓ Spot sauvegardé en local (connecte-toi pour le cloud)":"✓ Spot sauvegardé en local");
  }
  async function compareRanges(){
    if(!res||!res.ok){flash("Pas de range à comparer");return;}
    const c=await apiRangesCompare(res.heroRange.freqs,res.vilRange.freqs,"r");
    if(c&&c.ok)flash(`Ranges (raise) — communs ${c.both} · Hero seul ${c.onlyA} · Vilain seul ${c.onlyB} · overlap ${c.overlapPct}%`);
    else flash("Comparaison indisponible (hors-ligne)");
  }
  function sendTrainer(){onGoTrainer&&onGoTrainer({hpos:sc.heroPos,vpos:sc.vilPos,street:sc.street,tableSize:sc.players});}
  async function openLib(){
    const api=await apiListSpots();
    if(api&&api.ok){setSpots(api.spots||[]);setSpotsSrc("cloud");}
    else{setSpots(loadSolverSpots());setSpotsSrc("local");}
    setLibOpen(true);
  }
  function applySpot(sp){
    const scn=(sp.scenario&&Object.keys(sp.scenario).length)?sp.scenario
      :{street:sp.street,heroPos:sp.hero_pos||sp.heroPos,vilPos:sp.vil_pos||sp.vilPos,board:sp.board||"",heroCards:sp.heroCards||"",mode:sp.mode||"gto"};
    setSc(s=>({...s,...scn}));setLibOpen(false);flash("✓ Spot chargé dans le Solver");
  }
  async function delSpot(sp){
    if(spotsSrc==="cloud"){await apiDeleteSpot(sp.id);}
    else{const next=loadSolverSpots().filter(x=>x.id!==sp.id);saveSolverSpots(next);}
    openLib();
  }
  const spotPos=(sp)=>`${sp.hero_pos||sp.heroPos||"?"} vs ${sp.vil_pos||sp.vilPos||"?"}`;
  const spotDate=(sp)=>String(sp.created_at||sp.date||"").slice(0,10);
  return(
    <div style={{flex:1,overflow:"auto",padding:"14px 16px",background:"#030712",position:"relative"}}>
      {toast&&<div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",zIndex:20,background:"rgba(8,20,48,.97)",border:"1px solid rgba(52,216,255,.4)",borderRadius:9,padding:"7px 16px",color:T.text,fontSize:10.5,fontFamily:T.stats}}>{toast}</div>}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontFamily:T.brand,fontSize:14,fontWeight:900,color:T.cyan,letterSpacing:".04em"}}>🎯 SOLVER</span>
        {(()=>{
          const real=res&&res.ok&&res.estimated===false;
          const eng=res&&res.ok?res.engine:null;
          const engLbl=eng==="pro"?"● Solver Pro":eng==="external"?"● Solver externe":source==="api"?"● API solver-analyze":"○ moteur local";
          const engOn=eng==="pro"||eng==="external";
          return(<>
            <span style={{fontSize:7.5,fontWeight:800,color:real?"#10D87A":T.amber,background:real?"rgba(16,216,122,.12)":"rgba(255,194,71,.1)",border:`1px solid ${real?"rgba(16,216,122,.35)":"rgba(255,194,71,.32)"}`,borderRadius:8,padding:"2px 7px",fontFamily:T.stats}}>{real?"ÉQUITÉ RÉELLE":"ANALYSE ESTIMÉE"}</span>
            <span style={{fontSize:7.5,fontWeight:700,color:engOn?"#10D87A":source==="api"?"#7EB8FF":T.text4,background:engOn?"rgba(16,216,122,.1)":"rgba(255,255,255,.04)",border:`1px solid ${engOn?"rgba(16,216,122,.3)":"#1A3A80"}`,borderRadius:8,padding:"2px 7px",fontFamily:T.stats}}>{engLbl}</span>
          </>);
        })()}
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          {hand&&<div className="cai-btn cai-btn-ghost" style={{padding:"4px 10px",fontSize:9}} onClick={resync}>↻ Resync main</div>}
        </div>
      </div>
      <div className="rep-solver-grid" style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:14,alignItems:"start"}}>
        <div style={{background:"#050E28",border:"1px solid #152D6E",borderRadius:12,padding:"12px"}}>
          <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",fontWeight:700,marginBottom:9}}>SCÉNARIO</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><span style={lbl}>Format</span><select style={sel} value={sc.format} onChange={e=>upd("format",e.target.value)}>{RSOLV_FORMATS.map(f=><option key={f}>{f}</option>)}</select></div>
            <div><span style={lbl}>Joueurs</span><select style={sel} value={sc.players} onChange={e=>upd("players",parseInt(e.target.value))}>{[2,3,4,5,6,7,8,9].map(n=><option key={n} value={n}>{n}</option>)}</select></div>
            <div><span style={lbl}>Hero pos</span><select style={sel} value={sc.heroPos} onChange={e=>upd("heroPos",e.target.value)}>{SOLVER_POS.map(p=><option key={p}>{p}</option>)}</select></div>
            <div><span style={lbl}>Vilain pos</span><select style={sel} value={sc.vilPos} onChange={e=>upd("vilPos",e.target.value)}>{SOLVER_POS.map(p=><option key={p}>{p}</option>)}</select></div>
            <div><span style={lbl}>Stack Hero (bb)</span><input style={sel} type="number" value={sc.heroStack} onChange={e=>upd("heroStack",Math.max(0,parseFloat(e.target.value)||0))}/></div>
            <div><span style={lbl}>Stack Vilain (bb)</span><input style={sel} type="number" value={sc.vilStack} onChange={e=>upd("vilStack",Math.max(0,parseFloat(e.target.value)||0))}/></div>
            <div><span style={lbl}>Street</span><select style={sel} value={sc.street} onChange={e=>upd("street",e.target.value)}>{["Preflop","Flop","Turn","River"].map(s=><option key={s}>{s}</option>)}</select></div>
            <div><span style={lbl}>Pot (bb)</span><input style={sel} type="number" value={sc.potBb} onChange={e=>upd("potBb",Math.max(0,parseFloat(e.target.value)||0))}/></div>
          </div>
          <div style={{marginTop:8}}><span style={lbl}>Cartes Hero</span><input style={sel} value={sc.heroCards} onChange={e=>upd("heroCards",e.target.value)} placeholder="As Kh"/></div>
          <div style={{marginTop:8}}><span style={lbl}>Board</span><input style={sel} value={sc.board} onChange={e=>upd("board",e.target.value)} placeholder="Ks 7h 2c"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
            <div><span style={lbl}>Profil Vilain</span><select style={sel} value={sc.villainProfile} onChange={e=>upd("villainProfile",e.target.value)}>{SOLVER_VPROFILES.map(p=><option key={p.id}>{p.id}</option>)}</select></div>
            <div><span style={lbl}>Mode</span><select style={sel} value={sc.mode} onChange={e=>upd("mode",e.target.value)}>{RSOLV_MODES.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:12}}>
            <div className="cai-btn cai-btn-ghost" style={{fontSize:9.5}} onClick={()=>onGoRanges&&onGoRanges()}>📊 Voir la range complète</div>
            <div className="cai-btn cai-btn-ghost" style={{fontSize:9.5}} onClick={compareRanges}>🔀 Comparer 2 ranges</div>
            <div className="cai-btn cai-btn-ghost" style={{fontSize:9.5}} onClick={sendTrainer}>🎯 Envoyer vers Training</div>
            <div className="cai-btn" style={{fontSize:9.5}} onClick={saveSpot}>💾 Sauvegarder le spot</div>
            <div className="cai-btn cai-btn-ghost" style={{fontSize:9.5}} onClick={openLib}>📚 Mes spots sauvegardés</div>
          </div>
        </div>
        <div style={{position:"relative",minHeight:200}}>
          {busy&&<div style={{position:"absolute",inset:0,zIndex:10,background:"rgba(3,7,18,.55)",backdropFilter:"blur(2px)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,color:T.cyan,fontFamily:T.stats,fontSize:11}}><div className="aidot"/><div className="aidot"/><div className="aidot"/> Analyse en cours…</div>
          </div>}
          {res&&!res.ok&&(
            <div style={{background:"rgba(255,69,96,.06)",border:"1px solid rgba(255,69,96,.3)",borderRadius:12,padding:"18px"}}>
              <div style={{fontFamily:T.brand,fontSize:14,fontWeight:800,color:T.red,marginBottom:6}}>⚠ Scénario impossible ou incomplet</div>
              <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,marginBottom:10}}>{res.error}</div>
              {res.fix&&<div className="cai-btn cai-btn-ghost" style={{width:"fit-content"}} onClick={()=>setSc(s=>({...s,...res.fix}))}>✦ Corriger automatiquement</div>}
            </div>
          )}
          {res&&res.ok&&(<>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10,alignItems:"center"}}>
              {res.spot.equity!=null&&(
                <span style={{padding:"3px 11px",borderRadius:14,fontSize:10,fontWeight:800,fontFamily:T.stats,
                  color:res.spot.equity>=55?"#10D87A":res.spot.equity>=40?T.gold:"#FF6B7A",
                  background:res.spot.equity>=55?"rgba(16,216,122,.12)":res.spot.equity>=40?"rgba(255,194,71,.1)":"rgba(255,69,96,.1)",
                  border:`1px solid ${res.spot.equity>=55?"rgba(16,216,122,.4)":res.spot.equity>=40?"rgba(255,194,71,.35)":"rgba(255,69,96,.35)"}`,
                  boxShadow:res.spot.equity>=55?"0 0 10px rgba(16,216,122,.2)":"none"}}>⚡ Équité {res.spot.equity}%</span>
              )}
              {[`${res.spot.heroPos} ${res.spot.heroStack}bb`,`vs ${res.spot.vilPos} ${res.spot.vilStack}bb`,res.spot.street,`Pot ${res.spot.potBb}bb`,res.spot.spr!=null?`SPR ${res.spot.spr}`:null,res.spot.board?`Board ${res.spot.board}`:null,res.spot.heroCards?`Hero ${res.spot.heroCards}`:null].filter(Boolean).map((x,i)=>(
                <span key={i} style={{padding:"3px 9px",borderRadius:14,fontSize:9,fontWeight:600,color:T.text2,background:"rgba(255,255,255,.04)",border:"1px solid #1A3A80",fontFamily:T.stats}}>{x}</span>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}} className="rep-solver-reco">
              <div style={{background:"#050E28",border:"1px solid rgba(52,216,255,.3)",borderRadius:12,padding:"13px 15px"}}>
                <div style={{fontSize:8.5,color:T.cyan,fontFamily:T.stats,letterSpacing:".1em",fontWeight:700,marginBottom:6}}>RECOMMANDATION</div>
                <div style={{fontFamily:T.brand,fontSize:17,fontWeight:900,color:"#fff"}}>{res.reco.label}</div>
                <div style={{display:"flex",gap:14,marginTop:8}}>
                  <div><div style={{fontSize:13,fontWeight:800,color:T.green,fontFamily:T.stats}}>{res.reco.freq}%</div><div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>Fréquence</div></div>
                  <div><div style={{fontSize:13,fontWeight:800,color:res.reco.evBb>=0?T.green:T.red,fontFamily:T.stats}}>{res.reco.evBb>=0?"+":""}{res.reco.evBb}bb</div><div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>{res.estimated===false?"EV (équité)":"EV estimée"}</div></div>
                  <div><div style={{fontSize:13,fontWeight:800,color:T.gold,fontFamily:T.stats}}>{res.reco.sizing}</div><div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>Sizing</div></div>
                </div>
                <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,marginTop:8,fontStyle:"italic"}}>Confiance : {res.reco.confidence}</div>
              </div>
              <div style={{background:"#050E28",border:"1px solid #152D6E",borderRadius:12,padding:"13px 15px"}}>
                <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",fontWeight:700,marginBottom:6}}>ACTIONS ALTERNATIVES</div>
                {res.alts.map((a,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:i<res.alts.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
                    <span style={{fontSize:10.5,fontWeight:700,color:T.text2,minWidth:54}}>{a.action}</span>
                    <span style={{fontSize:9,color:T.cyan,fontFamily:T.stats,minWidth:34}}>{a.freq}%</span>
                    <span style={{fontSize:9,color:a.evBb>=0?T.green:T.red,fontFamily:T.stats,minWidth:42}}>{a.evBb>=0?"+":""}{a.evBb}bb</span>
                    <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,flex:1,lineHeight:1.4}}>{a.comment}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:16,marginBottom:12,background:"#050E28",border:"1px solid #152D6E",borderRadius:12,padding:"14px"}}>
              <div style={{flex:1,minWidth:280}}>
                <SolverMatrixGrid title="RANGE HERO" posLabel={`${res.heroRange.label} · ${res.heroRange.pct}%`} freqs={res.heroRange.freqs} pac={{label:"Jouée"}} scenario={{stack:res.spot.eff}} mode={sc.mode==="exploit"?"exploit":"gto"} side="hero" selectedCell={selH} setSelectedCell={setSelH} hoveredCell={hovH} setHoveredCell={setHovH} filterAction="all" cellSize={20}/>
              </div>
              <div style={{flex:1,minWidth:280}}>
                <SolverMatrixGrid title="RANGE VILAIN" posLabel={`${res.vilRange.label} · ${sc.villainProfile}`} freqs={res.vilRange.freqs} pac={{label:"Jouée"}} scenario={{stack:res.spot.eff}} mode={sc.mode==="exploit"?"exploit":"gto"} side="villain" selectedCell={selV} setSelectedCell={setSelV} hoveredCell={hovV} setHoveredCell={setHovV} filterAction="all" cellSize={20}/>
              </div>
            </div>
            <div style={{background:"rgba(255,138,61,.05)",border:"1px solid rgba(255,138,61,.25)",borderRadius:12,padding:"13px 15px"}}>
              <div style={{fontSize:8.5,color:"#FF8A3D",fontFamily:T.stats,letterSpacing:".1em",fontWeight:700,marginBottom:6}}>🧠 EXPLICATION COACH IA</div>
              <div style={{fontSize:10.5,color:T.text2,lineHeight:1.6,marginBottom:7}}>{res.coach.explanation}</div>
              <div style={{fontSize:9.5,color:T.red,fontFamily:T.stats,marginBottom:3}}>⚠ Erreur fréquente : {res.coach.mistake}</div>
              <div style={{fontSize:9.5,color:"#FF8A3D",fontFamily:T.stats}}>🎯 Exploit : {res.coach.exploit}</div>
            </div>
          </>)}
        </div>
      </div>

      {/* ── BIBLIOTHÈQUE DE SPOTS SAUVEGARDÉS ── */}
      {libOpen&&(
        <div style={{position:"absolute",inset:0,zIndex:30,background:"rgba(3,7,18,.78)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"30px 16px",overflow:"auto"}} onMouseDown={e=>{if(e.target===e.currentTarget)setLibOpen(false);}}>
          <div style={{width:"100%",maxWidth:560,background:"#050E28",border:"1px solid rgba(52,216,255,.3)",borderRadius:14,padding:"16px",boxShadow:"0 24px 60px rgba(0,0,0,.6)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <span style={{fontFamily:T.brand,fontSize:13,fontWeight:900,color:T.cyan}}>📚 Mes spots sauvegardés</span>
              <span style={{fontSize:8,fontWeight:700,color:spotsSrc==="cloud"?"#10D87A":T.text4,background:spotsSrc==="cloud"?"rgba(16,216,122,.1)":"rgba(255,255,255,.04)",border:`1px solid ${spotsSrc==="cloud"?"rgba(16,216,122,.3)":"#1A3A80"}`,borderRadius:8,padding:"1px 7px",fontFamily:T.stats}}>{spotsSrc==="cloud"?"● compte":"○ local"}</span>
              <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>{spots.length} spot{spots.length>1?"s":""}</span>
              <div className="cai-btn cai-btn-ghost" style={{marginLeft:"auto",padding:"3px 9px",fontSize:9}} onClick={()=>setLibOpen(false)}>✕ Fermer</div>
            </div>
            {spotsSrc==="local"&&<div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,marginBottom:8,fontStyle:"italic"}}>Connecte-toi pour sauvegarder tes spots sur ton compte (cross-device).</div>}
            {spots.length===0?(
              <div style={{textAlign:"center",color:T.text4,fontFamily:T.stats,fontSize:10,padding:"24px"}}>Aucun spot sauvegardé. Utilise « 💾 Sauvegarder le spot ».</div>
            ):spots.map((sp,i)=>(
              <div key={sp.id||i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",marginBottom:5,borderRadius:9,background:"rgba(255,255,255,.02)",border:"1px solid #0F2258"}}>
                <span style={{fontSize:8,fontWeight:700,color:T.gold,fontFamily:T.stats,minWidth:42}}>{sp.street||"—"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10.5,fontWeight:700,color:T.text2}}>{spotPos(sp)}</div>
                  <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sp.reco||"—"} · {spotDate(sp)||"—"}</div>
                </div>
                <div className="cai-btn cai-btn-ghost" style={{padding:"4px 9px",fontSize:9,flexShrink:0}} onClick={()=>applySpot(sp)}>Charger</div>
                <div onClick={()=>delSpot(sp)} title="Supprimer" style={{cursor:"pointer",color:T.text4,fontSize:13,flexShrink:0,padding:"0 4px"}}>🗑</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReplayerTab({unit,onGoTrainer,onGoCoach,onGoRanges,initialText,onInitialApplied,initialTab="replay",onInitialTabApplied}){
  const REPLAYER_ACTIVE_TABS=["replay","ai","solver","ranges","notes"];
  const[repTab,setRepTab]=useState(REPLAYER_ACTIVE_TABS.includes(initialTab)?initialTab:"replay");
  const[rightTab,setRightTab]=useState("analyse");
  const[notes,setNotes]=useState(()=>repLoadNotes());
  const[hh,setHh]=useState("");
  const[hand,setHand]=useState(null);
  const[step,setStep]=useState(0);
  const[playing,setPlaying]=useState(false);
  const[playSpeed,setPlaySpeed]=useState(1);
  const[quickRes,setQuickRes]=useState(null);
  const[handList,setHandList]=useState(()=>loadHands());
  const[selHand,setSelHand]=useState(null);
  /* Analyse IA : état unique partagé par le bouton de gauche et le panneau droit.
     status : idle | loading | ready | error (§17/§18). */
  const[ai,setAi]=useState({status:"idle",analysis:null,meta:null,error:null,stepIndex:0});
  const[aiMode,setAiMode]=useState("decision");   // §11/§12
  const[signedIn,setSignedIn]=useState(false);    // §22 : l'endpoint exige une session
  const[toast,setToast]=useState(null);
  const[dragOver,setDragOver]=useState(false);
  const[cinema,setCinema]=useState(false);
  const[libQuery,setLibQuery]=useState("");
  const[session,setSession]=useState(null);   // replayerStore : session parsée (lot actif)
  const[lotsRaw,setLotsRaw]=useState(null);    // §4 : tous les lots (mains brutes non hydratées)
  const[lotIdx,setLotIdx]=useState(0);         // lot actif
  const[importInfo,setImportInfo]=useState(null); // §6/§31 : comptes de validation
  const[handIdx,setHandIdx]=useState(0);       // index de la main active
  const[importMode,setImportMode]=useState("session"); // "session" | "single"
  const fileRef=useRef();const playRef=useRef();
  const fmt=v=>unit==="BB"?`${v}bb`:`${(v*2).toFixed(0)}$`;
  const SITES=[{n:"PokerStars",c:"#FFC247"},{n:"Winamax",c:"#FF4560"},{n:"GGPoker",c:"#1F8BFF"},{n:"888",c:"#10D87A"},{n:"PMU",c:"#FF4560"}];

  function showToast(msg,type="info"){setToast({msg,type});setTimeout(()=>setToast(null),3500);}

  /* Session Supabase — l'analyse IA passe par un endpoint authentifié (§22). */
  useEffect(()=>{
    let alive=true;
    getSession().then(s=>{ if(alive) setSignedIn(!!s); }).catch(()=>{});
    const unsub=onAuthChange(s=>setSignedIn(!!s));
    return()=>{alive=false;try{unsub&&unsub();}catch{}};
  },[]);

  /* Charge un texte (fichier complet OU main collée) → session + 1ʳᵉ main */
  /* Hydrate un lot (mains brutes → mains prêtes pour le rejeu). */
  function activateLot(lots,li,parsed,forceSingle){
    const raw=lots[li]||[];
    const hands=(forceSingle?raw.slice(0,1):raw).map(hydrateReplayHand);
    const sess={...parsed, site:parsed.room, hands, count:hands.length,
      single:forceSingle||parsed.total<=1, lotIndex:li, lotCount:lots.length};
    setSession(sess);setLotIdx(li);setHandIdx(0);
    setHand(hands[0]);setStep(0);resetAi();setPlaying(false);
    setQuickRes(quickAnalysis(hands[0]?.raw||""));
    setImportMode(sess.single?"single":"session");
    return sess;
  }
  function switchLot(li){
    if(!lotsRaw||li<0||li>=lotsRaw.length||li===lotIdx)return;
    activateLot(lotsRaw,li,importInfo?.parsed||session,false);
    showToast(`Lot ${li+1}/${lotsRaw.length} — ${lotsRaw[li].length} mains`,"info");
  }
  function loadFromText(txt,forceSingle){
    if(!txt||txt.trim().length<20){showToast("⚠ Texte trop court ou vide","warn");return;}
    const parsed=pfParseSessionV2(txt);
    if(!parsed.imported){showToast("❌ Aucune main valide détectée","error");return;}
    const lots=forceSingle?[parsed.hands.slice(0,1)]:parsed.lots;
    setLotsRaw(lots);
    setImportInfo({detected:parsed.detected,imported:parsed.imported,duplicates:parsed.duplicates,
      incomplete:parsed.incomplete,lotCount:lots.length,site:parsed.site,parsed});
    activateLot(lots,0,parsed,forceSingle);
    // Résumé de validation (§6/§31)
    const parts=[`${forceSingle?1:parsed.imported} main${(forceSingle?1:parsed.imported)>1?"s":""} importée${(forceSingle?1:parsed.imported)>1?"s":""}`];
    if(parsed.duplicates)parts.push(`${parsed.duplicates} doublon${parsed.duplicates>1?"s":""} ignoré${parsed.duplicates>1?"s":""}`);
    if(parsed.incomplete)parts.push(`${parsed.incomplete} incomplète${parsed.incomplete>1?"s":""}`);
    if(!forceSingle&&lots.length>1)parts.push(`${lots.length} lots`);
    showToast(`✓ ${parts.join(" · ")} — ${parsed.site}`,"success");
  }
  function loadHandAt(i){
    if(!session||i<0||i>=session.hands.length)return;
    setHandIdx(i);setHand(session.hands[i]);setStep(0);setPlaying(false);resetAi();
    setQuickRes(quickAnalysis(session.hands[i].raw||""));
  }
  const goPrevHand=()=>session&&loadHandAt(Math.max(0,handIdx-1));
  const goNextHand=()=>session&&loadHandAt(Math.min((session.hands.length-1),handIdx+1));

  function handleFile(e){
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();r.onload=ev=>{setHh(ev.target.result);loadFromText(ev.target.result,importMode==="single");};r.readAsText(f,"utf-8");
  }
  function handleDrop(e){
    e.preventDefault();setDragOver(false);
    const file=e.dataTransfer.files[0];
    if(file){const r=new FileReader();r.onload=ev=>{setHh(ev.target.result);loadFromText(ev.target.result,importMode==="single");};r.readAsText(file,"utf-8");}
    else{const text=e.dataTransfer.getData("text");if(text.length>20){setHh(text);loadFromText(text,importMode==="single");}}
  }
  /* Main envoyée depuis Coach AI → chargée automatiquement */
  useEffect(()=>{
    if(initialText&&initialText.trim().length>20){
      setHh(initialText);
      try{loadFromText(initialText,true);}catch{}
      onInitialApplied&&onInitialApplied();
    }
  },[initialText]);
  useEffect(()=>{
    if(REPLAYER_ACTIVE_TABS.includes(initialTab)){
      setRepTab(initialTab);
      onInitialTabApplied&&onInitialTabApplied();
    }
  },[initialTab]);
  /* Navigation clavier : ← précédent · → suivant · espace play/pause */
  useEffect(()=>{
    function onKey(e){
      if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))return;
      if(e.key==="ArrowLeft"){goPrevHand();}
      else if(e.key==="ArrowRight"){goNextHand();}
      else if(e.key===" "&&hand){e.preventDefault();setPlaying(p=>!p);}
    }
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[session,handIdx,hand]);
  useEffect(()=>{
    if(playing&&hand){
      const iv=Math.round(1000/playSpeed);
      playRef.current=setInterval(()=>setStep(s=>{if(s>=hand.actions.length-1){setPlaying(false);clearInterval(playRef.current);return s;}return s+1;}),iv);
    }else clearInterval(playRef.current);
    return()=>clearInterval(playRef.current);
  },[playing,hand,playSpeed]);

  /* ══════════════════════════════════════════════════════════════
     ANALYSE IA (§4/§7/§17/§18/§20)

     Chaîne stricte, sans raccourci :
       main normalisée → HandState (§6) → SharkSolver/équité (§7) →
       backend PokerForge (§4) → OpenAI → explication structurée (§10).

     Le navigateur n'a aucune clé et n'appelle aucun fournisseur d'IA.
     Les chiffres affichés proviennent du package solveur, jamais du modèle.
  ══════════════════════════════════════════════════════════════ */
  const aiSeq=useRef(0);
  async function deepAnalyze(mode){
    const wanted=mode||aiMode;
    if(!hand){showToast("⚠ Importe d'abord une main","warn");return;}
    if(!handState){showToast("⚠ Main illisible — réimporte la hand history","warn");return;}
    if(!_canCallApi()){showToast(`⏳ Réessayez dans ${_secondsUntilNextCall()}s`,"warn");return;}

    const seq=++aiSeq.current;                     // §21 : une seule analyse fait foi
    setAiMode(wanted);setRightTab("ai");
    setAi({status:"loading",analysis:null,meta:null,error:null,stepIndex:0});
    const tick=setInterval(()=>setAi(a=>a.status==="loading"
      ?{...a,stepIndex:Math.min(LOADING_STEPS.length-1,a.stepIndex+1)}:a),1400);
    try{
      const res=await analyzeWithCache({
        handState, solverData:solverPkg, analysisMode:wanted,
        step:wanted==="decision"?snapStep:null, language:"fr",
      });
      clearInterval(tick);
      if(seq!==aiSeq.current)return;               // analyse obsolète (main changée)
      if(!res.ok){
        setAi({status:"error",analysis:null,meta:null,error:res.error,stepIndex:0});
        showToast(`⚠ ${res.error.title}`,"warn");
        return;
      }
      setAi({status:"ready",analysis:res.analysis,meta:res.meta,error:null,stepIndex:LOADING_STEPS.length});
      if(res.meta?.cache!=="HIT")incrementAnalysesCount();
      /* Historique local (§28) : on garde une trace lisible dans la bibliothèque. */
      const saved={id:Date.now(),desc:`${hand?.site||"?"} — ${new Date().toLocaleTimeString()}`,
        score:quickRes?.score||"?",site:hand?.site||"?",gameType:hand?.gameType||"cash",
        handId:handState.handId,mode:wanted,analysis:res.analysis?.summary||""};
      const newList=[saved,...handList];setHandList(newList);saveHands(newList);
      showToast(res.meta?.cache==="HIT"?"✓ Analyse récupérée du cache":"✓ Analyse terminée","success");
    }catch{
      clearInterval(tick);
      if(seq!==aiSeq.current)return;
      setAi({status:"error",analysis:null,meta:null,
        error:{title:"Analyse IA indisponible",
          message:"Analyse IA temporairement indisponible. Les données SharkSolver restent accessibles.",
          retryable:true},stepIndex:0});
    }
  }

  const cur=hand?.actions[Math.max(0,Math.min(step,(hand?.actions?.length||1)-1))];

  /* ── Moteur de rejeu immersif : snapshots + animations (§10–18/§37) ── */
  const snaps=hand?._snaps||null;
  const stepMax=snaps?snaps.length-1:0;
  const snapStep=snaps?Math.max(0,Math.min(step,stepMax)):0;
  const snap=snaps?snaps[snapStep]:null;
  const prevSnap=snaps?(snaps[snapStep-1]||null):null;
  /* Les ancres de mise/dealer sont calculées PAR LA TABLE (elle seule connaît
     sa taille réelle et l'emprise mesurée des blocs sièges) — cf. §24 : plus
     aucune géométrie dupliquée ici. */
  const sampleHand=useMemo(()=>{const s=pfParseSessionV2(SAMPLE_HH);return s.hands[0]?hydrateReplayHand(s.hands[0]):null;},[]);
  /* Contexte d'analyse (§22) : le scénario vient du snapshot, la référence
     stratégique du solveur quand c'est solvable, sinon du moteur heuristique. */
  /* ══════════════════════════════════════════════════════════════
     SOLVEUR CFR POSTFLOP — pré-solve en arrière-plan (§19)

     Le solve est synchrone et CPU-bound (~0,6 à 10 s) : il vit dans un Web
     Worker, jamais sur le thread principal. Le rejeu reste donc fluide et la
     décision affichée est d'abord heuristique ; quand le CFR arrive, il la
     REMPLACE et le badge passe de « HEURISTIQUE » à « CFR ».

     Les résultats sont mémorisés par étape (`cfrByStep`) : revenir sur une
     décision déjà résolue est instantané, et l'analyse de toute la main
     bénéficie de tout ce qui a été calculé pendant que l'utilisateur navigue.
     Si les Workers sont indisponibles (build standalone en fichier unique),
     on reste simplement sur l'heuristique — sans rien annoncer de faux.
  ══════════════════════════════════════════════════════════════ */
  const[cfrByStep,setCfrByStep]=useState({});
  const[cfrSolving,setCfrSolving]=useState(false);
  const cfrHandRef=useRef(null);

  const analysisCtx=useMemo(()=>({
    buildScenario:scenarioFromHand, solve:solveScenario, cfr:cfrByStep,
  }),[cfrByStep]);

  /* ── HandState normalisé (§6) : forme unique envoyée au backend ── */
  const handState=useMemo(()=>hand?buildHandState(hand):null,[hand]);
  /* ── Package solveur (§7) : calculé UNE FOIS par main (l'équité Monte-Carlo
     ne doit pas être relancée à chaque déplacement du curseur). ── */
  /* L'équité (Monte-Carlo) ne dépend que de la main : calculée une seule fois,
     elle n'est pas relancée à chaque solution CFR qui arrive. */
  const heroEq=useMemo(()=>handState?heroEquity(handState):null,[handState]);
  const solverBase=useMemo(()=>(hand&&snaps&&handState)
    ?buildSolverPackage(hand,snaps,handState,analysisCtx,{equity:heroEq}):null,
    [hand,snaps,handState,analysisCtx,heroEq]);
  /* ── Décision ciblée : suit le curseur, sans recalculer le reste. ── */
  const solverPkg=useMemo(()=>{
    if(!solverBase)return null;
    const target=buildTarget(hand,snaps,analysisCtx,snapStep);
    const sources=new Set(solverBase.sources);
    if(target)sources.add(target.source);
    return {...solverBase,target,sources:[...sources]};
  },[solverBase,hand,snaps,analysisCtx,snapStep]);
  /* Nouvelle main → on repart d'un cache vide (les étapes ne désignent plus
     les mêmes décisions). */
  useEffect(()=>{
    if(cfrHandRef.current!==hand?.id){cfrHandRef.current=hand?.id||null;setCfrByStep({});setCfrSolving(false);}
  },[hand?.id]);

  /* Décisions Hero résolubles par le CFR dans cette main. */
  const cfrSteps=useMemo(()=>(hand&&snaps)?solvableSteps(hand,snaps):[],[hand,snaps]);

  /* Pré-solve : la décision sous le curseur d'abord (c'est celle que
     l'utilisateur regarde), puis les autres, une à la fois pour ne pas saturer
     le worker. Un résultat périmé (main changée) est ignoré. */
  useEffect(()=>{
    if(!hand||!snaps||!cfrSteps.length||!isCfrWorkerAvailable())return;
    const pending=cfrSteps.filter(s=>!cfrByStep[s]);
    if(!pending.length){setCfrSolving(false);return;}
    // Priorité à l'étape courante, sinon la plus proche du curseur.
    const target=pending.includes(snapStep)?snapStep
      :pending.slice().sort((a,b)=>Math.abs(a-snapStep)-Math.abs(b-snapStep))[0];
    const built=buildReplayerCfrRequest(hand,snaps,target);
    if(!built){setCfrByStep(m=>({...m,[target]:{unsolvable:true}}));return;}
    const myHand=hand.id;let cancelled=false;
    setCfrSolving(true);
    solvePostflopAsync(built.request).then(res=>{
      if(cancelled||cfrHandRef.current!==myHand)return;      // résultat périmé
      const block=cfrResultToBlock(res,built);
      // Un échec est mémorisé aussi : sans ça on relancerait le même solve en
      // boucle à chaque rendu.
      setCfrByStep(m=>({...m,[target]:block||{unsolvable:true,reason:res?.reason||"no-solution"}}));
      setCfrSolving(false);
    });
    return()=>{cancelled=true;};
  },[hand,snaps,cfrSteps,cfrByStep,snapStep]);

  /* ── Motifs & tendances (§13/§14) : agrégat local alimenté par les mains vues. ── */
  const [leakAgg,setLeakAgg]=useState(null);
  useEffect(()=>{
    if(!hand||!snaps)return;
    try{ setLeakAgg(recordHand(hand,snaps,solverBase?.decisions||[])); }catch{}
  },[hand,snaps]); // eslint-disable-line react-hooks/exhaustive-deps
  function resetAi(){setAi({status:"idle",analysis:null,meta:null,error:null,stepIndex:0});}

  /* ── §31 — Caractéristiques STRATÉGIQUES du spot courant ──
     Ce que doit reproduire un « spot similaire » : le type de pot, la texture
     du board, le SPR, la position relative et la zone de stack — pas un simple
     tirage de nouvelles cartes. */
  function spotStrategyTraits(){
    if(!hand||!snap)return {};
    const heroP=snap.players.find(p=>p.isHero);
    const board=snap.board||[];
    const suits=board.slice(0,3).map(c=>c.s), ranks=board.slice(0,3).map(c=>c.r);
    const texture=board.length<3?null
      :(ranks[0]===ranks[1]||ranks[1]===ranks[2]||ranks[0]===ranks[2])?"paired"
      :(suits[0]===suits[1]&&suits[1]===suits[2])?"monotone"
      :(new Set(suits).size===2)?"two-tone":"rainbow";
    const eff=Math.min(...snap.players.filter(p=>!p.folded).map(p=>p.stack+p.committed));
    const pot=snap.potTotal||0;
    return {
      potType:hand.potType||null,
      boardTexture:texture,
      spr:pot>0&&board.length?Math.round((eff/pot)*10)/10:null,
      inPosition:["BTN","CO","HJ"].includes(heroP?.pos||""),
      stackZone:eff<=25?"short":eff<=60?"mid":"deep",
      effStackBb:Math.round(eff),
      format:hand.gameType==="mtt"?"MTT":"Cash",
      solverLevel:solverPkg?.level??null,
    };
  }

  /* ── §30/§32 — Publication du contexte structuré vers Trainer / Coach AI ──
     Canal ADDITIF : les callbacks existants gardent exactement leur signature. */
  function publishSpotContext(){
    if(!handState)return;
    try{
      publishAnalysisContext({
        handId:handState.handId, handState, solverData:solverPkg,
        analysis:ai.status==="ready"?ai.analysis:null,
        concepts:ai.status==="ready"?(ai.analysis?.keyConcepts||[]):[],
        observations:(()=>{try{return handObservations(hand,snaps,solverPkg?.decisions||[]);}catch{return [];}})(),
        spot:spotLabel(handState), traits:spotStrategyTraits(),
      });
    }catch{ /* la passerelle est un confort, jamais un bloquant */ }
  }

  const NAV_TABS=[
    {id:"replay",l:"▶ Replay"},{id:"ai",l:"⚡ Analyse IA"},
    {id:"solver",l:"🎯 Solver"},{id:"ranges",l:"📊 Ranges"},
    {id:"nodelock",l:"🔒 Node Lock",soon:true},{id:"exploit",l:"⚡ Exploit",soon:true},{id:"notes",l:"📝 Notes"},
  ];
  const isRangesMode=repTab==="ranges";
  const isSolverMode=repTab==="solver";
  const isNarrow=useIsMobile(880); // §38 : sous 880px on empile en 1 colonne (table d'abord)
  const gridCols=isNarrow?"1fr":isRangesMode?"minmax(210px,22%) minmax(0,1fr) 0px":cinema?"44px 1fr 44px":"minmax(210px,22%) 1fr minmax(210px,22%)";
  const filteredLib=handList.filter(h=>!libQuery||h.desc.toLowerCase().includes(libQuery.toLowerCase())||h.site?.toLowerCase().includes(libQuery.toLowerCase()));

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#030712",position:"relative"}}>
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",padding:"9px 20px",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:T.stats,zIndex:9999,animation:"fadeInUp .25s",background:toast.type==="success"?"rgba(16,216,122,.95)":toast.type==="error"?"rgba(255,69,96,.95)":"rgba(255,194,71,.95)",color:"#000",boxShadow:"0 4px 20px rgba(0,0,0,.5)"}}>{toast.msg}</div>}

      {/* ── Barre de navigation ── */}
      <div style={{display:"flex",alignItems:"center",gap:1,padding:"4px 12px",background:"#050E28",borderBottom:"1px solid #152D6E",flexShrink:0,overflowX:"auto"}}>
        <span style={{fontFamily:T.brand,fontSize:10,color:T.gold,fontWeight:700,letterSpacing:".06em",marginRight:8,flexShrink:0}}>REPLAYER</span>
        {NAV_TABS.map(t=>(
          <button key={t.id} style={{padding:"3px 10px",borderRadius:20,fontSize:9.5,fontWeight:700,cursor:t.soon?"default":"pointer",flexShrink:0,
            background:repTab===t.id?"rgba(255,194,71,.12)":"transparent",
            border:`1px solid ${repTab===t.id?"rgba(255,194,71,.4)":"transparent"}`,
            color:t.soon?T.text4:repTab===t.id?T.gold:T.text3,fontFamily:T.stats,position:"relative",transition:"all .14s",whiteSpace:"nowrap"}}
            onClick={()=>{if(t.soon)return;if(t.id==="notes"){setRepTab("notes");setRightTab("notes");}else setRepTab(t.id);}}>
            {t.l}{t.soon&&<span style={{position:"absolute",top:-2,right:-2,fontSize:6,background:T.amber,color:"#000",borderRadius:2,padding:"0 2px",fontWeight:800}}>SOON</span>}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {hand&&(
            <>
              <span className={`fmt-badge ${hand.gameType==="mtt"?"fmt-mtt":"fmt-cash"}`}>{hand.gameType==="mtt"?"MTT":"Cash"}</span>
              <span style={{fontSize:9.5,color:T.text2,fontFamily:T.stats}}>{hand.site}</span>
              <button className="btn btns" style={{fontSize:8,padding:"2px 7px"}} onClick={()=>{setHand(null);setHh("");setSession(null);setLotsRaw(null);setImportInfo(null);setLotIdx(0);setHandIdx(0);resetAi();setQuickRes(null);setStep(0);}}>✕ Fermer</button>
            </>
          )}
        </div>
      </div>

      {/* ── Grille 3 colonnes ── */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:gridCols,overflow:isNarrow?"auto":"hidden",transition:"grid-template-columns .28s ease",minHeight:0}}>

        {/* ═══════════════════════════════════════════════
            COLONNE GAUCHE
        ═══════════════════════════════════════════════ */}
        <div style={{borderRight:"1px solid #152D6E",display:"flex",flexDirection:"column",overflow:"hidden",background:"#040B1F",transition:"all .25s",...(isNarrow?{order:2,height:"78vh",borderTop:"1px solid #152D6E"}:{})}}>
          {cinema?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"12px 0",overflow:"hidden"}}>
              <button onClick={()=>setCinema(false)} title="Afficher le panneau"
                style={{width:30,height:30,borderRadius:6,border:"1px solid #152D6E",background:"rgba(255,255,255,.05)",color:T.text3,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>▶</button>
              <div style={{writingMode:"vertical-rl",fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",transform:"rotate(180deg)",opacity:.45,marginTop:6}}>IMPORT</div>
            </div>
          ):(
            <div style={{flex:1,overflowY:"auto",padding:"12px 11px",display:"flex",flexDirection:"column",gap:11}}>

              {/* Import section */}
              <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"11px 12px"}}>
                <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,marginBottom:7}}>Importer</div>
                {/* Choix du mode d'import */}
                <div style={{display:"flex",gap:4,marginBottom:8}}>
                  {[["session","📁 Session complète"],["single","🃏 Une seule main"]].map(([m,lbl])=>(
                    <button key={m} onClick={()=>setImportMode(m)} style={{flex:1,padding:"6px 4px",borderRadius:7,fontSize:8.5,fontWeight:700,cursor:"pointer",fontFamily:T.stats,
                      background:importMode===m?"rgba(255,194,71,.12)":"#030D2A",border:`1px solid ${importMode===m?"rgba(255,194,71,.4)":"#152D6E"}`,color:importMode===m?T.gold:T.text4}}>{lbl}</button>
                  ))}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:6}}>
                  {SITES.map(s=><span key={s.n} style={{padding:"1px 6px",borderRadius:20,fontSize:7.5,fontWeight:700,color:s.c,border:`1px solid ${s.c}33`,background:s.c+"0d",fontFamily:T.stats}}>{s.n}</span>)}
                </div>
                <div style={{border:`2px dashed ${dragOver?"#FFC247":"#1A3A80"}`,borderRadius:8,padding:"9px",textAlign:"center",background:dragOver?"rgba(255,194,71,.03)":"transparent",cursor:"pointer",marginBottom:6,transition:"all .15s"}}
                  onClick={()=>fileRef.current?.click()}
                  onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                  onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}>
                  <input type="file" ref={fileRef} accept=".txt,.hh,.log,text/plain" style={{display:"none"}} onChange={handleFile}/>
                  <div style={{fontSize:20,marginBottom:2}}>{importMode==="single"?"🃏":"📂"}</div>
                  <div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,lineHeight:1.5}}>{importMode==="single"?"Importer un fichier de main":"Importer un fichier de mains"}<br/><span style={{color:T.text4}}>.txt / .hh / texte brut</span></div>
                </div>
                <textarea style={{width:"100%",fontSize:8,fontFamily:"'JetBrains Mono',monospace",height:52,border:"1px solid #1A3A80",borderRadius:6,padding:6,background:"#030712",color:"#9FB0CC",resize:"none",outline:"none",boxSizing:"border-box",lineHeight:1.5}}
                  value={hh} onChange={e=>{setHh(sanitizeHH(e.target.value));}} placeholder={importMode==="single"?"Collez une seule main…":"Collez une ou plusieurs mains…"}/>
                <div style={{display:"flex",gap:4,marginTop:5}}>
                  <button className="btn btng" style={{flex:1,fontSize:9.5,fontWeight:700}} onClick={()=>loadFromText(hh,importMode==="single")} disabled={!hh.trim()}>
                    📥 Charger {importMode==="single"?"la main":"les mains"}
                  </button>
                  <button className="btn btns" style={{fontSize:9,padding:"0 8px"}} onClick={()=>{setHh("");setHand(null);setSession(null);resetAi();setQuickRes(null);}}>✕</button>
                </div>
                {/* Analyse IA — deux modes (§11/§12). Aucune clé à fournir : la
                    requête part vers le backend PokerForge, jamais vers un
                    fournisseur d'IA depuis le navigateur. */}
                <select value={aiMode} onChange={e=>setAiMode(e.target.value)} style={{width:"100%",marginTop:6,height:24,fontSize:8.5,background:"#030D2A",border:"1px solid #152D6E",borderRadius:6,color:T.text2,fontFamily:T.stats,padding:"0 6px",outline:"none",boxSizing:"border-box"}}>
                  <option value="decision">Analyser la décision</option>
                  <option value="full_hand">Analyser toute la main</option>
                </select>
                <button className="btn btng" style={{width:"100%",marginTop:4,fontSize:9,fontWeight:700,whiteSpace:"nowrap",background:"linear-gradient(135deg,#9B5CFF,#34D8FF)"}} onClick={()=>deepAnalyze()} disabled={ai.status==="loading"||!hand}>
                  {ai.status==="loading"?<><span className="aidot"/><span className="aidot"/><span className="aidot"/></>:"⚡ Analyser avec l'IA"}
                </button>
                {ai.status==="loading"&&(
                  <div style={{marginTop:5,fontSize:8,color:T.text4,fontFamily:T.stats}}>
                    {LOADING_STEPS[Math.min(ai.stepIndex,LOADING_STEPS.length-1)]}
                  </div>
                )}
              </div>

              {/* §2/§22 — plus aucune clé côté utilisateur. Le seul prérequis
                  visible est la session PokerForge (l'endpoint est authentifié). */}
              {!signedIn&&(
                <div style={{order:4,display:"flex",alignItems:"center",gap:5,padding:"5px 8px",background:"rgba(255,194,71,.04)",border:"1px solid rgba(255,194,71,.18)",borderRadius:6}}>
                  <span style={{fontSize:8.5,color:T.gold,fontFamily:T.stats,flex:1,lineHeight:1.5}}>
                    Connecte-toi pour activer l'analyse IA.
                  </span>
                </div>
              )}

              {/* Résumé session / main unique */}
              {session&&(<div style={{order:2}}>{session.single
                ?<SingleHandSummary hand={hand} unit={unit}/>
                :<SessionSummary session={session} unit={unit}/>}</div>)}

              {/* Analyse IA Rapide */}
              {quickRes&&(
                <div style={{order:3,background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"11px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:7}}>
                    <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700}}>Analyse IA Rapide</span>
                    <span style={{fontSize:6.5,background:T.amber,color:"#000",borderRadius:3,padding:"1px 5px",fontWeight:800}}>BETA</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"6px 8px",background:"rgba(255,255,255,.03)",borderRadius:6}}>
                    <span style={{fontFamily:T.brand,fontSize:22,fontWeight:900,color:quickRes.score>=7?T.green:quickRes.score>=5?T.gold:T.red,lineHeight:1}}>{quickRes.score}</span>
                    <span style={{fontSize:11,color:T.text4,fontFamily:T.stats,lineHeight:1,marginLeft:-2}}>/10</span>
                    <div style={{flex:1,fontSize:8.5,color:T.text3,fontFamily:T.stats,lineHeight:1.5}}>{quickRes.note}</div>
                  </div>
                  <div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic",lineHeight:1.45}}>
                    Détection de motifs (non-GTO). L'évaluation chiffrée des décisions
                    se trouve sous la table — voir « Évaluation de la décision ».
                  </div>
                </div>
              )}

              {/* ── BIBLIOTHÈQUE DES MAINS IMPORTÉES (panneau gauche, §7/§40) ──
                  Remontée juste après l'import (order:1) pour être accessible sans
                  scroller : c'est l'outil central quand une session est chargée. */}
              <div style={{order:1,border:"1px solid #0F2258",borderRadius:8,overflow:"hidden",flex:1,minHeight:session?330:180,display:"flex",flexDirection:"column",background:"rgba(255,255,255,.02)"}}>
                {session
                  ? <HandHistoryList session={session} activeIdx={handIdx} onSelect={loadHandAt} unit={unit} onSwitchLot={switchLot}/>
                  : (
                    <>
                      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,padding:"9px 11px 6px",flexShrink:0}}>Analyses sauvegardées ({handList.length})</div>
                      {handList.length>3&&(
                        <input value={libQuery} onChange={e=>setLibQuery(e.target.value)} placeholder="🔍 Rechercher..."
                          style={{margin:"0 9px 6px",background:"#071B44",border:"1px solid #1A3A80",color:T.text2,borderRadius:6,
                            padding:"4px 8px",fontSize:8.5,outline:"none",fontFamily:T.stats,boxSizing:"border-box",flexShrink:0}}/>
                      )}
                      <div style={{flex:1,overflowY:"auto",padding:"0 9px 9px"}}>
                        {filteredLib.length===0&&<div style={{color:T.text4,fontSize:9,textAlign:"center",padding:"14px 0",fontFamily:T.stats}}>Importe des mains pour construire ta bibliothèque.</div>}
                        {filteredLib.map(h=>(
                          <div key={h.id} className={`handit${selHand===h.id?" on":""}`} style={{marginBottom:3}} onClick={()=>{setSelHand(h.id);setHand(sampleHand);setStep(0);}}>
                            <span className="tag tag-b" style={{fontSize:7}}>{h.site}</span>
                            <span style={{flex:1,color:T.text,fontFamily:T.stats,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.desc}</span>
                            <span className="tag tag-gold" style={{fontSize:7,flexShrink:0}}>{h.score}/10</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
              </div>

            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════
            COLONNE CENTRE
        ═══════════════════════════════════════════════ */}
        <div style={{display:"flex",flexDirection:"column",overflow:"hidden",background:"#030B20",minHeight:0,...(isNarrow?{order:1,height:"70vh"}:{})}}>
          {isSolverMode?(
            <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",minHeight:0}}>
              {hand&&cur&&(
                <div style={{flexShrink:0,padding:"5px 16px 3px",background:"rgba(5,14,40,.85)",borderBottom:"1px solid #0F2258",display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>setStep(s=>Math.max(0,s-1))} title="Action précédente" style={{width:24,height:24,borderRadius:6,border:"1px solid #1A3A80",background:"transparent",color:T.text2,cursor:"pointer",fontSize:11,flexShrink:0}}>◀◀</button>
                  <div style={{flex:1,minWidth:0}}><ReplayTimelineV2 hand={hand} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying}/></div>
                  <button onClick={()=>setStep(s=>Math.min(hand.actions.length-1,s+1))} title="Action suivante" style={{width:24,height:24,borderRadius:6,border:"1px solid #1A3A80",background:"transparent",color:T.text2,cursor:"pointer",fontSize:11,flexShrink:0}}>▶▶</button>
                </div>
              )}
              <div style={{flex:1,overflow:"hidden",minHeight:0,display:"flex",flexDirection:"column"}}>
                <ReplayerSolverTab hand={hand} step={step} unit={unit} onGoTrainer={onGoTrainer} onGoRanges={()=>setRepTab("ranges")}/>
              </div>
            </div>
          ):isRangesMode?(
            <RangesTab onGoCoach={onGoCoach} embedded/>
          ):hand&&cur?(
            <>
              {/* Header main */}
              {(()=>{const total=session?session.hands.length:1;const cnt=Math.min(handIdx+1,total);const solo=total<=1;return(
              <div style={{flexShrink:0,padding:"6px 16px 5px",background:"rgba(5,14,40,.8)",borderBottom:"1px solid #0F2258",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <button onClick={goPrevHand} disabled={solo||handIdx<=0} title="Main précédente (←)" style={{width:24,height:24,borderRadius:6,border:"1px solid #1A3A80",background:"transparent",color:(solo||handIdx<=0)?T.text4:T.text2,cursor:(solo||handIdx<=0)?"default":"pointer",fontSize:13,lineHeight:1}}>‹</button>
                  <span style={{fontFamily:T.brand,fontSize:11,fontWeight:900,color:T.gold,letterSpacing:".04em",minWidth:74,textAlign:"center"}}>Main {cnt} / {total}</span>
                  <button onClick={goNextHand} disabled={solo||handIdx>=total-1} title="Main suivante (→)" style={{width:24,height:24,borderRadius:6,border:"1px solid #1A3A80",background:"transparent",color:(solo||handIdx>=total-1)?T.text4:T.text2,cursor:(solo||handIdx>=total-1)?"default":"pointer",fontSize:13,lineHeight:1}}>›</button>
                </div>
                <span style={{fontFamily:T.brand,fontSize:10,fontWeight:700,color:T.text3,letterSpacing:".04em",borderLeft:"1px solid #1A3A80",paddingLeft:10}}>
                  {hand.fmt||`${hand.site} ${hand.gameType==="mtt"?"MTT":"Cash"}`}
                </span>
                {hand.seats.find(s=>s.isHero)&&(
                  <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>
                    Hero · <span style={{color:"#7EB8FF",fontWeight:600}}>{hand.seats.find(s=>s.isHero)?.pos}</span>
                  </span>
                )}
                <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                  <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>Step <span style={{color:T.gold,fontWeight:700}}>{step+1}</span>/{hand.actions.length}</span>
                  {cur.isErr&&<span style={{fontSize:8.5,background:"rgba(255,69,96,.15)",color:T.red,border:"1px solid rgba(255,69,96,.3)",borderRadius:4,padding:"1px 6px",fontFamily:T.stats}}>⚠ Action à revoir</span>}
                </div>
              </div>);})()}

              {/* Table zone — table immersive (moteur de snapshots) */}
              <div style={{flex:1,overflow:"hidden",padding:cinema?"14px 24px 0":"10px 16px 0",minHeight:0}}>
                <ReplayTableImmersive hand={hand} snapshot={snap} prevSnapshot={prevSnap} fmt={fmt} speed={playSpeed} compact={isNarrow}/>
              </div>

              {/* Contrôles */}
              <div style={{flexShrink:0,padding:cinema?"0 24px 10px":"0 16px 8px",background:"#030B20"}}>
                <ReplayTimelineV2 hand={hand} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying}/>
                <ReplayControlBar
                  hand={hand} step={step} setStep={setStep}
                  playing={playing} setPlaying={setPlaying}
                  playSpeed={playSpeed} setPlaySpeed={setPlaySpeed}
                  onCinema={()=>setCinema(c=>!c)} cinema={cinema}
                />
                <div style={{marginTop:8}}>
                  <button style={{width:"100%",padding:"8px",borderRadius:7,border:"1px solid rgba(255,194,71,.25)",
                    background:"rgba(255,194,71,.05)",color:T.gold,fontSize:10,fontWeight:700,cursor:"pointer",
                    fontFamily:T.stats,letterSpacing:".04em",transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,194,71,.11)"}
                    onMouseLeave={e=>e.currentTarget.style.background="rgba(255,194,71,.05)"}
                    onClick={()=>{if(onGoTrainer){publishSpotContext();const h2=hand.seats.find(s=>s.isHero);const v=hand.seats.find(s=>!s.isHero);onGoTrainer({hpos:h2?.pos||"BTN",vpos:v?.pos||"BB",street:cur?.street||"Preflop",tableSize:hand.seats.length,...spotStrategyTraits()});}}}>
                    🎯 Travailler ce spot dans le Trainer
                  </button>
                  {/* §48/§51/§52 — Replayer → Trainer : spots similaires + session depuis cette main */}
                  {onGoTrainer&&(()=>{
                    const h2=hand.seats.find(s=>s.isHero),v=hand.seats.find(s=>!s.isHero);
                    const seed=()=>({
                      hpos:h2?.pos||"BTN",vpos:v?.pos||"BB",heroPos:h2?.pos||"BTN",villainPos:v?.pos||"BB",
                      street:cur?.street||"Preflop",board:cur?.board||[],hand:h2?.hole||[],
                      stack:Math.round(h2?.stack||40),toCall:cur?.amt||0,pot:Math.round((cur?.pot||0)/2),
                      tableSize:hand.seats.length,vtype:v?.profile||"Reg",
                      actionHistory:(hand.steps||[]).slice(0,(cur?.step??0)+1).map(s=>({position:s.actor,actionType:(s.action||"").split(" ")[0].toUpperCase()})),
                      /* §31 — les spots similaires reprennent les CARACTÉRISTIQUES
                         STRATÉGIQUES du spot (type de pot, texture, SPR, IP/OOP,
                         zone de stack) et pas seulement d'autres cartes. */
                      ...spotStrategyTraits(),
                    });
                    const btn=(bg,bd,col,hov,label,extra)=>(
                      <button style={{width:"100%",marginTop:6,padding:"8px",borderRadius:7,border:`1px solid ${bd}`,background:bg,color:col,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:T.stats,letterSpacing:".04em",transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                        onMouseEnter={e=>e.currentTarget.style.background=hov} onMouseLeave={e=>e.currentTarget.style.background=bg}
                        onClick={()=>{publishSpotContext();onGoTrainer({...seed(),...extra});}}>{label}</button>
                    );
                    return(<>
                      {btn("rgba(52,216,255,.05)","rgba(52,216,255,.25)","#34D8FF","rgba(52,216,255,.12)","🃏 Générer 10 spots similaires",{similar:true,count:10})}
                      {btn("rgba(16,216,122,.05)","rgba(16,216,122,.25)","#10D87A","rgba(16,216,122,.12)","🎬 Créer une session (20 variantes)",{session:"similar"})}
                    </>);
                  })()}
                  {onGoCoach&&(hand.raw||hh)&&(
                    <button style={{width:"100%",marginTop:6,padding:"8px",borderRadius:7,border:"1px solid rgba(155,92,255,.3)",
                      background:"rgba(155,92,255,.07)",color:"#B69BFF",fontSize:10,fontWeight:700,cursor:"pointer",
                      fontFamily:T.stats,letterSpacing:".04em",transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(155,92,255,.14)"}
                      onMouseLeave={e=>e.currentTarget.style.background="rgba(155,92,255,.07)"}
                      onClick={()=>{publishSpotContext();onGoCoach(hand.raw||hh);}}>
                      🧠 Analyser dans Coach AI
                    </button>
                  )}
                </div>
              </div>
            </>
          ):(
            <RepEmptyState handList={handList} onImport={()=>fileRef.current?.click()} onGoTrainer={onGoTrainer}/>
          )}
        </div>

        {/* ═══════════════════════════════════════════════
            COLONNE DROITE
        ═══════════════════════════════════════════════ */}
        <div style={{borderLeft:"1px solid #152D6E",display:isRangesMode?"none":"flex",flexDirection:"column",overflow:"hidden",background:"#040B1F",transition:"all .25s",...(isNarrow?{order:3,height:"78vh",borderTop:"1px solid #152D6E"}:{})}}>
          {cinema?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"12px 0",overflow:"hidden"}}>
              <button onClick={()=>setCinema(false)} title="Afficher le panneau"
                style={{width:30,height:30,borderRadius:6,border:"1px solid #152D6E",background:"rgba(255,255,255,.05)",color:T.text3,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>◀</button>
              <div style={{writingMode:"vertical-rl",fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",opacity:.45,marginTop:6}}>ANALYSE</div>
            </div>
          ):(
            <>
              <div style={{display:"flex",borderBottom:"1px solid #152D6E",flexShrink:0,background:"rgba(5,14,40,.6)"}}>
                {[{id:"analyse",l:"📊 Analyse"},{id:"ai",l:"⚡ Analyse IA"},{id:"notes",l:"📝 Notes"}].map(t=>(
                  <button key={t.id} style={{flex:1,padding:"7px 4px",fontSize:9,fontWeight:700,border:"none",
                    borderBottom:`2px solid ${rightTab===t.id?T.gold:"transparent"}`,
                    background:"transparent",color:rightTab===t.id?T.gold:T.text4,
                    cursor:"pointer",fontFamily:T.stats,transition:"all .14s"}}
                    onClick={()=>setRightTab(t.id)}>{t.l}</button>
                ))}
              </div>

              {rightTab==="analyse"&&(
                <div style={{flex:1,overflowY:"auto",padding:"10px 10px 14px"}}>
                  {hand
                    ? <DecisionPanel hand={hand} snaps={snaps} step={snapStep} setStep={setStep} ctx={analysisCtx} quickRes={quickRes} leakAgg={leakAgg}/>
                    : <div style={{textAlign:"center",padding:"30px 12px",color:T.text4,fontFamily:T.stats,fontSize:10,lineHeight:1.7}}>Charge une main pour voir l'évaluation des décisions, les fréquences et l'analyse complète.</div>}
                </div>
              )}

              {rightTab==="ai"&&(
                <div style={{flex:1,overflowY:"auto",padding:"10px",display:"flex",flexDirection:"column",gap:8}}>
                  <AiAnalysisPanel
                    aiState={ai} solverPkg={solverPkg}
                    mode={aiMode} setMode={setAiMode}
                    onAnalyze={()=>deepAnalyze()} onRetry={()=>deepAnalyze()}
                    signedIn={signedIn} hasHand={!!hand} cfrSolving={cfrSolving}/>
                  {cur?.note&&(
                    <div style={{padding:"6px 8px",background:"rgba(255,69,96,.06)",border:"1px solid rgba(255,69,96,.18)",borderRadius:6,fontSize:8.5,color:T.text2,fontFamily:T.stats}}>
                      <span style={{color:T.red}}>⚠ </span>{cur.note}
                    </div>
                  )}
                </div>
              )}

              {rightTab==="notes"&&(
                <div style={{flex:1,overflowY:"auto",padding:"10px",display:"flex",flexDirection:"column",gap:8}}>
                  {!hand?(
                    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",color:T.text4,fontFamily:T.stats,fontSize:10,lineHeight:1.7}}>Charge une main<br/>pour ajouter des notes.</div>
                  ):(()=>{
                    const key=String(hand.handId||hand.id||handIdx);
                    const val=notes[key]||"";
                    const setVal=(t)=>{const nx={...notes};if(t)nx[key]=t;else delete nx[key];setNotes(nx);repSaveNotes(nx);};
                    const noted=Object.keys(notes).filter(k=>(notes[k]||"").trim());
                    return(
                      <>
                        <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".08em",fontWeight:700}}>
                          NOTE · main #{hand.handId} {hand.spot?`· ${hand.spot}`:""}
                        </div>
                        <textarea value={val} onChange={e=>setVal(e.target.value)} maxLength={2000}
                          placeholder="Tes notes sur cette main : lecture du vilain, leçon, ajustement à travailler…"
                          style={{width:"100%",minHeight:160,resize:"vertical",background:"#030D2A",color:T.text2,
                          border:"1px solid #152D6E",borderRadius:8,padding:9,fontFamily:T.stats,fontSize:11,lineHeight:1.6}}/>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:8,color:val?T.green:T.text4,fontFamily:T.stats}}>{val?"💾 Enregistré automatiquement":"Note vide"}</span>
                          {val&&<span onClick={()=>setVal("")} style={{fontSize:8,color:T.text4,fontFamily:T.stats,cursor:"pointer"}}>✕ Effacer</span>}
                        </div>
                        {noted.length>0&&(
                          <div style={{marginTop:6,borderTop:"1px solid #152D6E",paddingTop:8}}>
                            <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".08em",fontWeight:700,marginBottom:6}}>{noted.length} MAIN{noted.length>1?"S":""} ANNOTÉE{noted.length>1?"S":""}</div>
                            {session&&(session.hands||[]).map((h,i)=>{const k=String(h.handId||h.id||i);if(!(notes[k]||"").trim())return null;return(
                              <div key={k} onClick={()=>loadHandAt(i)} style={{display:"flex",gap:6,padding:"5px 7px",marginBottom:4,borderRadius:6,cursor:"pointer",
                                background:i===handIdx?"rgba(255,194,71,.08)":"rgba(255,255,255,.02)",border:`1px solid ${i===handIdx?"rgba(255,194,71,.3)":"#0F2258"}`}}>
                                <span style={{fontSize:8.5,color:T.gold,fontFamily:T.stats,fontWeight:700,flexShrink:0}}>#{i+1}</span>
                                <span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(notes[k]||"").slice(0,42)}</span>
                              </div>
                            );})}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
