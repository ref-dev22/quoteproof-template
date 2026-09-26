import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = ['README.md', 'docs/TUTORIAL.md'];
const broken = [];
const external = new Set();

for (const file of files) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const links = [
    ...[...content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]),
    ...[...content.matchAll(/<(?:img|a)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match => match[1]),
  ];
  for (const link of links) {
    if (/^https?:\/\//.test(link)) {
      if (!/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(link)) external.add(link);
      continue;
    }
    if (/^(?:mailto:|#)/.test(link)) continue;
    const [target] = link.split('#');
    if (!target) continue;
    const local = path.resolve(root, path.dirname(file), decodeURIComponent(target));
    if (!fs.existsSync(local)) broken.push(`${file}: ${link}`);
  }
}

await Promise.all([...external].map(async link => {
  try {
    const response = await fetch(link, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
    if (!response.ok) console.log(`::warning::External link returned HTTP ${response.status}: ${link}`);
  } catch (error) {
    console.log(`::warning::External link could not be checked: ${link} (${error.name})`);
  }
}));
if (broken.length) {
  for (const link of broken) console.error(`Broken relative link: ${link}`);
  process.exitCode = 1;
}
console.log(`Relative links: ${broken.length ? 'FAIL' : 'PASS'}; external links checked with warnings only: ${external.size}`);
