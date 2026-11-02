import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
test('matchday keeps video and chat, highlights only new substitutions, counts red cards and clears the old game', async () => {
  const dom = new JSDOM(
    await readFile('src/client/features/room/room.html', 'utf8'),
    {
      url: 'https://palermas.test/#sala',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  );
  const w = dom.window,
    d = w.document;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.fetch = async (url) =>
    Response.json(
      String(url).includes('pulse')
        ? { moods: [], reactions: [], ranking: [] }
        : { form: [] },
    );
  d.querySelector('#page-sala').hidden = false;
  const video = d.querySelector('#local-video');
  video.srcObject = { testStream: true };
  d.querySelector('#chat-text').value = 'Meu rascunho';
  for (const side of ['home', 'away'])
    d.querySelector('#room-' + side + '-lineup').innerHTML =
      '<header class="football-team-heading"><div></div></header>' +
      ['1', '2', '3']
        .map((id) => `<button data-room-player="${side}/${id}"></button>`)
        .join('');
  const bundle = await build({
    stdin: {
      contents: "export * from './src/client/features/room/matchday.js'",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'matchday',
  });
  try {
    w.eval(bundle.outputFiles[0].text);
    w.matchday.initMatchday();
    const game = {
      id: '99',
      leagueId: 'bra.1',
      home: { id: 'home', name: 'Casa' },
      away: { id: 'away', name: 'Fora' },
      date: '2026-10-30T20:00:00Z',
      state: 'in',
      status: 'First Half',
      homeScore: 0,
      awayScore: 0,
    };
    const data = {
      game,
      events: [],
      statistics: [],
      lineups: ['home', 'away'].map((side) => ({
        team: game[side],
        players: [
          { id: '1', name: 'Titular', starter: true },
          { id: '2', name: 'Reserva', starter: false },
          { id: '3', name: 'Outro', starter: true },
        ],
      })),
    };
    w.matchday.updateMatchday(data);
    const event = {
      id: 'sub1',
      type: 'substitution',
      teamId: 'home',
      period: 1,
      seconds: 100,
      clock: "2'",
      participantIds: ['2', '1'],
      participants: ['Reserva', 'Titular'],
    };
    data.events.push(event, {
      id: 'red1',
      type: 'red-card',
      teamId: 'home',
      participantIds: ['3'],
      participants: ['Outro'],
      clock: "3'",
      label: 'Vermelho',
    });
    w.matchday.updateMatchday(data);
    assert.ok(
      d
        .querySelector('[data-room-player="home/2"]')
        .classList.contains('player-entered'),
    );
    assert.ok(
      d
        .querySelector('[data-room-player="home/1"]')
        .classList.contains('player-left'),
    );
    assert.ok(
      d
        .querySelector('[data-room-player="home/3"]')
        .classList.contains('player-sent-off'),
    );
    assert.match(
      d.querySelector('#room-home-lineup .field-count').textContent,
      /1 em campo/,
    );
    assert.equal(d.querySelector('#room-break-summary').hidden, true);
    data.game.status = 'Halftime';
    w.matchday.updateMatchday(data);
    assert.equal(d.querySelector('#room-break-summary').hidden, false);
    assert.equal(
      d.querySelector('#break-heading').textContent,
      'Resumo do intervalo',
    );
    assert.equal(d.querySelector('#local-video'), video);
    assert.equal(video.srcObject.testStream, true);
    assert.equal(d.querySelector('#chat-text').value, 'Meu rascunho');
    data.game.state = 'post';
    w.matchday.updateMatchday(data);
    assert.equal(d.querySelector('#break-heading').textContent, 'Apito final');
    w.matchday.resetMatchday();
    assert.equal(d.querySelector('#room-pulse'), null);
    assert.equal(d.querySelector('#room-pregame').hidden, true);
    w.matchday.updateMatchday(data);
    assert.equal(
      d
        .querySelector('[data-room-player="home/2"]')
        .classList.contains('player-entered'),
      false,
    );
  } finally {
    w.close();
  }
});
