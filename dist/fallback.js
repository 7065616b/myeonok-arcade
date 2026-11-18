(function () {
  'use strict';

  function createFallbackScene(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    let width = 0;
    let height = 0;
    let unit = 1;
    let focusY = 1.4;
    let focusX = 0;
    let focusZ = 0;

    function resize() {
      const w = Math.max(1, canvas.clientWidth || canvas.width || 900);
      const h = Math.max(1, canvas.clientHeight || canvas.height || 900);
      if (w === width && h === height) return;
      width = w;
      height = h;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const viewHeight = h < 520 && w > h
        ? 6.6
        : w < 600 ? 10.4 : Math.max(6.6, 900 / h * 6.6);
      unit = h / viewHeight;
    }

    function project(x, y, z) {
      const dx = x - focusX;
      const dz = z - focusZ;
      return [width * .5 + (dx - dz) * unit * .69,
        height * .535 - (y - focusY) * unit * .84 + (dx + dz) * unit * .28];
    }

    function polygon(points, fill, stroke, lineWidth) {
      ctx.beginPath();
      points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth || 1;
        ctx.stroke();
      }
    }

    function ellipse(x, y, rx, ry, fill, stroke, lineWidth) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth || 1;
        ctx.stroke();
      }
    }

    function pedestalLayer(index) {
      const topY = -index * .71;
      const bottomY = topY - .72;
      const n = project(-1.12, topY, -1.12);
      const r = project(1.12, topY, -1.12);
      const s = project(1.12, topY, 1.12);
      const l = project(-1.12, topY, 1.12);
      const rb = project(1.12, bottomY, -1.12);
      const sb = project(1.12, bottomY, 1.12);
      const lb = project(-1.12, bottomY, 1.12);
      const palette = [
        ['#77bdae', '#3a8588', '#2b6f79'],
        ['#6fb6a5', '#337f82', '#226473'],
        ['#83c4ad', '#408b84', '#276c74'],
        ['#6eaf9f', '#367d81', '#225f6d']
      ][index % 4];
      polygon([l, s, sb, lb], palette[2]);
      polygon([s, r, rb, sb], palette[1]);
      polygon([n, r, s, l], palette[0], index === 0 ? 'rgba(216,255,232,.45)' : 'rgba(189,235,221,.12)', index === 0 ? 1.4 : .5);
    }

    function guide() {
      const center = project(0, focusY - 1.55, 0);
      for (const radius of [3.0, 4.5]) {
        const x = radius * unit * .7;
        const y = radius * unit * .28;
        ctx.beginPath();
        ctx.moveTo(center[0], center[1] - y);
        ctx.lineTo(center[0] + x, center[1]);
        ctx.lineTo(center[0], center[1] + y);
        ctx.lineTo(center[0] - x, center[1]);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(220,255,239,.16)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    function bowl(item) {
      const [x, y] = project(item.x || 0, item.y || 0, item.z || 0);
      const s = unit * (item.scale || 1);
      const r = 1.22 * s;
      const rimY = -.76 * s * .84;
      const bowlHeight = .72 * s * .84;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-(item.tilt || 0) * .7);
      ellipse(0, -s * .01, s * .49, s * .12, 'rgba(12,42,47,.47)');
      const metal = ctx.createLinearGradient(-r, 0, r, 0);
      metal.addColorStop(0, '#3e646c');
      metal.addColorStop(.09, '#e6f7f3');
      metal.addColorStop(.17, '#82a4a7');
      metal.addColorStop(.3, '#d9e8e3');
      metal.addColorStop(.46, '#4a7377');
      metal.addColorStop(.57, '#b8d1ce');
      metal.addColorStop(.72, '#effbf5');
      metal.addColorStop(.85, '#547981');
      metal.addColorStop(1, '#d6e9e4');
      ctx.shadowColor = 'rgba(5,37,45,.22)';
      ctx.shadowBlur = Math.max(4, s * .09);
      ctx.shadowOffsetY = s * .025;
      ctx.beginPath();
      ctx.moveTo(-r, rimY);
      ctx.bezierCurveTo(-r * .87, rimY + bowlHeight * .47, -r * .55, -s * .08, -r * .42, 0);
      ctx.quadraticCurveTo(0, s * .08, r * .42, 0);
      ctx.bezierCurveTo(r * .55, -s * .08, r * .87, rimY + bowlHeight * .47, r, rimY);
      ctx.closePath();
      ctx.fillStyle = metal;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(245,255,252,.6)';
      ctx.lineWidth = Math.max(1, s * .012);
      ctx.stroke();
      const hollow = ctx.createRadialGradient(0, rimY - s * .04, s * .04, 0, rimY, r);
      hollow.addColorStop(0, '#799b99');
      hollow.addColorStop(.57, '#486b70');
      hollow.addColorStop(.85, '#304e55');
      hollow.addColorStop(1, '#cde2dc');
      ellipse(0, rimY, r * .965, r * .49, '#36555c', '#e8faf5', Math.max(2.3, s * .035));
      ellipse(0, rimY + s * .035, r * .82, r * .395, hollow, 'rgba(202,228,220,.7)', Math.max(1, s * .011));
      ctx.beginPath();
      ctx.ellipse(0, rimY, r * .965, r * .49, 0, 0, Math.PI);
      ctx.strokeStyle = '#f6fffc';
      ctx.lineWidth = Math.max(2.3, s * .034);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * .76, rimY + s * .28);
      ctx.quadraticCurveTo(0, -s * .05, r * .76, rimY + s * .28);
      ctx.strokeStyle = 'rgba(20,58,63,.4)';
      ctx.lineWidth = Math.max(1.1, s * .02);
      ctx.stroke();
      ctx.restore();
    }

    function render(frame) {
      resize();
      const ready = !frame || frame.mode === 'ready';
      const settled = ready
        ? Array.from({ length: 5 }, (_, index) => ({ x: 0, y: index * .34, z: 0, scale: 1, tilt: 0 }))
        : frame.bowls || [];
      const leader = settled[settled.length - 1];
      const targetY = ready ? 1.4 : Math.max(1.4, (leader ? leader.y : 0) + (frame && frame.active ? .9 : .42));
      focusY += (targetY - focusY) * .085;
      focusX += ((leader ? leader.x || 0 : 0) - focusX) * .075;
      focusZ += ((leader ? leader.z || 0 : 0) - focusZ) * .075;
      ctx.clearRect(0, 0, width, height);
      guide();
      for (let index = 12; index >= 0; index--) pedestalLayer(index);
      settled.forEach(item => {
        if (item.y > focusY - 6.5 || item.y < .4) bowl(item);
      });
      if (frame && frame.active) bowl(frame.active);
    }

    return { render, resize };
  }

  window.createFallbackScene = createFallbackScene;
})();
