import * as THREE from "./vendor/three.module.min.js";

const overlay = document.querySelector("#winOverlay");
const mount = document.querySelector("#winScene");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const previewWin = new URLSearchParams(window.location.search).get("win-preview") === "1";

if (overlay && previewWin) {
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
}

if (overlay && mount && !reduceMotion.matches) {
  initWinScene().catch(() => {
    overlay.classList.remove("three-ready");
  });
}

async function initWinScene() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  mount.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x173d31, 2.8));
  const keyLight = new THREE.DirectionalLight(0xffdfb4, 4.2);
  keyLight.position.set(4, 7, 8);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x8fd5c1, 2.4);
  rimLight.position.set(-5, 2, -4);
  scene.add(rimLight);

  const [catTexture, cardBackTexture] = await Promise.all([
    loadTexture("assets/favicon-cat.jpg", renderer),
    loadTexture("assets/card-back.jpg", renderer),
  ]);

  const card = createCard(cardBackTexture);
  card.position.y = -0.25;
  scene.add(card);

  const dancer = createDancer(catTexture);
  scene.add(dancer.group);

  let frameId = 0;
  let elapsed = 0;
  let previousTime = 0;

  function resize() {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    const aspect = width / height;
    const requiredHeight = Math.max(7.8, 6.3 / aspect);
    const distance = requiredHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    camera.position.set(0, 0.05, distance);
    camera.lookAt(0, -0.25, 0);
    camera.updateProjectionMatrix();
  }

  function update(time) {
    const orbit = time * 0.48;
    const beat = time * 4.4;
    const bounce = Math.abs(Math.sin(beat)) * 0.11;

    card.rotation.y = time * 0.78;
    card.rotation.z = Math.sin(time * 0.7) * 0.035;

    dancer.group.position.set(Math.cos(orbit) * 2.38, -0.42 + bounce, Math.sin(orbit) * 1.65);
    dancer.group.rotation.y = Math.sin(orbit) * 0.12;
    dancer.body.rotation.z = Math.sin(beat * 0.5) * 0.12;
    dancer.body.rotation.y = Math.sin(beat * 0.25) * 0.12;
    dancer.head.rotation.z = Math.sin(beat * 0.5 + 0.4) * 0.15;
    dancer.head.position.y = 1.2 + bounce * 0.35;

    dancer.leftArm.rotation.x = Math.sin(beat) * 0.82;
    dancer.rightArm.rotation.x = -Math.sin(beat) * 0.82;
    dancer.leftArm.rotation.z = 0.48 + Math.sin(beat * 0.5) * 0.42;
    dancer.rightArm.rotation.z = -0.48 - Math.sin(beat * 0.5) * 0.42;
    dancer.leftForearm.rotation.x = -0.55 - Math.max(0, Math.sin(beat)) * 0.72;
    dancer.rightForearm.rotation.x = -0.55 - Math.max(0, -Math.sin(beat)) * 0.72;

    dancer.leftLeg.rotation.x = -Math.sin(beat) * 0.62;
    dancer.rightLeg.rotation.x = Math.sin(beat) * 0.62;
    dancer.leftLeg.rotation.z = 0.08 + Math.sin(beat * 0.5) * 0.1;
    dancer.rightLeg.rotation.z = -0.08 - Math.sin(beat * 0.5) * 0.1;
    dancer.leftKnee.rotation.x = Math.max(0, Math.sin(beat)) * 0.72;
    dancer.rightKnee.rotation.x = Math.max(0, -Math.sin(beat)) * 0.72;
  }

  function renderFrame(now) {
    const delta = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0;
    previousTime = now;
    elapsed += delta;
    update(elapsed);
    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(renderFrame);
  }

  function syncAnimation() {
    const visible = overlay.classList.contains("show");
    if (visible && !frameId) {
      previousTime = 0;
      frameId = window.requestAnimationFrame(renderFrame);
    } else if (!visible && frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  const observer = new MutationObserver(syncAnimation);
  observer.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();
  update(0.35);
  renderer.render(scene, camera);
  overlay.classList.add("three-ready");
  syncAnimation();
}

async function loadTexture(path, renderer) {
  try {
    const texture = await new THREE.TextureLoader().loadAsync(path);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  } catch {
    return null;
  }
}

function createCard(backTexture) {
  const group = new THREE.Group();
  const width = 2.24;
  const height = 3.18;
  const geometry = roundedPlaneGeometry(width, height, 0.16);
  const frontTexture = createAceTexture();
  const front = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.72, metalness: 0.02 }),
  );
  front.position.z = 0.075;

  const back = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: backTexture,
      color: backTexture ? 0xffffff : 0x8a4e43,
      roughness: 0.72,
      metalness: 0.02,
    }),
  );
  back.position.z = -0.075;
  back.rotation.y = Math.PI;

  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.04, height - 0.04, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xe8dccb, roughness: 0.8 }),
  );

  group.add(edge, front, back);
  return group;
}

