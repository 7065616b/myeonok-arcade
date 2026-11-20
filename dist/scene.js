(function () {
  'use strict';
  const T = window.THREE;
  if (!T) return;
  const TRAY_Y = Number.isFinite(window.BOWL_TRAY_Y) ? window.BOWL_TRAY_Y : -.15;

  function makeEnvironment() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const base = ctx.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, '#d5e3db');
    base.addColorStop(.22, '#2b3839');
    base.addColorStop(.44, '#9caeaa');
    base.addColorStop(.51, '#e5eeeb');
    base.addColorStop(.58, '#687b7a');
    base.addColorStop(.8, '#283d40');
    base.addColorStop(1, '#848b83');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 1024, 512);
    const softbox = (x, y, w, h, color, blur) => {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    };
    softbox(50, 55, 160, 290, '#ffffff', 35);
    softbox(275, 25, 24, 340, '#c5e2dc', 24);
    softbox(342, 230, 58, 190, '#d7ded5', 28);
    softbox(500, 52, 86, 260, '#192c30', 35);
    softbox(724, 35, 98, 330, '#fff8e3', 37);
    softbox(930, 70, 29, 290, '#18272b', 21);
    const map = new T.CanvasTexture(canvas);
    map.mapping = T.EquirectangularReflectionMapping;
    map.colorSpace = T.SRGBColorSpace;
    return map;
  }

  function brushedTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, 512, 256);
    for (let index = 0; index < 190; index++) {
      const y = (index * 71) % 256;
      const gray = 112 + (index * 23) % 56;
      ctx.strokeStyle = `rgba(${gray},${gray},${gray},.19)`;
      ctx.lineWidth = index % 7 === 0 ? 1.2 : .5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = T.RepeatWrapping;
    texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(1, 1.5);
    return texture;
  }

  const steel = new T.MeshPhysicalMaterial({ color: 0xdce1dc, metalness: .9, roughness: .18, envMapIntensity: 1.7, clearcoat: .28, clearcoatRoughness: .12, bumpMap: brushedTexture(), bumpScale: .014, side: T.DoubleSide });
  const innerSteel = new T.MeshPhysicalMaterial({ color: 0x789b9a, metalness: .8, roughness: .29, envMapIntensity: .72, side: T.DoubleSide });
  const lip = new T.MeshPhysicalMaterial({ color: 0xf4faf6, metalness: .82, roughness: .1, envMapIntensity: 1.8 });
  const darkSteel = new T.MeshStandardMaterial({ color: 0x304b50, metalness: .83, roughness: .25 });
  const sheen = new T.MeshBasicMaterial({ color: 0xf8ffff, transparent: true, opacity: .16, depthWrite: false, side: T.DoubleSide });
  const shadow = new T.MeshBasicMaterial({ color: 0x172c30, transparent: true, opacity: .2, depthWrite: false, side: T.DoubleSide });
  const bowlProfile = [[0,.025],[.4,.025],[.54,.06],[.67,.13],[.79,.24],[.96,.43],[1.1,.61],[1.2,.75],[1.22,.78],[1.15,.78],[1.08,.68],[.92,.49],[.71,.31],[.55,.23],[0,.23]];
  const bowlGeometry = new T.LatheGeometry(bowlProfile.slice(0, 9).map(point => new T.Vector2(point[0], point[1])), 64);
  const interiorGeometry = new T.LatheGeometry(bowlProfile.slice(8).map(point => new T.Vector2(point[0], point[1])), 64);
  const footGeometry = new T.CylinderGeometry(.52, .57, .045, 48);
  const lipGeometry = new T.TorusGeometry(1.186, .037, 10, 72);
  const shadowRingGeometry = new T.TorusGeometry(1.07, .015, 8, 64);
  const footRingGeometry = new T.TorusGeometry(.55, .012, 8, 48);

  function ring(geometry, material, y) {
    const mesh = new T.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    mesh.castShadow = true;
    return mesh;
  }

  function reflectionStripe(angle, width, material) {
    const outer = [[.54,.08],[.67,.15],[.79,.26],[.96,.45],[1.1,.63],[1.19,.75]];
    const vertices = [];
    const indices = [];
    outer.forEach(([radius, y], index) => {
      for (const offset of [-width / 2, width / 2]) {
        const a = angle + offset;
        vertices.push(Math.sin(a) * (radius + .009), y, Math.cos(a) * (radius + .009));
      }
      if (index < outer.length - 1) {
        const i = index * 2;
        indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
      }
    });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new T.Mesh(geometry, material);
  }

  function makeBowl() {
    const group = new T.Group();
    const shell = new T.Mesh(bowlGeometry, steel);
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);
    const interior = new T.Mesh(interiorGeometry, innerSteel);
    interior.receiveShadow = true;
    group.add(interior);
    group.add(ring(lipGeometry, lip, .765));
    group.add(ring(shadowRingGeometry, darkSteel, .612));
    group.add(ring(footRingGeometry, lip, .06));
    const foot = new T.Mesh(footGeometry, darkSteel);
    foot.position.y = .018;
    foot.castShadow = true;
    group.add(foot);
    group.add(reflectionStripe(.64, .21, sheen));
    group.add(reflectionStripe(.98, .095, shadow));
    group.add(reflectionStripe(1.26, .05, sheen));
    const grooveMaterial = new T.MeshBasicMaterial({ color: 0x294b50, transparent: true, opacity: .16, depthWrite: false });
    for (const [radius, y] of [[.4,.235],[.56,.255],[.73,.325]]) {
      group.add(ring(new T.TorusGeometry(radius, .006, 4, 56), grooveMaterial, y));
    }
    return group;
  }

  function roundedShape(width, depth, radius) {
    const x = -width / 2;
    const y = -depth / 2;
    const shape = new T.Shape();
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + depth - radius);
    shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
    shape.lineTo(x + radius, y + depth);
    shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return shape;
  }

  function woodenTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#805c3d';
    ctx.fillRect(0, 0, 512, 256);
    for (let index = 0; index < 95; index++) {
      const y = (index * 137) % 256;
      ctx.strokeStyle = index % 3 ? 'rgba(46,26,13,.12)' : 'rgba(230,176,114,.13)';
      ctx.lineWidth = index % 8 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(180, y + 3, 360, y - 4, 512, y + 1);
      ctx.stroke();
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = T.RepeatWrapping;
    texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(3, 2);
    return texture;
  }

  function plasterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8dcc4';
    ctx.fillRect(0, 0, 1024, 512);
    const daylight = ctx.createRadialGradient(135, 12, 5, 145, 115, 760);
    daylight.addColorStop(0, 'rgba(255,251,231,.52)');
    daylight.addColorStop(.47, 'rgba(255,246,219,.19)');
    daylight.addColorStop(1, 'rgba(255,246,219,0)');
    ctx.fillStyle = daylight;
    ctx.fillRect(0, 0, 1024, 512);
    ctx.filter = 'blur(42px)';
    ctx.fillStyle = 'rgba(77,96,88,.085)';
    ctx.beginPath();
    ctx.moveTo(270, -90);
    ctx.lineTo(380, -90);
    ctx.lineTo(640, 590);
    ctx.lineTo(500, 590);
    ctx.closePath();
    ctx.fill();
    ctx.filter = 'none';
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }

  function traySurfaceTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const shine = ctx.createLinearGradient(0, 0, 512, 0);
    shine.addColorStop(0, '#728d8b');
    shine.addColorStop(.12, '#d9e5dc');
    shine.addColorStop(.26, '#91a6a0');
    shine.addColorStop(.47, '#c2d3ca');
    shine.addColorStop(.66, '#829c99');
    shine.addColorStop(.83, '#dee9e0');
    shine.addColorStop(1, '#607b7d');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, 512, 256);
    for (let index = 0; index < 65; index++) {
      const y = (index * 73) % 256;
      ctx.strokeStyle = index % 3 ? 'rgba(29,60,61,.045)' : 'rgba(255,255,245,.09)';
      ctx.lineWidth = index % 9 === 0 ? 1.2 : .5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }

  function menuBoardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5ecd3';
    ctx.fillRect(0, 0, 256, 192);
    ctx.strokeStyle = '#c9b489';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 240, 176);
    ctx.fillStyle = '#334d44';
    ctx.font = 'bold 20px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('차 림 표', 128, 38);
    ctx.fillStyle = '#9e3828';
    ctx.fillRect(46, 48, 164, 2);
    ctx.fillStyle = '#2d3f38';
    ctx.font = '15px "Malgun Gothic", sans-serif';
    const items = [['물냉면', '11,000'], ['비빔냉면', '11,500'], ['회냉면', '13,000'], ['왕만두', '7,000']];
    items.forEach(([name, price], idx) => {
      const y = 78 + idx * 25;
      ctx.textAlign = 'left';
      ctx.fillText(name, 30, y);
      ctx.textAlign = 'right';
      ctx.fillText(price, 226, y);
    });
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }

  function plaqueTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f2e8ce';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#a8936e';
    ctx.lineWidth = 3;
    ctx.strokeRect(7, 7, 242, 114);
    ctx.fillStyle = '#253932';
    ctx.font = 'bold 34px "Malgun Gothic", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('平 壤 冷 麵', 128, 56);
    ctx.fillStyle = '#607064';
    ctx.font = '13px "Malgun Gothic", sans-serif';
    ctx.fillText('냉 면 명 가', 128, 92);
    ctx.fillStyle = '#a83c2b';
    ctx.fillRect(212, 82, 18, 18);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }

  function rooftopSignTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8efd7';
    ctx.fillRect(0, 0, 256, 112);
    ctx.strokeStyle = '#9e3828';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, 244, 100);
    ctx.fillStyle = '#9e3828';
    ctx.font = 'bold 46px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('냉 면 탑', 128, 50);
    ctx.fillStyle = '#314c44';
    ctx.font = 'bold 14px "Malgun Gothic", sans-serif';
    ctx.fillText('면 옥 본 점', 128, 86);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }

  function makeCloud(material) {
    const group = new T.Group();
    for (const [x, y, z, sx, sy, sz] of [
      [0, 0, 0, 1.05, .62, .5],
      [-.58, -.06, -.04, .74, .48, .44],
      [.62, -.08, -.02, .78, .5, .45],
      [-.22, .22, .02, .68, .5, .42],
      [.26, .18, .03, .62, .46, .4]
    ]) {
      const puff = new T.Mesh(new T.SphereGeometry(.55, 14, 10), material);
      puff.position.set(x, y, z);
      puff.scale.set(sx, sy, sz);
      group.add(puff);
    }
    return group;
  }

  function room(scene) {
    const plaster = new T.MeshStandardMaterial({ map: plasterTexture(), roughness: 1 });
    const tileBase = new T.MeshStandardMaterial({ color: 0xd2ded1, roughness: .88 });
    const grout = new T.MeshStandardMaterial({ color: 0x95b5a9, roughness: 1 });
    const wood = new T.MeshStandardMaterial({ map: woodenTexture(), roughness: .75 });
    const woodEdge = new T.MeshStandardMaterial({ color: 0x5b3a28, roughness: .83 });
    const apronWood = new T.MeshStandardMaterial({ color: 0xb19076, map: woodenTexture(), roughness: .88 });
    const brass = new T.MeshStandardMaterial({ color: 0xa78251, metalness: .45, roughness: .43 });
    const wall = new T.Mesh(new T.BoxGeometry(36, 11.3, .1), plaster);
    wall.position.set(0, 2.15, -4.7);
    scene.add(wall);
    const pictureRail = new T.Mesh(new T.BoxGeometry(36, .08, .09), woodEdge);
    pictureRail.position.set(0, 4.1, -4.55);
    scene.add(pictureRail);
    const ceilingBeam = new T.Mesh(new T.BoxGeometry(36, .42, .7), woodEdge);
    ceilingBeam.position.set(0, 7.75, -4.35);
    scene.add(ceilingBeam);
    const tileWall = new T.Mesh(new T.BoxGeometry(30, 1.9, .08), grout);
    tileWall.position.set(0, .2, -4.61);
    scene.add(tileWall);
    const tileMesh = new T.InstancedMesh(new T.BoxGeometry(.84, .43, .035), tileBase, 23 * 4);
    const dummy = new T.Object3D();
    let index = 0;
    for (let row = 0; row < 4; row++) {
      for (let col = -11; col <= 11; col++) {
        dummy.position.set(col * .86 + (row % 2) * .43, -.34 + row * .45, -4.55);
        dummy.updateMatrix();
        tileMesh.setMatrixAt(index, dummy.matrix);
        tileMesh.setColorAt(index, new T.Color((row * 7 + col * 3) % 5 === 0 ? 0xc1d5c6 : (row + col) % 4 === 0 ? 0xb3ccc0 : 0xd3dfd0));
        index++;
      }
    }
    tileMesh.instanceMatrix.needsUpdate = true;
    tileMesh.instanceColor.needsUpdate = true;
    scene.add(tileMesh);
    const trim = new T.Mesh(new T.BoxGeometry(30, .065, .09), brass);
    trim.position.set(0, 1.22, -4.53);
    scene.add(trim);

    const counter = new T.Mesh(new T.BoxGeometry(30, .55, 8), [woodEdge, woodEdge, wood, woodEdge, woodEdge, woodEdge]);
    counter.position.set(0, -.48, .6);
    counter.receiveShadow = true;
    scene.add(counter);
    const edge = new T.Mesh(new T.BoxGeometry(30, .08, .13), brass);
    edge.position.set(0, -.24, 4.55);
    scene.add(edge);
    const apron = new T.Mesh(new T.BoxGeometry(36, 10, .11), apronWood);
    apron.position.set(0, -5.45, 4.59);
    scene.add(apron);
    const apronShadow = new T.Mesh(new T.BoxGeometry(30, .09, .14), woodEdge);
    apronShadow.position.set(0, -.49, 4.67);
    scene.add(apronShadow);

    const trayGroup = new T.Group();
    trayGroup.position.y = TRAY_Y;
    scene.add(trayGroup);
    const trayMetal = new T.MeshPhysicalMaterial({ color: 0xbac8c2, metalness: .85, roughness: .23, envMapIntensity: 1.3, side: T.DoubleSide });
    const trayGeometry = new T.ExtrudeGeometry(roundedShape(3.5, 2.7, .28), { depth: .028, bevelEnabled: true, bevelThickness: .012, bevelSize: .035, bevelSegments: 3, steps: 1 });
    const tray = new T.Mesh(trayGeometry, trayMetal);
    tray.rotation.x = -Math.PI / 2;
    tray.position.y = -.042;
    tray.castShadow = true;
    tray.receiveShadow = true;
    trayGroup.add(tray);
    const insetGeometry = new T.ShapeGeometry(roundedShape(3.31, 2.51, .24));
    const positions = insetGeometry.getAttribute('position');
    const coordinates = insetGeometry.getAttribute('uv');
    for (let index = 0; index < coordinates.count; index++) {
      coordinates.setXY(index, (positions.getX(index) + 1.655) / 3.31, (positions.getY(index) + 1.255) / 2.51);
    }
    coordinates.needsUpdate = true;
    const inset = new T.Mesh(insetGeometry, new T.MeshStandardMaterial({ map: traySurfaceTexture(), metalness: .5, roughness: .4, side: T.DoubleSide }));
    inset.rotation.x = -Math.PI / 2;
    inset.position.y = .015;
    inset.receiveShadow = true;
    trayGroup.add(inset);
    const rimPoints = roundedShape(3.5, 2.7, .28).getSpacedPoints(88).map(point => new T.Vector3(point.x, .019, -point.y));
    const rolledRim = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rimPoints, true), 96, .018, 6, true), lip);
    trayGroup.add(rolledRim);
    const groovePoints = roundedShape(3.31, 2.51, .24).getSpacedPoints(88).map(point => new T.Vector3(point.x, .018, -point.y));
    const groove = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(groovePoints, true), 96, .007, 5, true), darkSteel);
    trayGroup.add(groove);

    // Restrained kitchen details stay at the sides of the desktop stage.
    const holder = new T.Mesh(new T.CylinderGeometry(.29, .26, .58, 28), darkSteel);
    holder.position.set(-3.7, .09, -.2);
    holder.castShadow = true;
    scene.add(holder);
    for (let i = 0; i < 7; i++) {
      const stick = new T.Mesh(new T.CylinderGeometry(.013, .018, 1.25 + (i % 3) * .08, 8), new T.MeshStandardMaterial({ color: i % 2 ? 0xb58956 : 0x9c7148, roughness: .82 }));
      stick.position.set(-3.91 + (i % 4) * .13, .77, -.33 + Math.floor(i / 4) * .17);
      stick.rotation.z = (i - 3) * .025;
      scene.add(stick);
    }
    const bottle = new T.Mesh(new T.CylinderGeometry(.19, .23, .56, 20), new T.MeshStandardMaterial({ color: 0xa84933, roughness: .5 }));
    bottle.position.set(3.7, .08, -.3);
    bottle.castShadow = true;
    scene.add(bottle);
    const cap = new T.Mesh(new T.CylinderGeometry(.055, .14, .23, 20), new T.MeshStandardMaterial({ color: 0xe7cf9a, roughness: .5 }));
    cap.position.set(3.7, .47, -.3);
    scene.add(cap);

    // Zone 2: Mid diner wall (menu board, ceramic shelf, round wall clock)
    const menuGroup = new T.Group();
    menuGroup.position.set(-2.65, 2.55, -4.52);
    menuGroup.add(new T.Mesh(new T.BoxGeometry(1.86, 1.36, .06), woodEdge));
    const menuFace = new T.Mesh(new T.PlaneGeometry(1.75, 1.25), new T.MeshStandardMaterial({ map: menuBoardTexture(), roughness: .9 }));
    menuFace.position.z = .035;
    menuGroup.add(menuFace);
    scene.add(menuGroup);

    const shelf = new T.Mesh(new T.BoxGeometry(1.35, .07, .42), wood);
    shelf.position.set(2.65, 2.25, -4.35);
    scene.add(shelf);
    for (const bx of [2.18, 3.12]) {
      const bracket = new T.Mesh(new T.BoxGeometry(.05, .24, .34), woodEdge);
      bracket.position.set(bx, 2.11, -4.38);
      scene.add(bracket);
    }
    const jarMat = new T.MeshStandardMaterial({ color: 0x5f3927, roughness: .35, metalness: .15 });
    const jarBody = new T.Mesh(new T.CylinderGeometry(.21, .16, .48, 20), jarMat);
    jarBody.position.set(2.42, 2.52, -4.33);
    scene.add(jarBody);
    const jarRim = new T.Mesh(new T.CylinderGeometry(.17, .17, .06, 20), woodEdge);
    jarRim.position.set(2.42, 2.78, -4.33);
    scene.add(jarRim);
    const miniBowlMat = new T.MeshStandardMaterial({ color: 0xe3dfd2, roughness: .4 });
    for (let i = 0; i < 3; i++) {
      const mini = new T.Mesh(new T.CylinderGeometry(.18, .1, .1, 18), miniBowlMat);
      mini.position.set(2.96, 2.34 + i * .07, -4.33);
      scene.add(mini);
    }

    const clockGroup = new T.Group();
    clockGroup.position.set(2.65, 3.75, -4.52);
    const clockRim = new T.Mesh(new T.CylinderGeometry(.38, .38, .08, 28), brass);
    clockRim.rotation.x = Math.PI / 2;
    clockGroup.add(clockRim);
    const clockFace = new T.Mesh(new T.CircleGeometry(.33, 28), new T.MeshBasicMaterial({ color: 0xfbf4df }));
    clockFace.position.z = .045;
    clockGroup.add(clockFace);
    const clockHands = new T.Group();
    clockHands.position.z = .052;
    const hourHand = new T.Mesh(new T.BoxGeometry(.024, .16, .01), new T.MeshBasicMaterial({ color: 0x203e3a }));
    hourHand.position.y = .065;
    const minHand = new T.Mesh(new T.BoxGeometry(.016, .24, .01), new T.MeshBasicMaterial({ color: 0xab3d2b }));
    minHand.position.set(.07, .03, 0);
    minHand.rotation.z = -1.1;
    clockHands.add(hourHand, minHand);
    clockGroup.add(clockHands);
    scene.add(clockGroup);

    // Zone 3: Upper diner wall, hanji transom window, and hanging pendant lamps
    const plaqueGroup = new T.Group();
    plaqueGroup.position.set(-2.7, 5.25, -4.52);
    plaqueGroup.add(new T.Mesh(new T.BoxGeometry(1.96, 1.0, .06), woodEdge));
    const plaqueFace = new T.Mesh(new T.PlaneGeometry(1.85, .9), new T.MeshStandardMaterial({ map: plaqueTexture(), roughness: .92 }));
    plaqueFace.position.z = .035;
    plaqueGroup.add(plaqueFace);
    scene.add(plaqueGroup);

    const winGroup = new T.Group();
    winGroup.position.set(2.65, 5.15, -4.55);
    winGroup.add(new T.Mesh(new T.BoxGeometry(1.66, 1.12, .06), woodEdge));
    const winPane = new T.Mesh(new T.PlaneGeometry(1.54, 1.0), new T.MeshBasicMaterial({ color: 0xfff6dc }));
    winPane.position.z = .035;
    winGroup.add(winPane);
    for (const mx of [-.38, 0, .38]) {
      const mullionV = new T.Mesh(new T.BoxGeometry(.035, 1.0, .02), woodEdge);
      mullionV.position.set(mx, 0, .045);
      winGroup.add(mullionV);
    }
    const mullionH = new T.Mesh(new T.BoxGeometry(1.54, .035, .02), woodEdge);
    mullionH.position.set(0, 0, .045);
    winGroup.add(mullionH);
    scene.add(winGroup);

    const lampShadeMat = new T.MeshStandardMaterial({ color: 0x5c8075, metalness: .35, roughness: .42, side: T.DoubleSide });
    const bulbMat = new T.MeshBasicMaterial({ color: 0xfff3c9 });
    for (const lx of [-2.7, 2.7]) {
      const cord = new T.Mesh(new T.CylinderGeometry(.014, .014, 1.3, 8), woodEdge);
      cord.position.set(lx, 7.1, -2.6);
      scene.add(cord);
      const shade = new T.Mesh(new T.ConeGeometry(.38, .24, 24, 1, true), lampShadeMat);
      shade.position.set(lx, 6.45, -2.6);
      scene.add(shade);
      const bulb = new T.Mesh(new T.SphereGeometry(.09, 12, 10), bulbMat);
      bulb.position.set(lx, 6.36, -2.6);
      scene.add(bulb);
    }

    // Zone 4: Roof breakout & daytime sky
    const roofMat = new T.MeshStandardMaterial({ color: 0x3b484c, roughness: .78 });
    for (const side of [-1, 1]) {
      const eave = new T.Mesh(new T.BoxGeometry(2.6, .18, .9), roofMat);
      eave.position.set(side * 3.25, 8.05, -4.3);
      eave.rotation.z = side * -.14;
      scene.add(eave);
      for (let r = 0; r < 5; r++) {
        const rib = new T.Mesh(new T.CylinderGeometry(.055, .055, .92, 8), darkSteel);
        rib.rotation.x = Math.PI / 2;
        rib.position.set(side * (2.25 + r * .46), 8.15 - r * .06, -4.3);
        scene.add(rib);
      }
    }

    const signGroup = new T.Group();
    signGroup.position.set(-2.85, 8.95, -4.35);
    for (const sx of [-.65, .65]) {
      const post = new T.Mesh(new T.CylinderGeometry(.035, .035, 1.25, 8), darkSteel);
      post.position.set(sx, -.55, -.05);
      signGroup.add(post);
    }
    signGroup.add(new T.Mesh(new T.BoxGeometry(1.72, .78, .08), woodEdge));
    const signFace = new T.Mesh(new T.PlaneGeometry(1.62, .68), new T.MeshBasicMaterial({ map: rooftopSignTexture() }));
    signFace.position.z = .045;
    signGroup.add(signFace);
    scene.add(signGroup);

    const sunGroup = new T.Group();
    sunGroup.position.set(2.9, 10.6, -5.2);
    sunGroup.add(new T.Mesh(new T.CircleGeometry(.66, 32), new T.MeshBasicMaterial({ color: 0xfff0b3 })));
    const sunHalo = new T.Mesh(new T.RingGeometry(.66, 1.05, 32), new T.MeshBasicMaterial({ color: 0xffe49e, transparent: true, opacity: .35 }));
    sunHalo.position.z = -.02;
    sunGroup.add(sunHalo);
    scene.add(sunGroup);

    const skyClouds = [];
    for (const [cx, cy, cz, scale, speed, phase] of [
      [-2.8, 9.3, -4.6, .85, .24, .3],
      [2.6, 10.3, -4.4, .95, .2, 1.6],
      [-2.5, 11.7, -4.7, 1.0, .28, 2.5],
      [2.9, 12.9, -4.3, .88, .22, 3.8],
      [-2.7, 14.3, -4.6, .95, .25, 5.1],
      [2.4, 15.6, -4.5, .82, .19, .9]
    ]) {
      const tintMat = new T.MeshBasicMaterial({ color: 0xfafcff, transparent: true, opacity: .9 });
      const group = makeCloud(tintMat);
      group.position.set(cx, cy, cz);
      group.scale.setScalar(scale);
      scene.add(group);
      skyClouds.push({ group, baseX: cx, speed, phase, tintMat });
    }

    const birds = [];
    const birdMat = new T.MeshBasicMaterial({ color: 0x2d4347, side: T.DoubleSide });
    for (const [bx, by, speed, phase] of [
      [-1.8, 10.0, .42, .4],
      [-2.4, 10.4, .42, .9],
      [2.1, 11.2, .35, 2.2]
    ]) {
      const bird = new T.Group();
      const wingL = new T.Mesh(new T.BoxGeometry(.18, .025, .06), birdMat);
      wingL.position.x = -.08;
      wingL.rotation.z = .35;
      const wingR = new T.Mesh(new T.BoxGeometry(.18, .025, .06), birdMat);
      wingR.position.x = .08;
      wingR.rotation.z = -.35;
      bird.add(wingL, wingR);
      bird.position.set(bx, by, -4.1);
      scene.add(bird);
      birds.push({ group: bird, baseX: bx, baseY: by, speed, phase, wingL, wingR });
    }

    // Zone 5: Golden-hour sunset (hot-air balloon & traditional shield kite)
    const balloon = new T.Group();
    balloon.position.set(2.85, 13.0, -4.4);
    const balloonEnv = new T.Mesh(new T.SphereGeometry(.58, 20, 16), new T.MeshStandardMaterial({ color: 0xc94f35, roughness: .65 }));
    balloonEnv.scale.set(1, 1.18, 1);
    balloon.add(balloonEnv);
    const balloonBand = new T.Mesh(new T.CylinderGeometry(.59, .59, .24, 20), new T.MeshStandardMaterial({ color: 0xf7e6b8, roughness: .7 }));
    balloonBand.position.y = .04;
    balloon.add(balloonBand);
    const basket = new T.Mesh(new T.BoxGeometry(.22, .18, .22), wood);
    basket.position.y = -.88;
    balloon.add(basket);
    for (const rx of [-.08, .08]) {
      const rope = new T.Mesh(new T.CylinderGeometry(.008, .008, .3, 6), woodEdge);
      rope.position.set(rx, -.72, 0);
      balloon.add(rope);
    }
    scene.add(balloon);

    const kite = new T.Group();
    kite.position.set(-2.85, 14.3, -4.2);
    kite.rotation.z = .18;
    const kiteBody = new T.Mesh(new T.BoxGeometry(.64, .78, .03), new T.MeshBasicMaterial({ color: 0xf7eed6 }));
    kite.add(kiteBody);
    const kiteCircle = new T.Mesh(new T.CircleGeometry(.17, 20), new T.MeshBasicMaterial({ color: 0xb73e2c }));
    kiteCircle.position.set(0, .06, .02);
    kite.add(kiteCircle);
    const kiteTail1 = new T.Mesh(new T.BoxGeometry(.05, .36, .02), new T.MeshBasicMaterial({ color: 0x3b6f8a }));
    kiteTail1.position.set(-.14, -.55, 0);
    const kiteTail2 = new T.Mesh(new T.BoxGeometry(.05, .36, .02), new T.MeshBasicMaterial({ color: 0xd98f36 }));
    kiteTail2.position.set(.14, -.55, 0);
    kite.add(kiteTail1, kiteTail2);
    scene.add(kite);

    // Zone 6: Starry night (crescent moon + wrapping star field)
    const moonGroup = new T.Group();
    moonGroup.position.set(2.75, 16.4, -5.0);
    moonGroup.add(new T.Mesh(new T.CircleGeometry(.52, 28), new T.MeshBasicMaterial({ color: 0xfff3ba })));
    const moonCut = new T.Mesh(new T.CircleGeometry(.44, 28), new T.MeshBasicMaterial({ color: 0x1e2d4d }));
    moonCut.position.set(.2, .12, .02);
    moonGroup.add(moonCut);
    scene.add(moonGroup);

    const starField = new T.Group();
    starField.position.set(0, 14.5, -5.3);
    const stars = [];
    const starGeo = new T.CircleGeometry(.055, 6);
    for (let i = 0; i < 46; i++) {
      const sx = (((i * 73 + 17) % 100) / 100 - .5) * 11.0;
      const sy = ((i * 41 + 9) % 180) / 10;
      const mat = new T.MeshBasicMaterial({ color: i % 4 === 0 ? 0xffe9a8 : 0xf4f8ff, transparent: true, opacity: 0 });
      const star = new T.Mesh(starGeo, mat);
      star.position.set(sx, sy, 0);
      star.scale.setScalar(.7 + (i % 5) * .22);
      starField.add(star);
      stars.push({ mesh: star, mat, phase: i * .9 });
    }
    scene.add(starField);

    return { skyClouds, balloon, kite, birds, clockHands, stars, starField };
  }

  window.createNoodleScene = function (canvas) {
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(0xe9dcc2, 1);
    const scene = new T.Scene();
    scene.background = new T.Color(0xe9dcc2);
    scene.environment = makeEnvironment();
    scene.add(new T.HemisphereLight(0xfff1d8, 0x355a58, 1.15));
    const key = new T.DirectionalLight(0xffebc9, 2.05);
    key.position.set(-4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -.0005;
    key.shadow.normalBias = .025;
    key.shadow.radius = 3;
    scene.add(key);
    scene.add(key.target);
    const rimLight = new T.DirectionalLight(0x9edbd0, .65);
    rimLight.position.set(5, 5, 4);
    scene.add(rimLight);
    const { skyClouds, balloon, kite, birds, clockHands, stars, starField } = room(scene);
    const skyDay = new T.Color(0xbfe0ef);
    const skyBlue = new T.Color(0x8bc4e8);
    const skySunset = new T.Color(0xebb084);
    const skyDusk = new T.Color(0x6b5d8a);
    const skyNight = new T.Color(0x1e2d4d);
    const cloudDay = new T.Color(0xfafcff);
    const cloudSunset = new T.Color(0xffd7b8);
    const cloudNight = new T.Color(0x7c8fb5);
    const skyColor = new T.Color(0xbfe0ef);
    const camera = new T.OrthographicCamera(-3, 3, 3, -3, .1, 100);
    const models = [];
    const alignGroup = new T.Group();
    const alignMat = new T.MeshBasicMaterial({ color: 0xffe494, transparent: true, opacity: 0, depthWrite: false });
    const alignRing = new T.Mesh(new T.TorusGeometry(1.16, .022, 8, 64), alignMat);
    alignRing.rotation.x = Math.PI / 2;
    alignGroup.add(alignRing);
    alignGroup.visible = false;
    scene.add(alignGroup);
    const burstMat1 = new T.MeshBasicMaterial({ color: 0xffd966, transparent: true, opacity: 0, depthWrite: false });
    const burstRing1 = new T.Mesh(new T.TorusGeometry(1.18, .032, 8, 64), burstMat1);
    burstRing1.rotation.x = Math.PI / 2;
    burstRing1.visible = false;
    scene.add(burstRing1);
    const burstMat2 = new T.MeshBasicMaterial({ color: 0xfff6d1, transparent: true, opacity: 0, depthWrite: false });
    const burstRing2 = new T.Mesh(new T.TorusGeometry(1.18, .024, 8, 64), burstMat2);
    burstRing2.rotation.x = Math.PI / 2;
    burstRing2.visible = false;
    scene.add(burstRing2);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let viewportWidth = 0;
    let viewportHeight = 0;
    let focusX = 0;
    let focusY = 1.13;
    let viewHeight = 5.9;

    function resize() {
      const width = Math.max(1, canvas.clientWidth || canvas.width || 900);
      const height = Math.max(1, canvas.clientHeight || canvas.height || 900);
      if (width === viewportWidth && height === viewportHeight) return;
      viewportWidth = width;
      viewportHeight = height;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const baseHalfHeight = (width < 550 && height >= 520 ? 9.3 : 5.9) / 2;
      const minHalfWidth = width < 550 ? 3.65 : 3.85;
      const halfWidth = Math.max(baseHalfHeight * aspect, minHalfWidth);
      const halfHeight = halfWidth / aspect;
      viewHeight = halfHeight * 2;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    }

    function render(frame) {
      resize();
      const ready = !frame || frame.mode === 'ready';
      const settled = ready
        ? Array.from({ length: 5 }, (_, index) => ({ x: -.06 + index * .03, y: TRAY_Y + .019 + index * .3, z: 0, scale: 1, tilt: index * .012 }))
        : frame.bowls || [];
      const items = frame && frame.active ? settled.concat(frame.active) : settled;
      const targetX = ready ? 0 : (frame && Number.isFinite(frame.focusX) ? frame.focusX : 0);
      const targetY = ready ? 1.13 : Math.max(1.13, 1.13 + (frame && Number.isFinite(frame.focusY) ? frame.focusY : 0));
      focusX += (targetX - focusX) * .085;
      focusY += (targetY - focusY) * .085;
      const visibleItems = items.filter(item => item.y > focusY - 9.5 && item.y < focusY + 9.5).slice(-40);
      while (models.length < visibleItems.length) {
        const model = makeBowl();
        models.push(model);
        scene.add(model);
      }
      models.forEach((model, index) => {
        const item = visibleItems[index];
        model.visible = Boolean(item);
        if (!model.visible) return;
        model.position.set(item.x || 0, item.y || 0, item.z || 0);
        model.scale.setScalar(item.scale || 1);
        if (item.rotation) {
          const { x, y, z, w } = item.rotation;
          model.quaternion.set(x, y, z, w);
        } else {
          model.rotation.set(0, 0, -(item.tilt || 0));
        }
      });
      const align = !ready && frame?.align;
      alignGroup.visible = Boolean(align);
      if (align) {
        alignGroup.position.set(align.x || 0, (align.y || 0) + .77, 0);
        alignGroup.rotation.z = -(align.tilt || 0);
        alignRing.scale.setScalar(1.04 - align.match * .05);
        alignMat.color.setHex(align.locked ? 0xffd666 : 0xf7f3dc);
        alignMat.opacity = align.locked ? .85 : .15 + align.match * .35;
      }
      const burst = !ready && frame?.burst;
      burstRing1.visible = false;
      burstRing2.visible = false;
      let thump = 0;
      if (burst) {
        const age = frame.time - burst.time;
        const duration = burst.perfect ? .55 : .32;
        const p = age / duration;
        if (p >= 0 && p < 1) {
          burstRing1.visible = true;
          burstRing1.position.set(burst.x || 0, (burst.y || 0) + .55, 0);
          burstRing1.scale.setScalar(1.05 + p * (burst.perfect ? .85 : .38));
          burstMat1.color.setHex(burst.perfect ? 0xffd966 : 0xf2f7f3);
          burstMat1.opacity = (1 - p) * (1 - p) * (burst.perfect ? .9 : .5);
        }
        if (burst.perfect && burst.combo >= 2 && age > .06) {
          const p2 = (age - .06) / .49;
          if (p2 >= 0 && p2 < 1) {
            burstRing2.visible = true;
            burstRing2.position.set(burst.x || 0, (burst.y || 0) + .55, 0);
            burstRing2.scale.setScalar(1 + p2 * 1.15);
            burstMat2.color.setHex(0xfff6d1);
            burstMat2.opacity = (1 - p2) * (1 - p2) * .7;
          }
        }
        if (burst.perfect && !reducedMotion && age >= 0 && age < .18) {
          thump = Math.sin((age / .18) * Math.PI) * .065;
        }
      }
      const animTime = reducedMotion ? 0 : (frame && Number.isFinite(frame.time) ? frame.time : 0);
      if (focusY <= 4.5) {
        skyColor.copy(skyDay);
      } else if (focusY <= 8.5) {
        skyColor.copy(skyDay).lerp(skyBlue, (focusY - 4.5) / 4);
      } else if (focusY <= 11.5) {
        skyColor.copy(skyBlue).lerp(skySunset, (focusY - 8.5) / 3);
      } else if (focusY <= 14.5) {
        skyColor.copy(skySunset).lerp(skyDusk, (focusY - 11.5) / 3);
      } else {
        skyColor.copy(skyDusk).lerp(skyNight, Math.min(1, (focusY - 14.5) / 3));
      }
      scene.background.copy(skyColor);
      skyClouds.forEach(c => {
        c.group.position.x = c.baseX + Math.sin(animTime * c.speed + c.phase) * .65;
        if (focusY <= 8.5) c.tintMat.color.copy(cloudDay);
        else if (focusY <= 12.0) c.tintMat.color.copy(cloudDay).lerp(cloudSunset, (focusY - 8.5) / 3.5);
        else if (focusY <= 16.0) c.tintMat.color.copy(cloudSunset).lerp(cloudNight, (focusY - 12.0) / 4);
        else c.tintMat.color.copy(cloudNight);
      });
      birds.forEach(b => {
        b.group.position.x = b.baseX + Math.sin(animTime * b.speed + b.phase) * 1.4;
        b.group.position.y = b.baseY + Math.cos(animTime * 1.8 + b.phase) * .12;
        const flap = Math.sin(animTime * 7 + b.phase) * .28;
        b.wingL.rotation.z = .3 + flap;
        b.wingR.rotation.z = -.3 - flap;
      });
      balloon.position.y = 13.0 + Math.sin(animTime * .7) * .28;
      balloon.position.x = 2.85 + Math.cos(animTime * .35) * .18;
      kite.rotation.z = .18 + Math.sin(animTime * 1.4) * .09;
      kite.position.y = 14.3 + Math.sin(animTime * 1.1) * .15;
      clockHands.rotation.z = -animTime * .06;
      const starAlpha = Math.max(0, Math.min(1, (focusY - 11.5) / 3.5));
      starField.position.y = Math.max(14.5, focusY - 4);
      stars.forEach(s => {
        s.mat.opacity = starAlpha * (.55 + .45 * Math.sin(animTime * 2.2 + s.phase));
      });
      key.position.set(focusX - 4, focusY + 8, 6);
      key.target.position.set(focusX, focusY, 0);
      key.target.updateMatrixWorld();
      camera.position.set(focusX, focusY + 4.1 - thump, 13);
      camera.lookAt(focusX, focusY - thump, 0);
      renderer.render(scene, camera);
    }
    return { render, resize };
  };
})();
