/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · HAND EVALUATOR (§9)
   Évaluateur 5 cartes → score entier comparable (catégorie + tiebreaks), et
   meilleure main de 5 parmi 7. Cartes = entiers 0..51 (rang = c>>2, couleur = c&3).
   Gère : High Card, Pair, Two Pair, Trips, Straight (dont wheel A2345), Flush,
   Full House, Quads, Straight Flush, kickers et égalités.
   Fonctions PURES, aucune dépendance — isolé du monolithe UI (Phase 8).
════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   P0 PERFORMANCE — POURQUOI CE FICHIER A ÉTÉ RÉÉCRIT

   Profil CPU navigateur, saisie d'un board de 5 cartes dans SharkSolver :
     eval5i .............. 123 468 ms   84,5 %
     eval7i ...............  9 087 ms    6,2 %
     fermetures d'eval5i ..  5 997 ms    4,1 %
     ────────────────────────────────────────
     l'évaluateur seul ... 94,8 % des 146 s de thread principal mesurées.

   La version précédente allouait, PAR APPEL à eval5i : un tableau de rangs, un
   Set, un tableau depuis ce Set, un objet de comptage, un tableau de clés, un
   tableau de paires, un tri par comparateur, un `join("")` et une comparaison de
   chaînes. eval7i l'appelait 21 fois, en reconstruisant un tableau à chaque fois.
   Une seule évaluation à 7 cartes coûtait ~40 µs — deux ordres de grandeur
   au-dessus de ce que la même logique coûte sans allocation.

   CE QUI CHANGE : rien de mathématique. Mêmes catégories, mêmes tiebreaks, même
   entier renvoyé, bit pour bit. Le tri par comparateur est remplacé par un
   parcours des rangs 14→2 (décroissant par construction) ; le `join("")` suivi
   d'une comparaison de motif, par le couple (nombre de groupes, taille du plus
   gros groupe), qui détermine le motif de façon UNIQUE sur 5 cartes :
       2 groupes / max 4 → "41"      3 groupes / max 3 → "311"
       2 groupes / max 3 → "32"      3 groupes / max 2 → "221"
       4 groupes         → "2111"    5 groupes         → "11111"
   `test-solver-evaluator-identity.mjs` vérifie l'égalité avec l'implémentation
   d'origine sur les 2 598 960 mains de 5 cartes possibles — l'exhaustivité,
   pas un échantillon.

   TAMPONS PARTAGÉS : ces fonctions sont pures, synchrones et non réentrantes
   (aucun appel imbriqué, aucun await). Des tampons au niveau module sont donc
   sûrs, et suppriment l'essentiel des allocations et du travail du GC.
════════════════════════════════════════════════════════════════════════════ */
const _cnt = new Int32Array(15);   // occurrences par rang (index 2..14)
const _r   = new Int32Array(5);    // rangs, décroissant
const _u   = new Int32Array(5);    // rangs DISTINCTS, décroissant
const _tb  = new Int32Array(5);    // tiebreaks (rangs des groupes)

