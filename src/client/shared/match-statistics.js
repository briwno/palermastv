import { esc } from './dom.js';
const number = (value) => {
  if (value === null || value === undefined || String(value).trim() === '')
    return null;
  const raw = String(value).replace('%', '').trim();
  return Number(
    /^\d{1,3}(,\d{3})+($|\.)/.test(raw)
      ? raw.replaceAll(',', '')
      : raw.replace(',', '.'),
  );
};
export function statDisplay(value, unit = '') {
  if (value === null || value === undefined || String(value).trim() === '')
    return '—';
  const text = String(value);
  return text + (unit && !text.endsWith(unit) ? unit : '');
}
export function statisticsView(stats, home, away, limit = 8) {
  const team = (t, side) =>
    `<span class="comparison-team ${side}">${t.logo ? `<img src="${esc(t.logo)}" alt="Escudo de ${esc(t.name)}">` : ''}<b>${esc(t.name)}</b></span>`;
  return `<div class="stats-comparison"><div class="comparison-teams">${team(home, 'home')}${team(away, 'away')}</div>${
    stats.length
      ? stats
          .slice(0, limit)
          .map((s) => {
            const h = number(s.home),
              a = number(s.away),
              valid =
                h !== null &&
                a !== null &&
                Number.isFinite(h + a) &&
                h >= 0 &&
                a >= 0;
            const share =
              valid && h + a > 0
                ? Math.max(0, Math.min(100, (h / (h + a)) * 100))
                : 50;
            const lead = !valid || h === a ? 'equal' : h > a ? 'home' : 'away';
            return `<div class="comparison-row lead-${lead}"><div class="comparison-values"><strong class="home">${esc(statDisplay(s.home, s.unit))}</strong><span>${esc(s.label)}</span><strong class="away">${esc(statDisplay(s.away, s.unit))}</strong></div>${valid ? `<div class="comparison-track ${h + a === 0 ? 'empty-track' : ''}" aria-hidden="true"><i class="home" style="width:${share.toFixed(2)}%"></i><i class="away" style="width:${(100 - share).toFixed(2)}%"></i></div>` : '<small class="comparison-missing">Comparação indisponível</small>'}</div>`;
          })
          .join('')
      : '<p class="data-note">Estatísticas ainda não informadas pela fonte.</p>'
  }</div>`;
}
