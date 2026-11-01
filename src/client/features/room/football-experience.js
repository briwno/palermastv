import { $, esc } from '../../shared/dom.js';
import { goalChange } from './football-live.js';

let match = null,
  previous = null,
  updatedAt = 0,
  timelineHTML = '',
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
const goalTypes = new Set(['goal', 'own-goal', 'penalty-goal']);
const teamName = (event) =>
  event.teamName ||
  [match.game.home, match.game.away].find((t) => t.id === event.teamId)?.name ||
  '';
function findPlayer(id, name) {
  for (const lineup of match.lineups || []) {
    const p = lineup.players.find((p) => (id ? p.id === id : p.name === name));
    if (p) return { ...p, team: lineup.team };
  }
  return null;
}
function participants(event) {
  return event.participants.map(
    (name, i) =>
      findPlayer(event.participantIds?.[i], name) || { name, team: null },
  );
}
// ESPN lists the incoming player first; lineup flags settle the rare reversed feed.
function substitutionPair(event) {
  const [a, b] = participants(event);
  return a?.subbedOut && b?.subbedIn ? [b, a] : [a, b];
}
function avatar(p, extra = '') {
  const initials = p.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return `<span class="event-avatar ${extra}"><span aria-hidden="true">${esc(initials)}</span>${p.photo ? `<img src="${esc(p.photo)}" data-player-photo data-photo-fallback="${esc(p.photoFallback || '')}" alt="">` : ''}${p.jersey ? `<i>${esc(p.jersey)}</i>` : ''}</span>`;
}
const position = (p) => p.position || 'Posição não informada';
const rating = (p) =>
  Number.isFinite(p.rating) ? ` · Nota ${p.rating.toFixed(1)}` : '';
