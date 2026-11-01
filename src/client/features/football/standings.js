import { markFreshness } from '../../shared/freshness.js';
import { formBadges } from '../../shared/football-visuals.js';
import { $, esc } from '../../shared/dom.js';
import { crest } from './presentation.js';
import { sourceNote, api } from '../../shared/football-api.js';
import { setLatestTable } from './game-store.js';
let tableRequest = 0;
let upcoming = null,
  upcomingBusy = false;

let latestTable = null;

function renderTable(data) {
  $('#table-title').textContent =
    data.league.name + (data.season ? ' · ' + data.season : '');
  $('#standings').innerHTML = data.groups
    .map(
      (group) =>
        (data.groups.length > 1
          ? `<tr class="table-group"><td colspan="13">${esc(group.name)}</td></tr>`
          : '') +
        group.rows
          .map(
            (r) =>
              `<tr class="${r.id === '3458' ? 'featured cap-row' : r.id === '3456' ? 'featured coxa-row' : ''} ${r.live ? 'live-row' : ''}"><td><span class="rank-zone" style="--zone-color:${esc(r.zone?.color || 'transparent')}" title="${esc(r.zone?.label || 'Posição')}" aria-label="${esc(r.rank + 'º' + (r.zone ? ' · ' + r.zone.label : ''))}">${esc(r.rank)}</span></td><td>${crest(r)}<a class="table-team-link" href="#time/${esc(r.id)}">${esc(r.name)}</a>${r.live ? '<span class="live-team-dot" title="Jogando agora"></span>' : ''}</td><td class="${r.live ? 'live-points' : ''}"><strong>${esc(r.points ?? '—')}</strong>${r.live?.projected ? `<small title="${esc(r.live.basePoints)} pontos antes do jogo">+${r.live.pointsAdded}</small>` : ''}</td>${[r.played, r.wins, r.draws, r.losses, r.goalDifference, r.goalsFor, r.goalsAgainst].map((v) => `<td>${esc(v ?? '—')}</td>`).join('')}<td>${formBadges(r.form?.length ? r.form : [...(r.recentForm || [])].reverse())}</td><td>${r.live ? `<button class="table-live-button" data-detail="${esc(r.live.gameId)}" title="${esc(r.live.home)} ${esc(r.live.score)} ${esc(r.live.away)}"><span class="live-dot"></span>${esc(r.live.score)}<small>${esc(r.live.status === 'Intervalo' ? 'INT' : r.live.clock || 'Ao vivo')}</small></button>` : '<span class="no-live">—</span>'}</td><td class="table-next-cell" data-next-team="${esc(r.id)}"><span class="data-note">Consultando agenda…</span></td></tr>`,
          )
          .join(''),
    )
    .join('');
  const zones = [
    ...new Map(
      data.groups
        .flatMap((g) => g.rows)
        .filter((r) => r.zone)
        .map((r) => [r.zone.label, r.zone]),
    ).values(),
  ];
  $('#table-zones').innerHTML =
    zones
      .map(
        (z) =>
          `<span><i style="background:${esc(z.color)}"></i>${esc(z.label)}</span>`,
      )
      .join('') +
    '<small>V vitória · E empate · D derrota · mais recente à esquerda</small>';
  $('#table-live-games').innerHTML = (data.liveGames || [])
    .map(
      (g) =>
        `<button class="live-game-chip" data-detail="${esc(g.id)}"><span class="live-dot"></span>${esc(g.home.name)} <b>${esc(g.homeScore)} × ${esc(g.awayScore)}</b> ${esc(g.away.name)} <small>${esc(g.status === 'Intervalo' ? 'Intervalo' : g.clock)}</small></button>`,
    )
    .join('');
  $('#table-data').textContent =
    sourceNote(data) +
    (data.enhancementSource
      ? ' · Zonas e forma: ' + data.enhancementSource
      : '') +
    (data.liveAvailable
      ? data.pointsMode === 'source'
        ? ' · Pontos informados pelo ge; jogos ao vivo destacados.'
        : ' · Pontos provisórios conforme o placar atual. Desempates oficiais podem alterar a ordem.'
      : ' · Consulta ao vivo indisponível; exibindo classificação da fonte.') +
    ' · PTS: pontos · J: jogos · V/E/D: vitórias, empates, derrotas · SG: saldo · GP/GC: gols pró/contra';
  markFreshness('#table-data', data, 60);
  renderNextGames();
}

