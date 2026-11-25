import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const testsDir = resolve(rootDir, 'tests');

const entryPoints = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => join(testsDir, name));

if (entryPoints.length === 0) {
  console.error('Không tìm thấy tệp *.test.ts trong thư mục tests/.');
  process.exit(1);
}

const cacheRoot = resolve(rootDir, 'node_modules', '.cache');
mkdirSync(cacheRoot, { recursive: true });
const outDir = mkdtempSync(join(cacheRoot, 'ofu-unit-tests-'));

try {
  await esbuild.build({
    entryPoints,
    outdir: outDir,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    packages: 'external',
    outExtension: { '.js': '.mjs' },
    alias: {
      '@': resolve(rootDir, 'src'),
    },
    define: {
      'import.meta.env.DEV': 'true',
      'import.meta.env.PROD': 'false',
      'import.meta.env.VITE_API_URL': '""',
    },
    logLevel: 'warning',
  });

  const builtFiles = entryPoints.map((file) => {
    const base = file.slice(testsDir.length + 1).replace(/\.ts$/, '.mjs');
    return join(outDir, base);
  });

  const result = spawnSync(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', '--test', ...builtFiles],
    {
      cwd: rootDir,
      stdio: 'inherit',
    },
  );

  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
