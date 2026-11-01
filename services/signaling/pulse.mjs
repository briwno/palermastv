const moods = ['pressao', 'sofrimento', 'ganhou'];
const json = (value, status = 200) => Response.json(value, { status });
export async function pulse(room, data, now = Date.now()) {
  if (!/^[a-z0-9_.]+\/\d{1,14}$/.test(data.context || ''))
    return json({ error: 'invalid_game' }, 400);
  const store = room.ctx.storage;
  const linked = await store.get('room-game');
  if (!linked || `${linked.leagueId}/${linked.id}` !== data.context)
    return json({ error: 'game_changed' }, 409);
  const key = 'pulse:' + data.context;
  const saved = (await store.get(key)) || { moods: {}, votes: {} };
  saved.moods = Object.fromEntries(
    Object.entries(saved.moods).filter(([, v]) => now - v.at < 60000),
  );
  if (data.operation === 'write') {
    if (!/^[a-zA-Z0-9_-]{32,100}$/.test(data.token || ''))
      return json({ error: 'invalid_identity' }, 400);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(data.token),
    );
    const id = Array.from(new Uint8Array(digest), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('');
    if (data.mood) {
      if (!moods.includes(data.mood))
        return json({ error: 'invalid_mood' }, 400);
      if (saved.moods[id]?.at > now - 2000)
        return json({ error: 'try_later' }, 429);
      if (!saved.moods[id] && Object.keys(saved.moods).length >= 32)
        return json({ error: 'player_limit' }, 409);
      saved.moods[id] = {
        mood: data.mood,
        name: String(data.name || 'Palerma').slice(0, 24),
        at: now,
      };
    } else {
      const player = data.players?.find((p) => p.id === data.mvp);
      if (!data.votingOpen) return json({ error: 'voting_closed' }, 409);
      if (!player) return json({ error: 'invalid_award' }, 400);
      if (!saved.votes[id] && Object.keys(saved.votes).length >= 32)
        return json({ error: 'player_limit' }, 409);
      saved.votes[id] = { id: player.id, name: player.name };
    }
    const entries = await store.list({ prefix: 'pulse:', limit: 401 });
    if (!entries.has(key) && entries.size >= 400)
      return json({ error: 'game_limit' }, 409);
    await store.put(key, saved);
  }
  const votes = new Map();
  for (const player of Object.values(saved.votes)) {
    const row = votes.get(player.id) || { ...player, votes: 0 };
    row.votes++;
    votes.set(player.id, row);
  }
  return json({
    moods: moods.map((mood) => ({
      mood,
      count: Object.values(saved.moods).filter((v) => v.mood === mood).length,
    })),
    reactions: Object.values(saved.moods).sort((a, b) => b.at - a.at),
    ranking: [...votes.values()].sort((a, b) => b.votes - a.votes),
  });
}
