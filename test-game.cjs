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

function advance(game, seconds) {
  const count = Math.ceil(seconds / 0.01);
  for (let index = 0; index < count; index += 1) {
    game.advanceTime(seconds / count, false);
  }
}

function waitForVisiblePosition(game, target, tolerance = 0.05) {
  for (let index = 0; index < 700; index += 1) {
    const frame = game.getFrame();
    assert.equal(game.getState().mode, 'playing');
    if (frame.active?.held && Math.abs(frame.active.x - target(frame)) < tolerance) return;
    advance(game, 0.01);
  }
  assert.fail('held bowl never reached the visible target');
}

function releaseAndWait(game, expectedScore) {
  const releasedX = game.getFrame().active.x;
  const travelDirection = Math.sign(game.getFrame().active.tilt);
  game.drop();
  assert.equal(game.getState().mode, 'falling');
  assert.ok(Math.abs(game.getFrame().active.x - releasedX) < 0.00001);
  advance(game, 0.04);
  const carriedX = game.getFrame().active.x - releasedX;
  assert.equal(Math.sign(carriedX), travelDirection);
  assert.ok(Math.abs(carriedX) > 0.025, 'released bowl retains a visible portion of hand momentum');
  advance(game, 0.04);
  assert.equal(game.getState().score, expectedScore - 1, 'contact must last before scoring');
  for (let index = 0; index < 400 && game.getState().score < expectedScore
      && !['sliding', 'over'].includes(game.getState().mode); index += 1) {
    advance(game, 0.01);
  }
  assert.equal(game.getState().score, expectedScore);
  assert.equal(game.getState().mode, 'playing');
}

function placeAt(game, x) {
  waitForVisiblePosition(game, () => x, 0.05);
  releaseAndWait(game, game.getState().score + 1);
}

