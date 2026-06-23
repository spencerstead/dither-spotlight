import './styles.css';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const canvas = document.getElementById('stage');
const status = document.getElementById('status');
const drop = document.getElementById('drop');

const ui = {
  pixelSize: document.getElementById('pixelSize'), pixelOut: document.getElementById('pixelOut'),
  contrast: document.getElementById('contrast'), contrastOut: document.getElementById('contrastOut'),
  lens: document.getElementById('lens'), lensOut: document.getElementById('lensOut'),
  softness: document.getElementById('softness'), softOut: document.getElementById('softOut'),
  rotation: document.getElementById('rotation'), rotOut: document.getElementById('rotOut'),
  hover: document.getElementById('hover'), hoverOut: document.getElementById('hoverOut'),
  light: document.getElementById('light'), lightOut: document.getElementById('lightOut'),
  dpr: document.getElementById('dpr'), dprOut: document.getElementById('dprOut'),
  fg: document.getElementById('fg'), bg: document.getElementById('bg'), objFile: document.getElementById('objFile'),
  invert: document.getElementById('invert'), reset: document.getElementById('reset'), exportPng: document.getElementById('exportPng'),
};

const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mouse = new THREE.Vector2(-9999, -9999);
let mouseActive = 0;
let currentRoot = null;
let lastTime = 0;
let canvasCssW = 1;
let canvasCssH = 1;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 0.18, 5.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.8;
controls.maxDistance = 9;

const rig = new THREE.Group();
scene.add(rig);

const ambient = new THREE.AmbientLight(0xffffff, 1.05);
const hemi = new THREE.HemisphereLight(0xffffff, 0x46506f, 0.8);
const key = new THREE.DirectionalLight(0xffffff, 1.55);
key.position.set(3.5, 4.2, 4);
const rim = new THREE.DirectionalLight(0xa8c7ff, 0.7);
rim.position.set(-4, 1.8, -2.6);
scene.add(ambient, hemi, key, rim);

const cleanMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(ui.fg.value),
  roughness: 0.58,
  metalness: 0.02,
  emissive: new THREE.Color(ui.fg.value),
  emissiveIntensity: 0.18,
  side: THREE.DoubleSide,
});

const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
  depthBuffer: true,
  stencilBuffer: false,
  type: THREE.UnsignedByteType,
  format: THREE.RGBAFormat,
  colorSpace: THREE.SRGBColorSpace,
});
renderTarget.texture.generateMipmaps = false;
renderTarget.texture.minFilter = THREE.LinearFilter;
renderTarget.texture.magFilter = THREE.LinearFilter;

