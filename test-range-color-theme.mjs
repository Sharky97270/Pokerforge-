/* Tests — Range Color Theme partagé (spec « Personnalisation des couleurs »).
   Lancement : node test-range-color-theme.mjs                                */

/* Shim localStorage (module pur, lecture paresseuse → shim avant tout appel) */
const _mem = new Map();
globalThis.localStorage = {
  getItem:k=>(_mem.has(k)?_mem.get(k):null),
  setItem:(k,v)=>{_mem.set(k,String(v));},
  removeItem:k=>{_mem.delete(k);},
  clear:()=>_mem.clear(),
};

const {
  RANGE_ACTIONS, ACTION_KEYS, RANGE_PRESETS, PRESET_LIST, DEFAULT_PRESET_ID,
  normalizeHex, rgba, loadRangeColorSettings, resolveRangeTheme,
  setRangePreset, setRangeColor, setRangeGlobalSync, resetRangeColors,
  restorePokerForge, rangeCellBackground, dominantAction, buildLegend,
  legacyToParts, subscribeRangeTheme,
} = await import("./src/rangeColorTheme.js");

let passed=0, failed=0;
function ok(c,m){ if(c) passed++; else { failed++; console.error("  ✗ "+m); } }
function section(t){ console.log("\n── "+t); }
const reset = ()=>_mem.clear();

