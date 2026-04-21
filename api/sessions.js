import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const getBody = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", chunk => data += chunk);
  req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch(e) { reject(e); } });
  req.on("error", reject);
});

const getUser = async (req) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data?.user || null;
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const client = supabase;

  // GET /api/sessions — list all sessions
  if (req.method === "GET") {
    const { data, error } = await client
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST /api/sessions — create session
  if (req.method === "POST") {
    const body = await getBody(req);
    const { data, error } = await client
      .from("sessions")
      .insert({ user_id: user.id, name: body.name || "Новая сессия", settings: body.settings || {} })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH /api/sessions?id=xxx — update settings
  if (req.method === "PATCH") {
    const id = req.query?.id || new URL(req.url, "http://x").searchParams.get("id");
    const body = await getBody(req);
    const { data, error } = await client
      .from("sessions")
      .update({ settings: body.settings, name: body.name })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE /api/sessions?id=xxx
  if (req.method === "DELETE") {
    const id = req.query?.id || new URL(req.url, "http://x").searchParams.get("id");
    const { error } = await client
      .from("sessions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}
