const STORAGE_KEY = "judgmentRecords_v1";

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
  ratio: document.getElementById("ratioBox"),
  obiter: document.getElementById("obiterBox"),
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
      ratioDecidendi: parsed.ratioDecidendi,
      obiterDicta: parsed.obiterDicta,
    };

    records.push(record);
    persist();
    renderTable();
    setStatus(`Parsed and stored: ${file.name}`);
  } catch (err) {
    alert("Could not parse this file. Please upload TXT, PDF, DOC/DOCX, or image files.");
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
  const ok = confirm("This will clear all records and reset memory. Continue?");
  if (!ok) return;
  records = [];
  persist();
  renderTable();
  updateBoxes({
    court: "N/A",
    parties: "N/A",
    judgmentDate: "N/A",
    factsSummary: "N/A",
    ratioDecidendi: "N/A",
    obiterDicta: "N/A",
  });
});

function parseJudgment(text) {
  const cleaned = text.replace(/\r/g, "");

  const court =
    matchFirst(cleaned, [
      /\bAppellate Division\b/i,
      /\bHigh Court Division\b/i,
      /আপিল বিভাগ/u,
      /হাইকোর্ট বিভাগ/u,
    ]) || "N/A";

  const parties =
    matchFirst(cleaned, [
      /([\p{L}0-9.,'’\-() ]{2,80}\s+v\.?\s+[\p{L}0-9.,'’\-() ]{2,80})/iu,
      /([\p{L}0-9.,'’\-() ]{2,80}\s+vs\.?\s+[\p{L}0-9.,'’\-() ]{2,80})/iu,
      /([\p{L}0-9.,'’\-() ]{2,80}\s+বনাম\s+[\p{L}0-9.,'’\-() ]{2,80})/iu,
    ]) || "N/A";

  const judgmentDate =
    matchFirst(cleaned, [
      /\b(Date of Judgment|Judgment Date|Dated)[:\- ]+([0-3]?\d[\/\-.][0-1]?\d[\/\-.](?:\d{2}|\d{4}))/i,
      /\b([0-3]?\d\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i,
      /(\d{4}-\d{2}-\d{2})/,
    ], true) || "N/A";

  const factsSummary = extractSection(cleaned, [
    /facts?/i,
    /background/i,
    /ঘটনা/u,
    /পটভূমি/u,
  ], 75, 50);

  const ratioDecidendi = extractSection(cleaned, [
    /ratio decidendi/i,
    /held that/i,
    /main legal point/i,
    /সিদ্ধান্ত/i,
  ], 150);

  const obiterDicta = extractSection(cleaned, [
    /obiter/i,
    /other legal point/i,
    /additional observation/i,
    /পর্যবেক্ষণ/u,
  ], 150);

  return {
    court,
    parties,
    judgmentDate,
    factsSummary,
    ratioDecidendi,
    obiterDicta,
  };
}

async function extractTextFromFile(file) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (name.endsWith(".txt") || type.startsWith("text/")) {
    return file.text();
  }

  if (name.endsWith(".pdf") || type === "application/pdf") {
    return extractTextFromPdf(file);
  }

  if (
    name.endsWith(".docx") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".doc") ||
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

  setStatus("Parsing PDF text...");
  const data = new Uint8Array(await file.arrayBuffer());

  // Many browser/runtime environments fail loading the worker from CDN.
  // Disable worker mode to improve compatibility.
  const loadingTask = window.pdfjsLib.getDocument({
    data,
    disableWorker: true,
    useWorkerFetch: false,
  });
  const workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.js";
  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  setStatus("Parsing PDF text...");
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = window.pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  let allText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    allText += pageText + "\n";
  }

  if (allText.trim()) return allText;

  // Fallback for scanned/image-based PDFs (no selectable text).
  return extractTextFromScannedPdf(pdf);
    const pageText = content.items.map((item) => item.str).join(" ");
    allText += pageText + "\n";
  }

  return allText;
}

