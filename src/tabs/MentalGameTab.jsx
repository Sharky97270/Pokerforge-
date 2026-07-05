// PokerForge — Mental Game (extrait de App.jsx, Phase 3.3)
// 15 sous-vues + modale anti-tilt + lecteur meditation. Donnees editables : MENTAL_CONTENT (data/content.js).
import React, { useState, useEffect } from "react";
import { T } from "../theme.js";
import { MENTAL_CONTENT } from "../data/content.js";

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
  diagAnswers:{},diagLeaks:[],diagDate:null,
  journal:[],doneEx:[],doneMissions:{},missionStreak:0,lastMissionDay:null,
  abc:[],warmups:[],postReviews:[],downswing:false,tournPrep:null,
  xp:0,badges:[],contentRead:[],tiltLog:[],warmReady:null,
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
function TiltCrisisModal({onClose,onReview,onStop}){
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
export default function MentalGameTab({onGoTrainer}){
  const[m,setM]=useState(loadMental);
  const[view,setView]=useState("dashboard");
  const[tiltOpen,setTiltOpen]=useState(false);
  useEffect(()=>{saveMental(m);},[m]);
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
    <div className="cai-pane">
      {tiltOpen&&<TiltCrisisModal onClose={()=>setTiltOpen(false)} onReview={()=>{setTiltOpen(false);setView("postsession");}} onStop={()=>{setTiltOpen(false);}}/>}
      {/* HERO + bouton tilt */}
      <div className="cai-hero" style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:220}}>
            <div className="cai-hero-title">🧠 Mental Game — Centre de coaching mental</div>
            <div className="cai-hero-sub">{lvl.ic} {lvl.l} · {m.xp} XP mental · 🔥 {m.missionStreak} j de série</div>
          </div>
          <button className="cai-btn" style={{background:"linear-gradient(90deg,#FF4560,#FF8A3D)",fontSize:12,padding:"11px 18px"}} onClick={()=>setTiltOpen(true)}>🚨 Je suis en tilt</button>
        </div>
      </div>

      {/* SOUS-NAV interne */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {MENTAL_NAV.map(([id,l])=>(
          <div key={id} onClick={()=>setView(id)} style={{
            padding:"6px 11px",borderRadius:8,cursor:"pointer",fontSize:9.5,fontWeight:700,fontFamily:T.stats,
            background:view===id?"rgba(31,139,255,.16)":"rgba(255,255,255,.03)",
            border:`1px solid ${view===id?"rgba(31,139,255,.5)":"#152D6E"}`,
            color:view===id?"#7FB8FF":T.text3,transition:"all .14s",
          }}>{l}</div>
        ))}
      </div>

      {/* ══ DASHBOARD ══ */}
      {view==="dashboard"&&(
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
      {view==="diagnostic"&&<MentalDiagnostic m={m} setM={setM}/>}

      {/* ══ EXERCICES ══ */}
      {view==="exercices"&&<MentalExercises m={m} onComplete={completeExercise}/>}

      {/* ══ MÉDITATIONS ══ */}
      {view==="meditations"&&(
        <MentalMeditations m={m} onDone={(med)=>{addXp(10);bump("concentration",1);}}/>
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
      {view==="postsession"&&<MentalPostSession m={m} setM={setM} addXp={addXp}/>}

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

/* ── Diagnostic mental : questionnaire → leaks + ajustement scores ── */
function MentalDiagnostic({m,setM}){
  const[ans,setAns]=useState(m.diagAnswers||{});
  const[done,setDone]=useState(!!m.diagDate);
  const SCALE=[["Jamais",0],["Rarement",1],["Parfois",2],["Souvent",3],["Toujours",4]];
  function submit(){
    // agrège par leak + recalcule les scores impactés
    const leakScore={};const scores={...m.scores};
    MENTAL_DIAG_Q.forEach((q,i)=>{
      const v=ans[i]||0;
      leakScore[q.leak]=(leakScore[q.leak]||0)+v;
      q.affects.forEach(k=>{scores[k]=Math.max(0,Math.min(100,(scores[k]||60)-v*3));});
    });
    const leaks=Object.entries(leakScore).sort((a,b)=>b[1]-a[1]).filter(([,v])=>v>=3).map(([leak])=>{
      const ref={Tilt:{ex:"reset-badbeat",art:"a-badbeats",mission:"m-resp"},"Fatigue mentale":{ex:"routine-pre",art:"a-sommeil",mission:"m-fatigue"},"Result-oriented":{ex:"journal-bonnes",art:"a-ev",mission:"m-3decisions"},Discipline:{ex:"respect-plan",art:"a-routine",mission:"m-warmup"},"Spew émotionnel":{ex:"recentrage-ev",art:"a-spew",mission:"m-review"},Autopilot:{ex:"anti-autopilot",art:"a-routine",mission:"m-warmup"},"Fear money":{ex:"ancrage-agame",art:"a-deeprun",mission:"m-anchor"}}[leak]||{};
      return{leak,advice:`Travaille en priorité : ${leak.toLowerCase()}.`,...ref};
    });
    setM(x=>({...x,diagAnswers:ans,diagLeaks:leaks,diagDate:todayKey(),scores}));
    setDone(true);
  }
  return(
    <>
      <div className="cai-card">
        <div className="cai-card-h">🩺 Diagnostic mental — réponds honnêtement</div>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {MENTAL_DIAG_Q.map((q,i)=>(
            <div key={i}>
              <div style={{fontSize:11,color:T.text,fontFamily:T.stats,marginBottom:5}}>{i+1}. {q.q}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {SCALE.map(([l,v])=>(
                  <div key={v} onClick={()=>setAns(a=>({...a,[i]:v}))} style={{padding:"4px 9px",borderRadius:7,cursor:"pointer",fontSize:9,fontFamily:T.stats,fontWeight:700,
                    background:(ans[i]||0)===v&&ans[i]!==undefined?(v>=3?"rgba(255,69,96,.18)":v===0?"rgba(16,216,122,.15)":"rgba(255,194,71,.15)"):"rgba(255,255,255,.03)",
                    border:`1px solid ${ans[i]===v?(v>=3?"rgba(255,69,96,.5)":v===0?"rgba(16,216,122,.4)":"rgba(255,194,71,.4)"):"#152D6E"}`,
                    color:ans[i]===v?"#fff":T.text3}}>{l}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="cai-btn" style={{marginTop:14}} onClick={submit}>Analyser mon mental →</button>
      </div>
      {done&&m.diagLeaks&&(
        <div className="cai-card" style={{borderColor:"rgba(155,92,255,.3)"}}>
          <div className="cai-card-h" style={{color:"#C9A0FF"}}>📋 Résultat du diagnostic</div>
          <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,marginBottom:10}}>Mental Score recalculé : <b style={{color:"#fff"}}>{mentalScore(m.scores)}/100</b></div>
          {m.diagLeaks.length===0?(
            <div style={{fontSize:11,color:T.green,fontFamily:T.stats}}>✅ Aucun leak mental majeur. Continue comme ça !</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats}}>Leak prioritaire : <b style={{color:"#FF8A8A"}}>{m.diagLeaks[0].leak}</b></div>
              {m.diagLeaks.map((l,i)=>(
                <div key={i} style={{fontSize:10.5,color:T.text2,fontFamily:T.stats,padding:"5px 0",borderTop:i?"1px solid #152D6E":"none"}}>• {l.leak} — exercice conseillé : <i>{MENTAL_CONTENT.exercises.find(e=>e.id===l.ex)?.title||"voir"}</i></div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ── Bibliothèque d'exercices ── */
function MentalExercises({m,onComplete}){
  const cats=[...new Set(MENTAL_CONTENT.exercises.map(e=>e.category))];
  const[cat,setCat]=useState(cats[0]);
  const[open,setOpen]=useState(null);
  return(
    <>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {cats.map(c=>(
          <div key={c} onClick={()=>setCat(c)} style={{padding:"5px 11px",borderRadius:20,cursor:"pointer",fontSize:9.5,fontWeight:700,fontFamily:T.stats,
            background:cat===c?"rgba(31,139,255,.16)":"rgba(255,255,255,.03)",border:`1px solid ${cat===c?"rgba(31,139,255,.5)":"#152D6E"}`,color:cat===c?"#7FB8FF":T.text3}}>{c}</div>
        ))}
      </div>
      <div className="cai-grid3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))"}}>
        {MENTAL_CONTENT.exercises.filter(e=>e.category===cat).map(ex=>{
          const done=m.doneEx.includes(ex.id);
          return(
            <div key={ex.id} className="cai-card" style={{margin:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:11.5,fontWeight:700,color:"#fff"}}>{ex.title}</span>
                {done&&<span style={{fontSize:9,color:T.green,fontWeight:700}}>✓</span>}
              </div>
              <div style={{display:"flex",gap:6,marginBottom:7}}>
                <span className="cai-pill" style={{background:"rgba(31,139,255,.1)",color:"#7FB8FF"}}>⏱ {ex.duration}min</span>
                <span className="cai-pill" style={{background:"rgba(255,194,71,.1)",color:T.gold}}>+{ex.xp} XP</span>
              </div>
              <div style={{fontSize:10,color:T.text3,fontFamily:T.stats,lineHeight:1.5,marginBottom:8}}>{ex.goal}</div>
              {open===ex.id&&(
                <ol style={{margin:"0 0 8px",paddingLeft:16,fontSize:10,color:T.text2,fontFamily:T.stats,lineHeight:1.6}}>
                  {ex.instructions.map((s,i)=><li key={i} style={{marginBottom:3}}>{s}</li>)}
                </ol>
              )}
              <div style={{display:"flex",gap:6}}>
                <button className="cai-btn cai-btn-ghost" style={{fontSize:9}} onClick={()=>setOpen(open===ex.id?null:ex.id)}>{open===ex.id?"Masquer":"Voir"}</button>
                <button className="cai-btn" style={{fontSize:9,opacity:done?.6:1}} onClick={()=>onComplete(ex)}>{done?"✓ Fait":"Commencer"}</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
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
function MentalPostSession({m,setM,addXp}){
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
