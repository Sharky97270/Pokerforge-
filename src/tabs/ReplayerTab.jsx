// PokerForge — Replayer : parser multi-room, rejeu pas-a-pas, analyse IA, solver de spot (extrait de App.jsx, Phase 3.3)
import React, { useState, useEffect, useRef, useMemo } from "react";
import { T } from "../theme.js";
import { apiSolverAnalyze, apiRangesCompare, apiSaveSpot, apiListSpots, apiDeleteSpot } from "../solverApi.js";
import { loadStats, saveStats, saveStatsSafe, loadHands, saveHands } from "../stats.js";
import { POSITIONS_BY_SIZE, SPOTS } from "../data/content.js";
import { MiniCard, Card, CardFlip } from "../components/table/Cards.jsx";
import RangesTab from "./RangesTab.jsx";

/* Notes du Replayer par main (clé = handId), persistées + synchro cloud (pf_*) */
function repLoadNotes(){try{return JSON.parse(localStorage.getItem("pf_rep_notes")||"{}");}catch{return {};}}
function repSaveNotes(o){try{localStorage.setItem("pf_rep_notes",JSON.stringify(o));}catch{}}

const _PF_KEY_SALT="PF7_SALT_2026";
function _xorStr(str,key){
  let out="";
  for(let i=0;i<str.length;i++)out+=String.fromCharCode(str.charCodeAt(i)^key.charCodeAt(i%key.length));
  return out;
}
function storeApiKey(raw){
  if(!raw)return localStorage.removeItem("pf_ak");
  try{localStorage.setItem("pf_ak",btoa(_xorStr(raw,_PF_KEY_SALT)));}catch(e){}
  localStorage.removeItem("pf_apikey"); // nettoyage ancien stockage en clair
}
function readApiKey(){
  try{
    const enc=localStorage.getItem("pf_ak");
    if(enc)return _xorStr(atob(enc),_PF_KEY_SALT);
    // Migration : si ancienne clé en clair existe, on la migre
    const old=localStorage.getItem("pf_apikey");
    if(old){storeApiKey(old);localStorage.removeItem("pf_apikey");return old;}
    return "";
  }catch{return "";}
}

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

