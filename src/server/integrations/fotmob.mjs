import { feed } from './espn.mjs';
import { teamKey } from './ge.mjs';
export const fotmobLeagues = {
  'bra.1': 268,
  'bra.2': 8814,
  'eng.1': 47,
  'esp.1': 87,
  'ita.1': 55,
  'uefa.champions': 42,
  'conmebol.libertadores': 44,
};
export const fotmobClubs = { cap: 10273, coxa: 9767 };
const base = 'https://www.fotmob.com/api/data/';
// Keep ESPN identities: FotMob match/team IDs belong to a different namespace.
export async function liveFotmobGame(game, fetcher = fetch) {
  if (!fotmobLeagues[game.leagueId]) return game;
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(game.date))
    .replaceAll('-', '');
  const data = await feed(
    base + 'matches?date=' + date + '&timezone=America%2FSao_Paulo',
    15,
    fetcher,
  );
  const candidates = (data.leagues || [])
    .filter((l) => Number(l.primaryId || l.id) === fotmobLeagues[game.leagueId])
    .flatMap((l) => l.matches || [])
    .filter((item) => sameFotmobGame(item, game));
  if (candidates.length !== 1) return game;
  const item = candidates[0],
    status = item.status;
  if (
    !status?.started ||
    status.cancelled ||
    status.awarded ||
    (game.state === 'post' && !status.finished)
  )
    return game;
  if (
    ![item.home.score, item.away.score].every(
      (s) => Number.isInteger(s) && s >= 0,
    )
  )
    return game;
  return {
    ...game,
    homeScore: item.home.score,
    awayScore: item.away.score,
    state: status.finished ? 'post' : 'in',
    clock: status.liveTime?.short || '',
    status: status.finished ? 'Encerrado' : 'Ao vivo',
    scoreSource: 'FotMob',
  };
}
export const fotmobTeam = (id, fetcher = fetch) => {
  if (!/^\d{1,12}$/.test(String(id))) throw Error('Time inválido');
  return feed(base + 'teams?id=' + id, 600, fetcher);
};
export const fotmobLeague = (league, fetcher = fetch, season = '') => {
  if (!fotmobLeagues[league]) throw Error('Sem cobertura complementar');
  if (season && !/^\d{4}(\/\d{4})?$/.test(season))
    throw Error('Temporada inválida');
  return feed(
    base +
      'leagues?id=' +
      fotmobLeagues[league] +
      (season ? '&season=' + encodeURIComponent(season) : ''),
    300,
    fetcher,
  );
};
export const fotmobMatch = (id, fetcher = fetch) => {
  if (!/^\d{1,14}$/.test(String(id))) throw Error('Partida inválida');
  return feed(base + 'matchDetails?matchId=' + id, 120, fetcher);
};
export function sameFotmobGame(item, game) {
  return (
    teamKey(item.home?.name) === teamKey(game.home.name) &&
    teamKey(item.away?.name) === teamKey(game.away.name) &&
    Math.abs(Date.parse(item.status?.utcTime) - Date.parse(game.date)) <=
      3 * 3600000
  );
}
export function fixtureScore(item) {
  if (!item.status?.finished || item.status?.cancelled || item.status?.awarded)
    return null;
  const score = String(item.status.scoreStr || '').match(
    /^(\d+)\s*[-–]\s*(\d+)$/,
  );
  const home = score ? Number(score[1]) : item.home?.score;
  const away = score ? Number(score[2]) : item.away?.score;
  return Number.isFinite(home) &&
    Number.isFinite(away) &&
    home >= 0 &&
    away >= 0
    ? { home, away }
    : null;
}
export function recentForm(fixtures, teamId, before = Date.now(), limit = 5) {
  return fixtures
    .filter(
      (g) =>
        fixtureScore(g) &&
        Date.parse(g.status.utcTime) < before &&
        [String(g.home?.id), String(g.away?.id)].includes(String(teamId)),
    )
    .sort((a, b) => Date.parse(b.status.utcTime) - Date.parse(a.status.utcTime))
    .slice(0, limit)
    .map((g) => {
      const s = fixtureScore(g),
        home = String(g.home.id) === String(teamId),
        own = home ? s.home : s.away,
        against = home ? s.away : s.home;
      return {
        result: own > against ? 'V' : own === against ? 'E' : 'D',
        own,
        against,
        opponent: home ? g.away.name : g.home.name,
        date: g.status.utcTime,
      };
    });
}
export function normalizeAbsences(team) {
  const groups = team.squad?.squad;
  if (!Array.isArray(groups)) return { available: false, players: [] };
  return {
    available: true,
    players: groups
      .flatMap((g) => g.members || [])
      .filter((p) => p.injury || p.injured || p.suspended)
      .map((p) => ({
        name: p.name,
        reason: p.suspended ? 'Suspensão informada' : 'Lesão informada',
        return: p.injury?.expectedReturn || null,
      })),
  };
}
const zoneLabel = (title) =>
  ({
    'Copa Libertadores qualification': 'Pré-Libertadores',
    'Copa Libertadores': 'Libertadores',
    'Copa Sudamericana': 'Sul-Americana',
    Relegation: 'Rebaixamento',
    Promotion: 'Acesso',
    'Champions League': 'Champions League',
    'Champions League qualification': 'Pré-Champions',
    'Europa League': 'Europa League',
    'Conference League qualification': 'Pré-Conference',
  })[title] || title;
export function enrichStandings(groups, data) {
  const tables = (data.table || []).map((t) => t.data).filter(Boolean);
  return groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => {
      const table = tables.find((t) =>
        t.table?.all?.some((r) => teamKey(r.name) === teamKey(row.name)),
      );
      const team = table?.table.all.find(
        (r) => teamKey(r.name) === teamKey(row.name),
      );
      if (!team) return row;
      const zone = table.legend?.find((z) => z.indices?.includes(row.rank - 1));
      return {
        ...row,
        form: recentForm(data.fixtures?.allMatches || [], team.id),
        zone: zone
          ? {
              label: zoneLabel(zone.title),
              color: /^#[0-9a-f]{6}$/i.test(zone.color)
                ? zone.color
                : '#929991',
            }
          : row.zone || null,
      };
    }),
  }));
}
