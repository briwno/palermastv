import { $, esc, all } from '../../shared/dom.js';
import { activeMatch, activeMatchKey } from '../match/match-center.js';
import { save } from '../../shared/storage.js';
import { toast } from '../../shared/feedback.js';
let groupToken = '';

let groupPlayerId = '';

let picksBusy = false;

let picksKey = '';

let reactionSentAt = 0;

try {
  groupToken =
    localStorage.getItem('palermas-player-token') || crypto.randomUUID();
  localStorage.setItem('palermas-player-token', groupToken);
} catch {
  groupToken = crypto.randomUUID();
}

const groupIdentity = crypto.subtle
  .digest('SHA-256', new TextEncoder().encode(groupToken))
  .then(
    (bytes) =>
      (groupPlayerId = Array.from(new Uint8Array(bytes))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')),
  );

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

function rankRows(data) {
  return data.ranking.length
    ? `<ol class="picks-ranking">${data.ranking.map((r, i) => `<li class="${r.id === groupPlayerId ? 'own-pick' : ''}"><span class="rank-number">${i + 1}</span><div><strong>${esc(r.name)}${r.id === groupPlayerId ? ' (você)' : ''}</strong><small>${r.exact} ${r.exact === 1 ? 'placar exato' : 'placares exatos'} · ${r.played} ${r.played === 1 ? 'jogo apurado' : 'jogos apurados'}${r.pending ? ' · ' + r.pending + ' pendente(s)' : ''}</small></div><b>${r.points}<small> pts</small></b></li>`).join('')}</ol>`
    : '<p class="empty-message">O ranking aparece quando o grupo começar a palpitar.</p>';
}

async function loadPicks() {
  if (!activeMatch || picksBusy) return;
  const g = activeMatch.game,
    key = g.leagueId + '/' + g.id;
  picksKey = key;
  picksBusy = true;
  $('#match-picks-content').innerHTML =
    '<div class="panel empty-message">Consultando os palpites do grupo…</div>';
  try {
    await groupIdentity;
    const [picks, ranking] = await Promise.all([
      groupRequest(
        'predictions?league=' +
          encodeURIComponent(g.leagueId) +
          '&id=' +
          encodeURIComponent(g.id),
      ),
      groupRequest('ranking'),
    ]);
    if (activeMatchKey !== key) return;
    const own = picks.votes.find((v) => v.id === groupPlayerId),
      locked =
        picks.locked || g.state !== 'pre' || Date.parse(g.date) <= Date.now();
    let name = '';
    try {
      name = localStorage.getItem('palermas-nickname') || '';
    } catch {}
    $('#match-picks-content').innerHTML =
      `<div class="picks-grid"><section class="panel"><div class="section-head"><h2>Palpites desta partida</h2><button class="text-button" data-refresh-picks>Atualizar ↻</button></div>${locked ? '<div class="notice">Palpites encerrados para esta partida.</div>' : `<form id="pick-form"><label class="field-label" for="pick-name">Seu apelido</label><input class="text-input" id="pick-name" maxlength="24" required value="${esc(name || own?.name || '')}" placeholder="Seu apelido"><div class="pick-score-inputs"><label>${esc(g.home.name)}<input id="pick-home" type="number" min="0" max="20" step="1" required value="${own?.home ?? ''}"></label><span>×</span><label>${esc(g.away.name)}<input id="pick-away" type="number" min="0" max="20" step="1" required value="${own?.away ?? ''}"></label></div><button class="button lime full" type="submit" id="pick-save">${own ? 'Alterar palpite' : 'Salvar palpite'}</button><p id="pick-error" role="status"></p></form><p class="data-note">Pode alterar até o início do jogo. Sua identificação fica neste navegador; use o mesmo para editar seus palpites.</p>`}<ul class="pick-votes">${picks.votes.length ? picks.votes.map((v) => `<li class="${v.id === groupPlayerId ? 'own-pick' : ''}"><span>${esc(v.name)}${v.id === groupPlayerId ? ' (você)' : ''}</span><strong>${v.home} × ${v.away}</strong>${v.points !== null ? `<small>${v.points} pts</small>` : ''}</li>`).join('') : '<li>Nenhum palpite para esta partida.</li>'}</ul></section><section class="panel"><div class="section-head"><h2>Ranking dos Palermas</h2></div><p class="picks-rules">5 pontos por placar exato · 2 por acertar vitória ou empate · 0 por erro. Vale o placar final, sem a disputa de pênaltis.</p>${rankRows(ranking)}<p class="data-note">Resultados apurados pela ESPN ao abrir ou atualizar os palpites.</p></section></div>`;
  } catch (error) {
    if (activeMatchKey === key)
      $('#match-picks-content').innerHTML =
        `<div class="panel empty-message">${esc(error.message)}<br><button class="button subtle" data-refresh-picks>Tentar novamente</button></div>`;
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
