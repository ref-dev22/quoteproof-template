import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { documentationFiles, documentationLinks, markdownAnchors, proseFindings, relativeLinkError } from './doc-checks.mjs';

function temporaryRoot(t, prefix) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, prefix));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith(prefix));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}

test('GitHub heading fragments include punctuation removal, duplicates and explicit IDs', () => {
  const anchors = markdownAnchors('# What you’ll learn\n## `verify:quote` flags\n## Repeat\n## Repeat\n## Repeat-1\nCafé\n----\n<a id="custom"></a>\n```md\n# Hidden\n```');
  for (const value of ['what-youll-learn', 'verifyquote-flags', 'repeat', 'repeat-1', 'repeat-1-1', 'café', 'custom']) assert.ok(anchors.has(value), value);
  assert.equal(anchors.has('hidden'), false);
});

test('relative anchors, percent encoding, source lines and missing destinations', t => {
  const root = temporaryRoot(t, 'quoteproof-doc-links-');
  fs.writeFileSync(path.join(root, 'README.md'), '# Start here\n\n## Café\n');
  fs.writeFileSync(path.join(root, 'code.ts'), 'one\ntwo\n');
  assert.equal(relativeLinkError(root, 'README.md', '#start-here'), undefined);
  assert.equal(relativeLinkError(root, 'README.md', 'README.md#caf%C3%A9'), undefined);
  assert.match(relativeLinkError(root, 'README.md', '#gone'), /missing anchor/);
  assert.match(relativeLinkError(root, 'README.md', 'absent.md#start-here'), /does not exist/);
  assert.equal(relativeLinkError(root, 'README.md', 'code.ts#L1-L2'), undefined);
  assert.match(relativeLinkError(root, 'README.md', 'code.ts#L3'), /invalid source anchor/);
  assert.match(relativeLinkError(root, 'README.md', '%ZZ'), /invalid URL encoding/);
});

test('Markdown, reference definitions and HTML links are checked outside fenced examples', () => {
  const links = documentationLinks('[Same](#here)\n[Other](other.md#there "Title")\n[x]: ref.md#part\n<img src="image.png">\n~~~md\n[Fake](missing.md)\n~~~');
  assert.deepEqual(links, ['#here', 'other.md#there', 'ref.md#part', 'image.png']);
});

test('all ten prohibited words fail in prose, including headings and table cells', () => {
  const text = '# Seamless\n\n| robust | leverage | cutting-edge |\n\nstate-of-the-art effortless powerful delve game-changing revolutionary.';
  assert.equal(proseFindings(text).violations.length, 10);
});

test('code, link destinations and parts of longer words are not prose violations', () => {
  const text = '`robust`\n\n[Code](leverage.ts) robustness\n\n```sh\necho seamless\n```\n';
  assert.equal(proseFindings(text).violations.length, 0);
  assert.equal(proseFindings('[Seamless](safe.md)').violations.length, 1);
});

test('long wrapped sentences are reported without becoming failures', () => {
  const findings = proseFindings('One two three\nfour five six seven eight nine ten.\n\nShort sentence.');
  assert.equal(findings.sentences[0].words, 10);
  assert.equal(findings.violations.length, 0);
});

test('sentence reporting separates list items and sentences starting with inline code', () => {
  const findings = proseFindings('- One short item.\n- Another short item.\n\nA sentence. `npm ci` installs dependencies.');
  assert.deepEqual(findings.sentences.map(item => item.words), [3, 3, 2, 4]);
  assert.deepEqual(findings.sentences.map(item => item.line), [1, 2, 4, 4]);
});

test('CLI checks fail for broken anchors and marketing prose, and discover all docs', t => {
  const root = temporaryRoot(t, 'quoteproof-doc-cli-');
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'docs'));
  for (const file of ['doc-checks.mjs', 'ci-check-doc-links.mjs', 'ci-check-doc-prose.mjs']) {
    fs.copyFileSync(new URL(file, import.meta.url), path.join(root, 'scripts', file));
  }
  fs.writeFileSync(path.join(root, 'README.md'), '# Start\n\n[Broken](docs/NEW.md#missing)\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Agents\n');
  fs.writeFileSync(path.join(root, 'docs/NEW.md'), '# New\n\nSeamless setup.\n');
  assert.deepEqual(documentationFiles(root, true), ['README.md', 'AGENTS.md', 'docs/NEW.md']);
  const links = spawnSync(process.execPath, [path.join(root, 'scripts/ci-check-doc-links.mjs'), '--local-only'], { encoding: 'utf8' });
  assert.equal(links.status, 1);
  assert.match(links.stderr, /missing anchor #missing/);
  const prose = spawnSync(process.execPath, [path.join(root, 'scripts/ci-check-doc-prose.mjs')], { encoding: 'utf8' });
  assert.equal(prose.status, 1);
  assert.match(prose.stderr, /docs\/NEW.md:3: marketing word/);
  fs.writeFileSync(path.join(root, 'docs/NEW.md'), '# Missing\n\n' + 'word '.repeat(100) + '.\n');
  for (const script of ['ci-check-doc-links.mjs', 'ci-check-doc-prose.mjs']) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), '--local-only'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
