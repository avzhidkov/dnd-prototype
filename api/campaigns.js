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
    // Свои кампании
    const { data: owned, error } = await sb
      .from("campaigns")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    // Кампании через инвайт — сессии где пользователь принял инвайт
    const { data: joinedSessions } = await sb
      .from("session_invites")
      .select("sessions(campaign_id, campaigns(*))")
      .eq("used_by", user.id);

    const joined = (joinedSessions || [])
      .map(s => s.sessions?.campaigns)
      .filter(Boolean)
      .filter(c => c && !(owned||[]).find(o => o.id === c.id));

    return res.status(200).json([...(owned||[]), ...joined]);
  }

  if (req.method === "POST") {
    const body = await getBody(req);
    const { data, error } = await sb
      .from("campaigns")
      .insert({ user_id: user.id, name: body.name || "Новая кампания", description: body.description || "" })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === "PATCH") {
    const body = await getBody(req);
    const { data, error } = await sb
      .from("campaigns")
      .update({ name: body.name, description: body.description, settings: body.settings })
      .eq("id", id).eq("user_id", user.id)
      .select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data?.[0] || {});
  }

  if (req.method === "DELETE") {
    const { error } = await sb.from("campaigns").delete().eq("id", id).eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}
