import { json, privateHeaders } from '../../http/responses.mjs';
import { signalingEndpoint } from '../../config/signaling.mjs';
export async function joinRoom(request, env, fetcher) {
  const url = new URL(request.url);

  const raw = await request.text();
  if (raw.length > 2048) return json({ error: 'too_large' }, 413);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const name =
    typeof data.name === 'string' ? data.name.trim().slice(0, 24) : '';
  if (!name) return json({ error: 'invalid_name' }, 400);
  const remote = await fetcher(signalingEndpoint(env) + '/join', {
    method: 'POST',
    headers: { Origin: url.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      playerToken:
        typeof data.playerToken === 'string'
          ? data.playerToken.slice(0, 100)
          : undefined,
      resumeToken:
        typeof data.resumeToken === 'string'
          ? data.resumeToken.slice(0, 100)
          : undefined,
      code: env.ROOM_CODE,
    }),
  });
  return new Response(await remote.text(), {
    status: remote.status,
    headers: { ...privateHeaders, 'Content-Type': 'application/json' },
  });
}
