const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const rep = (p, a, b) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
    if (s.includes(pat)) { fs.writeFileSync(p, s.replace(pat, r2)); return; }
  }
  console.error('MISS [' + p + '] : ' + a.slice(0, 90)); process.exit(1);
};

const MSG = "rake et ICM/PKO ne se combinent pas : l'utilité ICM transforme un TRANSFERT de jetons entre deux joueurs, or le rake en fait sortir une part de la table. Aucune convention publiée ne fonde ce mélange — résoudre en chip-EV, ou sans rake.";

/* solveTree LÈVE, au lieu de renvoyer un objet qui n'a pas la forme d'une
   solution : la valeur de retour est consommée sans être testée par plusieurs
   appelants, et un faux objet y produisait un « Cannot read properties of
   undefined » — un message d'erreur qui ne dit rien de la cause. */
rep('src/solver/core/multistreet.js',
`  if(rakeModel&&(opts.icm||opts.pko)){
    /* Refus net plutôt qu'un nombre inventé : voir l'en-tête de makeRakeModel. */
    return{ok:false,reason:"rake et ICM/PKO ne se combinent pas : l'utilité ICM transforme un TRANSFERT de jetons, or le rake en fait sortir une part de la table. Aucune convention ne fonde ce mélange — résoudre en chip-EV, ou sans rake."};
  }`,
`  if(rakeModel&&(opts.icm||opts.pko)){
    /* Refus net plutôt qu'un nombre inventé (voir l'en-tête de makeRakeModel).
       On LÈVE : renvoyer un objet \`{ok:false}\` là où les appelants attendent une
       solution produisait un « Cannot read properties of undefined » quelques
       lignes plus loin — un message qui masque complètement la vraie cause. */
    throw new Error(${JSON.stringify(MSG)});
  }`);

/* Et l'adaptateur refuse AVANT de lancer un solve, pour que le motif remonte
   sans passer par une exception. */
rep('src/sizing/solverAdapter.js',
`      /* §78 — le rake descend jusqu'à l'utilité terminale. Transmis SEULEMENT`,
`      /* §78 — le rake descend jusqu'à l'utilité terminale. Transmis SEULEMENT`);

let s = fs.readFileSync('src/sizing/solverAdapter.js', 'utf8');
const needle = 'export function solveTreeSpec(';
const i = s.indexOf(needle);
if (i < 0) { console.error('MISS solveTreeSpec'); process.exit(1); }
const openBrace = s.indexOf('{', s.indexOf(')', i));
const guard = `{
  /* ── INCOMPATIBILITÉ DÉCLARÉE AVANT TOUT CALCUL (§78, §99) ────────────────
     Le rake et l'ICM décrivent deux comptabilités qui ne se composent pas : l'ICM
     convertit un transfert de jetons entre joueurs en équité de tournoi, le rake
     fait sortir des jetons de la table. Il n'existe pas de convention publiée
     pour les combiner, et en fabriquer une reviendrait à produire un chiffre que
     rien ne fonde. On refuse ici, avant de dépenser un solve, pour que le motif
     arrive à l'écran plutôt qu'une exception. */
  {
    const st = arguments[0] && arguments[0].state;
    const rk = st && st.rake;
    if (rk && rk.applied && st.evaluationModel && st.evaluationModel !== "CHIP_EV") {
      return { ok: false, reason: ${JSON.stringify(MSG)} };
    }
  }
`;
s = s.slice(0, openBrace) + guard + s.slice(openBrace + 1);
fs.writeFileSync('src/sizing/solverAdapter.js', s);
console.log('ok');
