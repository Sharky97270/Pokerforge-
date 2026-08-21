/* ══════════════════════════════════════════════════════════════
   PokerForge — Couche de synchronisation cloud (Supabase)
   Sauvegarde automatique de toutes les rubriques sans login :
   chaque appareil possède un « Sync ID » (token de capacité) ;
   coller le même Sync ID sur un autre appareil partage les données.
   L'accès est scopé côté serveur par RLS via le header x-device-id.
════════════════════════════════════════════════════════════════ */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config/supabase.js";

// Rubriques synchronisées : toutes les clés pf_* SAUF les secrets / l'ID lui-même.
const NO_SYNC = new Set(["pf_device_id", "pf_ak", "pf_apikey", "pf_news_seen"]);
const shouldSync = (k) => typeof k === "string" && k.startsWith("pf_") && !NO_SYNC.has(k);

export const cloudStatus = { enabled: false, lastError: null, lastSync: null, pending: 0, syncId: null };

function genId() {
  try { if (window.crypto && crypto.randomUUID) return "pf-" + crypto.randomUUID(); } catch {}
  return "pf-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
let origSetItem = null, origRemoveItem = null;
function rawSet(k, v) { (origSetItem || localStorage.setItem.bind(localStorage))(k, v); }
function rawGet(k) { try { return localStorage.getItem(k); } catch { return null; } }

/* ══════════════════════════════════════════════════════════════════════════
   HORODATAGE DES ÉCRITURES LOCALES — pourquoi c'est nécessaire

   Défaut observé le 2026-08-21 : changer un réglage du Trainer puis recharger
   la page dans la seconde qui suit ANNULE le changement. Ce n'est pas propre à
   un réglage — c'est structurel :
     · une écriture locale n'est poussée au cloud qu'après 900 ms (debounce) ;
     · au démarrage, `pfCloudBootstrap` fait un pull AVANT le rendu React et
       réécrit chaque clé avec la valeur du cloud, sans regarder si la valeur
       locale est plus récente.
   Recharger pendant la fenêtre de debounce restaurait donc l'AVANT-DERNIÈRE
   valeur. Le symptôme se lit comme « le réglage n'est pas mémorisé ».

   Correction : on note l'instant de chaque écriture locale, et le pull
   n'écrase une clé que si la version du cloud est RÉELLEMENT plus récente.
   Une donnée qu'on vient de saisir ne peut plus être effacée par une copie
   distante plus ancienne.
   ══════════════════════════════════════════════════════════════════════════ */
const LOCAL_TS_KEY = "pf_local_write_ts";
function readLocalTs() {
  try { return JSON.parse(rawGet(LOCAL_TS_KEY) || "{}") || {}; } catch { return {}; }
}
function markLocalWrite(key) {
  if (!shouldSync(key)) return;
  try {
    const m = readLocalTs();
    m[key] = Date.now();
    /* Borne le journal : on ne garde que les 200 clés les plus récentes, sinon
       il grossirait indéfiniment sur un appareil très utilisé. */
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 200);
    rawSet(LOCAL_TS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}
/* Le journal lui-même n'est pas synchronisé : il décrit CET appareil. */
NO_SYNC.add(LOCAL_TS_KEY);

export function getSyncId() {
  let id = rawGet("pf_device_id");
  if (!id) { id = genId(); try { rawSet("pf_device_id", id); } catch {} }
  cloudStatus.syncId = id;
  return id;
}

let syncId = getSyncId();
let client = null;
function makeClient(id) {
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-device-id": id } },
    });
  } catch (e) { cloudStatus.lastError = String(e && e.message || e); return null; }
}
client = makeClient(syncId);

/* ── Push debouncé d'une clé vers le cloud ── */
const pushTimers = {};
const pushPending = {};   // key → fonction d'envoi, pour pouvoir la déclencher tout de suite

/* Déclenche immédiatement tous les envois encore en attente. Appelé quand la
   page se cache : sinon les 900 ms de debounce sont simplement perdues et le
   cloud conserve une version antérieure à ce que l'utilisateur vient de régler. */
export function flushPendingPushes() {
  for (const key of Object.keys(pushPending)) {
    const envoyer = pushPending[key];
    if (!envoyer) continue;
    clearTimeout(pushTimers[key]);
    delete pushTimers[key];
    delete pushPending[key];
    try { envoyer(); } catch {}
  }
}

function pushKey(key, value) {
  if (!client || !shouldSync(key)) return;
  clearTimeout(pushTimers[key]);
  if (pushPending[key]) { delete pushPending[key]; cloudStatus.pending = Math.max(0, cloudStatus.pending - 1); }
  cloudStatus.pending++;
  const envoyer = async () => {
    try {
      let parsed; try { parsed = JSON.parse(value); } catch { parsed = value; }
      const { error } = await client.from("pf_state").upsert(
        { device_id: syncId, key, value: parsed, updated_at: new Date().toISOString() },
        { onConflict: "device_id,key" }
      );
      if (error) { cloudStatus.lastError = error.message; cloudStatus.enabled = false; }
      else { cloudStatus.enabled = true; cloudStatus.lastError = null; cloudStatus.lastSync = Date.now(); }
    } catch (e) { cloudStatus.lastError = String(e && e.message || e); }
    cloudStatus.pending = Math.max(0, cloudStatus.pending - 1);
  };
  pushPending[key] = envoyer;
  pushTimers[key] = setTimeout(() => {
    delete pushTimers[key];
    delete pushPending[key];
    envoyer();
  }, 900);
}

