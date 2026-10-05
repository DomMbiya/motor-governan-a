// Copia o worker do pdf.js para /public: o visualizador funciona sem CDN, 100% offline.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsDir = dirname(require.resolve("pdfjs-dist/package.json", { paths: [dirname(require.resolve("react-pdf"))] }));
const source = join(pdfjsDir, "build", "pdf.worker.min.mjs");
if (!existsSync(source)) {
  console.error(`[copy-pdf-worker] worker não encontrado em ${source}`);
  process.exit(1);
}
mkdirSync("public", { recursive: true });
copyFileSync(source, join("public", "pdf.worker.min.mjs"));
console.log("[copy-pdf-worker] pdf.worker.min.mjs copiado para public/");
