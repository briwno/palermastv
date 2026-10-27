import { $, esc } from '../../shared/dom.js';
import { favorites, today } from '../football/dashboard.js';
import { clubKey } from '../football/presentation.js';
import { timeText } from '../../shared/dates.js';
import { save } from '../../shared/storage.js';
import { navigate } from '../../shell/navigation.js';
import { agendas } from '../football/game-store.js';
let popupTimer;

const noticeItems = new Map();

const gameSnapshots = new Map();

let seenNotices = [];

let popupsEnabled = true;

try {
  seenNotices = JSON.parse(
    sessionStorage.getItem('palermas-seen-notices') || '[]',
  );
  if (!Array.isArray(seenNotices)) seenNotices = [];
  popupsEnabled = localStorage.getItem('palermas-popups') !== 'off';
} catch {}

function setAlertsOpen(open) {
  $('#alerts-panel').hidden = !open;
  $('#alerts-toggle').setAttribute('aria-expanded', String(open));
  if (open) {
    $('#important-popup').hidden = true;
    $('#alerts-count').hidden = true;
    $('#alerts-close').focus();
  }
}

function renderNotices() {
  const items = [...noticeItems.values()].slice(-20).reverse();
  $('#alerts-list').innerHTML = items.length
    ? items
        .map(
          (n) =>
            `<article class="notice-card"><span class="notice-kind">${esc(n.kind)}</span><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p>${n.gameId ? `<button class="text-button" data-detail="${esc(n.gameId)}">Ver jogo ↗</button>` : n.page ? `<button class="text-button" data-notice-page="${esc(n.page)}">${esc(n.action || 'Abrir')} ↗</button>` : ''}</article>`,
        )
        .join('')
    : '<p class="empty-message">Nenhum aviso no momento.</p>';
}

function addNotice(n, popup = false) {
  if (noticeItems.has(n.id)) return;
  noticeItems.set(n.id, n);
  renderNotices();
  const fresh = !seenNotices.includes(n.id);
  if (fresh) {
    seenNotices.push(n.id);
    seenNotices = seenNotices.slice(-100);
    try {
      sessionStorage.setItem(
        'palermas-seen-notices',
        JSON.stringify(seenNotices),
      );
    } catch {}
    $('#alerts-count').textContent = Math.min(noticeItems.size, 20);
    $('#alerts-count').hidden = false;
  }
  if (!popup || !fresh || !popupsEnabled || !$('#alerts-panel').hidden) return;
  // Match notifications stay silent in the room when spoiler protection is on.
  $('#important-popup').innerHTML =
    `<button class="popup-close" aria-label="Fechar aviso">×</button><span class="notice-kind">${esc(n.kind)}</span><strong>${esc(n.title)}</strong><p>${esc(n.text)}</p>${n.gameId ? `<button class="text-button" data-detail="${esc(n.gameId)}">Ver jogo ↗</button>` : n.page ? `<button class="text-button" data-notice-page="${esc(n.page)}">${esc(n.action || 'Abrir')} ↗</button>` : ''}`;
  $('#important-popup').hidden = false;
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => ($('#important-popup').hidden = true), 11000);
}

function renderLiveStrip(games) {
  const live = games.filter((g) => g.state === 'in');
  $('#live-strip').hidden = !live.length;
  $('#live-strip').innerHTML =
    `<span class="live-strip-label"><span class="live-dot"></span> AO VIVO <small>${live.length} ${live.length === 1 ? 'jogo' : 'jogos'}</small></span><div class="live-strip-games">${live
      .slice(0, 5)
      .map(
        (g) =>
          `<button data-detail="${esc(g.id)}">${esc(g.home.name)} <b>${esc(g.homeScore)} × ${esc(g.awayScore)}</b> ${esc(g.away.name)} <small>${esc(g.status === 'Intervalo' ? 'INT' : g.clock)}</small></button>`,
      )
      .join('')}</div>`;
}

