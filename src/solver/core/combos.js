/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · CARD ENGINE (§7) + COMBO ENGINE (§8)
   Représentation carte = entier 0..51 : rang = c>>2 (0=2 … 12=A), couleur = c&3.
   Développe une famille de la matrice 169 en combos réels, applique le card
   removal (board), et pondère par les fréquences de continuation.
   Fonctions PURES, aucune dépendance externe — isolé du monolithe (Phase 6-7).
════════════════════════════════════════════════════════════════════════════ */

export const EQ_RANKVAL="23456789TJQKA";                 // index 0..12 → rang
export const EQ_SUITIDX={"♠":0,"♥":1,"♦":2,"♣":3,"s":0,"h":1,"d":2,"c":3,"S":0,"H":1,"D":2,"C":3};

/* Tous les combos entiers d'une famille (ex. "AKs" → 4, "AKo" → 12, "AA" → 6). */
export function comboCardsInt(key){
  const out=[];
  if(key.length===2){
    const ri=EQ_RANKVAL.indexOf(key[0]);
    for(let s1=0;s1<4;s1++)for(let s2=s1+1;s2<4;s2++)out.push([ri*4+s1,ri*4+s2]);
  }else{
    const r1=EQ_RANKVAL.indexOf(key[0]),r2=EQ_RANKVAL.indexOf(key[1]),suited=key[2]==="s";
    if(suited){for(let s=0;s<4;s++)out.push([r1*4+s,r2*4+s]);}
    else{for(let s1=0;s1<4;s1++)for(let s2=0;s2<4;s2++)if(s1!==s2)out.push([r1*4+s1,r2*4+s2]);}
  }
  return out;
}
/* Combo exact (avec couleurs) d'une main parsée → [{cards,w}] ou null. */
export function exactComboList(parse){
  if(!parse||!parse.valid||!parse.suits||parse.suits.length<2)return null;
  const r1=EQ_RANKVAL.indexOf(parse.key[0]);
  const r2=parse.isPair?r1:EQ_RANKVAL.indexOf(parse.key[1]);
  const s1=EQ_SUITIDX[parse.suits[0]],s2=EQ_SUITIDX[parse.suits[1]];
  if(s1==null||s2==null||(r1===r2&&s1===s2))return null;
  return[{cards:[r1*4+s1,r2*4+s2],w:1}];
}
/* Liste pondérée de combos d'une seule main (toutes couleurs). */
export function singleHandList(key){return comboCardsInt(key).map(cards=>({cards,w:1}));}

/* Liste pondérée de combos d'une range (poids = part continuant raise+call). */
export function rangeComboList(freqs){
  const out=[];
  for(const key in freqs){
    const f=freqs[key];const w=((f.r||0)+(f.c||0))/100;
    if(w<=0)continue;
    for(const cards of comboCardsInt(key))out.push({cards,w,key});
  }
  return out;
}
/* ══ RÉDUCTION DE RANGE (§8) — ABSTRACTION HONNÊTE ═══════════════════════════
   Remplace le `list.slice(0,maxCombos)` qui plafonnait les ranges jusqu'ici.

   POURQUOI c'était faux et pas seulement « approximatif » : rangeComboList itère
   les clés dans l'ordre d'INSERTION (paires, puis suited, puis offsuit — cf.
   buildSolverFreqs). Tronquer gardait donc systématiquement le haut de cet ordre.
   Mesuré sur une range BTN RFI (1134 combos) à maxCombos=110 : 90% de la range
   supprimée et les 744 combos OFFSUIT éliminés en totalité, à chaque solve. Le
   solveur ne résolvait pas une version échantillonnée de la range demandée mais
   une AUTRE range — paires + quelques suited — bien plus nuttée. Comme la
   composition de range pilote l'essentiel de la stratégie postflop, les fréquences
   affichées portaient sur une range que l'utilisateur n'avait jamais saisie.

   CE QU'ON FAIT À LA PLACE : réduction stratifiée par classe de main (169).
     · chaque classe présente dans la range reste présente (≥ 1 combo) ;
     · le nombre de combos alloué à une classe est proportionnel à son POIDS ;
     · les combos gardés sont pris à pas régulier (couleurs réparties, pas les
       premières) et leur poids est remonté ×(combos_classe / combos_gardés),
       ce qui conserve EXACTEMENT le poids de chaque classe et le poids total.
   La range réduite a donc la même forme que la range demandée.

   CE QUE ÇA NE CONSERVE PAS, et qu'il faut dire (§2) : la granularité par COULEUR
   à l'intérieur d'une classe. Sur board monotone/flush-draw, les blockers de
   couleur comptent — une classe réduite de 12 à 3 combos y perd de l'information.
   D'où `exact:false` dans le retour : l'appelant doit signaler l'abstraction.

   Retourne {list, exact, kept, total, classesKept, classesTotal, classesDropped, method}. */
