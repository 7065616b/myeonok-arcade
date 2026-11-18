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
  const bowlProfile = [[0,.025],[.4,.025],[.54,.06],[.67,.13],[.79,.24],[.96,.43],[1.1,.61],[1.2,.75],[1.22,.78],[1.15,.78],[1.08,.68],[.92,.49],[.71,.31],[.44,.23],[0,.23]];
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

  function room(scene) {
    const plaster = new T.MeshStandardMaterial({ map: plasterTexture(), roughness: 1 });
    const tileBase = new T.MeshStandardMaterial({ color: 0xd2ded1, roughness: .88 });
    const grout = new T.MeshStandardMaterial({ color: 0x95b5a9, roughness: 1 });
    const wood = new T.MeshStandardMaterial({ map: woodenTexture(), roughness: .75 });
    const woodEdge = new T.MeshStandardMaterial({ color: 0x5b3a28, roughness: .83 });
    const apronWood = new T.MeshStandardMaterial({ color: 0xb19076, map: woodenTexture(), roughness: .88 });
    const brass = new T.MeshStandardMaterial({ color: 0xa78251, metalness: .45, roughness: .43 });
    const wall = new T.Mesh(new T.BoxGeometry(30, 15, .1), plaster);
    wall.position.set(0, 2.5, -4.7);
    scene.add(wall);
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
    const apron = new T.Mesh(new T.BoxGeometry(30, 3.8, .11), apronWood);
    apron.position.set(0, -2.35, 4.59);
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
    const rimLight = new T.DirectionalLight(0x9edbd0, .65);
    rimLight.position.set(5, 5, 4);
    scene.add(rimLight);
    room(scene);
    const camera = new T.OrthographicCamera(-3, 3, 3, -3, .1, 100);
    const models = [];
    let viewportWidth = 0;
    let viewportHeight = 0;
    let focusY = 1.13;
    let viewHeight = 5.9;

    function resize() {
      const width = Math.max(1, canvas.clientWidth || canvas.width || 900);
      const height = Math.max(1, canvas.clientHeight || canvas.height || 900);
      if (width === viewportWidth && height === viewportHeight) return;
      viewportWidth = width;
      viewportHeight = height;
      renderer.setSize(width, height, false);
      viewHeight = width < 550 && height >= 520 ? 9.3 : 5.9;
      const halfHeight = viewHeight / 2;
      const halfWidth = halfHeight * width / height;
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
      const targetY = ready ? 1.13 : Math.max(1.13, 1.13 + (frame && Number.isFinite(frame.focusY) ? frame.focusY : 0));
      focusY += (targetY - focusY) * .085;
      const visibleItems = items.filter(item => item.y > focusY - 5.2 && item.y < focusY + 5.2).slice(-40);
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
      camera.position.set(0, focusY + 4.1, 13);
      camera.lookAt(0, focusY, 0);
      renderer.render(scene, camera);
    }
    return { render, resize };
  };
})();
