import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bundle = await build({
  stdin: {
    contents:
      "export { requestJSON } from './src/client/shared/request.js'; export { showError, initErrorReporting } from './src/client/shared/feedback.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'errorUI',
});
function setup() {
  const dom = new JSDOM('', {
    url: 'https://site.example',
    runScripts: 'outside-only',
  });
  dom.window.AbortSignal.timeout = () => undefined;
  dom.window.eval(bundle.outputFiles[0].text);
  return dom;
}

test('API errors show a safe popup with HTTP code and reference, and polling backs off', async () => {
  const dom = setup();
  try {
    const { window } = dom;
    let calls = 0;
    window.fetch = async () => {
      calls++;
      return Response.json(
        { error: 'service_outdated', requestId: 'test-reference' },
        { status: 503 },
      );
    };
    for (let i = 0; i < 5; i++)
      await assert.rejects(window.errorUI.requestJSON('/api/group/chat'));
    assert.equal(calls, 1);
    const popup = window.document.querySelector('[role=alert]');
    assert.match(popup.textContent, /Chat/);
    assert.match(popup.textContent, /HTTP 503/);
    assert.match(popup.textContent, /test-reference/);
    assert.equal(window.document.querySelectorAll('[role=alert]').length, 1);
    popup.querySelector('button').click();
    assert.equal(window.document.querySelectorAll('[role=alert]').length, 0);
    window.fetch = async () => Response.json({ messages: [] });
    // User writes remain available even while background reads are backing off.
    await window.errorUI.requestJSON('/api/group/chat', { method: 'POST' });
    await window.errorUI.requestJSON('/api/group/chat');
  } finally {
    dom.window.close();
  }
});

test('popup text cannot inject markup and duplicate failures are grouped', () => {
  const dom = setup();
  try {
    const { window } = dom;
    window.errorUI.showError('<img src=x onerror=alert(1)>');
    window.errorUI.showError('<img src=x onerror=alert(1)>');
    assert.equal(window.document.querySelector('img'), null);
    assert.equal(window.document.querySelectorAll('[role=alert]').length, 1);
    for (let i = 0; i < 8; i++)
      window.errorUI.showError('Different error ' + i);
    assert.equal(window.document.querySelectorAll('[role=alert]').length, 3);
  } finally {
    dom.window.close();
  }
});

test('network failures, invalid JSON and uncaught errors also produce popups', async () => {
  const dom = setup();
  try {
    const { window } = dom;
    window.fetch = async () => {
      throw Error('connection lost');
    };
    await assert.rejects(window.errorUI.requestJSON('/api/group/chat'));
    assert.match(window.document.body.textContent, /network_error/);
    window.fetch = async () =>
      new Response('<html>Bad gateway</html>', { status: 502 });
    await assert.rejects(window.errorUI.requestJSON('/api/group/room-game'));
    assert.match(window.document.body.textContent, /HTTP 502/);
    window.errorUI.initErrorReporting();
    window.dispatchEvent(
      new window.ErrorEvent('error', {
        error: Error('private internal detail'),
      }),
    );
    assert.match(window.document.body.textContent, /javascript_error/);
    assert.ok(
      !window.document.body.textContent.includes('private internal detail'),
    );
  } finally {
    dom.window.close();
  }
});