const SAMPLE_HAND={
  site:"PokerStars",fmt:"Cash 6-max NL100",gameType:"cash",
  seats:[
    {id:1,name:"Hero",stack:200.5,pos:"SB",isHero:true,hole:[{r:"Q",s:"♠"},{r:"J",s:"♥"}],
     stats:{vpip:24,pfr:18,threeBet:7}},
    {id:3,name:"Villain",stack:187,pos:"BTN",isHero:false,hole:[],
     stats:{vpip:32,pfr:22,threeBet:9}},
    {id:5,name:"Player5",stack:243,pos:"BB",isHero:false,hole:[],
     stats:{vpip:18,pfr:14,threeBet:4}},
  ],
  actions:[
    {step:0,street:"Preflop",actor:"Villain",action:"Raise 3bb",amt:6,pot:9,board:[],ev:null,isHero:false,isErr:false},
    {step:1,street:"Preflop",actor:"Hero",action:"Call",amt:5,pot:14,board:[],ev:"+0.2bb",isHero:true,isErr:false},
    {step:2,street:"Preflop",actor:"Player5",action:"Fold",amt:null,pot:14,board:[],ev:null,isHero:false,isErr:false},
    {step:3,street:"Flop",actor:"Hero",action:"Check",amt:null,pot:14,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"}],ev:"ok",isHero:true,isErr:false},
    {step:4,street:"Flop",actor:"Villain",action:"Bet 7$",amt:7,pot:21,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"}],ev:null,isHero:false,isErr:false},
    {step:5,street:"Flop",actor:"Hero",action:"Call",amt:7,pot:28,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"}],ev:"-0.8bb",isHero:true,isErr:true,note:"Call marginal — equity ~28% vs cbet range."},
    {step:6,street:"Turn",actor:"Hero",action:"Check",amt:null,pot:28,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"},{r:"2",s:"♠"}],ev:"ok",isHero:true,isErr:false},
    {step:7,street:"Turn",actor:"Villain",action:"Bet 19$",amt:19,pot:47,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"},{r:"2",s:"♠"}],ev:null,isHero:false,isErr:false},
    {step:8,street:"Turn",actor:"Hero",action:"Call",amt:19,pot:66,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"},{r:"2",s:"♠"}],ev:"-2.1bb",isHero:true,isErr:true,note:"Double barrel = range value forte."},
    {step:9,street:"River",actor:"Hero",action:"Check",amt:null,pot:66,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"},{r:"2",s:"♠"},{r:"9",s:"♥"}],ev:"ok",isHero:true,isErr:false},
    {step:10,street:"River",actor:"Villain",action:"Bet 60$",amt:60,pot:126,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"},{r:"2",s:"♠"},{r:"9",s:"♥"}],ev:null,isHero:false,isErr:false},
    {step:11,street:"River",actor:"Hero",action:"Fold",amt:null,pot:63,board:[{r:"A",s:"♥"},{r:"K",s:"♦"},{r:"7",s:"♣"},{r:"2",s:"♠"},{r:"9",s:"♥"}],ev:"correct",isHero:true,isErr:false,note:"Fold correct — equity 18% < pot odds 27%."},
  ],
};

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

/* ── Positions des sièges autour de la table (% container) ── */
const REP_SEAT_LAYOUT={
  "BTN":{x:88,y:46},"CO":{x:74,y:12},"HJ":{x:50,y:7},
  "LJ":{x:26,y:12},"UTG":{x:12,y:46},"EP":{x:12,y:46},
  "SB":{x:26,y:82},"BB":{x:74,y:82},
};

/* ══════════════════════════════════════════════════════
   REPLAY TABLE v2 — Feutre immersif + timeline intégrée
══════════════════════════════════════════════════════ */
function ReplayTable2({hand,step,fmt,playing,setStep,setPlaying,playSpeed,setPlaySpeed,hideTimeline}){
  if(!hand)return null;
  const cur=hand.actions[Math.max(0,Math.min(step,hand.actions.length-1))];
  const streets=["Preflop","Flop","Turn","River"];
  const curSI=streets.indexOf(cur.street);
  const pct=hand.actions.length>1?Math.round(step/(hand.actions.length-1)*100):0;

  const stStatus=s=>{const si=streets.indexOf(s);return si<curSI?"done":si===curSI?"cur":"todo";};
  const goStreet=s=>{const i=hand.actions.findIndex(a=>a.street===s);if(i>=0){setStep(i);setPlaying(false);}};
  const onProgClick=e=>{
    const r=e.currentTarget.getBoundingClientRect();
    setStep(Math.max(0,Math.min(hand.actions.length-1,Math.round(((e.clientX-r.left)/r.width)*(hand.actions.length-1)))));
    setPlaying(false);
  };

  return(
    <div style={{position:"relative",width:"100%",paddingBottom:"56%",flexShrink:0}}>
      {/* ── FEUTRE OVAL ── */}
      <div style={{
        position:"absolute",inset:0,
        background:"radial-gradient(ellipse 90% 80% at 50% 42%,#1e5c35 0%,#0d2b18 55%,#071B44 100%)",
        borderRadius:"46%",border:"4px solid #1a2a48",
        boxShadow:"0 0 80px rgba(0,0,0,.9),inset 0 0 100px rgba(0,0,0,.4)",
        overflow:"hidden",
      }}>
        {/* Bordure intérieure décorative */}
        <div style={{position:"absolute",inset:6,border:"1.5px solid rgba(255,194,71,.1)",borderRadius:"46%",pointerEvents:"none"}}/>

        {/* ── BOARD centre ── */}
        <div style={{position:"absolute",top:"36%",left:"50%",transform:"translate(-50%,-50%)",display:"flex",gap:5,zIndex:3,alignItems:"center"}}>
          {cur.board.length>0
            ?cur.board.map((c,i)=><Card key={`${step}-${i}`} r={c.r} s={c.s} size="md" delay={i*.07}/>)
            :<div style={{fontSize:10,color:"rgba(255,255,255,.18)",fontFamily:T.stats,letterSpacing:".08em"}}>{cur.street==="Preflop"?"PRÉFLOP":""}</div>
          }
        </div>

        {/* ── POT ── */}
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontFamily:T.stats,fontSize:12,fontWeight:700,color:T.gold,textShadow:`0 0 10px ${T.goldGlow}`,zIndex:3,whiteSpace:"nowrap"}}>
          🪙 {fmt(cur.pot/2)}
        </div>

        {/* ── SIÈGES ── */}
        {hand.seats.map((seat,i)=>{
          const pos=REP_SEAT_LAYOUT[seat.pos]||{x:50,y:50};
          const isActor=cur.actor===seat.name;
          const isHero=seat.isHero;
          return(
            <div key={i} style={{
              position:"absolute",left:pos.x+"%",top:pos.y+"%",
              transform:"translate(-50%,-50%)",
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,zIndex:4,
            }}>
              <div style={{
                width:70,height:70,borderRadius:"50%",
                background:isHero?"rgba(255,194,71,.16)":isActor?"rgba(155,92,255,.22)":"rgba(0,0,0,.55)",
                border:`2px solid ${isHero?T.gold:isActor?T.purple:"rgba(255,255,255,.13)"}`,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                boxShadow:isHero?`0 0 24px ${T.goldGlow}`:isActor?`0 0 18px ${T.purpleGlow}`:"none",
                animation:isActor?"seatPulse 1.8s infinite":"none",
              }}>
                <span style={{fontFamily:T.brand,fontSize:10,fontWeight:700,color:isHero?T.gold:isActor?T.purple:T.text3}}>{seat.pos}</span>
                <span style={{fontFamily:T.stats,fontSize:11,fontWeight:700,color:isHero?T.gold:T.text2}}>{fmt(seat.stack/2)}</span>
              </div>
              <span style={{fontFamily:T.stats,fontSize:10,fontWeight:700,color:isHero?T.gold:T.text2,maxWidth:85,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{seat.name}</span>
              {isHero&&seat.hole?.length>0&&(
                <div style={{display:"flex",gap:2,marginTop:1}}>{seat.hole.map((c,j)=><Card key={j} r={c.r} s={c.s} size="sm"/>)}</div>
              )}
              {seat.stats&&(
                <div style={{display:"flex",gap:2,marginTop:1}}>
                  <span className="vstat-pill" style={{fontSize:7.5,padding:"1px 4px"}}>V{seat.stats.vpip}</span>
                  <span className="vstat-pill" style={{fontSize:7.5,padding:"1px 4px",background:"rgba(31,139,255,.1)",color:T.blue,borderColor:"rgba(31,139,255,.2)"}}>P{seat.stats.pfr}</span>
                  <span className="vstat-pill" style={{fontSize:7.5,padding:"1px 4px",background:"rgba(255,194,71,.08)",color:T.gold,borderColor:"rgba(255,194,71,.2)"}}>3B{seat.stats.threeBet}</span>
                </div>
              )}
              {isActor&&(
                <div style={{
                  padding:"3px 9px",borderRadius:5,fontSize:10,fontWeight:700,
                  background:cur.isErr?T.redDim:isHero?T.goldDim:"rgba(155,92,255,.18)",
                  color:cur.isErr?T.red:isHero?T.gold:T.purple,
                  border:`1px solid ${cur.isErr?"rgba(255,69,96,.4)":isHero?"rgba(255,194,71,.4)":"rgba(155,92,255,.4)"}`,
                  fontFamily:T.stats,whiteSpace:"nowrap",animation:"vilActIn .25s",marginTop:2,
                }}>{cur.action}</div>
              )}
            </div>
          );
        })}

        {/* ══ TIMELINE COMPACTE — visible uniquement si !hideTimeline ══ */}
        {!hideTimeline&&<div style={{
          position:"absolute",bottom:0,left:0,right:0,
          background:"rgba(3,7,18,.9)",
          backdropFilter:"blur(8px)",
          borderTop:"1px solid rgba(255,194,71,.2)",
          padding:"7px 12px 8px",zIndex:10,
        }}>
          {/* Rang 1 : boutons lecture + vitesse */}
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:5}}>
            {[
              {l:"⏮",f:()=>{setStep(0);setPlaying(false);}},
              {l:"⏪",f:()=>setStep(s=>Math.max(0,s-1))},
              {l:playing?"⏸":"▶",f:()=>setPlaying(p=>!p),active:true},
              {l:"⏩",f:()=>setStep(s=>Math.min(hand.actions.length-1,s+1))},
              {l:"⏭",f:()=>{setStep(hand.actions.length-1);setPlaying(false);}},
            ].map((b,i)=>(
              <button key={i} onClick={b.f} style={{
                width:26,height:26,borderRadius:5,fontSize:12,cursor:"pointer",
                background:b.active&&playing?"rgba(255,194,71,.2)":"rgba(255,255,255,.07)",
                border:`1px solid ${b.active&&playing?"rgba(255,194,71,.5)":"rgba(255,255,255,.12)"}`,
                color:b.active&&playing?T.gold:T.text2,
                display:"flex",alignItems:"center",justifyContent:"center",transition:"all .12s",
              }}>{b.l}</button>
            ))}
            <div style={{flex:1}}/>
            <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginRight:4}}>Vitesse</span>
            {[.5,1,2,4].map(s=>(
              <button key={s} onClick={()=>setPlaySpeed(s)} style={{
                padding:"2px 6px",borderRadius:4,fontSize:8.5,fontWeight:700,cursor:"pointer",
                background:playSpeed===s?"rgba(255,194,71,.18)":"rgba(255,255,255,.05)",
                border:`1px solid ${playSpeed===s?"rgba(255,194,71,.45)":"rgba(255,255,255,.08)"}`,
                color:playSpeed===s?T.gold:T.text4,fontFamily:T.stats,transition:"all .12s",
              }}>{s}×</button>
            ))}
          </div>

          {/* Rang 2 : streets + action courante */}
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5,flexWrap:"wrap"}}>
            {streets.map(s=>{
              const st=stStatus(s);
              if(!hand.actions.some(a=>a.street===s))return null;
              return(
                <div key={s} onClick={()=>goStreet(s)} style={{
                  display:"flex",alignItems:"center",gap:3,cursor:"pointer",
                  padding:"2px 8px",borderRadius:20,fontSize:8.5,fontWeight:700,
                  background:st==="done"?"rgba(16,216,122,.12)":st==="cur"?"rgba(255,194,71,.14)":"rgba(255,255,255,.04)",
                  border:`1px solid ${st==="done"?"rgba(16,216,122,.32)":st==="cur"?"rgba(255,194,71,.38)":"rgba(255,255,255,.07)"}`,
                  color:st==="done"?T.green:st==="cur"?T.gold:T.text4,
                  fontFamily:T.stats,transition:"all .14s",
                }}>
                  {s}
                  {st==="done"&&<span style={{fontSize:7}}>✓</span>}
                  {st==="cur"&&<span style={{width:5,height:5,borderRadius:"50%",background:T.gold,display:"inline-block",marginLeft:1}}/>}
                </div>
              );
            })}
            <div style={{marginLeft:"auto",fontSize:9,fontFamily:T.stats,fontWeight:700,
              color:cur.isErr?T.red:cur.isHero?T.gold:T.text2,whiteSpace:"nowrap",
            }}>
              <span style={{color:T.text4}}>{cur.actor}</span>
              {" "}{cur.action}{cur.amt?` · ${cur.amt}$`:""}
              {cur.isErr&&<span style={{color:T.red,marginLeft:4}}>⚠</span>}
            </div>
          </div>

          {/* Rang 3 : barre de progression */}
          <div style={{height:5,background:"rgba(255,255,255,.08)",borderRadius:3,cursor:"pointer",overflow:"hidden",marginBottom:2}} onClick={onProgClick}>
            <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,${T.blue},${T.gold})`,borderRadius:3,transition:"width .18s"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:7.5,color:T.text4,fontFamily:T.stats}}>
            <span>Action {step+1} / {hand.actions.length}</span>
            <span>{pct}%</span>
          </div>
        </div>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   REPLAY TIMELINE — Bandeau indépendant sous la table
══════════════════════════════════════════════════════ */
function ReplayTimeline({hand,step,setStep,playing,setPlaying,playSpeed,setPlaySpeed}){
  if(!hand)return null;
  const cur=hand.actions[Math.max(0,Math.min(step,hand.actions.length-1))];
  const streets=["Preflop","Flop","Turn","River"];
  const curSI=streets.indexOf(cur.street);
  const pct=hand.actions.length>1?(step/(hand.actions.length-1)*100):0;
  const stStatus=s=>{const si=streets.indexOf(s);return si<curSI?"done":si===curSI?"cur":"todo";};
  const goStreet=s=>{const i=hand.actions.findIndex(a=>a.street===s);if(i>=0){setStep(i);setPlaying(false);}};
  const onBarClick=e=>{
    const r=e.currentTarget.getBoundingClientRect();
    setStep(Math.max(0,Math.min(hand.actions.length-1,Math.round(((e.clientX-r.left)/r.width)*(hand.actions.length-1)))));
    setPlaying(false);
  };
  const activeStreets=streets.filter(s=>hand.actions.some(a=>a.street===s));
  const streetMarkers=activeStreets.map(s=>({
    s,pct:hand.actions.length>1?hand.actions.findIndex(a=>a.street===s)/(hand.actions.length-1)*100:0
  })).filter(m=>m.pct>0);

  return(
    <div style={{background:"#050E28",border:"1px solid #152D6E",borderRadius:10,padding:"10px 16px 12px",marginTop:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
        <div style={{display:"flex",gap:3,flexShrink:0}}>
          {[
            {l:"⏮",f:()=>{setStep(0);setPlaying(false);}},
            {l:"⏪",f:()=>setStep(s=>Math.max(0,s-1))},
            {l:playing?"⏸":"▶",f:()=>setPlaying(p=>!p),primary:true},
            {l:"⏩",f:()=>setStep(s=>Math.min(hand.actions.length-1,s+1))},
            {l:"⏭",f:()=>{setStep(hand.actions.length-1);setPlaying(false);}},
          ].map((b,i)=>(
            <button key={i} onClick={b.f} style={{
              width:b.primary?36:28,height:b.primary?36:28,borderRadius:b.primary?8:5,
              fontSize:b.primary?16:12,cursor:"pointer",flexShrink:0,
              background:b.primary?(playing?"rgba(255,194,71,.22)":"rgba(255,255,255,.09)"):"rgba(255,255,255,.05)",
              border:`1px solid ${b.primary?(playing?"rgba(255,194,71,.5)":"rgba(255,255,255,.18)"):"rgba(255,255,255,.1)"}`,
              color:b.primary?(playing?T.gold:T.text):T.text3,
              display:"flex",alignItems:"center",justifyContent:"center",transition:"all .12s",
              boxShadow:b.primary&&playing?"0 0 12px rgba(255,194,71,.25)":"none",
            }}>{b.l}</button>
          ))}
        </div>
        <div style={{flex:1,display:"flex",justifyContent:"center",gap:5}}>
          {activeStreets.map(s=>{
            const st=stStatus(s);
            return(
              <button key={s} onClick={()=>goStreet(s)} style={{
                padding:"4px 14px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",
                background:st==="done"?"rgba(16,216,122,.1)":st==="cur"?"rgba(255,194,71,.14)":"rgba(255,255,255,.04)",
                border:`1px solid ${st==="done"?"rgba(16,216,122,.3)":st==="cur"?"rgba(255,194,71,.35)":"rgba(255,255,255,.08)"}`,
                color:st==="done"?T.green:st==="cur"?T.gold:T.text4,
                fontFamily:T.stats,transition:"all .14s",display:"flex",alignItems:"center",gap:5,
              }}>
                <span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,
                  background:st==="done"?T.green:st==="cur"?T.gold:"rgba(255,255,255,.15)",
                  boxShadow:st==="cur"?`0 0 6px ${T.goldGlow}`:"none",display:"inline-block",
                }}/>
                {s}
              </button>
            );
          })}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
          <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginRight:2}}>Vitesse</span>
          {[.5,1,2,4].map(s=>(
            <button key={s} onClick={()=>setPlaySpeed(s)} style={{
              padding:"3px 8px",borderRadius:5,fontSize:9.5,fontWeight:700,cursor:"pointer",
              background:playSpeed===s?"rgba(255,194,71,.18)":"rgba(255,255,255,.05)",
              border:`1px solid ${playSpeed===s?"rgba(255,194,71,.45)":"rgba(255,255,255,.08)"}`,
              color:playSpeed===s?T.gold:T.text4,fontFamily:T.stats,transition:"all .12s",
            }}>{s}×</button>
          ))}
        </div>
      </div>
      <div style={{position:"relative",height:10,background:"rgba(255,255,255,.07)",borderRadius:5,cursor:"pointer",marginBottom:5,userSelect:"none"}} onClick={onBarClick}>
        <div style={{height:"100%",width:pct+"%",background:"linear-gradient(90deg,#1F8BFF,#FFC247)",borderRadius:5,transition:"width .15s",position:"relative"}}>
          <div style={{position:"absolute",right:-5,top:"50%",transform:"translateY(-50%)",width:12,height:12,borderRadius:"50%",background:T.gold,boxShadow:"0 0 8px rgba(255,194,71,.7)",border:"2px solid rgba(0,0,0,.5)"}}/>
        </div>
        {streetMarkers.map(m=>(
          <div key={m.s} style={{position:"absolute",left:m.pct+"%",top:0,bottom:0,width:2,background:"rgba(255,255,255,.28)",transform:"translateX(-50%)",pointerEvents:"none",borderRadius:1}}/>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>Action {step+1} / {hand.actions.length}</span>
        <div style={{fontSize:11,fontFamily:T.stats,fontWeight:700,color:cur.isErr?T.red:cur.isHero?T.gold:T.text2,display:"flex",alignItems:"center",gap:6}}>
          <span style={{color:T.text4,fontWeight:400,fontSize:9.5}}>{cur.actor}</span>
          <span style={{color:T.text4}}>·</span>
          <span>{cur.action}{cur.amt?` ${cur.amt}$`:""}</span>
          {cur.isErr&&<span style={{color:T.red}}>⚠</span>}
        </div>
        <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   QUICK ANALYSIS PANEL — Zone analyse centrale
══════════════════════════════════════════════════════ */
function QuickAnalysisPanel({quickRes,aiResult,analyzing}){
  if(!quickRes&&!aiResult&&!analyzing)return null;
  return(
    <div style={{background:"#050E28",border:"1px solid #152D6E",borderRadius:10,padding:"10px 14px 12px",marginTop:8}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",fontWeight:700,textTransform:"uppercase"}}>Analyse Rapide</div>
        {quickRes&&(
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{fontFamily:T.brand,fontSize:21,fontWeight:900,color:quickRes.score>=7?T.green:quickRes.score>=5?T.gold:T.red}}>
              {quickRes.score}<span style={{fontSize:11,color:T.text4,fontFamily:T.stats}}>/10</span>
            </div>
            <span className={`fmt-badge ${quickRes.gameType==="mtt"?"fmt-mtt":"fmt-cash"}`}>{quickRes.gameType==="mtt"?"MTT":"Cash"}</span>
          </div>
        )}
      </div>
      {quickRes&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:8}}>
          {["Preflop","Flop","Turn","River"].map(s=>{
            const hasErr=quickRes.errors.some(e=>e.toLowerCase().includes(s.toLowerCase()));
            return(
              <div key={s} style={{textAlign:"center",padding:"6px 4px",
                background:hasErr?"rgba(255,194,71,.06)":"rgba(16,216,122,.05)",
                border:`1px solid ${hasErr?"rgba(255,194,71,.18)":"rgba(16,216,122,.14)"}`,borderRadius:7,
              }}>
                <div style={{fontSize:15,marginBottom:2}}>{hasErr?"⚠":"✔"}</div>
                <div style={{fontSize:8.5,fontFamily:T.stats,fontWeight:700,color:hasErr?T.gold:T.green}}>{s}</div>
                <div style={{fontSize:7.5,fontFamily:T.stats,color:T.text4,marginTop:1}}>{hasErr?"Attention":"Correct"}</div>
              </div>
            );
          })}
        </div>
      )}
      {analyzing&&(
        <div style={{display:"flex",gap:5,alignItems:"center",padding:"5px 0"}}>
          <div className="aidot"/><div className="aidot"/><div className="aidot"/>
          <span style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,marginLeft:3}}>Analyse IA en cours...</span>
        </div>
      )}
      {aiResult&&!analyzing&&(
        <div style={{background:"rgba(31,139,255,.04)",border:"1px solid rgba(31,139,255,.13)",borderRadius:7,padding:"8px 10px",marginBottom:8}}>
          <div style={{fontSize:8,color:T.blue,fontFamily:T.stats,fontWeight:700,letterSpacing:".1em",marginBottom:4}}>ANALYSE GTO</div>
          <div style={{fontSize:9,color:T.text2,fontFamily:T.stats,lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:110,overflow:"auto"}}>{aiResult}</div>
        </div>
      )}
      {quickRes&&quickRes.errors.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {quickRes.errors.map((e,i)=>(
            <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",padding:"4px 7px",background:T.redDim,borderRadius:5,border:"1px solid rgba(255,69,96,.15)"}}>
              <span style={{color:T.red,fontSize:11,marginTop:1,flexShrink:0}}>⚠</span>
              <span style={{fontSize:9,color:T.text2,fontFamily:T.stats,lineHeight:1.5}}>{e}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   DONUT CHART — SVG rotatif pour fréquences GTO
══════════════════════════════════════════════════════ */
function DonutChart({call=35,raise=25,fold=40,size=76}){
  const r=34,cx=50,cy=50,C=2*Math.PI*r;
  const segs=[{v:call,c:"#10D87A"},{v:raise,c:"#1F8BFF"},{v:fold,c:"#FF4560"}];
  let cum=0;
  return(
    <svg viewBox="0 0 100 100" width={size} height={size} style={{flexShrink:0}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0a1428" strokeWidth="14"/>
      {segs.map((s,i)=>{
        if(s.v<=0)return null;
        const dash=(s.v/100)*C;
        const rot=-90+(cum/100*360);
        cum+=s.v;
        return<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.c} strokeWidth="14"
          strokeDasharray={`${dash} ${C-dash}`}
          style={{transformOrigin:`${cx}px ${cy}px`,transform:`rotate(${rot}deg)`,transition:"all .4s ease"}}/>;
      })}
      <circle cx={cx} cy={cy} r={21} fill="#050E28"/>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════
   REPLAYER — Positions dynamiques + reconstruction des mises
   (Hero en bas, sens horaire ; jetons + stacks step-by-step)
══════════════════════════════════════════════════════ */
/* Positions sur l'oval : index 0 = bas (Hero), puis sens horaire.
   Oval calibré pour que les sièges du haut ne soient JAMAIS rognés. */
function repRingCoords(n){
  const cx=50, cy=52, rx=43, ry=31;
  const out=[];
  for(let i=0;i<n;i++){
    const ang=Math.PI/2 - (i*2*Math.PI/n); // bas → sens horaire
    out.push({x:+(cx+rx*Math.cos(ang)).toFixed(2), y:+(cy+ry*Math.sin(ang)).toFixed(2)});
  }
  return out;
}
/* Sièges ordonnés autour de la table : Hero en bas, autres dans l'ordre des sièges. */
function repOrderedSeats(hand){
  const seats=[...(hand.seats||[])];
  if(seats.length&&seats.every(s=>Number.isFinite(s.seat)))seats.sort((a,b)=>a.seat-b.seat);
  const hi=seats.findIndex(s=>s.isHero);
  const start=hi>=0?hi:0;
  const ring=[];
  for(let i=0;i<seats.length;i++)ring.push(seats[(start+i)%seats.length]);
  return ring;
}
/* État des mises à l'étape `step` :
   committed = jetons devant chaque joueur sur la street courante (pas encore collectés),
   invested  = total investi sur la main (pour décrémenter les stacks),
   folded    = joueurs couchés, curStreet = street affichée, lastBySeat = dernière action par siège. */
function repBetState(hand,step){
  const acts=hand?.actions||[];
  const k=Math.max(0,Math.min(step,acts.length-1));
  const invested={};const folded=new Set();const lastBySeat={};const postedBlind={};
  let committed={};let streetMax=0;let prevStreet=null;let collected=0;
  const curStreet=acts[k]?.street||"Preflop";
  const sweep=()=>{collected+=Object.values(committed).reduce((a,b)=>a+b,0);committed={};streetMax=0;};
  const seedBlinds=()=>{
    (hand.seats||[]).forEach(s=>{
      if(s.pos==="SB"){committed[s.name]=0.5;invested[s.name]=(invested[s.name]||0)+0.5;streetMax=Math.max(streetMax,0.5);postedBlind[s.name]=0.5;}
      if(s.pos==="BB"){committed[s.name]=1;invested[s.name]=(invested[s.name]||0)+1;streetMax=Math.max(streetMax,1);postedBlind[s.name]=1;}
    });
  };
  for(let i=0;i<=k;i++){
    const a=acts[i];if(!a)continue;
    if(a.street!==prevStreet){sweep();if(/^pre/i.test(a.street))seedBlinds();prevStreet=a.street;}
    const lab=a.action||"";const amt=a.amt;
    lastBySeat[a.actor]={label:lab,street:a.street,isErr:a.isErr};
    if(/Fold/i.test(lab)){
      // jetons déjà engagés par le foldeur → balayés au pot (dead money)
      collected+=committed[a.actor]||0;delete committed[a.actor];
      folded.add(a.actor);continue;
    }
    if(/Check/i.test(lab))continue;
    if(amt==null)continue;
    if(/Raise|All-?in|Bet/i.test(lab)){
      const delta=Math.max(0,amt-(committed[a.actor]||0));
      invested[a.actor]=(invested[a.actor]||0)+delta;
      committed[a.actor]=amt;streetMax=Math.max(streetMax,amt);
    }else if(/Call/i.test(lab)){
      const target=streetMax>0?streetMax:(committed[a.actor]||0)+amt;
      const delta=Math.max(0,target-(committed[a.actor]||0));
      invested[a.actor]=(invested[a.actor]||0)+delta;
      committed[a.actor]=target;
    }
  }
  const liveCommitted=Object.values(committed).reduce((a,b)=>a+b,0);
  const pot=collected+liveCommitted; // pot total contesté = collecté + mises en cours
  return {committed,invested,folded,curStreet,lastBySeat,collected,pot,postedBlind};
}
/* Petite pile de jetons + montant devant un joueur.
   posLabel renseigné (SB/BB) → variante « blinde postée » (teinte cyan, label discret). */
function RepBetChips({amount,fmt,color="#FFC247",posLabel,scale=1}){
  if(!(amount>0))return null;
  const PAL={
    "#FFC247":["#FFD24A","#E8A317","#C8860B"],   // mise Hero (or)
    "#9B5CFF":["#9B5CFF","#7D3DCC","#5E2E99"],   // mise vilain (violet)
    "#34D8FF":["#5EC8FF","#2E9BD8","#1E6FA8"],   // blinde postée (cyan)
  };
  const cols=PAL[color]||PAL["#FFC247"];
  const count=Math.min(6,Math.max(2,Math.ceil(amount/2.5)));
  const csz=16, gap=4;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,transform:`scale(${scale})`,transformOrigin:"center"}}>
      {posLabel&&<span style={{fontSize:7.5,fontWeight:800,fontFamily:T.stats,color:"#BDEBFF",letterSpacing:".06em",
        background:"rgba(52,216,255,.18)",border:"1px solid rgba(52,216,255,.5)",padding:"0 6px",borderRadius:10,
        whiteSpace:"nowrap",lineHeight:1.6,boxShadow:"0 0 8px rgba(52,216,255,.3)"}}>{posLabel}</span>}
      <div style={{position:"relative",width:csz,height:csz+(count-1)*gap,filter:`drop-shadow(0 4px 7px ${color}77)`}}>
        {[...Array(count)].map((_,ci)=>(
          <div key={ci} style={{position:"absolute",bottom:ci*gap,left:0,width:csz,height:csz,borderRadius:"50%",
            background:cols[ci%cols.length],border:`2px solid ${cols[2]}`,
            boxShadow:"inset 0 -2px 2.5px rgba(0,0,0,.55),inset 0 2px 2px rgba(255,255,255,.3)"}}>
            <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"radial-gradient(circle at 35% 28%,rgba(255,255,255,.45) 0%,transparent 56%)"}}/>
            <div style={{position:"absolute",inset:2.5,borderRadius:"50%",border:`1px dashed ${color}55`}}/>
          </div>
        ))}
      </div>
      <span style={{fontFamily:T.mono,fontSize:11,fontWeight:900,color,textShadow:`0 0 7px ${color}99`,whiteSpace:"nowrap",
        background:"rgba(5,12,30,.72)",padding:"0 5px",borderRadius:6,marginTop:1}}>{fmt(roundBb(amount))}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   REPLAY TABLE 3 — Version Premium (GTO Wizard style)
   Table dominante, héro en bleu électrique, stats VPIP/PFR
══════════════════════════════════════════════════════ */
function ReplayTable3({hand,step,fmt}){
  const[fly,setFly]=useState([]);          // jetons en vol vers le pot
  const[potPulse,setPotPulse]=useState(false);
  const prevStepRef=useRef(step);
  // Mesure de la table → échelle adaptative des jetons/dealer (px fixes sur table %) : stable à toute largeur.
  const wrapRef=useRef(null);
  const[tw,setTw]=useState(660);
  useEffect(()=>{
    const el=wrapRef.current;if(!el||typeof ResizeObserver==="undefined")return;
    const ro=new ResizeObserver(es=>{const w=es[0]?.contentRect?.width;if(w)setTw(w);});
    ro.observe(el);return()=>ro.disconnect();
  },[]);
  const chipScale=Math.max(0.74,Math.min(1.18,tw/660));
  // Détecte les transitions de street → anime la collecte des jetons vers le pot
  useEffect(()=>{
    if(!hand){prevStepRef.current=step;return;}
    const prev=prevStepRef.current;prevStepRef.current=step;
    if(step===prev)return;
    const prevBs=repBetState(hand,prev),curBs=repBetState(hand,step);
    const timers=[];
    if(Math.abs(curBs.pot-prevBs.pot)>0.01){setPotPulse(true);timers.push(setTimeout(()=>setPotPulse(false),360));}
    if(step>prev&&prevBs.curStreet!==curBs.curStreet){
      const ring=repOrderedSeats(hand),coords=repRingCoords(ring.length);
      const flies=ring.map((s,i)=>{
        let fx,fy;
        if(i===0){fx=40;fy=71;}
        else{const dx=coords[i].x-50, dy=coords[i].y-52, ang=Math.atan2(dy,dx);fx=50+32*Math.cos(ang);fy=52+19*Math.sin(ang);}
        return {name:s.name,amount:prevBs.committed[s.name]||0,x:fx,y:fy,hero:s.isHero};
      }).filter(f=>f.amount>0).map((f,idx)=>({...f,id:`${step}-${idx}`,moved:false}));
      if(flies.length){
        setFly(flies);
        requestAnimationFrame(()=>requestAnimationFrame(()=>setFly(fs=>fs.map(f=>({...f,moved:true})))));
        timers.push(setTimeout(()=>setFly([]),720));
      }
    }
    return()=>timers.forEach(clearTimeout);
  },[step,hand]);
  if(!hand)return null;
  const cur=hand.actions[Math.max(0,Math.min(step,hand.actions.length-1))];
  const bs=repBetState(hand,step);
  const lastStep=hand.actions.length-1;
  const isShowdown=!!(hand.hasShowdown&&step>=lastStep);
  // Zone de mise Hero : à GAUCHE de l'avatar (l'avatar+cartes remplit la hauteur sous le board).
  // Offset calculé en px → robuste à toute largeur de table.
  const heroAvR=36;                          // rayon avatar Hero (sz 72 / 2)
  const heroBetX=50-(heroAvR/tw)*100-(16*chipScale/tw)*100-1.5;
  const heroBetY=71;
  return(
    <div ref={wrapRef} style={{position:"relative",width:"100%",paddingBottom:"58%"}}>
      <div style={{position:"absolute",inset:-6,borderRadius:"47%",background:"transparent",
        boxShadow:"0 0 90px rgba(31,139,255,.1),0 0 50px rgba(0,0,0,.85),0 30px 100px rgba(0,0,0,.95)",
        pointerEvents:"none",zIndex:0}}/>
      <div style={{
        position:"absolute",inset:0,zIndex:1,
        background:"radial-gradient(ellipse 88% 76% at 50% 44%,#1a5c34 0%,#0f3220 40%,#081c12 70%,#050e28 100%)",
        borderRadius:"46%",
        border:"5px solid #071228",
        boxShadow:"0 0 0 1.5px rgba(31,139,255,.07),inset 0 0 120px rgba(0,0,0,.6),0 24px 90px rgba(0,0,0,.95)",
        overflow:"hidden",
      }}>
        <div style={{position:"absolute",inset:10,border:"1.5px solid rgba(255,194,71,.07)",borderRadius:"45%",pointerEvents:"none"}}/>
        <div style={{position:"absolute",top:"54%",left:"50%",transform:"translate(-50%,-50%)",
          fontFamily:T.brand,fontSize:22,fontWeight:900,color:"rgba(255,255,255,.025)",
          letterSpacing:".35em",userSelect:"none",pointerEvents:"none",whiteSpace:"nowrap"}}>POKERFORGE</div>

        {/* ── POT (au-dessus du board, duo visuel central) ── */}
        <div style={{position:"absolute",top:"30%",left:"50%",transform:`translate(-50%,-50%) scale(${potPulse?1.12:1})`,
          zIndex:6,pointerEvents:"none",transition:"transform .35s cubic-bezier(.34,1.56,.64,1)"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"3px 12px 3px 8px",borderRadius:20,
            background:"rgba(5,14,30,.82)",border:"1px solid rgba(255,194,71,.34)",
            boxShadow:"0 4px 18px rgba(0,0,0,.55),0 0 18px rgba(255,194,71,.14)"}}>
            {/* mini cluster de jetons */}
            <div style={{position:"relative",width:16,height:13}}>
              {["#FFD24A","#E8A317","#C8860B"].map((cc,ci)=>(
                <div key={ci} style={{position:"absolute",left:ci*4,bottom:0,width:11,height:11,borderRadius:"50%",
                  background:cc,border:"1.2px solid #8a5e08",boxShadow:"inset 0 -1px 1.5px rgba(0,0,0,.5),inset 0 1px 1px rgba(255,255,255,.3)"}}/>
              ))}
            </div>
            <span style={{fontFamily:T.stats,fontSize:13,fontWeight:800,color:T.gold,whiteSpace:"nowrap",
              textShadow:"0 0 14px rgba(255,194,71,.6)"}}>Pot : {fmt(roundBb(bs.pot))}</span>
          </div>
        </div>

        {/* ── BOARD (centre de gravité, position stable street→street) ── */}
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          display:"flex",gap:6,zIndex:5,alignItems:"center",justifyContent:"center"}}>
          {cur.board.length>0
            ?cur.board.map((c,i)=><Card key={`${step}-b${i}`} r={c.r} s={c.s} size="lg" delay={i*.07}/>)
            :<span style={{fontSize:11,color:"rgba(255,255,255,.16)",fontFamily:T.stats,letterSpacing:".22em",fontWeight:700}}>PRÉFLOP</span>}
        </div>

        {/* ── SIÈGES (positions dynamiques : Hero en bas, sens horaire) ── */}
        {(()=>{
          const ring=repOrderedSeats(hand);
          const coords=repRingCoords(ring.length);
          const bb=hand.bb||1;
          const btnSeat=ring.find(s=>s.pos==="BTN");
          return(
            <>
              {/* DEALER BUTTON — ancré sur le CÔTÉ du siège BTN (tangentiel) : jamais sur Hero, ses cartes ou sa zone de mise */}
              {btnSeat&&(()=>{
                const bi=ring.indexOf(btnSeat);const bc=coords[bi];
                const ang=Math.atan2(bc.y-52,bc.x-50);
                // décalage tangentiel (perpendiculaire au rayon) + léger retrait vers le centre
                const tang=ang-Math.PI/2;
                const offX=9.5, offY=7;
                const bx=bc.x+Math.cos(tang)*offX+(50-bc.x)*0.08;
                const by=bc.y+Math.sin(tang)*offY+(52-bc.y)*0.08;
                const dsz=Math.round(19*chipScale);
                return <div className="dealer-btn" style={{left:`${bx}%`,top:`${by}%`,width:dsz,height:dsz,fontSize:9.5*chipScale,zIndex:6,
                  boxShadow:"0 2px 8px rgba(0,0,0,.6),0 0 10px rgba(255,194,71,.3)"}}>D</div>;
              })()}

              {ring.map((seat,i)=>{
                const c=coords[i];
                const isActor=cur.actor===seat.name;
                const isHero=seat.isHero;
                const isFolded=bs.folded.has(seat.name);
                const sz=isHero?72:60;
                const stackBb=Math.max(0,(seat.stack/bb)-(bs.invested[seat.name]||0));
                const committed=bs.committed[seat.name]||0;
                // Zone de mise : Hero (index 0, toujours en bas) = zone dédiée entre le board et son avatar ;
                // autres sièges = anneau elliptique entre board (centre) et sièges → safe-area, zéro chevauchement.
                let cpx, cpy;
                // Hero (index 0, en bas) : l'avatar+cartes occupe toute la hauteur sous le board → zone de mise placée
                // À CÔTÉ de l'avatar (offset horizontal calculé en px, robuste à toute largeur). Espace libre garanti.
                if(i===0){ cpx=heroBetX; cpy=heroBetY; }
                else { const dx=c.x-50, dy=c.y-52, ang=Math.atan2(dy,dx); const betRx=32, betRy=19; cpx=50+betRx*Math.cos(ang); cpy=52+betRy*Math.sin(ang); }
                const last=bs.lastBySeat[seat.name];
                // Blinde postée = préflop, montant == blinde, aucune action volontaire encore → affichage distinct (cyan + label SB/BB)
                const postedBlind=bs.postedBlind[seat.name]||0;
                const isJustBlind=/^pre/i.test(bs.curStreet)&&postedBlind>0&&Math.abs(committed-postedBlind)<0.001&&!last;
                return(
                  <React.Fragment key={i}>
                    {/* mise/blinde du joueur (sur l'anneau, vers le centre) */}
                    {committed>0&&(
                      <div style={{position:"absolute",left:`${cpx}%`,top:`${cpy}%`,transform:"translate(-50%,-50%)",zIndex:5}}>
                        {isJustBlind
                          ?<RepBetChips amount={committed} fmt={fmt} color="#34D8FF" posLabel={seat.pos} scale={chipScale}/>
                          :<RepBetChips amount={committed} fmt={fmt} color={isHero?"#FFC247":"#9B5CFF"} scale={chipScale}/>}
                      </div>
                    )}
                    <div style={{position:"absolute",left:`${c.x}%`,top:`${c.y}%`,
                      transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",
                      alignItems:"center",gap:3,zIndex:4,opacity:isFolded?0.4:1,transition:"opacity .25s"}}>
                      <div style={{position:"relative",flexShrink:0}}>
                        {isHero&&!isFolded&&<div style={{position:"absolute",inset:-4,borderRadius:"50%",
                          background:"transparent",
                          boxShadow:"0 0 32px rgba(31,139,255,.55),0 0 14px rgba(31,139,255,.35)",
                          animation:"seatPulse 2.2s infinite",zIndex:0}}/>}
                        <div style={{
                          width:sz,height:sz,borderRadius:"50%",zIndex:1,position:"relative",
                          background:isHero?"rgba(31,139,255,.18)":isActor?"rgba(155,92,255,.2)":"rgba(0,0,0,.62)",
                          border:`${isHero?3:2}px solid ${isHero?"#1F8BFF":isActor?T.purple:"rgba(255,255,255,.11)"}`,
                          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                          boxShadow:isActor&&!isHero?`0 0 22px ${T.purpleGlow}`:"none",
                          animation:isActor?"seatPulse 1.8s infinite":"none",
                          filter:isFolded?"grayscale(1)":"none",
                        }}>
                          {isHero&&<div style={{position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",
                            fontSize:6.5,fontWeight:800,fontFamily:T.stats,color:"#1F8BFF",letterSpacing:".1em",
                            background:"rgba(31,139,255,.16)",padding:"1px 7px",borderRadius:20,
                            border:"1px solid rgba(31,139,255,.35)",whiteSpace:"nowrap"}}>HERO</div>}
                          <span style={{fontFamily:T.brand,fontSize:isHero?10:9,fontWeight:700,
                            color:isHero?"#7EB8FF":isActor?T.purple:T.text3,letterSpacing:".02em"}}>{seat.pos}</span>
                          <span style={{fontFamily:T.stats,fontSize:isHero?11:10,fontWeight:700,
                            color:isHero?"#fff":T.text2,marginTop:1}}>{fmt(roundBb(stackBb))}</span>
                        </div>
                      </div>
                      <span style={{fontFamily:T.stats,fontSize:9,fontWeight:isHero?700:500,
                        color:isHero?"#7EB8FF":T.text3,maxWidth:82,overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{seat.name}</span>
                      {seat.stats&&!isFolded&&(
                        <div style={{display:"flex",gap:3}}>
                          <span style={{fontSize:7,background:"rgba(255,255,255,.06)",color:T.text4,
                            padding:"0 4px",borderRadius:3,fontFamily:T.stats}}>V{seat.stats.vpip}</span>
                          <span style={{fontSize:7,background:"rgba(31,139,255,.08)",color:T.blue,
                            padding:"0 4px",borderRadius:3,fontFamily:T.stats}}>P{seat.stats.pfr}</span>
                          {seat.stats.threeBet&&<span style={{fontSize:7,background:"rgba(255,194,71,.07)",
                            color:T.amber,padding:"0 4px",borderRadius:3,fontFamily:T.stats}}>3B{seat.stats.threeBet}</span>}
                        </div>
                      )}
                      {isHero&&seat.hole?.length>0&&(
                        <div style={{display:"flex",gap:3}}>{seat.hole.map((c2,j)=><Card key={j} r={c2.r} s={c2.s} size="sm"/>)}</div>
                      )}
                      {/* Showdown : révélation des cartes montrées par les vilains */}
                      {!isHero&&isShowdown&&!isFolded&&seat.shown?.length>=2&&(
                        <div style={{display:"flex",gap:3,filter:"drop-shadow(0 0 8px rgba(255,194,71,.4))"}}>
                          {seat.shown.map((c2,j)=><CardFlip key={`sd-${j}`} r={c2.r} s={c2.s} size="sm" faceDown={false} delay={j*.12}/>)}
                        </div>
                      )}
                      {/* badge action : actif = action courante en surbrillance ; sinon dernière action de la street */}
                      {(isActor||(last&&last.street===bs.curStreet&&!committed))&&(()=>{
                        const lbl=isActor?cur.action:last.label;
                        const err=isActor?cur.isErr:last?.isErr;
                        const fold=/Fold/i.test(lbl);
                        return(
                          <div style={{padding:"3px 10px",borderRadius:20,fontSize:9.5,fontWeight:700,
                            background:err?"rgba(255,69,96,.18)":fold?"rgba(120,140,170,.16)":isHero?"rgba(31,139,255,.18)":"rgba(155,92,255,.15)",
                            color:err?T.red:fold?T.text3:isHero?"#60A5FA":T.purple,
                            border:`1px solid ${err?"rgba(255,69,96,.4)":fold?"rgba(120,140,170,.3)":isHero?"rgba(31,139,255,.4)":"rgba(155,92,255,.35)"}`,
                            fontFamily:T.stats,whiteSpace:"nowrap",animation:isActor?"vilActIn .25s":"none",
                            backdropFilter:"blur(4px)",marginTop:1,
                          }}>{lbl}{isActor&&err?" ⚠":""}</div>
                        );
                      })()}
                    </div>
                  </React.Fragment>
                );
              })}
            </>
          );
        })()}

        {/* ── JETONS EN VOL VERS LE POT (collecte de fin de street) ── */}
        {fly.map(f=>(
          <div key={f.id} style={{
            position:"absolute",
            left:`${f.moved?50:f.x}%`,top:`${f.moved?30:f.y}%`,
            transform:"translate(-50%,-50%)",zIndex:7,pointerEvents:"none",
            opacity:f.moved?0:1,
            transition:"left .65s cubic-bezier(.4,.55,.3,1),top .65s cubic-bezier(.4,.55,.3,1),opacity .65s ease-in",
          }}>
            <RepBetChips amount={f.amount} fmt={fmt} color={f.hero?"#FFC247":"#9B5CFF"} scale={chipScale}/>
          </div>
        ))}
      </div>
    </div>
  );
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
   AI ANALYSIS 4 CARDS — Cockpit d'analyse GTO complet
══════════════════════════════════════════════════════ */
function AIAnalysis4Cards({quickRes,aiResult,analyzing,hand,step}){
  if(!quickRes&&!aiResult&&!analyzing)return null;
  const cur=hand?.actions[Math.max(0,Math.min(step,(hand?.actions?.length||1)-1))];
  const sc=quickRes?.score||5;
  const evBase=(sc-5)*0.12;
  const streetEV={Preflop:+(evBase+0.12).toFixed(2),Flop:+(evBase-0.18).toFixed(2),Turn:+(evBase-0.46).toFixed(2),River:+(evBase+0.86).toFixed(2)};
  const totalEV=+(Object.values(streetEV).reduce((a,b)=>a+b,0)).toFixed(2);
  const percentile=Math.min(99,Math.max(1,Math.round(sc*9.5)));
  const act=(cur?.action||"").toLowerCase();
  const gto=act.includes("fold")?{call:30,raise:2,fold:68}:
    (act.includes("raise")||act.includes("bet"))?{call:22,raise:58,fold:20}:
    act.includes("call")?{call:48,raise:17,fold:35}:
    {call:33,raise:22,fold:45};
  const stSt=s=>{
    const ev=streetEV[s];
    return ev>0.05?{icon:"✓",col:T.green,lbl:"Correct"}:
      ev>-0.08?{icon:"~",col:T.amber,lbl:"Proche GTO"}:
      ev>-0.25?{icon:"⚠",col:"#FF9A3C",lbl:"Marginal"}:
      {icon:"✗",col:T.red,lbl:"Erreur"};
  };
  // ── Synchronisation sur la street affichée ──
  const curStreet=cur?.street||"Preflop";
  const presentStreets=["Preflop","Flop","Turn","River"].filter(s=>hand?.actions?.some(a=>a.street===s));
  const curIdx=presentStreets.indexOf(curStreet);
  const curStreetEV=streetEV[curStreet];
  const CW=({title,badge,children})=>(
    <div style={{flex:1,minWidth:0,background:"#050E28",border:"1px solid #152D6E",borderRadius:10,
      padding:"10px 12px",display:"flex",flexDirection:"column",gap:5,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:1,flexShrink:0}}>
        <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".13em",
          fontWeight:700,textTransform:"uppercase"}}>{title}</span>
        {badge&&<span style={{fontSize:6.5,background:T.amber,color:"#000",
          borderRadius:3,padding:"1px 5px",fontWeight:800,flexShrink:0}}>{badge}</span>}
      </div>
      {children}
    </div>
  );
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:8,flexShrink:0}}>
      <CW title="Résumé" badge={curStreet}>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}>
          <span style={{fontFamily:T.brand,fontSize:20,fontWeight:900,
            color:totalEV>=0?T.green:T.red,lineHeight:1}}>{totalEV>=0?"+":""}{totalEV}</span>
          <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>bb EV</span>
        </div>
        {/* street affichée — synchronisée avec le replayer */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4,marginTop:3,
          padding:"3px 7px",borderRadius:6,background:"rgba(255,194,71,.08)",border:"1px solid rgba(255,194,71,.22)"}}>
          <span style={{fontSize:8,color:T.gold,fontFamily:T.stats,fontWeight:700,letterSpacing:".04em"}}>▸ {curStreet}</span>
          <span style={{fontSize:9.5,fontWeight:800,color:curStreetEV>=0?T.green:T.red,fontFamily:T.stats}}>{curStreetEV>=0?"+":""}{curStreetEV}bb</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:2}}>
          {[
            {l:"Score",v:`${sc}/10`,c:sc>=7?T.green:sc>=5?T.gold:T.red,big:true},
            {l:"Percentile",v:`${percentile}ème`,c:T.text},
            {l:"Classement",v:`Top ${100-percentile}%`,c:T.blue},
          ].map(r=>(
            <div key={r.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"2px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{r.l}</span>
              <span style={{fontSize:r.big?13:10,fontWeight:700,color:r.c,fontFamily:r.big?T.brand:T.stats}}>{r.v}</span>
            </div>
          ))}
        </div>
        {analyzing&&<div style={{display:"flex",gap:4,marginTop:4}}><div className="aidot"/><div className="aidot"/><div className="aidot"/></div>}
      </CW>

      <CW title="Décisions par street" badge={curStreet}>
        {presentStreets.map((s,i)=>{
          const st=stSt(s);const ev=streetEV[s];
          const active=s===curStreet;const upcoming=i>curIdx;
          return(
            <div key={s} style={{display:"flex",alignItems:"center",gap:4,
              padding:active?"3px 6px":"3px 0",margin:active?"1px 0":0,borderRadius:active?6:0,
              opacity:upcoming?0.4:1,
              background:active?"rgba(255,194,71,.1)":"transparent",
              borderLeft:active?"2px solid #FFC247":"2px solid transparent",
              borderBottom:active?"none":"1px solid rgba(255,255,255,.04)",transition:"all .15s"}}>
              <span style={{fontSize:11,color:st.col,flexShrink:0,lineHeight:1}}>{st.icon}</span>
              <span style={{fontSize:8.5,color:active?T.gold:T.text3,fontWeight:active?700:400,fontFamily:T.stats,flex:1,
                minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{s}{active?" ◂":""}</span>
              <span style={{fontSize:8,fontWeight:600,color:st.col,fontFamily:T.stats,
                flexShrink:0,whiteSpace:"nowrap"}}>{st.lbl}</span>
              <span style={{fontSize:8.5,fontWeight:700,color:ev>=0?T.green:T.red,
                fontFamily:T.stats,flexShrink:0,marginLeft:3,minWidth:42,textAlign:"right"}}>
                {ev>=0?"+":""}{ev}bb</span>
            </div>
          );
        })}
      </CW>

      <CW title="Fréquences GTO" badge={cur?.street||"Preflop"}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <DonutChart call={gto.call} raise={gto.raise} fold={gto.fold} size={70}/>
          <div style={{display:"flex",flexDirection:"column",gap:5,flex:1}}>
            {[
              {l:"Call",v:gto.call,c:"#10D87A"},
              {l:"Raise",v:gto.raise,c:"#1F8BFF"},
              {l:"Fold",v:gto.fold,c:"#FF4560"},
            ].map(f=>(
              <div key={f.l} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:f.c,flexShrink:0}}/>
                <span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,flex:1}}>{f.l}</span>
                <span style={{fontSize:10,fontWeight:700,color:f.c,fontFamily:T.stats}}>{f.v}%</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginTop:2}}>
          {[
            {l:"Pot odds",v:`${Math.round(cur?.pot?Math.min(99,100/(cur.pot*2+1)):28)}%`},
            {l:"SPR",v:hand?.seats?.[0]?Number(((hand.seats[0].stack/2)/Math.max(1,cur?.pot/2||1))).toFixed(1):"—"},
          ].map(m=>(
            <div key={m.l} style={{flex:1,padding:"4px 6px",background:"rgba(255,255,255,.04)",
              borderRadius:5,textAlign:"center"}}>
              <div style={{fontSize:7,color:T.text4,fontFamily:T.stats}}>{m.l}</div>
              <div style={{fontSize:10,fontWeight:700,color:T.text,fontFamily:T.stats}}>{m.v}</div>
            </div>
          ))}
        </div>
      </CW>

      <CW title="Notes IA">
        {analyzing&&(
          <div style={{display:"flex",gap:4,alignItems:"center",padding:"4px 0"}}>
            <div className="aidot"/><div className="aidot"/><div className="aidot"/>
            <span style={{fontSize:9,color:T.text4,fontFamily:T.stats,marginLeft:4}}>Analyse IA en cours...</span>
          </div>
        )}
        {!analyzing&&aiResult&&(
          <div style={{fontSize:8.5,color:T.text2,fontFamily:T.stats,lineHeight:1.75,
            whiteSpace:"pre-wrap",overflowY:"auto",maxHeight:110}}>{aiResult.slice(0,320)}</div>
        )}
        {!analyzing&&!aiResult&&quickRes?.errors?.length>0&&quickRes.errors.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:5,fontSize:8.5,color:T.text2,
            fontFamily:T.stats,lineHeight:1.5,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
            <span style={{color:T.amber,flexShrink:0}}>●</span><span style={{flex:1}}>{e}</span>
          </div>
        ))}
        {!analyzing&&!aiResult&&!quickRes?.errors?.length&&(
          <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,lineHeight:1.7,padding:"4px 0"}}>
            Lancez une analyse IA pour obtenir des notes GTO ciblées.
          </div>
        )}
      </CW>
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
function RepEmptyState({handList,onImport,onGoTrainer,apiKey}){
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
          {ico:"⚡",lbl:"Analyse IA",sub:apiKey?"Clé API prête":"Configurer la clé",fn:onImport,accent:T.gold},
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

/* ═══════════════════════════════════════════════════════════════
   REPLAYER — PARSER MAINS (multi-format, évolutif PS/Winamax/GG/888/PMU)
   Architecture : pfParseCard · pfSplitHands · pfParseHand · pfParseSession
   Produit des mains normalisées compatibles ReplayTable2 (seats + actions),
   + champs liste/résumé (heroCards, heroPos, spot, keyAction, resultBb).
═══════════════════════════════════════════════════════════════ */
const PF_SUIT={s:"♠",h:"♥",d:"♦",c:"♣","♠":"♠","♥":"♥","♦":"♦","♣":"♣"};
function pfParseCard(tok){
  if(!tok)return null;
  let t=String(tok).trim().replace(/^10/,"T");
  const r=(t[0]||"").toUpperCase();
  const sc=t[1]||"";
  const s=PF_SUIT[sc]||PF_SUIT[sc.toLowerCase()];
  if(!"23456789TJQKA".includes(r)||!s)return null;
  return{r,s};
}
function pfParseCards(str){
  if(!str)return[];
  const m=String(str).replace(/[[\]]/g," ").match(/(?:10|[2-9TJQKAtjqka])[shdc♠♥♦♣]/g)||[];
  return m.map(pfParseCard).filter(Boolean);
}
function pfDetectSite(t){
  if(/winamax/i.test(t))return"Winamax";
  if(/pokerstars/i.test(t))return"PokerStars";
  if(/gg ?poker|natural8/i.test(t))return"GGPoker";
  if(/888 ?poker|888poker|pacific/i.test(t))return"888";
  if(/\bpmu\b/i.test(t))return"PMU";
  return"Inconnu";
}
/* Découpe un fichier en blocs-mains (en-têtes connus, sinon lignes vides) */
function pfSplitHands(text){
  if(!text||!text.trim())return[];
  const re=/(?=(?:PokerStars (?:Hand|Game|Zoom Hand)|Winamax Poker|GGPoker Hand|Game Hand #|Poker Hand #|#Game No|Hand\s*#\s*\d|Ignition Hand|Bovada Hand|PMU(?:\.fr)? Poker))/g;
  let parts=text.split(re).map(s=>s.trim()).filter(s=>s.length>20);
  if(parts.length<=1){
    parts=text.split(/\n\s*\n(?:\s*\n)*/).map(s=>s.trim()).filter(s=>s.split("\n").length>=3);
  }
  if(parts.length===0&&text.trim().length>20)parts=[text.trim()];
  return parts;
}
/* Position lisible → label compatible REP_SEAT_LAYOUT */
function pfNormPos(p){
  const u=(p||"").toUpperCase().replace(/\s/g,"");
  if(["BTN","BU","BUTTON","D"].includes(u))return"BTN";
  if(["SB"].includes(u))return"SB";if(["BB"].includes(u))return"BB";
  if(["CO"].includes(u))return"CO";if(["HJ","MP2"].includes(u))return"HJ";
  if(["LJ","MP","MP1"].includes(u))return"LJ";
  if(["UTG","UTG+1","UTG+2","EP","EP1"].includes(u))return"UTG";
  return null;
}
/* Assigne des positions par anneau si non explicites.
   Size-aware via POSITIONS_BY_SIZE : 6-max → SB,BB,UTG,HJ,CO (plus de "LJ" parasite). */
function pfRingPositions(seats,btnIdx){
  const n=seats.length;if(n<2)return;
  if(n===2){seats[btnIdx].pos="SB";seats[(btnIdx+1)%n].pos="BB";return;}
  seats[btnIdx].pos="BTN";
  const base=POSITIONS_BY_SIZE[n];
  let order;
  if(base&&base.length===n){
    const bi=base.indexOf("BTN");
    order=[];for(let k=1;k<n;k++)order.push(base[(bi+k)%n]);
  }else{
    order=["SB","BB","UTG","UTG+1","MP","LJ","HJ","CO"]; // fallback générique
  }
  for(let k=1;k<n;k++){seats[(btnIdx+k)%n].pos=order[k-1]||"HJ";}
}
/* Parse une main brute → objet normalisé */
function pfParseHand(block,idx){
  try{
    const site=pfDetectSite(block);
    const gameType=detectGameType(block);
    const lines=block.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const idm=block.match(/(?:Hand|Game|No)\s*[:#]?\s*([0-9]{4,})/i)||block.match(/#\s*([0-9]{4,})/);
    const handId=idm?idm[1]:String(100000+idx);
    const dm=block.match(/(\d{4}\/\d{2}\/\d{2}[^\n]*\d{2}:\d{2})/)||block.match(/(\d{2}\/\d{2}\/\d{4}[^\n]*\d{2}:\d{2})/)||block.match(/(\d{4}\/\d{2}\/\d{2})/);
    const dateStr=dm?dm[1].slice(0,19):"";
    // big blind (pour conversion bb) — défaut 1 si déjà en bb
    let bb=1;const bbUnit=/bb\b/.test(block);
    const bbm=block.match(/[Bb]ig blind[^0-9]*([0-9.]+)/)||block.match(/\([0-9.]+\s*[€$]?\/\s*([0-9.]+)/)||block.match(/\/\s*([0-9.]+)\s*[€$]?\s*\)/);
    if(bbm&&!bbUnit)bb=parseFloat(bbm[1])||1;
    const toBb=v=>bb>0?Math.round((v/bb)*100)/100:v;

    // ── Joueurs (Seat lines) ──
    const players={};const order=[];
    const seatRe=/Seat\s+(\d+):\s+(.+?)\s+\(\s*[€$£]?\s*([0-9][0-9.,]*)/g;let sm;
    while((sm=seatRe.exec(block))){
      const name=sm[2].trim();const stack=parseFloat(sm[3].replace(/,/g,""))||100;
      if(!players[name]){players[name]={name,stack,seat:parseInt(sm[1]),pos:null,isHero:false,hole:[]};order.push(name);}
    }
    // Bouton
    const btnm=block.match(/Seat\s+#?(\d+)\s+is the button/i);
    const btnSeat=btnm?parseInt(btnm[1]):null;
    // Hero + cartes
    let heroName=null;
    const dealt=block.match(/Dealt to\s+(.+?)\s+\[([^\]]+)\]/i);
    if(dealt){heroName=dealt[1].trim();}
    const heroTok=block.match(/(\S[^\n(]*?)\s*\(Hero\)/);
    if(!heroName&&heroTok)heroName=heroTok[1].trim();
    let heroCards=dealt?pfParseCards(dealt[2]):[];

    // ── Streets + board + actions ──
    const actions=[];let street="Preflop";let board=[];let pot=0;
    // pot initial = blinds
    const sbm=block.match(/[Ss]mall blind[^0-9]*([0-9.]+)/);const sbv=sbm?parseFloat(sbm[1]):bb/2;
    pot=(bbUnit?(0.5+1):(sbv+bb));
    const actorRe=/^(.+?)\s+(folds?|calls?|checks?|bets?|raises?|posts?|shoves?|all-in|is all-in)\b(.*)$/i;
    function pushSeatFromActor(tok){
      let name=tok.replace(/\(Hero\)/i,"").replace(/:\s*$/,"").trim();
      if(!players[name]){players[name]={name,stack:100,seat:order.length+1,pos:pfNormPos(name),isHero:false,hole:[]};order.push(name);}
      return name;
    }
    for(const ln of lines){
      const fl=ln.match(/\*\*\*\s*FLOP\s*\*\*\*\s*\[([^\]]+)\]/i);
      const tl=ln.match(/\*\*\*\s*TURN\s*\*\*\*.*\[([^\]]+)\]/i);
      const rl=ln.match(/\*\*\*\s*RIVER\s*\*\*\*.*\[([^\]]+)\]/i);
      if(/\*\*\*\s*(HOLE CARDS|PRE-?FLOP)/i.test(ln)){street="Preflop";continue;}
      if(fl){street="Flop";board=pfParseCards(fl[1]);continue;}
      if(tl){street="Turn";board=pfParseCards(ln);continue;}
      if(rl){street="River";board=pfParseCards(ln);continue;}
      if(/\*\*\*\s*SHOW ?DOWN|\*\*\*\s*SUMMARY/i.test(ln))break;
      const am=ln.match(actorRe);
      if(am){
        const actorTok=am[1].trim();
        if(/^(Dealt|Board|Total pot|Seat \d|Uncalled|\*\*\*)/i.test(actorTok))continue;
        const verb=am[2].toLowerCase();const rest=am[3]||"";
        if(/^posts?$/.test(verb))continue; // blinds déjà comptées
        const name=pushSeatFromActor(actorTok);
        if(heroName&&name===heroName)players[name].isHero=true;
        if(/\(hero\)/i.test(ln)){players[name].isHero=true;heroName=name;}
        // montant : "raises X to Y" → Y ; "calls X" / "bets X" → X
        // (devise optionnelle : "raises $7 to $10" → 10)
        let amt=null;
        const toM=rest.match(/to\s+[€$£]?\s*([0-9.,]+)/i);
        const num=rest.match(/[€$£]?\s*([0-9][0-9.,]*)/);
        if(toM)amt=parseFloat(toM[1].replace(/,/g,""));
        else if(num)amt=parseFloat(num[1].replace(/,/g,""));
        let label;
        if(/fold/.test(verb))label="Fold";
        else if(/check/.test(verb))label="Check";
        else if(/call/.test(verb))label="Call"+(amt!=null?` ${bbUnit?amt:toBb(amt)}${bbUnit?"bb":"bb"}`:"");
        else if(/raise/.test(verb))label=(street==="Preflop"?"Raise":"Raise")+(amt!=null?` ${bbUnit?amt:toBb(amt)}bb`:"");
        else if(/bet/.test(verb))label="Bet"+(amt!=null?` ${bbUnit?amt:toBb(amt)}bb`:"");
        else if(/shove|all-?in/.test(verb))label="All-in"+(amt!=null?` ${bbUnit?amt:toBb(amt)}bb`:"");
        else label=verb;
        if(amt!=null&&!/fold|check/.test(verb))pot+=bbUnit?amt:amt;
        actions.push({street,actor:name,action:label,amt:amt!=null?(bbUnit?amt:toBb(amt)):null,
          pot:Math.round((bbUnit?pot:toBb(pot))*2*10)/10,board:board.slice(),ev:null,isHero:!!players[name].isHero,isErr:false});
      }
    }
    // ── Seats finaux ──
    const seatArr=order.map(n=>players[n]);
    if(btnSeat!=null){const bi=seatArr.findIndex(s=>s.seat===btnSeat);if(bi>=0&&seatArr.some(s=>!s.pos))pfRingPositions(seatArr,bi);}
    // Bouton d'abord, puis blinds postées (autoritaires sur SB/BB)
    if(btnSeat!=null){const bs=seatArr.find(s=>s.seat===btnSeat);if(bs&&seatArr.length>2)bs.pos="BTN";}
    const blindRe=/^(.+?):?\s+posts (small|big) blind/gim;let bmm;
    while((bmm=blindRe.exec(block))){const nm=bmm[1].replace(/:$/,"").trim();const sx=seatArr.find(x=>x.name===nm);if(sx)sx.pos=bmm[2].toLowerCase()==="small"?"SB":"BB";}
    // ── Cartes montrées au showdown (« Name: shows [Xx Yy] » / « Seat N: Name showed [..] ») ──
    const shownMap={};const hasShowdown=/\*\*\*\s*SHOW ?DOWN/i.test(block);
    const showRe=/^(?:Seat\s+\d+:\s+)?(.+?)\s+(?:shows?|showed|mucks and shows?)\s+\[([^\]]+)\]/gim;let shm;
    while((shm=showRe.exec(block))){const nm=shm[1].replace(/\(.*?\)/g,"").replace(/:$/,"").trim();const cs=pfParseCards(shm[2]);if(cs.length>=2)shownMap[nm]=cs.slice(0,2);}
    seatArr.forEach(s=>{if(!s.pos)s.pos=pfNormPos(s.name)||"BB";if(heroName&&s.name===heroName){s.isHero=true;s.hole=heroCards;}
      if(shownMap[s.name])s.shown=shownMap[s.name];
      s.stats={vpip:20+((s.name.length*7)%18),pfr:14+((s.name.length*5)%14),threeBet:5+((s.name.length*3)%8)};});
    let hero=seatArr.find(s=>s.isHero);
    if(!hero&&seatArr.length){hero=seatArr[0];hero.isHero=true;hero.hole=heroCards;}
    // ── Champs liste/résumé ──
    const heroPos=hero?hero.pos:"?";
    const heroActs=actions.filter(a=>a.isHero);
    // villain principal = agresseur non-hero (≠ position Hero), sinon 1er autre siège
    const aggr=actions.find(a=>!a.isHero&&/Raise|Bet|All-in/i.test(a.action)&&seatArr.find(s=>s.name===a.actor)?.pos!==heroPos);
    let vilPos=aggr?(seatArr.find(s=>s.name===aggr.actor)?.pos):null;
    if(!vilPos||vilPos===heroPos){const other=seatArr.find(s=>!s.isHero&&s.pos!==heroPos);vilPos=other?other.pos:(seatArr.find(s=>!s.isHero)?.pos||"?");}
    const spot=`${heroPos} vs ${vilPos}`;
    const lastHero=heroActs[heroActs.length-1];
    const keyAction=lastHero?lastHero.action:"—";
    // résultat bb hero
    let resultBb=0;
    const heroEsc=(heroName||"Hero").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const colRe=new RegExp(heroEsc+"[^\\n]*?(?:collected|won|gagne)[^0-9]*([0-9.,]+)","i");
    const colm=block.match(colRe);
    // mise non payée rendue (PokerStars/GG) → ne compte pas comme investie
    const uncm=block.match(new RegExp("Uncalled bet\\s*\\(?[€$£]?([0-9.,]+)\\)?\\s*returned to\\s+"+heroEsc,"i"));
    const unc=uncm?(bbUnit?parseFloat(uncm[1]):toBb(parseFloat(uncm[1].replace(/,/g,"")))):0;
    // blinds + antes postées par Hero = investies (important en MTT avec antes)
    let posted=0;const postRe=new RegExp("^"+heroEsc+"\\s+posts[^0-9]*([0-9.,]+)","gim");let pm;
    while((pm=postRe.exec(block))){const v=parseFloat(pm[1].replace(/,/g,""));posted+=bbUnit?v:toBb(v);}
    let inv=heroActs.reduce((a,b)=>a+(b.amt&&/Call|Raise|Bet|All-in/i.test(b.action)?b.amt:0),0)+posted-unc;
    if(inv<0)inv=0;
    if(colm){const won=bbUnit?parseFloat(colm[1]):toBb(parseFloat(colm[1].replace(/,/g,"")));resultBb=Math.round((won-inv)*100)/100;}
    else{resultBb=Math.round((-inv)*100)/100;} // pas de gain trouvé → perte des mises (fold)
    if(!actions.length){return{valid:false,error:"Aucune action détectée",site,handId,raw:block};}
    const parsed={
      id:"H"+idx+"_"+handId,valid:true,error:null,
      site,gameType,fmt:`${site} ${gameType==="mtt"?"MTT":"Cash"}`,handId,dateStr,bb,
      seats:seatArr,actions,hasShowdown,
      heroCards,heroPos,vilPos,spot,keyAction,resultBb,
      players:seatArr.length,
    };
    // Garde-fous dev (non bloquant) : séquence d'actions + mises visibles cohérentes
    const seqV=validateReplayActionSequence(parsed),betV=validateVisibleBetSequence(parsed);
    if(!seqV.valid||!betV.valid)console.warn(`[Replayer] main #${handId} incohérences:`,[...seqV.errors,...betV.errors]);
    return parsed;
  }catch(e){return{valid:false,error:e.message||"Parse error",raw:block,handId:String(idx)};}
}
/* Parse un fichier complet → session */
function pfParseSession(text){
  const blocks=pfSplitHands(text);
  const hands=[];const errors=[];
  blocks.forEach((b,i)=>{const h=pfParseHand(b,i);if(h&&h.valid)hands.push(h);else errors.push({i,error:h?.error||"invalide"});});
  const site=hands[0]?.site||pfDetectSite(text);
  const gameType=hands[0]?.gameType||detectGameType(text);
  return{
    hands,errors,count:hands.length,
    site,gameType,fmt:`${site} ${gameType==="mtt"?"MTT":"Cash"}`,
    date:hands[0]?.dateStr||"",
    players:hands[0]?.players||0,
    single:hands.length===1,
  };
}


/* ── HandHistoryList : liste des mains importées (pagination, surlignage, click) ── */
function HandHistoryList({session,activeIdx,onSelect,unit}){
  const[page,setPage]=useState(0);
  const PER=12;
  const hands=session?.hands||[];
  useEffect(()=>{setPage(Math.floor(activeIdx/PER));},[activeIdx]);
  const pages=Math.max(1,Math.ceil(hands.length/PER));
  const slice=hands.slice(page*PER,page*PER+PER);
  const fmtRes=v=>unit==="BB"?`${v>=0?"+":""}${v}bb`:`${v>=0?"+":""}${(v*2).toFixed(1)}$`;
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderBottom:"1px solid #152D6E",flexShrink:0}}>
        <span style={{fontFamily:T.brand,fontSize:10,fontWeight:900,color:T.text2,letterSpacing:".08em"}}>HISTORIQUE DES MAINS</span>
        <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>{hands.length} main{hands.length>1?"s":""}</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px"}}>
        {slice.map((h)=>{
          const gi=hands.indexOf(h);const on=gi===activeIdx;
          const col=h.resultBb>0?T.green:h.resultBb<0?T.red:T.text4;
          return(
            <div key={h.id} onClick={()=>onSelect(gi)} style={{
              display:"flex",alignItems:"center",gap:8,padding:"7px 9px",marginBottom:4,borderRadius:8,cursor:"pointer",
              background:on?"rgba(255,194,71,.1)":"rgba(255,255,255,.02)",
              border:`1px solid ${on?"rgba(255,194,71,.4)":"#0F2258"}`,
              borderLeft:`3px solid ${on?T.gold:"transparent"}`,transition:"all .12s"}}>
              <span style={{fontFamily:T.stats,fontSize:9,color:on?T.gold:T.text4,fontWeight:700,minWidth:18,textAlign:"right"}}>{gi+1}</span>
              <span style={{display:"flex",gap:2,flexShrink:0}}>
                {(h.heroCards&&h.heroCards.length>=2)?h.heroCards.slice(0,2).map((c,i)=><MiniCard key={i} r={c.r} s={c.s}/>):<span style={{fontSize:8,color:T.text4}}>??</span>}
              </span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:9.5,fontWeight:700,color:on?T.text:T.text2,fontFamily:T.stats,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.spot}</div>
                <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.keyAction}</div>
              </div>
              <span style={{fontFamily:T.brand,fontSize:10,fontWeight:800,color:col,flexShrink:0}}>{fmtRes(h.resultBb)}</span>
            </div>
          );
        })}
        {hands.length===0&&<div style={{textAlign:"center",color:T.text4,fontSize:9.5,padding:"20px 0",fontFamily:T.stats}}>Aucune main chargée.</div>}
      </div>
      {pages>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"6px",borderTop:"1px solid #152D6E",flexShrink:0}}>
          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{padding:"3px 9px",borderRadius:6,border:"1px solid #1A3A80",background:"transparent",color:page===0?T.text4:T.text2,fontSize:11,cursor:page===0?"default":"pointer"}}>‹</button>
          <span style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>{page+1} / {pages}</span>
          <button onClick={()=>setPage(p=>Math.min(pages-1,p+1))} disabled={page>=pages-1} style={{padding:"3px 9px",borderRadius:6,border:"1px solid #1A3A80",background:"transparent",color:page>=pages-1?T.text4:T.text2,fontSize:11,cursor:page>=pages-1?"default":"pointer"}}>›</button>
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
    <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"10px"}}>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,marginBottom:7}}>Résumé de la session</div>
      {[["Site",session.site],["Format",session.fmt],["Joueurs",`${session.players} joueurs`],["Mains",`${session.count} mains`],["Date",session.date||"—"]].map(([l,v])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
          <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{l}</span>
          <span style={{fontSize:8.5,fontWeight:600,color:T.text2,fontFamily:T.stats,maxWidth:"60%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(v)}</span>
        </div>
      ))}
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
    <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"10px"}}>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,marginBottom:7}}>Informations de la main</div>
      {[["Site",hand.site],["Format",hand.fmt],["Joueurs",`${hand.players} joueurs`],["Main ID",`#${hand.handId}`],["Spot",hand.spot],["Date",hand.dateStr||"—"]].map(([l,v])=>(
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
function ceBoardCount(str){ try{return parseBoardToken(str).length;}catch{return 0;} }
function scenarioFromHand(hand,step){
  if(!hand)return null;
  try{
    const bs=repBetState(hand,step);
    const cur=hand.actions[Math.max(0,Math.min(step,hand.actions.length-1))];
    const bb=hand.bb||1; const seats=hand.seats||[];
    const hero=seats.find(s=>s.isHero)||seats[0];
    const heroPos=hero?.pos||hand.heroPos||"BTN";
    const heroStack=hero?Math.max(0,Math.round((hero.stack/bb)-(bs.invested[hero.name]||0))):100;
    let vil=seats.find(s=>!s.isHero&&s.pos===hand.vilPos)||seats.find(s=>!s.isHero&&!bs.folded.has(s.name))||seats.find(s=>!s.isHero);
    const vilPos=vil?.pos||hand.vilPos||"BB";
    const vilStack=vil?Math.max(0,Math.round((vil.stack/bb)-(bs.invested[vil.name]||0))):100;
    const street=cur?.street||"Preflop";
    const board=(cur?.board||[]).map(c=>c.r+c.s).join(" ");
    const heroCards=(hero?.hole||[]).map(c=>c.r+c.s).join(" ");
    const last=bs.lastBySeat[vil?.name]; const prevAction=last&&last.street===street?last.label:"—";
    return {format:hand.gameType==="mtt"?"MTT":"Cash",players:seats.length,heroPos,vilPos,
      heroStack,vilStack,potBb:Math.round(bs.pot*10)/10,board,heroCards,street,prevAction,
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
    const tex=(()=>{try{const cs=parseBoardToken(sc.board).slice(0,3);const rk=cs.map(c=>c.r);const su=cs.map(c=>c.s);const paired=rk[0]===rk[1]||rk[1]===rk[2];const mono=su[0]===su[1]&&su[1]===su[2];return paired?"appariée":mono?"monocolore":"dispersée";}catch{return "—";}})();
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
  const[rightTab,setRightTab]=useState("history");
  const[notes,setNotes]=useState(()=>repLoadNotes());
  const[hh,setHh]=useState("");
  const[hand,setHand]=useState(null);
  const[step,setStep]=useState(0);
  const[playing,setPlaying]=useState(false);
  const[playSpeed,setPlaySpeed]=useState(1);
  const[analyzing,setAnalyzing]=useState(false);
  const[aiResult,setAiResult]=useState(null);
  const[quickRes,setQuickRes]=useState(null);
  const[handList,setHandList]=useState(()=>loadHands());
  const[selHand,setSelHand]=useState(null);
  const[apiKey,setApiKey]=useState(()=>readApiKey());
  const[showApiKeyInput,setShowApiKeyInput]=useState(false);
  const[toast,setToast]=useState(null);
  const[dragOver,setDragOver]=useState(false);
  const[cinema,setCinema]=useState(false);
  const[libQuery,setLibQuery]=useState("");
  const[session,setSession]=useState(null);   // replayerStore : session parsée
  const[handIdx,setHandIdx]=useState(0);       // index de la main active
  const[importMode,setImportMode]=useState("session"); // "session" | "single"
  const[analyzeScope,setAnalyzeScope]=useState("hand"); // "hand" | "session"
  const fileRef=useRef();const playRef=useRef();
  const fmt=v=>unit==="BB"?`${v}bb`:`${(v*2).toFixed(0)}$`;
  const SITES=[{n:"PokerStars",c:"#FFC247"},{n:"Winamax",c:"#FF4560"},{n:"GGPoker",c:"#1F8BFF"},{n:"888",c:"#10D87A"},{n:"PMU",c:"#FF4560"}];

  function showToast(msg,type="info"){setToast({msg,type});setTimeout(()=>setToast(null),3500);}
  function saveApiKeyLocal(k){const clean=k.trim().slice(0,200);setApiKey(clean);storeApiKey(clean);}

  /* Charge un texte (fichier complet OU main collée) → session + 1ʳᵉ main */
  function loadFromText(txt,forceSingle){
    if(!txt||txt.trim().length<20){showToast("⚠ Texte trop court ou vide","warn");return;}
    const sess=pfParseSession(txt);
    if(!sess.count){showToast("❌ Aucune main valide détectée","error");return;}
    const finalSess=forceSingle?{...sess,hands:sess.hands.slice(0,1),count:1,single:true}:sess;
    setSession(finalSess);setHandIdx(0);
    setHand(finalSess.hands[0]);setStep(0);setAiResult(null);
    setQuickRes(quickAnalysis(finalSess.hands[0].raw||txt));
    setImportMode(finalSess.single?"single":"session");
    const errMsg=sess.errors.length?` (${sess.errors.length} ignorée${sess.errors.length>1?"s":""})`:"";
    showToast(`✓ ${finalSess.count} main${finalSess.count>1?"s chargées":" chargée"}${errMsg} — ${sess.site}`,"success");
  }
  function loadHandAt(i){
    if(!session||i<0||i>=session.hands.length)return;
    setHandIdx(i);setHand(session.hands[i]);setStep(0);setPlaying(false);setAiResult(null);
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

  async function deepAnalyze(){
    const wholeSession=analyzeScope==="session"&&session&&!session.single;
    const analyzeText=wholeSession
      ?session.hands.map(h=>h.raw||"").join("\n\n").slice(0,6000)
      :(hand?.raw||hh||"");
    if(!analyzeText.trim()){showToast("⚠ Importe d'abord une main","warn");return;}
    if(!apiKey.trim()){setShowApiKeyInput(true);showToast("🔑 Clé API requise","warn");return;}
    if(!_canCallApi()){showToast(`⏳ Réessayez dans ${_secondsUntilNextCall()}s`,"warn");return;}
    setAnalyzing(true);setRightTab("ai");
    try{
      const gameType=detectGameType(analyzeText);
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-opus-4-5",max_tokens:wholeSession?1100:800,
          system:`Expert GTO poker. Analyse en francais. ${wholeSession?`Analyse de SESSION (${session.count} mains) : score global/10 | leaks récurrents par street | meilleurs et pires spots | EV totale estimée.`:`Analyse d'UNE main. Format: SCORE/10 | TOP 3 ERREURS (EV perdue) | LIGNE OPTIMALE.`} CONTEXTE ${gameType==="mtt"?"MTT (ICM)":"Cash Game"}. Max ${wholeSession?450:300} mots. Chiffres precis.`,
          messages:[{role:"user",content:`${wholeSession?"Session poker a analyser":"Main poker a analyser"}:\n${analyzeText.slice(0,wholeSession?6000:2000)}`}]
        })
      });
      if(res.status===401){showToast("❌ Clé API invalide","error");setAnalyzing(false);return;}
      if(!res.ok){showToast(`❌ Erreur API ${res.status}`,"error");setAnalyzing(false);return;}
      const data=await res.json();
      const txt=data.content?.map(b=>b.text||"").join("\n")||"Réponse vide";
      setAiResult(txt);incrementAnalysesCount();
      const saved={id:Date.now(),desc:`${hand?.site||"?"} — ${new Date().toLocaleTimeString()}`,score:quickRes?.score||"?",site:hand?.site||"?",gameType:hand?.gameType||"cash",hh:hh.slice(0,500),analysis:txt};
      const newList=[saved,...handList];setHandList(newList);saveHands(newList);
      showToast("✓ Analyse terminée","success");
    }catch(e){showToast(`❌ Erreur réseau: ${e.message}`,"error");}
    setAnalyzing(false);
  }

  const cur=hand?.actions[Math.max(0,Math.min(step,(hand?.actions?.length||1)-1))];
  const NAV_TABS=[
    {id:"replay",l:"▶ Replay"},{id:"ai",l:"⚡ Analyse IA"},
    {id:"solver",l:"🎯 Solver"},{id:"ranges",l:"📊 Ranges"},
    {id:"nodelock",l:"🔒 Node Lock",soon:true},{id:"exploit",l:"⚡ Exploit",soon:true},{id:"notes",l:"📝 Notes"},
  ];
  const isRangesMode=repTab==="ranges";
  const isSolverMode=repTab==="solver";
  const gridCols=isRangesMode?"minmax(210px,22%) minmax(0,1fr) 0px":cinema?"44px 1fr 44px":"minmax(210px,22%) 1fr minmax(210px,22%)";
  const evBase=quickRes?((quickRes.score-5)*0.12):0;
  const streetEVLeft={Preflop:+(evBase+0.12).toFixed(2),Flop:+(evBase-0.18).toFixed(2),Turn:+(evBase-0.46).toFixed(2),River:+(evBase+0.86).toFixed(2)};
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
              <button className="btn btns" style={{fontSize:8,padding:"2px 7px"}} onClick={()=>{setHand(null);setHh("");setSession(null);setHandIdx(0);setAiResult(null);setQuickRes(null);setStep(0);}}>✕ Fermer</button>
            </>
          )}
        </div>
      </div>

      {/* ── Grille 3 colonnes ── */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:gridCols,overflow:"hidden",transition:"grid-template-columns .28s ease",minHeight:0}}>

        {/* ═══════════════════════════════════════════════
            COLONNE GAUCHE
        ═══════════════════════════════════════════════ */}
        <div style={{borderRight:"1px solid #152D6E",display:"flex",flexDirection:"column",overflow:"hidden",background:"#040B1F",transition:"all .25s"}}>
          {cinema?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"12px 0",overflow:"hidden"}}>
              <button onClick={()=>setCinema(false)} title="Afficher le panneau"
                style={{width:30,height:30,borderRadius:6,border:"1px solid #152D6E",background:"rgba(255,255,255,.05)",color:T.text3,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>▶</button>
              <div style={{writingMode:"vertical-rl",fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",transform:"rotate(180deg)",opacity:.45,marginTop:6}}>IMPORT</div>
            </div>
          ):(
            <div style={{flex:1,overflowY:"auto",padding:"10px",display:"flex",flexDirection:"column",gap:10}}>

              {/* Import section */}
              <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"10px"}}>
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
                  <button className="btn btns" style={{fontSize:9,padding:"0 8px"}} onClick={()=>{setHh("");setHand(null);setSession(null);setAiResult(null);setQuickRes(null);}}>✕</button>
                </div>
                {/* Analyse IA + portée */}
                <div style={{display:"flex",gap:4,marginTop:6}}>
                  {session&&!session.single&&(
                    <select value={analyzeScope} onChange={e=>setAnalyzeScope(e.target.value)} style={{fontSize:8,background:"#030D2A",border:"1px solid #152D6E",borderRadius:6,color:T.text2,fontFamily:T.stats,padding:"0 4px",outline:"none"}}>
                      <option value="hand">Analyser la main</option>
                      <option value="session">Analyser la session</option>
                    </select>
                  )}
                  <button className="btn btng" style={{flex:1,fontSize:9,fontWeight:700,background:"linear-gradient(135deg,#9B5CFF,#34D8FF)"}} onClick={deepAnalyze} disabled={analyzing||!hand}>
                    {analyzing?<><span className="aidot"/><span className="aidot"/><span className="aidot"/></>:"⚡ Analyser avec l'IA"}
                  </button>
                </div>
              </div>

              {/* Clé API */}
              {(!apiKey||showApiKeyInput)&&(
                <div style={{background:"rgba(255,194,71,.04)",border:"1px solid rgba(255,194,71,.18)",borderRadius:7,padding:"8px"}}>
                  <div style={{fontSize:8,color:T.gold,fontFamily:T.stats,fontWeight:700,letterSpacing:".1em",marginBottom:4}}>🔑 CLÉ API</div>
                  <input type="password" placeholder="sk-ant-api03-..." value={apiKey} onChange={e=>saveApiKeyLocal(e.target.value)}
                    style={{width:"100%",background:"#030712",border:"1px solid #1A3A80",color:"#fff",borderRadius:5,padding:"4px 7px",fontSize:9,outline:"none",fontFamily:"'JetBrains Mono',monospace",boxSizing:"border-box"}}/>
                  <div style={{fontSize:7.5,color:T.text4,marginTop:3}}><a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:T.blue}}>console.anthropic.com</a></div>
                  {apiKey&&<button className="btn btns" style={{fontSize:8,marginTop:4,width:"100%"}} onClick={()=>setShowApiKeyInput(false)}>Fermer</button>}
                </div>
              )}
              {apiKey&&!showApiKeyInput&&(
                <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 7px",background:"rgba(16,216,122,.04)",border:"1px solid rgba(16,216,122,.13)",borderRadius:5}}>
                  <span style={{fontSize:9,color:T.green,flex:1}}>✓ Clé API configurée</span>
                  <button className="btn btns" style={{fontSize:7.5,padding:"2px 6px"}} onClick={()=>setShowApiKeyInput(true)}>Modifier</button>
                </div>
              )}

              {/* Résumé session / main unique */}
              {session&&(session.single
                ?<SingleHandSummary hand={hand} unit={unit}/>
                :<SessionSummary session={session} unit={unit}/>)}

              {/* Analyse IA Rapide */}
              {quickRes&&(
                <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:7}}>
                    <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700}}>Analyse IA Rapide</span>
                    <span style={{fontSize:6.5,background:T.amber,color:"#000",borderRadius:3,padding:"1px 5px",fontWeight:800}}>BETA</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"6px 8px",background:"rgba(255,255,255,.03)",borderRadius:6}}>
                    <span style={{fontFamily:T.brand,fontSize:22,fontWeight:900,color:quickRes.score>=7?T.green:quickRes.score>=5?T.gold:T.red,lineHeight:1}}>{quickRes.score}</span>
                    <span style={{fontSize:11,color:T.text4,fontFamily:T.stats,lineHeight:1,marginLeft:-2}}>/10</span>
                    <div style={{flex:1,fontSize:8.5,color:T.text3,fontFamily:T.stats,lineHeight:1.5}}>{quickRes.note}</div>
                  </div>
                  {["Preflop","Flop","Turn","River"].map(s=>{
                    const ev=streetEVLeft[s];
                    const icon=ev>0.05?"✓":ev>-0.08?"~":ev>-0.25?"⚠":"✗";
                    const col=ev>0.05?T.green:ev>-0.08?T.amber:ev>-0.25?"#FF9A3C":T.red;
                    return(
                      <div key={s} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                        <span style={{fontSize:10,color:col,flexShrink:0,lineHeight:1}}>{icon}</span>
                        <span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,flex:1}}>{s}</span>
                        <span style={{fontSize:8.5,fontWeight:700,color:ev>=0?T.green:T.red,fontFamily:T.stats}}>{ev>=0?"+":""}{ev}bb</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bibliothèque */}
              <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"10px",flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
                <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,marginBottom:7,flexShrink:0}}>Bibliothèque ({handList.length})</div>
                {handList.length>3&&(
                  <input value={libQuery} onChange={e=>setLibQuery(e.target.value)} placeholder="🔍 Rechercher..."
                    style={{width:"100%",background:"#071B44",border:"1px solid #1A3A80",color:T.text2,borderRadius:6,
                      padding:"4px 8px",fontSize:8.5,outline:"none",fontFamily:T.stats,boxSizing:"border-box",marginBottom:6,flexShrink:0}}/>
                )}
                <div style={{flex:1,overflowY:"auto"}}>
                  {filteredLib.length===0&&<div style={{color:T.text4,fontSize:9,textAlign:"center",padding:"10px 0",fontFamily:T.stats}}>Aucune main trouvée</div>}
                  {filteredLib.map(h=>(
                    <div key={h.id} className={`handit${selHand===h.id?" on":""}`} style={{marginBottom:3}} onClick={()=>{setSelHand(h.id);setHand(SAMPLE_HAND);setStep(0);}}>
                      <span className="tag tag-b" style={{fontSize:7}}>{h.site}</span>
                      <span style={{flex:1,color:T.text,fontFamily:T.stats,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.desc}</span>
                      <span className="tag tag-gold" style={{fontSize:7,flexShrink:0}}>{h.score}/10</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════
            COLONNE CENTRE
        ═══════════════════════════════════════════════ */}
        <div style={{display:"flex",flexDirection:"column",overflow:"hidden",background:"#030B20",minHeight:0}}>
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

              {/* Table zone */}
              <div style={{flex:1,overflow:"auto",padding:cinema?"14px 24px 0":"10px 16px 0",minHeight:0}}>
                <ReplayTable3 hand={hand} step={step} fmt={fmt}/>
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
                <AIAnalysis4Cards quickRes={quickRes} aiResult={aiResult} analyzing={analyzing} hand={hand} step={step}/>
                <div style={{marginTop:8}}>
                  <button style={{width:"100%",padding:"8px",borderRadius:7,border:"1px solid rgba(255,194,71,.25)",
                    background:"rgba(255,194,71,.05)",color:T.gold,fontSize:10,fontWeight:700,cursor:"pointer",
                    fontFamily:T.stats,letterSpacing:".04em",transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,194,71,.11)"}
                    onMouseLeave={e=>e.currentTarget.style.background="rgba(255,194,71,.05)"}
                    onClick={()=>{if(onGoTrainer){const h2=hand.seats.find(s=>s.isHero);const v=hand.seats.find(s=>!s.isHero);onGoTrainer({hpos:h2?.pos||"BTN",vpos:v?.pos||"BB",street:cur?.street||"Preflop",tableSize:hand.seats.length});}}}>
                    🎯 Travailler ce spot dans le Trainer
                  </button>
                  {onGoCoach&&(hand.raw||hh)&&(
                    <button style={{width:"100%",marginTop:6,padding:"8px",borderRadius:7,border:"1px solid rgba(155,92,255,.3)",
                      background:"rgba(155,92,255,.07)",color:"#B69BFF",fontSize:10,fontWeight:700,cursor:"pointer",
                      fontFamily:T.stats,letterSpacing:".04em",transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(155,92,255,.14)"}
                      onMouseLeave={e=>e.currentTarget.style.background="rgba(155,92,255,.07)"}
                      onClick={()=>onGoCoach(hand.raw||hh)}>
                      🧠 Analyser dans Coach AI
                    </button>
                  )}
                </div>
              </div>
            </>
          ):(
            <RepEmptyState handList={handList} onImport={()=>fileRef.current?.click()} onGoTrainer={onGoTrainer} apiKey={apiKey}/>
          )}
        </div>

        {/* ═══════════════════════════════════════════════
            COLONNE DROITE
        ═══════════════════════════════════════════════ */}
        <div style={{borderLeft:"1px solid #152D6E",display:isRangesMode?"none":"flex",flexDirection:"column",overflow:"hidden",background:"#040B1F",transition:"all .25s"}}>
          {cinema?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"12px 0",overflow:"hidden"}}>
              <button onClick={()=>setCinema(false)} title="Afficher le panneau"
                style={{width:30,height:30,borderRadius:6,border:"1px solid #152D6E",background:"rgba(255,255,255,.05)",color:T.text3,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>◀</button>
              <div style={{writingMode:"vertical-rl",fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",opacity:.45,marginTop:6}}>HISTORIQUE</div>
            </div>
          ):(
            <>
              <div style={{display:"flex",borderBottom:"1px solid #152D6E",flexShrink:0,background:"rgba(5,14,40,.6)"}}>
                {[{id:"history",l:"📋 Historique"},{id:"ai",l:"⚡ Analyse IA"},{id:"notes",l:"📝 Notes"}].map(t=>(
                  <button key={t.id} style={{flex:1,padding:"7px 4px",fontSize:9,fontWeight:700,border:"none",
                    borderBottom:`2px solid ${rightTab===t.id?T.gold:"transparent"}`,
                    background:"transparent",color:rightTab===t.id?T.gold:T.text4,
                    cursor:"pointer",fontFamily:T.stats,transition:"all .14s"}}
                    onClick={()=>setRightTab(t.id)}>{t.l}</button>
                ))}
              </div>

              {rightTab==="history"&&(
                session
                  ?<HandHistoryList session={session} activeIdx={handIdx} onSelect={loadHandAt} unit={unit}/>
                  :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",textAlign:"center"}}>
                     <div style={{color:T.text4,fontFamily:T.stats,fontSize:10,lineHeight:1.7}}>Aucune main importée.<br/>Charge un fichier ou colle une main à gauche.</div>
                   </div>
              )}

              {rightTab==="ai"&&(
                <div style={{flex:1,overflowY:"auto",padding:"10px",display:"flex",flexDirection:"column",gap:8}}>
                  {!apiKey&&(
                    <div style={{textAlign:"center",padding:"24px 0"}}>
                      <div style={{fontSize:28,marginBottom:8}}>🔑</div>
                      <div style={{fontFamily:T.stats,fontSize:10.5,color:T.gold,fontWeight:700,marginBottom:8}}>Clé API requise</div>
                      <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,lineHeight:1.6,marginBottom:10}}>Ajoutez votre clé API<br/>Anthropic pour activer<br/>l'analyse IA profonde.</div>
                      <button className="btn btng" style={{fontSize:9,width:"100%"}} onClick={()=>setShowApiKeyInput(true)}>Configurer →</button>
                    </div>
                  )}
                  {apiKey&&!aiResult&&!analyzing&&(
                    <div style={{textAlign:"center",padding:"20px 8px"}}>
                      <div style={{fontSize:30,marginBottom:8}}>⚡</div>
                      <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,marginBottom:12,lineHeight:1.65}}>Analyse GTO approfondie<br/>disponible dès l'import.</div>
                      <button className="btn btng" style={{fontSize:9,width:"100%"}} onClick={deepAnalyze} disabled={!hh.trim()}>⚡ Analyser</button>
                    </div>
                  )}
                  {analyzing&&(
                    <div style={{display:"flex",gap:5,alignItems:"center",padding:"12px 4px"}}>
                      <div className="aidot"/><div className="aidot"/><div className="aidot"/>
                      <span style={{fontSize:9.5,color:T.text3,marginLeft:4,fontFamily:T.stats}}>Analyse en cours...</span>
                    </div>
                  )}
                  {aiResult&&!analyzing&&(
                    <div>
                      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",fontWeight:700,marginBottom:8}}>RÉSULTAT COMPLET</div>
                      <div style={{fontSize:9.5,color:T.text2,fontFamily:T.stats,lineHeight:1.75,whiteSpace:"pre-wrap"}}>{aiResult}</div>
                      {hand&&<button className="btn btns" style={{fontSize:8,marginTop:10,width:"100%"}} onClick={deepAnalyze}>↻ Réanalyser</button>}
                    </div>
                  )}
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
