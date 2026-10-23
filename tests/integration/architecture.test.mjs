import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('browser modules have no circular imports or dependencies on server code', async () => {
  const graph = new Map();
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      if (!/\.(js|mjs)$/.test(file)) continue;
      const code = await readFile(file, 'utf8');
      const imports = [...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(
        ([, specifier]) => {
          assert.ok(
            specifier.startsWith('.'),
            `Browser dependency must be explicit: ${file}: ${specifier}`,
          );
          const target = path.resolve(path.dirname(file), specifier);
          assert.ok(
            target.startsWith(path.join(root, 'src/client') + path.sep),
            `Client imports server code: ${file}`,
          );
          return target;
        },
      );
      graph.set(file, imports);
    }
  }
  await walk(path.join(root, 'src/client'));
  const done = new Set();
  function visit(file, ancestors = []) {
    assert.ok(
      !ancestors.includes(file),
      `Circular import: ${[...ancestors, file].map((f) => path.relative(root, f)).join(' -> ')}`,
    );
    if (done.has(file)) return;
    assert.ok(graph.has(file), `Missing browser module: ${file}`);
    for (const dependency of graph.get(file))
      visit(dependency, [...ancestors, file]);
    done.add(file);
  }
  for (const file of graph.keys()) visit(file);
});
