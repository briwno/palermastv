import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupAPI } from '../../src/server/features/group/proxy.mjs';
import { athletiba } from '../../src/server/features/clubs/athletiba.mjs';
const env = {
  ROOM_CODE: 'test-room-secret-with-enough-length',
  SIGNALING_URL: 'https://signal.example',
};
const event = (id, home, away, homeScore, awayScore, state = 'post') => ({
  id,
  date: '2026-04-01T20:00:00Z',
  league: { slug: 'bra.1' },
  status: { type: { state } },
  competitions: [
    {
      competitors: [
        {
          homeAway: 'home',
          team: { id: home, displayName: home },
          score: String(homeScore),
        },
        {
          homeAway: 'away',
          team: { id: away, displayName: away },
          score: String(awayScore),
        },
      ],
    },
  ],
});
test('awards proxy replaces client supplied match status and candidates with provider data', async () => {
  let sent;
  const fixture = event('90123', '3458', '3456', 0, 0, 'in');
  const fetcher = async (url, options) => {
    if (String(url).includes('/summary?'))
      return Response.json({
        header: {
          id: fixture.id,
          competitions: [
            {
              ...fixture.competitions[0],
              date: fixture.date,
              status: fixture.status,
            },
          ],
        },
        rosters: [
          {
            team: { id: '3458' },
            roster: [
              { athlete: { id: '10', displayName: 'Titular' }, starter: true },
              { athlete: { id: '20', displayName: 'Banco sem entrar' } },
              { athlete: { id: '30', displayName: 'Entrou' }, subbedIn: true },
            ],
          },
        ],
      });
    sent = JSON.parse(options.body);
    return Response.json({ ok: true });
  };
  const result = await groupAPI(
    new Request('https://site.example/api/group/awards', {
      method: 'POST',
      body: JSON.stringify({
        token: 'test-token',
        league: 'bra.1',
        id: '90123',
        game: { state: 'post' },
        players: [{ id: 'fake' }],
        craque: 'fake',
        bagre: '10',
      }),
    }),
    env,
    fetcher,
  );
  assert.equal(result.status, 200);
  assert.equal(sent.game.state, 'in');
  assert.deepEqual(
    sent.players.map((p) => p.id),
    ['10', '30'],
  );
  assert.equal(sent.action, 'community-awards');
  assert.equal(sent.code, env.ROOM_CODE);
});
test('community routes reject malformed JSON and never accept profile writes via GET', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({});
  };
  for (const body of ['null', '{']) {
    const result = await groupAPI(
      new Request('https://site.example/api/group/chat', {
        method: 'POST',
        body,
      }),
      env,
      fetcher,
    );
    assert.equal(result.status, 400);
  }
  assert.equal(
    (
      await groupAPI(
        new Request('https://site.example/api/group/profile'),
        env,
        fetcher,
      )
    ).status,
    405,
  );
  assert.equal(calls, 0);
});
test('Athletiba deduplicates calendars and counts only classics with finished scores', async () => {
  const events = [
    event('51', '3458', '3456', 2, 0),
    event('52', '3456', '3458', 1, 1),
    event('53', '3456', '3458', 0, 0, 'pre'),
    event('54', '3458', 'other', 5, 0),
  ];
  const d = await athletiba(async () => Response.json({ events }));
  assert.equal(d.history.length, 2);
  assert.equal(d.upcoming.length, 1);
  assert.deepEqual(d.summary, { cap: 1, coxa: 0, draws: 1, counted: 2 });
  assert.equal(d.seasons.length, 3);
  assert.equal(d.clubs.length, 2);
});
