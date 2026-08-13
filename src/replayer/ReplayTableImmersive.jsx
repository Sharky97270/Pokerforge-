/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : TABLE IMMERSIVE.

   Rend un HandStateSnapshot (State Engine) avec le KIT VISUEL VALIDÉ du
   Trainer : avatars (PlayerAvatarPremium), cartes (Cards), jetons (Chips),
   géométrie de table partagée (components/table/geometry.js).

   • Cartes Hero toujours visibles, villains face cachée sauf showdown.
   • Mises posées sur le vecteur siège→centre via le système d'ancrage
     unique (components/table/tableAnchors.js) — aucune coordonnée arbitraire
     n'est écrite ici (§24).
   • Cinématique : les jetons ENTRENT par le siège de leur propriétaire et
     SORTENT vers le pot (§11–17), toujours au-dessus d'un état déterministe.
═══════════════════════════════════════════════════════════════ */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { T } from "../theme.js";
import { Card, HeroHoleCards, VillainBackCards } from "../components/table/Cards.jsx";
import { PlayerSeat, TrainingPotStack } from "../components/table/Chips.jsx";
import { PlayerAvatarPremium, trainerSeatAvatarProfile } from "../components/table/Avatars.jsx";
import {
  feltGeometry, feltStyle, feltRailStyle,
  boardPoint, potPoint, heroCentricSeatRing,
} from "../components/table/geometry.js";
import { makeTableFrame, buildTableAnchors, rectAround } from "../components/table/tableAnchors.js";
import BetDisplay, { ChipFly, betDisplaySize } from "./BetDisplay.jsx";
import { useReplayAnimation } from "./useReplayAnimation.js";

const rb = v => Math.round(v * 100) / 100;
function defaultFmt(v) { const n = rb(v); return (Number.isInteger(n) ? n : n.toFixed(1)) + "bb"; }

function actionType(ev) {
  if (!ev) return "BET";
  switch (ev.type) {
    case "fold": return "FOLD";
    case "check": return "CHECK";
    case "call": return "CALL";
    case "raise": return "RAISE";
    case "allin": return "ALLIN";
    case "post-sb": case "post-bb": return "BLIND";
    default: return "BET";
  }
}

/* Le board et le pot sont dessinés DANS le feutre : leurs % sont relatifs au
   feutre, pas à la zone de table. Les ancres, elles, vivent en % de la zone.
   Sans cette conversion, la zone protégée du board se retrouve ~10 % trop bas. */
function feltToRoot(pt, g) {
  return {
    x: g.left + pt.x * (100 - g.left - g.right) / 100,
    y: g.top + pt.y * (100 - g.top - g.bottom) / 100,
  };
}

/* Deux jeux de rects sont-ils identiques à la tolérance près ? Évite de
   re-rendre en boucle sur des variations sub-pixel de la mesure. */
function sameRects(a, b, tol = 0.12) {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const ra = a[k], rb2 = b[k];
    if (!ra !== !rb2) return false;
    if (!ra) continue;
    if (Math.abs(ra.x0 - rb2.x0) > tol || Math.abs(ra.y0 - rb2.y0) > tol
      || Math.abs(ra.x1 - rb2.x1) > tol || Math.abs(ra.y1 - rb2.y1) > tol) return false;
  }
  return true;
}

