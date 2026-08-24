/* ══════════════════════════════════════════════════════════════════════════
   trainerSeatStatus.js — STATUT D'UN SIÈGE, DÉRIVÉ DE L'ORDRE DE PAROLE (C9)

   POURQUOI CE MODULE EXISTE
   Le rendu terminait sa construction d'états par :

       allPositions.forEach(pos => { if(!inHand && !folded) folded = true; });

   Tout siège qui n'était ni Hero ni le vilain désigné était déclaré COUCHÉ —
   y compris ceux qui n'avaient pas encore parlé. Visible à l'œil : un spot
   « CO — premier à parler » affichait le badge FOLD sur BTN, SB et BB, alors
   que le BTN parle APRÈS le CO. Un joueur ne se couche pas avant son tour.

   `livePositionsAtDecision()` sait déjà répondre — elle alimente le contrôle de
   périmètre du solveur. Le rendu ne l'appelait simplement pas.

   Six statuts, et un seul autorise le badge FOLD :
     out      le siège n'existe pas à cette taille de table
     waiting  dans le coup, n'a pas encore parlé (parle après Hero)
     toAct    c'est à lui de jouer
     active   dans le coup, a déjà parlé sans se coucher
     allIn    dans le coup, tapis engagé
     folded   s'est RÉELLEMENT couché (action enregistrée)

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { livePositionsAtDecision, preflopOrderFor, tableSizeOf } from "./trainerSolutionScope.js";

export const SEAT_STATUS = {
  OUT: "out", WAITING: "waiting", TO_ACT: "toAct",
  ACTIVE: "active", ALL_IN: "allIn", FOLDED: "folded",
};

const upper = v => String(v || "").toUpperCase();
const isFold = t => upper(t).includes("FOLD");

function actionsOf({ ctx, handLog, vact, vpos, answered, heroActs, hpos }) {
  const out = [];
  const pousse = (position, type) => { if (position) out.push({ position, type: upper(type) }); };
  for (const a of ctx?.preActions || []) pousse(a?.position || a?.pos || a?.actor, a?.actionType || a?.action || a?.act);
  for (const a of handLog || []) pousse(a?.position, a?.actionType || a?.action);
  if (vact && vpos) pousse(vpos, vact.action || vact.actionType || vact);
  if (answered !== null && answered !== undefined && heroActs?.[answered]) {
    pousse(hpos, heroActs[answered]?.id || heroActs[answered]?.action);
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   trainerSeatStatuses — le statut de chaque siège assis.

   `ledgerSeats` (optionnel) apporte le tapis restant : un siège qui a tout
   engagé est `allIn`, pas simplement `active`.
   ────────────────────────────────────────────────────────────────────────── */
export function trainerSeatStatuses({
  spot = null, ctx = null, handLog = [], vact = null, answered = null,
  seatOrder = [], ledgerSeats = null, activePlayerId = null, playingFull = false,
} = {}) {
  const hpos = spot?.hpos, vpos = spot?.vpos;
  const taille = tableSizeOf(spot);
  const ordre = preflopOrderFor(taille);
  const assis = (seatOrder && seatOrder.length) ? seatOrder : ordre;
  const vivants = new Set(livePositionsAtDecision(spot));
  const actions = actionsOf({ ctx, handLog, vact, vpos, answered, heroActs: spot?.acts, hpos });

  const aParle = new Set();
  const couches = new Set();
  for (const a of actions) {
    aParle.add(a.position);
    if (isFold(a.type)) couches.add(a.position);
    else couches.delete(a.position);            // il est revenu dans le coup
  }

  const heroIdx = ordre.indexOf(hpos);
  const estPreflop = /^pre/i.test(spot?.street || "Preflop");
  const out = {};
  for (const pos of assis) {
    let status;
    if (couches.has(pos)) status = SEAT_STATUS.FOLDED;
    else {
      const restant = ledgerSeats?.[pos]?.remaining;
      const engage = ledgerSeats?.[pos]?.total;
      const aTapis = Number.isFinite(restant) && restant <= 0.011 && Number(engage) > 0;
      const cEstSonTour = (activePlayerId === "hero" && pos === hpos) || (activePlayerId === "villain" && pos === vpos);
      const posIdx = ordre.indexOf(pos);
      /* ── LE CŒUR DE LA CORRECTION ────────────────────────────────────────
         Un siège situé APRÈS Hero dans l'ordre de parole et qui n'a pas encore
         agi est en ATTENTE. Il n'a pas fold : il n'a pas encore parlé. */
      const parleApresHero = estPreflop && !playingFull && heroIdx >= 0 && posIdx > heroIdx;
      if (aTapis) status = SEAT_STATUS.ALL_IN;
      else if (cEstSonTour) status = SEAT_STATUS.TO_ACT;
      else if (!aParle.has(pos) && parleApresHero) status = SEAT_STATUS.WAITING;
      else if (aParle.has(pos) || vivants.has(pos)) status = SEAT_STATUS.ACTIVE;
      else if (!vivants.has(pos)) status = SEAT_STATUS.FOLDED;   // sorti par la ligne
      else status = SEAT_STATUS.WAITING;
    }
    out[pos] = {
      position: pos, status,
      inHand: status !== SEAT_STATUS.FOLDED && status !== SEAT_STATUS.OUT,
      folded: status === SEAT_STATUS.FOLDED,
      allIn: status === SEAT_STATUS.ALL_IN,
      waiting: status === SEAT_STATUS.WAITING,
      hasActed: aParle.has(pos),
      /* Le badge n'existe QUE pour un fait acquis. Pas de badge sur un siège
         qui n'a pas parlé — c'est ce que l'écran affirmait à tort. */
      badge: status === SEAT_STATUS.FOLDED ? "FOLD" : status === SEAT_STATUS.ALL_IN ? "ALL-IN" : null,
    };
  }
  return out;
}

/* Le siège a-t-il le droit d'afficher le badge FOLD ? Fonction de garde,
   utilisable en test : aucun siège sans action de fold enregistrée. */
export function canShowFoldBadge(statut) {
  return !!statut && statut.status === SEAT_STATUS.FOLDED;
}
