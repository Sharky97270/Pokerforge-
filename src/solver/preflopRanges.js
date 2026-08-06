// PokerForge — Ranges préflop HEURISTIQUES (module PUR, sans React).
// Extrait de SharkSolverTab.jsx pour être importable par : le tab solveur, le
// Replayer, le provider Trainer, ET un Web Worker (qui ne peut pas importer un
// fichier React). AUCUN changement de comportement : code déplacé verbatim.

const RANKS=["A","K","Q","J","T","9","8","7","6","5","4","3","2"];

/* ⚠ RANGES HEURISTIQUES — CE N'EST PAS UN SOLVE (§2, §11/§37).
   Fréquences fabriquées par des formules écrites à la main (paliers de paires,
   décote par gap et bonus de hauteur), calibrées à l'œil pour AVOIR LA FORME d'une
   range correcte. Aucun calcul d'équilibre là-dedans.

   PORTÉE RÉELLE DE L'APPROXIMATION : ces ranges sont les ENTRÉES du CFR postflop.
   Un solve postflop exact sur des ranges devinées reste une réponse exacte à la
   mauvaise question, et la composition de range pilote l'essentiel de la stratégie
   postflop. Tant que ces ranges sont heuristiques, elles dominent le terme d'erreur,
   devant la précision du CFR. → RangeSource reste « heuristique » même en CFR. */
