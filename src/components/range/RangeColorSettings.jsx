/* ══════════════════════════════════════════════════════════════════════════
   PokerForge — Réglages des couleurs de ranges (popover partagé).

   Bouton 🎨 + panneau : presets, couleur par action (color picker + HEX),
   aperçu live, synchronisation inter-modules, réinitialisation.
   Purement visuel : aucune donnée stratégique n'est touchée (§6).
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo } from "react";
import { T } from "../../theme.js";
import {
  RANGE_ACTIONS, PRESET_LIST, DEFAULT_PRESET_ID,
  setRangePreset, setRangeColor, setRangeGlobalSync,
  resetRangeColors, restorePokerForge,
  rangeCellBackground, normalizeHex, loadRangeColorSettings,
} from "../../rangeColorTheme.js";
import { useRangeTheme } from "./useRangeTheme.js";

/* Une ligne « action » : pastille + picker + HEX. */
function ActionRow({ moduleId, action, color }){
  const [hex,setHex] = useState(color);
  React.useEffect(()=>{ setHex(color); },[color]);
  const commit = v => { const h=normalizeHex(v); if(h) setRangeColor(moduleId, action.key, h); };
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0"}}>
      <label style={{position:"relative",width:18,height:18,borderRadius:4,flexShrink:0,cursor:"pointer",
        background:color,border:"1px solid rgba(255,255,255,.25)",boxShadow:`0 0 8px ${color}55`}}>
        <input type="color" value={color}
          onChange={e=>{ setHex(e.target.value); commit(e.target.value); }}
          style={{opacity:0,width:"100%",height:"100%",cursor:"pointer",display:"block"}}/>
      </label>
      <span style={{flex:1,fontSize:9,color:T.text2,fontFamily:T.stats,fontWeight:600}}>{action.label}</span>
      <input value={hex} onChange={e=>setHex(e.target.value)}
        onBlur={e=>commit(e.target.value)}
        onKeyDown={e=>{ if(e.key==="Enter") commit(e.currentTarget.value); }}
        spellCheck={false}
        style={{width:74,background:"#071B44",border:"1px solid #1A3A80",color:T.text2,borderRadius:5,
          padding:"2px 6px",fontSize:8.5,fontFamily:"'JetBrains Mono',monospace",outline:"none"}}/>
    </div>
  );
}

/**
 * @param moduleId      "replayer" | "solver" | "trainer" | "coach"
 * @param usedActions   clés d'actions réellement présentes dans la solution
 *                      affichée (§2 : ne pas proposer de sizings inexistants)
 */
