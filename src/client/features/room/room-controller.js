import { diagnostics, recordDiagnostic } from './diagnostics.js';
import { showError } from '../../shared/feedback.js';
import { PalermasP2P } from './peer-connection.js';

import { qualityProfiles } from './stream-health.mjs';

const el = (s) => document.querySelector(s),
  video = el('#local-video');

let endpoint = null,
  client = null,
  capture = null,
  joining = false,
  wanted = false,
  retryTimer = null,
  retries = 0,
  handoff = null;

let resumeToken;

try {
  resumeToken =
    sessionStorage.getItem('palermas-room-token') || crypto.randomUUID();
  sessionStorage.setItem('palermas-room-token', resumeToken);
} catch {
  resumeToken = crypto.randomUUID();
}

const quality = qualityProfiles;

const status = (text) => {
  if (el('#room-status').textContent !== text)
    recordDiagnostic('status', { message: text });
  el('#room-status').textContent = text;
};

function setVideo(media, local = false) {
  video.srcObject = media;
  video.muted = local;
  video.hidden = !media;
  el('#player-placeholder').hidden = !!media;
  el('#player-badge').hidden = !media;
  el('#player-badge').textContent = local
    ? 'SUA TRANSMISSÃO'
    : 'AO VIVO · PALERMAS';
  window.dispatchEvent(
    new CustomEvent('palermas:media', { detail: { local, active: !!media } }),
  );
  if (media)
    video.play().catch(() => {
      el('#enable-audio').hidden = false;
      status('Clique em Reproduzir com som para liberar o áudio.');
    });
}

function refresh() {
  const online = client && !client.closed,
    watching = online && client.publisher && client.publisher !== client.id;
  el('#join-room').textContent = joining
    ? 'Conectando…'
    : online
      ? 'Sair da sala'
      : wanted
        ? 'Cancelar reconexão'
        : 'Reconectar à sala';
  el('#join-room').disabled = !endpoint || joining;
  el('#share-screen').disabled = !!capture || !online || !!watching;
  el('#takeover-screen').hidden = !watching || !!capture;
  el('#takeover-screen').disabled = !online;
  el('#restore-quality').disabled = !capture;
  el('#stop-screen').disabled = !capture;
  el('#stop-screen').textContent = handoff
    ? 'Cancelar troca'
    : 'Encerrar transmissão';
  el('#room-connection-state').textContent = joining
    ? 'CONECTANDO'
    : online
      ? client.publisher
        ? 'AO VIVO'
        : 'SALA ABERTA'
      : wanted
        ? 'RECONECTANDO'
        : 'DESCONECTADO';
  el('#page-sala').classList.toggle('watching', !!watching);
  if (!capture) {
    el('#player-placeholder h2').textContent = watching
      ? 'Entrando na transmissão…'
      : online
        ? 'Nenhuma transmissão'
        : wanted
          ? 'Reconectando…'
          : 'Sala desconectada';
    el('#player-placeholder p').textContent = watching
      ? 'A imagem vai aparecer aqui.'
      : online
        ? 'Quem quiser pode começar a transmitir.'
        : wanted
          ? 'Tentaremos voltar automaticamente.'
          : 'Clique em Reconectar à sala para voltar.';
  }
}

function people(room) {
  const container = el('#room-members');
  container.replaceChildren();
  for (const m of room.members) {
    const row = document.createElement('div');
    row.className = 'member';
    const a = document.createElement('span');
    a.className = 'avatar';
    a.textContent = m.avatar || m.name.charAt(0).toUpperCase();
    const text = document.createElement('div'),
      name = document.createElement('strong'),
      sub = document.createElement('small');
    name.textContent = m.name + (m.id === room.id ? ' (você)' : '');
    sub.textContent =
      (m.publishing ? 'Transmitindo' : 'Na sala') +
      ({ cap: ' · Athletico', coxa: ' · Coritiba' }[m.team] || '');
    text.append(name, sub);
    row.append(a, text);
    container.append(row);
  }
  el('#room-count').textContent = room.members.length + ' / 6';
  el('#empty-seats').hidden = room.members.length === 6;
  el('#empty-seats p').textContent =
    6 - room.members.length + ' lugar(es) disponível(is).';
}

