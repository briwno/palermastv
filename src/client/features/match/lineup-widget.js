import { sofaForGame } from '../../integrations/sofascore.js';
import { activeMatch } from './match-center.js';
import { $ } from '../../shared/dom.js';
import { matchContext } from '../lounge/context.js';
import { loungeRequest } from '../lounge/api.js';
async function refreshSofaWidget() {
  const automatic = sofaForGame(activeMatch?.game);
  if (automatic) renderSofaWidget(automatic);
  else if ($('#sofa-widget'))
    $('#sofa-widget').innerHTML =
      '<p class="empty-message">Vincule o link desta partida no Sofascore para ver escalação e notas aqui.</p>';
  try {
    const context = matchContext(),
      d = await loungeRequest(context);
    if (context !== matchContext() || !$('#sofa-widget')) return;
    renderSofaWidget(d.widget);
  } catch {}
}

function renderSofaWidget(widget) {
  const box = $('#sofa-widget');
  if (!box || !widget) return;
  box.replaceChildren();
  const frame = document.createElement('iframe');
  frame.src = widget.url;
  frame.title = 'Escalações e notas · Sofascore';
  frame.className = 'sofa-widget-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
  const source = document.createElement('a');
  source.href = widget.url;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.className = 'source-link';
  source.textContent =
    'Abrir widget no Sofascore ↗ · Vinculado por ' + widget.name;
  box.append(frame, source);
}
export { refreshSofaWidget, renderSofaWidget };
