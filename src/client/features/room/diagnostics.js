// Bounded local history survives reconnects and reloads in the same tab.
const key = 'palermas-stream-diagnostics';
export const diagnostics = [];
try {
  const saved = JSON.parse(sessionStorage.getItem(key) || '[]');
  if (Array.isArray(saved)) diagnostics.push(...saved.slice(-200));
} catch {}

export function recordDiagnostic(event, detail = {}) {
  diagnostics.push({ at: new Date().toISOString(), event, ...detail });
  if (diagnostics.length > 200) diagnostics.shift();
  try {
    sessionStorage.setItem(key, JSON.stringify(diagnostics));
  } catch {}
  window.dispatchEvent(new Event('palermas:diagnostic'));
}
