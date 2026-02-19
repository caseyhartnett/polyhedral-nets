import fs from 'node:fs';
import path from 'node:path';

// Guard against accidental large-client-bundle regressions.
// Threshold can be tuned by CI env var without changing the script.
const root = process.cwd();
const targetDir = path.join(root, 'apps/web/.svelte-kit/output/client/_app/immutable');
const budgetBytes = Number(process.env.CLIENT_BUNDLE_BUDGET_BYTES ?? 450_000);

if (!fs.existsSync(targetDir)) {
  console.error(`Missing client build output directory: ${targetDir}`);
  process.exit(1);
}

const candidates = listJsFiles(targetDir);
if (candidates.length === 0) {
  console.error(`No client JS files found under: ${targetDir}`);
  process.exit(1);
}

const withSizes = candidates.map((filePath) => ({
  filePath,
  size: fs.statSync(filePath).size
}));
// Fail on the largest emitted JS asset as a simple and stable budget proxy.
withSizes.sort((a, b) => b.size - a.size);

const largest = withSizes[0];
const rel = path.relative(root, largest.filePath);
const kb = (largest.size / 1024).toFixed(1);
const budgetKb = (budgetBytes / 1024).toFixed(1);

if (largest.size > budgetBytes) {
  console.error(
    `Client bundle budget exceeded: ${rel} is ${kb} KiB (budget ${budgetKb} KiB).`
  );
  process.exit(1);
}

console.log(`Client bundle budget check passed: largest file is ${rel} at ${kb} KiB.`);

function listJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}
