import { $, esc } from '../../shared/dom.js';
import { communityRequest } from './api.js';
import { groupToken } from './identity.js';
import { save } from '../../shared/storage.js';
import { navigate } from '../../shell/navigation.js';

export function historyCards(games) {
  return games.length
    ? games
        .map(
          (item) =>
            `<article class="community-result"><a href="#partida/${esc(item.game.leagueId)}/${esc(item.game.id)}"><strong>${esc(item.game.home.name)} × ${esc(item.game.away.name)}</strong></a><small>${new Date(item.game.date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${item.total} voto(s)</small><p>🏆 Craque: ${esc(item.craques.map((p) => p.name + ' (' + p.votes + ')').join(', ') || 'Sem votos')}</p><p>🐟 Bagre: ${esc(item.bagres.map((p) => p.name + ' (' + p.votes + ')').join(', ') || 'Sem votos')}</p></article>`,
        )
        .join('')
    : '<p class="empty-message">Ainda não há votos pós-jogo no histórico.</p>';
}
async function loadHistory() {
  try {
    const data = await communityRequest('history');
    $('#award-history').innerHTML = historyCards(data.games);
  } catch (e) {
    $('#award-history').textContent = e.message;
  }
}
async function loadProfile() {
  try {
    $('#profile-name').value = localStorage.getItem('palermas-nickname') || '';
    const d = await communityRequest('profile', { operation: 'read' });
    if (d.profile) {
      $('#profile-name').value = d.profile.name;
      $('#profile-avatar').value = d.profile.avatar || '⚽';
      $('#profile-team').value = d.profile.team || '';
      applyProfile(d.profile);
    }
    $('#profile-stats').innerHTML =
      `<div class="participation-stats"><p><b>${d.stats.predictions}</b> Palpites</p><p><b>${d.stats.awards}</b> Votações pós-jogo</p><p><b>${d.stats.messages}</b> Mensagens</p></div>`;
  } catch (e) {
    $('#profile-feedback').textContent = e.message;
  }
}
function applyProfile(profile) {
  save('palermas-nickname', profile.name);
  $('#nickname').value = profile.name;
  $('#sidebar-profile-name').textContent = profile.name;
  $('#sidebar-profile-avatar').textContent = profile.avatar || '⚽';
  window.dispatchEvent(
    new CustomEvent('palermas:profile', { detail: profile }),
  );
}
export function initProfile() {
  window.addEventListener('palermas:profile', (e) => {
    $('#sidebar-profile-name').textContent = e.detail.name;
    $('#sidebar-profile-avatar').textContent = e.detail.avatar || '⚽';
    $('#sidebar-profile-team').textContent =
      { cap: 'Athletico', coxa: 'Coritiba', outro: 'Outro time' }[
        e.detail.team
      ] || 'Palermas FC';
  });
  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      const d = await communityRequest('profile', {
        name: $('#profile-name').value,
        avatar: $('#profile-avatar').value,
        team: $('#profile-team').value,
      });
      applyProfile(d.profile);
      $('#profile-feedback').textContent = 'Perfil salvo para o grupo.';
      await loadProfile();
    } catch (error) {
      $('#profile-feedback').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  $('#export-profile').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(groupToken);
      $('#profile-feedback').textContent =
        'Código copiado. Guarde-o em particular.';
    } catch {
      $('#profile-feedback').textContent =
        'Não foi possível copiar o código neste navegador.';
    }
  });
  $('#import-profile').addEventListener('click', async () => {
    const token = $('#profile-code').value.trim();
    if (!/^[a-zA-Z0-9_-]{32,100}$/.test(token)) {
      $('#profile-feedback').textContent = 'Confira o código informado.';
      return;
    }
    try {
      const data = await communityRequest('profile', {
        operation: 'read',
        token,
      });
      if (!data.profile) throw Error('Nenhum perfil salvo para esse código.');
      localStorage.setItem('palermas-player-token', token);
      localStorage.setItem('palermas-nickname', data.profile.name);
      location.reload();
    } catch (e) {
      $('#profile-feedback').textContent = e.message;
    }
  });
  $('#refresh-award-history').addEventListener('click', loadHistory);
  $('#sidebar-profile').addEventListener('click', () => navigate('perfil'));
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'perfil') {
      loadProfile();
      loadHistory();
    }
  });
  loadProfile();
  if (location.hash === '#perfil') loadHistory();
}
