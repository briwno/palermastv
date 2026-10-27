import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { renderShell } from '../../scripts/lib/render-shell.mjs';
import { handleSite } from '../../src/server/http/handler.mjs';
import { session } from '../../src/server/auth/session.mjs';
import { PalermasRoom } from '../../services/signaling/worker.mjs';

const bundle = await build({
  stdin: {
    contents:
      "import {initChat} from './src/client/features/room/chat.js'; import {initRoomMatch} from './src/client/features/room/match-context.js'; initChat(); initRoomMatch();",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
const game = {
  id: '90123',
  leagueId: 'bra.1',
  date: '2026-10-26T20:00:00Z',
  state: 'in',
  home: { id: '3458', name: 'Athletico' },
  away: { id: '3456', name: 'Coritiba' },
  league: 'Brasileirão',
};

test('live chat and match updates appear once and survive an older pending read', async () => {
  const dom = new JSDOM(await renderShell(), {
    url: 'https://site.example/#sala',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.AbortSignal.timeout = () => undefined;
  w.document.querySelector('#page-sala').hidden = false;
  let releaseRoom, releaseChat;
  w.fetch = async (url) =>
    new Promise((resolve) => {
      if (String(url).endsWith('room-game'))
        releaseRoom = () => resolve(Response.json({ game: null }));
      else releaseChat = () => resolve(Response.json({ messages: [] }));
    });
  try {
    w.eval(bundle.outputFiles[0].text);
    await tick();
    const message = {
      id: 'live-1',
      name: 'Amigo',
      text: 'Chegou ao vivo',
      createdAt: Date.now(),
    };
    for (let i = 0; i < 2; i++)
      w.dispatchEvent(
        new w.CustomEvent('palermas:chat-message', { detail: { message } }),
      );
    w.dispatchEvent(
      new w.CustomEvent('palermas:room-game-update', { detail: { game } }),
    );
    releaseRoom();
    releaseChat();
    await tick();
    assert.equal(w.document.querySelectorAll('.chat-message').length, 1);
    assert.match(
      w.document.querySelector('#room-chat-messages').textContent,
      /Chegou ao vivo/,
    );
    assert.match(
      w.document.querySelector('#room-linked-title').textContent,
      /Athletico/,
    );
    assert.equal(w.document.querySelector('#room-game-save').disabled, true);
    w.dispatchEvent(
      new w.CustomEvent('palermas:room-game-update', {
        detail: { game: null },
      }),
    );
    assert.match(
      w.document.querySelector('#room-linked-title').textContent,
      /Nenhuma partida/,
    );
  } finally {
    w.close();
  }
});

test('signed-in user sends chat and publisher assigns, switches and clears a match through the site and real Worker handlers', async () => {
  const env = {
    SITE_PASSWORD: 'test-site-password',
    ROOM_CODE: 'test-internal-service-credential',
    SIGNALING_URL: 'https://signal.example',
  };
  const values = new Map();
  const updates = [];
  globalThis.WebSocketRequestResponsePair = class {};
  const room = new PalermasRoom(
    {
      getWebSockets: () => [],
      setWebSocketAutoResponse() {},
      blockConcurrencyWhile: (fn) => fn(),
      storage: {
        get: async (key) => structuredClone(values.get(key)),
        put: async (key, value) => values.set(key, structuredClone(value)),
        list: async () => new Map(),
      },
    },
    env,
  );
  const resumeToken = 'test_publisher_resume_token_long_enough';
  const resumeKey = Buffer.from(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(resumeToken),
    ),
  ).toString('hex');
  const ws = { send: (raw) => updates.push(JSON.parse(raw)) };
  room.members.set(ws, { id: 'host', publishing: true, resumeKey });
  const authCookie = 'palermas_session=' + (await session(env));
  const dom = new JSDOM(await renderShell(), {
    url: 'https://site.example/#sala',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.AbortSignal.timeout = () => undefined;
  w.document.querySelector('#page-sala').hidden = false;
  const upstream = async (url, options) => {
    if (url === 'https://signal.example/group')
      return room.fetch(new Request(url, options));
    if (String(url).includes('/summary?'))
      return Response.json({
        header: {
          id: new URL(url).searchParams.get('event'),
          competitions: [
            {
              date: game.date,
              status: { type: { state: 'in' } },
              competitors: [
                {
                  homeAway: 'home',
                  team: { id: '3458', displayName: 'Athletico' },
                  score: '0',
                },
                {
                  homeAway: 'away',
                  team: { id: '3456', displayName: 'Coritiba' },
                  score: '0',
                },
              ],
            },
          ],
        },
      });
    throw Error('Unexpected upstream URL');
  };
  w.fetch = async (url, options = {}) =>
    handleSite(
      new Request(new URL(url, w.location.origin), {
        ...options,
        headers: {
          ...options.headers,
          Origin: w.location.origin,
          Cookie: authCookie,
        },
      }),
      env,
      {},
      upstream,
    );
  try {
    w.eval(bundle.outputFiles[0].text);
    await tick();
    const input = w.document.querySelector('#chat-text');
    input.value = 'Golaço!';
    input.dispatchEvent(new w.Event('input'));
    input.dispatchEvent(
      new w.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    await tick();
    assert.equal(input.value, '');
    assert.match(
      w.document.querySelector('#room-chat-messages').textContent,
      /Golaço!/,
    );
    assert.equal(updates.filter((u) => u.type === 'chat-message').length, 1);
    assert.equal(w.document.querySelectorAll('.chat-message').length, 1);
    w.dispatchEvent(
      new w.CustomEvent('palermas:room', {
        detail: { isPublisher: true, resumeToken },
      }),
    );
    w.dispatchEvent(
      new w.CustomEvent('palermas:roomselection', { detail: game }),
    );
    w.document.querySelector('#room-game-save').click();
    await tick();
    assert.equal(values.get('room-game').id, game.id);
    await tick();
    assert.equal(w.document.querySelector('#room-match-details').hidden, false);
    assert.match(
      w.document.querySelector('#room-match-details').textContent,
      /Escalações/,
    );
    assert.match(
      w.document.querySelector('#room-match-details').textContent,
      /Últimos lances/,
    );
    assert.ok(
      w.document
        .querySelector('#room-linked-title')
        .closest('.room-match-header'),
    );
    assert.equal(
      w.document
        .querySelector('#player')
        .nextElementSibling.getAttribute('aria-label'),
      'Central resumida da partida',
    );
    assert.match(
      w.document.querySelector('#room-linked-title').textContent,
      /Athletico/,
    );
    const next = { ...game, id: '90124' };
    w.dispatchEvent(
      new w.CustomEvent('palermas:roomselection', { detail: next }),
    );
    assert.equal(
      w.document.querySelector('#room-game-select').value,
      'bra.1/90124',
    );
    w.document.querySelector('#room-game-save').click();
    await tick();
    assert.equal(values.get('room-game').id, '90124');
    w.document.querySelector('#room-game-clear').click();
    await tick();
    assert.equal(values.get('room-game'), null);
    assert.equal(
      updates.filter((u) => u.type === 'room-game-update').length,
      3,
    );
    assert.equal(w.document.querySelectorAll('.site-error-popup').length, 0);
    // A viewer cannot assign a game even with a valid site session and player identity.
    room.members.get(ws).publishing = false;
    w.document.querySelector('#room-game-save').click();
    await tick();
    assert.equal(values.get('room-game'), null);
    assert.match(
      w.document.querySelector('#room-game-feedback').textContent,
      /Só quem/,
    );
  } finally {
    w.close();
  }
});

test('a delayed chat read cannot erase a newly acknowledged message and failed sends keep the draft', async () => {
  const dom = new JSDOM(await renderShell(), {
    url: 'https://site.example/#sala',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.AbortSignal.timeout = () => undefined;
  w.document.querySelector('#page-sala').hidden = false;
  let releaseRead,
    fail = false;
  w.fetch = async (url, options = {}) => {
    if (String(url).endsWith('room-game')) return Response.json({ game: null });
    if (!options.method)
      return new Promise(
        (resolve) =>
          (releaseRead = () => resolve(Response.json({ messages: [] }))),
      );
    if (fail)
      return Response.json({ error: 'group_unavailable' }, { status: 502 });
    return Response.json({
      message: {
        id: 'new',
        name: 'Palerma',
        text: 'Mensagem nova',
        createdAt: Date.now(),
      },
    });
  };
  try {
    w.eval(bundle.outputFiles[0].text);
    await tick();
    const input = w.document.querySelector('#chat-text');
    const form = w.document.querySelector('#room-chat-form');
    input.value = 'Mensagem nova';
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await tick();
    releaseRead();
    await tick();
    assert.match(
      w.document.querySelector('#room-chat-messages').textContent,
      /Mensagem nova/,
    );
    fail = true;
    input.value = 'Não perder este rascunho';
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await tick();
    assert.equal(input.value, 'Não perder este rascunho');
    assert.match(
      w.document.querySelector('#chat-status').textContent,
      /indisponível/,
    );
    assert.equal(form.querySelector('button').disabled, false);
  } finally {
    w.close();
  }
});
