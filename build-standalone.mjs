/* Régénère index-standalone.html à partir du build Vite (dist/), 100% auto-contenu.
   Le script embarque React, l'application, la feuille CSS et les images publiques,
   donc PAS de Babel navigateur (montage instantané) et fichier unique partageable.
   Usage : npm run build && node build-standalone.mjs   (ou npm run build:standalone) */
import fs from "fs";
import path from "path";

const ASSETS = "dist/assets";
let bundleFile;
let cssFile;
try {
  const files = fs.readdirSync(ASSETS);
  bundleFile = files.find(f => /^index-.*\.js$/.test(f));
  cssFile = files.find(f => /^index-.*\.css$/.test(f));
} catch {}
if (!cssFile) { console.error("CSS bundle missing - run `npm run build` first."); process.exit(1); }
if (!bundleFile) { console.error("✗ Bundle introuvable — lance d'abord `npm run build`."); process.exit(1); }

let js = fs.readFileSync(ASSETS + "/" + bundleFile, "utf8");
let css = fs.readFileSync(ASSETS + "/" + cssFile, "utf8");
if (/<\/style/i.test(css)) { console.error("CSS bundle contains </style> - cannot inline safely."); process.exit(1); }
if (/<\/script/i.test(js)) { console.error("✗ Le bundle contient </script> — inline impossible."); process.exit(1); }

const PUBLIC_ASSETS = {
  "/dashboard-hero-pf.png": "image/png",
  "/logo-compact.svg": "image/svg+xml",
  "/logo-full.svg": "image/svg+xml",
  "/logo-pokerforge-kl.png": "image/png",
  "/assets/trainer/07_pot_chips_x3.png": "image/png",
  "/assets/trainer/08_hero_seat_cards_avatar_banner_x3.png": "image/png",
  "/assets/trainer/09_utg_seat_x3.png": "image/png",
  "/assets/trainer/10_co_seat_x3.png": "image/png",
  "/assets/trainer/11_btn_seat_x3.png": "image/png",
  "/assets/trainer/12_bb_seat_x3.png": "image/png",
  "/assets/trainer/13_sb_seat_x3.png": "image/png",
  "/assets/trainer/19_bb_chip_x3.png": "image/png",
  "/assets/trainer/20_sb_chip_x3.png": "image/png",
  "/assets/mental/neon-brain-card.jpg": "image/jpeg",
  "/assets/mental/neon-target-card.jpg": "image/jpeg",
};

