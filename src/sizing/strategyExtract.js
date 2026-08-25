/* ══════════════════════════════════════════════════════════════════════════
   PFASE · EXTRACTION DE STRATÉGIE (Mission §17, §29, §33, §38, §39, §93)

   Transforme une solution CFR (objet vivant, porteur de closures et de tableaux
   typés) en DONNÉES PURES stockables et transmissibles à un Worker, au Trainer,
   au Replayer et au Coach.

   ── PÉRIMÈTRE ASSUMÉ : LA RUE COURANTE ──────────────────────────────────────
   On extrait les nœuds de décision de la STREET 0 de l'arbre — c'est-à-dire la
   rue du board fourni. Les rues suivantes ne sont PAS extraites, et c'est
   volontaire, pour deux raisons qui vont dans le même sens :

     1. TAILLE. La stratégie d'un nœud de turn dépend de la carte tombée : le
        moteur indexe ses tables par runout. Extraire la turn, ce serait extraire
        jusqu'à 48 stratégies par nœud, puis 47 de plus à la river. La solution
        pèserait des dizaines de mégaoctets pour un usage que personne n'a.

     2. JUSTESSE (§38/§39). « Le sizing proposé à la turn dépend du nouvel état.
        Ne pas réutiliser naïvement le sizing flop. » Rejouer la turn à partir
        d'une extraction figée du flop reviendrait exactement à cela. La bonne
        réponse est de RE-RÉSOUDRE au nouvel état — pot, tapis et SPR ayant
        changé — ce que fait le Trainer à chaque transition de rue.

   ── DEUX QUESTIONS, DEUX CHAMPS (mission « coup complet ») ──────────────────
   « Cette solution couvre-t-elle les rues suivantes ? » n'a pas UNE réponse, et
   c'est ce qui a produit une affirmation fausse pendant toute la première passe.

     `exposesStreetsAhead` — la solution STOCKÉE contient-elle les nœuds des rues
        suivantes ? **Non**, par choix, pour les deux raisons ci-dessus. C'est ce
        champ que lit un consommateur qui cherche un nœud de turn et ne le trouve
        pas : il doit demander une nouvelle solution au nouvel état.

     `coversStreetsAhead` — les décisions des rues suivantes ont-elles PARTICIPÉ
        au calcul de la valeur de la décision courante ? **Oui dès que le solve a
        porté sur plus d'une rue.** Le CFR construit alors l'arbre jusqu'à la
        river et remonte les valeurs ; l'EV d'un check de flop intègre déjà tout
        ce qui suit.

   Le champ unique d'origine portait le premier sens et le second nom. Il
   annonçait donc `false` sur des solutions dont l'EV triplait précisément parce
   qu'elle intégrait les rues suivantes. Concaténer quatre solutions
   indépendantes ne produit toujours PAS un horizon : `coversStreetsAhead` est
   DÉRIVÉ de `streetsSolved`, jamais choisi par un appelant.
   ══════════════════════════════════════════════════════════════════════════ */

import { EPS, DEFAULT_EVALUATION_CONFIG } from "./config.js";
import { nodeActionEVs } from "../solver/core/multistreet.js";
import { roundTo, roundAmount, specKey, specLabel } from "./sizingSpec.js";
import { checkStrategyNormalization } from "./metrics.js";

/* Sémantique d'un label d'action de l'arbre, en TYPES STRICTS (§37).
   « Ne jamais qualifier un CALL de BET. » Le label du moteur est une lettre ;
   sa traduction est faite ICI, une fois, et jamais devinée ailleurs. */
export function actionTypeOfLabel(label, node) {
  const l = String(label);
  if (l === "X") return node && node.toCall > EPS.amount ? "CALL" : "CHECK";
  if (l === "F") return "FOLD";
  if (l === "C") return "CALL";
  if (l === "J") return "ALL_IN";
  if (l.startsWith("R")) return "RAISE";
  if (l.startsWith("B")) return "BET";
  return "BET";
}

/* Montant ENGAGÉ EN PLUS par l'action, lu sur l'arbre (jamais recalculé depuis
   un libellé — c'est précisément le bug historique `betFracFromLabel`). */
export function actionAmountOf(node, label) {
  const child = node.children ? node.children[label] : null;
  if (!child) return { additionalBb: 0, toBb: 0 };
  const before = node.player === 0 ? node.betsH : node.betsV;
  const after = node.player === 0 ? (child.betsH ?? before) : (child.betsV ?? before);
  const additional = Math.max(0, after - before);
  return { additionalBb: roundAmount(additional), toBb: roundAmount(after) };
}

