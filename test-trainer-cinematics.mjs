/* ═══════════════════════════════════════════════════════════════════════════
   PokerForge — NON-RÉGRESSION DE LA CINÉMATIQUE DES MISES (§12/§13/§27/§28).

   Ces tests portent sur des fonctions PURES : la règle « le pot n'avance pas
   devant les jetons » doit être vérifiable sans navigateur, sinon elle n'est
   vérifiée que quand quelqu'un pense à regarder.

   Chaque bloc rejoue un défaut réellement constaté — mesures citées en
   commentaire, relevées par scripts/trainer-cine-audit.mjs avant correction.
   ═══════════════════════════════════════════════════════════════════════════ */
import {
  CINE, CINE_SPEED, cineDuration, collectTotalMs, collectContributions,
  buildCollectSequence, projectDisplayedPot, visibleStreetBets,
  streetRankFromBoard, streetRankOf,
} from "./src/trainerBetCinematics.js";
import { trainerActionVisualFamily as actionVisualType, trainerIsAllInAction } from "./src/trainerActionEvent.js";

let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const eq = (a, b, m) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${m} — ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

/* ══ 1 — LES TIMINGS SONT DANS LES FOURCHETTES DU §13 ══════════════════════
   Elles vivaient en dur dans six setTimeout de TrainerTab (380, 450, 550, 600,
   780 ms), dont aucun ne correspondait à une intention écrite. */
ok(CINE.betAppear >= 120 && CINE.betAppear <= 180, `apparition de la mise dans 120-180ms — ${CINE.betAppear}`);
ok(CINE.chipTravel >= 180 && CINE.chipTravel <= 250, `trajet des jetons dans 180-250ms — ${CINE.chipTravel}`);
ok(CINE.potCollect >= 200 && CINE.potCollect <= 300, `collecte vers le pot dans 200-300ms — ${CINE.potCollect}`);
/* « PokerForge doit rester dynamique » : une séquence complète ne doit pas
   devenir une attente, surtout en mosaïque où elle se répète par table. */
ok(CINE.betAppear + CINE.chipTravel + CINE.potCollect <= 650,
  `séquence complète courte — ${CINE.betAppear + CINE.chipTravel + CINE.potCollect}ms`);
for (const t of [1, 2, 3, 4]) {
  ok(collectTotalMs(t) <= collectTotalMs(1), `${t}T : collecte pas plus lente qu'en 1T — ${collectTotalMs(t)}ms`);
  ok(collectTotalMs(t) >= 250, `${t}T : collecte encore PERCEPTIBLE — ${collectTotalMs(t)}ms`);
  ok(CINE_SPEED[t] > 0 && CINE_SPEED[t] <= 1, `${t}T : facteur de vitesse dans (0,1] — ${CINE_SPEED[t]}`);
}
ok(cineDuration("chipTravel", 4) < cineDuration("chipTravel", 1), "la mosaïque enchaîne plus vite qu'en 1T");

/* ══ 2 — UN TAS PAR JOUEUR, JAMAIS UN TAS VIDE ════════════════════════════ */
eq(collectContributions({ SB: 0.5, BB: 1, HJ: 2.5, CO: 0, BTN: undefined }),
  [{ pos: "HJ", amount: 2.5 }, { pos: "BB", amount: 1 }, { pos: "SB", amount: 0.5 }],
  "contributions triées, sans les sièges à zéro");
eq(collectContributions({}), [], "aucune contribution → aucune collecte");

/* ══ 3 — LE POT N'AVANCE PAS DEVANT LES JETONS (§12) ══════════════════════
   Le défaut : `setPotWithDelta` écrivait la valeur finale de façon synchrone,
   puis animait un « +X » par-dessus. L'ordre attendu est l'inverse. */
{
  const seq = buildCollectSequence({ streetCommitted: { SB: 0.5, BB: 1, HJ: 2.5 }, potBefore: 0, numTables: 1 });
  eq(seq.map(s => s.type), ["CHIPS_TO_POT", "POT_UPDATE"], "les jetons partent AVANT que le pot bouge");
  const chips = seq[0], pot = seq[1];
  ok(pot.at >= chips.at + cineDuration("chipTravel", 1),
    `le pot attend l'arrivée des jetons — pot à ${pot.at}ms, trajet ${cineDuration("chipTravel", 1)}ms`);
  eq(pot.value, 4, "le pot vaut la somme des contributions");
  eq(chips.chips.length, 3, "un jeton en vol par contributeur");
}
{
  // Le pot d'arrivée peut être IMPOSÉ par le moteur (side pots, arrondis) :
  // dans ce cas la cinématique ne recalcule rien, elle affiche ce qu'on lui dit.
  const seq = buildCollectSequence({ streetCommitted: { HJ: 40, BTN: 34.5 }, potBefore: 1.5, potAfter: 76, numTables: 4 });
  eq(seq[1].value, 76, "le pot d'arrivée du moteur prime sur la somme recalculée");
}
eq(buildCollectSequence({ streetCommitted: {}, potBefore: 12 }), [], "rien à collecter → aucune étape");

