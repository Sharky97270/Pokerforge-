const fs=require('fs');const p='src/tabs/SharkSolverTab.jsx';
let lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
const start=lines.findIndex(l=>l.includes("ÉTAT DE JEU CANONIQUE POUR PFASE"));
if(start<0){console.error('bloc PFASE introuvable');process.exit(1);}
const commentStart=start-0;
const endIdx=lines.findIndex((l,i)=>i>start&&l.includes('pfaseDisabledReason=board.length<3'));
if(endIdx<0){console.error('fin du bloc introuvable');process.exit(1);}
// le bloc va du commentaire (start-1 : ligne "/* ──") jusqu'à la ligne suivant pfaseDisabledReason (+2 lignes)
let s0=start; while(s0>0 && !lines[s0].trim().startsWith('/*')) s0--;
let e0=endIdx; while(e0<lines.length && !lines[e0].trim().endsWith(':null;')) e0++;
const bloc=lines.slice(s0,e0+1);
lines.splice(s0,e0-s0+1);
// insérer juste après la fin de tourneyCtx
const t=lines.findIndex(l=>l.includes('},[icmParams,pkoParams,msTourney]);'));
if(t<0){console.error('fin de tourneyCtx introuvable');process.exit(1);}
lines.splice(t+1,0,"",...bloc);
fs.writeFileSync(p,lines.join("\n"));
console.log('déplacé '+bloc.length+' lignes après tourneyCtx');
