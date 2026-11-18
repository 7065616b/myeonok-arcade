(function () {
  'use strict';

  const BEST_KEYS = [
    'myeonok-arcade-balance-best',
    'myeonok-arcade-stack-best',
    'myeonok-arcade-best'
  ];
  const SPAWN_CLEARANCE = 0.96;

  function clamp(value, lower, upper) {
    return Math.max(lower, Math.min(upper, value));
  }

  function readBest() {
    try {
      let best = 0;
      for (const key of BEST_KEYS) {
        const raw = window.localStorage.getItem(key);
        if (raw === null) continue;
        const value = Number(raw);
        if (Number.isSafeInteger(value) && value >= 0) best = Math.max(best, value);
      }
      return best;
    } catch (_) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEYS[0], String(value));
    } catch (_) {
      // The game can continue when storage is unavailable.
    }
  }

  function createStackGame(options) {
    const settings = options || {};
    const onChange = typeof settings.onChange === 'function' ? settings.onChange : function () {};
    const onFrame = typeof settings.onFrame === 'function' ? settings.onFrame : function () {};
    const random = typeof settings.random === 'function' ? settings.random : Math.random;
    const rapier = settings.rapier || window.RAPIER;
    const createPhysics = settings.createPhysics || window.createBowlPhysics;
    if (!rapier || typeof createPhysics !== 'function') {
      throw new Error('Rapier physics must be initialized before the game.');
    }

    let physics = null;
    let mode = 'ready';
    let paused = false;
    let hidden = false;
    let destroyed = false;
    let worldSettled = false;
    let score = 0;
    let best = readBest();
    let combo = 0;
    let perfects = 0;
    let lastResult = null;
    let reason = null;
    let time = 0;
    let balanceInput = 0;
    let baseUnsupportedTime = 0;
    let held = null;
    let pendingId = null;
    let dropOffset = 0;
    let supportTime = 0;
    let surfaceTime = 0;
    let unscoreableRestTime = 0;
    let pendingContactPlayed = false;
    let spawnDelay = 0;
    let slideTime = 0;
    let settledTime = 0;
    let frozenFocusY = 0;
    let placedIds = [];
    let unsupportedTime = new Map();
    let lastBalance = 'steady';
    let soundEnabled = true;
    let audioContext = null;
    let frameId = null;
    let lastTimestamp = null;

    function topId() {
      return placedIds[placedIds.length - 1];
    }

    function topPose() {
      return physics.pose(topId());
    }

    function balanceData() {
      if (!physics) {
        return { value: 0, lean: 0, category: 'steady' };
      }
      const tray = physics.trayPose();
      let value = Math.max(Math.abs(tray.tilt) / 0.28, baseUnsupportedTime / 0.35);
      for (let index = 1; index < placedIds.length; index += 1) {
        const upper = physics.pose(placedIds[index]);
        const lower = physics.pose(placedIds[index - 1]);
        const offset = Math.abs(upper.x - lower.x) / 1.05 * 0.6;
        const angle = Math.abs(upper.tilt - tray.tilt) / 0.45 * 0.65;
        const lostContact = (unsupportedTime.get(placedIds[index]) || 0) / 0.42;
        value = Math.max(value, offset, angle, lostContact);
      }
      const category = value >= 0.95 ? 'critical' : value >= 0.65 ? 'warning' : 'steady';
      return { value: value, lean: tray.tilt, category: category };
    }

    function state() {
      const balance = balanceData();
      return {
        mode: mode,
        score: score,
        best: best,
        combo: combo,
        perfects: perfects,
        lastResult: lastResult,
        reason: reason,
        paused: paused,
        lean: balance.lean,
        balance: balance.category,
        balanceValue: balance.value,
        danger: balance.value >= 0.65,
        collapseCharge: Math.max(baseUnsupportedTime, 0, ...unsupportedTime.values()),
        soundEnabled: soundEnabled
      };
    }

    function heldPose() {
      const half = held.tilt * 0.5;
      return {
        x: held.x,
        y: held.y,
        z: 0,
        scale: 1,
        tilt: held.tilt,
        rotation: { x: 0, y: 0, z: -Math.sin(half), w: Math.cos(half) },
        held: true
      };
    }

    function physicalPose(id) {
      const pose = physics.pose(id);
      return {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        scale: 1,
        tilt: pose.tilt,
        rotation: pose.rotation,
        sleeping: pose.sleeping,
        held: false
      };
    }

    function viewFrame() {
      const bowls = physics ? placedIds.map(physicalPose) : [];
      const active = held ? heldPose() : pendingId !== null ? physicalPose(pendingId) : null;
      const highest = bowls.length ? bowls[bowls.length - 1].y : 0;
      const balance = balanceData();
      const tray = physics ? physics.trayPose() : {
        x: 0, y: 0.45, z: 0, tilt: 0, angularVelocity: 0,
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      };
      return {
        mode: mode,
        bowls: bowls,
        active: active,
        tray: tray,
        time: time,
        focusX: 0,
        focusY: mode === 'sliding' || mode === 'over'
          ? frozenFocusY : Math.max(0, highest - 1),
        lean: balance.lean,
        balance: balance.category,
        balanceValue: balance.value,
        danger: balance.value >= 0.65,
        paused: paused
      };
    }

    function notify() {
      lastBalance = balanceData().category;
      onChange(state());
    }

    function paint() {
      onFrame(viewFrame());
    }

    function playNote(frequency, duration, volume) {
      if (!soundEnabled) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioContext = audioContext || new AudioContext();
        if (audioContext.state === 'suspended') audioContext.resume();
        const now = audioContext.currentTime;
        const tone = audioContext.createOscillator();
        const overtone = audioContext.createOscillator();
        const gain = audioContext.createGain();
        tone.type = overtone.type = 'sine';
        tone.frequency.setValueAtTime(frequency, now);
        tone.frequency.exponentialRampToValueAtTime(frequency * 0.8, now + duration);
        overtone.frequency.setValueAtTime(frequency * 2.45, now);
        overtone.frequency.exponentialRampToValueAtTime(frequency * 2.2, now + duration);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.009);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        tone.connect(gain);
        overtone.connect(gain);
        gain.connect(audioContext.destination);
        tone.start(now);
        overtone.start(now);
        tone.stop(now + duration);
        overtone.stop(now + duration);
      } catch (_) {
        // Audio cannot interrupt a run.
      }
    }

    function spawnHeld() {
      const side = random() < 0.5 ? -1 : 1;
      const bound = score === 0
        ? 2 + random() * 0.3
        : Math.min(3.4, 2.25 + random() * (0.7 + Math.min(score, 20) * 0.025));
      held = {
        x: topPose().x + side * bound,
        y: topPose().y + SPAWN_CLEARANCE,
        tilt: 0,
        side: side,
        bound: bound,
        motionTime: 0,
        angularSpeed: score === 0
          ? 1.8 + random() * 0.55
          : 1.25 + random() * 2.5 + Math.min(score, 20) * 0.015,
        phase: random() * Math.PI * 2,
        handVelocity: 0
      };
      spawnDelay = 0;
      lastResult = null;
      notify();
    }

    function moveHeld(dt) {
      held.motionTime += dt;
      const phase = held.motionTime * held.angularSpeed;
      const path = held.side * held.bound * Math.cos(phase);
      const velocity = -held.side * held.bound * held.angularSpeed * Math.sin(phase);
      held.x = topPose().x + path
        + 0.045 * Math.sin(time * 4.1 + held.phase);
      held.y = topPose().y + SPAWN_CLEARANCE;
      held.tilt = clamp(velocity * 0.015, -0.12, 0.12);
      held.handVelocity = velocity;
    }

    function start() {
      if (destroyed) return;
      if (physics) physics.destroy();
      physics = createPhysics(rapier);
      physics.setBalancing(true, random() < 0.5 ? -1 : 1);
      physics.setBalanceInput(0);
      const baseId = physics.spawnBowl({ x: 0, y: 0.48, z: 0 }, { x: 0, y: 0, z: 0 });
      placedIds = [baseId];
      unsupportedTime = new Map();
      baseUnsupportedTime = 0;
      balanceInput = 0;
      for (let index = 0; index < 25; index += 1) physics.step(0.01);
      mode = 'playing';
      paused = false;
      worldSettled = false;
      score = 0;
      combo = 0;
      perfects = 0;
      lastResult = null;
      reason = null;
      time = 0;
      held = null;
      pendingId = null;
      supportTime = 0;
      surfaceTime = 0;
      unscoreableRestTime = 0;
      pendingContactPlayed = false;
      spawnDelay = 0;
      slideTime = 0;
      settledTime = 0;
      lastTimestamp = null;
      spawnHeld();
      paint();
      playNote(450, 0.2, 0.06);
    }

    function setBalanceInput(axis) {
      if (destroyed || !Number.isFinite(axis)) return;
      balanceInput = clamp(axis, -1, 1);
      if (physics && mode !== 'over') physics.setBalanceInput(balanceInput);
    }

    function drop() {
      if (destroyed) return;
      if (mode === 'ready' || mode === 'over') {
        start();
        return;
      }
      if (mode !== 'playing' || paused || hidden || !held) return;
      dropOffset = held.x - topPose().x;
      const half = held.tilt * 0.5;
      const rotation = { x: 0, y: 0, z: -Math.sin(half), w: Math.cos(half) };
      const lateralVelocity = clamp(held.handVelocity * 0.28, -1.4, 1.4);
      pendingId = physics.spawnBowl(
        { x: held.x, y: held.y, z: 0, rotation: rotation },
        { x: lateralVelocity, y: 0, z: 0, angular: { x: 0, y: 0, z: -held.handVelocity * 0.006 } }
      );
      held = null;
      supportTime = 0;
      surfaceTime = 0;
      unscoreableRestTime = 0;
      pendingContactPlayed = false;
      lastResult = null;
      mode = 'falling';
      notify();
    }

    function acceptBowl() {
      const pose = physics.pose(pendingId);
      const support = topPose();
      const perfect = Math.abs(dropOffset) <= 0.12 && Math.abs(pose.x - support.x) <= 0.22;
      placedIds.push(pendingId);
      pendingId = null;
      score += 1;
      combo = perfect ? combo + 1 : 0;
      perfects += perfect ? 1 : 0;
      lastResult = perfect ? 'perfect' : 'good';
      spawnDelay = 0.23;
      mode = 'playing';
      if (score > best) {
        best = score;
        saveBest(best);
      }
      notify();
      playNote(perfect ? 690 + Math.min(combo, 7) * 42 : 510, perfect ? 0.48 : 0.28, 0.08);
    }

    function beginSliding(cause) {
      if (mode === 'sliding' || mode === 'over') return;
      reason = cause;
      lastResult = cause === 'miss' ? 'miss' : lastResult;
      frozenFocusY = Math.max(0, topPose().y - 1);
      mode = 'sliding';
      held = null;
      slideTime = 0;
      settledTime = 0;
      notify();
      playNote(160, 0.48, 0.055);
    }

    function checkPending(dt) {
      const pose = physics.pose(pendingId);
      const top = topPose();
      const touchingTop = physics.touches(pendingId, topId());
      const relativeSpeed = Math.hypot(pose.vx - top.vx, pose.vy - top.vy, pose.vz - top.vz);
      const surfaceContact = physics.touchesTray(pendingId) || physics.touchesFloor(pendingId);
      const nestingHeight = pose.y - top.y;
      if (!pendingContactPlayed && (touchingTop || surfaceContact)) {
        pendingContactPlayed = true;
        playNote(870, 0.09, 0.022);
      }
      if (touchingTop && !surfaceContact && nestingHeight > 0.15 && nestingHeight < 0.82
          && Math.abs(pose.tilt) < 0.62 && relativeSpeed < 0.55) {
        supportTime += dt;
      } else {
        supportTime = Math.max(0, supportTime - dt * 2);
      }
      if (supportTime >= 0.18) {
        acceptBowl();
        return;
      }

      if (surfaceContact) {
        surfaceTime += dt;
      } else {
        surfaceTime = 0;
      }
      const atRest = pose.sleeping
        || (Math.hypot(pose.vx, pose.vy, pose.vz) < 0.08 && pose.angularSpeed < 0.1);
      const plausiblySupported = touchingTop && nestingHeight > 0.1
        && nestingHeight < 0.9 && Math.abs(pose.tilt) < 0.85;
      unscoreableRestTime = atRest && !plausiblySupported
        ? unscoreableRestTime + dt : 0;
      if (surfaceTime >= 0.06 || unscoreableRestTime >= 0.8 || pose.y < top.y - 0.5) {
        beginSliding('miss');
      }
    }

    function checkPlacedSupport(dt) {
      const baseId = placedIds[0];
      const baseSupported = physics.touchesTray(baseId);
      baseUnsupportedTime = baseSupported
        ? Math.max(0, baseUnsupportedTime - dt * 2)
        : baseUnsupportedTime + dt;
      if (physics.touchesFloor(baseId) || baseUnsupportedTime > 0.35) {
        beginSliding('slide');
        return;
      }
      for (let index = 1; index < placedIds.length; index += 1) {
        const upperId = placedIds[index];
        const hasSupport = physics.touches(upperId, placedIds[index - 1]);
        const previous = unsupportedTime.get(upperId) || 0;
        const missing = hasSupport ? Math.max(0, previous - dt * 2) : previous + dt;
        unsupportedTime.set(upperId, missing);
        if (physics.touchesTray(upperId) || physics.touchesFloor(upperId) || missing > 0.42) {
          beginSliding('slide');
          return;
        }
      }
    }

    function movingBodies() {
      const ids = pendingId === null ? placedIds : placedIds.concat(pendingId);
      return ids.some(function (id) {
        const pose = physics.pose(id);
        return Math.hypot(pose.vx, pose.vy, pose.vz) > 0.15 || Math.abs(pose.angularSpeed) > 0.2;
      });
    }

    function checkSliding(dt) {
      slideTime += dt;
      settledTime = movingBodies() ? 0 : settledTime + dt;
      if (slideTime > 1 && (settledTime > 0.45 || slideTime > 6)) {
        mode = 'over';
        worldSettled = false;
        balanceInput = 0;
        physics.setBalanceInput(0);
        notify();
      }
    }

    function step(seconds, shouldPaint) {
      if (destroyed || paused || hidden || mode === 'ready') return;
      const dt = clamp(seconds, 0, 0.05);
      time += dt;
      if (physics && !worldSettled) physics.step(dt);

      if (mode === 'playing' || mode === 'falling') {
        checkPlacedSupport(dt);
        if (mode === 'falling' && pendingId !== null) checkPending(dt);
        if (mode === 'playing') {
          if (held) moveHeld(dt);
          else if (spawnDelay > 0) {
            spawnDelay -= dt;
            if (spawnDelay <= 0) spawnHeld();
          }
        }
        const category = balanceData().category;
        if (category !== lastBalance) notify();
      }
      if ((mode === 'sliding' || mode === 'over') && pendingId !== null && !pendingContactPlayed
          && (physics.touches(pendingId, topId())
            || physics.touchesTray(pendingId) || physics.touchesFloor(pendingId))) {
        pendingContactPlayed = true;
        playNote(870, 0.09, 0.022);
      }
      if (mode === 'sliding') checkSliding(dt);
      if (mode === 'over' && !movingBodies()) {
        settledTime += dt;
        if (settledTime > 0.6) worldSettled = true;
      }
      if (shouldPaint !== false) paint();
    }

    function tick(timestamp) {
      if (destroyed) return;
      const elapsed = lastTimestamp === null ? 0 : clamp((timestamp - lastTimestamp) / 1000, 0, 0.18);
      lastTimestamp = timestamp;
      if (paused || hidden || mode === 'ready' || (mode === 'over' && worldSettled)) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }
      let remaining = elapsed;
      while (remaining > 0) {
        const increment = Math.min(remaining, 0.05);
        step(increment, false);
        remaining -= increment;
      }
      paint();
      frameId = window.requestAnimationFrame(tick);
    }

    function pause() {
      if (destroyed || paused || (mode !== 'playing' && mode !== 'falling' && mode !== 'sliding')) return;
      paused = true;
      balanceInput = 0;
      physics.setBalanceInput(0);
      notify();
      paint();
    }

    function resume() {
      if (destroyed || !paused) return;
      paused = false;
      lastTimestamp = null;
      notify();
      paint();
    }

    function setHidden(value) {
      hidden = Boolean(value);
      if (hidden && physics) {
        balanceInput = 0;
        physics.setBalanceInput(0);
      }
      lastTimestamp = null;
    }

    function setSound(value) {
      soundEnabled = Boolean(value);
      notify();
    }

    function destroy() {
      destroyed = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (audioContext) audioContext.close();
      if (physics) {
        physics.setBalanceInput(0);
        physics.destroy();
      }
    }

    notify();
    paint();
    frameId = window.requestAnimationFrame(tick);

    return {
      start: start,
      drop: drop,
      setBalanceInput: setBalanceInput,
      pause: pause,
      resume: resume,
      setHidden: setHidden,
      setSound: setSound,
      getState: state,
      getFrame: viewFrame,
      advanceTime: step,
      destroy: destroy
    };
  }

  window.createStackGame = createStackGame;
})();
