// Copies the font data pdf.js needs out of node_modules and into public/pdfjs.
//
// Run from the prebuild/predev hooks rather than committing the files: the folder must
// match the installed pdfjs-dist version, and vendoring 2.3 MB of binaries is the only
// way to get them served from the same origin, which the site's CSP requires.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'pdfjs-dist');
const target = join(root, 'public', 'pdfjs');

for (const folder of ['standard_fonts', 'cmaps']) {
  const from = join(source, folder);
  if (!existsSync(from)) {
    console.error(`pdfjs-dist/${folder} is missing. Run npm install before building.`);
    process.exit(1);
  }
}

rmSync(target, { recursive: true, force: true });
for (const folder of ['standard_fonts', 'cmaps']) {
  cpSync(join(source, folder), join(target, folder), { recursive: true });
}
console.log('copied pdfjs standard_fonts and cmaps into public/pdfjs');