export function buildSolverFreqs(heroPos, action, stack=100, vsPos="BB"){
  const deep=stack>=80, mid=stack>=40&&stack<80, short=stack<40;
  const posIdx={UTG:0,LJ:0,HJ:1,CO:2,BTN:3,SB:4,BB:5}[heroPos]||0;
  const posBonus=posIdx; // 0=UTG tight, 3=BTN loose, 4=SB medium
  const res={};

  // helpers
  const rfi=(r,c=0,f=0)=>({r,c,f:f||100-r-c});
  const def=(r,c=0,f=0)=>({r,c,f:f||100-r-c}); // r=raise/3bet, c=call, f=fold

  /* ── RFI (open raise first in) ── */
  if(action==="rfi"){
    // Paires
    const ppOpen=[100,100,100,100,95,90,85,75+(posBonus*5),65+(posBonus*5),55+(posBonus*8),45+(posBonus*8),35+(posBonus*8),25+(posBonus*8)];
    RANKS.forEach((r,i)=>{
      const pct=Math.min(100,ppOpen[i]);
      res[r+r]=rfi(pct,0,100-pct);
    });
    // Suited combos
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const k=RANKS[i]+RANKS[j]+"s";
      const gap=j-i, topcard=i, kicker=j;
      let r=0;
      if(topcard===0){// Ax
        r=kicker<=4?100:kicker<=6?95:kicker<=8?85+(posBonus*3):kicker<=10?70+(posBonus*4):50+(posBonus*6);
      } else if(topcard===1){// Kx
        r=kicker<=2?100:kicker<=4?95:kicker<=6?85+(posBonus*4):kicker<=8?60+(posBonus*6):30+(posBonus*8);
      } else if(topcard===2){// Qx
        r=kicker<=3?100:kicker<=5?85+(posBonus*4):kicker<=7?60+(posBonus*7):25+(posBonus*8);
      } else if(topcard===3){// Jx
        r=kicker<=4?95:kicker<=6?75+(posBonus*5):kicker<=8?45+(posBonus*8):15+(posBonus*8);
      } else if(topcard<=5){// T9x
        r=gap<=2?80+(posBonus*4):gap<=4?50+(posBonus*7):15+(posBonus*8);
      } else {
        r=gap<=1?65+(posBonus*6):gap<=3?35+(posBonus*8):10+(posBonus*6);
      }
      r=Math.min(100,Math.max(0,Math.round(r)));
      res[k]=rfi(r,0,100-r);
    }
    // Offsuit combos
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const k=RANKS[i]+RANKS[j]+"o";
      const gap=j-i, topcard=i, kicker=j;
      let r=0;
      if(topcard===0){// Ax
        r=kicker<=1?100:kicker<=3?90:kicker<=5?75+(posBonus*4):kicker<=7?45+(posBonus*6):15+(posBonus*6);
      } else if(topcard===1){// Kx
        r=kicker<=2?95:kicker<=4?70+(posBonus*5):kicker<=6?35+(posBonus*6):5+(posBonus*5);
      } else if(topcard===2){// Qx
        r=kicker<=3?85+(posBonus*3):kicker<=5?45+(posBonus*7):kicker<=7?15+(posBonus*7):0;
      } else if(topcard===3){// Jx
        r=kicker<=4?70+(posBonus*5):kicker<=6?25+(posBonus*8):kicker<=8?5+(posBonus*6):0;
      } else if(topcard<=5){
        r=gap===1?55+(posBonus*7):gap===2?20+(posBonus*8):0;
      } else {
        r=0;
      }
      r=Math.min(100,Math.max(0,Math.round(r)));
      // RFI offsuit: pure raise ou pure fold sauf mix sur proches
      const mix=r>10&&r<90;
      res[k]=mix?rfi(r,0,100-r):r>=50?rfi(100,0,0):rfi(0,0,100);
    }
  }

  /* ── FACING OPEN (3bet / call / fold) ── */
  else if(action==="vs_open"){
    const defBonus=["BTN","CO","BB","SB"].includes(heroPos)?2:0;
    RANKS.forEach((r,i)=>{
      let tb=0,c=0;
      if(i<=1){tb=100;}
      else if(i===2){tb=deep?80:100; c=100-tb;}
      else if(i===3){tb=50+(defBonus*5); c=35; }
      else if(i<=5){tb=15+(defBonus*5); c=65+(defBonus*5);}
      else if(i<=8){tb=5; c=deep?65:50;}
      else {c=deep?45:30;}
      const f=Math.max(0,100-tb-c);
      res[r+r]=def(tb,c,f);
    });
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const ks=RANKS[i]+RANKS[j]+"s", ko=RANKS[i]+RANKS[j]+"o";
      const ti=i, ki=j;
      let tbs=0,cs=0,tbo=0,co=0;
      if(ti===0){// Ax suited
        tbs=ki<=1?100:ki<=3?70+(defBonus*5):ki<=5?30+(defBonus*8):ki<=8?15+(defBonus*5):5;
        cs=ki<=1?0:ki<=3?30:ki<=5?55:ki<=8?60:50;
      } else if(ti===1){// Kx
        tbs=ki<=2?60+(defBonus*5):ki<=4?20+(defBonus*5):ki<=6?10:0;
        cs=ki<=2?30:ki<=4?60:ki<=6?65:45;
      } else if(ti<=3){// QJ
        tbs=ki<=3?(ti===2?20:10)+(defBonus*5):ki<=5?5+(defBonus*3):0;
        cs=ki<=3?60:ki<=5?55:ki<=8?40:25;
      } else {
        tbs=ki-ti<=2?5+(defBonus*3):0;
        cs=ki-ti<=1?45:ki-ti<=2?35:ki-ti<=3?25:10;
      }
      if(ti===0){// Ax offsuit
        tbo=ki<=1?100:ki<=2?60+(defBonus*5):ki<=3?20+(defBonus*5):0;
        co=ki<=1?0:ki<=2?30:ki<=3?55:ki<=5?40:20;
      } else if(ti===1){
        tbo=ki<=2?50+(defBonus*5):0; co=ki<=2?40:ki<=4?45:30;
      } else if(ti<=3){
        tbo=ki<=4&&ti===2?10+(defBonus*5):0; co=ki<=4?35:20;
      } else {
        co=ki-ti===1?25:10;
      }
      [tbs,cs,tbo,co].forEach(v=>Math.min(100,Math.max(0,v)));
      res[ks]=def(tbs,cs,Math.max(0,100-tbs-cs));
      res[ko]=def(tbo,co,Math.max(0,100-tbo-co));
    }
  }

  /* ── VS 3BET (4bet / call / fold) ── */
  else if(action==="vs_3bet"){
    RANKS.forEach((r,i)=>{
      let fb=0,c=0;
      if(i<=1){fb=100;}
      else if(i===2){fb=deep?70:100; c=100-fb;}
      else if(i===3){fb=35; c=55;}
      else if(i<=5){fb=10; c=deep?75:60;}
      else if(i<=8){fb=0; c=short?0:45;}
      else {fb=0; c=0;}
      res[r+r]=def(fb,c,Math.max(0,100-fb-c));
    });
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const ks=RANKS[i]+RANKS[j]+"s",ko=RANKS[i]+RANKS[j]+"o";
      let fbs=0,cs=0,fbo=0,co=0;
      if(i===0){
        fbs=j<=1?100:j===2?60:j<=4?15+(posBonus*3):5;
        cs=j<=1?0:j===2?30:j<=4?75:j<=6?65:50;
        fbo=j<=1?90:j===2?45:0;
        co=j<=1?10:j===2?45:j===3?55:j<=5?35:0;
      } else if(i===1){
        fbs=j<=2?55:j<=4?10:0; cs=j<=2?35:j<=4?70:55;
        fbo=j<=2?40:0; co=j<=2?45:j<=4?55:30;
      } else if(i<=3){
        fbs=j<=4&&i===2?10:0; cs=j<=4?55:j<=6?40:20;
        co=j<=4&&i===2?30:j<=5?20:5;
      } else {
        cs=j-i<=1?35:j-i<=2?20:5;
      }
      res[ks]=def(fbs,cs,Math.max(0,100-fbs-cs));
      res[ko]=def(fbo,co,Math.max(0,100-fbo-co));
    }
  }

  /* ── CBET IP (bet / check) ── */
  else if(action==="cbet_ip"){
    RANKS.forEach((r,i)=>{
      const b=i<=4?90:i<=7?70:i<=9?50:35;
      res[r+r]=def(b,0,100-b);
    });
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const ks=RANKS[i]+RANKS[j]+"s",ko=RANKS[i]+RANKS[j]+"o";
      const top=i<=1&&j<=3,bway=i<=4&&j<=4;
      const bs=top?95:bway?80:i<=4&&j-i<=3?70:i<=7&&j-i<=2?55:35;
      const bo=top?85:bway?65:i<=4&&j-i<=2?55:25;
      res[ks]=def(bs,0,100-bs);
      res[ko]=def(bo,0,100-bo);
    }
  }

  /* ── FACING BET OOP (call / raise / fold) ── */
  else if(action==="vs_bet"){
    RANKS.forEach((r,i)=>{
      const raise=i<=2?15:i<=4?5:0;
      const call=i<=3?80:i<=6?65:i<=9?45:25;
      res[r+r]=def(raise,call,Math.max(0,100-raise-call));
    });
    for(let i=0;i<13;i++)for(let j=i+1;j<13;j++){
      const ks=RANKS[i]+RANKS[j]+"s",ko=RANKS[i]+RANKS[j]+"o";
      const top=i<=1&&j<=2,bway=i<=4&&j<=4;
      const rs=top?20:bway?8:i<=4&&j-i<=2?5:0;
      const cs=top?75:bway?65:i<=4&&j-i<=3?55:i<=7&&j-i<=2?40:20;
      const ro=top?12:bway?4:0;
      const co=top?70:bway?55:i<=3&&j-i<=2?45:20;
      res[ks]=def(rs,cs,Math.max(0,100-rs-cs));
      res[ko]=def(ro,co,Math.max(0,100-ro-co));
    }
  }

  return res;
}

/* Correspondance action Hero → action Villain pour la range de réponse */
export const VILLAIN_ACTION_MAP={rfi:"vs_open",vs_open:"rfi",vs_3bet:"vs_open",cbet_ip:"vs_bet",vs_bet:"cbet_ip"};

/* Range de réponse du Villain — réutilise buildSolverFreqs avec rôles inversés */
export function buildVillainResponseFreqs(scenario,stack){
  const vAction=VILLAIN_ACTION_MAP[scenario.action]||"vs_open";
  return buildSolverFreqs(scenario.vsPos,vAction,stack||scenario.stack||100,scenario.heroPos);
}