function stopCapture(release = true) {
  const old = capture;
  capture = null;
  handoff = null;
  if (release) {
    try {
      client?.send({ type: 'cancel-handoff' });
    } catch {}
    client?.stop();
  }
  old?.getTracks().forEach((t) => t.stop());
  setVideo(null);
  refresh();
}

function scheduleRetry() {
  if (!wanted || retryTimer || joining) return;
  const seconds =
    Math.min(60, 12 * 2 ** Math.min(retries++, 3)) +
    Math.floor(Math.random() * 3);
  status(
    navigator.onLine
      ? 'Conexão interrompida. Nova tentativa em ' + seconds + ' segundos.'
      : 'Sem internet. A sala volta automaticamente quando a conexão retornar.',
  );
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connectRoom();
  }, seconds * 1000);
  refresh();
}

async function connectRoom() {
  if (!endpoint || joining || !wanted || (client && !client.closed)) return;
  clearTimeout(retryTimer);
  retryTimer = null;
  if (!navigator.onLine) {
    scheduleRetry();
    return;
  }
  joining = true;
  refresh();
  status('Conectando à sala…');
  let name = el('#nickname').value.trim();
  if (!name) {
    name =
      'Palerma ' +
      (100 + (crypto.getRandomValues(new Uint16Array(1))[0] % 900));
    el('#nickname').value = name;
    try {
      localStorage.setItem('palermas-nickname', name);
    } catch {}
  }
  const current = new PalermasP2P(endpoint);
  client = current;
  for (const type of ['chat-message', 'room-game-update'])
    current.addEventListener(type, (event) => {
      if (client === current)
        window.dispatchEvent(
          new CustomEvent('palermas:' + type, { detail: event.detail }),
        );
    });
  current.addEventListener('diagnostic', (e) => {
    const { event, ...detail } = e.detail;
    recordDiagnostic(event, detail);
  });
  current.addEventListener('room', (e) => {
    if (client !== current) return;
    people(e.detail);
    refresh();
    window.dispatchEvent(
      new CustomEvent('palermas:room', {
        detail: {
          publisher: e.detail.publisher,
          count: e.detail.members.length,
          isPublisher: e.detail.publisher === e.detail.id,
          resumeToken,
        },
      }),
    );
    if (!capture && !e.detail.publisher) {
      setVideo(null);
      status('Sala aberta. Quem quiser pode transmitir.');
    } else if (!capture && e.detail.publisher)
      status('Conectando à transmissão…');
  });
  current.addEventListener('media', (e) => {
    if (client === current && !capture) setVideo(e.detail);
  });
  current.addEventListener('reaction', (e) =>
    window.dispatchEvent(
      new CustomEvent('palermas:reaction', { detail: e.detail }),
    ),
  );
  current.addEventListener('peerstate', (e) => {
    if (e.detail.state === 'connected')
      status(
        capture
          ? 'Transmissão conectada aos espectadores.'
          : 'Você está assistindo ao vivo.',
      );
    else if (['failed', 'disconnected'].includes(e.detail.state))
      status('A conexão oscilou. Tentando recuperar a transmissão…');
  });
  current.addEventListener('stats', (e) => renderStats(e.detail));
  current.addEventListener('error', (e) => {
    status(e.detail);
    showError(e.detail, { code: 'stream_error' });
  });
  current.addEventListener('replaced', () => {
    stopCapture(false);
    status('Transmissão transferida. Você continua na sala como espectador.');
  });
  current.addEventListener('handoff-request', (e) => {
    if (!capture || client.publisher !== client.id) return;
    handoff = e.detail;
    el('#handoff-name').textContent =
      e.detail.name + ' quer assumir a transmissão.';
    el('#handoff-request').hidden = false;
    setTimeout(() => {
      if (handoff?.from === e.detail.from) {
        handoff = null;
        el('#handoff-request').hidden = true;
      }
    }, 45000);
  });
  current.addEventListener('disconnected', () => {
    if (client !== current) return;
    window.dispatchEvent(
      new CustomEvent('palermas:room', {
        detail: { publisher: null, count: 0, isPublisher: false },
      }),
    );
    if (wanted)
      showError(
        'A conexão com a sala caiu. Tentando reconectar automaticamente.',
        { code: 'room_disconnected' },
      );
    if (handoff && !handoff.from) stopCapture(false);
    if (!capture) setVideo(null);
    el('#room-members').replaceChildren();
    el('#room-count').textContent = '— / 6';
    el('#diagnostics-content').textContent = 'Aguardando reconexão.';
    refresh();
    scheduleRetry();
  });
  try {
    await current.join(name, resumeToken);
    retries = 0;
    if (capture && capture.getVideoTracks()[0]?.readyState === 'live') {
      const q = quality[el('#stream-quality').value];
      await current.limitBitrate(q.bitrate);
      try {
        await current.publish(capture, q.bitrate);
        setVideo(capture, true);
        status('Sua transmissão foi reconectada.');
      } catch {
        stopCapture(false);
        status('A sala voltou, mas outro amigo já está transmitindo.');
      }
    }
  } catch (error) {
    current.leave();
    status(error.message);
    showError(error.message, { code: 'room_join_failed' });
  } finally {
    joining = false;
    refresh();
    if (current.closed) scheduleRetry();
  }
}

