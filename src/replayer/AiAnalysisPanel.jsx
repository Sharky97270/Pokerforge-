/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : PANNEAU D'ANALYSE IA (§15/§16/§17/§18/§19)

   Composant PRÉSENTATIONNEL. Il n'appelle rien, ne calcule rien : il rend
   l'état d'analyse porté par le Replayer.

   Séparation stricte des responsabilités à l'écran :
     • les CHIFFRES (fréquences, EV, équité) viennent de `solverPkg` et
       portent un badge de provenance « donnée calculée » ;
     • le TEXTE vient de l'IA et porte un badge visuellement distinct.
   Aucun nombre affiché ici ne provient du modèle de langage.
═══════════════════════════════════════════════════════════════ */
import React from "react";
import { T } from "../theme.js";
import { PROV, PROV_META, ORIGIN, ORIGIN_META } from "./solverPackage.js";
import { semFr, familyOf } from "./pokerState.js";
import { LOADING_STEPS } from "./aiAnalysis.js";

const RATING_META = {
  excellent: { col: "#10D87A", ico: "★", lbl: "Excellente décision" },
  good:      { col: "#3ED598", ico: "✓", lbl: "Bonne décision" },
  neutral:   { col: "#FFC247", ico: "≈", lbl: "Décision neutre" },
  mistake:   { col: "#FF8A3D", ico: "✗", lbl: "Erreur" },
  blunder:   { col: "#FF4560", ico: "‼", lbl: "Erreur critique" },
};
const STATUS_META = {
  good:       { col: "#3ED598", lbl: "OK" },
  neutral:    { col: "#FFC247", lbl: "Neutre" },
  mistake:    { col: "#FF8A3D", lbl: "Erreur" },
  not_played: { col: "#6F81A8", lbl: "Non jouée" },
};
const SEV_COL = { low: "#6F81A8", medium: "#FFC247", high: "#FF4560" };

/* ── §D — VERDICT DU MOTEUR, distinct de l'appréciation de l'IA ──
   PokerForge classe la décision (A+ → D) sans le moindre appel réseau. Ne pas
   l'afficher laissait l'utilisateur sans jugement dès que l'IA échouait, alors
   que la réponse était déjà calculée. Et colorer un chiffre du MOTEUR avec le
   `rating` choisi par le MODÈLE mélangeait deux autorités : la couleur de
   l'écart suit désormais la classification du moteur. */
const CLASS_META = {
  EXCELLENTE:     { col: "#10D87A", ico: "★", lbl: "Excellente" },
  BONNE:          { col: "#3ED598", ico: "✓", lbl: "Bonne" },
  IMPRECISION:    { col: "#FFC247", ico: "≈", lbl: "Imprécision" },
  ERREUR:         { col: "#FF8A3D", ico: "✗", lbl: "Erreur" },
  ERREUR_CRITIQUE:{ col: "#FF4560", ico: "‼", lbl: "Erreur critique" },
  NON_EVALUEE:    { col: "#6F81A8", ico: "—", lbl: "Non évaluée" },
};
export const engineClassMeta = c => CLASS_META[c] || CLASS_META.NON_EVALUEE;

/* Badge de provenance (§16). Une donnée calculée et une interprétation IA
   n'ont JAMAIS le même style : plein vs pointillé. */
export function ProvBadge({ prov, title }) {
  const m = PROV_META[prov] || PROV_META.UNAVAILABLE;
  return (
    <span title={title || m.desc} style={{
      fontSize: 7, fontWeight: 800, letterSpacing: ".06em", color: m.col,
      background: m.computed ? `${m.col}1A` : "transparent",
      border: `1px ${m.computed ? "solid" : "dashed"} ${m.col}${m.computed ? "66" : "88"}`,
      borderRadius: 4, padding: "1px 5px", fontFamily: T.stats, whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 3,
    }}>{m.computed ? "◉" : "◌"} {m.label}</span>
  );
}

