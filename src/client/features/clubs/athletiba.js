import { $, esc } from '../../shared/dom.js';
import { api, sourceNote } from '../../shared/football-api.js';
import { communityRequest } from '../group/api.js';
import { historyCards } from '../group/profile.js';
import { clubGames } from '../football/game-store.js';
let busy = false;
const classic = (game) =>
  [game.home.id, game.away.id].includes('3458') &&
  [game.home.id, game.away.id].includes('3456');
function gameCard(g) {
  clubGames.set('athletiba-' + g.id, g);
  return `<article class="community-result"><strong>${esc(g.home.name)} × ${esc(g.away.name)}</strong><p>${new Date(g.date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${esc(g.league)}</p><p>${g.state === 'post' ? esc(g.homeScore ?? '—') + ' × ' + esc(g.awayScore ?? '—') : g.state === 'in' ? 'Em andamento' : 'Agendado'}</p>${g.detailsAvailable ? `<a class="button subtle" href="#partida/${esc(g.leagueId)}/${esc(g.id)}">${g.state === 'post' ? 'Ver jogo e votar' : 'Ver jogo e palpitar'} ↗</a>` : '<small>Detalhes desta competição ainda não disponíveis no site.</small>'}</article>`;
}
async function load() {
  if (busy) return;
  busy = true;
  $('#athletiba-refresh').disabled = true;
  try {
    const d = await api('athletiba');
    $('#athletiba-summary').innerHTML =
      `<div class="athletiba-score"><div><b>${d.summary.cap}</b><span>Vitórias do Athletico</span></div><div><b>${d.summary.draws}</b><span>Empates</span></div><div><b>${d.summary.coxa}</b><span>Vitórias do Coritiba</span></div></div><p class="data-note">Recorte de ${d.seasons[d.seasons.length - 1]} a ${d.seasons[0]} · ${d.summary.counted} jogo(s) encerrado(s) com placar na consulta. Não representa o retrospecto completo do clássico.</p>`;
    $('#athletiba-source').textContent =
      sourceNote(d) +
      (d.partial
        ? ' · Consulta parcial: um ou mais calendários indisponíveis.'
        : '');
    $('#athletiba-upcoming').innerHTML =
      d.upcoming.map(gameCard).join('') ||
      '<p class="empty-message">Nenhum próximo clássico informado neste calendário.</p>';
    $('#athletiba-history').innerHTML =
      d.history.map(gameCard).join('') ||
      '<p class="empty-message">Nenhum confronto retornado para o período consultado.</p>';
    $('#athletiba-facts').innerHTML = d.clubs
      .map(
        (c) =>
          `<article class="panel"><span class="eyebrow">${esc(c.nickname)}</span><h3>${esc(c.name)}</h3><p>Fundado em ${esc(c.founded)}.</p><p>Estádio: ${esc(c.stadium)}.</p><h4>Conquistas em destaque</h4><ul>${c.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul><a class="source-link" href="${esc(c.official)}" target="_blank" rel="noopener noreferrer">Site do clube ↗</a></article>`,
      )
      .join('');
  } catch (e) {
    $('#athletiba-source').textContent = e.message;
  } finally {
    busy = false;
    $('#athletiba-refresh').disabled = false;
  }
  try {
    const data = await communityRequest('history');
    $('#athletiba-awards').innerHTML = historyCards(
      data.games.filter((item) => classic(item.game)),
    );
  } catch (e) {
    $('#athletiba-awards').textContent = e.message;
  }
}
export function initAthletiba() {
  $('#athletiba-refresh').addEventListener('click', load);
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'clubes' && !$('#club-classic').hidden) load();
  });
  window.addEventListener('palermas:hubsection', (e) => {
    if (['classic', 'history'].includes(e.detail.section)) load();
  });
  if (['#clubes/classico', '#clubes/historia'].includes(location.hash)) load();
}
