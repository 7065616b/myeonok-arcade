(function () {
  'use strict';
  const T = window.THREE;
  if (!T) return;

  function makeEnvironment() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const base = ctx.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, '#d5e3db');
    base.addColorStop(.22, '#253b3e');
    base.addColorStop(.44, '#809fa1');
    base.addColorStop(.51, '#e5eeeb');
    base.addColorStop(.58, '#405b5c');
    base.addColorStop(.8, '#14292e');
    base.addColorStop(1, '#617f78');
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
    softbox(275, 25, 24, 340, '#a9d6d3', 24);
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

  const steel = new T.MeshPhysicalMaterial({ color: 0xcbd8d6, metalness: .91, roughness: .18, envMapIntensity: 1.65, clearcoat: .28, clearcoatRoughness: .12, bumpMap: brushedTexture(), bumpScale: .014, side: T.DoubleSide });
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

  function blockMaterials(topColor, frontColor, sideColor) {
    return [sideColor, frontColor, topColor, sideColor, frontColor, sideColor]
      .map(color => new T.MeshStandardMaterial({ color, roughness: .76 }));
  }

  function makePedestal(scene) {
    const layers = [
      [0x86c7b8,0x3c8888,0x236b76], [0x74bba9,0x348388,0x226575],
      [0x83c7af,0x458f89,0x2c7478], [0x73b8a2,0x367d83,0x1e6572],
      [0x7dbfab,0x3d8b84,0x246e72], [0x6caf9e,0x337b7f,0x1c606c]
    ];
    const geometry = new T.BoxGeometry(2.24, .72, 2.24);
    for (let index = 0; index < 13; index++) {
      const cube = new T.Mesh(geometry, blockMaterials(...layers[index % layers.length]));
      cube.position.y = -.36 - index * .71;
      cube.castShadow = true;
      cube.receiveShadow = true;
      scene.add(cube);
    }
    const edge = new T.LineSegments(new T.EdgesGeometry(geometry), new T.LineBasicMaterial({ color: 0xc3edda, transparent: true, opacity: .28 }));
    edge.position.y = -.36;
    scene.add(edge);
  }

  function makeGuides(scene) {
    const guide = new T.Group();
    const material = new T.LineBasicMaterial({ color: 0xc7f3e3, transparent: true, opacity: .16 });
    for (const radius of [3.4, 5.1]) {
      const vertices = [];
      for (let index = 0; index < 4; index++) {
        const angle = Math.PI * .25 + index * Math.PI * .5;
        vertices.push(new T.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      }
      guide.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(vertices), material));
    }
    scene.add(guide);
    return guide;
  }

  window.createNoodleScene = function (canvas) {
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.13;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    const scene = new T.Scene();
    scene.environment = makeEnvironment();
    scene.add(new T.HemisphereLight(0xcceee6, 0x183e47, 1.25));
    const key = new T.DirectionalLight(0xfff9e8, 2.35);
    key.position.set(-4, 9, 7);
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
    const rimLight = new T.DirectionalLight(0x8adbd1, .9);
    rimLight.position.set(5, 6, -6);
    scene.add(rimLight);
    makePedestal(scene);
    const guides = makeGuides(scene);
    const camera = new T.OrthographicCamera(-3, 3, 3, -3, .1, 100);
    const models = [];
    let viewportWidth = 0;
    let viewportHeight = 0;
    let focusY = 1.4;
    let focusX = 0;
    let focusZ = 0;

    function resize() {
      const width = Math.max(1, canvas.clientWidth || canvas.width || 900);
      const height = Math.max(1, canvas.clientHeight || canvas.height || 900);
      if (width === viewportWidth && height === viewportHeight) return;
      viewportWidth = width;
      viewportHeight = height;
      renderer.setSize(width, height, false);
      const viewHeight = height < 520 && width > height
        ? 6.6
        : width < 600 ? 10.4 : Math.max(6.6, 900 / height * 6.6);
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
        ? Array.from({ length: 5 }, (_, index) => ({ x: 0, y: index * .34, z: 0, scale: 1, tilt: 0 }))
        : frame.bowls || [];
      const items = frame && frame.active ? settled.concat(frame.active) : settled;
      const topY = settled.length ? settled[settled.length - 1].y : 0;
      const targetY = ready ? 1.4 : Math.max(1.4, topY + (frame && frame.active ? .9 : .42));
      focusY += (targetY - focusY) * .085;
      const leader = settled[settled.length - 1];
      focusX += ((leader ? leader.x || 0 : 0) - focusX) * .075;
      focusZ += ((leader ? leader.z || 0 : 0) - focusZ) * .075;
      const visibleItems = items.filter(item => item.y > focusY - 5.8 && item.y < focusY + 5.8).slice(-32);
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
        model.rotation.set((item.tilt || 0) * .42, 0, -(item.tilt || 0));
      });
      guides.position.y = focusY - 1.5;
      camera.position.set(focusX + 9.2, focusY + 8.4, focusZ + 9.2);
      camera.lookAt(focusX, focusY, focusZ);
      renderer.render(scene, camera);
    }
    return { render, resize };
  };
})();
