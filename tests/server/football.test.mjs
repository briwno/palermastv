import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEvent,
  normalizeStandings,
  dailyGames,
  leagues,
} from '../../src/server/features/football/service.mjs';
const event = {
  id: 'game-test',
  date: '2026-10-19T01:00:00Z',
  status: { type: { state: 'post', description: 'Final' } },
  competitions: [
    {
      competitors: [
        {
          homeAway: 'home',
          team: { id: '3458', displayName: 'Athletico' },
          score: { displayValue: '2' },
        },
        {
          homeAway: 'away',
          team: { id: '3456', displayName: 'Coritiba' },
          score: '1',
        },
      ],
    },
  ],
};
test('scores from both feeds and dates crossing midnight use Brasília', () => {
  const g = normalizeEvent(event, leagues[0]);
  assert.equal(g.day, '2026-10-18');
  assert.equal(g.homeScore, '2');
  assert.equal(g.awayScore, '1');
  assert.deepEqual(g.broadcasts, []);
  assert.equal(g.venue, null);
  assert.equal(normalizeEvent({}, leagues[0]), null);
  const pre = normalizeEvent(
    { ...event, status: { type: { state: 'pre' } } },
    leagues[0],
  );
  assert.equal(pre.homeScore, null);
});
test('standings map named stats rather than their order', () => {
  const groups = normalizeStandings({
    children: [
      {
        name: 'Série A',
        standings: {
          entries: [
            {
              team: { id: '3458', displayName: 'Athletico' },
              stats: [
                { name: 'wins', value: 10 },
                { name: 'points', value: 35 },
                { name: 'rank', value: 7 },
                { name: 'gamesPlayed', value: 22 },
                { name: 'ties', value: 5 },
              ],
            },
          ],
        },
      },
    ],
  });
  assert.equal(groups[0].rows[0].rank, 7);
  assert.equal(groups[0].rows[0].points, 35);
  assert.equal(groups[0].rows[0].played, 22);
  assert.equal(groups[0].rows[0].draws, 5);
  assert.equal(groups[0].rows[0].goalDifference, null);
});
test('daily schedule deduplicates events and reports partial provider failure', async () => {
  const data = await dailyGames('2026-10-18', async (url) =>
    url.includes('bra.1/')
      ? Response.json({ events: [event] })
      : new Response('', { status: 503 }),
  );
  assert.equal(data.games.length, 1);
  assert.equal(data.games[0].day, '2026-10-18');
  assert.equal(data.unavailable.length, leagues.length - 1);
});
test('total provider failure never falls back to fabricated fixtures', async () => {
  await assert.rejects(
    dailyGames('2026-10-20', async () => new Response('', { status: 503 })),
    /consultar os jogos/,
  );
  await assert.rejects(dailyGames('invalid'), /Data inválida/);
});
test('restricted hosting cache does not block successful provider requests', async () => {
  const old = globalThis.caches;
  globalThis.caches = {
    default: {
      match: async () => {
        throw Error('Cache not permitted');
      },
      put: async () => {
        throw Error('Cache not permitted');
      },
    },
  };
  try {
    const data = await dailyGames('2026-10-21', async () =>
      Response.json({ events: [] }),
    );
    assert.deepEqual(data.games, []);
    assert.deepEqual(data.unavailable, []);
  } finally {
    if (old === undefined) delete globalThis.caches;
    else globalThis.caches = old;
  }
});
