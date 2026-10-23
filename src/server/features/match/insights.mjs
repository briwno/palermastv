import { matchCenter } from './service.mjs';
import {
  fotmobLeague,
  fotmobMatch,
  fotmobTeam,
  sameFotmobGame,
  recentForm,
  normalizeAbsences,
  fotmobLeagues,
} from '../../integrations/fotmob.mjs';
import { teamKey } from '../../integrations/ge.mjs';
import { poissonProbabilities } from './probabilities.mjs';
const labels = {
  BallPossesion: 'Posse de bola',
  corners: 'Escanteios',
  ShotsOffTarget: 'Finalizações para fora',
  blocked_shots: 'Chutes bloqueados',
  shots_woodwork: 'Bolas na trave',
  shots_inside_box: 'Finalizações dentro da área',
  shots_outside_box: 'Finalizações fora da área',
  Offsides: 'Impedimentos',
  interceptions: 'Interceptações',
  keeper_saves: 'Defesas',
  fouls: 'Faltas cometidas',
  yellow_cards: 'Cartões amarelos',
  red_cards: 'Cartões vermelhos',
  expected_goals: 'Gols esperados (xG)',
  big_chance: 'Grandes chances',
  touches_opp_box: 'Toques na área adversária',
  expected_goals_on_target: 'xG no alvo (xGOT)',
  big_chance_missed_title: 'Grandes chances perdidas',
  accurate_passes: 'Passes certos',
  total_shots: 'Finalizações',
  ShotsOnTarget: 'Finalizações no gol',
};
export function normalizeInsights(data, game, teams = []) {
  const g = data.general;
  if (
    !g ||
    (fotmobLeagues[game.leagueId] &&
      Number(g.leagueId) !== fotmobLeagues[game.leagueId]) ||
    teamKey(g.homeTeam?.name) !== teamKey(game.home.name) ||
    teamKey(g.awayTeam?.name) !== teamKey(game.away.name) ||
    Math.abs(Date.parse(g.matchTimeUTCDate) - Date.parse(game.date)) >
      3 * 3600000 ||
    !Number.isFinite(Date.parse(g.matchTimeUTCDate))
  )
    throw Error('Partida complementar não corresponde');
  const content = data.content || {},
    stats =
      content.stats?.Periods?.All?.stats?.flatMap(
        (group) => group.stats || [],
      ) || [];
  const before = Date.parse(game.date);
  const form = teams.map((t, i) =>
    recentForm(
      t?.fixtures?.allFixtures?.fixtures || [],
      i === 0 ? g.homeTeam.id : g.awayTeam.id,
      before,
      10,
    ),
  );
  const ratings = ['homeTeam', 'awayTeam'].map((side) => ({
    team: content.lineup?.[side]?.name,
    players: [
      ...(content.lineup?.[side]?.starters || []),
      ...(content.lineup?.[side]?.subs || []),
    ]
      .filter((p) => typeof p.performance?.rating === 'number')
      .map((p) => ({ name: p.name, rating: p.performance.rating }))
      .sort((a, b) => b.rating - a.rating),
  }));
  return {
    state: 'available',
    source: 'FotMob',
    checkedAt: new Date().toISOString(),
    lineups: ['homeTeam', 'awayTeam'].map((side) => {
      const team = content.lineup?.[side];
      const rating = (p) =>
        Number.isFinite(p.performance?.rating) &&
        p.performance.rating >= 0 &&
        p.performance.rating <= 10
          ? p.performance.rating
          : null;
      return {
        team: g[side].name,
        formation: team?.formation || null,
        coach: team?.coach?.name || null,
        confirmed: content.lineup?.lineupType === 'confirmed',
        players: [
          ...(team?.starters || []).map((p) => ({
            name: p.name,
            jersey: p.shirtNumber,
            captain: !!p.isCaptain,
            rating: rating(p),
            starter: true,
          })),
          ...(team?.subs || []).map((p) => ({
            name: p.name,
            jersey: p.shirtNumber,
            captain: !!p.isCaptain,
            rating: rating(p),
            starter: false,
          })),
        ]
          .filter((p) => typeof p.name === 'string' && p.name.trim())
          .slice(0, 40),
      };
    }),
    statistics: stats
      .filter((s) => labels[s.key] && Array.isArray(s.stats))
      .filter((s, i, all) => all.findIndex((t) => t.key === s.key) === i)
      .map((s) => ({
        key: s.key,
        label: labels[s.key],
        home: s.stats[0],
        away: s.stats[1],
      })),
    shots: (content.shotmap?.shots || [])
      .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y))
      .slice(0, 150)
      .map((s) => ({
        x: s.x,
        y: s.y,
        home: String(s.teamId) === String(g.homeTeam.id),
        goal: s.eventType === 'Goal',
        player: s.playerName,
        minute: s.min,
        xg: typeof s.expectedGoals === 'number' ? s.expectedGoals : null,
      })),
    ratings,
    form,
    absences: teams.map((t) =>
      t ? normalizeAbsences(t) : { available: false, players: [] },
    ),
    probabilities:
      form.length === 2 ? poissonProbabilities(form[0], form[1]) : null,
    h2h: (content.h2h?.matches || [])
      .filter(
        (m) =>
          m.status?.finished &&
          !m.status?.cancelled &&
          Date.parse(m.status.utcTime) < before,
      )
      .slice(0, 5)
      .map((m) => ({
        home: m.home.name,
        away: m.away.name,
        score: m.status.scoreStr,
        date: m.status.utcTime,
      })),
  };
}
export async function matchInsights(league, id, fetcher = fetch) {
  const { game } = await matchCenter(league, id, fetcher);
  try {
    const year = Number(game.date.slice(0, 4)),
      month = Number(game.date.slice(5, 7));
    const season = ['eng.1', 'esp.1', 'ita.1', 'uefa.champions'].includes(
      league,
    )
      ? `${month < 7 ? year - 1 : year}/${month < 7 ? year : year + 1}`
      : String(year);
    const l = await fotmobLeague(league, fetcher, season);
    const matches = (l.fixtures?.allMatches || []).filter((m) =>
      sameFotmobGame(m, game),
    );
    if (matches.length !== 1)
      throw Error('Partida não identificada com segurança');
    const data = await fotmobMatch(matches[0].id, fetcher);
    const teams = await Promise.allSettled(
      [data.general?.homeTeam.id, data.general?.awayTeam.id].map((id) =>
        fotmobTeam(id, fetcher),
      ),
    );
    return normalizeInsights(
      data,
      game,
      teams.map((t) => (t.status === 'fulfilled' ? t.value : null)),
    );
  } catch {
    return {
      state: 'unavailable',
      source: 'FotMob',
      message:
        'Dados complementares indisponíveis para esta partida. Os dados principais continuam pela ESPN.',
    };
  }
}
