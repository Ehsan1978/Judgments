const STORAGE_KEY = "judgmentRecords_v2";

const fileInput = document.getElementById("fileInput");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");
const tableBody = document.querySelector("#recordsTable tbody");
const statusBox = document.getElementById("statusBox");

const boxes = {
  court: document.getElementById("courtBox"),
  parties: document.getElementById("partiesBox"),
  date: document.getElementById("dateBox"),
  summary: document.getElementById("summaryBox"),
  legal: document.getElementById("legalBox"),
};

let records = loadRecords();
renderTable();

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setStatus(`Reading ${file.name}...`);
    const text = await extractTextFromFile(file);
    const parsed = parseJudgment(text);

    updateBoxes(parsed);

    const record = {
      serial: records.length + 1,
      fileName: file.name,
      court: parsed.court,
      parties: parsed.parties,
      judgmentDate: parsed.judgmentDate,
      factsSummary: parsed.factsSummary,
      legalSummary: parsed.legalSummary,
    };

    records.push(record);
    persist();
    renderTable();
    setStatus(`Parsed and stored serial #${record.serial}: ${file.name}`);
  } catch (err) {
    alert("Could not parse this file. Please upload PDF, DOC/DOCX, or image files.");
    setStatus("Parsing failed.");
    console.error(err);
  } finally {
    fileInput.value = "";
  }
});

downloadBtn.addEventListener("click", () => {
  if (!records.length) {
    alert("No records available to download.");
    return;
  }
  downloadExcel(records);
});

clearBtn.addEventListener("click", () => {
  const ok = confirm("This will clear all records and reset in-browser memory. Continue?");
  if (!ok) return;

  records = [];
  persist();
  renderTable();
  updateBoxes({
    court: "N/A",
    parties: "N/A",
    judgmentDate: "N/A",
    factsSummary: "N/A",
    legalSummary: "N/A",
  });
  setStatus("All records cleared from memory. New Excel downloads will start fresh.");
});

