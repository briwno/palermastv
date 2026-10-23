import { feed, normalizeEvent, leagues } from '../football/service.mjs';
import { clubs } from './service.mjs';
export function isAthletiba(game) {
  return (
    [game?.home?.id, game?.away?.id].includes('3458') &&
    [game?.home?.id, game?.away?.id].includes('3456')
  );
}
export async function athletiba(fetcher = fetch) {
  const year = Number(
    new Intl.DateTimeFormat('en', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
    }).format(new Date()),
  );
  const seasons = [year, year - 1, year - 2];
  const requests = [
    ...seasons.map((season) => ({ season, fixture: false })),
    { season: year, fixture: true },
  ];
  const results = await Promise.allSettled(
    requests.map(async ({ season, fixture }) => {
      const data = await feed(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/teams/3458/schedule?season=${season}${fixture ? '&fixture=true' : ''}&lang=pt&region=br`,
        900,
        fetcher,
      );
      if (!Array.isArray(data.events)) throw Error('Calendário indisponível');
      return data.events
        .map((e) => {
          const slug = e.league?.slug || e.leagues?.[0]?.slug;
          const league = leagues.find((l) => l.id === slug) || {
            id: slug || 'bra.1',
            name:
              e.league?.name ||
              e.leagues?.[0]?.name ||
              'Competição não informada',
            region: 'brasil',
          };
          const game = normalizeEvent(e, league);
          return game
            ? {
                ...game,
                detailsAvailable: leagues.some((l) => l.id === game.leagueId),
              }
            : null;
        })
        .filter(
          (g) =>
            g && isAthletiba(g) && seasons.includes(Number(g.date.slice(0, 4))),
        );
    }),
  );
  if (results.every((r) => r.status === 'rejected'))
    throw Error('Não foi possível consultar os clássicos.');
  const games = [
    ...new Map(
      results
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .map((g) => [g.id, g]),
    ).values(),
  ];
  const history = games
    .filter((g) => g.state === 'post')
    .sort((a, b) => b.date.localeCompare(a.date));
  const finished = history.filter(
    (g) =>
      g.homeScore !== null &&
      g.awayScore !== null &&
      Number.isFinite(Number(g.homeScore)) &&
      Number.isFinite(Number(g.awayScore)),
  );
  const wins = (id) =>
    finished.filter(
      (g) =>
        Number(g.homeScore) !== Number(g.awayScore) &&
        (Number(g.homeScore) > Number(g.awayScore) ? g.home.id : g.away.id) ===
          id,
    ).length;
  return {
    history,
    upcoming: games
      .filter((g) => g.state !== 'post')
      .sort((a, b) => a.date.localeCompare(b.date)),
    summary: {
      cap: wins('3458'),
      coxa: wins('3456'),
      draws: finished.filter((g) => Number(g.homeScore) === Number(g.awayScore))
        .length,
      counted: finished.length,
    },
    clubs: clubs.map(
      ({
        id,
        key,
        name,
        nickname,
        founded,
        stadium,
        official,
        highlights,
      }) => ({
        id,
        key,
        name,
        nickname,
        founded,
        stadium,
        official,
        highlights,
      }),
    ),
    seasons,
    partial: results.some((r) => r.status === 'rejected'),
    source: 'ESPN · calendário do Athletico',
    checkedAt: new Date().toISOString(),
  };
}
