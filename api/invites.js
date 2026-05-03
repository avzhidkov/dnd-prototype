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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const url = new URL(req.url, "http://x");
  const code = url.searchParams.get("code");

  // GET — получить инфо по коду (публичный)
  if (req.method === "GET" && code) {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data: invite, error } = await sb
      .from("session_invites")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !invite) return res.status(404).json({ error: "Инвайт не найден" });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: "Инвайт истёк" });
    }

    const { data: session } = await sb
      .from("sessions")
      .select("name, campaign_id, campaigns(name)")
      .eq("id", invite.session_id)
      .single();

    invite.sessions = session;
    return res.status(200).json(invite);
  }

  // POST — создать инвайт
  if (req.method === "POST") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const sb = getSupabase(token);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const body = await getBody(req);
    const newCode = Math.random().toString(36).substring(2, 14);

    const { data, error } = await sb
      .from("session_invites")
      .insert({
        session_id: body.session_id,
        code: newCode,
        role: body.role || "player",
        expires_at: body.expires_at || null,
      })
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PATCH — отметить инвайт использованным
  if (req.method === "PATCH") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    if (!code) return res.status(400).json({ error: "code required" });

    const sb = getSupabase(token);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const body = await getBody(req);

    // Сначала читаем текущее значение uses
    const { data: current } = await sb
      .from("session_invites")
      .select("uses")
      .eq("code", code)
      .single();

    const { data, error } = await sb
      .from("session_invites")
      .update({
        used_by: body.used_by || user.id,
        uses: (current?.uses || 0) + 1,
      })
      .eq("code", code)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
