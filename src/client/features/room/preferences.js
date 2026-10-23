import { $ } from '../../shared/dom.js';
import { toast } from '../../shared/feedback.js';
import { save } from '../../shared/storage.js';
import { timeText } from '../../shared/dates.js';
import { navigate } from '../../shell/navigation.js';
import { findGame } from '../football/game-store.js';
import { gameState } from '../football/presentation.js';
let selected = null;

let roomGame = null;

function updateScore() {
  if (!roomGame) return;
  const fresh = findGame(roomGame.id) || roomGame;
  $('#room-score').textContent = $('#spoiler-toggle').checked
    ? 'Placar oculto'
    : fresh.homeScore !== null && fresh.awayScore !== null
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
    roomGame = selected;
    $('#selected-game').textContent =
      selected.home.name + ' × ' + selected.away.name;
    updateScore();
    $('#details').close();
    navigate('sala');
  });
  $('#spoiler-toggle').addEventListener('change', updateScore);
  $('#fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('#player').requestFullscreen();
    } catch {
      toast('Tela cheia indisponível neste navegador.');
    }
  });
  $('#save-nickname').addEventListener('click', () => {
    const name = $('#nickname').value.trim();
    updateNickname(name);
    save('palermas-nickname', name);
    toast('Apelido salvo.');
  });
}
export { setRoomGame, updateScore };
