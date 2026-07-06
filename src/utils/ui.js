// PokerForge — detection mobile & haptics (extrait de App.jsx, Phase 3.3)
import { useState, useEffect } from "react";

/* ═══════════════════════════════════════════════════════
   MOBILE CORE v9 — détection, haptics, préférences
════════════════════════════════════════════════════════ */
export function useIsMobile(bp=768){
  const get=()=>typeof window!=="undefined"&&window.matchMedia&&window.matchMedia(`(max-width:${bp}px)`).matches;
  const[m,setM]=useState(get);
  useEffect(()=>{
    if(typeof window==="undefined"||!window.matchMedia)return;
    const mq=window.matchMedia(`(max-width:${bp}px)`);
    const h=e=>setM(e.matches);
    if(mq.addEventListener)mq.addEventListener("change",h);else mq.addListener(h);
    return()=>{if(mq.removeEventListener)mq.removeEventListener("change",h);else mq.removeListener(h);};
  },[bp]);
  return m;
}
/* Vibrations — désactivables dans Paramètres (pf_haptics="off") */
export function hapticsEnabled(){try{return localStorage.getItem("pf_haptics")!=="off";}catch{return true;}}
export function vibrate(p){try{if(hapticsEnabled()&&navigator.vibrate)navigator.vibrate(p);}catch{}}
export const VIB={tap:8,ok:[15,30,15],err:[60,40,60],next:12,win:[20,40,20,40,80]};
