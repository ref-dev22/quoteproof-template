import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { documentationFiles, documentationLinks, markdownAnchors, proseFindings, relativeLinkError } from './doc-checks.mjs';
import { checkScaffoldText, isRewriteTarget, replaceYarnReference, rewriteText, scaffoldCommand, scaffoldTextFindings } from './check-scaffold-text.mjs';

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

test('creator rewrite covers command, prose, URL, workspace and ignore-file transformations', () => {
  const command = (...parts) => parts.join(' ');
  const legacy = '\x79arn';
  for (const word of ['audit', 'ls', 'view', '--version', 'lockfile']) {
    assert.equal(replaceYarnReference(command('npm', word)), command('npm run', word));
  }
  for (const word of ['run', 'install', 'exec', 'ci']) {
    assert.equal(replaceYarnReference(command('npm', word)), command('npm', word));
  }
  assert.equal(replaceYarnReference(`${legacy} workspace @sh/hardhat test`), 'npm run test -w @sh/hardhat --');
  assert.equal(replaceYarnReference(`${legacy} install --immutable`), 'npm install');
  assert.equal(replaceYarnReference(`https://${legacy}pkg.com/`), 'https://www.npmjs.com/');
  assert.equal(replaceYarnReference('\x59arn defaults'), 'npm run defaults');
  assert.equal(replaceYarnReference('npm\nview'), 'npm run view');
  assert.equal(rewriteText('.gitignore', '# npm\n\ncache\n'), '# npm run cache\n');
  assert.equal(rewriteText('.gitignore', '# npm\n\n# cache\n'), '\n# cache\n');
  assert.equal(rewriteText('.prettierignore', '# npm\n\n# cache\n'), '\n# cache\n');
  assert.equal(rewriteText('notes.md', '# npm\n\n# cache\n'), '# npm\n\n# cache\n');
});

test('creator file scope includes special dotfiles and excludes recipe and runtime trees', () => {
  for (const ext of ['md', 'txt', 'json', 'js', 'cjs', 'mjs', 'ts', 'mts', 'cts', 'yml', 'yaml', 'env', 'example', 'rc']) {
    assert.equal(isRewriteTarget(`nested/file.${ext}`), true);
  }
  for (const file of ['.gitignore', '.prettierignore', '.lintstagedrc.js', 'packages/nextjs/.env.example']) assert.equal(isRewriteTarget(file), true);
  for (const file of ['.harness/recipe.md', '.harness\\recipe.yml', 'nested/node_modules/test.js', '.git/config.json', 'test.sh', 'image.png']) assert.equal(isRewriteTarget(file), false);
  assert.equal(isRewriteTarget('nested/.harness/recipe.md'), true);
});

test('only one exact scaffold line in each named document is allowed', () => {
  for (const file of ['README.md', 'docs/TUTORIAL.md']) {
    assert.deepEqual(scaffoldTextFindings(file, scaffoldCommand + '\r\n'), { failures: [], allowed: 1 });
    assert.equal(scaffoldTextFindings(file, `${scaffoldCommand}\n${scaffoldCommand}`).failures.length, 1);
    assert.equal(scaffoldTextFindings(file, scaffoldCommand.replace('quoteproof --template', 'other --template')).failures.length, 1);
  }
  for (const file of ['docs/HOW-TO.md', '.github/workflows/tutorial.yml']) {
    assert.equal(scaffoldTextFindings(file, scaffoldCommand).failures.length, 1);
  }
});

test('scaffold CLI checks tracked content, exits on drift, and never prints source text', t => {
  const root = temporaryRoot(t, 'quoteproof-scaffold-text-');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '-q');
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, '.harness'));
  fs.copyFileSync(new URL('check-scaffold-text.mjs', import.meta.url), path.join(root, 'scripts/check-scaffold-text.mjs'));
  const sensitiveLine = ['npm', 'audit', 'private-example'].join(' ');
  fs.writeFileSync(path.join(root, 'README.md'), scaffoldCommand + '\n');
  fs.writeFileSync(path.join(root, 'tracked.example'), sensitiveLine);
  fs.writeFileSync(path.join(root, '.harness/recipe.md'), sensitiveLine);
  fs.writeFileSync(path.join(root, 'ignored.sh'), sensitiveLine);
  git('add', '.');
  fs.writeFileSync(path.join(root, 'untracked.md'), sensitiveLine);
  const result = checkScaffoldText(root);
  assert.equal(result.files, 3);
  assert.equal(result.allowed, 1);
  assert.deepEqual(result.failures, ['tracked.example:1: creator 0.4.1 would change this line']);
  const cli = () => spawnSync(process.execPath, [path.join(root, 'scripts/check-scaffold-text.mjs')], { encoding: 'utf8' });
  const failed = cli();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /tracked.example:1/);
  assert.equal(failed.stderr.includes(sensitiveLine), false);
  fs.writeFileSync(path.join(root, 'tracked.example'), 'Stable content.');
  assert.equal(cli().status, 0);
});

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
