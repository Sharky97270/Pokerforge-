const fs=require('fs');
const LF=String.fromCharCode(10),CRLF=String.fromCharCode(13,10);
const repFile=(p,pairs)=>{let s=fs.readFileSync(p,'utf8');
  for(const [a,b] of pairs){let d=false;
    for(const [pat,r2] of [[a,b],[a.split(LF).join(CRLF),b.split(LF).join(CRLF)]]){if(s.includes(pat)){s=s.replace(pat,r2);d=true;break;}}
    if(!d){console.error('MISS ['+p+'] : '+a.slice(0,80));process.exit(1);}}
  fs.writeFileSync(p,s);};

repFile('src/sizing/strategyExtract.js',[
  [`export function nodeStrategyFor(strategy, path, handClass) {
  const node = strategy && strategy.nodes ? strategy.nodes[pathKey(path)] : null;
  if (!node) return null;
  if (handClass && node.byClass && node.byClass[handClass]) {
    return { freqs: node.byClass[handClass], source: "hand-class", node };
  }
  return {
    freqs: node.aggregate, source: "range-aggregate", node,
    note: handClass ? \`\${handClass} absente de la range solvée — fréquences de la range entière\` : null,
  };
}`,
   `export function nodeStrategyFor(strategy, path, handClass) {
  const node = strategy && strategy.nodes ? strategy.nodes[pathKey(path)] : null;
  if (!node) return null;
  const ev = node.ev && node.ev.available ? node.ev : null;

  /* ── L'EV SUIT LA MÊME SOURCE QUE LA FRÉQUENCE ────────────────────────────
     Si l'on lit les fréquences de la classe de main, on lit AUSSI son EV. Les
     mélanger — la fréquence d'AKs et l'EV de la range — donnerait un couple qui
     ne décrit aucune situation réelle.

     Et la nuance compte : l'EV agrégée répond à « que vaudrait cette action si
     TOUTE la range la prenait », ce qui n'est pas ce que fait la stratégie. La
     grandeur qu'un joueur peut lire est celle de SA main. \`evSource\` le dit,
     et \`evIsRangeWide\` permet à l'écran de le nuancer plutôt que de le taire. */
  if (handClass && node.byClass && node.byClass[handClass]) {
    const evs = ev && ev.byClass && ev.byClass[handClass] ? ev.byClass[handClass] : null;
    return {
      freqs: node.byClass[handClass], source: "hand-class", node,
      evs, evSource: evs ? "hand-class" : null,
      evExact: evs ? !!ev.exact : null,
      evNote: evs ? null : (node.ev ? node.ev.reason || "EV non calculée pour cette classe" : "EV non extraite"),
    };
  }
  const evs = ev ? ev.byAction : null;
  return {
    freqs: node.aggregate, source: "range-aggregate", node,
    evs, evSource: evs ? "range-aggregate" : null,
    evExact: evs ? !!ev.exact : null,
    evIsRangeWide: !!evs,
    evNote: evs
      ? "EV calculée sur la RANGE ENTIÈRE : « que vaudrait cette action si toute la range la prenait ». Ce n'est pas l'EV d'une main précise."
      : (node.ev ? node.ev.reason || "EV non calculée" : "EV non extraite"),
    note: handClass ? \`\${handClass} absente de la range solvée — fréquences de la range entière\` : null,
  };
}`],

  [`export function legalActionsFromNode(node) {
  if (!node) return [];
  return node.actions.map(lbl => ({`,
   `export function legalActionsFromNode(node, evs = null) {
  if (!node) return [];
  return node.actions.map(lbl => ({
    /* \`null\` quand l'EV n'a pas été calculée — jamais 0, qui se lirait comme
       une valeur (§0). */
    evBb: evs && Number.isFinite(evs[lbl]) ? evs[lbl] : null,`],
]);

repFile('src/sizing/pfase.js',[
  [`  const actions = legalActionsFromNode(entry.node).map(a => ({
    ...a,
    frequency: entry.freqs[a.label] ?? 0,
  }));`,
   `  const actions = legalActionsFromNode(entry.node, entry.evs).map(a => ({
    ...a,
    frequency: entry.freqs[a.label] ?? 0,
  }));
  const evAvailable = actions.some(a => a.evBb != null);`],
  [`    frequencySource: entry.source,      // "hand-class" | "range-aggregate"
    frequencyNote: entry.note || null,`,
   `    frequencySource: entry.source,      // "hand-class" | "range-aggregate"
    frequencyNote: entry.note || null,
    /* §36/§49 — l'EV par action, quand elle a été calculée. */
    evAvailable,
    evSource: evAvailable ? entry.evSource : null,
    evExact: evAvailable ? entry.evExact : null,
    evIsRangeWide: !!entry.evIsRangeWide,
    evNote: entry.evNote || null,`],
]);
console.log('ok');
