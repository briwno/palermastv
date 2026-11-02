import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

test('room picker filters dates, live games and clubs, keeps selection and discards stale request results', async () => {
  const dom = new JSDOM(
    await readFile('src/client/features/room/room.html', 'utf8'),
    { url: 'https://palermas.test/#sala', runScripts: 'outside-only' },
  );
  const w = dom.window,
    d = w.document;
  const bundle = await build({
    stdin: {
      contents:
        "export { initGamePicker } from './src/client/features/room/game-picker.js'",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'pickerTest',
  });
  const game = (id, home, state = 'pre', day = '2026-11-02') => ({
    id,
    leagueId: 'bra.1',
    league: 'Brasileirão Série A',
    date: day + 'T20:00:00Z',
    day,
    timeValid: true,
    state,
    home: {
      id: home,
      name: home === '3458' ? 'Athletico-PR' : 'Grêmio',
      logo: 'https://example.com/crest.png',
    },
    away: { id: '2', name: 'São Paulo' },
    homeScore: 2,
    awayScore: 1,
  });
  let resolveOld,
    calls = 0;
  w.fetch = async (url) => {
    calls++;
    if (String(url).includes('2026-11-03'))
      return new Promise((resolve) => {
        resolveOld = () =>
          resolve(
            Response.json({ games: [game('old', '3', 'post', '2026-11-03')] }),
          );
      });
    return Response.json({
      games: [game('cap', '3458'), game('live', '3', 'in')],
    });
  };
  try {
    w.eval(bundle.outputFiles[0].text);
    let picker;
    const update = () => {
      const list = picker.games();
      const select = d.querySelector('#room-game-select'),
        previous = select.value;
      select.innerHTML =
        '<option value=""></option>' +
        list
          .map(
            (g) =>
              `<option value="${g.leagueId}/${g.id}">${g.home.name}</option>`,
          )
          .join('');
      select.value = previous;
      picker.update(list, null);
    };
    picker = w.pickerTest.initGamePicker(update);
    const date = d.querySelector('#room-game-date');
    date.value = '2026-11-02';
    date.dispatchEvent(new w.Event('change'));
    await new Promise(setImmediate);
    assert.equal(d.querySelectorAll('[data-room-pick]').length, 2);
    assert.equal(
      d.querySelector('[data-room-pick]').dataset.roomPick,
      'bra.1/live',
    );
    d.querySelector('[data-room-pick="bra.1/cap"]').click();
    assert.equal(d.querySelector('#room-game-select').value, 'bra.1/cap');
    d.querySelector('[data-room-game-filter="live"]').click();
    assert.equal(d.querySelectorAll('[data-room-pick]').length, 1);
    assert.match(
      d.querySelector('#room-game-preview').textContent,
      /Athletico-PR/,
    );
    d.querySelector('[data-room-game-filter="clubs"]').click();
    assert.equal(
      d.querySelector('[data-room-pick]').getAttribute('aria-pressed'),
      'true',
    );
    const search = d.querySelector('#room-game-search');
    search.value = 'sao paulo';
    search.dispatchEvent(new w.Event('input'));
    assert.equal(d.querySelectorAll('[data-room-pick]').length, 1);
    search.value = 'impossível';
    search.dispatchEvent(new w.Event('input'));
    assert.match(
      d.querySelector('#room-game-list').textContent,
      /Nenhuma partida encontrada/,
    );
    search.value = '';
    search.dispatchEvent(new w.Event('input'));
    date.value = '2026-11-03';
    date.dispatchEvent(new w.Event('change'));
    await new Promise(setImmediate);
    date.value = '2026-11-02';
    date.dispatchEvent(new w.Event('change'));
    await new Promise(setImmediate);
    resolveOld();
    await new Promise(setImmediate);
    assert.equal(date.value, '2026-11-02');
    assert.equal(d.querySelectorAll('[data-room-pick]').length, 1);
    assert.ok(calls >= 3);
    date.dispatchEvent(new w.Event('change'));
    await new Promise(setImmediate);
    assert.equal(
      d.querySelector('#room-game-list').getAttribute('aria-busy'),
      'false',
    );
    assert.equal(d.querySelectorAll('[data-room-pick]').length, 1);
  } finally {
    w.close();
  }
});