/* ── Override non-invasif de localStorage : toutes les écritures pf_* partent au cloud ── */
let patched = false;
export function installLocalStorageSync() {
  if (patched) return; patched = true;
  try {
    origSetItem = localStorage.setItem.bind(localStorage);
    origRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function (k, v) { origSetItem(k, v); try { markLocalWrite(k); } catch {} try { pushKey(k, v); } catch {} };
    localStorage.removeItem = function (k) {
      origRemoveItem(k);
      if (client && shouldSync(k)) { try { client.from("pf_state").delete().eq("device_id", syncId).eq("key", k).then(() => {}, () => {}); } catch {} }
    };
  } catch (e) { cloudStatus.lastError = String(e && e.message || e); }
}

/* ── Pull : cloud → localStorage (sans re-déclencher de push) ── */
export async function pfCloudPull() {
  if (!client) return { ok: false, error: "no client" };
  try {
    const { data, error } = await client.from("pf_state").select("key,value,updated_at").eq("device_id", syncId);
    if (error) { cloudStatus.lastError = error.message; cloudStatus.enabled = false; return { ok: false, error: error.message }; }
    const localTs = readLocalTs();
    let ignores = 0;
    (data || []).forEach((row) => {
      try {
        if (NO_SYNC.has(row.key)) return;            // clés locales (ex. pf_news_seen) : jamais restaurées
        /* Ne JAMAIS écraser une valeur locale plus récente que la copie
           distante. C'est ce qui faisait « oublier » un réglage modifié juste
           avant un rechargement : la valeur venait d'être saisie mais n'avait
           pas encore franchi le debounce de 900 ms du push.

           COMPARAISON STRICTE, SANS MARGE — et c'est important :
           `updated_at` est posé au moment du PUSH, donc ~900 ms APRÈS l'écriture
           locale correspondante. Pour une valeur déjà partie, on a toujours
           distant > local : le cloud gagne, et il porte le même contenu — sans
           effet. Pour une valeur encore en attente, le cloud ne contient que la
           version PRÉCÉDENTE, plus ancienne que l'écriture : le local gagne.
           Une marge ajoutée ici rouvrirait la fenêtre qu'on ferme (mesuré : avec
           2 s de marge, un réglage changé moins de 2 s après le précédent était
           encore écrasé). */
        const distant = row.updated_at ? Date.parse(row.updated_at) : 0;
        const local = localTs[row.key] || 0;
        if (local && Number.isFinite(distant) && local > distant) { ignores++; return; }
        const str = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
        rawSet(row.key, str);
      } catch {}
    });
    cloudStatus.lastPullSkipped = ignores;
    cloudStatus.enabled = true; cloudStatus.lastError = null; cloudStatus.lastSync = Date.now();
    return { ok: true, count: (data || []).length };
  } catch (e) { cloudStatus.lastError = String(e && e.message || e); return { ok: false, error: String(e) }; }
}

/* ── Push complet : tout le localStorage pf_* → cloud ── */
export async function pfCloudPushAll() {
  if (!client) return { ok: false, error: "no client" };
  const rows = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!shouldSync(k)) continue;
      let val; try { val = JSON.parse(localStorage.getItem(k)); } catch { val = localStorage.getItem(k); }
      rows.push({ device_id: syncId, key: k, value: val, updated_at: new Date().toISOString() });
    }
  } catch (e) { return { ok: false, error: String(e) }; }
  if (!rows.length) return { ok: true, count: 0 };
  const { error } = await client.from("pf_state").upsert(rows, { onConflict: "device_id,key" });
  if (error) { cloudStatus.lastError = error.message; cloudStatus.enabled = false; return { ok: false, error: error.message }; }
  cloudStatus.enabled = true; cloudStatus.lastError = null; cloudStatus.lastSync = Date.now();
  return { ok: true, count: rows.length };
}

/* ── Changer de Sync ID (pour synchroniser un autre appareil) ── */
export async function setSyncId(newId) {
  newId = (newId || "").trim();
  if (!newId) return { ok: false, error: "vide" };
  syncId = newId;
  cloudStatus.syncId = newId;
  try { rawSet("pf_device_id", newId); } catch {}
  client = makeClient(newId);
  return await pfCloudPull();
}

/* ── Bootstrap au démarrage (avant le rendu React) — non bloquant > 5s ── */
/* Le garde-fou d'horodatage empêche de PERDRE une valeur locale, mais laisse le
   cloud périmé jusqu'au prochain push. On force donc l'envoi des écritures en
   attente quand la page part : c'est le moment exact où le debounce de 900 ms
   allait être perdu. `pagehide` est le seul événement fiable au mobile —
   `beforeunload` n'y est pas garanti. */
function installFlushOnHide() {
  if (typeof window === "undefined") return;
  const flush = () => { try { flushPendingPushes(); } catch {} };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}

export async function pfCloudBootstrap() {
  installLocalStorageSync();
  installFlushOnHide();
  try {
    await Promise.race([pfCloudPull(), new Promise((r) => setTimeout(r, 5000))]);
  } catch {}
}

export function getCloudStatus() { return { ...cloudStatus }; }

/* ── Actualité poker en direct (table publique poker_news, alimentée par l'edge function) ── */
export async function pfFetchNews(limit = 40) {
  if (!client) return { ok: false, items: [] };
  try {
    const { data, error } = await client
      .from("poker_news")
      .select("id,source,source_color,title,summary,url,image,lang,category,published_at,fetched_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) return { ok: false, error: error.message, items: [] };
    return { ok: true, items: data || [] };
  } catch (e) { return { ok: false, error: String(e && e.message || e), items: [] }; }
}
