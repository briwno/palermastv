import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMatch,
  matchCenter,
} from '../../src/server/features/match/service.mjs';
const league = { id: 'bra.1', name: 'Brasileirão Série A', region: 'brasil' };
const fixture = {
  header: {
    id: '123',
    competitions: [
      {
        date: '2026-10-18T20:00Z',
        status: { type: { state: 'post' } },
        competitors: [
          {
            homeAway: 'home',
            team: { id: '3458', displayName: 'Athletico' },
            score: '1',
          },
          {
            homeAway: 'away',
            team: { id: '3456', displayName: 'Coritiba' },
            score: '0',
          },
        ],
      },
    ],
  },
  boxscore: {
    teams: [
      {
        team: { id: '3456' },
        statistics: [{ name: 'totalShots', displayValue: '0' }],
      },
      {
        team: { id: '3458' },
        statistics: [{ name: 'totalShots', displayValue: '8' }],
      },
    ],
  },
  rosters: [
    {
      team: { id: '3458' },
      formation: '4-3-3',
      roster: [
        {
          starter: true,
          jersey: '9',
          athlete: { id: 'a', displayName: 'Atacante' },
          stats: [
            { name: 'totalGoals', value: 1 },
            { name: 'totalShots', value: 3 },
            { name: 'shotsOnTarget', value: 0 },
            { name: 'appearances', value: 1 },
          ],
        },
        {
          starter: false,
          subbedIn: true,
          athlete: { id: 'b', displayName: 'Reserva' },
        },
      ],
    },
  ],
  keyEvents: [
    {
      id: 'goal',
      scoringPlay: true,
      clock: { value: 300, displayValue: "5'" },
      team: { id: '3458' },
      participants: [{ athlete: { displayName: 'Atacante' } }],
    },
    {
      id: 'card',
      type: { type: 'yellow-card' },
      clock: { value: 400, displayValue: "7'" },
      team: { id: '3456' },
      participants: [{ athlete: { displayName: 'Defensor' } }],
    },
  ],
};
test('match center aligns teams by id, preserves zero stats, separates starters and bench', () => {
  const d = normalizeMatch(fixture, league);
  assert.equal(d.statistics[0].home, '8');
  assert.equal(d.statistics[0].away, '0');
  assert.equal(d.lineups[0].formation, '4-3-3');
  assert.equal(d.lineups[0].players[0].goals, 1);
  assert.deepEqual(d.lineups[0].players[0].stats, {
    totalShots: 3,
    shotsOnTarget: 0,
  });
  assert.deepEqual(d.lineups[0].players[1].stats, {});
  assert.equal(d.lineups[0].players[1].starter, false);
  assert.equal(d.lineups[1].available, false);
  assert.equal(d.events[0].type, 'yellow-card');
  assert.equal(d.events[1].type, 'goal');
  assert.equal(d.game.attendance, null);
});
test('goal events carry narration, running score and the matching ESPN video', () => {
  const d = normalizeMatch(
    {
      ...fixture,
      keyEvents: [
        {
          ...fixture.keyEvents[0],
          text: 'Gol! Atacante finaliza de pé esquerdo.',
          participants: [
            { athlete: { id: '9', displayName: 'João Atacante' } },
          ],
        },
      ],
      videos: [
        {
          headline: 'Outro lance do jogo',
          links: { web: { href: 'https://www.espn.com.br/video/1' } },
        },
        {
          headline: 'Atacante abre o placar',
          duration: 48,
          links: { web: { href: 'https://www.espn.com.br/video/2' } },
        },
      ],
    },
    league,
  );
  const goal = d.events[0];
  assert.equal(goal.text, 'Gol! Atacante finaliza de pé esquerdo.');
  assert.equal(goal.video.url, 'https://www.espn.com.br/video/2');
  assert.equal(goal.video.duration, 48);
  assert.equal(goal.scoreAfter, '1 × 0');
});
test('running score is dropped when goal events do not add up to the final score', () => {
  const d = normalizeMatch(
    {
      ...fixture,
      keyEvents: [fixture.keyEvents[0], { ...fixture.keyEvents[0], id: 'g2' }],
    },
    league,
  );
  assert.equal(d.events[0].scoreAfter, undefined);
  assert.equal(d.events[1].scoreAfter, undefined);
});
test('upcoming games do not invent lineups, scores, statistics or events', () => {
  const d = normalizeMatch(
    {
      header: {
        ...fixture.header,
        competitions: [
          {
            ...fixture.header.competitions[0],
            status: { type: { state: 'pre' } },
          },
        ],
      },
    },
    league,
  );
  assert.equal(d.game.homeScore, null);
  assert.deepEqual(d.statistics, []);
  assert.deepEqual(d.events, []);
  assert.equal(d.eventsAvailable, false);
  assert.ok(d.lineups.every((l) => !l.available));
});
test('match lookup only permits known leagues and numeric event ids', async () => {
  await assert.rejects(matchCenter('external', '123'), /inválida/);
  await assert.rejects(matchCenter('bra.1', 'http://bad.test'), /inválida/);
  assert.throws(() => normalizeMatch({}, league), /não encontrada/);
});
