/* ═══════════════════════════════════════════════════════════════
   PokerForge — Géométrie de table PARTAGÉE (single-table).

   But (§9) : le Replayer et le Trainer partagent le même système visuel.
   Ce module réutilise la géométrie du feutre / board / pot du Trainer
   (trainerVisualConfig.js, source unique déjà validée) et fournit un
   anneau de sièges elliptique « hero en bas » (porté de computeHeroCentricSeats,
   branche ellipse) — utilisable par n'importe quelle vue mono-table.

   Module PUR (aucune dépendance React) → réutilisable et testable.
   Toutes les coordonnées sont en % de la zone de table (repère .t1-table-area).
═══════════════════════════════════════════════════════════════ */
import {
  TRAINER_VISUAL_CONFIG,
  trainerTableGeometry,
  trainerBoardPosition,
  trainerPotPosition,
} from "../../trainerVisualConfig.js";

export const BOARD_SAFE_ZONE = TRAINER_VISUAL_CONFIG.boardSafeZone;
const BOARD_SAFE_PADDING = 3.5;

/* Géométrie du feutre ovale (mono-table). */
export function feltGeometry(){ return trainerTableGeometry(1); }
/* Centre du board. */
export function boardPoint(){ return trainerBoardPosition(1); }
/* Position du pot (au-dessus du board si présent). */
export function potPoint(hasBoard=false){ return trainerPotPosition(1, hasBoard); }

function clamp(v,min=3,max=97){ return Math.max(min, Math.min(max, v)); }

/* Empêche un point (jetons de mise) de recouvrir le board central. */
export function clampOutsideBoard(pt, seat, safeZone=BOARD_SAFE_ZONE, padding=BOARD_SAFE_PADDING){
  const zone = {
    xMin:safeZone.xMin-padding, xMax:safeZone.xMax+padding,
    yMin:safeZone.yMin-padding, yMax:safeZone.yMax+padding,
  };
  const inside = pt.x>=zone.xMin && pt.x<=zone.xMax && pt.y>=zone.yMin && pt.y<=zone.yMax;
  if(!inside) return { x:clamp(pt.x), y:clamp(pt.y) };
  const dx = seat.x-50, dy = seat.y-50;
  if(Math.abs(dx)>Math.abs(dy)) return { x:clamp(dx<0?zone.xMin:zone.xMax), y:clamp(pt.y) };
  return { x:clamp(pt.x), y:clamp(dy<0?zone.yMin:zone.yMax) };
}

/**
 * Anneau de sièges elliptique, hero en bas-centre (porté de la branche
 * `ellipse` de computeHeroCentricSeats du Trainer).
 * @param positions liste de labels (ordre siège naturel), ex ["UTG","HJ","CO","BTN","SB","BB"]
 * @param heroPos label du héros
 * @returns { [pos]: {x,y} }
 */
export function heroCentricSeatRing(positions, heroPos, opts={}){
  const n = positions.length;
  const seats = {};
  if(!n) return seats;
  const g = opts.geometry || feltGeometry() || { top:6, left:4, right:4, bottom:10 };
  const cx = (g.left + (100-g.right))/2, cy = (g.top + (100-g.bottom))/2;
  const rx = (100-g.left-g.right)/2, ry = (100-g.top-g.bottom)/2;
  const f  = opts.ringFactor ?? 0.9;
  const fy = opts.ringFactorY ?? f;
  const heroDrop = opts.heroDrop ?? 0.64;

  const heroIdx = Math.max(0, positions.indexOf(heroPos));
  const ordered = [];
  for(let i=0;i<n;i++) ordered.push(positions[(heroIdx+i)%n]);

  for(let i=0;i<n;i++){
    const ang = (90 + i*(360/n)) * Math.PI/180;
    seats[ordered[i]] = {
      x:+(cx + f*rx*Math.cos(ang)).toFixed(2),
      y:+(cy + fy*ry*Math.sin(ang)).toFixed(2),
    };
  }
  // Hero : même colonne (bas-centre) mais légèrement remonté (son bloc est haut).
  seats[ordered[0]] = { x:+cx.toFixed(2), y:+(cy + heroDrop*ry).toFixed(2) };
  return seats;
}

/* Ancre de mise d'un siège : point poussé vers le centre, hors du board. */
export function seatActionPoint(seatCoord, { hasBoard=false, push=0.42 }={}){
  if(!seatCoord) return { x:50, y:50 };
  const pt = {
    x: seatCoord.x + (50-seatCoord.x)*push,
    y: seatCoord.y + (50-seatCoord.y)*push,
  };
  return hasBoard ? clampOutsideBoard(pt, seatCoord) : { x:clamp(pt.x), y:clamp(pt.y) };
}

/* Jeton dealer : décalé vers l'intérieur-gauche du siège BTN. */
export function dealerPoint(btnCoord){
  if(!btnCoord) return { x:50, y:50 };
  return { x:Math.max(4, btnCoord.x-7), y:Math.min(90, btnCoord.y+9) };
}

/* Style du feutre ovale premium (reproduit trainerFeltStyle, état statique). */
export function feltStyle(geometry){
  const g = geometry || feltGeometry();
  const pct = v => `${Number(v||0)}%`;
  return {
    position:"absolute",
    top:pct(g.top), left:pct(g.left), right:pct(g.right), bottom:pct(g.bottom),
    background:"radial-gradient(ellipse at 50% 18%,rgba(26,62,115,.95) 0%,rgba(13,38,78,.99) 38%,rgba(6,20,46,.998) 70%,#030b1e 100%)",
    border:"2px solid rgba(255,208,90,.72)",
    borderRadius:"50%",
    boxShadow:"inset 0 0 180px rgba(0,0,0,.58),inset 0 28px 72px rgba(255,255,255,.045),inset 0 -42px 88px rgba(0,0,0,.5),0 0 0 4px rgba(5,15,12,.96),0 0 0 6px rgba(31,139,255,.30),0 0 0 10px rgba(255,194,71,.08),0 28px 90px rgba(0,0,0,.84),0 0 64px rgba(0,140,255,.16)",
    overflow:"hidden",
    filter:"drop-shadow(0 0 40px rgba(0,191,255,.14)) drop-shadow(0 22px 34px rgba(0,0,0,.72))",
  };
}
export function feltRailStyle(kind="outer", geometry){
  const g = geometry || feltGeometry();
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
