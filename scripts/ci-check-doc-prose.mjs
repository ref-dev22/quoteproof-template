import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = ['README.md', ...fs.readdirSync(path.join(root, 'docs'))
  .filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
const banned = /\b(?:seamless|robust|leverage|cutting-edge|state-of-the-art|effortless|powerful|delve|game-changing|revolutionary)\b/gi;
const violations = [];
const sentences = [];

for (const file of files) {
  let inFence = false;
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const prose = line.replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, '').replace(/`/g, '');
    for (const match of prose.matchAll(banned)) violations.push(`${file}:${index + 1}: ${match[0]}`);
    if (/^\s*(?:#|\||-|\d+\.)/.test(prose)) return;
    for (const sentence of prose.split(/(?<=[.!?])\s+/)) {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      if (words.length >= 8) sentences.push({ file, line: index + 1, words: words.length, text: sentence.trim() });
    }
  });
}

for (const item of violations) console.error(`Marketing word: ${item}`);
console.log('Longest prose sentences (report only):');
for (const item of sentences.sort((a, b) => b.words - a.words).slice(0, 5)) {
  console.log(`- ${item.file}:${item.line} (${item.words} words): ${item.text}`);
}
if (violations.length) process.exitCode = 1;
console.log(`Prose words: ${violations.length ? 'FAIL' : 'PASS'}`);
