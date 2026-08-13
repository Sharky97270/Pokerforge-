/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : MOTIFS & LEAK ENGINE (§13/§14)

   Distinction NON NÉGOCIABLE :
     • OBSERVATION  — ce qui est vrai SUR CETTE MAIN (n = 1). Factuel.
     • LEAK RÉCURRENT — une fréquence agrégée sur PLUSIEURS mains, comparée
       à une référence, et publiée seulement au-delà d'un seuil d'échantillon.

   Une main ne prouve jamais un leak. Tant que l'échantillon est insuffisant,
   le pattern est conservé et affiché comme « tendance à confirmer », jamais
   comme un leak établi.

   Module PUR (aucune dépendance React/DOM) → testable en Node.
═══════════════════════════════════════════════════════════════ */

const rb = v => Math.round(v * 100) / 100;
const pct = (a, b) => (b > 0 ? rb(a / b) : null);

/* ── Catalogue des patterns (§14) ──
   `reference` = fréquence de référence PokerForge (repère pédagogique, pas une
   vérité GTO : la provenance affichée est HEURISTIC). `minSamples` = seuil en
   dessous duquel on n'annonce jamais un leak. */
export const LEAK_PATTERNS = {
  OVER_CALL_FLOP:      { label: "Call flop trop large",        reference: 0.51, minSamples: 30, higherIsWorse: true },
  OVER_FOLD_BB:        { label: "Overfold en BB",              reference: 0.55, minSamples: 40, higherIsWorse: true },
  UNDER_BLUFF_RIVER:   { label: "Sous-bluff river",            reference: 0.28, minSamples: 25, higherIsWorse: false },
  OVER_BLUFF_RIVER:    { label: "Sur-bluff river",             reference: 0.28, minSamples: 25, higherIsWorse: true },
  LOW_3BET:            { label: "3-bet insuffisant",           reference: 0.08, minSamples: 60, higherIsWorse: false },
  OVER_CBET:           { label: "C-bet trop fréquent",         reference: 0.58, minSamples: 30, higherIsWorse: true },
  UNDER_CBET:          { label: "C-bet insuffisant",           reference: 0.58, minSamples: 30, higherIsWorse: false },
  SIZING_INCONSISTENT: { label: "Sizing incohérent",           reference: 0.15, minSamples: 25, higherIsWorse: true },
  OVER_FOLD_TO_3BET:   { label: "Fold to 3-bet excessif",      reference: 0.55, minSamples: 30, higherIsWorse: true },
  WEAK_BB_DEFENSE:     { label: "Défense BB trop faible",      reference: 0.40, minSamples: 40, higherIsWorse: false },
  HERO_CALL_EXCESS:    { label: "Hero call excessif",          reference: 0.12, minSamples: 30, higherIsWorse: true },
};

export const SEVERITY = { LOW: "low", MEDIUM: "medium", HIGH: "high" };

/* ── Compteurs bruts d'UNE main ──
   Chaque compteur est un couple { hits, opps } : on n'agrège que ce qui a eu
   une OPPORTUNITÉ réelle de se produire. */
