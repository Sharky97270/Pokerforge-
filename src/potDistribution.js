/* ══════════════════════════════════════════════════════════════════════════
   potDistribution.js — POT PRINCIPAL, SIDE POTS ET ATTRIBUTION

   POURQUOI CE MODULE EXISTE
   Le moteur de main complète savait rendre la mise non suivie et verser le pot,
   mais il ne le savait QUE pour deux joueurs de tapis quelconques. Dès qu'un
   troisième joueur est à tapis pour un montant différent, un seul pot ne suffit
   plus : un joueur à tapis pour 5bb ne peut pas remporter les 40bb que deux
   autres se sont disputés au-dessus de lui. Le Trainer bloquait donc ces
   configurations « par construction » — c'est-à-dire sans le dire.

   Ce module calcule la vérité, pour N joueurs :

     ① on empile les engagements par PALIERS (le plus petit d'abord) ;
     ② chaque palier forme un pot, disputé par ceux qui l'ont atteint ;
     ③ un joueur couché alimente les pots mais n'en dispute aucun ;
     ④ le dernier palier n'ayant qu'un contributeur n'est pas un pot :
        c'est une MISE NON SUIVIE, rendue à son propriétaire ;
     ⑤ à égalité, le pot se partage ; le jeton indivisible va au joueur
        désigné par `oddChipTo` (convention : le premier à parler postflop).

   La plus petite unité est le demi-blind : le Trainer ne manipule pas de
   fraction plus fine, et un partage doit rester représentable.

   Module PUR. Aucune dépendance.
   ══════════════════════════════════════════════════════════════════════════ */

export const CHIP_UNIT = 0.5;               // demi-blind : la plus petite unité
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const roundChip = v => Math.round(num(v) / CHIP_UNIT) * CHIP_UNIT;
const EPS = 1e-9;

/* ──────────────────────────────────────────────────────────────────────────
   buildPots — découpe les engagements en pot principal + side pots.

   contributions : { joueur: bb engagés sur TOUTE la main }
   folded        : liste des joueurs couchés (ils alimentent, ne disputent pas)

   Retour : { pots: [{ nom, montant, disputePar[] }], uncalled: {joueur,montant}|null,
              total, engage }
   ────────────────────────────────────────────────────────────────────────── */
export function buildPots(contributions = {}, folded = []) {
  const couches = new Set(folded);
  const joueurs = Object.keys(contributions).filter(j => num(contributions[j]) > EPS);
  const engage = roundChip(joueurs.reduce((a, j) => a + num(contributions[j]), 0));
  if (!joueurs.length) return { pots: [], uncalled: null, total: 0, engage: 0 };

  /* Le reste à répartir pour chaque joueur, dans l'ordre des paliers. */
  const reste = {};
  for (const j of joueurs) reste[j] = roundChip(contributions[j]);

  /* ── LA MISE NON SUIVIE SE DÉTACHE AVANT TOUT DÉCOUPAGE ──────────────────
     Si un joueur a engagé strictement plus que tout le monde, l'excédent n'a
     été suivi par personne : il ne fait partie d'aucun pot et lui revient.
     C'est la même règle que le remboursement heads-up, énoncée pour N. */
  let uncalled = null;
  const tries = [...joueurs].sort((a, b) => reste[b] - reste[a]);
  if (tries.length >= 2) {
    const excedent = roundChip(reste[tries[0]] - reste[tries[1]]);
    if (excedent > EPS) {
      uncalled = { joueur: tries[0], montant: excedent };
      reste[tries[0]] = roundChip(reste[tries[0]] - excedent);
    }
  } else if (tries.length === 1) {
    uncalled = { joueur: tries[0], montant: reste[tries[0]] };
    reste[tries[0]] = 0;
  }

  const pots = [];
  let restants = joueurs.filter(j => reste[j] > EPS);
  let indice = 0;
  while (restants.length) {
    const palier = Math.min(...restants.map(j => reste[j]));
    if (!(palier > EPS)) break;
    let montant = 0;
    /* ── QUI A ALIMENTÉ CE PALIER, ET DE COMBIEN ─────────────────────────────
       Sans cette trace, un pot que plus personne ne dispute était rendu à TOUS
       les joueurs de la main — y compris ceux qui n'avaient jamais atteint ce
       palier. Mesuré au balayage : 4bb crédités à trois joueurs qui n'avaient
       rien mis dans ce side pot. On rend à ceux qui ont payé, au prorata. */
    const alimentePar = {};
    for (const j of restants) {
      const part = Math.min(palier, reste[j]);
      if (part > EPS) alimentePar[j] = roundChip(part);
      reste[j] = roundChip(reste[j] - part);
      montant = roundChip(montant + part);
    }
    /* Ne disputent ce pot que ceux qui l'ont atteint ET qui sont encore en jeu. */
    const disputePar = restants.filter(j => !couches.has(j));
    if (montant > EPS) {
      pots.push({
        nom: indice === 0 ? "pot principal" : `side pot ${indice}`,
        montant, disputePar, alimentePar,
        /* Un pot que personne ne dispute ne peut pas exister au poker :
           quelqu'un a forcément gagné le coup. On le signale — et on rend son
           contenu à ses contributeurs plutôt que de l'égarer. */
        orphelin: disputePar.length === 0,
      });
      indice++;
    }
    restants = joueurs.filter(j => reste[j] > EPS);
  }
  const total = roundChip(pots.reduce((a, p) => a + p.montant, 0) + (uncalled ? uncalled.montant : 0));
  return { pots, uncalled, total, engage };
}

