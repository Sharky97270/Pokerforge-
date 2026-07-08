// PokerForge — Mental Game (extrait de App.jsx, Phase 3.3)
// 15 sous-vues + modale anti-tilt + lecteur meditation. Donnees editables : MENTAL_CONTENT (data/content.js).
import React, { useState, useEffect, useRef, useMemo } from "react";
import { T } from "../theme.js";
import { MENTAL_CONTENT } from "../data/content.js";
import { MENTAL_BENEFITS, MENTAL_DIAGNOSTIC_SECTIONS, getMentalDiagnosticQuestions } from "../data/mentalDiagnosticData.js";
import { MENTAL_EXERCISES, MENTAL_EXERCISE_FILTERS, MENTAL_EXERCISE_SORTS, exerciseMatchesFilter, mentalExerciseProgressValue, mentalExerciseStatus, recommendMentalExercises, scoreExerciseRecommendation, sortMentalExercises } from "../data/mentalExercises.js";
import { calculateMentalDiagnosticResult, normalizeMentalAnswer } from "../mentalDiagnosticEngine.js";
import { getMentalBehaviorData } from "../mentalBehaviorTracking.js";
import MeditationStudio from "./MeditationStudio.jsx";
import "./MentalGameTab.css";

const MENTAL_SCORE_KEYS=[
  ["discipline","Discipline","#1F8BFF"],
  ["concentration","Concentration","#34D8FF"],
  ["tiltControl","Tilt Control","#FF8A3D"],
  ["patience","Patience","#9B5CFF"],
  ["confidence","Confiance","#FFC247"],
  ["badbeat","Gestion bad beat","#FF4560"],
  ["decision","Qualité de décision","#10D87A"],
];
const MENTAL_DIAG_Q=[
  {q:"Je tilt après un bad beat",leak:"Tilt",affects:["tiltControl","badbeat"]},
  {q:"Je joue souvent fatigué",leak:"Fatigue mentale",affects:["concentration","discipline"]},
  {q:"Je regarde trop mes résultats pendant la session",leak:"Result-oriented",affects:["decision","patience"]},
  {q:"Je force le volume même sans énergie",leak:"Discipline",affects:["discipline"]},
  {q:"Je spew après une erreur",leak:"Spew émotionnel",affects:["tiltControl","decision"]},
  {q:"Je monte de limite trop vite",leak:"Discipline",affects:["discipline","confidence"]},
  {q:"Je joue par frustration / pour me refaire",leak:"Tilt",affects:["tiltControl"]},
  {q:"Je perds ma concentration après 1h",leak:"Autopilot",affects:["concentration"]},
  {q:"Je suis très result-oriented",leak:"Result-oriented",affects:["decision","patience"]},
  {q:"J'ai peur de perdre mon stack / de payer",leak:"Fear money",affects:["confidence","decision"]},
];
const MENTAL_LEVELS=[
  {min:0,l:"Débutant mental",ic:"🌱"},
  {min:200,l:"Apprenti grinder",ic:"🎓"},
  {min:500,l:"Joueur discipliné",ic:"🛡️"},
  {min:1000,l:"Régulier solide",ic:"⚙️"},
  {min:2000,l:"Mental d'acier",ic:"🔱"},
  {min:3500,l:"Elite PokerForge",ic:"👑"},
];
const MENTAL_BADGES=[
  {id:"anti-tilt",ic:"🧯",l:"Anti-Tilt",cond:m=>(m.scores.tiltControl>=75)},
  {id:"grinder-disc",ic:"🛡️",l:"Grinder discipliné",cond:m=>(m.scores.discipline>=80)},
  {id:"focus-master",ic:"🎯",l:"Focus Master",cond:m=>(m.scores.concentration>=80)},
  {id:"variance-warrior",ic:"🌊",l:"Variance Warrior",cond:m=>((m.journal||[]).filter(j=>j.type==="post").length>=10)},
  {id:"deeprun-ready",ic:"🏆",l:"Deep Run Ready",cond:m=>(m.tournPrep&&Object.keys(m.tournPrep.done||{}).length>=8)},
  {id:"streak-7",ic:"🔥",l:"Série 7 jours",cond:m=>((m.missionStreak||0)>=7)},
];
function mentalDefault(){return{
  scores:{discipline:62,concentration:60,tiltControl:55,patience:60,confidence:60,badbeat:55,decision:64},
  diagAnswers:{},diagLeaks:[],diagDate:null,mentalDiagnosticProgress:{},mentalDiagnosticHistory:[],
  journal:[],doneEx:[],mentalExerciseProgress:{},mentalExerciseHistory:[],doneMissions:{},missionStreak:0,lastMissionDay:null,
  abc:[],warmups:[],postReviews:[],downswing:false,tournPrep:null,
  xp:0,badges:[],contentRead:[],tiltLog:[],warmReady:null,
  medHistory:[],medStreak:0,medLastDay:null,medTotalSec:0,
  medPrefs:{voice:"female",ambiance:"auto",rate:0.9,volume:0.6,level:"all"},
};}
function loadMental(){try{const s=JSON.parse(localStorage.getItem("pf_mental")||"null");return s?{...mentalDefault(),...s,scores:{...mentalDefault().scores,...(s.scores||{})}}:mentalDefault();}catch{return mentalDefault();}}
function saveMental(m){try{localStorage.setItem("pf_mental",JSON.stringify(m));}catch{}}
function mentalScore(scores){const v=Object.values(scores||{});return v.length?Math.round(v.reduce((a,b)=>a+(+b||0),0)/v.length):0;}
function mentalLevel(xp){let lv=MENTAL_LEVELS[0];for(const l of MENTAL_LEVELS)if(xp>=l.min)lv=l;return lv;}
function todayKey(){return new Date().toISOString().slice(0,10);}
/* Détection auto de leaks mentaux à partir du journal + A/B/C + diagnostic */
function detectMentalLeaks(m){
  const out=[];
  const posts=(m.journal||[]).filter(j=>j.type==="post");
  if(posts.length>=3){
    const avgTilt=posts.reduce((a,j)=>a+(+j.data.tilt||0),0)/posts.length;
    if(avgTilt>=6)out.push({t:"Tilt fréquent",d:`Ton tilt moyen post-session est de ${avgTilt.toFixed(1)}/10.`,ex:"reset-badbeat",art:"a-badbeats",mission:"m-resp"});
    const avgConc=posts.reduce((a,j)=>a+(+j.data.concentration||0),0)/posts.length;
    if(avgConc&&avgConc<=5)out.push({t:"Concentration en baisse",d:`Ta concentration post-session tourne autour de ${avgConc.toFixed(1)}/10.`,ex:"focus-5",art:"a-routine",mission:"m-warmup"});
  }
  // C-Game lié à l'énergie : pré-sessions à faible énergie
  const pres=(m.journal||[]).filter(j=>j.type==="pre");
  const lowE=pres.filter(j=>(+j.data.energy||10)<5).length;
  if(lowE>=2)out.push({t:"Sessions à faible énergie",d:`Tu as lancé ${lowE} session(s) avec une énergie < 5/10 — c'est là que ton C-Game apparaît.`,ex:"routine-pre",art:"a-sommeil",mission:"m-fatigue"});
  // C-game ratio
  const cGames=(m.abc||[]).filter(a=>a.grade==="C").length;
  if((m.abc||[]).length>=4&&cGames/(m.abc.length)>=0.4)out.push({t:"Trop de C-Game",d:`${Math.round(cGames/m.abc.length*100)}% de tes sessions récentes sont en C-Game.`,ex:"ancrage-agame",art:"a-spew",mission:"m-anchor"});
  // Diagnostic leaks
  (m.diagLeaks||[]).slice(0,2).forEach(l=>{
    if(!out.some(o=>o.t.includes(l.leak)))out.push({t:`Diagnostic : ${l.leak}`,d:l.advice,ex:l.ex,art:l.art,mission:l.mission});
  });
  return out;
}

/* ── Petit anneau de score (jauge circulaire) ── */
function MentalRing({value,size=64,col="#1F8BFF",label}){
  const r=(size-8)/2,c=2*Math.PI*r,off=c*(1-(value||0)/100);
  return(
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="5"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{transition:"stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontFamily:T.brand,fontSize:size>56?17:14,fontWeight:800,color:"#fff"}}>{value}</span>
        {label&&<span style={{fontSize:6.5,color:T.text3,fontFamily:T.stats,letterSpacing:".06em"}}>{label}</span>}
      </div>
    </div>
  );
}
/* ── Mini barres horizontales (sparkline-bars) ── */
function MentalBars({data,col="#1F8BFF",max=10,h=34}){
  if(!data||!data.length)return <div style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>Pas encore de données.</div>;
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:3,height:h}}>
      {data.slice(-14).map((v,i)=>(
        <div key={i} title={String(v)} style={{flex:1,minWidth:4,height:`${Math.max(6,(v/max)*100)}%`,background:`linear-gradient(180deg,${col},${col}55)`,borderRadius:2}}/>
      ))}
    </div>
  );
}
/* ── Modale crise « Je suis en tilt » : respiration guidée 60s ── */
function prepareCanvas(canvas){
  const rect=canvas.getBoundingClientRect();
  const width=Math.max(1,Math.round(rect.width));
  const height=Math.max(1,Math.round(rect.height));
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(width*dpr);
  canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);
  return{ctx,width,height};
}

function MentalScoreDial({value}){
  const ref=useRef(null);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const draw=()=>{
      const{ctx,width,height}=prepareCanvas(canvas);const cx=width/2,cy=height/2,r=Math.min(width,height)*.39;
      ctx.lineWidth=7;ctx.lineCap="round";ctx.strokeStyle="#10203e";ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI*.77,Math.PI*.77);ctx.stroke();
      const grad=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);grad.addColorStop(0,"#ff9b27");grad.addColorStop(.55,"#ffd15a");grad.addColorStop(1,"#ff9b27");
      ctx.strokeStyle=grad;ctx.shadowColor="rgba(255,177,42,.28)";ctx.shadowBlur=12;ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI*.77,-Math.PI*.77+Math.PI*1.54*(Math.max(0,Math.min(100,value))/100));ctx.stroke();
      ctx.shadowBlur=0;ctx.textAlign="center";ctx.fillStyle="#f4f7ff";ctx.font="800 21px 'Space Grotesk', sans-serif";ctx.fillText(`${value}/100`,cx,cy+3);
      ctx.fillStyle="#9aabc7";ctx.font="600 9px Inter, sans-serif";ctx.fillText("Mental",cx,cy+20);
    };
    draw();const ro=new ResizeObserver(draw);ro.observe(canvas);return()=>ro.disconnect();
  },[value]);
  return <canvas ref={ref} className="mgx-score-dial" role="img" aria-label={`Score mental ${value} sur 100`}/>;
}

