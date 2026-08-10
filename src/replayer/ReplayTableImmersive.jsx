/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : TABLE IMMERSIVE.

   Rend un HandStateSnapshot (State Engine) avec le KIT VISUEL VALIDÉ du
   Trainer : avatars (PlayerAvatarPremium), cartes (Cards), jetons (Chips),
   géométrie de table partagée (components/table/geometry.js).

   • Cartes Hero toujours visibles, villains face cachée sauf showdown.
   • Mises affichées DEVANT chaque joueur (committed) ; pot au-dessus du board.
   • Cinématique : cartes distribuées, jetons qui volent, board révélé,
     mises qui rejoignent le pot au changement de street (§10–15).
═══════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { T } from "../theme.js";
import { Card, HeroHoleCards, VillainBackCards } from "../components/table/Cards.jsx";
import { PlayerSeat, SeatActionZone, TrainingPotStack } from "../components/table/Chips.jsx";
import { PlayerAvatarPremium, trainerSeatAvatarProfile } from "../components/table/Avatars.jsx";
import {
  feltGeometry, feltStyle, feltRailStyle,
  boardPoint, potPoint, seatActionPoint, dealerPoint,
  heroCentricSeatRing,
} from "../components/table/geometry.js";

const rb = v => Math.round(v*100)/100;
function defaultFmt(v){ const n=rb(v); return (Number.isInteger(n)?n:n.toFixed(1))+"bb"; }

function actionType(ev){
  if(!ev) return "BET";
  switch(ev.type){
    case "fold": return "FOLD";
    case "check": return "CHECK";
    case "call": return "CALL";
    case "raise": return "RAISE";
    case "allin": return "ALLIN";
    default: return "BET";
  }
}

