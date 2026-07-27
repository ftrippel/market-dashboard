import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const target = process.argv[2] ?? 'pages';
const validTargets = new Set(['pages', 'cloudflare']);
if (!validTargets.has(target)) {
  console.error(`Unknown deployment target: ${target}`);
  console.error('Expected one of: pages, cloudflare');
  process.exit(1);
}

const required = ['index.html', 'data.json', '.nojekyll', 'favicon.png', '_headers'];
const sourceMapDirective = /(?:\/\/|\/\*)[#@]\s*sourceMappingURL\s*=/i;

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

for (const file of required) {
  const path = join(dist, file);
  if (!existsSync(path)) {
    console.error(`Missing required file: ${path}`);
    process.exit(1);
  }
}

const index = readFileSync(join(dist, 'index.html'), 'utf8');
if (target === 'pages' && !index.includes('/market-dashboard/assets/')) {
  console.error('index.html is missing the GitHub Pages asset base path (/market-dashboard/)');
  process.exit(1);
}
if (target === 'cloudflare' && index.includes('/market-dashboard/')) {
  console.error('index.html contains the GitHub Pages base path in the Cloudflare build');
  process.exit(1);
}
if (target === 'cloudflare' && !index.includes('/assets/')) {
  console.error('index.html is missing the root-relative Cloudflare asset path (/assets/)');
  process.exit(1);
}

const distFiles = listFiles(dist);
const sourceMapFiles = distFiles.filter((path) => path.toLowerCase().endsWith('.map'));
const filesWithSourceMapDirectives = distFiles.filter((path) => {
  if (!/\.(?:css|html|js|mjs|cjs)$/i.test(path)) return false;
  return sourceMapDirective.test(readFileSync(path, 'utf8'));
});

if (sourceMapFiles.length > 0 || filesWithSourceMapDirectives.length > 0) {
  console.error('Production source maps are not allowed in dist/.');
  for (const path of sourceMapFiles) {
    console.error(`  Source map file: ${path}`);
  }
  for (const path of filesWithSourceMapDirectives) {
    console.error(`  Source map directive: ${path}`);
  }
  process.exit(1);
}

console.log(`dist/ looks good for ${target === 'pages' ? 'GitHub Pages' : 'Cloudflare Workers'}:`);
for (const file of required) {
  console.log(`  ✓ ${file}`);
}
console.log('  ✓ no production source maps');
