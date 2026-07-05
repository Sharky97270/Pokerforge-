// PokerForge — avatars & visages des joueurs (extraits de App.jsx, Phase 3.2)
import React from "react";

export function trainerAvatarKey(profile,isHero=false){
  if(isHero)return"hero";
  const p=String(profile||"").toLowerCase();
  if(p.includes("nit"))return"nit";
  if(p.includes("lag")||p.includes("aggro")||p.includes("maniac"))return"lag";
  if(p.includes("fish")||p.includes("calling"))return"fish";
  if(p.includes("tag"))return"tag";
  if(p.includes("reg"))return"reg";
  return"unknown";
}
export function trainerAvatarMeta(profile,isHero=false){
  const key=trainerAvatarKey(profile,isHero);
  return {
    hero:{accent:"#00BFFF",accent2:"#1F8BFF",metal:"#E7ECF3",deep:"#031326"},
    tag:{accent:"#1F8BFF",accent2:"#34D8FF",metal:"#E7ECF3",deep:"#061326"},
    lag:{accent:"#FF8A3D",accent2:"#FFC247",metal:"#F7FAFF",deep:"#1B0B05"},
    nit:{accent:"#C0C7D1",accent2:"#8DA9D7",metal:"#F7FAFF",deep:"#071426"},
    fish:{accent:"#34D8FF",accent2:"#10D87A",metal:"#E7ECF3",deep:"#021B24"},
    reg:{accent:"#34D8FF",accent2:"#8DA9D7",metal:"#F7FAFF",deep:"#031326"},
    unknown:{accent:"#8DA9D7",accent2:"#6F81A8",metal:"#E7ECF3",deep:"#061326"},
  }[key];
}
export function trainerSeatAvatarProfile(pos){
  return {UTG:"Nit",HJ:"TAG",CO:"TAG",BTN:"Reg",SB:"Fish",BB:"Nit"}[pos]||"Reg";
}

export const TRAINER_ART={
  hero:{src:"/assets/trainer/08_hero_seat_cards_avatar_banner_x3.png",scale:"166%",y:"56%"},
  tag:{src:"/assets/trainer/10_co_seat_x3.png",scale:"134%",y:"54%"},
  lag:{src:"/assets/trainer/11_btn_seat_x3.png",scale:"145%",y:"56%"},
  nit:{src:"/assets/trainer/12_bb_seat_x3.png",scale:"142%",y:"53%"},
  fish:{src:"/assets/trainer/13_sb_seat_x3.png",scale:"142%",y:"55%"},
  reg:{src:"/assets/trainer/11_btn_seat_x3.png",scale:"145%",y:"56%"},
  unknown:{src:"/assets/trainer/09_utg_seat_x3.png",scale:"155%",y:"53%"},
};

export function TrainerAvatarArt({profile,isHero=false}){
  const art=TRAINER_ART[trainerAvatarKey(profile,isHero)]||TRAINER_ART.unknown;
  return(
    <span className="pf-avatar-art" style={{"--pf-art-scale":art.scale,"--pf-art-y":art.y}} aria-hidden="true">
      <img src={art.src} alt="" draggable="false"/>
    </span>
  );
}