const bayerTexture = makeBayerTexture();
const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: renderTarget.texture },
    tBayer: { value: bayerTexture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: mouse },
    uPixelSize: { value: Number(ui.pixelSize.value) },
    uLensRadius: { value: Number(ui.lens.value) },
    uLensSoftness: { value: Number(ui.softness.value) },
    uLensActive: { value: 0 },
    uContrast: { value: Number(ui.contrast.value) / 100 },
    uFg: { value: new THREE.Color(ui.fg.value) },
    uBg: { value: new THREE.Color(ui.bg.value) },
  },
  depthTest: false,
  depthWrite: false,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tScene;
    uniform sampler2D tBayer;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform float uPixelSize;
    uniform float uLensRadius;
    uniform float uLensSoftness;
    uniform float uLensActive;
    uniform float uContrast;
    uniform vec3 uFg;
    uniform vec3 uBg;
    varying vec2 vUv;

    float luminance(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = max(1.0, uPixelSize);
      vec2 cell = floor(frag / px) * px + px * 0.5;
      vec2 cellUv = clamp(cell / uResolution, 0.0, 1.0);

      vec4 cleanCell = texture2D(tScene, cellUv);
      vec4 cleanFull = texture2D(tScene, vUv);

      vec2 matrixUv = (mod(floor(frag / px), 8.0) + 0.5) / 8.0;
      float threshold = texture2D(tBayer, matrixUv).r;

      float shade = luminance(cleanCell.rgb) * cleanCell.a;
      shade = clamp((shade - 0.02) * uContrast, 0.0, 1.0);
      float dither = step(threshold, shade);

      vec3 dithered = mix(uBg, uFg, dither * step(0.01, cleanCell.a));
      vec3 clean = mix(uBg, cleanFull.rgb, cleanFull.a);

      float distToMouse = distance(frag, uMouse);
      float softness = max(1.0, uLensSoftness);
      float lens = (1.0 - smoothstep(uLensRadius - softness, uLensRadius, distToMouse)) * uLensActive;

      // Clean model reveal inside the lens. Dither outside.
      vec3 color = mix(dithered, clean, lens);

      // Thin optical edge only; it does not dim the lens interior.
      float ring = smoothstep(uLensRadius + 1.5, uLensRadius, distToMouse) - smoothstep(uLensRadius, uLensRadius - 1.5, distToMouse);
      color += ring * vec3(0.08) * uLensActive;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

init();

function init() {
  loadDemoMesh();
  updateUi();
  resize();
  addEventListener('resize', resize, { passive: true });
  addEventListener('pointermove', setPointer, { passive: true });
  addEventListener('pointerenter', setPointer, { passive: true });
  addEventListener('pointerleave', () => { mouseActive = 0; });

  ui.objFile.addEventListener('change', (event) => loadModelFile(event.target.files?.[0]));
  ui.reset.addEventListener('click', loadDemoMesh);
  ui.invert.addEventListener('click', invertColors);
  ui.exportPng.addEventListener('click', exportPNG);

  ['pixelSize', 'contrast', 'lens', 'softness', 'rotation', 'hover', 'light', 'dpr'].forEach((id) => {
    ui[id].addEventListener('input', () => {
      updateUi();
      if (id === 'dpr') resize();
    });
  });
  ['fg', 'bg'].forEach((id) => ui[id].addEventListener('input', updateUi));

  addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('active');
  });
  addEventListener('dragleave', () => drop.classList.remove('active'));
  addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('active');
    loadModelFile(event.dataTransfer?.files?.[0]);
  });

  requestAnimationFrame(animate);
}

function makeBayerTexture() {
  const bayer = new Uint8Array([
    0, 48, 12, 60, 3, 51, 15, 63,
    32, 16, 44, 28, 35, 19, 47, 31,
    8, 56, 4, 52, 11, 59, 7, 55,
    40, 24, 36, 20, 43, 27, 39, 23,
    2, 50, 14, 62, 1, 49, 13, 61,
    34, 18, 46, 30, 33, 17, 45, 29,
    10, 58, 6, 54, 9, 57, 5, 53,
    42, 26, 38, 22, 41, 25, 37, 21,
  ].map((value) => Math.round(((value + 0.5) / 64) * 255)));
  const texture = new THREE.DataTexture(bayer, 8, 8, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (event.clientX - rect.left) * renderer.getPixelRatio();
  mouse.y = (rect.height - (event.clientY - rect.top)) * renderer.getPixelRatio();
  mouseActive = 1;
}

function resize() {
  canvasCssW = Math.max(1, window.innerWidth);
  canvasCssH = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, Number(ui.dpr.value));
  renderer.setPixelRatio(dpr);
  renderer.setSize(canvasCssW, canvasCssH, false);
  const width = Math.floor(canvasCssW * dpr);
  const height = Math.floor(canvasCssH * dpr);
  renderTarget.setSize(width, height);
  camera.aspect = canvasCssW / canvasCssH;
  camera.updateProjectionMatrix();
  postMaterial.uniforms.uResolution.value.set(width, height);
}

