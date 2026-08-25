/* ══════════════════════════════════════════════════════════════════════════
   PFASE · MÉTRIQUES DE SIMPLIFICATION (Mission §14, §15, §16, §93, §94)

   Deux métriques, et le refus explicite d'en fabriquer une troisième.

   §14 dit : « Ne pas inventer un pourcentage "EV retained" lorsque la définition
   mathématique produirait un ratio trompeur. » C'est un piège réel :

     référence −0.40 bb, simplifié −0.45 bb  →  perte 0.05 bb
     « EV conservée » = −0.45 / −0.40 = 112 %  ← absurde, et pourtant c'est ce
     que produit la formule naïve.

   Donc :
     · `absoluteEVLoss`  toujours défini. C'est LA métrique. En bb.
     · `evLossPotPct`    perte rapportée au pot. Toujours définie si pot > 0, et
                         c'est l'échelle qui a un sens : 0.03 bb de perte n'a pas
                         la même portée dans un pot de 6bb et dans un pot de 60bb.
     · `relativeEVLoss`  ratio à |EV de référence| — défini SEULEMENT si cette EV
                         est franchement non nulle ; sinon `null` + une note.
     · `retainedEV`      défini SEULEMENT si l'EV de référence est positive.
                         Sinon `null`. Pas de 112 %.

   CONVENTION D'EV — UNE SEULE, ÉCRITE ICI (§9)
   Toutes les EV manipulées par PFASE sont exprimées **du point de vue du joueur
   optimisé** (`optimizeFor`), en **bb**, sur la base zéro-somme P/2 de
   `gametree.terminalUtility`. Le moteur (`solveTree`) rend l'EV du joueur 0
   (Hero/OOP) ; l'EV du joueur 1 s'en déduit par symétrie en chip-EV
   (`evForPlayer`). Sous utilité ICM le jeu n'est pas à somme nulle : l'EV du
   joueur 1 n'est pas dérivable et `evForPlayer(1)` rend `null` plutôt qu'un
   nombre faux.

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { EPS } from "./config.js";
import { roundEv, roundTo } from "./sizingSpec.js";

/* Seuil en deçà duquel un ratio à l'EV de référence n'informe plus. 0.05 bb :
   une EV de référence plus petite que ça est dominée par le bruit du solveur,
   et le ratio qu'on en tirerait varierait de 100 % d'une itération à l'autre. */
export const RELATIVE_EV_FLOOR = 0.05;

/* EV du joueur `p` à partir d'une solution `solveTree`.
   Chip-EV : jeu à somme nulle → EV(1) = −EV(0). ICM/PKO : le transfert de jetons
   déplace aussi l'équité de joueurs absents du coup, la somme n'est plus nulle,
   et l'EV du joueur 1 n'est PAS déductible. On rend `null` (§0 : pas de nombre
   fabriqué) plutôt que −EV(0). */
