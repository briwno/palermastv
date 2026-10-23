import { esc } from '../../shared/dom.js';
import { crest } from '../football/presentation.js';
export function picksView(g, picks, ranking, playerId, name, draft) {
  const own = picks.votes.find((v) => v.id === playerId),
    locked =
      picks.locked || g.state !== 'pre' || Date.parse(g.date) <= Date.now();
  const counts = [0, 0, 0];
  for (const vote of picks.votes)
    counts[vote.home > vote.away ? 0 : vote.home === vote.away ? 1 : 2]++;
  const total = picks.votes.length,
    percentages = counts.map((n) =>
      total ? Math.round((n / total) * 100) : 0,
    );
  const scoreInput = (side, team) =>
    `<div class="pick-team">${crest(team)}<strong>${esc(team.name)}</strong><div class="score-stepper"><button type="button" data-pick-step="-1" data-side="${side}" aria-label="Diminuir gols de ${esc(team.name)}">−</button><input id="pick-${side}" aria-label="Gols de ${esc(team.name)}" type="number" min="0" max="20" step="1" required value="${draft?.[side] ?? own?.[side] ?? 0}"><button type="button" data-pick-step="1" data-side="${side}" aria-label="Aumentar gols de ${esc(team.name)}">+</button></div></div>`;
  const form = locked
    ? `<div class="pick-locked"><span>🔒</span><strong>Palpites encerrados</strong><p>${own ? `Seu palpite: ${own.home} × ${own.away}${own.points !== null ? ' · ' + own.points + ' pontos' : ''}` : 'A próxima é sua. Volte antes do início da partida para participar.'}</p></div>`
    : `<form id="pick-form"><div class="pick-scoreboard">${scoreInput('home', g.home)}<span class="pick-versus">×</span>${scoreInput('away', g.away)}</div><div class="pick-presets"><span>Placar rápido</span>${[
        [1, 0],
        [1, 1],
        [2, 1],
        [0, 1],
        [0, 0],
      ]
        .map(
          ([h, a]) =>
            `<button type="button" class="chip" data-pick-preset="${h},${a}">${h} × ${a}</button>`,
        )
        .join(
          '',
        )}</div><label class="field-label" for="pick-name">Seu apelido</label><input class="text-input" id="pick-name" maxlength="24" required value="${esc(draft?.name || name || own?.name || '')}" placeholder="Como a galera te chama?"><button class="button lime full" type="submit" id="pick-save">${own ? 'Atualizar meu palpite' : 'Confirmar meu palpite'} <span>↗</span></button><p id="pick-error" role="status"></p>${own ? `<p class="pick-saved">✓ Salvo: ${own.home} × ${own.away} · pode alterar até o início</p>` : ''}</form>`;
  const rank = ranking?.ranking?.length
    ? `<ol class="picks-ranking">${ranking.ranking.map((r, i) => `<li class="${r.id === playerId ? 'own-pick' : ''}"><span class="rank-number">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span><span class="picks-avatar">${esc(r.avatar || '⚽')}</span><div><strong>${esc(r.name)}${r.id === playerId ? ' · você' : ''}</strong><small>${r.exact} exatos · ${r.played} apurados${r.pending ? ' · ' + r.pending + ' pendentes' : ''}</small></div><b>${r.points}<small> pts</small></b></li>`).join('')}</ol>`
    : `<p class="empty-message">${ranking ? 'O ranking começa com o primeiro palpite da galera.' : 'Ranking temporariamente indisponível. Seus palpites continuam disponíveis.'}</p>`;
  return `<div class="picks-grid"><section class="panel pick-composer"><div class="section-head"><div><span class="eyebrow">SEU PLACAR, SUA CORNETA</span><h2>${own ? 'Você já está no jogo' : 'Qual é o seu palpite?'}</h2></div><span class="status-pill ${locked ? '' : 'status-open'}">${locked ? 'Encerrado' : 'Aberto'}</span></div><p class="data-note">${locked ? 'Acompanhe a apuração e os palpites do grupo.' : 'Escolha o placar. Você pode mudar até o início da partida.'}</p>${form}<div class="pick-rules-cards"><span><b>+5</b>Placar exato</span><span><b>+2</b>Vencedor ou empate</span><span><b>0</b>Errou o resultado</span></div></section><section class="panel"><div class="section-head"><h2>Termômetro da galera</h2><button class="text-button" data-refresh-picks>Atualizar ↻</button></div><p class="data-note">${total} ${total === 1 ? 'pessoa já palpitou' : 'pessoas já palpitaram'} · opinião do grupo</p>${total ? `<div class="probability-values"><span><b>${percentages[0]}%</b>${esc(g.home.name)}</span><span><b>${percentages[1]}%</b>Empate</span><span><b>${percentages[2]}%</b>${esc(g.away.name)}</span></div><div class="probability-bar" aria-hidden="true">${counts.map((n, i) => `<span style="width:${(n / total) * 100}%" title="${percentages[i]}%"></span>`).join('')}</div>` : '<p class="empty-message">Puxe a fila e dê o primeiro palpite.</p>'}<ul class="pick-votes">${picks.votes.map((v) => `<li class="${v.id === playerId ? 'own-pick' : ''}"><span>${esc(v.avatar || '⚽')} ${esc(v.name)}${v.id === playerId ? ' · você' : ''}</span><strong>${v.home} <span>×</span> ${v.away}</strong>${v.points !== null ? `<small class="pick-points">+${v.points} pts</small>` : ''}</li>`).join('')}</ul></section></div><section class="panel picks-season"><div class="section-head"><div><span class="eyebrow">QUEM ENTENDE MAIS?</span><h2>Ranking dos Palermas</h2></div><span class="status-pill">${ranking?.settled ?? 0} jogos apurados</span></div>${rank}<p class="data-note">Apuração pela ESPN. Vale o placar final, sem disputa de pênaltis. A pontuação de placar exato substitui a de resultado.</p></section>`;
}
