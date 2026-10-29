import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { agendas, clubGames } from '../football/game-store.js';
import { communityRequest } from '../group/api.js';
import { setRoomGame } from './preferences.js';
import { tacticalLines } from '../match/formation.js';
import { save } from '../../shared/storage.js';
const goalTypes = ['goal', 'own-goal', 'penalty-goal'];
const lineupsPreference = 'palermas-room-lineups';
const nameKey = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const times = (n) => (n > 1 ? '×' + n : '');
const ratingClass = (r) =>
  r >= 8
    ? 'rating-top'
    : r >= 7
      ? 'rating-good'
      : r >= 6
        ? 'rating-ok'
        : 'rating-low';
function athleteEvents(p) {
  const marks = [
    p.goals > 0 && `<i title="${p.goals} gol(s)">⚽${times(p.goals)}</i>`,
    p.assists > 0 &&
      `<i title="${p.assists} assistência(s)">👟${times(p.assists)}</i>`,
    p.redCards > 0
      ? '<i class="event-card event-red" title="Cartão vermelho"></i>'
      : p.yellowCards > 0 &&
        '<i class="event-card event-yellow" title="Cartão amarelo"></i>',
    p.subbedIn &&
      `<i class="event-sub-in" title="Entrou${p.inClock ? ' aos ' + esc(p.inClock) : ''}">▲${esc(p.inClock || '')}</i>`,
    p.subbedOut &&
      `<i class="event-sub-out" title="Saiu${p.outClock ? ' aos ' + esc(p.outClock) : ''}">▼${esc(p.outClock || '')}</i>`,
  ].filter(Boolean);
  return marks.length
    ? `<span class="athlete-events">${marks.join('')}</span>`
    : '';
}
function playerCard(p) {
  const stat = (label, value) =>
    value === undefined || value === null
      ? ''
      : `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
  const s = p.stats || {},
    keeper = /goalkeeper/i.test(p.positionCode || '');
  const minutes = p.subbedIn
    ? `Entrou${p.inClock ? ' aos ' + p.inClock : ''}`
    : p.subbedOut
      ? `Saiu${p.outClock ? ' aos ' + p.outClock : ''}`
      : p.starter
        ? 'Titular'
        : 'No banco';
  return `<div class="room-player-card" role="dialog" aria-label="${esc(p.name)}"><button type="button" class="room-player-close" data-close-player aria-label="Fechar">×</button><header>${p.photo ? `<img src="${esc(p.photo)}" alt="" data-player-photo>` : ''}<div><strong>${esc(p.name)}</strong><span>${esc([p.jersey && '#' + p.jersey, p.position, minutes].filter(Boolean).join(' · '))}</span></div>${p.rating !== null && p.rating !== undefined ? `<b class="athlete-rating ${ratingClass(p.rating)}" title="Nota FotMob">${p.rating.toFixed(1)}</b>` : ''}</header><dl>${[
    stat('Gols', p.goals),
    stat('Assistências', p.assists),
    stat(
      'Finalizações',
      s.totalShots !== undefined
        ? `${s.totalShots} (${s.shotsOnTarget ?? 0} no gol)`
        : undefined,
    ),
    stat('Faltas cometidas', s.foulsCommitted),
    stat('Faltas sofridas', s.foulsSuffered),
    stat('Impedimentos', s.offsides),
    keeper ? stat('Defesas', s.saves) : '',
    keeper ? stat('Gols sofridos', s.goalsConceded) : '',
    s.ownGoals ? stat('Gols contra', s.ownGoals) : '',
    stat(
      'Cartões',
      p.redCards ? 'Vermelho' : p.yellowCards ? 'Amarelo' : 'Nenhum',
    ),
  ].join(
    '',
  )}</dl><small class="data-note">Fonte: ESPN${p.rating !== null && p.rating !== undefined ? ' · Nota: FotMob' : ''}</small></div>`;
}
function renderLineup(lineup, team, side, focus) {
  const players = lineup?.players || [];
  const lines = lineup && tacticalLines(lineup);
  const athlete = (p) =>
    `<button type="button" class="football-athlete${p.justScored ? ' just-scored' : ''}${focus === p.id ? ' is-open' : ''}" title="${esc(p.name)}" data-room-player="${esc(side + ':' + p.id)}"><div class="athlete-portrait">${athleteEvents(p)}<span>${esc(
      (p.shortName || p.name || '?')
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join(''),
    )}</span>${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" data-player-photo>` : ''}${p.rating !== null && p.rating !== undefined ? `<em class="athlete-rating ${ratingClass(p.rating)}" title="Nota FotMob">${p.rating.toFixed(1)}</em>` : ''}<b>${esc(p.jersey || '—')}</b></div><span class="athlete-name">${esc(p.shortName || p.name)}</span></button>`;
  const row = (list) =>
    `<div class="football-pitch-row">${list.map(athlete).join('')}</div>`;
  const open = focus && players.find((p) => p.id === focus);
  return `<header class="football-team-heading">${team.logo ? `<img src="${esc(team.logo)}" alt="">` : ''}<div><h3>${esc(team.name)}</h3><span>${esc(lineup?.formation || 'Aguardando escalação')}</span></div></header>${
    lines
      ? `<div class="football-pitch"><div class="football-pitch-lines" aria-hidden="true"><i></i></div><div class="football-pitch-players">${[...lines].reverse().map(row).join('')}</div></div>`
      : `<p class="data-note">${
          players
            .filter((p) => p.starter)
            .map((p) => esc(p.name))
            .join(' · ') || 'Escalação ainda não divulgada.'
        }</p>`
  }<details class="football-bench" open><summary>Banco de reservas</summary><div>${
    players
      .filter((p) => !p.starter)
      .map(athlete)
      .join('') || '<p class="data-note">Ainda não informado.</p>'
  }</div></details>${open ? playerCard(open) : ''}`;
}
// Room-only decorations layered over the ESPN lineup on every refresh.
let lastMatch = null,
  ratings = null,
  ratingsAt = 0,
  ratingsBusy = false,
  goalsPrimed = false,
  focusPlayer = null;
const seenGoals = new Set(),
  recentScorers = new Map();
function decorate(lineup, sideIndex, events) {
  if (!lineup) return lineup;
  const clocks = new Map();
  for (const e of [...events].reverse())
    if (e.type === 'substitution')
      for (const name of e.participants) clocks.set(name, e.clock);
  const source = ratings?.[sideIndex]?.players || [];
  const byJersey = new Map(
      source.map((p) => [String(p.jersey ?? ''), p.rating]),
    ),
    byName = new Map(source.map((p) => [nameKey(p.name), p.rating]));
  return {
    ...lineup,
    players: lineup.players.map((p) => ({
      ...p,
      inClock: p.subbedIn ? clocks.get(p.name) : null,
      outClock: p.subbedOut ? clocks.get(p.name) : null,
      rating:
        byName.get(nameKey(p.name)) ??
        (p.jersey ? byJersey.get(String(p.jersey)) : undefined) ??
        null,
      justScored: (recentScorers.get(p.name) || 0) > Date.now(),
    })),
  };
}
function renderLineups() {
  if (!lastMatch) return;
  const data = lastMatch;
  ['home', 'away'].forEach((side, index) => {
    const team = data.game[side],
      lineup = data.lineups.find((l) => l.team.id === team.id);
    $('#room-' + side + '-lineup').innerHTML = renderLineup(
      decorate(lineup, index, data.events || []),
      team,
      side,
      focusPlayer?.side === side ? focusPlayer.id : null,
    );
  });
}
function celebrateGoals(events, game) {
  const goals = events.filter((e) => goalTypes.includes(e.type));
  if (!goalsPrimed) {
    goals.forEach((e) => seenGoals.add(e.id));
    goalsPrimed = true;
    return;
  }
  for (const e of goals) {
    if (seenGoals.has(e.id)) continue;
    seenGoals.add(e.id);
    const scorer = e.participants[0];
    if (scorer && e.type !== 'own-goal')
      recentScorers.set(scorer, Date.now() + 45000);
    if (!$('#show-reactions').checked) continue;
    const overlay = $('#reaction-overlay'),
      burst = document.createElement('div');
    burst.className = 'goal-burst';
    const ball = document.createElement('b');
    ball.textContent = '⚽';
    const title = document.createElement('strong');
    title.textContent = e.type === 'own-goal' ? 'GOL CONTRA!' : 'GOOOL!';
    const who = document.createElement('small');
    who.textContent = [
      scorer,
      e.teamName ||
        (e.teamId === game.home.id ? game.home.name : game.away.name),
      e.clock,
    ]
      .filter(Boolean)
      .join(' · ');
    burst.append(ball, title, who);
    overlay.append(burst);
    setTimeout(() => burst.remove(), 4500);
  }
}
async function loadRatings() {
  const game = linked,
    current = generation;
  if (
    !game ||
    ratingsBusy ||
    game.state === 'pre' ||
    Date.now() - ratingsAt < 60000
  )
    return;
  ratingsBusy = true;
  ratingsAt = Date.now();
  try {
    const d = await api(
      `insights?league=${encodeURIComponent(game.leagueId)}&id=${encodeURIComponent(game.id)}`,
    );
    if (current !== generation || d.state !== 'available') return;
    ratings = d.lineups.map((l) => ({
      players: l.players.filter((p) => p.rating !== null),
    }));
    renderLineups();
  } catch {
    /* Ratings are optional; the ESPN lineup stays as is. */
  } finally {
    ratingsBusy = false;
  }
}
function setLineupsHidden(hidden) {
  $('#room-match-stage').classList.toggle('lineups-collapsed', hidden);
  $('#room-lineups-toggle').textContent = hidden
    ? 'Mostrar escalações'
    : 'Esconder escalações';
  $('#room-lineups-toggle').setAttribute('aria-pressed', String(!hidden));
}
let linked = null,
  chosen = null,
  generation = 0,
  roomBusy = false,
  detailsBusy = false;
let assigning = false,
  roomRevision = 0;
function gameOptions(preferred) {
  const games = [
    ...new Map(
      [...agendas.values()]
        .flatMap((d) => d.games || [])
        .concat(
          [...clubGames.values()],
          chosen ? [chosen] : [],
          linked ? [linked] : [],
        )
        .map((g) => [g.leagueId + '/' + g.id, g]),
    ).values(),
  ];
  const select = $('#room-game-select'),
    previous = select.value;
  select.innerHTML =
    '<option value="">Escolha na agenda ou selecione aqui</option>' +
    games
      .map(
        (g) =>
          `<option value="${esc(g.leagueId + '/' + g.id)}">${esc(g.home.name)} × ${esc(g.away.name)} · ${esc(g.league)}</option>`,
      )
      .join('');
  select.value =
    (typeof preferred === 'string' ? preferred : previous) ||
    (chosen
      ? chosen.leagueId + '/' + chosen.id
      : linked
        ? linked.leagueId + '/' + linked.id
        : '');
}
async function details() {
  if (
    !linked ||
    detailsBusy ||
    $('#page-sala').hidden ||
    $('#room-match-details').hidden ||
    document.hidden
  )
    return;
  const game = linked,
    current = generation;
  detailsBusy = true;
  try {
    const data = await api(
      `match?league=${encodeURIComponent(game.leagueId)}&id=${encodeURIComponent(game.id)}`,
    );
    if (current !== generation) return;
    setRoomGame(data.game);
    lastMatch = data;
    celebrateGoals(data.events || [], data.game);
    renderLineups();
    loadRatings();
    $('#room-match-details').innerHTML =
      `<div class="room-summary-grid"><section><h3>Estatísticas</h3>${
        data.statistics.length
          ? data.statistics
              .slice(0, 7)
              .map(
                (s) =>
                  `<div class="room-stat"><b>${esc(s.home ?? '—')}${esc(s.unit)}</b><span>${esc(s.label)}</span><b>${esc(s.away ?? '—')}${esc(s.unit)}</b></div>`,
              )
              .join('')
          : '<p>Estatísticas ainda não disponíveis na fonte.</p>'
      }</section><section><h3>Últimos lances</h3>${
        (data.events || [])
          .slice(0, 4)
          .map(
            (e) =>
              `<p><b>${esc(e.clock || '')} ${esc(e.label)}</b> · ${esc((e.participants || []).join(', ') || e.teamName || '')}</p>`,
          )
          .join('') || '<p>Nenhum lance disponível na fonte.</p>'
      }</section></div><p class="data-note">Fonte: ${esc(data.source)} · Atualização a cada 15 segundos.</p>`;
  } catch (e) {
    if (current === generation)
      $('#room-match-details').textContent = e.message;
  } finally {
    detailsBusy = false;
    if (current !== generation) details();
  }
}
function applyGame(game) {
  const changed =
    linked?.id !== game?.id || linked?.leagueId !== game?.leagueId;
  linked = game;
  $('#page-sala').classList.toggle('football-mode', !!game);
  document.body.classList.toggle(
    'football-room',
    !!game && !$('#page-sala').hidden,
  );
  $('#football-scoreboard').hidden = !game;
  $('#room-match-stage').classList.toggle('has-match', !!game);
  $('#room-lineups-toggle').hidden = !game;
  for (const side of ['home', 'away']) {
    const panel = $('#room-' + side + '-lineup');
    panel.hidden = !game;
    if (changed && game)
      panel.innerHTML = renderLineup(null, game[side], side, null);
  }
  if (changed) {
    generation++;
    lastMatch = null;
    ratings = null;
    ratingsAt = 0;
    goalsPrimed = false;
    focusPlayer = null;
    seenGoals.clear();
    recentScorers.clear();
    $('#room-match-details').textContent = game
      ? 'Consultando dados da partida…'
      : 'Vincule uma partida para acompanhar o resumo aqui.';
  }
  $('#room-linked-title').textContent = game
    ? game.home.name + ' × ' + game.away.name
    : 'Nenhuma partida vinculada à transmissão';
  if (game && changed) setRoomGame(game);
  else if (changed) setRoomGame(null);
  gameOptions();
  if (changed) details();
}
async function loadRoomGame() {
  if (roomBusy || assigning || document.hidden || $('#page-sala').hidden)
    return;
  roomBusy = true;
  const current = roomRevision;
  try {
    const d = await communityRequest('room-game');
    if (current !== roomRevision) return;
    applyGame(d.game);
    $('#room-game-feedback').textContent = '';
  } catch (e) {
    if (current === roomRevision)
      $('#room-game-feedback').textContent = e.message;
  } finally {
    roomBusy = false;
  }
}
export function initRoomMatch() {
  $('#page-sala').addEventListener(
    'error',
    (event) => {
      if (event.target.matches('[data-player-photo]'))
        event.target.hidden = true;
    },
    true,
  );
  let lineupsHidden = false;
  try {
    lineupsHidden = localStorage.getItem(lineupsPreference) === 'hidden';
  } catch {
    /* Storage may be blocked; lineups stay visible. */
  }
  setLineupsHidden(lineupsHidden);
  $('#room-lineups-toggle').addEventListener('click', () => {
    const hidden =
      !$('#room-match-stage').classList.contains('lineups-collapsed');
    setLineupsHidden(hidden);
    save(lineupsPreference, hidden ? 'hidden' : 'shown');
  });
  $('#room-match-stage').addEventListener('click', (event) => {
    const target = event.target.closest(
      '[data-room-player],[data-close-player]',
    );
    if (!target) return;
    if (target.matches('[data-close-player]')) focusPlayer = null;
    else {
      const [side, id] = target.dataset.roomPlayer.split(':');
      focusPlayer =
        focusPlayer?.side === side && focusPlayer.id === id
          ? null
          : { side, id };
    }
    renderLineups();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && focusPlayer) {
      focusPlayer = null;
      renderLineups();
    }
  });
  async function assign(clear = false) {
    if (assigning) return;
    const [league, id] = $('#room-game-select').value.split('/');
    if (!clear && !id) {
      $('#room-game-feedback').textContent =
        'Escolha uma partida para vincular.';
      return;
    }
    assigning = true;
    roomRevision++;
    $('#room-game-save').disabled = true;
    $('#room-game-clear').disabled = true;
    $('#room-game-feedback').textContent = 'Salvando para a sala…';
    try {
      const d = await communityRequest('room-game', {
        league,
        id,
        clear,
      });
      applyGame(d.game);
      $('#room-game-feedback').textContent = clear
        ? 'Vínculo removido para todos.'
        : 'Partida vinculada para todos na sala.';
    } catch (e) {
      $('#room-game-feedback').textContent = e.message;
    } finally {
      assigning = false;
      $('#room-game-save').disabled = false;
      $('#room-game-clear').disabled = false;
    }
  }
  $('#room-game-save').addEventListener('click', () => assign());
  $('#room-game-clear').addEventListener('click', () => assign(true));
  window.addEventListener('palermas:room', loadRoomGame);
  window.addEventListener('palermas:roomselection', (e) => {
    chosen = e.detail;
    gameOptions(chosen.leagueId + '/' + chosen.id);
  });
  window.addEventListener('palermas:room-game-update', (event) => {
    roomRevision++;
    applyGame(event.detail.game);
    $('#room-game-feedback').textContent = '';
  });
  window.addEventListener('football:games', gameOptions);
  window.addEventListener('palermas:navigate', (e) => {
    document.body.classList.toggle(
      'football-room',
      !!linked && e.detail.page === 'sala',
    );
    if (e.detail.page === 'sala') {
      gameOptions();
      loadRoomGame();
      details();
    }
  });
  setInterval(loadRoomGame, 10000);
  setInterval(details, 15000);
  gameOptions();
  if (location.hash === '#sala') loadRoomGame();
}
