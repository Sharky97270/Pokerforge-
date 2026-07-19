/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER CORE · GAME TREE ENGINE (§12)
   Arbre de jeu générique postflop heads-up — FONDATION du solveur multi-rue (§26).
   Nœuds : décision (player), chance (distribution d'une carte de street), terminal
   (fold / showdown). Modèle de mises V1 : check / bet (1 sizing) / fold / call,
   SANS raise, pour borner l'arbre (le raise viendra ensuite). Deep-stack (pas de
   plafond all-in en V1 — noté comme limite).

   Le CFR multi-rue (§26) marchera cet arbre avec échantillonnage des cartes turn/
   river (les cartes ne sont PAS dans la structure : fournies au solve).

   Comptabilité ChipEV, perspective Hero (=OOP=joueur 0), base P/2 → zéro-somme :
     showdown gagné : +(P/2 + betsV) · perdu : −(P/2 + betsH) · nul : (betsV−betsH)/2
     villain fold   : +(P/2 + betsV) · hero fold : −(P/2 + betsH)
   où P = pot initial (postflop), betsH/betsV = mises engagées dans le sous-jeu.
════════════════════════════════════════════════════════════════════════════ */

export const HERO=0, VILL=1;   // Hero = OOP (parle en premier chaque street)

let _id=0;
const mk=(o)=>({id:_id++,...o});

/* Construit l'arbre de mises postflop. streets = nb de rues restantes (1..3).
   betFrac = fraction du pot pour toute mise. startPot = pot initial P. */
export function buildPostflopTree({betFrac=0.66,startPot=6,streets=3,ipProbe=true}={}){
  _id=0;
  const lastStreet=streets-1;
  // ipProbe=false : l'IP ne peut que checker derrière (pas de donk/probe après un
  // check du Hero) — utile pour le jeu de clairvoyance (solution analytique).

  // Fin de la street (mise suivie ou double check) → chance vers la suivante, ou showdown.
  function advance(street,pot,betsH,betsV){
    if(street>=lastStreet) return mk({kind:"terminal",result:"showdown",street,pot,betsH,betsV});
    // nœud chance : distribue la carte de la street suivante (résolue au solve)
    return mk({kind:"chance",street,pot,betsH,betsV,
      next:buildStreet(street+1,pot,betsH,betsV)});
  }
  // OOP fait tapis de parole : X (check) ou B (bet). betsH/betsV = mises déjà engagées.
  function buildStreet(street,pot,betsH,betsV){
    const bet=betFrac*pot;
    const node=mk({kind:"decision",player:HERO,street,pot,betsH,betsV,actions:["X","B"],children:{}});
    // Hero check → IP agit
    node.children.X=ipAfterCheck(street,pot,betsH,betsV);
    // Hero bet → pot/mises MAJ, IP face à la mise
    node.children.B=ipFacingBet(street,pot+bet,betsH+bet,betsV,bet,HERO);
    return node;
  }
  // IP après un check du Hero : X (check → street finie) ou B (bet → Hero face à la mise)
  function ipAfterCheck(street,pot,betsH,betsV){
    if(!ipProbe) return advance(street,pot,betsH,betsV);   // IP check-back forcé
    const bet=betFrac*pot;
    const node=mk({kind:"decision",player:VILL,street,pot,betsH,betsV,actions:["X","B"],children:{}});
    node.children.X=advance(street,pot,betsH,betsV);                         // check-check
    node.children.B=heroFacingBet(street,pot+bet,betsH,betsV+bet,bet);       // IP bet → Hero répond
    return node;
  }
  // IP face à une mise du Hero : F (fold → Hero gagne) ou C (call → street finie)
  function ipFacingBet(street,pot,betsH,betsV,bet,bettor){
    const node=mk({kind:"decision",player:VILL,street,pot,betsH,betsV,actions:["F","C"],children:{}});
    node.children.F=mk({kind:"terminal",result:"foldV",street,pot,betsH,betsV});   // villain fold → hero gagne
    node.children.C=advance(street,pot,betsH+0,betsV+bet);                          // call → pot+=bet côté V
    return node;
  }
  // Hero face à une mise de l'IP : F (fold → Hero perd) ou C (call → street finie)
  function heroFacingBet(street,pot,betsH,betsV,bet){
    const node=mk({kind:"decision",player:HERO,street,pot,betsH,betsV,actions:["F","C"],children:{}});
    node.children.F=mk({kind:"terminal",result:"foldH",street,pot,betsH,betsV});    // hero fold → hero perd
    node.children.C=advance(street,pot,betsH+bet,betsV);                            // call → pot+=bet côté H
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