export function evForPlayer(solution, player = 0) {
  if (!solution || typeof solution.ev !== "number") return null;
  if (player === 0) return solution.ev;
  const zeroSum = !solution.utility || solution.utility.zeroSum !== false;
  return zeroSum ? -solution.ev : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   simplificationMetrics — compare un sous-arbre simplifié à la référence.
   ══════════════════════════════════════════════════════════════════════════ */
export function simplificationMetrics({ referenceEV, simplifiedEV, pot } = {}) {
  const hasRef = typeof referenceEV === "number" && Number.isFinite(referenceEV);
  const hasSim = typeof simplifiedEV === "number" && Number.isFinite(simplifiedEV);
  if (!hasRef || !hasSim) {
    return {
      referenceEV: hasRef ? roundEv(referenceEV) : null,
      simplifiedEV: hasSim ? roundEv(simplifiedEV) : null,
      absoluteEVLoss: null, relativeEVLoss: null, evLossPotPct: null, retainedEV: null,
      note: "EV indisponible d'un côté — aucune perte d'EV calculable.",
    };
  }
  const loss = referenceEV - simplifiedEV;
  const absRef = Math.abs(referenceEV);

  let relative = null, relativeNote = null;
  if (absRef >= RELATIVE_EV_FLOOR) relative = roundTo(loss / absRef, 6);
  else relativeNote = `EV de référence trop proche de zéro (${roundEv(referenceEV)} bb) — un ratio n'informerait pas.`;

  let retained = null, retainedNote = null;
  if (referenceEV > RELATIVE_EV_FLOOR) retained = roundTo(simplifiedEV / referenceEV, 6);
  else retainedNote = "EV de référence non strictement positive — « EV conservée » n'a pas de définition utile ici.";

  const evLossPotPct = pot > EPS.amount ? roundTo((loss / pot) * 100, 4) : null;

  return {
    referenceEV: roundEv(referenceEV),
    simplifiedEV: roundEv(simplifiedEV),
    absoluteEVLoss: roundEv(loss),
    relativeEVLoss: relative,
    relativeEVLossNote: relativeNote,
    evLossPotPct,
    retainedEV: retained,
    retainedEVNote: retainedNote,
    /* Une perte NÉGATIVE (le simplifié bat la référence) est possible lorsque
       les DEUX joueurs sont restreints, et lorsque la précision d'évaluation est
       basse. On ne la masque pas : on la signale. */
    negativeLoss: loss < -EPS.ev,
    negativeLossNote: loss < -EPS.ev
      ? "Perte d'EV négative : l'arbre simplifié mesure mieux que la référence. Cela arrive quand les deux joueurs sont simplifiés (le jeu change des deux côtés) ou quand la précision d'évaluation est insuffisante. À interpréter comme « perte non mesurable », pas comme un gain."
      : null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   actionLoss (§15) — écart d'EV entre les actions D'UN NŒUD.

   Ce que le Coach pourra dire : « 75 % est retenu, 33 % est proche, 150 %
   sacrifie davantage. » Ces trois phrases doivent venir de nombres mesurés.

   `evByAction` : { label → EV du joueur au nœud, en bb }.
   Sortie triée par EV décroissante, avec l'écart au MEILLEUR (≤ 0).
   ══════════════════════════════════════════════════════════════════════════ */
export function actionLoss(evByAction, { labels } = {}) {
  const entries = Object.entries(evByAction || {})
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v));
  if (!entries.length) return { best: null, actions: [], note: "aucune EV d'action disponible" };
  const best = entries.reduce((m, e) => (e[1] > m[1] ? e : m), entries[0]);
  const actions = entries
    .map(([label, ev]) => ({
      label,
      displayLabel: (labels && labels[label]) || label,
      ev: roundEv(ev),
      delta: roundEv(ev - best[1]),        // ≤ 0 par construction
      isBest: Math.abs(ev - best[1]) <= EPS.ev,
    }))
    .sort((a, b) => b.ev - a.ev);
  return { best: best[0], bestEV: roundEv(best[1]), actions };
}

/* ══════════════════════════════════════════════════════════════════════════
   selectUnderTolerance (§16) — « stratégie la plus SIMPLE perdant moins de X ».

   `candidates` : [{ id, complexityCost, metrics }] déjà mesurés.
   `complexityCost` : le nombre de sizings retenus (mesure objective de
   complexité — pas une note subjective).

   Retourne le candidat de coût MINIMAL dont la perte reste sous la tolérance ;
   à coût égal, celui qui perd le moins. Si aucun ne passe, retourne le meilleur
   par perte, en DISANT que la tolérance n'a pas été tenue.
   ══════════════════════════════════════════════════════════════════════════ */
export function selectUnderTolerance(candidates, maxAcceptableEVLoss) {
  const usable = (candidates || []).filter(c => c && c.metrics && typeof c.metrics.absoluteEVLoss === "number");
  if (!usable.length) return { selected: null, satisfied: false, note: "aucun candidat mesuré" };
  const byLoss = usable.slice().sort((a, b) =>
    a.metrics.absoluteEVLoss - b.metrics.absoluteEVLoss || a.complexityCost - b.complexityCost);
  if (maxAcceptableEVLoss == null) {
    return { selected: byLoss[0], satisfied: true, note: "aucune tolérance imposée — meilleure EV retenue" };
  }
  const passing = usable
    .filter(c => c.metrics.absoluteEVLoss <= maxAcceptableEVLoss + EPS.ev)
    .sort((a, b) => a.complexityCost - b.complexityCost || a.metrics.absoluteEVLoss - b.metrics.absoluteEVLoss);
  if (passing.length) return { selected: passing[0], satisfied: true, note: `perte ≤ ${maxAcceptableEVLoss} bb tenue avec ${passing[0].complexityCost} sizing(s)` };
  return {
    selected: byLoss[0], satisfied: false,
    note: `aucune simplification ne tient la tolérance de ${maxAcceptableEVLoss} bb — meilleure perte mesurée : ${byLoss[0].metrics.absoluteEVLoss} bb`,
  };
}

/* Contrôle de normalisation d'une distribution de stratégie (§93). Retourne
   `{ ok, sum, problems }` — jamais une correction silencieuse : une distribution
   qui ne somme pas à 1 signale un bug, pas un arrondi à rattraper. */
export function checkStrategyNormalization(dist, tolerance = 1e-4) {
  const values = Array.isArray(dist) ? dist : Object.values(dist || {});
  const problems = [];
  let sum = 0;
  for (const v of values) {
    const n = Number(v);
    if (!Number.isFinite(n)) { problems.push("valeur non numérique"); continue; }
    if (n < -tolerance) problems.push(`fréquence négative (${n})`);
    sum += n;
  }
  if (!values.length) problems.push("distribution vide");
  else if (Math.abs(sum - 1) > tolerance) problems.push(`somme = ${roundTo(sum, 6)} (attendu 1 ± ${tolerance})`);
  return { ok: problems.length === 0, sum: roundTo(sum, 6), problems };
}
