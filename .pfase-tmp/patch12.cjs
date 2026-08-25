const fs=require('fs');
const rep=(f,a,b)=>{if(!f.includes(a)){console.error('MISS: '+a.slice(0,70));process.exit(1);}return f.replace(a,b);};
let p='src/components/solver/AdaptiveSizingPanel.jsx';let s=fs.readFileSync(p,'utf8');

/* Ancres de QA : §69 impose de vérifier le rendu RÉEL. Lire innerText à coups
   d'expressions régulières est fragile (un saut de ligne de plus et l'audit
   ment) ; des attributs de données rendent la mesure exacte. */
s=rep(s,`  return (
    <div style={{ ...box, display: "flex", flexDirection: "column", gap: 10 }}>`,
`  return (
    <div data-pfase="panel" style={{ ...box, display: "flex", flexDirection: "column", gap: 10 }}>`);
s=rep(s,`    <div style={{ ...box, borderColor: T.purple, background: "rgba(155,92,255,.06)" }}>`,
`    <div data-pfase="solution" data-pfase-status={solution.status} data-pfase-complexity={d.complexity}
      data-pfase-selected={(solution.selectedSizes.bets || []).map(b => b.label).join(",")}
      data-pfase-reference={(solution.referenceSizes.bets || []).map(b => b.label).join(",")}
      data-pfase-evloss={m.absoluteEVLoss} data-pfase-floor={floor}
      data-pfase-distinguishable={String(distinguishable)}
      data-pfase-badge={d.badge}
      style={{ ...box, borderColor: T.purple, background: "rgba(155,92,255,.06)" }}>`);
s=rep(s,`      <div style={{ ...box, borderColor: T.red, background: T.redDim }}>
          <div style={{ fontSize: 10.5, color: T.red, fontFamily: T.stats, fontWeight: 700 }}>Aucune solution</div>`,
`      <div data-pfase="error" data-pfase-reason={error} style={{ ...box, borderColor: T.red, background: T.redDim }}>
          <div style={{ fontSize: 10.5, color: T.red, fontFamily: T.stats, fontWeight: 700 }}>Aucune solution</div>`);
s=rep(s,`    <div style={{ ...box, borderColor: T.cyan, background: "rgba(52,216,255,.05)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: T.brand }}>
        Ce que coûte la simplicité`,
`    <div data-pfase="family" data-pfase-levels={family.map(d => \`\${d.complexity}=\${d.selected}@\${d.evLossBb}\`).join("|")}
      style={{ ...box, borderColor: T.cyan, background: "rgba(52,216,255,.05)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: T.brand }}>
        Ce que coûte la simplicité`);
fs.writeFileSync(p,s);

/* Le script d'audit lit désormais les ancres, pas le texte. */
p='scripts/sizing-shot.mjs';s=fs.readFileSync(p,'utf8');
const start=s.indexOf("  /* Lecture du DOM : ce que l'écran AFFICHE réellement. */");
const end=s.indexOf("  await page.addStyleTag(");
if(start<0||end<0){console.error('bloc de lecture introuvable');process.exit(1);}
s=s.slice(0,start)+`  /* Lecture du DOM par ANCRES — exact, insensible à la mise en page. */
  out.panel = await page.evaluate(() => {
    const panel = document.querySelector('[data-pfase="panel"]');
    const sol = document.querySelector('[data-pfase="solution"]');
    const err = document.querySelector('[data-pfase="error"]');
    const fam = document.querySelector('[data-pfase="family"]');
    const txt = panel ? panel.innerText : "";
    const d = (el, k) => (el ? el.getAttribute("data-pfase-" + k) : null);
    return {
      panelPresent: !!panel,
      badge: d(sol, "badge"),
      status: d(sol, "status"),
      complexity: d(sol, "complexity"),
      retenu: d(sol, "selected"),
      compares: d(sol, "reference"),
      perteEv: d(sol, "evloss"),
      plancher: d(sol, "floor"),
      distinguable: d(sol, "distinguishable"),
      famille: d(fam, "levels"),
      aucuneSolution: !!err,
      motifEchec: d(err, "reason"),
      partiel: /PARTIEL/.test(txt),
      avertissementBruit: /pas distinguable du bruit/.test(txt),
      ecartSizings: /Écart d'EV entre sizings/.test(txt),
      exploitabilite: (txt.match(/(Exploitabilité[^\n]*)/) || [])[1] || null,
      modes: ['Automatic', 'Dynamic', 'Single Size', 'Fixed'].filter(m => txt.includes(m)),
      niveaux: ['Single Size', 'Simple', 'Advanced', 'Full'].filter(m => txt.includes(m)),
      presets: ['PF Automatic', 'PF Single Size', 'PF Simple', 'PF Advanced', 'PF Full'].filter(m => txt.includes(m)),
    };
  });

`+s.slice(end);
s=rep(s,`  const target = await page.evaluateHandle(() => {
    const el = [...document.querySelectorAll('div')].find(d => d.textContent.includes('Betting Structure') && d.textContent.length < 6000);
    return el || document.body;
  });
  await target.asElement().screenshot({ path: OUT });`,
`  const target = await page.$('[data-pfase="panel"]');
  await page.evaluate(() => document.querySelector('[data-pfase="panel"]')?.scrollIntoView({ block: 'center' }));
  await sleep(250);
  await (target || await page.$('body')).screenshot({ path: OUT });`);
fs.writeFileSync(p,s);
console.log('ok');
