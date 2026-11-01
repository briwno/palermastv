import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayBuffer } from '../../src/client/features/room/replay-buffer.mjs';
import { freshnessState } from '../../src/client/shared/freshness.js';
const snapshot = (score, id = '1') => ({
  game: { id, leagueId: 'bra.1', homeScore: score },
  events: [{ label: 'Gol ' + score }],
});
test('replay releases complete snapshots only after their delay, once, without retaining caller mutations', () => {
  let now = 0;
  const released = [],
    waiting = [];
  const buffer = new ReplayBuffer({
    delay: 30,
    now: () => now,
    emit: (d) => released.push(d),
    waiting: (g) => waiting.push(g.id),
  });
  const first = snapshot(0);
  buffer.push(first);
  first.game.homeScore = 99;
  now = 29000;
  buffer.tick();
  assert.equal(released.length, 0);
  assert.deepEqual(waiting, ['1']);
  now = 30000;
  buffer.tick();
  assert.equal(released[0].game.homeScore, 0);
  buffer.push(snapshot(1));
  now = 59000;
  buffer.tick();
  assert.equal(released.length, 1);
  now = 60000;
  buffer.tick();
  buffer.tick();
  assert.equal(released.length, 2);
  assert.equal(released[1].game.homeScore, 1);
  assert.equal(released[1].events[0].label, 'Gol 1');
});
test('changing delay can rewind safely; switching game discards the previous queue and clamps input', () => {
  let now = 0;
  const released = [];
  const buffer = new ReplayBuffer({
    now: () => now,
    emit: (d) => released.push(d),
    delay: 0,
  });
  buffer.push(snapshot(0));
  now = 30000;
  buffer.push(snapshot(1));
  buffer.setDelay(30);
  assert.equal(released.at(-1).game.homeScore, 0);
  buffer.push(snapshot(4, '2'));
  assert.equal(buffer.key, 'bra.1/2');
  assert.equal(buffer.remaining(), 30);
  assert.equal(buffer.frames.length, 1);
  now = 60000;
  buffer.tick();
  assert.equal(released.at(-1).game.id, '2');
  buffer.setDelay(999);
  assert.equal(buffer.delay, 180);
  buffer.setDelay(-4);
  assert.equal(buffer.delay, 0);
  for (let i = 0; i < 300; i++) {
    now += 1000;
    buffer.push(snapshot(i, '2'));
  }
  assert.ok(buffer.frames.length <= 128);
  buffer.reset();
  assert.equal(buffer.frames.length, 0);
  assert.equal(buffer.key, '');
});
test('freshness distinguishes a failed consultation, stale data, a missing timestamp and clock skew', () => {
  const at = '2026-11-01T12:00:00Z',
    now = Date.parse(at);
  assert.equal(
    freshnessState(at, 15, false, now + 12000).text,
    'Consulta há 12 s',
  );
  assert.equal(freshnessState(at, 15, false, now + 46000).kind, 'stale');
  assert.equal(freshnessState(at, 60, true, now + 5000).kind, 'stale');
  assert.equal(freshnessState(null, 15, false, now).kind, 'pending');
  assert.equal(
    freshnessState(null, 15, true, now).text,
    'Consulta indisponível',
  );
  assert.equal(
    freshnessState(at, 15, false, now - 5000).text,
    'Consulta há 0 s',
  );
});
