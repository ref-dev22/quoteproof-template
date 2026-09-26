import fs from 'node:fs';
import path from 'node:path';
import { documentationFiles, documentationLinks, relativeLinkError } from './doc-checks.mjs';

const root = path.resolve(import.meta.dirname, '..');
const files = documentationFiles(root, true);
const broken = [];
const external = new Set();
for (const file of files) {
  for (const link of documentationLinks(fs.readFileSync(path.join(root, file), 'utf8'))) {
    if (/^https?:\/\//.test(link)) {
      if (!/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(link)) external.add(link);
      continue;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('//')) continue;
    const error = relativeLinkError(root, file, link);
    if (error) broken.push(`${file}: ${link} (${error})`);
  }
}

// External URLs remain warnings only; --local-only supports deterministic offline checks.
if (!process.argv.includes('--local-only')) {
  await Promise.all([...external].map(async link => {
    try {
      const response = await fetch(link, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
      if (!response.ok) console.log(`::warning::External link returned HTTP ${response.status}: ${link}`);
    } catch (error) {
      console.log(`::warning::External link could not be checked: ${link} (${error.name})`);
    }
  }));
}
if (broken.length) {
  for (const link of broken) console.error(`Broken relative link: ${link}`);
  process.exitCode = 1;
}
console.log(`Relative links and anchors: ${broken.length ? 'FAIL' : 'PASS'} (${files.length} files); external URLs: ${external.size}${process.argv.includes('--local-only') ? ' (not checked)' : ' (warnings only)'}`);
