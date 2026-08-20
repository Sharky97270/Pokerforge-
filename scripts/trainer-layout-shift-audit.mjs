#!/usr/bin/env node
/**
 * trainer-layout-shift-audit — LE CADRE DE TABLE NE BOUGE JAMAIS.
 *
 * En multitabling, le joueur mémorise l'emplacement de chaque table. Si un
 * cadre change de taille parce qu'une main se termine, ses repères sautent —
 * et il les perd sur TOUTES les tables à la fois, pas seulement celle qui a
 * fini.
 *
 * Ce que ce script mesure, et rien d'autre : la GÉOMÉTRIE EXTERNE de chaque
 * cadre `.mt-slot` (x, y, largeur, hauteur). Le contenu a le droit de changer ;
 * le cadre non.
 *
 * Méthode : une RÉFÉRENCE est prise au démarrage de la session, puis chaque
 * état traversé pendant N mains est comparé À CETTE MÊME RÉFÉRENCE — jamais à
 * l'état précédent. Comparer de proche en proche laisserait passer une dérive
 * lente de 1 px par main.
 *
 * États traversés : décision, action jouée, street de coup complet, résultat,
 * solution ouverte, solution fermée, raccourci de lot visible, après avance.
 *
 * Le défaut historique qu'il verrouille : la barre « Historique » n'était
 * montée qu'à la PREMIÈRE réponse et prenait alors 33 px à la rangée de jeu —
 * les quatre cadres perdaient 33 px de hauteur d'un coup, en pleine session.
 *
 * Usage :
 *   node scripts/trainer-layout-shift-audit.mjs
 *   node scripts/trainer-layout-shift-audit.mjs --modes=4 --hands=10 --tol=1
 *   node scripts/trainer-layout-shift-audit.mjs --type=full   (MAIN GAGNÉE/PERDUE)
 *
 * `--type` choisit le type de session : "spot" (défaut) ne produit que des
 * verdicts de décision ; "full" et "session" jouent le coup jusqu'au bout et
 * font apparaître le récapitulatif MAIN GAGNÉE / MAIN PERDUE — c'est le bloc
 * le plus volumineux de l'application, et donc le plus susceptible de pousser
 * sur la géométrie du cadre.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const URL   = arg('url', 'http://localhost:7799');
const W = +arg('w', 1600), H = +arg('h', 950);
const MODES = String(arg('modes', '2,3,4')).split(',').map(Number).filter(Boolean);
const HANDS = +arg('hands', 7);
const TOL   = +arg('tol', 1);              // px — tolérance de rendu navigateur
const TYPE  = arg('type', 'spot');         // spot | street | full | session | mix
const OUT   = arg('out', `design-qa-evidence/trainer-layout-shift${TYPE === 'spot' ? '' : '-' + TYPE}.json`);

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const executablePath = CHROMES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Aucun Chrome/Edge trouvé.'); process.exit(2); }

const browser = await puppeteer.launch({
  executablePath, headless: 'new', args: ['--hide-scrollbars'],
  defaultViewport: { width: W, height: H },
});
let failed = 0;
const rapport = [];

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(type => {
    localStorage.setItem('pf_active_tab', 'trainer');
    /* Le type de session est persisté sous deux clés (snapshot canonique +
       legacy) : on écrit les deux, sinon l'une réécrase l'autre au montage. */
    localStorage.setItem('pf_train_mode', type);
    try {
      const c = JSON.parse(localStorage.getItem('pf_training_config') || '{}');
      c.sessionType = type;
      localStorage.setItem('pf_training_config', JSON.stringify(c));
    } catch { /* pas de config encore écrite : la clé legacy suffit */ }
  }, TYPE);
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 900));

  // Le Trainer n'est pas forcément l'onglet ouvert : on clique l'entrée de nav.
  await page.evaluate(() => {
    const n = [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && /^Entraîneur$/.test(e.textContent.trim()));
    n[0]?.closest('div,button,a')?.click();
  });
  await new Promise(r => setTimeout(r, 1800));

  for (const mode of MODES) {
    const res = await page.evaluate(async (mode, hands, tol) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const vis = e => e.offsetParent && e.getBoundingClientRect().width > 0;
      const B = re => [...document.querySelectorAll('button')].find(b => vis(b) && re.test(b.textContent));
      /* Le sélecteur de nombre de tables est un `div.mtbtn`, PAS un <button> —
         et il est verrouillé pendant une session : il faut arrêter d'abord. */
      const setT = n => [...document.querySelectorAll('.mtbtn')]
        .find(e => vis(e) && e.textContent.trim() === n + 'T')?.click();
      const frames = () => [...document.querySelectorAll('.mt-slot')].map((e, i) => {
        const r = e.getBoundingClientRect();
        return { t: i, x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      });
      const cmp = (a, b) => {
        const out = [];
        if (a.length !== b.length) return [{ err: 'nombre de cadres', a: a.length, b: b.length }];
        a.forEach((fa, i) => ['x', 'y', 'w', 'h'].forEach(k => {
          const d = Math.abs(fa[k] - b[i][k]);
          if (d > tol) out.push({ table: i, prop: k, ref: fa[k], mesure: b[i][k], delta: +d.toFixed(1) });
        }));
        return out;
      };

      /* `couverture` compte les états RÉELLEMENT atteints. Sans elle, un audit
         qui n'entre jamais dans un état passe au vert sans rien avoir prouvé —
         c'est aussi trompeur qu'un audit incapable d'échouer. */
      const o = { mode: mode + 'T', releves: 0, ecarts: [], couverture: {} };
      const vu = k => { o.couverture[k] = (o.couverture[k] || 0) + 1; };
      B(/Arrêter/)?.click();            await w(1000);
      B(/Nouvelle session/)?.click();   await w(1200);
      setT(mode);                       await w(600);
      B(/Lancer la session/)?.click();  await w(4200);

      const ref = frames();
      o.ref = ref;
      if (!ref.length) { o.ecarts.push({ err: 'aucun cadre .mt-slot rendu' }); return o; }
      const releve = etat => {
        o.releves++;
        const d = cmp(ref, frames());
        if (d.length) o.ecarts.push({ etat, d });
      };
      releve('demarrage');

      for (let i = 0; i < hands; i++) {
        let g = 0;
        while (g++ < 16) {
          const cta = document.querySelector('.pf-p2-next');
          if (cta && !cta.disabled) break;
          const act = [...document.querySelectorAll('.gto-btn')].filter(vis);
          const ab  = [...document.querySelectorAll('.ab')].filter(vis);
          if (act.length) { vu("action"); act[i % act.length].click(); await w(800); releve(`main${i}_action`); continue; }
          if (ab.length)  { vu("coupComplet"); ab[i % ab.length].click();   await w(800); releve(`main${i}_coupComplet`); continue; }
          await w(500);
        }
        releve(`main${i}_resultat`); vu('resultat');
        /* Le récapitulatif de coup complet est le bloc le plus volumineux :
           on note explicitement qu'on l'a bien traversé. */
        const txt = document.body.innerText;
        if (/MAIN GAGN/i.test(txt)) vu('mainGagnee');
        if (/MAIN PERDUE/i.test(txt)) vu('mainPerdue');
        if (/Bonne décision|Sous-optimal|Erreur/i.test(txt)) vu('verdictDecision');
        const sol = B(/Afficher la solution/);
        if (sol && i % 3 === 0) {
          sol.click(); await w(900); releve(`main${i}_solutionOuverte`); vu('solutionOuverte');
          B(/Masquer la solution/)?.click(); await w(700); releve(`main${i}_solutionFermee`);
        }
        if ([...document.querySelectorAll('button')].some(b => /Avancer les/.test(b.textContent))) {
          releve(`main${i}_raccourciLotVisible`); vu('raccourciLot');
        }
        const cta = document.querySelector('.pf-p2-next');
        if (cta && !cta.disabled) { cta.click(); await w(1000); releve(`main${i}_apresAvance`); }
      }
      o.stable = o.ecarts.length === 0;
      return o;
    }, mode, HANDS, TOL);

    rapport.push(res);
    res.type = TYPE;
    const ok = res.stable;
    if (!ok) failed++;
    console.log(`${ok?"✅":"❌"} ${res.mode} · ${TYPE} — ${res.releves} relevés, ${res.ecarts.length} écart(s) > ${TOL}px`);
    const couv = Object.entries(res.couverture || {}).map(([k, v]) => k + ' ×' + v).join(', ');
    console.log('   états traversés : ' + (couv || '⚠ AUCUN — la mesure ne prouve rien'));
    for (const e of res.ecarts.slice(0, 6)) {
      console.log(`   · ${e.etat || e.err}: ` + (e.d || []).map(x => `table ${x.table} ${x.prop} ${x.ref}→${x.mesure} (${x.delta}px)`).join(' | '));
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ viewport: [W, H], tolerancePx: TOL, hands: HANDS, rapport }, null, 1));
  console.log(`\nRelevés écrits dans ${OUT}`);
} finally {
  await browser.close();
}

console.log(failed
  ? `\n❌ ${failed} mode(s) présentent un déplacement de cadre.`
  : `\n✅ Aucun déplacement de cadre : la géométrie 2T/3T/4T reste figée du début à la fin.`);
process.exit(failed ? 1 : 0);