export default function ReplayTableImmersive({ hand, snapshot, fmt=defaultFmt, flies=[], potPulse=false, compact=false }){
  // Hauteur réelle de la zone de table. L'anneau est placé en POURCENTAGES
  // (il rétrécit avec le conteneur) alors que le bloc siège est en PIXELS : sur
  // un écran court (1366×768 → ~380 px de table) les sièges des flancs finissent
  // par se chevaucher. On dérive donc une échelle depuis la hauteur mesurée.
  const rootRef = useRef(null);
  const [boxH, setBoxH] = useState(0);
  useEffect(()=>{
    const el = rootRef.current;
    if(!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries=>{
      const h = entries[0]?.contentRect?.height || 0;
      setBoxH(prev => Math.abs(prev-h) > 4 ? h : prev);
    });
    ro.observe(el);
    return ()=>ro.disconnect();
  }, []);
  const geom = feltGeometry(boxH, hand?.players?.length || 0);
  // 520 px = hauteur de référence (poste de travail 1080p) → échelle 1. Exposant
  // 1.3 : le bloc siège doit décroître PLUS vite que le conteneur, car ses
  // marges/paddings CSS sont en px fixes et ne suivent pas la police.
  const s = boxH ? Math.max(0.6, Math.pow(Math.min(1, boxH/520), 1.3)) : 1;
  const px = v => Math.round(v*s);

  // Tailles réduites en mode compact (mobile) pour éviter le serrage board/cartes.
  // §4 (récapitulatif des réductions) : avatars −15 %, cartes Hero −10 %.
  const boardSize = (compact || s<0.8) ? "md" : "lg";
  const heroScale = (compact ? 0.67 : 0.79) * s;
  const avSize = isH => px(compact ? (isH?39:34) : (isH?46:41));
  // Hauteur réservée aux cartes des villains (même pliés) pour garder les
  // avatars alignés sur l'anneau — suit la réduction des avatars.
  const villainCardSlot = px(compact ? 40 : 45);
  // Marge NÉGATIVE : les cartes sont glissées derrière l'avatar et ne dépassent
  // que de quelques pixels. Sur une table 8/9 joueurs l'anneau est plat, les
  // sièges des flancs (MP/SB) ne sont qu'à ~125 px des sièges en diagonale
  // (LJ/BTN) : un bloc « cartes au-dessus » pleine hauteur recouvrait leur
  // plaque nom/stack. Le bloc siège tient désormais en ~119 px.
  const villainCardTuck = -Math.round(((compact?16:20) + (1-s)*26) * s);
  // `transform:scale` réduit le RENDU des cartes Hero mais pas leur boîte de
  // mise en page : sans compensation le bloc Hero réservait la hauteur pleine
  // et sa plaque sortait du cadre en bas (constaté en 1280×720). On récupère
  // les pixels devenus vides au-dessus des cartes (origine « bottom center »).
  const heroCardsPull = -Math.round(66 * (1-heroScale));

  // Anneau de sièges (hero en bas), calé sur le feutre.
  const { ring, coordOfId, anchorOfId } = useMemo(()=>{
    const players = [...(hand?.players||[])].sort((a,b)=>a.seat-b.seat);
    const positions = players.map(p=>p.pos);
    const hero = players.find(p=>p.isHero);
    const r = heroCentricSeatRing(positions, hero?.pos, { geometry:geom });
    const cById = {}, aById = {};
    const hasBoard = (snapshot?.board?.length||0) > 0;
    players.forEach(p=>{
      const c = r[p.pos] || { x:50, y:50 };
      cById[p.id] = c;
      aById[p.id] = seatActionPoint(c, { hasBoard });
    });
    return { ring:r, coordOfId:cById, anchorOfId:aById };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand, snapshot?.board?.length, geom.top, geom.left, geom.right, geom.bottom]);

  if(!hand || !snapshot) return null;

  const board = snapshot.board || [];
  const hasBoard = board.length>0;
  const potPt = potPoint(hasBoard);
  const boardPt = boardPoint();
  const potVal = snapshot.potMain;
  const cur = snapshot.currentEvent;

  const btnPlayer = snapshot.players.find(p=>p.seat===hand.buttonSeat);
  const dlrPt = btnPlayer ? dealerPoint(coordOfId[btnPlayer.id]) : null;

  return (
    <div ref={rootRef} className="pf-replayer-table" style={{position:"relative",width:"100%",height:"100%",minHeight:0,overflow:"hidden"}}>
      {/* ── FEUTRE ── */}
      <div style={feltStyle(geom)}>
        <div style={feltRailStyle("outer",geom)}/>
        <div style={feltRailStyle("inner",geom)}/>

        {/* POT — posé JUSTE au-dessus du board. Le y=29 % hérité du Trainer visait
            un feutre pleine largeur ; sur le feutre resserré du Replayer les sièges
            du haut descendent sur l'anneau et le pot mordait leur plaque (6-max).
            Un simple % ne suffit pas non plus : les cartes du board sont en px
            fixes, donc leur part de hauteur grandit quand l'écran raccourcit. On
            ancre donc le BAS du pot à N px au-dessus du centre du board. */}
        {potVal>0.01 && (
          <div className={`pf-pot-readout compact${potPulse?" pot-val-pop":""}`}
               style={{position:"absolute",left:`${potPt.x}%`,zIndex:7,
                 ...(hasBoard
                   ? { top:`calc(${boardPt.y-4}% - ${Math.round((boardSize==="lg"?66:47)/2)+4}px)`,
                       transform:`translate(-50%,-100%) scale(${s})`, transformOrigin:"50% 100%" }
                   : { top:`${potPt.y}%`, transform:"translate(-50%,-50%)" })}}>
            <TrainingPotStack value={potVal} compact tableMode={1}/>
            <span className="pf-pot-label">POT</span>
            <span className="pf-pot-value">{fmt(potVal)}</span>
          </div>
        )}

        {/* BOARD — remonté de 4% pour laisser respirer les cartes de Hero en dessous. */}
        {hasBoard && (
          <div className="pf-board-zone" key={`board-${board.length}`}
               style={{position:"absolute",top:`${boardPt.y-4}%`,left:`${boardPt.x}%`,transform:"translate(-50%,-50%)",display:"flex",gap:6,zIndex:6,alignItems:"center",filter:"drop-shadow(0 4px 16px rgba(0,0,0,.7))"}}>
            {board.map((c,i)=>(
              <div key={`${i}-${c.r}${c.s}`} className="board-card-in" style={{animationDelay:`${i*0.09}s`}}>
                <Card r={c.r} s={c.s} size={boardSize} delay={0}/>
              </div>
            ))}
          </div>
        )}

        {/* CHIP FLIES (mises → pot / toss) */}
        {flies.map(f=>(
          <div key={f.id} className={`chip-animation ${f.kind==="hero"?"chip-from-hero":"chip-from-villain"}${f.allin?" chip-allin":""}`}
               style={{"--from-x":`${f.x}%`,"--from-y":`${f.y}%`}}>
            <span>{f.label}</span>
          </div>
        ))}
      </div>

      {/* ── SIÈGES ── */}
      {snapshot.players.map(p=>{
        const coord = coordOfId[p.id];
        if(!coord) return null;
        const isH = p.isHero;
        const isActing = cur && cur.playerId===p.id && ["fold","check","call","bet","raise","allin"].includes(cur.type);
        const col = isH ? T.gold : T.text3;
        const profile = isH ? "Hero" : trainerSeatAvatarProfile(p.pos);
        const isTop = coord.y<=24, isBottom = coord.y>=68;
        const seatTransform = isTop ? "translate(-50%,-40%)" : isBottom ? "translate(-50%,-49%)" : "translate(-50%,-50%)";
        const anchor = anchorOfId[p.id] || { x:coord.x, y:coord.y };

        // Cartes visibles ?
        const showFace = p.holeVisible && p.hole && p.hole.length>=2;

        // Badge fold/check. Posé EN SURIMPRESSION du siège (et non en dessous) :
        // en flux il rallongeait le bloc de ~18 px et recouvrait alors les cartes
        // du siège voisin sur les tables 8/9 joueurs (MP × LJ, BTN × SB).
        const lastBadge = (()=>{
          if(p.allIn) return null;   // ALL-IN a son propre badge, même emplacement
          if(p.folded) return { l:"Fold", cls:"action-fold" };
          if(isActing && cur.type==="check") return { l:"Check", cls:"action-check" };
          return null;
        })();

        return (
          <React.Fragment key={p.id}>
            <PlayerSeat pos={p.pos} mode="1T" style={{left:`${coord.x}%`,top:`${coord.y}%`,transform:seatTransform,gap:0,zIndex:20}}>

              {/* Cartes au-dessus du siège — l'espace est TOUJOURS réservé pour les
                  villains (même pliés) afin que tous les avatars s'alignent sur
                  l'anneau (sinon un siège plié « remonte » : cf. bug BTN/BB). */}
              {isH ? (
                <HeroHoleCards cards={p.hole} size={isTop?"1t-hero-top":"1t-hero-bottom"} gap={isTop?5:8}
                  style={{marginBottom:isTop?4:6,marginTop:heroCardsPull,transform:`scale(${heroScale})`,transformOrigin:"bottom center",filter:"drop-shadow(0 8px 22px rgba(0,0,0,.86)) drop-shadow(0 0 16px rgba(0,191,255,.34))"}}/>
              ) : (
                <div style={{minHeight:villainCardSlot,marginBottom:villainCardTuck,display:"flex",alignItems:"flex-end",gap:3}}>
                  {!p.folded && (showFace
                    ? p.hole.slice(0,2).map((c,i)=><Card key={i} r={c.r} s={c.s} size="1t-villain" delay={i*0.05} revealed/>)
                    : <VillainBackCards size="1t-villain" gap={3}/>)}
                </div>
              )}

              {/* Carte joueur (avatar + plaque) */}
              <div className={`player-card-1t${isH?" hero":" villain"}${isActing?(isH?" active-hero":" active-vil"):""}${p.folded?" seat-folded":""}`} style={{position:"relative"}}>
                <PlayerAvatarPremium isHero={isH} isVillain={!isH} profile={profile} size={avSize(isH)} active={isActing}/>
                {lastBadge && (
                  <span className={`seat-action-badge pf-seat-status ${lastBadge.cls}`}>{lastBadge.l}</span>
                )}
                {isH && <span className="pf-seat-hero-chip">HERO</span>}
                <div className="pf-seat-nameplate">
                  <span className="seat-card-pos" style={{fontSize:(isH?13:11.5)*s,color:col}}>{p.pos}</span>
                  <span className="seat-card-stack" style={{fontSize:(isH?11:9.5)*s,color:isH?T.gold:T.text3}}>{fmt(p.stack)}</span>
                </div>
                {/* ALL-IN : même traitement que Fold/Check — en surimpression, sinon
                    il rallonge le bloc siège et le fait sortir du cadre en haut. */}
                {p.allIn && <span className="seat-action-badge pf-seat-status action-allin">ALL-IN</span>}
              </div>

            </PlayerSeat>

            {/* Jetons de mise devant le joueur */}
            <SeatActionZone
              x={anchor.x}
              y={anchor.y}
              amount={p.committed}
              label={cur && cur.playerId===p.id ? cur.label : ""}
              type={cur && cur.playerId===p.id ? actionType(cur) : "BET"}
              kind={isH?"hero":"villain"}
              tableMode={1}
            />
          </React.Fragment>
        );
      })}

      {/* DEALER BUTTON */}
      {dlrPt && (
        <div style={{position:"absolute",left:`${dlrPt.x}%`,top:`${dlrPt.y}%`,transform:"translate(-50%,-50%)",zIndex:22,
          width:22,height:22,borderRadius:"50%",background:"radial-gradient(circle at 35% 30%,#fff,#c9d4e8 60%,#8da9d7)",
          border:"1px solid rgba(0,0,0,.35)",display:"flex",alignItems:"center",justifyContent:"center",
          fontFamily:T.brand,fontSize:11,fontWeight:900,color:"#0b2f77",boxShadow:"0 2px 8px rgba(0,0,0,.5)"}}>D</div>
      )}
    </div>
  );
}
