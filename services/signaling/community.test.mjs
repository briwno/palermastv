import { test } from 'node:test';
import assert from 'node:assert/strict';
import { community } from './community.mjs';
import { handleGroup } from './group.mjs';
class Store extends Map {
  async get(k) {
    return structuredClone(super.get(k));
  }
  async put(k, v) {
    this.set(k, structuredClone(v));
  }
  async list({ prefix = '', limit = 1000 } = {}) {
    return new Map(
      [...this]
        .filter(([k]) => k.startsWith(prefix))
        .slice(0, limit)
        .map(([k, v]) => [k, structuredClone(v)]),
    );
  }
}
const room = () => ({
  ctx: { storage: new Store() },
  members: new Map(),
  broadcast() {},
});
const token = 'test_persistent_identity_long_enough';
const base = { token, name: 'Bruno' };
const digest = async (t) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const resetRate = async (r) =>
  r.ctx.storage.delete('community-rate:' + (await digest(token)));
const game = {
  id: '200',
  leagueId: 'bra.1',
  date: '2026-10-01T20:00:00Z',
  state: 'post',
  home: { id: '3458', name: 'Athletico' },
  away: { id: '3456', name: 'Coritiba' },
};
const players = [
  { id: '1', name: 'Jogador A' },
  { id: '2', name: 'Jogador B' },
  { id: '3', name: 'Jogador C' },
];
test('profiles persist across room instances and prediction updates preserve avatar and team', async () => {
  const r = room();
  const saved = await (
    await community(r, {
      ...base,
      action: 'community-profile',
      avatar: '🌪️',
      team: 'cap',
    })
  ).json();
  assert.equal(saved.profile.name, 'Bruno');
  assert.equal(saved.id, await digest(token));
  assert.ok(!JSON.stringify([...r.ctx.storage.values()]).includes(token));
  const next = { ...room(), ctx: r.ctx };
  const read = await (
    await community(next, {
      ...base,
      action: 'community-profile',
      operation: 'read',
    })
  ).json();
  assert.equal(read.profile.avatar, '🌪️');
  await handleGroup(next, {
    ...base,
    action: 'vote',
    home: 1,
    away: 0,
    game: {
      id: '123',
      league: 'bra.1',
      date: new Date(Date.now() + 3600000).toISOString(),
      state: 'pre',
    },
  });
  const profile = await (
    await community(next, {
      ...base,
      action: 'community-profile',
      operation: 'read',
    })
  ).json();
  assert.equal(profile.stats.predictions, 1);
  assert.equal(profile.profile.team, 'cap');
  assert.equal(profile.profile.avatar, '🌪️');
});
test('awards require a finished game, actual participants and distinct choices; repeat votes replace', async () => {
  const r = room(),
    vote = {
      ...base,
      action: 'community-awards',
      game,
      players,
      craque: '1',
      bagre: '2',
    };
  assert.equal(
    (await community(r, { ...vote, game: { ...game, state: 'in' } })).status,
    409,
  );
  assert.equal((await community(r, { ...vote, craque: '999' })).status, 400);
  assert.equal((await community(r, { ...vote, bagre: '1' })).status, 400);
  assert.equal((await community(r, vote)).status, 200);
  assert.equal((await community(r, vote)).status, 429);
  await resetRate(r);
  await community(r, { ...vote, craque: '3' });
  await community(r, { ...vote, token: token + '_other', name: 'Outro' });
  const history = await (
    await community(r, { action: 'community-history' })
  ).json();
  assert.equal(history.games.length, 1);
  assert.equal(history.games[0].total, 2);
  assert.equal(history.games[0].craques.length, 2);
  assert.equal(history.games[0].bagres[0].votes, 2);
  const profile = await (
    await community(r, {
      ...base,
      action: 'community-profile',
      operation: 'read',
    })
  ).json();
  assert.equal(profile.stats.awards, 1);
});
test('chat uses the stored profile, throttles messages and keeps a bounded shared history', async () => {
  const r = room();
  await community(r, {
    ...base,
    action: 'community-profile',
    avatar: '😎',
    team: 'coxa',
  });
  await resetRate(r);
  assert.equal(
    (await community(r, { ...base, action: 'community-chat', text: '   ' }))
      .status,
    400,
  );
  await r.ctx.storage.put(
    'room-chat',
    Array.from({ length: 100 }, (_, i) => ({ id: String(i) })),
  );
  const message = {
    ...base,
    name: 'Impersonator',
    action: 'community-chat',
    text: '<script>alert(1)</script>',
  };
  assert.equal((await community(r, message)).status, 200);
  assert.equal((await community(r, message)).status, 429);
  const data = await (
    await community(r, { action: 'community-chat', operation: 'read' })
  ).json();
  assert.equal(data.messages.length, 100);
  assert.equal(data.messages[99].name, 'Bruno');
  assert.equal(data.messages[99].avatar, '😎');
  assert.equal(data.messages[0].id, '1');
  const profile = await (
    await community(r, {
      ...base,
      action: 'community-profile',
      operation: 'read',
    })
  ).json();
  assert.equal(profile.stats.messages, 1);
});
test('only the active publisher resume credential may assign or clear the shared match', async () => {
  const r = room(),
    resumeToken = 'host_resume_token_long_enough_for_room';
  const member = { publishing: false, resumeKey: await digest(resumeToken) };
  r.members.set({}, member);
  const request = { ...base, action: 'community-room', resumeToken, game };
  assert.equal((await community(r, request)).status, 403);
  member.publishing = true;
  assert.equal(
    (await community(r, { ...request, resumeToken: token })).status,
    403,
  );
  assert.equal((await community(r, request)).status, 200);
  assert.deepEqual(
    (
      await (
        await community(r, { action: 'community-room', operation: 'read' })
      ).json()
    ).game,
    game,
  );
  await community(r, { ...request, game: null });
  assert.equal(
    (
      await (
        await community(r, { action: 'community-room', operation: 'read' })
      ).json()
    ).game,
    null,
  );
});
