import { $, esc } from '../../shared/dom.js';
import { navigate } from '../../shell/navigation.js';
import { save } from '../../shared/storage.js';
import { toast } from '../../shared/feedback.js';

const cornerPreference = 'palermas-miniplayer-corner';
let pipWindow = null,
  floatingMode = null;
// The match poll keeps running while the broadcast plays outside the room.
export const playerFloating = () =>
  !!floatingMode || !!document.pictureInPictureElement;

function gameClock(game) {
  if (game.state === 'in') return game.clock || game.status;
  if (game.state === 'post') return 'Encerrado';
  return game.status;
}
function scoreStrip(game) {
  if (!game) return '<strong>Ao vivo · PalermasTV</strong>';
  const team = (t) =>
    `${t.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}<span>${esc(t.name)}</span>`;
  return `<span class="floating-team">${team(game.home)}</span><b>${esc(game.homeScore ?? '–')} × ${esc(game.awayScore ?? '–')}</b><span class="floating-team away">${team(game.away)}</span><small>${esc(gameClock(game))}</small>`;
}

export function initMiniplayer() {
  const player = $('#player'),
    video = $('#local-video'),
    mini = $('#miniplayer'),
    home = document.createComment('player-home'),
    away = document.createElement('div');
  player.before(home);
  away.className = 'player player-away';
  away.hidden = true;
  away.innerHTML =
    '<div class="player-placeholder"><div class="large-play">⧉</div><h2>Na janela flutuante</h2><p>A transmissão continua na janela flutuante.</p><button class="button subtle" id="player-away-return">Trazer de volta</button></div>';
  home.after(away);
  let dismissed = false,
    local = false,
    game = null,
    lastScore = null,
    goalTimer;
  const pipCapable = 'documentPictureInPicture' in window;
  $('#room-pip').hidden = !pipCapable && !document.pictureInPictureEnabled;
  $('#miniplayer-pip').hidden = $('#room-pip').hidden;

  const pipEl = (id) => pipWindow?.document.getElementById(id);
  function muteLabel() {
    return local
      ? 'Sua prévia fica muda'
      : video.muted
        ? 'Ativar som'
        : 'Silenciar';
  }
  function syncControls() {
    for (const button of [$('#miniplayer-mute'), pipEl('pip-mute')]) {
      if (!button) continue;
      button.disabled = local;
      button.textContent = muteLabel();
    }
  }
  function renderScore() {
    $('#miniplayer-score').innerHTML = scoreStrip(game);
    if (pipEl('pip-score')) pipEl('pip-score').innerHTML = scoreStrip(game);
  }
  function update() {
    if (!video.srcObject && pipWindow) pipWindow.close();
    const target = pipWindow
      ? pipEl('pip-video')
      : $('#page-sala').hidden && video.srcObject && !dismissed
        ? $('#miniplayer-video')
        : null;
    floatingMode = pipWindow ? 'window' : target ? 'mini' : null;
    mini.hidden = floatingMode !== 'mini';
    away.hidden = floatingMode !== 'window';
    let moved = false;
    if (target && player.parentElement !== target) {
      target.append(player);
      moved = true;
    } else if (!target && player.previousSibling !== home) {
      home.after(player);
      moved = true;
    }
    if (moved && video.srcObject)
      video.play().catch(() => {
        $('#mini-status').textContent =
          'Clique em Ativar som para retomar a reprodução.';
      });
  }
  function flashGoal(team) {
    const html = `<span>GOOOL!</span><strong>${esc(team.name)}</strong>`;
    for (const el of [$('#miniplayer-goal'), pipEl('pip-goal')]) {
      if (!el) continue;
      el.innerHTML = html;
      el.hidden = false;
    }
    clearTimeout(goalTimer);
    goalTimer = setTimeout(() => {
      $('#miniplayer-goal').hidden = true;
      if (pipEl('pip-goal')) pipEl('pip-goal').hidden = true;
    }, 5000);
  }
  function returnToRoom() {
    dismissed = false;
    navigate('sala');
    window.focus();
    pipWindow?.close();
  }

  async function openDocumentPip() {
    pipWindow = await window.documentPictureInPicture.requestWindow({
      width: 480,
      height: 340,
    });
    for (const sheet of document.styleSheets) {
      try {
        const style = pipWindow.document.createElement('style');
        style.textContent = [...sheet.cssRules]
          .map((r) => r.cssText)
          .join('\n');
        pipWindow.document.head.append(style);
      } catch {
        if (!sheet.href) continue;
        const link = pipWindow.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pipWindow.document.head.append(link);
      }
    }
    pipWindow.document.title = 'PalermasTV ao vivo';
    pipWindow.document.body.className = 'pip-body';
    pipWindow.document.body.innerHTML =
      '<div class="pip-score" id="pip-score"></div><div class="pip-video" id="pip-video"><div class="floating-goal" id="pip-goal" hidden></div></div><div class="pip-actions"><button class="text-button" id="pip-mute"></button><button class="text-button" id="pip-return">Voltar à sala</button></div>';
    pipEl('pip-mute').addEventListener('click', toggleMute);
    pipEl('pip-return').addEventListener('click', returnToRoom);
    pipWindow.addEventListener('pagehide', () => {
      pipWindow = null;
      update();
    });
    renderScore();
    syncControls();
    update();
  }
  async function openFloating() {
    if (!video.srcObject) {
      toast('Nenhuma transmissão ativa para abrir na janela flutuante.');
      return;
    }
    if (pipWindow) {
      pipWindow.focus();
      return;
    }
    try {
      if (pipCapable) await openDocumentPip();
      else await video.requestPictureInPicture();
    } catch {
      $('#mini-status').textContent =
        'Janela flutuante indisponível neste navegador.';
      toast('Janela flutuante indisponível neste navegador.');
    }
  }
  function toggleMute() {
    if (local) return;
    video.muted = !video.muted;
    video.play().catch(() => {});
    syncControls();
  }

  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'sala') dismissed = false;
    update();
  });
  window.addEventListener('palermas:media', (e) => {
    local = !!e.detail?.local;
    syncControls();
    update();
  });
  window.addEventListener('palermas:roomgame', (e) => {
    game = e.detail;
    const score = game && {
      id: game.leagueId + '/' + game.id,
      home: Number(game.homeScore),
      away: Number(game.awayScore),
    };
    // Celebrate only while the broadcast floats; the room has its own effect.
    if (
      playerFloating() &&
      score &&
      lastScore?.id === score.id &&
      game.state === 'in'
    ) {
      if (score.home === lastScore.home + 1 && score.away === lastScore.away)
        flashGoal(game.home);
      else if (
        score.away === lastScore.away + 1 &&
        score.home === lastScore.home
      )
        flashGoal(game.away);
    }
    lastScore = score;
    renderScore();
  });
  video.addEventListener('volumechange', syncControls);
  video.addEventListener('leavepictureinpicture', update);
  $('#room-pip').addEventListener('click', openFloating);
  $('#miniplayer-pip').addEventListener('click', openFloating);
  $('#player-away-return').addEventListener('click', returnToRoom);
  $('#miniplayer-return').addEventListener('click', returnToRoom);
  $('#miniplayer-close').addEventListener('click', () => {
    dismissed = true;
    navigate('sala');
  });
  $('#miniplayer-mute').addEventListener('click', toggleMute);

  // Dragging snaps the miniplayer to the nearest screen corner.
  try {
    mini.dataset.corner = localStorage.getItem(cornerPreference) || 'br';
  } catch {
    mini.dataset.corner = 'br';
  }
  const handle = mini.querySelector('.mini-heading');
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const r = mini.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    handle.setPointerCapture(e.pointerId);
    mini.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = Math.min(
        Math.max(0, e.clientX - drag.dx),
        innerWidth - mini.offsetWidth,
      ),
      y = Math.min(
        Math.max(0, e.clientY - drag.dy),
        innerHeight - mini.offsetHeight,
      );
    Object.assign(mini.style, {
      left: x + 'px',
      top: y + 'px',
      right: 'auto',
      bottom: 'auto',
    });
  });
  function endDrag(e) {
    if (!drag) return;
    drag = null;
    mini.classList.remove('dragging');
    const r = mini.getBoundingClientRect();
    const corner =
      (r.top + r.height / 2 < innerHeight / 2 ? 't' : 'b') +
      (r.left + r.width / 2 < innerWidth / 2 ? 'l' : 'r');
    mini.removeAttribute('style');
    mini.dataset.corner = corner;
    if (e.type === 'pointerup') save(cornerPreference, corner);
  }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}