async function extractTextFromWord(file) {
  if (!window.mammoth) {
    // Fallback for very old/plain .doc files where direct text is still readable.
    return file.text();
  }

  setStatus("Parsing Word document...");
  const arrayBuffer = await file.arrayBuffer();

  try {
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value || "N/A";
  } catch {
    // Fallback path for .doc parsing failures.
    return file.text();
  }
}

async function extractTextFromImage(file) {
  if (!window.Tesseract) throw new Error("OCR library not loaded.");
  setStatus("Running OCR on image (English + Bengali), this may take a while...");
  const result = await window.Tesseract.recognize(file, "eng+ben");
  return result?.data?.text || "N/A";
}

async function extractTextFromScannedPdf(pdf) {
  if (!window.Tesseract) throw new Error("OCR library not loaded for scanned PDF.");
  setStatus("No text layer in PDF. Running OCR on PDF pages...");

  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    setStatus(`OCR on PDF page ${i}/${pdf.numPages}...`);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;
    const result = await window.Tesseract.recognize(canvas, "eng+ben");
    text += (result?.data?.text || "") + "\n";
  }

  return text || "N/A";
}

function extractSection(text, headingPatterns, maxWords, minWords = 1) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    if (headingPatterns.some((p) => p.test(lines[i]))) {
      start = i + 1;
      break;
    }
  }

  let candidate = "";

  if (start >= 0) {
    for (let i = start; i < lines.length; i++) {
      if (/^[A-Z][A-Za-z ]{2,30}:?$/.test(lines[i]) || /^(Facts?|Issue|Held|Order|Judgment|Ratio|Obiter)/i.test(lines[i])) {
        break;
      }
      candidate += lines[i] + " ";
      if (wordCount(candidate) >= maxWords + 15) break;
    }
  }

  if (!candidate) {
    candidate = lines.slice(0, 30).join(" ");
  }

  const finalText = truncateWords(candidate, maxWords);
  if (wordCount(finalText) < minWords || !finalText.trim()) return "N/A";

  return finalText;
}

function matchFirst(text, patterns, useGroup2 = false) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      if (useGroup2 && m[2]) return m[2].trim();
      if (m[1]) return m[1].trim();
      return m[0].trim();
    }
  }
  return null;
}

function truncateWords(str, maxWords) {
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function wordCount(str) {
  return str.split(/\s+/).filter(Boolean).length;
}

function updateBoxes(parsed) {
  boxes.court.textContent = parsed.court || "N/A";
  boxes.parties.textContent = parsed.parties || "N/A";
  boxes.date.textContent = parsed.judgmentDate || "N/A";
  boxes.summary.textContent = parsed.factsSummary || "N/A";
  boxes.ratio.textContent = parsed.ratioDecidendi || "N/A";
  boxes.obiter.textContent = parsed.obiterDicta || "N/A";
}

function renderTable() {
  tableBody.innerHTML = "";
  for (const r of records) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(String(r.serial))}</td>
      <td>${escapeHtml(r.fileName)}</td>
      <td>${escapeHtml(r.court)}</td>
      <td>${escapeHtml(r.parties)}</td>
      <td>${escapeHtml(r.judgmentDate)}</td>
      <td>${escapeHtml(r.factsSummary)}</td>
      <td>${escapeHtml(r.ratioDecidendi)}</td>
      <td>${escapeHtml(r.obiterDicta)}</td>
    `;
    tableBody.appendChild(tr);
  }
}

function escapeHtml(value) {
  return value
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
    return Array.isArray(parsed) ? parsed : [];
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
    "Summary of Facts": r.factsSummary,
    "Ratio Decidendi": r.ratioDecidendi,
    "Obiter Dicta / Other Legal Points": r.obiterDicta,
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Judgments");
  XLSX.writeFile(workbook, "judgments_register.xlsx");
}

function setStatus(message) {
  statusBox.textContent = message;
}
