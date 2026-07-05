// PokerForge — onglet Bibliothèque GTO (extrait de App.jsx, Phase 3.3)
import React, { useState } from "react";
import { T } from "../theme.js";

const LIB_DATA=[
  // ── PREFLOP OPEN ──
  {id:"utg-open",cat:"Preflop",sub:"Open RFI",pos:"UTG",action:"open",stack:100,
    title:"UTG Open 6-max",hero:"UTG · 100bb · 6-max",
    combos:"~160 combos (12.7%)",sizing:"2.5bb standard",
    desc:"Position la plus tight en 6-max. Range construite autour des paires premium, des mains broadway suited et AKo.",
    keyPoints:[
      {i:"🎯",t:"Paires: Raise TT+ systématiquement. 99-88 situation dépendante (exploits)."},
      {i:"♠",t:"Suited Broadway: AQs+, KQs, QJs toujours. JTs et AJs selon les reads."},
      {i:"💰",t:"Offsuit: AKo uniquement. Évitez KQo en UTG (trop marginal vs range tight en 3bet)."},
      {i:"⚠",t:"Suited Connectors: Évitez en UTG (trop de fold equity perdue vs 3bet cold call)."},
    ],
    leaks:["Ouvrir 88-77 systématiquement en UTG dilue votre range","KQo UTG = leak classique face aux regs"]},
  {id:"hj-open",cat:"Preflop",sub:"Open RFI",pos:"HJ",action:"open",stack:100,
    title:"HJ Open 6-max",hero:"HJ · 100bb",combos:"~220 combos (17.5%)",sizing:"2.5bb",
    desc:"Légèrement plus large qu'UTG. Vous ajoutez les petites paires premium et quelques suited connectors.",
    keyPoints:[
      {i:"🎯",t:"Paires: TT+ pour sure, 99-77 maintenant rentable en HJ."},
      {i:"♠",t:"Suited: AJs+, KQs, QJs, JTs, T9s tous viables."},
      {i:"💡",t:"Offsuit: AQo+ rentable ici. KQo commence à être borderline positif."},
      {i:"🔄",t:"Face à la 3bet: défendez AQs+, JJ+ pour call, QQ+ pour 4bet."},
    ],
    leaks:["Trop souvent fold face aux 3bet en HJ","Oublier de c-bet sur les flops favorables après HJ open"]},
  {id:"co-open",cat:"Preflop",sub:"Open RFI",pos:"CO",action:"open",stack:100,
    title:"CO Open 6-max",hero:"CO · 100bb",combos:"~290 combos (23%)",sizing:"2.5bb",
    desc:"Position forte, 2 joueurs à battre. Range élargie avec suited connectors et petites paires.",
    keyPoints:[
      {i:"🎯",t:"Paires: 55+ toutes viables. 44-22 situation dépendante vs avant-postes actifs."},
      {i:"♠",t:"Suited: JTs, T9s, 98s ajoutés. Toutes les broadway suited ouvrent."},
      {i:"💰",t:"Offsuit: KQo, AJo deviennent standards. QJo borderline positif."},
      {i:"🛡",t:"Defense vs 3bet: plus large. QQ+ 4bet, JJ-TT call/fold selon sizing."},
    ],
    leaks:["Over-fold face au BTN squeeze en CO","Ne pas ajuster sizing face aux blinds défensifs"]},
  {id:"btn-open",cat:"Preflop",sub:"Open RFI",pos:"BTN",action:"open",stack:100,
    title:"BTN Open 6-max",hero:"BTN · 100bb",combos:"~440 combos (34.8%)",sizing:"2.2bb en pos",
    desc:"Position la plus avantageuse. Vous ouvrez presque 35% des mains. L'objectif est de maximiser l'équité de position post-flop.",
    keyPoints:[
      {i:"🎯",t:"Paires: 22+ toutes ouvrent. Position compense le manque d'équité raw."},
      {i:"♠",t:"Suited: Quasi toutes les suited mains avec une carte ≥7. 54s, 64s borderline."},
      {i:"💰",t:"Offsuit: Toutes les broadway, KJo, QJo, K9o, Q9o selon exploits."},
      {i:"🛡",t:"Defense vs SB/BB 3bet: SB 3bet = call/4bet TT+, AQs+. BB 3bet = défense serrée."},
    ],
    leaks:["Sizing trop gros en BTN = perd EV vs BB","Over-fold face au BB check-raise sur flops dry"]},
  {id:"sb-open",cat:"Preflop",sub:"Open RFI",pos:"SB",action:"open",stack:100,
    title:"SB Open vs BB",hero:"SB · 100bb · HU vs BB",combos:"~380 combos (30%)",sizing:"3bb vs BB",
    desc:"Heads-up contre le BB uniquement. Range large mais attention au OOP post-flop. Sizing plus gros pour compenser.",
    keyPoints:[
      {i:"🎯",t:"Paires: 22+ toutes ouvrent mais avec sizing adapté (3bb pour value, 2.5bb marginals)."},
      {i:"♠",t:"Suited: Toutes les suited 2-gaps et moins. T8s, 97s, 86s rentables."},
      {i:"💡",t:"Vous jouez OOP post-flop = réduisez les mains qui jouent mal multi-street (K7o, Q6o)."},
      {i:"🛡",t:"Face à BB 3bet: fold equity réduite OOP. Défendez étroitement (TT+, AQs+)."},
    ],
    leaks:["Ouvrir trop large OOP SB = exploitable","Sizing 2.5bb depuis SB perd EV vs BB reg actif"]},
  {id:"bb-def",cat:"Preflop",sub:"BB Defense",pos:"BB",action:"call",stack:100,
    title:"BB Defense vs Open",hero:"BB · 100bb · vs différentes positions",combos:"Variables selon pos",sizing:"call / 3bet",
    desc:"Le BB est défendu très large grâce au pot odd direct. Face à un open standard, vous devez défendre ~40-50% de votre range.",
    keyPoints:[
      {i:"💰",t:"Vs BTN open: Pot odds de 2:1. Défendez quasi toutes les suited hands + offsuit broadway."},
      {i:"🎯",t:"3bet range: KK+, AKs, AQs pour value. A5s-A2s, K5s-K4s comme bluffs polarisés."},
      {i:"♠",t:"Mains à protéger: Des mains comme 76s, 87o ont equity même vs range forte."},
      {i:"⚠",t:"Vs UTG open: Réduisez votre call range. UTG a une range premium = fold 72o/83o."},
    ],
    leaks:["Fold trop souvent en BB vs BTN steal","Négliger les bluffs polarisés dans votre 3bet range"]},
  // ── 3BET / 4BET ──
  {id:"btn-3bet-co",cat:"Preflop",sub:"3-bet",pos:"BTN",action:"3bet",stack:100,
    title:"BTN 3bet vs CO",hero:"BTN · 100bb · vs CO open",combos:"~110 combos (8.5%)",sizing:"8.5-9bb",
    desc:"3bet polarisé depuis le BTN. Range value premium + bluffs suited (A5s, A4s comme bluffs idéaux).",
    keyPoints:[
      {i:"🎯",t:"Value: KK+, AKs, AQs systématique. QQ parfois 3bet/call, parfois flat (équilibrer)."},
      {i:"🃏",t:"Bluffs: A5s, A4s idéaux (blockers + equity vs call). K5s-K4s situationnel."},
      {i:"💡",t:"Sizing: 3x l'open en position (9bb). BTN peut être légèrement plus petit que OOP."},
      {i:"🛡",t:"Face à 4bet: KK+, AKs call/shove. QQ borderline vs unknowns."},
    ],
    leaks:["3bet QQ-JJ trop souvent = pas assez de flats","Manque de bluffs dans la range = trop valueheavy"]},
  {id:"4bet-range",cat:"Preflop",sub:"4-bet",pos:"CO",action:"open",stack:100,
    title:"4bet Range en position",hero:"CO · 100bb · face à BTN 3bet",combos:"~60 combos (4.5%)",sizing:"22-24bb",
    desc:"Range 4bet très polarisée: ultra-value + quelques bluffs bloqueurs.",
    keyPoints:[
      {i:"🎯",t:"Value: AA, KK toujours. AKs/AKo majoritairement 4bet (trop fort pour flat)."},
      {i:"🃏",t:"Bluffs: A5s, A4s (bloquent AK/AA adversaire). KQs borderline selon profil."},
      {i:"⚠",t:"QQ: Situation dépendante. Vs tight 3bettor = flat. Vs loose = 4bet/call."},
      {i:"💡",t:"Ne pas 4bet fold QQ-JJ vs unknown = erreur fréquente (EV négative)."},
    ],
    leaks:["4bet trop large = facilement exploitable vs reg","Fold QQ face à 3bet = over-fold critique"]},
  // ── POSTFLOP C-BET ──
  {id:"cbet-dry-ip",cat:"Postflop",sub:"C-bet IP",pos:"BTN",action:"open",stack:100,
    title:"C-bet dry board en position",hero:"BTN · flop A72r · vs BB",combos:"Range entière",sizing:"33% pot",
    desc:"Sur un board sec A72 rainbow, en tant qu'ouvreur IP, vous avez un avantage de range énorme. C-bet quasi toute votre range à petit sizing.",
    keyPoints:[
      {i:"🎯",t:"Sizing: 25-33% pot. Petit sizing permet de c-bet fréquemment avec max fold equity."},
      {i:"♠",t:"Mains à bet: Toute votre range (A, overpairs, backdoors, rien du tout)."},
      {i:"💡",t:"Le BB ne peut défendre que ~35% vs petit bet. Vous gagnez immédiatement souvent."},
      {i:"🃏",t:"Exceptions: KK/QQ peuvent check pour protéger (éviter sur-représentation d'un board favorable)."},
    ],
    leaks:["C-bet trop gros sur board A-haut = perd EV","Check AK sur A72r = leak (laissez le BB réaliser equity)"]},
  {id:"cbet-wet-oop",cat:"Postflop",sub:"C-bet OOP",pos:"SB",action:"open",stack:100,
    title:"C-bet wet board OOP",hero:"SB · flop 876s · vs BB",combos:"Range sélective",sizing:"50-66% pot",
    desc:"Sur un board coordonné OOP, vous devez être sélectif. C-bet vos meilleures mains + quelques bluffs avec backdoor equity.",
    keyPoints:[
      {i:"🎯",t:"Bet: Sets, 2 pairs, top pair+kicker, OESD/Flush draws strong."},
      {i:"✓",t:"Check: TPWK, paires du milieu/bas, mains sans equity supplémentaire."},
      {i:"💡",t:"Sizing: Plus gros OOP pour compenser le désavantage positionnel (50-66%)."},
      {i:"⚠",t:"Évitez de c-bet bluff avec mains qui ont 0 equity si callé. Préférez backdoor draws."},
    ],
    leaks:["C-bet trop fréquent OOP sur boards coordonnés = perd EV","Ne pas check/raise avec les meilleurs draws OOP"]},
  {id:"checkraise-flop",cat:"Postflop",sub:"Check-Raise",pos:"BB",action:"call",stack:100,
    title:"Check-Raise Flop vs C-bet",hero:"BB · flop T85s · face à BTN c-bet",combos:"~12% de la range",sizing:"3x la mise",
    desc:"Le check-raise est une arme puissante OOP pour denie equity aux adversaires et protéger votre range.",
    keyPoints:[
      {i:"🎯",t:"Value: Sets (888, TTT, 555), 2 pairs (T8, 85), straights (JQ)."},
      {i:"🃏",t:"Bluffs: OESD (97s, J9s), strong flush draws (A9s de la couleur). Pas de bluff sans equity."},
      {i:"💡",t:"Sizing c/r: 3x la mise adverse minimum pour maximiser la pression."},
      {i:"⚠",t:"Évitez c/r avec mains marginales (T9, T7). Call est souvent meilleur."},
    ],
    leaks:["Trop peu de bluffs dans le c/r range = trop valueheavy","C/r trop souvent = exploitable par le BTN qui over-folds"]},
];

