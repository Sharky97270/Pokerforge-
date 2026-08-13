/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : CINÉMATIQUE DES JETONS (§11–19).

   Diffe snapshot(step-1) → snapshot(step) et produit un PLAN d'animation.
   Les animations sont une pure COUCHE DE PRÉSENTATION posée au-dessus d'un
   état déterministe (§19) : elles ne modifient jamais un montant, un pot ou
   une pile. Si on les supprime, l'écran reste exact.

   Trois mouvements, tous ancrés sur le joueur concerné :

     toss     joueur ─→ betAnchor   (bet / call / première mise de la street)
     add      joueur ─→ betAnchor   (raise : la pile en place NE bouge pas,
                                     de nouveaux jetons viennent s'y ajouter)
     collect  betAnchor ─→ pot      (fin de tour d'enchères, §16)

   Les jetons ne « téléportent » donc jamais (§17) : ils entrent toujours par
   le siège de leur propriétaire et sortent toujours vers le pot.

   Synchronisation timeline (§18) : la durée est divisée par la vitesse de
   lecture et bornée ; un saut de plus d'une étape, une lecture arrière ou un
   scrub manuel n'animent RIEN — l'état est reconstruit sec (§19).
═══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";

const rb = v => Math.round(v * 100) / 100;
function fmtBb(v) { if (v == null) return ""; const n = rb(v); return (Number.isInteger(n) ? n : n.toFixed(1)) + "bb"; }

const STREET_CHANGE = new Set(["deal-flop", "deal-turn", "deal-river", "showdown", "end"]);
const BET_TYPES = new Set(["bet", "call", "raise", "allin"]);
const POST_TYPES = new Set(["post-sb", "post-bb"]);

/* Durées cibles (§11 : 180–300 ms, premium mais rapide). */
export const CINEMATIC_MS = { toss: 230, add: 210, collect: 300, allinBonus: 60 };

export function scaleDuration(ms, speed = 1) {
  const s = Math.max(0.25, Math.min(8, Number(speed) || 1));
  return Math.round(Math.max(70, Math.min(600, ms / s)));
}

const EMPTY_PLAN = { seq: 0, toss: null, add: null, collects: [], potPulse: false, duration: 0 };

/**
 * @param snapshot      snapshot courant
 * @param prevSnapshot  snapshot de l'étape précédente
 * @param opts.speed    multiplicateur de vitesse de lecture (0.5 … 4)
 * @param opts.instant  true → aucune animation
 * @param opts.anchorOf (playerId) => {x,y} ancre de mise (%)
 * @param opts.seatOf   (playerId) => {x,y} centre du siège (%)
 * @param opts.potAt    {x,y} centre du pot (%)
 * @param opts.frame    repère de table (kx/ky px par %)
 */
export function useReplayAnimation(snapshot, prevSnapshot, opts = {}) {
  const { speed = 1, instant = false, anchorOf, seatOf, potAt, frame } = opts;
  const [plan, setPlan] = useState(EMPTY_PLAN);
  const timerRef = useRef(null);
  const stepRef = useRef(-1);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!snapshot) return;
    const step = snapshot.step;
    const prevStep = stepRef.current;
    if (step === prevStep) return;
    const contiguousForward = prevStep >= 0 && step === prevStep + 1;
    stepRef.current = step;

    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    const ev = snapshot.currentEvent;
    const ready = typeof anchorOf === "function" && typeof seatOf === "function" && frame && frame.kx;
    // §19 — scrub, retour arrière, changement de main, saut de street : on
    // reconstruit l'état sans rejouer la cinématique.
    if (!ev || instant || !contiguousForward || !ready) {
      setPlan(p => (p === EMPTY_PLAN ? p : EMPTY_PLAN));
      return;
    }

    const seq = ++seqRef.current;
    const dPx = (from, to) => ({
      dx: Math.round((from.x - to.x) * frame.kx),
      dy: Math.round((from.y - to.y) * frame.ky),
    });

    let next = { ...EMPTY_PLAN, seq };

    if (STREET_CHANGE.has(ev.type)) {
      /* §16 — les contributions de chaque joueur convergent vers le pot.
         Léger décalage entre les piles pour que l'œil suive chaque origine. */
      const bets = (prevSnapshot && prevSnapshot.bets) || {};
      const ids = Object.keys(bets);
      const pot = potAt || { x: 50, y: 42 };
      next.collects = ids.map((pid, i) => {
        const a = anchorOf(pid) || { x: 50, y: 50 };
        const pl = prevSnapshot.players.find(p => p.id === pid);
        return {
          id: `${step}-${pid}`,
          amount: bets[pid],
          label: fmtBb(bets[pid]),
          kind: pl?.isHero ? "hero" : "villain",
          allin: !!pl?.allIn,
          x: pot.x, y: pot.y,
          ...dPx(a, pot),
          delay: Math.min(70, i * 22),
        };
      });
      next.potPulse = next.collects.length > 0;
      next.duration = scaleDuration(CINEMATIC_MS.collect, speed);
    } else if ((BET_TYPES.has(ev.type) || POST_TYPES.has(ev.type)) && ev.playerId) {
      const pid = ev.playerId;
      const a = anchorOf(pid), s = seatOf(pid);
      if (a && s) {
        const before = (prevSnapshot && prevSnapshot.bets && prevSnapshot.bets[pid]) || 0;
        const after = (snapshot.bets && snapshot.bets[pid]) || 0;
        const delta = rb(after - before);
        if (delta > 0.0001) {
          const move = {
            playerId: pid, seq,
            amount: delta, total: after,
            label: fmtBb(delta),
            kind: snapshot.players.find(p => p.id === pid)?.isHero ? "hero" : "villain",
            allin: ev.type === "allin",
            x: a.x, y: a.y,
            ...dPx(s, a),
          };
          if (before > 0.0001) {
            /* §14 — RAISE : la pile existante reste en place, seuls les
               nouveaux jetons arrivent du joueur, puis le montant se met à jour. */
            next.add = move;
            next.duration = scaleDuration(CINEMATIC_MS.add + (move.allin ? CINEMATIC_MS.allinBonus : 0), speed);
          } else {
            /* §12/§13 — première mise du tour : le BetDisplay entier entre
               depuis le siège de son propriétaire. */
            next.toss = move;
            next.duration = scaleDuration(CINEMATIC_MS.toss + (move.allin ? CINEMATIC_MS.allinBonus : 0), speed);
          }
        }
      }
    }

    setPlan(next);
    if (next.duration > 0) {
      const hold = next.duration + (next.collects.length ? 90 : 40);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setPlan(p => (p.seq === seq ? EMPTY_PLAN : p));
      }, hold);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.step, snapshot, instant]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return useMemo(() => ({
    ...plan,
    /* Clé de remontage du BetDisplay : ne change QUE pour le joueur qui vient
       de poser sa première mise du tour → lui seul rejoue l'entrée, les autres
       piles restent strictement immobiles. */
    tossKeyOf: pid => (plan.toss && plan.toss.playerId === pid ? plan.toss.seq : 0),
    tossOf: pid => (plan.toss && plan.toss.playerId === pid ? plan.toss : null),
    addOf: pid => (plan.add && plan.add.playerId === pid ? plan.add : null),
  }), [plan]);
}
