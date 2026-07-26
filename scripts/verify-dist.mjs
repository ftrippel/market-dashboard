import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const required = ['index.html', 'data.json', '.nojekyll', 'favicon.png'];
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
if (!index.includes('/market-dashboard/')) {
  console.error('index.html is missing the GitHub Pages base path (/market-dashboard/)');
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

console.log('dist/ looks good for GitHub Pages:');
for (const file of required) {
  console.log(`  ✓ ${file}`);
}
console.log('  ✓ no production source maps');