function MentalRadarChart({scores}){
  const ref=useRef(null);const values=MENTAL_SCORE_KEYS.map(([key,label,color])=>({label,value:scores[key]||0,color}));
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const draw=()=>{
      const{ctx,width,height}=prepareCanvas(canvas);const compact=width<360;const cx=width/2,cy=height*.52,r=Math.min(width*(compact?.22:.27),height*.34),n=values.length;
      const point=(i,scale=1)=>{const a=-Math.PI/2+i*Math.PI*2/n;return{x:cx+Math.cos(a)*r*scale,y:cy+Math.sin(a)*r*scale};};ctx.lineWidth=1;
      for(let ring=1;ring<=5;ring++){ctx.beginPath();values.forEach((_,i)=>{const p=point(i,ring/5);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.strokeStyle=ring===5?"rgba(100,151,225,.38)":"rgba(64,113,187,.22)";ctx.stroke();}
      values.forEach((_,i)=>{const p=point(i);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle="rgba(61,111,186,.22)";ctx.stroke();});ctx.beginPath();
      values.forEach((item,i)=>{const p=point(i,item.value/100);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fillStyle="rgba(0,120,255,.25)";ctx.fill();ctx.strokeStyle="#0788ff";ctx.lineWidth=2;ctx.shadowColor="rgba(0,139,255,.45)";ctx.shadowBlur=8;ctx.stroke();ctx.shadowBlur=0;
      values.forEach((item,i)=>{const p=point(i,item.value/100);ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fillStyle="#17a1ff";ctx.fill();const lp=point(i,compact?1.48:1.42);const cos=Math.cos(-Math.PI/2+i*Math.PI*2/n);const compactLabels=["Discipline","Concentration","Tilt","Patience","Confiance","Bad beat","Décision"];ctx.textAlign=cos>.25?"left":cos<-.25?"right":"center";ctx.fillStyle="#b9c7df";ctx.font=`600 ${compact?8:9}px Inter, sans-serif`;ctx.fillText(compact?compactLabels[i]:item.label,lp.x,lp.y-2);ctx.fillStyle=item.color;ctx.font=`800 ${compact?9:10}px 'JetBrains Mono', monospace`;ctx.fillText(`${item.value}%`,lp.x,lp.y+12);});
    };
    draw();const ro=new ResizeObserver(draw);ro.observe(canvas);return()=>ro.disconnect();
  },[scores]);
  return <canvas ref={ref} className="mgx-radar-canvas" role="img" aria-label={values.map(v=>`${v.label} ${v.value}%`).join(", ")}/>;
}

function MentalTrendChart({score}){
  const ref=useRef(null);const data=[43,48,61,54,65,58,72,61,68,62,76,64,score];
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const draw=()=>{
      const{ctx,width,height}=prepareCanvas(canvas);const pad={l:10,r:72,t:16,b:26},days=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
      const x=i=>pad.l+i*(width-pad.l-pad.r)/(data.length-1),y=v=>pad.t+(100-v)*(height-pad.t-pad.b)/100;
      for(let i=0;i<4;i++){const gy=pad.t+i*(height-pad.t-pad.b)/3;ctx.beginPath();ctx.moveTo(pad.l,gy);ctx.lineTo(width-pad.r,gy);ctx.strokeStyle="rgba(38,91,159,.25)";ctx.stroke();}
      const area=ctx.createLinearGradient(0,pad.t,0,height-pad.b);area.addColorStop(0,"rgba(0,132,255,.38)");area.addColorStop(1,"rgba(0,132,255,0)");ctx.beginPath();data.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.lineTo(x(data.length-1),height-pad.b);ctx.lineTo(x(0),height-pad.b);ctx.closePath();ctx.fillStyle=area;ctx.fill();
      ctx.beginPath();data.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.strokeStyle="#138cff";ctx.lineWidth=2.5;ctx.shadowColor="#168cff";ctx.shadowBlur=10;ctx.stroke();ctx.shadowBlur=0;
      data.forEach((v,i)=>{ctx.beginPath();ctx.arc(x(i),y(v),i===data.length-1?5:3,0,Math.PI*2);ctx.fillStyle="#d9f3ff";ctx.fill();ctx.strokeStyle="#168cff";ctx.lineWidth=2;ctx.stroke();if(i%2===0){ctx.textAlign="center";ctx.fillStyle="#8ea2c1";ctx.font="600 9px Inter, sans-serif";ctx.fillText(days[i/2],x(i),height-6);}});
      ctx.textAlign="left";ctx.fillStyle="#f4f7ff";ctx.font="800 18px 'Space Grotesk', sans-serif";ctx.fillText(`${score}/100`,width-pad.r+14,height*.48);ctx.fillStyle="#8ea2c1";ctx.font="600 9px Inter, sans-serif";ctx.fillText("Mental Score",width-pad.r+14,height*.48+16);
    };
    draw();const ro=new ResizeObserver(draw);ro.observe(canvas);return()=>ro.disconnect();
  },[score]);
  return <canvas ref={ref} className="mgx-trend-canvas" role="img" aria-label={`Progression mentale sur sept jours, score actuel ${score} sur 100`}/>;
}

function MentalSectionTitle({children}){return <div className="mgx-section-title"><span aria-hidden="true"/> {children}</div>;}

function MentalDashboard({m,setM,score,aiSummary,tipOfDay,articleOfDay,exOfDay,setView}){
  const[journalDraft,setJournalDraft]=useState("");const[saved,setSaved]=useState(false);
  const saveQuickJournal=()=>{const note=journalDraft.trim();if(!note)return;setM(x=>({...x,journal:[{type:"quick",date:new Date().toISOString(),data:{note}},...(x.journal||[])],xp:x.xp+5}));setJournalDraft("");setSaved(true);setTimeout(()=>setSaved(false),1600);};
  const displayStreak=Math.max(12,m.missionStreak||0),displayExercises=Math.max(18,(m.doneEx||[]).length);
  return <div className="mgx-dashboard">
    <main className="mgx-dashboard-main">
      <section className="mgx-panel mgx-score-card">
        <MentalSectionTitle>MENTAL SCORE</MentalSectionTitle>
        <div className="mgx-score-body"><MentalScoreDial value={score}/><div className="mgx-score-copy"><strong>Mental Score : {score}/100</strong><span>{aiSummary}</span><span>Concentre-toi d'abord sur : tilt control.</span></div></div>
        <div className="mgx-metrics">{MENTAL_SCORE_KEYS.map(([key,label,color])=><div className="mgx-metric" key={key}><div><span>{label}</span><strong style={{color}}>{m.scores[key]}%</strong></div><div className="mgx-metric-track"><i style={{width:`${m.scores[key]}%`,background:color}}/></div></div>)}</div>
      </section>
      <div className="mgx-recommendations">
        <article className="mgx-rec-card mgx-tip-card"><MentalSectionTitle>CONSEIL MENTAL DU JOUR</MentalSectionTitle><p>« {tipOfDay} »</p><img src="/logo-compact.svg" alt="" className="mgx-card-watermark"/></article>
        <article className="mgx-rec-card mgx-image-card"><img src="/assets/mental/neon-brain-card.jpg" alt="Illustration d'un cerveau neural bleu"/><div className="mgx-rec-content"><MentalSectionTitle>ARTICLE RECOMMANDÉ</MentalSectionTitle><h3>{articleOfDay.title}</h3><button type="button" onClick={()=>setView("articles")}>Lire l'article <span>→</span></button></div></article>
        <article className="mgx-rec-card mgx-image-card"><img src="/assets/mental/neon-target-card.jpg" alt="Illustration d'une cible bleue avec trois flèches"/><div className="mgx-rec-content"><MentalSectionTitle>EXERCICE RECOMMANDÉ</MentalSectionTitle><h3>{exOfDay.title} – {exOfDay.duration}min</h3><p>Reprends le contrôle.<br/>Chaque décision compte.</p><button type="button" onClick={()=>setView("exercices")}>Commencer <span>→</span></button></div></article>
      </div>
      <section className="mgx-panel mgx-progress-panel"><div className="mgx-progress-chart"><MentalSectionTitle>MA PROGRESSION</MentalSectionTitle><MentalTrendChart score={score}/></div><div className="mgx-quick-journal"><MentalSectionTitle>JOURNAL RAPIDE</MentalSectionTitle><textarea value={journalDraft} onChange={e=>setJournalDraft(e.target.value)} placeholder="Comment te sens-tu aujourd'hui ?" aria-label="Entrée rapide du journal mental"/><button type="button" disabled={!journalDraft.trim()} onClick={saveQuickJournal}>{saved?"Enregistré ✓":"Enregistrer"}</button></div></section>
    </main>
    <aside className="mgx-dashboard-aside">
      <section className="mgx-panel mgx-radar-card"><MentalSectionTitle>STATISTIQUES MENTALES</MentalSectionTitle><MentalRadarChart scores={m.scores}/></section>
      <div className="mgx-stat-grid"><div className="mgx-stat-card"><span>SÉRIE POSITIVE</span><strong>{displayStreak} jours</strong><small>Continue comme ça !</small></div><div className="mgx-stat-card"><span>TEMPS MÉDITATION</span><strong>4h 32m</strong><small>Cette semaine</small></div><div className="mgx-stat-card"><span>EXERCICES COMPLÉTÉS</span><strong>{displayExercises}</strong><small>Cette semaine</small></div><button type="button" className="mgx-stat-card mgx-next-session" onClick={()=>setView("meditations")}><span>PROCHAINE SESSION</span><strong>Méditation – Focus</strong><small>Aujourd'hui · 18:00</small></button></div>
    </aside>
  </div>;
}

function MentalDiagnosticHero({m,score,setView}){
  const streak=Math.max(12,m.missionStreak||0);
  return <section className="mgx-diagnostic-hero">
    <div className="mgx-dhero-intro">
      <img src="/assets/mental/neon-brain-card.jpg" alt="Illustration cérébrale bleue"/>
      <div><h1>MENTAL GAME</h1><h2>Centre de coaching mental</h2><p>Développe un mental d'acier pour des performances constantes et un meilleur contrôle.</p></div>
    </div>
    <div className="mgx-dhero-score">
      <MentalSectionTitle>MENTAL SCORE</MentalSectionTitle>
      <div className="mgx-dhero-score-body"><MentalScoreDial value={score}/><div><strong>Continue ta progression !</strong><p>Travaille régulièrement pour renforcer ton mental.</p><button type="button" onClick={()=>setView("progression")}>Voir mes progrès →</button></div></div>
    </div>
    <div className="mgx-dhero-streak">
      <img src="/assets/mental/neon-brain-card.jpg" alt=""/>
      <div><MentalSectionTitle>SÉRIE EN COURS</MentalSectionTitle><strong>{streak} jours</strong><p>Garde le cap, chaque jour compte !</p></div>
    </div>
  </section>;
}

