import { api } from '../../shared/football-api.js';
import { $, esc, all } from '../../shared/dom.js';
import { clubGames } from '../football/game-store.js';
import { dateText, timeText } from '../../shared/dates.js';
async function loadClubs() {
  try {
    const data = await api('clubs');
    for (const club of data.clubs) {
      const card = $('.club-card.' + club.key),
        match = card.querySelector('.club-match'),
        button = card.querySelector('.club-link'),
        g = club.game;
      if (g) {
        clubGames.set(club.key, g);
        match.innerHTML = `<span class="tiny-label">PRÓXIMO JOGO · ${esc(g.league)}</span><strong>${esc(g.home.name)} <em>×</em> ${esc(g.away.name)}</strong><span>${dateText(g.day)} · ${timeText(g)}${g.venue ? ' / ' + esc(g.venue) : ''}</span>`;
        button.disabled = false;
        button.dataset.detail = g.id;
      } else {
        match.innerHTML = `<span class="tiny-label">PRÓXIMO JOGO</span><strong>${club.error ? 'Calendário indisponível' : 'Nenhum jogo agendado na fonte'}</strong>`;
        button.disabled = true;
      }
    }
  } catch {
    all('.club-match').forEach(
      (el) =>
        (el.innerHTML =
          '<span class="tiny-label">PRÓXIMO JOGO</span><strong>Calendário indisponível</strong>'),
    );
    all('.club-link').forEach((b) => (b.disabled = true));
  }
}
export { loadClubs };
