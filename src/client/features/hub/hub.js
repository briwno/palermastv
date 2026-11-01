import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { communityRequest } from '../group/api.js';
import { groupIdentity, groupPlayerId } from '../group/identity.js';
import { crest } from '../football/presentation.js';
import { navigate } from '../../shell/navigation.js';
let teamRevision = 0,
  market = null,
  marketFilter = 'all',
  games = [],
  gamesRevision = 0,
  rankingRevision = 0;
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
    }</section><div class="hub-two-columns" id="team-fixtures"><section class="hub-panel"><h2>Próximos jogos</h2>${d.upcoming.map(gameRow).join('') || empty('Nenhum próximo jogo informado.')}</section><section class="hub-panel"><h2>Últimos resultados</h2>${d.results.map(gameRow).join('') || empty('Resultados indisponíveis.')}</section></div><section id="team-roster" class="hub-panel"><h2>Elenco</h2><div class="team-roster-grid">${d.squad.map((p) => `<article class="team-roster-player">${p.photo ? `<img src="${esc(p.photo)}" alt="Foto de ${esc(p.name)}" loading="lazy" data-roster-photo data-photo-fallback="${esc(p.photoFallback || '')}" data-team-fallback="${esc(d.logo || '')}">` : '<span class="roster-avatar">⚽</span>'}<div><b>${esc(p.name)}</b><small>${esc(p.jersey || '—')} · ${esc(p.position || 'Posição não informada')}</small></div></article>`).join('') || empty('A fonte não disponibilizou o elenco.')}</div></section><section id="team-news" class="hub-panel"><h2>Notícias</h2><div class="hub-two-columns">${d.articles.map(article).join('') || empty('Sem notícias recentes na fonte.')}</div></section><p class="data-note">Dados: ${esc(d.source)} · Consultado em ${date(d.checkedAt)}${!d.scheduleAvailable ? ' · Parte da agenda não pôde ser consultada.' : ''}</p>`;
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
    renderMarket();
  } catch (e) {
    $('#market-content').innerHTML = empty(e.message);
  }
}
async function loadGames() {
  const revision = ++gamesRevision;
  $('#bolao-games').innerHTML = empty('Consultando os jogos…');
  try {
    const d = await api(
      'games?date=' + encodeURIComponent($('#bolao-date').value),
    );
    if (revision !== gamesRevision) return;
    games = d.games || [];
    $('#bolao-games').innerHTML =
      games
        .map(
          (g) =>
            `<details class="bolao-game" data-bolao-game="${esc(g.leagueId + '/' + g.id)}"><summary aria-label="Palpite: ${esc(g.home.name)} × ${esc(g.away.name)}"><small>${esc(g.league)} · ${date(g.date)}</small><b class="bolao-match-teams">${crest(g.home)}${esc(g.home.name)} <span>×</span> ${crest(g.away)}${esc(g.away.name)}</b><span>${g.state === 'pre' && Date.parse(g.date) > Date.now() ? 'Dar palpite' : 'Palpites encerrados'}</span></summary><div class="bolao-pick-content"></div></details>`,
        )
        .join('') || empty('Sem jogos informados para esta data.');
  } catch (e) {
    if (revision === gamesRevision)
      $('#bolao-games').innerHTML = empty(e.message);
  }
}
async function loadPick(details) {
  if (details.dataset.loading) return;
  details.dataset.loading = 'true';
  const [league, id] = details.dataset.bolaoGame.split('/'),
    box = details.querySelector('.bolao-pick-content');
  box.innerHTML = empty('Carregando palpites…');
  try {
    await groupIdentity;
    const d = await communityRequest(
      `predictions?league=${encodeURIComponent(league)}&id=${id}`,
    );
    const own = d.votes.find((v) => v.id === groupPlayerId),
      g = games.find((g) => g.id === id && g.leagueId === league);
    if (!g || !box.isConnected) return;
    box.innerHTML = `${!d.locked ? `<form class="bolao-pick-form"><div class="pick-score-fields"><label>${esc(g.home.name)}<input class="text-input" name="home" type="number" min="0" max="20" required value="${own?.home ?? 0}"></label><span>×</span><label>${esc(g.away.name)}<input class="text-input" name="away" type="number" min="0" max="20" required value="${own?.away ?? 0}"></label></div><button class="button lime">${own ? 'Alterar' : 'Salvar'} palpite</button><p role="status"></p></form>` : empty('Este jogo já começou. Novos palpites estão bloqueados.')}<div class="bolao-votes">${d.votes.map((v) => `<p>${esc(v.name)} <b>${v.home} × ${v.away}</b> ${v.points === null ? '· Aguardando resultado' : '· ' + v.points + ' pontos'}</p>`).join('') || empty('Nenhum palpite registrado.')}</div>`;
  } catch (e) {
    box.innerHTML =
      empty(e.message) +
      '<button class="button subtle" data-retry-pick>Tentar novamente</button>';
  } finally {
    delete details.dataset.loading;
  }
}
async function loadRanking() {
  const revision = ++rankingRevision;
  const params = new URLSearchParams({
    season: $('#ranking-season').value,
    league: $('#ranking-league').value,
    round: $('#ranking-round').value,
  });
  try {
    const d = await communityRequest('ranking?' + params);
    if (revision !== rankingRevision) return;
    for (const [id, values, label] of [
      ['#ranking-season', d.seasons || [], ''],
      ['#ranking-round', d.rounds || [], 'Rodada '],
    ]) {
      const select = $(id),
        value = select.value;
      select.innerHTML =
        '<option value="">Todas</option>' +
        values
          .map((v) => `<option value="${esc(v)}">${label}${esc(v)}</option>`)
          .join('');
      select.value = values.includes(value) ? value : '';
    }
    $('#ranking-round').disabled = !$('#ranking-league').value;
    $('#bolao-ranking').innerHTML =
      `<p class="data-note">${d.settled} jogo(s) apurado(s)</p>${d.ranking.map((p, i) => `<div class="ranking-person"><span>${i + 1}</span><div><b>${esc(p.avatar || '⚽')} ${esc(p.name)}</b><small>${p.exact} exatos · ${p.results} resultados · ${p.pending} pendentes</small></div><strong>${p.points}<small>pontos</small></strong></div>`).join('') || empty('O ranking aparece quando o grupo registrar palpites.')}`;
  } catch (e) {
    if (revision === rankingRevision)
      $('#bolao-ranking').innerHTML = empty(e.message);
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
  $('#bolao-date').value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'time') loadTeam(e.detail.route.split('/')[1]);
    if (e.detail.page === 'mercado') loadMarket();
    if (e.detail.page === 'bolao') {
      loadGames();
      loadRanking();
    }
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
    if (e.target.closest('[data-retry-pick]'))
      loadPick(e.target.closest('[data-bolao-game]'));
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
  $('#bolao-date').addEventListener('change', loadGames);
  $('#bolao-refresh').addEventListener('click', () => {
    loadGames();
    loadRanking();
  });
  for (const id of ['#ranking-season', '#ranking-league', '#ranking-round'])
    $(id).addEventListener('change', () => {
      if (id !== '#ranking-round') $('#ranking-round').value = '';
      loadRanking();
    });
  $('#bolao-games').addEventListener(
    'toggle',
    (e) => {
      if (
        e.target.matches('[data-bolao-game]') &&
        e.target.open &&
        !e.target.querySelector('.bolao-pick-content').children.length
      )
        loadPick(e.target);
    },
    true,
  );
  $('#bolao-games').addEventListener('submit', async (e) => {
    if (!e.target.matches('.bolao-pick-form')) return;
    e.preventDefault();
    const form = e.target,
      details = form.closest('[data-bolao-game]'),
      [league, id] = details.dataset.bolaoGame.split('/'),
      button = form.querySelector('button');
    button.disabled = true;
    try {
      await communityRequest('predictions', {
        league,
        id,
        home: Number(form.elements.home.value),
        away: Number(form.elements.away.value),
      });
      await loadPick(details);
      loadRanking();
    } catch (err) {
      form.querySelector('[role=status]').textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
  setInterval(() => {
    if (!document.hidden && !$('#page-bolao').hidden) loadRanking();
  }, 60000);
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