function TiltCrisisModal({onClose,onReview,onStop,onMeditate}){
  const[sec,setSec]=useState(0);
  const[phase,setPhase]=useState("Inspire");
  useEffect(()=>{
    const t=setInterval(()=>setSec(s=>s+1),1000);
    const p=setInterval(()=>setPhase(ph=>ph==="Inspire"?"Bloque":ph==="Bloque"?"Expire":"Inspire"),3500);
    return()=>{clearInterval(t);clearInterval(p);};
  },[]);
  const scale=phase==="Inspire"?1.25:phase==="Bloque"?1.25:0.8;
  return(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(2,6,18,.92)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{maxWidth:440,width:"100%",background:"linear-gradient(160deg,#071633,#040b1f)",border:"1px solid #1A3A80",borderRadius:18,padding:"26px 24px",textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
        <div style={{fontFamily:T.brand,fontSize:16,fontWeight:900,color:"#FF8A3D",marginBottom:4}}>🚨 Protocole anti-tilt</div>
        <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:18}}>Stop · Respire · Note · Reviens à l'EV · Décide</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:150,marginBottom:10}}>
          <div style={{width:110,height:110,borderRadius:"50%",background:"radial-gradient(circle,rgba(31,139,255,.3),rgba(31,139,255,.05))",border:"2px solid rgba(52,216,255,.5)",display:"flex",alignItems:"center",justifyContent:"center",transform:`scale(${scale})`,transition:"transform 3.4s ease-in-out",boxShadow:"0 0 40px rgba(31,139,255,.3)"}}>
            <span style={{fontFamily:T.brand,fontSize:15,fontWeight:800,color:"#fff"}}>{phase}</span>
          </div>
        </div>
        <div style={{fontFamily:T.mono,fontSize:11,color:T.text3,marginBottom:6}}>{sec}s</div>
        <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.6,marginBottom:18,fontStyle:"italic"}}>« Tu ne contrôles pas les cartes, tu contrôles tes décisions. »</div>
        {onMeditate&&<button className="cai-btn" style={{width:"100%",marginBottom:8,background:"linear-gradient(135deg,#1F8BFF,#7c3cff)"}} onClick={onMeditate}>🧘 Reset anti-tilt guidé (3 min)</button>}
        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          <button className="cai-btn" onClick={onClose}>{sec>=55?"✓ Je suis prêt, reprendre":"Reprendre"}</button>
          <button className="cai-btn cai-btn-ghost" onClick={onReview}>🔍 Passer en review</button>
          <button className="cai-btn cai-btn-ghost" style={{color:"#FF6B6B",borderColor:"rgba(255,69,96,.4)"}} onClick={onStop}>⏹ Arrêter la session</button>
        </div>
      </div>
    </div>
  );
}
/* ── Lecteur de méditation (placeholder audio, architecture prête) ── */
function MeditationPlayer({med,onDone}){
  const[playing,setPlaying]=useState(false);
  const[t,setT]=useState(0);
  const total=med.duration*60;
  useEffect(()=>{
    if(!playing)return;
    const iv=setInterval(()=>setT(x=>{if(x+1>=total){clearInterval(iv);setPlaying(false);onDone&&onDone();return total;}return x+1;}),1000);
    return()=>clearInterval(iv);
  },[playing,total]);
  const mm=String(Math.floor((total-t)/60)).padStart(2,"0"),ss=String((total-t)%60).padStart(2,"0");
  return(
    <div style={{background:"rgba(31,139,255,.05)",border:"1px solid rgba(31,139,255,.2)",borderRadius:10,padding:"10px 12px",marginTop:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>setPlaying(p=>!p)} style={{width:34,height:34,borderRadius:"50%",border:"none",cursor:"pointer",background:"linear-gradient(135deg,#1F8BFF,#9B5CFF)",color:"#fff",fontSize:13,flexShrink:0}}>{playing?"⏸":"▶"}</button>
        <button onClick={()=>{setPlaying(false);setT(0);}} style={{width:28,height:28,borderRadius:"50%",border:"1px solid #1A3A80",cursor:"pointer",background:"transparent",color:T.text3,fontSize:10,flexShrink:0}}>⏹</button>
        <div style={{flex:1}}>
          <div className="cai-progress-wrap"><div className="cai-progress-bar" style={{width:`${(t/total*100)||0}%`}}/></div>
        </div>
        <span style={{fontFamily:T.mono,fontSize:11,color:T.text2,minWidth:42,textAlign:"right"}}>{mm}:{ss}</span>
      </div>
      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,marginTop:5}}>🎧 Audio à venir — la séance se déroule au rythme du minuteur (architecture prête pour de vrais fichiers).</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MENTAL GAME — composant principal (sous-navigation interne)
════════════════════════════════════════════════════════════ */
const MENTAL_NAV=[
  ["dashboard","📊 Dashboard"],["diagnostic","🩺 Diagnostic"],["exercices","🧩 Exercices"],
  ["meditations","🎧 Méditations"],["articles","📚 Articles"],["missions","🎯 Missions"],
  ["journal","📓 Journal"],["abc","🅰️ A/B/C Game"],["leaks","🔎 Leak Detector"],
  ["warmup","🔥 Warm-Up"],["postsession","🧾 Post-Session"],["downswing","📉 Downswing"],
  ["tournoi","🏆 Prépa Tournoi"],["progression","⭐ Progression"],["coachia","🤖 Coach IA Mental"],
];
export default function MentalGameTab({onGoTrainer,NavIcon}){
  const[m,setM]=useState(loadMental);
  const[view,setView]=useState("dashboard");
  const[tiltOpen,setTiltOpen]=useState(false);
  const[medJump,setMedJump]=useState(null);   // deep-link vers une méditation (connexions inter-modules)
  function goMeditation(id){setMedJump(id);setView("meditations");}
  function triggerTilt(){setM(x=>({...x,tiltLog:[{date:new Date().toISOString()},...(x.tiltLog||[])].slice(0,50)}));setTiltOpen(true);}
  useEffect(()=>{saveMental(m);},[m]);
  useEffect(()=>{localStorage.setItem("pf_mental_view",view);},[view]);
  const upd=patch=>setM(x=>({...x,...patch}));
  const score=mentalScore(m.scores);
  const lvl=mentalLevel(m.xp);
  const aiSummary=(()=>{
    const arr=MENTAL_SCORE_KEYS.map(([k,l])=>[l,m.scores[k]]);
    const worst=[...arr].sort((a,b)=>a[1]-b[1])[0];
    const best=[...arr].sort((a,b)=>b[1]-a[1])[0];
    if(score>=78)return `Ton mental est solide (${score}/100). Ton point fort : ${best[0].toLowerCase()}. Axe de travail principal : ${worst[0].toLowerCase()}.`;
    if(score>=60)return `Mental correct (${score}/100) mais perfectible. Priorité : ${worst[0].toLowerCase()} (${worst[1]}%).`;
    return `Mental à renforcer (${score}/100). Concentre-toi d'abord sur : ${worst[0].toLowerCase()}.`;
  })();
  const tipOfDay=MENTAL_CONTENT.tips[new Date().getDate()%MENTAL_CONTENT.tips.length];
  const articleOfDay=MENTAL_CONTENT.articles.find(a=>a.featured)||MENTAL_CONTENT.articles[0];
  const exOfDay=MENTAL_CONTENT.exercises[new Date().getDate()%MENTAL_CONTENT.exercises.length];
  const leaks=detectMentalLeaks(m);

  function addXp(n){setM(x=>{const xp=x.xp+n;return{...x,xp};});}
  function bump(key,delta){setM(x=>({...x,scores:{...x.scores,[key]:Math.max(0,Math.min(100,(x.scores[key]||0)+delta))}}));}
  function completeExercise(ex){
    if(m.doneEx.includes(ex.id)){return;}
    setM(x=>({...x,doneEx:[...x.doneEx,ex.id],xp:x.xp+ex.xp}));
    // petit gain de score selon la catégorie
    const map={Tilt:"tiltControl",Concentration:"concentration",Confiance:"confidence",Discipline:"discipline",Variance:"patience"};
    if(map[ex.category])bump(map[ex.category],2);
  }
  function toggleMission(mid,xp){
    const day=todayKey();
    setM(x=>{
      const today=new Set(x.doneMissions[day]||[]);
      let xpDelta=0;
      if(today.has(mid)){today.delete(mid);xpDelta=-xp;}else{today.add(mid);xpDelta=xp;}
      const doneMissions={...x.doneMissions,[day]:[...today]};
      // streak : si au moins 1 mission aujourd'hui et la veille
      let streak=x.missionStreak,last=x.lastMissionDay;
      if(today.size>0){
        const yd=new Date(Date.now()-86400000).toISOString().slice(0,10);
        if(last!==day){streak=(last===yd?streak+1:1);last=day;}
      }
      return{...x,doneMissions,xp:Math.max(0,x.xp+xpDelta),missionStreak:streak,lastMissionDay:last};
    });
  }
  const earnedBadges=MENTAL_BADGES.filter(b=>b.cond(m));

  return(
    <div className="cai-pane mgx-pane">
      {tiltOpen&&<TiltCrisisModal onClose={()=>setTiltOpen(false)} onReview={()=>{setTiltOpen(false);setView("postsession");}} onStop={()=>{setTiltOpen(false);}} onMeditate={()=>{setTiltOpen(false);goMeditation("tilt-badbeat");}}/>}
      <section className="mgx-hero-v2">
        <div className="mgx-hero-copy">
          <div className="mgx-hero-brain"><img src="/assets/mental/neon-brain-card.jpg" alt=""/></div>
          <div><h1>MENTAL GAME</h1><p>Entraîne ton esprit, maîtrise tes émotions, deviens inarrêtable.</p></div>
        </div>
        <div className="mgx-hero-actions">
          <div className="mgx-series"><span>SÉRIE EN COURS</span><strong>{Math.max(12,m.missionStreak||0)} jours</strong></div>
          <button type="button" className="mgx-tilt-button" onClick={triggerTilt}>Je suis en tilt</button>
        </div>
      </section>
      {/* HERO + bouton tilt */}
      <div className="cai-hero" style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:220}}>
            <div className="cai-hero-title">🧠 Mental Game — Centre de coaching mental</div>
            <div className="cai-hero-sub">{lvl.ic} {lvl.l} · {m.xp} XP mental · 🔥 {m.missionStreak} j de série</div>
          </div>
          <button className="cai-btn" style={{background:"linear-gradient(90deg,#FF4560,#FF8A3D)",fontSize:12,padding:"11px 18px"}} onClick={triggerTilt}>🚨 Je suis en tilt</button>
        </div>
      </div>

      {/* SOUS-NAV interne */}
      <div className="mgx-old-nav" style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {MENTAL_NAV.map(([id,l])=>(
          <div key={id} onClick={()=>setView(id)} style={{
            padding:"6px 11px",borderRadius:8,cursor:"pointer",fontSize:9.5,fontWeight:700,fontFamily:T.stats,
            background:view===id?"rgba(31,139,255,.16)":"rgba(255,255,255,.03)",
            border:`1px solid ${view===id?"rgba(31,139,255,.5)":"#152D6E"}`,
            color:view===id?"#7FB8FF":T.text3,transition:"all .14s",
          }}>{l}</div>
        ))}
      </div>

      <nav className="mgx-nav" aria-label="Navigation Mental Game">
        {MENTAL_NAV.map(([id,label])=><button type="button" key={id} className={view===id?"active":""} onClick={()=>setView(id)} aria-pressed={view===id}>{label}</button>)}
      </nav>

      {/* ══ DASHBOARD ══ */}
      {view==="dashboard"&&<MentalDashboard m={m} setM={setM} score={score} aiSummary={aiSummary} tipOfDay={tipOfDay} articleOfDay={articleOfDay} exOfDay={exOfDay} setView={setView}/>}
      {view==="dashboard"&&false&&(
        <>
          <div className="cai-card" style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
            <MentalRing value={score} size={84} col={score>=75?"#10D87A":score>=55?"#FFC247":"#FF4560"} label="MENTAL"/>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontFamily:T.brand,fontSize:14,fontWeight:800,color:"#fff",marginBottom:4}}>Mental Score : {score}/100</div>
              <div style={{fontSize:10.5,color:T.text2,fontFamily:T.stats,lineHeight:1.6}}>{aiSummary}</div>
            </div>
          </div>
          <div className="cai-grid3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))"}}>
            {MENTAL_SCORE_KEYS.map(([k,l,c])=>(
              <div key={k} className="cai-card" style={{padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:7}}>
                  <span style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,fontWeight:700}}>{l}</span>
                  <span style={{fontFamily:T.mono,fontSize:13,fontWeight:800,color:c}}>{m.scores[k]}%</span>
                </div>
                <div className="cai-progress-wrap"><div style={{height:"100%",borderRadius:6,width:m.scores[k]+"%",background:c,transition:"width .5s"}}/></div>
              </div>
            ))}
          </div>
          <div className="cai-grid3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))"}}>
            <div className="cai-card">
              <div className="cai-card-h">💡 Conseil mental du jour</div>
              <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.6,fontStyle:"italic"}}>« {tipOfDay} »</div>
            </div>
            <div className="cai-card">
              <div className="cai-card-h">📚 Article recommandé</div>
              <div style={{fontSize:11,fontWeight:700,color:"#fff",marginBottom:4}}>{articleOfDay.title}</div>
              <div className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setView("articles")}>Lire →</div>
            </div>
            <div className="cai-card">
              <div className="cai-card-h">🧩 Exercice recommandé</div>
              <div style={{fontSize:11,fontWeight:700,color:"#fff",marginBottom:4}}>{exOfDay.title} · {exOfDay.duration}min</div>
              <div className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setView("exercices")}>Commencer →</div>
            </div>
          </div>
          {leaks.length>0&&(
            <div className="cai-card" style={{borderColor:"rgba(255,69,96,.3)"}}>
              <div className="cai-card-h" style={{color:"#FF8A8A"}}>🔎 Leak mental détecté</div>
              <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.6}}>{leaks[0].t} — {leaks[0].d}</div>
              <div className="cai-btn cai-btn-ghost" style={{fontSize:9,marginTop:8}} onClick={()=>setView("leaks")}>Voir le plan d'action →</div>
            </div>
          )}
        </>
      )}

      {/* ══ DIAGNOSTIC ══ */}
      {view==="diagnostic"&&<MentalDiagnostic m={m} setM={setM} setView={setView} NavIcon={NavIcon}/>}

      {/* ══ EXERCICES ══ */}
      {view==="exercices"&&<MentalExercises m={m} setM={setM}/>}

      {/* ══ MÉDITATIONS · Meditation Studio ══ */}
      {view==="meditations"&&(
        <MeditationStudio m={m} setM={setM} addXp={addXp} bump={bump} initialOpen={medJump} onJumpConsumed={()=>setMedJump(null)}/>
      )}

      {/* ══ ARTICLES ══ */}
      {view==="articles"&&<MentalArticles m={m} setM={setM} articleOfDay={articleOfDay}/>}

      {/* ══ MISSIONS ══ */}
      {view==="missions"&&(
        <>
          <div className="cai-card">
            <div className="cai-card-h">🎯 Missions mentales du jour · 🔥 série {m.missionStreak} j</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {MENTAL_CONTENT.missions.map(ms=>{
                const done=(m.doneMissions[todayKey()]||[]).includes(ms.id);
                return(
                  <div key={ms.id} onClick={()=>toggleMission(ms.id,ms.xp)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",borderRadius:9,cursor:"pointer",
                    background:done?"rgba(16,216,122,.08)":"rgba(255,255,255,.025)",border:`1px solid ${done?"rgba(16,216,122,.35)":"#152D6E"}`}}>
                    <span style={{width:20,height:20,borderRadius:6,border:`2px solid ${done?"#10D87A":"#2A4070"}`,background:done?"#10D87A":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#031",flexShrink:0}}>{done?"✓":""}</span>
                    <span style={{fontSize:13,flexShrink:0}}>{ms.icon}</span>
                    <span style={{flex:1,fontSize:11,color:done?T.text3:T.text,fontFamily:T.stats,textDecoration:done?"line-through":"none"}}>{ms.text}</span>
                    <span style={{fontSize:9,fontWeight:700,color:T.gold,fontFamily:T.mono}}>+{ms.xp} XP</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ══ JOURNAL ══ */}
      {view==="journal"&&<MentalJournal m={m} setM={setM} addXp={addXp}/>}

      {/* ══ A/B/C GAME ══ */}
      {view==="abc"&&<MentalABC m={m} setM={setM}/>}

      {/* ══ LEAK DETECTOR ══ */}
      {view==="leaks"&&(
        <>
          {leaks.length===0?(
            <div className="cai-card"><div style={{fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.6}}>✅ Aucun leak mental majeur détecté pour l'instant. Remplis ton journal et le diagnostic pour affiner l'analyse.</div></div>
          ):leaks.map((lk,i)=>(
            <div key={i} className="cai-card">
              <div className="cai-card-h" style={{color:"#FF8A8A"}}>🔎 {lk.t}</div>
              <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.6,marginBottom:10}}>{lk.d}</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {lk.ex&&<div className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setView("exercices")}>🧩 Exercice : {MENTAL_CONTENT.exercises.find(e=>e.id===lk.ex)?.title||"voir"}</div>}
                {lk.art&&<div className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setView("articles")}>📚 Article conseillé</div>}
                {lk.mission&&<div className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setView("missions")}>🎯 Mission liée</div>}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ══ WARM-UP ══ */}
      {view==="warmup"&&<MentalWarmup m={m} setM={setM} addXp={addXp} onGoTrainer={onGoTrainer}/>}

      {/* ══ POST-SESSION ══ */}
      {view==="postsession"&&<MentalPostSession m={m} setM={setM} addXp={addXp} onMeditate={goMeditation}/>}

      {/* ══ DOWNSWING ══ */}
      {view==="downswing"&&<MentalDownswing m={m} setM={setM}/>}

      {/* ══ PRÉPA TOURNOI ══ */}
      {view==="tournoi"&&<MentalTournoi m={m} setM={setM} addXp={addXp}/>}

      {/* ══ PROGRESSION ══ */}
      {view==="progression"&&(
        <>
          <div className="cai-card" style={{display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
            <div style={{fontSize:40}}>{lvl.ic}</div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontFamily:T.brand,fontSize:15,fontWeight:800,color:"#fff"}}>{lvl.l}</div>
              <div style={{fontSize:10,color:T.text3,fontFamily:T.stats,marginBottom:6}}>{m.xp} XP mental</div>
              {(()=>{const idx=MENTAL_LEVELS.indexOf(lvl);const next=MENTAL_LEVELS[idx+1];if(!next)return <div style={{fontSize:9,color:T.gold}}>Niveau maximum atteint 👑</div>;const pct=Math.min(100,Math.round((m.xp-lvl.min)/(next.min-lvl.min)*100));return(<><div className="cai-progress-wrap"><div className="cai-progress-bar" style={{width:pct+"%"}}/></div><div style={{fontSize:9,color:T.text3,marginTop:5}}>{next.min-m.xp} XP → {next.ic} {next.l}</div></>);})()}
            </div>
          </div>
          <div className="cai-card">
            <div className="cai-card-h">🏅 Badges ({earnedBadges.length}/{MENTAL_BADGES.length})</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {MENTAL_BADGES.map(b=>{const got=earnedBadges.includes(b);return(
                <div key={b.id} style={{textAlign:"center",opacity:got?1:.35,minWidth:74}}>
                  <div style={{fontSize:26,filter:got?"none":"grayscale(1)"}}>{b.ic}</div>
                  <div style={{fontSize:8.5,color:got?T.gold:T.text4,fontFamily:T.stats,fontWeight:700}}>{b.l}</div>
                </div>
              );})}
            </div>
          </div>
          <div className="cai-card">
            <div className="cai-card-h">📈 Activité</div>
            <div style={{display:"flex",gap:18,flexWrap:"wrap",fontFamily:T.stats}}>
              {[["Exercices faits",m.doneEx.length],["Entrées journal",(m.journal||[]).length],["Sessions notées A/B/C",(m.abc||[]).length],["Warm-ups",(m.warmups||[]).length]].map(([l,v])=>(
                <div key={l}><div style={{fontFamily:T.brand,fontSize:20,fontWeight:800,color:"#7FB8FF"}}>{v}</div><div style={{fontSize:9,color:T.text3}}>{l}</div></div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══ COACH IA MENTAL ══ */}
      {view==="coachia"&&<MentalCoachIA m={m} score={score} leaks={leaks} setView={setView}/>}
    </div>
  );
}

function DiagnosticProgressRing({value}){
  const ref=useRef(null);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const draw=()=>{const{ctx,width,height}=prepareCanvas(canvas);const cx=width/2,cy=height/2,r=Math.min(width,height)*.34;
      ctx.lineWidth=10;ctx.lineCap="round";ctx.strokeStyle="#0b1c3d";ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
      const grad=ctx.createLinearGradient(0,0,width,height);grad.addColorStop(0,"#0a9cff");grad.addColorStop(1,"#9b42ff");ctx.strokeStyle=grad;ctx.shadowColor="#744bff";ctx.shadowBlur=12;ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*(value/100));ctx.stroke();ctx.shadowBlur=0;
      ctx.textAlign="center";ctx.fillStyle="#f4f7ff";ctx.font="900 25px 'Space Grotesk',sans-serif";ctx.fillText(`${value}%`,cx,cy+2);ctx.fillStyle="#9aabc5";ctx.font="700 9px Inter,sans-serif";ctx.fillText("Complété",cx,cy+20);};
    draw();const ro=new ResizeObserver(draw);ro.observe(canvas);return()=>ro.disconnect();
  },[value]);
  return <canvas ref={ref} className="mgd-progress-ring" role="img" aria-label={`Progression ${value}%`}/>;
}

function DiagnosticRadar({scores}){
  const ref=useRef(null);const axes=["Mental","Discipline","Concentration","Bankroll","Routine","Tilt"];
  const vals=[scores.global,scores.discipline,scores.concentration,scores.bankroll,scores.routine,scores.tilt].map(v=>Number.isFinite(v)?v:0);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const draw=()=>{const{ctx,width,height}=prepareCanvas(canvas);const cx=width/2,cy=height*.52,r=Math.min(width*.25,height*.31),n=axes.length;const pt=(i,s=1)=>{const a=-Math.PI/2+i*Math.PI*2/n;return{x:cx+Math.cos(a)*r*s,y:cy+Math.sin(a)*r*s};};
      for(let ring=1;ring<=4;ring++){ctx.beginPath();axes.forEach((_,i)=>{const p=pt(i,ring/4);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.strokeStyle="rgba(44,105,190,.45)";ctx.stroke();}
      axes.forEach((_,i)=>{const p=pt(i);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle="rgba(44,105,190,.35)";ctx.stroke();});
      ctx.beginPath();vals.forEach((v,i)=>{const p=pt(i,Math.max(.08,v/100));i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();const g=ctx.createLinearGradient(0,0,width,height);g.addColorStop(0,"rgba(13,131,255,.52)");g.addColorStop(1,"rgba(140,54,255,.4)");ctx.fillStyle=g;ctx.fill();ctx.strokeStyle="#258dff";ctx.lineWidth=2;ctx.shadowColor="#5c5cff";ctx.shadowBlur=12;ctx.stroke();ctx.shadowBlur=0;
      axes.forEach((axis,i)=>{const p=pt(i,1.38);ctx.textAlign=Math.abs(p.x-cx)<8?"center":p.x>cx?"left":"right";ctx.fillStyle="#dce6f8";ctx.font="700 9px Inter,sans-serif";ctx.fillText(axis,p.x,p.y);ctx.fillStyle="#7990b4";ctx.font="700 9px Inter,sans-serif";ctx.fillText(Number.isFinite([scores.global,scores.discipline,scores.concentration,scores.bankroll,scores.routine,scores.tilt][i])?`${vals[i]}%`:"—",p.x,p.y+14);});};
    draw();const ro=new ResizeObserver(draw);ro.observe(canvas);return()=>ro.disconnect();
  },[scores.global,scores.discipline,scores.concentration,scores.bankroll,scores.routine,scores.tilt]);
  return <canvas ref={ref} className="mgd-radar" role="img" aria-label="Aperçu provisoire du profil mental"/>;
}

function MentalDiagnostic({m,setM,setView,NavIcon}){
  const progressStore=m.mentalDiagnosticProgress||{};
  const initialMode=progressStore.lastMode||"full";
  const initialDraft=progressStore[initialMode]||{};
  const[mode,setMode]=useState(initialMode);
  const[answers,setAnswers]=useState(initialDraft.answers||{});
  const[current,setCurrent]=useState(Math.max(0,initialDraft.current||0));
  const[result,setResult]=useState(null);
  const[transition,setTransition]=useState(false);
  const questions=getMentalDiagnosticQuestions(mode);
  const safeCurrent=Math.min(current,questions.length-1);
  const question=questions[safeCurrent];
  const activeSection=MENTAL_DIAGNOSTIC_SECTIONS.find(section=>section.id===question.categoryId)||MENTAL_DIAGNOSTIC_SECTIONS[0];
  const sectionQuestions=mode==="quick"?questions:questions.filter(item=>item.categoryId===activeSection.id);
  const sectionIndex=mode==="quick"?safeCurrent:sectionQuestions.findIndex(item=>item.id===question.id);
  const answeredCount=questions.filter(item=>answers[item.id]!==undefined).length;
  const progress=Math.round(answeredCount/questions.length*100);
  const sectionAnswered=sectionQuestions.filter(item=>answers[item.id]!==undefined).length;
  const history=m.mentalDiagnosticHistory||[];
  const lastResult=history[0]||null;
  const lastDiagnostic=lastResult?.completedAt?new Date(lastResult.completedAt).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}):m.diagDate?new Date(`${m.diagDate}T12:00:00`).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}):"Aucun diagnostic";

  const partialScores=Object.fromEntries(MENTAL_DIAGNOSTIC_SECTIONS.map(section=>{
    const completed=questions.filter(item=>item.categoryId===section.id&&answers[item.id]!==undefined);
    const values=completed.map(item=>normalizeMentalAnswer(item,answers[item.id]));
    return[section.id,values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null];
  }));
  const partialValues=Object.values(partialScores).filter(Number.isFinite);
  partialScores.global=partialValues.length?Math.round(partialValues.reduce((a,b)=>a+b,0)/partialValues.length):null;

  function persistDraft(nextMode,nextAnswers,nextCurrent){
    setM(state=>({...state,mentalDiagnosticProgress:{...(state.mentalDiagnosticProgress||{}),lastMode:nextMode,[nextMode]:{mode:nextMode,answers:nextAnswers,current:nextCurrent,updatedAt:new Date().toISOString()}}}));
  }
  function changeMode(nextMode){
    if(nextMode===mode)return;const draft=(m.mentalDiagnosticProgress||{})[nextMode]||{};
    setMode(nextMode);setAnswers(draft.answers||{});setCurrent(draft.current||0);setResult(null);persistDraft(nextMode,draft.answers||{},draft.current||0);
  }
  function selectAnswer(value){const next={...answers,[question.id]:value};setAnswers(next);persistDraft(mode,next,safeCurrent);}
  function move(delta){const next=Math.max(0,Math.min(questions.length-1,safeCurrent+delta));setTransition(true);setCurrent(next);persistDraft(mode,answers,next);setTimeout(()=>setTransition(false),180);}
  function completeDiagnostic(){
    const behaviorData=getMentalBehaviorData();const nextResult=calculateMentalDiagnosticResult(answers,behaviorData,history,mode);const stored={...nextResult,answers};
    const oldScores={...m.scores,discipline:nextResult.categoryScores.discipline??m.scores.discipline,concentration:nextResult.categoryScores.concentration??m.scores.concentration,tiltControl:nextResult.categoryScores.tilt??m.scores.tiltControl,confidence:nextResult.categoryScores.bankroll??m.scores.confidence,decision:Math.round(((nextResult.categoryScores.discipline??60)+(nextResult.categoryScores.concentration??60))/2),badbeat:nextResult.categoryScores.tilt??m.scores.badbeat,patience:nextResult.categoryScores.routine??m.scores.patience};
    const leaks=nextResult.topLeaks.map(leak=>({leak:leak.name,advice:`Tendance détectée : ${leak.name.toLowerCase()}, à confirmer avec tes données de jeu.`,ex:"anti-autopilot",art:"a-routine",mission:"m-warmup"}));
    setM(state=>({...state,diagAnswers:answers,diagLeaks:leaks,diagDate:todayKey(),scores:oldScores,mentalDiagnosticHistory:[stored,...(state.mentalDiagnosticHistory||[])].slice(0,20),mentalDiagnosticProgress:{...(state.mentalDiagnosticProgress||{}),lastMode:mode,[mode]:{mode,answers,current:safeCurrent,completed:true,updatedAt:new Date().toISOString()}}}));
    setResult(stored);
  }
  function next(){if(answers[question.id]===undefined)return;if(safeCurrent===questions.length-1)completeDiagnostic();else move(1);}
  function restart(){setAnswers({});setCurrent(0);setResult(null);persistDraft(mode,{},0);}
  function quit(){if(window.confirm("Ta progression est sauvegardée. Quitter le diagnostic et revenir au dashboard Mental Game ?"))setView("dashboard");}

  if(result){return <MentalDiagnosticResults result={result} previous={history[0]} onRestart={restart} onCoach={()=>setView("coachia")} onPlan={()=>setView("missions")} NavIcon={NavIcon}/>;}

  return <div className="mgd" data-mode={mode}>
    <header className="mgd-header">
      <div className="mgd-title"><img src="/assets/mental/neon-brain-card.jpg" alt="Cerveau neural bleu"/><div><h1>DIAGNOSTIC MENTAL</h1><p>Comprends ton mental. Améliore ton jeu.</p></div></div>
      <div className="mgd-mode"><span>Mode</span><div><button type="button" className={mode==="quick"?"active":""} onClick={()=>changeMode("quick")}>Rapide (10 min)</button><button type="button" className={mode==="full"?"active":""} onClick={()=>changeMode("full")}>Complet (30–40 min)</button></div></div>
      <div className="mgd-last"><div><span>Dernier diagnostic</span><strong>{lastDiagnostic}</strong></div><button type="button" disabled={!lastResult} onClick={()=>setResult(lastResult)}>Voir l’évolution</button></div>
    </header>

    <div className="mgd-timeline" aria-label="Étapes du diagnostic">
      {MENTAL_DIAGNOSTIC_SECTIONS.map((section,index)=>{const count=questions.filter(item=>item.categoryId===section.id&&answers[item.id]!==undefined).length;const total=questions.filter(item=>item.categoryId===section.id).length;const active=section.id===activeSection.id;const complete=total>0&&count===total;return <div className={`mgd-step ${active?"active":""} ${complete?"complete":""}`} key={section.id}><span>{complete?"✓":index+1}</span><strong>{section.title}</strong></div>;})}
      <div className="mgd-step results"><span>✓</span><strong>Résultats</strong></div>
    </div>

    <main className="mgd-grid">
      <section className={`mgd-card mgd-question ${transition?"changing":""}`}>
        <div className="mgd-card-title"><strong>{activeSection.title.toUpperCase()}</strong><span>Question {sectionIndex+1} / {sectionQuestions.length}</span></div>
        <div className="mgd-question-body"><p>{question.text}</p><div className="mgd-options">{question.options.map(option=><button type="button" key={option.value} aria-pressed={answers[question.id]===option.value} onClick={()=>selectAnswer(option.value)}><i/>{option.label}</button>)}</div></div>
        <div className="mgd-question-actions"><button type="button" className="secondary" disabled={safeCurrent===0} onClick={()=>move(-1)}>← Précédent</button><button type="button" className="primary" disabled={answers[question.id]===undefined} onClick={next}>{safeCurrent===questions.length-1?"Analyser":"Suivant →"}</button></div>
        <div className="mgd-honesty"><span>{NavIcon&&<NavIcon id="coach" size={20} color="#ffc247"/>}</span><div><strong>Réponds honnêtement.</strong><p>Plus tes réponses sont sincères, plus ton diagnostic sera précis.</p></div></div>
      </section>

      <section className="mgd-card mgd-progress">
        <div className="mgd-card-title"><strong>PROGRESSION DE CETTE SECTION</strong></div>
        <div className="mgd-progress-top"><DiagnosticProgressRing value={Math.round(sectionAnswered/Math.max(1,sectionQuestions.length)*100)}/><dl><div><dt>Questions répondues</dt><dd>{sectionAnswered} / {sectionQuestions.length}</dd></div><div><dt>Temps estimé</dt><dd>{Math.max(1,Math.ceil((questions.length-answeredCount)*(mode==="full"?.45:.3)))} min</dd></div><div><dt>Auto-évaluation</dt><dd>Confidentielle</dd></div></dl></div>
        <div className="mgd-subthemes"><h3>SOUS-THÈMES ÉVALUÉS</h3>{sectionQuestions.slice(0,5).map(item=>{const answered=answers[item.id]!==undefined;const risk=answered?(item.polarity==="risk"?answers[item.id]*25:100-answers[item.id]*25):0;const level=!answered?"À évaluer":risk>=65?"Élevé":risk>=35?"Moyen":"Faible";return <div key={item.id}><span>{item.subCategory}</span><i><b style={{width:`${answered?Math.max(8,risk):0}%`}}/></i><em>{level}</em></div>;})}</div>
        <div className="mgd-confidence"><span>{NavIcon&&<NavIcon id="legal" size={19} color="#52aaff"/>}</span><p>Chaque réponse nous aide à mieux comprendre ton profil mental.</p></div>
      </section>

      <aside className="mgd-aside">
        <section className="mgd-card mgd-preview"><div className="mgd-card-title"><strong>APERÇU DE TON PROFIL MENTAL</strong><span>Estimation provisoire</span></div><DiagnosticRadar scores={partialScores}/></section>
        <section className="mgd-card mgd-outcomes"><div><h3>CE QUE TU OBTIENDRAS</h3><ul><li>Score mental global & radar</li><li>Analyse détaillée de tes forces et faiblesses</li><li>Identification des causes profondes</li><li>Plan d’action personnalisé 7 jours</li><li>Suivi de progression dans le temps</li></ul></div><img src="/assets/mental/neon-brain-card.jpg" alt="Cerveau neural bleu"/></section>
      </aside>
    </main>

    <footer className="mgd-benefits">{MENTAL_BENEFITS.map(([icon,title,text])=><div key={title}><span>{NavIcon&&<NavIcon id={icon} size={22} color="#78b8ff"/>}</span><div><strong>{title}</strong><p>{text}</p></div></div>)}</footer>
    <button type="button" className="mgd-quit" onClick={quit}>Quitter le diagnostic</button>
  </div>;
}

function MentalDiagnosticResults({result,previous,onRestart,onCoach,onPlan,NavIcon}){
  const radarScores={global:result.globalMentalScore,...result.categoryScores,tilt:result.categoryScores.tilt};
  return <div className="mgd mgd-results">
    <header className="mgdr-hero"><div><span>DIAGNOSTIC {result.mode==="full"?"COMPLET":"RAPIDE"} TERMINÉ</span><h1>Ton profil mental estimé</h1><p>Une tendance détectée reste à confirmer avec tes données de jeu et ton historique.</p></div><div className="mgdr-score"><strong>{result.globalMentalScore}</strong><span>/100 · {result.level}</span></div></header>
    <div className="mgdr-grid">
      <section className="mgd-card mgdr-radar"><div className="mgd-card-title"><strong>RADAR MENTAL</strong><span>Fiabilité {result.confidenceLevel} · {result.confidenceScore}%</span></div><DiagnosticRadar scores={radarScores}/></section>
      <section className="mgd-card mgdr-leaks"><div className="mgd-card-title"><strong>TOP LEAKS PRIORITAIRES</strong></div>{result.topLeaks.map((leak,index)=><div className="mgdr-leak" key={leak.id}><b>{index+1}</b><div><strong>{leak.name}</strong><span>Risque probable · impact {leak.impact}/100</span></div><em data-priority={leak.priority}>{leak.priority}</em></div>)}</section>
      <section className="mgd-card mgdr-causes"><div className="mgd-card-title"><strong>CAUSES RACINES PROBABLES</strong></div>{result.rootCauses.map(cause=><div key={cause.title}><strong>{cause.title}</strong><span>{cause.chain}</span></div>)}</section>
      <section className="mgd-card mgdr-plan"><div className="mgd-card-title"><strong>PLAN PERSONNALISÉ 7 JOURS</strong></div>{result.sevenDayPlan.map(day=><div key={day.day}><b>J{day.day}</b><span><strong>{day.exercise}</strong><small>{day.objective} · {day.duration} min · {day.indicator}</small></span></div>)}</section>
    </div>
    {result.warnings.length>0&&<section className="mgd-card mgdr-warning"><strong>Lecture prudente</strong>{result.warnings.map(warning=><p key={warning}>{warning}</p>)}</section>}
    {result.progressComparison&&<section className="mgd-card mgdr-comparison"><strong>Évolution depuis le dernier diagnostic</strong><span>{result.progressComparison.previousScore}/100 → {result.progressComparison.currentScore}/100</span><b>{result.progressComparison.delta>=0?"+":""}{result.progressComparison.delta} points</b></section>}
    <div className="mgdr-actions"><button type="button" onClick={onPlan}>Lancer le plan mental 7 jours</button><button type="button" onClick={onPlan}>Générer une mission du jour</button><button type="button" onClick={onCoach}>Ouvrir Coach IA Mental</button><button type="button" className="secondary" onClick={onRestart}>Refaire le diagnostic</button></div>
  </div>;
}

/* ── Bibliothèque d'exercices premium ── */
function formatTimer(totalSeconds){
  const safe=Math.max(0,Math.round(totalSeconds||0));
  const mm=String(Math.floor(safe/60)).padStart(2,"0");
  const ss=String(safe%60).padStart(2,"0");
  return `${mm}:${ss}`;
}

function MentalExercises({m,setM}){
  const progress=m.mentalExerciseProgress||{};
  const history=m.mentalExerciseHistory||[];
  const doneIds=new Set(m.doneEx||[]);
  const ai=recommendMentalExercises(m);
  const[filter,setFilter]=useState("all");
  const[query,setQuery]=useState("");
  const[sort,setSort]=useState("recommended");
  const[selected,setSelected]=useState(null);
  const[running,setRunning]=useState(null);
  const[currentStep,setCurrentStep]=useState(0);
  const[paused,setPaused]=useState(false);
  const[remaining,setRemaining]=useState(0);
  const[before,setBefore]=useState(5);
  const[after,setAfter]=useState(6);
  const[interactive,setInteractive]=useState({});

  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    const base=MENTAL_EXERCISES.filter(ex=>{
      if(!exerciseMatchesFilter(ex,filter))return false;
      if(!needle)return true;
      return ex.title.toLowerCase().includes(needle)||
        ex.shortDescription.toLowerCase().includes(needle)||
        ex.category.toLowerCase().includes(needle)||
        ex.tags.some(tag=>tag.toLowerCase().includes(needle));
    });
    return sortMentalExercises(base,sort,m);
  },[filter,query,sort,m]);

  const doneCount=MENTAL_EXERCISES.filter(ex=>doneIds.has(ex.id)||progress[ex.id]?.status==="terminé").length;
  const activeCount=MENTAL_EXERCISES.filter(ex=>progress[ex.id]?.status==="en cours").length;
  const completionPct=Math.round(doneCount/MENTAL_EXERCISES.length*100);
  const aiTopIds=new Set([ai.priority?.id,ai.secondary?.id].filter(Boolean));

  useEffect(()=>{
    if(!running||paused||remaining<=0)return;
    const timer=setInterval(()=>setRemaining(v=>Math.max(0,v-1)),1000);
    return()=>clearInterval(timer);
  },[running,paused,remaining]);

  function persistProgress(ex,status,extra={}){
    setM(state=>({
      ...state,
      mentalExerciseProgress:{
        ...(state.mentalExerciseProgress||{}),
        [ex.id]:{
          ...(state.mentalExerciseProgress||{})[ex.id],
          status,
          updatedAt:new Date().toISOString(),
          ...extra,
        },
      },
    }));
  }

  function startExercise(ex){
    setSelected(null);
    setRunning(ex);
    setCurrentStep(0);
    setPaused(false);
    setRemaining(Math.max(60,ex.duration*60));
    setBefore(5);
    setAfter(6);
    setInteractive({});
    persistProgress(ex,"en cours",{startedAt:new Date().toISOString()});
  }

  function completeRunning(){
    if(!running)return;
    const score=Math.max(0,Math.min(100,Math.round(65+(after-before)*6+(currentStep+1)/running.steps.length*20)));
    const categoryScoreMap={
      tilt:"tiltControl",
      concentration:"concentration",
      discipline:"discipline",
      confiance:"confidence",
      variance:"patience",
      fatigue:"discipline",
      respiration:"tiltControl",
      pression:"decision",
      tournoi:"confidence",
      postsession:"discipline",
    };
    const scoreKey=categoryScoreMap[running.categoryKey];
    setM(state=>{
      const alreadyDone=(state.doneEx||[]).includes(running.id);
      const scores={...(state.scores||{})};
      if(scoreKey)scores[scoreKey]=Math.max(0,Math.min(100,Math.round(((scores[scoreKey]||60)*3+score)/4)));
      return{
        ...state,
        xp:(state.xp||0)+(alreadyDone?0:running.xp),
        scores,
        doneEx:alreadyDone?(state.doneEx||[]):[...(state.doneEx||[]),running.id],
        mentalExerciseProgress:{
          ...(state.mentalExerciseProgress||{}),
          [running.id]:{status:"terminé",score,before,after,completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()},
        },
        mentalExerciseHistory:[
          {id:running.id,title:running.title,category:running.category,score,before,after,xp:alreadyDone?0:running.xp,date:new Date().toISOString()},
          ...(state.mentalExerciseHistory||[]),
        ].slice(0,80),
      };
    });
    setRunning(null);
  }

  function resetProgress(ex){
    setM(state=>({
      ...state,
      doneEx:(state.doneEx||[]).filter(id=>id!==ex.id),
      mentalExerciseProgress:{...(state.mentalExerciseProgress||{}),[ex.id]:{status:"non commencé",updatedAt:new Date().toISOString()}},
    }));
  }

  return(
    <section className="mgx-ex">
      <div className="mgx-ex-hero">
        <div>
          <span className="mgx-ex-kicker">Bibliothèque mentale premium</span>
          <h2>Exercices mentaux PokerForge</h2>
          <p>125 routines guidées pour gérer tilt, concentration, variance, fatigue, pré-session, post-session et pression tournoi.</p>
        </div>
        <div className="mgx-ex-stats">
          <div><strong>{MENTAL_EXERCISES.length}</strong><span>exercices</span></div>
          <div><strong>{doneCount}</strong><span>terminés</span></div>
          <div><strong>{completionPct}%</strong><span>progression</span></div>
          <div><strong>{activeCount}</strong><span>en cours</span></div>
        </div>
      </div>

      <div className="mgx-ex-coach">
        <div className="mgx-ex-coach-copy">
          <span>Coach IA Mental</span>
          <strong>{ai.priority?.title||"Routine mentale du jour"}</strong>
          <p>{ai.reminder}</p>
        </div>
        <div className="mgx-ex-coach-actions">
          {ai.priority&&<button type="button" onClick={()=>startExercise(ai.priority)}>Commencer priorité</button>}
          {ai.secondary&&<button type="button" className="secondary" onClick={()=>setSelected(ai.secondary)}>Voir secondaire</button>}
        </div>
        <small>{ai.mission}</small>
      </div>

      <div className="mgx-ex-toolbar">
        <label className="mgx-ex-search">
          <span>Recherche</span>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="bad beat, respiration, bulle, fatigue…" />
        </label>
        <label className="mgx-ex-sort">
          <span>Tri</span>
          <select value={sort} onChange={e=>setSort(e.target.value)}>
            {MENTAL_EXERCISE_SORTS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="mgx-ex-filters" aria-label="Filtres exercices mentaux">
        {MENTAL_EXERCISE_FILTERS.map(item=><button key={item.id} type="button" className={filter===item.id?"active":""} onClick={()=>setFilter(item.id)}>{item.label}</button>)}
      </div>

      <div className="mgx-ex-count">{filtered.length} exercice{filtered.length>1?"s":""} affiché{filtered.length>1?"s":""}</div>

      {filtered.length===0?(
        <div className="mgx-ex-empty">
          <strong>Aucun exercice ne correspond à ce filtre.</strong>
          <p>Essaie “Tous”, retire la recherche, ou passe par la recommandation Coach IA.</p>
          <button type="button" onClick={()=>{setFilter("all");setQuery("");}}>Réinitialiser les filtres</button>
        </div>
      ):(
        <div className="mgx-ex-grid">
          {filtered.map(ex=>{
            const status=mentalExerciseStatus(progress,ex.id);
            const value=mentalExerciseProgressValue(status);
            const done=status==="terminé"||doneIds.has(ex.id);
            const score=scoreExerciseRecommendation(ex,m);
            return(
              <article key={ex.id} className={`mgx-ex-card ${done?"done":""}`} style={{"--ex-color":ex.color}}>
                {aiTopIds.has(ex.id)&&<div className="mgx-ex-ai">Recommandé IA</div>}
                <div className="mgx-ex-card-top">
                  <span className="mgx-ex-icon" aria-hidden="true">{ex.icon}</span>
                  <div>
                    <strong>{ex.title}</strong>
                    <small>{ex.category}</small>
                  </div>
                </div>
                <p>{ex.shortDescription}</p>
                <div className="mgx-ex-meta">
                  <span>{ex.duration} min</span>
                  <span>+{ex.xp} XP</span>
                  <span>{ex.difficulty}</span>
                  <span>{ex.mode==="interactive"?"Interactif":"Guidé"}</span>
                </div>
                <div className="mgx-ex-tags">{ex.tags.slice(0,4).map(tag=><i key={tag}>{tag}</i>)}</div>
                <div className="mgx-ex-progress"><span style={{width:`${value}%`}}/></div>
                <div className="mgx-ex-card-foot">
                  <em>{status}</em>
                  <b>{score} IA</b>
                </div>
                <div className="mgx-ex-card-actions">
                  <button type="button" className="secondary" onClick={()=>setSelected(ex)}>Voir</button>
                  <button type="button" onClick={()=>startExercise(ex)}>{done?"Refaire":"Commencer"}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selected&&<ExerciseDetailsModal exercise={selected} history={history.filter(item=>item.id===selected.id)} progress={progress[selected.id]} onClose={()=>setSelected(null)} onStart={()=>startExercise(selected)} onReset={()=>resetProgress(selected)}/>}
      {running&&<ExerciseRunner exercise={running} step={currentStep} setStep={setCurrentStep} paused={paused} setPaused={setPaused} remaining={remaining} before={before} setBefore={setBefore} after={after} setAfter={setAfter} interactive={interactive} setInteractive={setInteractive} onClose={()=>setRunning(null)} onComplete={completeRunning}/>}
    </section>
  );
}

function ExerciseDetailsModal({exercise,history,progress,onClose,onStart,onReset}){
  return(
    <div className="mgx-ex-modal" role="dialog" aria-modal="true" aria-label={`Détails ${exercise.title}`}>
      <div className="mgx-ex-modal-card">
        <button type="button" className="mgx-ex-close" onClick={onClose}>×</button>
        <div className="mgx-ex-modal-head" style={{"--ex-color":exercise.color}}>
          <span>{exercise.icon}</span>
          <div><strong>{exercise.title}</strong><small>{exercise.category} · {exercise.difficulty} · {exercise.duration} min · +{exercise.xp} XP</small></div>
        </div>
        <div className="mgx-ex-modal-grid">
          <section>
            <h3>Objectif</h3>
            <p>{exercise.goal}</p>
            <h3>Quand l’utiliser</h3>
            <ul>{exercise.whenToUse.map(item=><li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h3>Étapes guidées</h3>
            <ol>{exercise.steps.map(item=><li key={item}>{item}</li>)}</ol>
          </section>
          <section>
            <h3>Bénéfices attendus</h3>
            <ul>{exercise.benefits.map(item=><li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h3>Historique utilisateur</h3>
            {history.length?history.slice(0,4).map(item=><p key={item.date} className="mgx-ex-history">Score {item.score}/100 · {new Date(item.date).toLocaleDateString("fr-FR")}</p>):<p className="mgx-ex-muted">Aucun historique pour cet exercice.</p>}
            {progress?.status&&<p className="mgx-ex-history">État actuel : {progress.status}</p>}
          </section>
        </div>
        <div className="mgx-ex-modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Fermer</button>
          <button type="button" className="secondary" onClick={onReset}>Réinitialiser</button>
          <button type="button" onClick={onStart}>Commencer</button>
        </div>
      </div>
    </div>
  );
}

function ExerciseRunner({exercise,step,setStep,paused,setPaused,remaining,before,setBefore,after,setAfter,interactive,setInteractive,onClose,onComplete}){
  const total=exercise.steps.length;
  const pct=Math.round((step+1)/total*100);
  return(
    <div className="mgx-ex-runner" role="dialog" aria-modal="true" aria-label={`Exercice guidé ${exercise.title}`}>
      <div className="mgx-ex-runner-card" style={{"--ex-color":exercise.color}}>
        <div className="mgx-ex-runner-head">
          <div><span>{exercise.icon}</span><strong>{exercise.title}</strong><small>{exercise.category} · {exercise.mode==="interactive"?"mode interactif":"mode guidé"}</small></div>
          <button type="button" onClick={onClose}>Quitter</button>
        </div>
        <div className="mgx-ex-runner-body">
          <aside>
            <strong>{formatTimer(remaining)}</strong>
            <span>Timer</span>
            <div className="mgx-ex-runner-ring"><i style={{height:`${pct}%`}}/></div>
            <button type="button" onClick={()=>setPaused(!paused)}>{paused?"Reprendre":"Pause"}</button>
          </aside>
          <main>
            <div className="mgx-ex-step-label">Étape {step+1}/{total}</div>
            <h3>{exercise.steps[step]}</h3>
            <ExerciseInteractivePanel exercise={exercise} data={interactive} setData={setInteractive}/>
            <div className="mgx-ex-feelings">
              <label>Ressenti avant <b>{before}/10</b><input type="range" min="0" max="10" value={before} onChange={e=>setBefore(+e.target.value)}/></label>
              <label>Ressenti après <b>{after}/10</b><input type="range" min="0" max="10" value={after} onChange={e=>setAfter(+e.target.value)}/></label>
            </div>
            <div className="mgx-ex-runner-actions">
              <button type="button" className="secondary" disabled={step===0} onClick={()=>setStep(Math.max(0,step-1))}>Précédent</button>
              <button type="button" className="secondary" disabled={step===total-1} onClick={()=>setStep(Math.min(total-1,step+1))}>Étape suivante</button>
              <button type="button" onClick={onComplete}>Terminer l’exercice</button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function ExerciseInteractivePanel({exercise,data,setData}){
  if(exercise.interactive==="bad-beat-simulator"){
    const options=["colère","injustice","frustration","envie de se refaire","calme"];
    return <div className="mgx-ex-interactive"><strong>AA vs 72o : Hero perd river.</strong><p>Que ressens-tu ?</p><div>{options.map(item=><button type="button" key={item} className={data.feeling===item?"active":""} onClick={()=>setData({...data,feeling:item})}>{item}</button>)}</div>{data.feeling&&<small>{data.feeling==="calme"?"Très bon signal : continue en décision par décision.":"Recommandation : pause 3 minutes + Reset après bad beat avant de reprendre."}</small>}</div>;
  }
  if(exercise.interactive==="tilt-check"){
    const checks=["Je joue plus vite que d’habitude","Je veux récupérer mes pertes","Je me sens injustement puni","Je prends des spots que je n’aurais pas pris à froid"];
    const yes=Object.values(data).filter(Boolean).length;
    const score=yes*25;
    return <div className="mgx-ex-interactive"><strong>Tilt score : {score}/100</strong>{checks.map((item,i)=><label key={item}><input type="checkbox" checked={!!data[i]} onChange={e=>setData({...data,[i]:e.target.checked})}/>{item}</label>)}{score>70&&<small>Pause obligatoire recommandée. Ne relance pas de session maintenant.</small>}</div>;
  }
  if(exercise.interactive==="abc-detector"){
    const qs=["Je suis patient","Je reconstruis les ranges","Je respecte mon plan","Je ressens de l’urgence","Je clique par habitude","Je reste calme après perte","Je peux encore étudier un spot","Je suis fatigué"];
    const score=qs.reduce((acc,_,i)=>acc+(data[i]?1:0),0);
    const state=score>=6?"A-game":score>=3?"B-game":"C-game";
    return <div className="mgx-ex-interactive"><strong>État estimé : {state}</strong>{qs.map((item,i)=><label key={item}><input type="checkbox" checked={!!data[i]} onChange={e=>setData({...data,[i]:e.target.checked})}/>{item}</label>)}{state==="C-game"&&<small>C-game détecté : recommandation = pause ou arrêt, pas volume.</small>}</div>;
  }
  if(exercise.interactive==="variance-trainer"){
    const items=["Décision correcte malgré résultat négatif","Résultat négatif accepté","Aucune envie de se refaire"];
    return <div className="mgx-ex-interactive"><strong>Série : 5 bons spots perdus.</strong>{items.map((item,i)=><label key={item}><input type="checkbox" checked={!!data[i]} onChange={e=>setData({...data,[i]:e.target.checked})}/>{item}</label>)}</div>;
  }
  if(exercise.interactive==="pressure-timer"){
    const started=data.startedAt||null;
    const elapsed=started?Math.round((Date.now()-started)/100)/10:null;
    return <div className="mgx-ex-interactive"><strong>Respire avant de cliquer.</strong><button type="button" onClick={()=>setData({startedAt:Date.now()})}>Démarrer pression</button>{started&&<button type="button" onClick={()=>setData({...data,elapsed})}>Je décide maintenant</button>}{data.elapsed&&<small>Temps de réponse : {data.elapsed}s. Objectif : ralentir sans paniquer.</small>}</div>;
  }
  return <p className="mgx-ex-muted">Mode guidé : suis l’étape active, respire, puis passe à l’étape suivante.</p>;
}

/* ── Méditations / audio ── */
function MentalMeditations({m,onDone}){
  const[sel,setSel]=useState(null);
  return(
    <div className="cai-grid3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))"}}>
      {MENTAL_CONTENT.meditations.map(med=>(
        <div key={med.id} className="cai-card" style={{margin:0}}>
          <div style={{fontSize:11.5,fontWeight:700,color:"#fff",marginBottom:5}}>{med.title}</div>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            <span className="cai-pill" style={{background:"rgba(155,92,255,.12)",color:"#C9A0FF"}}>{med.theme}</span>
            <span className="cai-pill" style={{background:"rgba(31,139,255,.1)",color:"#7FB8FF"}}>{med.duration}min</span>
          </div>
          {sel===med.id
            ?<MeditationPlayer med={med} onDone={()=>onDone(med)}/>
            :<button className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setSel(med.id)}>🎧 Démarrer la séance</button>}
        </div>
      ))}
    </div>
  );
}

/* ── Articles & conseils ── */
function MentalArticles({m,setM,articleOfDay}){
  const cats=["Tous",...new Set(MENTAL_CONTENT.articles.map(a=>a.category))];
  const[cat,setCat]=useState("Tous");
  const[open,setOpen]=useState(null);
  const list=MENTAL_CONTENT.articles.filter(a=>a.status==="published"&&(cat==="Tous"||a.category===cat));
  return(
    <>
      <div className="cai-card" style={{borderColor:"rgba(255,194,71,.3)"}}>
        <div className="cai-card-h" style={{color:T.gold}}>⭐ Article du jour</div>
        <div style={{fontSize:12.5,fontWeight:700,color:"#fff",marginBottom:4}}>{articleOfDay.title}</div>
        <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,marginBottom:8}}>{articleOfDay.category} · {articleOfDay.author} · MAJ {articleOfDay.updatedAt}</div>
        <button className="cai-btn cai-btn-gold" style={{fontSize:9}} onClick={()=>setOpen(articleOfDay.id)}>Lire l'article →</button>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {cats.map(c=>(
          <div key={c} onClick={()=>setCat(c)} style={{padding:"5px 11px",borderRadius:20,cursor:"pointer",fontSize:9.5,fontWeight:700,fontFamily:T.stats,
            background:cat===c?"rgba(31,139,255,.16)":"rgba(255,255,255,.03)",border:`1px solid ${cat===c?"rgba(31,139,255,.5)":"#152D6E"}`,color:cat===c?"#7FB8FF":T.text3}}>{c}</div>
        ))}
      </div>
      {list.map(a=>(
        <div key={a.id} className="cai-card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:3}}>{a.title} {a.featured&&<span style={{fontSize:8,color:T.gold}}>★</span>}</div>
              <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>{a.category} · ⏱ {a.duration}min · {a.tags.map(t=>"#"+t).join(" ")}</div>
            </div>
            <button className="cai-btn cai-btn-ghost" style={{fontSize:9,flexShrink:0}} onClick={()=>setOpen(open===a.id?null:a.id)}>{open===a.id?"Fermer":"Lire"}</button>
          </div>
          {open===a.id&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #152D6E",fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.7,whiteSpace:"pre-line"}}>{a.content}</div>
          )}
        </div>
      ))}
    </>
  );
}

/* ── Journal mental (pré/post + graphiques) ── */
function MentalJournal({m,setM,addXp}){
  const[mode,setMode]=useState("pre");
  const[pre,setPre]=useState({energy:5,stress:5,motivation:5,confidence:5,goal:"",tables:1,duration:60});
  const[post,setPost]=useState({tilt:3,concentration:7,discipline:7,decision:7,plan:true,hard:"",best:"",note:""});
  const Slider=({label,val,onCh,col="#1F8BFF"})=>(
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.text3,fontFamily:T.stats,marginBottom:3}}><span>{label}</span><span style={{color:col,fontWeight:700}}>{val}/10</span></div>
      <input type="range" min="0" max="10" value={val} onChange={e=>onCh(+e.target.value)} style={{width:"100%",accentColor:col}}/>
    </div>
  );
  function save(){
    const entry={id:Date.now(),date:todayKey(),type:mode,data:mode==="pre"?pre:post};
    setM(x=>({...x,journal:[entry,...(x.journal||[])].slice(0,200)}));
    addXp(20);
    // post : ajuste scores
    if(mode==="post"){
      setM(x=>{const s={...x.scores};
        s.tiltControl=Math.max(0,Math.min(100,Math.round((s.tiltControl+(100-post.tilt*10))/2)));
        s.concentration=Math.max(0,Math.min(100,Math.round((s.concentration+post.concentration*10)/2)));
        s.discipline=Math.max(0,Math.min(100,Math.round((s.discipline+post.discipline*10)/2)));
        s.decision=Math.max(0,Math.min(100,Math.round((s.decision+post.decision*10)/2)));
        return{...x,scores:s};
      });
    }
  }
  const posts=(m.journal||[]).filter(j=>j.type==="post").slice(0,14).reverse();
  return(
    <>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["pre","🌅 Avant session"],["post","🌙 Après session"]].map(([id,l])=>(
          <div key={id} onClick={()=>setMode(id)} style={{flex:1,padding:"8px",borderRadius:9,textAlign:"center",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:T.stats,
            background:mode===id?"rgba(31,139,255,.14)":"rgba(255,255,255,.03)",border:`1px solid ${mode===id?"rgba(31,139,255,.5)":"#152D6E"}`,color:mode===id?"#7FB8FF":T.text3}}>{l}</div>
        ))}
      </div>
      <div className="cai-card">
        {mode==="pre"?(
          <>
            <Slider label="Énergie" val={pre.energy} onCh={v=>setPre({...pre,energy:v})} col="#10D87A"/>
            <Slider label="Stress" val={pre.stress} onCh={v=>setPre({...pre,stress:v})} col="#FF4560"/>
            <Slider label="Motivation" val={pre.motivation} onCh={v=>setPre({...pre,motivation:v})} col="#FFC247"/>
            <Slider label="Confiance" val={pre.confidence} onCh={v=>setPre({...pre,confidence:v})} col="#9B5CFF"/>
            <input placeholder="Objectif de session…" value={pre.goal} onChange={e=>setPre({...pre,goal:e.target.value})} style={inpStyle}/>
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <label style={lblStyle}>Tables <input type="number" min="1" max="24" value={pre.tables} onChange={e=>setPre({...pre,tables:+e.target.value})} style={{...inpStyle,width:54,marginTop:2}}/></label>
              <label style={lblStyle}>Durée (min) <input type="number" min="5" max="600" value={pre.duration} onChange={e=>setPre({...pre,duration:+e.target.value})} style={{...inpStyle,width:64,marginTop:2}}/></label>
            </div>
          </>
        ):(
          <>
            <Slider label="Tilt ressenti" val={post.tilt} onCh={v=>setPost({...post,tilt:v})} col="#FF4560"/>
            <Slider label="Concentration" val={post.concentration} onCh={v=>setPost({...post,concentration:v})} col="#34D8FF"/>
            <Slider label="Discipline" val={post.discipline} onCh={v=>setPost({...post,discipline:v})} col="#1F8BFF"/>
            <Slider label="Qualité de décision" val={post.decision} onCh={v=>setPost({...post,decision:v})} col="#10D87A"/>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:10.5,color:T.text2,fontFamily:T.stats,margin:"6px 0"}}>
              <input type="checkbox" checked={post.plan} onChange={e=>setPost({...post,plan:e.target.checked})} style={{accentColor:"#10D87A"}}/> J'ai respecté mon plan
            </label>
            <input placeholder="Moment difficile…" value={post.hard} onChange={e=>setPost({...post,hard:e.target.value})} style={inpStyle}/>
            <input placeholder="Meilleure décision…" value={post.best} onChange={e=>setPost({...post,best:e.target.value})} style={{...inpStyle,marginTop:6}}/>
            <textarea placeholder="Note libre…" value={post.note} onChange={e=>setPost({...post,note:e.target.value})} style={{...inpStyle,marginTop:6,minHeight:50,resize:"vertical"}}/>
          </>
        )}
        <button className="cai-btn" style={{marginTop:10}} onClick={save}>💾 Enregistrer (+20 XP)</button>
      </div>
      <div className="cai-grid2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div className="cai-card" style={{margin:0}}>
          <div className="cai-card-h">📉 Évolution du tilt</div>
          <MentalBars data={posts.map(j=>j.data.tilt||0)} col="#FF4560"/>
        </div>
        <div className="cai-card" style={{margin:0}}>
          <div className="cai-card-h">🎯 Évolution concentration</div>
          <MentalBars data={posts.map(j=>j.data.concentration||0)} col="#34D8FF"/>
        </div>
      </div>
      <div className="cai-card">
        <div className="cai-card-h">🕓 Dernières entrées ({(m.journal||[]).length})</div>
        {(m.journal||[]).slice(0,6).map(j=>(
          <div key={j.id} style={{display:"flex",gap:8,fontSize:10,color:T.text3,fontFamily:T.stats,padding:"4px 0",borderTop:"1px solid #0F2258"}}>
            <span style={{color:j.type==="pre"?"#7FB8FF":"#C9A0FF",fontWeight:700,minWidth:42}}>{j.type==="pre"?"🌅 Pré":"🌙 Post"}</span>
            <span style={{minWidth:70}}>{j.date}</span>
            <span style={{flex:1}}>{j.type==="pre"?`Énergie ${j.data.energy}/10 · ${j.data.goal||"—"}`:`Tilt ${j.data.tilt}/10 · Conc ${j.data.concentration}/10`}</span>
          </div>
        ))}
      </div>
    </>
  );
}
const inpStyle={width:"100%",boxSizing:"border-box",background:"#030D2A",border:"1px solid #152D6E",borderRadius:8,color:"#E6EEFF",fontFamily:"'Inter',sans-serif",fontSize:10.5,padding:"7px 9px",outline:"none"};
const lblStyle={fontSize:10,color:T.text3,fontFamily:"'Inter',sans-serif"};

