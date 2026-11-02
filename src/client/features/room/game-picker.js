import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { relativeDate, timeText, dateText } from '../../shared/dates.js';
import { agendas } from '../football/game-store.js';

const gameKey = (g) => `${g.leagueId}/${g.id}`;
const searchKey = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const dayKey = (g) =>
  g.day ||
  (g.date &&
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(g.date),
    ));
const favorite = (g) =>
  [g.home?.id, g.away?.id].some((id) => ['3458', '3456'].includes(String(id)));
const badge = (g) =>
  g.state === 'in'
    ? `Ao vivo${g.clock ? ' · ' + g.clock : ''}`
    : g.state === 'post'
      ? 'Encerrado'
      : g.status === 'Postponed'
        ? 'Adiado'
        : timeText(g);
const crest = (t) =>
  t.logo
    ? `<img src="${esc(t.logo)}" alt="Escudo de ${esc(t.name)}" loading="lazy">`
    : '<span class="picker-crest-empty" aria-hidden="true">⚽</span>';

export function initGamePicker(onGames) {
  const panel = $('.room-match-settings'),
    select = $('#room-game-select');
  let games = [],
    linked = null,
    filter = 'all',
    query = '',
    revision = 0,
    busy = false,
    error = '',
    signature = '';
  const fetched = new Map();
  $('#room-game-date').value = relativeDate(0);
  function preview() {
    const selected = games.find((g) => gameKey(g) === select.value);
    $('#room-game-preview').innerHTML = selected
      ? `<span class="eyebrow">${linked && gameKey(linked) === gameKey(selected) ? 'VINCULADA À SALA' : 'PRONTA PARA VINCULAR'}</span><strong>${crest(selected.home)}<span>${esc(selected.home.name)} × ${esc(selected.away.name)}</span>${crest(selected.away)}</strong><small>${esc(selected.league || '')} · ${esc(badge(selected))}</small>`
      : '<strong>Selecione um cartão acima</strong><small>O placar, as escalações e os lances acompanham a partida.</small>';
    $('#room-game-save').textContent =
      linked && selected && gameKey(linked) === gameKey(selected)
        ? 'Vincular novamente'
        : 'Vincular para a sala';
  }
  function render() {
    const date = $('#room-game-date').value;
    const visible = games
      .filter((g) => dayKey(g) === date)
      .filter(
        (g) =>
          filter === 'all' ||
          (filter === 'live' ? g.state === 'in' : favorite(g)),
      )
      .filter((g) =>
        searchKey(`${g.home.name} ${g.away.name} ${g.league}`).includes(query),
      )
      .sort(
        (a, b) =>
          Number(b.state === 'in') - Number(a.state === 'in') ||
          Number(favorite(b)) - Number(favorite(a)) ||
          Date.parse(a.date) - Date.parse(b.date),
      );
    $('#room-game-count').textContent = busy
      ? 'Consultando…'
      : `${visible.length} partida${visible.length === 1 ? '' : 's'}`;
    $('#room-game-list').setAttribute('aria-busy', String(busy));
    $('#room-game-list').innerHTML = busy
      ? '<div class="room-picker-empty" role="status">Consultando a agenda…</div>'
      : error
        ? `<div class="room-picker-empty"><b>Agenda indisponível</b><p>${esc(error)}</p><button type="button" class="button subtle" data-room-picker-retry>Tentar novamente</button></div>`
        : visible.length
          ? visible
              .map((g) => {
                const selected = select.value === gameKey(g),
                  current = linked && gameKey(linked) === gameKey(g);
                return `<button type="button" class="room-game-card ${g.state === 'in' ? 'is-live' : ''}" data-room-pick="${esc(gameKey(g))}" aria-pressed="${selected}" aria-label="Selecionar ${esc(g.home.name)} × ${esc(g.away.name)}"><span class="picker-card-top"><span>${esc(g.league || 'Futebol')}</span><span class="picker-match-state">${g.state === 'in' ? '<i class="live-dot"></i>' : ''}${esc(badge(g))}</span></span><span class="picker-card-fixture"><span>${crest(g.home)}<b>${esc(g.home.name)}</b></span><strong>${g.state === 'pre' ? '×' : `${esc(g.homeScore ?? '—')}<i>:</i>${esc(g.awayScore ?? '—')}`}</strong><span>${crest(g.away)}<b>${esc(g.away.name)}</b></span></span><span class="picker-card-bottom"><span>${current ? '● Na sala' : favorite(g) ? 'CAP & CFC' : dateText(date)}</span><span>${selected ? '✓ Selecionada' : 'Selecionar →'}</span></span></button>`;
              })
              .join('')
          : `<div class="room-picker-empty"><span aria-hidden="true">⚽</span><b>${query ? 'Nenhuma partida encontrada' : filter === 'live' ? 'Nenhum jogo ao vivo nesta data' : 'Nenhuma partida neste filtro'}</b><p>Tente outro dia, time ou campeonato.</p></div>`;
    preview();
  }
  async function load(force = false) {
    const date = $('#room-game-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const current = ++revision;
    error = '';
    signature = '';
    if (!force && agendas.has(date)) {
      busy = false;
      fetched.set(date, agendas.get(date).games || []);
      onGames();
      return;
    }
    busy = true;
    render();
    try {
      const data = await api('games?date=' + encodeURIComponent(date));
      fetched.set(date, data.games || []);
      if (current !== revision) return;
      busy = false;
      onGames();
    } catch (e) {
      if (current === revision) {
        error = e.message;
        busy = false;
        render();
      }
    }
  }
  panel.addEventListener('toggle', () => {
    if (panel.open) load();
  });
  $('#room-game-date').addEventListener('change', () => load());
  $('#room-game-today').addEventListener('click', () => {
    $('#room-game-date').value = relativeDate(0);
    load(true);
  });
  $('#room-game-search').addEventListener('input', (e) => {
    query = searchKey(e.target.value);
    render();
  });
  panel.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-room-pick]');
    if (pick) {
      select.value = pick.dataset.roomPick;
      render();
      [...$('#room-game-list').querySelectorAll('[data-room-pick]')]
        .find((b) => b.dataset.roomPick === select.value)
        ?.focus({ preventScroll: true });
    }
    const chip = e.target.closest('[data-room-game-filter]');
    if (chip) {
      filter = chip.dataset.roomGameFilter;
      panel
        .querySelectorAll('[data-room-game-filter]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === chip)));
      render();
    }
    const step = e.target.closest('[data-room-date-step]');
    if (step) {
      const date = new Date($('#room-game-date').value + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + Number(step.dataset.roomDateStep));
      $('#room-game-date').value = date.toISOString().slice(0, 10);
      load();
    }
    if (e.target.closest('[data-room-picker-retry]')) load(true);
  });
  select.addEventListener('change', render);
  return {
    games: () => [...fetched.values()].flat(),
    update(list, roomGame) {
      games = list;
      linked = roomGame;
      const next = JSON.stringify([
        games,
        linked,
        select.value,
        busy,
        $('#room-game-date').value,
      ]);
      if (next !== signature) {
        signature = next;
        render();
      }
    },
  };
}
