import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/client/features/room/diagnostics.js'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'streamDiagnostics',
});

test('local diagnostics remain bounded and survive reinitialization in the same tab', () => {
  const dom = new JSDOM('', {
    url: 'https://example.test',
    runScripts: 'outside-only',
  });
  try {
    const { window } = dom;
    window.eval(bundle.outputFiles[0].text);
    let events = 0;
    window.addEventListener('palermas:diagnostic', () => events++);
    for (let i = 0; i < 205; i++)
      window.streamDiagnostics.recordDiagnostic('sample', { sequence: i });
    assert.equal(events, 205);
    assert.equal(window.streamDiagnostics.diagnostics.length, 200);
    assert.equal(window.streamDiagnostics.diagnostics[0].sequence, 5);
    window.eval(bundle.outputFiles[0].text);
    assert.equal(window.streamDiagnostics.diagnostics.length, 200);
    assert.equal(window.streamDiagnostics.diagnostics.at(-1).sequence, 204);
  } finally {
    dom.window.close();
  }
});

test('unavailable browser storage does not interrupt streaming diagnostics', () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  try {
    dom.window.eval(bundle.outputFiles[0].text);
    assert.doesNotThrow(() =>
      dom.window.streamDiagnostics.recordDiagnostic('network-offline'),
    );
    assert.equal(dom.window.streamDiagnostics.diagnostics.length, 1);
  } finally {
    dom.window.close();
  }
});
