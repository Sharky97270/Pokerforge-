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
