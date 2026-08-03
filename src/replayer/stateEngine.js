/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : STATE ENGINE (Phase A)

   computeSnapshot(hand, step) : replie les événements 0..step du modèle
   normalisé en un état de table complet et DÉTERMINISTE.
   → PLAY / PAUSE / BACK / NEXT / seek timeline sans incohérence.

   Invariant de conservation des jetons (à chaque snapshot) :
     Σ stack + Σ committed + potMain = Σ stackStart
   (on ne « collecte » jamais le pot vers un stack : les gains sont des
    métadonnées de showdown, pas des mutations de stack.)

   Règle §12/§42 : les blinds/mises sont `committed` (affichées devant le
   joueur) pendant la street ; au changement de street (deal-flop/turn/river)
   ou à la fin (showdown/end), tout `committed` est versé dans `potMain`.

   Module PUR (aucune dépendance React) → testable en Node.
═══════════════════════════════════════════════════════════════ */

const rb = v => Math.round(v*100)/100;
const BET_TYPES = ["call","bet","raise","allin"];

function phaseOf(type){
  if(type==="deal-hole"||type==="post-sb"||type==="post-bb"||type==="post-ante") return "dealing";
  if(type==="deal-flop"||type==="deal-turn"||type==="deal-river") return "street-change";
  if(type==="showdown"||type==="end") return "showdown";
  return "betting";
}

/** Nombre total d'étapes (événements) rejouables. */
export function stepCount(hand){
  return hand?.events?.length || 0;
}

/**
 * @returns HandStateSnapshot
 */
export function computeSnapshot(hand, step){
  const events = hand?.events || [];
  const N = events.length;
  const clamped = Math.max(0, Math.min(step, N-1));

  // état par joueur
  const P = {};
  (hand.players||[]).forEach(p=>{
    P[p.id] = {
      id:p.id, name:p.name, seat:p.seat, pos:p.pos, isHero:!!p.isHero,
      stack: p.stackStart, committed:0, totalInvested:0,
      folded:false, allIn:false, holeVisible:false,
      hole: p.hole || [], shown: p.shown || null,
    };
  });
  let potMain = 0;
  const board = [];
  let street = "preflop";

  function absorbBets(){
    for(const id in P){ if(P[id].committed){ potMain = rb(potMain + P[id].committed); P[id].committed = 0; } }
  }

  let lastAction = null;
  for(let i=0;i<=clamped;i++){
    const e = events[i];
    if(!e) break;
    const pl = e.playerId ? P[e.playerId] : null;
    switch(e.type){
      case "post-ante":
        if(pl){ pl.stack = rb(pl.stack - e.amount); pl.totalInvested = rb(pl.totalInvested + e.amount); potMain = rb(potMain + e.amount); }
        break;
      case "post-sb":
      case "post-bb":
        if(pl){ pl.stack = rb(pl.stack - e.amount); pl.committed = rb(pl.committed + e.amount); pl.totalInvested = rb(pl.totalInvested + e.amount); }
        break;
      case "deal-hole":
        for(const id in P){ if(P[id].isHero) P[id].holeVisible = true; }
        break;
      case "deal-flop": absorbBets(); board.push(...(e.cards||[])); street="flop"; break;
      case "deal-turn": absorbBets(); board.push(...(e.cards||[])); street="turn"; break;
      case "deal-river": absorbBets(); board.push(...(e.cards||[])); street="river"; break;
      case "fold":
        if(pl) pl.folded = true;
        lastAction = e; break;
      case "check":
        lastAction = e; break;
      case "call": case "bet": case "raise": case "allin":
        if(pl){
          pl.stack = rb(pl.stack - (e.amount||0));
          pl.committed = rb(pl.committed + (e.amount||0));
          pl.totalInvested = rb(pl.totalInvested + (e.amount||0));
          if(e.type==="allin" || pl.stack<=0.0001){ pl.allIn = true; pl.stack = Math.max(0, pl.stack); }
        }
        lastAction = e; break;
      case "uncalled-return":
        if(pl){ pl.stack = rb(pl.stack + (e.amount||0)); pl.committed = rb(Math.max(0, pl.committed - (e.amount||0))); pl.totalInvested = rb(pl.totalInvested - (e.amount||0)); }
        break;
      case "showdown": {
        absorbBets();
        const sh = hand.showdown?.shownHoles || {};
        for(const id in sh){ if(P[id]){ P[id].holeVisible = true; P[id].hole = sh[id]; } }
        break;
      }
      case "end":
        absorbBets();
        break;
      default: break;
    }
  }

  const cur = events[clamped] || null;
  const players = Object.values(P).map(p=>({
    ...p,
    active: !p.folded,
    bet: p.committed,
  }));
  const bets = {};
  players.forEach(p=>{ if(p.committed>0.0001) bets[p.id] = p.committed; });
  const dealer = players.find(p=>p.seat===hand.buttonSeat);

  return {
    step: clamped,
    stepTotal: N,
    street,
    phase: cur ? phaseOf(cur.type) : "betting",
    currentEvent: cur,
    lastAction,
    players,
    bets,
    potMain: rb(potMain),
    potTotal: rb(potMain + players.reduce((a,p)=>a+p.committed,0)),
    board,
    buttonSeat: hand.buttonSeat,
    dealerId: dealer ? dealer.id : null,
  };
}

/** Pré-calcule tous les snapshots d'une main (mémoïsation React). */
export function computeAllSnapshots(hand){
  const N = stepCount(hand);
  const out = [];
  for(let s=0;s<N;s++) out.push(computeSnapshot(hand, s));
  return out;
}
