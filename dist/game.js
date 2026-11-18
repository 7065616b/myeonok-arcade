(function () {
  'use strict';

  const BEST_KEY = 'myeonok-arcade-stack-best';
  const RIM_RADIUS = 1.22;
  const BOWL_SPACING = 0.34;
  const MIN_SCALE = 0.28;
  const DROP_SPEED = 7.2;

  function readBest() {
    try {
      const value = Number(window.localStorage.getItem(BEST_KEY));
      return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    } catch (_) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch (_) {
      // The game remains playable when storage is unavailable.
    }
  }

  function createStackGame(options) {
    const onChange = options && typeof options.onChange === 'function' ? options.onChange : function () {};
    const onFrame = options && typeof options.onFrame === 'function' ? options.onFrame : function () {};

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
    let bowls = [];
    let active = null;
    let servingScale = 1;
    let spawnDelay = 0;
    let soundEnabled = true;
    let audioContext = null;
    let frameId = null;
    let lastTimestamp = null;

    function topBowl() {
      return bowls[bowls.length - 1];
    }

    function nextHeight() {
      const top = topBowl();
      return top.y + BOWL_SPACING * top.scale;
    }

    function state() {
      return {
        mode: mode,
        score: score,
        best: best,
        combo: combo,
        perfects: perfects,
        lastResult: lastResult,
        reason: reason,
        paused: paused,
        axis: active ? active.axis : (score % 2 === 0 ? 'x' : 'z'),
        soundEnabled: soundEnabled
      };
    }

    function viewFrame() {
      return {
        mode: mode,
        bowls: bowls.map(function (bowl) {
          const progress = 1 - bowl.settle;
          const eased = 1 - Math.pow(1 - progress, 3);
          const wobble = bowl.settle > 0 ? Math.sin(progress * Math.PI * 2.5) * bowl.settle : 0;
          return {
            x: bowl.x + (bowl.targetX - bowl.x) * eased,
            y: bowl.y + wobble * 0.035,
            z: bowl.z + (bowl.targetZ - bowl.z) * eased,
            scale: bowl.scale,
            tilt: wobble * 0.035,
            settle: bowl.settle
          };
        }),
        active: active ? {
          x: active.x,
          y: active.y,
          z: active.z,
          scale: active.scale,
          tilt: active.tilt,
          axis: active.axis,
          missed: Boolean(active.missed)
        } : null,
        time: time,
        focusY: bowls.length ? Math.max(0, topBowl().y - 0.6) : 0,
        axis: active ? active.axis : (score % 2 === 0 ? 'x' : 'z'),
        paused: paused
      };
    }

    function notify() {
      onChange(state());
    }

    function paint() {
      onFrame(viewFrame());
    }

    function playNote(frequency, duration, loudness) {
      if (!soundEnabled) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioContext = audioContext || new AudioContext();
        if (audioContext.state === 'suspended') audioContext.resume();
        const now = audioContext.currentTime;
        const main = audioContext.createOscillator();
        const overtone = audioContext.createOscillator();
        const gain = audioContext.createGain();
        main.type = overtone.type = 'sine';
        main.frequency.setValueAtTime(frequency, now);
        main.frequency.exponentialRampToValueAtTime(frequency * 0.83, now + duration);
        overtone.frequency.setValueAtTime(frequency * 2.42, now);
        overtone.frequency.exponentialRampToValueAtTime(frequency * 2.18, now + duration);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(loudness, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        main.connect(gain);
        overtone.connect(gain);
        gain.connect(audioContext.destination);
        main.start(now);
        overtone.start(now);
        main.stop(now + duration);
        overtone.stop(now + duration);
      } catch (_) {
        // Sound is decoration and cannot interrupt play.
      }
    }

    function spawnBowl() {
      const top = topBowl();
      const axis = score % 2 === 0 ? 'x' : 'z';
      active = {
        x: top.x,
        y: nextHeight() + 0.66,
        z: top.z,
        scale: servingScale,
        tilt: 0,
        axis: axis,
        offset: -3.05,
        direction: 1,
        dropping: false,
        missed: false
      };
      active[axis] = top[axis] + active.offset;
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
      servingScale = 1;
      bowls = [{ x: 0, y: 0, z: 0, scale: 1, settle: 0, targetX: 0, targetZ: 0 }];
      spawnBowl();
      paint();
      playNote(460, 0.22, 0.065);
    }

    function drop() {
      if (destroyed) return;
      if (mode === 'ready' || mode === 'over') {
        start();
        return;
      }
      if (mode !== 'playing' || paused || hidden || !active) return;
      mode = 'falling';
      active.dropping = true;
      lastResult = null;
      notify();
      playNote(390, 0.12, 0.035);
    }

    function lose() {
      mode = 'over';
      reason = 'miss';
      active = null;
      paused = false;
      notify();
      playNote(170, 0.48, 0.06);
    }

    function land() {
      const top = topBowl();
      const dx = active.x - top.x;
      const dz = active.z - top.z;
      const distance = Math.hypot(dx, dz);
      const topRadius = RIM_RADIUS * top.scale;
      const incomingRadius = RIM_RADIUS * active.scale;
      const supportLimit = topRadius + incomingRadius * 0.45;

      if (distance >= supportLimit) {
        active.missed = true;
        active.tilt = (active.offset < 0 ? -1 : 1) * 0.14;
        lastResult = 'miss';
        notify();
        playNote(210, 0.22, 0.043);
        return;
      }

      const perfect = distance <= Math.max(0.045, Math.min(topRadius, incomingRadius) * 0.095);
      const normalizedOffset = Math.min(1.5, distance / incomingRadius);
      const reducedScale = Math.max(MIN_SCALE, active.scale * (1 - 0.19 * Math.pow(normalizedOffset, 1.35)));
      const nextCombo = perfect ? combo + 1 : 0;
      servingScale = perfect
        ? Math.min(1, active.scale + (nextCombo % 3 === 0 ? 0.035 : 0))
        : reducedScale;
      bowls.push({
        x: active.x,
        y: nextHeight(),
        z: active.z,
        targetX: perfect ? top.x : top.x + dx * 0.82,
        targetZ: perfect ? top.z : top.z + dz * 0.82,
        scale: active.scale,
        settle: 1
      });
      active = null;
      score += 1;
      combo = nextCombo;
      perfects += perfect ? 1 : 0;
      lastResult = perfect ? 'perfect' : 'good';
      if (score > best) {
        best = score;
        saveBest(best);
      }
      mode = 'playing';
      spawnDelay = 0.38;
      notify();
      playNote(perfect ? 680 + Math.min(combo, 8) * 45 : 510, perfect ? 0.52 : 0.32, 0.08);
    }

    function step(seconds, shouldPaint) {
      if (destroyed || paused || hidden) return;
      const dt = Math.max(0, Math.min(seconds, 0.05));
      time += dt;

      if (mode === 'playing' || mode === 'falling') {
        for (const bowl of bowls) {
          if (bowl.settle > 0) {
            bowl.settle = Math.max(0, bowl.settle - dt / 0.2);
            if (bowl.settle === 0) {
              bowl.x = bowl.targetX;
              bowl.z = bowl.targetZ;
            }
          }
        }

        if (mode === 'playing' && active) {
          const speed = Math.min(4.25, 2.55 + score * 0.085);
          active.offset += active.direction * speed * dt;
          if (active.offset >= 3.05) {
            active.offset = 6.1 - active.offset;
            active.direction = -1;
          } else if (active.offset <= -3.05) {
            active.offset = -6.1 - active.offset;
            active.direction = 1;
          }
          active[active.axis] = topBowl()[active.axis] + active.offset;
        }

        if (mode === 'falling' && active) {
          active.y -= DROP_SPEED * dt;
          if (active.missed) {
            const slideDirection = active.offset < 0 ? -1 : 1;
            active[active.axis] += slideDirection * 1.8 * dt;
            active.tilt += slideDirection * 1.55 * dt;
            if (active.y < nextHeight() - 1.75) lose();
          } else if (active.y <= nextHeight()) {
            active.y = nextHeight();
            land();
          }
        }

        if (mode === 'playing' && !active && spawnDelay > 0) {
          spawnDelay -= dt;
          if (spawnDelay <= 0) spawnBowl();
        }
      }

      if (shouldPaint !== false) paint();
    }

    function tick(timestamp) {
      if (destroyed) return;
      const elapsed = lastTimestamp === null ? 0 : Math.min(Math.max(0, (timestamp - lastTimestamp) / 1000), 1.2);
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
      if (destroyed || paused || (mode !== 'playing' && mode !== 'falling')) return;
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
