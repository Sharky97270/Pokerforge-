const fs=require('fs');
const LF=String.fromCharCode(10),CRLF=String.fromCharCode(13,10);
const repFile=(p,pairs)=>{let s=fs.readFileSync(p,'utf8');
  for(const [a,b] of pairs){let d=false;
    for(const [pat,r2] of [[a,b],[a.split(LF).join(CRLF),b.split(LF).join(CRLF)]]){if(s.includes(pat)){s=s.replace(pat,r2);d=true;break;}}
    if(!d){console.error('MISS ['+p+'] : '+a.slice(0,80));process.exit(1);}}
  fs.writeFileSync(p,s);};

repFile('src/sizing/strategyExtract.js',[
  [`import { EPS } from "./config.js";`,
   `import { EPS, DEFAULT_EVALUATION_CONFIG } from "./config.js";
import { nodeActionEVs } from "../solver/core/multistreet.js";`],

  [`export function extractStreetStrategy(solution, { includeByClass = true, maxClasses = 200 } = {}) {
  if (!solution || !solution.tree || typeof solution.avgOf !== "function") return null;
  const nodes = {};
  const seenClasses = new Set();`,
   `export function extractStreetStrategy(solution, {
  includeByClass = true, maxClasses = 200,
  /* ── EV PAR ACTION (§36, §49) ─────────────────────────────────────────────
     « Après décision : Action Hero · Action GTO · Sizing · Fréquence · EV · EV
     loss » (§36) et « EV played · EV best · EV difference » (§49). Ces colonnes
     réclament une EV PAR ACTION, que le solve ne conserve pas : \`nodeActionEVs\`
     la recalcule depuis la stratégie moyenne.

     Elle coûte une traversée d'arbre par action et par runout. Sur un board
     COMPLET (river) il n'y a qu'un runout : c'est exact et négligeable. Sur un
     board incomplet il en faut plusieurs dizaines, et le coût se multiplie par
     le nombre de nœuds — d'où deux garde-fous : un budget de runouts et un
     plafond de nœuds, les nœuds les plus proches de la racine étant servis en
     premier (ce sont ceux qu'un joueur regarde).

     \`includeEV:false\` coupe tout : les consommateurs testent \`node.ev\` et
     n'inventent jamais de nombre en son absence (§0). */
  includeEV = true,
  evSamples = DEFAULT_EVALUATION_CONFIG.strategyEvSamples || 60,
  maxEVNodes = 24,
} = {}) {
  if (!solution || !solution.tree || typeof solution.avgOf !== "function") return null;
  const nodes = {};
  const seenClasses = new Set();
  const boardComplete = (solution.board ? solution.board.length : solution.initLen || 0) >= 5;
  let evBudget = includeEV ? maxEVNodes : 0;
  let evSkipped = 0;`],

  [`    nodes[pathKey(path)] = {
      path: path.slice(),`,
   `    /* EV par action à CE nœud. Jamais fabriquée : si le budget est épuisé ou
       si le calcul n'est pas disponible, le champ porte le motif, pas un nombre. */
    let ev = null;
    if (includeEV) {
      if (evBudget <= 0) { evSkipped++; ev = { available: false, reason: \`budget de \${maxEVNodes} nœuds épuisé — nœud trop profond pour être chiffré\` }; }
      else {
        evBudget--;
        const r = nodeActionEVs(solution, path, { samples: boardComplete ? 1 : evSamples });
        ev = r && r.available
          ? { available: true, exact: !!r.exact, samples: r.samples, note: r.note,
              byAction: r.byAction, byClass: includeByClass ? r.byClass : null,
              mixedEV: r.mixedEV, reachShare: r.reachShare }
          : { available: false, reason: (r && r.reason) || "indisponible" };
      }
    }

    nodes[pathKey(path)] = {
      path: path.slice(),
      ev,`],

  [`    normalization: checkStrategyNormalization(aggregate),
    };`,
   `    normalization: checkStrategyNormalization(aggregate),
    };`],

  [`  return {
    coversStreetsAhead: false,`,
   `  return {
    /* Ce que vaut l'EV rapportée ici, en un mot — l'UI n'a pas à le deviner. */
    evAvailable: includeEV,
    evExact: includeEV ? boardComplete : null,
    evNodesSkipped: evSkipped,
    coversStreetsAhead: false,`],
]);
console.log('ok');
