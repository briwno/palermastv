import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { agendas, clubGames } from '../football/game-store.js';
import { communityRequest } from '../group/api.js';
import { setRoomGame } from './preferences.js';
import { tacticalLines } from '../match/formation.js';
import { currentLineup } from './football-live.js';
import {
  initFootballExperience,
  updateFootballExperience,
  resetFootballExperience,
} from './football-experience.js';
import { save } from '../../shared/storage.js';

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

let ratings = null,
  ratingsAt = 0,
  ratingsBusy = false;
const recentScorers = new Map();
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
    renderRoomLineups();
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

let latestMatch = null;
let initialLineup = false;
function renderLineup(lineup, team) {
  const players = lineup?.players || [];
  const lines = lineup && tacticalLines(lineup);
  const athlete = (p) =>
    `<button type="button" class="football-athlete" data-room-player="${esc(team.id + '/' + p.id)}" aria-label="Ver ${esc(p.name)}" title="${esc(p.name)}"><span class="athlete-portrait">${athleteEvents(p)}<span>${esc(
      (p.shortName || p.name || '?')
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join(''),
    )}</span>${p.photo ? `<img src="${esc(p.photo)}" data-photo-fallback="${esc(p.photoFallback || '')}" alt="" loading="lazy" data-player-photo>` : ''}${p.rating !== null && p.rating !== undefined ? `<em class="athlete-rating ${ratingClass(p.rating)}" title="Nota FotMob">${p.rating.toFixed(1)}</em>` : ''}<b>${esc(p.jersey || '—')}</b></span><span class="athlete-name">${esc(p.shortName || p.name)}${p.enteredAt ? '<small class="sub-in">↑ ' + esc(p.enteredAt) + '</small>' : p.leftAt ? '<small class="sub-out">↓ ' + esc(p.leftAt) + '</small>' : ''}</span></button>`;
  const row = (list) =>
    `<div class="football-pitch-row">${list.map(athlete).join('')}</div>`;
  return `<header class="football-team-heading">${team.logo ? `<img src="${esc(team.logo)}" alt="">` : ''}<div><h3>${esc(team.name)}</h3><span>${esc(lineup?.formation || 'Aguardando escalação')}</span></div></header>${
    lines
      ? `<div class="football-pitch"><div class="football-pitch-lines" aria-hidden="true"><i></i></div><div class="football-pitch-players">${[...lines].reverse().map(row).join('')}</div></div>`
      : `<div class="football-unplaced">${
          players
            .filter((p) => p.starter)
            .map(athlete)
            .join('') ||
          '<p class="data-note">Escalação ainda não divulgada.</p>'
        }</div>`
  }<details class="football-bench" open><summary>Banco de reservas</summary><div>${
    players
      .filter((p) => !p.starter)
      .map(athlete)
      .join('') || '<p class="data-note">Ainda não informado.</p>'
  }</div></details>`;
}
function renderRoomLineups() {
  if (!latestMatch) return;
  for (const side of ['home', 'away']) {
    const team = latestMatch.game[side];
    const lineup = latestMatch.lineups.find((l) => l.team.id === team.id);
    if (lineup)
      lineup.players = decorate(
        lineup,
        side === 'home' ? 0 : 1,
        latestMatch.events || [],
      ).players;
    const panel = $('#room-' + side + '-lineup');
    const html = renderLineup(
      currentLineup(
        decorate(lineup, side === 'home' ? 0 : 1, latestMatch.events || []),
        latestMatch.events || [],
        initialLineup,
      ),
      team,
    );
    if (panel.dataset.rendered === html) continue;
    const open = panel.querySelector('details')?.open;
    panel.innerHTML = html;
    panel.dataset.rendered = html;
    if (open === false) panel.querySelector('details').open = false;
  }
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
    latestMatch = data;
    renderRoomLineups();
    loadRatings();
    updateFootballExperience(data);
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
    if (changed && game) panel.innerHTML = renderLineup(null, game[side]);
  }
  if (changed) {
    latestMatch = null;
    ratings = null;
    ratingsAt = 0;
    recentScorers.clear();
    resetFootballExperience();
    generation++;
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
  initFootballExperience();
  $('#room-initial-lineup').addEventListener('change', (event) => {
    initialLineup = event.target.checked;
    renderRoomLineups();
  });
  $('#page-sala').addEventListener(
    'error',
    (event) => {
      if (event.target.matches('[data-player-photo]')) {
        const fallback = event.target.dataset.photoFallback;
        if (fallback) {
          event.target.dataset.photoFallback = '';
          event.target.src = fallback;
        } else event.target.hidden = true;
      }
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
