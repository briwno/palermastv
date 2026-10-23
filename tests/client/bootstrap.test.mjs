import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { renderShell } from '../../scripts/lib/render-shell.mjs';

const bundle = await build({
  entryPoints: ['src/client/main.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
});

for (const route of [
  'inicio',
  'jogos',
  'tabelas',
  'clubes',
  'clubes/noticias',
  'sala',
  'perfil',
  'athletiba',
  'partida/bra.1/123',
]) {
  test(`the modular app starts and navigates from #${route} without globals`, async () => {
    const dom = new JSDOM(await renderShell(), {
      url: `https://palermastv.example/#${route}`,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const { window } = dom;
    const errors = [];
    const requests = [];
    window.addEventListener('error', (event) => {
      errors.push(event.error);
    });
    Object.defineProperty(window, 'crypto', { value: webcrypto });
    window.scrollTo = () => {};
    window.matchMedia = () => ({ matches: false });
    window.RTCPeerConnection = class {};
    window.fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      const checkedAt = new Date().toISOString();
      let body;
      if (url.startsWith('/api/football/games'))
        body = { games: [], checkedAt };
      else if (url.startsWith('/api/football/standings'))
        body = {
          league: { id: 'bra.1', name: 'Série A' },
          groups: [],
          liveGames: [],
          checkedAt,
        };
      else if (
        url.startsWith('/api/football/clubs') ||
        url.startsWith('/api/football/hub')
      )
        body = { clubs: [], checkedAt };
      else if (url.startsWith('/api/group/status'))
        body = { publisher: null, members: [], viewers: 0 };
      else if (url.startsWith('/api/group/lounge'))
        body = { polls: [], posts: [] };
      else if (url.startsWith('/api/group/profile'))
        body = {
          profile: null,
          stats: { predictions: 0, awards: 0, messages: 0 },
        };
      else if (url.startsWith('/api/group/history')) body = { games: [] };
      else if (url.startsWith('/api/group/chat')) body = { messages: [] };
      else if (url.startsWith('/api/group/room-game')) body = { game: null };
      else if (url.startsWith('/api/football/athletiba'))
        body = {
          summary: { cap: 0, coxa: 0, draws: 0, counted: 0 },
          seasons: [2026, 2025, 2024],
          history: [],
          upcoming: [],
          clubs: [],
          checkedAt,
        };
      else if (url.startsWith('/api/football/brasileirao'))
        body = { rounds: [], checkedAt };
      else if (url === '/room-config.json') body = { signalingUrl: null };
      else
        return Response.json(
          { error: 'test_provider_unavailable' },
          { status: 502 },
        );
      return Response.json(body);
    };
    try {
      assert.doesNotThrow(() => window.eval(bundle.outputFiles[0].text));
      // Flush Web Crypto identity and asynchronous feature initialization.
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.deepEqual(errors, []);
      assert.equal(
        window.document.querySelectorAll('.page:not([hidden])').length,
        1,
      );
      const page = route.startsWith('partida/')
        ? 'partida'
        : route === 'athletiba' || route.startsWith('clubes/')
          ? 'clubes'
          : route;
      assert.equal(
        window.document.querySelector(`#page-${page}`).hidden,
        false,
      );
      assert.ok(requests.some((url) => url.startsWith('/api/football/games')));
      assert.equal(window.navigate, undefined);
      assert.equal(window.openMatch, undefined);
      for (const target of [
        'jogos',
        'tabelas',
        'clubes',
        'sala',
        'perfil',
        'inicio',
      ]) {
        window.document.querySelector(`[data-page="${target}"]`).click();
        assert.equal(
          window.document.querySelector(`#page-${target}`).hidden,
          false,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(errors, []);
    } finally {
      window.dispatchEvent(new window.Event('pagehide'));
      window.close();
    }
  });
}
