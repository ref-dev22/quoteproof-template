import fs from 'node:fs';
import path from 'node:path';
import { documentationFiles, proseFindings } from './doc-checks.mjs';

const root = path.resolve(import.meta.dirname, '..');
let failures = 0;
const sentences = [];
for (const file of documentationFiles(root)) {
  const findings = proseFindings(fs.readFileSync(path.join(root, file), 'utf8'));
  for (const { word, line } of findings.violations) {
    console.error(`${file}:${line}: marketing word "${word}"`);
    failures++;
  }
  sentences.push(...findings.sentences.map(sentence => ({ file, ...sentence })));
}
console.log('Longest prose sentences (informational; no length failure):');
for (const item of sentences.sort((a, b) => b.words - a.words).slice(0, 10)) {
  console.log(`${item.file}:${item.line}: ${item.words} words: ${item.sentence}`);
}
console.log(`Prose vocabulary: ${failures ? 'FAIL' : 'PASS'}`);
if (failures) process.exitCode = 1;
