import { CSS, CSS_TABLE } from "./styles.js";
import { CARD_DECKS, getSuitStyle, getActiveDeck, setActiveDeckKey } from "./components/table/deck.js";
import { Card, CardBack, HeroHoleCards, VillainBackCards, CardFlip, MiniCard } from "./components/table/Cards.jsx";
import { BlindChipStack, TrainingPotStack, SeatActionZone, PlayerSeat, CHIP_THEMES } from "./components/table/Chips.jsx";
import { roundBb, shuffle } from "./utils/format.js";
import { trainerAvatarKey, trainerSeatAvatarProfile, PlayerAvatarPremium } from "./components/table/Avatars.jsx";
import { T } from "./theme.js";
import LibraryTab from "./tabs/LibraryTab.jsx";
import MentalGameTab from "./tabs/MentalGameTab.jsx";
import PracticedHands, { TrainerReviewPanel, appendPlayedSpot, loadPlayedSpots, buildTrainerReview } from "./tabs/PracticedHands.jsx";
import DashboardTab from "./tabs/DashboardTab.jsx";
import SharkSolverTab, { buildScenarioFromTrainerParams } from "./tabs/SharkSolverTab.jsx";
import { STATS_DEFAULT, loadStats, saveStats, loadHistory, calcPokerIQ, buildDailyProgram, loadHands, saveHands, saveStatsSafe } from "./stats.js";
import CoachAITab, { CoachFloatingButton, buildEventPreparation, saveCoachEvent } from "./tabs/CoachAITab.jsx";
import ReplayerTab from "./tabs/ReplayerTab.jsx";
import { SPOTS, POKER_EVENTS, LEXIQUE, PROS, MENTAL_CONTENT, ARTICLES, POSITIONS_BY_SIZE } from "./data/content.js";
import TrainerTab, { RangeGrid, RangePopup, SingleTable } from "./tabs/TrainerTab.jsx";
import { vibrate, VIB } from "./utils/ui.js";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { getSyncId, setSyncId, pfCloudPull, pfCloudPushAll, getCloudStatus, pfFetchNews } from "./cloud.js";
import { analyzeHandHistory, parseSessionText } from "./coachEngine.js";
import { CoachAIOrchestrator, VILLAIN_PROFILES as CE_VILLAIN_PROFILES, FIELDS as CE_FIELDS } from "./coachAgents.js";
import { signUp as authSignUp, signIn as authSignIn, signInOAuth, signOut as authSignOut, getSession as authGetSession, onAuthChange, fetchProfile as authFetchProfile, resetPassword as authResetPassword, usernameAvailable as authUsernameAvailable, isEmail, syncProgressOnLogin, pushProgress as authPushProgress, setAdminPassword, adminListUsers, adminStats, ADMIN_EMAIL } from "./auth.js";
import { apiSolverAnalyze, apiRangesCompare, apiSaveSpot, apiListSpots, apiDeleteSpot } from "./solverApi.js";
import { coachChat } from "./coachLLM.js";
import { trainerRoundCloseDecision } from "./trainerRoundEngine.js";
import LegalCenter from "./LegalCenter.jsx";
import { LEGAL_VERSION } from "./legalContent.js";
import {
  normalizeTrainerActionEvent,
  trainerActionDisplayVerb,
  trainerActionCssClass,
  trainerChipPileCount,
  validateSpotConsistency,
} from "./trainerActionEvent.js";
import {
  TRAINER_VISUAL_CONFIG,
  getTrainerVisualLayoutConfig,
  trainerBoardCollisionZone,
  trainerBoardPosition,
  trainerChipValueBand,
  trainerPotPosition,
  trainerTableGeometry,
} from "./trainerVisualConfig.js";
import {
  ADAPTIVE_MODE_OPTIONS,
  buildTrainerIntegrationQueue,
  countEvolutiveSpots,
  createTrainingSpotFromHand,
  describeCoachSpot,
  recordAdaptiveDecision,
} from "./spotAiEngine.js";

/* ═══════════════════════════════════════════════════════
   POKERFORGE v7 — Theme "Ace of Spades"
   Fonts : Orbitron (brand) + Rajdhani (stats) + Inter (corps)
   Palette : Noir profond · Or brûlé · Émeraude · Corail
════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════
   PAQUETS DE CARTES — 5 styles sélectionnables
════════════════════════════════════════════════════════ */

let ACTIVE_CHIP_THEME="blue";

/* ── SEAT DEFAULT STATS — VPIP/PFR par position (6-max) ── */


/* Avatar premium par profil vilain. Purement visuel, aucune logique metier. */


/* Préférences accessibilité appliquées sur <body> */
function applyA11yPrefs(){
  try{
    document.body.classList.toggle("pf-bigtext",localStorage.getItem("pf_bigtext")==="on");
    document.body.classList.toggle("pf-contrast",localStorage.getItem("pf_contrast")==="on");
  }catch{}
}




/* ═══════════════════════════════════════
   DASHBOARD TAB — Layout intelligent
═══════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════
   DASHBOARD BANNER — Carrousel Premium PokerForge
   Images Unsplash · 100+ Citations · Rotation horaire
════════════════════════════════════════════════════════ */

/* ── Images poker (Unsplash libre de droits) ── */




/* ═══════════════════════════════════════════════════════
   PRACTICED HANDS — Tableau historique des mains jouées
   Inspiré GTO Wizard, thème PokerForge
════════════════════════════════════════════════════════ */

/* CSS additionnel pour le tableau */

/* ──────────────────────────────────────────────────────
   CardChip — petite carte inline pour les tableaux
────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════
   TABS + APP ROOT
═══════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   COACH MODE — Lexique · Calculateur · Théorie · Session
════════════════════════════════════════════════════════ */

/* ── Données Lexique ── */

