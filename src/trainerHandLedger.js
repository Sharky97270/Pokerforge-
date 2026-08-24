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

   ── CONVENTION DE PROFONDEUR, ÉCRITE PARCE QU'ELLE EST UNE HYPOTHÈSE ───────
   Un spot du Trainer ne porte qu'UN tapis : `spot.stack`, le tapis effectif de
   l'exercice (c'est ce que règle le filtre « STACK EFFECTIF »). Tous les sièges
   démarrent donc à cette profondeur, puis sont débités de ce qu'ils ont engagé.
   Ce n'est pas une constante d'affichage : la valeur descend du spot, elle suit
   le filtre, le format et la profondeur demandée.

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
  pot = 0, seatStates = {}, fullHandState = null, toCall = null,
} = {}) {
  const depthBb = parseDepthBb(spot?.stack);
  const street = spot?.street || "Preflop";
  const hpos = spot?.hpos, vpos = spot?.vpos;
  const positions = [...new Set([...(seatOrder || []), ...Object.keys(streetContributions || {}), hpos, vpos].filter(Boolean))];
  const potM = roundLedgerBb(pot);

  /* ── Coup complet : le moteur Full Hand EST la source ────────────────────
     Il tient les tapis restants et l'engagement de street des deux joueurs.
     On ne réinterprète rien : on recopie. */
  if (fullHandState) {
    const fh = fullHandState;
    const seats = {};
    const streetOf = p => p === hpos ? roundLedgerBb(fh.contrib?.hero || 0)
      : p === vpos ? roundLedgerBb(fh.contrib?.villain || 0) : 0;
    for (const p of positions) {
      const estHero = p === hpos, estVil = p === vpos;
      const dansLeCoup = estHero || estVil;
      const restant = estHero ? roundLedgerBb(fh.heroStack) : estVil ? roundLedgerBb(fh.villStack) : roundLedgerBb(depthBb);
      const avant = estHero ? roundLedgerBb(fh.committedBefore?.hero || 0) : estVil ? roundLedgerBb(fh.committedBefore?.villain || 0) : 0;
      const rue = streetOf(p);
      seats[p] = {
        position: p, isHero: estHero, isVillain: estVil,
        initial: roundLedgerBb(restant + avant + rue),
        carried: avant, street: rue, total: roundLedgerBb(avant + rue),
        remaining: restant,
        capacity: roundLedgerBb(rue + restant),
        folded: !dansLeCoup, allIn: dansLeCoup && restant <= LEDGER_EPSILON,
        live: dansLeCoup && restant > LEDGER_EPSILON,
      };
    }
    const potFh = roundLedgerBb(fh.pot);
    const actifs = positions.filter(p => seats[p] && !seats[p].folded);
    const eff = actifs.length ? Math.min(...actifs.map(p => seats[p].remaining)) : 0;
    return finalize({ depthBb, seats, pot: potFh, potStreet: roundLedgerBb((fh.contrib?.hero || 0) + (fh.contrib?.villain || 0)), potCarried: roundLedgerBb(potFh - ((fh.contrib?.hero || 0) + (fh.contrib?.villain || 0))), effectiveStack: eff, toCall: fhToCall(fh, hpos, vpos), positions, heroPos: hpos });
  }

  /* ── Spot ordinaire ──────────────────────────────────────────────────── */
  const rue = {};
  let potStreet = 0;
  for (const p of positions) {
    const v = roundLedgerBb(streetContributions?.[p] || 0);
    rue[p] = v; potStreet = roundLedgerBb(potStreet + v);
  }
  const potCarried = Math.max(0, roundLedgerBb(potM - potStreet));
  let poids = carriedWeights(ctx?.preActions, street);
  if (!Object.keys(poids).length && potCarried > 0) {
    /* Sans ligne exploitable, le pot reporté est celui d'un coup heads-up qui
       n'a pu arriver là que parce que la dernière mise a été suivie. */
    poids = {}; if (hpos) poids[hpos] = 1; if (vpos) poids[vpos] = 1;
  }
  const carried = distribute(potCarried, poids);

  const seats = {};
  for (const p of positions) {
    const c = roundLedgerBb(carried[p] || 0);
    const s = rue[p];
    const total = roundLedgerBb(c + s);
    const remaining = Math.max(0, roundLedgerBb(depthBb - total));
    const etat = seatStates?.[p] || {};
    const couche = !!etat.folded;
    seats[p] = {
      position: p, isHero: p === hpos, isVillain: p === vpos,
      initial: roundLedgerBb(depthBb),
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
  });
}

function fhToCall(fh, hpos, vpos) {
  void hpos; void vpos;
  const c = fh?.contrib || {};
  return Math.max(0, roundLedgerBb((c.villain || 0) - (c.hero || 0)));
}

function finalize({ depthBb, seats, pot, potStreet, potCarried, effectiveStack, toCall, positions, heroPos = null }) {
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
    spr, potOdds, toCall: aPayer, opponentCapacity,
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
