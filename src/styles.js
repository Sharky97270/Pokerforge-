export const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800;900&family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

*{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{height:100%;}
body{background:#030712;color:#FFFFFF;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:#1A3A80;border-radius:2px;}
::-webkit-scrollbar-thumb:hover{background:#2E6CFF;}
button,select,input,textarea{font-family:'Inter',sans-serif;}
.app{display:flex;flex-direction:column;height:100vh;overflow:hidden;}

/* ─── HEADER ───────────────────────────────────────── */
.hdr{
  height:54px;
  background:linear-gradient(90deg,#030712 0%,#071B44 50%,#030712 100%);
  border-bottom:1px solid #1A3A80;
  display:flex;align-items:center;padding:0 20px;gap:14px;flex-shrink:0;
  box-shadow:0 1px 30px rgba(155,92,255,.08),0 0 0 1px rgba(255,194,71,.04);
  position:relative;
}
.hdr::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,194,71,.25),rgba(155,92,255,.2),transparent);
}
/* ── Logo wrapper ── */
.logo-wrapper{
  filter:drop-shadow(0 0 8px rgba(0,168,255,.35));
  transition:filter .2s ease,transform .2s ease;
  cursor:pointer;
}
.logo-wrapper:hover{
  filter:drop-shadow(0 0 14px rgba(0,168,255,.6));
  transform:translateY(-1px);
}
/* Version complète : visible sur desktop, cachée sur mobile */
.logo-full-wrap{display:flex;align-items:center;}
.logo-compact-wrap{display:none;align-items:center;}
/* ── Legacy brand (masqué avec nouveau logo) ── */
.brand{display:none;}
.brand-sub{display:none;}
.hdr-sep{width:1px;height:24px;background:linear-gradient(180deg,transparent,#1A3A80,transparent);}
/* Nav : flex:1 pour prendre tout l'espace dispo, scroll si débordement */
.nav{
  display:flex;gap:0;
  flex:1;min-width:0;
  overflow-x:auto;-webkit-overflow-scrolling:touch;
  scrollbar-width:none;mask-image:none;
}
.nav::-webkit-scrollbar{display:none;}
/* Masque gradient droit pour indiquer le scroll */
.nav{-webkit-mask-image:linear-gradient(to right,#000 80%,transparent 100%);}
.spacer{flex:0;}/* spacer désactivé — nav prend tout l'espace */
.ntab{
  padding:6px 14px;font-size:11px;cursor:pointer;color:#9FB0CC;
  transition:all .15s;border-bottom:2px solid transparent;font-weight:500;
  letter-spacing:.02em;position:relative;white-space:nowrap;flex-shrink:0;
}
.ntab:hover{color:#FFFFFF;}
.ntab.on{color:#FFC247;border-bottom-color:#FFC247;text-shadow:0 0 12px rgba(255,194,71,.4);}
.spacer{flex:1;}
.utog{
  padding:4px 10px;border-radius:4px;font-size:9.5px;font-weight:700;cursor:pointer;
  border:1px solid #1A3A80;color:#6F81A8;background:transparent;transition:all .12s;
  font-family:'Space Grotesk',sans-serif;letter-spacing:.05em;
}
.utog.on{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.4);box-shadow:0 0 10px rgba(255,194,71,.15);}
.hdrbadge{
  font-size:9px;padding:4px 10px;border-radius:20px;font-weight:700;border:1px solid;
  font-family:'Inter',sans-serif;letter-spacing:.08em;
}

/* ─── COMPTE / AUTHENTIFICATION ─────────────────────── */
.pf-acct-btn{
  position:relative;width:34px;height:34px;border-radius:50%;cursor:pointer;flex-shrink:0;
  background:linear-gradient(135deg,#0B2F77,#1F8BFF);border:2px solid rgba(31,139,255,.45);
  display:flex;align-items:center;justify-content:center;color:#fff;
  box-shadow:0 0 12px rgba(31,139,255,.2);transition:all .18s;
}
.pf-acct-btn:hover{
  border-color:#34D8FF;
  box-shadow:0 0 0 3px rgba(52,216,255,.18),0 0 22px rgba(52,216,255,.55),0 0 40px rgba(31,139,255,.3);
  transform:translateY(-1px);
}
.pf-acct-initial{font-family:'Space Grotesk','Inter',sans-serif;font-size:14px;font-weight:800;}
.pf-acct-dot{position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;
  background:#10D87A;border:2px solid #030712;box-shadow:0 0 8px rgba(16,216,122,.7);}

.pf-auth-overlay{
  position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(2,7,18,.72);backdrop-filter:blur(7px);animation:pfAuthFade .2s ease;
}
@keyframes pfAuthFade{from{opacity:0}to{opacity:1}}
@keyframes pfAuthPop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
.pf-auth-modal{
  position:relative;width:100%;max-width:380px;max-height:92vh;overflow-y:auto;padding:26px 26px 24px;border-radius:18px;
  background:linear-gradient(165deg,rgba(11,28,64,.92) 0%,rgba(5,14,40,.95) 60%,rgba(3,9,24,.97) 100%);
  border:1px solid rgba(52,216,255,.35);
  box-shadow:0 0 0 1px rgba(31,139,255,.12),0 0 40px rgba(31,139,255,.18),0 24px 70px rgba(0,0,0,.7);
  backdrop-filter:blur(14px);animation:pfAuthPop .26s cubic-bezier(.22,.68,.36,1);
}
.pf-auth-close{position:absolute;top:13px;right:14px;width:26px;height:26px;border-radius:7px;cursor:pointer;
  background:rgba(255,255,255,.05);border:1px solid #1A3A80;color:#9FB0CC;font-size:12px;transition:all .14s;}
.pf-auth-close:hover{background:rgba(255,69,96,.12);border-color:rgba(255,69,96,.4);color:#FF4560;}
.pf-auth-logo{font-family:'Orbitron','Space Grotesk',sans-serif;font-size:21px;font-weight:900;letter-spacing:.04em;
  color:#fff;text-align:center;text-shadow:0 0 18px rgba(31,139,255,.5);}
.pf-auth-logo span{color:#34D8FF;}
.pf-auth-sub{text-align:center;font-size:10.5px;color:#7E94B8;font-family:'Rajdhani','Inter',sans-serif;margin:4px 0 16px;letter-spacing:.03em;}
.pf-auth-tabs{display:flex;gap:4px;background:rgba(3,13,42,.7);border:1px solid #152D6E;border-radius:11px;padding:4px;margin-bottom:15px;}
.pf-auth-tab{flex:1;padding:8px 6px;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;
  font-family:'Rajdhani','Inter',sans-serif;letter-spacing:.03em;background:transparent;color:#7E94B8;transition:all .15s;}
.pf-auth-tab.on{background:linear-gradient(135deg,#1F8BFF,#7C3AFF);color:#fff;box-shadow:0 4px 16px rgba(31,139,255,.35);}
.pf-auth-primary{width:100%;padding:11px;border:none;border-radius:10px;cursor:pointer;margin-top:4px;
  font-size:12.5px;font-weight:800;font-family:'Rajdhani','Inter',sans-serif;letter-spacing:.04em;color:#fff;
  background:linear-gradient(135deg,#1F8BFF 0%,#7C3AFF 100%);box-shadow:0 6px 20px rgba(31,139,255,.32);transition:all .16s;}
.pf-auth-primary:hover:not(:disabled){box-shadow:0 8px 28px rgba(52,216,255,.42);transform:translateY(-1px);}
.pf-auth-primary:disabled{opacity:.6;cursor:default;}
.pf-auth-link{color:#34D8FF;cursor:pointer;font-weight:700;}
.pf-auth-link:hover{text-decoration:underline;}
.pf-auth-err{background:rgba(255,69,96,.1);border:1px solid rgba(255,69,96,.32);color:#FF8090;border-radius:8px;
  padding:8px 11px;font-size:10px;font-family:'Rajdhani','Inter',sans-serif;margin-bottom:12px;}
.pf-auth-info{background:rgba(16,216,122,.1);border:1px solid rgba(16,216,122,.32);color:#5EE6A8;border-radius:8px;
  padding:8px 11px;font-size:10px;font-family:'Rajdhani','Inter',sans-serif;margin-bottom:12px;}
.pf-auth-divider{display:flex;align-items:center;gap:10px;margin:15px 0 13px;color:#5A6E92;font-size:9px;font-family:'Rajdhani',sans-serif;}
.pf-auth-divider::before,.pf-auth-divider::after{content:"";flex:1;height:1px;background:#152D6E;}
.pf-oauth-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:10px;border-radius:10px;cursor:pointer;
  background:rgba(255,255,255,.05);border:1px solid #1A3A80;color:#E0EAFF;font-size:11.5px;font-weight:700;
  font-family:'Rajdhani','Inter',sans-serif;transition:all .15s;}
.pf-oauth-btn:hover:not(:disabled){background:rgba(255,255,255,.09);border-color:rgba(52,216,255,.4);}
.pf-oauth-btn:disabled{opacity:.55;cursor:default;}

.pf-usermenu{position:absolute;top:54px;right:14px;z-index:9999;width:236px;border-radius:14px;overflow:hidden;
  background:linear-gradient(165deg,rgba(11,28,64,.97),rgba(5,14,40,.98));border:1px solid rgba(52,216,255,.3);
  box-shadow:0 18px 50px rgba(0,0,0,.65),0 0 26px rgba(31,139,255,.16);backdrop-filter:blur(12px);animation:pfAuthPop .2s ease;}
.pf-usermenu-head{display:flex;align-items:center;gap:11px;padding:14px;border-bottom:1px solid #152D6E;background:rgba(31,139,255,.05);}
.pf-usermenu-avatar{width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:800;color:#fff;
  background:linear-gradient(135deg,#1F8BFF,#7C3AFF);box-shadow:0 0 16px rgba(31,139,255,.4);}
.pf-usermenu-name{font-size:13px;font-weight:800;color:#fff;font-family:'Space Grotesk','Inter',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pf-usermenu-meta{font-size:9.5px;color:#7E94B8;font-family:'Rajdhani','Inter',sans-serif;margin-top:1px;}
.pf-usermenu-list{padding:6px;}
.pf-usermenu-item{padding:9px 11px;border-radius:8px;cursor:pointer;font-size:11px;color:#C6D4EC;
  font-family:'Rajdhani','Inter',sans-serif;font-weight:600;transition:all .12s;}
.pf-usermenu-item:hover{background:rgba(52,216,255,.1);color:#fff;}
.pf-usermenu-logout{color:#FF8090;margin-top:3px;border-top:1px solid #152D6E;border-radius:0 0 6px 6px;}
.pf-usermenu-logout:hover{background:rgba(255,69,96,.12);color:#FF4560;}
.pf-auth-toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:10001;
  padding:11px 22px;border-radius:11px;font-size:12.5px;font-weight:700;font-family:'Rajdhani','Inter',sans-serif;
  color:#fff;background:linear-gradient(135deg,rgba(31,139,255,.96),rgba(124,58,255,.96));
  box-shadow:0 8px 30px rgba(0,0,0,.5),0 0 22px rgba(52,216,255,.3);animation:fadeInUp .3s ease;}
@media (max-width:600px){
  .pf-auth-modal{max-width:100%;max-height:100vh;height:100vh;border-radius:0;padding:30px 20px;}
  .pf-auth-overlay{padding:0;}
  .pf-usermenu{right:8px;left:8px;width:auto;}
}
@media (max-width:880px){
  .rep-solver-grid{grid-template-columns:1fr!important;}
  .rep-solver-reco{grid-template-columns:1fr!important;}
}

/* ─── LAYOUT ────────────────────────────────────────── */
.body{flex:1;display:flex;overflow:hidden;}
.sidebar{
  width:228px;
  background:linear-gradient(180deg,#071B44 0%,#030712 100%);
  border-right:1px solid #152D6E;
  display:flex;flex-direction:column;overflow-y:auto;flex-shrink:0;
}
.main{flex:1;overflow-y:auto;}

/* ─── SIDEBAR ───────────────────────────────────────── */
.sb{padding:14px 12px 8px;}
.sblbl{
  font-size:9px;color:#6F81A8;letter-spacing:.25em;text-transform:uppercase;
  font-weight:700;margin-bottom:9px;display:flex;align-items:center;gap:6px;
  font-family:'Inter',sans-serif;
}
.sblbl::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#1A3A80,transparent);}
.sbsep{height:1px;background:linear-gradient(90deg,transparent,#152D6E,transparent);margin:2px 0;}
.pfsel{
  background:#071B44;border:1px solid #1A3A80;color:#FFFFFF;
  border-radius:6px;padding:7px 10px;font-size:10.5px;outline:none;
  cursor:pointer;width:100%;margin-bottom:8px;transition:border-color .12s;
}
.pfsel:focus{border-color:#FFC247;box-shadow:0 0 0 2px rgba(255,194,71,.1);}
.pffl{font-size:8px;color:#6F81A8;letter-spacing:.15em;text-transform:uppercase;margin-bottom:4px;font-weight:600;}
.pffg{margin-bottom:10px;}
.pftr{display:flex;gap:4px;flex-wrap:wrap;}
.pftog{
  padding:3px 8px;border-radius:20px;font-size:9.5px;cursor:pointer;
  border:1px solid #1A3A80;color:#9FB0CC;background:#071B44;transition:all .12s;white-space:nowrap;
}
.pftog:hover{border-color:#2E6CFF;color:#FFFFFF;}
.pftog.on{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.35);}

/* Session pills */
.smpill{
  padding:8px 11px;border-radius:8px;border:1px solid #152D6E;cursor:pointer;
  transition:all .13s;display:flex;align-items:center;justify-content:space-between;
  margin-bottom:5px;background:#071B44;
}
.smpill:hover{border-color:#1A3A80;background:#071B44;}
.smpill.on{background:rgba(255,194,71,.06);border-color:rgba(255,194,71,.3);box-shadow:0 0 12px rgba(255,194,71,.08);}
.smn{font-size:11px;font-weight:600;font-family:'Inter',sans-serif;letter-spacing:.03em;}
.smsub{font-size:8px;color:#6F81A8;margin-top:1px;}
.smnum{font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;}

/* Table count buttons */
.mtrow{display:flex;gap:4px;margin-bottom:10px;}
.mtbtn{
  flex:1;padding:6px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;
  border:1px solid #152D6E;color:#6F81A8;background:#071B44;transition:all .12s;
  text-align:center;font-family:'Space Grotesk',sans-serif;letter-spacing:.05em;
}
.mtbtn:hover{border-color:#1A3A80;color:#FFFFFF;}
.mtbtn.on{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.35);box-shadow:0 0 8px rgba(255,194,71,.1);}

/* Progress */
.progrow{display:flex;justify-content:space-between;font-size:9px;color:#6F81A8;margin-bottom:4px;font-family:'Inter',sans-serif;}
.progt{height:4px;background:#152D6E;border-radius:3px;margin-bottom:10px;overflow:hidden;}
.progf{height:100%;border-radius:3px;background:linear-gradient(90deg,#FFC247,#FFC247);transition:width .4s;box-shadow:0 0 8px rgba(255,194,71,.4);}

/* Stat boxes */
.statg{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.statbox{
  background:#071B44;border:1px solid #152D6E;border-radius:6px;
  padding:8px;text-align:center;transition:border-color .12s;
}
.statbox:hover{border-color:#1A3A80;}
.statv{font-family:'Inter',sans-serif;font-size:15px;font-weight:700;}
.statl{font-size:8px;color:#6F81A8;margin-top:2px;letter-spacing:.05em;}

/* ─── TABLE GRIDS ───────────────────────────────────── */
/* minmax(0,1fr) au lieu de 1fr : force des colonnes STRICTEMENT égales
   (50/50, 33/33/33...), indépendamment du contenu de chaque table. */
.grid1{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:14px;}
/* Mosaïque multi-table (maquette V1) : remplit tout le playground, lignes étirées,
   séparation nette entre tables, aucune table fantôme. */
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:8px;padding:8px;align-items:stretch;justify-items:stretch;height:100%;min-height:0;}
/* MOSAÏQUE 3T (standard unique, §1/§4/§20) : TABLE 1 haut-gauche, TABLE 2
   haut-droite, TABLE 3 bas-centrée à la MÊME largeur que les deux du haut.
   T3 s'étend sur les 2 colonnes mais sa largeur est bornée à UNE colonne
   (width = (spanned - gap)/2) puis centrée (justify-self) → jamais étirée. */
.grid3{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:20px 24px;padding:10px 16px;align-items:stretch;justify-items:stretch;height:100%;min-height:0;}
.grid3>.mt-slot:nth-child(1){grid-column:1;grid-row:1;}
.grid3>.mt-slot:nth-child(2){grid-column:2;grid-row:1;}
.grid3>.mt-slot:nth-child(3){grid-column:1 / span 2;grid-row:2;justify-self:center;width:calc((100% - 24px)/2);}
.grid3>.mt-slot:nth-child(3) .tw{max-width:none;margin:0;width:100%;}
/* Viewports en hauteur NATURELLE (contenu = titre + streets + table ratio-exacte
   + actions) : l'ovale garde ses proportions script à toute résolution — plus de
   caps de hauteur à recalibrer. Largeurs maxi ≈ viewports maquette (réf. 1536). */
.grid2,.grid3,.grid4{justify-items:stretch;}
.grid2>.mt-slot{height:100%;max-height:100%;max-width:none;width:100%;}
.grid3>.mt-slot{height:100%;max-height:100%;max-width:none;width:100%;}
.grid3>.mt-slot:nth-child(3){max-width:none;}
.grid4>.mt-slot{height:100%;max-height:100%;max-width:none;width:100%;}
/* MOSAÏQUE : TABLE 3 a désormais la MÊME cellule (1 colonne × 1 rangée) que
   T1/T2 → même ratio, plus d'override d'aplatissement (l'ancienne 500×164 servait
   la disposition 3-en-ligne, supprimée). */
/* Table basse très plate : clusters de sièges réduits (script §4 : éléments plus
   petits en bas) — sinon nameplates des sièges hauts et cartes des sièges bas se
   rejoignent au centre. Compensation héros : .82×.85 ≈ .7 (identique aux tables hautes). */
.grid3>.mt-slot:nth-child(3) .pf-mt-seat{zoom:1;}
.grid3>.mt-slot:nth-child(3) .pf-mt-seat .hero-card-wrap{zoom:1;}
/* Pot réduit sur la table basse : à (50,29) il effleurait le board sur l'ovale plat */
.grid3>.mt-slot:nth-child(3) .pf-pot-readout{zoom:1;}
.grid4{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px;padding:8px;align-items:stretch;justify-items:stretch;height:100%;min-height:0;}
@media(max-width:1280px){
  /* Étroit (§5) : on empile les 3 tables en colonne, gap 24px, pleine largeur. */
  .grid3{grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(3,minmax(0,1fr));gap:24px;}
  .grid3>.mt-slot:nth-child(1){grid-column:1;grid-row:1;}
  .grid3>.mt-slot:nth-child(2){grid-column:1;grid-row:2;}
  .grid3>.mt-slot:nth-child(3){grid-column:1;grid-row:3;justify-self:stretch;width:100%;}
}
.grid6{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:5px;align-items:start;}
.grid8{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:4px;align-items:start;}
.mt-slot{position:relative;min-width:0;}
/* Chaque table remplit sa cellule de mosaïque */
.grid2>.mt-slot,.grid3>.mt-slot,.grid4>.mt-slot{min-height:0;display:flex;flex-direction:column;}
.grid2>.mt-slot>.tw,.grid3>.mt-slot>.tw,.grid4>.mt-slot>.tw{flex:1;min-height:0;display:flex;flex-direction:column;}
/* Viewport de table : bordure/halo maquette (tokens §13), séparation nette */
.grid2>.mt-slot,.grid3>.mt-slot,.grid4>.mt-slot{
  border:1px solid var(--pf-mt-border,#12304C);border-radius:6px;
  background:linear-gradient(180deg,var(--pf-mt-bg-panel,#061426) 0%,var(--pf-mt-bg-app,#020914) 100%);
  box-sizing:border-box;overflow:hidden;transition:border-color .18s,box-shadow .18s;
}
.grid2>.mt-slot.mt-slot-focus,.grid3>.mt-slot.mt-slot-focus,.grid4>.mt-slot.mt-slot-focus{
  border-color:var(--pf-mt-border-active,#1769FF);box-shadow:0 0 14px var(--pf-mt-glow-blue,rgba(0,120,255,.22));
}
.grid2>.mt-slot.table-slot-answered,.grid3>.mt-slot.table-slot-answered,.grid4>.mt-slot.table-slot-answered{
  border-color:rgba(0,232,137,.45);
}
/* Titre TABLE n (maquette) */
.mt-table-title{
  display:flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0;
  height:22px;margin:5px auto 1px;padding:0 12px;border-radius:6px;
  font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:800;letter-spacing:.12em;
  color:#A9B7C9;background:rgba(8,26,45,.75);border:1px solid #12304C;
}
.mt-table-title.active{color:#DCEBFF;border-color:#1769FF;background:rgba(23,105,255,.14);}
.mt-table-title.answered{color:#00E889;border-color:rgba(0,232,137,.4);}
.mt-table-title i{font-style:normal;color:#00E889;font-size:10px;}
.mt-table-title em{font-style:normal;color:#00D9FF;font-size:8px;line-height:1;}
/* Multi-table : la zone d'action ne doit pas dupliquer l'aperçu des cartes Hero
   (déjà sur la table) — on le masque pour compacter et éviter le rognage. */
.grid2 .tw>.mt-zone-fit~div>div:has(.hero-card-wrap),
.grid3 .tw>.mt-zone-fit~div>div:has(.hero-card-wrap),
.grid4 .tw>.mt-zone-fit~div>div:has(.hero-card-wrap){display:none!important;}
/* Skin V2 — boutons d'action de la mosaïque (planche §06) : corps navy sombre,
   bordure + libellé colorés par type, hover lumineux. */
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn{
  --c:var(--pf-gray);
  border-radius:var(--pf-radius-sm)!important;
  border:1px solid color-mix(in srgb,var(--c) 45%,transparent)!important;
  background:linear-gradient(180deg,color-mix(in srgb,var(--c) 14%,#0B1626),color-mix(in srgb,var(--c) 6%,#0B1626))!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 2px 8px rgba(0,0,0,.45)!important;
  transition:transform .12s,box-shadow .15s,border-color .15s!important;
}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn:hover:not(:disabled){
  transform:translateY(-1px)!important;border-color:var(--c)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 4px 14px rgba(0,0,0,.5),0 0 14px color-mix(in srgb,var(--c) 40%,transparent)!important;
}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn:active:not(:disabled){transform:translateY(0) scale(.98)!important;filter:brightness(.94);}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn:disabled{opacity:.42;filter:grayscale(.3);}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn-CHECK{--c:#25D487;}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn-CALL{--c:#20CFFF;}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn-FOLD{--c:var(--pf-red);}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) :is(.gto-btn-RAISE,.gto-btn-OPEN,.gto-btn-BET,.gto-btn-BET33,.gto-btn-BET50,.gto-btn-BET75,.gto-btn-BET100,[class*="gto-btn-3BET"],[class*="gto-btn-4BET"],[class*="gto-btn-5BET"]){--c:#FFB800;}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn-ALLIN{--c:var(--pf-red);}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn .gto-btn-label{color:color-mix(in srgb,var(--c) 78%,#fff)!important;}
:is(.grid2,.grid3,.grid4,.t1-actions-under,.t1-mob .mtr-actions) .gto-btn .gto-btn-sizing{color:color-mix(in srgb,var(--c) 62%,#fff)!important;}
/* Dealer V2 : SVG vectoriel — on neutralise le disque CSS d'origine */
.dealer-btn.dealer-btn-v2{background:none!important;border:none!important;box-shadow:none!important;animation:none!important;padding:0!important;color:transparent!important;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));}

/* ══ Tokens TRAINER V2 (planche Assets Trainer V2 §09/§10/§11) ══
   Source de vérité : public/assets/pokerforge/trainer-v2/tokens/*.css
   (inlinés ici car le build standalone n'embarque pas les <link> runtime). */
:root{
  --pf-bg-900:#0B1626;--pf-bg-800:#0F1F3A;--pf-blue-700:#132B4D;--pf-blue-600:#1E3A66;
  --pf-cyan:#20CFFF;--pf-gold:#FFB800;--pf-orange:#FF6B00;--pf-green:#17C964;
  --pf-red:#E53935;--pf-purple:#A855F7;--pf-gray:#8B949E;--pf-white:#E6E6E6;
  --pf-radius-sm:8px;--pf-radius-md:12px;--pf-radius-lg:18px;
  --pf-glow-cyan:0 0 18px rgba(32,207,255,.45);--pf-glow-gold:0 0 18px rgba(255,184,0,.38);
  --pf-glow-green:0 0 16px rgba(23,201,100,.40);--pf-glow-red:0 0 16px rgba(229,57,53,.42);
  --pf-glow-purple:0 0 16px rgba(168,85,247,.42);
  --pf-shadow-card:0 6px 14px rgba(0,0,0,.7);
  --pf-font-title:'Orbitron','Space Grotesk',sans-serif;
  --pf-font-main:'Montserrat','Inter',sans-serif;
  --pf-font-stats:'DIN Condensed','JetBrains Mono',monospace;
}

/* ══ Tokens palette multi-table (script V1 §13 + §6) ══ */
:root{
  --pf-mt-bg-app:#020914;--pf-mt-bg-panel:#061426;--pf-mt-bg-panel-alt:#081A2D;
  --pf-mt-felt:#06264A;--pf-mt-felt-deep:#031A35;
  --pf-mt-border:#12304C;--pf-mt-border-soft:#0B2238;--pf-mt-border-active:#1769FF;--pf-mt-border-gold:#C8953E;
  --pf-mt-text:#F4F7FB;--pf-mt-text-2:#A9B7C9;--pf-mt-text-muted:#6E7E91;
  --pf-mt-cyan:#00D9FF;--pf-mt-blue:#0878FF;--pf-mt-green:#00E889;--pf-mt-red:#FF3B35;
  --pf-mt-gold-light:#F4C56A;--pf-mt-gold:#C8953E;--pf-mt-gold-dark:#6F4518;
  --pf-mt-glow-blue:rgba(0,120,255,.25);--pf-mt-glow-cyan:rgba(0,217,255,.20);--pf-mt-glow-gold:rgba(200,149,62,.22);
  --pf-scale-1t:1;--pf-scale-2t:.78;--pf-scale-3t-top:.66;--pf-scale-3t-bottom:.61;--pf-scale-4t:.58;
}
/* Emplacement de carte en attente (turn/river) — pastille dorée maquette */
.mt-board-ph{
  display:block;box-sizing:border-box;flex-shrink:0;
  border:1px dashed var(--pf-mt-glow-gold);
  background:rgba(200,149,62,.05);
  box-shadow:inset 0 0 8px rgba(0,0,0,.35);
}
/* Calibrage cartes multi-table (retour utilisateur) : héros ×0.7, board ×0.5.
   Scopé .pf-mt-seat / .mt-board-zone → le 1T figé n'est pas affecté. */
.grid2 .pf-mt-seat .hero-card-wrap,
.grid3 .pf-mt-seat .hero-card-wrap,
.grid4 .pf-mt-seat .hero-card-wrap{zoom:1;}
.mt-board-zone{zoom:.72;}/* minimum readable board across 2T/3T/4T */
/* Badges de mise 2T : jetons AU-DESSUS du libellé (vertical, comme la maquette)
   → badge étroit qui tient dans le couloir board ↔ nameplate. 3T/4T restent
   horizontaux (zones plus petites : un badge haut y percute blindes/pot). */
.grid2 .pf-seat-action-zone .pf-action-chip-badge{
  flex-direction:column!important;gap:1px!important;align-items:center!important;
}
.grid2 .pf-seat-action-zone .pf-action-chip-copy{
  display:flex;flex-direction:row;gap:3px;align-items:baseline;line-height:1.1;text-align:center;
}
/* Pot multi-table : aucun cadre/fond — jetons + texte posés sur le feutre */
.grid2 .pf-pot-readout,.grid3 .pf-pot-readout,.grid4 .pf-pot-readout{
  background:transparent!important;border:none!important;box-shadow:none!important;
  outline:none!important;backdrop-filter:none!important;
}
/* Boutons d'action mosaïque — minimums interactifs du script (§6) : 40px en 2T, 36px en 3T/4T */
.grid2 .gto-btn{min-height:40px!important;padding:6px 8px!important;}
.grid3 .gto-btn,.grid4 .gto-btn{min-height:36px!important;padding:5px 6px!important;}
/* 4T dé-aplati : zone 2.58 (feutre ~2.87, trop plat) → 1.71 (feutre ~1.9), même
   famille que le 3T. La place vient des actions sur 1 ligne + doublon Hero retiré. */
.grid4 .training-table-zone{aspect-ratio:1.92!important;}
/* 3T : feutre légèrement aplati pour laisser tenir le bandeau complet (sizing +
   stepper) sans rogner. §6. */
.grid3 .training-table-zone{aspect-ratio:1.88!important;}
.grid4 .mtr-actions{padding:5px 6px 6px!important;}
.grid4 .gto-btn-inner{padding:7px 6px 6px!important;}
.grid4 .gto-btn-label{font-size:11px!important;}
.grid4 .gto-btn-sizing{font-size:8px!important;padding:2px 5px!important;}
.grid4 .gto-btn-hint{display:none!important;}
/* §5 POLICES MULTI 3T/4T — les stacks/positions etaient a 5px (illisibles) et le
   pot a 14px. On agrandit pour la lisibilite (maquette 4 tables) : nameplate
   position+stack, pot value (gras) et label. */
.grid3 .pf-mt-nameplate{font-size:10px!important;}
.grid4 .pf-mt-nameplate{font-size:9px!important;}
.grid3 .pf-pot-value,.grid4 .pf-pot-value{font-size:15px!important;font-weight:800!important;}
.grid3 .pf-pot-label,.grid4 .pf-pot-label{font-size:8px!important;}
/* Blindes + mises un peu plus grandes aussi. */
.grid3 .pf-blind-stack strong,.grid4 .pf-blind-stack strong{font-size:9px!important;}
.grid3 .pf-action-chip-copy strong,.grid4 .pf-action-chip-copy strong{font-size:9px!important;}
.grid3 .pf-action-chip-copy em,.grid4 .pf-action-chip-copy em{font-size:8px!important;}
/* POT COMPACT MULTI (comme le 1T) : sinon la pile de jetons rend le pot très
   HAUT (~54px = 26% du feutre court) et il chevauche le siège du haut ET le board.
   Ligne unique [jetons] POT xx bb, hauteur fixe. */
.grid3 .pf-pot-readout,.grid4 .pf-pot-readout{
  flex-direction:row!important;align-items:center!important;gap:4px!important;
  white-space:nowrap!important;height:20px!important;
}
/* Pile de jetons masquée dans le pot multi : sur petites tables elle encombrait le
   centre et son empreinte chevauchait la plaque du siège haut-centre. Le pot reste
   « POT xx bb » (texte), comme la maquette. */
.grid3 .pf-pot-chip-stack,.grid4 .pf-pot-chip-stack{display:none!important;}
/* Avatars multi 3T/4T réduits (trop gros → bloc siège trop haut sur feutre court,
   d'où les chevauchements pot/siège). §2/§7 de la maquette. */
.grid4 .pf-avatar-premium{width:34px!important;height:34px!important;}
.grid3 .pf-avatar-premium{width:38px!important;height:38px!important;}
/* BANDEAU DÉCISION MULTI (mtr-actions-multi) : même disposition que le 1T mais
   compacté pour chaque table. Sizing presets + stepper réduits pour tenir sur une
   ligne sans déborder le conteneur. §6 de la maquette. */
.mtr-actions-multi .sizing-btn{font-size:8px!important;padding:3px 1px!important;border-radius:5px!important;}
.grid4 .mtr-actions-multi .sizing-btn{font-size:7px!important;padding:2px 1px!important;}
.mtr-actions-multi .sizing-custom{padding:2px 6px!important;gap:3px!important;border-radius:5px!important;}
.mtr-actions-multi .sizing-step-btn{width:17px!important;height:17px!important;font-size:12px!important;border-radius:4px!important;}
.grid4 .mtr-actions-multi .sizing-step-btn{width:15px!important;height:15px!important;font-size:11px!important;}
/* CHEVAUCHEMENT STACK HERO : « Pre BTN decision » (.table-action-line) était posé
   au bas-centre du feutre, PILE sur la plaque du Hero (HERO/BTN/20bb). Le 1T la
   masque déjà (l'info vit dans le bandeau) → on fait pareil en multi : le bandeau
   de décision porte désormais « BTN vs BB · … ». */
.grid2 .table-action-line,.grid3 .table-action-line,.grid4 .table-action-line{display:none!important;}
/* Les hints pédagogiques (2e ligne du bouton) masqués en multi : pas la place. */
.mtr-actions-multi .gto-btn-hint{display:none!important;}
.mtr-actions-multi .gto-btn-inner{padding:4px 4px 3px!important;}
.grid4 .mtr-actions-multi .gto-btn-inner{padding:3px 3px 2px!important;}
/* Colonne droite partagée multi-table : panneau V2 lisible (renderMultiPanel) */
.pf-mt-sharedcol{flex:0 0 320px;width:320px;min-width:0;align-self:stretch;display:flex;overflow:hidden;}
.pf-mt-sharedcol>.t1-right{flex:1 1 auto!important;width:100%!important;}

/* ══ PANNEAU DROIT MULTI-TABLE V2 — refonte lisibilité ══ */
.pf-p2{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:12px;overflow-y:auto;overflow-x:hidden;
  padding:12px 13px 14px;background:linear-gradient(180deg,var(--pf-mt-bg-panel-alt,#081A2D),var(--pf-mt-bg-app,#020914));
  border-left:1px solid var(--pf-mt-border,#12304C);box-sizing:border-box;}
.pf-p2::-webkit-scrollbar{width:7px;}
.pf-p2::-webkit-scrollbar-thumb{background:#173257;border-radius:5px;}
.pf-p2-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.pf-p2-chip{display:inline-flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;
  color:#cfe0ff;background:#0c1e3a;border:1px solid #17345c;border-radius:7px;padding:4px 9px;}
.pf-p2-chip b{color:#54b8ff;font-weight:800;}
.pf-p2-sec{display:flex;flex-direction:column;gap:8px;padding-bottom:12px;border-bottom:1px solid rgba(18,48,76,.6);}
.pf-p2-sec:last-child{border-bottom:none;padding-bottom:0;}
.pf-p2-h{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:800;letter-spacing:.13em;color:#54b8ff;}
/* Villain */
.pf-p2-vil{display:flex;gap:11px;align-items:center;}
.pf-p2-vil-ava{width:46px;height:46px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:23px;border:2px solid;}
.pf-p2-vil-name{font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:800;line-height:1.1;}
.pf-p2-vil-sub{font-family:'Inter',sans-serif;font-size:11px;color:#8fa2c4;margin-top:2px;line-height:1.3;}
.pf-p2-bars{display:flex;flex-direction:column;gap:7px;}
.pf-p2-bar{display:flex;align-items:center;gap:9px;}
.pf-p2-bar .k{font-family:'JetBrains Mono',monospace;font-size:11px;color:#a9b7c9;width:38px;flex-shrink:0;}
.pf-p2-bar .tr{flex:1;height:7px;border-radius:20px;background:#0b2238;overflow:hidden;}
.pf-p2-bar .tr i{display:block;height:100%;border-radius:20px;}
.pf-p2-bar .v{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;min-width:34px;text-align:right;}
/* Solution masquée */
.pf-p2-locked{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:10px;background:#0b2238;border:1px solid #14304f;}
.pf-p2-locked span{font-family:'Inter',sans-serif;font-size:12px;color:#a9b7c9;}
.pf-p2-reveal{margin-left:auto;padding:6px 16px;border-radius:8px;border:1px solid #1769FF;background:rgba(23,105,255,.16);color:#9fc8ff;font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;cursor:pointer;}
.pf-p2-reveal:hover{background:rgba(23,105,255,.32);color:#fff;}
/* Verdict */
.pf-p2-verdict{display:flex;flex-direction:column;gap:2px;padding:9px 12px;border-radius:10px;border:1px solid;}
.pf-p2-verdict.ok{background:rgba(0,232,137,.08);border-color:rgba(0,232,137,.35);}
.pf-p2-verdict.ko{background:rgba(255,69,96,.08);border-color:rgba(255,69,96,.35);}
.pf-p2-verdict strong{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:800;color:#f4f7fb;}
.pf-p2-verdict span{font-family:'JetBrains Mono',monospace;font-size:11px;color:#a9b7c9;}
/* Analyse GTO — lignes d'action */
.pf-p2-actlist{display:flex;flex-direction:column;gap:6px;}
.pf-p2-actrow{display:flex;align-items:center;gap:8px;padding:4px 7px;border-radius:8px;background:rgba(11,34,56,.5);}
.pf-p2-actrow.best{background:rgba(0,232,137,.08);}
.pf-p2-actrow.chosen{outline:1px solid rgba(120,160,255,.5);}
.pf-p2-actrow .lab{font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:#e6eefc;width:78px;flex-shrink:0;display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pf-p2-actrow .lab i{font-style:normal;color:#00E889;font-size:11px;}
.pf-p2-actrow .tr{flex:1;height:7px;border-radius:20px;background:#0a1a30;overflow:hidden;}
.pf-p2-actrow .tr i{display:block;height:100%;border-radius:20px;}
.pf-p2-actrow .frq{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:#dbe7ff;min-width:34px;text-align:right;}
.pf-p2-actrow .ev{font-family:'JetBrains Mono',monospace;font-size:11px;min-width:34px;text-align:right;}
.pf-p2-optimal{font-family:'JetBrains Mono',monospace;font-size:11px;color:#a9b7c9;text-align:right;}
.pf-p2-optimal b{color:#00E889;}
.pf-p2-ranges{margin-top:2px;padding:9px;border-radius:9px;border:1px solid #17345c;background:#0c1e3a;color:#cfe0ff;font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:.15s;}
.pf-p2-ranges:hover{border-color:#1769FF;background:rgba(23,105,255,.16);color:#fff;}
/* Historique */
.pf-p2-histo{display:flex;flex-direction:column;gap:3px;}
.pf-p2-hrow{display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-radius:6px;}
.pf-p2-hrow.hero{background:rgba(23,105,255,.12);}
.pf-p2-hrow .p{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#7f8ca3;}
.pf-p2-hrow.hero .p{color:#8FC0FF;}
.pf-p2-hrow .a{font-family:'Inter',sans-serif;font-size:11.5px;}
/* Informations */
.pf-p2-info{display:flex;flex-direction:column;gap:5px;}
.pf-p2-irow{display:flex;align-items:center;justify-content:space-between;}
.pf-p2-irow .k{font-family:'Inter',sans-serif;font-size:12px;color:#8090a5;}
.pf-p2-irow .v{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:700;}
/* Timeline */
.pf-p2-tl{
  margin-top:auto;gap:8px;position:sticky;bottom:0;z-index:5;
  padding-top:10px!important;padding-bottom:8px!important;
  background:linear-gradient(180deg,rgba(3,13,42,.72),#030D2A 38%);
  border-top:1px solid rgba(18,48,76,.8)!important;
}
.pf-p2-tl-track{height:6px;border-radius:20px;background:#0b2238;overflow:hidden;}
.pf-p2-tl-track i{display:block;height:100%;border-radius:20px;background:linear-gradient(90deg,#0878FF,#00D9FF);box-shadow:0 0 8px rgba(0,217,255,.4);}
.pf-p2-tl-row{display:flex;align-items:center;gap:10px;}
.pf-p2-tl-row .cnt{font-family:'JetBrains Mono',monospace;font-size:11px;color:#a9b7c9;}
.pf-p2-next{flex:1;padding:10px;border-radius:9px;border:none;cursor:pointer;font-family:'Space Grotesk',sans-serif;font-size:12.5px;font-weight:800;color:#fff;background:linear-gradient(135deg,#0878FF,#00D9FF);box-shadow:0 3px 14px rgba(8,120,255,.36);}
.pf-p2-next:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;background:#12304C;}
/* Aide multi-table intégrée au panneau droit (ex-bandeau bas) */
.pf-mtp-help{flex-shrink:0;padding:9px 11px;margin-top:2px;border-top:1px solid #152D6E;background:rgba(6,20,38,.5);}
.pf-mtp-help .pf-mtp-title{font-family:'Space Grotesk',sans-serif;font-size:9px;font-weight:800;letter-spacing:.13em;margin-bottom:5px;}
.pf-mtp-help-instr{display:flex;flex-direction:column;gap:2px;margin-bottom:2px;}
.pf-mtp-help-instr strong{font-family:'Space Grotesk',sans-serif;font-size:9.5px;font-weight:800;color:#DCEBFF;letter-spacing:.04em;}
.pf-mtp-help-instr span{font-family:'Inter',sans-serif;font-size:9.5px;color:#A9B7C9;line-height:1.35;}
.pf-mtp-help-keys{display:flex;flex-direction:column;gap:4px;}
.pf-mtp-help-key{display:flex;align-items:center;gap:7px;}
.pf-mtp-help-key .kk{font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:800;color:#F4F7FB;background:#0B2238;border:1px solid #16305f;border-radius:5px;padding:1px 6px;flex-shrink:0;}
.pf-mtp-help-key .kl{font-family:'Inter',sans-serif;font-size:9.5px;color:#A9B7C9;}
.pf-mtp-help-list{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:3px;}
.pf-mtp-help-list li{font-family:'Inter',sans-serif;font-size:9px;color:#8FA2C4;line-height:1.3;padding-left:11px;position:relative;}
.pf-mtp-help-list li::before{content:"•";position:absolute;left:1px;color:#0878FF;}

/* ══ MULTI-TABLE — panneau droit partagé (maquette V1) ══ */
.pf-mt-rightpanel{
  flex:0 0 300px;width:300px;min-width:0;align-self:stretch;overflow-y:auto;overflow-x:hidden;
  background:linear-gradient(180deg,#081A2D 0%,#04101D 100%);
  border-left:1px solid #12304C;padding:10px 12px 14px;
  display:flex;flex-direction:column;gap:12px;box-sizing:border-box;
}
.pf-mt-rightpanel::-webkit-scrollbar{width:6px;}
.pf-mt-rightpanel::-webkit-scrollbar-thumb{background:#12304C;border-radius:4px;}
.pf-mtp-sec{display:flex;flex-direction:column;gap:7px;}
.pf-mtp-title{font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:800;letter-spacing:.14em;color:#00D9FF;}
.pf-mtp-empty{font-family:'Inter',sans-serif;font-size:10px;color:#6E7E91;padding:8px 0;}
.pf-mtp-bars{display:flex;flex-direction:column;gap:5px;margin-top:6px;}
.pf-mtp-bar{display:flex;align-items:center;gap:7px;}
.pf-mtp-bar .k{font-family:'JetBrains Mono',monospace;font-size:8.5px;color:#A9B7C9;width:34px;flex-shrink:0;}
.pf-mtp-bar .tr{flex:1;height:5px;border-radius:20px;background:#0B2238;overflow:hidden;}
.pf-mtp-bar .tr i{display:block;height:100%;border-radius:20px;}
.pf-mtp-bar .v{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;min-width:30px;text-align:right;}
.pf-mtp-sol{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:#0B2238;border:1px solid #12304C;}
.pf-mtp-sol.reveal{border-color:rgba(0,232,137,.35);background:rgba(0,232,137,.06);}
.pf-mtp-sol .lbl{font-family:'Inter',sans-serif;font-size:10px;color:#A9B7C9;}
.pf-mtp-sol strong{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:800;}
.pf-mtp-sol .frq{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:10px;color:#00E889;}
.pf-mtp-reveal{margin-left:auto;padding:3px 12px;border-radius:6px;border:1px solid #1769FF;background:rgba(23,105,255,.14);color:#8FC0FF;font-family:'Inter',sans-serif;font-size:10px;font-weight:700;cursor:pointer;}
.pf-mtp-reveal:hover{background:rgba(23,105,255,.28);color:#fff;}
.pf-mtp-histo{display:flex;flex-direction:column;gap:2px;}
.pf-mtp-hrow{display:flex;align-items:center;justify-content:space-between;padding:2px 2px;border-bottom:1px solid rgba(11,34,56,.6);}
.pf-mtp-hrow .p{font-family:'JetBrains Mono',monospace;font-size:9px;color:#6E7E91;font-weight:700;}
.pf-mtp-hrow .a{font-family:'Inter',sans-serif;font-size:9.5px;color:#A9B7C9;}
.pf-mtp-hrow.hero{background:rgba(23,105,255,.1);border-radius:5px;}
.pf-mtp-hrow.hero .p,.pf-mtp-hrow.hero .a{color:#8FC0FF;}
.pf-mtp-info{display:flex;flex-direction:column;gap:3px;}
.pf-mtp-irow{display:flex;align-items:center;justify-content:space-between;padding:2px 0;}
.pf-mtp-irow .k{font-family:'Inter',sans-serif;font-size:10px;color:#6E7E91;}
.pf-mtp-irow .v{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;}
.pf-mtp-timeline{margin-top:auto;gap:6px;}
.pf-mtp-tl-track{height:5px;border-radius:20px;background:#0B2238;overflow:hidden;}
.pf-mtp-tl-track i{display:block;height:100%;border-radius:20px;background:linear-gradient(90deg,#0878FF,#00D9FF);box-shadow:0 0 8px rgba(0,217,255,.4);}
.pf-mtp-tl-ctrls{display:flex;align-items:center;gap:8px;}
.pf-mtp-tl-ctrls .cnt{font-family:'JetBrains Mono',monospace;font-size:9px;color:#A9B7C9;}
.pf-mtp-tl-next{flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:800;color:#fff;background:linear-gradient(135deg,#0878FF,#00D9FF);box-shadow:0 3px 12px rgba(8,120,255,.34);}
.pf-mtp-tl-next:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;background:#12304C;}

/* ══ MULTI-TABLE — bandeau explicatif du bas (maquette V1) ══ */
.pf-mt-footer{
  flex-shrink:0;display:grid;grid-template-columns:1.15fr 1fr 1fr 0.95fr 0.95fr;gap:18px;
  padding:12px 18px 14px;background:#020914;border-top:1px solid #12304C;
}
.pf-mtf-col{min-width:0;}
.pf-mtf-h{font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:800;letter-spacing:.14em;color:#6E7E91;margin-bottom:7px;}
.pf-mtf-instr{display:flex;flex-direction:column;gap:3px;}
.pf-mtf-instr strong{font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:800;color:#00D9FF;letter-spacing:.05em;}
.pf-mtf-instr span{font-family:'Inter',sans-serif;font-size:10px;color:#A9B7C9;line-height:1.4;}
.pf-mtf-instr em{font-style:normal;font-family:'Inter',sans-serif;font-size:10px;color:#F4C56A;font-weight:600;}
.pf-mtf-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;}
.pf-mtf-list li{font-family:'Inter',sans-serif;font-size:10px;color:#A9B7C9;line-height:1.35;padding-left:15px;position:relative;}
.pf-mtf-list.ok li::before{content:"✓";position:absolute;left:0;color:#00E889;font-weight:700;}
.pf-mtf-list.dot li::before{content:"•";position:absolute;left:2px;color:#0878FF;font-weight:700;}
.pf-mtf-keys{display:flex;flex-direction:column;gap:5px;}
.pf-mtf-key{display:flex;align-items:center;gap:8px;}
.pf-mtf-key .kk{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:800;color:#F4F7FB;background:#0B2238;border:1px solid #12304C;border-radius:5px;padding:2px 7px;flex-shrink:0;}
.pf-mtf-key .kl{font-family:'Inter',sans-serif;font-size:10px;color:#A9B7C9;}
@media(max-width:1279px){
  .pf-mt-rightpanel{flex-basis:250px;width:250px;}
  .pf-mt-footer{gap:12px;grid-template-columns:1.1fr 1fr 1fr 0.9fr 0.9fr;}
}
/* Seat fold visual */
.seat-folded,.pf-mt-seat-folded{
  opacity:.7!important;
  filter:grayscale(.62) saturate(.64) brightness(.84)!important;
  transition:opacity .24s ease,filter .24s ease!important;
}
.seat-multiway,.pf-mt-seat-multiway{filter:saturate(1.08) brightness(1.03);}
.pf-fold-chip,.pf-multiway-chip{
  margin-top:3px;
  display:inline-flex;align-items:center;justify-content:center;
  padding:2px 7px;border-radius:999px;
  font-family:'Space Grotesk',sans-serif;font-size:7.5px;font-weight:900;
  letter-spacing:.12em;line-height:1;text-transform:uppercase;
}
.pf-fold-chip{
  color:#C0C7D1;background:rgba(192,199,209,.09);
  border:1px solid rgba(192,199,209,.28);
  box-shadow:0 0 10px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);
}
.pf-multiway-chip{
  color:#00E6B8;background:rgba(0,230,184,.1);
  border:1px solid rgba(0,230,184,.36);
  box-shadow:0 0 12px rgba(0,230,184,.18),inset 0 1px 0 rgba(255,255,255,.08);
}
/* Training table zone — locked, never resizes with solution panel */
/* overflow visible : les sièges (hors du felt) ne sont jamais rognés par le cadre de la zone.
   Le felt garde son propre overflow:hidden pour le board/pot. */
.training-table-zone{position:relative;flex-shrink:0;overflow:visible;width:100%;}

/* ─── TABLE WRAPPER ─────────────────────────────────── */
.tw{
  background:#050E28;
  border:1px solid #152D6E;
  border-radius:12px;overflow:hidden;
  display:flex;flex-direction:column;
  box-shadow:0 4px 24px rgba(0,0,0,.4),0 0 0 1px rgba(255,194,71,.03);
  transition:box-shadow .2s;
}
.tw:hover{box-shadow:0 4px 32px rgba(0,0,0,.5),0 0 0 1px rgba(255,194,71,.06);}

/* ─── TIMELINE ──────────────────────────────────────── */
.tlbar{
  display:flex;align-items:center;gap:5px;padding:6px 10px;
  background:#071B44;border-bottom:1px solid #152D6E;
  overflow-x:auto;min-height:32px;flex-shrink:0;
}
.tlpos{color:#6F81A8;font-family:'Inter',sans-serif;font-size:9px;font-weight:600;}
.tlact{padding:2px 6px;border-radius:4px;font-size:8px;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.04em;}
.tl-fold{background:rgba(255,69,96,.12);color:#FF4560;}
.tl-call{background:rgba(16,216,122,.1);color:#10D87A;}
.tl-raise{background:rgba(31,139,255,.1);color:#1F8BFF;}
.tl-check{background:#0B2F77;color:#9FB0CC;}
.tl-bet{background:rgba(255,194,71,.1);color:#FFC247;}
.tl-win{background:rgba(16,216,122,.1);color:#10D87A;}
.tlcur{
  background:rgba(155,92,255,.15);color:#9B5CFF;
  border:1px solid rgba(155,92,255,.4);
  animation:tlpulse 1.4s infinite;
}
@keyframes tlpulse{0%,100%{opacity:1;}50%{opacity:.4;}}
.tlsep{color:#4A6090;font-size:10px;}
.tlstreet{
  font-size:8px;padding:2px 7px;border-radius:4px;
  background:#0B2F77;color:#9FB0CC;font-weight:700;margin-left:4px;
  font-family:'Inter',sans-serif;letter-spacing:.08em;
}

/* ─── FELT TABLE ────────────────────────────────────── */
.feltout{position:relative;padding:8px 10px 4px;}
.feltout1t{max-width:680px;margin:0 auto;padding:10px 14px 0;}
.felt{
  position:relative;width:100%;padding-bottom:33%;
  background:radial-gradient(ellipse at 50% 38%,#143520 0%,#0a1e12 45%,#050d08 100%);
  border-radius:44%;
  border:3px solid #1a3525;
  box-shadow:
    inset 0 0 60px rgba(0,0,0,.6),
    inset 0 0 25px rgba(0,60,20,.2),
    0 0 0 1px #0a1510,
    0 8px 40px rgba(0,0,0,.5),
    0 0 30px rgba(16,216,122,.04);
  transition:box-shadow .3s;
}
.felt.error-flash{
  animation:feltError .5s ease-out;
  border-color:#FF4560 !important;
}
@keyframes feltError{
  0%{box-shadow:inset 0 0 60px rgba(0,0,0,.6),0 0 60px rgba(255,69,96,.6),0 0 120px rgba(255,69,96,.3);}
  50%{box-shadow:inset 0 0 80px rgba(255,69,96,.25),0 0 80px rgba(255,69,96,.5);}
  100%{box-shadow:inset 0 0 60px rgba(0,0,0,.6),0 0 30px rgba(16,216,122,.04);}
}
.felt.hero-action{box-shadow:inset 0 0 60px rgba(0,0,0,.6),0 0 0 2px rgba(255,194,71,.4),0 0 30px rgba(255,194,71,.15);}
.felt.villain-thinking{box-shadow:inset 0 0 60px rgba(0,0,0,.6),0 0 0 2px rgba(155,92,255,.3),0 0 30px rgba(155,92,255,.1);}
@keyframes btnShake{0%,100%{transform:translateX(0);}20%{transform:translateX(-5px);}40%{transform:translateX(5px);}60%{transform:translateX(-4px);}80%{transform:translateX(4px);}}

/* ─── SEATS ─────────────────────────────────────────── */
.seat{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;z-index:5;}
.seatchip{
  border-radius:50%;display:flex;flex-direction:column;align-items:center;
  justify-content:center;font-family:'Inter',sans-serif;
  border:2px solid;transition:all .2s;position:relative;
}
.seatpos{font-size:8px;letter-spacing:.04em;font-weight:700;}
.seatstk{font-size:8px;font-weight:600;}
.seatname{
  font-size:7px;color:rgba(180,200,190,.4);
  background:rgba(0,0,0,.7);padding:1px 5px;
  border-radius:3px;white-space:nowrap;
  font-family:'Inter',sans-serif;letter-spacing:.04em;
}
.seathole{display:flex;gap:2px;margin-top:2px;}
.seatbadge{
  padding:2px 7px;border-radius:4px;font-size:7.5px;font-weight:700;
  border:1px solid;white-space:nowrap;margin-top:2px;
  font-family:'Inter',sans-serif;letter-spacing:.04em;
}

/* ─── POT ───────────────────────────────────────────── */
.pot{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;}
.potlbl{font-size:8px;color:rgba(160,190,170,.4);letter-spacing:.18em;text-transform:uppercase;font-family:'Inter',sans-serif;}
.potval{
  font-family:'Inter',sans-serif;font-size:16px;color:#FFC247;
  font-weight:800;text-shadow:0 0 16px rgba(255,194,71,.6);letter-spacing:.03em;
}
.boardarea{display:flex;gap:5px;position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);}

/* ─── CARTES — Design premium ───────────────────────── */
.card{
  border-radius:6px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;font-weight:800;line-height:1;position:relative;
  transition:transform .1s,box-shadow .1s;flex-shrink:0;overflow:hidden;
}
.card::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.08) 0%,transparent 50%);
  pointer-events:none;
}

/* Tailles cartes */
.card-xs{width:19px;height:26px;border-radius:3px;}
.card-sm{width:24px;height:33px;border-radius:4px;}
.card-md{width:34px;height:47px;border-radius:5px;}
.card-lg{width:48px;height:66px;border-radius:6px;}
.card-xl{width:60px;height:83px;border-radius:7px;}
.card-2xl{width:76px;height:104px;border-radius:8px;}

/* Coin haut gauche */
.card-corner{position:absolute;top:3px;left:3px;display:flex;flex-direction:column;align-items:flex-start;line-height:1.1;z-index:2;}
.card-corner-r{font-weight:900;font-family:'Inter',sans-serif;}
.card-corner-s{margin-top:-1px;}

/* Symbole central */
.card-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.45;z-index:1;}

/* Tailles texte par taille de carte */
.card-xs .card-corner-r{font-size:8.5px;}
.card-xs .card-corner-s{font-size:6.5px;}
.card-xs .card-center{font-size:11px;}
.card-sm .card-corner-r{font-size:10px;}
.card-sm .card-corner-s{font-size:8px;}
.card-sm .card-center{font-size:14px;}
.card-md .card-corner-r{font-size:13px;}
.card-md .card-corner-s{font-size:10px;}
.card-md .card-center{font-size:20px;}
.card-lg .card-corner-r{font-size:18px;}
.card-lg .card-corner-s{font-size:13px;}
.card-lg .card-center{font-size:28px;}
.card-xl .card-corner-r{font-size:23px;}
.card-xl .card-corner-s{font-size:16px;}
.card-xl .card-center{font-size:35px;}
.card-2xl .card-corner-r{font-size:30px;}
.card-2xl .card-corner-s{font-size:21px;}
.card-2xl .card-center{font-size:46px;}
.card-2xl .card-corner{top:5px;left:5px;}
.card-3xl{width:95px;height:130px;border-radius:10px;}
.card-3xl .card-corner-r{font-size:38px;}
.card-3xl .card-corner-s{font-size:26px;}
.card-3xl .card-center{font-size:58px;}
.card-3xl .card-corner{top:6px;left:6px;}
.card-1t-hero{width:52px;height:72px;border-radius:7px;}
.card-1t-hero .card-corner-r{font-size:20px;}
.card-1t-hero .card-corner-s{font-size:15px;}
.card-1t-hero .card-center{font-size:31px;}
.card-1t-board{width:57px;height:79px;border-radius:7px;}/* +10% (script V2) */
.card-1t-board .card-corner-r{font-size:22px;}
.card-1t-board .card-corner-s{font-size:16px;}
.card-1t-board .card-center{font-size:34px;}
.card-1t-board .card-corner{top:4px;left:4px;}
.card-1t-hero-top{width:44px;height:61px;border-radius:6px;}
.card-1t-hero-top .card-corner-r{font-size:17px;}
.card-1t-hero-top .card-corner-s{font-size:12px;}
.card-1t-hero-top .card-center{font-size:26px;}
.card-1t-hero-bottom{width:48px;height:66px;border-radius:7px;}
.card-1t-hero-bottom .card-corner-r{font-size:18px;}
.card-1t-hero-bottom .card-corner-s{font-size:13px;}
.card-1t-hero-bottom .card-center{font-size:28px;}
.card-1t-hero-mobile{width:52px;height:72px;border-radius:7px;}
.card-1t-hero-mobile .card-corner-r{font-size:20px;}
.card-1t-hero-mobile .card-corner-s{font-size:15px;}
.card-1t-hero-mobile .card-center{font-size:31px;}
.card-1t-villain{width:38px;height:52px;border-radius:6px;}
.card-1t-villain .card-corner-r{font-size:14px;}
.card-1t-villain .card-corner-s{font-size:10px;}
.card-1t-villain .card-center{font-size:21px;}
/* Taille intermédiaire smp (sm-plus) — entre xs(19×26) et sm(24×33) */
.card-smp{width:28px;height:38px;border-radius:4px;}
.card-smp .card-corner-r{font-size:12px;}
.card-smp .card-corner-s{font-size:9px;}
.card-smp .card-center{font-size:17px;}
/* Glow dorée autour des cartes hero */
.hero-card-wrap{filter:drop-shadow(0 0 7px rgba(255,194,71,.55)) drop-shadow(0 2px 10px rgba(0,0,0,.85));}

/* Dos de carte */
.card-back{
  background:
    radial-gradient(circle at 50% 18%,rgba(0,191,255,.38),transparent 34%),
    linear-gradient(145deg,#09265B 0%,#061326 46%,#020712 100%) !important;
  border:1px solid rgba(0,191,255,.44) !important;
  position:relative;
  box-shadow:0 5px 16px rgba(0,0,0,.7),0 0 14px rgba(0,191,255,.24),inset 0 0 0 1px rgba(231,236,243,.08)!important;
}
.pf-card-back>div{display:none!important;}
.card-back::before{
  content:'';position:absolute;inset:3px;border-radius:inherit;
  background:
    linear-gradient(135deg,rgba(255,255,255,.24),transparent 22%,transparent 72%,rgba(0,191,255,.16)),
    repeating-linear-gradient(45deg,rgba(0,191,255,.18) 0 1px,transparent 1px 7px);
  border:1px solid rgba(231,236,243,.12);
  pointer-events:none;
}
.card-back::after{
  content:'PF';position:absolute;inset:0;
  display:flex;align-items:center;justify-content:center;
  font-family:'Space Grotesk',sans-serif;font-size:clamp(9px,42%,16px);
  font-weight:900;letter-spacing:-.06em;color:#E7ECF3;
  text-shadow:0 0 8px rgba(0,191,255,.8),0 1px 0 rgba(0,0,0,.65);
  background:none;
}

/* Animations cartes */
@keyframes deal{
  0%{transform:scale(.3) rotate(-25deg) translateY(-20px);opacity:0;}
  65%{transform:scale(1.06) rotate(2deg);opacity:1;}
  100%{transform:scale(1) rotate(0);opacity:1;}
}
.deal{animation:deal .25s cubic-bezier(.22,.68,.36,1) forwards;}

/* Zone Hero sous le felt */
.hero-cards-zone{
  display:flex;align-items:center;justify-content:center;
  gap:10px;padding:6px 0 4px;position:relative;
}
.hero-cards-zone::before{
  content:'HERO';position:absolute;left:50%;top:-4px;
  transform:translateX(-50%);font-size:7px;letter-spacing:.3em;
  color:rgba(255,194,71,.45);font-family:'Space Grotesk',sans-serif;font-weight:700;
}
/* 1T seat — plus lisible */
.seat1t .seatchip{border-radius:50%!important;}
.seat1t .seatpos{font-size:13px!important;letter-spacing:.04em;}
.seat1t .seatstk{font-size:12px!important;font-weight:700;}
.seat1t .seatname{font-size:10px!important;color:#9FB0CC;font-weight:700;margin-top:2px;}

/* ─── STREET INDICATOR ──────────────────────────────── */
.streetind{display:flex;gap:4px;padding:5px 10px;background:#071B44;border-bottom:1px solid #152D6E;align-items:center;flex-shrink:0;}
.stind{font-size:8.5px;padding:2px 9px;border-radius:20px;cursor:default;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.08em;}
.stind.done{background:rgba(16,216,122,.1);color:#10D87A;}
.stind.current{background:rgba(255,194,71,.12);color:#FFC247;border:1px solid rgba(255,194,71,.3);box-shadow:0 0 8px rgba(255,194,71,.15);}
.stind.todo{background:#071B44;color:#4A6090;}

/* ─── ACTION ZONE ───────────────────────────────────── */
.az{padding:9px;background:#071B44;border-top:1px solid #152D6E;flex-shrink:0;}
.aztitle{font-size:11px;color:#9FB0CC;text-align:center;margin-bottom:6px;font-family:'Inter',sans-serif;letter-spacing:.04em;}
.ag{display:grid;gap:5px;}
.ag3{grid-template-columns:repeat(3,1fr);}.ag2{grid-template-columns:repeat(2,1fr);}
.ab{
  padding:9px 4px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;
  border:none;display:flex;flex-direction:column;align-items:center;gap:2px;
  transition:all .13s;font-family:'Inter',sans-serif;letter-spacing:.04em;
}
.ab:hover:not(:disabled){filter:brightness(1.18);transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.35);}
.ab:active{transform:scale(.96);}
.ab:disabled{opacity:.22;cursor:not-allowed;transform:none;}
.ab-sub{font-size:7.5px;font-weight:500;opacity:.7;}
.ab-FOLD{background:linear-gradient(135deg,#2a0c10,#1e0809);color:#ff8090;border:1px solid #4a1820;}
.ab-CALL{background:linear-gradient(135deg,#082a14,#051e0e);color:#40e880;border:1px solid #1a4a28;}
.ab-CHECK{background:linear-gradient(135deg,#14200a,#0e1806);color:#a0d060;border:1px solid #283818;}
.ab-RAISE{background:linear-gradient(135deg,#0c1830,#081020);color:#70b0e0;border:1px solid #1c3050;}
.ab-BET33{background:linear-gradient(135deg,#281a04,#1c1200);color:#e0a040;border:1px solid #48300a;}
.ab-BET50{background:linear-gradient(135deg,#221602,#180e00);color:#d09030;border:1px solid #402808;}
.ab-BET75{background:linear-gradient(135deg,#1c1200,#120c00);color:#c08020;border:1px solid #382004;}
.ab-BET100{background:linear-gradient(135deg,#161000,#0e0a00);color:#b07010;border:1px solid #2c1a02;}
.ab-ALLIN{background:linear-gradient(135deg,#2a0808,#1c0404);color:#ff6060;border:1px solid #4a1010;}
.ab-3BET{background:linear-gradient(135deg,#1a0c2a,#100820);color:#b070e0;border:1px solid #301848;}

/* ─── EV GRID ───────────────────────────────────────── */
.evgrid{display:grid;gap:4px;padding:9px;background:#071B44;border-top:1px solid #152D6E;}
.evg3{grid-template-columns:repeat(3,1fr);}.evg2{grid-template-columns:repeat(2,1fr);}
.evcell{padding:7px;border-radius:8px;border:1px solid;}
.evrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;}
.evlbl{font-size:9.5px;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.04em;}
.evfreq{font-size:9px;font-weight:700;font-family:'Inter',sans-serif;}
.evbar{height:3px;background:rgba(255,255,255,.06);border-radius:2px;margin-top:3px;}
.evbarfill{height:100%;border-radius:2px;transition:width .5s;}
.ev-ok{background:rgba(16,216,122,.07);border-color:rgba(16,216,122,.28);}
.ev-warn{background:rgba(255,194,71,.05);border-color:rgba(255,194,71,.2);}
.ev-bad{background:rgba(255,69,96,.05);border-color:rgba(255,69,96,.15);}
.freqbar{display:flex;height:5px;border-radius:4px;overflow:hidden;margin:2px 9px 4px;gap:1px;}
.freqseg{height:100%;transition:width .5s;}

/* ─── VILLAIN ZONE ──────────────────────────────────── */
.vzone{
  padding:8px 10px;background:rgba(155,92,255,.05);
  border-top:1px solid rgba(155,92,255,.15);
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
}
.vzone-name{font-family:'Inter',sans-serif;font-size:10px;color:#9B5CFF;font-weight:700;letter-spacing:.04em;}
.vzone-act{font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:5px;font-family:'Inter',sans-serif;}
.vzone-note{font-size:10.5px;color:#9FB0CC;flex:1;}
@keyframes think{0%,100%{opacity:.2;}50%{opacity:1;}}
.think span{animation:think .9s infinite;font-size:14px;color:#9B5CFF;}
.think span:nth-child(2){animation-delay:.15s;}.think span:nth-child(3){animation-delay:.3s;}

/* ─── SOLUTION BOX ──────────────────────────────────── */
.solbox{margin:6px 9px;border-radius:8px;overflow:hidden;border:1px solid;}
.sol-ok{background:rgba(16,216,122,.06);border-color:rgba(16,216,122,.25);}
.sol-ko{background:rgba(255,69,96,.05);border-color:rgba(255,69,96,.22);}
.solhdr{padding:8px 12px;display:flex;align-items:center;gap:7px;font-weight:700;font-size:11px;font-family:'Inter',sans-serif;}
.solbody{padding:8px 12px;font-size:10.5px;line-height:1.75;color:#9FB0CC;}
.blbox{margin:0 9px 9px;background:#071B44;border:1px solid #1A3A80;border-radius:8px;overflow:hidden;}
.blhdr{padding:7px 12px;background:rgba(255,194,71,.06);border-bottom:1px solid #152D6E;font-size:10px;font-weight:700;color:#FFC247;display:flex;align-items:center;gap:5px;font-family:'Inter',sans-serif;letter-spacing:.04em;}
.blbody{padding:9px 12px;}
.blrow{display:flex;gap:8px;margin-bottom:7px;}
.blico{width:20px;height:20px;border-radius:50%;background:#071B44;border:1px solid #1A3A80;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;margin-top:2px;}
.bltxt{flex:1;font-size:10.5px;color:#9FB0CC;line-height:1.7;}
.bltxt strong{color:#FFFFFF;}
.leakbox{margin-top:7px;padding:7px 10px;background:rgba(255,69,96,.05);border-radius:6px;border:1px solid rgba(255,69,96,.15);}
.leaklbl{font-size:8px;color:#FF4560;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin-bottom:4px;font-family:'Inter',sans-serif;}
.leakitem{font-size:9.5px;color:#ff8090;margin-bottom:2px;}

/* ─── ACTION TIMER ──────────────────────────────────── */
.action-timer{height:3px;background:#152D6E;position:relative;overflow:hidden;flex-shrink:0;}
.action-timer-bar{height:100%;background:linear-gradient(90deg,#FF4560,#FFC247,#10D87A);transition:width .1s linear;border-radius:0 2px 2px 0;}
.action-timer-bar.urgent{background:linear-gradient(90deg,#FF4560,#ff6070);animation:urgentPulse .3s infinite;}
@keyframes urgentPulse{0%,100%{opacity:1;}50%{opacity:.6;}}

/* ─── ERROR TOAST ───────────────────────────────────── */
@keyframes toastIn{0%{transform:translateX(120%);opacity:0;}10%{transform:translateX(0);opacity:1;}85%{transform:translateX(0);opacity:1;}100%{transform:translateX(120%);opacity:0;}}
.error-toast{
  position:fixed;top:70px;right:16px;z-index:100;
  background:rgba(255,69,96,.95);color:#fff;
  padding:10px 16px;border-radius:10px;
  font-family:'Inter',sans-serif;font-size:12px;font-weight:700;
  display:flex;align-items:center;gap:8px;
  box-shadow:0 4px 24px rgba(255,69,96,.5);
  max-width:calc(100vw - 32px);/* ← ne déborde plus */
  animation:toastIn 3s ease forwards;
}
.error-toast-icon{font-size:16px;}

/* ─── RANGE GRID ────────────────────────────────────── */
.range-grid{display:grid;grid-template-columns:repeat(13,1fr);gap:1px;border-radius:8px;overflow:hidden;margin-top:6px;}
.rg-cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;font-size:7px;font-weight:700;cursor:default;letter-spacing:-.02em;position:relative;transition:transform .1s;}
.rg-cell:hover{transform:scale(1.5);z-index:10;border-radius:2px;}
.rg-raise{background:rgba(255,184,0,.86);}
.rg-call{background:rgba(32,207,255,.78);}
.rg-fold{background:rgba(42,16,24,.82);}
.rg-mix-rc{background:linear-gradient(135deg,rgba(255,184,0,.86) 50%,rgba(32,207,255,.78) 50%);}
.rg-mix-rf{background:linear-gradient(135deg,rgba(255,184,0,.86) 50%,rgba(42,16,24,.82) 50%);}
.rg-mix-cf{background:linear-gradient(135deg,rgba(32,207,255,.78) 50%,rgba(42,16,24,.82) 50%);}
.rg-header{display:flex;gap:8px;align-items:center;margin-bottom:5px;}
.rg-legend{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.rg-leg{display:flex;align-items:center;gap:4px;font-size:8.5px;color:#9FB0CC;font-family:'Inter',sans-serif;}
.rg-leg-dot{width:10px;height:10px;border-radius:2px;}

/* ─── ONLINE FEEL ───────────────────────────────────── */
.ab{transition:all .12s,box-shadow .15s;}
.ab:hover:not(:disabled){
  filter:brightness(1.25);transform:translateY(-3px);
  box-shadow:0 8px 24px rgba(0,0,0,.4);
}
.ab-FOLD:hover{box-shadow:0 6px 20px rgba(255,69,96,.3) !important;}
.ab-CALL:hover{box-shadow:0 6px 20px rgba(16,216,122,.3) !important;}
.ab-RAISE:hover,.ab-3BET:hover{box-shadow:0 6px 20px rgba(31,139,255,.3) !important;}
.ab-CHECK:hover{box-shadow:0 6px 20px rgba(160,208,96,.3) !important;}
.ab-ALLIN:hover{box-shadow:0 6px 20px rgba(255,80,80,.4) !important;}

/* Shake erreur sur le bouton */
.ab.btn-error{animation:btnShake .35s ease-out;background:linear-gradient(135deg,#3a0c14,#280608) !important;border-color:#FF4560 !important;}

/* ─── THEME EFFECTS GLOBAL ──────────────────────────── */
body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(ellipse 70% 50% at 0% 0%,rgba(155,92,255,.04) 0%,transparent 60%),
    radial-gradient(ellipse 50% 40% at 100% 100%,rgba(255,194,71,.03) 0%,transparent 55%),
    radial-gradient(ellipse 60% 40% at 50% 100%,rgba(16,216,122,.02) 0%,transparent 50%);
}
.app{position:relative;z-index:1;}
.hdr::before{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(90deg,transparent 0px,transparent 3px,rgba(255,194,71,.01) 3px,rgba(255,194,71,.01) 4px);
  opacity:.5;
}
@keyframes borderGlow{0%,100%{box-shadow:0 0 0 1px rgba(255,194,71,.1),inset 0 0 30px rgba(0,0,0,.5);}50%{box-shadow:0 0 0 1px rgba(155,92,255,.15),inset 0 0 30px rgba(0,0,0,.5);}}
.tw{animation:borderGlow 4s infinite;}

/* ─── NEXT ROW ──────────────────────────────────────── */
.nextrow{display:flex;gap:6px;padding:8px 9px;border-top:1px solid #152D6E;background:#071B44;flex-shrink:0;}

/* ─── BUTTONS ───────────────────────────────────────── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:none;border-radius:8px;font-weight:700;cursor:pointer;transition:all .13s;font-family:'Inter',sans-serif;letter-spacing:.04em;}
.btn:hover{filter:brightness(1.12);transform:translateY(-1px);}
.btn:active{transform:scale(.97);}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.btng{
  background:linear-gradient(135deg,#FFC247,#FFC247);
  color:#0a0800;font-size:12px;padding:9px 18px;
  box-shadow:0 4px 16px rgba(255,194,71,.3);
}
.btng:hover{box-shadow:0 6px 20px rgba(255,194,71,.4);}
.btns{background:#071B44;color:#9FB0CC;font-size:11px;padding:8px 13px;border:1px solid #1A3A80;}
.btns:hover{color:#FFFFFF;border-color:#2E6CFF;}
.btnx{background:transparent;color:#FFC247;font-size:11px;padding:8px 13px;border:1px solid rgba(255,194,71,.25);}
.btnx:hover{background:rgba(255,194,71,.06);}

/* ─── SESSION END ───────────────────────────────────── */
.se{display:flex;flex-direction:column;align-items:center;text-align:center;padding:30px 16px;gap:14px;}
.sescore{font-family:'Space Grotesk',sans-serif;font-size:52px;font-weight:900;line-height:1;}
.segrade{font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;font-family:'Inter',sans-serif;}
.segrid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;width:100%;max-width:360px;}
.sebox{background:#071B44;border:1px solid #1A3A80;border-radius:8px;padding:12px;}
.sev{font-family:'Inter',sans-serif;font-size:18px;font-weight:700;}
.sel{font-size:8.5px;color:#6F81A8;margin-top:2px;letter-spacing:.08em;}
.errit{padding:9px 12px;background:#071B44;border:1px solid #1A3A80;border-radius:8px;margin-bottom:5px;font-size:10.5px;display:flex;gap:8px;align-items:flex-start;text-align:left;width:100%;max-width:520px;}

/* ─── TAGS ──────────────────────────────────────────── */
.tag{font-size:8.5px;padding:2px 7px;border-radius:20px;display:inline-flex;align-items:center;border:1px solid;white-space:nowrap;font-family:'Inter',sans-serif;font-weight:600;letter-spacing:.04em;}
.tag-g{background:rgba(16,216,122,.1);color:#10D87A;border-color:rgba(16,216,122,.25);}
.tag-gold{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.25);}
.tag-b{background:rgba(31,139,255,.1);color:#1F8BFF;border-color:rgba(31,139,255,.25);}
.tag-r{background:rgba(255,69,96,.1);color:#FF4560;border-color:rgba(255,69,96,.25);}
.tag-p{background:rgba(155,92,255,.1);color:#9B5CFF;border-color:rgba(155,92,255,.25);}
.tag-c{background:rgba(52,216,255,.08);color:#34D8FF;border-color:rgba(52,216,255,.2);}

/* ─── POKER IMAGES BANNER ───────────────────────────── */
.poker-banner{display:none;}
.banner-img{display:none;}

/* ─── BANNER SLIDESHOW ───────────────────────────────── */
.poker-slideshow{height:120px;overflow:hidden;position:relative;flex-shrink:0;background:#030712;border-bottom:1px solid #152D6E;}
.slide-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .9s ease,transform 8s ease;filter:brightness(.65) saturate(1.1);}
.slide-img.active{opacity:1;transform:scale(1.04);}
.slide-img.inactive{opacity:0;transform:scale(1);}
.slide-overlay{position:absolute;inset:0;background:linear-gradient(0deg,rgba(8,8,14,.85) 0%,transparent 50%,rgba(8,8,14,.3) 100%);z-index:1;}
.slide-caption{position:absolute;bottom:10px;left:20px;z-index:2;font-family:'Space Grotesk',sans-serif;font-size:9px;letter-spacing:.18em;color:rgba(255,194,71,.7);text-transform:uppercase;}
.slide-dots{position:absolute;bottom:10px;right:16px;z-index:2;display:flex;gap:5px;}
.slide-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.2);cursor:pointer;transition:all .2s;}
.slide-dot.on{background:#FFC247;transform:scale(1.3);}

/* ─── CHIP ANIMATION ─────────────────────────────────── */
@keyframes chipFly{0%{transform:translate(0,0) scale(1);opacity:1;}60%{transform:translate(0,-32px) scale(.7);opacity:.9;}100%{transform:translate(0,-56px) scale(.4);opacity:0;}}
@keyframes chipPop{0%{transform:scale(0) rotate(-20deg);opacity:0;}50%{transform:scale(1.3) rotate(5deg);opacity:1;}100%{transform:scale(1) rotate(0);opacity:1;}}
.chip-fly{position:absolute;bottom:30%;left:50%;transform:translateX(-50%);pointer-events:none;z-index:20;animation:chipFly .55s ease-out forwards;}
.chip-fly span{display:inline-block;background:linear-gradient(135deg,#FFC247,#FFC247);color:#030712;font-family:'Space Grotesk',sans-serif;font-size:9px;font-weight:900;padding:4px 9px;border-radius:20px;box-shadow:0 2px 12px rgba(255,194,71,.5);}
.pot-pop{animation:chipPop .35s cubic-bezier(.34,1.56,.64,1) forwards;}

/* ─── ACTIVE SEAT PULSE ──────────────────────────────── */
@keyframes seatPulse{0%{box-shadow:0 0 0 0 rgba(155,92,255,.6);}70%{box-shadow:0 0 0 8px rgba(155,92,255,0);}100%{box-shadow:0 0 0 0 rgba(155,92,255,0);}}
@keyframes heroSeatPulse{0%{box-shadow:0 0 0 0 rgba(255,194,71,.6);}70%{box-shadow:0 0 0 8px rgba(255,194,71,0);}100%{box-shadow:0 0 0 0 rgba(255,194,71,0);}}
.seat-actor{animation:seatPulse 1.2s infinite;}
.seat-hero-actor{animation:heroSeatPulse 1.2s infinite;}

/* ─── GAMEPLAY ANIMATIONS ────────────────────────────── */
/* Deal hero cards (slide from bottom) */
@keyframes dealHero{0%{transform:translateY(40px) rotate(-14deg) scale(.2);opacity:0;}65%{transform:translateY(-4px) rotate(3deg) scale(1.06);opacity:1;}100%{transform:translateY(0) rotate(0) scale(1);opacity:1;}}
/* Deal villain cards (slide from top) */
@keyframes dealVillain{0%{transform:translateY(-36px) rotate(14deg) scale(.2);opacity:0;}65%{transform:translateY(4px) rotate(-3deg) scale(1.06);opacity:1;}100%{transform:translateY(0) rotate(0) scale(1);opacity:1;}}
/* Board card flip-in from left */
@keyframes boardCardIn{0%{transform:translateX(-18px) rotateY(80deg) scale(.7);opacity:0;}55%{transform:translateX(3px) rotateY(-6deg) scale(1.04);opacity:1;}100%{transform:translateX(0) rotateY(0) scale(1);opacity:1;}}
/* Pot value pulse when chips arrive */
@keyframes potValuePop{0%{transform:scale(1);filter:brightness(1);}30%{transform:scale(1.3);filter:brightness(1.5);}65%{transform:scale(.95);filter:brightness(1.1);}100%{transform:scale(1);filter:brightness(1);}}
/* Villain act badge slide in */
@keyframes vilActIn{0%{transform:translateX(-12px) scale(.85);opacity:0;}60%{transform:translateX(3px) scale(1.04);opacity:1;}100%{transform:translateX(0) scale(1);opacity:1;}}
/* Hero turn "À TOI" pulsing */
@keyframes heroTurnGlow{0%,100%{opacity:.65;}50%{opacity:1;}}
/* Villain thinking progress bar */
@keyframes thinkBar{0%{width:4%;opacity:.7;}100%{width:92%;opacity:1;}}
/* Phase transition overlay fade */
@keyframes phaseFlash{0%{opacity:.3;}100%{opacity:0;}}
/* Chips flying to pot (hero) — top-right arc */
@keyframes chipHeroFly{0%{transform:translate(0px,0px) scale(1);opacity:1;}50%{transform:translate(35px,-50px) scale(.65);opacity:.9;}100%{transform:translate(65px,-30px) scale(.3);opacity:0;}}
/* Chips flying to pot (villain) — top-left arc */
@keyframes chipVilFly{0%{transform:translate(0px,0px) scale(1);opacity:1;}50%{transform:translate(-35px,-50px) scale(.65);opacity:.9;}100%{transform:translate(-65px,-30px) scale(.3);opacity:0;}}
/* Active hero seat strong glow */
@keyframes seatHeroActive{0%,100%{box-shadow:0 0 0 3px rgba(255,194,71,.5),0 0 28px rgba(255,194,71,.3);}50%{box-shadow:0 0 0 6px rgba(255,194,71,.8),0 0 50px rgba(255,194,71,.55),inset 0 0 20px rgba(255,194,71,.08);}}
/* Active villain seat glow */
@keyframes seatVilActive{0%,100%{box-shadow:0 0 0 2px rgba(155,92,255,.4),0 0 22px rgba(155,92,255,.25);}50%{box-shadow:0 0 0 5px rgba(155,92,255,.7),0 0 42px rgba(155,92,255,.5);}}
/* Showdown card flip */
@keyframes showdownFlip{0%{transform:rotateY(90deg) scale(.9);opacity:0;}50%{transform:rotateY(-8deg) scale(1.04);opacity:1;}100%{transform:rotateY(0) scale(1);opacity:1;}}

.deal-hero{animation:dealHero .32s cubic-bezier(.22,.68,.36,1) forwards;}
.deal-villain{animation:dealVillain .28s cubic-bezier(.22,.68,.36,1) forwards;}
.board-card-in{animation:boardCardIn .35s cubic-bezier(.22,.68,.36,1) forwards;}
.pot-val-pop{animation:potValuePop .42s cubic-bezier(.34,1.56,.64,1) forwards;}
.vil-act-badge-in{animation:vilActIn .28s cubic-bezier(.22,.68,.36,1) forwards;}
.hero-turn-glow{animation:heroTurnGlow 1.3s ease-in-out infinite;}
.think-bar{height:3px;border-radius:2px;background:linear-gradient(90deg,rgba(155,92,255,.5),#9B5CFF);animation:thinkBar 1.5s ease-out forwards;}
.chip-hero-fly{position:absolute;bottom:22%;left:48%;pointer-events:none;z-index:40;animation:chipHeroFly .52s ease-in forwards;}
.chip-vil-fly{position:absolute;top:22%;left:52%;pointer-events:none;z-index:40;animation:chipVilFly .52s ease-in forwards;}
.chip-hero-fly span,.chip-vil-fly span{display:inline-block;background:linear-gradient(135deg,#FFC247,#D4891A);color:#030712;font-family:'Space Grotesk',sans-serif;font-size:9px;font-weight:900;padding:4px 9px;border-radius:20px;box-shadow:0 2px 12px rgba(255,194,71,.5);}
.chip-vil-fly span{background:linear-gradient(135deg,#9B5CFF,#7030D0);color:#fff;box-shadow:0 2px 12px rgba(155,92,255,.5);}
.seat-active-hero{animation:seatHeroActive 1.5s ease-in-out infinite;}
.seat-active-vil{animation:seatVilActive 1.5s ease-in-out infinite;}
.phase-flash{position:absolute;inset:0;background:rgba(255,194,71,.06);pointer-events:none;z-index:50;animation:phaseFlash .4s ease-out forwards;border-radius:50%;}
/* Hero reply zone — comes in animated */
.hero-reply-zone{animation:vilActIn .25s cubic-bezier(.22,.68,.36,1) forwards;}
/* Villain decision banner */
.vil-decision-banner{animation:vilActIn .3s cubic-bezier(.22,.68,.36,1) forwards;}

/* ─── REPFELT AMÉLIORATION ───────────────────────────── */
.repfelt{background:radial-gradient(ellipse at 50% 45%,#1a3525 0%,#0c1e12 55%,#050c08 100%);padding:20px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;min-height:200px;justify-content:center;}
.rep-seat{display:flex;flex-direction:column;align-items:center;gap:4px;transition:all .2s;}
.rep-seat-chip{border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .3s;position:relative;}
.rep-seat-chip.active{animation:seatPulse 1.2s infinite;}
.rep-seat-chip.active-hero{animation:heroSeatPulse 1.2s infinite;}
.street-chip{display:inline-flex;align-items:center;gap:5px;background:rgba(255,194,71,.08);border:1px solid rgba(255,194,71,.2);border-radius:20px;padding:4px 12px;font-family:'Inter',sans-serif;font-size:10px;font-weight:700;color:#FFC247;letter-spacing:.08em;}
.street-chip::before{content:'';width:6px;height:6px;border-radius:50%;background:#FFC247;}

/* ─── DASHBOARD ─────────────────────────────────────── */
.dash{padding:16px 20px;overflow-y:auto;height:100%;}
.dash-title{
  font-size:9px;color:#6F81A8;letter-spacing:.25em;text-transform:uppercase;
  font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;
  font-family:'Inter',sans-serif;
}
.dash-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#1A3A80,transparent);}
.dg4{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px;}
.dg3{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px;}
.dg2{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:12px;}
.dg21{display:grid;grid-template-columns:2fr 1fr;gap:9px;margin-bottom:12px;}

/* Metric card */
.mc{
  background:#050E28;border:1px solid #152D6E;border-radius:10px;
  padding:13px;position:relative;overflow:hidden;
}
.mc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
.mc-gold::before{background:linear-gradient(90deg,#FFC247,#FFC247,#FFC247);}
.mc-green::before{background:linear-gradient(90deg,#0a9a40,#10D87A,#0a9a40);}
.mc-blue::before{background:linear-gradient(90deg,#1a70c0,#1F8BFF,#1a70c0);}
.mc-purple::before{background:linear-gradient(90deg,#7030b0,#9B5CFF,#7030b0);}
.mc-red::before{background:linear-gradient(90deg,#c01830,#FF4560,#c01830);}
.mc-l{font-size:9px;color:#6F81A8;margin-bottom:5px;letter-spacing:.08em;font-family:'Inter',sans-serif;}
.mc-v{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;line-height:1;}
.mc-d{font-size:9.5px;margin-top:5px;display:flex;align-items:center;gap:4px;font-family:'Inter',sans-serif;}
.mc-ico{font-size:24px;position:absolute;right:13px;top:13px;opacity:.1;}

/* Panel */
.pcard{background:#050E28;border:1px solid #152D6E;border-radius:10px;padding:14px;}
.pcard-h{
  font-size:9px;color:#6F81A8;letter-spacing:.2em;text-transform:uppercase;
  font-weight:700;margin-bottom:11px;display:flex;align-items:center;gap:6px;
  font-family:'Inter',sans-serif;
}
.pcard-h::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#1A3A80,transparent);}

/* Progress */
.pw{margin-bottom:9px;}
.pt{display:flex;justify-content:space-between;font-size:11px;color:#9FB0CC;margin-bottom:4px;font-family:'Inter',sans-serif;}
.ptr{height:5px;background:#152D6E;border-radius:3px;overflow:hidden;}
.pb{height:100%;border-radius:3px;transition:width .7s cubic-bezier(.4,0,.2,1);}

/* Streak */
.streak-box{
  background:linear-gradient(135deg,rgba(255,194,71,.08),rgba(255,194,71,.04));
  border:1px solid rgba(255,194,71,.2);border-radius:8px;padding:12px;
  display:flex;align-items:center;gap:12px;
}
.streak-num{font-family:'Space Grotesk',sans-serif;font-size:34px;font-weight:900;color:#FFC247;line-height:1;text-shadow:0 0 20px rgba(255,194,71,.4);}
.streak-fire{font-size:30px;}
.streak-label{font-size:10.5px;color:#9FB0CC;line-height:1.6;font-family:'Inter',sans-serif;}
.streak-days{display:flex;gap:4px;margin-top:8px;}
.streak-day{width:22px;height:22px;border-radius:4px;border:1px solid #152D6E;display:flex;align-items:center;justify-content:center;font-size:8px;font-family:'Inter',sans-serif;color:#4A6090;font-weight:700;}
.streak-day.done{background:rgba(255,194,71,.15);border-color:rgba(255,194,71,.35);color:#FFC247;}
.streak-day.today{background:rgba(255,194,71,.28);border-color:#FFC247;color:#FFC247;box-shadow:0 0 10px rgba(255,194,71,.3);}

/* Weekly chart */
.wchart{display:flex;align-items:flex-end;gap:5px;height:52px;margin-top:8px;}
.wbar{flex:1;border-radius:4px 4px 0 0;min-height:4px;transition:height .5s;}
.wday{font-size:7.5px;color:#4A6090;text-align:center;margin-top:4px;font-family:'Inter',sans-serif;font-weight:600;}

/* Goal tracker */
.goal-item{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid #0F2258;}
.goal-item:last-child{border:none;}
.goal-check{width:18px;height:18px;border-radius:50%;border:2px solid #1A3A80;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;transition:all .2s;}
.goal-check.done{background:rgba(16,216,122,.15);border-color:#10D87A;color:#10D87A;}
.goal-label{flex:1;font-size:11px;color:#9FB0CC;font-family:'Inter',sans-serif;}
.goal-label.done{color:#4A6090;text-decoration:line-through;}
.goal-xp{font-family:'Space Grotesk',sans-serif;font-size:8px;color:#FFC247;}

/* Leaks */
.leak-row{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
.leak-icon{width:26px;height:26px;border-radius:6px;background:rgba(255,69,96,.08);border:1px solid rgba(255,69,96,.18);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;}
.leak-label{flex:1;font-size:11px;color:#9FB0CC;font-family:'Inter',sans-serif;}
.leak-bar-wrap{width:64px;height:4px;background:#152D6E;border-radius:3px;overflow:hidden;}
.leak-bar{height:100%;border-radius:3px;}
.leak-pct{font-family:'Space Grotesk',sans-serif;font-size:8px;min-width:28px;text-align:right;}

/* Quick actions */
.qa-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.qa-btn{padding:11px;border-radius:8px;border:1px solid #152D6E;background:#071B44;cursor:pointer;transition:all .14s;display:flex;flex-direction:column;gap:4px;text-align:left;}
.qa-btn:hover{border-color:#1A3A80;background:#071B44;transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.3);}
.qa-ico{font-size:20px;}
.qa-label{font-size:10.5px;font-weight:700;color:#FFFFFF;font-family:'Inter',sans-serif;letter-spacing:.03em;}
.qa-sub{font-size:8.5px;color:#6F81A8;}

/* ─── COACH MODE ────────────────────────────────────── */
.coach{display:flex;flex-direction:column;height:100%;overflow:hidden;}
.coach-nav{display:flex;gap:0;background:#030712;border-bottom:1px solid #152D6E;flex-shrink:0;padding:0 20px;}
.coach-ntab{padding:10px 18px;font-size:11px;cursor:pointer;color:#6F81A8;transition:all .15s;border-bottom:2px solid transparent;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.06em;}
.coach-ntab:hover{color:#9FB0CC;}
.coach-ntab.on{color:#FFC247;border-bottom-color:#FFC247;}
.coach-body{flex:1;overflow-y:auto;padding:20px 28px;}

/* ══════════════════ COACH AI — Premium UI ══════════════════ */
.coachai{display:flex;flex-direction:column;height:100%;overflow:hidden;background:radial-gradient(circle at 85% -10%,rgba(155,92,255,.10),transparent 55%),radial-gradient(circle at 0% 100%,rgba(31,139,255,.08),transparent 50%),#030712;}
.coachai-nav{display:flex;gap:4px;padding:0 20px;border-bottom:1px solid #152D6E;overflow-x:auto;scrollbar-width:none;flex-shrink:0;background:rgba(5,14,40,.6);}
.coachai-nav::-webkit-scrollbar{display:none;}
.coachai-ntab{padding:13px 14px;font-size:10.5px;font-weight:700;font-family:'Space Grotesk',sans-serif;letter-spacing:.04em;color:#6F81A8;cursor:pointer;white-space:nowrap;position:relative;transition:color .15s;}
.coachai-ntab:hover{color:#C9D4E8;}
.coachai-ntab.on{color:#fff;}
.coachai-ntab.on::after{content:"";position:absolute;left:8px;right:8px;bottom:0;height:2px;border-radius:2px;background:linear-gradient(90deg,#1F8BFF,#34D8FF);box-shadow:0 0 10px rgba(31,139,255,.45);}
.coachai-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;}
.cai-pane{flex:1;overflow-y:auto;padding:20px 28px;}

.cai-hero{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(31,139,255,.07),rgba(155,92,255,.04));border:1px solid #152D6E;border-radius:16px;padding:20px 24px;margin-bottom:16px;}
.cai-hero::before{content:"";position:absolute;top:-40%;right:-10%;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(155,92,255,.18),transparent 70%);pointer-events:none;}
.cai-hero-title{font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:800;color:#fff;margin-bottom:4px;position:relative;}
.cai-hero-sub{font-size:11px;color:#9FB0CC;font-family:'Inter',sans-serif;line-height:1.6;position:relative;}

.cai-card{position:relative;overflow:hidden;background:rgba(7,20,52,.55);border:1px solid #152D6E;border-radius:14px;padding:16px 18px;margin-bottom:14px;}
.cai-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#1F8BFF,#9B5CFF,#FFC247);opacity:.5;}
.cai-card-h{font-family:'Space Grotesk',sans-serif;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#7FB8FF;margin-bottom:12px;}

.cai-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:14px;}
.cai-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:14px;}
.cai-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:14px;}
.cai-grid2>.cai-card,.cai-grid3>.cai-card,.cai-grid4>.cai-card{margin-bottom:0;}

.cai-pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:700;font-family:'Inter',sans-serif;}
.cai-progress-wrap{height:7px;border-radius:6px;background:rgba(255,255,255,.06);overflow:hidden;}
.cai-progress-bar{height:100%;border-radius:6px;background:linear-gradient(90deg,#1F8BFF,#9B5CFF,#FFC247);transition:width .4s cubic-bezier(.4,0,.2,1);}

.cai-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:9px;font-size:10.5px;font-weight:700;font-family:'Space Grotesk',sans-serif;letter-spacing:.03em;cursor:pointer;border:1px solid transparent;background:linear-gradient(90deg,#1F8BFF,#3D6BFF);color:#fff;transition:all .15s;}
.cai-btn:hover{filter:brightness(1.12);transform:translateY(-1px);}
.cai-btn-ghost{background:rgba(255,255,255,.04);border:1px solid #1A3A80;color:#C9D4E8;}
.cai-btn-gold{background:linear-gradient(90deg,#FFC247,#FF8A3D);color:#1A0F00;}

.cai-diag-card{background:rgba(7,20,52,.5);border:1px solid #152D6E;border-radius:12px;padding:14px;}
.cai-diag-score{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:800;}

.cai-leak-card{position:relative;background:rgba(7,20,52,.5);border:1px solid #152D6E;border-radius:12px;padding:14px 16px 14px 20px;margin-bottom:12px;}
.cai-leak-card::before{content:"";position:absolute;top:10px;bottom:10px;left:0;width:3px;border-radius:2px;background:linear-gradient(180deg,#FF4560,#FFC247);}

.cai-plan-row{display:flex;align-items:center;gap:14px;background:rgba(7,20,52,.5);border:1px solid #152D6E;border-radius:12px;padding:12px 16px;margin-bottom:10px;}
.cai-plan-day{flex-shrink:0;width:54px;text-align:center;font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:800;color:#FFC247;padding:6px 0;border-radius:8px;background:rgba(255,194,71,.1);border:1px solid rgba(255,194,71,.25);}
.cai-evpick{cursor:pointer;transition:all .15s;}
.cai-evpick:hover{border-color:#3D6BFF;background:rgba(31,139,255,.08);transform:translateY(-1px);}

.cai-goal-card{cursor:pointer;background:rgba(7,20,52,.5);border:1px solid #152D6E;border-radius:12px;padding:16px;transition:all .15s;}
.cai-goal-card:hover{border-color:#9B5CFF;background:rgba(155,92,255,.06);transform:translateY(-2px);}
.cai-goal-card.on{border-color:#FFC247;background:rgba(255,194,71,.06);}

.cai-step{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05);}
.cai-step:last-child{border-bottom:none;}
.cai-step-dot{flex-shrink:0;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;font-family:'Space Grotesk',sans-serif;background:rgba(255,255,255,.06);color:#6F81A8;border:1px solid #1A3A80;}
.cai-step-dot.done{background:rgba(16,216,122,.15);color:#10D87A;border-color:#10D87A;}
.cai-step-dot.current{background:rgba(255,194,71,.15);color:#FFC247;border-color:#FFC247;}

.cai-chat-msg{display:flex;gap:10px;margin-bottom:14px;align-items:flex-start;}
.cai-chat-avatar{flex-shrink:0;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;background:linear-gradient(135deg,#1F8BFF,#9B5CFF);}
.cai-chat-bubble{flex:1;background:rgba(255,255,255,.04);border:1px solid #152D6E;border-radius:12px;padding:10px 14px;font-size:10.5px;color:#C9D4E8;line-height:1.6;}
.cai-chat-suggest{display:inline-block;padding:6px 12px;margin:0 6px 6px 0;border-radius:20px;font-size:9.5px;color:#7FB8FF;background:rgba(31,139,255,.08);border:1px solid rgba(31,139,255,.25);cursor:pointer;transition:all .15s;}
.cai-chat-suggest:hover{background:rgba(31,139,255,.16);}

.cai-hist-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);}
.cai-hist-row:last-child{border-bottom:none;}
.cai-hist-dot{flex-shrink:0;width:8px;height:8px;border-radius:50%;}

.cai-fab{position:fixed;bottom:22px;right:24px;z-index:90;display:flex;align-items:center;gap:8px;padding:13px 20px;border-radius:30px;font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:800;color:#fff;background:linear-gradient(135deg,#1F8BFF,#9B5CFF);box-shadow:0 8px 24px rgba(91,60,255,.35);cursor:pointer;transition:transform .15s;}
/* Multi-table : Coach AI est dans la barre (à gauche d'Arrêter) → le FAB flottant
   ne doit plus chevaucher la timeline. On le masque quand la mosaïque est active. */
body:has(.pf-mt-sharedcol) .cai-fab,body:has(.pf-mt-sharedcol) .cai-fab-panel{display:none!important;}
.cai-fab:hover{transform:translateY(-2px) scale(1.03);}
.cai-fab-panel{position:fixed;bottom:84px;right:24px;z-index:90;width:340px;max-height:min(60vh,440px);display:flex;flex-direction:column;background:#0A1530;border:1px solid #1A3A80;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.5);overflow:hidden;}
.cai-fab-head{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #152D6E;background:rgba(31,139,255,.06);}
.cai-fab-body{flex:1;overflow-y:auto;padding:14px 16px;}
.cai-fab-foot{padding:12px 16px;border-top:1px solid #152D6E;}

/* Calculateur */
.calc-card{background:#071B44;border:1px solid #1A3A80;border-radius:12px;padding:18px 20px;margin-bottom:12px;}
.calc-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
.calc-label{font-family:'Inter',sans-serif;font-size:11px;color:#9FB0CC;font-weight:600;min-width:120px;}
.calc-input{
  background:#071B44;border:1px solid #1A3A80;border-radius:7px;
  color:#FFFFFF;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;
  padding:7px 12px;width:110px;outline:none;transition:border-color .15s;
}
.calc-input:focus{border-color:#FFC247;}
.calc-result{
  background:linear-gradient(135deg,rgba(255,194,71,.1),rgba(255,194,71,.06));
  border:1px solid rgba(255,194,71,.3);border-radius:12px;
  padding:14px 20px;margin-top:8px;
}
.calc-big{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:900;letter-spacing:2px;}
.calc-verdict{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;margin-top:4px;letter-spacing:.05em;}

/* Lexique */
.lex-search{
  background:#071B44;border:1px solid #1A3A80;border-radius:8px;
  color:#FFFFFF;font-family:'Inter',sans-serif;font-size:12px;
  padding:9px 14px;width:100%;outline:none;margin-bottom:14px;
}
.lex-search:focus{border-color:#FFC247;}
.lex-letter{font-family:'Space Grotesk',sans-serif;font-size:10px;color:#FFC247;letter-spacing:.2em;font-weight:900;padding:8px 0 4px;border-bottom:1px solid rgba(255,194,71,.15);margin-bottom:8px;margin-top:14px;}
.lex-term{padding:9px 12px;border-radius:8px;margin-bottom:4px;cursor:pointer;transition:all .12s;border:1px solid transparent;}
.lex-term:hover{background:#071B44;border-color:#1A3A80;}
.lex-term.open{background:#071B44;border-color:rgba(255,194,71,.2);}
.lex-word{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#FFFFFF;}
.lex-tag{font-size:8px;padding:1px 6px;border-radius:20px;background:rgba(155,92,255,.1);color:#9B5CFF;border:1px solid rgba(155,92,255,.2);margin-left:6px;font-family:'Inter',sans-serif;}
.lex-def{font-size:10.5px;color:#9FB0CC;line-height:1.75;margin-top:5px;font-family:'Inter',sans-serif;}
.lex-ex{font-size:9.5px;color:#1F8BFF;background:rgba(31,139,255,.07);border-radius:5px;padding:5px 9px;margin-top:5px;border-left:2px solid rgba(31,139,255,.3);}

/* Théorie articles */
.art-card{background:#071B44;border:1px solid #1A3A80;border-radius:12px;overflow:hidden;margin-bottom:12px;transition:all .15s;cursor:pointer;}
.art-card:hover{border-color:#2E6CFF;transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.4);}
.art-card.open{cursor:default;transform:none;}
.art-banner{height:56px;display:flex;align-items:center;padding:0 16px;gap:12px;}
.art-ico{font-size:24px;}
.art-title{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:700;color:#FFFFFF;letter-spacing:.08em;}
.art-sub{font-size:9px;color:#6F81A8;font-family:'Inter',sans-serif;margin-top:2px;}
.art-diff{font-size:8px;padding:2px 7px;border-radius:20px;margin-left:auto;font-family:'Inter',sans-serif;font-weight:700;}
.art-body{padding:14px 18px;border-top:1px solid #152D6E;}
.art-section{font-family:'Space Grotesk',sans-serif;font-size:8.5px;color:#FFC247;letter-spacing:.15em;font-weight:700;margin-bottom:6px;margin-top:14px;}
.art-p{font-size:11px;color:#8a8fb0;line-height:1.8;margin-bottom:10px;font-family:'Inter',sans-serif;}
.art-p strong{color:#FFFFFF;}
.art-hand{background:#071B44;border:1px solid #152D6E;border-radius:8px;padding:12px 14px;margin:10px 0;}
.art-hand-title{font-family:'Inter',sans-serif;font-size:10px;color:#9B5CFF;font-weight:700;margin-bottom:6px;letter-spacing:.06em;}
.art-key{display:flex;gap:6px;align-items:flex-start;padding:7px 10px;background:rgba(255,194,71,.06);border-radius:6px;border-left:3px solid #FFC247;margin:8px 0;}

/* Coach session */
.coach-session{padding:0;}
.cs-header{background:linear-gradient(135deg,rgba(255,194,71,.08),rgba(155,92,255,.06));padding:20px 24px;border-bottom:1px solid #152D6E;}
.cs-prog{height:5px;background:#152D6E;border-radius:3px;margin-top:12px;overflow:hidden;}
.cs-progfill{height:100%;background:linear-gradient(90deg,#9B5CFF,#FFC247);border-radius:3px;transition:width .5s;}
.cs-tip{background:rgba(31,139,255,.07);border:1px solid rgba(31,139,255,.15);border-radius:8px;padding:10px 14px;margin:10px 24px 0;font-size:10.5px;color:#9FB0CC;line-height:1.7;font-family:'Inter',sans-serif;}
.cs-tip strong{color:#1F8BFF;}

/* Events */
.evcard{background:#071B44;border:1px solid #152D6E;border-radius:6px;padding:9px;margin-bottom:5px;display:flex;align-items:center;gap:9px;transition:all .12s;}
.evcard:hover{border-color:#1A3A80;background:#0F2258;}
.evcard-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.evcard-date{font-family:'Space Grotesk',sans-serif;font-size:8px;color:#FFC247;min-width:100px;}
.evcard-name{font-size:11px;font-weight:600;color:#FFFFFF;flex:1;font-family:'Inter',sans-serif;}
.evcard-info{font-size:9px;color:#9FB0CC;text-align:right;}

/* News */
.newsrow{padding:7px 0;border-bottom:1px solid #0F2258;display:flex;align-items:center;gap:9px;}
.newsrow:last-child{border:none;}
.newstitle{font-size:11px;color:#FFFFFF;font-weight:500;cursor:pointer;flex:1;line-height:1.4;font-family:'Inter',sans-serif;}
.newstitle:hover{color:#FFC247;}
.newsmeta{font-size:9px;color:#4A6090;white-space:nowrap;}

/* ─── REPLAYER ──────────────────────────────────────── */
.repwrap{padding:16px 20px;overflow-y:auto;height:100%;}
.repup{border:2px dashed #1A3A80;border-radius:10px;padding:20px;text-align:center;color:#6F81A8;font-size:12.5px;cursor:pointer;transition:all .16s;position:relative;margin-bottom:10px;}
.repup:hover{border-color:#FFC247;color:#9FB0CC;background:rgba(255,194,71,.03);}
.repup input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.rephh{width:100%;font-size:9.5px;font-family:'JetBrains Mono',monospace;height:70px;border:1px solid #1A3A80;border-radius:8px;padding:9px;background:#030712;color:#9FB0CC;resize:vertical;outline:none;margin-top:8px;line-height:1.7;}
.rephh:focus{border-color:#FFC247;box-shadow:0 0 0 2px rgba(255,194,71,.08);}
.repvis{background:#071B44;border:1px solid #152D6E;border-radius:10px;overflow:hidden;margin-bottom:11px;}
.repvishdr{padding:9px 13px;border-bottom:1px solid #152D6E;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:5px;}
.repstabs{display:flex;gap:4px;}
.repstab{font-size:9px;padding:3px 9px;border-radius:20px;cursor:pointer;border:1px solid transparent;transition:all .12s;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.06em;}
.repstab.on{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.3);}
.repstab:not(.on){color:#6F81A8;}
.repfelt-legacy{display:none;}
.repctrls{display:flex;align-items:center;gap:5px;padding:8px 13px;background:#071B44;border-top:1px solid #152D6E;}
.repctrl{background:#071B44;border:1px solid #1A3A80;color:#9FB0CC;border-radius:5px;padding:4px 10px;font-size:13px;cursor:pointer;transition:all .12s;}
.repctrl:hover{color:#FFFFFF;border-color:#2E6CFF;}
.repctrl.on{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.3);}
.repprog{flex:1;height:4px;background:#152D6E;border-radius:3px;cursor:pointer;overflow:hidden;}
.repfill{height:100%;background:linear-gradient(90deg,#FFC247,#FFC247);border-radius:3px;transition:width .2s;}
.reptl{padding:0 13px 10px;max-height:180px;overflow-y:auto;}
.reptlrow{display:flex;align-items:center;gap:7px;padding:4px 8px;border-radius:6px;font-size:10.5px;cursor:pointer;transition:all .12s;margin-bottom:2px;}
.reptlrow:hover{background:#0B2F77;}
.reptlrow.on{background:rgba(255,194,71,.07);border:1px solid rgba(255,194,71,.15);}
.reptlpos{font-family:'Space Grotesk',sans-serif;font-size:7.5px;color:#6F81A8;width:24px;flex-shrink:0;}
.reptlev{font-family:'Inter',sans-serif;font-size:8.5px;padding:1px 6px;border-radius:4px;background:#071B44;}
.repcur{padding:7px 13px;border-top:1px solid #152D6E;display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:11px;}

/* Villain stats panel */
.vstats{
  display:flex;gap:6px;flex-wrap:wrap;
  padding:6px 10px;background:rgba(155,92,255,.05);
  border-top:1px solid rgba(155,92,255,.12);
}
.vstat-pill{
  padding:2px 8px;border-radius:20px;
  font-family:'Inter',sans-serif;font-size:9px;font-weight:700;
  background:rgba(155,92,255,.1);color:#9B5CFF;border:1px solid rgba(155,92,255,.2);
}

/* Format badge */
.fmt-badge{
  padding:3px 10px;border-radius:20px;font-family:'Space Grotesk',sans-serif;
  font-size:8px;font-weight:700;letter-spacing:.06em;border:1px solid;
}
.fmt-cash{background:rgba(16,216,122,.1);color:#10D87A;border-color:rgba(16,216,122,.25);}
.fmt-mtt{background:rgba(31,139,255,.1);color:#1F8BFF;border-color:rgba(31,139,255,.25);}

/* API key input */
.apikey-box{
  background:rgba(255,194,71,.04);border:1px solid rgba(255,194,71,.18);
  border-radius:8px;padding:10px 13px;margin-bottom:10px;
  display:flex;align-items:center;gap:8px;
}
.apikey-input{
  flex:1;background:#030712;border:1px solid #1A3A80;color:#FFFFFF;
  border-radius:6px;padding:6px 10px;font-size:10.5px;outline:none;
  font-family:'JetBrains Mono',monospace;
}
.apikey-input:focus{border-color:#FFC247;}
.apikey-input::placeholder{color:#6F81A8;}

/* Hand listing */
.hand-listing{background:#071B44;border:1px solid #152D6E;border-radius:10px;overflow:hidden;}
.hand-listing-hdr{
  padding:8px 13px;background:#050E28;border-bottom:1px solid #152D6E;
  display:flex;align-items:center;justify-content:space-between;
}
.action-row{
  display:flex;align-items:center;gap:6px;padding:5px 13px;
  border-bottom:1px solid #0F2258;font-size:10.5px;cursor:pointer;
  transition:background .1s;
}
.action-row:last-child{border:none;}
.action-row:hover{background:#071B44;}
.action-row.active{background:rgba(255,194,71,.06);border-left:2px solid #FFC247;}
.action-row.hero{background:rgba(255,194,71,.03);}
.action-row.error{background:rgba(255,69,96,.04);}
.ar-street{font-size:7.5px;font-family:'Space Grotesk',sans-serif;color:#6F81A8;width:20px;flex-shrink:0;}
.ar-player{font-family:'Inter',sans-serif;font-size:9.5px;font-weight:700;min-width:48px;color:#9FB0CC;}
.ar-action{font-family:'Inter',sans-serif;font-size:11px;font-weight:700;flex:1;}
.ar-ev{font-family:'Inter',sans-serif;font-size:9px;padding:1px 6px;border-radius:4px;background:#071B44;}
.ar-note{font-size:9px;color:#9FB0CC;width:100%;padding-top:2px;}

/* AI analysis */
.aitip{background:#071B44;border:1px solid #1A3A80;border-radius:8px;padding:12px;font-size:11px;color:#9FB0CC;line-height:1.78;}
.aitip::before{content:'⚡ PokerForge AI';font-size:8.5px;color:#FFC247;letter-spacing:.12em;display:block;margin-bottom:7px;font-family:'Space Grotesk',sans-serif;}
.aidot{width:7px;height:7px;border-radius:50%;background:#FFC247;animation:aid 1.2s infinite;display:inline-block;margin:0 2px;}
.aidot:nth-child(2){animation-delay:.2s;}.aidot:nth-child(3){animation-delay:.4s;}
@keyframes aid{0%,80%,100%{transform:scale(.5);opacity:.3;}40%{transform:scale(1);opacity:1;}}
.handit{padding:8px 12px;background:#071B44;border:1px solid #1A3A80;border-radius:7px;cursor:pointer;transition:all .12s;display:flex;align-items:center;gap:8px;font-size:10.5px;margin-bottom:5px;}
.handit:hover{border-color:#2E6CFF;}
.handit.on{border-color:#FFC247;background:rgba(255,194,71,.06);}

/* Barre filtres mobile — cachée par défaut (desktop) */
.mob-filter-bar{display:none;align-items:center;gap:8px;padding:6px 10px;background:#030712;border-bottom:1px solid #152D6E;flex-shrink:0;}
.mob-filter-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;font-size:10px;font-weight:700;border:1px solid #1A3A80;color:#9FB0CC;background:#071B44;cursor:pointer;font-family:'Inter',sans-serif;letter-spacing:.04em;transition:all .12s;}
.mob-filter-btn.on{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.35);}

/* ═══════════════════════════════════════════════════════
   RESPONSIVE MOBILE — max-width: 768px
════════════════════════════════════════════════════════ */

/* ─── HEADER MOBILE ─────────────────────────────────── */
@media(max-width:768px){
  .hdr{height:48px;padding:0 10px;gap:8px;}
  .logo-full-wrap{display:none;}
  .logo-compact-wrap{display:flex;}
  .hdr-sep{display:none;}
  .nav{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;flex-shrink:1;min-width:0;}
  .nav::-webkit-scrollbar{display:none;}
  .ntab{padding:5px 10px;font-size:10px;white-space:nowrap;flex-shrink:0;}
  .hdrbadge{display:none;}
  .utog{font-size:8px;padding:3px 7px;}

  /* ─── LAYOUT MOBILE ─────────────────────────────────── */
  .body{flex-direction:column;}
  .sidebar{
    display:none; /* cachée par défaut — le bouton "Filtres" l'affiche */
  }
  .sidebar.mob-open{
    display:flex;flex-direction:column;
    width:100%;max-height:60vh;overflow-y:auto;
    border-right:none;border-bottom:1px solid #152D6E;
    position:fixed;top:48px;left:0;right:0;z-index:50;
    background:#071B44;box-shadow:0 8px 32px rgba(0,0,0,.7);
  }
  .mob-filter-bar{
    display:flex!important;align-items:center;gap:8px;padding:6px 10px;
    background:#030712;border-bottom:1px solid #152D6E;flex-shrink:0;
  }
  .mob-filter-btn{
    display:inline-flex;align-items:center;gap:5px;
    padding:5px 12px;border-radius:6px;font-size:10px;font-weight:700;
    border:1px solid #1A3A80;color:#9FB0CC;background:#071B44;cursor:pointer;
    font-family:'Inter',sans-serif;letter-spacing:.04em;transition:all .12s;
  }
  .main{width:100%;}
  /* Afficher la barre filtres mobile */
  .mob-filter-bar{display:flex!important;}

  /* ─── DASHBOARD MOBILE ──────────────────────────────── */
  .dash{padding:10px 12px;}
  .dg4{grid-template-columns:repeat(2,1fr);gap:7px;margin-bottom:10px;}
  .dg3{grid-template-columns:repeat(2,1fr);gap:7px;}
  .dg2{grid-template-columns:1fr 1fr;gap:7px;}
  .dg21{grid-template-columns:1fr;gap:7px;}
  .mc-v{font-size:18px;}
  .qa-grid{grid-template-columns:1fr 1fr;}
  .wchart{height:40px;}
  .streak-num{font-size:26px;}
  .streak-days{flex-wrap:wrap;}
  .streak-day{width:18px;height:18px;font-size:7px;}

  /* ─── TRAINER / TABLE MOBILE ────────────────────────── */
  .grid1,.grid2,.grid3,.grid4,.grid6,.grid8{grid-template-columns:minmax(0,1fr)!important;gap:8px;padding:8px;}
  .tlbar{padding:5px 8px;gap:4px;}
  .tlact{font-size:7.5px;padding:2px 5px;}
  .tlpos{font-size:8px;}

  /* Action buttons — plus grands pour tactile */
  .az{padding:8px 6px;}
  .ab{padding:11px 4px;font-size:11px;min-height:52px;border-radius:10px;}
  .ab-sub{font-size:8px;}
  .ag3{grid-template-columns:repeat(3,1fr);gap:4px;}
  .ag2{grid-template-columns:repeat(2,1fr);gap:4px;}
  .nextrow{padding:7px 8px;gap:5px;}
  .btn{font-size:11px;padding:9px 14px;}
  .btng{font-size:11px;padding:9px 14px;}

  /* EV grid */
  .evgrid{padding:7px 6px;}
  .evg3{grid-template-columns:repeat(3,1fr);gap:3px;}
  .evg2{grid-template-columns:repeat(2,1fr);gap:3px;}
  .evcell{padding:6px 5px;}
  .evlbl{font-size:8.5px;}

  /* Solution box */
  .solbox{margin:5px 6px;}
  .solhdr{padding:7px 10px;font-size:10.5px;}
  .solbody{padding:7px 10px;font-size:10px;}
  .blbox{margin:0 6px 6px;}
  .blbody{padding:8px 10px;}
  .bltxt{font-size:10px;}

  /* Villain zone */
  .vzone{padding:6px 8px;gap:6px;}
  .vzone-note{font-size:10px;}

  /* ─── 1T TABLE MOBILE ───────────────────────────────── */
  /* Seats légèrement plus petits */
  .seat1t .seatpos{font-size:11px!important;}
  .seat1t .seatstk{font-size:10px!important;}
  .seat1t .seatname{font-size:9px!important;}

  /* Street indicator */
  .streetind{padding:4px 8px;}
  .stind{font-size:8px;padding:2px 7px;}

  /* ─── SESSION END MOBILE ────────────────────────────── */
  .se{padding:20px 12px;gap:10px;}
  .sescore{font-size:40px;}
  .segrid{grid-template-columns:repeat(3,1fr);gap:7px;max-width:100%;}
  .sebox{padding:10px;}
  .sev{font-size:16px;}
  .errit{font-size:10px;padding:8px 10px;}

  /* ─── REPLAYER MOBILE ───────────────────────────────── */
  .repwrap{padding:10px 12px;}
  .repup{padding:16px;font-size:11.5px;}
  .rephh{font-size:9px;}
  .repvishdr{padding:8px 10px;}
  .repstab{font-size:8.5px;padding:3px 7px;}
  .repcur{padding:6px 10px;font-size:10.5px;}
  .reptl{padding:0 10px 8px;}
  .reptlrow{font-size:10px;padding:4px 6px;}
  .repctrls{padding:7px 10px;gap:4px;}

  /* ─── COACH MOBILE ──────────────────────────────────── */
  .coach-nav{padding:0 10px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .coach-nav::-webkit-scrollbar{display:none;}
  .coach-ntab{padding:9px 12px;font-size:10px;white-space:nowrap;flex-shrink:0;}
  .coach-body{padding:14px 14px;}
  .cs-header{padding:14px 16px;}

  /* Calculateur */
  .calc-card{padding:14px 14px;}
  .calc-row{flex-direction:column;align-items:flex-start;gap:6px;}
  .calc-label{min-width:unset;}
  .calc-input{width:100%;}
  .calc-big{font-size:22px;}

  /* Lexique */
  .lex-search{font-size:11.5px;padding:8px 12px;}

  /* Articles théorie */
  .art-banner{height:52px;padding:0 12px;gap:10px;}
  .art-ico{font-size:20px;}
  .art-title{font-size:10px;}
  .art-body{padding:12px 14px;}
  .art-p{font-size:10.5px;}

  /* Range grid */
  .range-grid{gap:0;}
  .rg-cell{font-size:5.5px;}

  /* Slideshows */
  .poker-slideshow{height:90px;}
  .slide-caption{font-size:8px;left:12px;}

  /* ─── BIBLIOTHÈQUE MOBILE ───────────────────────────── */
  .lib-grid{grid-template-columns:1fr!important;}

  /* Errors toast */
  .error-toast{top:56px;right:10px;left:10px;font-size:11px;padding:9px 12px;}
}

/* ─── SMALL PHONES (≤480px) ─────────────────────────── */
@media(max-width:480px){
  .hdr{height:44px;padding:0 8px;}
  .brand{font-size:11px;letter-spacing:1.5px;}
  .ntab{padding:4px 8px;font-size:9.5px;}
  .dg4{grid-template-columns:repeat(2,1fr);gap:6px;}
  .mc-v{font-size:16px;}
  .dash{padding:8px 8px;}
  .sescore{font-size:36px;}
  .ab{font-size:10.5px;min-height:48px;padding:10px 3px;}
  .segrid{gap:6px;}
  .sebox{padding:8px;}
  .coach-body{padding:10px 10px;}
  .coach-ntab{padding:8px 10px;font-size:9.5px;}
  .calc-big{font-size:20px;}
  .calc-verdict{font-size:11px;}
  .streak-num{font-size:22px;}
  .streak-fire{font-size:24px;}
  .seat1t .seatpos{font-size:10px!important;}
  .seat1t .seatstk{font-size:9px!important;}
}

/* ─── DEALER BUTTON MOBILE ──────────────────────────── */
@media(max-width:768px){
  .dealer-btn{width:16px!important;height:16px!important;font-size:8px!important;}
  .dealer-btn-sm{width:12px!important;height:12px!important;font-size:6px!important;}
}

/* ─── MOBILE SAFE AREA (iPhone notch) ───────────────── */
@supports(padding-bottom:env(safe-area-inset-bottom)){
  @media(max-width:768px){
    .az,.nextrow{padding-bottom:calc(8px + env(safe-area-inset-bottom));}
  }
}

/* ═══════════════════════════════════════════════════════
   NOUVEAU THÈME — PokerForge Blue Steel v8
   Palette : Bleu Nuit · Marine · Royal · Métal
════════════════════════════════════════════════════════ */

/* ─── RESET & BASE ──────────────────────────────────── */
body{background:#030712!important;}
body::before{
  background:
    radial-gradient(ellipse 80% 60% at 0% 0%,rgba(31,139,255,.06) 0%,transparent 55%),
    radial-gradient(ellipse 60% 50% at 100% 0%,rgba(155,92,255,.05) 0%,transparent 50%),
    radial-gradient(ellipse 70% 50% at 50% 100%,rgba(52,216,255,.04) 0%,transparent 55%)!important;
}

/* ─── HEADER ────────────────────────────────────────── */
.hdr{
  height:58px!important;
  background:linear-gradient(90deg,#030712 0%,#071B44 50%,#030712 100%)!important;
  border-bottom:1px solid #1A3A80!important;
  box-shadow:0 1px 0 rgba(31,139,255,.15),0 4px 32px rgba(3,7,18,.8)!important;
}
.hdr::after{
  background:linear-gradient(90deg,transparent,rgba(31,139,255,.3),rgba(155,92,255,.2),transparent)!important;
}
.hdr::before{
  background:repeating-linear-gradient(90deg,transparent 0px,transparent 3px,rgba(31,139,255,.015) 3px,rgba(31,139,255,.015) 4px)!important;
}
.brand{
  font-family:'Space Grotesk',sans-serif!important;
  font-size:18px!important;font-weight:800!important;
  letter-spacing:3px!important;color:#FFFFFF!important;
  text-shadow:0 0 24px rgba(31,139,255,.6),0 0 48px rgba(31,139,255,.25)!important;
  background:linear-gradient(90deg,#8DA9D7,#C9D4E8,#F7FAFF)!important;
  -webkit-background-clip:text!important;-webkit-text-fill-color:transparent!important;
  background-clip:text!important;
}
.brand-sub{
  font-family:'Space Grotesk',sans-serif!important;
  font-size:7px!important;color:#6F81A8!important;
  letter-spacing:5px!important;font-weight:500!important;
  -webkit-text-fill-color:#6F81A8!important;
}
.ntab{
  font-family:'Inter',sans-serif!important;
  font-size:12px!important;font-weight:500!important;
  padding:6px 14px!important;color:#9FB0CC!important;
  border-bottom:2px solid transparent!important;
  letter-spacing:.01em!important;
  transition:all .18s!important;
}
.ntab:hover{color:#FFFFFF!important;background:rgba(31,139,255,.06)!important;}
.ntab.on{
  color:#FFFFFF!important;border-bottom-color:#1F8BFF!important;
  text-shadow:0 0 14px rgba(31,139,255,.5)!important;
}
.hdr-sep{background:linear-gradient(180deg,transparent,#1A3A80,transparent)!important;}
.utog{
  font-family:'Space Grotesk',sans-serif!important;
  font-size:10px!important;border:1px solid #1A3A80!important;
  color:#6F81A8!important;background:rgba(7,27,68,.6)!important;
  border-radius:6px!important;transition:all .15s!important;
}
.utog.on{
  background:rgba(31,139,255,.15)!important;color:#1F8BFF!important;
  border-color:rgba(31,139,255,.5)!important;
  box-shadow:0 0 12px rgba(31,139,255,.2)!important;
}
.hdrbadge{font-family:'JetBrains Mono',monospace!important;font-size:9.5px!important;}

/* ─── LEFT NAV SIDEBAR ───────────────────────────────── */
/* ── Left nav premium — SVG icons ── */
.leftnav{
  width:72px;flex-shrink:0;
  background:linear-gradient(180deg,#030D20 0%,#040B1C 100%);
  border-right:1px solid rgba(26,58,128,.4);
  display:flex;flex-direction:column;align-items:center;
  padding:12px 0 8px;gap:3px;overflow:visible;
  box-shadow:inset -1px 0 0 rgba(31,139,255,.06),2px 0 20px rgba(3,7,18,.4);
  position:relative;z-index:20;
}
.leftnav::after{
  content:'';position:absolute;top:0;right:0;bottom:0;width:1px;
  background:linear-gradient(180deg,transparent 0%,rgba(74,144,255,.2) 40%,rgba(155,92,255,.12) 70%,transparent 100%);
}
.lnav-item{
  width:54px;height:54px;border-radius:13px;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;position:relative;overflow:visible;
  border:1px solid transparent;
  /* transitions gérées inline via React state */
}
/* Désactiver les anciens états CSS (gérés par React maintenant) */
.lnav-item.on{background:transparent!important;border:transparent!important;box-shadow:none!important;}
.lnav-item.on::before{display:none!important;}
.lnav-ico{font-size:18px;line-height:1;}
.lnav-lbl{font-family:'Inter',sans-serif;font-size:7px;font-weight:600;letter-spacing:.03em;text-align:center;line-height:1.2;}
.lnav-sep{width:32px;height:1px;background:linear-gradient(90deg,transparent,#1A3A80,transparent);margin:4px 0;}
.lnav-bottom{margin-top:auto;}

/* ─── LAYOUT ─────────────────────────────────────────── */
.body{flex:1;display:flex;overflow:hidden;}
.sidebar{
  width:220px!important;
  background:linear-gradient(180deg,#071B44 0%,#030D2A 100%)!important;
  border-right:1px solid #1A3A80!important;
}
.main{flex:1;overflow-y:auto;}

/* ─── PANELS & CARTES ────────────────────────────────── */
.mc{
  background:linear-gradient(135deg,#071B44 0%,#050E28 100%)!important;
  border:1px solid #1A3A80!important;border-radius:12px!important;
}
.mc::before{height:2px!important;}
.mc-gold::before{background:linear-gradient(90deg,#FFC247,#FFD98A,#FFC247)!important;}
.mc-green::before{background:linear-gradient(90deg,#0aaa62,#10D87A,#0aaa62)!important;}
.mc-blue::before{background:linear-gradient(90deg,#1165c0,#1F8BFF,#1165c0)!important;}
.mc-purple::before{background:linear-gradient(90deg,#7030b8,#9B5CFF,#7030b8)!important;}
.mc-red::before{background:linear-gradient(90deg,#c02040,#FF4560,#c02040)!important;}
.mc-v{font-family:'JetBrains Mono',monospace!important;font-size:24px!important;}
.mc-l{font-family:'Inter',sans-serif!important;font-size:9px!important;color:#6F81A8!important;letter-spacing:.06em!important;}
.mc-ico{opacity:.08!important;}
.pcard{background:linear-gradient(135deg,#071B44,#050E28)!important;border:1px solid #1A3A80!important;border-radius:12px!important;}

/* ─── TABLE WRAPPER ─────────────────────────────────── */
.tw{
  background:linear-gradient(135deg,#071B44 0%,#050E28 100%)!important;
  border:1px solid #1A3A80!important;border-radius:14px!important;
  box-shadow:0 4px 24px rgba(3,7,18,.6),0 0 0 1px rgba(31,139,255,.04)!important;
  animation:borderGlowBlue 5s infinite!important;
}
@keyframes borderGlowBlue{
  0%,100%{box-shadow:0 4px 24px rgba(3,7,18,.6),0 0 0 1px rgba(31,139,255,.06);}
  50%{box-shadow:0 4px 32px rgba(3,7,18,.7),0 0 0 1px rgba(155,92,255,.1),0 0 20px rgba(31,139,255,.08);}
}

/* ─── SIDEBAR TRAINER ────────────────────────────────── */
.sb{padding:12px 12px 8px!important;}
.sblbl{
  font-family:'Inter',sans-serif!important;font-size:9px!important;
  color:#6F81A8!important;letter-spacing:.18em!important;font-weight:600!important;
}
.sblbl::after{background:linear-gradient(90deg,#1A3A80,transparent)!important;}
.pfsel{
  background:#030D2A!important;border:1px solid #1A3A80!important;
  color:#FFFFFF!important;font-family:'Inter',sans-serif!important;
}
.pfsel:focus{border-color:#1F8BFF!important;box-shadow:0 0 0 2px rgba(31,139,255,.12)!important;}
.pftog{
  font-family:'Inter',sans-serif!important;font-size:9.5px!important;
  border:1px solid #1A3A80!important;color:#9FB0CC!important;
  background:#071B44!important;border-radius:20px!important;
}
.pftog:hover{border-color:#1F8BFF!important;color:#FFFFFF!important;}
.pftog.on{background:rgba(31,139,255,.15)!important;color:#1F8BFF!important;border-color:rgba(31,139,255,.4)!important;}
.smpill{
  border:1px solid #152D6E!important;background:#030D2A!important;
  border-radius:9px!important;
}
.smpill:hover{border-color:#1A3A80!important;background:#071B44!important;}
.smpill.on{
  background:rgba(31,139,255,.08)!important;
  border-color:rgba(31,139,255,.35)!important;
  box-shadow:0 0 14px rgba(31,139,255,.1)!important;
}
.smn{font-family:'Inter',sans-serif!important;font-size:11px!important;font-weight:600!important;}
.smsub{font-size:8px!important;color:#6F81A8!important;}
.smnum{font-family:'JetBrains Mono',monospace!important;font-size:13px!important;}
.mtbtn{
  font-family:'Space Grotesk',sans-serif!important;font-size:10px!important;
  border:1px solid #152D6E!important;color:#4A6090!important;
  background:#030D2A!important;border-radius:8px!important;
}
.mtbtn:hover{border-color:#1A3A80!important;color:#FFFFFF!important;}
.mtbtn.on{
  background:rgba(31,139,255,.12)!important;color:#1F8BFF!important;
  border-color:rgba(31,139,255,.4)!important;
  box-shadow:0 0 10px rgba(31,139,255,.15)!important;
}
.statbox{background:#030D2A!important;border:1px solid #152D6E!important;border-radius:8px!important;}
.statbox:hover{border-color:#1A3A80!important;}
.statv{font-family:'JetBrains Mono',monospace!important;font-size:16px!important;}
.statl{font-size:8px!important;color:#6F81A8!important;letter-spacing:.06em!important;}
.progf{background:linear-gradient(90deg,#1F8BFF,#34D8FF)!important;box-shadow:0 0 8px rgba(31,139,255,.4)!important;}

/* ─── ACTION BUTTONS ─────────────────────────────────── */
.ab{font-family:'Inter',sans-serif!important;font-size:10px!important;font-weight:600!important;border-radius:10px!important;}
.ab-FOLD{background:linear-gradient(135deg,#1a0410,#120308)!important;color:#FF7090!important;border:1px solid #3a0820!important;}
.ab-CALL{background:linear-gradient(135deg,#041a10,#031208)!important;color:#40E890!important;border:1px solid #0a3820!important;}
.ab-CHECK{background:linear-gradient(135deg,#0a1a06,#071204)!important;color:#90D050!important;border:1px solid #183210!important;}
.ab-RAISE{background:linear-gradient(135deg,#041228,#020c1c)!important;color:#60A8E8!important;border:1px solid #0c2850!important;}
.ab-BET33,.ab-BET50,.ab-BET75,.ab-BET100{background:linear-gradient(135deg,#1a1204,#120c00)!important;border:1px solid #382808!important;}
.ab-BET33{color:#FFC247!important;}
.ab-BET50{color:#F0A830!important;}
.ab-BET75{color:#E09020!important;}
.ab-BET100{color:#D07810!important;}
.ab-ALLIN{background:linear-gradient(135deg,#1a0408,#120204)!important;color:#FF6060!important;border:1px solid #3a0808!important;}
.ab-3BET{background:linear-gradient(135deg,#100a28,#080418)!important;color:#A870E8!important;border:1px solid #201040!important;}
.ab:hover:not(:disabled){filter:brightness(1.2)!important;transform:translateY(-2px)!important;box-shadow:0 6px 18px rgba(0,0,0,.4)!important;}
.btn{font-family:'Inter',sans-serif!important;font-weight:600!important;}
.btng{
  background:linear-gradient(135deg,#1F8BFF,#34D8FF)!important;
  color:#FFFFFF!important;font-size:12px!important;
  box-shadow:0 4px 18px rgba(31,139,255,.35)!important;
}
.btng:hover{box-shadow:0 6px 24px rgba(31,139,255,.5)!important;}
.btns{background:#071B44!important;color:#9FB0CC!important;font-size:11px!important;border:1px solid #1A3A80!important;}
.btns:hover{color:#FFFFFF!important;border-color:#2E6CFF!important;}
.btnx{background:transparent!important;color:#1F8BFF!important;border:1px solid rgba(31,139,255,.3)!important;}
.btnx:hover{background:rgba(31,139,255,.08)!important;}

/* ─── TAGS ───────────────────────────────────────────── */
.tag-g{background:rgba(16,216,122,.1)!important;color:#10D87A!important;border-color:rgba(16,216,122,.25)!important;}
.tag-gold{background:rgba(255,194,71,.1)!important;color:#FFC247!important;border-color:rgba(255,194,71,.25)!important;}
.tag-b{background:rgba(31,139,255,.1)!important;color:#1F8BFF!important;border-color:rgba(31,139,255,.25)!important;}
.tag-r{background:rgba(255,69,96,.1)!important;color:#FF4560!important;border-color:rgba(255,69,96,.25)!important;}
.tag-p{background:rgba(155,92,255,.1)!important;color:#9B5CFF!important;border-color:rgba(155,92,255,.25)!important;}
.tag-c{background:rgba(52,216,255,.08)!important;color:#34D8FF!important;border-color:rgba(52,216,255,.2)!important;}

/* ─── DASHBOARD ─────────────────────────────────────── */
.dash{padding:16px 22px!important;background:#030712!important;}
.dash-title{font-family:'Inter',sans-serif!important;font-size:9px!important;color:#6F81A8!important;letter-spacing:.2em!important;font-weight:600!important;}
.dash-title::after{background:linear-gradient(90deg,#1A3A80,transparent)!important;}
.dg4,.dg3,.dg2,.dg21{gap:10px!important;margin-bottom:14px!important;}
.pcard-h{font-family:'Inter',sans-serif!important;font-size:9px!important;color:#6F81A8!important;letter-spacing:.18em!important;}
.pcard-h::after{background:linear-gradient(90deg,#1A3A80,transparent)!important;}
.streak-box{
  background:linear-gradient(135deg,rgba(255,194,71,.08),rgba(31,139,255,.05))!important;
  border:1px solid rgba(255,194,71,.2)!important;
}
.streak-num{font-family:'JetBrains Mono',monospace!important;font-size:36px!important;color:#FFC247!important;text-shadow:0 0 24px rgba(255,194,71,.4)!important;}
.streak-day{border:1px solid #152D6E!important;}
.streak-day.done{background:rgba(255,194,71,.15)!important;border-color:rgba(255,194,71,.35)!important;color:#FFC247!important;}
.streak-day.today{background:rgba(255,194,71,.28)!important;border-color:#FFC247!important;color:#FFC247!important;}
.wbar{border-radius:4px 4px 0 0!important;}
.goal-check.done{background:rgba(16,216,122,.15)!important;border-color:#10D87A!important;color:#10D87A!important;}
.qa-btn{
  background:linear-gradient(135deg,#071B44,#040E28)!important;
  border:1px solid #1A3A80!important;border-radius:10px!important;
}
.qa-btn:hover{border-color:#2E6CFF!important;box-shadow:0 4px 20px rgba(31,139,255,.15)!important;}
.leak-icon{background:rgba(255,69,96,.08)!important;border:1px solid rgba(255,69,96,.18)!important;}
.leak-bar-wrap{background:#152D6E!important;}

/* ─── EVENTS & NEWS ─────────────────────────────────── */
.evcard{background:#071B44!important;border:1px solid #152D6E!important;border-radius:8px!important;}
.evcard:hover{border-color:#1A3A80!important;background:#0B2F77!important;}
.evcard-date{font-family:'JetBrains Mono',monospace!important;font-size:8px!important;color:#FFC247!important;}
.newsrow{border-bottom:1px solid #0F2258!important;}
.newstitle:hover{color:#1F8BFF!important;}
.newsmeta{color:#4A6090!important;}

/* ─── SLIDESHOW BANNER ───────────────────────────────── */
.poker-slideshow{
  height:160px!important;
  border-bottom:1px solid #1A3A80!important;
  box-shadow:0 4px 32px rgba(3,7,18,.8)!important;
}
.slide-overlay{
  background:linear-gradient(0deg,rgba(3,7,18,.9) 0%,rgba(7,27,68,.4) 50%,rgba(3,7,18,.3) 100%)!important;
}
.slide-caption{font-family:'Space Grotesk',sans-serif!important;font-size:10px!important;letter-spacing:.18em!important;color:rgba(199,212,232,.8)!important;}
.slide-dot.on{background:#1F8BFF!important;}

/* ─── REPLAYER ───────────────────────────────────────── */
.repwrap{background:#030712!important;}
.repvis{background:#040B1F!important;border:1px solid #1A3A80!important;}
.repup{border:2px dashed #1A3A80!important;color:#6F81A8!important;}
.repup:hover{border-color:#1F8BFF!important;color:#9FB0CC!important;background:rgba(31,139,255,.03)!important;}
.rephh{border:1px solid #1A3A80!important;background:#030712!important;color:#9FB0CC!important;}
.rephh:focus{border-color:#FFC247!important;box-shadow:0 0 0 2px rgba(255,194,71,.08)!important;}
.repstab.on{background:rgba(31,139,255,.12)!important;color:#1F8BFF!important;border-color:rgba(31,139,255,.35)!important;}
.reptlrow:hover{background:#0B2F77!important;}
.reptlrow.on{background:rgba(31,139,255,.07)!important;border:1px solid rgba(31,139,255,.15)!important;}
.repctrl{background:#071B44!important;border:1px solid #1A3A80!important;color:#9FB0CC!important;}
.repctrl:hover{color:#FFFFFF!important;border-color:#2E6CFF!important;}
.repctrl.on{background:rgba(31,139,255,.12)!important;color:#1F8BFF!important;border-color:rgba(31,139,255,.35)!important;}

/* ─── RANGE GRID ─────────────────────────────────────── */
.rg-raise{background:rgba(255,184,0,.86)!important;}
.rg-call{background:rgba(32,207,255,.78)!important;}
.rg-fold{background:rgba(42,16,24,.82)!important;}
.rg-mix-rc{background:linear-gradient(135deg,rgba(255,184,0,.86) 50%,rgba(32,207,255,.78) 50%)!important;}
.rg-mix-rf{background:linear-gradient(135deg,rgba(255,184,0,.86) 50%,rgba(42,16,24,.82) 50%)!important;}
.rg-mix-cf{background:linear-gradient(135deg,rgba(32,207,255,.78) 50%,rgba(42,16,24,.82) 50%)!important;}

/* ─── COACH ──────────────────────────────────────────── */
.coach{background:#030712!important;}
.coach-nav{background:#040B1F!important;border-bottom:1px solid #1A3A80!important;}
.coach-ntab{font-family:'Inter',sans-serif!important;font-size:11px!important;font-weight:600!important;color:#4A6090!important;}
.coach-ntab:hover{color:#9FB0CC!important;}
.coach-ntab.on{color:#1F8BFF!important;border-bottom-color:#1F8BFF!important;}
.coach-body{background:#030712!important;}
.cs-header{background:linear-gradient(135deg,rgba(31,139,255,.08),rgba(155,92,255,.05))!important;border-bottom:1px solid #1A3A80!important;}
.cs-progfill{background:linear-gradient(90deg,#9B5CFF,#1F8BFF)!important;}

/* ─── LEXIQUE ────────────────────────────────────────── */
.lex-search{background:#040B1F!important;border:1px solid #1A3A80!important;color:#FFFFFF!important;font-family:'Inter',sans-serif!important;}
.lex-search:focus{border-color:#1F8BFF!important;}
.lex-letter{font-family:'Space Grotesk',sans-serif!important;color:#1F8BFF!important;border-bottom:1px solid rgba(31,139,255,.15)!important;}
.lex-term:hover{background:#071B44!important;border-color:#1A3A80!important;}
.lex-term.open{background:#071B44!important;border-color:rgba(31,139,255,.25)!important;}
.lex-tag{background:rgba(155,92,255,.1)!important;color:#9B5CFF!important;border:1px solid rgba(155,92,255,.2)!important;}

/* ─── THÉORIE ARTICLES ───────────────────────────────── */
.art-card{background:#071B44!important;border:1px solid #1A3A80!important;border-radius:14px!important;}
.art-card:hover{border-color:#2E6CFF!important;box-shadow:0 8px 32px rgba(31,139,255,.12)!important;}
.art-title{font-family:'Space Grotesk',sans-serif!important;font-size:11px!important;color:#FFFFFF!important;}
.art-section{font-family:'Space Grotesk',sans-serif!important;color:#1F8BFF!important;letter-spacing:.12em!important;}
.art-key{background:rgba(31,139,255,.06)!important;border-left:3px solid #1F8BFF!important;}

/* ─── CALCULATEUR ────────────────────────────────────── */
.calc-card{background:#071B44!important;border:1px solid #1A3A80!important;border-radius:14px!important;}
.calc-input{background:#030712!important;border:1px solid #1A3A80!important;color:#FFFFFF!important;font-family:'JetBrains Mono',monospace!important;}
.calc-input:focus{border-color:#1F8BFF!important;}
.calc-result{background:linear-gradient(135deg,rgba(31,139,255,.1),rgba(52,216,255,.06))!important;border:1px solid rgba(31,139,255,.3)!important;border-radius:14px!important;}
.calc-big{font-family:'JetBrains Mono',monospace!important;color:#1F8BFF!important;}

/* ─── SESSION END ────────────────────────────────────── */
.sescore{font-family:'Space Grotesk',sans-serif!important;}
.segrade{font-family:'Inter',sans-serif!important;letter-spacing:.15em!important;}
.sebox{background:#071B44!important;border:1px solid #1A3A80!important;border-radius:10px!important;}
.sev{font-family:'JetBrains Mono',monospace!important;font-size:19px!important;}
.sel{font-size:8.5px!important;color:#6F81A8!important;}

/* ─── SOLUTION BOX ───────────────────────────────────── */
.sol-ok{background:rgba(16,216,122,.06)!important;border-color:rgba(16,216,122,.25)!important;}
.sol-ko{background:rgba(255,69,96,.05)!important;border-color:rgba(255,69,96,.22)!important;}
.blbox{background:#071B44!important;border:1px solid #1A3A80!important;}
.blhdr{background:rgba(255,194,71,.06)!important;border-bottom:1px solid #152D6E!important;color:#FFC247!important;}

/* ─── EV GRID ────────────────────────────────────────── */
.ev-ok{background:rgba(16,216,122,.07)!important;border-color:rgba(16,216,122,.28)!important;}
.ev-warn{background:rgba(255,194,71,.05)!important;border-color:rgba(255,194,71,.2)!important;}
.ev-bad{background:rgba(255,69,96,.05)!important;border-color:rgba(255,69,96,.15)!important;}

/* ─── TIMELINE ───────────────────────────────────────── */
.tlbar{background:#040B1F!important;border-bottom:1px solid #152D6E!important;}
.tlcur{background:rgba(155,92,255,.15)!important;color:#9B5CFF!important;border:1px solid rgba(155,92,255,.4)!important;}
.streetind{background:#040B1F!important;border-bottom:1px solid #152D6E!important;}
.stind.done{background:rgba(16,216,122,.1)!important;color:#10D87A!important;}
.stind.current{background:rgba(31,139,255,.12)!important;color:#1F8BFF!important;border:1px solid rgba(31,139,255,.3)!important;box-shadow:0 0 10px rgba(31,139,255,.15)!important;}
.stind.todo{background:#071B44!important;color:#4A6090!important;}

/* ─── VILLAIN ZONE ───────────────────────────────────── */
.vzone{background:rgba(155,92,255,.05)!important;border-top:1px solid rgba(155,92,255,.15)!important;}
.vzone-name{color:#9B5CFF!important;}
.az{background:#040B1F!important;border-top:1px solid #152D6E!important;}
.aztitle{color:#9FB0CC!important;}
.nextrow{background:#040B1F!important;border-top:1px solid #152D6E!important;}

/* ─── HAND LISTING ───────────────────────────────────── */
.hand-listing{background:#040B1F!important;border:1px solid #1A3A80!important;border-radius:12px!important;}
.hand-listing-hdr{background:#071B44!important;border-bottom:1px solid #1A3A80!important;}
.action-row:hover{background:#071B44!important;}
.action-row.active{background:rgba(31,139,255,.06)!important;border-left:2px solid #1F8BFF!important;}
.aitip{background:#071B44!important;border:1px solid #1A3A80!important;}
.aitip::before{color:#FFC247!important;font-family:'Space Grotesk',sans-serif!important;}

/* ─── BIBLIOTHÈQUE ───────────────────────────────────── */
.handit{background:#071B44!important;border:1px solid #1A3A80!important;}
.handit:hover{border-color:#2E6CFF!important;}
.handit.on{border-color:#FFC247!important;background:rgba(255,194,71,.06)!important;}

/* ─── API KEY BOX ────────────────────────────────────── */
.apikey-box{background:rgba(255,194,71,.04)!important;border:1px solid rgba(255,194,71,.18)!important;}
.apikey-input{background:#030712!important;border:1px solid #1A3A80!important;color:#FFFFFF!important;font-family:'JetBrains Mono',monospace!important;}
.apikey-input:focus{border-color:#FFC247!important;}

/* ─── ERROR TOAST ────────────────────────────────────── */
.error-toast{background:rgba(255,69,96,.95)!important;box-shadow:0 4px 24px rgba(255,69,96,.5)!important;}

/* ─── TIMER ──────────────────────────────────────────── */
.action-timer{background:#152D6E!important;}
.action-timer-bar{background:linear-gradient(90deg,#FF4560,#FFC247,#10D87A)!important;}
.action-timer-bar.urgent{background:linear-gradient(90deg,#FF4560,#FF7080)!important;}

/* ─── CHIP ANIMATION ─────────────────────────────────── */
.chip-fly span{background:linear-gradient(135deg,#1F8BFF,#34D8FF)!important;color:#FFFFFF!important;box-shadow:0 2px 12px rgba(31,139,255,.5)!important;}

/* ─── DEALER BUTTON ──────────────────────────────────── */
.dealer-btn{
  position:absolute;
  background:linear-gradient(135deg,#FFC247,#FFD98A)!important;
  color:#030712!important;
  font-family:'Space Grotesk',sans-serif!important;
  font-weight:800!important;
  box-shadow:0 2px 10px rgba(255,194,71,.5),0 0 20px rgba(255,194,71,.2)!important;
  animation:dealerPulse 2.5s infinite!important;
}

/* ─── RANGE POPUP ────────────────────────────────────── */
.seat-range-btn{
  background:rgba(31,139,255,.2)!important;
  color:#1F8BFF!important;
  border:1px solid rgba(31,139,255,.4)!important;
}
.seat-range-btn.vil{background:rgba(155,92,255,.2)!important;color:#9B5CFF!important;border-color:rgba(155,92,255,.4)!important;}

/* ─── SCROLL ─────────────────────────────────────────── */
::-webkit-scrollbar-thumb{background:#1A3A80!important;}
::-webkit-scrollbar-thumb:hover{background:#2E6CFF!important;}

/* ─── PROGRESS BARS ──────────────────────────────────── */
.pb{border-radius:3px!important;}
.ptr{background:#152D6E!important;}
.progt{background:#152D6E!important;}
.repprog{background:#152D6E!important;}
.repfill{background:linear-gradient(90deg,#1F8BFF,#34D8FF)!important;}
.cs-prog{background:#152D6E!important;}
.evbar{background:rgba(255,255,255,.04)!important;}
.freqbar{gap:1px!important;}

/* ─── VILLAIN STATS ──────────────────────────────────── */
.vstats{background:rgba(155,92,255,.05)!important;border-top:1px solid rgba(155,92,255,.12)!important;}
.vstat-pill{background:rgba(155,92,255,.1)!important;color:#9B5CFF!important;border:1px solid rgba(155,92,255,.2)!important;}

/* ─── STREET CHIP / BADGES ───────────────────────────── */
.street-chip{background:rgba(31,139,255,.08)!important;border:1px solid rgba(31,139,255,.2)!important;color:#1F8BFF!important;}
.street-chip::before{background:#1F8BFF!important;}
.fmt-cash{background:rgba(16,216,122,.1)!important;color:#10D87A!important;border-color:rgba(16,216,122,.25)!important;}
.fmt-mtt{background:rgba(31,139,255,.1)!important;color:#1F8BFF!important;border-color:rgba(31,139,255,.25)!important;}

/* ─── COMMUNITY PAGE ─────────────────────────────────── */
.evcard-dot{box-shadow:0 0 6px currentColor!important;}

/* ─── GLOBAL GLOW EFFECTS ────────────────────────────── */
@keyframes borderGlow{
  0%,100%{box-shadow:0 0 0 1px rgba(31,139,255,.1),inset 0 0 30px rgba(3,7,18,.5);}
  50%{box-shadow:0 0 0 1px rgba(155,92,255,.15),inset 0 0 30px rgba(3,7,18,.5);}
}

/* ═══════════════════════════════════════════════════════
   CARD FLIP ANIMATION
════════════════════════════════════════════════════════ */
@keyframes cardFlipReveal{
  0%{transform:scaleX(1);opacity:1;}
  40%{transform:scaleX(0);opacity:.6;}
  41%{transform:scaleX(0);opacity:.6;}
  100%{transform:scaleX(1);opacity:1;}
}
.card-back-anim{animation:cardBackFloat 2.5s ease-in-out infinite;}
@keyframes cardBackFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-3px);}}

/* ═══════════════════════════════════════════════════════
   SEAT VISUALS — Active player glow
════════════════════════════════════════════════════════ */
/* Hero actif */
@keyframes activeHeroRing{
  0%,100%{box-shadow:0 0 0 0 rgba(255,194,71,.8),0 0 22px rgba(255,194,71,.4);}
  50%{box-shadow:0 0 0 6px rgba(255,194,71,0),0 0 32px rgba(255,194,71,.6);}
}
/* Villain actif */
@keyframes activeVilRing{
  0%,100%{box-shadow:0 0 0 0 rgba(155,92,255,.8),0 0 18px rgba(155,92,255,.3);}
  50%{box-shadow:0 0 0 5px rgba(155,92,255,0),0 0 28px rgba(155,92,255,.5);}
}
.seat-active-hero{animation:activeHeroRing 1.4s ease-in-out infinite!important;}
.seat-active-vil{animation:activeVilRing 1.2s ease-in-out infinite!important;}
/* Joueur inactif : légèrement atténué */
.seat-inactive{opacity:.55;filter:saturate(.5);}

/* ═══════════════════════════════════════════════════════
   CHIP STACK VISUAL
════════════════════════════════════════════════════════ */
.chip-stack{
  display:flex;flex-direction:column-reverse;align-items:center;
  gap:-3px;position:absolute;
}
.chip-coin{
  width:16px;height:5px;border-radius:50%;border:1.5px solid;
  box-shadow:0 1px 3px rgba(0,0,0,.5);
  animation:chipPop .3s cubic-bezier(.34,1.56,.64,1) forwards;
}
.chip-pot-stack{
  position:absolute;display:flex;flex-direction:column;align-items:center;
  gap:-2px;pointer-events:none;
}

/* ═══════════════════════════════════════════════════════
   ACTION BADGE sous le siège
════════════════════════════════════════════════════════ */
.seat-action-badge{
  padding:4px 10px;border-radius:999px;font-size:9.5px;font-weight:900;
  font-family:'Inter',sans-serif;letter-spacing:.02em;white-space:nowrap;
  display:inline-flex;align-items:center;gap:4px;
  animation:badgePop .25s cubic-bezier(.34,1.56,.64,1);
  border:1px solid;
  box-shadow:0 5px 16px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);
  backdrop-filter:blur(8px);
}
.seat-action-badge.compact{font-size:7px;padding:2px 6px;}
@keyframes badgePop{0%{transform:scale(.6);opacity:0;}100%{transform:scale(1);opacity:1;}}
@keyframes fadeInUp{0%{opacity:0;transform:translateX(-50%) translateY(12px);}100%{opacity:1;transform:translateX(-50%) translateY(0);}}
.action-fold{background:rgba(255,69,96,.14);color:#FF6080;border-color:rgba(255,69,96,.3);}
.action-call{background:rgba(16,216,122,.12);color:#10D87A;border-color:rgba(16,216,122,.28);}
.action-check{background:rgba(159,176,204,.1);color:#9FB0CC;border-color:rgba(159,176,204,.2);}
.action-raise,.action-bet{background:rgba(31,139,255,.14);color:#1F8BFF;border-color:rgba(31,139,255,.3);}
.action-3bet{background:rgba(155,92,255,.14);color:#9B5CFF;border-color:rgba(155,92,255,.3);}
.action-allin{background:rgba(255,69,96,.2);color:#FF4560;border-color:rgba(255,69,96,.5);animation:badgePop .25s cubic-bezier(.34,1.56,.64,1),urgentPulse .5s infinite;}
.action-thinking{background:rgba(155,92,255,.14);color:#c090ff;border-color:rgba(155,92,255,.32);}
.action-hero-turn{background:rgba(255,194,71,.16);color:#FFC247;border-color:rgba(255,194,71,.42);}
.pf-player-seat .seat-action-badge{
  background:transparent!important;
  border-color:transparent!important;
  box-shadow:none!important;
  backdrop-filter:none!important;
  padding:1px 4px!important;
}
.pf-player-seat[data-seat="BB"] .seat-action-badge,
.pf-player-seat[data-seat="SB"] .seat-action-badge{
  transform:translateX(22px)!important;
}
.pf-player-seat[data-seat="BTN"] .seat-action-badge{
  transform:translateX(14px)!important;
}
.table-action-line{
  position:absolute;left:50%;bottom:7%;transform:translateX(-50%);
  max-width:78%;padding:3px 9px;border-radius:7px;
  background:rgba(3,7,18,.72);border:1px solid rgba(31,139,255,.22);
  color:#C9D4E8;font-family:'Inter',sans-serif;font-size:9px;font-weight:700;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:28;
  box-shadow:0 5px 18px rgba(0,0,0,.38);
}
.table-action-line strong{color:#FFC247;font-weight:800;}
.table-action-line.compact{bottom:4%;font-size:7.5px;max-width:72%;padding:2px 6px;border-radius:5px;}
.pot-delta{
  position:absolute;left:50%;transform:translate(-50%,-50%);
  color:#10D87A;background:rgba(16,216,122,.13);border:1px solid rgba(16,216,122,.34);
  border-radius:8px;padding:2px 7px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:900;
  z-index:34;pointer-events:none;animation:potDeltaUp .72s ease-out forwards;
  text-shadow:0 0 10px rgba(16,216,122,.35);
}
@keyframes potDeltaUp{0%{opacity:0;transform:translate(-50%,2px) scale(.86);}20%{opacity:1;}100%{opacity:0;transform:translate(-50%,-22px) scale(1.08);}}
.chip-animation{
  position:absolute;left:var(--from-x);top:var(--from-y);z-index:45;pointer-events:none;
  display:flex;flex-direction:column;align-items:center;gap:2px;
  animation:chipFlyToPot .68s cubic-bezier(.22,.68,.36,1) forwards;
}
.chip-animation span{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:24px;height:18px;padding:0 7px;border-radius:99px;
  background:linear-gradient(135deg,#FFC247,#D4891A);color:#030712;
  font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:900;
  box-shadow:0 3px 14px rgba(255,194,71,.45),inset 0 1px 0 rgba(255,255,255,.35);
  white-space:nowrap;
}
.chip-animation em{
  font-style:normal;font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:800;
  color:#f5e8b0;background:rgba(0,0,0,.45);border-radius:5px;padding:1px 5px;
}
.chip-from-villain span{background:linear-gradient(135deg,#C090FF,#7D3DCC);color:#fff;box-shadow:0 3px 14px rgba(155,92,255,.48);}
.chip-allin span{background:linear-gradient(135deg,#FF4560,#9F142A);color:#fff;animation:urgentPulse .5s ease-in-out infinite;}
@keyframes chipFlyToPot{
  0%{opacity:0;transform:translate(-50%,-50%) scale(.82);}
  12%{opacity:1;transform:translate(-50%,-50%) scale(1);}
  70%{opacity:.95;transform:translate(calc(50% - var(--from-x)),calc(50% - var(--from-y))) scale(.72);}
  100%{opacity:0;transform:translate(calc(50% - var(--from-x)),calc(50% - var(--from-y))) scale(.36);}
}
.hero-feedback-strip{
  display:flex;align-items:center;gap:7px;flex-wrap:wrap;
  padding:6px 9px;background:rgba(3,13,42,.78);border-top:1px solid rgba(31,139,255,.16);
  font-family:'Inter',sans-serif;font-size:9.5px;color:#9FB0CC;
}
.hero-feedback-strip .hf-main{font-weight:800;color:#fff;}
.hero-feedback-strip .hf-ok{color:#10D87A;}
.hero-feedback-strip .hf-warn{color:#FFC247;}
.hero-feedback-strip .hf-ko{color:#FF4560;}

/* ═══════════════════════════════════════════════════════
   SEAT CARDS 1T — Concept premium
════════════════════════════════════════════════════════ */
.player-card-1t{
  display:flex;flex-direction:column;align-items:center;
  background:transparent;border-radius:0;
  padding:0;min-width:74px;
  border:0;
  box-shadow:none;
  transition:all .2s;cursor:default;
}
.player-card-1t.hero{
  min-width:92px;padding:0;
}
.player-card-1t.villain{
  min-width:78px;
}
.player-card-1t.active-hero{
  filter:brightness(1.08);
}
.player-card-1t.active-vil{
  filter:brightness(1.06);
}
.seat-avatar-ring{
  border-radius:50%;display:flex;align-items:center;justify-content:center;
  overflow:hidden;position:relative;flex-shrink:0;transition:box-shadow .2s;
}
.seat-card-pos{
  font-family:'Space Grotesk',sans-serif;font-weight:900;letter-spacing:.04em;
  margin-top:4px;line-height:1;text-shadow:0 0 8px rgba(0,191,255,.28);
}
.seat-card-stack{
  font-family:'JetBrains Mono',monospace;font-weight:800;margin-top:2px;line-height:1;
}
.seat-card-stats{
  display:none;gap:5px;margin-top:3px;
  font-family:'Inter',sans-serif;font-size:7.5px;font-weight:600;
  color:rgba(111,129,168,.8);letter-spacing:.02em;
}
.pf-hole-cards{display:flex;align-items:flex-end;justify-content:center;position:relative;filter:drop-shadow(0 7px 16px rgba(0,0,0,.82));}
.pf-hole-cards .card:nth-child(1){transform:rotate(-5deg);}
.pf-hole-cards .card:nth-child(2){transform:rotate(5deg);}
.pf-hole-cards.compact{filter:drop-shadow(0 3px 8px rgba(0,0,0,.72));}
.pf-villain-backs{filter:drop-shadow(0 7px 16px rgba(0,191,255,.38)) drop-shadow(0 7px 18px rgba(0,0,0,.82));}
.pf-villain-backs.muted{opacity:.78;filter:drop-shadow(0 5px 12px rgba(0,191,255,.2)) drop-shadow(0 4px 12px rgba(0,0,0,.72));}
.pf-villain-backs.folded{
  opacity:.42;
  filter:grayscale(.95) saturate(.4) brightness(.72) drop-shadow(0 3px 10px rgba(0,0,0,.72));
  transform:rotate(-9deg) translateY(3px) scale(.94);
  transform-origin:center bottom;
}
.pf-villain-backs.folded .card:nth-child(1){transform:rotate(-18deg) translateX(3px);}
.pf-villain-backs.folded .card:nth-child(2){transform:rotate(16deg) translateX(-3px);}
.pf-villain-backs.folded::after{
  content:"FOLD";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-8deg);
  padding:2px 6px;border-radius:999px;
  font-family:'Space Grotesk',sans-serif;font-size:7px;font-weight:900;letter-spacing:.14em;
  color:#E7ECF3;background:rgba(1,8,22,.72);border:1px solid rgba(192,199,209,.36);
  box-shadow:0 0 12px rgba(0,0,0,.68),0 0 9px rgba(0,191,255,.12);
  pointer-events:none;
}
.pf-avatar-premium{
  width:calc(var(--avatar-size) + 14px);height:calc(var(--avatar-size) + 14px);
  border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative;isolation:isolate;
  background:
    radial-gradient(circle at 50% 24%,rgba(231,236,243,.28),transparent 35%),
    linear-gradient(145deg,rgba(231,236,243,.28),rgba(1,8,22,.97) 42%,rgba(0,191,255,.2));
  border:2.5px solid var(--avatar-accent);
  box-shadow:
    0 0 0 2px rgba(231,236,243,.12),
    0 0 28px var(--avatar-glow),
    0 0 54px rgba(0,191,255,.12),
    0 12px 28px rgba(0,0,0,.72),
    inset 0 0 0 1px rgba(255,255,255,.11);
}
.pf-avatar-premium::before{
  content:"";position:absolute;inset:-9px;border-radius:50%;
  background:conic-gradient(from 210deg,transparent,var(--avatar-accent),transparent 42%,rgba(231,236,243,.45),transparent 72%);
  opacity:.86;filter:blur(.2px);z-index:-1;
}
.pf-avatar-premium::after{
  content:"";position:absolute;inset:5px;border-radius:50%;border:1px solid rgba(255,255,255,.12);pointer-events:none;
}
.pf-avatar-premium.hero{
  border-color:#00BFFF;
  box-shadow:0 0 0 2px rgba(0,191,255,.18),0 0 28px rgba(0,191,255,.55),0 0 52px rgba(31,139,255,.22),0 10px 24px rgba(0,0,0,.72),inset 0 0 0 1px rgba(231,236,243,.1);
}
.pf-avatar-premium[data-profile="nit"]{filter:saturate(.82) contrast(1.08);}
.pf-avatar-premium[data-profile="fish"]{box-shadow:0 0 0 2px rgba(16,216,122,.14),0 0 30px rgba(52,216,255,.48),0 10px 24px rgba(0,0,0,.72),inset 0 0 0 1px rgba(231,236,243,.1);}
.pf-avatar-premium[data-profile="lag"]{box-shadow:0 0 0 2px rgba(255,138,61,.18),0 0 31px rgba(255,138,61,.5),0 0 54px rgba(255,194,71,.14),0 10px 24px rgba(0,0,0,.72),inset 0 0 0 1px rgba(231,236,243,.1);}
.pf-avatar-premium[data-profile="tag"]{box-shadow:0 0 0 2px rgba(31,139,255,.18),0 0 31px rgba(31,139,255,.5),0 10px 24px rgba(0,0,0,.72),inset 0 0 0 1px rgba(231,236,243,.1);}
.pf-avatar-premium[data-profile="reg"]{box-shadow:0 0 0 2px rgba(52,216,255,.14),0 0 28px rgba(52,216,255,.38),0 10px 24px rgba(0,0,0,.72),inset 0 0 0 1px rgba(231,236,243,.1);}
.pf-avatar-premium.active{animation:pfAvatarPulse 1.7s ease-in-out infinite;}
.pf-avatar-premium.compact::before{inset:-4px;}
.pf-avatar-svg{display:block;border-radius:50%;filter:drop-shadow(0 0 8px var(--avatar-glow));}
@keyframes pfAvatarPulse{
  0%,100%{box-shadow:0 0 0 2px rgba(0,191,255,.14),0 0 24px var(--avatar-glow),0 10px 22px rgba(0,0,0,.68),inset 0 0 0 1px rgba(255,255,255,.08);}
  50%{box-shadow:0 0 0 4px rgba(0,191,255,.28),0 0 38px var(--avatar-glow),0 0 70px rgba(0,191,255,.14),0 10px 22px rgba(0,0,0,.68),inset 0 0 0 1px rgba(255,255,255,.1);}
}
.pf-seat-hero-chip{
  margin-top:-5px;margin-bottom:3px;display:inline-flex;align-items:center;justify-content:center;
  padding:2px 10px;border-radius:999px;font-family:'Space Grotesk',sans-serif;font-size:8px;font-weight:900;
  color:#061326;background:linear-gradient(90deg,#00BFFF,#1F8BFF);
  border:1px solid rgba(231,236,243,.36);box-shadow:0 0 14px rgba(0,191,255,.55);
  letter-spacing:.12em;
}
.pf-seat-nameplate,.pf-mt-nameplate{
  min-width:86px;margin-top:-4px;padding:8px 13px 7px;border-radius:13px;
  display:flex;flex-direction:column;align-items:center;gap:1px;
  background:linear-gradient(180deg,rgba(1,9,24,.92),rgba(0,0,0,.82));
  border:1px solid rgba(0,191,255,.32);
  box-shadow:0 10px 24px rgba(0,0,0,.64),0 0 18px rgba(0,140,255,.12),inset 0 1px 0 rgba(255,255,255,.07);
}
.pf-mt-nameplate{min-width:auto;padding:3px 7px;border-radius:8px;margin-top:1px;}
.pf-blind-anchor{position:absolute;transform:translate(-50%,-50%);z-index:19;pointer-events:none;}
.pf-blind-stack{display:flex;flex-direction:column;align-items:center;gap:2px;filter:drop-shadow(0 5px 12px rgba(0,191,255,.42));}
.pf-blind-coins{position:relative;width:22px;height:24px;}
.pf-blind-coins span{
  position:absolute;left:0;bottom:0;width:22px;height:22px;border-radius:50%;
  background:
    radial-gradient(circle at 34% 26%,rgba(255,255,255,.5),transparent 35%),
    linear-gradient(145deg,#C0C7D1,#607086 48%,#E7ECF3);
  border:2px solid rgba(231,236,243,.72);
  box-shadow:inset 0 -3px 5px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.65);
}
.pf-blind-coins span:nth-child(2){bottom:5px;background:radial-gradient(circle at 34% 26%,rgba(255,255,255,.5),transparent 35%),linear-gradient(145deg,#00BFFF,#064C9C);}
.pf-blind-coins span:nth-child(3){bottom:10px;background:radial-gradient(circle at 34% 26%,rgba(255,255,255,.45),transparent 35%),linear-gradient(145deg,#FFC247,#8B5208);}
.pf-blind-stack strong{
  font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:900;color:#E7ECF3;
  text-shadow:0 0 9px rgba(0,191,255,.65);line-height:1;
}
.pf-blind-stack em{
  width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-style:normal;font-family:'Space Grotesk',sans-serif;font-size:8px;font-weight:900;
  color:#061326;background:linear-gradient(135deg,#E7ECF3,#8DA9D7);
  border:1px solid rgba(255,255,255,.35);box-shadow:0 0 10px rgba(141,169,215,.35);
}
.pf-blind-stack.compact{transform:scale(.72);transform-origin:center;}
.felt-oval{isolation:isolate;}
.felt-oval::before{
  content:"";position:absolute;inset:0;border-radius:50%;z-index:1;pointer-events:none;
  background:
    radial-gradient(ellipse at 50% 17%,rgba(231,236,243,.12),transparent 34%),
    radial-gradient(ellipse at 50% 84%,rgba(0,0,0,.42),transparent 48%),
    repeating-radial-gradient(ellipse at 50% 50%,rgba(231,236,243,.024) 0 1px,transparent 1px 12px);
  opacity:.86;mix-blend-mode:screen;
}
.felt-oval::after{
  content:"";position:absolute;inset:13px;border-radius:50%;z-index:2;pointer-events:none;
  border:1px solid rgba(231,236,243,.08);
  box-shadow:inset 0 0 0 1px rgba(0,191,255,.1),inset 0 0 58px rgba(0,0,0,.38);
}
.pf-pot-readout{
  display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;
  padding:3px 10px 5px;border-radius:16px;
  background:radial-gradient(ellipse at 50% 20%,rgba(31,139,255,.12),rgba(2,8,20,.14) 64%,transparent 100%);
  filter:drop-shadow(0 9px 22px rgba(0,0,0,.72)) drop-shadow(0 0 18px rgba(31,139,255,.18));
}
.pf-pot-chip-stack{position:relative;width:64px;height:38px;margin-bottom:-3px;}
.pf-pot-chip-stack span{
  position:absolute;bottom:calc(var(--i)*3px);left:calc(50% - 12px + (var(--i) - 3)*4px);
  width:25px;height:25px;border-radius:50%;
  background:
    radial-gradient(circle at 35% 24%,rgba(255,255,255,.58),transparent 36%),
    linear-gradient(145deg,var(--chip-color),#061326 78%);
  border:2px solid rgba(231,236,243,.48);
  box-shadow:inset 0 -4px 5px rgba(0,0,0,.58),inset 0 2px 3px rgba(255,255,255,.2),0 3px 9px rgba(0,0,0,.62);
}
.pf-pot-label{
  font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:900;color:#E7ECF3;
  letter-spacing:.14em;text-transform:uppercase;text-shadow:0 0 10px rgba(0,191,255,.55);
}
.pf-pot-value{
  font-family:'JetBrains Mono',monospace;font-size:29px;font-weight:900;color:#F7FAFF;line-height:1;
  text-shadow:0 0 19px rgba(0,191,255,.52),0 1px 0 rgba(0,0,0,.85);
}
.pf-pot-readout.compact{gap:1px;padding:1px 7px 3px;border-radius:12px;}
.pf-pot-readout.compact .pf-pot-chip-stack{transform:scale(.72);height:24px;margin-bottom:-7px;}
.pf-pot-readout.compact .pf-pot-label{font-size:7.5px;}
.pf-pot-readout.compact .pf-pot-value{font-size:15px;}

/* ═══════════════════════════════════════════════════════
   SIZING BAR — Concept premium
════════════════════════════════════════════════════════ */
.sizing-bar-wrap{
  width:200px;flex-shrink:0;border-left:1px solid #152D6E;
  padding:9px 10px 11px;display:flex;flex-direction:column;gap:6px;
  background:linear-gradient(180deg,#030D2A,#040B1F);
}
.sizing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;}
.sizing-btn{
  padding:5px 2px;border:1px solid rgba(31,139,255,.14);border-radius:7px;
  cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;
  background:rgba(31,139,255,.06);color:#6880A8;
  transition:all .12s;letter-spacing:.02em;line-height:1;
}
.sizing-btn:hover{background:rgba(31,139,255,.14);color:#90B8E0;border-color:rgba(31,139,255,.28);}
.sizing-btn.sz-active{background:rgba(31,139,255,.22);color:#60B0FF;border-color:rgba(31,139,255,.55);box-shadow:0 0 10px rgba(31,139,255,.2);}
.sizing-btn.sz-allin{background:rgba(255,69,96,.07);color:#885060;border-color:rgba(255,69,96,.2);}
.sizing-btn.sz-allin:hover,.sizing-btn.sz-allin.sz-active{background:rgba(255,69,96,.18);color:#FF6080;border-color:rgba(255,69,96,.42);}
.sizing-custom{
  display:flex;align-items:center;gap:4px;
  background:rgba(26,58,128,.18);border-radius:7px;
  border:1px solid rgba(31,139,255,.15);padding:4px 7px;
}
.sizing-step-btn{
  width:22px;height:22px;border-radius:5px;border:1px solid rgba(31,139,255,.2);
  cursor:pointer;background:rgba(31,139,255,.08);color:#6090C0;
  font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;
  transition:all .1s;line-height:1;padding:0;
}
.sizing-step-btn:hover{background:rgba(31,139,255,.18);color:#80B0E0;border-color:rgba(31,139,255,.35);}

/* ═══════════════════════════════════════════════════════
   ANALYSIS PANEL 1T — 5 colonnes concept
════════════════════════════════════════════════════════ */
.analysis-1t{
  flex-shrink:0;display:grid;grid-template-columns:repeat(5,1fr);
  border-top:1px solid #152D6E;
  background:linear-gradient(180deg,#030D2A 0%,#020912 100%);
}
.analysis-col{
  padding:8px 10px;border-right:1px solid rgba(26,58,128,.3);
  min-width:0;overflow:hidden;position:relative;
}
.analysis-col:last-child{border-right:none;}
.analysis-col-hdr{
  font-family:'Space Grotesk',sans-serif;font-size:7.5px;font-weight:700;
  color:#485868;letter-spacing:.12em;margin-bottom:6px;text-transform:uppercase;
}
.sol-lock{
  position:absolute;inset:0;z-index:10;
  backdrop-filter:blur(8px);background:rgba(2,6,20,.62);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
}
.sol-toggle-btn{
  display:inline-flex;align-items:center;gap:5px;
  padding:3px 11px;border-radius:6px;
  font-family:'Inter',sans-serif;font-size:9px;font-weight:700;cursor:pointer;
  transition:all .18s;letter-spacing:.02em;
}
.sol-toggle-btn.sol-hidden{background:rgba(255,69,96,.08);color:#FF7090;border:1px solid rgba(255,69,96,.32);}
.sol-toggle-btn.sol-visible{background:rgba(16,216,122,.08);color:#10D87A;border:1px solid rgba(16,216,122,.32);}
.sol-toggle-btn:hover{filter:brightness(1.18);}

/* ═══════════════════════════════════════════════════════
   SETTINGS PANEL
════════════════════════════════════════════════════════ */
.settings-wrap{flex:1;overflow-y:auto;background:#030712;padding:20px 24px;}
.settings-section{background:linear-gradient(135deg,#071B44,#050E28);border:1px solid #1A3A80;border-radius:14px;padding:18px 20px;margin-bottom:16px;}
.settings-section-title{font-family:'Space Grotesk',sans-serif;font-size:11px;color:#6F81A8;letter-spacing:.2em;text-transform:uppercase;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
.settings-section-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#1A3A80,transparent);}
.deck-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}
.deck-card{
  border-radius:12px;padding:14px;cursor:pointer;transition:all .18s;
  background:linear-gradient(135deg,#040B1F,#030712);border:2px solid #152D6E;
}
.deck-card:hover{border-color:#2E6CFF;box-shadow:0 0 16px rgba(31,139,255,.15);}
.deck-card.active{border-color:#1F8BFF;background:linear-gradient(135deg,rgba(31,139,255,.12),rgba(155,92,255,.06));box-shadow:0 0 20px rgba(31,139,255,.2);}
.deck-preview{display:flex;gap:4px;margin-bottom:10px;justify-content:center;}
.deck-suit-dot{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;}
.deck-name{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:700;color:#FFFFFF;margin-bottom:3px;}
.deck-desc{font-family:'Inter',sans-serif;font-size:9px;color:#6F81A8;line-height:1.5;}

/* ═══════════════════════════════════════════════════════
   GTO WIZARD EXPERIENCE — Trainer Premium
════════════════════════════════════════════════════════ */

/* ── Qualité de décision ── */
.gto-quality{
  display:inline-flex;align-items:center;gap:6px;
  padding:4px 12px;border-radius:20px;font-weight:700;
  font-family:'Space Grotesk',sans-serif;font-size:12px;letter-spacing:.04em;
}
.gto-best{background:rgba(16,216,122,.15);color:#10D87A;border:1px solid rgba(16,216,122,.4);box-shadow:0 0 16px rgba(16,216,122,.2);}
.gto-correct{background:rgba(52,216,255,.12);color:#34D8FF;border:1px solid rgba(52,216,255,.35);}
.gto-inaccuracy{background:rgba(255,194,71,.12);color:#FFC247;border:1px solid rgba(255,194,71,.35);}
.gto-wrong{background:rgba(255,69,96,.12);color:#FF4560;border:1px solid rgba(255,69,96,.35);}
.gto-blunder{background:rgba(155,92,255,.12);color:#9B5CFF;border:1px solid rgba(155,92,255,.35);}

/* ── Feedback overlay flash ── */
@keyframes decisionFlash{
  0%{opacity:.7;}20%{opacity:.5;}100%{opacity:0;}
}
.decision-flash{
  position:absolute;inset:0;pointer-events:none;z-index:50;
  animation:decisionFlash .55s ease-out forwards;border-radius:inherit;
}

/* ── Panneau résultat GTO Wizard ── */
@keyframes slideUp{
  0%{transform:translateY(30px);opacity:0;}
  100%{transform:translateY(0);opacity:1;}
}
.gto-panel{
  animation:slideUp .3s cubic-bezier(.22,.68,.36,1) forwards;
  background:linear-gradient(180deg,#040B1F,#030712);
  border-top:1px solid #1A3A80;flex-shrink:0;overflow-y:auto;
}
.gto-panel-header{
  display:flex;align-items:center;gap:10;
  padding:10px 16px 8px;
  background:linear-gradient(90deg,#071B44,#040B1F);
  border-bottom:1px solid #152D6E;flex-wrap:wrap;gap:10px;
}
.gto-ev-grid{
  display:grid;gap:6px;padding:10px 14px;
}
.gto-ev-card{
  border-radius:11px;padding:10px 13px;
  border:1px solid;cursor:default;transition:transform .1s;
  position:relative;overflow:hidden;
}
.gto-ev-card::before{
  content:'';position:absolute;top:0;left:0;bottom:0;width:3px;border-radius:3px 0 0 3px;
}
.gto-ev-card.best::before{background:#10D87A;}
.gto-ev-card.chosen::before{background:#FF4560;}
.gto-ev-card.chosen.correct::before{background:#10D87A;}
.gto-ev-card.neutral::before{background:#1A3A80;}
.gto-ev-card.best{background:rgba(16,216,122,.07);border-color:rgba(16,216,122,.3);}
.gto-ev-card.chosen.correct{background:rgba(16,216,122,.07);border-color:rgba(16,216,122,.35);}
.gto-ev-card.chosen{background:rgba(255,69,96,.07);border-color:rgba(255,69,96,.3);}
.gto-ev-card.neutral{background:rgba(26,58,128,.25);border-color:#152D6E;}
.gto-freq-bar{height:8px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden;margin-top:6px;}
.gto-freq-fill{height:100%;border-radius:4px;transition:width .8s cubic-bezier(.4,0,.2,1);}

/* ── Boutons d'action premium ── */
.gto-action-zone{
  padding:12px 16px 16px;
  background:linear-gradient(180deg,#040B1F,#030D2A);
  border-top:1px solid #152D6E;flex-shrink:0;
}
.gto-action-desc{
  font-family:'Inter',sans-serif;font-size:12.5px;font-weight:600;
  color:#D6E2F5;letter-spacing:.02em;margin-bottom:10px;text-align:center;
  display:flex;align-items:center;justify-content:center;gap:8px;
}
.gto-action-desc .pos-tag{
  padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;
  background:rgba(255,194,71,.12);color:#FFC247;border:1px solid rgba(255,194,71,.3);
  font-family:'Space Grotesk',sans-serif;
}
.gto-btn-grid{display:grid;gap:8px;}
.gto-btn{
  padding:0;border:none;border-radius:13px;cursor:pointer;
  display:flex;flex-direction:column;align-items:stretch;overflow:hidden;
  transition:transform .12s,box-shadow .12s;position:relative;
}
.gto-btn:hover:not(:disabled){transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.5);}
.gto-btn:active:not(:disabled){transform:scale(.97);}
.gto-btn:disabled{opacity:.25;cursor:not-allowed;}
.gto-btn.btn-error{animation:btnShake .35s ease-out;}
.gto-btn-inner{
  padding:15px 12px 13px;display:flex;align-items:center;justify-content:space-between;
}
.gto-btn-label{
  font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;letter-spacing:.01em;
}
.gto-btn-sizing{
  font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;opacity:.85;
  padding:3px 9px;border-radius:7px;background:rgba(0,0,0,.25);
}
.gto-btn-hint{
  padding:4px 12px;font-family:'Inter',sans-serif;font-size:9.5px;font-weight:500;
  text-align:left;opacity:.7;letter-spacing:.01em;border-top:1px solid rgba(255,255,255,.06);
}
/* Couleurs par action */
.gto-btn-FOLD{background:linear-gradient(135deg,#1C0814,#140510);}
.gto-btn-FOLD .gto-btn-label{color:#FF8099;}
.gto-btn-FOLD .gto-btn-sizing{color:#FF6080;}
.gto-btn-FOLD .gto-btn-hint{color:#FF8099;}
.gto-btn-FOLD:hover:not(:disabled){box-shadow:0 10px 28px rgba(255,69,96,.25)!important;}
.gto-btn-CALL{background:linear-gradient(135deg,#061A10,#04100A);}
.gto-btn-CALL .gto-btn-label{color:#40E890;}
.gto-btn-CALL .gto-btn-sizing{color:#30C070;}
.gto-btn-CALL .gto-btn-hint{color:#40E890;}
.gto-btn-CALL:hover:not(:disabled){box-shadow:0 10px 28px rgba(16,216,122,.2)!important;}
.gto-btn-CHECK{background:linear-gradient(135deg,#0A1606,#060E04);}
.gto-btn-CHECK .gto-btn-label{color:#90D060;}
.gto-btn-CHECK .gto-btn-sizing{color:#70B040;}
.gto-btn-CHECK .gto-btn-hint{color:#90D060;}
.gto-btn-RAISE,.gto-btn-3BET,.gto-btn-4BET{background:linear-gradient(135deg,#04102C,#020A1E);}
.gto-btn-RAISE .gto-btn-label,.gto-btn-3BET .gto-btn-label,.gto-btn-4BET .gto-btn-label{color:#60B0FF;}
.gto-btn-RAISE .gto-btn-sizing,.gto-btn-3BET .gto-btn-sizing{color:#4090E0;}
.gto-btn-RAISE .gto-btn-hint,.gto-btn-3BET .gto-btn-hint{color:#60B0FF;}
.gto-btn-RAISE:hover:not(:disabled),.gto-btn-3BET:hover:not(:disabled){box-shadow:0 10px 28px rgba(31,139,255,.2)!important;}
.gto-btn-BET33,.gto-btn-BET50,.gto-btn-BET75,.gto-btn-BET100{background:linear-gradient(135deg,#1A1004,#110A00);}
.gto-btn-BET33 .gto-btn-label,.gto-btn-BET50 .gto-btn-label,.gto-btn-BET75 .gto-btn-label,.gto-btn-BET100 .gto-btn-label{color:#FFC247;}
.gto-btn-BET33 .gto-btn-sizing,.gto-btn-BET50 .gto-btn-sizing,.gto-btn-BET75 .gto-btn-sizing,.gto-btn-BET100 .gto-btn-sizing{color:#E0A030;}
.gto-btn-BET33 .gto-btn-hint,.gto-btn-BET50 .gto-btn-hint{color:#FFC247;}
.gto-btn-BET33:hover:not(:disabled),.gto-btn-BET50:hover:not(:disabled){box-shadow:0 10px 28px rgba(255,194,71,.2)!important;}
.gto-btn-ALLIN{background:linear-gradient(135deg,#1A0404,#100202);}
.gto-btn-ALLIN .gto-btn-label{color:#FF6060;}
.gto-btn-ALLIN .gto-btn-sizing{color:#E04040;}
.gto-btn-ALLIN .gto-btn-hint{color:#FF8080;}
.gto-btn-ALLIN:hover:not(:disabled){box-shadow:0 10px 28px rgba(255,69,96,.3)!important;}

/* ── HUD (position / stack / pot odds) ── */
.trainer-hud{
  display:flex;align-items:center;gap:8px;padding:5px 14px;
  background:linear-gradient(90deg,#030D2A,#040B1F);
  border-bottom:1px solid rgba(31,139,255,.08);flex-shrink:0;flex-wrap:wrap;
}
.hud-chip{
  display:inline-flex;align-items:center;gap:4px;
  padding:2px 9px;border-radius:6px;
  font-family:'Inter',sans-serif;font-size:9px;font-weight:600;letter-spacing:.04em;
}
.hud-pos{background:rgba(255,194,71,.1);color:#FFC247;border:1px solid rgba(255,194,71,.2);}
.hud-stack{background:rgba(31,139,255,.1);color:#1F8BFF;border:1px solid rgba(31,139,255,.2);}
.hud-spr{background:rgba(155,92,255,.1);color:#9B5CFF;border:1px solid rgba(155,92,255,.2);}
.hud-eff{background:rgba(52,216,255,.08);color:#34D8FF;border:1px solid rgba(52,216,255,.2);}
.hud-odds{background:rgba(255,69,96,.1);color:#FF4560;border:1px solid rgba(255,69,96,.2);}
.hud-diff{
  margin-left:auto;display:flex;align-items:center;gap:4px;
  font-family:'Space Grotesk',sans-serif;font-size:9px;color:#6F81A8;
}

/* ═══════════════════════════════════════════════════
   PREMIUM TRAINER TABLE — PokerForge 2.0
   ═══════════════════════════════════════════════════ */
@keyframes heroHaloSpin{
  0%,100%{box-shadow:0 0 0 3px rgba(255,194,71,.55),0 0 22px rgba(255,194,71,.5),0 0 50px rgba(255,194,71,.2),inset 0 0 16px rgba(255,194,71,.06);}
  50%{box-shadow:0 0 0 5px rgba(255,194,71,.75),0 0 36px rgba(255,194,71,.65),0 0 72px rgba(255,194,71,.3),inset 0 0 22px rgba(255,194,71,.1);}
}
@keyframes heroBadgePulse{
  0%,100%{opacity:1;transform:translateX(-50%) scale(1);}
  50%{opacity:.78;transform:translateX(-50%) scale(1.05);}
}
@keyframes feedbackPop{
  0%{opacity:0;transform:translate(-50%,-50%) scale(.4);}
  55%{transform:translate(-50%,-50%) scale(1.18);}
  100%{opacity:1;transform:translate(-50%,-50%) scale(1);}
}
@keyframes tableHeroGlow{
  0%,100%{box-shadow:inset 0 0 160px rgba(0,0,0,.6),inset 0 30px 60px rgba(255,255,255,.025),0 0 0 3px rgba(255,194,71,.32),0 0 0 6px rgba(255,194,71,.1),0 0 55px rgba(255,194,71,.1),0 0 100px rgba(0,0,0,.9);}
  50%{box-shadow:inset 0 0 160px rgba(0,0,0,.6),inset 0 30px 60px rgba(255,255,255,.025),0 0 0 4px rgba(255,194,71,.5),0 0 0 8px rgba(255,194,71,.16),0 0 70px rgba(255,194,71,.18),0 0 100px rgba(0,0,0,.9);}
}
.seat-hero-halo{animation:heroHaloSpin 2.2s ease-in-out infinite!important;}
.hero-seat-badge{
  position:absolute;top:-20px;left:50%;transform:translateX(-50%);
  background:linear-gradient(90deg,#FFC247,#FFD97A);
  color:#030712;padding:2px 8px;border-radius:10px;
  font-family:'Space Grotesk',sans-serif;font-size:7px;font-weight:900;
  letter-spacing:.1em;white-space:nowrap;pointer-events:none;
  animation:heroBadgePulse 1.5s ease-in-out infinite;
  box-shadow:0 2px 10px rgba(255,194,71,.55),0 0 0 1px rgba(255,255,255,.15);z-index:25;
}
.post-decision-feedback{
  position:absolute;top:50%;left:50%;
  z-index:55;pointer-events:none;
  animation:feedbackPop .32s cubic-bezier(.22,.68,.36,1.3) forwards;
  display:flex;flex-direction:column;align-items:center;gap:3px;
}
.focus-mode-btn{
  position:absolute;top:7px;right:7px;z-index:50;
  width:28px;height:28px;border-radius:7px;
  border:1px solid rgba(31,139,255,.25);
  background:rgba(3,9,28,.85);color:#4A70A8;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;font-size:11px;transition:all .15s;
  backdrop-filter:blur(6px);flex-shrink:0;
}
.focus-mode-btn:hover{background:rgba(31,139,255,.18);color:#1F8BFF;border-color:rgba(31,139,255,.55);}
.focus-mode-btn.on{background:rgba(31,139,255,.2);color:#60AAFF;border-color:rgba(31,139,255,.5);}
/* Multi-table active table highlight */
.table-slot-active{
  border-radius:10px;
  outline:2px solid rgba(31,139,255,.45);
  outline-offset:2px;
  box-shadow:0 0 20px rgba(31,139,255,.12);
  position:relative;z-index:1;
}
.table-slot-answered{opacity:.72;position:relative;}
.table-slot-answered::after{
  content:"✓";position:absolute;top:6px;right:6px;z-index:10;
  width:22px;height:22px;border-radius:50%;
  background:rgba(16,216,122,.2);border:1px solid rgba(16,216,122,.5);
  color:#10D87A;font-size:11px;font-weight:900;
  display:flex;align-items:center;justify-content:center;
}
/* Upgrade action buttons — plus gros, plus premium */
.gto-btn{
  padding:0;border:none;border-radius:14px;cursor:pointer;
  display:flex;flex-direction:column;align-items:stretch;overflow:hidden;
  transition:transform .12s,box-shadow .12s,filter .12s;position:relative;
}
.gto-btn:hover:not(:disabled){transform:translateY(-4px);filter:brightness(1.08);}
.gto-btn:active:not(:disabled){transform:scale(.97);}
.gto-btn:disabled{opacity:.25;cursor:not-allowed;}
.gto-btn-inner{padding:17px 14px 15px;}
.gto-btn-label{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:800;letter-spacing:.01em;}
.gto-btn-sizing{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;opacity:.9;padding:3px 9px;border-radius:7px;background:rgba(0,0,0,.3);}
/* Chip premium */
.chip-prem{
  width:15px;height:6px;border-radius:50%;
  border:1px solid rgba(255,255,255,.22);
  box-shadow:0 1px 4px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.18);
}
/* ─ Chip theme settings grid ─ */
.chip-theme-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px;}
.chip-theme-card{
  padding:12px 10px;border-radius:10px;cursor:pointer;text-align:center;
  background:#071B44;border:1.5px solid #1A3A80;
  transition:all .2s;
}
.chip-theme-card:hover{border-color:rgba(31,139,255,.4);}
.chip-theme-card.active{border-color:rgba(31,139,255,.6);background:rgba(31,139,255,.08);}

/* ── XP Gain animation ── */
@keyframes xpRise{
  0%{transform:translateY(0) scale(1);opacity:1;}
  100%{transform:translateY(-60px) scale(1.2);opacity:0;}
}
.xp-gain{
  position:fixed;z-index:200;pointer-events:none;
  font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:900;
  color:#FFC247;text-shadow:0 0 20px rgba(255,194,71,.7);
  animation:xpRise 1.4s ease-out forwards;
}

/* ── Streak pendant session ── */
.session-streak{
  display:inline-flex;align-items:center;gap:5px;
  padding:2px 10px;border-radius:20px;
  background:rgba(255,194,71,.1);border:1px solid rgba(255,194,71,.25);
  font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#FFC247;
}

/* ── Insight box ── */
.gto-insight{
  margin:0 14px 10px;padding:10px 14px;
  background:linear-gradient(90deg,rgba(31,139,255,.07),rgba(155,92,255,.04));
  border:1px solid rgba(31,139,255,.2);border-left:3px solid #1F8BFF;
  border-radius:0 10px 10px 0;
}
.gto-insight-title{
  font-family:'Space Grotesk',sans-serif;font-size:9px;color:#1F8BFF;
  letter-spacing:.1em;font-weight:700;margin-bottom:4px;
}
.gto-insight-text{
  font-family:'Inter',sans-serif;font-size:11px;color:#D6E2F5;line-height:1.7;
}
.gto-insight-text strong{color:#FFC247;}

/* ── Boutons next zone ── */
.gto-next-zone{
  display:flex;gap:8px;padding:10px 14px 14px;
  background:#030D2A;border-top:1px solid #152D6E;flex-shrink:0;
}
.t1-right .gto-next-zone{
  position:sticky!important;
  bottom:18px!important;
  z-index:5!important;
  gap:6px!important;
  padding:7px 10px 8px!important;
  background:linear-gradient(180deg,rgba(3,13,42,.96),#030912)!important;
  box-shadow:0 -8px 18px rgba(0,0,0,.36)!important;
}
.gto-next-btn{
  flex:1;padding:12px;border-radius:11px;border:none;cursor:pointer;
  font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:700;
  letter-spacing:.03em;transition:all .15s;
  background:linear-gradient(135deg,#1F8BFF,#34D8FF);color:#FFFFFF;
  box-shadow:0 4px 18px rgba(31,139,255,.35);
}
.gto-next-btn:hover{box-shadow:0 6px 24px rgba(31,139,255,.5);transform:translateY(-1px);}
.t1-right .gto-next-btn{padding:9px 10px!important;border-radius:9px!important;font-size:12px!important;min-height:38px!important;}
.gto-btn-secondary{
  padding:12px 16px;border-radius:11px;border:1px solid #1A3A80;cursor:pointer;
  font-family:'Inter',sans-serif;font-size:12px;font-weight:600;
  background:#071B44;color:#9FB0CC;transition:all .15s;
}
.t1-right .gto-btn-secondary{padding:9px 11px!important;border-radius:9px!important;min-height:38px!important;}
.gto-btn-secondary:hover{border-color:#2E6CFF;color:#FFFFFF;}

/* ── Mini fréquence globale ── */
.gto-freq-summary{
  display:flex;gap:4px;margin:8px 14px 0;border-radius:6px;overflow:hidden;height:6px;
}
.gto-freq-seg{height:100%;transition:width .8s cubic-bezier(.4,0,.2,1);}

/* ═══════════════════════════════════════════════════════
   TYPOGRAPHY SCALE UP — Légèrement agrandi
════════════════════════════════════════════════════════ */
body{font-size:13px!important;}
.ntab{font-size:13px!important;padding:7px 16px!important;}
.brand{font-size:20px!important;letter-spacing:3px!important;}
.brand-sub{font-size:8px!important;letter-spacing:5px!important;}
.smn{font-size:12.5px!important;}
.smsub{font-size:9px!important;}
.smnum{font-size:14px!important;}
.statv{font-size:17px!important;}
.statl{font-size:9px!important;}
.dash-title{font-size:10px!important;}
.mc-v{font-size:26px!important;}
.mc-l{font-size:10px!important;}
.mc-d{font-size:10.5px!important;}
.pcard-h{font-size:10px!important;}
.potval{font-size:18px!important;}
.potlbl{font-size:9.5px!important;}
.seatpos{font-size:9px!important;letter-spacing:.05em!important;}
.seatstk{font-size:9px!important;}
.seatname{font-size:8px!important;}
.seat1t .seatpos{font-size:15px!important;}
.seat1t .seatstk{font-size:13px!important;}
.seat1t .seatname{font-size:11px!important;}
.tlpos{font-size:10px!important;}
.tlact{font-size:9px!important;padding:3px 7px!important;}
.tlstreet{font-size:9px!important;}
.stind{font-size:9.5px!important;padding:3px 11px!important;}
.aztitle{font-size:12px!important;}
.ab{font-size:11px!important;padding:11px 5px!important;}
.ab-sub{font-size:8.5px!important;}
.evlbl{font-size:10.5px!important;}
.evfreq{font-size:10px!important;}
.solhdr{font-size:12px!important;}
.solbody{font-size:11px!important;line-height:1.8!important;}
.bltxt{font-size:11.5px!important;}
.vzone-act{font-size:12.5px!important;}
.vzone-note{font-size:11.5px!important;}
.btn{font-size:12.5px!important;}
.btng{font-size:13px!important;padding:10px 20px!important;}
.btns{font-size:12px!important;}
.tag{font-size:9.5px!important;}
.sev{font-size:21px!important;}
.sel{font-size:9.5px!important;}
.sescore{font-size:56px!important;}
.streaknum{font-size:38px!important;}
.lex-word{font-size:13.5px!important;}
.lex-def{font-size:11.5px!important;}
.lex-ex{font-size:10.5px!important;}
.art-title{font-size:12px!important;}
.art-p{font-size:12px!important;}
.calc-label{font-size:12px!important;}
.calc-input{font-size:14px!important;}
.calc-big{font-size:30px!important;}
.calc-verdict{font-size:13px!important;}
.coach-ntab{font-size:12px!important;padding:10px 16px!important;}
.reptlrow{font-size:11.5px!important;}
.repcur{font-size:12px!important;}
.ar-action{font-size:12px!important;}
.ar-player{font-size:10.5px!important;}
.seatbadge{font-size:9px!important;}
.goal-label{font-size:12px!important;}
.qa-label{font-size:11.5px!important;}
.qa-sub{font-size:9.5px!important;}
.newsrow .newstitle{font-size:12px!important;}
.evcard-name{font-size:12px!important;}
.evcard-date{font-size:9px!important;}
.slide-caption{font-size:11px!important;}

/* ═══════════════════════════════════════════════════════
   LEFT NAV — Icônes plus grandes
════════════════════════════════════════════════════════ */
.leftnav{width:82px!important;padding:16px 0 12px!important;}
.lnav-item{width:62px!important;height:62px!important;border-radius:14px!important;}
.lnav-ico{font-size:22px!important;}
.lnav-lbl{font-size:8.5px!important;font-weight:600!important;}
.lnav-sep{width:40px!important;}

/* ═══════════════════════════════════════════════════════
   TRAINING TABLES — Thème Blue Steel
════════════════════════════════════════════════════════ */

/* Wrapper table */
.tw{
  background:linear-gradient(160deg,#071B44 0%,#040B1F 100%)!important;
  border:1px solid #1A3A80!important;
  box-shadow:0 0 0 1px rgba(31,139,255,.06),0 8px 40px rgba(3,7,18,.7)!important;
}

/* FELT — garder le vert poker mais enrichir le cadre */
.felt{
  border:3px solid #0D2A5A!important;
  box-shadow:
    inset 0 0 70px rgba(0,0,0,.65),
    inset 0 0 30px rgba(0,20,10,.3),
    0 0 0 1px #071B44,
    0 10px 50px rgba(3,7,18,.7),
    0 0 40px rgba(31,139,255,.04)!important;
}
.felt.error-flash{border-color:#FF4560!important;}
.felt.hero-action{
  box-shadow:inset 0 0 70px rgba(0,0,0,.65),0 0 0 2px rgba(255,194,71,.45),0 0 36px rgba(255,194,71,.18)!important;
}
.felt.villain-thinking{
  box-shadow:inset 0 0 70px rgba(0,0,0,.65),0 0 0 2px rgba(155,92,255,.35),0 0 36px rgba(155,92,255,.12)!important;
}
@keyframes feltError{
  0%{box-shadow:inset 0 0 70px rgba(0,0,0,.65),0 0 70px rgba(255,69,96,.65),0 0 140px rgba(255,69,96,.3);}
  50%{box-shadow:inset 0 0 90px rgba(255,69,96,.25),0 0 90px rgba(255,69,96,.5);}
  100%{box-shadow:inset 0 0 70px rgba(0,0,0,.65),0 0 40px rgba(31,139,255,.04);}
}

/* SEATS — chips redesign Blue Steel */
.seatchip{
  border-width:2px!important;
  backdrop-filter:blur(4px)!important;
}
/* Hero seat — or premium */
.seatchip[style*="FFC247"]{
  background:linear-gradient(145deg,rgba(255,194,71,.18),rgba(255,194,71,.08))!important;
  box-shadow:0 0 0 1px rgba(255,194,71,.3),0 4px 16px rgba(255,194,71,.2)!important;
}
/* Villain seat — violet prestige */
.seatchip[style*="9B5CFF"]{
  background:linear-gradient(145deg,rgba(155,92,255,.18),rgba(155,92,255,.08))!important;
  box-shadow:0 0 0 1px rgba(155,92,255,.3),0 4px 16px rgba(155,92,255,.2)!important;
}
/* Other seats — bleu marine */
.seatchip[style*="6F81A8"]{
  background:linear-gradient(145deg,rgba(26,58,128,.5),rgba(7,27,68,.7))!important;
}

/* Active seat pulse — bleu */
@keyframes heroSeatPulse{
  0%{box-shadow:0 0 0 0 rgba(255,194,71,.7);}
  70%{box-shadow:0 0 0 10px rgba(255,194,71,0);}
  100%{box-shadow:0 0 0 0 rgba(255,194,71,0);}
}
@keyframes seatPulse{
  0%{box-shadow:0 0 0 0 rgba(155,92,255,.7);}
  70%{box-shadow:0 0 0 10px rgba(155,92,255,0);}
  100%{box-shadow:0 0 0 0 rgba(155,92,255,0);}
}

/* POT value */
.potval{
  font-family:'JetBrains Mono',monospace!important;
  color:#FFC247!important;
  text-shadow:0 0 20px rgba(255,194,71,.7)!important;
}
.potlbl{color:rgba(141,169,215,.5)!important;letter-spacing:.2em!important;}

/* CARDS — amélioration */
.card{border-radius:7px!important;box-shadow:0 3px 12px rgba(0,0,0,.6)!important;}
.card::after{background:linear-gradient(135deg,rgba(255,255,255,.1) 0%,transparent 55%)!important;}
.card-back{
  background:
    radial-gradient(circle at 50% 18%,rgba(0,191,255,.38),transparent 34%),
    linear-gradient(145deg,#09265B 0%,#061326 46%,#020712 100%)!important;
  border:1px solid rgba(0,191,255,.48)!important;
}
.card-back::before{
  background:
    linear-gradient(135deg,rgba(255,255,255,.24),transparent 22%,transparent 72%,rgba(0,191,255,.16)),
    repeating-linear-gradient(45deg,rgba(0,191,255,.18) 0 1px,transparent 1px 7px)!important;
}
.card-back::after{content:'PF'!important;color:#E7ECF3!important;text-shadow:0 0 8px rgba(0,191,255,.85),0 1px 0 rgba(0,0,0,.75)!important;}

/* TIMELINE BAR */
.tlbar{
  background:linear-gradient(90deg,#030D2A,#071B44)!important;
  border-bottom:1px solid #152D6E!important;
  min-height:36px!important;
}
.tl-raise{background:rgba(31,139,255,.15)!important;color:#1F8BFF!important;}
.tl-call{background:rgba(16,216,122,.12)!important;color:#10D87A!important;}
.tl-fold{background:rgba(255,69,96,.12)!important;color:#FF4560!important;}
.tl-check{background:#071B44!important;color:#9FB0CC!important;}
.tl-bet{background:rgba(255,194,71,.12)!important;color:#FFC247!important;}
.tl-win{background:rgba(16,216,122,.15)!important;color:#10D87A!important;}

/* STREET INDICATOR */
.streetind{
  background:linear-gradient(90deg,#030D2A,#071B44)!important;
  border-bottom:1px solid #152D6E!important;
  gap:6px!important;padding:6px 12px!important;
}

/* ACTION ZONE */
.az{
  background:linear-gradient(180deg,#030D2A 0%,#040B1F 100%)!important;
  border-top:1px solid #152D6E!important;
  padding:10px!important;
}
.nextrow{
  background:linear-gradient(90deg,#030D2A,#040B1F)!important;
  border-top:1px solid #152D6E!important;
}

/* EV GRID */
.evgrid{background:linear-gradient(90deg,#030D2A,#040B1F)!important;border-top:1px solid #152D6E!important;}
.evcell{border-radius:9px!important;}

/* SOLUTION BOX */
.solbox{border-radius:10px!important;}
.solhdr{font-family:'Inter',sans-serif!important;letter-spacing:.03em!important;}
.blbox{border-radius:10px!important;}

/* VILLAIN ZONE */
.vzone{
  background:linear-gradient(90deg,rgba(155,92,255,.07),rgba(155,92,255,.03))!important;
  border-top:1px solid rgba(155,92,255,.18)!important;
  padding:9px 12px!important;
}

/* Timer */
.action-timer{background:#0B2040!important;}
.action-timer-bar{
  background:linear-gradient(90deg,#FF4560,#FFC247,#10D87A)!important;
  box-shadow:0 0 6px rgba(31,139,255,.3)!important;
}

/* DEALER BUTTON */
.dealer-btn{
  width:22px!important;height:22px!important;font-size:10px!important;
  background:linear-gradient(135deg,#FFC247,#FFE08A)!important;
  color:#030712!important;font-weight:800!important;
  border:2px solid rgba(255,194,71,.5)!important;
  box-shadow:0 2px 12px rgba(255,194,71,.6),0 0 24px rgba(255,194,71,.25)!important;
  border-radius:50%!important;font-family:'Space Grotesk',sans-serif!important;
  display:flex!important;align-items:center!important;justify-content:center!important;
}
.dealer-btn-sm{width:16px!important;height:16px!important;font-size:8px!important;}

/* HERO CARDS ZONE */
.hero-cards-zone::before{
  color:rgba(255,194,71,.5)!important;
  font-family:'Space Grotesk',sans-serif!important;
  letter-spacing:.25em!important;
}

/* CHIP ANIMATION */
.chip-fly span{
  background:linear-gradient(135deg,#1F8BFF,#34D8FF)!important;
  color:#FFFFFF!important;font-family:'JetBrains Mono',monospace!important;
  border:1px solid rgba(52,216,255,.4)!important;
}
@keyframes chipPop{
  0%{transform:scale(0) rotate(-20deg);opacity:0;}
  50%{transform:scale(1.25) rotate(5deg);opacity:1;}
  100%{transform:scale(1) rotate(0);opacity:1;}
}

/* ═══════════════════════════════════════════════════════
   REPLAYER TABLE — Thème Blue Steel
════════════════════════════════════════════════════════ */
.repfelt{
  background:radial-gradient(ellipse at 50% 45%,#1a3a28 0%,#0d2018 55%,#060e0c 100%)!important;
  padding:24px 28px!important;gap:16px!important;min-height:220px!important;
  border-bottom:1px solid #1A3A80!important;
}
.rep-seat-chip{border-width:2px!important;}
.rep-seat-chip.active{animation:seatPulse 1.2s infinite!important;}
.rep-seat-chip.active-hero{animation:heroSeatPulse 1.2s infinite!important;}
.repvis{
  background:linear-gradient(160deg,#040B1F,#030712)!important;
  border:1px solid #1A3A80!important;border-radius:14px!important;
}
.repvishdr{
  background:linear-gradient(90deg,#071B44,#040B1F)!important;
  border-bottom:1px solid #1A3A80!important;padding:10px 15px!important;
}
.repstabs{gap:5px!important;}
.repstab{font-size:10px!important;padding:4px 11px!important;font-weight:600!important;}
.repstab.on{
  background:rgba(31,139,255,.14)!important;color:#1F8BFF!important;
  border-color:rgba(31,139,255,.4)!important;
  box-shadow:0 0 10px rgba(31,139,255,.15)!important;
}
.repctrls{
  background:linear-gradient(90deg,#030D2A,#040B1F)!important;
  border-top:1px solid #152D6E!important;padding:9px 15px!important;
}
.repprog{background:#152D6E!important;border-radius:4px!important;}
.repfill{background:linear-gradient(90deg,#1F8BFF,#34D8FF)!important;}
.reptl{padding:0 15px 12px!important;}
.reptlrow{
  border-radius:8px!important;font-size:11px!important;
  border:1px solid transparent!important;
}
.reptlrow:hover{background:rgba(31,139,255,.07)!important;border-color:rgba(31,139,255,.12)!important;}
.reptlrow.on{
  background:rgba(31,139,255,.1)!important;
  border:1px solid rgba(31,139,255,.25)!important;
  box-shadow:0 0 12px rgba(31,139,255,.1)!important;
}
.reptlpos{font-family:'Space Grotesk',sans-serif!important;color:#6F81A8!important;}
.reptlev{
  font-family:'Inter',sans-serif!important;font-size:9px!important;
  background:#071B44!important;border-radius:5px!important;font-weight:600!important;
}
.repcur{
  background:linear-gradient(90deg,#040B1F,#030D2A)!important;
  border-top:1px solid #152D6E!important;font-size:12px!important;
}
.action-row{border-bottom:1px solid #0F2258!important;font-size:11px!important;}
.action-row.hero{background:rgba(255,194,71,.03)!important;}
.action-row.error{background:rgba(255,69,96,.04)!important;}
.ar-street{font-family:'Space Grotesk',sans-serif!important;font-size:8.5px!important;}
.hand-listing{border-radius:14px!important;}
.hand-listing-hdr{padding:10px 15px!important;}
.vstats{
  background:rgba(155,92,255,.06)!important;
  border-top:1px solid rgba(155,92,255,.15)!important;padding:8px 12px!important;
}
.vstat-pill{font-size:10px!important;padding:3px 10px!important;}
.street-chip{font-size:11px!important;padding:5px 14px!important;}

/* REPWRAP */
.repwrap{
  padding:18px 22px!important;
  background:linear-gradient(180deg,#030712,#030712)!important;
}
.repup{
  border-radius:12px!important;padding:22px!important;font-size:13px!important;
}
.rephh{font-size:10.5px!important;height:80px!important;}
.apikey-box{border-radius:10px!important;}
.apikey-input{font-size:11px!important;padding:8px 12px!important;}

/* ═══════════════════════════════════════════════════════
   MOBILE OVERRIDES — Ajustés
════════════════════════════════════════════════════════ */
/* ── PERF MOBILE : les backdrop-filter (blur) sont coûteux à rastériser et
   provoquent du jank au scroll sur smartphone. On les neutralise sous 768px ;
   les fonds translucides restent lisibles (alpha déjà élevé) et on opacifie
   légèrement les surfaces qui s'appuyaient sur le flou. ── */
@media(max-width:768px){
  *,*::before,*::after{
    backdrop-filter:none!important;
    -webkit-backdrop-filter:none!important;
  }
  .mobile-bottom-nav{background:linear-gradient(180deg,#0a1124,#030712)!important;}
  .pf-sheet-backdrop,.pf-solfull-backdrop{background:rgba(2,6,16,.82)!important;}
}
@media(max-width:768px){
  /* Nav latérale cachée → remplacée par bottom nav */
  .leftnav{display:none!important;}

  /* Bottom navigation mobile */
  .mobile-bottom-nav{
    display:flex!important;position:fixed;bottom:0;left:0;right:0;z-index:100;
    background:linear-gradient(180deg,rgba(3,7,18,.98),#030712);
    border-top:1px solid #1A3A80;height:60px;
    padding:0 8px;align-items:center;justify-content:space-around;
    backdrop-filter:blur(12px);
    box-shadow:0 -4px 24px rgba(3,7,18,.8),0 -1px 0 rgba(31,139,255,.15);
  }
  .mob-nav-btn{
    display:flex;flex-direction:column;align-items:center;gap:3px;
    padding:6px 10px;border-radius:10px;cursor:pointer;transition:all .18s;
    border:1px solid transparent;min-width:44px;
  }
  .mob-nav-btn:hover,.mob-nav-btn.on{
    background:rgba(31,139,255,.12);border-color:rgba(31,139,255,.25);
  }
  .mob-nav-btn .lnav-ico{font-size:20px!important;}
  .mob-nav-btn .lnav-lbl{font-size:8px!important;font-weight:600;}

  /* Adjust body for bottom nav */
  .app{padding-bottom:60px;}

  .hdr{height:48px!important;padding:0 12px!important;}
  .brand{font-size:15px!important;letter-spacing:2px!important;}
  .brand-sub{display:none!important;}
  .hdr-sep{display:none!important;}
  .nav{display:none!important;}
  .hdrbadge{display:none!important;}
  .poker-slideshow{height:120px!important;}
  .leftnav{display:none!important;}

  /* ── Tables mobile ── */
  .seat1t .seatpos{font-size:12px!important;}
  .seat1t .seatstk{font-size:11px!important;}
  .ab{font-size:12px!important;min-height:54px!important;padding:12px 4px!important;}
  .dealer-btn{width:18px!important;height:18px!important;font-size:8px!important;}

  /* ── FIX 1 : gto-panel max-height → ne dépasse plus la bottom nav ──
     40vh = ~325px sur 812px. Panel part à ~380px → finit à 705px < nav(752). ✓ */
  .gto-panel{max-height:40vh!important;}

  /* ── FIX 2 : gto-next-zone sticky → ajoute espace bottom nav ── */
  .gto-next-zone{
    position:sticky!important;bottom:0!important;
    padding-bottom:8px!important;
    background:linear-gradient(180deg,rgba(3,7,18,.96),#030D2A)!important;
  }

  /* ── FIX 3 : Solution masquée — panneau minimal ne dépasse pas non plus ── */
  .gto-masked-panel{padding-bottom:8px!important;}

  /* ── FIX 4 : Multi-table — padding bottom global pour la nav ── */
  /* Gold Master §1 : la nav est déjà réservée par .app{padding-bottom:60px}.
     On ne garde qu'une marge de sécurité minimale ici → ~60px de hauteur rendus
     au playrow (table + bloc bas remontent contre la nav). */
  .trainer-scroll-area{padding-bottom:16px!important;}
  .grid2,.grid3,.grid4,.grid6,.grid8{padding-bottom:10px!important;}

  /* ── FIX 5 : Trainer — zone action multi-table ── */
  .gto-action-zone{padding-bottom:16px!important;}

  /* ── Sidebar collapsible — hidden on mobile (drawer géré par mob-filter-bar) ── */
  .trainer-sidebar,.sb-toggle{display:none!important;}
  .trainer-sidebar.mob-open{display:flex!important;width:100%!important;position:fixed!important;top:44px!important;left:0!important;right:0!important;z-index:50!important;max-height:60vh!important;overflow-y:auto!important;}

  /* ── FIX 6 : Shark Solver — layout mobile vertical ── */
  /* Outer row → colonne */
  .shark-body-row{flex-direction:column!important;}
  /* Panneau scénarios → bande horizontale scrollable */
  .shark-left-col{
    width:100%!important;max-height:120px!important;min-height:120px!important;
    overflow-y:hidden!important;overflow-x:auto!important;
    border-right:none!important;border-bottom:1px solid #1A3A80!important;
    flex-direction:row!important;flex-wrap:nowrap!important;
    padding:8px 10px!important;gap:6px!important;
    display:flex!important;align-items:center!important;
  }
  /* Scenarios en mini pills horizontaux */
  .shark-left-col > div > div{
    min-width:110px!important;max-width:140px!important;flex-shrink:0!important;
  }
  .shark-left-col > div{
    display:flex!important;flex-direction:row!important;
    flex-wrap:nowrap!important;gap:6px!important;width:max-content!important;
  }
  /* Matrice — prend la hauteur restante */
  .shark-body-row > div:last-child{
    flex:1!important;overflow:auto!important;min-height:0!important;
  }
  /* Double matrice → Hero d'abord, Villain en onglet */
  .shark-matrix-tabs{display:flex!important;}
  .shark-matrix-tab{
    flex:1!important;padding:8px 6px!important;border-radius:8px!important;
    background:#0A1530!important;border:1px solid #1A3A80!important;color:#6F81A8!important;
    font-family:'Inter',sans-serif!important;font-size:10px!important;font-weight:700!important;
    letter-spacing:.08em!important;cursor:pointer!important;
  }
  .shark-matrix-tab.on{
    background:rgba(52,216,255,.12)!important;border-color:rgba(52,216,255,.4)!important;color:#34D8FF!important;
  }
  .shark-matrix-pane{display:none!important;width:100%!important;flex:none!important;min-width:0!important;overflow-x:auto!important;}
  .shark-matrix-pane.shark-pane-active{display:block!important;}
  /* Cellules de matrice sur mobile (une seule matrice visible à la fois) */
  /* + de largeur dispo : padding réduit + colonne de rangs compacte → la matrice tient
     pleinement sans scroll horizontal et reste lisible. */
  .shark-main-col{padding:10px 5px!important;}
  .shark-cell{width:25px!important;height:25px!important;font-size:8.5px!important;}
  .shark-rank{width:18px!important;min-width:18px!important;font-size:9px!important;}
  /* Boutons de la barre d'actions Solver — plus grands sur mobile */
  .shark-action-bar{padding:10px!important;}
  .shark-action-bar button{
    flex:1 1 auto!important;min-width:46%!important;padding:11px 10px!important;font-size:11px!important;
  }


  /* ── FIX 7 : Replayer — empiler les colonnes verticalement ── */
  .rep-cols-wrap{grid-template-columns:1fr!important;gap:8px!important;}
  .rep-left-col{width:100%!important;}

  /* ── FIX 8 : HUD trainer — wrapping propre ── */
  .trainer-hud{flex-wrap:wrap!important;gap:4px!important;padding:4px 10px!important;}
  .hud-chip{font-size:8.5px!important;padding:2px 7px!important;}

  /* ── FIX 9 : Coach nav scroll ── */
  .coach-nav{overflow-x:auto!important;padding:0 8px!important;}
  .coach-ntab{white-space:nowrap!important;flex-shrink:0!important;}
  .coach-body{padding:12px!important;}

  /* ── Coach AI mobile ── */
  .coachai-nav{overflow-x:auto!important;padding:0 8px!important;}
  .coachai-ntab{white-space:nowrap!important;flex-shrink:0!important;padding:10px 12px!important;font-size:10px!important;}
  .cai-pane{padding:12px!important;}
  .cai-hero{padding:14px 16px!important;}
  .cai-grid2,.cai-grid3,.cai-grid4{grid-template-columns:1fr!important;}
  .cai-fab{bottom:72px!important;right:14px!important;padding:11px 16px!important;font-size:11px!important;}
  .cai-fab-panel{right:14px!important;left:14px!important;width:auto!important;bottom:128px!important;max-height:50vh!important;}
}

/* ═══════════════════════════════════════════════════════
   GLOBAL UX POLISH — Bug fixes & micro-améliorations
════════════════════════════════════════════════════════ */

/* Fix slide-img ne déborde plus */
.poker-slideshow{overflow:hidden!important;}

/* ═══════════════════════════════════════════════════════
   SIDEBAR COLLAPSIBLE — Trainer GTO Wizard
════════════════════════════════════════════════════════ */
.trainer-sidebar{
  width:228px;flex-shrink:0;overflow:hidden;
  transition:width 320ms cubic-bezier(.4,0,.2,1);
  position:relative;
  background:linear-gradient(180deg,#071B44 0%,#030D2A 100%);
  border-right:1px solid #1A3A80;
  display:flex;flex-direction:column;
}
.trainer-sidebar.collapsed{width:58px;}
.trainer-sidebar .sb-full{
  opacity:1;transition:opacity 180ms ease;
  overflow-y:auto;flex:1;min-width:0;
}
.trainer-sidebar.collapsed .sb-full{
  opacity:0;pointer-events:none;overflow:hidden;height:0;
}
.trainer-sidebar .sb-icons{
  display:none;flex-direction:column;align-items:center;
  gap:4px;padding:10px 0 8px;flex:1;overflow:hidden;
}
.trainer-sidebar.collapsed .sb-icons{display:flex;}
.sb-toggle{
  position:absolute;right:-13px;top:50%;transform:translateY(-50%);
  width:26px;height:26px;border-radius:50%;
  background:linear-gradient(135deg,#1F8BFF,#0B2F77);
  border:2px solid #1A3A80;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;z-index:30;
  box-shadow:0 2px 12px rgba(31,139,255,.35);
  transition:all .22s;font-size:10px;color:#FFFFFF;font-weight:900;
  user-select:none;
}
.sb-toggle:hover{
  background:linear-gradient(135deg,#34D8FF,#1F8BFF);
  box-shadow:0 4px 20px rgba(31,139,255,.55);
  transform:translateY(-50%) scale(1.12);
}
.sb-icon-btn{
  width:42px;height:42px;border-radius:10px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:2px;cursor:pointer;transition:all .15s;
  border:1px solid transparent;font-size:17px;
}
.sb-icon-btn:hover{background:rgba(31,139,255,.1);border-color:rgba(31,139,255,.2);}
.sb-icon-btn.active{background:rgba(255,194,71,.15);border-color:rgba(255,194,71,.35);}
.sb-icon-btn .lbl{font-family:'Inter',sans-serif;font-size:6.5px;color:#6F81A8;font-weight:600;}
.sb-stat-mini{
  width:42px;padding:5px 0;text-align:center;border-radius:8px;
  background:rgba(26,58,128,.25);margin:1px 0;
  border:1px solid rgba(26,58,128,.5);
}
.sb-stat-mini .v{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;display:block;}
.sb-stat-mini .l{font-family:'Inter',sans-serif;font-size:6.5px;color:#6F81A8;display:block;}
.sb-sep-line{width:32px;height:1px;background:linear-gradient(90deg,transparent,#1A3A80,transparent);margin:3px 0;flex-shrink:0;}
.sb-prog-mini{
  width:42px;height:4px;background:#152D6E;border-radius:2px;overflow:hidden;margin:2px 0;flex-shrink:0;
}
.sb-prog-mini-fill{height:100%;background:linear-gradient(90deg,#1F8BFF,#34D8FF);border-radius:2px;transition:width .4s;}

/* ── Header breadcrumb desktop / nav mobile ── */
/* Desktop : breadcrumb visible, nav cachée */
.hdr-breadcrumb{
  display:flex;align-items:center;
  padding:0 4px;flex-shrink:0;
}
.mob-hdr-nav{display:none!important;}

/* Mobile : nav visible, breadcrumb caché */
@media(max-width:768px){
  .hdr-breadcrumb{display:none!important;}
  .mob-hdr-nav{
    display:flex!important;flex:1!important;min-width:0!important;
    overflow-x:auto!important;scrollbar-width:none!important;
  }
  .mob-hdr-nav::-webkit-scrollbar{display:none!important;}
}

/* Nav desktop — géré par .hdr-breadcrumb (voir plus haut) */
@media(min-width:769px){
  .nav{display:none!important;}
  .spacer{flex:1!important;}
}

/* Scrollbars fines et discrètes */
.gto-panel::-webkit-scrollbar,
.coach-body::-webkit-scrollbar,
.repwrap::-webkit-scrollbar,
.settings-wrap::-webkit-scrollbar{width:3px;}
.gto-panel::-webkit-scrollbar-thumb,
.coach-body::-webkit-scrollbar-thumb,
.repwrap::-webkit-scrollbar-thumb{background:#1A3A80;border-radius:2px;}

/* Hover table wrapper — micro lift */
.tw{transition:box-shadow .25s,transform .18s!important;}
.tw:hover{transform:translateY(-1px)!important;}

/* Focus states accessibles */
input:focus,select:focus,textarea:focus{
  outline:2px solid rgba(31,139,255,.35)!important;
  outline-offset:1px!important;
  border-color:#1F8BFF!important;
}

/* Sélection texte */
::selection{background:rgba(31,139,255,.25);color:#FFFFFF;}
::-moz-selection{background:rgba(31,139,255,.25);color:#FFFFFF;}

/* Smooth scroll global */
*{scroll-behavior:smooth;}

/* Amélioration des boutons — feedback tactile */
.btng:active,.gto-next-btn:active{transform:scale(.97)!important;}

/* Stats JetBrains pour tous les chiffres */
.statv,.mc-v,.potval,.sescore,.sev,.evfreq,.streak-num{
  font-family:'JetBrains Mono',monospace!important;
}

/* Cards — ombre plus nette */
.card{box-shadow:0 4px 16px rgba(0,0,0,.6)!important;}
.card:hover{transform:translateY(-2px)!important;transition:transform .12s!important;}

/* Amélioration seats inactifs — plus lisibles */
.seat-inactive{opacity:.5!important;filter:saturate(.4) brightness(.85)!important;}

/* Dealer btn toujours sur le dessus */
.dealer-btn{z-index:25!important;}

/* Improve progress bars animation */
.pb,.progf,.cs-progfill,.gto-freq-fill,.action-timer-bar{
  transition:width .4s cubic-bezier(.4,0,.2,1)!important;
}

/* Amélioration des tooltips natifs */
[title]{cursor:help;}
.gto-btn[title]{cursor:pointer;}

/* Bottom nav hidden on desktop */
.mobile-bottom-nav{display:none;}

/* ─── MOBILE SAFE AREA (iPhone notch) ───────────────── */
@supports(padding-bottom:env(safe-area-inset-bottom)){
  @media(max-width:768px){
    .az,.nextrow{padding-bottom:calc(10px + env(safe-area-inset-bottom));}
    .mobile-bottom-nav{
      padding-bottom:calc(8px + env(safe-area-inset-bottom));
      height:calc(60px + env(safe-area-inset-bottom));
    }
    .app{padding-bottom:calc(60px + env(safe-area-inset-bottom));}
    /* gto-panel safe area */
    .gto-panel{max-height:calc(40vh - env(safe-area-inset-bottom))!important;}
  }
}

/* ═══════════════════════════════════════════════════════
   POKER EVENTS HUB
════════════════════════════════════════════════════════ */
.ev-hub{padding:0;}
.ev-featured{background:linear-gradient(135deg,#030E2E 0%,#071B44 45%,#0B2F77 100%);border:1px solid rgba(255,194,71,.28);border-radius:14px;padding:18px 22px;margin-bottom:14px;position:relative;overflow:hidden;}
.ev-featured-glow{position:absolute;top:-60px;right:-60px;width:220px;height:220px;border-radius:50%;pointer-events:none;}
.ev-featured-badge{display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:700;letter-spacing:.1em;color:#FFC247;background:rgba(255,194,71,.12);border:1px solid rgba(255,194,71,.3);border-radius:20px;padding:2px 10px;margin-bottom:10px;text-transform:uppercase;}
.ev-featured-name{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:900;color:#FFFFFF;line-height:1.1;margin-bottom:3px;}
.ev-featured-sub{font-size:10px;color:rgba(255,255,255,.45);margin-bottom:12px;font-family:'Inter',sans-serif;}
.ev-featured-gtd{font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:900;color:#FFC247;line-height:1;margin-bottom:8px;}
.ev-featured-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}
.ev-featured-btn{padding:7px 16px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;font-family:'Space Grotesk',sans-serif;transition:all .15s;border:none;}
.ev-featured-btn-primary{background:linear-gradient(90deg,#FFC247,#FF9800);color:#030712;}
.ev-featured-btn-primary:hover{opacity:.88;transform:translateY(-1px);}
.ev-featured-btn-secondary{background:rgba(255,255,255,.07);color:#FFFFFF;border:1px solid rgba(255,255,255,.18)!important;}
.ev-featured-btn-secondary:hover{background:rgba(255,255,255,.13);}
.ev-ongoing-badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:#10D87A;background:rgba(16,216,122,.1);border:1px solid rgba(16,216,122,.25);border-radius:20px;padding:4px 12px;}
.ev-ongoing-dot{width:7px;height:7px;border-radius:50%;background:#10D87A;animation:ev-pulse 1.4s ease-in-out infinite;}
@keyframes ev-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.45;transform:scale(.8);}}
.ev-cd-row{display:flex;gap:8px;margin-bottom:2px;}
.ev-cd-block{text-align:center;background:rgba(0,0,0,.32);border:1px solid rgba(255,194,71,.18);border-radius:8px;padding:7px 11px;min-width:50px;}
.ev-cd-num{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:900;color:#FFC247;line-height:1;}
.ev-cd-label{font-size:7px;color:rgba(255,255,255,.35);letter-spacing:.1em;text-transform:uppercase;margin-top:2px;}
.ev-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
.ev-view-btn{display:flex;align-items:center;gap:4px;padding:4px 11px;border-radius:7px;font-size:9px;font-weight:600;cursor:pointer;border:1px solid #1A3A80;background:#071B44;color:#9FB0CC;font-family:'Inter',sans-serif;transition:all .12s;}
.ev-view-btn.active{background:#1F8BFF;border-color:#1F8BFF;color:#FFFFFF;}
.ev-filter-sep{width:1px;height:18px;background:#152D6E;margin:0 2px;}
.ev-filter-label{font-size:8px;color:#4A6090;font-weight:700;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;}
.ev-chip{padding:3px 9px;border-radius:20px;font-size:8.5px;font-weight:600;cursor:pointer;border:1px solid #1A3A80;background:transparent;color:#6F81A8;font-family:'Inter',sans-serif;transition:all .12s;white-space:nowrap;}
.ev-chip:hover{border-color:#2E6CFF;color:#FFFFFF;}
.ev-chip.active{background:rgba(255,194,71,.1);border-color:rgba(255,194,71,.4);color:#FFC247;}
.ev-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;}
@media(max-width:600px){.ev-grid{grid-template-columns:1fr;}}
.ev-card{background:#071B44;border:1px solid #152D6E;border-radius:12px;padding:14px;transition:all .18s;cursor:pointer;position:relative;overflow:hidden;}
.ev-card:hover{border-color:#1A3A80;background:#0A2260;transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.45);}
.ev-card.ev-ongoing{border-color:rgba(16,216,122,.22);}
.ev-card.ev-finished{opacity:.55;}
.ev-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9px;gap:6px;}
.ev-circuit-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:7.5px;font-weight:800;letter-spacing:.07em;font-family:'Inter',sans-serif;}
.ev-status-badge{font-size:8px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;}
.ev-st-ongoing{background:rgba(16,216,122,.1);color:#10D87A;border:1px solid rgba(16,216,122,.22);}
.ev-st-upcoming{background:rgba(31,139,255,.08);color:#1F8BFF;border:1px solid rgba(31,139,255,.22);}
.ev-st-finished{background:rgba(255,255,255,.05);color:#4A6090;border:1px solid rgba(255,255,255,.08);}
.ev-card-name{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:800;color:#FFFFFF;line-height:1.2;margin-bottom:2px;}
.ev-card-loc{font-size:10px;color:#9FB0CC;margin-bottom:7px;display:flex;align-items:center;gap:4px;}
.ev-card-dates{font-family:'JetBrains Mono',monospace;font-size:8.5px;color:#FFC247;margin-bottom:7px;}
.ev-card-gtd{font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:900;color:#FFC247;line-height:1;margin-bottom:2px;}
.ev-card-gtd-sub{font-size:8px;color:#4A6090;margin-bottom:8px;}
.ev-mini-cd{display:flex;gap:5px;margin-bottom:9px;}
.ev-mini-cd-item{background:rgba(255,194,71,.07);border:1px solid rgba(255,194,71,.18);border-radius:6px;padding:3px 7px;text-align:center;min-width:36px;}
.ev-mini-cd-num{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:900;color:#FFC247;line-height:1;}
.ev-mini-cd-lbl{font-size:7px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.06em;}
.ev-formats{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:9px;}
.ev-fmt{font-size:7.5px;padding:2px 6px;border-radius:10px;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.03em;}
.ev-fmt-mtt{background:rgba(31,139,255,.1);color:#1F8BFF;border:1px solid rgba(31,139,255,.2);}
.ev-fmt-ko{background:rgba(255,69,96,.1);color:#FF4560;border:1px solid rgba(255,69,96,.2);}
.ev-fmt-mystery{background:rgba(155,92,255,.1);color:#9B5CFF;border:1px solid rgba(155,92,255,.2);}
.ev-fmt-pko{background:rgba(255,194,71,.1);color:#FFC247;border:1px solid rgba(255,194,71,.2);}
.ev-fmt-satellite{background:rgba(52,216,255,.08);color:#34D8FF;border:1px solid rgba(52,216,255,.18);}
.ev-card-footer{display:flex;gap:5px;align-items:center;border-top:1px solid #0F2258;padding-top:9px;margin-top:2px;}
.ev-prepare-btn{flex:1;padding:6px 0;border-radius:7px;font-size:9.5px;font-weight:700;cursor:pointer;background:rgba(255,194,71,.1);color:#FFC247;border:1px solid rgba(255,194,71,.28);font-family:'Space Grotesk',sans-serif;transition:all .15s;text-align:center;}
.ev-prepare-btn:hover{background:rgba(255,194,71,.22);transform:translateY(-1px);}
.ev-alert-btn{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid #1A3A80;background:transparent;font-size:13px;transition:all .15s;flex-shrink:0;}
.ev-alert-btn:hover{border-color:#2E6CFF;}
.ev-alert-btn.alerted{background:rgba(255,194,71,.12);border-color:rgba(255,194,71,.38);}
.ev-detail-link{font-size:8.5px;color:#3A5080;font-weight:600;font-family:'Inter',sans-serif;text-decoration:none;white-space:nowrap;transition:color .12s;flex-shrink:0;}
.ev-detail-link:hover{color:#1F8BFF;}
.ev-buyin{font-size:8.5px;color:#6F81A8;margin-bottom:7px;}
.ev-events-count{font-size:8px;color:#4A6090;margin-bottom:7px;}
.ev-rec-wrap{margin-bottom:14px;}
.ev-rec-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
.ev-rec-title{font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:800;color:#FFFFFF;}
.ev-rec-badge{font-size:8px;color:#FFC247;background:rgba(255,194,71,.1);border:1px solid rgba(255,194,71,.25);border-radius:20px;padding:2px 8px;font-weight:700;}
.ev-rec-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:4px;}
.ev-rec-row::-webkit-scrollbar{height:3px;}
.ev-rec-row::-webkit-scrollbar-track{background:transparent;}
.ev-rec-row::-webkit-scrollbar-thumb{background:#1A3A80;border-radius:2px;}
.ev-rec-card{background:#071B44;border:1px solid #152D6E;border-radius:10px;padding:12px;min-width:170px;max-width:170px;flex-shrink:0;transition:all .15s;cursor:pointer;}
.ev-rec-card:hover{border-color:#1A3A80;background:#0A2260;}
.ev-rec-name{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:800;color:#FFFFFF;margin-bottom:3px;line-height:1.3;}
.ev-rec-gtd{font-size:13px;font-weight:900;color:#FFC247;font-family:'Space Grotesk',sans-serif;}
.ev-rec-cd{font-size:9px;color:#9FB0CC;margin-top:3px;}
.ev-rec-prep{width:100%;margin-top:8px;padding:5px 0;border-radius:6px;font-size:9px;font-weight:700;cursor:pointer;background:rgba(255,194,71,.1);color:#FFC247;border:1px solid rgba(255,194,71,.25);font-family:'Space Grotesk',sans-serif;transition:all .15s;text-align:center;}
.ev-rec-prep:hover{background:rgba(255,194,71,.2);}
.ev-calendar{margin-bottom:14px;}
.ev-cal-nav-row{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
.ev-cal-title{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:800;color:#FFFFFF;flex:1;text-align:center;}
.ev-cal-btn{width:26px;height:26px;border-radius:6px;border:1px solid #1A3A80;background:#071B44;color:#9FB0CC;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all .12s;}
.ev-cal-btn:hover{border-color:#2E6CFF;color:#FFFFFF;}
.ev-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
.ev-cal-dh{font-size:8px;color:#4A6090;text-align:center;padding:4px 2px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}
.ev-cal-cell{aspect-ratio:1;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative;font-size:9px;font-weight:600;color:#6F81A8;transition:all .12s;cursor:default;border:1px solid transparent;}
.ev-cal-cell.has-ev{background:rgba(31,139,255,.07);border-color:rgba(31,139,255,.18);cursor:pointer;color:#FFFFFF;}
.ev-cal-cell.has-ev:hover{background:rgba(31,139,255,.16);}
.ev-cal-cell.today-cell{background:rgba(255,194,71,.07);border-color:rgba(255,194,71,.3);color:#FFC247;}
.ev-cal-cell.has-feat{border-color:rgba(255,194,71,.35);background:rgba(255,194,71,.08);}
.ev-cal-cell.empty{background:transparent;}
.ev-cal-dots{display:flex;gap:2px;justify-content:center;}
.ev-cal-dot{width:4px;height:4px;border-radius:50%;}
.ev-section-title{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:800;color:#FFFFFF;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
.ev-count-badge{font-size:9px;color:#9FB0CC;background:#071B44;border:1px solid #152D6E;border-radius:20px;padding:2px 8px;font-weight:600;}
.ev-empty{text-align:center;padding:28px 0;color:#4A6090;font-size:11px;font-family:'Inter',sans-serif;}
.ev-section-card{background:#050F2B;border:1px solid #0F2258;border-radius:14px;padding:16px;margin-bottom:12px;}
/* ═══ POKER NEWS HUB ═══════════════════════════════════════════════ */
.news-feat{background:linear-gradient(135deg,#030E2E 0%,#071B44 50%,#0B2F77 100%);border:1px solid rgba(255,69,96,.28);border-radius:14px;padding:18px 22px;margin-bottom:14px;position:relative;overflow:hidden;}
.news-feat-glow{position:absolute;top:-40px;right:-40px;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,#FF456044,transparent);pointer-events:none;}
.news-feat-badge{display:inline-flex;align-items:center;gap:5px;font-size:8px;font-weight:800;letter-spacing:.12em;color:#FF4560;background:rgba(255,69,96,.12);border:1px solid rgba(255,69,96,.28);border-radius:20px;padding:2px 10px;margin-bottom:8px;text-transform:uppercase;font-family:'Inter',sans-serif;}
.news-feat-title{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:900;color:#FFFFFF;line-height:1.25;margin-bottom:5px;}
.news-feat-meta{font-size:9px;color:rgba(255,255,255,.42);margin-bottom:12px;font-family:'Inter',sans-serif;}
.news-feat-actions{display:flex;gap:7px;flex-wrap:wrap;}
.news-score-badge{font-size:7.5px;font-weight:800;padding:2px 7px;border-radius:20px;font-family:'Inter',sans-serif;letter-spacing:.05em;white-space:nowrap;}
.news-score-major{background:rgba(255,69,96,.1);color:#FF4560;border:1px solid rgba(255,69,96,.25);}
.news-score-imp{background:rgba(255,194,71,.1);color:#FFC247;border:1px solid rgba(255,194,71,.25);}
.news-score-std{background:rgba(159,176,204,.07);color:#6F81A8;border:1px solid rgba(159,176,204,.13);}
.news-type-badge{font-size:7.5px;font-weight:800;padding:2px 7px;border-radius:20px;font-family:'Inter',sans-serif;}
.news-type-vid{background:rgba(16,216,122,.1);color:#10D87A;border:1px solid rgba(16,216,122,.22);}
.news-type-pod{background:rgba(155,92,255,.1);color:#9B5CFF;border:1px solid rgba(155,92,255,.22);}
.news-card{background:#071B44;border:1px solid #152D6E;border-radius:12px;padding:12px 14px;margin-bottom:8px;transition:border-color .15s,background .15s;}
.news-card:hover{border-color:#1A3A80;background:#0A2260;}
.news-card-title{font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:#FFFFFF;line-height:1.35;margin-bottom:7px;}
.news-card-footer{display:flex;gap:6px;align-items:center;border-top:1px solid #0F2258;padding-top:8px;margin-top:6px;flex-wrap:wrap;}
.news-read-btn{padding:4px 11px;border-radius:7px;font-size:9px;font-weight:700;cursor:pointer;background:rgba(31,139,255,.1);color:#1F8BFF;border:1px solid rgba(31,139,255,.28);font-family:'Space Grotesk',sans-serif;transition:background .15s;text-decoration:none;display:inline-flex;align-items:center;}
.news-read-btn:hover{background:rgba(31,139,255,.2);}
.news-sum-btn{padding:4px 11px;border-radius:7px;font-size:9px;font-weight:700;cursor:pointer;background:rgba(155,92,255,.08);color:#9B5CFF;border:1px solid rgba(155,92,255,.2);font-family:'Space Grotesk',sans-serif;transition:background .15s;}
.news-sum-btn:hover{background:rgba(155,92,255,.16);}
.news-train-btn{padding:4px 11px;border-radius:7px;font-size:9px;font-weight:700;cursor:pointer;background:rgba(255,194,71,.1);color:#FFC247;border:1px solid rgba(255,194,71,.28);font-family:'Space Grotesk',sans-serif;transition:background .15s;}
.news-train-btn:hover{background:rgba(255,194,71,.2);}
.news-summary{background:rgba(155,92,255,.06);border:1px solid rgba(155,92,255,.18);border-radius:8px;padding:10px 12px;margin:8px 0;}
.news-sum-title{font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:800;color:#9B5CFF;margin-bottom:5px;}
.news-sum-item{font-size:10px;color:#9FB0CC;margin-bottom:3px;font-family:'Inter',sans-serif;line-height:1.5;}
.news-section-card{background:#050F2B;border:1px solid #0F2258;border-radius:14px;padding:14px 16px;margin-bottom:12px;}
.trend-row{display:flex;gap:8px;flex-wrap:wrap;}
.trend-item{flex:1;min-width:100px;background:#071B44;border:1px solid #152D6E;border-radius:10px;padding:10px 12px;text-align:center;}
.trend-label{font-size:9.5px;font-weight:700;color:#FFFFFF;font-family:'Space Grotesk',sans-serif;margin-bottom:3px;}
.trend-delta{font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:900;line-height:1;margin-bottom:2px;}
.trend-up{color:#10D87A;}
.trend-down{color:#FF4560;}
.trend-detail{font-size:7.5px;color:#4A6090;font-family:'Inter',sans-serif;}
.news-rec-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;}
.news-rec-row::-webkit-scrollbar{height:3px;}
.news-rec-row::-webkit-scrollbar-track{background:transparent;}
.news-rec-row::-webkit-scrollbar-thumb{background:#152D6E;border-radius:3px;}
.news-rec-card{background:#071B44;border:1px solid #152D6E;border-radius:10px;padding:12px;min-width:190px;max-width:190px;flex-shrink:0;transition:all .15s;}
.news-rec-card:hover{border-color:#1A3A80;background:#0A2260;}
.news-rec-title{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:700;color:#FFFFFF;margin:5px 0 4px;line-height:1.3;}
.news-rec-src{font-size:8px;font-weight:600;margin-bottom:7px;font-family:'Inter',sans-serif;}

/* ═══════════════════════════════════════════════════════════════
   MOBILE TRAINING v9 — REFONTE NATIVE
   Architecture 4 zones · Bottom Sheet · FAB Solution · Timeline
   Focus Mode · Multi-tables 2×2 · Accessibilité · 60fps
════════════════════════════════════════════════════════════════ */

/* ── Defaults desktop : éléments mobiles cachés ── */
.mtr-top,.mtr-timeline,.mtr-spothead,.t1-mob,.pf-fab,.pf-focus-exit,.mt-expand-x,.mt-expand-btn,.mt-zoom-reset{display:none;}
.pf-sheet-backdrop,.pf-solfull-backdrop{display:none;}

/* ── Animations GPU-only (transform/opacity) ── */
@keyframes pfSheetUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
@keyframes pfSolUp{from{transform:translateY(28px);opacity:0;}to{transform:translateY(0);opacity:1;}}
@keyframes pfFadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes pfFabPop{0%{transform:scale(.4);opacity:0;}70%{transform:scale(1.08);}100%{transform:scale(1);opacity:1;}}
@keyframes pfFabPulse{0%,100%{box-shadow:0 6px 22px rgba(255,194,71,.45),0 0 0 0 rgba(255,194,71,.35);}50%{box-shadow:0 6px 26px rgba(255,194,71,.6),0 0 0 9px rgba(255,194,71,0);}}
@keyframes pfDotPop{0%{transform:scale(.3);}80%{transform:scale(1.15);}100%{transform:scale(1);}}
@keyframes pfCurDot{0%,100%{box-shadow:0 0 0 0 rgba(255,194,71,.5);}50%{box-shadow:0 0 0 5px rgba(255,194,71,0);}}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;}
}

/* ════════════ MOBILE ≤768px — LE CŒUR DE LA REFONTE ════════════ */
@media(max-width:768px){

  /* ─── ZONE 1 : BARRE SUPÉRIEURE COMPACTE ─── */
  .trainer-topstrip{display:none!important;}   /* ancienne barre desktop */
  .mtr-top{
    display:flex!important;align-items:center;gap:7px;
    padding:6px 10px;flex-shrink:0;min-height:42px;
    background:linear-gradient(90deg,#030D2A,#071B44 55%,#030D2A);
    border-bottom:1px solid #1A3A80;
  }
  .mtr-fmt{
    display:inline-flex;align-items:center;gap:4px;flex-shrink:0;
    padding:3px 8px;border-radius:7px;
    font-family:'Space Grotesk',sans-serif;font-size:9px;font-weight:800;
    letter-spacing:.04em;white-space:nowrap;
  }
  .mtr-prog-wrap{flex:1;min-width:40px;display:flex;flex-direction:column;gap:3px;}
  .mtr-prog-line{display:flex;align-items:baseline;gap:5px;}
  .mtr-prog-count{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#FFC247;}
  .mtr-prog-left{font-family:'Inter',sans-serif;font-size:8px;color:#6F81A8;font-weight:600;white-space:nowrap;}
  .mtr-prog-track{height:4px;background:#0B2150;border-radius:3px;overflow:hidden;}
  .mtr-prog-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#1F8BFF,#34D8FF);transition:width .4s cubic-bezier(.4,0,.2,1);}
  .mtr-acc{flex-shrink:0;text-align:center;line-height:1.15;}
  .mtr-acc .v{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:800;display:block;}
  .mtr-acc .l{font-family:'Inter',sans-serif;font-size:6.5px;color:#6F81A8;font-weight:700;letter-spacing:.06em;display:block;}
  .mtr-ico-btn{
    width:34px;height:34px;border-radius:9px;flex-shrink:0;
    display:inline-flex;align-items:center;justify-content:center;
    background:#071B44;border:1px solid #1A3A80;color:#9FB0CC;
    font-size:15px;cursor:pointer;transition:transform .12s,background .15s;
    -webkit-tap-highlight-color:transparent;
  }
  .mtr-ico-btn:active{transform:scale(.92);}
  .mtr-ico-btn.stop{color:#FF4560;border-color:rgba(255,69,96,.4);background:rgba(255,69,96,.08);}
  .mtr-ico-btn.on{color:#FFC247;border-color:rgba(255,194,71,.45);background:rgba(255,194,71,.1);}

  /* ─── TIMELINE DE SESSION : Spot 1 → N ─── */
  .mtr-timeline{
    display:flex!important;align-items:center;gap:6px;flex-shrink:0;
    padding:5px 10px;overflow-x:auto;scrollbar-width:none;
    -webkit-overflow-scrolling:touch;
    background:#030917;border-bottom:1px solid #0F2452;
  }
  .mtr-timeline::-webkit-scrollbar{display:none;}
  .mtr-dot{
    width:24px;height:24px;border-radius:50%;flex-shrink:0;position:relative;
    display:inline-flex;align-items:center;justify-content:center;
    font-size:10px;font-weight:800;font-family:'JetBrains Mono',monospace;
    background:rgba(26,58,128,.25);border:1.5px solid #152D6E;
    color:#4A639E;cursor:pointer;-webkit-tap-highlight-color:transparent;
    animation:pfDotPop .25s cubic-bezier(.22,.68,.36,1) both;
  }
  .mtr-dot.ok{background:rgba(16,216,122,.14);border-color:rgba(16,216,122,.55);color:#10D87A;}
  .mtr-dot.ko{background:rgba(255,69,96,.12);border-color:rgba(255,69,96,.5);color:#FF4560;}
  .mtr-dot.approx{background:rgba(255,194,71,.12);border-color:rgba(255,194,71,.5);color:#FFC247;}
  .mtr-dot.cur{background:rgba(255,194,71,.16);border-color:#FFC247;color:#FFC247;animation:pfCurDot 1.6s ease-in-out infinite;}
  .mtr-dot .star{
    position:absolute;top:-5px;right:-5px;font-size:8px;line-height:1;
    filter:drop-shadow(0 0 3px rgba(255,194,71,.8));
  }

  /* ─── Streets + timer du spot (sous Zone 1) ─── */
  .mtr-spothead{
    display:flex!important;align-items:center;gap:5px;flex-shrink:0;
    padding:4px 10px;min-height:26px;
    background:#040C20;border-bottom:1px solid #0F2452;
  }
  .mtr-street{
    padding:1px 8px;border-radius:14px;flex-shrink:0;
    font-family:'Space Grotesk',sans-serif;font-size:8px;font-weight:700;letter-spacing:.05em;
    background:rgba(255,255,255,.03);color:#4A639E;border:1px solid transparent;
  }
  .mtr-street.cur{background:rgba(255,194,71,.14);color:#FFC247;border-color:rgba(255,194,71,.35);}
  .mtr-street.done{background:rgba(16,216,122,.08);color:#10D87A;}
  .mtr-timer-track{width:58px;height:4px;border-radius:3px;background:#0B2150;overflow:hidden;display:inline-block;}
  .mtr-timer-fill{display:block;height:100%;border-radius:3px;transition:width .08s linear;}

  /* ─── ZONE 2 : TABLE = ÉLÉMENT PRINCIPAL (65-75%) ─── */
  .t1-row{flex-direction:column!important;}
  .t1-left{flex:1 1 auto!important;min-height:0;}
  .t1-right{display:none!important;}            /* panneau droit desktop → bottom sheet */
  .t1-actions-under{display:none!important;}    /* REFONTE MOBILE : actions gérées par .t1-mob (sinon double bandeau de décision) */
  .t1-mob{display:flex!important;flex-direction:column;flex-shrink:0;}
  /* FIX mobile 1T : la table doit remplir la hauteur dispo (sinon felt à 0px) */
  .grid1{grid-auto-rows:minmax(0,1fr)!important;}
  .grid1>.mt-slot{height:100%!important;min-height:0!important;flex:1 1 auto!important;display:flex!important;flex-direction:column!important;}
  .grid1>.mt-slot>div{flex:1 1 auto!important;min-height:0!important;}
  /* Felt plus ample en portrait */
  .t1-left .felt-oval{top:6%!important;left:12%!important;right:12%!important;bottom:5%!important;}
  /* Maquette mobile 1T : feutre VERT sombre texturé + anneau doré + bord bleu-nuit (identité web) */
  .t1-left .felt-oval{background:radial-gradient(ellipse at 50% 26%,rgba(46,132,79,.80) 0%,rgba(21,86,49,.95) 38%,rgba(9,50,27,.99) 70%,#05160D 100%)!important;border:1px solid rgba(255,214,121,.62)!important;box-shadow:inset 0 0 90px rgba(0,0,0,.55),0 0 0 3px rgba(6,18,32,.95),0 0 0 5px rgba(255,194,71,.42),0 0 0 7px rgba(31,58,102,.5),0 16px 40px rgba(0,0,0,.75)!important;}
  /* Pot mobile : jetons + texte seulement, aucun socle/ovale gris (spec §6) */
  .t1-left .pf-pot-readout{background:transparent!important;border:none!important;box-shadow:none!important;backdrop-filter:none!important;}
  /* Pot COMPACT HORIZONTAL (mission premium P1/§8) : [jetons] POT 16.5bb sur une
     ligne -> ~22px de haut, tient entre la plaque du siège haut et le board,
     zone fixe indépendante des mises. */
  .t1-left .pf-pot-readout{flex-direction:row!important;align-items:center!important;gap:5px!important;white-space:nowrap!important;}
  .t1-left .pf-pot-readout .pf-chip-stack,.t1-left .pf-pot-readout>*:first-child{transform:scale(.72);transform-origin:center;}
  .t1-left .pf-pot-label{font-size:8px!important;}
  .t1-left .pf-pot-value{font-size:14px!important;}
  /* Board mobile : cartes plus lisibles, centré (spec §7) */
  .t1-left .pf-board-zone{gap:8px!important;}
  /* Board mobile : cartes réduites (la taille desktop 57px faisait un board de
     317px, PLUS LARGE que le feutre 306px → débordait sur les sièges latéraux). */
  .t1-left .card-1t-board{width:38px!important;height:53px!important;border-radius:5px!important;}
  .t1-left .card-1t-board .card-corner-r{font-size:15px!important;}
  .t1-left .card-1t-board .card-corner-s{font-size:11px!important;}
  .t1-left .card-1t-board .card-center{font-size:22px!important;}
  /* HUD → ruban scrollable une ligne */
  .trainer-hud{
    flex-wrap:nowrap!important;overflow-x:auto!important;scrollbar-width:none!important;
    padding:4px 10px!important;gap:5px!important;
  }
  .trainer-hud::-webkit-scrollbar{display:none;}
  .trainer-hud .hud-chip{flex-shrink:0;white-space:nowrap;}

  /* Sièges 1T compacts mais lisibles */
  .player-card-1t{padding:0!important;min-width:54px!important;background:transparent!important;border:0!important;box-shadow:none!important;}
  .player-card-1t .seat-card-stats{font-size:6.5px!important;}
  .seat-range-btn{width:20px!important;height:20px!important;font-size:9px!important;}

  /* ─── ZONE 3 : ACTIONS TOUJOURS VISIBLES ─── */
  .mtr-actions{
    flex-shrink:0;
    background:linear-gradient(180deg,rgba(255,194,71,.05),#030912 30%,#02060F);
    border-top:1px solid rgba(255,194,71,.22);
    padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px));
  }
  .mtr-actions .gto-btn{min-height:58px;border-radius:13px;}
  .mtr-actions .gto-btn .gto-btn-inner{padding:11px 6px 9px!important;}
  .mtr-actions .gto-btn-label{font-size:15px!important;}
  .mtr-actions .gto-btn-sizing{font-size:10.5px!important;}
  .mtr-actions .gto-btn-hint{display:none!important;}
  .mtr-actions .sizing-btn{min-height:32px;font-size:10px;border-radius:8px;flex:1;}
  .mtr-actions .sizing-custom{margin-top:4px;}
  .mtr-actions .sizing-step-btn{width:38px;height:32px;font-size:15px;}
  /* zone réponse héro (face à un raise) */
  .mtr-actions .ab{min-height:56px!important;border-radius:12px!important;font-size:13px!important;}

  /* ─── FAB « VOIR LA SOLUTION » ─── */
  .pf-fab{
    display:inline-flex!important;align-items:center;gap:8px;
    position:fixed;right:14px;z-index:160;
    bottom:calc(150px + env(safe-area-inset-bottom,0px));
    padding:13px 18px;border-radius:30px;border:none;cursor:pointer;
    background:linear-gradient(135deg,#FFC247,#FF9800);color:#030712;
    font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:800;letter-spacing:.03em;
    box-shadow:0 6px 22px rgba(255,194,71,.45);
    animation:pfFabPop .3s cubic-bezier(.22,.68,.36,1) both,pfFabPulse 2.2s ease-in-out .4s infinite;
    -webkit-tap-highlight-color:transparent;
  }
  .pf-fab:active{transform:scale(.94);}
  .pf-fab.locked{background:linear-gradient(135deg,#152D6E,#0B2150);color:#9FB0CC;box-shadow:0 6px 18px rgba(0,0,0,.5);animation:pfFabPop .3s both;}
  body.pf-focus .pf-fab{bottom:calc(118px + env(safe-area-inset-bottom,0px));}

  /* ─── SOLUTION PLEIN ÉCRAN ─── */
  .pf-solfull-backdrop{display:block!important;position:fixed;inset:0;z-index:380;background:rgba(2,6,16,.72);backdrop-filter:blur(3px);animation:pfFadeIn .2s both;}
  .pf-solfull{
    position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;
    background:linear-gradient(180deg,#040B1F,#030712);
    animation:pfSolUp .3s cubic-bezier(.22,.68,.36,1) both;
    overscroll-behavior:contain;
  }
  .pf-solfull-hdr{
    flex-shrink:0;display:flex;align-items:center;gap:10px;
    padding:8px 14px 8px;border-bottom:1px solid #152D6E;
    background:linear-gradient(90deg,#071B44,#040B1F);
    touch-action:none;
  }
  .pf-solfull-grip{
    position:absolute;top:5px;left:50%;transform:translateX(-50%);
    width:42px;height:4px;border-radius:3px;background:#2E4A8E;
  }
  .pf-solfull-title{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:800;color:#FFFFFF;letter-spacing:.05em;}
  .pf-solfull-x{
    margin-left:auto;width:34px;height:34px;border-radius:50%;border:1px solid #1A3A80;
    background:#071B44;color:#9FB0CC;font-size:15px;cursor:pointer;
    display:inline-flex;align-items:center;justify-content:center;
    -webkit-tap-highlight-color:transparent;
  }
  .pf-solfull-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px 20px;}
  .pf-solfull-foot{
    flex-shrink:0;display:flex;gap:8px;padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px));
    background:linear-gradient(180deg,rgba(3,7,18,.6),#030712);border-top:1px solid #152D6E;
  }
  .pf-sol-opt{
    border-radius:14px;padding:13px 14px;margin-bottom:10px;
    background:linear-gradient(135deg,rgba(16,216,122,.12),rgba(16,216,122,.03));
    border:1px solid rgba(16,216,122,.35);
  }
  .pf-sol-opt-lbl{font-family:'Space Grotesk',sans-serif;font-size:8.5px;font-weight:800;letter-spacing:.12em;color:#10D87A;margin-bottom:5px;}
  .pf-sol-opt-act{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:900;color:#FFFFFF;line-height:1.1;}
  .pf-sol-opt-row{display:flex;gap:14px;margin-top:7px;flex-wrap:wrap;}
  .pf-sol-kv .k{font-family:'Inter',sans-serif;font-size:8px;color:#6F81A8;letter-spacing:.07em;font-weight:700;display:block;}
  .pf-sol-kv .v{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;}
  .pf-sol-sec-title{font-family:'Space Grotesk',sans-serif;font-size:9px;font-weight:800;letter-spacing:.12em;color:#34D8FF;margin:13px 2px 7px;}
  .pf-sol-tree{display:flex;flex-direction:column;gap:6px;}
  .pf-sol-tree-row{
    display:flex;align-items:flex-start;gap:9px;padding:9px 11px;border-radius:10px;
    background:#071B44;border:1px solid #152D6E;
  }
  .pf-sol-tree-ico{font-size:13px;flex-shrink:0;}
  .pf-sol-tree-txt{font-family:'Inter',sans-serif;font-size:11.5px;color:#C9D4E8;line-height:1.55;}

  /* ─── ZONE 4 : BOTTOM SHEET ─── */
  .pf-sheet-backdrop{display:block!important;position:fixed;inset:0;z-index:300;background:rgba(2,6,16,.6);backdrop-filter:blur(2px);animation:pfFadeIn .18s both;}
  .pf-sheet{
    position:fixed;left:0;right:0;bottom:0;z-index:320;
    max-height:76vh;max-height:76dvh;display:flex;flex-direction:column;
    background:linear-gradient(180deg,#071B44,#040B1F 30%);
    border-radius:20px 20px 0 0;border:1px solid #1A3A80;border-bottom:none;
    box-shadow:0 -12px 50px rgba(0,0,0,.7);
    animation:pfSheetUp .3s cubic-bezier(.22,.68,.36,1) both;
    overscroll-behavior:contain;
    padding-bottom:env(safe-area-inset-bottom,0px);
  }
  .pf-sheet-handle{flex-shrink:0;padding:8px 0 5px;display:flex;justify-content:center;cursor:grab;touch-action:none;}
  .pf-sheet-grip{width:42px;height:4.5px;border-radius:3px;background:#2E4A8E;}
  .pf-sheet-tabs{
    flex-shrink:0;display:flex;gap:4px;padding:4px 10px 8px;
    border-bottom:1px solid #152D6E;overflow-x:auto;scrollbar-width:none;
  }
  .pf-sheet-tabs::-webkit-scrollbar{display:none;}
  .pf-sheet-tab{
    flex:1;min-width:64px;padding:8px 6px;border-radius:10px;text-align:center;
    font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:700;
    color:#6F81A8;background:transparent;border:1px solid transparent;cursor:pointer;
    white-space:nowrap;transition:all .15s;-webkit-tap-highlight-color:transparent;
  }
  .pf-sheet-tab.on{color:#FFC247;background:rgba(255,194,71,.1);border-color:rgba(255,194,71,.35);}
  .pf-sheet-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px 18px;min-height:200px;}

  /* Carte Vilain IA premium */
  .pf-vil-card{border-radius:16px;padding:14px;border:1px solid;background:linear-gradient(160deg,rgba(155,92,255,.1),rgba(7,27,68,.4));}
  .pf-vil-head{display:flex;align-items:center;gap:11px;margin-bottom:12px;}
  .pf-vil-ava{width:52px;height:52px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:25px;border:2.5px solid;}
  .pf-vil-type{font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:900;line-height:1.1;}
  .pf-vil-sub{font-family:'Inter',sans-serif;font-size:9.5px;color:#9FB0CC;margin-top:2px;line-height:1.4;}
  .pf-vil-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:11px;}
  .pf-vil-stat{background:rgba(3,9,23,.55);border:1px solid #152D6E;border-radius:11px;padding:8px 6px;text-align:center;}
  .pf-vil-stat .v{font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:800;display:block;}
  .pf-vil-stat .l{font-family:'Inter',sans-serif;font-size:7px;color:#6F81A8;font-weight:700;letter-spacing:.08em;display:block;margin-top:2px;}
  .pf-vil-block{border-radius:11px;padding:9px 11px;margin-bottom:7px;border:1px solid;}
  .pf-vil-block .t{font-family:'Space Grotesk',sans-serif;font-size:8px;font-weight:800;letter-spacing:.1em;margin-bottom:4px;display:flex;align-items:center;gap:5px;}
  .pf-vil-block .b{font-family:'Inter',sans-serif;font-size:11px;line-height:1.55;color:#C9D4E8;}

  /* Heatmap erreurs */
  .pf-heat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:7px;}
  .pf-heat-cell{border-radius:10px;padding:8px 6px;text-align:center;border:1px solid;}
  .pf-heat-cell .c{font-family:'Space Grotesk',sans-serif;font-size:9px;font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .pf-heat-cell .p{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:800;display:block;margin-top:2px;}
  .pf-heat-cell .n{font-family:'Inter',sans-serif;font-size:7px;color:#6F81A8;display:block;}

  /* Notes */
  .pf-notes-ta{
    width:100%;min-height:110px;border-radius:12px;padding:11px 12px;resize:vertical;
    background:#071B44;border:1px solid #1A3A80;color:#E8F0FF;
    font-family:'Inter',sans-serif;font-size:12.5px;line-height:1.6;
  }
  .pf-notes-ta:focus{outline:2px solid rgba(31,139,255,.35);}

  /* ─── MULTI-TABLES MOBILE ─── */
  .grid2{grid-template-columns:minmax(0,1fr)!important;gap:10px;padding:8px!important;}
  .grid3,.grid4,.grid6,.grid8{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:6px;padding:6px!important;}
  .grid3 .tw,.grid4 .tw{min-width:0;}
  .mt-zoom-wrap{transform-origin:50% 0;transition:transform .15s ease-out;will-change:transform;}
  .mt-slot{position:relative;}
  .mt-slot-expanded{
    position:fixed!important;inset:0!important;z-index:350!important;
    background:#030712!important;display:flex!important;flex-direction:column!important;
    overflow-y:auto!important;padding:8px 8px calc(12px + env(safe-area-inset-bottom,0px))!important;
    animation:pfSolUp .25s cubic-bezier(.22,.68,.36,1) both;
  }
  .mt-expand-x{
    display:inline-flex!important;position:sticky;top:2px;margin-left:auto;z-index:30;
    width:34px;height:34px;border-radius:50%;align-items:center;justify-content:center;
    background:rgba(7,27,68,.92);border:1px solid #2E4A8E;color:#E8F0FF;font-size:14px;
    box-shadow:0 4px 14px rgba(0,0,0,.6);cursor:pointer;flex-shrink:0;
  }
  .mt-expand-btn{
    display:inline-flex!important;position:absolute;top:4px;right:4px;z-index:28;
    width:30px;height:30px;border-radius:9px;align-items:center;justify-content:center;
    background:rgba(7,27,68,.82);border:1px solid rgba(46,74,142,.7);color:#9FB0CC;font-size:13px;
    box-shadow:0 3px 10px rgba(0,0,0,.5);cursor:pointer;
    -webkit-tap-highlight-color:transparent;
  }
  .mt-expand-btn:active{transform:scale(.9);}
  .mt-zoom-reset{display:inline-flex!important;align-items:center;gap:5px;}
  .mt-zoom-reset{
    position:fixed;left:12px;bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:160;
    padding:8px 13px;border-radius:20px;border:1px solid #2E4A8E;
    background:rgba(7,27,68,.95);color:#9FB0CC;font-size:10px;font-weight:700;
    font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.5);
  }

  /* ─── MODE FOCUS (immersif) ─── */
  body.pf-focus .hdr{display:none!important;}
  body.pf-focus .mobile-bottom-nav{display:none!important;}
  body.pf-focus .app{padding-bottom:0!important;}
  body.pf-focus .mtr-timeline{display:none!important;}
  body.pf-focus .mob-filter-bar{display:none!important;}
  body.pf-focus .trainer-hud{display:none!important;}
  .pf-focus-exit{
    display:inline-flex!important;position:fixed;top:10px;right:10px;z-index:420;
    width:38px;height:38px;border-radius:50%;align-items:center;justify-content:center;
    background:rgba(7,27,68,.9);border:1px solid rgba(255,194,71,.4);color:#FFC247;
    font-size:16px;box-shadow:0 4px 16px rgba(0,0,0,.6);cursor:pointer;
    animation:pfFadeIn .25s both;-webkit-tap-highlight-color:transparent;
  }

  /* ─── Cartes & pot plus présents (Zone 2) ─── */
  .t1-left .pot-val-pop,.t1-left [class*="pot"]{text-shadow:0 0 18px rgba(236,229,192,.4);}

  /* ─── Toast au-dessus de tout ─── */
  .error-toast{z-index:500;}
}

/* ─── PETITS ÉCRANS (iPhone SE) ─── */
@media(max-width:380px){
  .mtr-fmt{font-size:8px;padding:2px 6px;}
  .mtr-ico-btn{width:30px;height:30px;font-size:13px;}
  .mtr-dot{width:21px;height:21px;font-size:9px;}
  .mtr-actions .gto-btn{min-height:52px;}
  .mtr-actions .gto-btn-label{font-size:13.5px!important;}
  .pf-sheet-tab{min-width:56px;font-size:9px;}
  .pf-vil-stats{gap:5px;}
  .pf-sol-opt-act{font-size:18px;}
}

/* ═══ ACCESSIBILITÉ — GROS TEXTE ═══ */
body.pf-bigtext .gto-btn-label{font-size:17px!important;}
body.pf-bigtext .gto-btn-sizing{font-size:12px!important;}
body.pf-bigtext .ab{font-size:14px!important;}
body.pf-bigtext .ab-sub{font-size:10px!important;}
body.pf-bigtext .hud-chip{font-size:11px!important;padding:4px 9px!important;}
body.pf-bigtext .solbody,body.pf-bigtext .bltxt,body.pf-bigtext .pf-sol-tree-txt{font-size:13.5px!important;line-height:1.65!important;}
body.pf-bigtext .pf-vil-block .b{font-size:12.5px!important;}
body.pf-bigtext .pf-sheet-tab{font-size:11.5px!important;}
body.pf-bigtext .mtr-prog-count{font-size:13px!important;}
body.pf-bigtext .mtr-prog-left{font-size:9.5px!important;}
body.pf-bigtext .evlbl{font-size:11px!important;}
body.pf-bigtext .seat-card-pos{font-size:14px!important;}
body.pf-bigtext .seat-card-stack{font-size:12px!important;}
body.pf-bigtext .sblbl{font-size:11px!important;}
body.pf-bigtext .pfsel,body.pf-bigtext .pffl{font-size:12px!important;}
body.pf-bigtext .statl,body.pf-bigtext .sel{font-size:10px!important;}
body.pf-bigtext .smn{font-size:12px!important;}
body.pf-bigtext .mob-filter-btn{font-size:12px!important;}

/* PREMIUM DASHBOARD */
.pf-dash-shell{
  display:flex;flex-direction:column;height:100%;overflow:hidden;
  background:
    radial-gradient(ellipse 58% 42% at 20% 0%,rgba(0,191,255,.22),transparent 58%),
    radial-gradient(ellipse 46% 36% at 94% 12%,rgba(0,140,255,.16),transparent 58%),
    linear-gradient(180deg,#061326 0%,#020814 52%,#02050d 100%);
}
.pf-dash{
  flex:1;overflow-y:auto;padding:14px 16px 18px!important;
  background:transparent!important;
}
.pf-dash-grid-top{
  display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px;margin-bottom:12px;
}
.pf-dash-banner-shell{
  min-width:0;border:1px solid rgba(0,191,255,.62);border-radius:8px;overflow:hidden;
  background:linear-gradient(145deg,rgba(4,13,34,.98),rgba(3,7,18,.92));
  box-shadow:
    0 18px 48px rgba(0,0,0,.56),
    0 0 34px rgba(0,140,255,.26),
    inset 0 0 0 1px rgba(231,236,243,.08);
}
.pf-dash-banner-shell .pf-banner{height:232px!important;border-radius:8px;}
.pf-dash-panel,.pf-dash-card{
  position:relative;overflow:hidden;border-radius:8px;
  background:
    linear-gradient(180deg,rgba(8,25,58,.95),rgba(2,9,25,.98)),
    radial-gradient(circle at 100% 0%,rgba(0,191,255,.18),transparent 42%),
    radial-gradient(circle at 8% 0%,rgba(231,236,243,.08),transparent 26%);
  border:1px solid rgba(0,140,255,.56);
  box-shadow:
    0 18px 42px rgba(0,0,0,.46),
    0 0 26px rgba(0,140,255,.18),
    inset 0 0 0 1px rgba(231,236,243,.055),
    inset 0 18px 38px rgba(0,191,255,.045);
}
.pf-dash-card::before,.pf-dash-panel::before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:
    linear-gradient(120deg,rgba(231,236,243,.12),transparent 20%,transparent 74%,rgba(0,191,255,.12)),
    linear-gradient(180deg,rgba(0,191,255,.08),transparent 42%);
  opacity:.72;
}
.pf-dash-card::after,.pf-dash-panel::after{
  content:"";position:absolute;left:12px;right:12px;top:0;height:1px;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(231,236,243,.7),rgba(0,191,255,.7),transparent);
  opacity:.58;
}
.pf-dash-panel-head{
  display:flex;align-items:center;gap:8px;position:relative;z-index:1;
  padding:13px 14px 8px;
}
.pf-dash-eyebrow{
  font-family:'Orbitron','Rajdhani','Space Grotesk',sans-serif;font-size:10px;font-weight:800;letter-spacing:.18em;
  color:#8FCBFF;text-transform:uppercase;text-shadow:0 0 12px rgba(0,140,255,.45);
}
.pf-dash-link{
  margin-left:auto;border:0;background:transparent;color:#7FB8FF;cursor:pointer;
  font-family:'Inter',sans-serif;font-size:10px;font-weight:700;letter-spacing:.03em;
}
.pf-dash-link:hover{color:#fff;text-shadow:0 0 12px rgba(31,139,255,.55);}
.pf-events-list{display:flex;flex-direction:column;gap:7px;padding:0 10px 10px;position:relative;z-index:1;}
.pf-event-row{
  display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:10px;
  min-height:47px;padding:8px 10px;border-radius:7px;
  background:linear-gradient(90deg,rgba(5,16,39,.96),rgba(8,31,74,.76));
  border:1px solid rgba(0,140,255,.34);
  box-shadow:inset 0 0 0 1px rgba(231,236,243,.035),0 0 16px rgba(0,140,255,.08);
}
.pf-event-mark{
  width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;
  font-family:'Orbitron','Rajdhani',sans-serif;font-size:13px;font-weight:900;
  box-shadow:inset 0 0 14px rgba(0,0,0,.38),0 0 18px currentColor;
}
.pf-event-kicker{
  font-size:8px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;
  font-family:'Inter',sans-serif;margin-bottom:2px;
}
.pf-event-name{
  font-family:'Inter',sans-serif;font-size:11px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.pf-event-time{
  text-align:right;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;color:#C9D4E8;
}
.pf-dash-stat-grid{
  display:grid;grid-template-columns:1.05fr 1.05fr .95fr 1fr;gap:10px;margin-bottom:12px;
}
.pf-dash-card{padding:12px;min-height:122px;}
.pf-card-top{display:flex;align-items:center;gap:7px;margin-bottom:10px;position:relative;z-index:1;}
.pf-card-icon{
  width:23px;height:23px;border-radius:7px;display:flex;align-items:center;justify-content:center;
  background:
    radial-gradient(circle at 35% 25%,rgba(231,236,243,.42),transparent 34%),
    linear-gradient(145deg,rgba(0,140,255,.28),rgba(0,191,255,.08));
  border:1px solid rgba(0,191,255,.48);font-size:13px;
  box-shadow:0 0 16px rgba(0,140,255,.34),inset 0 0 10px rgba(0,191,255,.14);
}
.pf-card-icon svg{filter:drop-shadow(0 0 7px currentColor);}
.pf-card-title{
  font-family:'Orbitron','Rajdhani','Space Grotesk',sans-serif;font-size:10px;font-weight:800;letter-spacing:.14em;
  color:#8EC8FF;text-transform:uppercase;text-shadow:0 0 10px rgba(0,140,255,.36);
}
.pf-card-main{
  position:relative;z-index:1;font-family:'Rajdhani','Inter',sans-serif;font-size:16px;font-weight:800;color:#fff;line-height:1.16;
}
.pf-card-muted{font-size:10px;color:#8DA9D7;font-family:'Inter',sans-serif;line-height:1.5;}
.pf-card-row{display:flex;align-items:center;gap:14px;position:relative;z-index:1;}
.pf-card-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;position:relative;z-index:1;}
.pf-kv-label{
  font-size:8px;color:#6F81A8;letter-spacing:.12em;text-transform:uppercase;font-family:'Inter',sans-serif;font-weight:800;
}
.pf-kv-value{font-size:11px;color:#fff;font-family:'Inter',sans-serif;font-weight:800;margin-top:3px;}
.pf-ring{
  width:66px;height:66px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;
  box-shadow:0 0 28px rgba(0,140,255,.36),inset 0 0 18px rgba(0,0,0,.42);
}
.pf-ring-inner{
  width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:#050D22;
  border:1px solid rgba(0,191,255,.34);
  font-family:'Orbitron','JetBrains Mono',monospace;font-size:16px;font-weight:900;color:#fff;line-height:1;
}
.pf-ring-inner small{font-size:8px;color:#8DA9D7;margin-left:1px;}
.pf-progress-track{
  height:6px;border-radius:999px;background:rgba(74,144,255,.18);overflow:hidden;position:relative;
}
.pf-progress-fill{
  height:100%;border-radius:999px;background:linear-gradient(90deg,#008CFF,#00BFFF,#7BE7FF);
  box-shadow:0 0 16px rgba(0,191,255,.62);transition:width .7s cubic-bezier(.4,0,.2,1);
}
.pf-xl-number{
  font-family:'Orbitron','JetBrains Mono',monospace;font-size:42px;font-weight:900;line-height:.95;
  color:#FFC247;text-shadow:0 0 24px rgba(255,194,71,.42);
}
.pf-streak-days{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:10px;position:relative;z-index:1;}
.pf-streak-day{display:flex;flex-direction:column;align-items:center;gap:5px;}
.pf-streak-dot{
  width:22px;height:22px;border-radius:50%;display:grid;place-items:center;
  background:rgba(31,139,255,.08);border:1px solid rgba(74,144,255,.28);
  font-size:9px;color:#6F81A8;font-weight:800;font-family:'Inter',sans-serif;
}
.pf-streak-dot.done{background:rgba(31,139,255,.28);border-color:rgba(31,139,255,.65);color:#fff;box-shadow:0 0 14px rgba(31,139,255,.28);}
.pf-streak-dot.today{background:linear-gradient(180deg,#1F8BFF,#0757D2);border-color:#4BA1FF;color:#fff;box-shadow:0 0 18px rgba(31,139,255,.6);}
.pf-streak-label{font-size:8px;color:#8DA9D7;font-family:'Inter',sans-serif;font-weight:800;}
.pf-dash-main-grid{display:grid;grid-template-columns:1.05fr .7fr 1.1fr;gap:10px;margin-bottom:12px;}
.pf-leak-list{display:flex;flex-direction:column;gap:7px;position:relative;z-index:1;}
.pf-leak-item{
  display:grid;grid-template-columns:28px minmax(0,1fr) 92px 72px;align-items:center;gap:10px;
}
.pf-leak-badge{
  width:26px;height:26px;border-radius:7px;display:grid;place-items:center;
  background:rgba(255,69,96,.13);border:1px solid rgba(255,69,96,.25);font-size:12px;
}
.pf-leak-name{font-size:11px;color:#EAF2FF;font-family:'Inter',sans-serif;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pf-leak-track{height:5px;border-radius:999px;background:rgba(74,144,255,.18);overflow:hidden;}
.pf-leak-fill{height:100%;border-radius:999px;box-shadow:0 0 12px currentColor;}
.pf-leak-impact{font-family:'JetBrains Mono',monospace;font-size:8px;text-align:right;line-height:1.35;}
.pf-mission-card{position:relative;z-index:1;display:flex;flex-direction:column;gap:10px;}
.pf-mission-title{font-family:'Rajdhani','Space Grotesk',sans-serif;font-size:19px;font-weight:900;color:#fff;letter-spacing:.01em;}
.pf-mission-tag{
  display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:5px;
  font-size:10px;font-weight:900;color:#D7C7FF;background:rgba(155,92,255,.18);border:1px solid rgba(155,92,255,.45);
}
.pf-mission-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.pf-mission-meta>div{
  min-height:38px;border-radius:7px;border:1px solid rgba(74,144,255,.22);
  background:rgba(5,16,39,.58);padding:7px;
}
.pf-premium-btn{
  border:1px solid rgba(255,255,255,.12);border-radius:7px;cursor:pointer;
  background:linear-gradient(90deg,#008CFF,#245CFF 48%,#8B5CF6);
  color:#fff;font-family:'Orbitron','Rajdhani',sans-serif;font-size:12px;font-weight:900;
  padding:9px 14px;box-shadow:0 10px 28px rgba(0,140,255,.32),0 0 18px rgba(139,92,246,.28);
}
.pf-premium-btn:hover{filter:brightness(1.12);transform:translateY(-1px);}
.pf-radar-wrap{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:10px;align-items:center;position:relative;z-index:1;}
.pf-radar-svg{width:100%;max-width:210px;aspect-ratio:1;justify-self:center;filter:drop-shadow(0 0 14px rgba(31,139,255,.18));}
.pf-domain-list{display:flex;flex-direction:column;gap:5px;}
.pf-domain-row{display:grid;grid-template-columns:76px minmax(0,1fr) 34px;gap:8px;align-items:center;}
.pf-domain-label{font-size:10px;color:#EAF2FF;font-weight:800;font-family:'Inter',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pf-domain-bar{height:4px;border-radius:999px;background:rgba(74,144,255,.17);overflow:hidden;}
.pf-domain-fill{height:100%;border-radius:999px;box-shadow:0 0 10px currentColor;}
.pf-domain-pct{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:900;text-align:right;}
.pf-dash-actions{padding:12px 14px;margin-bottom:0;}
.pf-action-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;position:relative;z-index:1;}
.pf-action-btn{
  min-height:54px;padding:9px 12px;border-radius:7px;border:1px solid rgba(74,144,255,.28);
  background:
    linear-gradient(180deg,rgba(9,28,66,.9),rgba(3,12,31,.96)),
    radial-gradient(circle at 0% 0%,rgba(0,191,255,.15),transparent 38%);
  color:#fff;display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;
  box-shadow:inset 0 0 0 1px rgba(231,236,243,.05),0 0 20px rgba(0,140,255,.08);
}
.pf-action-btn:hover{border-color:rgba(0,191,255,.86);box-shadow:0 0 26px rgba(0,140,255,.28),inset 0 0 18px rgba(0,191,255,.08);transform:translateY(-1px);}
.pf-action-btn.primary{
  background:linear-gradient(135deg,rgba(0,140,255,.34),rgba(139,92,246,.72));
  border-color:rgba(139,92,246,.72);
  box-shadow:0 0 28px rgba(139,92,246,.32),0 0 22px rgba(0,140,255,.2),inset 0 0 20px rgba(231,236,243,.08);
}
.pf-action-ico{
  width:30px;height:30px;border-radius:7px;display:grid;place-items:center;flex-shrink:0;
  background:
    radial-gradient(circle at 35% 28%,rgba(231,236,243,.34),transparent 34%),
    linear-gradient(145deg,rgba(0,140,255,.24),rgba(0,191,255,.07));
  border:1px solid rgba(0,191,255,.48);font-size:16px;
  color:#00BFFF;text-shadow:0 0 12px currentColor;box-shadow:0 0 16px rgba(0,140,255,.28),inset 0 0 10px rgba(0,191,255,.12);
}
.pf-action-ico svg{filter:drop-shadow(0 0 8px currentColor);}
.pf-action-label{font-family:'Rajdhani','Inter',sans-serif;font-size:13px;font-weight:850;color:#fff;line-height:1.05;}
.pf-action-sub{display:block;font-family:'Inter',sans-serif;font-size:8px;color:#9FB0CC;margin-top:3px;line-height:1.2;}
.pf-expanded-hub{margin-top:12px;}
.pf-dash-empty-note{font-size:9px;color:#8DA9D7;font-family:'Inter',sans-serif;margin-left:8px;text-transform:none;letter-spacing:0;font-weight:600;}

.pf-news-section{
  padding:12px 14px;margin-bottom:12px;overflow:visible;
}
.pf-news-head{
  display:flex;align-items:center;gap:10px;position:relative;z-index:1;margin-bottom:10px;
}
.pf-news-badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.pf-news-badge{
  display:inline-flex;align-items:center;height:18px;padding:0 9px;border-radius:999px;
  font-family:'Inter',sans-serif;font-size:9px;font-weight:850;letter-spacing:.01em;
  border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);
}
.pf-news-badge.articles{color:#10D87A;background:rgba(16,216,122,.12);border-color:rgba(16,216,122,.34);box-shadow:0 0 12px rgba(16,216,122,.16);}
.pf-news-badge.events{color:#00D4FF;background:rgba(0,191,255,.11);border-color:rgba(0,191,255,.3);box-shadow:0 0 12px rgba(0,191,255,.14);}
.pf-news-badge.today{color:#9FB0CC;background:rgba(159,176,204,.08);border-color:rgba(159,176,204,.16);}
.pf-news-nav{margin-left:auto;display:flex;align-items:center;gap:6px;}
.pf-news-nav button{
  width:26px;height:26px;border-radius:50%;border:1px solid rgba(0,140,255,.5);
  background:linear-gradient(180deg,rgba(0,140,255,.22),rgba(4,13,34,.9));
  color:#D9ECFF;font-family:'Orbitron',sans-serif;font-size:16px;font-weight:900;line-height:1;
  cursor:pointer;box-shadow:0 0 16px rgba(0,140,255,.2),inset 0 0 12px rgba(0,191,255,.08);
}
.pf-news-nav button:hover:not(:disabled){border-color:#00BFFF;box-shadow:0 0 22px rgba(0,191,255,.34);transform:translateY(-1px);}
.pf-news-nav button:disabled{opacity:.35;cursor:default;}
.pf-news-filter-ready{display:none;}
.pf-news-rail-wrap{position:relative;z-index:1;overflow:hidden;}
.pf-news-rail{
  display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 32px)/5);
  gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;
  padding:0 2px 4px;scrollbar-width:none;
}
.pf-news-rail::-webkit-scrollbar{display:none;}
.pf-news-card{
  scroll-snap-align:start;min-height:104px;text-align:left;cursor:pointer;position:relative;overflow:hidden;
  border-radius:8px;border:1px solid rgba(0,140,255,.32);
  background:
    radial-gradient(circle at 0% 0%,rgba(0,191,255,.14),transparent 34%),
    linear-gradient(180deg,rgba(7,24,57,.9),rgba(2,10,27,.96));
  padding:11px 12px;color:#fff;box-shadow:inset 0 0 0 1px rgba(231,236,243,.035),0 0 18px rgba(0,140,255,.08);
}
.pf-news-card::before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(120deg,rgba(231,236,243,.09),transparent 32%,rgba(0,191,255,.08));
  opacity:.55;
}
.pf-news-card:hover{
  transform:translateY(-2px);border-color:rgba(0,191,255,.7);
  box-shadow:0 12px 28px rgba(0,0,0,.34),0 0 24px rgba(0,140,255,.2),inset 0 0 18px rgba(0,191,255,.06);
}
.pf-news-card-top{display:flex;align-items:center;gap:9px;position:relative;z-index:1;margin-bottom:7px;}
.pf-news-logo{
  width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;
  font-family:'Orbitron','Rajdhani',sans-serif;font-size:12px;font-weight:900;letter-spacing:-.03em;
  border:1px solid;box-shadow:0 0 18px currentColor,inset 0 0 13px rgba(255,255,255,.06);
}
.pf-news-meta{display:flex;align-items:center;gap:7px;min-width:0;flex:1;}
.pf-news-meta span{font-family:'Orbitron','Rajdhani',sans-serif;font-size:9px;font-weight:900;letter-spacing:.08em;}
.pf-news-meta em{margin-left:auto;color:#8DA9D7;font-family:'JetBrains Mono',monospace;font-size:8px;font-style:normal;white-space:nowrap;}
.pf-news-title{
  position:relative;z-index:1;font-family:'Rajdhani','Inter',sans-serif;font-size:14px;font-weight:900;
  color:#fff;line-height:1.08;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.pf-news-desc{
  position:relative;z-index:1;font-family:'Inter',sans-serif;font-size:10px;line-height:1.45;color:#B6C8E8;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.pf-news-modal-backdrop{
  position:fixed;inset:0;z-index:1500;display:grid;place-items:center;padding:22px;
  background:rgba(1,5,13,.72);backdrop-filter:blur(10px);
}
.pf-news-modal{
  width:min(560px,100%);border-radius:10px;border:1px solid rgba(0,191,255,.58);
  background:
    radial-gradient(circle at 100% 0%,rgba(0,191,255,.18),transparent 34%),
    linear-gradient(180deg,rgba(7,24,57,.98),rgba(2,8,22,.98));
  box-shadow:0 28px 80px rgba(0,0,0,.65),0 0 34px rgba(0,140,255,.25),inset 0 0 0 1px rgba(231,236,243,.06);
  padding:18px;
}
.pf-news-modal-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;}
.pf-news-modal-logo{width:42px;height:42px;border-radius:10px;}
.pf-news-modal-source{font-family:'Orbitron','Rajdhani',sans-serif;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;}
.pf-news-modal-title{font-family:'Rajdhani','Inter',sans-serif;font-size:24px;font-weight:900;line-height:1.05;color:#fff;}
.pf-news-modal-body{font-family:'Inter',sans-serif;font-size:13px;line-height:1.65;color:#C9D8F2;margin-bottom:16px;}
.pf-news-modal-actions{display:flex;align-items:center;gap:10px;justify-content:flex-end;}
.pf-news-read-full,.pf-news-close-btn{
  min-height:36px;border-radius:8px;padding:0 15px;font-family:'Rajdhani','Inter',sans-serif;font-size:13px;font-weight:900;
  display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer;
}
.pf-news-read-full{color:#fff;background:linear-gradient(90deg,#008CFF,#8B5CF6);border:1px solid rgba(255,255,255,.16);box-shadow:0 0 18px rgba(0,140,255,.25);}
.pf-news-close-btn{color:#BFD4F4;background:rgba(5,16,39,.72);border:1px solid rgba(0,140,255,.32);}

/* Dashboard mockup refinements */
.pf-hero{
  position:relative;height:230px;overflow:hidden;border-radius:8px;isolation:isolate;
  background:#061326;
}
.pf-hero::before{
  content:"";position:absolute;inset:0;z-index:0;
  background:
    linear-gradient(90deg,rgba(2,8,18,.72) 0%,rgba(2,8,18,.46) 28%,rgba(2,8,18,.04) 55%,rgba(2,8,18,.1) 100%),
    radial-gradient(circle at 54% 28%,rgba(0,191,255,.28),transparent 27%),
    url('/dashboard-hero-pf.png') center center/cover no-repeat;
  transform:scale(1.015);
  pointer-events:none;
}
.pf-hero::after{
  content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
  background:
    linear-gradient(180deg,rgba(231,236,243,.08),transparent 18%,transparent 74%,rgba(0,0,0,.2)),
    repeating-linear-gradient(90deg,rgba(0,191,255,.055) 0 1px,transparent 1px 36px),
    repeating-linear-gradient(0deg,rgba(0,140,255,.035) 0 1px,transparent 1px 30px);
  box-shadow:inset 0 0 85px rgba(0,0,0,.36),inset 0 0 42px rgba(0,140,255,.14);
  opacity:.82;
}
.pf-hero-content{position:absolute;left:28px;top:37px;z-index:4;max-width:540px;}
.pf-hero-kicker{
  font-family:'Orbitron','Rajdhani','Space Grotesk',sans-serif;font-size:12px;font-weight:900;letter-spacing:.1em;
  color:#00BFFF;text-transform:uppercase;font-style:italic;text-shadow:0 0 16px rgba(0,191,255,.9);
}
.pf-hero-title{
  margin-top:12px;font-family:'Rajdhani','Orbitron','Space Grotesk',sans-serif;font-size:37px;line-height:.96;
  font-weight:900;font-style:italic;text-transform:uppercase;color:#F7FAFF;
  letter-spacing:.01em;
  text-shadow:0 3px 0 rgba(0,0,0,.62),0 0 30px rgba(231,236,243,.22),0 0 24px rgba(0,140,255,.22);
}
.pf-hero-title span{display:block;color:#008CFF;text-shadow:0 0 22px rgba(0,140,255,.78),0 0 4px rgba(0,191,255,.65);}
.pf-hero-sub{margin-top:18px;color:#D6E6FF;font-size:15px;font-weight:700;letter-spacing:.02em;text-shadow:0 0 12px rgba(0,0,0,.72);}
.pf-hero-stage{display:none;position:absolute;inset:0;z-index:3;pointer-events:none;}
.pf-hero-mark{
  position:absolute;left:61%;top:41%;transform:translate(-50%,-50%) skewX(-9deg);
  font-family:'Space Grotesk',sans-serif;font-size:90px;line-height:1;font-weight:900;letter-spacing:-.12em;
  color:transparent;
  background:linear-gradient(160deg,#F7FAFF 0%,#9FB6D9 32%,#455E88 53%,#FFFFFF 67%,#708DBD 100%);
  -webkit-background-clip:text;background-clip:text;
  filter:drop-shadow(0 0 30px rgba(31,139,255,.58)) drop-shadow(0 18px 18px rgba(0,0,0,.55));
}
.pf-hero-bolt{
  position:absolute;left:49%;top:4%;width:2px;height:122px;background:linear-gradient(180deg,transparent,#39C9FF,transparent);
  box-shadow:0 0 22px #1F8BFF;transform:rotate(18deg);
}
.pf-hero-chip{
  position:absolute;width:28px;height:28px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#EAF7FF,#1F8BFF 35%,#052253 68%);
  border:2px solid rgba(199,232,255,.72);box-shadow:0 6px 18px rgba(0,0,0,.7),0 0 18px rgba(31,139,255,.38);
}
.pf-hero-chip.c1{left:43%;bottom:50px}.pf-hero-chip.c2{left:70%;bottom:62px;width:20px;height:20px}.pf-hero-chip.c3{left:77%;bottom:42px;width:24px;height:24px}
.pf-hero-stack{
  position:absolute;left:39%;bottom:52px;width:36px;height:54px;border-radius:7px 7px 4px 4px;
  background:repeating-linear-gradient(180deg,#5FB9FF 0 5px,#082B66 5px 9px);
  box-shadow:0 0 20px rgba(31,139,255,.35),0 10px 18px rgba(0,0,0,.55);
}
.pf-hero-hud{
  position:absolute;right:28px;top:28px;width:92px;height:58px;border-radius:6px;
  background:rgba(8,24,58,.42);border:1px solid rgba(112,174,255,.34);
  box-shadow:0 0 22px rgba(31,139,255,.2),inset 0 0 18px rgba(31,139,255,.08);
  transform:perspective(500px) rotateY(-18deg) rotateZ(-4deg);
}
.pf-hero-hud.h2{right:112px;top:36px;width:104px;height:70px;transform:perspective(500px) rotateY(-18deg) rotateZ(-5deg);}
.pf-hero-hud.h3{right:55px;top:105px;width:116px;height:64px;transform:perspective(500px) rotateY(-20deg) rotateZ(3deg);}
.pf-hero-hud::before{
  content:"";position:absolute;inset:8px;
  background:
    linear-gradient(135deg,rgba(31,139,255,.72),transparent 44%),
    repeating-linear-gradient(90deg,rgba(116,177,255,.28) 0 1px,transparent 1px 17px),
    repeating-linear-gradient(0deg,rgba(116,177,255,.18) 0 1px,transparent 1px 14px);
  opacity:.85;
}
.pf-hero-hud::after{
  content:"";position:absolute;left:10px;right:10px;bottom:11px;height:22px;
  background:linear-gradient(135deg,transparent 0 12%,#1F8BFF 13% 16%,transparent 17% 35%,#34D8FF 36% 39%,transparent 40% 58%,#1F8BFF 59% 62%,transparent 63%);
}
.pf-hero-dots{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);z-index:6;display:flex;gap:8px;}
.pf-hero-dot{width:28px;height:5px;border-radius:999px;background:rgba(112,174,255,.25);}
.pf-hero-dot.on{background:#008CFF;box-shadow:0 0 14px rgba(0,191,255,.85);}

@media(min-width:769px){
  .hdr{
    height:66px!important;padding:0 18px!important;
    background:
      linear-gradient(90deg,rgba(2,7,19,.98) 0%,rgba(6,19,38,.98) 42%,rgba(2,7,19,.96) 100%)!important;
    border-bottom:1px solid rgba(0,140,255,.5)!important;
    box-shadow:0 0 30px rgba(0,140,255,.18)!important;
  }
  .hdr::after{background:linear-gradient(90deg,rgba(0,191,255,.72),rgba(0,140,255,.26),transparent)!important;}
  .logo-full-wrap img,.logo-full-wrap svg{
    height:58px!important;max-width:310px!important;
    filter:drop-shadow(0 0 18px rgba(0,140,255,.55)) drop-shadow(0 0 2px rgba(231,236,243,.4));
  }
  .logo-full-wrap img.pf-header-logo{
    height:50px!important;
    width:auto!important;
    max-width:250px!important;
    object-fit:contain!important;
    object-position:left center!important;
    mix-blend-mode:screen;
    filter:
      drop-shadow(0 0 8px rgba(0,191,255,.62))
      drop-shadow(0 9px 12px rgba(0,140,255,.36))!important;
  }
  .pf-header-logo-fallback svg{
    height:50px!important;
    width:auto!important;
    max-width:230px!important;
  }
  .logo-compact-wrap img,.logo-compact-wrap svg{filter:drop-shadow(0 0 14px rgba(0,140,255,.6));}
  .hdr-breadcrumb span{
    font-family:'Orbitron','Rajdhani','Space Grotesk',sans-serif!important;
    font-size:14px!important;font-weight:800!important;letter-spacing:.03em!important;
  }
  .hdr-breadcrumb svg{filter:drop-shadow(0 0 8px currentColor);}
  .utog{
    border-color:rgba(0,140,255,.46)!important;
    background:linear-gradient(180deg,rgba(0,140,255,.14),rgba(3,12,31,.7))!important;
    font-family:'Orbitron','JetBrains Mono',monospace!important;
  }
  .utog.on{box-shadow:0 0 14px rgba(0,140,255,.42)!important;color:#00BFFF!important;}
  .hdrbadge{
    font-family:'Orbitron','JetBrains Mono',monospace!important;
    border-width:1px!important;box-shadow:0 0 16px rgba(0,140,255,.15),inset 0 0 16px rgba(255,255,255,.035)!important;
  }
  .leftnav{
    position:relative!important;
    width:186px!important;align-items:stretch!important;padding:15px 11px 12px!important;gap:8px!important;
    background:
      radial-gradient(circle at 88% 6%,rgba(0,191,255,.18),transparent 28%),
      linear-gradient(180deg,#020A1A 0%,#061326 46%,#020711 100%)!important;
    border-right:1px solid rgba(0,140,255,.55)!important;
    box-shadow:inset -1px 0 0 rgba(231,236,243,.06),10px 0 30px rgba(0,0,0,.32),0 0 28px rgba(0,140,255,.12)!important;
  }
  .leftnav::before{
    content:"";position:absolute;top:0;right:-1px;width:1px;height:100%;
    background:linear-gradient(180deg,transparent,rgba(0,191,255,.78),transparent);
    box-shadow:0 0 16px rgba(0,191,255,.7);
  }
  .lnav-item{
    width:auto!important;height:54px!important;border-radius:8px!important;display:flex!important;
    flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;
    gap:13px!important;padding:0 14px!important;
    overflow:hidden!important;
  }
  .lnav-item::after{
    content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
    background:linear-gradient(120deg,rgba(231,236,243,.09),transparent 34%,rgba(0,191,255,.08));
    opacity:.42;
  }
  .leftnav .lnav-item>span{
    font-family:'Rajdhani','Inter',sans-serif!important;
    font-size:14px!important;font-weight:800!important;line-height:1!important;margin-top:0!important;letter-spacing:.015em!important;
    max-width:102px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left!important;
  }
  .leftnav .lnav-item svg{
    padding:3px;border-radius:7px;
    background:radial-gradient(circle at 35% 22%,rgba(231,236,243,.2),transparent 32%),rgba(0,140,255,.055);
    filter:drop-shadow(0 0 9px currentColor);
  }
  .leftnav .lnav-item div[style*="calc(100%"]{display:none!important;}
  .lnav-sep{width:100%!important;margin:6px 0!important;background:linear-gradient(90deg,transparent,rgba(74,144,255,.35),transparent)!important;}
  .pf-dash{padding:10px 14px 14px!important;}
  .pf-dash-grid-top{grid-template-columns:minmax(0,1fr) 350px;gap:12px;margin-bottom:12px;}
  .pf-dash-stat-grid{grid-template-columns:1fr 1fr .9fr 1fr;gap:10px;margin-bottom:8px;}
  .pf-dash-main-grid{grid-template-columns:1.05fr .7fr 1.1fr;gap:10px;margin-bottom:8px;}
  .pf-dash-card{min-height:112px;}
  .pf-dash-main-grid .pf-dash-card{min-height:212px!important;}
  .pf-action-grid{grid-template-columns:repeat(6,minmax(0,1fr));}
}

@media(max-width:1280px){
  .pf-dash-grid-top{grid-template-columns:1fr;}
  .pf-events-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));}
  .pf-dash-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
  .pf-dash-main-grid{grid-template-columns:1fr;}
  .pf-news-rail{grid-auto-columns:calc((100% - 20px)/3);gap:10px;}
  .pf-action-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
}
@media(max-width:768px){
  .pf-dash{padding:10px 10px 74px!important;}
  .pf-dash-banner-shell .pf-banner{height:220px!important;}
  .pf-hero{height:228px;}
  .pf-hero::before{
    background:
      linear-gradient(90deg,rgba(2,8,18,.86) 0%,rgba(2,8,18,.7) 42%,rgba(2,8,18,.18) 76%,rgba(2,8,18,.18) 100%),
      radial-gradient(circle at 66% 26%,rgba(0,191,255,.26),transparent 26%),
      url('/dashboard-hero-pf.png') 68% center/auto 100% no-repeat;
    transform:scale(1);
  }
  .pf-hero-content{left:26px;right:18px;top:38px;max-width:292px;}
  .pf-hero-title{font-size:27px;line-height:1.02;}
  .pf-hero-sub{font-size:13px;margin-top:14px;}
  .pf-hero-mark{left:78%;top:34%;font-size:74px;opacity:.48;}
  .pf-hero-hud{opacity:.42;right:10px;top:30px;}
  .pf-hero-hud.h2{right:26px;top:70px;}
  .pf-hero-hud.h3{display:none;}
  .pf-hero-chip{opacity:.65;}
  .pf-events-list{grid-template-columns:1fr;}
  .pf-dash-stat-grid{grid-template-columns:1fr;}
  .pf-radar-wrap{grid-template-columns:1fr;}
  .pf-news-section{padding:12px 10px;}
  .pf-news-head{align-items:flex-start;gap:8px;flex-wrap:wrap;}
  .pf-news-badges{order:3;width:100%;}
  .pf-news-nav{margin-left:auto;}
  .pf-news-rail{grid-auto-columns:100%;gap:10px;}
  .pf-news-card{min-height:118px;}
  .pf-news-modal{padding:16px;}
  .pf-news-modal-title{font-size:21px;}
  .pf-news-modal-actions{justify-content:stretch;flex-direction:column;}
  .pf-news-read-full,.pf-news-close-btn{width:100%;}
  .pf-action-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
  .pf-leak-item{grid-template-columns:26px minmax(0,1fr);gap:8px;}
  .pf-leak-track,.pf-leak-impact{grid-column:2;}
  .pf-leak-impact{text-align:left;}
  .pf-card-row{align-items:flex-start;}
}
@media(max-width:480px){
  .pf-dash-banner-shell .pf-banner{height:200px!important;}
  .pf-action-grid{grid-template-columns:1fr;}
  .pf-mission-meta{grid-template-columns:1fr;}
  .pf-xl-number{font-size:36px;}
}

/* ═══ ACCESSIBILITÉ — CONTRASTE ÉLEVÉ ═══ */
body.pf-contrast .hud-chip{color:#E8F0FF!important;border-color:#3E63C0!important;}
body.pf-contrast .statl,body.pf-contrast .sel,body.pf-contrast .smsub,
body.pf-contrast .pffl,body.pf-contrast .sblbl,body.pf-contrast .mtr-prog-left,
body.pf-contrast .pf-sol-kv .k,body.pf-contrast .pf-vil-stat .l{color:#C9D4E8!important;}
body.pf-contrast .pf-sol-tree-txt,body.pf-contrast .solbody,body.pf-contrast .bltxt{color:#F0F5FF!important;}
body.pf-contrast .gto-btn{border-width:2px!important;}
body.pf-contrast .mtr-dot{border-width:2px!important;}
body.pf-contrast .pf-sheet-tab{color:#9FB0CC;}
body.pf-contrast .pf-sheet-tab.on{color:#FFD97A!important;border-color:#FFC247!important;}
body.pf-contrast .card{box-shadow:0 4px 16px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.22)!important;}
body.pf-contrast .seat-card-stats{color:#B8C6E4!important;}
body.pf-contrast .mtr-prog-track{background:#142A5E;}

/* Trainer table rework: reusable chips, blinds and action lanes */
.pf-chip-stack{
  position:relative!important;display:block!important;width:34px!important;height:34px!important;
  filter:drop-shadow(0 7px 15px var(--chip-glow)) drop-shadow(0 3px 7px rgba(0,0,0,.82))!important;
}
.pf-chip-stack span{
  position:absolute!important;left:calc(50% - var(--chip-d)/2 + (var(--i) - 2)*2px)!important;bottom:calc(var(--i)*var(--chip-rise))!important;
  width:var(--chip-d)!important;height:var(--chip-d)!important;border-radius:50%!important;
  background:
    radial-gradient(circle at 35% 22%,rgba(255,255,255,.7),transparent 28%),
    radial-gradient(circle at 56% 60%,rgba(255,255,255,.18),transparent 38%),
    conic-gradient(from 12deg,rgba(255,255,255,.28) 0 11deg,transparent 11deg 45deg,rgba(255,255,255,.2) 45deg 56deg,transparent 56deg 96deg,rgba(255,255,255,.22) 96deg 108deg,transparent 108deg 360deg),
    linear-gradient(145deg,var(--chip-color),#061326 84%)!important;
  border:var(--chip-border) solid var(--chip-edge)!important;
  box-shadow:inset 0 -6px 7px rgba(0,0,0,.68),inset 0 2px 5px rgba(255,255,255,.3),0 4px 10px rgba(0,0,0,.68),0 0 0 1px rgba(255,255,255,.05)!important;
}
.pf-chip-stack span::before{
  content:"";position:absolute;inset:4px;border-radius:50%;
  border:1px dashed rgba(255,255,255,.42);opacity:.78;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.22);
}
.pf-chip-stack span::after{
  content:"";position:absolute;inset:34%;border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.34),rgba(255,255,255,.06));
  box-shadow:0 0 0 1px rgba(255,255,255,.18);
}
.pf-chip-large{--chip-d:28px;--chip-rise:4px;--chip-border:2px;width:76px!important;height:44px!important;}
.pf-chip-medium{--chip-d:19px;--chip-rise:4px;--chip-border:1.6px;width:44px!important;height:35px!important;}
.pf-chip-small{--chip-d:13px;--chip-rise:3px;--chip-border:1.2px;width:31px!important;height:24px!important;}
.pf-pot-chip-stack{display:flex!important;justify-content:center!important;align-items:center!important;}
.pf-pot-chip-stack>.pf-chip-stack{margin:0 auto!important;}
.pf-blind-stack{
  display:flex!important;flex-direction:column!important;align-items:center!important;gap:2px!important;
  padding:2px 5px 4px!important;border-radius:9px!important;
  background:linear-gradient(180deg,rgba(4,13,31,.74),rgba(2,8,20,.54))!important;
  border:1px solid rgba(141,169,215,.28)!important;
  filter:drop-shadow(0 5px 10px rgba(0,191,255,.24)) drop-shadow(0 2px 4px rgba(0,0,0,.7))!important;
}
.pf-blind-stack strong{
  font-family:'JetBrains Mono',monospace!important;font-size:11px!important;font-weight:900!important;color:#E7ECF3!important;
  text-shadow:0 0 9px rgba(0,191,255,.65)!important;line-height:1!important;
}
.pf-blind-stack em{
  min-width:20px!important;height:18px!important;border-radius:999px!important;display:flex!important;align-items:center!important;justify-content:center!important;
  font-style:normal!important;font-family:'Space Grotesk',sans-serif!important;font-size:7px!important;font-weight:900!important;
  color:#061326!important;background:linear-gradient(135deg,#E7ECF3,#8DA9D7)!important;
  border:1px solid rgba(255,255,255,.35)!important;box-shadow:0 0 10px rgba(141,169,215,.35)!important;
}
.pf-blind-stack.compact{transform:scale(.78)!important;transform-origin:center!important;}
.pf-seat-action-zone{
  position:absolute!important;transform:translate(-50%,-50%)!important;z-index:18!important;pointer-events:none!important;
  display:flex!important;align-items:center!important;justify-content:center!important;
}
.pf-player-seat{position:absolute!important;display:flex!important;flex-direction:column!important;align-items:center!important;contain:layout style!important;}
.pf-player-seat-zone{display:flex!important;align-items:center!important;justify-content:center!important;min-width:0!important;}
.pf-action-chip-badge{
  display:flex!important;align-items:center!important;gap:5px!important;
  padding:4px 9px 5px!important;border-radius:11px!important;
  background:linear-gradient(180deg,rgba(3,11,29,.84),rgba(1,6,17,.74))!important;
  border:1px solid rgba(31,139,255,.34)!important;
  box-shadow:0 10px 24px rgba(0,0,0,.66),inset 0 1px 0 rgba(255,255,255,.1),0 0 0 1px rgba(0,191,255,.05)!important;
  min-height:31px!important;max-width:132px!important;
  backdrop-filter:blur(7px);animation:badgePop .24s cubic-bezier(.34,1.56,.64,1);
}
.pf-action-chip-piles{display:flex!important;align-items:flex-end!important;gap:0!important;flex:0 0 auto!important;margin-right:-2px!important;}
.pf-action-chip-piles>.pf-chip-stack{margin-left:-8px!important;}
.pf-action-chip-piles>.pf-chip-stack:first-child{margin-left:0!important;}
.pf-action-chip-piles.piles-1>.pf-chip-stack{margin-left:0!important;}
.pf-action-chip-piles.piles-4{filter:drop-shadow(0 0 10px rgba(255,69,96,.28))!important;}
.pf-action-chip-copy{display:flex!important;flex-direction:column!important;gap:1px!important;line-height:1!important;white-space:nowrap!important;min-width:0!important;}
.pf-action-chip-copy strong{font-family:'Space Grotesk',sans-serif!important;font-size:8.5px!important;font-weight:900!important;letter-spacing:.03em!important;color:#DCE8FF!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:62px!important;}
.pf-action-chip-copy em{font-family:'JetBrains Mono',monospace!important;font-size:9.5px!important;font-style:normal!important;font-weight:900!important;color:#F7FAFF!important;text-shadow:0 0 10px rgba(31,139,255,.55)!important;}
.pf-action-chip-badge.compact{gap:3px!important;padding:2px 5px!important;border-radius:7px!important;min-height:24px!important;max-width:96px!important;}
.pf-action-chip-badge.compact .pf-action-chip-piles{transform:scale(.86);transform-origin:center right;margin-right:-6px!important;}
.pf-action-chip-badge.compact .pf-action-chip-piles>.pf-chip-stack{margin-left:-11px!important;}
.pf-action-chip-badge.compact .pf-action-chip-copy strong{font-size:6.5px!important;}
.pf-action-chip-badge.compact .pf-action-chip-copy em{font-size:7px!important;}
.pf-action-call{border-color:rgba(16,216,122,.38)!important;background:rgba(2,24,14,.72)!important;}
.pf-action-call .pf-action-chip-copy strong,.pf-action-call .pf-action-chip-copy em{color:#10D87A!important;text-shadow:0 0 9px rgba(16,216,122,.5)!important;}
.pf-action-bet,.pf-action-open{border-color:rgba(255,194,71,.38)!important;background:rgba(32,18,2,.72)!important;}
.pf-action-bet .pf-action-chip-copy strong,.pf-action-open .pf-action-chip-copy strong{color:#FFC247!important;}
.pf-action-raise{border-color:rgba(31,139,255,.42)!important;background:rgba(3,16,44,.78)!important;}
.pf-action-raise .pf-action-chip-copy strong,.pf-action-raise .pf-action-chip-copy em{color:#60B0FF!important;}
.pf-action-allin{border-color:rgba(255,69,96,.55)!important;background:rgba(44,4,12,.78)!important;animation:badgePop .24s cubic-bezier(.34,1.56,.64,1),urgentPulse .75s infinite!important;}
.pf-action-allin .pf-action-chip-copy strong,.pf-action-allin .pf-action-chip-copy em{color:#FF7090!important;}
.pf-action-check,.pf-action-fold{display:none!important;}

/* 1T QA: chip/pot content stays visible, decorative frames disappear. */
.pf-seat-action-zone .pf-action-chip-badge,
body .pf-seat-action-zone .pf-action-chip-badge.pf-chip-badge-v2{
  background:transparent!important;
  border-color:transparent!important;
  box-shadow:none!important;
  backdrop-filter:none!important;
  animation:none!important;
  padding:0!important;
  min-height:0!important;
  border-radius:0!important;
}
.pf-seat-action-zone .pf-action-chip-badge.pf-action-call,
.pf-seat-action-zone .pf-action-chip-badge.pf-action-bet,
.pf-seat-action-zone .pf-action-chip-badge.pf-action-open,
.pf-seat-action-zone .pf-action-chip-badge.pf-action-raise,
.pf-seat-action-zone .pf-action-chip-badge.pf-action-allin,
body .pf-seat-action-zone .pf-action-chip-badge.pf-chip-badge-v2.pf-action-call,
body .pf-seat-action-zone .pf-action-chip-badge.pf-chip-badge-v2.pf-action-bet,
body .pf-seat-action-zone .pf-action-chip-badge.pf-chip-badge-v2.pf-action-open,
body .pf-seat-action-zone .pf-action-chip-badge.pf-chip-badge-v2.pf-action-raise,
body .pf-seat-action-zone .pf-action-chip-badge.pf-chip-badge-v2.pf-action-allin{
  background:transparent!important;
  border-color:transparent!important;
}
.pf-pot-readout{
  background:transparent!important;
  border-color:transparent!important;
  box-shadow:none!important;
  filter:drop-shadow(0 7px 18px rgba(0,0,0,.7))!important;
}

/* Trainer art pack: exact medallions, PF card backs and casino materials. */
.pf-avatar-premium{
  overflow:visible!important;
  background:linear-gradient(145deg,#f4f7fb 0%,#7f91aa 12%,#152239 24%,#020817 67%,#9aa9bd 100%)!important;
  border:2px solid rgba(231,236,243,.72)!important;
  box-shadow:0 0 0 2px rgba(1,8,22,.96),0 0 0 3px var(--avatar-accent),0 0 26px var(--avatar-glow),0 13px 26px rgba(0,0,0,.82),inset 0 0 0 1px rgba(255,255,255,.32)!important;
}
.pf-avatar-premium::before{
  inset:-7px!important;
  background:conic-gradient(from 218deg,transparent 0 13%,var(--avatar-accent) 20%,#eef3fa 27%,#7d8ea6 32%,transparent 43% 65%,var(--avatar-accent) 76%,transparent 88%)!important;
  opacity:.9!important;
}
.pf-avatar-premium::after{inset:4px!important;z-index:3!important;border-color:rgba(255,255,255,.2)!important;}
.pf-avatar-premium>.pf-avatar-svg{position:absolute;inset:7px;margin:auto;opacity:.2;z-index:0;}
.pf-avatar-art{position:absolute;inset:5px;border-radius:50%;overflow:hidden;z-index:2;background:#020817;pointer-events:none;}
.pf-avatar-art img{
  position:absolute;left:50%;top:var(--pf-art-y);width:var(--pf-art-scale);height:auto;max-width:none;
  transform:translate(-50%,-50%);user-select:none;filter:saturate(1.08) contrast(1.07) brightness(1.04);
}
.pf-avatar-premium.hero{box-shadow:0 0 0 2px rgba(1,8,22,.98),0 0 0 4px #00bfff,0 0 34px rgba(0,191,255,.72),0 0 62px rgba(0,109,255,.26),0 13px 28px rgba(0,0,0,.84)!important;}
.pf-avatar-premium[data-profile="lag"]{box-shadow:0 0 0 2px rgba(1,8,22,.98),0 0 0 3px #ff9d2e,0 0 30px rgba(255,157,46,.56),0 13px 26px rgba(0,0,0,.82)!important;}
.pf-avatar-premium[data-profile="fish"]{box-shadow:0 0 0 2px rgba(1,8,22,.98),0 0 0 3px #00e5ff,0 0 30px rgba(0,229,255,.54),0 13px 26px rgba(0,0,0,.82)!important;}
.pf-avatar-premium.compact{border-width:1.5px!important;}
.pf-avatar-premium.compact::before{inset:-4px!important;}
.pf-seat-hero-chip{
  position:relative;z-index:4;margin-top:-7px!important;margin-bottom:2px!important;padding:2px 10px!important;
  color:#00e5ff!important;background:linear-gradient(180deg,rgba(3,20,44,.98),rgba(1,8,22,.98))!important;
  border:1px solid #00bfff!important;box-shadow:0 0 15px rgba(0,191,255,.62),inset 0 1px 0 rgba(255,255,255,.18)!important;
}
.pf-seat-nameplate,.pf-mt-nameplate{
  position:relative;z-index:3;background:linear-gradient(180deg,rgba(3,13,31,.98),rgba(0,4,12,.96))!important;
  border:1px solid rgba(116,146,184,.42)!important;box-shadow:0 12px 24px rgba(0,0,0,.74),inset 0 1px 0 rgba(255,255,255,.08),0 0 14px rgba(0,109,255,.1)!important;
}
.pf-seat-nameplate{min-width:88px!important;margin-top:-5px!important;padding:7px 14px 7px!important;border-radius:14px!important;}
.pf-mt-nameplate{border-radius:7px!important;}

.pf-card-back{
  overflow:hidden!important;background:#081635!important;border:1px solid rgba(192,215,255,.72)!important;
  box-shadow:inset 0 0 0 2px rgba(0,16,50,.9),0 4px 11px rgba(0,0,0,.68),0 0 12px rgba(0,183,255,.28)!important;
}
.pf-card-back-art{
  position:absolute;inset:-1px;border-radius:inherit;
  background-image:url('/assets/trainer/09_utg_seat_x3.png');
  background-repeat:no-repeat;background-size:385% auto;background-position:38% 3%;
  filter:saturate(1.14) contrast(1.06) brightness(1.06);
}
.pf-hole-cards .card:nth-child(1){transform:rotate(-4deg) translateX(1px)!important;}
.pf-hole-cards .card:nth-child(2){transform:rotate(4deg) translateX(-1px)!important;}
.pf-villain-backs{filter:drop-shadow(0 7px 15px rgba(0,183,255,.34)) drop-shadow(0 8px 16px rgba(0,0,0,.88))!important;}

.pf-pot-chip-stack{position:relative!important;display:flex!important;justify-content:center!important;align-items:flex-end!important;width:auto!important;height:50px!important;overflow:visible!important;margin:0 0 2px!important;border-radius:0!important;}
.pf-pot-readout{gap:1px!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;outline:0!important;backdrop-filter:none!important;}
.pf-pot-label{font-size:10px!important;color:#e7ecf3!important;letter-spacing:.08em!important;}
.pf-pot-value{font-size:27px!important;color:#fff!important;text-shadow:0 2px 2px rgba(0,0,0,.88),0 0 14px rgba(0,191,255,.32)!important;}
.pf-pot-readout.compact .pf-pot-chip-stack{width:auto!important;height:28px!important;transform:none!important;margin-bottom:1px!important;}
.pf-pot-readout.compact .pf-pot-value{font-size:14px!important;}
.pf-pot-readout.compact .pf-pot-label{font-size:7.5px!important;}

.pf-blind-stack{padding:0!important;background:transparent!important;border:0!important;filter:drop-shadow(0 7px 10px rgba(0,0,0,.72))!important;}
.pf-blind-art{display:block;width:31px;height:28px;overflow:hidden;border-radius:10px;}
.pf-blind-art img{display:block;width:43px;height:auto;max-width:none;transform:translate(-6px,-1px);filter:saturate(1.12) contrast(1.06);}
.pf-blind-stack strong{margin-top:-1px!important;font-size:12px!important;color:#fff!important;text-shadow:0 2px 2px rgba(0,0,0,.85)!important;}
.pf-blind-stack em{min-width:23px!important;height:20px!important;border-radius:50%!important;font-size:7px!important;background:linear-gradient(145deg,#eff3f9,#7f8ea5)!important;box-shadow:0 4px 9px rgba(0,0,0,.55),inset 0 1px 0 #fff!important;}
.pf-blind-stack.compact{transform:scale(.85)!important;}
/* 1T — sieges au bord du rail : rentrer legerement les cartes pour rester dans le cadre */
.pf-player-seat[data-mode="1T"][data-seat="UTG"] .pf-hole-cards{transform:translateX(11px)!important;}
.pf-player-seat[data-mode="1T"][data-seat="BTN"] .pf-hole-cards{transform:translateX(-15px)!important;}

.felt-oval::before{
  background:radial-gradient(ellipse at 50% 10%,rgba(151,255,197,.07),transparent 36%),radial-gradient(ellipse at 50% 86%,rgba(0,0,0,.58),transparent 48%),repeating-radial-gradient(ellipse at 50% 50%,rgba(231,236,243,.014) 0 1px,transparent 1px 10px)!important;
  opacity:.88!important;mix-blend-mode:screen!important;
}
.felt-oval::after{inset:12px!important;border-color:rgba(255,208,90,.22)!important;box-shadow:inset 0 0 0 1px rgba(0,183,255,.08),inset 0 0 78px rgba(0,0,0,.46)!important;}

/* 1T cockpit: uses the Trainer's real actions and fills the command area from the reference. */
.grid1{position:relative;}
.grid1>.mt-slot{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}
.grid1>.mt-slot>div{flex:1 1 auto;min-height:0;}
.pf-trainer-command-dock{
  position:relative;left:auto;bottom:auto;width:calc(68% - 28px);height:54px;min-height:54px;flex:0 0 54px;z-index:42;
  display:grid;grid-template-columns:118px minmax(180px,1fr) auto;align-items:center;gap:8px;
  margin:8px 0 8px 14px;padding:6px 8px 7px;box-sizing:border-box;border:1px solid rgba(31,139,255,.48);border-radius:8px;
  background:linear-gradient(180deg,rgba(5,18,45,.96),rgba(1,7,20,.98));
  box-shadow:inset 0 1px 0 rgba(231,236,243,.09),inset 0 0 22px rgba(0,140,255,.05),0 16px 38px rgba(0,0,0,.52),0 0 18px rgba(0,140,255,.13);
  backdrop-filter:blur(12px);overflow:hidden;
}
.pf-trainer-command-dock::before{
  content:"";position:absolute;left:12px;right:12px;top:0;height:1px;
  background:linear-gradient(90deg,transparent,#00BFFF 18%,rgba(231,236,243,.7) 50%,#008CFF 82%,transparent);
  box-shadow:0 0 11px rgba(0,191,255,.7);
}
.pf-trainer-command-status{min-width:0;display:flex;flex-direction:column;gap:1px;padding-right:8px;border-right:1px solid rgba(31,139,255,.24);}
.pf-trainer-command-kicker{font:800 7px/1 'Inter',sans-serif;color:#00BFFF;letter-spacing:.14em;}
.pf-trainer-command-status strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:800 11px/1.15 'Space Grotesk',sans-serif;color:#E7ECF3;}
.pf-trainer-command-status strong i{font-style:normal;font-weight:600;font-size:8px;color:#60789D;}
.pf-trainer-command-status>span:last-child{font:700 8px/1.2 'JetBrains Mono',monospace;color:#7F94B8;}
.pf-trainer-street-track{display:grid;grid-template-columns:repeat(4,minmax(44px,1fr));gap:4px;min-width:0;}
.pf-trainer-street-track span{
  height:28px;display:grid;place-items:center;border:1px solid rgba(31,139,255,.21);border-radius:6px;
  background:linear-gradient(180deg,rgba(8,27,65,.66),rgba(2,9,24,.74));color:#7387AA;
  font:750 9px/1 'Inter',sans-serif;transition:.18s ease;
}
.pf-trainer-street-track span.active{
  color:#FFC247;border-color:rgba(255,194,71,.7);background:linear-gradient(180deg,rgba(61,36,5,.62),rgba(18,12,3,.72));
  box-shadow:inset 0 0 14px rgba(255,194,71,.08),0 0 12px rgba(255,194,71,.12);
}
.pf-trainer-command-actions{display:flex;align-items:center;gap:4px;}
.pf-trainer-command-btn,.pf-trainer-next-btn{
  height:30px;padding:0 8px;border-radius:6px;cursor:pointer;white-space:nowrap;
  font:800 8px/1 'Inter',sans-serif;transition:transform .16s ease,border-color .16s ease,background .16s ease,color .16s ease,box-shadow .16s ease;
}
.pf-trainer-command-btn{color:#9FB0CC;border:1px solid rgba(31,139,255,.3);background:rgba(5,20,50,.72);}
.pf-trainer-command-btn:hover,.pf-trainer-command-btn.active{color:#34D8FF;border-color:#00BFFF;background:rgba(0,140,255,.12);box-shadow:0 0 13px rgba(0,191,255,.17);}
.pf-trainer-command-btn.danger{color:#FF7C8F;border-color:rgba(255,69,96,.4);background:rgba(55,6,16,.52);}
.pf-trainer-command-btn.danger:hover{color:#fff;border-color:#FF4560;background:rgba(255,69,96,.16);box-shadow:0 0 13px rgba(255,69,96,.18);}
.pf-trainer-next-btn{min-width:104px;color:#041020;border:1px solid rgba(231,236,243,.26);background:linear-gradient(110deg,#008CFF,#00BFFF);box-shadow:0 0 16px rgba(0,140,255,.25);}
.pf-trainer-next-btn:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 0 22px rgba(0,191,255,.38);}
.pf-trainer-next-btn:disabled{cursor:default;color:#52698F;border-color:rgba(31,139,255,.2);background:#071631;box-shadow:none;}
.pf-trainer-command-progress{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(12,34,73,.86);}
.pf-trainer-command-progress span{display:block;height:100%;background:linear-gradient(90deg,#008CFF,#00BFFF);box-shadow:0 0 8px rgba(0,191,255,.72);transition:width .3s ease;}
@media(max-width:1200px){
  .pf-trainer-command-dock{grid-template-columns:82px minmax(150px,1fr) auto;gap:6px;width:calc(68% - 24px);height:50px;min-height:50px;flex-basis:50px;margin:6px 0 6px 12px;padding:5px 6px 6px;}
  .pf-trainer-command-status strong{font-size:10px;}
  .pf-trainer-command-btn{padding:0 6px;font-size:7px;}
  .pf-trainer-next-btn{min-width:94px;padding:0 7px;font-size:7px;}
  .pf-trainer-street-track span{height:26px;font-size:8px;}
}
@media(max-width:900px){.pf-trainer-command-dock{display:none;}}
`;

export const CSS_TABLE=`
/* Table practiced hands */
.ph-wrap{padding:16px 20px;overflow-y:auto;height:100%;}
.ph-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
.ph-search{
  flex:1;min-width:180px;background:#071B44;border:1px solid #1A3A80;color:#FFFFFF;
  border-radius:7px;padding:7px 12px 7px 32px;font-size:10.5px;outline:none;
  font-family:'Inter',sans-serif;
}
.ph-search:focus{border-color:#FFC247;box-shadow:0 0 0 2px rgba(255,194,71,.08);}
.ph-search-wrap{position:relative;flex:1;min-width:180px;}
.ph-search-ico{position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px;color:#6F81A8;pointer-events:none;}
.ph-filter-btn{
  padding:7px 13px;border-radius:7px;border:1px solid #1A3A80;
  background:#071B44;color:#9FB0CC;font-size:10px;cursor:pointer;
  font-family:'Inter',sans-serif;font-weight:700;letter-spacing:.05em;
  display:flex;align-items:center;gap:5px;transition:all .12s;
}
.ph-filter-btn:hover{border-color:#2E6CFF;color:#FFFFFF;}
.ph-filter-btn.on{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.3);}
.ph-count{font-family:'Space Grotesk',sans-serif;font-size:9px;color:#6F81A8;padding:5px 10px;border:1px solid #152D6E;border-radius:6px;white-space:nowrap;}

/* Table */
.ph-table-wrap{background:#050E28;border:1px solid #152D6E;border-radius:10px;overflow:hidden;}
.ph-table{width:100%;border-collapse:collapse;font-size:10.5px;}
.ph-thead th{
  padding:9px 10px;background:#071B44;text-align:left;
  font-size:9.5px;font-family:'Inter',sans-serif;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;color:#9FB0CC;
  border-bottom:1px solid #1A3A80;white-space:nowrap;cursor:pointer;
  user-select:none;transition:color .12s;
}
.ph-thead th:hover{color:#FFFFFF;}
.ph-thead th.sort-asc::after{content:" ↑";}
.ph-thead th.sort-desc::after{content:" ↓";}
.ph-tr{border-bottom:1px solid #0F2258;transition:background .1s;cursor:pointer;}
.ph-tr:last-child{border:none;}
.ph-tr:hover{background:#071B44;}
.ph-tr.selected{background:rgba(255,194,71,.05);border-left:2px solid #FFC247;}
.ph-td{padding:8px 10px;vertical-align:middle;white-space:nowrap;font-size:11px;color:#c4c9e8;}
.ph-td-dim{color:#9FB0CC !important;}

/* Result icons */
.res-ok{color:#10D87A;font-size:13px;}
.res-approx{color:#FFC247;font-size:11px;}
.res-err{color:#FF4560;font-size:13px;}

/* Score cell */
.score-cell{font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:700;}

/* EV cell */
.ev-zero{color:#6F81A8;font-family:'Inter',sans-serif;}
.ev-pos{color:#10D87A;font-family:'Inter',sans-serif;font-weight:700;}
.ev-neg{color:#FF4560;font-family:'Inter',sans-serif;font-weight:700;}

/* Card chips inline */
.cc{
  display:inline-flex;align-items:center;justify-content:center;
  border-radius:3px;font-weight:900;font-family:'Inter',sans-serif;
  border:1px solid;line-height:1;flex-shrink:0;
}
.cc-sm{width:20px;height:26px;font-size:9px;}
.cc-xs{width:15px;height:20px;font-size:7.5px;}
.cards-inline{display:flex;gap:2px;align-items:center;}

/* Action badges */
.act-col{font-size:8px;line-height:1.7;}
.act-street{color:#4A6090;font-family:'Inter',sans-serif;font-weight:700;letter-spacing:.05em;font-size:7.5px;}
.act-seq{display:flex;gap:2px;flex-wrap:wrap;}
.act-badge{
  width:16px;height:16px;border-radius:3px;display:inline-flex;
  align-items:center;justify-content:center;font-size:7px;
  font-family:'Inter',sans-serif;font-weight:900;letter-spacing:0;flex-shrink:0;
}
.act-F{background:#2a0810;color:#ff8090;border:1px solid #4a1020;}
.act-C{background:#082a14;color:#40e880;border:1px solid #1a4020;}
.act-R{background:#0c1830;color:#70b0ff;border:1px solid #1c3050;}
.act-B{background:#281a04;color:#FFC247;border:1px solid #483010;}
.act-X{background:#0F2258;color:#9FB0CC;border:1px solid #1A3A80;}
.act-3{background:#1a0c28;color:#9B5CFF;border:1px solid #301848;}

/* Pagination */
.ph-pager{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;background:#071B44;border-top:1px solid #152D6E;}
.ph-pager-info{font-size:9px;color:#6F81A8;font-family:'Inter',sans-serif;}
.ph-pager-btns{display:flex;align-items:center;gap:4px;}
.ph-pbtn{
  width:28px;height:28px;border-radius:5px;border:1px solid #1A3A80;
  background:#071B44;color:#9FB0CC;font-size:12px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:all .12s;
}
.ph-pbtn:hover{border-color:#2E6CFF;color:#FFFFFF;}
.ph-pbtn:disabled{opacity:.25;cursor:not-allowed;}
.ph-pbtn.on{background:rgba(255,194,71,.1);color:#FFC247;border-color:rgba(255,194,71,.3);}
.ph-page-size{
  background:#071B44;border:1px solid #1A3A80;color:#FFFFFF;
  border-radius:5px;padding:4px 7px;font-size:10px;outline:none;cursor:pointer;
  font-family:'Inter',sans-serif;
}
.ph-page-size:focus{border-color:#FFC247;}

/* ─── Hand Replay Modal ───────────────────────────── */
.hrm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.hrm-box{background:#071B44;border:1px solid #1A3A80;border-radius:16px;width:100%;max-width:640px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,.7);}
.hrm-hdr{padding:14px 18px;border-bottom:1px solid #152D6E;display:flex;align-items:center;gap:12px;}
.hrm-title{font-family:'Space Grotesk',sans-serif;font-size:11px;color:#FFC247;letter-spacing:.12em;font-weight:700;flex:1;}
.hrm-body{flex:1;overflow-y:auto;padding:16px 18px;}
.hrm-streets{display:flex;gap:4px;margin-bottom:14px;}
.hrm-stbtn{padding:6px 14px;border-radius:20px;border:1px solid #1A3A80;background:#050E28;color:#6F81A8;font-size:10px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;letter-spacing:.06em;transition:all .13s;}
.hrm-stbtn:hover:not(:disabled){color:#9FB0CC;border-color:#2E6CFF;}
.hrm-stbtn.on{background:rgba(255,194,71,.12);color:#FFC247;border-color:rgba(255,194,71,.35);}
.hrm-stbtn:disabled{opacity:.35;cursor:not-allowed;}
.hrm-felt{background:radial-gradient(ellipse at 50% 40%,#1a3525 0%,#0c1e12 60%,#050c08 100%);border-radius:12px;padding:14px;margin-bottom:12px;display:flex;flex-direction:column;align-items:center;gap:10px;min-height:120px;}
.hrm-board{display:flex;gap:4px;justify-content:center;}
.hrm-pot{font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:#FFC247;text-shadow:0 0 10px rgba(255,194,71,.4);}
.hrm-actions-list{background:#050E28;border:1px solid #152D6E;border-radius:8px;overflow:hidden;}
.hrm-act{display:flex;align-items:center;gap:9px;padding:8px 12px;border-bottom:1px solid #0F2258;font-size:11px;}
.hrm-act:last-child{border:none;}
.hrm-act-actor{font-family:'Inter',sans-serif;font-size:10px;font-weight:700;min-width:60px;}
.hrm-act-label{font-weight:700;font-family:'Inter',sans-serif;flex:1;}
.hrm-act-ev{font-size:9.5px;font-family:'Inter',sans-serif;padding:2px 7px;border-radius:4px;}
.hrm-stacks{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.hrm-stack{background:#050E28;border:1px solid #152D6E;border-radius:7px;padding:7px 12px;font-family:'Inter',sans-serif;}
.hrm-stack-name{font-size:9px;color:#9FB0CC;margin-bottom:2px;}
.hrm-stack-val{font-size:13px;font-weight:700;}
.hrm-replay-btn{padding:5px 12px;border-radius:6px;border:1px solid rgba(255,194,71,.3);background:rgba(255,194,71,.08);color:#FFC247;font-size:9.5px;font-family:'Inter',sans-serif;font-weight:700;cursor:pointer;transition:all .12s;white-space:nowrap;}
.hrm-replay-btn:hover{background:rgba(255,194,71,.15);}

/* ─── GTO Move Quality ───────────────────────────── */
.gto-quality{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;font-family:'Inter',sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.04em;}
.gto-best{background:rgba(16,216,122,.1);color:#10D87A;border:1px solid rgba(16,216,122,.3);}
.gto-correct{background:rgba(31,139,255,.08);color:#1F8BFF;border:1px solid rgba(31,139,255,.25);}
.gto-inaccuracy{background:rgba(255,194,71,.08);color:#FFC247;border:1px solid rgba(255,194,71,.25);}
.gto-wrong{background:rgba(255,100,50,.08);color:#ff6432;border:1px solid rgba(255,100,50,.2);}
.gto-blunder{background:rgba(255,69,96,.08);color:#FF4560;border:1px solid rgba(255,69,96,.25);}
.ab-freq{font-size:9px;font-family:'Inter',sans-serif;font-weight:700;opacity:.85;margin-top:1px;}

/* ─── RANGE POPUP ─────────────────────────────────── */
.rpop-overlay{
  position:fixed;inset:0;z-index:999;
  background:rgba(0,0,0,.78);backdrop-filter:blur(3px);
  display:flex;align-items:center;justify-content:center;
  animation:fadein .15s ease;
}
@keyframes fadein{from{opacity:0;}to{opacity:1;}}
.rpop{
  background:linear-gradient(145deg,#10182E,#071B44 56%,#041126);
  border:1px solid rgba(32,207,255,.42);border-radius:14px;
  padding:22px 24px;max-width:1220px;width:min(90vw,1220px);
  box-shadow:0 24px 80px rgba(0,0,0,.78),0 0 0 1px rgba(255,184,0,.08),0 0 38px rgba(32,207,255,.14);
  max-height:90vh;overflow:auto;
}
.rpop-tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;}
.rpop-tab{
  padding:9px 16px;border-radius:20px;font-size:12px;font-weight:800;cursor:pointer;
  font-family:'Inter',sans-serif;letter-spacing:.05em;border:1px solid transparent;
  transition:all .15s;color:#6F81A8;background:#071B44;
}
.rpop-tab.on{color:#FFC247;border-color:rgba(255,194,71,.35);background:rgba(255,194,71,.1);}
.seat-range-btn{
  position:absolute;bottom:-4px;right:-4px;
  width:18px;height:18px;border-radius:50%;
  background:rgba(255,194,71,.15);border:1px solid rgba(255,194,71,.35);
  color:#FFC247;font-size:9px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:all .15s;z-index:25;
  font-family:'Inter',sans-serif;font-weight:700;
}
.seat-range-btn:hover{background:rgba(255,194,71,.3);transform:scale(1.15);}
.seat-range-btn.vil{background:rgba(155,92,255,.15);border-color:rgba(155,92,255,.35);color:#9B5CFF;}
.seat-range-btn.vil:hover{background:rgba(155,92,255,.3);}

/* Trainer action palette - PokerForge identity */
:is(.gto-btn,.ab):focus-visible,
.pf-p2-next:focus-visible,
.rpop-tab:focus-visible,
.range-cell-focus:focus-visible{
  outline:2px solid rgba(32,207,255,.9)!important;
  outline-offset:2px!important;
}
.gto-btn-FOLD,.ab-FOLD{
  background:linear-gradient(180deg,#2A1018,#12070C)!important;
  border:1px solid rgba(229,72,93,.55)!important;
  color:#FFE3E8!important;
}
.gto-btn-FOLD .gto-btn-label,.gto-btn-FOLD .gto-btn-sizing{color:#FF6E82!important;}
.gto-btn-CALL,.ab-CALL{
  background:linear-gradient(180deg,#08283A,#04141F)!important;
  border:1px solid rgba(32,207,255,.55)!important;
  color:#CFF7FF!important;
}
.gto-btn-CALL .gto-btn-label,.gto-btn-CALL .gto-btn-sizing{color:#20CFFF!important;}
.gto-btn-CHECK,.ab-CHECK{
  background:linear-gradient(180deg,#09291F,#04150F)!important;
  border:1px solid rgba(37,212,135,.48)!important;
  color:#D8FFEF!important;
}
.gto-btn-CHECK .gto-btn-label,.gto-btn-CHECK .gto-btn-sizing{color:#25D487!important;}
.gto-btn-RAISE,.gto-btn-OPEN,.gto-btn-BET,.gto-btn-3BET,.gto-btn-4BET,.gto-btn-5BET,
.gto-btn-BET33,.gto-btn-BET50,.gto-btn-BET75,.gto-btn-BET100,.ab-RAISE,.ab-3BET,
.ab-BET33,.ab-BET50,.ab-BET75,.ab-BET100{
  background:linear-gradient(180deg,#352100,#140C00)!important;
  border:1px solid rgba(255,184,0,.58)!important;
  color:#FFF2C2!important;
}
.gto-btn-RAISE .gto-btn-label,.gto-btn-OPEN .gto-btn-label,.gto-btn-BET .gto-btn-label,
.gto-btn-3BET .gto-btn-label,.gto-btn-4BET .gto-btn-label,.gto-btn-5BET .gto-btn-label,
.gto-btn-BET33 .gto-btn-label,.gto-btn-BET50 .gto-btn-label,.gto-btn-BET75 .gto-btn-label,.gto-btn-BET100 .gto-btn-label,
.gto-btn-RAISE .gto-btn-sizing,.gto-btn-OPEN .gto-btn-sizing,.gto-btn-BET .gto-btn-sizing,
.gto-btn-3BET .gto-btn-sizing,.gto-btn-4BET .gto-btn-sizing,.gto-btn-5BET .gto-btn-sizing,
.gto-btn-BET33 .gto-btn-sizing,.gto-btn-BET50 .gto-btn-sizing,.gto-btn-BET75 .gto-btn-sizing,.gto-btn-BET100 .gto-btn-sizing{color:#FFB800!important;}
.gto-btn-ALLIN,.ab-ALLIN{
  background:linear-gradient(180deg,#321018,#17060B)!important;
  border:1px solid rgba(255,77,109,.62)!important;
  color:#FFE1E8!important;
}
.gto-btn-ALLIN .gto-btn-label,.gto-btn-ALLIN .gto-btn-sizing{color:#FF4D6D!important;}

/* ─── BET CHIPS on felt ──────────────────────────── */
@keyframes chipIn{0%{transform:translate(-50%,-50%) scale(.2);opacity:0;}60%{transform:translate(-50%,-50%) scale(1.15);opacity:1;}100%{transform:translate(-50%,-50%) scale(1);opacity:1;}}
@keyframes chipOut{0%{opacity:1;transform:translate(-50%,-50%) scale(1);}100%{opacity:0;transform:translate(-50%,-50%) scale(.5) translateY(-10px);}}
.bet-stack{
  position:absolute;transform:translate(-50%,-50%);
  display:flex;flex-direction:column;align-items:center;gap:2px;
  animation:chipIn .25s cubic-bezier(.22,.68,.36,1.2) forwards;
  pointer-events:none;z-index:15;
}
.bet-stack.out{animation:chipOut .3s ease forwards;}
.bet-chip{
  width:28px;height:28px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:8px;font-weight:800;font-family:'Inter',sans-serif;
  border:2px solid;box-shadow:0 2px 8px rgba(0,0,0,.5);
}
.bet-chip-hero{background:rgba(255,194,71,.25);border-color:#FFC247;color:#FFC247;}
.bet-chip-vil{background:rgba(155,92,255,.2);border-color:#9B5CFF;color:#9B5CFF;}
.bet-amount{
  font-size:9px;font-weight:800;font-family:'Inter',sans-serif;
  background:rgba(0,0,0,.8);padding:1px 5px;border-radius:4px;
  white-space:nowrap;
}

/* ─── BIBLIOTHÈQUE GTO ───────────────────────────── */
.lib-layout{display:flex;height:100%;overflow:hidden;}
.lib-nav{
  width:220px;flex-shrink:0;background:#040B1F;
  border-right:1px solid #181825;overflow-y:auto;padding:12px 0;
}
.lib-nav-section{padding:4px 14px 2px;font-size:8px;color:#4A6090;
  font-family:'Space Grotesk',sans-serif;letter-spacing:.15em;text-transform:uppercase;margin-top:8px;}
.lib-nav-item{
  padding:6px 16px;font-size:10.5px;cursor:pointer;color:#9FB0CC;
  font-family:'Inter',sans-serif;font-weight:600;letter-spacing:.03em;
  border-left:2px solid transparent;transition:all .12s;display:flex;align-items:center;gap:7px;
}
.lib-nav-item:hover{color:#FFFFFF;background:rgba(255,255,255,.03);}
.lib-nav-item.on{color:#FFC247;border-left-color:#FFC247;background:rgba(255,194,71,.06);}
.lib-content{flex:1;overflow-y:auto;padding:20px 24px;background:#030712;}
.lib-title{font-family:'Space Grotesk',sans-serif;font-size:13px;color:#FFC247;
  letter-spacing:.12em;font-weight:900;margin-bottom:4px;}
.lib-sub{font-size:10.5px;color:#9FB0CC;font-family:'Inter',sans-serif;
  letter-spacing:.04em;margin-bottom:18px;}
.lib-section-hdr{
  font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:#FFFFFF;
  letter-spacing:.06em;padding:6px 12px;background:#050E28;border:1px solid #152D6E;
  border-radius:6px;margin:14px 0 8px;display:flex;align-items:center;gap:8px;
}
.lib-spots-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:16px;}
.lib-spot-card{
  background:#050E28;border:1px solid #152D6E;border-radius:10px;
  padding:11px 13px;cursor:pointer;transition:all .15s;position:relative;overflow:hidden;
}
.lib-spot-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#FFC247,#FFC247);opacity:0;transition:opacity .15s;}
.lib-spot-card:hover{border-color:#1A3A80;background:#071B44;transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.4);}
.lib-spot-card:hover::before,.lib-spot-card.on::before{opacity:1;}
.lib-spot-card.on{border-color:rgba(255,194,71,.35);background:#071B44;}
.lib-spot-pos{
  display:inline-block;padding:2px 7px;border-radius:20px;font-size:8.5px;font-weight:700;
  font-family:'Inter',sans-serif;letter-spacing:.06em;margin-bottom:5px;
  background:rgba(255,194,71,.1);color:#FFC247;border:1px solid rgba(255,194,71,.25);
}
.lib-spot-title{font-size:10.5px;font-weight:700;color:#FFFFFF;font-family:'Inter',sans-serif;margin-bottom:2px;}
.lib-spot-desc{font-size:8.5px;color:#6F81A8;font-family:'Inter',sans-serif;}
.lib-detail{background:#050E28;border:1px solid #152D6E;border-radius:12px;padding:16px 18px;margin-top:16px;}
.lib-kp-item{
  display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #071B44;
  font-size:10px;color:#9FB0CC;font-family:'Inter',sans-serif;align-items:flex-start;
}
.lib-kp-item:last-child{border-bottom:none;}
.lib-kp-ico{width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;margin-top:1px;}
.lib-stats-row{display:flex;gap:8px;margin:12px 0;}
.lib-stat{flex:1;background:#071B44;border:1px solid #152D6E;border-radius:8px;padding:8px 10px;text-align:center;}
.lib-stat-v{font-size:16px;font-weight:900;font-family:'Inter',sans-serif;margin-bottom:2px;}
.lib-stat-l{font-size:8px;color:#6F81A8;font-family:'Inter',sans-serif;letter-spacing:.06em;text-transform:uppercase;}
.lib-leak{padding:5px 10px;margin:3px 0;background:rgba(255,69,96,.05);border:1px solid rgba(255,69,96,.12);border-radius:6px;font-size:9.5px;color:#ff8090;font-family:'Inter',sans-serif;}
.lib-leak::before{content:"⚠ ";font-size:9px;}

/* ─── DEALER BUTTON ──────────────────────────────── */
@keyframes dealerPulse{0%,100%{box-shadow:0 0 8px rgba(255,255,255,.4),0 2px 6px rgba(0,0,0,.6);}50%{box-shadow:0 0 16px rgba(255,255,255,.7),0 2px 8px rgba(0,0,0,.7);}}
.dealer-btn{
  position:absolute;transform:translate(-50%,-50%);
  width:22px;height:22px;border-radius:50%;z-index:25;
  background:linear-gradient(145deg,#f0f0e8,#d0cfc0);
  border:2px solid #fff;
  display:flex;align-items:center;justify-content:center;
  font-size:9px;font-weight:900;font-family:'Inter',sans-serif;
  color:#111;letter-spacing:.03em;
  box-shadow:0 0 8px rgba(255,255,255,.4),0 2px 6px rgba(0,0,0,.6);
  animation:dealerPulse 2.5s infinite;pointer-events:none;
}
.dealer-btn-sm{width:16px;height:16px;font-size:7px;}

/* ─── PROS CARDS ─────────────────────────────────── */
.pros-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:4px 0 20px;}
.pro-card{
  background:linear-gradient(145deg,#12121e,#0d0d18);
  border:1px solid #152D6E;border-radius:14px;overflow:hidden;
  cursor:pointer;transition:all .2s;position:relative;
}
.pro-card:hover{border-color:#1A3A80;transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,.5);}
.pro-card.open{border-color:rgba(255,194,71,.3);}
.pro-card-banner{
  height:80px;display:flex;align-items:flex-end;padding:12px 14px 10px;
  position:relative;overflow:hidden;
}
.pro-avatar{
  width:52px;height:52px;border-radius:50%;border:3px solid;
  display:flex;align-items:center;justify-content:center;
  font-size:20px;font-weight:900;font-family:'Space Grotesk',sans-serif;
  flex-shrink:0;position:relative;z-index:2;
}
.pro-info{margin-left:10px;position:relative;z-index:2;}
.pro-name{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:900;color:#FFFFFF;letter-spacing:.06em;}
.pro-title{font-size:9px;color:rgba(255,255,255,.4);font-family:'Inter',sans-serif;margin-top:1px;letter-spacing:.04em;}
.pro-nat{font-size:14px;position:absolute;top:10px;right:12px;z-index:2;}
.pro-stats-row{display:flex;gap:0;border-top:1px solid #152D6E;border-bottom:1px solid #152D6E;}
.pro-stat{flex:1;padding:8px 10px;text-align:center;border-right:1px solid #152D6E;}
.pro-stat:last-child{border-right:none;}
.pro-stat-v{font-size:11px;font-weight:700;font-family:'Inter',sans-serif;}
.pro-stat-l{font-size:7px;color:#6F81A8;font-family:'Inter',sans-serif;letter-spacing:.06em;text-transform:uppercase;margin-top:1px;}
.pro-body{padding:12px 14px;}
.pro-style-tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:8px;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.05em;margin-right:5px;margin-bottom:5px;}
.pro-hand{
  background:#0a0a14;border:1px solid #152D6E;border-radius:8px;
  padding:10px 12px;margin-top:10px;
}
.pro-hand-title{font-size:8.5px;color:#FFC247;font-family:'Inter',sans-serif;font-weight:700;letter-spacing:.06em;margin-bottom:6px;}
.pro-quote{
  margin-top:10px;padding:8px 12px;background:rgba(255,194,71,.04);
  border-left:2px solid rgba(255,194,71,.3);border-radius:0 6px 6px 0;
  font-style:italic;font-size:9.5px;color:#9FB0CC;font-family:'Inter',sans-serif;
  line-height:1.65;
}

/* ─── MENTAL GAME ────────────────────────────────── */
.mental-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:20px;}
.mental-card{
  background:#050E28;border:1px solid #152D6E;border-radius:12px;
  padding:16px;cursor:pointer;transition:all .18s;position:relative;overflow:hidden;
}
.mental-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;transition:opacity .18s;}
.mental-card:hover{border-color:#1A3A80;transform:translateY(-3px);box-shadow:0 8px 28px rgba(0,0,0,.4);}
.mental-card:hover::before,.mental-card.on::before{opacity:1;}
.mental-card.on{border-color:var(--mc);background:#071B44;}

/* Breathing circle */
@keyframes breatheIn{0%{transform:scale(.55);opacity:.5;}100%{transform:scale(1);opacity:1;}}
@keyframes breatheOut{0%{transform:scale(1);opacity:1;}100%{transform:scale(.55);opacity:.5;}}
@keyframes breatheHold{0%,100%{transform:scale(1);}}
.breath-circle{
  width:110px;height:110px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  flex-direction:column;margin:0 auto;cursor:pointer;
  transition:box-shadow .3s;position:relative;
}
.breath-ring{
  position:absolute;inset:-8px;border-radius:50%;border:2px solid;
  opacity:.25;animation:none;
}
.breath-label{font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:700;letter-spacing:.12em;text-align:center;}
.breath-count{font-family:'Inter',sans-serif;font-size:32px;font-weight:900;line-height:1;}

/* Warm-up checklist */
.warmup-step{
  display:flex;align-items:flex-start;gap:12px;padding:10px 14px;
  border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all .15s;
  border:1px solid transparent;
}
.warmup-step:hover{background:#071B44;border-color:#152D6E;}
.warmup-step.done{background:rgba(16,216,122,.06);border-color:rgba(16,216,122,.18);}
.warmup-check{
  width:22px;height:22px;border-radius:50%;border:2px solid #1A3A80;
  flex-shrink:0;display:flex;align-items:center;justify-content:center;
  font-size:12px;transition:all .2s;margin-top:1px;
}
.warmup-step.done .warmup-check{background:rgba(16,216,122,.2);border-color:#10D87A;color:#10D87A;}

/* Tilt meter */
.tilt-meter{height:12px;background:#071B44;border-radius:6px;overflow:hidden;position:relative;margin:8px 0;}
.tilt-meter-fill{height:100%;border-radius:6px;transition:width .4s,background .4s;}
.tilt-slider{-webkit-appearance:none;width:100%;height:6px;border-radius:3px;outline:none;cursor:pointer;background:transparent;}
.tilt-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid #fff;}

/* Ressources cards */
.res-card{
  display:flex;gap:12px;padding:12px 14px;background:#050E28;border:1px solid #152D6E;
  border-radius:10px;margin-bottom:8px;transition:all .15s;
}
.res-card:hover{border-color:#1A3A80;background:#071B44;}
.res-ico{width:42px;height:42px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
.res-type{font-size:7.5px;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px;}
.res-title{font-size:11px;font-weight:700;color:#FFFFFF;font-family:'Inter',sans-serif;margin-bottom:2px;}
.res-sub{font-size:9px;color:#9FB0CC;font-family:'Inter',sans-serif;line-height:1.55;}
.res-badge{display:inline-block;padding:"2px 7px";border-radius:20px;font-size:8px;font-weight:700;font-family:'Inter',sans-serif;margin-top:4px;}

/* Stat bar above table */
.ph-stats-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
.ph-stat{
  flex:1;min-width:100px;background:#050E28;border:1px solid #152D6E;
  border-radius:8px;padding:10px 13px;position:relative;overflow:hidden;
}
.ph-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
.ph-stat-gold::before{background:linear-gradient(90deg,#FFC247,#FFC247);}
.ph-stat-green::before{background:linear-gradient(90deg,#0a9a40,#10D87A);}
.ph-stat-red::before{background:linear-gradient(90deg,#c01830,#FF4560);}
.ph-stat-blue::before{background:linear-gradient(90deg,#1a70c0,#1F8BFF);}
.ph-stat-l{font-size:10px;color:#9FB0CC;font-family:'Inter',sans-serif;letter-spacing:.08em;margin-bottom:3px;font-weight:700;}
.ph-stat-v{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;line-height:1;}

/* Centre juridique */
.pf-legal-overlay{
  position:fixed;inset:0;z-index:2500;display:flex;align-items:center;justify-content:center;
  padding:22px;background:rgba(0,5,18,.86);backdrop-filter:blur(12px);
  animation:pfLegalFade .18s ease-out;
}
.pf-legal-modal{
  width:min(1100px,96vw);height:min(790px,92vh);display:flex;flex-direction:column;overflow:hidden;
  border:1px solid rgba(31,139,255,.52);border-radius:10px;
  background:linear-gradient(150deg,rgba(5,18,49,.99),rgba(1,8,25,.99) 58%,rgba(2,13,37,.99));
  box-shadow:0 0 0 1px rgba(0,191,255,.08) inset,0 0 38px rgba(0,140,255,.22),0 24px 80px rgba(0,0,0,.7);
}
.pf-legal-head{
  min-height:92px;display:flex;align-items:center;justify-content:space-between;padding:18px 22px 16px 26px;
  border-bottom:1px solid rgba(31,139,255,.28);background:linear-gradient(90deg,rgba(0,140,255,.10),transparent 50%);
}
.pf-legal-brand{font:900 italic 14px/1 'Space Grotesk',sans-serif;color:#E7ECF3;letter-spacing:.05em;text-shadow:0 0 12px rgba(0,191,255,.7);}
.pf-legal-brand span{color:#00BFFF;}
.pf-legal-head h2{margin:6px 0 3px;font:800 22px/1.1 'Space Grotesk',sans-serif;color:#fff;letter-spacing:0;}
.pf-legal-head p{margin:0;font:10.5px/1.5 'Inter',sans-serif;color:#8EA4C9;}
.pf-legal-close{
  width:36px;height:36px;display:grid;place-items:center;flex:0 0 auto;border-radius:8px;cursor:pointer;
  color:#9FB0CC;border:1px solid #1A3A80;background:rgba(7,27,68,.72);transition:.18s ease;
}
.pf-legal-close:hover{color:#fff;border-color:#00BFFF;background:rgba(0,140,255,.14);box-shadow:0 0 16px rgba(0,191,255,.24);}
.pf-legal-close svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;}
.pf-legal-layout{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:0;flex:1;}
.pf-legal-tabs{display:flex;flex-direction:column;gap:6px;padding:18px 12px;border-right:1px solid rgba(31,139,255,.22);background:rgba(0,7,25,.48);}
.pf-legal-tab{
  width:100%;min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;
  border:1px solid transparent;border-radius:7px;cursor:pointer;text-align:left;background:transparent;color:#8297BA;
  font:700 10.5px/1.25 'Inter',sans-serif;transition:.18s ease;
}
.pf-legal-tab:hover{color:#DCE8FA;border-color:rgba(31,139,255,.26);background:rgba(31,139,255,.07);}
.pf-legal-tab.active{color:#fff;border-color:rgba(0,191,255,.55);background:linear-gradient(90deg,rgba(0,140,255,.20),rgba(0,191,255,.05));box-shadow:0 0 16px rgba(0,140,255,.14),inset 3px 0 0 #00BFFF;}
.pf-legal-tab svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;opacity:.75;}
.pf-legal-version{margin-top:auto;padding:12px 10px 4px;border-top:1px solid rgba(31,139,255,.16);font:600 8.5px/1.4 'Inter',sans-serif;color:#556C93;}
.pf-legal-body{min-width:0;overflow:auto;padding:26px 30px 34px;scrollbar-color:#1F8BFF #061326;}
.pf-legal-document-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:20px;border-bottom:1px solid rgba(31,139,255,.18);}
.pf-legal-document-head h3{margin:0 0 6px;font:800 23px/1.18 'Space Grotesk',sans-serif;color:#fff;letter-spacing:0;}
.pf-legal-document-head p{max-width:680px;margin:0;font:11px/1.6 'Inter',sans-serif;color:#8EA4C9;}
.pf-legal-updated{flex:0 0 auto;padding-top:5px;font:600 8.5px/1.4 'Inter',sans-serif;color:#60789D;}
.pf-legal-warning{display:flex;gap:11px;margin:18px 0 2px;padding:12px 14px;border:1px solid rgba(255,194,71,.35);border-radius:8px;background:rgba(255,194,71,.07);color:#FFC247;}
.pf-legal-warning.draft{border-color:rgba(0,191,255,.34);background:rgba(0,140,255,.08);color:#34D8FF;}
.pf-legal-warning svg{width:18px;height:18px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;}
.pf-legal-warning strong,.pf-legal-warning span{display:block;font-family:'Inter',sans-serif;}
.pf-legal-warning strong{font-size:10px;line-height:1.35;}
.pf-legal-warning span{margin-top:2px;font-size:9px;line-height:1.5;color:#9FB0CC;}
.pf-legal-sections{max-width:790px;padding-top:4px;}
.pf-legal-section{padding:20px 0;border-bottom:1px solid rgba(31,139,255,.12);}
.pf-legal-section:last-child{border-bottom:0;}
.pf-legal-section h4{margin:0 0 10px;font:750 13px/1.35 'Space Grotesk',sans-serif;color:#E7ECF3;letter-spacing:0;}
.pf-legal-section p,.pf-legal-section li{font:10.5px/1.72 'Inter',sans-serif;color:#9FB0CC;}
.pf-legal-section p{margin:0 0 8px;}
.pf-legal-section p:last-child{margin-bottom:0;}
.pf-legal-section ul{margin:8px 0 0;padding:0;list-style:none;}
.pf-legal-section li{position:relative;margin:7px 0;padding-left:17px;}
.pf-legal-section li::before{content:'';position:absolute;left:1px;top:.72em;width:5px;height:5px;border-radius:50%;background:#00BFFF;box-shadow:0 0 8px rgba(0,191,255,.7);}
.pf-settings-legal-actions{display:flex;gap:8px;flex-wrap:wrap;}
.pf-settings-legal-btn{
  min-height:38px;padding:0 13px;border:1px solid #1A3A80;border-radius:7px;background:rgba(7,27,68,.55);color:#B8C9E5;
  font:700 9.5px/1 'Inter',sans-serif;cursor:pointer;transition:.18s ease;
}
.pf-settings-legal-btn:hover{border-color:#00BFFF;color:#fff;background:rgba(0,140,255,.12);box-shadow:0 0 12px rgba(0,191,255,.16);}
.pf-auth-legal-button{display:inline;padding:0;border:0;background:none;color:#34D8FF;font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer;}
.pf-auth-legal-button:hover{color:#fff;}
@keyframes pfLegalFade{from{opacity:0}to{opacity:1}}
@media(max-width:720px){
  .pf-legal-overlay{padding:0;align-items:stretch;}
  .pf-legal-modal{width:100%;height:100%;max-height:none;border-radius:0;border-left:0;border-right:0;}
  .pf-legal-head{min-height:82px;padding:15px 16px;}
  .pf-legal-head h2{font-size:19px;}
  .pf-legal-layout{display:flex;flex-direction:column;}
  .pf-legal-tabs{flex:0 0 auto;flex-direction:row;overflow-x:auto;padding:10px;border-right:0;border-bottom:1px solid rgba(31,139,255,.22);scrollbar-width:none;}
  .pf-legal-tabs::-webkit-scrollbar{display:none;}
  .pf-legal-tab{width:auto;min-width:max-content;min-height:36px;padding:0 11px;}
  .pf-legal-tab svg,.pf-legal-version{display:none;}
  .pf-legal-body{padding:20px 17px 28px;}
  .pf-legal-document-head{display:block;padding-bottom:16px;}
  .pf-legal-document-head h3{font-size:20px;}
  .pf-legal-updated{display:block;padding-top:9px;}
}

/* Mobile Training hardening: must stay after premium/art-pack overrides. */
@media(max-width:768px){
  .hdr{height:56px!important;padding:0 10px!important;gap:8px!important;}
  .logo-wrapper{min-width:0!important;max-width:46vw!important;}
  .logo-full-wrap{display:flex!important;min-width:0!important;max-width:46vw!important;overflow:hidden!important;}
  .logo-compact-wrap{display:none!important;}
  .logo-full-wrap img.pf-header-logo{
    height:38px!important;width:auto!important;max-width:46vw!important;object-fit:contain!important;object-position:left center!important;
    filter:drop-shadow(0 0 13px rgba(0,140,255,.68))!important;
  }
  .pf-header-logo-fallback svg{height:36px!important;max-width:44vw!important;}
  .hdr-breadcrumb span{font-size:12px!important;letter-spacing:.01em!important;}
  .hdr-breadcrumb svg{width:16px!important;height:16px!important;}
  .hdr .utog{padding:5px 8px!important;font-size:10px!important;}
  .hdr .pf-acct-btn{width:34px!important;height:34px!important;}
  .hdr>div:last-child{gap:4px!important;}

  .trainer-scroll-area{overflow:auto!important;-webkit-overflow-scrolling:touch!important;}
  .grid1{padding:0!important;gap:0!important;grid-auto-rows:auto!important;}
  .grid1>.mt-slot{height:auto!important;min-height:0!important;display:flex!important;flex-direction:column!important;}
  .grid1>.mt-slot>div{height:auto!important;min-height:0!important;display:flex!important;flex-direction:column!important;}
  .t1-row{display:flex!important;flex-direction:column!important;min-height:0!important;overflow:visible!important;}
  .t1-left{
    /* La table REMPLIT la hauteur disponible au lieu d'une hauteur figée :
       sur écran court (barre Safari) elle ne déborde plus sur le bandeau d'actions. */
    flex:1 1 0!important;
    height:auto!important;
    min-height:0!important;
    /* Calibration §5 : plafond relevé (400→520) pour absorber l'espace rendu par le
       bandeau de décision compacté (§4) → le feutre devient l'élément dominant.
       Sièges/felt en % scalent avec la hauteur. */
    max-height:520px!important;
    overflow:hidden!important;
    /* Zone de sécurité basse (§1) : marge constante entre le bloc HERO (qui vit dans
       le bas du feutre) et le bandeau de décision → HERO jamais rogné. */
    padding-bottom:18px!important;
    box-sizing:border-box!important;
  }
  /* Raccourcis clavier inutiles sur mobile (pas de clavier) → hauteur récupérée pour le feutre. */
  .mtr-kbd-hints{display:none!important;}
  .tw{border-radius:0!important;}
  .training-table-zone{overflow:hidden!important;}
  .t1-left .felt-oval{top:6%!important;left:12%!important;right:12%!important;bottom:5%!important;}
  .trainer-hud{min-height:30px!important;padding:4px 8px!important;gap:5px!important;}
  .trainer-hud .hud-chip{font-size:8px!important;padding:2px 7px!important;}

  .pf-player-seat[data-mode="1T"]{max-width:74px!important;gap:0!important;z-index:30!important;contain:none!important;}
  .pf-player-seat[data-mode="1T"] .player-card-1t{min-width:54px!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;}
  .pf-player-seat[data-mode="1T"] .pf-avatar-premium{
    /* Avatars réduits (~ -10px) : dégagent les cartes du board et le bord haut de table. */
    width:calc(var(--avatar-size) - 2px)!important;height:calc(var(--avatar-size) - 2px)!important;border-width:1.5px!important;
  }
  .pf-player-seat[data-mode="1T"] .pf-avatar-premium::before{inset:-4px!important;}
  .pf-player-seat[data-mode="1T"] .pf-avatar-premium::after{inset:3px!important;}
  .pf-player-seat[data-mode="1T"] .pf-avatar-art{inset:3px!important;}
  .pf-player-seat[data-mode="1T"] .pf-seat-nameplate{
    min-width:54px!important;padding:4px 7px!important;border-radius:9px!important;margin-top:-3px!important;gap:0!important;
  }
  .pf-player-seat[data-mode="1T"] .seat-card-pos{font-size:10px!important;margin-top:1px!important;}
  .pf-player-seat[data-mode="1T"] .seat-card-stack{font-size:8px!important;}
  .pf-player-seat[data-mode="1T"] .seat-card-stats{display:none!important;}
  .pf-player-seat[data-mode="1T"] .pf-seat-hero-chip{font-size:5.5px!important;padding:1px 5px!important;margin-top:-5px!important;margin-bottom:1px!important;}
  .pf-player-seat[data-mode="1T"] .pf-fold-chip,
  .pf-player-seat[data-mode="1T"] .pf-multiway-chip{font-size:6px!important;padding:1px 5px!important;margin-top:1px!important;}

  /* Cartes HERO agrandies ~+50% (26×36 → 40×56) : lisibles, dominantes vs board/villains (§3). */
  .card-1t-hero-mobile{width:40px!important;height:56px!important;border-radius:6px!important;}
  .card-1t-hero-mobile .card-corner-r{font-size:16px!important;}
  .card-1t-hero-mobile .card-corner-s{font-size:11px!important;}
  .card-1t-hero-mobile .card-center{font-size:24px!important;}
  .card-1t-hero-mobile .card-corner{top:3px!important;left:3px!important;}
  /* Cartes du board réduites (désencombrement mobile : plus d'air autour du board). */
  .t1-left .card-lg{width:34px!important;height:47px!important;border-radius:6px!important;}
  .t1-left .card-lg .card-corner-r{font-size:13px!important;}
  .t1-left .card-lg .card-corner-s{font-size:9px!important;}
  .t1-left .card-lg .card-center{font-size:20px!important;}
  .t1-left .card-md{width:29px!important;height:40px!important;border-radius:5px!important;}
  .t1-left .card-md .card-corner-r{font-size:11px!important;}
  .t1-left .card-md .card-corner-s{font-size:7px!important;}
  .t1-left .card-md .card-center{font-size:16px!important;}
  .pf-player-seat[data-mode="1T"][data-seat="UTG"] .pf-hole-cards{transform:translateX(5px)!important;}
  .pf-player-seat[data-mode="1T"][data-seat="BTN"] .pf-hole-cards{transform:translateX(-7px)!important;}
  .pf-villain-backs{filter:drop-shadow(0 3px 8px rgba(0,183,255,.22)) drop-shadow(0 5px 9px rgba(0,0,0,.78))!important;}

  .pf-pot-readout{padding:1px 8px 3px!important;gap:0!important;transform:translate(-50%,-50%) scale(.78)!important;z-index:12!important;}
  .pf-pot-chip-stack{height:28px!important;margin-bottom:0!important;}
  .pf-pot-value{font-size:22px!important;}
  .pf-pot-label{font-size:8px!important;}
  .pf-pot-readout.compact{transform:translate(-50%,-50%) scale(.74)!important;}
  .pf-pot-readout.compact .pf-pot-chip-stack{height:20px!important;}
  .pf-pot-readout.compact .pf-pot-value{font-size:12px!important;}
  .pf-pot-readout.compact .pf-pot-label{font-size:7px!important;}

  .pf-seat-action-zone{transform:translate(-50%,-50%) scale(.72)!important;z-index:22!important;}
  .pf-action-chip-badge{max-width:92px!important;min-height:23px!important;padding:2px 5px!important;border-radius:8px!important;gap:3px!important;}
  .pf-action-chip-piles{transform:scale(.78)!important;transform-origin:center right!important;margin-right:-8px!important;}
  .pf-action-chip-piles>.pf-chip-stack{margin-left:-12px!important;}
  .pf-action-chip-copy strong{font-size:6.6px!important;max-width:42px!important;}
  .pf-action-chip-copy em{font-size:7px!important;}
  /* Hero-centric mobile : le héros occupe le bas-centre → on masque les libellés
     de contexte qui y étaient (redondants avec l'en-tête du bandeau de décision). */
  .t1-left .table-action-line{display:none!important;}
  /* Dealer 1T mobile : plus lisible (§17), rattaché au siège BTN via son ancre auto-dérivée. */
  .t1-left .dealer-btn{width:22px!important;height:22px!important;font-size:10px!important;z-index:25!important;}
  /* Ligne d'infos du spot déplacée SOUS l'historique (§6/7) : le HUD du haut est
     masqué sur mobile, la version basse (.pf-spot-info-bottom) est rendue par le
     composant PARENT après l'historique (elle a accès à activeSpot). */
  .trainer-hud.trainer-hud-top{display:none!important;}
  .pf-spot-info-bottom{width:100%!important;max-width:100vw!important;box-sizing:border-box!important;
    display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;scrollbar-width:none!important;
    gap:6px!important;align-items:center!important;padding:5px 12px calc(4px + env(safe-area-inset-bottom,0px))!important;
    background:linear-gradient(90deg,#040B22,#030912)!important;border-top:1px solid rgba(31,139,255,.16)!important;flex-shrink:0!important;}
  .pf-spot-info-bottom::-webkit-scrollbar{display:none;}
  .pf-spot-info-bottom .hud-chip{flex-shrink:0!important;min-height:26px!important;font-size:10px!important;padding:3px 9px!important;white-space:nowrap!important;border-radius:8px;background:rgba(31,139,255,.06);border:1px solid rgba(31,139,255,.14);color:#8FB4E8;font-family:'Space Grotesk',sans-serif;font-weight:700;display:inline-flex;align-items:center;}
  /* Ancrages de mises réduits ~28% (§1) et blindes ~20% (§2) : la pile de jetons
     reste l'élément principal, montants lisibles, jamais sur le pot/board. */
  .t1-left .pf-seat-action-zone{transform:translate(-50%,-50%) scale(.72)!important;}
  .t1-left .pf-blind-anchor{transform:translate(-50%,-50%) scale(.6)!important;}
  /* Bouton Coach AI compact dans la barre de contrôle (§4). */
  .mtr-coach-btn{border-color:rgba(155,92,255,.45)!important;}
  /* Libellé « Face à … · À payer » : redondant avec l'en-tête du bandeau et il
     chevauchait la plaque du héros (héros en bas-centre) → masqué sur mobile. */
  .t1-left .pf-facing-label{display:none!important;}
  /* Grandes tables (7-9 joueurs) : plaque nom/stack resserrée sous l'avatar déjà réduit
     → moins de chevauchement entre sièges voisins. */
  .player-card-1t[data-dense="1"]{min-width:0!important;gap:0!important;}
  .player-card-1t[data-dense="1"] .pf-seat-nameplate{transform:scale(.8);transform-origin:top center;}
  .player-card-1t[data-dense="1"] .seat-card-stats{font-size:6px!important;}
  .pf-blind-anchor{transform:translate(-50%,-50%) scale(.74)!important;z-index:24!important;}
  .pf-blind-art{width:24px!important;height:21px!important;border-radius:8px!important;}
  .pf-blind-art img{width:34px!important;transform:translate(-5px,-1px)!important;}
  .pf-blind-stack strong{font-size:9px!important;}
  .pf-blind-stack em{min-width:18px!important;height:16px!important;font-size:6px!important;}
  .dealer-btn{width:16px!important;height:16px!important;font-size:7px!important;z-index:26!important;}
  .table-action-line{bottom:3.5%!important;max-width:86%!important;font-size:8px!important;padding:2px 8px!important;}
  .t1-left>div[style*="bottom: 1%"],
  .t1-left>div[style*='bottom:"1%"']{bottom:2.5%!important;font-size:8px!important;max-width:86%!important;}

  .pf-mt-seat{max-width:58px!important;contain:none!important;}
  .pf-mt-seat .pf-avatar-premium{width:calc(var(--avatar-size) + 7px)!important;height:calc(var(--avatar-size) + 7px)!important;border-width:1.4px!important;}
  .pf-mt-seat .pf-avatar-premium::before{inset:-4px!important;}
  .pf-mt-seat .pf-avatar-art{inset:3px!important;}
  .pf-mt-nameplate{padding:2px 5px!important;border-radius:7px!important;margin-top:0!important;min-width:40px!important;}
  .pf-mt-nameplate .pf-seat-hero-chip{font-size:5px!important;padding:1px 4px!important;}
  /* Multi-table (maquette V1) : la zone de table remplit le viewport (plus d'aspect-ratio figé). */
  .grid2 .training-table-zone,.grid3 .training-table-zone,.grid4 .training-table-zone{padding-bottom:0!important;flex:1 1 auto!important;min-height:0!important;}

  /* Bandeau de décision COMPACT (§4/§5) : on supprime les espaces vides entre les
     lignes (marges 7/7/5 → 3/3/0) et on rabote les paddings, SANS réduire les zones
     tactiles (boutons principaux 34px, sizings 20px restent cliquables au doigt).
     Hauteur ~102px → ~72px → espace rendu au feutre (flex:1). */
  .mtr-actions{
    padding:3px 10px calc(4px + env(safe-area-inset-bottom,0px))!important;
    border-top-color:rgba(31,139,255,.32)!important;
  }
  /* Écrasement des marges inter-lignes (context / boutons / sizings) rendues en inline. */
  .t1-mob .mtr-actions>div{margin-bottom:3px!important;}
  .t1-mob .mtr-actions>div:last-child{margin-bottom:0!important;}
  .mtr-actions .gto-btn{min-height:34px!important;border-radius:8px!important;}
  .mtr-actions .gto-btn .gto-btn-inner{padding:3px 5px 2px!important;gap:0!important;}
  .mtr-actions .gto-btn-label{font-size:12px!important;line-height:1.05!important;}
  .mtr-actions .gto-btn-sizing{font-size:8.5px!important;padding:1px 4px!important;}
  .mtr-actions .sizing-btn{min-height:20px!important;font-size:8px!important;border-radius:6px!important;padding:1px 4px!important;}
  /* STABILITÉ DU VIEWPORT (§10/§11) : la zone basse réserve une hauteur constante
     quelle que soit la phase (action hero ↔ panneau résultat ↔ vilain réfléchit).
     Le contenu est collé en bas (justify-content:flex-end) → aucune resize du feutre
     entre deux mains, et le surplus éventuel sert de zone de sécurité au-dessus du
     bandeau. La valeur couvre le panneau résultat compacté (~106px). */
  /* Réserve = hauteur du contenu le plus haut de la zone basse (panneau résultat
     ~100px, bandeau d'action 4 boutons ~99px) → TOUTES les phases tiennent dans la
     même hauteur : zéro resize du feutre entre les mains (§10/§11). */
  .t1-mob{min-height:100px!important;justify-content:flex-end!important;}
  /* Bouton « Main suivante » : reste la CTA dominante mais rabotée pour aligner la
     hauteur du panneau résultat sur celle du bandeau d'action (viewport stable). */
  .t1-mob .gto-next-btn{min-height:38px!important;padding:8px 12px!important;}
  .t1-mob .gto-btn-secondary{padding:8px 12px!important;}
  /* Stepper fin (− bb +) masqué sur mobile : les presets MIN/2.5x/3x… suffisent
     pour le sizing → une rangée entière récupérée pour la table (flex:1). */
  .mtr-actions .sizing-custom{display:none!important;}
  .mtr-actions .ab{min-height:46px!important;border-radius:10px!important;font-size:12px!important;}
  .mtr-actions kbd{display:none!important;}
  .pf-fab{right:12px!important;bottom:calc(88px + env(safe-area-inset-bottom,0px))!important;padding:10px 14px!important;font-size:11px!important;}
}

@media(max-width:380px){
  .logo-wrapper,.logo-full-wrap{max-width:42vw!important;}
  .logo-full-wrap img.pf-header-logo{height:34px!important;max-width:42vw!important;}
  .hdr-breadcrumb span{font-size:11px!important;}
  /* Reste flexible sur écran étroit (iPhone mini/SE) — pas de hauteur figée qui ferait déborder la table. */
  .t1-left{flex:1 1 0!important;flex-basis:0!important;height:auto!important;min-height:0!important;}
  .pf-player-seat[data-mode="1T"] .pf-avatar-premium{width:calc(var(--avatar-size) - 2px)!important;height:calc(var(--avatar-size) - 2px)!important;}
  .card-1t-hero-mobile{width:38px!important;height:53px!important;}
  .card-1t-hero-mobile .card-corner-r{font-size:15px!important;}
  .card-1t-hero-mobile .card-center{font-size:23px!important;}
  .pf-seat-action-zone{transform:translate(-50%,-50%) scale(.66)!important;}
  .pf-blind-anchor{transform:translate(-50%,-50%) scale(.68)!important;}
}
/* ── Écran COURT (iPhone SE, barre Safari, petits Android) : la table se
   comprime → board + cartes héros réduits pour garder l'écart pot/board/hero
   (§18/19). max-height cible les faibles hauteurs indépendamment de la largeur. */
@media(max-width:768px) and (max-height:730px){
  .t1-left .card-1t-board{width:31px!important;height:43px!important;}
  .t1-left .card-1t-board .card-corner-r{font-size:12px!important;}
  .t1-left .card-1t-board .card-center{font-size:18px!important;}
  .card-1t-hero-mobile{width:29px!important;height:40px!important;}
  .card-1t-hero-mobile .card-corner-r{font-size:11px!important;}
  .card-1t-hero-mobile .card-corner-s{font-size:8px!important;}
  .card-1t-hero-mobile .card-center{font-size:17px!important;}
}

/* ═══ TABLE 1T — ANTI-CHEVAUCHEMENT AUTOUR DU HERO (§3.1) ═══
   Le bloc HERO vit en bas-centre de la table. Or deux libellés étaient rendus
   EN ABSOLU au même endroit :
     · .table-action-line  (« Preflop BB décision ») → chevauchait la plaque BB ;
     · .pf-facing-label    (« Face à Open 2.5bb → à payer 1.5bb ») → coincé à
       3px de la plaque et 5px du bandeau d'actions.
   Les deux sont REDONDANTS : l'en-tête du bandeau d'actions affiche déjà
   « HJ vs UTG · Face à Open 2.5bb · à payer 2.5bb », c'est-à-dire exactement le
   texte d'information « juste au-dessus de la zone d'actions » attendu.
   On les masque donc dans la table → zéro chevauchement, zéro perte d'info.
   (Le mobile les masquait déjà pour la même raison.) */
.t1-left .pf-facing-label{display:none!important;}
.t1-left .table-action-line{display:none!important;}

/* ═══ ZONE D'ACTIONS DESKTOP — COMPACTION (§3.2) ═══
   Objectif : rendre de la hauteur verticale sous le stack du Hero, sans toucher
   à la largeur des boutons ni à la hiérarchie visuelle. Hauteur des boutons
   ~-14% (72→62), polices et paddings verticaux légèrement réduits, ligne des
   multiplicateurs resserrée. Desktop uniquement (.t1-actions-under est masqué
   sur mobile, qui garde son propre bandeau déjà compacté). */
/* ═══ DIMENSIONS FIXES DE LA TABLE 1T (§9) ═══
   La zone d'actions desktop fait ~204px en phase « hero » (boutons visibles) mais
   se vide en phase « done » (le résultat vit dans le panneau droit) → sans réserve,
   .t1-table-area (flex:1) reprend l'espace et le feutre BONDIT de ~150px à chaque
   main. On réserve la hauteur → le feutre garde EXACTEMENT la même taille et
   position quels que soient le spot, la street, la phase (§9). Contenu aligné en
   haut : les boutons restent collés sous la table, l'espace libre en phase done
   reste sous eux. (.t1-actions-under est masqué sur mobile → sans effet.) */
.t1-actions-under{min-height:206px!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important;}
.t1-actions-under .mtr-actions{padding:6px 10px 7px!important;}
.t1-actions-under .mtr-actions>div{margin-bottom:5px!important;}
.t1-actions-under .gto-btn{min-height:62px!important;}
.t1-actions-under .gto-btn .gto-btn-inner{padding:8px 8px 6px!important;}
.t1-actions-under .gto-btn-label{font-size:14px!important;}
.t1-actions-under .gto-btn-sizing{font-size:9.5px!important;}
.t1-actions-under .gto-btn-hint{font-size:7.5px!important;}
.t1-actions-under .sizing-btn{min-height:19px!important;}
.t1-actions-under .sizing-custom{margin-top:3px!important;}
.t1-actions-under .sizing-step-btn{height:27px!important;}

/* ═══ 7-MAX — CARTES HERO -5% (§2) ═══
   Scopé via [data-nplayers="7"] : les autres structures gardent leur taille.
   Ratio, style, arrondis, ombres conservés (seules les dimensions baissent de
   ~5% : 48x66 -> 46x63) pour dégager l'écart board -> cartes Hero (§3). */
/* ═══ 6-MAX — POT COMPACT HORIZONTAL ═══
   Le 6-max hero-centric place un siège PILE en haut-centre (x50), dans la colonne
   du pot. Mesuré : entre le bas de son bloc et les cartes du Hero il n'y a que
   ~134px, alors que pot(53) + board(79) + les écarts mini (8+12) en réclament
   152 → déficit de 18px, d'où le pot posé sur sa plaque.
   Remonter le siège ne résout pas : au-delà de ~0.87 son avatar est rogné par le
   bord, et le budget dépend de la rotation (un siège AVEC cartes est plus haut).
   Solution : compacter le pot sur UNE ligne — [jetons] POT 12bb — comme le fait
   déjà le mobile. ~53px → ~26px : les ~27px rendus couvrent le déficit sans
   toucher aux sièges ni au board. Pot toujours centré (x50) et lisible. */
/* STANDARD 1T — pot compact horizontal ([jetons] POT xx bb sur une ligne) +
   hauteur fixe, pour TOUTES les structures 1T web. Uniforme, lisible, et rend la
   hauteur nécessaire pour que le pot passe sous le siège du haut. .t1-left ne
   cible que le 1T web (le multi et le mobile ont leur propre pot). */
.t1-left[data-nplayers] .pf-pot-readout{
  flex-direction:row!important;align-items:center!important;
  gap:7px!important;white-space:nowrap!important;height:30px!important;
}
.t1-left[data-nplayers] .pf-pot-chip-stack{height:24px!important;margin-bottom:0!important;overflow:hidden!important;}
.t1-left[data-nplayers] .pf-pot-label{font-size:9px!important;}
.t1-left[data-nplayers] .pf-pot-value{font-size:17px!important;}

.t1-left[data-nplayers="7"] .card-1t-hero-bottom{width:46px!important;height:63px!important;}
.t1-left[data-nplayers="7"] .card-1t-hero-bottom .card-corner-r{font-size:17px!important;}
.t1-left[data-nplayers="7"] .card-1t-hero-bottom .card-corner-s{font-size:12px!important;}
.t1-left[data-nplayers="7"] .card-1t-hero-bottom .card-center{font-size:27px!important;}

/* ═══ DESKTOP ÉCRAN COURT (≤820px de haut : 1366×768, fenêtre réduite) — §24 ═══
   La zone de table tombe à ~395px alors que le bloc HERO (cartes+avatar+plaque)
   fait 208px FIXES, soit 53% de la hauteur → il débordait sous la table (7px) et
   touchait le bandeau d'actions. Règle du §24 : on réduit le scale AVANT de
   rogner. On rabote donc les cartes Hero et les boutons d'action sur ces
   hauteurs uniquement — le 1440×900 et au-delà restent inchangés. */
@media (min-width:769px) and (max-height:820px){
  .t1-left .card-1t-hero-bottom{width:40px!important;height:55px!important;}
  .t1-left .card-1t-hero-bottom .card-corner-r{font-size:15px!important;}
  .t1-left .card-1t-hero-bottom .card-corner-s{font-size:11px!important;}
  .t1-left .card-1t-hero-bottom .card-center{font-size:23px!important;}
  .t1-left .pf-player-seat[data-mode="1T"] .pf-avatar-premium{
    width:calc(var(--avatar-size) - 10px)!important;height:calc(var(--avatar-size) - 10px)!important;
  }
  .t1-actions-under .gto-btn{min-height:54px!important;}
  .t1-actions-under .gto-btn .gto-btn-inner{padding:6px 8px 5px!important;}
  .t1-actions-under .mtr-actions{padding:5px 10px 6px!important;}
  .t1-actions-under .mtr-actions>div{margin-bottom:4px!important;}
}
`;