export function countHandPatterns(hand, snaps, decisions = []) {
  const c = {};
  const bump = (k, hit, opp = 1) => {
    c[k] = c[k] || { hits: 0, opps: 0 };
    c[k].opps += opp;
    c[k].hits += hit ? 1 : 0;
  };
  if (!hand || !Array.isArray(hand.events)) return c;

  const heroId = hand.heroId;
  const hero = (hand.players || []).find(p => p.isHero);
  const heroPos = hero?.pos || null;
  const ev = hand.events;
  const heroEvents = ev.filter(e => e.playerId === heroId);
  const isAgg = t => t === "bet" || t === "raise" || t === "allin";

  // Préflop : 3-bet / fold to 3-bet / défense BB
  const pfHeroActs = heroEvents.filter(e => e.street === "preflop" && ["fold", "call", "raise", "allin", "check"].includes(e.type));
  const openBeforeHero = i => ev.slice(0, i).some(e => e.street === "preflop" && e.playerId !== heroId && ["raise", "allin"].includes(e.type));
  pfHeroActs.forEach(a => {
    const i = ev.indexOf(a);
    const facingOpen = openBeforeHero(i);
    if (facingOpen) {
      bump("LOW_3BET", a.type === "raise" || a.type === "allin");
      if (heroPos === "BB") bump("WEAK_BB_DEFENSE", a.type !== "fold");
      const raisesBefore = ev.slice(0, i).filter(e => e.street === "preflop" && ["raise", "allin"].includes(e.type)).length;
      const heroRaisedBefore = ev.slice(0, i).some(e => e.street === "preflop" && e.playerId === heroId && ["raise", "allin"].includes(e.type));
      if (heroRaisedBefore && raisesBefore >= 2) bump("OVER_FOLD_TO_3BET", a.type === "fold");
    }
  });

  // Postflop : call flop, c-bet, bluff river, hero call.
  // On examine CHAQUE action Hero de la street, pas seulement la première :
  // un check-call compte comme un call face à une mise, ce qu'un test sur la
  // seule première action manquerait complètement.
  const heroAggPreflop = ev.some(e => e.street === "preflop" && e.playerId === heroId && ["raise", "allin"].includes(e.type));
  for (const street of ["flop", "turn", "river"]) {
    const onStreet = ev.map((e, i) => ({ e, i })).filter(x => x.e.street === street);
    let prevHero = -1, firstHeroDone = false;
    for (const { e, i } of onStreet) {
      if (e.playerId !== heroId) continue;
      if (!["fold", "check", "call", "bet", "raise", "allin"].includes(e.type)) continue;
      // Confronté à une mise = agression adverse depuis la dernière action de Hero.
      const facingBet = onStreet.some(x => x.i < i && x.i > prevHero && x.e.playerId !== heroId && isAgg(x.e.type));
      if (street === "flop") {
        if (facingBet) {
          bump("OVER_CALL_FLOP", e.type === "call");
          if (heroPos === "BB") bump("OVER_FOLD_BB", e.type === "fold");
        } else if (!firstHeroDone && heroAggPreflop) {
          bump("OVER_CBET", isAgg(e.type));
          bump("UNDER_CBET", isAgg(e.type));
        }
      }
      if (street === "river") {
        if (facingBet) bump("HERO_CALL_EXCESS", e.type === "call");
        else if (!firstHeroDone) {
          // Bluff river = mise river qui n'est jamais allée à l'abattage.
          const wentToShowdown = !!hand.showdown?.shownHoles?.[heroId];
          bump("OVER_BLUFF_RIVER", isAgg(e.type) && !wentToShowdown);
          bump("UNDER_BLUFF_RIVER", isAgg(e.type) && !wentToShowdown);
        }
      }
      firstHeroDone = true;
      prevHero = i;
    }
  }

  // Sizing incohérent : mises Hero très éloignées des tailles usuelles du pot.
  if (Array.isArray(snaps)) {
    heroEvents.filter(e => isAgg(e.type) && e.street !== "preflop").forEach(e => {
      const idx = ev.indexOf(e);
      const pot = snaps[idx]?.potTotal || 0;
      if (pot <= 0 || !e.amount) return;
      const frac = e.amount / pot;
      bump("SIZING_INCONSISTENT", frac > 1.6 || frac < 0.18);
    });
  }
  return c;
}

/**
 * OBSERVATIONS de cette main (§13) — factuel, jamais présenté comme un leak.
 * Les décisions du package solveur enrichissent l'observation quand elles
 * existent (une décision notée n'est plus une simple description de ligne).
 */
export function handObservations(hand, snaps, decisions = []) {
  const out = [];
  const counts = countHandPatterns(hand, snaps, decisions);
  const push = (type, tone, text) => out.push({ type, tone, text, scope: "hand" });

  for (const [key, v] of Object.entries(counts)) {
    if (!v.opps) continue;
    const meta = LEAK_PATTERNS[key];
    if (!meta) continue;
    const hit = v.hits > 0;
    switch (key) {
      case "OVER_CALL_FLOP": if (hit) push(key, "warn", "Call flop — vérifie ton équité face à la range de c-bet."); break;
      case "OVER_CBET": if (hit) push(key, "ok", "C-bet flop en tant qu'agresseur préflop — ligne cohérente."); break;
      case "UNDER_CBET": if (!hit) push(key, "warn", "Pas de c-bet flop alors que tu es l'agresseur préflop."); break;
      case "LOW_3BET": if (!hit) push(key, "warn", "Face à l'open : pas de 3-bet — fréquence à surveiller."); break;
      case "WEAK_BB_DEFENSE": if (!hit) push(key, "warn", "Fold en BB face à l'open — défense sous la MDF ?"); break;
      case "OVER_FOLD_TO_3BET": if (hit) push(key, "warn", "Fold face au 3-bet après avoir ouvert."); break;
      case "HERO_CALL_EXCESS": if (hit) push(key, "warn", "Bluff-catch river — assure-toi que ton combo bat des bluffs."); break;
      case "OVER_BLUFF_RIVER": if (hit) push(key, "ok", "Bluff river assumé — cohérent si ta range de value existe."); break;
      case "SIZING_INCONSISTENT": if (hit) push(key, "warn", "Sizing atypique par rapport au pot sur au moins une street."); break;
      default: break;
    }
  }

  // Observations issues des décisions évaluées (source : solveur/heuristique).
  // Les deux formes coexistent : `evLossBB` (package solveur) et `evLoss`
  // (decisionAnalysis brut) — on accepte l'une ou l'autre.
  const graded = decisions
    .map(d => ({ ...d, evLossBB: typeof d.evLossBB === "number" ? d.evLossBB : d.evLoss }))
    .filter(d => typeof d.evLossBB === "number");
  const clean = graded.filter(d => d.evLossBB <= 0.1);
  if (graded.length && clean.length === graded.length)
    push("CLEAN_LINE", "ok", `Ligne propre : ${graded.length} décision${graded.length > 1 ? "s" : ""} évaluée${graded.length > 1 ? "s" : ""} sans perte d'EV significative.`);
  const worst = graded.slice().sort((a, b) => b.evLossBB - a.evLossBB)[0];
  if (worst && worst.evLossBB > 0.4)
    push("EV_LEAK", "warn", `${worst.street} : ${worst.playedLabel || worst.played} coûte ≈ ${rb(worst.evLossBB)}bb selon la référence.`);

  return out;
}

