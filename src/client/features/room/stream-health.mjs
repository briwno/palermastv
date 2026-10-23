export const qualityProfiles = {
  balanced: { width: 1280, height: 720, frameRate: 30, bitrate: 5000000 },
  high: { width: 1920, height: 1080, frameRate: 30, bitrate: 12000000 },
  sports: { width: 1920, height: 1080, frameRate: 60, bitrate: 16000000 },
};
// Five-second samples: suggest a change after 15 seconds of packet loss.
// This state is advisory only: no bitrate, resolution or FPS is changed.
export function lossAdvice(state, sample) {
  const current = { bad: 0, good: 0, active: false, ...state };
  if (sample.state !== 'connected') return { bad: 0, good: 0, active: false };
  if (!Number.isFinite(sample.loss)) {
    current.bad = 0;
    current.good = 0;
    return current;
  }
  current.bad = sample.loss > 0.05 ? current.bad + 1 : 0;
  current.good = sample.loss < 0.02 ? current.good + 1 : 0;
  if (current.bad >= 3) current.active = true;
  if (current.good >= 6) current.active = false;
  return current;
}
export function connectionLabel(sample) {
  if (sample.state !== 'connected')
    return sample.state === 'failed' ? 'Sem conexão' : 'Reconectando';
  if (sample.loss === null && sample.rtt === null) return 'Medindo';
  return sample.loss > 0.08 || sample.rtt > 0.9
    ? 'Instável'
    : sample.loss > 0.025 || sample.rtt > 0.45
      ? 'Regular'
      : 'Boa';
}
export function preferVideoCodecs(codecs = []) {
  const order = (c) =>
    /video\/h264/i.test(c.mimeType)
      ? 0
      : /video\/vp8/i.test(c.mimeType)
        ? 1
        : /video\/vp9/i.test(c.mimeType)
          ? 2
          : 3;
  return [...codecs].sort((a, b) => order(a) - order(b));
}
