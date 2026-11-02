import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { renderShell } from '../../scripts/lib/render-shell.mjs';
test('bolao steppers, presets and filters preserve a draft; save targets the selected match and a server lock removes its form', async () => {
  const dom = new JSDOM(await renderShell(), {
    url: 'https://palermas.test/#bolao',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window,
    d = w.document;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  const token = 'palermas_test_identity_1234567890123456';
  w.localStorage.setItem('palermas-player-token', token);
  const ownId = createHash('sha256').update(token).digest('hex');
  const game = {
    id: '201',
    leagueId: 'bra.1',
    league: 'Brasileirão',
    date: new Date(Date.now() + 3600000).toISOString(),
    state: 'pre',
    home: { id: '3458', name: 'Athletico' },
    away: { id: '3456', name: 'Coritiba' },
  };
  const ended = {
    ...game,
    id: '202',
    state: 'post',
    homeScore: 1,
    awayScore: 0,
  };
  let votes = [],
    locked = false;
  const sent = [];
  w.fetch = async (url, options = {}) => {
    if (String(url).includes('/games?'))
      return Response.json({ games: [game, ended] });
    if (String(url).includes('/ranking'))
      return Response.json({
        ranking: [],
        seasons: [],
        rounds: [],
        settled: 0,
      });
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      sent.push(body);
      votes = [
        {
          id: ownId,
          name: 'Palerma',
          home: body.home,
          away: body.away,
          points: null,
        },
      ];
      return Response.json({ ok: true });
    }
    return Response.json({
      votes,
      locked: locked || String(url).includes('id=202'),
      result: null,
    });
  };
  const bundle = await build({
    stdin: {
      contents:
        "import {initBolao} from './src/client/features/hub/bolao.js';initBolao();",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
  });
  const flush = () => new Promise((r) => setTimeout(r, 30));
  try {
    w.eval(bundle.outputFiles[0].text);
    w.dispatchEvent(
      new w.CustomEvent('palermas:navigate', { detail: { page: 'bolao' } }),
    );
    await flush();
    assert.equal(d.querySelector('#bolao-open-count').textContent, '1');
    let detail = d.querySelector('[data-bolao-game="bra.1/201"]');
    detail.open = true;
    await flush();
    detail.querySelector('[data-score-step="home:1"]').click();
    assert.equal(detail.querySelector('[name=home]').value, '1');
    detail.querySelector('[data-bolao-preset="2,1"]').click();
    assert.equal(detail.querySelector('[name=away]').value, '1');
    const input = detail.querySelector('[name=home]');
    input.value = 20;
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(
      detail.querySelector('[data-score-step="home:1"]').disabled,
      true,
    );
    detail.querySelector('[data-bolao-preset="2,1"]').click();
    d.querySelector('[data-bolao-filter=closed]').click();
    await flush();
    assert.equal(d.querySelectorAll('[data-bolao-game]').length, 1);
    d.querySelector('[data-bolao-game]').open = true;
    await flush();
    assert.equal(d.querySelector('.bolao-pick-form'), null);
    d.querySelector('[data-bolao-filter=all]').click();
    await flush();
    detail = d.querySelector('[data-bolao-game="bra.1/201"]');
    detail.open = true;
    await flush();
    assert.equal(detail.querySelector('[name=home]').value, '2');
    assert.equal(detail.querySelector('[name=away]').value, '1');
    detail.querySelector('[data-save-pick]').click();
    await flush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].id, '201');
    assert.equal(sent[0].league, 'bra.1');
    assert.equal(sent[0].home, 2);
    assert.equal(sent[0].away, 1);
    assert.match(
      detail.querySelector('.bolao-card-action').textContent,
      /2 × 1/,
    );
    assert.match(detail.querySelector('.pick-feedback').textContent, /salvo/);
    locked = true;
    d.querySelector('#bolao-refresh').click();
    await flush();
    detail = d.querySelector('[data-bolao-game="bra.1/201"]');
    detail.open = true;
    await flush();
    assert.equal(detail.querySelector('form'), null);
    assert.equal(detail.querySelector('.bolao-status').textContent, 'Fechado');
    assert.equal(d.querySelector('#bolao-open-count').textContent, '0');
  } finally {
    w.close();
  }
});
