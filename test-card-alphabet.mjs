/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — TOUTE CARTE ECRITE EN DUR APPARTIENT A L'ALPHABET DU MOTEUR.

   Defaut reellement constate : `src/data/content.js` portait deux cartes dont
   la couleur valait U+00E2 U+2122 U+00A0 — les trois octets UTF-8 de ♠ (E2 99
   A0) relus en cp1252 puis re-encodes. A l'ecran et dans un diff, ces trois
   caracteres se lisent « â™  » ; dans un message d'erreur passe par
   JSON.stringify, ils ressemblent a un pique parfaitement ordinaire. D'ou un
   `RangeError: cardToInt : carte invalide {"r":"A","s":"♠"}` que personne ne
   pouvait diagnostiquer a la lecture.

   Le defaut ne se declenchait qu'a l'ABATTAGE du spot concerne (« BB — Squeeze
   vs CO open + BTN call — AQs ») : autrement dit, presque jamais, et jamais
   pendant une revue. Une verification statique coute une milliseconde et le
   rend impossible.

   Ce test ne regarde PAS la logique : il regarde les octets. C'est le seul
   niveau auquel ce defaut-la existe.
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { cardToInt } from "./src/fullHandEngine.js";

const RANKS = "23456789TJQKA";
const SUITS = "\u2660\u2665\u2666\u2663";

let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

const pts = v => [...String(v)]
  .map(c => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"))
  .join(" ");

/* ══ 1 — LES CARTES ECRITES EN DUR DANS LES SOURCES ════════════════════════ */
const fichiers = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|jsx|mjs)$/.test(e.name)) fichiers.push(p);
  }
})("src");

const re = /\{\s*r\s*:\s*"([^"]*)"\s*,\s*s\s*:\s*"([^"]*)"\s*\}/g;
let cartes = 0;
for (const f of fichiers) {
  const src = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(src))) {
    cartes++;
    const [, r, s] = m;
    const ligne = src.slice(0, m.index).split("\n").length;
    ok([...r].length === 1 && RANKS.includes(r),
      `${f}:${ligne} — rang hors alphabet : ${JSON.stringify(r)} [${pts(r)}]`);
    ok([...s].length === 1 && SUITS.includes(s),
      `${f}:${ligne} — couleur hors alphabet : ${JSON.stringify(s)} [${pts(s)}]`);
  }
}
ok(cartes >= 90, `le balayage doit trouver les cartes des sources — ${cartes} trouvees`);

/* ══ 2 — cardToInt REFUSE CE QUI N'EST PAS UNE CARTE ═══════════════════════
   Piege paye : `String.indexOf` cherche une SOUS-CHAINE, et sur la chaine vide
   il rend 0. Un `{r:"",s:""}` devenait donc un 2 de pique SILENCIEUX — celui-la
   meme que le commentaire de `cardToInt` s'engage a ne jamais fabriquer. */
const refuse = (c, quoi) => {
  n++;
  try { cardToInt(c); fails.push(`${quoi} aurait du etre refuse`); }
  catch (e) { if (!(e instanceof RangeError)) fails.push(`${quoi} : ${e.name} au lieu de RangeError`); }
};
refuse({ r: "", s: "" }, "chaine vide (le 2 de pique silencieux)");
refuse({ r: "A", s: "" }, "couleur vide");
refuse({ r: "", s: "\u2660" }, "rang vide");
refuse({ r: "A", s: "\u00E2\u2122\u00A0" }, "pique double-encode (le defaut historique)");
refuse({ r: "A", s: "\u2660\uFE0F" }, "pique suivi d un selecteur de variante");
refuse({ r: "A", s: "\u2664" }, "pique blanc U+2664");
refuse({ r: "10", s: "\u2660" }, "rang a deux caracteres");
refuse(null, "carte nulle");
refuse({}, "objet vide");

/* Et il accepte les 52 vraies cartes, sans collision. */
const vus = new Set();
for (const r of RANKS) for (const s of SUITS) {
  const i = cardToInt({ r, s });
  n++;
  if (!(Number.isInteger(i) && i >= 0 && i <= 51)) fails.push(`${r}${s} → ${i} hors 0..51`);
  n++;
  if (vus.has(i)) fails.push(`${r}${s} → ${i} deja attribue`);
  vus.add(i);
}
ok(vus.size === 52, `les 52 cartes rendent 52 entiers distincts — ${vus.size}`);

/* ══ 3 — LE MESSAGE D'ERREUR DOIT PERMETTRE D'AGIR ═════════════════════════
   « carte invalide {"r":"A","s":"♠"} » ne le permettait pas : les caracteres
   ont l air justes a la lecture, et le defaut est qu ils ne le sont pas. */
try { cardToInt({ r: "A", s: "\u00E2\u2122\u00A0" }); }
catch (e) {
  ok(/U\+00E2/.test(e.message), `le message publie les points de code — recu : ${e.message}`);
}

if (fails.length) {
  console.error(`\n❌ ${fails.length} echec(s) sur ${n} assertions :`);
  fails.forEach(f => console.error("  · " + f));
  process.exit(1);
}
console.log(`✅ alphabet des cartes — ${cartes} cartes de source balayees, ${n} assertions OK`);
