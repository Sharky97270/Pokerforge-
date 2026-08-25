const fs = require('fs');
const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
const repFile = (p, pairs) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    let d = false;
    for (const [pat, r2] of [[a, b], [a.split(LF).join(CRLF), b.split(LF).join(CRLF)]]) {
      if (s.includes(pat)) { s = s.replace(pat, r2); d = true; break; }
    }
    if (!d) { console.error('MISS [' + p + '] : ' + a.slice(0, 80)); process.exit(1); }
  }
  fs.writeFileSync(p, s);
};

repFile('src/sizing/pfase.js', [
  /* ── verdictFor : EV jouée / EV la meilleure / écart ───────────────────── */
  [`function verdictFor(node, match, played) {
  const best = bestOf(node);
  const freq = match.frequency ?? 0;
  return {
    ok: true, inTree: true, node, played,
    matched: {
      label: match.label, actionType: match.actionType,
      toBb: match.toBb, additionalBb: match.additionalBb,
      potFraction: match.potFraction, specLabel: match.specLabel,
      frequency: roundEv(freq),
    },
    bestAction: best,
    /* Un verdict de FRÉQUENCE, pas d'EV : à un nœud, l'EV par action n'est pas
       extraite de la solution stockée (elle exigerait de conserver les valeurs
       contrefactuelles). On le dit plutôt que d'en fabriquer une. */
    evAvailable: false,
    evNote: "L'EV par action à ce nœud n'est pas conservée dans la solution. L'écart d'EV entre SIZINGS est disponible dans \`actionRanking\` (mesuré à la sélection).",
    verdict: freq >= 0.05 ? (best && match.label === best.label ? "action majoritaire" : "action de la solution") : "action rare dans la solution",
    frequencySource: node.frequencySource,
  };
}
function bestOf(node) {
  if (!node.actions || !node.actions.length) return null;
  return node.actions.reduce((m, a) => ((a.frequency ?? 0) > (m.frequency ?? 0) ? a : m), node.actions[0]);
}`,
   `function verdictFor(node, match, played) {
  const best = bestOf(node);
  const freq = match.frequency ?? 0;
  const ev = evVerdict(node, match.label);
  return {
    ok: true, inTree: true, node, played,
    matched: {
      label: match.label, actionType: match.actionType,
      toBb: match.toBb, additionalBb: match.additionalBb,
      potFraction: match.potFraction, specLabel: match.specLabel,
      frequency: roundEv(freq),
      evBb: ev.evPlayed,
    },
    bestAction: best,
    bestByEV: ev.bestByEV,
    ...ev.payload,
    verdict: freq >= 0.05 ? (best && match.label === best.label ? "action majoritaire" : "action de la solution") : "action rare dans la solution",
    frequencySource: node.frequencySource,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   evVerdict — « EV played · EV best · EV difference » (§49), et l'EV loss (§36)

   Deux notions de « meilleure action » cohabitent, et les confondre est une
   faute de fond :

     · la PLUS FRÉQUENTE (\`bestAction\`) — ce que la solution joue le plus ;
     · la MIEUX VALORISÉE (\`bestByEV\`) — ce qui rapporte le plus ici.

   À l'équilibre elles ne coïncident PAS forcément : une stratégie mixte rend
   plusieurs actions indifférentes, et l'action la plus fréquente peut avoir une
   EV très légèrement inférieure à une autre. L'écart d'EV se mesure donc contre
   la seconde, jamais contre la première.

   \`evLoss\` est par construction ≥ 0, aux résidus de convergence près. On ne la
   tronque PAS à zéro : une valeur négative est le signe d'une sous-convergence,
   et l'effacer reviendrait à masquer un défaut de mesure. \`evLossBelowNoise\`
   dit quand l'écart ne dépasse pas le résidu d'équilibre du nœud (§14/§21) —
   c'est-à-dire quand il ne faut PAS présenter cet écart comme une erreur.
   ══════════════════════════════════════════════════════════════════════════ */
function evVerdict(node, playedLabel) {
  if (!node.evAvailable) {
    return {
      evPlayed: null, bestByEV: null,
      payload: {
        evAvailable: false,
        evNote: node.evNote || "L'EV par action n'a pas été calculée pour ce nœud. L'écart d'EV entre SIZINGS reste disponible dans \`actionRanking\` (mesuré à la sélection).",
      },
    };
  }
  const withEv = node.actions.filter(a => a.evBb != null);
  if (!withEv.length) {
    return { evPlayed: null, bestByEV: null, payload: { evAvailable: false, evNote: "aucune action chiffrée à ce nœud" } };
  }
  const bestByEV = withEv.reduce((m, a) => (a.evBb > m.evBb ? a : m), withEv[0]);
  const playedAct = withEv.find(a => a.label === playedLabel) || null;
  const evPlayed = playedAct ? roundEv(playedAct.evBb) : null;
  const evBest = roundEv(bestByEV.evBb);
  /* Résidu d'équilibre du nœud : l'étalement d'EV entre les actions RÉELLEMENT
     jouées. À l'équilibre elles sont indifférentes, donc cet étalement mesure
     ce qui reste de non convergé — et sert de plancher au verdict. */
  const played = withEv.filter(a => (a.frequency ?? 0) >= 0.05);
  const spread = played.length >= 2
    ? roundEv(Math.max(...played.map(a => a.evBb)) - Math.min(...played.map(a => a.evBb)))
    : 0;
  const evLoss = evPlayed == null ? null : roundEv(evBest - evPlayed);
  return {
    evPlayed, bestByEV,
    payload: {
      evAvailable: evPlayed != null,
      evPlayedBb: evPlayed,
      evBestBb: evBest,
      evLossBb: evLoss,
      evBestLabel: bestByEV.label,
      evBestSpecLabel: bestByEV.specLabel,
      evSource: node.evSource,
      evExact: node.evExact,
      evIsRangeWide: !!node.evIsRangeWide,
      evEquilibriumResidualBb: spread,
      evLossBelowNoise: evLoss != null && evLoss <= spread,
      evNote: node.evIsRangeWide
        ? "EV calculée sur la RANGE ENTIÈRE (la main jouée n'est pas dans la range solvée) : elle répond à « que vaudrait cette action si toute la range la prenait »."
        : (node.evExact ? null : "board incomplet : EV moyennée sur des runouts échantillonnés, reproductible mais non exacte."),
    },
  };
}

function bestOf(node) {
  if (!node.actions || !node.actions.length) return null;
  return node.actions.reduce((m, a) => ((a.frequency ?? 0) > (m.frequency ?? 0) ? a : m), node.actions[0]);
}`],

  /* ── hors-arbre : on chiffre quand même la MEILLEURE action étudiée ─────── */
  [`      verdict: "hors-arbre",
      evAvailable: false,
      reason: \`l'action \${type} n'existe pas à ce nœud de la solution\`,
      bestAction: bestOf(node),
    };`,
   `      verdict: "hors-arbre",
      /* L'EV de l'action JOUÉE reste indisponible — elle n'est pas dans l'arbre.
         Celle de la meilleure action étudiée, elle, est connue : on la donne,
         explicitement séparée, sans jamais l'attribuer à ce qui a été joué (§50). */
      ...evContextOnly(node, "hors de l'arbre"),
      reason: \`l'action \${type} n'existe pas à ce nœud de la solution\`,
      bestAction: bestOf(node),
    };`],

  [`    verdict: "sizing non étudié",
    evAvailable: false,
    reason: \`le sizing joué (\${target}bb) n'existe pas dans l'arbre résolu — EV exacte indisponible\`,`,
   `    verdict: "sizing non étudié",
    ...evContextOnly(node, "ce sizing n'a pas été résolu"),
    reason: \`le sizing joué (\${target}bb) n'existe pas dans l'arbre résolu — EV exacte indisponible\`,`],
]);

/* Helper partagé par les deux cas « pas dans l'arbre ». */
let s = fs.readFileSync('src/sizing/pfase.js', 'utf8');
const anchor = 'function bestOf(node) {';
const helper = `/* L'action jouée n'est pas dans l'arbre : son EV est INCONNUE, et le rester.
   On publie seulement l'EV de la meilleure action ÉTUDIÉE, étiquetée comme telle —
   §50 interdit de la reporter sur ce qui a été joué. */
function evContextOnly(node, why) {
  const v = evVerdict(node, null);
  return {
    evAvailable: false,
    evBestBb: v.payload.evBestBb ?? null,
    evBestLabel: v.payload.evBestLabel ?? null,
    evNote: v.payload.evBestBb != null
      ? \`EV de l'action jouée indisponible (\${why}). « evBestBb » est l'EV de la meilleure action ÉTUDIÉE : l'attribuer à l'action jouée serait une extrapolation (§50).\`
      : v.payload.evNote,
  };
}

function bestOf(node) {`;
if (!s.includes(anchor)) { console.error('MISS anchor bestOf'); process.exit(1); }
s = s.replace(anchor, helper);
fs.writeFileSync('src/sizing/pfase.js', s);
console.log('ok');
