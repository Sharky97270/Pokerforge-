// PokerForge — helpers de formatage numerique (extrait de App.jsx, Phase 3.2)

export function roundBb(v){
  const n=Number(v);
  if(!Number.isFinite(n))return 0;
  return Math.round(n*10)/10;
}

/* ══════════════════════════════════════════════════════════════════
   CONVENTION D'AFFICHAGE DES NOMBRES

   Une décimale ne s'affiche que si elle porte une information. « 1.0bb »,
   « 4.00bb », « SPR 10.0 » sont du bruit : ils allongent le libellé, mangent
   la place qui manque déjà en 4T, et suggèrent une précision que la valeur
   n'a pas. À l'inverse « 1.5bb » et « 0.25bb » disent quelque chose et sont
   conservés tels quels.

   `toFixed` ne sait pas faire cette différence — il pose TOUJOURS le nombre
   de décimales demandé. D'où cette fonction, à employer partout où un nombre
   est rendu à l'écran : bb, SPR, pot odds, EV.
   ══════════════════════════════════════════════════════════════════ */
export function fmtNum(v, maxDec = 1){
  /* `Number(null)` vaut 0 et `Number("")` aussi : sans ce test, une donnée
     ABSENTE s'afficherait « 0 » — un chiffre inventé, exactement ce que ce
     projet s'interdit. Une valeur manquante doit se voir comme manquante. */
  if(v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if(!Number.isFinite(n)) return "—";
  /* `toFixed` puis `parseFloat` : l'arrondi d'abord (0.249 → « 0.25 »), la
     suppression des zéros inutiles ensuite (2.00 → 2, 1.50 → 1.5). */
  const arrondi = parseFloat(n.toFixed(Math.max(0, maxDec)));
  /* -0 est un artefact d'arrondi : il s'affiche « -0 » et laisse croire à une
     perte. On le ramène à 0. */
  return Object.is(arrondi, -0) ? "0" : String(arrondi);
}

/* Montant en big blinds — la forme la plus fréquente à l'écran. */
export function fmtBb(v, maxDec = 1){ return `${fmtNum(v, maxDec)}bb`; }

/* SPR : une décimale suffit, et « SPR 10 » vaut mieux que « SPR 10.0 ». */
export function fmtSpr(stack, pot){
  const p = Number(pot);
  if(!Number.isFinite(p) || p <= 0) return "—";
  return fmtNum(Number(stack) / p, 1);
}

export function shuffle(a){return [...a].sort(()=>Math.random()-.5);}