function Section({ title, right, children }) {
  return (
    <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid #0F2258", borderRadius: 8, padding: "9px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, letterSpacing: ".12em",
          textTransform: "uppercase", fontWeight: 700, flex: 1 }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

/* Barre de fréquence — valeurs issues du SOLVEUR uniquement. */
function FreqRow({ label, value, evBb, highlight }) {
  const p = Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
      {/* Pas de `capitalize` : les libellés sémantiques sont déjà rédigés
          (« call de l'open »), et la règle CSS les massacrait mot à mot en
          « Call De L'open ». On met une majuscule initiale, rien de plus. */}
      <span style={{ minWidth: 62, fontSize: 9, fontWeight: 700, fontFamily: T.stats,
        color: highlight ? "#10D87A" : T.text3,
        display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={label}>
        {typeof label === "string" && label ? label[0].toUpperCase() + label.slice(1) : label}
      </span>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,.06)", borderRadius: 4, overflow: "hidden", minWidth: 34 }}>
        <div style={{ height: "100%", width: `${p}%`, borderRadius: 4,
          background: highlight ? "linear-gradient(90deg,#10D87A,#3ED598)" : "rgba(159,176,204,.45)" }} />
      </div>
      <span style={{ minWidth: 30, textAlign: "right", fontSize: 8.5, fontFamily: T.stats, color: T.text3 }}>{p}%</span>
      <span style={{ minWidth: 40, textAlign: "right", fontSize: 8.5, fontFamily: "'JetBrains Mono',monospace",
        color: typeof evBb === "number" ? (evBb >= 0 ? "#3ED598" : T.red) : T.text4 }}>
        {typeof evBb === "number" ? `${evBb >= 0 ? "+" : ""}${evBb.toFixed(2)}` : "—"}
      </span>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   §8 — BLOC VERDICT

   L'ancien affichage tenait en une ligne : « Hero : fold · Préférée : raise ».
   Deux mots génériques, aucune indication de ce que Hero affrontait, aucune
   idée de la solidité de la donnée. On déplie donc : action réellement jouée,
   action recommandée NOMMÉE en vocabulaire poker, alternatives chiffrées,
   écart mesuré, et provenance — l'indisponibilité du solveur exact étant
   affichée franchement plutôt que masquée.

   Ce bloc ne lit QUE `target` (données PokerForge). Aucun de ses libellés ni
   de ses chiffres ne vient du modèle de langage.
═══════════════════════════════════════════════════════════════ */
function ActionLine({ label, value, sub, col, big }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "2px 0" }}>
      <span style={{ minWidth: 92, fontSize: 7.5, color: T.text4, fontFamily: T.stats,
        letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: big ? 13 : 11, fontWeight: 800, color: col || T.text2, fontFamily: T.stats }}>{value}</span>
      {sub && <span style={{ fontSize: 9, color: T.text4, fontFamily: T.stats }}>{sub}</span>}
    </div>
  );
}

