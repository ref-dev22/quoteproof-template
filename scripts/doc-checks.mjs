import fs from 'node:fs';
import path from 'node:path';

export function documentationFiles(root, includeAgents = false) {
  return ['README.md', ...(includeAgents ? ['AGENTS.md'] : []),
    ...fs.readdirSync(path.join(root, 'docs')).filter(name => name.endsWith('.md')).sort().map(name => `docs/${name}`)];
}

// Keep line numbers while ignoring fenced examples (including Mermaid).
export function withoutFences(markdown) {
  let fence;
  return markdown.split(/\r?\n/).map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!fence && marker) { fence = marker[1]; return ''; }
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = undefined;
      return '';
    }
    return line;
  }).join('\n');
}

export function markdownAnchors(markdown) {
  const text = withoutFences(markdown);
  const anchors = new Set();
  const used = new Set();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const atx = lines[i].match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    const setext = i + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1]) && lines[i].trim();
    if (!atx && !setext) continue;
    const heading = (atx ? atx[1] : lines[i].trim())
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '');
    const base = heading.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').replace(/ /g, '-');
    let slug = base;
    let suffix = 0;
    while (used.has(slug)) slug = `${base}-${++suffix}`;
    used.add(slug);
    anchors.add(slug);
    if (setext && !atx) i++;
  }
  for (const match of text.matchAll(/<[^>]+\b(?:id|name)\s*=\s*["']([^"']+)["'][^>]*>/gi)) anchors.add(match[1]);
  return anchors;
}

export function documentationLinks(markdown) {
  const text = withoutFences(markdown);
  return [
    ...[...text.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\)/g)].map(m => m[1].replace(/^<|>$/g, '')),
    ...[...text.matchAll(/^ {0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)].map(m => m[1].replace(/^<|>$/g, '')),
    ...[...text.matchAll(/<(?:img|a)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]),
  ];
}

export function relativeLinkError(root, file, link) {
  const hash = link.indexOf('#');
  const target = hash < 0 ? link : link.slice(0, hash);
  let fragment;
  let local;
  try {
    fragment = hash < 0 ? '' : decodeURIComponent(link.slice(hash + 1));
    local = target ? path.resolve(root, path.dirname(file), decodeURIComponent(target.split('?')[0])) : path.join(root, file);
  } catch { return 'invalid URL encoding'; }
  if (!fs.existsSync(local)) return 'target does not exist';
  if (!fragment) return;
  if (fs.statSync(local).isDirectory()) local = path.join(local, 'README.md');
  if (!fs.existsSync(local)) return 'anchor target has no README.md';
  const content = fs.readFileSync(local, 'utf8');
  if (/\.md$/i.test(local)) {
    if (!markdownAnchors(content).has(fragment)) return `missing anchor #${fragment}`;
  } else {
    const lines = fragment.match(/^L([1-9]\d*)(?:-L([1-9]\d*))?$/);
    const count = content.trimEnd().split(/\r?\n/).length;
    if (!lines || Number(lines[1]) > count || (lines[2] && (Number(lines[2]) < Number(lines[1]) || Number(lines[2]) > count))) {
      return `invalid source anchor #${fragment}`;
    }
  }
}

const marketing = /\b(?:seamless|robust|leverage|cutting-edge|state-of-the-art|effortless|powerful|delve|game-changing|revolutionary)\b/gi;

export function proseFindings(markdown) {
  const display = withoutFences(markdown)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}\[[^\]]+\]:.*$/gm, '').replace(/<[^>]*>/g, '');
  const text = display.replace(/`[^`\n]*`/g, '');
  const violations = [];
  for (const match of text.matchAll(marketing)) {
    violations.push({ word: match[0], line: text.slice(0, match.index).split('\n').length });
  }
  const sentences = [];
  for (const match of display.matchAll(/[^\n]+(?:\n(?!\s*\n|\s*(?:[-*+] |\d+\. ))[^\n]+)*/g)) {
    const paragraph = match[0];
    if (/^\s*(?:#|\|)/.test(paragraph)) continue;
    const joined = paragraph.replace(/\n/g, ' ').replace(/^(\s*)(?:[-*+] |\d+\. )/, marker => ' '.repeat(marker.length));
    // Split only at punctuation followed by whitespace/end, preserving decimal
    // numbers and filenames. This is an advisory heuristic, not a grammar lint.
    for (const segment of joined.matchAll(/\S[\s\S]*?(?:[.!?](?=\s|$)|$)/g)) {
      const sentence = segment[0].trim();
      const words = sentence.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
      if (words.length) sentences.push({ words: words.length, sentence, line: display.slice(0, match.index + segment.index).split('\n').length });
    }
  }
  return { violations, sentences };
}