function updateUi() {
  const fg = new THREE.Color(ui.fg.value);
  const bg = new THREE.Color(ui.bg.value);
  postMaterial.uniforms.uPixelSize.value = Number(ui.pixelSize.value);
  postMaterial.uniforms.uLensRadius.value = Number(ui.lens.value) * renderer.getPixelRatio();
  postMaterial.uniforms.uLensSoftness.value = Number(ui.softness.value) * renderer.getPixelRatio();
  postMaterial.uniforms.uContrast.value = Number(ui.contrast.value) / 100;
  postMaterial.uniforms.uFg.value.copy(fg);
  postMaterial.uniforms.uBg.value.copy(bg);
  cleanMaterial.color.copy(fg);
  cleanMaterial.emissive.copy(fg);
  key.intensity = Number(ui.light.value) / 100;
  document.documentElement.style.setProperty('--accent', ui.fg.value);
  document.body.style.background = ui.bg.value;

  ui.pixelOut.value = `${ui.pixelSize.value}px`;
  ui.contrastOut.value = (Number(ui.contrast.value) / 100).toFixed(2);
  ui.lensOut.value = ui.lens.value;
  ui.softOut.value = ui.softness.value;
  ui.rotOut.value = (Number(ui.rotation.value) / 100).toFixed(2).replace('0.', '.');
  ui.hoverOut.value = (Number(ui.hover.value) / 100).toFixed(2).replace('0.', '.');
  ui.lightOut.value = (Number(ui.light.value) / 100).toFixed(2);
  ui.dprOut.value = `${Number(ui.dpr.value).toFixed(2).replace(/\.00$/, '')}x`;
}

function animate(time) {
  requestAnimationFrame(animate);
  if (document.visibilityState === 'hidden') return;

  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;

  const rotationSpeed = prefersReducedMotion ? 0 : Number(ui.rotation.value) / 100;
  const hoverAmount = prefersReducedMotion ? 0 : Number(ui.hover.value) / 100;
  rig.rotation.y += dt * rotationSpeed;
  rig.rotation.x = Math.sin(time * 0.00028) * 0.08;
  rig.position.y = Math.sin(time * 0.00115) * hoverAmount;

  controls.update();
  postMaterial.uniforms.uLensActive.value = mouseActive;
  renderFrame(renderer, renderTarget, postMaterial.uniforms.uResolution.value);
}

function renderFrame(activeRenderer = renderer, activeTarget = renderTarget, resolution = postMaterial.uniforms.uResolution.value, outputTarget = null) {
  activeRenderer.setRenderTarget(activeTarget);
  activeRenderer.setClearColor(0x000000, 0);
  activeRenderer.clear(true, true, true);
  activeRenderer.render(scene, camera);

  activeRenderer.setRenderTarget(outputTarget);
  activeRenderer.setClearColor(new THREE.Color(ui.bg.value), 1);
  postMaterial.uniforms.uResolution.value.copy(resolution);
  activeRenderer.render(postScene, postCamera);
}

function loadModelFile(file) {
  if (!file) return;

  const name = file.name || 'model';
  const lower = name.toLowerCase();
  const isOBJ = lower.endsWith('.obj');
  const isSTL = lower.endsWith('.stl');

  if (!isOBJ && !isSTL) {
    status.textContent = 'Please upload a .OBJ or .STL file.';
    return;
  }

  status.textContent = `Loading ${name}…`;
  const reader = new FileReader();

  reader.onload = () => {
    try {
      let parsed;

      if (isOBJ) {
        parsed = new OBJLoader().parse(String(reader.result));
      } else {
        const geometry = new STLLoader().parse(reader.result);
        parsed = new THREE.Group();
        parsed.add(new THREE.Mesh(geometry, cleanMaterial));
      }

      useObject(parsed);
      status.textContent = `Loaded ${name}.`;
    } catch (error) {
      console.error(error);
      status.textContent = isOBJ
        ? 'Could not parse that OBJ. Try a triangulated / standard OBJ export.'
        : 'Could not parse that STL. Try exporting as binary or ASCII STL.';
    }
  };

  reader.onerror = () => { status.textContent = `Could not read ${name}.`; };

  if (isOBJ) reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

function loadDemoMesh() {
  const group = new THREE.Group();
  const main = new THREE.Mesh(new THREE.TorusKnotGeometry(0.82, 0.22, 176, 18), cleanMaterial);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), cleanMaterial);
  core.scale.setScalar(0.72);
  group.add(main, core);
  useObject(group);
  status.textContent = 'Using built-in demo mesh. Drag a .OBJ or .STL anywhere to replace it.';
}

