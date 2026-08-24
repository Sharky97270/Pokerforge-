/* ══════════════════════════════════════════════════════════════════════════
   trainerSizing.js — LE MONTANT D'UNE ACTION (C4 · C5 · C6 · C7 · C8)

   POURQUOI CE MODULE EXISTE
   Trois calculateurs indépendants produisaient trois montants pour la même
   action : le libellé du bouton (`{l:"3-bet 9bb"}`), le sélecteur de tailles
   (`Math.round(pot*mult*10)/10`) et le moteur (qui relisait le TEXTE du
   libellé). Mesuré : un bouton « 4-bet 22bb » avec « 31.5 » au sélecteur et
   19.5bb réellement engagés ; un préréglage `3×` qui donnait 4.5bb pour un open
   parce qu'il multipliait le POT au lieu de la grosse blinde ; `MIN` à 0.75bb,
   sous la grosse blinde ; et cinq préréglages sur six capables de proposer
   109.5bb à un joueur qui en a 40.

   Ici, il n'y a qu'une grandeur : `raiseTo`, le TOTAL atteint sur la street.
   `additionalChips` s'en déduit (ce qui quitte réellement le tapis). Les deux
   sont bornés par le tapis et par le minimum légal AVANT d'être affichés, donc
   ce qui est montré est ce qui est jouable.

   Module PUR, testable sans navigateur.
   ══════════════════════════════════════════════════════════════════════════ */

export const BB = 1;                    // la grosse blinde est l'unité
export const TRAINER_BB_STEP = 0.5;     // pas officiel : le demi-blind
export const SIZING_EPSILON = 0.011;

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/* Arrondi UNIQUE : toute la chaîne (libellé, indice, exécution) passe par lui.
   C'est l'absence de cette unicité qui faisait annoncer « Bet ½ 3bb » pour une
   mise de 3.5bb (`|0` tronquait d'un côté, `roundBb` arrondissait de l'autre). */
export function roundStep(v, step = TRAINER_BB_STEP) {
  const s = step > 0 ? step : TRAINER_BB_STEP;
  return Math.round(num(v) / s) * s;
}
/* ── UN PLAFOND NE S'ARRONDIT PAS VERS LE HAUT ─────────────────────────────
   Une CAPACITÉ (ce qu'un joueur peut atteindre) passée par `roundStep` peut
   grandir d'un demi-blind : le ledger dit 66.9bb, le bouton propose « Tapis
   67bb ». Le joueur se voit alors offrir 0.1bb qu'il n'a pas.

   Mesuré : 1 écart `I3-mise-hors-tapis` sur 40 mains en 4T — rare, parce qu'il
   faut une capacité qui tombe juste au-dessus d'un demi-blind, mais faux à
   chaque fois. Les capacités sont donc TRONQUÉES au pas de mise ; seules les
   propositions (préréglages, minimum légal) restent arrondies. */
