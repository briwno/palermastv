// Signaling only: media is never sent to this Worker.
import { handleGroup } from './group.mjs';
const ORIGIN = 'https://palermastv.solargrass4.chatgpt.site';
export function allowedOrigins(env = {}) {
  return new Set([
    ORIGIN,
    ...String(env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => {
        try {
          const u = new URL(s);
          return (
            u.origin === s &&
            (u.protocol === 'https:' ||
              (u.protocol === 'http:' &&
                ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
          );
        } catch {
          return false;
        }
      }),
  ]);
}
const MAX_PEOPLE = 6;
const encoder = new TextEncoder();
function json(value, status = 200, origin = ORIGIN) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
export async function sameSecret(a, b) {
  const [aa, bb] = await Promise.all(
    [a, b].map((s) => crypto.subtle.digest('SHA-256', encoder.encode(s))),
  );
  const x = new Uint8Array(aa),
    y = new Uint8Array(bb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export function validSignal(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.type === 'offer' || payload.type === 'answer')
    return typeof payload.sdp === 'string' && payload.sdp.length <= 64000;
  if (payload.type === 'candidate')
    return (
      payload.candidate === null ||
      (payload.candidate &&
        typeof payload.candidate.candidate === 'string' &&
        payload.candidate.candidate.length < 4096)
    );
  return false;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (!allowedOrigins(env).has(origin))
      return json({ error: 'origin_denied' }, 403);
    if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin);
    const path = new URL(request.url).pathname;
    if (!['/join', '/ws', '/group'].includes(path))
      return json({ error: 'not_found' }, 404);
    if (!env.ROOM_CODE || env.ROOM_CODE.length < 16)
      return json({ error: 'not_configured' }, 503);
    return env.PALERMAS_ROOM.getByName('palermas').fetch(request);
  },
};
export class PalermasRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.members = new Map();
    for (const ws of ctx.getWebSockets()) {
      const member = ws.deserializeAttachment();
      if (member) this.members.set(ws, member);
    }
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }
  snapshot() {
    return {
      type: 'room',
      members: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar || '⚽',
        team: m.team || '',
        publishing: m.publishing,
      })),
      publisher:
        [...this.members.values()].find((m) => m.publishing)?.id || null,
    };
  }
  send(ws, value) {
    try {
      ws.send(JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  broadcast() {
    const state = this.snapshot();
    for (const ws of this.members.keys()) this.send(ws, state);
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/group' && request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 12000) return json({ error: 'too_large' }, 413);
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      if (
        !data ||
        typeof data.code !== 'string' ||
        !(await sameSecret(data.code, this.env.ROOM_CODE))
      )
        return json({ error: 'unauthorized' }, 401);
      return this.ctx.blockConcurrencyWhile(() => handleGroup(this, data));
    }
    if (url.pathname === '/join' && request.method === 'POST') {
      if (Number(request.headers.get('Content-Length') || 0) > 4096)
        return json({ error: 'too_large' }, 413);
      const raw = await request.text();
      if (raw.length > 4096) return json({ error: 'too_large' }, 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      const resumeKey =
        typeof body.resumeToken === 'string' &&
        /^[a-zA-Z0-9_-]{32,100}$/.test(body.resumeToken)
          ? Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  'SHA-256',
                  encoder.encode(body.resumeToken),
                ),
              ),
            )
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')
          : null;
      const name =
        typeof body.name === 'string' ? body.name.trim().slice(0, 24) : '';
      if (!name || typeof body.code !== 'string')
        return json({ error: 'invalid_join' }, 400);
      return this.ctx.blockConcurrencyWhile(async () => {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipDigest = Array.from(
          new Uint8Array(
            await crypto.subtle.digest('SHA-256', encoder.encode(ip)),
          ),
        )
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const rateKey = 'rate:' + ipDigest;
        const now = Date.now();
        let rate = (await this.ctx.storage.get(rateKey)) || {
          start: now,
          count: 0,
        };
        if (now - rate.start > 60000) rate = { start: now, count: 0 };
        if (rate.count >= 6) return json({ error: 'try_later' }, 429);
        rate.count++;
        await this.ctx.storage.put(rateKey, rate);
        if (!(await sameSecret(body.code, this.env.ROOM_CODE)))
          return json({ error: 'wrong_code' }, 401);
        if (resumeKey)
          for (const [socket, member] of this.members)
            if (member.resumeKey === resumeKey) {
              this.members.delete(socket);
              try {
                socket.close(1000, 'Reconectado');
              } catch {}
            }
        if (this.members.size >= MAX_PEOPLE)
          return json({ error: 'room_full' }, 409);
        // Keep short-lived tickets and login-attempt records bounded.
        const entries = await this.ctx.storage.list();
        for (const [key, value] of entries) {
          if (
            (key.startsWith('ticket:') && value.expires < now) ||
            (key.startsWith('rate:') && now - value.start > 120000)
          )
            await this.ctx.storage.delete(key);
        }
        if ((await this.ctx.storage.list({ prefix: 'ticket:' })).size >= 12)
          return json({ error: 'try_later' }, 429);
        const ticket = crypto.randomUUID() + crypto.randomUUID();
        const playerId =
          typeof body.playerToken === 'string' &&
          /^[a-zA-Z0-9_-]{32,100}$/.test(body.playerToken)
            ? Array.from(
                new Uint8Array(
                  await crypto.subtle.digest(
                    'SHA-256',
                    encoder.encode(body.playerToken),
                  ),
                ),
              )
                .map((v) => v.toString(16).padStart(2, '0'))
                .join('')
            : null;
        const profile = playerId
          ? ((await this.ctx.storage.get('pickprofiles')) || {})[playerId]
          : null;
        await this.ctx.storage.put('ticket:' + ticket, {
          name: profile?.name || name,
          avatar: profile?.avatar || '⚽',
          team: profile?.team || '',
          playerId,
          resumeKey,
          expires: now + 30000,
        });
        return json({ ticket });
      });
    }
    if (
      url.pathname !== '/ws' ||
      request.method !== 'GET' ||
      request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
    )
      return json({ error: 'upgrade_required' }, 426);
    return this.ctx.blockConcurrencyWhile(async () => {
      const offeredProtocols = (
        request.headers.get('Sec-WebSocket-Protocol') || ''
      )
        .split(',')
        .map((s) => s.trim());
      if (!offeredProtocols.includes('palermas-v1'))
        return json({ error: 'invalid_protocol' }, 400);
      const ticket = offeredProtocols
        .find((s) => s.startsWith('ticket.'))
        ?.slice(7);
      if (!ticket || ticket.length > 80)
        return json({ error: 'invalid_ticket' }, 401);
      const key = 'ticket:' + ticket;
      const grant = await this.ctx.storage.get(key);
      if (!grant || grant.expires < Date.now())
        return json({ error: 'invalid_ticket' }, 401);
      await this.ctx.storage.delete(key);
      if (this.members.size >= MAX_PEOPLE)
        return json({ error: 'room_full' }, 409);
      const [client, server] = Object.values(new WebSocketPair());
      const member = {
        id: crypto.randomUUID(),
        name: grant.name,
        avatar: grant.avatar,
        team: grant.team,
        playerId: grant.playerId,
        resumeKey: grant.resumeKey,
        publishing: false,
        window: Date.now(),
        messages: 0,
      };
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(member);
      this.members.set(server, member);
      this.send(server, {
        type: 'welcome',
        id: member.id,
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
        hasTurn: false,
      });
      this.broadcast();
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: { 'Sec-WebSocket-Protocol': 'palermas-v1' },
      });
    });
  }
  webSocketMessage(ws, raw) {
    const member = this.members.get(ws);
    if (!member) return;
    if (typeof raw !== 'string' || raw.length > 70000) {
      ws.close(1009, 'Mensagem muito grande');
      this.remove(ws);
      return;
    }
    const now = Date.now();
    if (now - member.window > 10000) {
      member.window = now;
      member.messages = 0;
    }
    if (++member.messages > 180) {
      ws.close(1008, 'Muitas mensagens');
      this.remove(ws);
      return;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;
    if (data.type === 'repair') {
      if (now - (member.repairAt || 0) < 5000) return;
      member.repairAt = now;
      ws.serializeAttachment(member);
      const host = [...this.members].find(([, m]) => m.publishing);
      if (host && host[0] !== ws)
        this.send(host[0], { type: 'repair', from: member.id });
      return;
    }
    if (data.type === 'cancel-handoff') {
      member.handoffExpires = 0;
      ws.serializeAttachment(member);
      return;
    }
    if (data.type === 'request-handoff') {
      const host = [...this.members].find(([, m]) => m.publishing);
      if (!host || host[0] === ws) {
        this.send(ws, {
          type: 'error',
          message: 'A transmissão mudou. Tente novamente.',
        });
        return;
      }
      if (now - (member.handoffAt || 0) < 10000) return;
      member.handoffAt = now;
      member.handoffExpires = now + 45000;
      ws.serializeAttachment(member);
      this.send(host[0], {
        type: 'handoff-request',
        from: member.id,
        name: member.name,
      });
      return;
    }
    if (data.type === 'handoff-response') {
      if (!member.publishing || typeof data.to !== 'string') return;
      const target = [...this.members].find(([, m]) => m.id === data.to);
      if (
        !target ||
        target[1].handoffExpires < now ||
        !target[1].handoffExpires
      )
        return;
      target[1].handoffExpires = 0;
      target[0].serializeAttachment(target[1]);
      if (data.accept !== true) {
        this.send(target[0], { type: 'handoff-declined' });
        return;
      }
      member.publishing = false;
      target[1].publishing = true;
      ws.serializeAttachment(member);
      target[0].serializeAttachment(target[1]);
      this.send(ws, { type: 'handoff-complete', publisher: target[1].id });
      this.send(target[0], { type: 'claimed' });
      this.broadcast();
      return;
    }
    if (data.type === 'reaction') {
      if (
        !['⚽', '🔥', '👏', '😂', '😱', '🤡'].includes(data.emoji) ||
        now - (member.reactionAt || 0) < 1000
      )
        return;
      member.reactionAt = now;
      ws.serializeAttachment(member);
      for (const socket of this.members.keys())
        this.send(socket, {
          type: 'reaction',
          emoji: data.emoji,
          from: member.id,
          name: member.name,
        });
      return;
    }
    if (data.type === 'claim') {
      if (
        [...this.members.values()].some(
          (m) => m.publishing && m.id !== member.id,
        )
      ) {
        this.send(ws, {
          type: 'error',
          message: 'Já existe uma transmissão na sala.',
        });
        return;
      }
      member.publishing = true;
      ws.serializeAttachment(member);
      this.send(ws, { type: 'claimed' });
      this.broadcast();
      return;
    }
    if (data.type === 'release') {
      member.publishing = false;
      ws.serializeAttachment(member);
      this.broadcast();
      return;
    }
    if (
      data.type !== 'signal' ||
      typeof data.to !== 'string' ||
      !validSignal(data.payload)
    )
      return;
    const target = [...this.members.entries()].find(
      ([, m]) => m.id === data.to,
    );
    if (!target || target[0] === ws) return;
    const other = target[1];
    const p = data.payload;
    // Only host/viewer links; viewers cannot address each other or impersonate the host.
    if (!member.publishing && !other.publishing) return;
    if (p.type === 'offer' && !member.publishing) return;
    if (p.type === 'answer' && (!other.publishing || member.publishing)) return;
    this.send(target[0], { type: 'signal', from: member.id, payload: p });
    ws.serializeAttachment(member);
  }
  remove(ws) {
    if (this.members.delete(ws)) this.broadcast();
  }
  webSocketClose(ws) {
    this.remove(ws);
  }
  webSocketError(ws) {
    try {
      ws.close(1011, 'Conexão encerrada');
    } catch {}
    this.remove(ws);
  }
}
