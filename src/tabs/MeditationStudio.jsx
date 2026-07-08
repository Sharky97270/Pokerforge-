// PokerForge Meditation Studio — expérience de préparation mentale premium.
// Audio : ambiances générées en WebAudio (aucune piste protégée) + narration
// voix naturelle via l'edge function meditation-tts (OpenAI TTS, clé serveur),
// avec repli automatique sur la voix du navigateur (speechSynthesis) si indispo.
import React, { useState, useEffect, useRef, useMemo } from "react";
import "./MeditationStudio.css";
import { MEDITATIONS, MEDITATION_CATS, BREATH_PROTOCOLS, ROUTINE_PACKS, getMeditation } from "../data/meditations.js";
import { TTS_VOICES, ttsAvailable, fetchTTSUrl, prefetchTTS } from "../meditationTTS.js";

const VOICE_LABEL = { f_soft:"Femme douce", f:"Femme", m:"Homme", m_deep:"Homme grave" };
const normVoice = v => (v==="female"?"f":v==="male"?"m":(VOICE_LABEL[v]?v:"f"));

const LEVEL_LABEL = { novice:"Novice", inter:"Intermédiaire", expert:"Expert" };
const CAT_OF = id => MEDITATION_CATS.find(c => c.id === id) || { col:"#1F8BFF", icon:"🧘", label:"" };
const fmtT = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ═══════════════ Moteur d'ambiance sonore (WebAudio, 100% généré) ═══════════════ */
function createAmbiance(kind){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC || kind==="silence") return null;
  let ctx;
  try{ ctx = new AC(); }catch(e){ return null; }
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  // Bruit de base (buffer 2s bouclé)
  const buf = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for(let i=0;i<d.length;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=last*3.2; } // brown-ish
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const filter = ctx.createBiquadFilter();
  const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain();
  if(kind==="pluie"){ filter.type="highpass"; filter.frequency.value=900; }
  else if(kind==="vagues"){ filter.type="lowpass"; filter.frequency.value=520; lfo.frequency.value=0.12; lfoGain.gain.value=0.5; lfo.connect(lfoGain); lfoGain.connect(master.gain); lfo.start(); }
  else if(kind==="nuit"){ filter.type="lowpass"; filter.frequency.value=280;
    const drone = ctx.createOscillator(); drone.type="sine"; drone.frequency.value=110; const dg=ctx.createGain(); dg.gain.value=0.015; drone.connect(dg); dg.connect(master); drone.start(); }
  else { filter.type="lowpass"; filter.frequency.value=700; }
  src.connect(filter); filter.connect(master); src.start();
  return {
    setVolume(v){ try{ master.gain.setTargetAtTime(Math.max(0,Math.min(0.6,v*0.6)), ctx.currentTime, 0.4); }catch(e){} },
    stop(){ try{ master.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(()=>{try{ctx.close();}catch(e){}}, 500); }catch(e){} },
    resume(){ try{ ctx.resume(); }catch(e){} },
  };
}

/* ═══════════════ Cercle de respiration ═══════════════ */
function BreathingCircle({ protocolId, playing }){
  const proto = BREATH_PROTOCOLS[protocolId] || BREATH_PROTOCOLS.coherence;
  const cycleLen = proto.phases.reduce((a,p)=>a+p.s, 0);
  const [tick, setTick] = useState(0);              // secondes écoulées dans la boucle
  useEffect(()=>{ setTick(0); }, [protocolId]);
  useEffect(()=>{
    if(!playing) return;
    const iv = setInterval(()=>setTick(t=>t+1), 1000);
    return ()=>clearInterval(iv);
  },[playing, protocolId]);
  // Dérive la phase courante depuis un seul compteur (aucun setState dans un updater)
  const mod = tick % cycleLen;
  let acc = 0, phaseIdx = 0, into = 0;
  for(let i=0;i<proto.phases.length;i++){ if(mod < acc+proto.phases[i].s){ phaseIdx=i; into=mod-acc; break; } acc += proto.phases[i].s; }
  const phase = proto.phases[phaseIdx];
  const left = phase.s - into;
  const isInhale = /inspire/i.test(phase.l);
  const isExhale = /expire/i.test(phase.l);
  const scale = isInhale ? 1 : isExhale ? 0.55 : (phaseIdx===0?1:(/inspire/i.test(proto.phases[Math.max(0,phaseIdx-1)].l)?1:0.55));
  return (
    <div className="med-breath-wrap">
      <div className="med-breath">
        <div className="med-breath-ring" style={{ transform:`scale(${playing?scale:0.78})`, transitionDuration:`${playing?phase.s:0.6}s` }}/>
        <div className="med-breath-core">
          <div className="ph">{playing?phase.l:"Prêt ?"}</div>
          <div className="cd">{playing?left:"—"}</div>
        </div>
      </div>
      <div className="med-breath-proto">{proto.label}</div>
    </div>
  );
}