/* Chemin d'un nœud depuis la racine, sous forme de labels joints par « | ».
   La racine porte le chemin vide "". */
export const pathKey = (path) => (path || []).join("|");

/* ══════════════════════════════════════════════════════════════════════════
   extractStreetStrategy — nœuds de décision de la rue courante.

   Sortie (plain data, clonable) :
   {
     coversStreetsAhead:<dérivé>, exposesStreetsAhead:false, streetsValued:<n>,
     nodes: {
       "<path>": {
         path:[…], player, actions:[…], actionTypes:{label→type},
         sizings:{ label→{ specKey, label, additionalBb, toBb, potFraction } },
         aggregate:{ label→fréquence 0..1 },   // pondérée par la range
         byClass:{ "AKs":{ label→fréquence } },
         potBb, toCallBb, normalization:{ ok, sum }
       }
     },
     classes:[…]     // classes de mains présentes dans la range du joueur
   }
   ══════════════════════════════════════════════════════════════════════════ */
export function extractStreetStrategy(solution, {
  includeByClass = true, maxClasses = 200,
  /* ── EV PAR ACTION (§36, §49) ─────────────────────────────────────────────
     « Après décision : Action Hero · Action GTO · Sizing · Fréquence · EV · EV
     loss » (§36) et « EV played · EV best · EV difference » (§49). Ces colonnes
     réclament une EV PAR ACTION, que le solve ne conserve pas : `nodeActionEVs`
     la recalcule depuis la stratégie moyenne.

     Elle coûte une traversée d'arbre par action et par runout. Sur un board
     COMPLET (river) il n'y a qu'un runout : c'est exact et négligeable. Sur un
     board incomplet il en faut plusieurs dizaines, et le coût se multiplie par
     le nombre de nœuds — d'où deux garde-fous : un budget de runouts et un
     plafond de nœuds, les nœuds les plus proches de la racine étant servis en
     premier (ce sont ceux qu'un joueur regarde).

     `includeEV:false` coupe tout : les consommateurs testent `node.ev` et
     n'inventent jamais de nombre en son absence (§0). */
  includeEV = true,
  evSamples = DEFAULT_EVALUATION_CONFIG.strategyEvSamples || 60,
  maxEVNodes = 24,
} = {}) {
  if (!solution || !solution.tree || typeof solution.avgOf !== "function") return null;
  const nodes = {};
  const seenClasses = new Set();
  const boardComplete = (solution.board ? solution.board.length : solution.initLen || 0) >= 5;
  /* Combien de rues de mise ce solve a réellement portées. Lu sur la solution,
     jamais fourni par l'appelant. */
  const streetsValued = Math.max(1, solution.streetsSolved || 1);
  let evBudget = includeEV ? maxEVNodes : 0;
  let evSkipped = 0;

  /* Index des combos par classe de main, une fois pour chaque camp. */
  const classIndex = (list) => {
    const m = new Map();
    for (let i = 0; i < list.length; i++) {
      const k = list[i].key;
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    return m;
  };
  const idxH = classIndex(solution.heroList || []);
  const idxV = classIndex(solution.villList || []);

  (function walk(node, path) {
    if (!node) return;
    if (node.kind === "chance") return;             // on n'entre pas dans la rue suivante
    if (node.kind === "terminal") return;
    if (node.street !== 0) return;                  // rue courante uniquement (cf. en-tête)

    const isHero = node.player === 0;
    const list = isHero ? solution.heroList : solution.villList;
    const weights = isHero ? solution.wH : solution.wV;
    const byClassIdx = isHero ? idxH : idxV;
    const na = node.actions.length;

    /* Fréquences AGRÉGÉES sur toute la range (pondérées). */
    const agg = new Array(na).fill(0);
    let wsum = 0;
    for (let c = 0; c < list.length; c++) {
      const w = weights[c] || 0;
      if (w <= 0) continue;
      const d = solution.avgOf(node, c, "");
      for (let k = 0; k < na; k++) agg[k] += w * d[k];
      wsum += w;
    }
    const aggregate = {};
    node.actions.forEach((lbl, k) => { aggregate[lbl] = wsum > 0 ? roundTo(agg[k] / wsum, 6) : 0; });

    /* Fréquences PAR CLASSE de main — ce que le Trainer lit pour la main du
       joueur. `reduceRange` ne garde qu'un représentant par classe ; on agrège
       donc sur les index de la classe. */
    const byClass = {};
    if (includeByClass) {
      let n = 0;
      for (const [key, idxs] of byClassIdx) {
        if (n++ >= maxClasses) break;
        seenClasses.add(key);
        const acc = new Array(na).fill(0);
        let ws = 0;
        for (const c of idxs) {
          const w = weights[c] || 0;
          const d = solution.avgOf(node, c, "");
          for (let k = 0; k < na; k++) acc[k] += w * d[k];
          ws += w;
        }
        if (ws <= 0) continue;
        const row = {};
        node.actions.forEach((lbl, k) => { row[lbl] = roundTo(acc[k] / ws, 6); });
        byClass[key] = row;
      }
    }

    const sizings = {}, actionTypes = {};
    for (const lbl of node.actions) {
      const amt = actionAmountOf(node, lbl);
      const spec = node.sizingSpecs ? node.sizingSpecs[lbl] : null;
      actionTypes[lbl] = actionTypeOfLabel(lbl, node);
      /* ── DEUX ÉTIQUETTES, ET L'ÉCRAN DOIT MONTRER LA SECONDE ──────────
         `specLabel` dit ce qui a été DEMANDÉ (« 75 % ») ; la quantification au
         pas de la table et l'écrêtage déplacent le montant. Sur un pot de 1.5bb
         au pas de 0.5bb, « 75 % » vaut 1.125bb → 1bb, soit 67 % du pot. Afficher
         « 75 % » à côté de « 1bb » serait faux d'un point d'affichage — et c'est
         exactement le genre d'écart que §73 demande d'éliminer.
         On expose donc les deux : `realizedLabel` pour l'écran, `specLabel` pour
         la traçabilité de la demande. */
      const realizedFraction = node.pot > EPS.amount ? amt.additionalBb / node.pot : null;
      const realizedLabel = spec && spec.type === "jam" ? "JAM"
        : realizedFraction != null && lbl !== "X" && lbl !== "F" && lbl !== "C"
          ? `${Math.round(realizedFraction * 100)}%`
          : (spec ? specLabel(spec) : null);
      sizings[lbl] = {
        specKey: spec ? specKey(spec) : null,
        specLabel: spec ? specLabel(spec) : null,
        realizedLabel,
        spec: spec || null,
        additionalBb: amt.additionalBb,
        toBb: amt.toBb,
        /* Fraction du pot AVANT l'action — la grandeur que l'UI affiche. */
        potFraction: node.pot > EPS.amount ? roundTo(amt.additionalBb / node.pot, 4) : null,
      };
    }

    /* EV par action à CE nœud. Jamais fabriquée : si le budget est épuisé ou
       si le calcul n'est pas disponible, le champ porte le motif, pas un nombre. */
    let ev = null;
    if (includeEV) {
      if (evBudget <= 0) { evSkipped++; ev = { available: false, reason: `budget de ${maxEVNodes} nœuds épuisé — nœud trop profond pour être chiffré` }; }
      else {
        evBudget--;
        const r = nodeActionEVs(solution, path, { samples: boardComplete ? 1 : evSamples });
        ev = r && r.available
          ? { available: true, exact: !!r.exact, samples: r.samples, note: r.note,
              byAction: r.byAction, byClass: includeByClass ? r.byClass : null,
              mixedEV: r.mixedEV, reachShare: r.reachShare }
          : { available: false, reason: (r && r.reason) || "indisponible" };
      }
    }

    nodes[pathKey(path)] = {
      path: path.slice(),
      ev,
      nodeId: node.id,
      player: node.player,
      actions: node.actions.slice(),
      actionTypes,
      sizings,
      aggregate,
      byClass,
      potBb: roundAmount(node.pot),
      toCallBb: roundAmount(node.toCall || 0),
      normalization: checkStrategyNormalization(aggregate),
    };

    for (const a of node.actions) walk(node.children[a], [...path, a]);
  })(solution.tree, []);

  return {
    /* Ce que vaut l'EV rapportée ici, en un mot — l'UI n'a pas à le deviner. */
    evAvailable: includeEV,
    evExact: includeEV ? boardComplete : null,
    evNodesSkipped: evSkipped,
    /* ── L'HORIZON DE VALEUR — DÉRIVÉ, JAMAIS DÉCLARÉ ────────────────────────
       Lu sur le solve lui-même. Un appelant ne peut pas le mettre à `true` : ce
       serait exactement la faute que la mission interdit — juxtaposer des
       décisions indépendantes et appeler cela une solution multi-rue. */
    streetsValued,
    coversStreetsAhead: streetsValued > 1,
    coversStreetsNote: streetsValued > 1
      ? `Valeur calculée sur ${streetsValued} rues de mise : les décisions des rues suivantes ont participé à l'EV de la décision courante. La STRATÉGIE des rues suivantes n'est pas stockée pour autant (voir exposesStreetsAhead).`
      : "Solve d'une seule rue : la valeur ne tient compte d'aucune rue suivante.",
    /* ── CE QUE LA SOLUTION EXPOSE — un choix, pas une limite subie ──────────
       Toujours faux : la stratégie d'un nœud de turn dépend de la carte tombée,
       et la re-résoudre au nouvel état est la bonne réponse (§38/§39). */
    exposesStreetsAhead: false,
    exposesStreetsNote: "Nœuds de la rue courante uniquement. Une rue suivante se re-résout au nouvel état — pot, tapis et SPR ont changé (§38/§39).",
    nodes,
    classes: [...seenClasses].sort(),
    nodeCount: Object.keys(nodes).length,
  };
}

/* Fréquences d'un nœud pour une classe de main donnée, avec repli explicite sur
   l'agrégat de range. Le repli est SIGNALÉ (`source`) — une fréquence de range
   n'est pas la fréquence d'une main, et le Coach doit pouvoir le dire. */
export function nodeStrategyFor(strategy, path, handClass) {
  const node = strategy && strategy.nodes ? strategy.nodes[pathKey(path)] : null;
  if (!node) return null;
  const ev = node.ev && node.ev.available ? node.ev : null;

  /* ── L'EV SUIT LA MÊME SOURCE QUE LA FRÉQUENCE ────────────────────────────
     Si l'on lit les fréquences de la classe de main, on lit AUSSI son EV. Les
     mélanger — la fréquence d'AKs et l'EV de la range — donnerait un couple qui
     ne décrit aucune situation réelle.

     Et la nuance compte : l'EV agrégée répond à « que vaudrait cette action si
     TOUTE la range la prenait », ce qui n'est pas ce que fait la stratégie. La
     grandeur qu'un joueur peut lire est celle de SA main. `evSource` le dit,
     et `evIsRangeWide` permet à l'écran de le nuancer plutôt que de le taire. */
  if (handClass && node.byClass && node.byClass[handClass]) {
    const evs = ev && ev.byClass && ev.byClass[handClass] ? ev.byClass[handClass] : null;
    return {
      freqs: node.byClass[handClass], source: "hand-class", node,
      evs, evSource: evs ? "hand-class" : null,
      evExact: evs ? !!ev.exact : null,
      evNote: evs ? null : (node.ev ? node.ev.reason || "l'EV par action n'a pas été calculée pour cette classe de main." : "l'EV par action n'a pas été calculée pour ce nœud : cette solution ne porte pas de bloc d'EV."),
    };
  }
  const evs = ev ? ev.byAction : null;
  return {
    freqs: node.aggregate, source: "range-aggregate", node,
    evs, evSource: evs ? "range-aggregate" : null,
    evExact: evs ? !!ev.exact : null,
    evIsRangeWide: !!evs,
    evNote: evs
      ? "EV calculée sur la RANGE ENTIÈRE : « que vaudrait cette action si toute la range la prenait ». Ce n'est pas l'EV d'une main précise."
      : (node.ev ? node.ev.reason || "l'EV par action n'a pas été calculée pour ce nœud." : "l'EV par action n'a pas été calculée pour ce nœud : cette solution ne porte pas de bloc d'EV."),
    note: handClass ? `${handClass} absente de la range solvée — fréquences de la range entière` : null,
  };
}

/* Les actions LÉGALES d'un nœud, prêtes pour des boutons (§71).
   Rien n'est ajouté qui n'existe pas dans la solution : c'est la règle §71
   (« Ils ne doivent jamais contenir des options absentes de la solution active »). */
export function legalActionsFromNode(node, evs = null) {
  if (!node) return [];
  return node.actions.map(lbl => ({
    /* `null` quand l'EV n'a pas été calculée — jamais 0, qui se lirait comme
       une valeur (§0). */
    evBb: evs && Number.isFinite(evs[lbl]) ? evs[lbl] : null,
    label: lbl,
    actionType: node.actionTypes[lbl],
    additionalBb: node.sizings[lbl].additionalBb,
    toBb: node.sizings[lbl].toBb,
    potFraction: node.sizings[lbl].potFraction,
    specKey: node.sizings[lbl].specKey,
    /* L'étiquette exposée aux écrans est celle du montant réalisé (§73) ; la
       demande d'origine reste lisible dans `requestedLabel`. */
    specLabel: node.sizings[lbl].realizedLabel || node.sizings[lbl].specLabel,
    requestedLabel: node.sizings[lbl].specLabel,
    frequency: node.aggregate[lbl],
  }));
}
