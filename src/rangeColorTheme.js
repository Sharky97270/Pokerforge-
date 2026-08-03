/* ══════════════════════════════════════════════════════════════════════════
   PokerForge — RANGE COLOR THEME (système PARTAGÉ, spec « Personnalisation
   des couleurs — tableaux de range », §12).

   Source unique de vérité pour les couleurs d'ACTIONS des matrices 13×13,
   consommée par Replayer / SharkSolver / Trainer / Coach AI et tout futur
   module utilisant la Range Grid.

   Garanties :
   • la personnalisation est PUREMENT VISUELLE — elle ne touche jamais les
     fréquences, la stratégie, l'EV ni les données solveur (§6) ;
   • les presets ne modifient QUE les couleurs d'actions stratégiques, jamais
     le thème global de l'interface (§4) ;
   • palette PokerForge active par défaut, rien à configurer (§3).

   Module PUR (aucune dépendance React) → testable en Node.
   ══════════════════════════════════════════════════════════════════════════ */

export const STORAGE_KEY = "pf_range_colors";
export const SCHEMA_VERSION = 1;

/* ── Actions canoniques (ordre d'affichage dans la légende / les réglages) ── */
export const RANGE_ACTIONS = [
  { key:"fold",     label:"Fold",      group:"base" },
  { key:"check",    label:"Check",     group:"base" },
  { key:"call",     label:"Call",      group:"base" },
  { key:"raise",    label:"Raise",     group:"aggression" },
  { key:"threebet", label:"3-Bet",     group:"aggression" },
  { key:"bet25",    label:"Bet 25 %",  group:"sizing" },
  { key:"bet33",    label:"Bet 33 %",  group:"sizing" },
  { key:"bet50",    label:"Bet 50 %",  group:"sizing" },
  { key:"bet75",    label:"Bet 75 %",  group:"sizing" },
  { key:"bet100",   label:"Bet 100 %", group:"sizing" },
  { key:"bet125",   label:"Bet 125 %", group:"sizing" },
  { key:"allin",    label:"All-in",    group:"aggression" },
];
export const ACTION_KEYS = RANGE_ACTIONS.map(a=>a.key);
const LABEL_OF = Object.fromEntries(RANGE_ACTIONS.map(a=>[a.key,a.label]));
export const actionLabel = k => LABEL_OF[k] || k;

/* ── Presets (§4). Seules les couleurs d'actions changent. ──
   `patterns` (§11) : différenciation non chromatique pour l'accessibilité. */
export const RANGE_PRESETS = {
  pokerforge: {
    id:"pokerforge", label:"PokerForge",
    colors:{
      fold:"#6F81A8", check:"#2ECC71", call:"#2ECC71",
      raise:"#9B5CFF", threebet:"#FF2D75",
      bet25:"#22C3E6", bet33:"#3498DB", bet50:"#F1C40F",
      bet75:"#E67E22", bet100:"#FF7043", bet125:"#FF3D6E",
      allin:"#E74C3C",
    },
  },
  gto_classic: {
    id:"gto_classic", label:"Classique GTO",
    colors:{
      fold:"#4A5568", check:"#38A169", call:"#48BB78",
      raise:"#E53E3E", threebet:"#C53030",
      bet25:"#63B3ED", bet33:"#4299E1", bet50:"#ECC94B",
      bet75:"#ED8936", bet100:"#DD6B20", bet125:"#9C4221",
      allin:"#822727",
    },
  },
  high_contrast: {
    id:"high_contrast", label:"Contraste élevé",
    colors:{
      fold:"#2B2B2B", check:"#00E676", call:"#00B0FF",
      raise:"#FF1744", threebet:"#D500F9",
      bet25:"#18FFFF", bet33:"#00E5FF", bet50:"#FFEA00",
      bet75:"#FF9100", bet100:"#FF3D00", bet125:"#FF00A8",
      allin:"#FFFFFF",
    },
  },
  colorblind: {
    id:"colorblind", label:"Accessibilité / Daltonisme",
    // Palette Okabe-Ito (sûre deutéranopie/protanopie/tritanopie)
    colors:{
      fold:"#999999", check:"#009E73", call:"#56B4E9",
      raise:"#D55E00", threebet:"#CC79A7",
      bet25:"#8FD3E8", bet33:"#0072B2", bet50:"#F0E442",
      bet75:"#E69F00", bet100:"#D55E00", bet125:"#CC79A7",
      allin:"#000000",
    },
    patterns:{
      fold:"none", check:"solid", call:"dots", raise:"diag",
      threebet:"cross", bet25:"dots", bet33:"diag", bet50:"solid",
      bet75:"diag-rev", bet100:"cross", bet125:"dots", allin:"stripe",
    },
  },
};
export const DEFAULT_PRESET_ID = "pokerforge";
export const PRESET_LIST = Object.values(RANGE_PRESETS);

