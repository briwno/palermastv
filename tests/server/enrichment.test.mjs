import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  embeddedItems,
  normalizeGENews,
} from '../../src/server/integrations/ge-news.mjs';
import {
  recentForm,
  enrichStandings,
  sameFotmobGame,
  normalizeAbsences,
} from '../../src/server/integrations/fotmob.mjs';
import { normalizeInsights } from '../../src/server/features/match/insights.mjs';
import { poissonProbabilities } from '../../src/server/features/match/probabilities.mjs';
const fixture = (day, home = 1, away = 2, score = '2 - 1') => ({
  home: { id: home, name: 'Athletico' },
  away: { id: away, name: 'Coritiba' },
  status: {
    finished: true,
    utcTime: `2026-10-${String(day).padStart(2, '0')}T20:00:00Z`,
    scoreStr: score,
  },
});
test('ge parses embedded data without executing scripts and restricts news to the selected club URL', () => {
  const url =
    'https://ge.globo.com/pr/futebol/times/athletico-pr/noticia/2026/10/23/athletico.ghtml';
  const item = {
    id: 'a',
    type: 'materia',
    publication: '2026-10-23T12:00:00Z',
    content: { title: 'Athletico: retorno de titular [confirmado]', url },
  };
  const other = {
    ...item,
    id: 'b',
    content: {
      title: 'Coritiba enfrenta o Athletico',
      url: url.replace('athletico-pr/', 'coritiba/'),
    },
  };
  const html =
    '<script>neverExecute();const feed=' +
    JSON.stringify({ items: [item, { ...item, id: 'duplicate' }, other] }) +
    ';</script>';
  const news = normalizeGENews(embeddedItems(html), {
    key: 'cap',
    short: 'Athletico',
  });
  assert.equal(news.length, 1);
  assert.equal(news[0].url, url);
  assert.equal(news[0].source, 'ge');
  assert.deepEqual(embeddedItems('<script>items: not JSON</script>'), []);
});
test('form excludes future, cancelled, awarded and unscored fixtures and preserves draws', () => {
  const games = [
    fixture(1),
    fixture(2, 1, 2, '0 - 0'),
    fixture(3),
    { ...fixture(4), status: { ...fixture(4).status, cancelled: true } },
    fixture(20),
  ];
  const form = recentForm(games, 1, Date.parse('2026-10-10'));
  assert.deepEqual(
    form.map((g) => g.result),
    ['V', 'E', 'V'],
  );
  assert.equal(
    recentForm(
      [{ ...fixture(1), status: { ...fixture(1).status, scoreStr: null } }],
      1,
    ).length,
    0,
  );
});
test('qualification zones follow provider positions and team names rather than fixed G6 assumptions', () => {
  const groups = [{ rows: [{ rank: 3, name: 'Athletico-PR', points: 53 }] }];
  const data = {
    table: [
      {
        data: {
          table: { all: [{ id: 1, name: 'Athletico Paranaense' }] },
          legend: [
            {
              title: 'Copa Libertadores',
              color: '#2AD572',
              indices: [0, 1, 2, 3],
            },
          ],
        },
      },
    ],
    fixtures: { allMatches: [fixture(1)] },
  };
  const result = enrichStandings(groups, data)[0].rows[0];
  assert.equal(result.zone.label, 'Libertadores');
  assert.equal(result.form[0].result, 'V');
  assert.equal(result.points, 53);
  assert.equal(groups[0].rows[0].zone, undefined);
});
test('probabilities need a minimum sample and produce a normalized distribution with symmetric teams', () => {
  const sample = Array.from({ length: 10 }, () => ({ own: 1.5, against: 1.5 }));
  assert.equal(poissonProbabilities(sample.slice(0, 4), sample), null);
  const p = poissonProbabilities(sample, sample);
  assert.ok(Math.abs(p.home - p.away) < 0.11);
  assert.ok(Math.abs(p.home + p.draw + p.away - 100) < 0.001);
  assert.equal(p.sampleHome, 10);
  assert.equal(p.scores.length, 3);
});
test('cross-provider association rejects inverted teams and mismatched dates or competitions', () => {
  const game = {
    home: { name: 'Athletico-PR' },
    away: { name: 'Coritiba' },
    date: '2026-10-10T20:00:00Z',
    leagueId: 'bra.1',
  };
  const data = {
    general: {
      matchId: 12,
      leagueId: 268,
      homeTeam: { id: 1, name: 'Athletico Paranaense' },
      awayTeam: { id: 2, name: 'Coritiba' },
      matchTimeUTCDate: game.date,
    },
    content: {
      lineup: {
        homeTeam: {
          formation: '4-3-3',
          coach: { name: 'Técnico' },
          starters: [
            {
              id: 99,
              name: 'Titular',
              shirtNumber: '9',
              isCaptain: true,
              performance: { rating: 8.2 },
            },
          ],
          subs: [{ id: 100, name: 'Reserva', performance: { rating: 99 } }],
        },
      },
    },
  };
  assert.equal(
    sameFotmobGame(
      {
        ...fixture(10),
        home: { name: 'Athletico Paranaense' },
        away: { name: 'Coritiba' },
      },
      game,
    ),
    true,
  );
  assert.throws(() =>
    normalizeInsights(
      { ...data, general: { ...data.general, leagueId: 47 } },
      game,
    ),
  );
  assert.throws(() =>
    normalizeInsights(
      {
        ...data,
        general: { ...data.general, matchTimeUTCDate: '2026-10-11T20:00:00Z' },
      },
      game,
    ),
  );
  assert.throws(() =>
    normalizeInsights(data, { ...game, home: game.away, away: game.home }),
  );
  const d = normalizeInsights(data, game, [
    {
      fixtures: {
        allFixtures: {
          fixtures: [
            fixture(1),
            fixture(2),
            fixture(3),
            fixture(4),
            fixture(5),
            fixture(12),
          ],
        },
      },
    },
    {
      fixtures: {
        allFixtures: {
          fixtures: [
            fixture(1),
            fixture(2),
            fixture(3),
            fixture(4),
            fixture(5),
            fixture(12),
          ],
        },
      },
    },
  ]);
  assert.equal(d.probabilities.sampleHome, 5);
  assert.equal(d.form[0].length, 5);
  assert.equal(d.shots.length, 0);
  assert.equal(d.url, undefined);
  assert.equal(d.lineups[0].formation, '4-3-3');
  assert.equal(d.lineups[0].coach, 'Técnico');
  assert.equal(d.lineups[0].players[0].starter, true);
  assert.equal(d.lineups[0].players[0].rating, 8.2);
  assert.equal(d.lineups[0].players[1].starter, false);
  assert.equal(d.lineups[0].players[1].rating, null);
  assert.equal(d.lineups[0].players[0].id, undefined);
  assert.equal(d.lineups[1].players.length, 0);
});
test('missing absence coverage is different from an empty provider report', () => {
  assert.equal(normalizeAbsences({}).available, false);
  assert.deepEqual(
    normalizeAbsences({
      squad: {
        squad: [
          {
            members: [
              { name: 'Um', injury: null },
              { name: 'Dois', injured: true },
            ],
          },
        ],
      },
    }),
    {
      available: true,
      players: [{ name: 'Dois', reason: 'Lesão informada', return: null }],
    },
  );
});