/* ═══════════════ Lecteur immersif ═══════════════ */
function MeditationPlayer({ med, prefs, onSavePrefs, onFinish, onClose }){
  const total = med.duration*60;
  const paras = med.guide;
  const perPara = total / paras.length;
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [voice, setVoice] = useState(normVoice(prefs.voice)); // f_soft | f | m | m_deep | off
  const [ambiance, setAmbiance] = useState(prefs.ambiance==="auto"?med.ambiance:prefs.ambiance);
  const [rate, setRate] = useState(prefs.rate);
  const [volume, setVolume] = useState(prefs.volume ?? 0.6);
  const [done, setDone] = useState(false);
  const [apiTTS, setApiTTS] = useState(false);   // voix naturelle serveur disponible
  const [ttsBusy, setTtsBusy] = useState(false); // génération de la voix en cours
  const ambRef = useRef(null);
  const audioRef = useRef(null);                 // <audio> pour la voix API
  const speechOK = typeof window!=="undefined" && "speechSynthesis" in window;
  const ttsOK = apiTTS || speechOK;

  const paraIdx = Math.min(paras.length-1, Math.floor(elapsed/perPara));

  // Disponibilité de la voix naturelle serveur (une seule fois)
  useEffect(()=>{ ttsAvailable().then(setApiTTS); },[]);

  // Horloge maîtresse (updater pur : pas de setState d'un autre composant ici)
  useEffect(()=>{
    if(!playing) return;
    const iv = setInterval(()=>{ setElapsed(e=>Math.min(total, e+1)); }, 1000);
    return ()=>clearInterval(iv);
  },[playing]); // eslint-disable-line
  // Fin de séance détectée après rendu (effet), jamais dans un updater
  useEffect(()=>{ if(playing && elapsed>=total) finish(); },[elapsed, playing]); // eslint-disable-line

  // Ambiance
  useEffect(()=>{
    if(playing && ambiance!=="silence" && !ambRef.current){ ambRef.current = createAmbiance(ambiance); }
    if(ambRef.current){ ambRef.current.resume(); ambRef.current.setVolume(playing?volume:0); }
    return ()=>{};
  },[playing]); // eslint-disable-line
  useEffect(()=>{ if(ambRef.current) ambRef.current.setVolume(playing?volume:0); },[volume]); // eslint-disable-line
  // Changement d'ambiance en cours de lecture
  useEffect(()=>{
    if(!playing) return;
    if(ambRef.current){ ambRef.current.stop(); ambRef.current=null; }
    if(ambiance!=="silence"){ ambRef.current = createAmbiance(ambiance); if(ambRef.current) ambRef.current.setVolume(volume); }
  },[ambiance]); // eslint-disable-line

  function stopAudio(){ try{ if(audioRef.current) audioRef.current.pause(); }catch(e){} }
  function cancelSpeech(){ if(speechOK){ try{ window.speechSynthesis.cancel(); }catch(e){} } }

  // Narration : voix naturelle serveur (API) si dispo, sinon voix du navigateur.
  useEffect(()=>{
    if(!playing || voice==="off") return;
    let cancelled = false;
    stopAudio(); cancelSpeech();
    (async ()=>{
      if(apiTTS){
        setTtsBusy(true);
        const url = await fetchTTSUrl(paras[paraIdx], voice, rate);
        if(cancelled) return;
        setTtsBusy(false);
        if(url && audioRef.current && playing){
          audioRef.current.src = url;
          audioRef.current.play().catch(()=>{});
          if(paraIdx+1 < paras.length) prefetchTTS(paras[paraIdx+1], voice, rate); // pré-génère la suite
          return;
        }
      }
      if(!cancelled && speechOK) speakBrowser(paras[paraIdx]); // repli
    })();
    return ()=>{ cancelled = true; };
  },[paraIdx, playing, voice, rate, apiTTS]); // eslint-disable-line

  function speakBrowser(text){
    if(!speechOK) return;
    try{
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const female = voice==="f_soft" || voice==="f";
      u.lang="fr-FR"; u.rate=rate;
      u.pitch = voice==="m_deep"?0.7 : voice==="m"?0.85 : voice==="f_soft"?1.15 : 1.05;
      const vs = window.speechSynthesis.getVoices().filter(v=>/fr/i.test(v.lang));
      if(vs.length){ const want = female ? vs.find(v=>/(amelie|audrey|female|femme|marie|virginie|c[ée]line)/i.test(v.name)) : vs.find(v=>/(thomas|male|homme|paul|nicolas)/i.test(v.name)); u.voice = want||vs[0]; }
      window.speechSynthesis.speak(u);
    }catch(e){}
  }

  function finish(){
    setPlaying(false);
    stopAudio(); cancelSpeech();
    if(ambRef.current){ ambRef.current.stop(); ambRef.current=null; }
    onSavePrefs({ voice, ambiance:prefs.ambiance==="auto"?"auto":ambiance, rate, volume });
    setDone(true);
  }
  function hardStop(){
    setPlaying(false); setElapsed(0);
    stopAudio(); cancelSpeech();
    if(ambRef.current){ ambRef.current.stop(); ambRef.current=null; }
  }
  useEffect(()=>()=>{ // cleanup au démontage
    stopAudio(); cancelSpeech();
    if(ambRef.current){ ambRef.current.stop(); }
  },[]); // eslint-disable-line

  if(done) return <MeditationPostForm med={med} onFinish={onFinish} onClose={onClose}/>;

  const cat = CAT_OF(med.cat);
  return (
    <div className="med-player-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget){ hardStop(); onClose(); } }}>
      <div className="med-player" style={{ "--cat-col":cat.col }}>
        <button className="med-player-close" onClick={()=>{ hardStop(); onClose(); }} aria-label="Fermer">✕</button>
        <h2>{med.title}</h2>
        <div className="med-player-sub">{cat.icon} {cat.label} · {LEVEL_LABEL[med.level]} · {med.duration} min · {med.objectif}</div>

        <BreathingCircle protocolId={med.breath} playing={playing}/>

        <audio ref={audioRef} preload="auto"
          onPlay={()=>{ if(ambRef.current) ambRef.current.setVolume(volume*0.4); }}
          onEnded={()=>{ if(ambRef.current) ambRef.current.setVolume(volume); }}
          onPause={()=>{ if(ambRef.current) ambRef.current.setVolume(volume); }}/>

        <div className={`med-guide-text${playing&&voice!=="off"?" speaking":""}`}>
          <div className="med-guide-idx">GUIDE · {paraIdx+1}/{paras.length}
            {voice==="off" ? "" : ttsBusy ? " · génération de la voix…" : apiTTS ? " · voix naturelle IA" : speechOK ? " · voix navigateur" : ""}
          </div>
          {paras[paraIdx]}
        </div>

        <div className="med-transport">
          <button className="med-play-btn" onClick={()=>setPlaying(p=>!p)}>{playing?"⏸":"▶"}</button>
          <button className="med-mini-btn" onClick={hardStop} title="Recommencer">⏹</button>
          <div className="med-progress">
            <div className="med-progress-track" onClick={e=>{ const r=e.currentTarget.getBoundingClientRect(); setElapsed(Math.round((e.clientX-r.left)/r.width*total)); }}>
              <div className="med-progress-fill" style={{ width:`${elapsed/total*100}%` }}/>
            </div>
          </div>
          <span className="med-time">{fmtT(total-elapsed)}</span>
        </div>

        <div className="med-controls">
          <div className="med-ctl" style={{gridColumn:"1 / -1"}}>
            <label>VOIX {apiTTS?"· naturelle IA":speechOK?"· navigateur":""}</label>
            <div className="med-seg">
              {TTS_VOICES.map(v=>(
                <button key={v.id} className={voice===v.id?"on":""} onClick={()=>setVoice(v.id)}>{v.label}</button>
              ))}
              <button className={voice==="off"?"on":""} onClick={()=>setVoice("off")}>Silence</button>
            </div>
          </div>
          <div className="med-ctl">
            <label>AMBIANCE</label>
            <div className="med-seg">
              {[["pluie","Pluie"],["vagues","Vagues"],["nuit","Nuit"],["silence","Aucune"]].map(([k,l])=>(
                <button key={k} className={ambiance===k?"on":""} onClick={()=>setAmbiance(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="med-ctl">
            <label>VITESSE NARRATION · {rate.toFixed(2)}×</label>
            <input type="range" min="0.6" max="1.2" step="0.05" value={rate} onChange={e=>setRate(+e.target.value)}/>
          </div>
          <div className="med-ctl">
            <label>VOLUME AMBIANCE</label>
            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>setVolume(+e.target.value)}/>
          </div>
        </div>

        <div className="med-audio-note">
          {apiTTS ? "🎧 Narration en voix naturelle (IA) · ambiance générée en direct · la voix s'adapte au timbre choisi."
                 : speechOK ? "🎧 Voix naturelle IA indisponible — repli sur la voix du navigateur · ambiance en direct."
                 : "🎧 Voix indisponible sur ce navigateur — mode texte guidé + ambiance. Suis le rythme du minuteur."}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Formulaire post-séance ═══════════════ */
const MOODS = [["calme","😌 Calme"],["concentre","🎯 Concentré"],["fatigue","😮‍💨 Fatigué"],["tilt","🔥 Encore en tilt"],["pret","🚀 Prêt à jouer"]];
function MeditationPostForm({ med, onFinish, onClose }){
  const [calm, setCalm] = useState(7);
  const [focus, setFocus] = useState(7);
  const [mood, setMood] = useState(null);
  const cat = CAT_OF(med.cat);
  const nextReco = MEDITATIONS.find(x=>x.cat===med.cat && x.id!==med.id);
  return (
    <div className="med-player-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="med-player med-post" style={{ "--cat-col":cat.col, maxWidth:520 }}>
        <button className="med-player-close" onClick={onClose} aria-label="Fermer">✕</button>
        <h2>✓ Séance terminée</h2>
        <div className="med-post-xp">+{med.xp} XP · {med.title}</div>

        <div className="med-post-q">Comment te sens-tu maintenant ?</div>
        <div className="med-mood">
          {MOODS.map(([k,l])=><button key={k} className={mood===k?"on":""} onClick={()=>setMood(k)}>{l}</button>)}
        </div>

        <div className="med-post-q">Ton ressenti</div>
        <div className="med-slider-row"><span>Niveau de calme</span><input type="range" min="1" max="10" value={calm} onChange={e=>setCalm(+e.target.value)}/><b>{calm}</b></div>
        <div className="med-slider-row"><span>Concentration</span><input type="range" min="1" max="10" value={focus} onChange={e=>setFocus(+e.target.value)}/><b>{focus}</b></div>

        {nextReco && (
          <div className="med-reco" style={{ marginTop:14, marginBottom:0 }}>
            <div className="med-reco-head">💡 Séance suivante recommandée</div>
            <div className="med-reco-row">
              <div className="med-reco-chip" onClick={()=>onFinish({ calm, focus, mood, next:nextReco.id })}>
                <b>{nextReco.title}</b><small>{nextReco.duration} min · {LEVEL_LABEL[nextReco.level]}</small><span className="med-go">→</span>
              </div>
            </div>
          </div>
        )}

        <div className="med-card-btns" style={{ marginTop:16 }}>
          <button className="med-btn play" onClick={()=>onFinish({ calm, focus, mood, next:null })}>Enregistrer &amp; fermer</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Recommandations Coach IA ═══════════════ */
function buildRecommendations(m){
  const today = new Date().toISOString().slice(0,10);
  const hour = new Date().getHours();
  const tiltToday = (m.tiltLog||[]).some(t => String(t.date||t).slice(0,10)===today);
  const lastPost = (m.postReviews||[]).slice(-1)[0];
  const negPost = lastPost && (lastPost.mood==="tilt" || (lastPost.result||"")==="perte");
  const sc = m.scores||{};
  const recs = [];
  if(tiltToday){ recs.push({ id:"tilt-badbeat", why:"Tu as déclaré un tilt récemment." }); recs.push({ id:"var-accept", why:"Enchaîne avec l'acceptation de la variance pour clore l'épisode." }); }
  if(m.downswing){ recs.push({ id:"var-downswing", why:"Tu traverses un downswing — voici ton point d'appui mental." }); }
  if(m.tournPrep){ recs.push({ id:"focus-zone", why:"Un tournoi est dans ton plan : prépare ta zone de concentration." }); }
  if(negPost && !tiltToday){ recs.push({ id:"post-discharge", why:"Ta dernière session s'est mal terminée — décharge mentale conseillée." }); }
  if((sc.tiltControl||100)<50){ recs.push({ id:"tilt-revenge", why:"Ton contrôle du tilt est fragile en ce moment." }); }
  if((sc.confidence||100)<50){ recs.push({ id:"conf-anchor", why:"Un ancrage de confiance t'aiderait à stabiliser ton mental." }); }
  if(recs.length===0){
    if(hour>=20 || hour<5) recs.push({ id:"post-discharge", why:"Fin de journée : décompresse pour bien récupérer." });
    else if(hour<12) recs.push({ id:"pre-focus", why:"Bonne routine du matin : arrive posé à ta première session." });
    else recs.push({ id:"focus-5min", why:"Un shot de focus pour attaquer ta prochaine session." });
  }
  // dédoublonne, garde 3 max, ne garde que celles qui existent
  const seen = new Set(); const out = [];
  for(const r of recs){ if(seen.has(r.id)) continue; if(!getMeditation(r.id)) continue; seen.add(r.id); out.push(r); if(out.length>=3) break; }
  return out;
}

/* ═══════════════ Studio (composant principal) ═══════════════ */
export default function MeditationStudio({ m, setM, addXp, bump, initialOpen=null, onJumpConsumed }){
  const [level, setLevel] = useState(m.medPrefs?.level || "all"); // all | novice | inter | expert
  const [cat, setCat] = useState("all");
  const [active, setActive] = useState(null); // méditation en cours
  const prefs = m.medPrefs || { voice:"female", ambiance:"auto", rate:0.9, volume:0.6, level:"all" };

  // Deep-link : un autre module (tilt, post-session, plan tournoi) demande d'ouvrir une séance
  useEffect(()=>{
    if(!initialOpen) return;
    const med = getMeditation(initialOpen);
    if(med){ setActive(med); const c = MEDITATION_CATS.find(x=>x.id===med.cat); if(c) setCat(c.id); }
    onJumpConsumed && onJumpConsumed();
  },[initialOpen]); // eslint-disable-line

  const recs = useMemo(()=>buildRecommendations(m), [m.tiltLog, m.downswing, m.tournPrep, m.postReviews, m.scores]);
  const history = m.medHistory || [];
  const doneCount = id => history.filter(h=>h.id===id).length;
  const totalMin = Math.round((m.medTotalSec||0)/60);
  const streak = m.medStreak || 0;

  const list = useMemo(()=>MEDITATIONS.filter(x =>
    (cat==="all" || x.cat===cat) && (level==="all" || x.level===level)
  ), [cat, level]);

  function open(id){ const med = getMeditation(id); if(med) setActive(med); }
  function savePrefs(p){ setM(x=>({ ...x, medPrefs:{ ...(x.medPrefs||{}), ...p, level } })); }

  function onFinish({ calm, focus, mood, next }){
    const med = active;
    const today = new Date().toISOString().slice(0,10);
    setM(x=>{
      const prevDay = x.medLastDay;
      const y = new Date(Date.now()-864e5).toISOString().slice(0,10);
      const streakNext = prevDay===today ? (x.medStreak||1) : prevDay===y ? (x.medStreak||0)+1 : 1;
      return {
        ...x,
        medHistory:[{ id:med.id, title:med.title, date:new Date().toISOString(), calm, focus, mood, xp:med.xp }, ...(x.medHistory||[])].slice(0,120),
        medStreak:streakNext, medLastDay:today,
        medTotalSec:(x.medTotalSec||0)+med.duration*60,
      };
    });
    addXp && addXp(med.xp);
    bump && bump("concentration", 1);
    if(mood==="calme"||mood==="pret") bump && bump("tiltControl", 1);
    setActive(null);
    if(next){ const nm = getMeditation(next); if(nm) setTimeout(()=>setActive(nm), 200); }
  }

  return (
    <div className="med-studio">
      {/* Hero */}
      <div className="med-hero">
        <div className="med-hero-orb"/>
        <div>
          <h1>MEDITATION STUDIO</h1>
          <p>Ton espace de préparation mentale. Respire, visualise, entre dans ton A-Game — avant, pendant et après les sessions.</p>
        </div>
        <div className="med-hero-stats">
          <div className="med-stat"><span>SÉRIE</span><strong>🔥 {streak}j</strong></div>
          <div className="med-stat"><span>TEMPS TOTAL</span><strong>{totalMin} min</strong></div>
          <div className="med-stat"><span>SÉANCES</span><strong>{history.length}</strong></div>
          <div className="med-level-toggle">
            {[["all","Tous"],["novice","Novice"],["expert","Expert"]].map(([k,l])=>(
              <button key={k} className={level===k?"on":""} onClick={()=>setLevel(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Reco Coach IA */}
      {recs.length>0 && (
        <div className="med-reco">
          <div className="med-reco-head">🤖 RECOMMANDATION DU COACH IA</div>
          <div className="med-reco-why">{recs[0].why}{recs.length>1?" Deux séances suggérées ci-dessous.":""}</div>
          <div className="med-reco-row">
            {recs.map(r=>{ const med=getMeditation(r.id); return (
              <div key={r.id} className="med-reco-chip" onClick={()=>open(r.id)}>
                <span style={{fontSize:16}}>{CAT_OF(med.cat).icon}</span>
                <div><b>{med.title}</b><br/><small>{med.duration} min · {LEVEL_LABEL[med.level]}</small></div>
                <span className="med-go">▶</span>
              </div>
            );})}
          </div>
        </div>
      )}

      {/* Routines */}
      <div className="med-section-title">🧩 Routines préconstruites</div>
      <div className="med-routines">
        {ROUTINE_PACKS.map(rt=>(
          <div key={rt.id} className="med-routine" onClick={()=>open(rt.steps[0])}>
            <div className="med-routine-ic">{rt.icon}</div>
            <b>{rt.title}</b>
            <small>{rt.desc}</small>
            <div className="med-routine-steps">{rt.steps.map(s=>getMeditation(s)?.title).filter(Boolean).join(" → ")}</div>
          </div>
        ))}
      </div>

      {/* Filtres catégories */}
      <div className="med-cats">
        <span className={`med-cat${cat==="all"?" on":""}`} style={cat==="all"?{background:"linear-gradient(135deg,#1F8BFF,#7c3cff)"}:{}} onClick={()=>setCat("all")}>Toutes</span>
        {MEDITATION_CATS.map(c=>(
          <span key={c.id} className={`med-cat${cat===c.id?" on":""}`} style={cat===c.id?{background:c.col,color:"#04101f"}:{}} onClick={()=>setCat(c.id)}>{c.icon} {c.label}</span>
        ))}
      </div>

      {/* Grille */}
      <div className="med-section-title">🎧 {cat==="all"?"Toutes les séances":CAT_OF(cat).label} · {list.length}</div>
      <div className="med-grid">
        {list.map(med=>{ const c=CAT_OF(med.cat); const done=doneCount(med.id); return (
          <div key={med.id} className="med-card" style={{ "--cat-col":c.col }}>
            <div className="med-card-top">
              <div className="med-card-ic">{c.icon}</div>
              <div style={{minWidth:0}}>
                <h3>{med.title}</h3>
                <div className="med-card-tags">
                  <span className="med-tag dur">{med.duration} min</span>
                  <span className={`med-tag lvl-${med.level}`}>{LEVEL_LABEL[med.level]}</span>
                  <span className="med-tag audio">🎧 Audio</span>
                </div>
              </div>
            </div>
            <div className="med-card-obj">{med.objectif}</div>
            <div className="med-card-foot">
              <span className="med-xp">+{med.xp} XP</span>
              {done>0 && <span className="med-done">✓ {done}× réalisée</span>}
            </div>
            <div className="med-card-btns">
              <button className="med-btn play" onClick={()=>open(med.id)}>▶ Démarrer</button>
              <button className="med-btn" onClick={()=>open(med.id)}>Aperçu</button>
            </div>
          </div>
        );})}
      </div>

      {active && (
        <MeditationPlayer
          med={active}
          prefs={prefs}
          onSavePrefs={savePrefs}
          onFinish={onFinish}
          onClose={()=>setActive(null)}
        />
      )}
    </div>
  );
}
