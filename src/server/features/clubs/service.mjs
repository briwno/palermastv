import {
  feed,
  normalizeEvent,
  leagues,
  nextClubGames,
} from '../football/service.mjs';
import { geClubNews, relevantClubText } from '../../integrations/ge-news.mjs';
import {
  fotmobTeam,
  fotmobClubs,
  normalizeAbsences,
  recentForm,
} from '../../integrations/fotmob.mjs';
export const clubs = [
  {
    key: 'cap',
    id: '3458',
    name: 'Athletico Paranaense',
    short: 'Athletico',
    nickname: 'Furacão',
    founded: '26 de março de 1924',
    stadium: 'Arena da Baixada',
    city: 'Curitiba · PR',
    official: 'https://www.athletico.com.br/',
    highlights: [
      'Brasileirão 2001',
      'Copa do Brasil 2019',
      'Sul-Americana 2018 e 2021',
    ],
  },
  {
    key: 'coxa',
    id: '3456',
    name: 'Coritiba Foot Ball Club',
    short: 'Coritiba',
    nickname: 'Coxa',
    founded: '12 de outubro de 1909',
    stadium: 'Couto Pereira',
    city: 'Curitiba · PR',
    official: 'https://www.coritiba.com.br/',
    highlights: [
      'Brasileirão 1985',
      'Série B 2007 e 2010',
      'Torneio do Povo 1973',
    ],
  },
];
const plain = (v) =>
  String(v || '')
    .replace(/<[^>]*>/g, '')
    .trim();
function safeURL(value, image = false) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      (/(^|\.)espn\.com(\.br)?$/.test(u.hostname) ||
        (image &&
          [
            'a.espncdn.com',
            'espnmedia-cdn.akamaized.net',
            'a1.espncdn.com',
            'a2.espncdn.com',
            'a3.espncdn.com',
          ].includes(u.hostname)))
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function normalizeNews(articles, club) {
  return (articles || [])
    .filter(
      (a) =>
        relevantClubText(a.headline + ' ' + (a.description || ''), club.key) &&
        a.categories?.some(
          (c) =>
            c.type === 'team' && String(c.teamId || c.team?.id) === club.id,
        ),
    )
    .map((a) => ({
      id: String(a.id),
      title: plain(a.headline).slice(0, 180),
      date: a.published || a.lastModified,
      url: safeURL(a.links?.web?.href),
      image: safeURL(a.images?.[0]?.url, true),
      club: club.key,
      clubName: club.short,
      source: 'ESPN',
      type: a.type === 'Media' ? 'Vídeo' : 'Notícia',
    }))
    .filter((a) => a.title && a.url && Number.isFinite(Date.parse(a.date)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
}
export async function clubHub(fetcher = fetch) {
  const upcomingPromise = nextClubGames(fetcher);
  const results = await Promise.all(
    clubs.map(async (club) => {
      const base =
        'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/';
      const [news, profile, results, geNews, fotmob] = await Promise.allSettled(
        [
          feed(
            base + `news?team=${club.id}&limit=12&lang=pt&region=br`,
            600,
            fetcher,
          ),
          feed(base + `teams/${club.id}?lang=pt&region=br`, 600, fetcher),
          feed(
            base + `teams/${club.id}/schedule?lang=pt&region=br`,
            300,
            fetcher,
          ),
          geClubNews(club, fetcher),
          fotmobTeam(fotmobClubs[club.key], fetcher),
        ],
      );
      const team = profile.status === 'fulfilled' ? profile.value.team : null,
        record = team?.record?.items?.find((r) => r.type === 'total');
      const stats = Object.fromEntries(
        (record?.stats || []).map((s) => [s.name, s.value]),
      );
      const lastGames =
        results.status === 'fulfilled'
          ? (results.value.events || [])
              .map((e) =>
                normalizeEvent(
                  e,
                  leagues.find((l) => l.id === e.league?.slug) || leagues[0],
                ),
              )
              .filter((g) => g?.state === 'post')
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 5)
          : [];
      return {
        ...club,
        logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${club.id}.png`,
        stats: {
          rank: stats.rank ?? null,
          points: stats.points ?? null,
          played: stats.gamesPlayed ?? null,
          wins: stats.wins ?? null,
          draws: stats.ties ?? null,
          losses: stats.losses ?? null,
        },
        lastGames,
        nextGame:
          (await upcomingPromise).clubs.find((c) => c.key === club.key)?.game ||
          null,
        form:
          fotmob.status === 'fulfilled'
            ? recentForm(
                fotmob.value.fixtures?.allFixtures?.fixtures || [],
                fotmobClubs[club.key],
              )
            : [],
        absences:
          fotmob.status === 'fulfilled'
            ? normalizeAbsences(fotmob.value)
            : { available: false, players: [] },
        articles: [
          ...(geNews.status === 'fulfilled' ? geNews.value : []),
          ...(news.status === 'fulfilled'
            ? normalizeNews(news.value.articles, club)
            : []),
        ]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 8),
        newsUnavailable:
          news.status === 'rejected' && geNews.status === 'rejected',
        newsSources: [
          geNews.status === 'fulfilled' ? 'ge' : null,
          news.status === 'fulfilled' ? 'ESPN' : null,
        ].filter(Boolean),
        profileUnavailable: profile.status === 'rejected',
      };
    }),
  );
  return {
    clubs: results,
    source: 'ESPN · ge · FotMob',
    checkedAt: new Date().toISOString(),
    refreshSeconds: 600,
  };
}