/* ── 1. Palette par défaut : rien à configurer (§3) ── */
section("Palette par défaut");
reset();
{
  const th = resolveRangeTheme("replayer");
  ok(th.preset===DEFAULT_PRESET_ID, "preset par défaut = PokerForge");
  ok(th.colors.raise===RANGE_PRESETS.pokerforge.colors.raise, "couleurs = palette PokerForge");
  ok(ACTION_KEYS.every(k=>/^#[0-9A-F]{6}$/.test(th.colors[k])), "toutes les actions ont une couleur hex valide");
  ok(!th.custom, "aucune personnalisation par défaut");
}

/* ── 2. Presets (§4) ── */
section("Presets");
{
  ok(PRESET_LIST.length>=4, "au moins 4 presets");
  ok(!!RANGE_PRESETS.colorblind, "preset accessibilité/daltonisme présent (§11)");
  ok(!!RANGE_PRESETS.colorblind.patterns, "le preset accessibilité fournit des motifs non chromatiques");
  reset();
  setRangePreset("replayer","high_contrast");
  const th = resolveRangeTheme("replayer");
  ok(th.preset==="high_contrast", "preset appliqué");
  ok(th.colors.raise===RANGE_PRESETS.high_contrast.colors.raise, "couleurs du preset actives");
  // les presets ne touchent que les actions : aucune autre clé n'est produite
  ok(Object.keys(th.colors).length===ACTION_KEYS.length, "le preset ne modifie que les couleurs d'actions");
}

/* ── 3. Personnalisation par action + persistance (§2/§5/§8) ── */
section("Couleur par action & persistance");
{
  reset();
  setRangeColor("replayer","bet75","#123abc");
  const th = resolveRangeTheme("replayer");
  ok(th.colors.bet75==="#123ABC", "couleur personnalisée appliquée (normalisée en majuscules)");
  ok(th.custom, "flag custom actif");
  // persistance : relecture depuis le stockage
  const again = resolveRangeTheme("replayer", loadRangeColorSettings());
  ok(again.colors.bet75==="#123ABC", "personnalisation persistée");
  ok(normalizeHex("abc")==="#AABBCC" && normalizeHex("#ABC")==="#AABBCC", "hex court accepté");
  ok(normalizeHex("nope")===null, "hex invalide rejeté");
  // une couleur invalide ne casse rien
  setRangeColor("replayer","bet75","zzz");
  ok(resolveRangeTheme("replayer").colors.bet75==="#123ABC", "hex invalide ignoré (valeur conservée)");
}

/* ── 4. Réinitialisation / restauration (§10) ── */
section("Réinitialisation");
{
  reset();
  setRangePreset("replayer","gto_classic");
  setRangeColor("replayer","call","#FF0000");
  resetRangeColors("replayer");
  let th = resolveRangeTheme("replayer");
  ok(th.colors.call===RANGE_PRESETS.gto_classic.colors.call, "reset : couleurs du preset retrouvées");
  ok(th.preset==="gto_classic", "reset conserve le preset");
  restorePokerForge("replayer");
  th = resolveRangeTheme("replayer");
  ok(th.preset===DEFAULT_PRESET_ID && th.colors.call===RANGE_PRESETS.pokerforge.colors.call,
    "restauration complète de la palette PokerForge");
}

/* ── 5. Synchronisation inter-modules (§9) ── */
section("Synchronisation inter-modules");
{
  reset();
  setRangeGlobalSync(true);
  setRangeColor("replayer","raise","#00FF00");
  ok(resolveRangeTheme("trainer").colors.raise==="#00FF00", "sync ON : la palette s'applique à tous les modules");
  reset();
  setRangeGlobalSync(false);
  setRangeColor("replayer","raise","#00FF00");
  ok(resolveRangeTheme("replayer").colors.raise==="#00FF00", "sync OFF : module configuré modifié");
  ok(resolveRangeTheme("trainer").colors.raise!=="#00FF00", "sync OFF : autre module non impacté");
}

/* ── 6. Ranges mixées : proportions préservées (§6) ── */
section("Ranges mixées");
{
  reset();
  const th = resolveRangeTheme("replayer");
  const parts=[{key:"check",pct:60},{key:"bet33",pct:30},{key:"bet75",pct:10}];
  const snapshot=JSON.stringify(parts);
  const bg=rangeCellBackground(parts,th);
  ok(bg.startsWith("linear-gradient"), "cellule mixte → dégradé");
  ok(bg.includes("60.00%")&&bg.includes("90.00%")&&bg.includes("100.00%"),
    "paliers proportionnels aux fréquences (60/90/100)");
  ok(JSON.stringify(parts)===snapshot, "les fréquences ne sont JAMAIS modifiées par le rendu");
  const solo=rangeCellBackground([{key:"call",pct:100}],th);
  ok(solo.startsWith("rgba("), "cellule mono-action → couleur pleine");
  ok(dominantAction(parts)==="check", "action dominante identifiée");
  // changer une couleur ne change pas les proportions
  setRangeColor("replayer","check","#ABCDEF");
  const bg2=rangeCellBackground(parts,resolveRangeTheme("replayer"));
  ok(bg2.includes("60.00%")&&bg2.includes("90.00%"), "changer une couleur ne change pas les proportions");
  ok(bg2.includes("171,205,239"), "nouvelle couleur bien utilisée");
}

/* ── 7. Légende dynamique (§7) ── */
section("Légende dynamique");
{
  reset();
  const th=resolveRangeTheme("replayer");
  const lg=buildLegend(["check","bet33","bet75"],th);
  ok(lg.length===3, "seules les actions présentes sont listées");
  ok(lg[0].key==="check"&&lg[0].color===th.colors.check, "légende synchronisée avec le thème");
  ok(buildLegend(["bet33"],th).length===1, "aucun sizing inexistant affiché");
}

/* ── 8. Compat clés Trainer historiques ── */
section("Compat clés legacy");
{
  ok(legacyToParts("r")[0].key==="raise", "r → raise");
  ok(legacyToParts("f")[0].key==="fold", "f → fold");
  const rc=legacyToParts("rc");
  ok(rc.length===2 && rc[0].key==="raise" && rc[1].key==="call", "rc → mixte raise/call");
  const fromFreq=legacyToParts("r",{r:70,c:20,f:10});
  ok(fromFreq.length===3 && fromFreq[0].pct===70, "fréquences réelles prioritaires sur la clé");
}

/* ── 9. Abonnement live ── */
section("Abonnement");
{
  reset();
  let n=0;
  const un=subscribeRangeTheme(()=>{n++;});
  setRangeColor("replayer","fold","#111111");
  ok(n>0, "les abonnés sont notifiés d'un changement");
  un();
  const before=n;
  setRangeColor("replayer","fold","#222222");
  ok(n===before, "désabonnement effectif");
}

console.log(`\n${failed===0?"✅":"❌"} Range Color Theme : ${passed} ok, ${failed} échec(s)`);
process.exit(failed===0?0:1);
