/* ════════════════════════════════════════════════════════════════════════
   PokerForge — MOTEUR COACH AI (parser multi-room + normalisation + analyse)
   ------------------------------------------------------------------------
   Pipeline : detect → normalize → reconstruct → analyze → score → outputs.
   Objectif : importer / lire / normaliser / analyser des Hand Histories de
   N'IMPORTE QUELLE room majeure (PAS limité à Winamax).

   Rooms ciblées : Winamax, PokerStars, GGPoker, PartyPoker, Unibet,
   PMU/Betclic/iPoker, 888, WPN/ACR, Chico, Ignition/Bovada, + fallback.

   Règle de fiabilité : AUCUNE erreur fatale. Tout est encapsulé en try/catch,
   les données manquantes deviennent des `parseWarnings`, jamais des crashs.

   Sortie publique principale :
     analyzeHandHistory(rawText, overrides?) → bundle complet pour l'UI
     parseSessionText(rawText) → { hands:[normalized...], errors, meta }
═══════════════════════════════════════════════════════════════════════════ */

/* ───────────────────────── Cartes ───────────────────────── */
const CE_SUIT = { s:"♠", h:"♥", d:"♦", c:"♣", "♠":"♠", "♥":"♥", "♦":"♦", "♣":"♣" };
const CE_RANKS = "23456789TJQKA";
const CE_RANKVAL = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14 };

