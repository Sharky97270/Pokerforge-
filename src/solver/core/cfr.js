/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · CFR ENGINE (§13)
   Solveur CFR+ d'un sous-jeu heads-up single-street (board + bet + raise +
   call/fold). Régret-matching CFR+ (regrets clampés ≥0), moyennage de stratégie
   pondéré par l'itération. Showdown exact si board complet (5), sinon équité par
   runouts Monte-Carlo. Périmètre assumé : 1 street, 2 sizings Hero + raise/check-raise.
   + CONVERGENCE ENGINE (§14) : stabilité de stratégie, regret moyen, borne
   d'exploitabilité — métriques RÉELLES (pas d'invention, §58).
   Isolé du monolithe (Phase 12).
════════════════════════════════════════════════════════════════════════════ */
import { rangeComboList } from "./combos.js";
import { eval7i } from "./evaluator.js";
import { mulberry32 } from "./equity.js";

export function solveRiverCFR(heroFreqs,villainFreqs,board,potBB,betFrac,opts={}){
  const maxCombos=opts.maxCombos||50;
  const iters=opts.iters||400;
  const runouts=opts.runouts||60;
  const raiseMult=opts.raiseMult||3; // taille du raise vilain = 3× le bet
  const bd=board||[];
  // rng seedé pour les runouts (reproductibilité §15) : même spot → même solve.
  const rng=opts.seed==null?Math.random:mulberry32(opts.seed>>>0);
  function topCombos(freqs){
    const list=rangeComboList(freqs).filter(e=>!bd.includes(e.cards[0])&&!bd.includes(e.cards[1]));
    list.sort((a,b)=>b.w-a.w);
    return list.slice(0,maxCombos);
  }
  const H=topCombos(heroFreqs),V=topCombos(villainFreqs);
  if(!H.length||!V.length)return null;
  const nH=H.length,nV=V.length;
  const complete=bd.length===5;
  // matrice d'équité E[i][j] (0..1) ; -1 si combos incompatibles
  const E=[];const used=new Uint8Array(52);
  for(let i=0;i<nH;i++){
    const row=new Float32Array(nV);E.push(row);
    const h=H[i].cards;
    for(let j=0;j<nV;j++){
      const v=V[j].cards;
      if(h[0]===v[0]||h[0]===v[1]||h[1]===v[0]||h[1]===v[1]){row[j]=-1;continue;}
      if(complete){
        const hv=eval7i([h[0],h[1],bd[0],bd[1],bd[2],bd[3],bd[4]]);
        const vv=eval7i([v[0],v[1],bd[0],bd[1],bd[2],bd[3],bd[4]]);
        row[j]=hv>vv?1:hv===vv?0.5:0;
      }else{
        let s=0,n=0;
        for(let it=0;it<runouts;it++){
          used.fill(0);used[h[0]]=1;used[h[1]]=1;used[v[0]]=1;used[v[1]]=1;
          for(const c of bd)used[c]=1;
          const b2=bd.slice();
          while(b2.length<5){const c=(rng()*52)|0;if(!used[c]){used[c]=1;b2.push(c);}}
          const hv=eval7i([h[0],h[1],b2[0],b2[1],b2[2],b2[3],b2[4]]);
          const vv=eval7i([v[0],v[1],b2[0],b2[1],b2[2],b2[3],b2[4]]);
          s+=hv>vv?1:hv===vv?0.5:0;n++;
        }
        row[j]=n?s/n:0.5;
      }
    }
  }
  const wH=H.map(e=>e.w),wV=V.map(e=>e.w);
  const p2=potBB/2;
  const bS=betFrac*potBB;                          // bet Hero "small" (= sizing choisi)
  const bB=Math.min(potBB*2,bS*1.5);               // bet Hero "big" (2e sizing)
  const vb=betFrac*potBB;                          // stab Vilain après check Hero
  const Rs=raiseMult*bS,Rb=raiseMult*bB,CR=raiseMult*vb; // tailles de raise / check-raise
  // infosets : HR[h]{check,betS,betB} ; VC[v]{check,bet} ; HCB[h]{fold,call,raise=check-raise} ;
  //   VCR[v]{fold,call} ; VBs[v]{fold,call,raise} ; HBsR[h]{fold,call} ; VBb[v]{fold,call,raise} ; HBbR[h]{fold,call}
  const mk=(n,a)=>({reg:Array.from({length:n},()=>new Array(a).fill(0)),sum:Array.from({length:n},()=>new Array(a).fill(0))});
  const HR=mk(nH,3),VC=mk(nV,2),HCB=mk(nH,3),VCR=mk(nV,2),VBs=mk(nV,3),HBsR=mk(nH,2),VBb=mk(nV,3),HBbR=mk(nH,2);
  const strat=(node,i)=>{
    const r=node.reg[i];let s=0;const out=new Array(r.length);
    for(let k=0;k<r.length;k++){out[k]=r[k]>0?r[k]:0;s+=out[k];}
    if(s>0){for(let k=0;k<r.length;k++)out[k]/=s;}else{for(let k=0;k<r.length;k++)out[k]=1/r.length;}
    return out;
  };
  const addSum=(node,i,st,w)=>{for(let k=0;k<st.length;k++)node.sum[i][k]+=w*st[k];};
  // Convergence Engine : snapshot de la fréquence de bet Hero à mi-parcours,
  // pour mesurer la stabilité de stratégie sur la 2e moitié.
  let midBet=null;const midT=Math.floor(iters*0.5);
  for(let t=0;t<iters;t++){
    if(t===midT)midBet=HR.sum.map(s=>{const tt=s[0]+s[1]+s[2];return tt>0?(s[1]+s[2])/tt:0;});
    const sHR=[],sVC=[],sHCB=[],sVCR=[],sVBs=[],sHBsR=[],sVBb=[],sHBbR=[];
    for(let i=0;i<nH;i++){sHR[i]=strat(HR,i);sHCB[i]=strat(HCB,i);sHBsR[i]=strat(HBsR,i);sHBbR[i]=strat(HBbR,i);}
    for(let j=0;j<nV;j++){sVC[j]=strat(VC,j);sVCR[j]=strat(VCR,j);sVBs[j]=strat(VBs,j);sVBb[j]=strat(VBb,j);}
    const wt=t+1;
    for(let i=0;i<nH;i++){addSum(HR,i,sHR[i],wt*wH[i]);addSum(HCB,i,sHCB[i],wt*wH[i]);addSum(HBsR,i,sHBsR[i],wt*wH[i]);addSum(HBbR,i,sHBbR[i],wt*wH[i]);}
    for(let j=0;j<nV;j++){addSum(VC,j,sVC[j],wt*wV[j]);addSum(VCR,j,sVCR[j],wt*wV[j]);addSum(VBs,j,sVBs[j],wt*wV[j]);addSum(VBb,j,sVBb[j],wt*wV[j]);}
    // valeur hero d'une branche bet de taille bX / RX, selon stratégies VBx (vilain) & HBxR (hero vs raise)
    const heroBetVal=(i,j,sd,bX,RX,sVBx,sHBxR)=>
      sVBx[0]*p2 + sVBx[1]*(sd*(p2+bX)) + sVBx[2]*( sHBxR[i][0]*(-(p2+bX)) + sHBxR[i][1]*(sd*(p2+RX)) );
    // ── Hero root {check, betS, betB} ──
    for(let i=0;i<nH;i++){
      let vCheck=0,vBetS=0,vBetB=0;
      for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;const sd=2*e-1;
        // branche check : vilain check (SD) ou bet → hero {fold,call,check-raise→vilain fold/call}
        const heroVsStab=sHCB[i][0]*(-p2)+sHCB[i][1]*(sd*(p2+vb))+sHCB[i][2]*(sVCR[j][0]*(p2+vb)+sVCR[j][1]*(sd*(p2+CR)));
        vCheck+=wV[j]*(sVC[j][0]*(sd*p2)+sVC[j][1]*heroVsStab);
        vBetS+=wV[j]*heroBetVal(i,j,sd,bS,Rs,sVBs[j],sHBsR);
        vBetB+=wV[j]*heroBetVal(i,j,sd,bB,Rb,sVBb[j],sHBbR);
      }
      const nodeV=sHR[i][0]*vCheck+sHR[i][1]*vBetS+sHR[i][2]*vBetB;
      HR.reg[i][0]=Math.max(0,HR.reg[i][0]+vCheck-nodeV);
      HR.reg[i][1]=Math.max(0,HR.reg[i][1]+vBetS-nodeV);
      HR.reg[i][2]=Math.max(0,HR.reg[i][2]+vBetB-nodeV);
    }
    // ── Hero après check-bet {fold, call, check-raise} (reach = wV*sVC.bet) ──
    for(let i=0;i<nH;i++){
      let vF=0,vC=0,vR=0;
      for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;const sd=2*e-1;const reach=wV[j]*sVC[j][1];
        vF+=reach*(-p2);vC+=reach*(sd*(p2+vb));
        vR+=reach*(sVCR[j][0]*(p2+vb)+sVCR[j][1]*(sd*(p2+CR)));
      }
      const s=sHCB[i];const nodeV=s[0]*vF+s[1]*vC+s[2]*vR;
      HCB.reg[i][0]=Math.max(0,HCB.reg[i][0]+vF-nodeV);
      HCB.reg[i][1]=Math.max(0,HCB.reg[i][1]+vC-nodeV);
      HCB.reg[i][2]=Math.max(0,HCB.reg[i][2]+vR-nodeV);
    }
    // ── Hero après betS-raise et betB-raise {fold,call} ──
    for(let i=0;i<nH;i++){
      let sF=0,sC=0,bF=0,bC=0;
      for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;const sd=2*e-1;
        const rs=wV[j]*sVBs[j][2],rb=wV[j]*sVBb[j][2];
        sF+=rs*(-(p2+bS));sC+=rs*(sd*(p2+Rs));
        bF+=rb*(-(p2+bB));bC+=rb*(sd*(p2+Rb));
      }
      let s=sHBsR[i],nv=s[0]*sF+s[1]*sC;
      HBsR.reg[i][0]=Math.max(0,HBsR.reg[i][0]+sF-nv);HBsR.reg[i][1]=Math.max(0,HBsR.reg[i][1]+sC-nv);
      s=sHBbR[i];nv=s[0]*bF+s[1]*bC;
      HBbR.reg[i][0]=Math.max(0,HBbR.reg[i][0]+bF-nv);HBbR.reg[i][1]=Math.max(0,HBbR.reg[i][1]+bC-nv);
    }
    // ── Vilain après check hero {check,bet} (util = -hero) ──
    for(let j=0;j<nV;j++){
      let vCheck=0,vBet=0;
      for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;const sd=2*e-1;const reach=wH[i]*sHR[i][0];
        vCheck+=reach*(-(sd*p2));
        // vilain bet → hero {fold:+p2(vil), call:-(...), check-raise → vilain {fold:-(p2+vb), call:-(sd*(p2+CR))}}
        const heroCR=sHCB[i][2]*(sVCR[j][0]*(-(p2+vb))+sVCR[j][1]*(-(sd*(p2+CR))));
        vBet+=reach*(sHCB[i][0]*p2+sHCB[i][1]*(-(sd*(p2+vb)))+heroCR);
      }
      const s=sVC[j];const nodeV=s[0]*vCheck+s[1]*vBet;
      VC.reg[j][0]=Math.max(0,VC.reg[j][0]+vCheck-nodeV);
      VC.reg[j][1]=Math.max(0,VC.reg[j][1]+vBet-nodeV);
    }
    // ── Vilain après hero check-raise {fold,call} (reach = wH*sHR.check*sHCB.raise) ──
    for(let j=0;j<nV;j++){
      let vF=0,vC=0;
      for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;const sd=2*e-1;const reach=wH[i]*sHR[i][0]*sHCB[i][2];
        vF+=reach*(-(p2+vb));vC+=reach*(-(sd*(p2+CR)));
      }
      const s=sVCR[j];const nodeV=s[0]*vF+s[1]*vC;
      VCR.reg[j][0]=Math.max(0,VCR.reg[j][0]+vF-nodeV);
      VCR.reg[j][1]=Math.max(0,VCR.reg[j][1]+vC-nodeV);
    }
    // ── Vilain après betS et betB {fold,call,raise} ──
    for(let j=0;j<nV;j++){
      let sF=0,sC=0,sR=0,bF=0,bC=0,bR=0;
      for(let i=0;i<nH;i++){const e=E[i][j];if(e<0)continue;const sd=2*e-1;
        const reachS=wH[i]*sHR[i][1],reachB=wH[i]*sHR[i][2];
        sF+=reachS*(-p2);sC+=reachS*(-(sd*(p2+bS)));sR+=reachS*(sHBsR[i][0]*(p2+bS)+sHBsR[i][1]*(-(sd*(p2+Rs))));
        bF+=reachB*(-p2);bC+=reachB*(-(sd*(p2+bB)));bR+=reachB*(sHBbR[i][0]*(p2+bB)+sHBbR[i][1]*(-(sd*(p2+Rb))));
      }
      let s=sVBs[j],nv=s[0]*sF+s[1]*sC+s[2]*sR;
      VBs.reg[j][0]=Math.max(0,VBs.reg[j][0]+sF-nv);VBs.reg[j][1]=Math.max(0,VBs.reg[j][1]+sC-nv);VBs.reg[j][2]=Math.max(0,VBs.reg[j][2]+sR-nv);
      s=sVBb[j];nv=s[0]*bF+s[1]*bC+s[2]*bR;
      VBb.reg[j][0]=Math.max(0,VBb.reg[j][0]+bF-nv);VBb.reg[j][1]=Math.max(0,VBb.reg[j][1]+bC-nv);VBb.reg[j][2]=Math.max(0,VBb.reg[j][2]+bR-nv);
    }
  }
  // stratégies moyennes par combo
  const avg=(node,i)=>{const a=node.sum[i];let s=0;for(const x of a)s+=x;const out=new Array(a.length);for(let k=0;k<a.length;k++)out[k]=s>0?a[k]/s:1/a.length;return out;};
  const aHR=[],aHCB=[],aHBsR=[],aHBbR=[],aVC=[],aVCR=[],aVBs=[],aVBb=[];
  for(let i=0;i<nH;i++){aHR[i]=avg(HR,i);aHCB[i]=avg(HCB,i);aHBsR[i]=avg(HBsR,i);aHBbR[i]=avg(HBbR,i);}
  for(let j=0;j<nV;j++){aVC[j]=avg(VC,j);aVCR[j]=avg(VCR,j);aVBs[j]=avg(VBs,j);aVBb[j]=avg(VBb,j);}
  const aggW=(arr,w,a)=>{let num=0,den=0;for(let i=0;i<arr.length;i++){num+=w[i]*arr[i][a];den+=w[i];}return den>0?num/den:0;};
  // EV Hero du sous-jeu sous stratégies moyennes
  let evNum=0,wNum=0;
  for(let i=0;i<nH;i++)for(let j=0;j<nV;j++){const e=E[i][j];if(e<0)continue;const sd=2*e-1;
    const heroVsStab=aHCB[i][0]*(-p2)+aHCB[i][1]*(sd*(p2+vb))+aHCB[i][2]*(aVCR[j][0]*(p2+vb)+aVCR[j][1]*(sd*(p2+CR)));
    const checkVal=aVC[j][0]*(sd*p2)+aVC[j][1]*heroVsStab;
    const betSVal=aVBs[j][0]*p2+aVBs[j][1]*(sd*(p2+bS))+aVBs[j][2]*(aHBsR[i][0]*(-(p2+bS))+aHBsR[i][1]*(sd*(p2+Rs)));
    const betBVal=aVBb[j][0]*p2+aVBb[j][1]*(sd*(p2+bB))+aVBb[j][2]*(aHBbR[i][0]*(-(p2+bB))+aHBbR[i][1]*(sd*(p2+Rb)));
    const val=aHR[i][0]*checkVal+aHR[i][1]*betSVal+aHR[i][2]*betBVal;
    evNum+=wH[i]*wV[j]*val;wNum+=wH[i]*wV[j];
  }
  // stratégie Hero agrégée par clé de main (pour overlay matrice) : bet = betS+betB
  const heroByKey={};
  {
    const acc={};
    for(let i=0;i<nH;i++){const k=H[i].key;if(!k)continue;const a=acc[k]||(acc[k]={bet:0,xr:0,w:0});a.bet+=wH[i]*(aHR[i][1]+aHR[i][2]);a.xr+=wH[i]*aHCB[i][2];a.w+=wH[i];}
    for(const k in acc){const a=acc[k];heroByKey[k]={bet:Math.round(a.bet/a.w*100),xr:Math.round(a.xr/a.w*100)};}
  }
  // ══ CONVERGENCE ENGINE (§14) — métriques RÉELLES du solve (pas d'invention, §58) ══
  // 1) Stabilité de stratégie : dérive L1 moyenne de la fréq de bet Hero entre le
  //    point milieu et la fin. Faible dérive → stratégie stabilisée.
  const finalBet=HR.sum.map(s=>{const tt=s[0]+s[1]+s[2];return tt>0?(s[1]+s[2])/tt:0;});
  let drift=0;if(midBet){for(let i=0;i<nH;i++)drift+=Math.abs(finalBet[i]-(midBet[i]||0));drift=nH?drift/nH:0;}
  const stability=Math.max(0,Math.min(100,Math.round((1-drift)*1000)/10));
  // 2) Regret positif moyen par infoset/itération (→0 quand convergé). Borne l'exploitabilité.
  let totReg=0,cntReg=0;
  [HR,HCB,HBsR,HBbR,VC,VCR,VBs,VBb].forEach(node=>node.reg.forEach(r=>r.forEach(x=>{if(x>0)totReg+=x;cntReg++;})));
  const avgRegret=cntReg?totReg/cntReg/iters:0;                    // bb / infoset / itération
  const exploitBb=Math.round(avgRegret*10000)/10000;              // borne sup. d'exploitabilité (bb) — estimation
  // 3) Statut de convergence — critère DÉFINI (§14).
  const convStatus=(stability>=98&&exploitBb<=0.05)?"Converged":stability>=90?"High":stability>=70?"Medium":"Low";
  const R=x=>Math.round(x*100);
  return{
    stability,avgRegret:Math.round(avgRegret*10000)/10000,exploitBb,convStatus,driftPct:Math.round(drift*1000)/10,
    heroCheck:R(aggW(aHR,wH,0)),heroBetS:R(aggW(aHR,wH,1)),heroBetB:R(aggW(aHR,wH,2)),
    heroBet:R(aggW(aHR,wH,1))+R(aggW(aHR,wH,2)),
    villCheckVsCheck:R(aggW(aVC,wV,0)),villBetVsCheck:R(aggW(aVC,wV,1)),
    heroFoldVsStab:R(aggW(aHCB,wH,0)),heroCallVsStab:R(aggW(aHCB,wH,1)),heroCheckRaise:R(aggW(aHCB,wH,2)),
    villFoldVsBetS:R(aggW(aVBs,wV,0)),villCallVsBetS:R(aggW(aVBs,wV,1)),villRaiseVsBetS:R(aggW(aVBs,wV,2)),
    villFoldVsBetB:R(aggW(aVBb,wV,0)),villCallVsBetB:R(aggW(aVBb,wV,1)),villRaiseVsBetB:R(aggW(aVBb,wV,2)),
    heroEV:Math.round(evNum/(wNum||1)*100)/100,
    heroByKey,
    iters,betSPct:Math.round(betFrac*100),betBPct:Math.round(bB/potBB*100),nH,nV,complete,pot:Math.round(potBB*10)/10,
  };
}
