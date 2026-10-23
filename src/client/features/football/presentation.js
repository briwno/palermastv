import { esc } from '../../shared/dom.js';
const clubKey = (id) => (id === '3458' ? 'cap' : id === '3456' ? 'coxa' : null);

const crest = (team) =>
  team.logo
    ? `<img class="team-crest" src="${esc(team.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '';

function gameState(g) {
  if (g.state === 'in') return 'AO VIVO' + (g.clock ? ' · ' + g.clock : '');
  if (g.state === 'post') return 'ENCERRADO';
  return g.status === 'Scheduled' ? 'AGENDADO' : g.status;
}
export { clubKey, gameState, crest };