function renderNextGames() {
  if (!upcoming || upcoming.leagueId !== $('#table-league').value) return;
  document.querySelectorAll('[data-next-team]').forEach((cell) => {
    const id = cell.dataset.nextTeam,
      game = upcoming.teams[id];
    if (!game) {
      cell.innerHTML =
        '<span class="data-note">Ainda sem jogo informado</span>';
      return;
    }
    const opponent = game.home.id === id ? game.away : game.home;
    const when = new Date(game.date).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    cell.innerHTML = `<a class="table-next-game" href="#partida/${esc(game.leagueId)}/${esc(game.id)}" title="${esc(game.league)} · ${game.home.id === id ? 'Em casa' : 'Fora de casa'} · Horário de Brasília">${crest(opponent)}<span><b>${esc(opponent.name)}</b><small>${esc(game.timeValid === false ? new Date(game.date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) + ' · Horário a definir' : when)} · ${game.home.id === id ? 'Casa' : 'Fora'}</small><small>${esc(game.league)}</small></span><span aria-hidden="true">↗</span></a>`;
  });
}
async function loadUpcoming() {
  const league = $('#table-league').value;
  if (upcomingBusy) return;
  if (
    upcoming?.leagueId === league &&
    Date.now() - Date.parse(upcoming.checkedAt) < 300000
  ) {
    renderNextGames();
    return;
  }
  upcomingBusy = true;
  try {
    const data = await api('upcoming?league=' + encodeURIComponent(league));
    if ($('#table-league').value !== league) return;
    upcoming = data;
    renderNextGames();
    $('#table-next-note').textContent =
      `Agenda: competições acompanhadas pelo site, nos próximos 60 dias. Horários de Brasília.${data.unavailable.length ? ' Consulta parcial: ' + data.unavailable.join(', ') + '.' : ''}`;
  } catch {
    if ($('#table-league').value === league) {
      document.querySelectorAll('[data-next-team]').forEach((cell) => {
        cell.textContent = 'Agenda indisponível';
      });
      $('#table-next-note').textContent =
        'Não foi possível consultar os próximos jogos. A classificação continua disponível.';
    }
  } finally {
    upcomingBusy = false;
    if ($('#table-league').value !== league) loadUpcoming();
  }
}
async function loadTable(quiet = false) {
  const request = ++tableRequest;
  if (!quiet) {
    $('#standings').innerHTML =
      '<tr><td colspan="13">Carregando classificação…</td></tr>';
    $('#table-data').textContent = 'Consultando classificação…';
    $('#table-live-games').replaceChildren();
  }
  try {
    const data = await api(
      'standings?league=' + encodeURIComponent($('#table-league').value),
    );
    if (request !== tableRequest) return;
    latestTable = data;
    setLatestTable(data);
    renderTable(data);
    loadUpcoming();
  } catch (error) {
    if (request !== tableRequest) return;
    markFreshness('#table-data', null, 60);
    if (
      quiet &&
      latestTable &&
      latestTable.league.id === $('#table-league').value
    ) {
      $('#table-data').textContent =
        'Atualização indisponível · Última consulta: ' +
        sourceNote(latestTable);
    } else {
      $('#standings').innerHTML =
        `<tr><td colspan="13">${esc(error.message)}</td></tr>`;
      $('#table-data').textContent =
        'Tente outra competição ou atualize a página.';
    }
  }
}

export function initStandings() {
  $('#table-data').parentElement.insertAdjacentHTML(
    'beforeend',
    '<p id="table-next-note" class="data-note"></p>',
  );
  $('#table-league').addEventListener('change', () => loadTable());
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'tabelas') loadTable(true);
  });
}
export { latestTable, loadTable };
