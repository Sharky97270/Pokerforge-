/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · HAND EVALUATOR (§9)
   Évaluateur 5 cartes → score entier comparable (catégorie + tiebreaks), et
   meilleure main de 5 parmi 7. Cartes = entiers 0..51 (rang = c>>2, couleur = c&3).
   Gère : High Card, Pair, Two Pair, Trips, Straight (dont wheel A2345), Flush,
   Full House, Quads, Straight Flush, kickers et égalités.
   Fonctions PURES, aucune dépendance — isolé du monolithe UI (Phase 8).
════════════════════════════════════════════════════════════════════════════ */

/* Évaluateur 5 cartes → score entier comparable (catégorie + tiebreaks). */
export function eval5i(cs){
  const r=[];
  for(let i=0;i<5;i++)r.push((cs[i]>>2)+2);
  r.sort((a,b)=>b-a);
  const flush=(cs[0]&3)===(cs[1]&3)&&(cs[1]&3)===(cs[2]&3)&&(cs[2]&3)===(cs[3]&3)&&(cs[3]&3)===(cs[4]&3);
  const u=[...new Set(r)];
  let sh=0;
  if(u.length===5){
    if(u[0]-u[4]===4)sh=u[0];
    else if(u[0]===14&&u[1]===5&&u[4]===2)sh=5;
  }
  const cnt={};for(const x of r)cnt[x]=(cnt[x]||0)+1;
  const groups=Object.keys(cnt).map(k=>[cnt[k],+k]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
  const pat=groups.map(g=>g[0]).join("");
  let cat,tb;
  if(sh&&flush){cat=8;tb=[sh];}
  else if(pat==="41"){cat=7;tb=groups.map(g=>g[1]);}
  else if(pat==="32"){cat=6;tb=groups.map(g=>g[1]);}
  else if(flush){cat=5;tb=r;}
  else if(sh){cat=4;tb=[sh];}
  else if(pat==="311"){cat=3;tb=groups.map(g=>g[1]);}
  else if(pat==="221"){cat=2;tb=groups.map(g=>g[1]);}
  else if(pat==="2111"){cat=1;tb=groups.map(g=>g[1]);}
  else{cat=0;tb=r;}
  let score=cat;
  for(let i=0;i<5;i++)score=score*15+(tb[i]||0);
  return score;
}
/* Meilleure main de 5 parmi 7 (21 combinaisons). */
export function eval7i(cards){
  let best=-1;
  for(let a=0;a<7;a++)for(let b=a+1;b<7;b++){
    const five=[];
    for(let k=0;k<7;k++)if(k!==a&&k!==b)five.push(cards[k]);
    const s=eval5i(five);
    if(s>best)best=s;
  }
  return best;
}
