(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const stage = byId('stage');
  const help = byId('help-dialog');
  const feedback = byId('feedback');
  let canvas = byId('scene');
  let view;
  let state;
  let lastFrame;
  let paintedReady = false;
  let overSince = 0;
  let feedbackTimer;
  let resumeAfterHelp = false;

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
    paintedReady = frame.mode === 'ready';
  }

  function icon(button, name) {
    button.querySelector('use').setAttribute('href', '#' + name);
  }

  function active() {
    return state && !state.paused && (state.mode === 'playing' || state.mode === 'falling');
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
    byId('play-hint').hidden = !active() || next.score !== 0 || next.mode === 'falling';
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
      byId('result-note').textContent = over && next.score > (runBest || 0) ? '새로운 최고 기록!' : '';
      byId('result-score').textContent = '쌓은 그릇 ' + next.score + '개';
      byId('next').querySelector('span').textContent = over ? '다시 쌓기' : '계속하기';
      icon(byId('next'), over ? 'retry' : 'play');
      feedback.classList.remove('show');
    }
    if (over && previous?.mode !== 'over') {
      overSince = lastFrame?.time || 0;
      announce('도전 종료. 쌓은 그릇 ' + next.score + '개.');
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
  const game = window.createStackGame({ onChange: update, onFrame: render });
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
    else if (state.mode === 'playing' && !state.paused) game.drop();
  }

  stage.addEventListener('pointerdown', event => {
    if (event.button === 0 && event.isPrimary) stack();
  });
  stage.addEventListener('click', event => {
    if (event.detail === 0) stack();
  });
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
    if (help.open || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
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
  window.addEventListener('blur', () => { if (active()) game.pause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { resumeAfterHelp = false; game.pause(); }
    game.setHidden(document.hidden);
  });
})();
