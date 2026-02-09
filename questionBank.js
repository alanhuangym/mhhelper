const fs = require("fs");
const path = require("path");

class MatchResult {
  constructor(question, answer, explanation, similarity) {
    this.question = question;
    this.answer = answer;
    this.explanation = explanation;
    this.similarity = similarity;
  }

  toJSON() {
    return {
      question: this.question,
      answer: this.answer,
      explanation: this.explanation,
      similarity: Math.round(this.similarity * 1000) / 10,
    };
  }
}

// Keep only CJK characters and common Chinese punctuation
function filterChinese(text) {
  return text.replace(/[^\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, "");
}

class QuestionBank {
  constructor(filepath) {
    this.entries = []; // [{question, answer, explanation, qChars}]
    if (!filepath) {
      filepath = path.join(__dirname, "data", "question_bank.txt");
    }
    this._load(filepath);
  }

  _load(filepath) {
    const content = fs.readFileSync(filepath, "utf-8");
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line) continue;

      const colonIdx = line.indexOf("\uff1a"); // full-width colon
      if (colonIdx < 0) continue;

      const question = line.substring(0, colonIdx).trim();
      const rest = line.substring(colonIdx + 1).trim();

      const semiIdx = rest.indexOf("\uff1b"); // full-width semicolon
      let answer, explanation;
      if (semiIdx >= 0) {
        answer = rest.substring(0, semiIdx).trim();
        explanation = rest.substring(semiIdx + 1).trim();
      } else {
        answer = rest.trim();
        explanation = "";
      }

      if (question && answer) {
        // Pre-compute character set for each question
        const qChars = new Set(filterChinese(question));
        this.entries.push({ question, answer, explanation, qChars });
      }
    }
  }

  findMatch(ocrText, threshold = 0.4) {
    if (!ocrText || !ocrText.trim()) return null;

    // Filter to Chinese characters only to remove OCR noise
    const cleaned = filterChinese(ocrText);
    if (!cleaned) return null;

    const ocrChars = new Set(cleaned);
    if (ocrChars.size === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const { question, answer, explanation, qChars } of this.entries) {
      if (qChars.size === 0) continue;

      // Count how many of the question's characters appear in the OCR text
      let covered = 0;
      for (const c of qChars) {
        if (ocrChars.has(c)) covered++;
      }

      // Coverage score: what fraction of the question is found in OCR text
      const coverage = covered / qChars.size;

      if (coverage > bestScore) {
        bestScore = coverage;
        bestMatch = new MatchResult(question, answer, explanation, coverage);
      }
    }

    return bestScore >= threshold ? bestMatch : null;
  }

  search(keyword) {
    if (!keyword || !keyword.trim()) return [];
    keyword = keyword.trim();

    const results = [];
    for (const { question, answer, explanation } of this.entries) {
      if (question.includes(keyword) || answer.includes(keyword)) {
        const kChars = new Set(filterChinese(keyword));
        const qChars = new Set(filterChinese(question));
        let covered = 0;
        for (const c of qChars) {
          if (kChars.has(c)) covered++;
        }
        const similarity = qChars.size > 0 ? covered / qChars.size : 0;
        results.push(new MatchResult(question, answer, explanation, similarity));
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, 10);
  }

  size() {
    return this.entries.length;
  }
}

module.exports = { QuestionBank, MatchResult };
