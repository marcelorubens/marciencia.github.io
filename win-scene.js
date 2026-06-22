import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "./vendor/libs/meshopt_decoder.module.js";

const overlay = document.querySelector("#winOverlay");
const mount = document.querySelector("#winScene");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const searchParams = new URLSearchParams(window.location.search);
const previewWin = searchParams.get("win-preview") === "1";
const previewDance = searchParams.get("dance-preview");

if (overlay && previewWin) {
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
}

if (overlay && mount) {
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

  const [catTexture, cardBackTexture, aceTexture, mocapData] = await Promise.all([
    loadTexture("assets/favicon-cat.jpg", renderer),
    loadTexture("assets/card-back.jpg", renderer),
    loadTexture("assets/ace-clubs.png", renderer),
    loadDanceMocap(),
  ]);

  const card = createCard(aceTexture, cardBackTexture);
  card.position.y = -0.25;
  scene.add(card);

  const dancer = createRiggedDancer(mocapData, catTexture, cardBackTexture, previewDance);
  scene.add(dancer.group);

  let frameId = 0;
  let elapsed = 0;
  let previousTime = 0;
  let wasVisible = overlay.classList.contains("show");
  overlay.dataset.dance = dancer.currentDance;

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
    const shown = overlay.classList.contains("show");
    if (shown && !wasVisible) {
      elapsed = 0;
      overlay.dataset.dance = dancer.selectRandomDance();
      update(0);
      renderer.render(scene, camera);
    }
    wasVisible = shown;

    const visible = shown && !reduceMotion.matches;
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

async function loadDanceMocap() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [mousey, samba] = await Promise.all([
    loader.loadAsync("vendor/motions/mousey-snake-hip-hop.glb"),
    loader.loadAsync("vendor/motions/mousey-samba-dancing.glb"),
  ]);
  return {
    root: mousey.scene,
    dances: [
      { name: "hip-hop", clip: mousey.animations.find((animation) => animation.tracks.length > 0) },
      { name: "samba", clip: samba.animations.find((animation) => animation.tracks.length > 0) },
    ],
  };
}

function createCard(frontTexture, backTexture) {
  const group = new THREE.Group();
  const width = 2.24;
  const height = 3.18;
  const geometry = roundedPlaneGeometry(width, height, 0.16);
  const adjustedFrontTexture = createReducedClubTexture(frontTexture);
  const front = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map: adjustedFrontTexture, roughness: 0.72, metalness: 0.02 }),
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

function createRiggedDancer(mocapData, catTexture, duvetTexture, initialDance) {
  const group = new THREE.Group();
  const model = mocapData.root;
  const rigNodes = new Set();
  model.traverse((node) => rigNodes.add(node.name));
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

  model.scale.setScalar(0.0282);
  model.position.y = -1.65;
  group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = mocapData.dances.map((dance) => {
    const clip = dance.clip.clone();
    clip.tracks = clip.tracks.filter((track) => rigNodes.has(track.name.split(".")[0]));
    return { ...dance, clip, action: mixer.clipAction(clip) };
  });
  const result = {
    group,
    mixer,
    duration: 0,
    currentDance: "",
    selectRandomDance(preferredDance) {
      const selected = actions.find((dance) => dance.name === preferredDance) || actions[Math.floor(Math.random() * actions.length)];
      mixer.stopAllAction();
      selected.action.reset();
      selected.action.setLoop(THREE.LoopRepeat, Infinity);
      selected.action.play();
      result.duration = selected.clip.duration;
      result.currentDance = selected.name;
      return selected.name;
    },
  };
  result.selectRandomDance(initialDance);

  return result;
}

