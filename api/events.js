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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const sb = getSupabase(token);
  const url = new URL(req.url, "http://x");
  const sessionId = url.searchParams.get("session_id");

  if (req.method === "GET") {
    if (!sessionId) return res.status(400).json({ error: "session_id required" });
    const { data, error } = await sb
      .from("events")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const body = await getBody(req);
    const { session_id, type, description, characters, image_prompt, image_b64 } = body;
    if (!session_id) return res.status(400).json({ error: "session_id required" });

    let image_url = null;

    if (image_b64) {
      const buffer = Buffer.from(image_b64, "base64");
      const filename = `${session_id}/${Date.now()}.png`;
      const { error: uploadError } = await sb.storage
        .from("images")
        .upload(filename, buffer, { contentType: "image/png", upsert: false });

      if (!uploadError) {
        const { data: urlData } = sb.storage.from("images").getPublicUrl(filename);
        image_url = urlData?.publicUrl || null;
      }
    }

    const { data, error } = await sb
      .from("events")
      .insert({ session_id, type, description, characters, image_prompt, image_url })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ...data, image_url });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    const { error } = await sb.from("events").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}