function VerdictBlock({ target, mode }) {
  if (mode === "full_hand" || !target) return null;
  const heroFr = target.heroSemanticFr || target.playedLabel || "—";
  const recoFr = target.recommendedSemanticFr || null;
  const strat = target.strategyBySemantic || null;
  const recoFreq = recoFr && strat ? strat[target.recommendedSemantic] : null;
  const origin = target.origin || ORIGIN.UNAVAILABLE;
  const om = ORIGIN_META[origin] || ORIGIN_META.UNAVAILABLE;
  const cm = engineClassMeta(target.classification);
  const solverExact = origin === ORIGIN.SOLVER_EXACT || origin === ORIGIN.SOLVER_LOOKUP;
  const freqMetric = target.metric === "frequency";
  const gap = freqMetric ? target.freqGapPts : target.evLossBB;

  /* Alternatives = tout sauf l'action recommandée, triées par fréquence. */
  const alts = strat
    ? Object.entries(strat).filter(([k]) => k !== target.recommendedSemantic)
        .sort((a, b) => b[1] - a[1])
    : [];

  return (
    <Section title="Verdict" right={<ProvBadge prov={target.source || PROV.UNAVAILABLE} />}>
      <ActionLine label="Action Hero" value={heroFr} col={T.gold} big />
      {target.pokerState?.facingActionFr && (
        <ActionLine label="Face à" value={target.pokerState.facingActionFr}
          sub={target.pokerState.lastAggressor
            ? `${target.pokerState.lastAggressor.position} · ${target.pokerState.lastAggressor.toAmountBB}bb`
            : null} />
      )}
      <div style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "5px 0" }} />
      {recoFr
        ? <ActionLine label="Recommandée" value={recoFr}
            sub={recoFreq != null ? `${Math.round(recoFreq)} %` : null} col="#3ED598" big />
        : <ActionLine label="Recommandée" value="non disponible"
            sub="aucune référence stratégique sur ce spot" col={T.text4} />}
      {/* §5 : le sizing n'est affiché que s'il existe. Pas de « 2.1bb » fantôme.
          Et quand il existe sans venir d'un solveur, on le dit : « usuel » n'est
          pas « optimal ». */}
      <ActionLine label="Sizing"
        value={target.recommendedSizingBb != null ? `${target.recommendedSizingBb}bb` : "non disponible"}
        sub={target.recommendedSizingBb != null && !solverExact ? "repère usuel" : null}
        col={target.recommendedSizingBb != null ? T.text2 : T.text4} />

      {alts.length > 0 && (
        <>
          <div style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "5px 0" }} />
          <div style={{ fontSize: 7.5, color: T.text4, fontFamily: T.stats, letterSpacing: ".1em",
            textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>Alternatives</div>
          {alts.map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "1px 0" }}>
              <span style={{ flex: 1, fontSize: 10, color: T.text3, fontFamily: T.stats }}>{semFr(k)}</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: T.text3 }}>{Math.round(v)} %</span>
            </div>
          ))}
        </>
      )}

      {gap != null && (
        <>
          <div style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "5px 0" }} />
          <ActionLine
            label={freqMetric ? "Écart équilibre" : "EV perdue est."}
            value={freqMetric ? `${Math.round(gap)} pts` : `-${Number(gap).toFixed(2)}bb`}
            col={cm.col} big />
        </>
      )}

      {/* §D — le jugement de PokerForge, disponible SANS l'IA et affiché comme
          tel. C'est lui qui répond « ton fold est-il bon ? » même quand
          l'analyse IA échoue. */}
      {target.classification && (
        <div style={{ marginTop: 7, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,.07)",
          display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: `${cm.col}18`, border: `1.5px solid ${cm.col}`, color: cm.col,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 900 }}>{cm.ico}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 7.5, color: T.text4, fontFamily: T.stats,
              letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700 }}>Verdict PokerForge</div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: cm.col, fontFamily: T.stats }}>
              {target.verdict || cm.lbl}
            </div>
          </div>
          <span style={{ fontFamily: T.brand, fontSize: 17, fontWeight: 900, color: cm.col }}>
            {target.grade || "—"}
          </span>
          <ProvBadge prov={target.source || PROV.UNAVAILABLE} title="Note calculée par PokerForge, sans l'IA." />
        </div>
      )}

      {/* §6/§8 : la provenance est une information de premier plan, pas une note
          de bas de page. Quand le solveur exact n'a pas de réponse, on le dit. */}
      <div style={{ marginTop: 7, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,.07)" }}>
        <ActionLine label="Source" value={om.label} col={solverExact ? "#10D87A" : "#FFC247"} />
        {!solverExact && (
          <div style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, lineHeight: 1.5, marginTop: 2 }}>
            Solveur exact indisponible sur ce spot.
            {target.strategyScope === "range" &&
              " Les fréquences décrivent la range entière à ce nœud, pas cette main précise."}
          </div>
        )}
      </div>
    </Section>
  );
}

