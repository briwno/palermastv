import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentLineup,
  goalChange,
} from '../../src/client/features/room/football-live.js';
import { matchPhotoPlayer } from '../../src/server/integrations/player-photos.mjs';

test('live lineup follows repeated substitutions by identity and retains initial lineup', () => {
  const lineup = {
    team: { id: 'a' },
    players: [
      { id: '1', starter: true, positionCode: 'leftMidfielder' },
      { id: '2', starter: false },
      { id: '3', starter: false },
      { id: '4', starter: true, redCards: 1 },
    ],
  };
  const events = [
    {
      type: 'substitution',
      teamId: 'a',
      period: 2,
      seconds: 4000,
      clock: "67'",
      participantIds: ['3', '2'],
    },
    {
      type: 'substitution',
      teamId: 'a',
      period: 2,
      seconds: 3000,
      clock: "50'",
      participantIds: ['2', '1'],
    },
    {
      type: 'substitution',
      teamId: 'b',
      period: 2,
      seconds: 4100,
      participantIds: ['1', '3'],
    },
  ];
  const result = currentLineup(lineup, events);
  assert.deepEqual(
    result.players.filter((p) => p.starter).map((p) => p.id),
    ['3'],
  );
  assert.equal(result.players[2].positionCode, 'leftMidfielder');
  assert.equal(result.players[0].leftAt, "50'");
  assert.equal(currentLineup(lineup, events, true), lineup);
  assert.equal(lineup.players[0].starter, true);
});
test('goal effects ignore initial data, corrections, catch-up scores and other games', () => {
  const g = {
    id: '1',
    leagueId: 'bra.1',
    state: 'in',
    homeScore: 1,
    awayScore: 0,
  };
  assert.equal(goalChange(null, g), null);
  assert.equal(goalChange(g, g), null);
  assert.equal(goalChange(g, { ...g, homeScore: 2 }), 'home');
  assert.equal(goalChange(g, { ...g, awayScore: 1 }), 'away');
  for (const changes of [
    { homeScore: 0 },
    { homeScore: 3 },
    { homeScore: 2, awayScore: 1 },
    { id: '2', homeScore: 2 },
    { state: 'post', homeScore: 2 },
    { homeScore: null },
  ])
    assert.equal(goalChange(g, { ...g, ...changes }), null);
});
test('photo matching requires a unique name and shirt match in the verified team', () => {
  const p = { name: 'Fábio', jersey: '1' };
  const remote = { id: 30441, name: 'Fabio', shirtNumber: 1 };
  assert.equal(matchPhotoPlayer(p, [remote]), remote);
  assert.equal(matchPhotoPlayer(p, [{ ...remote, shirtNumber: 12 }]), null);
  assert.equal(matchPhotoPlayer(p, [{ ...remote, name: 'Fábio Silva' }]), null);
  assert.equal(matchPhotoPlayer(p, [remote, { ...remote, id: 32 }]), null);
});
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

test('room interactions keep chat and video nodes, open cards and celebrate only new goals', async () => {
  const shell = await readFile('src/client/features/room/room.html', 'utf8');
  const dom = new JSDOM(shell, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://palermastv.test/#sala',
  });
  const w = dom.window,
    d = w.document;
  d.querySelector('#page-sala').hidden = false;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const bundle = await build({
    stdin: {
      contents:
        "export * from './src/client/features/room/football-experience.js'",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'Football',
  });
  w.eval(bundle.outputFiles[0].text);
  w.Football.initFootballExperience();
  const game = {
    id: '1',
    leagueId: 'bra.1',
    state: 'in',
    homeScore: 0,
    awayScore: 0,
    home: { id: 'a', name: 'Casa' },
    away: { id: 'b', name: 'Fora' },
  };
  const player = {
    id: 'p',
    name: 'Jogador <teste>',
    jersey: '9',
    starter: true,
    goals: 0,
  };
  const data = {
    game,
    lineups: [{ team: game.home, players: [player] }],
    events: [
      {
        id: 'e',
        type: 'yellow-card',
        label: 'Cartão amarelo',
        clock: "10'",
        participants: [player.name],
        teamId: 'a',
      },
    ],
  };
  const chat = d.querySelector('.room-chat'),
    video = d.querySelector('#local-video');
  w.Football.updateFootballExperience(data);
  assert.equal(d.querySelector('#room-goal-effect').hidden, true);
  d.querySelector('#room-chat-toggle').click();
  assert.ok(chat.classList.contains('chat-drawer-open'));
  d.querySelector('#room-chat-close').click();
  assert.equal(d.querySelector('.room-chat'), chat);
  assert.equal(d.querySelector('#local-video'), video);
  d.querySelector('[data-room-event]').click();
  assert.equal(d.querySelector('dialog').open, true);
  assert.match(
    d.querySelector('#room-football-card-body').textContent,
    /Jogador <teste>/,
  );
  assert.equal(d.querySelector('#room-football-card-body teste'), null);
  d.querySelector('#room-football-card-close').click();
  const button = d.createElement('button');
  button.dataset.roomPlayer = 'a/p';
  d.querySelector('#page-sala').append(button);
  button.click();
  assert.equal(
    d.querySelector('#room-football-card-title').textContent,
    player.name,
  );
  d.querySelector('#room-football-card-close').click();
  w.Football.updateFootballExperience({
    ...data,
    game: { ...game, homeScore: 1 },
  });
  assert.equal(d.querySelector('#room-goal-effect').hidden, false);
  assert.match(d.querySelector('#room-goal-effect').textContent, /GOOOL/);
  d.querySelector('[data-dismiss-goal]').click();
  w.Football.updateFootballExperience({
    ...data,
    game: { ...game, homeScore: 1 },
  });
  assert.equal(d.querySelector('#room-goal-effect').hidden, true);
  w.Football.resetFootballExperience();
  w.Football.updateFootballExperience({
    ...data,
    game: { ...game, homeScore: 3 },
  });
  assert.equal(d.querySelector('#room-goal-effect').hidden, true);
  dom.window.close();
});
