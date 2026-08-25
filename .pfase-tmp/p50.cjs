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

/* Le bloc d'EV publié par les deux ponts — même forme des deux côtés, pour que
   le Trainer et le Replayer n'aient pas deux vocabulaires pour une même mesure. */
const EV_BLOCK = `      /* §36/§49 — EV jouée · EV la meilleure · écart. Absentes tant que
         \`evAvailable\` est faux : aucun consommateur ne doit fabriquer un nombre. */
      evAvailable: cmp.evAvailable,
      evPlayedBb: cmp.evPlayedBb ?? null,
      evBestBb: cmp.evBestBb ?? null,
      evLossBb: cmp.evLossBb ?? null,
      evBestLabel: cmp.evBestSpecLabel || cmp.evBestLabel || null,
      evExact: cmp.evExact ?? null,
      evSource: cmp.evSource || null,
      evIsRangeWide: !!cmp.evIsRangeWide,
      /* L'écart tient-il dans le résidu d'indifférence du nœud ? Si oui, ce
         n'est PAS une erreur : à l'équilibre les actions mixées se valent. */
      evEquilibriumResidualBb: cmp.evEquilibriumResidualBb ?? null,
      evLossBelowNoise: cmp.evLossBelowNoise ?? null,
      evNote: cmp.evNote || cmp.reason || null,`;

repFile('src/sizing/replayerBridge.js', [
  [`      /* §50 — jamais l'EV du voisin. */
      evAvailable: cmp.evAvailable,
      evNote: cmp.evNote || cmp.reason || null,
      nearestStudied: cmp.nearestStudied || null,`,
   `      /* §50 — jamais l'EV du voisin. */
${EV_BLOCK}
      nearestStudied: cmp.nearestStudied || null,`],

  /* Le résumé §49 doit maintenant AFFICHER les trois lignes quand elles existent. */
  [`  const withEv = cmp.rows.find(r => r.available && r.evAvailable);
  if (!withEv) {
    out.push("EV exacte indisponible — l'EV par action n'est pas conservée dans les solutions stockées.");
    const near = cmp.rows.find(r => r.available && r.nearestStudied);
    if (near) out.push(\`Sizing étudié le plus proche : \${near.nearestStudied.specLabel || near.nearestStudied.toBb + "bb"} (comparaison approximative — sa fréquence ne s'applique pas au sizing joué).\`);
  }
  return out;`,
   `  /* ── LES TROIS LIGNES DU §49 ────────────────────────────────────────────
     « EV played · EV best · EV difference ». Elles n'apparaissent que si l'EV a
     réellement été calculée pour ce nœud ; sinon on dit pourquoi, et l'on cite
     au mieux le sizing étudié voisin — sans lui emprunter son chiffre. */
  const withEv = cmp.rows.find(r => r.available && r.evAvailable);
  if (withEv) {
    const u = withEv.evExact ? "" : " (moyenne sur runouts échantillonnés)";
    out.push(\`EV jouée : \${withEv.evPlayedBb} bb\${u}\`);
    out.push(\`EV de la meilleure action : \${withEv.evBestBb} bb\${withEv.evBestLabel ? \` (\${withEv.evBestLabel})\` : ""}\`);
    out.push(withEv.evLossBelowNoise
      ? \`Écart d'EV : \${withEv.evLossBb} bb — dans le résidu d'indifférence du nœud (\${withEv.evEquilibriumResidualBb} bb) : les deux actions se valent à l'équilibre, ce n'est pas une erreur.\`
      : \`Écart d'EV : \${withEv.evLossBb} bb\`);
    if (withEv.evIsRangeWide) out.push("Attention : EV calculée sur la range entière, pas sur cette main précise.");
  } else {
    const ctx = cmp.rows.find(r => r.available && r.evBestBb != null);
    out.push(ctx
      ? \`EV de l'action jouée indisponible — \${ctx.evNote}\`
      : "EV exacte indisponible — l'EV par action n'a pas été calculée pour ce nœud.");
    const near = cmp.rows.find(r => r.available && r.nearestStudied);
    if (near) out.push(\`Sizing étudié le plus proche : \${near.nearestStudied.specLabel || near.nearestStudied.toBb + "bb"} (comparaison approximative — sa fréquence ne s'applique pas au sizing joué).\`);
  }
  return out;`],
]);

repFile('src/sizing/trainerBridge.js', [
  [`    /* §36 — « uniquement lorsque ces informations sont disponibles ». */
    evAvailable: cmp.evAvailable,
    evNote: cmp.evNote || cmp.reason || null,`,
   `    /* §36 — « uniquement lorsque ces informations sont disponibles ». */
${EV_BLOCK.split(LF).map(l => l.replace(/^ {6}/, '    ')).join(LF)}`],
]);
console.log('ok');