/* Modules consommateurs (§9). */
export const RANGE_MODULES = ["replayer","solver","trainer","coach"];

/* ── Utilitaires couleur ── */
export function normalizeHex(v){
  if(typeof v!=="string") return null;
  let s = v.trim();
  if(!s.startsWith("#")) s = "#"+s;
  if(/^#[0-9a-f]{3}$/i.test(s)) s = "#"+s.slice(1).split("").map(c=>c+c).join("");
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null;
}
export function hexToRgb(hex){
  const h = normalizeHex(hex); if(!h) return null;
  return { r:parseInt(h.slice(1,3),16), g:parseInt(h.slice(3,5),16), b:parseInt(h.slice(5,7),16) };
}
export function rgba(hex, alpha=1){
  const c = hexToRgb(hex);
  return c ? `rgba(${c.r},${c.g},${c.b},${alpha})` : hex;
}

/* ── Persistance (§8) ──
   { version, global, preset, colors, modules:{ [id]:{preset,colors} } } */
function emptySettings(){
  return { version:SCHEMA_VERSION, global:true, preset:DEFAULT_PRESET_ID, colors:{}, modules:{} };
}
function safeStorage(){
  try{ return (typeof localStorage!=="undefined") ? localStorage : null; }catch{ return null; }
}
export function loadRangeColorSettings(){
  const st = safeStorage(); if(!st) return emptySettings();
  try{
    const raw = st.getItem(STORAGE_KEY);
    if(!raw) return emptySettings();
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed!=="object") return emptySettings();
    return { ...emptySettings(), ...parsed,
      colors:parsed.colors||{}, modules:parsed.modules||{} };
  }catch{ return emptySettings(); }
}
export function saveRangeColorSettings(s){
  const st = safeStorage(); if(!st) return s;
  try{ st.setItem(STORAGE_KEY, JSON.stringify({ ...s, version:SCHEMA_VERSION })); }catch{}
  emit();
  return s;
}

/* ── Abonnement (mise à jour live inter-composants) ── */
const listeners = new Set();
export function subscribeRangeTheme(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }
function emit(){ listeners.forEach(fn=>{ try{ fn(); }catch{} }); }

/* ── Résolution du thème effectif d'un module (§9) ── */
export function resolveRangeTheme(moduleId="replayer", settings=null){
  const s = settings || loadRangeColorSettings();
  const useGlobal = s.global !== false;
  const scope = useGlobal ? s : (s.modules?.[moduleId] || s);
  const presetId = scope.preset || s.preset || DEFAULT_PRESET_ID;
  const preset = RANGE_PRESETS[presetId] || RANGE_PRESETS[DEFAULT_PRESET_ID];
  const overrides = scope.colors || {};
  const colors = {};
  ACTION_KEYS.forEach(k=>{
    colors[k] = normalizeHex(overrides[k]) || preset.colors[k] || RANGE_PRESETS[DEFAULT_PRESET_ID].colors[k];
  });
  const custom = ACTION_KEYS.some(k=>normalizeHex(overrides[k]));
  return {
    moduleId, preset:presetId, presetLabel:preset.label,
    colors, patterns:preset.patterns || null,
    global:useGlobal, custom,
  };
}