function placeCentered(game) {
  waitForVisiblePosition(game, frame => frame.bowls.at(-1).x, 0.05);
  releaseAndWait(game, game.getState().score + 1);
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

  assert.equal(browser.BOWL_TRAY_Y, -0.15);
  const idle = makeGame(7);
  idle.start();
  const baseAtStart = idle.getFrame().bowls[0];
  advance(idle, 46);
  assert.equal(idle.getState().mode, 'playing');
  assert.equal(idle.getState().score, 0);
  assert.ok(latestPhysics.touchesTray(1));
  assert.ok(Math.abs(idle.getFrame().bowls[0].x - baseAtStart.x) < 0.01);
  assert.ok(Math.abs(idle.getFrame().bowls[0].y - baseAtStart.y) < 0.01);
  assert.ok(Math.abs(idle.getState().lean) < 0.03);
  idle.destroy();

  const tilted = makeGame(7);
  tilted.start();
  advance(tilted, 0.2);
  const naturalTilt = tilted.getFrame().active.tilt;
  tilted.setBowlTiltInput(1);
  advance(tilted, 0.25);
  const rightTilt = tilted.getFrame().active.tilt;
  assert.ok(rightTilt > naturalTilt + 0.08, 'right input tips only the held bowl');
  assert.ok(rightTilt <= 0.24);
  tilted.setBowlTiltInput(-1);
  advance(tilted, 0.3);
  assert.ok(tilted.getFrame().active.tilt < rightTilt - 0.1);
  tilted.setBowlTiltInput(0);
  advance(tilted, 2);
  assert.equal(tilted.getState().mode, 'playing');
  assert.ok(latestPhysics.touchesTray(1));
  assert.ok(Math.abs(tilted.getFrame().bowls[0].tilt) < 0.03);
  tilted.setBowlTiltInput(1);
  advance(tilted, 0.3);
  const visibleReleaseTilt = tilted.getFrame().active.tilt;
  tilted.drop();
  assert.equal(tilted.getState().mode, 'falling');
  assert.ok(Math.abs(tilted.getFrame().active.tilt - visibleReleaseTilt) < 0.001,
    'released rigid body starts at the visibly controlled tilt');
  tilted.setBowlTiltInput(-1);
  assert.ok(Math.abs(tilted.getFrame().active.tilt - visibleReleaseTilt) < 0.001,
    'input after release cannot rotate a falling bowl');
  tilted.destroy();

  const changes = [];
  const game = makeGame(7, update => changes.push(update));
  assert.equal(game.getState().mode, 'ready');
  game.start();
  assert.ok(Math.abs(game.getFrame().active.x) > 1.28);
  const firstCrossing = game.getFrame().time;
  placeCentered(game);
  assert.ok(game.getFrame().time - firstCrossing > 0.65);
  assert.equal(game.getState().score, 1);
  assert.ok(latestPhysics.touches(1, 2));
  assert.ok(game.getFrame().bowls[1].y - game.getFrame().bowls[0].y > 0.2);

  // Rapier supports several centered nests with actual, slightly varying poses.
  for (let layer = 1; layer < 5; layer += 1) placeCentered(game);
  assert.equal(game.getState().score, 5);
  assert.ok(game.getFrame().bowls.every(bowl => bowl.rotation && bowl.scale === 1));
  const heights = game.getFrame().bowls.map(bowl => bowl.y);
  for (let index = 1; index < heights.length; index += 1) {
    assert.ok(heights[index] - heights[index - 1] > 0.17);
    assert.ok(heights[index] - heights[index - 1] < 0.8);
  }
  assert.equal(storage.get('myeonok-arcade-balance-best'), '5');
  advance(game, 8);
  assert.equal(game.getState().mode, 'playing', 'a settled five-bowl stack does not fall from idle time');

  // A weighted edge bowl can be stabilized by the next bowl on the other side.
  game.start();
  placeAt(game, 0.4);
  const edgeTilt = Math.abs(game.getFrame().bowls.at(-1).tilt);
  assert.ok(edgeTilt > 0.15);
  placeAt(game, -0.2);
  placeAt(game, 0);
  advance(game, 1);
  assert.equal(game.getState().mode, 'playing');
  assert.ok(Math.abs(game.getFrame().bowls.at(-1).tilt) < edgeTilt);

  // A true miss remains a rigid body and falls onto the real floor/tray.
  game.start();
  const launchY = game.getFrame().active.y;
  game.drop();
  assert.equal(game.getState().mode, 'falling');
  for (let index = 0; index < 500 && !['sliding', 'over'].includes(game.getState().mode); index += 1) {
    advance(game, 0.01);
  }
  assert.equal(game.getState().reason, 'miss');
  assert.equal(game.getState().score, 0);
  advance(game, 1.2);
  assert.ok(game.getFrame().active.y < launchY - 0.4);
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
  for (let layer = 0; layer < 3; layer += 1) placeCentered(mixed);
  const beforeSpam = mixed.getState().score;
  for (let tap = 0; tap < 100 && !['sliding', 'over'].includes(mixed.getState().mode); tap += 1) {
    mixed.setBowlTiltInput(tap % 3 === 0 ? (tap % 2 ? -1 : 1) : 0);
    advance(mixed, 0.12);
    mixed.setBowlTiltInput(0);
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
  waitForVisiblePosition(sounding, frame => frame.bowls[0].x, 0.05);
  const beforeReleaseNotes = playedFrequencies.length;
  sounding.drop();
  assert.equal(playedFrequencies.length, beforeReleaseNotes, 'release is silent until physical contact');
  for (let index = 0; index < 250 && sounding.getState().score === 0; index += 1) {
    advance(sounding, 0.01);
  }
  assert.equal(sounding.getState().score, 1);
  assert.equal(playedFrequencies.filter(value => value === 870).length, 1);
  assert.ok(playedFrequencies.some(value => value >= 690 && value < 750));
  sounding.setSound(false);
  const mutedCount = playedFrequencies.length;
  sounding.start();
  waitForVisiblePosition(sounding, frame => frame.bowls[0].x, 0.05);
  sounding.drop();
  advance(sounding, 1);
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
  const catchOutcomes = new Set();
  for (const targetX of [-1.2, -0.65, 0, 0.65, 1.2]) {
    for (const input of [-1, 0, 1]) {
      const catchGame = makeGame(7);
      catchGame.start();
      catchGame.setBowlTiltInput(input);
      waitForVisiblePosition(catchGame, () => targetX);
      catchGame.drop();
      advance(catchGame, 4);
      const outcome = catchGame.getState();
      assert.notEqual(outcome.mode, 'falling',
        `edge catch cannot remain unresolved: x=${targetX}, tilt input=${input}`);
      catchOutcomes.add(outcome.score ? 'score' : outcome.reason);
      if (targetX === 0 && input === 0) assert.equal(outcome.score, 1);
      catchGame.destroy();
    }
  }
  assert.ok(catchOutcomes.has('score') && catchOutcomes.has('miss'));

  // Hold-and-latch tilt persists after releasing tilt input and clears on resetBowlTilt.
  const latched = makeGame(7);
  latched.start();
  latched.setBowlTiltInput(1);
  advance(latched, 0.25);
  latched.setBowlTiltInput(0);
  advance(latched, 0.6);
  assert.ok(latched.getState().heldTilt > 0.12 && latched.getFrame().active.tilt > 0.12,
    'latched tilt persists after input release');
  latched.resetBowlTilt();
  advance(latched, 0.05);
  assert.ok(Math.abs(latched.getState().heldTilt) < 0.001 && Math.abs(latched.getFrame().active.tilt) < 0.08,
    'resetBowlTilt clears latched tilt');
  latched.destroy();

  // Flat drop onto a steeply tilted lower bowl resolves cleanly without soft-locking.
  for (const offset of [-0.1, 0, 0.1]) {
    const cross = makeGame(7);
    cross.start();
    placeAt(cross, -0.45);
    assert.ok(Math.abs(cross.getFrame().bowls.at(-1).tilt) > 0.15);
    waitForVisiblePosition(cross, frame => frame.bowls.at(-1).x + offset);
    cross.drop();
    advance(cross, 4);
    assert.notEqual(cross.getState().mode, 'falling',
      `tilted catch cannot remain stuck in falling: offset=${offset}`);
    cross.destroy();
  }

  // Tightened Perfect sweet spot emits align.locked before drop and burst.perfect on settle.
  const crisp = makeGame(7);
  crisp.start();
  waitForVisiblePosition(crisp, () => 0.12, 0.03);
  assert.ok(crisp.getFrame().align?.locked, 'align.locked highlights inside the perfect zone');
  crisp.drop();
  for (let index = 0; index < 400 && crisp.getState().score === 0
      && !['sliding', 'over'].includes(crisp.getState().mode); index += 1) {
    advance(crisp, 0.01);
  }
  assert.equal(crisp.getState().score, 1);
  assert.equal(crisp.getState().lastResult, 'perfect');
  assert.equal(crisp.getState().combo, 1);
  assert.equal(crisp.getFrame().burst?.perfect, true);
  crisp.start();
  placeAt(crisp, 0.4);
  assert.equal(crisp.getState().lastResult, 'good', 'off-center drop remains good rather than perfect');
  crisp.destroy();

  // Centered play sustains 25+ bowls with Pisa tower sway and all 4 chaos gimmicks.
  for (const seed of [1, 7, 19, 41, 99]) {
    const tall = makeGame(seed);
    tall.start();
    const chaosSeen = new Set();
    let maxTilt = 0;
    for (let layer = 0; layer < 25; layer += 1) {
      waitForVisiblePosition(tall, frame => frame.bowls.at(-1).x, 0.05);
      if (layer < 8) assert.equal(tall.getState().chaos, null, `seed ${seed} warm-up layer ${layer} stays chaos-free`);
      if (tall.getState().chaos) chaosSeen.add(tall.getState().chaos.type);
      tall.drop();
      for (let i = 0; i < 400 && tall.getState().score <= layer
          && !['sliding', 'over'].includes(tall.getState().mode); i += 1) {
        advance(tall, 0.01);
      }
      assert.equal(tall.getState().score, layer + 1, `seed ${seed} must score layer ${layer + 1}`);
      maxTilt = Math.max(maxTilt, Math.abs(tall.getState().lean));
    }
    assert.equal(tall.getState().score, 25, `seed ${seed} must reach 25 centered bowls`);
    assert.equal(tall.getState().mode, 'playing');
    assert.equal(chaosSeen.size, 4, `seed ${seed} must exercise all 4 chaos gimmicks`);
    assert.ok(maxTilt >= 0.06, `seed ${seed} develops authentic Pisa sway (${maxTilt.toFixed(2)})`);
    assert.ok(latestPhysics.isLocked(1), 'bottom foundation bowl locks once tower passes keepLive');
    assert.ok(!latestPhysics.isLocked(26), 'top bowl remains dynamic');
    tall.destroy();
  }

  // Planar 2.5D constraint prevents forward/backward pitch and Z-axis bowl jamming.
  for (const x1 of [-0.55, -0.35, 0.35, 0.55]) {
    for (const x2 of [-0.45, 0, 0.45]) {
      const planar = makeGame(7);
      planar.start();
      waitForVisiblePosition(planar, () => x1, 0.05);
      planar.drop();
      advance(planar, 1.2);
      if (planar.getState().mode === 'playing') {
        waitForVisiblePosition(planar, f => f.bowls.at(-1).x + x2, 0.05);
        planar.drop();
        advance(planar, 3.5);
      }
      assert.notEqual(planar.getState().mode, 'falling',
        `planar catch cannot jam in falling: x1=${x1}, x2=${x2}`);
      const pf = planar.getFrame();
      for (const b of pf.active ? pf.bowls.concat(pf.active) : pf.bowls) {
        assert.ok(Math.abs(b.rotation?.x || 0) < 0.01, 'pitch rotation stays locked');
        assert.ok(Math.abs(b.rotation?.y || 0) < 0.01, 'yaw rotation stays locked');
        assert.ok(Math.abs(b.z || 0) < 0.05, 'Z drift stays tightly bounded');
      }
      planar.destroy();
    }
  }

  // Upward pop velocity stays capped across off-center/tilted rim collisions.
  for (const x1 of [-0.85, -0.45, 0.45, 0.85]) {
    for (const tilt of [-1, 0, 1]) {
      const pop = makeGame(7);
      pop.start();
      pop.setBowlTiltInput(tilt);
      waitForVisiblePosition(pop, () => x1, 0.05);
      pop.drop();
      let maxVy = 0;
      for (let i = 0; i < 120; i += 1) {
        advance(pop, 0.01);
        for (const id of [1, 2]) {
          const p = latestPhysics.pose(id);
          if (p) maxVy = Math.max(maxVy, p.vy);
        }
      }
      assert.ok(maxVy <= 0.65, `upward pop must stay capped (got ${maxVy.toFixed(2)} at x1=${x1}, tilt=${tilt})`);
      pop.destroy();
    }
  }

  // Quirky off-center stunts set lastStunt while keeping lastResult='good', and milestone variants attach.
  const stuntGame = makeGame(7);
  stuntGame.start();
  placeAt(stuntGame, 0.45);
  assert.equal(stuntGame.getState().lastResult, 'good');
  placeAt(stuntGame, -0.2);
  assert.equal(stuntGame.getState().lastResult, 'good');
  assert.ok(['save', 'perch', 'zigzag'].includes(stuntGame.getState().lastStunt),
    `expected stunt callout, got ${stuntGame.getState().lastStunt}`);
  stuntGame.start();
  for (let layer = 0; layer < 10; layer += 1) placeCentered(stuntGame);
  const milestoneBowls = stuntGame.getFrame().bowls;
  assert.equal(milestoneBowls[5].variant, 'brass');
  assert.equal(milestoneBowls[7].variant, 'bibim');
  assert.equal(milestoneBowls[10].variant, 'noodle');
  stuntGame.destroy();

  console.log(`Real Rapier checks passed. Fixed tray survives 46s idle; centered score 5, 25-bowl endurance x5 seeds, planar no-pitch/Z-jam, anti-pop <=0.65, quirky stunts/variants, blind max ${largestBlindScore}; held tilt, latch/reset, anti-soft-lock, perfect burst, contact sound and slow frame verified.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
