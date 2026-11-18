const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(`${__dirname}/dist/game.js`, 'utf8');
const storage = new Map();
const browser = {
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {}
};
vm.runInNewContext(source, { window: browser });

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeGame(seed, onChange) {
  return browser.createStackGame({ random: seeded(seed), onChange });
}

function advance(game, seconds) {
  const count = Math.ceil(seconds / 0.01);
  for (let index = 0; index < count; index += 1) game.advanceTime(seconds / count, false);
}

function waitNear(game, target, tolerance = 0.055) {
  for (let index = 0; index < 550; index += 1) {
    const frame = game.getFrame();
    assert.equal(game.getState().mode, 'playing', 'a bowl should still be available to place');
    if (frame.active && Math.abs(frame.active.x - target(frame)) < tolerance) return frame;
    advance(game, 0.01);
  }
  assert.fail('visible hand path did not reach the chosen position');
}

function placeAt(game, target) {
  const before = waitNear(game, target);
  const previousScore = game.getState().score;
  const releaseX = before.active.x;
  game.drop();
  assert.equal(game.getFrame().active.x, releaseX, 'release samples the visible bowl position');
  advance(game, 0.13);
  assert.equal(game.getState().score, previousScore + 1, 'the selected bowl should land');
  return game.getFrame().bowls.at(-1);
}

function centered(game) {
  return placeAt(game, frame => frame.bowls.at(-1).x);
}

const updates = [];
const game = makeGame(7, update => updates.push(update));
assert.equal(game.getState().mode, 'ready');
let earliestFirstCrossing = Infinity;
let latestFirstCrossing = 0;
const startingSides = new Set();
for (const seed of [1, 7, 41, 99, 271, 1234, 2222, 98765, 777777, 4000000]) {
  const passing = makeGame(seed);
  passing.start();
  const initialSide = Math.sign(passing.getFrame().active.x);
  startingSides.add(initialSide);
  const crossing = waitNear(passing, frame => frame.bowls[0].x);
  earliestFirstCrossing = Math.min(earliestFirstCrossing, crossing.time);
  latestFirstCrossing = Math.max(latestFirstCrossing, crossing.time);
  const initialMotionTilt = crossing.active.tilt;
  advance(passing, crossing.time);
  assert.equal(Math.sign(passing.getFrame().active.x), -initialSide);
  const returned = waitNear(passing, frame => frame.bowls[0].x, 0.07);
  assert.ok(returned.active.tilt * initialMotionTilt < 0);
  passing.destroy();
}
assert.equal(startingSides.size, 2, 'a first bowl can arrive from either side');
assert.ok(earliestFirstCrossing >= 0.55 && latestFirstCrossing <= 0.95);
game.start();
assert.equal(game.getFrame().bowls.length, 1);
assert.ok(Math.abs(game.getFrame().active.x) > 1.28, 'hand starts outside support');
const firstSide = Math.sign(game.getFrame().active.x);
advance(game, 0.2);
assert.ok(Math.abs(game.getFrame().active.x) < Math.abs(firstSide * 2.3));
centered(game);
assert.equal(game.getState().score, 1);
assert.equal(game.getState().perfects, 1);
advance(game, 0.3);
assert.ok(Math.abs(game.getFrame().bowls[1].y - 0.34) < 0.001);

// Skilled play watches the rendered bowl, needs no trim, and remains viable late.
for (let index = 1; index < 22; index += 1) centered(game);
assert.equal(game.getState().score, 22);
assert.equal(game.getState().perfects, 22);
assert.ok(game.getFrame().bowls.every(bowl => bowl.scale === 1));
assert.equal(storage.get('myeonok-arcade-balance-best'), '22');
advance(game, 8);
assert.equal(game.getState().mode, 'playing', 'steady waiting has no timer loss');

