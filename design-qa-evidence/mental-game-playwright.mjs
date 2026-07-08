import { chromium } from "file:///C:/Users/Shark_cutter/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = "http://127.0.0.1:5173/";

async function openMentalGame(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".lnav-item").filter({ hasText: "Coach AI" }).dispatchEvent("click");
  await page.locator(".coachai-ntab").filter({ hasText: "Mental Game" }).dispatchEvent("click");
  await page.locator(".mgx-dashboard").waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluateAll((images) => Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return image.decode?.().catch(() => {});
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  })));
  await page.waitForTimeout(500);
}

async function collectLayout(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width),
        height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom),
      };
    };
    const overlaps = (a, b) => a && b && !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);
    const hero = box(".mgx-hero-v2");
    const nav = box(".mgx-nav");
    const score = box(".mgx-score-card");
    const radar = box(".mgx-radar-card");
    const recommendations = box(".mgx-recommendations");
    const progress = box(".mgx-progress-panel");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      boxes: { hero, nav, score, radar, recommendations, progress },
      overlapChecks: {
        heroNav: overlaps(hero, nav),
        scoreRadar: overlaps(score, radar),
        recommendationsProgress: overlaps(recommendations, progress),
      },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newPage({ viewport: { width: 1680, height: 936 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const failedRequests = [];
desktop.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
desktop.on("pageerror", (error) => consoleErrors.push(error.message));
desktop.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
await openMentalGame(desktop);
await desktop.screenshot({ path: path.join(here, "mental-game-desktop-1680x936.png"), fullPage: false });
const desktopLayout = await collectLayout(desktop);

await desktop.getByRole("button", { name: /Je suis en tilt/i }).click();
await desktop.getByText(/Protocole anti-tilt/i).waitFor({ state: "visible" });
const tiltModalVisible = await desktop.getByText(/Protocole anti-tilt/i).isVisible();
await desktop.getByRole("button", { name: /^Reprendre$/i }).click();

await desktop.getByRole("textbox", { name: /Entrée rapide du journal mental/i }).fill("Session calme et concentrée.");
await desktop.getByRole("button", { name: /Enregistrer/i }).click().catch(async () => {
  await desktop.locator(".mgx-quick-journal button").click();
});
const quickJournalSaved = /Enregistré/i.test(await desktop.locator(".mgx-quick-journal button").innerText());

await desktop.locator(".mgx-nav button").filter({ hasText: "Exercices" }).click();
const exercisesVisible = /Exercices/i.test(await desktop.locator('.mgx-nav button[aria-pressed="true"]').innerText());
await desktop.locator(".mgx-nav button").filter({ hasText: "Dashboard" }).click();
await desktop.locator(".mgx-dashboard").waitFor({ state: "visible" });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
mobile.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(`[mobile] ${msg.text()}`); });
mobile.on("pageerror", (error) => consoleErrors.push(`[mobile] ${error.message}`));
mobile.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
await openMentalGame(mobile);
await mobile.screenshot({ path: path.join(here, "mental-game-mobile-390x844.png"), fullPage: true });
const mobileLayout = await collectLayout(mobile);
await mobile.locator(".mgx-radar-card").scrollIntoViewIfNeeded();
await mobile.waitForTimeout(200);
await mobile.screenshot({ path: path.join(here, "mental-game-mobile-lower-390x844.png"), fullPage: false });

console.log(JSON.stringify({ desktopLayout, mobileLayout, tiltModalVisible, quickJournalSaved, exercisesVisible, consoleErrors, failedRequests }, null, 2));
await browser.close();
