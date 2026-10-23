import { matchCenter } from './service.mjs';
const memory = new Map();
const canonical = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/athletico[- ]?(?:paranaense|pr)|atletico[- ]?pr/g, 'athletico')
    .replace(/\b(fc|cf|sc|foot ball club|futebol clube)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
export function sameTeams(f, g) {
  return (
    canonical(f.teams?.home?.name) === canonical(g.home.name) &&
    canonical(f.teams?.away?.name) === canonical(g.away.name) &&
    Math.abs(Date.parse(f.fixture?.date) - Date.parse(g.date)) < 5400000
  );
}
export function normalizeRatings(rows) {
  return (Array.isArray(rows) ? rows : []).map((t) => ({
    team: t.team?.name || 'Time',
    players: (t.players || [])
      .map((p) => {
        const s = p.statistics?.[0],
          rating = Number(s?.games?.rating);
        return {
          name: p.player?.name || 'Jogador',
          rating:
            s?.games?.rating !== null &&
            s?.games?.rating !== undefined &&
            Number.isFinite(rating)
              ? rating
              : null,
          minutes: s?.games?.minutes ?? null,
          goals: s?.goals?.total ?? 0,
          assists: s?.goals?.assists ?? 0,
        };
      })
      .filter((p) => p.rating !== null)
      .sort((a, b) => b.rating - a.rating),
  }));
}
async function cached(key, ttl, job) {
  const old = memory.get(key);
  if (old?.expires > Date.now()) return old.value;
  let cache;
  try {
    cache = typeof caches !== 'undefined' ? caches.default : null;
    const r = await cache?.match(
      'https://ratings.palermastv.internal/' + encodeURIComponent(key),
    );
    if (r) return await r.json();
  } catch {}
  const value = await job();
  if (memory.size > 100) memory.clear();
  memory.set(key, { value, expires: Date.now() + ttl * 1000 });
  try {
    await cache?.put(
      'https://ratings.palermastv.internal/' + encodeURIComponent(key),
      Response.json(value, {
        headers: { 'Cache-Control': 'public,max-age=' + ttl },
      }),
    );
  } catch {}
  return value;
}
export async function playerRatings(league, id, env, fetcher = fetch) {
  if (!env.API_FOOTBALL_KEY)
    return {
      source: 'API-Football',
      state: 'unconfigured',
      message: 'Notas ainda não conectadas.',
      teams: [],
    };
  const { game } = await matchCenter(league, id, fetcher);
  if (game.state === 'pre')
    return {
      source: 'API-Football',
      state: 'upcoming',
      message: 'As notas aparecem depois que os jogadores entram em campo.',
      teams: [],
    };
  const year = Number(game.date.slice(0, 4)),
    season =
      ['eng.1', 'esp.1', 'ita.1', 'uefa.champions'].includes(league) &&
      Number(game.date.slice(5, 7)) < 7
        ? year - 1
        : year;
  return cached(league + ':' + id, 3600, async () => {
    const base = {
      source: 'API-Football',
      checkedAt: new Date().toISOString(),
      teams: [],
    };
    async function request(path) {
      const r = await fetcher('https://v3.football.api-sports.io' + path, {
        headers: { 'x-apisports-key': env.API_FOOTBALL_KEY },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error('provider');
      return r.json();
    }
    try {
      const entitlement = await cached(
        'season-access:' + season,
        21600,
        async () => {
          const d = await request(
            '/fixtures?league=71&season=' + season + '&date=' + game.day,
          );
          const plan = d.errors?.plan;
          return plan
            ? {
                blocked: true,
                message:
                  'Seu plano gratuito da API-Football não inclui esta temporada.',
              }
            : { blocked: false };
        },
      );
      if (entitlement.blocked)
        return { ...base, state: 'restricted', message: entitlement.message };
      const day = await cached(
        'fixtures:' + season + ':' + game.day,
        3600,
        () =>
          request(
            '/fixtures?date=' + game.day + '&timezone=America%2FSao_Paulo',
          ),
      );
      if (Object.keys(day.errors || {}).length)
        return {
          ...base,
          state: 'unavailable',
          message: 'A fonte não liberou as notas deste jogo agora.',
        };
      const matches = (day.response || []).filter((f) => sameTeams(f, game));
      if (matches.length !== 1)
        return {
          ...base,
          state: 'unavailable',
          message:
            'Este jogo não foi identificado com segurança na fonte de notas.',
        };
      const result = await request(
        '/fixtures/players?fixture=' + matches[0].fixture.id,
      );
      if (Object.keys(result.errors || {}).length)
        return {
          ...base,
          state: 'unavailable',
          message:
            'As notas não estão disponíveis no seu plano para esta partida.',
        };
      const teams = normalizeRatings(result.response);
      return {
        ...base,
        state: teams.some((t) => t.players.length)
          ? 'available'
          : 'unavailable',
        message: teams.some((t) => t.players.length)
          ? 'Notas de 0 a 10 · API-Football'
          : 'A fonte ainda não publicou notas para esta partida.',
        teams,
      };
    } catch {
      return {
        ...base,
        state: 'unavailable',
        message: 'Não foi possível consultar a fonte de notas agora.',
      };
    }
  });
}
