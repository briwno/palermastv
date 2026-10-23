import { privateHeaders } from './responses.mjs';
export function loginPage(assets) {
  return new Response(assets['login.html'].body, {
    headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