function toDataUrl(file, mime) {
  const diskPath = path.join("public", file.replace(/^\//, ""));
  if (!fs.existsSync(diskPath)) return file;
  const data = fs.readFileSync(diskPath).toString("base64");
  return `data:${mime};base64,${data}`;
}

// Inline chaque image publique UNE SEULE FOIS (const hoistée + référence),
// pour éviter de dupliquer le base64 à chaque occurrence (ex. hero PNG ~2 Mo référencé 2×).
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let prelude = "";
let assetIdx = 0;
for (const [file, mime] of Object.entries(PUBLIC_ASSETS)) {
  if (!js.includes(file) && !css.includes(file)) continue;
  const dataUrl = toDataUrl(file, mime);
  if (dataUrl === file) continue; // fichier absent → on laisse la référence telle quelle

  /* ── LE CAS `url(...)` SE TRAITE À PART ───────────────────────────────────
     DÉFAUT CORRIGÉ (2026-08-21) : la substitution plus bas remplace les
     littéraux 'chemin' et "chemin" par un identifiant JS. Elle ne sait pas
     distinguer une chaîne JS d'un url('chemin') écrit dans une feuille de
     style — or src/styles.js EST du CSS écrit dans un littéral gabarit JS.
     Résultat mesuré dans le build autonome : .pf-card-back-art sortait avec
     background-image:url(__pfAsset4), que le navigateur résout comme une URL
     relative → 404, et le dos de carte disparaissait sans rien signaler.

     Une règle CSS ne peut pas lire une variable JS : on y écrit donc la DONNÉE.
     Le data URL ne contient jamais de parenthèse fermante (alphabet base64),
     `url(...)` sans guillemets est donc sûr.

     PISTE ÉCARTÉE, ET POURQUOI — passer par une variable CSS posée à l'exécution
     (`documentElement.style.setProperty('--pf-asset-N', 'url("'+cst+'")')`)
     évitait de dupliquer le base64. Mesuré : Chrome ACCEPTE la variable de
     310 Ko (siège UTG) et REJETTE SILENCIEUSEMENT celle de 3,4 Mo (hero du
     dashboard) — `getPropertyValue` renvoie une chaîne vide, sans erreur. Le
     fond du dashboard disparaissait donc exactement comme le bug qu'on corrige.
     Faire reposer un artefact partageable sur une limite de taille non
     documentée du CSSOM n'est pas un compromis acceptable.

     COÛT ASSUMÉ : les images utilisées à la fois en CSS et comme littéral JS
     sont stockées deux fois — 2 834 Ko mesurés ici (hero 2 524 Ko + siège UTG
     310 Ko). À noter que le build précédent était plus petit uniquement parce
     que ces deux images y étaient CASSÉES. Optimisation possible plus tard :
     convertir la constante en URL de Blob à l'exécution (URL courte, donc pas
     de limite CSSOM) — non fait ici, cela ajoute une dépendance d'exécution à
     un script de build. */
  const urlRe = () => new RegExp(`url\\(\\s*['"]?${escapeRe(file)}['"]?\\s*\\)`, "g");
  js = js.replace(urlRe(), `url(${dataUrl})`);
  css = css.replace(urlRe(), `url(${dataUrl})`);

  if (!js.includes(file)) continue;   // plus aucune référence côté JS
  const varName = `__pfAsset${assetIdx++}`;
  prelude += `const ${varName}=${JSON.stringify(dataUrl)};`;

  // Remplace les littéraux chaîne "file" / 'file' par la variable (déduplication)
  js = js.split(`"${file}"`).join(varName).split(`'${file}'`).join(varName);
  // Filet de sécurité : occurrences restantes non quotées → base64 direct (rare)
  if (js.includes(file)) js = js.split(file).join(dataUrl);
}

/* Garde-fou : un identifiant JS laissé dans une propriété CSS produit une
   ressource 404 silencieuse. On échoue bruyamment plutôt que de livrer une
   image manquante. */
for (const source of [["JS", js], ["CSS", css]]) {
  const fuite = source[1].match(/url\(\s*__pfAsset\d+\s*\)/);
  if (fuite) {
    console.error(`✗ ${source[0]} : ${fuite[0]} — une variable JS a fui dans une règle CSS (l'image serait 404).`);
    process.exit(1);
  }
}

const GENERATED_ASSET_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

for (const file of fs.readdirSync(ASSETS)) {
  const ext = path.extname(file).toLowerCase();
  const mime = GENERATED_ASSET_MIME[ext];
  if (!mime) continue;
  const publicPath = `/assets/${file}`;
  const relativePath = `./assets/${file}`;
  if (!js.includes(publicPath) && !css.includes(publicPath) && !js.includes(relativePath) && !css.includes(relativePath)) continue;
  const data = fs.readFileSync(path.join(ASSETS, file)).toString("base64");
  const dataUrl = `data:${mime};base64,${data}`;
  js = js.split(publicPath).join(dataUrl).split(relativePath).join(dataUrl);
  css = css.split(publicPath).join(dataUrl).split(relativePath).join(dataUrl);
}
js = prelude + js;

const html =
`<!doctype html><html lang="fr"><head><meta charset="UTF-8"/>` +
`<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"/>` +
`<meta name="apple-mobile-web-app-capable" content="yes"/><meta name="theme-color" content="#030712"/>` +
`<title>PokerForge</title>` +
`<style>*{box-sizing:border-box;margin:0;padding:0}html,body,#root{height:100%}` +
`body{background:#030712;color:#fff;font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}` +
`${css}</style>` +
`</head><body><div id="root"></div><script type="module">${js}</script></body></html>`;

fs.writeFileSync("index-standalone.html", html, "utf8");
console.log("✓ index-standalone.html régénéré (JS + CSS + images inlinés, sans Babel) — " + (html.length / 1024 | 0) + " Ko");
