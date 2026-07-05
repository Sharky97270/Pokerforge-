// PokerForge — Dashboard : hero banner, events hub, news hub (extrait de App.jsx, Phase 3.3)
import React, { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { POKER_EVENTS } from "../data/content.js";
import { pfFetchNews } from "../cloud.js";
import { loadStats, loadHistory, calcPokerIQ, buildDailyProgram } from "../stats.js";
import { POKER_NEWS, POKER_NEWS_FILTERS, fetchPokerNews, updateNewsStatus } from "../data/news.js";
import { ARTICLES } from "../data/content.js";
import { shuffle } from "../utils/format.js";
const EVENTS=POKER_EVENTS;
const FIELD_TRENDS=[
  {platform:"Winamax",color:"#FF6B00",trends:[
    {label:"Overfold Turn",delta:"+8%",dir:"up",detail:"BB vs BTN"},
    {label:"Défense BB",delta:"-5%",dir:"down",detail:"vs open 3x"},
    {label:"Limp micro",delta:"+12%",dir:"up",detail:"UTG/MP"},
  ]},
  {platform:"GGPoker",color:"#F59E0B",trends:[
    {label:"3-bet SB",delta:"+6%",dir:"up",detail:"vs BTN open"},
    {label:"Pression bulle",delta:"+11%",dir:"up",detail:"moyen stack"},
    {label:"Check-raise flop",delta:"-3%",dir:"down",detail:"BB vs BTN"},
  ]},
  {platform:"PokerStars",color:"#FF4560",trends:[
    {label:"Open BTN",delta:"+4%",dir:"up",detail:"sizing 2.2x"},
    {label:"C-bet flop",delta:"-7%",dir:"down",detail:"textures dry"},
    {label:"Range 3-bet",delta:"+5%",dir:"up",detail:"CO vs BTN"},
  ]},
];

const BANNER_IMAGES=[
  // Poker Live / Tables WSOP
  {id:"poker1",url:"https://images.unsplash.com/photo-1529480777778-ed9bef64f6d3?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"poker2",url:"https://images.unsplash.com/photo-1596451190630-186aff535bf2?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"poker3",url:"https://images.unsplash.com/photo-1464638681273-0962e9b53566?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"poker4",url:"https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"poker5",url:"https://images.unsplash.com/photo-1609743522471-83c84ce23e32?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"poker6",url:"https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"poker7",url:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"poker8",url:"https://images.unsplash.com/photo-1591558816501-d8e558f6f8a7?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  // Focus / Concentration / Mental
  {id:"focus1",url:"https://images.unsplash.com/photo-1484589065579-248aad0d8b13?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"focus2",url:"https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"focus3",url:"https://images.unsplash.com/photo-1562664377-709f2c337eb2?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"focus4",url:"https://images.unsplash.com/photo-1516534775068-ba3e7458af70?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  // Stratégie / Échecs / Data
  {id:"strat1",url:"https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"strat2",url:"https://images.unsplash.com/photo-1586769852044-692d6e3703f0?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"strat3",url:"https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"strat4",url:"https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"strat5",url:"https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  // Victoire / Champions
  {id:"win1",url:"https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"win2",url:"https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"win3",url:"https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  // Night / Ambiance / Neon
  {id:"night1",url:"https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"night2",url:"https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"night3",url:"https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  // Grind / Setup / Tech
  {id:"tech1",url:"https://images.unsplash.com/photo-1593640408182-31c228c0ffa5?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"tech2",url:"https://images.unsplash.com/photo-1547082299-de196ea013d6?w=1400&h=260&fit=crop&q=90",theme:"dark"},
  {id:"tech3",url:"https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1400&h=260&fit=crop&q=90",theme:"dark"},
];

/* ── Citations Premium (100+) par catégorie ── */
const BANNER_QUOTES=[
  // ── MENTAL GAME ──
  {q:"Le poker récompense les bonnes décisions, pas les résultats immédiats.",a:"Phil Ivey",cat:"Mental",col:"#9B5CFF"},
  {q:"La variance est ton ennemie à court terme et ta meilleure amie à long terme.",a:"Daniel Negreanu",cat:"Mental",col:"#9B5CFF"},
  {q:"Accepter les mauvais runs, c'est la première chose que les grands joueurs apprennent.",a:"Fedor Holz",cat:"Mental",col:"#9B5CFF"},
  {q:"Tu ne contrôles pas les cartes. Tu contrôles tes décisions.",a:"PokerForge",cat:"Mental",col:"#9B5CFF"},
  {q:"Un tilt non géré coûte plus que toutes tes erreurs GTO réunies.",a:"Jason Koon",cat:"Mental",col:"#9B5CFF"},
  {q:"La discipline mentale est le skill le plus sous-estimé en poker.",a:"PokerForge",cat:"Mental",col:"#9B5CFF"},
  {q:"Entre deux joueurs de même niveau technique, c'est le mental qui décide.",a:"Fedor Holz",cat:"Mental",col:"#9B5CFF"},
  {q:"Le silence intérieur avant chaque décision vaut tous les solvers.",a:"PokerForge",cat:"Mental",col:"#9B5CFF"},
  {q:"Ce que tu ressens après une bad beat en dit plus sur toi que la bad beat elle-même.",a:"PokerForge",cat:"Mental",col:"#9B5CFF"},
  {q:"La sérénité n'est pas l'absence de pression. C'est la capacité à penser clairement malgré elle.",a:"PokerForge",cat:"Mental",col:"#9B5CFF"},
  {q:"Chaque session est un test de ton mental autant que de ta technique.",a:"PokerForge",cat:"Mental",col:"#9B5CFF"},
  {q:"Les joueurs perdants cherchent des raisons. Les gagnants cherchent des solutions.",a:"PokerForge",cat:"Mental",col:"#9B5CFF"},

  // ── DISCIPLINE ──
  {q:"Les champions ne sont pas plus motivés. Ils sont plus disciplinés.",a:"PokerForge",cat:"Discipline",col:"#1F8BFF"},
  {q:"L'excellence n'est pas un acte, c'est une habitude.",a:"Aristote",cat:"Discipline",col:"#1F8BFF"},
  {q:"Chaque heure de travail invisible construit les victoires visibles.",a:"PokerForge",cat:"Discipline",col:"#1F8BFF"},
  {q:"La discipline, c'est choisir ce que tu veux le plus sur ce que tu veux maintenant.",a:"PokerForge",cat:"Discipline",col:"#1F8BFF"},
  {q:"Jouer quand tu n'es pas à 100 % est le premier leak à corriger.",a:"PokerForge",cat:"Discipline",col:"#1F8BFF"},
  {q:"Les rituels créent la performance. La performance crée la confiance.",a:"PokerForge",cat:"Discipline",col:"#1F8BFF"},
  {q:"La régularité bat le talent qui n'a pas de discipline.",a:"PokerForge",cat:"Discipline",col:"#1F8BFF"},
  {q:"Fais de chaque session une promesse que tu te fais à toi-même.",a:"PokerForge",cat:"Discipline",col:"#1F8BFF"},
  {q:"Stop playing. Start studying. The money will follow.",a:"Doug Polk",cat:"Discipline",col:"#1F8BFF"},
  {q:"Discipline is remembering what you want.",a:"David Campbell",cat:"Discipline",col:"#1F8BFF"},
  {q:"Le vrai grinder ne joue pas plus longtemps. Il joue mieux.",a:"PokerForge",cat:"Discipline",col:"#1F8BFF"},

  // ── STRATÉGIE GTO ──
  {q:"La répétition transforme la théorie en instinct.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"GTO ne signifie pas parfait. Ça signifie inexploitable.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"Les ranges, pas les mains. Pense systèmes, pas situations.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"Chaque spot que tu étudies devient une arme en session.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"La fréquence correcte est plus importante que l'action correcte.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"Le meilleur bluff est celui qui aurait pu être de la valeur.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"Équilibrer ta range, c'est rendre chaque décision de ton adversaire incorrecte.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"Les solvers ne pensent pas à court terme. Tu ne devrais pas non plus.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"Connais ta range. Connais leur range. C'est là que commence le profit.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"In poker, the best hand doesn't always win. The best player does.",a:"Daniel Negreanu",cat:"GTO",col:"#34D8FF"},
  {q:"L'EV espéré se réalise toujours. Sois patient.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},
  {q:"Comprendre pourquoi tu gagnes est aussi important que de gagner.",a:"PokerForge",cat:"GTO",col:"#34D8FF"},

  // ── PERFORMANCE ──
  {q:"Les petits gains quotidiens créent les grands résultats.",a:"PokerForge",cat:"Performance",col:"#10D87A"},
  {q:"Tu n'améliores pas ce que tu ne mesures pas.",a:"Peter Drucker",cat:"Performance",col:"#10D87A"},
  {q:"Chaque spot étudié aujourd'hui devient un profit demain.",a:"PokerForge",cat:"Performance",col:"#10D87A"},
  {q:"Le winrate se construit hors session autant qu'en session.",a:"PokerForge",cat:"Performance",col:"#10D87A"},
  {q:"Progress is a choice, not a coincidence.",a:"PokerForge",cat:"Performance",col:"#10D87A"},
  {q:"Tes résultats d'aujourd'hui sont les décisions d'hier.",a:"PokerForge",cat:"Performance",col:"#10D87A"},
  {q:"1 % mieux chaque jour. 37× mieux en un an.",a:"James Clear",cat:"Performance",col:"#10D87A"},
  {q:"La performance durable vient de systèmes, pas de motivation.",a:"PokerForge",cat:"Performance",col:"#10D87A"},
  {q:"Master the fundamentals, then let the fundamentals master the game.",a:"PokerForge",cat:"Performance",col:"#10D87A"},
  {q:"Analyse tes erreurs comme un coach, pas comme un juge.",a:"PokerForge",cat:"Performance",col:"#10D87A"},
  {q:"La constance crée la compétence. La compétence crée la confiance.",a:"PokerForge",cat:"Performance",col:"#10D87A"},

  // ── CHAMPIONS ──
  {q:"Luck favors the prepared.",a:"Doyle Brunson",cat:"Champions",col:"#FFC247"},
  {q:"Poker is a hard way to make an easy living.",a:"Doyle Brunson",cat:"Champions",col:"#FFC247"},
  {q:"There is more to poker than life.",a:"Tom McEvoy",cat:"Champions",col:"#FFC247"},
  {q:"Every hand is a lesson. Every session is a chapter.",a:"Phil Ivey",cat:"Champions",col:"#FFC247"},
  {q:"Je n'ai pas gagné les WSOP en ayant les meilleures cartes.",a:"Doyle Brunson",cat:"Champions",col:"#FFC247"},
  {q:"Le plus grand exploit en poker, c'est de rester humble quand on gagne.",a:"Fedor Holz",cat:"Champions",col:"#FFC247"},
  {q:"Find a way to fall in love with the process.",a:"Jason Koon",cat:"Champions",col:"#FFC247"},
  {q:"Un bracelet WSOP ne se mérite pas en une nuit. Il se mérite en années.",a:"PokerForge",cat:"Champions",col:"#FFC247"},
  {q:"Les pros ne gagnent pas parce qu'ils ont de la chance. Ils ont de la chance parce qu'ils jouent bien.",a:"Phil Hellmuth",cat:"Champions",col:"#FFC247"},
  {q:"Comprendre son adversaire vaut parfois plus qu'une main premium.",a:"PokerForge",cat:"Champions",col:"#FFC247"},
  {q:"Le talent ouvre les portes. Le travail les maintient ouvertes.",a:"PokerForge",cat:"Champions",col:"#FFC247"},
  {q:"Champions are made between sessions, not during them.",a:"PokerForge",cat:"Champions",col:"#FFC247"},

  // ── TRAVAIL ──
  {q:"Hard work beats talent when talent doesn't work hard.",a:"Tim Notke",cat:"Travail",col:"#FF4560"},
  {q:"Chaque heure d'étude est un investissement avec des intérêts composés.",a:"PokerForge",cat:"Travail",col:"#FF4560"},
  {q:"Les autres jouent. Toi, tu étudies. La différence se voit aux résultats.",a:"PokerForge",cat:"Travail",col:"#FF4560"},
  {q:"Le solver ne joue pas à ta place. Mais il t'apprend à penser comme lui.",a:"PokerForge",cat:"Travail",col:"#FF4560"},
  {q:"Review your hands. Love your leaks. Fix them.",a:"PokerForge",cat:"Travail",col:"#FF4560"},
  {q:"Le confort est l'ennemi de la progression.",a:"PokerForge",cat:"Travail",col:"#FF4560"},
  {q:"Étudier les spots difficiles, c'est là que les autres abandonnent.",a:"PokerForge",cat:"Travail",col:"#FF4560"},
  {q:"Pain in training. Profit in sessions.",a:"PokerForge",cat:"Travail",col:"#FF4560"},
  {q:"Le temps passé à analyser est du temps passé à progresser.",a:"PokerForge",cat:"Travail",col:"#FF4560"},
  {q:"Les pros voient chaque erreur comme une opportunité. Les amateurs la cachent.",a:"PokerForge",cat:"Travail",col:"#FF4560"},

  // ── SHARK SOLVER / IA ──
  {q:"Les données ne mentent pas. Ta perception, oui.",a:"PokerForge",cat:"Shark",col:"#9B5CFF"},
  {q:"Le solver est ton miroir. Il montre la vérité, pas ce que tu veux entendre.",a:"PokerForge",cat:"Shark",col:"#9B5CFF"},
  {q:"Analyse. Itère. Améliore. Répète.",a:"PokerForge",cat:"Shark",col:"#9B5CFF"},
  {q:"L'IA te montre comment penser. C'est à toi d'apprendre à jouer.",a:"PokerForge",cat:"Shark",col:"#9B5CFF"},
  {q:"Chaque fréquence cachée dans la matrice est une arme pour ta prochaine session.",a:"PokerForge",cat:"Shark",col:"#9B5CFF"},
  {q:"Les leaks non détectés coûtent plus que les taxes.",a:"PokerForge",cat:"Shark",col:"#9B5CFF"},
  {q:"Shark Solver ne judge pas. Il optimise.",a:"PokerForge",cat:"Shark",col:"#9B5CFF"},
  {q:"Le futur du poker appartient à ceux qui comprennent les données.",a:"PokerForge",cat:"Shark",col:"#9B5CFF"},
];

/* ── Seeded shuffle (reproductible par heure) ── */
function seededShuffle(arr, seed){
  const a=[...arr];
  let s=seed;
  for(let i=a.length-1;i>0;i--){
    s=(s*1664525+1013904223)&0xffffffff;
    const j=Math.abs(s)%(i+1);
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

/* ── Sélection horaire des slides ── */
function getHourlySlides(){
  const hourSeed=Math.floor(Date.now()/3600000);
  const imgs=seededShuffle(BANNER_IMAGES,hourSeed).slice(0,8);
  const quotes=seededShuffle(BANNER_QUOTES,hourSeed+1);
  return imgs.map((img,i)=>({...img,quote:quotes[i%quotes.length]}));
}

/* ══════════════════════════════════════════════════════
   POKERFORGE BANNER — Carrousel Premium
══════════════════════════════════════════════════════ */
function PokerBanner(){
  const[slides]=useState(()=>getHourlySlides());
  const[cur,setCur]=useState(0);
  const[phase,setPhase]=useState("in"); // "in" | "out"

  useEffect(()=>{
    const t=setInterval(()=>{
      setPhase("out");
      setTimeout(()=>{
        setCur(c=>(c+1)%slides.length);
        setPhase("in");
      },700);
    },7000);
    return()=>clearInterval(t);
  },[slides.length]);

  const slide=slides[cur];
  const q=slide.quote;

  return(
    <div className="pf-banner" style={{height:220,position:"relative",overflow:"hidden",flexShrink:0}}>

      {/* ── Images avec ken-burns ── */}
      {slides.map((sl,i)=>(
        <div key={sl.id} style={{
          position:"absolute",inset:0,
          backgroundImage:`url(${sl.url})`,
          backgroundSize:"cover",backgroundPosition:"center 40%",
          transition:"opacity .7s ease, transform 7s ease",
          opacity:i===cur?1:0,
          transform:i===cur?"scale(1.04)":"scale(1)",
          willChange:"transform,opacity",
        }}/>
      ))}

      {/* ── Gradient overlay multi-couches ── */}
      <div style={{
        position:"absolute",inset:0,
        background:"linear-gradient(to right, rgba(3,7,18,.92) 0%, rgba(3,7,18,.65) 50%, rgba(3,7,18,.4) 100%), linear-gradient(to top, rgba(3,7,18,.88) 0%, transparent 55%)",
        zIndex:2,
      }}/>

      {/* ── Contenu ── */}
      <div style={{
        position:"absolute",inset:0,zIndex:3,
        display:"flex",flexDirection:"column",justifyContent:"center",
        padding:"0 40px",
        opacity:phase==="in"?1:0,
        transform:phase==="in"?"translateY(0)":"translateY(8px)",
        transition:"opacity .55s ease, transform .55s ease",
      }}>
        {/* Badge catégorie */}
        <div style={{
          display:"inline-flex",alignItems:"center",gap:6,
          marginBottom:10,alignSelf:"flex-start",
          padding:"3px 12px",borderRadius:20,
          background:`rgba(${q.col==="#9B5CFF"?"155,92,255":q.col==="#1F8BFF"?"31,139,255":q.col==="#34D8FF"?"52,216,255":q.col==="#10D87A"?"16,216,122":q.col==="#FFC247"?"255,194,71":q.col==="#FF4560"?"255,69,96":"155,92,255"},.18)`,
          border:`1px solid ${q.col}44`,
        }}>
          <span style={{
            fontFamily:"'Space Grotesk',sans-serif",fontSize:9,fontWeight:700,
            color:q.col,letterSpacing:".14em",textTransform:"uppercase",
          }}>{
            q.cat==="Mental"?"🧠 Mental Game":
            q.cat==="Discipline"?"⚡ Discipline":
            q.cat==="GTO"?"🎯 Stratégie GTO":
            q.cat==="Performance"?"📈 Performance":
            q.cat==="Champions"?"🏆 Champions":
            q.cat==="Travail"?"💪 Travail":
            "🦈 SharkSolver"
          }</span>
        </div>

        {/* Quote principale */}
        <div style={{
          fontFamily:"'Space Grotesk',sans-serif",
          fontSize:q.q.length>80?17:q.q.length>60?20:23,
          fontWeight:700,
          color:"#FFFFFF",
          lineHeight:1.35,
          maxWidth:700,
          textShadow:"0 2px 20px rgba(3,7,18,.8)",
          marginBottom:12,
          letterSpacing:".01em",
        }}>
          "{q.q}"
        </div>

        {/* Auteur */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:24,height:1.5,background:`linear-gradient(90deg,${q.col},transparent)`}}/>
          <span style={{
            fontFamily:"'Inter',sans-serif",fontSize:11,fontWeight:600,
            color:q.col,letterSpacing:".08em",opacity:.9,
          }}>{q.a}</span>
        </div>
      </div>

      {/* ── Indicateurs dots ── */}
      <div style={{
        position:"absolute",bottom:12,right:20,zIndex:4,
        display:"flex",gap:5,alignItems:"center",
      }}>
        {slides.map((_,i)=>(
          <div key={i} onClick={()=>{setPhase("out");setTimeout(()=>{setCur(i);setPhase("in");},300);}}
            style={{
              width:i===cur?20:6,height:6,borderRadius:3,cursor:"pointer",
              background:i===cur?"#1F8BFF":"rgba(255,255,255,.25)",
              transition:"all .35s cubic-bezier(.4,0,.2,1)",
              boxShadow:i===cur?"0 0 8px rgba(31,139,255,.6)":"none",
            }}
          />
        ))}
      </div>

      {/* ── Compteur discret (rotation horaire) ── */}
      <div style={{
        position:"absolute",top:12,right:16,zIndex:4,
        fontFamily:"'JetBrains Mono',monospace",fontSize:8,
        color:"rgba(255,255,255,.2)",letterSpacing:".1em",
      }}>
        {new Date().getHours()}h · {cur+1}/{slides.length}
      </div>

      {/* ── Bordure bottom lumineuse ── */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,height:2,zIndex:4,
        background:"linear-gradient(90deg,transparent,#1F8BFF,#9B5CFF,transparent)",
        opacity:.5,
      }}/>
    </div>
  );
}

/* ═══════════════════════════════════════
   POKER EVENTS HUB
═══════════════════════════════════════ */
function evStatus(start,end,now){
  const s=new Date(start+"T00:00:00"),e=new Date(end+"T23:59:59");
  if(now>e) return "finished";
  if(now>=s) return "ongoing";
  return "upcoming";
}
function evCountdown(start,now){
  const s=new Date(start+"T00:00:00");
  const diff=s-now;
  if(diff<=0) return null;
  const d=Math.floor(diff/86400000);
  const h=Math.floor((diff%86400000)/3600000);
  const m=Math.floor((diff%3600000)/60000);
  return {d,h,m};
}
function fmtGTD(n){
  if(n>=1000000000) return (n/1000000000).toFixed(0)+"Md";
  if(n>=1000000) return (n/1000000).toFixed(0)+"M";
  if(n>=1000) return (n/1000).toFixed(0)+"K";
  return n.toString();
}
const EV_BUYIN_RANGES={
  "Micro":[0,5],"Low":[5,50],"Mid":[50,500],"High":[500,5000],"High Roller":[5000,Infinity]
};
const EV_CIRCUITS=["Tous","WSOP","Winamax","PokerStars","GGPoker","WPT","EPT","Triton","FPS","PMU","Unibet","PartyPoker","APO","FPO"];
const EV_FORMATS=["Tous","MTT","KO","Mystery","PKO","Satellite"];
const EV_BUYINS=["Tous","Micro","Low","Mid","High","High Roller"];

function PokerEventsHub({onGoTrainer,onPrepareEvent}){
  const[view,setView]=useState("cards");
  const[fltType,setFltType]=useState("Tous");
  const[fltCircuit,setFltCircuit]=useState("Tous");
  const[fltBuyin,setFltBuyin]=useState("Tous");
  const[fltFormat,setFltFormat]=useState("Tous");
  const[alerts,setAlerts]=useState(()=>{try{return JSON.parse(localStorage.getItem("pf_ev_alerts")||"[]");}catch{return [];}});
  const[now,setNow]=useState(()=>new Date());
  const[calOffset,setCalOffset]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);
  function toggleAlert(id){
    const next=alerts.includes(id)?alerts.filter(x=>x!==id):[...alerts,id];
    setAlerts(next);
    try{localStorage.setItem("pf_ev_alerts",JSON.stringify(next));}catch{}
  }
  function matchBuyin(ev){
    if(fltBuyin==="Tous") return true;
    const[lo,hi]=EV_BUYIN_RANGES[fltBuyin];
    return ev.buyinMin<hi&&ev.buyinMax>=lo;
  }
  const filtered=POKER_EVENTS.filter(e=>{
    if(fltType!=="Tous"&&e.type!==fltType) return false;
    if(fltCircuit!=="Tous"&&e.circuit!==fltCircuit) return false;
    if(!matchBuyin(e)) return false;
    if(fltFormat!=="Tous"&&!e.formats.includes(fltFormat)) return false;
    return true;
  });
  const sorted=[...filtered].sort((a,b)=>{
    const ord={ongoing:0,upcoming:1,finished:2};
    return ord[evStatus(a.start,a.end,now)]-ord[evStatus(b.start,b.end,now)]||new Date(a.start)-new Date(b.start);
  });
  // Featured — premier ongoing/upcoming marqué featured
  const featEv=POKER_EVENTS.find(e=>e.featured&&evStatus(e.start,e.end,now)!=="finished");
  // Recommended — heuristique simple sur stats
  const st=loadStats();
  const avgPct=st.allPct.length>0?Math.round(st.allPct.reduce((a,b)=>a+b,0)/st.allPct.length):0;
  const recommended=POKER_EVENTS.filter(e=>{
    const s=evStatus(e.start,e.end,now);
    if(s==="finished") return false;
    if(avgPct<50) return e.buyinMin<=50||e.circuit==="Winamax"||e.circuit==="FPS"||e.circuit==="PMU"||e.circuit==="Unibet";
    if(avgPct<75) return e.buyinMin<=500&&(e.type==="online"||["FPS","FPO","PMU","Winamax","Unibet"].includes(e.circuit));
    return e.buyinMin<=2000;
  }).slice(0,6);

  // Calendar
  const calBase=new Date(2026,5+calOffset,1);
  const calYear=calBase.getFullYear(), calMonth=calBase.getMonth();
  const calMonthName=calBase.toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
  const firstDay=(new Date(calYear,calMonth,1).getDay()+6)%7; // lundi=0
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  function eventsOnDay(d){
    const day=new Date(calYear,calMonth,d);
    return POKER_EVENTS.filter(e=>{
      const s=new Date(e.start+"T00:00:00"),en=new Date(e.end+"T23:59:59");
      return day>=s&&day<=en;
    });
  }
  const todayDate=now.getDate(),todayMonth=now.getMonth(),todayYear=now.getFullYear();

  function FmtTag({f}){
    const cls={MTT:"ev-fmt-mtt",KO:"ev-fmt-ko",Mystery:"ev-fmt-mystery",PKO:"ev-fmt-pko",Satellite:"ev-fmt-satellite"}[f]||"ev-fmt-mtt";
    return <span className={`ev-fmt ${cls}`}>{f}</span>;
  }
  function StatusBadge({ev}){
    const s=evStatus(ev.start,ev.end,now);
    if(s==="ongoing") return <span className="ev-status-badge ev-st-ongoing"><span className="ev-ongoing-dot" style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"#10D87A",marginRight:4,verticalAlign:"middle"}}/>En cours</span>;
    if(s==="finished") return <span className="ev-status-badge ev-st-finished">Terminé</span>;
    const cd=evCountdown(ev.start,now);
    if(!cd) return null;
    if(cd.d>60) return <span className="ev-status-badge ev-st-upcoming">Dans {cd.d}j</span>;
    if(cd.d>0) return <span className="ev-status-badge ev-st-upcoming">Dans {cd.d}j {cd.h}h</span>;
    return <span className="ev-status-badge ev-st-upcoming">Dans {cd.h}h {cd.m}m</span>;
  }
  function MiniCountdown({ev}){
    const s=evStatus(ev.start,ev.end,now);
    if(s==="finished") return null;
    if(s==="ongoing") return(
      <div style={{marginBottom:8}}>
        <span className="ev-ongoing-badge"><span className="ev-ongoing-dot"/>En cours actuellement</span>
      </div>
    );
    const cd=evCountdown(ev.start,now);
    if(!cd) return null;
    return(
      <div className="ev-mini-cd">
        {cd.d>0&&<div className="ev-mini-cd-item"><div className="ev-mini-cd-num">{cd.d}</div><div className="ev-mini-cd-lbl">Jours</div></div>}
        <div className="ev-mini-cd-item"><div className="ev-mini-cd-num">{cd.h}</div><div className="ev-mini-cd-lbl">Heures</div></div>
        <div className="ev-mini-cd-item"><div className="ev-mini-cd-num">{cd.m}</div><div className="ev-mini-cd-lbl">Min</div></div>
      </div>
    );
  }
  function EventCard({ev}){
    const s=evStatus(ev.start,ev.end,now);
    const alerted=alerts.includes(ev.id);
    const startFmt=new Date(ev.start+"T00:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
    const endFmt=new Date(ev.end+"T23:59:59").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
    return(
      <div className={`ev-card${s==="ongoing"?" ev-ongoing":s==="finished"?" ev-finished":""}`}>
        <div className="ev-card-top">
          <span className="ev-circuit-badge" style={{background:`${ev.color}22`,color:ev.color,border:`1px solid ${ev.color}44`}}>{ev.circuit}</span>
          <StatusBadge ev={ev}/>
        </div>
        <div className="ev-card-name">{ev.name}</div>
        <div className="ev-card-loc">{ev.flag} {ev.loc}</div>
        <div className="ev-card-dates">{startFmt} → {endFmt}</div>
        <div className="ev-card-gtd">{ev.gtdDisplay}</div>
        {ev.events&&<div className="ev-events-count">{ev.events} événements · {ev.buyinDisplay}</div>}
        <MiniCountdown ev={ev}/>
        <div className="ev-formats">{ev.formats.map(f=><FmtTag key={f} f={f}/>)}</div>
        <div className="ev-card-footer">
          <button className="ev-prepare-btn" onClick={()=>onPrepareEvent?onPrepareEvent(ev):(onGoTrainer&&onGoTrainer())}>⚡ Se préparer</button>
          <button className={`ev-alert-btn${alerted?" alerted":""}`} title={alerted?"Supprimer l'alerte":"Me prévenir"} onClick={()=>toggleAlert(ev.id)}>{alerted?"🔔":"🔕"}</button>
          <a href={ev.url} target="_blank" rel="noreferrer" className="ev-detail-link">Détails →</a>
        </div>
      </div>
    );
  }

  return(
    <div className="ev-hub">
      {/* ── FEATURED BANNER ── */}
      {featEv&&(()=>{
        const s=evStatus(featEv.start,featEv.end,now);
        const cd=s==="upcoming"?evCountdown(featEv.start,now):null;
        return(
          <div className="ev-featured">
            <div className="ev-featured-glow" style={{background:`radial-gradient(circle,${featEv.color},transparent)`,opacity:.14}}/>
            <div className="ev-featured-badge">🔥 Événement Majeur</div>
            <div className="ev-featured-name">{featEv.name}</div>
            <div className="ev-featured-sub">{featEv.flag} {featEv.loc} · {featEv.sub}</div>
            <div className="ev-featured-gtd">{featEv.gtdDisplay}</div>
            {s==="ongoing"&&(
              <div style={{marginBottom:10}}>
                <span className="ev-ongoing-badge"><span className="ev-ongoing-dot"/>En cours actuellement</span>
              </div>
            )}
            {cd&&(
              <div>
                <div style={{fontSize:9,color:"rgba(255,255,255,.4)",marginBottom:6,letterSpacing:".08em",textTransform:"uppercase",fontFamily:"'Inter',sans-serif"}}>Débute dans</div>
                <div className="ev-cd-row">
                  {cd.d>0&&<div className="ev-cd-block"><div className="ev-cd-num">{cd.d}</div><div className="ev-cd-label">Jours</div></div>}
                  <div className="ev-cd-block"><div className="ev-cd-num">{cd.h}</div><div className="ev-cd-label">Heures</div></div>
                  <div className="ev-cd-block"><div className="ev-cd-num">{cd.m}</div><div className="ev-cd-label">Min</div></div>
                </div>
              </div>
            )}
            <div className="ev-featured-actions">
              <button className="ev-featured-btn ev-featured-btn-primary" onClick={()=>onPrepareEvent?onPrepareEvent(featEv):(onGoTrainer&&onGoTrainer())}>⚡ Se préparer avec PokerForge</button>
              <button className={`ev-featured-btn ev-featured-btn-secondary${alerts.includes(featEv.id)?" alerted":""}`} style={{border:"1px solid rgba(255,255,255,.18)"}} onClick={()=>toggleAlert(featEv.id)}>{alerts.includes(featEv.id)?"🔔 Alerte activée":"🔕 Me prévenir"}</button>
              <a href={featEv.url} target="_blank" rel="noreferrer" style={{padding:"7px 14px",borderRadius:8,fontSize:10,fontWeight:600,color:"rgba(255,255,255,.5)",border:"1px solid rgba(255,255,255,.12)",textDecoration:"none",display:"inline-flex",alignItems:"center",fontFamily:"'Space Grotesk',sans-serif"}}>Site officiel →</a>
            </div>
          </div>
        );
      })()}

      {/* ── RECOMMANDÉS ── */}
      {recommended.length>0&&(
        <div className="ev-rec-wrap ev-section-card">
          <div className="ev-rec-header">
            <div className="ev-rec-title">Recommandés pour vous</div>
            <span className="ev-rec-badge">Profil PokerForge</span>
          </div>
          <div className="ev-rec-row">
            {recommended.map(ev=>{
              const s=evStatus(ev.start,ev.end,now);
              const cd=s==="upcoming"?evCountdown(ev.start,now):null;
              const startFmt=new Date(ev.start+"T00:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
              return(
                <div key={ev.id} className="ev-rec-card">
                  <span className="ev-circuit-badge" style={{background:`${ev.color}22`,color:ev.color,border:`1px solid ${ev.color}44`,marginBottom:6,display:"inline-flex"}}>{ev.circuit}</span>
                  <div className="ev-rec-name">{ev.name}</div>
                  <div className="ev-rec-gtd">{ev.gtdDisplay}</div>
                  <div className="ev-rec-cd">{s==="ongoing"?"🟢 En cours":cd?`Dans ${cd.d}j ${cd.h}h`:`Dès ${startFmt}`}</div>
                  <button className="ev-rec-prep" onClick={()=>onPrepareEvent?onPrepareEvent(ev):(onGoTrainer&&onGoTrainer())}>⚡ Se préparer</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TOOLBAR: vue + filtres ── */}
      <div className="ev-toolbar">
        <div style={{display:"flex",gap:4}}>
          {[["cards","⊞ Cartes"],["calendar","📅 Calendrier"]].map(([v,l])=>(
            <button key={v} className={`ev-view-btn${view===v?" active":""}`} onClick={()=>setView(v)}>{l}</button>
          ))}
        </div>
        <div className="ev-filter-sep"/>
        <span className="ev-filter-label">Type</span>
        {["Tous","live","online"].map(f=>(
          <span key={f} className={`ev-chip${fltType===f?" active":""}`} onClick={()=>setFltType(f)}>{f}</span>
        ))}
        <div className="ev-filter-sep"/>
        <span className="ev-filter-label">Circuit</span>
        {EV_CIRCUITS.map(f=>(
          <span key={f} className={`ev-chip${fltCircuit===f?" active":""}`} onClick={()=>setFltCircuit(f)}>{f}</span>
        ))}
        <div className="ev-filter-sep"/>
        <span className="ev-filter-label">Buy-in</span>
        {EV_BUYINS.map(f=>(
          <span key={f} className={`ev-chip${fltBuyin===f?" active":""}`} onClick={()=>setFltBuyin(f)}>{f}</span>
        ))}
        <div className="ev-filter-sep"/>
        <span className="ev-filter-label">Format</span>
        {EV_FORMATS.map(f=>(
          <span key={f} className={`ev-chip${fltFormat===f?" active":""}`} onClick={()=>setFltFormat(f)}>{f}</span>
        ))}
      </div>

      {/* ── VUE CARTES ── */}
      {view==="cards"&&(
        <>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div className="ev-section-title">Tous les événements <span className="ev-count-badge">{sorted.length}</span></div>
          </div>
          {sorted.length===0&&<div className="ev-empty">Aucun événement correspond aux filtres sélectionnés.</div>}
          <div className="ev-grid">
            {sorted.map(ev=><EventCard key={ev.id} ev={ev}/>)}
          </div>
        </>
      )}

      {/* ── VUE CALENDRIER ── */}
      {view==="calendar"&&(
        <div className="ev-section-card ev-calendar">
          <div className="ev-cal-nav-row">
            <button className="ev-cal-btn" onClick={()=>setCalOffset(o=>o-1)}>‹</button>
            <div className="ev-cal-title">{calMonthName.charAt(0).toUpperCase()+calMonthName.slice(1)}</div>
            <button className="ev-cal-btn" onClick={()=>setCalOffset(o=>o+1)}>›</button>
          </div>
          <div className="ev-cal-grid">
            {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=>(
              <div key={d} className="ev-cal-dh">{d}</div>
            ))}
            {Array.from({length:firstDay}).map((_,i)=>(
              <div key={"e"+i} className="ev-cal-cell empty"/>
            ))}
            {Array.from({length:daysInMonth}).map((_,i)=>{
              const d=i+1;
              const dayEvs=eventsOnDay(d);
              const isToday=d===todayDate&&calMonth===todayMonth&&calYear===todayYear;
              const hasFeat=dayEvs.some(e=>e.featured);
              const cls=`ev-cal-cell${dayEvs.length>0?" has-ev":""}${isToday?" today-cell":""}${hasFeat?" has-feat":""}`;
              const colors=[...new Set(dayEvs.slice(0,3).map(e=>e.color))];
              return(
                <div key={d} className={cls} title={dayEvs.map(e=>e.name).join(", ")}>
                  <span>{d}</span>
                  {dayEvs.length>0&&(
                    <div className="ev-cal-dots">
                      {colors.map((c,ci)=><div key={ci} className="ev-cal-dot" style={{background:c}}/>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Légende du mois */}
          {(()=>{
            const monthEvs=POKER_EVENTS.filter(e=>{
              const s=new Date(e.start+"T00:00:00"),en=new Date(e.end+"T23:59:59");
              const mStart=new Date(calYear,calMonth,1),mEnd=new Date(calYear,calMonth+1,0,23,59,59);
              return s<=mEnd&&en>=mStart;
            });
            if(monthEvs.length===0) return <div className="ev-empty" style={{marginTop:12}}>Aucun événement ce mois-ci.</div>;
            return(
              <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:6}}>
                {monthEvs.map(ev=>{
                  const s=evStatus(ev.start,ev.end,now);
                  return(
                    <div key={ev.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#071B44",borderRadius:8,border:"1px solid #152D6E"}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:ev.color,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#FFFFFF",fontFamily:"'Space Grotesk',sans-serif"}}>{ev.name}</div>
                        <div style={{fontSize:9,color:"#9FB0CC"}}>{ev.flag} {ev.loc} · {ev.gtdDisplay}</div>
                      </div>
                      <StatusBadge ev={ev}/>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   POKER NEWS HUB
═══════════════════════════════════════ */
function PokerNewsHub({onGoTrainer}){
  const[nFlt,setNFlt]=useState("Toutes");
  const[nType,setNType]=useState("Tous");
  const[nSrc,setNSrc]=useState("Toutes");
  const[sumId,setSumId]=useState(null);
  const[trendIdx,setTrendIdx]=useState(0);
  const[nAlerts,setNAlerts]=useState(()=>{try{return JSON.parse(localStorage.getItem("pf_news_alerts")||"[]");}catch{return[];}});
  // ── Actualité poker EN DIRECT (Club Poker · PokerStrategy traduit · LivePoker) ──
  const[liveNews,setLiveNews]=useState([]);
  const[liveStatus,setLiveStatus]=useState("loading"); // loading | ok | error | empty
  const[liveAt,setLiveAt]=useState(null);
  const[liveSrc,setLiveSrc]=useState("Toutes");
  const seenRef=useRef(null);
  if(seenRef.current===null){try{seenRef.current=new Set(JSON.parse(localStorage.getItem("pf_news_seen")||"[]"));}catch{seenRef.current=new Set();}}
  const loadLive=useCallback(async()=>{
    setLiveStatus("loading");
    const r=await pfFetchNews(40);
    if(!r.ok){setLiveStatus("error");return;}
    const seen=seenRef.current||new Set();
    const items=(r.items||[]).map(n=>({...n,isNew:!seen.has(n.id)}));
    setLiveNews(items);setLiveStatus(items.length?"ok":"empty");setLiveAt(Date.now());
    try{const all=items.map(n=>n.id);localStorage.setItem("pf_news_seen",JSON.stringify(all.slice(0,200)));seenRef.current=new Set(all);}catch{}
  },[]);
  useEffect(()=>{loadLive();},[loadLive]);
  const liveFiltered=liveNews.filter(n=>liveSrc==="Toutes"||n.source===liveSrc);
  const liveSources=["Toutes",...Array.from(new Set(liveNews.map(n=>n.source)))];
  const newCount=liveNews.filter(n=>n.isNew).length;
  function toggleNAlert(id){
    const next=nAlerts.includes(id)?nAlerts.filter(x=>x!==id):[...nAlerts,id];
    setNAlerts(next);
    try{localStorage.setItem("pf_news_alerts",JSON.stringify(next));}catch{}
  }
  const NCATS=["Toutes","Live","Online","Stratégie","MTT","Cash Game","PKO","ICM","Logiciels"];
  const NTYPES=["Tous","Article","Vidéo","Podcast"];
  const NSRCS=["Toutes","PokerNews","Winamax","PokerStars","GGPoker","Kill Tilt","Club Poker","GTO Wizard"];
  const NSCORE={major:0,important:1,standard:2};
  const NTMAP={Article:"article","Vidéo":"video",Podcast:"podcast"};
  const nSt=loadStats();
  const nAvgPct=nSt.allPct.length>0?Math.round(nSt.allPct.reduce((a,b)=>a+b,0)/nSt.allPct.length):0;
  const nFiltered=POKER_NEWS.filter(n=>{
    if(nFlt!=="Toutes"&&n.cat!==nFlt&&!n.tags.includes(nFlt)) return false;
    if(nType!=="Tous"&&n.type!==NTMAP[nType]) return false;
    if(nSrc!=="Toutes"&&n.source!==nSrc) return false;
    return true;
  });
  const nSorted=[...nFiltered].sort((a,b)=>NSCORE[a.score]-NSCORE[b.score]||new Date(b.date)-new Date(a.date));
  const nFeat=POKER_NEWS.find(n=>n.featured);
  const nRec=POKER_NEWS.filter(n=>{
    if(nAvgPct<50) return n.score!=="standard"&&["Stratégie","PKO","ICM","MTT"].some(t=>n.tags.includes(t));
    if(nAvgPct<75) return n.score==="major"||n.score==="important";
    return n.score==="major"||n.cat==="Logiciels";
  }).slice(0,6);
  const nTrend=FIELD_TRENDS[trendIdx];
  function NScore({s}){
    if(s==="major") return <span className="news-score-badge news-score-major">🔥 Majeur</span>;
    if(s==="important") return <span className="news-score-badge news-score-imp">⭐ Important</span>;
    return <span className="news-score-badge news-score-std">• Standard</span>;
  }
  function NType({t}){
    if(t==="video") return <span className="news-type-badge news-type-vid">▶ Vidéo</span>;
    if(t==="podcast") return <span className="news-type-badge news-type-pod">🎧 Podcast</span>;
    return null;
  }
  return(
    <div className="news-hub">
      {/* ── ACTUALITÉ EN DIRECT (sources externes, auto-refresh ≤3h) ── */}
      <div className="news-section-card" style={{borderColor:"rgba(31,139,255,.3)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <div className="ev-section-title" style={{marginBottom:0,display:"flex",alignItems:"center",gap:7}}>
            <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:liveStatus==="ok"?"#10D87A":liveStatus==="loading"?"#FFC247":"#FF4560",boxShadow:`0 0 8px ${liveStatus==="ok"?"#10D87A":"#FFC247"}`}}/>
            📡 Actualité en direct
            {newCount>0&&<span style={{fontSize:8,fontWeight:800,color:"#FF4560",background:"rgba(255,69,96,.14)",border:"1px solid rgba(255,69,96,.35)",borderRadius:20,padding:"2px 8px",letterSpacing:".06em"}}>{newCount} NOUVEAU{newCount>1?"X":""}</span>}
          </div>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            {liveAt&&<span style={{fontSize:8.5,color:"#6F81A8",fontFamily:"'Inter',sans-serif"}}>MAJ {new Date(liveAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span>}
            <button onClick={loadLive} title="Rafraîchir" style={{padding:"4px 9px",borderRadius:7,fontSize:9,fontWeight:700,cursor:"pointer",background:"rgba(31,139,255,.1)",border:"1px solid rgba(31,139,255,.3)",color:"#7FB8FF",fontFamily:"'Space Grotesk',sans-serif"}}>↻ Actualiser</button>
          </div>
        </div>
        <div style={{fontSize:9,color:"#6F81A8",fontFamily:"'Inter',sans-serif",marginBottom:10,lineHeight:1.5}}>
          Sources : <b style={{color:"#34D8FF"}}>Club Poker</b> · <b style={{color:"#1F8BFF"}}>PokerNews</b> · <b style={{color:"#9B5CFF"}}>PokerStrategy</b> (traduit auto.) · <b style={{color:"#FFC247"}}>LivePoker</b> — rafraîchi automatiquement toutes les 3h.
        </div>
        {/* Filtre source */}
        {liveNews.length>0&&(
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
            {liveSources.map(s=>(
              <span key={s} className={`ev-chip${liveSrc===s?" active":""}`} onClick={()=>setLiveSrc(s)} style={{cursor:"pointer"}}>{s}</span>
            ))}
          </div>
        )}
        {liveStatus==="loading"&&<div style={{fontSize:10.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",padding:"10px 0"}}>Chargement des dernières actualités…</div>}
        {liveStatus==="error"&&<div style={{fontSize:10.5,color:"#FF8A8A",fontFamily:"'Inter',sans-serif",padding:"10px 0"}}>⚠ Actualités indisponibles (hors-ligne ou cloud injoignable). Réessaie plus tard.</div>}
        {liveStatus==="empty"&&<div style={{fontSize:10.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",padding:"10px 0"}}>Aucune actualité pour l'instant — la collecte se fait automatiquement.</div>}
        {liveStatus==="ok"&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {liveFiltered.map(n=>(
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer" style={{
                display:"flex",gap:11,alignItems:"flex-start",textDecoration:"none",
                padding:"9px 11px",borderRadius:10,
                background:n.isNew?"rgba(31,139,255,.06)":"rgba(255,255,255,.02)",
                border:`1px solid ${n.isNew?"rgba(31,139,255,.3)":"#152D6E"}`,transition:"all .15s",
              }}>
                {n.image
                  ?<img src={n.image} alt="" loading="lazy" style={{width:62,height:46,objectFit:"cover",borderRadius:7,flexShrink:0,background:"#0a1430"}} onError={e=>{e.currentTarget.style.display="none";}}/>
                  :<div style={{width:62,height:46,borderRadius:7,flexShrink:0,background:`${n.source_color||"#1F8BFF"}1a`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📰</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:8,fontWeight:800,color:n.source_color||"#1F8BFF",background:`${n.source_color||"#1F8BFF"}1a`,border:`1px solid ${n.source_color||"#1F8BFF"}40`,borderRadius:20,padding:"1px 7px",letterSpacing:".04em"}}>{n.source}</span>
                    {n.source==="PokerStrategy"&&<span style={{fontSize:7.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif"}}>🌐 traduit</span>}
                    {n.isNew&&<span style={{fontSize:7.5,fontWeight:800,color:"#FF4560",letterSpacing:".06em"}}>● NOUVEAU</span>}
                    {n.published_at&&<span style={{fontSize:8,color:"#6F81A8",fontFamily:"'Inter',sans-serif",marginLeft:"auto"}}>{new Date(n.published_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</span>}
                  </div>
                  <div style={{fontSize:11.5,fontWeight:700,color:"#E6EEFF",lineHeight:1.3,marginBottom:n.summary?3:0}}>{n.title}</div>
                  {n.summary&&<div style={{fontSize:9.5,color:"#9FB0CC",fontFamily:"'Inter',sans-serif",lineHeight:1.45,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{n.summary}</div>}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* À LA UNE */}
      {nFeat&&(
        <div className="news-feat">
          <div className="news-feat-glow"/>
          <div className="news-feat-badge">🔥 À LA UNE</div>
          <div className="news-feat-title">{nFeat.title}</div>
          <div className="news-feat-meta"><span style={{color:nFeat.srcC,fontWeight:700}}>{nFeat.source}</span> · {nFeat.date} · {nFeat.readTime} min de lecture</div>
          {sumId===nFeat.id&&(
            <div className="news-summary">
              <div className="news-sum-title">⚡ Résumé IA — Points clés</div>
              {nFeat.summary.map((s,i)=><div key={i} className="news-sum-item">• {s}</div>)}
            </div>
          )}
          <div className="news-feat-actions">
            <a href={nFeat.url} target="_blank" rel="noreferrer" style={{padding:"7px 14px",borderRadius:8,fontSize:10,fontWeight:700,color:"#FFFFFF",background:"rgba(255,69,96,.18)",border:"1px solid rgba(255,69,96,.4)",textDecoration:"none",display:"inline-flex",alignItems:"center",fontFamily:"'Space Grotesk',sans-serif"}}>Lire l'article</a>
            <button className="ev-featured-btn ev-featured-btn-secondary" style={{border:"1px solid rgba(255,255,255,.18)"}} onClick={()=>setSumId(sumId===nFeat.id?null:nFeat.id)}>{sumId===nFeat.id?"🔒 Masquer résumé":"🧠 Résumé IA"}</button>
            {nFeat.train&&<button className="ev-featured-btn ev-featured-btn-secondary" style={{border:"1px solid rgba(255,194,71,.35)",color:"#FFC247"}} onClick={()=>onGoTrainer&&onGoTrainer()}>⚡ {nFeat.train.label}</button>}
          </div>
        </div>
      )}
      {/* TENDANCES DU FIELD */}
      <div className="news-section-card">
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <div className="ev-section-title" style={{marginBottom:0}}>📈 Tendances du field</div>
          <div style={{display:"flex",gap:4,marginLeft:"auto",flexWrap:"wrap"}}>
            {FIELD_TRENDS.map((ft,i)=>(
              <span key={i} className={`ev-chip${trendIdx===i?" active":""}`} onClick={()=>setTrendIdx(i)} style={{background:`${ft.color}${trendIdx===i?"28":"12"}`,color:trendIdx===i?ft.color:"#9FB0CC",border:`1px solid ${ft.color}${trendIdx===i?"44":"22"}`}}>{ft.platform}</span>
            ))}
          </div>
        </div>
        <div className="trend-row">
          {nTrend.trends.map((t,i)=>(
            <div key={i} className="trend-item">
              <div className="trend-label">{t.label}</div>
              <div className={`trend-delta ${t.dir==="up"?"trend-up":"trend-down"}`}>{t.dir==="up"?"↑":"↓"} {t.delta}</div>
              <div className="trend-detail">{t.detail}</div>
            </div>
          ))}
        </div>
      </div>
      {/* RECOMMANDÉS */}
      {nRec.length>0&&(
        <div className="news-section-card">
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div className="ev-section-title" style={{marginBottom:0}}>🎯 Pour vous</div>
            <span className="ev-rec-badge">Profil PokerForge</span>
          </div>
          <div className="news-rec-row">
            {nRec.map(n=>(
              <div key={n.id} className="news-rec-card">
                <div style={{display:"flex",gap:4,marginBottom:4,flexWrap:"wrap"}}><NScore s={n.score}/><NType t={n.type}/></div>
                <div className="news-rec-title">{n.title}</div>
                <div className="news-rec-src" style={{color:n.srcC}}>{n.source}</div>
                {n.train&&<button className="news-train-btn" style={{width:"100%",marginTop:4}} onClick={()=>onGoTrainer&&onGoTrainer()}>⚡ {n.train.label}</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* FILTRES */}
      <div className="ev-toolbar" style={{flexWrap:"wrap",gap:"5px 8px",marginBottom:10}}>
        <span className="ev-filter-label">Catégorie</span>
        {NCATS.map(c=>(
          <span key={c} className={`ev-chip${nFlt===c?" active":""}`} onClick={()=>setNFlt(c)}>{c}</span>
        ))}
        <div className="ev-filter-sep"/>
        <span className="ev-filter-label">Type</span>
        {NTYPES.map(t=>(
          <span key={t} className={`ev-chip${nType===t?" active":""}`} onClick={()=>setNType(t)}>{t}</span>
        ))}
        <div className="ev-filter-sep"/>
        <span className="ev-filter-label">Source</span>
        {NSRCS.map(s=>(
          <span key={s} className={`ev-chip${nSrc===s?" active":""}`} onClick={()=>setNSrc(s)}>{s}</span>
        ))}
      </div>
      {/* LISTE ARTICLES */}
      <div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <div className="ev-section-title" style={{marginBottom:0}}>Toutes les actualités</div>
          <span className="ev-count-badge">{nSorted.length}</span>
        </div>
        {nSorted.length===0&&<div className="ev-empty">Aucune actualité ne correspond aux filtres sélectionnés.</div>}
        {nSorted.map(n=>(
          <div key={n.id} className="news-card">
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:5,flexWrap:"wrap"}}>
                  <NScore s={n.score}/>
                  <NType t={n.type}/>
                  <span style={{fontSize:8,color:n.srcC,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{n.source}</span>
                  <span style={{fontSize:8,color:"#4A6090",fontFamily:"'JetBrains Mono',monospace"}}>{n.date}</span>
                  <span style={{fontSize:8,color:"#4A6090"}}>· {n.type==="podcast"?n.readTime+"min lect.":"~"+n.readTime+" min"}</span>
                </div>
                <div className="news-card-title">{n.title}</div>
                {sumId===n.id&&(
                  <div className="news-summary">
                    <div className="news-sum-title">⚡ Résumé IA</div>
                    {n.summary.map((s,i)=><div key={i} className="news-sum-item">• {s}</div>)}
                  </div>
                )}
              </div>
              <button className={`ev-alert-btn${nAlerts.includes(n.id)?" alerted":""}`} title={nAlerts.includes(n.id)?"Ne plus suivre":"Suivre ce sujet"} onClick={()=>toggleNAlert(n.id)}>{nAlerts.includes(n.id)?"🔔":"🔕"}</button>
            </div>
            <div className="news-card-footer">
              <a href={n.url} target="_blank" rel="noreferrer" className="news-read-btn">{n.type==="video"?"▶ Regarder":n.type==="podcast"?"🎧 Écouter":"Lire →"}</a>
              <button className="news-sum-btn" onClick={()=>setSumId(sumId===n.id?null:n.id)}>{sumId===n.id?"Masquer":"Résumé IA"}</button>
              {n.train&&<button className="news-train-btn" onClick={()=>onGoTrainer&&onGoTrainer()}>⚡ {n.train.label}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   DASHBOARD TAB — Données réelles
═══════════════════════════════════════ */
/* Temps relatif FR à partir d'une date ISO */
function pfRelTime(iso){
  if(!iso)return "";
  const t=Date.parse(iso);if(isNaN(t))return "";
  const diff=Math.max(0,Date.now()-t),h=Math.floor(diff/3600000),d=Math.floor(h/24);
  if(d>=1)return `il y a ${d}j`;
  if(h>=1)return `il y a ${h}h`;
  const m=Math.floor(diff/60000);return m>=1?`il y a ${m}min`:"à l'instant";
}
function PokerNewsCard({news,onOpen}){
  return(
    <button className="pf-news-card" onClick={()=>onOpen(news)} style={news.isNew?{borderColor:"rgba(31,139,255,.55)",boxShadow:"0 0 0 1px rgba(31,139,255,.25)"}:undefined}>
      <div className="pf-news-card-top">
        <span className="pf-news-logo" style={{color:news.color,borderColor:`${news.color}66`,background:`${news.color}18`}}>{news.mark}</span>
        <div className="pf-news-meta">
          <span style={{color:news.color}}>{news.category}</span>
          <em>{news.dateLabel}{news.translated?" · 🌐 traduit":""}</em>
        </div>
        {news.isNew&&<span style={{marginLeft:"auto",fontSize:7.5,fontWeight:800,color:"#fff",background:"#FF4560",borderRadius:20,padding:"2px 7px",letterSpacing:".05em",alignSelf:"flex-start"}}>NOUVEAU</span>}
      </div>
      <div className="pf-news-title">{news.title}</div>
      <div className="pf-news-desc">{news.description}</div>
    </button>
  );
}

function PokerNewsModal({news,onClose}){
  if(!news)return null;
  return(
    <div className="pf-news-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="pf-news-modal" role="dialog" aria-modal="true" aria-label={news.title} onClick={e=>e.stopPropagation()}>
        <div className="pf-news-modal-head">
          <span className="pf-news-logo pf-news-modal-logo" style={{color:news.color,borderColor:`${news.color}66`,background:`${news.color}18`}}>{news.mark}</span>
          <div>
            <div className="pf-news-modal-source" style={{color:news.color}}>{news.source} · {news.dateLabel}</div>
            <div className="pf-news-modal-title">{news.title}</div>
          </div>
        </div>
        <div className="pf-news-modal-body">{news.summary||news.description}</div>
        <div className="pf-news-modal-actions">
          <a className="pf-news-read-full" href={news.url} target="_blank" rel="noreferrer">Lire l'article complet</a>
          <button className="pf-news-close-btn" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

const PF_NEWS_MARK={"Club Poker":"CP","PokerStrategy":"PS","LivePoker":"LP","PokerNews":"PN"};
function PokerNewsSection({articleCount,ongoingCount,todayNewsCount}){
  const railRef=useRef(null);
  const[activeNews,setActiveNews]=useState(null);
  const[scrollState,setScrollState]=useState({left:false,right:false});
  // ── Actualité EN DIRECT (Club Poker · PokerStrategy traduit · LivePoker), refresh ≤3h ──
  const[live,setLive]=useState(null);   // null = pas encore chargé → fallback statique
  const[loading,setLoading]=useState(false);
  const[liveAt,setLiveAt]=useState(null);
  const seenRef=useRef(null);
  if(seenRef.current===null){try{seenRef.current=new Set(JSON.parse(localStorage.getItem("pf_news_seen")||"[]"));}catch{seenRef.current=new Set();}}
  const loadLive=useCallback(async()=>{
    setLoading(true);
    const r=await pfFetchNews(32);
    setLoading(false);
    if(!r.ok||!r.items.length){return;}
    const seen=seenRef.current||new Set();
    const mapped=r.items.map(n=>({
      id:n.id,source:n.source,color:n.source_color||"#1F8BFF",mark:PF_NEWS_MARK[n.source]||"●",
      category:(n.source||"").toUpperCase(),dateLabel:pfRelTime(n.published_at||n.fetched_at),
      title:n.title,description:n.summary||"",summary:n.summary||"",url:n.url,
      translated:n.source==="PokerStrategy",isNew:!seen.has(n.id),
    }));
    setLive(mapped);setLiveAt(Date.now());
    try{const ids=mapped.map(n=>n.id);localStorage.setItem("pf_news_seen",JSON.stringify(ids.slice(0,200)));seenRef.current=new Set(ids);}catch{}
  },[]);
  useEffect(()=>{loadLive();},[loadLive]);
  const news=(live&&live.length)?live:fetchPokerNews({limit:12});
  const newCount=(live||[]).filter(n=>n.isNew).length;
  const status=updateNewsStatus({total:(live&&live.length)?live.length:articleCount,ongoing:ongoingCount,today:newCount});
  function syncScroll(){
    const el=railRef.current;
    if(!el)return;
    setScrollState({
      left:el.scrollLeft>4,
      right:el.scrollLeft+el.clientWidth<el.scrollWidth-4,
    });
  }
  useEffect(()=>{
    syncScroll();
    const el=railRef.current;
    if(!el)return;
    el.addEventListener("scroll",syncScroll,{passive:true});
    const onResize=()=>syncScroll();
    window.addEventListener("resize",onResize);
    return()=>{el.removeEventListener("scroll",syncScroll);window.removeEventListener("resize",onResize);};
  },[]);
  function scrollNews(dir){
    const el=railRef.current;
    if(!el)return;
    el.scrollBy({left:dir*el.clientWidth*.82,behavior:"smooth"});
    setTimeout(syncScroll,280);
  }
  return(
    <section className="pf-dash-panel pf-news-section">
      <div className="pf-news-head">
        <div className="pf-card-title">Actualités Poker</div>
        <div className="pf-news-badges">
          <span className="pf-news-badge articles">{status.total} articles</span>
          {newCount>0&&<span className="pf-news-badge" style={{background:"rgba(255,69,96,.12)",border:"1px solid rgba(255,69,96,.35)",color:"#FF7A8A"}}>🔥 {newCount} nouveau{newCount>1?"x":""}</span>}
          {live&&<span className="pf-news-badge" style={{background:"rgba(16,216,122,.1)",border:"1px solid rgba(16,216,122,.3)",color:"#10D87A"}}>● en direct</span>}
        </div>
        <div className="pf-news-nav" aria-label="Navigation actualités">
          <button type="button" onClick={loadLive} disabled={loading} title="Rafraîchir les actualités" aria-label="Rafraîchir">{loading?"…":"↻"}</button>
          <button type="button" onClick={()=>scrollNews(-1)} disabled={!scrollState.left} aria-label="Actualités précédentes">‹</button>
          <button type="button" onClick={()=>scrollNews(1)} disabled={!scrollState.right&&news.length<=5} aria-label="Actualités suivantes">›</button>
        </div>
      </div>
      {live&&<div style={{fontSize:8.5,color:"#6F81A8",fontFamily:"'Inter',sans-serif",margin:"-4px 0 8px",padding:"0 2px"}}>Sources : Club Poker · PokerNews · PokerStrategy (traduit) · LivePoker{liveAt?` — MAJ ${new Date(liveAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`:""}. Auto toutes les 3h.</div>}
      <div className="pf-news-filter-ready" aria-hidden="true">
        {POKER_NEWS_FILTERS.map(f=><span key={f}>{f}</span>)}
      </div>
      <div className="pf-news-rail-wrap">
        <div className="pf-news-rail" ref={railRef}>
          {news.map(n=><PokerNewsCard key={n.id} news={n} onOpen={setActiveNews}/>)}
        </div>
      </div>
      <PokerNewsModal news={activeNews} onClose={()=>setActiveNews(null)}/>
    </section>
  );
}

function DashboardHeroBanner(){
  return(
    <div className="pf-hero">
      <div className="pf-hero-content">
        <div className="pf-hero-kicker">PokerForge</div>
        <div className="pf-hero-title">
          FORGEZ UN AVANTAGE
          <span>QUE LE FIELD NE VOIT PAS.</span>
        </div>
        <div className="pf-hero-sub">Analyse. Entraîne-toi. Progresse.</div>
      </div>
      <div className="pf-hero-stage">
        <div className="pf-hero-bolt"/>
        <div className="pf-hero-mark">PF</div>
        <div className="pf-hero-stack"/>
        <div className="pf-hero-chip c1"/>
        <div className="pf-hero-chip c2"/>
        <div className="pf-hero-chip c3"/>
        <div className="pf-hero-hud h1"/>
        <div className="pf-hero-hud h2"/>
        <div className="pf-hero-hud h3"/>
      </div>
      <div className="pf-hero-dots">
        <span className="pf-hero-dot on"/>
        <span className="pf-hero-dot"/>
        <span className="pf-hero-dot"/>
      </div>
    </div>
  );
}

export default function DashboardTab({onGoTrainer,onGoReplayer,onPrepareEvent,onGoSolver,onGoCoach,onGoHands,NavIcon}){
  const[now,setNow]=useState(new Date());
  const[dashToast,setDashToast]=useState(null);
  const[evOpen,setEvOpen]=useState(false);
  const[newsOpen,setNewsOpen]=useState(false);
  function showDashToast(msg){setDashToast(msg);setTimeout(()=>setDashToast(null),3000);}
  const[st,setSt]=useState(()=>loadStats());
  const[history]=useState(()=>loadHistory());
  const lastSess=history[0];

  // Horloge temps réel
  useEffect(()=>{const t=setInterval(()=>{setNow(new Date());setSt(loadStats());},1000);return()=>clearInterval(t);},[]);

  // Données réelles ou démos si aucune session
  const hasData=st.sessions>0;
  const weekDayNames=["D","L","M","M","J","V","S"];
  const weekData=st.weekData.length===7?st.weekData:[0,0,0,0,0,0,0];
  const weekMax=Math.max(...weekData,1);
  const todayIdx=now.getDay();

  // KPI
  const globalPct=st.allPct.length>0?Math.round(st.allPct.reduce((a,b)=>a+b,0)/st.allPct.length):0;
  const lastPct=st.allPct.length>0?st.allPct[st.allPct.length-1]:0;
  const prevPct=st.allPct.length>1?st.allPct[st.allPct.length-2]:lastPct;
  const deltaPct=lastPct-prevPct;

  // Leaks réels
  const LEAK_ICONS={"3-bet":"🎯","Squeeze":"💀","Open":"📏","Cbet":"🃏","River":"🌊","ICM":"🏆","Bluff":"🃏","Double barrel":"🔥"};
  const realLeaks=st.leaks.length>0?st.leaks.map(l=>({
    ico:LEAK_ICONS[l.cat]||"⚠",label:l.cat,pct:100-l.acc,
    color:l.acc<40?T.red:l.acc<60?T.amber:T.blue,count:l.count
  })):[
    {ico:"🎯",label:"Lance une session pour détecter tes leaks",pct:0,color:T.text3,count:0},
  ];

  // Domain progress réels
  const DOMAIN_ORDER=["Preflop Ranges","Continuation Bet","River Play","ICM Tournois","Équité & Maths","Autres"];
  const DOMAIN_COLORS=[T.gold,T.amber,T.blue,T.purple,T.green,T.text3];
  const domainRows=DOMAIN_ORDER.filter(d=>st.domainPct[d]!==undefined).map((d,i)=>([d,st.domainPct[d],DOMAIN_COLORS[i]]));
  if(domainRows.length===0){
    DOMAIN_ORDER.forEach((d,i)=>domainRows.push([d,0,DOMAIN_COLORS[i]]));
  }

  // Objectifs dynamiques
  const goals=[
    {label:"Faire une session d'entrainement",xp:"+50 XP",done:st.sessions>0&&st.lastDate===now.toDateString()},
    {label:"Analyser une main dans le Replayer",xp:"+30 XP",done:st.analysesCount>0},
    {label:"Atteindre 75% de précision",xp:"+100 XP",done:globalPct>=75},
    {label:"Session Marathon (100 spots)",xp:"+200 XP",done:st.totalSpots>=100},
  ];

  // Niveau
  const xpForNext=st.level*500;
  const xpProgress=Math.round(((st.xp%(xpForNext))/xpForNext)*100);

  // Aujourd'hui — stats actualités
  const todayStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const todayNewsCount=POKER_NEWS.filter(n=>n.date===todayStr).length;
  const todayMajor=POKER_NEWS.filter(n=>n.score==="major"&&n.date===todayStr).length;
  const todayVideos=POKER_NEWS.filter(n=>n.type==="video"&&n.date===todayStr).length;
  const todayOngoing=POKER_EVENTS.filter(e=>evStatus(e.start,e.end,now)==="ongoing").length;

  // Format heure
  const hh=now.getHours().toString().padStart(2,"0");
  const mm=now.getMinutes().toString().padStart(2,"0");
  const ss2=now.getSeconds().toString().padStart(2,"0");
  const dateStr=now.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});

  const pokerIQ=calcPokerIQ(st);
  const dailyProg=buildDailyProgram(st);
  const statusOrder={ongoing:0,upcoming:1,finished:2};
  const upcomingEvents=[...POKER_EVENTS]
    .filter(e=>evStatus(e.start,e.end,now)!=="finished")
    .sort((a,b)=>statusOrder[evStatus(a.start,a.end,now)]-statusOrder[evStatus(b.start,b.end,now)]||new Date(a.start)-new Date(b.start))
    .slice(0,4);
  const eventTimeLabel=ev=>{
    const s=evStatus(ev.start,ev.end,now);
    if(s==="ongoing")return "En cours";
    const cd=evCountdown(ev.start,now);
    if(!cd)return "Bientot";
    if(cd.d>0)return `${cd.d}j ${cd.h}h`;
    return `${cd.h}h ${cd.m}m`;
  };
  const eventInitial=ev=>(ev.circuit||ev.name||"PF").slice(0,2).toUpperCase();
  const objectiveEvent=upcomingEvents[0]||POKER_EVENTS[0];
  const activeGoal=goals.find(g=>!g.done)||goals[0];
  const objectivePct=hasData?Math.max(18,Math.min(96,globalPct||Math.round((st.totalSpots||0)%100))):68;
  const careerPct=hasData?Math.max(12,Math.min(94,Math.round(((st.sessions||0)/(Math.max(1,(st.sessions||0)+4)))*100))):42;
  const levelScore=hasData?Math.max(1,Math.min(99,globalPct||Math.round((st.level||1)*8))):78;
  const levelTrend=hasData?weekData:[38,44,52,46,61,78,66];
  const levelTrendMax=Math.max(...levelTrend,1);
  const sampleLeaks=[
    {ico:"♜",label:"Defense BB trop loose",pct:78,color:"#FF4560",severity:"Eleve",impact:"-0.48 EV/100"},
    {ico:"♛",label:"Overbluff river",pct:52,color:"#FF6B3D",severity:"Eleve",impact:"-0.35 EV/100"},
    {ico:"♞",label:"Sous utilisation du check-raise",pct:64,color:"#FFC247",severity:"Moyen",impact:"-0.22 EV/100"},
    {ico:"♙",label:"Mauvaise gestion des SPR faibles",pct:43,color:"#FFD166",severity:"Moyen",impact:"-0.18 EV/100"},
    {ico:"♣",label:"Calls trop optimistes vs 3bet",pct:30,color:"#4FE3C1",severity:"Faible",impact:"-0.12 EV/100"},
  ];
  const priorityLeaks=hasData&&realLeaks.some(l=>l.pct>0)
    ?realLeaks.slice(0,5).map(l=>({
      ico:l.ico,label:l.label,pct:l.pct,color:l.color,
      severity:l.pct>60?"Eleve":l.pct>38?"Moyen":"Faible",
      impact:l.count?`${l.count} spots`:"A surveiller",
    }))
    :sampleLeaks;
  const pctFromCat=cat=>{
    const v=st.catAcc?.[cat];
    return v&&v.total>0?Math.round(v.ok/v.total*100):null;
  };
  const pctFromDomain=domain=>st.domainPct?.[domain]??null;
  const domainStats=[
    ["Preflop",hasData?(pctFromDomain("Preflop Ranges")??pctFromCat("RFI")??0):82,T.blue],
    ["Flop",hasData?(pctFromDomain("Continuation Bet")??pctFromCat("Flop")??0):74,T.red],
    ["Turn",hasData?(pctFromCat("Turn")??0):58,T.amber],
    ["River",hasData?(pctFromDomain("River Play")??pctFromCat("River")??0):71,T.gold],
    ["3bet Pots",hasData?(pctFromCat("Vs 3-bet")??0):67,T.green],
    ["ICM",hasData?(pctFromDomain("ICM Tournois")??pctFromCat("ICM")??0):63,T.amber],
    ["PKO",hasData?(pctFromCat("PKO")??pctFromDomain("Autres")??0):61,"#FF7A2F"],
    ["Mental",hasData?Math.min(99,Math.round((st.streak||0)*8+(st.sessions||0)*2)):69,T.red],
  ];
  const radarPointString=(vals,scale=1)=>{
    const n=vals.length||1,cx=100,cy=100,r=76*scale;
    return vals.map((v,i)=>{
      const a=-Math.PI/2+(i*2*Math.PI/n);
      const rr=r*Math.max(0,Math.min(100,v))/100;
      return `${Math.round((cx+Math.cos(a)*rr)*10)/10},${Math.round((cy+Math.sin(a)*rr)*10)/10}`;
    }).join(" ");
  };
  const radarGrid=[.25,.5,.75,1].map(s=>radarPointString(new Array(domainStats.length).fill(100),s));
  const radarPoints=radarPointString(domainStats.map(d=>d[1]));
  const missionFocus=dailyProg.mainLeak?.cat&&dailyProg.mainLeak.cat!=="Général"?dailyProg.mainLeak.cat:"PKO Fundamentals";
  const missionSpots=dailyProg.program?.[0]?.spots||20;
  const quickActions=[
    {icon:"trainer",label:"Lancer un Training",sub:"Session ciblee",fn:onGoTrainer},
    {icon:"ranges",label:"Ouvrir Ranges",sub:"Replayer · ranges & EV",fn:onGoSolver||(()=>showDashToast("Module Ranges disponible dans Replayer"))},
    {icon:"pratique",label:"Analyser mes mains",sub:"Review & leaks",fn:onGoHands||onGoReplayer},
    {icon:"replayer",label:"Rejouer une session",sub:"Replayer IA",fn:onGoReplayer},
    {icon:"library",label:"Voir mon plan",sub:"Objectifs du jour",fn:onGoCoach||onGoTrainer},
    {icon:"coach",label:"Parler au Coach AI",sub:"Pose une question",fn:onGoCoach||(()=>showDashToast("Coach AI dans le menu gauche")),primary:true},
  ];

  return(
    <div className="pf-dash-shell">
      <div className="dash pf-dash">
        <div className="pf-dash-grid-top">
          <div className="pf-dash-banner-shell">
            <DashboardHeroBanner/>
          </div>

          <section className="pf-dash-panel">
            <div className="pf-dash-panel-head">
              <div className="pf-dash-eyebrow">Prochains événements</div>
              {todayOngoing>0&&<span style={{fontSize:9,color:T.green,fontFamily:T.stats,fontWeight:800}}>● {todayOngoing} en cours</span>}
              <button className="pf-dash-link" onClick={()=>setEvOpen(o=>!o)}>{evOpen?"Masquer":"Voir tout →"}</button>
            </div>
            <div className="pf-events-list">
              {upcomingEvents.map(ev=>(
                <div key={ev.id} className="pf-event-row">
                  <div className="pf-event-mark" style={{color:ev.color,background:`${ev.color}18`,border:`1px solid ${ev.color}45`}}>{eventInitial(ev)}</div>
                  <div style={{minWidth:0}}>
                    <div className="pf-event-kicker" style={{color:ev.color}}>{ev.circuit}</div>
                    <div className="pf-event-name">{ev.name}</div>
                  </div>
                  <div>
                    <div style={{fontSize:8,color:T.text4,fontFamily:T.stats,fontWeight:800,textTransform:"uppercase",letterSpacing:".08em",textAlign:"right"}}>Debute dans</div>
                    <div className="pf-event-time">{eventTimeLabel(ev)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {evOpen&&(
          <div className="pf-expanded-hub pf-dash-panel" style={{padding:14,marginBottom:12}}>
            <PokerEventsHub onGoTrainer={onGoTrainer} onPrepareEvent={onPrepareEvent}/>
          </div>
        )}

        <div className="pf-dash-stat-grid">
          <section className="pf-dash-card">
            <div className="pf-card-top">
              <div className="pf-card-icon" style={{color:T.blue}}><NavIcon id="trainer" size={16} color="currentColor"/></div>
              <div className="pf-card-title">Objectif actif</div>
            </div>
            <div className="pf-card-row">
              <div style={{flex:1,minWidth:0}}>
                <div className="pf-card-main">{objectiveEvent?.name||activeGoal.label}</div>
                <div className="pf-card-muted" style={{marginTop:9}}>Preparation globale</div>
                <div className="pf-progress-track" style={{marginTop:6}}>
                  <div className="pf-progress-fill" style={{width:objectivePct+"%"}}/>
                </div>
              </div>
              <div className="pf-ring" style={{background:`conic-gradient(${T.blue} ${objectivePct*3.6}deg, rgba(74,144,255,.16) 0deg)`}}>
                <div className="pf-ring-inner">{objectivePct}<small>%</small></div>
              </div>
            </div>
            <div className="pf-card-split">
              <div><div className="pf-kv-label">Temps restant</div><div className="pf-kv-value">{objectiveEvent?eventTimeLabel(objectiveEvent):"14 jours"}</div></div>
              <div><div className="pf-kv-label">Mission</div><div className="pf-kv-value">{missionFocus}</div></div>
            </div>
          </section>

          <section className="pf-dash-card">
            <div className="pf-card-top">
              <div className="pf-card-icon" style={{color:T.purple}}><NavIcon id="coach" size={16} color="currentColor"/></div>
              <div className="pf-card-title">Career mode</div>
            </div>
            <div className="pf-card-main">Devenir gagnant en MTT 20€</div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginTop:14,position:"relative",zIndex:1}}>
              <div style={{fontFamily:T.mono,fontSize:28,fontWeight:900,color:T.blue}}>{careerPct}%</div>
              <div className="pf-progress-track" style={{flex:1}}>
                <div className="pf-progress-fill" style={{width:careerPct+"%",background:`linear-gradient(90deg,${T.blue},${T.purple})`}}/>
              </div>
            </div>
            <div className="pf-card-split">
              <div><div className="pf-kv-label">Niveau actuel</div><div className="pf-kv-value">{hasData?`Lv ${st.level}`:"Bronze"} ›</div></div>
              <div><div className="pf-kv-label">Prochain rang</div><div className="pf-kv-value">{hasData?`${xpForNext-st.xp%xpForNext} XP`:"Silver"}</div></div>
            </div>
          </section>

          <section className="pf-dash-card">
            <div className="pf-card-top">
              <div className="pf-card-icon" style={{color:T.cyan}}><NavIcon id="dash" size={16} color="currentColor"/></div>
              <div className="pf-card-title">Niveau général</div>
            </div>
            <div className="pf-card-row">
              <div className="pf-ring" style={{background:`conic-gradient(${T.blue} ${levelScore*3.6}deg, rgba(74,144,255,.16) 0deg)`}}>
                <div className="pf-ring-inner">{levelScore}<small>/100</small></div>
              </div>
              <div>
                <div className="pf-card-main">{pokerIQ.overall?pokerIQ.rank:"Regulier"}</div>
                <div className="pf-card-muted">Micro/Low Stakes</div>
                <div className="pf-card-muted" style={{marginTop:10,color:T.green}}>Precision GTO ↑ {hasData?`${Math.max(0,deltaPct)}% vs derniere`:"+38% vs mois dernier"}</div>
              </div>
            </div>
            <div style={{height:30,display:"flex",alignItems:"end",gap:4,marginTop:10,position:"relative",zIndex:1}}>
              {levelTrend.map((v,i)=><div key={i} style={{flex:1,height:Math.max(4,Math.min(28,Math.round((v||0)/(levelTrendMax||1)*28))),borderRadius:"4px 4px 0 0",background:i===todayIdx?`linear-gradient(180deg,${T.cyan},${T.blue})`:"rgba(31,139,255,.32)"}}/>)}
            </div>
          </section>

          <section className="pf-dash-card">
            <div className="pf-card-top">
              <div className="pf-card-icon" style={{color:T.purple}}><NavIcon id="ranges" size={16} color="currentColor"/></div>
              <div className="pf-card-title">Streak</div>
            </div>
            <div className="pf-card-row" style={{alignItems:"center"}}>
              <div className="pf-xl-number">{st.streak||0}</div>
              <div>
                <div className="pf-card-main" style={{fontWeight:700}}>jours consecutifs</div>
                <div className="pf-card-muted">Record : {st.streakRecord||0} jours</div>
              </div>
            </div>
            <div className="pf-streak-days">
              {weekDayNames.map((d,i)=>(
                <div key={i} className="pf-streak-day">
                  <div className={`pf-streak-dot${weekData[i]>0?" done":""}${i===todayIdx?" today":""}`}>{d}</div>
                  <div className="pf-streak-label">{d}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="pf-dash-main-grid">
          <section className="pf-dash-card" style={{minHeight:230}}>
            <div className="pf-card-top">
              <div className="pf-card-title">Top 5 leaks prioritaires</div>
              <div style={{marginLeft:"auto",fontSize:8,color:T.text4,fontFamily:T.stats,fontWeight:800}}>IMPACT ESTIME</div>
            </div>
            <div className="pf-leak-list">
              {priorityLeaks.map((l,i)=>(
                <div key={i} className="pf-leak-item">
                  <div className="pf-leak-badge" style={{color:l.color,borderColor:`${l.color}55`,background:`${l.color}17`}}>{l.ico}</div>
                  <div className="pf-leak-name">{l.label}</div>
                  <div className="pf-leak-track"><div className="pf-leak-fill" style={{width:l.pct+"%",background:l.color,color:l.color}}/></div>
                  <div className="pf-leak-impact" style={{color:l.color}}><b>{l.severity}</b><br/>{l.impact}</div>
                </div>
              ))}
            </div>
            <button className="pf-dash-link" style={{marginTop:14,position:"relative",zIndex:1}} onClick={onGoTrainer}>Voir tous mes leaks →</button>
          </section>

          <section className="pf-dash-card" style={{minHeight:230}}>
            <div className="pf-card-top">
              <div className="pf-card-icon" style={{color:T.purple}}><NavIcon id="coach" size={16} color="currentColor"/></div>
              <div className="pf-card-title">Mission du jour</div>
            </div>
            <div className="pf-mission-card">
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div className="pf-mission-title">{missionFocus}</div>
                  <span className="pf-mission-tag">PKO</span>
                </div>
                <div className="pf-card-muted" style={{marginTop:10}}>
                  Comprendre la valeur des bounties et adapter son jeu en consequence.
                </div>
              </div>
              <div className="pf-mission-meta">
                <div><div className="pf-kv-label">Spots</div><div className="pf-kv-value">{missionSpots}</div></div>
                <div><div className="pf-kv-label">Duree</div><div className="pf-kv-value">25 min</div></div>
                <div><div className="pf-kv-label">Difficulte</div><div className="pf-kv-value">Intermediaire</div></div>
              </div>
              <button className="pf-premium-btn" onClick={onGoTrainer}>Commencer →</button>
              <button className="pf-dash-link" style={{alignSelf:"center",marginLeft:0}} onClick={onGoCoach||onGoTrainer}>Voir le plan complet →</button>
            </div>
          </section>

          <section className="pf-dash-card" style={{minHeight:230}}>
            <div className="pf-card-top">
              <div className="pf-card-title">Progression par domaine</div>
              <button className="pf-dash-link" onClick={onGoCoach||onGoTrainer}>Voir details →</button>
            </div>
            <div className="pf-radar-wrap">
              <svg className="pf-radar-svg" viewBox="0 0 200 200" aria-hidden="true">
                <defs>
                  <radialGradient id="pfRadarGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1F8BFF" stopOpacity=".36"/>
                    <stop offset="100%" stopColor="#1F8BFF" stopOpacity=".02"/>
                  </radialGradient>
                </defs>
                {radarGrid.map((p,i)=><polygon key={i} points={p} fill="none" stroke="rgba(74,144,255,.22)" strokeWidth="1"/>)}
                {domainStats.map((_,i)=>{
                  const a=-Math.PI/2+(i*2*Math.PI/domainStats.length);
                  return <line key={i} x1="100" y1="100" x2={100+Math.cos(a)*76} y2={100+Math.sin(a)*76} stroke="rgba(74,144,255,.18)" strokeWidth="1"/>;
                })}
                <polygon points={radarPoints} fill="url(#pfRadarGlow)" stroke="#1F8BFF" strokeWidth="2"/>
                {domainStats.map((d,i)=>{
                  const a=-Math.PI/2+(i*2*Math.PI/domainStats.length);
                  const r=76*Math.max(0,Math.min(100,d[1]))/100;
                  return <circle key={d[0]} cx={100+Math.cos(a)*r} cy={100+Math.sin(a)*r} r="3" fill={d[2]} stroke="#030712" strokeWidth="1"/>;
                })}
              </svg>
              <div className="pf-domain-list">
                {domainStats.map(([label,p,c])=>(
                  <div key={label} className="pf-domain-row">
                    <div className="pf-domain-label">{label}</div>
                    <div className="pf-domain-bar"><div className="pf-domain-fill" style={{width:p+"%",background:c,color:c}}/></div>
                    <div className="pf-domain-pct" style={{color:c}}>{p}%</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <PokerNewsSection
          articleCount={POKER_NEWS.length}
          ongoingCount={todayOngoing}
          todayNewsCount={todayNewsCount}
        />

        <section className="pf-dash-panel pf-dash-actions">
          <div className="pf-card-top" style={{marginBottom:10}}>
            <div className="pf-card-title">Actions rapides</div>
          </div>
          <div className="pf-action-grid">
            {quickActions.map(a=>(
              <button key={a.label} className={`pf-action-btn${a.primary?" primary":""}`} onClick={a.fn}>
                <span className="pf-action-ico"><NavIcon id={a.icon} size={19} color="currentColor"/></span>
                <span>
                  <span className="pf-action-label">{a.label}</span>
                  <span className="pf-action-sub">{a.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
      {dashToast&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",
        background:"rgba(20,30,20,.97)",border:`1px solid ${T.amber}55`,borderRadius:12,
        padding:"10px 22px",fontFamily:"'Space Grotesk',sans-serif",fontSize:11,color:T.gold,
        zIndex:9999,boxShadow:"0 4px 24px rgba(0,0,0,.7)",pointerEvents:"none",
        animation:"fadeInUp .25s ease"}}>
        {dashToast}
      </div>}
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <PokerBanner/>
      <div className="dash">

        {/* ── KPI RÉELS ── */}
        <div className="dash-title">
          Vue d'ensemble
          {!hasData&&<span style={{marginLeft:8,fontSize:8.5,color:T.text3,fontFamily:T.stats,fontWeight:400}}>Lance ta première session pour voir tes vraies stats !</span>}
        </div>
        <div className="dg4">
          {[
            ["Sessions",st.sessions||"—",hasData?`${st.totalSpots} spots joués`:"Aucune session encore","mc-gold","🎯"],
            ["Précision GTO",hasData?globalPct+"%":"—",hasData?(deltaPct>=0?"↑ +"+deltaPct+"% dernière session":"↓ "+Math.abs(deltaPct)+"% dernière session"):"Commence à jouer","mc-green","📊"],
            ["Mains analysées",st.totalAnalyses||"—",hasData?`${st.totalSpots} spots parcourus`:"Utilise le Replayer IA","mc-blue","🃏"],
            ["Niveau",hasData?`Lv ${st.level}`:"—",hasData?`${st.xp} XP · ${xpForNext-st.xp%xpForNext} XP prochain niveau`:"XP · En attente","mc-purple","⚡"],
          ].map(([l,v,d,cls,ico])=>(
            <div key={l} className={`mc ${cls}`}>
              <div className="mc-ico">{ico}</div>
              <div className="mc-l">{l}</div>
              <div className="mc-v" style={{color:cls==="mc-gold"?T.gold:cls==="mc-green"?T.green:cls==="mc-blue"?T.blue:T.purple}}>{v}</div>
              <div className="mc-d" style={{color:T.text2}}>{d}</div>
            </div>
          ))}
        </div>

        {/* ── STREAK (avec horloge temps réel) + PERF HEBDO + OBJECTIFS ── */}
        <div className="dg3">
          <div className="pcard">
            {/* Horloge */}
            <div style={{textAlign:"center",marginBottom:10}}>
              <div style={{fontFamily:T.mono,fontSize:28,color:T.gold,letterSpacing:"4px",textShadow:`0 0 20px ${T.goldGlow}`,lineHeight:1}}>
                {hh}:{mm}<span style={{color:T.amber,fontSize:18}}>:{ss2}</span>
              </div>
              <div style={{fontSize:9,color:T.text3,fontFamily:T.stats,marginTop:3,letterSpacing:".1em",textTransform:"capitalize"}}>{dateStr}</div>
            </div>
            <div className="pcard-h">Streak</div>
            <div className="streak-box">
              <div className="streak-fire">🔥</div>
              <div>
                <div className="streak-num">{st.streak||0}</div>
                <div className="streak-label">jours consécutifs<br/><span style={{color:T.gold}}>Record : {st.streakRecord||0} jours</span></div>
              </div>
            </div>
            <div className="streak-days" style={{marginTop:9}}>
              {weekDayNames.map((d,i)=>{
                const hasSess=weekData[i]>0;
                const isToday=i===todayIdx;
                return <div key={i} className={`streak-day${hasSess?" done":""}${isToday?" today":""}`} title={weekData[i]?weekData[i]+"%":""}>{d}</div>;
              })}
            </div>
            {/* Barre XP */}
            {hasData&&<div style={{marginTop:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.text3,marginBottom:3,fontFamily:T.stats}}>
                <span>Lv {st.level}</span><span style={{color:T.gold}}>{st.xp} XP</span><span>Lv {st.level+1}</span>
              </div>
              <div style={{height:5,background:T.surface3,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:xpProgress+"%",background:`linear-gradient(90deg,${T.purple},${T.gold})`,borderRadius:3,transition:"width .6s"}}/>
              </div>
            </div>}
          </div>

          <div className="pcard">
            <div className="pcard-h">Performance hebdo</div>
            <div className="wchart">
              {weekDayNames.map((d,i)=>{
                const v=weekData[i]||0;
                const isToday=i===todayIdx;
                return(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{fontSize:8,color:isToday?T.gold:T.text3,fontFamily:T.stats,fontWeight:700,marginBottom:2}}>{v>0?v+"%":""}</div>
                    <div className="wbar" style={{
                      height:Math.round(v/weekMax*52)+"px",minHeight:v>0?4:0,
                      background:isToday?`linear-gradient(180deg,${T.gold},${T.amber})`:`rgba(31,139,255,${0.15+v/weekMax*.5})`,
                      boxShadow:isToday?`0 0 10px ${T.goldGlow}`:"none"
                    }}/>
                    <div className="wday" style={{color:isToday?T.gold:T.text3}}>{d}</div>
                  </div>
                );
              })}
            </div>
            {lastSess&&<div style={{marginTop:8,fontSize:9,color:T.text3,fontFamily:T.mono}}>Dernière : <span style={{color:T.gold}}>{lastSess.pct}%</span> · <span style={{color:T.text2}}>Grade {lastSess.grade}</span></div>}
            {/* Améliorations récentes */}
            {st.improvements?.length>0&&<div style={{marginTop:8,borderTop:`1px solid ${T.border}`,paddingTop:7}}>
              <div style={{fontSize:8,color:T.text3,letterSpacing:".1em",fontFamily:T.stats,marginBottom:4}}>AMÉLIORATIONS</div>
              {st.improvements.slice(0,2).map((imp,i)=>(
                <div key={i} style={{fontSize:9,color:imp.delta>0?T.green:T.red,fontFamily:T.stats}}>
                  {imp.delta>0?"↑ +":"↓ "}{Math.abs(imp.delta)}% {imp.metric} · {imp.date}
                </div>
              ))}
            </div>}
          </div>

          <div className="pcard">
            <div className="pcard-h">Objectifs du jour</div>
            {goals.map((g,i)=>(
              <div key={i} className="goal-item">
                <div className={`goal-check ${g.done?"done":""}`}>{g.done?"✓":""}</div>
                <div className={`goal-label ${g.done?"done":""}`}>{g.label}</div>
                <div className="goal-xp">{g.xp}</div>
              </div>
            ))}
            {!hasData&&<div style={{marginTop:10}}>
              <button className="btn btng" style={{width:"100%",fontSize:11}} onClick={onGoTrainer}>🚀 Lancer ma première session</button>
            </div>}
          </div>
        </div>

        {/* ── PROGRESSION PAR DOMAINE (réelle) + LEAKS ── */}
        <div className="dg2">
          <div className="pcard">
            <div className="pcard-h">Progression par domaine</div>
            {domainRows.map(([l,p,c])=>(
              <div key={l} className="pw">
                <div className="pt">
                  <span>{l}</span>
                  <span style={{color:p>0?c:T.text3,fontFamily:T.stats,fontWeight:700}}>{p>0?p+"%":"–"}</span>
                </div>
                <div className="ptr"><div className="pb" style={{width:p+"%",background:p>0?c:T.border,boxShadow:p>0?`0 0 8px ${c}50`:"none",transition:"width .8s"}}/></div>
              </div>
            ))}
            {!hasData&&<div style={{fontSize:9.5,color:T.text3,textAlign:"center",padding:"8px 0",fontFamily:T.stats}}>Joue des sessions pour remplir cette jauge</div>}
          </div>

          <div className="pcard">
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
              <div className="pcard-h" style={{margin:0}}>Leaks détectés</div>
              {hasData&&<span style={{fontSize:8,color:T.text3,fontFamily:T.stats,marginLeft:"auto"}}>{st.totalSpots} spots analysés</span>}
            </div>
            {realLeaks.map((l,i)=>(
              <div key={i} className="leak-row">
                <div className="leak-icon">{l.ico}</div>
                <div className="leak-label">{l.label}{l.count>0&&<span style={{color:T.text3,fontSize:8,marginLeft:4}}>({l.count})</span>}</div>
                {l.pct>0&&<><div className="leak-bar-wrap"><div className="leak-bar" style={{width:l.pct+"%",background:l.color,transition:"width .8s"}}/></div>
                <div className="leak-pct" style={{color:l.color}}>{l.pct}%</div></>}
              </div>
            ))}
            <div style={{marginTop:12}}>
              <button className="btn btng" style={{width:"100%",fontSize:11}} onClick={onGoTrainer}>Travailler mes leaks →</button>
            </div>
          </div>
        </div>

        {/* ── STATS PAR POSITION ── */}
        {hasData&&Object.keys(st.posAcc).length>0&&(
          <div className="pcard" style={{marginBottom:9}}>
            <div className="pcard-h">Précision par position</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {Object.entries(st.posAcc).sort((a,b)=>b[1].total-a[1].total).map(([pos,v])=>{
                const pct=Math.round(v.ok/v.total*100);
                const c=pct>=70?T.green:pct>=50?T.amber:T.red;
                return(
                  <div key={pos} style={{padding:"7px 12px",background:T.surface2,border:`1px solid ${c}44`,borderRadius:8,textAlign:"center",minWidth:64}}>
                    <div style={{fontFamily:T.brand,fontSize:10,color:c,fontWeight:700}}>{pos}</div>
                    <div style={{fontFamily:T.stats,fontSize:16,color:c,fontWeight:700,margin:"2px 0"}}>{pct}%</div>
                    <div style={{fontSize:8,color:T.text3,fontFamily:T.stats}}>{v.total} spots</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── POKER EVENTS HUB (déroulable) ── */}
        <div className="pcard" style={{marginBottom:12,padding:0,overflow:"hidden"}}>
          <div onClick={()=>setEvOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:8,padding:"14px 16px",cursor:"pointer",userSelect:"none"}}>
            <div className="pcard-h" style={{margin:0}}>Événements Poker</div>
            <span style={{fontSize:9,color:T.green,background:"rgba(16,216,122,.1)",border:"1px solid rgba(16,216,122,.22)",borderRadius:20,padding:"2px 8px",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{POKER_EVENTS.length} événements</span>
            <span style={{marginLeft:"auto",fontSize:11,color:T.text3,transition:"transform .2s",display:"inline-block",transform:evOpen?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
          </div>
          {evOpen&&<div style={{padding:"0 16px 16px"}}><PokerEventsHub onGoTrainer={onGoTrainer} onPrepareEvent={onPrepareEvent}/></div>}
        </div>

        {/* ── ACTUALITÉS HUB (déroulable) ── */}
        <div className="pcard" style={{marginBottom:12,padding:0,overflow:"hidden"}}>
          <div onClick={()=>setNewsOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:8,padding:"14px 16px",cursor:"pointer",userSelect:"none",flexWrap:"wrap"}}>
            <div className="pcard-h" style={{margin:0}}>Actualités Poker</div>
            <span style={{fontSize:9,color:T.amber,background:"rgba(255,194,71,.1)",border:"1px solid rgba(255,194,71,.22)",borderRadius:20,padding:"2px 8px",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{POKER_NEWS.length} articles</span>
            {todayMajor>0&&<span style={{fontSize:9,color:"#FF4560",background:"rgba(255,69,96,.1)",border:"1px solid rgba(255,69,96,.22)",borderRadius:20,padding:"2px 8px",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>🔥 {todayMajor} majeur{todayMajor>1?"s":""}</span>}
            {todayVideos>0&&<span style={{fontSize:9,color:"#10D87A",background:"rgba(16,216,122,.08)",border:"1px solid rgba(16,216,122,.2)",borderRadius:20,padding:"2px 8px",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>▶ {todayVideos} vidéo{todayVideos>1?"s":""}</span>}
            {todayOngoing>0&&<span style={{fontSize:9,color:"#34D8FF",background:"rgba(52,216,255,.08)",border:"1px solid rgba(52,216,255,.2)",borderRadius:20,padding:"2px 8px",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>🟢 {todayOngoing} event{todayOngoing>1?"s":""} en cours</span>}
            {todayNewsCount===0&&<span style={{fontSize:9,color:T.text3,fontFamily:"'Inter',sans-serif"}}>Aucune news aujourd'hui</span>}
            <span style={{marginLeft:"auto",fontSize:11,color:T.text3,transition:"transform .2s",display:"inline-block",transform:newsOpen?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
          </div>
          {newsOpen&&<div style={{padding:"0 16px 16px"}}><PokerNewsHub onGoTrainer={onGoTrainer}/></div>}
        </div>

        {/* ── ACCÈS RAPIDE ── */}
        <div className="pcard" style={{marginBottom:9}}>
          <div className="pcard-h">Accès rapide</div>
          <div className="qa-grid">
            {[
              {ico:"🎯",l:"GTO Trainer",s:"Travailler les spots",fn:onGoTrainer},
              {ico:"📊",l:"Replayer IA",s:"Analyser mes mains",fn:onGoReplayer},
              {ico:"🏆",l:"ICM Trainer",s:"Tournois & bulle",fn:onGoTrainer},
              {ico:"🃏",l:"Mes mains",s:"Spots joués & EV",fn:()=>showDashToast("👆 Onglet 'Mains' dans le menu gauche")},
            ].map((q,i)=>(
              <div key={i} className="qa-btn" onClick={q.fn} style={{opacity:1,position:"relative",cursor:"pointer"}}>
                <div className="qa-ico">{q.ico}</div>
                <div className="qa-label">{q.l}</div>
                <div className="qa-sub">{q.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Toast "Bientôt disponible" */}
      {dashToast&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",
        background:"rgba(20,30,20,.97)",border:`1px solid ${T.amber}55`,borderRadius:12,
        padding:"10px 22px",fontFamily:"'Space Grotesk',sans-serif",fontSize:11,color:T.gold,
        zIndex:9999,boxShadow:"0 4px 24px rgba(0,0,0,.7)",pointerEvents:"none",
        animation:"fadeInUp .25s ease"}}>
        {dashToast}
      </div>}
    </div>
  );
}
