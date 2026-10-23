const pages = {
  cap: 'https://ge.globo.com/pr/futebol/times/athletico-pr/',
  coxa: 'https://ge.globo.com/pr/futebol/times/coritiba/',
};
const cache = new Map();
export function relevantClubText(text, key) {
  return (
    key === 'cap'
      ? /\b(athletico|atletico[- ]pr|furacão|furacao)\b/i
      : /\b(coritiba|coxa(?:-branca)?)\b/i
  ).test(text || '');
}
// Read the embedded JSON array as data; never evaluate the page's scripts.
export function embeddedItems(html) {
  const marker = /"items"\s*:\s*\[/g;
  for (const match of html.matchAll(marker)) {
    const start = match.index + match[0].lastIndexOf('[');
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let i = start; i < Math.min(html.length, start + 2000000); i++) {
      const c = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) {
        try {
          const items = JSON.parse(html.slice(start, i + 1));
          if (items.some((p) => p.content?.url)) return items;
        } catch {}
        break;
      }
    }
  }
  return [];
}
export function normalizeGENews(items, club) {
  const articles = items
    .filter(
      (p) =>
        p.type === 'materia' &&
        !p.draft &&
        relevantClubText(
          p.content?.title + ' ' + (p.content?.summary || ''),
          club.key,
        ),
    )
    .map((p) => {
      const c = p.content;
      let url,
        image = null;
      try {
        const u = new URL(c.url);
        if (
          u.protocol !== 'https:' ||
          u.hostname !== 'ge.globo.com' ||
          !u.pathname.startsWith(
            new URL(pages[club.key]).pathname + 'noticia/',
          ) ||
          !u.pathname.endsWith('.ghtml')
        )
          return null;
        u.search = '';
        u.hash = '';
        url = u.href;
      } catch {
        return null;
      }
      const raw =
        c.image?.sizes?.M?.url || c.image?.sizes?.S?.url || c.image?.url;
      try {
        const u = new URL(raw);
        if (u.protocol === 'https:' && /(^|\.)glbimg\.com$/.test(u.hostname))
          image = u.href;
      } catch {}
      const date = p.publication || p.created;
      return Number.isFinite(Date.parse(date))
        ? {
            id: 'ge:' + p.id,
            title: String(c.title).replace(/<[^>]*>/g, ''),
            summary: String(c.summary || '').replace(/<[^>]*>/g, ''),
            url,
            image,
            date,
            club: club.key,
            clubName: club.short,
            source: 'ge',
            type: 'Notícia',
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));
  return articles
    .filter((a, index, all) => all.findIndex((b) => b.url === a.url) === index)
    .slice(0, 6);
}
export async function geClubNews(club, fetcher = fetch) {
  if (!pages[club.key]) throw Error('Clube inválido');
  const old = cache.get(club.key);
  if (old?.expires > Date.now()) return old.data;
  const response = await fetcher(pages[club.key], {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error('Notícias do ge indisponíveis');
  const html = await response.text();
  if (html.length > 4000000) throw Error('Página inesperada');
  const data = normalizeGENews(embeddedItems(html), club);
  if (!data.length) throw Error('O ge não retornou matérias do clube');
  cache.set(club.key, { data, expires: Date.now() + 600000 });
  return data;
}
