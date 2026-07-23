/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : couche d'animation cinématique.

   Diffe snapshot(step-1) → snapshot(step) et produit des « chip flies »
   transitoires :
   • bet/call/raise/allin → un jeton part du siège vers le centre ;
   • deal-flop/turn/river/showdown → les mises de la street précédente
     rejoignent le pot (§13/§14).

   Vitesse 0.5×/1×/1.5×/2× (+ mode instantané) → durée mise à l'échelle.
   Timers ANNULABLES : tout seek/pause/step rapide annule l'animation en cours
   (évite les incohérences — cf. §61 du Trainer).
═══════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";

const rb = v => Math.round(v*100)/100;
function fmtBb(v){ if(v==null) return ""; const n=rb(v); return (Number.isInteger(n)?n:n.toFixed(1))+"bb"; }

const STREET_CHANGE = new Set(["deal-flop","deal-turn","deal-river","showdown","end"]);
const BET_TYPES = new Set(["bet","call","raise","allin"]);

/**
 * @param snapshot     snapshot courant (State Engine)
 * @param prevSnapshot snapshot de l'étape précédente (pour connaître les mises à collecter)
 * @param opts.speed   multiplicateur de vitesse (0.5..2)
 * @param opts.instant true → aucune animation
 * @param opts.anchorOf (playerId) => {x,y} ancre de mise du siège
 * @returns { flies:[{id,x,y,label,kind,allin}], potPulse:boolean }
 */
export function useReplayAnimation(snapshot, prevSnapshot, opts={}){
  const { speed=1, instant=false, anchorOf } = opts;
  const [flies, setFlies] = useState([]);
  const [potPulse, setPotPulse] = useState(false);
  const timerRef = useRef(null);
  const stepRef = useRef(-1);

  useEffect(()=>{
    if(!snapshot) return;
    const step = snapshot.step;
    const prevStep = stepRef.current;
    if(step === prevStep) return;
    const forward = step > prevStep;
    stepRef.current = step;

    // annule l'animation précédente (seek/step rapide)
    if(timerRef.current){ clearTimeout(timerRef.current); timerRef.current = null; }

    const ev = snapshot.currentEvent;
    if(!ev || instant || !forward || typeof anchorOf!=="function"){
      if(flies.length) setFlies([]);
      if(potPulse) setPotPulse(false);
      return;
    }

    let next = [];
    let pulse = false;

    if(STREET_CHANGE.has(ev.type)){
      const bets = (prevSnapshot && prevSnapshot.bets) || {};
      next = Object.keys(bets).map(pid=>{
        const c = anchorOf(pid) || { x:50, y:50 };
        const hero = prevSnapshot.players.find(p=>p.id===pid)?.isHero;
        return { id:`${step}-${pid}`, x:c.x, y:c.y, label:fmtBb(bets[pid]), kind:hero?"hero":"villain", allin:false };
      });
      pulse = next.length>0;
    } else if(BET_TYPES.has(ev.type) && ev.playerId){
      const c = anchorOf(ev.playerId) || { x:50, y:50 };
      const hero = snapshot.players.find(p=>p.id===ev.playerId)?.isHero;
      next = [{ id:`${step}-${ev.playerId}`, x:c.x, y:c.y, label:ev.label, kind:hero?"hero":"villain", allin:ev.type==="allin" }];
    }

    setFlies(next);
    setPotPulse(pulse);
    if(next.length || pulse){
      const dur = Math.max(180, Math.round(720 / (speed||1)));
      timerRef.current = setTimeout(()=>{ setFlies([]); setPotPulse(false); timerRef.current=null; }, dur);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.step, instant]);

  useEffect(()=>()=>{ if(timerRef.current) clearTimeout(timerRef.current); }, []);

  return { flies, potPulse };
}
