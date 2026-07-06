// PokerForge — Coach outils legacy : MentalView, session coach, defis (extrait de App.jsx, Phase 3.3 bonus)
import React, { useState, useEffect, useRef, useMemo } from "react";
import { T } from "../theme.js";
import { getSuitStyle } from "../components/table/deck.js";
import { shuffle } from "../utils/format.js";
import { loadStats, saveStats, saveStatsSafe, calcPokerIQ, buildDailyProgram } from "../stats.js";
import { SPOTS, LEXIQUE, PROS, ARTICLES } from "../data/content.js";
import { SingleTable } from "./TrainerTab.jsx";

/* ══════════════════════════════════════════════════════════
   DONNÉES MENTAL GAME
══════════════════════════════════════════════════════════ */
const MENTAL_RESOURCES=[
  // ── LIVRES ──
  {type:"📚 Livre",color:"#FFC247",title:"The Mental Game of Poker",author:"Jared Tendler & Barry Carter",
    desc:"LA référence absolue. Tendler, psychologue du sport, décortique les tilt types, les blocages inconscients et propose un système de travail mental structuré. Obligatoire pour tout joueur sérieux.",
    level:"Tous niveaux",url:"https://jaredtendler.com/mental-game-of-poker/",badge:"#1 recommandé"},
  {type:"📚 Livre",color:"#FFC247",title:"The Mental Game of Poker 2",author:"Jared Tendler",
    desc:"Le tome 2 approfondit la confiance, la peur du succès, la motivation long terme et les plateaux de progression. Idéal après avoir intégré le tome 1.",
    level:"Intermédiaire",url:"https://jaredtendler.com/mental-game-of-poker-2/",badge:"Suite essentielle"},
  {type:"📚 Livre",color:"#1F8BFF",title:"Elements of Poker",author:"Tommy Angelo",
    desc:"Un chef-d'œuvre philosophique sur le poker. Angelo introduit le concept d'équanimité — l'état mental neutre qui maximise les décisions. Court, dense, révolutionnaire.",
    level:"Tous niveaux",url:"https://www.tommyangelo.com/elements-of-poker/",badge:"Philosophie du jeu"},
  {type:"📚 Livre",color:"#1F8BFF",title:"Thinking in Bets",author:"Annie Duke",
    desc:"L'ancienne championne WSOP explique comment prendre de meilleures décisions sous incertitude. Sépare la qualité d'une décision de son résultat — fondamental pour gérer les bad beats.",
    level:"Tous niveaux",url:"https://www.annieduke.com/books/",badge:"Décision & résultats"},
  {type:"📚 Livre",color:"#10D87A",title:"Peak Performance",author:"Brad Stulberg & Steve Magness",
    desc:"Comment atteindre et maintenir ses sommets — les mêmes principes que les athlètes d'élite appliqués au poker : cycles stress/récupération, flow, mental pre-performance.",
    level:"Avancé",url:"https://www.peakperformancebook.net/",badge:"Performance élite"},
  {type:"📚 Livre",color:"#9B5CFF",title:"The Biggest Bluff",author:"Maria Konnikova",
    desc:"Psychologue → joueuse professionnelle en 1 an. Suit son parcours avec Negreanu comme coach. Fascinant sur la psychologie de la décision, du tilt et de l'apprentissage.",
    level:"Débutant",url:"https://mariakonnnikova.com/",badge:"Récit immersif"},
  // ── APPS & OUTILS ──
  {type:"📱 Application",color:"#34D8FF",title:"Primed Mind",author:"Fedor Holz (fondateur)",
    desc:"L'application de méditation créée par Fedor Holz spécifiquement pour les joueurs de poker. Sessions guidées : pre-session warm-up (12 min), post-session recovery, gestion du tilt, confiance. Disponible iOS & Android.",
    level:"Tous niveaux",url:"https://www.primedmind.com/",badge:"⭐ App #1 poker"},
  {type:"📱 Application",color:"#34D8FF",title:"Headspace",author:"Andy Puddicombe",
    desc:"Méditation guidée généraliste — base idéale pour développer la pleine conscience appliquable au poker. Le programme 'Sports Performance' est particulièrement adapté.",
    level:"Débutant",url:"https://www.headspace.com/",badge:"Méditation fondation"},
  {type:"📱 Application",color:"#1F8BFF",title:"Calm",author:"Calm.com",
    desc:"Méditations sleep, focus et performance. La section 'High-Stakes Performance' avec des athlètes professionnels est remarquable pour comprendre la gestion du stress compétitif.",
    level:"Tous niveaux",url:"https://www.calm.com/",badge:"Focus & sleep"},
  {type:"📱 Application",color:"#9B5CFF",title:"Wim Hof Method",author:"Wim Hof",
    desc:"Techniques de respiration qui réduisent le cortisol et activent le système nerveux parasympathique. De nombreux pros (Holz inclus) utilisent Wim Hof pour reset le mental entre les sessions.",
    level:"Intermédiaire",url:"https://www.wimhofmethod.com/",badge:"Respiration avancée"},
  // ── PODCASTS & SITES ──
  {type:"🎙️ Podcast",color:"#ff6432",title:"Smart Poker Study",author:"Sky Matsuhashi",
    desc:"Episodes réguliers sur le mental game, la gestion du tilt, la construction de routines. L'épisode 'Stop Tilting Forever' (~200k écoutes) est une ressource incontournable.",
    level:"Tous niveaux",url:"https://smartpokerstudy.com/",badge:"Épisodes mental game"},
  {type:"🌐 Site",color:"#10D87A",title:"Upswing Poker — Mental Game",author:"Upswing Lab",
    desc:"Articles approfondis sur la psychologie du poker par des coaches de renom. La série 'Mental Game Mastery' couvre confiance, tilt, performance sous pression avec des exercices pratiques.",
    level:"Intermédiaire",url:"https://upswingpoker.com/mental-game/",badge:"Articles pro gratuits"},
  {type:"🌐 Site",color:"#FFC247",title:"Jared Tendler Coaching",author:"Jaredtendler.com",
    desc:"Le site officiel du plus grand coach mental poker. Vidéos, articles, webinaires. La section 'Free Resources' contient des outils pratiques (journal template, tilt log).",
    level:"Tous niveaux",url:"https://jaredtendler.com/",badge:"Source originale"},
];

const WARMUP_STEPS=[
  {ico:"😴",title:"Check physique",desc:"T'as bien dormi ? (7h+). Mangé ? Pas d'alcool/substances. Si état physique <6/10, considère une session courte.",time:"1 min"},
  {ico:"📊",title:"Check émotionnel",desc:"Note ton état mental de 1 à 10. En dessous de 6, identifie la cause. Ne joue pas si stressé par quelque chose hors poker.",time:"1 min"},
  {ico:"🎯",title:"Définis ton intention",desc:"Quel est l'objectif de cette session ? Pas 'gagner de l'argent' — mais 'travailler le c-bet sur boards humides' ou '30 mains BTN steal'.",time:"1 min"},
  {ico:"🔍",title:"Révise 3 concepts",desc:"Relis tes notes sur tes 3 derniers leaks. Renforce les patterns dans ta mémoire à court terme avant de jouer.",time:"2 min"},
  {ico:"🌬️",title:"Respiration box breathing",desc:"4s inspiration – 4s rétention – 4s expiration – 4s rétention. Répète 4 cycles. Active le système parasympathique, réduit le cortisol.",time:"3 min"},
  {ico:"📺",title:"Review rapide (optionnel)",desc:"Regarde 10-15 minutes de tes mains de la dernière session. Pas pour t'auto-critiquer — pour réactiver les patterns optimaux.",time:"5 min"},
  {ico:"✅",title:"Confirme les conditions",desc:"Environnement calme ? Téléphone silencieux ? Temps suffisant (pas pressé) ? Tu es prêt à jouer ton A-game.",time:"30 sec"},
];

const TILT_TYPES=[
  {id:"injustice",name:"Tilt d'injustice",ico:"😤",col:"#FF4560",
    desc:"Déclenché par des bad beats, des coolers, des setups. 'Je méritais de gagner ce pot.' Le plus courant.",
    signs:["Bet size qui augmente","Bluffs fréquents","Commentaires sur le luck"],
    fix:"Rappelle-toi : sur 1000 mains similaires, tu gagnes X%. Ce pot en particulier ne compte pas. Reset avec 3 respirations."},
  {id:"entitlement",name:"Tilt d'arrogance",ico:"👑",col:"#FFC247",
    desc:"'Je suis trop bon pour perdre contre ce joueur.' Sous-estimer les adversaires, call stations frustrantes.",
    signs:["Mépris des adversaires","Calls spewy","Finis tes phrases par 'Comment il peut appeler ça?'"],
    fix:"Chaque adversaire peut avoir une bonne raison pour son action. Joue les ranges, pas les jugements de valeur."},
  {id:"mistake",name:"Tilt d'erreur",ico:"😰",col:"#1F8BFF",
    desc:"Déclenché par tes propres erreurs. Spirale auto-critique qui affecte les décisions suivantes.",
    signs:["Replay mental de l'erreur","Hésitations excessives","Jouer trop tight après une erreur"],
    fix:"Tendler : 'Chaque erreur = information sur ton niveau actuel, pas sur ta valeur.' Note l'erreur, oublie-la pendant la session."},
  {id:"desperation",name:"Tilt de désespoir",ico:"📉",col:"#9B5CFF",
    desc:"Après une longue session perdante. Envie de 'récupérer' vite, de chasser les pertes.",
    signs:["Augmentation des stakes","Plus de bluffs","Sessions qui s'allongent anormalement"],
    fix:"Stop-loss strict. Si tu penses à 'récupérer', c'est le signal absolu d'arrêter. Les pertes d'aujourd'hui restent du passé."},
  {id:"fear",name:"Tilt de peur",ico:"😱",col:"#34D8FF",
    desc:"Peur de perdre, peur de l'erreur. Jeu trop passif, over-fold, évitement des confrontations.",
    signs:["Fold systématique face à l'agression","Pas de bluffs","Check-check trop souvent"],
    fix:"Reconnecte-toi à la théorie. Un fold là où tu devais bet/raise = perte directe d'EV. Le risque calculé fait partie du jeu."},
  {id:"revenge",name:"Tilt de revanche",ico:"⚔️",col:"#ff6432",
    desc:"Envie de 'punir' un adversaire spécifique qui t'a battu. Ciblage irrationnel.",
    signs:["Jeu ciblé sur un joueur","Calls non-rentables pour 'avoir raison'","Obsession d'un seat spécifique"],
    fix:"Le villain ne se souvient pas du pot. Traite chaque situation comme une page blanche. Son stack est 100% rattachable par d'autres voies."},
];

