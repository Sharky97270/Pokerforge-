/* ══════════════════════════════════════════════════════════════════════════
   PokerForge — PANNEAU ADAPTIVE SIZING (Mission §23, §24, §25, §26, §27,
   §22, §36, §57, §59, §110)

   L'interface du moteur PFASE dans SharkSolver. Elle N'IMPLÉMENTE AUCUNE LOGIQUE
   STRATÉGIQUE : elle décrit une demande, la transmet au Worker, et affiche ce
   que le moteur a réellement mesuré. §3 l'exige — « Ne pas mettre la logique
   d'optimisation directement dans les composants React ».

   Ce qui est affiché ne l'est QUE si le moteur l'a produit :
     · un sizing retenu, avec sa perte d'EV et le plancher sous lequel cette
       perte n'est pas mesurable (§14/§21) ;
     · un classement de sizings issu de mesures (§15) ;
     · une provenance et un statut, jamais un badge décoratif (§18/§22).

   Design : jetons du thème existant, aucune refonte visuelle (§70).
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { T } from "../../theme.js";
import {
  BETTING_TREE_MODES, BETTING_TREE_MODE_META, complexitiesFor, COMPLEXITY_LIMITS,
  SIZING_COMPLEXITIES, SolveStatus, EV_LOSS_PRESETS, adaptiveSizingEnabled,
} from "../../sizing/config.js";
import {
  SizingType, potSizing, previousBetSizing, geometricSizing, bbSizing, jamSizing,
  specKey, specLabel, SIZING_UNIT_LABEL,
} from "../../sizing/sizingSpec.js";
import { CANDIDATE_PROFILES } from "../../sizing/candidateGenerator.js";
import { solveAsync, isWorkerAvailable } from "../../sizing/pfaseClient.js";
import { EXPLOIT_PROFILES } from "../../solver/core/exploitProfiles.js";
import { describeSolution } from "../../sizing/pfase.js";

/* ── §27 — PRÉRÉGLAGES POKERFORGE ─────────────────────────────────────────
   « Les presets ne doivent pas être des vérités stratégiques. Ils décrivent le
   niveau de complexité du solve. » Aucun ne contient de recommandation : ils
   fixent un MODE, un NIVEAU et une AMPLEUR d'exploration. */
export const PF_PRESETS = [
  { id: "pf_auto", label: "PF Automatic", mode: "AUTOMATIC", complexity: "SIMPLE", profile: "standard",
    desc: "PokerForge choisit les candidats et les sizings retenus." },
  { id: "pf_single", label: "PF Single Size", mode: "SINGLE", complexity: "SINGLE", profile: "standard",
    desc: "Un seul sizing par nœud, sélectionné par comparaison d'EV." },
  { id: "pf_simple", label: "PF Simple", mode: "DYNAMIC", complexity: "SIMPLE", profile: "standard",
    desc: "Jusqu'à 2 mises et 1 relance." },
  { id: "pf_advanced", label: "PF Advanced", mode: "DYNAMIC", complexity: "ADVANCED", profile: "wide",
    desc: "Jusqu'à 3 mises et 2 relances, exploration large." },
  { id: "pf_full", label: "PF Full", mode: "FIXED", complexity: "FULL", profile: "standard",
    desc: "Votre arbre, résolu tel quel." },
];

/* Sizings proposés à la sélection — CANDIDATS, pas recommandations (§8). */
const BET_CHOICES = [0.20, 0.25, 0.33, 0.50, 0.66, 0.75, 1.00, 1.25, 1.50, 2.00];
const RAISE_CHOICES = [2.0, 2.2, 2.5, 3.0, 3.5];

const box = { background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10 };
const label = { fontSize: 9, color: T.text3, fontFamily: T.stats, letterSpacing: .4, textTransform: "uppercase" };
const chip = (on, col = T.purple) => ({
  padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontFamily: T.stats,
  border: `1px solid ${on ? col : T.border}`,
  background: on ? `${col}22` : "transparent",
  color: on ? col : T.text3, whiteSpace: "nowrap",
});

