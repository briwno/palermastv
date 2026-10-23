import { activeMatch, activeMatchKey } from './match-center.js';
import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { refreshSofaWidget } from './lineup-widget.js';
let ratingsKey = '';

async function loadRatings() {
  if (!activeMatch) return;
  const key = activeMatchKey,
    target = $('#match-ratings');
  if (ratingsKey === key && target.dataset.loaded === 'true') return;
  ratingsKey = key;
  target.innerHTML =
    '<div class="panel empty-message">Consultando notas…</div>';
  try {
    const d = await api(
      'ratings?league=' +
        encodeURIComponent(activeMatch.game.leagueId) +
        '&id=' +
        activeMatch.game.id,
    );
    if (activeMatchKey !== key) return;
    target.dataset.loaded = 'true';
    target.innerHTML = `<section class="panel sofa-ratings"><div class="section-head"><h2>Notas do Sofascore</h2><span class="outline-label">WIDGET GRATUITO</span></div><div id="sofa-widget"><p class="empty-message">Buscando escalação e notas do Sofascore…</p></div><details class="poll-builder"><summary>Vincular escalação e notas desta partida</summary><p class="data-note">Cole o endereço da partida no Sofascore ou o iframe oficial de escalações. Confira os dois times e a data: o widget ficará disponível para todo o grupo.</p><form id="sofa-widget-form"><label>Link da partida ou código do widget<textarea class="text-input" id="sofa-widget-url" rows="3" maxlength="2500" required placeholder="https://widgets.sofascore.com/embed/lineups?id=…"></textarea></label><button class="button subtle">Vincular para o grupo</button><p class="extra-feedback" role="status"></p></form></details><p class="data-note">O conteúdo é carregado diretamente do Sofascore. A disponibilidade de notas depende da cobertura do jogo.</p></section><section class="panel ratings-intro"><div class="section-head"><h2>Notas dos jogadores</h2><span class="outline-label">API-FOOTBALL</span></div><p>${esc(d.message)}</p>${d.state === 'restricted' ? '<p class="data-note">Jogos, escalações e lances continuam disponíveis pela ESPN.</p>' : ''}</section><div class="lineups-grid">${d.teams.map((t) => `<section class="panel"><h2>${esc(t.team)}</h2><ol class="ratings-list">${t.players.map((p) => `<li><b class="player-rating ${p.rating >= 7 ? 'rating-good' : ''}">${p.rating.toFixed(1)}</b><div><strong>${esc(p.name)}</strong><small>${p.minutes ?? '—'} min${p.goals ? ' · ⚽ ' + p.goals : ''}${p.assists ? ' · ' + p.assists + ' assist.' : ''}</small></div></li>`).join('') || '<li>Sem notas publicadas.</li>'}</ol></section>`).join('')}</div>`;
    refreshSofaWidget();
  } catch {
    target.innerHTML =
      '<div class="panel empty-message">Não foi possível consultar as notas agora. <button class="button subtle" data-refresh-ratings>Tentar novamente</button></div>';
  }
}

function reloadRatings() {
  ratingsKey = '';
  return loadRatings();
}
export { reloadRatings, loadRatings };
