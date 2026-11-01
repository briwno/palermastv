import test from 'node:test';
import assert from 'node:assert/strict';
import { pulse } from './pulse.mjs';
class Store extends Map {
  async put(k, v) {
    this.set(k, structuredClone(v));
  }
  async list({ prefix }) {
    return new Map([...this].filter(([k]) => k.startsWith(prefix)));
  }
}
const makeRoom = () => ({
  ctx: { storage: new Store([['room-game', { leagueId: 'bra.1', id: '90' }]]) },
});
const vote = {
  context: 'bra.1/90',
  operation: 'write',
  mood: 'pressao',
  token: 'a'.repeat(32),
  name: 'Amigo',
};
test('shared mood replaces the same person, counts independent people, expires and hides identity', async () => {
  const room = makeRoom();
  let d = await (await pulse(room, vote, 100000)).json();
  assert.equal(d.moods[0].count, 1);
  assert.equal((await pulse(room, vote, 100001)).status, 429);
  await pulse(room, { ...vote, mood: 'sofrimento' }, 103000);
  d = await (
    await pulse(room, { ...vote, token: 'b'.repeat(32) }, 104000)
  ).json();
  assert.deepEqual(
    d.moods.map((m) => m.count),
    [1, 1, 0],
  );
  assert.ok(!JSON.stringify(d).includes(vote.token));
  d = await (
    await pulse(room, { context: vote.context, operation: 'read' }, 165000)
  ).json();
  assert.equal(d.reactions.length, 0);
  assert.deepEqual(
    d.moods.map((m) => m.count),
    [0, 0, 0],
  );
});
test('mood and MVP cannot be written to another game; MVP validates players and phase', async () => {
  const room = makeRoom();
  assert.equal(
    (await pulse(room, { ...vote, context: 'bra.1/91' })).status,
    409,
  );
  const mvp = {
    ...vote,
    mood: null,
    mvp: '7',
    players: [{ id: '7', name: 'Atleta' }],
  };
  assert.equal((await pulse(room, mvp)).status, 409);
  assert.equal(
    (await pulse(room, { ...mvp, votingOpen: true, mvp: '9' })).status,
    400,
  );
  await pulse(room, { ...mvp, votingOpen: true });
  const result = await (await pulse(room, { ...mvp, votingOpen: true })).json();
  assert.equal(result.ranking.length, 1);
  assert.equal(result.ranking[0].votes, 1);
});
