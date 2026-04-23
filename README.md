# Judgment Parser (English/Bengali)

A simple HTML/CSS/JavaScript application for uploading judgments (`.txt`, `.pdf`, `.doc`, `.docx`, image files) and extracting:

1. Name of Court (Appellate Division or High Court Division)
2. Party names (e.g., A v B / বনাম)
3. Date of judgment
4. Summary of facts (target 50–75 words)
5. Ratio decidendi (max 150 words)
6. Obiter dicta / other legal points (max 150 words)

If a field cannot be found, the UI shows `N/A`.

## Usage

- Open `index.html` in a browser.
- Click **Upload Judgment** and select a supported file.
- Parsed output appears in boxes and is appended serially in the records table.
- Click **Download Excel** to export all records as `judgments_register.xlsx`.
- Click **Clear** to clear saved records and reset displayed memory.

## Notes

- Data is persisted in browser `localStorage`.
- The parser uses pattern-based extraction and heading heuristics. For best results, include clear headings like `Facts`, `Ratio`, `Obiter`, etc.
- PDF text is extracted using `pdf.js`.
- Word text is extracted using `mammoth` (with fallback text read for legacy `.doc` parsing edge cases).
- Image files are processed with OCR (`tesseract.js`) using English + Bengali recognition.