export default function AdaptiveSizingPanel({
  /* Tout vient de l'appelant : le panneau ne calcule aucun état de jeu. */
  stateInput, heroRange, villainRange, disabled, disabledReason,
  onSolution,
  /* §87 — « une solution produite dans SharkSolver peut être immédiatement
     saved / loaded / opened / trained against SANS RECOPIER MANUELLEMENT SES
     SIZINGS ». Ce rappel est la porte de sortie vers le Trainer. */
  onTrainSolution,
  /* §67/§69 — une table par solution : plusieurs identifiants d un coup. */
  onTrainMany,
}) {
  const enabled = adaptiveSizingEnabled();

  const [preset, setPreset] = useState("pf_auto");
  const [mode, setMode] = useState("AUTOMATIC");
  const [complexity, setComplexity] = useState("SIMPLE");
  const [profile, setProfile] = useState("standard");
  const [betSel, setBetSel] = useState([0.33, 0.75, 1.5]);
  const [raiseSel, setRaiseSel] = useState([2.5]);
  const [useGeometric, setUseGeometric] = useState(true);
  const [useJam, setUseJam] = useState(true);
  const [maxEvLoss, setMaxEvLoss] = useState(null);
  const [family, setFamily] = useState(false);
  /* §45/§46 — `null` = équilibre. Un identifiant de profil bascule tout le solve
     en exploitation : les sizings sont alors choisis pour battre CE joueur-là,
     et non pour résister à un adversaire parfait. */
  const [exploitProfile, setExploitProfile] = useState(null);

  /* ── §26 · TREE EDITOR ──────────────────────────────────────────────────
     `nodePath` : le nœud actuellement inspecté, désigné par son chemin d'actions.
     `nodeOverrides` : les sizings définis POUR CE NŒUD, indexés par ce chemin.
     `treeDirty` : une modification de l'arbre invalide les résultats affichés —
     §26 l'exige explicitement, et c'est ce qui empêche de lire des fréquences
     qui décrivent un arbre qu'on vient de changer. */
  const [nodePath, setNodePath] = useState([]);
  const [nodeOverrides, setNodeOverrides] = useState({});
  const [treeDirty, setTreeDirty] = useState(false);

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const cancelRef = useRef(null);

  const allowedComplexities = useMemo(() => complexitiesFor(mode), [mode]);
  useEffect(() => {
    if (!allowedComplexities.includes(complexity)) setComplexity(allowedComplexities[0]);
  }, [allowedComplexities, complexity]);

  /* Le mode AUTOMATIC choisit lui-même ses candidats : les listes manuelles ne
     s'affichent pas, parce qu'elles ne serviraient à rien (§4). */
  const manualCandidates = mode === "DYNAMIC" || mode === "FIXED" || mode === "SINGLE";

  const applyPreset = (id) => {
    const p = PF_PRESETS.find(x => x.id === id);
    if (!p) return;
    setPreset(id); setMode(p.mode); setComplexity(p.complexity); setProfile(p.profile);
  };

  const toggle = (list, setList, v) => {
    setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v].sort((a, b) => a - b));
    /* §26 — « Une modification de l'arbre doit invalider les résultats
       dépendants. » Y compris depuis les réglages globaux, pas seulement depuis
       l'éditeur de nœud. */
    setTreeDirty(true);
  };

  const buildSpecs = useCallback(() => {
    const bets = betSel.map(potSizing);
    if (useGeometric) bets.push(geometricSizing(2));
    if (useJam) bets.push(jamSizing());
    const raises = raiseSel.map(previousBetSizing);
    if (useJam && raises.length) raises.push(jamSizing());
    return { bets, raises };
  }, [betSel, raiseSel, useGeometric, useJam]);

  const run = useCallback(() => {
    if (disabled || busy) return;
    setError(null); setResult(null); setBusy(true); setPhase(SolveStatus.QUEUED); setProgress(null);
    const { bets, raises } = buildSpecs();
    const request = {
      stateInput, heroRange, villainRange,
      mode, complexity,
      candidateProfile: profile,
      maxAcceptableEVLoss: maxEvLoss,
      /* §26 — les sizings définis nœud par nœud voyagent avec la requête. */
      ...(Object.keys(nodeOverrides).length ? { nodeOverrides } : {}),
      ...(manualCandidates ? { userBetSpecs: bets, userRaiseSpecs: raises } : {}),
      /* §45 — le modèle d'adversaire, quand il y en a un. */
      ...(exploitProfile ? { exploit: { profileId: exploitProfile } } : {}),
    };
    const { promise, cancel } = solveAsync(request, {
      family,
      onProgress: (p) => { setPhase(p.phase); setProgress(p); },
    });
    cancelRef.current = cancel;
    promise.then((r) => {
      setBusy(false); cancelRef.current = null; setPhase(r.status || null);
      if (!r.ok) { setError(r.reason || "solve échoué"); setResult(r); return; }
      setResult(r);
      /* Le résultat correspond de nouveau à l'arbre courant. */
      setTreeDirty(false);
      setNodePath([]);
      try { onSolution && onSolution(r); } catch { /* l'appelant ne casse pas le panneau */ }
    });
  }, [disabled, busy, buildSpecs, stateInput, heroRange, villainRange, mode, complexity, profile, maxEvLoss, manualCandidates, family, onSolution, nodeOverrides, exploitProfile]);

  const stop = () => { if (cancelRef.current) { cancelRef.current(); setPhase(SolveStatus.CANCELLED); } };
  useEffect(() => () => { if (cancelRef.current) cancelRef.current(); }, []);

  if (!enabled) {
    return (
      <div style={{ ...box, borderColor: T.border }}>
        <div style={label}>Adaptive Sizing</div>
        <div style={{ fontSize: 10, color: T.text4, fontFamily: T.stats, marginTop: 6 }}>
          Moteur désactivé par le drapeau <code>adaptiveSizingEngine</code>.
        </div>
      </div>
    );
  }

  return (
    <div data-pfase="panel" style={{ ...box, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── En-tête ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.text, fontFamily: T.brand }}>⚖️ Betting Structure</span>
        <span style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, fontStyle: "italic" }}>
          Adaptive Sizing Engine — les sizings sont SÉLECTIONNÉS par comparaison d'EV, pas proposés d'avance
        </span>
        {!isWorkerAvailable() && (
          <span style={{ ...chip(true, T.amber), marginLeft: "auto" }} title="Sans Web Worker, un solve gèlerait l'interface : le calcul est refusé plutôt que lancé.">
            ⚠ Worker indisponible
          </span>
        )}
      </div>

      {/* ── §27 PRESETS ── */}
      <div>
        <div style={label}>Préréglages — niveau de complexité, jamais une vérité stratégique</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
          {PF_PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)} title={p.desc} style={chip(preset === p.id, T.cyan)}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* ── §45/§46 CIBLE DU SOLVE : équilibre ou exploitation ── */}
      <div>
        <div style={label}>Cible — contre QUI le sizing est optimisé</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
          <button
            onClick={() => setExploitProfile(null)}
            title="Sizings choisis pour perdre le moins face à un adversaire qui joue parfaitement contre vous."
            style={chip(exploitProfile === null, T.cyan)}
            data-pfase-target="equilibrium">⚖️ Équilibre</button>
          {Object.entries(EXPLOIT_PROFILES).map(([id, p]) => (
            <button key={id}
              onClick={() => setExploitProfile(id)}
              title={`Sizings choisis pour gagner le plus face à ce profil. Le profil est une ESTIMATION de tendances (${Math.round(p.vsBet.F * 100)} % de folds face à une mise) ; la stratégie qui l'exploite, elle, est réellement résolue.`}
              style={chip(exploitProfile === id, T.amber)}
              data-pfase-target={id}>🎯 {p.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: exploitProfile ? T.amber : T.text4, fontFamily: T.stats, marginTop: 4 }}>
          {exploitProfile
            ? "Exploitation : les fréquences du Vilain sont VERROUILLÉES sur un modèle estimé, et les sizings sont comparés contre lui. Le résultat n'est PAS un équilibre — il bat ce joueur-là, et se fait battre par un adversaire correct."
            : "Équilibre : aucune fréquence n'est imposée au Vilain. C'est le régime par défaut, et le seul dont l'exploitabilité soit mesurable."}
        </div>
      </div>

      {/* ── §23 MODE ── */}
      <div>
        <div style={label}>Mode</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
          {BETTING_TREE_MODES.map(m => (
            <button key={m} onClick={() => { setMode(m); setPreset(null); }} title={BETTING_TREE_MODE_META[m].desc} style={chip(mode === m)}>
              {BETTING_TREE_MODE_META[m].label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: T.text4, fontFamily: T.stats, marginTop: 4 }}>{BETTING_TREE_MODE_META[mode].desc}</div>
      </div>

      {/* ── §23 COMPLEXITÉ ── */}
      <div>
        <div style={label}>Complexité</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
          {SIZING_COMPLEXITIES.map(c => {
            const allowed = allowedComplexities.includes(c);
            const lim = COMPLEXITY_LIMITS[c];
            return (
              <button key={c} disabled={!allowed} onClick={() => { setComplexity(c); setPreset(null); }}
                title={allowed ? lim.desc : `Indisponible en mode ${BETTING_TREE_MODE_META[mode].label}`}
                style={{ ...chip(complexity === c, T.green), opacity: allowed ? 1 : .35, cursor: allowed ? "pointer" : "not-allowed" }}>
                {lim.label}
                <span style={{ fontSize: 8.5, color: T.text4, marginLeft: 5 }}>
                  {lim.maxBetSizes == null ? "∞" : `${lim.maxBetSizes}B/${lim.maxRaiseSizes}R`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── §24 RÉGLAGES DYNAMIC ── */}
      {manualCandidates ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={label}>Bet sizes à comparer <UnitHint kind="pot" /></div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
              {BET_CHOICES.map(f => (
                <button key={f} onClick={() => toggle(betSel, setBetSel, f)} style={chip(betSel.includes(f), T.blue)}>{Math.round(f * 100)}%</button>
              ))}
              <button onClick={() => setUseGeometric(!useGeometric)} title="Sizing géométrique : la fraction de pot qui amène au tapis en N rues. Elle DÉPEND du SPR — jamais une constante." style={chip(useGeometric, T.cyan)}>géo 2e</button>
              <button onClick={() => setUseJam(!useJam)} title="Le tapis est une action à part entière, pas « 999 % du pot » (§74)." style={chip(useJam, T.gold)}>JAM</button>
            </div>
          </div>
          <div>
            <div style={label}>Raise sizes à comparer <UnitHint kind="previousBet" /></div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
              {RAISE_CHOICES.map(m => (
                <button key={m} onClick={() => toggle(raiseSel, setRaiseSel, m)} style={chip(raiseSel.includes(m), T.blue)}>{m}x</button>
              ))}
            </div>
            <div style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, marginTop: 5 }}>
              {betSel.length + (useGeometric ? 1 : 0) + (useJam ? 1 : 0)} candidats de mise · {raiseSel.length} de relance
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 9.5, color: T.text4, fontFamily: T.stats }}>
          Mode Automatic : les candidats sont générés par le moteur (profil <b style={{ color: T.text3 }}>{profile}</b>).
          <span style={{ marginLeft: 8, display: "inline-flex", gap: 4 }}>
            {Object.keys(CANDIDATE_PROFILES).map(p => (
              <button key={p} onClick={() => setProfile(p)} style={chip(profile === p, T.cyan)}>{p}</button>
            ))}
          </span>
        </div>
      )}

      {/* ── §16 TOLÉRANCE ── */}
      <div>
        <div style={label}>Perte d'EV acceptable — « la stratégie la plus simple sous X »</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
          <button onClick={() => setMaxEvLoss(null)} style={chip(maxEvLoss == null, T.amber)}>aucune</button>
          {EV_LOSS_PRESETS.map(v => (
            <button key={v} onClick={() => setMaxEvLoss(v)} style={chip(maxEvLoss === v, T.amber)}>{v} bb</button>
          ))}
        </div>
      </div>

      {/* ── Lancement ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button data-pfase="solve" onClick={run} disabled={disabled || busy}
          title={disabled ? disabledReason : "Génère les candidats, résout les sous-arbres, compare les EV, puis résout l'arbre retenu"}
          style={{
            padding: "7px 14px", borderRadius: 7, border: `1px solid ${T.purple}`,
            background: busy ? "transparent" : `${T.purple}33`, color: busy ? T.text3 : T.text,
            fontFamily: T.stats, fontSize: 11, fontWeight: 700,
            cursor: disabled || busy ? "not-allowed" : "pointer", opacity: disabled ? .45 : 1,
          }}>
          {busy ? "Calcul…" : family ? "Résoudre les 4 niveaux" : "Optimiser les sizings"}
        </button>
        {busy && (
          <button onClick={stop} style={{ ...chip(true, T.red) }}>Annuler</button>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: T.text3, fontFamily: T.stats, cursor: "pointer" }}>
          <input data-pfase="family-toggle" type="checkbox" checked={family} onChange={e => setFamily(e.target.checked)} />
          FULL → SINGLE (les 4 niveaux)
        </label>
        {disabled && <span style={{ fontSize: 9.5, color: T.amber, fontFamily: T.stats }}>{disabledReason}</span>}
      </div>

      {/* ── §22 ÉTATS DU SOLVE ── */}
      {(busy || phase) && <PhaseBar phase={phase} progress={progress} />}

      {/* ── Résultat ── */}
      {error && (
        <div data-pfase="error" data-pfase-reason={error} style={{ ...box, borderColor: T.red, background: T.redDim }}>
          <div style={{ fontSize: 10.5, color: T.red, fontFamily: T.stats, fontWeight: 700 }}>Aucune solution</div>
          <div style={{ fontSize: 9.5, color: T.text3, fontFamily: T.stats, marginTop: 3 }}>{error}</div>
          {result && Array.isArray(result.problems) && result.problems.length > 0 && (
            <ul style={{ margin: "5px 0 0 16px", padding: 0, fontSize: 9, color: T.text4, fontFamily: T.stats }}>
              {result.problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          <div style={{ fontSize: 9, color: T.text4, fontFamily: T.stats, marginTop: 5, fontStyle: "italic" }}>
            Aucune stratégie de repli n'est produite : un solve échoué ne doit jamais ressembler à un solve réussi.
          </div>
        </div>
      )}

      {treeDirty && result && result.ok && (
        <div style={{ ...box, borderColor: T.amber, background: T.amberDim }}>
          <div style={{ fontSize: 10.5, color: T.amber, fontFamily: T.stats, fontWeight: 700 }}>
            Arbre modifié — les résultats ci-dessous ne le décrivent plus
          </div>
          <div style={{ fontSize: 9.5, color: T.text3, fontFamily: T.stats, marginTop: 3 }}>
            Les fréquences et la perte d'EV affichées ont été mesurées sur l'arbre PRÉCÉDENT.
            Relancez l'optimisation pour qu'elles décrivent celui-ci.
          </div>
        </div>
      )}

      {result && result.ok && !family && result.solution && (
        <>
          <SolutionCard solution={result.solution} optimization={result.optimization} onTrain={onTrainSolution} stale={treeDirty} />
          <TreeEditor
            solution={result.solution}
            path={nodePath} setPath={setNodePath}
            overrides={nodeOverrides}
            setOverride={(key, ov) => { setNodeOverrides(o => ({ ...o, [key]: ov })); setTreeDirty(true); }}
            clearOverride={(key) => { setNodeOverrides(o => { const n = { ...o }; delete n[key]; return n; }); setTreeDirty(true); }}
            clearAll={() => { setNodeOverrides({}); setTreeDirty(true); }}
            stale={treeDirty}
          />
        </>
      )}
      {result && result.ok && family && Array.isArray(result.family) && (
        <FamilyTable family={result.family} results={result.results} onTrain={onTrainSolution} onTrainMany={onTrainMany} />
      )}
    </div>
  );
}

function UnitHint({ kind }) {
  /* §25 — le sélecteur d'unité. « JAM » et non « AI » : l'ambiguïté avec
     « Artificial Intelligence » est explicitement nommée par la mission. */
  return (
    <span style={{ marginLeft: 6, fontSize: 8.5, color: T.text4, fontFamily: T.stats }}>
      unité <b style={{ color: T.text3 }}>{SIZING_UNIT_LABEL[kind]}</b> · géo <b style={{ color: T.text3 }}>e</b> · tapis <b style={{ color: T.text3 }}>JAM</b>
    </span>
  );
}

function PhaseBar({ phase, progress }) {
  const steps = [SolveStatus.QUEUED, SolveStatus.SOLVING, SolveStatus.OPTIMIZING_SIZINGS, SolveStatus.FINAL_SOLVE, SolveStatus.COMPLETE];
  const idx = steps.indexOf(phase);
  const libelle = {
    QUEUED: "Génération des candidats", SOLVING: "Arbre de référence",
    OPTIMIZING_SIZINGS: "Comparaison des sous-arbres", FINAL_SOLVE: "Solve final",
    COMPLETE: "Terminé", PARTIAL: "Terminé (précision réduite)",
    FAILED: "Échec", CANCELLED: "Annulé",
  }[phase] || phase;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: T.bg, borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${Math.max(5, ((idx + 1) / steps.length) * 100)}%`,
          background: phase === SolveStatus.FAILED ? T.red : phase === SolveStatus.CANCELLED ? T.text4 : T.purple,
          transition: "width .3s",
        }} />
      </div>
      <span style={{ fontSize: 9.5, color: T.text3, fontFamily: T.stats, minWidth: 190 }}>
        {libelle}
        {progress && progress.done != null && progress.total != null ? ` — ${progress.done}/${progress.total}` : ""}
        {progress && progress.iterations ? ` — ${progress.iterations} it.` : ""}
      </span>
    </div>
  );
}

/* ── Carte de solution : ce que le moteur a MESURÉ ─────────────────────── */
function SolutionCard({ solution, optimization, onTrain, stale }) {
  const d = describeSolution(solution);
  const m = solution.simplificationMetrics || {};
  const floor = solution.measurement ? solution.measurement.floor : null;
  const distinguishable = solution.distinguishable !== false;
  const ranking = solution.actionRanking;

  return (
    <div data-pfase="solution" data-pfase-status={solution.status} data-pfase-complexity={d.complexity}
      data-pfase-selected={(solution.selectedSizes.bets || []).map(b => b.label).join(",")}
      data-pfase-reference={(solution.referenceSizes.bets || []).map(b => b.label).join(",")}
      data-pfase-evloss={m.absoluteEVLoss} data-pfase-floor={floor}
      data-pfase-distinguishable={String(distinguishable)}
      data-pfase-badge={d.badge}
      data-pfase-kind={solution.strategyKind || "EQUILIBRIUM"}
      data-pfase-exploit={solution.exploit ? solution.exploit.profileId || "custom" : ""}
      data-pfase-nashconv={solution.convergence ? String(solution.convergence.nashConv) : ""}
      data-pfase-lockedgap={solution.convergence && solution.convergence.lockedPlayerGap != null ? String(solution.convergence.lockedPlayerGap) : ""}
      style={{ ...box,
        /* La couleur du cadre suit la NATURE de la solution : violet pour un
           équilibre, ambre pour une exploitation. Qui enchaîne les solves doit
           voir d un coup d oeil laquelle il regarde. */
        borderColor: solution.strategyKind === "EXPLOIT" ? T.amber : T.purple,
        background: solution.strategyKind === "EXPLOIT" ? "rgba(255,194,71,.06)" : "rgba(155,92,255,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: T.stats, padding: "2px 7px", borderRadius: 4,
          background: `${solution.provenanceMeta.color}22`, color: solution.provenanceMeta.color,
          border: `1px solid ${solution.provenanceMeta.color}55`,
        }}>{d.badge}</span>
        <span style={{ fontSize: 10, color: T.text2, fontFamily: T.stats }}>
          {d.mode} · {d.complexity}
        </span>
        <span style={{ fontSize: 9.5, color: T.text4, fontFamily: T.stats }}>
          {d.street} {d.board} · pot {d.pot}bb · SPR {d.spr}
        </span>
        {solution.status === "PARTIAL" && (
          <span style={{ ...chip(true, T.amber), fontSize: 9 }} title={(solution.partialReasons || []).join(" · ")}>PARTIEL</span>
        )}
        {stale && <span style={{ ...chip(true, T.red), fontSize: 9 }} title="L'arbre a été modifié depuis ce solve.">PÉRIMÉ</span>}
      </div>
      {/* ── §45/§46 — CE QUE CETTE SOLUTION EST, ET CE QU'ELLE N'EST PAS ──────
          La provenance dit COMMENT le résultat a été obtenu (le CFR a tourné) ;
          elle ne dit pas CE QU'IL DÉCRIT. Une exploitation est un solve à part
          entière et n'est pas un équilibre — sans cette ligne, le badge « PF
          SOLVED » suffirait à la faire lire comme du GTO. */}
      {solution.strategyKind === "EXPLOIT" && solution.exploit && (
        <div style={{ marginTop: 7, padding: "6px 8px", borderRadius: 5,
          background: "rgba(255,194,71,.10)", border: `1px solid ${T.amber}55` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.amber, fontFamily: T.stats }}>
            🎯 Exploitation — vs {solution.exploit.label} · CE N'EST PAS UN ÉQUILIBRE
          </div>
          <div style={{ fontSize: 9, color: T.text3, fontFamily: T.stats, marginTop: 3, lineHeight: 1.45 }}>
            {solution.exploit.modelNote}
          </div>
          <div style={{ fontSize: 9, color: T.text4, fontFamily: T.stats, marginTop: 3, lineHeight: 1.45 }}>
            Exploitabilité non définie sous verrou : NashConv suppose que les deux camps peuvent dévier.
            {solution.convergence && solution.convergence.lockedPlayerGap != null && (
              <> Convergence mesurée autrement — il reste <b style={{ color: T.text2 }}>{solution.convergence.lockedPlayerGap} bb</b> entre
              la stratégie obtenue et la meilleure réponse au modèle.</>
            )}
          </div>
        </div>
      )}


      {/* Sizings retenus vs candidats */}
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", alignItems: "baseline" }}>
        <span style={label}>Retenu</span>
        <span style={{ fontSize: 12, color: T.green, fontFamily: T.stats, fontWeight: 700 }}>
          {(solution.selectedSizes.bets || []).map(b => b.label).join("  ·  ") || "—"}
          {(solution.selectedSizes.raises || []).length > 0 && (
            <span style={{ color: T.text3, fontWeight: 400, marginLeft: 8 }}>
              relances : {solution.selectedSizes.raises.map(r => r.label).join(" · ")}
            </span>
          )}
        </span>
        <span style={label}>Comparés</span>
        <span style={{ fontSize: 10, color: T.text3, fontFamily: T.stats }}>
          {(solution.referenceSizes.bets || []).map(b => b.label).join(" · ") || "—"}
        </span>
      </div>

      {/* §14 — perte d'EV et son plancher */}
      <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <Metric label="EV référence" value={fmtEv(m.referenceEV)} unit="bb" />
        <Metric label="EV retenue" value={fmtEv(m.simplifiedEV)} unit="bb" />
        <Metric label="Perte d'EV" value={fmtEv(m.absoluteEVLoss)} unit="bb"
          color={distinguishable ? (m.absoluteEVLoss > 0 ? T.amber : T.text3) : T.text4} />
        <Metric label="% du pot" value={m.evLossPotPct == null ? "—" : m.evLossPotPct.toFixed(3)} unit="%" />
        {floor != null && <Metric label="Plancher de mesure" value={fmtEv(floor)} unit="bb" color={T.text4} />}
      </div>

      {/* L'honnêteté du §14/§21, en clair */}
      {!distinguishable && (
        <div style={{ marginTop: 6, fontSize: 9.5, color: T.amber, fontFamily: T.stats, lineHeight: 1.45 }}>
          ⚠ Cette perte d'EV est plus petite que le plancher de mesure ({fmtEv(floor)} bb) :
          elle n'est <b>pas distinguable du bruit</b> à cette précision. Ce niveau ne coûte donc rien de mesurable —
          ce qui n'est pas la même chose que « ne coûte rien ».
        </div>
      )}
      {m.negativeLoss && (
        <div style={{ marginTop: 4, fontSize: 9, color: T.text4, fontFamily: T.stats, fontStyle: "italic" }}>{m.negativeLossNote}</div>
      )}

      {/* §15 — écart d'EV entre sizings */}
      {ranking && ranking.actions && ranking.actions.length > 1 && (
        <div style={{ marginTop: 10 }}>
          <div style={label}>Écart d'EV entre sizings — mesuré, pas estimé</div>
          <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 2 }}>
            {ranking.actions.map(a => (
              <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: T.stats }}>
                <span style={{ minWidth: 70, color: a.isBest ? T.green : T.text3 }}>{a.displayLabel}</span>
                <div style={{ flex: 1, height: 3, background: T.bg, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.max(2, 100 + (a.delta / Math.max(0.0001, Math.abs(ranking.actions[ranking.actions.length - 1].delta))) * 100)}%`,
                    background: a.isBest ? T.green : T.blue, opacity: a.isBest ? .9 : .5,
                  }} />
                </div>
                <span style={{ minWidth: 62, textAlign: "right", color: a.isBest ? T.green : T.text4 }}>
                  {a.delta === 0 ? "référence" : `${a.delta.toFixed(3)} bb`}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, marginTop: 4, fontStyle: "italic" }}>
            EV du joueur s'il se limitait à ce seul sizing, face à un adversaire disposant de tout l'arbre.
          </div>
        </div>
      )}

      {/* §21 — convergence réelle */}
      <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 9, color: T.text4, fontFamily: T.stats }}>
        <span>{solution.accuracy && solution.accuracy.exact
          ? `Exploitabilité ${solution.accuracy.value} bb (NashConv exact)`
          : `Exploitabilité indisponible — ${solution.accuracy ? solution.accuracy.note || "runouts échantillonnés" : "—"}`}</span>
        <span>{solution.convergence?.iterations} itérations</span>
        {optimization && optimization.instrumentation && (
          <>
            <span>{optimization.instrumentation.solveCount} solves</span>
            <span>{optimization.instrumentation.cacheHits} depuis le cache</span>
            <span>{Math.round((optimization.instrumentation.totalMs || 0) / 100) / 10}s</span>
          </>
        )}
      </div>
      {solution.status === "PARTIAL" && (solution.partialReasons || []).length > 0 && (
        <ul style={{ margin: "6px 0 0 16px", padding: 0, fontSize: 9, color: T.amber, fontFamily: T.stats }}>
          {solution.partialReasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {/* §87 — entraînement direct, sans recopier un seul sizing */}
      {onTrain && (
        <button onClick={() => onTrain(solution.solutionId)}
          title="Ouvre le Trainer sur CE spot, avec les actions de CETTE solution"
          style={{
            marginTop: 10, padding: "7px 13px", borderRadius: 7,
            border: `1px solid ${T.gold}`, background: `${T.gold}22`, color: T.gold,
            fontFamily: T.stats, fontSize: 10.5, fontWeight: 700, cursor: "pointer",
          }}>
          🎯 S'entraîner contre cette solution
        </button>
      )}

      {/* Traçabilité (§19/§95) */}
      <div style={{ marginTop: 8, fontSize: 8.5, color: T.text4, fontFamily: "monospace", wordBreak: "break-all" }}>
        {solution.solutionId} · graine {solution.seed} · moteur {solution.sizingEngineVersion}/{solution.solverVersion}
      </div>
    </div>
  );
}

function Metric({ label: l, value, unit, color }) {
  return (
    <div>
      <div style={label}>{l}</div>
      <div style={{ fontSize: 13, color: color || T.text, fontFamily: T.stats, fontWeight: 700 }}>
        {value}<span style={{ fontSize: 9, color: T.text4, marginLeft: 2 }}>{unit}</span>
      </div>
    </div>
  );
}
const fmtEv = (v) => (typeof v === "number" ? (Math.round(v * 1000) / 1000).toFixed(3) : "—");

/* ── §110 — le tableau FULL → SINGLE ──────────────────────────────────── */
function FamilyTable({ family, results, onTrain, onTrainMany }) {
  return (
    <div data-pfase="family" data-pfase-levels={family.map(d => `${d.complexity}=${d.selected}@${d.evLossBb}`).join("|")}
      style={{ ...box, borderColor: T.cyan, background: "rgba(52,216,255,.05)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: T.brand }}>
        Ce que coûte la simplicité
      </div>
      <div style={{ fontSize: 9, color: T.text4, fontFamily: T.stats, marginTop: 2, marginBottom: 8 }}>
        Même spot, quatre niveaux. La perte d'EV est mesurée face à un adversaire qui, lui, dispose de tout l'arbre.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto auto", gap: "4px 12px", fontSize: 10, fontFamily: T.stats, alignItems: "baseline" }}>
        <span style={label}>Niveau</span><span style={label}>Sizings</span><span style={label}>Perte</span><span style={label}>% pot</span><span style={label}>Mesurable ?</span><span style={label}>{onTrain ? "Entraîner" : ""}</span>
        {family.map(d => (
          <React.Fragment key={d.complexity}>
            <span style={{ color: T.text2, fontWeight: 700 }}>{d.complexity}</span>
            <span style={{ color: T.green }}>{d.selected}</span>
            <span style={{ color: d.evLossBb > 0 ? T.amber : T.text3 }}>{fmtEv(d.evLossBb)} bb</span>
            <span style={{ color: T.text4 }}>{d.evLossPotPct == null ? "—" : d.evLossPotPct.toFixed(3)}</span>
            <span style={{ color: d.distinguishable ? T.text3 : T.text4 }}>
              {d.distinguishable ? "oui" : `non (< ${fmtEv(d.measurementFloor)} bb)`}
            </span>
            <span>
              {onTrain && d.solutionId && (
                <button onClick={() => onTrain(d.solutionId)} style={{ ...chip(false, T.gold), fontSize: 9 }}>🎯</button>
              )}
            </span>
          </React.Fragment>
        ))}
      </div>
      {/* ── §67/§69/§110 — LES QUATRE NIVEAUX, CÔTE À CÔTE ──────────────────
          Lire « perte 0.02 bb, non mesurable » ne dit rien à personne. Jouer les
          quatre niveaux simultanément, sur quatre tables, dit tout : c'est là
          qu'on constate qu'un Single Size bien choisi ne se distingue pas de
          l'arbre complet — ou qu'il se distingue, et où. */}
      {onTrainMany && family.filter(d => d.solutionId).length > 1 && (
        <button
          data-pfase-train-many={family.filter(d => d.solutionId).length}
          onClick={() => onTrainMany(family.filter(d => d.solutionId).map(d => d.solutionId))}
          style={{ ...chip(false, T.gold), marginTop: 9, fontSize: 10, padding: "5px 10px" }}
          title="Ouvre une table par niveau. Chaque table joue SA solution : ses sizings, sa provenance, son coût de simplification — rien n'est partagé entre elles.">
          🎯 S'entraîner sur les {Math.min(4, family.filter(d => d.solutionId).length)} niveaux — une table par niveau
        </button>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   §26 · TREE EDITOR — navigation nœud par nœud et sizings propres à un nœud.

   « Le Tree Editor doit permettre : navigation nœud par nœud · ajout d'un
   sizing · suppression · modification · passage Fixed/Dynamic · définition
   spécifique d'un nœud · affichage des actions · visualisation du sizing
   sélectionné. Une modification de l'arbre doit invalider les résultats
   dépendants. »

   PÉRIMÈTRE RÉEL, ET IL EST DIT À L'ÉCRAN : la navigation couvre les nœuds de
   la RUE COURANTE, parce que c'est ce que la solution extrait (voir
   LIMITATIONS L8 — la stratégie des rues suivantes dépend de la carte tombée et
   se re-résout au nouvel état). Descendre plus loin afficherait un nœud sans
   stratégie, donc des fréquences absentes présentées comme un arbre.
   ══════════════════════════════════════════════════════════════════════════ */
function TreeEditor({ solution, path, setPath, overrides, setOverride, clearOverride, clearAll, stale }) {
  const nodes = (solution.strategy && solution.strategy.nodes) || {};
  const key = path.join("|");
  const node = nodes[key] || null;
  const ov = overrides[key] || null;

  const goTo = (i) => setPath(path.slice(0, i));
  const descend = (label) => { if (nodes[[...path, label].join("|")]) setPath([...path, label]); };

  return (
    <div data-pfase="tree-editor" style={{ ...box, borderColor: T.cyan, background: "rgba(52,216,255,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: T.brand }}>🌳 Tree Editor</span>
        <span style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, fontStyle: "italic" }}>
          rue courante · {Object.keys(nodes).length} nœud(s) — les rues suivantes se re-résolvent au nouvel état
        </span>
        {Object.keys(overrides).length > 0 && (
          <button onClick={clearAll} style={{ ...chip(false, T.red), marginLeft: "auto", fontSize: 9 }}>
            Tout réinitialiser ({Object.keys(overrides).length})
          </button>
        )}
      </div>

      {/* Fil d'Ariane — navigation nœud par nœud */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 7 }}>
        <button onClick={() => goTo(0)} style={chip(path.length === 0, T.cyan)}>racine</button>
        {path.map((lbl, i) => (
          <React.Fragment key={i}>
            <span style={{ color: T.text4, fontSize: 10 }}>›</span>
            <button onClick={() => goTo(i + 1)} style={chip(i === path.length - 1, T.cyan)}>{lbl}</button>
          </React.Fragment>
        ))}
      </div>

      {!node ? (
        <div style={{ fontSize: 9.5, color: T.text4, fontFamily: T.stats, marginTop: 8 }}>
          Ce nœud n'appartient pas à la rue courante : la solution ne le couvre pas.
          Il sera résolu au nouvel état lorsque la rue changera.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 9.5, color: T.text3, fontFamily: T.stats }}>
            <span>joueur <b style={{ color: node.player === 0 ? T.green : T.blue }}>{node.player === 0 ? "Hero (OOP)" : "Vilain (IP)"}</b></span>
            <span>pot <b style={{ color: T.text2 }}>{node.potBb}bb</b></span>
            {node.toCallBb > 0 && <span>à payer <b style={{ color: T.text2 }}>{node.toCallBb}bb</b></span>}
            <span>{node.actions.length} action(s)</span>
          </div>

          {/* Actions du nœud, avec leur sizing et leur fréquence */}
          <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 3 }}>
            {node.actions.map(lbl => {
              const sz = node.sizings[lbl] || {};
              const f = node.aggregate[lbl] ?? 0;
              const child = nodes[[...path, lbl].join("|")];
              return (
                <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: T.stats }}>
                  <span style={{ minWidth: 26, color: T.text4 }}>{lbl}</span>
                  <span style={{ minWidth: 62, color: T.text2 }}>{node.actionTypes[lbl]}</span>
                  <span style={{ minWidth: 96, color: T.green }}>
                    {(sz.realizedLabel || sz.specLabel) ? `${sz.realizedLabel || sz.specLabel} · ${sz.toBb}bb` : sz.toBb ? `${sz.toBb}bb` : "—"}
                  </span>
                  <div style={{ flex: 1, height: 4, background: T.bg, borderRadius: 2, overflow: "hidden", opacity: stale ? .35 : 1 }}>
                    <div style={{ height: "100%", width: `${Math.round(f * 100)}%`, background: T.cyan, opacity: .8 }} />
                  </div>
                  <span style={{ minWidth: 42, textAlign: "right", color: stale ? T.text4 : T.text3 }}>
                    {stale ? "—" : `${Math.round(f * 1000) / 10}%`}
                  </span>
                  <button onClick={() => descend(lbl)} disabled={!child}
                    title={child ? "Inspecter ce nœud" : "Pas de nœud à inspecter au-delà (rue suivante)"}
                    style={{ ...chip(false, T.cyan), opacity: child ? 1 : .3, cursor: child ? "pointer" : "not-allowed", fontSize: 9 }}>›</button>
                </div>
              );
            })}
          </div>

          {/* Définition SPÉCIFIQUE de ce nœud */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={label}>Sizings de CE nœud</span>
              <span style={{ ...chip(!!ov, ov ? T.amber : T.text4), fontSize: 8.5, cursor: "default" }}>
                {ov ? "Fixed — défini ici" : "Dynamic — hérité du réglage global"}
              </span>
              {ov && (
                <button onClick={() => clearOverride(key)} style={{ ...chip(false, T.red), fontSize: 9 }}>
                  Revenir au réglage global
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
              {BET_CHOICES.map(f => {
                const on = !!(ov && (ov.betSizes || []).some(x => x.type === "pot" && Math.abs(x.value - f) < 1e-6));
                return (
                  <button key={f} onClick={() => {
                    const cur = (ov && ov.betSizes) || [];
                    const next = on
                      ? cur.filter(x => !(x.type === "pot" && Math.abs(x.value - f) < 1e-6))
                      : [...cur, potSizing(f)];
                    if (!next.length) clearOverride(key); else setOverride(key, { ...(ov || {}), betSizes: next });
                  }} style={chip(on, T.amber)}>{Math.round(f * 100)}%</button>
                );
              })}
              <button onClick={() => {
                const cur = (ov && ov.betSizes) || [];
                const on = cur.some(x => x.type === "jam");
                const next = on ? cur.filter(x => x.type !== "jam") : [...cur, jamSizing()];
                if (!next.length) clearOverride(key); else setOverride(key, { ...(ov || {}), betSizes: next });
              }} style={chip(!!(ov && (ov.betSizes || []).some(x => x.type === "jam")), T.gold)}>JAM</button>
            </div>
            <div style={{ fontSize: 8.5, color: T.text4, fontFamily: T.stats, marginTop: 5, lineHeight: 1.5 }}>
              Un nœud sans définition propre hérite du réglage global. Définir des sizings ici ne
              touche <b>aucun autre nœud</b> — c'est ce qui distingue l'éditeur d'arbre d'un sélecteur global.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
