// PokerForge — edge function "meditation-tts"
// Génère la narration audio des méditations via OpenAI TTS (gpt-4o-mini-tts,
// voix pilotables). La clé OpenAI reste CÔTÉ SERVEUR (secret OPENAI_API_KEY).
// Le frontend n'envoie que le texte + un identifiant de voix + une allure.
// Repli propre : { ok:false, noKey } si pas de clé → l'UI bascule sur la voix
// du navigateur, jamais de crash.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 4 timbres demandés : femme douce / femme / homme / homme grave
const VOICES: Record<string, { voice: string; tone: string }> = {
  f_soft: { voice: "shimmer", tone: "voix féminine très douce, chaleureuse et apaisante" },
  f:      { voice: "nova",    tone: "voix féminine posée, claire et bienveillante" },
  m:      { voice: "echo",    tone: "voix masculine posée, rassurante et claire" },
  m_deep: { voice: "onyx",    tone: "voix masculine grave, profonde et hypnotique" },
};

function paceWord(speed: number) {
  if (speed <= 0.8) return "un rythme très lent et espacé, avec de longues pauses";
  if (speed >= 1.05) return "un rythme posé mais fluide";
  return "un rythme lent et posé, avec des pauses naturelles";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const key = Deno.env.get("OPENAI_API_KEY");
  let body: any = {};
  try { body = await req.json(); } catch { /* corps vide toléré */ }

  // Vérification de disponibilité (gratuite, n'appelle pas OpenAI)
  if (body.ping) return json({ ok: true, hasKey: !!key, voices: Object.keys(VOICES) });

  if (!key) return json({ ok: false, noKey: true });

  const text = String(body.text || "").trim().slice(0, 3800);
  if (!text) return json({ ok: false, error: "empty" }, 400);

  const v = VOICES[body.voice] || VOICES.f;
  const speed = Math.max(0.6, Math.min(1.2, Number(body.speed) || 0.95));
  const instructions = `Tu es un guide de méditation de préparation mentale pour joueurs de poker. Parle d'une ${v.tone}. Adopte ${paceWord(speed)}. Ton apaisant, aucune emphase commerciale.`;

  try {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: v.voice,
        input: text,
        instructions,
        response_format: "mp3",
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return json({ ok: false, error: "openai_" + r.status, detail: detail.slice(0, 240) });
    }
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch (_e) {
    return json({ ok: false, error: "neterr" });
  }
});
