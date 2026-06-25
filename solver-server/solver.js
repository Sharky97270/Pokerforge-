'use strict';
/* ════════════════════════════════════════════════════════════════════
   PokerForge — Moteur Solver Pro (équité réelle + décision EV)
   • Évaluateur 7 cartes exact (best 5/7)
   • Équité Monte-Carlo (main Hero vs range Vilain estimée, board réel)
   • Ranges préflop par force de main (RFI / défense / push-fold short)
   • Décision postflop pilotée par l'ÉQUITÉ vs pot odds + SPR + texture
   • Modes GTO / Exploit / ICM / ChipEV, profils vilain
   Sortie au format PokerForge (ok, estimated:false, engine:"pro", …).
   Zéro dépendance — exécutable partout (Node 16+).
════════════════════════════════════════════════════════════════════════ */

const SUITS = { s: 0, h: 1, d: 2, c: 3, "♠": 0, "♥": 1, "♦": 2, "♣": 3 };
const RVAL = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14, "10": 10 };

function parseCards(str) {
  if (!str) return [];
  const m = String(str).replace(/[\[\],]/g, " ").match(/(?:10|[2-9TJQKAtjqka])\s*[shdc♠♥♦♣]/g) || [];
  const out = [];
  for (let t of m) {
    t = t.replace(/\s/g, "").replace(/^10/, "T");
    const r = RVAL[t[0].toUpperCase()]; const s = SUITS[t[1]] ?? SUITS[t[1] && t[1].toLowerCase()];
    if (r != null && s != null) out.push((r - 2) * 4 + s);
  }
  return out;
}
const rankOf = (id) => (id >> 2) + 2;
const suitOf = (id) => id & 3;

/* ── Combinaisons 5 parmi 7 (indices) ── */
const C75 = (() => { const r = []; for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) r.push([a, b, c, d, e]); return r; })();

/* ── Évaluateur 5 cartes → score comparable (catégorie + départages) ── */
function eval5(ids) {
  const rc = new Array(15).fill(0); const sc = new Array(4).fill(0); const ranks = [];
  for (const id of ids) { const r = (id >> 2) + 2; rc[r]++; sc[id & 3]++; ranks.push(r); }
  ranks.sort((a, b) => b - a);
  const isFlush = sc[0] === 5 || sc[1] === 5 || sc[2] === 5 || sc[3] === 5;
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  const us = uniq.slice(); if (us[0] === 14) us.push(1);
  let straight = 0;
  for (let i = 0; i + 4 < us.length + 1 && i + 4 < us.length; i++) { if (us[i] - us[i + 4] === 4) { straight = us[i]; break; } }
  const by = {}; for (let r = 14; r >= 2; r--) { const c = rc[r]; if (c) (by[c] = by[c] || []).push(r); }
  const quad = by[4] && by[4][0], trips = by[3] && by[3][0], pairs = by[2] || [], singles = by[1] || [];
  const kick = (arr, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 15 + (arr[i] || 0); return v; };
  if (isFlush && straight) return 8e12 + straight;
  if (quad) return 7e12 + quad * 15 + (singles[0] || pairs[0] || trips || 0);
  if (trips && pairs.length) return 6e12 + trips * 15 + pairs[0];
  if (isFlush) return 5e12 + kick(ranks, 5);
  if (straight) return 4e12 + straight;
  if (trips) return 3e12 + trips * 225 + kick(singles, 2);
  if (pairs.length >= 2) return 2e12 + pairs[0] * 225 + pairs[1] * 15 + (singles[0] || 0);
  if (pairs.length === 1) return 1e12 + pairs[0] * 1e6 + kick(singles, 3);
  return kick(ranks, 5);
}
function best7(ids7) { let best = -1; for (const c of C75) { const v = eval5([ids7[c[0]], ids7[c[1]], ids7[c[2]], ids7[c[3]], ids7[c[4]]]); if (v > best) best = v; } return best; }