export function floorStep(v, step = TRAINER_BB_STEP) {
  const s = step > 0 ? step : TRAINER_BB_STEP;
  /* La division flottante peut rendre 133.99999… pour 67/0.5 : on recale sur
     la 6e décimale avant de tronquer, sinon on perd un pas entier. */
  return Math.floor(Math.round((num(v) / s) * 1e6) / 1e6) * s;
}
export const fmtBbNum = v => {
  const n = roundStep(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/* ──────────────────────────────────────────────────────────────────────────
   sizingContext — tout ce qu'il faut savoir pour chiffrer une action.

   `streetCommitted` est l'engagement de CHAQUE siège sur la street affichée :
   c'est de lui qu'on tire les paliers de mise, donc la relance minimale. Au
   préflop il contient les blindes, ce qui rend le calcul exact sans plomberie
   supplémentaire : {SB:0.5, BB:1, CO:2.5} ⇒ mise en cours 2.5, palier
   précédent 1, incrément 1.5, relance minimale « to 4 ».
   ────────────────────────────────────────────────────────────────────────── */
export function sizingContext({
  street = "Preflop", streetCommitted = {}, heroPos = null,
  heroRemaining = 0, potBefore = 0, minBet = BB, toCall = null,
  opponentCapacity = null,
} = {}) {
  const isPreflop = /^pre/i.test(String(street));
  const paliers = [...new Set(Object.values(streetCommitted || {}).map(v => roundStep(num(v))).filter(v => v > 0))]
    .sort((a, b) => b - a);
  const heroCommitted = roundStep(num(streetCommitted?.[heroPos] || 0));
  const facing = paliers.length ? paliers[0] : 0;
  const precedent = paliers.length > 1 ? paliers[1] : 0;
  const plancher = Math.max(minBet, TRAINER_BB_STEP);
  const increment = Math.max(roundStep(facing - precedent), plancher);
  const remaining = Math.max(0, floorStep(num(heroRemaining)));
  /* ── LE PLAFOND N'EST PAS QUE LE TAPIS D'HERO (C7) ───────────────────────
     Une relance que PERSONNE ne peut égaler n'est pas une taille jouable : le
     surplus reviendrait immédiatement à son propriétaire. Le plafond est donc
     le plus petit des deux : ce qu'Hero peut atteindre, et ce que l'adversaire
     le plus fourni peut couvrir sur cette street. Mesuré à l'audit : un 3-bet
     « to 8.5bb » proposé face à un adversaire qui ne pouvait atteindre que
     7.5bb. */
  const capaciteHero = floorStep(heroCommitted + remaining);
  const capaciteAdverse = opponentCapacity != null && num(opponentCapacity) > 0
    ? floorStep(num(opponentCapacity)) : null;
  const maxTo = capaciteAdverse != null ? Math.min(capaciteHero, capaciteAdverse) : capaciteHero;
  /* Rien à payer et rien devant : c'est une OUVERTURE. Au préflop la mise en
     cours est la grosse blinde, donc l'ouverture minimale vaut 2bb — jamais
     0.75bb, qui n'est pas une mise légale. */
  const minToRaw = facing > 0
    ? roundStep(facing + increment)
    : roundStep(heroCommitted + plancher);
  const minTo = Math.min(minToRaw, maxTo);
  const aPayer = toCall != null ? Math.max(0, roundStep(num(toCall))) : Math.max(0, roundStep(facing - heroCommitted));
  return {
    isPreflop, street,
    heroCommitted, heroRemaining: remaining,
    facing, previousLevel: precedent, increment,
    minBet: plancher,
    minTo, minToLegal: minToRaw, maxTo,
    capaciteHero, capaciteAdverse,
    /* Le tapis ne permet même pas une relance complète : la seule relance
       possible est le tapis, et elle doit être annoncée comme telle. */
    allInOnly: maxTo < minToRaw - SIZING_EPSILON,
    toCall: aPayer,
    potBefore: roundStep(num(potBefore)),
    isOpen: facing <= 0 || (isPreflop && facing <= BB + SIZING_EPSILON && heroCommitted < facing),
  };
}

/* Un total est-il jouable ? Rendu avec la raison, pas un simple booléen. */
export function clampRaiseTo(ctx, wanted) {
  const brut = roundStep(num(wanted));
  const borne = Math.min(Math.max(brut, ctx.minTo), ctx.maxTo);
  const allIn = borne >= ctx.maxTo - SIZING_EPSILON && ctx.maxTo > 0;
  return {
    raiseTo: borne,
    additionalChips: Math.max(0, roundStep(borne - ctx.heroCommitted)),
    allIn,
    borne: borne !== brut,
    raison: borne !== brut ? (brut > ctx.maxTo ? "plafonné au tapis" : "relevé au minimum légal") : null,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   PRÉRÉGLAGES — dépendants du contexte, jamais d'un multiple du pot déguisé.

   • Ouverture préflop : multiples de la GROSSE BLINDE (2.5× = 2.5bb).
   • Face à une relance préflop : multiples de la MISE ADVERSE, dit explicitement.
   • Postflop : fractions de pot, dites explicitement.
   Tous sont bornés au tapis ; celui qui l'atteint devient ALL-IN.
   ────────────────────────────────────────────────────────────────────────── */
export function sizingPresets(ctx) {
  const out = [];
  const push = (id, label, unite, wanted) => {
    const r = clampRaiseTo(ctx, wanted);
    out.push({
      id, label, unite,
      raiseTo: r.raiseTo, additionalChips: r.additionalChips,
      allIn: r.allIn, borne: r.borne, raison: r.raison,
    });
  };
  push("MIN", "MIN", "minimum légal", ctx.minTo);
  if (ctx.isPreflop && ctx.isOpen) {
    for (const m of [2.5, 3, 3.5, 4]) push(`X${m}`, `${m}×`, `${m}× BB`, m * BB);
  } else if (ctx.isPreflop) {
    for (const m of [2.5, 3, 3.5, 4]) push(`X${m}`, `${m}×`, `${m}× la mise adverse`, ctx.facing * m);
  } else {
    for (const f of [0.33, 0.5, 0.75, 1]) {
      push(`P${Math.round(f * 100)}`, `${Math.round(f * 100)}%`, `${Math.round(f * 100)}% du pot`,
        ctx.heroCommitted + Math.max(ctx.minBet, ctx.potBefore * f));
    }
  }
  /* ── « ALL-IN » DIT LEQUEL DES DEUX TAPIS ─────────────────────────────────
     Quand Hero couvre l'adversaire, la part non couverte lui reviendrait
     aussitôt : le tapis JOUABLE est celui de l'adversaire. Le préréglage vaut
     donc le tapis effectif, et son libellé le précise plutôt que de laisser
     croire que toute la profondeur part. */
  const plafonneParAdverse = ctx.capaciteAdverse != null && ctx.capaciteAdverse < ctx.capaciteHero - SIZING_EPSILON;
  push("ALLIN", "ALL-IN",
    plafonneParAdverse ? `tapis effectif — l'adversaire ne couvre que ${fmtBbNum(ctx.capaciteAdverse)}bb` : "tapis",
    ctx.maxTo);
  return out;
}

/* Un pas de −/+ borné : le bouton ne peut pas sortir du légal. */
export function stepRaiseTo(ctx, current, direction, step = TRAINER_BB_STEP) {
  return clampRaiseTo(ctx, roundStep(num(current) + direction * step));
}

/* ──────────────────────────────────────────────────────────────────────────
   FAMILLE D'UNE ACTION — ce qui décide si elle suit le sélecteur.
   ────────────────────────────────────────────────────────────────────────── */
const SIZED = new Set(["BET", "RAISE", "OPEN", "3BET", "4BET", "5BET", "ALLIN", "BET33", "BET50", "BET75", "BET100"]);
export function isSizedAction(actionId) {
  return SIZED.has(String(actionId || "").toUpperCase());
}

/* Taille par défaut d'une action, lue dans le spot (`a.s` ou le libellé). */
export function defaultAmountOf(action) {
  const brut = action?.amountBb ?? action?.amount;
  if (Number.isFinite(Number(brut)) && Number(brut) > 0) return roundStep(brut);
  for (const champ of [action?.s, action?.l, action?.label]) {
    const m = String(champ || "").replace(",", ".").match(/(-?\d+(?:\.\d+)?)\s*bb/i);
    if (m) return roundStep(parseFloat(m[1]));
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────
   resolveTrainerAction — LE point unique où une action devient un montant.

   Rend, pour une action du spot et une sélection de taille :
     raiseTo            total atteint sur la street (« Relancer à 12bb »)
     additionalChips    ce qui quitte réellement le tapis (« +8bb à ajouter »)
     label / sizingText ce qu'affiche le bouton — dérivé du MÊME nombre
     hint               l'indice, dérivé du montant réel (jamais de l'ID)
   ────────────────────────────────────────────────────────────────────────── */
export function resolveTrainerAction({ action = {}, ctx, selectedRaiseTo = null } = {}) {
  const id = String(action?.id || "").toUpperCase();
  const brutLabel = String(action?.l || action?.label || "");
  const famille = familyOf(id, brutLabel, ctx);

  if (famille === "FOLD") return simple("FOLD", "Fold", "abandon", "Ne pas jouer", action);
  if (famille === "CHECK") return simple("CHECK", "Check", "0bb", "Passer sans payer", action);
  if (famille === "CALL") {
    const aPayer = Math.min(ctx.toCall, ctx.heroRemaining);
    const allIn = aPayer >= ctx.heroRemaining - SIZING_EPSILON && ctx.heroRemaining > 0;
    const cote = ctx.potBefore + aPayer > 0 ? Math.round((aPayer / (ctx.potBefore + aPayer)) * 100) : null;
    return {
      id: "CALL", family: "CALL", sized: false,
      raiseTo: roundStep(ctx.heroCommitted + aPayer), additionalChips: aPayer, allIn,
      label: allIn ? `Call tapis ${fmtBbNum(aPayer)}bb` : `Call ${fmtBbNum(aPayer)}bb`,
      sizingText: `${fmtBbNum(aPayer)}bb`,
      hint: cote != null ? `à payer ${fmtBbNum(aPayer)}bb · cote ${cote}%` : "Suivre",
      rawLabel: brutLabel,
    };
  }

  /* ── Actions dimensionnées ────────────────────────────────────────────── */
  const defaut = defaultAmountOf(action);
  const souhaite = selectedRaiseTo != null ? selectedRaiseTo
    : (famille === "ALLIN" ? ctx.maxTo : (defaut != null ? defaut : ctx.minTo));
  const r = clampRaiseTo(ctx, souhaite);
  const allIn = r.allIn;
  const verbe = allIn ? "Tapis" : verbOf(famille, ctx);
  const label = `${verbe} ${fmtBbNum(r.raiseTo)}bb`;
  return {
    id: id || famille, family: allIn ? "ALLIN" : famille, sized: true,
    raiseTo: r.raiseTo, additionalChips: r.additionalChips, allIn,
    borne: r.borne, raison: r.raison,
    label, sizingText: `${fmtBbNum(r.raiseTo)}bb`,
    hint: actionHint({ ctx, family: famille, raiseTo: r.raiseTo, additional: r.additionalChips, allIn }),
    rawLabel: brutLabel,
  };
}

function simple(id, label, sizingText, hint, action) {
  return { id, family: id, sized: false, raiseTo: 0, additionalChips: 0, allIn: false, label, sizingText, hint, rawLabel: String(action?.l || action?.label || "") };
}

function familyOf(id, label, ctx) {
  const t = `${id} ${label}`.toUpperCase();
  if (id === "FOLD" || /\bFOLD\b/.test(t)) return "FOLD";
  if (id === "CHECK" || id === "CHECK_BACK" || /\bCHECK\b/.test(t)) return "CHECK";
  if (id === "CALL") return "CALL";
  if (id === "ALLIN" || /\b(ALL-?IN|SHOVE|PUSH|JAM|RESHOVE|TAPIS)\b/.test(t)) return "ALLIN";
  if (/5-?BET/.test(t)) return "5BET";
  if (/4-?BET/.test(t)) return "4BET";
  if (/3-?BET|SQUEEZE/.test(t)) return "3BET";
  if (id === "RAISE" || /\bRAISE\b/.test(t)) return ctx.isPreflop && ctx.isOpen ? "OPEN" : "RAISE";
  if (/\bOPEN\b|\bRFI\b|\bISO\b/.test(t)) return "OPEN";
  return ctx.facing > 0 && !ctx.isOpen ? "RAISE" : (ctx.isPreflop ? "OPEN" : "BET");
}

function verbOf(family, ctx) {
  if (family === "OPEN") return "Open";
  if (family === "3BET") return "3-Bet";
  if (family === "4BET") return "4-Bet";
  if (family === "5BET") return "5-Bet";
  if (family === "BET") return "Bet";
  return ctx.facing > 0 ? "Relancer à" : "Bet";
}

/* ── L'INDICE DÉCOULE DU MONTANT, PAS DE L'IDENTIFIANT (C6) ────────────────
   L'ancienne table associait « 33% pot » à l'ID `BET33` — y compris quand le
   générateur réutilisait cet ID pour un bouton libellé « Bet 50% ». Le libellé
   était juste, l'indice mentait. Ici il n'y a plus de table : l'indice est
   calculé à partir du montant réellement exécutable et du contexte. */
export function actionHint({ ctx, family, raiseTo, additional, allIn }) {
  if (allIn) return `tapis · ${fmtBbNum(additional)}bb à engager`;
  if (ctx.isPreflop && (family === "OPEN" || ctx.facing <= BB + SIZING_EPSILON)) {
    /* Un pourcentage de pot n'apprend rien sur une ouverture préflop : la
       référence du poker y est la grosse blinde. */
    return `${fmtBbNum(raiseTo / BB)}× BB`;
  }
  if (ctx.facing > 0) {
    /* Un RATIO n'est pas un montant : l'arrondir au demi-blind le fausse
       (8.5 / 2.5 = 3.4 s'affichait « 3.5× »). Une décimale, et le zéro
       inutile en moins. */
    const ratio = raiseTo / ctx.facing;
    const ratioTxt = Number.isFinite(ratio) ? String(Math.round(ratio * 10) / 10) : null;
    const bout = additional > 0 ? ` · +${fmtBbNum(additional)}bb à ajouter` : "";
    return `à ${fmtBbNum(raiseTo)}bb${ratioTxt ? ` (${ratioTxt}× la mise)` : ""}${bout}`;
  }
  const pct = ctx.potBefore > 0 ? Math.round((additional / ctx.potBefore) * 100) : null;
  return pct != null ? `${pct}% du pot` : `${fmtBbNum(additional)}bb`;
}

/* ── LE SÉLECTEUR A-T-IL UN SENS ICI ? (C4) ────────────────────────────────
   Un contrôle qui ne peut rien changer ne doit pas s'afficher. Deux cas :
   aucune action dimensionnable dans le spot, ou un tapis qui ne laisse qu'une
   seule valeur possible (minTo == maxTo). */
export function sizingSelectorVisible(ctx, actions = []) {
  const dimensionnables = (actions || []).filter(a => isSizedAction(a?.id) || /RAISE|BET|OPEN|SQUEEZE/i.test(String(a?.l || a?.id || "")));
  if (!dimensionnables.length) return false;
  if (ctx.maxTo - ctx.minTo < TRAINER_BB_STEP - SIZING_EPSILON) return false;
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   TAILLES DU VILAIN — CONTEXTUELLES, PLUS UNE FORMULE UNIQUE (C12)

   L'ancien sizing de 3-bet valait `Math.round(pot*2.8 + 1.5)`. Sur un pot de
   4bb après un open à 2.5bb, cela donnait un 3-bet à 13bb — soit 5,2× l'open,
   une taille qu'aucune table ne joue. La formule ignorait l'open, la position,
   le nombre de suiveurs et le tapis.

   Les règles ci-dessous sont celles du jeu réel, et chacune est testée :
     • 3-bet en position      ≈ 3× l'ouverture
     • 3-bet hors de position ≈ 4× l'ouverture (il faut refuser la cote)
     • squeeze                +1× l'ouverture par suiveur
     • iso-raise sur limpeurs 3× BB + 1× BB par limpeur (2.5× BB en position)
   Toutes sont bornées par le tapis effectif et arrondies au pas officiel.
   ══════════════════════════════════════════════════════════════════════════ */

export function villainThreeBetTo({ openTo = 0, isIP = false, callers = 0, effectiveStack = Infinity, alreadyCommitted = 0 } = {}) {
  const open = Math.max(BB, roundStep(num(openTo)));
  const mult = (isIP ? 3 : 4) + Math.max(0, num(callers));
  const souhaite = roundStep(open * mult);
  const dispo = Number.isFinite(effectiveStack) ? Number(effectiveStack) : Infinity;
  const plafond = Number.isFinite(dispo) ? roundStep(num(alreadyCommitted) + dispo) : Infinity;
  const to = Math.min(souhaite, Number.isFinite(plafond) ? plafond : souhaite);
  return {
    raiseTo: to,
    additionalChips: Math.max(0, roundStep(to - num(alreadyCommitted))),
    allIn: Number.isFinite(plafond) && to >= plafond - SIZING_EPSILON,
    ratio: open > 0 ? Math.round((to / open) * 10) / 10 : null,
    regle: `${mult}× l'ouverture (${isIP ? "en position" : "hors de position"}${callers > 0 ? `, ${callers} suiveur(s)` : ""})`,
  };
}

export function villainIsolateTo({ limpers = 1, isIP = false, effectiveStack = Infinity, alreadyCommitted = 0 } = {}) {
  const base = isIP ? 2.5 : 3;
  const souhaite = roundStep((base + Math.max(0, num(limpers) - 1)) * BB);
  const dispo = Number.isFinite(effectiveStack) ? Number(effectiveStack) : Infinity;
  const plafond = Number.isFinite(dispo) ? roundStep(num(alreadyCommitted) + dispo) : Infinity;
  const to = Math.min(souhaite, Number.isFinite(plafond) ? plafond : souhaite);
  return {
    raiseTo: to,
    additionalChips: Math.max(0, roundStep(to - num(alreadyCommitted))),
    allIn: Number.isFinite(plafond) && to >= plafond - SIZING_EPSILON,
    regle: `${base}× BB + 1× BB par limpeur supplémentaire`,
  };
}

/* Mise du vilain en fraction de pot, bornée au tapis. */
export function villainBetTo({ potBefore = 0, pct = 50, effectiveStack = Infinity, minBet = BB } = {}) {
  const souhaite = Math.max(minBet, roundStep(num(potBefore) * (num(pct) / 100)));
  const dispo = Number.isFinite(effectiveStack) ? roundStep(effectiveStack) : Infinity;
  const to = Math.min(souhaite, Number.isFinite(dispo) ? dispo : souhaite);
  return {
    raiseTo: to, additionalChips: to,
    allIn: Number.isFinite(dispo) && to >= dispo - SIZING_EPSILON,
    pct: num(potBefore) > 0 ? Math.round((to / num(potBefore)) * 100) : null,
  };
}

/* Famille d'une action, exposée pour que le rendu et le clavier lisent la même
   réponse (et non deux classifications parallèles). */
export function actionFamily(action, ctx) {
  return familyOf(String(action?.id || "").toUpperCase(), String(action?.l || action?.label || ""), ctx);
}

/* ── QUI SUIT LE SÉLECTEUR ? ───────────────────────────────────────────────
   Les relances : leur taille est un choix du joueur, c'est précisément ce que
   le sélecteur sert à exprimer. Les mises en fraction de pot (BET33/50/75/100)
   portent leur fraction dans leur identité — leur imposer la même valeur ferait
   quatre boutons identiques. ALL-IN vaut toujours le tapis, par définition. */
const SUIVENT_LE_SELECTEUR = new Set(["RAISE", "3BET", "4BET", "5BET", "OPEN"]);
export function followsSizingSelector(family) {
  return SUIVENT_LE_SELECTEUR.has(String(family || "").toUpperCase());
}
