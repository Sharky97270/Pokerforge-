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

   ── v3 · EXTENSION PFASE (Adaptive Sizing, mission §6/§10/§74) ─────────────
   ADDITIVE ET OPTIONNELLE. Sans les nouvelles options, l'arbre produit est
   IDENTIQUE — mêmes montants, mêmes labels, mêmes ids — à la v2. C'est vérifié
   par `test-sizing-gametree.mjs` (comparaison structurelle v2/v3).

   Nouvelles options (aucune n'a de défaut actif) :
     betSizes[]           accepte désormais des SizingSpec typés en plus des
                          nombres (un nombre reste une fraction de pot) ;
     betSizesByPlayer     {0:[...],1:[...]} — sizings ASYMÉTRIQUES. Nécessaire
                          pour prouver la monotonie de la perte d'EV : restreindre
                          UN seul joueur ne peut que baisser SON EV (§10) ;
     raiseSizes[]         plusieurs sizings de relance (le `raiseMult` scalaire
                          historique reste le défaut, inchangé) ;
     allowJam             ajoute une action all-in EXPLICITE `J` (§74) — un jam
                          n'est pas « 999% du pot », son montant vient du tapis ;
     minBet, bb           plancher légal et unité, pour les specs `bb` et pour la
                          légalité des relances du chemin adaptatif.

   Labels : inchangés tant qu'on n'active rien (`B`, `B0`…, `R`). Le chemin
   adaptatif ajoute `R0`,`R1`… (plusieurs relances) et `J` (jam explicite).
════════════════════════════════════════════════════════════════════════════ */

import { resolveSizing, toSizingSpec, jamSizing, SizingType } from "../../sizing/sizingSpec.js";

export const HERO=0, VILL=1;   // Hero = OOP (parle en premier chaque street)

/* Précision des montants du chemin adaptatif. Volontairement plus fine que la
   politique d'affichage (3 décimales) : l'arbre est une structure de calcul, et
   un arrondi grossier ici se propagerait dans toutes les EV. `betStepBb:0` =
   aucune quantification au pas de mise — c'est le Trainer, pas le solveur, qui
   impose un pas de 0.5bb. */
const ADAPTIVE_ROUNDING=Object.freeze({amountDecimals:6,fractionDecimals:6,evDecimals:6,betStepBb:0});

let _id=0;
const mk=(o)=>({id:_id++,...o});
const EPS=1e-9;

/* Le chemin adaptatif n'est emprunté QUE si l'appelant l'a explicitement
   demandé. Un tableau de nombres nus + `raiseMult` = chemin v2 historique. */
function usesAdaptiveSizing(opts,betSizes){
  if(opts.betSizesByPlayer)return true;
  if(opts.raiseSizesByPlayer)return true;
  if(Array.isArray(opts.raiseSizes)&&opts.raiseSizes.length)return true;
  if(opts.allowJam)return true;
  return (betSizes||[]).some(x=>x&&typeof x==="object");
}

/* Construit l'arbre de mises postflop. streets = nb de rues restantes (1..3). */
export function buildPostflopTree(opts={}){
  const {startPot=6,streets=3,ipProbe=true,raiseMult=3,maxRaisesPerStreet=1,effStack=Infinity}=opts;
  // Rétro-compat : betFrac (1 sizing) → betSizes=[betFrac].
  const betSizes=opts.betSizes||(opts.betFrac?[opts.betFrac]:[0.66]);
  const adaptive=usesAdaptiveSizing(opts,betSizes);
  /* Paramètres du chemin adaptatif seulement — sans effet en v2. */
  const bbUnit=Number(opts.bb)>0?Number(opts.bb):1;
  const minBet=Number(opts.minBet)>0?Number(opts.minBet):0;
  const allowJam=!!opts.allowJam;
  const specsFor=(player)=>{
    const list=(opts.betSizesByPlayer&&opts.betSizesByPlayer[player])||betSizes;
    const out=(list||[]).map(toSizingSpec).filter(Boolean);
    if(allowJam&&!out.some(s=>s.type===SizingType.JAM))out.push(jamSizing());
    return out;
  };
  /* Relances PAR JOUEUR — même raison que `betSizesByPlayer` : restreindre les
     options d'UN SEUL camp est ce qui rend la perte d'EV mathématiquement
     garantie ≥ 0 (cf. ALGORITHM.md § « Définition de la perte d'EV »). */
  const rawRaiseFor=(player)=>(opts.raiseSizesByPlayer&&opts.raiseSizesByPlayer[player])||opts.raiseSizes||[];
  const raiseSpecsFor=(player)=>{
    const out=(Array.isArray(rawRaiseFor(player))?rawRaiseFor(player):[]).map(toSizingSpec).filter(Boolean);
    if(allowJam&&out.length&&!out.some(s=>s.type===SizingType.JAM))out.push(jamSizing());
    return out;
  };
  const anyRaiseSpecs=(Array.isArray(opts.raiseSizes)&&opts.raiseSizes.length)||!!opts.raiseSizesByPlayer;
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
  /* Sizings jouables pour un joueur ayant déjà investi `bets` (écrêtés, dédupliqués).
     `base` = investissement commun au DÉBUT de la street (les deux camps sont à
     égalité quand une street s'ouvre : une street se termine toujours par un
     check-check ou un call). `bets - base` est donc l'engagement de street, la
     grandeur dont les specs ont besoin. En v2 elle valait toujours 0 ici, ce qui
     explique qu'elle n'était pas suivie. */
  function betActionsFor(pot,bets,player,street,base){
    const rem=remain(bets);
    if(rem<=EPS)return[];
    const out=[];const seen=new Set();
    if(!adaptive){
      betSizes.forEach((f,k)=>{
        const amt=Math.min(f*pot,rem);
        const key=Math.round(amt*1000);
        if(amt<=EPS||seen.has(key))return;
        seen.add(key);
        out.push({label:betSizes.length===1?"B":"B"+k,amt,allIn:amt>=rem-EPS});
      });
      return out;
    }
    /* ── Chemin adaptatif : chaque spec est résolu dans le contexte du nœud. Un
       sizing géométrique dépend du SPR local, donc du pot ET du tapis restant
       ICI — c'est précisément ce qu'une constante ne peut pas exprimer. ── */
    const specs=specsFor(player);
    const ctx={
      pot,effectiveRemaining:rem,alreadyCommitted:0,facingLevel:0,
      minIncrement:minBet,bb:bbUnit,streetsRemaining:Math.max(1,streets-street),
    };
    specs.forEach((spec,k)=>{
      const r=resolveSizing(spec,ctx,ADAPTIVE_ROUNDING);
      if(!r)return;
      const amt=Math.min(r.additionalChips,rem);
      const key=Math.round(amt*1000);
      if(amt<=EPS||seen.has(key))return;
      seen.add(key);
      const label=spec.type===SizingType.JAM?"J":(specs.length===1?"B":"B"+k);
      out.push({label,amt,allIn:amt>=rem-EPS,spec,resolved:r});
    });
    return out;
  }
  // OOP ouvre la street : X (check) ou B (bet, par sizing).
  function buildStreet(street,pot,betsH,betsV){
    const base=Math.min(betsH,betsV);
    const node=mk({kind:"decision",player:HERO,street,pot,betsH,betsV,actions:["X"],children:{}});
    node.children.X=ipAfterCheck(street,pot,betsH,betsV);
    for(const b of betActionsFor(pot,betsH,HERO,street,base)){
      node.actions.push(b.label);
      if(b.spec)(node.sizingSpecs||(node.sizingSpecs={}))[b.label]=b.spec;
      node.children[b.label]=facingBet(street,pot+b.amt,betsH+b.amt,betsV,b.amt,VILL,0,b.allIn,base,b.amt);
    }
    return node;
  }
  // IP après un check du Hero : X (street finie) ou B (probe, par sizing).
  function ipAfterCheck(street,pot,betsH,betsV){
    if(!ipProbe) return advance(street,pot,betsH,betsV,false);
    const base=Math.min(betsH,betsV);
    const node=mk({kind:"decision",player:VILL,street,pot,betsH,betsV,actions:["X"],children:{}});
    node.children.X=advance(street,pot,betsH,betsV,false);
    for(const b of betActionsFor(pot,betsV,VILL,street,base)){
      node.actions.push(b.label);
      if(b.spec)(node.sizingSpecs||(node.sizingSpecs={}))[b.label]=b.spec;
      node.children[b.label]=facingBet(street,pot+b.amt,betsH,betsV+b.amt,b.amt,HERO,0,b.allIn,base,b.amt);
    }
    return node;
  }
  /* `who` face à une mise : F (fold) / C (call → street finie ou all-in) /
     R (raise = raiseMult × la mise, écrêté au stack → possible all-in).
     `base` et `lastIncrement` ne servent QUE au chemin adaptatif (légalité de la
     relance minimale et résolution des specs) — ils sont ignorés en v2. */
  function facingBet(street,pot,betsH,betsV,toCall,who,nRaises,aggAllIn,base=0,lastIncrement=0){
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
      const myRaiseSpecs=adaptive&&anyRaiseSpecs?raiseSpecsFor(who):[];
      if(!adaptive||!myRaiseSpecs.length){
        const raiseAmt=Math.min(raiseMult*toCall,remain(myBets));
        if(raiseAmt>toCall+EPS){
          const rBetsH=who===HERO?betsH+raiseAmt:betsH;
          const rBetsV=who===VILL?betsV+raiseAmt:betsV;
          const raiseAllIn=raiseAmt>=remain(myBets)-EPS;
          node.actions.push("R");
          node.children.R=facingBet(street,pot+raiseAmt,rBetsH,rBetsV,raiseAmt-toCall,who===HERO?VILL:HERO,nRaises+1,raiseAllIn,base,raiseAmt-toCall);
        }
      }else{
        /* ── Relances typées (§6 · multiple de la mise précédente, pot %,
           géométrique, jam). Contrairement au chemin v2, la LÉGALITÉ de la
           relance minimale est ici vérifiée : une relance doit dépasser le
           niveau affronté d'au moins l'incrément précédent, sinon elle n'existe
           pas (le tapis reste possible). ── */
        const myStreet=Math.max(0,myBets-base);
        const facingLevel=myStreet+toCall;
        const rem=remain(myBets);
        const ctx={
          pot,effectiveRemaining:rem,alreadyCommitted:myStreet,facingLevel,
          minIncrement:Math.max(minBet,lastIncrement||toCall),
          bb:bbUnit,streetsRemaining:Math.max(1,streets-street),
        };
        const seen=new Set();
        myRaiseSpecs.forEach((spec,k)=>{
          const r=resolveSizing(spec,ctx,ADAPTIVE_ROUNDING);
          if(!r)return;
          const raiseAmt=Math.min(r.additionalChips,rem);
          const raiseAllIn=raiseAmt>=rem-EPS;
          // Une « relance » qui n'ajoute rien au-delà du call n'est pas une relance.
          if(raiseAmt<=toCall+EPS)return;
          // Hors all-in, la relance doit être légale.
          if(!raiseAllIn&&myStreet+raiseAmt<facingLevel+ctx.minIncrement-1e-6)return;
          const key=Math.round(raiseAmt*1000);
          if(seen.has(key))return;
          seen.add(key);
          const label=spec.type===SizingType.JAM?"J":(myRaiseSpecs.length===1?"R":"R"+k);
          const rBetsH=who===HERO?betsH+raiseAmt:betsH;
          const rBetsV=who===VILL?betsV+raiseAmt:betsV;
          node.actions.push(label);
          (node.sizingSpecs||(node.sizingSpecs={}))[label]=spec;
          node.children[label]=facingBet(street,pot+raiseAmt,rBetsH,rBetsV,raiseAmt-toCall,who===HERO?VILL:HERO,nRaises+1,raiseAllIn,base,raiseAmt-toCall);
        });
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