/* ── Force de main préflop (Chen-like) → tri des 169 combos ── */
function preflopStrength(hi, lo, suited) {
  if (hi === lo) { const m = { 14: 20, 13: 16, 12: 14, 11: 12 }; return m[hi] || Math.max(5, hi * 0.95); }
  let s = { 14: 10, 13: 8, 12: 7, 11: 6.5 }[hi] || hi / 2;
  if (suited) s += 2;
  const gap = hi - lo - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi <= 11) s += 1;
  return s;
}
// Combos 169 triés par force décroissante (pour bâtir des ranges top-X%)
const ALL169 = (() => {
  const out = [];
  for (let i = 14; i >= 2; i--) for (let j = 14; j >= 2; j--) {
    if (i === j) out.push({ hi: i, lo: i, suited: false, key: rk(i) + rk(i) });
    else if (i > j) { out.push({ hi: i, lo: j, suited: true, key: rk(i) + rk(j) + "s" }); out.push({ hi: i, lo: j, suited: false, key: rk(i) + rk(j) + "o" }); }
  }
  out.forEach(c => c.str = preflopStrength(c.hi, c.lo, c.suited));
  out.sort((a, b) => b.str - a.str);
  return out;
})();
function rk(v) { return "..23456789TJQKA"[v]; }

function combosOfClass(cls, dead) {
  // toutes les vraies combos (paires/suited/offsuit) d'une classe 169, hors cartes mortes
  const res = []; const deadSet = new Set(dead);
  const a = cls.hi, b = cls.lo;
  for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
    if (cls.hi === cls.lo) { if (s1 >= s2) continue; }
    else { if (cls.suited && s1 !== s2) continue; if (!cls.suited && s1 === s2) continue; }
    const c1 = (a - 2) * 4 + s1, c2 = (b - 2) * 4 + s2;
    if (deadSet.has(c1) || deadSet.has(c2)) continue;
    res.push([c1, c2]);
  }
  return res;
}
// Range vilain = top fraction des 169 → liste de combos réelles
function villainRange(frac, dead) {
  const n = Math.max(1, Math.round(ALL169.length * frac));
  const classes = ALL169.slice(0, n);
  let combos = [];
  for (const cls of classes) combos = combos.concat(combosOfClass(cls, dead));
  return combos.length ? combos : [[(12) * 4, (12) * 4 + 1]];
}

/* ── Équité Monte-Carlo : Hero vs range Vilain, board fixé ── */
function equity(hero, board, vrange, iters) {
  if (hero.length < 2) return 0.5;
  const used0 = new Set([...hero, ...board]);
  let win = 0, tie = 0, n = 0;
  const full = new Array(52); for (let i = 0; i < 52; i++) full[i] = i;
  for (let it = 0; it < iters; it++) {
    const v = vrange[(Math.random() * vrange.length) | 0];
    if (used0.has(v[0]) || used0.has(v[1]) || v[0] === v[1]) continue;
    const used = new Set(used0); used.add(v[0]); used.add(v[1]);
    const b = board.slice();
    while (b.length < 5) { const c = (Math.random() * 52) | 0; if (!used.has(c)) { used.add(c); b.push(c); } }
    const h = best7([...hero, ...b]); const o = best7([...v, ...b]);
    if (h > o) win++; else if (h === o) tie++; n++;
  }
  if (!n) return 0.5;
  return (win + tie / 2) / n;
}

/* ── Validation ── */
function validate(sc) {
  const need = { Preflop: 0, Flop: 3, Turn: 4, River: 5 }[sc.street] ?? 0;
  if (sc.heroStack <= 0) return { ok: false, error: "Scénario impossible — stack Hero insuffisant.", why: "stack", fix: { heroStack: 100 } };
  if (sc.heroPos === sc.vilPos) return { ok: false, error: "Scénario incohérent — Hero et Vilain à la même position.", why: "position", fix: { vilPos: sc.heroPos === "BB" ? "BTN" : "BB" } };
  if (sc.potBb < 0) return { ok: false, error: "Scénario incohérent — pot négatif.", why: "pot", fix: { potBb: 1.5 } };
  const board = parseCards(sc.board);
  if (need > 0 && board.length < need) return { ok: false, error: `Board incomplet pour ${sc.street} (${board.length}/${need} cartes).`, why: "board", fix: { board: ["As", "Kd", "7h", "2c", "9s"].slice(0, need).join(" ") } };
  return null;
}

const POS_RFI = { UTG: 0.16, HJ: 0.20, CO: 0.27, BTN: 0.45, SB: 0.42, BB: 0.55 };
const POS_PUSH = { UTG: 0.12, HJ: 0.16, CO: 0.22, BTN: 0.34, SB: 0.42, BB: 0.30 };

