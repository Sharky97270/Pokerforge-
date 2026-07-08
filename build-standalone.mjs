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
let prelude = "";
let assetIdx = 0;
for (const [file, mime] of Object.entries(PUBLIC_ASSETS)) {
  if (!js.includes(file)) continue;
  const dataUrl = toDataUrl(file, mime);
  if (dataUrl === file) continue; // fichier absent → on laisse la référence telle quelle
  const varName = `__pfAsset${assetIdx++}`;
  prelude += `const ${varName}=${JSON.stringify(dataUrl)};`;
  // Remplace les littéraux chaîne "file" / 'file' par la variable (déduplication)
  js = js.split(`"${file}"`).join(varName).split(`'${file}'`).join(varName);
  // Filet de sécurité : occurrences restantes non quotées → base64 direct (rare)
  if (js.includes(file)) js = js.split(file).join(dataUrl);
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