function useObject(object) {
  if (currentRoot) {
    rig.remove(currentRoot);
    disposeObject(currentRoot);
  }

  object.traverse((child) => {
    if (!child.isMesh) return;

    child.material = cleanMaterial;
    child.castShadow = false;
    child.receiveShadow = false;

    if (child.geometry) {
      // Imported OBJ/STL normals are often missing, inverted, or authored for a different
      // shading setup. Recompute them so uploaded files do not render as a black silhouette.
      if (child.geometry.attributes.normal) child.geometry.deleteAttribute('normal');
      child.geometry.computeVertexNormals();
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    }
  });

  fitToView(object);
  currentRoot = object;
  rig.add(currentRoot);
}

function fitToView(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  object.position.sub(center);
  object.scale.setScalar(2.35 / maxDim);
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
  });
}

function invertColors() {
  const fg = ui.fg.value;
  ui.fg.value = ui.bg.value;
  ui.bg.value = fg;
  updateUi();
}

function exportPNG() {
  ui.exportPng.disabled = true;

  const prevDpr = renderer.getPixelRatio();
  const prevResolution = postMaterial.uniforms.uResolution.value.clone();
  const prevMouse = mouse.clone();
  const prevLensRadius = postMaterial.uniforms.uLensRadius.value;
  const prevLensSoftness = postMaterial.uniforms.uLensSoftness.value;

  const scale = 2;
  const exportW = Math.max(1, Math.floor(canvasCssW * scale));
  const exportH = Math.max(1, Math.floor(canvasCssH * scale));

  const finalTarget = new THREE.WebGLRenderTarget(exportW, exportH, {
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
  });

  renderer.setPixelRatio(1);
  renderer.setSize(exportW, exportH, false);
  renderTarget.setSize(exportW, exportH);
  postMaterial.uniforms.uResolution.value.set(exportW, exportH);
  postMaterial.uniforms.uLensRadius.value = Number(ui.lens.value) * scale;
  postMaterial.uniforms.uLensSoftness.value = Number(ui.softness.value) * scale;
  mouse.set((prevMouse.x / prevDpr) * scale, (prevMouse.y / prevDpr) * scale);

  renderFrame(renderer, renderTarget, postMaterial.uniforms.uResolution.value, finalTarget);

  const pixels = new Uint8Array(exportW * exportH * 4);
  renderer.readRenderTargetPixels(finalTarget, 0, 0, exportW, exportH, pixels);
  finalTarget.dispose();

  const out = document.createElement('canvas');
  out.width = exportW;
  out.height = exportH;
  const outCtx = out.getContext('2d');
  const imageData = outCtx.createImageData(exportW, exportH);
  const row = exportW * 4;
  for (let y = 0; y < exportH; y++) {
    const src = (exportH - 1 - y) * row;
    const dst = y * row;
    imageData.data.set(pixels.subarray(src, src + row), dst);
  }
  outCtx.putImageData(imageData, 0, 0);

  out.toBlob((blob) => {
    if (blob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'obj-bayer-dither.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    renderer.setPixelRatio(prevDpr);
    renderer.setSize(canvasCssW, canvasCssH, false);
    renderTarget.setSize(Math.floor(canvasCssW * prevDpr), Math.floor(canvasCssH * prevDpr));
    postMaterial.uniforms.uResolution.value.copy(prevResolution);
    postMaterial.uniforms.uLensRadius.value = prevLensRadius;
    postMaterial.uniforms.uLensSoftness.value = prevLensSoftness;
    mouse.copy(prevMouse);
    ui.exportPng.disabled = false;
  }, 'image/png');
}
