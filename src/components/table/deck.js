// PokerForge — decks de cartes & style des couleurs (extrait de App.jsx, Phase 3.2)

export const CARD_DECKS={
  modern:{
    id:"modern",name:"Moderne Mat",desc:"4 couleurs · Mat · Minimaliste",
    "♠":{color:"#2E6BFF",bg:"linear-gradient(160deg,#071530,#04101e)",glow:"rgba(46,107,255,.45)",border:"rgba(46,107,255,.35)"},
    "♥":{color:"#E74C3C",bg:"linear-gradient(160deg,#2a0808,#1a0404)",glow:"rgba(231,76,60,.45)",border:"rgba(231,76,60,.3)"},
    "♦":{color:"#F3BC12",bg:"linear-gradient(160deg,#2a1900,#1c1000)",glow:"rgba(243,188,18,.45)",border:"rgba(243,188,18,.3)"},
    "♣":{color:"#27AE60",bg:"linear-gradient(160deg,#002a12,#001a0c)",glow:"rgba(39,174,96,.45)",border:"rgba(39,174,96,.3)"},
  },
  luxury:{
    id:"luxury",name:"Luxe Métallique",desc:"4 couleurs · Haut de gamme · Premium",
    "♠":{color:"#4A90E2",bg:"linear-gradient(160deg,#0a1830,#06101e)",glow:"rgba(74,144,226,.45)",border:"rgba(74,144,226,.3)"},
    "♥":{color:"#E53935",bg:"linear-gradient(160deg,#2a0608,#1c0404)",glow:"rgba(229,57,53,.5)",border:"rgba(229,57,53,.35)"},
    "♦":{color:"#FBC02D",bg:"linear-gradient(160deg,#2a1800,#1a1000)",glow:"rgba(251,192,45,.5)",border:"rgba(251,192,45,.35)"},
    "♣":{color:"#43A047",bg:"linear-gradient(160deg,#002a14,#001810)",glow:"rgba(67,160,71,.45)",border:"rgba(67,160,71,.3)"},
  },
  neon:{
    id:"neon",name:"Néon Cyberpunk",desc:"4 couleurs · Glow intense · Cyberpunk",
    "♠":{color:"#00B0FF",bg:"linear-gradient(160deg,#001428,#000c18)",glow:"rgba(0,176,255,.7)",border:"rgba(0,176,255,.5)"},
    "♥":{color:"#FF4D4D",bg:"linear-gradient(160deg,#280000,#160000)",glow:"rgba(255,77,77,.7)",border:"rgba(255,77,77,.5)"},
    "♦":{color:"#B84DFF",bg:"linear-gradient(160deg,#18002a,#0c0016)",glow:"rgba(184,77,255,.7)",border:"rgba(184,77,255,.5)"},
    "♣":{color:"#00E676",bg:"linear-gradient(160deg,#002a14,#001810)",glow:"rgba(0,230,118,.7)",border:"rgba(0,230,118,.5)"},
  },
  classic:{
    id:"classic",name:"Classique Premium",desc:"4 couleurs · Professionnel · Sobre",
    "♠":{color:"#90AEFF",bg:"linear-gradient(160deg,#08122a,#04091a)",glow:"rgba(144,174,255,.35)",border:"rgba(144,174,255,.22)"},
    "♥":{color:"#D32F2F",bg:"linear-gradient(160deg,#260606,#160404)",glow:"rgba(211,47,47,.4)",border:"rgba(211,47,47,.25)"},
    "♦":{color:"#F57C00",bg:"linear-gradient(160deg,#261200,#180c00)",glow:"rgba(245,124,0,.4)",border:"rgba(245,124,0,.25)"},
    "♣":{color:"#388E3C",bg:"linear-gradient(160deg,#002214,#001610)",glow:"rgba(56,142,60,.4)",border:"rgba(56,142,60,.25)"},
  },
  standard:{
    id:"standard",name:"Standard Casino",desc:"2 couleurs · Traditionnel · Casino",
    "♠":{color:"#E8EDF8",bg:"linear-gradient(160deg,#0c1228,#080c1c)",glow:"rgba(232,237,248,.2)",border:"rgba(232,237,248,.15)"},
    "♥":{color:"#CC2222",bg:"linear-gradient(160deg,#280606,#180404)",glow:"rgba(204,34,34,.4)",border:"rgba(204,34,34,.25)"},
    "♦":{color:"#CC2222",bg:"linear-gradient(160deg,#280606,#180404)",glow:"rgba(204,34,34,.4)",border:"rgba(204,34,34,.25)"},
    "♣":{color:"#E8EDF8",bg:"linear-gradient(160deg,#0c1228,#080c1c)",glow:"rgba(232,237,248,.2)",border:"rgba(232,237,248,.15)"},
  },
};

/* Deck actif — etat module partage, modifie via setActiveDeckKey */
let activeDeckKey="modern";
export function getActiveDeckKey(){return activeDeckKey;}
export function setActiveDeckKey(id){activeDeckKey=id;}
export function getActiveDeck(){return CARD_DECKS[activeDeckKey]||CARD_DECKS.modern;}
export function getSuitStyle(s){ return getActiveDeck()[s]||{color:"#ccc",bg:"linear-gradient(145deg,#0d1525,#071B44)",glow:"transparent",border:"rgba(255,255,255,.1)"}; }
