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
  const url = new URL(req.url, "http://x");
  const campaignId = url.searchParams.get("campaign_id");
  const id = url.searchParams.get("id");

  // GET — список персонажей кампании
  if (req.method === "GET") {
    if (!campaignId) return res.status(400).json({ error: "campaign_id required" });
    const { data, error } = await sb
      .from("characters")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

// POST — создать персонажа
  if (req.method === "POST") {
    const body = await getBody(req);
    const { data, error } = await sb
      .from("characters")
      .insert({
        campaign_id: body.campaign_id,
        user_id: body.user_id || user.id,
        name: body.name || "Новый персонаж",
        type: body.type || "pc",
        race: body.race || "",
        appearance: body.appearance || "",
        avatar_url: body.avatar_url || "",
        reference_art_urls: body.reference_art_urls || [],
        narrative: body.narrative || {},
      })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH — обновить персонажа
  if (req.method === "PATCH") {
    if (!id) return res.status(400).json({ error: "id required" });
    const body = await getBody(req);
    const { data, error } = await sb
      .from("characters")
      .update({
        name: body.name,
        type: body.type,
        race: body.race,
        appearance: body.appearance,
        avatar_url: body.avatar_url,
        reference_art_urls: body.reference_art_urls,
        narrative: body.narrative,
      })
      .eq("id", id)
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — удалить персонажа
  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await sb.from("characters").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}