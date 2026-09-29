import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Copied from create-scaffold-hbar@0.4.1 dist/cli.js:
// replaceYarnReference and updateTextFilesForNpm.
// https://registry.npmjs.org/create-scaffold-hbar/0.4.1
// Escape legacy-manager literals below so this checker survives the same rewrite.
export function replaceYarnReference(content) {
  let next = content;
  next = next
    .replace(/https:\/\/yarnpkg\.com\/?/gi, 'https://www.npmjs.com/')
    .replace(/\bYarn\b/g, 'npm')
    .replace(/\byarn\b/g, 'npm');
  next = next.replace(/\bnpm\s+workspace\s+(@sh\/[a-zA-Z0-9_-]+)\s+([a-zA-Z0-9:_-]+)\b/g, 'npm run $2 -w $1 --');
  next = next.replace(/\bnpm\s+install\s+--immutable\b/g, 'npm install');
  next = next.replace(/\bnpm\s+([a-zA-Z0-9:_-]+)\b/g, (match, scriptName) => {
    if (scriptName === 'run' || scriptName === 'install' || scriptName === 'exec' || scriptName === 'ci') return match;
    return `npm run ${scriptName}`;
  });
  return next;
}

const extensions = new Set(['.md', '.txt', '.json', '.js', '.cjs', '.mjs', '.ts', '.mts', '.cts', '.yml', '.yaml', '.env', '.example', '.rc']);
const specialFiles = new Set(['.lintstagedrc.js', '.gitignore', '.prettierignore']);

export function isRewriteTarget(file) {
  const parts = file.replaceAll('\\', '/').split('/');
  if (parts[0] === '.harness' || parts.slice(0, -1).some(part => part === '.git' || part === 'node_modules')) return false;
  return extensions.has(path.extname(file)) || specialFiles.has(parts.at(-1));
}

export function rewriteText(file, content) {
  let updated = replaceYarnReference(content);
  if (['.gitignore', '.prettierignore'].includes(path.basename(file))) {
    updated = updated.split('\n')
      .filter(line => !line.includes('.\x79arn') && !line.includes('.\x79arnrc') && !line.includes('\x79arn.lock'))
      .filter((line, index, lines) => !(line.trim() === '# npm' && lines[index + 1]?.trim() === ''))
      .join('\n');
  }
  return updated;
}

// Only these two exact command lines are exempt: the brief's creator syntax.
// Build the string in parts to avoid adding a third rewrite-sensitive copy.
export const scaffoldCommand = [
  'npm',
  'create scaffold-hbar@latest -- quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager',
  'npm',
  '--skip-hedera-skills --skip-install',
].join(' ');
const commandFiles = new Set(['README.md', 'docs/TUTORIAL.md']);

export function scaffoldTextFindings(file, original) {
  const updated = rewriteText(file, original);
  const before = original.split('\n');
  const after = updated.split('\n');
  const failures = [];
  let allowed = 0;
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    if (before[index] === after[index]) continue;
    if (commandFiles.has(file) && before[index]?.replace(/\r$/, '') === scaffoldCommand &&
        after[index] === replaceYarnReference(before[index]) && allowed === 0) {
      allowed++;
    } else {
      // Report location only: source lines could contain credentials.
      failures.push(`${file}:${index + 1}: creator 0.4.1 would change this line`);
    }
  }
  return { failures, allowed };
}

export function checkScaffoldText(root) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(file => file && isRewriteTarget(file));
  const failures = [];
  let allowed = 0;
  for (const file of files) {
    const result = scaffoldTextFindings(file, fs.readFileSync(path.join(root, file), 'utf8'));
    failures.push(...result.failures);
    allowed += result.allowed;
  }
  return { files: files.length, failures, allowed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = checkScaffoldText(root);
  if (result.failures.length) {
    console.error(result.failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Scaffold text: PASS (${result.files} tracked text files; ${result.allowed} exact scaffold-command exceptions; no workflow exceptions)`);
  }
}
