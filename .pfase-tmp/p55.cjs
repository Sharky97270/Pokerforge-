const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const rep = (p, a, b) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
    if (s.includes(pat)) { fs.writeFileSync(p, s.replace(pat, r2)); return; }
  }
  console.error('MISS [' + p + '] : ' + a.slice(0, 90)); process.exit(1);
};

rep('src/sizing/gameState.js',
`  /* ── Rake (§78) — structure DÉCLARÉE, jamais inventée ── */
  const rake = input.rake ? {
    pct: Math.max(0, num(input.rake.pct) || 0),
    cap: input.rake.cap == null ? null : Math.max(0, num(input.rake.cap) || 0),
    /* Le moteur CFR actuel ne retire pas le rake de l'utilité terminale : le
       déclarer sans l'appliquer serait mentir. On le transporte pour le hash et
       l'affichage, et \`applied:false\` dit la vérité. */
    applied: false,
  } : { pct: 0, cap: null, applied: false };`,

`  /* ── Rake (§78) — DÉCLARÉ, et désormais APPLIQUÉ ─────────────────────────
     Le moteur retire maintenant le rake de l'utilité terminale (voir
     \`makeRakeModel\` dans multistreet.js). \`applied\` n'est donc plus figé à
     \`false\` : il vaut vrai dès qu'un pourcentage strictement positif est
     fourni, et l'état le transporte tel quel.

     Deux choses restent vraies et doivent le rester :
       · \`applied\` n'est jamais mis à vrai avec un pct nul — un rake de 0 %
         appliqué et un rake absent décrivent le même jeu, mais pas la même
         annonce, et l'écran ne doit pas prétendre modéliser une taxe nulle ;
       · le drapeau entre dans le hash d'état (canonicalHash), donc une solution
         rakée et une solution non rakée du même spot ne peuvent pas se
         confondre en cache — ce serait le pire des mélanges. */
  const rakePct = input.rake ? Math.max(0, num(input.rake.pct) || 0) : 0;
  const rake = input.rake ? {
    pct: rakePct,
    cap: input.rake.cap == null ? null : Math.max(0, num(input.rake.cap) || 0),
    /* Une salle qui ne rake pas les pots emportés sans abattage : la variante
       est déclarée ici et suivie jusqu'à l'utilité terminale. */
    rakeUncontested: input.rake.rakeUncontested !== false,
    applied: rakePct > 0 && input.rake.applied !== false,
  } : { pct: 0, cap: null, rakeUncontested: true, applied: false };`);

/* Le hash doit distinguer la variante « pots non disputés ». */
rep('src/sizing/canonicalHash.js',
`    "rk", qf(state?.rake?.pct), state?.rake?.cap == null ? "∅" : qa(state.rake.cap), state?.rake?.applied ? "1" : "0",`,
`    "rk", qf(state?.rake?.pct), state?.rake?.cap == null ? "∅" : qa(state.rake.cap), state?.rake?.applied ? "1" : "0",
    /* La variante « pots non disputés non rakés » change les valeurs terminales :
       deux états qui ne diffèrent que par elle sont deux jeux différents. */
    state?.rake?.rakeUncontested === false ? "ru0" : "ru1",`);

/* L'adaptateur doit transmettre le rake au solveur. */
rep('src/sizing/solverAdapter.js',
`      ...(state.evaluationModel === EvaluationModel.ICM && state.icmParams ? { icm: state.icmParams } : {}),`,
`      /* §78 — le rake descend jusqu'à l'utilité terminale. Transmis SEULEMENT
         quand il est déclaré appliqué : sans ce filtre, un état porteur d'un
         rake « pour l'affichage » modifierait silencieusement les EV. */
      ...(state.rake && state.rake.applied
        ? { rake: state.rake, rakeUncontested: state.rake.rakeUncontested !== false }
        : {}),
      ...(state.evaluationModel === EvaluationModel.ICM && state.icmParams ? { icm: state.icmParams } : {}),`);
console.log('ok');
