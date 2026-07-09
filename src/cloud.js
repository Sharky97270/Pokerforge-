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
function pushKey(key, value) {
  if (!client || !shouldSync(key)) return;
  clearTimeout(pushTimers[key]);
  cloudStatus.pending++;
  pushTimers[key] = setTimeout(async () => {
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
  }, 900);
}

/* ── Override non-invasif de localStorage : toutes les écritures pf_* partent au cloud ── */
let patched = false;
export function installLocalStorageSync() {
  if (patched) return; patched = true;
  try {
    origSetItem = localStorage.setItem.bind(localStorage);
    origRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function (k, v) { origSetItem(k, v); try { pushKey(k, v); } catch {} };
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
    const { data, error } = await client.from("pf_state").select("key,value").eq("device_id", syncId);
    if (error) { cloudStatus.lastError = error.message; cloudStatus.enabled = false; return { ok: false, error: error.message }; }
    (data || []).forEach((row) => {
      try {
        if (NO_SYNC.has(row.key)) return;            // clés locales (ex. pf_news_seen) : jamais restaurées
        const str = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
        rawSet(row.key, str);
      } catch {}
    });
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
export async function pfCloudBootstrap() {
  installLocalStorageSync();
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
