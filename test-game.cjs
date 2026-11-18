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

const updates = [];
const game = browser.createStackGame({ onChange: value => updates.push(value) });

function advance(seconds) {
  const count = Math.ceil(seconds / 0.02);
  for (let i = 0; i < count; i += 1) game.advanceTime(seconds / count);
}

function waitForActive() {
  for (let i = 0; i < 100 && !game.getFrame().active; i += 1) advance(0.02);
  assert.ok(game.getFrame().active);
}

function alignAndDrop() {
  waitForActive();
  const initial = game.getFrame();
  const axis = initial.active.axis;
  const top = initial.bowls[initial.bowls.length - 1];
  for (let i = 0; i < 300; i += 1) {
    const frame = game.getFrame();
    if (Math.abs(frame.active[axis] - top[axis]) < 0.025) break;
    advance(0.005);
  }
  assert.ok(Math.abs(game.getFrame().active[axis] - top[axis]) < 0.025);
  game.drop();
  advance(0.3);
}

assert.equal(game.getState().mode, 'ready');
game.start();
assert.equal(game.getFrame().bowls.length, 1);
assert.equal(game.getFrame().active.axis, 'x');

alignAndDrop();
assert.equal(game.getState().score, 1);
assert.equal(game.getState().lastResult, 'perfect');
assert.equal(game.getFrame().bowls[1].scale, 1);
waitForActive();
assert.equal(game.getFrame().active.axis, 'z');

// Both axes work through twenty bowls without an arbitrary game limit.
for (let i = 1; i < 20; i += 1) alignAndDrop();
assert.equal(game.getState().score, 20);
assert.equal(game.getState().best, 20);
assert.equal(game.getState().perfects, 20);
assert.equal(storage.get('myeonok-arcade-stack-best'), '20');

// A partial overlap lands with a smaller, whole bowl and retains its offset.
game.start();
advance(0.72);
const releaseX = game.getFrame().active.x;
game.drop();
advance(0.1);
assert.equal(game.getState().score, 1);
assert.equal(game.getState().lastResult, 'good');
assert.equal(game.getFrame().bowls[1].scale, 1);
assert.ok(Math.abs(game.getFrame().bowls[1].x - releaseX) < 0.1);
advance(0.2);
assert.notEqual(game.getFrame().bowls[1].x, 0);
assert.ok(Math.abs(game.getFrame().bowls[1].x) < Math.abs(releaseX));
waitForActive();
const reducedSize = game.getFrame().active.scale;
assert.ok(reducedSize < 1 && reducedSize >= 0.28);
for (let i = 0; i < 3; i += 1) alignAndDrop();
waitForActive();
assert.ok(game.getFrame().active.scale > reducedSize);
assert.ok(game.getFrame().active.scale <= 1);

// Dropping with no support shows a falling bowl, then ends the run.
game.start();
game.drop();
advance(0.23);
assert.equal(game.getState().mode, 'falling');
assert.equal(game.getState().lastResult, 'miss');
assert.equal(game.getFrame().active.missed, true);
advance(0.45);
assert.equal(game.getState().mode, 'over');
assert.equal(game.getState().reason, 'miss');

// Pause freezes motion, replay resets the run, and the record persists.
game.start();
game.pause();
const before = game.getFrame().active.x;
advance(0.8);
assert.equal(game.getFrame().active.x, before);
game.resume();
advance(0.1);
assert.notEqual(game.getFrame().active.x, before);
game.start();
assert.equal(game.getState().score, 0);
assert.equal(game.getState().best, 20);
game.destroy();

assert.ok(updates.some(update => update.lastResult === 'perfect'));
assert.ok(updates.some(update => update.lastResult === 'miss'));
console.log('Alternating axes, 20 bowls, overlap, fall, pause, replay, and record passed.');
