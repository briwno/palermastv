import { feed } from './espn.mjs';
import { fotmobLeagues, fotmobMatch, sameFotmobGame } from './fotmob.mjs';

const cache = new Map();
const nameKey = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
export function matchPhotoPlayer(player, candidates) {
  const names = [player.name, player.shortName].map(nameKey).filter(Boolean);
  const matches = candidates.filter(
    (p) =>
      String(p.shirtNumber) === String(player.jersey) &&
      [p.name, p.shortName, [p.firstName, p.lastName].filter(Boolean).join(' ')]
        .map(nameKey)
        .some((n) => n && names.includes(n)),
  );
  return matches.length === 1 ? matches[0] : null;
}

export async function enrichPlayerPhotos(result, fetcher = fetch) {
  const game = result.game,
    league = fotmobLeagues[game.leagueId];
  if (!league) return;
  const key = game.leagueId + '/' + game.id;
  let entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date(game.date))
      .replaceAll('-', '');
    const day = await feed(
      `https://www.fotmob.com/api/data/matches?date=${date}&timezone=America%2FSao_Paulo`,
      15,
      fetcher,
    );
    const matches = (day.leagues || [])
      .filter((l) => Number(l.primaryId || l.id) === league)
      .flatMap((l) => l.matches || [])
      .filter((m) => sameFotmobGame(m, game));
    if (matches.length !== 1) return;
    const detail = await fotmobMatch(matches[0].id, fetcher);
    const lineup = detail.content?.lineup;
    if (!lineup?.homeTeam || !lineup?.awayTeam) return;
    if (
      String(lineup.homeTeam.id) !== String(matches[0].home.id) ||
      String(lineup.awayTeam.id) !== String(matches[0].away.id)
    )
      return;
    entry = {
      expires: Date.now() + 3600000,
      sides: [lineup.homeTeam, lineup.awayTeam],
    };
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, entry);
  }
  for (const [index, side] of ['home', 'away'].entries()) {
    const local = result.lineups.find((l) => l.team.id === game[side].id);
    const remote = entry.sides[index];
    for (const p of local?.players || []) {
      const match = matchPhotoPlayer(p, [
        ...(remote.starters || []),
        ...(remote.subs || []),
      ]);
      if (!match || !/^\d+$/.test(String(match.id))) continue;
      p.photoFallback = p.photo;
      p.photo = `https://images.fotmob.com/image_resources/playerimages/${match.id}.png`;
      p.photoSource = 'FotMob';
    }
  }
}
