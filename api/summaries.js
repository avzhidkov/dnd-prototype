import { createClient } from "@supabase/supabase-js";

const getSupabase = (token) => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { global: { headers: { Authorization: `Bearer ${token}` } } }
);

const getBody = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", chunk => data += chunk);
  req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch(e) { reject(e); } });
  req.on("error", reject);
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-openai-key");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const sb = getSupabase(token);
  const url = new URL(req.url, "http://x");
  const sessionId = url.searchParams.get("session_id");
  const campaignId = url.searchParams.get("campaign_id");

  // GET — получить резюме сессии или всей кампании
  if (req.method === "GET") {
    if (campaignId) {
      // Все резюме кампании в хронологическом порядке
      const { data, error } = await sb
        .from("session_summaries")
        .select("*, sessions(name, created_at)")
        .in("session_id", sb.from("sessions").select("id").eq("campaign_id", campaignId))
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data || []);
    }
    if (sessionId) {
      const { data, error } = await sb
        .from("session_summaries")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data?.[0] || null);
    }
    return res.status(400).json({ error: "session_id or campaign_id required" });
  }

  // POST — сгенерировать резюме через GPT и сохранить
  if (req.method === "POST") {
    const body = await getBody(req);
    const openaiKey = req.headers["x-openai-key"];
    if (!openaiKey) return res.status(400).json({ error: "No OpenAI key" });
    if (!body.session_id) return res.status(400).json({ error: "session_id required" });

    // Загружаем события сессии
    const { data: events, error: evErr } = await sb
      .from("events")
      .select("type, description, location, characters, created_at")
      .eq("session_id", body.session_id)
      .order("created_at", { ascending: true });

    if (evErr) return res.status(500).json({ error: evErr.message });
    if (!events || events.length === 0) {
      return res.status(400).json({ error: "No events to summarize" });
    }

    // Загружаем имя сессии
    const { data: session } = await sb
      .from("sessions")
      .select("name, world_state")
      .eq("id", body.session_id)
      .single();

    const eventsText = events.map(e =>
      `[${e.type}] ${e.description}${e.location ? ` (${e.location})` : ""}${(e.characters||[]).length ? ` — ${e.characters.join(", ")}` : ""}`
    ).join("\n");

    const prompt = `You are a D&D campaign chronicler. Write a narrative summary of this game session.

Session: ${session?.name || "Session"}
Events that occurred:
${eventsText}

Write a vivid, engaging summary in the same language as the events above. 
- 3-5 paragraphs
- Third person narrative ("The party...", "Sigurd...")  
- Mention key moments, locations, characters
- End with the current situation/cliffhanger
- Style: epic fantasy chronicle`;

    try {
      const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 1000,
          messages: [{ role:"user", content: prompt }],
        }),
      });
      const gptData = await gptRes.json();
      if (!gptRes.ok) return res.status(500).json({ error: gptData.error?.message });

      const summary = gptData.choices?.[0]?.message?.content?.trim();
      if (!summary) return res.status(500).json({ error: "No summary generated" });

      // Сохраняем
      const { data: saved, error: saveErr } = await sb
        .from("session_summaries")
        .insert({ session_id: body.session_id, summary })
        .select().single();

      if (saveErr) return res.status(500).json({ error: saveErr.message });
      return res.status(201).json(saved);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
