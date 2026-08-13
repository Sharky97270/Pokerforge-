/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : PANNEAU D'ANALYSE DE LA DÉCISION (§21/§22/§29)

   Affiche pour la décision Hero courante : action jouée, action de référence,
   fréquences, sizings, EV / EV Loss, note (A+→D) — avec un BADGE DE PROVENANCE
   honnête (Solveur vs Estimation heuristique). Aucune valeur n'est inventée :
   si aucune référence n'existe, on l'affiche explicitement (§22).

   « Analyser toute la main » (§29) classe chaque décision Hero et permet de
   naviguer directement d'une erreur à l'autre.
═══════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect } from "react";
import { T } from "../theme.js";
import { analyzeDecision, analyzeHand, CLASS } from "./decisionAnalysis.js";
import { handObservations, detectLeaks } from "./leakEngine.js";

const CLASS_META = {
  [CLASS.EXCELLENTE]:{ col:"#10D87A", ico:"★", lbl:"Excellente" },
  [CLASS.BONNE]:     { col:"#3ED598", ico:"✓", lbl:"Bonne" },
  [CLASS.IMPRECISION]:{col:"#FFC247", ico:"≈", lbl:"Imprécision" },
  [CLASS.ERREUR]:    { col:"#FF8A3D", ico:"✗", lbl:"Erreur" },
  [CLASS.CRITIQUE]:  { col:"#FF4560", ico:"‼", lbl:"Erreur critique" },
  [CLASS.INCONNUE]:  { col:"#6F81A8", ico:"—", lbl:"Non évaluée" },
};
const metaOf = c => CLASS_META[c] || CLASS_META[CLASS.INCONNUE];

function SourceBadge({ source, note }){
  const solver = source==="solver";
  const none = source==="none";
  const col = solver ? "#34D8FF" : none ? "#6F81A8" : T.gold;
  const lbl = solver ? "SOLVEUR" : none ? "AUCUNE RÉFÉRENCE" : "ESTIMATION";
  return (
    <span title={note||""} style={{fontSize:7,fontWeight:800,letterSpacing:".06em",color:col,
      background:`${col}1A`,border:`1px solid ${col}55`,borderRadius:4,padding:"1px 5px",
      fontFamily:T.stats,whiteSpace:"nowrap"}}>{lbl}</span>
  );
}

/* Barre de fréquence + EV d'une action de référence. */
function AltRow({ alt, isPlayed, isBest, fmtEv }){
  const col = isBest ? "#10D87A" : isPlayed ? T.gold : T.text3;
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0"}}>
      <span style={{minWidth:58,fontSize:9,fontWeight:700,fontFamily:T.stats,color:col,
        display:"flex",alignItems:"center",gap:3}}>
        {isPlayed && <span style={{fontSize:8}}>▸</span>}{alt.label}
      </span>
      <div style={{flex:1,height:7,background:"rgba(255,255,255,.06)",borderRadius:4,overflow:"hidden",minWidth:40}}>
        <div style={{height:"100%",width:`${Math.max(0,Math.min(100,alt.freq??0))}%`,
          background:isBest?"linear-gradient(90deg,#10D87A,#3ED598)":isPlayed?"linear-gradient(90deg,#FFC247,#D4891A)":"rgba(159,176,204,.45)",
          borderRadius:4,transition:"width .2s"}}/>
      </div>
      <span style={{minWidth:30,textAlign:"right",fontSize:8.5,fontFamily:T.stats,color:T.text3}}>
        {alt.freq!=null?`${alt.freq}%`:"—"}
      </span>
      <span style={{minWidth:44,textAlign:"right",fontSize:8.5,fontFamily:"'JetBrains Mono',monospace",
        color:typeof alt.evBb==="number"?(alt.evBb>=0?"#3ED598":T.red):T.text4}}>
        {typeof alt.evBb==="number"?fmtEv(alt.evBb):"—"}
      </span>
    </div>
  );
}

