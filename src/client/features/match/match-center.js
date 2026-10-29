import { all, esc, $ } from '../../shared/dom.js';
import { timeText, dateText } from '../../shared/dates.js';
import { crest } from '../football/presentation.js';
import { sourceNote, api } from '../../shared/football-api.js';
import { clubGames } from '../football/game-store.js';
import { navigate } from '../../shell/navigation.js';
import { findGame } from '../football/game-store.js';
import { setRoomGame, updateScore } from '../room/preferences.js';
import { tacticalLines as pitchLayout } from './formation.js';

let activeMatch = null;

let activeMatchKey = '';

let matchGeneration = 0;

let matchLoading = false;

const matchIcons = {
  goal: '⚽',
  'own-goal': '⚽',
  'penalty-goal': '⚽',
  penalty: '◎',
  'yellow-card': '🟨',
  'red-card': '🟥',
  substitution: '⇄',
  var: 'VAR',
  kickoff: '◷',
  halftime: '◷',
  end: '◷',
  other: '·',
};

function matchTab(name) {
  all('[data-match-tab]').forEach((b) => {
    const active = b.dataset.matchTab === name;
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  all('.match-tab-panel').forEach((p) => (p.hidden = p.id !== 'match-' + name));
  if (name === 'picks') window.dispatchEvent(new Event('football:showpicks'));
  window.dispatchEvent(
    new CustomEvent('football:matchtab', { detail: { name } }),
  );
}

function matchScoreboard(g) {
  const score =
    g.state === 'pre'
      ? timeText(g)
      : g.homeScore !== null && g.awayScore !== null
        ? esc(g.homeScore) + ' <span>–</span> ' + esc(g.awayScore)
        : '—';
  return `<div class="match-team home">${crest(g.home)}<h1>${esc(g.home.name)}</h1><small>Mandante</small></div><div class="match-score"><span class="match-state ${g.state === 'in' ? 'live' : ''}">${g.state === 'in' ? '<span class="live-dot"></span> ' : ''}${esc(g.state === 'in' ? (g.status === 'Intervalo' ? 'Intervalo' : g.clock || 'Ao vivo') : g.state === 'post' ? 'Encerrado' : 'Agendado')}</span><strong>${score}</strong><small>${dateText(g.day)} · ${g.timeValid ? timeText(g) + ' · Brasília' : 'Horário a definir'}</small></div><div class="match-team away">${crest(g.away)}<h1>${esc(g.away.name)}</h1><small>Visitante</small></div>`;
}

function statRows(stats, limit) {
  return stats
    .slice(0, limit || stats.length)
    .map((s) => {
      const h = Number(s.home?.replace('%', '')),
        a = Number(s.away?.replace('%', '')),
        valid =
          s.home !== null &&
          s.away !== null &&
          Number.isFinite(h) &&
          Number.isFinite(a),
        ratio = valid && h + a > 0 ? (h / (h + a)) * 100 : 50;
      return `<div class="match-stat"><div><b>${esc(s.home ?? '—')}${s.home !== null ? s.unit : ''}</b><span>${esc(s.label)}</span><b>${esc(s.away ?? '—')}${s.away !== null ? s.unit : ''}</b></div>${valid ? `<div class="stat-track" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, ratio))}%"></span></div>` : ''}</div>`;
    })
    .join('');
}

function timeline(events, limit) {
  return events
    .slice(0, limit || events.length)
    .map(
      (e) =>
        `<li class="match-event ${e.teamId === activeMatch.game.away.id ? 'away-event' : ''}"><time>${esc(e.clock || '—')}</time><span class="event-icon" aria-hidden="true">${matchIcons[e.type] || '·'}</span><div><strong>${esc(e.label)}${e.shootout ? ' · Disputa de pênaltis' : ''}</strong><p>${esc(e.participants.join(e.type === 'substitution' ? ' / ' : ' · ') || e.teamName)}</p>${e.participants.length && e.teamName ? `<small>${esc(e.teamName)}</small>` : ''}</div></li>`,
    )
    .join('');
}

