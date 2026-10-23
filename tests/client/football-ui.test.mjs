import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { renderShell } from '../../scripts/lib/render-shell.mjs';
const bundle = await build({
  entryPoints: ['src/client/main.js'],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2022'],
});
const pause = () => new Promise((resolve) => setTimeout(resolve, 35));
const game = {
  id: '123',
  leagueId: 'bra.1',
  league: 'Brasileirão',
  date: new Date(Date.now() + 3600000).toISOString(),
  day: '2026-10-24',
  home: { id: '3458', name: 'Athletico' },
  away: { id: '3456', name: 'Coritiba' },
  state: 'pre',
  homeScore: null,
  awayScore: null,
  broadcasts: [],
  timeValid: true,
};
test('picks keep drafts through tab changes, work without ranking and submit the chosen score', async () => {
  const dom = new JSDOM(await renderShell(), {
    url: 'https://site.example/#partida/bra.1/123',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: false });
  let submitted = null;
  w.fetch = async (input, options = {}) => {
    const url = String(input);
    let body = { games: [], checkedAt: new Date().toISOString() };
    if (url.startsWith('/api/football/match'))
      body = {
        game,
        lineups: [],
        statistics: [],
        events: [],
        checkedAt: new Date().toISOString(),
      };
    else if (url.includes('/insights'))
      body = { state: 'unavailable', message: 'Sem dados complementares' };
    else if (url.includes('/ranking'))
      return Response.json({ error: 'unavailable' }, { status: 502 });
    else if (url.includes('/predictions')) {
      if (options.method === 'POST') {
        submitted = JSON.parse(options.body);
        body = { ok: true };
      } else body = { votes: [], locked: false };
    } else if (url.includes('/profile'))
      body = {
        profile: null,
        stats: { predictions: 0, awards: 0, messages: 0 },
      };
    else if (url.includes('/status')) body = { members: [], publisher: null };
    else if (url.includes('/lounge')) body = { polls: [], posts: [] };
    else if (url.includes('/standings'))
      body = {
        league: { id: 'bra.1', name: 'Série A' },
        groups: [],
        checkedAt: new Date().toISOString(),
      };
    else if (url.includes('/hub') || url.includes('/clubs'))
      body = { clubs: [], checkedAt: new Date().toISOString() };
    else if (url.includes('/brasileirao')) body = { rounds: [] };
    else if (url === '/room-config.json') body = { signalingUrl: null };
    return Response.json(body);
  };
  try {
    w.eval(bundle.outputFiles[0].text);
    await pause();
    w.document.querySelector('#tab-picks').click();
    await pause();
    assert.ok(w.document.querySelector('#pick-form'));
    assert.match(
      w.document.querySelector('#match-picks-content').textContent,
      /Ranking temporariamente indisponível/,
    );
    w.document.querySelector('[data-pick-preset="2,1"]').click();
    const name = w.document.querySelector('#pick-name');
    name.value = 'Palerma';
    name.dispatchEvent(new w.Event('input', { bubbles: true }));
    w.document.querySelector('#tab-overview').click();
    w.document.querySelector('#tab-picks').click();
    await pause();
    assert.equal(w.document.querySelector('#pick-home').value, '2');
    assert.equal(w.document.querySelector('#pick-away').value, '1');
    w.document.querySelector('[data-pick-step="1"][data-side="home"]').click();
    assert.equal(w.document.querySelector('#pick-home').value, '3');
    w.document
      .querySelector('#pick-form')
      .dispatchEvent(
        new w.Event('submit', { bubbles: true, cancelable: true }),
      );
    await pause();
    assert.equal(submitted.home, 3);
    assert.equal(submitted.away, 1);
    assert.equal(submitted.name, 'Palerma');
  } finally {
    w.dispatchEvent(new w.Event('pagehide'));
    w.close();
  }
});
test('club subviews stay inside CAP & CFC and shell includes do not duplicate IDs', async () => {
  const html = await renderShell();
  const dom = new JSDOM(html);
  try {
    assert.ok(!html.includes('<!-- include:'));
    assert.equal(
      dom.window.document.querySelector('[data-page="athletiba"]'),
      null,
    );
    const classic = dom.window.document.querySelector('#club-classic');
    assert.equal(classic.closest('.page').id, 'page-clubes');
    const ids = [...dom.window.document.querySelectorAll('[id]')].map(
      (e) => e.id,
    );
    assert.equal(ids.length, new Set(ids).size);
  } finally {
    dom.window.close();
  }
});

test('next club match opens internally and missing ESPN lineup is supplemented safely', async () => {
  const dom = new JSDOM(await renderShell(), {
    url: 'https://site.example/#clubes',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: false });
  let matchRequests = 0;
  w.fetch = async (input) => {
    const url = String(input);
    let data = {
      games: [],
      clubs: [],
      groups: [],
      rounds: [],
      votes: [],
      polls: [],
      posts: [],
      members: [],
      checkedAt: new Date().toISOString(),
    };
    if (url.includes('/hub'))
      data.clubs = [
        {
          key: 'cap',
          id: '3458',
          name: 'Athletico',
          short: 'CAP',
          stats: { rank: null, points: null, played: null },
          articles: [],
          lastGames: [],
          highlights: [],
          nextGame: game,
        },
      ];
    if (url.startsWith('/api/football/match?')) {
      matchRequests++;
      data = {
        game,
        lineups: [{ team: game.home, players: [], available: false }],
        statistics: [],
        events: [],
        checkedAt: new Date().toISOString(),
      };
    }
    if (url.includes('/insights'))
      data = {
        state: 'available',
        form: [[], []],
        statistics: [],
        shots: [],
        ratings: [],
        h2h: [],
        absences: [],
        probabilities: null,
        lineups: [
          {
            team: 'Athletico',
            formation: '4-3-3',
            coach: 'Técnico',
            players: [
              {
                name: 'Jogador <b>teste</b>',
                jersey: '9',
                starter: true,
                rating: 8.1,
              },
            ],
          },
        ],
      };
    if (url.includes('/standings'))
      data.league = { id: 'bra.1', name: 'Brasileirão' };
    return Response.json(data);
  };
  try {
    w.eval(bundle.outputFiles[0].text);
    await pause();
    const link = w.document.querySelector('.club-next-game a');
    assert.equal(link.getAttribute('href'), '#partida/bra.1/123');
    assert.equal(link.getAttribute('target'), null);
    link.click();
    await pause();
    await pause();
    assert.ok(matchRequests > 0);
    assert.equal(w.document.querySelector('#page-partida').hidden, false);
    assert.match(
      w.document.querySelector('#match-lineup-supplement').textContent,
      /Jogador <b>teste<\/b>/,
    );
    assert.equal(
      w.document.querySelector('#match-lineup-supplement span b'),
      null,
    );
    assert.equal(
      w.document.querySelector('#page-partida a[href*="fotmob.com/matches"]'),
      null,
    );
    assert.equal(
      w.document.querySelector('#match-overview a[target="_blank"]'),
      null,
    );
  } finally {
    w.dispatchEvent(new w.Event('pagehide'));
    w.close();
  }
});
