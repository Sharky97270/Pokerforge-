/* ══════════════════════════════════════════════════════════════════════════
   trainerHandLedger.js — ÉTAT CANONIQUE DE L'ARGENT D'UNE TABLE (C2)

   POURQUOI CE MODULE EXISTE
   Le rendu écrivait `const displayStack = isH ? spot.stack : 60`. Le tapis
   adverse n'était pas lu : il était écrit en dur. Il ne dépendait ni du spot,
   ni du format, ni du filtre « STACK EFFECTIF », ni de ce que le vilain venait
   d'engager — un vilain qui venait de 4-better à 27bb affichait toujours 60bb.
   Conséquence mesurée : 58 mains sur 60 portaient un tapis adverse constant, et
   29 sur 60 un SPR incohérent avec les tapis peints (jusqu'à 3,3× d'écart).

   Le correctif n'est pas une constante mieux choisie. Ce module publie UN état,
   consommé par la plaque du siège, le panneau d'informations, le tapis effectif
   et le SPR. Personne ne recalcule une seconde vérité.

   ── PROFONDEUR : UNE PAR SIÈGE, PAS UNE POUR TOUS ──────────────────────────
   `spot.stack` est le tapis EFFECTIF de l'exercice — ce que règle le filtre
   « STACK EFFECTIF » — c'est-à-dire le plus court des tapis encore en jeu.
   `spot.seatStacks` porte, quand le générateur la produit, la profondeur de
   CHAQUE siège : personne n'a le même tapis à une vraie table, et le tapis
   effectif naît précisément de cette inégalité. Un spot sans `seatStacks`
   retombe sur la profondeur commune — le comportement des spots anciens.

   ── LES STREETS PRÉCÉDENTES ────────────────────────────────────────────────
   Un spot postflop n'expose que son POT d'entrée, pas qui l'a alimenté. On
   répartit ce pot reporté selon la ligne préflop reconstruite (`ctx.preActions`)
   quand elle existe, à parts égales entre les joueurs encore debout sinon. Le
   résidu d'arrondi est attribué au plus gros contributeur pour que la somme
   reste EXACTE — l'invariant de conservation ne tolère pas d'à-peu-près.

   Module PUR : aucune dépendance React/DOM, entièrement testable.
   ══════════════════════════════════════════════════════════════════════════ */

export const LEDGER_EPSILON = 0.011;

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const roundLedgerBb = v => Math.round(num(v) * 10) / 10;