function playerRow(p) {
  const badges = [
    p.goals ? `<span title="Gols">⚽ ${p.goals}</span>` : '',
    p.yellowCards
      ? `<span title="Cartões amarelos">🟨 ${p.yellowCards}</span>`
      : '',
    p.redCards ? `<span title="Cartões vermelhos">🟥 ${p.redCards}</span>` : '',
    p.subbedIn ? '<span title="Entrou em campo" class="sub-in">↑</span>' : '',
    p.subbedOut ? '<span title="Foi substituído" class="sub-out">↓</span>' : '',
  ].join('');
  return `<li><span class="player-number">${esc(p.jersey || '—')}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.position)}</small></div><span class="player-badges">${badges}</span></li>`;
}

function renderMatch() {
  const d = activeMatch,
    g = d.game;
  $('#match-league').textContent = g.league;
  $('#match-scoreboard').innerHTML = matchScoreboard(g);
  $('#match-source').textContent =
    sourceNote(d) + (g.state === 'in' ? ' · Atualiza a cada minuto' : '');
  $('#match-watch').disabled = false;
  const goals = d.events.filter((e) =>
    ['goal', 'own-goal', 'penalty-goal'].includes(e.type),
  );
  $('#match-overview').innerHTML =
    `<div class="match-overview-grid"><section class="panel"><div class="section-head"><h2>Informações do jogo</h2></div><dl class="match-facts"><div><dt>Competição</dt><dd>${esc(g.league)}</dd></div><div><dt>Estádio</dt><dd>${esc(g.venue || 'Não informado')}</dd></div>${g.city ? `<div><dt>Cidade</dt><dd>${esc(g.city)}</dd></div>` : ''}<div><dt>Onde assistir</dt><dd>${g.broadcasts.length ? esc(g.broadcasts.join(', ')) : 'Não informado pela fonte'}</dd></div>${g.referee ? `<div><dt>Arbitragem</dt><dd>${esc(g.referee)}</dd></div>` : ''}${g.attendance ? `<div><dt>Público</dt><dd>${g.attendance.toLocaleString('pt-BR')}</dd></div>` : ''}</dl><p class="data-note">Dados da partida: ESPN · complementos: FotMob</p></section><section class="panel"><div class="section-head"><h2>${g.state === 'pre' ? 'Antes da partida' : 'Gols'}</h2></div>${g.state === 'pre' ? '<p class="empty-message">Escalações e estatísticas aparecem quando forem divulgadas pela fonte.</p>' : goals.length ? `<ol class="match-timeline">${timeline(goals)}</ol>` : `<p class="empty-message">${d.eventsAvailable ? 'Nenhum gol informado.' : 'Eventos indisponíveis na fonte.'}</p>`}</section></div>${d.statistics.length ? `<section class="panel overview-stats"><div class="section-head"><h2>Estatísticas principais</h2><button class="text-button" data-match-switch="statistics">Ver todas ↗</button></div>${statRows(d.statistics, 5)}</section>` : ''}`;
  $('#match-lineups').innerHTML = `<div class="lineups-grid">${d.lineups
    .map(
      (l) =>
        `<section class="panel lineup-card"><header>${crest(l.team)}<h2>${esc(l.team.name)}</h2>${l.formation ? `<span>${esc(l.formation)}</span>` : ''}</header>${
          l.available
            ? `${formationPitch(l)}<h3>Titulares <span>${l.players.filter((p) => p.starter).length}</span></h3><ul class="lineup-list">${l.players
                .filter((p) => p.starter)
                .map(playerRow)
                .join(
                  '',
                )}</ul><h3>Banco de reservas</h3><ul class="lineup-list">${
                l.players
                  .filter((p) => !p.starter)
                  .map(playerRow)
                  .join('') || '<li>Reservas não informados.</li>'
              }</ul>`
            : `<div class="empty-message">${g.state === 'pre' ? 'Escalação ainda não divulgada pela fonte.' : 'Escalação indisponível na fonte.'}</div>`
        }</section>`,
    )
    .join(
      '',
    )}</div><p class="data-note">Campo esquemático conforme a formação e as posições divulgadas pela ESPN. ↑ Entrou em campo · ↓ Foi substituído · Os titulares indicam a escalação inicial.</p>`;
  $('#match-statistics').innerHTML =
    `<section class="panel full-match-stats"><div class="stat-team-head"><span>${crest(g.home)}${esc(g.home.name)}</span><span>${crest(g.away)}${esc(g.away.name)}</span></div>${d.statistics.length ? statRows(d.statistics) : `<div class="empty-message">${g.state === 'pre' ? 'As estatísticas ficam disponíveis após o início do jogo.' : 'Estatísticas indisponíveis na fonte.'}</div>`}</section>`;
  $('#match-events').innerHTML =
    `<section class="panel events-panel"><div class="section-head"><h2>Lances da partida</h2><span class="data-note">Mais recentes primeiro</span></div><div class="event-filters"><button class="chip selected" data-event-filter="all">Todos</button><button class="chip" data-event-filter="goals">Gols</button><button class="chip" data-event-filter="cards">Cartões</button><button class="chip" data-event-filter="subs">Substituições</button></div><ol class="match-timeline" id="match-event-list">${d.events.length ? timeline(d.events) : `<li class="empty-message">${g.state === 'pre' ? 'A partida ainda não começou.' : d.eventsAvailable ? 'Nenhum lance informado.' : 'Lances indisponíveis na fonte.'}</li>`}</ol>${d.commentary?.length ? `<details class="commentary" open><summary>Minuto a minuto · ${d.commentary.length} atualizações</summary><ol>${d.commentary.map((c) => `<li><time>${esc(c.clock || '—')}</time><p>${esc(c.text)}</p></li>`).join('')}</ol></details>` : ''}${d.videos?.length ? `<div class="match-clips"><h3>Vídeos na ESPN</h3>${d.videos.map((v) => `<a class="source-link" target="_blank" rel="noopener noreferrer" href="${esc(v.url)}">▶ ${esc(v.title)} ↗</a>`).join('')}</div>` : ''}</section>`;
  $('#match-overview').insertAdjacentHTML(
    'afterbegin',
    '<div id="match-analysis"></div>',
  );
  $('#match-statistics').insertAdjacentHTML(
    'afterbegin',
    '<div id="match-advanced-prime"></div>',
  );
  $('#match-statistics').insertAdjacentHTML(
    'beforeend',
    '<div id="match-advanced"></div>',
  );
  $('#match-lineups').insertAdjacentHTML(
    'beforeend',
    '<div id="match-lineup-supplement"></div>',
  );
  window.dispatchEvent(new CustomEvent('football:match', { detail: d }));
}

