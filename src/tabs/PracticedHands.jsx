// PokerForge — Mains jouées / pratique (extrait de App.jsx, Phase 3.3)
// PracticedHands (onglet) + TrainerReviewPanel + persistance pf_played_spots.
import React, { useState, useMemo } from "react";
import { T } from "../theme.js";
import { SUIT_STYLE } from "../components/table/deck.js";

function CardChip({r,s,size="sm"}){
  const st=SUIT_STYLE[s]||{color:"#888",bg:"#0F2258",border:"rgba(255,255,255,.1)"};
  return(
    <span className={`cc cc-${size}`} style={{background:st.bg,color:st.color,borderColor:st.border,boxShadow:`0 1px 4px rgba(0,0,0,.4),0 0 4px ${st.glow||"transparent"}`}}>
      {r}{s}
    </span>
  );
}

/* ──────────────────────────────────────────────────────
   ActionBadge — F/C/R/B/X/3B
────────────────────────────────────────────────────── */
function ActionBadge({a}){
  const cls=a==="3B"?"act-3":a==="F"?"act-F":a==="C"?"act-C":a==="R"?"act-R":a==="B"?"act-B":"act-X";
  return <span className={`act-badge ${cls}`}>{a}</span>;
}

/* ──────────────────────────────────────────────────────
   SAMPLE DATA — mains pratiquées
────────────────────────────────────────────────────── */
function genHands(){
  const pos=["BTN","SB","BB","CO","HJ","UTG"];
  const ranks=["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
  const suits=["♠","♥","♦","♣"];
  const ptypes=["SRP","3BP","4BP","Limped"];
  const formats=["Cash","MTT","Spin"];
  const results=["ok","ok","ok","approx","err","ok","approx","err"];
  const acts=["F","C","R","B","X","3B"];
  function rnd(arr){return arr[Math.floor(Math.random()*arr.length)];}
  function rndActs(n){return Array.from({length:n},()=>rnd(acts));}
  function rndBoard(n){return Array.from({length:n},()=>({r:rnd(ranks),s:rnd(suits)}));}
  return Array.from({length:60},(_,i)=>{
    const score=Math.round((30+Math.random()*70)*100)/100;
    const evl=score>=80?0:Math.round((Math.random()*-12)*100)/100;
    const streets={preflop:rndActs(2+Math.floor(Math.random()*4))};
    const hasFlop=Math.random()>.25;
    const hasTurn=hasFlop&&Math.random()>.5;
    const hasRiver=hasTurn&&Math.random()>.4;
    if(hasFlop)streets.flop=rndActs(1+Math.floor(Math.random()*3));
    if(hasTurn)streets.turn=rndActs(1+Math.floor(Math.random()*2));
    if(hasRiver)streets.river=rndActs(1+Math.floor(Math.random()*2));
    const boardLen=hasRiver?5:hasTurn?4:hasFlop?3:0;
    return{
      id:i+1,
      date:`${Math.floor(Math.random()*12)+1}/${Math.floor(Math.random()*28)+1}/2025`,
      result:results[i%results.length],
      format:rnd(formats),
      potType:rnd(ptypes),
      hero:rnd(pos),
      hand:[{r:rnd(ranks),s:rnd(suits)},{r:rnd(ranks),s:rnd(suits)}],
      board:rndBoard(boardLen),
      score,
      evLoss:evl,
      evLossPot:evl===0?0:Math.round(evl*(-8.3+Math.random()*4)*10)/10,
      freqDiff:Math.round(Math.random()*220*10)/10,
      actions:streets,
    };
  });
}
const PRACTICED_HANDS_MOCK=genHands();

/* Charge les spots réels depuis les sessions sauvegardées (pf_played_spots).
   Retourne les mocks si aucune donnée réelle n'existe encore. */
export function loadPlayedSpots(){
  try{
    const raw=localStorage.getItem("pf_played_spots");
    if(raw){const d=JSON.parse(raw);if(Array.isArray(d)&&d.length>0)return d;}
  }catch{}
  return null;
}
export function savePlayedSpots(spots){
  try{localStorage.setItem("pf_played_spots",JSON.stringify(spots.slice(0,500)));}catch{}
}
/* Convertit un ID d'action en code lettre pour ActionBadge */
function actIdToCode(id){
  if(!id) return "?";
  if(id==="FOLD") return "F";
  if(id==="CHECK"||id==="CHECK_BACK") return "X";
  if(id==="CALL") return "C";
  if(id==="RAISE"||id==="3BET") return "R";
  if(id==="ALLIN") return "R"; // All-in = raise agressif
  if(id.startsWith("BET")) return "B";
  return "B";
}

/* Appelé par le Trainer à chaque réponse pour accumuler les spots réels */
export function appendPlayedSpot(spot,correct,ua,mode="gto"){
  try{
    const existing=loadPlayedSpots()||[];
    const ranks=["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
    const suits=["♠","♥","♦","♣"];
    function rnd(arr){return arr[Math.floor(Math.random()*arr.length)];}
    const score=correct?Math.round(70+Math.random()*30):Math.round(20+Math.random()*40);
    const evBest=spot.ev?.[spot.acts?.[spot.ok]?.id]||0;
    const evChosen=spot.ev?.[spot.acts?.[ua]?.id]||0;
    const evLoss=Math.round((evChosen-evBest)*100)/100;
    // evLossPot = EV loss exprimée en % du pot (mesure d'impact réelle)
    const evLossPot=spot.pot>0?Math.round(Math.abs(evLoss)/spot.pot*100):0;
    // freqDiff = écart entre freq GTO action optimale et freq action choisie
    const freqBest=spot.freq?.[spot.acts?.[spot.ok]?.id]||0;
    const freqChosen=spot.freq?.[spot.acts?.[ua]?.id]||0;
    const freqDiff=Math.abs(freqBest-freqChosen);
    const chosenAct=spot.acts?.[ua];
    const bestAct=spot.acts?.[spot.ok];
    // Actions au format lettre (compatible ActionBadge)
    const streetKey=(spot.street||"Preflop").toLowerCase();
    const actionsObj={};
    actionsObj[streetKey]=[actIdToCode(chosenAct?.id)];
    if(!correct) actionsObj[streetKey].push(actIdToCode(bestAct?.id)); // montre la correction
    const entry={
      id:Date.now()+existing.length,
      date:new Date().toLocaleDateString("fr-FR"),
      result:correct?"ok":Math.abs(evLoss)<1?"approx":"err",
      format:spot.fmt?.includes("9-max")?"Cash":spot.fmt?.includes("MTT")?"MTT":spot.fmt?.includes("Spin")?"Spin":"Cash",
      potType:spot.cat||"SRP",
      hero:spot.hpos||"BTN",
      hand:spot.hand||[{r:rnd(ranks),s:rnd(suits)},{r:rnd(ranks),s:rnd(suits)}],
      board:spot.board||[],
      score,
      evLoss,
      evLossPot,
      freqDiff,
      actions:actionsObj,
      spotId:spot.id,
      spotDesc:spot.desc,
      street:spot.street,
      // ── Champs Review/Leak/Drill (slice 1) ──
      vpos:spot.vpos||"BB",
      stack:spot.stack||"100bb",
      mode,
      cat:spot.cat||spot.potType||"SRP",
      chosenLabel:chosenAct?.l||"—",
      bestLabel:bestAct?.l||"—",
      ts:Date.now(),
    };
    savePlayedSpots([entry,...existing]);
  }catch{}
}

/* ══════════════════════════════════════════════════════════════
   REVIEW + LEAK ENGINE (slice 1) — agrège pf_played_spots en
   plus grosses erreurs + leaks par position/pot/street/mode.
════════════════════════════════════════════════════════════════ */
export function buildTrainerReview(spots){
  const list=(spots||[]).filter(s=>s&&s.result);
  const total=list.length;
  const errs=list.filter(s=>s.result==="err");
  const approx=list.filter(s=>s.result==="approx");
  const errRate=total?Math.round(errs.length/total*100):0;
  const avgEvLoss=errs.length?(errs.reduce((a,s)=>a+Math.abs(+s.evLoss||0),0)/errs.length):0;
  const biggest=[...errs].sort((a,b)=>Math.abs(+b.evLoss||0)-Math.abs(+a.evLoss||0)||(+b.evLossPot||0)-(+a.evLossPot||0)).slice(0,6);
  function group(keyFn){
    const m={};
    list.forEach(s=>{const k=keyFn(s);if(!k)return;(m[k]=m[k]||{k,t:0,ok:0,err:0,evLoss:0});m[k].t++;if(s.result==="ok")m[k].ok++;if(s.result==="err"){m[k].err++;m[k].evLoss+=Math.abs(+s.evLoss||0);}});
    return Object.values(m).filter(g=>g.t>=2).map(g=>({...g,acc:Math.round(g.ok/g.t*100),evLoss:Math.round(g.evLoss*10)/10})).sort((a,b)=>b.err-a.err||b.evLoss-a.evLoss);
  }
  return {
    total, errCount:errs.length, approxCount:approx.length, errRate, avgEvLoss:Math.round(avgEvLoss*100)/100,
    biggest,
    byPosition:group(s=>s.hero), byPotType:group(s=>s.cat||s.potType),
    byStreet:group(s=>s.street), byMode:group(s=>s.mode),
  };
}

/* Panneau Review premium — overlay. onDrill(patch) lance un drill ciblé. */
export function TrainerReviewPanel({onClose,onDrill,onReplay}){
  const[spots,setSpots]=useState(()=>loadPlayedSpots()||[]);
  const rv=useMemo(()=>buildTrainerReview(spots),[spots]);
  const clearAll=()=>{try{localStorage.removeItem("pf_played_spots");}catch{};setSpots([]);};
  const QC={ok:"#10D87A",approx:"#FFC247",err:"#FF4560"};
  const Stat=({v,l,c})=>(<div style={{textAlign:"center",minWidth:78}}><div style={{fontFamily:T.brand,fontSize:22,fontWeight:800,color:c||"#7FB8FF"}}>{v}</div><div style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>{l}</div></div>);
  const Leak=({title,items,keyLabel})=>items.length>0&&(
    <div className="cai-card" style={{margin:0}}>
      <div className="cai-card-h">{title}</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {items.slice(0,5).map(g=>{
          const col=g.acc>=70?"#10D87A":g.acc>=50?"#FFC247":"#FF4560";
          return(
            <div key={g.k} style={{display:"flex",alignItems:"center",gap:9,padding:"6px 9px",borderRadius:8,background:"rgba(255,255,255,.025)",border:`1px solid ${col}33`,borderLeft:`3px solid ${col}`}}>
              <span style={{fontFamily:T.brand,fontSize:10,fontWeight:800,color:"#E6EEFF",minWidth:60}}>{g.k}</span>
              <span style={{fontFamily:T.mono,fontSize:11,fontWeight:800,color:col,minWidth:38}}>{g.acc}%</span>
              <span style={{fontSize:9,color:T.text3,fontFamily:T.stats,flex:1}}>{g.err} err · {g.t} spots{g.evLoss>0?` · -${g.evLoss}bb`:""}</span>
              <button className="cai-btn" style={{fontSize:8.5,padding:"5px 10px"}} onClick={()=>onDrill({[keyLabel]:g.k,label:`${title} ${g.k}`})}>🎯 Drill</button>
            </div>
          );
        })}
      </div>
    </div>
  );
  return(
    <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(2,6,18,.9)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 14px",overflowY:"auto"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{maxWidth:680,width:"100%",background:"linear-gradient(160deg,#071633,#040b1f)",border:"1px solid #1A3A80",borderRadius:18,padding:"20px 22px",boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <div style={{fontFamily:T.brand,fontSize:16,fontWeight:900,color:"#fff"}}>🔍 Review & Leak Hunter</div>
          <button onClick={clearAll} title="Vider l'historique" style={{marginLeft:"auto",fontSize:9,color:T.text4,background:"transparent",border:"1px solid #1A3A80",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontFamily:T.stats}}>Vider</button>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:8,border:"1px solid #1A3A80",background:"rgba(255,255,255,.05)",color:T.text3,cursor:"pointer",fontSize:14}}>✕</button>
        </div>
        {rv.total===0?(
          <div style={{fontSize:11,color:T.text3,fontFamily:T.stats,padding:"20px 0",textAlign:"center",lineHeight:1.6}}>Aucun spot enregistré pour l'instant.<br/>Joue une session — chaque décision alimente ta Review et le Leak Hunter.</div>
        ):(
          <>
            <div style={{display:"flex",gap:14,justifyContent:"center",padding:"4px 0 14px",flexWrap:"wrap"}}>
              <Stat v={rv.total} l="spots analysés"/>
              <Stat v={rv.errCount} l="erreurs" c="#FF4560"/>
              <Stat v={`${rv.errRate}%`} l="taux d'erreur" c={rv.errRate>30?"#FF4560":"#FFC247"}/>
              <Stat v={`-${rv.avgEvLoss}`} l="EV loss moy. (bb)" c="#FF8A8A"/>
            </div>
            <button className="cai-btn" style={{width:"100%",justifyContent:"center",background:"linear-gradient(90deg,#FF4560,#FF8A3D)",fontSize:12,padding:"11px",marginBottom:16}} onClick={()=>onDrill({errors:true,label:"mes erreurs"})}>🎯 Relancer un drill sur mes erreurs</button>
            {rv.biggest.length>0&&(
              <div className="cai-card" style={{margin:"0 0 12px"}}>
                <div className="cai-card-h" style={{color:"#FF8A8A"}}>💥 Plus grosses erreurs</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {rv.biggest.map(s=>(
                    <div key={s.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 9px",borderRadius:8,background:"rgba(255,69,96,.05)",border:"1px solid rgba(255,69,96,.2)"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:10.5,fontWeight:700,color:"#E6EEFF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.spotDesc||`${s.hero} vs ${s.vpos} · ${s.cat}`}</div>
                        <div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>{s.hero} · {s.cat} · {s.street} · {s.stack} · joué <b style={{color:"#FF8A8A"}}>{s.chosenLabel}</b> → <b style={{color:"#10D87A"}}>{s.bestLabel}</b></div>
                      </div>
                      <span style={{fontFamily:T.mono,fontSize:10,fontWeight:800,color:"#FF8A8A",whiteSpace:"nowrap"}}>{s.evLoss}bb</span>
                      <button className="cai-btn cai-btn-ghost" style={{fontSize:8.5,padding:"5px 9px"}} onClick={()=>onReplay(s)}>↻ Rejouer</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Leak title="Leaks par position" items={rv.byPosition} keyLabel="hp"/>
              <Leak title="Leaks par type de pot" items={rv.byPotType} keyLabel="cat"/>
              <Leak title="Leaks par street" items={rv.byStreet} keyLabel="street"/>
              <Leak title="Leaks par mode" items={rv.byMode} keyLabel="mode"/>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   HandReplayModal — replay street by street
────────────────────────────────────────────────────── */
function HandReplayModal({hand, onClose}){
  const[street,setStreet]=useState("preflop");
  const[unitBB,setUnitBB]=useState(true);
  const streets=["preflop","flop","turn","river"];
  const streetLabels={preflop:"Preflop",flop:"Flop",turn:"Turn",river:"River"};

  // Board par street (cumulatif)
  const boardByStreet={
    preflop:[],
    flop:hand.board.slice(0,3),
    turn:hand.board.slice(0,4),
    river:hand.board.slice(0,5),
  };

  // Pot estimé par street
  const potByStreet={preflop:1.5,flop:7,turn:20,river:50};
  // Stack estimé
  const stackByStreet={preflop:100,flop:93,turn:73,river:54};
  const bb=n=>unitBB?`${n}bb`:`${(n*2).toFixed(0)}$`;

  // Actions du street courant (simulé depuis les données mock)
  const actsByStreet={
    preflop:[{actor:"Hero",label:"Open 2.5bb",hero:true,ev:"+0.62"},{actor:"Villain",label:"Call",hero:false,ev:null}],
    flop:[{actor:"Hero",label:"Cbet 33%",hero:true,ev:"+1.2"},{actor:"Villain",label:"Call",hero:false,ev:null}],
    turn:[{actor:"Villain",label:"Check",hero:false,ev:null},{actor:"Hero",label:"Bet 60%",hero:true,ev:"+0.8"}],
    river:[{actor:"Hero",label:"Bet Value",hero:true,ev:"+2.1"},{actor:"Villain",label:"Fold",hero:false,ev:null}],
  };

  // Utilise les vraies actions si dispo
  const acts=Object.keys(hand.actions||{}).includes(street)?
    (hand.actions[street]||[]).map((a,i)=>({actor:i%2===0?"Hero":"Villain",label:a,hero:i%2===0,ev:null})):
    actsByStreet[street]||[];

  const board=boardByStreet[street]||[];
  const pot=hand.pot||potByStreet[street];
  const stack=hand.stack||stackByStreet[street];
  const availableStreets=streets.filter(s=>s==="preflop"||(hand.board.length>=(s==="flop"?3:s==="turn"?4:5)));

  return(
    <div className="hrm-overlay" onClick={onClose}>
      <div className="hrm-box" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="hrm-hdr">
          <div className="hrm-title">🃏 REPLAY — {hand.hero} · {hand.format} · {hand.potType}</div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {/* Toggle BB / $ */}
            <button onClick={()=>setUnitBB(u=>!u)} style={{padding:"4px 10px",borderRadius:5,border:"1px solid rgba(255,194,71,.3)",background:"rgba(255,194,71,.08)",color:"#FFC247",fontSize:9.5,fontFamily:"'Inter',sans-serif",fontWeight:700,cursor:"pointer"}}>
              {unitBB?"BB → $":"$ → BB"}
            </button>
            <button onClick={onClose} style={{width:28,height:28,borderRadius:50,border:"1px solid #1A3A80",background:"#050E28",color:"#9FB0CC",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>

        <div className="hrm-body">
          {/* Street nav */}
          <div className="hrm-streets">
            {streets.map(s=>(
              <button key={s} className={`hrm-stbtn${street===s?" on":""}`}
                disabled={!availableStreets.includes(s)}
                onClick={()=>setStreet(s)}>
                {streetLabels[s]}
              </button>
            ))}
          </div>

          {/* Stacks */}
          <div className="hrm-stacks">
            {[{n:"Hero",pos:hand.hero,stk:stack,hero:true},{n:"Villain",pos:"CO",stk:stack*0.95,hero:false}].map(p=>(
              <div key={p.n} className="hrm-stack" style={{borderColor:p.hero?"rgba(255,194,71,.2)":"rgba(155,92,255,.2)"}}>
                <div className="hrm-stack-name">{p.n} · {p.pos}</div>
                <div className="hrm-stack-val" style={{color:p.hero?"#FFC247":"#9B5CFF"}}>{bb(p.stk)}</div>
              </div>
            ))}
            <div className="hrm-stack" style={{borderColor:"rgba(16,216,122,.2)"}}>
              <div className="hrm-stack-name">Pot</div>
              <div className="hrm-stack-val" style={{color:"#10D87A"}}>{bb(pot)}</div>
            </div>
            <div className="hrm-stack">
              <div className="hrm-stack-name">Score</div>
              <div className="hrm-stack-val" style={{color:hand.score>=80?"#10D87A":hand.score>=50?"#FFC247":"#FF4560"}}>{hand.score}</div>
            </div>
          </div>

          {/* Felt avec cartes */}
          <div className="hrm-felt">
            {/* Hero cards */}
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:9,color:"rgba(160,190,170,.4)",fontFamily:"'Inter',sans-serif",fontWeight:700,letterSpacing:".1em"}}>HERO</span>
              {hand.hand.map((c,i)=><Card key={i} r={c.r} s={c.s} size="lg" delay={i*.06}/>)}
            </div>
            {/* Board */}
            {board.length>0&&(
              <div className="hrm-board">
                {board.map((c,i)=><Card key={i} r={c.r} s={c.s} size="md" delay={i*.05}/>)}
              </div>
            )}
            {board.length===0&&(
              <div style={{fontSize:9,color:"rgba(160,190,170,.25)",fontFamily:"'Inter',sans-serif",letterSpacing:".2em"}}>PREFLOP — PAS DE BOARD</div>
            )}
            {/* Pot */}
            <div className="hrm-pot">{bb(pot)}</div>
          </div>

          {/* Actions du street */}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:"#6F81A8",fontFamily:"'Inter',sans-serif",letterSpacing:".15em",fontWeight:700,marginBottom:6}}>{streetLabels[street].toUpperCase()} — SÉQUENCE D'ACTIONS</div>
            <div className="hrm-actions-list">
              {acts.length===0&&<div style={{padding:"10px 12px",color:"#6F81A8",fontSize:10,fontFamily:"'Inter',sans-serif"}}>Aucune action enregistrée pour cette street</div>}
              {acts.map((a,i)=>(
                <div key={i} className="hrm-act" style={{background:a.hero?"rgba(255,194,71,.03)":"transparent"}}>
                  <span className="hrm-act-actor" style={{color:a.hero?"#FFC247":"#9B5CFF"}}>{a.actor}</span>
                  <span className="hrm-act-label" style={{color:a.hero?"#FFFFFF":"#c4c9e8"}}>{a.label}</span>
                  {a.ev&&<span className="hrm-act-ev" style={{
                    background:a.ev.includes("-")?"rgba(255,69,96,.08)":"rgba(16,216,122,.08)",
                    color:a.ev.includes("-")?"#FF4560":"#10D87A",
                    border:`1px solid ${a.ev.includes("-")?"rgba(255,69,96,.2)":"rgba(16,216,122,.2)"}`
                  }}>EV {a.ev}bb</span>}
                </div>
              ))}
            </div>
          </div>

          {/* EV loss global */}
          {hand.evLoss!==0&&(
            <div style={{padding:"9px 12px",background:"rgba(255,69,96,.05)",border:"1px solid rgba(255,69,96,.15)",borderRadius:8,display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#FF4560",fontFamily:"'Inter',sans-serif",fontWeight:700}}>EV total perdu : {hand.evLoss}bb</span>
              <span style={{fontSize:10,color:"#9FB0CC",fontFamily:"'Inter',sans-serif"}}>{hand.evLossPot}% du pot · Fréq. diff: {hand.freqDiff}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   PracticedHands COMPONENT
────────────────────────────────────────────────────── */
export default function PracticedHands(){
  const[search,setSearch]=useState("");
  const[sortKey,setSortKey]=useState("date");
  const[sortDir,setSortDir]=useState("desc");
  const[filterResult,setFilterResult]=useState("Tous");
  const[filterFormat,setFilterFormat]=useState("Tous");
  const[page,setPage]=useState(1);
  const[pageSize,setPageSize]=useState(25);
  const[selected,setSelected]=useState(null);
  const[replayHand,setReplayHand]=useState(null);

  /* Données réelles ou mock */
  const realData=loadPlayedSpots();
  const PRACTICED_HANDS=realData||PRACTICED_HANDS_MOCK;
  const usingRealData=!!realData;

  /* Filtrage */
  const filtered=PRACTICED_HANDS.filter(h=>{
    if(filterResult!=="Tous"&&h.result!==filterResult)return false;
    if(filterFormat!=="Tous"&&h.format!==filterFormat)return false;
    if(search){
      const s=search.toLowerCase();
      if(!h.hero.toLowerCase().includes(s)&&!h.potType.toLowerCase().includes(s)&&!h.format.toLowerCase().includes(s))return false;
    }
    return true;
  });

  /* Tri */
  const sorted=[...filtered].sort((a,b)=>{
    let av=a[sortKey],bv=b[sortKey];
    if(typeof av==="string")av=av.toLowerCase(),bv=bv.toLowerCase();
    if(av<bv)return sortDir==="asc"?-1:1;
    if(av>bv)return sortDir==="asc"?1:-1;
    return 0;
  });

  /* Pagination */
  const totalPages=Math.ceil(sorted.length/pageSize);
  const paged=sorted.slice((page-1)*pageSize,page*pageSize);

  function toggleSort(k){
    if(sortKey===k)setSortDir(d=>d==="asc"?"desc":"asc");
    else{setSortKey(k);setSortDir("desc");}
  }
  function thCls(k){return sortKey===k?`sort-${sortDir}`:"";}

  /* Stats top */
  const totalHands=PRACTICED_HANDS.length;
  const okPct=Math.round(PRACTICED_HANDS.filter(h=>h.result==="ok").length/totalHands*100);
  const avgScore=Math.round(PRACTICED_HANDS.reduce((a,h)=>a+h.score,0)/totalHands*10)/10;
  const totalEV=Math.round(PRACTICED_HANDS.reduce((a,h)=>a+h.evLoss,0)*10)/10;

  return(
    <div className="ph-wrap">
      {replayHand&&<HandReplayModal hand={replayHand} onClose={()=>setReplayHand(null)}/>}

      {/* Bannière données démo */}
      {!usingRealData&&<div style={{background:"rgba(255,194,71,.07)",border:"1px solid rgba(255,194,71,.25)",borderRadius:8,padding:"8px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8,fontFamily:"'Space Grotesk',sans-serif",fontSize:10}}>
        <span style={{fontSize:14}}>🎲</span>
        <div>
          <span style={{color:"#FFC247",fontWeight:700}}>Données de démonstration</span>
          <span style={{color:"#6F81A8",marginLeft:6}}>— Joue des sessions dans le Trainer pour voir tes vraies mains ici.</span>
        </div>
      </div>}

      {/* Stats bar */}
      <div className="ph-stats-row">
        <div className="ph-stat ph-stat-gold">
          <div className="ph-stat-l">MAINS JOUEES</div>
          <div className="ph-stat-v" style={{color:T.gold}}>{totalHands}</div>
        </div>
        <div className="ph-stat ph-stat-green">
          <div className="ph-stat-l">PRECISION</div>
          <div className="ph-stat-v" style={{color:T.green}}>{okPct}%</div>
        </div>
        <div className="ph-stat ph-stat-blue">
          <div className="ph-stat-l">SCORE MOYEN</div>
          <div className="ph-stat-v" style={{color:T.blue}}>{avgScore}</div>
        </div>
        <div className="ph-stat ph-stat-red">
          <div className="ph-stat-l">EV TOTAL PERDU</div>
          <div className="ph-stat-v" style={{color:totalEV<0?T.red:T.green}}>{totalEV}bb</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ph-toolbar">
        <div className="ph-search-wrap">
          <span className="ph-search-ico">🔍</span>
          <input className="ph-search" placeholder="Rechercher position, format..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
        </div>
        {/* Filtre résultat */}
        {["Tous","ok","approx","err"].map(v=>(
          <button key={v} className={`ph-filter-btn${filterResult===v?" on":""}`} onClick={()=>{setFilterResult(v);setPage(1);}}>
            {v==="ok"?"✓ Correct":v==="approx"?"≈ Approx":v==="err"?"✗ Erreur":"Tous"}
          </button>
        ))}
        {/* Filtre format */}
        {["Tous","Cash","MTT","Spin"].map(v=>(
          <button key={v} className={`ph-filter-btn${filterFormat===v?" on":""}`} onClick={()=>{setFilterFormat(v);setPage(1);}}>
            {v}
          </button>
        ))}
        <div className="ph-count">{filtered.length} mains</div>
      </div>

      {/* Table */}
      <div className="ph-table-wrap">
        <table className="ph-table">
          <thead className="ph-thead">
            <tr>
              <th onClick={()=>toggleSort("date")} className={thCls("date")}>Date</th>
              <th>Résultat</th>
              <th onClick={()=>toggleSort("format")} className={thCls("format")}>Format</th>
              <th onClick={()=>toggleSort("potType")} className={thCls("potType")}>Pot type</th>
              <th onClick={()=>toggleSort("hero")} className={thCls("hero")}>Hero</th>
              <th>Main</th>
              <th>Board</th>
              <th onClick={()=>toggleSort("score")} className={thCls("score")}>Score %</th>
              <th onClick={()=>toggleSort("evLoss")} className={thCls("evLoss")}>EV loss</th>
              <th onClick={()=>toggleSort("evLossPot")} className={thCls("evLossPot")}>EV loss pot%</th>
              <th onClick={()=>toggleSort("freqDiff")} className={thCls("freqDiff")}>Freq. Diff%</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(h=>(
              <tr key={h.id} className={`ph-tr${selected===h.id?" selected":""}`} onClick={()=>setSelected(h.id===selected?null:h.id)}>
                {/* Date */}
                <td className="ph-td" style={{color:T.text3,fontFamily:T.mono,fontSize:9}}>{h.date}</td>
                {/* Résultat */}
                <td className="ph-td" style={{textAlign:"center"}}>
                  {h.result==="ok"&&<span className="res-ok">✓</span>}
                  {h.result==="approx"&&<span className="res-approx">≈</span>}
                  {h.result==="err"&&<span className="res-err">⚠</span>}
                </td>
                {/* Format */}
                <td className="ph-td">
                  <span className={`fmt-badge ${h.format==="MTT"?"fmt-mtt":h.format==="Spin"?"fmt-mtt":"fmt-cash"}`} style={{fontSize:8}}>{h.format}</span>
                </td>
                {/* Pot type */}
                <td className="ph-td">
                  <span style={{fontSize:9.5,color:T.text2,fontFamily:T.stats,fontWeight:600}}>{h.potType}</span>
                </td>
                {/* Hero position */}
                <td className="ph-td">
                  <span style={{fontFamily:T.brand,fontSize:8.5,color:T.gold,fontWeight:700}}>{h.hero}</span>
                </td>
                {/* Main (hole cards) */}
                <td className="ph-td">
                  <div className="cards-inline">
                    {h.hand.map((c,i)=><CardChip key={i} r={c.r} s={c.s} size="sm"/>)}
                  </div>
                </td>
                {/* Board */}
                <td className="ph-td">
                  <div className="cards-inline">
                    {h.board.length===0
                      ? <span style={{color:T.text3,fontSize:8}}>—</span>
                      : h.board.map((c,i)=><CardChip key={i} r={c.r} s={c.s} size="xs"/>)
                    }
                  </div>
                </td>
                {/* Score */}
                <td className="ph-td">
                  <span className="score-cell" style={{
                    color:h.score>=80?T.green:h.score>=50?T.gold:T.red,
                    textShadow:h.score>=80?`0 0 8px ${T.greenGlow}`:h.score>=50?`0 0 8px ${T.goldGlow}`:`0 0 8px ${T.redGlow}`
                  }}>{h.score}</span>
                </td>
                {/* EV loss */}
                <td className="ph-td">
                  <span className={h.evLoss===0?"ev-zero":h.evLoss>0?"ev-pos":"ev-neg"}>
                    {h.evLoss===0?"0":h.evLoss>0?`+${h.evLoss}`:h.evLoss}
                  </span>
                </td>
                {/* EV loss pot% */}
                <td className="ph-td">
                  <span className={h.evLossPot===0?"ev-zero":h.evLossPot>0?"ev-pos":"ev-neg"}>
                    {h.evLossPot===0?"0":h.evLossPot>0?`+${h.evLossPot}`:h.evLossPot}
                  </span>
                </td>
                {/* Freq Diff */}
                <td className="ph-td">
                  <span style={{fontFamily:T.stats,color:h.freqDiff>100?T.red:h.freqDiff>50?T.amber:T.text2,fontWeight:600}}>
                    {h.freqDiff}
                  </span>
                </td>
                {/* Actions street by street */}
                <td className="ph-td">
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div className="act-col">
                      {Object.entries(h.actions).map(([street,seq])=>(
                        <div key={street} style={{display:"flex",gap:4,alignItems:"center",marginBottom:2}}>
                          <span className="act-street" style={{minWidth:36,textTransform:"capitalize"}}>{street[0].toUpperCase()+street.slice(1,4)}</span>
                          <div className="act-seq">
                            {seq.map((a,i)=><ActionBadge key={i} a={a}/>)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="hrm-replay-btn" onClick={e=>{e.stopPropagation();setReplayHand(h);}}>▶ Rejouer</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="ph-pager">
          <div className="ph-pager-info">
            {(page-1)*pageSize+1}–{Math.min(page*pageSize,sorted.length)} sur {sorted.length} mains
          </div>
          <div className="ph-pager-btns">
            <button className="ph-pbtn" onClick={()=>setPage(1)} disabled={page===1}>«</button>
            <button className="ph-pbtn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>‹</button>
            {Array.from({length:Math.min(5,totalPages)},(_,i)=>{
              const p=Math.max(1,Math.min(page-2,totalPages-4))+i;
              return(
                <button key={p} className={`ph-pbtn${page===p?" on":""}`} onClick={()=>setPage(p)}
                  style={{fontFamily:T.brand,fontSize:9}}>{p}</button>
              );
            })}
            <button className="ph-pbtn" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>›</button>
            <button className="ph-pbtn" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>»</button>
            <select className="ph-page-size" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>
              {[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
