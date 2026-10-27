import { showError } from './feedback.js';

const failures = new Map();
const labels = {
  chat: 'Chat',
  'room-game': 'Partida da transmissão',
  profile: 'Perfil',
  awards: 'Votação',
  history: 'Histórico',
  lounge: 'Mural e enquetes',
  ranking: 'Ranking',
  predictions: 'Palpites',
  status: 'Estado da sala',
};

export async function requestJSON(
  url,
  options = {},
  messages = {},
  fallback = 'Não foi possível carregar os dados. Tente novamente.',
) {
  const parsed = new URL(url, location.origin);
  const path = parsed.pathname;
  const key = path + parsed.search;
  const read = !options.method || options.method === 'GET';
  const previous = failures.get(key);
  if (read && previous?.retryAt > Date.now()) throw previous.error;
  let response, data;
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal || AbortSignal.timeout(15000),
    });
    data = await response.json();
    if (!response.ok) throw Error('http');
  } catch {
    const rawCode = data?.error;
    const code =
      typeof rawCode === 'string' && /^[a-z0-9_]{1,64}$/.test(rawCode)
        ? rawCode
        : response
          ? 'invalid_response'
          : 'network_error';
    const common = {
      service_outdated:
        'Os recursos da sala estão indisponíveis. O serviço precisa de uma atualização.',
      unauthorized: 'Sua sessão expirou. Entre novamente no site.',
      group_unavailable:
        'O serviço do grupo está indisponível. Tentaremos novamente.',
      network_error: 'Não foi possível conectar. Verifique sua internet.',
    };
    const message = messages[code] || common[code] || fallback;
    const error = Error(message);
    showError(
      (labels[path.split('/').at(-1)] || 'Consulta do site') + ': ' + message,
      {
        path,
        status: response?.status,
        code,
        requestId:
          typeof data?.requestId === 'string' &&
          /^[a-zA-Z0-9-]{1,64}$/.test(data.requestId)
            ? data.requestId
            : undefined,
      },
    );
    if (read) {
      const count = (previous?.count || 0) + 1;
      failures.delete(key);
      failures.set(key, {
        count,
        retryAt: Date.now() + Math.min(120000, 5000 * 2 ** Math.min(count, 5)),
        error,
      });
      if (failures.size > 100) failures.delete(failures.keys().next().value);
    }
    throw error;
  }
  failures.delete(key);
  return data;
}
