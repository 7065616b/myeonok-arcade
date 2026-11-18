const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const RAPIER = require('./dist/vendor/rapier.js');

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function countersteer(game) {
  const tray = game.getFrame().tray;
  return Math.max(-1, Math.min(1, -4 * tray.tilt - 1.7 * tray.angularVelocity));
}

function digitalPulseController() {
  let remaining = 0;
  let direction = 0;
  return game => {
    const tray = game.getFrame().tray;
    if (remaining <= 0 && Math.abs(tray.tilt) > 0.08
        && Math.sign(tray.tilt) === Math.sign(tray.angularVelocity)) {
      remaining = 0.1;
      direction = -Math.sign(tray.tilt);
    }
    const input = remaining > 0 ? direction : 0;
    remaining = Math.max(0, remaining - 0.01);
    return input;
  };
}

function advance(game, seconds, balance) {
  const count = Math.ceil(seconds / 0.01);
  for (let index = 0; index < count; index += 1) {
    if (balance) game.setBalanceInput(balance(game));
    game.advanceTime(seconds / count, false);
  }
}

function waitForVisiblePosition(game, target, tolerance = 0.05, balance) {
  for (let index = 0; index < 700; index += 1) {
    const frame = game.getFrame();
    assert.equal(game.getState().mode, 'playing');
    if (frame.active?.held && Math.abs(frame.active.x - target(frame)) < tolerance) return;
    advance(game, 0.01, balance);
  }
  assert.fail('held bowl never reached the visible target');
}

function releaseAndWait(game, expectedScore, balance) {
  const releasedX = game.getFrame().active.x;
  const travelDirection = Math.sign(game.getFrame().active.tilt);
  game.drop();
  assert.equal(game.getState().mode, 'falling');
  assert.ok(Math.abs(game.getFrame().active.x - releasedX) < 0.00001);
  advance(game, 0.04, balance);
  const carriedX = game.getFrame().active.x - releasedX;
  assert.equal(Math.sign(carriedX), travelDirection);
  assert.ok(Math.abs(carriedX) > 0.025, 'released bowl retains a visible portion of hand momentum');
  advance(game, 0.04, balance);
  assert.equal(game.getState().score, expectedScore - 1, 'contact must last before scoring');
  for (let index = 0; index < 400 && game.getState().score < expectedScore
      && !['sliding', 'over'].includes(game.getState().mode); index += 1) {
    advance(game, 0.01, balance);
  }
  assert.equal(game.getState().score, expectedScore);
  assert.equal(game.getState().mode, 'playing');
}

function placeAt(game, x, balance) {
  waitForVisiblePosition(game, () => x, 0.05, balance);
  releaseAndWait(game, game.getState().score + 1, balance);
}

function placeCentered(game, balance) {
  waitForVisiblePosition(game, frame => frame.bowls.at(-1).x, 0.05, balance);
  releaseAndWait(game, game.getState().score + 1, balance);
}

