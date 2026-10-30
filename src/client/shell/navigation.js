import { all, $ } from '../shared/dom.js';
function navigate(page) {
  if (page === 'athletiba') page = 'clubes/classico';
  let route = page;
  const parts = page.split('/');
  if (
    parts.length === 2 &&
    parts[0] === 'clubes' &&
    ['noticias', 'classico', 'historia'].includes(parts[1])
  )
    page = 'clubes';
  if (
    parts.length === 3 &&
    parts[0] === 'partida' &&
    /^[a-z0-9_.]+$/.test(parts[1]) &&
    /^\d+$/.test(parts[2])
  )
    page = 'partida';
  if (
    ![
      'inicio',
      'jogos',
      'tabelas',
      'clubes',
      'sala',
      'partida',
      'perfil',
    ].includes(page)
  ) {
    page = 'inicio';
    route = page;
  }
  all('.page').forEach((el) => (el.hidden = el.id !== 'page-' + page));
  document.body.classList.toggle('home-design', page === 'inicio');
  all('.nav').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
    if (el.dataset.page === page) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $('#crumb').textContent = {
    inicio: 'Visão geral',
    jogos: 'Jogos do dia',
    tabelas: 'Classificação',
    clubes: 'CAP & CFC',
    partida: 'Central da partida',
    sala: 'Sala dos Palermas',
    perfil: 'Meu perfil',
  }[page];
  if (location.hash !== '#' + route)
    history.replaceState(null, '', '#' + route);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  window.dispatchEvent(
    new CustomEvent('palermas:navigate', { detail: { page, route } }),
  );
}

export function initNavigation() {
  all('[data-page]').forEach((el) =>
    el.addEventListener('click', () => navigate(el.dataset.page)),
  );
  all('[data-go]').forEach((el) =>
    el.addEventListener('click', () => navigate(el.dataset.go)),
  );
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
}
export { navigate };
