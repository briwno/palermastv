import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lossAdvice,
  connectionLabel,
  preferVideoCodecs,
  qualityProfiles,
} from '../../src/client/features/room/stream-health.mjs';
import {
  sameTeams,
  normalizeRatings,
  playerRatings,
} from '../../src/server/features/match/ratings.mjs';
import { PalermasP2P } from '../../src/client/features/room/peer-connection.js';
import { tacticalLines } from '../../src/client/features/match/formation.js';

test('signaling forwards chat and match updates without creating media peers', async () => {
  const c = new PalermasP2P('https://signal.example');
  const received = [];
  for (const type of ['chat-message', 'room-game-update'])
    c.addEventListener(type, (event) => received.push(event.detail));
  const message = { type: 'chat-message', message: { id: '1', text: 'Gol!' } };
  const game = { type: 'room-game-update', game: null };
  await c.handle(message);
  await c.handle(game);
  assert.deepEqual(received, [message, game]);
  assert.equal(c.peers.size, 0);
});

test('heartbeat gives suspended tabs a fresh pong opportunity but closes an unresponsive socket', () => {
  const c = new PalermasP2P('https://signal.example');
  let closed = 0;
  c.socket = { close: () => closed++ };
  c.lastPong = c.lastHeartbeat = 1000;
  c.heartbeat(121000);
  assert.equal(closed, 0);
  assert.equal(c.lastPong, 121000);
  for (const now of [141000, 161000, 181000]) c.heartbeat(now);
  assert.equal(closed, 0);
  c.heartbeat(201000);
  assert.equal(closed, 1);
});