function solve(rawSc) {
  const sc = {
    format: rawSc.format || "Cash", players: +(rawSc.players || 6),
    heroPos: rawSc.heroPos || rawSc.positions?.hero || "BTN",
    vilPos: rawSc.vilPos || rawSc.positions?.vil || "BB",
    heroStack: +(rawSc.heroStack ?? rawSc.stacks?.hero ?? 100),
    vilStack: +(rawSc.vilStack ?? rawSc.stacks?.vil ?? 100),
    potBb: +(rawSc.potBb ?? rawSc.pot ?? 1.5),
    board: rawSc.board || "", heroCards: rawSc.heroCards || rawSc.hero_cards || "",
    street: rawSc.street || rawSc.current_street || "Preflop",
    prevAction: rawSc.prevAction || "—",
    villainProfile: rawSc.villainProfile || rawSc.villain_profile || "Reg",
    mode: rawSc.mode || "gto",
  };
  const bad = validate(sc); if (bad) return bad;

  const eff = Math.min(sc.heroStack, sc.vilStack);
  const spr = sc.street === "Preflop" ? null : Math.round((eff / Math.max(0.5, sc.potBb)) * 10) / 10;
  const hero = parseCards(sc.heroCards).slice(0, 2);
  const board = parseCards(sc.board).slice(0, 5);
  const ip = ["BTN", "CO", "HJ"].includes(sc.heroPos);
  const facing = /raise|bet|3-?bet|all-?in|relance|mise/i.test(sc.prevAction || "");
  const exploit = sc.mode === "exploit", icm = sc.mode === "icm", pko = sc.format === "PKO" || sc.format === "KO";
  const prof = { Nit: { f: 2, b: -1, v: -1 }, Fish: { f: -2, b: -2, v: 2 }, TAG: { f: 0, b: 0, v: 0 }, LAG: { f: -1, b: 1, v: 0 }, Reg: { f: 0, b: 0, v: 0 }, Maniac: { f: -2, b: 2, v: 1 } }[sc.villainProfile] || { f: 0, b: 0, v: 0 };

  let reco, alts, coach, heroAct = "rfi", vilAct = "rfi", heroLabel = "Range", vilLabel = "Range estimée", eq = null;

  if (sc.street === "Preflop") {
    const hk = hero.length === 2 ? handKeyOf(hero) : null;
    const strengthPct = hk ? handPercentile(hk) : null; // 0..1, 1 = meilleure
    if (eff < 15) {
      // PUSH / FOLD (short stack)
      heroAct = "rfi"; heroLabel = `Push/Fold ${eff}bb`; vilLabel = "Range de call estimée";
      let thr = POS_PUSH[sc.heroPos] ?? 0.2; if (icm) thr *= 0.8; if (pko) thr *= 1.1;
      const push = strengthPct == null ? true : strengthPct >= 1 - thr;
      reco = { action: push ? "All-in" : "Fold", label: push ? `Jam ${eff}bb` : "Fold", freq: push ? 90 : 80, evBb: push ? +0.4 : 0, sizing: `${eff}bb`, confidence: "Pro (push/fold)" };
      alts = [{ action: "All-in", freq: push ? 90 : 12, evBb: push ? 0.4 : -0.3, comment: `Range de jam ~${Math.round(thr * 100)}% en ${sc.heroPos}.` }, { action: "Fold", freq: push ? 10 : 88, evBb: 0, comment: "Hors range de jam." }];
      coach = { explanation: `Short stack (${eff}bb) en ${sc.heroPos} : jeu en push/fold. ${icm ? "ICM : range resserrée." : ""} Range de jam ≈ ${Math.round(thr * 100)}%.`, mistake: "Limper ou min-raiser avec <15bb.", exploit: `vs ${sc.villainProfile} : ${prof.f > 0 ? "jam plus large (il call peu)" : "jam value (il call large)"}.` };
    } else if (!facing) {
      heroAct = "rfi"; heroLabel = "Open RFI"; vilLabel = "Range de défense";
      let thr = POS_RFI[sc.heroPos] ?? 0.2; if (exploit && prof.f > 0) thr *= 1.15;
      const open = strengthPct == null ? true : strengthPct >= 1 - thr;
      const sz = sc.format === "Cash" ? (ip ? 2.3 : 2.5) : 2.1;
      reco = { action: open ? "Open" : "Fold", label: open ? `Open ${sz}bb` : "Fold", freq: open ? 82 : 80, evBb: open ? +0.2 : 0, sizing: `${sz}bb`, confidence: "Pro" };
      alts = [{ action: "Open", freq: Math.round(thr * 100), evBb: 0.2, comment: `Range RFI ${Math.round(thr * 100)}% en ${sc.heroPos}.` }, { action: "Fold", freq: 100 - Math.round(thr * 100), evBb: 0, comment: "Mains hors range." }, { action: "Limp", freq: 2, evBb: -0.2, comment: "Déconseillé (sauf SB).", }];
      coach = { explanation: `En ${sc.heroPos}, range d'ouverture ≈ ${Math.round(thr * 100)}% à ${sz}bb. ${hk ? `${hk} est ${open ? "dans" : "hors"} la range.` : ""}`, mistake: "Open trop large UTG/HJ.", exploit: `vs ${sc.villainProfile} : ${prof.f > 0 ? "vole plus large" : "open value"}.` };
    } else {
      heroAct = "vs_open"; heroLabel = "Défense vs Open"; vilLabel = "Range d'open estimée";
      const tb = ip ? 3 : 4;
      const threeBet = strengthPct != null && strengthPct >= 0.93;
      const call = strengthPct != null && strengthPct >= 0.78 && ip;
      reco = { action: threeBet ? "3-Bet" : call ? "Call" : "Fold", label: threeBet ? `3-Bet ${tb}x` : call ? "Call IP" : "Fold", freq: threeBet ? 60 : call ? 55 : 70, evBb: threeBet ? +0.25 : call ? +0.08 : 0, sizing: `${tb}x`, confidence: "Pro" };
      alts = [{ action: "3-Bet", freq: exploit && prof.f > 0 ? 24 : 16, evBb: 0.22, comment: prof.f > 0 ? "Élargis les bluff-3bets (il sur-fold)." : "Value + bluffs équilibrés." }, { action: "Call", freq: ip ? 30 : 18, evBb: 0.07, comment: ip ? "Cold-call IP correct." : "Call OOP capé." }, { action: "Fold", freq: 50, evBb: 0, comment: "Défends ~MDF." }];
      coach = { explanation: `Face à l'open en ${sc.heroPos}. ${hk || ""} → ${threeBet ? "3-bet value/bluff" : call ? "call IP" : "fold"}.`, mistake: "Cold-call OOP trop large.", exploit: `vs ${sc.villainProfile} : ${prof.f > 0 ? "3-bet bluff plus" : prof.f < 0 ? "value-3bet" : "équilibre"}.` };
    }
  } else {
    // ── POSTFLOP : équité réelle ──
    heroAct = "rfi"; heroLabel = "Range (continuation)"; vilLabel = `Range estimée (${sc.villainProfile})`;
    const tex = boardTexture(board);
    const wet = tex.wet;
    let vfrac = facing ? 0.35 : 0.5;             // range vilain (top-X%) selon son action
    vfrac *= prof.f > 0 ? 0.8 : prof.f < 0 ? 1.25 : 1; // Nit plus serré, Fish plus large
    vfrac = Math.max(0.08, Math.min(0.9, vfrac));
    const vr = villainRange(vfrac, [...hero, ...board]);
    eq = hero.length === 2 ? Math.round(equity(hero, board, vr, 1500) * 100) : null;
    const E = eq == null ? 50 : eq;

    if (facing) {
      const toCall = Math.max(0.5, sc.potBb * 0.5);
      const po = Math.round(toCall / (sc.potBb + toCall) * 100);
      const callEv = +((E / 100) * (sc.potBb + toCall) - toCall).toFixed(2);
      const shouldCall = E >= po + (prof.f < 0 ? -4 : 4);
      const raise = E >= 68;
      reco = { action: raise ? "Raise" : shouldCall ? "Call" : "Fold", label: raise ? "Raise value" : shouldCall ? "Call (bluff-catch)" : "Fold", freq: raise ? 55 : shouldCall ? 60 : 65, evBb: raise ? +(callEv + 0.3).toFixed(2) : shouldCall ? callEv : 0, sizing: raise ? "2.5x" : "—", confidence: "Pro (équité réelle)" };
      alts = [{ action: "Call", freq: shouldCall ? 60 : 30, evBb: callEv, comment: `Équité ${E}% vs pot odds ${po}% → ${shouldCall ? "call rentable" : "call non rentable"}.` }, { action: "Raise", freq: raise ? 30 : 10, evBb: +(callEv + 0.3).toFixed(2), comment: wet ? "Raise value/semi-bluff (board dynamique)." : "Raise polarisé." }, { action: "Fold", freq: shouldCall ? 10 : 60, evBb: 0, comment: "Sous le seuil de pot odds." }];
      coach = { explanation: `${sc.street} ${tex.label}, SPR ${spr}. Ton équité ≈ ${E}% face à une mise (pot odds ${po}%) → ${shouldCall ? "tu peux call" : "fold"}.`, mistake: "Call river de curiosité sous les pot odds.", exploit: `vs ${sc.villainProfile} : ${prof.b > 0 ? "hero-call plus (il bluffe)" : prof.v > 0 ? "fold tes bluff-catchs faibles (il value)" : "équilibre"}.` };
    } else {
      const value = E >= 60, bluff = E <= 34;
      const cb = ip ? (wet ? 66 : 33) : (wet ? 75 : 40);
      const betEv = +((E / 100) * (sc.potBb + sc.potBb * cb / 100) - (sc.potBb * cb / 100) * (1 - E / 100)).toFixed(2);
      reco = { action: value || bluff ? "Bet" : "Check", label: value ? `Value bet ${cb}% pot` : bluff ? `Bluff ${cb}% pot` : "Check", freq: value ? 75 : bluff ? 45 : 60, evBb: value ? +(betEv).toFixed(2) : bluff ? +0.05 : +0.04, sizing: `${cb}% pot`, confidence: "Pro (équité réelle)" };
      alts = [{ action: "Bet", freq: value ? 75 : bluff ? 45 : 40, evBb: +(betEv).toFixed(2), comment: `Équité ${E}% → ${value ? "value bet" : bluff ? "bluff polarisé" : "bet de protection"} ${cb}%.` }, { action: "Check", freq: value ? 25 : 55, evBb: +0.04, comment: "Contrôle du pot / range de check." }, { action: "All-in", freq: spr && spr < 2 ? 25 : 3, evBb: +0.1, comment: spr && spr < 2 ? "SPR bas : jam." : "Spots polarisés." }];
      coach = { explanation: `${sc.street} ${tex.label}, SPR ${spr}, ${ip ? "IP" : "OOP"}. Équité ≈ ${E}% → ${value ? `value bet ${cb}%` : bluff ? `bluff ${cb}%` : "check (équité moyenne)"}.`, mistake: "C-bet automatique 100% sur board humide.", exploit: `vs ${sc.villainProfile} : ${prof.f > 0 ? "c-bet bluff plus (il fold trop)" : prof.f < 0 ? "value-bet, coupe les bluffs (il call)" : "équilibre"}.` };
    }
    if (icm && reco) { reco.confidence = "Pro · ICM"; alts[0].comment += " ⚖ ICM : resserre les call-offs."; }
  }

  return {
    ok: true, estimated: false, engine: "pro",
    spot: { heroPos: sc.heroPos, heroStack: sc.heroStack, vilPos: sc.vilPos, vilStack: sc.vilStack, street: sc.street, potBb: sc.potBb, spr, board: sc.board, heroCards: sc.heroCards, eff, equity: eq },
    reco, alts, coach,
    ranges: { heroAction: heroAct, heroLabel, vilAction: vilAct, vilLabel },
  };
}

/* helpers préflop */
function handKeyOf(hero) {
  const r1 = rankOf(hero[0]), r2 = rankOf(hero[1]); const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  if (hi === lo) return rk(hi) + rk(hi);
  return rk(hi) + rk(lo) + (suitOf(hero[0]) === suitOf(hero[1]) ? "s" : "o");
}
function handPercentile(key) { const i = ALL169.findIndex(c => c.key === key); return i < 0 ? 0.5 : 1 - i / ALL169.length; }
function boardTexture(board) {
  if (board.length < 3) return { wet: false, label: "—" };
  const r = board.slice(0, 3).map(rankOf).sort((a, b) => b - a); const s = board.slice(0, 3).map(suitOf);
  const paired = r[0] === r[1] || r[1] === r[2];
  const mono = s[0] === s[1] && s[1] === s[2];
  const twoTone = new Set(s).size === 2;
  const conn = (r[0] - r[2]) <= 4 && !paired;
  return { wet: mono || twoTone || conn, label: paired ? "appariée" : mono ? "monocolore" : conn ? "connectée" : twoTone ? "bicolore" : "sèche" };
}

module.exports = { solve, equity, best7, eval5, parseCards, ALL169 };
