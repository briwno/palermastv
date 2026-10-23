import { formBadges } from '../../shared/football-visuals.js';
import { $, esc } from '../../shared/dom.js';
import { crest } from './presentation.js';
import { sourceNote, api } from '../../shared/football-api.js';
import { setLatestTable } from './game-store.js';
let tableRequest = 0;

let latestTable = null;

function renderTable(data) {
  $('#table-title').textContent =
    data.league.name + (data.season ? ' · ' + data.season : '');
  $('#standings').innerHTML = data.groups
    .map(
      (group) =>
        (data.groups.length > 1
          ? `<tr class="table-group"><td colspan="12">${esc(group.name)}</td></tr>`
          : '') +
        group.rows
          .map(
            (r) =>
              `<tr class="${r.id === '3458' ? 'featured cap-row' : r.id === '3456' ? 'featured coxa-row' : ''} ${r.live ? 'live-row' : ''}"><td><span class="rank-zone" style="--zone-color:${esc(r.zone?.color || 'transparent')}" title="${esc(r.zone?.label || 'Posição')}" aria-label="${esc(r.rank + 'º' + (r.zone ? ' · ' + r.zone.label : ''))}">${esc(r.rank)}</span></td><td>${crest(r)}<span>${esc(r.name)}</span>${r.live ? '<span class="live-team-dot" title="Jogando agora"></span>' : ''}</td><td class="${r.live ? 'live-points' : ''}"><strong>${esc(r.points ?? '—')}</strong>${r.live?.projected ? `<small title="${esc(r.live.basePoints)} pontos antes do jogo">+${r.live.pointsAdded}</small>` : ''}</td>${[r.played, r.wins, r.draws, r.losses, r.goalDifference, r.goalsFor, r.goalsAgainst].map((v) => `<td>${esc(v ?? '—')}</td>`).join('')}<td>${formBadges(r.form?.length ? r.form : [...(r.recentForm || [])].reverse())}</td><td>${r.live ? `<button class="table-live-button" data-detail="${esc(r.live.gameId)}" title="${esc(r.live.home)} ${esc(r.live.score)} ${esc(r.live.away)}"><span class="live-dot"></span>${esc(r.live.score)}<small>${esc(r.live.status === 'Intervalo' ? 'INT' : r.live.clock || 'Ao vivo')}</small></button>` : '<span class="no-live">—</span>'}</td></tr>`,
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
}

async function loadTable(quiet = false) {
  const request = ++tableRequest;
  if (!quiet) {
    $('#standings').innerHTML =
      '<tr><td colspan="12">Carregando classificação…</td></tr>';
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
  } catch (error) {
    if (request !== tableRequest) return;
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
        `<tr><td colspan="12">${esc(error.message)}</td></tr>`;
      $('#table-data').textContent =
        'Tente outra competição ou atualize a página.';
    }
  }
}

export function initStandings() {
  $('#table-league').addEventListener('change', () => loadTable());
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'tabelas') loadTable(true);
  });
}
export { latestTable, loadTable };