/* ── Agrégat multi-mains (§14) ── */
const STORE_KEY = "pf_rep_leaks";

export function emptyAggregate() { return { hands: 0, counters: {}, updatedAt: null }; }

/** Ajoute les compteurs d'une main à un agrégat (fonction pure). */
export function accumulate(aggregate, counts, handKey) {
  const agg = aggregate && typeof aggregate === "object" ? { ...aggregate } : emptyAggregate();
  agg.counters = { ...(agg.counters || {}) };
  agg.seen = { ...(agg.seen || {}) };
  if (handKey) {
    if (agg.seen[handKey]) return agg;          // idempotent : une main compte une fois
    agg.seen[handKey] = 1;
  }
  agg.hands = (agg.hands || 0) + 1;
  for (const [k, v] of Object.entries(counts || {})) {
    const cur = agg.counters[k] || { hits: 0, opps: 0 };
    agg.counters[k] = { hits: cur.hits + (v.hits || 0), opps: cur.opps + (v.opps || 0) };
  }
  agg.updatedAt = Date.now();
  return agg;
}

function severityOf(delta, ref) {
  const rel = ref > 0 ? Math.abs(delta) / ref : Math.abs(delta);
  if (rel >= 0.5) return SEVERITY.HIGH;
  if (rel >= 0.25) return SEVERITY.MEDIUM;
  return SEVERITY.LOW;
}

/**
 * Leaks RÉCURRENTS publiables (§14).
 * @returns [{ type, label, samples, observed, reference, delta, severity, confidence, established }]
 *   `established:false` = tendance à confirmer (échantillon sous le seuil) —
 *   l'UI doit alors interdire tout vocabulaire affirmatif.
 */
export function detectLeaks(aggregate, opts = {}) {
  const out = [];
  const counters = aggregate?.counters || {};
  for (const [type, v] of Object.entries(counters)) {
    const meta = LEAK_PATTERNS[type];
    if (!meta || !v.opps) continue;
    const observed = pct(v.hits, v.opps);
    if (observed == null) continue;
    const delta = rb(observed - meta.reference);
    const bad = meta.higherIsWorse ? delta > 0.05 : delta < -0.05;
    if (!bad) continue;
    const established = v.opps >= (opts.minSamples || meta.minSamples);
    out.push({
      type, label: meta.label,
      samples: v.opps, hits: v.hits,
      observed, reference: meta.reference, delta,
      severity: established ? severityOf(delta, meta.reference) : SEVERITY.LOW,
      confidence: established ? (v.opps >= meta.minSamples * 2 ? "high" : "medium") : "low",
      established,
      source: "HEURISTIC",
    });
  }
  return out.sort((a, b) => (b.established - a.established) || (Math.abs(b.delta) - Math.abs(a.delta)));
}

/* ── Persistance locale (aucune donnée envoyée sans action utilisateur) ── */
export function loadAggregate() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || emptyAggregate(); }
  catch { return emptyAggregate(); }
}
export function saveAggregate(agg) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(agg)); } catch { /* quota */ }
}
export function recordHand(hand, snaps, decisions = []) {
  const counts = countHandPatterns(hand, snaps, decisions);
  const key = String(hand?.handId || hand?.id || "");
  const agg = accumulate(loadAggregate(), counts, key);
  saveAggregate(agg);
  return agg;
}