test('connected media with no new frames is reported as stalled and clears when frames resume', async () => {
  const c = new PalermasP2P('https://signal.example');
  c.closed = false;
  let timestamp = 0,
    frames = 10,
    samples;
  c.addEventListener('stats', (event) => (samples = event.detail));
  c.peers.set('host', {
    pc: {
      connectionState: 'connected',
      getStats: async () =>
        new Map([
          [
            'video',
            {
              type: 'inbound-rtp',
              kind: 'video',
              timestamp: (timestamp += 5000),
              framesDecoded: frames,
              bytesReceived: 100,
              packetsReceived: 100,
              freezeCount: 2,
              totalFreezesDuration: 4,
            },
          ],
        ]),
    },
  });
  await c.collectStats();
  await c.collectStats();
  assert.equal(samples[0].stalled, false);
  await c.collectStats();
  assert.equal(samples[0].stalled, true);
  assert.equal(samples[0].freezes, 2);
  frames++;
  await c.collectStats();
  assert.equal(samples[0].stalled, false);
});
test('persistent packet loss suggests lower quality only after three consecutive samples', () => {
  let state = null;
  for (let i = 0; i < 2; i++) {
    state = lossAdvice(state, { state: 'connected', loss: 0.12 });
    assert.equal(state.active, false);
  }
  state = lossAdvice(state, { state: 'connected', loss: 0.12 });
  assert.equal(state.active, true);
  for (let i = 0; i < 5; i++) {
    state = lossAdvice(state, { state: 'connected', loss: 0 });
    assert.equal(state.active, true);
  }
  state = lossAdvice(state, { state: 'connected', loss: 0 });
  assert.equal(state.active, false);
  assert.equal(
    connectionLabel({ state: 'connected', loss: null, rtt: null }),
    'Medindo',
  );
  assert.equal(qualityProfiles.auto, undefined);
  assert.equal(qualityProfiles.high.frameRate, 30);
});
test('isolated loss, missing stats and disconnected peers do not trigger stale suggestions', () => {
  let state = lossAdvice(null, { state: 'connected', loss: 0.2 });
  state = lossAdvice(state, { state: 'connected', loss: null });
  state = lossAdvice(state, { state: 'connected', loss: 0.2 });
  assert.equal(state.active, false);
  state = lossAdvice(
    { bad: 4, active: true },
    { state: 'disconnected', loss: 0.2 },
  );
  assert.equal(state.active, false);
});
test('stats suggest a reduction without applying any automatic sender change', async () => {
  const c = new PalermasP2P('https://signal.example');
  c.closed = false;
  c.bitrate = 12000000;
  c.stream = {};
  let i = 0,
    changes = 0,
    samples;
  c.addEventListener('stats', (e) => (samples = e.detail));
  c.peers.set('viewer', {
    pc: {
      connectionState: 'connected',
      getStats: async () => {
        i++;
        return new Map([
          [
            'v',
            {
              type: 'outbound-rtp',
              kind: 'video',
              remoteId: 'r',
              timestamp: i * 5000,
              packetsSent: i * 1000,
              bytesSent: i * 100000,
              frameWidth: 1920,
              frameHeight: 1080,
            },
          ],
          ['r', { packetsLost: i * 100 }],
          ['t', { type: 'transport', selectedCandidatePairId: 'p' }],
          ['p', { currentRoundTripTime: 0.1 }],
        ]);
      },
      getSenders: () => [
        { track: { kind: 'video' }, setParameters: () => changes++ },
      ],
    },
  });
  for (let n = 0; n < 5; n++) await c.collectStats();
  assert.equal(samples[0].suggestLower, true);
  assert.equal(samples[0].scale, 1);
  assert.equal(samples[0].cap, 12000000);
  assert.equal(c.bitrate, 12000000);
  assert.equal(changes, 0);
});
test('codec preference retains every codec as fallback', () => {
  const codecs = [
      { mimeType: 'video/AV1' },
      { mimeType: 'video/VP8' },
      { mimeType: 'video/H264' },
      { mimeType: 'video/rtx' },
    ],
    sorted = preferVideoCodecs(codecs);
  assert.equal(sorted[0].mimeType, 'video/H264');
  assert.equal(sorted[1].mimeType, 'video/VP8');
  assert.equal(sorted.length, codecs.length);
  assert.equal(codecs[0].mimeType, 'video/AV1');
});
test('video sender receives full resolution and parameters are reapplied after answer', async () => {
  const c = new PalermasP2P('https://signal.example');
  c.bitrate = 12000000;
  const calls = [];
  c.peers.set('viewer', {
    pc: {
      signalingState: 'have-local-offer',
      setRemoteDescription: async () => {},
      addIceCandidate: async () => {},
      getSenders: () => [
        {
          track: { kind: 'video', getSettings: () => ({ frameRate: 30 }) },
          getParameters: () => ({ encodings: [{}] }),
          setParameters: async (p) => calls.push(p),
        },
      ],
    },
    candidates: [],
  });
  await c.handle({
    type: 'signal',
    from: 'viewer',
    payload: { type: 'answer', sdp: 'test' },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].encodings[0].maxBitrate, 12000000);
  assert.equal(calls[0].encodings[0].scaleResolutionDownBy, 1);
  assert.equal(calls[0].degradationPreference, 'maintain-resolution');
});
test('network cleanup preserves screen permission and explicit leave stops captured tracks', () => {
  const c = new PalermasP2P('https://signal.example');
  let stopped = 0;
  c.stream = { getTracks: () => [{ stop: () => stopped++ }] };
  c.cleanup(false);
  assert.equal(stopped, 0);
  assert.ok(c.stream);
  c.leave();
  assert.equal(stopped, 1);
  assert.equal(c.stream, null);
});
test('professional ratings preserve missing ratings and require exact fixture teams and time', () => {
  const teams = normalizeRatings([
    {
      team: { name: 'Casa' },
      players: [
        { player: { name: 'A' }, statistics: [{ games: { rating: null } }] },
        {
          player: { name: 'B' },
          statistics: [{ games: { rating: '7.4', minutes: 90 } }],
        },
      ],
    },
  ]);
  assert.equal(teams[0].players.length, 1);
  assert.equal(teams[0].players[0].rating, 7.4);
  const game = {
    home: { name: 'Athletico-PR' },
    away: { name: 'Coritiba' },
    date: '2026-10-18T20:00:00Z',
  };
  const fixture = {
    teams: {
      home: { name: 'Athletico Paranaense' },
      away: { name: 'Coritiba' },
    },
    fixture: { date: game.date },
  };
  assert.equal(sameTeams(fixture, game), true);
  assert.equal(
    sameTeams({ ...fixture, fixture: { date: '2026-10-18T22:00:00Z' } }, game),
    false,
  );
  assert.equal(
    sameTeams(
      {
        ...fixture,
        teams: { home: { name: 'Coritiba' }, away: { name: 'Athletico-PR' } },
      },
      game,
    ),
    false,
  );
});
test('ratings without a configured key do not contact third parties', async () => {
  const d = await playerRatings('bra.1', '1', {}, () => {
    throw Error('must not call');
  });
  assert.equal(d.state, 'unconfigured');
  assert.deepEqual(d.teams, []);
});
test('three center backs and wing midfielders occupy the correct lines in 3-4-2-1', () => {
  const roles = [
    'Goalkeeper',
    'Center Defender',
    'Center Left Defender',
    'Center Right Defender',
    'Center Left Midfielder',
    'Center Right Midfielder',
    'Left Midfielder',
    'Right Midfielder',
    'Forward',
    'Center Left Forward',
    'Center Right Forward',
  ];
  const l = tacticalLines({
    formation: '3-4-2-1',
    players: roles.map((positionCode, i) => ({
      starter: true,
      name: String(i),
      positionCode,
    })),
  });
  assert.deepEqual(
    l.map((row) => row.length),
    [1, 3, 4, 2, 1],
  );
  assert.ok(l[1].every((p) => p.positionCode.includes('Defender')));
  assert.ok(l[2].every((p) => p.positionCode.includes('Midfielder')));
  assert.equal(l[4][0].positionCode, 'Forward');
  assert.equal(tacticalLines({ formation: '4-3-3', players: [] }), null);
});
test('a denied season returns an explicit restriction without fetching paid player data', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('espn.com'))
      return Response.json({
        header: {
          id: '678990123',
          competitions: [
            {
              date: '2026-10-17T22:30:00Z',
              status: { type: { state: 'post' } },
              competitors: [
                {
                  homeAway: 'home',
                  team: { id: '3458', displayName: 'Athletico-PR' },
                  score: '0',
                },
                {
                  homeAway: 'away',
                  team: { id: '2029', displayName: 'Palmeiras' },
                  score: '2',
                },
              ],
            },
          ],
        },
      });
    return Response.json({
      errors: { plan: 'Free plans do not have access to this season' },
      response: [],
    });
  };
  const d = await playerRatings(
    'bra.1',
    '678990123',
    { API_FOOTBALL_KEY: 'test-secret-only' },
    fetcher,
  );
  assert.equal(d.state, 'restricted');
  assert.ok(!JSON.stringify(d).includes('test-secret-only'));
  assert.equal(calls.filter((c) => c.url.includes('api-sports')).length, 1);
  assert.ok(!calls.some((c) => c.url.includes('/fixtures/players')));
});
