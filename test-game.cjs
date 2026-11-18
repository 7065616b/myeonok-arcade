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
const game = browser.createStackGame({ onChange: update => updates.push(update) });

function advance(seconds) {
  const count = Math.ceil(seconds / 0.02);
  for (let index = 0; index < count; index += 1) game.advanceTime(seconds / count);
}

function waitForActive() {
  for (let index = 0; index < 50 && !game.getFrame().active; index += 1) advance(0.01);
  assert.ok(game.getFrame().active, 'the next bowl should appear');
}

function placeAtX(x) {
  waitForActive();
  const before = game.getState().score;
  const sway = game.getFrame().active.x - game.getAim();
  game.setAim(x - sway);
  game.drop();
  advance(0.12);
  assert.equal(game.getState().score, before + 1, `bowl at x=${x} should land`);
  return game.getFrame().bowls[game.getFrame().bowls.length - 1];
}

assert.equal(game.getState().mode, 'ready');
game.start();
assert.equal(game.getFrame().bowls.length, 1);
assert.equal(game.getFrame().active.scale, 1);

// Full-size bowls can be stacked at the visible center for a long run.
for (let index = 0; index < 22; index += 1) {
  waitForActive();
  const top = game.getFrame().bowls.at(-1);
  placeAtX(top.x);
}
assert.equal(game.getState().score, 22);
assert.equal(game.getState().perfects, 22);
assert.equal(game.getState().mode, 'playing');
assert.ok(game.getFrame().bowls.every(bowl => bowl.scale === 1));
assert.equal(storage.get('myeonok-arcade-balance-best'), '22');

// Centered bowls nest deeply; an edge-supported bowl perches at the rim.
game.start();
placeAtX(game.getFrame().bowls[0].x);
advance(0.3);
assert.ok(Math.abs(game.getFrame().bowls[1].y - 0.34) < 0.001);
game.start();
const edgeSway = game.getFrame().active.x - game.getAim();
game.setAim(0.65 - edgeSway);
game.drop();
advance(0.02);
const justBeforeContact = game.getFrame().active.y;
assert.ok(justBeforeContact > 0.79);
advance(0.02);
assert.equal(game.getState().score, 1);
const perched = game.getFrame().bowls[1];
assert.ok(perched.y > 0.72 && perched.y <= 0.79);
assert.ok(justBeforeContact - perched.y < 0.14, 'landing should not teleport vertically');
assert.equal(perched.scale, 1);

// Equal-mass counterweights reduce the cumulative support risk.
game.start();
placeAtX(0.82);
const firstRisk = game.getState().balanceValue;
assert.equal(game.getState().danger, true);
placeAtX(0);
placeAtX(0.4);
assert.ok(game.getState().balanceValue < firstRisk);
advance(1.2);
assert.equal(game.getState().mode, 'playing');

// Matching offsets mirror the spring's direction.
game.start();
placeAtX(0.65);
advance(0.45);
const rightLean = game.getState().lean;
game.start();
placeAtX(-0.65);
advance(0.45);
const leftLean = game.getState().lean;
assert.ok(rightLean > 0.03, `right offset should lean right (${rightLean})`);
assert.ok(leftLean < -0.03, `left offset should lean left (${leftLean})`);