async function loadMatch(quiet = false) {
  if (!activeMatchKey) return;
  const key = activeMatchKey,
    generation = ++matchGeneration;
  matchLoading = true;
  $('#match-refresh').disabled = true;
  try {
    const [league, id] = key.split('/');
    const data = await api(
      'match?league=' +
        encodeURIComponent(league) +
        '&id=' +
        encodeURIComponent(id),
    );
    if (generation !== matchGeneration) return;
    activeMatch = data;
    clubGames.set('central-' + id, data.game);
    renderMatch();
  } catch (error) {
    if (generation !== matchGeneration) return;
    if (quiet && activeMatch)
      $('#match-source').textContent =
        'Falha ao atualizar. ' + sourceNote(activeMatch);
    else {
      $('#match-overview').innerHTML =
        `<div class="panel empty-message">${esc(error.message)}<br><button class="button subtle" data-retry-match>Tentar novamente</button></div>`;
      $('#match-source').textContent = 'Consulta indisponível · ESPN';
    }
  } finally {
    if (generation === matchGeneration) {
      matchLoading = false;
      $('#match-refresh').disabled = false;
    }
  }
}

function openMatch(league, id, fallback) {
  const key = league + '/' + id;
  if (activeMatchKey === key) {
    navigate('partida/' + key);
    return;
  }
  activeMatchKey = key;
  activeMatch = null;
  matchGeneration++;
  matchTab('overview');
  $('#match-watch').disabled = !fallback;
  $('#match-league').textContent = fallback?.league || 'CENTRAL DA PARTIDA';
  $('#match-scoreboard').innerHTML = fallback
    ? matchScoreboard(fallback)
    : '<div class="empty-message">Carregando partida…</div>';
  all('#match-overview,#match-lineups,#match-statistics,#match-events').forEach(
    (p) =>
      (p.innerHTML =
        '<div class="panel empty-message">Consultando a partida…</div>'),
  );
  $('#match-picks-content').innerHTML =
    '<div class="panel empty-message">Carregando palpites…</div>';
  $('#match-source').textContent = 'Consultando ESPN…';
  navigate('partida/' + key);
  loadMatch();
}

