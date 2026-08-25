#!/usr/bin/env node
/**
 * sizing-multitable-shot — §69 / §104 / §108 au NAVIGATEUR, en 2T / 3T / 4T.
 *
 * Ce que ce script prouve, et pourquoi c'est ce qu'il faut prouver :
 *
 *   1. Une FAMILLE de solutions (FULL / ADVANCED / SIMPLE / SINGLE du même état)
 *      ouvre une table par niveau.
 *   2. Chaque table affiche SES sizings — ceux de SA solution.
 *   3. Aucune table n'affiche les sizings d'une autre.
 *
 * Le point 3 est le seul qui puisse réellement échouer, et c'est pour lui que le
 * script existe. Un état partagé entre tables produirait des écrans parfaitement
 * crédibles : quatre tables, des boutons plausibles partout, et le même jeu de
 * sizings répété — c'est-à-dire trois tables qui mentent. Aucune capture d'écran
 * ne le montrerait ; seule une COMPARAISON entre ce que le solveur a annoncé
 * niveau par niveau et ce que chaque table rend le met en évidence.
 *
 * Le script échoue bruyamment. Ce n'est pas un preneur de captures.
 *
 * Prérequis : `npm run dev` sur le port 7788, Chrome ou Edge installé.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? decodeURIComponent(h.split("=").slice(1).join("=")) : d; };
const URL = arg("url", "http://localhost:7788");
const BOARD = arg("board", "As7d2c9hKs");
const W = +arg("w", 1600), H = +arg("h", 1000);
const OUTDIR = path.resolve(arg("outdir", "design-qa-evidence"));
const JSONOUT = path.join(OUTDIR, "sizing-multitable.json");
const TIMEOUT = +arg("timeout", 420000);

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
const out = { ok: false, steps: [], errors: [], console: [], tables: [] };

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
    const el = [...document.querySelectorAll("button")].find(e => e.textContent.includes(x) && !e.disabled);
    if (el) { el.click(); return true; } return false;
  }, t);

  /* ── 1. SharkSolver : produire la FAMILLE ─────────────────────────────── */
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

  /* La case « famille » produit les quatre niveaux sous un seul état (§110). */
  /* Ancre de DONNÉES, pas expression régulière sur le texte : la case vit dans
     un <label> dont le texte n'est pas un nœud à part, et le CSS met les libellés
     en majuscules. Chercher « les 4 niveaux » dans le DOM échouait silencieusement
     — le solve partait en mode simple, et le script attendait sept minutes une
     famille qui n'arriverait jamais. */
  const famille = await page.evaluate(() => {
    const el = document.querySelector('[data-pfase="family-toggle"]');
    if (!el) return null;
    if (!el.checked) el.click();
    return el.checked;
  });
  out.steps.push({ step: "mode famille activé", ok: !!famille, libelle: famille });

  /* Cocher la case relance un rendu React : pendant celui-ci le bouton peut être
     momentanément absent ou désactivé, et un clic unique échoue en silence — le
     script attendait ensuite dix minutes une famille qui ne viendrait pas. On
     réessaie, et si rien ne marche on RAPPORTE l état du bouton au lieu de
     laisser deviner. */
  await sleep(800);
  /* Ancre de DONNÉES, pas libellé : le texte du bouton CHANGE selon le mode
     (« Optimiser les sizings » devient « Résoudre les 4 niveaux » dès que la
     famille est cochée). Le script cherchait l ancien libellé, ne trouvait plus
     rien, et rapportait « bouton absent » sur une interface parfaitement saine.
     C est la deuxième fois que chercher du texte coûte une exécution complète. */
  const clickSolve = () => page.evaluate(() => {
    const b = document.querySelector('[data-pfase="solve"]');
    if (b && !b.disabled) { b.click(); return true; } return false;
  });
  let lance = false;
  for (let i = 0; i < 15 && !lance; i++) { lance = await clickSolve(); if (!lance) await sleep(700); }
  if (!lance) {
    out.boutonSolve = await page.evaluate(() => {
      const b = document.querySelector('[data-pfase="solve"]');
      return b ? { texte: b.textContent.trim().slice(0, 60), disabled: b.disabled } : { absent: true };
    });
  }
  out.steps.push({ step: "solve lancé", ok: lance, bouton: out.boutonSolve || null });
  if (!lance) throw new Error("bouton « Optimiser les sizings » introuvable ou désactivé : " + JSON.stringify(out.boutonSolve));

  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < TIMEOUT) {
    done = await page.evaluate(() => !!document.querySelector('[data-pfase="family"], [data-pfase="error"]'));
    if (done) break;
    await sleep(1500);
  }
  out.steps.push({ step: "famille affichée", ok: done, ms: Date.now() - t0 });
  if (!done) throw new Error("aucune famille après " + TIMEOUT + " ms");

  /* Ce que le SOLVEUR annonce, niveau par niveau. C'est la référence. */
  out.solverLevels = await page.evaluate(() => {
    const el = document.querySelector('[data-pfase="family"]');
    if (!el) return null;
    return (el.getAttribute("data-pfase-levels") || "").split("|").filter(Boolean).map(s => {
      const [complexity, rest] = s.split("=");
      const [selected, evLoss] = (rest || "").split("@");
      return { complexity, selected, evLoss };
    });
  });
  out.steps.push({ step: "niveaux annoncés par le solveur", ok: !!(out.solverLevels && out.solverLevels.length > 1), niveaux: out.solverLevels });
  fs.mkdirSync(OUTDIR, { recursive: true });
  await page.screenshot({ path: path.join(OUTDIR, "sizing-multitable-family.png"), captureBeyondViewport: false });

  /* ── 2. Ouvrir une table par niveau ───────────────────────────────────── */
  const many = await page.evaluate(() => {
    const b = document.querySelector("[data-pfase-train-many]");
    if (b && !b.disabled) { b.click(); return +b.getAttribute("data-pfase-train-many"); }
    return 0;
  });
  out.steps.push({ step: "bouton multitable cliqué", ok: many > 0, niveaux: many });
  if (!many) throw new Error("bouton « une table par niveau » absent");
  await sleep(3500);

  /* ── 3. LA VÉRIFICATION ───────────────────────────────────────────────── */
  const lu = await page.evaluate(() => {
    const grille = document.querySelector(".grid1, .grid2, .grid3, .grid4");
    const tables = [...document.querySelectorAll('[class*="grid"] > *')]
      .filter(e => e.getBoundingClientRect().width > 120);
    const parTable = tables.map((t, i) => {
      const btns = [...t.querySelectorAll('button.ab, button[class*="ab-"], button.gto-btn, button[class*="gto-btn-"]')]
        .filter(b => b.getBoundingClientRect().width > 0)
        .map(b => b.textContent.trim());
      const txt = t.innerText || "";
      return {
        index: i,
        boutons: btns,
        /* Les pourcentages RÉELLEMENT rendus par cette table. */
        pourcentages: [...new Set((btns.join(" ").match(/\d+%/g) || []))].sort(),
        jam: /tapis/i.test(btns.join(" ")),
        badgeAdaptive: /adaptive sizing/i.test(txt),
        niveau: (txt.match(/\b(SINGLE|SIMPLE|ADVANCED|FULL)\b/i) || [])[1] || null,
      };
    }).filter(t => t.boutons.length > 0);
    return {
      classeGrille: grille ? grille.className : null,
      nbTables: parTable.length,
      tables: parTable,
      texte: document.body.innerText.slice(0, 400),
    };
  });
  out.tables = lu.tables;
  out.grid = lu.classeGrille;
  out.steps.push({ step: "tables rendues", ok: lu.nbTables >= 2, nbTables: lu.nbTables, grille: lu.classeGrille });
  await page.screenshot({ path: path.join(OUTDIR, `sizing-multitable-${lu.nbTables}T.png`), captureBeyondViewport: false });

  /* (a) Une table par niveau. */
  const attendu = Math.min(4, (out.solverLevels || []).length);
  const aBonNombre = lu.nbTables === attendu;

  /* (b) Chaque niveau annoncé se retrouve sur UNE table. */
  const normaliser = (s) => (s || "").split(/[·,]/).map(x => x.trim()).filter(Boolean);
  const correspondances = (out.solverLevels || []).map(niv => {
    const cibles = normaliser(niv.selected);
    const table = lu.tables.find(t => cibles.every(c =>
      /JAM/i.test(c) ? t.jam : t.pourcentages.includes(c.replace(/\s/g, ""))));
    return { complexity: niv.complexity, attendu: cibles, trouve: !!table, surTable: table ? table.index : null };
  });
  const tousTrouves = correspondances.every(c => c.trouve);

  /* (c) LA CONTAMINATION — le contrôle qui justifie ce script.
     Si toutes les tables rendaient exactement le même jeu de boutons alors que
     le solveur a annoncé des niveaux DIFFÉRENTS, c'est qu'un état est partagé.
     L'écran, lui, serait irréprochable. */
  const signatures = lu.tables.map(t => t.pourcentages.join(",") + (t.jam ? "+JAM" : ""));
  const signaturesSolveur = (out.solverLevels || []).map(n => normaliser(n.selected).join(","));
  const niveauxDistinctsAnnonces = new Set(signaturesSolveur).size;
  const signaturesDistinctesRendues = new Set(signatures).size;
  const pasDeContamination = niveauxDistinctsAnnonces <= 1 || signaturesDistinctesRendues > 1;

  out.verification = {
    attenduTables: attendu, rendues: lu.nbTables, aBonNombre,
    correspondances, tousTrouves,
    signaturesRendues: signatures, signaturesAnnoncees: signaturesSolveur,
    niveauxDistinctsAnnonces, signaturesDistinctesRendues, pasDeContamination,
  };
  out.steps.push({ step: "§69 — une table par niveau", ok: aBonNombre });
  out.steps.push({ step: "§104 — chaque niveau se retrouve sur sa table", ok: tousTrouves, correspondances });
  out.steps.push({
    step: "§108 — aucune contamination entre tables", ok: pasDeContamination,
    detail: `${niveauxDistinctsAnnonces} jeux de sizings annoncés, ${signaturesDistinctesRendues} rendus`,
  });

  out.ok = aBonNombre && tousTrouves && pasDeContamination && out.errors.length === 0;
} catch (e) {
  out.errors.push(String((e && e.message) || e));
} finally {
  await browser.close();
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(JSONOUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}
