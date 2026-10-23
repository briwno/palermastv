import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
let geRoundLoading = false;

let geRoundTime = 0;

let geRoundRequest = 0;

async function loadGERound() {
  const box = $('#ge-round-games');
  if (!box || geRoundLoading) return;
  geRoundLoading = true;
  const request = ++geRoundRequest;
  box.innerHTML = '<p class="empty-message">Carregando rodada…</p>';
  try {
    const d = await api('brasileirao?serie=' + $('#ge-serie').value);
    if (request !== geRoundRequest) return;
    box.innerHTML =
      d.rounds
        .map(
          (r) =>
            `<h3 class="ge-round-title">Rodada ${esc(r.number ?? 'atual')}${r.group ? ' · ' + esc(r.group) : ''}</h3><div class="ge-fixtures">${r.matches.map((m) => `<article class="ge-fixture ${[m.home, m.away].some((n) => /athletico|coritiba/i.test(n)) ? 'ge-favorite' : ''}"><span class="data-note">${esc(m.day || 'Data a definir')} · ${esc(m.time?.slice(0, 5) || 'Horário a definir')}${m.status === 'live' ? ' · 🔴 AO VIVO' : ''}</span><div><strong>${esc(m.home)}</strong><b>${esc(m.homeScore ?? '—')} × ${esc(m.awayScore ?? '—')}</b><strong>${esc(m.away)}</strong></div><small>${esc(m.venue || 'Local a definir')}</small>${m.sourceUrl ? `<a class="source-link" href="${esc(m.sourceUrl)}" target="_blank" rel="noopener noreferrer">Acompanhar no ge ↗</a>` : ''}</article>`).join('')}</div>`,
        )
        .join('') || '<p class="empty-message">Rodada ainda não publicada.</p>';
    $('#ge-round-source').textContent =
      'Fonte: ge · campeonato-brasileiro-api, por ezefranca · ' +
      new Date(d.checkedAt).toLocaleTimeString('pt-BR');
    geRoundTime = Date.now();
  } catch (error) {
    box.innerHTML = `<p class="empty-message">${esc(error.message)} A agenda acima continua disponível pela ESPN.</p>`;
    $('#ge-round-source').textContent =
      'Não foi possível consultar o ge agora.';
  } finally {
    geRoundLoading = false;
  }
}

export function initBrasileiraoRound() {
  $('#ge-serie')?.addEventListener('change', loadGERound);
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'jogos' && Date.now() - geRoundTime > 60000)
      loadGERound();
  });
  if (!$('#page-jogos').hidden) loadGERound();
}