const initialMatchRoute = location.hash.slice(1).split('/');

function formationPitch(lineup) {
  const lines = pitchLayout?.(lineup);
  if (!lines)
    return '<p class="data-note">Posições em campo não disponíveis. Confira a lista de titulares.</p>';

  const rows = lines.map((players) => {
    return `<div class="pitch-row">${players.map((p) => `<button class="pitch-player" data-player-search="${esc(p.name)}" title="${esc(p.name + ' · ' + p.position)}"><b>${esc(p.jersey || '—')}</b><span>${esc(p.shortName || p.name)}</span>${p.goals ? '<i>⚽</i>' : ''}</button>`).join('')}</div>`;
  });
  return `<div class="formation-pitch" aria-label="${esc(lineup.team.name + ' · ' + lineup.formation)}"><div class="pitch-markings" aria-hidden="true"><i></i></div><div class="pitch-players">${rows.reverse().join('')}</div><span class="pitch-caption">${esc(lineup.formation)}</span></div>`;
}

export function initMatchCenter() {
  window.addEventListener('football:openmatch', (event) => {
    const game = event.detail;
    openMatch(game.leagueId, game.id, game);
  });
  all('[data-match-tab]').forEach((b, i, buttons) => {
    b.addEventListener('click', () => matchTab(b.dataset.matchTab));
    b.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const index =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) %
              buttons.length;
      buttons[index].focus();
      matchTab(buttons[index].dataset.matchTab);
    });
  });
  $('#match-refresh').addEventListener('click', () => loadMatch(!!activeMatch));
  $('#match-watch').addEventListener('click', () => {
    const game = activeMatch?.game || findGame(activeMatchKey.split('/')[1]);
    if (!game) return;
    setRoomGame(game);
    window.dispatchEvent(
      new CustomEvent('palermas:roomselection', { detail: game }),
    );
    $('#selected-game').textContent = game.home.name + ' × ' + game.away.name;
    updateScore();
    navigate('sala');
  });
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-match-switch]');
    if (tab) matchTab(tab.dataset.matchSwitch);
    if (e.target.closest('[data-retry-match]')) loadMatch();
    const filter = e.target.closest('[data-event-filter]');
    if (!filter || !activeMatch) return;
    all('[data-event-filter]').forEach((b) =>
      b.classList.toggle('selected', b === filter),
    );
    const category = filter.dataset.eventFilter;
    const events = activeMatch.events.filter(
      (e) =>
        category === 'all' ||
        (category === 'goals' &&
          ['goal', 'own-goal', 'penalty-goal'].includes(e.type)) ||
        (category === 'cards' &&
          ['yellow-card', 'red-card'].includes(e.type)) ||
        (category === 'subs' && e.type === 'substitution'),
    );
    $('#match-event-list').innerHTML = events.length
      ? timeline(events)
      : '<li class="empty-message">Nenhum lance neste filtro.</li>';
  });
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page !== 'partida') return;
    const parts = e.detail.route?.split('/');
    if (parts?.length === 3 && parts[1] + '/' + parts[2] !== activeMatchKey)
      openMatch(parts[1], parts[2]);
  });
  if (initialMatchRoute[0] === 'partida' && initialMatchRoute.length === 3)
    openMatch(initialMatchRoute[1], initialMatchRoute[2]);
  setInterval(() => {
    if (
      !document.hidden &&
      !$('#page-partida').hidden &&
      !matchLoading &&
      activeMatch?.game.state !== 'post'
    )
      loadMatch(true);
  }, 15000);
}
export { openMatch, activeMatch, activeMatchKey, matchTab };
