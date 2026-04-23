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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const sb = getSupabase(token);
  const url = new URL(req.url, "http://x");
  const sessionId = url.searchParams.get("session_id");

  // GET — последний world state сессии
  if (req.method === "GET") {
    if (!sessionId) return res.status(400).json({ error: "session_id required" });
    const { data, error } = await sb
      .from("world_states")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
    return res.status(200).json(data || null);
  }

  // POST — сохранить снапшот world state
  if (req.method === "POST") {
    const body = await getBody(req);
    const { data, error } = await sb
      .from("world_states")
      .insert({ session_id: body.session_id, state: body.state })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Обновляем также sessions.world_state для быстрого доступа
    await sb.from("sessions").update({ world_state: body.state }).eq("id", body.session_id);

    return res.status(201).json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}