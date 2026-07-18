import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const required = ['index.html', 'data.json', '.nojekyll', 'favicon.png'];

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

console.log('dist/ looks good for GitHub Pages:');
for (const file of required) {
  console.log(`  ✓ ${file}`);
}
