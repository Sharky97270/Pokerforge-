# ── PokerForge Solver Pro — image de production (zéro dépendance) ──
FROM node:18-alpine

WORKDIR /app

# Aucune dépendance npm → on copie juste les sources
COPY package.json ./
COPY solver.js server.js ./

# Le serveur écoute SOLVER_PORT, sinon PORT (Render/Railway), sinon 8787
ENV SOLVER_PORT=8787
EXPOSE 8787

# Utilisateur non-root (sécurité)
USER node

# Healthcheck (le endpoint /health ne requiert pas de clé)
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${SOLVER_PORT:-8787}/health" || exit 1

CMD ["node", "server.js"]
