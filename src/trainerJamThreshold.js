/* ══════════════════════════════════════════════════════════════════════════
   trainerJamThreshold.js — LE SEUIL DE JAM : CALCULÉ, OU RENOMMÉ (C10)

   POURQUOI CE MODULE EXISTE
   La carte push/fold affichait « Seuil Nash : top X% ». Ce X était le produit
   de deux constantes :

       baseTop = {BTN:60, CO:42, HJ:30, …}[position]
       stackAdj = profondeur <= 10 ? 1.18 : … : 0.72

   Le mot « Nash » désignait donc une multiplication codée en dur. Le dépôt sait
   pourtant CALCULER cette range : `solvePreflopPushFold` est certifié et publie
   ses fréquences de jam. Comparaison mesurée aux seules profondeurs comparables
   (SB, heads-up, chip-EV) : 55 % affiché contre 44,8 % calculé à 15bb, soit
   10,2 points d'écart — un nombre non calculé portait le nom d'un équilibre.

   La règle appliquée ici :
     • DANS le domaine certifié → la fréquence RÉELLEMENT calculée, avec sa
       provenance et ses paramètres (SB vs BB, chip-EV, profondeur) ;
     • HORS domaine → aucune extrapolation. Le libellé devient « Repère
       heuristique », le badge « ≈ Heuristique », et la raison est affichée.

   Le mot « Nash » n'apparaît JAMAIS hors domaine — c'est ce que verrouillent
   les tests de domaine.
   ══════════════════════════════════════════════════════════════════════════ */

import { pushFoldDomain, parseStackBb } from "./trainerSolutionScope.js";

export const JAM_PROVENANCE = { SOLVER: "solver", HEURISTIC: "heuristic" };

/* Le repère heuristique historique — conservé, mais NOMMÉ pour ce qu'il est.
   Il ne prétend plus décrire un équilibre : c'est une table d'ouverture par
   position, ajustée par la profondeur. */
const REPERE_PAR_POSITION = { BTN: 60, CO: 42, HJ: 30, MP: 24, "UTG+1": 20, UTG: 16, SB: 55, BB: 38 };
const REPERE_PAR_DEFAUT = 35;
function repereHeuristique(hpos, stackBb) {
  const base = REPERE_PAR_POSITION[hpos] ?? REPERE_PAR_DEFAUT;
  const ajuste = stackBb <= 10 ? 1.18 : stackBb <= 15 ? 1.0 : stackBb <= 20 ? 0.85 : 0.72;
  return Math.max(6, Math.min(94, Math.round(base * ajuste)));
}

/* ──────────────────────────────────────────────────────────────────────────
   jamThreshold — le seuil, et surtout d'où il vient.

   opts.solve : injectable pour les tests (par défaut `solvePreflopPushFold`).
   ────────────────────────────────────────────────────────────────────────── */
export function jamThreshold(spot, { solve = null } = {}) {
  const domain = pushFoldDomain(spot);
  const stackBb = parseStackBb(spot?.stack);
  const hpos = spot?.hpos;

  if (domain.inDomain && typeof solve === "function") {
    let sol = null;
    try { sol = solve(stackBb); } catch { sol = null; }
    /* Hero à la SB décide de jammer : c'est `sbJamPct`. Hero à la BB décide de
       payer un jam : c'est `bbCallPct`. Confondre les deux reviendrait à
       afficher la range de l'adversaire. */
    const pct = hpos === "BB" ? sol?.bbCallPct : sol?.sbJamPct;
    if (sol && Number.isFinite(Number(pct))) {
      const estCall = hpos === "BB";
      return {
        value: Math.round(Number(pct) * 10) / 10,
        provenance: JAM_PROVENANCE.SOLVER,
        label: estCall ? "Range de call d'équilibre (BB vs jam SB)" : "Range de jam d'équilibre (SB vs BB)",
        badge: "🦈 Solveur",
        engine: "solvePreflopPushFold",
        exact: true,
        /* Paramètres AFFICHÉS : sans eux, « range d'équilibre » ne dit pas de
           quel jeu on parle. */
        params: {
          modele: "SB jam / BB call, heads-up",
          bareme: "chip-EV (sans ICM)",
          profondeurBb: stackBb,
          source: sol.precompiled ? "bibliothèque pré-solvée" : "solve live",
          iterations: sol.iters ?? null,
          exploitabilite: sol.exploitability ?? null,
        },
        domain, reasons: [],
      };
    }
  }

  /* Hors domaine : on ne convertit pas une heuristique en équilibre. */
  return {
    value: repereHeuristique(hpos, stackBb),
    provenance: JAM_PROVENANCE.HEURISTIC,
    label: "Repère heuristique",
    badge: "≈ Heuristique",
    engine: "table-position-profondeur",
    exact: false,
    params: { position: hpos || "?", profondeurBb: stackBb, nature: "table d'ouverture ajustée par la profondeur" },
    domain,
    reasons: domain.reasons,
  };
}

/* ── GARDE-FOU DE VOCABULAIRE ──────────────────────────────────────────────
   Aucun texte issu d'une heuristique ne peut contenir « Nash », « GTO »,
   « équilibre », « solveur » ou « exact ». Utilisé par les tests ET par le
   rendu, pour que la règle soit vérifiée là où elle s'applique. */
const MOTS_RESERVES = /\b(nash|gto|équilibre|equilibre|solveur|solver|exact|exacte)\b/i;
export function assertNoOverclaim(texte, provenance) {
  if (provenance === JAM_PROVENANCE.SOLVER) return null;
  const t = String(texte || "");
  const m = t.match(MOTS_RESERVES);
  return m ? `provenance ${provenance} mais le texte revendique « ${m[0]} » : ${t.slice(0, 90)}` : null;
}

/* Phrase pédagogique honnête, construite depuis le seuil et sa provenance. */
export function jamThresholdNote(seuil, { shoveIsBest = false, icm = false } = {}) {
  if (!seuil) return "";
  const q = `${seuil.label} ≈ top ${seuil.value}%`;
  const reserve = seuil.provenance === JAM_PROVENANCE.SOLVER
    ? ` (${seuil.params.modele} · ${seuil.params.bareme} · ${seuil.params.profondeurBb}bb)`
    : ` — repère indicatif, non calculé${seuil.reasons?.length ? ` (${seuil.reasons[0]})` : ""}`;
  return shoveIsBest
    ? `Cette main entre dans le ${q}${reserve}. Le jam capture assez de fold equity pour être rentable${icm ? ", même sous pression ICM" : ""}.`
    : `Hors du ${q}${reserve}. Le jam ne récupère pas assez de fold equity${icm ? " et le barème pénalise le risque" : ""} → fold.`;
}
