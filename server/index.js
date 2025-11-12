/**
Simple Express server that proxies translation requests to OpenAI Chat Completions API.
Requires environment variable OPENAI_API_KEY.

Security: This is a prototype. Do NOT send real patient-identifiable data to any third-party service
without proper HIPAA compliance and safeguards.
*/
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fetch = global.fetch || require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_KEY) {
  console.warn("Warning: OPENAI_API_KEY not set. /api/translate will fail until you set it.");
}

app.post("/api/translate", async (req, res) => {
  const { text, outputLang } = req.body || {};
  if (!text) return res.status(400).json({ error: "text required" });
  // Build a system prompt that asks the model to correct medical terms and translate.
  const prompt = [
    {role:"system", content: "You are a medical-aware translation assistant. Correct transcription errors, normalize medical terminology, preserve meaning, and translate to the requested language. Keep translation concise and suitable for spoken playback."},
    {role:"user", content: `Translate the following text into ${outputLang}. If possible, correct medical/clinical term misspellings and deliver a short, clear translation suitable for a healthcare conversation. Respond only with the translated text.`},
    {role:"user", content: text}
  ];

  try {
    if (!OPENAI_KEY) {
      return res.json({ translated: "(OPENAI_API_KEY not set on server) " + text });
    }
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: prompt,
        max_tokens: 500,
        temperature: 0.2
      })
    });
    const data = await resp.json();
    if (data?.choices && data.choices[0]) {
      const translated = data.choices[0].message.content.trim();
      return res.json({ translated });
    } else {
      return res.status(500).json({ error: "No translation result", raw: data });
    }
  } catch(err){
    console.error(err);
    return res.status(500).json({ error: "server error", detail: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("Server listening on port", PORT));
