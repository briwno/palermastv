import { $, esc } from '../../shared/dom.js';
import { toast } from '../../shared/feedback.js';
import { save } from '../../shared/storage.js';
import { timeText } from '../../shared/dates.js';
import { navigate } from '../../shell/navigation.js';
import { findGame } from '../football/game-store.js';
import { gameState } from '../football/presentation.js';
import { communityRequest } from '../group/api.js';
let selected = null;

let roomGame = null;

function updateScore() {
  if (!roomGame) {
    $('#room-score').textContent = 'Nenhuma partida selecionada';
    return;
  }
  const fresh = roomGame;
  const board = $('#football-scoreboard');
  if (board) {
    const team = (side) =>
      `<div class="scoreboard-team">${fresh[side].logo ? `<img src="${esc(fresh[side].logo)}" alt="">` : ''}<strong>${esc(fresh[side].name)}</strong></div>`;
    board.innerHTML = `<div class="scoreboard-competition">${esc(fresh.league || 'Partida')}</div><div class="scoreboard-main">${team('home')}<div class="scoreboard-result"><strong>${esc(fresh.homeScore ?? '–')}<span>:</span>${esc(fresh.awayScore ?? '–')}</strong><small>${esc(gameState(fresh) || timeText(fresh))}</small></div>${team('away')}</div>`;
  }
  $('#room-score').textContent =
    fresh.homeScore !== null && fresh.awayScore !== null
      ? fresh.homeScore + ' × ' + fresh.awayScore + ' · ' + gameState(fresh)
      : 'Jogo agendado · ' + timeText(fresh);
}

function updateNickname(name) {
  const label = $('#local-member-name');
  if (label) label.textContent = name || 'Você';
}

try {
  const nick = localStorage.getItem('palermas-nickname') || '';
  $('#nickname').value = nick;
  updateNickname(nick);
} catch {}

function setRoomGame(game) {
  roomGame = game;
  $('#selected-game').textContent = game
    ? game.home.name + ' × ' + game.away.name
    : 'Escolha um jogo na agenda';
  updateScore();
}

export function initRoomPreferences() {
  window.addEventListener('football:games', updateScore);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-detail]');
    if (!b) return;
    selected = findGame(b.dataset.detail);
    if (selected)
      window.dispatchEvent(
        new CustomEvent('football:openmatch', { detail: selected }),
      );
  });
  $('.dialog-close').addEventListener('click', () => $('#details').close());
  $('#details').addEventListener('click', (e) => {
    if (e.target === $('#details')) {
      const r = $('#details').getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        $('#details').close();
    }
  });
  $('#watch-game').addEventListener('click', () => {
    if (!selected) return;
    setRoomGame(selected);
    window.dispatchEvent(
      new CustomEvent('palermas:roomselection', { detail: selected }),
    );
    $('#selected-game').textContent =
      selected.home.name + ' × ' + selected.away.name;
    updateScore();
    $('#details').close();
    navigate('sala');
  });
  $('#fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('#player').requestFullscreen();
    } catch {
      toast('Tela cheia indisponível neste navegador.');
    }
  });
  $('#save-nickname').addEventListener('click', async () => {
    const name = $('#nickname').value.trim();
    if (!name) {
      toast('Informe seu apelido.');
      return;
    }
    const button = $('#save-nickname');
    button.disabled = true;
    try {
      const { profile } = await communityRequest('profile', {
        operation: 'read',
      });
      const data = await communityRequest('profile', {
        name,
        avatar: profile?.avatar || '⚽',
        team: profile?.team || '',
      });
      updateNickname(data.profile.name);
      save('palermas-nickname', data.profile.name);
      window.dispatchEvent(
        new CustomEvent('palermas:profile', { detail: data.profile }),
      );
      toast('Apelido salvo no seu perfil.');
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
}
export { setRoomGame, updateScore };
