/* Tests — Configuration Supabase : normalisation de l'URL de projet.
   Lancement : node test-supabase-config.mjs

   Régression réelle observée en production : `VITE_SUPABASE_URL` valait
   `https://<ref>.supabase.co/rest/v1/` (l'URL de l'API REST, copiée depuis le
   dashboard, au lieu de l'URL du projet). Conséquence silencieuse et totale :
     • connexion   → POST /rest/v1/auth/v1/token       → 404 PGRST125
     • edge funcs  → POST /rest/v1/functions/v1/<fn>   → 404 PGRST125
     • synchro cloud, coach-chat, meditation-tts, analyze-hand : tout tombe.
   Le message renvoyé — « Invalid path specified in request URL » — ne désigne
   jamais la cause, d'où ce garde-fou testé.                                  */

let passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.error("  ✗ " + m); } }
function section(t) { console.log("\n── " + t); }

/* Réplique exacte de normalizeProjectUrl (module non importable seul : il lit
   import.meta.env, indisponible hors Vite). Le test ci-dessous vérifie en plus
   que les deux implémentations restent identiques. */
function normalizeProjectUrl(raw, fallback) {
  const v = String(raw || "").trim();
  if (!v) return fallback;
  try { return new URL(v).origin; } catch { return fallback; }
}

const REF = "https://uspwvzbvjnuwdmvhoegk.supabase.co";
const FB = REF;
const n = v => normalizeProjectUrl(v, FB);

section("URL de projet correcte — inchangée");
ok(n(REF) === REF, "origine simple conservée");
ok(n(REF + "/") === REF, "slash final retiré");
ok(n("  " + REF + "  ") === REF, "espaces parasites retirés");

section("URLs d'API du dashboard — ramenées à l'origine");
ok(n(REF + "/rest/v1") === REF, "/rest/v1 retiré");
ok(n(REF + "/rest/v1/") === REF, "/rest/v1/ retiré (cas observé en production)");
ok(n(REF + "/auth/v1") === REF, "/auth/v1 retiré");
ok(n(REF + "/functions/v1") === REF, "/functions/v1 retiré");
ok(n(REF + "/rest/v1?apikey=abc") === REF, "query string retirée");
ok(n(REF + "/rest/v1#frag") === REF, "fragment retiré");

section("Valeurs absentes ou invalides — repli sur le fallback");
ok(n(undefined) === FB, "undefined → fallback");
ok(n("") === FB, "chaîne vide → fallback");
ok(n("   ") === FB, "espaces seuls → fallback");
ok(n("pas-une-url") === FB, "chaîne non-URL → fallback");
ok(n("uspwvzbvjnuwdmvhoegk.supabase.co") === FB, "URL sans schéma → fallback");

section("Chemins reconstruits par l'application");
const fnUrl = name => `${n(REF + "/rest/v1/")}/functions/v1/${name}`;
ok(fnUrl("analyze-hand") === REF + "/functions/v1/analyze-hand", "edge function correcte malgré une variable polluée");
ok(!fnUrl("analyze-hand").includes("/rest/v1/"), "plus aucun /rest/v1 dans le chemin");
ok(!fnUrl("analyze-hand").includes("//functions"), "pas de double slash");
for (const fn of ["coach-chat", "meditation-tts", "solver-analyze", "ranges-compare"]) {
  ok(fnUrl(fn) === `${REF}/functions/v1/${fn}`, `chemin correct pour ${fn}`);
}

section("Le module de configuration porte bien le garde-fou");
const src = (await import("node:fs")).readFileSync("./src/config/supabase.js", "utf8");
ok(/function normalizeProjectUrl/.test(src), "normalizeProjectUrl présent dans le module");
ok(/new URL\(v\)\.origin/.test(src), "la normalisation utilise bien URL().origin");
ok(/SUPABASE_URL = normalizeProjectUrl\(/.test(src), "SUPABASE_URL passe par la normalisation");
ok(!/SUPABASE_URL = env\.VITE_SUPABASE_URL \|\|/.test(src), "l'ancienne affectation brute a disparu");

console.log(`\n${failed === 0 ? "✅" : "❌"} config Supabase : ${passed} assertions OK, ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