/* ══ 4 — LA PROJECTION DU POT (§26) ═══════════════════════════════════════
   Le visuel a le droit d'être en retard, jamais en avance, et jamais bloqué. */
{
  const collect = { startedAt: 1000, landsAt: 1480, potBefore: 4 };
  eq(projectDisplayedPot(12, collect, 1000), 4, "au départ de la collecte, le pot affiche encore l'ancienne valeur");
  eq(projectDisplayedPot(12, collect, 1479), 4, "juste avant l'arrivée : toujours l'ancienne");
  eq(projectDisplayedPot(12, collect, 1480), 12, "à l'arrivée : la valeur du moteur");
  eq(projectDisplayedPot(12, collect, 9999), 12, "bien après : la valeur du moteur");
}
eq(projectDisplayedPot(12, null, 0), 12, "sans collecte en cours, l'affichage suit le moteur");
eq(projectDisplayedPot(12, { startedAt: NaN, landsAt: 5 }, 0), 12, "collecte incohérente → on ne bloque pas l'affichage");
eq(projectDisplayedPot(12, { startedAt: 10, landsAt: 10, potBefore: 4 }, 10), 12, "collecte de durée nulle → pas de blocage");

/* ══ 5 — PAS DE GHOST CHIPS (§28) ═════════════════════════════════════════
   Mesuré dans le navigateur AVANT correction : après que le board a changé,
   « UTG:call10bb » et « HJ:3-bet10bb » étaient encore peints — des engagements
   de la street précédente, sur une table qui avait déjà tourné. */
eq(streetRankFromBoard(0), 0, "board vide = préflop");
eq(streetRankFromBoard(3), 1, "trois cartes = flop");
eq(streetRankFromBoard(4), 2, "quatre cartes = turn");
eq(streetRankFromBoard(5), 3, "cinq cartes = river");
eq(streetRankOf("Preflop"), 0, "libellé préflop");
eq(streetRankOf("River"), 3, "libellé river");
{
  const streetCommitted = { UTG: 10, HJ: 10 };
  eq(visibleStreetBets({ streetCommitted, committedAtRank: 0, boardCount: 0 }).length, 2,
    "préflop : les engagements du préflop sont peints");
  eq(visibleStreetBets({ streetCommitted, committedAtRank: 0, boardCount: 3 }), [],
    "le board est passé au flop : les engagements du préflop ne sont PLUS peints (le défaut mesuré)");
  eq(visibleStreetBets({ streetCommitted, committedAtRank: 1, boardCount: 3 }).length, 2,
    "flop : les engagements du flop sont peints");
  eq(visibleStreetBets({ streetCommitted, committedAtRank: 1, boardCount: 4 }), [],
    "turn distribué : les engagements du flop disparaissent");
  eq(visibleStreetBets({ streetCommitted, committedAtRank: 1, boardCount: 3, collecting: true }), [],
    "pendant la collecte, les tas au repos s'effacent — sinon on les voit en double");
}

/* ══ 6 — UN TAPIS SE DIT, IL NE SE DEVINE PAS (§14) ═══════════════════════
   Deux sources annoncent un all-in, et il faut les DEUX :
     · le TYPE d'action (Shove / Jam / Push / Reshove / All-in) ;
     · le DRAPEAU du moteur, que `normalizeTrainerActionEvent` lève aussi
       quand un simple CALL épuise le tapis — cas qu'aucun libellé ne dit.
   Mesuré à l'écran avant correction : un « Call 6bb » qui était un tapis
   recevait bien le style rouge (donc le type le savait) pendant que le
   drapeau n'atteignait pas ce chemin de rendu. N'en lire qu'une des deux
   laisse passer des tapis, et le §14 demande que le mot soit là. */
const visuelAllIn = trainerIsAllInAction;
for (const t of ["ALLIN", "JAM", "SHOVE", "PUSH", "RESHOVE"]) {
  ok(visuelAllIn(t), `${t} : reconnu comme tapis par le TYPE`);
  ok(actionVisualType(t) === "allin", `${t} : le badge rendu est celui du tapis`);
}
ok(visuelAllIn("CALL", true), "un CALL qui épuise le tapis est un tapis — c'est le drapeau du moteur qui le dit");
ok(!visuelAllIn("CALL", false), "un CALL ordinaire n'est pas un tapis");
ok(!visuelAllIn("RAISE", false), "une relance ordinaire n'est pas un tapis");
ok(visuelAllIn("RAISE", true), "une relance qui épuise le tapis en est un");
for (const t of ["FOLD", "CHECK", "BET", "OPEN", "3BET", "4BET", "5BET"]) {
  ok(!visuelAllIn(t), `${t} : pas de faux positif`);
}

if (fails.length) {
  console.error(`\n❌ ${fails.length} échec(s) sur ${n} assertions :`);
  fails.forEach(f => console.error("  · " + f));
  process.exit(1);
}
console.log(`✅ trainer-cinematics (§12/§13/§27/§28) — ${n} assertions OK`);

