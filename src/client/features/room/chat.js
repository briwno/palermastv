import { $, esc } from '../../shared/dom.js';
import { communityRequest } from '../group/api.js';
import { groupIdentity, groupPlayerId } from '../group/identity.js';

let busy = false,
  sending = false,
  revision = 0,
  messages = [];

function render(forceScroll = false) {
  const box = $('#room-chat-messages');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const scrollTop = box.scrollTop;
  box.innerHTML = messages.length
    ? messages
        .map((m) => {
          const mine = m.playerId === groupPlayerId;
          return `<article class="chat-message${mine ? ' is-mine' : ''}"><span class="chat-avatar" aria-hidden="true">${esc(m.avatar || '⚽')}</span><div class="chat-bubble"><header><strong>${esc(mine ? 'Você' : m.name)}</strong><time datetime="${esc(new Date(m.createdAt).toISOString())}">${new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</time></header><p>${esc(m.text)}</p></div></article>`;
        })
        .join('')
    : '<div class="chat-empty"><strong>A conversa começa aqui</strong><p>Comente o jogo com a galera.</p></div>';
  box.scrollTop = atBottom || forceScroll ? box.scrollHeight : scrollTop;
}

function receive(message, mine = false) {
  if (!message?.id || messages.some((m) => m.id === message.id)) return;
  revision++;
  messages = [...messages, message].slice(-100);
  render(mine);
}

async function loadChat() {
  if (busy || document.hidden || $('#page-sala').hidden) return;
  busy = true;
  const current = revision;
  try {
    const data = await communityRequest('chat');
    if (current !== revision) return;
    if (!Array.isArray(data.messages))
      throw Error('O chat retornou uma resposta inválida.');
    if (
      JSON.stringify(messages) !== JSON.stringify(data.messages) ||
      !$('#room-chat-messages').children.length
    ) {
      messages = data.messages.slice(-100);
      render();
    }
    if (!sending) $('#chat-status').textContent = '';
  } catch (error) {
    if (current === revision) $('#chat-status').textContent = error.message;
  } finally {
    busy = false;
  }
}

export function initChat() {
  const form = $('#room-chat-form'),
    input = $('#chat-text'),
    button = form.querySelector('button');
  const update = () => {
    button.disabled = sending || !input.value.trim();
    $('#chat-character-count').textContent = input.value.length + ' / 500';
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!button.disabled) form.requestSubmit();
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (sending || !text) return;
    sending = true;
    revision++;
    update();
    button.textContent = 'Enviando…';
    $('#chat-status').textContent = '';
    try {
      const data = await communityRequest('chat', { text });
      if (input.value.trim() === text) input.value = '';
      if (data.message) receive(data.message, true);
      else await loadChat();
      $('#chat-status').textContent = 'Mensagem enviada.';
      input.focus();
    } catch (error) {
      $('#chat-status').textContent = error.message;
    } finally {
      sending = false;
      button.textContent = 'Enviar ↑';
      update();
    }
  });
  window.addEventListener('palermas:chat-message', (event) =>
    receive(event.detail.message),
  );
  window.addEventListener('palermas:navigate', (event) => {
    if (event.detail.page === 'sala') loadChat();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadChat();
  });
  groupIdentity.then(() => {
    if (messages.length) render();
  });
  update();
  setInterval(loadChat, 5000);
  if (location.hash === '#sala') loadChat();
}
