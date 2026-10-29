import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveFotmobGame } from '../../src/server/integrations/fotmob.mjs';
test('live scores match league, both teams and kickoff while preserving ESPN identities', async () => {
  const game = {
    id: 'espn-1',
    leagueId: 'bra.1',
    date: '2026-10-28T22:00:00Z',
    state: 'in',
    home: { id: 'espn-home', name: 'Coritiba' },
    away: { id: 'espn-away', name: 'Athletico' },
    homeScore: 0,
    awayScore: 0,
  };
  const item = {
    id: 123,
    home: { name: 'Coritiba', score: 2 },
    away: { name: 'Athletico', score: 1 },
    status: { utcTime: game.date, started: true, liveTime: { short: '78′' } },
  };
  const fetcher = async () =>
    Response.json({ leagues: [{ id: 268, matches: [item] }] });
  const result = await liveFotmobGame(game, fetcher);
  assert.equal(result.homeScore, 2);
  assert.equal(result.awayScore, 1);
  assert.equal(result.id, game.id);
  assert.equal(result.home.id, game.home.id);
  assert.equal(result.scoreSource, 'FotMob');
  const other = { ...game, home: { name: 'Flamengo' } };
  assert.deepEqual(await liveFotmobGame(other, fetcher), other);
});