export function PlayerFace({isHero=false,isVillain=false,size=44,profile="Reg"}){
  const key=trainerAvatarKey(profile,isHero);
  const m=trainerAvatarMeta(profile,isHero);
  const gid=`pfav-${key}`;
  const common={stroke:m.metal,strokeWidth:2.4,strokeLinecap:"round",strokeLinejoin:"round"};
  const icon=(()=>{
    if(key==="hero")return(
      <g>
        <path d="M18 83 C20 55 30 29 50 20 C70 29 80 55 82 83 C66 75 34 75 18 83Z" fill={`url(#${gid}-hood)`} stroke={m.accent} strokeWidth="2.4"/>
        <path d="M33 50 C38 39 62 39 67 50 L60 65 C54 69 46 69 40 65Z" fill="#061326" stroke={m.metal} strokeWidth="2"/>
        <path d="M38 52 L47 55 M62 52 L53 55" stroke={m.accent} strokeWidth="3" strokeLinecap="round"/>
        <path d="M42 66 L50 72 L58 66" stroke={m.accent2} strokeWidth="2.2" fill="none"/>
      </g>
    );
    if(key==="tag")return(
      <g>
        <path d="M25 35 L50 21 L75 35 L70 67 L50 80 L30 67Z" fill="#071B44" {...common}/>
        <path d="M34 45 H66 L61 57 H39Z" fill={m.accent} opacity=".9"/>
        <path d="M50 25 V75 M29 63 H71" stroke={m.accent2} strokeWidth="2" opacity=".65"/>
        <circle cx="50" cy="52" r="6" fill="#030712" stroke={m.metal} strokeWidth="1.8"/>
      </g>
    );
    if(key==="lag")return(
      <g>
        <path d="M29 28 L70 24 L62 45 L76 46 L44 81 L51 57 L32 56Z" fill={`url(#${gid}-bolt)`} stroke={m.metal} strokeWidth="2"/>
        <path d="M32 42 C42 31 60 30 70 42" stroke={m.accent2} strokeWidth="3" fill="none"/>
        <path d="M39 52 L48 56 M62 52 L53 56" stroke="#030712" strokeWidth="3.2"/>
      </g>
    );
    if(key==="nit")return(
      <g>
        <path d="M24 30 L50 20 L76 30 V50 C76 66 64 77 50 83 C36 77 24 66 24 50Z" fill={`url(#${gid}-metal)`} stroke={m.accent2} strokeWidth="2.5"/>
        <path d="M33 47 L50 38 L67 47 L62 62 L50 69 L38 62Z" fill="#071326" stroke={m.metal} strokeWidth="1.8"/>
        <path d="M39 51 H61 M50 38 V69" stroke={m.accent} strokeWidth="2"/>
      </g>
    );
    if(key==="fish")return(
      <g>
        <path d="M22 53 C34 35 60 34 75 53 C60 72 34 71 22 53Z" fill={`url(#${gid}-aqua)`} stroke={m.metal} strokeWidth="2"/>
        <path d="M75 53 L91 40 V66Z" fill={m.accent} stroke={m.metal} strokeWidth="2"/>
        <circle cx="37" cy="49" r="3.5" fill="#031326"/>
        <path d="M50 38 C55 44 55 62 50 68 M62 43 C67 49 67 57 62 63" stroke="#031326" strokeWidth="2" opacity=".45"/>
      </g>
    );
    if(key==="reg")return(
      <g>
        <path d="M18 61 C31 30 61 22 83 40 C66 43 57 50 51 66 C40 58 29 58 18 61Z" fill={`url(#${gid}-metal)`} stroke={m.accent} strokeWidth="2.4"/>
        <path d="M45 26 L56 47 L36 42Z" fill={m.metal} stroke={m.accent2} strokeWidth="1.8"/>
        <path d="M59 44 L74 41 L63 51Z" fill="#031326"/>
        <circle cx="67" cy="42" r="2.6" fill={m.accent}/>
      </g>
    );
    return(
      <g>
        <path d="M28 74 C30 50 36 30 50 25 C64 30 70 50 72 74Z" fill="#071B44" {...common}/>
        <path d="M35 47 C42 41 58 41 65 47 V58 H35Z" fill={m.accent} opacity=".5"/>
        <path d="M40 58 H60 M50 25 V74" stroke={m.metal} strokeWidth="2"/>
      </g>
    );
  })();
  return(
    <svg viewBox="0 0 100 100" width={size} height={size} className={`pf-avatar-svg pf-avatar-svg-${key}`} aria-hidden="true">
      <defs>
        <radialGradient id={`${gid}-bg`} cx="45%" cy="25%" r="72%">
          <stop offset="0%" stopColor={m.accent2} stopOpacity=".5"/>
          <stop offset="45%" stopColor={m.deep}/>
          <stop offset="100%" stopColor="#020712"/>
        </radialGradient>
        <linearGradient id={`${gid}-hood`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor={m.accent2}/>
          <stop offset="45%" stopColor="#06265B"/>
          <stop offset="100%" stopColor="#020712"/>
        </linearGradient>
        <linearGradient id={`${gid}-metal`} x1="15%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#F7FAFF"/>
          <stop offset="36%" stopColor="#8DA9D7"/>
          <stop offset="70%" stopColor="#273A55"/>
          <stop offset="100%" stopColor="#E7ECF3"/>
        </linearGradient>
        <linearGradient id={`${gid}-bolt`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor={m.accent2}/>
          <stop offset="52%" stopColor={m.accent}/>
          <stop offset="100%" stopColor="#7B1B08"/>
        </linearGradient>
        <linearGradient id={`${gid}-aqua`} x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#DFFBFF"/>
          <stop offset="42%" stopColor={m.accent}/>
          <stop offset="100%" stopColor="#057A93"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#${gid}-bg)`}/>
      <circle cx="50" cy="50" r="43" fill="none" stroke={m.accent} strokeOpacity=".35" strokeWidth="1.8"/>
      {icon}
      <path d="M24 18 C38 8 62 8 76 18" stroke="rgba(255,255,255,.35)" strokeWidth="2" fill="none" opacity=".45"/>
    </svg>
  );
}

export function PlayerAvatarPremium({isHero=false,isVillain=false,profile="Reg",size=44,active=false,compact=false}){
  const meta=trainerAvatarMeta(profile,isHero);
  const profileKey=trainerAvatarKey(profile,isHero);
  return(
    <div className={`pf-avatar-premium${isHero?" hero":isVillain?" villain":""}${active?" active":""}${compact?" compact":""}`}
      data-profile={profileKey}
      style={{"--avatar-size":`${size}px`,"--avatar-accent":meta.accent,"--avatar-glow":`${meta.accent}66`}}>
      <PlayerFace isHero={isHero} isVillain={isVillain} profile={profile} size={Math.max(22,size-6)}/>
      <TrainerAvatarArt isHero={isHero} profile={profile}/>
    </div>
  );
}
