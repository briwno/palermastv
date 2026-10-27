import { navigate } from '../../shell/navigation.js';
import { formBadges } from '../../shared/football-visuals.js';
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
  return `<article class="news-card ${esc(n.club)}"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer"><div class="news-image">${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<img class="news-fallback" src="https://a.espncdn.com/i/teamlogos/soccer/500/${n.club === 'cap' ? '3458' : '3456'}.png" alt="">`}<span class="news-club">${esc(n.clubName)}</span>${n.type === 'Vídeo' ? '<span class="news-video">▶ Vídeo</span>' : ''}</div><div class="news-copy"><div class="news-meta">${esc(n.source || 'ESPN')} <span>·</span> ${esc(newsDate(n.date))}</div><h3>${esc(n.title)}</h3><span class="news-read">${n.type === 'Vídeo' ? 'Assistir' : 'Ler no ' + esc(n.source || 'ESPN')} <b>↗</b></span></div></a></article>`;
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
        `<article class="club-profile ${esc(c.key)}"><header><img src="${esc(c.logo)}" alt="Escudo do ${esc(c.short)}"><div><span class="eyebrow">${esc(c.nickname)} · ${esc(c.city)}</span><h2>${esc(c.name)}</h2><a href="${esc(c.official)}" target="_blank" rel="noopener noreferrer">Site oficial ↗</a></div></header><div class="club-momentum"><span>Últimos jogos</span>${formBadges(
          c.form?.length
            ? c.form
            : c.lastGames.map((g) => {
                const home = g.home.id === c.id;
                const a = Number(home ? g.homeScore : g.awayScore),
                  b = Number(home ? g.awayScore : g.homeScore);
                return {
                  result: a > b ? 'V' : a === b ? 'E' : 'D',
                  own: a,
                  against: b,
                  opponent: home ? g.away.name : g.home.name,
                };
              }),
        )}</div><div class="profile-stats"><div><b>${c.stats.rank ?? '—'}º</b><span>na Série A</span></div><div><b>${c.stats.points ?? '—'}</b><span>pontos</span></div><div><b>${c.stats.played ?? '—'}</b><span>jogos</span></div><div><b>${c.stats.wins ?? '—'}</b><span>vitórias</span></div></div><div class="club-efficiency"><span>Aproveitamento</span><b>${c.stats.played > 0 && c.stats.points !== null ? Math.round((c.stats.points / (c.stats.played * 3)) * 100) + '%' : '—'}</b><i><span style="width:${c.stats.played > 0 ? Math.max(0, Math.min(100, (c.stats.points / (c.stats.played * 3)) * 100)) : 0}%"></span></i></div><p class="profile-source">Campanha: ESPN · Forma: FotMob / resultados ESPN</p>${c.nextGame ? `<section class="club-next-game"><span class="eyebrow">PRÓXIMO COMPROMISSO</span><strong>${esc(c.nextGame.home.name)} × ${esc(c.nextGame.away.name)}</strong><small>${new Date(c.nextGame.date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small><a class="button subtle" href="#partida/${esc(c.nextGame.leagueId)}/${esc(c.nextGame.id)}">Abrir partida no PalermasTV →</a></section>` : ''}<div class="profile-facts"><div><span>Fundação</span><strong>${esc(c.founded)}</strong></div><div><span>Estádio</span><strong>${esc(c.stadium)}</strong></div></div><details><summary>Conquistas em destaque</summary><ul>${c.highlights.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details><div class="recent-results"><h3>Últimos resultados</h3>${
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
        }</div><section class="club-absences"><div class="section-head"><h3>Boletim do elenco</h3><span class="status-pill">${c.absences?.players?.length ?? '—'} registros</span></div>${c.absences?.players?.map((p) => `<div class="absence-row"><span class="absence-dot"></span><strong>${esc(p.name)}</strong><small>${esc(p.reason)}</small></div>`).join('') || `<p class="data-note">${c.absences?.available ? 'Nenhuma ausência registrada no FotMob; isso não confirma elenco completo.' : 'Boletim indisponível no FotMob.'}</p>`}<p class="data-note">Situação atual · FotMob. Consulte a aba Notícias para atualizações de escalação.</p></section></article>`,
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
  const sections = {
    noticias: 'news',
    classico: 'classic',
    historia: 'history',
  };
  function showSection(section) {
    all('[data-hub-section]').forEach((b) => {
      const selected = b.dataset.hubSection === section;
      b.classList.toggle('selected', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
    all('[data-hub-panel]').forEach(
      (panel) => (panel.hidden = panel.dataset.hubPanel !== section),
    );
    $('#news-filters').hidden = !['overview', 'news'].includes(section);
    window.dispatchEvent(
      new CustomEvent('palermas:hubsection', { detail: { section } }),
    );
  }
  all('[data-hub-section]').forEach((b) =>
    b.addEventListener('click', () => {
      const slug = {
        news: 'noticias',
        classic: 'classico',
        history: 'historia',
      }[b.dataset.hubSection];
      navigate('clubes' + (slug ? '/' + slug : ''));
    }),
  );
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'clubes')
      showSection(sections[e.detail.route?.split('/')[1]] || 'overview');
  });
  showSection(sections[location.hash.split('/')[1]] || 'overview');
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
