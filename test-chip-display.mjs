/* test-chip-display.mjs — ChipDisplayResolver §33 */
import assert from "node:assert/strict";
import { resolveChipDisplay, chipLabel } from "./src/chipDisplayResolver.js";
import { trainerChipPileCount } from "./src/trainerActionEvent.js";

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); passed++; };

/* ── 1. pileCount aligné sur la source unique trainerChipPileCount ── */
for (const amt of [0, 1, 2.5, 8.5, 20, 50, 100]) {
  eq(resolveChipDisplay({ amount: amt }).pileCount, trainerChipPileCount(amt), `pileCount(${amt}) = source unique`);
}

/* ── 2. Label EXACT préservé (jamais arrondi) ── */
{
  eq(resolveChipDisplay({ amount: 2.5 }).label, "2.5bb", "label exact 2.5bb");
  eq(resolveChipDisplay({ amount: 18.5 }).label, "18.5bb", "label exact 18.5bb");
  eq(resolveChipDisplay({ amount: 40 }).label, "40bb", "label exact 40bb");
  eq(chipLabel(0), "", "montant nul → pas de label");
}

/* ── 3. Montant nul → aucune pile ── */
{
  const r = resolveChipDisplay({ amount: 0 });
  eq(r.pileCount, 0, "0 pile"); eq(r.stacks.length, 0, "aucune pile"); eq(r.totalChips, 0, "aucun jeton");
}

/* ── 4. Jamais « 20 jetons superposés » (§33) — hauteur et piles bornées ── */
for (const amt of [1, 5, 20, 55, 100, 200, 999]) {
  const r = resolveChipDisplay({ amount: amt, isAllIn: amt >= 200 });
  ok(r.stacks.length <= 4, `≤ 4 piles pour ${amt}bb`);
  ok(r.stacks.every((s) => s.count <= 5), `chaque pile ≤ 5 jetons (${amt}bb)`);
  ok(r.totalChips <= 20, `total jetons borné (${amt}bb → ${r.totalChips})`);
}

/* ── 5. Proportionnalité : plus le montant est gros, ≥ de piles ── */
{
  ok(resolveChipDisplay({ amount: 2 }).pileCount <= resolveChipDisplay({ amount: 10 }).pileCount, "2bb ≤ 10bb");
  ok(resolveChipDisplay({ amount: 10 }).pileCount <= resolveChipDisplay({ amount: 100 }).pileCount, "10bb ≤ 100bb");
}

/* ── 6. All-in → 4 piles ── */
{
  eq(resolveChipDisplay({ amount: 15, isAllIn: true }).pileCount, 4, "all-in = 4 piles");
}

/* ── 7. Échelle selon la table (proportion §33) ── */
{
  eq(resolveChipDisplay({ amount: 10, tableScale: 1 }).scale, 1, "1T = échelle 1");
  ok(resolveChipDisplay({ amount: 10, tableScale: 2 }).scale < 1, "2T réduit");
  ok(resolveChipDisplay({ amount: 10, tableScale: 4 }).scale < resolveChipDisplay({ amount: 10, tableScale: 2 }).scale, "4T < 2T");
  eq(resolveChipDisplay({ amount: 10, tableScale: 0.5 }).scale, 0.5, "échelle explicite passe telle quelle");
}

/* ── 8. Les dénominations décomposent le montant sans le dépasser grossièrement ── */
{
  const r = resolveChipDisplay({ amount: 27 });
  const sum = r.stacks.reduce((s, st) => s + st.denom * st.count, 0);
  ok(sum > 0 && sum <= 27 + 5, "somme des jetons proche du montant (≤ +5 de tolérance visuelle)");
  ok(r.stacks[0].denom >= r.stacks[r.stacks.length - 1].denom, "piles ordonnées grosse → petite dénomination");
}

/* ── 9. chipTheme transmis ── */
{
  eq(resolveChipDisplay({ amount: 5, chipTheme: "vip_gold" }).chipTheme, "vip_gold", "chipTheme passthrough");
}

console.log(`✅ chipDisplayResolver (§33) — ${passed} assertions OK`);
