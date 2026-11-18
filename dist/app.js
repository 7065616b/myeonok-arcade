(async function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const stage = byId('stage');
  const help = byId('help-dialog');
  const feedback = byId('feedback');
  const balance = byId('balance');
  const left = byId('steer-left');
  const right = byId('steer-right');
  const dropButton = byId('drop-bowl');
  const directions = new Map();
  let canvas = byId('scene');
  let view;
  let state;
  let lastFrame;
  let paintedReady = false;
  let overSince = 0;
  let feedbackTimer;
  let resumeAfterHelp = false;
  let lastNeedle = null;

  function fallback() {
    const nextCanvas = canvas.cloneNode(false);
    nextCanvas.dataset.renderer = 'canvas';
    canvas.replaceWith(nextCanvas);
    canvas = nextCanvas;
    return window.createFallbackScene(canvas);
  }

  try {
    view = window.createNoodleScene(canvas);
    canvas.dataset.renderer = 'webgl';
  } catch (error) {
    console.warn('간편 그래픽 사용', error.message);
    view = fallback();
  }

  function render(frame, force) {
    lastFrame = frame;
    if (!force && frame.mode === 'ready' && paintedReady) return;
    if (!force && frame.mode === 'over' && frame.time - overSince > 2) return;
    view.render(frame);
    const disableDrop = frame.mode !== 'playing' || frame.paused || !frame.active?.held;
    if (dropButton.disabled !== disableDrop) setPlacementDisabled(disableDrop);
    const needle = Math.round(50 + 46 * Math.max(-1, Math.min(1, frame.lean / .34)));
    if (needle !== lastNeedle) {
      balance.style.setProperty('--tilt', needle + '%');
      lastNeedle = needle;
    }
    paintedReady = frame.mode === 'ready';
  }

  function icon(button, name) {
    button.querySelector('use').setAttribute('href', '#' + name);
  }

  function active() {
    return state && !state.paused && ['playing', 'falling', 'sliding'].includes(state.mode);
  }

  function canPlace() {
    return state.mode === 'playing' && !state.paused && !help.open && lastFrame?.active?.held;
  }

  function setPlacementDisabled(disabled) {
    dropButton.disabled = disabled;
    left.disabled = disabled;
    right.disabled = disabled;
  }

  function announce(message) {
    byId('announcer').textContent = message;
  }

  function showFeedback(message) {
    clearTimeout(feedbackTimer);
    feedback.classList.remove('show');
    void feedback.offsetWidth;
    feedback.textContent = message;
    feedback.classList.add('show');
    feedbackTimer = setTimeout(() => feedback.classList.remove('show'), 850);
  }

  function update(next) {
    const previous = state;
    state = next;
    const ready = next.mode === 'ready';
    const over = next.mode === 'over';
    const inPanel = over || next.paused;
    byId('arcade').dataset.mode = next.mode;
    byId('intro').hidden = !ready;
    byId('start').hidden = !ready;
    byId('live').hidden = ready || inPanel;
    byId('pause').hidden = !active();
    balance.hidden = !active();
    byId('game-controls').hidden = !active();
    byId('control-guide').hidden = active();
    if (next.mode !== 'playing' || next.paused) setPlacementDisabled(true);
    const danger = next.danger && (next.mode === 'playing' || next.mode === 'falling');
    const hint = byId('play-hint');
    hint.hidden = !active() || (!danger && (next.score !== 0 || next.mode !== 'playing'));
    hint.textContent = danger ? '위쪽 그릇이 기울었어요' : '두 그릇의 중심이 겹칠 때 놓으세요';
    hint.classList.toggle('warn', danger);
    balance.classList.toggle('risky', Boolean(next.danger));
    byId('balance-label').textContent = next.danger ? '기울어짐' : '안정';
    byId('cover').hidden = !inPanel;
    byId('score').value = next.score;
    byId('best').textContent = next.best;
    const soundButton = byId('sound');
    const audioLabel = next.soundEnabled ? '소리 켜짐' : '소리 꺼짐';
    soundButton.setAttribute('aria-label', audioLabel);
    soundButton.setAttribute('aria-pressed', String(next.soundEnabled));
    soundButton.title = audioLabel;
    icon(soundButton, next.soundEnabled ? 'volume' : 'mute');
    if (inPanel) {
      byId('result-title').textContent = over ? '그릇이 떨어졌어요' : '일시정지';
      const slideNote = next.reason === 'slide' ? '쌓아 둔 그릇이 미끄러졌어요.' : '그릇이 테두리를 벗어났어요.';
      byId('result-note').textContent = over ? slideNote : '';
      byId('result-score').textContent = (over && next.score > runBest ? '새 최고 기록 ' : '쌓은 그릇 ') + next.score + '개';
      byId('next').querySelector('span').textContent = over ? '다시 쌓기' : '계속하기';
      icon(byId('next'), over ? 'retry' : 'play');
      feedback.classList.remove('show');
    }
    if (over && previous?.mode !== 'over') {
      overSince = lastFrame?.time || 0;
      announce('도전 종료. 쌓은 그릇 ' + next.score + '개.');
    }
    if ((next.mode !== 'playing' || next.paused) && directions.size) {
      directions.clear();
      updateSteering();
    }
    if (previous && next.score > previous.score) {
      const message = next.lastResult === 'perfect'
        ? (next.combo > 1 ? '퍼펙트 ×' + next.combo : '퍼펙트!')
        : '+1 그릇';
      showFeedback(message);
      announce(message + ' · ' + next.score + '개');
    }
  }

  let runBest = 0;
  const startButton = byId('main-action');
  const startLabel = startButton.querySelector('span');
  let game;
  view.render(null);
  try {
    await window.RAPIER.init();
    game = window.createStackGame({ rapier: window.RAPIER, onChange: update, onFrame: render });
  } catch (error) {
    console.error('그릇 물리 초기화 실패', error);
    icon(startButton, 'retry');
    startLabel.textContent = '다시 불러오기';
    byId('intro').querySelector('p').textContent = '게임을 준비하지 못했어요. 다시 불러와 주세요.';
    startButton.disabled = false;
    startButton.addEventListener('click', () => window.location.reload());
    return;
  }
  startLabel.textContent = '게임 시작';
  startButton.disabled = false;
  try { game.setSound(localStorage.getItem('myeonok-sound') !== 'off'); } catch (_) {}

  function redraw() {
    if (lastFrame) render(lastFrame, true);
  }
  new ResizeObserver(redraw).observe(stage);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    game.pause();
    view = fallback();
    redraw();
  }, { once: true });

  function start() {
    runBest = state.best;
    feedback.classList.remove('show');
    game.start();
    stage.focus({ preventScroll: true });
  }

  function resume() {
    game.resume();
    stage.focus({ preventScroll: true });
  }

  function stack() {
    if (help.open) return;
    if (state.mode === 'ready') start();
    else if (canPlace()) game.drop();
  }

  function updateSteering() {
    const inputs = [...directions.values()];
    const pressingLeft = inputs.includes(-1);
    const pressingRight = inputs.includes(1);
    left.setAttribute('aria-pressed', String(pressingLeft));
    right.setAttribute('aria-pressed', String(pressingRight));
    game.setBowlTiltInput(Number(pressingRight) - Number(pressingLeft));
  }

  function releaseInput(source) {
    if (directions.delete(source)) updateSteering();
  }

  for (const [button, axis] of [[left, -1], [right, 1]]) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !canPlace()) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      directions.set(event.pointerId, axis);
      updateSteering();
    });
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(end, event => releaseInput(event.pointerId));
    }
    button.addEventListener('click', event => {
      if (event.detail || !canPlace()) return;
      const pulse = Symbol();
      directions.set(pulse, axis);
      updateSteering();
      setTimeout(() => releaseInput(pulse), 100);
    });
  }
  for (const target of [stage, dropButton]) {
    target.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      stage.focus({ preventScroll: true });
      stack();
    });
    target.addEventListener('click', event => { if (!event.detail) stack(); });
  }
  byId('main-action').addEventListener('click', start);
  byId('next').addEventListener('click', () => state.paused ? resume() : start());
  byId('pause').addEventListener('click', () => {
    game.pause();
    byId('next').focus({ preventScroll: true });
  });
  byId('sound').addEventListener('click', () => {
    game.setSound(!state.soundEnabled);
    try { localStorage.setItem('myeonok-sound', state.soundEnabled ? 'on' : 'off'); } catch (_) {}
  });
  byId('help-button').addEventListener('click', () => {
    resumeAfterHelp = active();
    game.pause();
    help.showModal();
  });
  for (const id of ['close-help', 'ok-help']) byId(id).addEventListener('click', () => help.close());
  help.addEventListener('click', event => { if (event.target === help) help.close(); });
  help.addEventListener('close', () => {
    if (resumeAfterHelp && !document.hidden) resume();
    resumeAfterHelp = false;
  });
  window.addEventListener('keydown', event => {
    if (help.open || event.ctrlKey || event.metaKey || event.altKey) return;
    const steeringKey = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
    const buttonKey = ['Space', 'Enter'].includes(event.code) && [left, right].includes(event.target);
    if (steeringKey || buttonKey) {
      if (!canPlace()) return;
      event.preventDefault();
      if (event.repeat) return;
      const axis = steeringKey ? (event.code === 'ArrowLeft' ? -1 : 1) : (event.target === left ? -1 : 1);
      directions.set(event.code, axis);
      updateSteering();
      return;
    }
    if (event.repeat) return;
    if (event.code === 'Escape') {
      if (active()) game.pause();
      else if (state.paused) resume();
      return;
    }
    if (!['Space','Enter'].includes(event.code) || event.target.closest?.('button')) return;
    event.preventDefault();
    if (state.paused) resume();
    else if (state.mode === 'over') start();
    else stack();
  });
  window.addEventListener('keyup', event => releaseInput(event.code));
  window.addEventListener('blur', () => { if (active()) game.pause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { resumeAfterHelp = false; game.pause(); }
    game.setHidden(document.hidden);
  });
})();
