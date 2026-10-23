import { timezone, dateText } from '../../shared/dates.js';
import { esc, $, all } from '../../shared/dom.js';
import { sourceNote, api } from '../../shared/football-api.js';
import { clubGames } from '../football/game-store.js';
let hubData = null;

let newsFilter = 'todos';

let hubLoading = false;

function newsDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function newsCard(n) {
  return `<article class="news-card ${esc(n.club)}"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer"><div class="news-image">${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<img class="news-fallback" src="https://a.espncdn.com/i/teamlogos/soccer/500/${n.club === 'cap' ? '3458' : '3456'}.png" alt="">`}<span class="news-club">${esc(n.clubName)}</span>${n.type === 'Vídeo' ? '<span class="news-video">▶ Vídeo</span>' : ''}</div><div class="news-copy"><div class="news-meta">ESPN <span>·</span> ${esc(newsDate(n.date))}</div><h3>${esc(n.title)}</h3><span class="news-read">${n.type === 'Vídeo' ? 'Assistir na ESPN' : 'Ler na ESPN'} <b>↗</b></span></div></a></article>`;
}

function renderHub() {
  if (!hubData) return;
  const articles = [
    ...new Map(
      hubData.clubs
        .flatMap((c) => c.articles)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((n) => [n.id, n]),
    ).values(),
  ];
  const home = [];
  for (const club of hubData.clubs)
    if (club.articles[0]) home.push(club.articles[0]);
  for (const n of articles)
    if (home.length < 4 && !home.some((h) => h.id === n.id)) home.push(n);
  $('#home-news').innerHTML = home.length
    ? home.map(newsCard).join('')
    : '<div class="empty-message">Notícias indisponíveis agora. Tente atualizar em CAP & CFC.</div>';
  const filtered = articles.filter(
    (n) => newsFilter === 'todos' || n.club === newsFilter,
  );
  $('#club-news').innerHTML = filtered.length
    ? filtered.map(newsCard).join('')
    : '<div class="empty-message">Nenhuma notícia disponível neste filtro.</div>';
  $('#news-data').textContent =
    sourceNote(hubData) +
    (hubData.clubs.some((c) => c.newsUnavailable)
      ? ' · Parte das notícias está indisponível'
      : '');
  $('#club-profiles').innerHTML = hubData.clubs
    .filter((c) => newsFilter === 'todos' || c.key === newsFilter)
    .map(
      (c) =>
        `<article class="club-profile ${esc(c.key)}"><header><img src="${esc(c.logo)}" alt="Escudo do ${esc(c.short)}"><div><span class="eyebrow">${esc(c.nickname)} · ${esc(c.city)}</span><h2>${esc(c.name)}</h2><a href="${esc(c.official)}" target="_blank" rel="noopener noreferrer">Site oficial ↗</a></div></header><div class="profile-stats"><div><b>${c.stats.rank ?? '—'}º</b><span>na Série A</span></div><div><b>${c.stats.points ?? '—'}</b><span>pontos</span></div><div><b>${c.stats.played ?? '—'}</b><span>jogos</span></div><div><b>${c.stats.wins ?? '—'}</b><span>vitórias</span></div></div><p class="profile-source">Campanha informada pela ESPN · placares provisórios na Classificação</p><div class="profile-facts"><div><span>Fundação</span><strong>${esc(c.founded)}</strong></div><div><span>Estádio</span><strong>${esc(c.stadium)}</strong></div></div><details><summary>Conquistas em destaque</summary><ul>${c.highlights.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details><div class="recent-results"><h3>Últimos resultados</h3>${
          c.lastGames.length
            ? c.lastGames
                .map((g) => {
                  const home = g.home.id === c.id,
                    own = Number(home ? g.homeScore : g.awayScore),
                    opp = Number(home ? g.awayScore : g.homeScore),
                    result = own > opp ? 'win' : own === opp ? 'draw' : 'loss';
                  return `<button class="recent-game" data-detail="${esc(g.id)}"><span class="result-letter ${result}">${own > opp ? 'V' : own === opp ? 'E' : 'D'}</span><span><small>${dateText(g.day)} · ${esc(g.league)}</small>${esc(g.home.name)} <b>${esc(g.homeScore)} × ${esc(g.awayScore)}</b> ${esc(g.away.name)}</span><span>↗</span></button>`;
                })
                .join('')
            : '<p class="data-note">Resultados indisponíveis.</p>'
        }</div></article>`,
    )
    .join('');
  for (const c of hubData.clubs) {
    $('#' + c.key + '-mini-stats').innerHTML =
      c.stats.rank !== null
        ? `<span>${c.stats.rank}º na Série A</span><b>${c.stats.points} pts</b>`
        : '';
    for (const g of c.lastGames) clubGames.set('result-' + g.id, g);
  }
}

async function loadHub() {
  if (hubLoading) return;
  hubLoading = true;
  $('#refresh-hub').disabled = true;
  try {
    hubData = await api('hub');
    renderHub();
  } catch (error) {
    if (!hubData) {
      $('#home-news').innerHTML =
        '<div class="empty-message">Notícias indisponíveis no momento.</div>';
      $('#club-news').innerHTML =
        '<div class="empty-message">Não foi possível carregar as notícias. Tente atualizar.</div>';
    }
    $('#news-data').textContent = error.message;
  } finally {
    hubLoading = false;
    $('#refresh-hub').disabled = false;
  }
}

export function initClubHub() {
  all('#news-filters button').forEach((b) =>
    b.addEventListener('click', () => {
      newsFilter = b.dataset.club;
      all('#news-filters button').forEach((c) =>
        c.classList.toggle('selected', c === b),
      );
      renderHub();
    }),
  );
  $('#refresh-hub').addEventListener('click', loadHub);
  document.addEventListener(
    'error',
    (e) => {
      if (
        e.target instanceof HTMLImageElement &&
        e.target.closest('.news-image')
      ) {
        e.target.hidden = true;
        e.target.parentElement.classList.add('image-unavailable');
      }
    },
    true,
  );
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'clubes' && !hubData) loadHub();
    if (e.detail.page === 'sala' && $('#spoiler-toggle').checked)
      $('#important-popup').hidden = true;
  });
  $('#today-heading').textContent = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  loadHub();
  setInterval(() => {
    if (!document.hidden) loadHub();
  }, 600000);
}
