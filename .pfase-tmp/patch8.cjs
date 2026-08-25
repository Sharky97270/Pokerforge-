const fs=require('fs');const p='src/tabs/SharkSolverTab.jsx';
let lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
const i=lines.findIndex(l=>l.includes('SOLVEUR MULTI-RUE')&&l.includes('moteur CFR+'));
if(i<0){console.error('point de montage introuvable');process.exit(1);}
const bloc=[
"          {/* ── ADAPTIVE SIZING ENGINE (mission §23→§27) ──────────────────",
"              Le moteur multi-rue ci-dessous résout UN arbre IMPOSÉ (betSizes",
"              [0.33, 0.75], constantes littérales du code). Ce panneau-ci fait",
"              l'inverse : il CHOISIT les sizings en comparant les EV de",
"              sous-arbres réellement résolus, puis résout l'arbre retenu.",
"              Les deux cohabitent volontairement — §82 interdit de retirer le",
"              moteur historique avant validation en production. ── */}",
"          <div style={{marginTop:12}}>",
"            <AdaptiveSizingPanel",
"              stateInput={pfaseStateInput}",
"              heroRange={heroFreqs} villainRange={villainFreqs}",
"              disabled={!pfaseStateInput}",
"              disabledReason={pfaseDisabledReason}",
"              onSolution={setPfaseResult}",
"            />",
"          </div>",
"",
];
lines.splice(i,0,...bloc);
let s=lines.join("\n");
const rep=(a,b)=>{if(!s.includes(a)){console.error('MISS: '+a.slice(0,70));process.exit(1);} s=s.replace(a,b);};
rep(`import "./SharkSolverTab.css";`,
`import AdaptiveSizingPanel from "../components/solver/AdaptiveSizingPanel.jsx";
import "./SharkSolverTab.css";`);
rep("  const[nodeLock,setNodeLock]=useState(null);      // {f,c,r} agrégats verrouillés (Node Lock)",
`  /* ── PFASE (Adaptive Sizing) ─────────────────────────────────────────────
     Le panneau ne construit AUCUN état de jeu : il reçoit celui-ci. C'est ce
     qui garantit que le pot, le tapis effectif et le SPR qu'il utilise sont
     ceux de la barre du solveur, et non un troisième calcul parallèle (§7). */
  const[pfaseResult,setPfaseResult]=useState(null);
  const[nodeLock,setNodeLock]=useState(null);      // {f,c,r} agrégats verrouillés (Node Lock)`);
fs.writeFileSync(p,s);console.log('ok');