function parseJudgment(text) {
  const cleaned = normalizeText(text);

  const court =
    matchFirst(cleaned, [
      /\bAppellate Division\b/i,
      /\bHigh Court Division\b/i,
      /আপিল বিভাগ/u,
      /হাইকোর্ট বিভাগ/u,
    ]) || "N/A";

  const parties =
    matchFirst(cleaned, [
      /([\p{L}0-9.,'’\-() ]{2,90}\s+v\.?\s+[\p{L}0-9.,'’\-() ]{2,90})/iu,
      /([\p{L}0-9.,'’\-() ]{2,90}\s+vs\.?\s+[\p{L}0-9.,'’\-() ]{2,90})/iu,
      /([\p{L}0-9.,'’\-() ]{2,90}\s+বনাম\s+[\p{L}0-9.,'’\-() ]{2,90})/iu,
    ]) || "N/A";

  const judgmentDate =
    matchFirst(cleaned, [
      /\b(?:Date of Judgment|Judgment Date|Date|Dated|রায়ের তারিখ)[:\- ]+([0-3]?\d[\/\-.][0-1]?\d[\/\-.](?:\d{2}|\d{4}))/i,
      /\b([0-3]?\d\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i,
      /(\d{4}-\d{2}-\d{2})/,
    ]) || "N/A";

  const factsSummary = buildFactsSummary(cleaned);
  const legalSummary = buildLegalSummary(cleaned, factsSummary);

  return {
    court,
    parties,
    judgmentDate,
    factsSummary,
    legalSummary,
  };
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function normalizeText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildFactsSummary(text) {
  const candidate = extractSection(text, [
    /facts?/i,
    /background/i,
    /brief facts/i,
    /ঘটনা/u,
    /পটভূমি/u,
  ]);

  const fromText = candidate || text;
  const sentences = splitSentences(fromText).filter((s) => !looksLikeLawOnlySentence(s));
  const assembled = assembleSentences(sentences, 75);

  if (wordCount(assembled) < 50) {
    const fallback = assembleSentences(splitSentences(text), 75);
    if (wordCount(fallback) < 50) return "N/A";
    return truncateWords(fallback, 75);
  }


  if (wordCount(assembled) < 50) {
    const fallback = assembleSentences(splitSentences(text), 75);
    if (wordCount(fallback) < 50) return "N/A";
    return truncateWords(fallback, 75);
  }

  return truncateWords(assembled, 75);
}

function buildLegalSummary(text, factsSummary) {
  const legalSection = extractSection(text, [
    /ratio decidendi/i,
    /legal point/i,
    /principle of law/i,
    /held that/i,
    /it is settled law/i,
    /আইনের প্রশ্ন/u,
    /আইনের নীতি/u,
    /সিদ্ধান্ত/i,
  ]);

  const source = legalSection || text;
  const factsTokens = toTokenSet(factsSummary);
  const candidates = splitSentences(source)
    .filter((s) => looksLikeLawOnlySentence(s))
    .filter((s) => lexicalOverlapRatio(toTokenSet(s), factsTokens) < 0.35)
    .filter((s) => !containsHardFactSignals(s));

  const legal = truncateWords(assembleSentences(candidates, 100), 100);

  if (!legal || wordCount(legal) < 20) return "N/A";
  return legal;
}

function looksLikeLawOnlySentence(sentence) {
  return /(court|held|law|legal|statute|section|article|interpret|principle|jurisdiction|precedent|maintainable|burden|standard|liable|evidence|remedy|constitutional|আইন|ধারা|আদালত|সিদ্ধান্ত|নীতি)/iu.test(sentence);
}

function containsHardFactSignals(sentence) {
  return /(petitioner|respondent|appellant|plaintiff|defendant|on\s+\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|witness|hospital|v\.?\s|vs\.?\s|বনাম|ঘটনা|তারিখ)/iu.test(sentence);
}

function extractSection(text, headingPatterns) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    if (headingPatterns.some((pattern) => pattern.test(lines[i]))) {
      start = i + 1;
      break;
    }
  }

  if (start === -1) return "";

  let candidate = "";
  for (let i = start; i < lines.length; i++) {
    if (/^(issue|facts?|background|analysis|discussion|held|order|judgment|ratio|obiter|conclusion|decision)[: ]?$/i.test(lines[i])) {
      break;
    }
    candidate += `${lines[i]} `;
    if (wordCount(candidate) > 220) break;
  }

  return candidate.trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?।])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

function assembleSentences(sentences, maxWords) {
  let output = "";
  for (const sentence of sentences) {
    const tentative = `${output} ${sentence}`.trim();
    if (wordCount(tentative) > maxWords) break;
    output = tentative;
  }
  return output;
}

function toTokenSet(text) {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t && t.length > 2)
  );
}

function lexicalOverlapRatio(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let common = 0;
  for (const token of setA) {
    if (setB.has(token)) common += 1;
  }
  return common / Math.max(setA.size, 1);
}

async function extractTextFromFile(file) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (name.endsWith(".pdf") || type === "application/pdf") {
    return extractTextFromPdf(file);
  }

  if (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword"
  ) {
    return extractTextFromWord(file);
  }

  if (type.startsWith("image/")) {
    return extractTextFromImage(file);
  }

  throw new Error("Unsupported file format.");
}

