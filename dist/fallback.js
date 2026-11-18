(function () {
  'use strict';

  function createFallbackScene(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    let width = 0;
    let height = 0;
    let unit = 1;
    let viewHeight = 5.9;
    let focusY = 1.13;

    function resize() {
      const w = Math.max(1, canvas.clientWidth || canvas.width || 900);
      const h = Math.max(1, canvas.clientHeight || canvas.height || 760);
      if (w === width && h === height) return;
      width = w;
      height = h;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * pixelRatio);
      canvas.height = Math.round(h * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      viewHeight = w < 550 && h >= 520 ? 9.3 : 5.9;
      unit = h / viewHeight;
    }

    function yFor(worldY) {
      return height / 2 - (worldY - focusY) * unit * .953;
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

    function roundRect(x, y, w, h, radius, fill, stroke) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    function backdrop() {
      const wall = ctx.createLinearGradient(0, 0, 0, height);
      wall.addColorStop(0, '#ecdec3');
      wall.addColorStop(.5, '#e3d6bd');
      wall.addColorStop(1, '#cabfa5');
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, width, height);

      const tileTop = yFor(1.22) - unit * 1.36;
      const counterY = yFor(-.22) - unit * 1.03;
      ctx.fillStyle = '#a8c3b4';
      ctx.fillRect(0, tileTop, width, Math.max(0, counterY - tileTop));
      const tileW = Math.max(34, unit * .86);
      const tileH = Math.max(25, unit * .45);
      for (let row = 0, y = tileTop; y < Math.min(height, counterY); row++, y += tileH) {
        for (let col = -1, x = -tileW + (row % 2) * tileW * .5; x < width; col++, x += tileW) {
          ctx.fillStyle = (row * 7 + col * 3) % 5 === 0 ? '#c3d5c6' : (row + col) % 4 === 0 ? '#b2cbbd' : '#d0ddcf';
          roundRect(x + 2, y + 2, tileW - 4, tileH - 4, 2, ctx.fillStyle);
        }
      }
      ctx.fillStyle = '#ad925f';
      ctx.fillRect(0, tileTop - 4, width, 4);

      if (width > 700) {
        const glow = ctx.createRadialGradient(width * .08, height * .15, 8, width * .08, height * .15, width * .32);
        glow.addColorStop(0, 'rgba(255,249,222,.32)');
        glow.addColorStop(1, 'rgba(255,249,222,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width * .5, height * .8);
      }

      const wood = ctx.createLinearGradient(0, counterY, 0, height);
      wood.addColorStop(0, '#a16e47');
      wood.addColorStop(.35, '#865337');
      wood.addColorStop(1, '#593923');
      ctx.fillStyle = wood;
      ctx.fillRect(0, counterY, width, height - counterY);
      ctx.fillStyle = '#c89f66';
      ctx.fillRect(0, counterY - 2, width, 5);
      for (let i = 0; i < 36; i++) {
        const y = counterY + ((i * 71) % Math.max(1, height - counterY));
        ctx.strokeStyle = i % 4 ? 'rgba(41,22,10,.11)' : 'rgba(242,194,121,.15)';
        ctx.lineWidth = i % 6 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(width * .32, y + 3, width * .7, y - 2, width, y + 1);
        ctx.stroke();
      }
      const apronTop = counterY + unit * .72;
      if (apronTop < height) {
        const apron = ctx.createLinearGradient(0, apronTop, 0, height);
        apron.addColorStop(0, '#795139');
        apron.addColorStop(1, '#4e3023');
        ctx.fillStyle = apron;
        ctx.fillRect(0, apronTop, width, height - apronTop);
        ctx.fillStyle = 'rgba(40,24,15,.27)';
        ctx.fillRect(0, apronTop, width, Math.max(2, unit * .045));
      }

      const trayY = yFor(-.05);
      const trayW = unit * 3.5;
      const trayH = unit * .8;
      const metal = ctx.createLinearGradient(width / 2 - trayW / 2, 0, width / 2 + trayW / 2, 0);
      metal.addColorStop(0, '#577478');
      metal.addColorStop(.15, '#bdcfc9');
      metal.addColorStop(.54, '#879f9a');
      metal.addColorStop(.86, '#d6e5dc');
      metal.addColorStop(1, '#45696b');
      ctx.save();
      ctx.shadowColor = 'rgba(39,32,24,.33)';
      ctx.shadowBlur = unit * .18;
      ctx.shadowOffsetY = unit * .1;
      roundRect(width / 2 - trayW / 2, trayY - trayH / 2, trayW, trayH, unit * .22, metal, '#dce8df');
      ctx.restore();
      const insetMetal = ctx.createLinearGradient(width / 2 - trayW * .46, 0, width / 2 + trayW * .46, 0);
      insetMetal.addColorStop(0, '#536f72');
      insetMetal.addColorStop(.18, '#aabfba');
      insetMetal.addColorStop(.49, '#78908b');
      insetMetal.addColorStop(.8, '#a9c0b8');
      insetMetal.addColorStop(1, '#4a6b6b');
      roundRect(width / 2 - trayW * .477, trayY - trayH * .41, trayW * .954, trayH * .82, unit * .17, insetMetal, 'rgba(29,67,69,.42)');
      ctx.beginPath();
      ctx.roundRect(width / 2 - trayW * .462, trayY - trayH * .385, trayW * .924, trayH * .77, unit * .15);
      ctx.strokeStyle = 'rgba(224,238,229,.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ellipse(width / 2, yFor(0) + unit * .05, unit * 1.05, unit * .12, 'rgba(24,50,48,.29)');

      if (width > 650) {
        const leftX = width / 2 - 3.7 * unit;
        const rightX = width / 2 + 3.7 * unit;
        const propsY = yFor(0);
        const cup = ctx.createLinearGradient(leftX - unit * .25, 0, leftX + unit * .25, 0);
        cup.addColorStop(0, '#536c6c');
        cup.addColorStop(.25, '#e1ede5');
        cup.addColorStop(.7, '#799591');
        cup.addColorStop(1, '#294f53');
        roundRect(leftX - unit * .27, propsY - unit * .6, unit * .54, unit * .58, unit * .08, cup);
        ellipse(leftX, propsY - unit * .6, unit * .27, unit * .06, '#315458', '#e7f5ec', 1.5);
        for (let index = 0; index < 7; index++) {
          ctx.strokeStyle = index % 2 ? '#8c5d35' : '#c09155';
          ctx.lineWidth = Math.max(1.5, unit * .023);
          ctx.beginPath();
          ctx.moveTo(leftX - unit * .2 + index * unit * .065, propsY - unit * .58);
          ctx.lineTo(leftX - unit * .23 + index * unit * .068, propsY - unit * 1.3);
          ctx.stroke();
        }
        roundRect(rightX - unit * .19, propsY - unit * .58, unit * .38, unit * .58, unit * .08, '#ad5139');
        roundRect(rightX - unit * .08, propsY - unit * .79, unit * .16, unit * .24, unit * .035, '#e7cf9d');
      }
    }

    function bowl(item) {
      const x = width / 2 + (item.x || 0) * unit;
      const y = yFor(item.y || 0);
      const s = unit * (item.scale || 1);
      const radius = 1.22 * s;
      const rimY = -.78 * s * .953;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-(item.tilt || 0));
      const metal = ctx.createLinearGradient(-radius, 0, radius, 0);
      metal.addColorStop(0, '#35595e');
      metal.addColorStop(.1, '#e2f1e9');
      metal.addColorStop(.19, '#789996');
      metal.addColorStop(.32, '#d2e3dc');
      metal.addColorStop(.5, '#466d6c');
      metal.addColorStop(.66, '#aecac2');
      metal.addColorStop(.78, '#f5f9ec');
      metal.addColorStop(.9, '#567c7d');
      metal.addColorStop(1, '#deebe2');
      ctx.shadowColor = 'rgba(18,47,48,.26)';
      ctx.shadowBlur = unit * .07;
      ctx.shadowOffsetY = unit * .035;
      ctx.beginPath();
      ctx.moveTo(-radius, rimY);
      ctx.bezierCurveTo(-radius * .87, rimY + s * .24, -radius * .55, -s * .05, -radius * .42, 0);
      ctx.quadraticCurveTo(0, s * .06, radius * .42, 0);
      ctx.bezierCurveTo(radius * .55, -s * .05, radius * .87, rimY + s * .24, radius, rimY);
      ctx.closePath();
      ctx.fillStyle = metal;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const inside = ctx.createRadialGradient(-s * .16, rimY - s * .06, s * .02, 0, rimY, radius);
      inside.addColorStop(0, '#8aa8a1');
      inside.addColorStop(.45, '#5c7e7b');
      inside.addColorStop(.88, '#2b4e54');
      inside.addColorStop(1, '#cde3d9');
      ellipse(0, rimY, radius * .965, s * .32, '#3d6062', '#ecf6eb', Math.max(2.2, s * .03));
      ellipse(0, rimY + s * .035, radius * .82, s * .265, inside, 'rgba(223,240,225,.6)', 1);
      ctx.beginPath();
      ctx.ellipse(0, rimY, radius * .965, s * .32, 0, 0, Math.PI);
      ctx.strokeStyle = '#f5fbef';
      ctx.lineWidth = Math.max(2.2, s * .035);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-radius * .78, rimY + s * .27);
      ctx.quadraticCurveTo(0, rimY + s * .48, radius * .78, rimY + s * .27);
      ctx.strokeStyle = 'rgba(19,51,54,.38)';
      ctx.lineWidth = Math.max(1, s * .012);
      ctx.stroke();
      ctx.restore();
    }

    function render(frame) {
      resize();
      const ready = !frame || frame.mode === 'ready';
      const settled = ready
        ? Array.from({ length: 5 }, (_, index) => ({ x: -.07 + index * .068, y: index * .34, tilt: index * .018, scale: 1 }))
        : frame.bowls || [];
      const targetY = ready ? 1.13 : Math.max(1.13, 1.13 + (frame && Number.isFinite(frame.focusY) ? frame.focusY : 0));
      focusY += (targetY - focusY) * .085;
      ctx.clearRect(0, 0, width, height);
      backdrop();
      const bowls = frame && frame.active ? settled.concat(frame.active) : settled;
      bowls.filter(item => item.y > focusY - 5.2 && item.y < focusY + 5.2).slice(-40).forEach(bowl);
    }

    function worldXForClient(clientX) {
      resize();
      const rect = canvas.getBoundingClientRect();
      return (clientX - rect.left - rect.width / 2) * viewHeight / rect.height;
    }

    return { render, resize, worldXForClient };
  }

  window.createFallbackScene = createFallbackScene;
})();