/* ──────────────────────────────────────────────────────────────────────────
   distributePots — attribue chaque pot à son ou ses vainqueurs.

   ranking : { joueur: force de main } — plus haut = meilleur. Un joueur absent
             du classement (couché) ne gagne rien.
   oddChipTo : joueur qui reçoit le demi-blind indivisible d'un partage.

   Retour : { payouts:{joueur:bb}, detail:[{pot, gagnants, parts}], total }
   ────────────────────────────────────────────────────────────────────────── */
export function distributePots({ contributions = {}, folded = [], ranking = {}, oddChipTo = null } = {}) {
  const { pots, uncalled, total, engage } = buildPots(contributions, folded);
  const payouts = {};
  const crediter = (j, v) => { if (!j) return; payouts[j] = roundChip((payouts[j] || 0) + v); };

  if (uncalled) crediter(uncalled.joueur, uncalled.montant);

  const detail = [];
  for (const pot of pots) {
    const candidats = pot.disputePar.filter(j => ranking[j] != null);
    if (!candidats.length) {
      /* ── UN POT SANS PRÉTENDANT SE REND, IL NE SE RÉPARTIT PAS AU HASARD ──
         Personne d'encore en jeu n'a atteint ce palier (configuration qui ne
         devrait pas se produire au poker). L'argent retourne EXACTEMENT à ceux
         qui l'ont mis, dans les proportions où ils l'ont mis. */
      const contributeurs = Object.keys(pot.alimentePar || {});
      const parts = {};
      if (contributeurs.length) {
        let cumul = 0;
        contributeurs.forEach((j, i) => {
          parts[j] = i === contributeurs.length - 1
            ? roundChip(pot.montant - cumul)
            : roundChip(pot.alimentePar[j]);
          cumul = roundChip(cumul + parts[j]);
        });
      }
      for (const j of contributeurs) crediter(j, parts[j]);
      detail.push({ pot: pot.nom, montant: pot.montant, gagnants: contributeurs, parts, rendu: true, sansPretendant: true });
      continue;
    }
    const meilleur = Math.max(...candidats.map(j => ranking[j]));
    const gagnants = candidats.filter(j => ranking[j] === meilleur);
    const parts = partager(pot.montant, gagnants, oddChipTo);
    for (const j of gagnants) crediter(j, parts[j]);
    detail.push({ pot: pot.nom, montant: pot.montant, gagnants, parts });
  }
  return { payouts, detail, pots, uncalled, total, engage };
}

/* Partage d'un montant entre N gagnants, au demi-blind près. Le ou les jetons
   indivisibles vont d'abord à `oddChipTo` s'il est parmi les gagnants, sinon au
   premier dans l'ordre donné — jamais perdus, jamais créés. */
