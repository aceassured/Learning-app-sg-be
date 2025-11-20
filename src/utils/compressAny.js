import JSZip from "jszip";
import { gzipSync, unzipSync, zipSync, strToU8 } from "fflate";
import { PDFDocument } from "pdf-lib";

export const compressAny = async (buffer, ext) => {
  ext = ext.toLowerCase();

  // -------------------------
  // 1. PDF - compress using pdf-lib
  // -------------------------
  if (ext === ".pdf") {
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      const compressedPdf = await pdfDoc.save({ useObjectStreams: true });
      return Buffer.from(compressedPdf);
    } catch (e) {
      console.log("PDF compression failed:", e);
      return buffer;
    }
  }

  // -------------------------
  // 2. ZIP - re-compress with fflate
  // -------------------------
  if (ext === ".zip") {
    try {
      const unzipped = unzipSync(buffer);
      const rezipped = zipSync(unzipped, { level: 9 });
      return Buffer.from(rezipped);
    } catch (e) {
      console.log("ZIP compression failed:", e);
      return buffer;
    }
  }

  // -------------------------
  // 3. DOCX / XLSX / PPTX - ZIP-based formats
  // -------------------------
  if ([".docx", ".xlsx", ".pptx"].includes(ext)) {
    try {
      const zip = new JSZip();
      const loaded = await zip.loadAsync(buffer);
      return await loaded.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 9 }
      });
    } catch (e) {
      console.log("Office ZIP-based compression failed:", e);
      return buffer;
    }
  }

  // -------------------------
  // 4. DOC / XLS / PPT (old Office binary formats)
  // Compress using GZIP
  // -------------------------
  if ([".doc", ".xls", ".ppt"].includes(ext)) {
    try {
      return Buffer.from(gzipSync(buffer, { level: 9 }));
    } catch (e) {
      console.log("Binary office compression failed:", e);
      return buffer;
    }
  }

  // -------------------------
  // 5. CSV (text file)
  // Compress using GZIP
  // -------------------------
  if (ext === ".csv") {
    try {
      return Buffer.from(gzipSync(buffer, { level: 9 }));
    } catch (e) {
      console.log("CSV compression failed:", e);
      return buffer;
    }
  }

  // -------------------------
  // 6. ANY OTHER FILE → GZIP fallback
  // -------------------------
  try {
    return Buffer.from(gzipSync(buffer, { level: 9 }));
  } catch (e) {
    console.log("Generic compression failed:", e);
    return buffer;
  }
};
