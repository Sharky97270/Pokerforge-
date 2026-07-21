/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · GAME TREE ENGINE v2 (§12)
   Arbre de jeu générique postflop heads-up — FONDATION du solveur multi-rue (§26).
   Nœuds : décision (player), chance (distribution d'une carte de street), terminal
   (fold / showdown).

   Modèle de mises v2 :
   · plusieurs sizings de bet (betSizes, fractions du pot) ;
   · raise (montant = raiseMult × la mise affrontée), plafonné à
     maxRaisesPerStreet par rue ;
   · ALL-IN : toute mise/raise est écrêtée au stack effectif restant ; une fois
     les tapis engagés, plus aucune décision — l'arbre file au showdown à travers
     les nœuds chance restants.
   Hypothèse V2 : stacks SYMÉTRIQUES (effStack identique) → jamais de side-pot
   (le suiveur peut toujours couvrir). Documenté comme limite.

   Comptabilité ChipEV, perspective Hero (=OOP=joueur 0), base P/2 → zéro-somme :
     showdown gagné : +(P/2 + betsV) · perdu : −(P/2 + betsH) · nul : (betsV−betsH)/2
     villain fold   : +(P/2 + betsV) · hero fold : −(P/2 + betsH)
   où P = pot initial (postflop), betsH/betsV = mises engagées dans le sous-jeu.
════════════════════════════════════════════════════════════════════════════ */

export const HERO=0, VILL=1;   // Hero = OOP (parle en premier chaque street)

let _id=0;
const mk=(o)=>({id:_id++,...o});
const EPS=1e-9;

/* Construit l'arbre de mises postflop. streets = nb de rues restantes (1..3). */
export function buildPostflopTree(opts={}){
  const {startPot=6,streets=3,ipProbe=true,raiseMult=3,maxRaisesPerStreet=1,effStack=Infinity}=opts;
  // Rétro-compat : betFrac (1 sizing) → betSizes=[betFrac].
  const betSizes=opts.betSizes||(opts.betFrac?[opts.betFrac]:[0.66]);
  _id=0;
  const lastStreet=streets-1;
  const remain=(bets)=>Math.max(0,effStack-bets);

  // Fin de street → chance vers la suivante (ou showdown). allIn : plus de décisions.
  function advance(street,pot,betsH,betsV,allIn){
    if(street>=lastStreet) return mk({kind:"terminal",result:"showdown",street,pot,betsH,betsV});
    return mk({kind:"chance",street,pot,betsH,betsV,
      next:allIn?advance(street+1,pot,betsH,betsV,true)
                :buildStreet(street+1,pot,betsH,betsV)});
  }
  // Sizings jouables pour un joueur ayant déjà investi `bets` (écrêtés, dédupliqués).
  function betActionsFor(pot,bets){
    const rem=remain(bets);
    if(rem<=EPS)return[];
    const out=[];const seen=new Set();
    betSizes.forEach((f,k)=>{
      const amt=Math.min(f*pot,rem);
      const key=Math.round(amt*1000);
      if(amt<=EPS||seen.has(key))return;
      seen.add(key);
      out.push({label:betSizes.length===1?"B":"B"+k,amt,allIn:amt>=rem-EPS});
    });
    return out;
  }
  // OOP ouvre la street : X (check) ou B (bet, par sizing).
  function buildStreet(street,pot,betsH,betsV){
    const node=mk({kind:"decision",player:HERO,street,pot,betsH,betsV,actions:["X"],children:{}});
    node.children.X=ipAfterCheck(street,pot,betsH,betsV);
    for(const b of betActionsFor(pot,betsH)){
      node.actions.push(b.label);
      node.children[b.label]=facingBet(street,pot+b.amt,betsH+b.amt,betsV,b.amt,VILL,0,b.allIn);
    }
    return node;
  }
  // IP après un check du Hero : X (street finie) ou B (probe, par sizing).
  function ipAfterCheck(street,pot,betsH,betsV){
    if(!ipProbe) return advance(street,pot,betsH,betsV,false);
    const node=mk({kind:"decision",player:VILL,street,pot,betsH,betsV,actions:["X"],children:{}});
    node.children.X=advance(street,pot,betsH,betsV,false);
    for(const b of betActionsFor(pot,betsV)){
      node.actions.push(b.label);
      node.children[b.label]=facingBet(street,pot+b.amt,betsH,betsV+b.amt,b.amt,HERO,0,b.allIn);
    }
    return node;
  }
  /* `who` face à une mise : F (fold) / C (call → street finie ou all-in) /
     R (raise = raiseMult × la mise, écrêté au stack → possible all-in). */
  function facingBet(street,pot,betsH,betsV,toCall,who,nRaises,aggAllIn){
    const myBets=who===HERO?betsH:betsV;
    const node=mk({kind:"decision",player:who,street,pot,betsH,betsV,toCall,actions:["F","C"],children:{}});
    node.children.F=mk({kind:"terminal",result:who===HERO?"foldH":"foldV",street,pot,betsH,betsV});
    // Call — stacks symétriques : le suiveur couvre toujours (pas de side-pot).
    const cBetsH=who===HERO?betsH+toCall:betsH;
    const cBetsV=who===VILL?betsV+toCall:betsV;
    const callerAllIn=remain(who===HERO?cBetsH:cBetsV)<=EPS;
    node.children.C=advance(street,pot+toCall,cBetsH,cBetsV,aggAllIn||callerAllIn);
    // Raise — si le plafond de raises n'est pas atteint et que l'agresseur n'est pas all-in.
    if(nRaises<maxRaisesPerStreet&&!aggAllIn){
      const raiseAmt=Math.min(raiseMult*toCall,remain(myBets));
      if(raiseAmt>toCall+EPS){
        const rBetsH=who===HERO?betsH+raiseAmt:betsH;
        const rBetsV=who===VILL?betsV+raiseAmt:betsV;
        const raiseAllIn=raiseAmt>=remain(myBets)-EPS;
        node.actions.push("R");
        node.children.R=facingBet(street,pot+raiseAmt,rBetsH,rBetsV,raiseAmt-toCall,who===HERO?VILL:HERO,nRaises+1,raiseAllIn);
      }
    }
    return node;
  }

  return buildStreet(0,startPot,0,0);
}

/* Utilité terminale, perspective Hero (ChipEV, base P/2 → zéro-somme).
   `sd` = résultat du showdown côté Hero (1 gagne, 0 perd, 0.5 nul) — ignoré hors showdown. */
export function terminalUtility(node,startPot,sd){
  const P2=startPot/2;
  if(node.result==="foldV") return  (P2+node.betsV);   // villain se couche → Hero gagne
  if(node.result==="foldH") return -(P2+node.betsH);   // Hero se couche → Hero perd
  // showdown
  if(sd>=1)   return  (P2+node.betsV);
  if(sd<=0)   return -(P2+node.betsH);
  return (node.betsV-node.betsH)/2;                     // nul → split
}

/* Statistiques d'arbre (tests / debug). */
export function treeStats(root){
  let decision=0,chance=0,terminal=0,maxDepth=0;
  (function walk(n,d){
    maxDepth=Math.max(maxDepth,d);
    if(n.kind==="decision"){decision++;for(const a of n.actions)walk(n.children[a],d+1);}
    else if(n.kind==="chance"){chance++;walk(n.next,d+1);}
    else terminal++;
  })(root,0);
  return {decision,chance,terminal,maxDepth,total:decision+chance+terminal};
}

/* Actions légales d'un nœud de décision. */
export function legalActions(node){ return node.kind==="decision"?node.actions.slice():[]; }
