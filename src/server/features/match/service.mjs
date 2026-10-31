import { feed, leagues, normalizeEvent } from '../football/service.mjs';
import { liveFotmobGame } from '../../integrations/fotmob.mjs';
import { enrichPlayerPhotos } from '../../integrations/player-photos.mjs';
const text = (v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .trim();
const safeURL = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' &&
      (/(^|\.)espn\.com(\.br)?$/.test(u.hostname) ||
        u.hostname === 'a.espncdn.com')
      ? u.href
      : null;
  } catch {
    return null;
  }
};
const thumbnailURL = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' &&
      u.hostname === 'espnmedia-cdn.akamaized.net'
      ? u.href
      : safeURL(v);
  } catch {
    return null;
  }
};
const statDefinitions = [
  ['possessionPct', 'Posse de bola', '%'],
  ['totalShots', 'Finalizações'],
  ['shotsOnTarget', 'Finalizações no gol'],
  ['wonCorners', 'Escanteios'],
  ['foulsCommitted', 'Faltas cometidas'],
  ['yellowCards', 'Cartões amarelos'],
  ['redCards', 'Cartões vermelhos'],
  ['offsides', 'Impedimentos'],
  ['saves', 'Defesas'],
  ['totalPasses', 'Passes'],
  ['accuratePasses', 'Passes certos'],
  ['blockedShots', 'Chutes bloqueados'],
  ['interceptions', 'Interceptações'],
];
const playerStatKeys = [
  'totalShots',
  'shotsOnTarget',
  'foulsCommitted',
  'foulsSuffered',
  'offsides',
  'saves',
  'goalsConceded',
  'ownGoals',
];
function player(p) {
  const stats = Object.fromEntries(
    (p.stats || []).map((s) => [s.name, s.value]),
  );
  return {
    id: String(p.athlete?.id || ''),
    photo:
      safeURL(p.athlete?.headshot?.href) ||
      (/^\d+$/.test(String(p.athlete?.id || ''))
        ? `https://a.espncdn.com/i/headshots/soccer/players/full/${p.athlete.id}.png`
        : null),
    name: text(p.athlete?.displayName || p.athlete?.fullName || 'Jogador'),
    shortName: text(p.athlete?.shortName || p.athlete?.displayName),
    jersey: text(p.jersey),
    position: text(p.position?.displayName),
    positionCode: text(p.position?.name),
    formationPlace:
      Number.isInteger(Number(p.formationPlace)) &&
      Number(p.formationPlace) >= 1 &&
      Number(p.formationPlace) <= 11
        ? Number(p.formationPlace)
        : null,
    starter: !!p.starter,
    subbedIn: !!p.subbedIn,
    subbedOut: !!p.subbedOut,
    goals: stats.totalGoals ?? 0,
    yellowCards: stats.yellowCards ?? 0,
    redCards: stats.redCards ?? 0,
    assists: stats.goalAssists ?? 0,
    stats: Object.fromEntries(
      playerStatKeys
        .filter((key) => Number.isFinite(Number(stats[key])))
        .map((key) => [key, Number(stats[key])]),
    ),
    sourceUrl: safeURL(
      p.athlete?.links?.find((l) => l.rel?.includes('desktop'))?.href,
    ),
  };
}
function eventType(e) {
  const value = (e.type?.type || '').toLowerCase();
  if (e.ownGoal || value.includes('own-goal')) return 'own-goal';
  if (e.penaltyKick || value.includes('penalty'))
    return e.scoringPlay ? 'penalty-goal' : 'penalty';
  if (e.scoringPlay || value.startsWith('goal')) return 'goal';
  if (e.redCard || value.includes('red-card')) return 'red-card';
  if (e.yellowCard || value.includes('yellow-card')) return 'yellow-card';
  if (value.includes('substitution')) return 'substitution';
  if (value.includes('var')) return 'var';
  if (value.includes('kickoff')) return 'kickoff';
  if (value.includes('halftime')) return 'halftime';
  if (value.includes('end') || value.includes('full')) return 'end';
  return 'other';
}
const eventLabels = {
  goal: 'Gol',
  'own-goal': 'Gol contra',
  'penalty-goal': 'Gol de pênalti',
  penalty: 'Pênalti',
  'red-card': 'Cartão vermelho',
  'yellow-card': 'Cartão amarelo',
  substitution: 'Substituição',
  var: 'VAR',
  kickoff: 'Início de tempo',
  halftime: 'Intervalo',
  end: 'Fim de tempo',
  other: 'Evento',
};
const goalTypes = new Set(['goal', 'own-goal', 'penalty-goal']);
const fold = (v) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Only trusts the running score when it reproduces the final ESPN score.
function addScoreAfterGoals(events, game) {
  const goals = events.filter((e) => goalTypes.has(e.type) && !e.shootout);
  const score = { [game.home.id]: 0, [game.away.id]: 0 };
  const after = [...goals].reverse().map((e) => {
    if (!(e.teamId in score)) return null;
    score[e.teamId]++;
    return `${score[game.home.id]} × ${score[game.away.id]}`;
  });
  if (
    after.includes(null) ||
    String(score[game.home.id]) !== String(game.homeScore) ||
    String(score[game.away.id]) !== String(game.awayScore)
  )
    return;
  [...goals].reverse().forEach((e, i) => (e.scoreAfter = after[i]));
}
function attachGoalVideos(events, videos) {
  const used = new Set();
  for (const e of [...events].reverse()) {
    if (!goalTypes.has(e.type) || !e.participants[0]) continue;
    const surname = fold(e.participants[0]).split(' ').pop();
    const video =
      surname.length > 2 &&
      videos.find(
        (v) => !used.has(v) && fold(v.title).split(/\W+/).includes(surname),
      );
    if (video) {
      used.add(video);
      e.video = video;
    }
  }
}
export function normalizeMatch(data, league) {
  const c = data.header?.competitions?.[0];
  if (!c) throw Error('Partida não encontrada na fonte.');
  const game = normalizeEvent(
    {
      ...data.header,
      date: c.date,
      status: c.status,
      links: data.header.links,
    },
    league,
  );
  if (!game) throw Error('Dados da partida indisponíveis.');
  const sides = ['home', 'away'].map((side) => {
    const team = game[side],
      r = data.rosters?.find((r) => String(r.team?.id) === team.id);
    return {
      team,
      formation: r?.formation || null,
      players: (r?.roster || []).map(player),
      available: Array.isArray(r?.roster) && r.roster.length > 0,
    };
  });
  const homeStats =
      data.boxscore?.teams?.find((t) => String(t.team?.id) === game.home.id)
        ?.statistics || [],
    awayStats =
      data.boxscore?.teams?.find((t) => String(t.team?.id) === game.away.id)
        ?.statistics || [];
  const statistics = statDefinitions
    .map(([key, label, unit]) => {
      const home = homeStats.find((s) => s.name === key),
        away = awayStats.find((s) => s.name === key);
      return {
        key,
        label,
        unit: unit || '',
        home: home ? text(home.displayValue ?? home.value) : null,
        away: away ? text(away.displayValue ?? away.value) : null,
      };
    })
    .filter((s) => s.home !== null || s.away !== null);
  const rawEvents = Array.isArray(data.keyEvents)
    ? data.keyEvents
    : c.details || [];
  const events = rawEvents
    .map((e, index) => {
      const type = eventType(e),
        participants = (e.participants || [])
          .map((p) => text(p.athlete?.displayName))
          .filter(Boolean);
      return {
        id: String(e.id || game.id + '-' + index),
        type,
        label: eventLabels[type],
        clock: text(e.clock?.displayValue),
        seconds: Number(e.clock?.value || 0),
        period: e.period?.number || 0,
        teamId: String(e.team?.id || ''),
        teamName: text(e.team?.displayName || ''),
        participants,
        participantIds: (e.participants || []).map((p) =>
          String(p.athlete?.id || ''),
        ),
        text: text(e.text || e.shortText).slice(0, 600),
        shootout: !!e.shootout,
      };
    })
    .sort((a, b) => b.period - a.period || b.seconds - a.seconds);
  addScoreAfterGoals(events, game);
  const commentary = (data.commentary || [])
    .slice(-250)
    .map((e, i) => ({
      id: String(e.id || e.sequence || i),
      clock: text(e.time?.displayValue),
      seconds: Number(e.time?.value || 0),
      text: text(e.text).slice(0, 2000),
    }))
    .filter((e) => e.text)
    .reverse();
  const videos = (data.videos || [])
    .slice(0, 8)
    .map((v) => ({
      title: text(v.headline || v.description),
      url: safeURL(v.links?.web?.href),
      thumbnail: thumbnailURL(v.thumbnail),
      duration: Number(v.duration) || null,
    }))
    .filter((v) => v.url);
  attachGoalVideos(events, videos);
  return {
    commentary,
    videos,
    game: {
      ...game,
      venue: data.gameInfo?.venue?.fullName || game.venue,
      city: text(data.gameInfo?.venue?.address?.city),
      attendance:
        data.gameInfo?.attendance > 0 ? data.gameInfo.attendance : null,
      referee: text(data.gameInfo?.officials?.[0]?.displayName),
      broadcasts: [
        ...new Set([
          ...game.broadcasts,
          ...(data.broadcasts || []).flatMap(
            (b) => b.names || (b.media?.shortName && [b.media.shortName]) || [],
          ),
        ]),
      ],
    },
    lineups: sides,
    statistics,
    events,
    eventsAvailable: Array.isArray(data.keyEvents) || Array.isArray(c.details),
    source: 'ESPN',
    checkedAt: new Date().toISOString(),
    refreshSeconds: 15,
  };
}
export async function matchCenter(leagueId, id, fetcher = fetch) {
  const league = leagues.find((l) => l.id === leagueId);
  if (!league || !/^\d{1,14}$/.test(id || '')) throw Error('Partida inválida.');
  const data = await feed(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/summary?event=${id}&lang=pt&region=br`,
    15,
    fetcher,
  );
  const result = normalizeMatch(data, league);
  try {
    result.game = await liveFotmobGame(result.game, fetcher);
  } catch {
    /* Provider failure keeps the ESPN result available. */
  }
  if (result.game.scoreSource === 'FotMob')
    result.source = 'ESPN · Placar: FotMob';
  try {
    await enrichPlayerPhotos(result, fetcher);
  } catch {
    /* Photos are optional; ESPN remains available. */
  }
  return result;
}
