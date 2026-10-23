import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { agendas, clubGames } from '../football/game-store.js';
import { communityRequest } from '../group/api.js';
import { setRoomGame } from './preferences.js';
import { navigate } from '../../shell/navigation.js';
let host = false,
  resumeToken = '',
  linked = null,
  chosen = null,
  generation = 0,
  roomBusy = false,
  detailsBusy = false;
function gameOptions() {
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
    previous ||
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
    $('#room-match-details').innerHTML = `<h3>Estatísticas</h3>${
      data.statistics.length
        ? data.statistics
            .slice(0, 7)
            .map(
              (s) =>
                `<div class="room-stat"><b>${esc(s.home ?? '—')}${esc(s.unit)}</b><span>${esc(s.label)}</span><b>${esc(s.away ?? '—')}${esc(s.unit)}</b></div>`,
            )
            .join('')
        : '<p>Estatísticas ainda não disponíveis na fonte.</p>'
    }<h3>Escalações</h3>${data.lineups
      .map(
        (l) =>
          `<div><strong>${esc(l.team.name)} ${esc(l.formation || '')}</strong><p>${esc(
            l.players
              .filter((p) => p.starter)
              .map((p) => p.name)
              .join(' · ') || 'Ainda não divulgada pela fonte.',
          )}</p></div>`,
      )
      .join(
        '',
      )}<p class="data-note">Fonte: ESPN · Atualiza a cada minuto enquanto este painel estiver aberto.</p>`;
  } catch (e) {
    if (current === generation)
      $('#room-match-details').textContent = e.message;
  } finally {
    detailsBusy = false;
  }
}
function applyGame(game) {
  const changed =
    linked?.id !== game?.id || linked?.leagueId !== game?.leagueId;
  linked = game;
  if (changed) {
    generation++;
    $('#room-match-details').textContent = 'Consultando dados da partida…';
  }
  $('#room-linked-title').textContent = game
    ? game.home.name + ' × ' + game.away.name
    : 'Nenhuma partida vinculada à transmissão';
  $('#room-match-open').disabled = !game;
  $('#room-match-toggle').disabled = !game;
  if (game) setRoomGame(game);
  else if (changed) setRoomGame(null);
  gameOptions();
  if (changed) details();
}
async function loadRoomGame() {
  if (roomBusy || document.hidden || $('#page-sala').hidden) return;
  roomBusy = true;
  try {
    const d = await communityRequest('room-game');
    applyGame(d.game);
  } catch (e) {
    $('#room-game-feedback').textContent = e.message;
  } finally {
    roomBusy = false;
  }
}
export function initRoomMatch() {
  $('#room-match-toggle').addEventListener('click', () => {
    const panel = $('#room-match-details');
    panel.hidden = !panel.hidden;
    $('#room-match-toggle').setAttribute(
      'aria-expanded',
      String(!panel.hidden),
    );
    $('#room-match-toggle').textContent = panel.hidden
      ? 'Mostrar estatísticas e escalações'
      : 'Ocultar estatísticas e escalações';
    details();
  });
  $('#spoiler-toggle').addEventListener('change', () => {
    if ($('#spoiler-toggle').checked) {
      $('#room-match-details').hidden = true;
      $('#room-match-toggle').setAttribute('aria-expanded', 'false');
      $('#room-match-toggle').textContent = 'Mostrar estatísticas e escalações';
    }
  });
  $('#room-match-open').addEventListener('click', () => {
    if (linked) navigate('partida/' + linked.leagueId + '/' + linked.id);
  });
  async function assign(clear = false) {
    if (!host) return;
    const [league, id] = $('#room-game-select').value.split('/');
    if (!clear && !id) {
      $('#room-game-feedback').textContent =
        'Escolha uma partida para vincular.';
      return;
    }
    $('#room-game-save').disabled = true;
    try {
      const d = await communityRequest('room-game', {
        league,
        id,
        clear,
        resumeToken,
      });
      applyGame(d.game);
      $('#room-game-feedback').textContent = clear
        ? 'Vínculo removido para todos.'
        : 'Partida vinculada para todos na sala.';
    } catch (e) {
      $('#room-game-feedback').textContent = e.message;
    } finally {
      $('#room-game-save').disabled = !host;
    }
  }
  $('#room-game-save').addEventListener('click', () => assign());
  $('#room-game-clear').addEventListener('click', () => assign(true));
  window.addEventListener('palermas:room', (e) => {
    host = !!e.detail.isPublisher;
    resumeToken = e.detail.resumeToken || '';
    $('#room-game-save').disabled = !host;
    $('#room-game-clear').disabled = !host;
    $('#room-game-host-note').textContent = host
      ? 'Você está transmitindo. Escolha a partida para toda a sala.'
      : 'O transmissor escolhe qual partida aparece para todos.';
    loadRoomGame();
  });
  window.addEventListener('palermas:roomselection', (e) => {
    chosen = e.detail;
    gameOptions();
  });
  window.addEventListener('football:games', gameOptions);
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'sala') {
      gameOptions();
      loadRoomGame();
      details();
    }
  });
  setInterval(loadRoomGame, 10000);
  setInterval(details, 60000);
  gameOptions();
  if (location.hash === '#sala') loadRoomGame();
}
