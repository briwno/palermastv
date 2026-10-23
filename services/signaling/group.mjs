import { lounge } from './lounge.mjs';
const response = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = async (token) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
export function predictionPoints(vote, result) {
  if (vote.home === result.home && vote.away === result.away) return 5;
  return Math.sign(vote.home - vote.away) ===
    Math.sign(result.home - result.away)
    ? 2
    : 0;
}
export async function handleGroup(room, data) {
  if (data.action === 'lounge') return lounge(room, data);
  const store = room.ctx.storage;
  if (data.action === 'status') {
    const state = room.snapshot(),
      publisher = state.members.find((m) => m.id === state.publisher);
    return response({
      members: state.members,
      publisher: publisher ? { name: publisher.name } : null,
      viewers: publisher ? state.members.length - 1 : 0,
      capacity: 6,
    });
  }
  if (data.action === 'pending') {
    const entries = await store.list({ prefix: 'pickgame:', limit: 400 });
    return response({
      games: [...entries.values()]
        .filter((g) => Date.parse(g.date) < Date.now() && !g.result)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 8)
        .map((g) => ({ league: g.league, id: g.id })),
    });
  }
  if (data.action === 'settle') {
    for (const item of (Array.isArray(data.results) ? data.results : []).slice(
      0,
      8,
    )) {
      if (
        !/^\d+$/.test(item.id || '') ||
        !/^[a-z0-9_.]+$/.test(item.league || '') ||
        !Number.isInteger(item.home) ||
        !Number.isInteger(item.away) ||
        item.home < 0 ||
        item.away < 0
      )
        continue;
      const key = 'pickgame:' + item.league + ':' + item.id;
      const game = await store.get(key);
      if (game) {
        game.result = { home: item.home, away: item.away };
        await store.put(key, game);
      }
    }
    return response({ ok: true });
  }
  if (data.action === 'ranking') {
    const entries = await store.list({ prefix: 'pickgame:', limit: 400 }),
      profiles = (await store.get('pickprofiles')) || {},
      scores = new Map();
    for (const game of entries.values())
      for (const [id, vote] of Object.entries(game.votes || {})) {
        if (!scores.has(id))
          scores.set(id, {
            id,
            name: profiles[id]?.name || vote.name,
            points: 0,
            exact: 0,
            results: 0,
            played: 0,
            pending: 0,
          });
        const person = scores.get(id);
        if (!game.result) {
          person.pending++;
          continue;
        }
        const pts = predictionPoints(vote, game.result);
        person.points += pts;
        person.played++;
        if (pts === 5) person.exact++;
        else if (pts === 2) person.results++;
      }
    return response({
      ranking: [...scores.values()].sort(
        (a, b) =>
          b.points - a.points ||
          b.exact - a.exact ||
          a.name.localeCompare(b.name),
      ),
      rules: { exact: 5, result: 2 },
      settled: [...entries.values()].filter((g) => g.result).length,
    });
  }
  const g = data.game;
  if (
    !g ||
    !/^\d{1,14}$/.test(g.id || '') ||
    !/^[a-z0-9_.]+$/.test(g.league || '') ||
    !Number.isFinite(Date.parse(g.date))
  )
    return response({ error: 'invalid_game' }, 400);
  const key = 'pickgame:' + g.league + ':' + g.id;
  if (data.action === 'picks') {
    const saved = await store.get(key);
    return response({
      votes: Object.entries(saved?.votes || {}).map(([id, v]) => ({
        id,
        name: v.name,
        home: v.home,
        away: v.away,
        points: saved.result ? predictionPoints(v, saved.result) : null,
      })),
      result: saved?.result || null,
      locked: g.state !== 'pre' || Date.parse(g.date) <= Date.now(),
    });
  }
  if (data.action !== 'vote') return response({ error: 'unknown_action' }, 404);
  if (g.state !== 'pre' || Date.parse(g.date) <= Date.now())
    return response({ error: 'picks_closed' }, 409);
  if (
    typeof data.token !== 'string' ||
    !/^[a-zA-Z0-9_-]{32,100}$/.test(data.token) ||
    typeof data.name !== 'string' ||
    !data.name.trim() ||
    !Number.isInteger(data.home) ||
    !Number.isInteger(data.away) ||
    data.home < 0 ||
    data.home > 20 ||
    data.away < 0 ||
    data.away > 20
  )
    return response({ error: 'invalid_pick' }, 400);
  const id = await digest(data.token),
    profiles = (await store.get('pickprofiles')) || {};
  if (!profiles[id] && Object.keys(profiles).length >= 32)
    return response({ error: 'player_limit' }, 409);
  if (profiles[id]?.updatedAt > Date.now() - 2000)
    return response({ error: 'try_later' }, 429);
  let game = await store.get(key);
  if (!game) {
    if ((await store.list({ prefix: 'pickgame:', limit: 401 })).size >= 400)
      return response({ error: 'game_limit' }, 409);
    game = {
      id: g.id,
      league: g.league,
      date: g.date,
      homeName: g.homeName,
      awayName: g.awayName,
      votes: {},
    };
  }
  if (game.result || Date.parse(game.date) <= Date.now())
    return response({ error: 'picks_closed' }, 409);
  const name = data.name.trim().slice(0, 24);
  profiles[id] = { name, updatedAt: Date.now() };
  game.votes[id] = { name, home: data.home, away: data.away };
  await store.put('pickprofiles', profiles);
  await store.put(key, game);
  return response({ ok: true, id });
}
