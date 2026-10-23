import { $, esc, all } from '../../shared/dom.js';
import { activeMatch, activeMatchKey } from '../match/match-center.js';
import { save } from '../../shared/storage.js';
import { toast } from '../../shared/feedback.js';
import { groupToken, groupPlayerId, groupIdentity } from './identity.js';
import { picksView } from './picks-view.js';
const drafts = new Map();
let picksBusy = false;
let picksKey = '';
let reactionSentAt = 0;

const groupMessages = {
  picks_closed: 'Os palpites fecharam porque a partida já começou.',
  invalid_pick: 'Confira o apelido e os placares, de 0 a 20.',
  try_later: 'Aguarde alguns segundos para alterar o palpite.',
  unauthorized: 'Entre novamente no site.',
  group_unavailable: 'O serviço do grupo está indisponível agora.',
  player_limit:
    'O grupo atingiu o limite de identificações. Use o navegador que você já utilizava.',
  game_limit: 'O limite de jogos com palpites foi atingido.',
};

async function groupRequest(path, body) {
  const r = await fetch('/api/group/' + path, {
    credentials: 'same-origin',
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error('Não foi possível consultar o grupo.');
  }
  if (!r.ok)
    throw Error(
      groupMessages[data.error] || 'Não foi possível consultar o grupo.',
    );
  return data;
}

async function loadRoomStatus() {
  try {
    const data = await groupRequest('status');
    $('#home-room-title').textContent = data.publisher
      ? 'Sala ao vivo · ' + data.publisher.name
      : 'Sala dos Palermas';
    $('#home-room-status').textContent = data.publisher
      ? data.viewers +
        ' de 5 espectadores · ' +
        data.members.length +
        ' de 6 pessoas na sala'
      : data.members.length
        ? data.members.length +
          ' ' +
          (data.members.length === 1 ? 'pessoa na sala' : 'pessoas na sala') +
          ' · aguardando transmissão'
        : 'Sala aberta · ninguém transmitindo agora';
    $('#home-room-watch').textContent = data.publisher
      ? 'Assistir agora ↗'
      : 'Abrir sala ↗';
    $('.home-room-banner').classList.toggle('room-is-live', !!data.publisher);
    $('#home-room-people').innerHTML = data.members
      .map(
        (m) =>
          `<span>${esc(m.name)}${m.publishing ? ' · transmitindo' : ''}</span>`,
      )
      .join('');
  } catch {
    $('#home-room-status').textContent =
      'Não foi possível consultar agora. Você ainda pode abrir a sala.';
  }
}

async function loadPicks() {
  if (!activeMatch || picksBusy) return;
  const g = activeMatch.game,
    key = g.leagueId + '/' + g.id;
  picksKey = key;
  picksBusy = true;
  if (
    !document.querySelector('#pick-form') ||
    document.querySelector('#pick-form').dataset.key !== key
  )
    $('#match-picks-content').innerHTML =
      '<div class="panel empty-message">Preparando o bolão da galera…</div>';
  try {
    await groupIdentity;
    const [picks, ranking] = await Promise.allSettled([
      groupRequest(
        'predictions?league=' +
          encodeURIComponent(g.leagueId) +
          '&id=' +
          encodeURIComponent(g.id),
      ),
      groupRequest('ranking'),
    ]);
    if (activeMatchKey !== key) return;
    if (picks.status !== 'fulfilled') throw picks.reason;
    let name = '';
    try {
      name = localStorage.getItem('palermas-nickname') || '';
    } catch {}
    $('#match-picks-content').innerHTML = picksView(
      g,
      picks.value,
      ranking.status === 'fulfilled' ? ranking.value : null,
      groupPlayerId,
      name,
      drafts.get(key),
    );
    const form = $('#pick-form');
    if (form) form.dataset.key = key;
  } catch (error) {
    if (activeMatchKey === key)
      $('#match-picks-content').innerHTML =
        '<div class="panel empty-message">' +
        esc(error.message) +
        '<br><button class="button subtle" data-refresh-picks>Tentar novamente</button></div>';
  } finally {
    picksBusy = false;
    if (activeMatchKey !== key && !$('#match-picks').hidden)
      setTimeout(loadPicks, 0);
  }
}

function setFocusMode(enabled) {
  document.body.classList.toggle('focus-mode', enabled);
  $('#focus-mode').setAttribute('aria-pressed', String(enabled));
  $('#focus-mode').textContent = enabled
    ? '↙ Sair do modo jogo'
    : '◩ Modo jogo';
  if (enabled) window.scrollTo({ top: 0, behavior: 'smooth' });
}

let showReactions = true;

try {
  showReactions = localStorage.getItem('palermas-reactions') !== 'off';
} catch {}

export function initPredictions() {
  function saveDraft() {
    if ($('#pick-home') && picksKey === activeMatchKey)
      drafts.set(picksKey, {
        home: Number($('#pick-home').value),
        away: Number($('#pick-away').value),
        name: $('#pick-name').value,
      });
  }
  document.addEventListener('input', (e) => {
    if (e.target.closest('#pick-form')) saveDraft();
  });
  document.addEventListener('click', (e) => {
    const step = e.target.closest('[data-pick-step]'),
      preset = e.target.closest('[data-pick-preset]');
    if (step) {
      const input = $('#pick-' + step.dataset.side);
      input.value = Math.max(
        0,
        Math.min(20, Number(input.value) + Number(step.dataset.pickStep)),
      );
      saveDraft();
    }
    if (preset) {
      const [h, a] = preset.dataset.pickPreset.split(',');
      $('#pick-home').value = h;
      $('#pick-away').value = a;
      saveDraft();
    }
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'pick-form') return;
    e.preventDefault();
    if (!activeMatch || picksKey !== activeMatchKey) return;
    const key = activeMatchKey,
      name = $('#pick-name').value.trim(),
      button = $('#pick-save');
    button.disabled = true;
    $('#pick-error').textContent = '';
    try {
      await groupRequest('predictions', {
        league: activeMatch.game.leagueId,
        id: activeMatch.game.id,
        token: groupToken,
        name,
        home: Number($('#pick-home').value),
        away: Number($('#pick-away').value),
      });
      drafts.delete(key);
      save('palermas-nickname', name);
      $('#nickname').value = name;
      if (activeMatchKey === key) {
        await loadPicks();
        toast('Palpite salvo para o grupo.');
      }
    } catch (error) {
      if (activeMatchKey === key && $('#pick-error'))
        $('#pick-error').textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-refresh-picks]')) loadPicks();
  });
  window.addEventListener('football:showpicks', loadPicks);
  window.addEventListener('football:match', () => {
    if (!$('#match-picks').hidden && !$('#page-partida').hidden) loadPicks();
  });
  $('#focus-mode').addEventListener('click', () =>
    setFocusMode(!document.body.classList.contains('focus-mode')),
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setFocusMode(false);
  });
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'inicio') loadRoomStatus();
    if (e.detail.page !== 'sala') setFocusMode(false);
  });
  $('#show-reactions').checked = showReactions;
  $('#show-reactions').addEventListener('change', (e) => {
    showReactions = e.target.checked;
    save('palermas-reactions', showReactions ? 'on' : 'off');
    if (!showReactions) $('#reaction-overlay').replaceChildren();
  });
  all('[data-reaction]').forEach((b) =>
    b.addEventListener('click', () => {
      if (Date.now() - reactionSentAt < 1000) return;
      reactionSentAt = Date.now();
      window.dispatchEvent(
        new CustomEvent('palermas:sendreaction', {
          detail: { emoji: b.dataset.reaction },
        }),
      );
    }),
  );
  window.addEventListener('palermas:reaction', (e) => {
    if (
      !showReactions ||
      $('#page-sala').hidden ||
      !['⚽', '🔥', '👏', '😂', '😱', '🤡'].includes(e.detail.emoji)
    )
      return;
    const overlay = $('#reaction-overlay');
    if (overlay.children.length >= 12) overlay.firstElementChild.remove();
    const bubble = document.createElement('span');
    bubble.className = 'reaction-bubble';
    bubble.style.left = 12 + Math.random() * 70 + '%';
    const emoji = document.createElement('b');
    emoji.textContent = e.detail.emoji;
    const name = document.createElement('small');
    name.textContent = e.detail.name;
    bubble.append(emoji, name);
    overlay.append(bubble);
    setTimeout(() => bubble.remove(), 2600);
  });
  loadRoomStatus();
  setInterval(() => {
    if (!document.hidden && !$('#page-inicio').hidden) loadRoomStatus();
  }, 20000);
}
export { groupToken, groupPlayerId, groupIdentity };
