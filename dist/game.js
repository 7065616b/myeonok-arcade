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
    let bowlTiltInput = 0;
    let heldTiltControl = 0;
    let baseUnsupportedTime = 0;
    let held = null;
    let pendingId = null;
    let dropOffset = 0;
    let pendingTime = 0;
    let supportTime = 0;
    let surfaceTime = 0;
    let unscoreableRestTime = 0;
    let pendingContactPlayed = false;
    let spawnDelay = 0;
    let slideTime = 0;
    let settledTime = 0;
    let frozenFocusX = 0;
    let frozenFocusY = 0;
    let lastBurst = null;
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
      const top = topPose();
      const baseLocked = Boolean(physics.isLocked?.(placedIds[0]));
      let value = Math.max(Math.abs(top.tilt) / 0.42, baseLocked ? 0 : baseUnsupportedTime / 0.35);
      for (let index = 1; index < placedIds.length; index += 1) {
        if (physics.isLocked?.(placedIds[index])) continue;
        const upper = physics.pose(placedIds[index]);
        const lower = physics.pose(placedIds[index - 1]);
        const offset = Math.abs(upper.x - lower.x) / 1.05 * 0.6;
        const angle = Math.abs(upper.tilt) / 0.45 * 0.65;
        const lostContact = (unsupportedTime.get(placedIds[index]) || 0) / 0.42;
        value = Math.max(value, offset, angle, lostContact);
      }
      const category = value >= 0.95 ? 'critical' : value >= 0.65 ? 'warning' : 'steady';
      return { value: value, lean: top.tilt, category: category };
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
        heldTilt: held ? heldTiltControl : 0,
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
      let align = null;
      if (mode === 'playing' && held && placedIds.length) {
        const top = topPose();
        const dx = Math.abs(held.x - top.x);
        const dtilt = Math.abs(held.tilt - top.tilt);
        align = {
          x: top.x,
          y: top.y,
          tilt: top.tilt,
          match: clamp(1 - dx / 0.45, 0, 1),
          locked: dx <= 0.24 && dtilt <= 0.26
        };
      }
      return {
        mode: mode,
        bowls: bowls,
        active: active,
        time: time,
        focusX: mode === 'sliding' || mode === 'over'
          ? frozenFocusX : clamp((bowls.length ? bowls[bowls.length - 1].x : 0) * 0.85, -2.5, 2.5),
        focusY: mode === 'sliding' || mode === 'over'
          ? frozenFocusY : Math.max(0, highest - 1),
        lean: balance.lean,
        balance: balance.category,
        balanceValue: balance.value,
        danger: balance.value >= 0.65,
        heldTilt: held ? heldTiltControl : 0,
        align: align,
        burst: lastBurst && time - lastBurst.time < 0.65 ? lastBurst : null,
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

    function playNote(frequency, duration, volume, delay) {
      if (!soundEnabled) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioContext = audioContext || new AudioContext();
        if (audioContext.state === 'suspended') audioContext.resume();
        const startAt = audioContext.currentTime + (delay || 0);
        const tone = audioContext.createOscillator();
        const overtone = audioContext.createOscillator();
        const gain = audioContext.createGain();
        tone.type = overtone.type = 'sine';
        tone.frequency.setValueAtTime(frequency, startAt);
        tone.frequency.exponentialRampToValueAtTime(frequency * 0.8, startAt + duration);
        overtone.frequency.setValueAtTime(frequency * 2.45, startAt);
        overtone.frequency.exponentialRampToValueAtTime(frequency * 2.2, startAt + duration);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.009);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        tone.connect(gain);
        overtone.connect(gain);
        gain.connect(audioContext.destination);
        tone.start(startAt);
        overtone.start(startAt);
        tone.stop(startAt + duration);
        overtone.stop(startAt + duration);
      } catch (_) {
        // Audio cannot interrupt a run.
      }
    }

    function spawnHeld() {
      const side = random() < 0.5 ? -1 : 1;
      const level = Math.min(score, 25);
      const bound = score === 0
        ? 1.85 + random() * 0.18
        : Math.min(2.35, 1.9 + level * 0.015 + random() * 0.2);
      held = {
        x: topPose().x + side * bound,
        y: topPose().y + SPAWN_CLEARANCE,
        tilt: 0,
        side: side,
        bound: bound,
        motionTime: 0,
        angularSpeed: score === 0
          ? 1.65 + random() * 0.3
          : clamp(1.72 + level * 0.045 + (random() - 0.35) * 0.24, 1.6, 2.85),
        phase: random() * Math.PI * 2,
        handVelocity: 0
      };
      bowlTiltInput = 0;
      heldTiltControl = 0;
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
      heldTiltControl = clamp(heldTiltControl + bowlTiltInput * dt * 0.95, -0.22, 0.22);
      held.tilt = clamp(velocity * 0.011 + heldTiltControl, -0.24, 0.24);
      held.handVelocity = velocity;
    }

    function start() {
      if (destroyed) return;
      if (physics) physics.destroy();
      physics = createPhysics(rapier);
      const baseId = physics.spawnBowl({ x: 0, y: window.BOWL_TRAY_Y + 0.04, z: 0 }, { x: 0, y: 0, z: 0 });
      placedIds = [baseId];
      unsupportedTime = new Map();
      baseUnsupportedTime = 0;
      bowlTiltInput = 0;
      heldTiltControl = 0;
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
      pendingTime = 0;
      supportTime = 0;
      surfaceTime = 0;
      unscoreableRestTime = 0;
      pendingContactPlayed = false;
      spawnDelay = 0;
      slideTime = 0;
      settledTime = 0;
      frozenFocusX = 0;
      frozenFocusY = 0;
      lastBurst = null;
      lastTimestamp = null;
      spawnHeld();
      paint();
      playNote(450, 0.2, 0.06);
    }

    function setBowlTiltInput(axis) {
      if (destroyed || !Number.isFinite(axis)) return;
      bowlTiltInput = clamp(axis, -1, 1);
    }

    function resetBowlTilt() {
      if (destroyed) return;
      bowlTiltInput = 0;
      heldTiltControl = 0;
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
      const lateralVelocity = clamp(held.handVelocity * 0.25, -1.15, 1.15);
      pendingId = physics.spawnBowl(
        { x: held.x, y: held.y, z: 0, rotation: rotation },
        { x: lateralVelocity, y: 0, z: 0, angular: { x: 0, y: 0, z: -held.handVelocity * 0.006 } }
      );
      held = null;
      pendingTime = 0;
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
      const perfect = Math.abs(dropOffset) <= 0.24
        && Math.abs(pose.x - support.x) <= 0.30
        && Math.abs(pose.tilt - support.tilt) <= 0.26;
      placedIds.push(pendingId);
      pendingId = null;
      score += 1;
      combo = perfect ? combo + 1 : 0;
      perfects += perfect ? 1 : 0;
      lastResult = perfect ? 'perfect' : 'good';
      lastBurst = { x: pose.x, y: pose.y, time: time, perfect: perfect, combo: combo };
      if (perfect && typeof physics.calmStack === 'function') {
        physics.calmStack(placedIds, combo >= 2 ? 0.65 : 0.8);
      }
      if (typeof physics.lockFoundation === 'function') {
        physics.lockFoundation(placedIds, 6);
      }
      spawnDelay = 0.16;
      mode = 'playing';
      if (score > best) {
        best = score;
        saveBest(best);
      }
      notify();
      if (perfect) {
        const root = 690 + Math.min(combo, 8) * 42;
        playNote(root, 0.42, 0.085, 0);
        playNote(Math.round(root * 1.25), 0.36, 0.055, 0.045);
        playNote(Math.round(root * 1.5), 0.44, 0.05, 0.09);
        if (combo >= 3) {
          playNote(Math.round(root * 2), 0.48, 0.04, 0.13);
        }
      } else {
        playNote(520, 0.24, 0.075, 0);
        playNote(780, 0.18, 0.032, 0.03);
      }
    }

    function beginSliding(cause) {
      if (mode === 'sliding' || mode === 'over') return;
      reason = cause;
      lastResult = cause === 'miss' ? 'miss' : lastResult;
      frozenFocusX = clamp(topPose().x * 0.85, -2.5, 2.5);
      frozenFocusY = Math.max(0, topPose().y - 1);
      mode = 'sliding';
      held = null;
      slideTime = 0;
      settledTime = 0;
      notify();
      playNote(160, 0.48, 0.055);
    }

    function checkPending(dt) {
      pendingTime += dt;
      const pose = physics.pose(pendingId);
      const top = topPose();
      const touchingTop = physics.touches(pendingId, topId());
      const relativeSpeed = Math.hypot(pose.vx - top.vx, pose.vy - top.vy, pose.vz - top.vz);
      const surfaceContact = physics.touchesTray(pendingId) || physics.touchesFloor(pendingId);
      const nestingHeight = pose.y - top.y;
      if (!pendingContactPlayed && (touchingTop || surfaceContact)) {
        pendingContactPlayed = true;
        playNote(870, 0.09, 0.028);
      }
      const canNest = touchingTop && !surfaceContact && nestingHeight > 0.12
        && nestingHeight < 0.86 && Math.abs(pose.tilt) < 0.72;
      const centeredHit = Math.abs(dropOffset) <= 0.24 && Math.abs(pose.x - top.x) <= 0.36;
      if (!touchingTop && pendingTime >= 0.055 && Math.abs(dropOffset) <= 0.24 && typeof physics.nudgeNest === 'function') {
        physics.nudgeNest(pendingId, top, dt * 8.5);
      }
      if (canNest && centeredHit && typeof physics.nudgeNest === 'function') {
        physics.nudgeNest(pendingId, top, dt * 6.5);
      }
      if (canNest && relativeSpeed < 0.65 && pose.angularSpeed < 1.35) {
        supportTime += dt * (centeredHit && Math.abs(pose.x - top.x) <= 0.28 ? 1.35 : 1);
      } else {
        supportTime = Math.max(0, supportTime - dt * 2);
      }
      if (supportTime >= 0.17) {
        acceptBowl();
        return;
      }

      if (surfaceContact) {
        surfaceTime += dt;
      } else {
        surfaceTime = 0;
      }
      const atRest = pose.sleeping
        || (Math.hypot(pose.vx, pose.vy, pose.vz) < 0.16 && pose.angularSpeed < 0.22);
      // Once motion ceases or an angled catch stays wedged too long, resolve as a miss.
      unscoreableRestTime = atRest && !canNest
        ? unscoreableRestTime + dt : Math.max(0, unscoreableRestTime - dt * 1.5);
      if (surfaceTime >= 0.06 || unscoreableRestTime >= 0.7 || pendingTime >= 3.2 || pose.y < top.y - 0.5) {
        beginSliding('miss');
      }
    }

    function checkPlacedSupport(dt) {
      const baseId = placedIds[0];
      if (!physics.isLocked?.(baseId)) {
        const baseSupported = physics.touchesTray(baseId);
        baseUnsupportedTime = baseSupported
          ? Math.max(0, baseUnsupportedTime - dt * 2)
          : baseUnsupportedTime + dt;
        if (physics.touchesFloor(baseId) || baseUnsupportedTime > 0.35) {
          beginSliding('slide');
          return;
        }
      }
      for (let index = 1; index < placedIds.length; index += 1) {
        const upperId = placedIds[index];
        if (physics.isLocked?.(upperId)) continue;
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
      if (slideTime > 0.85 && (settledTime > 0.4 || slideTime > 3.2)) {
        mode = 'over';
        worldSettled = false;
        bowlTiltInput = 0;
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
      bowlTiltInput = 0;
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
      if (hidden) bowlTiltInput = 0;
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
        physics.destroy();
      }
    }

    notify();
    paint();
    frameId = window.requestAnimationFrame(tick);

    return {
      start: start,
      drop: drop,
      setBowlTiltInput: setBowlTiltInput,
      resetBowlTilt: resetBowlTilt,
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