function ceParseCard(tok) {
  if (!tok) return null;
  let t = String(tok).trim().replace(/^10/, "T");
  const r = (t[0] || "").toUpperCase();
  const sc = t[1] || "";
  const s = CE_SUIT[sc] || CE_SUIT[sc.toLowerCase()];
  if (!CE_RANKS.includes(r) || !s) return null;
  return { r, s };
}
function ceParseCards(str) {
  if (!str) return [];
  const m = String(str).replace(/[[\]]/g, " ").match(/(?:10|[2-9TJQKAtjqka])\s*[shdc♠♥♦♣]/g) || [];
  return m.map(x => ceParseCard(x.replace(/\s/g, ""))).filter(Boolean);
}
function ceCardStr(c) { return c ? c.r + c.s : ""; }
// Parser tolérant : accepte rank-first ("7h","Ts") ET suit-first ("H7","SA","D10") — iPoker.
function ceParseCardsAny(str) {
  if (!str) return [];
  const toks = String(str).replace(/[[\],]/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  toks.forEach(t => {
    let c = ceParseCard(t.replace(/^10/, "T"));
    if (!c) {
      const m = t.match(/^([shdcSHDC])\s*(10|[2-9TJQKAtjqka])$/);
      if (m) c = ceParseCard(m[2].replace(/^10/, "T") + m[1].toLowerCase());
    }
    if (c) out.push(c);
  });
  return out;
}

/* ───────────────────────── Positions ─────────────────────── */
// Ordre des positions en parcours horaire À PARTIR DU BOUTON (index 0 = BTN).
const CE_POS_RING = {
  2: ["SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "UTG+1", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "MP", "HJ", "CO"],
  10:["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "MP", "LJ", "HJ", "CO"],
};
const CE_POS_RANK = { BTN:0, CO:1, HJ:2, LJ:3, MP:4, "UTG+2":5, "UTG+1":6, UTG:7, BB:8, SB:9 };
function ceIsEarly(pos) { return ["UTG", "UTG+1", "UTG+2", "MP", "LJ"].includes(pos); }
function ceIsBlind(pos) { return pos === "SB" || pos === "BB"; }

/* ───────────────────────── Détection room ────────────────── */
function ceDetectSite(t) {
  const s = t || "";
  // ── marques explicites ──
  if (/winamax/i.test(s)) return "Winamax";
  if (/pokerstars/i.test(s)) return "PokerStars";
  if (/gg ?poker|natural8|ggnetwork/i.test(s)) return "GGPoker";
  if (/888 ?poker|888poker|pacific/i.test(s)) return "888";
  if (/party ?poker|partygaming/i.test(s)) return "PartyPoker";
  if (/unibet/i.test(s)) return "Unibet";
  if (/betclic/i.test(s)) return "Betclic";
  if (/\bpmu\b|pmu\.fr/i.test(s)) return "PMU";
  if (/americas ?cardroom|\bacr\b|winning ?poker|\bwpn\b|blackchip|truepoker|americaspoker/i.test(s)) return "WPN/ACR";
  if (/chico|tigergaming|sportsbetting\.ag|betonline/i.test(s)) return "Chico";
  if (/ignition|bovada|bodog/i.test(s)) return "Ignition";
  if (/ipoker|playtech/i.test(s)) return "iPoker";
  // ── heuristiques sur en-têtes sans marque ──
  if (/<game\b[^>]*gamecode|<\s*round\b[^>]*no\s*=|<\s*player\b[^>]*seat\s*=/i.test(s)) return "iPoker";       // XML
  if (/Poker Hand #(?:HD|TM|RC|SD|OM|C)/i.test(s)) return "GGPoker";                                          // id GG (#HD…)
  if (/\*{3,}\s*Hand History for Game/i.test(s)) return "PartyPoker";                                          // ancien format Party
  return "Inconnu";
}
function ceDetectLanguage(t) {
  if (/se couche|relance|mise\b|tapis|donne les cartes|petite blinde|grosse blinde|parole/i.test(t)) return "fr";
  return "en";
}
function ceDetectFormat(t) {
  if (/omaha|\bplo\b|pot limit omaha/i.test(t)) return "PLO";
  if (/stud/i.test(t)) return "Stud";
  if (/razz/i.test(t)) return "Razz";
  return "NLHE";
}
function ceDetectGameType(t) {
  if (/tournament|tournoi|\blevel\b|niveau|sit ?& ?go|sit ?n ?go|\bspin\b|expresso|buy-?in|buyin/i.test(t)) return "tournament";
  return "cash";
}
function ceDetectTournamentType(t) {
  if (/mystery/i.test(t)) return "Mystery KO";
  if (/progressive|\bpko\b/i.test(t)) return "PKO";
  if (/bounty|knockout|\bko\b/i.test(t)) return "KO";
  if (/satellite|qualif/i.test(t)) return "Satellite";
  if (/spin|expresso|jackpot/i.test(t)) return "Spin & Go";
  return "Regular";
}

/* ───────────────────────── Helpers numériques ────────────── */
function ceNum(x) {
  if (x == null) return null;
  const v = parseFloat(String(x).replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  return isNaN(v) ? null : v;
}
function ceRound(v, d = 2) { const p = Math.pow(10, d); return Math.round((v || 0) * p) / p; }

/* ════════════════════════════════════════════════════════════
   NORMALISATION — format texte "lignée PokerStars"
   (PS, GG, 888, WPN/ACR, Chico, Ignition, Winamax, …)
   Toutes les valeurs converties en BB.
═══════════════════════════════════════════════════════════════ */
function ceNormalizeText(block, idx, overrides = {}) {
  const warnings = [];
  const site = overrides.site || ceDetectSite(block);
  const language = ceDetectLanguage(block);
  const gameType = overrides.gameType || ceDetectGameType(block);
  const tournamentType = gameType === "tournament" ? ceDetectTournamentType(block) : null;
  const format = ceDetectFormat(block);
  const lines = block.split(/\r?\n/).map(l => l.replace(/\s+$/, "")).filter(l => l.trim());

  // Hand id / date
  const idm = block.match(/(?:Hand|Game|Main|No)\s*[:#]?\s*([0-9]{4,})/i) || block.match(/#\s*([0-9]{4,})/);
  const handId = (overrides.handId) || (idm ? idm[1] : String(100000 + idx));
  const dm = block.match(/(\d{4}\/\d{2}\/\d{2}[^\n]*?\d{2}:\d{2})/) ||
             block.match(/(\d{2}\/\d{2}\/\d{4}[^\n]*?\d{2}:\d{2})/) ||
             block.match(/(\d{4}-\d{2}-\d{2}[^\n]*?\d{2}:\d{2})/);
  const dateStr = dm ? dm[1].slice(0, 19) : "";

  // ── Blindes / ante / devise ──
  const curMatch = block.match(/[€$£]/);
  const currency = curMatch ? curMatch[0] : "";
  let sbVal = ceNum(overrides.sb), bbVal = ceNum(overrides.bb);
  if (bbVal == null) {
    // (0.10/0.25) ou (10/20) ou (25/100/200) MTT (sb/bb avec ante au milieu parfois)
    const blindHdr = block.match(/\(\s*[€$£]?\s*([0-9][0-9.,]*)\s*[€$£]?\s*\/\s*[€$£]?\s*([0-9][0-9.,]*)\s*[€$£]?(?:\s*\/\s*[€$£]?\s*([0-9][0-9.,]*))?\s*[€$£]?\s*\)/);
    if (blindHdr) {
      // Formats : (sb/bb) en cash, (sb/bb/ante) en MTT → bb = TOUJOURS le 2ᵉ champ, le 3ᵉ est l'ante.
      sbVal = ceNum(blindHdr[1]); bbVal = ceNum(blindHdr[2]);
    }
  }
  if (bbVal == null) {
    const bbm = block.match(/posts? (?:the )?big blind[^0-9]*([0-9][0-9.,]*)/i) ||
                block.match(/grosse blinde[^0-9]*([0-9][0-9.,]*)/i);
    if (bbm) bbVal = ceNum(bbm[1]);
  }
  if (sbVal == null) {
    const sbm = block.match(/posts? (?:the )?small blind[^0-9]*([0-9][0-9.,]*)/i) ||
                block.match(/petite blinde[^0-9]*([0-9][0-9.,]*)/i);
    if (sbm) sbVal = ceNum(sbm[1]);
  }
  if (bbVal == null) { bbVal = 1; warnings.push("Big blind introuvable — valeurs supposées déjà en bb."); }
  if (sbVal == null) sbVal = bbVal / 2;
  const bb = bbVal > 0 ? bbVal : 1;
  const toBb = v => (v == null ? null : ceRound(v / bb, 2));

  // ante (somme)
  let ante = 0;
  const anteRe = /posts? (?:the )?ante[^0-9]*([0-9][0-9.,]*)/gi; let am;
  while ((am = anteRe.exec(block))) ante += ceNum(am[1]) || 0;

  // buy-in
  let buyIn = null;
  const buyM = block.match(/buy-?in[^0-9€$£]*[€$£]?\s*([0-9][0-9.,]*)\s*[€$£]?(?:\s*\+\s*[€$£]?\s*([0-9][0-9.,]*))?/i);
  if (buyM) buyIn = (ceNum(buyM[1]) || 0) + (buyM[2] ? (ceNum(buyM[2]) || 0) : 0);

  // table size
  let maxSeats = null;
  const seatsM = block.match(/(\d+)\s*-?\s*max/i);
  if (seatsM) maxSeats = parseInt(seatsM[1]);

  // ── Joueurs (Seat lines) ── (devise optionnelle avant les chiffres)
  const players = {}; const order = [];
  const seatRe = /Seat\s+(\d+):\s+(.+?)\s+\(\s*[€$£]?\s*([0-9][0-9.,]*)/g; let sm;
  while ((sm = seatRe.exec(block))) {
    const name = sm[2].trim();
    const stack = ceNum(sm[3]);
    if (!players[name]) {
      players[name] = { name, seat: parseInt(sm[1]), stack, stackBb: toBb(stack), pos: null, isHero: false, holeCards: [], shown: null, invested: 0, won: 0, folded: false };
      order.push(name);
    }
  }
  if (!order.length) warnings.push("Aucun siège détecté (format non reconnu ?).");

  // Bouton
  const btnm = block.match(/Seat\s+#?(\d+)\s+is the button/i) || block.match(/#?(\d+)\s+is the button/i);
  const btnSeat = btnm ? parseInt(btnm[1]) : null;

  // Hero + cartes
  let heroName = overrides.heroName || null;
  const dealt = block.match(/Dealt to\s+(.+?)\s+\[([^\]]+)\]/i) || block.match(/Distribu[ée] à\s+(.+?)\s+\[([^\]]+)\]/i);
  if (!heroName && dealt) heroName = dealt[1].trim();
  const heroTok = block.match(/(\S[^\n(]*?)\s*\(Hero\)/);
  if (!heroName && heroTok) heroName = heroTok[1].trim();
  let heroCards = overrides.heroCards ? ceParseCards(overrides.heroCards) : (dealt ? ceParseCards(dealt[2]) : []);
  if (!heroCards.length) warnings.push("Cartes du Hero non trouvées — analyse limitée (complète-les manuellement).");

  // ── Parcours streets / actions / pot ──
  const actionsByStreet = { preflop: [], flop: [], turn: [], river: [] };
  const boardByStreet = { flop: [], turn: [], river: [] };
  let street = "preflop";
  let board = [];
  let pot = 0;
  const streetCommit = {};      // mises engagées sur la street courante (par joueur)
  const totalInvested = {};     // total investi sur la main (par joueur)
  const potByStreet = { preflop: 0, flop: 0, turn: 0, river: 0 };
  const addPot = (name, added) => {
    if (!added || added <= 0) return;
    pot += added; totalInvested[name] = (totalInvested[name] || 0) + added;
  };

  // Blindes + antes dans le pot initial
  const postRe = /^(.+?):?\s+posts? (?:the )?(small blind|big blind|ante|small & big blinds|straddle)[^0-9]*([0-9][0-9.,]*)/gim; let pm2;
  while ((pm2 = postRe.exec(block))) {
    const nm = pm2[1].replace(/:$/, "").trim();
    const kind = pm2[2].toLowerCase();
    const val = ceNum(pm2[3]) || 0;
    ensurePlayer(players, order, nm);
    if (/small blind/.test(kind) && !/big/.test(kind)) { streetCommit[nm] = val; addPot(nm, val); }
    else if (/big blind/.test(kind)) { streetCommit[nm] = Math.max(streetCommit[nm] || 0, val); addPot(nm, val); }
    else if (/straddle/.test(kind)) { streetCommit[nm] = val; addPot(nm, val); }
    else { addPot(nm, val); } // ante → direct dans le pot
  }

  const actorRe = /^(.+?)\s+(folds?|calls?|checks?|bets?|raises?|shoves?|is all-in|all-in|se couche|suit|relance|mise|checke?|tapis)\b(.*)$/i;
  const winners = [];

  for (const raw of lines) {
    const ln = raw.trim();
    // Street markers
    const fl = ln.match(/\*\*\*\s*FLOP\s*\*\*\*\s*\[([^\]]+)\]/i) || ln.match(/Dealing Flop[^\[]*\[([^\]]+)\]/i);
    const tl = ln.match(/\*\*\*\s*TURN\s*\*\*\*.*?\[([^\]]+)\]\s*$/i) || ln.match(/Dealing Turn[^\[]*\[([^\]]+)\]/i);
    const rl = ln.match(/\*\*\*\s*RIVER\s*\*\*\*.*?\[([^\]]+)\]\s*$/i) || ln.match(/Dealing River[^\[]*\[([^\]]+)\]/i);
    if (/\*\*\*\s*(HOLE CARDS|PRE-?FLOP)|Dealing down cards/i.test(ln)) { street = "preflop"; continue; }
    if (fl) { street = "flop"; board = ceParseCards(fl[1]).slice(0, 3); boardByStreet.flop = board.slice(); resetStreet(streetCommit); continue; }
    if (tl) { // certaines rooms (Party) ne listent QUE la nouvelle carte → on complète depuis le flop
      street = "turn"; let cs = ceParseCards(ln);
      board = cs.length >= 4 ? cs.slice(0, 4) : (boardByStreet.flop || []).concat(cs).slice(0, 4);
      boardByStreet.turn = board.slice(); resetStreet(streetCommit); continue; }
    if (rl) {
      street = "river"; let cs = ceParseCards(ln);
      board = cs.length >= 5 ? cs.slice(0, 5) : (boardByStreet.turn.length ? boardByStreet.turn : boardByStreet.flop).concat(cs).slice(0, 5);
      boardByStreet.river = board.slice(); resetStreet(streetCommit); continue; }
    if (/\*\*\*\s*SHOW ?DOWN/i.test(ln)) { street = "showdown"; continue; }
    if (/\*\*\*\s*SUMMARY|Total pot/i.test(ln)) break;

    // Showdown shows
    const shM = ln.match(/^(?:Seat\s+\d+:\s+)?(.+?)\s+(?:shows?|showed|mucks and shows?|montre)\s+\[([^\]]+)\]/i);
    if (shM) {
      const nm = shM[1].replace(/\(.*?\)/g, "").replace(/:$/, "").trim();
      const cs = ceParseCards(shM[2]);
      if (players[nm] && cs.length >= 2) players[nm].shown = cs.slice(0, 2);
      continue;
    }
    // Winners (collected / won / gagne)
    const wM = ln.match(/^(.+?)\s+(?:collected|won|gagne|remporte)\s+[€$£]?\s*([0-9][0-9.,]*)/i) ||
               ln.match(/^Seat\s+\d+:\s+(.+?)\s+(?:collected|won|showed.*?and won)\s*\(?[€$£]?\s*([0-9][0-9.,]*)/i);
    if (wM) {
      const nm = wM[1].replace(/\(.*?\)/g, "").replace(/:$/, "").trim();
      const val = ceNum(wM[2]) || 0;
      if (players[nm]) { players[nm].won += val; }
      winners.push({ name: nm, amountBb: toBb(val) });
      continue;
    }
    // Uncalled bet returned
    const ucM = ln.match(/Uncalled bet\s*\(?[€$£]?\s*([0-9][0-9.,]*)\)?\s*returned to\s+(.+?)\s*$/i);
    if (ucM) {
      const val = ceNum(ucM[1]) || 0;
      const nm = ucM[2].replace(/:$/, "").trim();
      pot -= val; if (totalInvested[nm] != null) totalInvested[nm] = Math.max(0, totalInvested[nm] - val);
      if (streetCommit[nm] != null) streetCommit[nm] = Math.max(0, streetCommit[nm] - val);
      continue;
    }

    // Actions
    const aM = ln.match(actorRe);
    if (!aM) continue;
    const actorTok = aM[1].trim();
    if (/^(Dealt|Board|Total pot|Seat\s+\d|Uncalled|\*\*\*|Distribu)/i.test(actorTok)) continue;
    let verb = aM[2].toLowerCase();
    const rest = aM[3] || "";
    if (/^posts?$/i.test(verb)) continue; // déjà comptées
    const name = ensurePlayer(players, order, actorTok.replace(/\(Hero\)/i, "").replace(/:\s*$/, "").trim());
    if (heroName && name === heroName) players[name].isHero = true;
    if (/\(hero\)/i.test(ln)) { players[name].isHero = true; heroName = name; }

    // Normaliser le verbe (FR → EN)
    let type;
    if (/fold|se couche/.test(verb)) type = "fold";
    else if (/check|checke|parole/.test(verb)) type = "check";
    else if (/call|suit/.test(verb)) type = "call";
    else if (/raise|relance/.test(verb)) type = "raise";
    else if (/bet|mise/.test(verb)) type = "bet";
    else if (/shove|all-?in|tapis/.test(verb)) type = "allin";
    else type = verb;

    // Montant
    let amt = null;
    const toM = rest.match(/to\s+[€$£]?\s*([0-9][0-9.,]*)/i);
    const num = rest.match(/[€$£]?\s*([0-9][0-9.,]*)/);
    if (toM) amt = ceNum(toM[1]);
    else if (num) amt = ceNum(num[1]);
    const allIn = /all-?in|tapis|shove/i.test(ln) || /all-?in/i.test(rest);
    if (allIn && type !== "fold" && type !== "check") { if (type === "call") type = "call"; else type = "allin"; }

    // Calcul du delta vers le pot
    let added = 0, toTotal = null;
    if (type === "fold") { players[name].folded = true; }
    else if (type === "check") { /* 0 */ }
    else if (type === "raise" || (type === "allin" && toM)) {
      toTotal = amt;
      added = (amt || 0) - (streetCommit[name] || 0);
      streetCommit[name] = amt || streetCommit[name] || 0;
    } else if (type === "call" || type === "bet" || type === "allin") {
      added = amt || 0;
      streetCommit[name] = (streetCommit[name] || 0) + added;
      toTotal = streetCommit[name];
    }
    if (added > 0) addPot(name, added);

    const amountBb = toBb(toTotal != null ? toTotal : amt);
    const label = ceActionLabel(type, amountBb, street);
    actionsByStreet[street === "showdown" ? "river" : street].push({
      actor: name, pos: null, isHero: !!players[name].isHero, type,
      amountBb, addedBb: toBb(added), label,
      potAfterBb: toBb(pot), board: board.slice(),
    });
  }
  potByStreet.preflop = toBb(pot); // sera écrasé ci-dessous par snapshot fin de street

  // Snapshots de pot par street (pot à la FIN de chaque street)
  recomputePotByStreet(actionsByStreet, potByStreet);

  // ── Finalisation sièges / positions ──
  const seatArr = order.map(n => players[n]);
  // anneau depuis bouton
  if (btnSeat != null) {
    const bi = seatArr.findIndex(s => s.seat === btnSeat);
    if (bi >= 0) ceAssignRing(seatArr, bi);
  }
  // blindes postées = autoritaires sur SB/BB
  const blindRe = /^(.+?):?\s+posts? (?:the )?(small|big) blind/gim; let bmm;
  while ((bmm = blindRe.exec(block))) {
    const nm = bmm[1].replace(/:$/, "").trim();
    const sx = seatArr.find(x => x.name === nm);
    if (sx) sx.pos = bmm[2].toLowerCase() === "small" ? "SB" : "BB";
  }
  if (btnSeat == null) warnings.push("Bouton non détecté — positions estimées.");

  // attribuer invested/won/hero
  seatArr.forEach(s => {
    s.invested = ceRound(totalInvested[s.name] || 0, 2);
    s.investedBb = toBb(s.invested);
    s.wonBb = toBb(s.won);
    if (!s.pos) s.pos = "?";
    if (heroName && s.name === heroName) { s.isHero = true; s.holeCards = heroCards; }
    if (s.shown && s.isHero && (!s.holeCards || !s.holeCards.length)) s.holeCards = s.shown;
  });
  // injecter pos dans les actions
  const posByName = {}; seatArr.forEach(s => posByName[s.name] = s.pos);
  ["preflop", "flop", "turn", "river"].forEach(st => actionsByStreet[st].forEach(a => { a.pos = posByName[a.actor] || "?"; }));

  let hero = seatArr.find(s => s.isHero);
  if (!hero && seatArr.length) { hero = seatArr[0]; hero.isHero = true; hero.holeCards = heroCards; warnings.push("Hero non identifié — 1er siège utilisé par défaut."); }

  const showdown = /\*\*\*\s*SHOW ?DOWN/i.test(block) || seatArr.some(s => s.shown);
  const heroPos = hero ? hero.pos : "?";
  const totalActions = actionsByStreet.preflop.length + actionsByStreet.flop.length + actionsByStreet.turn.length + actionsByStreet.river.length;
  if (!totalActions) warnings.push("Aucune action détectée.");

  // streets disponibles
  const streetsAvailable = ["preflop"];
  if (boardByStreet.flop.length) streetsAvailable.push("flop");
  if (boardByStreet.turn.length) streetsAvailable.push("turn");
  if (boardByStreet.river.length) streetsAvailable.push("river");

  // résultat Hero net (bb)
  let heroResultBb = 0;
  if (hero) {
    const inv = hero.investedBb || 0;
    const won = hero.wonBb || 0;
    heroResultBb = ceRound(won - inv, 2);
  }

  const normalized = {
    valid: totalActions > 0 && seatArr.length >= 2,
    parser: "text",
    sourceSite: site, language, gameType, tournamentType, format,
    buyIn, blinds: { sb: ceRound(sbVal, 4), bb: ceRound(bb, 4) }, ante: ceRound(ante, 4),
    currency, tableSize: seatArr.length, maxSeats: maxSeats || seatArr.length,
    heroName, handId, dateStr,
    players: seatArr,
    positions: posByName,
    stacks: Object.fromEntries(seatArr.map(s => [s.name, s.stackBb])),
    heroCards: hero ? hero.holeCards : heroCards,
    heroPos,
    board, boardByStreet,
    actionsByStreet,
    potByStreet,
    finalPotBb: toBb(pot),
    showdown,
    winners,
    heroResultBb,
    streetsAvailable,
    rawText: block,
    parseWarnings: warnings,
  };
  return normalized;
}

/* helpers internes texte */
function ensurePlayer(players, order, name) {
  const nm = name.replace(/\(Hero\)/i, "").replace(/:\s*$/, "").trim();
  if (!players[nm]) { players[nm] = { name: nm, seat: order.length + 1, stack: null, stackBb: null, pos: null, isHero: false, holeCards: [], shown: null, invested: 0, won: 0, folded: false }; order.push(nm); }
  return nm;
}
function resetStreet(streetCommit) { for (const k in streetCommit) delete streetCommit[k]; }
function ceActionLabel(type, amountBb, street) {
  const a = amountBb != null ? ` ${amountBb}bb` : "";
  switch (type) {
    case "fold": return "Fold";
    case "check": return "Check";
    case "call": return "Call" + a;
    case "bet": return "Bet" + a;
    case "raise": return "Raise" + a;
    case "allin": return "All-in" + a;
    default: return type;
  }
}
function recomputePotByStreet(abs, potByStreet) {
  ["preflop", "flop", "turn", "river"].forEach(st => {
    const arr = abs[st];
    if (arr.length) potByStreet[st] = arr[arr.length - 1].potAfterBb;
    else if (st !== "preflop") {
      // hérite du pot de la street précédente si pas d'action
      const prev = st === "flop" ? "preflop" : st === "turn" ? "flop" : "turn";
      potByStreet[st] = potByStreet[prev];
    }
  });
}
function ceAssignRing(seatArr, btnIdx) {
  const n = seatArr.length;
  const ring = CE_POS_RING[n] || CE_POS_RING[Math.min(10, Math.max(2, n))];
  for (let k = 0; k < n; k++) {
    const seat = seatArr[(btnIdx + k) % n];
    if (!seat.pos) seat.pos = ring[k] || "?";
  }
}

/* ════════════════════════════════════════════════════════════
   NORMALISATION — iPoker / PMU / Betclic (XML)
═══════════════════════════════════════════════════════════════ */
function ceNormalizeXml(block, idx, overrides = {}) {
  const warnings = [];
  try {
    const site = overrides.site || ceDetectSite(block) || "iPoker";
    const handId = (block.match(/gamecode\s*=\s*"([^"]+)"/i) || [])[1] || String(100000 + idx);
    const dateStr = (block.match(/<startdate>([^<]+)<\/startdate>/i) || [])[1] || "";
    const gameType = /tournament|tour/i.test(block) ? "tournament" : "cash";
    // blindes : on lit les premières actions type 1 (SB) / 2 (BB)
    const players = {}; const order = [];
    const pRe = /<player\b([^>]*)\/?>/gi; let pm;
    while ((pm = pRe.exec(block))) {
      const at = pm[1];
      const name = (at.match(/name\s*=\s*"([^"]*)"/i) || [])[1];
      if (!name) continue;
      const seat = parseInt((at.match(/seat\s*=\s*"([^"]*)"/i) || [])[1] || order.length + 1);
      const chips = ceNum((at.match(/chips\s*=\s*"([^"]*)"/i) || [])[1]);
      const dealer = (at.match(/dealer\s*=\s*"([^"]*)"/i) || [])[1];
      const win = ceNum((at.match(/win\s*=\s*"([^"]*)"/i) || [])[1]) || 0;
      const bet = ceNum((at.match(/bet\s*=\s*"([^"]*)"/i) || [])[1]) || 0;
      if (!players[name]) { players[name] = { name, seat, stack: chips, dealer: dealer === "1", win, bet, pos: null, isHero: false, holeCards: [], shown: null, invested: bet, won: win, folded: false }; order.push(name); }
    }
    // actions par round (round no="0"=preflop,1=flop,2=turn,3=river selon iPoker)
    const ROUND_ST = { "0": "preflop", "1": "preflop", "2": "flop", "3": "turn", "4": "river" };
    // iPoker : type 0=Fold,1=SB,2=BB,3=Call,4=Check,5=Bet/Raise,7=All-in,23=Raise (variable) — best-effort
    const TYPE = { "0": "fold", "1": "sb", "2": "bb", "3": "call", "4": "check", "5": "raise", "6": "allin", "7": "allin", "8": "ante", "23": "raise" };
    let bbVal = ceNum(overrides.bb);
    const actionsByStreet = { preflop: [], flop: [], turn: [], river: [] };
    const boardByStreet = { flop: [], turn: [], river: [] };
    const rounds = block.split(/<round\b/i).slice(1);
    let pot = 0; const totalInvested = {};
    rounds.forEach(r => {
      const rno = (r.match(/^[^>]*no\s*=\s*"([^"]*)"/i) || [])[1] || "0";
      const st = ROUND_ST[rno] || "preflop";
      // cartes communautaires éventuelles (format suit-first iPoker « H7 S2 D3 »)
      const cm = r.match(/<cards[^>]*type\s*=\s*"(?:Flop|Turn|River)"[^>]*>([^<]+)<\/cards>/i) || r.match(/<cards(?![^>]*Pocket)[^>]*>([^<]+)<\/cards>/i);
      if (cm) { const cs = ceParseCardsAny(cm[1]); if (st === "flop") boardByStreet.flop = cs.slice(0, 3); if (st === "turn") boardByStreet.turn = (boardByStreet.flop || []).concat(cs).slice(0, 4); if (st === "river") boardByStreet.river = (boardByStreet.turn.length ? boardByStreet.turn : boardByStreet.flop).concat(cs).slice(0, 5); }
      const aRe = /<action\b([^>]*)\/?>/gi; let am2;
      while ((am2 = aRe.exec(r))) {
        const at = am2[1];
        const player = (at.match(/player\s*=\s*"([^"]*)"/i) || [])[1];
        const t = (at.match(/type\s*=\s*"([^"]*)"/i) || [])[1];
        const sum = ceNum((at.match(/sum\s*=\s*"([^"]*)"/i) || [])[1]) || 0;
        if (!player) continue;
        const type = TYPE[t] || "call";
        if (type === "bb" && bbVal == null) bbVal = sum;
        if (["sb", "bb", "ante"].includes(type)) { pot += sum; totalInvested[player] = (totalInvested[player] || 0) + sum; continue; }
        if (type === "fold" || type === "check") { if (type === "fold" && players[player]) players[player].folded = true; actionsByStreet[st].push({ actor: player, type, sum: null, _run: pot, isHero: false, label: type === "fold" ? "Fold" : "Check" }); continue; }
        pot += sum; totalInvested[player] = (totalInvested[player] || 0) + sum;
        actionsByStreet[st].push({ actor: player, type, sum, _run: pot, isHero: false });
      }
    });
    if (bbVal == null) { bbVal = 1; warnings.push("Big blind iPoker introuvable."); }
    const toBb = v => (v == null ? null : ceRound(v / bbVal, 2));
    // convertir amounts + pot par street (à partir des snapshots _run)
    const potByStreet = { preflop: 0, flop: 0, turn: 0, river: 0 };
    ["preflop", "flop", "turn", "river"].forEach((st, i) => {
      actionsByStreet[st].forEach(a => { if (a.sum != null) { a.amountBb = toBb(a.sum); a.addedBb = toBb(a.sum); a.label = ceActionLabel(a.type, a.amountBb, st); } a.potAfterBb = toBb(a._run); });
      const arr = actionsByStreet[st];
      potByStreet[st] = arr.length ? toBb(arr[arr.length - 1]._run) : (i === 0 ? toBb(pot) : potByStreet[["preflop", "flop", "turn"][i - 1]]);
    });
    const seatArr = order.map(n => players[n]);
    const btnIdx = seatArr.findIndex(s => s.dealer);
    if (btnIdx >= 0) ceAssignRing(seatArr, btnIdx); else warnings.push("Bouton iPoker non détecté.");
    seatArr.forEach(s => { s.stackBb = toBb(s.stack); s.investedBb = toBb(totalInvested[s.name] || s.invested); s.wonBb = toBb(s.won); if (!s.pos) s.pos = "?"; });
    // hero : le joueur avec des cartes (iPoker met les cartes du héros dans <cards type="Pocket" player="X">)
    const hcm = block.match(/<cards[^>]*type\s*=\s*"Pocket"[^>]*player\s*=\s*"([^"]*)"[^>]*>([^<]+)<\/cards>/i);
    let heroName = overrides.heroName || (hcm ? hcm[1] : null);
    let heroCards = overrides.heroCards ? ceParseCardsAny(overrides.heroCards) : (hcm ? ceParseCardsAny(hcm[2]) : []);
    const hero = seatArr.find(s => s.name === heroName) || seatArr[0];
    if (hero) { hero.isHero = true; hero.holeCards = heroCards; heroName = hero.name; }
    if (!heroCards.length) warnings.push("Cartes Hero iPoker non trouvées.");
    const board = boardByStreet.river.length ? boardByStreet.river : boardByStreet.turn.length ? boardByStreet.turn : boardByStreet.flop;
    const posByName = {}; seatArr.forEach(s => posByName[s.name] = s.pos);
    ["preflop", "flop", "turn", "river"].forEach(st => actionsByStreet[st].forEach(a => { a.pos = posByName[a.actor] || "?"; a.isHero = a.actor === heroName; }));
    const streetsAvailable = ["preflop"]; if (boardByStreet.flop.length) streetsAvailable.push("flop"); if (boardByStreet.turn.length) streetsAvailable.push("turn"); if (boardByStreet.river.length) streetsAvailable.push("river");
    const heroResultBb = hero ? ceRound((hero.wonBb || 0) - (hero.investedBb || 0), 2) : 0;
    return {
      valid: seatArr.length >= 2, parser: "xml",
      sourceSite: site, language: ceDetectLanguage(block), gameType,
      tournamentType: gameType === "tournament" ? ceDetectTournamentType(block) : null,
      format: "NLHE", buyIn: null, blinds: { sb: ceRound(bbVal / 2, 4), bb: ceRound(bbVal, 4) }, ante: 0,
      currency: "", tableSize: seatArr.length, maxSeats: seatArr.length,
      heroName, handId, dateStr, players: seatArr, positions: posByName,
      stacks: Object.fromEntries(seatArr.map(s => [s.name, s.stackBb])),
      heroCards: hero ? hero.holeCards : heroCards, heroPos: hero ? hero.pos : "?",
      board, boardByStreet, actionsByStreet, potByStreet,
      finalPotBb: toBb(pot), showdown: seatArr.some(s => s.shown) || !!hcm,
      winners: seatArr.filter(s => (s.won || 0) > 0).map(s => ({ name: s.name, amountBb: s.wonBb })),
      heroResultBb, streetsAvailable, rawText: block, parseWarnings: warnings,
    };
  } catch (e) {
    return { valid: false, parser: "xml", error: e.message || "Erreur XML iPoker", rawText: block, parseWarnings: [...warnings, "Exception XML: " + (e.message || e)], sourceSite: "iPoker" };
  }
}
/* ════════════════════════════════════════════════════════════
   DISPATCH NORMALISATION (texte vs XML) + découpe session
═══════════════════════════════════════════════════════════════ */
function ceIsXml(block) { return /<game\b|<round\b|<player\b[^>]*seat\s*=/i.test(block) && /<\/(game|round|session)>/i.test(block); }

function normalizeHand(block, idx = 0, overrides = {}) {
  try {
    if (ceIsXml(block)) return ceNormalizeXml(block, idx, overrides);
    return ceNormalizeText(block, idx, overrides);
  } catch (e) {
    return { valid: false, error: e.message || "Erreur de normalisation", rawText: block, parseWarnings: ["Exception: " + (e.message || e)], sourceSite: ceDetectSite(block) };
  }
}

function ceSplitHands(text) {
  if (!text || !text.trim()) return [];
  // XML : découper par <game>
  if (/<game\b/i.test(text) && /<\/game>/i.test(text)) {
    const parts = []; const re = /<game\b[\s\S]*?<\/game>/gi; let m;
    while ((m = re.exec(text))) parts.push(m[0]);
    if (parts.length) return parts;
  }
  const re = /(?=(?:PokerStars (?:Hand|Game|Zoom Hand)|Winamax Poker|GGPoker Hand|Game Hand #|Poker Hand #|#Game No|Hand\s*#\s*\d|Ignition Hand|Bovada Hand|PMU(?:\.fr)? Poker|partypoker|PartyPoker|\*\*\*\*\* Hand History|Unibet))/g;
  let parts = text.split(re).map(s => s.trim()).filter(s => s.length > 20);
  if (parts.length <= 1) parts = text.split(/\n\s*\n(?:\s*\n)*/).map(s => s.trim()).filter(s => s.split("\n").length >= 3);
  if (parts.length === 0 && text.trim().length > 20) parts = [text.trim()];
  return parts;
}

function parseSessionText(text) {
  const blocks = ceSplitHands(text);
  const hands = []; const errors = [];
  blocks.forEach((b, i) => {
    const h = normalizeHand(b, i);
    if (h && h.valid) hands.push(h); else errors.push({ i, error: h?.error || "main invalide", warnings: h?.parseWarnings });
  });
  const first = hands[0];
  return {
    hands, errors, count: hands.length,
    meta: {
      sourceSite: first?.sourceSite || ceDetectSite(text),
      gameType: first?.gameType || ceDetectGameType(text),
      tournamentType: first?.tournamentType || null,
      tableSize: first?.tableSize || 0,
      date: first?.dateStr || "",
    },
    single: hands.length === 1,
  };
}

/* ════════════════════════════════════════════════════════════
   RECONSTRUCTION — décision clé du Hero
═══════════════════════════════════════════════════════════════ */
function ceFindKeyDecision(norm) {
  // La décision clé = dernière action volontaire significative du Hero
  // sur la street la plus avancée où il a misé/relancé/payé un gros montant.
  const streets = ["river", "turn", "flop", "preflop"];
  for (const st of streets) {
    const acts = norm.actionsByStreet[st] || [];
    const heroActs = acts.filter(a => a.isHero && a.type !== "check");
    if (heroActs.length) {
      const last = heroActs[heroActs.length - 1];
      // ce que Hero affrontait : dernière mise adverse avant son action
      const myIdx = acts.indexOf(last);
      let facing = null;
      for (let i = myIdx - 1; i >= 0; i--) {
        if (!acts[i].isHero && ["bet", "raise", "allin"].includes(acts[i].type)) { facing = acts[i]; break; }
      }
      return { street: st, heroAction: last, facing, potBb: norm.potByStreet[st] };
    }
  }
  // sinon : 1ère action préflop du Hero
  const pf = (norm.actionsByStreet.preflop || []).find(a => a.isHero);
  return pf ? { street: "preflop", heroAction: pf, facing: null, potBb: norm.potByStreet.preflop } : null;
}

/* ════════════════════════════════════════════════════════════
   ANALYSE STRATÉGIQUE (heuristique déterministe, sans solver)
═══════════════════════════════════════════════════════════════ */
function analyzeHand(norm) {
  const mistakes = []; const goodPoints = []; const sizingNotes = []; const leakTags = new Set(); const mentalFlags = [];
  const heroPos = norm.heroPos;
  const heroName = norm.heroName;
  const isTour = norm.gameType === "tournament";
  const heroStackBb = (norm.players.find(p => p.isHero) || {}).stackBb || null;

  const pf = norm.actionsByStreet.preflop || [];
  const heroPf = pf.filter(a => a.isHero);
  const firstRaiseIdx = pf.findIndex(a => ["raise", "allin"].includes(a.type));
  const heroFirstPf = heroPf[0];

  /* ── PRÉFLOP ── */
  if (heroFirstPf) {
    const heroIdx = pf.indexOf(heroFirstPf);
    const raiseBeforeHero = pf.slice(0, heroIdx).some(a => ["raise", "allin"].includes(a.type));
    // Open-limp (call de la BB sans relance préalable, hors blindes fermant)
    if (heroFirstPf.type === "call" && !raiseBeforeHero && !ceIsBlind(heroPos)) {
      mistakes.push({ street: "preflop", severity: 2, tag: "preflop:open-limp", text: `Open-limp en ${heroPos} : tu entres en payant la BB sans relancer. Préfère open-raise ou fold.`, evLossBb: 0.6 });
      leakTags.add("preflop:open-limp");
    }
    // Limp behind
    if (heroFirstPf.type === "call" && !raiseBeforeHero && heroPos === "SB") {
      mistakes.push({ street: "preflop", severity: 1, tag: "preflop:sb-limp", text: "Limp en SB : complète rarement, préfère raise/fold pour ne pas jouer un pot OOP capé.", evLossBb: 0.3 });
      leakTags.add("preflop:sb-limp");
    }
    // Open size
    if (heroFirstPf.type === "raise" && !raiseBeforeHero && heroFirstPf.amountBb != null) {
      const sz = heroFirstPf.amountBb;
      if (!isTour && sz >= 4) { sizingNotes.push(`Open ${sz}bb en ${heroPos} : large pour du cash 6-max (standard 2–2.5bb).`); leakTags.add("sizing:open-large"); }
      if (sz <= 1.9 && sz > 0) { sizingNotes.push(`Open ${sz}bb : très petit, attention aux limpers/cold-calls qui dégradent ta réalisation d'équité.`); }
      goodPoints.push(`Ouverture proactive en ${heroPos} (line agressive saine).`);
    }
    // 3-bet/4-bet
    if (heroFirstPf.type === "raise" && raiseBeforeHero) {
      goodPoints.push("3-bet préflop : tu prends l'initiative plutôt que de cold-caller.");
    }
    // Cold call OOP face open
    if (heroFirstPf.type === "call" && raiseBeforeHero && ceIsEarly(heroPos)) {
      mistakes.push({ street: "preflop", severity: 1, tag: "preflop:cold-call-oop", text: `Cold-call en ${heroPos} face à une ouverture : position défavorable, envisage 3-bet ou fold.`, evLossBb: 0.4 });
      leakTags.add("preflop:cold-call-oop");
    }
  }

  /* ── Agresseur préflop & c-bet ── */
  const pfAggrName = firstRaiseIdx >= 0 ? lastPreflopRaiser(pf) : null;
  const heroIsPFA = pfAggrName === heroName;

  ["flop", "turn", "river"].forEach((st, sIdx) => {
    const acts = norm.actionsByStreet[st] || [];
    if (!acts.length) return;
    const heroActs = acts.filter(a => a.isHero);
    const potStart = sIdx === 0 ? norm.potByStreet.preflop : norm.potByStreet[["preflop", "flop", "turn"][sIdx]];

    heroActs.forEach(a => {
      // sizing des mises/relances Hero
      if (["bet", "raise", "allin"].includes(a.type) && a.amountBb != null && potStart > 0) {
        const frac = a.addedBb != null ? a.addedBb / potStart : a.amountBb / potStart;
        if (frac > 1.5) { sizingNotes.push(`${ceStreetFr(st)} : mise ${Math.round(frac * 100)}% du pot (surmise) — réserve aux situations très polarisées.`); leakTags.add("sizing:overbet"); }
        else if (frac < 0.25 && a.type === "bet") { sizingNotes.push(`${ceStreetFr(st)} : mise ${Math.round(frac * 100)}% du pot (très petite) — souvent trop faible pour protéger/valoriser.`); leakTags.add("sizing:tiny"); }
      }
      // hero call sur grosse street (river surtout)
      if (a.type === "call" && st === "river" && a.amountBb != null && potStart > 0 && a.amountBb / potStart > 0.7) {
        mistakes.push({ street: "river", severity: 2, tag: "river:big-call", text: `Call river de ${a.amountBb}bb dans un pot de ${ceRound(potStart, 1)}bb : assure-toi de battre assez de combos de value (sinon fold).`, evLossBb: 1.0 });
        leakTags.add("river:hero-call");
        mentalFlags.push({ flag: "curiosity-call", note: "Gros call river : vérifie que ce n'est pas un call de curiosité (frustration)." });
      }
    });

    // c-bet manqué (Hero PFA et check le flop OOP)
    if (heroIsPFA && st === "flop") {
      const heroFlop = heroActs[0];
      if (heroFlop && heroFlop.type === "check") {
        const checkedThrough = !acts.some(a => ["bet", "raise", "allin"].includes(a.type));
        if (!checkedThrough) { /* check-call/raise possible, neutre */ }
        else { sizingNotes.push("Flop checké en tant qu'agresseur préflop : ok sur certaines textures, mais ne néglige pas ta range de c-bet."); leakTags.add("postflop:no-cbet"); }
      } else if (heroFlop && ["bet"].includes(heroFlop.type)) {
        goodPoints.push("C-bet flop en tant qu'agresseur préflop : tu continues ton initiative.");
      }
    }

    // donk bet (Hero non-agresseur mise OOP en premier)
    if (!heroIsPFA && heroActs[0] && heroActs[0].type === "bet") {
      const firstAct = acts[0];
      if (firstAct && firstAct.isHero) { sizingNotes.push(`${ceStreetFr(st)} : donk-bet (tu mises avant l'agresseur préflop) — line à utiliser avec parcimonie.`); leakTags.add("postflop:donk"); }
    }
  });

  /* ── Discipline / résultat ── */
  if (norm.heroResultBb != null && norm.heroResultBb < -25) {
    mentalFlags.push({ flag: "big-loss", note: `Main perdue (${norm.heroResultBb}bb) : analyse à froid, évite le tilt et le revenge.` });
  }
  // Calling-station : Hero call ≥3 fois sans jamais relancer postflop
  const heroCalls = ["flop", "turn", "river"].reduce((n, st) => n + (norm.actionsByStreet[st] || []).filter(a => a.isHero && a.type === "call").length, 0);
  const heroAggr = ["flop", "turn", "river"].reduce((n, st) => n + (norm.actionsByStreet[st] || []).filter(a => a.isHero && ["bet", "raise", "allin"].includes(a.type)).length, 0);
  if (heroCalls >= 3 && heroAggr === 0) {
    mistakes.push({ street: "postflop", severity: 2, tag: "postflop:station", text: "Tu as payé sur plusieurs streets sans jamais prendre l'initiative : tendance call-station, équilibre avec des raises/folds.", evLossBb: 1.2 });
    leakTags.add("postflop:passive");
    mentalFlags.push({ flag: "station", note: "Profil passif sur cette main : agresse ou lâche, évite de payer par inertie." });
  }

  if (!mistakes.length && !sizingNotes.length) goodPoints.push("Aucune erreur majeure détectée sur cette main — line cohérente.");

  return { mistakes, goodPoints, sizingNotes, leakTags: [...leakTags], mentalFlags };
}

function lastPreflopRaiser(pf) {
  let n = null;
  pf.forEach(a => { if (["raise", "allin"].includes(a.type)) n = a.actor; });
  return n;
}
function ceStreetFr(st) { return { preflop: "Préflop", flop: "Flop", turn: "Turn", river: "River" }[st] || st; }

/* ════════════════════════════════════════════════════════════
   SCORING — déterministe (aucun aléatoire)
═══════════════════════════════════════════════════════════════ */
function scoreHand(norm, analysis) {
  const SEV = { 1: 4, 2: 9, 3: 18 };
  const STW = { preflop: 1.0, flop: 1.0, turn: 1.12, river: 1.28, postflop: 1.1 };
  let score = 100;
  const breakdown = [];
  analysis.mistakes.forEach(m => {
    const pen = Math.round((SEV[m.severity] || 5) * (STW[m.street] || 1));
    score -= pen; breakdown.push({ tag: m.tag, penalty: -pen });
  });
  // incohérences de sizing
  const sizingPen = Math.min(12, analysis.sizingNotes.length * 3);
  if (sizingPen) { score -= sizingPen; breakdown.push({ tag: "sizing", penalty: -sizingPen }); }
  // bonus points positifs
  const bonus = Math.min(8, analysis.goodPoints.length * 2);
  if (bonus) { score += bonus; breakdown.push({ tag: "good-points", penalty: +bonus }); }
  score = Math.max(0, Math.min(100, Math.round(score)));

  // sous-scores
  const sub = {
    preflop: subScore(analysis.mistakes, analysis.sizingNotes, "preflop"),
    postflop: subScore(analysis.mistakes, analysis.sizingNotes, ["flop", "turn", "river", "postflop"]),
    sizing: Math.max(0, 100 - analysis.sizingNotes.length * 18),
    discipline: Math.max(0, 100 - analysis.mentalFlags.length * 20),
  };

  // confiance de l'analyse
  let confidence = "high";
  const w = norm.parseWarnings || [];
  if (!norm.heroCards || norm.heroCards.length < 2) confidence = "low";
  else if (!norm.showdown) confidence = "medium";
  if (w.length >= 3) confidence = "low";
  if (norm.sourceSite === "Inconnu") confidence = confidence === "high" ? "medium" : confidence;

  return {
    score, breakdown, subScores: sub, confidence,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "E",
    label: score >= 85 ? "Excellent" : score >= 70 ? "Solide" : score >= 55 ? "Correct" : score >= 40 ? "À retravailler" : "Fuite importante",
    disclaimer: "EV estimée / analyse approximative — nécessite un solver complet pour une précision maximale.",
  };
}
function subScore(mistakes, sizing, streetKey) {
  const keys = Array.isArray(streetKey) ? streetKey : [streetKey];
  let s = 100;
  mistakes.forEach(m => { if (keys.includes(m.street)) s -= (m.severity || 1) * 9; });
  if (keys.includes("preflop")) { /* sizing préflop déjà dans notes génériques */ }
  return Math.max(0, Math.min(100, s));
}

/* ════════════════════════════════════════════════════════════
   RECOMMANDATIONS D'ENTRAÎNEMENT (leak → drill Trainer)
═══════════════════════════════════════════════════════════════ */
const CE_LEAK_LIB = {
  "preflop:open-limp":    { label: "Stop au limp — ranges d'open", drill: { trainerMode: "spot", patch: { spotTypes: ["RFI"] } }, hint: "Travaille tes ranges d'ouverture (RFI) par position." },
  "preflop:sb-limp":      { label: "SB : raise ou fold", drill: { trainerMode: "spot", patch: { spotTypes: ["RFI"] } }, hint: "Construis une stratégie SB raise-first-in." },
  "preflop:cold-call-oop":{ label: "Cold-call OOP → 3-bet/fold", drill: { trainerMode: "spot", patch: { spotTypes: ["Vs Open"] } }, hint: "Réponses face à une ouverture (3-bet vs call)." },
  "sizing:open-large":    { label: "Sizing d'ouverture", drill: { trainerMode: "spot", patch: { spotTypes: ["RFI"] } }, hint: "Calibre tes tailles d'open (2–2.5bb cash)." },
  "sizing:overbet":       { label: "Sizing postflop & overbets", drill: { trainerMode: "street" }, hint: "Quand surmiser (polarisation) vs sizing standard." },
  "sizing:tiny":          { label: "Sizing postflop (protection)", drill: { trainerMode: "street" }, hint: "Tailles de value/protection sur flop." },
  "postflop:no-cbet":     { label: "C-bet flop", drill: { trainerMode: "street", patch: { streetStart: "Flop" } }, hint: "Construis ta range de c-bet par texture." },
  "postflop:donk":        { label: "Lines de donk-bet", drill: { trainerMode: "street", patch: { streetStart: "Flop" } }, hint: "Quand donker est correct (rare)." },
  "postflop:station":     { label: "Discipline postflop", drill: { trainerMode: "full" }, hint: "Joue des mains complètes pour équilibrer call/raise/fold." },
  "postflop:passive":     { label: "Agressivité postflop", drill: { trainerMode: "full" }, hint: "Prends l'initiative au lieu de payer par inertie." },
  "river:hero-call":      { label: "Décisions river (bluff-catch)", drill: { trainerMode: "street", patch: { streetStart: "River" } }, hint: "Bluff-catch : pot odds vs combos de value." },
};
function buildTrainingRecos(leakTags) {
  const seen = new Set(); const recos = [];
  leakTags.forEach(t => { const e = CE_LEAK_LIB[t]; if (e && !seen.has(e.label)) { seen.add(e.label); recos.push({ leak: t, ...e }); } });
  if (!recos.length) recos.push({ leak: "review", label: "Continue ton review régulier", drill: { trainerMode: "spot" }, hint: "Pas de fuite flagrante ici — garde le rythme." });
  return recos;
}

/* ════════════════════════════════════════════════════════════
   SORTIES POUR L'UI
═══════════════════════════════════════════════════════════════ */
function buildTableData(norm) {
  return {
    seats: (norm.players || []).map(p => ({
      name: p.name, pos: p.pos, stackBb: p.stackBb, isHero: !!p.isHero,
      holeCards: (p.holeCards || []).map(ceCardStr), shown: (p.shown || []).map(ceCardStr),
      folded: !!p.folded, investedBb: p.investedBb, wonBb: p.wonBb, seat: p.seat,
    })),
    board: (norm.board || []).map(ceCardStr),
    boardByStreet: {
      flop: (norm.boardByStreet?.flop || []).map(ceCardStr),
      turn: (norm.boardByStreet?.turn || []).map(ceCardStr),
      river: (norm.boardByStreet?.river || []).map(ceCardStr),
    },
    potBb: norm.finalPotBb,
    potByStreet: norm.potByStreet,
    heroCards: (norm.heroCards || []).map(ceCardStr),
    heroPos: norm.heroPos,
    dealerSeat: (norm.players.find(p => p.pos === "BTN") || {}).seat ?? null,
    tableSize: norm.tableSize,
  };
}
function buildActionTimeline(norm) {
  const tl = []; let i = 0;
  ["preflop", "flop", "turn", "river"].forEach(st => {
    (norm.actionsByStreet[st] || []).forEach(a => {
      tl.push({
        idx: i++, street: st, streetFr: ceStreetFr(st),
        actor: a.actor, pos: a.pos, isHero: !!a.isHero,
        type: a.type, label: a.label, amountBb: a.amountBb,
        potAfterBb: a.potAfterBb, board: (a.board || []).map(ceCardStr),
      });
    });
  });
  return tl;
}
function buildLineSummary(norm) {
  const parts = [];
  const sd = norm.sourceSite, fmt = norm.gameType === "tournament" ? (norm.tournamentType || "MTT") : "Cash";
  parts.push(`${sd} · ${fmt} · ${norm.tableSize} joueurs`);
  if (norm.heroCards && norm.heroCards.length >= 2) parts.push(`Hero ${norm.heroPos} avec ${norm.heroCards.map(ceCardStr).join(" ")}`);
  else parts.push(`Hero ${norm.heroPos}`);
  ["preflop", "flop", "turn", "river"].forEach(st => {
    const ha = (norm.actionsByStreet[st] || []).filter(a => a.isHero);
    if (ha.length) parts.push(`${ceStreetFr(st)} : ${ha.map(a => a.label).join(", ")}`);
  });
  if (norm.heroResultBb != null) parts.push(`Résultat : ${norm.heroResultBb >= 0 ? "+" : ""}${norm.heroResultBb}bb`);
  return parts.join(" • ");
}

/* ── Point d'entrée principal pour l'UI ── */
function analyzeHandHistory(rawText, overrides = {}) {
  try {
    if (!rawText || String(rawText).trim().length < 15) {
      return { ok: false, error: "Texte trop court : colle une main complète.", parseWarnings: ["Entrée vide ou trop courte."] };
    }
    const blocks = ceSplitHands(rawText);
    const block = blocks[0] || rawText;
    const norm = normalizeHand(block, 0, overrides);
    if (!norm || !norm.valid) {
      return {
        ok: false,
        error: norm?.error || "Main non reconnue : format inconnu ou incomplet.",
        normalized: norm || null,
        parseWarnings: norm?.parseWarnings || ["Impossible de parser cette main."],
        sourceSite: norm?.sourceSite || ceDetectSite(rawText),
        canComplete: true, // l'UI peut proposer la complétion manuelle
      };
    }
    const keyDecision = ceFindKeyDecision(norm);
    const analysis = analyzeHand(norm);
    const scoreData = scoreHand(norm, analysis);
    const suggestedActions = buildSuggestedActions(norm, keyDecision, analysis);
    const trainingRecommendations = buildTrainingRecos(analysis.leakTags);

    return {
      ok: true,
      normalized: norm,
      meta: {
        sourceSite: norm.sourceSite, language: norm.language, gameType: norm.gameType,
        tournamentType: norm.tournamentType, format: norm.format, blinds: norm.blinds,
        ante: norm.ante, buyIn: norm.buyIn, tableSize: norm.tableSize, maxSeats: norm.maxSeats,
        heroName: norm.heroName, heroPos: norm.heroPos, handId: norm.handId, dateStr: norm.dateStr,
        showdown: norm.showdown, streetsAvailable: norm.streetsAvailable, currency: norm.currency,
      },
      tableData: buildTableData(norm),
      actionTimeline: buildActionTimeline(norm),
      analysisSummary: {
        lineSummary: buildLineSummary(norm),
        keyDecision: keyDecision ? {
          street: keyDecision.street, streetFr: ceStreetFr(keyDecision.street),
          heroAction: keyDecision.heroAction?.label,
          facing: keyDecision.facing ? `${keyDecision.facing.pos} ${keyDecision.facing.label}` : "Aucune mise à affronter",
          potBb: keyDecision.potBb,
        } : null,
        bestActionEstimate: suggestedActions[0]?.text || "Line globalement raisonnable.",
        heroResultBb: norm.heroResultBb,
      },
      scoreData,
      mistakes: analysis.mistakes,
      goodPoints: analysis.goodPoints,
      sizingNotes: analysis.sizingNotes,
      suggestedActions,
      leakTags: analysis.leakTags,
      trainingRecommendations,
      mentalFlags: analysis.mentalFlags,
      parseWarnings: norm.parseWarnings,
    };
  } catch (e) {
    return { ok: false, error: "Erreur moteur : " + (e.message || e), parseWarnings: ["Exception non gérée — la page reste stable."] };
  }
}

function buildSuggestedActions(norm, keyDecision, analysis) {
  const out = [];
  // recommandation principale basée sur la décision clé
  if (keyDecision && keyDecision.heroAction) {
    const ha = keyDecision.heroAction; const st = keyDecision.street;
    if (analysis.mistakes.find(m => m.street === st)) {
      out.push({ type: "improve", text: `Sur ${ceStreetFr(st)}, revois ta décision (${ha.label}) — voir les erreurs détectées.` });
    } else {
      out.push({ type: "confirm", text: `Ta décision clé (${ha.label} ${ceStreetFr(st)}) est défendable.` });
    }
  }
  // actions vers les modules
  out.push({ type: "trainer", text: "Drill ces spots dans l'Entraîneur", action: "go-trainer" });
  if (analysis.leakTags.length) out.push({ type: "leaks", text: "Voir mes fuites récurrentes", action: "go-leaks" });
  out.push({ type: "replayer", text: "Rejouer cette main dans le Replayer", action: "go-replayer" });
  return out;
}

/* ───────────────────────── Exports ───────────────────────── */
export {
  analyzeHandHistory,      // ← point d'entrée UI principal
  parseSessionText,        // ← multi-mains (historique / session)
  normalizeHand,           // ← une main → modèle normalisé
  analyzeHand, scoreHand,  // ← analyse / score isolés
  ceDetectSite, ceDetectGameType, ceDetectTournamentType, ceDetectLanguage,
  buildTableData, buildActionTimeline,
  ceParseCards, ceCardStr,
};
