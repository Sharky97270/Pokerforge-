// PokerForge — actualites poker statiques + filtres (extrait de App.jsx, Phase 3.3)

export const POKER_NEWS=[
  // ── MAJEUR / FEATURED ──────────────────────────────────────────────
  {id:"wsop-me-record",title:"WSOP 2026 : le Main Event s'annonce comme le plus grand de l'histoire avec 12 000+ joueurs attendus",source:"PokerNews",srcC:"#1F8BFF",date:"2026-06-12",cat:"Live",tags:["WSOP","MTT","Live"],score:"major",type:"article",readTime:3,featured:true,summary:["12 000+ joueurs inscrits attendus au Day 1","Structure revue — 300BB de départ effectifs","Prizempool estimé au-delà de $120 millions"],url:"https://fr.pokernews.com",circuit:"WSOP",train:{label:"Préparer ME WSOP",desc:"Deep stack MTT"}},
  {id:"wss-ete-2026",title:"Winamax Series Été 2026 : 200 events, 10M€ GTD — les satellites sont ouverts dès maintenant",source:"Winamax",srcC:"#FF6B00",date:"2026-06-11",cat:"Online",tags:["Winamax","MTT","Online","Series"],score:"major",type:"article",readTime:2,featured:false,summary:["200 événements programmés du 7 au 22 juin","10 millions d'euros garantis sur l'ensemble","Satellites dès 2€ disponibles sur Winamax"],url:"https://www.winamax.fr",circuit:"Winamax",train:{label:"S'entraîner WSS",desc:"MTT online multi-table"}},
  // ── IMPORTANT ──────────────────────────────────────────────────────
  {id:"gto-wizard-mtt-update",title:"GTO Wizard : mise à jour majeure des solveurs MTT avec profils de field par stakes",source:"GTO Wizard",srcC:"#9B5CFF",date:"2026-06-12",cat:"Logiciels",tags:["GTO","MTT","Logiciels","Solver"],score:"important",type:"article",readTime:4,featured:false,summary:["Nouveau module solver MTT avec 3 profiles stakes","Intégration PKO/Mystery Bounty améliorée","Import/export vers PioSolver 3.0"],url:"https://gtowizard.com",circuit:null,train:{label:"Appliquer au GTO Trainer",desc:"Spots MTT GTO"}},
  {id:"mystery-aggression",title:"Mystery KO 2026 : l'agressivité précoce est surexploitée — comment en profiter",source:"Kill Tilt",srcC:"#FF4560",date:"2026-06-11",cat:"PKO",tags:["PKO","Mystery","MTT","Exploit"],score:"important",type:"article",readTime:3,featured:false,summary:["Field surévalue les bounties en early game","Call-off spots en late = 30% EV+ vs GTO","Range de bluff sous-utilisée par les récréatifs"],url:"https://killtilt.fr",circuit:null,train:{label:"Travailler PKO/Mystery",desc:"Spots bounty 20-40bb"}},
  {id:"icm-errors-ft",title:"ICM en final table MTT : les 5 erreurs les plus coûteuses des joueurs low-mid stakes",source:"Club Poker",srcC:"#34D8FF",date:"2026-06-10",cat:"ICM",tags:["ICM","MTT","Stratégie"],score:"important",type:"article",readTime:5,featured:false,summary:["Overfold HU en situation ICM = fuite principale","Nash push/fold ignoré sous 20BB dans les mid stakes","3-bet bulle ICM : range trop tight de 40%"],url:"https://www.clubpoker.net",circuit:null,train:{label:"Travailler l'ICM",desc:"Spots ICM final table"}},
  {id:"turn-overfold-micros",title:"2 millions de mains analysées : les micro stakes overfoldent massivement le Turn",source:"Poker Red",srcC:"#E8A020",date:"2026-06-10",cat:"Cash Game",tags:["Cash Game","Turn","Exploit","Stratégie"],score:"important",type:"article",readTime:6,featured:false,summary:["Taux de fold Turn moyen 68% vs GTO 58%","Exploit optimal : double barrel polarisé systématique","BTN vs BB identifié comme le spot le plus récurrent"],url:"https://www.pokerred.com",circuit:null,train:{label:"Travailler Turn Barrel",desc:"C-bet turn exploit spots"}},
  {id:"wsope-marrakech",title:"WSOPE Marrakech 2026 : calendrier officiel des 18 events dévoilé — ME à €10,000",source:"PokerNews",srcC:"#1F8BFF",date:"2026-06-09",cat:"Live",tags:["WSOP","Live","MTT","WSOPE"],score:"important",type:"article",readTime:2,featured:false,summary:["18 events du 28 août au 12 septembre à Marrakech","Main Event buy-in 10 000€, 50M€ GTD","Satellites disponibles sur toutes plateformes"],url:"https://fr.pokernews.com",circuit:"WSOP",train:{label:"Préparer WSOPE",desc:"MTT profond ICM"}},
  {id:"ept-barcelona-2026",title:"EPT Barcelona 2026 : format revu — début 20 août, 5M€ GTD Main Event",source:"PokerStars",srcC:"#FF4560",date:"2026-06-09",cat:"Live",tags:["EPT","PokerStars","MTT","Live"],score:"important",type:"article",readTime:2,featured:false,summary:["Nouveau format 300BB de départ effectifs","High Rollers exclusifs $50K+","Side events PKO et Mystery intégrés"],url:"https://www.pokerstars.com",circuit:"EPT",train:{label:"Préparer EPT Barcelona",desc:"MTT classique ICM"}},
  {id:"triton-hands-video",title:"Triton London 2026 : les 5 mains les plus spectaculaires — analyse GTO complète",source:"Triton Poker",srcC:"#00D4FF",date:"2026-06-11",cat:"Live",tags:["Triton","High Roller","Vidéo","Analyse"],score:"important",type:"video",readTime:12,featured:false,summary:["5 mains commentées niveau High Roller","Analyse GTO des spots déviants","Bluffs river avec blockers — reasoning complet"],url:"https://www.triton-series.com",circuit:"Triton",train:{label:"Analyser spots Triton",desc:"High Roller spots"}},
  {id:"gtwiz-podcast-mtt",title:"Podcast GTO Wizard : Solver vs Exploit en MTT — avec Olivier Busquet (45 min)",source:"GTO Wizard",srcC:"#9B5CFF",date:"2026-06-09",cat:"Stratégie",tags:["GTO","MTT","Podcast","Exploit"],score:"important",type:"podcast",readTime:45,featured:false,summary:["Quand s'éloigner du GTO en tournoi","Lire les tendances field pour maxer l'EV","Construire une range exploitative durable"],url:"https://gtowizard.com",circuit:null,train:{label:"GTO Trainer — spots MTT",desc:"Exploitation MTT"}},
  {id:"scoop-2026-results",title:"SCOOP 2026 bilan final : $75M distribués, 300 events PokerStars",source:"PokerStars",srcC:"#FF4560",date:"2026-06-08",cat:"Online",tags:["PokerStars","MTT","Online","SCOOP"],score:"important",type:"article",readTime:3,featured:false,summary:["$75M de prizes total sur 300 tournois","High rollers dominés par 12 réguliers récurrents","Participation freerollers en hausse de 23%"],url:"https://www.pokerstars.fr",circuit:"PokerStars",train:{label:"Préparer events PokerStars",desc:"Online MTT PokerStars"}},
  {id:"ggseries-summer-2026",title:"GGSeries Summer 2026 : 50M$ GTD sur 180 events — structure, buy-ins et dates",source:"GGPoker",srcC:"#F59E0B",date:"2026-06-10",cat:"Online",tags:["GGPoker","MTT","Online","Series"],score:"important",type:"article",readTime:2,featured:false,summary:["180 events du 20 juin au 7 juillet","Turbo et deep simultanés chaque jour","Mystery Bounty exclusif GG avec pools partagés"],url:"https://www.gg.poker",circuit:"GGPoker",train:{label:"Préparer GGSeries",desc:"MTT GGPoker"}},
  {id:"wcoop-2026-preview",title:"WCOOP 2026 : calendrier officiel — 300 events, $100M GTD, tous les formats sur PokerStars",source:"PokerStars",srcC:"#FF4560",date:"2026-06-08",cat:"Online",tags:["WCOOP","PokerStars","MTT","Online"],score:"important",type:"article",readTime:2,featured:false,summary:["300 tournois du 6 au 28 septembre","100M$ de prize garanti total","MTT, PKO, Mystery, Satellite — tous formats"],url:"https://www.pokerstars.com",circuit:"PokerStars",train:{label:"Préparer le WCOOP",desc:"PokerStars MTT online"}},
  // ── STANDARD ────────────────────────────────────────────────────────
  {id:"hrc-v45-mystery",title:"HRC v4.5 : HoldemResources Calculator intègre les formats Mystery Bounty",source:"HRC",srcC:"#8B5CF6",date:"2026-06-07",cat:"Logiciels",tags:["ICM","PKO","Logiciels","Mystery"],score:"standard",type:"article",readTime:3,featured:false,summary:["Calculs ICM spécifiques Mystery Bounty","Interface Nash push/fold repensée","Export direct vers GTO Wizard intégré"],url:"https://www.holdemresources.net",circuit:null,train:{label:"Spots ICM Mystery",desc:"ICM Mystery bounty"}},
  {id:"piosolve3-multistreet",title:"PioSolver 3.0 : analyse multi-street avec ranges preflop intégrées en natif",source:"PioSolver",srcC:"#7C3AED",date:"2026-06-06",cat:"Logiciels",tags:["GTO","Logiciels","Solver"],score:"standard",type:"article",readTime:3,featured:false,summary:["Analyse 3 streets complètes en une session","Import ranges depuis GTO Wizard natif","Optimisé pour les configurations MTT"],url:"https://piosolver.com",circuit:null,train:{label:"Spots GTO river",desc:"River GTO spots"}},
  {id:"winamax-field-trend",title:"Analyse du field Winamax 2026 : les micro-stakes adoptent la défense BB massive",source:"Kill Tilt",srcC:"#FF4560",date:"2026-06-08",cat:"Stratégie",tags:["Winamax","Field","Cash Game","Tendance"],score:"standard",type:"article",readTime:5,featured:false,summary:["Défense BB en hausse significative dans les micros","Open-sizing réduit à 2.2x en BTN — nouvelle norme","Moins de cbet sur textures low, plus sur high card"],url:"https://killtilt.fr",circuit:"Winamax",train:{label:"Défense BB spots",desc:"BB défense exploit"}},
  {id:"ggpoker-3bet-trend",title:"GGPoker field 2026 : explosion du 3-bet SB et de la pression de bulle MTT",source:"Poker Red",srcC:"#E8A020",date:"2026-06-07",cat:"Stratégie",tags:["GGPoker","MTT","Field","Tendance"],score:"standard",type:"article",readTime:4,featured:false,summary:["3-bet SB en hausse de +6% par rapport à 2025","Pression bulle +11% en moyenne stack","Contre-exploiter : BTN call 3-bet élargi"],url:"https://www.pokerred.com",circuit:"GGPoker",train:{label:"Spots 3-bet SB",desc:"3-bet défense position"}},
  {id:"rfi-utg-ranges",title:"RFI UTG 9-max 2026 : les nouvelles ranges recommandées par les solveurs modernes",source:"GTO Wizard",srcC:"#9B5CFF",date:"2026-06-06",cat:"Stratégie",tags:["GTO","Preflop","Cash Game","Ranges"],score:"standard",type:"article",readTime:7,featured:false,summary:["UTG range réduite à 12.5% en 100BB selon GTO Wizard","ATo et KJo retirés de la range standard","Plus de limp UTG en deep stack — nouvelle tendance"],url:"https://gtowizard.com",circuit:null,train:{label:"Travailler ranges UTG",desc:"RFI UTG range review"}},
  {id:"cbet-flop-2026",title:"C-bet flop en 2026 : fréquences et sizings recommandés par texture de board",source:"Club Poker",srcC:"#34D8FF",date:"2026-06-05",cat:"Stratégie",tags:["GTO","Flop","Cash Game","C-bet"],score:"standard",type:"article",readTime:6,featured:false,summary:["Fréquence c-bet optimal : 55-65% sur textures low","Small bet 25-33% sur boards low disconnected","Pot bet sur textures high card ou paired"],url:"https://www.clubpoker.net",circuit:null,train:{label:"Spots c-bet flop",desc:"C-bet flop sizing"}},
  {id:"river-bluff-ratio",title:"River value/bluff ratio 2026 : combien bluffer pour être indifférent selon le sizing",source:"Kill Tilt",srcC:"#FF4560",date:"2026-06-04",cat:"Stratégie",tags:["GTO","River","Stratégie","Bluff"],score:"standard",type:"article",readTime:8,featured:false,summary:["Ratio optimal 2:1 value/bluff avec pot bet","Ajustement exploitatif selon profil du field","AK/AQ comme blockers dominants sur boards A-high"],url:"https://killtilt.fr",circuit:null,train:{label:"Spots river bluff",desc:"River polarized spots"}},
  {id:"squeeze-bb-range",title:"Squeeze 3-bet en BB : range optimale contre open + 2 callers en 100BB cash game",source:"Poker Red",srcC:"#E8A020",date:"2026-06-03",cat:"Stratégie",tags:["Preflop","3-bet","Cash Game","Squeeze"],score:"standard",type:"article",readTime:5,featured:false,summary:["Range squeeze BB : 8-10% en 100BB optimale","Sizing recommandé : 4x + callers (12-16BB)","AXs, pocket pairs 55+, broadway suited ciblés"],url:"https://www.pokerred.com",circuit:null,train:{label:"Spots Squeeze BB",desc:"Squeeze 3-bet range"}},
  {id:"pmu-toulouse-july",title:"PMU Poker Tour Toulouse juillet 2026 : 150K€ GTD, inscriptions ouvertes",source:"PMU Poker",srcC:"#22C55E",date:"2026-06-12",cat:"Live",tags:["PMU","MTT","Live","France"],score:"standard",type:"article",readTime:1,featured:false,summary:["150K€ garantis sur 5 events","Buy-in ME à 550€ direct ou satellite dès 30€","Dates 3 au 6 juillet au Casino de Toulouse"],url:"https://www.pmu.fr/poker",circuit:"PMU",train:{label:"Préparer PMU Toulouse",desc:"MTT live ouvert"}},
  {id:"unibet-prague-satellites",title:"Unibet Open Prague : dernières semaines de satellites — package tout inclus disponible",source:"Unibet Poker",srcC:"#00B140",date:"2026-06-10",cat:"Live",tags:["Unibet","MTT","Live","Prague"],score:"standard",type:"article",readTime:1,featured:false,summary:["1M€ GTD en septembre à Prague","Satellites hebdomadaires depuis 11€","Package vol + hôtel + buy-in disponible"],url:"https://www.unibetpoker.com",circuit:"Unibet",train:{label:"Préparer Unibet Prague",desc:"MTT moyen stack"}},
  {id:"fps-paris-automne",title:"FPS Paris Automne 2026 : ME à 500K€ GTD du 1 au 5 octobre — inscriptions ouvertes",source:"PokerNews",srcC:"#1F8BFF",date:"2026-06-05",cat:"Live",tags:["FPS","MTT","Live","France"],score:"standard",type:"article",readTime:1,featured:false,summary:["500K€ GTD en Main Event buy-in 1100€","Série complète de 8 events","Satellites accessibles dès 55€"],url:"https://fr.pokernews.com",circuit:"FPS",train:{label:"Préparer FPS Paris",desc:"MTT français local"}},
  {id:"wpt-montreal-preview",title:"WPT Playground Montreal juillet 2026 : preview field et stratégie pour les joueurs européens",source:"WPT",srcC:"#E8A020",date:"2026-06-07",cat:"Live",tags:["WPT","MTT","Live"],score:"standard",type:"article",readTime:2,featured:false,summary:["Field majoritairement récréatif (70%+)","Structure 40 niveaux — PKO comme event flagship","2M$ GTD en Main Event buy-in $550"],url:"https://www.wpt.com",circuit:"WPT",train:{label:"Préparer WPT Montreal",desc:"MTT standard live"}},
  {id:"bounty-builder-strategy",title:"Bounty Builder Series 2026 : guide stratégique complet PKO pour maximiser l'EV bounty",source:"PokerStars",srcC:"#FF4560",date:"2026-06-08",cat:"PKO",tags:["PKO","PokerStars","MTT","Stratégie"],score:"standard",type:"article",readTime:4,featured:false,summary:["Calcul EV bounty en early game","Stack-off spots avec bounty equity intégrée","Late game : ajustement ICM + bounty combiné"],url:"https://www.pokerstars.com",circuit:"PokerStars",train:{label:"Spots PKO early/late",desc:"Bounty ICM stack-off"}},
];
export const POKER_NEWS_FILTERS=["Tous","Winamax","PokerStars","WSOP","Stratégie","Live","Online","MTT","Mental Game"];
const POKER_NEWS_FUTURE_SOURCES=[
  "Winamax","PokerStars Blog","PokerNews","Club Poker","PMU Poker","WPT","WSOP","GG Poker","Unibet Poker","PokerForge",
];
export const pokerNewsData=[
  {
    id:"pf-news-winamax-million-final",
    source:"Winamax",
    category:"WINAMAX",
    mark:"W",
    color:"#FF2F3F",
    title:"Million Event : 5 Français en finale !",
    description:"Retour sur la performance tricolore qui marque les esprits sur le Million Event.",
    dateLabel:"il y a 3h",
    date:"2026-06-20T20:00:00+02:00",
    url:"https://www.winamax.fr",
    tags:["Winamax","Online","MTT"],
    summary:"Cinq joueurs français ont atteint la finale du Million Event. Le field a été marqué par une pression ICM intense, des spots de reshove décisifs et plusieurs décisions river à très haute EV.",
  },
  {
    id:"pf-news-wsop-programme-2025",
    source:"WSOP",
    category:"WSOP",
    mark:"WSOP",
    color:"#00D4FF",
    title:"WSOP 2025 : Le programme dévoilé",
    description:"Découvrez le calendrier complet des WSOP 2025 à Las Vegas.",
    dateLabel:"il y a 7h",
    date:"2026-06-20T16:00:00+02:00",
    url:"https://www.wsop.com",
    tags:["WSOP","Live","MTT"],
    summary:"Le calendrier WSOP 2025 confirme une série dense à Las Vegas, avec davantage de formats bounty, des structures deep stack et plusieurs rendez-vous majeurs pour les grinders MTT live.",
  },
  {
    id:"pf-news-strategie-bulle-mtt",
    source:"Stratégie",
    category:"STRATÉGIE",
    mark:"S",
    color:"#8B5CF6",
    title:"Adapter son jeu en bulle de MTT",
    description:"Nos conseils pour exploiter la pression et maximiser son edge.",
    dateLabel:"il y a 1j",
    date:"2026-06-19T11:00:00+02:00",
    url:"#",
    tags:["Stratégie","MTT","Mental Game"],
    summary:"La bulle récompense les joueurs capables d’identifier les stacks captifs. La pression doit être appliquée sur les profils qui surprotègent leur survie, tout en évitant les confrontations inutiles contre les stacks dominants.",
  },
  {
    id:"pf-news-pokernews-heads-up-seats",
    source:"PokerNews",
    category:"POKERNEWS",
    mark:"PN",
    color:"#1F8BFF",
    title:"Les meilleurs seats heads-up du mois",
    description:"Analyse des spots clés joués par les pros en heads-up.",
    dateLabel:"il y a 1j",
    date:"2026-06-19T09:00:00+02:00",
    url:"https://fr.pokernews.com",
    tags:["PokerNews","Stratégie","Live"],
    summary:"Les meilleurs spots heads-up du mois montrent une tendance nette : les pros augmentent la pression sur les boards pairés et défendent davantage leurs check ranges hors position.",
  },
  {
    id:"pf-news-road-to-pspc",
    source:"Événement",
    category:"ÉVÉNEMENT",
    mark:"A",
    color:"#FF4560",
    title:"Road to PSPC : les satellites ont commencé",
    description:"Qualifiez-vous pour le PokerStars Players Championship 2025.",
    dateLabel:"il y a 2j",
    date:"2026-06-18T10:00:00+02:00",
    url:"https://www.pokerstars.com",
    tags:["PokerStars","Live","MTT"],
    summary:"Les satellites Road to PSPC sont ouverts. Les packages combinent buy-in, voyage et hébergement, avec des structures adaptées aux joueurs capables de maîtriser les paliers ICM en phase finale.",
  },
];
export function fetchPokerNews({source="Tous",tag="Tous",limit=12}={}){
  const src=source==="PokerStars"?"PokerStars":source;
  return pokerNewsData
    .filter(n=>src==="Tous"||n.source===src||n.tags.includes(src))
    .filter(n=>tag==="Tous"||n.category===tag.toUpperCase()||n.tags.includes(tag))
    .slice(0,limit);
}
export function refreshNews(){return fetchPokerNews();}
export function updateNewsStatus({total=POKER_NEWS.length,ongoing=0,today=0}={}){
  return {
    total,
    ongoing:Math.min(ongoing,2),
    todayLabel:today>0?`${today} news aujourd’hui`:"Aucune news aujourd’hui",
    updatedAt:new Date().toISOString(),
  };
}