/* Évaluateur 5 cartes → score entier comparable (catégorie + tiebreaks). */
export function eval5i(cs){
  const c0=cs[0],c1=cs[1],c2=cs[2],c3=cs[3],c4=cs[4];
  const su=c0&3;
  const flush=((c1&3)===su)&&((c2&3)===su)&&((c3&3)===su)&&((c4&3)===su);
  _cnt[2]=0;_cnt[3]=0;_cnt[4]=0;_cnt[5]=0;_cnt[6]=0;_cnt[7]=0;_cnt[8]=0;
  _cnt[9]=0;_cnt[10]=0;_cnt[11]=0;_cnt[12]=0;_cnt[13]=0;_cnt[14]=0;
  _cnt[(c0>>2)+2]++;_cnt[(c1>>2)+2]++;_cnt[(c2>>2)+2]++;_cnt[(c3>>2)+2]++;_cnt[(c4>>2)+2]++;
  /* Un seul parcours 14→2 produit à la fois `r` (rangs décroissants) et `u`
     (rangs distincts décroissants) — exactement ce que donnaient `sort` puis
     `new Set` sur un tableau déjà décroissant. */
  let n=0,nu=0,maxCnt=0;
  for(let v=14;v>=2;v--){
    const k=_cnt[v];
    if(k===0)continue;
    if(k>maxCnt)maxCnt=k;
    _u[nu++]=v;
    for(let i=0;i<k;i++)_r[n++]=v;
  }
  let sh=0;
  if(nu===5){
    if(_u[0]-_u[4]===4)sh=_u[0];
    else if(_u[0]===14&&_u[1]===5&&_u[4]===2)sh=5;   // wheel A2345
  }
  /* Groupes triés par (taille décroissante, puis rang décroissant) — obtenu par
     construction, sans comparateur ni allocation. */
  let ng=0;
  for(let k=maxCnt;k>=1;k--)for(let t=0;t<nu;t++){const v=_u[t];if(_cnt[v]===k)_tb[ng++]=v;}

  let cat;
  if(sh&&flush)cat=8;
  else if(ng===2&&maxCnt===4)cat=7;        // "41"
  else if(ng===2&&maxCnt===3)cat=6;        // "32"
  else if(flush)cat=5;
  else if(sh)cat=4;
  else if(ng===3&&maxCnt===3)cat=3;        // "311"
  else if(ng===3&&maxCnt===2)cat=2;        // "221"
  else if(ng===4)cat=1;                    // "2111"
  else cat=0;

  let score=cat;
  if(cat===8||cat===4){                    // tb = [sh] puis quatre zéros
    score=(score*15+sh)*50625;             // 50625 = 15^4
  }else if(cat===5||cat===0){              // tb = les cinq rangs
    for(let i=0;i<5;i++)score=score*15+_r[i];
  }else{                                   // tb = rangs des groupes, puis zéros
    for(let i=0;i<5;i++)score=score*15+(i<ng?_tb[i]:0);
  }
  return score;
}
/* Meilleure main de 5 parmi 7 (21 combinaisons). */
const _five7=[0,0,0,0,0];
export function eval7i(cards){
  let best=-1;
  for(let a=0;a<7;a++)for(let b=a+1;b<7;b++){
    let n=0;
    for(let k=0;k<7;k++)if(k!==a&&k!==b)_five7[n++]=cards[k];
    const s=eval5i(_five7);
    if(s>best)best=s;
  }
  return best;
}

/* ══════════════════════════════════════════════════════════════════════════
   evalBestI — MEILLEURE MAIN DE 5 PARMI 5, 6 OU 7 CARTES (abstraction unique)

   POURQUOI CETTE FONCTION EXISTE
   `eval7i` boucle sur les indices 0..6 et retire deux cartes. Appelée avec 5
   cartes (flop) ou 6 (turn), les indices manquants valent `undefined` ; or
   `undefined>>2 === 0` et `undefined&3 === 0` : CHAQUE CARTE ABSENTE DEVIENT
   UN 2♠. Le Vilain du Full Hand évaluait ainsi sa main plus deux 2 de pique
   imaginaires — 95,7 % des flops et 39,8 % des turns mesurés étaient faussés,
   avec des couleurs à pique et des paires de 2 qui n'existent pas.

   La règle est donc : une seule porte d'entrée, qui REFUSE explicitement toute
   longueur invalide au lieu de la tolérer. Un board incomplet est un bug
   d'appelant, pas une main plus faible.
   ══════════════════════════════════════════════════════════════════════════ */
export const EVAL_MIN_CARDS = 5;
export const EVAL_MAX_CARDS = 7;

export function evalBestI(cards){
  if(!Array.isArray(cards))throw new TypeError("evalBestI : tableau de cartes attendu");
  const n=cards.length;
  if(n<EVAL_MIN_CARDS||n>EVAL_MAX_CARDS)
    throw new RangeError(`evalBestI : ${n} carte(s) — seules 5, 6 ou 7 sont évaluables`);
  for(let i=0;i<n;i++){
    const c=cards[i];
    if(!Number.isInteger(c)||c<0||c>51)
      throw new RangeError(`evalBestI : carte ${i} invalide (${String(c)}) — entier 0..51 attendu`);
  }
  if(n===5)return eval5i(cards);
  if(n===7)return eval7i(cards);
  /* 6 cartes : meilleure des 6 combinaisons de 5. */
  let best=-1;
  for(let skip=0;skip<n;skip++){
    const five=[];
    for(let k=0;k<n;k++)if(k!==skip)five.push(cards[k]);
    const s=eval5i(five);
    if(s>best)best=s;
  }
  return best;
}

/* Catégorie de main (0 = hauteur … 8 = quinte flush) déduite d'un score. */
export const HAND_CATEGORY_COUNT = 9;
export function handCategoryOf(score){
  if(!Number.isFinite(score)||score<0)return -1;
  return Math.floor(score/Math.pow(15,5));
}
