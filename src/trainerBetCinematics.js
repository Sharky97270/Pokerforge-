/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — CINÉMATIQUE DES MISES DU TRAINER (source unique).

   `trainerTableGeometry` répond à « OÙ sont les objets ». Ce module répond à
   « DANS QUEL ORDRE et à QUELLE VITESSE ils bougent ». Il ne rend aucun pixel :
   il décrit une séquence, et projette l'état du moteur sur ce que l'œil doit
   voir à un instant donné.

   ── LE DÉFAUT QU'IL CORRIGE (§12) ─────────────────────────────────────────
   Le pot prenait sa valeur finale AVANT toute animation : `setPotWithDelta`
   écrivait `currentPotRef.current = next` de façon synchrone, puis déclenchait
   un « +X » décoratif. L'animation ne racontait donc rien — elle commentait un
   résultat déjà annoncé. Et la fin d'un tour d'enchères n'avait aucune
   collecte : les tas disparaissaient sur place, le pot sautait.

   Mesuré dans le navigateur avant correction (scripts/trainer-cine-audit.mjs) :
     · aucune collecte visible au changement de street ;
     · des tas de la street PRÉCÉDENTE encore affichés après que le board a
       changé (relevé : « UTG:call10bb », « HJ:3-bet10bb ») — les ghost chips
       du §28 ;
     · les jetons en vol partent d'un point FIXE (`.chip-hero-fly` est calé à
       `bottom:22%;left:48%`), donc ne disent pas qui a payé.

   ── LE MODÈLE ─────────────────────────────────────────────────────────────
   Une seule règle, celle du §26 : le moteur est la vérité, le visuel est une
   PROJECTION qui a le droit d'être en retard — jamais en avance, jamais
   différent à l'arrêt.

       potAffiché(t) = potMoteur, sauf pendant une collecte en cours,
                       où il reste à sa valeur d'avant jusqu'à l'arrivée
                       des jetons.

   Ce module ne connaît ni React ni le DOM : il se teste sans navigateur.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── TIMINGS (§13) ─────────────────────────────────────────────────────────
   Le cahier des charges donne des fourchettes ; on prend le milieu de chacune,
   et on les garde ICI. Elles vivaient auparavant en dur dans six appels de
   `setTimeout` répartis dans TrainerTab (380, 450, 550, 600, 780 ms), sans
   qu'aucun ne corresponde à une intention affichée.

   « PokerForge doit rester dynamique » : la somme d'une séquence complète
   (apparition + trajet + collecte) tient sous 650 ms. */
export const CINE = {
  betAppear: 150,     // §13 : 120-180 ms — le tas se pose
  chipTravel: 220,    // §13 : 180-250 ms — les jetons parcourent l'axe
  potCollect: 260,    // §13 : 200-300 ms — la collecte rejoint le pot
  potPulse: 200,      // battement du montant à l'arrivée
};

/* Vitesse de jeu : la mosaïque enchaîne quatre tables, une cinématique pleine
   longueur y devient une attente. On raccourcit, on ne supprime pas — une
   collecte invisible ramène le défaut d'origine. */
export const CINE_SPEED = { 1: 1, 2: 0.9, 3: 0.78, 4: 0.7 };

export function cineDuration(step, numTables = 1) {
  const base = CINE[step] || 0;
  const k = CINE_SPEED[numTables] ?? 1;
  return Math.round(base * k);
}

/** Durée totale d'une collecte, temporisation du pot comprise. */
export function collectTotalMs(numTables = 1) {
  return cineDuration("chipTravel", numTables) + cineDuration("potCollect", numTables);
}

/* ── QUI PART VERS LE POT ──────────────────────────────────────────────────
   Une contribution par SIÈGE, jamais deux, et jamais un siège à zéro : c'est
   la même règle que pour l'affichage au repos (un seul tas par joueur). */
export function collectContributions(streetCommitted = {}) {
  return Object.entries(streetCommitted)
    .map(([pos, amount]) => ({ pos, amount: Math.round((Number(amount) || 0) * 100) / 100 }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);   // le plus gros tas part devant
}

/**
 * Séquence de collecte (§12/§27). Rend des étapes ORDONNÉES et datées, que le
 * rendu n'a plus qu'à exécuter — il ne décide ni de l'ordre ni des durées.
 *
 * L'ordre est celui du cahier des charges : les jetons partent, PUIS le pot
 * prend sa valeur, PUIS la street suivante est distribuée.
 */
export function buildCollectSequence({ streetCommitted = {}, potBefore = 0, potAfter = null, numTables = 1 } = {}) {
  const chips = collectContributions(streetCommitted);
  if (!chips.length) return [];
  const travel = cineDuration("chipTravel", numTables);
  const collect = cineDuration("potCollect", numTables);
  const somme = chips.reduce((a, c) => a + c.amount, 0);
  const brut = (potAfter != null && isFinite(Number(potAfter)))
    ? Number(potAfter)
    : (Number(potBefore) || 0) + somme;
  const total = Math.round(brut * 100) / 100;
  return [
    { type: "CHIPS_TO_POT", at: 0, duration: travel + collect, chips },
    // Le pot ne bouge qu'à l'ARRIVÉE : c'est toute la règle du §12.
    { type: "POT_UPDATE", at: travel + collect, duration: cineDuration("potPulse", numTables), value: total },
  ];
}

/* ── PROJECTION DU POT (§26) ───────────────────────────────────────────────
   Le moteur a déjà encaissé ; l'affichage attend les jetons. La fonction est
   volontairement totale : sans collecte en cours, elle rend le pot du moteur,
   donc le visuel ne peut pas rester bloqué sur une valeur périmée si une
   animation est annulée (changement de spot, démontage). */
export function projectDisplayedPot(enginePot, collect = null, now = 0) {
  const engine = Number(enginePot) || 0;
  if (!collect || !isFinite(collect.startedAt) || !(collect.landsAt > collect.startedAt)) return engine;
  return now < collect.landsAt ? (Number(collect.potBefore) || 0) : engine;
}

/* ── PAS DE GHOST CHIPS (§28) ──────────────────────────────────────────────
   Un tas n'a le droit d'être peint que s'il appartient à la street COURANTE.
   Le défaut mesuré venait de là : les jetons du contexte préflop du spot
   restaient affichés alors que le board avait déjà grandi, parce que leur
   condition d'affichage ne regardait pas la street.

   `visibleStreetBets` est le seul point qui décide. Il prend l'engagement de la
   street courante et la street à laquelle il a été relevé ; si les deux ne
   concordent pas, il ne rend rien plutôt que de rendre du périmé. */
export const STREET_RANK = { preflop: 0, flop: 1, turn: 2, river: 3 };

export function streetRankOf(street) {
  const s = String(street || "preflop").toLowerCase();
  for (const k of Object.keys(STREET_RANK)) if (s.startsWith(k.slice(0, 4))) return STREET_RANK[k];
  return 0;
}

/** Rang de street déduit du nombre de cartes du board — le repère le plus sûr,
 *  parce qu'il ne dépend d'aucun libellé et qu'il ne peut pas être en retard. */
export function streetRankFromBoard(boardCount = 0) {
  const n = Number(boardCount) || 0;
  if (n >= 5) return 3;
  if (n === 4) return 2;
  if (n >= 3) return 1;
  return 0;
}

export function visibleStreetBets({ streetCommitted = {}, committedAtRank = 0, boardCount = 0, collecting = false } = {}) {
  if (collecting) return [];                                   // les jetons sont en vol
  if (streetRankFromBoard(boardCount) !== committedAtRank) return [];   // périmé → rien
  return collectContributions(streetCommitted);
}
