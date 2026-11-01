import { feed, leagues, normalizeEvent, leagueTable } from './service.mjs';
export function nextGamesByTeam(games, now = Date.now()) {
  const next = {};
  for (const game of [...games].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date),
  )) {
    if (
      game.state !== 'pre' ||
      /postpon|adiad|cancel|suspend|abandon/i.test(game.status || '') ||
      Date.parse(game.date) <= now ||
      !Number.isFinite(Date.parse(game.date))
    )
      continue;
    for (const team of [game.home, game.away])
      if (team.id && !next[team.id]) next[team.id] = game;
  }
  return next;
}
export async function upcomingGames(id, fetcher = fetch) {
  const league = leagues.find((l) => l.id === id);
  if (!league) throw Error('Competição inválida');
  const table = await leagueTable(id, fetcher);
  const teams = [
    ...new Map(
      table.groups
        .flatMap((g) => g.rows)
        .filter((t) => /^\d{1,12}$/.test(t.id))
        .map((t) => [t.id, t]),
    ).values(),
  ].slice(0, 64);
  const horizon = Date.now() + 60 * 86400000;
  const pages = await Promise.allSettled(
    teams.map(async (team) => {
      const data = await feed(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${team.id}/schedule?fixture=true&lang=pt&region=br`,
        300,
        fetcher,
      );
      if (!Array.isArray(data.events)) throw Error('Agenda indisponível');
      return data.events
        .map((e) => {
          const competition = leagues.find((l) => l.id === e.league?.slug);
          return competition ? normalizeEvent(e, competition) : null;
        })
        .filter((g) => g && Date.parse(g.date) <= horizon);
    }),
  );
  if (pages.length && pages.every((p) => p.status === 'rejected'))
    throw Error('Agenda indisponível');
  return {
    leagueId: id,
    teams: nextGamesByTeam(
      pages.filter((p) => p.status === 'fulfilled').flatMap((p) => p.value),
    ),
    unavailable: teams
      .filter((_, i) => pages[i].status === 'rejected')
      .map((t) => t.name),
    source: 'ESPN',
    checkedAt: new Date().toISOString(),
    horizonDays: 60,
  };
}