export function partager(montant, gagnants, oddChipTo = null) {
  const out = {};
  const n = gagnants.length;
  if (!n) return out;
  const total = roundChip(montant);
  const unites = Math.round(total / CHIP_UNIT);
  const base = Math.floor(unites / n);
  let reste = unites - base * n;
  const ordre = [...gagnants].sort((a, b) => (a === oddChipTo ? -1 : b === oddChipTo ? 1 : 0));
  for (const j of ordre) {
    let u = base;
    if (reste > 0) { u += 1; reste -= 1; }
    out[j] = roundChip(u * CHIP_UNIT);
  }
  return out;
}

/* ── CONTRÔLE : RIEN NE SE PERD, RIEN NE SE CRÉE ───────────────────────────
   Somme des versements == somme des engagements. Rend la liste des écarts. */
export function auditDistribution(resultat) {
  const problems = [];
  if (!resultat) return problems;
  const verse = roundChip(Object.values(resultat.payouts || {}).reduce((a, v) => a + num(v), 0));
  if (Math.abs(verse - resultat.engage) > 0.011) {
    problems.push({ code: "distribution-non-conservee", engage: resultat.engage, verse });
  }
  for (const [j, v] of Object.entries(resultat.payouts || {})) {
    if (v < -0.011) problems.push({ code: "versement-negatif", joueur: j, montant: v });
  }
  /* Un pot sans prétendant n'est PAS une erreur de comptabilité — son contenu
     est rendu à ses contributeurs, la conservation tient. C'est le signe d'une
     entrée impossible au poker (un joueur couché qui a engagé plus que tous
     les joueurs encore debout). On l'expose à part, pour qu'un appelant puisse
     s'en alarmer sans confondre les deux natures de défaut. */
  return problems;
}

/* Signes d'une configuration impossible au poker, séparés des erreurs de
   comptabilité. Vide = entrée plausible. */
export function auditPlausibility(resultat) {
  const signaux = [];
  if (!resultat) return signaux;
  for (const p of resultat.pots || []) {
    if (p.orphelin) signaux.push({ code: "pot-sans-pretendant", pot: p.nom, montant: p.montant, rendu: Object.keys(p.alimentePar || {}) });
  }
  return signaux;
}

/* ── DOMAINE SUPPORTÉ, DIT EXPLICITEMENT ───────────────────────────────────
   `potDistributionSupport` répond à « cette configuration est-elle jouable
   jusqu'au bout ? » pour que l'appelant puisse l'AFFICHER au lieu de s'arrêter
   en silence.

   ⚠ CE QUI A CHANGÉ. Cette fonction refusait toute table de plus de deux
   joueurs : le module savait DÉCOUPER les paliers, mais le moteur de coup
   complet ne savait pas les JOUER, si bien qu'aucune main à trois n'atteignait
   jamais l'attribution. Le moteur est désormais écrit pour N joueurs (paliers
   de contribution suivis pendant les tours d'enchères, relance complète qui
   rouvre la parole à tous, all-in incomplet qui ne la rouvre pour personne).
   Le refus qui reste est celui d'une table qui n'en est pas une : il faut au
   moins deux joueurs pour disputer un pot.

   `TABLE_MAX` borne la table à la plus grande réellement proposée par le
   Trainer (9-max). Au-delà, la configuration ne vient pas du produit : on le
   dit plutôt que de la jouer en silence. */
export const TABLE_MAX = 9;
export function potDistributionSupport({ players = [], engine = "fullHand" } = {}) {
  const n = players.length;
  if (n < 2) {
    return {
      supported: false,
      reason: `${n} joueur${n > 1 ? "s" : ""} en jeu — il en faut au moins deux pour disputer un pot`,
      needsSidePots: false,
    };
  }
  if (engine === "fullHand" && n > TABLE_MAX) {
    return {
      supported: false,
      reason: `${n} joueurs encore en jeu — au-delà de ${TABLE_MAX} la table n'existe pas dans le Trainer`,
      needsSidePots: true,
    };
  }
  return { supported: true, reason: null, needsSidePots: n > 2 };
}
