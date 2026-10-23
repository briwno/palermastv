import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const require = createRequire(import.meta.url);
const password = randomUUID();
const server = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    env: {
      ...process.env,
      SITE_PASSWORD: password,
      ROOM_CODE: randomUUID(),
      SIGNALING_URL: 'https://signal.example',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let log = '';
server.stdout.on('data', (data) => {
  log += data;
});
server.stderr.on('data', (data) => {
  log += data;
});
// Next normalizes loopback request URLs to localhost; use the documented local origin.
const origin = `http://localhost:${port}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await setTimeout(100);
  }
  assert.ok(ready, `Production server did not start: ${log}`);
  const login = await fetch(origin);
  assert.match(await login.text(), /Senha do grupo/);
  for (const resource of [
    '/assets/login.js',
    '/assets/login-styles.css',
    '/logo.png',
    '/manifest.webmanifest',
    '/app-icon.svg',
    '/sw.js',
  ]) {
    assert.equal((await fetch(origin + resource)).status, 200, resource);
  }
  for (const resource of [
    '/assets/main.js',
    '/assets/main.css',
    '/api/football/games',
    '/room-config.json',
  ]) {
    assert.equal((await fetch(origin + resource)).status, 401, resource);
  }
  const signedIn = await fetch(origin + '/api/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(signedIn.status, 200, await signedIn.text());
  const headers = { Cookie: signedIn.headers.get('set-cookie').split(';')[0] };
  const page = await fetch(origin, { headers });
  const html = await page.text();
  for (const id of [
    'inicio',
    'jogos',
    'tabelas',
    'clubes',
    'partida',
    'sala',
    'perfil',
  ])
    assert.ok(html.includes(`id="page-${id}"`), id);
  for (const resource of [
    '/assets/main.js',
    '/assets/main.css',
    '/api/session',
    '/room-config.json',
  ]) {
    assert.equal(
      (await fetch(origin + resource, { headers })).status,
      200,
      resource,
    );
  }
  const head = await fetch(origin + '/assets/main.js', {
    method: 'HEAD',
    headers,
  });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  console.log(
    'Production smoke passed: login, protected bundles, seven views, public resources and room configuration.',
  );
} finally {
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await exited;
}