function createDancer(catTexture) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const jacket = new THREE.MeshStandardMaterial({ color: 0xa4414b, roughness: 0.78 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf0dfc7, roughness: 0.82 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x223f3b, roughness: 0.86 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6a64f, roughness: 0.58, metalness: 0.18 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x182521, roughness: 0.9 });
  const fur = new THREE.MeshStandardMaterial({ color: 0x9b806b, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.78, 7, 14), jacket);
  torso.position.y = 0.18;
  torso.scale.z = 0.64;
  body.add(torso);

  const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.72, 0.05), shirt);
  shirtPanel.position.set(0, 0.22, 0.4);
  body.add(shirtPanel);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 16), dark);
  belt.position.y = -0.45;
  body.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), gold);
  buckle.position.set(0, -0.45, 0.42);
  body.add(buckle);

  const head = new THREE.Group();
  head.position.y = 1.2;
  body.add(head);
  const headBase = new THREE.Mesh(new THREE.SphereGeometry(0.54, 20, 14), fur);
  headBase.scale.set(1, 0.92, 0.82);
  head.add(headBase);

  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshBasicMaterial({
      map: catTexture,
      color: catTexture ? 0xffffff : 0xc3a58d,
      toneMapped: false,
    }),
  );
  face.position.z = 0.47;
  head.add(face);

  const earGeometry = new THREE.ConeGeometry(0.25, 0.58, 3);
  const leftEar = new THREE.Mesh(earGeometry, fur);
  leftEar.position.set(-0.3, 0.49, 0.03);
  leftEar.rotation.z = 0.13;
  const rightEar = leftEar.clone();
  rightEar.position.x = 0.3;
  rightEar.rotation.z = -0.13;
  head.add(leftEar, rightEar);

  const leftArm = createLimb(body, { x: -0.49, y: 0.63, z: 0 }, 0.72, 0.14, jacket);
  leftArm.rotation.z = 0.48;
  const rightArm = createLimb(body, { x: 0.49, y: 0.63, z: 0 }, 0.72, 0.14, jacket);
  rightArm.rotation.z = -0.48;
  const leftForearm = createLimb(leftArm, { x: 0, y: -0.72, z: 0 }, 0.64, 0.12, shirt);
  const rightForearm = createLimb(rightArm, { x: 0, y: -0.72, z: 0 }, 0.64, 0.12, shirt);

  const leftLeg = createLimb(body, { x: -0.23, y: -0.48, z: 0 }, 0.82, 0.18, trousers);
  const rightLeg = createLimb(body, { x: 0.23, y: -0.48, z: 0 }, 0.82, 0.18, trousers);
  const leftKnee = createLimb(leftLeg, { x: 0, y: -0.82, z: 0 }, 0.76, 0.15, trousers);
  const rightKnee = createLimb(rightLeg, { x: 0, y: -0.82, z: 0 }, 0.76, 0.15, trousers);
  addShoe(leftKnee, dark);
  addShoe(rightKnee, dark);

  return {
    group,
    body,
    head,
    leftArm,
    rightArm,
    leftForearm,
    rightForearm,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
  };
}

function createLimb(parent, position, length, radius, material) {
  const pivot = new THREE.Group();
  pivot.position.set(position.x, position.y, position.z);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 5, 10), material);
  mesh.position.y = -length / 2;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

function addShoe(lowerLeg, material) {
  const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.28, 4, 9), material);
  shoe.position.set(0, -0.82, 0.13);
  shoe.rotation.x = Math.PI / 2;
  lowerLeg.add(shoe);
}

function roundedPlaneGeometry(width, height, radius) {
  const shape = new THREE.Shape();
  const left = -width / 2;
  const right = width / 2;
  const bottom = -height / 2;
  const top = height / 2;

  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);

  const geometry = new THREE.ShapeGeometry(shape, 8);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i += 1) {
    uvs.setXY(i, positions.getX(i) / width + 0.5, positions.getY(i) / height + 0.5);
  }
  return geometry;
}

function createAceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 1090;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f5eadb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#172019";
  context.font = "900 150px Georgia, serif";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("A", 72, 54);
  context.font = "720px Georgia, serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("♣", canvas.width / 2, canvas.height * 0.58);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