// Trim is bounded and eases, so it changes the hand path without teleporting it.
game.start();
const handBeforeTrim = game.getFrame().active.x;
game.setAim(8);
assert.equal(game.getAim(), 0.6);
assert.equal(game.getFrame().active.x, handBeforeTrim);
advance(game, 0.08);
assert.ok(game.getFrame().active.x !== handBeforeTrim);
game.nudgeAim(-0.25);
assert.ok(Math.abs(game.getAim() - 0.35) < 1e-10);
const untrimmed = makeGame(44);
const trimmed = makeGame(44);
untrimmed.start();
trimmed.start();
trimmed.setAim(0.6);
advance(untrimmed, 0.25);
advance(trimmed, 0.25);
const trimShift = trimmed.getFrame().active.x - untrimmed.getFrame().active.x;
assert.ok(trimShift >= 0.22 && trimShift < 0.6, 'a short drag should move the hand perceptibly without teleporting');
untrimmed.destroy();
trimmed.destroy();

// A high edge perch can be counterweighted on later passes, including a small trim.
game.start();
const edge = placeAt(game, frame => frame.bowls.at(-1).x + 0.82);
assert.ok(edge.y > 0.72 && edge.y <= 0.82);
const firstRisk = game.getState().balanceValue;
assert.equal(game.getState().danger, true);
game.setAim(-0.15);
placeAt(game, () => 0);
placeAt(game, () => 0.4);
assert.ok(game.getState().balanceValue < firstRisk);
advance(game, 1.2);
assert.equal(game.getState().mode, 'playing');

// The accumulated spring tilts toward an off-center load on either side.
game.start();
placeAt(game, () => 0.65);
advance(game, 0.45);
const rightLean = game.getState().lean;
game.start();
placeAt(game, () => -0.65);
advance(game, 0.45);
const leftLean = game.getState().lean;
assert.ok(rightLean > 0.03);
assert.ok(leftLean < -0.03);

// A precarious tower hangs at the rim, then its upper chain clears the support,
// falls under gravity, and rests on the tray or counter without penetration.
game.start();
for (let index = 0; index < 4; index += 1) centered(game);
placeAt(game, frame => frame.bowls.at(-1).x + 1.12);
assert.equal(game.getState().mode, 'playing');
advance(game, 0.2);
assert.equal(game.getState().mode, 'playing');
for (let index = 0; index < 500 && game.getState().mode !== 'sliding'; index += 1) advance(game, 0.01);
assert.equal(game.getState().mode, 'sliding');
assert.equal(game.getState().reason, 'slide');
const firstSlide = game.getFrame();
assert.ok(firstSlide.bowls.filter(bowl => bowl.detached).length >= 2);
advance(game, 0.2);
const edgeSlide = game.getFrame();
assert.equal(edgeSlide.focusX, 0);
assert.equal(edgeSlide.focusY, firstSlide.focusY);
assert.ok(Math.abs(edgeSlide.bowls.find(bowl => bowl.detached).x - firstSlide.bowls.find(bowl => bowl.detached).x) > 0.3);
advance(game, 0.4);
assert.ok(game.getFrame().bowls.find(bowl => bowl.detached).y < edgeSlide.bowls.find(bowl => bowl.detached).y - 0.25);
advance(game, 1.7);
assert.equal(game.getState().mode, 'over');
const fallen = game.getFrame().bowls.filter(bowl => bowl.detached);
assert.ok(fallen.some(bowl => Math.abs(bowl.x) > 1.6 && Math.abs(bowl.x) < 4));
for (const bowl of fallen) {
  const lowest = Math.min(...[[0, 0.025], [0.4, 0.025], [0.67, 0.13], [0.96, 0.43], [1.22, 0.78]]
    .map(([radius, height]) => height * Math.cos(bowl.tilt) - radius * Math.abs(Math.sin(bowl.tilt))));
  const surface = Math.abs(bowl.x) <= 1.6 ? -0.018 : -0.205;
  assert.ok(bowl.y + lowest >= surface - 0.001);
}

