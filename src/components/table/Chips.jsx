// PokerForge — jetons, badges d'action, pot & sieges (extraits de App.jsx, Phase 3.2)
import React from "react";
import { trainerChipValueBand } from "../../trainerVisualConfig.js";
import { trainerChipPileCount } from "../../trainerActionEvent.js";
import { roundBb } from "../../utils/format.js";

/* ── CHIP THEMES — 3 thèmes de jetons visuels ── */
export const CHIP_THEMES={
  blue:{id:"blue",name:"PokerForge Blue",desc:"Bleu électrique signature",cols:["#4090FF","#1860D0","#0C3A8A","#071E50","#80B8FF"],edge:"#60A0FF",glow:"rgba(64,144,255,.6)"},
  gold:{id:"gold",name:"Royal Gold",desc:"Or royal premium",cols:["#FFC247","#D08010","#A05808","#703A00","#FFE08A"],edge:"#FFDA60",glow:"rgba(255,194,71,.65)"},
  titan:{id:"titan",name:"Titanium",desc:"Métal brossé élite",cols:["#C8D8E8","#8898A8","#586878","#384858","#E0F0FF"],edge:"#B0C8E0",glow:"rgba(200,216,232,.4)"},
};

export function chipValueBand(amount=0){
  return trainerChipValueBand(amount);
}
export function chipPalette(kind="hero",themeKey="blue",amount=0){
  const band=chipValueBand(amount);
  const valuePalettes={
    forced:{cols:["#F3F7FF","#9FB0CC","#58D8FF","#E7ECF3"],edge:"#F7FAFF",glow:"rgba(141,169,215,.46)"},
    small:{cols:["#34D8FF","#1F8BFF","#0D4EA6","#D9F7FF"],edge:"#9DEBFF",glow:"rgba(52,216,255,.52)"},
    medium:{cols:["#9B5CFF","#6232C7","#34D8FF","#E0C8FF"],edge:"#C090FF",glow:"rgba(155,92,255,.58)"},
    large:{cols:["#FFC247","#D4891A","#FF8A3D","#3B2207"],edge:"#FFE3A3",glow:"rgba(255,194,71,.58)"},
    monster:{cols:["#FF4560","#FFC247","#7A1020","#10D87A","#F7FAFF"],edge:"#FFD97A",glow:"rgba(255,69,96,.62)"},
  };
  if(kind==="blind")return{...valuePalettes.forced,glow:"rgba(141,169,215,.38)"};
  if(kind==="danger")return valuePalettes.monster;
  if(kind==="multiway")return{cols:["#00E6B8","#00A88E","#036B62","#C0FFF2","#1F8BFF"],edge:"#00D6BD",glow:"rgba(0,230,184,.54)"};
  if(kind==="pot"){
    const base=valuePalettes[band];
    return{cols:["#1F8BFF","#10D87A",...base.cols,"#FFC247"].slice(0,7),edge:"#E7ECF3",glow:"rgba(31,139,255,.56)"};
  }
  if(kind==="villain"){
    const base=valuePalettes[band];
    return{cols:base.cols.map((c,i)=>i%2?c:"#C090FF"),edge:base.edge,glow:base.glow};
  }
  const t=CHIP_THEMES[themeKey]||CHIP_THEMES.blue;
  return band==="small"?{cols:t.cols,edge:t.edge,glow:t.glow}:valuePalettes[band];
}
export function ChipStack({count=3,kind="hero",themeKey="blue",amount=0,size="medium",className="",style}){
  const pal=chipPalette(kind,themeKey,amount);
  const chipCount=Math.max(1,Math.min(8,count));
  return(
    <div className={`pf-chip-stack pf-chip-${size} ${className}`} style={{"--chip-edge":pal.edge,"--chip-glow":pal.glow,...style}}>
      {[...Array(chipCount)].map((_,i)=><span key={i} style={{"--i":i,"--chip-color":pal.cols[i%pal.cols.length]}}/>)}
    </div>
  );
}
export function ChipStackLarge(props){return <ChipStack {...props} size="large"/>;}
export function ChipStackMedium(props){return <ChipStack {...props} size="medium"/>;}
export function ChipStackSmall(props){return <ChipStack {...props} size="small"/>;}
export function actionVisualType(type="BET"){
  const t=String(type||"BET").toUpperCase();
  if(t==="FOLD")return"fold";
  if(t==="CALL")return"call";
  if(t==="CHECK"||t==="CHECK_BACK")return"check";
  if(t==="3BET"||t==="4BET"||t==="5BET"||t==="RAISE")return"raise";
  if(t==="ALLIN"||t==="SHOVE"||t==="PUSH"||t==="RESHOVE"||t==="JAM")return"allin";
  if(t==="OPEN")return"open";
  return"bet";
}
export function ActionBetBadge({label,amount,type="BET",compact=false,kind="villain",themeKey="blue",style}){
  const visual=actionVisualType(type);
  const pileCount=trainerChipPileCount(amount,visual==="allin");
  const chipsPerPile=amount>0?Math.max(1,Math.min(4,Math.ceil(amount/Math.max(1,pileCount*5)))):0;
  const StackComp=compact?ChipStackSmall:ChipStackMedium;
  return(
    <div className={`pf-action-chip-badge pf-action-${visual}${compact?" compact":""}`} style={style}>
      {amount>0&&(
        <span className={`pf-action-chip-piles piles-${pileCount}`}>
          {[...Array(pileCount)].map((_,i)=>(
            <StackComp
              key={i}
              count={Math.max(1,Math.min(4,chipsPerPile+(i%2)))}
              kind={visual==="allin"?(i%2?"danger":"pot"):i%3===1?"pot":kind}
              themeKey={themeKey}
              amount={amount}
            />
          ))}
        </span>
      )}
      <span className="pf-action-chip-copy">
        {label&&<strong>{label}</strong>}
        {amount>0&&<em>{amount}bb</em>}
      </span>
    </div>
  );
}
export function BetBadge(props){return <ActionBetBadge {...props} type="BET"/>;}
export function CallBadge(props){return <ActionBetBadge {...props} type="CALL"/>;}
export function RaiseBadge(props){return <ActionBetBadge {...props} type="RAISE"/>;}
export function OpenBadge(props){return <ActionBetBadge {...props} type="OPEN"/>;}
export function AllInBadge(props){return <ActionBetBadge {...props} type="ALLIN" kind="danger"/>;}
export function CheckBadge(props){return <ActionBetBadge {...props} type="CHECK" kind="blind"/>;}
export function BlindBadge({amount=1,label="BB",compact=false,style}){
  const chipAsset=label==="SB"
    ?"/assets/trainer/20_sb_chip_x3.png"
    :"/assets/trainer/19_bb_chip_x3.png";
  return(
    <div className={`pf-blind-stack${compact?" compact":""}`} style={style}>
      <span className="pf-blind-art" aria-hidden="true"><img src={chipAsset} alt="" draggable="false"/></span>
      <strong>{amount}bb</strong>
      <em>{label}</em>
    </div>
  );
}
export function BlindChipStack(props){return <BlindBadge {...props}/>;}
export function TrainingPotStack({value=0,compact=false}){
  return(
    <div className={`pf-pot-chip-stack${compact?" compact":""}`}>
      <img src="/assets/trainer/07_pot_chips_x3.png" alt="" draggable="false"/>
    </div>
  );
}
export function PotDisplay({value=0,compact=false,style}){
  return(
    <div className={`pf-pot-readout${compact?" compact":""}`} style={style}>
      <TrainingPotStack value={value} compact={compact}/>
      <span className="pf-pot-label">POT</span>
      <span className="pf-pot-value">{value}bb</span>
    </div>
  );
}
export function BetSizingBadge({label,type="bet",compact=false,style}){
  const cls=type==="FOLD"?"action-fold":type==="CALL"?"action-call":type==="CHECK"||type==="CHECK_BACK"?"action-check":type==="RAISE"||type==="3BET"||type==="4BET"||type==="5BET"?"action-raise":type==="ALLIN"?"action-allin":"action-bet";
  return <span className={`seat-action-badge ${cls}${compact?" compact":""}`} style={style}>{label}</span>;
}
export function SeatActionZone({x,y,amount=0,label="",type="BET",compact=false,kind="villain",themeKey="blue",className="",style}){
  if(!(amount>0))return null;
  const props={label,amount:roundBb(amount),type,compact,kind,themeKey};
  return(
    <div className={`pf-seat-action-zone ${className}`} style={{left:`${x}%`,top:`${y}%`,...style}}>
      {type==="CALL"?<CallBadge {...props}/>:type==="RAISE"||type==="3BET"||type==="4BET"||type==="5BET"?<RaiseBadge {...props}/>:type==="OPEN"?<OpenBadge {...props}/>:type==="ALLIN"?<AllInBadge {...props}/>:<BetBadge {...props}/>}
    </div>
  );
}
export function PlayerSeat({pos,mode="1T",className="",style,children}){
  return <div className={`pf-player-seat ${className}`} data-seat={pos} data-mode={mode} style={style}>{children}</div>;
}
export function PlayerSeatZone({zone,className="",style,children}){
  return <div className={`pf-player-seat-zone ${className}`} data-zone={zone} style={style}>{children}</div>;
}
