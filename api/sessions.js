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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const sb = getSupabase(token);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const url = new URL(req.url, "http://x");
  const id = url.searchParams.get("id");

if (req.method === "GET") {
    const campaignId = url.searchParams.get("campaign_id");
    let query = sb.from("sessions").select(`
      *,
      events:events(count),
      images:events(count),
      transcripts:transcripts(count)
    `).eq("user_id", user.id).order("created_at", { ascending: false });
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Получаем последнее событие для каждой сессии
    if (Array.isArray(data) && data.length > 0) {
      const sessionIds = data.map(s => s.id);
      const { data: lastEvents } = await sb
        .from("events")
        .select("session_id, description, created_at")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });

      const lastEventMap = {};
      (lastEvents || []).forEach(e => {
        if (!lastEventMap[e.session_id]) lastEventMap[e.session_id] = e;
      });

      data.forEach(s => {
        s.event_count = s.events?.[0]?.count || 0;
        s.image_count = (lastEvents || []).filter(e => e.session_id === s.id).length;
        s.last_event = lastEventMap[s.id]?.description || null;
        delete s.events; delete s.images; delete s.transcripts;
      });
    }

    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const body = await getBody(req);
    const { data, error } = await sb
      .from("sessions")
      .insert({ user_id: user.id, name: body.name || "Новая сессия", settings: body.settings || {}, campaign_id: body.campaign_id || null })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === "PATCH") {
    const body = await getBody(req);
    const { data, error } = await sb
      .from("sessions")
      .update({ settings: body.settings, name: body.name })
      .eq("id", id).eq("user_id", user.id)
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const { error } = await sb.from("sessions").delete().eq("id", id).eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}