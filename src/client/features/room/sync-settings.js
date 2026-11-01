let delay = 0,
  gameId = '';
try {
  delay = Math.max(
    0,
    Math.min(180, Number(localStorage.getItem('palermas-score-delay')) || 0),
  );
} catch {
  /* Optional local preference. */
}
export const roomDelay = () => delay;
export const spoilerProtected = (id) => delay > 0 && String(id) === gameId;
export function setSyncGame(game) {
  gameId = game?.id || '';
  window.dispatchEvent(new Event('palermas:sync-reset'));
}
export function setRoomDelay(value) {
  delay = Math.max(0, Math.min(180, Math.round((Number(value) || 0) / 5) * 5));
  try {
    localStorage.setItem('palermas-score-delay', String(delay));
  } catch {
    /* Preference still works for this session. */
  }
  window.dispatchEvent(
    new CustomEvent('palermas:sync-reset', { detail: { delay } }),
  );
  return delay;
}