function createReducedClubTexture(sourceTexture) {
  const image = sourceTexture?.image;
  if (!image) return sourceTexture;

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height).data;
  const centerX = Math.floor(width / 2);
  const bounds = { top: height, right: centerX, bottom: 0 };
  for (let y = Math.floor(height * 0.25); y < Math.floor(height * 0.9); y += 1) {
    for (let x = centerX; x < Math.floor(width * 0.85); x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
      if (luminance >= 200) continue;
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x);
      bounds.bottom = Math.max(bounds.bottom, y);
    }
  }

  if (bounds.right <= centerX || bounds.bottom <= bounds.top) return sourceTexture;

  const padding = 4;
  const halfWidth = bounds.right - centerX + padding;
  const sourceX = centerX - halfWidth;
  const sourceY = Math.max(0, bounds.top - padding);
  const sourceWidth = halfWidth * 2;
  const sourceHeight = Math.min(height - sourceY, bounds.bottom - bounds.top + padding * 2);
  const centerY = sourceY + sourceHeight / 2;
  const scale = 0.8;
  const background = context.getImageData(Math.floor(width / 2), Math.floor(height * 0.15), 1, 1).data;
  const clubCanvas = document.createElement("canvas");
  clubCanvas.width = sourceWidth;
  clubCanvas.height = sourceHeight;
  const clubContext = clubCanvas.getContext("2d");

  clubContext.drawImage(image, centerX, sourceY, halfWidth, sourceHeight, halfWidth, 0, halfWidth, sourceHeight);
  clubContext.save();
  clubContext.translate(halfWidth, 0);
  clubContext.scale(-1, 1);
  clubContext.drawImage(image, centerX, sourceY, halfWidth, sourceHeight, 0, 0, halfWidth, sourceHeight);
  clubContext.restore();

  context.fillStyle = `rgb(${background[0]}, ${background[1]}, ${background[2]})`;
  context.fillRect(sourceX, sourceY, sourceWidth, sourceHeight);
  context.drawImage(
    clubCanvas,
    centerX - (sourceWidth * scale) / 2,
    centerY - (sourceHeight * scale) / 2,
    sourceWidth * scale,
    sourceHeight * scale,
  );

  const aceTopBounds = { left: width, right: 0, top: height };
  for (let y = Math.floor(height * 0.08); y < Math.floor(height * 0.27); y += 1) {
    for (let x = Math.floor(width * 0.05); x < Math.floor(width * 0.45); x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
      if (luminance >= 200) continue;
      aceTopBounds.left = Math.min(aceTopBounds.left, x);
      aceTopBounds.right = Math.max(aceTopBounds.right, x);
      aceTopBounds.top = Math.min(aceTopBounds.top, y);
    }
  }

  const aceCenterX = Math.round((aceTopBounds.left + aceTopBounds.right) / 2);
  const aceBounds = { left: aceCenterX, bottom: aceTopBounds.top };
  for (let y = aceTopBounds.top; y < Math.floor(height * 0.35); y += 1) {
    for (let x = Math.floor(width * 0.05); x <= aceCenterX; x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
      if (luminance >= 200) continue;
      aceBounds.left = Math.min(aceBounds.left, x);
      aceBounds.bottom = Math.max(aceBounds.bottom, y);
    }
  }

  const aceHalfWidth = aceCenterX - aceBounds.left + padding;
  const aceSourceX = aceCenterX - aceHalfWidth;
  const aceSourceY = Math.max(0, aceTopBounds.top - padding);
  const aceHeight = aceBounds.bottom - aceTopBounds.top + padding * 2;
  const aceCanvas = document.createElement("canvas");
  aceCanvas.width = aceHalfWidth * 2;
  aceCanvas.height = aceHeight;
  const aceContext = aceCanvas.getContext("2d");
  aceContext.drawImage(image, aceSourceX, aceSourceY, aceHalfWidth, aceHeight, 0, 0, aceHalfWidth, aceHeight);
  aceContext.save();
  aceContext.translate(aceHalfWidth * 2, 0);
  aceContext.scale(-1, 1);
  aceContext.drawImage(image, aceSourceX, aceSourceY, aceHalfWidth, aceHeight, 0, 0, aceHalfWidth, aceHeight);
  aceContext.restore();

  const acePixels = aceContext.getImageData(0, 0, aceCanvas.width, aceCanvas.height);
  for (let offset = 0; offset < acePixels.data.length; offset += 4) {
    const luminance =
      acePixels.data[offset] * 0.2126 + acePixels.data[offset + 1] * 0.7152 + acePixels.data[offset + 2] * 0.0722;
    if (luminance >= 220) acePixels.data[offset + 3] = 0;
  }
  aceContext.putImageData(acePixels, 0, 0);
  context.drawImage(aceCanvas, aceSourceX, aceSourceY);

  const edgeHeight = Math.max(1, Math.ceil(height * 0.015));
  const edgePixels = context.getImageData(0, 0, width, edgeHeight);
  for (let offset = 0; offset < edgePixels.data.length; offset += 4) {
    const luminance =
      edgePixels.data[offset] * 0.2126 + edgePixels.data[offset + 1] * 0.7152 + edgePixels.data[offset + 2] * 0.0722;
    if (luminance >= 120) continue;
    edgePixels.data[offset] = background[0];
    edgePixels.data[offset + 1] = background[1];
    edgePixels.data[offset + 2] = background[2];
    edgePixels.data[offset + 3] = 255;
  }
  context.putImageData(edgePixels, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = sourceTexture.anisotropy;
  return texture;
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
