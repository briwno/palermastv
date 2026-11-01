const sources = new Map();
export function freshnessState(
  at,
  period = 15,
  failed = false,
  now = Date.now(),
) {
  const time = Date.parse(at);
  if (!Number.isFinite(time))
    return {
      kind: failed ? 'stale' : 'pending',
      text: failed ? 'Consulta indisponível' : 'Aguardando dados',
    };
  const age = Math.max(0, Math.floor((now - time) / 1000));
  const elapsed =
    age < 60
      ? `${age} s`
      : age < 3600
        ? `${Math.floor(age / 60)} min`
        : `${Math.floor(age / 3600)} h`;
  const stale = failed || age > Math.max(45, period * 3);
  return {
    kind: stale ? 'stale' : 'fresh',
    text: `${stale ? 'Sem atualização' : 'Consulta'} há ${elapsed}`,
  };
}
function render(selector, entry) {
  const target = document.querySelector(selector);
  if (!target) return;
  let badge = document.getElementById(entry.id);
  if (!badge) {
    badge = document.createElement('span');
    badge.id = entry.id;
    badge.className = 'source-freshness';
    badge.title =
      'Tempo desde a última consulta bem-sucedida. A fonte pode ter seu próprio atraso.';
    target.insertAdjacentElement('afterend', badge);
  }
  const state = freshnessState(entry.at, entry.period, entry.failed);
  badge.dataset.state = state.kind;
  badge.textContent = state.text;
}
export function markFreshness(selector, data, period = 15) {
  const old = sources.get(selector);
  const entry = {
    id: old?.id || 'source-freshness-' + (sources.size + 1),
    at: data ? data.checkedAt || null : old?.at,
    period,
    failed: !data,
  };
  sources.set(selector, entry);
  render(selector, entry);
}
export function initFreshness() {
  setInterval(() => {
    if (!document.hidden)
      for (const [selector, entry] of sources) render(selector, entry);
  }, 5000);
}
