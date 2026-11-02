import { initBolao } from './bolao.js';
import { markFreshness } from '../../shared/freshness.js';
import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { crest } from '../football/presentation.js';
import { navigate } from '../../shell/navigation.js';
let teamRevision = 0,
  market = null,
  marketFilter = 'all';
const date = (value) =>
  Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'Data não informada';
const empty = (message) => `<p class="hub-empty">${esc(message)}</p>`;
const article = (a) =>
  `<article class="hub-news-item"><small>${esc(a.source)} · ${esc(date(a.date))}</small><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a></article>`;
const gameRow = (g) =>
  `<a class="hub-fixture" href="#partida/${esc(g.leagueId)}/${esc(g.id)}"><small>${esc(date(g.date))} · ${esc(g.league)}</small><span>${crest(g.home)}${esc(g.home.name)} <b>${g.state === 'pre' ? '×' : esc(g.homeScore ?? '—') + ' : ' + esc(g.awayScore ?? '—')}</b> ${crest(g.away)}${esc(g.away.name)}</span><small>${g.state === 'in' ? 'AO VIVO' : g.state === 'post' ? 'Encerrado' : 'Ver partida →'}</small></a>`;
async function loadTeam(id) {
  const revision = ++teamRevision,
    box = $('#team-page-content');
  box.innerHTML = empty('Carregando o time…');
  try {
    const d = await api('team?id=' + encodeURIComponent(id));
    if (revision !== teamRevision) return;
    const row = d.standing;
    box.innerHTML = `<header class="team-page-hero">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : ''}<div><span class="eyebrow">${esc(d.league?.name || 'FUTEBOL')}</span><h1>${esc(d.name)}</h1><p>Elenco, jogos e notícias do clube.</p></div></header><div class="team-section-links"><a href="#time/${id}" data-team-section="team-fixtures">Jogos</a><a href="#time/${id}" data-team-section="team-roster">Elenco</a><a href="#time/${id}" data-team-section="team-news">Notícias</a><a href="#mercado">Mercado CAP & CFC ↗</a></div><section class="hub-panel"><h2>Classificação${d.league ? ' · ' + esc(d.league.name) : ''}</h2>${
      row
        ? `<div class="team-stat-strip">${[
            ['Posição', row.rank + 'º'],
            ['Pontos', row.points],
            ['Jogos', row.played],
            ['Vitórias', row.wins],
            ['Empates', row.draws],
            ['Derrotas', row.losses],
            ['Saldo', row.goalDifference],
          ]
            .map(
              ([label, value]) =>
                `<div><b>${esc(value ?? '—')}</b><span>${label}</span></div>`,
            )
            .join('')}</div>`
        : empty('Classificação indisponível para este time.')
    }</section><div class="hub-two-columns" id="team-fixtures"><section class="hub-panel"><h2>Próximos jogos</h2>${d.upcoming.map(gameRow).join('') || empty('Nenhum próximo jogo informado.')}</section><section class="hub-panel"><h2>Últimos resultados</h2>${d.results.map(gameRow).join('') || empty('Resultados indisponíveis.')}</section></div><section id="team-roster" class="hub-panel"><h2>Elenco</h2><div class="team-roster-grid">${d.squad.map((p) => `<article class="team-roster-player">${p.photo ? `<img src="${esc(p.photo)}" alt="Foto de ${esc(p.name)}" loading="lazy" data-roster-photo data-photo-fallback="${esc(p.photoFallback || '')}" data-team-fallback="${esc(d.logo || '')}">` : '<span class="roster-avatar">⚽</span>'}<div><b>${esc(p.name)}</b><small>${esc(p.jersey || '—')} · ${esc(p.position || 'Posição não informada')}</small></div></article>`).join('') || empty('A fonte não disponibilizou o elenco.')}</div></section><section id="team-news" class="hub-panel"><h2>Notícias</h2><div class="hub-two-columns">${d.articles.map(article).join('') || empty('Sem notícias recentes na fonte.')}</div></section><p class="data-note" id="team-page-updated">Dados: ${esc(d.source)} · Consultado em ${date(d.checkedAt)}${!d.scheduleAvailable ? ' · Parte da agenda não pôde ser consultada.' : ''}</p>`;
    markFreshness('#team-page-updated', d, 600);
  } catch (e) {
    if (revision === teamRevision)
      box.innerHTML =
        empty(e.message) +
        '<button class="button subtle" data-retry-team>Tentar novamente</button>';
  }
}
function renderMarket() {
  if (!market) return;
  $('#market-content').innerHTML = market.clubs
    .map((c) => {
      const items = c.items.filter(
        (a) => marketFilter === 'all' || a.category === marketFilter,
      );
      const showAbsences = ['all', 'absences'].includes(marketFilter);
      return `<section class="hub-panel"><h2 class="market-team-heading"><img src="https://a.espncdn.com/i/teamlogos/soccer/500/${esc(c.id)}.png" alt="Escudo de ${esc(c.name)}"><a href="#time/${esc(c.id)}">${esc(c.name)} ↗</a></h2>${items.map((a) => `<div class="market-category category-${a.category}"><span class="market-badge">${{ confirmed: 'Anúncio reportado', rumors: 'Rumor / negociação', absences: 'Desfalque' }[a.category]}</span>${article(a)}</div>`).join('') || empty('Nenhuma notícia desta categoria no feed recente.')} ${showAbsences ? `<h3>Disponibilidade do elenco</h3>${c.absences.available ? c.absences.players.map((p) => `<div class="absence-row">${p.photo ? `<img src="${esc(p.photo)}" alt="Foto de ${esc(p.name)}" loading="lazy" data-team-fallback="https://a.espncdn.com/i/teamlogos/soccer/500/${esc(c.id)}.png">` : `<img src="https://a.espncdn.com/i/teamlogos/soccer/500/${esc(c.id)}.png" alt="Escudo do clube">`}<div><b>${esc(p.name)}</b><span>${esc(p.reason)}${p.return ? ' · Retorno estimado: ' + esc(p.return) : ''}</span></div></div>`).join('') || empty('Nenhum desfalque listado pela fonte. Isso não confirma o elenco completo.') : empty('A fonte não forneceu a lista de desfalques.')}<a class="data-note" href="${esc(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">FotMob · Consultado em ${date(market.checkedAt)} ↗</a>` : ''}</section>`;
    })
    .join('');
}
async function loadMarket() {
  $('#market-content').innerHTML = empty('Consultando notícias e desfalques…');
  try {
    market = await api('market');
    markFreshness('#market-data', market, 600);
    renderMarket();
  } catch (e) {
    markFreshness('#market-data', null, 600);
    $('#market-content').innerHTML = empty(e.message);
  }
}
function prepareCrests(root = document) {
  for (const img of root.querySelectorAll('img[src*="teamlogos/soccer/"]')) {
    const match = img
      .getAttribute('src')
      .match(/teamlogos\/soccer\/(?:\d+|\d+-dark)\/(\d+)\.(?:png|svg)/);
    if (
      !match ||
      img.dataset.clubPage ||
      img.closest('[data-room-pick]') ||
      img.matches('[data-roster-photo], .athlete-fallback-crest')
    )
      continue;
    img.dataset.clubPage = match[1];
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'link');
    img.setAttribute('aria-label', 'Abrir página do time');
    img.title = 'Ver página do time';
  }
}
export function initFootballHub() {
  initBolao();
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'time') loadTeam(e.detail.route.split('/')[1]);
    if (e.detail.page === 'mercado') loadMarket();
  });
  document.addEventListener(
    'click',
    (e) => {
      const crest = e.target.closest('[data-club-page]');
      if (crest) {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigate('time/' + crest.dataset.clubPage);
      }
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-club-page]')) {
        e.preventDefault();
        e.stopPropagation();
        navigate('time/' + e.target.dataset.clubPage);
      }
    },
    true,
  );
  document.addEventListener('click', (e) => {
    const section = e.target.closest('[data-team-section]');
    if (section) {
      e.preventDefault();
      document
        .getElementById(section.dataset.teamSection)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (e.target.closest('[data-retry-team]'))
      loadTeam(location.hash.split('/')[1]);
    const filter = e.target.closest('[data-market-filter]');
    if (filter) {
      marketFilter = filter.dataset.marketFilter;
      document
        .querySelectorAll('[data-market-filter]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === filter)));
      renderMarket();
    }
  });
  $('#market-refresh').addEventListener('click', loadMarket);
  prepareCrests();
  let crestQueued = false;
  new MutationObserver(() => {
    if (crestQueued) return;
    crestQueued = true;
    queueMicrotask(() => {
      crestQueued = false;
      prepareCrests();
    });
  }).observe(document.body, { childList: true, subtree: true });
  for (const box of [$('#team-page-content'), $('#market-content')])
    box.addEventListener(
      'error',
      (e) => {
        const img = e.target;
        if (img.tagName !== 'IMG') return;
        if (img.dataset.photoFallback) {
          const fallback = img.dataset.photoFallback;
          delete img.dataset.photoFallback;
          img.src = fallback;
        } else if (img.dataset.teamFallback) {
          const fallback = img.dataset.teamFallback;
          delete img.dataset.teamFallback;
          img.src = fallback;
          img.classList.add('roster-photo-missing');
          img.alt = 'Foto indisponível · escudo do clube';
        } else img.hidden = true;
      },
      true,
    );
}