export default function AiAnalysisPanel({
  aiState, solverPkg, mode, setMode, onAnalyze, onRetry, signedIn, hasHand, cfrSolving,
}) {
  const status = aiState?.status || "idle";
  const analysis = aiState?.analysis || null;
  const meta = aiState?.meta || null;
  const err = aiState?.error || null;
  const target = solverPkg?.target || null;

  const numbersBlock = (() => {
    if (!solverPkg) return null;
    const full = mode === "full_hand";
    const src = full ? null : target;
    /* Fréquences indexées par ACTION SÉMANTIQUE quand elles existent : « 3-bet
       18 % » plutôt que « raise 18 % ». Le repli sur les familles mécaniques
       ne sert que pour les spots sans contexte de mise. */
    const bySem = src?.strategyBySemantic || null;
    const strat = bySem || src?.strategy || null;
    const semKeys = !!bySem;
    const ev = src?.ev || null;
    const best = semKeys
      ? src?.recommendedSemantic || null
      : (src?.recommended ? String(src.recommended).toLowerCase() : null);
    const decisions = solverPkg.decisions || [];
    return (
      // Les chiffres viennent TOUJOURS du package solveur (§9) : en mode
      // « décision » les fréquences du spot, en mode « main complète » le
      // relevé des décisions Hero. Aucune de ces valeurs ne vient du modèle.
      <Section title={full ? "Décisions Hero" : "Stratégie"}
        right={<ProvBadge prov={(full ? decisions[0]?.source : src?.source) || PROV.UNAVAILABLE} />}>
        {full
          ? (decisions.length
              ? decisions.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                    <span style={{ minWidth: 42, fontSize: 8, color: T.text4, fontFamily: T.stats, textTransform: "capitalize" }}>{d.street}</span>
                    <span style={{ flex: 1, fontSize: 8.5, color: T.text3, fontFamily: T.stats, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.playedLabel || d.played}</span>
                    {(() => {
                      const freq = d.metric === "frequency";
                      const v = freq ? d.freqGapPts : d.evLossBB;
                      const bad = freq ? v > 20 : v > 0.4;
                      return (
                        <span style={{ fontSize: 8.5, fontFamily: "'JetBrains Mono',monospace",
                          color: v == null ? T.text4 : bad ? "#FF8A3D" : "#3ED598" }}
                          title={freq ? "Écart à la fréquence d'équilibre (points)" : "Perte d'EV estimée (bb)"}>
                          {v == null ? "—" : freq ? `${Math.round(v)}pts` : `-${v.toFixed(2)}`}
                        </span>
                      );
                    })()}
                  </div>
                ))
              : <div style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats }}>Aucune décision Hero évaluable.</div>)
          : strat
            ? Object.entries(strat).map(([k, v]) => (
                /* Les EV sont indexées par FAMILLE mécanique (raise/call/fold)
                   alors que les fréquences le sont par action sémantique : on
                   traduit, sinon la colonne EV se vide sans raison. */
                <FreqRow key={k} label={semKeys ? semFr(k) : k}
                  value={semKeys ? v / 100 : v}
                  evBb={semKeys ? ev?.[String(familyOf(k) || "").toLowerCase()] : ev?.[k]}
                  highlight={k === best} />
              ))
            : <div style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, lineHeight: 1.55 }}>
                {!src
                  ? "Étape sans décision Hero — avance le curseur jusqu'à une action de Hero."
                  : "Aucune fréquence de référence disponible pour ce spot."}
              </div>}
        {solverPkg?.equity && (
          <div style={{ marginTop: 7, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,.06)",
            display: "flex", alignItems: "center", gap: 6 }}>
            {/* La street est affichée AVEC la valeur : une équité sans son board
                est ambiguë, et c'est ainsi qu'une équité de river a pu s'afficher
                à côté d'une décision préflop. */}
            <span style={{ fontSize: 8.5, color: T.text3, fontFamily: T.stats, flex: 1 }}>
              Équité Hero
              {solverPkg.equity.street && (
                <span style={{ color: T.text4 }}> · {solverPkg.equity.street}</span>
              )}
            </span>
            <span style={{ fontFamily: T.brand, fontSize: 13, fontWeight: 900, color: T.cyan }}>
              {solverPkg.equity.value}%
            </span>
            <ProvBadge prov={solverPkg.equity.source} title={solverPkg.equity.rangeNote} />
          </div>
        )}
      </Section>
    );
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Sélecteur de mode (§11/§12) ── */}
      <div style={{ display: "flex", gap: 4 }}>
        {[["decision", "Décision"], ["full_hand", "Main complète"]].map(([m, lbl]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: "5px 4px", borderRadius: 6, fontSize: 8.5, fontWeight: 700, cursor: "pointer",
            fontFamily: T.stats, background: mode === m ? "rgba(255,194,71,.12)" : "#030D2A",
            border: `1px solid ${mode === m ? "rgba(255,194,71,.4)" : "#152D6E"}`,
            color: mode === m ? T.gold : T.text4,
          }}>{lbl}</button>
        ))}
      </div>

      {/* ── §8 : verdict factuel PokerForge — visible SANS l'IA. C'est le
             moteur qui décrit le spot ; l'IA ne fait que l'expliquer plus bas. ── */}
      <VerdictBlock target={target} mode={mode} />

      {/* ── Chiffres solveur : toujours visibles, même sans IA (§18/§19) ── */}
      {numbersBlock}

      {/* ── Niveau de confiance des données (§19) ── */}
      {solverPkg && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6,
          background: solverPkg.level <= 2 ? "rgba(52,216,255,.05)" : "rgba(255,194,71,.05)",
          border: `1px solid ${solverPkg.level <= 2 ? "rgba(52,216,255,.2)" : "rgba(255,194,71,.2)"}` }}>
          <span style={{ fontSize: 8, color: T.text4, fontFamily: T.stats, fontWeight: 700 }}>NIVEAU {solverPkg.level}</span>
          <span style={{ flex: 1, fontSize: 8.5, color: T.text3, fontFamily: T.stats }}>{solverPkg.levelLabel}</span>
          {/* Le CFR tourne dans un Worker : on le dit, sans bloquer la lecture. */}
          {cfrSolving && (
            <span style={{ fontSize: 8, color: "#34D8FF", fontFamily: T.stats, whiteSpace: "nowrap" }}>
              ◆ CFR en cours…
            </span>
          )}
        </div>
      )}
      {solverPkg?.disclaimer && status !== "loading" && (
        <div style={{ fontSize: 8, color: T.text4, fontFamily: T.stats, fontStyle: "italic", lineHeight: 1.5, padding: "0 2px" }}>
          {solverPkg.disclaimer}
        </div>
      )}

      {/* ── Action ── */}
      {status !== "loading" && (
        <button className="btn btng" disabled={!hasHand}
          style={{ fontSize: 9.5, width: "100%", fontWeight: 700,
            background: "linear-gradient(135deg,#9B5CFF,#34D8FF)" }}
          onClick={onAnalyze}>
          {analysis ? "↻ Relancer l'analyse" : "⚡ Analyser avec l'IA"}
        </button>
      )}

      {/* ── Chargement par étapes (§17) ── */}
      {status === "loading" && (
        <Section title="Analyse de la main…">
          {LOADING_STEPS.map((s, i) => {
            const done = (aiState?.stepIndex ?? 0) > i;
            const cur = (aiState?.stepIndex ?? 0) === i;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0",
                fontSize: 9, fontFamily: T.stats, color: done ? "#3ED598" : cur ? T.gold : T.text4 }}>
                <span style={{ width: 12 }}>{done ? "✓" : cur ? "◆" : "○"}</span>
                <span>{s}</span>
              </div>
            );
          })}
        </Section>
      )}

      {/* ── Erreur PokerForge (§18) ── */}
      {status === "error" && err && (
        <div style={{ background: "rgba(255,69,96,.05)", border: "1px solid rgba(255,69,96,.22)",
          borderRadius: 8, padding: "10px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#FF8A3D", fontFamily: T.stats, marginBottom: 4 }}>
            {err.title}
          </div>
          <div style={{ fontSize: 9, color: T.text3, fontFamily: T.stats, lineHeight: 1.6 }}>{err.message}</div>
          {err.retryAfter ? (
            <div style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, marginTop: 4 }}>
              Réessaie dans {err.retryAfter}s.
            </div>
          ) : null}
          {err.retryable && (
            <button className="btn btns" style={{ fontSize: 8.5, marginTop: 8, width: "100%" }} onClick={onRetry}>
              ↻ Réessayer
            </button>
          )}
        </div>
      )}

      {/* ── Résultat IA ── */}
      {status === "ready" && analysis && (
        <>
          {(() => {
            const rm = RATING_META[analysis.verdict?.rating] || RATING_META.neutral;
            return (
              /* Appréciation de l'IA. Les FAITS (action jouée, action
                 recommandée, fréquences, écart, provenance) sont déjà affichés
                 plus haut par VerdictBlock, à partir des seules données
                 PokerForge : on ne les redit pas ici avec les mots du modèle,
                 sinon deux versions du même fait cohabitent à l'écran. */
              <Section title="Appréciation" right={<ProvBadge prov={PROV.AI_INTERPRETATION} />}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: `radial-gradient(circle,${rm.col}25,${rm.col}08)`, border: `2px solid ${rm.col}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17, color: rm.col, fontWeight: 900 }}>{rm.ico}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: rm.col, fontFamily: T.stats }}>{rm.lbl}</div>
                    {analysis.confidence && (
                      <div style={{ fontSize: 9, color: T.text4, fontFamily: T.stats, marginTop: 2 }}>
                        Confiance de l'analyse : {{ high: "élevée", medium: "moyenne", low: "faible" }[analysis.confidence] || analysis.confidence}
                      </div>
                    )}
                  </div>
                  {/* §A — deux mesures, jamais confondues, et JAMAIS un zéro
                      par défaut. Une main dont aucune décision n'est chiffrée
                      en bb n'a pas « perdu 0bb » : elle affiche son plus grand
                      écart à l'équilibre, ou rien du tout. */}
                  {mode === "full_hand" && typeof solverPkg?.totalEvLossBB === "number" && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 8, color: T.text4, fontFamily: T.stats }}>EV perdue totale</div>
                      <div style={{ fontFamily: T.brand, fontSize: 15, fontWeight: 900,
                        color: solverPkg.totalEvLossBB > 1.5 ? "#FF4560"
                          : solverPkg.totalEvLossBB > 0.4 ? "#FFC247" : "#3ED598" }}>
                        -{solverPkg.totalEvLossBB}bb
                      </div>
                    </div>
                  )}
                  {mode === "full_hand" && solverPkg?.totalEvLossBB == null
                    && typeof solverPkg?.worstFreqGapPts === "number" && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 8, color: T.text4, fontFamily: T.stats }}
                        title="Plus grand écart à la fréquence d'équilibre parmi les décisions de Hero. Ce n'est pas une perte en bb.">
                        Écart max équilibre
                      </div>
                      <div style={{ fontFamily: T.brand, fontSize: 15, fontWeight: 900,
                        color: solverPkg.worstFreqGapPts > 35 ? "#FF4560"
                          : solverPkg.worstFreqGapPts > 15 ? "#FFC247" : "#3ED598" }}>
                        {Math.round(solverPkg.worstFreqGapPts)} pts
                      </div>
                    </div>
                  )}
                </div>
                {analysis.verdict?.rationale && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: T.text2, fontFamily: T.stats, lineHeight: 1.65 }}>
                    {analysis.verdict.rationale}
                  </div>
                )}
                {analysis.warnings?.length > 0 && (
                  <div style={{ marginTop: 7, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,.07)" }}>
                    {analysis.warnings.slice(0, 3).map((w, i) => (
                      <div key={i} style={{ fontSize: 9.5, color: "#FFC247", fontFamily: T.stats, lineHeight: 1.5 }}>⚠ {w}</div>
                    ))}
                  </div>
                )}
              </Section>
            );
          })()}

          <Section title="Pourquoi ?" right={<ProvBadge prov={PROV.AI_INTERPRETATION} />}>
            <div style={{ fontSize: 11.5, color: T.text2, fontFamily: T.stats, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {analysis.summary}
            </div>
          </Section>

          {/* §9 — le raisonnement stratégique, séparé du résumé : c'est la
              partie qui doit généraliser (principe, pas anecdote). */}
          {analysis.strategicReason && (
            <Section title="Raisonnement stratégique" right={<ProvBadge prov={PROV.AI_INTERPRETATION} />}>
              <div style={{ fontSize: 11.5, color: T.text2, fontFamily: T.stats, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {analysis.strategicReason}
              </div>
            </Section>
          )}

          {mode === "full_hand" && analysis.streets && (
            <Section title="Street par street" right={<ProvBadge prov={PROV.AI_INTERPRETATION} />}>
              {["preflop", "flop", "turn", "river"].map(s => {
                const st = analysis.streets[s];
                if (!st || st.status === "not_played") return null;
                /* §B — dernier rempart d'affichage : une street où Hero n'a
                   pris aucune décision n'est PAS la sienne. Quand il jette
                   préflop, le coup continue sans lui jusqu'à la river ; le
                   commenter serait décrire un joueur absent. */
                if (solverPkg?.heroStreets && !solverPkg.heroStreets.includes(s)) return null;
                const sm = STATUS_META[st.status] || STATUS_META.neutral;
                return (
                  <div key={s} style={{ marginBottom: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: sm.col, fontFamily: T.stats,
                        textTransform: "capitalize" }}>{s}</span>
                      <span style={{ fontSize: 7, color: sm.col, border: `1px solid ${sm.col}55`,
                        background: `${sm.col}14`, borderRadius: 3, padding: "0 4px", fontFamily: T.stats,
                        fontWeight: 700 }}>{sm.lbl}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: T.text3, fontFamily: T.stats, lineHeight: 1.6 }}>{st.analysis}</div>
                  </div>
                );
              })}
            </Section>
          )}

          {analysis.keyConcepts?.length > 0 && (
            <Section title="Concepts">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {analysis.keyConcepts.slice(0, 8).map((c, i) => (
                  <span key={i} style={{ fontSize: 9.5, color: "#7EB8FF", background: "rgba(31,139,255,.08)",
                    border: "1px solid rgba(31,139,255,.2)", borderRadius: 20, padding: "2px 8px",
                    fontFamily: T.stats }}>{c}</span>
                ))}
              </div>
            </Section>
          )}

          {analysis.detectedLeaks?.length > 0 && (
            <Section title="Observations sur cette main" right={<ProvBadge prov={PROV.AI_INTERPRETATION} />}>
              {analysis.detectedLeaks.slice(0, 6).map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 6, padding: "3px 0", alignItems: "flex-start" }}>
                  <span style={{ color: SEV_COL[l.severity] || T.text4, fontSize: 9, marginTop: 1 }}>●</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, color: T.text2, fontFamily: T.stats, lineHeight: 1.55 }}>{l.description}</div>
                    <div style={{ fontSize: 7, color: T.text4, fontFamily: T.stats, marginTop: 1 }}>
                      {l.street} · {l.type}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 5, fontSize: 7.5, color: T.text4, fontFamily: T.stats, fontStyle: "italic" }}>
                Observations sur UNE main — un leak récurrent demande plusieurs mains.
              </div>
            </Section>
          )}

          {analysis.coachAdvice && (
            <Section title="Conseil du coach" right={<ProvBadge prov={PROV.AI_INTERPRETATION} />}>
              <div style={{ fontSize: 11.5, color: T.text2, fontFamily: T.stats, lineHeight: 1.7 }}>{analysis.coachAdvice}</div>
            </Section>
          )}

          {analysis.dataGaps?.length > 0 && (
            <Section title="Données indisponibles" right={<ProvBadge prov={PROV.UNAVAILABLE} />}>
              {analysis.dataGaps.slice(0, 5).map((g, i) => (
                <div key={i} style={{ fontSize: 10, color: T.text4, fontFamily: T.stats, padding: "2px 0", lineHeight: 1.5 }}>— {g}</div>
              ))}
            </Section>
          )}

          {/* ── SOURCE (§15/§16) ── */}
          <Section title="Source">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>
              {(solverPkg?.sources || []).map(s => <ProvBadge key={s} prov={s} />)}
              <ProvBadge prov={PROV.AI_INTERPRETATION} />
            </div>
            <div style={{ fontSize: 7.5, color: T.text4, fontFamily: T.stats, lineHeight: 1.5 }}>
              {meta?.model ? `Modèle ${meta.model} · ` : ""}{meta?.promptVersion || ""}
              {meta?.cache === "HIT" ? " · analyse mise en cache" : ""}
            </div>
          </Section>
        </>
      )}

      {/* ── État initial ── */}
      {status === "idle" && !analysis && (
        <div style={{ textAlign: "center", padding: "14px 8px" }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>⚡</div>
          <div style={{ fontSize: 9, color: T.text4, fontFamily: T.stats, lineHeight: 1.6 }}>
            {hasHand
              ? "Lance l'analyse : SharkSolver calcule, PokerForge AI explique."
              : "Importe une main pour lancer l'analyse."}
          </div>
          {!signedIn && hasHand && (
            <div style={{ fontSize: 8.5, color: T.gold, fontFamily: T.stats, marginTop: 8, lineHeight: 1.5 }}>
              Connexion requise pour l'analyse IA.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
