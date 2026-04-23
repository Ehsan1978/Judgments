# Judgment Parser (English/Bengali)

A browser-based HTML/CSS/JavaScript tool for uploading judgments in:

- `.pdf`
- `.doc`
- `.docx`
- image formats (OCR enabled)

The app extracts and displays:

1. Name of Court (Appellate Division / High Court Division)
2. Party names (e.g., A v B / বনাম)
3. Date of Judgment
4. Summary of Facts (target 50–75 words)
5. Summary of Legal Point (up to 100 words, legal principle only)

If a field is unavailable, it is shown as `N/A`.

## Features

- Upload and parse one judgment at a time.
- English + Bengali text support.
- Automatic serial register in table format for every upload.
- Download the full register as Excel (`judgments_register.xlsx`).
- Excel output includes readable column widths and wrapped cell content.
- Clear button resets the in-browser memory and starts a fresh register.

## Usage

1. Open `index.html` in a browser.
2. Click **Upload Judgment** and select a supported file.
3. View extracted values in the output boxes.
4. Confirm all parsed records in the table.
5. Click **Download Excel** to export all records.
6. Click **Clear** to remove all records from memory.

## Technical Notes

- Data is persisted in browser `localStorage`.
- PDF text extraction uses `pdf.js`.
- Word extraction uses `mammoth` (with fallback for `.doc` edge cases).
- Image text extraction uses `tesseract.js` with `eng+ben` OCR.
- Summaries are heuristic and heading-aware; best results come from judgments with clear section titles.
