import { fotmobLeague, sameFotmobGame } from '../../integrations/fotmob.mjs';
export async function predictionPeriod(game, fetcher = fetch) {
  const year = Number(game.date.slice(0, 4)),
    month = Number(game.date.slice(5, 7));
  const crossYear = ['eng.1', 'esp.1', 'ita.1', 'uefa.champions'].includes(
    game.leagueId,
  );
  const season = String(
    game.season || (crossYear && month < 7 ? year - 1 : year),
  );
  try {
    const data = await fotmobLeague(
      game.leagueId,
      fetcher,
      crossYear ? `${season}/${Number(season) + 1}` : season,
    );
    const matches = (data.fixtures?.allMatches || []).filter((m) =>
      sameFotmobGame(m, game),
    );
    const round =
      matches.length === 1 && /^\d{1,3}$/.test(String(matches[0].round))
        ? String(matches[0].round)
        : null;
    return { season, round };
  } catch {
    return { season, round: null };
  }
}
