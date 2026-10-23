const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const clean = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const hash = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
export const avatars = ['⚽', '🔥', '🦉', '🌪️', '🟢', '🏆', '🤡', '😎'];

export function awardResult(saved) {
  const tally = (kind) => {
    const counts = new Map();
    for (const vote of Object.values(saved.votes))
      counts.set(vote[kind], (counts.get(vote[kind]) || 0) + 1);
    const max = Math.max(0, ...counts.values());
    return saved.players
      .filter((p) => counts.get(p.id) === max && max > 0)
      .map((p) => ({ ...p, votes: max }));
  };
  return {
    game: saved.game,
    total: Object.keys(saved.votes).length,
    craques: tally('craque'),
    bagres: tally('bagre'),
    updatedAt: saved.updatedAt,
  };
}

export async function community(room, data) {
  const store = room.ctx.storage;
  if (data.action === 'community-history') {
    const entries = await store.list({ prefix: 'award:', limit: 400 });
    return json({
      games: [...entries.values()]
        .sort((a, b) => b.game.date.localeCompare(a.game.date))
        .map(awardResult),
    });
  }
  if (data.action === 'community-room' && data.operation === 'read')
    return json({ game: (await store.get('room-game')) || null });
  if (data.action === 'community-chat' && data.operation === 'read')
    return json({ messages: (await store.get('room-chat')) || [] });
  if (data.action === 'community-awards' && data.operation === 'read') {
    const saved = await store.get(
      'award:' + data.game.leagueId + ':' + data.game.id,
    );
    return json(
      saved
        ? { ...awardResult(saved), votes: saved.votes }
        : { game: data.game, total: 0, craques: [], bagres: [], votes: {} },
    );
  }
  if (
    !/^[a-zA-Z0-9_-]{32,100}$/.test(
      typeof data.token === 'string' ? data.token : '',
    )
  )
    return json({ error: 'invalid_identity' }, 400);
  const id = await hash(data.token),
    profiles = (await store.get('pickprofiles')) || {};
  let profile = profiles[id];
  if (data.action === 'community-profile' && data.operation === 'read') {
    const picks = await store.list({ prefix: 'pickgame:', limit: 400 });
    const awards = await store.list({ prefix: 'award:', limit: 400 });
    const activity = (await store.get('activity:' + id)) || { messages: 0 };
    return json({
      id,
      profile: profile || null,
      stats: {
        predictions: [...picks.values()].filter((g) => g.votes?.[id]).length,
        awards: [...awards.values()].filter((g) => g.votes?.[id]).length,
        messages: activity.messages,
      },
    });
  }
  if (data.action === 'community-room') {
    if (
      !/^[a-zA-Z0-9_-]{32,100}$/.test(
        typeof data.resumeToken === 'string' ? data.resumeToken : '',
      )
    )
      return json({ error: 'host_only' }, 403);
    const resumeKey = await hash(data.resumeToken);
    if (
      ![...room.members.values()].some(
        (m) => m.publishing && m.resumeKey === resumeKey,
      )
    )
      return json({ error: 'host_only' }, 403);
    await store.put('room-game', data.game || null);
    return json({ game: data.game || null });
  }
  if (!profile && Object.keys(profiles).length >= 32)
    return json({ error: 'player_limit' }, 409);
  const name = clean(data.name, 24) || profile?.name;
  if (!name) return json({ error: 'invalid_identity' }, 400);
  if (Date.now() - ((await store.get('community-rate:' + id)) || 0) < 1000)
    return json({ error: 'try_later' }, 429);
  profile = { avatar: '⚽', team: '', ...profile, name: profile?.name || name };
  if (data.action === 'community-profile') {
    if (
      !avatars.includes(data.avatar) ||
      !['', 'cap', 'coxa', 'outro'].includes(data.team) ||
      !clean(data.name, 24)
    )
      return json({ error: 'invalid_profile' }, 400);
    profile = {
      ...profile,
      name,
      avatar: data.avatar,
      team: data.team,
      createdAt: profile.createdAt || Date.now(),
    };
  } else if (data.action === 'community-chat') {
    const text = clean(data.text, 500);
    if (!text) return json({ error: 'invalid_message' }, 400);
    const messages = (await store.get('room-chat')) || [];
    messages.push({
      id: crypto.randomUUID(),
      playerId: id,
      name: profile.name,
      avatar: profile.avatar,
      text,
      createdAt: Date.now(),
    });
    await store.put('room-chat', messages.slice(-100));
    const activity = (await store.get('activity:' + id)) || { messages: 0 };
    await store.put('activity:' + id, { messages: activity.messages + 1 });
  } else if (data.action === 'community-awards') {
    if (data.game.state !== 'post')
      return json({ error: 'awards_closed' }, 409);
    const players = data.players || [];
    if (
      !players.some((p) => p.id === data.craque) ||
      !players.some((p) => p.id === data.bagre) ||
      data.craque === data.bagre
    )
      return json({ error: 'invalid_award' }, 400);
    const key = 'award:' + data.game.leagueId + ':' + data.game.id;
    const previous = await store.get(key);
    if (
      !previous &&
      (await store.list({ prefix: 'award:', limit: 401 })).size >= 400
    )
      return json({ error: 'game_limit' }, 409);
    const saved = previous || { game: data.game, players, votes: {} };
    if (
      !saved.players.some((p) => p.id === data.craque) ||
      !saved.players.some((p) => p.id === data.bagre)
    )
      return json({ error: 'invalid_award' }, 400);
    saved.votes[id] = {
      craque: data.craque,
      bagre: data.bagre,
      name: profile.name,
    };
    saved.updatedAt = Date.now();
    await store.put(key, saved);
  } else return json({ error: 'unknown_action' }, 404);
  profiles[id] = profile;
  await store.put('pickprofiles', profiles);
  if (data.action === 'community-profile' && room.members) {
    for (const [socket, member] of room.members)
      if (member.playerId === id) {
        member.name = profile.name;
        member.avatar = profile.avatar;
        member.team = profile.team;
        socket.serializeAttachment(member);
      }
    room.broadcast();
  }
  await store.put('community-rate:' + id, Date.now());
  return json({ ok: true, id, profile });
}
