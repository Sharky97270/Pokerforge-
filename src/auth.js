/* ══════════════════════════════════════════════════════════════
   PokerForge — Authentification (Supabase Auth)
   • Email/mot de passe + connexion par pseudo (lookup email via RPC)
   • OAuth Google / Apple (à activer dans le dashboard Supabase)
   • Sessions JWT persistantes, hash bcrypt côté serveur Supabase
   • Profil/settings/progress créés par trigger SQL à l'inscription
   ⚠ Le mot de passe n'est JAMAIS stocké ni traité en clair côté client :
     Supabase Auth gère le hash et la validation côté serveur.
════════════════════════════════════════════════════════════════ */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config/supabase.js";

/* Client dédié à l'auth (session persistée — distinct du client de sync device-id). */
export const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "pf_auth" },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s) => EMAIL_RE.test(String(s || "").trim());

/* Messages d'erreur Supabase → FR lisible */
function frError(e) {
  const m = String((e && e.message) || e || "").toLowerCase();
  if (!m) return null;
  if (m.includes("invalid login")) return "Email/pseudo ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Email non confirmé — vérifie ta boîte mail.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Cet email est déjà utilisé.";
  if (m.includes("duplicate") && m.includes("username")) return "Ce pseudo est déjà pris.";
  if (m.includes("password should be at least")) return "Mot de passe trop court (8 caractères min).";
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives — réessaie dans un instant.";
  if (m.includes("provider is not enabled")) return "Connexion sociale pas encore activée (config en attente).";
  if (m.includes("user not found")) return "Aucun compte trouvé.";
  return (e && e.message) || "Une erreur est survenue.";
}

/* Disponibilité du pseudo (RPC SECURITY DEFINER) */
export async function usernameAvailable(name) {
  try {
    const { data, error } = await authClient.rpc("username_available", { name: String(name || "").trim() });
    if (error) return true; // en cas d'échec RPC, on laisse l'unicité DB trancher au signup
    return !!data;
  } catch { return true; }
}

/* Inscription email + pseudo + mot de passe */
export async function signUp({ email, username, password, legalVersion = null, legalAcceptedAt = null }) {
  email = String(email || "").trim();
  username = String(username || "").trim();
  if (!isEmail(email)) return { ok: false, error: "Format d'email invalide." };
  if (username.length < 3) return { ok: false, error: "Pseudo trop court (3 caractères min)." };
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return { ok: false, error: "Pseudo : lettres, chiffres, . _ - uniquement." };
  if (String(password || "").length < 8) return { ok: false, error: "Mot de passe : 8 caractères minimum." };
  if (!(await usernameAvailable(username))) return { ok: false, error: "Ce pseudo est déjà pris." };
  try {
    const { data, error } = await authClient.auth.signUp({
      email, password,
      options: {
        data: {
          username,
          legal_version: legalVersion,
          legal_accepted_at: legalAcceptedAt,
        },
        emailRedirectTo: redirectUrl(),
      },
    });
    if (error) return { ok: false, error: frError(error) };
    // session non nulle = connexion immédiate ; sinon confirmation email requise
    return { ok: true, needConfirm: !data.session, user: data.user, session: data.session };
  } catch (e) { return { ok: false, error: frError(e) }; }
}

/* Connexion par email OU pseudo + mot de passe */
export async function signIn({ identifier, password }) {
  identifier = String(identifier || "").trim();
  if (!identifier) return { ok: false, error: "Renseigne ton email ou pseudo." };
  if (!password) return { ok: false, error: "Renseigne ton mot de passe." };
  let email = identifier;
  if (!isEmail(identifier)) {
    // connexion par pseudo → on récupère l'email associé
    try {
      const { data, error } = await authClient.rpc("email_for_username", { name: identifier });
      if (error || !data) return { ok: false, error: "Aucun compte pour ce pseudo." };
      email = data;
    } catch { return { ok: false, error: "Aucun compte pour ce pseudo." }; }
  }
  try {
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: frError(error) };
    touchLastLogin(data.user?.id);
    return { ok: true, user: data.user, session: data.session };
  } catch (e) { return { ok: false, error: frError(e) }; }
}

/* Connexion sociale — Google / Apple.
   ⚠ TODO : activer les providers dans Supabase Dashboard → Authentication → Providers,
   avec GOOGLE_CLIENT_ID/SECRET et APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY.
   Tant que non activés, Supabase renvoie « provider is not enabled » (message géré). */
export async function signInOAuth(provider) {
  try {
    const { error } = await authClient.auth.signInWithOAuth({
      provider, options: { redirectTo: redirectUrl() },
    });
    if (error) return { ok: false, error: frError(error) };
    return { ok: true }; // redirection en cours
  } catch (e) { return { ok: false, error: frError(e) }; }
}

export async function resetPassword(email) {
  email = String(email || "").trim();
  if (!isEmail(email)) return { ok: false, error: "Saisis un email valide." };
  try {
    const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (error) return { ok: false, error: frError(error) };
    return { ok: true };
  } catch (e) { return { ok: false, error: frError(e) }; }
}

export async function signOut() {
  try { await authClient.auth.signOut(); } catch {}
  return { ok: true };
}

export async function getSession() {
  try { const { data } = await authClient.auth.getSession(); return data.session || null; } catch { return null; }
}

/* S'abonner aux changements de session (login/logout/refresh) */
export function onAuthChange(cb) {
  const { data } = authClient.auth.onAuthStateChange((_event, session) => cb(session || null));
  return () => { try { data.subscription.unsubscribe(); } catch {} };
}