export default function ReplayTableImmersive({
  hand, snapshot, prevSnapshot = null, fmt = defaultFmt,
  speed = 1, instant = false, compact = false, onAnchors,
}) {
  // Taille réelle de la zone de table. L'anneau est placé en POURCENTAGES
  // (il rétrécit avec le conteneur) alors que le bloc siège est en PIXELS : sur
  // un écran court (1366×768 → ~380 px de table) les sièges des flancs finissent
  // par se chevaucher. On dérive donc une échelle depuis la hauteur mesurée.
  // La LARGEUR sert au calcul vectoriel des ancres : en % purs, un même « push »
  // ne représente pas la même distance à l'horizontale et à la verticale.
  const rootRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setBox(prev => (Math.abs(prev.w - r.width) > 4 || Math.abs(prev.h - r.height) > 4)
        ? { w: r.width, h: r.height } : prev);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boxH = box.h;
  const geom = feltGeometry(boxH, hand?.players?.length || 0);
  // 520 px = hauteur de référence (poste de travail 1080p) → échelle 1. Exposant
  // 1.3 : le bloc siège doit décroître PLUS vite que le conteneur, car ses
  // marges/paddings CSS sont en px fixes et ne suivent pas la police.
  const s = boxH ? Math.max(0.6, Math.pow(Math.min(1, boxH / 520), 1.3)) : 1;
  const px = v => Math.round(v * s);

  // Tailles réduites en mode compact (mobile) pour éviter le serrage board/cartes.
  const boardSize = (compact || s < 0.8) ? "md" : "lg";
  const heroScale = (compact ? 0.67 : 0.79) * s;
  const avSize = isH => px(compact ? (isH ? 39 : 34) : (isH ? 46 : 41));
  const villainCardSlot = px(compact ? 40 : 45);
  const villainCardTuck = -Math.round(((compact ? 16 : 20) + (1 - s) * 26) * s);
  const heroCardsPull = -Math.round(66 * (1 - heroScale));

  /* §8 — les jetons restent SUBORDONNÉS aux cartes / avatars / board / pot.
     Exposant 1.25 : comme le bloc siège, l'objet doit MAIGRIR PLUS VITE que le
     conteneur. Sur un portable 1366×768 les cartes de Hero touchent déjà le
     board ; la seule place libre est une bande d'à peine 60 px sur leur flanc,
     et un BetDisplay à l'échelle linéaire n'y entre pas. */
  const betScale = Math.max(0.58, Math.min(1.02, (compact ? 0.84 : 1) * Math.pow(s, 1.25)));
  const dealerScale = Math.max(0.66, Math.min(1.05, s));

  const players = useMemo(
    () => [...(hand?.players || [])].sort((a, b) => a.seat - b.seat),
    [hand],
  );

  // Anneau de sièges (hero en bas), calé sur le feutre.
  const ring = useMemo(() => {
    const hero = players.find(p => p.isHero);
    return heroCentricSeatRing(players.map(p => p.pos), hero?.pos, { geometry: geom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, geom.top, geom.left, geom.right, geom.bottom]);

  /* ── Zones protégées MESURÉES (§10) ──
     Les blocs sièges, le board et le pot sont dessinés par du CSS en px : leur
     emprise réelle ne se déduit pas des %. On la mesure une fois la frame
     peinte, puis on ne re-mesure que si elle a bougé. Les BetDisplay sont en
     `position:absolute` + `contain:layout` → ils ne peuvent pas influer sur ces
     mesures, la boucle est donc close. */
  const [rects, setRects] = useState(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const R = root.getBoundingClientRect();
    if (!R.width || !R.height) return;
    const toRect = el => {
      const r = el.getBoundingClientRect();
      return {
        x0: (r.left - R.left) / R.width * 100, y0: (r.top - R.top) / R.height * 100,
        x1: (r.right - R.left) / R.width * 100, y1: (r.bottom - R.top) / R.height * 100,
      };
    };
    const next = {};
    root.querySelectorAll(".pf-player-seat[data-seat]").forEach(el => {
      next[`seat:${el.getAttribute("data-seat")}`] = toRect(el);
    });
    const boardEl = root.querySelector(".pf-board-zone");
    const potEl = root.querySelector(".pf-pot-readout");
    if (boardEl) next.board = toRect(boardEl);
    if (potEl) next.pot = toRect(potEl);
    setRects(prev => (sameRects(prev, next) ? prev : next));
  });

  /* ── Repère + ancres ── */
  const frame = useMemo(
    () => makeTableFrame({ width: box.w, height: box.h, geometry: geom }),
    [box.w, box.h, geom.top, geom.left, geom.right, geom.bottom],
  );

  // Emprise NOMINALE d'un BetDisplay (2 piles pleines) : l'ancre ne doit pas
  // se déplacer quand le montant grossit pendant la street — même état, même
  // position (§19).
  const betSlot = useMemo(() => {
    const n = betDisplaySize(30, betScale, false);
    return { w: n.w, h: n.h };
  }, [betScale]);
  const dealerSlot = useMemo(
    () => ({ w: Math.round(21 * dealerScale) + 4, h: Math.round(21 * dealerScale) + 4 }),
    [dealerScale],
  );

  const boardPt = boardPoint();
  const potPt = potPoint((snapshot?.board?.length || 0) > 0);
  const boardRoot = feltToRoot(boardPt, geom);
  const potRoot = feltToRoot(potPt, geom);

  const anchors = useMemo(() => {
    if (!players.length) return { bets: {}, dealer: null, zones: [] };
    const seats = players.map(p => {
      const c = ring[p.pos] || { x: 50, y: 50 };
      return {
        id: p.id, pos: p.pos, x: c.x, y: c.y, isHero: !!p.isHero,
        rect: rects?.[`seat:${p.pos}`] || null,
      };
    });
    // Board et pot : mesurés si possible, sinon estimés à partir de la
    // géométrie du feutre convertie en % de la zone de table.
    // Le board et le pot reçoivent une garde SUPPLÉMENTAIRE : ne pas les
    // recouvrir ne suffit pas, une mise posée à 10 px du pot se lit comme une
    // partie du pot. On leur réserve un halo de respiration (§10).
    const grow = (r, padPx) => r && {
      x0: r.x0 - padPx / frame.kx, x1: r.x1 + padPx / frame.kx,
      y0: r.y0 - padPx / frame.ky, y1: r.y1 + padPx / frame.ky,
    };
    const staticZones = [];
    const boardRect = rects?.board
      || ((snapshot?.board?.length || 0) > 0
        ? rectAround({ x: boardRoot.x, y: boardRoot.y - 4 * (100 - geom.top - geom.bottom) / 100 },
          { w: (boardSize === "lg" ? 48 : 36) * 5 + 24, h: boardSize === "lg" ? 66 : 47 }, frame, 0)
        : null);
    if (boardRect) staticZones.push({ id: "board", rect: grow(boardRect, 6) });
    const potRect = rects?.pot
      || ((snapshot?.potMain || 0) > 0.01
        ? rectAround(potRoot, { w: 74, h: 54 }, frame, 0) : null);
    if (potRect) staticZones.push({ id: "pot", rect: grow(potRect, 14) });

    const btnPlayer = players.find(p => p.seat === hand?.buttonSeat);
    /* Chaque siège réserve sa place, qu'il ait misé ou non (`activeBets` non
       transmis). Sinon l'ancre d'un joueur dépendrait des mises de ses voisins :
       une pile glisserait sur le côté au moment où le voisin se couche, ce que
       l'œil lit comme un bug. L'ancre ne dépend donc QUE de la géométrie —
       même table, même position (§19/§23). */
    const built = buildTableAnchors({
      seats, frame, staticZones,
      betSize: betSlot, dealerSize: dealerSlot,
      buttonSeatId: btnPlayer ? btnPlayer.id : null,
      // Le bouton D reste « collé » au joueur : au plus deux diamètres d'avatar.
      dealerReachCapPx: avSize(true) + dealerSlot.w / 2 + 8,
    });
    return { ...built, seats, boardRect, potRect };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, ring, rects, frame, betSlot, dealerSlot, hand?.buttonSeat,
    snapshot?.board?.length, (snapshot?.potMain || 0) > 0.01]);

  const seatCoordOf = useMemo(() => {
    const m = {};
    players.forEach(p => { m[p.id] = ring[p.pos] || { x: 50, y: 50 }; });
    return m;
  }, [players, ring]);

  /* Centre du pot en % de la zone de table — destination des collectes (§16). */
  const potCenter = useMemo(() => {
    const r = anchors.potRect;
    if (r) return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
    return potRoot;
  }, [anchors.potRect, potRoot.x, potRoot.y]);

  const cine = useReplayAnimation(snapshot, prevSnapshot, {
    speed, instant, frame, potAt: potCenter,
    anchorOf: pid => anchors.bets[pid],
    seatOf: pid => seatCoordOf[pid],
  });

  // Publie les ancres pour l'audit / les couches externes (aucune duplication
  // de géométrie ailleurs dans l'app — §24).
  useEffect(() => {
    if (typeof onAnchors === "function") onAnchors({ anchors, frame, seats: seatCoordOf });
  }, [anchors, frame, seatCoordOf, onAnchors]);

  if (!hand || !snapshot) return null;

  const board = snapshot.board || [];
  const hasBoard = board.length > 0;
  const potVal = snapshot.potMain;
  const cur = snapshot.currentEvent;
  const dlrPt = anchors.dealer;

  return (
    <div ref={rootRef} className="pf-replayer-table" style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}>
      {/* ── FEUTRE ── */}
      <div style={feltStyle(geom)}>
        <div style={feltRailStyle("outer", geom)} />
        <div style={feltRailStyle("inner", geom)} />

        {/* POT — posé JUSTE au-dessus du board. Le y=29 % hérité du Trainer visait
            un feutre pleine largeur ; sur le feutre resserré du Replayer les sièges
            du haut descendent sur l'anneau et le pot mordait leur plaque (6-max).
            Un simple % ne suffit pas non plus : les cartes du board sont en px
            fixes, donc leur part de hauteur grandit quand l'écran raccourcit. On
            ancre donc le BAS du pot à N px au-dessus du centre du board. */}
        {potVal > 0.01 && (
          <div className={`pf-pot-readout compact${cine.potPulse ? " pot-val-pop" : ""}`}
            style={{
              position: "absolute", left: `${potPt.x}%`, zIndex: 7,
              ...(hasBoard
                ? {
                  top: `calc(${boardPt.y - 4}% - ${Math.round((boardSize === "lg" ? 66 : 47) / 2) + 4}px)`,
                  transform: `translate(-50%,-100%) scale(${s})`, transformOrigin: "50% 100%",
                }
                : { top: `${potPt.y}%`, transform: "translate(-50%,-50%)" }),
            }}>
            <TrainingPotStack value={potVal} compact tableMode={1} />
            <span className="pf-pot-label">POT</span>
            <span className="pf-pot-value">{fmt(potVal)}</span>
          </div>
        )}

        {/* BOARD — remonté de 4% pour laisser respirer les cartes de Hero en dessous. */}
        {hasBoard && (
          <div className="pf-board-zone" key={`board-${board.length}`}
            style={{ position: "absolute", top: `${boardPt.y - 4}%`, left: `${boardPt.x}%`, transform: "translate(-50%,-50%)", display: "flex", gap: 6, zIndex: 6, alignItems: "center", filter: "drop-shadow(0 4px 16px rgba(0,0,0,.7))" }}>
            {board.map((c, i) => (
              <div key={`${i}-${c.r}${c.s}`} className="board-card-in" style={{ animationDelay: `${i * 0.09}s` }}>
                <Card r={c.r} s={c.s} size={boardSize} delay={0} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SIÈGES ── */}
      {snapshot.players.map(p => {
        const coord = seatCoordOf[p.id];
        if (!coord) return null;
        const isH = p.isHero;
        const isActing = cur && cur.playerId === p.id && ["fold", "check", "call", "bet", "raise", "allin"].includes(cur.type);
        const col = isH ? T.gold : T.text3;
        const profile = isH ? "Hero" : trainerSeatAvatarProfile(p.pos);
        const isTop = coord.y <= 24, isBottom = coord.y >= 68;
        const seatTransform = isTop ? "translate(-50%,-40%)" : isBottom ? "translate(-50%,-49%)" : "translate(-50%,-50%)";

        const showFace = p.holeVisible && p.hole && p.hole.length >= 2;

        // Badge fold/check. Posé EN SURIMPRESSION du siège (et non en dessous) :
        // en flux il rallongeait le bloc de ~18 px et recouvrait alors les cartes
        // du siège voisin sur les tables 8/9 joueurs (MP × LJ, BTN × SB).
        const lastBadge = (() => {
          if (p.allIn) return null;   // ALL-IN a son propre badge, même emplacement
          if (p.folded) return { l: "Fold", cls: "action-fold" };
          if (isActing && cur.type === "check") return { l: "Check", cls: "action-check" };
          return null;
        })();

        return (
          <PlayerSeat key={p.id} pos={p.pos} mode="1T" style={{ left: `${coord.x}%`, top: `${coord.y}%`, transform: seatTransform, gap: 0, zIndex: 20 }}>

            {/* Cartes au-dessus du siège — l'espace est TOUJOURS réservé pour les
                villains (même pliés) afin que tous les avatars s'alignent sur
                l'anneau (sinon un siège plié « remonte » : cf. bug BTN/BB). */}
            {isH ? (
              <HeroHoleCards cards={p.hole} size={isTop ? "1t-hero-top" : "1t-hero-bottom"} gap={isTop ? 5 : 8}
                style={{ marginBottom: isTop ? 4 : 6, marginTop: heroCardsPull, transform: `scale(${heroScale})`, transformOrigin: "bottom center", filter: "drop-shadow(0 8px 22px rgba(0,0,0,.86)) drop-shadow(0 0 16px rgba(0,191,255,.34))" }} />
            ) : (
              <div style={{ minHeight: villainCardSlot, marginBottom: villainCardTuck, display: "flex", alignItems: "flex-end", gap: 3 }}>
                {!p.folded && (showFace
                  ? p.hole.slice(0, 2).map((c, i) => <Card key={i} r={c.r} s={c.s} size="1t-villain" delay={i * 0.05} revealed />)
                  : <VillainBackCards size="1t-villain" gap={3} />)}
              </div>
            )}

            {/* Carte joueur (avatar + plaque) */}
            <div className={`player-card-1t${isH ? " hero" : " villain"}${isActing ? (isH ? " active-hero" : " active-vil") : ""}${p.folded ? " seat-folded" : ""}`} style={{ position: "relative" }}>
              <PlayerAvatarPremium isHero={isH} isVillain={!isH} profile={profile} size={avSize(isH)} active={isActing} />
              {lastBadge && (
                <span className={`seat-action-badge pf-seat-status ${lastBadge.cls}`}>{lastBadge.l}</span>
              )}
              {isH && <span className="pf-seat-hero-chip">HERO</span>}
              <div className="pf-seat-nameplate">
                <span className="seat-card-pos" style={{ fontSize: (isH ? 13 : 11.5) * s, color: col }}>{p.pos}</span>
                <span className="seat-card-stack" style={{ fontSize: (isH ? 11 : 9.5) * s, color: isH ? T.gold : T.text3 }}>{fmt(p.stack)}</span>
              </div>
              {/* ALL-IN : même traitement que Fold/Check — en surimpression, sinon
                  il rallonge le bloc siège et le fait sortir du cadre en haut. */}
              {p.allIn && <span className="seat-action-badge pf-seat-status action-allin">ALL-IN</span>}
            </div>

          </PlayerSeat>
        );
      })}

      {/* ── MISES (BetDisplay ancré au siège) ── */}
      {snapshot.players.map(p => {
        const a = anchors.bets[p.id];
        if (!a || !(p.committed > 0.0001)) return null;
        const mine = cur && cur.playerId === p.id;
        const toss = cine.tossOf(p.id);
        const add = cine.addOf(p.id);
        return (
          <BetDisplay
            key={`bet-${p.id}-${cine.tossKeyOf(p.id)}`}
            pos={p.pos}
            swept={a.sweptDeg}
            blocked={a.blocked}
            x={a.x} y={a.y}
            amount={rb(p.committed)}
            type={p.allIn ? "ALLIN" : mine ? actionType(cur) : "BET"}
            kind={p.isHero ? "hero" : "villain"}
            scale={betScale}
            active={!!mine}
            animate={toss ? "toss" : null}
            bump={!!add}
            tossDx={toss ? toss.dx : 0}
            tossDy={toss ? toss.dy : 0}
            duration={cine.duration || 230}
          />
        );
      })}

      {/* ── CINÉMATIQUE : jetons en vol ── */}
      {/* §14 — raise : les nouveaux jetons partent du joueur et rejoignent sa pile. */}
      {cine.add && (
        <ChipFly
          key={`add-${cine.add.seq}`}
          x={cine.add.x} y={cine.add.y} dx={cine.add.dx} dy={cine.add.dy}
          amount={cine.add.amount} allin={cine.add.allin} kind={cine.add.kind}
          scale={betScale} duration={cine.duration || 210}
        />
      )}
      {/* §16 — fin de tour d'enchères : chaque contribution rejoint le pot. */}
      {cine.collects.map(f => (
        <ChipFly
          key={f.id}
          x={f.x} y={f.y} dx={f.dx} dy={f.dy}
          amount={f.amount} allin={f.allin} kind={f.kind} label={f.label}
          scale={betScale} duration={cine.duration || 300} delay={f.delay}
        />
      ))}

      {/* ── BOUTON DEALER (§20) ── */}
      {dlrPt && (
        <div className="pf-dealer-button"
          style={{ left: `${dlrPt.x}%`, top: `${dlrPt.y}%`, "--pf-dealer-scale": dealerScale }}>D</div>
      )}
    </div>
  );
}
