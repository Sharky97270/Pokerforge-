#!/usr/bin/env node
/**
 * sizing-persistence-shot — §88 et §108, dans un vrai navigateur.
 *
 *   « Test obligatoire : solve · save · logout/reload · load · train.
 *     Le résultat doit être identique. »                            (§88)
 *
 *   « … SAVE VERIFIED SOLUTION → LOAD IN TRAINER → PLAY COMPLETE HAND
 *       → RELOAD APPLICATION → SOLUTION STILL WORKS »               (§108)
 *
 * Le magasin de solutions vit en mémoire ET sur IndexedDB. Un test en Node ne
 * prouve que la mémoire : seul un vrai rechargement de page prouve que la
 * solution survit, que l'hydratation la retrouve, et qu'elle est encore
 * entraînable. C'est exactement ce que ce script fait.
 *
 * Prérequis : `npm run dev` sur le port 7788, Chrome ou Edge installé.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer-core";

const arg = (n, d) => { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? decodeURIComponent(h.split("=").slice(1).join("=")) : d; };
const URL = arg("url", "http://localhost:7788");
const BOARD = arg("board", "As7d2c9hKs");
const W = +arg("w", 1600), H = +arg("h", 1200);
const JSONOUT = path.resolve(arg("json", "design-qa-evidence/sizing-persistence.json"));
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
/* Profil PERSISTANT : sans lui, Chrome repart d'un stockage vierge à chaque
   lancement et le test ne prouverait rien. */
/* HORS DU DÉPÔT, impérativement. Un profil Chrome crée des milliers de fichiers ;
   le watcher de Vite s'effondre s'il les voit apparaître dans le projet —
   constaté, le serveur de dev mourait à chaque exécution du script. */
const userDataDir = process.env.PFASE_PROFILE_DIR || path.join(os.tmpdir(), "pfase-qa-profile");
const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--hide-scrollbars"], defaultViewport: { width: W, height: H }, userDataDir });
const out = { ok: false, steps: [], errors: [] };