export default function RangeColorSettings({ moduleId="replayer", usedActions=null, compact=false }){
  const [open,setOpen] = useState(false);
  const theme = useRangeTheme(moduleId);
  const settings = loadRangeColorSettings();

  const actions = useMemo(()=>{
    if(!usedActions || !usedActions.length) return RANGE_ACTIONS;
    const set = new Set(usedActions);
    const shown = RANGE_ACTIONS.filter(a=>set.has(a.key));
    return shown.length ? shown : RANGE_ACTIONS;
  },[usedActions]);

  // Aperçu : une cellule mixte représentative du thème courant
  const previewParts = useMemo(()=>{
    const k = actions.map(a=>a.key);
    const pick = [k[0],k[1]||k[0],k[2]||k[0]];
    return [{key:pick[0],pct:55},{key:pick[1],pct:30},{key:pick[2],pct:15}];
  },[actions]);

  return (
    <div style={{position:"relative",display:"inline-block"}}>
      <button onClick={()=>setOpen(o=>!o)} title="Personnaliser les couleurs"
        style={{padding:compact?"1px 6px":"2px 8px",borderRadius:6,cursor:"pointer",fontFamily:T.stats,
          background:open?"rgba(255,194,71,.14)":"rgba(255,255,255,.05)",
          border:`1px solid ${open?"rgba(255,194,71,.4)":"rgba(255,255,255,.1)"}`,
          color:open?T.gold:T.text3,fontSize:compact?8:8.5,fontWeight:700,whiteSpace:"nowrap"}}>
        🎨{compact?"":" Couleurs"}
      </button>

      {open && (
        <>
          <div onClick={()=>setOpen(false)}
            style={{position:"fixed",inset:0,zIndex:998}}/>
          <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:999,width:250,
            background:"#050E28",border:"1px solid #1A3A80",borderRadius:10,padding:10,
            boxShadow:"0 12px 40px rgba(0,0,0,.6)"}}>

            <div style={{display:"flex",alignItems:"center",marginBottom:7}}>
              <span style={{flex:1,fontSize:9,fontWeight:900,color:T.gold,fontFamily:T.brand,
                letterSpacing:".08em"}}>PARAMÈTRES RANGE</span>
              <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",
                color:T.text4,cursor:"pointer",fontSize:12,lineHeight:1}}>✕</button>
            </div>

            {/* Presets */}
            <div style={{fontSize:7,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",
              fontWeight:700,marginBottom:4}}>PALETTE</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:8}}>
              {PRESET_LIST.map(p=>{
                const on = theme.preset===p.id;
                return(
                  <button key={p.id} onClick={()=>setRangePreset(moduleId,p.id)}
                    style={{padding:"2px 7px",borderRadius:20,fontSize:8,fontWeight:700,cursor:"pointer",
                      fontFamily:T.stats,background:on?"rgba(255,194,71,.14)":"transparent",
                      border:`1px solid ${on?"rgba(255,194,71,.4)":"rgba(255,255,255,.1)"}`,
                      color:on?T.gold:T.text3}}>{p.label}</button>
                );
              })}
            </div>

            {/* Aperçu live */}
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8,
              padding:"6px 7px",background:"rgba(0,0,0,.3)",borderRadius:6}}>
              <div style={{width:30,height:30,borderRadius:4,flexShrink:0,
                background:rangeCellBackground(previewParts,theme),
                border:"1px solid rgba(255,255,255,.15)",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:7,fontWeight:800,color:"#fff",
                fontFamily:"'JetBrains Mono',monospace"}}>AKs</div>
              <div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats,lineHeight:1.4}}>
                Aperçu d'une case mixte.<br/>Les fréquences ne changent jamais.
              </div>
            </div>

            {/* Couleur par action */}
            <div style={{fontSize:7,color:T.text4,fontFamily:T.stats,letterSpacing:".1em",
              fontWeight:700,marginBottom:3}}>ACTIONS</div>
            <div style={{maxHeight:190,overflowY:"auto",marginBottom:8}}>
              {actions.map(a=>(
                <ActionRow key={a.key} moduleId={moduleId} action={a} color={theme.colors[a.key]}/>
              ))}
            </div>

            {/* Synchro inter-modules */}
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",marginBottom:8}}>
              <input type="checkbox" checked={settings.global!==false}
                onChange={e=>setRangeGlobalSync(e.target.checked)}
                style={{accentColor:T.gold,cursor:"pointer"}}/>
              <span style={{fontSize:8,color:T.text3,fontFamily:T.stats,lineHeight:1.3}}>
                Utiliser cette palette dans tous les modules PokerForge
              </span>
            </label>

            {/* Reset */}
            <div style={{display:"flex",gap:5}}>
              <button onClick={()=>resetRangeColors(moduleId)} style={{flex:1,padding:"4px 6px",borderRadius:6,
                cursor:"pointer",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",
                color:T.text3,fontSize:8,fontWeight:700,fontFamily:T.stats}}>Réinitialiser</button>
              <button onClick={()=>restorePokerForge(moduleId)} style={{flex:1,padding:"4px 6px",borderRadius:6,
                cursor:"pointer",background:"rgba(255,194,71,.08)",border:"1px solid rgba(255,194,71,.3)",
                color:T.gold,fontSize:8,fontWeight:700,fontFamily:T.stats}}>Palette PokerForge</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* Légende dynamique partagée (§7) — mêmes couleurs que la matrice. */
export function RangeLegend({ legend, compact=false }){
  if(!legend || !legend.length) return null;
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:compact?5:8,alignItems:"center"}}>
      {legend.map(l=>(
        <span key={l.key} style={{display:"flex",alignItems:"center",gap:4,
          fontSize:compact?7.5:8.5,color:T.text3,fontFamily:T.stats,fontWeight:600}}>
          <span style={{width:9,height:9,borderRadius:2,background:l.color,flexShrink:0,
            border:"1px solid rgba(255,255,255,.2)"}}/>
          {l.label}
        </span>
      ))}
    </div>
  );
}
