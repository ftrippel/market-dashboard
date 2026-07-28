import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fileEnv = loadEnv('production', projectRoot, '');
const deploymentEnv = { ...fileEnv, ...process.env };
const allowedOrigins = deploymentEnv.ALLOWED_ORIGINS?.trim();
const workerName = deploymentEnv.CLOUDFLARE_WORKER_NAME?.trim();

if (!allowedOrigins) {
  console.error('ALLOWED_ORIGINS must be set in .env or the shell before deploying.');
  process.exit(1);
}

const wranglerPath = resolve(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
const commandArguments = process.argv.slice(2);
const hasWorkerNameArgument = commandArguments.some(
  (argument) => argument === '--name' || argument.startsWith('--name='),
);
const wranglerArguments = ['deploy', ...commandArguments];
if (existsSync(resolve(projectRoot, '.env'))) {
  wranglerArguments.push('--env-file', '.env');
}
if (workerName && !hasWorkerNameArgument) {
  wranglerArguments.push('--name', workerName);
}
wranglerArguments.push('--var', `ALLOWED_ORIGINS:${allowedOrigins}`);

const result = spawnSync(
  process.execPath,
  [wranglerPath, ...wranglerArguments],
  {
    cwd: projectRoot,
    env: deploymentEnv,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