async function extractTextFromPdf(file) {
  if (!window.pdfjsLib) throw new Error("PDF library not loaded.");

  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.js";
  }

  setStatus("Parsing PDF text...");
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf;

  try {
    const loadingTask = window.pdfjsLib.getDocument({ data });
    pdf = await loadingTask.promise;
  } catch {
    throw new Error("Unable to open PDF. The file may be encrypted or corrupted.");
  }
  const loadingTask = window.pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  let allText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ").trim();
    if (pageText) {
      allText += `${pageText}\n`;
    }
    const pageText = content.items.map((item) => item.str).join(" ");
    allText += `${pageText}\n`;
  }

  if (wordCount(allText) >= 20) return allText;
  if (!window.Tesseract) return allText || "N/A";

  setStatus("PDF appears scanned. Running OCR (English + Bengali)...");

  let ocrText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageDataUrl = canvas.toDataURL("image/png");
    const result = await window.Tesseract.recognize(imageDataUrl, "eng+ben");
    const pageOcr = result?.data?.text?.trim() || "";
    if (pageOcr) {
      ocrText += `${pageOcr}\n`;
    }
  }

  return ocrText || allText || "N/A";
}

async function extractTextFromWord(file) {
  if (!window.mammoth) return file.text();

  setStatus("Parsing Word document...");
  const arrayBuffer = await file.arrayBuffer();

  try {
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value || "N/A";
  } catch {
    return file.text();
  }
}

async function extractTextFromImage(file) {
  if (!window.Tesseract) throw new Error("OCR library not loaded.");

  setStatus("Running OCR on image (English + Bengali), this may take a while...");
  const result = await window.Tesseract.recognize(file, "eng+ben");
  return result?.data?.text || "N/A";
}

function matchFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    if (match[1]) return match[1].trim();
    return match[0].trim();
  }
  return null;
}

function truncateWords(str, maxWords) {
  const words = (str || "").split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function wordCount(str) {
  return (str || "").split(/\s+/).filter(Boolean).length;
}

function updateBoxes(parsed) {
  boxes.court.textContent = parsed.court || "N/A";
  boxes.parties.textContent = parsed.parties || "N/A";
  boxes.date.textContent = parsed.judgmentDate || "N/A";
  boxes.summary.textContent = parsed.factsSummary || "N/A";
  boxes.legal.textContent = parsed.legalSummary || "N/A";
}

function renderTable() {
  tableBody.innerHTML = "";

  for (const record of records) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(String(record.serial ?? "N/A"))}</td>
      <td>${escapeHtml(record.fileName ?? "N/A")}</td>
      <td>${escapeHtml(record.court ?? "N/A")}</td>
      <td>${escapeHtml(record.parties ?? "N/A")}</td>
      <td>${escapeHtml(record.judgmentDate ?? "N/A")}</td>
      <td>${escapeHtml(record.factsSummary ?? "N/A")}</td>
      <td>${escapeHtml(record.legalSummary ?? "N/A")}</td>
    `;
    tableBody.appendChild(row);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((r, index) => ({
      serial: index + 1,
      fileName: r.fileName || "N/A",
      court: r.court || "N/A",
      parties: r.parties || "N/A",
      judgmentDate: r.judgmentDate || "N/A",
      factsSummary: r.factsSummary || "N/A",
      legalSummary: r.legalSummary || r.ratioDecidendi || "N/A",
    }));
  } catch {
    return [];
  }
}

function downloadExcel(data) {
  const rows = data.map((r) => ({
    Serial: r.serial,
    "File Name": r.fileName,
    "Name of Court": r.court,
    Parties: r.parties,
    "Date of Judgment": r.judgmentDate,
    "Summary of Facts (50-75 words)": r.factsSummary,
    "Summary of Legal Point (<=100 words)": r.legalSummary,
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 30 },
    { wch: 22 },
    { wch: 30 },
    { wch: 18 },
    { wch: 55 },
    { wch: 55 },
  ];

  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex++) {
    worksheet["!rows"] = worksheet["!rows"] || [];
    worksheet["!rows"][rowIndex] = { hpt: 42 };

    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
      const ref = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex });
      const cell = worksheet[ref];
      if (!cell) continue;
      cell.s = {
        alignment: { wrapText: true, vertical: "top" },
      };
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Judgments");
  XLSX.writeFile(workbook, "judgments_register.xlsx", { cellStyles: true });
}

function setStatus(message) {
  statusBox.textContent = message;
}
