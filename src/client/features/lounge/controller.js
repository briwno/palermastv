import { activeMatch, matchTab } from '../match/match-center.js';
import { esc, $ } from '../../shared/dom.js';
import {
  mountSocial,
  socialSearch,
  enableEmbeds,
  renderPosts,
} from './social.js';
import { reloadRatings, loadRatings } from '../match/ratings.js';
import { refreshLounge } from './refresh.js';
import { matchContext } from './context.js';
import { loungeRequest } from './api.js';
import { groupIdentity } from '../group/predictions.js';
import { pollCards, mountPolls } from './polls.js';
import { save } from '../../shared/storage.js';
import { sofaInput } from '../../integrations/sofascore.js';
import { renderSofaWidget } from '../match/lineup-widget.js';
export function initLounge() {
  document.addEventListener('click', async (e) => {
    const preset = e.target.closest('[data-poll-preset]');
    if (preset) {
      const form = preset.closest('.poll-builder').querySelector('form'),
        g = activeMatch?.game;
      form.elements.question.value =
        preset.dataset.pollPreset === 'mvp'
          ? 'Quem foi o melhor em campo?'
          : preset.dataset.pollPreset === 'var'
            ? 'Foi pênalti?'
            : 'Qual vai ser o resultado?';
      form.elements.options.value =
        preset.dataset.pollPreset === 'var'
          ? 'Sim\nNão\nInconclusivo'
          : preset.dataset.pollPreset === 'result' && g
            ? g.home.name + '\nEmpate\n' + g.away.name
            : '';
      form.querySelector('.poll-player-options').innerHTML =
        preset.dataset.pollPreset === 'mvp' && activeMatch
          ? '<small>Escolha de 2 a 6 jogadores para a votação:</small>' +
            activeMatch.lineups
              .flatMap((l) => l.players.filter((p) => p.starter))
              .map(
                (p) =>
                  `<button type="button" class="chip" data-poll-player="${esc(p.name)}">${esc(p.shortName || p.name)}</button>`,
              )
              .join('')
          : '';
      return;
    }
    const player = e.target.closest('[data-poll-player]');
    if (player) {
      const input = player.closest('form').elements.options,
        values = input.value.split('\n').filter(Boolean),
        name = player.dataset.pollPlayer;
      if (values.includes(name)) {
        input.value = values.filter((v) => v !== name).join('\n');
        player.classList.remove('selected');
      } else if (values.length < 6) {
        input.value = [...values, name].join('\n');
        player.classList.add('selected');
      }
      return;
    }
    const search = e.target.closest('[data-player-search]');
    if (search && activeMatch) {
      matchTab('social');
      mountSocial();
      $('#x-search').value = search.dataset.playerSearch;
      $('#x-search-link').href = socialSearch(search.dataset.playerSearch);
      $('#x-search-link').textContent =
        'Ver ' + search.dataset.playerSearch + ' no X ↗';
      return;
    }
    if (e.target.closest('[data-refresh-ratings]')) {
      reloadRatings();
      return;
    }
    if (e.target.closest('#load-x-embeds')) {
      enableEmbeds();
      return;
    }
    if (e.target.closest('[data-refresh-social]')) {
      refreshLounge($('#match-social'), matchContext(), renderPosts);
      return;
    }
    const area = e.target.closest('[data-lounge]');
    if (!area) return;
    const context = area.dataset.context;
    if (e.target.closest('[data-refresh-lounge]'))
      return refreshLounge(area, context);
    const vote = e.target.closest('[data-vote-poll]'),
      close = e.target.closest('[data-close-poll]');
    if (!vote && !close) return;
    const button = vote || close;
    button.disabled = true;
    try {
      const d = await loungeRequest(
        context,
        vote
          ? {
              operation: 'vote',
              pollId: vote.dataset.votePoll,
              choice: Number(vote.dataset.choice),
            }
          : { operation: 'close', pollId: close.dataset.closePoll },
      );
      await groupIdentity;
      area.querySelector('.poll-list').innerHTML = pollCards(d);
      area.querySelector('.lounge-message').textContent = '';
    } catch (error) {
      area.querySelector('.lounge-message').textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (form.id === 'x-search-form') {
      e.preventDefault();
      $('#x-search-link').href = socialSearch($('#x-search').value.trim());
      $('#x-search-link').textContent = 'Abrir esta busca no X ↗';
      $('#x-search-link').focus();
      return;
    }
    if (form.id === 'share-post-form') {
      e.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const d = await loungeRequest(matchContext(), {
          operation: 'post',
          url: $('#post-url').value,
        });
        $('#post-url').value = '';
        form.querySelector('.extra-feedback').textContent =
          'Post compartilhado.';
        renderPosts(d);
      } catch (error) {
        form.querySelector('.extra-feedback').textContent = error.message;
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (!form.matches('[data-poll-form]')) return;
    e.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const d = await loungeRequest(form.dataset.context, {
        operation: 'poll',
        question: form.elements.question.value,
        options: form.elements.options.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      const area = form.closest('[data-lounge]');
      await groupIdentity;
      area.querySelector('.poll-list').innerHTML = pollCards(d);
      form.reset();
      form.querySelector('.poll-player-options').replaceChildren();
      form.querySelector('.extra-feedback').textContent = 'Enquete publicada.';
    } catch (error) {
      form.querySelector('.extra-feedback').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener('football:matchtab', (e) => {
    if (e.detail.name === 'social') mountSocial();
    if (e.detail.name === 'polls' && activeMatch) {
      mountPolls($('#match-polls'), matchContext());
      refreshLounge($('#match-polls'), matchContext());
    }
    if (e.detail.name === 'ratings') loadRatings();
  });
  window.addEventListener('football:match', () => {
    if (!$('#match-social').hidden) mountSocial();
    if (!$('#match-polls').hidden) {
      mountPolls($('#match-polls'), matchContext());
      refreshLounge($('#match-polls'), matchContext());
    }
    if (!$('#match-ratings').hidden) loadRatings();
  });
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'sala') {
      mountPolls($('#room-polls'), 'sala');
      refreshLounge($('#room-polls'), 'sala');
    }
  });
  setInterval(() => {
    if (document.hidden) return;
    if (!$('#page-sala').hidden) refreshLounge($('#room-polls'), 'sala');
    if (!$('#page-partida').hidden && activeMatch) {
      if (!$('#match-polls').hidden)
        refreshLounge($('#match-polls'), matchContext());
      if (!$('#match-social').hidden)
        refreshLounge($('#match-social'), matchContext(), renderPosts);
    }
  }, 30000);
  mountPolls($('#room-polls'), 'sala');
  if (location.hash === '#sala') refreshLounge($('#room-polls'), 'sala');
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-lounge-name]')) return;
    const name = e.target.value;
    $('#nickname').value = name;
    save('palermas-nickname', name);
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'sofa-widget-form') return;
    e.preventDefault();
    const form = e.target,
      button = form.querySelector('button');
    button.disabled = true;
    try {
      const d = await loungeRequest(matchContext(), {
        operation: 'widget',
        url:
          sofaInput($('#sofa-widget-url').value) || $('#sofa-widget-url').value,
      });
      renderSofaWidget(d.widget);
      form.querySelector('.extra-feedback').textContent =
        'Widget vinculado para o grupo.';
    } catch (error) {
      form.querySelector('.extra-feedback').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