const FOCUS_TECHNIQUES=[
  {ico:"🎯",title:"La règle des 3 secondes",
    desc:"Avant chaque décision importante, prends 3 secondes de silence total. Fermez les yeux brièvement. Cette micro-pause active le cortex préfrontal et réduit les décisions émotionnelles.",
    source:"Jared Tendler",level:"Débutant"},
  {ico:"🌬️",title:"Cohérence cardiaque (5-5-5)",
    desc:"5s inspiration – 5s expiration – 5 cycles. Régularise la variabilité de fréquence cardiaque en 3 minutes. Utilisé par les forces spéciales et les athlètes olympiques avant les performances à haute pression.",
    source:"Dr David O'Hare",level:"Tous niveaux"},
  {ico:"🧠",title:"Reset cognitif entre mains",
    desc:"Après une main stressante, dis mentalement 'NEXT' ou 'DONE' pour clore le fichier mental. Les neurosciences montrent que ce trigger verbal aide à empêcher la rumination. Fedor Holz utilise cette technique.",
    source:"Primed Mind / Fedor Holz",level:"Intermédiaire"},
  {ico:"📝",title:"HUD mental — annotation live",
    desc:"Pendant la session, note mentalement (ou sur papier) les situations où tu as ressenti de l'émotion. Pas pour analyser maintenant — juste identifier. Ce meta-awareness réduit l'impact du tilt.",
    source:"Tommy Angelo",level:"Intermédiaire"},
  {ico:"🏃",title:"Pause active entre sessions",
    desc:"10 minutes de marche ou d'exercice physique léger entre les sessions. L'exercice libère du BDNF (facteur neurotrophique) qui améliore la clarté mentale et la résilience émotionnelle.",
    source:"Peak Performance",level:"Tous niveaux"},
  {ico:"🌙",title:"Débrief post-session",
    desc:"5 minutes maximum après chaque session : 1) Qu'est-ce que j'ai bien joué ? 2) Où était mon mental ? 3) Une chose à améliorer. Pas d'analyse de mains — juste le mental. Renforce les bonnes décisions.",
    source:"Jared Tendler",level:"Tous niveaux"},
  {ico:"🎭",title:"Visualisation pre-session",
    desc:"2 minutes les yeux fermés, visualise-toi jouer ton A-game : calme, concentré, faisant les bons folds et les bons calls. L'imagerie mentale active les mêmes circuits neuronaux que l'action réelle.",
    source:"Sports Psychology research",level:"Avancé"},
  {ico:"💤",title:"Sleep hygiene poker",
    desc:"Les études montrent que 1h de sommeil en moins réduit la prise de décision sous incertitude de 12%. Pas de sessions après 23h si tu joues sérieusement. Phil Ivey ne joue jamais fatigué — principe publiquement affirmé.",
    source:"Matthew Walker — Why We Sleep",level:"Fondamental"},
];

