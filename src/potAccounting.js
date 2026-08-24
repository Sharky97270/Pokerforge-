/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — COMPTABILITÉ DU POT (§24/§25 de la mission cinématique).

   Le pot affiché n'est pas une décoration : c'est une somme, et la table doit
   permettre de la RECONSTRUIRE. Le défaut relevé dans la vidéo est exactement
   celui-là — « POT 12bb » avec 0.5bb à la SB et un 3-Bet 7.5bb à la BB, et rien
   qui explique les 4bb manquants (c'était l'open de Hero, que la mosaïque
   n'affichait pas).

   Ce module ne rend pas de pixels. Il donne la seule définition du pot dont tout
   le reste dépend :

       pot = potDesStreetsPrécédentes + Σ engagements de la street courante

   et le moyen de VÉRIFIER qu'un rendu la respecte : `assertPotConsistency`
   compare le pot du moteur, le pot affiché et la somme des tas dessinés. En
   développement, une divergence est un bug de rendu, pas un arrondi.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Les montants du Trainer sont en bb avec un chiffre après la virgule (0.5bb de
   petite blinde). La tolérance ne couvre donc que le flottant, pas une erreur de
   comptage : un demi-blind manquant reste une erreur. */
export const POT_EPSILON = 0.011;

const num = v => (typeof v === "number" && isFinite(v) ? v : 0);
export const roundPot = v => Math.round(num(v) * 100) / 100;

/**
 * Pot reconstruit depuis les engagements.
 * @param streetCommitted  { joueur: bb engagés SUR LA STREET COURANTE }
 * @param previousStreetPot  pot collecté aux streets précédentes
 */
export function calculatePotFromContributions(streetCommitted = {}, previousStreetPot = 0) {
  const sum = Object.values(streetCommitted).reduce((a, v) => a + num(v), 0);
  return roundPot(num(previousStreetPot) + sum);
}

/* ── LE POT PRÉFLOP EST UNE SOMME, PAS UNE FORMULE (§24) ───────────────────
   La blinde d'un joueur qui a ensuite relancé est DÉJÀ comprise dans sa
   relance : une SB qui poste 0.5 puis ouvre à 3 a engagé 3, pas 3.5. Les deux
   générateurs de spots préflop du Trainer l'ajoutaient une seconde fois —

     défense de blinde   pot = toCall + 3.5        → 5 au lieu de 4
     face à un 3-bet     pot = 3bet + open + 1.5   → 11.5 au lieu de 10.5

   soit exactement une blinde de trop à chaque fois. Ce n'est pas cosmétique :
   ce pot alimente les COTES DU POT et le SPR affichés, donc le Trainer
   enseignait une décision à partir d'un prix faux. Mesuré à l'écran : « POT
   7.5bb » avec 3bb devant la SB et 3bb devant la BB — 1.5bb que rien
   n'explique.

   `commitments` : l'engagement TOTAL de chaque joueur encore debout (blinde
   comprise). `deadBlinds` : les blindes des joueurs couchés, qui sont dans le
   pot mais n'appartiennent plus à personne — c'est la seule part du pot qu'on
   ne peut légitimement pas rattacher à un siège. */
export function preflopPot({ commitments = {}, deadBlinds = {} } = {}) {
  const vivant = Object.values(commitments).reduce((a, v) => a + num(v), 0);
  const mort = Object.values(deadBlinds).reduce((a, v) => a + num(v), 0);
  return roundPot(vivant + mort);
}

/**
 * Somme des tas RÉELLEMENT dessinés sur la table.
 * @param seatChips  [{ pos, amount }] — un tas par joueur, jamais deux (la
 *                   blinde postée EST l'engagement du joueur, pas un jeton en
 *                   plus : c'est la règle que respecte `seatShowsChips`).
 */
export function sumDisplayedChips(seatChips = []) {
  return roundPot(seatChips.reduce((a, c) => a + num(c && c.amount), 0));
}

/**
 * Tapis effectif. La convention de PokerForge est le tapis de HERO — §23 dit
 * explicitement de ne pas la changer. Les tapis adverses ne sont pris en compte
 * que s'ils sont fournis, et alors seulement pour PLAFONNER : on ne peut pas
 * jouer plus de jetons que l'adversaire le plus court n'en a devant lui.
 */
export function effectiveStack(heroStack, villainStacks = []) {
  const hero = num(heroStack);
  const others = villainStacks.map(num).filter(v => v > 0);
  return others.length ? Math.min(hero, Math.min(...others)) : hero;
}

/** SPR = tapis effectif / pot. Rendu à une décimale, comme l'affichage. */
export function stackToPotRatio(effStack, pot) {
  const p = num(pot);
  if (!(p > 0)) return null;
  return Math.round((num(effStack) / p) * 10) / 10;
}

/**
 * Contrôle de cohérence (§24). Rend la liste des écarts trouvés — vide si tout
 * concorde. À appeler en DEV : en production, elle coûte une somme et rien de
 * plus, mais son intérêt est d'échouer bruyamment pendant le développement.
 *
 * @returns [{ code, attendu, obtenu, ecart }]
 */
export function assertPotConsistency({
  enginePot, displayedPot, streetCommitted = {}, previousStreetPot = 0, seatChips = null,
} = {}) {
  const problems = [];
  const reconstructed = calculatePotFromContributions(streetCommitted, previousStreetPot);
  const check = (code, attendu, obtenu) => {
    if (attendu == null || obtenu == null) return;
    const ecart = roundPot(obtenu - attendu);
    if (Math.abs(ecart) > POT_EPSILON) problems.push({ code, attendu, obtenu, ecart });
  };
  check("moteur≠contributions", reconstructed, roundPot(enginePot));
  check("affiché≠moteur", roundPot(enginePot), roundPot(displayedPot));
  if (seatChips) {
    // Les tas dessinés ne portent QUE la street courante : le pot des streets
    // précédentes est déjà collecté au centre (§27).
    check("tas dessinés≠engagements", roundPot(reconstructed - num(previousStreetPot)), sumDisplayedChips(seatChips));
  }
  return problems;
}

/* ══════════════════════════════════════════════════════════════════════════
   carriedLineForPostflopSpot — LE POT REPORTÉ DEVIENT UNE SOMME CONNUE

   Un spot postflop n'exposait que son POT d'entrée, tiré au hasard et sans
   rapport avec une séquence jouable. Le ledger devait donc RÉPARTIR ce pot
   entre les joueurs — à parts égales faute de mieux. La somme était exacte,
   l'attribution était une hypothèse.

   Ici on fait l'inverse : on construit d'abord la SÉQUENCE qui a produit le
   pot, et le pot en découle. On sait alors, sans rien supposer, combien chaque
   siège a engagé.

   Le modèle est celui que le Trainer joue : heads-up à l'arrivée, les autres
   sièges ayant abandonné avant. Leurs blindes restent dans le pot — c'est la
   part « morte », la seule qu'on ne peut rattacher à personne, et c'est
   précisément elle que la répartition à parts égales faisait disparaître.

       pot = blindesMortes + 2 × engagementParJoueur

   `targetPot` est une CIBLE, pas une contrainte : le pot rendu est celui que
   la séquence produit réellement, au demi-blind près.
   ══════════════════════════════════════════════════════════════════════════ */
export const CARRIED_STEP = 0.5;
const roundStepPot = v => Math.round((num(v) / CARRIED_STEP)) * CARRIED_STEP;

export function carriedLineForPostflopSpot({
  street = "Flop", hpos = null, vpos = null, seats = [],
  targetPot = 0, blinds = { SB: 0.5, BB: 1 }, openTo = 2.5,
} = {}) {
  if (!hpos || !vpos || hpos === vpos) return null;
  const cible = Math.max(0, num(targetPot));

  /* Blindes des sièges qui ne sont plus dans le coup : mortes, mais dans le pot. */
  const morts = {};
  let dead = 0;
  for (const p of seats) {
    if (p === hpos || p === vpos) continue;
    const b = num(blinds[p]);
    if (b > 0) { morts[p] = roundPot(b); dead = roundPot(dead + b); }
  }

  /* Engagement de CHAQUE joueur encore en jeu. Il ne peut pas descendre sous
     l'ouverture préflop : sans ça, la séquence ne serait pas jouable. */
  const brut = (cible - dead) / 2;
  const parJoueur = Math.max(roundStepPot(openTo), roundStepPot(brut));
  const pot = roundPot(dead + 2 * parJoueur);

  /* Répartition sur les streets antérieures : le préflop porte l'ouverture, le
     reste se répartit sur les streets déjà jouées. Chacune est SUIVIE — c'est
     ce qui permet au coup d'arriver jusqu'ici. */
  const rang = { flop: 1, turn: 2, river: 3 };
  const nStreets = rang[String(street).toLowerCase()] || 1;   // streets d'action AVANT celle-ci
  const preflop = Math.min(parJoueur, roundStepPot(openTo));
  const reste = roundStepPot(parJoueur - preflop);
  const parStreet = [];
  let distribue = 0;
  for (let i = 0; i < nStreets; i++) {
    const part = i === nStreets - 1 ? roundPot(reste - distribue) : roundStepPot(reste / nStreets);
    parStreet.push(Math.max(0, part));
    distribue = roundPot(distribue + Math.max(0, part));
  }

  const NOMS = ["Préflop", "Flop", "Turn"];
  const actions = [];
  const pousse = (position, actionType, amountBb, s) =>
    actions.push({ position, actionType, amountBb: roundPot(amountBb), street: s });
  for (const p of Object.keys(morts)) pousse(p, "FOLD", 0, "Préflop");
  pousse(vpos, "RAISE", preflop, "Préflop");
  pousse(hpos, "CALL", preflop, "Préflop");
  parStreet.forEach((m, i) => {
    if (!(m > 0)) return;
    const nom = NOMS[i + 1] || NOMS[NOMS.length - 1];
    pousse(vpos, "BET", m, nom);
    pousse(hpos, "CALL", m, nom);
  });

  const committed = { [hpos]: parJoueur, [vpos]: parJoueur, ...morts };
  return {
    pot, dead, parJoueur, committed, actions,
    parStreet, preflop,
    /* Contrôle interne : la somme des engagements EST le pot. */
    coherent: Math.abs(roundPot(Object.values(committed).reduce((a, v) => a + v, 0)) - pot) <= POT_EPSILON,
  };
}
