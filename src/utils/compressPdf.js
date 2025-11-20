import { execFile } from "child_process";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export const compressPdfBuffer = (inputBuffer) => {
  return new Promise((resolve, reject) => {
    const inputPath = path.join(tmpdir(), `${randomUUID()}.pdf`);
    const outputPath = path.join(tmpdir(), `${randomUUID()}-compressed.pdf`);

    fs.writeFileSync(inputPath, inputBuffer);

    const args = [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/ebook",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    execFile("gs", args, (error) => {
      try {
        if (error) return reject(error);

        const compressed = fs.readFileSync(outputPath);

        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);

        resolve(compressed);
      } catch (err) {
        reject(err);
      }
    });
  });
};
