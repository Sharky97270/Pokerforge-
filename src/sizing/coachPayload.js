/* ══════════════════════════════════════════════════════════════════════════
   PFASE · CHARGE UTILE DU COACH IA (Mission §0, §47, §48)

   RÈGLE DE FER, reprise du §0 : « L'IA PokerForge peut expliquer, comparer,
   reformuler, enseigner, contextualiser. Elle ne doit JAMAIS constituer la
   source mathématique de vérité d'une stratégie GTO. »

   Ce module construit ce que le Coach a le DROIT de voir, et rien d'autre. Il
   ne formule aucune phrase : il assemble des faits mesurés, chacun accompagné
   de sa disponibilité. Un champ absent est absent — pas rempli d'une valeur
   plausible, ce qui serait précisément la porte d'entrée de l'invention.

   §48 énumère les rubriques qu'une explication peut couvrir :
     WHY THIS SIZE · ALTERNATIVES · EV COST · RANGE LOGIC · BOARD LOGIC ·
     SPR LOGIC · EXPLOITATION
   On construit ces rubriques comme des CONTENANTS DE DONNÉES. Chacune porte
   `supported:false` quand la donnée manque, avec le motif. Le Coach doit alors
   dire qu'il ne sait pas — pas broder.

   Exemple ACCEPTABLE que ces données permettent (§47) :
     « Le sizing 33 % est retenu dans la solution simplifiée car son sous-arbre
       conserve davantage d'EV que les autres candidats testés. »
   Exemple INTERDIT, que ces données ne permettent PAS de produire :
     « Sur un board sec, 33 % est forcément GTO. »
   La différence n'est pas de ton : la première phrase est une lecture du
   tableau `alternatives`, la seconde une règle générale que rien ici ne fonde.

   Module PUR.
   ══════════════════════════════════════════════════════════════════════════ */

import { boardTexture, sprBucket } from "./boardTexture.js";
import { getTrainingNode } from "./pfase.js";
import { mayClaimSolved } from "./solutionSchema.js";
import { statusYieldsStrategy } from "./config.js";

const unsupported = (reason) => ({ supported: false, reason, data: null });
const supported = (data) => ({ supported: true, reason: null, data });

/* ══════════════════════════════════════════════════════════════════════════
   buildCoachPayload — tout ce que le Coach reçoit (§47).
   ══════════════════════════════════════════════════════════════════════════ */
