import { statisticsView } from '../../shared/match-statistics.js';
import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { communityRequest } from '../group/api.js';
import { currentLineup } from './football-live.js';
let match = null,
  seen = null,
  lastUpdate = 0,
  formKey = '',
  mvpBusy = false;
let highlights = new Map();
const key = () => (match ? `${match.game.leagueId}/${match.game.id}` : '');
const at = (value) =>
  new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
const score = (game) => `${game.homeScore ?? '—'} × ${game.awayScore ?? '—'}`;

export function resetMatchday() {
  match = null;
  seen = null;
  lastUpdate = 0;
  formKey = '';
  highlights.clear();
  for (const id of ['#room-break-summary', '#room-pregame'])
    if ($(id)) $(id).hidden = true;
  $('#player-placeholder')?.classList.remove('has-pregame');
  if ($('.room-match-summary')) $('.room-match-summary').hidden = false;
  if ($('#pregame-form')) $('#pregame-form').textContent = '';
}
async function loadMvp() {
  if (
    !match ||
    mvpBusy ||
    document.hidden ||
    $('#page-sala').hidden ||
    $('#room-break-summary').hidden
  )
    return;
  const context = key();
  mvpBusy = true;
  try {
    const data = await communityRequest(
      'pulse?context=' + encodeURIComponent(context),
    );
    if (context !== key()) return;
    renderMvp(data);
    if ($('#room-mvp-feedback').dataset.error) {
      $('#room-mvp-feedback').textContent = '';
      delete $('#room-mvp-feedback').dataset.error;
    }
  } catch (e) {
    if (context === key()) {
      $('#room-mvp-feedback').textContent = e.message;
      $('#room-mvp-feedback').dataset.error = 'true';
    }
  } finally {
    mvpBusy = false;
  }
}
function renderMvp(data) {
  $('#room-mvp-result').innerHTML = data.ranking.length
    ? data.ranking
        .slice(0, 3)
        .map((p) => {
          const lineup = match?.lineups.find((l) =>
            l.players.some((player) => player.id === p.id),
          );
          const player = lineup?.players.find((player) => player.id === p.id);
          const photo = player?.photo || lineup?.team.logo;
          return `<span class="mvp-result-player">${photo ? `<img src="${esc(photo)}" alt="${esc(player?.photo ? 'Foto de ' + p.name : 'Escudo do clube')}" data-player-photo data-photo-fallback="${esc(player?.photoFallback || lineup?.team.logo || '')}">` : ''}<span><b>${esc(p.name)}</b><small>${p.votes} voto(s)</small></span></span>`;
        })
        .join('')
    : 'Ainda sem votos.';
}
export function initMatchday() {
  $('#player-placeholder').insertAdjacentHTML(
    'afterbegin',
    '<div id="room-pregame" hidden><div id="pregame-crests"></div><span class="eyebrow" id="pregame-label"></span><h3 id="pregame-title"></h3><div id="pregame-details"></div><div id="pregame-lineups"></div><div id="pregame-form"></div></div>',
  );
  $('.room-match-summary').insertAdjacentHTML(
    'beforebegin',
    `<section id="room-break-summary" class="matchday-panel" hidden><header class="section-head"><h2 id="break-heading"></h2><div id="break-score" class="break-scoreboard"></div></header><div class="break-grid"><div class="break-left"><div id="break-events"></div><form id="room-mvp-form" class="mvp-vote-card"><label for="room-mvp">Quem foi o melhor até aqui?</label><div class="mvp-controls"><select id="room-mvp" class="text-input" required></select><button class="button lime">Votar</button></div><p id="room-mvp-feedback" role="status"></p></form><p id="room-mvp-result" class="data-note"></p></div><div id="break-stats"></div></div></section>`,
  );
  $('#room-mvp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!match) return;
    const context = key(),
      button = e.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const data = await communityRequest('pulse', {
        context,
        mvp: $('#room-mvp').value,
      });
      if (context === key()) {
        renderMvp(data);
        delete $('#room-mvp-feedback').dataset.error;
        $('#room-mvp-feedback').textContent =
          'Voto salvo. Você pode mudar sua escolha.';
      }
    } catch (err) {
      if (context === key()) $('#room-mvp-feedback').textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
  setInterval(loadMvp, 30000);
  setInterval(() => {
    for (const [id, value] of highlights)
      if (value.until < Date.now()) {
        highlights.delete(id);
        document.querySelectorAll('[data-room-player]').forEach((el) => {
          if (el.dataset.roomPlayer === id)
            el.classList.remove('player-entered', 'player-left');
        });
      }
  }, 1000);
}
export function updateMatchday(data) {
  const changed = key() !== `${data.game.leagueId}/${data.game.id}`;
  if (changed) resetMatchday();
  match = data;
  const now = Date.now(),
    game = data.game,
    events = data.events || [];
  if (
    seen &&
    now - lastUpdate < 45000 &&
    !document.hidden &&
    !$('#page-sala').hidden
  ) {
    for (const event of events.filter(
      (e) => e.type === 'substitution' && !seen.has(e.id),
    )) {
      for (const [index, id] of (event.participantIds || []).entries())
        highlights.set(event.teamId + '/' + id, {
          until: now + 12000,
          className: index === 0 ? 'player-entered' : 'player-left',
        });
    }
  }
  seen = new Set(events.map((e) => e.id));
  lastUpdate = now;
  for (const side of ['home', 'away']) {
    const panel = $('#room-' + side + '-lineup'),
      lineup = data.lineups.find((l) => l.team.id === game[side].id);
    if (!lineup?.players.length) continue;
    const current = currentLineup(lineup, events);
    let count = panel.querySelector('.field-count');
    if (!count) {
      count = document.createElement('small');
      count.className = 'field-count';
      panel.querySelector('.football-team-heading div')?.append(count);
    }
    count.textContent = `${current.players.filter((p) => p.starter && !p.sentOff).length} em campo${lineup.players.some((p) => p.redCards > 0) ? ' · 🟥 Expulsão' : ''}`;
    panel.querySelectorAll('[data-room-player]').forEach((el) => {
      const id = el.dataset.roomPlayer.split('/')[1],
        p = current.players.find((p) => p.id === id),
        h = highlights.get(el.dataset.roomPlayer);
      el.classList.toggle('player-sent-off', Number(p?.redCards) > 0);
      el.classList.toggle(
        'player-entered',
        !!h && h.until > now && h.className === 'player-entered',
      );
      el.classList.toggle(
        'player-left',
        !!h && h.until > now && h.className === 'player-left',
      );
      if (Number(p?.redCards) > 0) el.title = p.name + ' · Expulso';
    });
  }
  $('#room-pregame').hidden = false;
  $('#player-placeholder').classList.add('has-pregame');
  $('#pregame-label').textContent =
    game.state === 'pre' ? 'PRÉ-JOGO' : 'AGUARDANDO TRANSMISSÃO';
  const crests = [game.home, game.away]
    .map((t) =>
      t.logo ? `<img src="${esc(t.logo)}" alt="Escudo de ${esc(t.name)}">` : '',
    )
    .join('<span>×</span>');
  if ($('#pregame-crests').innerHTML !== crests)
    $('#pregame-crests').innerHTML = crests;
  $('#pregame-title').textContent = `${game.home.name} × ${game.away.name}`;
  $('#pregame-details').textContent =
    `${at(game.date)} · ${game.venue || 'Estádio não informado'}${game.state !== 'pre' ? ' · ' + score(game) : ''}`;
  $('#pregame-lineups').textContent = data.lineups
    .map(
      (l) =>
        `${l.team.name}: ${l.players.some((p) => p.starter) ? l.formation || 'escalação disponível nos campos' : 'aguardando escalação'}`,
    )
    .join(' · ');
  if (formKey !== key()) {
    formKey = key();
    const requested = key();
    $('#pregame-form').textContent = 'Consultando retrospecto recente…';
    api(
      `insights?league=${encodeURIComponent(game.leagueId)}&id=${encodeURIComponent(game.id)}`,
    )
      .then((d) => {
        if (key() !== requested) return;
        const form = d.form || [];
        $('#pregame-form').innerHTML = form.length
          ? `<small>Últimos jogos · FotMob</small><div class="pregame-form-teams">${form
              .map(
                (list, i) =>
                  `<span>${esc(game[i ? 'away' : 'home'].name)} ${list
                    .slice(0, 5)
                    .map(
                      (g) =>
                        `<b class="form-chip form-${esc(g.result)}" title="${esc(g.opponent || '')}">${esc({ W: 'V', D: 'E', L: 'D' }[g.result] || g.result)}</b>`,
                    )
                    .join('')}</span>`,
              )
              .join('')}</div>`
          : 'Retrospecto não disponível nesta fonte.';
      })
      .catch(() => {
        if (key() === requested)
          $('#pregame-form').textContent =
            'Retrospecto indisponível no momento.';
      });
  }
  const isBreak = /half.?time|intervalo/i.test(game.status),
    summary = $('#room-break-summary');
  const wasHidden = summary.hidden;
  summary.hidden = !isBreak && game.state !== 'post';
  $('.room-match-summary').hidden = !summary.hidden;
  if (!summary.hidden) {
    $('#break-heading').textContent =
      game.state === 'post' ? 'Apito final' : 'Resumo do intervalo';
    const summaryTeam = (team) =>
      `<span>${team.logo ? `<img src="${esc(team.logo)}" alt="Escudo de ${esc(team.name)}">` : ''}<b>${esc(team.name)}</b></span>`;
    $('#break-score').innerHTML =
      `${summaryTeam(game.home)}<strong>${esc(score(game))}</strong>${summaryTeam(game.away)}`;
    $('#break-events').innerHTML =
      `<h3>Lances decisivos</h3><div class="break-event-list">${
        events
          .filter((e) =>
            [
              'goal',
              'own-goal',
              'penalty-goal',
              'penalty',
              'red-card',
              'yellow-red-card',
            ].includes(e.type),
          )
          .slice(0, 8)
          .map((e) => {
            const team = data.lineups.find((l) => l.team.id === e.teamId),
              player = team?.players.find((p) =>
                e.participantIds?.includes(p.id),
              );
            const icon = e.type.includes('card') ? '🟥' : '⚽';
            return `<button type="button" class="break-event" data-room-event="${esc(e.id)}"><time>${esc(e.clock)}</time><span class="break-event-icon">${icon}</span>${player?.photo ? `<img src="${esc(player.photo)}" alt="Foto de ${esc(player.name)}" data-player-photo data-photo-fallback="${esc(player.photoFallback || '')}">` : team?.team.logo ? `<img src="${esc(team.team.logo)}" alt="Escudo do time">` : ''}<span><b>${esc(e.label)}</b><small>${esc(e.participants.join(' · ') || e.teamName || '')}</small></span><span aria-hidden="true">↗</span></button>`;
          })
          .join('') ||
        '<p class="data-note">Nenhum lance decisivo informado pela fonte.</p>'
      }</div>`;
    $('#break-stats').innerHTML =
      `<h3>O jogo em números</h3>${statisticsView(data.statistics, game.home, game.away, 8)}`;
    $('#room-mvp-form label').textContent =
      game.state === 'post'
        ? 'Quem foi o craque da partida?'
        : 'Quem foi o melhor do primeiro tempo?';
    const select = $('#room-mvp'),
      previous = select.value;
    const html =
      '<option value="">Escolha o craque</option>' +
      data.lineups
        .flatMap((l) =>
          l.players
            .filter((p) => p.starter || p.subbedIn)
            .map(
              (p) =>
                `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(l.team.name)}</option>`,
            ),
        )
        .join('');
    if (select.innerHTML !== html) {
      select.innerHTML = html;
      select.value = previous;
    }
  }
  if (!summary.hidden && (changed || wasHidden)) loadMvp();
}
