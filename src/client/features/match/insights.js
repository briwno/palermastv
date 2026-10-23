import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { activeMatch, activeMatchKey } from './match-center.js';
import { formBadges, probabilityBar } from '../../shared/football-visuals.js';
const cache = new Map();
let request = 0;
function shotmap(shots, g) {
  if (!shots.length)
    return '<p class="empty-message">Mapa de chutes ainda não disponível para esta partida.</p>';
  return `<div class="shotmap-legend"><span class="shot-home">● ${esc(g.home.name)}</span><span class="shot-away">● ${esc(g.away.name)}</span><span>◉ Gol · tamanho indica xG</span></div><svg class="shot-pitch" viewBox="0 0 105 68" role="img" aria-label="Mapa de chutes de ${esc(g.home.name)} e ${esc(g.away.name)}"><rect x="0.5" y="0.5" width="104" height="67" rx="1"/><path d="M52.5 0V68M0 13.84H16.5V54.16H0M105 13.84H88.5V54.16H105M0 24.84H5.5V43.16H0M105 24.84H99.5V43.16H105"/><circle cx="52.5" cy="34" r="9.15"/>${shots
    .map((s) => {
      const x = s.home ? s.x : 105 - s.x,
        y = s.home ? s.y : 68 - s.y;
      return `<circle class="shot-dot ${s.home ? 'shot-home' : 'shot-away'} ${s.goal ? 'shot-goal' : ''}" cx="${Math.max(1, Math.min(104, x))}" cy="${Math.max(1, Math.min(67, y))}" r="${1 + Math.sqrt(Math.max(0, Math.min(1, s.xg || 0))) * 2.7}" tabindex="0"><title>${esc(s.player)} · ${s.minute}′ · ${s.goal ? 'Gol' : 'Finalização'}${s.xg !== null ? ' · xG ' + s.xg.toFixed(2) : ''}</title></circle>`;
    })
    .join(
      '',
    )}</svg><p class="data-note">Ataques orientados em sentidos opostos. Passe o mouse ou foque um chute para consultar jogador, minuto e xG.</p>`;
}
function render(d) {
  if (!activeMatch || !$('#match-analysis')) return;
  const g = activeMatch.game;
  if (d.state !== 'available') {
    $('#match-analysis').innerHTML =
      `<div class="analysis-unavailable"><span>Dados complementares</span><p>${esc(d.message || 'Indisponíveis nesta partida.')}</p><button class="text-button" data-refresh-insights>Tentar novamente ↻</button></div>`;
    $('#match-advanced').innerHTML = '';
    $('#match-advanced-prime').replaceChildren();
    $('#match-lineup-supplement')?.replaceChildren();
    return;
  }
  const supplement = $('#match-lineup-supplement');
  if (supplement)
    supplement.innerHTML = (d.lineups || [])
      .map((team, index) => {
        if (activeMatch.lineups?.[index]?.available || !team.players.length)
          return '';
        const rows = (starter) =>
          team.players
            .filter((p) => p.starter === starter)
            .map(
              (p) =>
                `<li><b>${esc(p.jersey || '—')}</b><span>${esc(p.name)}${p.captain ? ' · Capitão' : ''}</span>${p.rating !== null ? `<strong>${p.rating.toFixed(1)}</strong>` : ''}</li>`,
            )
            .join('');
        return `<section class="panel lineup-card"><header><h2>${esc(team.team)}</h2><span>${esc(team.formation || '')}</span></header><p class="data-note">Escalação complementar · FotMob${team.confirmed ? ' · Confirmada' : ' · Confirmação não informada'}</p>${team.coach ? `<p>Técnico: ${esc(team.coach)}</p>` : ''}<h3>Titulares</h3><ul class="lineup-list">${rows(true)}</ul><h3>Reservas</h3><ul class="lineup-list">${rows(false) || '<li>Não informados</li>'}</ul></section>`;
      })
      .join('');
  const p = d.probabilities;
  $('#match-analysis').innerHTML =
    `<div class="match-analysis-grid"><section class="panel probability-card"><div class="section-head"><div><span class="eyebrow">LEITURA PRÉ-JOGO</span><h2>Probabilidades</h2></div><span class="status-pill">Estimativa do site</span></div>${probabilityBar(p, g.home.name, g.away.name)}${p ? `<div class="likely-scores">${p.scores.map((s) => `<span><b>${s.home} × ${s.away}</b>${s.probability}%</span>`).join('')}</div><details><summary>Como calculamos?</summary><p class="data-note">${esc(p.method)} Amostra: ${p.sampleHome} jogos do mandante e ${p.sampleAway} do visitante. Estimativa estatística; não é probabilidade oficial ou ao vivo.</p></details>` : ''}</section><section class="panel pregame-form"><span class="eyebrow">COMO CHEGARAM</span><h2>Momento dos times</h2><div><strong>${esc(g.home.name)}</strong>${formBadges(d.form[0] || [])}</div><div><strong>${esc(g.away.name)}</strong>${formBadges(d.form[1] || [])}</div><p class="data-note">Jogos anteriores a esta partida · mais recente à esquerda · FotMob</p></section></div>`;
  $('#match-advanced').innerHTML =
    `<div class="advanced-grid"><section class="panel"><div class="section-head"><h2>Além do placar</h2><span class="status-pill">FotMob</span></div>${d.statistics.length ? d.statistics.map((s) => `<div class="room-stat"><b>${esc(s.home ?? '—')}</b><span>${esc(s.label)}</span><b>${esc(s.away ?? '—')}</b></div>`).join('') : '<p class="empty-message">Estatísticas avançadas ainda não publicadas.</p>'}<p class="data-note">xG mede a qualidade das chances criadas.</p></section><section class="panel"><h2>Mapa de chutes</h2>${shotmap(d.shots, g)}</section></div><div class="advanced-grid"><section class="panel"><h2>Notas dos jogadores</h2>${d.ratings
      .map(
        (t) =>
          `<h3>${esc(t.team || '')}</h3><ol class="compact-ratings">${
            t.players
              .slice(0, 5)
              .map(
                (p) =>
                  `<li><span>${esc(p.name)}</span><b class="rating-chip ${p.rating >= 7 ? 'rating-high' : ''}">${p.rating.toFixed(1)}</b></li>`,
              )
              .join('') || '<li>Notas ainda não publicadas.</li>'
          }</ol>`,
      )
      .join(
        '',
      )}<p class="data-note">Notas do FotMob · melhores avaliações de cada equipe.</p></section><section class="panel"><h2>Confrontos anteriores</h2>${d.h2h.length ? d.h2h.map((m) => `<div class="h2h-row"><small>${new Date(m.date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small><span>${esc(m.home)}</span><b>${esc(m.score)}</b><span>${esc(m.away)}</span></div>`).join('') : '<p class="empty-message">Nenhum confronto anterior informado.</p>'}</section></div><div class="advanced-grid">${d.absences.map((a, i) => `<section class="panel"><span class="eyebrow">BOLETIM DO ELENCO</span><h2>${esc(i === 0 ? g.home.name : g.away.name)}</h2>${a.players.map((p) => `<div class="absence-row"><span class="absence-dot"></span><strong>${esc(p.name)}</strong><small>${esc(p.reason)}</small></div>`).join('') || `<p class="data-note">${a.available ? 'Nenhuma ausência registrada na fonte. Isso não confirma elenco completo.' : 'Boletim indisponível na fonte.'}</p>`}<p class="data-note">Situação atual do elenco · FotMob${g.state === 'post' ? ' · pode diferir da situação na data deste jogo' : ''}</p></section>`).join('')}</div><p class="data-note">Fonte complementar: FotMob · <button class="text-button" data-refresh-insights>Atualizar análise ↻</button></p>`;
  $('#match-advanced-prime').replaceChildren(
    $('#match-advanced').firstElementChild,
  );
}
async function load(force = false) {
  if (!activeMatch) return;
  const key = activeMatchKey,
    current = ++request,
    old = cache.get(key);
  if (!force && old && Date.now() - old.time < 120000) {
    render(old.data);
    return;
  }
  $('#match-analysis').innerHTML =
    '<div class="panel analytics-skeleton" role="status">Consultando forma e probabilidades…</div>';
  try {
    const d = await api(
      'insights?league=' +
        encodeURIComponent(activeMatch.game.leagueId) +
        '&id=' +
        activeMatch.game.id,
    );
    if (current !== request || key !== activeMatchKey) return;
    cache.set(key, { time: Date.now(), data: d });
    render(d);
  } catch {
    if (current === request && key === activeMatchKey)
      render({
        state: 'unavailable',
        message: 'Não foi possível consultar a análise agora.',
      });
  }
}
export function initMatchInsights() {
  window.addEventListener('football:match', () => load());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-refresh-insights]')) load(true);
  });
}