/* Profil (pseudo, xp, level, rank…) */
export async function fetchProfile(userId) {
  if (!userId) return null;
  try {
    const { data } = await authClient.from("profiles").select("*").eq("id", userId).maybeSingle();
    return data || null;
  } catch { return null; }
}
export async function updateProfile(userId, patch) {
  if (!userId) return { ok: false };
  try {
    const { error } = await authClient.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", userId);
    return { ok: !error, error: error && frError(error) };
  } catch (e) { return { ok: false, error: frError(e) }; }
}
async function touchLastLogin(userId) {
  if (!userId) return;
  try { await authClient.from("profiles").update({ last_login: new Date().toISOString() }).eq("id", userId); } catch {}
}

function redirectUrl() {
  try { return window.location.origin + window.location.pathname; } catch { return undefined; }
}

/* ════════════════ ADMIN ════════════════ */
export const ADMIN_EMAIL = "pokerforge31@gmail.com";
export const isAdminEmail = (e) => String(e || "").trim().toLowerCase() === ADMIN_EMAIL;

/* Définit le mot de passe admin (1ʳᵉ connexion) puis marque l'init faite côté serveur.
   updateUser gère le hash bcrypt côté Supabase ; aucun mot de passe en clair stocké/loggé. */
export async function setAdminPassword(newPassword) {
  if (String(newPassword || "").length < 8) return { ok: false, error: "Mot de passe : 8 caractères minimum." };
  try {
    const { error } = await authClient.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: frError(error) };
    const { error: e2 } = await authClient.rpc("admin_init_password_done");
    if (e2) return { ok: false, error: frError(e2) };
    return { ok: true };
  } catch (e) { return { ok: false, error: frError(e) }; }
}

/* requireAdmin côté serveur : ces RPC lèvent 42501 (forbidden) si l'appelant n'est pas admin. */
export async function adminListUsers() {
  try {
    const { data, error } = await authClient.rpc("admin_list_users");
    if (error) return { ok: false, error: frError(error), forbidden: /forbidden|42501/i.test(error.message || ""), users: [] };
    return { ok: true, users: data || [] };
  } catch (e) { return { ok: false, error: frError(e), users: [] }; }
}
export async function adminStats() {
  try {
    const { data, error } = await authClient.rpc("admin_stats");
    if (error) return { ok: false, error: frError(error), forbidden: /forbidden|42501/i.test(error.message || ""), stats: null };
    return { ok: true, stats: data || null };
  } catch (e) { return { ok: false, error: frError(e), stats: null }; }
}

/* ── Progression liée au compte (cross-device par identité) ──
   Le blob `stats` = pf_stats2 complet ; les colonnes résumé servent au leaderboard. */
function deriveRank(level) { return level >= 10 ? "Diamond" : level >= 7 ? "Gold" : level >= 4 ? "Silver" : "Bronze"; }
function summarizeStats(stats) {
  const cats = Object.values(stats && stats.catAcc || {});
  const total = cats.reduce((a, c) => a + (c.total || 0), 0) || (stats && stats.totalSpots) || 0;
  const correct = cats.reduce((a, c) => a + (c.ok || 0), 0);
  return {
    total_spots: (stats && stats.totalSpots) || total || 0,
    correct_spots: correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    leaks: (stats && stats.leaks) || [],
    streak: (stats && stats.streak) || 0,
  };
}
/* Pousse la progression locale vers le compte (debounce côté appelant). */
export async function pushProgress(userId, stats) {
  if (!userId || !stats) return { ok: false };
  try {
    const sum = summarizeStats(stats);
    await authClient.from("user_progress").upsert(
      { user_id: userId, stats, ...sum, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    await authClient.from("profiles").update(
      { xp: stats.xp || 0, level: stats.level || 1, rank: deriveRank(stats.level || 1), updated_at: new Date().toISOString() }
    ).eq("id", userId);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
/* À la connexion : fusionne la progression du compte avec la locale (jamais de régression),
   renvoie le blob fusionné à écrire dans pf_stats2 localement. */
export async function syncProgressOnLogin(userId, localStats) {
  localStats = localStats || {};
  let cloudStats = null;
  try {
    const { data } = await authClient.from("user_progress").select("stats").eq("user_id", userId).maybeSingle();
    cloudStats = data && data.stats && Object.keys(data.stats).length ? data.stats : null;
  } catch {}
  const lxp = localStats.xp || 0, cxp = (cloudStats && cloudStats.xp) || 0;
  // base = le profil le plus avancé (xp) ; on adopte son blob détaillé
  let merged = (cloudStats && cxp > lxp) ? { ...cloudStats } : { ...localStats };
  // garde-fous anti-régression sur les numériques clés
  merged.xp = Math.max(lxp, cxp, merged.xp || 0);
  merged.level = Math.max(localStats.level || 1, (cloudStats && cloudStats.level) || 1, merged.level || 1);
  merged.streak = Math.max(localStats.streak || 0, (cloudStats && cloudStats.streak) || 0, merged.streak || 0);
  merged.streakRecord = Math.max(localStats.streakRecord || 0, (cloudStats && cloudStats.streakRecord) || 0, merged.streakRecord || 0);
  merged.totalSpots = Math.max(localStats.totalSpots || 0, (cloudStats && cloudStats.totalSpots) || 0, merged.totalSpots || 0);
  await pushProgress(userId, merged);
  return merged;
}
