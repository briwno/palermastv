import { matchCenter } from '../match/service.mjs';
import { signalingEndpoint } from '../../config/signaling.mjs';
export async function groupAPI(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  async function call(data) {
    const r = await fetcher(signalingEndpoint(env) + '/group', {
      method: 'POST',
      headers: { Origin: url.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, code: env.ROOM_CODE }),
      signal: AbortSignal.timeout(12000),
    });
    let body;
    try {
      body = await r.json();
    } catch {
      throw Error('Serviço do grupo indisponível.');
    }
    if (!r.ok) {
      const action = data.action;
      const outdated =
        ['community-chat', 'community-room'].includes(action) &&
        (['invalid_game', 'unknown_action'].includes(body?.error) ||
          (data.operation === 'read' && body?.error === 'invalid_identity'));
      const requestId = crypto.randomUUID();
      const error = outdated ? 'service_outdated' : body?.error;
      console.error(
        JSON.stringify({
          service: 'group-proxy',
          path: url.pathname,
          action,
          status: r.status,
          code:
            typeof error === 'string' && /^[a-z0-9_]{1,64}$/.test(error)
              ? error
              : 'upstream_error',
          requestId,
        }),
      );
      return {
        status: outdated ? 503 : r.status,
        body: { ...body, ...(outdated ? { error } : {}), requestId },
      };
    }
    return { status: r.status, body };
  }
  try {
    const communityRoute = url.pathname.match(
      /^\/api\/group\/(profile|chat|awards|history|room-game)$/,
    );
    if (communityRoute) {
      const route = communityRoute[1];
      if (!['GET', 'POST'].includes(request.method))
        return { status: 405, body: { error: 'method_not_allowed' } };
      if (request.method === 'GET' && route === 'profile')
        return { status: 405, body: { error: 'method_not_allowed' } };
      if (request.method === 'POST' && route === 'history')
        return { status: 405, body: { error: 'method_not_allowed' } };
      let body = {};
      if (request.method === 'POST') {
        const raw = await request.text();
        if (raw.length > 4000)
          return { status: 413, body: { error: 'too_large' } };
        try {
          body = JSON.parse(raw);
        } catch {
          return { status: 400, body: { error: 'invalid_json' } };
        }
        if (!body || typeof body !== 'object')
          return { status: 400, body: { error: 'invalid_json' } };
      }
      const operation =
        request.method === 'GET' ||
        (route === 'profile' && body.operation === 'read')
          ? 'read'
          : 'write';
      const data = {
        action: 'community-' + ({ 'room-game': 'room' }[route] || route),
        operation,
        token: body.token,
        name: body.name,
        avatar: body.avatar,
        team: body.team,
        text: body.text,
        craque: body.craque,
        bagre: body.bagre,
        resumeToken: body.resumeToken,
      };
      if (
        route === 'awards' ||
        (route === 'room-game' && operation === 'write' && !body.clear)
      ) {
        const league = body.league || url.searchParams.get('league'),
          id = body.id || url.searchParams.get('id');
        const match = await matchCenter(league, id, fetcher);
        data.game = match.game;
        data.players = match.lineups.flatMap((l) =>
          l.players
            .filter((p) => p.id && (p.starter || p.subbedIn))
            .map((p) => ({ id: p.id, name: p.name, team: l.team.name })),
        );
      }
      return await call(data);
    }
    if (url.pathname === '/api/group/lounge') {
      if (request.method === 'GET')
        return await call({
          action: 'lounge',
          operation: 'read',
          context: url.searchParams.get('context') || 'sala',
        });
      if (request.method !== 'POST')
        return { status: 405, body: { error: 'method_not_allowed' } };
      const raw = await request.text();
      if (raw.length > 4000)
        return { status: 413, body: { error: 'too_large' } };
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return { status: 400, body: { error: 'invalid_json' } };
      }
      return await call({
        action: 'lounge',
        operation: body.operation,
        context: body.context,
        token: body.token,
        name: body.name,
        question: body.question,
        options: body.options,
        pollId: body.pollId,
        choice: body.choice,
        url: body.url,
      });
    }
    if (url.pathname === '/api/group/status' && request.method === 'GET')
      return await call({ action: 'status' });
    if (url.pathname === '/api/group/ranking' && request.method === 'GET') {
      const pending = await call({ action: 'pending' });
      if (pending.status !== 200) return pending;
      const settled = await Promise.allSettled(
        (pending.body.games || []).map(async (g) => {
          const d = await matchCenter(g.league, g.id, fetcher);
          const m = d.game;
          if (
            m.state !== 'post' ||
            m.homeScore === null ||
            m.awayScore === null ||
            !Number.isFinite(Number(m.homeScore)) ||
            !Number.isFinite(Number(m.awayScore))
          )
            return null;
          return {
            league: g.league,
            id: g.id,
            home: Number(m.homeScore),
            away: Number(m.awayScore),
          };
        }),
      );
      const results = settled
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => r.value);
      if (results.length) await call({ action: 'settle', results });
      return await call({ action: 'ranking' });
    }
    if (url.pathname !== '/api/group/predictions')
      return { status: 404, body: { error: 'not_found' } };
    let body = {};
    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 2000)
        return { status: 413, body: { error: 'too_large' } };
      try {
        body = JSON.parse(raw);
      } catch {
        return { status: 400, body: { error: 'invalid_json' } };
      }
    }
    const league =
        request.method === 'POST'
          ? body.league
          : url.searchParams.get('league'),
      id = request.method === 'POST' ? body.id : url.searchParams.get('id');
    const { game } = await matchCenter(league, id, fetcher);
    const metadata = {
      league,
      id: game.id,
      date: game.date,
      state: game.state,
      homeName: game.home.name,
      awayName: game.away.name,
    };
    if (request.method === 'GET')
      return await call({ action: 'picks', game: metadata });
    if (request.method !== 'POST')
      return { status: 405, body: { error: 'method_not_allowed' } };
    return await call({
      action: 'vote',
      game: metadata,
      token: body.token,
      name: body.name,
      home: body.home,
      away: body.away,
    });
  } catch {
    const requestId = crypto.randomUUID();
    console.error(
      JSON.stringify({
        service: 'group-proxy',
        path: url.pathname,
        code: 'group_unavailable',
        requestId,
      }),
    );
    return { status: 502, body: { error: 'group_unavailable', requestId } };
  }
}
