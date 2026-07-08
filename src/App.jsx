import { CSS, CSS_TABLE } from "./styles.js";
import { CARD_DECKS, getSuitStyle, getActiveDeck, setActiveDeckKey } from "./components/table/deck.js";
import { Card, CardBack, HeroHoleCards, VillainBackCards, CardFlip, MiniCard } from "./components/table/Cards.jsx";
import { BlindChipStack, TrainingPotStack, SeatActionZone, PlayerSeat, ChipThemeSelector } from "./components/table/Chips.jsx";
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
import CoachTab from "./tabs/CoachToolsTab.jsx";
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

function SettingsPanel({deckType,setDeckType,chipTheme="neon_modern",setChipTheme,chipColor="blue",setChipColor,chipSizeMode="auto",setChipSizeMode,onOpenLegal}){
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
        <div className="settings-section-title">🪙 Jetons du Trainer</div>
        <ChipThemeSelector
          chipTheme={chipTheme}
          chipColor={chipColor}
          chipSizeMode={chipSizeMode}
          onThemeChange={setChipTheme}
          onColorChange={setChipColor}
          onSizeModeChange={setChipSizeMode}
        />
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
  const[chipTheme,setChipTheme]=useState(()=>{
    const saved=localStorage.getItem("pf_chip_theme")||"neon_modern";
    return saved==="blue"?"neon_modern":saved==="gold"?"vip_gold":saved==="titan"?"premium_casino":saved;
  });
  const[chipColor,setChipColor]=useState(()=>localStorage.getItem("pf_chip_color")||"blue");
  const[chipSizeMode,setChipSizeMode]=useState(()=>localStorage.getItem("pf_chip_size_mode")||"auto");
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
          {tab==="trainer"   && <TrainerTab unit={unit} onGoSolver={(params)=>{setSolverScenario(buildScenarioFromTrainerParams(params));setTab("solver");}} chipTheme={chipTheme} chipColor={chipColor} chipSizeMode={chipSizeMode} seed={trainerSeed} onSeedApplied={()=>setTrainerSeed(null)}/>}
          {tab==="solver"    && <SharkSolverTab initialScenario={solverScenario} onInitialApplied={()=>setSolverScenario(null)} onGoTrainer={(seed)=>{setTrainerSeed(seed?{...seed,hpos:seed.hpos||seed.heroPos,vpos:seed.vpos||seed.vsPos}:null);setTab("trainer");}} onGoReplayer={()=>{setReplayerTabSeed("solver");setTab("replayer");}}/>}
          {tab==="dash"      && <DashboardTab NavIcon={NavIcon} onGoTrainer={()=>setTab("trainer")} onGoReplayer={()=>setTab("replayer")} onPrepareEvent={handlePrepareEvent} onGoSolver={()=>{setReplayerTabSeed("ranges");setTab("replayer");}} onGoCoach={()=>setTab("coach")} onGoHands={()=>setTab("pratique")}/>}
          {tab==="library"   && <LibraryTab RangeGrid={RangeGrid} RangePopup={RangePopup}/>}
          {tab==="pratique"  && <PracticedHands/>}
          {tab==="replayer"  && <ReplayerTab unit={unit} onGoTrainer={(seed)=>{setTrainerSeed(seed||null);setTab("trainer");}} onGoCoach={(raw)=>{setCoachSeed(raw);setTab("coach");}} initialText={replayerSeed} onInitialApplied={()=>setReplayerSeed(null)} initialTab={replayerTabSeed} onInitialTabApplied={()=>setReplayerTabSeed("replay")}/>}
          {tab==="coach"     && <CoachAITab NavIcon={NavIcon} CoachTab={CoachTab} unit={unit} onGoTrainer={(seed)=>{setTrainerSeed(seed||null);setTab("trainer");}} onGoReplayer={(raw)=>{setReplayerSeed(raw);setTab("replayer");}} seed={coachSeed} onSeedApplied={()=>setCoachSeed(null)} jumpTo={coachJump} onJumped={()=>setCoachJump(null)}/>}
          {tab==="settings"  && <SettingsPanel deckType={deckType} setDeckType={(id)=>{setDeckType(id);setActiveDeckKey(id);}} chipTheme={chipTheme} setChipTheme={(id)=>{setChipTheme(id);ACTIVE_CHIP_THEME=id;localStorage.setItem("pf_chip_theme",id);}} chipColor={chipColor} setChipColor={(id)=>{setChipColor(id);localStorage.setItem("pf_chip_color",id);}} chipSizeMode={chipSizeMode} setChipSizeMode={(id)=>{setChipSizeMode(id);localStorage.setItem("pf_chip_size_mode",id);}} onOpenLegal={setLegalOpen}/>}
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
