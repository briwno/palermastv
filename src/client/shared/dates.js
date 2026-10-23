const timezone = 'America/Sao_Paulo';

const dateKey = (v) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(v));

const timeText = (g) =>
  g.timeValid
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(g.date))
    : 'A definir';

const dateText = (d) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
  }).format(new Date(d + 'T12:00:00Z'));

function relativeDate(offset) {
  const d = new Date(dateKey(new Date()) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return dateKey(d);
}
export { relativeDate, timeText, dateText, timezone };
