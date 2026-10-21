import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// TypeScript does not remove outputs for deleted source files. Clear only this
// generated directory so removed database writers cannot survive a rebuild.
rmSync(new URL('../../dist/tools/data-import/', import.meta.url), { recursive: true, force: true });
const result = spawnSync('bunx', ['tsc', '-p', 'tools/data-import/tsconfig.build.json'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
