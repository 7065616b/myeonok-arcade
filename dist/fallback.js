(function () {
  'use strict';
  const TRAY_Y = Number.isFinite(window.BOWL_TRAY_Y) ? window.BOWL_TRAY_Y : -.15;

  function createFallbackScene(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    let width = 0;
    let height = 0;
    let unit = 1;
    let viewHeight = 5.9;
    let focusX = 0;
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
      const baseViewHeight = w < 550 && h >= 520 ? 9.3 : 5.9;
      const minHalfWidth = w < 550 ? 3.65 : 3.85;
      unit = Math.min(h / baseViewHeight, w / (minHalfWidth * 2));
      viewHeight = h / unit;
    }

    function xFor(worldX) {
      return width / 2 + ((worldX || 0) - focusX) * unit;
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

    function lerpHex(a, b, t) {
      const k = Math.max(0, Math.min(1, t));
      const pa = parseInt(a.slice(1), 16);
      const pb = parseInt(b.slice(1), 16);
      const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * k);
      const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * k);
      const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * k);
      return `rgb(${r},${g},${bl})`;
    }

    function skyTone() {
      if (focusY <= 4.5) return '#bfe0ef';
      if (focusY <= 8.5) return lerpHex('#bfe0ef', '#8bc4e8', (focusY - 4.5) / 4);
      if (focusY <= 11.5) return lerpHex('#8bc4e8', '#ebb084', (focusY - 8.5) / 3);
      if (focusY <= 14.5) return lerpHex('#ebb084', '#6b5d8a', (focusY - 11.5) / 3);
      return lerpHex('#6b5d8a', '#1e2d4d', Math.min(1, (focusY - 14.5) / 3));
    }

    function backdrop(animTime) {
      const wallY = worldY => yFor(worldY) + unit * 1.42;
      ctx.fillStyle = skyTone();
      ctx.fillRect(0, 0, width, height);

      const ceilingY = wallY(7.8);
      if (ceilingY > 0) {
        const starAlpha = Math.max(0, Math.min(1, (focusY - 11.5) / 3.5));
        if (starAlpha > 0.02) {
          for (let i = 0; i < 32; i++) {
            const sx = ((i * 73 + 17) % 100) / 100 * width;
            const sy = ((i * 41 + 9) % 100) / 100 * Math.min(height, ceilingY);
            const alpha = starAlpha * (.55 + .45 * Math.sin(animTime * 2.2 + i * .9));
            ctx.fillStyle = `rgba(255,244,205,${alpha.toFixed(2)})`;
            ellipse(sx, sy, Math.max(1.5, unit * .04), Math.max(1.5, unit * .04), ctx.fillStyle);
          }
        }
        const moonY = wallY(16.4);
        if (moonY > -unit * 2 && moonY < ceilingY) {
          ellipse(xFor(2.75), moonY, unit * .52, unit * .52, '#fff3ba');
          ellipse(xFor(2.95), moonY - unit * .12, unit * .44, unit * .44, skyTone());
        }
        const sunY = wallY(10.6);
        if (sunY > -unit * 2 && sunY < ceilingY) {
          ellipse(xFor(2.9), sunY, unit * .9, unit * .9, 'rgba(255,228,158,0.32)');
          ellipse(xFor(2.9), sunY, unit * .62, unit * .62, '#fff0b3');
        }
        const cloudColor = focusY <= 8.5 ? '#fafcff' : focusY <= 12 ? '#ffe1c7' : '#8598bb';
        for (const [cx, cy, sc, sp, ph] of [
          [-2.8, 9.3, .85, .24, .3], [2.6, 10.3, .95, .2, 1.6],
          [-2.5, 11.7, 1.0, .28, 2.5], [2.9, 12.9, .88, .22, 3.8],
          [-2.7, 14.3, .95, .25, 5.1], [2.4, 15.6, .82, .19, .9]
        ]) {
          const py = wallY(cy);
          if (py < -unit * 2 || py > ceilingY + unit) continue;
          const px = xFor(cx + Math.sin(animTime * sp + ph) * .65);
          ellipse(px, py, unit * .75 * sc, unit * .34 * sc, cloudColor);
          ellipse(px - unit * .45 * sc, py + unit * .06 * sc, unit * .52 * sc, unit * .25 * sc, cloudColor);
          ellipse(px + unit * .48 * sc, py + unit * .06 * sc, unit * .55 * sc, unit * .26 * sc, cloudColor);
        }
        const signY = wallY(8.95);
        if (signY > -unit * 2 && signY < ceilingY + unit) {
          roundRect(xFor(-3.65), signY - unit * .38, unit * 1.6, unit * .76, 4, '#f8efd7', '#9e3828');
          ctx.fillStyle = '#9e3828';
          ctx.font = `bold ${Math.max(10, Math.round(unit * .28))}px "Malgun Gothic", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('냉면탑', xFor(-2.85), signY);
        }
        const balY = wallY(13.0 + Math.sin(animTime * .7) * .28);
        if (balY > -unit * 2 && balY < ceilingY + unit) {
          const bx = xFor(2.85 + Math.cos(animTime * .35) * .18);
          ellipse(bx, balY, unit * .56, unit * .66, '#c94f35');
          roundRect(bx - unit * .52, balY - unit * .12, unit * 1.04, unit * .22, 3, '#f7e6b8');
          roundRect(bx - unit * .12, balY + unit * .78, unit * .24, unit * .18, 2, '#7d5638');
        }
        const kiteY = wallY(14.3 + Math.sin(animTime * 1.1) * .15);
        if (kiteY > -unit * 2 && kiteY < ceilingY + unit) {
          const kx = xFor(-2.85);
          roundRect(kx - unit * .32, kiteY - unit * .38, unit * .64, unit * .76, 3, '#f7eed6', '#5b3a28');
          ellipse(kx, kiteY - unit * .04, unit * .16, unit * .16, '#b73e2c');
        }
      }

      if (ceilingY < height) {
        const wallTop = Math.max(0, ceilingY);
        const wall = ctx.createLinearGradient(0, wallTop, 0, height);
        wall.addColorStop(0, '#ecdec3');
        wall.addColorStop(.5, '#e3d6bd');
        wall.addColorStop(1, '#cabfa5');
        ctx.fillStyle = wall;
        ctx.fillRect(0, wallTop, width, height - wallTop);

        if (ceilingY >= -unit * 2 && ceilingY < height) {
          ctx.fillStyle = '#5b3a28';
          ctx.fillRect(0, ceilingY - unit * .22, width, unit * .44);
          ctx.fillStyle = '#3b484c';
          ctx.fillRect(xFor(-4.6), ceilingY - unit * .42, unit * 2.5, unit * .22);
          ctx.fillRect(xFor(2.1), ceilingY - unit * .42, unit * 2.5, unit * .22);
        }

        const railY = wallY(4.1);
        if (railY > wallTop && railY < height) {
          ctx.fillStyle = '#5b3a28';
          ctx.fillRect(0, railY - 2, width, Math.max(3, unit * .07));
        }

        const menuY = wallY(2.55);
        if (menuY > -unit * 2 && menuY < height + unit * 2) {
          roundRect(xFor(-3.55), menuY - unit * .65, unit * 1.8, unit * 1.3, 4, '#f5ecd3', '#5b3a28');
          ctx.fillStyle = '#334d44';
          ctx.font = `bold ${Math.max(9, Math.round(unit * .16))}px "Malgun Gothic", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('차림표', xFor(-2.65), menuY - unit * .34);
        }
        const shelfY = wallY(2.25);
        if (shelfY > -unit * 2 && shelfY < height + unit * 2) {
          roundRect(xFor(1.98), shelfY, unit * 1.34, unit * .08, 2, '#7c5538');
          roundRect(xFor(2.24), shelfY - unit * .46, unit * .36, unit * .46, 6, '#5f3927');
        }
        const clockY = wallY(3.75);
        if (clockY > -unit * 2 && clockY < height + unit * 2) {
          ellipse(xFor(2.65), clockY, unit * .36, unit * .36, '#fbf4df', '#a78251', 3);
        }
        const plaqueY = wallY(5.25);
        if (plaqueY > -unit * 2 && plaqueY < height + unit * 2) {
          roundRect(xFor(-3.65), plaqueY - unit * .48, unit * 1.9, unit * .96, 4, '#f2e8ce', '#5b3a28');
          ctx.fillStyle = '#253932';
          ctx.font = `bold ${Math.max(10, Math.round(unit * .22))}px "Malgun Gothic", serif`;
          ctx.textAlign = 'center';
          ctx.fillText('平壤冷麵', xFor(-2.7), plaqueY);
        }
        const winY = wallY(5.15);
        if (winY > -unit * 2 && winY < height + unit * 2) {
          roundRect(xFor(1.85), winY - unit * .54, unit * 1.6, unit * 1.08, 4, '#fff6dc', '#5b3a28');
        }
        const lampY = wallY(6.45);
        if (lampY > -unit * 2 && lampY < height + unit * 2) {
          for (const lx of [-2.7, 2.7]) {
            const px = xFor(lx);
            ctx.fillStyle = '#5b3a28';
            ctx.fillRect(px - 1, Math.max(0, ceilingY), 2, Math.max(0, lampY - Math.max(0, ceilingY)));
            ellipse(px, lampY + unit * .08, unit * .12, unit * .12, '#fff3c9');
            roundRect(px - unit * .35, lampY - unit * .12, unit * .7, unit * .2, 4, '#5c8075');
          }
        }
      }

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
      const apronTop = counterY + unit * 2;
      if (apronTop < height) {
        const apron = ctx.createLinearGradient(0, apronTop, 0, height);
        apron.addColorStop(0, '#795139');
        apron.addColorStop(1, '#4e3023');
        ctx.fillStyle = apron;
        ctx.fillRect(0, apronTop, width, height - apronTop);
        ctx.fillStyle = 'rgba(40,24,15,.27)';
        ctx.fillRect(0, apronTop, width, Math.max(2, unit * .045));
      }

      if (width > 650) {
        const leftX = xFor(-3.7);
        const rightX = xFor(3.7);
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

    function trayVisual() {
      const centerY = yFor(TRAY_Y);
      const trayW = unit * 3.5;
      const trayH = unit * .8;
      const surfaceY = -unit * .015 * .953;
      ctx.save();
      ctx.translate(xFor(0), centerY);
      const metal = ctx.createLinearGradient(-trayW / 2, 0, trayW / 2, 0);
      metal.addColorStop(0, '#577478');
      metal.addColorStop(.15, '#bdcfc9');
      metal.addColorStop(.54, '#879f9a');
      metal.addColorStop(.86, '#d6e5dc');
      metal.addColorStop(1, '#45696b');
      ctx.shadowColor = 'rgba(39,32,24,.33)';
      ctx.shadowBlur = unit * .18;
      ctx.shadowOffsetY = unit * .1;
      roundRect(-trayW / 2, surfaceY - trayH / 2, trayW, trayH, unit * .22, metal, '#dce8df');
      ctx.shadowColor = 'transparent';
      const insetMetal = ctx.createLinearGradient(-trayW * .46, 0, trayW * .46, 0);
      insetMetal.addColorStop(0, '#536f72');
      insetMetal.addColorStop(.18, '#aabfba');
      insetMetal.addColorStop(.49, '#78908b');
      insetMetal.addColorStop(.8, '#a9c0b8');
      insetMetal.addColorStop(1, '#4a6b6b');
      roundRect(-trayW * .477, surfaceY - trayH * .41, trayW * .954, trayH * .82, unit * .17, insetMetal, 'rgba(29,67,69,.42)');
      ctx.beginPath();
      ctx.roundRect(-trayW * .462, surfaceY - trayH * .385, trayW * .924, trayH * .77, unit * .15);
      ctx.strokeStyle = 'rgba(224,238,229,.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ellipse(0, surfaceY + unit * .05, unit * 1.05, unit * .12, 'rgba(24,50,48,.29)');
      ctx.restore();
    }

    // Project the bowl's symmetry axis into the same angled view as the 3D camera.
    function projectAxis(item) {
      const q = item.rotation;
      const tilt = item.tilt || 0;
      const x = q ? 2 * (q.x * q.y - q.w * q.z) : Math.sin(tilt);
      const y = q ? 1 - 2 * (q.x * q.x + q.z * q.z) : Math.cos(tilt);
      const z = q ? 2 * (q.y * q.z + q.w * q.x) : 0;
      const vertical = y * .9537 - z * .3008;
      return {
        angle: Math.atan2(x, vertical),
        length: Math.hypot(x, vertical),
        facing: y * .3008 + z * .9537
      };
    }

    function bowl(item) {
      const x = xFor(item.x || 0);
      const y = yFor(item.y || 0) + (item.z || 0) * unit * .3008;
      const s = unit * (item.scale || 1);
      const radius = 1.22 * s;
      const axis = projectAxis(item);
      const rimY = -.78 * s * axis.length;
      const lipDepth = radius * Math.abs(axis.facing);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(axis.angle);
      const variant = item.variant || 'steel';
      const isBrass = variant === 'brass';
      const metal = ctx.createLinearGradient(-radius, 0, radius, 0);
      if (isBrass) {
        metal.addColorStop(0, '#785a21');
        metal.addColorStop(.14, '#fae69e');
        metal.addColorStop(.32, '#d1ab4d');
        metal.addColorStop(.52, '#8b6826');
        metal.addColorStop(.78, '#fff0b3');
        metal.addColorStop(1, '#c89f43');
      } else {
        metal.addColorStop(0, '#35595e');
        metal.addColorStop(.1, '#e2f1e9');
        metal.addColorStop(.19, '#789996');
        metal.addColorStop(.32, '#d2e3dc');
        metal.addColorStop(.5, '#466d6c');
        metal.addColorStop(.66, '#aecac2');
        metal.addColorStop(.78, '#f5f9ec');
        metal.addColorStop(.9, '#567c7d');
        metal.addColorStop(1, '#deebe2');
      }
      ctx.shadowColor = 'rgba(18,47,48,.26)';
      ctx.shadowBlur = unit * .07;
      ctx.shadowOffsetY = unit * .035;
      if (axis.facing < 0) {
        ellipse(0, rimY, radius, lipDepth, metal, '#d9e8de', Math.max(1, s * .025));
      }
      ctx.beginPath();
      ctx.moveTo(-radius, rimY);
      ctx.bezierCurveTo(-radius * .87, rimY * .69, -radius * .55, rimY * .07, -radius * .42, 0);
      ctx.quadraticCurveTo(0, lipDepth * .84, radius * .42, 0);
      ctx.bezierCurveTo(radius * .55, rimY * .07, radius * .87, rimY * .69, radius, rimY);
      ctx.closePath();
      ctx.fillStyle = metal;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      if (axis.facing < 0) {
        ellipse(0, 0, radius * .46, lipDepth * .46, '#75928e', '#dce9df', Math.max(1, s * .018));
        ctx.restore();
        return;
      }
      const inside = ctx.createRadialGradient(-s * .16, rimY - s * .06, s * .02, 0, rimY, radius);
      inside.addColorStop(0, isBrass ? '#c4a24d' : '#8aa8a1');
      inside.addColorStop(.45, isBrass ? '#9e7d34' : '#5c7e7b');
      inside.addColorStop(.88, isBrass ? '#6a4f1b' : '#2b4e54');
      inside.addColorStop(1, isBrass ? '#f3dfa0' : '#cde3d9');
      ellipse(0, rimY, radius * .965, lipDepth, isBrass ? '#8b6d28' : '#3d6062', isBrass ? '#fdf2bf' : '#ecf6eb', Math.max(2.2, s * .03));
      ellipse(0, rimY + lipDepth * .1, radius * .82, lipDepth * .83, inside, 'rgba(223,240,225,.6)', 1);
      if (variant === 'noodle' || variant === 'bibim') {
        const gy = rimY + lipDepth * .22;
        if (variant === 'noodle') {
          ellipse(0, gy, radius * .58, lipDepth * .5, 'rgba(220,204,155,.72)');
          roundRect(-s * .34, gy - lipDepth * .14, s * .14, Math.max(3, lipDepth * .24), 2, '#e6f8ff');
        } else {
          ellipse(0, gy, radius * .44, lipDepth * .38, '#9b8e78');
          ellipse(-s * .04, gy, radius * .24, lipDepth * .2, '#b8331e');
        }
        ellipse(s * .22, gy, s * .16, Math.max(3, lipDepth * .24), '#faf6ea');
        ellipse(s * .22, gy, s * .08, Math.max(2, lipDepth * .14), '#f0b532');
      }
      ctx.beginPath();
      ctx.ellipse(0, rimY, radius * .965, lipDepth, 0, 0, Math.PI);
      ctx.strokeStyle = '#f5fbef';
      ctx.lineWidth = Math.max(2.2, s * .035);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-radius * .78, rimY * .64);
      ctx.quadraticCurveTo(0, rimY * .64 + lipDepth * .75, radius * .78, rimY * .64);
      ctx.strokeStyle = 'rgba(19,51,54,.38)';
      ctx.lineWidth = Math.max(1, s * .012);
      ctx.stroke();
      ctx.restore();
    }

    function render(frame) {
      resize();
      const ready = !frame || frame.mode === 'ready';
      const settled = ready
        ? Array.from({ length: 5 }, (_, index) => ({ x: -.06 + index * .03, y: TRAY_Y + .019 + index * .3, tilt: index * .012, scale: 1 }))
        : frame.bowls || [];
      const targetX = ready ? 0 : (frame && Number.isFinite(frame.focusX) ? frame.focusX : 0);
      const targetY = ready ? 1.13 : Math.max(1.13, 1.13 + (frame && Number.isFinite(frame.focusY) ? frame.focusY : 0));
      focusX += (targetX - focusX) * .085;
      focusY += (targetY - focusY) * .085;
      const animTime = frame && Number.isFinite(frame.time) ? frame.time : 0;
      const chaos = !ready && frame?.chaos;
      const quakeActive = chaos && chaos.type === 'quake' && Math.sin(animTime * 3.2) > .3;
      ctx.save();
      if (quakeActive) {
        ctx.translate(Math.sin(animTime * 42) * 3, Math.cos(animTime * 37) * 1.5);
      }
      ctx.clearRect(0, 0, width, height);
      backdrop(animTime);
      trayVisual();
      const bowls = frame && frame.active ? settled.concat(frame.active) : settled;
      const depth = item => item.y * .3008 + (item.z || 0) * .9537;
      bowls.filter(item => item.y > focusY - 9.5 && item.y < focusY + 9.5)
        .slice(-40).sort((a, b) => depth(a) - depth(b)).forEach(bowl);
      if (chaos && chaos.type === 'wind') {
        const dir = chaos.dir || 1;
        ctx.save();
        ctx.strokeStyle = 'rgba(236, 250, 255, 0.6)';
        ctx.lineWidth = Math.max(2, unit * .035);
        for (let i = 0; i < 8; i++) {
          const raw = ((animTime * (5.2 + (i % 3) * .9) * dir + i * 1.45) % 10.4 + 10.4) % 10.4 - 5.2;
          const sx = xFor(focusX + raw);
          const sy = yFor(focusY - 2.2 + i * .72);
          ctx.beginPath();
          ctx.moveTo(sx - unit * .55, sy);
          ctx.lineTo(sx + unit * .55, sy);
          ctx.stroke();
        }
        ctx.restore();
      }
      const align = !ready && frame?.align;
      if (align) {
        const s = 1.04 - align.match * .05;
        const rx = 1.16 * s * unit;
        const ry = rx * .3008;
        ctx.save();
        ctx.translate(xFor(align.x || 0), yFor(align.y || 0));
        ctx.rotate(align.tilt || 0);
        ctx.beginPath();
        ctx.ellipse(0, -.77 * unit, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = align.locked
          ? 'rgba(255, 214, 102, 0.85)'
          : `rgba(247, 243, 220, ${(0.15 + align.match * 0.35).toFixed(2)})`;
        ctx.lineWidth = Math.max(2, unit * .032);
        ctx.stroke();
        ctx.restore();
      }
      const burst = !ready && frame?.burst;
      if (burst) {
        const isStunt = !burst.perfect && Boolean(burst.stunt);
        const age = frame.time - burst.time;
        const duration = burst.perfect ? .55 : isStunt ? .48 : .32;
        const p = age / duration;
        if (p >= 0 && p < 1) {
          const s = 1.05 + p * (burst.perfect ? .85 : isStunt ? .72 : .38);
          const rx = 1.18 * s * unit;
          const ry = rx * .3008;
          const alpha = (1 - p) * (1 - p) * (burst.perfect ? .9 : isStunt ? .85 : .5);
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(xFor(burst.x || 0), yFor((burst.y || 0) + .55), rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = burst.perfect
            ? `rgba(255, 217, 102, ${alpha.toFixed(2)})`
            : isStunt
              ? `rgba(255, 123, 71, ${alpha.toFixed(2)})`
              : `rgba(242, 247, 243, ${alpha.toFixed(2)})`;
          ctx.lineWidth = Math.max(2, unit * .045);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    return { render, resize };
  }

  window.createFallbackScene = createFallbackScene;
})();
