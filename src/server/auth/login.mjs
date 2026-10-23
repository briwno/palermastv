import { json } from '../http/responses.mjs';
import { equal } from './password.mjs';
import { cookie, session, MAX_AGE } from './session.mjs';
const attempts = new Map();
export async function login(request, env) {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const now = Date.now();
  for (const [k, v] of attempts) if (now - v.start > 60000) attempts.delete(k);
  if (attempts.size > 2000) return json({ error: 'try_later' }, 429);
  const rate = attempts.get(ip) || { start: now, count: 0 };
  if (rate.count >= 8) return json({ error: 'try_later' }, 429);
  rate.count++;
  attempts.set(ip, rate);
  const raw = await request.text();
  if (raw.length > 2048) return json({ error: 'too_large' }, 413);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (
    typeof data.password !== 'string' ||
    !(await equal(data.password, env.SITE_PASSWORD))
  )
    return json({ error: 'wrong_password' }, 401);
  attempts.delete(ip);
  return json({ ok: true }, 200, {
    'Set-Cookie': cookie(await session(env), MAX_AGE),
  });
}