async function share(takeover = false) {
  if (capture) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    status('Use Chrome ou Edge no Windows, em HTTPS, para compartilhar.');
    return;
  }
  const q = quality[el('#stream-quality').value];
  try {
    const media = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: q.width, max: q.width },
        height: { ideal: q.height, max: q.height },
        frameRate: { ideal: q.frameRate, max: q.frameRate },
      },
      audio: true,
      preferCurrentTab: false,
    });
    if (!client || client.closed) {
      media.getTracks().forEach((t) => t.stop());
      throw Error('A sala desconectou. Espere a reconexão e tente novamente.');
    }
    capture = media;
    const track = media.getVideoTracks()[0];
    const { width, height, frameRate, displaySurface } = track.getSettings();
    recordDiagnostic('capture-start', {
      width,
      height,
      frameRate,
      displaySurface,
    });
    for (const state of ['mute', 'unmute', 'ended'])
      track.addEventListener(state, () => recordDiagnostic('capture-' + state));
    track.contentHint = 'motion';
    track.addEventListener(
      'ended',
      () => {
        if (capture === media) {
          stopCapture();
          status('Compartilhamento encerrado.');
        }
      },
      { once: true },
    );
    if (takeover) {
      handoff = { pending: true };
      status('Aguardando o transmissor aceitar a troca…');
    }
    refresh();
    await client.limitBitrate(q.bitrate);
    await client.publish(media, q.bitrate, takeover);
    if (capture !== media) return;
    handoff = null;
    setVideo(media, true);
    status(
      media.getAudioTracks().length
        ? 'Transmitindo com som. Sua prévia fica muda para evitar retorno.'
        : 'Sem som. Para incluir áudio, compartilhe uma aba com Compartilhar áudio marcado.',
    );
  } catch (error) {
    stopCapture();
    if (error.name !== 'NotAllowedError')
      showError(error.message || 'Não foi possível compartilhar.', {
        code: 'capture_failed',
      });
    status(
      error.name === 'NotAllowedError'
        ? 'Compartilhamento cancelado.'
        : error.message || 'Não foi possível compartilhar.',
    );
  } finally {
    refresh();
  }
}