export function reduceRange(list,maxCombos){
  const total=list.length;
  const byKey=new Map();
  for(const e of list){
    let g=byKey.get(e.key);
    if(!g){g={key:e.key,combos:[],w:e.w};byKey.set(e.key,g);}
    g.combos.push(e);
  }
  const classesTotal=byKey.size;
  const complete=(l)=>({list:l,exact:true,kept:l.length,total,
    classesKept:classesTotal,classesTotal,classesDropped:0,method:"complete"});
  // Range non plafonnée : chemin EXACT, aucune abstraction.
  if(!Number.isFinite(maxCombos)||maxCombos<=0||total<=maxCombos)return complete(list);

  const groups=[...byKey.values()];
  for(const g of groups)g.W=g.combos.length*g.w;      // poids total de la classe

  // Cas extrême : moins de budget que de classes → on garde les classes les plus
  // lourdes et on REMONTE le nombre de classes perdues (jamais en silence).
  let sel=groups;
  if(maxCombos<groups.length)sel=[...groups].sort((a,b)=>b.W-a.W).slice(0,maxCombos);
  const selW=sel.reduce((a,g)=>a+g.W,0)||1;

  // Allocation proportionnelle au poids, bornée par les combos réellement dispo.
  const alloc=sel.map(g=>({g,n:Math.max(1,Math.min(g.combos.length,
    Math.round(maxCombos*g.W/selW)))}));
  const sum=()=>alloc.reduce((a,x)=>a+x.n,0);
  // Ajustement pour retomber exactement sur le budget.
  let guard=alloc.length*8;
  while(sum()>maxCombos&&guard-->0){
    alloc.sort((a,b)=>b.n-a.n);
    const t=alloc.find(x=>x.n>1);if(!t)break;t.n--;
  }
  guard=alloc.length*8;
  while(sum()<maxCombos&&guard-->0){
    alloc.sort((a,b)=>(b.g.combos.length-b.n)-(a.g.combos.length-a.n));
    const t=alloc.find(x=>x.n<x.g.combos.length);if(!t)break;t.n++;
  }

  const out=[];
  for(const {g,n} of alloc){
    const c=g.combos.length,scale=c/n;                // conserve le poids de la classe
    for(let i=0;i<n;i++){
      const e=g.combos[Math.floor(i*c/n)];            // pas régulier → couleurs réparties
      out.push({...e,w:e.w*scale});
    }
  }
  return {list:out,exact:false,kept:out.length,total,
    classesKept:alloc.length,classesTotal,classesDropped:classesTotal-alloc.length,
    method:"stratified"};
}

/* Construit la liste de combos d'un camp selon Main/Range (+ combo exact si couleurs). */
export function sideComboList(isHand,parse,key,freqs){
  if(isHand&&parse&&parse.valid){
    return exactComboList(parse)||singleHandList(parse.key);
  }
  if(key)return singleHandList(key);
  return rangeComboList(freqs);
}
/* Libellé lisible d'une carte int (ex. 51 → "A♠"). */
export function cardLabel(c){const SU=["♠","♥","♦","♣"];return EQ_RANKVAL[c>>2]+SU[c&3];}
