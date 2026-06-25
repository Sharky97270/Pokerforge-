'use strict';
const { solve, equity, best7, parseCards, ALL169 } = require("./solver.js");
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };

console.log("\n— Évaluateur 7 cartes —");
const royal = best7(parseCards("As Ks Qs Js Ts 2h 3d"));
const pairAces = best7(parseCards("Ah Ad 9c 4s 2h 7d Tc"));
ok(royal > pairAces, "quinte flush royale > paire d'As");
ok(best7(parseCards("Ah Ad Ac Ks Kd 2h 3d")) > best7(parseCards("Ah Ad Ac 9s 8d 2h 3d")), "full > brelan");

console.log("\n— Équité Monte-Carlo —");
const vrAll = ALL169.flatMap(c => {
  const out = []; const a = c.hi, b = c.lo;
  for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
    if (a === b) { if (s1 >= s2) continue; } else { if (c.suited && s1 !== s2) continue; if (!c.suited && s1 === s2) continue; }
    out.push([(a - 2) * 4 + s1, (b - 2) * 4 + s2]);
  } return out;
}).filter(v => !parseCards("As Ad").includes(v[0]) && !parseCards("As Ad").includes(v[1]));
const eqAA = Math.round(equity(parseCards("As Ad"), [], vrAll, 4000) * 100);
console.log("  AA vs range complète ≈", eqAA + "%");
ok(eqAA >= 80 && eqAA <= 90, "AA preflop ≈ 85% (80-90)");
const eqSet = Math.round(equity(parseCards("Ks Kh"), parseCards("Kd 7h 2c"), vrAll.slice(0, 200), 2000) * 100);
console.log("  Set de K sur K72 ≈", eqSet + "%");
ok(eqSet >= 88, "set top sur board sec ≈ très haute équité");

console.log("\n— Décisions solve() —");
const preBTN = solve({ heroPos: "BTN", vilPos: "BB", heroStack: 100, vilStack: 100, potBb: 1.5, street: "Preflop", heroCards: "As Kh", mode: "gto" });
ok(preBTN.ok && /Open/.test(preBTN.reco.label), "AKo BTN → Open (" + preBTN.reco.label + ")");
ok(preBTN.engine === "pro" && preBTN.estimated === false, "engine pro, estimated false");
const preUTGtrash = solve({ heroPos: "UTG", vilPos: "BB", heroStack: 100, vilStack: 100, potBb: 1.5, street: "Preflop", heroCards: "7h 2c", mode: "gto" });
ok(/Fold/.test(preUTGtrash.reco.label), "72o UTG → Fold (" + preUTGtrash.reco.label + ")");
const shortJam = solve({ heroPos: "SB", vilPos: "BB", heroStack: 10, vilStack: 10, potBb: 1.5, street: "Preflop", heroCards: "Ah Tc", mode: "gto" });
ok(/Jam|All-in/.test(shortJam.reco.label) || shortJam.reco.action === "All-in", "ATo 10bb SB → push (" + shortJam.reco.label + ")");
const flopValue = solve({ heroPos: "BTN", vilPos: "BB", heroStack: 100, vilStack: 100, potBb: 6, street: "Flop", board: "Ks 7h 2c", heroCards: "Ks Kh", mode: "gto" });
console.log("  Set sur K72, équité =", flopValue.spot.equity + "% → " + flopValue.reco.label);
ok(flopValue.reco.action === "Bet", "set top flop → Bet value");
const impossible = solve({ heroPos: "BTN", vilPos: "BTN", street: "Preflop", heroStack: 100 });
ok(impossible.ok === false, "positions identiques → impossible géré");

console.log(`\nRÉSULTAT : ${pass} OK / ${fail} KO\n`);
process.exit(fail ? 1 : 0);