export function buildCoachPayload({
  solution, path = [], handClass = null, heroAction = null, verdict = null,
} = {}) {
  if (!solution) return { ok: false, reason: "aucune solution — le Coach n'a rien à expliquer" };
  if (!statusYieldsStrategy(solution.status)) {
    return {
      ok: false,
      reason: `solution de statut ${solution.status} : aucune stratégie à expliquer`,
      /* On transmet quand même le motif d'échec : expliquer POURQUOI il n'y a
         pas de solution est une explication légitime. */
      failure: { status: solution.status, partialReasons: solution.partialReasons || [] },
    };
  }

  const node = getTrainingNode(solution, path, { handClass });
  const texture = boardTexture(solution.board);
  const m = solution.simplificationMetrics || {};
  const floor = solution.measurement ? solution.measurement.floor : null;
  const distinguishable = solution.distinguishable !== false;

  return {
    ok: true,
    /* ── PROVENANCE : la première chose que le Coach doit savoir (§18) ── */
    provenance: {
      source: solution.source,
      badge: solution.provenanceMeta ? solution.provenanceMeta.badge : null,
      mayClaimSolved: mayClaimSolved(solution),
      status: solution.status,
      partialReasons: solution.partialReasons || [],
      engine: `${solution.solverEngine} · sizing ${solution.sizingEngineVersion}`,
      /* Ce que le Coach n'a PAS le droit de dire, écrit noir sur blanc dans la
         charge utile elle-même. Un modèle qui reçoit cette liste ne peut pas
         prétendre l'avoir ignorée. */
      forbidden: [
        "annoncer une fréquence, une EV ou un sizing qui ne figure pas dans cette charge utile",
        "présenter une règle générale (« sur board sec, X est GTO ») comme un résultat de solve",
        "qualifier d'exacte une valeur dont `supported` vaut false",
        mayClaimSolved(solution) ? null : "employer le mot « GTO » : cette solution n'est pas une solution calculée vérifiée",
      ].filter(Boolean),
    },

    /* ── ÉTAT DU SPOT ── */
    spot: {
      street: solution.street,
      board: solution.board,
      pot: solution.pot,
      spr: solution.spr,
      sprBucket: sprBucket(solution.spr),
      effectiveStack: solution.effectiveStacks,
      potType: solution.potType,
      positions: solution.positions,
      evaluationModel: solution.evaluationModel,
      handClass,
    },

    /* ── NŒUD ET STRATÉGIE ── */
    node: node.ok ? {
      path, potBb: node.potBb, toCallBb: node.toCallBb,
      actions: node.actions.map(a => ({
        actionType: a.actionType, sizeBb: a.toBb, potFraction: a.potFraction,
        specLabel: a.specLabel, frequency: a.frequency,
      })),
      frequencySource: node.frequencySource,
      frequencyNote: node.frequencyNote,
    } : null,
    nodeError: node.ok ? null : node.reason,

    /* ── ACTION DU JOUEUR ── */
    hero: heroAction ? { actionType: heroAction.actionType, sizeBb: heroAction.toBb ?? heroAction.amountBb ?? null } : null,
    verdict: verdict || null,

    /* ── §48 — LES SEPT RUBRIQUES, chacune avec sa disponibilité ── */
    sections: {
      whyThisSize: solution.selectedSizes?.bets?.length
        ? supported({
          selected: solution.selectedSizes.bets.map(b => b.label),
          selectedRaises: (solution.selectedSizes.raises || []).map(r => r.label),
          comparedAgainst: (solution.referenceSizes?.bets || []).map(b => b.label),
          complexity: solution.sizingComplexity,
          mode: solution.sizingMode,
          /* Le fait brut : ce sizing a été retenu parce que son sous-arbre a
             conservé le plus d'EV parmi ceux qui ont été résolus. */
          criterion: "perte d'EV minimale parmi les sous-arbres réellement résolus",
        })
        : unsupported("aucun sizing retenu dans cette solution"),

      alternatives: solution.actionRanking && solution.actionRanking.actions?.length
        ? supported({
          best: solution.actionRanking.best,
          ranked: solution.actionRanking.actions.map(a => ({
            sizing: a.displayLabel, ev: a.ev, evGapToBest: a.delta, isBest: a.isBest,
          })),
          meaning: "EV du joueur s'il se limitait à ce seul sizing, face à un adversaire disposant de tout l'arbre",
        })
        : unsupported("classement des sizings indisponible (évaluation individuelle non conservée)"),

      evCost: typeof m.absoluteEVLoss === "number"
        ? supported({
          absoluteEVLossBb: m.absoluteEVLoss,
          evLossPotPct: m.evLossPotPct,
          referenceEV: m.referenceEV,
          simplifiedEV: m.simplifiedEV,
          measurementFloorBb: floor,
          distinguishable,
          /* LE point d'honnêteté : sous le plancher, on ne peut rien affirmer. */
          caveat: distinguishable
            ? null
            : `perte plus petite que le plancher de mesure (${floor} bb) : elle n'est pas distinguable du bruit. Dire « ce niveau ne coûte rien » serait faux ; dire « aucun coût mesurable » est exact.`,
          negativeLossNote: m.negativeLossNote || null,
        })
        : unsupported("perte d'EV non mesurée"),

      rangeLogic: solution.heroRange
        ? supported({
          heroRangeClasses: Object.keys(solution.heroRange).length,
          villainRangeClasses: (solution.villainRanges || []).map(r => Object.keys(r || {}).length),
          abstraction: solution.abstraction || null,
          /* Les ranges d'entrée sont HEURISTIQUES dans PokerForge : le solve est
             exact SUR CES RANGES, ce qui n'est pas la même chose. */
          caveat: "les ranges d'entrée peuvent être heuristiques ; un solve exact sur des ranges estimées reste une réponse exacte à une question approchée",
        })
        : unsupported("ranges absentes de la solution"),

      boardLogic: texture
        ? supported({
          ...texture,
          /* Verrou explicite : la texture DÉCRIT, elle n'explique pas. */
          caveat: "propriétés observées du board. Elles n'expliquent aucun sizing par elles-mêmes : le sizing vient de la comparaison d'EV, pas de la texture (§53).",
        })
        : unsupported("board illisible"),

      sprLogic: solution.spr != null
        ? supported({
          spr: solution.spr, bucket: sprBucket(solution.spr),
          pot: solution.pot, effectiveStack: solution.effectiveStacks,
          geometricSelected: (solution.selectedSizes?.bets || []).some(b => b.spec && b.spec.type === "geometric"),
          note: "le SPR détermine les montants géométriques et les écrêtages au tapis ; il ne détermine pas à lui seul le sizing retenu",
        })
        : unsupported("SPR non calculable (pot nul)"),

      exploitation: solution.exploit
        ? supported({ profile: solution.exploit.profile, label: solution.exploit.label, model: solution.exploit.model })
        : unsupported("solution GTO — aucun modèle d'adversaire n'entre dans ce calcul (§44 : les sizings exploitants ne se confondent pas avec les sizings GTO)"),
    },

    /* ── CONVERGENCE : le Coach doit pouvoir nuancer selon la précision ── */
    accuracy: solution.accuracy || null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   coachFactSheet — la version APLATIE, prête à être insérée dans un prompt.

   Volontairement textuelle et exhaustive : ce qui n'y figure pas ne doit pas
   apparaître dans la réponse. La dernière ligne rappelle la contrainte.
   ══════════════════════════════════════════════════════════════════════════ */
export function coachFactSheet(payload) {
  if (!payload || !payload.ok) {
    return `AUCUNE SOLUTION EXPLOITABLE. Motif : ${payload ? payload.reason : "charge utile absente"}.
Tu peux expliquer POURQUOI il n'y a pas de solution. Tu ne dois proposer aucune fréquence, aucun sizing, aucune EV.`;
  }
  const L = [];
  const s = payload.sections;
  L.push(`PROVENANCE : ${payload.provenance.badge} (${payload.provenance.source}) · statut ${payload.provenance.status}`);
  if (!payload.provenance.mayClaimSolved) L.push(`⚠ Cette solution NE PEUT PAS être présentée comme calculée/GTO.`);
  if (payload.provenance.partialReasons.length) L.push(`Réserves : ${payload.provenance.partialReasons.join(" · ")}`);
  L.push(`SPOT : ${payload.spot.street} ${(payload.spot.board || []).join(" ")} · pot ${payload.spot.pot}bb · SPR ${payload.spot.spr} (${payload.spot.sprBucket}) · ${payload.spot.potType}`);
  if (payload.spot.handClass) L.push(`MAIN : ${payload.spot.handClass}`);

  if (payload.node) {
    L.push(`NŒUD (${payload.node.frequencySource}) :`);
    for (const a of payload.node.actions) {
      L.push(`  · ${a.actionType}${a.specLabel ? " " + a.specLabel : ""}${a.sizeBb ? ` ${a.sizeBb}bb` : ""} → ${Math.round((a.frequency || 0) * 1000) / 10}%`);
    }
    if (payload.node.frequencyNote) L.push(`  (${payload.node.frequencyNote})`);
  } else if (payload.nodeError) L.push(`NŒUD indisponible : ${payload.nodeError}`);

  for (const [name, sec] of Object.entries(s)) {
    if (!sec.supported) { L.push(`${name.toUpperCase()} : INDISPONIBLE — ${sec.reason}`); continue; }
    L.push(`${name.toUpperCase()} : ${JSON.stringify(sec.data)}`);
  }
  if (payload.accuracy) {
    L.push(payload.accuracy.exact
      ? `PRÉCISION : exploitabilité ${payload.accuracy.value} bb (${payload.accuracy.metric}), ${payload.accuracy.iterations} itérations`
      : `PRÉCISION : exploitabilité indisponible — ${payload.accuracy.note || "runouts échantillonnés"}`);
  }
  L.push("");
  L.push("CONTRAINTE : n'énonce aucun nombre absent de cette fiche. Si une rubrique est INDISPONIBLE, dis-le. N'énonce aucune règle générale comme si elle venait du solveur.");
  for (const f of payload.provenance.forbidden) L.push(`INTERDIT : ${f}`);
  return L.join("\n");
}
