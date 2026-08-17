/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : MOTEUR HEURISTIQUE DE SCÉNARIO

   « Analyse estimée » — la référence stratégique de repli, quand aucun solveur
   n'a de solution exacte pour le spot. Ses valeurs sont des ESTIMATIONS et
   voyagent toujours sous la provenance POKERFORGE_HEURISTIC : jamais
   présentées comme des fréquences GTO.

   Ce moteur vivait dans ReplayerTab.jsx, donc hors de portée des tests Node
   (le JSX n'est pas exécutable tel quel). Or c'est exactement lui qui produisait
   le « Open 2.1bb — 62 % » à une big blind confrontée à un open : le bug
   n'était pas testable là où il vivait. Il est désormais PUR et testé.

   Le nœud joué (ouverture / 3-bet / check-raise…) est fourni par le contexte de
   mise (pokerState.buildBettingContext) : le moteur ne le devine plus depuis
   le libellé de la dernière action.
═══════════════════════════════════════════════════════════════ */
import { buildSolverFreqs } from "../solver/preflopRanges.js";
import { computeSnapshot } from "./stateEngine.js";
import { SEM, semFr, buildBettingContext } from "./pokerState.js";
import { handNotation } from "../trainerStrategyProvider.js";

const rb = v => Math.round(v * 100) / 100;

export const SOLVER_VPROFILES=[
  {id:"Nit",adj:{fold:+2,bluff:-1,value:-1}},{id:"Fish",adj:{fold:-2,bluff:-2,value:+2}},
  {id:"TAG",adj:{fold:0,bluff:0,value:0}},{id:"LAG",adj:{fold:-1,bluff:+1,value:0}},
  {id:"Reg",adj:{fold:0,bluff:0,value:0}},{id:"Maniac",adj:{fold:-2,bluff:+2,value:+1}},
];
export const RSOLV_MODES=[["gto","GTO"],["exploit","Exploit"],["icm","ICM"],["chipev","ChipEV"]];
export const RSOLV_FORMATS=["Cash","MTT","KO","PKO"];
export const SOLVER_POS=["UTG","HJ","CO","BTN","SB","BB"];
/* Board "A♥ K♦ 7♣" ou "Ah Kd 7c" → [{r,s}]. Local et tolérant : `parseBoardToken`
   (SharkSolver) n'était pas importé ici ET renvoie {valid,cards:[ints]}, pas un
   tableau — d'où un comptage toujours nul (« board incomplet ») en postflop. */
export function ceParseBoardCards(str){
  const m=String(str||"").replace(/10/g,"T").match(/[2-9TJQKAtjqka][shdc♠♥♦♣]/g)||[];
  return m.map(tok=>({r:tok[0].toUpperCase(),s:tok[1]}));
}
export function ceBoardCount(str){ return ceParseBoardCards(str).length; }

/* ── Sizing d'une re-relance préflop (§5) ──
   Ce n'est PAS un nombre inventé : il se calcule à partir de la mise réellement
   posée par l'adversaire, selon la convention usuelle — 3× l'open en position,
   4× hors de position, +1× l'open par joueur ayant déjà payé. Il voyage donc
   dans les données transmises (`sizingBb`), sous provenance heuristique, ce qui
   autorise le coach à le citer.

   La règle inverse reste vraie : SANS mise de référence (contexte de mise
   absent, ex. scénario saisi à la main), on ne renvoie RIEN plutôt qu'un ordre
   de grandeur plausible. Le coach dira « sizing non disponible ».

   Un sizing qui atteint le tapis effectif EST le tapis : proposer « 12bb » à un
   joueur qui en a 9 serait un conseil injouable. */
function reraiseSizing(node,effStack,ip,mulIp,mulOop){
  const to=node?.lastAggressor?.toAmountBB;
  if(!(to>0)||!(effStack>0))return null;
  const raw=to*(ip?mulIp:mulOop)+to*(node.callersInFront||0);
  const sz=Math.round(Math.min(raw,effStack)*10)/10;
  return sz>0?sz:null;
}
export function scenarioFromHand(hand,step,snaps){
  if(!hand||!hand.events)return null;
  try{
    const snap=(snaps&&snaps[step])||computeSnapshot(hand,step);
    const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
    const hero=snap.players.find(p=>p.isHero)||snap.players[0];
    const heroPos=hero?.pos||hand.heroPos||"BTN";
    const heroStack=Math.max(0,Math.round(hero?.stack||100));
    const street=cap(snap.street)||"Preflop";
    const board=(snap.board||[]).map(c=>c.r+c.s).join(" ");
    const heroCards=(hero?.hole||[]).map(c=>c.r+c.s).join(" ");

    /* ── CONTEXTE SÉMANTIQUE (cause racine du bug historique) ──
       On ne déduit plus « Hero est-il confronté ? » d'un test d'expression
       régulière sur le LIBELLÉ de la dernière action adverse. Ce test était
       structurellement faux : dans « HJ open · BTN call · Hero BB », la
       dernière action adverse est « Call 2bb », le motif /raise|bet|…/ ne
       matchait pas, et le moteur proposait une OUVERTURE à une big blind qui
       faisait face à un open — d'où le « Open 2.1bb — 62 % » affiché en
       production. Le contexte est désormais reconstruit depuis les MONTANTS
       et l'ORDRE des actions (buildBettingContext), qui ne peuvent pas mentir. */
    const prevSnap=step>0?((snaps&&snaps[step-1])||computeSnapshot(hand,step-1)):null;
    const node=buildBettingContext(hand,{[step-1]:prevSnap},step);

    /* Le vilain de référence est l'AGRESSEUR — celui qu'on affronte — et non le
       premier siège venu : c'est sa range qu'il faut opposer à Hero. */
    const aggrPos=node?.lastAggressor?.pos||null;
    let vil=(aggrPos&&snap.players.find(p=>!p.isHero&&p.pos===aggrPos))
      ||snap.players.find(p=>!p.isHero&&p.pos===hand.vilPos)
      ||snap.players.find(p=>!p.isHero&&!p.folded)||snap.players.find(p=>!p.isHero);
    const vilPos=vil?.pos||hand.vilPos||"BB";
    const vilStack=Math.max(0,Math.round((vil?.stack||0)+(vil?.committed||0))||100);

    const prevAction=node?.lastAggressor
      ? `${semFr(node.lastAggressor.semantic)} ${node.lastAggressor.pos} ${node.lastAggressor.toAmountBB}bb`
      : (node?.limpers?.length?`${node.limpers.length} limp(s)`:"—");

    return {format:hand.gameType==="mtt"?"MTT":"Cash",players:snap.players.length,heroPos,vilPos,
      heroStack,vilStack,potBb:Math.round((node?.potBeforeBB??snap.potTotal)*10)/10,
      board,heroCards,street,prevAction,node,
      villainProfile:"Reg",mode:"gto"};
  }catch{return null;}
}
export const SOLVER_DEFAULT_SC={format:"Cash",players:6,heroPos:"BTN",vilPos:"BB",heroStack:100,vilStack:100,potBb:1.5,board:"",heroCards:"",street:"Preflop",prevAction:"—",node:null,villainProfile:"Reg",mode:"gto"};
export function solveScenario(sc){
  const fixes=[];
  const need={Preflop:0,Flop:3,Turn:4,River:5}[sc.street]??0;
  const bc=ceBoardCount(sc.board);
  if(sc.heroStack<=0)return {ok:false,error:"Scénario impossible — stack Hero insuffisant.",why:"stack",fix:{heroStack:100}};
  if(sc.heroPos===sc.vilPos)return {ok:false,error:"Scénario incohérent — Hero et Vilain à la même position.",why:"position",fix:{vilPos:sc.heroPos==="BB"?"BTN":"BB"}};
  if(sc.potBb<0)return {ok:false,error:"Scénario incohérent — pot négatif.",why:"pot",fix:{potBb:1.5}};
  if(need>0&&bc<need)return {ok:false,error:`Board incomplet pour ${sc.street} (${bc}/${need} cartes).`,why:"board",fix:{board:["As","Kd","7h","2c","9s"].slice(0,need).join(" ")}};
  const eff=Math.min(sc.heroStack,sc.vilStack);
  const spr=sc.street==="Preflop"?null:Math.round((eff/Math.max(0.5,sc.potBb))*10)/10;
  const exploit=sc.mode==="exploit"; const icm=sc.mode==="icm";
  const prof=SOLVER_VPROFILES.find(p=>p.id===sc.villainProfile)||SOLVER_VPROFILES[4];
  const ip=["BTN","CO","HJ"].includes(sc.heroPos);

  /* ── NŒUD SÉMANTIQUE (§3) ──
     Le moteur ne devine plus. Quand la main fournit un contexte de mise
     (`sc.node`), le nœud vient du compteur d'agressions ; sinon — Solver
     manuel, où l'utilisateur saisit un scénario libre — on retombe sur une
     lecture du libellé — un repli assumé, jamais utilisé sur une main réelle. */
  const node=sc.node||null;
  const facing=node?(node.toCallBB>1e-4):/raise|bet|3-?bet|all-?in|relance|mise/i.test(sc.prevAction||"");
  const betLevel=node?node.betLevel:(sc.street==="Preflop"?(facing?2:1):(facing?1:0));
  const limpers=node?node.limpers.length:0;
  const heroChecked=node?node.heroCheckedThisStreet:false;
  const oopVsPrevAggr=node?(node.villainWasPrevStreetAggressor&&!ip):false;

  let heroAct,vilAct,heroLabel,vilLabel,reco,alts,coach;
  if(sc.street==="Preflop"){
    if(betLevel<=1){
      /* ── Pot NON ouvert : Hero ouvre (ou iso-raise s'il y a des limpeurs) ── */
      const isIso=limpers>0;
      const openSem=isIso?SEM.ISO_RAISE:SEM.OPEN_RAISE;
      heroAct="rfi"; heroLabel=isIso?"Iso-raise vs limp":"Open RFI"; vilAct="rfi"; vilLabel="Range d'ouverture";
      const openSz=sc.format==="Cash"?(ip?2.3:2.5):2.1;
      const sz=isIso?Math.round((openSz+limpers)*10)/10:openSz;
      reco={action:openSem,label:`${semFr(openSem)} ${sz}bb`,freq:ip?78:62,evBb:+(0.18+(ip?0.06:0)).toFixed(2),sizing:`${sz}bb`,sizingBb:sz,confidence:"Moyenne"};
      alts=[
        {action:openSem,sem:openSem,chartKey:"r",freq:ip?78:62,evBb:+(0.18).toFixed(2),sizingBb:sz,comment:`Sizing standard ${sz}bb.`},
        {action:"Fold",sem:SEM.FOLD,chartKey:"f",freq:ip?20:36,evBb:0,comment:"Mains hors range d'ouverture."},
        {action:isIso?"Overlimp":"Limp",sem:isIso?SEM.OVERLIMP:SEM.LIMP,chartKey:"c",freq:2,evBb:-0.2,comment:"Rare, déconseillé (sauf SB)."},
      ];
      coach={explanation:`En ${sc.heroPos} (${ip?"in position":"out of position"}), ${isIso?`iso-raise les limpeurs à ${sz}bb`:`ouvre ta range RFI à ${sz}bb`}. Plus tu es proche du bouton, plus ta range s'élargit.`,
        mistake:"Open trop large UTG/HJ ou limp passif.",exploit:`vs ${prof.id} : ${prof.id==="Nit"?"vole plus large ses blindes":prof.id==="Fish"?"value-bet épais post-flop":"reste équilibré"}.`};
    } else if(betLevel===2){
      /* ── Face à un OPEN : fold / call / 3-bet. Jamais « ouvrir ». ── */
      heroAct="vs_open"; heroLabel="Défense vs Open"; vilAct="rfi"; vilLabel="Range d'open estimée";
      const sz=reraiseSizing(node,eff,ip,3,4);
      reco={action:SEM.THREE_BET,label:sz?`3-bet ${sz}bb`:(eff<25?"3-bet/fold":"3-bet ou call"),
        freq:38,evBb:+0.12,sizing:sz?`${sz}bb`:null,sizingBb:sz,confidence:"Moyenne"};
      alts=[
        {action:"3-Bet",sem:SEM.THREE_BET,chartKey:"r",freq:exploit&&prof.adj.fold>0?24:18,evBb:+0.2,sizingBb:sz,
          comment:(sz?`Sizing usuel ${sz}bb (${ip?"3×":"4×"} l'open${node?.callersInFront?` +1× par caller`:""}). `:"")
            +(prof.adj.fold>0?"Élargis les bluff-3bets (il sur-fold).":"Value + bluffs équilibrés.")},
        {action:"Call",sem:SEM.CALL_OPEN,chartKey:"c",freq:ip?34:22,evBb:+0.08,comment:ip?"Cold-call IP correct.":"Call OOP capé — prudence."},
        {action:"Fold",sem:SEM.FOLD_TO_OPEN,chartKey:"f",freq:48,evBb:0,comment:"Défends ~MDF, fold le reste."},
      ];
      coach={explanation:`Face à l'open de ${sc.vilPos}, en ${sc.heroPos}, choisis entre 3-bet (value+bluff) et call ${ip?"IP":"OOP"}. À ${eff}bb effectifs, ${eff<25?"privilégie 3-bet/fold (peu de jeu post-flop)":"tu peux call et jouer post-flop"}.`,
        mistake:"Cold-call OOP trop large, ou 3-bet sans plan.",exploit:`vs ${prof.id} : ${prof.adj.fold>0?"3-bet bluff plus":prof.adj.fold<0?"value-3bet, coupe les bluffs":"équilibre"}.`};
    } else {
      /* ── Face à un 3-bet (ou plus) : fold / call / 4-bet. ── */
      const deep=betLevel===3;
      heroAct="vs_3bet"; heroLabel=deep?"Défense vs 3-bet":"Défense vs 4-bet"; vilAct="vs_open"; vilLabel=deep?"Range de 3-bet estimée":"Range de 4-bet estimée";
      const upSem=deep?SEM.FOUR_BET:SEM.FIVE_BET, callSem=deep?SEM.CALL_THREE_BET:SEM.CALL_FOUR_BET,
            foldSem=deep?SEM.FOLD_TO_THREE_BET:SEM.FOLD_TO_FOUR_BET;
      /* Une re-relance à ce niveau se dimensionne plus petit (2,2× à 2,5× la
         mise à suivre) : les tapis sont déjà largement engagés. */
      const sz=reraiseSizing(node,eff,ip,2.2,2.5);
      reco={action:foldSem,label:semFr(foldSem),freq:58,evBb:0,sizing:null,sizingBb:null,confidence:"Moyenne"};
      alts=[
        {action:semFr(foldSem),sem:foldSem,chartKey:"f",freq:58,evBb:0,comment:"La majorité des mains ne défendent pas face à cette agression."},
        {action:semFr(callSem),sem:callSem,chartKey:"c",freq:deep?27:12,evBb:+0.05,comment:deep?"Continue avec les mains qui réalisent leur équité.":"Call-off réservé au haut de range."},
        {action:semFr(upSem),sem:upSem,chartKey:"r",freq:deep?15:5,evBb:+0.1,sizingBb:sz,
          comment:(sz?`Sizing usuel ${sz}bb${sz>=eff?" (tapis)":""}. `:"")+"Value premium + quelques bluffs à blockers."},
      ];
      coach={explanation:`Face au ${deep?"3-bet":"4-bet"} de ${sc.vilPos}, la range se resserre fortement. À ${eff}bb effectifs, ${eff<40?"le jeu devient un choix binaire (continuer tapis ou jeter)":"tu gardes de la marge post-flop en call"}.`,
        mistake:deep?"Call de 3-bet OOP avec des mains qui ne réalisent pas leur équité.":"4-bet-bluff sans blocker puis fold au 5-bet.",
        exploit:`vs ${prof.id} : ${prof.adj.bluff>0?"élargis les call-offs (il 3-bet léger)":"resserre, il montre du value"}.`};
    }
  } else {
    const tex=(()=>{try{const cs=ceParseBoardCards(sc.board).slice(0,3);if(cs.length<3)return "—";const rk=cs.map(c=>c.r);const su=cs.map(c=>c.s);const paired=rk[0]===rk[1]||rk[1]===rk[2]||rk[0]===rk[2];const mono=su[0]===su[1]&&su[1]===su[2];return paired?"appariée":mono?"monocolore":"dispersée";}catch{return "—";}})();
    const wet=tex!=="dispersée";
    if(betLevel===0){
      /* ── Personne n'a misé : check ou mise (donk bet si OOP dans l'agresseur). ── */
      const betSem=oopVsPrevAggr?SEM.DONK_BET:SEM.BET;
      heroAct="cbet_ip"; heroLabel="Range de continuation"; vilAct="vs_bet"; vilLabel="Range estimée";
      const cbet=ip?(wet?66:33):(wet?75:40);
      reco={action:betSem,label:`${semFr(betSem)} ${cbet}% pot`,freq:wet?55:70,evBb:+0.14,sizing:`${cbet}% pot`,confidence:"Estimée"};
      alts=[
        {action:"Bet",sem:betSem,freq:wet?55:70,evBb:+0.14,comment:`Sizing ${cbet}% adapté à un board ${tex}.`},
        {action:"Check",sem:SEM.CHECK,freq:wet?45:30,evBb:+0.05,comment:wet?"Check une partie de ta range sur board humide.":"Check-back tes mains moyennes."},
      ];
      coach={explanation:`${sc.street} ${tex}, SPR ${spr}, ${ip?"IP":"OOP"}. ${oopVsPrevAggr?`Donk bet ${cbet}% : sortir de la ligne check-call demande une raison claire (board qui favorise ta range).`:`C-bet ${cbet}% : ${wet?"sur board humide, mise plus gros et plus polarisé":"sur board sec, range-bet petit"}.`}`,
        mistake:oopVsPrevAggr?"Donk bet automatique sans avantage de range.":"C-bet automatique 100% sur board humide multiway.",
        exploit:`vs ${prof.id} : ${prof.adj.fold>0?"c-bet bluff plus (il fold trop)":prof.adj.fold<0?"value-bet, coupe les bluffs (il call)":"équilibre"}.`};
    } else {
      /* ── Face à une mise (ou à un raise) : fold / call / raise. ── */
      const vsRaise=betLevel>=2;
      const raiseSem=heroChecked?SEM.CHECK_RAISE:(vsRaise?SEM.RERAISE:SEM.RAISE_BET);
      const callSem=vsRaise?SEM.CALL_RAISE:SEM.CALL_BET;
      const foldSem=vsRaise?SEM.FOLD_TO_RAISE:SEM.FOLD_TO_BET;
      heroAct="vs_bet"; heroLabel=vsRaise?"Défense vs raise":"Défense vs mise"; vilAct="cbet_ip"; vilLabel="Range de mise estimée";
      /* Les pot odds viennent du contexte RÉEL quand il existe. L'ancienne
         version postulait « la mise vaut la moitié du pot » et affichait ce
         chiffre inventé comme un seuil de décision. */
      const potOdds=node?.potOddsPct??null;
      reco={action:callSem,label:wet?"Prudence (board humide)":"Bluff-catch possible",freq:50,evBb:0,sizing:null,confidence:"Estimée"};
      alts=[
        {action:"Call",sem:callSem,freq:exploit&&prof.adj.fold<0?60:45,evBb:+0.05,
          comment:potOdds!=null?`Pot odds ${potOdds}% — call si ton équité dépasse ce seuil.`:"Compare ton équité au prix proposé."},
        {action:"Raise",sem:raiseSem,freq:wet?18:12,evBb:+0.1,comment:wet?`${semFr(raiseSem)} value/semi-bluff sur board dynamique.`:`${semFr(raiseSem)} polarisé.`},
        {action:"Fold",sem:foldSem,freq:40,evBb:0,comment:"Fold les mains sous le seuil de pot odds."},
      ];
      coach={explanation:`${sc.street} ${tex}, SPR ${spr}. Face ${vsRaise?"au raise":"à la mise"} de ${sc.vilPos}, ${potOdds!=null?`compare ton équité aux pot odds (${potOdds}%)`:"compare ton équité au prix proposé"}. ${wet?"Board humide : attention aux tirages.":"Board sec : bluff-catch plus large."}`,
        mistake:"Call river de curiosité / fold trop fort vs sizing faible.",exploit:`vs ${prof.id} : ${prof.adj.bluff>0?"hero-call plus (il bluffe)":prof.adj.value>0?"fold tes bluff-catchs faibles (il value)":"équilibre"}.`};
    }
  }
  const heroFreqs=buildSolverFreqs(sc.heroPos,heroAct,eff,sc.vilPos);
  const vilFreqs=buildSolverFreqs(sc.vilPos,vilAct,eff,sc.heroPos);
  const heroPct=(()=>{const v=Object.values(heroFreqs);if(!v.length)return 0;const played=v.filter(x=>(x.r||0)+(x.c||0)>=40).length;return Math.round(played/v.length*100);})();

  /* ══════════════════════════════════════════════════════════════
     FRÉQUENCES DE LA MAIN DE HERO, PAS DE SA RANGE

     `heroFreqs` contient déjà, pour CHAQUE notation de main, la répartition
     {r, c, f} du nœud. Le moteur ne s'en servait que pour dessiner la grille :
     les alternatives affichées restaient des constantes de range (« 3-bet
     18 % · call 22 % · fold 48 % »), identiques pour AA et pour 72o. Le
     panneau annonçait donc à un joueur tenant K8o un mix qui n'était pas le
     sien — et recommandait un 3-bet là où la table dit de jeter.

     PÉRIMÈTRE STRICTEMENT PRÉFLOP. Les grilles postflop (`cbet_ip`, `vs_bet`)
     sont indexées par la main PRÉFLOP et ignorent totalement le board : les
     présenter comme spécifiques à la main serait une fausse précision (« K8o
     c-bet 25 % » que le board soit K72 ou AQJ). En postflop on garde donc les
     fréquences de range, honnêtement étiquetées, et c'est le CFR — lui seul —
     qui répond pour la main.

     Conséquence : ces chiffres sont des FRÉQUENCES, pas des EV. On abandonne
     donc les `evBb` constants du nœud, qui contrediraient la répartition
     (recommander un 3-bet à 0 % parce qu'on lui a attribué une EV plus haute).
     La mesure d'écart devient l'écart à la fréquence, comme pour le CFR.
  ══════════════════════════════════════════════════════════════ */
  const notation=sc.street==="Preflop"?handNotation(ceParseBoardCards(sc.heroCards).slice(0,2)):null;
  const hf=notation?heroFreqs[notation]:null;
  const handSpecific=!!(hf&&alts.some(a=>a.chartKey));
  if(handSpecific){
    alts=alts.filter(a=>a.chartKey).map(a=>({...a,freq:rb(hf[a.chartKey]||0),evBb:null}));
    const best=alts.slice().sort((x,y)=>(y.freq||0)-(x.freq||0))[0];
    if(best){
      reco={action:best.sem,label:`${semFr(best.sem)}${best.sizingBb!=null?` ${best.sizingBb}bb`:""}`,
        freq:best.freq,evBb:null,sizing:best.sizingBb!=null?`${best.sizingBb}bb`:null,
        sizingBb:best.sizingBb??null,confidence:"Estimée (table de range)"};
    }
  }

  if(icm&&reco){reco.confidence="ICM (estimée)";if(alts[0])alts[0].comment+=" ⚖ ICM : resserre les call-offs marginaux.";}
  return {ok:true,estimated:true,
    metric:handSpecific?"frequency":"ev",
    strategyScope:handSpecific?"hand":"range",
    handNotation:notation,
    spot:{heroPos:sc.heroPos,heroStack:sc.heroStack,vilPos:sc.vilPos,vilStack:sc.vilStack,street:sc.street,potBb:sc.potBb,spr,board:sc.board,heroCards:sc.heroCards,prevAction:sc.prevAction,eff},
    reco,alts,coach,
    heroRange:{freqs:heroFreqs,label:heroLabel,pos:sc.heroPos,pct:heroPct},
    vilRange:{freqs:vilFreqs,label:vilLabel,pos:sc.vilPos},
    fixes};
}
