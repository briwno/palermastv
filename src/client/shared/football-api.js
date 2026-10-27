import { requestJSON } from './request.js';
import { timezone } from './dates.js';
async function api(path) {
  return requestJSON('/api/football/' + path, { credentials: 'same-origin' });
}

function sourceNote(data) {
  if (!data || data.error) return 'Consulta indisponível';
  const clock = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(data.checkedAt));
  return `Fonte: ${data.source || 'ESPN'} · Consultado às ${clock} · Horários de Brasília${data.unavailable?.length ? ' · Sem dados: ' + data.unavailable.join(', ') : ''}`;
}
export { sourceNote, api };
