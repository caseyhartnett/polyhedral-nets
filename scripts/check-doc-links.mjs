import fs from 'node:fs';
import path from 'node:path';

// Lightweight local-link checker for README/docs.
// Intentionally ignores external URLs to avoid network-dependent CI failures.
const root = process.cwd();
const filesToScan = [path.join(root, 'README.md'), ...listMarkdownFiles(path.join(root, 'docs'))];
const broken = [];

for (const filePath of filesToScan) {
  const content = fs.readFileSync(filePath, 'utf8');
  const dir = path.dirname(filePath);
  const linkRegex = /\[[^\]]*]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkRegex)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('#')) continue;
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('mailto:')) continue;

    // Treat foo.md#section as a file existence check against foo.md.
    const withoutAnchor = raw.split('#')[0];
    if (!withoutAnchor || withoutAnchor.startsWith('<')) continue;

    const target = path.resolve(dir, withoutAnchor);
    if (!fs.existsSync(target)) {
      broken.push({
        source: path.relative(root, filePath),
        target: raw
      });
    }
  }
}

if (broken.length > 0) {
  console.error('Broken markdown links found:');
  for (const item of broken) {
    console.error(`- ${item.source}: ${item.target}`);
  }
  process.exit(1);
}

console.log(`Checked ${filesToScan.length} markdown files: no broken local links.`);

function listMarkdownFiles(startDir) {
  if (!fs.existsSync(startDir)) {
    return [];
  }
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(nextPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(nextPath);
    }
  }
  return files;
}