/* ── Données Pros ── */

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
function CoachTab({unit,onGoTrainer}){
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





/* ═══════════════════════════════════════
   BIBLIOTHÈQUE GTO — Spots pré-résolus
═══════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════
   SETTINGS PANEL
════════════════════════════════════════════════════════ */
/* ── Panneau de synchronisation cloud (Supabase) ── */
function CloudSyncPanel(){
  const[st,setSt]=useState(()=>getCloudStatus());
  const[id,setId]=useState(()=>getSyncId());
  const[entry,setEntry]=useState("");
  const[busy,setBusy]=useState(false);
  const[msg,setMsg]=useState(null);
  const[copied,setCopied]=useState(false);
  useEffect(()=>{const t=setInterval(()=>setSt(getCloudStatus()),1500);return()=>clearInterval(t);},[]);
  function flash(m){setMsg(m);setTimeout(()=>setMsg(null),3000);}
  async function pushAll(){setBusy(true);const r=await pfCloudPushAll();setBusy(false);setSt(getCloudStatus());flash(r.ok?`✓ ${r.count} rubrique(s) sauvegardée(s) dans le cloud`:`❌ ${r.error||"échec"}`);}
  async function pull(){setBusy(true);const r=await pfCloudPull();setBusy(false);setSt(getCloudStatus());flash(r.ok?`✓ ${r.count} rubrique(s) restaurée(s) — rechargement…`:`❌ ${r.error||"échec"}`);if(r.ok)setTimeout(()=>location.reload(),900);}
  async function applyEntry(){
    const v=entry.trim();if(!v){flash("Entre un Sync ID valide");return;}
    setBusy(true);const r=await setSyncId(v);setBusy(false);
    if(r.ok){setId(v);flash(`✓ Connecté à ce Sync ID — ${r.count} rubrique(s) restaurée(s), rechargement…`);setTimeout(()=>location.reload(),1100);}
    else flash(`❌ ${r.error||"échec"}`);
  }
  function copyId(){try{navigator.clipboard.writeText(id);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{}}
  const ok=st.enabled&&!st.lastError;
  return(
    <div className="settings-section">
      <div className="settings-section-title">☁️ Sauvegarde cloud & synchronisation</div>
      <div style={{fontSize:10.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",marginBottom:14,lineHeight:1.6}}>
        Toutes tes rubriques (sessions, stats, historique, mains, Mental Game, réglages…) sont sauvegardées automatiquement dans le cloud. Pour retrouver tes données sur un autre appareil, colles-y ton <b>Sync ID</b>.
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <span style={{width:9,height:9,borderRadius:"50%",background:ok?"#10D87A":st.lastError?"#FF4560":"#FFC247",boxShadow:`0 0 8px ${ok?"#10D87A":st.lastError?"#FF4560":"#FFC247"}`}}/>
        <span style={{fontSize:11,fontFamily:"'Inter',sans-serif",color:ok?"#10D87A":st.lastError?"#FF8A8A":"#FFC247",fontWeight:600}}>
          {ok?"Cloud connecté":st.lastError?"Erreur cloud":"En attente"}{st.pending>0?` · ${st.pending} en cours…`:st.lastSync?` · dernière synchro ${new Date(st.lastSync).toLocaleTimeString()}`:""}
        </span>
      </div>
      {st.lastError&&<div style={{fontSize:9.5,color:"#FF8A8A",fontFamily:"'Inter',sans-serif",marginBottom:10,wordBreak:"break-word"}}>⚠ {st.lastError}</div>}
      {msg&&<div style={{padding:"8px 12px",borderRadius:8,background:"rgba(31,139,255,.1)",border:"1px solid rgba(31,139,255,.3)",color:"#7FB8FF",fontSize:10.5,fontFamily:"'Inter',sans-serif",marginBottom:12}}>{msg}</div>}

      {/* Mon Sync ID */}
      <div style={{fontSize:9.5,color:"#7FB8FF",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:6}}>Mon Sync ID</div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <input readOnly value={id} onFocus={e=>e.target.select()} style={{flex:1,minWidth:200,background:"#030D2A",border:"1px solid #152D6E",borderRadius:8,color:"#9FB0CC",fontFamily:"'JetBrains Mono',monospace",fontSize:10,padding:"8px 10px",outline:"none"}}/>
        <button onClick={copyId} style={btnGhost}>{copied?"✓ Copié":"📋 Copier"}</button>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button disabled={busy} onClick={pushAll} style={btnPrim}>⬆ Sauvegarder maintenant</button>
        <button disabled={busy} onClick={pull} style={btnGhost}>⬇ Restaurer depuis le cloud</button>
      </div>

      {/* Synchroniser un autre appareil */}
      <div style={{fontSize:9.5,color:"#C9A0FF",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:6}}>Synchroniser un autre appareil</div>
      <div style={{fontSize:10,color:"#6F81A8",fontFamily:"'Inter',sans-serif",marginBottom:8,lineHeight:1.5}}>Colle ici le Sync ID d'un autre appareil pour récupérer ses données (remplace les données locales).</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input value={entry} onChange={e=>setEntry(e.target.value)} placeholder="pf-xxxxxxxx-…" style={{flex:1,minWidth:200,background:"#030D2A",border:"1px solid #152D6E",borderRadius:8,color:"#E6EEFF",fontFamily:"'JetBrains Mono',monospace",fontSize:10,padding:"8px 10px",outline:"none"}}/>
        <button disabled={busy} onClick={applyEntry} style={btnPrim}>🔗 Connecter</button>
      </div>
    </div>
  );
}
const btnPrim={padding:"8px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:10.5,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif",background:"linear-gradient(90deg,#1F8BFF,#3D6BFF)",color:"#fff"};
const btnGhost={padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:10.5,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif",background:"rgba(255,255,255,.04)",border:"1px solid #1A3A80",color:"#C9D4E8"};

function SettingsPanel({deckType,setDeckType,chipTheme="blue",setChipTheme,onOpenLegal}){
  const[saved,setSaved]=useState(false);
  // ── Accessibilité & mobile ──
  const[a11y,setA11y]=useState(()=>{
    try{
      return{
        bigtext:localStorage.getItem("pf_bigtext")==="on",
        contrast:localStorage.getItem("pf_contrast")==="on",
        haptics:localStorage.getItem("pf_haptics")!=="off",
      };
    }catch{return{bigtext:false,contrast:false,haptics:true};}
  });
  function toggleA11y(key){
    setA11y(prev=>{
      const next={...prev,[key]:!prev[key]};
      try{
        if(key==="haptics")localStorage.setItem("pf_haptics",next.haptics?"on":"off");
        else localStorage.setItem(key==="bigtext"?"pf_bigtext":"pf_contrast",next[key]?"on":"off");
      }catch{}
      applyA11yPrefs();
      if(key==="haptics"&&next.haptics)vibrate(VIB.ok); // feedback immédiat
      return next;
    });
  }
  function applyDeck(id){
    setDeckType(id);
    setActiveDeckKey(id);
    localStorage.setItem("pf_deck",id);
    setSaved(true);
    setTimeout(()=>setSaved(false),1800);
  }
  return(
    <div className="settings-wrap">
      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:800,color:"#FFFFFF",letterSpacing:".05em",marginBottom:4}}>⚙️ Paramètres</div>
      <div style={{fontSize:11,color:"#6F81A8",fontFamily:"'Inter',sans-serif",marginBottom:20}}>Personnalisez votre expérience PokerForge</div>

      <CloudSyncPanel/>

      {/* Section paquets de cartes */}
      <div className="settings-section">
        <div className="settings-section-title">🃏 Style de cartes</div>
        <div style={{fontSize:10.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",marginBottom:14,lineHeight:1.6}}>
          Le style sélectionné s'applique immédiatement sur toutes les tables du trainer et du replayer.
        </div>
        {saved&&(
          <div style={{padding:"8px 14px",borderRadius:8,background:"rgba(16,216,122,.12)",border:"1px solid rgba(16,216,122,.3)",color:"#10D87A",fontSize:11,fontFamily:"'Inter',sans-serif",fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
            ✓ Style appliqué avec succès !
          </div>
        )}
        <div className="deck-grid">
          {Object.values(CARD_DECKS).map(deck=>{
            const suits=["♠","♥","♦","♣"];
            const isActive=deckType===deck.id;
            return(
              <div key={deck.id} className={`deck-card${isActive?" active":""}`} onClick={()=>applyDeck(deck.id)}>
                {/* Preview des 4 couleurs */}
                <div className="deck-preview">
                  {suits.map(s=>(
                    <div key={s} className="deck-suit-dot" style={{background:`${deck[s].color}22`,color:deck[s].color,border:`1.5px solid ${deck[s].color}55`,boxShadow:isActive?`0 0 8px ${deck[s].glow}`:""}}>{s}</div>
                  ))}
                </div>
                <div className="deck-name">{deck.name}</div>
                <div className="deck-desc">{deck.desc}</div>
                {isActive&&<div style={{marginTop:8,fontSize:9,color:"#1F8BFF",fontFamily:"'Inter',sans-serif",fontWeight:700}}>✓ Actif</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Aperçu en temps réel */}
      <div className="settings-section">
        <div className="settings-section-title">👁 Aperçu des cartes</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end",padding:"8px 0"}}>
          {[{r:"A",s:"♠"},{r:"K",s:"♥"},{r:"Q",s:"♦"},{r:"J",s:"♣"},{r:"T",s:"♠"},{r:"2",s:"♥"}].map((c,i)=>(
            <Card key={i} r={c.r} s={c.s} size="lg" delay={i*.05}/>
          ))}
          <div style={{marginLeft:12,display:"flex",gap:6}}>
            <CardBack size="lg"/>
            <CardBack size="md"/>
          </div>
        </div>
      </div>

      {/* Section jetons */}
      <div className="settings-section">
        <div className="settings-section-title">🪙 Thème des jetons</div>
        <div style={{fontSize:10.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",marginBottom:14,lineHeight:1.6}}>
          Style visuel des jetons sur la table du Trainer. Sélectionné globalement.
        </div>
        <div className="chip-theme-grid">
          {Object.values(CHIP_THEMES).map(theme=>{
            const isActive=chipTheme===theme.id;
            return(
              <div key={theme.id} className={`chip-theme-card${isActive?" active":""}`} onClick={()=>setChipTheme&&setChipTheme(theme.id)}>
                {/* Preview chip stack */}
                <div style={{display:"flex",justifyContent:"center",gap:3,alignItems:"flex-end",marginBottom:8,filter:`drop-shadow(0 2px 6px ${theme.glow})`}}>
                  {theme.cols.slice(0,4).map((c,i)=>(
                    <div key={i} style={{width:14,height:6,borderRadius:"50%",background:c,border:`1px solid ${theme.edge}`,transform:`translateY(${i*-3}px)`,boxShadow:`0 1px 4px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.2)`}}/>
                  ))}
                </div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,fontWeight:700,color:isActive?"#E8F0FF":"#9FB0CC",marginBottom:2}}>{theme.name}</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:8.5,color:"#6F81A8"}}>{theme.desc}</div>
                {isActive&&<div style={{marginTop:6,fontSize:9,color:"#1F8BFF",fontFamily:"'Inter',sans-serif",fontWeight:700}}>✓ Actif</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Accessibilité & Mobile ── */}
      <div className="settings-section">
        <div className="settings-section-title">📱 Accessibilité & Mobile</div>
        <div style={{fontSize:10.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",marginBottom:14,lineHeight:1.6}}>
          Options appliquées immédiatement, sur toutes les tables — de l'iPhone SE aux grands écrans Android.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[
            {key:"bigtext",ico:"🔍",title:"Mode gros texte",desc:"Agrandit les boutons d'action, solutions, stats et labels du Trainer"},
            {key:"contrast",ico:"◐",title:"Contraste élevé",desc:"Textes secondaires plus clairs, bordures renforcées, cartes plus nettes"},
            {key:"haptics",ico:"📳",title:"Vibrations (haptics)",desc:"Vibration courte sur bonne réponse, double sur erreur — mobile uniquement"},
          ].map(({key,ico,title,desc})=>(
            <div key={key} onClick={()=>toggleA11y(key)} style={{
              display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:11,cursor:"pointer",
              background:a11y[key]?"rgba(31,139,255,.08)":"rgba(26,58,128,.15)",
              border:`1px solid ${a11y[key]?"rgba(31,139,255,.4)":"#152D6E"}`,
              transition:"all .18s",
            }}>
              <span style={{fontSize:19,flexShrink:0}}>{ico}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:11.5,fontWeight:700,color:a11y[key]?"#E8F0FF":"#9FB0CC"}}>{title}</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:9.5,color:"#6F81A8",marginTop:2,lineHeight:1.45}}>{desc}</div>
              </div>
              {/* Toggle switch */}
              <div style={{
                width:40,height:22,borderRadius:12,flexShrink:0,position:"relative",
                background:a11y[key]?"linear-gradient(90deg,#1F8BFF,#34D8FF)":"#152D6E",
                transition:"background .2s",
              }}>
                <div style={{
                  position:"absolute",top:2,left:a11y[key]?20:2,width:18,height:18,borderRadius:"50%",
                  background:"#FFFFFF",boxShadow:"0 1px 4px rgba(0,0,0,.4)",transition:"left .2s cubic-bezier(.4,0,.2,1)",
                }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Documents juridiques */}
      <div className="settings-section">
        <div className="settings-section-title">Documents juridiques</div>
        <div style={{fontSize:10.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",marginBottom:14,lineHeight:1.6}}>
          Consultez les conditions d'utilisation, la politique de confidentialite et les informations legales de PokerForge.
        </div>
        <div className="pf-settings-legal-actions">
          {[
            ["mentions","Mentions legales"],
            ["cgu","CGU"],
            ["privacy","Confidentialite"],
            ["cookies","Cookies"],
            ["responsible","Jeu responsable"],
            ["cgv","CGV"],
          ].map(([id,label])=>(
            <button key={id} type="button" className="pf-settings-legal-btn" onClick={()=>onOpenLegal?.(id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* Options futures */}
      <div className="settings-section" style={{opacity:.6}}>
        <div className="settings-section-title">🔜 Prochainement</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {["Timer configurable (10s/20s/30s/∞)","Son & feedback audio","Thème Neon Purple","Mode daltonien"].map(f=>(
            <div key={f} style={{padding:"9px 12px",borderRadius:8,background:"rgba(26,58,128,.2)",border:"1px solid #152D6E",fontSize:10,color:"#6F81A8",fontFamily:"'Inter',sans-serif"}}>{f}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TABS=[
  {id:"dash",l:"Dashboard"},
  {id:"trainer",l:"Entraineur GTO"},
  {id:"solver",l:"SharkSolver"},
  {id:"library",l:"📚 Bibliothèque"},
  {id:"pratique",l:"Mains jouees"},
  {id:"replayer",l:"Replayer & IA"},
  {id:"coach",l:"🧠 Coach AI"},
  {id:"community",l:"Communaute"},
];

/* ══════════════════════════════════════════════════════════════
   LOGO POKERFORGE — Asset PNG officiel
   ► Déposer les fichiers dans public/ :
     • logo-compact.png  → monogramme PF + requin  (carré ≥ 256px)
     • logo-header.png   → PF + requin + POKERFORGE (≥ 800×160px)
     • logo-full.png     → logo complet avec ELITE TRAINING (≥ 1200×300px)
   ► Fallback SVG minimal si l'image n'est pas encore en place.
════════════════════════════════════════════════════════════ */

/* ── Fallback SVG minimal (affiché si le PNG n'est pas dispo) ── */
function _PFFallback({w,h,label="PF"}){
  return(
    <svg width={w} height={h} viewBox="0 0 64 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="24" rx="5" fill="#010A1C" stroke="#0078CC" strokeWidth="1"/>
      <text x="32" y="17" fontFamily="Impact,sans-serif" fontSize="14" fontWeight="900"
        fill="#00A8FF" textAnchor="middle" fontStyle="italic">{label}</text>
    </svg>
  );
}

/* ── Version Compact : PF + requin (mobile / sidebar / favicon) ── */
function PFLogoCompact({size=48}){
  return(
    <img
      src="/logo-compact.svg"
      alt="PokerForge"
      width={size}
      height={size}
      style={{
        display:"block",
        width:size,
        height:size,
        objectFit:"contain",
        imageRendering:"auto",
      }}
      onError={e=>{
        e.currentTarget.style.display="none";
        const fb=document.createElement("div");
        fb.innerHTML=`<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="10" fill="#010A1C" stroke="#0078CC" stroke-width="1.5"/><text x="32" y="40" font-family="Impact,sans-serif" font-size="28" font-weight="900" fill="#00A8FF" text-anchor="middle" font-style="italic">PF</text></svg>`;
        e.currentTarget.parentNode.insertBefore(fb.firstChild,e.currentTarget.nextSibling);
      }}
    />
  );
}

/* ── Version Header : PF + requin + POKERFORGE (barre navigation) ── */
function PFLogoHeader({height=48}){
  /* Ratio approximatif du logo header : ~5:1 (largeur:hauteur) */
  const w=Math.round(height*4.9);
  return(
    <img
      className="pf-header-logo"
      src="/logo-pokerforge-kl.png"
      alt="PokerForge"
      height={height}
      style={{
        display:"block",
        height:height,
        width:"auto",
        maxWidth:w,
        objectFit:"contain",
        objectPosition:"left center",
        imageRendering:"auto",
      }}
      onError={e=>{
        e.currentTarget.style.display="none";
        const fb=document.createElement("div");
        fb.className="pf-header-logo-fallback";
        fb.innerHTML=`<svg height="${height}" viewBox="0 0 218 48" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="pfwChrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="45%" stop-color="#C0C7D1"/><stop offset="72%" stop-color="#5D7296"/><stop offset="100%" stop-color="#E7ECF3"/></linearGradient><filter id="pfwGlow" x="-25%" y="-40%" width="150%" height="190%"><feDropShadow dx="0" dy="0" stdDeviation="2.4" flood-color="#00BFFF" flood-opacity=".8"/><feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#008CFF" flood-opacity=".7"/></filter></defs><text x="4" y="33" transform="skewX(-10)" font-family="Impact,Arial Black,sans-serif" font-size="32" font-weight="900" letter-spacing="-1.2" fill="url(#pfwChrome)" stroke="#008CFF" stroke-width="1.1" filter="url(#pfwGlow)">POKERFORGE</text></svg>`;
        e.currentTarget.parentNode.insertBefore(fb.firstChild,e.currentTarget.nextSibling);
      }}
    />
  );
}

/* ── Version Full : logo complet avec ELITE TRAINING (landing / splash) ── */
function PFLogoFull({height=80,maxWidth="100%"}){
  return(
    <img
      src="/logo-full.svg"
      alt="PokerForge — Elite Training"
      height={height}
      style={{
        display:"block",
        height:height,
        width:"auto",
        maxWidth:maxWidth,
        objectFit:"contain",
        imageRendering:"crisp-edges",
      }}
      onError={e=>{
        e.currentTarget.onerror=null;
        e.currentTarget.src="/logo-compact.svg";
        e.currentTarget.style.width=`${height}px`;
        e.currentTarget.style.maxWidth=`${height}px`;
      }}
    />
  );
}

/* ── Alias rétrocompat ── */
function PFLogo({size=38}){return <PFLogoCompact size={size}/>;}


/* ── Navigation latérale icônes ── */
/* ═══════════════════════════════════════════════════════
   NAV ICONS — SVG Premium (Lucide-style, stroke-width:2)
════════════════════════════════════════════════════════ */
function NavIcon({id,size=22,color="currentColor"}){
  const s={width:size,height:size,viewBox:"0 0 24 24",fill:"none",stroke:color,strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round"};
  const icons={
    // LayoutDashboard — 4 rectangles
    dash:(
      <svg {...s}>
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
    // Crosshair — cercle + lignes + point central
    trainer:(
      <svg {...s}>
        <circle cx="12" cy="12" r="8"/>
        <line x1="12" y1="2" x2="12" y2="7"/>
        <line x1="12" y1="17" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="7" y2="12"/>
        <line x1="17" y1="12" x2="22" y2="12"/>
        <circle cx="12" cy="12" r="2.5" fill={color} stroke="none"/>
      </svg>
    ),
    // BrainCircuit — cerveau stylisé + circuit
    solver:(
      <svg {...s}>
        <path d="M12 5a3 3 0 1 0-5.5 1.6A4 4 0 0 0 4 10.5a4 4 0 0 0 1 7.5"/>
        <path d="M12 5a3 3 0 1 1 5.5 1.6A4 4 0 0 1 20 10.5a4 4 0 0 1-1.4 7.8"/>
        <path d="M9 13h3m3 0h1"/>
        <path d="M12 13v3"/>
        <path d="M15 13v2a1 1 0 0 0 1 1h2"/>
        <circle cx="18" cy="16" r="1" fill={color} stroke="none"/>
        <circle cx="6.5" cy="18" r="1" fill={color} stroke="none"/>
      </svg>
    ),
    // BookOpen — livre ouvert
    library:(
      <svg {...s}>
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
    // Cards — deux cartes chevauchées
    pratique:(
      <svg {...s}>
        <rect x="2" y="5" width="12" height="16" rx="2"/>
        <path d="M6 2h14a2 2 0 0 1 2 2v14"/>
        <line x1="5.5" y1="10" x2="10.5" y2="10"/>
        <line x1="5.5" y1="13.5" x2="10.5" y2="13.5"/>
      </svg>
    ),
    // PlayCircle — cercle + triangle play
    replayer:(
      <svg {...s}>
        <circle cx="12" cy="12" r="10"/>
        <polygon points="10 8 16 12 10 16 10 8" fill={color} stroke="none"/>
      </svg>
    ),
    // Sparkles — étoile IA / coach
    coach:(
      <svg {...s}>
        <path d="m12 3-1.8 5.4a2 2 0 0 1-1.3 1.3L3 12l5.4 1.8a2 2 0 0 1 1.3 1.3L12 21l1.8-5.4a2 2 0 0 1 1.3-1.3L21 12l-5.4-1.8a2 2 0 0 1-1.3-1.3L12 3z"/>
        <path d="M5 3v3"/>
        <path d="M3 5h3"/>
        <path d="M19 18v3"/>
        <path d="M18 19h3"/>
      </svg>
    ),
    // Users — deux silhouettes
    community:(
      <svg {...s}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    // Ranges — matrice de mains (grille 3×3 dégradée)
    ranges:(
      <svg {...s}>
        <rect x="2" y="2" width="5" height="5" rx="1"/>
        <rect x="9.5" y="2" width="5" height="5" rx="1"/>
        <rect x="17" y="2" width="5" height="5" rx="1"/>
        <rect x="2" y="9.5" width="5" height="5" rx="1"/>
        <rect x="9.5" y="9.5" width="5" height="5" rx="1"/>
        <rect x="17" y="9.5" width="5" height="5" rx="1" opacity=".45"/>
        <rect x="2" y="17" width="5" height="5" rx="1"/>
        <rect x="9.5" y="17" width="5" height="5" rx="1" opacity=".45"/>
        <rect x="17" y="17" width="5" height="5" rx="1" opacity=".2"/>
      </svg>
    ),
    // Settings — engrenage moderne
    legal:(
      <svg {...s}>
        <path d="M6 3h9l3 3v15H6z"/>
        <path d="M15 3v4h4M9 11h6M9 15h6"/>
      </svg>
    ),
    settings:(
      <svg {...s}>
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  };
  return icons[id]||<svg {...s}><circle cx="12" cy="12" r="5"/></svg>;
}

/* ── Navigation latérale — avec couleur par section ── */
const LNAV=[
  {id:"dash",     lbl:"Dashboard",  col:"#4A90FF"},
  {id:"trainer",  lbl:"Entraîneur", col:"#FF4D4D"},
  {id:"solver",   lbl:"SharkSolver",col:"#34D8FF"},
  {id:"library",  lbl:"Biblio",     col:"#2ECC71"},
  {id:"pratique", lbl:"Mains",      col:"#9B5CFF"},
  {id:"replayer", lbl:"Replayer",   col:"#FFC247"},
  {id:"coach",    lbl:"Coach AI",   col:"#1F8BFF"},
  {id:"community",lbl:"Communauté", col:"#FF5CC8"},
  {id:"settings", lbl:"Paramètres", col:"#C9D4E8"},
];

/* ═══════════════════════════════════════════════════════════════
   AUTHENTIFICATION — Modale premium (Connexion / Créer un compte)
═══════════════════════════════════════════════════════════════ */
function OAuthBtns({onProvider,busy}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <button type="button" className="pf-oauth-btn" disabled={busy} onClick={()=>onProvider("google")}>
        <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.8 26.9 36 24 36c-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5C39.9 36.6 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
        Continuer avec Google
      </button>
      <button type="button" className="pf-oauth-btn" disabled={busy} onClick={()=>onProvider("apple")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M16.36 1.43c0 1.14-.42 2.05-1.13 2.86-.86.97-1.9 1.53-3.03 1.44-.02-.11-.04-.29-.04-.45 0-1.1.47-2.27 1.2-3.04.4-.42.94-.78 1.6-1.06.65-.27 1.27-.42 1.4-.45.01.25 0 .5 0 .7zM21 17.21c-.36.82-.53 1.18-.99 1.9-.64 1.01-1.55 2.27-2.67 2.28-1 .01-1.25-.65-2.6-.64-1.35.01-1.63.65-2.62.64-1.13-.01-2-1.15-2.63-2.16C7.06 18.06 6 14.84 7.2 12.64c.6-1.09 1.66-1.78 2.81-1.8 1.04-.02 2.02.69 2.6.69.59 0 1.78-.85 3.01-.73.51.02 1.95.21 2.88 1.57-.07.05-1.72 1.01-1.7 3.01.02 2.39 2.1 3.19 2.13 3.2z"/></svg>
        Continuer avec Apple
      </button>
    </div>
  );
}
function AuthField({label,children,error}){
  return(
    <label style={{display:"block",marginBottom:11}}>
      <span style={{display:"block",fontSize:9.5,color:T.text3,fontFamily:T.stats,fontWeight:700,letterSpacing:".04em",marginBottom:5}}>{label}</span>
      {children}
      {error&&<span style={{display:"block",fontSize:9,color:T.red,fontFamily:T.stats,marginTop:3}}>{error}</span>}
    </label>
  );
}
function AuthModal({onClose,onAuthed,onOpenLegal}){
  const[mode,setMode]=useState("login");      // login | register | forgot
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState(null);
  const[info,setInfo]=useState(null);
  // login
  const[ident,setIdent]=useState("");
  const[pwd,setPwd]=useState("");
  // register
  const[email,setEmail]=useState("");
  const[username,setUsername]=useState("");
  const[rpwd,setRpwd]=useState("");
  const[cpwd,setCpwd]=useState("");
  const[cgu,setCgu]=useState(false);
  const[uStatus,setUStatus]=useState(null);   // null | checking | ok | taken
  const inp={width:"100%",padding:"10px 12px",borderRadius:9,border:"1px solid #1A3A80",background:"rgba(3,13,42,.85)",color:"#fff",fontSize:12.5,fontFamily:T.stats,outline:"none"};

  // vérif pseudo unique (débouncé)
  useEffect(()=>{
    if(mode!=="register"||username.trim().length<3){setUStatus(null);return;}
    setUStatus("checking");let live=true;
    const t=setTimeout(async()=>{const ok=await authUsernameAvailable(username.trim());if(live)setUStatus(ok?"ok":"taken");},450);
    return()=>{live=false;clearTimeout(t);};
  },[username,mode]);

  async function doLogin(e){e&&e.preventDefault();setErr(null);setBusy(true);
    const r=await authSignIn({identifier:ident,password:pwd});setBusy(false);
    if(!r.ok){setErr(r.error);return;}
    const name=r.user?.user_metadata?.username||ident;onAuthed&&onAuthed(name);
  }
  async function doRegister(e){e&&e.preventDefault();setErr(null);
    if(rpwd!==cpwd){setErr("Les mots de passe ne correspondent pas.");return;}
    if(!cgu){setErr("Accepte les CGU et la politique de confidentialité.");return;}
    setBusy(true);
    const legalAcceptedAt=new Date().toISOString();
    try{localStorage.setItem("pf_legal_acceptance",JSON.stringify({version:LEGAL_VERSION,acceptedAt:legalAcceptedAt,documents:["cgu","privacy"]}));}catch{}
    const r=await authSignUp({email,username,password:rpwd,legalVersion:LEGAL_VERSION,legalAcceptedAt});setBusy(false);
    if(!r.ok){setErr(r.error);return;}
    if(r.needConfirm){setInfo("Compte créé ! Confirme ton email pour te connecter.");setMode("login");return;}
    onAuthed&&onAuthed(username);
  }
  async function doOAuth(provider){
    setErr(null);
    if(mode==="register"&&!cgu){setErr("Accepte les CGU et la politique de confidentialite.");return;}
    if(mode==="register"){
      try{localStorage.setItem("pf_legal_acceptance",JSON.stringify({version:LEGAL_VERSION,acceptedAt:new Date().toISOString(),documents:["cgu","privacy"],method:provider}));}catch{}
    }
    setBusy(true);const r=await signInOAuth(provider);setBusy(false);if(!r.ok)setErr(r.error);
  }
  async function doForgot(e){e&&e.preventDefault();setErr(null);setBusy(true);const r=await authResetPassword(ident||email);setBusy(false);
    if(!r.ok){setErr(r.error);return;}setInfo("Email de réinitialisation envoyé (si le compte existe).");setMode("login");}

  return(
    <div className="pf-auth-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="pf-auth-modal" role="dialog" aria-modal="true">
        <button className="pf-auth-close" onClick={onClose} aria-label="Fermer">✕</button>
        <div className="pf-auth-logo">POKER<span>FORGE</span></div>
        <div className="pf-auth-sub">{mode==="register"?"Crée ton compte joueur":mode==="forgot"?"Réinitialiser le mot de passe":"Connecte-toi à ton compte"}</div>

        {mode!=="forgot"&&(
          <div className="pf-auth-tabs">
            {[["login","Connexion"],["register","Créer un compte"]].map(([id,l])=>(
              <button key={id} className={`pf-auth-tab${mode===id?" on":""}`} onClick={()=>{setMode(id);setErr(null);setInfo(null);}}>{l}</button>
            ))}
          </div>
        )}

        {info&&<div className="pf-auth-info">✓ {info}</div>}
        {err&&<div className="pf-auth-err">⚠ {err}</div>}

        {mode==="login"&&(
          <form onSubmit={doLogin}>
            <AuthField label="Email ou pseudo"><input style={inp} value={ident} onChange={e=>setIdent(e.target.value)} placeholder="ton@email.com ou TonPseudo" autoComplete="username"/></AuthField>
            <AuthField label="Mot de passe"><input style={inp} type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="••••••••" autoComplete="current-password"/></AuthField>
            <button type="submit" className="pf-auth-primary" disabled={busy}>{busy?"Connexion…":"Se connecter"}</button>
            <div style={{textAlign:"center",marginTop:9}}><span className="pf-auth-link" onClick={()=>{setMode("forgot");setErr(null);}}>Mot de passe oublié ?</span></div>
          </form>
        )}

        {mode==="register"&&(
          <form onSubmit={doRegister}>
            <AuthField label="Email"><input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="ton@email.com" autoComplete="email"/></AuthField>
            <AuthField label="Pseudo unique" error={uStatus==="taken"?"Ce pseudo est déjà pris.":null}>
              <div style={{position:"relative"}}>
                <input style={{...inp,paddingRight:34,borderColor:uStatus==="taken"?"rgba(255,69,96,.5)":uStatus==="ok"?"rgba(16,216,122,.5)":"#1A3A80"}} value={username} onChange={e=>setUsername(e.target.value)} placeholder="TonPseudo" autoComplete="off"/>
                <span style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",fontSize:12}}>{uStatus==="checking"?"⏳":uStatus==="ok"?"✅":uStatus==="taken"?"❌":""}</span>
              </div>
            </AuthField>
            <AuthField label="Mot de passe (8 caractères min)"><input style={inp} type="password" value={rpwd} onChange={e=>setRpwd(e.target.value)} placeholder="••••••••" autoComplete="new-password"/></AuthField>
            <AuthField label="Confirmer le mot de passe" error={cpwd&&rpwd!==cpwd?"Ne correspond pas.":null}><input style={{...inp,borderColor:cpwd&&rpwd!==cpwd?"rgba(255,69,96,.5)":"#1A3A80"}} type="password" value={cpwd} onChange={e=>setCpwd(e.target.value)} placeholder="••••••••" autoComplete="new-password"/></AuthField>
            <label style={{display:"flex",alignItems:"flex-start",gap:8,margin:"2px 0 12px",cursor:"pointer"}}>
              <input type="checkbox" checked={cgu} onChange={e=>setCgu(e.target.checked)} style={{marginTop:2}}/>
              <span style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,lineHeight:1.5}}>J'accepte les <button type="button" className="pf-auth-legal-button" onClick={e=>{e.preventDefault();e.stopPropagation();onOpenLegal?.("cgu");}}>CGU</button> et la <button type="button" className="pf-auth-legal-button" onClick={e=>{e.preventDefault();e.stopPropagation();onOpenLegal?.("privacy");}}>politique de confidentialite</button>.</span>
            </label>
            <button type="submit" className="pf-auth-primary" disabled={busy}>{busy?"Création…":"Créer mon compte"}</button>
          </form>
        )}

        {mode==="forgot"&&(
          <form onSubmit={doForgot}>
            <AuthField label="Email du compte"><input style={inp} type="email" value={ident} onChange={e=>setIdent(e.target.value)} placeholder="ton@email.com"/></AuthField>
            <button type="submit" className="pf-auth-primary" disabled={busy}>{busy?"Envoi…":"Envoyer le lien"}</button>
            <div style={{textAlign:"center",marginTop:9}}><span className="pf-auth-link" onClick={()=>{setMode("login");setErr(null);}}>← Retour à la connexion</span></div>
          </form>
        )}

        {mode!=="forgot"&&(
          <>
            <div className="pf-auth-divider"><span>ou</span></div>
            <OAuthBtns onProvider={doOAuth} busy={busy}/>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Menu utilisateur connecté ── */
function UserMenu({user,profile,hdrStats,onClose,onNav,onLogout}){
  const ref=useRef(null);
  useEffect(()=>{
    const h=(e)=>{if(ref.current&&!ref.current.contains(e.target))onClose();};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  const name=profile?.username||user?.email?.split("@")[0]||"Joueur";
  const xp=profile?.xp||hdrStats?.xp||0;
  const lv=profile?.level||hdrStats?.level||1;
  const isAdmin=profile&&profile.role==="admin";
  const items=[
    ...(isAdmin?[["🛡️ Espace Admin","admin"]]:[]),
    ["👤 Mon profil","coach"],["📊 Progression","coach"],["⚙️ Paramètres du compte","settings"],["🔒 Sécurité","settings"],
  ];
  return(
    <div ref={ref} className="pf-usermenu">
      <div className="pf-usermenu-head">
        <div className="pf-usermenu-avatar">{name.charAt(0).toUpperCase()}</div>
        <div style={{flex:1,minWidth:0}}>
          <div className="pf-usermenu-name">{name}</div>
          <div className="pf-usermenu-meta">🥉 Lv {lv} · <span style={{color:T.gold}}>{Number(xp).toLocaleString("fr-FR")} XP</span></div>
        </div>
      </div>
      <div className="pf-usermenu-list">
        {items.map(([l,t])=><div key={l} className="pf-usermenu-item" onClick={()=>onNav(t)}>{l}</div>)}
        <div className="pf-usermenu-item pf-usermenu-logout" onClick={onLogout}>🚪 Déconnexion</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ADMINISTRATION — accès réservé role === "admin" (vérifié serveur)
═══════════════════════════════════════════════════════════════ */
function AdminForbidden({onBack}){
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:"40px",background:T.bg}}>
      <div style={{fontSize:46}}>⛔</div>
      <div style={{fontFamily:T.brand,fontSize:18,fontWeight:900,color:T.red}}>Accès refusé (403)</div>
      <div style={{fontSize:12,color:T.text3,fontFamily:T.stats,textAlign:"center",maxWidth:360,lineHeight:1.6}}>
        Cette zone est réservée aux administrateurs PokerForge. Ton compte n'a pas les droits requis.
      </div>
      <div className="cai-btn" onClick={onBack}>← Retour au dashboard</div>
    </div>
  );
}
function AdminSetupPassword({email,onDone}){
  const[pwd,setPwd]=useState("");const[cpwd,setCpwd]=useState("");
  const[busy,setBusy]=useState(false);const[err,setErr]=useState(null);
  const inp={width:"100%",padding:"11px 13px",borderRadius:9,border:"1px solid #1A3A80",background:"rgba(3,13,42,.85)",color:"#fff",fontSize:13,fontFamily:T.stats,outline:"none"};
  async function submit(e){e&&e.preventDefault();setErr(null);
    if(pwd.length<8){setErr("Mot de passe : 8 caractères minimum.");return;}
    if(pwd!==cpwd){setErr("Les mots de passe ne correspondent pas.");return;}
    setBusy(true);const r=await setAdminPassword(pwd);setBusy(false);
    if(!r.ok){setErr(r.error);return;}
    setPwd("");setCpwd("");onDone&&onDone();
  }
  return(
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"30px",background:T.bg,overflow:"auto"}}>
      <div style={{width:"100%",maxWidth:420,padding:"28px",borderRadius:18,
        background:"linear-gradient(165deg,rgba(11,28,64,.92),rgba(5,14,40,.96))",
        border:"1px solid rgba(255,69,96,.35)",boxShadow:"0 0 40px rgba(255,69,96,.14),0 24px 70px rgba(0,0,0,.6)"}}>
        <div style={{textAlign:"center",fontSize:34,marginBottom:6}}>🛡️</div>
        <div style={{textAlign:"center",fontFamily:T.brand,fontSize:17,fontWeight:900,color:"#fff"}}>Initialisation administrateur</div>
        <div style={{textAlign:"center",fontSize:10.5,color:T.text3,fontFamily:T.stats,margin:"5px 0 18px",lineHeight:1.6}}>
          Première connexion admin. Définis ton mot de passe sécurisé — il est <b>hashé côté serveur</b>, jamais stocké en clair.
        </div>
        {email&&<div style={{textAlign:"center",fontSize:10,color:T.gold,fontFamily:T.mono,marginBottom:14}}>{email}</div>}
        {err&&<div className="pf-auth-err">⚠ {err}</div>}
        <form onSubmit={submit}>
          <div style={{marginBottom:11}}>
            <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,fontWeight:700,marginBottom:5}}>Nouveau mot de passe (8 car. min)</div>
            <input style={inp} type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="••••••••" autoComplete="new-password"/>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,fontWeight:700,marginBottom:5}}>Confirmer</div>
            <input style={{...inp,borderColor:cpwd&&pwd!==cpwd?"rgba(255,69,96,.5)":"#1A3A80"}} type="password" value={cpwd} onChange={e=>setCpwd(e.target.value)} placeholder="••••••••" autoComplete="new-password"/>
          </div>
          <button type="submit" className="pf-auth-primary" disabled={busy} style={{background:"linear-gradient(135deg,#FF4560,#7C3AFF)"}}>{busy?"Définition…":"Définir le mot de passe admin"}</button>
        </form>
      </div>
    </div>
  );
}
function AdminStatCard({label,value,col="#1F8BFF"}){
  return(
    <div style={{flex:1,minWidth:120,background:"#050E28",border:`1px solid ${col}33`,borderRadius:12,padding:"14px 16px"}}>
      <div style={{fontFamily:T.brand,fontSize:24,fontWeight:900,color:col}}>{value}</div>
      <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,letterSpacing:".06em",textTransform:"uppercase",fontWeight:700,marginTop:3}}>{label}</div>
    </div>
  );
}
function AdminDashboard({profile,onGoTab}){
  const[stats,setStats]=useState(null);
  const[users,setUsers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState(null);
  useEffect(()=>{let live=true;(async()=>{
    setLoading(true);
    const[s,u]=await Promise.all([adminStats(),adminListUsers()]);
    if(!live)return;
    if(s.ok)setStats(s.stats); else if(s.forbidden)setErr("Accès admin refusé par le serveur (403).");
    if(u.ok)setUsers(u.users||[]);
    setLoading(false);
  })();return()=>{live=false;};},[]);
  const quick=[
    {ic:"📝",l:"Gestion des contenus",s:"Articles, leçons, ranges",t:"library"},
    {ic:"📰",l:"Actualités poker",s:"Sources & flux news",t:"dash"},
    {ic:"🗓️",l:"Événements",s:"WSOP, séries, festivals",t:"dash"},
    {ic:"🐞",l:"Signalements / bugs",s:"À venir",t:null},
    {ic:"💎",l:"Abonnements / Premium",s:"Zone future",t:null},
    {ic:"👥",l:"Communauté",s:"Modération",t:"community"},
  ];
  return(
    <div style={{flex:1,overflow:"auto",padding:"24px 30px",background:T.bg}}>
      <div style={{maxWidth:1100,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
          <span style={{fontSize:24}}>🛡️</span>
          <div style={{fontFamily:T.brand,fontSize:20,fontWeight:900,color:"#fff"}}>Administration PokerForge</div>
          <span style={{fontSize:8,fontWeight:800,color:T.red,border:"1px solid rgba(255,69,96,.4)",background:"rgba(255,69,96,.1)",borderRadius:10,padding:"2px 8px",fontFamily:T.stats}}>ADMIN</span>
        </div>
        <div style={{fontSize:11,color:T.text3,fontFamily:T.stats,marginBottom:18}}>Connecté en tant que <b style={{color:T.gold}}>{profile?.username}</b> · {profile?.email}</div>

        {err&&<div className="pf-auth-err" style={{maxWidth:400}}>⚠ {err}</div>}

        {/* Statistiques globales */}
        <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",fontWeight:700,marginBottom:8}}>STATISTIQUES GLOBALES</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:22}}>
          <AdminStatCard label="Utilisateurs" value={loading?"…":(stats?.total_users??"—")} col="#1F8BFF"/>
          <AdminStatCard label="Admins" value={loading?"…":(stats?.admins??"—")} col="#FF4560"/>
          <AdminStatCard label="Actifs (7j)" value={loading?"…":(stats?.active_7d??"—")} col="#10D87A"/>
          <AdminStatCard label="Nouveaux (7j)" value={loading?"…":(stats?.new_7d??"—")} col="#34D8FF"/>
          <AdminStatCard label="Spots joués" value={loading?"…":(stats?.total_spots??"—")} col="#9B5CFF"/>
          <AdminStatCard label="Articles news" value={loading?"…":(stats?.news_count??"—")} col="#FFC247"/>
        </div>

        {/* Accès rapides */}
        <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",fontWeight:700,marginBottom:8}}>GESTION</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:22}}>
          {quick.map((q,i)=>(
            <div key={i} onClick={()=>q.t&&onGoTab&&onGoTab(q.t)} style={{background:"#050E28",border:"1px solid #152D6E",borderRadius:12,padding:"13px 15px",
              cursor:q.t?"pointer":"default",opacity:q.t?1:.6,transition:"all .15s"}}
              onMouseEnter={e=>{if(q.t)e.currentTarget.style.borderColor="rgba(52,216,255,.4)";}}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#152D6E"}>
              <div style={{fontSize:20,marginBottom:5}}>{q.ic}</div>
              <div style={{fontSize:11.5,fontWeight:700,color:T.text2}}>{q.l}</div>
              <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,marginTop:2}}>{q.s}</div>
            </div>
          ))}
        </div>

        {/* Liste des utilisateurs */}
        <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",fontWeight:700,marginBottom:8}}>UTILISATEURS ({users.length})</div>
        <div style={{background:"#050E28",border:"1px solid #152D6E",borderRadius:12,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1.4fr 1.8fr .8fr .7fr 1.2fr",gap:8,padding:"9px 14px",borderBottom:"1px solid #152D6E",background:"rgba(31,139,255,.05)"}}>
            {["Pseudo","Email","Rôle","Niv.","Inscrit"].map(h=><span key={h} style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,fontWeight:700,letterSpacing:".05em"}}>{h}</span>)}
          </div>
          {loading?(
            <div style={{padding:"24px",textAlign:"center",color:T.text4,fontFamily:T.stats,fontSize:10}}>Chargement…</div>
          ):users.length===0?(
            <div style={{padding:"24px",textAlign:"center",color:T.text4,fontFamily:T.stats,fontSize:10}}>Aucun utilisateur.</div>
          ):users.map(u=>(
            <div key={u.id} style={{display:"grid",gridTemplateColumns:"1.4fr 1.8fr .8fr .7fr 1.2fr",gap:8,padding:"9px 14px",borderBottom:"1px solid rgba(255,255,255,.04)",alignItems:"center"}}>
              <span style={{fontSize:10.5,fontWeight:700,color:T.text2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.username}</span>
              <span style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</span>
              <span style={{fontSize:8,fontWeight:800,color:u.role==="admin"?T.red:T.text4,background:u.role==="admin"?"rgba(255,69,96,.12)":"rgba(255,255,255,.04)",border:`1px solid ${u.role==="admin"?"rgba(255,69,96,.3)":"#1A3A80"}`,borderRadius:8,padding:"1px 7px",fontFamily:T.stats,width:"fit-content"}}>{u.role}</span>
              <span style={{fontSize:9.5,color:T.text3,fontFamily:T.stats}}>Lv {u.level}</span>
              <span style={{fontSize:9,color:T.text4,fontFamily:T.stats}}>{u.created_at?String(u.created_at).slice(0,10):"—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const[tab,setTabState]=useState(()=>localStorage.getItem("pf_active_tab")||"coach");
  const setTab=next=>{setTabState(next);localStorage.setItem("pf_active_tab",next);};
  const[unit,setUnit]=useState("BB");
  const[deckType,setDeckType]=useState(()=>localStorage.getItem("pf_deck")||"modern");
  const[chipTheme,setChipTheme]=useState(()=>localStorage.getItem("pf_chip_theme")||"blue");
  const[hovNav,setHovNav]=useState(null); // hover state pour nav
  const[coachJump,setCoachJump]=useState(null);
  const[solverScenario,setSolverScenario]=useState(null);
  const[replayerSeed,setReplayerSeed]=useState(null); // HH brute envoyée depuis Coach AI vers le Replayer
  const[replayerTabSeed,setReplayerTabSeed]=useState("replay");
  const[trainerSeed,setTrainerSeed]=useState(null);   // spot envoyé vers l'Entraîneur (Replayer/Coach AI → Trainer)
  const[coachSeed,setCoachSeed]=useState(null);       // HH envoyée vers Coach AI "Analyser une main"
  // ── Authentification ──
  const[authUser,setAuthUser]=useState(null);
  const[authProfile,setAuthProfile]=useState(null);
  const[authOpen,setAuthOpen]=useState(false);        // modale connexion/inscription
  const[legalOpen,setLegalOpen]=useState(null);       // document juridique affiche
  const[userMenuOpen,setUserMenuOpen]=useState(false);
  const[authToast,setAuthToast]=useState(null);
  const[statsVersion,setStatsVersion]=useState(0); // force le recalcul du header après merge de progression
  // Connexion d'un utilisateur → charge profil + fusionne la progression compte ↔ locale
  async function onUserSession(user){
    setAuthUser(user);
    const p=await authFetchProfile(user.id);setAuthProfile(p);
    try{
      const merged=await syncProgressOnLogin(user.id,loadStats());
      if(merged){saveStats(merged);setStatsVersion(v=>v+1);}
      const p2=await authFetchProfile(user.id);if(p2)setAuthProfile(p2);
    }catch{}
  }
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const sess=await authGetSession();
      if(mounted&&sess&&sess.user)await onUserSession(sess.user);
    })();
    const unsub=onAuthChange(async(session)=>{
      if(session&&session.user)await onUserSession(session.user);
      else{setAuthUser(null);setAuthProfile(null);}
    });
    return()=>{mounted=false;unsub&&unsub();};
  },[]);
  useEffect(()=>{
    if(tab==="ranges"){
      setReplayerTabSeed("ranges");
      setTab("replayer");
    }
  },[tab]);
  // Push de la progression vers le compte quand l'utilisateur change d'onglet (après une session)
  useEffect(()=>{
    if(authUser){try{authPushProgress(authUser.id,loadStats());}catch{}}
  },[tab]);
  function welcomeToast(name){setAuthToast("👋 Bienvenue, "+(name||"joueur")+" !");setTimeout(()=>setAuthToast(null),3200);}
  const isAdmin=!!(authProfile&&authProfile.role==="admin");
  const adminNeedsPwd=!!(isAdmin&&authProfile&&authProfile.is_admin_password_initialized===false);
  function refreshProfile(){ if(authUser)authFetchProfile(authUser.id).then(p=>{if(p)setAuthProfile(p);}); }
  // Synchronise le module-level avant tout render
  setActiveDeckKey(deckType);
  ACTIVE_CHIP_THEME=chipTheme;
  // Applique les préférences accessibilité (gros texte / contraste) au démarrage
  useEffect(()=>{applyA11yPrefs();},[]);
  const isTrainer=tab==="trainer";
  const isFullHeightTool=isTrainer||tab==="solver";
  // Stats dynamiques pour le header (relues à chaque changement de tab)
  const hdrStats=useMemo(()=>loadStats(),[tab,statsVersion]);
  function handlePrepareEvent(ev){
    const ep=buildEventPreparation(ev,hdrStats);
    saveCoachEvent(ep);
    setCoachJump("event");
    setTab("coach");
  }
  function goCoachLive(){setCoachJump("live");setTab("coach");}
  return(
    <>
      <style>{CSS}</style>
      <style>{CSS_TABLE}</style>
      <div className="app">

        {/* ── TOP HEADER ── */}
        <header className="hdr">
          {/* ── Logo ── */}
          <div className="logo-wrapper" style={{flexShrink:0,display:"flex",alignItems:"center"}}>
            {/* Version header desktop : PF bloc + POKERFORGE */}
            <div className="logo-full-wrap">
              <PFLogoHeader height={48}/>
            </div>
            {/* Version compacte mobile : monogramme PF + requin */}
            <div className="logo-compact-wrap">
              <PFLogoCompact size={40}/>
            </div>
          </div>
          <div className="hdr-sep"/>

          {/* ── DESKTOP: breadcrumb du tab actif — avec SVG icon ── */}
          <div className="hdr-breadcrumb">
            {(()=>{
              const cur=TABS.find(t=>t.id===tab)||TABS[0];
              const navItem=LNAV.find(n=>n.id===tab)||{col:"#4A90FF",lbl:"Dashboard"};
              return(
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <NavIcon id={tab} size={18} color={navItem.col}/>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:700,color:"#FFFFFF",letterSpacing:".04em"}}>{navItem.lbl||cur.l.replace(/^[^\w\s]*\s*/,"")}</span>
                </div>
              );
            })()}
          </div>

          {/* ── MOBILE uniquement: nav scroll ── */}
          <nav className="nav mob-hdr-nav" style={{overflowX:"auto",scrollbarWidth:"none"}}>
            {TABS.map(t=>(
              <div key={t.id} className={`ntab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)}>
                {t.l}
              </div>
            ))}
          </nav>
          <div className="spacer"/>

          {/* Contrôles droits */}
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <div style={{display:"flex",gap:3,background:"rgba(7,27,68,.8)",borderRadius:8,padding:3,border:"1px solid #1A3A80"}}>
              {["BB","$"].map(u=><div key={u} className={`utog${unit===u?" on":""}`} onClick={()=>setUnit(u)}>{u}</div>)}
            </div>
            <span className="hdrbadge" style={{
              color:T.gold,borderColor:"rgba(255,194,71,.3)",background:"rgba(255,194,71,.08)",
              padding:"4px 10px",borderRadius:20,fontFamily:T.mono,
              boxShadow:unit==="BB"?"0 0 12px rgba(255,194,71,.15)":"none"
            }}>
              ⚡ {hdrStats.xp>0?hdrStats.xp.toLocaleString("fr-FR")+" XP":"0 XP"}
            </span>
            {(()=>{
              const lv=hdrStats.level||1;
              const rank=lv>=10?"💎 Diamond":lv>=7?"🥇 Gold":lv>=4?"🥈 Silver":"🥉 Bronze";
              const rankCol=lv>=10?T.purple:lv>=7?T.gold:lv>=4?"#C0C0C0":T.amber;
              return(
                <span className="hdrbadge" style={{
                  color:rankCol,borderColor:rankCol+"44",background:rankCol+"10",
                  padding:"4px 10px",borderRadius:20,fontFamily:T.stats,fontWeight:700,
                  boxShadow:`0 0 12px ${rankCol}28`
                }}>
                  {rank} <span style={{fontSize:9,opacity:.7}}>Lv {lv}</span>
                </span>
              );
            })()}
            {/* Bouton compte / authentification */}
            <button className="pf-acct-btn"
              title={authUser?(authProfile?.username||"Mon compte"):"Se connecter / Créer un compte"}
              onClick={()=>{ if(authUser)setUserMenuOpen(v=>!v); else{setAuthOpen(true);setUserMenuOpen(false);} }}>
              {authUser
                ? <span className="pf-acct-initial">{(authProfile?.username||authUser.email||"?").trim().charAt(0).toUpperCase()}</span>
                : <span style={{fontSize:14}}>🎮</span>}
              {authUser&&<span className="pf-acct-dot"/>}
            </button>
          </div>
        </header>

        {/* ── Modale d'authentification ── */}
        {authOpen&&<AuthModal onClose={()=>setAuthOpen(false)} onAuthed={(name)=>{setAuthOpen(false);welcomeToast(name);}} onOpenLegal={setLegalOpen}/>}
        {legalOpen&&<LegalCenter initialDoc={legalOpen} onClose={()=>setLegalOpen(null)}/>}
        {/* ── Menu utilisateur connecté ── */}
        {userMenuOpen&&authUser&&(
          <UserMenu user={authUser} profile={authProfile} hdrStats={hdrStats}
            onClose={()=>setUserMenuOpen(false)}
            onNav={(t)=>{setUserMenuOpen(false);if(t)setTab(t);}}
            onLogout={async()=>{await authSignOut();setUserMenuOpen(false);setAuthToast("À bientôt — déconnexion réussie.");setTimeout(()=>setAuthToast(null),2600);}}/>
        )}
        {authToast&&<div className="pf-auth-toast">{authToast}</div>}

        {/* ── BODY = LeftNav + Content ── */}
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>

          {/* ── LEFT NAV PREMIUM — SVG icons + per-section color ── */}
          <nav className="leftnav">
            {LNAV.filter(({id})=>["dash","trainer","solver","library","pratique","replayer"].includes(id)).map(({id,lbl,col})=>{
              const isActive=tab===id;
              const isHov=hovNav===id;
              const icCol=isActive?col:isHov?col:"#6B85B8";
              const bgGrad=isActive
                ?`linear-gradient(160deg,${col}1a 0%,${col}0a 100%)`
                :isHov
                ?`linear-gradient(160deg,${col}14 0%,${col}06 100%)`
                :"transparent";
              const border=isActive?`1px solid ${col}55`:isHov?`1px solid ${col}40`:"1px solid transparent";
              const shadow=isActive?`0 0 10px ${col}44,0 0 22px ${col}22`:isHov?`0 0 8px ${col}38,0 0 16px ${col}18`:"none";
              return(
                <div key={id} className="lnav-item" onClick={()=>setTab(id)}
                  onMouseEnter={()=>setHovNav(id)} onMouseLeave={()=>setHovNav(null)}
                  style={{
                    background:bgGrad,border,
                    boxShadow:shadow,
                    transform:isHov&&!isActive?"translateY(-2px)":"none",
                    transition:"all 0.22s ease",
                    position:"relative",
                  }}>
                  {/* Active indicator bar */}
                  {isActive&&(
                    <div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:"60%",borderRadius:"0 3px 3px 0",background:`linear-gradient(180deg,${col},${col}99)`,boxShadow:`0 0 8px ${col}88`}}/>
                  )}
                  {/* SVG Icon */}
                  <div style={{transition:"transform 0.22s ease",transform:isHov&&!isActive?"scale(1.1)":"scale(1)"}}>
                    <NavIcon id={id} size={21} color={icCol}/>
                  </div>
                  {/* Label */}
                  <span style={{
                    fontFamily:"'Inter',sans-serif",fontSize:8.5,fontWeight:isActive?700:600,
                    color:isActive?col:isHov?col:"#5A728E",letterSpacing:".02em",
                    transition:"color 0.22s ease",marginTop:1,
                  }}>{lbl}</span>
                  {/* Tooltip (sidebar collapsed) */}
                  <div style={{
                    position:"absolute",left:"calc(100% + 10px)",top:"50%",transform:"translateY(-50%)",
                    background:"#071B44",border:`1px solid ${col}44`,borderRadius:8,
                    padding:"5px 10px",whiteSpace:"nowrap",
                    fontFamily:"'Inter',sans-serif",fontSize:10,fontWeight:600,color:col,
                    boxShadow:`0 4px 14px rgba(3,7,18,.6),0 0 0 1px ${col}22`,
                    opacity:isHov?1:0,pointerEvents:"none",
                    transition:"opacity 0.18s ease",zIndex:999,
                  }}>
                    <div style={{position:"absolute",right:"100%",top:"50%",transform:"translateY(-50%)",width:0,height:0,borderTop:"5px solid transparent",borderBottom:"5px solid transparent",borderRight:`5px solid ${col}44`}}/>
                    {lbl}
                  </div>
                </div>
              );
            })}
            {/* Coach AI */}
            {(()=>{
              const {lbl,col}=LNAV.find(n=>n.id==="coach")||{lbl:"Coach AI",col:"#1F8BFF"};
              const isActive=tab==="coach";
              const isHov=hovNav==="coach";
              const icCol=isActive?col:isHov?col:"#6B85B8";
              return(
                <div className="lnav-item" onClick={()=>setTab("coach")}
                  onMouseEnter={()=>setHovNav("coach")} onMouseLeave={()=>setHovNav(null)}
                  style={{
                    background:isActive?`linear-gradient(160deg,${col}1a,${col}0a)`:isHov?`linear-gradient(160deg,${col}14,transparent)`:"transparent",
                    border:isActive?`1px solid ${col}55`:isHov?`1px solid ${col}40`:"1px solid transparent",
                    boxShadow:isActive?`0 0 10px ${col}44,0 0 20px ${col}22`:isHov?`0 0 8px ${col}38`:"none",
                    transform:isHov&&!isActive?"translateY(-2px)":"none",transition:"all .22s ease",position:"relative",
                  }}>
                  {isActive&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:"60%",borderRadius:"0 3px 3px 0",background:`linear-gradient(180deg,${col},${col}99)`}}/>}
                  <NavIcon id="coach" size={21} color={icCol}/>
                  <span style={{fontFamily:"'Inter',sans-serif",fontSize:8.5,fontWeight:isActive?700:600,color:isActive?col:isHov?col:"#5A728E",marginTop:1}}>{lbl}</span>
                </div>
              );
            })()}
            <div className="lnav-sep"/>
            {/* Community */}
            {(()=>{
              const {lbl,col}=LNAV.find(n=>n.id==="community")||{lbl:"Commu.",col:"#FF5CC8"};
              const isActive=tab==="community";
              const isHov=hovNav==="community";
              const icCol=isActive?col:isHov?col:"#6B85B8";
              return(
                <div className="lnav-item" onClick={()=>setTab("community")}
                  onMouseEnter={()=>setHovNav("community")} onMouseLeave={()=>setHovNav(null)}
                  style={{
                    background:isActive?`linear-gradient(160deg,${col}1a,${col}0a)`:isHov?`linear-gradient(160deg,${col}14,transparent)`:"transparent",
                    border:isActive?`1px solid ${col}55`:isHov?`1px solid ${col}40`:"1px solid transparent",
                    boxShadow:isActive?`0 0 10px ${col}44,0 0 20px ${col}22`:isHov?`0 0 8px ${col}38`:"none",
                    transform:isHov&&!isActive?"translateY(-2px)":"none",transition:"all .22s ease",position:"relative",
                  }}>
                  {isActive&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:"60%",borderRadius:"0 3px 3px 0",background:`linear-gradient(180deg,${col},${col}99)`}}/>}
                  <NavIcon id="community" size={21} color={icCol}/>
                  <span style={{fontFamily:"'Inter',sans-serif",fontSize:8.5,fontWeight:isActive?700:600,color:isActive?col:isHov?col:"#5A728E",marginTop:1}}>{lbl}</span>
                </div>
              );
            })()}
            {/* Admin — visible uniquement pour role === admin */}
            {isAdmin&&(()=>{
              const col="#FF4560";const isActive=tab==="admin";const isHov=hovNav==="admin";const icCol=isActive?col:isHov?col:"#6B85B8";
              return(
                <div className="lnav-item" onClick={()=>setTab("admin")}
                  onMouseEnter={()=>setHovNav("admin")} onMouseLeave={()=>setHovNav(null)}
                  style={{
                    background:isActive?`linear-gradient(160deg,${col}1a,${col}0a)`:isHov?`linear-gradient(160deg,${col}14,transparent)`:"transparent",
                    border:isActive?`1px solid ${col}55`:isHov?`1px solid ${col}40`:"1px solid transparent",
                    boxShadow:isActive?`0 0 10px ${col}44,0 0 20px ${col}22`:isHov?`0 0 8px ${col}38`:"none",
                    transform:isHov&&!isActive?"translateY(-2px)":"none",transition:"all .22s ease",position:"relative",
                  }}>
                  {isActive&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:"60%",borderRadius:"0 3px 3px 0",background:`linear-gradient(180deg,${col},${col}99)`}}/>}
                  <div style={{fontSize:20,lineHeight:1,filter:isActive||isHov?"none":"grayscale(.4)"}}>🛡️</div>
                  <span style={{fontFamily:"'Inter',sans-serif",fontSize:8.5,fontWeight:isActive?700:600,color:isActive?col:isHov?col:"#5A728E",marginTop:1}}>Admin</span>
                </div>
              );
            })()}
            <div className="lnav-bottom">
              <div className="lnav-sep"/>
              {/* Settings */}
              {(()=>{
                const {lbl,col}=LNAV.find(n=>n.id==="settings")||{lbl:"Params",col:"#C9D4E8"};
                const isActive=tab==="settings";
                const isHov=hovNav==="settings";
                const icCol=isActive?col:isHov?col:"#6B85B8";
                return(
                  <div className="lnav-item" onClick={()=>setTab("settings")}
                    onMouseEnter={()=>setHovNav("settings")} onMouseLeave={()=>setHovNav(null)}
                    style={{
                      background:isActive?`linear-gradient(160deg,${col}14,${col}06)`:isHov?`linear-gradient(160deg,${col}10,transparent)`:"transparent",
                      border:isActive?`1px solid ${col}44`:isHov?`1px solid ${col}30`:"1px solid transparent",
                      boxShadow:isActive?`0 0 8px ${col}33`:isHov?`0 0 6px ${col}28`:"none",
                      transform:isHov&&!isActive?"translateY(-2px)":"none",transition:"all .22s ease",position:"relative",
                    }}>
                    {isActive&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:"60%",borderRadius:"0 3px 3px 0",background:col}}/>}
                    <NavIcon id="settings" size={21} color={icCol}/>
                    <span style={{fontFamily:"'Inter',sans-serif",fontSize:8.5,fontWeight:isActive?700:600,color:isActive?col:isHov?col:"#5A728E",marginTop:1}}>{lbl}</span>
                  </div>
                );
              })()}
              <div className="lnav-item" onClick={()=>setLegalOpen("mentions")}
                onMouseEnter={()=>setHovNav("legal")} onMouseLeave={()=>setHovNav(null)}
                title="Centre juridique"
                style={{
                  background:hovNav==="legal"?"linear-gradient(160deg,rgba(52,216,255,.10),transparent)":"transparent",
                  border:hovNav==="legal"?"1px solid rgba(52,216,255,.28)":"1px solid transparent",
                  boxShadow:hovNav==="legal"?"0 0 7px rgba(0,191,255,.18)":"none",
                  transform:hovNav==="legal"?"translateY(-2px)":"none",transition:"all .22s ease",
                }}>
                <NavIcon id="legal" size={21} color={hovNav==="legal"?"#34D8FF":"#6B85B8"}/>
                <span style={{fontFamily:"'Inter',sans-serif",fontSize:8.5,fontWeight:600,color:hovNav==="legal"?"#34D8FF":"#5A728E",marginTop:1}}>Legal</span>
              </div>
            </div>
          </nav>

          {/* Main content area */}
          <div className="body" style={{
            flex:1,overflow:"hidden",
            flexDirection:isTrainer?"row":"column",
            overflowY:isFullHeightTool?"hidden":"auto",
          }}>
          {tab==="trainer"   && <TrainerTab unit={unit} onGoSolver={(params)=>{setSolverScenario(buildScenarioFromTrainerParams(params));setTab("solver");}} chipTheme={chipTheme} seed={trainerSeed} onSeedApplied={()=>setTrainerSeed(null)}/>}
          {tab==="solver"    && <SharkSolverTab initialScenario={solverScenario} onInitialApplied={()=>setSolverScenario(null)} onGoTrainer={(seed)=>{setTrainerSeed(seed?{...seed,hpos:seed.hpos||seed.heroPos,vpos:seed.vpos||seed.vsPos}:null);setTab("trainer");}} onGoReplayer={()=>{setReplayerTabSeed("solver");setTab("replayer");}}/>}
          {tab==="dash"      && <DashboardTab NavIcon={NavIcon} onGoTrainer={()=>setTab("trainer")} onGoReplayer={()=>setTab("replayer")} onPrepareEvent={handlePrepareEvent} onGoSolver={()=>{setReplayerTabSeed("ranges");setTab("replayer");}} onGoCoach={()=>setTab("coach")} onGoHands={()=>setTab("pratique")}/>}
          {tab==="library"   && <LibraryTab RangeGrid={RangeGrid} RangePopup={RangePopup}/>}
          {tab==="pratique"  && <PracticedHands/>}
          {tab==="replayer"  && <ReplayerTab unit={unit} onGoTrainer={(seed)=>{setTrainerSeed(seed||null);setTab("trainer");}} onGoCoach={(raw)=>{setCoachSeed(raw);setTab("coach");}} initialText={replayerSeed} onInitialApplied={()=>setReplayerSeed(null)} initialTab={replayerTabSeed} onInitialTabApplied={()=>setReplayerTabSeed("replay")}/>}
          {tab==="coach"     && <CoachAITab NavIcon={NavIcon} CoachTab={CoachTab} unit={unit} onGoTrainer={(seed)=>{setTrainerSeed(seed||null);setTab("trainer");}} onGoReplayer={(raw)=>{setReplayerSeed(raw);setTab("replayer");}} seed={coachSeed} onSeedApplied={()=>setCoachSeed(null)} jumpTo={coachJump} onJumped={()=>setCoachJump(null)}/>}
          {tab==="settings"  && <SettingsPanel deckType={deckType} setDeckType={(id)=>{setDeckType(id);setActiveDeckKey(id);}} chipTheme={chipTheme} setChipTheme={(id)=>{setChipTheme(id);ACTIVE_CHIP_THEME=id;localStorage.setItem("pf_chip_theme",id);}} onOpenLegal={setLegalOpen}/>}
          {tab==="admin"     && (
            !isAdmin
              ? <AdminForbidden onBack={()=>setTab("dash")}/>
              : adminNeedsPwd
                ? <AdminSetupPassword email={authUser?.email} onDone={()=>{refreshProfile();setAuthToast("✅ Mot de passe admin défini.");setTimeout(()=>setAuthToast(null),3000);}}/>
                : <AdminDashboard profile={authProfile} onGoTab={setTab}/>
          )}
          {tab==="community" && (
            <div style={{flex:1,overflow:"auto",padding:"28px 32px",background:T.bg}}>
              <div style={{maxWidth:640,margin:"0 auto"}}>
                <div style={{fontFamily:T.brand,fontSize:18,color:T.gold,letterSpacing:".15em",fontWeight:900,marginBottom:4}}>COMMUNAUTÉ</div>
                <div style={{fontSize:11,color:T.text3,fontFamily:T.stats,marginBottom:28}}>Fonctionnalités en cours de développement — roadmap ci-dessous</div>
                {[
                  {ico:"💬",title:"Forum stratégie",desc:"Discussions GTO, spots complexes, analyse collective. Requiert backend (Supabase ou Firebase).",status:"dev",eta:"v8"},
                  {ico:"🃏",title:"Review de mains",desc:"Partagez vos hand histories. Autres membres commentent et scorent. Stockage cloud nécessaire.",status:"dev",eta:"v8"},
                  {ico:"🏆",title:"Leaderboard",desc:"Classement précision GTO par niveau et format. Les stats locales sont prêtes, il manque l'agrégation cloud.",status:"ready",eta:"v7.5"},
                  {ico:"🎓",title:"Coaching IA",desc:"Sessions guidées par l'IA sur tes leaks détectés. L'analyse de leaks existe déjà, il faut le wrapper coaching.",status:"ready",eta:"v7.5"},
                  {ico:"📡",title:"Partage de ranges",desc:"Export/import de ranges personnalisées entre joueurs. Le RangeGrid est implémenté, manque le format d'échange.",status:"ready",eta:"v7.5"},
                ].map((f,i)=>(
                  <div key={i} style={{
                    padding:"14px 18px",borderRadius:12,marginBottom:10,
                    background:f.status==="ready"?`linear-gradient(90deg,rgba(16,216,122,.06),${T.surface})`:f.status==="dev"?`linear-gradient(90deg,rgba(255,194,71,.06),${T.surface})`:T.surface,
                    border:`1px solid ${f.status==="ready"?T.green+"44":f.status==="dev"?T.amber+"44":T.border}`,
                    display:"flex",alignItems:"flex-start",gap:14,
                  }}>
                    <span style={{fontSize:24}}>{f.ico}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontFamily:T.stats,fontSize:12,fontWeight:700,color:T.text}}>{f.title}</span>
                        <span style={{
                          fontSize:8,padding:"2px 7px",borderRadius:20,fontFamily:T.stats,fontWeight:700,
                          background:f.status==="ready"?T.greenDim:f.status==="dev"?T.goldDim:T.surface3,
                          color:f.status==="ready"?T.green:f.status==="dev"?T.gold:T.text3,
                          border:`1px solid ${f.status==="ready"?T.green+"44":f.status==="dev"?T.amber+"44":T.border}`,
                        }}>{f.status==="ready"?"✓ PRÊT À CODER":f.status==="dev"?"⚙ EN DEV":"🔭 FUTUR"}</span>
                        <span style={{marginLeft:"auto",fontSize:8,color:T.text3,fontFamily:T.mono}}>{f.eta}</span>
                      </div>
                      <div style={{fontSize:10.5,color:T.text2,lineHeight:1.6,fontFamily:T.stats}}>{f.desc}</div>
                    </div>
                  </div>
                ))}
                <div style={{marginTop:20,padding:"12px 16px",background:T.goldDim,border:`1px solid ${T.gold}44`,borderRadius:10,fontSize:10,color:T.text2,fontFamily:T.stats,lineHeight:1.7}}>
                  💡 <strong style={{color:T.gold}}>Note :</strong> Les fonctionnalités "✓ Prêt à coder" utilisent déjà les données locales collectées. Dès qu'un backend minimal (Supabase Free) sera ajouté, elles basculeront en prod instantanément.
                </div>
              </div>
            </div>
          )}
          </div>{/* end body main */}
        </div>{/* end flex row */}

        {/* ── BOTTOM NAV MOBILE ── */}
        <nav className="mobile-bottom-nav">
          {[
            {id:"dash",    ico:"🏠", lbl:"Home"},
            {id:"trainer", ico:"🎯", lbl:"Train"},
            {id:"replayer",ico:"⚡", lbl:"Replay"},
            {id:"coach",   ico:"🎓", lbl:"Coach"},
            {id:"settings",ico:"⚙️", lbl:"Params"},
          ].map(({id,ico,lbl})=>(
            <div key={id} className={`mob-nav-btn${tab===id?" on":""}`} onClick={()=>setTab(id)}>
              <span className="lnav-ico" style={{fontSize:18}}>{ico}</span>
              <span className="lnav-lbl" style={{color:tab===id?T.blue:T.text4,fontSize:7.5}}>{lbl}</span>
            </div>
          ))}
        </nav>

        <CoachFloatingButton tab={tab} onGoCoach={goCoachLive}/>
      </div>
    </>
  );
}
