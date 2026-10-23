import { esc, $ } from '../../shared/dom.js';
import { groupPlayerId } from '../group/predictions.js';
function pollBuilder(context) {
  return `<details class="poll-builder"><summary>＋ Criar enquete</summary><div class="poll-presets"><button class="chip" data-poll-preset="result">Resultado</button><button class="chip" data-poll-preset="mvp">Melhor jogador</button><button class="chip" data-poll-preset="var">Lance polêmico</button></div><form data-poll-form data-context="${esc(context)}"><label>Pergunta<input class="text-input" name="question" maxlength="140" minlength="5" required placeholder="Qual é a opinião da galera?"></label><label>Opções · uma por linha<textarea class="text-input" name="options" rows="4" required maxlength="400" placeholder="Opção 1&#10;Opção 2"></textarea></label><div class="poll-player-options"></div><button type="submit" class="button lime">Publicar enquete</button><p class="extra-feedback" role="status"></p></form></details>`;
}

function pollCards(data) {
  return data.polls.length
    ? data.polls
        .map((p) => {
          const votes = Object.entries(p.votes),
            own = p.votes[groupPlayerId],
            total = votes.length;
          return `<article class="poll-card"><div class="poll-meta"><span>${esc(p.name)} · ${p.closed ? 'Encerrada' : 'Votação aberta'}</span>${p.owner === groupPlayerId && !p.closed ? `<button class="text-button" data-close-poll="${p.id}">Encerrar</button>` : ''}</div><h3>${esc(p.question)}</h3><div class="poll-options">${p.options
            .map((o, i) => {
              const count = votes.filter(([, v]) => v.choice === i).length,
                percent = total ? Math.round((count / total) * 100) : 0;
              return `<button class="poll-option ${own?.choice === i ? 'my-vote' : ''}" data-vote-poll="${p.id}" data-choice="${i}" ${p.closed ? 'disabled' : ''} aria-pressed="${own?.choice === i}"><span class="poll-fill" style="width:${percent}%"></span><span>${esc(o)}${own?.choice === i ? ' ✓' : ''}</span><b>${percent}% <small>(${count})</small></b></button>`;
            })
            .join(
              '',
            )}</div><small>${total} ${total === 1 ? 'voto' : 'votos'}${p.closed ? '' : ' · pode alterar seu voto'}</small></article>`;
        })
        .join('')
    : '<p class="empty-message">Ainda sem enquetes. Abra a primeira votação.</p>';
}

function mountPolls(target, context) {
  if (target.dataset.context === context) return;
  target.dataset.context = context;
  target.innerHTML = `<div class="section-head"><h2>Voz dos Palermas</h2><button class="text-button" data-refresh-lounge>Atualizar ↻</button></div><label class="lounge-name">Seu apelido<input class="text-input" data-lounge-name maxlength="24" value="${esc($('#nickname').value)}" placeholder="Como a galera te chama?"></label><div class="lounge-message" role="status"></div><div class="poll-list"><p class="empty-message">Consultando enquetes…</p></div>${pollBuilder(context)}`;
}
export { pollCards, mountPolls };
