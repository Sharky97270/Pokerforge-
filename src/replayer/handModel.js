/* ═══════════════════════════════════════════════════════════════
   PokerForge — Replayer : MODÈLE NORMALISÉ + PARSER ÉVÉNEMENTIEL
   (Phase A du refonte Replayer)

   Une main = une liste d'ÉVÉNEMENTS ATOMIQUES ordonnés (blinds, antes,
   distributions, actions) — le vrai timeline de rejeu. Toutes les valeurs
   monétaires sont normalisées en big blinds (bb).

   Ce module est PUR (aucune dépendance React) → utilisable dans le navigateur
   ET dans les tests Node (test-replayer-state-engine.mjs).

   NormalizedHand {
     id, handId, room, gameType('cash'|'mtt'), format, tableSize,
     blinds:{ sb, bb, ante }, bbSize, currency, buttonSeat, heroId,
     players:[{ id, name, seat, pos, stackStart, isHero, hole, shown, stats }],
     board:{ flop:[3], turn:[1], river:[1] },
     events:[ Event ], showdown:{shownHoles,winners}|null, result:{heroBb},
     raw, valid, error
   }
   Event {
     order, street, type, playerId?, amount? (bb, incrémental),
     toAmount? (bb, total street), cards?, label
   }
═══════════════════════════════════════════════════════════════ */
import { POSITIONS_BY_SIZE } from "../data/content.js";

/* ── Cartes ── */
const PF_SUIT = { s:"♠", h:"♥", d:"♦", c:"♣", "♠":"♠", "♥":"♥", "♦":"♦", "♣":"♣" };
export function pfParseCard(tok){
  if(!tok) return null;
  let t = String(tok).trim().replace(/^10/,"T");
  const r = (t[0]||"").toUpperCase();
  const sc = t[1]||"";
  const s = PF_SUIT[sc] || PF_SUIT[sc.toLowerCase()];
  if(!"23456789TJQKA".includes(r) || !s) return null;
  return { r, s };
}
export function pfParseCards(str){
  if(!str) return [];
  const m = String(str).replace(/[[\]]/g," ").match(/(?:10|[2-9TJQKAtjqka])[shdc♠♥♦♣]/g) || [];
  return m.map(pfParseCard).filter(Boolean);
}

