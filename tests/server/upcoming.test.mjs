import test from 'node:test';
import assert from 'node:assert/strict';
import { nextGamesByTeam } from '../../src/server/features/football/upcoming.mjs';
test('next opponent follows the earliest valid fixture across competitions and ignores stale or postponed fixtures', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const game = (id, date, home, away, changes = {}) => ({
    id,
    date,
    home: { id: home },
    away: { id: away },
    state: 'pre',
    ...changes,
  });
  const games = [
    game('league', '2026-11-06T21:30Z', 'cap', 'coxa'),
    game('cup', '2026-11-04T21:30Z', 'other', 'cap'),
    game('old', '2026-11-01T10:00Z', 'coxa', 'other'),
    game('cancel', '2026-11-02T20:00Z', 'cap', 'other', {
      status: 'Cancelled',
    }),
    game('live', '2026-11-01T13:00Z', 'coxa', 'other', { state: 'in' }),
    game('missing', 'bad', 'cap', 'other'),
  ];
  const next = nextGamesByTeam(games, now);
  assert.equal(next.cap.id, 'cup');
  assert.equal(next.coxa.id, 'league');
  assert.equal(next.other.id, 'cup');
  assert.equal(games[0].id, 'league');
});
