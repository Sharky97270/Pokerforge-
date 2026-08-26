/* ══════════════════════════════════════════════════════════════════════════
   IDENTITÉ DE L'ÉVALUATEUR — la réécriture P0 ne change AUCUN score

   Une optimisation de performance sur l'évaluateur de mains n'a de valeur que
   si elle est numériquement neutre : tout le solveur (équité, CFR, multi-rue,
   Full Hand) compare des scores produits ici. Ce test embarque l'implémentation
   D'ORIGINE — telle qu'elle était avant la réécriture — comme ORACLE, et
   compare les deux sur l'ENSEMBLE des mains possibles, pas sur un échantillon :

     · eval5i : les 2 598 960 combinaisons de 5 cartes parmi 52 — exhaustif ;
     · eval7i : 300 000 mains de 7 cartes tirées de façon déterministe, plus les
       familles limites (quinte flush royale, wheel, quads, full, couleur).

   Si ce test échoue, la réécriture a modifié le classement des mains : il faut
   revenir en arrière, pas ajuster la tolérance. Il n'y a pas de tolérance ici —
   l'égalité est stricte.
════════════════════════════════════════════════════════════════════════════ */
import { eval5i, eval7i } from "./src/solver/core/evaluator.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; }
  else { fail++; console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
};

/* ── ORACLE : l'implémentation exacte d'avant la réécriture ───────────────── */
function eval5i_original(cs){
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
function eval7i_original(cards){
  let best=-1;
  for(let a=0;a<7;a++)for(let b=a+1;b<7;b++){
    const five=[];
    for(let k=0;k<7;k++)if(k!==a&&k!==b)five.push(cards[k]);
    const s=eval5i_original(five);
    if(s>best)best=s;
  }
  return best;
}

console.log("── ÉVALUATEUR : identité stricte avec l'implémentation d'origine ──\n");

/* ── 1. eval5i EXHAUSTIF : C(52,5) = 2 598 960 mains ──────────────────────── */
{
  let n = 0, diffs = 0, firstDiff = null;
  const h = [0,0,0,0,0];
  for (h[0]=0; h[0]<52; h[0]++)
  for (h[1]=h[0]+1; h[1]<52; h[1]++)
  for (h[2]=h[1]+1; h[2]<52; h[2]++)
  for (h[3]=h[2]+1; h[3]<52; h[3]++)
  for (h[4]=h[3]+1; h[4]<52; h[4]++) {
    n++;
    const a = eval5i(h), b = eval5i_original(h);
    if (a !== b) { diffs++; if (!firstDiff) firstDiff = h.slice().join(",") + " → " + a + " ≠ " + b; }
  }
  ok("eval5i : les 2 598 960 mains de 5 cartes sont énumérées", n === 2598960, "n=" + n);
  ok("eval5i : score IDENTIQUE sur les 2 598 960 mains", diffs === 0, diffs + " écart(s), 1er : " + firstDiff);
}

/* ── 2. eval7i : 300 000 mains de 7 cartes, tirage déterministe ───────────── */
{
  const mul=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const rng = mul(0xC0FFEE);
  const used = new Uint8Array(52);
  let diffs = 0, firstDiff = null, n = 0;
  for (let it = 0; it < 300000; it++) {
    used.fill(0);
    const c = [];
    while (c.length < 7) { const x = (rng()*52)|0; if (!used[x]) { used[x]=1; c.push(x); } }
    n++;
    const a = eval7i(c), b = eval7i_original(c);
    if (a !== b) { diffs++; if (!firstDiff) firstDiff = c.join(",") + " → " + a + " ≠ " + b; }
  }
  ok("eval7i : 300 000 mains de 7 cartes évaluées", n === 300000);
  ok("eval7i : score IDENTIQUE sur les 300 000 mains", diffs === 0, diffs + " écart(s), 1er : " + firstDiff);
}

/* ── 3. Familles limites, nommées ─────────────────────────────────────────── */
{
  const C = (rank, suit) => "23456789TJQKA".indexOf(rank) * 4 + suit;
  const cas = {
    "quinte flush royale": [C("A",0),C("K",0),C("Q",0),C("J",0),C("T",0)],
    "quinte flush basse (wheel flush)": [C("A",1),C("2",1),C("3",1),C("4",1),C("5",1)],
    "carré + kicker": [C("9",0),C("9",1),C("9",2),C("9",3),C("A",0)],
    "full 3+2": [C("7",0),C("7",1),C("7",2),C("K",0),C("K",1)],
    "couleur": [C("A",2),C("J",2),C("8",2),C("5",2),C("3",2)],
    "quinte A-high": [C("A",0),C("K",1),C("Q",2),C("J",3),C("T",0)],
    "wheel A2345": [C("A",0),C("2",1),C("3",2),C("4",3),C("5",0)],
    "brelan": [C("4",0),C("4",1),C("4",2),C("K",0),C("2",1)],
    "double paire": [C("Q",0),C("Q",1),C("5",2),C("5",3),C("9",0)],
    "paire": [C("T",0),C("T",1),C("A",2),C("7",3),C("2",0)],
    "hauteur": [C("A",0),C("Q",1),C("9",2),C("6",3),C("3",0)],
  };
  for (const [nom, main] of Object.entries(cas))
    ok("limite « " + nom + " »", eval5i(main) === eval5i_original(main),
      eval5i(main) + " ≠ " + eval5i_original(main));
  /* Ordre des catégories : la hiérarchie du poker doit tenir. */
  const s = n => eval5i(cas[n]);
  ok("hiérarchie : royale > wheel flush > carré > full > couleur",
    s("quinte flush royale") > s("quinte flush basse (wheel flush)")
    && s("quinte flush basse (wheel flush)") > s("carré + kicker")
    && s("carré + kicker") > s("full 3+2") && s("full 3+2") > s("couleur"));
  ok("hiérarchie : couleur > quinte > brelan > 2 paires > paire > hauteur",
    s("couleur") > s("quinte A-high") && s("quinte A-high") > s("brelan")
    && s("brelan") > s("double paire") && s("double paire") > s("paire")
    && s("paire") > s("hauteur"));
  ok("wheel A2345 < quinte A-high", s("wheel A2345") < s("quinte A-high"));
}

/* ── 4. Non-réentrance : les tampons partagés ne se contaminent pas ───────── */
{
  /* eval7i réutilise un tampon de 5 cartes ; deux appels enchaînés, et un appel
     à eval5i intercalé, doivent donner exactement les mêmes scores qu'isolés. */
  const A = [0,5,10,15,20,25,30], B = [51,48,44,40,36,32,28];
  const a1 = eval7i(A), b1 = eval7i(B);
  eval5i([1,2,3,4,5]);
  const a2 = eval7i(A), b2 = eval7i(B);
  ok("tampons partagés : appels enchaînés stables", a1 === a2 && b1 === b2);
  ok("tampons partagés : eval5i intercalé n'altère pas eval7i", a2 === eval7i_original(A) && b2 === eval7i_original(B));
}

console.log("\n" + (fail === 0 ? "✅" : "❌") + "  " + pass + " assertion(s) OK, " + fail + " échec(s)");
process.exit(fail === 0 ? 0 : 1);
