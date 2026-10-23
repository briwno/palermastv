import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sofaForGame,
  sofaInput,
} from '../../src/client/integrations/sofascore.js';
import {
  teamKey,
  geStandings,
  markGELive,
  publicGERound,
  geCompetition,
} from '../../src/server/integrations/ge.mjs';
test('ge teams retain ESPN identity and live points are never added twice', () => {
  const data = {
    tables: [
      {
        name: 'Série A',
        entries: [
          {
            position: 3,
            team: {
              id: 293,
              name: 'Athletico-PR',
              badge: 'https://evil.test/logo',
            },
            points: 53,
            matches: 31,
            wins: 16,
          },
        ],
      },
    ],
  };
  const groups = geStandings(data, [
    {
      rows: [
        {
          id: '3458',
          name: 'Athletico-PR',
          logo: 'https://a.espncdn.com/logo',
        },
      ],
    },
  ]);
  const result = markGELive(groups, [
    {
      id: '123',
      state: 'in',
      home: { name: 'Athletico' },
      away: { name: 'Coritiba' },
      homeScore: '1',
      awayScore: '0',
      clock: '65',
    },
  ]);
  assert.equal(result[0].rows[0].id, '3458');
  assert.equal(result[0].rows[0].points, 53);
  assert.equal(result[0].rows[0].live.projected, false);
  assert.equal(result[0].rows[0].logo, 'https://a.espncdn.com/logo');
  assert.equal(teamKey('Atlético-MG'), teamKey('Atlético Mineiro'));
});
test('public ge rounds reject untrusted coverage and competition input', async () => {
  const d = publicGERound({
    competition: { name: 'Série A', season: 2026 },
    rounds: [
      {
        number: 31,
        matches: [
          {
            homeTeam: { name: 'CAP' },
            awayTeam: { name: 'CFC' },
            score: { home: 0, away: 0 },
            coverage: { url: 'javascript:alert(1)' },
          },
        ],
      },
    ],
  });
  assert.equal(d.rounds[0].matches[0].homeScore, 0);
  assert.equal(d.rounds[0].matches[0].sourceUrl, null);
  await assert.rejects(geCompetition('evil'));
});
test('Sofascore game association requires home, away and exact Brazilian date', async () => {
  const lookup = sofaForGame,
    game = {
      leagueId: 'bra.1',
      day: '2026-10-17',
      home: { name: 'Athletico-PR' },
      away: { name: 'Palmeiras' },
    };
  assert.match(lookup(game).url, /id=15238204/);
  assert.equal(lookup({ ...game, day: '2026-10-18' }), null);
  assert.equal(lookup({ ...game, home: game.away, away: game.home }), null);
  assert.match(
    sofaInput(
      'https://www.sofascore.com/pt/football/match/athletico-palmeiras/nOsrO#id:15238204',
    ),
    /id=15238204/,
  );
  assert.equal(sofaInput('https://evil.test/football/match/a#id:123'), null);
});
