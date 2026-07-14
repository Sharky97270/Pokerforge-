// PokerForge — Entraineur GTO : layouts, IA vilain, generation de spots, table, session (extrait de App.jsx, Phase 3.3)
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme.js";
import { useIsMobile, vibrate, VIB } from "../utils/ui.js";
import { roundBb, shuffle } from "../utils/format.js";
import { loadStats, saveStats, saveStatsSafe, loadHistory } from "../stats.js";
import { SPOTS, POKER_EVENTS, POSITIONS_BY_SIZE } from "../data/content.js";
import { Card, CardBack, HeroHoleCards, VillainBackCards } from "../components/table/Cards.jsx";
import { CHIP_THEMES, BlindChipStack, TrainingPotStack, SeatActionZone, PlayerSeat } from "../components/table/Chips.jsx";
import { trainerAvatarKey, trainerSeatAvatarProfile, PlayerAvatarPremium } from "../components/table/Avatars.jsx";
import { TRAINER_VISUAL_CONFIG, getTrainerVisualLayoutConfig, trainerBoardCollisionZone, trainerTableGeometry, trainerBoardPosition, trainerPotPosition } from "../trainerVisualConfig.js";
import dealerSvgUrl from "../assets/trainer-v2/dealer-button.svg";
import { trainerActionDisplayVerb, trainerActionCssClass, normalizeTrainerActionEvent, validateSpotConsistency } from "../trainerActionEvent.js";
import { trainerRoundCloseDecision } from "../trainerRoundEngine.js";
import { ADAPTIVE_MODE_OPTIONS, describeCoachSpot, createTrainingSpotFromHand, buildTrainerIntegrationQueue, countEvolutiveSpots, recordAdaptiveDecision } from "../spotAiEngine.js";
import { TrainerReviewPanel, appendPlayedSpot, loadPlayedSpots, buildTrainerReview } from "./PracticedHands.jsx";

const SEAT_DEFAULT_STATS={
  "UTG":{vpip:20,pfr:16},"HJ":{vpip:22,pfr:18},"CO":{vpip:25,pfr:20},
  "BTN":{vpip:28,pfr:23},"SB":{vpip:30,pfr:19},"BB":{vpip:24,pfr:17},
};

/* ═══════════════════════════════════════
   SEATS CONFIG
═══════════════════════════════════════ */
const SEATS6=[
  {pos:"BTN",x:78,y:76},{pos:"SB",x:50,y:92},{pos:"BB",x:22,y:76},
  {pos:"UTG",x:18,y:30},{pos:"HJ",x:50,y:12},{pos:"CO",x:82,y:30},
];
/* Positions recalibrées pour mode 1 table (oval plus haut, max y=82%) */
const SEATS6_1T=[
  {pos:"BTN",x:84,y:68},{pos:"SB",x:62,y:82},{pos:"BB",x:38,y:82},
  {pos:"UTG",x:16,y:68},{pos:"HJ",x:32,y:16},{pos:"CO",x:68,y:16},
];
const TRAINING_SEAT_ORDER=["HJ","CO","BTN","SB","BB","UTG"];
const BOARD_SAFE_ZONE_PADDING=3.5;
const TRAINING_BOARD_SAFE_ZONE=TRAINER_VISUAL_CONFIG.boardSafeZone;
function pointTowardCenter(pt,push=.45){
  return {x:pt.x+(50-pt.x)*push,y:pt.y+(50-pt.y)*push};
}
function seatRegion(pt){
  if(pt.y<=28)return"top";
  if(pt.y>=74)return"bottom";
  if(pt.x<=18)return"left";
  if(pt.x>=82)return"right";
  return"default";
}
function clampTrainingPoint(v,min=3,max=97){return Math.max(min,Math.min(max,v));}
function pushGetter(cfg,pos,region,fallback){
  if(typeof cfg==="number")return cfg;
  return cfg?.[pos]??cfg?.[region]??cfg?.default??fallback;
}
function clampPointOutsideBoard(pt,seat,safeZone=TRAINING_BOARD_SAFE_ZONE,padding=BOARD_SAFE_ZONE_PADDING){
  const zone={
    xMin:safeZone.xMin-padding,xMax:safeZone.xMax+padding,
    yMin:safeZone.yMin-padding,yMax:safeZone.yMax+padding,
  };
  const inside=pt.x>=zone.xMin&&pt.x<=zone.xMax&&pt.y>=zone.yMin&&pt.y<=zone.yMax;
  if(!inside)return {x:clampTrainingPoint(pt.x),y:clampTrainingPoint(pt.y)};
  const dx=seat.x-50;
  const dy=seat.y-50;
  if(Math.abs(dx)>Math.abs(dy)){
    return {x:clampTrainingPoint(dx<0?zone.xMin:zone.xMax),y:clampTrainingPoint(pt.y)};
  }
  return {x:clampTrainingPoint(pt.x),y:clampTrainingPoint(dy<0?zone.yMin:zone.yMax)};
}
function seatOffsetPoint(pt,region,offsets){
  const off=offsets[region]||offsets.default||{x:0,y:0};
  return {x:clampTrainingPoint(pt.x+off.x),y:clampTrainingPoint(pt.y+off.y)};
}
function applyTrainingAnchorOverrides(anchorSet,overrides){
  if(!overrides)return anchorSet;
  Object.entries(overrides).forEach(([key,pt])=>{
    if(!pt||!anchorSet[key])return;
    anchorSet[key]={
      ...anchorSet[key],
      x:clampTrainingPoint(pt.x??anchorSet[key].x),
      y:clampTrainingPoint(pt.y??anchorSet[key].y),
    };
  });
  if(overrides.betAnchor){
    if(!overrides.preflopBetAnchor)anchorSet.preflopBetAnchor={...anchorSet.betAnchor};
    if(!overrides.postflopBetAnchor)anchorSet.postflopBetAnchor={...anchorSet.betAnchor};
  }
  return anchorSet;
}
function createTrainingTableLayout(name,seats,options={}){
  const safeZone=options.boardSafeZone||TRAINING_BOARD_SAFE_ZONE;
  const tableGeometry=options.tableGeometry;
  const boardPosition=options.boardPosition;
  const potPosition=options.potPosition;
  const cardOffsets=options.cardOffsets||{
    top:{x:0,y:-7},bottom:{x:0,y:-9},left:{x:-6,y:-4},right:{x:6,y:-4},default:{x:0,y:-6},
  };
  const stackOffsets=options.stackOffsets||{
    top:{x:0,y:9},bottom:{x:0,y:9},left:{x:0,y:9},right:{x:0,y:9},default:{x:0,y:9},
  };
  const anchors={};
  Object.entries(seats).forEach(([pos,seat])=>{
    const region=seatRegion(seat);
    const actionPush=pushGetter(options.actionPush,pos,region,.27);
    const blindPush=pushGetter(options.blindPush,pos,region,.18);
    const dealerPush=pushGetter(options.dealerPush,pos,region,.16);
    const labelPush=pushGetter(options.actionLabelPush,pos,region,actionPush+.07);
    const blindAnchor=clampPointOutsideBoard(pointTowardCenter(seat,blindPush),seat,safeZone);
    const betAnchor=clampPointOutsideBoard(pointTowardCenter(seat,actionPush),seat,safeZone);
    anchors[pos]=applyTrainingAnchorOverrides({
      region,
      seatAnchor:{...seat},
      cardsAnchor:seatOffsetPoint(seat,region,cardOffsets),
      stackAnchor:seatOffsetPoint(seat,region,stackOffsets),
      blindAnchor,
      betAnchor,
      preflopBetAnchor:{...betAnchor},
      postflopBetAnchor:{...betAnchor},
      dealerAnchor:clampPointOutsideBoard(pointTowardCenter(seat,dealerPush),seat,safeZone),
      actionLabelAnchor:clampPointOutsideBoard(pointTowardCenter(seat,labelPush),seat,safeZone),
    },options.anchorOverrides?.[pos]);
  });
  return {name,seats,seatAnchors:anchors,boardSafeZone:safeZone,tableGeometry,boardPosition,potPosition};
}
/* ── SIÈGES MOBILES 1T : anneau d'ancrage FIXE (architecture SeatSlot) ──
   Les emplacements physiques ne bougent JAMAIS ; seules les positions poker
   (labels) tournent à l'intérieur. slot[0] = bas (toujours le héros), puis on
   tourne dans le sens anti-horaire (bas-gauche → haut → bas-droite) pour
   préserver l'ordre de table (adjacence BTN-SB-BB → blindes/dealer corrects).
   Coordonnées en % du canvas. */
const MOBILE_SEAT_RINGS = {
  2: [{ x: 50, y: 85 }, { x: 50, y: 16 }],
  3: [{ x: 50, y: 86 }, { x: 21, y: 34 }, { x: 79, y: 34 }],
  4: [{ x: 50, y: 87 }, { x: 15, y: 52 }, { x: 50, y: 13 }, { x: 85, y: 52 }],
  5: [{ x: 50, y: 87 }, { x: 17, y: 62 }, { x: 27, y: 20 }, { x: 73, y: 20 }, { x: 83, y: 62 }],
  6: [{ x: 50, y: 88 }, { x: 16, y: 70 }, { x: 16, y: 28 }, { x: 50, y: 12 }, { x: 84, y: 28 }, { x: 84, y: 70 }],
  7: [{ x: 50, y: 88 }, { x: 16, y: 64 }, { x: 18, y: 30 }, { x: 40, y: 12 }, { x: 60, y: 12 }, { x: 82, y: 30 }, { x: 84, y: 64 }],
  8: [{ x: 50, y: 88 }, { x: 15, y: 64 }, { x: 16, y: 38 }, { x: 34, y: 14 }, { x: 50, y: 11 }, { x: 66, y: 14 }, { x: 84, y: 38 }, { x: 85, y: 64 }],
  9: [{ x: 50, y: 89 }, { x: 13, y: 69 }, { x: 13, y: 37 }, { x: 27, y: 15 }, { x: 44, y: 11 }, { x: 56, y: 11 }, { x: 73, y: 15 }, { x: 87, y: 37 }, { x: 87, y: 69 }],
};
function computeHeroCentricSeats(positions, heroPos, geometry, opts = {}) {
  const n = positions.length;
  const seats = {};
  if (!n) return seats;
  const heroIdx = Math.max(0, positions.indexOf(heroPos));
  const ordered = [];
  for (let i = 0; i < n; i++) ordered.push(positions[(heroIdx + i) % n]);
  const ring = MOBILE_SEAT_RINGS[n];
  if (ring) {
    for (let i = 0; i < n; i++) seats[ordered[i]] = { ...ring[i] };
    return seats;
  }
  // Repli (tailles hors table) : ancien calcul par arc sur l'ellipse du feutre.
  const g = geometry || { top: 6, left: 8, right: 8, bottom: 8 };
  const cx = (g.left + (100 - g.right)) / 2, cy = (g.top + (100 - g.bottom)) / 2;
  const rx = (100 - g.left - g.right) / 2, ry = (100 - g.top - g.bottom) / 2;
  const fx = 0.88, fy = 0.84;
  seats[ordered[0]] = { x: +cx.toFixed(2), y: +(cy + 0.64 * ry).toFixed(2) };
  const m = n - 1;
  const gap = 118, start = 90 + gap / 2, span = 360 - gap;
  for (let k = 0; k < m; k++) {
    const ang = (start + k * (span / (m - 1))) * Math.PI / 180;
    seats[ordered[k + 1]] = { x: +(cx + fx * rx * Math.cos(ang)).toFixed(2), y: +(cy + fy * ry * Math.sin(ang)).toFixed(2) };
  }
  return seats;
}
const TRAINER_VISUAL_1T=getTrainerVisualLayoutConfig(1);
const TRAINER_VISUAL_2T=getTrainerVisualLayoutConfig(2);
const TRAINER_VISUAL_3T=getTrainerVisualLayoutConfig(3);
const TRAINER_VISUAL_4T=getTrainerVisualLayoutConfig(4);
const TRAINER_VISUAL_1T_MOBILE=getTrainerVisualLayoutConfig(1,"mobile");
const TRAINER_VISUAL_2T_MOBILE=getTrainerVisualLayoutConfig(2,"mobile");
const TRAINER_VISUAL_3T_MOBILE=getTrainerVisualLayoutConfig(3,"mobile");
const TRAINER_VISUAL_4T_MOBILE=getTrainerVisualLayoutConfig(4,"mobile");
const trainingTableLayout1T=createTrainingTableLayout("1T",TRAINER_VISUAL_1T.seatPositions,TRAINER_VISUAL_1T);
const trainingTableLayout2T=createTrainingTableLayout("2T",TRAINER_VISUAL_2T.seatPositions,TRAINER_VISUAL_2T);
const trainingTableLayout3T=createTrainingTableLayout("3T",TRAINER_VISUAL_3T.seatPositions,TRAINER_VISUAL_3T);
const trainingTableLayout4T=createTrainingTableLayout("4T",TRAINER_VISUAL_4T.seatPositions,TRAINER_VISUAL_4T);
const trainingTableLayout1TMobile=createTrainingTableLayout("1T-mobile",TRAINER_VISUAL_1T_MOBILE.seatPositions,TRAINER_VISUAL_1T_MOBILE);
const trainingTableLayout2TMobile=createTrainingTableLayout("2T-mobile",TRAINER_VISUAL_2T_MOBILE.seatPositions,TRAINER_VISUAL_2T_MOBILE);
const trainingTableLayout3TMobile=createTrainingTableLayout("3T-mobile",TRAINER_VISUAL_3T_MOBILE.seatPositions,TRAINER_VISUAL_3T_MOBILE);
const trainingTableLayout4TMobile=createTrainingTableLayout("4T-mobile",TRAINER_VISUAL_4T_MOBILE.seatPositions,TRAINER_VISUAL_4T_MOBILE);
const TRAINING_SEAT_LAYOUTS={
  1:trainingTableLayout1T,
  2:trainingTableLayout2T,
  3:trainingTableLayout3T,
  4:trainingTableLayout4T,
  multi:trainingTableLayout2T,
};
const TRAINING_SEAT_LAYOUTS_MOBILE={
  1:trainingTableLayout1TMobile,
  2:trainingTableLayout2TMobile,
  3:trainingTableLayout3TMobile,
  4:trainingTableLayout4TMobile,
  multi:trainingTableLayout2TMobile,
};
function getTrainingLayout(numTables,isMobile=false){
  if(isMobile)return TRAINING_SEAT_LAYOUTS_MOBILE[numTables]||trainingTableLayout2TMobile;
  return TRAINING_SEAT_LAYOUTS[numTables]||trainingTableLayout2T;
}
function pctCss(v){return `${Number(v||0)}%`;}
function feltGeometryFor(numTables){
  return trainerTableGeometry(numTables);
}
function boardPointFor(numTables){
  return trainerBoardPosition(numTables);
}
function potPointFor(numTables,hasBoard=false){
  return trainerPotPosition(numTables,hasBoard);
}
function trainerFeltStyle(numTables,{phase,errorFlash,geometry}={}){
  const g=geometry||feltGeometryFor(numTables);
  const isCompact=numTables>=2;
  const insetGlow=isCompact?118:180;
  const topGlow=isCompact?48:72;
  const bottomGlow=isCompact?54:90;
  const railBase=isCompact?3:4;
  const activeGold=isCompact?".68":".76";
  const borderAlpha=isCompact?".62":".72";
  const boxShadow=errorFlash
    ?`inset 0 0 ${insetGlow}px rgba(0,0,0,.62),inset 0 ${isCompact?20:28}px ${topGlow}px rgba(255,255,255,.045),inset 0 -${isCompact?28:42}px ${isCompact?60:88}px rgba(0,0,0,.52),0 0 0 ${railBase}px rgba(5,15,12,.96),0 0 0 ${railBase+3}px rgba(255,69,96,.68),0 0 ${isCompact?38:55}px rgba(255,69,96,.32),0 ${isCompact?20:30}px ${bottomGlow}px rgba(0,0,0,.86)`
    :phase==="hero"
      ?`inset 0 0 ${insetGlow}px rgba(0,0,0,.58),inset 0 ${isCompact?20:28}px ${topGlow}px rgba(255,255,255,.05),inset 0 -${isCompact?28:42}px ${isCompact?58:88}px rgba(0,0,0,.5),0 0 0 ${railBase}px rgba(5,15,12,.96),0 0 0 ${railBase+2}px rgba(218,156,48,${activeGold}),0 0 0 ${railBase+6}px rgba(0,191,255,.18),0 ${isCompact?20:28}px ${bottomGlow}px rgba(0,0,0,.84),0 0 ${isCompact?42:74}px rgba(0,140,255,.22)`
      :`inset 0 0 ${insetGlow}px rgba(0,0,0,.58),inset 0 ${isCompact?20:28}px ${topGlow}px rgba(255,255,255,.045),inset 0 -${isCompact?28:42}px ${isCompact?58:88}px rgba(0,0,0,.5),0 0 0 ${railBase}px rgba(5,15,12,.96),0 0 0 ${railBase+2}px rgba(31,139,255,.30),0 0 0 ${railBase+6}px rgba(255,194,71,.08),0 ${isCompact?20:28}px ${bottomGlow}px rgba(0,0,0,.84),0 0 ${isCompact?38:64}px rgba(0,140,255,.16)`;
  return {
    position:"absolute",
    top:pctCss(g.top),
    left:pctCss(g.left),
    right:pctCss(g.right),
    bottom:pctCss(g.bottom),
    background:"radial-gradient(ellipse at 50% 18%,rgba(26,62,115,.95) 0%,rgba(13,38,78,.99) 38%,rgba(6,20,46,.998) 70%,#030b1e 100%)",
    border:`2px solid rgba(255,208,90,${borderAlpha})`,
    borderRadius:"50%",
    boxShadow,
    animation:phase==="hero"&&!isCompact?"tableHeroGlow 2.5s ease-in-out infinite":undefined,
    transition:"box-shadow .3s",
    overflow:"hidden",
    filter:`drop-shadow(0 0 ${isCompact?26:40}px rgba(0,191,255,.14)) drop-shadow(0 ${isCompact?13:22}px ${isCompact?22:34}px rgba(0,0,0,.72))`,
  };
}
function feltRailStyle(numTables,kind="outer",geometry){
  const g=geometry||feltGeometryFor(numTables);
  return {
    position:"absolute",
    inset:kind==="outer"?g.railInset:g.innerInset,
    borderRadius:"50%",
    border:kind==="outer"?"2px solid rgba(231,236,243,.12)":"1px solid rgba(255,208,90,.14)",
    background:kind==="outer"?"linear-gradient(180deg,rgba(231,236,243,.035),rgba(0,0,0,.06))":"radial-gradient(ellipse at 50% 0%,rgba(231,236,243,.045) 0%,transparent 52%)",
    boxShadow:kind==="outer"?"0 0 0 1px rgba(0,0,0,.62),inset 0 0 0 1px rgba(255,208,90,.08)":"inset 0 0 18px rgba(0,0,0,.24)",
    pointerEvents:"none",
  };
}
function pointInsideFeltGeometry(pt,geom,margin=1.5){
  return pt.x>=geom.left+margin&&pt.x<=100-geom.right-margin&&pt.y>=geom.top+margin&&pt.y<=100-geom.bottom-margin;
}
function seatAnchorPoint(layout,pos,key="seatAnchor"){
  return layout.seatAnchors?.[pos]?.[key]||layout.seats?.[pos]||{x:50,y:50};
}
function seatActionPoint(layout,pos,{hasBoard=false}={}){
  const key=hasBoard?"postflopBetAnchor":"preflopBetAnchor";
  return seatAnchorPoint(layout,pos,key)||seatAnchorPoint(layout,pos,"betAnchor");
}
function blindAnchorPoint(layout,pos){
  return seatAnchorPoint(layout,pos,"blindAnchor");
}
function dealerAnchorPoint(layout){
  // Jeton D dérivé de la position réelle du siège BTN.
  // 1T (figé) : bas-gauche. Multi : à GAUCHE du siège à hauteur d'avatar —
  // le bas-gauche chevauchait la nameplate (badge position/stack sous l'avatar)
  // sur les zones compactes ; vérifié sans collision (nameplate/cartes/mises).
  const seat=layout.seats?.BTN||{x:50,y:50};
  const off={"1T":{x:7,y:9},"2T":{x:9,y:0},"3T":{x:8,y:0},"4T":{x:8,y:0}}[layout.name]||{x:9,y:0};
  return {x:Math.max(4,seat.x-off.x),y:Math.min(90,seat.y+off.y)};
}
function actionLabelAnchorPoint(layout,pos){
  return seatAnchorPoint(layout,pos,"actionLabelAnchor");
}
function pointInsideZone(pt,zone){
  return pt.x>=zone.xMin&&pt.x<=zone.xMax&&pt.y>=zone.yMin&&pt.y<=zone.yMax;
}
function pointDistance(a,b){
  if(!a||!b)return Infinity;
  const dx=(a.x||0)-(b.x||0),dy=(a.y||0)-(b.y||0);
  return Math.sqrt(dx*dx+dy*dy);
}
function separateActionFromAnchor(pt,anchor,seat,minGap){
  if(!anchor||pointDistance(pt,anchor)>=minGap)return pt;
  const side=seat.x<50?1:seat.x>50?-1:(pt.x<50?-1:1);
  const vertical=seat.y>=70?-1:seat.y<=28?1:(pt.y<50?-1:1);
  const missing=minGap-pointDistance(pt,anchor)+2;
  return {
    x:pt.x+side*Math.max(3,missing),
    y:pt.y+vertical*Math.min(6,Math.max(2,missing*.5)),
  };
}
function resolveTrainerActionPoint(layout,pos,{hasBoard=false}={}){
  const seat=layout.seats?.[pos]||{x:50,y:50};
  let pt={...seatActionPoint(layout,pos,{hasBoard})};
  const collisionZone=trainerBoardCollisionZone(hasBoard);
  if(pointInsideZone(pt,collisionZone)){
    pt=clampPointOutsideBoard(pointTowardCenter(seat,.27),seat,collisionZone,3);
  }
  const isBlindSeat=pos==="BB"||pos==="SB";
  const blind=blindAnchorPoint(layout,pos);
  const cards=seatAnchorPoint(layout,pos,"cardsAnchor");
  pt=separateActionFromAnchor(pt,blind,seat,isBlindSeat?TRAINER_VISUAL_CONFIG.anchorSafety.minBetBlindGap:7);
  pt=separateActionFromAnchor(pt,cards,seat,isBlindSeat?TRAINER_VISUAL_CONFIG.anchorSafety.minBetCardsGap:8);
  pt=separateActionFromAnchor(pt,seat,seat,isBlindSeat?TRAINER_VISUAL_CONFIG.anchorSafety.minBetSeatGap:8);
  if(hasBoard&&pointInsideZone(pt,collisionZone)){
    pt=clampPointOutsideBoard(pt,seat,collisionZone,4);
  }
  if(seat.y>=70){
    const bottomMin=hasBoard?collisionZone.yMax+4:(seat.y>=82?68:62);
    if(pt.y<bottomMin)pt.y=bottomMin;
  }
  if(seat.y<=24&&pointInsideZone(pt,collisionZone)){
    pt.y=hasBoard?collisionZone.yMin-4:33;
  }
  if(seat.x<=20&&pt.x>28)pt.x=28;
  if(seat.x>=80&&pt.x<72)pt.x=72;
  const geom=layout.tableGeometry||feltGeometryFor(2);
  if(!pointInsideFeltGeometry(pt,geom,1)){
    pt=pointTowardCenter(seat,.28);
  }
  return {x:clampTrainingPoint(pt.x),y:clampTrainingPoint(pt.y)};
}
function resolveTrainerBlindPoint(layout,pos){
  const seat=layout.seats?.[pos]||{x:50,y:50};
  let pt={...blindAnchorPoint(layout,pos)};
  const tableCenterZone={xMin:34,xMax:66,yMin:24,yMax:66};
  if(pointInsideZone(pt,tableCenterZone)){
    pt=clampPointOutsideBoard(pointTowardCenter(seat,.14),seat,tableCenterZone,3);
  }
  if(seat.y>=70)pt.y=Math.max(pt.y,seat.y-10);
  return {x:clampTrainingPoint(pt.x),y:clampTrainingPoint(pt.y)};
}



/* ═══════════════════════════════════════
   VILLAIN AI
═══════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   VILLAIN PROFILES — IA dynamique et réaliste
════════════════════════════════════════════════════════ */
const VILLAIN_PROFILES={
  Nit:{
    vpip:12,pfr:10,agg:1.1,"3bet":2,
    foldToCbet:74,callCbet:20,raiseCbet:6,
    foldToRaise:80,callRaise:16,
    bluffFreq:6,cbetFreq:45,donkFreq:5,
    allinCallRange:.28,
    desc:"Très serré · Fold fréquent · Peu d'initiatives",
    leaks:["Fold too much vs cbet","Never bluffs river","Way too tight OOP"],
    exploitTip:"Bet souvent pour la valeur. Ne bluff jamais. Il fold tout ce qui est marginal.",
    gtoDeviation:"Fort : trop de folds, pas assez de défenses, ranges trop serrées.",
    col:"#9FB0CC",
  },
  TAG:{
    vpip:22,pfr:18,agg:2.8,"3bet":7,
    foldToCbet:52,callCbet:34,raiseCbet:14,
    foldToRaise:55,callRaise:30,
    bluffFreq:28,cbetFreq:70,donkFreq:12,
    allinCallRange:.48,
    desc:"Solide et équilibré · Peu d'erreurs · Proche GTO",
    leaks:["Légèrement trop tight OOP","Underbluff river","Overvalue top pair"],
    exploitTip:"Proche du GTO. Exploits minimes. Value bet thin, bluff sélectivement.",
    gtoDeviation:"Faible : bonne base, quelques fréquences légèrement déséquilibrées.",
    col:"#1F8BFF",
  },
  LAG:{
    vpip:35,pfr:28,agg:3.8,"3bet":12,
    foldToCbet:38,callCbet:38,raiseCbet:24,
    foldToRaise:42,callRaise:40,
    bluffFreq:45,cbetFreq:82,donkFreq:22,
    allinCallRange:.62,
    desc:"Large et agressif · Pression constante · Bluffs fréquents",
    leaks:["Overbluff turns","Too wide 3-bet range","Bluff catching too light"],
    exploitTip:"3-bet light pour l'isoler. Value bet large quand il appelle trop. Trap avec les monstres.",
    gtoDeviation:"Moyen : ranges trop larges, fréquences de bluff élevées, défense excessive.",
    col:"#FF8A3D",
  },
  "Calling Station":{
    vpip:48,pfr:8,agg:.8,"3bet":2,
    foldToCbet:18,callCbet:72,raiseCbet:10,
    foldToRaise:25,callRaise:68,
    bluffFreq:5,cbetFreq:20,donkFreq:30,
    allinCallRange:.75,
    desc:"Call excessivement · Rare fold · Sous-agression",
    leaks:["Calls too wide postflop","Never raises without nuts","Easy to read"],
    exploitTip:"Bet grosse avec toutes tes mains de valeur. Ne bluff JAMAIS. Taille maximale sur river.",
    gtoDeviation:"Très fort : fold equity ≈ 0, impossible à bluffer, sizing purement value-oriented.",
    col:"#FF4560",
  },
  Fish:{
    vpip:55,pfr:12,agg:1.2,"3bet":3,
    foldToCbet:42,callCbet:48,raiseCbet:10,
    foldToRaise:50,callRaise:42,
    bluffFreq:15,cbetFreq:35,donkFreq:40,
    allinCallRange:.65,
    desc:"Récréatif · Erreurs fréquentes · Sizings incohérents",
    leaks:["Random sizings","Bad hand selection","Emotional decisions"],
    exploitTip:"Patient et value-oriented. Il perd souvent avec des mains dominées. Large value bet.",
    gtoDeviation:"Très fort : joue hors ranges, décisions non-théoriques, exploitable massivement.",
    col:"#FFC247",
  },
  "Aggro Reg":{
    vpip:26,pfr:22,agg:4.2,"3bet":11,
    foldToCbet:44,callCbet:30,raiseCbet:26,
    foldToRaise:40,callRaise:35,
    bluffFreq:38,cbetFreq:85,donkFreq:15,
    allinCallRange:.55,
    desc:"Forte agressivité · Raises fréquents · Pression constante",
    leaks:["Overbluff turns and rivers","Too many check-raises","Exploitable by trapping"],
    exploitTip:"Trap avec les monstres. Il surchage les turns. Fold tes bluffs sur river.",
    gtoDeviation:"Moyen : bonnes fréquences mais overbluff sur certaines streets.",
    col:"#9B5CFF",
  },
  Maniac:{
    vpip:65,pfr:50,agg:6.5,"3bet":22,
    foldToCbet:20,callCbet:35,raiseCbet:45,
    foldToRaise:22,callRaise:35,
    bluffFreq:65,cbetFreq:92,donkFreq:50,
    allinCallRange:.80,
    desc:"Très agressif · Bluffs excessifs · Imprévisible",
    leaks:["Massively overbluffs","Never gives up","Unbalanced ranges"],
    exploitTip:"Appelle plus large. Il bluff constamment. Trap et call-down avec des mains moyennes.",
    gtoDeviation:"Extrême : ranges déséquilibrées, bluff bien trop fréquent, exploitable via calls élargis.",
    col:"#FF2D75",
  },
  Reg:{
    vpip:25,pfr:20,agg:3.0,"3bet":8,
    foldToCbet:50,callCbet:33,raiseCbet:17,
    foldToRaise:52,callRaise:33,
    bluffFreq:30,cbetFreq:72,donkFreq:10,
    allinCallRange:.50,
    desc:"Régulier solide · Proche de la théorie · Quelques leaks",
    leaks:["Slightly predictable cbets","Some river sizing tells"],
    exploitTip:"Joue proche du GTO. Exploits marginaux. Focalise sur tes propres fréquences.",
    gtoDeviation:"Faible : quelques écarts mineurs de fréquences.",
    col:"#34D8FF",
  },
};

/* ── Plateformes et populations ── */
const PLATFORM_PROFILES={
  winamax:{
    name:"Winamax",flag:"🇫🇷",
    desc:"Population agressive, bluffs fréquents, pression constante",
    mod:{agg:+0.15,bluff:+0.12,cbet:+0.08},
    dominant:["LAG","Aggro Reg"],
    note:"Winamax NL: population parmi les plus agressive d'Europe. Attends-toi à beaucoup de 3-bets.",
  },
  pokerstars:{
    name:"PokerStars",flag:"♠",
    desc:"Population équilibrée, profils récréatifs aux micros",
    mod:{agg:-0.05,bluff:-0.05,cbet:+0.0},
    dominant:["TAG","Fish","Calling Station"],
    note:"PokerStars micro/low: nombreux récréatifs passifs. Value bet heavy.",
  },
  ggpoker:{
    name:"GGPoker",flag:"🌐",
    desc:"Dynamique et agressif, sizings extrêmes fréquents",
    mod:{agg:+0.20,bluff:+0.15,cbet:+0.12},
    dominant:["LAG","Aggro Reg","Maniac"],
    note:"GGPoker: sizings overbet fréquents, action très rapide, bluffs agressifs.",
  },
  wpt:{
    name:"WPT Global",flag:"🃏",
    desc:"Mix de réguliers et récréatifs, stakes moyens",
    mod:{agg:+0.05,bluff:+0.05,cbet:+0.03},
    dominant:["TAG","Reg","LAG"],
    note:"WPT Global: population mixte équilibrée.",
  },
  highstakes:{
    name:"High Stakes",flag:"💎",
    desc:"Profils très proches de la théorie, peu de leaks",
    mod:{agg:0,bluff:0,cbet:0},
    dominant:["TAG","Reg","Aggro Reg"],
    note:"High Stakes: près du GTO, exploits minimes, focus sur ses propres fréquences.",
  },
  unibet:{
    name:"Unibet",flag:"🇪🇺",
    desc:"Population soft, beaucoup de récréatifs passifs",
    mod:{agg:-0.12,bluff:-0.10,cbet:-0.08},
    dominant:["Nit","Fish","Calling Station"],
    note:"Unibet: très soft, value bet large avec toutes tes bonnes mains.",
  },
};

/* ── Niveau du field (stakes) → tendances population, n'agit qu'en mode Exploit ──
   agg/bluff/cbet : modificateurs additifs ; fold>0 = field discipliné (fold/discipline+),
   fold<0 = field soft (call station, overcall, sous-bluff). */
const FIELD_MODS={
  "Standard":{agg:0,bluff:0,cbet:0,fold:0,label:"population standard"},
  "Récréatif":{agg:-0.18,bluff:-0.16,cbet:-0.10,fold:-0.20,label:"récréatifs : calling-station, sous-bluff massif"},
  "Micro-limites":{agg:-0.14,bluff:-0.13,cbet:-0.08,fold:-0.15,label:"micro : loose-passif, overcall"},
  "Low Stakes":{agg:-0.08,bluff:-0.07,cbet:-0.04,fold:-0.08,label:"low : encore passif, peu de 3-bet"},
  "Mid Stakes":{agg:0,bluff:0,cbet:0,fold:0,label:"mid : équilibré"},
  "Reg":{agg:0.03,bluff:0.02,cbet:0.02,fold:0.04,label:"reg : proche GTO"},
  "Tough Reg":{agg:0.06,bluff:0.04,cbet:0.03,fold:0.08,label:"tough reg : équilibré, peu exploitable"},
  "High Stakes":{agg:0.05,bluff:0.03,cbet:0.02,fold:0.06,label:"high stakes : GTO+, exploits minimes"},
};

/* ── IA Villain avancée ── */
function villainDecide(street,heroAct,vType,pot,mode="gto",platform="pokerstars",spr=8,stack=100,vPos="BB",boardLen=0,field="Standard"){
  const profile=VILLAIN_PROFILES[vType]||VILLAIN_PROFILES["Reg"];
  const platformMod=PLATFORM_PROFILES[platform]?.mod||{agg:0,bluff:0,cbet:0};
  const fieldMod=(mode!=="gto"&&FIELD_MODS[field])?FIELD_MODS[field]:{agg:0,bluff:0,cbet:0,fold:0};
  const r=Math.random();

  // Modificateurs contextuels
  const isIP=(vPos==="BTN"||vPos==="CO"||vPos==="HJ"); // villain en position
  const isShort=spr<4; // short stack = plus d'agressivité push/fold
  const isDeep=spr>15; // deep stack = sizing plus petit, plus de nuance
  const streetMod=street==="River"?1.12:street==="Turn"?1.05:1.0;

  // Agressivité effective = profil + platform + mode + contexte
  const gtoMod=mode==="gto"?1:0;
  let effAgg=profile.agg*.15 + platformMod.agg*(1-gtoMod) + fieldMod.agg;
  if(mode==="gto") effAgg=Math.min(.65,effAgg+.1);
  if(isIP) effAgg+=.05; // villain en position = plus agressif
  if(isShort) effAgg+=.08; // short = push/fold
  if(isDeep) effAgg-=.04; // deep = plus de call/float, moins de bluff

  // Villain remporte le pot si hero fold
  if(heroAct==="FOLD")return{action:"WIN",label:"Remporte le pot 🏆",color:T.green};

  // ── PREFLOP — logique dédiée 3-bet / coldcall / fold ──────────────────────
  if(street==="Preflop"||street==="preflop"){
    if(heroAct==="ALLIN"){
      let callP=mode==="gto"?0.42:profile.allinCallRange;
      if(vType==="Calling Station") callP=Math.min(.80,callP+.18);
      if(vType==="Nit") callP=Math.max(.10,callP-.18);
      if(vType==="Maniac") callP=Math.min(.75,callP+.16);
      if(isShort) callP=Math.min(.88,callP+.12); // short = call plus large
      return r<callP
        ?{action:"CALL",label:"Call all-in 📲",color:T.green}
        :{action:"FOLD",label:"Fold ✗",color:T.red};
    }
    // Hero ouvre (BET/RAISE/BET33/BET75) → 3-bet, coldcall ou fold
    if(heroAct!=="CHECK"&&heroAct!=="CALL"&&heroAct!=="CHECK_BACK"){
      let threeBetP=mode==="gto"?0.11:(profile.pfr/100)*0.38;
      let foldPfP=mode==="gto"?0.52:Math.max(.25,(100-profile.vpip)/100);
      if(vType==="Nit"){threeBetP*=0.5;foldPfP=Math.min(.80,foldPfP*1.25);}
      if(vType==="LAG"||vType==="Aggro Reg"){threeBetP*=1.8;foldPfP*=0.7;}
      if(vType==="Maniac"){threeBetP*=2.2;foldPfP*=0.55;}
      if(vType==="Calling Station"){threeBetP*=0.3;foldPfP*=0.4;}
      if(vType==="Fish"||vType==="Rec"){threeBetP*=0.6;foldPfP*=0.75;}
      if(isIP) threeBetP=Math.min(.22,threeBetP*1.15); // en position = 3-bet plus
      threeBetP*=(1+fieldMod.agg*1.5);foldPfP*=(1+fieldMod.fold); // field : soft = call plus, 3-bet moins
      threeBetP=Math.max(0,Math.min(.22,threeBetP));foldPfP=Math.max(.1,Math.min(.78,foldPfP));
      if(r<foldPfP) return{action:"FOLD",label:"Fold ✗",color:T.red};
      if(r<foldPfP+threeBetP){
        const sbAmt=Math.round((pot||4)*2.8+1.5);
        return{action:"RAISE",label:`3-bet · ${fmt_bb(sbAmt)}`,color:T.blue,amount:sbAmt};
      }
      return{action:"CALL",label:"Call ✓",color:T.green};
    }
    // Hero limp/check en preflop → villain option isolate/check
    let isoP=mode==="gto"?0.38:(profile.cbetFreq/100)*0.8;
    if(vType==="Maniac"||vType==="LAG") isoP=Math.min(.65,isoP*1.4);
    if(vType==="Nit"||vType==="Calling Station") isoP*=0.5;
    if(isIP) isoP=Math.min(.60,isoP+.10);
    if(r<isoP){
      const isoAmt=Math.round((pot||1.5)*2.5+1);
      return{action:"RAISE",label:`Isolate · ${fmt_bb(isoAmt)}`,color:T.amber,amount:isoAmt};
    }
    return{action:"CHECK",label:"Check",color:T.text2};
  }

  // Hero all-in facing
  if(heroAct==="ALLIN"){
    let callProb=mode==="gto"?0.45:profile.allinCallRange;
    if(platform==="ggpoker") callProb+=0.08;
    if(vType==="Calling Station") callProb=Math.min(.82,callProb+.18);
    if(vType==="Nit") callProb=Math.max(.12,callProb-.16);
    if(vType==="Maniac") callProb=Math.min(.75,callProb+.14);
    callProb=Math.max(.08,Math.min(.9,callProb-fieldMod.fold*0.6)); // field soft = call all-in plus large
    return r<callProb
      ?{action:"CALL",label:"Call all-in 📲",color:T.green}
      :{action:"FOLD",label:"Fold ✗",color:T.red};
  }

  // Hero passive (check/call) → villain peut bet/check
  if(heroAct==="CHECK"||heroAct==="CALL"||heroAct==="CHECK_BACK"){
    let betProb=mode==="gto"
      ?0.52
      :(profile.cbetFreq/100)*(1+platformMod.cbet+fieldMod.cbet);
    // Adjustments contextuels
    if(isIP) betProb+=.08;                         // position = bet plus
    if(isShort) betProb+=.10;                      // short SPR = more bets
    if(street==="River") betProb*=streetMod;       // river polarisé
    if(heroAct==="CALL") betProb*=.85;             // hero a calé = villain moins enclin
    if(vType==="Nit") betProb*=.65;
    if(vType==="Maniac"||vType==="LAG") betProb*=1.3;
    if(vType==="Calling Station") betProb*=.55;    // station = check/call
    betProb=Math.min(.85,betProb);

    if(r<betProb){
      // Sizing adapté au contexte : river polarisé = gros ou petit, deep = sizing réduit
      let pct;
      if(mode==="gto"){
        pct=street==="River"
          ?([33,75,75,100,100][Math.floor(r*5)])  // river GTO : bimodal petit/gros
          :([33,33,50,50,75][Math.floor(r*5)]);
      } else {
        if(vType==="Maniac"||vType==="LAG") pct=[66,75,75,100][Math.floor(r*4)];
        else if(vType==="Nit"||vType==="Calling Station") pct=[25,33,33][Math.floor(r*3)];
        else pct=street==="River"?[50,75,100][Math.floor(r*3)]:[33,50,50][Math.floor(r*3)];
      }
      // Deep stack : réduire légèrement les bet sizes (plus de jeu postflop)
      if(isDeep) pct=Math.round(pct*0.85);
      const amt=Math.round(pot*pct/100);
      const vilSizing=amt>0?`${fmt_bb(amt)}`:`${pct}%`;
      return{action:"BET",label:`Bet ${pct}% · ${vilSizing}`,color:T.amber,amount:amt};
    }
    return{action:"CHECK",label:"Check",color:T.text2};
  }

  // Hero aggro (bet/raise) → villain: fold / call / raise
  let foldProb=mode==="gto"
    ?0.38
    :(profile.foldToCbet/100)*(1-platformMod.agg*.5);
  let raiseProb=mode==="gto"
    ?0.14
    :(profile.raiseCbet/100)*(1+platformMod.agg);

  // Ajustements profil
  if(vType==="Calling Station"){foldProb*=.35;raiseProb*=.2;}
  if(vType==="Nit"){foldProb*=1.25;raiseProb*=.6;}
  if(vType==="Maniac"){foldProb*=.6;raiseProb*=1.5;}
  if(vType==="LAG"){foldProb*=.8;raiseProb*=1.3;}
  if(vType==="Fish"||vType==="Rec"){foldProb*=.9;raiseProb*=.5;}
  if(isIP){foldProb*=.9;raiseProb*=1.15;}     // position favorise raise
  if(isShort){raiseProb*=1.4;}                // push/fold zone
  if(isDeep){foldProb*=1.05;raiseProb*=0.9;} // deep = moins de bluff-raise, plus de call
  // River : polarisation par profil — chaque joueur réagit différemment
  if(street==="River"){
    if(vType==="Nit"){raiseProb*=.4;foldProb*=1.3;}         // Nit : fold ou call surtout
    else if(vType==="Maniac"){raiseProb*=1.2;foldProb*=.75;} // Maniac : raise encore en river
    else if(vType==="LAG"||vType==="Aggro Reg"){raiseProb*=1.0;foldProb*=.9;} // LAG : bluff-raise river
    else if(vType==="Calling Station"){raiseProb*=.25;foldProb*=.35;} // Station : call presque tout
    else{raiseProb*=.7;foldProb*=1.1;}                       // Reg/TAG : défaut polarisé
  }

  foldProb*=(1+fieldMod.fold);raiseProb*=(1+fieldMod.agg); // field : soft = fold moins (call station), tough = discipliné
  foldProb=Math.max(0,Math.min(.78,foldProb));
  raiseProb=Math.max(0,Math.min(.35,raiseProb));

  if(r<foldProb)return{action:"FOLD",label:"Fold ✗",color:T.red};
  if(r<foldProb+raiseProb){
    const rzPct=mode==="gto"?.6:([.5,.65,.8][Math.floor(r*3)]);
    const rzAmt=Math.round(pot*rzPct);
    return{action:"RAISE",label:`Raise · ${fmt_bb(rzAmt)}`,color:T.blue,amount:rzAmt};
  }
  return{action:"CALL",label:"Call ✓",color:T.green};
}

/* Helper format bb pour vilain */
function fmt_bb(v){return v>0?`${v}bb`:"";}

/* Niveau de détail des explications du Coach selon le niveau choisi */
function coachView(level){
  switch(level){
    case "Débutant":     return{detailMax:99,showLeaks:true,concise:false,verbose:true, badge:"Pédagogique",col:"#10D87A"};
    case "Intermédiaire":return{detailMax:99,showLeaks:true,concise:false,verbose:false,badge:"Standard",   col:"#1F8BFF"};
    case "Avancé":       return{detailMax:99,showLeaks:true,concise:false,verbose:false,badge:"Avancé",     col:"#34D8FF"};
    case "Reg":          return{detailMax:2, showLeaks:false,concise:true, verbose:false,badge:"Reg · concis",col:"#FFC247"};
    case "Expert":       return{detailMax:1, showLeaks:false,concise:true, verbose:false,badge:"Expert · technique",col:"#9B5CFF"};
    default:             return{detailMax:99,showLeaks:true,concise:false,verbose:false,badge:"",col:"#1F8BFF"};
  }
}
function firstSentence(t){if(!t)return t;const i=t.indexOf(". ");return i>0?t.slice(0,i+1):t;}

/* Calcule le délai "réflexion" villain selon profil + complexité */
function villainThinkDelay(vType,heroAct,mode){
  const base=mode==="gto"?900:700;
  const variance=Math.random()*500;
  const byType={Nit:200,Reg:0,TAG:0,LAG:-100,Fish:-200,Rec:-150,Maniac:-250,"Calling Station":-100,"Aggro Reg":-100};
  const byAct={RAISE:150,ALLIN:200,BET33:50,BET50:80,BET75:100,BET100:120,CHECK:0,CALL:0,FOLD:0};
  return Math.max(500,Math.min(1000,base+(byType[vType]||0)+(byAct[heroAct]||0)+variance));
}

/* ── Générer l'explication exploit vs GTO ── */
function getExploitExplanation(spot,profile,platform,mode,isBest,chosenAct,evDiff){
  const p=VILLAIN_PROFILES[profile]||VILLAIN_PROFILES["Reg"];
  const pl=PLATFORM_PROFILES[platform];
  const gtoTip=`GTO recommande ${spot.acts[spot.ok]?.l} à ${spot.freq[spot.acts[spot.ok]?.id]||50}% de fréquence.`;
  if(mode==="gto") return gtoTip;
  // Mode exploit
  const exploitNote=p.exploitTip||"Adapte ton sizing selon les tendances de ce profil.";
  const platformNote=pl?` [${pl.name}: ${pl.note}]`:"";
  return `${gtoTip}\n\nFace à ce profil ${profile} ${platformNote}: ${exploitNote}`;
}

/* ═══════════════════════════════════════
   SPOTS DATA
═══════════════════════════════════════ */

const CATS=["Tous","RFI","Vs Open","Vs 3-bet","Vs 4-bet","Flop","Turn","River","ICM","GTO"];
const FMTS=["Tous","Cash 6-max","Cash 9-max","MTT ChipEV","MTT ICM","MTT Bounty/PKO","Spin & Go"];
const VTYPES=["TAG","LAG","Reg","Fish","Nit","Calling Station","Aggro Reg","Maniac"];
const POS=["BTN","SB","BB","CO","HJ","LJ","UTG"];
const VPOS=["Tous","BB","SB","BTN","CO","HJ","LJ","UTG"];
const SMODES=[{id:20,l:"Sprint",s:"20 spots",c:"#48a878"},{id:50,l:"Standard",s:"50 spots",c:"#4888d8"},{id:100,l:"Marathon",s:"100 spots",c:"#e8a020"},{id:999,l:"Illimite",s:"spots",c:"#8858e0"}];
const DIFF_LABELS=["Tous","Débutant","Intermédiaire","Avancé","Expert"];
const DIFF_MAP={"Tous":0,"Débutant":1,"Intermédiaire":2,"Avancé":3,"Expert":4};
const STREETS=["Preflop","Flop","Turn","River"];

/* ════════════════════════════════════════════════════════
   PARAMÈTRES TRAINER PRO — structure table, stacks, spots, phase, ICM…
════════════════════════════════════════════════════════ */
/* Positions disponibles selon le nombre de joueurs (2J → 9J) */
const TABLE_SIZES=[2,3,4,5,6,7,8,9];
/* Stacks effectifs rapides (bb) */
const STACK_PRESETS=["5","10","15","20","25","30","40","60","100","150","200"];
/* Types de spot → catégorie interne (cat) pour la génération */
const SPOT_TYPES=[
  {id:"Open Raise",cat:"RFI"},{id:"Défense BB",cat:"Vs Open"},{id:"3bet",cat:"Vs Open"},
  {id:"Défense vs 3bet",cat:"Vs 3-bet"},{id:"4bet",cat:"Vs 4-bet"},{id:"Push/Fold",cat:"RFI"},
  {id:"Squeeze",cat:"Vs Open"},{id:"Blind vs Blind",cat:"RFI"},{id:"C-bet Flop",cat:"Flop"},
  {id:"Check/Raise",cat:"Flop"},{id:"Probe Bet",cat:"Turn"},{id:"Donk Bet",cat:"Flop"},
  {id:"Turn Barrel",cat:"Turn"},{id:"River Decision",cat:"River"},{id:"Call Down",cat:"River"},
  {id:"Bluff Catch",cat:"River"},{id:"Value Bet",cat:"River"},{id:"Overbet",cat:"Turn"},
];
const SPOT_TYPE_CAT=Object.fromEntries(SPOT_TYPES.map(t=>[t.id,t.cat]));
/* Phases de tournoi */
const TRN_PHASES=["Toutes","Early Game","Middle Game","Late Game","Bubble","ITM","Demi-finale","Table Finale","Top 3","Heads-Up"];
/* Pression ICM */
const ICM_LEVELS=["Désactivée","Faible","Moyenne","Forte","Extrême"];
/* Formats détaillés → format interne (fmt) pour la génération */
const FORMATS_DETAILED=[
  {id:"Tous",fmt:"Tous"},{id:"MTT",fmt:"MTT ChipEV"},{id:"KO",fmt:"MTT Bounty/PKO"},
  {id:"PKO",fmt:"MTT Bounty/PKO"},{id:"Mystery KO",fmt:"MTT Bounty/PKO"},{id:"Satellite",fmt:"MTT ICM"},
  {id:"Sit&Go",fmt:"MTT ICM"},{id:"Expresso / Spin",fmt:"Spin & Go"},{id:"Cash Game",fmt:"Cash 6-max"},
];
/* Niveau du field (impacte surtout l'Exploit) */
const FIELD_LEVELS=["Standard","Récréatif","Micro-limites","Low Stakes","Mid Stakes","Reg","Tough Reg","High Stakes"];
/* Style Hero (pour Coach AI) */
const HERO_STYLES=["GTO","TAG","LAG","Exploitant","Aggressif","Passif","Personnalisé"];
/* Profil Vilain avancé → type interne (vt) pour la génération/réponses */
const VILLAIN_ADV=[
  {id:"Tous",vt:"Tous"},{id:"GTO",vt:"Reg"},{id:"Reg",vt:"Reg"},{id:"Fish passif",vt:"Fish"},
  {id:"Fish agressif",vt:"Aggro Reg"},{id:"Nit",vt:"Nit"},{id:"LAG",vt:"LAG"},{id:"Maniac",vt:"Maniac"},
  {id:"Calling Station",vt:"Calling Station"},{id:"Shortstack récréatif",vt:"Fish"},{id:"Reg MTT Winamax",vt:"TAG"},
];
const VADV_MAP=Object.fromEntries(VILLAIN_ADV.map(v=>[v.id,v.vt]));
/* Objectifs d'entraînement → {cat?, types?, icm?} appliqués aux filtres */
const TRAIN_OBJECTIVES=[
  {id:"Mes leaks détectés",leak:true},
  {id:"Spots issus de mes HH",hh:true},
  {id:"Open Raise",cat:"RFI"},{id:"Défense BB",cat:"Vs Open"},{id:"3bet",cat:"Vs Open"},
  {id:"Push/Fold",cat:"RFI",stack:"15"},{id:"ICM",cat:"ICM"},{id:"PKO",fmt:"MTT Bounty/PKO"},
  {id:"Table Finale",cat:"ICM"},{id:"Postflop",cat:"Flop"},{id:"Turn/River",cat:"Turn"},
  {id:"Bluff Catch",cat:"River"},{id:"Value Bet",cat:"River"},
];
/* Niveau Coach AI */
const COACH_LEVELS=["Débutant","Intermédiaire","Avancé","Reg","Expert"];
/* Timer (secondes, 0 = aucun) */
const TIMER_OPTS=[0,5,10,15,20,30];
/* Difficulté pro (libellés affichés) → diff numérique */
const DIFF_PRO=[
  {id:"Toutes",dv:0},{id:"Facile",dv:1},{id:"Standard",dv:2},{id:"Avancé",dv:3},{id:"Expert",dv:4},{id:"Pro",dv:5},
];
/* Multitabling autorisé */
const TABLE_COUNTS=[1,2,3,4];
/* Prime de risque ICM par niveau + contribution de phase → ajuste réellement les ranges */
const ICM_RP={"Désactivée":0,"Faible":0.12,"Moyenne":0.28,"Forte":0.48,"Extrême":0.70};
const PHASE_RP={"Bubble":0.22,"ITM":0.10,"Demi-finale":0.12,"Table Finale":0.18,"Top 3":0.22,"Late Game":0.06,"Heads-Up":0.04};
function icmRiskPremium(icm,phase){
  return Math.min(0.85,Math.round(((ICM_RP[icm]||0)+(PHASE_RP[phase]||0))*100)/100);
}
/* Applique la prime de risque ICM à un spot généré : resserre jam/call, bascule fold marginal */
const ICM_AGGRO_IDS=["ALLIN","RAISE","BET75","BET100","BET50"];
function applyICMToSpot(spot,rp,phase){
  if(!spot||rp<=0)return spot;
  const acts=spot.acts||[];
  const foldIdx=acts.findIndex(a=>a.id==="FOLD");
  // 1) resserre les fréquences : transfère une part de l'agression vers fold
  if(spot.freq&&foldIdx>=0){
    const fr={...spot.freq};let moved=0;
    Object.keys(fr).forEach(id=>{if(ICM_AGGRO_IDS.includes(id)){const cut=Math.round(fr[id]*rp*0.6);fr[id]=Math.max(0,fr[id]-cut);moved+=cut;}});
    const fid=acts[foldIdx].id;if(moved>0)fr[fid]=(fr[fid]||0)+moved;
    spot.freq=fr;
  }
  // 2) bascule la réponse correcte vers fold si l'action recommandée est agressive et marginale
  const bestId=acts[spot.ok]?.id;
  const bestEv=Number((spot.ev||{})[bestId]||0);
  if(foldIdx>=0&&ICM_AGGRO_IDS.includes(bestId)&&bestEv<rp*2.6){
    spot.ok=foldIdx;spot.best=acts[foldIdx].l||"Fold";spot._icmFlip=true;
  }
  // 3) annotation pédagogique ICM
  const ph=phase&&phase!=="Toutes"?` (${phase})`:"";
  spot.expl=(spot.expl||"")+` ⚖ ICM${ph} : prime de risque ≈${Math.round(rp*100)}% — resserre les ranges de jam/call, le fold gagne sur les spots marginaux.`;
  if(Array.isArray(spot.detail))spot.detail=[...spot.detail,{i:"⚖",t:`<strong>ICM ${Math.round(rp*100)}%</strong> : ranges resserrées${spot._icmFlip?" — cette main passe en fold sous pression ICM.":"."}`}];
  spot.icmRp=rp;
  return spot;
}

const EVENTS=POKER_EVENTS;


/* ═══════════════════════════════════════
   RANGE GRID — Affichage des ranges GTO
═══════════════════════════════════════ */
const RANKS_GRID=["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
// Génère une range basée sur position + action + profondeur de stack
function buildRange(pos,action,stackBB=100){
  // Valeurs : "r"=raise/bet, "c"=call, "f"=fold, "rc"=mix raise-call, "rf"=mix raise-fold, "cf"=mix call-fold
  const grid={};
  const deep=stackBB>=80,mid=stackBB>=40&&stackBB<80,short=stackBB<40;

  // Pairs
  RANKS_GRID.forEach((r,i)=>{
    const k=r+r;
    if(action==="open"||action==="3bet"){
      grid[k]=i<=4?"r":i<=7?(deep?"r":"rc"):i<=9?"rc":"cf"; // AA-TT raise, 99-77 mix, 66-22 call/fold
    } else if(action==="cbet"||action==="bet"){
      grid[k]=i<=5?"r":i<=8?"rc":"cf";
    } else if(action==="call3bet"||action==="facing3bet"){
      grid[k]=i<=2?"r":i<=5?"rc":i<=8?"c":"f";
    } else {grid[k]=i<=5?"r":i<=9?"c":"f";}
  });

  // Cartes hautes suited/offsuit
  for(let i=0;i<13;i++){
    for(let j=0;j<13;j++){
      if(i===j)continue;
      const r1=RANKS_GRID[i],r2=RANKS_GRID[j];
      const suited=i<j;
      const k=suited?r1+r2+"s":r1+r2+"o";
      const diff=Math.abs(i-j);
      const top=i<=2&&j<=2; // AK,AQ,KQ
      const broadway=i<=4&&j<=4; // broadways
      const connector=diff<=2;
      const gap=diff<=4;

      if(action==="open"){
        const posBonus=["BTN","CO"].includes(pos)?2:["MP","HJ"].includes(pos)?1:0;
        if(suited){
          grid[k]=top?"r":broadway?"r":connector&&i<=5?"r":connector&&gap&&posBonus>0?"r":connector?"rc":i<=6&&j<=6?"rc":"f";
        } else {
          grid[k]=top?"r":broadway&&i<=3&&j<=3?"r":broadway?"rc":connector&&i<=4?"rf":"f";
        }
      } else if(action==="3bet"||action==="facing3bet"){
        if(suited){
          grid[k]=top?"r":i<=1&&j<=3?"r":i<=2&&j<=2?"rc":broadway&&suited?"rc":connector&&i<=4?"cf":"f";
        } else {
          grid[k]=top&&i<=1?"r":i<=1&&j<=1?"rc":"f";
        }
      } else if(action==="cbet"){
        if(suited){
          grid[k]=top?"r":i<=3&&j<=4?"r":broadway?"rc":connector&&i<=5?"rc":"cf";
        } else {
          grid[k]=top?"r":broadway&&i<=3?"rc":"f";
        }
      } else {
        if(suited){
          grid[k]=top?"r":broadway?"rc":connector&&i<=5?"c":"f";
        } else {
          grid[k]=i<=2&&j<=2?"r":i<=3&&j<=3?"rc":"f";
        }
      }
    }
  }
  return grid;
}

/* Equity heuristique par main (heads-up preflop) */
function estimateEquity(k){
  const RV={"A":14,"K":13,"Q":12,"J":11,"T":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2};
  if(k.length===2){const r=RV[k[0]]||7;return 45+Math.round((r-2)/12*40);}
  const r1=RV[k[0]]||7,r2=RV[k[1]]||7,suited=k.endsWith("s");
  const base=38+Math.round(((r1-2)+(r2-2))/24*28);
  return Math.min(67,base+(suited?3:0)+(Math.abs(r1-r2)<=2?2:0));
}
/* Enrichit buildRange avec fréquences, equity, EV, EQR par main */
function buildRangeFreqs(pos,action,stackBB=100){
  const raw=buildRange(pos,action,stackBB);
  const result={};
  for(const[k,v] of Object.entries(raw)){
    const freq=v==="r"?{r:100,c:0,f:0}:v==="c"?{r:0,c:100,f:0}:v==="rc"?{r:55,c:45,f:0}:v==="rf"?{r:65,c:0,f:35}:v==="cf"?{r:0,c:55,f:45}:{r:0,c:0,f:100};
    const eq=estimateEquity(k);
    const evR=(eq-50)/100*0.8+0.05,evC=(eq-48)/100*0.35;
    const ev=parseFloat(((freq.r/100)*evR+(freq.c/100)*evC).toFixed(2));
    result[k]={action:v,freq,eq,ev,eqr:parseFloat((ev/Math.max(0.001,eq/100)).toFixed(2))};
  }
  return result;
}

/* Couleurs par action — GTO Wizard style */
const RANGE_ACTION_COLORS={
  r:    {bg:"rgba(155,92,255,.75)",  label:"Raise/Bet",     col:"#9B5CFF"},
  "3b": {bg:"rgba(255,45,117,.75)",  label:"3-Bet/Shove",   col:"#FF2D75"},
  c:    {bg:"rgba(46,204,113,.7)",   label:"Call/Check",    col:"#2ECC71"},
  b33:  {bg:"rgba(52,152,219,.7)",   label:"Bet 33%",       col:"#3498DB"},
  b50:  {bg:"rgba(241,196,15,.7)",   label:"Bet 50%",       col:"#F1C40F"},
  b75:  {bg:"rgba(230,126,34,.75)",  label:"Bet 75%",       col:"#E67E22"},
  allin:{bg:"rgba(231,76,60,.8)",    label:"All-in",        col:"#E74C3C"},
  rc:   {bg:"linear-gradient(135deg,rgba(155,92,255,.65) 50%,rgba(46,204,113,.65) 50%)",label:"Raise/Call mix",col:"#9B5CFF"},
  rf:   {bg:"linear-gradient(135deg,rgba(155,92,255,.65) 50%,rgba(50,50,80,.7) 50%)",  label:"Raise/Fold mix",col:"#9B5CFF"},
  cf:   {bg:"linear-gradient(135deg,rgba(46,204,113,.65) 50%,rgba(50,50,80,.7) 50%)",  label:"Call/Fold mix", col:"#2ECC71"},
  f:    {bg:"rgba(14,14,30,.85)",    label:"Fold",          col:"#6F81A8"},
};

export function RangeGrid({pos,action,stackBB,label,spot,showToggle=false,numTables=1,onOpenSolver,modal=false}){
  const[viewMode,setViewMode]=useState("hero");
  const[hov,setHov]=useState(null);
  const[sel,setSel]=useState(null);

  const displayPos=viewMode==="villain"?(spot?.vpos||pos):pos;
  const displayAction=viewMode==="villain"?"3bet":(action||"open");
  const rangeData=buildRangeFreqs(displayPos,displayAction,stackBB);
  const cFor=k=>k.length===2?6:k.endsWith("s")?4:12;

  // ── Statistiques globales ──
  let rC=0,cC=0,fC=0,evSum=0,eqSum=0,totalC=0;
  Object.entries(rangeData).forEach(([k,d])=>{
    const n=cFor(k);totalC+=n;
    rC+=n*(d.freq.r/100);cC+=n*(d.freq.c/100);fC+=n*(d.freq.f/100);
    evSum+=d.ev*n;eqSum+=d.eq*n;
  });
  const allC=totalC||1326;
  const rP=Math.round(rC/allC*100);
  const cP=Math.round(cC/allC*100);
  const fP=Math.max(0,100-rP-cP);
  const avgEV=(evSum/Math.max(1,allC)).toFixed(2);
  const avgEQ=Math.round(eqSum/Math.max(1,allC));
  const avgEQR=(evSum/Math.max(0.001,eqSum/100)).toFixed(2);
  const playCombos=Math.round(rC+cC);
  const rangePct=Math.round((rC+cC)/1326*100);

  const vProf=viewMode==="villain"&&spot?.vtype?VILLAIN_PROFILES[spot.vtype]:null;

  // ── Tailles adaptatives (+5% grille vs version précédente) ──
  const modalRange=modal||numTables==="modal"||numTables===0;
  const CP=modalRange?40:numTables>=3?12:numTables===2?15:17; // cellule px
  const FP=modalRange?13:numTables>=3?3.8:numTables===2?4.7:5.8; // font pairs
  const NP=modalRange?10:numTables>=3?0:numTables===2?3.8:4.6;   // font non-pairs
  const LP=modalRange?13:numTables>=3?8:numTables===2?9:10;  // layout font
  const RF=modalRange?11:numTables>=3?5.0:numTables===2?5.5:6.1;  // rank headers
  const showRightPanel=modalRange||numTables<=2;
  const panelWidth=modalRange?260:numTables===1?148:120;

  // ── Background cellule (dégradé vertical selon fréquences) ──
  function cellBg(d){
    if(!d)return"rgba(7,18,38,.88)";
    const f=d.freq;
    if(f.r>=95)return"rgba(255,184,0,.86)";
    if(f.c>=95)return"rgba(32,207,255,.78)";
    if(f.f>=95)return"rgba(42,16,24,.82)";
    const segs=[];let acc=0;
    if(f.r>0){segs.push(`rgba(255,184,0,.86) ${acc}%`);acc+=f.r;segs.push(`rgba(255,184,0,.86) ${acc}%`);}
    if(f.c>0){segs.push(`rgba(32,207,255,.78) ${acc}%`);acc+=f.c;segs.push(`rgba(32,207,255,.78) ${acc}%`);}
    if(f.f>0){segs.push(`rgba(42,16,24,.82) ${acc}%`);acc+=f.f;segs.push(`rgba(42,16,24,.82) ${acc}%`);}
    return segs.length>1?`linear-gradient(to bottom,${segs.join(",")})`:segs[0]||"rgba(42,16,24,.82)";
  }

  // ── Couleur dominante pour action badge ──
  function mainActColor(d){
    if(!d)return{label:"Fold",col:"#E5485D"};
    if(d.freq.r>=d.freq.c&&d.freq.r>=d.freq.f)return{label:"Raise",col:"#FFB800"};
    if(d.freq.c>=d.freq.f)return{label:"Call",col:"#20CFFF"};
    return{label:"Fold",col:"#E5485D"};
  }

  // ── Conseil GTO auto-généré ──
  function gtoTip(){
    const street=spot?.street||"Preflop";
    const mainAct=rP>cP&&rP>fP?"raise":cP>fP?"call":"fold";
    const boardStr=spot?.board?.length>0?` sur ${spot.board.map(c=>c.r+c.s).join("")}`:"";
    if(street==="Preflop"||!spot?.board?.length){
      if(displayAction==="open"||displayAction==="rfi")
        return`Depuis ${displayPos}, la range d'open privilégie le raise à ${rP}% de la range totale. Maintenir un sizing cohérent protège ta range et maximise l'EV long terme.`;
      if(displayAction==="3bet"||displayAction==="4bet")
        return`En re-raise depuis ${displayPos} : équilibre value/bluffs — Raise ${rP}% · Call ${cP}%. Cette polarisation rend la range non-exploitable face aux réguliers.`;
      return`Défense depuis ${displayPos} : Call ${cP}% maintient la fréquence optimale et protège tes nuts contre l'agressivité adverse.`;
    }
    if(mainAct==="raise")
      return`${street}${boardStr} — La continuance est favorable depuis ${displayPos} (Bet/Raise ${rP}%). L'avantage de range et de nuts justifie la pression appliquée.`;
    if(mainAct==="call")
      return`${street}${boardStr} — Call ${cP}% depuis ${displayPos}. La pot control protège contre les semi-bluffs et conserve l'équité face au range villain.`;
    return`${street}${boardStr} — Fold ${fP}% depuis ${displayPos}. Préserver la stack face à cette pression solver est la ligne optimale avec ces fréquences.`;
  }

  const hovD=hov?rangeData[hov]:null;
  const selD=sel?rangeData[sel]:null;
  const panelHand=sel||hov;
  const panelD=selD||hovD;

  const LEGEND=[
    {bg:"rgba(255,184,0,.86)",l:"Raise"},
    {bg:"rgba(32,207,255,.78)",l:"Call"},
    {bg:"linear-gradient(to bottom,rgba(255,184,0,.86) 50%,rgba(32,207,255,.78) 50%)",l:"Mix R/C"},
    {bg:"linear-gradient(to bottom,rgba(255,184,0,.86) 50%,rgba(42,16,24,.82) 50%)",l:"Mix R/F"},
    {bg:"linear-gradient(to bottom,rgba(32,207,255,.78) 50%,rgba(42,16,24,.82) 50%)",l:"Mix C/F"},
    {bg:"rgba(42,16,24,.82)",l:"Fold"},
  ];

  return(
    <div className={modalRange?"range-grid-shell modal":"range-grid-shell"} style={{background:"linear-gradient(145deg,#071B44,#040E25)",borderRadius:modalRange?14:12,padding:modalRange?"16px 18px":"10px 12px",border:"1px solid rgba(26,58,128,.8)",marginTop:6,boxShadow:"0 4px 24px rgba(0,0,0,.5)"}}>

      {/* ═══ HEADER ═══ */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:LP,color:T.gold,fontWeight:800,letterSpacing:".06em"}}>{label||"RANGE GTO"}</span>
          <span style={{padding:"1px 6px",borderRadius:8,background:"rgba(31,139,255,.1)",border:"1px solid rgba(31,139,255,.2)",fontSize:LP-2,color:T.blue,fontFamily:"'Space Grotesk',sans-serif",fontWeight:700}}>{displayPos}</span>
          <span style={{fontSize:LP-3,color:T.text4,fontFamily:"'JetBrains Mono',monospace"}}>{stackBB}bb</span>
        </div>
        {(showToggle||spot)&&(
          <div style={{marginLeft:"auto",display:"flex",gap:1.5,background:"rgba(0,0,0,.4)",padding:"2px 3px",borderRadius:20,border:"1px solid rgba(255,255,255,.05)"}}>
            {[["hero","🎮 Hero",T.gold,"rgba(255,194,71,"],["villain","⚡ Vilain","#c090ff","rgba(155,92,255,"]].map(([m,l,col,rgb])=>(
              <button key={m} onClick={()=>{setViewMode(m);setSel(null);}} style={{
                padding:"2px 9px",borderRadius:18,fontSize:LP-3,fontWeight:700,cursor:"pointer",border:"none",
                fontFamily:"'Inter',sans-serif",transition:"all .18s",
                background:viewMode===m?rgb+".16)":"transparent",
                color:viewMode===m?col:"#4A6090",
                boxShadow:viewMode===m?`0 0 10px ${rgb}.2)`:"none",
              }}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {/* ═══ CORPS : Grille + Panneau droit ═══ */}
      <div style={{display:"flex",gap:modalRange?18:10,alignItems:"flex-start",flexWrap:modalRange?"wrap":"nowrap"}}>

        {/* ──── GRILLE 13×13 ──── */}
        <div style={{flexShrink:0,position:"relative",maxWidth:"100%",overflowX:modalRange?"auto":"visible",paddingBottom:modalRange?4:0}}>
          {/* En-têtes colonnes */}
          <div style={{display:"flex",marginBottom:1.5,paddingLeft:CP+2}}>
            {RANKS_GRID.map(r=>(
              <div key={r} style={{width:CP,textAlign:"center",fontSize:RF-1,color:"rgba(255,255,255,.3)",fontFamily:"'JetBrains Mono',monospace",lineHeight:1,flexShrink:0}}>{r}</div>
            ))}
          </div>
          {/* Lignes */}
          {RANKS_GRID.map((r1,i)=>(
            <div key={r1} style={{display:"flex",alignItems:"center",marginBottom:1}}>
              {/* En-tête ligne */}
              <div style={{width:CP,textAlign:"center",fontSize:RF-1,color:"rgba(255,255,255,.3)",fontFamily:"'JetBrains Mono',monospace",flexShrink:0,lineHeight:1}}>{r1}</div>
              {/* Cellules */}
              {RANKS_GRID.map((r2,j)=>{
                const isPair=i===j;
                const isSuited=i<j;
                const k=isPair?r1+r2:isSuited?r1+r2+"s":r1+r2+"o";
                const d=rangeData[k];
                const isHov=hov===k;
                const isSel=sel===k;
                const labelStr=isPair?(r1+r1):NP>0?(isSuited?r1+r2+"s":r1+r2+"o"):"";
                return(
                  <div key={k}
                    className="range-cell-focus"
                    role="button"
                    tabIndex={0}
                    aria-label={`${k}: raise ${d?.freq?.r||0}%, call ${d?.freq?.c||0}%, fold ${d?.freq?.f||0}%`}
                    onMouseEnter={()=>setHov(k)}
                    onMouseLeave={()=>setHov(null)}
                    onClick={()=>setSel(sel===k?null:k)}
                    onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSel(sel===k?null:k);}}}
                    style={{
                      width:CP,height:CP,flexShrink:0,
                      background:cellBg(d),
                      borderRadius:isSel?2:1,
                      transform:isSel?"scale(1.25)":isHov?"scale(1.15)":"scale(1)",
                      zIndex:isSel?30:isHov?20:1,
                      position:"relative",transition:"transform .07s,box-shadow .07s",
                      boxSizing:"border-box",
                      border:`1px solid ${isSel?"rgba(255,194,71,.7)":isHov?"rgba(255,255,255,.25)":"rgba(255,255,255,.03)"}`,
                      boxShadow:isSel?"0 0 8px rgba(255,194,71,.5)":isHov?"0 0 5px rgba(255,255,255,.1)":"none",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      cursor:"pointer",overflow:"visible",
                    }}>
                    {labelStr&&(
                      <span style={{
                        fontSize:isPair?FP:NP,
                        fontWeight:isPair?900:600,
                        color:isPair?"rgba(255,255,255,.92)":"rgba(255,255,255,.6)",
                        fontFamily:"'JetBrains Mono',monospace",
                        lineHeight:1,
                        pointerEvents:"none",
                        letterSpacing:isPair?"-.03em":"-.04em",
                        userSelect:"none",
                      }}>{labelStr}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* ── Tooltip hover (si pas de panneau droit) ── */}
          {!showRightPanel&&hov&&hovD&&(
            <div style={{position:"absolute",top:0,left:"calc(100% + 8px)",background:"#030D2A",border:"1px solid rgba(155,92,255,.4)",borderRadius:9,padding:"8px 10px",zIndex:200,whiteSpace:"nowrap",minWidth:118,boxShadow:"0 6px 28px rgba(0,0,0,.9)",pointerEvents:"none",animation:"vilActIn .15s forwards"}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:12,fontWeight:800,color:"#fff",marginBottom:4,letterSpacing:".04em"}}>{hov}</div>
              <div style={{height:5,borderRadius:2.5,overflow:"hidden",display:"flex",marginBottom:5,background:"rgba(255,255,255,.07)"}}>
                {hovD.freq.r>0&&<div style={{flex:hovD.freq.r,background:"rgba(255,184,0,.88)"}}/>}
                {hovD.freq.c>0&&<div style={{flex:hovD.freq.c,background:"rgba(32,207,255,.82)"}}/>}
                {hovD.freq.f>0&&<div style={{flex:hovD.freq.f,background:"rgba(42,16,24,.82)"}}/>}
              </div>
              {[{l:"Raise",v:hovD.freq.r+"%",c:"#FFB800"},{l:"Call",v:hovD.freq.c+"%",c:"#20CFFF"},{l:"Fold",v:hovD.freq.f+"%",c:"#E5485D"}].filter(x=>parseFloat(x.v)>0).map(({l,v,c})=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",gap:14,marginBottom:2}}>
                  <span style={{fontSize:7.5,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{l}</span>
                  <span style={{fontSize:8,color:c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v}</span>
                </div>
              ))}
              <div style={{height:1,background:"rgba(255,255,255,.07)",margin:"4px 0"}}/>
              {[{l:"EV",v:(hovD.ev>=0?"+":"")+hovD.ev+"bb",c:hovD.ev>=0?T.green:T.red},{l:"Equity",v:hovD.eq+"%",c:T.blue},{l:"Combos",v:cFor(hov),c:T.text2}].map(({l,v,c})=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",gap:14,marginBottom:2}}>
                  <span style={{fontSize:7.5,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{l}</span>
                  <span style={{fontSize:8,color:c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ──── PANNEAU DROIT (1T et 2T) ──── */}
        {showRightPanel&&(
          <div style={{width:panelWidth,flex:modalRange?"1 1 260px":"0 0 auto",minWidth:modalRange?240:panelWidth,display:"flex",flexDirection:"column",gap:modalRange?9:5}}>

            {/* Analyse main sélectionnée / survolée */}
            {panelD&&panelHand?(
              <div style={{background:"rgba(0,0,0,.35)",borderRadius:9,border:`1px solid ${sel?"rgba(255,194,71,.35)":"rgba(255,255,255,.07)"}`,padding:"7px 9px",animation:"vilActIn .2s forwards"}}>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:LP+3,fontWeight:900,color:"#fff",letterSpacing:".02em"}}>{panelHand}</span>
                  <span style={{fontSize:7.5,padding:"1.5px 6px",borderRadius:10,background:mainActColor(panelD).col+"22",color:mainActColor(panelD).col,fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,border:`1px solid ${mainActColor(panelD).col}44`}}>{mainActColor(panelD).label}</span>
                </div>
                {/* Fréquences avec barres */}
                {[{l:"Raise",v:panelD.freq.r,c:"rgba(255,184,0,.92)"},{l:"Call",v:panelD.freq.c,c:"rgba(32,207,255,.9)"},{l:"Fold",v:panelD.freq.f,c:"rgba(229,72,93,.82)"}].filter(x=>x.v>0).map(({l,v,c})=>(
                  <div key={l} style={{marginBottom:3}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:1.5}}>
                      <span style={{fontSize:9.5,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{l}</span>
                      <span style={{fontSize:10.5,color:c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v}%</span>
                    </div>
                    <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,.07)",overflow:"hidden"}}>
                      <div style={{height:"100%",width:v+"%",background:c,transition:"width .3s"}}/>
                    </div>
                  </div>
                ))}
                <div style={{height:1,background:"rgba(255,255,255,.07)",margin:"5px 0"}}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2px 6px"}}>
                  {[{l:"EV",v:(panelD.ev>=0?"+":"")+panelD.ev+"bb",c:panelD.ev>=0?T.green:T.red},{l:"Equity",v:panelD.eq+"%",c:T.blue},{l:"EQR",v:panelD.eqr.toFixed(2),c:"#FFC247"},{l:"Combos",v:cFor(panelHand),c:T.text2}].map(({l,v,c})=>(
                    <div key={l} style={{display:"flex",flexDirection:"column",padding:"3px 5px",background:"rgba(255,255,255,.03)",borderRadius:4}}>
                      <span style={{fontSize:8.5,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{l}</span>
                      <span style={{fontSize:12,color:c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v}</span>
                    </div>
                  ))}
                </div>
                {sel&&<div style={{marginTop:5,fontSize:7.5,color:T.text4,fontFamily:"'Inter',sans-serif",fontStyle:"italic",textAlign:"center"}}>Clique à nouveau pour désélectionner</div>}
              </div>
            ):(
              /* Placeholder si rien sélectionné/survolé */
              <div style={{background:"rgba(0,0,0,.2)",borderRadius:9,border:"1px dashed rgba(255,255,255,.06)",padding:"10px 9px",textAlign:"center"}}>
                <div style={{fontSize:16,marginBottom:4}}>👆</div>
                <div style={{fontSize:7.5,color:T.text4,fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>Survole ou clique une main pour analyser</div>
              </div>
            )}

            {/* Résumé de range */}
            <div style={{background:"rgba(0,0,0,.25)",borderRadius:9,border:"1px solid rgba(26,58,128,.6)",padding:"7px 9px"}}>
              <div style={{fontSize:9,color:T.text4,letterSpacing:".1em",textTransform:"uppercase",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,marginBottom:5}}>Résumé de range</div>
              {/* Barre composite R/C/F */}
              <div style={{height:6,borderRadius:3,overflow:"hidden",display:"flex",marginBottom:5,gap:0}}>
                {rP>0&&<div style={{flex:rP,background:"rgba(255,184,0,.88)"}}/>}
                {cP>0&&<div style={{flex:cP,background:"rgba(32,207,255,.78)"}}/>}
                {fP>0&&<div style={{flex:fP,background:"rgba(42,16,24,.82)"}}/>}
              </div>
              {[{l:"Raise",v:rP,vs:rP+"%",c:"#FFB800"},{l:"Call",v:cP,vs:cP+"%",c:"#20CFFF"},{l:"Fold",v:fP,vs:fP+"%",c:"#E5485D"}].map(({l,v,vs,c})=>(
                <div key={l} style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                  <span style={{fontSize:8.5,color:T.text4,fontFamily:"'Inter',sans-serif",width:34,flexShrink:0}}>{l}</span>
                  <div style={{flex:1,height:3,borderRadius:1.5,background:"rgba(255,255,255,.06)",overflow:"hidden"}}>
                    <div style={{height:"100%",width:v+"%",background:c,opacity:.75,transition:"width .3s"}}/>
                  </div>
                  <span style={{fontSize:10,color:c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,width:30,textAlign:"right",flexShrink:0}}>{vs}</span>
                </div>
              ))}
              <div style={{height:1,background:"rgba(255,255,255,.06)",margin:"4px 0"}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 4px"}}>
                {[{l:"Combos",v:playCombos,c:T.text},{l:"Range %",v:rangePct+"%",c:T.text},{l:"Avg EV",v:(parseFloat(avgEV)>=0?"+":"")+avgEV+"bb",c:parseFloat(avgEV)>=0?T.green:T.red},{l:"Equity",v:avgEQ+"%",c:T.blue},{l:"EQR",v:avgEQR,c:"#FFC247"}].map(({l,v,c})=>(
                  <div key={l} style={{display:"flex",flexDirection:"column",padding:"3px 5px",background:"rgba(255,255,255,.025)",borderRadius:4}}>
                    <span style={{fontSize:8,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{l}</span>
                    <span style={{fontSize:11,color:c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Profil villain */}
            {vProf&&(
              <div style={{background:"rgba(155,92,255,.06)",borderRadius:8,border:"1px solid rgba(155,92,255,.2)",padding:"6px 9px"}}>
                <div style={{fontSize:7.5,color:vProf.col,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif",marginBottom:4,display:"flex",alignItems:"center",gap:4}}>
                  ⚡ {spot.vtype}
                  <span style={{fontSize:6.5,color:T.text4,fontWeight:400}}>profil villain</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2px 4px"}}>
                  {[{l:"VPIP",v:vProf.vpip+"%"},{l:"PFR",v:vProf.pfr+"%"},{l:"3bet",v:vProf["3bet"]+"%"},{l:"Agg",v:vProf.agg.toFixed(1)}].map(({l,v})=>(
                    <div key={l} style={{display:"flex",flexDirection:"column",padding:"2px 4px",background:"rgba(255,255,255,.03)",borderRadius:3}}>
                      <span style={{fontSize:8,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{l}</span>
                      <span style={{fontSize:10.5,color:vProf.col,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats compactes pour 3T/4T */}
        {!showRightPanel&&(
          <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:2}}>
            <div style={{height:4,borderRadius:2,overflow:"hidden",display:"flex",marginBottom:2}}>
              {rP>0&&<div style={{flex:rP,background:"rgba(255,184,0,.86)"}}/>}
              {cP>0&&<div style={{flex:cP,background:"rgba(32,207,255,.78)"}}/>}
              {fP>0&&<div style={{flex:fP,background:"rgba(42,16,24,.82)"}}/>}
            </div>
            {[{l:"Raise",v:rP+"%",c:"#FFB800"},{l:"Call",v:cP+"%",c:"#20CFFF"},{l:"Fold",v:fP+"%",c:"#E5485D"},null,{l:"Combos",v:playCombos,c:T.text2},{l:"EV",v:(parseFloat(avgEV)>=0?"+":"")+avgEV,c:T.gold},{l:"Equity",v:avgEQ+"%",c:T.blue},{l:"EQR",v:avgEQR,c:"#FFC247"}].map((s,idx)=>
              s===null?<div key={idx} style={{height:1,background:"rgba(255,255,255,.05)",margin:"1px 0"}}/>:
              <div key={s.l} style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:8,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{s.l}</span>
                <span style={{fontSize:8.5,color:s.c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{s.v}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ SECTION BASSE ═══ */}
      <div style={{marginTop:8}}>

        {/* Légende couleurs */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:7,paddingTop:4,borderTop:"1px solid rgba(255,255,255,.05)"}}>
          {LEGEND.map(({bg,l})=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:3}}>
              <div style={{width:9,height:9,borderRadius:2,background:bg,border:"1px solid rgba(255,255,255,.12)",flexShrink:0}}/>
              <span style={{fontSize:7,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{l}</span>
            </div>
          ))}
        </div>

        {/* Conseil GTO */}
        <div style={{background:"linear-gradient(135deg,rgba(255,194,71,.05),rgba(255,194,71,.02))",borderRadius:8,border:"1px solid rgba(255,194,71,.15)",padding:"7px 10px",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
            <span style={{fontSize:8.5,color:T.gold,letterSpacing:".06em",fontFamily:"'Space Grotesk',sans-serif",fontWeight:800}}>💡 CONSEIL GTO</span>
            <span style={{fontSize:7,color:T.text4,fontFamily:"'Inter',sans-serif"}}>· {displayPos} · {displayAction.toUpperCase()}</span>
          </div>
          <div style={{fontSize:9.5,color:T.text2,fontFamily:"'Inter',sans-serif",lineHeight:1.7}}>{gtoTip()}</div>
        </div>

        {/* Bouton Solver */}
        {spot&&(
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"rgba(52,216,255,.04)",border:"1px solid rgba(52,216,255,.15)",borderRadius:8,cursor:"pointer"}}
            onClick={()=>onOpenSolver&&onOpenSolver({heroPos:spot.hpos,vsPos:spot.vpos,action:displayAction,stack:stackBB,street:spot.street||"Preflop"})}>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:"#34D8FF",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,marginBottom:1}}>🦈 Ouvrir dans le Solver</div>
              <div style={{fontSize:8,color:T.text4,fontFamily:"'Inter',sans-serif"}}>{displayPos} vs {spot.vpos||"BB"} · {stackBB}bb · {spot.street||"Preflop"}</div>
            </div>
            <span style={{fontSize:14,color:"rgba(52,216,255,.5)"}}>→</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   RANGE POPUP — Modal avec range Hero/Villain
═══════════════════════════════════════ */
export function RangePopup({heroPos,vilPos,heroAction,stackBB,onClose}){
  const[activeTab,setActiveTab]=useState("hero");
  const closeBtnRef=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    const onKey=(e)=>{if(e.key==="Escape")onClose?.();};
    window.addEventListener("keydown",onKey);
    closeBtnRef.current?.focus?.();
    return()=>{
      window.removeEventListener("keydown",onKey);
      previous?.focus?.();
    };
  },[onClose]);
  // Tabs disponibles
  const tabs=[
    {id:"hero",l:`Hero (${heroPos})`,action:heroAction||"open"},
    {id:"vil3",l:`Villain 3bet (${vilPos})`,action:"3bet"},
    {id:"vilcall",l:`Villain Call (${vilPos})`,action:"call"},
  ];
  const cur=tabs.find(t=>t.id===activeTab)||tabs[0];
  const displayPos=activeTab==="hero"?heroPos:vilPos;
  return(
    <div className="rpop-overlay" onClick={onClose}>
      <div className="rpop" role="dialog" aria-modal="true" aria-label="Ranges GTO" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{fontFamily:T.brand,fontSize:9,color:T.gold,letterSpacing:".1em",fontWeight:900}}>RANGES GTO</div>
            <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginTop:1}}>{heroPos} vs {vilPos} · {stackBB}bb · {heroAction||"Open"}</div>
          </div>
          <button ref={closeBtnRef} aria-label="Fermer les ranges GTO" onClick={onClose} style={{background:"rgba(255,255,255,.05)",border:"1px solid #1A3A80",color:T.text2,cursor:"pointer",fontSize:16,borderRadius:8,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {/* Tabs */}
        <div className="rpop-tabs">
          {tabs.map(t=><button key={t.id} type="button" className={`rpop-tab${activeTab===t.id?" on":""}`} onClick={()=>setActiveTab(t.id)}>{t.l}</button>)}
        </div>
        {/* Legend couleurs */}
        <div style={{display:"flex",gap:10,marginBottom:8,flexWrap:"wrap"}}>
          {[
            {cls:"rg-raise",l:"Raise / 3bet",col:T.green},
            {cls:"rg-call",l:"Call / Flat",col:T.blue},
            {cls:"rg-mix-rc",l:"Mixé Raise/Call",col:"#80e8a0"},
            {cls:"rg-mix-rf",l:"Mixé Raise/Fold",col:"#a0d060"},
            {cls:"rg-fold",l:"Fold",col:T.text4},
          ].map(x=>(
            <div key={x.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:8.5,color:T.text3,fontFamily:T.stats}}>
              <div className={x.cls} style={{width:10,height:10,borderRadius:2}}/>
              {x.l}
            </div>
          ))}
        </div>
        {/* Range grid */}
        <RangeGrid pos={displayPos} action={cur.action} stackBB={stackBB||100} label={`${displayPos} — ${cur.action==="open"?"Open RFI":cur.action==="3bet"?"3bet range":cur.action==="call"?"Call range":"Range"} · ${stackBB||100}bb`} numTables="modal" modal/>
        {/* Note pédagogique */}
        <div style={{marginTop:10,padding:"8px 10px",background:T.surface,borderRadius:8,border:`1px solid ${T.border}`,fontSize:9,color:T.text3,fontFamily:T.stats,lineHeight:1.6}}>
          {activeTab==="hero"&&"📌 Range offensive de Hero. En vert = raise/bet optimal, en bleu = call/flat, dégradé = fréquences mixées selon l'équilibre GTO."}
          {activeTab==="vil3"&&"📌 Mains avec lesquelles le Villain 3bet face à votre open. Identifiez les mains value (AA-QQ, AK) et les bluffs (A5s, KQs, suited connectors)."}
          {activeTab==="vilcall"&&"📌 Range de flat call du Villain. Ces mains arrivent souvent sur les flops A-haut, boards coordonnés. Attendez-vous à des c/r sur les bonnes textures."}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   DONNÉES BIBLIOTHÈQUE GTO
═══════════════════════════════════════ */
const LIB_SUBS={
  "Preflop":["Open RFI","3-bet","4-bet","BB Defense"],
  "Postflop":["C-bet IP","C-bet OOP","Check-Raise","Turn Play","River Play"],
};

/* ── Correspondance unique filtre/spot (source de vérité) ── */
function spotMatchFilter(s,f){
  if(s.hpos===s.vpos)return false; // même siège impossible
  if(f.cat!=="Tous"&&s.cat!==f.cat)return false;
  if(f.fmt!=="Tous"&&s.fmt!==f.fmt)return false;
  if(f.vt!=="Tous"&&s.vtype!==f.vt)return false;
  if(f.hp!=="Tous"&&s.hpos!==f.hp)return false;
  if(f.vp!=="Tous"&&s.vpos!==f.vp)return false;
  if(f.diff&&f.diff!=="Tous"){const dv=DIFF_MAP[f.diff]||0;if((s.diff||2)!==dv)return false;}
  // ── Réglages pro : types de spot (multi) + positions du format de table ──
  if(f.spotTypes&&f.spotTypes.length){
    const cats=new Set(f.spotTypes.map(t=>SPOT_TYPE_CAT[t]||t));
    if(!cats.has(s.cat))return false;
  }
  // Format de table : héros ET vilain doivent tenir dans les N positions (sinon un
  // siège vilain hors-table casserait le rendu hero-centric).
  if(f.nplayers&&POSITIONS_BY_SIZE[f.nplayers]){
    const pos=POSITIONS_BY_SIZE[f.nplayers];
    if(!pos.includes(s.hpos))return false;
    if(s.vpos&&s.vpos!=="Tous"&&!pos.includes(s.vpos))return false;
  }
  if(f.diffLvl){if((s.diff||2)>f.diffLvl)return false;} // niveau pro : accepte la difficulté ≤ sélection
  return true;
}
/* ════════════════════════════════════════════════════════
   GÉNÉRATEUR DE SPOTS DYNAMIQUES — PokerForge v7
   Génère des spots aléatoires pour tous les streets/scénarios
   Compatible avec la structure SPOTS[] existante
════════════════════════════════════════════════════════ */
function generateDynamicSpots(count=50,f={}){
  let _id=9000+Math.floor(Math.random()*1000);
  const R=["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
  const S=["♠","♥","♦","♣"];
  const rnd=a=>a[0|Math.random()*a.length];
  const rndI=(lo,hi)=>lo+(0|Math.random()*(hi-lo+1));
  const mkDeck=()=>R.flatMap(r=>S.map(s=>({r,s})));
  const shuf=d=>{const a=[...d];for(let i=a.length-1;i>0;i--){const j=0|Math.random()*(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
  /* crude hand strength 0-5 */
  const hStr=h=>{
    const[c1,c2]=h,ri1=R.indexOf(c1.r),ri2=R.indexOf(c2.r);
    const paired=c1.r===c2.r,suited=c1.s===c2.s;
    const hi=Math.min(ri1,ri2),lo=Math.max(ri1,ri2),gap=lo-hi;
    if(paired&&hi<=1)return 5;if(paired&&hi<=3)return 4;
    if(hi===0&&lo===1)return 5;
    if(paired||(hi<=2&&lo<=4))return suited?4:3;
    if(hi<=2&&suited)return 3;if(hi<=2)return 2;
    if(gap<=2&&suited&&lo<=7)return 3;if(gap<=1&&suited)return 2;
    if(hi>=6)return 0;return 1;
  };
  /* board texture */
  const bTex=b=>{
    if(!b.length)return"dry";
    const su=b.map(c=>c.s),fd=su.filter((s,i)=>su.indexOf(s)!==i).length>=2;
    const paired=new Set(b.map(c=>c.r)).size<b.length;
    const ri=b.map(c=>R.indexOf(c.r)).sort((a,v)=>a-v);
    const conn=ri.length>=2&&ri[ri.length-1]-ri[0]<=4;
    return fd&&conn?"wet":fd||conn?"semi-wet":paired?"paired":"dry";
  };
  const FMT=["Cash 6-max","Cash 9-max","MTT ChipEV","MTT ICM","MTT Bounty/PKO"];
  const VT=["TAG","LAG","Reg","Fish","Nit","Aggro Reg","Calling Station"];
  /* ── GÉNÉRATEURS par scénario ── */
  const GEN=[
    /* 0 — Open Raise (RFI) */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()];
      const hpos=rnd(["BTN","CO","HJ","UTG","SB"]);
      const vpos=hpos==="SB"?"BB":rnd(["BB","SB"]);
      const stack=rndI(50,200)+"bb",fmt=rnd(FMT),vtype=rnd(VT);
      const v=hStr(hand),sz=hpos==="SB"?"3bb":"2.5bb";
      const rangePct=hpos==="UTG"?15:hpos==="HJ"?20:hpos==="CO"?28:hpos==="BTN"?65:50;
      const ok=v>=2?1:0;
      return{id:`dyn_${_id++}`,cat:"RFI",street:"Preflop",fmt,hpos,vpos,vtype,stack,
        hand,board:[],pot:1.5,toCall:0,
        desc:`${hpos} - ${hand[0].r}${hand[0].s}${hand[1].r}${hand[1].s} - Open ou fold ?`,
        acts:[{id:"FOLD",l:"Fold",s:"0bb"},{id:"BET33",l:`Open ${sz}`,s:"Standard"},{id:"BET75",l:"Open 3bb",s:"Large"}],
        ok,best:ok===0?"Fold":`Open ${sz}`,
        freq:ok===0?{FOLD:80,BET33:15,BET75:5}:{FOLD:5,BET33:75,BET75:20},
        ev:ok===0?{FOLD:0,BET33:-.2,BET75:-.3}:{FOLD:0,BET33:+(0.4+v*.08).toFixed(2),BET75:+(0.35+v*.06).toFixed(2)},
        expl:ok===0?`Main hors range ${hpos} (top ${rangePct}%). Fold.`:`Open ${sz} ${hpos} : main dans le top ${rangePct}%. Sizing standard.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Fold":`Open ${sz}`} ${hpos}</strong>.`},{i:"📊",t:`<strong>Range ${hpos}</strong> : top ${rangePct}%.`},{i:"💰",t:`<strong>EV ${ok===0?"~0":"+"+(0.4+v*.08).toFixed(2)+"bb"}</strong>.`}],
        leaks:ok===0?["Open hors range = perd EV long terme"]:["Fold main ouvrable = trop tight"],diff:v>=4?1:2};
    },
    /* 1 — Blind Defense (BB vs open) */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()];
      const vpos=rnd(["BTN","CO","HJ","UTG"]);
      const hpos="BB",toCall=vpos==="BTN"?1.5:2;
      const pot=toCall+3.5,stack=rndI(50,150)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(VT);
      const v=hStr(hand),ok=v>=4?2:v>=1?1:0;
      const xrSz=Math.round(pot*.8)+2;
      return{id:`dyn_${_id++}`,cat:"Vs Open",street:"Preflop",fmt,hpos,vpos,vtype,stack,
        hand,board:[],pot:Math.round(pot),toCall,
        desc:`BB vs ${vpos} open - ${hand[0].r}${hand[0].s}${hand[1].r}${hand[1].s}`,
        acts:[{id:"FOLD",l:"Fold",s:"0bb"},{id:"CALL",l:"Call",s:`${toCall}bb`},{id:"RAISE",l:`3-bet ${xrSz}bb`,s:"Agressif"}],
        ok,best:ok===0?"Fold":ok===1?"Call":`3-bet ${xrSz}bb`,
        freq:ok===0?{FOLD:85,CALL:10,RAISE:5}:ok===1?{FOLD:20,CALL:65,RAISE:15}:{FOLD:5,CALL:20,RAISE:75},
        ev:{FOLD:0,CALL:ok>=1?.35:-.2,RAISE:ok>=2?.8:-.1},
        expl:ok===0?`Fold BB : main hors range défensif vs ${vpos}.`:ok===1?`Défense BB call. Pot odds corrects, pas assez forte pour 3-bet.`:`3-bet valeur BB. Main premium : maximise EV contre ${vpos} range.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Fold":ok===1?"Call":"3-bet"}</strong> BB.`},{i:"📊",t:`<strong>BB défend ~${vpos==="BTN"?45:40}%</strong> contre open ${vpos}.`}],
        leaks:ok===0?["Fold BB trop souvent = exploitable"]:["Call sans equity = -EV"],diff:2};
    },
    /* 2 — Vs 3-bet */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()];
      const hpos=rnd(["BTN","CO","HJ"]),vpos=rnd(["BB","SB"]);
      const open=2.5,bet3=open*3,toCall=Math.round(bet3-open);
      const pot=Math.round(bet3+open+1.5),stack=rndI(80,150)+"bb";
      const fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(["TAG","Reg","Aggro Reg"]);
      const v=hStr(hand),ok=v>=5?2:v>=3?1:0;
      return{id:`dyn_${_id++}`,cat:"Vs 3-bet",street:"Preflop",fmt,hpos,vpos,vtype,stack,
        hand,board:[],pot,toCall,
        desc:`${hpos} vs 3-bet ${vpos} - ${hand[0].r}${hand[0].s}${hand[1].r}${hand[1].s}`,
        acts:[{id:"FOLD",l:"Fold",s:ok===0?"GTO":"Tight"},{id:"CALL",l:"Call",s:`${toCall}bb`},{id:"RAISE",l:"4-bet 22bb",s:"Optimal"},{id:"ALLIN",l:"4-bet Shove",s:"100bb"}],
        ok:Math.min(ok,2),best:ok===0?"Fold":ok===1?"Call":"4-bet 22bb",
        freq:ok===0?{FOLD:75,CALL:15,RAISE:8,ALLIN:2}:ok===1?{FOLD:25,CALL:55,RAISE:15,ALLIN:5}:{FOLD:0,CALL:25,RAISE:65,ALLIN:10},
        ev:{FOLD:0,CALL:ok>=1?1.2:-.3,RAISE:ok>=2?2.2:.5,ALLIN:ok>=2?1.8:.2},
        expl:ok===0?`Fold face 3-bet : main hors range continuer vs ${vpos}.`:ok===1?`Call : main borderline, bonne equity implicite.`:`4-bet 22bb : main premium contre range 3-bet ${vpos}.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Fold":ok===1?"Call":"4-bet 22bb"}</strong>.`},{i:"📊",t:`<strong>Range 3-bet ${vpos} ${vtype}</strong> : ~${vtype==="Aggro Reg"?"12":"8"}%.`}],
        leaks:ok===0?["4-bet trop large = exploitable"]:["Fold main premium face 3-bet = erreur"],diff:2};
    },
    /* 3 — C-bet IP Flop */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()],board=[d.pop(),d.pop(),d.pop()];
      const hpos=rnd(["BTN","CO","HJ"]),vpos="BB";
      const pot=rndI(5,14),stack=rndI(60,150)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(VT);
      const v=hStr(hand),tex=bTex(board);
      const ok=v>=3||tex==="dry"?1:tex==="wet"&&v<=1?0:Math.random()>.4?1:0;
      const b33=Math.round(pot*.33),b75=Math.round(pot*.75);
      return{id:`dyn_${_id++}`,cat:"Flop",street:"Flop",fmt,hpos,vpos,vtype,stack,
        hand,board,pot,toCall:0,
        desc:`Flop ${board.map(c=>c.r+c.s).join("")} (${tex}) - BB check`,
        acts:[{id:"CHECK",l:"Check",s:"0bb"},{id:"BET33",l:"Cbet 33%",s:`${b33}bb`},{id:"BET75",l:"Cbet 75%",s:`${b75}bb`},{id:"BET100",l:"Cbet pot",s:`${pot}bb`}],
        ok,best:ok===0?"Check":"Cbet 33%",
        freq:ok===0?{CHECK:65,BET33:25,BET75:8,BET100:2}:{CHECK:10,BET33:60,BET75:25,BET100:5},
        ev:{CHECK:ok===0?.8:.4,BET33:ok===1?1.2:.55,BET75:ok===1?.95:.4,BET100:ok===1?.7:.25},
        expl:ok===0?`Check : board ${tex}, range advantage insuffisant. Pot control.`:`Cbet 33% : board ${tex==="dry"?"sec = c-bet range large":"favorable"}, avantage IP.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Check":"Cbet 33%"}</strong> : board ${tex}.`},{i:"📊",t:`<strong>IP sur board ${tex}</strong> : ${tex==="dry"?"c-bet 80% range":"c-bet sélectif 40-50%"}.`},{i:"💰",t:`<strong>EV +${ok===0?.8:1.2}bb</strong>.`}],
        leaks:ok===0?["Cbet 100% = exploitable board wet"]:["Check tout = laisse EV"],diff:tex==="wet"?3:2};
    },
    /* 4 — Check-Raise Flop */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()],board=[d.pop(),d.pop(),d.pop()];
      const hpos="BB",vpos=rnd(["BTN","CO"]);
      const pot=rndI(8,18),bet=Math.round(pot*.33);
      const stack=rndI(60,120)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(["TAG","Reg","LAG"]);
      const v=hStr(hand),ok=v>=4?2:v>=2?1:0;
      const xrAmt=Math.round(bet*2.8);
      return{id:`dyn_${_id++}`,cat:"Flop",street:"Flop",fmt,hpos,vpos,vtype,stack,
        hand,board,pot:pot+bet,toCall:bet,
        desc:`Flop ${board.map(c=>c.r+c.s).join("")} - ${vpos} bet 33% - Action ?`,
        acts:[{id:"FOLD",l:"Fold",s:"0bb"},{id:"CALL",l:"Call",s:`${bet}bb`},{id:"RAISE",l:`X/R ${xrAmt}bb`,s:"Agressif"}],
        ok,best:ok===0?"Fold":ok===1?"Call":`Check-Raise ${xrAmt}bb`,
        freq:ok===0?{FOLD:75,CALL:15,RAISE:10}:ok===1?{FOLD:20,CALL:65,RAISE:15}:{FOLD:5,CALL:20,RAISE:75},
        ev:{FOLD:0,CALL:ok>=1?.4:-.5,RAISE:ok>=2?1.8:-.4},
        expl:ok===0?`Fold : main sans equity, pot odds insuffisants.`:ok===1?`Call : pot odds corrects. Main borderline.`:`Check-Raise : main forte / draw puissante. Extraire valeur.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Fold":ok===1?"Call":"X/R "+xrAmt+"bb"}</strong>.`},{i:"📊",t:`<strong>Pot odds call</strong> : ${Math.round(bet/(pot+bet+bet)*100)}% equity requise.`}],
        leaks:ok===0?["Call sans equity = -EV"]:["X/R sans main/draw = bluff raté"],diff:3};
    },
    /* 5 — Double Barrel Turn */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()],board=[d.pop(),d.pop(),d.pop(),d.pop()];
      const hpos=rnd(["BTN","CO"]),vpos="BB";
      const pot=rndI(12,25),stack=rndI(50,100)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(VT);
      const v=hStr(hand),ok=v>=3?1:v>=1?Math.random()>.5?1:0:0;
      const b66=Math.round(pot*.66);
      return{id:`dyn_${_id++}`,cat:"Turn",street:"Turn",fmt,hpos,vpos,vtype,stack,
        hand,board,pot,toCall:0,
        desc:`Turn ${board.map(c=>c.r+c.s).join("")} - BB check - Double barrel ?`,
        acts:[{id:"CHECK",l:"Check",s:"0bb"},{id:"BET50",l:"Barrel 50%",s:`${Math.round(pot*.5)}bb`},{id:"BET75",l:"Barrel 66%",s:`${b66}bb`},{id:"ALLIN",l:"Shove",s:"All-in"}],
        ok,best:ok===0?"Check":"Barrel 66%",
        freq:ok===0?{CHECK:60,BET50:25,BET75:12,ALLIN:3}:{CHECK:15,BET50:30,BET75:45,ALLIN:10},
        ev:{CHECK:ok===0?.7:.3,BET50:ok>=1?.9:.4,BET75:ok>=1?1.1:.3,ALLIN:ok>=1?.8:.1},
        expl:ok===0?`Check turn : main faible, pas de barrel sans equity.`:`Double barrel 66% : avantage de range IP, turn ${board[3].r+board[3].s} favorable.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Check":"Barrel 66%"}</strong> turn.`},{i:"📊",t:`<strong>Turn ${board[3].r+board[3].s}</strong> : ${["A","K","Q","J","T"].includes(board[3].r)?"blanker IP range":"carte neutre"}.`}],
        leaks:ok===0?["Double barrel sans equity = bluff raté"]:["Check turn = perd fold equity"],diff:3};
    },
    /* 6 — Value Bet River */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()],board=[d.pop(),d.pop(),d.pop(),d.pop(),d.pop()];
      const hpos=rnd(["BTN","CO"]),vpos="BB";
      const pot=rndI(20,50),stack=rndI(40,80)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(VT);
      const v=hStr(hand),ok=v>=4?2:v>=2?1:0;
      const b66=Math.round(pot*.66),b120=Math.round(pot*1.2);
      return{id:`dyn_${_id++}`,cat:"River",street:"River",fmt,hpos,vpos,vtype,stack,
        hand,board,pot,toCall:0,
        desc:`River ${board.map(c=>c.r+c.s).join("")} - BB check`,
        acts:[{id:"CHECK",l:"Check",s:"0bb"},{id:"BET33",l:"Bet 50%",s:`${Math.round(pot*.5)}bb`},{id:"BET75",l:"Bet 66%",s:`${b66}bb`},{id:"BET100",l:"Overbet",s:`${b120}bb`}],
        ok,best:ok===0?"Check":ok===1?"Bet 50%":"Bet 66%",
        freq:ok===0?{CHECK:75,BET33:15,BET75:7,BET100:3}:ok===1?{CHECK:30,BET33:50,BET75:15,BET100:5}:{CHECK:10,BET33:20,BET75:55,BET100:15},
        ev:{CHECK:ok===0?.5:.1,BET33:ok>=1?.8:.2,BET75:ok>=2?1.2:.3,BET100:ok>=2?.9:.15},
        expl:ok===0?`Check river : showdown gratuit. Main moyenne.`:ok===1?`Bet 50% : value thin. Villain call range > vos mains.`:`Bet 66% : grosse valeur. Extraire max.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Check":ok===1?"Bet 50%":"Bet 66%"}</strong> river.`},{i:"📊",t:`<strong>River ${board[4].r+board[4].s}</strong> : ${["A","K"].includes(board[4].r)?"board lockdown":"carte neutre"}.`},{i:"💰",t:`<strong>EV +${ok===0?.5:ok===1?.8:1.2}bb</strong>.`}],
        leaks:ok===0?["Missed value bet river = perd EV"]:["Overbet sans nuts = trop agressif"],diff:3};
    },
    /* 7 — Bluff Catch River */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()],board=[d.pop(),d.pop(),d.pop(),d.pop(),d.pop()];
      const hpos=rnd(["BB","SB"]),vpos=rnd(["BTN","CO"]);
      const pot=rndI(20,45),bet=Math.round(pot*.66);
      const stack=rndI(40,80)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(VT);
      const v=hStr(hand),ok=v>=3?1:0;
      return{id:`dyn_${_id++}`,cat:"River",street:"River",fmt,hpos,vpos,vtype,stack,
        hand,board,pot:pot+bet,toCall:bet,
        desc:`River ${board.map(c=>c.r+c.s).join("")} - ${vpos} bet 66%`,
        acts:[{id:"FOLD",l:"Fold",s:"GTO"},{id:"CALL",l:"Call",s:`${bet}bb`},{id:"RAISE",l:"Raise All-in",s:"Bluff"}],
        ok,best:ok===0?"Fold":"Call",
        freq:ok===0?{FOLD:70,CALL:25,RAISE:5}:{FOLD:35,CALL:55,RAISE:10},
        ev:{FOLD:0,CALL:ok===1?.2:-.8,RAISE:ok===1?-.3:-1.4},
        expl:ok===0?`Fold river : pot odds insuffisants, range villain polarisée.`:`Call : pot odds corrects. ${vtype} bluff freq ~${["LAG","Aggro Reg","Maniac"].includes(vtype)?"35-40%":"20-25%"}.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Fold":"Call"}</strong> river.`},{i:"📊",t:`<strong>Pot odds</strong> : ${Math.round(bet/(pot+bet+bet)*100)}% equity requise.`},{i:"🎭",t:`<strong>${vtype}</strong> : bluff freq ~${["LAG","Aggro Reg","Maniac"].includes(vtype)?"35%":"22%"}.`}],
        leaks:ok===0?["Call sans equity river = -EV"]:["Fold correctement exploitable"],diff:3};
    },
    /* 8 — Shove / Push-Fold (short stack) */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()];
      const hpos=rnd(["BTN","CO","HJ","SB"]),vpos=hpos==="SB"?"BB":rnd(["BB","SB"]);
      const sv=rndI(8,25),stack=sv+"bb";
      const fmt=rnd(["MTT ICM","MTT ChipEV","Spin & Go","Cash 6-max"]),vtype=rnd(["Nit","TAG","Reg","Calling Station"]);
      const v=hStr(hand),ok=v>=2?1:0;
      return{id:`dyn_${_id++}`,cat:"ICM",street:"Preflop",fmt,hpos,vpos,vtype,stack,
        hand,board:[],pot:1.5,toCall:0,
        desc:`${fmt} — ${hpos} ${sv}bb — Push ou fold ?`,
        acts:[{id:"FOLD",l:"Fold",s:ok===0?"GTO":"Trop tight"},{id:"ALLIN",l:`Shove ${sv}bb`,s:"All-in"}],
        ok,best:ok===0?"Fold":`Shove ${sv}bb`,
        freq:ok===0?{FOLD:85,ALLIN:15}:{FOLD:10,ALLIN:90},
        ev:{FOLD:0,ALLIN:ok===1?+(1.2+(5-sv/10)*.5).toFixed(2):-.5},
        expl:ok===0?`Fold : hors Nash range ${hpos} ${sv}bb.`:`Shove ${sv}bb : Nash range inclut cette main. Fold equity +EV.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Fold":"Shove"} ${sv}bb ${hpos}</strong>.`},{i:"📊",t:`<strong>Nash range ${hpos} ${sv}bb</strong> : top ~${hpos==="BTN"?60:hpos==="CO"?40:hpos==="HJ"?30:55}%.`},{i:"🏆",t:`<strong>${fmt}</strong> : ${fmt.includes("ICM")?"ICM = légèrement plus tight":"ChipEV = push agressif"}.`}],
        leaks:ok===0?["Shove hors Nash range = -EV"]:["Fold push Nash = laisse EV"],diff:sv<=15?2:3};
    },
    /* 9 — Squeeze (3-bet vs open + caller) */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()];
      const hpos=rnd(["BB","SB","BTN"]),vpos=rnd(["CO","HJ","UTG"]);
      const pot=rndI(8,14),toCall=Math.round(pot*.4);
      const stack=rndI(80,150)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(["TAG","Reg","Fish"]);
      const callerPos=TRAINER_POS_ORDER.find((p,i)=>i>TRAINER_POS_ORDER.indexOf(vpos)&&i<TRAINER_POS_ORDER.indexOf(hpos)&&p!=="SB"&&p!=="BB"&&p!==hpos&&p!==vpos)||"BTN";
      const openSize=roundBb(toCall+blindOf(hpos))||2.5;
      const v=hStr(hand),sqSz=Math.round(pot*.8+4),ok=v>=4?2:v>=2?1:0;
      return{id:`dyn_${_id++}`,cat:"Vs Open",street:"Preflop",fmt,hpos,vpos,vtype,stack,
        hand,board:[],pot,toCall,
        desc:`${hpos} — Squeeze vs ${vpos} open + caller`,
        acts:[{id:"FOLD",l:"Fold",s:ok===0?"GTO":"Tight"},{id:"CALL",l:"Call",s:`${toCall}bb`},{id:"RAISE",l:`Squeeze ${sqSz}bb`,s:"Agressif"}],
        ok:Math.min(ok,2),best:ok===0?"Fold":ok===1?"Call":`Squeeze ${sqSz}bb`,
        freq:ok===0?{FOLD:80,CALL:15,RAISE:5}:ok===1?{FOLD:25,CALL:55,RAISE:20}:{FOLD:5,CALL:15,RAISE:80},
        ev:{FOLD:0,CALL:ok>=1?.5:-.2,RAISE:ok>=2?1.8:.2},
        expl:ok===0?`Fold : vs 2 joueurs, range squeeze nécessite main premium.`:ok===1?`Call : main correcte, pas assez forte pour squeeze 2 joueurs.`:`Squeeze ${sqSz}bb : main premium, pression maximale.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Fold":ok===1?"Call":"Squeeze"}</strong>.`},{i:"📊",t:`<strong>Squeeze vs 2</strong> : range ~${v>=4?"QQ+/AKs":"KK+"}.`}],
        leaks:ok===0?["Squeeze bluff vs 2 joueurs = -EV"]:["Limp = perd valeur"],diff:3};
    },
    /* 10 — Delayed C-bet Turn (check flop → bet turn) */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()],board=[d.pop(),d.pop(),d.pop(),d.pop()];
      const hpos=rnd(["BTN","CO"]),vpos="BB";
      const pot=rndI(10,20),stack=rndI(50,100)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(VT);
      const v=hStr(hand),ok=v>=2?1:0,b66=Math.round(pot*.66);
      return{id:`dyn_${_id++}`,cat:"Turn",street:"Turn",fmt,hpos,vpos,vtype,stack,
        hand,board,pot,toCall:0,
        desc:`Turn ${board.map(c=>c.r+c.s).join("")} — Flop check/check — Delayed cbet ?`,
        acts:[{id:"CHECK",l:"Check",s:"0bb"},{id:"BET50",l:"Delayed 50%",s:`${Math.round(pot*.5)}bb`},{id:"BET75",l:"Delayed 66%",s:`${b66}bb`}],
        ok,best:ok===0?"Check":"Delayed Cbet 66%",
        freq:ok===0?{CHECK:70,BET50:20,BET75:10}:{CHECK:20,BET50:30,BET75:50},
        ev:{CHECK:ok===0?.6:.2,BET50:ok>=1?.8:.3,BET75:ok>=1?1.0:.2},
        expl:ok===0?`Check : main faible, pas de delayed cbet sans equity.`:`Delayed cbet 66% : IP range advantage. Villain cappé après check flop.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Check":"Delayed cbet"}</strong> turn.`},{i:"📊",t:`<strong>Flop check/check</strong> : villain range cappée sans nutted mains.`},{i:"💰",t:`<strong>Turn ${board[3].r+board[3].s}</strong> : ${["A","K","Q"].includes(board[3].r)?"favorable IP range":"neutre"}.`}],
        leaks:ok===0?["Check toujours = perd fold equity"]:["Delayed cbet sans avantage = -EV"],diff:3};
    },
    /* 11 — Probe Bet Turn (OOP vs IP passive) */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()],board=[d.pop(),d.pop(),d.pop(),d.pop()];
      const hpos="BB",vpos=rnd(["BTN","CO"]);
      const pot=rndI(12,22),stack=rndI(50,100)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(VT);
      const v=hStr(hand),ok=v>=3?1:0,b50=Math.round(pot*.5);
      return{id:`dyn_${_id++}`,cat:"Turn",street:"Turn",fmt,hpos,vpos,vtype,stack,
        hand,board,pot,toCall:0,
        desc:`Turn ${board.map(c=>c.r+c.s).join("")} — IP check flop — Probe ?`,
        acts:[{id:"CHECK",l:"Check",s:"0bb"},{id:"BET33",l:"Probe 33%",s:`${Math.round(pot*.33)}bb`},{id:"BET50",l:"Probe 50%",s:`${b50}bb`}],
        ok,best:ok===0?"Check":"Probe 50%",
        freq:ok===0?{CHECK:70,BET33:20,BET50:10}:{CHECK:25,BET33:25,BET50:50},
        ev:{CHECK:ok===0?.5:.2,BET33:ok>=1?.7:.2,BET50:ok>=1?.9:.1},
        expl:ok===0?`Check : IP a range forte possible. Probe nécessite equity solide.`:`Probe 50% : IP checked flop = range cappée. OOP prend initiative sur bon turn.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Check":"Probe 50%"}</strong>.`},{i:"📊",t:`<strong>IP check flop</strong> : signal de range cappée = OOP peut probe.`}],
        leaks:ok===0?["Check toujours OOP = trop passif"]:["Probe sans equity = bluff raté"],diff:3};
    },
    /* 12 — 4-Bet Pot */
    ()=>{
      const d=shuf(mkDeck()),hand=[d.pop(),d.pop()];
      const hpos=rnd(["BB","SB"]),vpos=rnd(["BTN","CO","HJ"]);
      const pot=rndI(30,50),toCall=Math.round(pot*.45);
      const stack=rndI(80,150)+"bb",fmt=rnd(["Cash 6-max","Cash 9-max"]),vtype=rnd(["TAG","Reg","LAG"]);
      const v=hStr(hand),ok=v>=5?1:v>=3?Math.random()>.6?1:0:0;
      return{id:`dyn_${_id++}`,cat:"Vs 4-bet",street:"Preflop",fmt,hpos,vpos,vtype,stack,
        hand,board:[],pot,toCall,
        desc:`${hpos} vs 4-bet ${vpos} - ${hand[0].r}${hand[0].s}${hand[1].r}${hand[1].s}`,
        acts:[{id:"FOLD",l:"Fold",s:ok===0?"GTO":"Tight"},{id:"CALL",l:"Call",s:`${toCall}bb`},{id:"ALLIN",l:"5-bet Shove",s:"All-in"}],
        ok:Math.min(ok,1),best:ok===0?"Fold":ok===1?"Call":"5-bet Shove",
        freq:ok===0?{FOLD:70,CALL:20,ALLIN:10}:{FOLD:15,CALL:40,ALLIN:45},
        ev:{FOLD:0,CALL:ok>=1?1.5:-.5,ALLIN:ok>=1?2.2:-.8},
        expl:ok===0?`Fold vs 4-bet : range 4-bet très forte (AA/KK/AK mostly). Main trop faible.`:`5-bet shove ou call : main premium, SPR bas favorise all-in.`,
        detail:[{i:"🎯",t:`<strong>${ok===0?"Fold":"Shove/Call"}</strong> vs 4-bet.`},{i:"📊",t:`<strong>Range 4-bet ${vtype}</strong> : ~${vtype==="LAG"?"4%":"2-3%"} (AA/KK/AKs/QQs).`}],
        leaks:ok===0?["Shove bluff vs 4-bet = catastrophe"]:["Fold AAs vs 4-bet = erreur"],diff:3};
    },
  ];

  /* ── Filtres appliqués ── */
  const stF=f.street&&f.street!=="Tous"?f.street:null;
  const catF=f.cat&&f.cat!=="Tous"?f.cat:null;
  const fmtF=f.fmt&&f.fmt!=="Tous"?f.fmt:null;
  // ── Réglages pro ──
  const allowedPos=f.nplayers&&POSITIONS_BY_SIZE[f.nplayers]?new Set(POSITIONS_BY_SIZE[f.nplayers]):null;
  const typeCats=(f.spotTypes&&f.spotTypes.length)?new Set(f.spotTypes.map(t=>SPOT_TYPE_CAT[t]||t)):null;
  const stackOverride=(f.stackEff&&/^\d+$/.test(String(f.stackEff)))?String(f.stackEff):null;
  const icmTag=f.icm&&f.icm!=="Désactivée"?f.icm:null;
  const rp=icmRiskPremium(f.icm,f.phase); // prime de risque ICM/phase

  const weights=[3,2,2,3,2,2,2,2,2,1,2,1,1];
  // Sous forte pression ICM : génère davantage de spots à fort risk premium (all-in : vs 3-bet / vs 4-bet)
  if(rp>=0.3){weights[2]+=4;weights[12]+=4;}
  if(rp>=0.5){weights[0]+=2;} // + de push/fold (open short)
  // Stack court sélectionné (filtre) → territoire push/fold : GEN[8] (Shove/Push-Fold) fortement
  // sur-pondéré + opens short. Sinon, à 8% de poids, les push/fold n'apparaissent quasi jamais
  // alors que c'est exactement le scénario d'un short stack.
  const svOv=stackOverride?parseInt(stackOverride,10):null;
  if(svOv&&svOv<=25){weights[8]+=7;weights[0]+=2;}
  if(svOv&&svOv<=15){weights[8]+=7;}
  if(svOv&&svOv<=10){weights[8]+=6;}
  const totalW=weights.reduce((a,b)=>a+b,0);

  const spots=[],seen=new Set();
  let tries=0;
  while(spots.length<count&&tries<count*25){
    tries++;
    let rand=Math.random()*totalW,gi=0;
    for(let i=0;i<weights.length;i++){rand-=weights[i];if(rand<=0){gi=i;break;}}
    try{
      const spot=GEN[gi]();
      if(!spot)continue;
      if(stF&&spot.street!==stF)continue;
      if(catF&&spot.cat!==catF)continue;
      if(typeCats&&!typeCats.has(spot.cat))continue;
      if(fmtF&&spot.fmt!==fmtF)continue;
      if(allowedPos&&!allowedPos.has(spot.hpos))continue; // Hero dans une position du format de table
      if(allowedPos&&spot.vpos&&!allowedPos.has(spot.vpos))continue; // Vilain aussi (sinon siège hors-table)
      if(seen.has(spot.id))continue;
      if(stackOverride){
        spot.stack=stackOverride+"bb";
        // ── Réaligne le SHOVE des spots push/fold sur le nouveau stack ──
        // Sans ça, l'action reste « Shove 23bb » avec un stack de 10bb → validateSpotConsistency
        // rejette (« action exceeds stack ») et TOUS les push/fold disparaissent dès qu'un filtre
        // stack court est choisi (alors que c'est justement là qu'ils sont les plus pertinents).
        const newSv=parseInt(stackOverride,10);
        const allInAct=spot.acts&&spot.acts.find(a=>(a?.id||"").toUpperCase()==="ALLIN");
        if(allInAct&&Number.isFinite(newSv)){
          allInAct.l=`Shove ${newSv}bb`;
          allInAct.amount=newSv;
          if(typeof spot.best==="string"&&/shove/i.test(spot.best))spot.best=`Shove ${newSv}bb`;
          if(typeof spot.desc==="string")spot.desc=spot.desc.replace(/\b\d+(?:\.\d+)?\s*bb\b/,`${newSv}bb`);
          if(typeof spot.expl==="string")spot.expl=spot.expl.replace(/\b\d+(?:\.\d+)?\s*bb\b/g,`${newSv}bb`);
          if(Array.isArray(spot.detail))spot.detail=spot.detail.map(d=>({...d,t:String(d?.t||"").replace(/\b\d+(?:\.\d+)?\s*bb\b/g,`${newSv}bb`)}));
          if(spot.ev&&typeof spot.ev.ALLIN==="number"){
            const shoveBest=spot.acts.findIndex(a=>(a?.id||"").toUpperCase()==="ALLIN")===spot.ok;
            spot.ev.ALLIN=shoveBest?+(1.2+(5-newSv/10)*.5).toFixed(2):-.5;
          }
        }
      }
      if(icmTag){spot.icm=icmTag;}
      if(f.nplayers)spot.nplayers=f.nplayers;
      if(f.phase&&f.phase!=="Toutes")spot.phase=f.phase;
      if(rp>0)applyICMToSpot(spot,rp,f.phase); // resserre réellement les ranges sous ICM
      // ── Garde-fou : aucun spot impossible (ex. Call sans action agressive précédente) ──
      const _val=validateTrainerSpot(spot);
      if(!_val.valid){
        if(typeof console!=="undefined")console.warn("PF Trainer — spot dynamique invalide ignoré:",_val.errors.join(" · "),spot.cat,spot.hpos,"vs",spot.vpos);
        continue; // régénération automatique (la boucle réessaie)
      }
      spot.ctx=_val.ctx; // contexte (historique préflop + action affrontée) pour l'affichage
      seen.add(spot.id);
      spots.push(spot);
    }catch(e){/* ignore */}
  }
  return spots;
}

function buildQ(f,mode,opts={}){
  const rp=icmRiskPremium(f.icm,f.phase);
  // Spots statiques : clonés + ajustés ICM (ne jamais muter le pool partagé SPOTS)
  const prep=s=>{
    // Toujours cloner (jamais muter le pool SPOTS partagé) et propager le nb de joueurs
    // choisi (sinon les spots statiques rendent avec le layout 6 sièges par défaut).
    const c=rp>0?applyICMToSpot({...s,acts:[...(s.acts||[])],freq:{...(s.freq||{})},ev:{...(s.ev||{})},detail:[...(s.detail||[])]},rp,f.phase):{...s};
    if(f.nplayers)c.nplayers=f.nplayers;
    return c;
  };
  // Garde-fou : on écarte tout spot statique impossible et on attache le contexte calculé
  const guard=s=>{const v=validateTrainerSpot(s);if(!v.valid){if(typeof console!=="undefined")console.warn("PF Trainer — spot statique invalide ignoré:",v.errors.join(" · "),s.id);return null;}s.ctx=v.ctx;return s;};
  // Filtre street selon le type de session : full/session → préflop (le coup se joue ensuite),
  // street → la street choisie. spot/mix → pas de contrainte (streets variées).
  const streetOK=s=>{
    if(opts.onlyPreflop){
      if(!/^pre/i.test(s.street||""))return false;
      // Full Hand : opens propres RFI + défenses (Hero call un open → flop garanti).
      // On écarte 3-bet/4-bet/squeeze/push qui se résolvent souvent avant le flop.
      if(opts.preferFlop){
        const c=(s.cat||"").toLowerCase();
        if(!(c==="rfi"||c.includes("vs open")||c.includes("défense")||c.includes("defense")))return false;
      }
      return true;
    }
    if(opts.onlyStreet)return (s.street||"").toLowerCase()===opts.onlyStreet.toLowerCase();
    return true;
  };
  const staticPool=SPOTS.filter(s=>spotMatchFilter(s,f)&&streetOK(s)).map(prep).map(guard).filter(Boolean);
  const dynCount=Math.max(30,mode===999?200:mode*2);
  const dynPool=generateDynamicSpots(dynCount,f).filter(streetOK);
  let pool=[...staticPool,...dynPool];
  // Fallback graduel : d'abord relâcher positions (hpos/vpos), cat/fmt restent (mais on garde la street du mode)
  if(!pool.length)pool=[...SPOTS.filter(s=>spotMatchFilter(s,{...f,hp:"Tous",vp:"Tous"})&&streetOK(s)).map(guard).filter(Boolean),...generateDynamicSpots(30,{...f,hp:"Tous",vp:"Tous"}).filter(streetOK)];
  // Dernier recours : tous spots valides respectant la street du mode
  if(!pool.length)pool=[...SPOTS.filter(s=>s.hpos!==s.vpos&&streetOK(s)).map(guard).filter(Boolean),...generateDynamicSpots(30,{}).filter(streetOK)];
  // Ultime recours : ignorer le filtre street (évite une queue vide)
  if(!pool.length)pool=[...SPOTS.filter(s=>s.hpos!==s.vpos).map(guard).filter(Boolean),...generateDynamicSpots(30,{})];
  const lim=mode===999?Math.max(pool.length*3,180):mode;
  let adaptiveHistory=[];
  try{adaptiveHistory=loadPlayedSpots?.()||[];}catch{}
  const aiQueue=buildTrainerIntegrationQueue({
    legacyPool:pool,
    filters:f,
    count:lim,
    mode:opts.trainerMode||"gto",
    trainMode:opts.trainMode||"spot",
    platform:opts.platform||"pokerstars",
    adaptiveMode:f.adaptiveMode||"balanced",
    history:adaptiveHistory,
    validateSpot:validateTrainerSpot,
    spotTypeMap:SPOT_TYPE_CAT,
    onlyPreflop:!!opts.onlyPreflop,
    preferFlop:!!opts.preferFlop,
    onlyStreet:opts.onlyStreet||null,
  });
  // Format de table : ne garder que les spots dont HÉROS et VILAIN tiennent dans les N
  // positions (l'AI queue peut en produire hors-format), puis stamper nplayers → le rendu
  // hero-centric affiche le bon nombre de sièges et le héros est toujours présent.
  const fitsSize=s=>{if(!s)return false;if(!f.nplayers||!POSITIONS_BY_SIZE[f.nplayers])return true;const p=POSITIONS_BY_SIZE[f.nplayers];return p.includes(s.hpos)&&(!s.vpos||p.includes(s.vpos));};
  const stampNplayers=arr=>{if(f.nplayers)arr.forEach(s=>{if(s)s.nplayers=f.nplayers;});return arr;};
  const fitAi=aiQueue.filter(fitsSize);
  if(fitAi.length)return stampNplayers(fitAi.slice(0,lim));
  const fitPool=pool.filter(fitsSize);
  const src=fitPool.length?fitPool:pool;
  let q=[];while(q.length<lim)q=[...q,...shuffle(src)];
  return stampNplayers(q.slice(0,lim));
}
function countQ(f){
  const staticN=SPOTS.filter(s=>spotMatchFilter(s,f)).length;
  const dynN=generateDynamicSpots(20,f).length;
  const aiN=countEvolutiveSpots({filters:f,spotTypeMap:SPOT_TYPE_CAT});
  return staticN+dynN+aiN;
}
function saveHistory(h){try{localStorage.setItem("pf_history",JSON.stringify(h.slice(0,50)));}catch{}}

/* ═══════════════════════════════════════════════════════
   COUCHE SÉCURITÉ — PokerForge v7
   • Obfuscation clé API (XOR + btoa) — jamais en clair
   • Validation + checksum sur chaque lecture localStorage
   • Sanitisation des inputs utilisateur (HH textarea)
   • Rate-limiting sur les appels API Anthropic
   • Quota guard localStorage (5 MB max)
════════════════════════════════════════════════════════ */

// ── Obfuscation clé API (symétrique XOR simple, jamais en clair) ──────────

// ── Checksum intégrité des données localStorage ───────────────────────────
function _checksum(str){
  let h=0;
  for(let i=0;i<str.length;i++){h=Math.imul(31,h)+str.charCodeAt(i)|0;}
  return(h>>>0).toString(16);
}

// ── Sanitisation des inputs utilisateur ──────────────────────────────────
function sanitizeText(raw,maxLen=500){
  if(typeof raw!=="string")return "";
  return raw.slice(0,maxLen).replace(/<[^>]*>/g,"").replace(/[<>"']/g,c=>({
    "<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;"
  }[c]));
}

// ── Rate limiter API Anthropic ────────────────────────────────────────────

/* ─── Statistiques longue durée ─────────────────────── */

function updateStatsAfterSession(results,mode){
  const st=loadStats();
  const today=new Date().toDateString();
  const total=results.length;
  const correct=results.filter(r=>r.correct).length;
  const pct=total>0?Math.round(correct/total*100):0;

  // Streak
  if(st.lastDate===today){/* même jour, ne pas changer streak */}
  else if(st.lastDate===new Date(Date.now()-86400000).toDateString()){st.streak++;st.lastDate=today;}
  else{st.streak=1;st.lastDate=today;}
  if(st.streak>st.streakRecord)st.streakRecord=st.streak;

  // Sessions + spots
  st.sessions++;
  st.totalSpots+=total;
  st.xp+=Math.round(correct*10+total*2+(pct>=80?50:pct>=60?20:0));
  st.level=Math.max(1,Math.floor(st.xp/500)+1);
  st.lastGrade=pct>=90?"S":pct>=75?"A":pct>=60?"B":pct>=45?"C":"D";
  st.allPct=[...st.allPct,pct].slice(-30);

  // Week data — décale si nouveau jour
  const todayIdx=new Date().getDay();// 0=dim
  st.weekData[todayIdx]=pct;
  st.weekSpots[todayIdx]=(st.weekSpots[todayIdx]||0)+total;

  // Par catégorie / position / format
  results.forEach(r=>{
    const cat=r.spot?.cat||"?",pos=r.spot?.hpos||"?",fmt=r.spot?.fmt||"?";
    if(!st.catAcc[cat])st.catAcc[cat]={ok:0,total:0};
    st.catAcc[cat].total++;if(r.correct)st.catAcc[cat].ok++;
    if(!st.posAcc[pos])st.posAcc[pos]={ok:0,total:0};
    st.posAcc[pos].total++;if(r.correct)st.posAcc[pos].ok++;
    if(!st.fmtAcc[fmt])st.fmtAcc[fmt]={ok:0,total:0};
    st.fmtAcc[fmt].total++;if(r.correct)st.fmtAcc[fmt].ok++;
  });

  // Leaks = catégories avec acc < 55% et count >= 3
  st.leaks=Object.entries(st.catAcc)
    .filter(([,v])=>v.total>=3)
    .map(([cat,v])=>({cat,acc:Math.round(v.ok/v.total*100),count:v.total}))
    .sort((a,b)=>a.acc-b.acc)
    .slice(0,6);

  // Domain progress (mapping cat → domaine)
  const DOM_MAP={
    "3-bet":"Preflop Ranges","Squeeze":"Preflop Ranges","Open":"Preflop Ranges",
    "Cbet":"Continuation Bet","Double barrel":"Continuation Bet",
    "River":"River Play","Bluff catch":"River Play",
    "ICM":"ICM Tournois","Bulle":"ICM Tournois",
    "Pot odds":"Équité & Maths","Equity":"Équité & Maths",
  };
  const domAgg={};
  Object.entries(st.catAcc).forEach(([cat,v])=>{
    const dom=DOM_MAP[cat]||"Autres";
    if(!domAgg[dom])domAgg[dom]={ok:0,total:0};
    domAgg[dom].ok+=v.ok;domAgg[dom].total+=v.total;
  });
  Object.entries(domAgg).forEach(([d,v])=>{st.domainPct[d]=Math.round(v.ok/v.total*100);});

  // Améliorations
  if(st.allPct.length>=2){
    const delta=pct-st.allPct[st.allPct.length-2];
    if(Math.abs(delta)>=5)st.improvements=[{date:today,delta,metric:"précision"},...st.improvements].slice(0,10);
  }

  saveStats(st);saveStatsSafe(st);
  return st;
}


/* ── RATIO UNIQUE — verrouillé pour TOUTES les tables multi (2T/3T/4T et futurs layouts) ──
   Toutes les felts multi-tables partagent EXACTEMENT le même rapport largeur/hauteur
   (≈1.8:1, proche 16:9) via padding-bottom. Combiné aux colonnes minmax(0,1fr) des
   .grid2/.grid3/.grid4, chaque table devient un clone géométrique parfait des autres. */
const MT_TABLE_PB="55.6%";
const MT_TABLE_RATIO_FALLBACK=0.556;

function parseCssAspectRatio(value){
  const nums=String(value||"").match(/\d*\.?\d+/g)?.map(Number).filter(Number.isFinite)||[];
  if(nums.length>=2&&nums[0]>0&&nums[1]>0)return nums[1]/nums[0];
  if(nums.length===1&&nums[0]>0)return 1/nums[0];
  return null;
}

function parseBbAmount(v){
  if(typeof v==="number")return Number.isFinite(v)?v:0;
  if(!v)return 0;
  const m=String(v).replace(",",".").match(/-?\d+(?:\.\d+)?/);
  return m?parseFloat(m[0]):0;
}
function trainerActionType(action){
  const rawText=[
    action?.id,
    action?.action,
    action?.l,
    action?.label,
    action?.s,
    typeof action==="string"?action:null,
  ].filter(Boolean).join(" ").toUpperCase();
  const id=(action?.id||action?.action||action||"").toString().toUpperCase();
  if(rawText.includes("5-BET")||rawText.includes("5BET"))return"5BET";
  if(rawText.includes("4-BET")||rawText.includes("4BET"))return"4BET";
  if(rawText.includes("3-BET")||rawText.includes("3BET"))return"3BET";
  if(id==="BET33"||id==="BET50"||id==="BET75"||id==="BET100")return"BET";
  if(id==="3BET")return"3BET";
  if(id==="4BET")return"4BET";
  if(id==="5BET")return"5BET";
  if(id==="ALLIN")return"ALLIN";
  if(id==="CHECK_BACK")return"CHECK";
  return id||"ACTION";
}
function trainerVisualActionType(action){
  const txt=(action?.id||action?.action||action?.label||action?.l||action||"").toString().toUpperCase();
  if(txt.includes("FOLD"))return"FOLD";
  if(txt.includes("CHECK"))return"CHECK";
  if(txt.includes("ALL")||txt.includes("SHOVE")||txt.includes("PUSH")||txt.includes("RESHOVE")||txt.includes("JAM"))return"ALLIN";
  if(txt.includes("CALL"))return"CALL";
  if(txt.includes("OPEN"))return"OPEN";
  if(txt.includes("5-BET")||txt.includes("5BET"))return"5BET";
  if(txt.includes("4-BET")||txt.includes("4BET"))return"4BET";
  if(txt.includes("3-BET")||txt.includes("3BET"))return"3BET";
  if(txt.includes("RAISE"))return"RAISE";
  if(txt.includes("CBET")||txt.includes("BET")||txt.includes("%"))return"BET";
  const normalized=trainerActionType(action);
  return normalized==="ACTION"?"BET":normalized;
}
function trainerCanonicalActionType(actionType,amountBb,{callAmount,spot,rawLabel=""}={}){
  const toCall=roundBb(callAmount??spot?.toCall??0);
  if(actionType==="BET"&&toCall>0&&amountBb>0){
    if(amountBb<=toCall+.05)return"CALL";
    return /^pre/i.test(spot?.street||"")?"RAISE":"RAISE";
  }
  if(actionType==="RAISE"){
    const raw=String(rawLabel||"").toUpperCase();
    if(raw.includes("5-BET")||raw.includes("5BET"))return"5BET";
    if(raw.includes("4-BET")||raw.includes("4BET"))return"4BET";
    if(raw.includes("3-BET")||raw.includes("3BET"))return"3BET";
  }
  return actionType;
}
function trainerActionAmount(action,spot,pot,opts={}){
  const id=trainerActionType(action);
  const stack=parseBbAmount(spot?.stack)||100;
  if(id==="FOLD"||id==="CHECK"||id==="WIN")return 0;
  if(id==="ALLIN"){
    const explicit=parseBbAmount(action?.l)||parseBbAmount(action?.label)||parseBbAmount(action?.s)||action?.amount||opts.defaultAmount||stack;
    return roundBb(explicit);
  }
  if(id==="CALL")return roundBb(opts.callAmount??action?.amount??spot?.toCall??parseBbAmount(action?.s)??0);
  if(id==="BET"){
    const raw=(action?.id||"").toString().toUpperCase();
    const pct=raw==="BET33" ? .33 : raw==="BET50" ? .5 : raw==="BET75" ? .75 : raw==="BET100" ? 1 : null;
    return roundBb(action?.amount??(pct?pot*pct:parseBbAmount(action?.s)||pot*.5));
  }
  const parsed=parseBbAmount(action?.l)||parseBbAmount(action?.label)||parseBbAmount(action?.s)||opts.defaultAmount||0;
  return roundBb(action?.amount??parsed);
}
function trainerSizingLabel(actionType,amount,pot,rawLabel=""){
  if(actionType==="FOLD")return"fold";
  if(actionType==="CHECK")return"check";
  if(actionType==="ALLIN")return"all-in";
  if(rawLabel&&/%/.test(rawLabel)){
    const m=rawLabel.match(/\d+\s*%/);
    if(m)return m[0].replace(/\s+/g,"");
  }
  if(amount>0&&pot>0){
    const pct=Math.round(amount/pot*100);
    if(actionType==="BET"&&pct>=20&&pct<=140)return`${pct}% pot`;
  }
  return amount>0?`${roundBb(amount)}bb`:"";
}
function trainerActionVerb(actionType){
  return {
    FOLD:"fold",CALL:"call",CHECK:"check",BET:"bet",RAISE:"raise",
    OPEN:"open","3BET":"3-bet","4BET":"4-bet","5BET":"5-bet",ALLIN:"shove",WIN:"wins"
  }[actionType]||actionType.toLowerCase();
}
function trainerDisplayAction(position,actionType,amount,sizingLabel,rawLabel=""){
  if(actionType==="WIN")return`${position} wins`;
  const amountLabel=amount>0?`${roundBb(amount)}bb`:"";
  if(actionType==="BET"&&sizingLabel&&sizingLabel.includes("%"))return`${position} bet ${sizingLabel} - ${amountLabel}`;
  if(actionType==="ALLIN")return`${position} shove ${amountLabel}`;
  if(actionType==="FOLD"||actionType==="CHECK")return`${position} ${trainerActionVerb(actionType)}`;
  return`${position} ${trainerActionVerb(actionType)} ${amountLabel||rawLabel}`.trim();
}
function trainerFeedbackFor(spot,ua,trainerMode){
  const chosen=spot?.acts?.[ua];
  const best=spot?.acts?.[spot?.ok];
  const bestEv=spot?.ev?.[best?.id]??0;
  const myEv=spot?.ev?.[chosen?.id]??0;
  const evDiff=roundBb(myEv-bestEv);
  const freq=spot?.freq?.[chosen?.id]??0;
  return {
    result:ua===spot?.ok?"correct":freq>=20?"approx":"error",
    heroAction:chosen?.l||"",
    bestAction:best?.l||"",
    evDiff,
    gtoFrequency:spot?.freq?.[best?.id]??0,
    exploitFrequency:trainerMode==="exploit"?Math.max(0,Math.min(100,Math.round(freq*1.08))):freq,
  };
}

/* Feedback ICM / push-fold (signature ICMIZER) — déduit le seuil Nash de jam,
   la rentabilité du push, l'EV et le risque ICM pour un spot push/fold préflop.
   Renvoie null si le spot n'est PAS un push/fold (pas d'action ALLIN préflop). */
function trainerPushFoldInfo(spot){
  if(!spot||!Array.isArray(spot.acts))return null;
  const isPreflop=/^pre/i.test(spot.street||"");
  const shoveIdx=spot.acts.findIndex(a=>(a?.id||"").toUpperCase()==="ALLIN");
  if(!isPreflop||shoveIdx<0)return null;
  const sv=parseStackBb(spot.stack);
  const hpos=spot.hpos;
  // Seuil Nash approximatif (top X% de mains qui jam) selon position + profondeur.
  const baseTop={BTN:60,CO:42,HJ:30,MP:24,"UTG+1":20,UTG:16,SB:55,BB:38}[hpos]??35;
  const stackAdj=sv<=10?1.18:sv<=15?1.0:sv<=20?0.85:0.72; // plus court = range plus large
  const jamTop=Math.max(6,Math.min(94,Math.round(baseTop*stackAdj)));
  const shoveIsBest=spot.ok===shoveIdx;
  const fmt=spot.fmt||"";
  const icm=/icm|spin/i.test(fmt);
  const evShove=roundBb(spot.ev?.[spot.acts[shoveIdx]?.id]??0);
  const icmRisk=icm?(sv<=12?"élevé":"modéré"):"faible";
  return{
    sv,hpos,jamTop,shoveIsBest,icm,fmt,evShove,icmRisk,
    profitable:shoveIsBest,
    note:shoveIsBest
      ?`Cette main entre dans la Nash range ${hpos} ${sv}bb (≈ top ${jamTop}%). Le jam capture assez de fold equity pour être +EV${icm?", même avec la pression ICM":""}.`
      :`Hors Nash range ${hpos} ${sv}bb (≈ top ${jamTop}%). Le jam ne récupère pas assez de fold equity${icm?" et l'ICM pénalise le risque":""} → fold.`,
  };
}

/* Carte de feedback push/fold — rendue uniquement pour les spots push/fold, solution visible. */
function PushFoldFeedbackCard({spot,compact=false}){
  const info=trainerPushFoldInfo(spot);
  if(!info)return null;
  const col=info.shoveIsBest?T.green:T.red;
  const riskCol=info.icmRisk==="élevé"?T.red:info.icmRisk==="modéré"?T.amber:T.green;
  const chip={fontSize:compact?8:8.5,fontFamily:T.stats,color:T.text4,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:6,padding:"2px 7px",whiteSpace:"nowrap"};
  return(
    <div style={{margin:compact?"0 8px 6px":"0 14px 10px",borderRadius:10,border:`1px solid ${col}33`,background:`${col}08`,overflow:"hidden"}}>
      <div style={{padding:"7px 12px",borderBottom:`1px solid ${col}1a`,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:compact?8.5:9,fontWeight:800,color:col,letterSpacing:".06em"}}>♟ PUSH / FOLD · {info.icm?"ICM":"ChipEV"}</span>
        <span style={{marginLeft:"auto",fontFamily:T.mono,fontSize:8.5,color:T.text4}}>{info.hpos} · {info.sv}bb</span>
      </div>
      <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <span style={chip}>Seuil Nash : <b style={{color:T.text2}}>top {info.jamTop}%</b></span>
          <span style={chip}>Jam : <b style={{color:col}}>{info.profitable?"profitable ✓":"non profitable ✗"}</b></span>
          <span style={chip}>EV jam : <b style={{color:info.evShove>=0?T.green:T.red}}>{info.evShove>=0?"+":""}{info.evShove}bb</b></span>
          {info.icm&&<span style={chip}>Risque ICM : <b style={{color:riskCol}}>{info.icmRisk}</b></span>}
        </div>
        <span style={{fontSize:compact?9:9.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>{info.note}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CONTEXTE & VALIDATION DES SPOTS D'ENTRAÎNEMENT
   Objectif : aucun spot impossible ne doit être affiché.
   - buildSpotContext()  : reconstruit le chemin d'action préflop jusqu'à
                           Hero + l'action agressive qu'il affronte (open /
                           3-bet / 4-bet / squeeze / c-bet / bet). Sert à
                           afficher l'historique, les jetons du vilain et le
                           badge « Face à … ».
   - validateSpotState / validateAvailableActions / validatePotAndCallAmount
                         : garde-fous. Un « Call » ne peut exister sans une
                           action agressive précédente visible.
   - validateTrainerSpot : agrège tout + renvoie le contexte calculé.
═══════════════════════════════════════════════════════════════════════ */
const TRAINER_POS_ORDER=["UTG","HJ","CO","BTN","SB","BB"];        // ordre d'action préflop
const TRAINER_POSTFLOP_ORDER=["SB","BB","UTG","HJ","CO","BTN"];   // ordre d'action postflop (IP = dernier)
const TRAINER_BLINDS={SB:0.5,BB:1};
function parseStackBb(s){const n=parseFloat(s);return Number.isFinite(n)&&n>0?n:100;}
function blindOf(pos){return TRAINER_BLINDS[pos]||0;}
function trainerPostflopFirstActor(hpos,vpos){
  const hi=TRAINER_POSTFLOP_ORDER.indexOf(hpos);
  const vi=TRAINER_POSTFLOP_ORDER.indexOf(vpos);
  if(hi<0||vi<0)return"hero";
  return hi<vi?"hero":"villain";
}

/* Reconstruit { preActions:[{position,actionType,amountBb,potAfterAction,street}],
   facing:{kind,label,amount,position}|null, heroCommitted } pour un spot. */
function buildSpotContext(spot){
  const empty={preActions:[],facing:null,heroCommitted:0};
  if(!spot||!spot.hpos||!spot.vpos)return empty;
  const hpos=spot.hpos,vpos=spot.vpos;
  const cat=(spot.cat||"").toLowerCase();
  const desc=(spot.desc||"").toLowerCase();
  const street=spot.street||"Preflop";
  const isPreflop=/^pre/i.test(street);
  const toCall=Math.max(0,+spot.toCall||0);
  const acts=spot.acts||[];
  const hasCall=acts.some(a=>(a.id||"").toUpperCase()==="CALL");
  const isSqueeze=/squeeze/.test(cat)||/squeeze/.test(desc);
  const heroIdx=TRAINER_POS_ORDER.indexOf(hpos);
  const vilIdx=TRAINER_POS_ORDER.indexOf(vpos);

  let pot=1.5; // SB(0.5)+BB(1) déjà postées
  const A=[];
  const push=(position,actionType,amountBb,strt)=>{
    const contributes=!["FOLD","CHECK"].includes(actionType)&&amountBb>0;
    if(contributes)pot=roundBb(pot+amountBb);
    A.push({position,actionType,amountBb:roundBb(amountBb||0),potAfterAction:roundBb(pot),street:strt||street});
  };
  // folds des positions avant `pos` (hors blinds déjà postées)
  const foldBefore=(pos)=>{
    const idx=TRAINER_POS_ORDER.indexOf(pos);
    for(let i=0;i<idx;i++){
      const p=TRAINER_POS_ORDER[i];
      if(p==="SB"||p==="BB")continue;
      push(p,"FOLD",0);
    }
  };

  if(isPreflop){
    // ── Vs 4-bet : Vilain open → Hero 3-bet → Vilain 4-bet ──
    if(cat.includes("4-bet")||cat.includes("4bet")){
      const openV=2.5,heroThree=roundBb(Math.max(9,openV*3.6)),fourBet=roundBb(heroThree+toCall);
      foldBefore(vpos);
      push(vpos,"RAISE",openV);
      push(hpos,"3BET",heroThree);
      push(vpos,"4BET",fourBet);
      return{preActions:A,facing:{kind:"4bet",label:"4-Bet",amount:fourBet,position:vpos},heroCommitted:heroThree};
    }
    // ── Vs 3-bet : Hero open → Vilain 3-bet ──
    if(cat.includes("3-bet")||cat.includes("3bet")){
      const heroOpen=2.5,threeBet=roundBb(heroOpen+toCall);
      foldBefore(hpos);
      push(hpos,"RAISE",heroOpen);
      for(let i=heroIdx+1;i<TRAINER_POS_ORDER.length;i++){
        const p=TRAINER_POS_ORDER[i];
        if(p===vpos)break;
        if(p==="SB"||p==="BB")continue;
        push(p,"FOLD",0);
      }
      push(vpos,"3BET",threeBet);
      return{preActions:A,facing:{kind:"3bet",label:"3-Bet",amount:threeBet,position:vpos},heroCommitted:heroOpen};
    }
    // ── Vs Open / défense / squeeze / iso ──
    if(cat.includes("vs open")||cat.includes("défense")||cat.includes("defense")||cat.includes("iso")||isSqueeze){
      const heroBlind=blindOf(hpos);
      const openSize=roundBb(toCall+heroBlind)||2.5;
      foldBefore(vpos);
      push(vpos,"RAISE",openSize);
      if(isSqueeze){
        const callerPos=TRAINER_POS_ORDER.find((p,i)=>i>vilIdx&&i<heroIdx&&p!=="SB"&&p!=="BB")||"BTN";
        push(callerPos,"CALL",openSize);
      }
      for(let i=vilIdx+1;i<heroIdx;i++){
        const p=TRAINER_POS_ORDER[i];
        if(p==="SB"||p==="BB")continue;
        if(A.some(a=>a.position===p))continue;
        push(p,"FOLD",0);
      }
      return{preActions:A,facing:{kind:isSqueeze?"squeeze":"open",label:isSqueeze?"Open + call":"Open",amount:openSize,position:vpos},heroCommitted:heroBlind};
    }
    // ── Préflop générique avec mise à payer : on suppose un open adverse ──
    if(toCall>0){
      const heroBlind=blindOf(hpos);
      const openSize=roundBb(toCall+heroBlind)||2.5;
      foldBefore(vpos);
      push(vpos,"RAISE",openSize);
      return{preActions:A,facing:{kind:"open",label:"Open",amount:openSize,position:vpos},heroCommitted:heroBlind};
    }
    // ── First-in : RFI / push-fold / limp — Hero ouvre le pot, aucune mise volontaire avant ──
    foldBefore(hpos);
    return{preActions:A,facing:null,heroCommitted:blindOf(hpos)};
  }

  // ── POSTFLOP ── préface préflop simple (pot ouvert) + action de street courante
  const heroIP=TRAINER_POSTFLOP_ORDER.indexOf(hpos)>TRAINER_POSTFLOP_ORDER.indexOf(vpos);
  const pfRaiser=heroIP?hpos:vpos,pfCaller=heroIP?vpos:hpos; // l'IP (dernier à parler) a ouvert préflop
  A.push({position:pfRaiser,actionType:"RAISE",amountBb:2.5,potAfterAction:0,street:"Préflop"});
  A.push({position:pfCaller,actionType:"CALL",amountBb:2.5,potAfterAction:0,street:"Préflop"});
  if(toCall>0){
    const isFlop=street.toLowerCase()==="flop";
    A.push({position:vpos,actionType:"BET",amountBb:roundBb(toCall),potAfterAction:roundBb(spot.pot||0),street});
    return{preActions:A,facing:{kind:isFlop?"cbet":"bet",label:isFlop?"C-Bet":"Bet",amount:roundBb(toCall),position:vpos},heroCommitted:0};
  }
  A.push({position:vpos,actionType:"CHECK",amountBb:0,potAfterAction:roundBb(spot.pot||0),street});
  return{preActions:A,facing:null,heroCommitted:0};
}

function trainerExtraPlayers(spot){
  const raw=[
    ...(Array.isArray(spot?.multiway)?spot.multiway:[]),
    ...(Array.isArray(spot?.extraPlayers)?spot.extraPlayers:[]),
    ...(Array.isArray(spot?.callers)?spot.callers:[]),
  ];
  return raw
    .map(p=>typeof p==="string"?{pos:p}:p||{})
    .map(p=>({...p,pos:p.pos||p.position||p.seat}))
    .filter(p=>TRAINER_POS_ORDER.includes(p.pos));
}

function trainerSeatStates(spot,ctx={},handLog=[],vact=null,answered=null){
  const states={};
  TRAINER_POS_ORDER.forEach(pos=>{
    states[pos]={position:pos,inHand:false,folded:false,multiway:false,invested:0,lastAction:null,lastLabel:null,profile:trainerSeatAvatarProfile(pos)};
  });
  const markInHand=pos=>{
    if(!states[pos])return;
    states[pos].inHand=true;
    states[pos].folded=false;
  };
  const markFolded=pos=>{
    if(!states[pos])return;
    states[pos].folded=true;
    states[pos].inHand=false;
    states[pos].lastAction="FOLD";
    states[pos].lastLabel="Fold";
  };
  const setInvested=(pos,amount,label,type)=>{
    if(!states[pos])return;
    const amt=roundBb(amount||0);
    if(amt>0)states[pos].invested=Math.max(states[pos].invested,amt);
    if(type)states[pos].lastAction=type;
    if(label)states[pos].lastLabel=label;
  };
  markInHand(spot?.hpos);
  markInHand(spot?.vpos);
  trainerExtraPlayers(spot).forEach(p=>{
    if(!states[p.pos]||p.pos===spot?.hpos||p.pos===spot?.vpos)return;
    markInHand(p.pos);
    states[p.pos].multiway=true;
    states[p.pos].profile=p.type||p.profile||trainerSeatAvatarProfile(p.pos);
    setInvested(p.pos,p.amountBb??p.amount??p.committed??0,p.label||p.actionLabel||p.action||"Call",trainerActionType(p.action||"CALL"));
  });
  const applyAction=a=>{
    const pos=a?.position||a?.pos||a?.actor;
    if(!states[pos])return;
    const type=(a?.actionType||trainerActionType(a?.action||a?.act||a?.id||a?.label||"")).toString().toUpperCase();
    const amount=roundBb(a?.amountBb??a?.amount??a?.committed??0);
    const label=a?.label||a?.lbl||a?.displayLabel||(type==="FOLD"?"Fold":type==="CALL"?"Call":type==="CHECK"?"Check":amount>0?`${trainerActionVerb(type)} ${amount}bb`:trainerActionVerb(type));
    if(type==="FOLD"){markFolded(pos);return;}
    markInHand(pos);
    if(pos!==spot?.hpos&&pos!==spot?.vpos)states[pos].multiway=true;
    setInvested(pos,amount,label,type);
  };
  [...(ctx?.preActions||[]),...(handLog||[])].forEach(applyAction);
  if(vact&&spot?.vpos){
    const type=trainerActionType(vact.action||vact);
    if(type==="FOLD")markFolded(spot.vpos);
    else{
      markInHand(spot.vpos);
      setInvested(spot.vpos,vact.amount??0,vact.label||type,type);
    }
  }
  if(answered!==null&&spot?.acts?.[answered]){
    const type=trainerActionType(spot.acts[answered]);
    if(type==="FOLD")markFolded(spot.hpos);
  }
  TRAINER_POS_ORDER.forEach(pos=>{
    if(!states[pos].inHand&&!states[pos].folded)states[pos].folded=true;
  });
  return states;
}

function validateSpotState(spot){
  const errors=[];
  if(!spot)return{valid:false,errors:["spot manquant"]};
  if(!spot.hpos||!spot.vpos)errors.push("position(s) manquante(s)");
  if(spot.hpos&&spot.vpos&&spot.hpos===spot.vpos)errors.push("Hero et Vilain à la même position");
  const expBoard={Preflop:0,Flop:3,Turn:4,River:5}[spot.street];
  if(expBoard!==undefined&&Array.isArray(spot.board)&&spot.board.length!==expBoard)
    errors.push(`board ${spot.board.length} cartes ≠ ${spot.street}`);
  if(!Array.isArray(spot.hand)||spot.hand.length!==2)errors.push("main Hero invalide");
  if(parseStackBb(spot.stack)<=0)errors.push("stack invalide");
  if(!(+spot.pot>0))errors.push("pot invalide");
  if(!Array.isArray(spot.acts)||spot.acts.length<2)errors.push("actions insuffisantes");
  return{valid:errors.length===0,errors};
}

function validateAvailableActions(spot,ctx){
  const errors=[];
  const acts=spot.acts||[];
  const toCall=Math.max(0,+spot.toCall||0);
  const isPreflop=/^pre/i.test(spot.street||"");
  const callActs=acts.filter(a=>(a.id||"").toUpperCase()==="CALL");
  for(const c of callActs){
    // « Call » préflop sans mise à payer = limp (toléré préflop only, first-in)
    const isLimp=isPreflop&&toCall===0&&/limp/i.test(`${c.l||""} ${c.label||""}`);
    if(isLimp)continue;
    if(toCall<=0)errors.push("option Call sans montant à payer (toCall=0)");
    else if(!ctx||!ctx.facing)errors.push("option Call sans action agressive précédente visible");
  }
  // Hero premier à parler ne peut pas faire face à une mise
  if(ctx&&!ctx.facing&&toCall>0)errors.push("Hero premier à parler mais toCall>0");
  return{valid:errors.length===0,errors};
}

function validatePotAndCallAmount(spot,ctx){
  const errors=[];
  const toCall=+spot.toCall||0;
  const stack=parseStackBb(spot.stack);
  if(toCall<0)errors.push("toCall négatif");
  if(toCall>stack+0.01)errors.push("toCall > stack");
  if(ctx&&ctx.facing){
    if(!(ctx.facing.amount>0))errors.push("action adverse sans sizing");
    if(toCall>ctx.facing.amount+0.1)errors.push("toCall > mise adverse");
    if(!(+spot.pot>=ctx.facing.amount-0.1))errors.push("pot incohérent avec la mise adverse");
  }
  return{valid:errors.length===0,errors};
}

/* ── Garde-fous nommés (audit positions / blinds / bouton / pot / mises) ── */
const PF_VALID_POS=["UTG","UTG+1","MP","LJ","HJ","CO","BTN","SB","BB","EP"];
function validateSeatPositions(spot){
  const e=[];
  if(!spot)return{valid:false,errors:["spot manquant"]};
  if(!PF_VALID_POS.includes(spot.hpos))e.push(`position Hero invalide: ${spot.hpos}`);
  if(!PF_VALID_POS.includes(spot.vpos))e.push(`position Vilain invalide: ${spot.vpos}`);
  if(spot.hpos&&spot.vpos&&spot.hpos===spot.vpos)e.push("Hero et Vilain à la même position");
  return{valid:e.length===0,errors:e};
}
function validateBlindAssignments(){
  // SB = 0.5bb, BB = 1bb (règle fixe PokerForge)
  const e=[];
  if(TRAINER_BLINDS.SB!==0.5)e.push("SB ≠ 0.5bb");
  if(TRAINER_BLINDS.BB!==1)e.push("BB ≠ 1bb");
  return{valid:e.length===0,errors:e};
}
function validateButtonPosition(spot){
  // Hero/Vilain doivent appartenir à l'ordre de table connu (bouton placé de façon cohérente)
  const e=[];
  if(spot&&spot.hpos&&TRAINER_POS_ORDER.indexOf(spot.hpos)<0&&!PF_VALID_POS.includes(spot.hpos))
    e.push(`Hero hors anneau: ${spot.hpos}`);
  return{valid:e.length===0,errors:e};
}
function validatePotSize(spot,ctx){
  const e=[];
  if(!(+spot.pot>0))e.push("pot ≤ 0");
  if(ctx&&ctx.facing&&!(+spot.pot>=ctx.facing.amount-0.1))e.push("pot < mise adverse");
  return{valid:e.length===0,errors:e};
}
function validateVillainBetVisible(spot,ctx){
  // Si Hero doit payer (toCall>0), une mise adverse doit être reconstruite ⇒ jetons visibles.
  const e=[];
  const toCall=Math.max(0,+spot.toCall||0);
  if(toCall>0&&(!ctx||!ctx.facing))e.push("Hero doit payer mais aucune mise adverse visible");
  if(ctx&&ctx.facing&&!(ctx.facing.amount>0))e.push("mise adverse sans montant");
  return{valid:e.length===0,errors:e};
}
function validateHeroAvailableActions(spot,ctx){return validateAvailableActions(spot,ctx);}
function validateStreetState(spot){
  const e=[];
  const exp={Preflop:0,Flop:3,Turn:4,River:5}[spot.street];
  if(exp!==undefined&&Array.isArray(spot.board)&&spot.board.length!==exp)
    e.push(`board ${spot.board.length} ≠ ${spot.street}`);
  return{valid:e.length===0,errors:e};
}

/* Agrège tous les validateurs + renvoie le contexte. { valid, errors, ctx } */
function validateTrainerSpot(spot){
  const ctx=buildSpotContext(spot);
  const checks=[
    validateSpotState(spot),
    validateSeatPositions(spot),
    validateButtonPosition(spot),
    validateBlindAssignments(),
    validateStreetState(spot),
    validateHeroAvailableActions(spot,ctx),
    validatePotAndCallAmount(spot,ctx),
    validatePotSize(spot,ctx),
    validateVillainBetVisible(spot,ctx),
  ];
  const errors=[...new Set(checks.flatMap(c=>c.errors))];
  return{valid:errors.length===0,errors,ctx};
}

/* ── Garde-fous Replayer : séquence d'actions + mises visibles ── */

function saveTrainerHandAction(entry){
  try{
    const prev=JSON.parse(localStorage.getItem("pf_trainer_hand_history")||"[]");
    localStorage.setItem("pf_trainer_hand_history",JSON.stringify([...prev,entry].slice(-400)));
  }catch{}
}
function ChipAnimation({event,compact=false}){
  if(!event)return null;
  const cls=`chip-animation ${event.playerId==="hero"?"chip-from-hero":"chip-from-villain"} ${event.actionType==="ALLIN"?"chip-allin":""}`;
  return(
    <div key={event.id} className={cls} style={{"--from-x":`${event.fromX??50}%`,"--from-y":`${event.fromY??50}%`}}>
      <span>{event.label||event.amountLabel}</span>
      {!compact&&event.amountLabel&&<em>{event.amountLabel}</em>}
    </div>
  );
}

/* ── Analyse post-main (Full Hand) — estimation heuristique par street ──
   Pas de solution GTO multi-street exacte : grading basé sur l'agressivité,
   le profil vilain et le résultat (clairement signalé « estimation » dans l'UI). */
function fhGradeAction(action,street,vtype,result){
  const tight=["Nit","TAG","Reg","Reg passif"].includes(vtype);
  const loose=["LAG","Fish","Maniac","Calling Station","Reg agressif","Rec"].includes(vtype);
  if(action==="FOLD")return {v:"Discipline",col:"#9FB0CC",grade:result==="lose"?58:50};
  if(action==="BET"||action==="RAISE"){
    if(tight)return {v:"Pression efficace",col:T.green,grade:82};
    if(loose)return {v:"Agression risquée vs profil large",col:T.amber,grade:55};
    return {v:"Ligne agressive",col:T.green,grade:72};
  }
  if(action==="CHECK")return {v:"Contrôle du pot",col:T.amber,grade:62};
  if(action==="CALL")return {v:loose?"Call value OK":"Call — équité à surveiller",col:T.amber,grade:60};
  return {v:"—",col:T.text3,grade:60};
}
function fhBuildRecap(fhActs,spot,fhResult){
  const order=[["flop","FLOP"],["turn","TURN"],["river","RIVER"]];
  const vtype=spot?.vtype||"Reg";
  const verb=a=>({BET:"Bet",RAISE:"Raise",CHECK:"Check",CALL:"Call",FOLD:"Fold"}[a]||a);
  const heroActs=[];
  const streets=order.map(([key,label])=>{
    const acts=(fhActs||[]).filter(a=>a.street===key);
    if(!acts.length)return null;
    const line=acts.map(a=>`${a.actor==="Hero"?"Hero":"Vil."} ${verb(a.action)}`).join(" · ");
    const hero=acts.find(a=>a.actor==="Hero");
    let verdict="—",col="#6F81A8";
    if(hero){const g=fhGradeAction(hero.action,key,vtype,fhResult);verdict=g.v;col=g.col;heroActs.push({label,action:verb(hero.action),grade:g.grade});}
    return {label,col,line,verdict};
  }).filter(Boolean);
  const score=heroActs.length?Math.round(heroActs.reduce((a,b)=>a+b.grade,0)/heroActs.length):(fhResult==="win"?70:50);
  const scoreCol=score>=75?T.green:score>=55?T.gold:T.red;
  const sorted=[...heroActs].sort((a,b)=>b.grade-a.grade);
  const best=sorted[0]&&sorted[0].grade>=70?`${sorted[0].label} ${sorted[0].action}`:null;
  const worst=sorted.length&&sorted[sorted.length-1].grade<55?`${sorted[sorted.length-1].label} ${sorted[sorted.length-1].action}`:null;
  return {streets,score,scoreCol,best,worst};
}

/* ═══════════════════════════════════════
   SINGLE TABLE COMPONENT
═══════════════════════════════════════ */
export function SingleTable({spot,unit,numTables,showSol,sidebarCollapsed=false,trainerMode="gto",trainMode="spot",platform="pokerstars",onAnswer,onNext,isLast,nextBusy=false,nextError=null,onGoSolver,onFocusToggle,focusMode=false,chipTheme="neon_modern",chipColor="blue",chipSizeMode="auto",onToggleSol,onTableSettled,timerSec=20,field="Standard",coachLevel="Intermédiaire",spotIndex=0,spotTotal=0,isActive=false,panelTarget=null}){
  const[answered,setAnswered]=useState(null);
  const[tl,setTl]=useState([]);
  const[vact,setVact]=useState(null);
  const[thinking,setThinking]=useState(false);
  const[heroReply,setHeroReply]=useState(null);
  const[phase,setPhase]=useState("hero");
  const[dk,setDk]=useState(0);
  const[playingFull,setPlayingFull]=useState(false);
  const[chipAnim,setChipAnim]=useState(null);       // legacy: chip-fly centré
  const[heroChip,setHeroChip]=useState(null);       // chip fly depuis hero
  const[vilChip,setVilChip]=useState(null);         // chip fly depuis villain
  const[chipMove,setChipMove]=useState(null);
  const[potAnim,setPotAnim]=useState(false);        // pulse pot
  const[potDelta,setPotDelta]=useState(null);
  const[currentPotBb,setCurrentPotBb]=useState(()=>roundBb(spot?.pot||1.5));
  const[activePlayerId,setActivePlayerId]=useState("hero");
  const[tableAction,setTableAction]=useState(null);
  const[handLog,setHandLog]=useState([]);
  const[heroFeedback,setHeroFeedback]=useState(null);
  const[boardKey,setBoardKey]=useState(0);          // remount board pour animation
  const[phaseFlash,setPhaseFlash]=useState(false);  // flash quand phase change
  const[errorFlash,setErrorFlash]=useState(false);
  const[errorBtn,setErrorBtn]=useState(null);
  const[timerPct,setTimerPct]=useState(100);
  const[showToast,setShowToast]=useState(null);
  const[rangePopup,setRangePopup]=useState(null);
  const[raiseSzIdx,setRaiseSzIdx]=useState(2); // default 3x
  const[customBB,setCustomBB]=useState(null); // null = use preset
  const timerRef=useRef(null);
  const autoFull=useRef(false); // 30% auto full-hand trigger
  const currentPotRef=useRef(roundBb(spot?.pot||1.5));
  const settledRef=useRef(false);
  const fullPending=useRef(false); // true = une main complète va suivre → ne pas régler la table tout de suite
  // ── Mobile v9 : solution plein écran + swipe ──
  const isMobile=useIsMobile();
  const oneTableStableShellStyle=numTables===1&&sidebarCollapsed&&!isMobile
    ?{width:"calc(100% - 170px)",maxWidth:"100%",margin:"0 auto"}
    :null;
  // Skin Trainer V2 : jetons vectoriels forcés dans TOUT le Trainer (refonte 1T
  // défigée — même logique que le multi ; le sélecteur de thème reste pour les
  // autres surfaces éventuelles).
  const effChipTheme="trainer_v2";
  const[solOpen,setSolOpen]=useState(false);
  const solRef=useRef(null);
  const solTouch=useRef({y:0,dy:0});
  // Full-hand states (intégrés dans le felt)
  const[fhBoardRef,setFhBoardRef]=useState([]);
  const[fhStreet,setFhStreet]=useState("flop");
  const[fhPhase,setFhPhase]=useState("hero");
  const[fhActs,setFhActs]=useState([]);
  const[fhPot,setFhPot]=useState(0);
  const[fhVilAct,setFhVilAct]=useState(null);
  const[fhVilThink,setFhVilThink]=useState(false);
  const[fhResult,setFhResult]=useState(null);
  const FH_STREETS=["flop","turn","river"];
  const fhVisBoard=fhStreet==="flop"?fhBoardRef.slice(0,3):fhStreet==="turn"?fhBoardRef.slice(0,4):fhBoardRef.slice(0,5);
  const isSmall=numTables>1;
  const fmt=v=>unit==="BB"?`${v}bb`:`${(v*2).toFixed(0)}$`;
  const nextLabel=nextBusy?"Chargement...":nextError?"Reessayer":isLast?"Resultats":"Main suivante";
  const nextShortLabel=nextBusy?"Chargement...":nextError?"Reessayer":isLast?"Resultats":"Suivante";
  const callNext=useCallback(()=>{
    if(nextBusy)return;
    onNext?.();
  },[nextBusy,onNext]);

  // ── Contexte du spot : historique préflop + action affrontée (open/3-bet/c-bet…) ──
  const spotValidation=useMemo(()=>validateTrainerSpot(spot),[spot]);
  const spotCtx=spotValidation.ctx||{preActions:[],facing:null,heroCommitted:0};
  const strictSpotValidation=useMemo(()=>validateSpotConsistency(spot,spotCtx,{requireVillain:true}),[spot,spotCtx]);
  const seatStates=trainerSeatStates(spot,spotCtx,handLog,vact,answered);
  const spotErrors=useMemo(()=>[...(spotValidation.errors||[]),...(strictSpotValidation.errors||[])],[spotValidation.errors,strictSpotValidation.errors]);
  const spotImpossible=!spotValidation.valid||!strictSpotValidation.ok;
  const skipRef=useRef(false);
  // Garde-fou final : si un spot impossible atteint l'affichage, on log + passe la main
  useEffect(()=>{
    skipRef.current=false;
    if(spotImpossible){
      if(typeof console!=="undefined")console.warn("PF Trainer strict validator",{
        spotId:spot?.id,
        actionLine:(spotCtx?.preActions||[]).map(a=>`${a.position} ${a.actionType} ${a.amountBb||0}bb`).join(" -> "),
        reason:spotErrors[0],
        errors:spotErrors,
        snapshot:strictSpotValidation.snapshot,
      });
      if(typeof console!=="undefined")console.warn("PF Trainer — spot impossible détecté à l'affichage, main passée:",spotValidation.errors.join(" · "),spot?.cat,spot?.hpos,"vs",spot?.vpos);
      const t=setTimeout(()=>{if(!skipRef.current){skipRef.current=true;callNext();}},1400);
      return()=>clearTimeout(t);
    }
  },[spot,spotImpossible,spotErrors,strictSpotValidation.snapshot,spotCtx,callNext]);

  useEffect(()=>{
    setAnswered(null);setTl([]);setVact(null);setHeroReply(null);setPhase("hero");setDk(k=>k+1);
    setErrorFlash(false);setErrorBtn(null);setTimerPct(100);setShowToast(spotImpossible?"Spot invalide detecte - generation d'une nouvelle main":null);
    setHeroChip(null);setVilChip(null);setChipMove(null);setPotAnim(false);setPhaseFlash(false);
    const basePot=roundBb(spot?.pot||1.5);
    currentPotRef.current=basePot;settledRef.current=false;
    setCurrentPotBb(basePot);setPotDelta(null);setActivePlayerId("hero");
    setTableAction(null);setHandLog([]);setHeroFeedback(null);
    setBoardKey(k=>k+1); // re-déclenche animation des cartes du board
    setSolOpen(false); // ferme l'overlay solution mobile
    // Reset full-hand state quand le spot change
    setPlayingFull(false);setFhBoardRef([]);setFhStreet("flop");setFhPhase("hero");
    setFhActs([]);setFhPot(0);setFhVilAct(null);setFhVilThink(false);setFhResult(null);
    fullPending.current=false;
    // Décide si ce spot sera joué jusqu'à la river selon le type de session :
    // full/session = toujours · mix = 50% · spot/street = jamais (défaut legacy = 30%)
    // Le jeu de main complète se déroule en 1 table (rendu dédié fiable).
    const fullDesired=
      trainMode==="full"||trainMode==="session"?true
      :trainMode==="mix"?Math.random()<0.5
      :trainMode==="spot"||trainMode==="street"?false
      :Math.random()<0.30;
    autoFull.current=numTables===1&&fullDesired
      &&(spot?.hand?.length>=2)
      &&(spot?.street==="Preflop"||spot?.street==="preflop");
    // Démarrer le timer (configurable — 0 = aucun)
    if(timerRef.current)clearInterval(timerRef.current);
    if(!timerSec||timerSec<=0){setTimerPct(100);}
    else{
      const start=Date.now();const dur=timerSec*1000;
      timerRef.current=setInterval(()=>{
        const elapsed=Date.now()-start;
        const pct=Math.max(0,100-elapsed/dur*100);
        setTimerPct(pct);
        if(pct<=0)clearInterval(timerRef.current);
      },80);
    }
    return()=>{if(timerRef.current)clearInterval(timerRef.current);};
  },[spot,timerSec,trainMode]);

  function tlCls(a){
    if(a==="FOLD"||a==="ALLIN")return "tl-fold";
    if(a==="CALL")return "tl-call";
    if(a==="RAISE"||a==="3BET"||a==="4BET"||a==="5BET")return "tl-raise";
    if(a==="CHECK"||a==="CHECK_BACK")return "tl-check";
    if(a==="WIN")return "tl-win";
    return "tl-bet";
  }

  function fireChip(label){
    setChipAnim(label);
    setTimeout(()=>setChipAnim(null),600);
  }
  function fireHeroChip(label){
    setHeroChip(label);
    setTimeout(()=>setHeroChip(null),550);
    // Pot pulse quand chip arrive
    setTimeout(()=>{setPotAnim(true);setTimeout(()=>setPotAnim(false),450);},380);
  }
  function fireVilChip(label){
    setVilChip(label);
    setTimeout(()=>setVilChip(null),550);
    setTimeout(()=>{setPotAnim(true);setTimeout(()=>setPotAnim(false),450);},380);
  }
  function triggerPhaseFlash(){
    setPhaseFlash(true);
    setTimeout(()=>setPhaseFlash(false),400);
  }

  function setPotWithDelta(next,delta){
    currentPotRef.current=roundBb(next);
    setCurrentPotBb(currentPotRef.current);
    if(delta>0){
      const d={id:Date.now()+Math.random(),amount:roundBb(delta)};
      setPotDelta(d);
      setPotAnim(true);
      setTimeout(()=>setPotAnim(false),450);
      setTimeout(()=>setPotDelta(x=>x?.id===d.id?null:x),780);
    }
  }

  function seatCoordFor(pos){
    const layout=getTrainingLayout(numTables,isMobile);
    return layout.seats[pos]||{x:50,y:50};
  }

  function finishTable(){
    setActivePlayerId(null);
    triggerPhaseFlash();
    setPhase("done");
    // Si une main complète enchaîne (Full Hand), on diffère le settlement de la table
    // jusqu'à la fin du coup (sinon le batch multi-table avancerait pendant le jeu).
    if(!settledRef.current&&!fullPending.current){
      settledRef.current=true;
      onTableSettled&&onTableSettled();
    }
  }
  // Fin de main complète → règle enfin la table (permet l'avance du batch multi-table)
  useEffect(()=>{
    if(fhResult&&!settledRef.current){
      settledRef.current=true;
      onTableSettled&&onTableSettled();
    }
  },[fhResult]);

  function commitTableAction({playerId,position,action,callAmount,defaultAmount}){
    const potBefore=currentPotRef.current;
    const event=normalizeTrainerActionEvent({
      rawAction:action,
      actorSeat:position,
      actorId:playerId,
      playerId,
      street:spot.street,
      potBefore,
      amountToCallBeforeAction:callAmount??spot?.toCall??0,
      stack:spot?.stack,
      defaultAmount,
    });
    const actionType=event.actionType;
    const amountBb=event.displayAmount;
    const contributes=event.contributes;
    const potAfter=event.resultingPot;
    const sizingLabel=trainerSizingLabel(actionType,amountBb,potBefore,event.rawLabel);
    const actionLabel=trainerActionDisplayVerb(actionType,action);
    const displayLabel=event.displayLabel;
    const fullDisplayLabel=trainerDisplayAction(position,actionType,amountBb,sizingLabel,event.rawLabel);
    const actionEvent={...event,sizingLabel,displayLabel,fullDisplayLabel,actionLabel};
    const entry={
      street:spot.street,
      player:playerId==="hero"?"Hero":"Villain",
      position,
      actionType,
      amountBb:roundBb(amountBb),
      committedAmount:roundBb(actionEvent.committedAmount),
      displayAmount:roundBb(actionEvent.displayAmount),
      amountToCallBeforeAction:roundBb(actionEvent.amountToCallBeforeAction),
      totalStreetContributionAfterAction:roundBb(actionEvent.totalStreetContributionAfterAction),
      remainingStackAfterAction:actionEvent.remainingStackAfterAction,
      resultingPot:roundBb(actionEvent.resultingPot),
      isAllIn:actionEvent.isAllIn,
      displayLabel,
      actionEvent,
      potAfterAction:potAfter,
      timestamp:new Date().toISOString(),
    };
    setHandLog(h=>[...h,entry]);
    saveTrainerHandAction({...entry,spotId:spot.id,spotDesc:spot.desc});
    setTableAction({
      playerId,
      position,
      actionType,
      amountBb:roundBb(amountBb),
      committedAmount:roundBb(actionEvent.committedAmount),
      displayAmount:roundBb(actionEvent.displayAmount),
      sizingLabel,
      displayLabel,
      fullDisplayLabel,
      actionLabel,
      isAllIn:actionEvent.isAllIn,
      actionEvent,
      color:playerId==="hero"?T.gold:(action?.color||T.purple),
      id:Date.now()+Math.random(),
    });
    if(contributes){
      setPotWithDelta(potAfter,amountBb);
      const from=seatCoordFor(position);
      const move={id:Date.now()+Math.random(),playerId,actionType,fromX:from.x,fromY:from.y,label:actionType==="ALLIN"?"ALL-IN":trainerActionVerb(actionType),amountLabel:`+${roundBb(amountBb)}bb`};
      setChipMove(move);
      setTimeout(()=>setChipMove(x=>x?.id===move.id?null:x),720);
    }
    return{actionType,amountBb,potAfter,sizingLabel,displayLabel,fullDisplayLabel,actionEvent};
  }

  function compactActionLine(){
    const rows=handLog.map(a=>`${a.position} ${a.actionType==="BET"||a.actionType==="OPEN"||a.actionType==="RAISE"||a.actionType==="3BET"||a.actionType==="4BET"||a.actionType==="5BET"||a.actionType==="ALLIN"?`${trainerActionVerb(a.actionType)} ${roundBb(a.displayAmount??a.amountBb)}bb`:trainerActionVerb(a.actionType)}`);
    if(activePlayerId==="hero"&&answered===null)rows.push(`${spot.hpos} decision`);
    if(activePlayerId==="hero"&&phase==="hero_reply")rows.push(`${spot.hpos} decision`);
    if(activePlayerId==="villain")rows.push(`${spot.vpos} thinking`);
    const visible=numTables>=2?rows.slice(-3):rows;
    return visible.join(" -> ");
  }

  function renderHeroFeedback(){
    if(!heroFeedback)return null;
    const cls=heroFeedback.result==="correct"?"hf-ok":heroFeedback.result==="approx"?"hf-warn":"hf-ko";
    const main=heroFeedback.result==="correct"?"correct":heroFeedback.result==="approx"?"approx":"erreur";
    return(
      <div className="hero-feedback-strip">
        <span className={`hf-main ${cls}`}>{heroFeedback.heroAction} {main}</span>
        {showSol?(
          <>
            <span>EV {heroFeedback.evDiff>=0?"+":""}{heroFeedback.evDiff.toFixed(2)}bb</span>
            <span>Meilleure action: <strong>{heroFeedback.bestAction}</strong></span>
            <span>GTO {heroFeedback.gtoFrequency}%</span>
            <span>Exploit {heroFeedback.exploitFrequency}%</span>
          </>
        ):(
          <span>Solution masquee - revele pour EV, frequence et meilleure action.</span>
        )}
      </div>
    );
  }

  function handleHeroAct(i){
    if(answered!==null)return;
    if(timerRef.current)clearInterval(timerRef.current);
    const a=spot.acts[i];
    const isCorrect=i===spot.ok;
    const heroCommit=commitTableAction({playerId:"hero",position:spot.hpos,action:a});
    setHeroFeedback(trainerFeedbackFor(spot,i,trainerMode));
    vibrate(isCorrect?VIB.ok:VIB.err); // feedback haptique bonne/mauvaise réponse
    setAnswered(i);
    setTl(t=>[...t,{pos:spot.hpos,act:a.id,lbl:a.l,hero:true,amt:heroCommit.amountBb}]);
    onAnswer(isCorrect,i);
    if(!isCorrect){
      setErrorFlash(true);setErrorBtn(i);
      setShowToast(showSol?`Sous-optimal - ${spot.acts[spot.ok].l} est la meilleure action ici`:"Sous-optimal - revele la solution pour le detail GTO");
      setTimeout(()=>{setErrorFlash(false);},600);
      setTimeout(()=>{setShowToast(null);},3200);
    }
    // Chip animation depuis hero si hero mise
    if(a.id!=="FOLD"&&a.id!=="CHECK"&&a.id!=="CHECK_BACK"){
      fireHeroChip(a.l);
      fireChip(a.l); // legacy centré aussi
    }
    if(a.id==="FOLD"){finishTable();return;}
    const forceFullAfterPreflopCall=/^pre/i.test(spot?.street||"")&&heroCommit.actionType==="CALL";
    const roundDecision=trainerRoundCloseDecision({
      spot,
      ctx:spotCtx,
      heroAction:a,
      autoFull:autoFull.current||forceFullAfterPreflopCall,
      playingFull,
    });
    if(roundDecision.closesRound){
      if(roundDecision.startFullHand)fullPending.current=true;
      finishTable();
      if(roundDecision.startFullHand)setTimeout(()=>startFullHand(),850);
      return;
    }
    triggerPhaseFlash();
    setPhase("villain_thinking");
    setActivePlayerId("villain");
    setThinking(true);
    const delay=villainThinkDelay(spot.vtype,a.id,trainerMode);
    setTimeout(()=>{
      const spr=parseFloat(spot.stack)/(currentPotRef.current||1.5);
      const boardLen=(spot.board||[]).length;
      const v=villainDecide(spot.street,a.id,spot.vtype,currentPotRef.current,trainerMode,platform,spr,parseFloat(spot.stack)||100,spot.vpos,boardLen,field);
      const vilCommit=commitTableAction({playerId:"villain",position:spot.vpos,action:v,callAmount:v.action==="CALL"?heroCommit.amountBb:undefined});
      setVact(v);setThinking(false);
      setTl(t=>[...t,{pos:spot.vpos,act:v.action,lbl:v.label,hero:false,amt:vilCommit.amountBb}]);
      if(v.action!=="FOLD"&&v.action!=="CHECK"&&v.action!=="WIN"){
        fireVilChip(v.label);
        fireChip(v.label);
      }
      if(v.action==="WIN"||v.action==="FOLD"||v.action==="CHECK"||v.action==="CALL"||a.id==="ALLIN"){
        // Main complète si Hero a continué et le vilain reste en jeu (call/check)
        const goFull=autoFull.current&&!playingFull&&a.id!=="FOLD"&&a.id!=="ALLIN"&&(v.action==="CALL"||v.action==="CHECK");
        if(goFull)fullPending.current=true;
        finishTable();
        if(goFull)setTimeout(()=>startFullHand(),1500);
      } else {
        triggerPhaseFlash();setPhase("hero_reply");setActivePlayerId("hero");
      }
    },delay);
  }

  function handleHeroReply(act){
    vibrate(VIB.tap);
    const replyLabel=act==="CALL"?"Call":act==="FOLD"?"Fold":"Raise";
    const replyAction={id:act,l:replyLabel,amount:act==="CALL"?(vact?.amount||0):act==="RAISE"?Math.round((vact?.amount||Math.max(1,currentPotRef.current*.5))*2.5):0};
    const replyCommit=commitTableAction({playerId:"hero",position:spot.hpos,action:replyAction,callAmount:act==="CALL"?(vact?.amount||0):undefined});
    setHeroReply(act);
    setTl(t=>[...t,{pos:spot.hpos,act:act,lbl:replyLabel,hero:true,amt:replyCommit.amountBb}]);
    if(act!=="FOLD"&&act!=="CALL")fireHeroChip(act==="RAISE"?"Raise":"Bet");
    if(act==="FOLD"||act==="CALL"){
      // Hero call qui clôt le préflop → on enchaîne sur la main complète (Full Hand)
      const goFull=act==="CALL"&&!playingFull&&(autoFull.current||/^pre/i.test(spot?.street||""));
      if(goFull)fullPending.current=true;
      finishTable();
      if(goFull)setTimeout(()=>startFullHand(),1400);
      return;
    }
    // Hero a relancé → vilain répond une dernière fois avant fin de spot
    setThinking(true);triggerPhaseFlash();setPhase("villain_thinking");setActivePlayerId("villain");
    const delay=villainThinkDelay(spot.vtype,"RAISE",trainerMode);
    setTimeout(()=>{
      const spr=parseFloat(spot.stack)/(currentPotRef.current||1.5);
      const v2=villainDecide(spot.street,"RAISE",spot.vtype,currentPotRef.current,trainerMode,platform,spr,parseFloat(spot.stack)||100,spot.vpos,(spot.board||[]).length,field);
      const v2Commit=commitTableAction({playerId:"villain",position:spot.vpos,action:v2,callAmount:v2.action==="CALL"?replyCommit.amountBb:undefined});
      setThinking(false);
      setTl(t=>[...t,{pos:spot.vpos,act:v2.action,lbl:v2.label,hero:false,amt:v2Commit.amountBb}]);
      if(v2.action!=="FOLD"&&v2.action!=="CHECK"&&v2.action!=="WIN"){
        fireVilChip(v2.label);fireChip(v2.label);
      }
      finishTable();
    },delay);
  }

  function startFullHand(){
    const board=genBoard(spot.hand||[]);
    const startPot=roundBb(currentPotRef.current||spot.pot||15);
    const firstActor=trainerPostflopFirstActor(spot.hpos,spot.vpos);
    setFhBoardRef(board);setFhStreet("flop");setFhPhase(firstActor==="hero"?"hero":"villain_thinking");
    setFhActs([]);setFhPot(startPot);setFhVilAct(null);setFhResult(null);
    setActivePlayerId(firstActor);
    setPlayingFull(true);
    if(firstActor==="villain"){
      setFhVilThink(true);
      setTimeout(()=>{
        const spr=startPot>0?parseFloat(spot.stack||100)/startPot:8;
        const vd=villainDecide("flop","CHECK",spot.vtype,startPot,trainerMode,platform,spr,parseFloat(spot.stack)||100,spot.vpos,3,field);
        const action=vd.action||"CHECK";
        const amount=roundBb(vd.amount||((action==="BET"||action==="RAISE")?Math.max(1,Math.round(startPot*.5)):0));
        const resolved={...vd,amount};
        setFhVilThink(false);
        setFhVilAct(resolved);
        setFhActs([{street:"flop",actor:"Villain",action}]);
        if(action!=="CHECK"&&action!=="FOLD"&&action!=="WIN"){
          fireVilChip(resolved.label||action);
          fireChip(resolved.label||action);
        }
        if(action==="BET"||action==="RAISE"){
          if(amount>0)setFhPot(p=>roundBb(p+amount));
          setFhPhase("hero_facing_bet");setActivePlayerId("hero");return;
        }
        if(action==="FOLD"||action==="WIN"){
          setActivePlayerId(null);setFhResult(action==="FOLD"?"win":"lose");setFhPhase("done");return;
        }
        setFhPhase("hero");setActivePlayerId("hero");
      },620+Math.random()*420);
    }
  }

  function fhFireChip(lbl){fireChip(lbl);}

  function fhHeroAct(act){
    vibrate(VIB.tap);
    const nActs=[...fhActs,{street:fhStreet,actor:"Hero",action:act}];
    setFhActs(nActs);
    if(act==="FOLD"){setActivePlayerId(null);setFhResult("lose");setFhPhase("done");return;}
    if(act!=="CHECK")fhFireChip(act==="BET"?"Bet ½":"Bet PSB");
    setFhVilThink(true);setFhPhase("villain_thinking");setActivePlayerId("villain");
    setTimeout(()=>{
      setFhVilThink(false);
      const spr=fhPot>0?parseFloat(spot.stack)/fhPot:8;
      const vd=villainDecide(fhStreet,act,spot.vtype,fhPot,trainerMode,platform,spr,parseFloat(spot.stack)||100,spot.vpos,(spot.board||[]).length,field);
      const updated=[...nActs,{street:fhStreet,actor:"Villain",action:vd.action}];
      setFhActs(updated);setFhVilAct(vd);
      if(vd.action==="FOLD"||vd.action==="WIN"){setActivePlayerId(null);setFhResult("win");setFhPhase("done");return;}
      if(vd.action!=="CHECK")fhFireChip(vd.label);
      // Vilain bet/raise → Hero doit répondre avant de passer à la street suivante
      if(vd.action==="BET"||vd.action==="RAISE"){
        if(vd.amount)setFhPot(p=>p+Math.round(vd.amount));
        setFhPhase("hero_facing_bet");setActivePlayerId("hero");return;
      }
      // Vilain check/call → avancer la street
      if(act==="BET"||act==="RAISE")setFhPot(p=>p+(p*.5|0));
      const idx=FH_STREETS.indexOf(fhStreet);
      if(idx<FH_STREETS.length-1){
        setTimeout(()=>{setFhStreet(FH_STREETS[idx+1]);setFhPhase("hero");setFhVilAct(null);setActivePlayerId("hero");},400);
      } else {
        const won=Math.random()>.45;setActivePlayerId(null);setFhResult(won?"win":"lose");setFhPhase("done");
      }
    },500+Math.random()*500);
  }

  function fhHeroFaceBet(act){
    vibrate(VIB.tap);
    const nActs=[...fhActs,{street:fhStreet,actor:"Hero",action:act}];
    setFhActs(nActs);
    if(act==="FOLD"){setActivePlayerId(null);setFhResult("lose");setFhPhase("done");return;}
    if(act!=="CALL")fhFireChip("Raise");
    if(act==="CALL"&&fhVilAct?.amount)setFhPot(p=>p+Math.round(fhVilAct.amount));
    // Hero raise → villain doit répondre avant d'avancer la street
    if(act==="RAISE"){
      const raiseAmt=Math.round((fhVilAct?.amount||Math.round(fhPot*.5))*2.5);
      setFhPot(p=>p+raiseAmt);
      setFhVilThink(true);setFhPhase("villain_thinking");setActivePlayerId("villain");
      setTimeout(()=>{
        setFhVilThink(false);
        const spr=fhPot>0?parseFloat(spot.stack||100)/fhPot:8;
        const vd=villainDecide(fhStreet,"RAISE",spot.vtype,fhPot,trainerMode,platform,spr,parseFloat(spot.stack)||100,spot.vpos,(spot.board||[]).length,field);
        const updated=[...nActs,{street:fhStreet,actor:"Villain",action:vd.action}];
        setFhActs(updated);setFhVilAct(vd);
        if(vd.action==="FOLD"){setActivePlayerId(null);setFhResult("win");setFhPhase("done");return;}
        if(vd.action!=="CHECK")fhFireChip(vd.label||vd.action);
        const idx2=FH_STREETS.indexOf(fhStreet);
        if(idx2<FH_STREETS.length-1){
          setTimeout(()=>{setFhStreet(FH_STREETS[idx2+1]);setFhPhase("hero");setFhVilAct(null);setActivePlayerId("hero");},400);
        } else {
          const won=Math.random()>.45;setActivePlayerId(null);setFhResult(won?"win":"lose");setFhPhase("done");
        }
      },500+Math.random()*500);
      return;
    }
    const idx=FH_STREETS.indexOf(fhStreet);
    if(idx<FH_STREETS.length-1){
      setTimeout(()=>{setFhStreet(FH_STREETS[idx+1]);setFhPhase("hero");setFhVilAct(null);setActivePlayerId("hero");},400);
    } else {
      const won=Math.random()>.45;setActivePlayerId(null);setFhResult(won?"win":"lose");setFhPhase("done");
    }
  }

  // Haptique fin de main complète (victoire/défaite)
  useEffect(()=>{if(fhResult)vibrate(fhResult==="win"?VIB.win:VIB.err);},[fhResult]);

  // ── Raccourcis clavier (rythme drill type GTO Wizard) — 1 table uniquement ──
  // F=Fold · C=Call/Check · B=Bet · R=Raise · A=All-in · Entrée=Spot suivant.
  // N'agit QUE si c'est à Hero de jouer ET que l'action existe dans le contexte
  // courant (sinon ignoré). En multi-table on n'attache aucun listener (sinon une
  // touche jouerait sur toutes les tables à la fois). Ref pour éviter les closures périmées.
  const keyHandlerRef=useRef(null);
  keyHandlerRef.current=(e)=>{
    const tag=(e.target?.tagName||"").toUpperCase();
    if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||e.target?.isContentEditable)return;
    if(e.metaKey||e.ctrlKey||e.altKey||e.repeat)return;
    const fire=(fn,arg)=>{e.preventDefault();fn&&fn(arg);};
    // Entrée → spot suivant (après une décision)
    if(e.key==="Enter"){
      if(!playingFull&&answered!==null){fire(callNext);}
      return;
    }
    // ── Raccourcis F1–F4 : positionnels sur les actions du spot (table active) ──
    const fk={F1:0,F2:1,F3:2,F4:3}[e.key];
    if(fk!==undefined){
      if(!playingFull&&phase==="hero_reply"&&vact){
        return fire(handleHeroReply,["FOLD","CALL","RAISE","RAISE"][fk]);
      }
      if(!playingFull&&phase==="hero"&&answered===null&&Array.isArray(spot?.acts)&&spot.acts[fk]){
        return fire(handleHeroAct,fk);
      }
      return;
    }
    const k=(e.key||"").toLowerCase();
    if(!["f","c","b","r","a"].includes(k))return;
    // ── Mode main complète (Full Hand) ──
    if(playingFull){
      if(fhPhase==="hero"){
        if(k==="f")return fire(fhHeroAct,"FOLD");
        if(k==="c")return fire(fhHeroAct,"CHECK");
        if(k==="b")return fire(fhHeroAct,"BET");
        if(k==="r")return fire(fhHeroAct,"RAISE");
      }else if(fhPhase==="hero_facing_bet"){
        if(k==="f")return fire(fhHeroFaceBet,"FOLD");
        if(k==="c")return fire(fhHeroFaceBet,"CALL");
        if(k==="r"||k==="b")return fire(fhHeroFaceBet,"RAISE");
      }
      return;
    }
    // ── Réponse à une mise du vilain (Fold/Call/Raise) ──
    if(phase==="hero_reply"&&vact){
      if(k==="f")return fire(handleHeroReply,"FOLD");
      if(k==="c")return fire(handleHeroReply,"CALL");
      if(k==="r"||k==="b"||k==="a")return fire(handleHeroReply,"RAISE");
      return;
    }
    // ── Décision initiale Hero : on mappe la touche vers l'action RÉELLEMENT disponible ──
    if(phase==="hero"&&answered===null&&Array.isArray(spot?.acts)){
      const wanted=k==="f"?["FOLD"]:k==="c"?["CALL","CHECK"]:k==="b"?["BET"]:k==="r"?["RAISE","3BET","4BET","5BET"]:["ALLIN"];
      const idx=spot.acts.findIndex(a=>wanted.includes(trainerActionType(a)));
      if(idx>=0)return fire(handleHeroAct,idx);
    }
  };
  useEffect(()=>{
    // 1T : toujours. Multi-table : seule la table ACTIVE écoute (raccourcis F1–F4).
    if(numTables!==1&&!isActive)return;
    const h=(e)=>keyHandlerRef.current&&keyHandlerRef.current(e);
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[numTables,isActive]);

  // ── Spot impossible : la main s'arrête, message clair, passage automatique ──
  if(spotImpossible){
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12,background:"radial-gradient(ellipse at 50% 40%,#0B1430 0%,#020810 100%)",padding:24,textAlign:"center"}}>
        <div style={{fontSize:34}}>⚠</div>
        <div style={{fontFamily:T.brand,fontWeight:900,fontSize:16,color:T.amber,letterSpacing:".04em"}}>Spot incohérent ignoré</div>
        <div style={{fontFamily:T.stats,fontSize:11,color:T.text3,maxWidth:340,lineHeight:1.5}}>
          Cette situation ne pouvait pas se produire (action précédente manquante ou sizing incohérent). PokerForge la passe automatiquement et charge la main suivante.
        </div>
        <button className="gto-next-btn" style={{padding:"9px 18px",fontSize:12}} disabled={nextBusy} onClick={()=>{skipRef.current=true;callNext();}}>{nextLabel} ▶</button>
      </div>
    );
  }

  const is1T=numTables===1;
  // Board size augmente si sidebar repliée (1T) ou taille normale multi
  // ── Config d'affichage par nombre de tables ──
  // potFntB = pot font when board visible | potFnt = pot font preflop (no board)
  // heroCard = taille cartes hero sur le siège | vilCard = taille dos villain
  // board: 1T=2xl(76px) / 2T=xl(60px,+25%) / 3T=lg(48px,+41%) / 4T=md(34px,+42%)
  // heroCard: 1T=3xl / 2T=md(+42% vs sm) / 3T=sm(+26% vs xs) / 4T=smp(28px,+47% vs xs)
  const TRAINING_LAYOUT={
    1:{pb:"unused",    board:"2xl", boardGap:8, seat:68, fpos:13,  fstk:12,  actFnt:15, actPad:"15px 12px 13px", heroCard:"3xl", vilCard:"lg",  cardSize:"xs", dbtnSz:22, compact:false, potFntB:14, potFnt:18},
    2:{pb:MT_TABLE_PB, board:"xl",  boardGap:5, seat:48, fpos:10.5, fstk:9.5, actFnt:13, actPad:"12px 10px 10px", heroCard:"lg",  vilCard:"sm",  cardSize:"sm", dbtnSz:17, compact:false, potFntB:13, potFnt:15},
    3:{pb:MT_TABLE_PB, board:"lg",  boardGap:3, seat:38, fpos:8,    fstk:7,   actFnt:11, actPad:"9px 7px 8px",   heroCard:"smp", vilCard:"xs",  cardSize:"xs", dbtnSz:13, compact:true,  potFntB:12, potFnt:13},
    4:{pb:MT_TABLE_PB, board:"md",  boardGap:3, seat:30, fpos:7,    fstk:6,   actFnt:10, actPad:"8px 6px 7px",   heroCard:"sm",  vilCard:"xs",  cardSize:"xs", dbtnSz:10, compact:true,  potFntB:12, potFnt:13},
  };
  const baseCfg=TRAINING_LAYOUT[numTables]||TRAINING_LAYOUT[2];
  const cfg=isMobile&&numTables>1
    ?{
      ...baseCfg,
      board:numTables===2?"lg":numTables===3?"md":"sm",
      boardGap:numTables===2?4:3,
      seat:numTables===2?40:numTables===3?32:26,
      fpos:numTables===2?9.5:numTables===3?7.5:6.5,
      fstk:numTables===2?8.5:numTables===3?6.8:6,
      heroCard:numTables===2?"md":numTables===3?"smp":"sm",
      vilCard:"xs",
      dbtnSz:numTables===2?15:12,
      compact:true,
      potFntB:numTables===2?11:10,
      potFnt:numTables===2?13:12,
    }
    :baseCfg;
  // 1T : layout HERO-CENTRIC dynamique (nb de joueurs = spot.nplayers, héros en bas).
  // Multi-tables (2T/3T/4T) : layout statique historique (inchangé pour l'instant).
  // HERO-CENTRIC dynamique : d'abord scopé au 1T MOBILE (desktop/multi-tables inchangés pour l'instant).
  const heroCentric=numTables===1&&isMobile;
  const seatOrder=(heroCentric&&spot?.nplayers&&POSITIONS_BY_SIZE[spot.nplayers])?POSITIONS_BY_SIZE[spot.nplayers]:TRAINING_SEAT_ORDER;
  const trainingLayout=useMemo(()=>{
    if(!heroCentric)return getTrainingLayout(numTables,isMobile);
    const cfgViz=TRAINER_VISUAL_1T_MOBILE;
    const positions=(spot?.nplayers&&POSITIONS_BY_SIZE[spot.nplayers])?POSITIONS_BY_SIZE[spot.nplayers]:POSITIONS_BY_SIZE[6];
    const seats=computeHeroCentricSeats(positions,spot?.hpos,cfgViz.tableGeometry);
    const layout=createTrainingTableLayout("1T-mobile-dyn",seats,cfgViz);
    // P1 (mission premium) : ZONE POT ≠ ZONE MISES. Les mises des sièges du HAUT
    // sont déportées en diagonale (jamais sur la colonne centrale x50 où vivent
    // le pot et la plaque) → plus aucun chevauchement pot/mise/board.
    Object.entries(layout.seatAnchors).forEach(([p,a])=>{
      const st=seats[p]; if(!st||st.y>22)return;
      const bx=st.x<=40?st.x+9:st.x>=60?st.x-9:st.x+14;
      const bpt={x:bx,y:st.y+16};
      a.betAnchor={...bpt};a.preflopBetAnchor={...bpt};a.postflopBetAnchor={...bpt};
      a.blindAnchor={x:bx,y:st.y+14};
      a.actionLabelAnchor={x:bx+4,y:st.y+22};
    });
    return layout;
  },[heroCentric,numTables,isMobile,spot?.nplayers,spot?.hpos]);
  // Mobile portrait : le board doit tenir dans ~360px → taille selon nb de cartes
  const boardCount=playingFull?fhVisBoard.length:(spot.board||[]).length;
  const hasVisibleBoard=boardCount>0;
  const oneTableBoardSize=TRAINER_VISUAL_CONFIG.boardSize?.oneTable||"1t-hero";
  const boardSize=numTables===1?(isMobile?(boardCount>=5?"md":"lg"):oneTableBoardSize):cfg.board;
  const boardGap=numTables===1?(isMobile?(boardCount>=5?3:4):(boardCount>=5?5:6)):cfg.boardGap;
  const heroCardSize1T=isMobile?"1t-hero-mobile":"1t-hero";
  const villainCardSize1T=isMobile?"xs":"1t-villain";
  const visualStreet=playingFull?fhStreet:(spot.street||"Preflop");
  const isVisualPreflop=/^pre/i.test(visualStreet);
  const postedBlinds={SB:TRAINER_BLINDS.SB,BB:TRAINER_BLINDS.BB};
  const showStaticBlindMarkers=isVisualPreflop&&!playingFull;
  const mainPotBb=roundBb(playingFull?fhPot:(currentPotBb||spot.pot||postedBlinds.SB+postedBlinds.BB));
  const heroSize=numTables>=3?"md":numTables===2?"lg":"3xl";
  const chipSize=numTables>=3?30:numTables===2?38:68;
  const seatFontPos=7;
  const seatFontStk=7.5;
  const seatsLayout=SEATS6;

  /* ── HUD values — partagées 1T + multi-table ── */
  const stackBBn=parseFloat(spot.stack)||100;
  const potBBn=mainPotBb;
  const spr=(stackBBn/potBBn).toFixed(1);
  const potOddsRaw=spot.toCall>0?spot.toCall/(spot.toCall+potBBn)*100:0;
  const potOddsStr=potOddsRaw>0?potOddsRaw.toFixed(0)+"%":null;
  const diffLabel=spot.diff===1?"Débutant":spot.diff===2?"Intermédiaire":spot.diff===3?"Avancé":spot.diff===4?"Expert":"Intermédiaire";
  const diffCol=spot.diff===1?T.green:spot.diff===2?T.amber:spot.diff===3?T.red:spot.diff===4?"#9B5CFF":T.amber;

  /* ══════════════════════════════════════════════════
     SOLUTION PLEIN ÉCRAN MOBILE — partagée 1T + multi
     Ouverture via FAB · Fermeture swipe-down ou ✕
  ══════════════════════════════════════════════════ */
  function solTStart(e){solTouch.current={y:e.touches[0].clientY,dy:0};}
  function solTMove(e){
    const dy=e.touches[0].clientY-solTouch.current.y;
    solTouch.current.dy=dy;
    if(dy>0&&solRef.current)solRef.current.style.transform=`translateY(${dy}px)`;
  }
  function solTEnd(){
    const dy=solTouch.current.dy;
    if(solRef.current)solRef.current.style.transform="";
    if(dy>80){vibrate(VIB.tap);setSolOpen(false);}
    solTouch.current={y:0,dy:0};
  }
  function resetSpot(){
    setAnswered(null);setTl([]);setVact(null);setHeroReply(null);setPhase("hero");
    setDk(k=>k+1);setErrorFlash(false);setErrorBtn(null);setTimerPct(100);setSolOpen(false);
    const basePot=roundBb(spot?.pot||1.5);
    currentPotRef.current=basePot;settledRef.current=false;
    setCurrentPotBb(basePot);setPotDelta(null);setChipMove(null);
    setActivePlayerId("hero");setTableAction(null);setHandLog([]);setHeroFeedback(null);
  }
  function renderMobileSolution(){
    if(answered===null)return null;
    const bestAct=spot.acts[spot.ok];
    const bestEv=spot.ev[bestAct?.id]||0;
    const myEv=spot.ev[spot.acts[answered]?.id]||0;
    const evDiff=myEv-bestEv;
    const isBest=answered===spot.ok;
    const bestFreq=spot.freq[bestAct?.id]||0;
    const qualityLabel=isBest?"Best Move ✦":evDiff>=-0.3?"Correct ✓":evDiff>=-1?"Imprécision ⚠":evDiff>=-3?"Erreur ✗":"Blunder 💥";
    const qualityCls=isBest?"gto-best":evDiff>=-0.3?"gto-correct":evDiff>=-1?"gto-inaccuracy":evDiff>=-3?"gto-wrong":"gto-blunder";
    const accentCols=["#FF4560","#10D87A","#1F8BFF","#FFC247","#9B5CFF"];
    return(
      <>
        <div className="pf-solfull-backdrop" onClick={()=>setSolOpen(false)}/>
        <div className="pf-solfull" ref={solRef}>
          {/* Header — swipe vers le bas pour fermer */}
          <div className="pf-solfull-hdr" style={{position:"relative"}} onTouchStart={solTStart} onTouchMove={solTMove} onTouchEnd={solTEnd}>
            <div className="pf-solfull-grip"/>
            <div style={{minWidth:0,flex:1}}>
              <div className="pf-solfull-title">💡 SOLUTION</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:9,color:"#6F81A8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{spot.desc}</div>
            </div>
            <span className={`gto-quality ${qualityCls}`} style={{flexShrink:0,fontSize:9,padding:"3px 8px"}}>{qualityLabel}</span>
            <button className="pf-solfull-x" onClick={()=>setSolOpen(false)}>✕</button>
          </div>
          <div className="pf-solfull-body">
            {!showSol?(
              /* Mode hard : solution verrouillée jusqu'à révélation explicite */
              <div style={{textAlign:"center",padding:"44px 16px",display:"flex",flexDirection:"column",alignItems:"center",gap:13}}>
                <span style={{fontSize:40}}>🔒</span>
                <div style={{fontFamily:T.stats,fontSize:13.5,fontWeight:700,color:T.text}}>Solution masquée — mode hard</div>
                <div style={{fontFamily:T.stats,fontSize:11,color:T.text3,lineHeight:1.65,maxWidth:300}}>
                  Tu as joué <strong style={{color:isBest?T.green:T.red}}>{spot.acts[answered]?.l}</strong> — {isBest?"c'était la bonne action.":"ce n'était pas l'action optimale."} Révèle la solution pour l'analyse GTO complète.
                </div>
                {onToggleSol&&<button className="btn btng" style={{fontSize:12,padding:"12px 24px"}} onClick={()=>{vibrate(VIB.tap);onToggleSol();}}>👁 Révéler la solution</button>}
              </div>
            ):(
              <>
                {/* ── ACTION OPTIMALE + EV ── */}
                <div className="pf-sol-opt">
                  <div className="pf-sol-opt-lbl">⭐ ACTION OPTIMALE</div>
                  <div className="pf-sol-opt-act">
                    {bestAct?.l}
                    {bestAct?.s&&/^\d|bb$|\$/.test(bestAct.s)&&<span style={{fontSize:13,color:"#9FB0CC",fontWeight:600}}> · {bestAct.s}</span>}
                  </div>
                  <div className="pf-sol-opt-row">
                    <div className="pf-sol-kv"><span className="k">EV</span><span className="v" style={{color:T.green}}>{bestEv>=0?"+":""}{bestEv.toFixed(2)} bb</span></div>
                    <div className="pf-sol-kv"><span className="k">FRÉQ. GTO</span><span className="v" style={{color:"#34D8FF"}}>{bestFreq}%</span></div>
                    <div className="pf-sol-kv"><span className="k">TON CHOIX</span><span className="v" style={{color:isBest?T.green:T.red}}>{spot.acts[answered]?.l}</span></div>
                    {!isBest&&<div className="pf-sol-kv"><span className="k">EV PERDUE</span><span className="v" style={{color:T.red}}>{evDiff.toFixed(2)} bb</span></div>}
                  </div>
                </div>

                {/* ── FRÉQUENCES PAR ACTION ── */}
                <div className="pf-sol-sec-title">📊 FRÉQUENCES GTO</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:4}}>
                  {spot.acts.map((a,i)=>{
                    const freq=spot.freq[a.id]||0;
                    const ev=spot.ev[a.id]||0;
                    const isc=i===spot.ok,isa=i===answered;
                    const col=accentCols[i%accentCols.length];
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 11px",borderRadius:10,background:isc?"rgba(16,216,122,.07)":isa?"rgba(255,69,96,.06)":"#071B44",border:`1px solid ${isc?"rgba(16,216,122,.35)":isa?"rgba(255,69,96,.3)":"#152D6E"}`}}>
                        <span style={{width:62,fontSize:11,fontFamily:T.stats,fontWeight:700,color:isc?T.green:isa?T.red:T.text2,flexShrink:0}}>{isc?"✓ ":isa?"✗ ":""}{a.l}</span>
                        <div style={{flex:1,height:7,background:"rgba(255,255,255,.05)",borderRadius:4,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${freq}%`,background:col,borderRadius:4,transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>
                        </div>
                        <span style={{width:34,textAlign:"right",fontSize:11,fontFamily:T.mono,fontWeight:700,color:isc?T.green:T.text3}}>{freq}%</span>
                        <span style={{width:48,textAlign:"right",fontSize:10,fontFamily:T.mono,color:ev>=0?T.green:T.red,flexShrink:0}}>{ev>=0?"+":""}{ev.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Barre fréquence globale */}
                <div style={{display:"flex",height:7,borderRadius:4,overflow:"hidden",margin:"2px 1px 4px"}}>
                  {spot.acts.map((a,i)=>{const freq=spot.freq[a.id]||0;return freq>0?<div key={i} style={{flex:freq,background:accentCols[i%accentCols.length],opacity:.75}}/>:null;})}
                </div>

                {/* ── EXPLICATION ── */}
                <div className="pf-sol-sec-title">🧠 EXPLICATION</div>
                <div style={{padding:"11px 13px",borderRadius:12,background:isBest?"rgba(16,216,122,.06)":"rgba(255,69,96,.05)",border:`1px solid ${isBest?"rgba(16,216,122,.25)":"rgba(255,69,96,.22)"}`,fontFamily:"'Inter',sans-serif",fontSize:11.5,color:"#C9D4E8",lineHeight:1.6}}>
                  {spot.expl}
                </div>

                {/* ── ARBRE SIMPLIFIÉ ── */}
                {spot.detail?.length>0&&(
                  <>
                    <div className="pf-sol-sec-title">🌳 MEILLEURE LIGNE — {spot.best}</div>
                    <div className="pf-sol-tree">
                      {spot.detail.map((d,i)=>(
                        <div key={i} className="pf-sol-tree-row">
                          <span className="pf-sol-tree-ico">{d.i}</span>
                          <span className="pf-sol-tree-txt">{d.t.replace(/<[^>]*>/g,"")}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* ── LEAKS ── */}
                {spot.leaks?.length>0&&(
                  <>
                    <div className="pf-sol-sec-title" style={{color:"#FF4560"}}>⚠ LEAKS FRÉQUENTS</div>
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {spot.leaks.map((l,i)=>(
                        <div key={i} style={{padding:"8px 11px",borderRadius:10,background:"rgba(255,69,96,.05)",border:"1px solid rgba(255,69,96,.18)",fontFamily:"'Inter',sans-serif",fontSize:11,color:"#E8B4BC",lineHeight:1.5}}>• {l}</div>
                      ))}
                    </div>
                  </>
                )}

                {/* ── RÉACTION VILAIN ── */}
                {vact&&(
                  <>
                    <div className="pf-sol-sec-title" style={{color:"#c090ff"}}>🎭 RÉACTION DU VILAIN</div>
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderRadius:11,background:`${vact.color}0A`,border:`1px solid ${vact.color}30`}}>
                      <span style={{fontSize:10,fontWeight:700,color:"#9FB0CC",fontFamily:T.stats}}>{spot.vpos} · {spot.vtype}</span>
                      <span style={{padding:"2px 9px",borderRadius:14,background:`${vact.color}18`,border:`1px solid ${vact.color}44`,fontSize:11,fontWeight:700,color:vact.color}}>{vact.label}</span>
                      {vact.amount>0&&<span style={{fontSize:10,color:T.text4,fontFamily:T.mono}}>→ {fmt(vact.amount)}</span>}
                    </div>
                  </>
                )}

                {/* ── RANGE OPTIMALE ── */}
                <div className="pf-sol-sec-title" style={{color:"#FFC247"}}>🃏 RANGE {spot.hpos} — {bestAct?.l||"Optimal"}</div>
                <RangeGrid pos={spot.hpos} action={bestAct?.id?.toLowerCase()||"open"} stackBB={parseFloat(spot.stack)||100} label={`RANGE ${spot.hpos} — ${bestAct?.l||"Optimal"}`}/>
              </>
            )}
          </div>
          {/* Footer : rejouer + suivante */}
          <div className="pf-solfull-foot">
            <button className="gto-btn-secondary" style={{padding:"12px 16px",fontSize:15}} title="Rejouer ce spot" onClick={resetSpot}>↺</button>
            <button className="gto-next-btn" style={{flex:1}} disabled={nextBusy} onClick={()=>{vibrate(VIB.next);setSolOpen(false);if(numTables===1)callNext();}}>
              {numTables===1?`${nextLabel} ▶`:"✓ Fermer"}
            </button>
          </div>
        </div>
      </>
    );
  }

  /* ══════════════════════════════════════════════════
     MODE 1 TABLE — layout immersif style GTO Wizard
  ══════════════════════════════════════════════════ */
  // ── Helpers de rendu (définis inconditionnellement : le panneau droit 1T est
  //    réutilisé tel quel par les tables multi via portal — cf. renderRightPanel) ──
    // Positions des sièges autour de la table (% du conteneur externe)
    // Positions recalibrées : HJ/CO poussés à y:12 pour dégager le HUD (+9% vs avant)
    // Positions recalibrées avec safe-area : sièges du haut descendus (y:19) pour que
    // l'avatar + badge « À toi de jouer » des Hero CO/HJ ne soient jamais rognés en haut.
    const seats1T=trainingLayout.seats;
    const errorStyle=errorFlash?{boxShadow:"inset 0 0 60px rgba(255,69,96,.35),0 0 80px rgba(255,69,96,.25)"}:{};
    const heroGlow=phase==="hero"?{boxShadow:"inset 0 0 80px rgba(255,194,71,.08),0 0 60px rgba(0,0,0,.8),0 0 0 2px #0a1a0e"}:{};

    // ── RENDU EV RÉSULTATS — style GTO Wizard ──
    const renderEvResults=()=>{
      const bestEv=spot.ev[spot.acts[spot.ok]?.id]||0;
      const myEv=spot.ev[spot.acts[answered]?.id]||0;
      const evDiff=myEv-bestEv;
      const isBest=answered===spot.ok;
      const bestFreq=spot.freq[spot.acts[spot.ok]?.id]||0;
      const qualityLabel=isBest?"Best Move ✦":evDiff>=-0.3?"Correct ✓":evDiff>=-1?"Imprécision ⚠":evDiff>=-3?"Erreur ✗":"Blunder 💥";
      const qualityCls=isBest?"gto-best":evDiff>=-0.3?"gto-correct":evDiff>=-1?"gto-inaccuracy":evDiff>=-3?"gto-wrong":"gto-blunder";
      const accentCols=["#FF4560","#10D87A","#1F8BFF","#FFC247","#9B5CFF"];

      /* ══ MODE SOLUTION MASQUÉE ══
         → Feedback minimal : ton choix + bouton suivant. AUCUNE info GTO.  */
      if(!showSol){
        return(
          <div style={{
            background:"linear-gradient(180deg,#040B1F,#030D2A)",
            borderTop:"1px solid #152D6E",
            flexShrink:0,animation:"slideUp .3s cubic-bezier(.22,.68,.36,1) forwards"
          }}>
            {/* Verdict coloré simple */}
            <div style={{
              padding:"10px 16px 8px",
              background:"linear-gradient(90deg,#071B44,#040B1F)",
              borderBottom:"1px solid #152D6E",
              display:"flex",alignItems:"center",gap:10,
            }}>
              <span className={`gto-quality ${qualityCls}`}>{qualityLabel}</span>
              <span style={{fontFamily:T.stats,fontSize:11,color:T.text3}}>
                Tu as joué : <span style={{color:isBest?T.green:T.red,fontWeight:700}}>{spot.acts[answered]?.l}</span>
              </span>
              {/* Indicateur visuel discret sans révéler GTO */}
              <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
                <div style={{
                  width:28,height:28,borderRadius:"50%",
                  background:isBest?"rgba(16,216,122,.15)":"rgba(255,69,96,.12)",
                  border:`2px solid ${isBest?"rgba(16,216,122,.5)":"rgba(255,69,96,.4)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                  boxShadow:`0 0 12px ${isBest?"rgba(16,216,122,.3)":"rgba(255,69,96,.25)"}`,
                }}>{isBest?"✓":"✗"}</div>
              </span>
            </div>
            {/* Next zone uniquement */}
            <div className="gto-next-zone">
              {numTables===1
                ?<button className="gto-next-btn" disabled={nextBusy} onClick={callNext}>{nextLabel} ▶</button>
                :<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.green,padding:"6px 14px",background:"rgba(16,216,122,.1)",borderRadius:6,border:"1px solid rgba(16,216,122,.25)"}}>✓ Répondu — attente des autres tables</span>
              }
              <button className="gto-btn-secondary" style={{padding:"12px 14px",fontSize:16}} title="Rejouer ce spot"
                onClick={resetSpot}>↺</button>
            </div>
          </div>
        );
      }

      /* ══ MODE SOLUTION VISIBLE ══
         → Panel complet avec max-height pour ne pas écraser la table. */
      return(
        <div className="gto-panel" style={{
          overflowY:"auto",
          flex:"0 0 auto",
          maxHeight:"52vh",  /* ← clé : limite la hauteur pour préserver la table */
        }}>
          {/* ── En-tête verdict ── */}
          <div className="gto-panel-header">
            <span className={`gto-quality ${qualityCls}`}>{qualityLabel}</span>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              {!isBest&&(
                <span style={{display:"flex",alignItems:"center",gap:5,fontFamily:T.mono,fontSize:11}}>
                  <span style={{color:T.text4}}>EV loss</span>
                  <span style={{color:T.red,fontWeight:700}}>{evDiff.toFixed(2)}bb</span>
                </span>
              )}
              {isBest&&(
                <span style={{display:"flex",alignItems:"center",gap:5,fontFamily:T.mono,fontSize:11}}>
                  <span style={{color:T.text4}}>Fréquence GTO</span>
                  <span style={{color:T.green,fontWeight:700}}>{bestFreq}%</span>
                </span>
              )}
              <span style={{display:"flex",alignItems:"center",gap:5,fontFamily:T.mono,fontSize:11}}>
                <span style={{color:T.text4}}>Ton choix</span>
                <span style={{color:isBest?T.green:T.red,fontWeight:700}}>{spot.acts[answered]?.l}</span>
              </span>
            </div>
            {/* Barre fréquence globale */}
            <div className="gto-freq-summary" style={{width:"100%",marginTop:4}}>
              {spot.acts.map((a,i)=>{
                const freq=spot.freq[a.id]||0;
                return freq>0?<div key={i} className="gto-freq-seg" style={{flex:freq,background:accentCols[i],opacity:.7}}/>:null;
              })}
            </div>
          </div>

          {/* ── Grille EV par action ── */}
          <div className="gto-ev-grid" style={{gridTemplateColumns:`repeat(${Math.min(spot.acts.length,2)},1fr)`}}>
            {spot.acts.map((a,i)=>{
              const freq=spot.freq[a.id]||0, ev=spot.ev[a.id]||0;
              const isc=i===spot.ok, isa=i===answered;
              const cardCls=isc&&isa?"gto-ev-card best chosen correct":isc?"gto-ev-card best":isa?"gto-ev-card chosen":"gto-ev-card neutral";
              return(
                <div key={i} className={cardCls}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontFamily:T.brand,fontSize:13,fontWeight:700,color:isc?T.green:isa?T.red:T.text3}}>{a.l}</span>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {isc&&!isa&&<span style={{fontSize:9,padding:"1px 7px",borderRadius:20,background:"rgba(16,216,122,.15)",color:T.green,fontFamily:T.stats,fontWeight:700}}>GTO</span>}
                      {isa&&!isc&&<span style={{fontSize:9,padding:"1px 7px",borderRadius:20,background:"rgba(255,69,96,.12)",color:T.red,fontFamily:T.stats,fontWeight:700}}>TON CHOIX</span>}
                      {isa&&isc&&<span style={{fontSize:9,padding:"1px 7px",borderRadius:20,background:"rgba(16,216,122,.15)",color:T.green,fontFamily:T.stats,fontWeight:700}}>✓ OPTIMAL</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                    <span style={{fontFamily:T.mono,fontSize:16,fontWeight:700,color:isc?T.green:isa?T.red:T.text2}}>
                      {ev>=0?"+":""}{ev.toFixed(2)}<span style={{fontSize:9,opacity:.6}}> EV</span>
                    </span>
                    <span style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:freq>40?T.green:freq>15?T.amber:T.text4}}>{freq}%</span>
                  </div>
                  <div className="gto-freq-bar">
                    <div className="gto-freq-fill" style={{width:freq+"%",background:isc?T.green:isa?T.red:"rgba(31,139,255,.4)"}}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Insight GTO + Analyse exploit ── */}
          {(()=>{const cv=coachView(coachLevel);return(
          <div className="gto-insight">
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
              <div className="gto-insight-title" style={{marginBottom:0}}>💡 ANALYSE DU SPOT</div>
              {trainerMode==="exploit"&&(
                <span style={{padding:"1px 7px",borderRadius:20,background:"rgba(255,138,61,.12)",border:"1px solid rgba(255,138,61,.3)",fontFamily:"'Space Grotesk',sans-serif",fontSize:8,fontWeight:700,color:"#FF8A3D"}}>
                  🦈 Mode Exploit
                </span>
              )}
              {cv.badge&&<span style={{padding:"1px 7px",borderRadius:20,background:`${cv.col}18`,border:`1px solid ${cv.col}44`,fontFamily:"'Space Grotesk',sans-serif",fontSize:8,fontWeight:700,color:cv.col}}>🧠 Coach {cv.badge}</span>}
            </div>
            {cv.verbose&&(
              <div style={{margin:"0 0 6px",padding:"6px 9px",borderRadius:7,background:"rgba(16,216,122,.07)",border:"1px solid rgba(16,216,122,.2)",fontFamily:"'Inter',sans-serif",fontSize:10,color:"#10D87A",lineHeight:1.6}}>
                🔰 En clair : la meilleure action ici est <strong>« {spot.best} »</strong>. Lis l'explication ci-dessous pour comprendre pourquoi, sans te presser.
              </div>
            )}
            <div className="gto-insight-text">{cv.concise?firstSentence(spot.expl):spot.expl}</div>
          </div>
          );})()}

          {spot.aiMeta&&(()=>{const ai=describeCoachSpot(spot);return(
            <div style={{margin:"0 14px 10px",padding:"10px 13px",borderRadius:10,border:"1px solid rgba(155,92,255,.32)",background:"linear-gradient(135deg,rgba(155,92,255,.12),rgba(31,139,255,.06))"}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,fontWeight:800,color:"#C8A8FF",letterSpacing:".08em",marginBottom:5}}>MOTEUR IA EVOLUTIF</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:T.text2,lineHeight:1.55,marginBottom:5}}>{ai.why}</div>
              {ai.adaptation&&<div style={{fontFamily:"'Inter',sans-serif",fontSize:9.5,color:T.gold,lineHeight:1.5,marginBottom:8}}>{ai.adaptation}</div>}
              {ai.prompts?.length>0&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {ai.prompts.slice(0,4).map(p=>(
                    <button key={p} className="btn btns" style={{fontSize:9,padding:"5px 9px",borderColor:"rgba(155,92,255,.35)",color:"#C8A8FF"}}
                      onClick={()=>setShowToast(`Coach AI - ${p}`)}>{p}</button>
                  ))}
                </div>
              )}
            </div>
          );})()}

          {/* ── Feedback ICM / Push-Fold (si applicable) ── */}
          <PushFoldFeedbackCard spot={spot}/>

          {/* ── RÉACTION DU VILAIN ── */}
          {vact&&(()=>{
            const isFold=vact.action==="FOLD";
            const isCheck=vact.action==="CHECK";
            const isWin=vact.action==="WIN";
            const stackNum=parseFloat(spot.stack)||100;
            const termMsg=isFold
              ?`Spot termine : ${spot.vpos} fold -> vous remportez le pot de ${currentPotBb}bb. Pas de decision ${spot.street==="Preflop"?"flop":spot.street==="Flop"?"turn":spot.street==="Turn"?"river":"suivante"}.`
              :isWin?`Spot terminé : ${spot.vpos} gagne le pot (votre main est battue).`
              :null;
            return(
              <div style={{margin:"0 14px 10px",borderRadius:10,border:`1px solid ${vact.color}33`,background:`${vact.color}08`,overflow:"hidden"}}>
                <div style={{padding:"8px 13px",borderBottom:`1px solid ${vact.color}1a`,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:9,fontWeight:700,color:vact.color,letterSpacing:".08em"}}>🎭 RÉACTION {spot.vpos} ({spot.vtype})</span>
                  <span style={{padding:"1px 8px",borderRadius:20,background:`${vact.color}18`,border:`1px solid ${vact.color}44`,fontSize:9,fontWeight:700,color:vact.color}}>{vact.label}</span>
                  {vact.amount>0&&<span style={{fontSize:9,color:"#9FB0CC",fontFamily:"'JetBrains Mono',monospace"}}>→ {vact.amount}bb</span>}
                </div>
                <div style={{padding:"8px 13px"}}>
                  {termMsg?(
                    <div style={{display:"flex",gap:8,alignItems:"flex-start",padding:"6px 8px",background:"rgba(255,138,0,.06)",borderRadius:7,border:"1px solid rgba(255,138,0,.2)"}}>
                      <span style={{fontSize:13,flexShrink:0}}>⚡</span>
                      <span style={{fontSize:10,color:"#FFC247",fontFamily:"'Inter',sans-serif",lineHeight:1.6}}>{termMsg}</span>
                    </div>
                  ):(
                    <span style={{fontSize:10,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",lineHeight:1.6}}>
                      {isCheck?"Le vilain passe. La décision appartient maintenant au Hero pour la suite.":
                       vact.action==="CALL"?`${spot.vpos} suit. Le pot monte a ${currentPotBb}bb. Hero est IP.`:
                       vact.action==="RAISE"||vact.action==="3BET"?`${spot.vpos} relance à ${vact.amount||"?"}bb. Le Hero doit décider de call/fold/4-bet.`:
                       vact.action==="ALLIN"?`${spot.vpos} shouve all-in. Hero doit call ou fold pour ${stackNum}bb.`:
                       `${spot.vpos} ${vact.label.toLowerCase()}.`}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Explication Exploit si mode Exploit actif ── */}
          {trainerMode==="exploit"&&(()=>{
            const profile=VILLAIN_PROFILES[spot.vtype]||VILLAIN_PROFILES["Reg"];
            const pl=PLATFORM_PROFILES[platform];
            return(
              <div style={{
                margin:"0 14px 10px",borderRadius:12,overflow:"hidden",
                border:"1px solid rgba(255,138,61,.25)",
                background:"linear-gradient(135deg,rgba(255,138,61,.07),rgba(255,138,61,.03))",
              }}>
                {/* Header */}
                <div style={{padding:"8px 14px",borderBottom:"1px solid rgba(255,138,61,.15)",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:9.5,fontWeight:700,color:"#FF8A3D",letterSpacing:".08em"}}>
                    🦈 ADAPTATION EXPLOIT
                  </span>
                  <span style={{padding:"1px 8px",borderRadius:20,background:`${profile.col}15`,border:`1px solid ${profile.col}33`,fontFamily:"'Inter',sans-serif",fontSize:8,fontWeight:700,color:profile.col}}>
                    {spot.vtype}
                  </span>
                  {pl&&<span style={{marginLeft:"auto",fontFamily:"'Inter',sans-serif",fontSize:8,color:"#6F81A8"}}>{pl.flag} {pl.name}</span>}
                </div>
                {/* Contenu */}
                <div style={{padding:"10px 14px"}}>
                  {/* Stats profil */}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                    {[
                      {l:"VPIP",v:profile.vpip+"%",c:"#1F8BFF"},
                      {l:"Fold/Cbet",v:profile.foldToCbet+"%",c:"#FF4560"},
                      {l:"Bluff",v:profile.bluffFreq+"%",c:"#9B5CFF"},
                      {l:"Agg",v:profile.agg.toFixed(1),c:"#FFC247"},
                    ].map(({l,v,c})=>(
                      <div key={l} style={{padding:"4px 8px",borderRadius:7,background:"rgba(26,58,128,.3)",border:"1px solid #1A3A80",textAlign:"center"}}>
                        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,color:c}}>{v}</div>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:7.5,color:"#6F81A8"}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {/* Conseil exploit */}
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:"#D6E2F5",lineHeight:1.7,marginBottom:8}}>
                    <span style={{color:"#FF8A3D",fontWeight:700}}>Face à {spot.vtype} :</span> {profile.exploitTip}
                  </div>
                  {/* Déviation GTO */}
                  <div style={{padding:"6px 10px",background:"rgba(155,92,255,.07)",borderRadius:7,border:"1px solid rgba(155,92,255,.15)",fontFamily:"'Inter',sans-serif",fontSize:10,color:"#9FB0CC",lineHeight:1.6}}>
                    <span style={{color:"#9B5CFF",fontWeight:700}}>Déviation GTO : </span>{profile.gtoDeviation}
                  </div>
                  {/* Leaks */}
                  {profile.leaks&&(
                    <div style={{marginTop:8}}>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:8.5,color:"#FF4560",letterSpacing:".08em",fontWeight:700,marginBottom:4}}>⚠ LEAKS EXPLOITABLES</div>
                      {profile.leaks.map((l,i)=>(
                        <div key={i} style={{fontFamily:"'Inter',sans-serif",fontSize:9.5,color:"#FF8090",marginBottom:2}}>• {l}</div>
                      ))}
                    </div>
                  )}
                  {/* Note population */}
                  {pl&&(
                    <div style={{marginTop:8,padding:"5px 9px",background:"rgba(52,216,255,.05)",borderRadius:6,border:"1px solid rgba(52,216,255,.15)",fontFamily:"'Inter',sans-serif",fontSize:9,color:"#34D8FF",lineHeight:1.5}}>
                      🌐 {pl.note}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          {spot.detail?.length>0&&(()=>{const cv=coachView(coachLevel);return(
            <div style={{margin:"0 14px 10px",background:"#071B44",borderRadius:10,border:"1px solid #1A3A80",overflow:"hidden"}}>
              <div style={{padding:"7px 13px",background:"rgba(255,194,71,.06)",borderBottom:"1px solid #152D6E",fontFamily:T.brand,fontSize:9.5,color:T.gold,letterSpacing:".08em"}}>🏆 MEILLEURE LIGNE : {spot.best}</div>
              <div style={{padding:"10px 13px"}}>
                {spot.detail.slice(0,cv.detailMax).map((d,i)=>(
                  <div key={i} style={{display:"flex",gap:9,marginBottom:8,alignItems:"flex-start"}}>
                    <span style={{fontSize:15,flexShrink:0}}>{d.i}</span>
                    <span style={{fontSize:11,color:T.text2,fontFamily:T.stats,lineHeight:1.7}}
                      dangerouslySetInnerHTML={{__html:d.t}}/>
                  </div>
                ))}
                {cv.detailMax<spot.detail.length&&<div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic",marginBottom:4}}>Mode concis ({coachLevel}) — détails resserrés. Passe en Débutant/Standard pour l'explication complète.</div>}
                {cv.showLeaks&&spot.leaks?.length>0&&(
                  <div style={{marginTop:8,padding:"7px 10px",background:"rgba(255,69,96,.06)",borderRadius:7,border:"1px solid rgba(255,69,96,.15)"}}>
                    <div style={{fontSize:8.5,color:T.red,fontFamily:T.stats,fontWeight:700,letterSpacing:".1em",marginBottom:4}}>⚠ LEAKS COMMUNS</div>
                    {spot.leaks.map((l,i)=><div key={i} style={{fontSize:10,color:"#FF8090",fontFamily:T.stats}}>• {l}</div>)}
                  </div>
                )}
              </div>
            </div>
          );})()}
          <div style={{padding:"0 14px 10px"}}>
            <RangeGrid
              pos={spot.hpos}
              action={spot.acts[spot.ok]?.id?.toLowerCase()||"open"}
              stackBB={parseFloat(spot.stack)||100}
              label={`RANGE ${spot.hpos} — ${spot.acts[spot.ok]?.l||"Optimal"} · ${spot.stack}`}
              spot={spot}
              showToggle={true}
            />
          </div>

          {/* ── Bouton Solver ── */}
          <div style={{margin:"0 14px 10px",display:"flex",gap:8,alignItems:"center",padding:"10px 12px",background:"rgba(52,216,255,.05)",border:"1px solid rgba(52,216,255,.15)",borderRadius:10}}>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,fontWeight:700,color:"#34D8FF",marginBottom:2}}>🦈 Travailler dans le Solver</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:9,color:"#6F81A8"}}>{spot.hpos} vs {spot.vpos} · {spot.stack} · {spot.street}</div>
            </div>
            {onGoSolver&&(
              <button onClick={()=>onGoSolver&&onGoSolver({heroPos:spot.hpos,vsPos:spot.vpos,stack:parseFloat(spot.stack)||100,street:spot.street,acts:spot.acts})}
                style={{padding:"7px 14px",borderRadius:8,border:"1px solid rgba(52,216,255,.4)",background:"rgba(52,216,255,.12)",color:"#34D8FF",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"'Inter',sans-serif",transition:"all .15s",whiteSpace:"nowrap"}}>
                Ouvrir le Solver →
              </button>
            )}
          </div>

          {/* ── Next zone (collante en bas du panel scrollable) ── */}
          <div className="gto-next-zone" style={{position:"sticky",bottom:0,background:"#030D2A"}}>
            {numTables===1
              ?<button className="gto-next-btn" disabled={nextBusy} onClick={callNext}>{nextLabel} ▶</button>
              :<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.green,padding:"6px 14px",background:"rgba(16,216,122,.1)",borderRadius:6,border:"1px solid rgba(16,216,122,.25)"}}>✓ Répondu — attente des autres tables</span>
            }
            {spot.hand?.length>=2&&(
              <button className="gto-btn-secondary" onClick={startFullHand} title="River">▶ River</button>
            )}
            <button className="gto-btn-secondary" style={{padding:"12px 14px",fontSize:16}} title="Rejouer"
              onClick={resetSpot}>↺</button>
          </div>

        </div>
      );
    };

    /* ── ZONES D'ACTION partagées desktop (colonne droite) + mobile (t1-mob) ── */
    const renderHeroReply=()=>(
      <div style={{flexShrink:0,background:"linear-gradient(180deg,rgba(255,194,71,.06),#040B1F)",borderTop:"2px solid rgba(255,194,71,.35)",padding:"8px 10px 10px"}} className="mtr-actions">
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
          <div style={{padding:"2px 9px",borderRadius:20,background:"rgba(255,194,71,.12)",border:"1px solid rgba(255,194,71,.4)",fontFamily:"'Space Grotesk',sans-serif",fontSize:8.5,fontWeight:800,color:T.gold}}>🎮 TON ACTION</div>
          <div style={{padding:"2px 8px",borderRadius:20,background:`${vact.color}14`,border:`1px solid ${vact.color}44`,fontFamily:"'Inter',sans-serif",fontSize:8.5,fontWeight:700,color:vact.color}}>{spot.vpos} {vact.label}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {[{id:"FOLD",l:"Fold",s:"Abandon",cls:"FOLD"},{id:"CALL",l:"Call",s:vact.amount?fmt(vact.amount):"suivre",cls:"CALL"},{id:"RAISE",l:"Raise",s:"2.5×",cls:"RAISE"}].map(btn=>(
            <button key={btn.id} className={`gto-btn gto-btn-${btn.cls}`} onClick={()=>handleHeroReply(btn.id)}>
              <div className="gto-btn-inner"><span className="gto-btn-label">{btn.l}</span><span className="gto-btn-sizing">{btn.s}</span></div>
            </button>
          ))}
        </div>
      </div>
    );
    const renderActionZone=()=>{
      const SIZING_PRESETS=[{l:"MIN",mult:.5},{l:"2.5×",mult:2.5},{l:"3×",mult:3},{l:"3.5×",mult:3.5},{l:"4×",mult:4},{l:"ALL-IN",mult:999}];
      const sp=SIZING_PRESETS[raiseSzIdx]||SIZING_PRESETS[2];
      const bbSize=parseFloat(spot.stack)||100;
      const raiseAmt=sp.mult===999?bbSize:customBB!==null?customBB:Math.round(currentPotBb*sp.mult*10)/10;
      const neutralHints={FOLD:"Ne pas jouer",CALL:"Suivre",CHECK:"Passer",RAISE:"Relancer",BET33:"33% pot",BET50:"50% pot",BET75:"75% pot",BET100:"Pot",ALLIN:"Tapis","3BET":"3-Bet","4BET":"4-Bet","5BET":"5-Bet"};
      return(
        <div className="mtr-actions" style={{flexShrink:0,background:"linear-gradient(180deg,#040B22,#030912)",borderTop:"1px solid rgba(255,194,71,.18)",padding:"8px 10px 10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
            <div style={{padding:"2px 9px",borderRadius:20,background:"rgba(255,194,71,.1)",border:"1px solid rgba(255,194,71,.3)",fontFamily:"'Space Grotesk',sans-serif",fontSize:8,fontWeight:800,color:T.gold}}>🎮 {spot.hpos} vs {spot.vpos}</div>
            {spotCtx.facing
              ?<span style={{fontSize:8.5,fontFamily:T.stats,color:"#c090ff",fontWeight:700}}>Face à {spotCtx.facing.label} {fmt(spotCtx.facing.amount)}{spot.toCall>0&&<span style={{color:T.amber}}> · à payer {fmt(spot.toCall)}</span>}</span>
              :<span style={{fontSize:8.5,fontFamily:T.stats,color:T.green,fontWeight:700}}>{/^pre/i.test(spot.street||"")?"Premier à parler — ouvre ou fold":`${spot.vpos} check — à toi`}</span>}
          </div>
          <div style={{display:"flex",gap:5,marginBottom:7}}>
            {spot.acts.map((a,i)=>{
              const isRaiseBtn=["RAISE","3BET","4BET","5BET","BET33","BET50","BET75","BET100","ALLIN"].includes(a.id);
              const sIsAmount=/^\d|bb$|\$/.test(a.s||"");
              const dynSizing=isRaiseBtn?(sp.mult===999?"Tapis":fmt(raiseAmt)):sIsAmount?a.s:"";
              return(
                <button key={i} className={`gto-btn gto-btn-${a.id}${errorBtn===i?" btn-error":""}`} onClick={()=>handleHeroAct(i)} style={{flex:1,minWidth:0}}>
                  <div className="gto-btn-inner">
                    <span className="gto-btn-label" style={{fontSize:13}}>{a.l}</span>
                    {dynSizing&&<span className="gto-btn-sizing" style={{fontSize:10}}>{dynSizing}</span>}
                  </div>
                  <div className="gto-btn-hint" style={{fontSize:8}}>{neutralHints[a.id]||""}</div>
                </button>
              );
            })}
          </div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:5}}>
            {SIZING_PRESETS.map((s,i)=>(
              <button key={i} className={`sizing-btn${i===raiseSzIdx&&customBB===null?" sz-active":""}${s.mult===999?" sz-allin":""}`} onClick={()=>{setRaiseSzIdx(i);setCustomBB(null);}}>{s.l}</button>
            ))}
          </div>
          <div className="sizing-custom">
            <button className="sizing-step-btn" onClick={()=>{const v=customBB!==null?customBB:raiseAmt;setCustomBB(Math.max(currentPotBb,Math.round((v-.5)*2)/2));}}>−</button>
            <span style={{flex:1,textAlign:"center",fontFamily:T.mono,fontSize:11,color:customBB!==null?T.gold:T.text3,fontWeight:700}}>{customBB!==null?fmt(customBB):fmt(raiseAmt)} bb</span>
            <button className="sizing-step-btn" onClick={()=>{const v=customBB!==null?customBB:raiseAmt;setCustomBB(Math.round((v+.5)*2)/2);}}>+</button>
          </div>
          {/* ── Indice raccourcis clavier (1T) — rythme drill type GTO Wizard ── */}
          {numTables===1&&(
            <div className="mtr-kbd-hints" style={{display:"flex",justifyContent:"center",gap:7,marginTop:7,flexWrap:"wrap",fontFamily:T.stats,fontSize:7.5,color:T.text4}}>
              {[["F","Fold"],["C","Call/Check"],["B","Bet"],["R","Raise"],["A","All-in"],["⏎","Suivant"]].map(([k,l])=>(
                <span key={k} style={{display:"flex",alignItems:"center",gap:3}}>
                  <kbd style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:13,height:13,padding:"0 3px",borderRadius:3,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.14)",color:T.text3,fontFamily:T.mono,fontSize:7,fontWeight:700,lineHeight:1}}>{k}</kbd>
                  <span>{l}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      );
    };
    /* Actions full-hand (flop→river) — rendues hors du panneau solution
       pour rester accessibles en mode hard ET sur mobile */
    const renderFhActions=()=>(
      <>
        {playingFull&&fhPhase==="hero"&&(
          <div className="mtr-actions" style={{flexShrink:0,padding:"8px 14px 14px",background:"linear-gradient(180deg,#040B22,#030912)",borderTop:"1px solid rgba(52,216,255,.18)"}}>
            <div style={{fontFamily:T.brand,fontSize:9,color:T.cyan,letterSpacing:".12em",marginBottom:8,textAlign:"center"}}>{fhStreet.toUpperCase()} — ACTION HERO</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
              <button className="ab ab-CHECK" style={{padding:"12px 4px"}} onClick={()=>fhHeroAct("CHECK")}>Check<span className="ab-sub">0bb</span></button>
              <button className="ab ab-CALL" style={{padding:"12px 4px"}} onClick={()=>fhHeroAct("BET")}>Bet ½<span className="ab-sub">{fmt(fhPot*.5|0)}</span></button>
              <button className="ab ab-RAISE" style={{padding:"12px 4px"}} onClick={()=>fhHeroAct("RAISE")}>PSB<span className="ab-sub">{fmt(fhPot)}</span></button>
              <button className="ab ab-FOLD" style={{padding:"12px 4px"}} onClick={()=>fhHeroAct("FOLD")}>Fold<span className="ab-sub">abandon</span></button>
            </div>
          </div>
        )}
        {playingFull&&fhPhase==="hero_facing_bet"&&fhVilAct&&(
          <div className="mtr-actions" style={{flexShrink:0,padding:"8px 14px 14px",background:"linear-gradient(180deg,#040B22,#030912)",borderTop:"1px solid rgba(155,92,255,.2)"}}>
            <div style={{fontFamily:T.brand,fontSize:9,color:T.purple,letterSpacing:".12em",marginBottom:8,textAlign:"center"}}>
              {spot.vpos} <span style={{color:fhVilAct.color,fontWeight:800}}>{fhVilAct.label}</span> — ta réponse ?
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
              <button className="ab ab-FOLD" style={{padding:"12px 4px"}} onClick={()=>fhHeroFaceBet("FOLD")}>Fold<span className="ab-sub">abandon</span></button>
              <button className="ab ab-CALL" style={{padding:"12px 4px"}} onClick={()=>fhHeroFaceBet("CALL")}>Call<span className="ab-sub">{fmt(fhVilAct.amount||Math.round(fhPot*.5))}</span></button>
              <button className="ab ab-RAISE" style={{padding:"12px 4px"}} onClick={()=>fhHeroFaceBet("RAISE")}>Raise<span className="ab-sub">2.5×</span></button>
            </div>
          </div>
        )}
        {playingFull&&fhPhase==="done"&&fhResult&&(()=>{
          const recap=fhBuildRecap(fhActs,spot,fhResult);
          return(
          <div style={{flexShrink:0,padding:"10px 14px 14px",background:"linear-gradient(180deg,#040B22,#030912)",borderTop:"1px solid rgba(52,216,255,.18)",maxHeight:"46vh",overflowY:"auto"}}>
            {/* En-tête : verdict + score main */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:8}}>
              <div style={{fontFamily:T.brand,fontSize:15,fontWeight:900,color:fhResult==="win"?T.green:T.red,textShadow:`0 0 18px ${fhResult==="win"?T.greenGlow:T.redGlow}`}}>{fhResult==="win"?"🏆 MAIN GAGNÉE":"❌ MAIN PERDUE"}</div>
              <span style={{fontFamily:T.mono,fontSize:11,fontWeight:800,color:recap.scoreCol,background:`${recap.scoreCol}1a`,border:`1px solid ${recap.scoreCol}55`,borderRadius:7,padding:"3px 9px"}}>{recap.score}/100</span>
            </div>
            {/* Analyse street par street */}
            <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text4,letterSpacing:".12em",marginBottom:6,textAlign:"center"}}>ANALYSE PAR STREET <span style={{color:T.text4,opacity:.7}}>(estimation)</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
              {recap.streets.map((st,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 9px",background:"rgba(255,255,255,.025)",border:`1px solid ${st.col}33`,borderLeft:`3px solid ${st.col}`,borderRadius:7}}>
                  <span style={{fontFamily:T.brand,fontSize:9,fontWeight:800,color:st.col,minWidth:42,letterSpacing:".06em"}}>{st.label}</span>
                  <span style={{fontFamily:T.mono,fontSize:9.5,color:T.text2,flex:1}}>{st.line}</span>
                  <span style={{fontFamily:T.stats,fontSize:8.5,fontWeight:700,color:st.col,whiteSpace:"nowrap"}}>{st.verdict}</span>
                </div>
              ))}
            </div>
            {/* Synthèse : meilleure / pire décision */}
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",justifyContent:"center"}}>
              {recap.best&&<span style={{fontFamily:T.stats,fontSize:9,color:T.green,background:"rgba(16,216,122,.1)",border:"1px solid rgba(16,216,122,.3)",borderRadius:6,padding:"3px 8px"}}>✦ Meilleure : {recap.best}</span>}
              {recap.worst&&<span style={{fontFamily:T.stats,fontSize:9,color:T.red,background:"rgba(255,69,96,.1)",border:"1px solid rgba(255,69,96,.3)",borderRadius:6,padding:"3px 8px"}}>⚠ À revoir : {recap.worst}</span>}
              <span style={{fontFamily:T.stats,fontSize:9,color:T.gold,background:"rgba(255,194,71,.08)",border:"1px solid rgba(255,194,71,.25)",borderRadius:6,padding:"3px 8px"}}>Pot final {fmt(roundBb(fhPot))}</span>
            </div>
            <div style={{display:"flex",gap:7,justifyContent:"center"}}>
              <button className="btn btng" disabled={nextBusy} onClick={()=>{setPlayingFull(false);callNext();}}>{nextLabel} ►</button>
              <button className="btn btns" onClick={startFullHand}>↺ Rejouer</button>
            </div>
          </div>
          );
        })()}
      </>
    );

    /* ══ TIMELINE — bas du bandeau droit (maquette v2). Progression de session
       + navigation. Ne chevauche jamais les actions (désormais sous la table). ══ */
    const renderTimeline=()=>{
      const total=spotTotal||20;
      const done=Math.min(spotIndex+(answered!==null?1:0),total);
      const tbtn={width:24,height:24,borderRadius:7,cursor:"pointer",border:"1px solid #16305f",background:"#081527",color:"#cfe0ff",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"};
      return(
        <div className="mtr-timeline-panel" style={{flexShrink:0,borderTop:"1px solid #152D6E",background:"linear-gradient(180deg,#040B22,#030912)",padding:"5px 10px 6px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:8,fontWeight:800,letterSpacing:".12em",color:"#54b8ff"}}>TIMELINE</span>
            <div style={{flex:1,height:4,borderRadius:20,background:"#0c1e3e",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${total?done/total*100:0}%`,background:"linear-gradient(90deg,#1F8BFF,#34D8FF)",borderRadius:20,boxShadow:"0 0 8px rgba(52,180,255,.5)",transition:"width .3s"}}/>
            </div>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.text3,minWidth:30,textAlign:"right"}}>{done}/{total}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"center"}}>
            <button style={{...tbtn,opacity:.4,cursor:"not-allowed"}} disabled title="Début">⏮</button>
            <button style={{...tbtn,opacity:.4,cursor:"not-allowed"}} disabled title="Précédent">⏪</button>
            <button style={{...tbtn,width:28,height:28,fontSize:12,background:"linear-gradient(135deg,#1F8BFF,#7c3cff)",border:"none",color:"#fff",boxShadow:"0 0 12px rgba(80,120,255,.34)",opacity:nextBusy?.65:1,cursor:nextBusy?"wait":"pointer"}} disabled={nextBusy} onClick={()=>{if(phase==="done")callNext();}} title={phase==="done"?nextLabel:"En cours"}>▶</button>
            <button style={{...tbtn,opacity:nextBusy?.65:1,cursor:nextBusy?"wait":"pointer"}} disabled={nextBusy} onClick={callNext} title={nextLabel}>⏩</button>
            <button style={{...tbtn,opacity:(isLast||nextBusy)?.4:1,cursor:(isLast||nextBusy)?"not-allowed":"pointer"}} disabled={isLast||nextBusy} onClick={callNext} title="Passer">⏭</button>
            <span style={{marginLeft:5,fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:T.text4,border:"1px solid #16305f",borderRadius:5,padding:"2px 6px"}}>1×</span>
            <button style={{...tbtn,marginLeft:1}} onClick={onFocusToggle} title="Focus / plein écran">⛶</button>
          </div>
        </div>
      );
    };

      const renderRightPanel=()=>(
        <div className="t1-right" style={{flex:"0 0 32%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#030D2A,#020810)",borderLeft:"1px solid #152D6E",overflow:"hidden",minWidth:0}}>

          {/* HUD compact */}
          <div style={{flexShrink:0,background:"linear-gradient(90deg,#040B1F,#030D2A)",borderBottom:"1px solid #152D6E",padding:"5px 10px",display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
            <span className="hud-chip hud-pos" style={{fontSize:8.5,padding:"2px 7px"}}>📍 {spot.hpos}</span>
            <span className="hud-chip hud-stack" style={{fontSize:8.5,padding:"2px 7px"}}>📊 {spot.stack}</span>
            <span className="hud-chip hud-spr" style={{fontSize:8.5,padding:"2px 7px"}}>SPR {spr}</span>
            {potOddsStr&&<span className="hud-chip hud-odds" style={{fontSize:8.5,padding:"2px 7px"}}>Odds {potOddsStr}</span>}
            <span style={{marginLeft:"auto",padding:"2px 7px",borderRadius:5,fontFamily:"'Space Grotesk',sans-serif",fontSize:8,fontWeight:700,background:trainerMode==="gto"?"rgba(52,216,255,.08)":"rgba(255,138,61,.08)",color:trainerMode==="gto"?"#34D8FF":"#FF8A3D",border:`1px solid ${trainerMode==="gto"?"rgba(52,216,255,.2)":"rgba(255,138,61,.2)"}`}}>{trainerMode==="gto"?"GTO":PLATFORM_PROFILES[platform]?.flag||"🦈"}</span>
            <div className="hud-diff" style={{fontSize:8,padding:"1px 6px"}}><span style={{width:5,height:5,borderRadius:"50%",background:diffCol,flexShrink:0}}/>{diffLabel}</div>
          </div>

          {/* ── ZONE SCROLLABLE ── */}
          <div style={{flex:1,overflowY:"auto",overflowX:"hidden",display:"flex",flexDirection:"column",minHeight:0}}>

            {/* VILLAIN THINKING dans la colonne droite */}
            {phase==="villain_thinking"&&(()=>{
              const vp=VILLAIN_PROFILES[spot.vtype];
              return(
                <div style={{flexShrink:0,background:"linear-gradient(135deg,rgba(155,92,255,.1),rgba(155,92,255,.03))",borderBottom:"1px solid rgba(155,92,255,.2)",padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                    <div style={{width:38,height:38,borderRadius:"50%",flexShrink:0,background:vp?`${vp.col}18`:"rgba(155,92,255,.15)",border:`2px solid ${vp?vp.col+"66":"rgba(155,92,255,.5)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:`0 0 16px ${vp?vp.col+"44":"rgba(155,92,255,.3)"}`,animation:"seatVilActive 1.5s ease-in-out infinite"}}>🤔</div>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,fontWeight:800,color:vp?vp.col:"#9B5CFF",marginBottom:2}}>⚡ {spot.vpos} · {spot.vtype}</div>
                      <div style={{fontSize:8,color:T.text4,fontFamily:T.stats}}>{trainerMode==="exploit"&&vp?`Profil ${spot.vtype} — VPIP ${vp.vpip}%, Agg ${vp.agg}…`:"Calcule la stratégie GTO optimale…"}</div>
                    </div>
                    <span style={{padding:"2px 7px",borderRadius:20,background:"rgba(155,92,255,.08)",border:"1px solid rgba(155,92,255,.2)",fontSize:7.5,fontWeight:700,color:"rgba(155,92,255,.8)"}}>🤖 IA</span>
                  </div>
                  <div style={{overflow:"hidden",borderRadius:2,background:"rgba(155,92,255,.1)"}}>
                    <div className="think-bar" style={{background:`linear-gradient(90deg,${vp?vp.col+"66":"rgba(155,92,255,.5)"},${vp?vp.col:"#9B5CFF"})`}}/>
                  </div>
                </div>
              );
            })()}

            {/* VILLAIN IA HUD — style GTO Wizard moderne */}
            {(()=>{
              const vp=VILLAIN_PROFILES[spot.vtype];
              if(!vp)return null;
              return(
                <div style={{flexShrink:0,padding:"9px 11px 8px",borderBottom:"1px solid #152D6E",background:"rgba(155,92,255,.03)"}}>
                  <div style={{fontSize:7.5,color:"#9B5CFF",fontFamily:T.stats,fontWeight:800,letterSpacing:".1em",marginBottom:6}}>VILLAIN IA</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:7}}>
                    <div style={{width:38,height:38,borderRadius:"50%",flexShrink:0,background:`${vp.col}18`,border:`2px solid ${vp.col}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,boxShadow:`0 0 14px ${vp.col}33`}}>{vp.ico||"🤖"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,fontWeight:800,color:vp.col,marginBottom:1}}>{spot.vtype}</div>
                      <div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{spot.vpos} · {vp.desc}</div>
                    </div>
                  </div>
                  {[["VPIP",vp.vpip,50,"#34D8FF"],["PFR",vp.pfr,40,"#10D87A"],["Agg",Math.round(vp.agg*20),100,"#FF8A3D"]].map(([lbl,val,max,col])=>(
                    <div key={lbl} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span style={{width:24,fontSize:7.5,fontFamily:T.stats,color:T.text4,flexShrink:0}}>{lbl}</span>
                      <div style={{flex:1,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(val/max)*100}%`,background:col,borderRadius:2,transition:"width .6s"}}/>
                      </div>
                      <span style={{width:26,textAlign:"right",fontSize:7.5,fontFamily:T.mono,color:col,flexShrink:0}}>{lbl==="Agg"?vp.agg:val+"%"}</span>
                    </div>
                  ))}
                  {trainerMode==="exploit"&&vp.exploitTip&&(
                    <div style={{marginTop:5,padding:"4px 7px",borderRadius:5,background:`${vp.col}0C`,border:`1px solid ${vp.col}28`,fontSize:7.5,color:vp.col,fontFamily:T.stats,lineHeight:1.45}}>{vp.exploitTip}</div>
                  )}
                </div>
              );
            })()}

            {answered!==null&&renderHeroFeedback()}

            {/* ANALYSE GTO */}
            {(()=>{
              const solBlurred=!showSol;
              const accentCols=["#FF4560","#10D87A","#1F8BFF","#FFC247","#9B5CFF"];
              const bestEv=spot.ev[spot.acts[spot.ok]?.id]||0;
              return(
                <div style={{flexShrink:0,padding:"9px 11px 8px",borderBottom:"1px solid #152D6E",position:"relative",overflow:"hidden"}}>
                  <div style={{fontSize:7.5,color:"#34D8FF",fontFamily:T.stats,fontWeight:800,letterSpacing:".1em",marginBottom:6}}>ANALYSE GTO</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {spot.acts.map((a,i)=>{
                      const freq=spot.freq[a.id]||0;
                      if(freq===0)return null;
                      const isB=i===spot.ok;
                      const col=accentCols[i%accentCols.length];
                      return(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{width:34,fontSize:8,fontFamily:T.stats,fontWeight:700,color:isB?T.green:T.text3,flexShrink:0}}>{a.l}</span>
                          <div style={{flex:1,height:5,background:"rgba(255,255,255,.05)",borderRadius:3,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${freq}%`,background:col,borderRadius:3,transition:"width .7s"}}/>
                          </div>
                          <span style={{width:24,textAlign:"right",fontSize:8,fontFamily:T.mono,color:isB?T.green:T.text4}}>{freq}%</span>
                          {spot.ev[a.id]!==undefined&&<span style={{width:38,textAlign:"right",fontSize:8,fontFamily:T.mono,color:spot.ev[a.id]>=0?T.green:T.red,flexShrink:0}}>{spot.ev[a.id]>=0?"+":""}{spot.ev[a.id]?.toFixed(1)}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginTop:5}}>
                    <span style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>EV optimal :</span>
                    <span style={{fontSize:9,fontFamily:T.mono,fontWeight:700,color:bestEv>=0?T.green:T.amber}}>{bestEv>0?"+":""}{bestEv.toFixed(2)}bb</span>
                  </div>
                  {solBlurred&&(
                    <div className="sol-lock">
                      <span style={{fontSize:16}}>🔒</span>
                      <span style={{fontSize:8,fontFamily:T.stats,fontWeight:700,color:T.text3,letterSpacing:".05em"}}>Solution masquée</span>
                      <button onClick={onToggleSol} className="sol-toggle-btn sol-hidden" style={{marginTop:5,fontSize:8,padding:"3px 10px"}}>Révéler</button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ANALYSE EXPLOIT */}
            {(()=>{
              const solBlurred=!showSol;
              const vp=VILLAIN_PROFILES[spot.vtype];
              return(
                <div style={{flexShrink:0,padding:"8px 11px",borderBottom:"1px solid #152D6E",position:"relative",overflow:"hidden"}}>
                  <div style={{fontSize:7.5,color:"#FF8A3D",fontFamily:T.stats,fontWeight:800,letterSpacing:".1em",marginBottom:5}}>ANALYSE EXPLOIT</div>
                  <div style={{fontSize:8,color:T.text3,fontFamily:"'Inter',sans-serif",lineHeight:1.5,marginBottom:4}}>{spot.expl||"Analysez la range villain et choisissez l'action exploitative optimale."}</div>
                  {vp&&<div style={{padding:"4px 7px",borderRadius:5,background:`${vp.col}10`,border:`1px solid ${vp.col}28`,fontSize:7.5,color:vp.col,fontFamily:T.stats}}>Agg: {vp.agg} · {vp.desc}</div>}
                  {solBlurred&&(
                    <div className="sol-lock">
                      <span style={{fontSize:16}}>🔒</span>
                      <span style={{fontSize:8,fontFamily:T.stats,fontWeight:700,color:T.text3,letterSpacing:".05em"}}>Solution masquée</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* HISTORIQUE — chemin d'action complet jusqu'à Hero (préflop reconstruit) + actions live */}
            {(()=>{
              const fullLog=[...(spotCtx.preActions||[]),...handLog];
              return(
            <div style={{flexShrink:0,padding:"8px 11px",borderBottom:"1px solid #152D6E"}}>
              <div style={{fontSize:7.5,color:"#FFC247",fontFamily:T.stats,fontWeight:800,letterSpacing:".1em",marginBottom:5}}>HISTORIQUE</div>
              {fullLog.length>0?(
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {fullLog.map((t,i)=>{
                    const isHeroRow=t.position===spot.hpos;
                    return(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:4,opacity:t.actionType==="FOLD"?.55:1}}>
                      <span style={{width:26,fontSize:7.5,fontFamily:T.stats,fontWeight:700,color:isHeroRow?T.gold:T.text3,padding:"1px 4px",borderRadius:3,background:isHeroRow?"rgba(255,194,71,.1)":"rgba(255,255,255,.04)",border:`1px solid ${isHeroRow?"rgba(255,194,71,.25)":"rgba(255,255,255,.06)"}`,flexShrink:0}}>{t.position}</span>
                      <span className={`tlact ${tlCls(t.actionType)}`} style={{fontSize:7.5,padding:"1px 5px"}}>{trainerActionVerb(t.actionType)}</span>
                      {(t.displayAmount??t.amountBb)>0&&<span style={{fontSize:7.5,fontFamily:T.mono,color:T.amber,marginLeft:"auto"}}>{fmt(t.displayAmount??t.amountBb)}</span>}
                      {t.potAfterAction>0&&<span style={{fontSize:7.5,fontFamily:T.mono,color:T.text4,marginLeft:(t.displayAmount??t.amountBb)>0?0:"auto"}}>P {fmt(t.potAfterAction)}</span>}
                    </div>
                    );
                  })}
                  {answered===null&&<div style={{display:"flex",alignItems:"center",gap:4,marginTop:1}}>
                    <span style={{width:26,fontSize:7.5,fontFamily:T.stats,fontWeight:800,color:T.gold,padding:"1px 4px",borderRadius:3,background:"rgba(255,194,71,.14)",border:"1px solid rgba(255,194,71,.35)",flexShrink:0}}>{spot.hpos}</span>
                    <span style={{fontSize:7.5,color:T.gold,fontFamily:T.stats,fontStyle:"italic"}}>à toi de jouer{spotCtx.facing?` — face à ${spotCtx.facing.label.toLowerCase()} ${fmt(spotCtx.facing.amount)}`:(/^pre/i.test(spot.street||"")?" — premier à parler":` — ${spot.vpos} check`)}</span>
                  </div>}
                </div>
              ):(
                <div style={{fontSize:8.5,color:T.text4,fontFamily:T.stats,fontStyle:"italic"}}>Pas encore d'actions</div>
              )}
            </div>
              );
            })()}

            {/* INFORMATIONS */}
            <div style={{flexShrink:0,padding:"8px 11px",borderBottom:"1px solid #152D6E"}}>
              <div style={{fontSize:7.5,color:"#10D87A",fontFamily:T.stats,fontWeight:800,letterSpacing:".1em",marginBottom:5}}>INFORMATIONS</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 8px"}}>
                {[
                  ["Street",spot.street,"#34D8FF"],
                  ["Pot",fmt(currentPotBb||1.5),T.gold],
                  ["Stack",fmt(parseFloat(spot.stack)||100)+" bb",T.amber],
                  ["SPR",spr,T.text3],
                  ...(spot.toCall>0?[["Pot odds",potOddsStr,"#FF8A3D"]]:[] ),
                  ["Difficulté",spot.diff===1?"Débutant":spot.diff===2?"Inter.":spot.diff===3?"Avancé":"Expert",spot.diff===1?T.green:spot.diff===2?T.amber:spot.diff===3?T.red:"#9B5CFF"],
                ].map(([lbl,val,col])=>(
                  <div key={lbl} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:7.5,color:T.text4,fontFamily:T.stats}}>{lbl}</span>
                    <span style={{fontSize:8.5,fontFamily:T.mono,fontWeight:700,color:col}}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* EV RÉSULTATS */}
            {phase==="done"&&answered!==null&&(
              <div style={{flexShrink:0}}>{renderEvResults()}</div>
            )}

            {/* FULL-HAND : actions accessibles même solution masquée */}
            {renderFhActions()}

            {/* ══ AIDE MULTI-TABLE — contenu de l'ex-bandeau bas, intégré ici quand
               la solution est affichée (numTables>1). Piloté par le spot de la table active. ══ */}
            {numTables>1&&showSol&&(()=>{
              const acts=Array.isArray(spot?.acts)?spot.acts:[];
              const sk=(i,f)=>acts[i]?.l||f;
              return(
                <div className="pf-mtp-help">
                  <div className="pf-mtp-title" style={{color:"#54b8ff"}}>INSTRUCTIONS</div>
                  <div className="pf-mtp-help-instr">
                    <strong>{(spot?.street||"PREFLOP").toUpperCase()} · {spot?.hpos||"Hero"}</strong>
                    <span>{spot?.desc||"Prends la meilleure décision sur cette table."}</span>
                  </div>
                  <div className="pf-mtp-title" style={{color:"#54b8ff",marginTop:8}}>RACCOURCIS</div>
                  <div className="pf-mtp-help-keys">
                    {[["F1",sk(0,"Fold")],["F2",sk(1,"Check/Call")],["F3",sk(2,"Bet/Raise")],["F4",sk(3,"Bet Pot/All-in")]].map(([k,l])=>(
                      <div key={k} className="pf-mtp-help-key"><span className="kk">{k}</span><span className="kl">{l}</span></div>
                    ))}
                  </div>
                  <div className="pf-mtp-title" style={{color:"#54b8ff",marginTop:8}}>RAPPELS · ACTIONS RAPIDES</div>
                  <ul className="pf-mtp-help-list">
                    <li>La table active (halo bleu) reçoit les raccourcis F1–F4.</li>
                    <li>Clique une autre table pour la rendre active.</li>
                    <li>Min = mise minimale · 2.5x/3x/3.5x/4x = multiplier · All-in = tapis.</li>
                    <li>+/- = ajuster le montant.</li>
                  </ul>
                </div>
              );
            })()}

          </div>{/* ── fin zone scrollable ── */}

          {/* ══ TIMELINE — bas du bandeau droit (maquette v2). Les actions Héro
             sont désormais centrées sous la table : plus aucun chevauchement. ══ */}
          {renderTimeline()}

        </div>
      );

    if(is1T) return(
      <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#030712",overflow:"hidden",...(oneTableStableShellStyle||{})}}>

        {/* ── BARRE TOP : streets + timeline (desktop) ── */}
        <div className="trainer-topstrip" style={{flexShrink:0,background:"linear-gradient(90deg,#030D2A,#040B1F)",borderBottom:"1px solid #152D6E",padding:"5px 14px",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",minHeight:34}}>
          {/* Streets pills */}
          {STREETS.map(s=>{
            const done=STREETS.indexOf(s)<STREETS.indexOf(spot.street);
            const cur=s===spot.street;
            return <span key={s} style={{
              padding:"2px 10px",borderRadius:20,fontSize:9.5,fontFamily:T.stats,fontWeight:700,letterSpacing:".05em",
              background:cur?"rgba(255,194,71,.14)":done?"rgba(16,216,122,.08)":"rgba(255,255,255,.03)",
              color:cur?T.gold:done?T.green:T.text4,
              border:`1px solid ${cur?"rgba(255,194,71,.35)":done?"rgba(16,216,122,.18)":"transparent"}`,
              boxShadow:cur?"0 0 10px rgba(255,194,71,.15)":"none",
            }}>{s}</span>;
          })}
          <span style={{width:1,height:14,background:"#152D6E",margin:"0 3px"}}/>
          {/* Timeline actions */}
          {tl.map((t,i)=>(
            <span key={i} style={{display:"flex",alignItems:"center",gap:3}}>
              <span style={{fontSize:9,color:T.text4,fontFamily:T.stats,fontWeight:700}}>{t.pos}</span>
              <span className={`tlact ${tlCls(t.act)}`} style={{fontSize:9}}>{t.lbl}</span>
              {i<tl.length-1&&<span style={{color:T.text4,fontSize:9}}>›</span>}
            </span>
          ))}
          {thinking&&<span className="think" style={{marginLeft:4}}><span>·</span><span>·</span><span>·</span></span>}
          {/* Timer */}
          {phase==="hero"&&answered===null&&(
            <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontFamily:T.mono,fontSize:9,color:timerPct<25?T.red:T.text4,fontWeight:timerPct<25?700:400}}>{timerSec>0?Math.ceil(timerPct/100*timerSec)+"s":"∞"}</span>
              <div className="action-timer" style={{width:64,borderRadius:2}}>
                <div className={`action-timer-bar${timerPct<20?" urgent":""}`} style={{width:timerPct+"%"}}/>
              </div>
            </span>
          )}
        </div>

        {/* ── MOBILE : streets + timer compacts (sous la barre Zone 1) ── */}
        <div className="mtr-spothead">
          {STREETS.map(s=>{
            const done=STREETS.indexOf(s)<STREETS.indexOf(spot.street);
            const cur=s===spot.street;
            return <span key={s} className={`mtr-street${cur?" cur":done?" done":""}`}>{s.slice(0,4)}</span>;
          })}
          {phase==="hero"&&answered===null&&(
            <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
              <span style={{fontFamily:T.mono,fontSize:10,fontWeight:700,color:timerPct<25?T.red:T.text3}}>{timerSec>0?Math.ceil(timerPct/100*timerSec)+"s":"∞"}</span>
              <span className="mtr-timer-track"><span className="mtr-timer-fill" style={{width:timerPct+"%",background:timerPct<25?"#FF4560":"linear-gradient(90deg,#FFC247,#FF9800)"}}/></span>
            </span>
          )}
          {phase!=="hero"&&tl.length>0&&(
            <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
              <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,fontWeight:700}}>{tl[tl.length-1].pos}</span>
              <span className={`tlact ${tlCls(tl[tl.length-1].act)}`} style={{fontSize:8,padding:"1px 6px"}}>{tl[tl.length-1].lbl}</span>
            </span>
          )}
        </div>

        {/* ── HUD ── (mobile : masqué ici, re-rendu sous l'historique — cf. .pf-spot-info-bottom) */}
        <div className="trainer-hud trainer-hud-top">
          <span className="hud-chip hud-pos">📍 {spot.hpos}</span>
          <span className="hud-chip hud-stack">📊 {spot.stack}</span>
          <span className="hud-chip hud-spr">SPR {spr}</span>
          {potOddsStr&&<span className="hud-chip hud-odds">Pot Odds {potOddsStr}</span>}
          <span className="hud-chip hud-eff" style={{background:"rgba(155,92,255,.08)",color:"#9B5CFF",border:"1px solid rgba(155,92,255,.15)"}}>🃏 {spot.fmt}</span>
          {/* Mode badge dans le HUD */}
          <span style={{
            padding:"2px 7px",borderRadius:5,
            fontFamily:"'Space Grotesk',sans-serif",fontSize:8,fontWeight:700,
            background:trainerMode==="gto"?"rgba(52,216,255,.08)":"rgba(255,138,61,.08)",
            color:trainerMode==="gto"?"#34D8FF":"#FF8A3D",
            border:`1px solid ${trainerMode==="gto"?"rgba(52,216,255,.2)":"rgba(255,138,61,.2)"}`,
          }}>{trainerMode==="gto"?"GTO":PLATFORM_PROFILES[platform]?.flag||"🦈"}</span>
          <div className="hud-diff">
            <span style={{width:6,height:6,borderRadius:"50%",background:diffCol,flexShrink:0}}/>
            {diffLabel}
          </div>
        </div>

        {/* ── TOAST ── */}
        {showToast&&<div className="error-toast"><span className="error-toast-icon">⚠</span>{showToast}</div>}

        {/* ── ZONE PRINCIPALE : 2 COLONNES desktop / pile verticale mobile ── */}
        <div className="t1-row" style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>

        {/* ══ COLONNE GAUCHE : TABLE (68% desktop · plein écran mobile) ══ */}
        {/* Refonte V2 : la table occupe toute la largeur — le panneau droit est
           désormais la colonne partagée V2 rendue par le parent (même logique
           que le multi). */}
        <div className="t1-left" style={{flex:"1 1 auto",minWidth:0,display:"flex",flexDirection:"column",background:"radial-gradient(ellipse at 50% 40%,#050F28 0%,#020810 100%)",overflow:"hidden"}}>

         <div className="t1-table-area" style={{flex:1,position:"relative",minHeight:0,overflow:"hidden"}}>

          {/* Focus Mode button */}
          {onFocusToggle&&<div className={`focus-mode-btn${focusMode?" on":""}`} title={focusMode?"Quitter le focus":"Mode focus"} onClick={onFocusToggle}>{focusMode?"⊡":"⊠"}</div>}

          {/* ── Post-Decision Feedback overlay ── */}
          {phase==="done"&&answered!==null&&(()=>{
            const bestEv=spot.ev[spot.acts[spot.ok]?.id]||0;
            const myEv=spot.ev[spot.acts[answered]?.id]||0;
            const evDiff=myEv-bestEv;
            const isBest=answered===spot.ok;
            const ico=isBest?"✔":evDiff>=-0.3?"≈":"✖";
            const col=isBest?"#10D87A":evDiff>=-0.3?"#FFC247":"#FF4560";
            const glw=isBest?"rgba(16,216,122,.4)":evDiff>=-0.3?"rgba(255,194,71,.4)":"rgba(255,69,96,.4)";
            return(
              <div className="post-decision-feedback" key={answered} style={{top:"50%",left:"50%"}}>
                <div style={{width:54,height:54,borderRadius:"50%",background:`radial-gradient(circle,${col}25,${col}08)`,border:`2.5px solid ${col}`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 20px ${glw},0 0 40px ${glw.replace(".4",".2")}`}}>
                  <span style={{fontSize:24,fontWeight:900,color:col,textShadow:`0 0 14px ${col}`}}>{ico}</span>
                </div>
                {evDiff!==0&&<span style={{fontSize:9.5,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:col,background:`${col}15`,padding:"2px 7px",borderRadius:8,border:`1px solid ${col}30`}}>{evDiff>=0?"+":""}{evDiff.toFixed(2)} bb EV</span>}
              </div>
            );
          })()}

          {/* ── FEUTRE OVALE PREMIUM ── */}
          <div className="felt-oval" style={trainerFeltStyle(1,{phase,errorFlash,geometry:trainingLayout.tableGeometry})}>
            {/* Rail intérieur — double ring premium */}
            <div style={feltRailStyle(1,"outer",trainingLayout.tableGeometry)}/>
            <div style={feltRailStyle(1,"inner",trainingLayout.tableGeometry)}/>

            {/* POT */}
            {(()=>{
              const hasBoard=(!playingFull&&spot.board.length>0)||(playingFull&&fhVisBoard.length>0);
              const potVal=mainPotBb;
              const potPt=potPointFor(1,hasBoard);
              return hasBoard?(
                /* Pot compact au-dessus du board */
                <div className={`pf-pot-readout compact${potAnim?" pot-val-pop":""}`} style={{position:"absolute",top:`${isMobile?31:potPt.y}%`,left:`${potPt.x}%`,transform:"translate(-50%,-50%)",zIndex:7}}>
                  <TrainingPotStack value={potVal} compact themeKey={effChipTheme} colorKey={chipColor} sizeMode={chipSizeMode} tableMode={1}/>
                  <span className="pf-pot-label">POT</span>
                  <span className="pf-pot-value">{fmt(potVal)}</span>
                </div>
              ):(
                /* Pot centré quand pas de board */
                <div className={`pf-pot-readout${potAnim?" pot-val-pop":""}`} style={{position:"absolute",top:`${isMobile?32:potPt.y}%`,left:`${potPt.x}%`,transform:"translate(-50%,-50%)",zIndex:7}}>
                  <TrainingPotStack value={potVal} themeKey={effChipTheme} colorKey={chipColor} sizeMode={chipSizeMode} tableMode={1}/>
                  <span className="pf-pot-label">POT</span>
                  <span className="pf-pot-value">{fmt(potVal)}</span>
                </div>
              );
            })()}

            {/* BOARD — centré, taille contractuelle 1T pour éviter les collisions avec sièges/mises */}
            {((!playingFull&&spot.board.length>0)||(playingFull&&fhVisBoard.length>0))&&(
              <div className="pf-board-zone" key={`board-${boardKey}`} style={{position:"absolute",top:`${isMobile?46:boardPointFor(1).y}%`,left:`${boardPointFor(1).x}%`,transform:"translate(-50%,-50%)",display:"flex",gap:boardGap,zIndex:6,alignItems:"center",
                filter:"drop-shadow(0 4px 16px rgba(0,0,0,.7))"}}>
                {(!playingFull?spot.board:fhVisBoard).map((c,i)=>(
                  <div key={i} className="board-card-in" style={{animationDelay:`${i*.09}s`}}>
                    <Card r={c.r} s={c.s} size={boardSize} delay={0}/>
                  </div>
                ))}
              </div>
            )}
            {/* ── JETONS CASINO POT — pile 3D stacking vertical ── */}
            {false&&(()=>{
              const potVal=mainPotBb;
              const stackH=Math.min(9,Math.max(1,Math.ceil(potVal/5)));
              const hasBoard=(!playingFull&&spot.board.length>0)||(playingFull&&fhVisBoard.length>0);
              if((Number(potVal)||0)>=0||!hasBoard)return null;
              const theme=CHIP_THEMES[chipTheme]||CHIP_THEMES.blue;
              const sz=18;
              return(
                <div style={{position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",zIndex:7,display:"flex",flexDirection:"column",alignItems:"center",gap:3,filter:`drop-shadow(0 4px 12px ${theme.glow})`}}>
                  <div style={{position:"relative",width:sz,height:sz+(stackH-1)*4}}>
                    {[...Array(stackH)].map((_,i)=>(
                      <div key={i} style={{
                        position:"absolute",bottom:i*4,left:0,
                        width:sz,height:sz,borderRadius:"50%",
                        background:theme.cols[i%theme.cols.length],
                        border:`1.5px solid ${theme.edge}`,
                        boxShadow:`inset 0 -2px 4px rgba(0,0,0,.55),inset 0 2px 3px rgba(255,255,255,.22),0 ${i===stackH-1?3:1}px ${i===stackH-1?7:2}px rgba(0,0,0,.7)`,
                        overflow:"hidden",
                      }}>
                        <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"radial-gradient(circle at 35% 28%,rgba(255,255,255,.4) 0%,transparent 58%)",pointerEvents:"none"}}/>
                        <div style={{position:"absolute",inset:4,borderRadius:"50%",border:"1px solid rgba(255,255,255,.1)",pointerEvents:"none"}}/>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Phase flash overlay */}
            {phaseFlash&&<div className="phase-flash"/>}
            {potDelta&&<div className="pot-delta" style={{top:((!playingFull&&spot.board.length>0)||(playingFull&&fhVisBoard.length>0))?"22%":"42%"}}>+{fmt(potDelta.amount)}</div>}
            <ChipAnimation event={chipMove} compact={false}/>
            {/* CHIP HERO → POT */}
            {heroChip&&<div className="chip-hero-fly"><span>{heroChip}</span></div>}
            {/* CHIP VILLAIN → POT */}
            {vilChip&&<div className="chip-vil-fly"><span>{vilChip}</span></div>}
            {/* CHIP ANIMATION legacy */}
            {chipAnim&&<div className="chip-fly"><span>{chipAnim}</span></div>}
          </div>

          {/* ══ SIÈGES 1T — Seat cards concept premium ══ */}
          {seatOrder.map(pos=>{
            const coord=seats1T[pos];
            if(!coord)return null;
            const isH=pos===spot.hpos, isV=pos===spot.vpos;
            const seatState=seatStates[pos]||{};
            const seatFolded=!!seatState.folded;
            const seatMultiway=!!seatState.multiway&&!isH&&!isV&&!seatFolded;
            const isActive=(activePlayerId==="hero"&&isH)||(activePlayerId==="villain"&&isV);
            const isDone=answered!==null;
            const col=isH?T.gold:isV?"#c090ff":T.text3;
            const seatLiveAction=tableAction?.position===pos?tableAction:null;
            const seatLoggedAction=[...handLog].reverse().find(a=>a.position===pos);
            const seatActionSource=seatLiveAction||seatLoggedAction||null;
            const lastAct=isH&&isDone
              ?{...spot.acts[answered],id:seatActionSource?.actionType||spot.acts[answered]?.id,l:seatActionSource?.displayLabel||spot.acts[answered]?.l}
              :isV&&vact?{id:seatActionSource?.actionType||vact.action,l:seatActionSource?.displayLabel||vact.label}:null;
            const actCls=lastAct?
              lastAct.id==="FOLD"?"action-fold":
              lastAct.id==="CALL"?"action-call":
              lastAct.id==="CHECK"||lastAct.id==="CHECK_BACK"?"action-check":
              lastAct.id==="RAISE"||lastAct.id==="3BET"||lastAct.id==="4BET"||lastAct.id==="5BET"?"action-raise":
              lastAct.id==="ALLIN"?"action-allin":"action-bet":"";
            const vp=isV?(VILLAIN_PROFILES[spot.vtype]||{vpip:22,pfr:18}):SEAT_DEFAULT_STATS[pos]||{vpip:22,pfr:18};
            const displayStack=isH?parseFloat(spot.stack)||100:60;
            // Densité : sur les grandes tables mobiles (7-9 joueurs) on réduit les avatars pour les désengorger.
            const nSeats=seatOrder.length;
            const denseScale=!isMobile||nSeats<=6?1:nSeats===7?0.9:nSeats===8?0.82:0.76;
            const avSz=isMobile?Math.round((isH?41:35)*denseScale):(isH?70:64);
            const hasBet=isH&&isDone&&!["FOLD","CHECK","CHECK_BACK","WIN"].includes(lastAct?.id);
            const hasVilBet=isV&&vact&&!["FOLD","CHECK","WIN"].includes(lastAct?.id||vact.action);
            const eventAmount=roundBb(seatActionSource?.actionEvent?.displayAmount??seatActionSource?.displayAmount??seatActionSource?.committedAmount??seatActionSource?.amountBb??0);
            const heroBetAmt=hasBet?eventAmount:0;
            const vilBetAmt=hasVilBet?eventAmount:0;
            // ── Jetons « pré-décision » : ce que chacun a engagé AVANT que Hero agisse ──
            // (open/3-bet/c-bet du vilain + open déjà investi par Hero) — indispensable
            // pour comprendre pourquoi Hero doit call/3-bet/defend.
            const activeStreetBetsVisible=!isDone&&!vact&&!playingFull;
            const preDecision=activeStreetBetsVisible;
            let preChipAmt=0,preChipLabel=null;
            if(preDecision){
              if(isV&&spotCtx.facing&&spotCtx.facing.position===pos){preChipAmt=spotCtx.facing.amount;preChipLabel=spotCtx.facing.label;}
              else if(isH&&spotCtx.heroCommitted>(TRAINER_BLINDS[pos]||0)){preChipAmt=spotCtx.heroCommitted;}
              else if(!isH&&!isV&&seatState.invested>0){preChipAmt=seatState.invested;preChipLabel=seatState.lastLabel||"Call";}
            }
            const betAmt=hasBet?heroBetAmt:hasVilBet?vilBetAmt:preChipAmt;
            const chipLabel=(hasBet||hasVilBet)?(seatActionSource?.actionLabel||trainerActionDisplayVerb(seatActionSource?.actionType,lastAct)):preChipLabel;
            const chipLabelCol=hasBet?T.gold:hasVilBet?(vact.color||T.purple):"#9B5CFF";
            const chipCount=betAmt>0?Math.min(6,Math.max(1,Math.ceil(betAmt/4))):0;
            const actionPt=resolveTrainerActionPoint(trainingLayout,pos,{hasBoard:hasVisibleBoard});
            const cpx=actionPt.x;
            const cpy=actionPt.y;
            const isTopSeat1T=coord.y<=24;
            const isBottomSeat1T=coord.y>=68;
            const seatTransform1T=isMobile
              ?(isTopSeat1T?"translate(-50%,-35%)":isBottomSeat1T?"translate(-50%,-58%)":"translate(-50%,-50%)")
              :isTopSeat1T?"translate(-50%,-40%)":isBottomSeat1T?"translate(-50%,-49%)":"translate(-50%,-50%)";
            const heroCardSizeForSeat1T=isMobile?heroCardSize1T:isTopSeat1T?"1t-hero-top":isBottomSeat1T?"1t-hero-bottom":heroCardSize1T;
            const heroCardGapForSeat1T=isMobile?3:(isTopSeat1T?5:isBottomSeat1T?5:8);
            const heroCardMarginForSeat1T=isMobile?2:(isTopSeat1T?4:isBottomSeat1T?5:6);
            return(
              <React.Fragment key={pos}>

                {/* ── SEAT CARD ── */}
                <PlayerSeat pos={pos} mode="1T" style={{left:`${coord.x}%`,top:`${coord.y}%`,transform:seatTransform1T,gap:0,zIndex:20}}>

                  {/* Villain cards above seat — masquées une fois couché (état Fold = badge seul) */}
                  {isV&&!seatFolded&&(
                    <div style={{marginBottom:5,position:"relative"}}>
                      <VillainBackCards size={villainCardSize1T} animated={isV&&(thinking||fhVilThink)&&!seatFolded} gap={3} folded={seatFolded}/>
                      {(thinking||(playingFull&&fhVilThink))&&(
                        <div style={{position:"absolute",top:-14,left:"50%",transform:"translateX(-50%)"}}>
                          <span className="think" style={{fontSize:10}}><span>·</span><span>·</span><span>·</span></span>
                        </div>
                      )}
                    </div>
                  )}
                  {!isH&&!isV&&denseScale>=1&&!seatFolded&&(
                    <div style={{marginBottom:3}}>
                      <VillainBackCards size={villainCardSize1T} gap={2} muted={!seatMultiway} folded={seatFolded}/>
                    </div>
                  )}

                  {/* ── Cartes Hero ABOVE seat — hero en position basse (SB/BB, y>50) ── */}
                  {isH&&(
                    <HeroHoleCards cards={spot.hand} size={heroCardSizeForSeat1T} gap={heroCardGapForSeat1T} style={{marginBottom:heroCardMarginForSeat1T,filter:"drop-shadow(0 8px 22px rgba(0,0,0,.86)) drop-shadow(0 0 16px rgba(0,191,255,.34))"}}/>
                  )}

                  {isV&&isActive&&(
                    <div style={{
                      marginBottom:3,padding:"2px 10px",borderRadius:20,
                      background:"rgba(155,92,255,.16)",border:"1px solid rgba(155,92,255,.42)",
                      fontFamily:"'Space Grotesk',sans-serif",fontSize:8,fontWeight:800,
                      color:"#c090ff",letterSpacing:".06em",
                      boxShadow:"0 0 10px rgba(155,92,255,.28)",
                    }}>Vilain reflechit...</div>
                  )}

                  {/* Player card */}
                  <div className={`player-card-1t${isH?" hero":isV?" villain":""}${isActive?(isH?" active-hero":" active-vil"):""}${seatFolded?" seat-folded":""}${seatMultiway?" seat-multiway":""}`} data-dense={denseScale<1?"1":undefined} data-profile={isH?"hero":isV?trainerAvatarKey(spot.vtype):trainerAvatarKey(seatState.profile||trainerSeatAvatarProfile(pos))}>
                    <PlayerAvatarPremium isHero={isH} isVillain={isV} profile={isV?spot.vtype:isH?"Hero":seatState.profile||trainerSeatAvatarProfile(pos)} size={avSz} active={isActive||seatMultiway}/>
                    {isH&&<span className="pf-seat-hero-chip">HERO</span>}
                    <div className="pf-seat-nameplate">
                      <span className="seat-card-pos" style={{fontSize:isH?13:11.5,color:col}}>{pos}</span>
                      <span className="seat-card-stack" style={{fontSize:isH?11:9.5,color:isH?T.gold:T.text3}}>{fmt(displayStack)}</span>
                    </div>
                    <div className="seat-card-stats">
                      <span>VPIP {vp.vpip}</span>
                      <span style={{color:"rgba(111,129,168,.4)"}}>·</span>
                      <span>PFR {vp.pfr}</span>
                    </div>
                    {/* Range button */}
                    {(isH||isV)&&(
                      <div className={`seat-range-btn${isV?" vil":""}`}
                        title={isH?"Voir ma range":"Voir range Villain"}
                        onClick={()=>setRangePopup({heroPos:spot.hpos,vilPos:spot.vpos,heroAction:spot.acts[spot.ok]?.id?.toLowerCase()||"open",stackBB:parseFloat(spot.stack)||100})}>
                        R
                      </div>
                    )}
                  </div>
                  {seatFolded&&!isH&&!isV&&<span className="pf-fold-chip">Fold</span>}
                  {seatMultiway&&<span className="pf-multiway-chip">In pot</span>}

                  {/* ── Cartes Hero BELOW seat — hero en position haute/côté (HJ/CO/BTN/UTG, y≤50) ── */}
                  {false&&isH&&coord.y<=50&&!playingFull&&(
                    <div style={{display:"flex",gap:8,marginTop:5,filter:"drop-shadow(0 8px 22px rgba(0,0,0,.9)) drop-shadow(0 0 14px rgba(31,139,255,.25))"}}>
                      {spot.hand.map((c,i)=>(
                        <div key={i} className="deal-hero" style={{animationDelay:`${i*.1}s`,outline:"2px solid rgba(31,139,255,.38)",outlineOffset:2,borderRadius:4,boxShadow:"0 0 20px rgba(31,139,255,.3)"}}>
                          <Card r={c.r} s={c.s} size={heroCardSize1T} delay={0}/>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action badge */}
                  {lastAct&&!playingFull&&!(betAmt>0)&&(
                    <span className={`seat-action-badge ${actCls}`} style={{marginTop:4,fontSize:9,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis"}}>{lastAct.l}</span>
                  )}
                  {playingFull&&isV&&fhVilAct&&(
                    <span className={`seat-action-badge ${trainerActionCssClass(fhVilAct.action)}`} style={{marginTop:4}}>
                      {fhVilAct.label||trainerActionDisplayVerb(fhVilAct.action,fhVilAct)}
                    </span>
                  )}
                  {/* Badge action Hero en main complète (street courante) — symétrie avec le vilain */}
                  {playingFull&&isH&&(()=>{
                    const ha=[...fhActs].reverse().find(a=>a.actor==="Hero"&&a.street===fhStreet);
                    if(!ha)return null;
                    return(
                      <span className={`seat-action-badge ${trainerActionCssClass(ha.action)}`} style={{marginTop:4}}>
                        {trainerActionDisplayVerb(ha.action)}
                      </span>
                    );
                  })()}
                </PlayerSeat>

                {/* ── CHIP PILE — between seat and oval center ── */}
                {false&&chipCount>0&&!playingFull&&(()=>{
                  const theme=CHIP_THEMES[isH?chipTheme:"blue"]||CHIP_THEMES.blue;
                  const vilCols=seatMultiway?["#00E6B8","#00A88E","#036B62","#C0FFF2","#1F8BFF"]:["#9B5CFF","#7D3DCC","#5E2E99","#3F1F66","#C080FF"];
                  const chipCols=isH?theme.cols:vilCols;
                  const edgeCol=isH?theme.edge:seatMultiway?"#00A88E":"#8030C0";
                  const glw=isH?theme.glow:seatMultiway?"rgba(0,230,184,.42)":"rgba(155,92,255,.4)";
                  const csz=15;
                  return(
                    <div style={{position:"absolute",left:`${cpx}%`,top:`${cpy}%`,transform:"translate(-50%,-50%)",zIndex:18,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                      <div style={{position:"relative",width:csz,height:csz+(chipCount-1)*4,filter:`drop-shadow(0 4px 8px ${glw})`}}>
                        {[...Array(chipCount)].map((_,ci)=>(
                          <div key={ci} style={{
                            position:"absolute",bottom:ci*4,left:0,
                            width:csz,height:csz,borderRadius:"50%",
                            background:chipCols[ci%chipCols.length],
                            border:`1.5px solid ${edgeCol}`,
                            boxShadow:`inset 0 -2px 3px rgba(0,0,0,.55),inset 0 2px 2px rgba(255,255,255,.22),0 1px 3px rgba(0,0,0,.7)`,
                            overflow:"hidden",
                          }}>
                            <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"radial-gradient(circle at 35% 28%,rgba(255,255,255,.38) 0%,transparent 56%)",pointerEvents:"none"}}/>
                            <div style={{position:"absolute",inset:3,borderRadius:"50%",border:"1px solid rgba(255,255,255,.1)",pointerEvents:"none"}}/>
                          </div>
                        ))}
                      </div>
                      <span style={{fontSize:9,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:isH?T.gold:T.purple,textShadow:`0 0 8px ${glw}`}}>{fmt(betAmt)}</span>
                      {chipLabel&&(
                        <span style={{
                          fontSize:8,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,
                          color:chipLabelCol,background:`${chipLabelCol}22`,
                          padding:"1px 6px",borderRadius:5,border:`1px solid ${chipLabelCol}55`,
                          marginTop:2,letterSpacing:".04em",whiteSpace:"nowrap",
                        }}>{chipLabel}</span>
                      )}
                    </div>
                  );
                })()}
                <SeatActionZone
                  x={cpx}
                  y={cpy}
                  amount={!playingFull?betAmt:0}
                  label={chipLabel||trainerActionVerb(trainerActionType(lastAct?.id||"BET"))}
                  type={trainerVisualActionType(chipLabel||lastAct?.id||"BET")}
                  compact={isMobile}
                  kind={isH?"hero":seatMultiway?"multiway":"villain"}
                  themeKey={effChipTheme}
                  colorKey={chipColor}
                  sizeMode={chipSizeMode}
                  tableMode={1}
                />

              </React.Fragment>
            );
          })}

          {/* DEALER BUTTON — entre le siège BTN et le centre de la table */}
          {showStaticBlindMarkers&&["SB","BB"].map(bp=>{
            const p=resolveTrainerBlindPoint(trainingLayout,bp);
            return(
              <div key={`blind-1t-${bp}`} className="pf-blind-anchor" style={{left:`${p.x}%`,top:`${p.y}%`}}>
                <BlindChipStack amount={postedBlinds[bp]} label={bp} themeKey={effChipTheme} colorKey={chipColor} sizeMode={chipSizeMode} tableMode={1}/>
              </div>
            );
          })}

          {(()=>{
            const d=dealerAnchorPoint(trainingLayout);
            return <div className="dealer-btn dealer-btn-v2" style={{left:`${d.x}%`,top:`${d.y}%`}}><img src={dealerSvgUrl} alt="D" draggable="false" style={{width:"100%",height:"100%",display:"block"}}/></div>;
          })()}

          {compactActionLine()&&<div className="table-action-line"><strong>{spot.street}</strong> {compactActionLine()}</div>}

          {spot.toCall>0&&(
            <div className="pf-facing-label" style={{position:"absolute",bottom:"1%",left:"50%",transform:"translateX(-50%)",fontSize:9,color:T.amber,fontFamily:T.mono,whiteSpace:"nowrap",zIndex:31,fontWeight:700,background:"rgba(255,138,0,.12)",padding:"1px 8px",borderRadius:10,border:"1px solid rgba(255,138,0,.25)",display:"flex",gap:6,alignItems:"center"}}>
              {answered===null&&!vact&&spotCtx.facing&&<span style={{color:"#c090ff"}}>Face à {spotCtx.facing.label} {fmt(spotCtx.facing.amount)}</span>}
              <span>À payer : {fmt(spot.toCall)}</span>
            </div>
          )}

         </div>{/* ── fin ZONE TABLE ── */}

          {/* ══ ACTIONS HÉRO — centrées sous la table (maquette v2 : actions puis sizings) ══ */}
          <div className="t1-actions-under" style={{flexShrink:0,padding:"0 14px 12px",background:"linear-gradient(180deg,rgba(3,7,18,0),#020810 22%)"}}>
            {phase==="hero_reply"&&vact&&renderHeroReply()}
            {phase==="hero"&&renderActionZone()}
          </div>

        </div>{/* ── fin COLONNE GAUCHE ── */}

        {/* Refonte V2 : renderRightPanel() (panneau 1T historique) n'est plus
           rendu — le panneau droit V2 partagé est rendu par le parent. */}

        </div>{/* ── fin ZONE PRINCIPALE 2 COLONNES ── */}

        {/* ══ ZONE 3 MOBILE : actions toujours visibles en bas ══ */}
        <div className="t1-mob">
          {/* Vilain réfléchit — bandeau compact */}
          {phase==="villain_thinking"&&(
            <div style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:8,background:"linear-gradient(90deg,rgba(155,92,255,.12),rgba(155,92,255,.03))",borderTop:"1px solid rgba(155,92,255,.3)"}}>
              <span style={{fontSize:16}}>🤔</span>
              <span style={{fontFamily:T.stats,fontSize:10.5,fontWeight:700,color:"#c090ff"}}>{spot.vpos} · {spot.vtype}</span>
              <span className="think"><span>·</span><span>·</span><span>·</span></span>
              <div style={{marginLeft:"auto",flex:"0 1 90px",overflow:"hidden",borderRadius:2}}>
                <div className="think-bar" style={{height:3,background:"linear-gradient(90deg,rgba(155,92,255,.4),#9B5CFF)"}}/>
              </div>
            </div>
          )}
          {/* Réponse héro face au bet vilain */}
          {phase==="hero_reply"&&vact&&renderHeroReply()}
          {/* Verdict compact après réponse — la solution complète vit dans le FAB */}
          {phase==="done"&&answered!==null&&!playingFull&&(()=>{
            const isBest=answered===spot.ok;
            const bestEv=spot.ev[spot.acts[spot.ok]?.id]||0;
            const myEv=spot.ev[spot.acts[answered]?.id]||0;
            const evDiff=myEv-bestEv;
            return(
              <div style={{padding:"9px 10px calc(10px + env(safe-area-inset-bottom,0px))",background:"linear-gradient(180deg,#071B44,#030912)",borderTop:`2px solid ${isBest?"rgba(16,216,122,.5)":"rgba(255,69,96,.45)"}`}}>
                {/* Hiérarchie (§4) : verdict · EV perdue · action jouée · solution optimale */}
                <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:6}}>
                  <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:isBest?"rgba(16,216,122,.15)":"rgba(255,69,96,.12)",border:`2px solid ${isBest?"rgba(16,216,122,.55)":"rgba(255,69,96,.45)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:isBest?T.green:T.red,boxShadow:`0 0 14px ${isBest?"rgba(16,216,122,.3)":"rgba(255,69,96,.25)"}`}}>{isBest?"✓":"✗"}</div>
                  <div style={{fontFamily:T.stats,fontSize:13,fontWeight:800,color:isBest?T.green:T.red,flex:1,minWidth:0}}>{isBest?"Bonne décision !":"Sous-optimal"}</div>
                  {!isBest&&evDiff<0&&<div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontFamily:T.stats,fontSize:7.5,color:T.text4,letterSpacing:".04em"}}>EV PERDUE</div>
                    <div style={{fontFamily:T.mono,fontSize:12,fontWeight:800,color:T.red,lineHeight:1}}>{evDiff.toFixed(2)}bb</div>
                  </div>}
                </div>
                <div style={{display:"flex",gap:12,marginBottom:8,fontFamily:T.stats,fontSize:9.5,flexWrap:"wrap"}}>
                  <span style={{color:T.text3}}>Joué : <strong style={{color:isBest?T.green:T.text}}>{spot.acts[answered]?.l}</strong></span>
                  {showSol&&!isBest&&<span style={{color:T.text3}}>Optimal : <strong style={{color:T.green}}>{spot.acts[spot.ok]?.l}</strong></span>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button className="gto-next-btn" style={{flex:1}} disabled={nextBusy} onClick={()=>{vibrate(VIB.next);callNext();}}>{nextLabel} ▶</button>
                  {spot.hand?.length>=2&&<button className="gto-btn-secondary" style={{padding:"12px 13px",fontSize:13}} title="Jouer jusqu'à la river" onClick={startFullHand}>▶R</button>}
                  <button className="gto-btn-secondary" style={{padding:"12px 13px",fontSize:15}} title="Rejouer" onClick={resetSpot}>↺</button>
                </div>
              </div>
            );
          })()}
          {/* Full-hand : actions mobiles */}
          {renderFhActions()}
          {/* Zone d'action principale */}
          {phase==="hero"&&renderActionZone()}
        </div>

        {/* ── FAB « Voir la solution » (mobile) ── */}
        {isMobile&&phase==="done"&&answered!==null&&!playingFull&&!solOpen&&(
          <button className={`pf-fab${showSol?"":" locked"}`} onClick={()=>{vibrate(VIB.tap);setSolOpen(true);}}>
            {showSol?"💡 Voir la solution":"🔒 Solution"}
          </button>
        )}
        {/* ── Solution plein écran (mobile) ── */}
        {isMobile&&solOpen&&renderMobileSolution()}

        {/* ── RANGE POPUP ── */}
        {rangePopup&&<RangePopup {...rangePopup} onClose={()=>setRangePopup(null)}/>}

      </div>
    );

  return(
    <div className="tw" style={{background:"#040B1F"}}>
      {/* Multi-table : la table ACTIVE projette le VRAI panneau 1T dans la colonne partagée */}
      {/* multi-table : panneau droit rendu par le parent (renderMultiPanel) */}
      {/* ── BARRE TOP compacte : streets + timeline + timer ── */}
      <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",background:"#0a0a14",borderBottom:"1px solid #181825",flexWrap:"wrap",minHeight:28,flexShrink:0}}>
        {STREETS.map(s=>{
          const done=STREETS.indexOf(s)<STREETS.indexOf(spot.street);
          const cur=s===spot.street;
          return <span key={s} style={{
            padding:"1px 7px",borderRadius:20,fontSize:8,fontFamily:T.stats,fontWeight:700,letterSpacing:".05em",
            background:cur?"rgba(255,194,71,.14)":done?"rgba(16,216,122,.08)":"rgba(255,255,255,.03)",
            color:cur?T.gold:done?T.green:T.text4,
            border:`1px solid ${cur?"rgba(255,194,71,.3)":done?"rgba(16,216,122,.15)":"transparent"}`
          }}>{s}</span>;
        })}
        <span style={{width:1,height:10,background:"#152D6E",margin:"0 2px"}}/>
        {tl.map((t,i)=>(
          <span key={i} style={{display:"flex",alignItems:"center",gap:2}}>
            <span style={{fontSize:8,color:T.text4,fontFamily:T.stats,fontWeight:700}}>{t.pos}</span>
            <span className={`tlact ${tlCls(t.act)}`} style={{fontSize:7.5,padding:"1px 5px"}}>{t.lbl}</span>
            {i<tl.length-1&&<span style={{color:T.text4,fontSize:7}}>›</span>}
          </span>
        ))}
        {thinking&&<span className="think" style={{marginLeft:2}}><span>·</span><span>·</span><span>·</span></span>}
        {phase==="hero"&&answered===null&&(
          <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontFamily:T.mono,fontSize:8,color:timerPct<25?T.red:T.text4,fontWeight:timerPct<25?700:400}}>{timerSec>0?Math.ceil(timerPct/100*timerSec)+"s":"∞"}</span>
            <div style={{width:40,height:3,background:"#1a1a2e",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:timerPct+"%",background:timerPct<25?T.red:T.gold,borderRadius:2,transition:"width .08s"}}/>
            </div>
          </span>
        )}
      </div>

      {/* ── ZONE TABLE — calibrée sur les dimensions du script multi-table V1 :
           ovale 2T 400×310 · 3T haut 398×205 (bas 500×164 via CSS) · 4T 398×176.
           Hauteur = espace disponible, largeur dérivée du ratio (proportions maquette
           conservées à toute résolution). Mobile : aspect-ratio en padding (inchangé). ── */}
      <div className="mt-zone-fit" style={isMobile?undefined:{flex:"0 0 auto",width:"100%",display:"flex",justifyContent:"center",paddingTop:2}}>
      <div className="training-table-zone" style={isMobile?{paddingBottom:cfg.pb}:(()=>{
        // Ratio de zone dérivé du ratio d'OVALE cible (script V1) corrigé des marges
        // de la géométrie : ovale 2T 400×310 · 3T haut 398×205 · 4T 398×176.
        const g=trainingLayout.tableGeometry;
        const ovalAR=numTables===2?400/310:numTables===3?398/205:398/176;
        const zoneAR=ovalAR*(1-(g.top+g.bottom)/100)/(1-(g.left+g.right)/100);
        // Piloté par la LARGEUR de cellule (stable quel que soit le contenu des
        // actions) → le ratio d'ovale est identique sur toutes les tables du mode
        // et à toute résolution (le viewport épouse la hauteur naturelle).
        return{width:"100%",height:"auto",aspectRatio:String(zoneAR.toFixed(4)),flexShrink:0};
      })()}>

        {/* FEUTRE OVALE PREMIUM — multi-table (bleu-nuit, cohérent avec le 1T figé) */}
        <div className="felt-oval" style={{
          position:"absolute",top:`${trainingLayout.tableGeometry.top}%`,left:`${trainingLayout.tableGeometry.left}%`,right:`${trainingLayout.tableGeometry.right}%`,bottom:`${trainingLayout.tableGeometry.bottom}%`,
          background:"radial-gradient(ellipse at 50% 25%,rgba(26,62,115,.95) 0%,rgba(13,38,78,.99) 38%,rgba(6,20,46,.998) 70%,#030b1e 100%)",
          border:"1px solid rgba(255,214,121,.58)",
          borderRadius:"50%",
          boxShadow:errorFlash
            ?`inset 0 0 118px rgba(0,0,0,.62),inset 0 20px 48px rgba(255,255,255,.04),0 0 0 3px rgba(5,15,12,.95),0 0 0 5px rgba(255,69,96,.62),0 0 34px rgba(255,69,96,.28)`
            :phase==="hero"
              ?`inset 0 0 118px rgba(0,0,0,.58),inset 0 20px 48px rgba(255,255,255,.045),0 0 0 3px rgba(5,15,12,.95),0 0 0 5px rgba(218,156,48,.7),0 0 0 8px rgba(0,191,255,.16),0 20px 54px rgba(0,0,0,.82),0 0 38px rgba(0,140,255,.18)`
              :`inset 0 0 118px rgba(0,0,0,.58),inset 0 20px 48px rgba(255,255,255,.04),0 0 0 3px rgba(5,15,12,.95),0 0 0 5px rgba(31,139,255,.26),0 0 0 8px rgba(255,194,71,.07),0 20px 54px rgba(0,0,0,.82),0 0 34px rgba(0,140,255,.14)`,
          transition:"box-shadow .25s",
          overflow:"hidden",
          filter:"drop-shadow(0 0 24px rgba(0,191,255,.1))",
        }} key={dk}>
          {/* Rail intérieur */}
          <div style={feltRailStyle(numTables,"outer",trainingLayout.tableGeometry)}/>
          <div style={feltRailStyle(numTables,"inner",trainingLayout.tableGeometry)}/>

          {/* POT + BOARD — multi-table */}
          {(()=>{
            const hasBoard=(!playingFull&&spot.board.length>0)||(playingFull&&fhVisBoard.length>0);
            const boardCards=!playingFull?spot.board:fhVisBoard;
            const potPt=potPointFor(numTables,hasBoard);
            const boardPt=boardPointFor(numTables);
            return(
              <>
                {/* Pot : compact inline si board, centré gros si pas board */}
                {hasBoard?(
                  <div className={`pf-pot-readout compact${potAnim?" pot-val-pop":""}`} style={{position:"absolute",top:`${potPt.y}%`,left:`${potPt.x}%`,transform:"translate(-50%,-50%)",zIndex:7}}>
                    <TrainingPotStack value={mainPotBb} compact themeKey={effChipTheme} colorKey={chipColor} sizeMode={chipSizeMode} tableMode={numTables}/>
                    <span className="pf-pot-label">POT</span>
                    <span className="pf-pot-value">{fmt(mainPotBb)}</span>
                  </div>
                ):(
                  <div className={`pf-pot-readout${numTables>=2?" compact":""}${potAnim?" pot-val-pop":""}`} style={{position:"absolute",top:`${potPt.y}%`,left:`${potPt.x}%`,transform:"translate(-50%,-50%)",zIndex:7}}>
                    <TrainingPotStack value={mainPotBb} compact={numTables>=2} themeKey={effChipTheme} colorKey={chipColor} sizeMode={chipSizeMode} tableMode={numTables}/>
                    <span className="pf-pot-label">POT</span>
                    <span className="pf-pot-value">{fmt(mainPotBb)}</span>
                  </div>
                )}
                {/* Board centré — taille cfg.board adaptée par numTables (zoom ×0.5 via .mt-board-zone) */}
                {hasBoard&&(
                  <div key={`board-mt-${boardKey}`} className="mt-board-zone" style={{position:"absolute",top:`${boardPt.y}%`,left:`${boardPt.x}%`,transform:"translate(-50%,-50%)",display:"flex",gap:cfg.boardGap,zIndex:6,alignItems:"center",filter:"drop-shadow(0 4px 18px rgba(0,0,0,.8)) drop-shadow(0 0 12px rgba(0,0,0,.5))"}}>
                    {boardCards.map((c,i)=>(
                      <div key={i} className="board-card-in" style={{animationDelay:`${i*.07}s`}}>
                        <Card r={c.r} s={c.s} size={cfg.board} delay={0}/>
                      </div>
                    ))}
                    {/* Largeur du board complet réservée (script §7) : emplacements
                       turn/river en attente → aucun recentrage brutal des cartes */}
                    {Array.from({length:Math.max(0,5-boardCards.length)},(_,i)=>(
                      <span key={`ph${i}`} className={`mt-board-ph card-${cfg.board}`} aria-hidden="true"/>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {/* Phase flash overlay */}
          {phaseFlash&&<div className="phase-flash"/>}
          {potDelta&&<div className="pot-delta" style={{top:((!playingFull&&spot.board.length>0)||(playingFull&&fhVisBoard.length>0))?"22%":"42%",fontSize:numTables>=3?7:9,padding:numTables>=3?"1px 5px":"2px 7px"}}>+{fmt(potDelta.amount)}</div>}
          <ChipAnimation event={chipMove} compact={numTables>=3}/>
          {/* Chips animations directionnels */}
          {heroChip&&<div className="chip-hero-fly"><span>{heroChip}</span></div>}
          {vilChip&&<div className="chip-vil-fly"><span>{vilChip}</span></div>}
          {/* CHIP ANIM legacy */}
          {chipAnim&&<div className="chip-fly"><span>{chipAnim}</span></div>}
        </div>

        {/* DEALER BUTTON — taille cfg.dbtnSz (aligné sur le siège BTN multi-table) */}
        {(()=>{
          const d=dealerAnchorPoint(trainingLayout);
          const sz=cfg.dbtnSz;
          return <div className="dealer-btn dealer-btn-v2" style={{left:`${d.x}%`,top:`${d.y}%`,width:sz,height:sz}}><img src={dealerSvgUrl} alt="D" draggable="false" style={{width:"100%",height:"100%",display:"block"}}/></div>;
        })()}

        {/* SIÈGES — tailles 100% basées sur cfg */}
        {compactActionLine()&&<div className="table-action-line compact"><strong>{spot.street.slice(0,3)}</strong> {compactActionLine()}</div>}

        {showStaticBlindMarkers&&["SB","BB"].map(pos=>{
          const {x,y}=trainingLayout.seats[pos]||{x:50,y:50};
          const p=resolveTrainerBlindPoint(trainingLayout,pos);
          const bp=y>=76?0.62:0.34; // marqueurs blinds au-dessus des cartes (sièges bas)
          const bx=x+(50-x)*bp;
          const by=y+(50-y)*bp;
          return(
            <div key={`blind-mt-${pos}`} className="pf-blind-anchor" style={{left:`${p.x}%`,top:`${p.y}%`}}>
              <BlindChipStack amount={postedBlinds[pos]} label={pos} compact={numTables>=3} themeKey={effChipTheme} colorKey={chipColor} sizeMode={chipSizeMode} tableMode={numTables}/>
            </div>
          );
        })}

        {TRAINING_SEAT_ORDER.map(pos=>{
          const coord=trainingLayout.seats[pos];
          if(!coord)return null;
          const {x,y}=coord;
          const isH=pos===spot.hpos, isV=pos===spot.vpos;
          const seatState=seatStates[pos]||{};
          const seatFolded=!!seatState.folded;
          const seatMultiway=!!seatState.multiway&&!isH&&!isV&&!seatFolded;
          const isActive=(activePlayerId==="hero"&&isH)||(activePlayerId==="villain"&&isV);
          const sz=cfg.seat;
          const col=isH?T.gold:isV?"#c090ff":T.text3;
          const bg=isH?"rgba(255,194,71,.12)":isV?"rgba(155,92,255,.1)":"rgba(31,139,255,.04)";
          const bord=isH?T.gold:isV?"#9B5CFF":"rgba(26,58,128,.6)";
          const shadow=isActive
            ?(isH?`0 0 0 2px rgba(255,194,71,.6),0 0 ${sz*.4}px rgba(255,194,71,.4)`:`0 0 0 2px rgba(155,92,255,.5),0 0 ${sz*.35}px rgba(155,92,255,.3)`)
            :`0 2px 8px rgba(0,0,0,.5)`;
          const seatLiveAction=tableAction?.position===pos?tableAction:null;
          const seatLoggedAction=[...handLog].reverse().find(a=>a.position===pos);
          const seatActionSource=seatLiveAction||seatLoggedAction||null;
          const lastAct=isH&&answered!==null
            ?{id:seatActionSource?.actionType||spot.acts[answered]?.id,l:seatActionSource?.displayLabel||spot.acts[answered].l}
            :isV&&vact?{id:seatActionSource?.actionType||vact.action,l:seatActionSource?.displayLabel||vact.label}:null;
          const topOffset=Math.round(sz*.3)+2; // cartes au-dessus du chip
          const hasVilBet=isV&&vact&&!["FOLD","CHECK","WIN"].includes(lastAct?.id||vact.action);
          // Pré-décision : jetons engagés par le vilain (open/3-bet/c-bet) AVANT que Hero agisse
          const mtPreFacing=answered===null&&!vact&&!playingFull&&isV&&spotCtx.facing&&spotCtx.facing.position===pos;
          const mtPreExtra=answered===null&&!vact&&!playingFull&&!isH&&!isV&&seatState.invested>0;
          const eventAmount=roundBb(seatActionSource?.actionEvent?.displayAmount??seatActionSource?.displayAmount??seatActionSource?.committedAmount??seatActionSource?.amountBb??0);
          const vilBetAmt=hasVilBet?eventAmount:(mtPreFacing?spotCtx.facing.amount:(mtPreExtra?seatState.invested:0));
          const vilChipLabel=hasVilBet?(seatActionSource?.actionLabel||trainerActionDisplayVerb(seatActionSource?.actionType,lastAct)):(mtPreFacing?spotCtx.facing.label:(mtPreExtra?seatState.lastLabel||"Call":null));
          const vilChipCol=seatMultiway?"#00E6B8":hasVilBet?vact.color:"#9B5CFF";
          const vilChipCount=vilBetAmt>0?Math.min(6,Math.max(1,Math.ceil(vilBetAmt/4))):0;
          const heroAnsweredAction=isH&&answered!==null?spot.acts[answered]:null;
          // ── Action Hero la plus récente (audit libellé) ──
          // Si Hero a répondu à une mise (call/fold/raise via hero_reply), `tableAction`
          // porte ce dernier coup réel. On l'utilise comme source de vérité pour que le
          // jeton affiche « Call 10bb » et non « bet 10bb » (le type de la décision initiale).
          const heroLiveAction=isH&&seatActionSource?.playerId==="hero"?seatActionSource:null;
          const heroLiveType=heroLiveAction?(heroLiveAction.actionType||"").toUpperCase()
            :(heroAnsweredAction?trainerActionType(heroAnsweredAction):null);
          const hasHeroBet=!!heroLiveType&&!["FOLD","CHECK","CHECK_BACK","WIN"].includes(heroLiveType);
          const heroBetAmt=hasHeroBet?roundBb(heroLiveAction?.actionEvent?.displayAmount??heroLiveAction?.displayAmount??heroLiveAction?.committedAmount??heroLiveAction?.amountBb??0):0;
          const heroChipLabel=hasHeroBet
            ?(heroLiveAction
                ?(heroLiveAction.actionLabel||trainerActionDisplayVerb(heroLiveType,heroAnsweredAction))
                :heroAnsweredAction?.l)
            :null;
          const seatActionAmount=hasHeroBet?heroBetAmt:vilBetAmt;
          const seatActionLabel=hasHeroBet?heroChipLabel:vilChipLabel;
          const seatActionType=hasHeroBet
            ?(heroLiveType==="3BET"||heroLiveType==="4BET"||heroLiveType==="5BET"?"RAISE":heroLiveType)
            :trainerVisualActionType(vilChipLabel||vact?.action||seatState.lastAction||"BET");
          // Jetons poussés vers le centre (au-dessus des cartes) — sièges bas plus loin (anti-chevauchement)
          const actionPt=resolveTrainerActionPoint(trainingLayout,pos,{hasBoard:hasVisibleBoard});
          const cpx=actionPt.x, cpy=actionPt.y;
          const isTopSeatMt=y<=24;
          const isBottomSeatMt=y>=74;
          const mtSeatTransform=isMobile
            ?(isTopSeatMt?"translate(-50%,-27%)":isBottomSeatMt?"translate(-50%,-55%)":"translate(-50%,-50%)")
            :isTopSeatMt?"translate(-50%,-22%)":isBottomSeatMt?"translate(-50%,-48%)":"translate(-50%,-50%)";
          const mtHeroCardSize=isTopSeatMt?(numTables===2?"md":numTables===3?"smp":"sm"):cfg.heroCard;
          const mtHeroGap=isTopSeatMt?Math.max(1,(numTables>=3?1:2)):(numTables>=3?2:4);
          const mtHeroMargin=isTopSeatMt?1:(numTables>=3?1:3);
          return(
            <React.Fragment key={pos}>
            <PlayerSeat pos={pos} mode={`${numTables}T`} className={`pf-mt-seat${seatFolded?" pf-mt-seat-folded":""}${seatMultiway?" pf-mt-seat-multiway":""}`} style={{left:`${x}%`,top:`${y}%`,transform:mtSeatTransform,gap:1,zIndex:20}}>

              {/* Cartes Hero au-dessus du siège — toutes tables, taille cfg.heroCard + glow doré */}
              {isH&&(
                <HeroHoleCards cards={spot.hand} size={mtHeroCardSize} gap={mtHeroGap} compact={numTables>=3} style={{marginBottom:mtHeroMargin}}/>
              )}
              {!isH&&(
                <VillainBackCards size={cfg.vilCard} animated={isV&&(thinking||fhVilThink)&&!seatFolded} gap={numTables>=3?1:2} compact={numTables>=3} muted={!isV&&!seatMultiway} folded={seatFolded} style={{marginBottom:numTables>=3?0:2}}/>
              )}

              {/* Chip principal — HERO premium */}
              <div
                className={isH?(isActive?"seat-active-hero seat-hero-halo":"seat-hero-halo"):""}
                style={{
                  width:isH?sz+12:sz+10,height:isH?sz+12:sz+10,borderRadius:"50%",
                  background:"transparent",
                  border:0,
                  boxShadow:"none",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  position:"relative",transition:"box-shadow .2s",
                }}>
                {isH&&isActive&&<div className="hero-seat-badge" style={{fontSize:numTables>=3?"5.5px":"6px",padding:"1px 5px",top:"-16px"}}>{numTables>=3?"TOI":"A toi"}</div>}
                {isV&&isActive&&<div className="hero-seat-badge" style={{fontSize:numTables>=3?"5px":"6px",padding:"1px 5px",top:"-16px",background:"rgba(155,92,255,.18)",borderColor:"rgba(155,92,255,.45)",color:"#c090ff"}}>{numTables>=3?"IA...":"Reflechit"}</div>}
                <PlayerAvatarPremium isHero={isH} isVillain={isV} profile={isV?spot.vtype:isH?"Hero":seatState.profile||trainerSeatAvatarProfile(pos)} size={Math.max(24,sz)} active={isActive||seatMultiway} compact={numTables>=3}/>

                {/* Dos villain 3T/4T — discrets, cx */}
                {false&&numTables>=3&&isV&&(thinking||answered!==null)&&(
                  <div style={{position:"absolute",top:-topOffset,display:"flex",gap:1}}>
                    <CardBack size={cfg.vilCard}/><CardBack size={cfg.vilCard}/>
                  </div>
                )}
                {/* Active indicator */}
                {isActive&&isH&&<div style={{position:"absolute",top:-6,right:-6,width:Math.round(sz*.22),height:Math.round(sz*.22),borderRadius:"50%",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.round(sz*.12),fontWeight:900,color:"#030712",boxShadow:"0 0 8px rgba(255,194,71,.8)"}}>{numTables<=2?"▶":""}</div>}
                {/* Thinking dots */}
                {(thinking||fhVilThink)&&isV&&<div style={{position:"absolute",bottom:-Math.round(sz*.3)}}><span className="think"><span>·</span><span>·</span><span>·</span></span></div>}
              </div>

              <div className="pf-mt-nameplate" style={{fontSize:cfg.fstk-1,color:isH?T.gold:isV?"#c090ff":T.text4}}>
                {isH&&<span className="pf-seat-hero-chip" style={{fontSize:numTables>=3?5:6,padding:"1px 5px",margin:0}}>HERO</span>}
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:900,lineHeight:1}}>{pos}</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,lineHeight:1,color:isH?T.gold:T.text3}}>{fmt(isH?parseFloat(spot.stack):60)}</span>
              </div>
              {seatFolded&&!isH&&!isV&&<span className="pf-fold-chip" style={{fontSize:numTables>=3?5.5:6.5,padding:numTables>=3?"1px 5px":"2px 6px",marginTop:1}}>Fold</span>}
              {seatMultiway&&<span className="pf-multiway-chip" style={{fontSize:numTables>=3?5.5:6.5,padding:numTables>=3?"1px 5px":"2px 6px",marginTop:1}}>In pot</span>}
              {/* Badge action */}
              {lastAct&&!playingFull&&!(seatActionAmount>0)&&(()=>{
                // Type réel le plus récent (audit libellé) : la réponse Hero (fold/call/raise)
                // prime sur l'acte de décision initial pour la couleur du badge.
                const aId=isH?(heroLiveAction?heroLiveType:spot.acts[answered]?.id):vact?.action;
                const aCls=aId==="FOLD"?"action-fold":aId==="CALL"?"action-call":aId==="CHECK"||aId==="CHECK_BACK"?"action-check":aId==="RAISE"||aId==="3BET"||aId==="4BET"||aId==="5BET"?"action-raise":aId==="ALLIN"?"action-allin":"action-bet";
                return <span className={`seat-action-badge ${aCls}`} style={{fontSize:cfg.fstk-2,padding:"2px 5px",marginTop:1,maxWidth:numTables>=3?82:118,overflow:"hidden",textOverflow:"ellipsis"}}>{lastAct.l}</span>;
              })()}
            </PlayerSeat>
            {/* CHIP PILE villain — between seat and pot center */}
            {false&&vilChipCount>0&&(
              <div style={{position:"absolute",left:`${cpx}%`,top:`${cpy}%`,transform:"translate(-50%,-50%)",zIndex:18,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                {/* Pile de jetons — diamètre 16px, séparés de 5px */}
                <div style={{position:"relative",width:16,height:16+(vilChipCount-1)*5,filter:`drop-shadow(0 5px 12px ${seatMultiway?"rgba(0,230,184,.62)":"rgba(155,92,255,.65)"}) drop-shadow(0 2px 5px rgba(0,0,0,.8))`}}>
                  {[...Array(vilChipCount)].map((_,ci)=>(
                    <div key={ci} style={{
                      position:"absolute",bottom:ci*5,left:0,
                      width:16,height:16,borderRadius:"50%",
                      background:(seatMultiway?["#00E6B8","#00A88E","#036B62","#C0FFF2","#1F8BFF"]:["#A86FFF","#8040DD","#6030AA","#402077","#C890FF"])[ci%5],
                      border:`2px solid ${seatMultiway?"#00A88E":"#9535CC"}`,
                      boxShadow:"inset 0 -3px 4px rgba(0,0,0,.65),inset 0 2px 3px rgba(255,255,255,.32),0 2px 6px rgba(0,0,0,.85)",
                    }}/>
                  ))}
                </div>
                {/* Montant en gros */}
                <span style={{fontSize:cfg.fstk,fontFamily:"'JetBrains Mono',monospace",fontWeight:900,color:"#d8aaff",textShadow:"0 0 12px rgba(155,92,255,.7)",background:"rgba(0,0,0,.5)",padding:"0 4px",borderRadius:3,lineHeight:1.3}}>{fmt(vilBetAmt)}</span>
                {/* Label action — badge coloré avec glow */}
                {vilChipLabel&&<span style={{fontSize:cfg.fstk-0.5,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,color:vilChipCol,background:`${vilChipCol}28`,padding:"2px 6px",borderRadius:5,border:`1.5px solid ${vilChipCol}60`,whiteSpace:"nowrap",boxShadow:`0 0 10px ${vilChipCol}45,inset 0 0 6px ${vilChipCol}18`}}>{vilChipLabel}</span>}
              </div>
            )}
            <SeatActionZone
              x={cpx}
              y={cpy}
              amount={!playingFull?seatActionAmount:0}
              label={seatActionLabel||trainerActionVerb(seatActionType)}
              type={seatActionType}
              compact={isMobile||numTables>=3}
              kind={isH?"hero":seatMultiway?"multiway":"villain"}
              themeKey={effChipTheme}
              colorKey={chipColor}
              sizeMode={chipSizeMode}
              tableMode={numTables}
            />
            </React.Fragment>
          );
        })}
      </div>
      </div>{/* ── fin mt-zone-fit ── */}

      {/* ── TOAST ── */}
      {showToast&&<div className="error-toast"><span className="error-toast-icon">⚠</span>{showToast}</div>}

      {/* ── VILLAIN ZONE compacte ── */}
      {phase==="villain_thinking"&&(
        <div className="vil-decision-banner" style={{padding:"5px 8px",background:"linear-gradient(90deg,rgba(155,92,255,.1),rgba(155,92,255,.03))",borderTop:"1px solid rgba(155,92,255,.25)",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{fontSize:8,color:"#c090ff",fontFamily:T.stats,fontWeight:700,padding:"1px 6px",borderRadius:10,background:"rgba(155,92,255,.12)",border:"1px solid rgba(155,92,255,.25)"}}>{spot.vpos} · {spot.vtype}</span>
          <span className="think"><span>·</span><span>·</span><span>·</span></span>
          <span style={{fontSize:7.5,color:"rgba(155,92,255,.6)",fontFamily:T.stats,fontStyle:"italic"}}>IA joue…</span>
          <div style={{marginLeft:"auto",flex:"1 0 40px",overflow:"hidden",borderRadius:1}}>
            <div className="think-bar" style={{height:2,background:"linear-gradient(90deg,rgba(155,92,255,.4),#9B5CFF)"}}/>
          </div>
        </div>
      )}
      {vact&&phase!=="hero"&&phase!=="villain_thinking"&&(
        <div className="vil-decision-banner" style={{padding:"5px 8px",background:"rgba(155,92,255,.05)",borderTop:"1px solid rgba(155,92,255,.18)",display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:8,color:"#c090ff",fontFamily:T.stats,fontWeight:700}}>{spot.vpos}</span>
            <span style={{padding:"2px 7px",borderRadius:6,fontSize:9,fontWeight:700,fontFamily:T.stats,background:`${vact.color}18`,color:vact.color,border:`1px solid ${vact.color}33`}}>{vact.label}</span>
            {vact.amount&&<span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>→ Pot {fmt(currentPotBb)}</span>}
          </div>
          {vact.action==="FOLD"&&(
            <span style={{fontSize:7.5,color:"#FFC247",fontFamily:T.stats,fontStyle:"italic",paddingLeft:2}}>
              ⚡ Spot termine - vous remportez {fmt(currentPotBb)}
            </span>
          )}
          {vact.action==="ALLIN"&&(
            <span style={{fontSize:7.5,color:"#FF4560",fontFamily:T.stats,fontStyle:"italic",paddingLeft:2}}>
              ⚡ All-in — stacks à tapis, pas de décision suivante
            </span>
          )}
        </div>
      )}

      {/* ── HERO REPLY (multi-table) ── */}
      {phase==="hero_reply"&&vact&&(
        <div className="hero-reply-zone" style={{padding:"6px 8px 8px",background:"linear-gradient(180deg,rgba(255,194,71,.06),#0a0a14)",borderTop:"2px solid rgba(255,194,71,.35)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
            <div className="hero-turn-glow" style={{
              padding:"1px 7px",borderRadius:20,
              background:"rgba(255,194,71,.1)",border:"1px solid rgba(255,194,71,.4)",
              fontFamily:"'Space Grotesk',sans-serif",fontSize:8,fontWeight:800,color:T.gold,
            }}>🎮 HERO</div>
            <span style={{fontSize:9,color:vact.color,fontWeight:700,fontFamily:T.stats}}>face au {vact.label}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
            <button className="ab ab-FOLD" style={{padding:"8px 3px",borderRadius:7,fontSize:9}} onClick={()=>handleHeroReply("FOLD")}>Fold<span className="ab-sub">Abandon</span></button>
            <button className="ab ab-CALL" style={{padding:"8px 3px",borderRadius:7,fontSize:9}} onClick={()=>handleHeroReply("CALL")}>Call<span className="ab-sub">{vact.amount?fmt(vact.amount):"0bb"}</span></button>
            <button className="ab ab-RAISE" style={{padding:"8px 3px",borderRadius:7,fontSize:9}} onClick={()=>handleHeroReply("RAISE")}>Raise<span className="ab-sub">2.5x</span></button>
          </div>
        </div>
      )}

      {/* ── ACTIONS HERO multi-table — cfg dynamique + solution masquée ── */}
      {phase==="hero"&&(
        <div style={{padding:`5px 6px 7px`,background:"linear-gradient(180deg,rgba(255,194,71,.05),#040B1F,#030D2A)",borderTop:"2px solid rgba(255,194,71,.3)",flexShrink:0}}>
          {/* Info spot */}
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:cfg.actFnt-3,fontWeight:600,color:T.text2,marginBottom:4,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:5,flexWrap:"wrap"}}>
            <span className="hero-turn-glow" style={{padding:"1px 6px",borderRadius:10,background:"rgba(255,194,71,.1)",border:"1px solid rgba(255,194,71,.3)",fontFamily:"'Space Grotesk',sans-serif",fontSize:cfg.actFnt-4,fontWeight:800,color:T.gold}}>🎮</span>
            <span style={{color:T.gold,fontWeight:700}}>{spot.hpos}</span>
            <span style={{color:T.text4}}>vs</span>
            <span style={{color:"#c090ff",fontWeight:700}}>{spot.vpos}</span>
            {spot.toCall>0&&<span style={{color:T.amber,fontFamily:"'JetBrains Mono',monospace",fontSize:cfg.actFnt-4}}>{fmt(spot.toCall)}</span>}
            {/* Pot Odds compact */}
            {potOddsStr&&<span style={{marginLeft:"auto",fontSize:cfg.actFnt-5,color:T.text4,fontFamily:T.mono,padding:"1px 4px",borderRadius:3,background:"rgba(255,138,0,.08)"}}>Odds {potOddsStr}</span>}
            {/* SPR compact */}
            <span style={{fontSize:cfg.actFnt-5,color:"rgba(155,92,255,.7)",fontFamily:T.mono}}>SPR {spr}</span>
          </div>
          {/* Main Hero dans la zone d'action — 3T/4T : lisibilité garantie */}
          {numTables>=3&&spot.hand.length>=2&&(
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:5,marginBottom:5,padding:"3px 6px",background:"rgba(255,194,71,.05)",borderRadius:7,border:"1px solid rgba(255,194,71,.14)"}}>
              <div className="hero-card-wrap" style={{display:"flex",gap:3}}>
                {spot.hand.map((c,ci)=><Card key={ci} r={c.r} s={c.s} size={cfg.heroCard} delay={0}/>)}
              </div>
              <span style={{fontSize:cfg.actFnt-3,color:T.text4,fontFamily:T.stats,fontWeight:600}}>{spot.hpos} <span style={{color:T.gold}}>•</span> {fmt(currentPotBb)}</span>
            </div>
          )}
          {/* Boutons — sizing neutre avant réponse */}
          <div style={{display:"grid",gridTemplateColumns:spot.acts.length>=3?"repeat(3,1fr)":"repeat(2,1fr)",gap:cfg.compact?3:5}}>
            {spot.acts.map((a,i)=>{
              const sIsAmount=/^\d|bb$|\$/.test(a.s||"");
              return(
                <button key={i} className={`gto-btn gto-btn-${a.id}${errorBtn===i?" btn-error":""}`}
                  style={{borderRadius:cfg.compact?7:10}}
                  onClick={()=>handleHeroAct(i)}>
                  <div className="gto-btn-inner" style={{padding:cfg.actPad}}>
                    <span className="gto-btn-label" style={{fontSize:cfg.actFnt}}>{a.l}</span>
                    {/* Afficher le montant seulement s'il est numérique */}
                    {sIsAmount&&<span className="gto-btn-sizing" style={{fontSize:cfg.actFnt-3}}>{a.s}</span>}
                  </div>
                  {/* Hint pédagogique seulement si solution visible */}
                  {(!cfg.compact&&showSol&&sIsAmount)&&<div className="gto-btn-hint" style={{fontSize:cfg.actFnt-4,padding:"3px 10px"}}>{a.s}</div>}
                </button>
              );
            })}
          </div>
          {/* Difficulté badge compact */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginTop:3}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:diffCol,flexShrink:0}}/>
            <span style={{fontSize:cfg.actFnt-5,color:T.text4,fontFamily:T.stats}}>{diffLabel}</span>
            <span style={{fontSize:cfg.actFnt-5,color:T.text4,fontFamily:T.stats,marginLeft:4}}>POT {fmt(currentPotBb)}</span>
          </div>
        </div>
      )}

      {/* ── EV RÉSULTATS MULTI-TABLE ── */}
      {answered!==null&&renderHeroFeedback()}

      {phase==="done"&&answered!==null&&(()=>{
        const bestEv=spot.ev[spot.acts[spot.ok]?.id]||0;
        const myEv=spot.ev[spot.acts[answered]?.id]||0;
        const evDiff=myEv-bestEv;
        const isBest=answered===spot.ok;
        const qualityLabel=isBest?"Best Move ✦":evDiff>=-0.3?"Correct ✓":evDiff>=-1?"Imprécision ⚠":evDiff>=-3?"Erreur ✗":"Blunder 💥";
        const qualityCls=isBest?"gto-best":evDiff>=-0.3?"gto-correct":evDiff>=-1?"gto-inaccuracy":evDiff>=-3?"gto-wrong":"gto-blunder";

        /* ── Solution MASQUÉE ou MOBILE : feedback minimal — le détail vit dans l'overlay 💡 ── */
        if(!showSol||isMobile){
          return(
            <div style={{padding:"6px 8px",background:"linear-gradient(90deg,#071B44,#040B1F)",borderTop:"1px solid #152D6E",display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap"}}>
              <span className={`gto-quality ${qualityCls}`} style={{fontSize:10,padding:"3px 9px"}}>{qualityLabel}</span>
              <span style={{fontSize:10,color:T.text3,fontFamily:T.stats}}>
                Joué : <span style={{color:isBest?T.green:T.red,fontWeight:700}}>{spot.acts[answered]?.l}</span>
              </span>
              <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                {isMobile&&(
                  <button className="btn btns" style={{fontSize:10,padding:"5px 10px",color:showSol?T.gold:T.text3,borderColor:showSol?"rgba(255,194,71,.4)":undefined}}
                    onClick={()=>{vibrate(VIB.tap);setSolOpen(true);}}>{showSol?"💡 Solution":"🔒"}</button>
                )}
                {numTables===1
                  ?<button className="btn btng" style={{fontSize:10,padding:"5px 12px"}} disabled={nextBusy} onClick={callNext}>{nextShortLabel} ▶</button>
                  :<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:T.green,padding:"4px 10px",background:"rgba(16,216,122,.1)",borderRadius:5,border:"1px solid rgba(16,216,122,.25)"}}>✓ OK</span>
                }
                <button className="btn btns" style={{fontSize:11,padding:"5px 8px"}}
                  onClick={resetSpot}>↺</button>
              </div>
            </div>
          );
        }

        /* ── Solution VISIBLE : grille EV complète ── */
        return(
        <>
          {/* Header verdict */}
          <div style={{padding:"5px 8px",display:"flex",alignItems:"center",gap:8,background:"linear-gradient(90deg,#071B44,#040B1F)",borderTop:"1px solid #152D6E",flexShrink:0,flexWrap:"wrap"}}>
            <span className={`gto-quality ${qualityCls}`} style={{fontSize:10,padding:"3px 9px"}}>{qualityLabel}</span>
            {!isBest&&<span style={{fontSize:9,color:T.text3,fontFamily:T.stats}}>EV loss : <span style={{color:T.red,fontWeight:700}}>{evDiff.toFixed(2)}bb</span></span>}
            {isBest&&<span style={{fontSize:9,color:T.green,fontFamily:T.stats}}>Fréquence GTO : <span style={{color:T.green,fontWeight:700}}>{spot.freq[spot.acts[answered]?.id]||0}%</span></span>}
          </div>
          {/* Grille EV */}
          <div className={`evgrid ${spot.acts.length>=3?"evg3":"evg2"}`}>
            {spot.acts.map((a,i)=>{
              const freq=spot.freq[a.id]||0,ev=spot.ev[a.id]||0;
              const isc=i===spot.ok,isa=i===answered;
              const cls=isc?"ev-ok":freq>=20?"ev-warn":"ev-bad";
              return(
                <div key={i} className={`evcell ${cls}`} style={{outline:isa?`2px solid ${isc?T.green:T.red}`:"none",padding:numTables>=3?"5px":"7px",borderRadius:9}}>
                  <div className="evrow">
                    <span style={{fontSize:9,color:isc?T.green:isa?T.red:T.text3,fontWeight:700}}>{isc?"✓ ":isa?"⚠ ":"  "}</span>
                    <span className="evlbl" style={{color:isc?T.green:isa?T.red:T.text2,fontSize:numTables>=3?8:9.5,fontWeight:700}}>{a.l}</span>
                    <span className="evfreq" style={{color:isc?T.green:freq>15?T.amber:T.text4,fontSize:numTables>=3?8:9,fontFamily:T.mono}}>{freq}%</span>
                  </div>
                  <div style={{fontFamily:T.mono,fontSize:8,color:isc?T.green:isa?T.red:T.text3,textAlign:"right",marginBottom:3}}>{ev>=0?"+":""}{ev.toFixed(2)} EV</div>
                  <div className="evbar" style={{height:5}}><div className="evbarfill" style={{width:freq+"%",background:isc?T.green:isa?"rgba(255,69,96,.6)":freq>=20?T.amber:"rgba(26,58,128,.5)"}}/></div>
                </div>
              );
            })}
          </div>
          {/* Barre fréquence */}
          <div className="freqbar" style={{margin:"0 8px 4px",height:6,borderRadius:3}}>
            {spot.acts.map((a,i)=>{const freq=spot.freq[a.id]||0;const cols=[T.red,T.green,T.blue,T.amber,T.purple];return freq>0?<div key={i} className="freqseg" style={{flex:freq,background:cols[i],opacity:.8}}/>:null;})}
          </div>
          {/* Solution détaillée (toujours visible dans ce bloc car showSol=true) */}
          <div className={`solbox ${answered===spot.ok?"sol-ok":"sol-ko"}`} style={{margin:"0 8px 6px"}}>
            <div className="solhdr">
              <span style={{fontSize:12}}>{answered===spot.ok?"✅":"❌"}</span>
              <span style={{color:answered===spot.ok?T.green:T.red,fontSize:10.5,fontWeight:700}}>{answered===spot.ok?"Correct !":"Incorrect — voir GTO ci-dessus"}</span>
            </div>
            <div className="solbody" style={{fontSize:10}}>{spot.expl}</div>
          </div>
          <div className="blbox" style={{margin:"0 8px 6px"}}>
            <div className="blhdr" style={{fontSize:9.5}}>🏆 Meilleure ligne : {spot.best}</div>
            <div className="blbody">
              {spot.detail.map((d,i)=><div key={i} className="blrow"><div className="blico" style={{fontSize:8}}>{d.i}</div><div className="bltxt" style={{fontSize:10}}>{d.t.replace(/<[^>]*>/g,"")}</div></div>)}
              {spot.leaks?.length>0&&<div className="leakbox"><div className="leaklbl">Leaks fréquents</div>{spot.leaks.map((l,i)=><div key={i} className="leakitem" style={{fontSize:9.5}}>• {l}</div>)}</div>}
            </div>
          </div>
          {/* ── Feedback ICM / Push-Fold (si applicable) ── */}
          <PushFoldFeedbackCard spot={spot} compact/>
          {/* ── RÉACTION DU VILAIN compacte (multi-table) ── */}
          {vact&&(()=>{
            const isFold=vact.action==="FOLD";
            const isWin=vact.action==="WIN";
            const isAllin=vact.action==="ALLIN";
            const termMsg=isFold
              ?`${spot.vpos} fold -> vous remportez ${fmt(currentPotBb)}`
              :isWin?`⚡ ${spot.vpos} gagne le pot (votre main est battue).`
              :isAllin?`⚡ All-in — stacks à tapis, pas de décision suivante.`
              :null;
            return(
              <div style={{margin:"0 8px 6px",borderRadius:7,border:`1px solid ${vact.color}33`,background:`${vact.color}07`,padding:"5px 9px",display:"flex",flexDirection:"column",gap:3}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:8,fontWeight:700,color:"#9FB0CC",fontFamily:T.stats}}>🎭 {spot.vpos}</span>
                  <span style={{padding:"1px 7px",borderRadius:20,background:`${vact.color}18`,border:`1px solid ${vact.color}44`,fontSize:8.5,fontWeight:700,color:vact.color}}>{vact.label}</span>
                  {vact.amount>0&&<span style={{fontSize:8,color:T.text4,fontFamily:T.mono}}>→ {vact.amount}bb</span>}
                </div>
                {termMsg&&<span style={{fontSize:8.5,color:"#FFC247",fontFamily:T.stats,fontStyle:"italic"}}>{termMsg}</span>}
              </div>
            );
          })()}
          <div style={{padding:"0 8px 8px"}}><RangeGrid pos={spot.hpos} action={spot.acts[spot.ok]?.id?.toLowerCase()||"open"} stackBB={parseFloat(spot.stack)||100} label={`RANGE ${spot.hpos} — ${spot.acts[spot.ok]?.l||"Optimal"}`}/></div>
          {!playingFull&&<div className="nextrow">
            {numTables===1
              ?<button className="btn btng" style={{flex:1,fontSize:10}} disabled={nextBusy} onClick={callNext}>{nextShortLabel} ►</button>
              :<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:T.green,padding:"4px 10px",background:"rgba(16,216,122,.1)",borderRadius:5,border:"1px solid rgba(16,216,122,.25)"}}>✓ OK</span>
            }
            {spot.hand?.length>=2&&numTables===1&&<button className="btn btnx" style={{fontSize:9}} onClick={startFullHand}>▶ River</button>}
            <button className="btn btns" style={{fontSize:9}} onClick={resetSpot}>↺</button>
          </div>}
          {playingFull&&fhPhase==="hero"&&(
            <div style={{padding:"6px 8px 8px",background:"#0a0a14",borderTop:"1px solid #181825"}}>
              <div style={{fontSize:9,color:T.text2,fontFamily:T.stats,marginBottom:5,textAlign:"center"}}>
                <span style={{fontFamily:T.brand,fontSize:8,color:T.gold}}>{fhStreet.toUpperCase()}</span> — Action ?
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4}}>
                <button className="ab ab-CHECK" style={{padding:"9px 3px",fontSize:9}} onClick={()=>fhHeroAct("CHECK")}>Check<span className="ab-sub">0bb</span></button>
                <button className="ab ab-CALL" style={{padding:"9px 3px",fontSize:9}} onClick={()=>fhHeroAct("BET")}>½ Pot<span className="ab-sub">{fmt(fhPot*.5|0)}</span></button>
                <button className="ab ab-RAISE" style={{padding:"9px 3px",fontSize:9}} onClick={()=>fhHeroAct("RAISE")}>PSB<span className="ab-sub">{fmt(fhPot)}</span></button>
                <button className="ab ab-FOLD" style={{padding:"9px 3px",fontSize:9}} onClick={()=>fhHeroAct("FOLD")}>Fold<span className="ab-sub">—</span></button>
              </div>
            </div>
          )}
          {playingFull&&fhPhase==="hero_facing_bet"&&fhVilAct&&(
            <div style={{padding:"6px 8px 8px",background:"#0a0a14",borderTop:"1px solid #181825"}}>
              <div style={{fontSize:9,color:"#c090ff",fontFamily:T.stats,marginBottom:5,textAlign:"center",fontWeight:700}}>
                {spot.vpos} <span style={{color:fhVilAct.color}}>{fhVilAct.label}</span> — ta réponse ?
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
                <button className="ab ab-FOLD" style={{padding:"9px 3px",fontSize:9}} onClick={()=>fhHeroFaceBet("FOLD")}>Fold<span className="ab-sub">—</span></button>
                <button className="ab ab-CALL" style={{padding:"9px 3px",fontSize:9}} onClick={()=>fhHeroFaceBet("CALL")}>Call<span className="ab-sub">{fmt(fhVilAct.amount||Math.round(fhPot*.5))}</span></button>
                <button className="ab ab-RAISE" style={{padding:"9px 3px",fontSize:9}} onClick={()=>fhHeroFaceBet("RAISE")}>Raise<span className="ab-sub">2.5×</span></button>
              </div>
            </div>
          )}
          {playingFull&&fhPhase==="done"&&fhResult&&(()=>{
            const rc=fhBuildRecap(fhActs,spot,fhResult);
            return(
            <div style={{padding:"8px 8px 10px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6}}>
                <div style={{fontFamily:T.brand,fontSize:12.5,fontWeight:900,color:fhResult==="win"?T.green:T.red}}>{fhResult==="win"?"🏆 GAGNÉE":"❌ PERDUE"}</div>
                <span style={{fontFamily:T.mono,fontSize:9.5,fontWeight:800,color:rc.scoreCol,background:`${rc.scoreCol}1a`,border:`1px solid ${rc.scoreCol}55`,borderRadius:6,padding:"2px 7px"}}>{rc.score}/100</span>
              </div>
              {/* récap compact par street */}
              <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:6}}>
                {rc.streets.map((st,i)=>(
                  <div key={i} style={{display:"flex",gap:6,alignItems:"center",fontSize:8.5,fontFamily:T.stats}}>
                    <span style={{fontWeight:800,color:st.col,minWidth:34}}>{st.label}</span>
                    <span style={{color:T.text3,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.line}</span>
                    <span style={{color:st.col,fontWeight:700}}>{st.verdict}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6,justifyContent:"center",alignItems:"center"}}>
                {numTables===1
                  ?<button className="btn btng" style={{fontSize:10}} disabled={nextBusy} onClick={()=>{setPlayingFull(false);callNext();}}>{nextShortLabel} ►</button>
                  :<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:T.green,padding:"4px 10px",background:"rgba(16,216,122,.1)",borderRadius:5,border:"1px solid rgba(16,216,122,.25)"}}>✓ Main réglée</span>}
                <button className="btn btns" style={{fontSize:10}} onClick={startFullHand}>↺</button>
              </div>
            </div>
            );
          })()}
        </>
        );
      })()}
      {/* ── Solution plein écran mobile (multi-table) ── */}
      {isMobile&&solOpen&&renderMobileSolution()}
    </div>
  );
}

/* ═══════════════════════════════════════
   FULL HAND PLAY (multi-street vs IA)
═══════════════════════════════════════ */
const RANKS_FH=["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS_FH=["♠","♥","♦","♣"];
function rndCard(exclude){
  const used=new Set((exclude||[]).map(c=>c.r+c.s));
  let c,tries=0;
  do{c={r:RANKS_FH[Math.random()*13|0],s:SUITS_FH[Math.random()*4|0]};tries++;}while(used.has(c.r+c.s)&&tries<60);
  return c;
}
function genBoard(hole){
  const used=[...hole];
  const cards=[];
  for(let i=0;i<5;i++){const c=rndCard(used);cards.push(c);used.push(c);}
  return cards;
}

function FullHandPlay({hand,pot:initPot,onDone}){
  const[board]=useState(()=>genBoard(hand||[]));
  const[street,setStreet]=useState("flop");
  const[phase,setPhase]=useState("hero");
  const[acts,setActs]=useState([]);
  const[pot,setPot]=useState(initPot||15);
  const[vilThink,setVilThink]=useState(false);
  const[result,setResult]=useState(null);
  const streets=["flop","turn","river"];
  const visBoard=street==="flop"?board.slice(0,3):street==="turn"?board.slice(0,4):board.slice(0,5);

  function heroAct(act){
    const nActs=[...acts,{street,actor:"Hero",action:act}];
    setActs(nActs);
    if(act==="FOLD"){setResult("lose");setPhase("done");return;}
    setVilThink(true);setPhase("villain_thinking");
    setTimeout(()=>{
      setVilThink(false);
      const spr=pot>0?100/pot:8;
      const vd=villainDecide(street,act,"Reg",pot,"gto","pokerstars",spr,100);
      const updated=[...nActs,{street,actor:"Villain",action:vd.action}];
      setActs(updated);
      if(vd.action==="FOLD"||vd.action==="WIN"){setResult("win");setPhase("done");return;}
      if(act==="BET"||act==="RAISE")setPot(p=>p+(p*.5|0));
      const idx=streets.indexOf(street);
      if(idx<streets.length-1){
        setTimeout(()=>{setStreet(streets[idx+1]);setPhase("hero");},350);
      } else {
        const won=Math.random()>.45;
        setResult(won?"win":"lose");
        setPhase("done");
      }
    },650+Math.random()*500);
  }

  const actColor={Hero:T.gold,Villain:T.purple};
  const actBg={Hero:T.goldDim,Villain:T.purpleDim};

  return(
    <div style={{background:`linear-gradient(145deg,${T.surface} 0%,${T.surface2} 100%)`,borderRadius:12,padding:"14px 16px",border:`1px solid ${T.border2}`,marginTop:10,boxShadow:`0 4px 20px rgba(0,0,0,.4)`}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontFamily:T.brand,fontSize:9,color:T.gold,letterSpacing:".15em",fontWeight:900}}>FULL HAND</span>
        {streets.map(s=>{
          const done=streets.indexOf(s)<streets.indexOf(street);
          const cur=s===street&&phase!=="done";
          return <span key={s} style={{padding:"2px 9px",borderRadius:20,fontSize:8.5,fontFamily:T.stats,fontWeight:700,
            background:cur?T.gold:done?T.greenDim:T.surface3,
            color:cur?T.bg:done?T.green:T.text3,
            border:`1px solid ${cur?T.gold:done?T.green+"55":T.border}`}}>{s.charAt(0).toUpperCase()+s.slice(1)}</span>;
        })}
        <span style={{marginLeft:"auto",fontSize:9,color:T.text3,fontFamily:T.stats}}>Pot: <span style={{color:T.gold}}>{fmt2(pot)}</span></span>
      </div>

      {/* Board */}
      <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:10}}>
        {visBoard.map((c,i)=><Card key={i} r={c.r} s={c.s} size="md" delay={i*.06}/>)}
      </div>

      {/* Hero cards */}
      <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:10}}>
        {(hand||[]).map((c,i)=><Card key={i} r={c.r} s={c.s} size="lg" delay={0}/>)}
      </div>

      {/* Action log */}
      {acts.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
        {acts.map((a,i)=>(
          <span key={i} style={{fontSize:8.5,fontFamily:T.stats,padding:"2px 8px",borderRadius:20,
            background:actBg[a.actor],color:actColor[a.actor],
            border:`1px solid ${actColor[a.actor]}33`}}>
            {a.street.slice(0,2).toUpperCase()} · {a.actor==="Hero"?"H":"V"} {a.action}
          </span>
        ))}
        {vilThink&&<span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats,display:"flex",alignItems:"center",gap:3}}>V<span className="think"><span>·</span><span>·</span><span>·</span></span></span>}
      </div>}

      {/* Hero action buttons */}
      {phase==="hero"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginTop:6}}>
          <button className="ab ab-CHECK" style={{padding:"8px 4px",fontSize:10}} onClick={()=>heroAct("CHECK")}>Check</button>
          <button className="ab ab-CALL" style={{padding:"8px 4px",fontSize:10}} onClick={()=>heroAct("BET")}>Bet ½</button>
          <button className="ab ab-RAISE" style={{padding:"8px 4px",fontSize:10}} onClick={()=>heroAct("RAISE")}>Bet PSB</button>
          <button className="ab ab-FOLD" style={{padding:"8px 4px",fontSize:10}} onClick={()=>heroAct("FOLD")}>Fold</button>
        </div>
      )}

      {/* Result */}
      {phase==="done"&&result&&(
        <div style={{textAlign:"center",padding:"8px 0 4px"}}>
          <div style={{fontFamily:T.brand,fontSize:17,fontWeight:900,color:result==="win"?T.green:T.red,textShadow:`0 0 18px ${result==="win"?T.greenGlow:T.redGlow}`,marginBottom:6}}>
            {result==="win"?"🏆 VICTOIRE":"❌ DÉFAITE"}
          </div>
          <div style={{fontSize:10,color:T.text2,fontFamily:T.stats,marginBottom:10}}>{result==="win"?"Bien joué ! Tu remportes ce pot.":"Main perdue. Revois ta ligne dans le Replayer !"}</div>
          <button className="btn btng" onClick={onDone}>Main suivante ►</button>
        </div>
      )}
    </div>
  );
}
function fmt2(v){return `${v}bb`;}

/* ═══════════════════════════════════════
   SESSION END
═══════════════════════════════════════ */
function SessionEnd({results,mode,stoppedEarly=false,onRestart,onResume,onSave}){
  const total=results.length,correct=results.filter(r=>r.correct).length;
  const approx=results.filter(r=>!r.correct&&(r.spot.freq[r.spot.acts[r.ua]?.id]||0)>=20).length;
  const errors=total-correct-approx;
  const pct=Math.round(correct/Math.max(1,total)*100);
  const grade=pct>=90?"S":pct>=75?"A":pct>=60?"B":pct>=45?"C":"D";
  const gc=pct>=90?T.green:pct>=75?T.blue:pct>=60?T.accent:pct>=45?T.accent:T.red;
  const mistakes=results.filter(r=>!r.correct);
  const targetLabel=mode===999?"∞":mode;

  // EV delta vs optimal
  const evDelta=results.reduce((s,r)=>{
    const best=r.spot.ev[r.spot.acts[r.spot.ok]?.id]||0;
    const chosen=r.spot.ev[r.spot.acts[r.ua]?.id]||0;
    return s+(chosen-best);
  },0);

  // Leaks détectés (mains incorrectes)
  const leakMap={};
  results.filter(r=>!r.correct).forEach(r=>{(r.spot.leaks||[]).forEach(l=>{leakMap[l]=(leakMap[l]||0)+1;});});
  const topLeaks=Object.entries(leakMap).sort((a,b)=>b[1]-a[1]).slice(0,3);

  // Précision par catégorie (≥2 spots)
  const catMap={};
  results.forEach(r=>{const c=r.spot.cat||"Autre";if(!catMap[c])catMap[c]={ok:0,tot:0};catMap[c].tot++;if(r.correct)catMap[c].ok++;});
  const catArr=Object.entries(catMap).filter(([,v])=>v.tot>=2).map(([c,v])=>({c,pct:Math.round(v.ok/v.tot*100)}));
  const best3=[...catArr].sort((a,b)=>b.pct-a.pct).slice(0,3);
  const worst3=[...catArr].sort((a,b)=>a.pct-b.pct).filter(c=>c.pct<100).slice(0,3);

  // Heatmap précision par position Hero
  const hposMap={};
  results.forEach(r=>{const p=r.spot.hpos;if(!p)return;if(!hposMap[p])hposMap[p]={ok:0,tot:0};hposMap[p].tot++;if(r.correct)hposMap[p].ok++;});
  const posOrder=["UTG","UTG+1","MP","HJ","CO","BTN","SB","BB"];
  const posArr=posOrder.filter(p=>hposMap[p]?.tot>=1).map(p=>({p,pct:Math.round(hposMap[p].ok/hposMap[p].tot*100),tot:hposMap[p].tot}));

  // Précision par street (Preflop/Flop/Turn/River) → street la plus faible
  const streetOrder=["Preflop","Flop","Turn","River"];
  const streetMap={};
  results.forEach(r=>{const s=r.spot.street||"Preflop";if(!streetMap[s])streetMap[s]={ok:0,tot:0};streetMap[s].tot++;if(r.correct)streetMap[s].ok++;});
  const streetArr=streetOrder.filter(s=>streetMap[s]?.tot>=1).map(s=>({s,pct:Math.round(streetMap[s].ok/streetMap[s].tot*100),tot:streetMap[s].tot}));
  const weakStreet=[...streetArr].filter(s=>s.tot>=2&&s.pct<100).sort((a,b)=>a.pct-b.pct)[0]||null;
  const weakPosObj=[...posArr].filter(p=>p.tot>=2&&p.pct<100).sort((a,b)=>a.pct-b.pct)[0]||null;

  // Recommandations d'entraînement concrètes (synthèse street + catégorie + position + leak)
  const recoDrills=[];
  if(worst3[0])recoDrills.push(`un drill « ${worst3[0].c} » (${worst3[0].pct}%)`);
  if(weakStreet&&recoDrills.length<2)recoDrills.push(`des spots ${weakStreet.s} (${weakStreet.pct}%)`);
  if(weakPosObj&&recoDrills.length<2)recoDrills.push(`la position ${weakPosObj.p} (${weakPosObj.pct}%)`);
  if(topLeaks[0]&&recoDrills.length<2)recoDrills.push(`« ${topLeaks[0][0]} »`);
  const recoText=recoDrills.length>0
    ?`Relance en priorité ${recoDrills.slice(0,2).join(" et ")}.`
    :(pct>=85?"Excellent — monte d'un cran en difficulté ou élargis les positions/stacks.":"Continue : enchaîne une nouvelle session pour consolider.");

  useEffect(()=>{onSave({date:new Date().toLocaleString("fr-FR"),total,correct,approx,errors,pct,grade,mode,stopped:stoppedEarly});},[]);
  return(
    <div className="se">
      {/* Badge statut */}
      <div style={{padding:"5px 14px",borderRadius:20,fontFamily:"'Space Grotesk',sans-serif",fontSize:10,fontWeight:700,marginBottom:4,
        background:stoppedEarly?"rgba(255,194,71,.1)":"rgba(16,216,122,.1)",
        border:`1px solid ${stoppedEarly?"rgba(255,194,71,.35)":"rgba(16,216,122,.3)"}`,
        color:stoppedEarly?T.gold:T.green,
      }}>{stoppedEarly?"⏹ Session interrompue":"✓ Session terminée"}</div>

      {/* Spots joués */}
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:T.text3,marginBottom:6}}>
        Spots joués : <span style={{color:T.text,fontWeight:700}}>{total}</span> / {targetLabel}
      </div>

      <div style={{fontSize:36}}>{pct>=90?"🏆":pct>=75?"🎯":pct>=60?"📈":"📉"}</div>
      <div className="sescore" style={{color:gc}}>{pct}%</div>
      <div className="segrade" style={{color:gc}}>Grade {grade}</div>

      {/* Stats grid */}
      <div className="segrid">
        <div className="sebox"><div className="sev" style={{color:T.green}}>{correct}</div><div className="sel">Corrects</div></div>
        <div className="sebox"><div className="sev" style={{color:T.accent}}>{approx}</div><div className="sel">Approx.</div></div>
        <div className="sebox"><div className="sev" style={{color:T.red}}>{errors}</div><div className="sel">Erreurs</div></div>
      </div>

      {/* EV delta */}
      <div style={{display:"flex",gap:10,padding:"8px 14px",background:evDelta>=0?"rgba(16,216,122,.07)":"rgba(255,69,96,.07)",borderRadius:8,border:`1px solid ${evDelta>=0?"rgba(16,216,122,.2)":"rgba(255,69,96,.2)"}`,marginBottom:8,alignItems:"center",width:"100%",maxWidth:500,boxSizing:"border-box"}}>
        <span style={{fontSize:18}}>{evDelta>=0?"💰":"📉"}</span>
        <div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:8.5,color:T.text4,letterSpacing:".08em",marginBottom:1}}>EV VS OPTIMAL</div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:700,color:evDelta>=0?T.green:T.red}}>{evDelta>=0?"+":""}{evDelta.toFixed(2)} bb</div>
        </div>
        <div style={{marginLeft:"auto",textAlign:"right"}}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:8.5,color:T.text4,letterSpacing:".08em",marginBottom:1}}>PRÉCISION</div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:700,color:gc}}>{pct}%</div>
        </div>
      </div>

      {/* ── RÉCOMPENSES : XP gagnée · série · niveau ── */}
      {(()=>{
        const xpGain=Math.round(correct*10+total*2+(pct>=80?50:pct>=60?20:0));
        const stx=loadStats();
        const lvlXp=(stx.xp||0)%500;
        return(
          <div style={{display:"flex",gap:8,width:"100%",maxWidth:500,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{flex:"1 1 130px",padding:"9px 12px",borderRadius:10,background:"rgba(255,194,71,.08)",border:"1px solid rgba(255,194,71,.3)",textAlign:"center"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:16,fontWeight:800,color:T.gold}}>+{xpGain} XP</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:8,color:T.text4,fontWeight:700,letterSpacing:".06em"}}>RÉCOMPENSE{pct>=80?" · BONUS 80%+":pct>=60?" · BONUS 60%+":""}</div>
            </div>
            <div style={{flex:"1 1 110px",padding:"9px 12px",borderRadius:10,background:"rgba(255,138,61,.07)",border:"1px solid rgba(255,138,61,.25)",textAlign:"center"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:16,fontWeight:800,color:"#FF8A3D"}}>🔥 {stx.streak||1}j</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:8,color:T.text4,fontWeight:700,letterSpacing:".06em"}}>SÉRIE QUOTIDIENNE</div>
            </div>
            <div style={{flex:"1 1 130px",padding:"9px 12px",borderRadius:10,background:"rgba(31,139,255,.07)",border:"1px solid rgba(31,139,255,.25)",textAlign:"center"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:16,fontWeight:800,color:T.blue}}>Lv {stx.level||1}</div>
              <div style={{height:3,background:"#0B2150",borderRadius:2,margin:"4px 8px 2px",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.round(lvlXp/500*100)}%`,background:"linear-gradient(90deg,#1F8BFF,#34D8FF)",borderRadius:2}}/>
              </div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:8,color:T.text4,fontWeight:700,letterSpacing:".06em"}}>{lvlXp}/500 XP</div>
            </div>
          </div>
        );
      })()}

      {/* Leaks — top 3 mis en avant */}
      {topLeaks.length>0&&(
        <div style={{width:"100%",maxWidth:500,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
            <span style={{fontSize:13}}>🔴</span>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:9,color:T.red,letterSpacing:".12em",textTransform:"uppercase",fontWeight:800}}>Top Fuites Détectées</div>
            <div style={{flex:1,height:1,background:"rgba(255,69,96,.25)"}}/>
          </div>
          {topLeaks.map(([l,n],i)=>{
            const medals=["🥇","🥈","🥉"];
            const maxN=topLeaks[0][1];
            const barPct=Math.round(n/maxN*100);
            const bgAlpha=i===0?".2":i===1?".12":".07";
            const brd=i===0?"rgba(255,69,96,.45)":i===1?"rgba(255,110,70,.28)":"rgba(255,69,96,.15)";
            return(
              <div key={i} style={{
                padding:"8px 12px",background:`rgba(255,69,96,${bgAlpha})`,borderRadius:8,
                marginBottom:5,border:`1px solid ${brd}`,position:"relative",overflow:"hidden",
              }}>
                <div style={{position:"absolute",bottom:0,left:0,height:3,width:`${barPct}%`,
                  background:`rgba(255,69,96,${i===0?".55":".3"})`,borderRadius:"0 3px 3px 0",transition:"width .4s"}}/>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:14,flexShrink:0,lineHeight:1}}>{medals[i]||`#${i+1}`}</span>
                  <span style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:i===0?"#FF8090":"#FF9BA9",flex:1,lineHeight:1.3}}>{l}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.red,fontWeight:800,flexShrink:0,background:"rgba(255,69,96,.22)",borderRadius:10,padding:"1px 7px"}}>{n}×</span>
                </div>
              </div>
            );
          })}
          <div style={{padding:"6px 10px",background:"rgba(16,216,122,.05)",borderRadius:6,border:"1px solid rgba(16,216,122,.15)",marginTop:4,display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:T.green,flexShrink:0}}>💡 Focus :</span>
            <span style={{fontFamily:"'Inter',sans-serif",fontSize:8.5,color:T.text2}}>Travailler en priorité « {topLeaks[0][0]} »</span>
          </div>
        </div>
      )}

      {/* Catégories */}
      {catArr.length>0&&(
        <div style={{width:"100%",maxWidth:500,marginBottom:10,display:"flex",gap:8}}>
          {best3.length>0&&(
            <div style={{flex:1}}>
              <div style={{fontSize:8,color:T.green,letterSpacing:".08em",fontWeight:700,marginBottom:4}}>✦ POINTS FORTS</div>
              {best3.map((c,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 7px",background:"rgba(16,216,122,.05)",borderRadius:4,marginBottom:2,border:"1px solid rgba(16,216,122,.1)"}}>
                  <span style={{fontSize:8.5,color:T.text2,fontFamily:"'Inter',sans-serif"}}>{c.c}</span>
                  <span style={{fontSize:8.5,color:T.green,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{c.pct}%</span>
                </div>
              ))}
            </div>
          )}
          {worst3.length>0&&(
            <div style={{flex:1}}>
              <div style={{fontSize:8,color:T.red,letterSpacing:".08em",fontWeight:700,marginBottom:4}}>⚠ À TRAVAILLER</div>
              {worst3.map((c,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 7px",background:"rgba(255,69,96,.05)",borderRadius:4,marginBottom:2,border:"1px solid rgba(255,69,96,.1)"}}>
                  <span style={{fontSize:8.5,color:T.text2,fontFamily:"'Inter',sans-serif"}}>{c.c}</span>
                  <span style={{fontSize:8.5,color:T.red,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{c.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Heatmap précision par position */}
      {posArr.length>=2&&(
        <div style={{width:"100%",maxWidth:500,marginBottom:10}}>
          <div style={{fontSize:8.5,color:T.text4,letterSpacing:".1em",textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Précision par position</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 12px"}}>
            {posArr.map(({p,pct,tot})=>{
              const col=pct>=75?T.green:pct>=50?T.amber:T.red;
              return(
                <div key={p} style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:T.text3,minWidth:32,flexShrink:0}}>{p}</span>
                  <div style={{flex:1,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:2}}/>
                  </div>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:col,minWidth:28,textAlign:"right",fontWeight:700}}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Précision par street + street la plus faible */}
      {streetArr.length>=2&&(
        <div style={{width:"100%",maxWidth:500,marginBottom:10}}>
          <div style={{fontSize:8.5,color:T.text4,letterSpacing:".1em",textTransform:"uppercase",marginBottom:6,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
            <span>Précision par street</span>
            {weakStreet&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:T.red,background:"rgba(255,69,96,.12)",borderRadius:10,padding:"1px 7px",fontWeight:700,letterSpacing:0,textTransform:"none"}}>plus faible : {weakStreet.s} {weakStreet.pct}%</span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 12px"}}>
            {streetArr.map(({s,pct,tot})=>{
              const col=pct>=75?T.green:pct>=50?T.amber:T.red;
              return(
                <div key={s} style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:T.text3,minWidth:46,flexShrink:0}}>{s}</span>
                  <div style={{flex:1,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:2}}/>
                  </div>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:col,minWidth:28,textAlign:"right",fontWeight:700}}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommandation d'entraînement */}
      <div style={{width:"100%",maxWidth:500,marginBottom:10,padding:"9px 12px",borderRadius:9,background:"rgba(52,216,255,.06)",border:"1px solid rgba(52,216,255,.22)",display:"flex",gap:9,alignItems:"flex-start"}}>
        <span style={{fontSize:16,flexShrink:0,lineHeight:1.2}}>🎯</span>
        <div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:8.5,color:"#34D8FF",letterSpacing:".08em",fontWeight:800,marginBottom:2}}>RECOMMANDATION D'ENTRAÎNEMENT</div>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:9.5,color:T.text2,lineHeight:1.5}}>{recoText}</div>
        </div>
      </div>

      {/* Erreurs détaillées */}
      {mistakes.length>0&&(
        <div style={{width:"100%",maxWidth:500,marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
            <span style={{fontSize:8.5,color:T.text3,letterSpacing:".1em",textTransform:"uppercase",fontWeight:600}}>À retravailler</span>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:T.red,background:"rgba(255,69,96,.12)",borderRadius:10,padding:"1px 7px",fontWeight:700}}>{mistakes.length}</span>
          </div>
          {mistakes.slice(0,8).map((m,i)=>{
            const evDiff=(m.spot.ev[m.spot.acts[m.ua]?.id]||0)-(m.spot.ev[m.spot.acts[m.spot.ok]?.id]||0);
            return(
              <div key={i} className="errit">
                <span style={{color:T.red,fontSize:12,flexShrink:0}}>✗</span>
                <div style={{flex:1}}>
                  <div style={{color:T.text,marginBottom:3,fontSize:9.5,lineHeight:1.35}}>{m.spot.desc}</div>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
                    <span className="tag tag-r">Joué: {m.spot.acts[m.ua]?.l}</span>
                    <span className="tag tag-g">Optimal: {m.spot.best}</span>
                    {m.spot.hpos&&<span className="tag" style={{background:"rgba(31,139,255,.08)",border:"1px solid rgba(31,139,255,.2)",color:T.blue,fontSize:7.5}}>{m.spot.hpos}</span>}
                    {evDiff!==0&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:T.red,marginLeft:"auto"}}>EV {evDiff.toFixed(1)}bb</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {mistakes.length>8&&<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.text4,textAlign:"center",padding:"4px 0",marginTop:2}}>+ {mistakes.length-8} autres — clique « Retravailler erreurs » pour tout revoir</div>}
        </div>
      )}

      {/* Boutons d'action */}
      <div style={{display:"flex",gap:7,flexWrap:"wrap",justifyContent:"center"}}>
        {stoppedEarly&&onResume&&(
          <button className="btn btng" onClick={onResume} style={{background:"rgba(16,216,122,.15)",borderColor:"rgba(16,216,122,.4)",color:T.green}}>▶ Reprendre la session</button>
        )}
        <button className="btn btng" onClick={()=>onRestart(false)}>↺ Nouvelle session</button>
        {mistakes.length>0&&<button className="btn btns" onClick={()=>onRestart(true)}>⚠ Retravailler erreurs</button>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TRAINER TAB
═══════════════════════════════════════ */
/* ── Groupe de pills réutilisable (mono ou multi-sélection) — réglages Trainer pro ── */
function PillGroup({label,options,value,onChange,disabled,multi=false,color="#34D8FF",hint}){
  const on=v=>multi?(value||[]).includes(v):value===v;
  return(
    <div className="sb">
      <div className="sblbl">{label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
        {options.map(o=>{
          const val=typeof o==="object"?o.id:o;
          const lab=typeof o==="object"?(o.l||o.id):o;
          const act=on(val);
          return(
            <button key={String(val)} disabled={disabled} onClick={()=>{
              if(disabled)return;
              if(multi){const arr=value||[];onChange(arr.includes(val)?arr.filter(x=>x!==val):[...arr,val]);}
              else onChange(val);
            }} style={{
              padding:"5px 9px",borderRadius:7,fontFamily:"'Space Grotesk',sans-serif",fontSize:9,fontWeight:700,
              cursor:disabled?"not-allowed":"pointer",border:`1px solid ${act?color+"66":"#152D6E"}`,
              background:act?color+"1e":"#030D2A",color:act?color:"#6F81A8",
              opacity:disabled&&!act?.45:1,transition:"all .15s",boxShadow:act?`0 0 8px ${color}25`:"none",
            }}>{lab}</button>
          );
        })}
      </div>
      {hint&&<div style={{marginTop:5,fontSize:8,color:"#6F81A8",fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>{hint}</div>}
    </div>
  );
}

/* ── Leak Hunter : agrège les stats (positions, catégories, formats) → leak principal ── */
function buildTrainerLeak(stats){
  if(!stats)return null;
  const posAcc=stats.posAcc||{},catAcc=stats.catAcc||{};
  const POS_NAMES={RFI:"Open Raise","Vs Open":"Défense (vs open)","Vs 3-bet":"Défense vs 3-bet","Vs 4-bet":"4-bet pot",Flop:"C-bet / Flop",Turn:"Turn",River:"River",ICM:"ICM"};
  const weakPos=Object.entries(posAcc).filter(([,v])=>v.total>=3).map(([p,v])=>({p,acc:Math.round(v.ok/v.total*100),n:v.total})).sort((a,b)=>a.acc-b.acc)[0];
  const weakCat=Object.entries(catAcc).filter(([,v])=>v.total>=3).map(([c,v])=>({c,acc:Math.round(v.ok/v.total*100),n:v.total})).sort((a,b)=>a.acc-b.acc)[0];
  if(!weakPos&&!weakCat)return null;
  const main=(!weakCat||(weakPos&&weakPos.acc<=weakCat.acc))?
    {kind:"pos",label:`Position ${weakPos.p}`,acc:weakPos.acc,n:weakPos.n,pos:weakPos.p}:
    {kind:"cat",label:POS_NAMES[weakCat.c]||weakCat.c,acc:weakCat.acc,n:weakCat.n,cat:weakCat.c};
  const evLost=Math.max(0.4,((72-main.acc)*0.09)).toFixed(1); // bb / 100 spots (estimé)
  const errFreq=100-main.acc;
  return{...main,evLost,errFreq,weakPos,weakCat};
}
const TRAINER_CFG_DEFAULT={
  cat:"Tous",fmt:"Tous",vt:"Tous",hp:"Tous",vp:"Tous",diff:"Tous",
  nplayers:6,stackEff:"",spotTypes:[],phase:"Toutes",icm:"Désactivée",
  fmtDetail:"Tous",vilainAdv:"Tous",field:"Standard",heroStyle:"GTO",
  adaptiveMode:"balanced",
  diffLvl:0,objectives:[],objective:null,timer:0,coachLevel:"Intermédiaire",
};
/* ── Types de session d'entraînement (indépendant de GTO/Exploit) ── */
const TRAIN_MODES=[
  {id:"spot",   l:"Spot",      ic:"🎯", col:"#34D8FF", desc:"Une décision isolée — correction rapide."},
  {id:"street", l:"Street",    ic:"🎚",  col:"#10D87A", desc:"Travaille une street précise (flop/turn/river)."},
  {id:"full",   l:"Full Hand", ic:"🃏", col:"#FFC247", desc:"Joue le coup complet — plusieurs décisions."},
  {id:"session",l:"Session",   ic:"🎬", col:"#9B5CFF", desc:"Suite de mains complètes — simulateur MTT."},
  {id:"mix",    l:"Mix",       ic:"🔀", col:"#FF8A3D", desc:"Mélange Spot · Street · Full Hand."},
];
const TRAIN_STREETS=["Flop","Turn","River"];
export default function TrainerTab({unit,onGoSolver:onGoSolverProp,chipTheme="neon_modern",chipColor="blue",chipSizeMode="auto",seed=null,onSeedApplied,onGoCoach}){
  const[f,setF]=useState(()=>{
    try{const s=JSON.parse(localStorage.getItem("pf_trainer_cfg")||"null");return s?{...TRAINER_CFG_DEFAULT,...s}:TRAINER_CFG_DEFAULT;}
    catch{return TRAINER_CFG_DEFAULT;}
  });
  const[smode,setSmode]=useState(20);
  const[ntables,setNtables]=useState(1);
  const[mobSidebar,setMobSidebar]=useState(false);
  // ── Mode GTO / Exploit ──
  const[trainerMode,setTrainerMode]=useState("gto"); // "gto" | "exploit"
  const[platform,setPlatform]=useState("pokerstars");
  // ── Type de session : spot | street | full | session | mix ──
  const[trainMode,setTrainMode]=useState(()=>{try{return localStorage.getItem("pf_train_mode")||"spot";}catch{return "spot";}});
  const[streetStart,setStreetStart]=useState("Flop"); // street de départ pour le mode Street
  useEffect(()=>{try{localStorage.setItem("pf_train_mode",trainMode);}catch{}},[trainMode]);
  // Full Hand / Session = 1 table (le rendu de main complète street-par-street est dédié au mode 1T)
  const fullSolo=trainMode==="full"||trainMode==="session";
  useEffect(()=>{if(fullSolo&&ntables!==1)setNtables(1);},[trainMode]);
  // ── Sidebar collapsible ──
  const[collapsed,setCollapsed]=useState(()=>{
    try{return localStorage.getItem("pf_sidebar_collapsed")==="true";}catch{return false;}
  });
  function toggleSidebar(){
    const next=!collapsed;
    setCollapsed(next);
    try{localStorage.setItem("pf_sidebar_collapsed",String(next));}catch{}
  }
  const[showSol,setShowSol]=useState(false);
  const[started,setStarted]=useState(false);
  const[done,setDone]=useState(false);
  const[stoppedEarly,setStoppedEarly]=useState(false);
  const[reviewOpen,setReviewOpen]=useState(false); // Review + Leak Hunter (slice 1)
  const[queue,setQueue]=useState([]);
  const[idx,setIdx]=useState(0);
  const[results,setResults]=useState([]);
  const[tableAns,setTableAns]=useState({});
  const[tableSettled,setTableSettled]=useState({});
  const[nextTransitioning,setNextTransitioning]=useState(false);
  const[nextError,setNextError]=useState(null);
  const nextTransitionRef=useRef(false);
  const nextTransitionTimer=useRef(null);
  useEffect(()=>()=>{if(nextTransitionTimer.current)clearTimeout(nextTransitionTimer.current);},[]);
  const[history,setHistory]=useState(()=>loadHistory());
  /* ══ MOBILE v9 — états ══ */
  const isMobile=useIsMobile();
  const[sheetTab,setSheetTab]=useState(null);          // null | villain | stats | notes | history
  const[mobFocus,setMobFocus]=useState(false);          // mode focus immersif
  const[expandedT,setExpandedT]=useState(null);         // table agrandie (double-tap)
  const[activeTable,setActiveTable]=useState(0);        // multi-table : table active (panneau droit + raccourcis F1-F4)
  const[mtRangePopup,setMtRangePopup]=useState(null);   // multi-table : popup ranges GTO plein écran
  const[panelEl,setPanelEl]=useState(null);             // conteneur DOM du panneau droit partagé (cible du portal 1T)
  const[zoomed,setZoomed]=useState(false);              // pincement zoom actif
  const sheetRef=useRef(null);
  const sheetTouch=useRef({y:0,dy:0});
  const gridRef=useRef(null);
  const tapRef=useRef({t:0,id:-1,y:0,moved:false});
  const curDotRef=useRef(null);
  const mobileTrainingSingleTableOnly=isMobile;
  useEffect(()=>{
    if(!mobileTrainingSingleTableOnly||ntables===1)return;
    setNtables(1);
    setExpandedT(null);
    setZoomed(false);
  },[mobileTrainingSingleTableOnly,ntables]);
  // Multi-table : au changement de lot (idx) ou de nombre de tables, la table 1 redevient active
  useEffect(()=>{setActiveTable(a=>a>=ntables?0:a);},[idx,ntables]);
  const upd=(k,v)=>setF(x=>({...x,[k]:v}));
  // Persiste la config Trainer (réglages pro) entre les sessions
  useEffect(()=>{try{localStorage.setItem("pf_trainer_cfg",JSON.stringify(f));}catch{}},[f]);
  // Décision time tracking (temps moyen par spot)
  const spotStartRef=useRef(Date.now());
  const[decisionTimes,setDecisionTimes]=useState([]);
  const sc=results.filter(r=>r.correct).length,st=results.length;
  const approx=results.filter(r=>!r.correct&&(r.spot.freq[r.spot.acts[r.ua]?.id]||0)>=20).length;
  const pct=st>0?Math.round(sc/st*100):0;
  const prog=smode===999?0:Math.round(idx/smode*100);
  // État de session : true = session en cours → filtres verrouillés
  const sessionActive=started&&!done;
  const curSpot=queue[idx]||null;
  // Multi-table : spot de la table active (panneau droit partagé + raccourcis)
  const activeSpot=queue[idx+(ntables>1?activeTable:0)]||curSpot;

  /* ══ Leak Hunter — basé sur les stats persistées (sessions précédentes) ══ */
  const trainerStats=useMemo(()=>loadStats(),[done,started]);
  const leak=useMemo(()=>buildTrainerLeak(trainerStats),[trainerStats]);

  /* ══ Stats session avancées (EV, scores, temps, positions, street) ══ */
  const sessAdv=useMemo(()=>{
    let evGain=0,evLoss=0;const posM={},strM={};
    results.forEach(r=>{
      const acts=r.spot.acts||[],ev=r.spot.ev||{};
      const chosen=acts[r.ua]?.id;
      const evVals=Object.values(ev).map(Number).filter(v=>!isNaN(v));
      const bestEv=evVals.length?Math.max(...evVals):0;
      const chEv=Number(ev[chosen]||0);
      if(r.correct)evGain+=Math.max(0,chEv);
      else evLoss+=Math.max(0,bestEv-chEv);
      const p=r.spot.hpos;if(p){posM[p]=posM[p]||{ok:0,t:0};posM[p].t++;if(r.correct)posM[p].ok++;}
      const s=r.spot.street;if(s){strM[s]=strM[s]||{ok:0,t:0};strM[s].t++;if(r.correct)strM[s].ok++;}
    });
    const posArr=Object.entries(posM).map(([p,v])=>({p,acc:Math.round(v.ok/v.t*100),t:v.t}));
    const bestPos=[...posArr].sort((a,b)=>b.acc-a.acc)[0]||null;
    const worstPos=[...posArr].sort((a,b)=>a.acc-b.acc)[0]||null;
    const strArr=Object.entries(strM).map(([s,v])=>({s,acc:Math.round(v.ok/v.t*100),t:v.t}));
    const weakStreet=[...strArr].sort((a,b)=>a.acc-b.acc)[0]||null;
    const avgTime=decisionTimes.length?(decisionTimes.reduce((a,b)=>a+b,0)/decisionTimes.length):0;
    const prevPct=history[0]?.pct;
    return{
      evGain:Math.round(evGain*10)/10,evLoss:Math.round(evLoss*10)/10,
      gtoScore:trainerMode==="gto"?pct:null,exploitScore:trainerMode==="exploit"?pct:null,
      avgTime:Math.round(avgTime*10)/10,bestPos,worstPos,weakStreet,
      progression:prevPct!=null?pct-prevPct:null,
    };
  },[results,decisionTimes,trainerMode,pct,history]);

  /* Démarre une session ciblée sur le leak principal */
  function startFromLeak(){
    if(!leak)return;
    const patch={...f,spotTypes:[],objectives:[]};
    if(leak.kind==="pos"){patch.hp=leak.pos;patch.cat="Tous";}
    else{patch.cat=leak.cat;patch.hp="Tous";}
    setF(patch);
    setTimeout(()=>start(),0);
  }
  /* Applique un objectif d'entraînement aux filtres */
  function applyObjective(objId){
    const o=TRAIN_OBJECTIVES.find(x=>x.id===objId);
    if(!o)return;
    if(o.leak){startFromLeak();return;}
    if(o.hh){upd("objective","hh");return;} // signalé "en développement" dans l'UI
    const patch={...f,objective:objId};
    if(o.cat){patch.cat=o.cat;patch.spotTypes=[];}
    if(o.fmt){patch.fmt=o.fmt;}
    if(o.stack){patch.stackEff=o.stack;}
    setF(patch);
  }

  /* ══ SAUVEGARDE AUTOMATIQUE DE LA PROGRESSION ══
     La session en cours survit à un refresh / fermeture d'app (24h). */
  useEffect(()=>{
    if(!started||done)return;
    try{
      localStorage.setItem("pf_trainer_autosave",JSON.stringify({
        ts:Date.now(),smode,ntables:mobileTrainingSingleTableOnly?1:ntables,f,trainerMode,trainMode,streetStart,platform,showSol,
        queue:queue.map(s=>({...s,ctx:undefined})),
        queueIds:queue.map(s=>s.id),idx,
        results:results.map(r=>({id:r.spot.id,correct:r.correct,ua:r.ua,qi:r.qi})),
      }));
    }catch{}
  },[started,done,idx,results,queue,smode,ntables,mobileTrainingSingleTableOnly,trainerMode,trainMode,streetStart,platform,showSol]);
  useEffect(()=>{if(done){try{localStorage.removeItem("pf_trainer_autosave");}catch{}}},[done]);
  const[resume,setResume]=useState(()=>{
    try{
      const d=JSON.parse(localStorage.getItem("pf_trainer_autosave")||"null");
      const qLen=d?.queue?.length||d?.queueIds?.length||0;
      if(d&&Date.now()-d.ts<86400000&&qLen>0&&d.idx<qLen)return d;
    }catch{}
    return null;
  });
  function resumeAutosave(){
    if(!resume)return;
    const byId=Object.fromEntries(SPOTS.map(s=>[s.id,s]));
    const storedQueue=Array.isArray(resume.queue)?resume.queue:[];
    const q=storedQueue.length
      ?storedQueue.map(s=>{
        const v=validateTrainerSpot(s);
        return v.valid?{...s,ctx:v.ctx}:null;
      }).filter(Boolean)
      :(resume.queueIds||[]).map(id=>byId[id]).filter(Boolean);
    if(q.length===0){setResume(null);try{localStorage.removeItem("pf_trainer_autosave");}catch{}return;}
    const byQueueId=Object.fromEntries(q.map(s=>[s.id,s]));
    const res=(resume.results||[]).map(r=>({spot:byQueueId[r.id]||byId[r.id],correct:r.correct,ua:r.ua,qi:r.qi})).filter(r=>r.spot);
    if(resume.f)setF(resume.f);
    setSmode(resume.smode||20);setNtables(mobileTrainingSingleTableOnly?1:Math.min(4,resume.ntables||1));
    setTrainerMode(resume.trainerMode||"gto");setPlatform(resume.platform||"pokerstars");
    if(resume.trainMode)setTrainMode(resume.trainMode);if(resume.streetStart)setStreetStart(resume.streetStart);
    setShowSol(!!resume.showSol);
    setQueue(q);setIdx(Math.min(resume.idx,q.length-1));setResults(res);setTableAns({});setTableSettled({});
    setStarted(true);setDone(false);setStoppedEarly(false);setResume(null);
    vibrate(VIB.next);
  }
  function dismissResume(){setResume(null);try{localStorage.removeItem("pf_trainer_autosave");}catch{}}

  /* ══ MODE FOCUS — masque header / nav / hud pour immersion totale ══ */
  useEffect(()=>{
    const on=isMobile&&mobFocus&&started&&!done;
    try{document.body.classList.toggle("pf-focus",on);}catch{}
    return()=>{try{document.body.classList.remove("pf-focus");}catch{}};
  },[isMobile,mobFocus,started,done]);

  /* ══ PINCEMENT POUR ZOOM (multi-tables) — listeners natifs non-passifs ══ */
  useEffect(()=>{
    const el=gridRef.current;
    if(!el||!isMobile||ntables<2||!started||done)return;
    const pr={d:0,base:1,scale:1};
    const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
    const inner=()=>el.querySelector(".mt-zoom-wrap");
    const onStart=e=>{if(e.touches.length===2){pr.d=dist(e.touches);pr.base=pr.scale;}};
    const onMove=e=>{
      if(e.touches.length===2&&pr.d>0){
        e.preventDefault();
        pr.scale=Math.min(2.4,Math.max(1,pr.base*dist(e.touches)/pr.d));
        const w=inner();
        if(w)w.style.transform=pr.scale>1.02?`scale(${pr.scale})`:"";
        setZoomed(pr.scale>1.05);
      }
    };
    const onEnd=e=>{if(e.touches.length<2)pr.d=0;};
    el.addEventListener("touchstart",onStart,{passive:true});
    el.addEventListener("touchmove",onMove,{passive:false});
    el.addEventListener("touchend",onEnd,{passive:true});
    return()=>{el.removeEventListener("touchstart",onStart);el.removeEventListener("touchmove",onMove);el.removeEventListener("touchend",onEnd);};
  },[isMobile,ntables,started,done]);
  function resetZoom(){
    const el=gridRef.current;const w=el&&el.querySelector(".mt-zoom-wrap");
    if(w)w.style.transform="";
    setZoomed(false);
  }

  /* Multi-table geometry guard: tables in the same row stay symmetric, and each
     table must respect the CSS aspect-ratio declared for its current layout mode. */
  useEffect(()=>{
    const el=gridRef.current;
    if(!el||ntables<2||!started||done)return;
    const check=()=>{
      const zones=[...el.querySelectorAll(".training-table-zone")];
      if(zones.length<2)return;
      const rects=zones.map(z=>z.getBoundingClientRect());
      rects.forEach((r,i)=>{
        if(r.width<=0)return;
        const expectedRatio=parseCssAspectRatio(getComputedStyle(zones[i]).aspectRatio)??MT_TABLE_RATIO_FALLBACK;
        const ratio=r.height/r.width;
        if(Math.abs(ratio-expectedRatio)>0.01){
          console.warn(`[PokerForge] Table ${i+1} ne respecte pas son aspect-ratio declare (${(ratio*100).toFixed(1)}% vs ${(expectedRatio*100).toFixed(1)}%) en mode ${ntables}T.`);
        }
      });
      const rows={};
      rects.forEach((r,i)=>{const y=Math.round(r.y);(rows[y]=rows[y]||[]).push({i,r});});
      Object.values(rows).forEach(group=>{
        if(group.length<2)return;
        const ref=group[0].r;
        group.slice(1).forEach(({i,r})=>{
          if(Math.abs(r.width-ref.width)>1||Math.abs(r.height-ref.height)>1){
            console.warn(`[PokerForge] Asymétrie détectée entre la table ${group[0].i+1} (${ref.width.toFixed(1)}×${ref.height.toFixed(1)}px) et la table ${i+1} (${r.width.toFixed(1)}×${r.height.toFixed(1)}px) en mode ${ntables}T.`);
          }
        });
      });
    };
    const ro=new ResizeObserver(check);
    el.querySelectorAll(".training-table-zone").forEach(z=>ro.observe(z));
    check();
    return()=>ro.disconnect();
  },[ntables,started,done,idx]);

  /* ══ DOUBLE-TAP : agrandir une table (multi) ══ */
  function slotTouchStart(e){tapRef.current.y=e.touches[0].clientY;tapRef.current.moved=false;}
  function slotTouchMove(e){if(Math.abs(e.touches[0].clientY-tapRef.current.y)>12)tapRef.current.moved=true;}
  function slotTouchEnd(t){
    if(tapRef.current.moved)return;
    const now=Date.now();
    if(tapRef.current.id===t&&now-tapRef.current.t<320){
      vibrate(VIB.tap);
      setExpandedT(e=>e===t?null:t);
      tapRef.current={t:0,id:-1,y:0,moved:false};
    }else{tapRef.current.t=now;tapRef.current.id=t;}
  }

  /* ══ NOTES PAR SPOT (bottom sheet) ══ */
  function loadNote(id){try{return (JSON.parse(localStorage.getItem("pf_spot_notes")||"{}"))[id]||"";}catch{return "";}}
  function saveNote(id,txt){
    try{
      const n=JSON.parse(localStorage.getItem("pf_spot_notes")||"{}");
      if(txt&&txt.trim())n[id]=txt;else delete n[id];
      localStorage.setItem("pf_spot_notes",JSON.stringify(n));
    }catch{}
  }

  /* ══ Timeline : centre le spot courant ══ */
  useEffect(()=>{
    if(curDotRef.current&&curDotRef.current.scrollIntoView){
      try{curDotRef.current.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});}catch{}
    }
  },[idx,started]);

  /* ══ Bottom sheet : swipe-down pour fermer ══ */
  function shStart(e){sheetTouch.current={y:e.touches[0].clientY,dy:0};}
  function shMove(e){
    const dy=e.touches[0].clientY-sheetTouch.current.y;
    sheetTouch.current.dy=dy;
    if(dy>0&&sheetRef.current)sheetRef.current.style.transform=`translateY(${dy}px)`;
  }
  function shEnd(){
    const dy=sheetTouch.current.dy;
    if(sheetRef.current)sheetRef.current.style.transform="";
    if(dy>70){vibrate(VIB.tap);setSheetTab(null);}
    sheetTouch.current={y:0,dy:0};
  }

  function start(retry=false){
    if(mobileTrainingSingleTableOnly&&ntables!==1)setNtables(1);
    let q;
    if(retry){const pool=results.filter(r=>!r.correct).map(r=>r.spot);if(pool.length){let a=[];while(a.length<smode)a=[...a,...shuffle(pool)];q=a.slice(0,smode);}}
    // Options de queue selon le type de session
    const qOpts=(trainMode==="full"||trainMode==="session")?{onlyPreflop:true,preferFlop:true}
      :trainMode==="street"?{onlyStreet:streetStart}
      :{};
    const engineOpts={...qOpts,trainerMode,trainMode,platform};
    if(!q)q=buildQ(f,smode,engineOpts);
    setQueue(q);setIdx(0);setResults([]);setTableAns({});setTableSettled({});setStarted(true);setDone(false);setStoppedEarly(false);
    setDecisionTimes([]);spotStartRef.current=Date.now();
    setMobSidebar(false);setExpandedT(null);setSheetTab(null);setResume(null);
    vibrate(VIB.next);
  }
  // ── Review + Leak Drill (slice 1) ──
  function launchDrill(patchF,opts){
    if(mobileTrainingSingleTableOnly&&ntables!==1)setNtables(1);
    const ef={...f,...patchF,spotTypes:[],objectives:[]};
    setF(ef);
    const q=buildQ(ef,smode,{...(opts||{}),trainerMode,trainMode,platform});
    setQueue(q);setIdx(0);setResults([]);setTableAns({});setTableSettled({});
    setStarted(true);setDone(false);setStoppedEarly(false);setDecisionTimes([]);
    spotStartRef.current=Date.now();setMobSidebar(false);setExpandedT(null);setSheetTab(null);setResume(null);
    setReviewOpen(false);vibrate(VIB.next);
  }
  function startErrorDrill(patch={}){
    setReviewOpen(false);
    if(patch.errors){
      // 1) rejouer les spots ratés de la session courante si dispo
      const pool=results.filter(r=>!r.correct).map(r=>r.spot);
      if(pool.length){
        let a=[];while(a.length<smode)a=[...a,...shuffle(pool)];
        setQueue(a.slice(0,smode));setIdx(0);setResults([]);setTableAns({});setTableSettled({});
        setStarted(true);setDone(false);setStoppedEarly(false);setDecisionTimes([]);spotStartRef.current=Date.now();vibrate(VIB.next);return;
      }
      // 2) sinon : cibler les leaks dominants de l'historique
      const rv=buildTrainerReview(loadPlayedSpots()||[]);
      const pf={};if(rv.byPotType[0])pf.cat=rv.byPotType[0].k;if(rv.byPosition[0])pf.hp=rv.byPosition[0].k;
      launchDrill(pf,{});return;
    }
    const pf={};const opts={};
    if(patch.hp)pf.hp=patch.hp;
    if(patch.cat)pf.cat=patch.cat;
    if(patch.street&&/flop|turn|river/i.test(patch.street))opts.onlyStreet=patch.street;
    if(patch.mode&&(patch.mode==="gto"||patch.mode==="exploit"))setTrainerMode(patch.mode);
    launchDrill(pf,opts);
  }
  function replaySpot(entry){ startErrorDrill({cat:entry.cat,hp:entry.hero}); }
  // ── Handoff entrant : un spot envoyé depuis le Replayer ou Coach AI configure et lance un drill ──
  function applyTrainerSeed(sd){
    if(!sd||typeof sd!=="object")return;
    const importedSpot=createTrainingSpotFromHand(sd);
    const looksLikeHand=!!(sd.hand||sd.actions||sd.handId||sd.rawHand||sd.board||sd.toCall!=null);
    if(looksLikeHand&&importedSpot){
      const v=validateTrainerSpot(importedSpot);
      if(v.valid){
        setQueue([{...importedSpot,ctx:v.ctx}]);setIdx(0);setResults([]);setTableAns({});setTableSettled({});
        setSmode(1);setNtables(1);setTrainMode("spot");setStarted(true);setDone(false);setStoppedEarly(false);
        setDecisionTimes([]);spotStartRef.current=Date.now();setMobSidebar(false);setExpandedT(null);setSheetTab(null);setResume(null);
        vibrate(VIB.next);
        return;
      }
    }
    const valid=p=>p&&p!=="?"&&p!=="Tous";
    // Drill ciblé sur la POSITION + la street : on rend les autres filtres permissifs pour garantir des spots
    // (sinon les filtres sauvegardés cat/diff/vt combinés à hp vident le pool → fallback générique).
    const patch={vp:"Tous",cat:sd.cat||"Tous",fmt:"Tous",vt:"Tous",diff:"Tous",diffLvl:0,vilainAdv:"Tous",fmtDetail:"Tous"};
    if(valid(sd.hpos))patch.hp=sd.hpos;
    if(sd.tableSize>=2&&sd.tableSize<=9)patch.nplayers=sd.tableSize;
    const opts={};
    const st=(sd.street||(sd.patch&&sd.patch.streetStart)||"").toString();
    const stCap=st?st.charAt(0).toUpperCase()+st.slice(1).toLowerCase():"";
    const mode=sd.trainerMode||(/flop|turn|river/i.test(st)?"street":"spot");
    if(mode==="street"&&/flop|turn|river/i.test(st)){setTrainMode("street");setStreetStart(stCap);opts.onlyStreet=stCap;}
    else if(mode==="full"||mode==="session"){setTrainMode(mode);opts.onlyPreflop=true;opts.preferFlop=true;}
    else setTrainMode("spot");
    launchDrill(patch,opts);
  }
  useEffect(()=>{
    if(seed){try{applyTrainerSeed(seed);}catch{}onSeedApplied&&onSeedApplied();}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[seed]);
  // Arrêter la session manuellement (résumé partiel)
  function stopSession(){
    if(results.length===0){setStarted(false);setDone(false);setStoppedEarly(false);return;}
    setDone(true);setStoppedEarly(true);
  }
  // Reprendre une session interrompue (queue + idx préservés)
  function resumeSession(){
    setDone(false);setStoppedEarly(false);setStarted(true);setTableAns({});setTableSettled({});
  }
  function handleAns(tid,correct,ua){
    const spot=queue[idx+tid];if(!spot)return;
    const dt=(Date.now()-spotStartRef.current)/1000;
    if(dt>0&&dt<120)setDecisionTimes(d=>[...d,dt]);
    setTableAns(a=>({...a,[tid]:{correct,ua}}));
    setResults(r=>[...r,{spot,correct,ua,qi:idx+tid}]); // qi = position dans la queue (timeline)
    appendPlayedSpot(spot,correct,ua,trainerMode); // sauvegarde dans pf_played_spots
    try{
      const chosen=spot.acts?.[ua];
      const best=spot.acts?.[spot.ok];
      const evLoss=Math.max(0,Number(spot.ev?.[best?.id]||0)-Number(spot.ev?.[chosen?.id]||0));
      recordAdaptiveDecision({
        spot,
        actionChosen:chosen?.id,
        recommendedAction:best?.id,
        result:correct?"ok":"err",
        evLoss,
        mistakeType:spot.cat,
        confidence:correct?0.9:0.55,
      });
    }catch{}
  }
  function handleTableSettled(tid){
    setTableSettled(s=>({...s,[tid]:true}));
  }
  function handleNext(){
    if(nextTransitionRef.current)return;
    nextTransitionRef.current=true;
    setNextTransitioning(true);
    setNextError(null);
    try{
      setExpandedT(null); // referme la table agrandie (mobile)
      spotStartRef.current=Date.now(); // chrono du spot suivant
      const next=idx+ntables;
      if(next>=Math.min(smode===999?queue.length:smode,queue.length)){setDone(true);setStoppedEarly(false);vibrate(VIB.win);}
      else{setIdx(next);setTableAns({});setTableSettled({});}
      if(nextTransitionTimer.current)clearTimeout(nextTransitionTimer.current);
      nextTransitionTimer.current=setTimeout(()=>{
        nextTransitionRef.current=false;
        setNextTransitioning(false);
      },260);
    }catch(err){
      nextTransitionRef.current=false;
      setNextTransitioning(false);
      setNextError("Generation impossible. Reessayez.");
      if(typeof console!=="undefined")console.error("PF Trainer next hand failed",err);
    }
  }
  function handleSave(sess){
    const h=[{...sess,id:Date.now()},...history];
    setHistory(h);saveHistory(h);
    updateStatsAfterSession(results,smode);
  }
  const allAns=Object.keys(tableAns).length>=ntables;
  const allSettled=Object.keys(tableSettled).length>=ntables;
  const gridClass=ntables===1?"grid1":ntables===2?"grid2":ntables===3?"grid3":ntables===4?"grid4":ntables<=6?"grid6":"grid8";
  // Callback: ouvrir le Shark Solver avec le spot en cours
  const onGoSolverFn=onGoSolverProp||null;

  /* ══════════════════════════════════════════════════════════════════
     PANNEAU DROIT MULTI-TABLE V2 — refonte lisibilité (retour utilisateur).
     Typographie confortable, hiérarchie claire, ranges en plein écran.
     Piloté par activeSpot + tableAns[activeTable] (données parent). Le 1T
     figé conserve son propre panneau (renderRightPanel), non modifié.
     ══════════════════════════════════════════════════════════════════ */
  const renderMultiPanel=()=>{
    const s=activeSpot; if(!s) return null;
    const vp=VILLAIN_PROFILES[s.vtype]||null;
    const ans=tableAns[activeTable]||null;
    const potN=parseFloat(s.pot)||0, stackN=parseFloat(s.stack)||100;
    const spr=potN>0?(stackN/potN).toFixed(1):"—";
    const toCall=Number(s.toCall)||0;
    const odds=toCall>0?Math.round(toCall/(toCall+potN)*100)+"%":"—";
    const diffLbl=s.diff===1?"Débutant":s.diff===2?"Intermédiaire":s.diff===3?"Avancé":s.diff===4?"Expert":"Intermédiaire";
    const diffCol=s.diff===1?"#00E889":s.diff===2?"#FFC247":s.diff===3?"#FF7A45":s.diff===4?"#B85CFF":"#FFC247";
    const acts=Array.isArray(s.acts)?s.acts:[];
    const best=s.ok!=null?s.acts?.[s.ok]:null;
    const bestEv=best?Number(s.ev?.[best.id]||0):0;
    const revealed=showSol||!!ans;
    const chosen=ans?s.acts?.[ans.ua]:null;
    const chosenEv=chosen?Number(s.ev?.[chosen.id]||0):0;
    const isGto=trainerMode==="gto";
    // Barre GTO : freq + EV par action
    const actRows=acts.map((a,i)=>({a,i,freq:Math.round(Number(s.freq?.[a.id]||0)),ev:Number(s.ev?.[a.id]||0),best:i===s.ok,chosen:ans&&i===ans.ua}));
    const barCol=(a)=>{const t=trainerActionType(a);return t==="FOLD"?"#E5485D":t==="ALLIN"?"#FF4D6D":t==="CALL"?"#20CFFF":t==="CHECK"||t==="CHECK_BACK"?"#25D487":"#FFB800";};
    const isLastBatch=idx+ntables>=Math.min(smode===999?queue.length:smode,queue.length);
    const batchNextLabel=nextTransitioning?"Chargement...":nextError?"Reessayer":isLastBatch?"Resultats":"Main suivante";
    return(
      <div className="pf-p2">
        {/* Bandeau chips : contexte */}
        <div className="pf-p2-chips">
          <span className="pf-p2-chip"><b>↑</b>{s.hpos}</span>
          <span className="pf-p2-chip">{roundBb(stackN)}bb</span>
          <span className="pf-p2-chip">SPR {spr}</span>
          <span className="pf-p2-chip" style={{color:isGto?"#34D8FF":"#FF8A3D",borderColor:isGto?"#1a4a66":"#5a3a1a"}}>{isGto?"GTO":"Exploit"}</span>
          <span className="pf-p2-chip" style={{marginLeft:"auto",color:diffCol,borderColor:"transparent",background:"transparent",fontWeight:700}}>● {diffLbl}</span>
        </div>

        {/* VILLAIN IA */}
        {vp&&(
          <section className="pf-p2-sec">
            <div className="pf-p2-h">VILLAIN IA</div>
            <div className="pf-p2-vil">
              <div className="pf-p2-vil-ava" style={{borderColor:vp.col+"88",boxShadow:`0 0 16px ${vp.col}44`,background:`${vp.col}18`}}>{vp.ico||"🤖"}</div>
              <div style={{minWidth:0,flex:1}}>
                <div className="pf-p2-vil-name" style={{color:vp.col}}>{s.vtype}</div>
                <div className="pf-p2-vil-sub">{s.vpos} · {vp.desc}</div>
              </div>
            </div>
            <div className="pf-p2-bars">
              {[["VPIP",vp.vpip,"#34D8FF",100],["PFR",vp.pfr,"#00E889",100],["AGG",vp.agg,"#FF8A3D",5]].map(([l,v,c,max])=>(
                <div key={l} className="pf-p2-bar">
                  <span className="k">{l}</span>
                  <div className="tr"><i style={{width:`${Math.min(100,v/max*100)}%`,background:c}}/></div>
                  <span className="v" style={{color:c}}>{l==="AGG"?v:v+"%"}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SOLUTION / ANALYSE */}
        <section className="pf-p2-sec">
          <div className="pf-p2-h">{isGto?"ANALYSE GTO":"ANALYSE"}</div>
          {!revealed?(
            <div className="pf-p2-locked">
              <span>🔒 Solution masquée</span>
              <button className="pf-p2-reveal" onClick={()=>setShowSol(true)}>Révéler</button>
            </div>
          ):(
            <>
              {ans&&best&&(
                <div className={`pf-p2-verdict ${ans.correct?"ok":"ko"}`}>
                  <strong>{chosen?.l||"—"} {ans.correct?"✓ correct":"✕ à revoir"}</strong>
                  <span>EV {chosenEv>=0?"+":""}{chosenEv.toFixed(2)}bb · Meilleure : {best.l}</span>
                </div>
              )}
              <div className="pf-p2-actlist">
                {actRows.map(r=>(
                  <div key={r.i} className={`pf-p2-actrow${r.best?" best":""}${r.chosen?" chosen":""}`}>
                    <span className="lab">{r.best&&<i>✦</i>}{r.a.l}</span>
                    <div className="tr"><i style={{width:`${r.freq}%`,background:barCol(r.a)}}/></div>
                    <span className="frq">{r.freq}%</span>
                    <span className="ev" style={{color:r.ev>=bestEv-0.01?"#00E889":"#8fa2c4"}}>{r.ev>=0?"+":""}{r.ev.toFixed(1)}</span>
                  </div>
                ))}
              </div>
              {best&&<div className="pf-p2-optimal">EV optimale <b>+{bestEv.toFixed(2)}bb</b></div>}
              <button className="pf-p2-ranges" onClick={()=>setMtRangePopup({heroPos:s.hpos,vilPos:s.vpos,heroAction:best?.id?.toLowerCase()||"open",stackBB:stackN})}>🃏 Voir les ranges GTO</button>
            </>
          )}
        </section>

        {/* HISTORIQUE */}
        <section className="pf-p2-sec">
          <div className="pf-p2-h">HISTORIQUE</div>
          <div className="pf-p2-histo">
            {["UTG","HJ","CO","BTN","SB","BB"].map(p=>{
              let v="—",vc="#6E7E91";
              if(p==="SB"){v="Petite blind 0.5bb";}
              else if(p==="BB"){v="Grosse blind 1bb";}
              else if(s.ctx?.folded?.includes?.(p)){v="Fold";vc="#8792a6";}
              else if(p===s.hpos){v="À parler";vc="#8FC0FF";}
              return <div key={p} className={`pf-p2-hrow${p===s.hpos?" hero":""}`}><span className="p">{p}</span><span className="a" style={{color:vc}}>{v}</span></div>;
            })}
          </div>
        </section>

        {/* INFORMATIONS */}
        <section className="pf-p2-sec">
          <div className="pf-p2-h">INFORMATIONS</div>
          <div className="pf-p2-info">
            {[["Street",s.street||"Preflop","#F4F7FB"],["Stack Hero",`${roundBb(stackN)}bb`,"#F4F7FB"],["Pot",`${roundBb(potN)}bb`,"#F4C56A"],["Pot Odds",odds,"#FF8A3D"],["SPR",spr,"#B85CFF"],["Difficulté",diffLbl,diffCol]].map(([k,v,c])=>(
              <div key={k} className="pf-p2-irow"><span className="k">{k}</span><span className="v" style={{color:c}}>{v}</span></div>
            ))}
          </div>
        </section>

        {/* TIMELINE */}
        <section className="pf-p2-sec pf-p2-tl">
          <div className="pf-p2-h">TIMELINE</div>
          <div className="pf-p2-tl-track"><i style={{width:`${Math.min(100,(idx/Math.max(1,(smode===999?queue.length:smode)))*100)}%`}}/></div>
          <div className="pf-p2-tl-row">
            <span className="cnt">{Math.min(idx+1,smode===999?idx+1:smode)}/{smode===999?"∞":smode}</span>
            <button className="pf-p2-next" disabled={!allSettled||nextTransitioning} onClick={handleNext}>
              {allSettled?`${batchNextLabel} ▶`:"Decision en cours..."}
            </button>
          </div>
        </section>
      </div>
    );
  };


  return(
    <div style={{display:"flex",flex:1,overflow:"hidden",flexDirection:"column"}}>
      {/* Barre filtres mobile — visible uniquement HORS session (la Zone 1 prend le relais) */}
      {!sessionActive&&(
        <div className="mob-filter-bar">
          <button className={`mob-filter-btn${mobSidebar?" on":""}`} onClick={()=>setMobSidebar(v=>!v)}>
            ⚙ Filtres {mobSidebar?"▲":"▼"}
          </button>
          <div style={{display:"flex",gap:4}}>
            {[1,2,3,4].map(n=>{
              const lock=mobileTrainingSingleTableOnly&&n>1;
              return <button key={n} className={`mob-filter-btn${ntables===n?" on":""}`} onClick={()=>!lock&&setNtables(n)} disabled={lock} style={{opacity:lock?.38:1,cursor:lock?"not-allowed":"pointer"}} title={lock?"Mobile : 1T uniquement pour garder la table lisible":`${n}T`}>{n}T</button>;
            })}
          </div>
        </div>
      )}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

      {/* ══ SIDEBAR COLLAPSIBLE (drawer plein écran sur mobile via mob-open) ══ */}
      <div className={`trainer-sidebar${collapsed?" collapsed":""}${mobSidebar?" mob-open":""}`}>

        {/* ── Bouton toggle ── */}
        <div className="sb-toggle" onClick={toggleSidebar} title={collapsed?"Ouvrir les filtres":"Masquer les filtres"}>
          {collapsed?"▶":"◀"}
        </div>

        {/* ── Mode EXPANDED : contenu complet ── */}
        <div className="sb-full">
          {/* Indicateur de verrouillage */}
          {sessionActive&&(
            <div style={{margin:"6px 12px 0",padding:"5px 9px",borderRadius:7,background:"rgba(255,194,71,.07)",border:"1px solid rgba(255,194,71,.25)",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11}}>🔒</span>
              <span style={{fontFamily:"'Inter',sans-serif",fontSize:8,color:T.gold,fontWeight:600}}>Session active — filtres verrouillés</span>
            </div>
          )}
          <div className="sb">
            <div className="sblbl">Session</div>
            {SMODES.map(m=>(
              <div key={m.id} className={`smpill${smode===m.id?" on":""}`} onClick={()=>!sessionActive&&setSmode(m.id)} style={{opacity:sessionActive&&smode!==m.id?.45:1,cursor:sessionActive?"not-allowed":"pointer"}}>
                <div><div className="smn" style={{color:smode===m.id?m.c:T.text}}>{m.l}</div><div className="smsub">{m.s}</div></div>
                <div className="smnum" style={{color:m.c}}>{m.id===999?"∞":m.id}</div>
              </div>
            ))}
          </div>
          <div className="sbsep"/>
          <div className="sb">
            <div className="sblbl">Multitabling</div>
            <div className="mtrow" style={{flexWrap:"wrap"}}>{TABLE_COUNTS.map(n=>{const lock=sessionActive||(fullSolo&&n>1)||(mobileTrainingSingleTableOnly&&n>1);return <div key={n} className={`mtbtn${ntables===n?" on":""}`} onClick={()=>!lock&&setNtables(n)} title={mobileTrainingSingleTableOnly&&n>1?"Mobile : 1T uniquement pour garder la table lisible":undefined} style={{opacity:lock&&ntables!==n?.38:1,cursor:lock?"not-allowed":"pointer"}}>{n}T</div>;})}</div>
            {fullSolo&&<div style={{marginTop:5,fontSize:8,color:T.cyan,fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>🃏 {trainMode==="full"?"Full Hand":"Session"} se joue en 1 table.</div>}
          </div>
          <div className="sbsep"/>
          {started&&!done&&<div className="sb">
            <div className="progrow"><span>Progression</span><span style={{fontFamily:T.mono,color:T.accent}}>{idx}/{smode===999?"∞":smode}</span></div>
            <div className="progt"><div className="progf" style={{width:prog+"%"}}/></div>
          </div>}
          {/* ── MODE GTO / EXPLOIT ── */}
          <div className="sb">
            <div className="sblbl">Mode d'entraînement</div>
            <div style={{display:"flex",gap:4,marginBottom:10}}>
              {[["gto","🎯 GTO","#34D8FF"],["exploit","🦈 Exploit","#FF8A3D"]].map(([m,lbl,col])=>(
                <div key={m} onClick={()=>!sessionActive&&setTrainerMode(m)} style={{
                  flex:1,padding:"7px 4px",borderRadius:8,textAlign:"center",
                  cursor:sessionActive?"not-allowed":"pointer",
                  opacity:sessionActive&&trainerMode!==m?.45:1,
                  background:trainerMode===m?`${col}18`:"#030D2A",
                  border:`1px solid ${trainerMode===m?col+"55":"#152D6E"}`,
                  fontFamily:"'Space Grotesk',sans-serif",fontSize:9.5,fontWeight:700,
                  color:trainerMode===m?col:"#6F81A8",transition:"all .18s",
                  boxShadow:trainerMode===m?`0 0 10px ${col}33`:"none",
                }}>{lbl}</div>
              ))}
            </div>
            {trainerMode==="exploit"&&(
              <>
                <div className="pffl" style={{marginBottom:4}}>Plateforme</div>
                <select className="pfsel" style={{marginBottom:8}} value={platform} onChange={e=>!sessionActive&&setPlatform(e.target.value)} disabled={sessionActive}>
                  {Object.entries(PLATFORM_PROFILES).map(([k,p])=>(
                    <option key={k} value={k}>{p.flag} {p.name}</option>
                  ))}
                </select>
                <div style={{padding:"6px 8px",background:"rgba(255,138,61,.07)",border:"1px solid rgba(255,138,61,.2)",borderRadius:6,fontSize:8.5,color:"#FF8A3D",fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>
                  {PLATFORM_PROFILES[platform]?.desc}
                </div>
              </>
            )}
          </div>
          <div className="sbsep"/>

          {/* ── TYPE DE SESSION (Spot / Street / Full Hand / Session / Mix) ── */}
          <div className="sb">
            <div className="sblbl">Type de session</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
              {TRAIN_MODES.map(m=>{
                const on=trainMode===m.id;
                return(
                  <div key={m.id} onClick={()=>!sessionActive&&setTrainMode(m.id)} style={{
                    padding:"7px 6px",borderRadius:8,textAlign:"center",
                    cursor:sessionActive?"not-allowed":"pointer",
                    opacity:sessionActive&&!on?.45:1,
                    gridColumn:m.id==="mix"?"1 / -1":"auto",
                    background:on?`${m.col}18`:"#030D2A",
                    border:`1px solid ${on?m.col+"66":"#152D6E"}`,
                    fontFamily:"'Space Grotesk',sans-serif",fontSize:9.5,fontWeight:700,
                    color:on?m.col:"#6F81A8",transition:"all .18s",
                    boxShadow:on?`0 0 10px ${m.col}33`:"none",
                  }}>{m.ic} {m.l}</div>
                );
              })}
            </div>
            <div style={{marginTop:6,padding:"6px 8px",background:"rgba(31,139,255,.06)",border:"1px solid rgba(31,139,255,.16)",borderRadius:6,fontSize:8.5,color:T.text3,fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>
              {TRAIN_MODES.find(m=>m.id===trainMode)?.desc}
            </div>
            {/* Street de départ — uniquement en mode Street */}
            {trainMode==="street"&&(
              <div style={{marginTop:8}}>
                <div className="pffl" style={{marginBottom:4}}>Street de départ</div>
                <div style={{display:"flex",gap:4}}>
                  {TRAIN_STREETS.map(s=>(
                    <div key={s} onClick={()=>!sessionActive&&setStreetStart(s)} style={{
                      flex:1,padding:"6px 4px",borderRadius:7,textAlign:"center",
                      cursor:sessionActive?"not-allowed":"pointer",
                      background:streetStart===s?"rgba(16,216,122,.16)":"#030D2A",
                      border:`1px solid ${streetStart===s?"rgba(16,216,122,.5)":"#152D6E"}`,
                      fontFamily:"'Space Grotesk',sans-serif",fontSize:9,fontWeight:700,
                      color:streetStart===s?"#10D87A":"#6F81A8",transition:"all .15s",
                    }}>{s}</div>
                  ))}
                </div>
              </div>
            )}
            {fullSolo&&(
              <div style={{marginTop:6,fontSize:8,color:T.cyan,fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>🃏 Coup complet joué en 1 table (préflop → flop → turn → river → analyse).</div>
            )}
          </div>
          <div className="sbsep"/>

          {/* ── STRUCTURE DE TABLE (nb joueurs) ── */}
          {/* Mode evolutif : templates + leaks + population */}
          <PillGroup label="Mode adaptatif" color="#9B5CFF" disabled={sessionActive}
            options={ADAPTIVE_MODE_OPTIONS.map(o=>({id:o.id,l:o.label}))}
            value={f.adaptiveMode||"balanced"} onChange={v=>upd("adaptiveMode",v)}
            hint={ADAPTIVE_MODE_OPTIONS.find(o=>o.id===(f.adaptiveMode||"balanced"))?.hint}/>
          <div className="sbsep"/>

          <PillGroup label="Structure de table" color="#34D8FF" disabled={sessionActive}
            options={TABLE_SIZES.map(n=>({id:n,l:n+"J"}))} value={f.nplayers} onChange={v=>{upd("nplayers",v);
              // recadre les positions si hors du format
              const pos=POSITIONS_BY_SIZE[v]||[];if(f.hp!=="Tous"&&!pos.includes(f.hp))upd("hp","Tous");if(f.vp!=="Tous"&&!pos.includes(f.vp))upd("vp","Tous");}}
            hint={`Positions ${f.nplayers}J : ${(POSITIONS_BY_SIZE[f.nplayers]||[]).join(" · ")}`}/>
          <div className="sbsep"/>

          {/* ── STACK EFFECTIF ── */}
          <PillGroup label="Stack effectif" color="#FFC247" disabled={sessionActive}
            options={[{id:"",l:"Tous"},...STACK_PRESETS.map(s=>({id:s,l:s+"bb"}))]}
            value={f.stackEff} onChange={v=>upd("stackEff",v)}/>
          <div className="sb" style={{marginTop:-6}}>
            <div className="pffg" style={{display:"flex",alignItems:"center",gap:6}}>
              <span className="pffl" style={{margin:0}}>Personnalisé</span>
              <input type="number" min={1} max={500} disabled={sessionActive} placeholder="bb" value={STACK_PRESETS.includes(String(f.stackEff))||!f.stackEff?"":f.stackEff}
                onChange={e=>upd("stackEff",e.target.value)} style={{width:70,background:"#030D2A",border:"1px solid #152D6E",borderRadius:6,color:T.text,fontFamily:"'Inter',sans-serif",fontSize:10,padding:"5px 7px",outline:"none"}}/>
            </div>
          </div>
          <div className="sbsep"/>

          {/* ── TYPE DE SPOT (multi) ── */}
          <PillGroup label="Type de spot (multi)" color="#34D8FF" multi disabled={sessionActive}
            options={SPOT_TYPES.map(t=>t.id)} value={f.spotTypes} onChange={v=>upd("spotTypes",v)}
            hint={f.spotTypes?.length?`${f.spotTypes.length} type(s) actif(s)`:"Aucun = tous les types"}/>
          <div className="sbsep"/>

          {/* ── PHASE ── */}
          <PillGroup label="Phase tournoi" color="#9B5CFF" disabled={sessionActive}
            options={TRN_PHASES} value={f.phase} onChange={v=>upd("phase",v)}/>
          <div className="sbsep"/>

          {/* ── PRESSION ICM ── */}
          <PillGroup label="Pression ICM" color="#FF4560" disabled={sessionActive}
            options={ICM_LEVELS} value={f.icm} onChange={v=>upd("icm",v)}
            hint={["Forte","Extrême"].includes(f.icm)?"Génère davantage de spots à risk premium élevé.":null}/>
          <div className="sbsep"/>

          {/* ── FORMAT DÉTAILLÉ (améliore l'ancien Format) ── */}
          <div className="sb">
            <div className="sblbl">Format</div>
            <div className="pffg"><select className="pfsel" value={f.fmtDetail} disabled={sessionActive}
              onChange={e=>{const id=e.target.value;const o=FORMATS_DETAILED.find(x=>x.id===id);upd("fmtDetail",id);if(o)upd("fmt",o.fmt);}}>
              {FORMATS_DETAILED.map(o=><option key={o.id} value={o.id}>{o.id}</option>)}
            </select></div>
          </div>
          <div className="sbsep"/>

          {/* ── NIVEAU DU FIELD (impacte l'Exploit) ── */}
          <PillGroup label="Niveau du field" color="#FF8A3D" disabled={sessionActive}
            options={FIELD_LEVELS} value={f.field} onChange={v=>upd("field",v)}
            hint={trainerMode!=="exploit"?"Effet principal en mode Exploit.":"Ajuste les tendances de la population exploitée."}/>
          <div className="sbsep"/>

          {/* ── STYLE HERO (Coach AI) ── */}
          <PillGroup label="Style Hero" color="#34D8FF" disabled={sessionActive}
            options={HERO_STYLES} value={f.heroStyle} onChange={v=>upd("heroStyle",v)}
            hint="Adapte les remarques du Coach AI à ton style."/>
          <div className="sbsep"/>

          {/* ── PROFIL VILAIN AVANCÉ (améliore l'ancien Profil Vilain) ── */}
          <div className="sb">
            <div className="sblbl">Profil Vilain</div>
            <div className="pffg"><select className="pfsel" value={f.vilainAdv} disabled={sessionActive}
              onChange={e=>{const id=e.target.value;upd("vilainAdv",id);upd("vt",VADV_MAP[id]||"Tous");}}>
              {VILLAIN_ADV.map(o=><option key={o.id} value={o.id}>{o.id}</option>)}
            </select></div>
            {f.vilainAdv!=="Tous"&&VILLAIN_PROFILES[VADV_MAP[f.vilainAdv]]&&(
              <div style={{marginTop:4,padding:"5px 7px",background:"rgba(31,139,255,.06)",borderRadius:5,border:"1px solid #1A3A80",fontSize:8,color:VILLAIN_PROFILES[VADV_MAP[f.vilainAdv]].col,fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>
                {VILLAIN_PROFILES[VADV_MAP[f.vilainAdv]].desc}
              </div>
            )}
          </div>
          <div className="sbsep"/>

          {/* ── POSITIONS (selon structure de table) ── */}
          <div className="sb">
            <div className="sblbl">Positions</div>
            <div className="pffg"><div className="pffl">Position Hero</div>
              <select className="pfsel" value={f.hp} onChange={e=>!sessionActive&&upd("hp",e.target.value)} disabled={sessionActive}>
                {["Tous",...(POSITIONS_BY_SIZE[f.nplayers]||POS)].map(p=><option key={p}>{p}</option>)}
              </select></div>
            <div className="pffg"><div className="pffl">Position Vilain</div>
              <select className="pfsel" value={f.vp} onChange={e=>!sessionActive&&upd("vp",e.target.value)} disabled={sessionActive}>
                {["Tous",...(POSITIONS_BY_SIZE[f.nplayers]||POS)].map(p=><option key={p}>{p}</option>)}
              </select></div>
          </div>
          <div className="sbsep"/>

          {/* ── OBJECTIFS D'ENTRAÎNEMENT ── */}
          <div className="sb">
            <div className="sblbl">Je veux travailler</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {TRAIN_OBJECTIVES.map(o=>{
                const act=f.objective===o.id;
                return(
                  <button key={o.id} disabled={sessionActive} onClick={()=>!sessionActive&&applyObjective(o.id)} style={{
                    padding:"5px 9px",borderRadius:7,fontFamily:"'Space Grotesk',sans-serif",fontSize:9,fontWeight:700,
                    cursor:sessionActive?"not-allowed":"pointer",border:`1px solid ${act?"#10D87A66":"#152D6E"}`,
                    background:act?"rgba(16,216,122,.12)":"#030D2A",color:act?T.green:"#6F81A8",
                    opacity:sessionActive&&!act?.45:1,transition:"all .15s",
                  }}>{o.id}</button>
                );
              })}
            </div>
            {f.objective==="hh"&&(
              <div style={{marginTop:6,padding:"5px 8px",borderRadius:6,background:"rgba(255,194,71,.08)",border:"1px solid rgba(255,194,71,.25)",fontSize:8.5,color:T.amber,fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>
                ⚙ Génération directe depuis tes HH importées — <b>Fonction en développement</b>. Utilise le Replayer puis le Leak Hunter ci-dessous.
              </div>
            )}
          </div>
          <div className="sbsep"/>

          {/* ── DIFFICULTÉ (pro) ── */}
          <PillGroup label="Difficulté" color="#9B5CFF" disabled={sessionActive}
            options={DIFF_PRO.map(d=>d.id)} value={(DIFF_PRO.find(d=>d.dv===f.diffLvl)||DIFF_PRO[0]).id}
            onChange={id=>{const d=DIFF_PRO.find(x=>x.id===id);upd("diffLvl",d?d.dv:0);}}
            hint="Plus élevé = spots plus complexes / proches."/>
          <div className="sbsep"/>

          {/* ── TIMER ── */}
          <PillGroup label="Timer (vitesse de décision)" color="#FFC247"
            options={TIMER_OPTS.map(t=>({id:t,l:t===0?"Aucun":t+"s"}))} value={f.timer} onChange={v=>upd("timer",v)}/>
          <div className="sbsep"/>

          {/* ── NIVEAU COACH AI ── */}
          <PillGroup label="Niveau Coach AI" color="#34D8FF"
            options={COACH_LEVELS} value={f.coachLevel} onChange={v=>upd("coachLevel",v)}
            hint="Adapte le niveau de détail des explications."/>
          <div className="sbsep"/>

          {/* ── LEAK HUNTER ── */}
          <div className="sb">
            <div className="sblbl">🎯 Leak Hunter</div>
            {leak?(
              <div style={{padding:"8px 10px",borderRadius:8,background:"rgba(255,69,96,.07)",border:"1px solid rgba(255,69,96,.25)"}}>
                <div style={{fontSize:9.5,fontWeight:700,color:T.red,fontFamily:"'Space Grotesk',sans-serif",marginBottom:4}}>Leak détecté : {leak.label} ({leak.acc}%)</div>
                <div style={{fontSize:8.5,color:T.text3,fontFamily:"'Inter',sans-serif",lineHeight:1.6,marginBottom:2}}>EV perdue estimée : <b style={{color:T.red}}>-{leak.evLost}bb / 100 spots</b></div>
                <div style={{fontSize:8.5,color:T.text3,fontFamily:"'Inter',sans-serif",lineHeight:1.6,marginBottom:2}}>Fréquence d'erreur : <b style={{color:T.amber}}>{leak.errFreq}%</b> sur {leak.n} spots</div>
                <div style={{fontSize:8.5,color:T.text3,fontFamily:"'Inter',sans-serif",lineHeight:1.6,marginBottom:8}}>Reco : travailler des spots {leak.label.toLowerCase()}.</div>
                <button disabled={sessionActive} onClick={startFromLeak} style={{width:"100%",padding:"8px",borderRadius:7,border:"none",cursor:sessionActive?"not-allowed":"pointer",
                  fontFamily:"'Space Grotesk',sans-serif",fontSize:9.5,fontWeight:800,background:"linear-gradient(135deg,#FF4560,#9B5CFF)",color:"#fff",opacity:sessionActive?.5:1}}>
                  ⚔ Créer une session depuis ce leak
                </button>
              </div>
            ):(
              <div style={{padding:"7px 9px",borderRadius:7,background:"#030D2A",border:"1px solid #152D6E",fontSize:8.5,color:T.text3,fontFamily:"'Inter',sans-serif",lineHeight:1.6}}>
                Joue quelques sessions : le Leak Hunter analysera tes positions, catégories et formats les plus faibles (Replayer, Solver, HH, sessions Trainer) pour cibler tes erreurs.
              </div>
            )}
          </div>
          <div className="sbsep"/>
          <div className="sb">
            <div className="sblbl">Stats session</div>
            <div className="statg">
              <div className="statbox"><div className="statv" style={{color:T.green}}>{sc}</div><div className="statl">Corrects</div></div>
              <div className="statbox"><div className="statv" style={{color:T.accent}}>{approx}</div><div className="statl">Approx.</div></div>
              <div className="statbox"><div className="statv" style={{color:T.red}}>{st-sc-approx}</div><div className="statl">Erreurs</div></div>
              <div className="statbox"><div className="statv" style={{color:T.text}}>{pct}%</div><div className="statl">Accuracy</div></div>
            </div>
            {st>0?(
              <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
                {[
                  ["EV gagnée",`+${sessAdv.evGain}bb`,T.green],
                  ["EV perdue",`-${sessAdv.evLoss}bb`,T.red],
                  ["Score GTO",sessAdv.gtoScore!=null?sessAdv.gtoScore+"%":"—",T.cyan],
                  ["Score Exploit",sessAdv.exploitScore!=null?sessAdv.exploitScore+"%":"—","#FF8A3D"],
                  ["Temps moyen",sessAdv.avgTime?sessAdv.avgTime+"s":"—",T.text2],
                  ["Meilleure position",sessAdv.bestPos?`${sessAdv.bestPos.p} (${sessAdv.bestPos.acc}%)`:"—",T.green],
                  ["Pire position",sessAdv.worstPos?`${sessAdv.worstPos.p} (${sessAdv.worstPos.acc}%)`:"—",T.red],
                  ["Street la plus faible",sessAdv.weakStreet?`${sessAdv.weakStreet.s} (${sessAdv.weakStreet.acc}%)`:"—",T.amber],
                  ["Leak principal",leak?leak.label:"—",T.purple],
                  ["Progression",sessAdv.progression!=null?`${sessAdv.progression>=0?"+":""}${sessAdv.progression}% vs session préc.`:"—",sessAdv.progression>=0?T.green:T.red],
                ].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:8.5,fontFamily:"'Inter',sans-serif"}}>
                    <span style={{color:T.text3}}>{l}</span>
                    <span style={{color:c,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif"}}>{v}</span>
                  </div>
                ))}
              </div>
            ):(
              <div style={{marginTop:6,fontSize:8,color:T.text4,fontFamily:"'Inter',sans-serif",fontStyle:"italic"}}>Les stats avancées (EV, scores, temps, positions) s'affichent dès le premier spot joué.</div>
            )}
          </div>
          {history.length>0&&<><div className="sbsep"/>
          <div className="sb">
            <div className="sblbl">Historique</div>
            {history.slice(0,3).map(h=>(
              <div key={h.id} style={{padding:"5px 7px",background:"#071B44",border:"1px solid #1A3A80",borderRadius:3,marginBottom:4,fontSize:9.5}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                  <span className="tag tag-gold">{h.mode===999?"∞":h.mode} spots</span>
                  <span style={{fontFamily:T.mono,color:T.text,fontWeight:700}}>{h.pct}%</span>
                </div>
                <div style={{display:"flex",gap:6,color:T.text3}}>
                  <span style={{color:T.green}}>✓{h.correct}</span>
                  <span style={{color:T.accent}}>~{h.approx}</span>
                  <span style={{color:T.red}}>✗{h.errors}</span>
                  <span style={{marginLeft:"auto"}}>{h.grade}</span>
                </div>
              </div>
            ))}
          </div></>}
        </div>

        {/* ── Mode COLLAPSED : icônes compactes ── */}
        <div className="sb-icons">
          {/* Mode session active icon */}
          {(()=>{
            const m=SMODES.find(m=>m.id===smode)||SMODES[0];
            return(
              <div className={`sb-icon-btn active`} title={`Session: ${m.l}`} onClick={toggleSidebar}>
                <span>🎯</span>
                <span className="lbl">{m.l}</span>
              </div>
            );
          })()}
          {/* Mode GTO/Exploit — clic direct = toggle sans expand */}
          <div className="sb-icon-btn" title={`Mode ${trainerMode==="gto"?"GTO → clic=Exploit":"Exploit → clic=GTO"}`}
            onClick={()=>!sessionActive&&setTrainerMode(m=>m==="gto"?"exploit":"gto")}
            style={{background:trainerMode==="gto"?"rgba(52,216,255,.1)":"rgba(255,138,61,.1)",cursor:sessionActive?"not-allowed":"pointer"}}>
            <span style={{fontSize:14}}>{trainerMode==="gto"?"🎯":"🦈"}</span>
            <span className="lbl" style={{color:trainerMode==="gto"?"#34D8FF":"#FF8A3D"}}>{trainerMode==="gto"?"GTO":"Exploit"}</span>
          </div>
          {/* Tables — clic direct = cycle 1T→2T→3T→4T */}
          <div className="sb-icon-btn" title={`${ntables}T — clic = table suivante`}
            onClick={()=>!sessionActive&&!mobileTrainingSingleTableOnly&&setNtables(n=>n>=4?1:n+1)}
            style={{cursor:(sessionActive||mobileTrainingSingleTableOnly)?"not-allowed":"pointer"}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:700,color:T.blue}}>{ntables}T</span>
            <span className="lbl">Tables</span>
          </div>
          <div className="sb-sep-line"/>
          {/* Stats */}
          {[
            {v:sc,c:T.green,l:"✓"},
            {v:st-sc-approx,c:T.red,l:"✗"},
            {v:pct+"%",c:T.cyan,l:"%"},
          ].map(({v,c,l})=>(
            <div key={l} className="sb-stat-mini">
              <span className="v" style={{color:c}}>{v}</span>
              <span className="l">{l}</span>
            </div>
          ))}
          {/* Progression si session active */}
          {started&&!done&&(
            <>
              <div className="sb-sep-line"/>
              <div className="sb-prog-mini">
                <div className="sb-prog-mini-fill" style={{width:prog+"%"}}/>
              </div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.text4,textAlign:"center"}}>{idx}/{smode===999?"∞":smode}</div>
            </>
          )}
          <div className="sb-sep-line" style={{marginTop:"auto"}}/>
          {/* Bouton expand */}
          <div className="sb-icon-btn" title="Ouvrir les filtres" onClick={toggleSidebar}>
            <span>⚙️</span>
            <span className="lbl">Filtres</span>
          </div>
        </div>
      </div>

      <div className="trainer-scroll-area" style={{flex:1,overflow:ntables===1?"hidden":"auto",background:T.bg,display:"flex",flexDirection:"column"}}>

        {/* ══ ZONE 1 MOBILE : barre supérieure compacte ══ */}
        {started&&!done&&(
          <div className="mtr-top">
            <span className="mtr-fmt" style={{
              background:trainerMode==="gto"?"rgba(52,216,255,.1)":"rgba(255,138,61,.1)",
              border:`1px solid ${trainerMode==="gto"?"rgba(52,216,255,.3)":"rgba(255,138,61,.3)"}`,
              color:trainerMode==="gto"?"#34D8FF":"#FF8A3D",
            }}>{trainerMode==="gto"?"🎯 GTO":`🦈 ${PLATFORM_PROFILES[platform]?.flag||"Exploit"}`}{ntables>1&&` · ${ntables}T`}</span>
            <div className="mtr-prog-wrap">
              <div className="mtr-prog-line">
                <span className="mtr-prog-count">{Math.min(idx+1,smode===999?idx+1:smode)}/{smode===999?"∞":smode}</span>
                <span className="mtr-prog-left">{smode===999?`${results.length} joués`:`${Math.max(0,smode-idx)} restants`}</span>
              </div>
              <div className="mtr-prog-track"><div className="mtr-prog-fill" style={{width:prog+"%"}}/></div>
            </div>
            <div className="mtr-acc">
              <span className="v" style={{color:st===0?T.text3:pct>=75?T.green:pct>=50?T.amber:T.red}}>{st>0?pct+"%":"—"}</span>
              <span className="l">PRÉC.</span>
            </div>
            <button className={`mtr-ico-btn${sheetTab?" on":""}`} title="Panneau (Vilain · Stats · Notes)" onClick={()=>{vibrate(VIB.tap);setSheetTab(s=>s?null:"villain");}}>☰</button>
            <button className={`mtr-ico-btn${mobFocus?" on":""}`} title="Mode Focus" onClick={()=>{vibrate(VIB.tap);setMobFocus(v=>!v);}}>⛶</button>
            {onGoCoach&&<button className="mtr-ico-btn mtr-coach-btn" title="Coach AI" aria-label="Coach AI" onClick={()=>{vibrate(VIB.tap);onGoCoach();}}>🧠</button>}
            <button className="mtr-ico-btn stop" title="Arrêter la session" onClick={stopSession}>⏹</button>
          </div>
        )}

        {/* ══ TIMELINE DE SESSION : Spot 1 → N · ✓ ✗ ~ · ★ difficile ══ */}
        {started&&!done&&(()=>{
          const cap=smode===999?Math.min(queue.length,results.length+ntables+8):Math.min(smode,queue.length||smode);
          const resByQi={};results.forEach(r=>{if(r.qi!==undefined)resByQi[r.qi]=r;});
          return(
            <div className="mtr-timeline">
              {Array.from({length:cap},(_,k)=>{
                const r=resByQi[k];
                const isCur=k>=idx&&k<idx+ntables&&!r;
                const spotK=queue[k];
                const hard=spotK&&spotK.diff>=3;
                let cls="",ico=String(k+1);
                if(r){
                  const approxFreq=r.spot?.freq?.[r.spot?.acts?.[r.ua]?.id]||0;
                  if(r.correct){cls="ok";ico="✓";}
                  else if(approxFreq>=20){cls="approx";ico="~";}
                  else{cls="ko";ico="✗";}
                }else if(isCur){cls="cur";}
                return(
                  <span key={k} ref={isCur&&k===idx?curDotRef:null} className={`mtr-dot${cls?" "+cls:""}`}
                    onClick={()=>{if(r){vibrate(VIB.tap);setSheetTab("history");}}}>
                    {ico}
                    {hard&&<span className="star">★</span>}
                  </span>
                );
              })}
            </div>
          );
        })()}

        {started&&!done&&(
          <div className="trainer-topstrip" style={{background:"linear-gradient(90deg,#030D2A,#040B1F)",borderBottom:"1px solid #152D6E",padding:"5px 12px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {/* Mode badge */}
            <div style={{
              display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,
              background:trainerMode==="gto"?"rgba(52,216,255,.1)":"rgba(255,138,61,.1)",
              border:`1px solid ${trainerMode==="gto"?"rgba(52,216,255,.3)":"rgba(255,138,61,.3)"}`,
              fontFamily:"'Space Grotesk',sans-serif",fontSize:9,fontWeight:700,
              color:trainerMode==="gto"?"#34D8FF":"#FF8A3D",
            }}>
              {trainerMode==="gto"?"🎯 Mode GTO":"🦈 Mode Exploit"}
              {trainerMode==="exploit"&&<span style={{fontFamily:"'Inter',sans-serif",fontSize:8,opacity:.8}}>· {PLATFORM_PROFILES[platform]?.flag} {PLATFORM_PROFILES[platform]?.name}</span>}
            </div>
            {/* Solution toggle — MANDATORY */}
            <button onClick={()=>setShowSol(s=>!s)} className={`sol-toggle-btn ${showSol?"sol-visible":"sol-hidden"}`}>
              <span>{showSol?"👁":"🚫"}</span>
              {showSol?"Masquer la solution":"Afficher la solution"}
            </button>
            {/* Progression */}
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9.5,color:T.text4}}>
              {idx+1}/{smode===999?"∞":smode}
            </div>
            {/* Coach AI — dans la barre, à gauche d'Arrêter (maquette v2, tous modes) */}
            {onGoCoach&&(
              <button onClick={onGoCoach} className="pf-mt-coach-btn" style={{
                marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:6,padding:"6px 16px",borderRadius:20,fontSize:11,
                fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,cursor:"pointer",minWidth:118,justifyContent:"center",
                border:"1px solid rgba(120,90,255,.5)",background:"linear-gradient(135deg,#1F8BFF,#7c3cff)",color:"#fff",
                boxShadow:"0 2px 12px rgba(80,120,255,.35)",transition:"all .2s",
              }}>🧠 Coach AI</button>
            )}
            {/* Bouton Arrêter */}
            <button onClick={stopSession} style={{
              marginLeft:onGoCoach?0:"auto",padding:"4px 14px",borderRadius:20,fontSize:10,fontFamily:"'Inter',sans-serif",fontWeight:700,cursor:"pointer",
              border:"1px solid rgba(255,69,96,.45)",background:"rgba(255,69,96,.1)",
              color:T.red,transition:"all .2s",
            }}>⏹ Arrêter</button>
          </div>
        )}
        {!started&&!done&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:420,gap:16,textAlign:"center",padding:36}}>
            <div style={{width:60,height:60,borderRadius:"50%",background:T.violetDim,border:`2px solid ${T.violet}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.mono,fontSize:24,color:T.violet,boxShadow:`0 0 30px ${T.violet}30`}}>♠</div>
            <div style={{fontFamily:T.mono,fontSize:17,color:T.text,letterSpacing:3,textShadow:`0 0 20px ${T.accent}40`}}>POKERFORGE TRAINER</div>
            {/* ── Reprise de session auto-sauvegardée ── */}
            {resume&&(
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,background:"rgba(31,139,255,.08)",border:"1px solid rgba(31,139,255,.35)",maxWidth:430,width:"100%",boxShadow:"0 4px 18px rgba(31,139,255,.12)"}}>
                <span style={{fontSize:18,flexShrink:0}}>⏸</span>
                <div style={{flex:1,textAlign:"left",minWidth:0}}>
                  <div style={{fontFamily:T.stats,fontSize:11,fontWeight:700,color:T.text}}>Session interrompue — {resume.results?.length||0}/{resume.smode===999?"∞":resume.smode} spots joués</div>
                  <div style={{fontFamily:T.stats,fontSize:9,color:T.text3}}>{mobileTrainingSingleTableOnly?1:(resume.ntables||1)} table{(!mobileTrainingSingleTableOnly&&(resume.ntables||1)>1)?"s":""} · {resume.trainerMode==="exploit"?"🦈 Exploit":"🎯 GTO"} · progression sauvegardée</div>
                </div>
                <button className="btn btng" style={{fontSize:10,padding:"7px 13px",flexShrink:0}} onClick={resumeAutosave}>▶ Reprendre</button>
                <button className="btn btns" style={{fontSize:10,padding:"7px 9px",flexShrink:0}} title="Abandonner cette session" onClick={dismissResume}>✕</button>
              </div>
            )}
            <div style={{fontSize:12,color:T.text2,maxWidth:420,lineHeight:1.75}}>Situations réelles · Villain joue · EV affichée · <strong style={{color:T.accent}}>{mobileTrainingSingleTableOnly?"1 table mobile lisible":"4 tables simultanées"}</strong></div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
              {SMODES.map(m=><button key={m.id} className={`btn ${smode===m.id?"btng":"btns"}`} onClick={()=>setSmode(m.id)}>{m.l} ({m.id===999?"∞":m.id})</button>)}
            </div>
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              <span style={{fontSize:11,color:T.text2}}>Tables :</span>
              {[1,2,3,4].map(n=>{const lock=(fullSolo&&n>1)||(mobileTrainingSingleTableOnly&&n>1);return <div key={n} className={`mtbtn${ntables===n?" on":""}`} title={mobileTrainingSingleTableOnly&&n>1?"Mobile : 1T uniquement pour garder la table lisible":undefined} style={{width:38,opacity:lock?.38:1,cursor:lock?"not-allowed":"pointer"}} onClick={()=>!lock&&setNtables(n)}>{n}T</div>;})}
            </div>
            <div onClick={()=>setShowSol(s=>!s)} style={{
              display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 18px",borderRadius:30,
              background:showSol?"rgba(16,216,122,.1)":"rgba(255,69,96,.08)",
              border:`1px solid ${showSol?"rgba(16,216,122,.3)":"rgba(255,69,96,.2)"}`,
              transition:"all .2s"
            }}>
              <span style={{fontSize:16}}>{showSol?"👁":"🔒"}</span>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:showSol?T.green:T.red,fontFamily:T.stats}}>{showSol?"Solution visible après chaque réponse":"Solution masquée — mode hard"}</div>
                <div style={{fontSize:9.5,color:T.text3,fontFamily:T.stats,marginTop:1}}>Clique pour {showSol?"activer le mode hard":"révéler les solutions"}</div>
              </div>
            </div>
            {(()=>{const cnt=countQ(f);const warn=cnt===0;return(
              <>
                <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
                  <button className="btn btng" style={{fontSize:15,padding:"13px 38px",letterSpacing:".05em"}} onClick={()=>start()}>
                    ▶ Lancer la session
                  </button>
                  <button className="btn btns" style={{fontSize:12,padding:"12px 18px"}} onClick={()=>setReviewOpen(true)}>🔍 Review & Leaks</button>
                </div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:9,color:T.text4}}>
                  {ntables}T · {smode===999?"Illimité":SMODES.find(m=>m.id===smode)?.l||"Sprint"} · {smode===999?"∞":smode} spots
                  {f.hp!=="Tous"&&<> · Hero : {f.hp}</>}
                  {f.vp!=="Tous"&&<> · Vilain : {f.vp}</>}
                  {f.cat!=="Tous"&&<> · {f.cat}</>}
                </div>
                {warn
                  ?<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.amber,background:"rgba(255,194,71,.08)",border:"1px solid rgba(255,194,71,.25)",borderRadius:5,padding:"4px 10px",textAlign:"center"}}>⚠ Aucun spot pour ces filtres — la session utilisera tous les spots</div>
                  :<div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.text4,textAlign:"center"}}>{cnt} spot{cnt>1?"s":""} disponible{cnt>1?"s":""}</div>
                }
              </>
            );})()}
          </div>
        )}
        {done&&<div style={{padding:12,flex:1,minHeight:0,height:"100%",overflowY:"auto",WebkitOverflowScrolling:"touch",boxSizing:"border-box"}}><div className="pcard"><SessionEnd results={results} mode={smode} stoppedEarly={stoppedEarly} onResume={stoppedEarly?resumeSession:null} onRestart={r=>r?start(true):(()=>{setStarted(false);setDone(false);setStoppedEarly(false);})()} onSave={handleSave}/>
          <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
            <button className="btn" style={{flex:1,minWidth:160,background:"linear-gradient(90deg,#FF4560,#FF8A3D)",color:"#fff",fontSize:12,fontWeight:700,padding:"11px",borderRadius:9,border:"none",cursor:"pointer"}} onClick={()=>startErrorDrill({errors:true})}>🎯 Drill sur mes erreurs</button>
            <button className="btn btns" style={{flex:1,minWidth:160,fontSize:12}} onClick={()=>setReviewOpen(true)}>🔍 Review & Leak Hunter</button>
          </div>
        </div></div>}
        {reviewOpen&&<TrainerReviewPanel onClose={()=>setReviewOpen(false)} onDrill={startErrorDrill} onReplay={replaySpot}/>}
        {mtRangePopup&&<RangePopup {...mtRangePopup} onClose={()=>setMtRangePopup(null)}/>}
        {started&&!done&&(
          <div className="pf-mt-playrow" style={!isMobile?{flex:1,minHeight:0,display:"flex",flexDirection:"row",overflow:"hidden"}:{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
          <div ref={gridRef} style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
            <div className={`${gridClass}${ntables>1?" mt-zoom-wrap":""}`} style={ntables===1?{flex:1,minHeight:0,padding:0,gap:0,display:"flex",flexDirection:"column"}:{flex:1,minHeight:0}}>
              {Array.from({length:ntables},(_,t)=>{
                const spot=queue[idx+t];if(!spot)return null;
                const isAns=!!tableAns[t];
                const slotCls=ntables>1?(isAns?"table-slot-answered":"table-slot-active"):"";
                const expanded=isMobile&&ntables>1&&expandedT===t;
                const isActiveT=ntables>1&&activeTable===t;
                return(
                  <div key={`${idx}-${t}`}
                    className={`mt-slot${slotCls?" "+slotCls:""}${expanded?" mt-slot-expanded":""}${isActiveT?" mt-slot-focus":""}`}
                    style={ntables>1?{display:"flex",flexDirection:"column"}:undefined}
                    onMouseDown={ntables>1&&!isMobile?()=>setActiveTable(t):undefined}
                    onTouchStart={isMobile&&ntables>1?slotTouchStart:undefined}
                    onTouchMove={isMobile&&ntables>1?slotTouchMove:undefined}
                    onTouchEnd={isMobile&&ntables>1?()=>slotTouchEnd(t):undefined}>
                    {/* Titre TABLE n + état (multi-table) */}
                    {ntables>1&&(
                      <div className={`mt-table-title${isActiveT?" active":""}${isAns?" answered":""}`}>
                        <span>TABLE {t+1}</span>
                        {isAns&&<i title="Répondue">✓</i>}
                        {isActiveT&&!isAns&&<em title="Table active — reçoit les raccourcis F1–F4">●</em>}
                      </div>
                    )}
                    {/* Bouton fermer (table agrandie) */}
                    {expanded&&<button className="mt-expand-x" onClick={()=>setExpandedT(null)} title="Réduire">✕</button>}
                    {/* Bouton agrandir (mobile multi) */}
                    {isMobile&&ntables>1&&!expanded&&(
                      <button className="mt-expand-btn" onClick={()=>{vibrate(VIB.tap);setExpandedT(t);}} title="Agrandir cette table">⛶</button>
                    )}
                    <SingleTable spot={spot} unit={unit} numTables={expanded?2:ntables} showSol={showSol} sidebarCollapsed={collapsed} trainerMode={trainerMode} trainMode={trainMode} platform={platform} onAnswer={(ok,ua)=>handleAns(t,ok,ua)} onTableSettled={()=>handleTableSettled(t)} onNext={handleNext} isLast={idx+ntables>=(smode===999?queue.length:smode)} nextBusy={nextTransitioning} nextError={nextError} onGoSolver={onGoSolverFn} onFocusToggle={ntables===1?toggleSidebar:undefined} focusMode={collapsed} chipTheme={chipTheme} chipColor={chipColor} chipSizeMode={chipSizeMode} onToggleSol={()=>setShowSol(s=>!s)} timerSec={f.timer} field={f.field} coachLevel={f.coachLevel} spotIndex={idx} spotTotal={smode===999?queue.length:smode} isActive={ntables===1||activeTable===t} panelTarget={panelEl}/>
                    {/* Pied de table agrandie : réduire / batch suivant */}
                    {expanded&&(()=>{
                      const isLastBatch=idx+ntables>=Math.min(smode===999?queue.length:smode,queue.length);
                      return(
                        <div style={{position:"sticky",bottom:0,display:"flex",gap:8,padding:"10px 6px calc(10px + env(safe-area-inset-bottom,0px))",background:"linear-gradient(180deg,rgba(3,7,18,0),#030712 35%)",zIndex:5,marginTop:8}}>
                          <button className="btn btns" style={{fontSize:11}} onClick={()=>setExpandedT(null)}>⛶ Réduire</button>
                          {allSettled
                            ?<button className="btn btng" style={{flex:1,fontSize:12}} disabled={nextTransitioning} onClick={handleNext}>{nextTransitioning?"Chargement...":nextError?"Reessayer":isLastBatch?"Resultats":"Tables suivantes"}</button>
                            :<span style={{flex:1,alignSelf:"center",textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.text3}}>{Object.keys(tableAns).length}/{ntables} répondues</span>}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {/* Refonte V2 : dock de commandes 1T retiré — fonctions reprises par
                 la barre (Solution/Coach/Arrêter), la table (Focus ⊠) et le
                 panneau V2 (progression + Main suivante). */}
            </div>
          </div>{/* ── fin gridRef (playground) ── */}
          {/* ══ COLONNE DROITE PARTAGÉE — reçoit le VRAI panneau 1T de la table active (portal) ══ */}
          {!isMobile&&<div className="pf-mt-sharedcol">{renderMultiPanel()}</div>}
          </div>
        )}
        {/* Reset zoom (pincement) */}
        {isMobile&&zoomed&&ntables>1&&started&&!done&&(
          <button className="mt-zoom-reset" onClick={resetZoom}>↺ Zoom 100%</button>
        )}
        {/* ── Barre historique dernières réponses ── */}
        {started&&!done&&results.length>0&&(
          <div style={{flexShrink:0,padding:"5px 14px",background:"linear-gradient(90deg,#030D2A,#040B1F)",borderTop:"1px solid #152D6E",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:T.text4,marginRight:2,flexShrink:0}}>Historique :</span>
            <div style={{display:"flex",gap:3,alignItems:"center"}}>
              {results.slice(-8).map((r,i)=>{
                const approxFreq=r.spot?.freq?.[r.spot?.acts?.[r.ua]?.id]||0;
                const isApprox=!r.correct&&approxFreq>=20;
                const bg=r.correct?"rgba(16,216,122,.15)":isApprox?"rgba(255,194,71,.12)":"rgba(255,69,96,.1)";
                const brd=r.correct?T.green:isApprox?T.amber:T.red;
                const ico=r.correct?"✓":isApprox?"~":"✗";
                return(
                  <div key={i} title={r.spot?.desc||r.spot?.cat||""} style={{
                    width:22,height:22,borderRadius:"50%",flexShrink:0,
                    background:bg,border:`1.5px solid ${brd}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:10,color:brd,fontWeight:700,cursor:"default",
                    boxShadow:`0 0 6px ${brd}40`,
                  }}>{ico}</div>
                );
              })}
            </div>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:T.text3}}>
                <span style={{color:T.green}}>{sc}✓</span>
                <span style={{color:T.text4,margin:"0 3px"}}>·</span>
                <span style={{color:T.red}}>{st-sc-approx}✗</span>
                <span style={{color:T.text4,margin:"0 3px"}}>·</span>
                <span style={{color:T.cyan}}>{pct}%</span>
              </span>
            </div>
          </div>
        )}
        {/* ── LIGNE INFOS DU SPOT (mobile 1T) — SOUS l'historique (§6/7), pleine largeur ── */}
        {isMobile&&ntables===1&&started&&!done&&activeSpot&&(()=>{
          const s=activeSpot;
          const potN=parseFloat(s.pot)||0, stackN=parseFloat(s.stack)||100;
          const sprV=potN>0?(stackN/potN).toFixed(1):"—";
          const toCall=Number(s.toCall)||0;
          const oddsV=toCall>0?Math.round(toCall/(toCall+potN)*100)+"%":null;
          const diffLbl=s.diff===1?"Débutant":s.diff===2?"Intermédiaire":s.diff===3?"Avancé":s.diff===4?"Expert":"Intermédiaire";
          const diffC=s.diff===1?"#00E889":s.diff===2?"#FFC247":s.diff===3?"#FF7A45":s.diff===4?"#B85CFF":"#FFC247";
          return(
            <div className="pf-spot-info-bottom">
              <span className="hud-chip">📍 {s.hpos}</span>
              <span className="hud-chip">📊 {s.stack}</span>
              <span className="hud-chip">SPR {sprV}</span>
              {oddsV&&<span className="hud-chip">Odds {oddsV}</span>}
              <span className="hud-chip" style={{color:"#9B5CFF",borderColor:"rgba(155,92,255,.28)",background:"rgba(155,92,255,.08)"}}>🃏 {s.fmt}</span>
              <span className="hud-chip" style={{color:trainerMode==="gto"?"#34D8FF":"#FF8A3D",borderColor:trainerMode==="gto"?"rgba(52,216,255,.28)":"rgba(255,138,61,.28)",background:trainerMode==="gto"?"rgba(52,216,255,.08)":"rgba(255,138,61,.08)"}}>{trainerMode==="gto"?"GTO":PLATFORM_PROFILES[platform]?.flag||"🦈"}</span>
              <span className="hud-chip" style={{gap:5}}><span style={{width:6,height:6,borderRadius:"50%",background:diffC,flexShrink:0,display:"inline-block"}}/>{diffLbl}</span>
            </div>
          );
        })()}
        {started&&!done&&ntables>1&&allSettled&&(()=>{const isLastBatch=idx+ntables>=Math.min(smode===999?queue.length:smode,queue.length);return(
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <button className="btn btng" disabled={nextTransitioning} onClick={handleNext}>{nextTransitioning?"Chargement...":nextError?"Reessayer":isLastBatch?"Resultats":"Tables suivantes"}</button>
          </div>
        );})()}
      </div>
      </div>{/* end flex:1 row wrapper */}

      {/* ══ ZONE 4 MOBILE : BOTTOM SHEET — Vilain · Stats · Notes · Historique ══ */}
      {isMobile&&sheetTab&&started&&!done&&(
        <>
          <div className="pf-sheet-backdrop" onClick={()=>setSheetTab(null)}/>
          <div className="pf-sheet" ref={sheetRef}>
            {/* Poignée — swipe vers le bas pour fermer */}
            <div className="pf-sheet-handle" onTouchStart={shStart} onTouchMove={shMove} onTouchEnd={shEnd}>
              <div className="pf-sheet-grip"/>
            </div>
            <div className="pf-sheet-tabs">
              {[["villain","🎭 Vilain"],["stats","📊 Stats"],["notes","📝 Notes"],["history","🕘 Histo."]].map(([id,l])=>(
                <button key={id} className={`pf-sheet-tab${sheetTab===id?" on":""}`} onClick={()=>{vibrate(VIB.tap);setSheetTab(id);}}>{l}</button>
              ))}
            </div>
            <div className="pf-sheet-body">

              {/* ── PROFIL VILAIN IA PREMIUM ── */}
              {sheetTab==="villain"&&(()=>{
                const vp=curSpot?VILLAIN_PROFILES[curSpot.vtype]:null;
                if(!vp)return <div style={{textAlign:"center",color:T.text3,fontFamily:T.stats,fontSize:11,padding:30}}>Aucun vilain sur ce spot</div>;
                const aggLbl=vp.agg>=4?"très agressif":vp.agg>=2.5?"agressif":vp.agg>=1.5?"équilibré":"passif";
                return(
                  <div className="pf-vil-card" style={{borderColor:vp.col+"44"}}>
                    <div className="pf-vil-head">
                      <div className="pf-vil-ava" style={{background:`${vp.col}16`,borderColor:vp.col+"66",boxShadow:`0 0 18px ${vp.col}33`}}>🤖</div>
                      <div style={{minWidth:0}}>
                        <div className="pf-vil-type" style={{color:vp.col}}>{curSpot.vtype} <span style={{fontSize:11,fontWeight:700,color:"#9FB0CC"}}>· {aggLbl}</span></div>
                        <div className="pf-vil-sub">{curSpot.vpos} · {vp.desc}</div>
                      </div>
                    </div>
                    <div className="pf-vil-stats">
                      {[["VPIP",vp.vpip+"%","#34D8FF"],["PFR",vp.pfr+"%","#10D87A"],["AGG",vp.agg,"#FF8A3D"],["3-BET",vp["3bet"]+"%","#9B5CFF"],["FOLD CBET",vp.foldToCbet+"%","#FFC247"],["BLUFF",vp.bluffFreq+"%","#FF4560"]].map(([l,v,c])=>(
                        <div key={l} className="pf-vil-stat">
                          <span className="v" style={{color:c}}>{v}</span>
                          <span className="l">{l}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pf-vil-block" style={{background:"rgba(255,69,96,.06)",borderColor:"rgba(255,69,96,.25)"}}>
                      <div className="t" style={{color:"#FF4560"}}>🔴 LEAK PRINCIPAL</div>
                      <div className="b">{vp.leaks?.[0]||"Aucun leak majeur identifié"}</div>
                      {vp.leaks?.length>1&&<div className="b" style={{fontSize:9.5,color:"#8FA2C4",marginTop:4}}>{vp.leaks.slice(1).map(l=>`• ${l}`).join("  ")}</div>}
                    </div>
                    <div className="pf-vil-block" style={{background:"rgba(16,216,122,.06)",borderColor:"rgba(16,216,122,.25)"}}>
                      <div className="t" style={{color:"#10D87A"}}>🎯 ADAPTATION RECOMMANDÉE</div>
                      <div className="b">{vp.exploitTip}</div>
                    </div>
                    {vp.gtoDeviation&&(
                      <div className="pf-vil-block" style={{background:"rgba(52,216,255,.05)",borderColor:"rgba(52,216,255,.2)",marginBottom:0}}>
                        <div className="t" style={{color:"#34D8FF"}}>📐 DÉVIATION VS GTO</div>
                        <div className="b" style={{fontSize:10.5}}>{vp.gtoDeviation}</div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── STATS TEMPS RÉEL + HEATMAP D'ERREURS ── */}
              {sheetTab==="stats"&&(()=>{
                const heat=p=>p>=75?["rgba(16,216,122,.08)","rgba(16,216,122,.35)","#10D87A"]:p>=50?["rgba(255,194,71,.08)","rgba(255,194,71,.35)","#FFC247"]:["rgba(255,69,96,.08)","rgba(255,69,96,.4)","#FF4560"];
                const catMap={};
                results.forEach(r=>{const c=r.spot?.cat||"Autre";if(!catMap[c])catMap[c]={ok:0,tot:0};catMap[c].tot++;if(r.correct)catMap[c].ok++;});
                const cats=Object.entries(catMap).map(([c,v])=>({c,pct:Math.round(v.ok/v.tot*100),n:v.tot})).sort((a,b)=>a.pct-b.pct);
                const posMap={};
                results.forEach(r=>{const p=r.spot?.hpos;if(!p)return;if(!posMap[p])posMap[p]={ok:0,tot:0};posMap[p].tot++;if(r.correct)posMap[p].ok++;});
                const poss=Object.entries(posMap).map(([p,v])=>({c:p,pct:Math.round(v.ok/v.tot*100),n:v.tot}));
                const evDelta=results.reduce((s,r)=>{
                  const best=r.spot.ev[r.spot.acts[r.spot.ok]?.id]||0;
                  const chosen=r.spot.ev[r.spot.acts[r.ua]?.id]||0;
                  return s+(chosen-best);
                },0);
                return(
                  <>
                    <div className="statg" style={{marginBottom:12}}>
                      <div className="statbox"><div className="statv" style={{color:T.green}}>{sc}</div><div className="statl">Corrects</div></div>
                      <div className="statbox"><div className="statv" style={{color:T.accent}}>{approx}</div><div className="statl">Approx.</div></div>
                      <div className="statbox"><div className="statv" style={{color:T.red}}>{st-sc-approx}</div><div className="statl">Erreurs</div></div>
                      <div className="statbox"><div className="statv" style={{color:T.cyan}}>{pct}%</div><div className="statl">Précision</div></div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",borderRadius:11,marginBottom:14,background:evDelta>=0?"rgba(16,216,122,.07)":"rgba(255,69,96,.06)",border:`1px solid ${evDelta>=0?"rgba(16,216,122,.25)":"rgba(255,69,96,.22)"}`}}>
                      <span style={{fontSize:16}}>{evDelta>=0?"💰":"📉"}</span>
                      <span style={{fontFamily:T.stats,fontSize:9,color:T.text4,fontWeight:700,letterSpacing:".06em"}}>EV VS OPTIMAL</span>
                      <span style={{marginLeft:"auto",fontFamily:T.mono,fontSize:14,fontWeight:800,color:evDelta>=0?T.green:T.red}}>{evDelta>=0?"+":""}{evDelta.toFixed(2)} bb</span>
                    </div>
                    <div className="pf-sol-sec-title" style={{color:"#FF8A3D",margin:"0 0 8px"}}>🔥 HEATMAP — PRÉCISION PAR CATÉGORIE</div>
                    {cats.length===0
                      ?<div style={{textAlign:"center",color:T.text4,fontFamily:T.stats,fontSize:10,padding:"14px 0 18px"}}>Réponds à quelques spots pour voir ta heatmap</div>
                      :<div className="pf-heat-grid" style={{marginBottom:14}}>
                        {cats.map(({c,pct:p,n})=>{const[bg,bd,col]=heat(p);return(
                          <div key={c} className="pf-heat-cell" style={{background:bg,borderColor:bd}}>
                            <span className="c" style={{color:col}}>{c}</span>
                            <span className="p" style={{color:col}}>{p}%</span>
                            <span className="n">{n} spot{n>1?"s":""}</span>
                          </div>
                        );})}
                      </div>}
                    {poss.length>0&&(
                      <>
                        <div className="pf-sol-sec-title" style={{color:"#9B5CFF",margin:"0 0 8px"}}>📍 PAR POSITION</div>
                        <div className="pf-heat-grid">
                          {poss.map(({c,pct:p,n})=>{const[bg,bd,col]=heat(p);return(
                            <div key={c} className="pf-heat-cell" style={{background:bg,borderColor:bd}}>
                              <span className="c" style={{color:col}}>{c}</span>
                              <span className="p" style={{color:col}}>{p}%</span>
                              <span className="n">{n} spot{n>1?"s":""}</span>
                            </div>
                          );})}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}

              {/* ── NOTES PAR SPOT ── */}
              {sheetTab==="notes"&&(
                <>
                  <div style={{fontFamily:T.stats,fontSize:10,color:T.text3,marginBottom:8,lineHeight:1.5}}>
                    📝 Note personnelle pour ce spot — sauvegardée automatiquement et réaffichée quand tu retombes dessus.
                  </div>
                  {curSpot&&(
                    <div style={{padding:"7px 10px",borderRadius:9,background:"#071B44",border:"1px solid #152D6E",marginBottom:9,fontFamily:T.stats,fontSize:10,color:T.text2}}>
                      {curSpot.desc}
                    </div>
                  )}
                  <textarea
                    key={curSpot?.id||"none"}
                    className="pf-notes-ta"
                    placeholder="Ex : j'oublie toujours de 3-bet ici avec les suited connectors…"
                    defaultValue={curSpot?loadNote(curSpot.id):""}
                    onChange={e=>curSpot&&saveNote(curSpot.id,e.target.value)}
                  />
                  <div style={{fontFamily:T.stats,fontSize:8.5,color:T.text4,marginTop:6}}>💾 Sauvegarde automatique à la frappe</div>
                </>
              )}

              {/* ── HISTORIQUE DE LA SESSION ── */}
              {sheetTab==="history"&&(
                results.length===0
                  ?<div style={{textAlign:"center",color:T.text3,fontFamily:T.stats,fontSize:11,padding:30}}>Aucune réponse pour l'instant</div>
                  :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[...results].reverse().map((r,i)=>{
                      const approxFreq=r.spot?.freq?.[r.spot?.acts?.[r.ua]?.id]||0;
                      const isApprox=!r.correct&&approxFreq>=20;
                      const col=r.correct?T.green:isApprox?T.amber:T.red;
                      const ico=r.correct?"✓":isApprox?"~":"✗";
                      const bestEv=r.spot.ev[r.spot.acts[r.spot.ok]?.id]||0;
                      const myEv=r.spot.ev[r.spot.acts[r.ua]?.id]||0;
                      const d=myEv-bestEv;
                      return(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 11px",borderRadius:11,background:`${col}08`,border:`1px solid ${col}26`}}>
                          <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:col,background:`${col}14`,border:`1.5px solid ${col}55`}}>{ico}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:T.stats,fontSize:10.5,fontWeight:700,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                              <span style={{color:T.text4,fontFamily:T.mono,fontSize:9}}>#{(r.qi??0)+1}</span> {r.spot.desc}
                            </div>
                            <div style={{fontFamily:T.stats,fontSize:9,color:T.text3}}>
                              Joué : <strong style={{color:col}}>{r.spot.acts[r.ua]?.l}</strong>
                              {!r.correct&&<> · GTO : <strong style={{color:T.green}}>{r.spot.acts[r.spot.ok]?.l}</strong></>}
                              {r.spot.diff>=3&&<span style={{color:T.gold}}> ★</span>}
                            </div>
                          </div>
                          <span style={{fontFamily:T.mono,fontSize:9.5,fontWeight:700,color:d>=0?T.green:T.red,flexShrink:0}}>{d>=0?"+":""}{d.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Sortie du mode focus ── */}
      {isMobile&&mobFocus&&started&&!done&&(
        <button className="pf-focus-exit" onClick={()=>{vibrate(VIB.tap);setMobFocus(false);}} title="Quitter le mode focus">⛶</button>
      )}
    </div>
  );
}