function renderStats(samples) {
  const warning = el('#quality-warning'),
    weak = samples.filter(
      (s) =>
        s.suggestLower ||
        s.stalled ||
        s.limited === 'cpu' ||
        s.limited === 'bandwidth',
    );
  warning.hidden = !weak.length;
  warning.textContent = weak.length
    ? capture
      ? 'Sinais de travamento ou limitação para ' +
        weak.map((s) => s.name).join(', ') +
        '. Se estiver travando, experimente uma qualidade menor no seletor acima. A qualidade não foi alterada.'
      : 'Há sinais de travamento ou limitação. Consulte o diagnóstico abaixo e peça ao transmissor para testar uma qualidade menor.'
    : '';
  const box = el('#diagnostics-content');
  box.replaceChildren();
  const source = capture?.getVideoTracks()[0]?.getSettings();
  if (source) {
    const line = document.createElement('p');
    line.textContent =
      'Captura: ' +
      (source.width || '—') +
      ' × ' +
      (source.height || '—') +
      ' · ' +
      Math.round(source.frameRate || 0) +
      ' fps · ' +
      samples.length +
      ' espectador(es).';
    box.append(line);
  }
  if (!samples.length) {
    const line = document.createElement('p');
    line.textContent = capture
      ? 'Aguardando espectadores.'
      : 'Aguardando transmissão.';
    box.append(line);
    return;
  }
  if (capture) {
    const total = samples.reduce((sum, s) => sum + (s.bitrate || 0), 0),
      line = document.createElement('p');
    line.textContent =
      'Upload de vídeo total: ' +
      (total / 1000000).toFixed(2) +
      ' Mb/s; teto de vídeo escolhido para esta sala: ' +
      ((client.bitrate * samples.length) / 1000000).toFixed(0) +
      ' Mb/s. O áudio e os dados de rede usam um pouco mais.';
    box.append(line);
  }
  for (const s of samples) {
    const row = document.createElement('div');
    row.className = 'diagnostic-row';
    const title = document.createElement('strong');
    title.textContent = s.name + ' · ' + s.label;
    const info = document.createElement('span');
    info.textContent = [
      s.width && s.height ? s.width + ' × ' + s.height : 'Resolução —',
      s.fps !== null ? Math.round(s.fps) + ' fps' : 'FPS —',
      s.bitrate !== null ? (s.bitrate / 1000000).toFixed(2) + ' Mb/s' : null,
      s.codec,
      s.iceState ? 'ICE ' + s.iceState : null,
      s.candidateType ? 'Rota ' + s.candidateType : null,
      s.available !== null
        ? 'Banda estimada ' + (s.available / 1000000).toFixed(2) + ' Mb/s'
        : null,
      s.freezes !== null ? s.freezes + ' congelamento(s)' : null,
      s.rtt !== null ? Math.round(s.rtt * 1000) + ' ms RTT' : null,
      s.loss !== null ? (s.loss * 100).toFixed(1) + '% de perda' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const detail = document.createElement('small');
    detail.textContent = s.stalled
      ? 'Sem novos quadros há pelo menos 10 segundos. Verifique a captura e a conexão do transmissor.'
      : s.limited === 'cpu'
        ? 'O computador está limitando a codificação. Use 30 fps ou o modo 720p.'
        : s.limited === 'bandwidth'
          ? 'O navegador está ajustando o envio à banda disponível.'
          : 'Conexão direta';
    row.append(title, info, detail);
    box.append(row);
  }
}

export async function initRoom() {
  window.addEventListener('palermas:site-error', (event) =>
    recordDiagnostic('site-error', event.detail),
  );
  const renderLog = () => {
    el('#stream-event-log').textContent = diagnostics
      .slice(-80)
      .map((entry) => JSON.stringify(entry))
      .join('\n');
  };
  window.addEventListener('palermas:diagnostic', renderLog);
  renderLog();
  el('#download-stream-log').addEventListener('click', () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), events: diagnostics },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'palermas-transmissao.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  for (const event of [
    'waiting',
    'stalled',
    'playing',
    'pause',
    'error',
    'emptied',
  ])
    video.addEventListener(event, () => {
      recordDiagnostic('player-' + event, {
        readyState: video.readyState,
        networkState: video.networkState,
        time: video.currentTime,
        error: video.error?.code,
      });
    });
  document.addEventListener('visibilitychange', () =>
    recordDiagnostic('visibility', { state: document.visibilityState }),
  );
  window.addEventListener('offline', () => recordDiagnostic('network-offline'));

  try {
    const config = await fetch('/room-config.json', { cache: 'no-store' }).then(
      (r) => r.json(),
    );
    const u = new URL(config.signalingUrl);
    if (
      u.protocol === 'https:' ||
      (u.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(location.hostname) &&
        ['localhost', '127.0.0.1'].includes(u.hostname))
    )
      endpoint = u.origin;
  } catch {}
  el('#join-room').addEventListener('click', () => {
    if (wanted || (client && !client.closed)) {
      wanted = false;
      clearTimeout(retryTimer);
      retryTimer = null;
      client?.leave();
      stopCapture(false);
      window.dispatchEvent(
        new CustomEvent('palermas:room', {
          detail: { publisher: null, count: 0, isPublisher: false },
        }),
      );
      people({ members: [], id: null });
      status('Você saiu da sala.');
      refresh();
    } else {
      wanted = true;
      connectRoom();
    }
  });
  el('#share-screen').addEventListener('click', () => share());
  el('#takeover-screen').addEventListener('click', () => share(true));
  el('#stop-screen').addEventListener('click', () => {
    stopCapture();
    status('Compartilhamento encerrado.');
  });
  for (const accept of [true, false])
    el(accept ? '#accept-handoff' : '#decline-handoff').addEventListener(
      'click',
      () => {
        if (handoff?.from)
          try {
            client.send({ type: 'handoff-response', to: handoff.from, accept });
          } catch {}
        handoff = null;
        el('#handoff-request').hidden = true;
      },
    );
  el('#stream-quality').addEventListener('change', async () => {
    if (!capture) return;
    const q = quality[el('#stream-quality').value];
    try {
      await capture.getVideoTracks()[0].applyConstraints({
        width: { ideal: q.width, max: q.width },
        height: { ideal: q.height, max: q.height },
        frameRate: { ideal: q.frameRate, max: q.frameRate },
      });
      await client?.limitBitrate(q.bitrate);
      status(
        'Qualidade escolhida aplicada. O site só sugere mudanças em caso de perda.',
      );
    } catch {
      status(
        'Não foi possível ajustar a captura. Tente compartilhar novamente.',
      );
    }
  });
  el('#restore-quality').addEventListener('click', async () => {
    if (!capture || !client) return;
    const q = quality[el('#stream-quality').value];
    await client.limitBitrate(q.bitrate);
    status('Qualidade escolhida reaplicada para todos os espectadores.');
  });
  el('#volume').addEventListener('input', (e) => {
    video.volume = Number(e.target.value);
    if (!capture) video.muted = video.volume === 0;
  });
  el('#enable-audio').addEventListener('click', async () => {
    video.muted = !!capture;
    try {
      await video.play();
      el('#enable-audio').hidden = true;
    } catch {
      status('Não foi possível reproduzir a transmissão.');
    }
  });
  window.addEventListener('online', () => {
    if (wanted && (!client || client.closed)) {
      clearTimeout(retryTimer);
      retryTimer = null;
      connectRoom();
    }
  });
  window.addEventListener('pagehide', () => {
    wanted = false;
    clearTimeout(retryTimer);
    client?.leave();
  });
  window.addEventListener('palermas:navigate', (e) => {
    if (e.detail.page === 'sala' && !wanted) {
      wanted = true;
      connectRoom();
    }
  });
  el('#site-logout').addEventListener('click', async () => {
    wanted = false;
    clearTimeout(retryTimer);
    client?.leave();
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    location.reload();
  });
  window.addEventListener('palermas:sendreaction', (e) => {
    try {
      client.send({ type: 'reaction', emoji: e.detail.emoji });
    } catch {
      status('Entre na sala para enviar reações.');
    }
  });
  refresh();
  if (location.hash === '#sala') {
    wanted = true;
    connectRoom();
  }
}
