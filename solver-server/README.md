# PokerForge — Solver Pro

Service HTTP **zéro-dépendance** qui calcule l'analyse d'un spot avec **équité réelle**
(évaluateur 7 cartes + Monte-Carlo main-vs-range), ranges préflop par force de main
(RFI / défense / push-fold short), décision postflop pilotée par l'équité vs pot odds,
et modes GTO / Exploit / ICM / ChipEV.

Il se branche à PokerForge via l'edge function `solver-analyze` (secrets `SOLVER_API_URL` + `SOLVER_API_KEY`).
Tant qu'il n'est pas branché, PokerForge tourne sur son moteur heuristique local (« ANALYSE ESTIMÉE »).

---

## 1. Lancer en local (test)

```bash
cd solver-server
# (optionnel) protéger l'endpoint
export SOLVER_API_KEY="ma-cle-secrete-longue"     # Windows PowerShell : $env:SOLVER_API_KEY="..."
node server.js            # → http://localhost:8787
node test.js             # 10 tests (évaluateur, équité, décisions)
```

Test rapide :
```bash
curl -s http://localhost:8787/health
curl -s -X POST http://localhost:8787/solve \
  -H "Authorization: Bearer ma-cle-secrete-longue" -H "Content-Type: application/json" \
  -d '{"heroPos":"BTN","vilPos":"BB","street":"Flop","board":"Ks 7h 2c","heroCards":"Ks Kh","heroStack":100,"vilStack":100,"potBb":6}'
# → { ok:true, engine:"pro", estimated:false, spot:{equity:97,…}, reco:{label:"Value bet 33% pot",…}, … }
```

## 2. Héberger (URL publique HTTPS)

Le serveur lit le port dans `SOLVER_PORT`, sinon `PORT` (fourni par Render/Railway/Fly).

### Option A — Docker (n'importe où)
```bash
cd solver-server
docker build -t pokerforge-solver .
docker run -d --name solver -p 8787:8787 \
  -e SOLVER_API_KEY="ma-cle-secrete-longue" \
  pokerforge-solver
curl -s http://localhost:8787/health    # { ok:true, engine:"pro", auth:true }
```
Puis expose le conteneur en HTTPS (reverse-proxy Nginx/Caddy, ou un PaaS Docker).

### Option B — Render (1 clic, gratuit)
1. Pousse le dossier `solver-server/` sur un repo GitHub.
2. Render → New → **Blueprint** → sélectionne le repo (il lit `render.yaml`).
3. Render build le `Dockerfile` et te donne une URL HTTPS (`https://pokerforge-solver-pro.onrender.com`).
4. Dans le service → **Environment** → ajoute `SOLVER_API_KEY` (clé secrète longue).

### Option C — Railway / Fly.io
Détecte le `Dockerfile` automatiquement. Définis la variable d'env `SOLVER_API_KEY`.

### Option D — VPS
```bash
SOLVER_API_KEY="..." pm2 start server.js --name solver-pro   # derrière Nginx + HTTPS
```

Génère une clé secrète : `openssl rand -hex 32`. Définis-la dans **`SOLVER_API_KEY`** côté hébergeur.

## 3. Brancher à PokerForge (les clés)

Dans **Supabase → Edge Functions → `solver-analyze` → Secrets**, ajoute :

| Secret | Valeur |
|---|---|
| `SOLVER_API_URL` | `https://ton-domaine/solve` (l'URL publique du serveur) |
| `SOLVER_API_KEY` | la **même** clé que `SOLVER_API_KEY` du serveur |

→ PokerForge appelle alors le vrai solver : badge **`engine:"pro"`**, `estimated:false`, équité réelle.
Si l'URL est absente ou le serveur injoignable → fallback automatique sur l'heuristique (rien ne casse).

## 4. Contrat HTTP

`POST /solve` — corps (tous les champs optionnels, défauts raisonnables) :
```json
{ "format":"Cash|MTT|KO|PKO", "players":6, "heroPos":"BTN", "vilPos":"BB",
  "heroStack":100, "vilStack":100, "potBb":6, "street":"Preflop|Flop|Turn|River",
  "board":"Ks 7h 2c", "heroCards":"Ks Kh", "prevAction":"bets 4",
  "villainProfile":"Nit|Fish|TAG|LAG|Reg|Maniac", "mode":"gto|exploit|icm|chipev" }
```
Réponse (format PokerForge — passthrough côté edge function) :
```json
{ "ok":true, "estimated":false, "engine":"pro",
  "spot":{ "...":"...", "equity":97 },
  "reco":{ "action","label","freq","evBb","sizing","confidence" },
  "alts":[ {"action","freq","evBb","comment"} ],
  "coach":{ "explanation","mistake","exploit" },
  "ranges":{ "heroAction","heroLabel","vilAction","vilLabel" } }
```
Scénario invalide → `{ "ok":false, "error":"…", "fix":{…} }` (PokerForge propose la correction).

## 5. Brancher un solver tiers (GTO Wizard / Pio) à la place

Pointe `SOLVER_API_URL` vers leur API et adapte le mapping dans l'edge function
`solver-analyze` (fonction `mapExternal`) si leur format diffère (`best_action`, `actions[]`, …).
L'edge function gère déjà les deux cas (passthrough format PokerForge, ou mapping générique).

## Limites
Le postflop résout un nœud (1 street) à l'équité ; pas d'arbre multi-rue complet (ce n'est pas Pio).
Pour de la résolution GTO complète, branche un vrai solveur via l'étape 5.
