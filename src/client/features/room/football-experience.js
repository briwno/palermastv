import { $, esc } from '../../shared/dom.js';
import { goalChange } from './football-live.js';

let match = null,
  previous = null,
  updatedAt = 0,
  timer;
const icons = {
  goal: '⚽',
  'own-goal': '⚽',
  'penalty-goal': '⚽',
  'red-card': '🟥',
  'yellow-card': '🟨',
  substitution: '⇄',
  var: 'VAR',
};
function card(title, content) {
  const dialog = $('#room-football-card');
  $('#room-football-card-title').textContent = title;
  $('#room-football-card-body').innerHTML = content;
  dialog.showModal();
}
export function initFootballExperience() {
  $('.room-match-tools').insertAdjacentHTML(
    'beforeend',
    '<label class="initial-lineup-control"><input id="room-initial-lineup" type="checkbox"> Escalação inicial</label><button id="room-chat-toggle" class="button subtle" aria-expanded="false" aria-controls="room-live-chat">Chat da sala</button>',
  );
  $('#football-scoreboard').insertAdjacentHTML(
    'afterend',
    '<nav id="room-event-timeline" class="room-event-timeline" aria-label="Linha do tempo da partida" hidden></nav><div id="room-goal-effect" class="room-goal-effect" role="status" aria-live="polite" hidden></div>',
  );
  $('#page-sala').insertAdjacentHTML(
    'beforeend',
    '<dialog id="room-football-card" class="room-football-card" aria-labelledby="room-football-card-title"><button class="button subtle" id="room-football-card-close" aria-label="Fechar detalhes">✕</button><h2 id="room-football-card-title"></h2><div id="room-football-card-body"></div></dialog>',
  );
  const chat = $('.room-chat');
  chat.id = 'room-live-chat';
  chat
    .querySelector('.section-head')
    .insertAdjacentHTML(
      'beforeend',
      '<button id="room-chat-close" class="button subtle" aria-label="Recolher chat" hidden>✕</button>',
    );
  function closeChat() {
    chat.classList.remove('chat-drawer-open');
    $('#room-chat-close').hidden = true;
    $('#room-chat-toggle').setAttribute('aria-expanded', 'false');
  }
  $('#room-chat-toggle').addEventListener('click', () => {
    if (chat.classList.contains('chat-drawer-open')) {
      closeChat();
      return;
    }
    chat.classList.add('chat-drawer-open');
    $('#room-chat-close').hidden = false;
    $('#room-chat-toggle').setAttribute('aria-expanded', 'true');
    $('#chat-text').focus();
  });
  $('#room-chat-close').addEventListener('click', () => {
    closeChat();
    $('#room-chat-toggle').focus();
  });
  $('#room-football-card-close').addEventListener('click', () =>
    $('#room-football-card').close(),
  );
  $('#room-football-card').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      const r = e.currentTarget.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        e.currentTarget.close();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chat.classList.contains('chat-drawer-open')) {
      closeChat();
      $('#room-chat-toggle').focus();
    }
  });
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page !== 'sala') {
      closeChat();
      resetFootballExperience();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      previous = null;
      hideGoal();
    }
  });
  $('#page-sala').addEventListener('click', (e) => {
    const playerButton = e.target.closest('[data-room-player]');
    if (playerButton && match) {
      const [teamId, id] = playerButton.dataset.roomPlayer.split('/');
      const lineup = match.lineups.find((l) => l.team.id === teamId);
      const p = lineup?.players.find((p) => p.id === id);
      if (!p) return;
      card(
        p.name,
        `<div class="player-card-identity">${p.photo ? `<img src="${esc(p.photo)}" data-player-photo data-photo-fallback="${esc(p.photoFallback || '')}" alt="${esc(p.name)}">` : ''}<div><strong>${esc(lineup.team.name)} · ${esc(p.jersey || '—')}</strong><p>${esc(p.position || 'Posição não informada')}</p><small>${p.subbedOut ? 'Substituído' : p.subbedIn ? 'Entrou durante a partida' : p.starter ? 'Titular' : 'Reserva'}</small></div></div><div class="player-card-stats">${[
          ['Gols', p.goals],
          ['Assistências', p.assists],
          ['Amarelos', p.yellowCards],
          ['Vermelhos', p.redCards],
        ]
          .map(
            ([label, value]) =>
              `<div><b>${esc(value ?? '—')}</b><span>${label}</span></div>`,
          )
          .join(
            '',
          )}</div><p class="data-note">Estatísticas: ESPN · ${p.photoSource === 'FotMob' ? 'Foto: FotMob' : 'Foto: ESPN'} · Atualização do jogo ${esc(new Date(match.checkedAt || Date.now()).toLocaleTimeString('pt-BR'))}</p>`,
      );
    }
    const eventButton = e.target.closest('[data-room-event]');
    if (eventButton && match) {
      const event = match.events.find(
        (v) => v.id === eventButton.dataset.roomEvent,
      );
      if (event)
        card(
          `${event.clock} · ${event.label}`,
          `<p class="event-card-icon">${icons[event.type] || '•'}</p><h3>${esc(event.teamName || [match.game.home, match.game.away].find((t) => t.id === event.teamId)?.name || '')}</h3><p>${esc(event.participants.join(' · ') || 'Sem detalhes adicionais na fonte.')}</p><small class="data-note">Fonte: ESPN</small>`,
        );
    }
    if (e.target.closest('[data-dismiss-goal]')) hideGoal();
  });
}
function hideGoal() {
  clearTimeout(timer);
  const el = $('#room-goal-effect');
  if (el) el.hidden = true;
}
export function resetFootballExperience() {
  previous = null;
  match = null;
  updatedAt = 0;
  hideGoal();
  const timeline = $('#room-event-timeline');
  if (timeline) {
    timeline.hidden = true;
    timeline.innerHTML = '';
  }
  $('#room-football-card')?.close?.();
}
export function updateFootballExperience(data) {
  match = data;
  const timeline = $('#room-event-timeline');
  const events = (data.events || []).filter((e) => icons[e.type]);
  const html =
    events
      .map(
        (e) =>
          `<button class="timeline-event timeline-${esc(e.type)}" data-room-event="${esc(e.id)}" aria-label="${esc(e.clock + ' ' + e.label + ' ' + e.participants.join(', '))}"><span>${icons[e.type]}</span><b>${esc(e.clock)}</b><small>${esc(e.participants[0] || e.label)}</small></button>`,
      )
      .join('') ||
    '<span class="data-note">Os principais lances aparecerão aqui.</span>';
  if (timeline.innerHTML !== html) timeline.innerHTML = html;
  timeline.hidden = false;
  const now = Date.now();
  const side = now - updatedAt < 45000 ? goalChange(previous, data.game) : null;
  previous = { ...data.game };
  updatedAt = now;
  if (!side || document.hidden || $('#page-sala').hidden) return;
  const team = data.game[side];
  const effect = $('#room-goal-effect');
  effect.innerHTML = `<div class="goal-rays" aria-hidden="true"></div><div class="goal-confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div><div class="goal-announcement">${team.logo ? `<img src="${esc(team.logo)}" alt="">` : ''}<div><small>${esc(team.name)}</small><strong>GOOOL!</strong><span>${esc(data.game.homeScore)} × ${esc(data.game.awayScore)}</span></div></div><button class="goal-dismiss" data-dismiss-goal aria-label="Fechar comemoração">✕</button>`;
  effect.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(hideGoal, 5500);
}
