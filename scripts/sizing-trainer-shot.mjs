#!/usr/bin/env node
/**
 * sizing-trainer-shot — vérifie AU NAVIGATEUR le trajet complet du §87 :
 *
 *   SharkSolver : optimiser les sizings
 *        ↓  « S'entraîner contre cette solution »
 *   Trainer     : le spot affiche EXACTEMENT les actions de la solution
 *
 * C'est le critère de terminaison du Trainer : « une solution produite dans
 * SharkSolver peut être immédiatement saved / loaded / opened / trained against
 * SANS RECOPIER MANUELLEMENT SES SIZINGS ».
 *
 * Le script ne se contente pas d'une capture : il compare les sizings RETENUS
 * annoncés par le panneau du solveur aux boutons réellement rendus par le
 * Trainer. Un écart fait échouer le script.
 *
 * Prérequis : `npm run dev` sur le port 7788, Chrome ou Edge installé.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? decodeURIComponent(h.split("=").slice(1).join("=")) : d; };
const URL = arg("url", "http://localhost:7788");
const BOARD = arg("board", "As7d2c9hKs");
const MODE = arg("mode", "Single Size");
const W = +arg("w", 1600), H = +arg("h", 1200);
const OUT = path.resolve(arg("out", "design-qa-evidence/sizing-trainer.png"));
const JSONOUT = path.resolve(arg("json", "design-qa-evidence/sizing-trainer.json"));
const TIMEOUT = +arg("timeout", 300000);

const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const exe = CHROMES.find(p => fs.existsSync(p));
if (!exe) { console.error("Aucun Chrome/Edge trouvé."); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--hide-scrollbars"], defaultViewport: { width: W, height: H } });
const out = { ok: false, steps: [], errors: [], console: [] };

try {
  const page = await browser.newPage();
  page.on("console", m => { if (m.type() === "error") out.console.push(m.text().slice(0, 300)); });
  page.on("pageerror", e => out.errors.push(String(e).slice(0, 300)));
  await page.goto(URL, { waitUntil: "networkidle2" });

  const clickExact = (t) => page.evaluate((x) => {
    const el = [...document.querySelectorAll("button, .ntab, div, span")]
      .filter(e => e.children.length === 0 || e.tagName === "BUTTON")
      .find(e => e.textContent.trim() === x);
    if (el) { el.click(); return true; } return false;
  }, t);
  const clickContains = (t) => page.evaluate((x) => {
    const el = [...document.querySelectorAll("button")].find(e => e.textContent.includes(x));
    if (el && !el.disabled) { el.click(); return true; } return false;
  }, t);

  let nav = false;
  for (let i = 0; i < 12 && !nav; i++) { nav = await clickExact("SharkSolver"); if (!nav) await sleep(500); }
  out.steps.push({ step: "onglet SharkSolver", ok: nav });
  await sleep(1500);

  const boardSet = await page.evaluate((b) => {
    const el = [...document.querySelectorAll("input")].find(i => /river/i.test(i.placeholder || ""));
    if (!el) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, b);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, BOARD);
  out.steps.push({ step: "board saisi", ok: boardSet, board: BOARD });
  await sleep(900);

  out.steps.push({ step: `mode ${MODE}`, ok: await clickExact(MODE) });
  await sleep(300);
  out.steps.push({ step: "solve lancé", ok: await clickContains("Optimiser les sizings") });

  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < TIMEOUT) {
    done = await page.evaluate(() => !!document.querySelector('[data-pfase="solution"], [data-pfase="error"]'));
    if (done) break;
    await sleep(1000);
  }
  out.steps.push({ step: "solution affichée", ok: done, ms: Date.now() - t0 });
  if (!done) throw new Error("aucune solution après " + TIMEOUT + " ms");

  /* Ce que le SOLVEUR annonce. */
  out.solver = await page.evaluate(() => {
    const el = document.querySelector('[data-pfase="solution"]');
    if (!el) return null;
    return {
      selected: el.getAttribute("data-pfase-selected"),
      complexity: el.getAttribute("data-pfase-complexity"),
      badge: el.getAttribute("data-pfase-badge"),
      status: el.getAttribute("data-pfase-status"),
    };
  });
  out.steps.push({ step: "sizings annoncés par le solveur", ok: !!(out.solver && out.solver.selected), ...out.solver });

  /* §87 — le passage au Trainer. */
  const trained = await clickContains("S'entraîner contre cette solution");
  out.steps.push({ step: "bouton « S'entraîner contre cette solution »", ok: trained });
  if (!trained) throw new Error("bouton d'entraînement absent ou désactivé");
  await sleep(2500);

  /* Ce que le TRAINER affiche réellement. */
  out.trainer = await page.evaluate(() => {
    const txt = document.body.innerText;
    const btns = [...document.querySelectorAll('button.ab, button[class*="ab-"], button.gto-btn, button[class*="gto-btn-"]')]
      .filter(b => b.getBoundingClientRect().width > 0)
      .map(b => b.textContent.trim());
    return {
      onTrainer: /POKERFORGE TRAINER/i.test(txt) || btns.length > 0,
      actionButtons: btns,
      notice: (txt.match(/Adaptive Sizing — aucune solution vérifiée\s*\n\s*([^\n]+)/) || [])[1] || null,
      badgeVisible: /Adaptive Sizing/.test(txt),
    };
  });
  out.steps.push({ step: "Trainer rendu", ok: !!out.trainer.onTrainer, boutons: out.trainer.actionButtons });

  /* ── LA VÉRIFICATION QUI COMPTE ──
     Les sizings annoncés par le solveur doivent se retrouver TELS QUELS dans les
     boutons du Trainer. Un pourcentage retenu absent des boutons signifierait que
     le Trainer a reconstruit ses propres tailles — exactement ce que §29 interdit. */
  const selected = (out.solver && out.solver.selected ? out.solver.selected.split(",") : []).filter(Boolean);
  const boutons = (out.trainer.actionButtons || []).join(" | ");
  const manquants = selected.filter(lbl => {
    if (/JAM/i.test(lbl)) return !/Tapis/i.test(boutons);
    const pct = lbl.replace("%", "").trim();
    return !boutons.includes(pct + "%");
  });
  out.match = { selected, boutons, manquants, ok: manquants.length === 0 && selected.length > 0 };
  out.steps.push({ step: "§87 — les sizings du solveur sont ceux du Trainer", ok: out.match.ok, manquants });

  /* §18 — la PROVENANCE doit être identifiable DANS le Trainer. Le badge
     n'apparaît qu'après une décision (bandeau de retour) : on joue donc une
     action, puis on vérifie qu'il porte bien la marque Adaptive Sizing et le
     niveau de simplification. */
  const played = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button.ab, button[class*="ab-"], button.gto-btn, button[class*="gto-btn-"]')]
      .filter(x => x.getBoundingClientRect().width > 0)
      .find(x => /^Check/i.test(x.textContent.trim()));
    if (b) { b.click(); return b.textContent.trim().slice(0, 20); } return null;
  });
  out.steps.push({ step: "action Hero jouée", ok: !!played, action: played });
  await sleep(1800);
  /* La solution reste masquée tant qu'on ne la révèle pas (mode « hard » du
     Trainer) : c'est là que vit le badge de provenance. */
  const revealed = await clickContains("Révéler") || await clickContains("Afficher la solution");
  out.steps.push({ step: "solution révélée", ok: revealed });
  await sleep(1200);
  await page.screenshot({ path: "design-qa-evidence/sizing-trainer-revealed.png", captureBeyondViewport: false });
  out.provenance = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      /* Le libellé est mis en majuscules par CSS ; `innerText` le reflète.
         On compare donc sans tenir compte de la casse, et sans supposer que le
         niveau suit immédiatement l'emoji. */
      badge: /adaptive sizing/i.test(txt) && /(single|simple|advanced|full)/i.test(txt),
      badgeTexte: (txt.match(/[^\n]*adaptive sizing[^\n]*/i) || [])[0] || null,
      heuristiqueAffichee: /≈ Heuristique|ESTIMATION HEURISTIQUE/i.test(txt),
      perteAffichee: /perte\s+(non mesurable|[-0-9.,]+\s*bb)/i.test(txt),
      perteTexte: (txt.match(/[^\n]*perte\s+(?:non mesurable|[-0-9.,]+\s*bb)[^\n]*/i) || [])[0] || null,
    };
  });
  out.steps.push({ step: "§18 — provenance Adaptive Sizing visible", ok: !!out.provenance.badge, ...out.provenance });

  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;}" });
  await sleep(300);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, captureBeyondViewport: false });
  out.screenshot = OUT;
  out.ok = out.match.ok && !!out.provenance.badge && !out.provenance.heuristiqueAffichee
    && !!out.provenance.perteAffichee && out.errors.length === 0;
} catch (e) {
  out.errors.push(String((e && e.message) || e));
} finally {
  await browser.close();
  fs.mkdirSync(path.dirname(JSONOUT), { recursive: true });
  fs.writeFileSync(JSONOUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}