export default function DecisionPanel({ hand, snaps, step, setStep, ctx, quickRes, leakAgg }){
  const [full,setFull] = useState(null);
  const [errIdx,setErrIdx] = useState(0);

  // §13 — observations factuelles de CETTE main (n = 1, jamais un leak).
  const observations = useMemo(()=>{
    if(!hand || !snaps) return [];
    try{ return handObservations(hand, snaps, full?.decisions||[]); }catch{ return []; }
  },[hand, snaps, full]);
  // §14 — tendances agrégées sur l'historique local.
  const leaks = useMemo(()=>{
    try{ return detectLeaks(leakAgg); }catch{ return []; }
  },[leakAgg]);

  // Nouvelle main → on réinitialise l'analyse complète
  useEffect(()=>{ setFull(null); setErrIdx(0); },[hand?.id]);

  const decision = useMemo(()=>{
    if(!hand || !snaps || !snaps[step]) return null;
    try{ return analyzeDecision(hand, step, snaps[step], ctx); }catch{ return null; }
  },[hand, snaps, step, ctx]);

  const fmtEv = v => `${v>=0?"+":""}${(Math.round(v*100)/100).toFixed(2)}`;

  function runFull(){
    try{
      const r = analyzeHand(hand, snaps, ctx);
      setFull(r); setErrIdx(0);
      if(r.errors.length) setStep(r.errors[0].step);
    }catch(e){ console.error("[Replayer] analyzeHand a échoué :",e); setFull(null); }
  }
  function gotoErr(dir){
    if(!full || !full.errors.length) return;
    const n = (errIdx + dir + full.errors.length) % full.errors.length;
    setErrIdx(n); setStep(full.errors[n].step);
  }

  const m = decision ? metaOf(decision.cls) : null;

  return (
    <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:7}}>

      {/* ── Évaluation de la décision courante (§21/§22) ── */}
      <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"9px 10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:decision?7:0}}>
          <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",
            textTransform:"uppercase",fontWeight:700,flex:1}}>Évaluation de la décision</span>
          {decision && <SourceBadge source={decision.source} note={decision.note}/>}
        </div>

        {!decision && (
          <div style={{fontSize:9,color:T.text4,fontFamily:T.stats,padding:"4px 0"}}>
            Étape sans décision Hero — avance jusqu'à une action de Hero.
          </div>
        )}

        {decision && (
          <>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {/* Note */}
              <div style={{width:46,height:46,borderRadius:"50%",flexShrink:0,
                background:`radial-gradient(circle,${m.col}25,${m.col}08)`,border:`2px solid ${m.col}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:`0 0 16px ${m.col}40`}}>
                <span style={{fontFamily:T.brand,fontSize:17,fontWeight:900,color:m.col}}>{decision.grade}</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:800,color:m.col,fontFamily:T.stats}}>{decision.verdict}</div>
                <div style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,marginTop:1}}>
                  Jouée : <b style={{color:T.gold}}>{decision.playedLabel||decision.played}</b>
                  {decision.recommended && <> · Référence : <b style={{color:"#3ED598"}}>{decision.recommended.label}</b></>}
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>EV perdue</div>
                <div style={{fontFamily:T.brand,fontSize:14,fontWeight:900,
                  color:decision.evLoss==null?T.text4:decision.evLoss<=0.02?"#10D87A":m.col}}>
                  {decision.evLoss==null?"—":`-${(Math.round(decision.evLoss*100)/100).toFixed(2)}bb`}
                </div>
              </div>
            </div>

            {/* Actions de référence : fréquences + EV (§21) */}
            {decision.alternatives.length>0 && (
              <div style={{marginTop:8,paddingTop:7,borderTop:"1px solid rgba(255,255,255,.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:7,color:T.text4,
                  fontFamily:T.stats,letterSpacing:".08em",fontWeight:700,marginBottom:2}}>
                  <span>ACTIONS RECOMMANDÉES</span><span>FRÉQ · EV</span>
                </div>
                {decision.alternatives.map((a,i)=>(
                  <AltRow key={i} alt={a} fmtEv={fmtEv}
                    isPlayed={a.action===decision.played}
                    isBest={a.action===decision.bestAction}/>
                ))}
              </div>
            )}

            {decision.source==="none" && (
              <div style={{marginTop:6,fontSize:8.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>
                {decision.note}
              </div>
            )}
            {decision.coach?.explanation && (
              <div style={{marginTop:7,padding:"6px 8px",background:"rgba(31,139,255,.06)",
                border:"1px solid rgba(31,139,255,.18)",borderRadius:6,
                fontSize:8.5,color:T.text2,fontFamily:T.stats,lineHeight:1.45}}>
                {decision.coach.explanation}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Analyser toute la main (§29) ── */}
      <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"9px 10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:full?8:0}}>
          <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",
            textTransform:"uppercase",fontWeight:700,flex:1}}>Analyse complète</span>
          <button onClick={runFull} style={{padding:"3px 9px",borderRadius:6,cursor:"pointer",
            background:"rgba(255,194,71,.08)",border:"1px solid rgba(255,194,71,.3)",
            color:T.gold,fontSize:8.5,fontWeight:700,fontFamily:T.stats}}>
            🔍 Analyser toute la main
          </button>
        </div>

        {full && (
          <>
            <div style={{display:"flex",gap:6,marginBottom:7}}>
              <div style={{flex:1,textAlign:"center",background:"rgba(0,0,0,.25)",borderRadius:6,padding:"5px 4px"}}>
                <div style={{fontFamily:T.brand,fontSize:13,fontWeight:900,
                  color:full.totalEvLoss>0?T.red:"#10D87A"}}>-{full.totalEvLoss}bb</div>
                <div style={{fontSize:7,color:T.text4,fontFamily:T.stats}}>EV perdue totale</div>
              </div>
              <div style={{flex:1,textAlign:"center",background:"rgba(0,0,0,.25)",borderRadius:6,padding:"5px 4px"}}>
                <div style={{fontFamily:T.brand,fontSize:13,fontWeight:900,color:T.cyan}}>{full.decisions.length}</div>
                <div style={{fontSize:7,color:T.text4,fontFamily:T.stats}}>Décisions Hero</div>
              </div>
              <div style={{flex:1,textAlign:"center",background:"rgba(0,0,0,.25)",borderRadius:6,padding:"5px 4px"}}>
                <div style={{fontFamily:T.brand,fontSize:13,fontWeight:900,
                  color:full.errors.length?"#FF8A3D":"#10D87A"}}>{full.errors.length}</div>
                <div style={{fontSize:7,color:T.text4,fontFamily:T.stats}}>Erreurs</div>
              </div>
            </div>

            {/* Navigation entre erreurs */}
            {full.errors.length>0 && (
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                <button onClick={()=>gotoErr(-1)} style={{padding:"2px 8px",borderRadius:5,cursor:"pointer",
                  background:"transparent",border:"1px solid #1A3A80",color:T.text2,fontSize:10}}>‹</button>
                <span style={{flex:1,textAlign:"center",fontSize:8.5,color:T.text3,fontFamily:T.stats}}>
                  Erreur {errIdx+1} / {full.errors.length}
                </span>
                <button onClick={()=>gotoErr(1)} style={{padding:"2px 8px",borderRadius:5,cursor:"pointer",
                  background:"transparent",border:"1px solid #1A3A80",color:T.text2,fontSize:10}}>›</button>
              </div>
            )}

            {/* Liste classée — clic = seek déterministe */}
            <div style={{maxHeight:150,overflowY:"auto"}}>
              {full.decisions.map((d,i)=>{
                const dm=metaOf(d.cls); const on=d.step===step;
                return(
                  <div key={i} onClick={()=>setStep(d.step)} style={{display:"flex",alignItems:"center",gap:6,
                    padding:"4px 6px",marginBottom:2,borderRadius:5,cursor:"pointer",
                    background:on?"rgba(255,194,71,.1)":"rgba(255,255,255,.02)",
                    border:`1px solid ${on?"rgba(255,194,71,.35)":"transparent"}`}}>
                    <span style={{color:dm.col,fontSize:10,fontWeight:900,width:12,textAlign:"center"}}>{dm.ico}</span>
                    <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,minWidth:44,textTransform:"capitalize"}}>{d.street}</span>
                    <span style={{flex:1,fontSize:8.5,color:T.text2,fontFamily:T.stats,overflow:"hidden",
                      textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.playedLabel||d.played}</span>
                    <span style={{fontSize:8,fontWeight:800,color:dm.col,fontFamily:T.stats}}>
                      {d.evLoss==null?"—":`-${(Math.round(d.evLoss*100)/100).toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:5,fontSize:7.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>
              {full.source==="solver"?"Référence : solveur PokerForge."
                :full.source==="mixed"?"Référence mixte : solveur + estimations heuristiques."
                :full.source==="heuristic"?"Estimations heuristiques — pas une solution GTO exacte."
                :"Aucune référence stratégique disponible."}
            </div>
          </>
        )}
      </div>

      {/* ── Motifs détectés (§13) — OBSERVATIONS de CETTE main, calculées sur
          les événements réels, pas devinées à partir du texte de la HH. ── */}
      {observations.length>0 && (
        <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"9px 10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
            <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",
              textTransform:"uppercase",fontWeight:700,flex:1}}>Motifs détectés</span>
            <span style={{fontSize:6.5,color:T.text4,fontFamily:T.stats,border:"1px solid #1A3A80",
              borderRadius:3,padding:"0 4px"}}>CETTE MAIN</span>
          </div>
          {observations.map((o,i)=>(
            <div key={i} style={{display:"flex",gap:5,fontSize:8.5,color:T.text3,fontFamily:T.stats,padding:"2px 0",alignItems:"flex-start"}}>
              <span style={{color:o.tone==="ok"?"#3ED598":T.gold,lineHeight:1.4}}>{o.tone==="ok"?"✓":"⚠"}</span>
              <span style={{lineHeight:1.5}}>{o.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tendances multi-mains (§14) — un leak n'est jamais affirmé sur un
          échantillon insuffisant : sous le seuil, c'est « à confirmer ». ── */}
      {leaks.length>0 && (
        <div style={{background:"rgba(255,255,255,.02)",border:"1px solid #0F2258",borderRadius:8,padding:"9px 10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
            <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,letterSpacing:".12em",
              textTransform:"uppercase",fontWeight:700,flex:1}}>Tendances récurrentes</span>
            <span style={{fontSize:6.5,color:T.text4,fontFamily:T.stats,border:"1px solid #1A3A80",
              borderRadius:3,padding:"0 4px"}}>{leakAgg?.hands||0} MAINS</span>
          </div>
          {leaks.slice(0,5).map((l,i)=>{
            const col=l.established?(l.severity==="high"?"#FF4560":l.severity==="medium"?"#FFC247":"#8AA0C0"):"#6F81A8";
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0"}}>
                <span style={{color:col,fontSize:9}}>●</span>
                <span style={{flex:1,fontSize:8.5,color:T.text3,fontFamily:T.stats}}>{l.label}</span>
                <span style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:col}}>
                  {Math.round(l.observed*100)}% <span style={{color:T.text4}}>/ {Math.round(l.reference*100)}%</span>
                </span>
                <span style={{fontSize:7,color:T.text4,fontFamily:T.stats,minWidth:26,textAlign:"right"}}>n={l.samples}</span>
              </div>
            );
          })}
          <div style={{marginTop:5,fontSize:7.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic",lineHeight:1.5}}>
            {leaks.some(l=>l.established)
              ? "Fréquences observées vs repères PokerForge (estimations, pas des valeurs GTO)."
              : "Échantillon encore insuffisant : tendances à confirmer, pas des leaks établis."}
          </div>
        </div>
      )}
    </div>
  );
}
