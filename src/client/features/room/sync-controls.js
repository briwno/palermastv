import { $ } from '../../shared/dom.js';
import { markFreshness } from '../../shared/freshness.js';
import { ReplayBuffer } from './replay-buffer.mjs';
import { roomDelay, setRoomDelay, setSyncGame } from './sync-settings.js';
export function initRoomSync({ render, waiting, resetEffects }) {
  $('#room-match-stage').insertAdjacentHTML(
    'beforebegin',
    '<section id="room-sync" class="room-sync" hidden aria-label="Atualização e sincronização da partida"><div class="room-sync-source"><span class="source-label" id="room-source-text">Consultando a partida</span><span id="room-sync-status"></span></div><details class="room-sync-controls"><summary>Sincronizar com o vídeo <span id="room-delay-label"></span></summary><div><p>Se o placar chegar antes do vídeo, aumente o atraso. O ajuste vale só para você, inclusive na janela flutuante.</p><label for="room-score-delay">Atraso dos dados <output id="room-delay-value"></output></label><div class="delay-adjust"><button type="button" class="button subtle" data-delay-step="-5" aria-label="Diminuir atraso em 5 segundos">−5 s</button><input id="room-score-delay" type="range" min="0" max="180" step="5" value="0"><button type="button" class="button subtle" data-delay-step="5" aria-label="Aumentar atraso em 5 segundos">+5 s</button></div><button type="button" class="text-button" id="room-delay-reset">Voltar ao tempo real</button><small>Ao abrir outra página do site, os dados dessa página seguem em tempo real. O vídeo e o chat não são atrasados.</small></div></details></section>',
  );
  const replay = new ReplayBuffer({
    delay: roomDelay(),
    emit: render,
    waiting,
  });
  function controls() {
    if (document.activeElement !== $('#room-score-delay')) {
      $('#room-score-delay').value = String(replay.delay);
      $('#room-delay-value').textContent = replay.delay + ' s';
    }
    $('#room-delay-label').textContent = replay.delay
      ? `−${replay.delay} s`
      : 'Tempo real';
    const remaining = replay.remaining();
    $('#room-sync-status').textContent = remaining
      ? `Acumulando dados · faltam ${remaining} s`
      : replay.delay
        ? `Placar, lances e efeitos com ${replay.delay} s de atraso`
        : 'Dados sem atraso adicional';
    $('#room-sync').classList.toggle('has-delay', replay.delay > 0);
    $('#room-score-delay').setAttribute(
      'aria-valuetext',
      replay.delay + ' segundos de atraso',
    );
  }
  function change(value) {
    if (replay.clamp(value) === replay.delay) return;
    resetEffects();
    const delay = setRoomDelay(value);
    replay.setDelay(delay);
    controls();
  }
  $('#room-score-delay').addEventListener('change', (e) =>
    change(e.target.value),
  );
  $('#room-score-delay').addEventListener('input', (e) => {
    $('#room-delay-value').textContent = e.target.value + ' s';
  });
  $('#room-sync').addEventListener('click', (e) => {
    const step = e.target.closest('[data-delay-step]');
    if (step) change(replay.delay + Number(step.dataset.delayStep));
  });
  $('#room-delay-reset').addEventListener('click', () => change(0));
  setInterval(() => {
    replay.tick();
    controls();
  }, 1000);
  controls();
  return {
    push(data, { fresh = true } = {}) {
      if (fresh) {
        $('#room-source-text').textContent =
          'Dados: ' + (data.source || 'ESPN');
        markFreshness('#room-source-text', data, 15);
      }
      replay.push(data);
      controls();
    },
    reset(game) {
      replay.reset(game ? game.leagueId + '/' + game.id : '');
      setSyncGame(game);
      $('#room-sync').hidden = !game;
      $('#room-source-text').textContent = game ? 'Consultando a partida' : '';
      markFreshness('#room-source-text', { checkedAt: null }, 15);
      controls();
    },
    failed() {
      markFreshness('#room-source-text', null, 15);
    },
  };
}
