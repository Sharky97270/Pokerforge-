// PokerForge — onglet Ranges GTO 13x13 (extrait de App.jsx, Phase 3.3)
import React, { useState, useEffect } from "react";
import { T } from "../theme.js";

/* ═══════════════════════════════════════════════════════════════
   RANGES POKERFORGE — Grilles 13×13 programmatiques
   6 positions · MTT & Cash · 14 profondeurs de stack
════════════════════════════════════════════════════════════════ */

// HR = Hand Ranks array (named uniquely to avoid collision)
const HR=['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const HRI=Object.fromEntries(HR.map((r,i)=>[r,i]));

function parseRSpec(spec){
  const cells=[];
  if(!spec) return cells;
  spec.split(',').forEach(part=>{
    part=part.trim(); if(!part) return;
    let freq=1;
    if(part.includes(':')){const[h,f]=part.split(':');part=h;freq=parseFloat(f);}
    if(part.includes('-')){
      const[from,to]=part.split('-');
      if(from.length===2&&!from.endsWith('s')&&!from.endsWith('o')){
        const hi=HRI[from[0]],lo=HRI[to[0]];
        for(let i=hi;i<=lo;i++) cells.push([i,i,freq]); return;
      }
      if(from.endsWith('s')&&to.endsWith('s')){
        const r1=HRI[from[0]],c1=HRI[from[1]],r2=HRI[to[0]],c2=HRI[to[1]];
        if(r1===r2){for(let c=c1;c<=c2;c++) cells.push([r1,c,freq]);} return;
      }
      if(from.endsWith('o')&&to.endsWith('o')){
        const r1=HRI[from[0]],c1=HRI[from[1]],r2=HRI[to[0]],c2=HRI[to[1]];
        if(r1===r2){for(let c=c1;c<=c2;c++) cells.push([c,r1,freq]);} return;
      }
    }
    if(part.length===2&&!part.endsWith('s')&&!part.endsWith('o')){
      const r=HRI[part[0]]; if(r!==undefined) cells.push([r,r,freq]);
    } else if(part.endsWith('s')){
      const r=HRI[part[0]],c=HRI[part[1]]; if(r!==undefined&&c!==undefined) cells.push([r,c,freq]);
    } else if(part.endsWith('o')){
      const r=HRI[part[0]],c=HRI[part[1]]; if(r!==undefined&&c!==undefined) cells.push([c,r,freq]);
    }
  });
  return cells;
}
function buildHGrid(specStr){
  const grid=new Array(169).fill(0);
  parseRSpec(specStr).forEach(([r,c,f])=>{if(r>=0&&r<13&&c>=0&&c<13) grid[r*13+c]=f;});
  return grid;
}
function calcHPct(grid){
  let t=0;
  grid.forEach((f,idx)=>{
    if(f<=0) return;
    const r=Math.floor(idx/13),c=idx%13;
    t+=f*(r===c?6:r<c?4:12);
  });
  return (t/1326*100).toFixed(1);
}
function hCellLbl(r,c){
  if(r===c) return HR[r]+HR[r];
  if(r<c) return HR[r]+HR[c]+'s';
  return HR[c]+HR[r]+'o';
}
function hKeyToIndex(key){
  const k=String(key||"").trim();
  const r0=HRI[k[0]],r1=HRI[k[1]];
  if(r0===undefined||r1===undefined) return -1;
  if(k.length===2) return r0*13+r0;
  if(k.endsWith("s")) return r0*13+r1;
  if(k.endsWith("o")) return r1*13+r0;
  return -1;
}
function hKeyType(key){
  const k=String(key||"");
  if(k.length===2) return "Paire";
  if(k.endsWith("s")) return "Suited";
  if(k.endsWith("o")) return "Offsuit";
  return "Main";
}
function hGridCellInfo(grid,key,actionLabel="Range"){
  const idx=hKeyToIndex(key);
  if(idx<0) return null;
  const freq=grid?.[idx]||0;
  const row=Math.floor(idx/13),col=idx%13;
  const combos=row===col?6:row<col?4:12;
  return {key,type:hKeyType(key),freq,combos,actionLabel};
}

const RANGE_DATA={
  open:{
    mtt:{
      BTN:{
        75:"AA-22,AKs-A2s,KQs-K2s,QJs-Q5s,JTs-J5s,T9s-T5s,98s-93s,87s-83s,76s-73s,65s-62s,54s-52s,43s-42s,32s,AKo-A2o,KQo-K6o,QJo-Q8o,JTo,T9o,98o,87o",
        50:"AA-22,AKs-A2s,KQs-K3s,QJs-Q6s,JTs-J6s,T9s-T6s,98s-94s,87s-85s,76s-74s,65s-63s,54s-52s,43s,AKo-A2o,KQo-K7o,QJo-Q9o,JTo,T9o",
        30:"AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T6s,98s-96s,87s-85s,76s-75s,65s-63s,54s-52s,43s,AKo-A2o,KQo-K7o,QJo-Q9o,JTo,T9o",
        20:"AA-22,AKs-A2s,KQs-K5s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-75s,65s-64s,54s,AKo-A3o,KQo-K8o,QJo-QTo,JTo,T9o",
        19:"AA-22,AKs-A2s,KQs-K5s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-75s,65s-64s,54s,AKo-A3o,KQo-K8o,QJo-QTo,JTo,T9o",
        18:"AA-22,AKs-A2s,KQs-K5s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-75s,65s-64s,54s,AKo-A4o,KQo-K9o,QJo-QTo,JTo",
        17:"AA-22,AKs-A2s,KQs-K6s,QJs-Q7s,JTs-J8s,T9s-T8s,98s-97s,87s,76s,65s,54s,AKo-A4o,KQo-K9o,QJo,JTo",
        16:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s-T8s,98s-97s,87s,76s,65s,54s,AKo-A4o,KQo-K9o,QJo",
        15:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s,98s-97s,87s,76s,65s,54s,AKo-A5o,KQo-K9o,QJo",
        14:"AA-22,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s,98s,87s,76s,65s,54s,AKo-A5o,KQo-KTo,QJo",
        13:"AA-22,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s,98s,87s,76s,65s,AKo-A5o,KQo-KTo",
        12:"AA-22,AKs-A2s,KQs-K7s,QJs-Q9s,JTs,T9s,98s,87s,76s,65s,AKo-A6o,KQo-KTo",
        11:"AA-22,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,76s,AKo-A6o,KQo-KJo",
        10:"AA-22,AKs-A2s,KQs-K8s,QJs-Q9s,JTs-J9s,T9s,98s,87s,76s,AKo-A6o,KQo-KJo",
      },
      CO:{
        75:"AA-22,AKs-A2s,KQs-K3s,QJs-Q6s,JTs-J6s,T9s-T6s,98s-95s,87s-85s,76s-74s,65s-63s,54s-52s,43s,AKo-A2o,KQo-K7o,QJo-Q9o,JTo,T9o",
        50:"AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T6s,98s-96s,87s-85s,76s-74s,65s-63s,54s-52s,43s,AKo-A2o,KQo-K8o,QJo-Q9o,JTo",
        30:"AA-22,AKs-A2s,KQs-K5s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s,AKo-A3o,KQo-K8o,QJo-QTo,JTo",
        20:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s,54s,AKo-A5o,KQo-K9o,QJo-QTo",
        19:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s,54s,AKo-A5o,KQo-K9o,QJo-QTo",
        18:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s-T7s,98s-96s,87s-85s,76s,65s,54s,AKo-A5o,KQo-K9o,QJo",
        17:"AA-22,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s-T8s,98s-97s,87s,76s,65s,AKo-A5o,KQo-KTo,QJo",
        16:"AA-22,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s-T8s,98s-97s,87s,76s,65s,AKo-A5o,KQo-KTo,QJo",
        15:"AA-22,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s,98s-97s,87s,76s,65s,AKo-A5o,KQo-KTo",
        14:"AA-22,AKs-A2s,KQs-K7s,QJs-Q9s,JTs,T9s,98s,87s,76s,AKo-A6o,KQo-KTo",
        13:"AA-22,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,76s,AKo-A6o,KQo-KJo",
        12:"AA-33,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,AKo-A6o,KQo-KJo",
        11:"AA-33,AKs-A2s,KQs-K9s,QJs-Q9s,JTs,T9s,98s,AKo-A7o,KQo-KJo",
        10:"AA-33,AKs-A2s,KQs-K9s,QJs,JTs,T9s,98s,AKo-A7o,KQo",
      },
      HJ:{
        75:"AA-44,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J8s,T9s-T7s,98s-97s,87s-86s,76s,65s,54s,AKo-A3o,KQo-K8o,QJo",
        50:"AA-44,AKs-A2s,KQs-K5s,QJs-Q7s,JTs-J8s,T9s-T7s,98s-97s,87s,76s,65s,54s,AKo-A4o,KQo-K8o,QJo",
        30:"AA-44,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J8s,T9s-T7s,98s-97s,87s,76s,65s,54s,AKo-A4o,KQo-K9o,QJo",
        20:"AA-55,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s-T8s,98s,87s,76s,65s,54s,AKo-A6o,KQo-KTo,QJo",
        19:"AA-55,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s-T8s,98s,87s,76s,65s,54s,AKo-A6o,KQo-KTo,QJo",
        18:"AA-55,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s,98s,87s,76s,65s,AKo-A6o,KQo-KTo",
        17:"AA-55,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,76s,AKo-A7o,KQo-KTo",
        16:"AA-55,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,76s,AKo-A7o,KQo-KJo",
        15:"AA-55,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,AKo-A7o,KQo-KJo",
        14:"AA-66,AKs-A2s,KQs-K9s,QJs-Q9s,JTs,T9s,98s,AKo-A7o,KQo-KJo",
        13:"AA-66,AKs-A2s,KQs-K9s,QJs,JTs,T9s,98s,AKo-A8o,KQo-KJo",
        12:"AA-66,AKs-A2s,KQs-K9s,QJs,JTs,T9s,AKo-A8o,KQo",
        11:"AA-77,AKs-A2s,KQs-KTs,QJs,JTs,T9s,AKo-A8o,KQo",
        10:"AA-77,AKs-A2s,KQs-KTs,QJs,JTs,AKo-A9o,KQo",
      },
      LJ:{
        75:"AA-55,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J8s,T9s-T7s,98s,87s,76s,65s,54s,AKo-A5o,KQo-KTo,QJo",
        50:"AA-55,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J8s,T9s-T7s,98s,87s,76s,65s,AKo-A5o,KQo-KTo,QJo",
        30:"AA-55,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s,98s,87s,76s,65s,AKo-A5o,KQo-KTo,QJo",
        20:"AA-66,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,76s,65s,54s,AKo-A7o,KQo-KJo",
        19:"AA-66,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,76s,65s,AKo-A7o,KQo-KJo",
        18:"AA-66,AKs-A2s,KQs-K8s,QJs-Q9s,JTs,T9s,98s,87s,76s,AKo-A7o,KQo-KJo",
        17:"AA-66,AKs-A2s,KQs-K9s,QJs-Q9s,JTs,T9s,98s,87s,AKo-A7o,KQo-KJo",
        16:"AA-66,AKs-A2s,KQs-K9s,QJs,JTs,T9s,98s,87s,AKo-A7o,KQo-KJo",
        15:"AA-77,AKs-A2s,KQs-K9s,QJs,JTs,T9s,98s,AKo-A8o,KQo-KJo",
        14:"AA-77,AKs-A2s,KQs-KTs,QJs,JTs,T9s,98s,AKo-A8o,KQo",
        13:"AA-77,AKs-A2s,KQs-KTs,QJs,JTs,T9s,AKo-A8o,KQo",
        12:"AA-88,AKs-A2s,KQs-KTs,QJs,JTs,AKo-A8o,KQo",
        11:"AA-88,AKs-A2s,KQs-KJs,QJs,JTs,AKo-A9o,KQo",
        10:"AA-88,AKs-A2s,KQs-KJs,QJs,AKo-A9o,KQo",
      },
      SB:{
        75:"AA-22,AKs-A2s,KQs-K2s,QJs-Q3s,JTs-J5s,T9s-T5s,98s-93s,87s-83s,76s-72s,65s-62s,54s-52s,43s-42s,32s,AKo-A2o,KQo-K4o,QJo-Q8o,JTo-J9o,T9o-T8o,98o-97o,87o,76o,65o",
        50:"AA-22,AKs-A2s,KQs-K2s,QJs-Q4s,JTs-J5s,T9s-T5s,98s-94s,87s-84s,76s-73s,65s-62s,54s-52s,43s,AKo-A2o,KQo-K5o,QJo-Q9o,JTo-J9o,T9o,98o,87o",
        30:"AA-22,AKs-A2s,KQs-K3s,QJs-Q6s,JTs-J6s,T9s-T6s,98s-95s,87s-85s,76s-74s,65s-63s,54s-52s,43s,AKo-A2o,KQo-K6o,QJo-Q9o,JTo,T9o,98o",
        20:"AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s,AKo-A2o,KQo-K7o,QJo-Q9o,JTo,T9o",
        19:"AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s,AKo-A2o,KQo-K7o,QJo-Q9o,JTo,T9o",
        18:"AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s,AKo-A3o,KQo-K7o,QJo-Q9o,JTo",
        17:"AA-22,AKs-A2s,KQs-K5s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s,AKo-A3o,KQo-K8o,QJo-Q9o,JTo",
        16:"AA-22,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s,54s,AKo-A3o,KQo-K8o,QJo-QTo",
        15:"AA-22,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J8s,T9s-T7s,98s-96s,87s,76s,65s,54s,AKo-A4o,KQo-K9o,QJo",
        14:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s-T8s,98s-96s,87s,76s,65s,AKo-A4o,KQo-K9o,QJo",
        13:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s,98s-97s,87s,76s,65s,AKo-A5o,KQo-K9o,QJo",
        12:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s,98s-97s,87s,76s,AKo-A5o,KQo-KTo,QJo",
        11:"AA-22,AKs-A2s,KQs-K7s,QJs-Q9s,JTs,T9s,98s,87s,76s,AKo-A5o,KQo-KTo",
        10:"AA-22,AKs-A2s,KQs-K7s,QJs-Q9s,JTs,T9s,98s,87s,AKo-A5o,KQo-KTo",
      },
    },
    cash:{
      BTN:{
        100:"AA-22,AKs-A2s,KQs-K2s,QJs-Q2s,JTs-J4s,T9s-T4s,98s-92s,87s-83s,76s-72s,65s-62s,54s-52s,43s-42s,32s,AKo-A2o,KQo-K2o,QJo-Q9o,JTo,T9o,98o,87o,76o",
        50:"AA-22,AKs-A2s,KQs-K3s,QJs-Q6s,JTs-J6s,T9s-T5s,98s-95s,87s-84s,76s-73s,65s-63s,54s-52s,43s,AKo-A2o,KQo-K6o,QJo-Q9o,JTo,T9o,98o",
        25:"AA-22,AKs-A2s,KQs-K5s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s,AKo-A3o,KQo-K8o,QJo-QTo,JTo,T9o",
      },
      CO:{
        100:"AA-22,AKs-A2s,KQs-K2s,QJs-Q4s,JTs-J6s,T9s-T6s,98s-95s,87s-84s,76s-73s,65s-62s,54s-52s,43s,AKo-A2o,KQo-K5o,QJo-Q9o,JTo,T9o",
        50:"AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T6s,98s-96s,87s-85s,76s-74s,65s-63s,54s-52s,43s,AKo-A3o,KQo-K7o,QJo-Q9o,JTo",
        25:"AA-22,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s-T7s,98s-96s,87s,76s,65s,AKo-A5o,KQo-K9o,QJo-QTo",
      },
      HJ:{
        100:"AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s-52s,43s,AKo-A3o,KQo-K7o,QJo-QTo,JTo",
        50:"AA-22,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J8s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s,54s,AKo-A4o,KQo-K8o,QJo-QTo",
        25:"AA-44,AKs-A2s,KQs-K7s,QJs-Q8s,JTs-J8s,T9s-T8s,98s-97s,87s,76s,65s,AKo-A6o,KQo-KTo,QJo",
      },
      LJ:{
        100:"AA-22,AKs-A2s,KQs-K5s,QJs-Q7s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s,AKo-A3o,KQo-K8o,QJo-QTo",
        50:"AA-44,AKs-A2s,KQs-K6s,QJs-Q8s,JTs-J8s,T9s-T7s,98s-96s,87s,76s,65s,AKo-A4o,KQo-K9o,QJo",
        25:"AA-44,AKs-A2s,KQs-K7s,QJs-Q9s,JTs,T9s,98s,87s,76s,AKo-A6o,KQo-KTo,QJo",
      },
      SB:{
        100:"AA-22,AKs-A2s,KQs-K2s,QJs-Q2s,JTs-J5s,T9s-T5s,98s-92s,87s-82s,76s-72s,65s-62s,54s-52s,43s-42s,32s,AKo-A2o,KQo-K3o,QJo-Q7o,JTo-J8o,T9o-T7o,98o-96o,87o-86o,76o,65o",
        50:"AA-22,AKs-A2s,KQs-K2s,QJs-Q4s,JTs-J6s,T9s-T5s,98s-93s,87s-84s,76s-73s,65s-62s,54s-52s,43s,AKo-A2o,KQo-K4o,QJo-Q8o,JTo-J9o,T9o,98o,87o",
        25:"AA-22,AKs-A2s,KQs-K4s,QJs-Q7s,JTs-J7s,T9s-T6s,98s-96s,87s-85s,76s-74s,65s-63s,54s,AKo-A2o,KQo-K6o,QJo-Q9o,JTo,T9o",
      },
    },
  },
};

function FilterPills({label,options,value,onChange,colors}){
  return(
    <div>
      <div style={{fontSize:7,color:T.text4,fontFamily:T.stats,marginBottom:3,letterSpacing:".08em",fontWeight:700}}>{label.toUpperCase()}</div>
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {options.map(opt=>{
          const active=value===opt;
          const col=(colors&&colors[opt])||T.gold;
          return(
            <button key={opt} onClick={()=>onChange(opt)} style={{
              padding:"3px 9px",borderRadius:6,fontSize:9,fontFamily:"'Space Grotesk',sans-serif",
              fontWeight:active?900:500,cursor:"pointer",transition:"all .12s",
              background:active?`${col}1a`:"rgba(255,255,255,.03)",
              border:active?`1.5px solid ${col}80`:"1px solid rgba(255,255,255,.08)",
              color:active?col:T.text3,letterSpacing:".04em"
            }}>{opt}</button>
          );
        })}
      </div>
    </div>
  );
}

function HandMatrix({grid,small,selectedKey,onSelect,actionLabel="Range"}){
  const cSz=small?24:34;
  const fSz=small?5.5:8;
  const pct=calcHPct(grid);
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{
        background:"rgba(4,11,31,.92)",borderRadius:10,padding:3,
        border:"1px solid rgba(34,197,230,.2)",
        boxShadow:"0 8px 32px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04)"
      }}>
        <div style={{display:"grid",gridTemplateColumns:`${Math.round(cSz*0.55)}px repeat(13,${cSz}px)`,marginBottom:1}}>
          <div/>
          {HR.map(r=>(
            <div key={r} style={{height:Math.round(cSz*0.5),display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:6.5,fontWeight:800,color:"rgba(255,255,255,.3)",fontFamily:"'Space Grotesk',sans-serif"}}>{r}</div>
          ))}
        </div>
        {HR.map((rk,row)=>(
          <div key={row} style={{display:"grid",gridTemplateColumns:`${Math.round(cSz*0.55)}px repeat(13,${cSz}px)`,gap:1,marginBottom:1}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:6.5,fontWeight:800,color:"rgba(255,255,255,.3)",fontFamily:"'Space Grotesk',sans-serif"}}>{rk}</div>
            {HR.map((_,col)=>{
              const idx=row*13+col;
              const f=grid[idx];
              const isPair=row===col,isSuited=row<col;
              const lbl=hCellLbl(row,col);
              const selected=selectedKey===lbl;
              let bg,tc,brd;
              if(f<=0){
                bg="rgba(3,10,28,.7)";tc="rgba(255,255,255,.12)";brd="rgba(255,255,255,.035)";
              }else if(isPair){
                bg=`rgba(18,58,32,${0.2+f*0.7})`;tc=f<0.4?"#1d8a4e":"#2ECC71";brd=`rgba(46,204,113,${0.18+f*0.45})`;
              }else if(isSuited){
                bg=`rgba(8,52,72,${0.2+f*0.7})`;tc=f<0.4?"#1a9ab8":"#34D8FF";brd=`rgba(52,216,255,${0.15+f*0.4})`;
              }else{
                bg=`rgba(58,36,8,${0.2+f*0.7})`;tc=f<0.4?"#a07515":"#FFC247";brd=`rgba(255,194,71,${0.15+f*0.4})`;
              }
              return(
                <div key={col} title={`${lbl} · ${f>0?`${Math.round(f*100)}% ${actionLabel}`:"Fold"}`} style={{
                  width:cSz,height:cSz,background:bg,border:`1px solid ${brd}`,
                  borderRadius:small?2:3,display:"flex",alignItems:"center",justifyContent:"center",
                  cursor:"pointer",userSelect:"none",
                  boxShadow:selected?`0 0 0 1px ${T.gold},0 0 18px rgba(255,194,71,.35)`:"none",
                  transform:selected?"translateY(-1px)":"none",
                  outline:selected?"1px solid rgba(255,255,255,.18)":"none"
                }} onMouseEnter={e=>{if(f>0)e.currentTarget.style.filter="brightness(1.35)";}}
                   onMouseLeave={e=>{e.currentTarget.style.filter="";}}
                   onClick={()=>onSelect&&onSelect(lbl)}>
                  <span style={{fontSize:fSz,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:tc,lineHeight:1}}>{lbl}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{fontSize:9.5,color:"rgba(255,255,255,.45)",fontFamily:T.stats}}>
        <span style={{color:T.gold,fontWeight:700}}>{pct}%</span>&nbsp;des mains
      </div>
    </div>
  );
}

export default function RangesTab({onGoCoach,embedded=false}){
  const ACT_C={"Open":"#2ECC71","Call":"#34D8FF","3Bet":"#9B5CFF","4Bet":"#FF4444","Defense":"#FFC247","Jam":"#FF8A3D"};
  const POS_C={"BTN":"#FFC247","CO":"#34D8FF","HJ":"#2ECC71","LJ":"#9B5CFF","SB":"#FF8A3D","BB":"#FF4444"};
  const FMT_C={"MTT":"#FFC247","Cash":"#2ECC71","KO/PKO":"#9B5CFF"};
  const MTT_D=[10,11,12,13,14,15,16,17,18,19,20,30,50,75];
  const CSH_D=[25,50,100];
  const[fmt,setFmt]=useState("MTT");
  const[pos,setPos]=useState("BTN");
  const[depth,setDepth]=useState(20);
  const[action,setAction]=useState("Open");
  const[cmpOn,setCmpOn]=useState(false);
  const[pos2,setPos2]=useState("CO");
  const[depth2,setDepth2]=useState(20);
  const[selectedHand,setSelectedHand]=useState("AA");

  const dList=MTT_D;

  function pickDepthSpec(byDepth,d){
    if(!byDepth) return null;
    if(byDepth[d]) return byDepth[d];
    const keys=Object.keys(byDepth).map(Number).filter(Number.isFinite);
    if(!keys.length) return null;
    const closest=keys.reduce((best,k)=>Math.abs(k-d)<Math.abs(best-d)?k:best,keys[0]);
    return byDepth[closest];
  }
  function getRangeSpec(p,d,act=action,format=fmt){
    try{
      const fmtKey=format==="Cash"?"cash":"mtt";
      const actionKey=act.toLowerCase();
      const exact=pickDepthSpec(RANGE_DATA[actionKey]?.[fmtKey]?.[p],d);
      if(exact) return {spec:exact,derived:false};
      const table=RANGE_DATA.open?.[fmtKey]||RANGE_DATA.open?.mtt||{};
      const sourcePos=table[p]?p:(p==="BB"?"SB":"BTN");
      const fallback=pickDepthSpec(table[sourcePos],d);
      return fallback?{spec:fallback,derived:actionKey!=="open"||format==="KO/PKO"||sourcePos!==p}:null;
    }catch(e){return null;}
  }
  function deriveGridForAction(baseGrid,act,format){
    if(act==="Open"&&format!=="KO/PKO") return baseGrid;
    return baseGrid.map((freq,idx)=>{
      if(freq<=0) return 0;
      const row=Math.floor(idx/13),col=idx%13;
      const isPair=row===col,isSuited=row<col,isOff=row>col;
      const hasAce=row===0||col===0;
      const broadway=row<=4&&col<=4;
      let factor=1;
      if(act==="Call") factor=.72+(isPair ? .10 : 0)+(isSuited ? .08 : 0)+(broadway ? .05 : 0)-((isOff&&!hasAce) ? .14 : 0);
      else if(act==="3Bet") factor=.34+(isPair ? .28 : 0)+(hasAce ? .12 : 0)+(broadway ? .10 : 0)+(isSuited ? .08 : 0);
      else if(act==="4Bet") factor=.16+((row<=2&&col<=2) ? .34 : 0)+(hasAce ? .10 : 0)+(isPair ? .16 : 0);
      else if(act==="Defense") factor=.82+(isSuited ? .10 : 0)+(isPair ? .08 : 0)+(hasAce ? .05 : 0)-((isOff&&!broadway) ? .10 : 0);
      else if(act==="Jam") factor=.22+(isPair ? .28 : 0)+(hasAce ? .13 : 0)+(broadway ? .10 : 0)-((isOff&&!hasAce) ? .08 : 0);
      if(format==="KO/PKO"&&(act==="Call"||act==="Defense"||act==="Jam")) factor*=1.12;
      const next=Math.min(1,Math.max(0,freq*factor));
      return next>=.12?Number(next.toFixed(2)):0;
    });
  }
  function getGrid(p,d){
    const data=getRangeSpec(p,d);
    if(!data) return new Array(169).fill(0);
    const base=buildHGrid(data.spec);
    return data.derived?deriveGridForAction(base,action,fmt):base;
  }

  const avail=dList.filter(d=>!!getRangeSpec(pos,d));

  useEffect(()=>{
    if(avail.length&&!avail.includes(depth)){
      setDepth(avail.reduce((b,d)=>Math.abs(d-depth)<Math.abs(b-depth)?d:b,avail[0]));
    }
  },[pos,fmt,action]);

  const grid1=getGrid(pos,depth);
  const grid2=cmpOn?getGrid(pos2,depth2):null;
  const notReady=!getRangeSpec(pos,depth);
  const selectedInfo=hGridCellInfo(grid1,selectedHand,action);

  return(
    <div style={{flex:1,overflowY:"auto",background:embedded?"#030B20":T.bg,display:"flex",flexDirection:"column",minHeight:0}}>

      {/* Header */}
      <div style={{
        background:"linear-gradient(90deg,rgba(255,194,71,.09),rgba(155,92,255,.03))",
        borderBottom:"1px solid rgba(255,194,71,.16)",
        padding:embedded?"8px 14px":"9px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0
      }}>
        <div>
          <div style={{fontSize:12,fontWeight:900,color:T.gold,fontFamily:"'Space Grotesk',sans-serif",letterSpacing:".1em"}}>📊 RANGES POKERFORGE</div>
          <div style={{fontSize:7.5,color:T.text4,fontFamily:T.stats,marginTop:1}}>Ranges, equity & stratégies GTO · 6 positions · MTT, Cash & KO/PKO · Grille 13×13 interactive</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={()=>onGoCoach&&onGoCoach()} style={{
            padding:"5px 13px",borderRadius:8,cursor:"pointer",fontSize:9.5,fontWeight:700,
            fontFamily:"'Space Grotesk',sans-serif",letterSpacing:".05em",transition:"all .15s",
            background:"rgba(31,139,255,.1)",border:"1px solid rgba(31,139,255,.3)",color:"#7FB8FF"
          }}>🧠 Coach AI</button>
          <button onClick={()=>setCmpOn(!cmpOn)} style={{
            padding:"5px 13px",borderRadius:8,cursor:"pointer",fontSize:9.5,fontWeight:700,
            fontFamily:"'Space Grotesk',sans-serif",letterSpacing:".05em",transition:"all .15s",
            background:cmpOn?"rgba(155,92,255,.18)":"rgba(255,255,255,.05)",
            border:cmpOn?"1.5px solid rgba(155,92,255,.65)":"1px solid rgba(255,255,255,.12)",
            color:cmpOn?"#C080FF":T.text3,boxShadow:cmpOn?"0 0 14px rgba(155,92,255,.2)":"none"
          }}>⚖ Comparer 2 ranges</button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{padding:"10px 14px 8px",borderBottom:"1px solid rgba(255,255,255,.06)",flexShrink:0,display:"flex",flexDirection:"column",gap:9}}>
        <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
          <FilterPills label="Format" options={["MTT","Cash","KO/PKO"]} value={fmt} onChange={v=>{setFmt(v);}} colors={FMT_C}/>
          <FilterPills label="Action" options={["Open","Call","3Bet","4Bet","Defense","Jam"]} value={action} onChange={setAction} colors={ACT_C}/>
          <FilterPills label="Position" options={["LJ","HJ","CO","BTN","SB","BB"]} value={pos} onChange={setPos} colors={POS_C}/>
        </div>
        <div>
          <div style={{fontSize:7,color:T.text4,fontFamily:T.stats,marginBottom:3,letterSpacing:".08em",fontWeight:700}}>STACK</div>
          <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
            {dList.map(d=>{
              const ok=avail.includes(d),on=depth===d;
              return(
                <button key={d} onClick={()=>ok&&setDepth(d)} style={{
                  padding:"3px 8px",borderRadius:5,fontSize:8.5,fontFamily:"'JetBrains Mono',monospace",
                  fontWeight:on?900:500,cursor:ok?"pointer":"not-allowed",
                  background:on?"rgba(255,194,71,.16)":"rgba(255,255,255,.03)",
                  border:on?"1.5px solid rgba(255,194,71,.65)":"1px solid rgba(255,255,255,.08)",
                  color:on?T.gold:ok?T.text3:"rgba(255,255,255,.2)",opacity:ok?1:.45,transition:"all .1s"
                }}>{d}bb</button>
              );
            })}
          </div>
        </div>
        {cmpOn&&(
          <div style={{display:"flex",gap:14,alignItems:"flex-end",padding:"8px 10px",background:"rgba(155,92,255,.06)",borderRadius:9,border:"1px solid rgba(155,92,255,.2)",flexWrap:"wrap"}}>
            <span style={{fontSize:9,color:"#9B5CFF",fontWeight:900,fontFamily:"'Space Grotesk',sans-serif",letterSpacing:".08em"}}>⚖ VS</span>
            <FilterPills label="Position 2" options={["LJ","HJ","CO","BTN","SB","BB"]} value={pos2} onChange={setPos2} colors={POS_C}/>
            <div>
              <div style={{fontSize:7,color:T.text4,fontFamily:T.stats,marginBottom:3,letterSpacing:".08em",fontWeight:700}}>STACK 2</div>
              <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                {dList.map(d=>(
                  <button key={d} onClick={()=>setDepth2(d)} style={{
                    padding:"3px 8px",borderRadius:5,fontSize:8.5,fontFamily:"'JetBrains Mono',monospace",
                    fontWeight:depth2===d?900:500,cursor:"pointer",
                    background:depth2===d?"rgba(155,92,255,.15)":"rgba(255,255,255,.03)",
                    border:depth2===d?"1.5px solid rgba(155,92,255,.55)":"1px solid rgba(255,255,255,.08)",
                    color:depth2===d?"#9B5CFF":T.text3,transition:"all .1s"
                  }}>{d}bb</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grilles */}
      {notReady?(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10}}>
          <div style={{fontSize:30}}>🔒</div>
          <div style={{fontSize:13,fontWeight:700,color:T.text3,fontFamily:"'Space Grotesk',sans-serif"}}>Bientôt disponible</div>
          <div style={{fontSize:9.5,color:T.text4,fontFamily:T.stats,textAlign:"center"}}>
            {action} {fmt} sera ajouté prochainement.<br/>
            <span style={{color:T.gold}}>Disponible : Open MTT · Open Cash</span>
          </div>
        </div>
      ):(
        <div style={{flex:1,padding:"12px 10px",display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap",overflowY:"auto",alignItems:"flex-start"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:7,padding:"4px 13px",
              background:"rgba(255,194,71,.07)",borderRadius:8,border:"1px solid rgba(255,194,71,.22)"}}>
              <span style={{fontSize:10,fontWeight:900,color:T.gold,fontFamily:"'Space Grotesk',sans-serif"}}>{action}</span>
              <span style={{fontSize:10,fontWeight:700,color:POS_C[pos]||T.gold,fontFamily:"'Space Grotesk',sans-serif"}}>{pos}</span>
              <span style={{fontSize:9,color:T.text3,fontFamily:"'JetBrains Mono',monospace"}}>{depth}bb</span>
              <span style={{fontSize:8,color:T.text4,fontFamily:T.stats}}>{fmt}</span>
            </div>
            <HandMatrix grid={grid1} small={cmpOn} selectedKey={selectedHand} onSelect={setSelectedHand} actionLabel={action}/>
            {selectedInfo&&(
              <div style={{display:"grid",gridTemplateColumns:"auto auto auto auto",gap:8,alignItems:"center",padding:"6px 10px",
                background:"rgba(5,14,40,.86)",border:"1px solid rgba(52,216,255,.16)",borderRadius:8,
                boxShadow:"0 8px 26px rgba(0,0,0,.24)"}}>
                <span style={{fontSize:12,fontWeight:900,color:T.gold,fontFamily:"'JetBrains Mono',monospace"}}>{selectedInfo.key}</span>
                <span style={{fontSize:8.5,color:T.text3,fontFamily:T.stats}}>{selectedInfo.type}</span>
                <span style={{fontSize:8.5,color:selectedInfo.freq>0?(ACT_C[action]||T.gold):T.text4,fontWeight:800,fontFamily:T.stats}}>
                  {selectedInfo.freq>0?`${Math.round(selectedInfo.freq*100)}% ${action}`:"Fold"}
                </span>
                <span style={{fontSize:8,color:T.text4,fontFamily:T.stats}}>{selectedInfo.combos} combos</span>
              </div>
            )}
          </div>
          {cmpOn&&grid2&&(
            <>
              <div style={{display:"flex",alignItems:"center",paddingTop:62,color:"rgba(155,92,255,.4)",fontSize:24}}>⚖</div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <div style={{display:"flex",alignItems:"center",gap:7,padding:"4px 13px",
                  background:"rgba(155,92,255,.07)",borderRadius:8,border:"1px solid rgba(155,92,255,.22)"}}>
                  <span style={{fontSize:10,fontWeight:900,color:"#9B5CFF",fontFamily:"'Space Grotesk',sans-serif"}}>{action}</span>
                  <span style={{fontSize:10,fontWeight:700,color:POS_C[pos2]||"#9B5CFF",fontFamily:"'Space Grotesk',sans-serif"}}>{pos2}</span>
                  <span style={{fontSize:9,color:T.text3,fontFamily:"'JetBrains Mono',monospace"}}>{depth2}bb</span>
                  <span style={{fontSize:8,color:T.text4,fontFamily:T.stats}}>{fmt}</span>
                </div>
                <HandMatrix grid={grid2} small selectedKey={selectedHand} onSelect={setSelectedHand} actionLabel={action}/>
              </div>
            </>
          )}
        </div>
      )}

      {/* Légende */}
      <div style={{padding:"7px 14px",borderTop:"1px solid rgba(255,255,255,.06)",
        display:"flex",gap:12,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontSize:7,color:T.text4,fontFamily:T.stats,letterSpacing:".07em",fontWeight:700}}>LÉGENDE :</span>
        {[
          {tc:"#2ECC71",bg:"rgba(18,58,32,.8)",brd:"rgba(46,204,113,.4)",l:"Paires"},
          {tc:"#34D8FF",bg:"rgba(8,52,72,.8)",brd:"rgba(52,216,255,.35)",l:"Suited"},
          {tc:"#FFC247",bg:"rgba(58,36,8,.8)",brd:"rgba(255,194,71,.35)",l:"Offsuit"},
          {tc:"rgba(255,255,255,.15)",bg:"rgba(3,10,28,.7)",brd:"rgba(255,255,255,.05)",l:"Fold"},
          {tc:ACT_C[action]||T.gold,bg:`${ACT_C[action]||T.gold}22`,brd:`${ACT_C[action]||T.gold}66`,l:`Action : ${action}`},
        ].map(({tc,bg,brd,l})=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:17,height:17,borderRadius:3,background:bg,border:`1px solid ${brd}`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:6,color:tc,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>Ax</span>
            </div>
            <span style={{fontSize:8,color:T.text3,fontFamily:T.stats}}>{l}</span>
          </div>
        ))}
        <span style={{fontSize:7,color:T.text4,fontFamily:T.stats,marginLeft:4}}>↗ suited · ↙ offsuit · ↘ paires</span>
        <div style={{marginLeft:"auto",fontSize:7.5,color:"rgba(255,194,71,.28)",fontFamily:T.stats,letterSpacing:".05em"}}>www.pokerforge.com</div>
      </div>
    </div>
  );
}
