import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveGitHubPagesBasePath, resolveRouterMode } from './github-pages-config.js';

const basePath = resolveGitHubPagesBasePath();
const routerMode = resolveRouterMode({ deployTarget: 'github-pages' });

const sharedEnv = {
  ...process.env,
  VITE_DEPLOY_TARGET: 'github-pages',
  VITE_ROUTER_MODE: routerMode,
  VITE_APP_BASE_PATH: basePath,
};

const binDir = path.join(process.cwd(), 'node_modules', '.bin');
const tscCommand = path.join(binDir, process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const viteCommand = path.join(binDir, process.platform === 'win32' ? 'vite.cmd' : 'vite');

const commands = [
  [tscCommand, ['-b']],
  [viteCommand, ['build']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: sharedEnv,
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
