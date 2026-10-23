import { $ } from '../../shared/dom.js';
import { navigate } from '../../shell/navigation.js';
export function initMiniplayer() {
  const player = $('#player'),
    video = $('#local-video'),
    home = document.createComment('player-home');
  player.before(home);
  let dismissed = false,
    local = false;
  function update() {
    const floating = $('#page-sala').hidden && !!video.srcObject && !dismissed;
    $('#miniplayer').hidden = !floating;
    let moved = false;
    if (floating && player.parentElement !== $('#miniplayer-video')) {
      $('#miniplayer-video').append(player);
      moved = true;
    } else if (!floating && player.previousSibling !== home) {
      home.after(player);
      moved = true;
    }
    if (moved && video.srcObject)
      video.play().catch(() => {
        $('#mini-status').textContent =
          'Clique em Ativar som para retomar a reprodução.';
      });
  }
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'sala') dismissed = false;
    update();
  });
  window.addEventListener('palermas:media', (e) => {
    local = !!e.detail?.local;
    $('#miniplayer-mute').disabled = local;
    $('#miniplayer-mute').textContent = local
      ? 'Sua prévia fica muda'
      : video.muted
        ? 'Ativar som'
        : 'Silenciar';
    update();
  });
  $('#miniplayer-return').addEventListener('click', () => navigate('sala'));
  $('#miniplayer-close').addEventListener('click', () => {
    dismissed = true;
    navigate('sala');
  });
  $('#miniplayer-mute').addEventListener('click', () => {
    if (local) return;
    video.muted = !video.muted;
    video.play().catch(() => {});
    $('#miniplayer-mute').textContent = video.muted
      ? 'Ativar som'
      : 'Silenciar';
  });
  $('#miniplayer-pip').addEventListener('click', async () => {
    try {
      await video.requestPictureInPicture();
    } catch {
      $('#mini-status').textContent =
        'Picture-in-Picture indisponível. Use o miniplayer nesta página.';
    }
  });
  $('#miniplayer-pip').hidden = !document.pictureInPictureEnabled;
}