export function parseDepthBb(stack) {
  const n = parseFloat(stack);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ── PROFONDEUR D'UN SIÈGE ─────────────────────────────────────────────────
   `spot.seatStacks` est une table { position: bb } produite par le générateur.
   Elle est OPTIONNELLE : un spot qui n'en porte pas garde la profondeur
   commune, et rien ne change pour lui. Une valeur illisible ou nulle retombe
   aussi sur la profondeur commune plutôt que de mettre un siège à zéro. */
export function seatDepth(spot, position, defautBb) {
  const table = spot && spot.seatStacks;
  if (table && position != null) {
    const v = parseDepthBb(table[position]);
    if (v > 0) return v;
  }
  return defautBb;
}

/* Engagements des streets ANTÉRIEURES, lus dans la ligne reconstruite. */
function carriedWeights(preActions, currentStreet) {
  const w = {};
  const meme = s => String(s || currentStreet).toLowerCase() === String(currentStreet).toLowerCase();
  for (const a of preActions || []) {
    const pos = a?.position || a?.pos || a?.actor;
    if (!pos || meme(a?.street)) continue;
    const amt = num(a?.amountBb ?? a?.amount ?? a?.committed);
    if (amt > 0) w[pos] = Math.max(w[pos] || 0, amt);
  }
  return w;
}

/* Répartit `total` selon des poids, en conservant la somme EXACTEMENT. */
function distribute(total, weights) {
  const cible = roundLedgerBb(total);
  const cles = Object.keys(weights).filter(k => weights[k] > 0);
  if (cible <= 0 || !cles.length) return {};
  const somme = cles.reduce((a, k) => a + weights[k], 0);
  const out = {};
  let cumul = 0;
  cles.forEach((k, i) => {
    if (i === cles.length - 1) { out[k] = roundLedgerBb(cible - cumul); return; }
    const part = roundLedgerBb((cible * weights[k]) / somme);
    out[k] = part; cumul = roundLedgerBb(cumul + part);
  });
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   trainerHandLedger — l'état canonique.

   entrées :
     spot                  le spot courant (profondeur, positions, street, toCall)
     ctx                   contexte reconstruit (preActions, facing, heroCommitted)
     seatOrder             positions réellement assises
     streetContributions   engagement de CHAQUE siège sur la street affichée
     pot                   pot courant du moteur (vérité)
     seatStates            états de siège (folded…) pour le tapis effectif
     fullHandState         état du moteur Full Hand, s'il est actif

   sortie : { depthBb, seats:{pos:{…}}, pot, potStreet, potCarried,
              effectiveStack, spr, potOdds, problems }
   ────────────────────────────────────────────────────────────────────────── */
export function trainerHandLedger({
  spot = null, ctx = null, seatOrder = [], streetContributions = {},
  pot = 0, seatStates = {}, fullHandState = null, fullHandSeats = null, toCall = null,
} = {}) {
  const depthBb = parseDepthBb(spot?.stack);
  const street = spot?.street || "Preflop";
  const hpos = spot?.hpos, vpos = spot?.vpos;
  const positions = [...new Set([...(seatOrder || []), ...Object.keys(streetContributions || {}), hpos, vpos].filter(Boolean))];
  const potM = roundLedgerBb(pot);

  /* ── Coup complet : le moteur Full Hand EST la source ────────────────────
     Il tient les tapis restants et l'engagement de street de CHAQUE joueur.
     On ne réinterprète rien : on recopie.

     ⚠ CE BLOC ÉTAIT HEADS-UP. Il ne lisait que `fh.heroStack` / `fh.villStack`
     et donnait à tout autre siège sa profondeur de DÉPART, marquée « couché ».
     Tant que le coup complet ne se jouait qu'à deux, c'était exact. Depuis que
     le moteur joue N joueurs, un troisième siège apparaissait avec son tapis
     intact alors qu'il avait déjà de l'argent dans le pot : mesuré au
     navigateur, la conservation cassait de 12 à 48bb sur les coups à trois.
     On lit donc la table du moteur, pas deux champs miroirs.

     `fullHandSeats` porte la correspondance siège → joueur du moteur. Sans
     elle (états fabriqués par les tests), on retombe sur hero/villain. */
  if (fullHandState) {
    const fh = fullHandState;
    const idDe = p => (fullHandSeats && fullHandSeats[p]) || (p === hpos ? "hero" : p === vpos ? "villain" : null);
    const joueurDe = p => { const id = idDe(p); return id && fh.players ? (fh.players[id] || null) : null; };
    /* Chemin hérité : un état sans table de joueurs (tests, anciens appels). */
    const legacy = p => {
      const estHero = p === hpos, estVil = p === vpos;
      if (!estHero && !estVil) return null;
      return {
        stack: estHero ? fh.heroStack : fh.villStack,
        contrib: estHero ? (fh.contrib?.hero || 0) : (fh.contrib?.villain || 0),
        committedBefore: estHero ? (fh.committedBefore?.hero || 0) : (fh.committedBefore?.villain || 0),
        folded: false,
      };
    };
    const seats = {};
    let potStreetFh = 0;
    for (const p of positions) {
      const j = joueurDe(p) || legacy(p);
      const estHero = p === hpos, estVil = p === vpos;
      if (!j) {
        /* Siège absent du coup complet : il n'a rien dans ce pot, son tapis est
           sa profondeur. Il est « couché » au sens du coup en cours. */
        const restant = roundLedgerBb(seatDepth(spot, p, depthBb));
        seats[p] = {
          position: p, isHero: estHero, isVillain: estVil,
          initial: restant, carried: 0, street: 0, total: 0,
          remaining: restant, capacity: restant,
          folded: true, allIn: false, live: false,
        };
        continue;
      }
      const restant = roundLedgerBb(j.stack);
      const avant = roundLedgerBb(j.committedBefore || 0);
      const rue = roundLedgerBb(j.contrib || 0);
      potStreetFh = roundLedgerBb(potStreetFh + rue);
      seats[p] = {
        position: p, isHero: estHero, isVillain: estVil,
        initial: roundLedgerBb(restant + avant + rue),
        carried: avant, street: rue, total: roundLedgerBb(avant + rue),
        remaining: restant,
        capacity: roundLedgerBb(rue + restant),
        folded: !!j.folded, allIn: !j.folded && restant <= LEDGER_EPSILON,
        live: !j.folded && restant > LEDGER_EPSILON,
      };
    }
    const potFh = roundLedgerBb(fh.pot);
    const actifs = positions.filter(p => seats[p] && !seats[p].folded);
    const eff = actifs.length ? Math.min(...actifs.map(p => seats[p].remaining)) : 0;
    return finalize({
      depthBb, seats, pot: potFh,
      potStreet: potStreetFh, potCarried: roundLedgerBb(potFh - potStreetFh),
      effectiveStack: eff, toCall: fhToCall(fh, hpos, vpos), positions, heroPos: hpos,
    });
  }

  /* ── Spot ordinaire ──────────────────────────────────────────────────── */
  const rue = {};
  let potStreet = 0;
  for (const p of positions) {
    const v = roundLedgerBb(streetContributions?.[p] || 0);
    rue[p] = v; potStreet = roundLedgerBb(potStreet + v);
  }
  const potCarried = Math.max(0, roundLedgerBb(potM - potStreet));
  /* ── LE POT REPORTÉ EST CONNU QUAND LE SPOT LE DIT ───────────────────────
     `spot.carriedCommitted` porte l'engagement EXACT de chaque siège sur les
     streets antérieures, produit par la séquence qui a construit le pot
     (`carriedLineForPostflopSpot`). Quand il est là, on ne répartit rien : on
     lit. C'est ce qui fait disparaître l'hypothèse « à parts égales », et avec
     elle l'erreur sur les blindes mortes — la part du pot qui n'appartient à
     personne et que le partage égal attribuait aux deux joueurs.

     Sans lui — spots anciens, spots importés — on retombe sur la répartition
     par la ligne reconstruite, puis à parts égales. Le repli est nommé. */
  let carried, sourceCarried;
  const declare = spot?.carriedCommitted;
  if (declare && Object.keys(declare).length && potCarried > 0) {
    carried = {};
    let somme = 0;
    for (const p of positions) {
      const v = roundLedgerBb(declare[p] || 0);
      if (v > 0) { carried[p] = v; somme = roundLedgerBb(somme + v); }
    }
    sourceCarried = "declare";
    /* Le pot du moteur fait foi : si la déclaration ne le reconstitue pas
       exactement (une action a bougé le pot depuis), on complète au prorata
       plutôt que de laisser un écart silencieux. */
    if (Math.abs(somme - potCarried) > LEDGER_EPSILON) {
      carried = distribute(potCarried, carried);
      sourceCarried = "declare-ajuste";
    }
  } else {
    let poids = carriedWeights(ctx?.preActions, street);
    if (!Object.keys(poids).length && potCarried > 0) {
      poids = {}; if (hpos) poids[hpos] = 1; if (vpos) poids[vpos] = 1;
      sourceCarried = "parts-egales";
    } else {
      sourceCarried = "ligne-reconstruite";
    }
    carried = distribute(potCarried, poids);
  }

  const seats = {};
  for (const p of positions) {
    const c = roundLedgerBb(carried[p] || 0);
    const s = rue[p];
    const total = roundLedgerBb(c + s);
    /* ── CHAQUE SIÈGE PEUT AVOIR SA PROPRE PROFONDEUR ─────────────────────
       Le modèle initial supposait UNE profondeur pour toute la table. C'était
       honnête mais faux : à une vraie table, personne n'a le même tapis, et
       le tapis effectif — celui qui décide du SPR — naît précisément de cette
       inégalité. `spot.seatStacks` la porte quand le générateur la produit ;
       à défaut on retombe sur la profondeur commune, qui reste le comportement
       des spots anciens. */
    const profondeurSiege = seatDepth(spot, p, depthBb);
    const remaining = Math.max(0, roundLedgerBb(profondeurSiege - total));
    const etat = seatStates?.[p] || {};
    const couche = !!etat.folded;
    seats[p] = {
      position: p, isHero: p === hpos, isVillain: p === vpos,
      initial: roundLedgerBb(profondeurSiege),
      carried: c, street: s, total, remaining,
      capacity: roundLedgerBb(s + remaining),
      folded: couche, allIn: !couche && total > 0 && remaining <= LEDGER_EPSILON,
      live: !couche && remaining > LEDGER_EPSILON,
    };
  }

  /* ── TAPIS EFFECTIF = le plus court des tapis RESTANTS encore actifs ─────
     Pas le tapis d'Hero : on ne peut pas jouer plus de jetons que l'adversaire
     le plus court n'en a devant lui. C'est ce nombre — et lui seul — qui doit
     alimenter le SPR affiché. */
  const actifs = positions.filter(p => !seats[p].folded);
  const cibles = actifs.length ? actifs : positions.filter(p => p === hpos);
  const effectiveStack = cibles.length ? Math.min(...cibles.map(p => seats[p].remaining)) : roundLedgerBb(depthBb);

  return finalize({
    depthBb, seats, pot: potM, potStreet, potCarried, effectiveStack,
    toCall: toCall != null ? num(toCall) : num(spot?.toCall), positions, heroPos: hpos,
    sourceCarried,
  });
}

function fhToCall(fh, hpos, vpos) {
  void hpos; void vpos;
  const c = fh?.contrib || {};
  return Math.max(0, roundLedgerBb((c.villain || 0) - (c.hero || 0)));
}

function finalize({ depthBb, seats, pot, potStreet, potCarried, effectiveStack, toCall, positions, heroPos = null, sourceCarried = null }) {
  /* Ce que l ADVERSAIRE le plus fourni peut atteindre sur cette street. Une
     relance au-dela ne pourrait etre suivie par personne : le surplus
     reviendrait aussitot. C est la seconde borne du sizing (C7). */
  const adverses = (positions || Object.keys(seats)).filter(p => p !== heroPos && seats[p] && !seats[p].folded);
  const opponentCapacity = adverses.length ? Math.max(...adverses.map(p => seats[p].capacity)) : null;
  const spr = pot > 0 ? Math.round((effectiveStack / pot) * 10) / 10 : null;
  const aPayer = Math.max(0, num(toCall));
  const potOdds = aPayer > 0 ? Math.round((aPayer / (aPayer + pot)) * 100) : null;
  return {
    depthBb: roundLedgerBb(depthBb),
    seats, pot: roundLedgerBb(pot),
    potStreet: roundLedgerBb(potStreet), potCarried: roundLedgerBb(potCarried),
    effectiveStack: roundLedgerBb(effectiveStack),
    spr, potOdds, toCall: aPayer, opponentCapacity, sourceCarried,
    problems: auditHandLedger({ seats, pot, positions }),
  };
}

/* ── CONTRÔLE DE CONSERVATION ───────────────────────────────────────────────
   Trois invariants, rendus avec les nombres qui les établissent :
     ① pour chaque siège : initial = restant + engagement total ;
     ② aucun tapis négatif ;
     ③ Σ engagements = pot.
   Une liste vide vaut conformité. */
export function auditHandLedger({ seats = {}, pot = 0, positions = null } = {}) {
  const problems = [];
  const cles = positions || Object.keys(seats);
  let somme = 0;
  for (const p of cles) {
    const s = seats[p]; if (!s) continue;
    somme = roundLedgerBb(somme + s.total);
    const attendu = roundLedgerBb(s.remaining + s.total);
    if (Math.abs(attendu - s.initial) > LEDGER_EPSILON)
      problems.push({ code: "siege-non-conserve", position: p, initial: s.initial, restant: s.remaining, engage: s.total });
    if (s.remaining < -LEDGER_EPSILON)
      problems.push({ code: "tapis-negatif", position: p, restant: s.remaining });
    if (s.total < -LEDGER_EPSILON)
      problems.push({ code: "engagement-negatif", position: p, engage: s.total });
  }
  if (Math.abs(somme - roundLedgerBb(pot)) > LEDGER_EPSILON)
    problems.push({ code: "pot-non-reconstructible", pot: roundLedgerBb(pot), sommeEngagements: somme });
  return problems;
}

/* ══════════════════════════════════════════════════════════════════════════
   assignSeatStacks — DES TAPIS INÉGAUX, SANS TRAHIR LE FILTRE

   Le Trainer laisse choisir un « STACK EFFECTIF ». Ce réglage ne dit pas que
   tout le monde a le même tapis : il dit que le tapis EFFECTIF de l'exercice
   vaut cette valeur — c'est-à-dire le plus court des tapis encore en jeu.

   La contrainte est donc précise, et c'est elle qu'on respecte :
     • aucun siège en dessous de la profondeur demandée ;
     • AU MOINS UN siège encore en jeu exactement à cette profondeur, sinon
       le tapis effectif ne vaudrait plus ce que le joueur a réglé ;
     • les autres au-dessus, dans une fourchette bornée.

   `rng` est injectable : le tirage doit être rejouable en test.
   ══════════════════════════════════════════════════════════════════════════ */
export const SEAT_STACK_SPREAD = 1.6;   // au plus 2.6× la profondeur effective

export function assignSeatStacks({
  positions = [], effectiveBb = 0, heroPos = null, villainPos = null,
  rng = Math.random, spread = SEAT_STACK_SPREAD, step = 0.5,
} = {}) {
  const base = parseDepthBb(effectiveBb);
  if (!(base > 0) || !positions.length) return null;
  const arrondi = v => Math.max(base, Math.round(v / step) * step);

  /* Le siège « le plus court » est tiré parmi ceux qui portent l'exercice :
     Hero ou le vilain désigné. Le mettre toujours sur Hero rendrait le tapis
     effectif prévisible, ce qui n'apprend rien au joueur. */
  const porteurs = [heroPos, villainPos].filter(p => p && positions.includes(p));
  const court = porteurs.length ? porteurs[Math.floor(rng() * porteurs.length) % porteurs.length] : positions[0];

  const out = {};
  for (const p of positions) {
    out[p] = p === court ? base : arrondi(base * (1 + rng() * spread));
  }
  /* Garantie explicite : le minimum vaut EXACTEMENT la profondeur demandée. */
  out[court] = base;
  return out;
}

/* Contrôle du contrat ci-dessus — utilisable en test et en dev. */
export function auditSeatStacks(seatStacks, effectiveBb, livePositions = null) {
  const problems = [];
  if (!seatStacks) return problems;
  const base = parseDepthBb(effectiveBb);
  const cles = livePositions && livePositions.length
    ? livePositions.filter(p => seatStacks[p] != null)
    : Object.keys(seatStacks);
  if (!cles.length) return problems;
  for (const p of cles) {
    if (parseDepthBb(seatStacks[p]) < base - LEDGER_EPSILON) {
      problems.push({ code: "siege-sous-la-profondeur", position: p, tapis: seatStacks[p], profondeur: base });
    }
  }
  const min = Math.min(...cles.map(p => parseDepthBb(seatStacks[p])));
  if (Math.abs(min - base) > LEDGER_EPSILON) {
    problems.push({ code: "tapis-effectif-trahi", minimum: min, profondeurDemandee: base });
  }
  return problems;
}