function processGames(data) {
  if (!data || data.error) return;
  renderLiveStrip(data.games);
  const preferred = favorites.length ? favorites : ['cap', 'coxa'];
  const followed = (g) =>
    preferred.some((key) =>
      [clubKey(g.home.id), clubKey(g.away.id)].includes(key),
    );
  const live = data.games.filter((g) => g.state === 'in');
  if (live.length)
    addNotice(
      {
        id: 'round-live-' + today,
        kind: 'Rodada em andamento',
        title:
          live.length +
          ' ' +
          (live.length === 1 ? 'jogo ao vivo' : 'jogos ao vivo'),
        text: 'A classificação destaca em dourado os pontos dos times que estão jogando.',
        page: 'tabelas',
        action: 'Ver classificação',
      },
      true,
    );
  for (const g of data.games) {
    const previous = gameSnapshots.get(g.id);
    gameSnapshots.set(g.id, g);
    if (!followed(g)) continue;
    const title = g.home.name + ' × ' + g.away.name;
    if (g.state === 'in')
      addNotice(
        {
          id: g.id + '-live',
          kind: 'Ao vivo',
          title,
          text:
            (g.status === 'Intervalo'
              ? 'Intervalo'
              : g.clock || 'Partida em andamento') +
            ' · ' +
            g.league,
          gameId: g.id,
        },
        true,
      );
    if (
      previous &&
      g.state === 'in' &&
      (previous.homeScore !== g.homeScore || previous.awayScore !== g.awayScore)
    )
      addNotice(
        {
          id: g.id + '-score-' + g.homeScore + '-' + g.awayScore,
          kind: 'Placar atualizado',
          title,
          text: g.homeScore + ' × ' + g.awayScore + ' · ' + g.clock,
          gameId: g.id,
        },
        true,
      );
    if (previous?.state === 'in' && g.state === 'post')
      addNotice(
        {
          id: g.id + '-final',
          kind: 'Fim de jogo',
          title,
          text: 'Resultado: ' + g.homeScore + ' × ' + g.awayScore,
          gameId: g.id,
        },
        true,
      );
    const minutes = (new Date(g.date) - Date.now()) / 60000;
    if (g.state === 'pre' && minutes >= 0 && minutes <= 30)
      addNotice(
        {
          id: g.id + '-soon',
          kind: 'Começa em breve',
          title,
          text: timeText(g) + ' · ' + g.league,
          gameId: g.id,
        },
        true,
      );
  }
}

let lastPublisher = null;

export function initAlerts() {
  $('#alerts-enabled').checked = popupsEnabled;
  $('#alerts-toggle').addEventListener('click', () =>
    setAlertsOpen($('#alerts-panel').hidden),
  );
  $('#alerts-close').addEventListener('click', () => {
    setAlertsOpen(false);
    $('#alerts-toggle').focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setAlertsOpen(false);
      $('#important-popup').hidden = true;
    }
  });
  $('#alerts-enabled').addEventListener('change', (e) => {
    popupsEnabled = e.target.checked;
    save('palermas-popups', popupsEnabled ? 'on' : 'off');
    if (!popupsEnabled) $('#important-popup').hidden = true;
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.popup-close')) $('#important-popup').hidden = true;
    const b = e.target.closest('[data-notice-page]');
    if (b) {
      setAlertsOpen(false);
      $('#important-popup').hidden = true;
      navigate(b.dataset.noticePage);
    }
    if (
      e.target.closest(
        '#alerts-list [data-detail],#important-popup [data-detail]',
      )
    ) {
      setAlertsOpen(false);
      $('#important-popup').hidden = true;
    }
  });
  window.addEventListener('football:games', (e) => {
    if (e.detail.date === today) processGames(e.detail.data);
  });
  window.addEventListener('palermas:room', (e) => {
    if (e.detail.publisher && e.detail.publisher !== lastPublisher)
      addNotice(
        {
          id: 'room-' + e.detail.publisher,
          kind: 'Transmissão',
          title: 'A sala está ao vivo',
          text: 'Há uma transmissão disponível para os participantes conectados.',
          page: 'sala',
          action: 'Abrir sala',
        },
        true,
      );
    lastPublisher = e.detail.publisher;
  });
  if (agendas.get(today)) processGames(agendas.get(today));
}
