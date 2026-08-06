/* ════════════════════════════════════════════════════════════════════════════
   CHARTS PRÉFLOP — REGISTRE + LOOKUP (infrastructure, AUCUNE donnée embarquée)

   POURQUOI CE MODULE EXISTE
   Le préflop profond (open / 3-bet / 4-bet) N'EST PAS solvable en direct dans un
   navigateur : contrairement au push/fold — 2 actions terminales, abattage immédiat,
   solvable exactement en secondes (cf. solver/core/pushfold.js) — un open traîne
   derrière lui tout le jeu postflop. La seule voie honnête pour de vraies fréquences
   préflop est donc d'EMBARQUER des charts pré-calculés.

   CE QUE CE MODULE EST — ET N'EST PAS
   · C'est un REGISTRE : il accueille, valide et interroge des charts fournis.
   · Ce n'est PAS un solveur, et un chart n'est PAS un calcul fait ici. La provenance
     retournée est "chart" — jamais "solver" (§2 : le solveur calcule, rien d'autre ne
     doit se faire passer pour lui).
   · AUCUNE donnée n'est livrée avec ce fichier. Tant que rien n'est enregistré, le
     lookup renvoie null et l'application garde son comportement actuel (heuristique).
     Le module est donc INERTE par défaut : il ne peut rien casser.

   ATTRIBUTION OBLIGATOIRE
   Un chart sans `attribution` est REFUSÉ. Un jeu de fréquences dont on ne sait plus
   d'où il vient est indiscernable d'un chiffre inventé — et c'est exactement ainsi
   qu'une heuristique finit par être présentée comme une vérité GTO.

   FORMAT ATTENDU
   {
     id: "gto-6max-100bb",                 // identifiant unique
     label: "GTO 6-max 100bb",             // libellé affiché
     attribution: "Solveur X, export du …",// OBLIGATOIRE : d'où viennent ces nombres
     format: "cash-6max",                  // optionnel : contexte de jeu
     stackBb: 100,                         // profondeur de tapis du chart
     spots: {
       // clé = `${heroPos}|${action}` ou `${heroPos}|${action}|${vsPos}`
       // valeur = { <main 169> : { r, c, f } }  (r=relance, c=call, f=fold, en %)
       "BTN|rfi":          { AA: { r: 100, c: 0, f: 0 }, "72o": { r: 0, c: 0, f: 100 } },
       "BB|vs_open|BTN":   { AA: { r: 90, c: 10, f: 0 } },
     }
   }
   ════════════════════════════════════════════════════════════════════════════ */

/* Actions préflop reconnues (mêmes clés que buildSolverFreqs). */
export const CHART_ACTIONS = ["rfi", "vs_open", "vs_3bet", "vs_4bet"];

/* Écart de tapis toléré pour réutiliser un chart d'une autre profondeur (en bb).
   Au-delà, on préfère ne RIEN renvoyer plutôt qu'une range inadaptée : une range
   d'open à 100bb appliquée à un tapis de 20bb serait tout simplement fausse. */
export const STACK_TOLERANCE_BB = 15;

const _charts = new Map();   // id → chart validé

function isFreqEntry(v) {
  if (!v || typeof v !== "object") return false;
  const r = Number(v.r) || 0, c = Number(v.c) || 0, f = Number(v.f) || 0;
  if (r < 0 || c < 0 || f < 0) return false;
  return r + c + f <= 100.5;                 // tolérance d'arrondi
}

/* Valide un jeu de charts SANS l'enregistrer. Retourne {ok, errors[]}.
   Volontairement strict : mieux vaut refuser un chart douteux que servir des
   fréquences fausses sous un badge qui inspire confiance. */
export function validateChartSet(data) {
  const errors = [];
  if (!data || typeof data !== "object") return { ok: false, errors: ["chart absent ou non-objet"] };
  if (!data.id || typeof data.id !== "string") errors.push("`id` manquant (chaîne requise)");
  if (!data.attribution || typeof data.attribution !== "string" || !data.attribution.trim()) {
    errors.push("`attribution` OBLIGATOIRE : indiquer d'où proviennent ces fréquences");
  }
  const st = Number(data.stackBb);
  if (!Number.isFinite(st) || st <= 0) errors.push("`stackBb` manquant ou invalide");
  if (!data.spots || typeof data.spots !== "object") {
    errors.push("`spots` manquant");
    return { ok: errors.length === 0, errors };
  }
  const keys = Object.keys(data.spots);
  if (!keys.length) errors.push("`spots` vide");
  for (const k of keys) {
    const parts = String(k).split("|");
    if (parts.length < 2) { errors.push(`clé de spot invalide : "${k}" (attendu "POS|action[|vsPos]")`); continue; }
    if (!CHART_ACTIONS.includes(parts[1])) errors.push(`action inconnue dans "${k}" : ${parts[1]}`);
    const hands = data.spots[k];
    if (!hands || typeof hands !== "object" || !Object.keys(hands).length) { errors.push(`spot "${k}" vide`); continue; }
    for (const h in hands) {
      if (!isFreqEntry(hands[h])) { errors.push(`fréquences invalides pour ${k} / ${h}`); break; }
    }
  }
  return { ok: errors.length === 0, errors };
}

/* Enregistre un jeu de charts. Lève si invalide — un chart à moitié correct ne doit
   jamais entrer dans le registre. Retourne l'id enregistré. */
export function registerChartSet(data) {
  const { ok, errors } = validateChartSet(data);
  if (!ok) throw new Error("Chart refusé : " + errors.join(" · "));
  _charts.set(data.id, data);
  return data.id;
}

export function listChartSets() {
  return [..._charts.values()].map(c => ({
    id: c.id, label: c.label || c.id, attribution: c.attribution,
    stackBb: c.stackBb, format: c.format || null, spots: Object.keys(c.spots).length,
  }));
}
export function clearChartSets() { _charts.clear(); }
export function chartCount() { return _charts.size; }

/* Cherche les fréquences d'UNE main. Retourne null si rien ne correspond — et null
   veut dire « on ne sait pas », ce qui laisse l'appelant retomber sur l'heuristique.
   On ne devine jamais.
   → { freqs, chartId, chartLabel, attribution, stackUsed, exactStack } */
export function lookupPreflopChart({ heroPos, vsPos, action, stackBb, handKey, format } = {}) {
  if (!heroPos || !action || !handKey) return null;
  if (!CHART_ACTIONS.includes(action)) return null;
  const want = Number(stackBb);
  let best = null, bestGap = Infinity;
  for (const c of _charts.values()) {
    if (format && c.format && c.format !== format) continue;
    const gap = Number.isFinite(want) ? Math.abs((Number(c.stackBb) || 0) - want) : 0;
    if (Number.isFinite(want) && gap > STACK_TOLERANCE_BB) continue;
    // Clé la plus spécifique d'abord (avec l'adversaire), puis la générique.
    const keys = vsPos ? [`${heroPos}|${action}|${vsPos}`, `${heroPos}|${action}`] : [`${heroPos}|${action}`];
    for (const k of keys) {
      const hands = c.spots[k];
      const f = hands && hands[handKey];
      if (f && gap < bestGap) {
        bestGap = gap;
        best = {
          freqs: { r: Number(f.r) || 0, c: Number(f.c) || 0, f: Number(f.f) || 0 },
          chartId: c.id, chartLabel: c.label || c.id, attribution: c.attribution,
          stackUsed: Number(c.stackBb) || null, exactStack: gap === 0,
        };
      }
      if (best && bestGap === 0) break;
    }
  }
  return best;
}
