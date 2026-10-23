const json = (v, s = 200) =>
  Response.json(v, { status: s, headers: { 'Cache-Control': 'no-store' } });
export function tweetURL(value) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(
        u.hostname,
      )
    )
      return null;
    const match = u.pathname.match(
      /^\/([A-Za-z0-9_]{1,20})\/status\/(\d{5,25})\/?$/,
    );
    return match
      ? {
          url: 'https://x.com/' + match[1] + '/status/' + match[2],
          id: match[2],
          author: match[1],
        }
      : null;
  } catch {
    return null;
  }
}
export function lineupWidget(value) {
  try {
    const raw = String(value || '').trim(),
      src = raw.startsWith('<')
        ? raw.match(/\bsrc=["']([^"']+)["']/i)?.[1]
        : raw;
    const u = new URL(src?.replaceAll('&amp;', '&'));
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'widgets.sofascore.com' ||
      u.username ||
      u.password ||
      !/^\/embed\/lineups\/?$/.test(u.pathname) ||
      !/^\d{1,14}$/.test(u.searchParams.get('id') || '')
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
const digest = async (s) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
export async function lounge(room, data) {
  const store = room.ctx.storage,
    context = data.context || 'sala';
  if (!/^(sala|[a-z0-9_.]{2,35}:\d{1,14})$/.test(context))
    return json({ error: 'invalid_context' }, 400);
  const key = 'lounge:' + context;
  let saved = (await store.get(key)) || { polls: [], posts: [] };
  if (data.operation !== 'read') {
    if (
      typeof data.token !== 'string' ||
      !/^[a-zA-Z0-9_-]{32,100}$/.test(data.token) ||
      typeof data.name !== 'string' ||
      !data.name.trim()
    )
      return json({ error: 'invalid_identity' }, 400);
    const id = await digest(data.token),
      name = data.name.trim().slice(0, 24),
      rateKey = 'lounge-rate:' + id,
      last = (await store.get(rateKey)) || 0;
    if (Date.now() - last < 1000) return json({ error: 'try_later' }, 429);
    if (!['poll', 'vote', 'close', 'post', 'widget'].includes(data.operation))
      return json({ error: 'unknown_action' }, 404);
    if (data.operation === 'poll') {
      const question =
          typeof data.question === 'string'
            ? data.question.trim().slice(0, 140)
            : '',
        options = Array.isArray(data.options)
          ? data.options.map((o) =>
              typeof o === 'string' ? o.trim().slice(0, 60) : '',
            )
          : [];
      if (
        question.length < 5 ||
        options.length < 2 ||
        options.length > 6 ||
        options.some((o) => !o) ||
        new Set(options).size !== options.length
      )
        return json({ error: 'invalid_poll' }, 400);
      if (
        saved.polls.filter((p) => !p.closed).length >= 6 ||
        saved.polls.length >= 20
      )
        return json({ error: 'poll_limit' }, 409);
      saved.polls.unshift({
        id: crypto.randomUUID(),
        owner: id,
        name,
        question,
        options,
        votes: {},
        createdAt: Date.now(),
        closed: false,
      });
    } else if (data.operation === 'vote' || data.operation === 'close') {
      const poll = saved.polls.find((p) => p.id === data.pollId);
      if (!poll) return json({ error: 'poll_missing' }, 404);
      if (data.operation === 'close') {
        if (poll.owner !== id) return json({ error: 'not_owner' }, 403);
        poll.closed = true;
      } else {
        if (poll.closed) return json({ error: 'poll_closed' }, 409);
        if (
          !Number.isInteger(data.choice) ||
          data.choice < 0 ||
          data.choice >= poll.options.length
        )
          return json({ error: 'invalid_poll' }, 400);
        if (!poll.votes[id] && Object.keys(poll.votes).length >= 32)
          return json({ error: 'player_limit' }, 409);
        poll.votes[id] = { choice: data.choice, name };
      }
    } else if (data.operation === 'widget') {
      const url = lineupWidget(data.url);
      if (!url || context === 'sala')
        return json({ error: 'invalid_widget' }, 400);
      saved.widget = { url, name, updatedAt: Date.now() };
    } else {
      const post = tweetURL(data.url);
      if (!post) return json({ error: 'invalid_post' }, 400);
      if (saved.posts.some((p) => p.id === post.id))
        return json({ error: 'duplicate_post' }, 409);
      if (saved.posts.length >= 24) return json({ error: 'post_limit' }, 409);
      saved.posts.unshift({ ...post, name, owner: id, createdAt: Date.now() });
    }
    if (
      !(await store.get(key)) &&
      (await store.list({ prefix: 'lounge:', limit: 401 })).size >= 400
    )
      return json({ error: 'game_limit' }, 409);
    await store.put(key, saved);
    await store.put(rateKey, Date.now());
  }
  return json(saved);
}
