// PokerForge — edge function "meditation-tts"
// Narration des méditations via OpenAI TTS (gpt-4o-mini-tts). Voix "préparateur
// mental" : grave, chaleureuse, débit lent, vrais silences, ton adaptatif selon
// le type de séance, la durée et l'avancement. Clé OPENAI_API_KEY côté serveur.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 4 timbres. m_deep = voix phare : préparateur mental olympique (homme 35-45,
// grave et chaleureux, profond mais doux).
const VOICES: Record<string, { voice: string; persona: string }> = {
  m_deep: { voice: "onyx",    persona: "un homme de 35 à 45 ans au timbre grave, chaleureux et profond, une voix basse mais douce de préparateur mental de haut niveau, à mi-chemin entre un coach de performance olympique et un psychologue du sport" },
  m:      { voice: "echo",    persona: "un homme à la voix masculine posée, claire et rassurante, un coach mental calme" },
  f_soft: { voice: "shimmer", persona: "une femme à la voix très douce, chaleureuse et apaisante, une préparatrice mentale bienveillante" },
  f:      { voice: "nova",    persona: "une femme à la voix posée, claire et rassurante, une coach mentale sereine" },
};

// Ton adaptatif selon le type de séance
function catTone(cat: string): string {
  switch (cat) {
    case "presession": return "Insuffle discrètement la confiance et l'état de performance, en restant calme et bas.";
    case "tilt":       return "Reste extrêmement calme et rassurant, voix très basse. Recentre doucement sur le processus, sans jamais dramatiser ni juger.";
    case "postsession":return "Adopte un ton apaisant qui favorise le recul et le lâcher-prise, aucune autocritique.";
    case "focus":      return "Ton immersif et très posé, descriptions lentes et précises, silences nombreux.";
    case "variance":   return "Ton posé et philosophe, rassurant, qui remet le court terme à sa place sans dramatiser.";
    case "confiance":  return "Ton chaleureux et solide qui installe la sécurité intérieure.";
    case "tournois":   return "Ton calme et confiant qui prépare à l'enjeu sans crisper.";
    case "sommeil":    return "Ton de plus en plus lent, feutré, presque murmuré, pour accompagner vers le sommeil.";
    default:           return "Ton calme, stable et rassurant.";
  }
}

// Allure adaptative selon durée + avancement (voix adaptative)
function paceLine(duration: number, progress: number): string {
  const parts: string[] = [];
  if (duration <= 5) parts.push("Séance courte : garde une très légère présence pour soutenir l'attention, tout en restant lent.");
  else if (duration >= 10) parts.push("Séance longue : ralentis progressivement au fil de la séance.");
  if (progress >= 0.66) parts.push("Dernière partie de la séance : encore plus lent, plus grave, plus espacé, avec de longs silences.");
  else if (progress >= 0.33) parts.push("Milieu de séance : installe un rythme profond et régulier.");
  return parts.join(" ");
}

// Pré-traitement DOUX pour une diction naturelle : on laisse le texte fluide
// (la ponctuation porte le rythme) et on n'ajoute une vraie respiration ("…")
// qu'après les consignes de respiration. Pas de découpage phrase-par-phrase :
// forcer une pause après chaque phrase rend la voix hachée et mécanique.
function withPauses(text: string): string {
  return String(text).replace(
    /\b(inspire|inspirez|expire|expirez|respire|respirez|souffle|bloque|retiens|rel[âa]che)\b([^.?!…]*)([.?!…])/gi,
    (_m, a, b, c) => `${a}${b}${c} …`,
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const key = Deno.env.get("OPENAI_API_KEY");
  let body: any = {};
  try { body = await req.json(); } catch { /* corps vide toléré */ }

  if (body.ping) return json({ ok: true, hasKey: !!key, voices: Object.keys(VOICES) });
  if (!key) return json({ ok: false, noKey: true });

  const raw = String(body.text || "").trim().slice(0, 3800);
  if (!raw) return json({ ok: false, error: "empty" }, 400);

  const v = VOICES[body.voice] || VOICES.m_deep;
  const cat = String(body.category || "");
  const duration = Number(body.duration) || 5;
  const progress = Math.max(0, Math.min(1, Number(body.progress) || 0));
  const text = withPauses(raw);

  const instructions = [
    `Tu es un préparateur mental pour joueurs de poker. Ta voix est celle ${v.persona}.`,
    "Ta parole est profondément humaine et incarnée : imagine une vraie personne qui parle doucement, tout près, à quelqu'un qu'elle accompagne — ce n'est jamais une lecture à voix haute, c'est une parole vivante.",
    "Conserve les micro-inflexions et les respirations naturelles de la voix parlée. Intonation posée, basse et chaleureuse, jamais plate, jamais mécanique, jamais robotique, jamais publicitaire.",
    "Débit lent et tranquille, environ 100 à 110 mots par minute. Laisse de vrais silences aux moments justes — après une idée importante, et un silence plus long après chaque consigne de respiration — sans jamais hacher le propos.",
    "Aucune montée artificielle en fin de phrase, aucune euphorie, aucune exagération. Le ton inspire sécurité, maîtrise et sérénité.",
    "Tu ne juges jamais : tu accompagnes avec bienveillance, même lorsque tu évoques une erreur ou une émotion difficile.",
    catTone(cat),
    paceLine(duration, progress),
  ].filter(Boolean).join(" ");

  try {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: v.voice, input: text, instructions, response_format: "mp3" }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return json({ ok: false, error: "openai_" + r.status, detail: detail.slice(0, 240) });
    }
    const buf = await r.arrayBuffer();
    return new Response(buf, { headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" } });
  } catch (_e) {
    return json({ ok: false, error: "neterr" });
  }
});
