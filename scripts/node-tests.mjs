import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import './test-fuzzy-search.mjs';

const root = path.resolve(process.cwd(), 'tests');

function listTestFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listTestFiles(p));
      continue;
    }
    const name = String(ent.name || '');
    if (name.endsWith('.test.js') || name.endsWith('.test.mjs')) out.push(p);
  }
  return out;
}

const files = listTestFiles(root).sort((a, b) => a.localeCompare(b));
for (const p of files) {
  await import(pathToFileURL(p).href);
}

