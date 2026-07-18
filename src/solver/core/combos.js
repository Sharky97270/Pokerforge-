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