/* ── Mutations ── */
function scopeOf(s, moduleId){
  if(s.global !== false) return s;
  if(!s.modules[moduleId]) s.modules[moduleId] = { preset:s.preset, colors:{} };
  return s.modules[moduleId];
}
export function setRangePreset(moduleId, presetId){
  const s = loadRangeColorSettings();
  const sc = scopeOf(s, moduleId);
  sc.preset = RANGE_PRESETS[presetId] ? presetId : DEFAULT_PRESET_ID;
  sc.colors = {};                       // un preset repart d'une base propre
  return saveRangeColorSettings(s);
}
export function setRangeColor(moduleId, actionKey, hex){
  const h = normalizeHex(hex);
  if(!h || !ACTION_KEYS.includes(actionKey)) return loadRangeColorSettings();
  const s = loadRangeColorSettings();
  const sc = scopeOf(s, moduleId);
  sc.colors = { ...(sc.colors||{}), [actionKey]:h };
  return saveRangeColorSettings(s);
}
export function setRangeGlobalSync(enabled){
  const s = loadRangeColorSettings();
  s.global = !!enabled;
  return saveRangeColorSettings(s);
}
/* Réinitialise les couleurs personnalisées (garde le preset) — §10 */
export function resetRangeColors(moduleId){
  const s = loadRangeColorSettings();
  const sc = scopeOf(s, moduleId);
  sc.colors = {};
  return saveRangeColorSettings(s);
}
/* Restaure intégralement la palette PokerForge — §10 */
export function restorePokerForge(moduleId){
  const s = loadRangeColorSettings();
  const sc = scopeOf(s, moduleId);
  sc.preset = DEFAULT_PRESET_ID;
  sc.colors = {};
  return saveRangeColorSettings(s);
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDU DES CELLULES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fond d'une cellule de range à partir de ses FRÉQUENCES (§6).
 * Les proportions sont strictement respectées : chaque action occupe un
 * segment égal à sa fréquence. Changer une couleur ne change aucune donnée.
 * @param parts [{key, pct}] — pct en %, somme ≈ 100
 * @param theme résultat de resolveRangeTheme()
 */
export function rangeCellBackground(parts, theme, opts={}){
  const alpha = opts.alpha ?? 0.78;
  const list = (parts||[])
    .filter(p=>p && p.pct>0 && theme.colors[p.key])
    .sort((a,b)=>b.pct-a.pct);
  if(!list.length) return rgba(theme.colors.fold, 0.55);
  const total = list.reduce((a,p)=>a+p.pct,0) || 1;
  if(list.length===1) return rgba(theme.colors[list[0].key], alpha);
  // Dégradé à paliers nets, proportionnel aux fréquences
  let acc = 0;
  const stops = [];
  list.forEach(p=>{
    const from = (acc/total)*100;
    acc += p.pct;
    const to = (acc/total)*100;
    const col = rgba(theme.colors[p.key], alpha);
    stops.push(`${col} ${from.toFixed(2)}%`, `${col} ${to.toFixed(2)}%`);
  });
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

/** Action dominante d'une cellule (pour la couleur du texte / le tri). */
export function dominantAction(parts){
  const list = (parts||[]).filter(p=>p && p.pct>0);
  if(!list.length) return "fold";
  return list.reduce((a,b)=>b.pct>a.pct?b:a).key;
}

/** Légende dynamique (§7) : n'affiche que les actions réellement présentes. */
export function buildLegend(usedKeys, theme){
  const set = new Set(usedKeys||[]);
  return RANGE_ACTIONS.filter(a=>set.has(a.key)).map(a=>({
    key:a.key, label:a.label, color:theme.colors[a.key],
    pattern: theme.patterns ? (theme.patterns[a.key]||"solid") : null,
  }));
}

/* Mapping des clés internes historiques du Trainer → clés canoniques. */
export const LEGACY_TRAINER_MAP = {
  r:"raise", "3b":"threebet", c:"call", b33:"bet33", b50:"bet50",
  b75:"bet75", allin:"allin", f:"fold",
};
/** Décompose une clé legacy (dont les mixtes rc/rf/cf) en parts proportionnelles. */
export function legacyToParts(legacyKey, freq){
  if(freq && typeof freq==="object"){
    const parts=[];
    if(freq.r>0) parts.push({key:"raise",pct:freq.r});
    if(freq.c>0) parts.push({key:"call", pct:freq.c});
    if(freq.f>0) parts.push({key:"fold", pct:freq.f});
    if(parts.length) return parts;
  }
  switch(legacyKey){
    case "rc": return [{key:"raise",pct:55},{key:"call",pct:45}];
    case "rf": return [{key:"raise",pct:65},{key:"fold",pct:35}];
    case "cf": return [{key:"call", pct:55},{key:"fold",pct:45}];
    default: {
      const k = LEGACY_TRAINER_MAP[legacyKey] || "fold";
      return [{ key:k, pct:100 }];
    }
  }
}
