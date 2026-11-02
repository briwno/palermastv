import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { communityRequest } from '../group/api.js';
import { groupIdentity, groupPlayerId } from '../group/identity.js';
import {
  canPick,
  fixtureKey,
  fixtureCard,
  pickForm,
  votesView,
  rankingView,
} from './bolao-view.js';
let games = [],
  gamesRevision = 0,
  rankingRevision = 0,
  filter = 'all';
const drafts = new Map(),
  ownPicks = new Map(),
  openCards = new Set();
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
function renderGames() {
  $('#bolao-total-count').textContent = games.length;
  $('#bolao-open-count').textContent = games.filter(canPick).length;
  const visible = games.filter(
    (g) => filter === 'all' || (filter === 'open' ? canPick(g) : !canPick(g)),
  );
  const groupGame = (g) =>
    [g.home.id, g.away.id].some((id) => ['3458', '3456'].includes(id));
  const sorted = [...visible].sort(
    (a, b) =>
      Number(!canPick(a)) - Number(!canPick(b)) ||
      Number(!groupGame(a)) - Number(!groupGame(b)) ||
      a.date.localeCompare(b.date),
  );
  $('#bolao-games').innerHTML =
    sorted
      .map((g) =>
        fixtureCard(
          g,
          ownPicks.get(fixtureKey(g)),
          openCards.has(fixtureKey(g)),
        ),
      )
      .join('') ||
    `<div class="bolao-empty"><span aria-hidden="true">⚽</span><h3>${games.length ? 'Nenhum jogo neste filtro' : 'Sem jogos nesta data'}</h3><p>${filter === 'open' ? 'Os palpites fecham no início da partida.' : 'Escolha outro dia para ver os confrontos.'}</p><button class="button subtle" type="button" data-bolao-date-step="1">Próximo dia →</button></div>`;
  $('#bolao-today').classList.toggle(
    'is-selected',
    $('#bolao-date').value === today(),
  );
  for (const detail of $('#bolao-games').querySelectorAll('details[open]'))
    loadPick(detail);
}
async function loadGames() {
  const revision = ++gamesRevision;
  $('#bolao-games').setAttribute('aria-busy', 'true');
  $('#bolao-games').innerHTML =
    '<p class="data-note" role="status">Consultando os jogos…</p><div class="bolao-skeleton" aria-hidden="true"></div><div class="bolao-skeleton" aria-hidden="true"></div>';
  try {
    const data = await api(
      'games?date=' + encodeURIComponent($('#bolao-date').value),
    );
    if (revision !== gamesRevision) return;
    games = data.games || [];
    renderGames();
  } catch (e) {
    if (revision === gamesRevision)
      $('#bolao-games').innerHTML =
        `<div class="bolao-empty"><h3>Não foi possível carregar os jogos</h3><p>${esc(e.message)}</p><button class="button subtle" data-retry-bolao>Tentar novamente</button></div>`;
  } finally {
    if (revision === gamesRevision)
      $('#bolao-games').setAttribute('aria-busy', 'false');
  }
}
async function loadPick(detail) {
  if (detail.dataset.loading) return;
  detail.dataset.loading = 'true';
  const context = detail.dataset.bolaoGame,
    [league, id] = context.split('/'),
    box = detail.querySelector('.bolao-pick-content');
  box.innerHTML =
    '<p class="data-note" role="status">Consultando os palpites…</p>';
  try {
    await groupIdentity;
    const data = await communityRequest(
      `predictions?league=${encodeURIComponent(league)}&id=${id}`,
    );
    const game = games.find((g) => fixtureKey(g) === context);
    if (!game || !box.isConnected) return;
    if (data.locked) {
      game.picksLocked = true;
      const status = detail.querySelector('.bolao-status');
      status.textContent = game.state === 'post' ? 'Finalizado' : 'Fechado';
      status.className = 'bolao-status is-closed';
      $('#bolao-open-count').textContent = games.filter(canPick).length;
    }
    const own = data.votes.find((v) => v.id === groupPlayerId);
    if (own) {
      ownPicks.set(context, own);
      detail.querySelector('.bolao-card-action').textContent =
        `Seu palpite: ${own.home} × ${own.away}`;
      detail.classList.add('has-pick');
    }
    box.innerHTML =
      (data.locked
        ? `<div class="pick-locked"><span aria-hidden="true">🔒</span><div><b>Palpites encerrados</b><p>${data.result ? `Resultado confirmado: ${data.result.home} × ${data.result.away}` : 'Este jogo já começou. Confira os placares da galera.'}</p></div></div>`
        : pickForm(game, own, drafts.get(context))) +
      votesView(data.votes, groupPlayerId);
  } catch (e) {
    if (box.isConnected)
      box.innerHTML = `<p class="pick-feedback" role="status">${esc(e.message)}</p><button class="button subtle" data-retry-pick>Tentar novamente</button>`;
  } finally {
    delete detail.dataset.loading;
  }
}
function updateDraft(form) {
  const values = {
    home: Number(form.elements.home.value),
    away: Number(form.elements.away.value),
  };
  drafts.set(form.closest('[data-bolao-game]').dataset.bolaoGame, values);
  form.querySelector('.pick-draft-state').textContent = 'Alterações não salvas';
  form.querySelector('.pick-feedback').textContent = '';
  form.querySelector('.pick-feedback').classList.remove('is-success');
  form.querySelectorAll('[data-score-step]').forEach((b) => {
    const [side, step] = b.dataset.scoreStep.split(':');
    b.disabled = Number(step) < 0 ? values[side] <= 0 : values[side] >= 20;
  });
}
async function loadRanking() {
  const revision = ++rankingRevision;
  const params = new URLSearchParams({
    season: $('#ranking-season').value,
    league: $('#ranking-league').value,
    round: $('#ranking-round').value,
  });
  try {
    await groupIdentity;
    const data = await communityRequest('ranking?' + params);
    if (revision !== rankingRevision) return;
    for (const [id, values, label] of [
      ['#ranking-season', data.seasons || [], ''],
      ['#ranking-round', data.rounds || [], 'Rodada '],
    ]) {
      const select = $(id),
        value = select.value;
      select.innerHTML =
        '<option value="">Todas</option>' +
        values
          .map((v) => `<option value="${esc(v)}">${label}${esc(v)}</option>`)
          .join('');
      select.value = values.includes(value) ? value : '';
    }
    $('#ranking-round').disabled = !$('#ranking-league').value;
    $('#bolao-ranking').innerHTML = rankingView(data, groupPlayerId);
    $('#bolao-your-points').textContent =
      data.ranking.find((p) => p.id === groupPlayerId)?.points ?? 0;
    $('#bolao-ranking-scope').textContent = [
      $('#ranking-season').value || 'Todas as temporadas',
      $('#ranking-league').value
        ? $('#ranking-league').selectedOptions[0].textContent
        : 'Todos os campeonatos',
      $('#ranking-round').value ? 'Rodada ' + $('#ranking-round').value : '',
    ]
      .filter(Boolean)
      .join(' · ');
  } catch (e) {
    if (revision === rankingRevision)
      $('#bolao-ranking').innerHTML =
        `<p class="pick-feedback" role="status">${esc(e.message)}</p><button class="button subtle" data-retry-ranking>Tentar novamente</button>`;
  }
}
function changeDay(offset) {
  const date = new Date(($('#bolao-date').value || today()) + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  $('#bolao-date').value = date.toISOString().slice(0, 10);
  loadGames();
}
export function initBolao() {
  $('#bolao-date').value = today();
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'bolao') {
      loadGames();
      loadRanking();
    }
  });
  $('#bolao-date').addEventListener('change', () => {
    if ($('#bolao-date').value) loadGames();
  });
  $('#bolao-refresh').addEventListener('click', () => {
    loadGames();
    loadRanking();
  });
  $('#bolao-today').addEventListener('click', () => {
    $('#bolao-date').value = today();
    loadGames();
  });
  for (const id of ['#ranking-season', '#ranking-league', '#ranking-round'])
    $(id).addEventListener('change', () => {
      if (id !== '#ranking-round') $('#ranking-round').value = '';
      loadRanking();
    });
  $('#page-bolao').addEventListener('click', (e) => {
    const jump = e.target.closest('[data-bolao-jump]');
    if (jump) {
      const target = document.getElementById(jump.dataset.bolaoJump);
      if (target) {
        target.scrollIntoView({
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        });
        target.focus({ preventScroll: true });
      }
    }
    const day = e.target.closest('[data-bolao-date-step]');
    if (day) changeDay(Number(day.dataset.bolaoDateStep));
    const f = e.target.closest('[data-bolao-filter]');
    if (f) {
      filter = f.dataset.bolaoFilter;
      $('#page-bolao')
        .querySelectorAll('[data-bolao-filter]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      renderGames();
    }
    if (e.target.closest('[data-retry-bolao]')) loadGames();
    if (e.target.closest('[data-retry-ranking]')) loadRanking();
    if (e.target.closest('[data-retry-pick]'))
      loadPick(e.target.closest('[data-bolao-game]'));
    const step = e.target.closest('[data-score-step]'),
      preset = e.target.closest('[data-bolao-preset]');
    if (step) {
      const form = step.closest('form'),
        [side, delta] = step.dataset.scoreStep.split(':');
      form.elements[side].value = Math.min(
        20,
        Math.max(
          0,
          Math.trunc(Number(form.elements[side].value) || 0) + Number(delta),
        ),
      );
      updateDraft(form);
    }
    if (preset) {
      const form = preset.closest('form'),
        [home, away] = preset.dataset.bolaoPreset.split(',');
      form.elements.home.value = home;
      form.elements.away.value = away;
      updateDraft(form);
    }
  });
  $('#bolao-games').addEventListener(
    'toggle',
    (e) => {
      const detail = e.target;
      if (!detail.matches('[data-bolao-game]')) return;
      if (detail.open) {
        openCards.add(detail.dataset.bolaoGame);
        if (!detail.querySelector('.bolao-pick-content').children.length)
          loadPick(detail);
      } else openCards.delete(detail.dataset.bolaoGame);
    },
    true,
  );
  $('#bolao-games').addEventListener('input', (e) => {
    const form = e.target.closest('.bolao-pick-form');
    if (form) updateDraft(form);
  });
  $('#bolao-games').addEventListener('submit', async (e) => {
    if (!e.target.matches('.bolao-pick-form')) return;
    e.preventDefault();
    const form = e.target;
    if (form.dataset.saving || !form.checkValidity()) return;
    const detail = form.closest('[data-bolao-game]'),
      context = detail.dataset.bolaoGame,
      [league, id] = context.split('/');
    const home = Number(form.elements.home.value),
      away = Number(form.elements.away.value);
    form.dataset.saving = 'true';
    const controls = [...form.querySelectorAll('button,input')];
    controls.forEach((el) => (el.disabled = true));
    try {
      await communityRequest('predictions', { league, id, home, away });
      drafts.delete(context);
      await loadPick(detail);
      if (detail.isConnected && detail.querySelector('.pick-feedback')) {
        detail.querySelector('.pick-feedback').textContent = 'Palpite salvo!';
        detail.querySelector('.pick-feedback').classList.add('is-success');
      }
      loadRanking();
    } catch (err) {
      if (form.isConnected)
        form.querySelector('.pick-feedback').textContent = err.message;
    } finally {
      delete form.dataset.saving;
      if (form.isConnected) {
        controls.forEach((el) => (el.disabled = false));
        form.querySelectorAll('[data-score-step]').forEach((b) => {
          const [side, delta] = b.dataset.scoreStep.split(':');
          b.disabled =
            Number(delta) < 0
              ? Number(form.elements[side].value) <= 0
              : Number(form.elements[side].value) >= 20;
        });
      }
    }
  });
  setInterval(() => {
    if (!document.hidden && !$('#page-bolao').hidden) loadRanking();
  }, 60000);
}