// Rapid taps are real drops, including the first one outside the rim.
game.start();
game.drop();
assert.equal(game.getState().mode, 'falling');
advance(game, 0.13);
assert.equal(game.getState().mode, 'sliding');
assert.equal(game.getState().reason, 'miss');
assert.ok(game.getFrame().active.missed);
advance(game, 0.8);
assert.equal(game.getState().mode, 'over');

game.start();
game.pause();
const pausedAt = game.getFrame().time;
advance(game, 0.7);
assert.equal(game.getFrame().time, pausedAt);
game.resume();
advance(game, 0.1);
assert.ok(game.getFrame().time > pausedAt);
game.start();
assert.equal(game.getState().score, 0);
assert.equal(game.getState().best, 22);
game.destroy();

// Both new players and established towers fail early when taps are spammed.
let largestMixedGain = 0;
for (const seed of [1, 7, 41, 99, 1234]) {
  for (const interval of [0.05, 0.08, 0.12, 0.16, 0.22]) {
    for (const trim of [-0.3, 0, 0.3]) {
      const spam = makeGame(seed);
      spam.start();
      spam.setAim(trim);
      let elapsed = 0;
      for (let tap = 0; tap < 80 && !['sliding', 'over'].includes(spam.getState().mode); tap += 1) {
        advance(spam, interval);
        elapsed += interval;
        if (['sliding', 'over'].includes(spam.getState().mode)) break;
        spam.drop();
      }
      assert.ok(['sliding', 'over'].includes(spam.getState().mode), 'spam run should reach a real failure');
      assert.equal(spam.getState().reason, 'miss');
      assert.equal(spam.getState().score, 0);
      assert.ok(elapsed < 2);
      spam.destroy();
    }
    const mixed = makeGame(seed);
    mixed.start();
    for (let layer = 0; layer < 3; layer += 1) centered(mixed);
    const scoreBeforeSpam = mixed.getState().score;
    for (let tap = 0; tap < 80 && !['sliding', 'over'].includes(mixed.getState().mode); tap += 1) {
      advance(mixed, interval);
      if (['sliding', 'over'].includes(mixed.getState().mode)) break;
      if (tap % 3 === 0) mixed.nudgeAim(tap % 2 ? -0.12 : 0.12);
      mixed.drop();
    }
    assert.ok(['sliding', 'over'].includes(mixed.getState().mode), 'mixed run should reach a real failure');
    assert.ok(mixed.getState().score <= scoreBeforeSpam + 2, 'mixed keyboard/tap spam should fail early');
    largestMixedGain = Math.max(largestMixedGain, mixed.getState().score - scoreBeforeSpam);
    mixed.destroy();
  }
}

let largestBlindScore = 0;
for (const seed of [1, 7, 41, 99, 271]) {
  for (const interval of [0.8, 1, 1.2]) {
    const blind = makeGame(seed);
    blind.start();
    for (let tap = 0; tap < 30 && !['sliding', 'over'].includes(blind.getState().mode); tap += 1) {
      advance(blind, interval);
      if (['sliding', 'over'].includes(blind.getState().mode)) break;
      blind.drop();
    }
    assert.ok(['sliding', 'over'].includes(blind.getState().mode));
    assert.ok(blind.getState().score <= 8);
    largestBlindScore = Math.max(largestBlindScore, blind.getState().score);
    blind.destroy();
  }
}

storage.delete('myeonok-arcade-balance-best');
storage.set('myeonok-arcade-stack-best', '31');
storage.set('myeonok-arcade-best', '29');
const legacy = makeGame(1);
assert.equal(legacy.getState().best, 31);
legacy.destroy();

assert.ok(updates.some(update => update.balance === 'critical'));
assert.ok(updates.some(update => update.reason === 'slide'));
console.log(`Visual tracking and physics passed. First crossing ${earliestFirstCrossing.toFixed(2)}–${latestFirstCrossing.toFixed(2)}s, fast spam max 0, mixed added at most ${largestMixedGain}, blind cadence max ${largestBlindScore}.`);
