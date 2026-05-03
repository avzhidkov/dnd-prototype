const getBody = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", chunk => data += chunk);
  req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch(e) { reject(e); } });
  req.on("error", reject);
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-openai-key, x-gemini-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const geminiKey = req.headers["x-gemini-key"];
  const openaiKey = req.headers["x-openai-key"];

  if (!geminiKey && !openaiKey) return res.status(400).json({ error: "No API key" });

  try {
    const body = await getBody(req);

    if (geminiKey) {
      const model = body.model || "gemini-2.0-flash";
      const payload = {
        contents: body.contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: body.max_tokens || 1000 },
      };
      if (body.system) payload.systemInstruction = { parts: [{ text: body.system }] };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) }
      );
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return res.status(200).json({ text, raw: data });
    } else {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: body.model || "gpt-4o",
          max_tokens: body.max_tokens || 800,
          messages: body.messages,
        }),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      return res.status(200).json(data);
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}