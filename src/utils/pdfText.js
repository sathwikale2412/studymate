import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Read every page as plain text, in the browser.
 *
 * The prototype sent the file to Flask and used PyMuPDF. Serverless functions cap the
 * request body at 4.5 MB, which rejects most real lecture PDFs, so parsing moved here and
 * the bytes never leave the device.
 */
export async function extractPages(file) {
  const buffer = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new Error(`"${file.name}" is password-protected. Remove the password and try again.`);
    }
    throw new Error(`"${file.name}" could not be opened: ${err?.message ?? 'unknown PDF error'}`);
  }

  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      pages.push({ page: pageNumber, file: file.name, text });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  const characters = pages.reduce((sum, entry) => sum + entry.text.trim().length, 0);
  if (characters < 50) {
    throw new Error(
      `"${file.name}" has no extractable text — it is probably scanned pages of images. ` +
        'It needs OCR first (for example, `ocrpdf --image-to-text` or Google Keep).'
    );
  }
  return pages;
}
