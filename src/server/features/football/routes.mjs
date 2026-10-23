import {
  dailyGames,
  nextClubGames,
  leagueTable,
  brazilDate,
} from './service.mjs';
import { geCompetition, publicGERound } from '../../integrations/ge.mjs';
import { clubHub } from '../clubs/service.mjs';
import { athletiba } from '../clubs/athletiba.mjs';
import { matchCenter } from '../match/service.mjs';
import { matchInsights } from '../match/insights.mjs';
import { playerRatings } from '../match/ratings.mjs';
import { json } from '../../http/responses.mjs';
export async function footballRoute(url, env, fetcher) {
  const path = url.pathname;

  try {
    let value;
    if (path === '/api/football/athletiba') value = await athletiba(fetcher);
    else if (path === '/api/football/brasileirao')
      value = publicGERound(
        await geCompetition(url.searchParams.get('serie') || 'a', fetcher),
      );
    else if (path === '/api/football/games')
      value = await dailyGames(
        url.searchParams.get('date') || brazilDate(new Date()),
        fetcher,
      );
    else if (path === '/api/football/clubs')
      value = await nextClubGames(fetcher);
    else if (path === '/api/football/hub') value = await clubHub(fetcher);
    else if (path === '/api/football/match')
      value = await matchCenter(
        url.searchParams.get('league'),
        url.searchParams.get('id'),
        fetcher,
      );
    else if (path === '/api/football/insights')
      value = await matchInsights(
        url.searchParams.get('league'),
        url.searchParams.get('id'),
        fetcher,
      );
    else if (path === '/api/football/ratings')
      value = await playerRatings(
        url.searchParams.get('league'),
        url.searchParams.get('id'),
        env,
        fetcher,
      );
    else if (path === '/api/football/standings')
      value = await leagueTable(
        url.searchParams.get('league') || 'bra.1',
        fetcher,
      );
    else return json({ error: 'not_found' }, 404);
    return json(value);
  } catch (error) {
    return json({ error: error.message || 'Dados indisponíveis' }, 502);
  }
}
