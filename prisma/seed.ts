// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PokerForge — Seed initial
// Données système : villain profiles + achievements
// Usage : npx prisma db seed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding villain profiles...");
  await seedVillainProfiles();

  console.log("Seeding achievements...");
  await seedAchievements();

  console.log("Seed complete.");
}

// ─── VILLAIN PROFILES ─────────────────────────────────────────────────────────

async function seedVillainProfiles() {
  const profiles = [
    {
      name: "Fish",
      description: "Joueur récréatif qui joue trop de mains et call trop souvent.",
      vpip: 45, pfr: 8, threeBetPct: 2, aggression: 1.2,
      foldToCbet: 30, bluffFrequency: 5, callDownFrequency: 65,
    },
    {
      name: "Calling Station",
      description: "Répond à presque tout mais bluff rarement. Aucune fold equity.",
      vpip: 50, pfr: 5, threeBetPct: 1, aggression: 0.8,
      foldToCbet: 15, bluffFrequency: 3, callDownFrequency: 80,
    },
    {
      name: "Nit",
      description: "Joue très peu de mains, seulement des premiums. Très prévisible.",
      vpip: 12, pfr: 10, threeBetPct: 3, aggression: 1.5,
      foldToCbet: 60, bluffFrequency: 10, callDownFrequency: 25,
    },
    {
      name: "TAG",
      description: "Tight Aggressive. Joueur solide, sélectif et agressif. Profil régulier standard.",
      vpip: 22, pfr: 18, threeBetPct: 7, aggression: 2.5,
      foldToCbet: 52, bluffFrequency: 28, callDownFrequency: 35,
    },
    {
      name: "LAG",
      description: "Loose Aggressive. Joue large et met la pression. Difficile à lire.",
      vpip: 35, pfr: 28, threeBetPct: 12, aggression: 3.5,
      foldToCbet: 40, bluffFrequency: 45, callDownFrequency: 40,
    },
    {
      name: "Reg",
      description: "Régulier GTO-balanced. Profil équilibré difficile à exploiter.",
      vpip: 24, pfr: 20, threeBetPct: 8, aggression: 2.8,
      foldToCbet: 48, bluffFrequency: 33, callDownFrequency: 32,
    },
    {
      name: "Aggro",
      description: "Hyper-agressif. Bet et raise dans tous les spots, bluff trop souvent.",
      vpip: 40, pfr: 32, threeBetPct: 16, aggression: 5.0,
      foldToCbet: 35, bluffFrequency: 60, callDownFrequency: 30,
    },
    {
      name: "Maniac",
      description: "Totalement non-standard. Actions aléatoires, all-in fréquents.",
      vpip: 65, pfr: 50, threeBetPct: 22, aggression: 6.0,
      foldToCbet: 20, bluffFrequency: 70, callDownFrequency: 50,
    },
  ];

  for (const p of profiles) {
    await prisma.villainProfile.upsert({
      where: { id: `00000000-0000-0000-0000-${String(profiles.indexOf(p) + 1).padStart(12, "0")}` },
      create: { ...p, isSystem: true },
      update: p,
    });
  }
}

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────

async function seedAchievements() {
  const achievements = [
    {
      key: "first_session",
      title: "Premier pas",
      description: "Complète ta première session d'entraînement.",
      icon: "🎯",
      condition: { type: "sessions_count", threshold: 1 },
      xpReward: 50,
    },
    {
      key: "sessions_10",
      title: "En route",
      description: "Complète 10 sessions.",
      icon: "🔥",
      condition: { type: "sessions_count", threshold: 10 },
      xpReward: 150,
    },
    {
      key: "sessions_50",
      title: "Régulier",
      description: "Complète 50 sessions.",
      icon: "💪",
      condition: { type: "sessions_count", threshold: 50 },
      xpReward: 500,
    },
    {
      key: "sessions_100",
      title: "Centurion",
      description: "Complète 100 sessions.",
      icon: "🏆",
      condition: { type: "sessions_count", threshold: 100 },
      xpReward: 1000,
    },
    {
      key: "perfect_session",
      title: "Perfection",
      description: "Termine une session avec 100% de précision (5 spots min).",
      icon: "⭐",
      condition: { type: "perfect_session", minSpots: 5 },
      xpReward: 200,
    },
    {
      key: "streak_3",
      title: "3 jours d'affilée",
      description: "Joue 3 jours consécutifs.",
      icon: "📅",
      condition: { type: "daily_streak", threshold: 3 },
      xpReward: 100,
    },
    {
      key: "streak_7",
      title: "Une semaine",
      description: "Joue 7 jours consécutifs.",
      icon: "📆",
      condition: { type: "daily_streak", threshold: 7 },
      xpReward: 300,
    },
    {
      key: "streak_30",
      title: "Un mois",
      description: "Joue 30 jours consécutifs.",
      icon: "🗓️",
      condition: { type: "daily_streak", threshold: 30 },
      xpReward: 1500,
    },
    {
      key: "accuracy_70",
      title: "Bonne base",
      description: "Atteins 70% de précision globale sur 20 sessions.",
      icon: "📊",
      condition: { type: "accuracy_min", threshold: 70, minSessions: 20 },
      xpReward: 200,
    },
    {
      key: "accuracy_85",
      title: "Précision chirurgicale",
      description: "Atteins 85% de précision globale sur 30 sessions.",
      icon: "🎖️",
      condition: { type: "accuracy_min", threshold: 85, minSessions: 30 },
      xpReward: 500,
    },
    {
      key: "spots_100",
      title: "100 spots",
      description: "Réponds à 100 spots au total.",
      icon: "💯",
      condition: { type: "total_spots", threshold: 100 },
      xpReward: 100,
    },
    {
      key: "spots_1000",
      title: "Millier de décisions",
      description: "Réponds à 1000 spots au total.",
      icon: "🧠",
      condition: { type: "total_spots", threshold: 1000 },
      xpReward: 1000,
    },
    {
      key: "exploit_first",
      title: "Exploiteur",
      description: "Complète une session en mode Exploit.",
      icon: "🎭",
      condition: { type: "mode_session", mode: "EXPLOIT", threshold: 1 },
      xpReward: 75,
    },
    {
      key: "leak_resolved",
      title: "Médecin de son jeu",
      description: "Résous un leak détecté.",
      icon: "💊",
      condition: { type: "leaks_resolved", threshold: 1 },
      xpReward: 250,
    },
    {
      key: "hand_import_first",
      title: "Analyste",
      description: "Importe et analyse ta première main.",
      icon: "🔬",
      condition: { type: "hands_imported", threshold: 1 },
      xpReward: 75,
    },
  ];

  for (const a of achievements) {
    await prisma.achievement.upsert({
      where: { key: a.key },
      create: a,
      update: a,
    });
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