function scoreline(event) {
  if (!event.scoreAfter) return '';
  const logo = (t) =>
    t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.name)}">` : esc(t.name);
  return `<span class="event-scoreline">${logo(match.game.home)}${esc(event.scoreAfter)}${logo(match.game.away)}</span>`;
}
function eventTip(event) {
  const head = `<div class="event-tip-head">${esc(event.label)}<span>${esc(event.clock)}</span></div>`;
  const row = (p, note = '', extra = '') =>
    `<div class="event-tip-row">${avatar(p, extra)}<p>${note}<b>${esc(p.name)}</b><small>${esc(p.team?.name || teamName(event))} · ${esc(position(p))}</small></p></div>`;
  if (event.type === 'substitution') {
    const [inP, outP] = substitutionPair(event);
    return `${head}${inP ? row(inP, '<span class="sub-in-label">▲ Entra</span> ', 'in') : ''}${outP ? row(outP, '<span class="sub-out-label">▼ Sai</span> ', 'out') : ''}`;
  }
  const [main, assist] = participants(event);
  if (!main)
    return `${head}<p class="event-tip-foot">${esc(event.text || teamName(event))}</p>`;
  const foot = goalTypes.has(event.type)
    ? [
        assist && event.type === 'goal' && `Assist.: ${esc(assist.name)}`,
        event.scoreAfter && `Placar: ${esc(event.scoreAfter)}`,
        event.video && 'Lance em vídeo disponível',
      ]
        .filter(Boolean)
        .join(' · ')
    : esc(event.text);
  return `${head}${row(main)}${foot ? `<p class="event-tip-foot">${foot}</p>` : ''}`;
}
function eventCard(event) {
  const narration = event.text
    ? `<blockquote class="event-narration">${esc(event.text)}</blockquote>`
    : '';
  if (event.type === 'substitution') {
    const side = (p, kind) =>
      p
        ? `<div class="sub-side ${kind}"><span class="sub-side-label">${kind === 'in' ? '▲ Entra' : '▼ Sai'}</span>${avatar(p, 'large ' + kind)}<strong>${esc(p.name)}</strong><small>${esc(position(p))}${p.jersey ? ' · #' + esc(p.jersey) : ''}${esc(rating(p))}</small></div>`
        : '';
    const [inP, outP] = substitutionPair(event);
    return `<div class="sub-swap">${side(inP, 'in')}<span class="sub-swap-icon" aria-hidden="true">⇄</span>${side(outP, 'out')}</div>${narration}`;
  }
  const [main, assist] = participants(event);
  const hero = main
    ? `<div class="event-hero">${avatar(main, 'large')}<div><h3>${esc(main.name)}</h3><p>${esc(position(main))}${main.jersey ? ' · #' + esc(main.jersey) : ''}${esc(rating(main))}</p>${assist && event.type === 'goal' ? `<p>Assistência: <b>${esc(assist.name)}</b></p>` : ''}${scoreline(event)}</div></div>`
    : `<p class="event-card-icon">${icons[event.type] || '•'}</p>`;
  if (!goalTypes.has(event.type))
    return (
      hero +
      (event.type === 'red-card'
        ? '<span class="event-pill">Expulso</span>'
        : '') +
      narration
    );
  const video = event.video
    ? `<a class="event-video" href="${esc(event.video.url)}" target="_blank" rel="noopener noreferrer"><span class="event-video-thumb">${event.video.thumbnail ? `<img src="${esc(event.video.thumbnail)}" alt="">` : ''}<span aria-hidden="true">▶</span></span><span><b>${esc(event.video.title)}</b><small>Vídeo ESPN${event.video.duration ? ' · ' + Math.floor(event.video.duration / 60) + ':' + String(event.video.duration % 60).padStart(2, '0') : ''} · abre em nova aba</small></span></a>`
    : '<p class="data-note">Vídeo do lance ainda não disponível na ESPN.</p>';
  const stats = main
    ? [
        ['Gols', main.goals],
        ['Assist.', main.assists],
        ['Finalizações', main.stats?.totalShots],
        ['No gol', main.stats?.shotsOnTarget],
      ].filter(([, v]) => v !== null && v !== undefined)
    : [];
  return `${hero}${narration}${video}${stats.length ? `<div class="player-card-stats">${stats.map(([l, v]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>` : ''}`;
}
export function recentEventsHTML(limit) {
  const events = (match?.events || [])
    .filter((e) => icons[e.type])
    .slice(0, limit);
  if (!events.length) return '<p>Nenhum lance disponível na fonte.</p>';
  return `<ol class="room-recent-events">${events
    .map((e) => {
      const team = [match.game.home, match.game.away].find(
        (t) => t.id === e.teamId,
      );
      const side = team === match.game.away ? 'away' : 'home';
      let who = esc(e.participants.join(' · '));
      if (e.type === 'substitution') {
        const [inP, outP] = substitutionPair(e);
        who = `${inP ? `<span class="sub-in-label">▲</span> ${esc(inP.name)}` : ''}${outP ? ` <span class="sub-out-label">▼</span> ${esc(outP.name)}` : ''}`;
      } else if (goalTypes.has(e.type) && e.scoreAfter)
        who += ` <em>${esc(e.scoreAfter)}</em>`;
      return `<li><button type="button" class="recent-event ${side} recent-${esc(e.type)}" data-room-event="${esc(e.id)}"><b>${esc(e.clock)}</b><span class="recent-icon" aria-hidden="true">${icons[e.type]}</span><span class="recent-text"><strong>${esc(e.label)}${team ? ' · ' + esc(team.name) : ''}</strong><small>${who || esc(e.text)}</small></span>${team?.logo ? `<img src="${esc(team.logo)}" alt="">` : ''}</button></li>`;
    })
    .join('')}</ol>`;
}
let tipTimer, tipTarget;
function showTip(button, delay) {
  hideTip();
  tipTarget = button;
  button.classList.add('arming');
  tipTimer = setTimeout(() => {
    const event = match?.events.find((v) => v.id === button.dataset.roomEvent);
    const tip = $('#room-event-tip');
    if (!event || !button.isConnected) return hideTip();
    tip.innerHTML = eventTip(event);
    tip.hidden = false;
    const r = button.getBoundingClientRect();
    const x = Math.min(
      Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2),
      innerWidth - tip.offsetWidth - 8,
    );
    const below = r.bottom + 8;
    tip.style.left = x + 'px';
    tip.style.top =
      (below + tip.offsetHeight > innerHeight - 8
        ? r.top - tip.offsetHeight - 8
        : below) + 'px';
  }, delay);
}
function hideTip() {
  clearTimeout(tipTimer);
  tipTarget?.classList.remove('arming');
  tipTarget = null;
  const tip = $('#room-event-tip');
  if (tip) tip.hidden = true;
}
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
    '<dialog id="room-football-card" class="room-football-card" aria-labelledby="room-football-card-title"><button class="button subtle" id="room-football-card-close" aria-label="Fechar detalhes">✕</button><h2 id="room-football-card-title"></h2><div id="room-football-card-body"></div></dialog><div id="room-event-tip" class="room-event-tip" role="tooltip" hidden></div>',
  );
  const timeline = $('#room-event-timeline');
  timeline.addEventListener('pointerover', (e) => {
    const button = e.target.closest('[data-room-event]');
    if (button && button !== tipTarget && e.pointerType === 'mouse')
      showTip(button, 1500);
  });
  timeline.addEventListener('pointerout', (e) => {
    const button = e.target.closest('[data-room-event]');
    if (button && !button.contains(e.relatedTarget)) hideTip();
  });
  timeline.addEventListener('focusin', (e) => {
    const button = e.target.closest('[data-room-event]');
    if (button?.matches(':focus-visible')) showTip(button, 400);
  });
  timeline.addEventListener('focusout', hideTip);
  timeline.addEventListener('scroll', hideTip, { passive: true });
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
    if (e.key === 'Escape') hideTip();
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
        `<div class="player-card-identity">${p.photo ? `<img src="${esc(p.photo)}" data-player-photo data-photo-fallback="${esc(p.photoFallback || '')}" alt="${esc(p.name)}">` : ''}<div><strong>${esc(lineup.team.name)} · ${esc(p.jersey || '—')}</strong><p>${esc(p.position || 'Posição não informada')}</p><small>${p.redCards > 0 ? 'Expulso' : p.subbedOut ? 'Substituído' : p.subbedIn ? 'Entrou durante a partida' : p.starter ? 'Titular' : 'Reserva'}</small></div></div><div class="player-card-stats">${[
          ['Gols', p.goals],
          ['Assistências', p.assists],
          ['Amarelos', p.yellowCards],
          ['Vermelhos', p.redCards],
          ['Finalizações', p.stats?.totalShots],
          ['No gol', p.stats?.shotsOnTarget],
          ['Faltas cometidas', p.stats?.foulsCommitted],
          ['Faltas sofridas', p.stats?.foulsSuffered],
          ['Impedimentos', p.stats?.offsides],
          [
            'Defesas',
            /goalkeeper/i.test(p.positionCode || '') ? p.stats?.saves : null,
          ],
          [
            'Gols sofridos',
            /goalkeeper/i.test(p.positionCode || '')
              ? p.stats?.goalsConceded
              : null,
          ],
          [
            'Nota FotMob',
            Number.isFinite(p.rating) ? p.rating.toFixed(1) : null,
          ],
        ]
          .filter(([, value]) => value !== null && value !== undefined)
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
      hideTip();
      const event = match.events.find(
        (v) => v.id === eventButton.dataset.roomEvent,
      );
      if (event)
        card(
          `${event.clock} · ${event.label}`,
          `<p class="event-card-team">${esc(teamName(event))}</p>${eventCard(event)}<p class="data-note">Fonte: ESPN · Fotos: ESPN/FotMob</p>`,
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
  hideTip();
  const timeline = $('#room-event-timeline');
  if (timeline) {
    timeline.hidden = true;
    timeline.innerHTML = timelineHTML = '';
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
  if (timelineHTML !== html) {
    hideTip();
    timeline.innerHTML = timelineHTML = html;
  }
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
