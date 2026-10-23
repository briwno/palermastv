import { $, esc } from '../../shared/dom.js';
import { communityRequest } from '../group/api.js';
let busy = false,
  latest = '';
async function loadChat() {
  if (busy || document.hidden || $('#page-sala').hidden) return;
  busy = true;
  try {
    const data = await communityRequest('chat');
    const key = data.messages.map((m) => m.id).join(',');
    if (key !== latest || !$('#room-chat-messages').children.length) {
      const box = $('#room-chat-messages'),
        atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      box.innerHTML = data.messages.length
        ? data.messages
            .map(
              (m) =>
                `<article><strong>${esc(m.avatar)} ${esc(m.name)}</strong><time>${new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</time><p>${esc(m.text)}</p></article>`,
            )
            .join('')
        : '<p class="empty-message">Manda a primeira mensagem da galera.</p>';
      if (atBottom || !latest) box.scrollTop = box.scrollHeight;
      latest = key;
    }
    $('#chat-status').textContent = '';
  } catch (e) {
    $('#chat-status').textContent = e.message;
  } finally {
    busy = false;
  }
}
export function initChat() {
  $('#room-chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button'),
      input = $('#chat-text');
    button.disabled = true;
    try {
      await communityRequest('chat', { text: input.value });
      input.value = '';
      await loadChat();
    } catch (error) {
      $('#chat-status').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'sala') loadChat();
  });
  setInterval(loadChat, 5000);
  if (location.hash === '#sala') loadChat();
}
