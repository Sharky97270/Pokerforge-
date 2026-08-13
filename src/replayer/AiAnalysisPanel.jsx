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
import { PROV, PROV_META } from "./solverPackage.js";
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
      <span style={{ minWidth: 50, fontSize: 9, fontWeight: 700, fontFamily: T.stats,
        color: highlight ? "#10D87A" : T.text3, textTransform: "capitalize" }}>{label}</span>
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

/* Mesure d'écart affichée. Le CFR renvoie des FRÉQUENCES, pas des EV : on
   annonce alors un écart à l'équilibre en points, jamais une perte en bb. */
function GapReadout({ metric, evLossBB, freqGapPts, label, col }) {
  const freq = metric === "frequency";
  const v = freq ? freqGapPts : evLossBB;
  if (v == null) return null;
  return (
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div style={{ fontSize: 8, color: T.text4, fontFamily: T.stats }}>
        {freq ? "Écart à l'équilibre" : label}
      </div>
      <div style={{ fontFamily: T.brand, fontSize: 15, fontWeight: 900, color: col }}>
        {freq ? `${Math.round(v)} pts` : `-${v.toFixed(2)}bb`}
      </div>
    </div>
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
    const strat = src?.strategy || null;
    const ev = src?.ev || null;
    const best = src?.recommended ? String(src.recommended).toLowerCase() : null;
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
                <FreqRow key={k} label={k} value={v} evBb={ev?.[k]} highlight={k === best} />
              ))
            : <div style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, lineHeight: 1.55 }}>
                {!src
                  ? "Étape sans décision Hero — avance le curseur jusqu'à une action de Hero."
                  : "Aucune fréquence de référence disponible pour ce spot."}
              </div>}
        {solverPkg?.equity && (
          <div style={{ marginTop: 7, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,.06)",
            display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 8.5, color: T.text3, fontFamily: T.stats, flex: 1 }}>Équité Hero</span>
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
              <Section title="Verdict" right={<ProvBadge prov={PROV.AI_INTERPRETATION} />}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: `radial-gradient(circle,${rm.col}25,${rm.col}08)`, border: `2px solid ${rm.col}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17, color: rm.col, fontWeight: 900 }}>{rm.ico}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: rm.col, fontFamily: T.stats }}>{rm.lbl}</div>
                    <div style={{ fontSize: 10.5, color: T.text3, fontFamily: T.stats, marginTop: 2, lineHeight: 1.5 }}>
                      Hero : <b style={{ color: T.gold }}>{analysis.verdict?.heroAction || "—"}</b>
                      {analysis.verdict?.preferredAction && <> · Préférée : <b style={{ color: "#3ED598" }}>{analysis.verdict.preferredAction}</b></>}
                    </div>
                  </div>
                  {/* Écart : valeur SOLVEUR, jamais celle du modèle. */}
                  {mode === "decision" && target && (
                    <GapReadout metric={target.metric} evLossBB={target.evLossBB}
                      freqGapPts={target.freqGapPts} label="EV perdue" col={rm.col} />
                  )}
                  {mode === "full_hand" && typeof solverPkg?.totalEvLossBB === "number" && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 8, color: T.text4, fontFamily: T.stats }}>EV perdue totale</div>
                      <div style={{ fontFamily: T.brand, fontSize: 15, fontWeight: 900, color: rm.col }}>
                        -{solverPkg.totalEvLossBB}bb
                      </div>
                    </div>
                  )}
                </div>
                {analysis.verdict?.rationale && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: T.text2, fontFamily: T.stats, lineHeight: 1.65 }}>
                    {analysis.verdict.rationale}
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

          {mode === "full_hand" && analysis.streets && (
            <Section title="Street par street" right={<ProvBadge prov={PROV.AI_INTERPRETATION} />}>
              {["preflop", "flop", "turn", "river"].map(s => {
                const st = analysis.streets[s];
                if (!st || st.status === "not_played") return null;
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
