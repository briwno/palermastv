import { b64, unb64 } from './encoding.mjs';
const enc = new TextEncoder();
const COOKIE = 'palermas_session';
export const MAX_AGE = 7 * 24 * 60 * 60;
async function key(env) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(env.ROOM_CODE + '|site-login|' + env.SITE_PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function session(env) {
  const value = b64(
    enc.encode(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + MAX_AGE,
        nonce: crypto.randomUUID(),
      }),
    ),
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    await key(env),
    enc.encode(value),
  );
  return value + '.' + b64(new Uint8Array(sig));
}
export async function authorized(request, env) {
  const value = request.headers
    .get('Cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
  if (!value || value.length > 700) return false;
  try {
    const [data, sig, ...rest] = value.split('.');
    if (
      rest.length ||
      !(await crypto.subtle.verify(
        'HMAC',
        await key(env),
        unb64(sig),
        enc.encode(data),
      ))
    )
      return false;
    return (
      JSON.parse(new TextDecoder().decode(unb64(data))).exp >
      Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
export const cookie = (value, age) =>
  `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