function MentalView(){
  const[sub,setSub]=useState("overview");
  const[warmupDone,setWarmupDone]=useState(new Set());
  const[tiltLevel,setTiltLevel]=useState(2);
  const[breathPhase,setBreathPhase]=useState(null); // null|inhale|hold1|exhale|hold2
  const[breathCount,setBreathCount]=useState(0);
  const[breathSec,setBreathSec]=useState(0);
  const[breathCycles,setBreathCycles]=useState(0);
  const breathRef=useRef(null);
  const timerRef=useRef(null);

  // Breathing engine
  useEffect(()=>{
    if(breathPhase===null){clearInterval(timerRef.current);return;}
    setBreathSec(breathPhase==="inhale"||breathPhase==="exhale"?4:breathPhase==="hold1"?4:2);
    let s=breathPhase==="inhale"||breathPhase==="exhale"?4:breathPhase==="hold1"?4:2;
    clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>{
      s--;
      setBreathSec(s);
      if(s<=0){
        clearInterval(timerRef.current);
        setBreathPhase(ph=>{
          if(ph==="inhale")return "hold1";
          if(ph==="hold1")return "exhale";
          if(ph==="exhale")return "hold2";
          // hold2 → inhale, new cycle
          setBreathCycles(c=>c+1);
          return "inhale";
        });
      }
    },1000);
    return()=>clearInterval(timerRef.current);
  },[breathPhase]);

  function startBreath(){setBreathPhase("inhale");setBreathSec(4);setBreathCycles(0);}
  function stopBreath(){setBreathPhase(null);clearInterval(timerRef.current);}

  const breathColors={inhale:"#10D87A",hold1:"#FFC247",exhale:"#1F8BFF",hold2:"#9B5CFF"};
  const breathLabels={inhale:"INSPIRE",hold1:"RETIENS",exhale:"EXPIRE",hold2:"PAUSE"};
  const breathBg={
    inhale:"radial-gradient(circle,rgba(16,216,122,.2) 0%,rgba(16,216,122,.05) 60%,transparent 100%)",
    hold1:"radial-gradient(circle,rgba(255,194,71,.2) 0%,rgba(255,194,71,.05) 60%,transparent 100%)",
    exhale:"radial-gradient(circle,rgba(31,139,255,.2) 0%,rgba(31,139,255,.05) 60%,transparent 100%)",
    hold2:"radial-gradient(circle,rgba(155,92,255,.2) 0%,rgba(155,92,255,.05) 60%,transparent 100%)",
  };
  const breathAnim={
    inhale:{animation:"breatheIn .4s ease forwards"},
    hold1:{transform:"scale(1)"},
    exhale:{animation:"breatheOut .4s ease forwards"},
    hold2:{transform:"scale(.55)"},
  };

  const tiltCol=tiltLevel<=3?"#10D87A":tiltLevel<=6?"#FFC247":tiltLevel<=8?"#ff6432":"#FF4560";
  const tiltLabel=tiltLevel<=2?"🟢 Zen — A-game garanti":tiltLevel<=4?"🟡 Léger stress — reste vigilant":tiltLevel<=6?"🟠 Tilt modéré — ralentis tes décisions":tiltLevel<=8?"🔴 Tilt élevé — fais une pause 10 min":"💥 STOP — Ne joue pas maintenant";

  const menuItems=[
    {id:"overview",ico:"🧠",l:"Vue d'ensemble"},
    {id:"warmup",ico:"🔥",l:"Warm-up pre-session"},
    {id:"breath",ico:"🌬️",l:"Exercices respiration"},
    {id:"tilt",ico:"⚡",l:"Gestion du tilt"},
    {id:"focus",ico:"🎯",l:"Techniques de focus"},
    {id:"resources",ico:"📚",l:"Livres & Apps"},
  ];

  return(
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      {/* Nav latérale */}
      <div style={{width:200,flexShrink:0,background:"#040B1F",borderRight:"1px solid #181825",overflow:"auto",padding:"10px 0"}}>
        <div style={{padding:"10px 14px 6px",fontFamily:T.brand,fontSize:7.5,color:"#4A6090",letterSpacing:".15em"}}>MENTAL GAME</div>
        {menuItems.map(m=>(
          <div key={m.id} onClick={()=>setSub(m.id)}
            style={{padding:"7px 16px",cursor:"pointer",fontSize:10.5,fontFamily:T.stats,fontWeight:600,
              color:sub===m.id?"#FFC247":"#9FB0CC",
              borderLeft:`2px solid ${sub===m.id?"#FFC247":"transparent"}`,
              background:sub===m.id?"rgba(255,194,71,.05)":"transparent",
              transition:"all .12s",display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontSize:13}}>{m.ico}</span>{m.l}
          </div>
        ))}
      </div>

      {/* Contenu */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 24px",background:"#030712"}}>

        {/* ── OVERVIEW ── */}
        {sub==="overview"&&(
          <div style={{maxWidth:760}}>
            <div style={{fontFamily:T.brand,fontSize:13,color:T.gold,letterSpacing:".12em",fontWeight:900,marginBottom:4}}>MENTAL GAME POKER</div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:20}}>Les meilleures ressources mondiales · Techniques validées par les pros</div>

            {/* Citation Tendler */}
            <div style={{background:"linear-gradient(135deg,rgba(255,194,71,.08),rgba(255,194,71,.02))",border:"1px solid rgba(255,194,71,.2)",borderRadius:12,padding:"16px 20px",marginBottom:20}}>
              <div style={{fontStyle:"italic",fontSize:12,color:T.text,fontFamily:T.stats,lineHeight:1.8,marginBottom:8}}>
                "Le jeu mental est la partie la plus sous-travaillée du poker. La plupart des joueurs passent 95% de leur temps d'étude sur la technique et 0% sur ce qui les empêche de l'appliquer à la table."
              </div>
              <div style={{fontSize:9,color:T.gold,fontFamily:T.stats,fontWeight:700}}>— Jared Tendler, The Mental Game of Poker</div>
            </div>

            {/* Pilliers */}
            <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text3,letterSpacing:".1em",marginBottom:10}}>LES 5 PILIERS DU MENTAL GAME</div>
            <div className="mental-grid">
              {[
                {ico:"🔥",title:"Gestion du Tilt",desc:"Identifier, anticiper et neutraliser les 6 types de tilt avant qu'ils affectent tes décisions.",col:"#FF4560",target:"tilt"},
                {ico:"🌬️",title:"Respiration & Calme",desc:"Techniques de cohérence cardiaque et box breathing pour rester dans le présent sous pression.",col:"#10D87A",target:"breath"},
                {ico:"🔥",title:"Warm-up Pre-session",desc:"Routine en 7 étapes pour arriver à table dans ton A-game : physique, mental, technique.",col:"#FFC247",target:"warmup"},
                {ico:"🎯",title:"Focus & Concentration",desc:"Techniques validées par les neurosciences pour maintenir l'attention sur 4-8 heures de jeu.",col:"#1F8BFF",target:"focus"},
                {ico:"📚",title:"Ressources Élite",desc:"Livres, apps et podcasts utilisés par Fedor Holz, Tendler, les meilleures coaches du monde.",col:"#9B5CFF",target:"resources"},
              ].map((p,i)=>(
                <div key={i} className="mental-card" style={{"--mc":p.col}} onClick={()=>setSub(p.target)}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=p.col+"55";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#152D6E";}}>
                  <div style={{fontSize:26,marginBottom:8}}>{p.ico}</div>
                  <div style={{fontFamily:T.brand,fontSize:9,color:p.col,letterSpacing:".08em",fontWeight:700,marginBottom:5}}>{p.title}</div>
                  <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,lineHeight:1.6}}>{p.desc}</div>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${p.col},transparent)`,borderRadius:"12px 12px 0 0"}}/>
                </div>
              ))}
            </div>

            {/* Stats du mental game */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 18px",marginBottom:16}}>
              <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text3,letterSpacing:".12em",marginBottom:12}}>LO QUE DISENT LES ÉTUDES</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  {v:"30-40%",l:"des pertes d'un joueur moyen sont dues au tilt",c:T.red},
                  {v:"12%",l:"de perf en moins après seulement 1h de sommeil en moins",c:T.amber},
                  {v:"3 min",l:"de cohérence cardiaque suffisent pour reset le cortisol",c:T.green},
                  {v:"72h",l:"pour ancrer un nouveau pattern mental selon Tendler",c:T.blue},
                  {v:"21 jours",l:"pour créer une routine de warm-up automatique",c:T.purple},
                  {v:"2x",l:"amélioration de win-rate en travaillant son mental (données Primed Mind)",c:T.cyan},
                ].map((s,i)=>(
                  <div key={i} style={{background:T.surface2,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
                    <div style={{fontFamily:T.brand,fontSize:14,color:s.c,fontWeight:900,marginBottom:3}}>{s.v}</div>
                    <div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,lineHeight:1.5}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── WARM-UP ── */}
        {sub==="warmup"&&(
          <div style={{maxWidth:640}}>
            <div style={{fontFamily:T.brand,fontSize:13,color:T.gold,letterSpacing:".12em",fontWeight:900,marginBottom:4}}>WARM-UP PRÉ-SESSION</div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:6}}>Routine complète en ~12 minutes · Inspiré de Jared Tendler + Primed Mind</div>
            <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginBottom:16,padding:"8px 12px",background:"rgba(255,194,71,.05)",borderRadius:8,border:"1px solid rgba(255,194,71,.12)"}}>
              💡 <strong style={{color:T.gold}}>Pourquoi warm-up ?</strong> 87% des erreurs en début de session viennent d'un état mental non préparé. Fedor Holz déclare ne jamais ouvrir une table sans sa routine de 12 minutes.
            </div>

            {/* Progress */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:10,color:T.text2,fontFamily:T.stats}}>Étapes complétées : <strong style={{color:warmupDone.size===WARMUP_STEPS.length?T.green:T.gold}}>{warmupDone.size}/{WARMUP_STEPS.length}</strong></div>
              <div style={{display:"flex",gap:6}}>
                {warmupDone.size===WARMUP_STEPS.length&&<span style={{fontSize:10,color:T.green,fontFamily:T.stats,fontWeight:700}}>✅ Prêt à jouer !</span>}
                <button onClick={()=>setWarmupDone(new Set())} style={{padding:"3px 10px",borderRadius:20,fontSize:9,fontFamily:T.stats,fontWeight:700,background:"rgba(255,255,255,.05)",color:T.text3,border:`1px solid ${T.border}`,cursor:"pointer"}}>Reset</button>
              </div>
            </div>

            {/* Timer bar total */}
            <div style={{height:4,background:T.surface,borderRadius:2,overflow:"hidden",marginBottom:16}}>
              <div style={{height:"100%",width:`${warmupDone.size/WARMUP_STEPS.length*100}%`,background:`linear-gradient(90deg,${T.amber},${T.green})`,transition:"width .4s",borderRadius:2}}/>
            </div>

            {/* Steps */}
            {WARMUP_STEPS.map((s,i)=>{
              const done=warmupDone.has(i);
              return(
                <div key={i} className={`warmup-step${done?" done":""}`} onClick={()=>{
                  setWarmupDone(prev=>{const next=new Set(prev);done?next.delete(i):next.add(i);return next;});
                }}>
                  <div className="warmup-check">{done?"✓":""}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:3}}>
                      <span style={{fontSize:15}}>{s.ico}</span>
                      <span style={{fontFamily:T.stats,fontSize:11,fontWeight:700,color:done?T.green:T.text}}>{s.title}</span>
                      <span style={{marginLeft:"auto",fontSize:8,color:T.text4,fontFamily:T.stats,fontWeight:600,background:T.surface,padding:"1px 7px",borderRadius:10,border:`1px solid ${T.border}`}}>⏱ {s.time}</span>
                    </div>
                    <div style={{fontSize:9.5,color:done?T.green+"99":T.text3,fontFamily:T.stats,lineHeight:1.65}}>{s.desc}</div>
                  </div>
                </div>
              );
            })}

            <div style={{marginTop:16,padding:"12px 16px",background:"rgba(16,216,122,.06)",border:"1px solid rgba(16,216,122,.18)",borderRadius:10,fontSize:10,color:T.text2,fontFamily:T.stats,lineHeight:1.7}}>
              <span style={{color:T.green,fontWeight:700}}>🏆 Pro tip Holz :</span> "Je fais ma routine même si je ne joue qu'une heure. Le cerveau a besoin du signal que c'est le moment de performer. Sans routine, tu arrives à table dans ton mode 'default' — pas ton mode 'poker'."
            </div>
          </div>
        )}

        {/* ── RESPIRATION ── */}
        {sub==="breath"&&(
          <div style={{maxWidth:560}}>
            <div style={{fontFamily:T.brand,fontSize:13,color:T.green,letterSpacing:".12em",fontWeight:900,marginBottom:4}}>EXERCICES DE RESPIRATION</div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:20}}>Box breathing · Cohérence cardiaque · Wim Hof basics</div>

            {/* Cercle de respiration interactif */}
            <div style={{textAlign:"center",padding:"20px 0",background:"#040B1F",borderRadius:16,border:"1px solid #181825",marginBottom:20,position:"relative"}}>
              <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text3,letterSpacing:".1em",marginBottom:16}}>BOX BREATHING 4-4-4-2</div>

              <div className="breath-circle" style={{
                background:breathPhase?breathBg[breathPhase]:"radial-gradient(circle,rgba(255,255,255,.06),transparent)",
                ...(breathPhase?breathAnim[breathPhase]:{}),
              }} onClick={breathPhase?stopBreath:startBreath}>
                <div className="breath-ring" style={{borderColor:breathPhase?breathColors[breathPhase]:"#1A3A80"}}/>
                {!breathPhase&&(
                  <>
                    <div style={{fontSize:26,marginBottom:4}}>🌬️</div>
                    <div style={{fontFamily:T.brand,fontSize:8,color:T.text3,letterSpacing:".1em"}}>DÉMARRER</div>
                  </>
                )}
                {breathPhase&&(
                  <>
                    <div className="breath-count" style={{color:breathColors[breathPhase]}}>{breathSec}</div>
                    <div className="breath-label" style={{color:breathColors[breathPhase],marginTop:4}}>{breathLabels[breathPhase]}</div>
                  </>
                )}
              </div>

              {breathPhase&&(
                <div style={{marginTop:12,display:"flex",justifyContent:"center",gap:6}}>
                  {[...Array(4)].map((_,i)=>(
                    <div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<breathCycles?T.green:"#152D6E",border:`1px solid ${i<breathCycles?T.green:"#1A3A80"}`,transition:"all .3s"}}/>
                  ))}
                </div>
              )}
              <div style={{marginTop:10,fontSize:9,color:T.text4,fontFamily:T.stats}}>{breathPhase?"Clique pour arrêter":"Clique pour démarrer · 4 cycles recommandés"}</div>
              {breathCycles>=4&&<div style={{marginTop:6,fontSize:10,color:T.green,fontFamily:T.stats,fontWeight:700}}>✅ Session complète — Reset activé</div>}
            </div>

            {/* Guide des techniques */}
            {[
              {name:"Box Breathing (4-4-4-4)",col:"#10D87A",ico:"🟢",
                desc:"4s inspire → 4s retiens → 4s expire → 4s retiens. Technique des Navy SEALs. Équilibre parfait entre activation et calme. Idéal avant une session ou après un bad beat.",
                when:"Avant session · Après bad beat · Avant all-in décision",
                who:"Tim Ferriss, Navy SEALs, Fedor Holz"},
              {name:"Cohérence Cardiaque (5-5)",col:"#1F8BFF",ico:"🔵",
                desc:"5s inspire lentement (diaphragme) → 5s expire lentement. 6 respirations par minute = fréquence de résonance cardiaque. Réduit le cortisol en 3 minutes, améliore la HRV.",
                when:"Pause entre sessions · Journée stressante · En jouant live",
                who:"Dr David O'Hare · Institut HeartMath"},
              {name:"4-7-8 de Andrew Weil",col:"#9B5CFF",ico:"🟣",
                desc:"4s inspire → 7s retiens → 8s expire. Active massivement le système nerveux parasympathique. Très efficace contre le tilt intense. Déconseillé si hyperventilation possible.",
                when:"Tilt avancé · Avant de dormir · Après session difficile",
                who:"Dr Andrew Weil · Pratique ayurvédique"},
              {name:"Wim Hof (basique)",col:"#FFC247",ico:"🟡",
                desc:"30-40 respirations profondes rapides → expiration complète → apnée (sans forcer) → inspiration et rétention 15s. Crée une alcalinisation du sang, boost l'énergie et la clarté mentale.",
                when:"Matin avant session longue · Reset après tilt majeur",
                who:"Wim Hof · Fedor Holz (utilisateur régulier)"},
            ].map((t,i)=>(
              <div key={i} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:14}}>{t.ico}</span>
                  <span style={{fontFamily:T.stats,fontSize:11,fontWeight:700,color:t.col}}>{t.name}</span>
                </div>
                <div style={{fontSize:9.5,color:T.text2,fontFamily:T.stats,lineHeight:1.7,marginBottom:6}}>{t.desc}</div>
                <div style={{display:"flex",gap:12,fontSize:8.5,color:T.text4,fontFamily:T.stats}}>
                  <span>📅 <span style={{color:T.text3}}>{t.when}</span></span>
                </div>
                <div style={{fontSize:8,color:t.col,fontFamily:T.stats,marginTop:4}}>Source : {t.who}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── TILT ── */}
        {sub==="tilt"&&(
          <div style={{maxWidth:720}}>
            <div style={{fontFamily:T.brand,fontSize:13,color:T.red,letterSpacing:".12em",fontWeight:900,marginBottom:4}}>GESTION DU TILT</div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:20}}>6 types de tilt · Signaux d'alarme · Solutions immédiates</div>

            {/* Tilt-o-mètre */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 18px",marginBottom:20}}>
              <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text3,letterSpacing:".1em",marginBottom:10}}>TILT-O-MÈTRE — Mon état actuel</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:8.5,color:T.text3,fontFamily:T.stats,marginBottom:4}}>
                <span>🟢 Zen</span><span>🟡 Alerte</span><span>🔴 Danger</span>
              </div>
              <input type="range" min="0" max="10" value={tiltLevel} onChange={e=>setTiltLevel(+e.target.value)}
                className="tilt-slider" style={{background:`linear-gradient(90deg,${tiltCol} ${tiltLevel*10}%,#152D6E ${tiltLevel*10}%)`}}/>
              <div style={{display:"flex",gap:4}}>
                {[...Array(11)].map((_,i)=>(
                  <div key={i} style={{flex:1,height:4,borderRadius:2,background:i<=tiltLevel?(i<=3?T.green:i<=6?T.amber:i<=8?T.amber:T.red):T.surface3,transition:"background .3s"}}/>
                ))}
              </div>
              <div style={{marginTop:10,padding:"8px 12px",background:`${tiltCol}12`,border:`1px solid ${tiltCol}30`,borderRadius:8,fontFamily:T.stats,fontSize:11,fontWeight:700,color:tiltCol}}>{tiltLabel}</div>
              {tiltLevel>=7&&<div style={{marginTop:8,fontSize:10,color:T.text3,fontFamily:T.stats,lineHeight:1.6}}>👉 Recommandation : <strong style={{color:T.red}}>Arrête la session.</strong> Fais 5-10 min de box breathing, marche 10 min. Rejoue seulement si le niveau descend sous 5.</div>}
            </div>

            {/* Types de tilt */}
            <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text3,letterSpacing:".1em",marginBottom:10}}>LES 6 TYPES DE TILT (Tendler)</div>
            {TILT_TYPES.map((t,i)=>(
              <div key={i} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:18}}>{t.ico}</span>
                  <span style={{fontFamily:T.stats,fontSize:11,fontWeight:700,color:t.col}}>{t.name}</span>
                </div>
                <div style={{fontSize:9.5,color:T.text2,fontFamily:T.stats,lineHeight:1.65,marginBottom:8}}>{t.desc}</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                  {t.signs.map((s,j)=><span key={j} style={{padding:"2px 8px",borderRadius:20,fontSize:8,fontFamily:T.stats,fontWeight:600,background:`${t.col}12`,color:t.col,border:`1px solid ${t.col}25`}}>⚠ {s}</span>)}
                </div>
                <div style={{borderLeft:`2px solid ${t.col}40`,paddingLeft:10,fontSize:9.5,color:T.text3,fontFamily:T.stats,lineHeight:1.65}}>
                  <strong style={{color:T.text2}}>Solution :</strong> {t.fix}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── FOCUS ── */}
        {sub==="focus"&&(
          <div style={{maxWidth:680}}>
            <div style={{fontFamily:T.brand,fontSize:13,color:T.blue,letterSpacing:".12em",fontWeight:900,marginBottom:4}}>TECHNIQUES DE FOCUS</div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:20}}>8 techniques validées · De la neuroscience au poker</div>
            {FOCUS_TECHNIQUES.map((t,i)=>(
              <div key={i} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",marginBottom:10,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,width:3,bottom:0,background:T.blue}}/>
                <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:6}}>
                  <span style={{fontSize:22,flexShrink:0}}>{t.ico}</span>
                  <div>
                    <div style={{fontFamily:T.stats,fontSize:11,fontWeight:700,color:T.text,marginBottom:2}}>{t.title}</div>
                    <div style={{display:"flex",gap:6}}>
                      <span style={{fontSize:8,color:T.blue,fontFamily:T.stats,fontWeight:600,background:"rgba(31,139,255,.1)",padding:"1px 7px",borderRadius:10}}>{t.level}</span>
                      <span style={{fontSize:8,color:T.text4,fontFamily:T.stats}}>Source: {t.source}</span>
                    </div>
                  </div>
                </div>
                <div style={{fontSize:9.5,color:T.text2,fontFamily:T.stats,lineHeight:1.75,paddingLeft:32}}>{t.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── RESSOURCES ── */}
        {sub==="resources"&&(
          <div style={{maxWidth:700}}>
            <div style={{fontFamily:T.brand,fontSize:13,color:T.purple,letterSpacing:".12em",fontWeight:900,marginBottom:4}}>RESSOURCES ÉLITE</div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:6}}>Livres · Applications · Podcasts · Sites</div>
            <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginBottom:20,padding:"8px 12px",background:"rgba(155,92,255,.05)",borderRadius:8,border:"1px solid rgba(155,92,255,.12)"}}>
              💡 Fedor Holz a déclaré lire 2-3 livres/mois sur la performance mentale. Commencer par <strong style={{color:T.gold}}>The Mental Game of Poker Vol.1</strong> est le consensus universel de tous les coaches professionnels.
            </div>
            {["📚 Livre","📱 Application","🎙️ Podcast","🌐 Site"].map(type=>{
              const items=MENTAL_RESOURCES.filter(r=>r.type===type);
              if(!items.length)return null;
              return(
                <div key={type} style={{marginBottom:20}}>
                  <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text3,letterSpacing:".1em",marginBottom:8,padding:"5px 10px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,display:"inline-block"}}>{type}</div>
                  {items.map((r,i)=>(
                    <div key={i} className="res-card">
                      <div className="res-ico" style={{background:`${r.color}15`,border:`1px solid ${r.color}25`,fontSize:20}}>{type.split(" ")[0]}</div>
                      <div style={{flex:1}}>
                        <div className="res-type" style={{color:r.color}}>{r.type}</div>
                        <div className="res-title">{r.title}</div>
                        <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,marginBottom:4}}>— {r.author}</div>
                        <div className="res-sub">{r.desc}</div>
                        <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{padding:"2px 8px",borderRadius:20,fontSize:8,fontWeight:700,fontFamily:T.stats,background:`${r.color}12`,color:r.color,border:`1px solid ${r.color}25`}}>{r.badge}</span>
                          <span style={{fontSize:8.5,color:T.text4,fontFamily:T.stats}}>Niveau : {r.level}</span>
                          <a href={r.url} target="_blank" rel="noreferrer" style={{marginLeft:"auto",fontSize:8.5,color:T.blue,fontFamily:T.stats,textDecoration:"none"}} onClick={e=>e.stopPropagation()}>Visiter →</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Données Théorie ── */

/* ── Coach Session intelligente ── */
function buildCoachSession(stats){
  const leaks=stats?.leaks||[];
  const weakCats=leaks.filter(l=>l.acc<60).map(l=>l.cat);
  let spots=[...SPOTS];
  const weak=spots.filter(s=>weakCats.some(c=>s.cat?.toLowerCase().includes(c.toLowerCase())));
  const other=spots.filter(s=>!weakCats.some(c=>s.cat?.toLowerCase().includes(c.toLowerCase())));
  const session=[...shuffle(weak).slice(0,12),...shuffle(other).slice(0,8)];
  return shuffle(session).slice(0,20);
}

/* ═══════════════════════════════════════════════════════
   POKER IQ — Calcul du score global
════════════════════════════════════════════════════════ */

/* ── Programme du jour personnalisé ── */

/* ── Défi Pro data ── */
const DEFIS_PRO=[
  {pro:"Fedor Holz",hand:"A♦K♦",board:"Q♣J♣T♥",pos:"BTN",villain:"BB",desc:"Vous flopper le nuts. BB check. Quelle est votre action optimale ?",
   proAction:"Bet 35%",proReason:"Bet small avec le nuts pour protéger ma range et extraire des bluffs du villain. Overbet serait readable.",
   opts:["Check","Bet 35%","Bet 75%","Bet PSB"],correct:1,diff:2},
  {pro:"Adrian Mateos",hand:"J♠T♠",board:"8♠9♠2♥",pos:"BTN",villain:"BB",desc:"Flop avec double flush + OESD. BB bet 50%.",
   proAction:"Raise 2.5×",proReason:"Je raise pour extraire quand j'ai l'équité + la priorité. Fold equity sur le turn si manqué.",
   opts:["Fold","Call","Raise 2.5×","Shove"],correct:2,diff:3},
  {pro:"Phil Ivey",hand:"A♠7♣",board:"K♦Q♠2♣",pos:"CO",villain:"BB",desc:"C-bet spot. Board K-high. BB check.",
   proAction:"Bet 33%",proReason:"Board favorable à ma range. C-bet 33% avec A-high comme protection + blockers.",
   opts:["Check","Bet 33%","Bet 75%","Bet PSB"],correct:1,diff:2},
  {pro:"Jason Koon",hand:"K♥K♣",board:"A♦7♣2♠",pos:"BB",villain:"BTN",desc:"Vous avez KK sur un board A-high. BTN bet 50%.",
   proAction:"Call",proReason:"Je call avec KK sur A-high. Raise serait trop fort sans blockers. Je contrôle le pot et vise les turns calmes.",
   opts:["Fold","Call","Raise 2.5×","Shove"],correct:1,diff:2},
  {pro:"Stephen Chidwick",hand:"6♣6♦",board:"A♠K♣Q♥",pos:"BTN",villain:"BB",desc:"Flop A-K-Q. BB check.",
   proAction:"Bet 33%",proReason:"Bet small avec une main faible pour protéger ma range et prendre des pots. Fold si raised.",
   opts:["Check","Bet 33%","Bet 75%","Fold"],correct:1,diff:3},
  {pro:"Davidi Kitai",hand:"A♣5♣",board:"K♥Q♦J♠",pos:"BB",villain:"BTN",desc:"Board dangerous. BTN bet 66%.",
   proAction:"Fold",proReason:"Avec A5o sur KQJ et aucun draw, je fold face au sizing. Ma main ne bloque rien d'utile.",
   opts:["Fold","Call","Raise","Check"],correct:0,diff:2},
];

/* ── CoachTab principal ── */
export default function CoachTab({unit,onGoTrainer}){
  const[view,setView]=useState("home");
  const[artOpen,setArtOpen]=useState(null);
  const[lexSearch,setLexSearch]=useState("");
  const[lexOpen,setLexOpen]=useState(null);
  // Calculateur
  const[pot,setPotVal]=useState(100);
  const[bet,setBetVal]=useState(50);
  const[outs,setOuts]=useState(9);
  const[streets,setStreets]=useState(1);
  const[stack,setStack]=useState(200);
  // Session
  const[sessionQ,setSessionQ]=useState([]);
  const[sessionIdx,setSessionIdx]=useState(0);
  const[sessionRes,setSessionRes]=useState([]);
  const[sessionDone,setSessionDone]=useState(false);
  // Mental game state
  const[mentalChecked,setMentalChecked]=useState(()=>{
    try{const s=localStorage.getItem("pf_mental_today");if(!s)return false;
    const d=JSON.parse(s);return d.date===new Date().toDateString();}catch{return false;}
  });
  const[mentalScores,setMentalScores]=useState({motivation:7,concentration:7,fatigue:3});
  const[mentalSaved,setMentalSaved]=useState(()=>{
    try{const s=localStorage.getItem("pf_mental_today");if(!s)return null;
    const d=JSON.parse(s);return d.date===new Date().toDateString()?d:null;}catch{return null;}
  });
  // Défi Pro
  const[proDefi,setProDefi]=useState(null);
  const[proAnswer,setProAnswer]=useState(null);
  // Lexique mastery
  const[lexMastery,setLexMastery]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("pf_lex_mastery")||"{}");}catch{return{};}
  });
  // Calc quiz
  const[calcQuizMode,setCalcQuizMode]=useState(false);
  const[calcQuizIdx,setCalcQuizIdx]=useState(0);
  const[calcQuizAns,setCalcQuizAns]=useState(null);
  // Theory progress
  const[theoryProgress,setTheoryProgress]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("pf_theory_progress")||"{}");}catch{return{};}
  });

  const stats=loadStats();

  // Calculs cotes
  const callAmt=Number(bet)||0;
  const potAmt=Number(pot)||0;
  const potOddsPct=potAmt+callAmt>0?Math.round(callAmt/(potAmt+callAmt)*100):0;
  const equityPct=Math.min(99,Math.round(Number(outs)*(streets===1?2:4)));
  const spv=Math.round((Number(stack))/(potAmt+callAmt)*10)/10;
  const callEv=equityPct>=potOddsPct;

  // Lexique filtré
  const lexFiltered=LEXIQUE.filter(t=>
    !lexSearch||t.w.toLowerCase().includes(lexSearch.toLowerCase())||
    t.def.toLowerCase().includes(lexSearch.toLowerCase())||
    t.cat.toLowerCase().includes(lexSearch.toLowerCase())
  );
  const lexByLetter={};
  lexFiltered.forEach(t=>{const l=t.w[0].toUpperCase();if(!lexByLetter[l])lexByLetter[l]=[];lexByLetter[l].push(t);});

  // Lancer une session Coach
  function startCoach(){
    const q=buildCoachSession(stats);
    setSessionQ(q);setSessionIdx(0);setSessionRes([]);setSessionDone(false);setView("session");
  }

  // Répondre dans la session
  function coachAnswer(isCorrect,ua){
    setSessionRes(r=>[...r,{spot:sessionQ[sessionIdx],correct:isCorrect,ua}]);
  }
  function coachNext(){
    if(sessionIdx+1>=sessionQ.length)setSessionDone(true);
    else setSessionIdx(i=>i+1);
  }

  const hasLeaks=stats?.leaks?.length>0;
  const pokerIQ=useMemo(()=>calcPokerIQ(stats),[stats.sessions]);
  const dailyProg=useMemo(()=>buildDailyProgram(stats),[stats.sessions]);

  function saveMentalState(){
    const score=Math.round((mentalScores.motivation+mentalScores.concentration+(10-mentalScores.fatigue))/3);
    const rec=score>=7?"intensive":score>=5?"standard":"light";
    const data={date:new Date().toDateString(),scores:mentalScores,score,rec};
    localStorage.setItem("pf_mental_today",JSON.stringify(data));
    setMentalSaved(data);setMentalChecked(true);
  }

  function saveLexMastery(term,level){
    const updated={...lexMastery,[term]:level};
    setLexMastery(updated);
    localStorage.setItem("pf_lex_mastery",JSON.stringify(updated));
  }

  function saveTheoryProgress(module,level){
    const prev=theoryProgress[module];
    // N'accorde l'XP que si on monte de niveau (pas de re-validation)
    if(prev===level)return;
    const updated={...theoryProgress,[module]:level};
    setTheoryProgress(updated);
    localStorage.setItem("pf_theory_progress",JSON.stringify(updated));
    // XP réel accordé
    const xpGain={Débutant:50,Intermédiaire:100,Expert:200}[level]||50;
    const st2=loadStats();
    st2.xp=(st2.xp||0)+xpGain;
    st2.level=Math.max(1,Math.floor(st2.xp/500)+1);
    saveStats(st2);saveStatsSafe(st2);
  }

  // Calculateur quiz data
  const CALC_QUIZZES=[
    {q:"Pot : 20bb · Villain mise : 10bb · Quelle equity minimale pour call ?",opts:["25%","33%","50%","40%"],correct:1,expl:"10/(20+10)=33.3% — pot odds classiques."},
    {q:"Pot : 30bb · 8 outs au flop · 1 street restante — Call profitable ?",opts:["Oui, 16% suffit","Non, 16% < 33%","Oui si implied odds","Toujours fold outs"],correct:1,expl:"8×2=16% equity < ~33% pot odds → fold pur, sauf implies."},
    {q:"SPR = 2 · Main : overpair · Action ?",opts:["Check/fold","Bet grosse valeur","Pot control","All-in direct"],correct:3,expl:"SPR<3 = committé. Avec overpair et SPR=2, shove est optimal."},
    {q:"Pot : 50bb · Villain bet 100bb · Quelle equity pour call ?",opts:["50%","67%","33%","40%"],correct:1,expl:"100/(50+100)=67% — overbet exige une grande equity."},
    {q:"9 outs flush draw + 2 overcards = combien d'outs effectifs ?",opts:["9","11","13","15"],correct:3,expl:"9 (flush) + 6 (overcards probables) = ~15 outs effectifs."},
    {q:"Pot odds : 3:1 → equity minimale pour call ?",opts:["33%","25%","50%","40%"],correct:1,expl:"1/(1+3)=25% — pot odds 3:1 requiert 25% equity."},
  ];

  // ── RENDER ──
  return(
    <div className="coach">
      {/* Nav interne */}
      <div className="coach-nav">
        {[["home","🏠 Accueil"],["session","⚡ Session Coach"],["pros","🏆 Les Pros"],["mental","🧠 Mental Game"],["calcul","📐 Calculateur"],["lexique","📖 Lexique"],["theorie","🎓 Théorie"]].map(([id,lbl])=>(
          <div key={id} className={`coach-ntab${view===id?" on":""}`} onClick={()=>setView(id)}>{lbl}</div>
        ))}
      </div>

      {/* ════════════════════════════
          ── ACCUEIL COACH ──
      ════════════════════════════ */}
      {view==="home"&&(
        <div className="coach-body">
          <div style={{maxWidth:760,margin:"0 auto"}}>

            {/* ── POKER IQ CARD ── */}
            <div style={{
              background:"linear-gradient(135deg,#071B44 0%,#0B2F77 60%,#071B44 100%)",
              border:"1px solid rgba(31,139,255,.35)",
              borderRadius:16,padding:"20px 24px",marginBottom:16,
              boxShadow:"0 8px 40px rgba(31,139,255,.15),inset 0 0 40px rgba(31,139,255,.04)",
              position:"relative",overflow:"hidden",
            }}>
              {/* Glow background */}
              <div style={{position:"absolute",top:-40,right:-40,width:200,height:200,borderRadius:"50%",background:"rgba(31,139,255,.07)",filter:"blur(40px)",pointerEvents:"none"}}/>

              <div style={{display:"flex",alignItems:"center",gap:24,flexWrap:"wrap",position:"relative"}}>
                {/* Score principal */}
                <div style={{textAlign:"center",minWidth:120}}>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:9,color:"#1F8BFF",letterSpacing:".2em",fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Poker IQ</div>
                  <div style={{
                    fontFamily:"'JetBrains Mono',monospace",
                    fontSize:pokerIQ.overall>0?52:36,fontWeight:900,lineHeight:1,
                    color:pokerIQ.overall>0?"#FFFFFF":"#4A6090",
                    textShadow:pokerIQ.overall>0?"0 0 30px rgba(31,139,255,.5)":"none",
                  }}>{pokerIQ.overall>0?pokerIQ.overall:"—"}</div>
                  <div style={{
                    display:"inline-flex",alignItems:"center",gap:5,marginTop:6,
                    padding:"2px 10px",borderRadius:20,
                    background:`${pokerIQ.rankCol}18`,border:`1px solid ${pokerIQ.rankCol}44`,
                    fontFamily:"'Inter',sans-serif",fontSize:10,fontWeight:700,color:pokerIQ.rankCol,
                  }}>{pokerIQ.rank}</div>
                </div>

                {/* Breakdown barres */}
                <div style={{flex:1,minWidth:240}}>
                  {[
                    ["Préflop",pokerIQ.breakdown.preflop,T.blue],
                    ["Postflop",pokerIQ.breakdown.postflop,T.cyan],
                    ["ICM",pokerIQ.breakdown.icm,T.purple],
                    ["Mental",pokerIQ.breakdown.mental,T.green],
                    ["Exploit",pokerIQ.breakdown.exploit,T.gold],
                    ["Théorie",pokerIQ.breakdown.theory,"#9B5CFF"],
                  ].map(([label,score,col])=>(
                    <div key={label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                      <span style={{fontFamily:"'Inter',sans-serif",fontSize:9.5,color:"#9FB0CC",fontWeight:600,minWidth:68}}>{label}</span>
                      <div style={{flex:1,height:5,background:"rgba(255,255,255,.06)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{
                          width:(score||0)+"%",height:"100%",
                          background:`linear-gradient(90deg,${col}88,${col})`,
                          borderRadius:3,transition:"width 1.2s cubic-bezier(.4,0,.2,1)",
                        }}/>
                      </div>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9.5,color:score>70?col:"#6F81A8",fontWeight:700,minWidth:28,textAlign:"right"}}>{score||0}</span>
                    </div>
                  ))}
                </div>

                {/* Infos droite */}
                <div style={{textAlign:"right",minWidth:120}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:9,color:"#6F81A8",lineHeight:1.7}}>{pokerIQ.label}</div>
                  {pokerIQ.overall>0&&(
                    <div style={{marginTop:8,fontFamily:"'Inter',sans-serif",fontSize:8.5,color:"#1F8BFF"}}>
                      {pokerIQ.overall<700?"🎯 Objectif : Régulier (750)":pokerIQ.overall<800?"🎯 Objectif : Grinder (800)":pokerIQ.overall<900?"🎯 Objectif : Elite (900)":"🏆 Top niveau !"}
                    </div>
                  )}
                  {pokerIQ.overall===0&&(
                    <button className="btn btng" style={{marginTop:10,fontSize:10,padding:"6px 14px"}} onClick={startCoach}>
                      🚀 Démarrer
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── COACH IA PERSONNEL ── */}
            <div style={{
              background:"linear-gradient(135deg,rgba(155,92,255,.08),rgba(31,139,255,.06))",
              border:"1px solid rgba(155,92,255,.25)",borderRadius:14,
              padding:"18px 22px",marginBottom:16,
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#9B5CFF,#1F8BFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:"0 0 16px rgba(155,92,255,.35)"}}>🤖</div>
                <div>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:12,fontWeight:700,color:"#FFFFFF"}}>Coach IA Personnel</div>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:"#9FB0CC"}}>Analyse personnalisée de ta progression</div>
                </div>
              </div>

              {stats.sessions===0?(
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:"#9FB0CC",lineHeight:1.8,padding:"10px 14px",background:"rgba(26,58,128,.3)",borderRadius:10,border:"1px solid #1A3A80"}}>
                  <div style={{color:"#FFFFFF",fontWeight:700,marginBottom:6}}>Bienvenue sur PokerForge 👋</div>
                  Lancez votre première session pour que votre Coach IA analyse vos patterns et crée votre programme personnalisé.
                  <div style={{marginTop:12}}><button className="btn btng" style={{fontSize:11}} onClick={startCoach}>🎯 Lancer ma première session</button></div>
                </div>
              ):(
                <>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:"#9FB0CC",lineHeight:1.8,marginBottom:14,padding:"10px 14px",background:"rgba(26,58,128,.2)",borderRadius:10}}>
                    J'ai analysé vos <strong style={{color:"#FFFFFF"}}>{stats.totalSpots||0} derniers spots</strong> sur <strong style={{color:"#FFFFFF"}}>{stats.sessions} sessions</strong>.
                    {dailyProg.mainLeak&&<>
                      <br/>Votre fuite principale actuelle : <strong style={{color:T.red}}>{dailyProg.mainLeak.cat}</strong>
                      <span style={{color:"#9FB0CC"}}> — Précision {dailyProg.mainLeak.acc}%</span>
                    </>}
                    <br/>Gain estimé si corrigé : <strong style={{color:T.green}}>+{dailyProg.gainEstimate} bb/100</strong>
                  </div>

                  {/* Programme du jour */}
                  <div style={{marginBottom:14}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:9.5,color:"#FFC247",letterSpacing:".12em",fontWeight:700,marginBottom:10}}>📋 PROGRAMME DU JOUR — {dailyProg.totalSpots} spots</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {dailyProg.program.map((p,i)=>(
                        <div key={i} style={{
                          flex:1,minWidth:140,padding:"10px 12px",borderRadius:10,
                          background:i===0?"rgba(255,69,96,.1)":i===1?"rgba(31,139,255,.08)":"rgba(155,92,255,.08)",
                          border:`1px solid ${i===0?"rgba(255,69,96,.25)":i===1?"rgba(31,139,255,.2)":"rgba(155,92,255,.2)"}`,
                        }}>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:18,fontWeight:900,color:i===0?T.red:i===1?T.blue:T.purple,marginBottom:2}}>{p.spots}</div>
                          <div style={{fontFamily:"'Inter',sans-serif",fontSize:9.5,color:"#D6E2F5",fontWeight:600}}>{p.label}</div>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:"#6F81A8",marginTop:2}}>{p.score}% actuel</div>
                          {i===0&&<div style={{fontSize:8,color:T.red,marginTop:3,fontFamily:"'Inter',sans-serif",fontWeight:600}}>⚡ PRIORITÉ</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button className="btn btng" style={{fontSize:12,padding:"10px 22px"}} onClick={startCoach}>
                    🎯 Commencer le programme
                  </button>
                </>
              )}
            </div>

            {/* ── CHECK MENTAL DU JOUR ── */}
            {!mentalChecked?(
              <div style={{background:"linear-gradient(135deg,rgba(16,216,122,.07),rgba(31,139,255,.05))",border:"1px solid rgba(16,216,122,.2)",borderRadius:14,padding:"16px 20px",marginBottom:16}}>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,fontWeight:700,color:T.green,marginBottom:12}}>🧠 État mental du jour</div>
                {[["motivation","🔥 Motivation"],["concentration","🎯 Concentration"],["fatigue","😴 Fatigue"]].map(([key,label])=>(
                  <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontFamily:"'Inter',sans-serif",fontSize:10.5,color:"#D6E2F5",minWidth:115}}>{label}</span>
                    <div style={{display:"flex",gap:4}}>
                      {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                        <div key={n} onClick={()=>setMentalScores(s=>({...s,[key]:n}))}
                          style={{width:16,height:16,borderRadius:3,cursor:"pointer",transition:"all .1s",
                            background:n<=mentalScores[key]?(key==="fatigue"?"rgba(255,69,96,.7)":"rgba(16,216,122,.7)"):"rgba(26,58,128,.5)",
                            border:`1px solid ${n<=mentalScores[key]?(key==="fatigue"?"rgba(255,69,96,.4)":"rgba(16,216,122,.4)"):"#152D6E"}`,
                          }}/>
                      ))}
                    </div>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#9FB0CC",minWidth:18}}>{mentalScores[key]}</span>
                  </div>
                ))}
                <button className="btn btng" style={{fontSize:11,marginTop:6}} onClick={saveMentalState}>Valider mon état</button>
              </div>
            ):(
              mentalSaved&&(
                <div style={{background:"rgba(16,216,122,.07)",border:"1px solid rgba(16,216,122,.2)",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:20}}>🧠</span>
                  <div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,fontWeight:600,color:T.green}}>
                      État mental : {mentalSaved.score>=7?"Excellent 🔥":mentalSaved.score>=5?"Correct ✓":"Fatigué — session légère 💤"}
                    </div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:9.5,color:"#9FB0CC",marginTop:2}}>
                      Session recommandée : <strong style={{color:T.blue}}>
                        {mentalSaved.rec==="intensive"?"Session intensive (50+ spots)":mentalSaved.rec==="standard"?"Session standard (20 spots)":"Session légère (10 spots)"}
                      </strong>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* ── CARDS NAVIGATION ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[
                {ico:"⚡",title:"Session Coach IA",desc:"Programme ciblé sur vos leaks. Feedback instantané.",col:T.gold,fn:startCoach},
                {ico:"🏆",title:"Défi des Pros",desc:"Joue un spot comme Holz, Ivey, Mateos. Compare ta réponse.",col:T.green,fn:()=>setView("pros")},
                {ico:"🧠",title:"Mental Game",desc:"Warm-up · Respiration · Anti-tilt · Focus.",col:T.purple,fn:()=>setView("mental")},
                {ico:"📐",title:"Calculateur",desc:"Cotes · Equity · SPR · Quiz rapides.",col:T.cyan,fn:()=>setView("calcul")},
                {ico:"📖",title:"Lexique",desc:"80+ termes avec suivi de maîtrise.",col:"#9B5CFF",fn:()=>setView("lexique")},
                {ico:"🎓",title:"Parcours Théorie",desc:"Modules Préflop → ICM avec déblocage XP.",col:"#34D8FF",fn:()=>setView("theorie")},
              ].map((c,i)=>(
                <div key={i} onClick={c.fn} style={{padding:"14px",borderRadius:12,cursor:"pointer",
                  background:`linear-gradient(135deg,${c.col}0d,${T.surface})`,
                  border:`1px solid ${c.col}33`,transition:"all .18s",
                }}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 8px 24px ${c.col}18`;}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                  <div style={{fontSize:24,marginBottom:6}}>{c.ico}</div>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,color:c.col,fontWeight:700,marginBottom:3}}>{c.title}</div>
                  <div style={{fontSize:9.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SESSION COACH ── */}
      {view==="session"&&!sessionDone&&sessionQ.length>0&&(
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div className="cs-header">
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontFamily:T.brand,fontSize:10,color:T.gold,letterSpacing:".12em"}}>SESSION COACH</span>
              <span style={{fontFamily:T.stats,fontSize:10,color:T.text2}}>{sessionIdx+1} / {sessionQ.length}</span>
              {hasLeaks&&<span style={{fontSize:9,padding:"2px 8px",borderRadius:20,background:T.redDim,color:T.red,fontFamily:T.stats,fontWeight:700,border:`1px solid ${T.red}44`}}>Ciblé sur tes leaks</span>}
              <div style={{marginLeft:"auto",fontFamily:T.stats,fontSize:9.5,color:T.green,fontWeight:700}}>{sessionRes.filter(r=>r.correct).length}/{sessionRes.length} ✓</div>
            </div>
            <div className="cs-prog" style={{marginTop:8}}>
              <div className="cs-progfill" style={{width:`${(sessionIdx/sessionQ.length*100)}%`}}/>
            </div>
          </div>
          {sessionIdx<sessionQ.length&&(
            <div style={{flex:1,overflow:"hidden"}}>
              <SingleTable
                spot={sessionQ[sessionIdx]}
                unit={unit}
                numTables={1}
                showSol={true}
                onAnswer={(ok,ua)=>coachAnswer(ok,ua)}
                onNext={coachNext}
                isLast={sessionIdx===sessionQ.length-1}
              />
            </div>
          )}
        </div>
      )}
      {view==="session"&&!sessionDone&&sessionQ.length===0&&(
        <div className="coach-body" style={{textAlign:"center",paddingTop:60}}>
          <div style={{fontSize:40,marginBottom:12}}>🏋️</div>
          <div style={{fontFamily:T.stats,fontSize:13,color:T.text2}}>Lance d'abord des sessions dans l'Entraîneur GTO pour collecter tes données !</div>
          <button className="btn btng" style={{marginTop:16}} onClick={onGoTrainer}>Aller à l'Entraîneur →</button>
        </div>
      )}
      {view==="session"&&sessionDone&&(
        <div className="coach-body" style={{textAlign:"center",paddingTop:40,maxWidth:500,margin:"0 auto"}}>
          <div style={{fontSize:48,marginBottom:10}}>{sessionRes.filter(r=>r.correct).length/sessionRes.length>=.8?"🏆":sessionRes.filter(r=>r.correct).length/sessionRes.length>=.6?"🎯":"📈"}</div>
          <div style={{fontFamily:T.brand,fontSize:20,color:T.gold,fontWeight:900,marginBottom:4}}>{Math.round(sessionRes.filter(r=>r.correct).length/sessionRes.length*100)}%</div>
          <div style={{fontFamily:T.stats,fontSize:12,color:T.text2,marginBottom:20}}>Session terminée · {sessionRes.length} spots · {sessionRes.filter(r=>r.correct).length} corrects</div>
          {sessionRes.filter(r=>!r.correct).length>0&&(
            <div style={{textAlign:"left",marginBottom:20}}>
              <div style={{fontFamily:T.brand,fontSize:8.5,color:T.red,letterSpacing:".1em",marginBottom:8}}>À RETRAVAILLER</div>
              {sessionRes.filter(r=>!r.correct).slice(0,4).map((r,i)=>(
                <div key={i} style={{padding:"8px 12px",background:T.redDim,border:`1px solid ${T.red}33`,borderRadius:8,marginBottom:5,fontSize:10.5,color:T.text2,fontFamily:T.stats}}>
                  <span style={{color:T.red,marginRight:6}}>✗</span>{r.spot.desc}
                  <span style={{marginLeft:8,fontSize:9,color:T.text3}}>→ {r.spot.acts[r.spot.ok]?.l}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            <button className="btn btng" onClick={startCoach}>Nouvelle session ↺</button>
            <button className="btn btns" onClick={()=>setView("home")}>Retour accueil</button>
          </div>
        </div>
      )}

      {/* ── CALCULATEUR ── */}
      {view==="calcul"&&(
        <div className="coach-body">
          <div style={{maxWidth:560,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <div style={{fontFamily:T.brand,fontSize:14,color:T.cyan,letterSpacing:".12em",fontWeight:900}}>CALCULATEUR GTO</div>
              <button onClick={()=>setCalcQuizMode(m=>!m)} style={{marginLeft:"auto",padding:"5px 14px",borderRadius:20,border:`1px solid ${calcQuizMode?"rgba(52,216,255,.4)":"#1A3A80"}`,background:calcQuizMode?"rgba(52,216,255,.12)":"transparent",color:calcQuizMode?T.cyan:"#9FB0CC",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"'Inter',sans-serif",transition:"all .15s"}}>
                {calcQuizMode?"📐 Calculateur":"🧩 Quiz rapide"}
              </button>
            </div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:16}}>Cotes du pot · Equity · SPR · Implied odds · Quiz</div>

            {/* ── MODE QUIZ ── */}
            {calcQuizMode&&(()=>{
              const q=CALC_QUIZZES[calcQuizIdx%CALC_QUIZZES.length];
              return(
                <div style={{background:"linear-gradient(135deg,rgba(52,216,255,.08),rgba(31,139,255,.05))",border:"1px solid rgba(52,216,255,.25)",borderRadius:14,padding:"20px 22px",marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:9,color:T.cyan,letterSpacing:".15em",fontWeight:700}}>QUIZ #{(calcQuizIdx%CALC_QUIZZES.length)+1}/{CALC_QUIZZES.length}</div>
                    <button onClick={()=>{setCalcQuizIdx(i=>i+1);setCalcQuizAns(null);}} style={{fontSize:9,color:"#6F81A8",background:"transparent",border:"none",cursor:"pointer"}}>Passer →</button>
                  </div>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:600,color:"#FFFFFF",lineHeight:1.6,marginBottom:16}}>{q.q}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                    {q.opts.map((opt,i)=>(
                      <button key={i} onClick={()=>setCalcQuizAns(i)}
                        style={{padding:"10px 14px",borderRadius:10,border:`2px solid ${calcQuizAns===null?"#1A3A80":i===q.correct?"rgba(16,216,122,.5)":calcQuizAns===i?"rgba(255,69,96,.5)":"#152D6E"}`,
                          background:calcQuizAns===null?"#071B44":i===q.correct?"rgba(16,216,122,.1)":calcQuizAns===i?"rgba(255,69,96,.1)":"#071B44",
                          color:calcQuizAns===null?"#D6E2F5":i===q.correct?T.green:calcQuizAns===i?T.red:"#4A6090",
                          fontFamily:"'Inter',sans-serif",fontSize:11,fontWeight:600,cursor:"pointer",textAlign:"left",transition:"all .15s"}}>
                        {calcQuizAns!==null&&i===q.correct&&"✓ "}{opt}
                      </button>
                    ))}
                  </div>
                  {calcQuizAns!==null&&(
                    <div style={{padding:"10px 14px",background:"rgba(26,58,128,.3)",borderRadius:8,borderLeft:"3px solid #1F8BFF",fontFamily:"'Inter',sans-serif",fontSize:10.5,color:"#D6E2F5",lineHeight:1.7}}>
                      💡 {q.expl}
                      <button onClick={()=>{setCalcQuizIdx(i=>i+1);setCalcQuizAns(null);}} className="btn btng" style={{marginLeft:12,fontSize:10,padding:"4px 12px"}}>Question suivante →</button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Cotes du pot */}
            <div className="calc-card">
              <div style={{fontFamily:T.brand,fontSize:9,color:T.gold,letterSpacing:".12em",marginBottom:14}}>COTE DU POT</div>
              <div className="calc-row">
                <span className="calc-label">Taille du pot ($)</span>
                <input className="calc-input" type="number" min="0" value={pot} onChange={e=>setPotVal(e.target.value)}/>
              </div>
              <div className="calc-row">
                <span className="calc-label">Mise à payer ($)</span>
                <input className="calc-input" type="number" min="0" value={bet} onChange={e=>setBetVal(e.target.value)}/>
              </div>
              <div className="calc-result">
                <div style={{display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
                  <div>
                    <div className="calc-big" style={{color:T.gold}}>{potOddsPct}%</div>
                    <div style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>Cote du pot</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,marginBottom:4}}>Equity minimum requise pour un call profitable</div>
                    <div style={{fontSize:10,color:T.text3,fontFamily:T.mono}}>= {bet} / ({pot} + {bet}) = {potOddsPct}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Equity & Outs */}
            <div className="calc-card">
              <div style={{fontFamily:T.brand,fontSize:9,color:T.cyan,letterSpacing:".12em",marginBottom:14}}>EQUITY PAR OUTS</div>
              <div className="calc-row">
                <span className="calc-label">Nombre d'outs</span>
                <input className="calc-input" type="number" min="0" max="20" value={outs} onChange={e=>setOuts(e.target.value)}/>
                <div style={{display:"flex",gap:4}}>
                  {[[9,"Flush"],[8,"OESD"],[6,"Trips"],[4,"2 pairs"],[2,"Overcards"]].map(([n,l])=>(
                    <button key={n} className="btn btns" style={{fontSize:8.5,padding:"3px 7px"}} onClick={()=>setOuts(n)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="calc-row">
                <span className="calc-label">Streets restantes</span>
                <div style={{display:"flex",gap:5}}>
                  {[[1,"1 (turn ou river)"],[2,"2 (turn + river)"]].map(([n,l])=>(
                    <button key={n} className={`btn ${streets===n?"btng":"btns"}`} style={{fontSize:10}} onClick={()=>setStreets(n)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="calc-result">
                <div style={{display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
                  <div>
                    <div className="calc-big" style={{color:T.cyan}}>{equityPct}%</div>
                    <div style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>Equity estimée</div>
                  </div>
                  <div style={{flex:1}}>
                    <div className="calc-verdict" style={{color:callEv?T.green:T.red}}>
                      {callEv?`✓ CALL +EV (${equityPct}% > ${potOddsPct}%)`:`✗ FOLD -EV (${equityPct}% < ${potOddsPct}%)`}
                    </div>
                    <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,marginTop:3}}>Règle des outs : ×{streets===1?"2":"4"} (approximation)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* SPR */}
            <div className="calc-card">
              <div style={{fontFamily:T.brand,fontSize:9,color:T.purple,letterSpacing:".12em",marginBottom:14}}>SPR — STACK TO POT RATIO</div>
              <div className="calc-row">
                <span className="calc-label">Stack effectif ($)</span>
                <input className="calc-input" type="number" min="0" value={stack} onChange={e=>setStack(e.target.value)}/>
              </div>
              <div className="calc-result">
                <div style={{display:"flex",gap:24,alignItems:"center"}}>
                  <div>
                    <div className="calc-big" style={{color:T.purple}}>{spv}</div>
                    <div style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>SPR</div>
                  </div>
                  <div style={{flex:1,fontFamily:T.stats,fontSize:11,color:T.text2,lineHeight:1.8}}>
                    {spv<2?"🔴 SPR bas → All-in avec top pair ou mieux":spv<5?"🟡 SPR moyen → Deux pairs minimum pour stackoff":spv<10?"🟢 SPR normal → Pot control, set+ pour stackoff":"🔵 SPR profond → Pot control, nuts uniquement"}
                  </div>
                </div>
              </div>
            </div>

            {/* Référence rapide */}
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 18px"}}>
              <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text3,letterSpacing:".12em",marginBottom:10}}>RÉFÉRENCE RAPIDE</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[["Flush draw","9 outs ~18%"],["OESD","8 outs ~16%"],["Gutshot","4 outs ~8%"],["Overcards","6 outs ~12%"],["Set vs overpair","2 outs ~4%"],["Pair vs overpair","5 outs ~10%"]].map(([s,v])=>(
                  <div key={s} style={{display:"flex",justifyContent:"space-between",padding:"5px 9px",background:T.surface2,borderRadius:6,fontSize:10,fontFamily:T.stats}}>
                    <span style={{color:T.text2}}>{s}</span>
                    <span style={{color:T.cyan,fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LEXIQUE ── */}
      {view==="lexique"&&(
        <div className="coach-body">
          <div style={{maxWidth:680,margin:"0 auto"}}>
            <div style={{fontFamily:T.brand,fontSize:14,color:T.purple,letterSpacing:".12em",fontWeight:900,marginBottom:4}}>LEXIQUE POKER</div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:12}}>{LEXIQUE.length} termes · GTO · Stratégie · Stats · Tournois</div>
            <input className="lex-search" placeholder="🔍 Rechercher un terme…" value={lexSearch} onChange={e=>setLexSearch(e.target.value)}/>
            {Object.keys(lexByLetter).sort().map(letter=>(
              <div key={letter}>
                <div className="lex-letter">— {letter} —</div>
                {lexByLetter[letter].map(term=>{
                  const mastery=lexMastery[term.w]||null;
                  const masteryStyle={
                    null:{l:"",col:"#4A6090",bg:"transparent"},
                    "À revoir":{l:"À revoir",col:T.amber,bg:"rgba(255,194,71,.1)"},
                    "Compris":{l:"Compris",col:T.blue,bg:"rgba(31,139,255,.1)"},
                    "Maîtrisé":{l:"Maîtrisé ✓",col:T.green,bg:"rgba(16,216,122,.1)"},
                  }[mastery]||{l:"",col:"#4A6090",bg:"transparent"};
                  return(
                    <div key={term.w} className={`lex-term${lexOpen===term.w?" open":""}`} onClick={()=>setLexOpen(lexOpen===term.w?null:term.w)}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span className="lex-word">{term.w}</span>
                        <span className="lex-tag">{term.tag}</span>
                        {mastery&&<span style={{fontSize:8,padding:"1px 7px",borderRadius:20,background:masteryStyle.bg,color:masteryStyle.col,border:`1px solid ${masteryStyle.col}44`,fontFamily:"'Inter',sans-serif",fontWeight:700}}>{masteryStyle.l}</span>}
                        <span style={{marginLeft:"auto",fontSize:10,color:T.text3}}>{lexOpen===term.w?"▲":"▼"}</span>
                      </div>
                      {lexOpen===term.w&&(
                        <>
                          <div className="lex-def">{term.def}</div>
                          {term.ex&&<div className="lex-ex">💡 {term.ex}</div>}
                          {/* Mastery buttons */}
                          <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}} onClick={e=>e.stopPropagation()}>
                            <span style={{fontFamily:"'Inter',sans-serif",fontSize:9,color:"#6F81A8",alignSelf:"center"}}>Niveau :</span>
                            {["À revoir","Compris","Maîtrisé"].map(lvl=>{
                              const active=mastery===lvl;
                              const lCol=lvl==="Maîtrisé"?T.green:lvl==="Compris"?T.blue:T.amber;
                              return<button key={lvl} onClick={()=>saveLexMastery(term.w,active?null:lvl)}
                                style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${active?lCol+"66":"#1A3A80"}`,
                                  background:active?`${lCol}18`:"transparent",
                                  color:active?lCol:"#6F81A8",
                                  fontFamily:"'Inter',sans-serif",fontSize:9,fontWeight:600,cursor:"pointer",transition:"all .12s"}}>
                                {lvl}
                              </button>;
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── THÉORIE ── */}
      {/* ── VUE PROS ── */}
      {view==="pros"&&(
        <div className="coach-body">
          {/* Hero banner + Défi Pro CTA */}
          <div style={{textAlign:"center",padding:"20px 0 16px",background:"linear-gradient(180deg,rgba(255,194,71,.05) 0%,transparent 100%)"}}>
            <div style={{fontFamily:T.brand,fontSize:20,color:T.gold,letterSpacing:".15em",fontWeight:900,textShadow:`0 0 30px ${T.goldGlow}`}}>LES LÉGENDES DU CIRCUIT</div>
            <div style={{fontSize:11,color:T.text2,fontFamily:T.stats,marginTop:6}}>Mains emblématiques · Styles de jeu · Leçons des meilleurs joueurs actuels</div>
            {/* Défi Pro button */}
            <div style={{marginTop:12,marginBottom:4}}>
              <button className="btn btng" style={{fontSize:12,padding:"9px 22px",background:"linear-gradient(135deg,#FFC247,#FF8C00)"}} onClick={()=>{
                const idx=Math.floor(Math.random()*DEFIS_PRO.length);
                setProDefi(idx);setProAnswer(null);setView("defi");
              }}>
                🏆 Défi Pro — Jouez comme les meilleurs
              </button>
            </div>
            <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>
              {[["$186M+","Gains combinés"],["14","Bracelets WSOP"],["6","Légendes actives"],["#1","Best in the world"]].map(([v,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontFamily:T.brand,fontSize:16,color:T.gold,fontWeight:900}}>{v}</div>
                  <div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,letterSpacing:".06em",textTransform:"uppercase"}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="pros-grid" style={{maxWidth:1100,margin:"0 auto",padding:"0 4px 20px"}}>
            {PROS.map(pro=>{
              const open=artOpen===pro.id;
              return(
                <div key={pro.id} className={`pro-card${open?" open":""}`} onClick={()=>setArtOpen(open?null:pro.id)}>
                  {/* Banner */}
                  <div className="pro-card-banner" style={{background:pro.bg}}>
                    <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 40%,rgba(0,0,0,.5))",pointerEvents:"none"}}/>
                    <div className="pro-avatar" style={{background:`${pro.color}20`,borderColor:pro.color,color:pro.color}}>{pro.init}</div>
                    <div className="pro-info">
                      <div className="pro-name">{pro.name}</div>
                      <div className="pro-title">{pro.nickname} · {pro.origin}</div>
                    </div>
                    <div className="pro-nat">{pro.nat}</div>
                    <div style={{position:"absolute",bottom:8,right:12,fontSize:14,color:pro.color,transition:"transform .2s",transform:open?"rotate(180deg)":"rotate(0)"}}>▼</div>
                  </div>

                  {/* Stats */}
                  <div className="pro-stats-row">
                    <div className="pro-stat">
                      <div className="pro-stat-v" style={{color:pro.color}}>{pro.earnings}</div>
                      <div className="pro-stat-l">Live earnings</div>
                    </div>
                    <div className="pro-stat">
                      <div className="pro-stat-v" style={{color:T.gold}}>{pro.bracelets}</div>
                      <div className="pro-stat-l">Bracelets</div>
                    </div>
                    <div className="pro-stat" style={{flex:2}}>
                      <div className="pro-stat-v" style={{color:T.text2,fontSize:9}}>{pro.rank}</div>
                      <div className="pro-stat-l">Palmarès</div>
                    </div>
                  </div>

                  {/* Corps toujours visible */}
                  <div className="pro-body">
                    {/* Style tags */}
                    <div style={{marginBottom:8}}>
                      {pro.style.map((s,i)=>(
                        <span key={i} className="pro-style-tag" style={{background:`${pro.styleCols[i]}15`,color:pro.styleCols[i],border:`1px solid ${pro.styleCols[i]}30`}}>{s}</span>
                      ))}
                    </div>
                    <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,lineHeight:1.65}}>{pro.bio.slice(0,120)}...</div>
                  </div>

                  {/* Corps étendu au clic */}
                  {open&&(
                    <div style={{padding:"0 14px 14px"}} onClick={e=>e.stopPropagation()}>
                      <div style={{fontSize:10,color:T.text2,fontFamily:T.stats,lineHeight:1.75,marginBottom:12}}>{pro.bio}</div>

                      {/* Main emblématique */}
                      <div className="pro-hand">
                        <div className="pro-hand-title">🃏 MAIN EMBLÉMATIQUE — {pro.hand.title}</div>
                        <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontFamily:T.mono,fontSize:13,color:pro.color,fontWeight:700}}>{pro.hand.cards}</span>
                          <span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>vs</span>
                          <span style={{fontSize:9,color:T.cyan,fontFamily:T.mono,fontWeight:700}}>{pro.hand.board}</span>
                        </div>
                        <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,lineHeight:1.7,marginBottom:6}}>{pro.hand.setup}</div>
                        <div style={{fontSize:9.5,color:T.text2,fontFamily:T.stats,lineHeight:1.75,borderLeft:`2px solid ${pro.color}40`,paddingLeft:8,marginBottom:8}}>{pro.hand.action}</div>
                        <div style={{display:"flex",gap:6,padding:"6px 8px",background:T.surface,borderRadius:6,alignItems:"flex-start"}}>
                          <span style={{fontSize:14,flexShrink:0}}>🔑</span>
                          <span style={{fontSize:10,color:pro.color,fontFamily:T.stats,fontWeight:700,lineHeight:1.6}}>{pro.hand.lesson}</span>
                        </div>
                      </div>

                      {/* Achievements */}
                      <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:4}}>
                        {pro.achievements.map((a,i)=>(
                          <span key={i} style={{padding:"2px 8px",borderRadius:20,fontSize:8,fontFamily:T.stats,fontWeight:600,background:T.surface,color:T.text3,border:`1px solid ${T.border}`}}>✦ {a}</span>
                        ))}
                      </div>

                      {/* Quote */}
                      <div className="pro-quote">"{pro.quote}"<br/><span style={{fontSize:8,color:T.text4,fontStyle:"normal",marginTop:4,display:"block"}}>— {pro.name}</span></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view==="mental"&&<MentalView/>}

      {/* ════════════════════════════
          ── DÉFI PRO (dans vue pros, affiché via bouton) ──
      ════════════════════════════ */}
      {view==="defi"&&(
        <div className="coach-body">
          <div style={{maxWidth:600,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <button className="btn btns" style={{fontSize:11}} onClick={()=>{setView("pros");setProDefi(null);setProAnswer(null);}}>← Retour</button>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:800,color:"#FFC247"}}>🏆 Défi Pro</div>
            </div>
            {proDefi&&(()=>{
              const d=DEFIS_PRO[proDefi];
              return(
                <div>
                  {/* Header pro */}
                  <div style={{background:"linear-gradient(135deg,rgba(255,194,71,.1),rgba(31,139,255,.06))",border:"1px solid rgba(255,194,71,.25)",borderRadius:14,padding:"16px 20px",marginBottom:16,display:"flex",gap:14,alignItems:"center"}}>
                    <div style={{width:50,height:50,borderRadius:12,background:"rgba(255,194,71,.15)",border:"2px solid rgba(255,194,71,.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>👑</div>
                    <div>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:700,color:"#FFC247"}}>{d.pro}</div>
                      <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:"#9FB0CC",marginTop:2}}>Comment jouerait-il ce spot ?</div>
                    </div>
                  </div>

                  {/* Spot */}
                  <div style={{background:"#071B44",border:"1px solid #1A3A80",borderRadius:12,padding:"16px 20px",marginBottom:16}}>
                    <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
                      {/* Hand */}
                      {d.hand.split("").reduce((acc,ch,i,arr)=>{
                        if(["♠","♥","♦","♣"].includes(ch)){acc.push(d.hand.slice(0,i).replace(/[♠♥♦♣]/g,"")+ch);return acc;}
                        return acc;
                      },[]).map((c,ci)=>{
                        const rank=c.slice(0,-1),suit=c.slice(-1);
                        const sc=getSuitStyle(suit);
                        return<div key={ci} className="card card-md" style={{background:sc.bg,border:`1px solid ${sc.border}`,boxShadow:`0 0 8px ${sc.glow}`}}>
                          <div className="card-corner"><span className="card-corner-r" style={{color:sc.color}}>{rank}</span><span className="card-corner-s" style={{color:sc.color}}>{suit}</span></div>
                          <div className="card-center" style={{color:sc.color}}>{suit}</div>
                        </div>;
                      })}
                      <div style={{marginLeft:8}}>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:"#9FB0CC"}}>{d.pos} vs {d.villain}</div>
                      </div>
                    </div>
                    {/* Board */}
                    {d.board&&(
                      <div style={{display:"flex",gap:5,marginBottom:12}}>
                        {d.board.split(" ").map((c,ci)=>{
                          const rank=c.slice(0,-1),suit=c.slice(-1);
                          const sc=getSuitStyle(suit);
                          return<div key={ci} className="card card-sm" style={{background:sc.bg,border:`1px solid ${sc.border}`}}>
                            <div className="card-corner"><span className="card-corner-r" style={{color:sc.color,fontSize:9}}>{rank}</span><span className="card-corner-s" style={{color:sc.color,fontSize:7}}>{suit}</span></div>
                          </div>;
                        })}
                      </div>
                    )}
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:11.5,color:"#D6E2F5",lineHeight:1.7}}>{d.desc}</div>
                  </div>

                  {/* Réponse */}
                  {!proAnswer?(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {d.opts.map((opt,i)=>(
                        <button key={i} onClick={()=>setProAnswer(i)}
                          className={`gto-btn gto-btn-${i===0?"FOLD":i===1?"CALL":i===2?"RAISE":"ALLIN"}`}
                          style={{borderRadius:11}}>
                          <div className="gto-btn-inner"><span className="gto-btn-label">{opt}</span></div>
                        </button>
                      ))}
                    </div>
                  ):(
                    <div>
                      {/* Résultat */}
                      <div style={{
                        background:proAnswer===d.correct?"rgba(16,216,122,.08)":"rgba(255,69,96,.08)",
                        border:`1px solid ${proAnswer===d.correct?"rgba(16,216,122,.3)":"rgba(255,69,96,.3)"}`,
                        borderRadius:12,padding:"14px 18px",marginBottom:14,
                      }}>
                        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                          <span style={{fontSize:20}}>{proAnswer===d.correct?"✅":"❌"}</span>
                          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:700,color:proAnswer===d.correct?T.green:T.red}}>
                            {proAnswer===d.correct?"Comme le pro !":"Différent du pro"}
                          </span>
                        </div>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:"#D6E2F5",marginBottom:8}}>
                          <strong style={{color:"#FFC247"}}>{d.pro}</strong> joue : <strong style={{color:T.green}}>{d.proAction}</strong>
                        </div>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:10.5,color:"#9FB0CC",lineHeight:1.75,padding:"8px 10px",background:"rgba(26,58,128,.3)",borderRadius:8,borderLeft:"3px solid #1F8BFF"}}>
                          💬 "{d.proReason}"
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button className="btn btng" style={{flex:1,fontSize:12}} onClick={()=>{
                          const next=(proDefi+1)%DEFIS_PRO.length;
                          setProDefi(next);setProAnswer(null);
                        }}>Défi suivant ▶</button>
                        <button className="btn btns" onClick={()=>{setProAnswer(null);}}>↺ Rejouer</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════
          ── CALCULATEUR avec quiz ──
      ════════════════════════════ */}

      {view==="theorie"&&(
        <div className="coach-body">
          <div style={{maxWidth:700,margin:"0 auto"}}>
            <div style={{fontFamily:T.brand,fontSize:14,color:T.blue,letterSpacing:".12em",fontWeight:900,marginBottom:4}}>THÉORIE & PARCOURS D'APPRENTISSAGE</div>
            <div style={{fontSize:10.5,color:T.text3,fontFamily:T.stats,marginBottom:14}}>Articles approfondis · Mains emblématiques · Déblocage XP</div>

            {/* Parcours d'apprentissage */}
            {(()=>{
              const modules=[
                {id:"preflop",label:"Ranges Préflop",ico:"🎯",levels:["Débutant","Intermédiaire","Expert"],col:T.blue,xp:[50,100,200]},
                {id:"postflop",label:"Stratégie Postflop",ico:"🃏",levels:["Débutant","Intermédiaire","Expert"],col:T.cyan,xp:[50,100,200]},
                {id:"icm",label:"ICM & Tournois",ico:"🏆",levels:["Débutant","Intermédiaire","Expert"],col:T.gold,xp:[75,150,300]},
                {id:"mental",label:"Mental Game",ico:"🧠",levels:["Débutant","Intermédiaire","Expert"],col:T.purple,xp:[50,100,200]},
              ];
              const totalXP=Object.entries(theoryProgress).reduce((sum,[,lvl])=>{
                return sum+(lvl==="Expert"?300:lvl==="Intermédiaire"?100:50);
              },0);
              return(
                <div style={{background:"linear-gradient(135deg,rgba(31,139,255,.07),rgba(155,92,255,.05))",border:"1px solid rgba(31,139,255,.2)",borderRadius:14,padding:"16px 20px",marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,color:T.blue,fontWeight:700,letterSpacing:".12em"}}>📚 PARCOURS D'APPRENTISSAGE</div>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.gold}}>⚡ {totalXP} XP débloqués</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {modules.map(mod=>{
                      const current=theoryProgress[mod.id]||null;
                      const levelIdx=current?mod.levels.indexOf(current)+1:0;
                      return(
                        <div key={mod.id} style={{background:`${mod.col}0a`,border:`1px solid ${mod.col}22`,borderRadius:10,padding:"12px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <span style={{fontSize:18}}>{mod.ico}</span>
                            <span style={{fontFamily:"'Inter',sans-serif",fontSize:10.5,fontWeight:600,color:"#D6E2F5"}}>{mod.label}</span>
                          </div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {mod.levels.map((lvl,li)=>{
                              const unlocked=li<levelIdx;
                              const active=li===levelIdx-1;
                              return<button key={lvl} onClick={()=>saveTheoryProgress(mod.id,unlocked&&active?null:lvl)}
                                style={{padding:"3px 9px",borderRadius:20,border:`1px solid ${unlocked?`${mod.col}55`:"#152D6E"}`,
                                  background:active?`${mod.col}20`:unlocked?"rgba(255,255,255,.03)":"transparent",
                                  color:active?mod.col:unlocked?"#9FB0CC":"#4A6090",
                                  fontFamily:"'Inter',sans-serif",fontSize:8.5,fontWeight:600,cursor:"pointer",transition:"all .12s"}}>
                                {unlocked?"✓ ":""}{lvl} {!unlocked&&li===levelIdx?<span style={{color:T.gold,fontSize:7.5}}>(+{mod.xp[li]}XP)</span>:""}
                              </button>;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {ARTICLES.map(art=>(
              <div key={art.id} className={`art-card${artOpen===art.id?" open":""}`} onClick={()=>setArtOpen(artOpen===art.id?null:art.id)}>
                <div className="art-banner" style={{background:`linear-gradient(90deg,${art.color}15,${T.surface2})`}}>
                  <span className="art-ico">{art.ico}</span>
                  <div>
                    <div className="art-title">{art.title}</div>
                    <div className="art-sub">{art.sub}</div>
                  </div>
                  <div className="art-diff" style={{
                    background:art.diff==="Débutant"?T.greenDim:art.diff==="Intermédiaire"?T.goldDim:T.purpleDim,
                    color:art.diff==="Débutant"?T.green:art.diff==="Intermédiaire"?T.gold:T.purple,
                    border:`1px solid ${art.diff==="Débutant"?T.green+"44":art.diff==="Intermédiaire"?T.gold+"44":T.purple+"44"}`,
                  }}>{art.diff}</div>
                  <span style={{marginLeft:8,color:T.text3,fontSize:14,transition:"transform .2s",display:"inline-block",transform:artOpen===art.id?"rotate(90deg)":"rotate(0)"}}>{artOpen===art.id?"▼":"▶"}</span>
                </div>
                {artOpen===art.id&&(
                  <div className="art-body" onClick={e=>e.stopPropagation()}>
                    {art.sections.map((s,i)=>(
                      <div key={i}>
                        <div className="art-section">{s.h.toUpperCase()}</div>
                        <div className="art-p" dangerouslySetInnerHTML={{__html:s.p.replace(/<strong>/g,`<strong style="color:#FFFFFF">`)}}/>
                      </div>
                    ))}
                    {/* Main emblématique */}
                    <div className="art-hand">
                      <div className="art-hand-title">🃏 MAIN EMBLÉMATIQUE : {art.hand.title}</div>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
                        <span style={{fontFamily:T.stats,fontSize:10,color:T.text3}}>Main :</span>
                        <span style={{fontFamily:T.mono,fontSize:12,color:T.gold,fontWeight:700}}>{art.hand.cards}</span>
                        <span style={{fontFamily:T.stats,fontSize:10,color:T.text3,marginLeft:8}}>Board :</span>
                        <span style={{fontFamily:T.mono,fontSize:11,color:T.cyan}}>{art.hand.board}</span>
                      </div>
                      <div className="art-key">
                        <span style={{fontSize:11,marginRight:4}}>🔑</span>
                        <span style={{fontFamily:T.stats,fontSize:11,color:T.gold,fontWeight:700}}>{art.hand.key}</span>
                      </div>
                      <a href={art.hand.url} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:8,fontSize:9.5,color:T.blue,fontFamily:T.stats}}>Lire l'analyse complète →</a>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
