'use strict';
/* ════════════════════════════════════════════════════════════════════
   PokerForge — Serveur Solver Pro (HTTP, zéro dépendance)
   Endpoints :
     GET  /health            → { ok, engine }
     POST /solve             → analyse d'un scénario (contrat PokerForge)
   Auth : si SOLVER_API_KEY est défini, exige  Authorization: Bearer <clé>.
   Config : SOLVER_PORT (def 8787), SOLVER_API_KEY (optionnel mais recommandé).
   Lancer :  SOLVER_API_KEY=xxxx node server.js
════════════════════════════════════════════════════════════════════════ */
const http = require("http");
const { solve } = require("./solver.js");

const PORT = parseInt(process.env.SOLVER_PORT || process.env.PORT || "8787", 10);
const API_KEY = process.env.SOLVER_API_KEY || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};
function send(res, code, obj) { res.writeHead(code, CORS); res.end(JSON.stringify(obj)); }

function authed(req) {
  if (!API_KEY) return true; // pas de clé configurée → ouvert (dev)
  const h = req.headers["authorization"] || "";
  return h === "Bearer " + API_KEY || h === API_KEY;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true });
  if (req.method === "GET" && req.url.startsWith("/health")) return send(res, 200, { ok: true, engine: "pro", auth: !!API_KEY });

  if (req.method === "POST" && req.url.startsWith("/solve")) {
    if (!authed(req)) return send(res, 401, { ok: false, error: "Clé API invalide." });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let payload = {};
      try { payload = JSON.parse(body || "{}"); } catch { return send(res, 400, { ok: false, error: "JSON invalide." }); }
      try { send(res, 200, solve(payload)); }
      catch (e) { send(res, 200, { ok: false, error: "Erreur moteur: " + (e && e.message || e) }); }
    });
    return;
  }
  send(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`PokerForge Solver Pro — http://localhost:${PORT}  (auth: ${API_KEY ? "ON" : "OFF"})`);
});
