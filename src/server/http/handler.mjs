import { json } from './responses.mjs';
import { assetResponse } from './assets.mjs';
import { loginPage } from './pages.mjs';
import { authorized, cookie } from '../auth/session.mjs';
import { login } from '../auth/login.mjs';
import { groupAPI } from '../features/group/proxy.mjs';
import { joinRoom } from '../features/room/join.mjs';
import { footballRoute } from '../features/football/routes.mjs';
import { signalingEndpoint } from '../config/signaling.mjs';
export async function handleSite(request, env, assets, fetcher = fetch) {
  if (!env.SITE_PASSWORD || !env.ROOM_CODE)
    return json({ error: 'site_not_configured' }, 503);
  const url = new URL(request.url),
    path = url.pathname;
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin)
      return json({ error: 'origin_denied' }, 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json'))
      return json({ error: 'invalid_type' }, 415);
    if (path === '/api/login') return login(request, env);
    if (!(await authorized(request, env)))
      return json({ error: 'unauthorized' }, 401);
    if (path.startsWith('/api/group/')) {
      const r = await groupAPI(request, env, fetcher);
      return json(r.body, r.status);
    }
    if (path === '/api/logout')
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
    if (path === '/api/room/join') return joinRoom(request, env, fetcher);
    return json({ error: 'not_found' }, 404);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json({ error: 'method_not_allowed' }, 405);
  const signedIn = await authorized(request, env);
  if (path === '/sw.js' && assets['sw.js'])
    return assetResponse(request, assets['sw.js'], {
      'Service-Worker-Allowed': '/',
    });
  if (['/assets/login.js', '/assets/login-styles.css'].includes(path)) {
    const asset = assets[path.slice(1)];
    if (!asset) return json({ error: 'not_found' }, 404);
    return assetResponse(request, asset);
  }
  if (path === '/api/session')
    return json({ authenticated: signedIn }, signedIn ? 200 : 401);
  if (!signedIn) {
    if (path === '/' || path === '/index.html') return loginPage(assets);
    return json({ error: 'unauthorized' }, 401);
  }
  if (path.startsWith('/api/group/')) {
    const r = await groupAPI(request, env, fetcher);
    return json(r.body, r.status);
  }
  if (path.startsWith('/api/football/'))
    return footballRoute(url, env, fetcher);
  if (path === '/room-config.json')
    return json({ signalingUrl: signalingEndpoint(env) });
  if (path === '/login.html') return json({ error: 'not_found' }, 404);
  const name = path === '/' ? 'index.html' : path.slice(1);
  const asset = assets[name];
  if (!asset) return json({ error: 'not_found' }, 404);
  return assetResponse(request, asset);
}