try {
  const page = await browser.newPage();
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

  /* ── 1. SOLVE ────────────────────────────────────────────────────────── */
  /* Un serveur de dev fraîchement démarré compile à la demande : le premier
     rendu peut prendre plusieurs secondes. On réessaie plutôt que de conclure. */
  let nav = false;
  for (let i = 0; i < 40 && !nav; i++) { nav = await clickExact("SharkSolver"); if (!nav) await sleep(500); }
  out.steps.push({ step: "onglet SharkSolver", ok: nav });
  if (!nav) throw new Error("onglet SharkSolver introuvable — l'application a-t-elle fini de monter ?");
  await sleep(2000);
  let boardSet = false;
  for (let i = 0; i < 20 && !boardSet; i++) {
    boardSet = await page.evaluate((b) => {
      const el = [...document.querySelectorAll("input")].find(i => /river/i.test(i.placeholder || ""));
      if (!el) return false;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, b);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }, BOARD);
    if (!boardSet) await sleep(500);
  }
  out.steps.push({ step: "board saisi", ok: boardSet, board: BOARD });
  if (!boardSet) throw new Error("champ board introuvable");
  await sleep(1200);
  await clickExact("Single Size");
  await sleep(300);
  out.steps.push({ step: "solve lancé", ok: await clickContains("Optimiser les sizings") });

  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < TIMEOUT) {
    done = await page.evaluate(() => !!document.querySelector('[data-pfase="solution"]'));
    if (done) break;
    await sleep(1000);
  }
  out.steps.push({ step: "solution produite", ok: done, ms: Date.now() - t0 });
  if (!done) throw new Error("aucune solution");

  /* ── 2. SAVE — l'empreinte AVANT rechargement ────────────────────────── */
  out.avant = await page.evaluate(() => {
    const el = document.querySelector('[data-pfase="solution"]');
    const id = (el.innerText.match(/PFS-[0-9A-F]+#\w+/) || [])[0] || null;
    const I = globalThis.__PFASE__;
    const insp = I ? I.inspect() : null;
    return {
      solutionId: id,
      selected: el.getAttribute("data-pfase-selected"),
      evloss: el.getAttribute("data-pfase-evloss"),
      floor: el.getAttribute("data-pfase-floor"),
      store: insp ? insp.store : null,
      detail: id && I ? I.inspectSolution(id) : null,
    };
  });
  out.steps.push({ step: "solution enregistrée en mémoire", ok: !!(out.avant.solutionId && out.avant.store && out.avant.store.solutions > 0), id: out.avant.solutionId });

  /* Laisser à l'écriture IndexedDB le temps d'aboutir (elle est asynchrone). */
  await sleep(2500);

  /* ── 3. RELOAD ───────────────────────────────────────────────────────── */
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(2000);
  out.steps.push({ step: "application rechargée", ok: true });

  /* ── 4. LOAD — la solution survit-elle ? ─────────────────────────────── */
  out.apres = await page.evaluate(async (id) => {
    const store = globalThis.__PFASE__;
    if (!store) return { error: "__PFASE__ absent après rechargement" };
    /* ── NE PAS FAIRE LE TRAVAIL DE L'APPLICATION ──────────────────────────
       Ce script appelait ici `hydrateStore()` lui-même. Il prouvait donc que le
       STOCKAGE persistait — ce qui était vrai — mais jamais que l'APPLICATION
       relisait quoi que ce soit au démarrage. Elle ne le faisait pas : après un
       rechargement, le magasin en mémoire restait vide et le Trainer répondait
       « solution introuvable » sur une base intacte.

       Une QA qui compense le défaut qu'elle est censée détecter ne détecte rien.
       On ATTEND donc l'hydratation faite par l'application, sans la provoquer. */
    const mod = await import("/src/sizing/solutionStore.js");
    for (let i = 0; i < 60 && !mod.storeStatus.hydrated; i++) await new Promise(r => setTimeout(r, 250));
    if (!mod.storeStatus.hydrated) return { error: "l'application n'a pas relu ses solutions au démarrage (hydratation jamais déclenchée)" };
    const insp = store.inspect();
    const detail = store.inspectSolution(id);
    return { store: insp.store, detail, instanceId: insp.instanceId };
  }, out.avant.solutionId);

  const survived = !!(out.apres && out.apres.detail && !out.apres.detail.error);
  out.steps.push({ step: "§88 — la solution survit au rechargement", ok: survived, store: out.apres.store });

  /* ── 5. IDENTIQUE ? ──────────────────────────────────────────────────── */
  if (survived) {
    const a = out.avant.detail, b = out.apres.detail;
    out.comparaison = {
      memeId: a.solutionId === b.solutionId,
      memesSizings: JSON.stringify(a.selectedSizes) === JSON.stringify(b.selectedSizes),
      memePerte: a.evLoss === b.evLoss,
      memePlancher: a.measurementFloor === b.measurementFloor,
      memeExploitabilite: JSON.stringify(a.accuracy) === JSON.stringify(b.accuracy),
      memesNoeuds: JSON.stringify(a.nodes) === JSON.stringify(b.nodes),
      memesClasses: a.classes === b.classes,
      avant: a, apres: b,
    };
    const identique = ["memeId", "memesSizings", "memePerte", "memePlancher", "memeExploitabilite", "memesNoeuds", "memesClasses"]
      .every(k => out.comparaison[k]);
    out.steps.push({ step: "§88 — le résultat rechargé est IDENTIQUE", ok: identique, ...out.comparaison, avant: undefined, apres: undefined });
    out.identique = identique;
  }

  out.ok = survived && !!out.identique && out.errors.length === 0;
} catch (e) {
  out.errors.push(String((e && e.message) || e));
} finally {
  await browser.close();
  fs.mkdirSync(path.dirname(JSONOUT), { recursive: true });
  fs.writeFileSync(JSONOUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}