(async () => {
  await RAPIER.init();
  const storage = new Map();
  const browser = {
    RAPIER,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {}
  };
  const context = vm.createContext({ window: browser });
  for (const file of ['physics.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(`${__dirname}/dist/${file}`, 'utf8'), context);
  }
  let latestPhysics;
  const makeGame = (seed, onChange) => browser.createStackGame({
    rapier: RAPIER,
    random: seeded(seed),
    onChange,
    createPhysics(rapier) {
      latestPhysics = browser.createBowlPhysics(rapier);
      return latestPhysics;
    }
  });

  const leftStart = makeGame(1);
  leftStart.start();
  assert.ok(leftStart.getFrame().tray.tilt < 0);
  leftStart.destroy();
  const rightStart = makeGame(1000);
  rightStart.start();
  assert.ok(rightStart.getFrame().tray.tilt > 0);
  rightStart.destroy();

  const neutral = makeGame(7);
  neutral.start();
  let neutralLossTime = 0;
  while (neutralLossTime < 8 && neutral.getState().mode === 'playing') {
    advance(neutral, 0.01);
    neutralLossTime += 0.01;
  }
  assert.equal(neutral.getState().reason, 'slide');
  assert.ok(neutralLossTime > 2 && neutralLossTime < 7);
  assert.ok(!latestPhysics.touchesTray(1) || latestPhysics.touchesFloor(1));
  neutral.destroy();

  const heldRight = makeGame(7);
  heldRight.start();
  heldRight.setBalanceInput(1);
  let heldRightLossTime = 0;
  while (heldRightLossTime < 8 && heldRight.getState().mode === 'playing') {
    advance(heldRight, 0.01);
    heldRightLossTime += 0.01;
  }
  assert.equal(heldRight.getState().reason, 'slide');
  assert.ok(heldRightLossTime < neutralLossTime);
  heldRight.destroy();

  const balanced = makeGame(7);
  balanced.start();
  advance(balanced, 7, countersteer);
  assert.equal(balanced.getState().mode, 'playing');
  assert.ok(Math.abs(balanced.getFrame().tray.tilt) < 0.08);
  assert.ok(latestPhysics.touchesTray(1));
  balanced.destroy();

  const pulsed = makeGame(7);
  const pulseControl = digitalPulseController();
  pulsed.start();
  advance(pulsed, 7, pulseControl);
  assert.equal(pulsed.getState().mode, 'playing');
  assert.ok(Math.abs(pulsed.getFrame().tray.tilt) < 0.14);
  assert.ok(latestPhysics.touchesTray(1));
  for (let layer = 0; layer < 3; layer += 1) placeCentered(pulsed, pulseControl);
  assert.equal(pulsed.getState().score, 3);
  pulsed.destroy();

  const changes = [];
  const game = makeGame(7, update => changes.push(update));
  assert.equal(game.getState().mode, 'ready');
  game.start();
  assert.ok(Math.abs(game.getFrame().active.x) > 1.28);
  const firstCrossing = game.getFrame().time;
  placeCentered(game, countersteer);
  assert.ok(game.getFrame().time - firstCrossing > 0.65);
  assert.equal(game.getState().score, 1);
  assert.ok(latestPhysics.touches(1, 2));
  assert.ok(game.getFrame().bowls[1].y - game.getFrame().bowls[0].y > 0.2);

  // Rapier supports several centered nests with actual, slightly varying poses.
  for (let layer = 1; layer < 5; layer += 1) placeCentered(game, countersteer);
  assert.equal(game.getState().score, 5);
  assert.ok(game.getFrame().bowls.every(bowl => bowl.rotation && bowl.scale === 1));
  const heights = game.getFrame().bowls.map(bowl => bowl.y);
  for (let index = 1; index < heights.length; index += 1) {
    assert.ok(heights[index] - heights[index - 1] > 0.17);
    assert.ok(heights[index] - heights[index - 1] < 0.8);
  }
  assert.equal(storage.get('myeonok-arcade-balance-best'), '5');

  // A weighted edge bowl can be stabilized by the next bowl on the other side.
  game.start();
  placeAt(game, 0.4, countersteer);
  const edgeTilt = Math.abs(game.getFrame().bowls.at(-1).tilt);
  assert.ok(edgeTilt > 0.15);
  placeAt(game, -0.2, countersteer);
  placeAt(game, 0, countersteer);
  advance(game, 1, countersteer);
  assert.equal(game.getState().mode, 'playing');
  assert.ok(Math.abs(game.getFrame().bowls.at(-1).tilt) < edgeTilt);

  // A true miss remains a rigid body and falls onto the real floor/tray.
  game.start();
  game.drop();
  assert.equal(game.getState().mode, 'falling');
  for (let index = 0; index < 500 && !['sliding', 'over'].includes(game.getState().mode); index += 1) {
    advance(game, 0.01);
  }
  assert.equal(game.getState().reason, 'miss');
  assert.equal(game.getState().score, 0);
  const fallingPose = game.getFrame().active;
  advance(game, 1.2);
  assert.ok(game.getFrame().active.y < fallingPose.y);
  assert.ok(game.getFrame().active.rotation);
  for (let index = 0; index < 600 && game.getState().mode !== 'over'; index += 1) advance(game, 0.01);
  assert.equal(game.getState().mode, 'over');
  assert.ok(latestPhysics.touchesFloor(2) || latestPhysics.touchesTray(2));

  game.start();
  game.pause();
  const pausedPose = game.getFrame().bowls[0];
  const pausedAt = game.getFrame().time;
  advance(game, 0.8);
  assert.equal(game.getFrame().time, pausedAt);
  assert.equal(game.getFrame().bowls[0].y, pausedPose.y);
  game.resume();
  advance(game, 0.1);
  assert.ok(game.getFrame().time > pausedAt);
  game.start();
  assert.equal(game.getState().score, 0);
  assert.equal(game.getState().best, 5);
  game.destroy();

  // Rapid taps cannot score the bowl that visibly begins beyond the support.
  let mostFastScore = 0;
  for (const seed of [1, 7, 41]) {
    for (const interval of [0.05, 0.12, 0.22]) {
      const spam = makeGame(seed);
      spam.start();
      for (let tap = 0; tap < 100 && !['sliding', 'over'].includes(spam.getState().mode); tap += 1) {
        advance(spam, interval);
        if (['sliding', 'over'].includes(spam.getState().mode)) break;
        spam.drop();
      }
      assert.ok(['sliding', 'over'].includes(spam.getState().mode));
      mostFastScore = Math.max(mostFastScore, spam.getState().score);
      spam.destroy();
    }
  }
  assert.equal(mostFastScore, 0);

  const mixed = makeGame(7);
  mixed.start();
  for (let layer = 0; layer < 3; layer += 1) placeCentered(mixed, countersteer);
  const beforeSpam = mixed.getState().score;
  for (let tap = 0; tap < 100 && !['sliding', 'over'].includes(mixed.getState().mode); tap += 1) {
    mixed.setBalanceInput(tap % 3 === 0 ? (tap % 2 ? -1 : 1) : 0);
    advance(mixed, 0.12);
    mixed.setBalanceInput(0);
    if (['sliding', 'over'].includes(mixed.getState().mode)) break;
    mixed.drop();
  }
  assert.ok(['sliding', 'over'].includes(mixed.getState().mode));
  assert.ok(mixed.getState().score <= beforeSpam + 1);
  mixed.destroy();

  let largestBlindScore = 0;
  for (const seed of [1, 7, 41]) {
    for (const interval of [0.8, 1, 1.2]) {
      const blind = makeGame(seed);
      blind.start();
      for (let tap = 0; tap < 30 && !['sliding', 'over'].includes(blind.getState().mode); tap += 1) {
        advance(blind, interval);
        if (['sliding', 'over'].includes(blind.getState().mode)) break;
        blind.drop();
      }
      assert.ok(['sliding', 'over'].includes(blind.getState().mode));
      largestBlindScore = Math.max(largestBlindScore, blind.getState().score);
      blind.destroy();
    }
  }
  assert.ok(largestBlindScore < 5);

  let scheduledFrame;
  browser.requestAnimationFrame = callback => {
    scheduledFrame = callback;
    return 1;
  };
  const slowFrame = makeGame(7);
  slowFrame.start();
  scheduledFrame(1000);
  scheduledFrame(2200);
  assert.ok(slowFrame.getFrame().time <= 0.19, 'a stalled frame must preserve the reaction window');
  slowFrame.destroy();

  const playedFrequencies = [];
  browser.AudioContext = class {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.destination = {};
    }
    createOscillator() {
      return {
        frequency: {
          setValueAtTime: value => playedFrequencies.push(value),
          exponentialRampToValueAtTime() {}
        },
        connect() {}, start() {}, stop() {}
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}
      };
    }
    close() {}
  };
  const sounding = makeGame(7);
  sounding.start();
  waitForVisiblePosition(sounding, frame => frame.bowls[0].x, 0.05, countersteer);
  const beforeReleaseNotes = playedFrequencies.length;
  sounding.drop();
  assert.equal(playedFrequencies.length, beforeReleaseNotes, 'release is silent until physical contact');
  for (let index = 0; index < 250 && sounding.getState().score === 0; index += 1) {
    advance(sounding, 0.01, countersteer);
  }
  assert.equal(sounding.getState().score, 1);
  assert.equal(playedFrequencies.filter(value => value === 870).length, 1);
  assert.ok(playedFrequencies.some(value => value >= 690 && value < 750));
  sounding.setSound(false);
  const mutedCount = playedFrequencies.length;
  sounding.start();
  waitForVisiblePosition(sounding, frame => frame.bowls[0].x, 0.05, countersteer);
  sounding.drop();
  advance(sounding, 1, countersteer);
  assert.equal(playedFrequencies.length, mutedCount);
  sounding.destroy();

  storage.delete('myeonok-arcade-balance-best');
  storage.set('myeonok-arcade-stack-best', '31');
  storage.set('myeonok-arcade-best', '29');
  const legacy = makeGame(1);
  assert.equal(legacy.getState().best, 31);
  legacy.destroy();

  assert.ok(changes.some(update => update.lastResult === 'good'));
  assert.ok(changes.some(update => update.reason === 'miss'));
  console.log(`Real Rapier checks passed. Mirrored starts; neutral loss ${neutralLossTime.toFixed(2)}s, held-right loss ${heldRightLossTime.toFixed(2)}s, skilled tray survives 7s, blind max ${largestBlindScore}; contact sound and slow frame verified.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
