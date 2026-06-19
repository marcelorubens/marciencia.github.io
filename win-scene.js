import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "./vendor/libs/meshopt_decoder.module.js";

const overlay = document.querySelector("#winOverlay");
const mount = document.querySelector("#winScene");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const previewWin = new URLSearchParams(window.location.search).get("win-preview") === "1";

if (overlay && previewWin) {
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
}

if (overlay && mount && !reduceMotion.matches) {
  let initialization;
  const ensureScene = () => {
    if (!overlay.classList.contains("show") || initialization) return;
    initialization = initWinScene().catch(() => {
      overlay.classList.remove("three-ready");
    });
  };
  const activationObserver = new MutationObserver(ensureScene);
  activationObserver.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  ensureScene();
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

  const [catTexture, cardBackTexture, mocapData] = await Promise.all([
    loadTexture("assets/favicon-cat.jpg", renderer),
    loadTexture("assets/card-back.jpg", renderer),
    loadMouseyMocap(),
  ]);

  const card = createCard(cardBackTexture);
  card.position.y = -0.25;
  scene.add(card);

  const dancer = createRiggedDancer(mocapData, catTexture, cardBackTexture);
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

    card.rotation.y = time * 0.78;
    card.rotation.z = Math.sin(time * 0.7) * 0.035;

    dancer.group.position.set(Math.cos(orbit) * 2.38, -0.42, Math.sin(orbit) * 1.65);
    dancer.group.rotation.y = time * 0.28;
    dancer.mixer.setTime(time % dancer.duration);
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

async function loadMouseyMocap() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync("vendor/motions/mousey-snake-hip-hop.glb");
  const clip = gltf.animations.find((animation) => animation.tracks.length > 0);
  return { root: gltf.scene, clip };
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
  front.position.z = 0.004;

  const back = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: backTexture,
      color: backTexture ? 0xffffff : 0x8a4e43,
      roughness: 0.72,
      metalness: 0.02,
    }),
  );
  back.position.z = -0.004;
  back.rotation.y = Math.PI;

  group.add(front, back);
  return group;
}

function createRiggedDancer(mocapData, catTexture, duvetTexture) {
  const group = new THREE.Group();
  const model = mocapData.root;
  const fabricTexture = createFabricTexture(duvetTexture);
  const headTexture = createCatHeadTexture(catTexture);
  const floral = new THREE.MeshStandardMaterial({
    map: fabricTexture,
    color: fabricTexture ? 0xffffff : 0xd7b6ae,
    roughness: 0.88,
  });

  model.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    removeNativeHead(node);
    node.material = floral;
    node.frustumCulled = false;
  });

  const headBone = model.getObjectByName("mixamorigHead");
  if (headBone) headBone.add(createRiggedCatHead(headTexture));

  model.scale.setScalar(0.0235);
  model.position.y = -1.65;
  group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(mocapData.clip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.play();

  return { group, mixer, duration: mocapData.clip.duration };
}

function createRiggedCatHead(headTexture) {
  const group = new THREE.Group();
  group.position.set(0, 8.5, 3);
  group.scale.setScalar(0.5);

  const fur = new THREE.MeshStandardMaterial({
    map: headTexture,
    color: headTexture ? 0xffffff : 0x9b806b,
    roughness: 0.9,
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(26, 32, 22), fur);
  head.scale.set(1, 0.92, 0.82);
  group.add(head);

  const earGeometry = new THREE.ConeGeometry(9, 22, 3);
  const leftEar = new THREE.Mesh(earGeometry, fur);
  leftEar.position.set(-14, 23, 1);
  leftEar.rotation.z = 0.13;
  const rightEar = leftEar.clone();
  rightEar.position.x = 9;
  rightEar.rotation.z = -0.13;
  group.add(leftEar, rightEar);

  return group;
}

function removeNativeHead(mesh) {
  const geometry = mesh.geometry;
  const skinIndex = geometry.getAttribute("skinIndex");
  const skinWeight = geometry.getAttribute("skinWeight");
  const index = geometry.index;
  const headBone = mesh.skeleton?.bones.find((bone) => bone.name === "mixamorigHead");
  if (!skinIndex || !skinWeight || !index || !headBone) return;

  const headBones = new Set();
  headBone.traverse((bone) => {
    if (bone.isBone) headBones.add(bone);
  });
  const headIndices = new Set(
    mesh.skeleton.bones.map((bone, boneIndex) => (headBones.has(bone) ? boneIndex : -1)).filter((boneIndex) => boneIndex >= 0),
  );

  function headWeight(vertexIndex) {
    let weight = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const offset = vertexIndex * 4 + channel;
      if (headIndices.has(skinIndex.array[offset])) {
        weight += skinWeight.array[offset];
      }
    }
    return weight;
  }

  const kept = [];
  for (let position = 0; position < index.count; position += 3) {
    const a = index.getX(position);
    const b = index.getX(position + 1);
    const c = index.getX(position + 2);
    const averageHeadWeight = (headWeight(a) + headWeight(b) + headWeight(c)) / 3;
    if (averageHeadWeight < 0.5) kept.push(a, b, c);
  }

  const trimmed = geometry.clone();
  trimmed.setIndex(kept);
  mesh.geometry = trimmed;
}

function createCatHeadTexture(sourceTexture) {
  const image = sourceTexture?.image;
  if (!image) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  context.fillStyle = "#8d7462";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 512;
  faceCanvas.height = 512;
  const faceContext = faceCanvas.getContext("2d");
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  faceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight * 0.82, 0, 0, 512, 512);
  faceContext.globalCompositeOperation = "destination-in";
  const feather = faceContext.createLinearGradient(0, 0, 512, 0);
  feather.addColorStop(0, "rgba(255,255,255,0)");
  feather.addColorStop(0.14, "rgba(255,255,255,1)");
  feather.addColorStop(0.86, "rgba(255,255,255,1)");
  feather.addColorStop(1, "rgba(255,255,255,0)");
  faceContext.fillStyle = feather;
  faceContext.fillRect(0, 0, 512, 512);
  context.drawImage(faceCanvas, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function createFabricTexture(sourceTexture) {
  const image = sourceTexture?.image;
  if (!image) return null;

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  context.drawImage(
    image,
    sourceWidth * 0.06,
    sourceHeight * 0.54,
    sourceWidth * 0.88,
    sourceHeight * 0.36,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.35, 1.35);
  return texture;
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
