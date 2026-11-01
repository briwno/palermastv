import { $, esc } from '../../shared/dom.js';
import { api } from '../../shared/football-api.js';
import { communityRequest } from '../group/api.js';
import { currentLineup } from './football-live.js';
let match = null,
  seen = null,
  lastUpdate = 0,
  formKey = '',
  pulseBusy = false;
let highlights = new Map();
const labels = {
  pressao: '🔥 Pressão',
  sofrimento: '😰 Sofrimento',
  ganhou: '😎 Já ganhou',
};
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
  for (const id of ['#room-pulse', '#room-break-summary', '#room-pregame'])
    if ($(id)) $(id).hidden = true;
  $('#player-placeholder')?.classList.remove('has-pregame');
  if ($('.room-match-summary')) $('.room-match-summary').hidden = false;
  if ($('#pregame-form')) $('#pregame-form').textContent = '';
}
async function loadPulse() {
  if (!match || pulseBusy || document.hidden || $('#page-sala').hidden) return;
  const context = key();
  pulseBusy = true;
  try {
    const data = await communityRequest(
      'pulse?context=' + encodeURIComponent(context),
    );
    if (context !== key()) return;
    renderPulse(data);
    $('#pulse-feedback').textContent = '';
  } catch (e) {
    if (context === key()) $('#pulse-feedback').textContent = e.message;
  } finally {
    pulseBusy = false;
  }
}
function renderPulse(data) {
  const total = data.moods.reduce((sum, item) => sum + item.count, 0);
  $('#pulse-bars').innerHTML = data.moods
    .map(
      (item) =>
        `<div class="mood-meter mood-${item.mood}"><span>${labels[item.mood]} <b>${item.count}</b></span><meter min="0" max="${Math.max(1, total)}" value="${item.count}" aria-label="${labels[item.mood]}"></meter></div>`,
    )
    .join('');
  $('#pulse-reactions').textContent =
    data.reactions
      .slice(0, 6)
      .map((r) => `${r.name}: ${labels[r.mood]}`)
      .join(' · ') || 'Como está a torcida?';
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
    `<section id="room-pulse" class="matchday-panel" hidden><div class="section-head"><h2>Termômetro da torcida</h2><small>Último minuto · um voto por pessoa</small></div><div id="pulse-bars" class="pulse-bars"></div><div class="mood-actions">${Object.entries(
      labels,
    )
      .map(
        ([k, v]) =>
          `<button class="button subtle" data-mood="${k}">${v}</button>`,
      )
      .join(
        '',
      )}</div><p id="pulse-reactions" class="data-note"></p><p id="pulse-feedback" role="status"></p></section><section id="room-break-summary" class="matchday-panel" hidden><header class="section-head"><h2 id="break-heading"></h2><strong id="break-score"></strong></header><div class="break-grid"><div id="break-events"></div><div id="break-stats"></div></div><form id="room-mvp-form"><label for="room-mvp">Quem foi o melhor até aqui?</label><div class="mvp-controls"><select id="room-mvp" class="text-input" required></select><button class="button lime">Votar</button></div><p id="room-mvp-feedback" role="status"></p></form><p id="room-mvp-result" class="data-note"></p></section>`,
  );
  document.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-mood]');
    if (!button || !match || button.disabled) return;
    const context = key();
    button.disabled = true;
    try {
      const data = await communityRequest('pulse', {
        context,
        mood: button.dataset.mood,
      });
      if (context === key()) {
        renderPulse(data);
        $('#pulse-feedback').textContent = 'Reação enviada por 60 segundos.';
      }
    } catch (err) {
      if (context === key()) $('#pulse-feedback').textContent = err.message;
    } finally {
      setTimeout(() => {
        button.disabled = false;
      }, 2000);
    }
  });
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
        renderPulse(data);
        $('#room-mvp-feedback').textContent =
          'Voto salvo. Você pode mudar sua escolha.';
      }
    } catch (err) {
      if (context === key()) $('#room-mvp-feedback').textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
  setInterval(loadPulse, 5000);
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
    count.textContent = `${current.players.filter((p) => p.starter).length} em campo${lineup.players.some((p) => p.redCards > 0) ? ' · 🟥 Expulsão' : ''}`;
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
  $('#room-pulse').hidden = false;
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
  summary.hidden = !isBreak && game.state !== 'post';
  $('.room-match-summary').hidden = !summary.hidden;
  if (!summary.hidden) {
    $('#break-heading').textContent =
      game.state === 'post' ? 'Apito final' : 'Resumo do intervalo';
    $('#break-score').textContent =
      `${game.home.name} ${score(game)} ${game.away.name}`;
    $('#break-events').innerHTML = `<h3>Principais lances</h3>${
      events
        .filter((e) =>
          [
            'goal',
            'own-goal',
            'penalty',
            'red-card',
            'yellow-red-card',
          ].includes(e.type),
        )
        .slice(0, 8)
        .map(
          (e) =>
            `<p><b>${esc(e.clock)}</b> ${esc(e.label)} · ${esc(e.participants.join(', '))}</p>`,
        )
        .join('') || '<p>Nenhum lance informado pela fonte.</p>'
    }`;
    $('#break-stats').innerHTML = `<h3>O jogo em números</h3>${
      data.statistics
        .slice(0, 5)
        .map(
          (s) =>
            `<div class="break-stat"><b>${esc(s.home ?? '—')}</b><span>${esc(s.label)}</span><b>${esc(s.away ?? '—')}</b></div>`,
        )
        .join('') || '<p>Estatísticas não disponíveis.</p>'
    }`;
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
  if (changed) loadPulse();
}
