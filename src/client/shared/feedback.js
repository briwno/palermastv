import { $ } from './dom.js';
let toastTimer;
const reported = new Map();

export function showError(message, detail = {}) {
  const key = [message, detail.path, detail.status, detail.code].join('|');
  const now = Date.now();
  if (now - (reported.get(key) || 0) < 60000) return;
  reported.delete(key);
  reported.set(key, now);
  if (reported.size > 100) reported.delete(reported.keys().next().value);
  let stack = $('#site-errors');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'site-errors';
    stack.className = 'site-errors';
    document.body.append(stack);
  }
  const popup = document.createElement('div');
  popup.className = 'site-error-popup';
  popup.setAttribute('role', 'alert');
  const title = document.createElement('strong');
  title.textContent = message;
  const info = document.createElement('small');
  info.textContent = [
    detail.path,
    detail.status ? 'HTTP ' + detail.status : null,
    detail.code,
    detail.requestId ? 'Referência: ' + detail.requestId : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fechar';
  close.setAttribute('aria-label', 'Fechar aviso de erro');
  close.addEventListener('click', () => popup.remove());
  popup.append(title, info, close);
  stack.append(popup);
  while (stack.children.length > 3) stack.firstElementChild.remove();
  setTimeout(() => popup.remove(), 15000);
  window.dispatchEvent(
    new CustomEvent('palermas:site-error', { detail: { message, ...detail } }),
  );
}

export function initErrorReporting() {
  window.addEventListener('error', (event) => {
    if (event.error)
      showError(
        'Ocorreu um erro no site. Atualize a página se o problema continuar.',
        { code: 'javascript_error' },
      );
  });
  window.addEventListener('unhandledrejection', () =>
    showError('Uma operação do site falhou. Tente novamente.', {
      code: 'unhandled_rejection',
    }),
  );
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 4200);
}
export { toast };