const LIB_CATS=[
  {id:"all",l:"Tous les spots",ico:"📚"},
  {id:"Preflop",l:"Préflop",ico:"🃏"},
  {id:"Postflop",l:"Post-flop",ico:"📊"},
];

export default function LibraryTab({RangeGrid,RangePopup}){
  const[cat,setCat]=useState("all");
  const[selected,setSelected]=useState(null);
  const[rpop,setRpop]=useState(null);

  const filtered=cat==="all"?LIB_DATA:LIB_DATA.filter(s=>s.cat===cat);

  // Grouper par sub-catégorie
  const grouped=filtered.reduce((acc,s)=>{
    if(!acc[s.sub])acc[s.sub]=[];
    acc[s.sub].push(s);
    return acc;
  },{});

  const spot=selected?LIB_DATA.find(s=>s.id===selected):null;

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:T.bg}}>
      {/* Header */}
      <div style={{flexShrink:0,background:"#040B1F",borderBottom:"1px solid #181825",padding:"10px 20px",display:"flex",alignItems:"center",gap:16}}>
        <div>
          <div style={{fontFamily:T.brand,fontSize:11,color:T.gold,letterSpacing:".14em",fontWeight:900}}>BIBLIOTHÈQUE GTO</div>
          <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginTop:1}}>Spots pré-résolus · Ranges vérifiées · Inspiré GTO Wizard</div>
        </div>
        <div style={{display:"flex",gap:5,marginLeft:"auto",flexWrap:"wrap"}}>
          {LIB_CATS.map(c=>(
            <div key={c.id} onClick={()=>{setCat(c.id);setSelected(null);}}
              style={{padding:"4px 12px",borderRadius:20,fontSize:9.5,fontFamily:T.stats,fontWeight:700,cursor:"pointer",
                background:cat===c.id?"rgba(255,194,71,.12)":"rgba(255,255,255,.03)",
                color:cat===c.id?T.gold:T.text3,
                border:`1px solid ${cat===c.id?"rgba(255,194,71,.3)":"transparent"}`,
                transition:"all .12s"}}>
              {c.ico} {c.l}
            </div>
          ))}
        </div>
      </div>

      {/* Layout 2 colonnes */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Liste des spots */}
        <div style={{width:380,flexShrink:0,overflowY:"auto",padding:"14px 14px",borderRight:"1px solid #181825",background:"#030712"}}>
          {Object.entries(grouped).map(([sub,spots])=>(
            <div key={sub}>
              <div className="lib-section-hdr">
                <span style={{fontSize:10,color:T.text4,fontFamily:T.stats,letterSpacing:".08em"}}>
                  {sub==="Open RFI"?"🃏":sub==="3-bet"?"🔥":sub==="4-bet"?"💥":sub==="BB Defense"?"🛡":sub.includes("C-bet")?"📐":"🔄"}
                </span>
                {sub}
                <span style={{marginLeft:"auto",fontSize:8,color:T.text4,fontFamily:T.stats}}>{spots.length} spot{spots.length>1?"s":""}</span>
              </div>
              <div className="lib-spots-grid">
                {spots.map(s=>(
                  <div key={s.id} className={`lib-spot-card${selected===s.id?" on":""}`} onClick={()=>setSelected(s.id)}>
                    <div style={{display:"flex",gap:5,marginBottom:5,alignItems:"center"}}>
                      <span className="lib-spot-pos">{s.pos}</span>
                      {s.stack&&<span style={{fontSize:8,color:T.text4,fontFamily:T.stats}}>{s.stack}bb</span>}
                    </div>
                    <div className="lib-spot-title">{s.title}</div>
                    <div className="lib-spot-desc">{s.combos}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:T.text4,fontFamily:T.stats,fontSize:11}}>
              Aucun spot dans cette catégorie pour l'instant
            </div>
          )}
        </div>

        {/* Détail du spot sélectionné */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px",background:"#030712"}}>
          {!spot&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12,color:T.text4}}>
              <div style={{fontSize:40}}>📖</div>
              <div style={{fontFamily:T.brand,fontSize:11,letterSpacing:".12em",color:T.text3}}>SÉLECTIONNEZ UN SPOT</div>
              <div style={{fontSize:10,color:T.text4,fontFamily:T.stats,textAlign:"center",maxWidth:280,lineHeight:1.7}}>
                Cliquez sur un spot dans la liste pour voir les ranges GTO, les concepts clés et les erreurs fréquentes.
              </div>
            </div>
          )}
          {spot&&(
            <>
              {/* En-tête spot */}
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                  <div className="lib-title">{spot.title}</div>
                  <span style={{padding:"3px 10px",borderRadius:20,fontSize:9,fontWeight:700,fontFamily:T.stats,background:"rgba(255,194,71,.1)",color:T.gold,border:"1px solid rgba(255,194,71,.25)"}}>{spot.pos}</span>
                  <span style={{padding:"3px 10px",borderRadius:20,fontSize:9,fontWeight:700,fontFamily:T.stats,background:"rgba(31,139,255,.08)",color:T.blue,border:"1px solid rgba(31,139,255,.2)"}}>{spot.stack}bb</span>
                  <span style={{padding:"3px 10px",borderRadius:20,fontSize:9,fontWeight:700,fontFamily:T.stats,background:"rgba(16,216,122,.08)",color:T.green,border:"1px solid rgba(16,216,122,.2)"}}>{spot.sizing}</span>
                </div>
                <div style={{fontSize:10.5,color:T.text2,fontFamily:T.stats,lineHeight:1.75,marginBottom:8}}>{spot.desc}</div>
              </div>

              {/* Stats rapides */}
              <div className="lib-stats-row">
                <div className="lib-stat">
                  <div className="lib-stat-v" style={{color:T.gold}}>{spot.combos.split(" ")[0]}</div>
                  <div className="lib-stat-l">Combos</div>
                </div>
                <div className="lib-stat">
                  <div className="lib-stat-v" style={{color:T.green}}>{spot.sizing}</div>
                  <div className="lib-stat-l">Sizing</div>
                </div>
                <div className="lib-stat">
                  <div className="lib-stat-v" style={{color:T.blue}}>{spot.pos}</div>
                  <div className="lib-stat-l">Position</div>
                </div>
                <div className="lib-stat">
                  <div className="lib-stat-v" style={{color:T.purple}}>{spot.stack}bb</div>
                  <div className="lib-stat-l">Stack</div>
                </div>
              </div>

              {/* Range Grid + bouton popup */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontFamily:T.brand,fontSize:8.5,color:T.text3,letterSpacing:".1em"}}>RANGE VISUELLE</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setRpop({heroPos:spot.pos,vilPos:spot.pos==="BTN"?"BB":spot.pos==="CO"?"BTN":"CO",heroAction:spot.action,stackBB:spot.stack})}
                    style={{padding:"3px 10px",borderRadius:20,fontSize:9,fontWeight:700,fontFamily:T.stats,background:"rgba(155,92,255,.1)",color:T.purple,border:"1px solid rgba(155,92,255,.25)",cursor:"pointer"}}>
                    📊 Voir ranges Hero + Villain
                  </button>
                </div>
              </div>
              <RangeGrid pos={spot.pos} action={spot.action} stackBB={spot.stack||100} label={`${spot.pos} — ${spot.title} · ${spot.stack}bb`}/>

              {/* Key Points */}
              <div className="lib-detail" style={{marginTop:16}}>
                <div style={{fontFamily:T.brand,fontSize:8.5,color:T.gold,letterSpacing:".1em",marginBottom:10}}>CONCEPTS CLÉS</div>
                {spot.keyPoints.map((kp,i)=>(
                  <div key={i} className="lib-kp-item">
                    <div className="lib-kp-ico" style={{background:i%4===0?"rgba(255,194,71,.1)":i%4===1?"rgba(16,216,122,.1)":i%4===2?"rgba(31,139,255,.1)":"rgba(155,92,255,.1)",color:i%4===0?T.gold:i%4===1?T.green:i%4===2?T.blue:T.purple}}>{kp.i}</div>
                    <div style={{flex:1,fontSize:10,color:T.text2,fontFamily:T.stats,lineHeight:1.65}}>{kp.t}</div>
                  </div>
                ))}
              </div>

              {/* Leaks */}
              {spot.leaks&&spot.leaks.length>0&&(
                <div style={{marginTop:12}}>
                  <div style={{fontFamily:T.brand,fontSize:8.5,color:T.red,letterSpacing:".1em",marginBottom:6}}>ERREURS FRÉQUENTES</div>
                  {spot.leaks.map((l,i)=><div key={i} className="lib-leak">{l}</div>)}
                </div>
              )}

              {/* Actions */}
              <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
                <button onClick={()=>setRpop({heroPos:spot.pos,vilPos:spot.pos==="BTN"?"BB":spot.pos==="CO"?"BTN":"CO",heroAction:spot.action,stackBB:spot.stack})}
                  style={{flex:1,padding:"10px 16px",borderRadius:8,fontSize:11,fontWeight:700,fontFamily:T.stats,background:"linear-gradient(135deg,rgba(155,92,255,.15),rgba(155,92,255,.08))",color:T.purple,border:"1px solid rgba(155,92,255,.3)",cursor:"pointer"}}>
                  📊 Ranges Hero & Villain
                </button>
                <button style={{flex:1,padding:"10px 16px",borderRadius:8,fontSize:11,fontWeight:700,fontFamily:T.stats,background:"linear-gradient(135deg,#FFC247,#FFC247)",color:"#000",border:"none",cursor:"pointer",opacity:.5}} disabled>
                  ▶ Pratiquer ce spot (bientôt)
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Range Popup global */}
      {rpop&&<RangePopup {...rpop} onClose={()=>setRpop(null)}/>}
    </div>
  );
}
