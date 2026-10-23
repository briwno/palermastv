import { timezone } from './dates.js';
async function api(path) {
  const r = await fetch('/api/football/' + path, {
    credentials: 'same-origin',
  });
  if (r.status === 401) {
    location.reload();
    throw Error('Entre novamente no site.');
  }
  const data = await r.json();
  if (!r.ok) throw Error(data.error || 'Dados indisponíveis');
  return data;
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
