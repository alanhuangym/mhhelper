const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
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

// Create a persistent Tesseract worker for Chinese (load from local lang-data)
let ocrWorker = null;
const langPath = path.join(__dirname, "lang-data");

async function getOCRWorker() {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker("chi_sim", 1, {
      langPath,
      logger: () => {},
    });
  }
  return ocrWorker;
}

// Pre-initialize worker at startup (don't crash server if it fails)
getOCRWorker()
  .then(() => console.log("OCR engine ready"))
  .catch((err) => {
    console.error("OCR init failed, will retry on first request:", err.message);
    ocrWorker = null;
  });

/**
 * Preprocess image for better OCR accuracy.
 */
async function preprocessImage(inputPath) {
  const outputPath = inputPath + "_processed.png";
  await sharp(inputPath)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .png()
    .toFile(outputPath);
  return outputPath;
}

/**
 * Search OCR result lines for the answer text and return its bounding box.
 * Prefers shorter lines (answer options) over longer lines (question text).
 */
function findAnswerBox(ocrData, answerText) {
  if (!answerText || !ocrData.lines) return null;
  const clean = answerText.replace(/\s+/g, "");
  if (!clean) return null;

  const candidates = [];
  for (const line of ocrData.lines) {
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
  let processedPath = null;
  try {
    processedPath = await preprocessImage(filepath);

    const worker = await getOCRWorker();
    const { data } = await worker.recognize(processedPath);
    const ocrText = data.text.replace(/\s+/g, "");

    const match = qb.findMatch(ocrText);
    const answerBox = match ? findAnswerBox(data, match.answer) : null;
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
    if (processedPath) fs.unlink(processedPath, () => {});
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
