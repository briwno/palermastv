import brasileiro from '../vendor/brasileirao-ge.cjs';
const memory = new Map(),
  jobs = new Map();
export const geSeries = { 'bra.1': 'a', 'bra.2': 'b' };
export function teamKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/athletico[- ]?(?:paranaense|pr)?|atletico[- ]?pr/g, 'athletico')
    .replace(/\b(red bull|rb)\s*bragantino\b/g, 'bragantino')
    .replace(/\b(atletico[- ]?mg|atletico mineiro)\b/g, 'atleticomg')
    .replace(/\b(fc|cf|sc|ec|foot ball club|futebol clube)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}
const safeURL = (value, hosts) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && hosts.includes(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
};
export async function geCompetition(serie, fetcher = fetch) {
  if (!['a', 'b', 'c', 'd'].includes(serie)) throw Error('Série inválida.');
  const key = 'ge-v1:' + serie,
    old = memory.get(key);
  if (old?.expires > Date.now()) return old.data;
  if (jobs.has(key)) return jobs.get(key);
  const job = (async () => {
    let cache;
    const url = 'https://palermastv-ge.internal/' + serie;
    try {
      cache = typeof caches !== 'undefined' ? caches.default : null;
      const cached = await cache?.match(url);
      if (cached) return await cached.json();
    } catch {}
    const d = await brasileiro.getCompetition(serie, {
      fetch: fetcher,
      signal: AbortSignal.timeout(10000),
    });
    if (
      d.competition.season !== new Date().getFullYear() ||
      !d.tables?.some((t) => t.entries.length)
    )
      throw Error('O ge não retornou a temporada atual.');
    const data = {
      ...d,
      source: 'ge',
      library: 'campeonato-brasileiro-api',
      checkedAt: new Date().toISOString(),
      refreshSeconds: 60,
    };
    memory.set(key, { data, expires: Date.now() + 60000 });
    try {
      await cache?.put(
        url,
        Response.json(data, {
          headers: { 'Cache-Control': 'public,max-age=60' },
        }),
      );
    } catch {}
    return data;
  })();
  jobs.set(key, job);
  try {
    return await job;
  } finally {
    jobs.delete(key);
  }
}
export function geStandings(data, espnGroups = []) {
  const espn = espnGroups.flatMap((g) => g.rows),
    byName = new Map(espn.map((r) => [teamKey(r.name), r]));
  return data.tables.map((t) => ({
    name: t.name,
    rows: t.entries.map((e) => {
      const existing = byName.get(teamKey(e.team.name));
      const known =
        teamKey(e.team.name) === 'athletico'
          ? '3458'
          : teamKey(e.team.name) === 'coritiba'
            ? '3456'
            : null;
      return {
        rank: e.position,
        id: existing?.id || known || 'ge:' + e.team.id,
        name: e.team.name,
        logo:
          safeURL(e.team.badge, ['s.sde.globo.com']) || existing?.logo || null,
        points: e.points,
        played: e.matches,
        wins: e.wins,
        draws: e.draws,
        losses: e.losses,
        goalDifference: e.goalDifference,
        goalsFor: e.goalsFor,
        goalsAgainst: e.goalsAgainst,
        recentForm: e.recentForm,
      };
    }),
  }));
}
export function markGELive(groups, games) {
  return groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => {
      const game = games.find(
        (m) =>
          m.state === 'in' &&
          [m.home.name, m.away.name].some(
            (n) => teamKey(n) === teamKey(r.name),
          ),
      );
      if (!game) return r;
      const home = teamKey(game.home.name) === teamKey(r.name);
      return {
        ...r,
        live: {
          gameId: game.id,
          clock: game.clock,
          status: game.status,
          opponent: home ? game.away.name : game.home.name,
          score: game.homeScore + ' × ' + game.awayScore,
          home: game.home.name,
          away: game.away.name,
          projected: false,
        },
      };
    }),
  }));
}
export function publicGERound(data) {
  return {
    source: 'ge',
    checkedAt: data.checkedAt,
    competition: data.competition.name,
    season: data.competition.season,
    rounds: data.rounds.map((r) => ({
      number: r.number,
      group: r.groupName,
      matches: r.matches.map((m) => ({
        id: m.id,
        home: m.homeTeam.name,
        away: m.awayTeam.name,
        homeLogo: safeURL(m.homeTeam.badge, ['s.sde.globo.com']),
        awayLogo: safeURL(m.awayTeam.badge, ['s.sde.globo.com']),
        day: m.date,
        time: m.time,
        status: m.status,
        homeScore: m.score.home,
        awayScore: m.score.away,
        venue: m.venue,
        sourceUrl: safeURL(m.coverage?.url, ['ge.globo.com']),
      })),
    })),
  };
}
