import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { renderShell } from '../../scripts/lib/render-shell.mjs';
test('delayed room score, events and goal effects cannot reveal the future; adjustment preserves the video and chat', async () => {
  const dom = new JSDOM(await renderShell(), {
    url: 'https://palermas.test/#sala',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.structuredClone = structuredClone;
  w.localStorage.setItem('palermas-score-delay', '30');
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  let now = 100000,
    score = 0;
  w.Date.now = () => now;
  const intervals = [];
  w.setInterval = (fn, ms) => {
    intervals.push({ fn, ms });
    return intervals.length;
  };
  const game = {
    id: '999',
    leagueId: 'bra.1',
    league: 'Brasileirão',
    state: 'in',
    date: '2026-11-01T20:00:00Z',
    clock: "30'",
    status: 'Ao vivo',
    home: { id: '3458', name: 'Athletico' },
    away: { id: '3456', name: 'Coritiba' },
    homeScore: 0,
    awayScore: 0,
  };
  w.fetch = async (url) =>
    Response.json(
      String(url).includes('room-game')
        ? { game }
        : String(url).includes('/match?')
          ? {
              game: { ...game, homeScore: score },
              events: score
                ? [
                    {
                      id: String(score),
                      type: 'goal',
                      clock: "30'",
                      label: 'Gol',
                      participants: ['Atacante'],
                      participantIds: ['7'],
                      teamId: '3458',
                    },
                  ]
                : [],
              lineups: [],
              statistics: [],
              checkedAt: new Date(now).toISOString(),
              source: 'ESPN',
            }
          : String(url).includes('/pulse')
            ? { moods: [], reactions: [], ranking: [] }
            : { state: 'unavailable' },
    );
  const bundle = await build({
    stdin: {
      contents:
        "import {initMiniplayer} from './src/client/features/room/miniplayer.js';import {initRoomMatch} from './src/client/features/room/match-context.js';import {initRoomPreferences} from './src/client/features/room/preferences.js';initRoomPreferences();initMiniplayer();initRoomMatch();",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
  });
  const flush = () => new Promise((r) => setTimeout(r, 25));
  const tick = () =>
    intervals.filter((i) => i.ms === 1000).forEach((i) => i.fn());
  try {
    d.querySelector('#page-sala').hidden = false;
    const video = d.querySelector('#local-video');
    video.srcObject = { stream: true };
    d.querySelector('#chat-text').value = 'Rascunho';
    w.eval(bundle.outputFiles[0].text);
    await flush();
    assert.match(
      d.querySelector('#room-score').textContent,
      /Sincronizando|agendado/i,
    );
    assert.equal(d.querySelector('#room-event-timeline').hidden, true);
    now += 30000;
    tick();
    assert.match(d.querySelector('#room-score').textContent, /0 × 0/);
    score = 1;
    await intervals.find((i) => i.ms === 15000).fn();
    await flush();
    w.dispatchEvent(new w.Event('football:games'));
    assert.match(d.querySelector('#room-score').textContent, /0 × 0/);
    assert.equal(d.querySelector('#room-goal-effect').hidden, true);
    assert.match(d.querySelector('#miniplayer-score').textContent, /0 × 0/);
    now += 30000;
    tick();
    assert.match(d.querySelector('#room-score').textContent, /1 × 0/);
    assert.match(d.querySelector('#miniplayer-score').textContent, /1 × 0/);
    assert.equal(d.querySelector('#room-goal-effect').hidden, false);
    score = 2;
    await intervals.find((i) => i.ms === 15000).fn();
    await flush();
    d.querySelector('#room-delay-reset').click();
    assert.match(d.querySelector('#room-score').textContent, /2 × 0/);
    assert.equal(d.querySelector('#room-goal-effect').hidden, true);
    assert.equal(d.querySelector('#local-video'), video);
    assert.equal(video.srcObject.stream, true);
    assert.equal(d.querySelector('#chat-text').value, 'Rascunho');
  } finally {
    w.close();
  }
});
