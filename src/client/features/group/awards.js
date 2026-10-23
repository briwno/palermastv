import { $, esc } from '../../shared/dom.js';
import { activeMatch, activeMatchKey } from '../match/match-center.js';
import { communityRequest } from './api.js';
import { groupIdentity, groupPlayerId } from './identity.js';
let generation = 0;
async function loadAwards() {
  const d = activeMatch,
    key = activeMatchKey,
    current = ++generation;
  if (!d) {
    $('#match-awards').textContent = 'Aguarde os dados da partida.';
    return;
  }
  if (d.game.state !== 'post') {
    $('#match-awards').innerHTML =
      '<div class="panel empty-message">A votação de craque e bagre abre depois do encerramento da partida.</div>';
    return;
  }
  try {
    await groupIdentity;
    const data = await communityRequest(
      `awards?league=${encodeURIComponent(d.game.leagueId)}&id=${encodeURIComponent(d.game.id)}`,
    );
    if (key !== activeMatchKey || current !== generation) return;
    const players = d.lineups.flatMap((l) =>
      l.players
        .filter((p) => p.id && (p.starter || p.subbedIn))
        .map((p) => ({ ...p, team: l.team.name })),
    );
    const own = data.votes[groupPlayerId];
    const options = (selected) =>
      '<option value="">Escolha um jogador</option>' +
      players
        .map(
          (p) =>
            `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)} · ${esc(p.team)}</option>`,
        )
        .join('');
    $('#match-awards').innerHTML =
      `<section class="panel"><div class="section-head"><h2>Craque e bagre da partida</h2><button class="text-button" data-refresh-awards>Atualizar ↻</button></div><p>Um voto por pessoa em cada categoria. Você pode alterar suas escolhas. Só entram jogadores que participaram da partida.</p>${players.length > 1 ? `<form id="award-form" data-key="${esc(key)}"><label class="field-label" for="award-craque">🏆 Craque</label><select class="text-input" id="award-craque" required>${options(own?.craque)}</select><label class="field-label" for="award-bagre">🐟 Bagre</label><select class="text-input" id="award-bagre" required>${options(own?.bagre)}</select><button class="button lime" type="submit">${own ? 'Alterar meu voto' : 'Salvar meu voto'}</button><p role="status" id="award-feedback"></p></form>` : '<p class="notice">A fonte ainda não informou os jogadores que participaram. Tente atualizar mais tarde.</p>'}<div class="community-result"><strong>Parcial · ${data.total} voto(s)</strong><p>🏆 ${esc(data.craques.map((p) => p.name + ' · ' + p.votes + ' voto(s)').join(' / ') || 'Nenhum craque escolhido')}</p><p>🐟 ${esc(data.bagres.map((p) => p.name + ' · ' + p.votes + ' voto(s)').join(' / ') || 'Nenhum bagre escolhido')}</p></div><p class="data-note">Empates mostram todos os mais votados. O resultado fica no histórico em Meu perfil.</p></section>`;
  } catch (e) {
    if (key === activeMatchKey && current === generation)
      $('#match-awards').innerHTML =
        `<div class="panel"><p role="status">${esc(e.message)}</p><button class="button subtle" data-refresh-awards>Tentar novamente</button></div>`;
  }
}
export function initAwards() {
  window.addEventListener('football:matchtab', (e) => {
    if (e.detail.name === 'awards') loadAwards();
  });
  window.addEventListener('football:match', () => {
    if (!$('#match-awards').hidden) loadAwards();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-refresh-awards]')) loadAwards();
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'award-form') return;
    e.preventDefault();
    const key = e.target.dataset.key,
      button = e.target.querySelector('button');
    if (key !== activeMatchKey) return;
    button.disabled = true;
    try {
      await communityRequest('awards', {
        league: activeMatch.game.leagueId,
        id: activeMatch.game.id,
        craque: $('#award-craque').value,
        bagre: $('#award-bagre').value,
      });
      if (key === activeMatchKey) {
        await loadAwards();
        if ($('#award-feedback'))
          $('#award-feedback').textContent =
            'Voto salvo no histórico do grupo.';
      }
    } catch (error) {
      if (key === activeMatchKey && $('#award-feedback'))
        $('#award-feedback').textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
}
