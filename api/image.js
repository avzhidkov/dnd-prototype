import { IncomingForm } from 'formidable';
import fs from 'fs';
import FormData from 'form-data';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-openai-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = req.headers["x-openai-key"];
  if (!apiKey) return res.status(400).json({ error: "No API key" });

  const contentType = req.headers["content-type"] || "";

  try {
    // Multipart — with reference images → /v1/images/edits
    if (contentType.includes("multipart/form-data")) {
      const form = new IncomingForm({ keepExtensions: true });
      const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err); else resolve({ fields, files });
        });
      });

      const outForm = new FormData();
      outForm.append("model", "gpt-image-1");
      outForm.append("prompt", Array.isArray(fields.prompt) ? fields.prompt[0] : fields.prompt);
      outForm.append("n", "1");
      outForm.append("size", "1536x1024");

      // Attach reference images
      const imageFiles = Array.isArray(files.image) ? files.image : files.image ? [files.image] : [];
      for (const f of imageFiles) {
        outForm.append("image[]", fs.createReadStream(f.filepath), {
          filename: f.originalFilename || "reference.png",
          contentType: f.mimetype || "image/png",
        });
      }

      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, ...outForm.getHeaders() },
        body: outForm,
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    // JSON — text only → /v1/images/generations
    const body = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
      req.on("error", reject);
    });

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: body.prompt,
        n: 1,
        size: "1536x1024",
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
