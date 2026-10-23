import { esc } from './dom.js';
export function formBadges(form = []) {
  return `<span class="form-badges" aria-label="Últimos resultados, mais recente primeiro">${
    form
      .slice(0, 5)
      .map((item) => {
        const raw = typeof item === 'string' ? item : item.result;
        const value =
          { W: 'V', L: 'D', D: 'E', V: 'V', E: 'E' }[raw] ||
          (raw === 'd' ? 'D' : '');
        // Normalized form objects already use Portuguese V/E/D.
        const result = typeof item === 'object' ? item.result : value;
        return ['V', 'E', 'D'].includes(result)
          ? `<span class="form-badge form-${result.toLowerCase()}" title="${esc(typeof item === 'object' ? `${item.own} × ${item.against} contra ${item.opponent}` : result)}">${esc(result)}</span>`
          : '';
      })
      .join('') || '<span class="data-note">Forma indisponível</span>'
  }</span>`;
}
export function probabilityBar(p, home, away) {
  if (!p)
    return '<p class="empty-message">Amostra insuficiente: são necessários pelo menos cinco jogos anteriores de cada time.</p>';
  return `<div class="probability-values"><span><b>${p.home}%</b>${esc(home)}</span><span><b>${p.draw}%</b>Empate</span><span><b>${p.away}%</b>${esc(away)}</span></div><div class="probability-bar" role="img" aria-label="${esc(home)} ${p.home}%, empate ${p.draw}%, ${esc(away)} ${p.away}%"><span style="width:${p.home}%"></span><span style="width:${p.draw}%"></span><span style="width:${p.away}%"></span></div>`;
}
