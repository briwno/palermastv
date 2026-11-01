import {
  enrichPlayerPhotos,
  matchPhotoPlayer,
} from '../../integrations/player-photos.mjs';
import { fotmobTeam, fotmobClubs } from '../../integrations/fotmob.mjs';
import {
  feed,
  leagues,
  normalizeEvent,
  leagueTable,
} from '../football/service.mjs';
import { clubs, clubHub } from './service.mjs';
const base = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const plain = (v) =>
  String(v || '')
    .replace(/<[^>]*>/g, '')
    .trim();
const safe = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' &&
      /(^|\.)(espn\.com(\.br)?|espncdn\.com)$/.test(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
};
export function marketCategory(title) {
  const t = plain(title).toLowerCase();
  if (
    /les[aã]o|lesion|machuc|suspens|desfalq|departamento m[eé]dico|cirurg/.test(
      t,
    )
  )
    return 'absences';
  if (
    /rumor|sonda|interess|negocia|pode |quer |mira |avalia |n[aã]o |desmente|descarta/.test(
      t,
    )
  )
    return /contrat|refor[cç]|negocia|transfer|mercado|jogador|atacante|volante|zagueiro|goleiro|meia/.test(
      t,
    )
      ? 'rumors'
      : null;
  if (
    /(anuncia|oficializa|confirma|contrata|assina com).*(contrat|refor[cç]|jogador|atacante|volante|zagueiro|goleiro|meia|lateral)|contrata[cç][aã]o (confirmada|anunciada|oficializada)/.test(
      t,
    )
  )
    return 'confirmed';
  return null;
}
export async function marketCenter(fetcher = fetch) {
  const hub = await clubHub(fetcher);
  return {
    checkedAt: hub.checkedAt,
    clubs: hub.clubs.map((club) => ({
      id: club.id,
      name: club.name,
      absences: club.absences,
      sourceUrl: `https://www.fotmob.com/teams/${club.key === 'cap' ? 10273 : 9767}/overview`,
      items: club.articles
        .map((article) => ({
          ...article,
          category: marketCategory(article.title),
        }))
        .filter((a) => a.category),
    })),
  };
}
export async function teamPage(id, fetcher = fetch) {
  if (!/^\d{1,12}$/.test(id || '')) throw Error('Time inválido');
  const [profile, schedule, future] = await Promise.all([
    feed(base + `all/teams/${id}?lang=pt&region=br`, 600, fetcher),
    feed(
      base + `all/teams/${id}/schedule?lang=pt&region=br`,
      300,
      fetcher,
    ).catch(() => null),
    feed(
      base + `all/teams/${id}/schedule?fixture=true&lang=pt&region=br`,
      300,
      fetcher,
    ).catch(() => null),
  ]);
  const team = profile.team;
  if (!team?.id || String(team.id) !== id) throw Error('Time não encontrado');
  const events = [
    ...new Map(
      [...(schedule?.events || []), ...(future?.events || [])].map((e) => [
        e.id,
        e,
      ]),
    ).values(),
  ];
  const eventLeague = (e) =>
    leagues.find(
      (l) => l.id === (e.league?.slug || e.league?.abbreviation?.toLowerCase()),
    );
  const mainLeague = [...events]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(eventLeague)
    .find(
      (l) => l && ['bra.1', 'bra.2', 'eng.1', 'esp.1', 'ita.1'].includes(l.id),
    );
  const league =
    mainLeague ||
    leagues.find((l) =>
      team.links?.some(
        (link) => link.rel?.includes('standings') && link.href.endsWith(l.id),
      ),
    );
  const [roster, table, news, hub] = await Promise.allSettled([
    league
      ? feed(
          base + `${league.id}/teams/${id}/roster?lang=pt&region=br`,
          600,
          fetcher,
        )
      : Promise.reject(),
    league ? leagueTable(league.id, fetcher) : Promise.reject(),
    feed(
      base +
        `${league?.id || 'all'}/news?team=${id}&limit=20&lang=pt&region=br`,
      600,
      fetcher,
    ),
    clubs.some((c) => c.id === id) ? clubHub(fetcher) : Promise.resolve(null),
  ]);
  const games = events
    .map((e) => {
      const l = eventLeague(e);
      return l ? normalizeEvent(e, l) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const club =
    hub.status === 'fulfilled'
      ? hub.value?.clubs.find((c) => c.id === id)
      : null;
  const articles =
    club?.articles ||
    (news.status === 'fulfilled'
      ? (news.value.articles || [])
          .filter((a) =>
            a.categories?.some((c) => String(c.teamId || c.team?.id) === id),
          )
          .map((a) => ({
            title: plain(a.headline),
            url: safe(a.links?.web?.href),
            date: a.published,
            source: 'ESPN',
          }))
          .filter((a) => a.url && a.date)
          .slice(0, 8)
      : []);
  const squad =
    roster.status === 'fulfilled'
      ? (roster.value.athletes || []).map((p) => ({
          id: String(p.id),
          name: plain(p.displayName),
          shortName: plain(p.shortName),
          jersey: plain(p.jersey),
          position: plain(p.position?.displayName),
          photo:
            safe(p.headshot?.href) ||
            (/^\d+$/.test(String(p.id))
              ? `https://a.espncdn.com/i/headshots/soccer/players/full/${p.id}.png`
              : null),
        }))
      : [];
  const recent = [...games].reverse().find((g) => g.state === 'post');
  if (recent && squad.length) {
    try {
      await enrichPlayerPhotos(
        { game: recent, lineups: [{ team: { id }, players: squad }] },
        fetcher,
      );
    } catch {
      /* ESPN portraits remain available when the secondary feed is missing. */
    }
  }
  const favorite = clubs.find((c) => c.id === id);
  if (favorite) {
    try {
      const fm = await fotmobTeam(fotmobClubs[favorite.key], fetcher);
      const candidates = (fm.squad?.squad || []).flatMap(
        (g) => g.members || [],
      );
      for (const player of squad) {
        const remote = matchPhotoPlayer(player, candidates);
        if (!remote || !/^\d+$/.test(String(remote.id))) continue;
        player.photoFallback ||= player.photo;
        player.photo = `https://images.fotmob.com/image_resources/playerimages/${remote.id}.png`;
        player.photoSource = 'FotMob';
      }
    } catch {
      /* Missing secondary coverage must not suppress the roster. */
    }
  }
  return {
    id,
    name: plain(team.displayName),
    logo: safe(team.logos?.[0]?.href),
    league,
    squad,
    rosterAvailable:
      roster.status === 'fulfilled' && Array.isArray(roster.value.athletes),
    upcoming: games.filter((g) => g.state !== 'post').slice(0, 8),
    results: games
      .filter((g) => g.state === 'post')
      .reverse()
      .slice(0, 10),
    scheduleAvailable: !!schedule && !!future,
    standing:
      table.status === 'fulfilled'
        ? table.value.groups?.flatMap((g) => g.rows).find((r) => r.id === id) ||
          null
        : null,
    articles,
    absences: club?.absences || { available: false, players: [] },
    source: 'ESPN · Fotos ESPN/FotMob',
    checkedAt: new Date().toISOString(),
  };
}
