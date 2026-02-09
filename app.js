const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { QuestionBank } = require("./questionBank");

const app = express();
const PORT = 3001;

// Ensure uploads dir exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer config
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 16 * 1024 * 1024 },
});

// Load question bank
const qb = new QuestionBank();
console.log(`Loaded ${qb.size()} questions`);

/**
 * Call the Python RapidOCR service running on localhost:3002.
 */
function callOCR(filepath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ filepath });
    const options = {
      hostname: "127.0.0.1",
      port: 3002,
      path: "/ocr",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("OCR service returned invalid JSON"));
        }
      });
    });
    req.on("error", (err) =>
      reject(new Error("OCR service unavailable: " + err.message))
    );
    req.write(body);
    req.end();
  });
}

/**
 * Search OCR result lines for the answer text and return its bounding box.
 * Prefers shorter lines (answer options) over longer lines (question text).
 */
function findAnswerBox(ocrResult, answerText) {
  if (!answerText || !ocrResult.lines) return null;
  const clean = answerText.replace(/\s+/g, "");
  if (!clean) return null;

  const candidates = [];
  for (const line of ocrResult.lines) {
    const lt = line.text.replace(/\s+/g, "");
    if (!lt) continue;
    if (lt.includes(clean)) {
      candidates.push({ bbox: line.bbox, score: 1, len: lt.length });
      continue;
    }
    let hits = 0;
    for (const c of clean) {
      if (lt.includes(c)) hits++;
    }
    const score = hits / clean.length;
    if (score >= 0.6) {
      candidates.push({ bbox: line.bbox, score, len: lt.length });
    }
  }
  if (!candidates.length) return null;
  // Best score first, then prefer shorter lines (answer options, not question text)
  candidates.sort((a, b) => b.score - a.score || a.len - b.len);
  return candidates[0].bbox;
}

// Middleware
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "static")));

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "templates", "index.html"));
});

app.post("/api/ocr", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }

  const filepath = req.file.path;
  try {
    const ocrResult = await callOCR(filepath);
    if (ocrResult.error) {
      return res.status(500).json({ error: ocrResult.error });
    }

    const ocrText = (ocrResult.text || "").replace(/\s+/g, "");
    const match = qb.findMatch(ocrText);
    const answerBox = match ? findAnswerBox(ocrResult, match.answer) : null;
    res.json({
      ocr_text: ocrText,
      match: match ? match.toJSON() : null,
      answer_box: answerBox,
    });
  } catch (err) {
    console.error("OCR error:", err);
    res.status(500).json({ error: "OCR failed" });
  } finally {
    fs.unlink(filepath, () => {});
  }
});

app.post("/api/search", (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "No text provided" });
  }

  const trimmed = text.trim();
  const match = qb.findMatch(trimmed);
  const searchResults = qb.search(trimmed);

  res.json({
    ocr_text: trimmed,
    match: match ? match.toJSON() : null,
    search_results: searchResults.map((r) => r.toJSON()),
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