// A tall off-center stack hangs briefly, then loses an upper chain.
game.start();
for (let index = 0; index < 4; index += 1) {
  waitForActive();
  placeAtX(game.getFrame().bowls.at(-1).x);
}
placeAtX(1.12);
assert.equal(game.getState().mode, 'playing');
advance(0.2);
assert.equal(game.getState().mode, 'playing');
for (let index = 0; index < 150 && game.getState().mode !== 'sliding'; index += 1) advance(0.02);
assert.equal(game.getState().mode, 'sliding');
assert.equal(game.getState().reason, 'slide');
const firstSlideFrame = game.getFrame();
assert.ok(firstSlideFrame.bowls.filter(bowl => bowl.detached).length >= 2);
const intact = firstSlideFrame.bowls.find(bowl => !bowl.detached);
const flying = firstSlideFrame.bowls.find(bowl => bowl.detached);
advance(0.2);
const edgeFrame = game.getFrame();
const edgeBowl = edgeFrame.bowls.find(bowl => bowl.detached);
assert.equal(edgeFrame.focusX, 0);
assert.equal(edgeFrame.focusY, firstSlideFrame.focusY);
assert.equal(edgeFrame.bowls[0].y, intact.y);
assert.ok(Math.abs(edgeBowl.x - flying.x) > 0.3, 'upper chain should slip sideways before release');
assert.ok(Math.abs(edgeBowl.y - flying.y) < 0.2, 'upper chain should briefly hang at the rim');
advance(0.4);
const freefallBowl = game.getFrame().bowls.find(bowl => bowl.detached);
assert.ok(freefallBowl.y < edgeBowl.y - 0.25, 'gravity should follow the rim slip');
advance(1.6);
assert.equal(game.getState().mode, 'over');
const fallen = game.getFrame().bowls.filter(bowl => bowl.detached);
assert.ok(fallen.some(bowl => Math.abs(bowl.x) > 1.6 && Math.abs(bowl.x) < 4));
for (const bowl of fallen) {
  const lowest = Math.min(...[[0, 0.025], [0.4, 0.025], [0.67, 0.13], [0.96, 0.43], [1.22, 0.78]]
    .map(([radius, height]) => height * Math.cos(bowl.tilt) - radius * Math.abs(Math.sin(bowl.tilt))));
  const surface = Math.abs(bowl.x) <= 1.6 ? -0.018 : -0.205;
  assert.ok(bowl.y + lowest >= surface - 0.001, 'fallen bowl must rest on tray or counter');
}

// A bowl beyond the rim falls without detaching the stack.
game.start();
game.setAim(3);
game.drop();
advance(0.12);
assert.equal(game.getState().mode, 'sliding');
assert.equal(game.getState().reason, 'miss');
assert.equal(game.getFrame().bowls.length, 1);
assert.ok(game.getFrame().active.missed);
advance(0.8);
assert.equal(game.getState().mode, 'over');

game.start();
game.nudgeAim(0.4);
assert.equal(game.getAim(), 0.4);
game.pause();
const pausedFrame = game.getFrame();
advance(0.7);
assert.equal(game.getFrame().time, pausedFrame.time);
game.resume();
advance(0.1);
assert.ok(game.getFrame().time > pausedFrame.time);
game.start();
assert.equal(game.getState().score, 0);
assert.equal(game.getState().best, 22);
game.destroy();

storage.delete('myeonok-arcade-balance-best');
storage.set('myeonok-arcade-stack-best', '31');
storage.set('myeonok-arcade-best', '29');
const legacyGame = browser.createStackGame({});
assert.equal(legacyGame.getState().best, 31);
legacyGame.destroy();

assert.ok(updates.some(update => update.balance === 'critical'));
assert.ok(updates.some(update => update.reason === 'slide'));
const spam = browser.createStackGame({});
spam.start();
for (let index = 0; index < 100 && spam.getState().mode === 'playing'; index += 1) {
  for (let wait = 0; wait < 30 && !spam.getFrame().active; wait += 1) spam.advanceTime(0.02);
  if (!spam.getFrame().active) break;
  spam.setAim(0);
  spam.drop();
  for (let fall = 0; fall < 7; fall += 1) spam.advanceTime(0.02);
}
assert.ok(spam.getState().score < 100, 'repeated center drops should eventually lose balance');
console.log(`Unadjusted center aim ended at ${spam.getState().score} bowls (${spam.getState().reason || spam.getState().mode}).`);
spam.destroy();
console.log('22 bowls, counterweight recovery, mirrored tilt, chain slide, miss, pause, reset, and record passed.');
