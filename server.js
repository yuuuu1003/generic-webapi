const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// server.js の上の方
const PROVIDER = "openai"; 
const MODEL = "gpt-4o"; // "gpt-4o-mini" よりさらに賢い

// 本家OpenAIを直接叩く設定
const OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const ROOM = "oracle";

io.on("connection", (socket) => {
  socket.on("join", () => {
    socket.join(ROOM);
    console.log("Joined:", socket.id);
  });
  socket.on("sensor", (data) => {
    socket.to(ROOM).emit("sensor", data);
  });
});

app.post("/api/oracle", async (req, res) => {
  try {
    const { features } = req.body || {};
    if (!features) return res.status(400).json({ error: "features is required" });

    // ★ ここを置き換える！
const prompt = `あなたは伝説の占い師です。json形式で返してください。
必ずこの形式を守ること: {
  "title":"...", "summary":"...", "tags":[], "advice":[],
  "visual":{
    "shape":"sphere|torus|box|icosa",
    "rotationSpeed":0.1,
    "noiseAmount":0.5,
    "particleCount":500,
    "message":"...",
    "color": "#RRGGBB" 
  }
}
※colorは運勢に合う色（例: 情熱なら#FF0000, 冷静なら#0000FFなど）を16進数で指定して。
入力データ: ${JSON.stringify(features)}`;

    let obj;
    // OpenAIを使う設定にしているか確認
    if (PROVIDER === "openai") {
      obj = await callOpenAI_JSON(prompt);
    } else {
      obj = await callGemini_JSON(prompt);
    }

    res.json(obj);
  } catch (e) {
    console.error("Oracle API Error:", e);
    res.status(500).json({ error: e.message });
  }
});
// --- API Helpers (省略せず実装) ---
async function callOpenAI_JSON(prompt) {
  const response = await fetch(OPENAI_API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: prompt }], response_format: { type: "json_object" } }),
  });
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function callGemini_JSON(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: "application/json",
      }
    }),
  });

  const data = await response.json();

  // --- デバッグ用ログ（これを見てください！） ---
  if (data.error) {
    console.error("【Gemini APIから拒否されました】", data.error.message);
    throw new Error(`APIエラー: ${data.error.message}`);
  }

  if (!data.candidates || data.candidates.length === 0) {
    console.error("【Geminiから回答が届きませんでした】フルデータ:", JSON.stringify(data));
    throw new Error("AIの回答が空でした。プロンプトまたは設定の問題です。");
  }

  // 安全に取得
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

server.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));