import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));

function prepare() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/prepare-assets.mjs'], {
      cwd: root,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Asset build exited with ${code}`)),
    );
  });
}

await prepare();
const next = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'dev', ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: 'inherit',
  },
);

let timer;
let building = false;
let pending = false;
async function rebuild() {
  if (building) return;
  building = true;
  while (pending) {
    pending = false;
    try {
      await prepare();
      console.log('Interface recompilada. Atualize a página.');
    } catch (error) {
      console.error(error.message);
    }
  }
  building = false;
}
const watcher = watch(
  new URL('../src/client/', import.meta.url),
  { recursive: true },
  () => {
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 100);
  },
);
function cleanup() {
  watcher.close();
  clearTimeout(timer);
  next.kill();
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
next.on('error', (error) => {
  console.error(error.message);
  cleanup();
  process.exitCode = 1;
});
next.on('exit', (code) => {
  watcher.close();
  clearTimeout(timer);
  process.exitCode = code || 0;
});
