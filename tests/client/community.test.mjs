import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { renderShell } from '../../scripts/lib/render-shell.mjs';
import { webcrypto } from 'node:crypto';
const miniBundle = await build({
  stdin: {
    contents:
      "import {initMiniplayer} from './src/client/features/room/miniplayer.js'; import {initNavigation} from './src/client/shell/navigation.js'; initNavigation(); initMiniplayer();",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
});
test('miniplayer keeps the same video and stream through navigation and restores its position', async () => {
  const dom = new JSDOM(await renderShell(), {
    url: 'https://site.example/#sala',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.scrollTo = () => {};
  try {
    w.eval(miniBundle.outputFiles[0].text);
    const video = w.document.querySelector('#local-video'),
      player = w.document.querySelector('#player'),
      parent = player.parentElement;
    video.play = async () => {};
    video.srcObject = { stream: 'same-live-stream' };
    w.document.querySelector('[data-page="jogos"]').click();
    assert.equal(w.document.querySelector('#miniplayer').hidden, false);
    assert.equal(player.parentElement.id, 'miniplayer-video');
    assert.equal(w.document.querySelector('#local-video'), video);
    assert.equal(video.srcObject.stream, 'same-live-stream');
    w.document.querySelector('#miniplayer-return').click();
    assert.equal(player.parentElement, parent);
    assert.equal(w.document.querySelector('#miniplayer').hidden, true);
    w.document.querySelector('[data-page="clubes"]').click();
    video.srcObject = null;
    w.dispatchEvent(
      new w.CustomEvent('palermas:media', { detail: { active: false } }),
    );
    assert.equal(w.document.querySelector('#miniplayer').hidden, true);
    assert.equal(player.parentElement, parent);
  } finally {
    w.close();
  }
});
test('chat displays untrusted text as text instead of markup', async () => {
  const result = await build({
    stdin: {
      contents:
        "import {initChat} from './src/client/features/room/chat.js'; initChat();",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
  });
  const dom = new JSDOM(await renderShell(), {
    url: 'https://site.example/#sala',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.document.querySelector('#page-sala').hidden = false;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.fetch = async () =>
    Response.json({
      messages: [
        {
          id: 'x',
          name: '<img src=x onerror=alert(1)>',
          avatar: '⚽',
          text: '<script>bad()</script>',
          createdAt: Date.now(),
        },
      ],
    });
  try {
    w.eval(result.outputFiles[0].text);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const box = w.document.querySelector('#room-chat-messages');
    assert.equal(box.querySelector('script'), null);
    assert.equal(box.querySelector('img'), null);
    assert.ok(box.textContent.includes('<script>bad()</script>'));
  } finally {
    w.close();
  }
});
