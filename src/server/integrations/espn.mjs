const memory = new Map(),
  inflight = new Map();
export async function feed(url, ttl, fetcher = fetch) {
  const now = Date.now(),
    old = memory.get(url);
  if (old && old.expires > now) return old.value;
  if (inflight.has(url)) return inflight.get(url);
  const job = (async () => {
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    let cached = null;
    try {
      cached = cache ? await cache.match(url) : null;
    } catch {}
    if (cached) {
      const value = await cached.json();
      memory.set(url, { value, expires: now + ttl * 1000 });
      return value;
    }
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error('Fonte indisponível');
    const value = await response.json();
    if (!value || typeof value !== 'object') throw Error('Resposta inválida');
    if (memory.size > 80) memory.clear();
    memory.set(url, { value, expires: now + ttl * 1000 });
    if (cache)
      try {
        await cache.put(
          url,
          new Response(JSON.stringify(value), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=' + ttl,
            },
          }),
        );
      } catch {}
    return value;
  })();
  inflight.set(url, job);
  try {
    return await job;
  } finally {
    inflight.delete(url);
  }
}
