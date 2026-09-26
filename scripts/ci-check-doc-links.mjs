import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = ['README.md', 'AGENTS.md', ...fs.readdirSync(path.join(root, 'docs'))
  .filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
const broken = [];
const external = new Set();

function headingAnchors(content) {
  const counts = new Map();
  const anchors = new Set();
  for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const plain = match[1].replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, '').replace(/`/g, '');
    const slug = plain.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '')
      .trim().replace(/\s+/g, '-');
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    anchors.add(count ? `${slug}-${count}` : slug);
  }
  return anchors;
}

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
    if (/^(?:mailto:|data:)/.test(link)) continue;
    const [target, fragment] = link.split('#');
    const local = path.resolve(root, path.dirname(file), decodeURIComponent(target || path.basename(file)));
    if (!fs.existsSync(local)) {
      broken.push(`${file}: missing file ${link}`);
      continue;
    }
    if (fragment) {
      if (!fs.statSync(local).isFile() || path.extname(local).toLowerCase() !== '.md') {
        broken.push(`${file}: anchor target is not Markdown ${link}`);
      } else if (!headingAnchors(fs.readFileSync(local, 'utf8')).has(decodeURIComponent(fragment))) {
        broken.push(`${file}: missing anchor ${link}`);
      }
    }
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
for (const link of broken) console.error(`Broken relative link: ${link}`);
if (broken.length) process.exitCode = 1;
console.log(`Relative links and anchors: ${broken.length ? 'FAIL' : 'PASS'}; external links checked with warnings only: ${external.size}`);