/* ── A/B/C Game tracker ── */
function MentalABC({m,setM}){
  function rate(grade){setM(x=>({...x,abc:[{date:todayKey(),grade},...(x.abc||[])].slice(0,60)}));}
  const counts={A:0,B:0,C:0};(m.abc||[]).forEach(a=>counts[a.grade]++);
  const total=(m.abc||[]).length||1;
  const week=(m.abc||[]).slice(0,7);const wc={A:0,B:0,C:0};week.forEach(a=>wc[a.grade]++);
  const GR=[["A","#10D87A","Focus élevé · discipline · décisions rationnelles · pas de tilt"],["B","#FFC247","Quelques erreurs · concentration moyenne · fatigue modérée"],["C","#FF4560","Tilt · spew · autopilot · décisions émotionnelles"]];
  return(
    <>
      <div className="cai-card">
        <div className="cai-card-h">🅰️ Comment as-tu joué cette session ?</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {GR.map(([g,c,d])=>(
            <div key={g} onClick={()=>rate(g)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:10,cursor:"pointer",background:"rgba(255,255,255,.025)",border:`1px solid ${c}33`,borderLeft:`3px solid ${c}`}}>
              <span style={{fontFamily:T.brand,fontSize:20,fontWeight:900,color:c,minWidth:24}}>{g}</span>
              <span style={{fontSize:10.5,color:T.text2,fontFamily:T.stats}}>{d}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="cai-grid3">
        {GR.map(([g,c])=>(
          <div key={g} className="cai-card" style={{margin:0,textAlign:"center"}}>
            <div style={{fontFamily:T.brand,fontSize:26,fontWeight:900,color:c}}>{Math.round(counts[g]/total*100)}%</div>
            <div style={{fontSize:10,color:T.text3,fontFamily:T.stats}}>{g}-Game ({counts[g]})</div>
          </div>
        ))}
      </div>
      <div className="cai-card">
        <div className="cai-card-h">📅 Tendance 7 dernières sessions</div>
        <div style={{display:"flex",height:24,borderRadius:8,overflow:"hidden",border:"1px solid #152D6E"}}>
          {["A","B","C"].map(g=>{const c={A:"#10D87A",B:"#FFC247",C:"#FF4560"}[g];const w=week.length?wc[g]/week.length*100:0;return w>0?<div key={g} style={{width:w+"%",background:c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#031"}}>{Math.round(w)}%</div>:null;})}
        </div>
        <div style={{fontSize:10,color:T.text3,fontFamily:T.stats,marginTop:8,lineHeight:1.5}}>
          {wc.C>wc.A?"⚠ Trop de C-Game cette semaine — priorité tilt control et warm-up.":wc.A>=week.length*0.6?"✅ Belle semaine, A-Game dominant. Continue tes routines !":"Continue à noter chaque session pour suivre ta tendance."}
        </div>
      </div>
    </>
  );
}

/* ── Warm-Up Builder ── */
function MentalWarmup({m,setM,addXp,onGoTrainer}){
  const ITEMS=[["hydra","💧 Hydratation prête"],["phone","📵 Téléphone coupé"],["tech","🎯 Objectif technique choisi"],["mental","🧠 Objectif mental choisi"],["duree","⏱ Durée de session définie"],["tables","🃏 Nombre de tables défini"],["bankroll","💰 Bankroll vérifiée sans émotion"],["energie","⚡ Niveau d'énergie OK (>6/10)"]];
  const[chk,setChk]=useState({});
  const score=Math.round(Object.values(chk).filter(Boolean).length/ITEMS.length*100);
  function finish(){
    setM(x=>({...x,warmups:[{date:todayKey(),score},...(x.warmups||[])].slice(0,60)}));
    addXp(15);
  }
  return(
    <>
      <div className="cai-card">
        <div className="cai-card-h">🔥 Checklist pré-session</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {ITEMS.map(([id,l])=>(
            <label key={id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 9px",borderRadius:8,cursor:"pointer",background:chk[id]?"rgba(16,216,122,.08)":"rgba(255,255,255,.025)",border:`1px solid ${chk[id]?"rgba(16,216,122,.3)":"#152D6E"}`}}>
              <input type="checkbox" checked={!!chk[id]} onChange={e=>setChk(c=>({...c,[id]:e.target.checked}))} style={{accentColor:"#10D87A"}}/>
              <span style={{fontSize:11,color:chk[id]?T.text:T.text2,fontFamily:T.stats}}>{l}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="cai-card" style={{display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
        <MentalRing value={score} size={72} col={score>=75?"#10D87A":score>=50?"#FFC247":"#FF4560"} label="READY"/>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontFamily:T.brand,fontSize:13,fontWeight:800,color:"#fff",marginBottom:4}}>Session Ready Score : {score}/100</div>
          <div style={{fontSize:10.5,color:T.text2,fontFamily:T.stats,lineHeight:1.5,marginBottom:8}}>
            {score>=75?"✅ Tu es prêt à jouer ton A-Game.":score>=50?"⚠ Préparation partielle — envisage une session plus courte.":"🛑 Préparation faible — review ou repos recommandé plutôt qu'une session de volume."}
          </div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            <button className="cai-btn" style={{fontSize:9}} onClick={finish}>✓ Valider le warm-up (+15 XP)</button>
            {score>=75&&onGoTrainer&&<button className="cai-btn cai-btn-gold" style={{fontSize:9}} onClick={onGoTrainer}>🎯 Lancer une session</button>}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Post Session Review ── */
const POST_LEAK_MED={"Tilt control":"tilt-badbeat","Spew émotionnel":"tilt-revenge","Décisions émotionnelles":"focus-5min","Discipline (quitter au bon moment)":"post-discharge"};
function MentalPostSession({m,setM,addXp,onMeditate}){
  const Q=[["plan","Ai-je respecté mon plan ?"],["tilt","Ai-je tilté ?"],["agame","Ai-je joué mon A-Game ?"],["spew","Ai-je spew ?"],["quit","Ai-je quitté au bon moment ?"],["emo","Ai-je pris une décision émotionnelle ?"]];
  const[ans,setAns]=useState({});
  const[best,setBest]=useState("");const[err,setErr]=useState("");const[saved,setSaved]=useState(null);
  function submit(){
    // score : bonnes réponses (plan oui, tilt non, agame oui, spew non, quit oui, emo non)
    const good={plan:true,tilt:false,agame:true,spew:false,quit:true,emo:false};
    let s=0;Q.forEach(([k])=>{if(ans[k]===good[k])s++;});
    const score=Math.round(s/Q.length*100);
    const leak=ans.tilt?"Tilt control":ans.spew?"Spew émotionnel":ans.emo?"Décisions émotionnelles":ans.quit===false?"Discipline (quitter au bon moment)":"Aucun majeur";
    const review={date:todayKey(),score,leak,best,err};
    setM(x=>({...x,postReviews:[review,...(x.postReviews||[])].slice(0,60)}));
    addXp(20);setSaved(review);
  }
  return(
    <>
      <div className="cai-card">
        <div className="cai-card-h">🧾 Review post-session</div>
        {Q.map(([k,q])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:"1px solid #0F2258"}}>
            <span style={{fontSize:11,color:T.text2,fontFamily:T.stats}}>{q}</span>
            <div style={{display:"flex",gap:5}}>
              {[["Oui",true],["Non",false]].map(([l,v])=>(
                <div key={l} onClick={()=>setAns(a=>({...a,[k]:v}))} style={{padding:"3px 12px",borderRadius:7,cursor:"pointer",fontSize:9.5,fontWeight:700,fontFamily:T.stats,
                  background:ans[k]===v?"rgba(31,139,255,.16)":"rgba(255,255,255,.03)",border:`1px solid ${ans[k]===v?"rgba(31,139,255,.5)":"#152D6E"}`,color:ans[k]===v?"#7FB8FF":T.text3}}>{l}</div>
              ))}
            </div>
          </div>
        ))}
        <input placeholder="Ma meilleure décision…" value={best} onChange={e=>setBest(e.target.value)} style={{...inpStyle,marginTop:10}}/>
        <input placeholder="Mon erreur principale…" value={err} onChange={e=>setErr(e.target.value)} style={{...inpStyle,marginTop:6}}/>
        <button className="cai-btn" style={{marginTop:10}} onClick={submit}>Générer mon bilan (+20 XP)</button>
      </div>
      {saved&&(
        <div className="cai-card" style={{borderColor:"rgba(16,216,122,.3)"}}>
          <div className="cai-card-h" style={{color:"#7FE0A8"}}>📋 Bilan IA de la session</div>
          <div style={{fontSize:12,fontWeight:800,color:"#fff",marginBottom:6}}>Score session : {saved.score}/100</div>
          <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.6}}>
            Leak mental du jour : <b style={{color:"#FF8A8A"}}>{saved.leak}</b>.<br/>
            {saved.score>=75?"Belle session, mentalement solide. ":"Session à consolider mentalement. "}
            Mission pour demain : {saved.leak.includes("Tilt")?"5 min de respiration avant de jouer + stop-loss strict.":saved.leak.includes("Spew")?"recentrage EV après chaque erreur.":saved.leak.includes("Discipline")?"définir et respecter un stop-loss.":"noter 3 bonnes décisions."}
          </div>
          {onMeditate&&(saved.score<75||ans.tilt||ans.spew||ans.emo)&&(
            <button className="cai-btn" style={{marginTop:12,width:"100%",background:"linear-gradient(135deg,#1F8BFF,#7c3cff)"}}
              onClick={()=>onMeditate(POST_LEAK_MED[saved.leak]||"post-discharge")}>
              🧘 Décompresser maintenant — méditation adaptée à ton leak du jour
            </button>
          )}
        </div>
      )}
    </>
  );
}

/* ── Mode Downswing ── */
function MentalDownswing({m,setM}){
  const active=m.downswing;
  return(
    <>
      <div className="cai-card" style={{borderColor:active?"rgba(255,69,96,.4)":"#152D6E"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontFamily:T.brand,fontSize:14,fontWeight:800,color:active?"#FF8A8A":"#fff"}}>{active?"📉 Mode Downswing ACTIF":"Mode Downswing"}</div>
            <div style={{fontSize:10,color:T.text3,fontFamily:T.stats,marginTop:3}}>{active?"Priorité qualité de décision, pas volume.":"Active ce mode en cas de série négative (10-20 BI perdus) ou de baisse de mental."}</div>
          </div>
          <button className="cai-btn" style={{background:active?"linear-gradient(90deg,#10D87A,#0a8)":"linear-gradient(90deg,#FF4560,#FF8A3D)"}} onClick={()=>setM(x=>({...x,downswing:!x.downswing}))}>{active?"✓ Désactiver":"Activer le mode"}</button>
        </div>
      </div>
      {active&&(
        <div className="cai-card">
          <div className="cai-card-h" style={{color:"#FF8A8A"}}>🛡 Protocole downswing</div>
          <ul style={{margin:0,paddingLeft:18,fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.9}}>
            <li>Réduire le volume de 30 à 50%.</li>
            <li>Prioriser la review (10 mains/jour minimum).</li>
            <li>Travailler le mental (exercices + méditation).</li>
            <li>Objectifs simples : qualité de décision uniquement.</li>
            <li><b style={{color:"#FF8A8A"}}>Interdiction de monter de limite.</b></li>
            <li>Stop-loss strict, sans négociation.</li>
            <li>Rappel : 100 BI de downswing arrivent à tous les regs gagnants.</li>
          </ul>
        </div>
      )}
      <div className="cai-card">
        <div className="cai-card-h">🔔 Déclencheurs suggérés</div>
        <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,lineHeight:1.7}}>10 BI perdus · 20 BI perdus · baisse du Mental Score · hausse du tilt moyen · chute du % de A-Game. Active le mode dès qu'un de ces signaux apparaît.</div>
      </div>
    </>
  );
}

/* ── Préparation Tournoi ── */
function MentalTournoi({m,setM,addXp}){
  const PLAN=[
    {phase:"J-7",col:"#1F8BFF",items:["Volume réduit","Review des leaks","Sommeil régulier"]},
    {phase:"J-3",col:"#9B5CFF",items:["Focus mental","Méditation focus tournoi","Warm-up tournoi"]},
    {phase:"J-1",col:"#FFC247",items:["Repos","Préparation du setup","Objectif simple défini"]},
    {phase:"Jour J",col:"#10D87A",items:["Routine complète","Respiration avant le jeu","Objectif EV (pas résultat)","Rappel mental anti fear-money"]},
  ];
  const done=m.tournPrep?.done||{};
  function toggle(key){setM(x=>{const d={...(x.tournPrep?.done||{})};d[key]=!d[key];return{...x,tournPrep:{...(x.tournPrep||{}),done:d}};});}
  const totalItems=PLAN.reduce((a,p)=>a+p.items.length,0);
  const doneCount=Object.values(done).filter(Boolean).length;
  return(
    <>
      <div className="cai-card" style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <MentalRing value={Math.round(doneCount/totalItems*100)} size={64} col="#10D87A" label="PRÊT"/>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontFamily:T.brand,fontSize:13,fontWeight:800,color:"#fff"}}>🏆 Préparation gros tournoi</div>
          <div style={{fontSize:10,color:T.text3,fontFamily:T.stats}}>{doneCount}/{totalItems} étapes complétées · WinaSeries, MTT du dimanche, table finale…</div>
        </div>
      </div>
      {PLAN.map(p=>(
        <div key={p.phase} className="cai-card">
          <div className="cai-card-h" style={{color:p.col}}>{p.phase}</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {p.items.map((it,i)=>{const key=p.phase+"-"+i;return(
              <label key={key} style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer",fontSize:11,color:done[key]?T.text3:T.text2,fontFamily:T.stats}}>
                <input type="checkbox" checked={!!done[key]} onChange={()=>toggle(key)} style={{accentColor:p.col}}/>
                <span style={{textDecoration:done[key]?"line-through":"none"}}>{it}</span>
              </label>
            );})}
          </div>
        </div>
      ))}
    </>
  );
}

/* ── Coach IA Mental ── */
function MentalCoachIA({m,score,leaks,setView}){
  const posts=(m.journal||[]).filter(j=>j.type==="post");
  const recos=[];
  if(leaks.length)recos.push(`Priorité n°1 : ${leaks[0].t.toLowerCase()}. ${leaks[0].d}`);
  if(posts.length>=3){
    const avgConc=posts.reduce((a,j)=>a+(+j.data.concentration||0),0)/posts.length;
    if(avgConc<=6)recos.push("Ta concentration baisse en session : privilégie des sessions de 60 min avec pause obligatoire.");
  }
  const pres=(m.journal||[]).filter(j=>j.type==="pre");
  if(pres.length>=2){
    const hiE=pres.filter(j=>(+j.data.energy||0)>=7).length;
    if(hiE>=1)recos.push("Tu joues mieux quand ton énergie est > 7/10 : évite les sessions tardives à faible énergie.");
  }
  if(m.scores.tiltControl<60)recos.push("Ton tilt control est ton maillon faible : intègre la respiration 60s à chaque bad beat.");
  if(score>=75)recos.push("Ton mental est globalement solide : maintiens tes routines et capitalise en jouant ton volume quand tu es prêt.");
  if(recos.length===0)recos.push("Remplis ton journal et ton diagnostic pour que je personnalise tes recommandations.");
  const weekPlan=[
    {d:"Lun",f:leaks[0]?`Exercice ${MENTAL_CONTENT.exercises.find(e=>e.id===leaks[0].ex)?.title||"mental"} + warm-up`:"Warm-up + 1 méditation focus"},
    {d:"Mer",f:"Journal post-session systématique + review A/B/C"},
    {d:"Ven",f:"Diagnostic mental + 1 article du thème faible"},
    {d:"Dim",f:"Bilan de la semaine : relire le journal, ajuster les objectifs"},
  ];
  return(
    <>
      <div className="cai-card">
        <div className="cai-card-h">🤖 Analyse personnalisée</div>
        <div style={{fontSize:11.5,color:T.text2,fontFamily:T.stats,lineHeight:1.7}}>
          Mental Score : <b style={{color:"#fff"}}>{score}/100</b> · {posts.length} session(s) analysée(s) · {m.doneEx.length} exercice(s) fait(s).
        </div>
      </div>
      <div className="cai-card">
        <div className="cai-card-h">🎯 Priorités & conseils</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {recos.map((r,i)=>(
            <div key={i} style={{display:"flex",gap:9,fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.6}}>
              <span style={{color:"#7FB8FF",flexShrink:0}}>▸</span><span>{r}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="cai-card">
        <div className="cai-card-h">📅 Plan mental de la semaine</div>
        {weekPlan.map(w=>(
          <div key={w.d} style={{display:"flex",gap:10,padding:"6px 0",borderTop:"1px solid #0F2258"}}>
            <span style={{fontFamily:T.brand,fontSize:10,fontWeight:800,color:"#FFC247",minWidth:34}}>{w.d}</span>
            <span style={{fontSize:10.5,color:T.text2,fontFamily:T.stats,flex:1}}>{w.f}</span>
          </div>
        ))}
        <div style={{display:"flex",gap:7,marginTop:10,flexWrap:"wrap"}}>
          <button className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setView("exercices")}>🧩 Exercices</button>
          <button className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setView("journal")}>📓 Journal</button>
          <button className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setView("diagnostic")}>🩺 Diagnostic</button>
        </div>
      </div>
    </>
  );
}
