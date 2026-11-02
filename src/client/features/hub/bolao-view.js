import { esc } from '../../shared/dom.js';
import { crest } from '../football/presentation.js';
export const canPick = (g) =>
  !g.picksLocked && g.state === 'pre' && Date.parse(g.date) > Date.now();
export const fixtureKey = (g) => g.leagueId + '/' + g.id;
const shortTime = (date) =>
  new Date(date).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
export function fixtureCard(g, own, open) {
  const available = canPick(g),
    live = g.state === 'in',
    favorite = [g.home.id, g.away.id].some((id) =>
      ['3458', '3456'].includes(id),
    );
  const status = available
    ? 'Aberto'
    : live
      ? 'Ao vivo'
      : g.state === 'post'
        ? 'Finalizado'
        : 'Fechado';
  const team = (t) =>
    `<span class="bolao-card-team">${crest(t)}<b>${esc(t.name)}</b></span>`;
  const score =
    g.state === 'pre'
      ? '×'
      : `${esc(g.homeScore ?? '—')}<i>:</i>${esc(g.awayScore ?? '—')}`;
  return `<details class="bolao-game ${favorite ? 'bolao-favorite' : ''}" data-bolao-game="${esc(fixtureKey(g))}" ${open ? 'open' : ''}><summary aria-label="Palpite: ${esc(g.home.name)} × ${esc(g.away.name)}"><span class="bolao-card-top"><small>${esc(g.league)}</small><span class="bolao-status ${available ? 'is-open' : live ? 'is-live' : 'is-closed'}">${status}</span></span><span class="bolao-card-match">${team(g.home)}<span class="bolao-card-score">${score}<small>${esc(g.timeValid === false ? 'A definir' : shortTime(g.date))}</small></span>${team(g.away)}</span><span class="bolao-card-bottom"><span class="bolao-card-action">${own ? `Seu palpite: ${own.home} × ${own.away}` : available ? 'Montar meu placar' : 'Ver os palpites'}</span><span class="bolao-expand" aria-hidden="true">⌄</span></span></summary><div class="bolao-pick-content"></div></details>`;
}
export function pickForm(g, own, draft) {
  const field = (side) => {
    const value = draft?.[side] ?? own?.[side] ?? 0;
    return `<div class="score-pick-team"><label for="bolao-${g.id}-${side}">${esc(g[side].name)}</label><div class="score-stepper"><button type="button" data-score-step="${side}:-1" aria-label="Diminuir gols de ${esc(g[side].name)}" ${value <= 0 ? 'disabled' : ''}>−</button><input id="bolao-${g.id}-${side}" class="text-input score-input" name="${side}" type="number" inputmode="numeric" min="0" max="20" step="1" required value="${value}" aria-label="Gols de ${esc(g[side].name)}"><button type="button" data-score-step="${side}:1" aria-label="Aumentar gols de ${esc(g[side].name)}" ${value >= 20 ? 'disabled' : ''}>+</button></div></div>`;
  };
  return `<form class="bolao-pick-form" data-saved-home="${own?.home ?? ''}" data-saved-away="${own?.away ?? ''}"><div class="pick-form-heading"><strong>Seu placar</strong><span class="pick-draft-state">${draft ? 'Alterações não salvas' : own ? 'Palpite salvo' : 'Escolha e confirme'}</span></div><div class="pick-score-fields">${field('home')}<span class="pick-versus" aria-hidden="true">×</span>${field('away')}</div><div class="pick-presets"><span>Placar rápido</span>${['0,0', '1,0', '1,1', '2,1'].map((p) => `<button type="button" data-bolao-preset="${p}">${p.replace(',', ' × ')}</button>`).join('')}</div><button class="button lime pick-submit" type="submit" data-save-pick>${own ? 'Atualizar' : 'Confirmar'} palpite <span aria-hidden="true">↗</span></button><p role="status" class="pick-feedback"></p></form>`;
}
export function votesView(votes, ownId) {
  return `<section class="bolao-votes"><h3>Palpites da galera <span>${votes.length}</span></h3>${votes.length ? `<div class="vote-grid">${votes.map((v) => `<article class="vote-card ${v.id === ownId ? 'is-yours' : ''}"><span class="vote-avatar">${esc(v.avatar || '⚽')}</span><span class="vote-person"><b>${esc(v.name)}</b><small>${v.id === ownId ? 'Você' : v.points === null ? 'Aguardando apuração' : `${v.points} pontos`}</small></span><strong>${v.home}<i>:</i>${v.away}</strong>${v.id === ownId && v.points !== null ? `<small class="vote-points">${v.points} pts</small>` : ''}</article>`).join('')}</div>` : '<p class="bolao-empty-small">Nenhum palpite registrado para este jogo.</p>'}</section>`;
}
export function rankingView(data, ownId) {
  if (!data.ranking.length)
    return '<div class="bolao-ranking-empty"><span aria-hidden="true">🏆</span><h3>Sem palpites neste ranking</h3><p>Os pontos são apurados após cada jogo.</p></div>';
  const [leader, ...others] = data.ranking;
  return `<article class="bolao-leader ${leader.id === ownId ? 'is-yours' : ''}"><span class="leader-crown" aria-hidden="true">♛</span><span class="leader-avatar">${esc(leader.avatar || '⚽')}</span><span class="leader-label">1º COLOCADO</span><strong>${esc(leader.name)}</strong><span class="leader-points">${leader.points}<small>pontos</small></span><span class="leader-record">${leader.exact} exatos · ${leader.results} resultados</span></article><div class="bolao-ranking-list">${others.map((p, i) => `<article class="ranking-person ${p.id === ownId ? 'is-yours' : ''}"><span class="ranking-position">${i + 2}</span><span class="ranking-avatar">${esc(p.avatar || '⚽')}</span><span class="ranking-person-info"><b>${esc(p.name)}${p.id === ownId ? ' <small>Você</small>' : ''}</b><small>${p.exact} exatos · ${p.results} resultados${p.pending ? ' · ' + p.pending + ' pendentes' : ''}</small></span><strong>${p.points}<small>pts</small></strong></article>`).join('')}</div><p class="ranking-settled">${data.settled} ${data.settled === 1 ? 'partida apurada' : 'partidas apuradas'} · 5 pts exato / 2 pts resultado</p>`;
}
