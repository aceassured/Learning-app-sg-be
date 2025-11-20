import { compressAny } from "./compressAny.js";
import { compressPdfBuffer } from "./compressPdf.js";

export const compressFile = async (buffer, mimetype, originalname) => {
  try {
    const beforeKB = (buffer.length / 1024).toFixed(2);

    let compressed = buffer;

    if (originalname.toLowerCase().endsWith(".pdf")) {
      compressed = await compressPdfBuffer(buffer);
    } else {
      compressed = await compressAny(buffer, originalname);
    }

    const afterKB = (compressed.length / 1024).toFixed(2);

    console.log(
      `✔ ${originalname} compressed: ${beforeKB} KB → ${afterKB} KB`
    );

    return compressed;
  } catch (err) {
    console.error("❌ Compression failed, using original file:", err);

    return buffer; // Fallback
  }
};
