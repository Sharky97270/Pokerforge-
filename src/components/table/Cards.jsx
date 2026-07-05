// PokerForge — composants cartes (extraits de App.jsx, Phase 3.2)
import React, { useState, useEffect } from "react";
import { getSuitStyle, getActiveDeck } from "./deck.js";

/* ═══════════════════════════════════════
   CARD COMPONENTS
═══════════════════════════════════════ */
export function Card({r,s,size="md",delay=0,revealed=false}){
  const st=getSuitStyle(s);
  return(
    <div className={`card card-${size} deal`}
      style={{
        background:st.bg,border:`1px solid ${st.border}`,
        boxShadow:`0 3px 12px rgba(0,0,0,.55),0 0 14px ${st.glow}`,
        animationDelay:`${delay}s`,
        animation:revealed?`cardFlipReveal .4s ease-in-out ${delay}s both`:`deal .25s cubic-bezier(.22,.68,.36,1) ${delay}s both`,
      }}>
      <div className="card-corner">
        <span className="card-corner-r" style={{color:st.color}}>{r}</span>
        <span className="card-corner-s" style={{color:st.color}}>{s}</span>
      </div>
      <div className="card-center" style={{color:st.color}}>{s}</div>
    </div>
  );
}

/* Dos de carte — utilise couleur du deck actif */
export function CardBack({size="md",animated=false}){
  const deck=getActiveDeck();
  const accentCol=deck["♠"].color;
  return(
    <div className={`card card-${size} card-back pf-card-back${animated?" card-back-anim":""}`}
      style={{"--pf-card-accent":accentCol,borderColor:"rgba(0,191,255,.45)"}}>
      <span className="pf-card-back-art" aria-hidden="true"/>
    </div>
  );
}

/* Carte face cachée → révélation avec animation flip */
export function HeroHoleCards({cards=[],size="md",gap=6,compact=false,style}){
  if(!cards||!cards.length)return null;
  return(
    <div className={`pf-hole-cards hero-card-wrap${compact?" compact":""}`} style={{gap, ...style}}>
      {cards.map((c,i)=><Card key={i} r={c.r} s={c.s} size={size} delay={i*.05}/>)}
    </div>
  );
}
export function VillainBackCards({size="md",animated=false,gap=2,compact=false,muted=false,folded=false,style}){
  return(
    <div className={`pf-hole-cards pf-villain-backs${compact?" compact":""}${muted?" muted":""}${folded?" folded":""}`} style={{gap, ...style}}>
      <CardBack size={size} animated={animated}/>
      <CardBack size={size} animated={animated}/>
    </div>
  );
}

export function CardFlip({r,s,size="md",faceDown=true,delay=0}){
  const[flipped,setFlipped]=useState(!faceDown);
  useEffect(()=>{
    if(!faceDown){const t=setTimeout(()=>setFlipped(true),delay*1000+100);return()=>clearTimeout(t);}
    else setFlipped(false);
  },[faceDown,delay]);
  return flipped?<Card r={r} s={s} size={size} delay={delay}/>:<CardBack size={size}/>;
}
