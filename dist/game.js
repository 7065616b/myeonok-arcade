(function () {
  'use strict';

  const BEST_KEY = 'myeonok-arcade-balance-best';
  const SPACING = 0.34;
  const LANDING_LIMIT = 1.28;
  const PERFECT_DISTANCE = 0.105;
  const DROP_SPEED = 6.6;
  const GRAVITY = 9.2;
  const LEAN_SHIFT = 0.7;
  const EDGE_SLIP_TIME = 0.32;
  const BOWL_PROFILE = [[0, 0.025], [0.4, 0.025], [0.67, 0.13], [0.96, 0.43], [1.22, 0.78]];

  function clamp(value, lower, upper) {
    return Math.max(lower, Math.min(upper, value));
  }

  function readBest() {
    try {
      let best = 0;
      for (const key of [BEST_KEY, 'myeonok-arcade-stack-best', 'myeonok-arcade-best']) {
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
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch (_) {
      // Storage can be disabled without interrupting play.
    }
  }

  function createStackGame(options) {
    const onChange = options && typeof options.onChange === 'function' ? options.onChange : function () {};
    const onFrame = options && typeof options.onFrame === 'function' ? options.onFrame : function () {};
    const random = options && typeof options.random === 'function' ? options.random : Math.random;

    let mode = 'ready';
    let paused = false;
    let hidden = false;
    let destroyed = false;
    let score = 0;
    let best = readBest();
    let combo = 0;
    let perfects = 0;
    let lastResult = null;
    let reason = null;
    let time = 0;
    let aimX = 0;
    let easedAim = 0;
    let aimVelocity = 0;
    let lean = 0;
    let leanVelocity = 0;
    let collapseCharge = 0;
    let collapseClock = 0;
    let collapseDuration = 0;
    let slideDirection = 1;
    let frozenFocusY = 0;
    let lastBalance = 'steady';
    let bowls = [];
    let active = null;
    let detached = new Map();
    let spawnDelay = 0;
    let soundEnabled = true;
    let audioContext = null;
    let frameId = null;
    let lastTimestamp = null;

    function topBowl() {
      return bowls[bowls.length - 1];
    }

    function nextHeight() {
      return topBowl().y + SPACING;
    }

    function projectedX(bowl) {
      return bowl.x + lean * bowl.y * LEAN_SHIFT;
    }

    function landingHeightForX(x) {
      const top = topBowl();
      const offset = Math.abs(x - projectedX(top));
      const perch = offset <= PERFECT_DISTANCE
        ? SPACING : Math.min(0.79, SPACING + 0.85 * offset);
      return top.y + perch;
    }

    function updateHand(dt) {
      if (!active || active.dropping) return;
      active.motionTime += dt;
      aimVelocity += ((aimX - easedAim) * 36 - aimVelocity * 11) * dt;
      easedAim = clamp(easedAim + aimVelocity * dt, -0.65, 0.65);
      const phase = active.motionTime * active.angularSpeed;
      const handPath = active.side * active.bound * Math.cos(phase);
      const handVelocity = -active.side * active.bound * active.angularSpeed * Math.sin(phase);
      active.x = projectedX(topBowl()) + handPath + easedAim
        + 0.045 * Math.sin(time * 4.1 + active.phase);
      active.tilt = clamp(handVelocity * 0.015, -0.12, 0.12);
    }

    function supportRisk() {
      if (bowls.length < 2) return { value: 0, offset: 0, support: 0 };

      let sumX = 0;
      let sumY = 0;
      let count = 0;
      let highest = { value: 0, offset: 0, support: 0 };
      for (let index = bowls.length - 1; index > 0; index -= 1) {
        const upper = bowls[index];
        sumX += upper.x;
        sumY += upper.y;
        count += 1;
        const support = bowls[index - 1];
        const averageOffset = sumX / count - support.x
          + lean * (sumY / count - support.y) * LEAN_SHIFT;
        const localOffset = upper.x - support.x
          + lean * (upper.y - support.y) * LEAN_SHIFT;
        const cumulativeRisk = Math.abs(averageOffset) / 0.78;
        const localRisk = Math.abs(localOffset) / 1.1 * 0.75;
        const value = Math.max(cumulativeRisk, localRisk);
        if (value > highest.value) {
          highest = {
            value: value,
            offset: cumulativeRisk >= localRisk ? averageOffset : localOffset,
            support: index - 1
          };
        }
      }
      return highest;
    }

    function balanceCategory(risk) {
      if (risk >= 1.02) return 'critical';
      if (risk >= 0.72) return 'warning';
      return 'steady';
    }

    function state() {
      const risk = supportRisk();
      return {
        mode: mode,
        score: score,
        best: best,
        combo: combo,
        perfects: perfects,
        lastResult: lastResult,
        reason: reason,
        paused: paused,
        aimX: aimX,
        lean: lean,
        balance: balanceCategory(risk.value),
        balanceValue: risk.value,
        danger: risk.value >= 0.72,
        collapseCharge: collapseCharge,
        soundEnabled: soundEnabled
      };
    }

    function viewFrame() {
      const renderedBowls = bowls.map(function (bowl, index) {
        const body = detached.get(index);
        if (body) {
          return {
            x: body.x, y: body.y, z: 0, scale: 1,
            tilt: body.tilt, detached: true, settle: 0
          };
        }
        const wobble = bowl.settle > 0
          ? Math.sin((1 - bowl.settle) * Math.PI * 2.3) * bowl.settle : 0;
        return {
          x: projectedX(bowl),
          y: bowl.y + wobble * 0.025,
          z: 0,
          scale: 1,
          tilt: lean + wobble * 0.03,
          detached: false,
          settle: bowl.settle
        };
      });
      const risk = supportRisk();
      return {
        mode: mode,
        bowls: renderedBowls,
        active: active ? {
          x: active.x, y: active.y, z: 0, scale: 1,
          tilt: active.tilt, missed: Boolean(active.missed)
        } : null,
        time: time,
        focusX: 0,
        focusY: mode === 'sliding' || mode === 'over'
          ? frozenFocusY : Math.max(0, bowls.length ? topBowl().y - 1 : 0),
        lean: lean,
        balance: balanceCategory(risk.value),
        balanceValue: risk.value,
        danger: risk.value >= 0.72,
        collapseCharge: collapseCharge,
        paused: paused
      };
    }

    function notify() {
      lastBalance = balanceCategory(supportRisk().value);
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
        // Audio failure cannot affect the game state.
      }
    }

    function spawnBowl() {
      aimX = 0;
      easedAim = 0;
      aimVelocity = 0;
      const side = random() < 0.5 ? -1 : 1;
      const bound = score === 0
        ? 2.0 + random() * 0.3
        : Math.min(3.4, 2.25 + random() * (0.7 + Math.min(score, 20) * 0.025));
      active = {
        x: projectedX(topBowl()) + side * bound,
        y: nextHeight() + 0.62,
        tilt: 0,
        side: side,
        bound: bound,
        motionTime: 0,
        angularSpeed: score === 0
          ? 1.8 + random() * 0.55
          : 1.25 + random() * 2.5 + Math.min(score, 20) * 0.015,
        phase: random() * Math.PI * 2,
        dropping: false,
        missed: false,
        vx: 0,
        vy: 0,
        angularVelocity: 0
      };
      spawnDelay = 0;
      lastResult = null;
      notify();
    }

    function start() {
      if (destroyed) return;
      mode = 'playing';
      paused = false;
      score = 0;
      combo = 0;
      perfects = 0;
      lastResult = null;
      reason = null;
      time = 0;
      aimX = 0;
      easedAim = 0;
      aimVelocity = 0;
      lean = 0;
      leanVelocity = 0;
      collapseCharge = 0;
      collapseClock = 0;
      frozenFocusY = 0;
      detached = new Map();
      bowls = [{ x: 0, y: 0, settle: 0 }];
      spawnBowl();
      paint();
      playNote(450, 0.2, 0.06);
    }

    function setAim(trim) {
      if (destroyed || !Number.isFinite(trim)) return;
      aimX = clamp(trim, -0.6, 0.6);
    }

    function nudgeAim(delta) {
      if (!Number.isFinite(delta)) return;
      setAim(aimX + delta);
    }

    function drop() {
      if (destroyed) return;
      if (mode === 'ready' || mode === 'over') {
        start();
        return;
      }
      if (mode !== 'playing' || paused || hidden || !active) return;
      active.dropping = true;
      mode = 'falling';
      lastResult = null;
      notify();
      playNote(350, 0.1, 0.028);
    }

    function finish() {
      mode = 'over';
      paused = false;
      notify();
      playNote(155, 0.5, 0.05);
    }

    function beginMiss(offset) {
      mode = 'sliding';
      reason = 'miss';
      lastResult = 'miss';
      frozenFocusY = Math.max(0, topBowl().y - 1);
      collapseClock = 0;
      collapseDuration = 0.68;
      const direction = offset < 0 ? -1 : 1;
      active.missed = true;
      active.vx = direction * 0.85;
      active.vy = -0.15;
      active.angularVelocity = direction * 1.5;
      active.direction = direction;
      active.grounded = false;
      active.impacts = 0;
      notify();
      playNote(195, 0.2, 0.045);
    }

    function beginSlide(risk) {
      mode = 'sliding';
      reason = 'slide';
      frozenFocusY = Math.max(0, topBowl().y - 1);
      collapseClock = 0;
      collapseDuration = clamp(0.8 + Math.sqrt((topBowl().y + 1) * 2 / GRAVITY), 1.05, 2.1);
      const split = Math.max(0, Math.min(risk.support, bowls.length - 3));
      const direction = risk.offset < 0 ? -1 : 1;
      slideDirection = direction;
      detached = new Map();
      for (let index = split + 1; index < bowls.length; index += 1) {
        const bowl = bowls[index];
        const heightAboveBreak = bowl.y - bowls[split].y;
        detached.set(index, {
          x: projectedX(bowl),
          y: bowl.y,
          tilt: lean,
          startX: projectedX(bowl),
          startY: bowl.y,
          startTilt: lean,
          vx: leanVelocity * heightAboveBreak * LEAN_SHIFT + direction * (1.65 + 0.05 * (index - split)),
          vy: -0.06,
          angularVelocity: leanVelocity + direction * (0.65 + 0.11 * (index - split)),
          direction: direction,
          grounded: false,
          impacts: 0
        });
      }
      if (active) {
        active.dropping = true;
        active.missed = true;
        active.vx = direction * 0.55;
        active.vy = 0;
        active.angularVelocity = direction * 0.9;
        active.direction = direction;
        active.grounded = false;
        active.impacts = 0;
      }
      notify();
      playNote(130, 0.62, 0.09);
    }

    function land(landingY) {
      const top = topBowl();
      const offset = active.x - projectedX(top);
      if (Math.abs(offset) > LANDING_LIMIT) {
        beginMiss(offset);
        return;
      }

      const perfect = Math.abs(offset) <= PERFECT_DISTANCE;
      const landingX = perfect ? top.x : active.x - lean * landingY * LEAN_SHIFT;
      bowls.push({ x: landingX, y: landingY, settle: 1 });
      score += 1;
      combo = perfect ? combo + 1 : 0;
      perfects += perfect ? 1 : 0;
      lastResult = perfect ? 'perfect' : 'good';
      leanVelocity += offset * 0.16;
      active = null;
      spawnDelay = 0.24;
      mode = 'playing';
      if (score > best) {
        best = score;
        saveBest(best);
      }
      notify();
      playNote(perfect ? 690 + Math.min(combo, 7) * 42 : 510, perfect ? 0.48 : 0.28, 0.08);
    }

    function contactHeight(body) {
      const cosine = Math.cos(body.tilt);
      const sine = Math.abs(Math.sin(body.tilt));
      let lowestPoint = Infinity;
      for (const [radius, height] of BOWL_PROFILE) {
        lowestPoint = Math.min(lowestPoint, height * cosine - radius * sine);
      }
      const surface = Math.abs(body.x) <= 1.6 ? -0.018 : -0.205;
      return surface - lowestPoint;
    }

    function fallBody(body, dt, note) {
      if (body.grounded) {
        body.vx *= Math.exp(-3.3 * dt);
        body.angularVelocity *= Math.exp(-4.1 * dt);
      } else {
        body.vx += body.direction * 0.42 * dt;
        body.angularVelocity += body.direction * 0.28 * dt;
      }
      body.vy -= GRAVITY * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.tilt += body.angularVelocity * dt;

      const floor = contactHeight(body);
      if (body.y > floor + 0.025) body.grounded = false;
      if (body.y <= floor) {
        const impactSpeed = -body.vy;
        body.y = floor;
        body.grounded = true;
        body.vy = impactSpeed > 0.65 ? impactSpeed * 0.19 : 0;
        if (impactSpeed > 1.1 && body.impacts < 2) {
          playNote(note + body.impacts * 55, 0.18, 0.014);
          body.impacts += 1;
        }
      }
    }

    function separateRestingBowls() {
      const resting = Array.from(detached.values()).filter(body => body.grounded);
      for (let left = 0; left < resting.length; left += 1) {
        for (let right = left + 1; right < resting.length; right += 1) {
          const first = resting[left];
          const second = resting[right];
          const distance = second.x - first.x;
          if (Math.abs(distance) >= 1.35) continue;
          const direction = distance === 0 ? slideDirection : Math.sign(distance);
          const correction = (1.35 - Math.abs(distance)) * 0.5;
          first.x -= direction * correction;
          second.x += direction * correction;
          first.y = Math.max(first.y, contactHeight(first));
          second.y = Math.max(second.y, contactHeight(second));
          first.vx *= 0.72;
          second.vx *= 0.72;
        }
      }
    }

    function updateSlide(dt) {
      collapseClock += dt;
      if (reason === 'slide') {
        if (collapseClock <= EDGE_SLIP_TIME) {
          const phase = collapseClock / EDGE_SLIP_TIME;
          const slip = slideDirection * (0.18 * phase + 0.95 * phase * phase);
          for (const body of detached.values()) {
            body.x = body.startX + slip + body.vx * collapseClock * 0.32;
            body.y = body.startY + 0.04 * Math.sin(Math.PI * phase) - 0.08 * phase;
            body.tilt = body.startTilt + slideDirection * (0.08 * phase + 0.48 * phase * phase);
          }
        } else {
          for (const [index, body] of detached) {
            if (!body.released) {
              body.released = true;
              body.vx = slideDirection * 2.35 + leanVelocity * (body.startY - bowls[0].y) * LEAN_SHIFT;
              body.vy = -0.18;
              body.angularVelocity += slideDirection * 0.85;
            }
            fallBody(body, dt, 240 + index * 24);
          }
          separateRestingBowls();
        }
        lean *= Math.exp(-1.6 * dt);
      }
      if (active) {
        fallBody(active, dt, 275);
      }
      if (collapseClock >= collapseDuration) finish();
    }

    function step(seconds, shouldPaint) {
      if (destroyed || paused || hidden) return;
      const dt = clamp(seconds, 0, 0.05);
      time += dt;

      if (mode === 'playing' || mode === 'falling') {
        for (const bowl of bowls) bowl.settle = Math.max(0, bowl.settle - dt / 0.25);

        const riskBefore = supportRisk();
        const targetLean = clamp(riskBefore.offset * 0.12 + topBowl().x * 0.025, -0.28, 0.28);
        const acceleration = (targetLean - lean) * 11.5 - leanVelocity * 4.4;
        leanVelocity += acceleration * dt;
        lean += leanVelocity * dt;

        const risk = supportRisk();
        if (risk.value > 1.02) {
          collapseCharge += dt * (0.75 + Math.max(0, risk.value - 1.02) * 1.2);
        } else {
          collapseCharge = Math.max(0, collapseCharge - dt * 1.6);
        }

        if (collapseCharge >= 1.85) {
          beginSlide(risk);
        } else {
          const category = balanceCategory(risk.value);
          if (category !== lastBalance) notify();
          if (mode === 'playing' && active) updateHand(dt);
          if (mode === 'falling' && active) {
            active.y -= DROP_SPEED * dt;
            const contactY = landingHeightForX(active.x);
            if (active.y <= contactY) {
              active.y = contactY;
              land(contactY);
            }
          }
          if (mode === 'playing' && !active && spawnDelay > 0) {
            spawnDelay -= dt;
            if (spawnDelay <= 0) spawnBowl();
          }
        }
      }

      if (mode === 'sliding') updateSlide(dt);
      if (shouldPaint !== false) paint();
    }

    function tick(timestamp) {
      if (destroyed) return;
      const elapsed = lastTimestamp === null ? 0 : clamp((timestamp - lastTimestamp) / 1000, 0, 1.2);
      lastTimestamp = timestamp;
      if (paused || hidden || mode === 'ready' || mode === 'over') {
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
    }

    notify();
    paint();
    frameId = window.requestAnimationFrame(tick);

    return {
      start: start,
      drop: drop,
      setAim: setAim,
      nudgeAim: nudgeAim,
      getAim: function () { return aimX; },
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
