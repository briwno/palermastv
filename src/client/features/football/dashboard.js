import { relativeDate, timeText, dateText } from '../../shared/dates.js';

import { clubKey, gameState, crest } from './presentation.js';

import { agendas } from './game-store.js';

import { $, esc, all } from '../../shared/dom.js';

import { sourceNote, api } from '../../shared/football-api.js';

import { loadTable } from './standings.js';

import { save } from '../../shared/storage.js';

import { loadClubs } from '../clubs/upcoming-games.js';

import { navigate } from '../../shell/navigation.js';

import { toast } from '../../shared/feedback.js';

let today = relativeDate(0);

let day = today;

let homeFilter = 'todos';

let agendaFilter = 'todos';

const pending = new Map();

let favorites = [];

try {
  favorites = JSON.parse(localStorage.getItem('palermas-favorites') || '[]');
  if (!Array.isArray(favorites)) favorites = [];
  favorites = favorites.filter((v) => ['cap', 'coxa'].includes(v));
} catch {}

const relevant = (g) =>
  favorites.some((key) =>
    [clubKey(g.home.id), clubKey(g.away.id)].includes(key),
  );

const matches = (g, filter) =>
  filter === 'todos' ||
  filter === g.region ||
  (filter === 'favoritos' && relevant(g));

function renderList(target, filter, date) {
  const data = agendas.get(date);
  if (!data) {
    $(target).innerHTML = '<div class="empty-message">Carregando jogos…</div>';
    return;
  }
  if (data.error) {
    $(target).innerHTML =
      `<div class="empty-message">${esc(data.error)}<br>Use “Atualizar jogos” para tentar novamente.</div>`;
    return;
  }
  let games = data.games.filter((g) => matches(g, filter));
  if (target === '#home-fixtures') {
    const priority = { in: 0, pre: 1, post: 2 };
    games = games
      .slice()
      .sort(
        (a, b) =>
          (priority[a.state] ?? 3) - (priority[b.state] ?? 3) ||
          (a.state === 'post'
            ? b.date.localeCompare(a.date)
            : a.date.localeCompare(b.date)),
      )
      .slice(0, 6);
  }
  $(target).innerHTML = games.length
    ? games
        .map(
          (g) =>
            `<div class="fixture ${g.state === 'in' ? 'is-live' : ''}"><div class="fixture-time">${timeText(g)}<small>${esc(gameState(g))}</small></div><div><div class="fixture-competition">${esc(g.league)}</div><div class="fixture-teams">${crest(g.home)}<span>${esc(g.home.name)}</span><strong class="versus">${g.homeScore !== null && g.awayScore !== null ? esc(g.homeScore) + ' × ' + esc(g.awayScore) : '×'}</strong>${crest(g.away)}<span>${esc(g.away.name)}</span></div></div><button class="fixture-open" data-detail="${esc(g.id)}" aria-label="Detalhes: ${esc(g.home.name)} contra ${esc(g.away.name)}">↗</button></div>`,
        )
        .join('')
    : '<div class="empty-message">Nenhum jogo encontrado para esta data e filtro.</div>';
}

function render() {
  renderList('#home-fixtures', homeFilter, today);
  renderList('#agenda-fixtures', agendaFilter, day);
  $('#today-count').textContent = agendas.get(today)?.games?.length ?? '—';
  $('#home-data').textContent = sourceNote(agendas.get(today));
  $('#agenda-data').textContent = sourceNote(agendas.get(day));
  $('#agenda-date-label').textContent = 'Jogos · ' + dateText(day);
  all('.favorite').forEach((b) => {
    const active = favorites.includes(b.dataset.team);
    b.setAttribute('aria-pressed', String(active));
    b.textContent = active ? '★' : '☆';
  });
  all('.club-card').forEach(
    (c) =>
      (c.style.order =
        favorites.length === 1 && c.classList.contains(favorites[0])
          ? '-1'
          : '0'),
  );
}

async function loadGames(date, force = false) {
  if (pending.has(date)) return pending.get(date);
  if (agendas.has(date) && !force) return render();
  const job = (async () => {
    try {
      agendas.set(date, await api('games?date=' + encodeURIComponent(date)));
      if (agendas.size > 8)
        for (const key of agendas.keys())
          if (key !== today && key !== day) agendas.delete(key);
    } catch (error) {
      agendas.set(date, { error: error.message });
    } finally {
      pending.delete(date);
      render();
      window.dispatchEvent(
        new CustomEvent('football:games', {
          detail: { date, data: agendas.get(date) },
        }),
      );
    }
  })();
  pending.set(date, job);
  return job;
}

function bindFilters(selector, callback) {
  all(selector + ' button').forEach((b) =>
    b.addEventListener('click', () => {
      all(selector + ' button').forEach((c) =>
        c.classList.toggle('selected', b === c),
      );
      callback(b);
      render();
    }),
  );
}

export function initDashboard() {
  all('.favorite').forEach((b) =>
    b.addEventListener('click', () => {
      const team = b.dataset.team;
      favorites = favorites.includes(team)
        ? favorites.filter((t) => t !== team)
        : [...favorites, team];
      save('palermas-favorites', JSON.stringify(favorites));
      render();
    }),
  );
  bindFilters('#home-filters', (b) => (homeFilter = b.dataset.filter));
  bindFilters('#agenda-filters', (b) => (agendaFilter = b.dataset.filter));
  bindFilters('#day-filters', (b) => {
    day = relativeDate({ ontem: -1, hoje: 0, amanha: 1 }[b.dataset.day]);
    $('#game-date').value = day;
    loadGames(day);
  });
  $('#game-date').value = day;
  $('#game-date').addEventListener('change', (e) => {
    if (!e.target.value) return;
    day = e.target.value;
    all('#day-filters button').forEach((b) =>
      b.classList.toggle(
        'selected',
        relativeDate({ ontem: -1, hoje: 0, amanha: 1 }[b.dataset.day]) === day,
      ),
    );
    loadGames(day);
    render();
  });
  $('#refresh-games').addEventListener('click', () => {
    loadGames(day, true);
    if (day !== today) loadGames(today, true);
    loadClubs();
  });
  $('#help').addEventListener('click', () =>
    toast(
      'Jogos e classificação: ESPN. Agenda e classificação atualizadas a cada minuto. Pontos dourados são provisórios durante o jogo. Emissoras aparecem quando informadas pela fonte.',
    ),
  );
  render();
  navigate(location.hash.slice(1));
  loadGames(today);
  loadClubs();
  loadTable();
  setInterval(() => {
    if (document.hidden) return;
    const current = relativeDate(0);
    if (current !== today) {
      if (day === today) {
        day = current;
        $('#game-date').value = day;
      }
      today = current;
    }
    loadGames(today, true);
    if (day !== today && !$('#page-jogos').hidden) loadGames(day, true);
    if (!$('#page-tabelas').hidden) loadTable(true);
  }, 60000);
}

export { favorites, today };