/* ── Room / découpage ── */
export function pfDetectSite(t){
  if(/winamax/i.test(t)) return "Winamax";
  if(/pokerstars/i.test(t)) return "PokerStars";
  if(/gg ?poker|natural8/i.test(t)) return "GGPoker";
  if(/888 ?poker|888poker|pacific/i.test(t)) return "888";
  if(/\bpmu\b/i.test(t)) return "PMU";
  return "Inconnu";
}
export function detectGameType(txt){
  const t = txt.toLowerCase();
  if(t.includes("tournament")||t.includes("tournoi")||t.includes("level")||t.includes("ante")||t.includes("bounty")||t.includes("buyin")) return "mtt";
  return "cash";
}
/* Découpe un fichier en blocs-mains (en-têtes connus, sinon lignes vides) */
export function pfSplitHands(text){
  if(!text || !text.trim()) return [];
  // NB : les en-têtes de main commencent en DÉBUT DE LIGNE (flag m + ^). Sans
  // l'ancre, l'alternative générique « Hand #\d » coupe AUSSI à l'intérieur de
  // « PokerStars Hand #… », ce qui amputait le préfixe room (→ room "Inconnu").
  const re = /(?=^(?:PokerStars (?:Hand|Game|Zoom Hand)|Winamax Poker|GGPoker Hand|Game Hand #|Poker Hand #|#Game No|Hand\s*#\s*\d|Ignition Hand|Bovada Hand|PMU(?:\.fr)? Poker))/gm;
  let parts = text.split(re).map(s=>s.trim()).filter(s=>s.length>20);
  if(parts.length<=1){
    parts = text.split(/\n\s*\n(?:\s*\n)*/).map(s=>s.trim()).filter(s=>s.split("\n").length>=3);
  }
  if(parts.length===0 && text.trim().length>20) parts = [text.trim()];
  return parts;
}

/* ── Positions ── */
export function pfNormPos(p){
  const u = (p||"").toUpperCase().replace(/\s/g,"");
  if(["BTN","BU","BUTTON","D"].includes(u)) return "BTN";
  if(["SB"].includes(u)) return "SB";
  if(["BB"].includes(u)) return "BB";
  if(["CO"].includes(u)) return "CO";
  if(["HJ","MP2"].includes(u)) return "HJ";
  if(["LJ","MP","MP1"].includes(u)) return "LJ";
  if(["UTG","UTG+1","UTG+2","EP","EP1"].includes(u)) return "UTG";
  return null;
}
/* Assigne des positions par anneau (size-aware via POSITIONS_BY_SIZE). */
export function pfRingPositions(seats, btnIdx){
  const n = seats.length;
  if(n<2) return;
  if(n===2){ seats[btnIdx].pos="SB"; seats[(btnIdx+1)%n].pos="BB"; return; }
  seats[btnIdx].pos = "BTN";
  const base = POSITIONS_BY_SIZE[n];
  let order;
  if(base && base.length===n){
    const bi = base.indexOf("BTN");
    order = [];
    for(let k=1;k<n;k++) order.push(base[(bi+k)%n]);
  } else {
    order = ["SB","BB","UTG","UTG+1","MP","LJ","HJ","CO"];
  }
  for(let k=1;k<n;k++){ seats[(btnIdx+k)%n].pos = order[k-1] || "HJ"; }
}

/* ── util bb ── */
const rb = v => Math.round(v*100)/100;

/* ═══════════════════════════════════════════════════════════════
   parseHand(block, idx) → NormalizedHand (flux d'événements)
═══════════════════════════════════════════════════════════════ */
export function parseHand(block, idx=0){
  try{
    const room = pfDetectSite(block);
    const gameType = detectGameType(block);
    const lines = block.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);

    const idm = block.match(/(?:Hand|Game|No)\s*[:#]?\s*([0-9]{4,})/i) || block.match(/#\s*([0-9]{4,})/);
    const handId = idm ? idm[1] : String(100000+idx);
    const tourM = block.match(/Tournament\s*#?\s*([0-9]{5,})/i);
    const tournamentId = tourM ? tourM[1] : null;
    const dm = block.match(/(\d{4}\/\d{2}\/\d{2}[^\n]*\d{2}:\d{2})/) || block.match(/(\d{2}\/\d{2}\/\d{4}[^\n]*\d{2}:\d{2})/) || block.match(/(\d{4}\/\d{2}\/\d{2})/);
    const dateStr = dm ? dm[1].slice(0,19) : "";

    // big blind (conversion bb). Si HH déjà en bb → bbSize=1.
    const bbUnit = /\bbb\b/.test(block);
    let bbSize = 1;
    const bbm = block.match(/[Bb]ig blind[^0-9]*([0-9.]+)/) || block.match(/\([0-9.]+\s*[€$£]?\s*\/\s*([0-9.]+)/) || block.match(/\/\s*([0-9.]+)\s*[€$£]?\s*\)/);
    if(bbm && !bbUnit) bbSize = parseFloat(bbm[1]) || 1;
    const sbm0 = block.match(/[Ss]mall blind[^0-9]*([0-9.]+)/);
    const sbSize = bbUnit ? 0.5 : (sbm0 ? parseFloat(sbm0[1]) : bbSize/2);
    const anteM = block.match(/\bante[^0-9]*([0-9.]+)/i);
    const anteSize = anteM ? (bbUnit ? parseFloat(anteM[1]) : parseFloat(anteM[1])/bbSize) : 0;
    const toBb = v => (bbUnit ? rb(v) : rb(v / (bbSize||1)));
    const currency = (block.match(/[€$£]/)||[null])[0] || (bbUnit ? "bb" : "");

    // ── Joueurs ──
    const players = {}; const order = [];
    const seatRe = /Seat\s+(\d+):\s+(.+?)\s+\(\s*[€$£]?\s*([0-9][0-9.,]*)/g; let sm;
    while((sm = seatRe.exec(block))){
      const name = sm[2].trim();
      const stack = parseFloat(sm[3].replace(/,/g,"")) || 100;
      if(!players[name]){
        players[name] = { id:"s"+sm[1], name, seat:parseInt(sm[1]), stackStart:toBb(stack), pos:null, isHero:false, hole:[], shown:null };
        order.push(name);
      }
    }
    const btnm = block.match(/Seat\s+#?(\d+)\s+is the button/i);
    const buttonSeat = btnm ? parseInt(btnm[1]) : null;

    // Hero + cartes
    let heroName = null;
    const dealt = block.match(/Dealt to\s+(.+?)\s+\[([^\]]+)\]/i);
    if(dealt) heroName = dealt[1].trim();
    const heroTok = block.match(/(\S[^\n(]*?)\s*\(Hero\)/);
    if(!heroName && heroTok) heroName = heroTok[1].trim();
    const heroCards = dealt ? pfParseCards(dealt[2]).slice(0,2) : [];

    function ensurePlayer(rawTok){
      let name = rawTok.replace(/\(Hero\)/i,"").replace(/:\s*$/,"").trim();
      if(!players[name]){
        players[name] = { id:"x"+(order.length+1), name, seat:order.length+1, stackStart:100, pos:null, isHero:false, hole:[], shown:null };
        order.push(name);
      }
      return name;
    }

    // ── Construction du flux d'événements ──
    const events = [];
    let ordr = 0;
    const pushEv = e => { events.push({ order:ordr++, ...e }); };
    const committed = {}; // suivi mise street courante (bb) pour calcul incrémental
    const cOf = n => committed[n] || 0;

    let street = "preflop";
    const board = { flop:[], turn:[], river:[] };
    let dealtHole = false;
    const shownHoles = {};
    const winners = [];
    let inShowdown = false;

    const actorRe = /^(.+?)\s+(folds?|calls?|checks?|bets?|raises?|posts?|shoves?|all-in|is all-in)\b(.*)$/i;
    const postRe  = /^(.+?):?\s+posts\s+(?:the\s+)?(small blind|big blind|ante|small & big blinds)\s*[€$£]?\s*([0-9.]+)/i;

    function streetMarker(ln){
      const fl = ln.match(/(?:\*\*\*\s*)?FLOP(?:\s*\*\*\*)?\s*\[([^\]]+)\]/i);
      const tl = ln.match(/(?:\*\*\*\s*)?TURN(?:\s*\*\*\*)?\s.*\[([^\]]+)\]\s*$/i);
      const rl = ln.match(/(?:\*\*\*\s*)?RIVER(?:\s*\*\*\*)?\s.*\[([^\]]+)\]\s*$/i);
      if(fl && !/TURN|RIVER/i.test(ln)){
        const cs = pfParseCards(fl[1]).slice(0,3);
        board.flop = cs; street = "flop";
        pushEv({ street, type:"deal-flop", cards:cs, label:"Flop" });
        return true;
      }
      if(tl && /TURN/i.test(ln)){
        const cs = pfParseCards(tl[1]).slice(-1);
        board.turn = cs; street = "turn";
        pushEv({ street, type:"deal-turn", cards:cs, label:"Turn" });
        return true;
      }
      if(rl && /RIVER/i.test(ln)){
        const cs = pfParseCards(rl[1]).slice(-1);
        board.river = cs; street = "river";
        pushEv({ street, type:"deal-river", cards:cs, label:"River" });
        return true;
      }
      return false;
    }

    for(const ln of lines){
      if(/\*\*\*\s*(HOLE CARDS|PRE-?FLOP)/i.test(ln)){ street="preflop"; continue; }
      if(streetMarker(ln)) continue;
      if(/\*\*\*\s*SHOW ?DOWN/i.test(ln)){ inShowdown=true; continue; }
      if(/\*\*\*\s*SUMMARY/i.test(ln)) break;

      // shows / mucks (peut arriver au showdown)
      const showM = ln.match(/^(?:Seat\s+\d+:\s+)?(.+?)\s+(?:shows?|showed|mucks and shows?)\s+\[([^\]]+)\]/i);
      if(showM){
        const nm = showM[1].replace(/\(.*?\)/g,"").replace(/:$/,"").trim();
        const cs = pfParseCards(showM[2]).slice(0,2);
        if(cs.length>=2 && players[nm]){ shownHoles[players[nm].id] = cs; players[nm].shown = cs; }
        continue;
      }
      // collected / won
      const colM = ln.match(/^(.+?)\s+(?:collected|won|gagne[a-z]*)\s+[€$£]?\s*([0-9.,]+)/i);
      if(colM){
        const nm = colM[1].replace(/\(.*?\)/g,"").replace(/:$/,"").trim();
        if(players[nm]) winners.push({ id:players[nm].id, amount:toBb(parseFloat(colM[2].replace(/,/g,""))) });
        continue;
      }
      // uncalled bet returned
      const uncM = ln.match(/Uncalled bet\s*\(?[€$£]?\s*([0-9.,]+)\)?\s*returned to\s+(.+?)\s*$/i);
      if(uncM){
        const nm = uncM[2].replace(/:$/,"").trim();
        if(players[nm]){
          const amt = toBb(parseFloat(uncM[1].replace(/,/g,"")));
          pushEv({ street, type:"uncalled-return", playerId:players[nm].id, amount:amt, label:"Retour mise" });
          committed[nm] = Math.max(0, cOf(nm) - amt);
        }
        continue;
      }

      // posts (blinds / ante)
      const pm = ln.match(postRe);
      if(pm){
        const nm = ensurePlayer(pm[1]);
        const kind = pm[2].toLowerCase();
        const val = toBb(parseFloat(pm[3]));
        if(kind.startsWith("ante")){
          pushEv({ street:"preflop", type:"post-ante", playerId:players[nm].id, amount:val, label:"Ante" });
        } else if(kind.startsWith("small")){
          pushEv({ street:"preflop", type:"post-sb", playerId:players[nm].id, amount:val, toAmount:val, label:"SB" });
          committed[nm] = val;
        } else if(kind.startsWith("big")){
          pushEv({ street:"preflop", type:"post-bb", playerId:players[nm].id, amount:val, toAmount:val, label:"BB" });
          committed[nm] = val;
        }
        continue;
      }

      // deal-hole (une fois, avant la 1re action préflop)
      const am = ln.match(actorRe);
      if(am){
        const actorTok = am[1].trim();
        if(/^(Dealt|Board|Total pot|Seat \d|Uncalled|\*\*\*)/i.test(actorTok)) continue;
        const verb = am[2].toLowerCase();
        if(/^posts?$/.test(verb)) continue; // déjà traité
        const rest = am[3] || "";
        const nm = ensurePlayer(actorTok);
        if(heroName && nm===heroName){ players[nm].isHero=true; }
        if(/\(hero\)/i.test(ln)){ players[nm].isHero=true; heroName=nm; }

        if(!dealtHole){
          dealtHole = true;
          pushEv({ street:"preflop", type:"deal-hole", label:"Distribution" });
        }

        // montants : "raises X to Y" → Y ; "calls X"/"bets X" → X
        let toAmount=null, num=null;
        const toM = rest.match(/to\s+[€$£]?\s*([0-9.,]+)/i);
        const numM = rest.match(/[€$£]?\s*([0-9][0-9.,]*)/);
        if(toM) toAmount = toBb(parseFloat(toM[1].replace(/,/g,"")));
        if(numM) num = toBb(parseFloat(numM[1].replace(/,/g,"")));

        const pid = players[nm].id;
        if(/fold/.test(verb)){
          pushEv({ street, type:"fold", playerId:pid, label:"Fold" });
        } else if(/check/.test(verb)){
          pushEv({ street, type:"check", playerId:pid, label:"Check" });
        } else if(/call/.test(verb)){
          const inc = num!=null ? num : 0;
          committed[nm] = cOf(nm) + inc;
          pushEv({ street, type:"call", playerId:pid, amount:inc, toAmount:committed[nm], label:`Call ${fmtBb(inc)}` });
        } else if(/raise/.test(verb)){
          const total = toAmount!=null ? toAmount : (num!=null ? cOf(nm)+num : cOf(nm));
          const inc = rb(total - cOf(nm));
          committed[nm] = total;
          pushEv({ street, type:"raise", playerId:pid, amount:inc, toAmount:total, label:`Raise ${fmtBb(total)}` });
        } else if(/bet/.test(verb)){
          const inc = num!=null ? num : 0;
          committed[nm] = cOf(nm) + inc;
          pushEv({ street, type:"bet", playerId:pid, amount:inc, toAmount:committed[nm], label:`Bet ${fmtBb(inc)}` });
        } else if(/shove|all-?in/.test(verb)){
          const total = toAmount!=null ? toAmount : (num!=null ? num : cOf(nm));
          const inc = rb(Math.max(0,total - cOf(nm)) || (num||0));
          committed[nm] = cOf(nm) + inc;
          pushEv({ street, type:"allin", playerId:pid, amount:inc, toAmount:committed[nm], label:`All-in ${fmtBb(committed[nm])}` });
        }
      }
    }

    // ── Seats finaux + positions ──
    const seatArr = order.map(n=>players[n]);
    if(buttonSeat!=null){
      const bi = seatArr.findIndex(s=>s.seat===buttonSeat);
      if(bi>=0 && seatArr.some(s=>!s.pos)) pfRingPositions(seatArr, bi);
    }
    if(buttonSeat!=null){ const bs=seatArr.find(s=>s.seat===buttonSeat); if(bs && seatArr.length>2) bs.pos="BTN"; }
    // blinds postées autoritaires sur SB/BB
    const blindRe = /^(.+?):?\s+posts (small|big) blind/gim; let bmm;
    while((bmm = blindRe.exec(block))){
      const nm = bmm[1].replace(/:$/,"").trim();
      const sx = seatArr.find(x=>x.name===nm);
      if(sx) sx.pos = bmm[2].toLowerCase()==="small" ? "SB" : "BB";
    }
    seatArr.forEach(s=>{
      if(!s.pos) s.pos = pfNormPos(s.name) || "BB";
      if(heroName && s.name===heroName){ s.isHero=true; s.hole=heroCards; }
      s.stats = { vpip:20+((s.name.length*7)%18), pfr:14+((s.name.length*5)%14), threeBet:5+((s.name.length*3)%8) };
    });
    let hero = seatArr.find(s=>s.isHero);
    if(!hero && seatArr.length){ hero = seatArr[0]; hero.isHero=true; hero.hole=heroCards; }

    const hasShowdown = /\*\*\*\s*SHOW ?DOWN/i.test(block);
    if(hasShowdown) pushEv({ street:"river", type:"showdown", label:"Showdown" });
    pushEv({ street:"river", type:"end", label:"Fin" });

    if(events.filter(e=>["fold","check","call","bet","raise","allin"].includes(e.type)).length===0){
      return { valid:false, error:"Aucune action détectée", room, handId, raw:block };
    }

    // ── Résultat Hero (bb) pour la bibliothèque ──
    const heroId = hero ? hero.id : null;
    const heroActs = events.filter(e=>e.playerId===heroId);
    const heroInvested = heroActs.reduce((a,e)=>a + (["call","bet","raise","allin","post-sb","post-bb","post-ante"].includes(e.type) ? (e.amount||0) : 0), 0)
      - heroActs.filter(e=>e.type==="uncalled-return").reduce((a,e)=>a+(e.amount||0),0);
    const heroWon = winners.filter(w=>w.id===heroId).reduce((a,w)=>a+w.amount,0);
    const resultBb = rb(heroWon - Math.max(0,heroInvested));

    // villain principal (agresseur ≠ hero)
    const heroPos = hero ? hero.pos : "?";
    const aggrEv = events.find(e=>["raise","bet","allin"].includes(e.type) && e.playerId!==heroId);
    let vil = aggrEv ? seatArr.find(s=>s.id===aggrEv.playerId) : null;
    if(!vil || vil.pos===heroPos) vil = seatArr.find(s=>!s.isHero && s.pos!==heroPos) || seatArr.find(s=>!s.isHero);
    const vilPos = vil ? vil.pos : "?";
    const lastHeroBet = [...heroActs].reverse().find(e=>["fold","check","call","bet","raise","allin"].includes(e.type));

    return {
      id:"H"+idx+"_"+handId, valid:true, error:null,
      room, gameType, format:`${room} ${gameType==="mtt"?"MTT":"Cash"}`,
      handId, tournamentId, dateStr,
      blinds:{ sb:rb(bbUnit?0.5:toBb(sbSize)), bb:1, ante:rb(anteSize) }, bbSize, currency,
      buttonSeat, heroId,
      players:seatArr, tableSize:seatArr.length,
      board, events, showdown: hasShowdown ? { shownHoles, winners } : (winners.length ? { shownHoles, winners } : null),
      result:{ heroBb:resultBb },
      // champs bibliothèque / résumé (compat)
      heroCards, heroPos, vilPos, spot:`${heroPos} vs ${vilPos}`,
      keyAction: lastHeroBet ? lastHeroBet.label : "—",
      resultBb,
      raw:block,
    };
  } catch(e){
    return { valid:false, error:e.message||"Parse error", raw:block, handId:String(idx) };
  }
}

function fmtBb(v){ if(v==null) return ""; const n=rb(v); return (Number.isInteger(n)?n:n.toFixed(1))+"bb"; }

/* Clé d'unicité d'une main (déduplication §32). */
export function handKey(h){
  return `${h.room||"?"}|${h.tournamentId||""}|${h.handId||""}`;
}

export const REPLAYER_MAX_PER_LOT = 1500; // §4 — limite par lot de traitement

/* ═══════════════════════════════════════════════════════════════
   parseSession(text, opts) → session normalisée
   • déduplication (§32) par handKey
   • découpage en lots de `maxPerLot` mains (§4)
   • comptes de validation (§6/§31) : detected / imported / duplicates / incomplete
   Rétro-compat : `hands` = 1er lot, `count` = taille 1er lot, `errors`, `site`.
═══════════════════════════════════════════════════════════════ */
export function parseSession(text, opts={}){
  const maxPerLot = opts.maxPerLot || REPLAYER_MAX_PER_LOT;
  const dedup = opts.dedup !== false;
  const blocks = pfSplitHands(text);
  const parsed = []; const errors = [];
  blocks.forEach((b,i)=>{
    const h = parseHand(b,i);
    if(h && h.valid) parsed.push(h);
    else errors.push({ i, error:h?.error||"invalide" });
  });

  // Déduplication
  let duplicates = 0;
  const seen = new Set(); const unique = [];
  for(const h of parsed){
    const key = handKey(h);
    if(dedup && seen.has(key)){ duplicates++; continue; }
    seen.add(key); unique.push(h);
  }

  // Découpage en lots (§4)
  const lots = [];
  for(let i=0;i<unique.length;i+=maxPerLot) lots.push(unique.slice(i,i+maxPerLot));

  const room = unique[0]?.room || pfDetectSite(text);
  const gameType = unique[0]?.gameType || detectGameType(text);
  return {
    hands: lots[0] || [],            // 1er lot actif (rétro-compat)
    lots,                            // tous les lots (§4)
    lotCount: lots.length,
    errors, duplicates,
    detected: blocks.length,        // blocs détectés
    imported: unique.length,        // mains valides & dédupliquées
    incomplete: errors.length,      // mains invalides/incomplètes
    total: unique.length,
    count: (lots[0] || []).length,
    room, site:room, gameType, format:`${room} ${gameType==="mtt"?"MTT":"Cash"}`,
    date: unique[0]?.dateStr || "",
    players: unique[0]?.tableSize || 0,
    single: unique.length===1,
    maxPerLot,
  };
}
