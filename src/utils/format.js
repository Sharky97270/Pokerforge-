// PokerForge — helpers de formatage numerique (extrait de App.jsx, Phase 3.2)

export function roundBb(v){
  const n=Number(v);
  if(!Number.isFinite(n))return 0;
  return Math.round(n*10)/10;
}
