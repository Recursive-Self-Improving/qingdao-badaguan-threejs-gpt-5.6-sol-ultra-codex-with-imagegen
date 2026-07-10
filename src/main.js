import './styles.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BadaguanWorld } from './world.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#scene');
const loading = $('#loading');
const loadingBar = $('#loading-bar');
const loadingValue = $('#loading-value');
const intro = $('#intro');
const hud = $('#hud');
const enterButton = $('#enter-button');
const resumeButton = $('#resume-button');
const audioButton = $('#audio-button');
const mapButton = $('#map-button');
const helpButton = $('#help-button');
const mapDialog = $('#map-dialog');
const helpDialog = $('#help-dialog');
const storyCard = $('#story-card');
const storyClose = $('#story-close');
const prompt = $('#prompt');
const controlHint = $('#control-hint');
const locationChip = $('#location-chip');
const locationName = $('#location-name');
const locationCaption = $('#location-caption');
const compassTrack = $('#compass-track');
const mapPlayer = $('#map-player');
const joystick = $('#joystick');
const joystickKnob = $('#joystick-knob');
const toast = $('#toast');

const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowTier = isTouch || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const quality = lowTier ? 'low' : 'high';
document.documentElement.classList.toggle('is-touch', isTouch);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaac6ca);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 520);
camera.position.set(2.5, 4.2, -72);
camera.lookAt(0, 3.2, 16);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !lowTier,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, lowTier ? 1.35 : 1.8));
renderer.shadowMap.enabled = !lowTier;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.97;

const world = new BadaguanWorld(scene, renderer, quality);

let composer = null;
if (!lowTier) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.13, 0.42, 0.91);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 0.72;

const timer = new THREE.Timer();
timer.connect(document);
const velocity = new THREE.Vector3();
const targetVelocity = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const trialPosition = new THREE.Vector3();
const oldPosition = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const keys = new Set();
const touchMove = new THREE.Vector2();

let hasEntered = false;
let modalOpen = false;
let currentHotspot = null;
let currentLocation = 'avenue';
let moveTime = 0;
let hintTimer = 0;
let introTime = 0;
let lastCardinal = '';
let toastTimer = 0;
let adaptiveTimer = 0;
let adaptiveFrames = 0;
let adaptiveDone = false;
let pointerDrag = null;
let joystickPointer = null;
let settleInitialView = false;
let focusBeforeStory = null;

const locations = {
  avenue: { index: '01', name: '林蔭大道', caption: '法桐把午後的光剪成細碎金箔' },
  princess: { index: '02', name: '居庸關路 · 公主樓', caption: '藍綠山牆藏在松柏和院落後' },
  huashi: { index: '03', name: '花石樓眺望', caption: '粗石塔樓先從樹冠間露面' },
  coast: { index: '04', name: '第二海水浴場', caption: '太平灣把街道盡頭染成藍灰' },
};

const teleports = {
  avenue: { position: new THREE.Vector3(0, 1.72, -64), target: new THREE.Vector3(0, 2, 5) },
  princess: { position: new THREE.Vector3(0, 1.72, -34), target: new THREE.Vector3(34, 5.8, -18) },
  huashi: { position: new THREE.Vector3(0, 1.72, 15), target: new THREE.Vector3(-34, 7.4, 45) },
  coast: { position: new THREE.Vector3(0, 1.72, 68), target: new THREE.Vector3(0, 1, 155) },
};

class CoastalSoundscape {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = false;
    this.nextGull = 0;
  }

  makeNoiseBuffer(seconds = 4) {
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, sampleRate * seconds, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  async start() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);

      const wind = this.context.createBufferSource();
      wind.buffer = this.makeNoiseBuffer(5);
      wind.loop = true;
      const windFilter = this.context.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 690;
      windFilter.Q.value = 0.35;
      const windGain = this.context.createGain();
      windGain.gain.value = 0.12;
      wind.connect(windFilter).connect(windGain).connect(this.master);
      wind.start();

      const surf = this.context.createBufferSource();
      surf.buffer = this.makeNoiseBuffer(6);
      surf.loop = true;
      const surfFilter = this.context.createBiquadFilter();
      surfFilter.type = 'bandpass';
      surfFilter.frequency.value = 980;
      surfFilter.Q.value = 0.48;
      const surfGain = this.context.createGain();
      surfGain.gain.value = 0.07;
      surf.connect(surfFilter).connect(surfGain).connect(this.master);
      surf.start();

      const tideLfo = this.context.createOscillator();
      const tideDepth = this.context.createGain();
      tideLfo.frequency.value = 0.105;
      tideDepth.gain.value = 0.025;
      tideLfo.connect(tideDepth).connect(surfGain.gain);
      tideLfo.start();
    }
    await this.context.resume();
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(0.34, this.context.currentTime + 1.4);
    this.enabled = true;
    return true;
  }

  stop() {
    if (!this.context || !this.master) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.7);
    this.enabled = false;
  }

  gull(elapsed) {
    if (!this.enabled || !this.context || elapsed < this.nextGull) return;
    this.nextGull = elapsed + 8 + Math.random() * 15;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(980 + Math.random() * 280, now);
    oscillator.frequency.exponentialRampToValueAtTime(610 + Math.random() * 120, now + 0.35);
    oscillator.frequency.exponentialRampToValueAtTime(850, now + 0.68);
    filter.type = 'bandpass';
    filter.frequency.value = 1300;
    filter.Q.value = 1.2;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.78);
  }
}

const soundscape = new CoastalSoundscape();

function setLoadingProgress(value) {
  const rounded = Math.round(value);
  loadingBar.style.width = `${rounded}%`;
  loadingValue.textContent = `${rounded}%`;
}

async function finishLoading() {
  setLoadingProgress(28);
  renderer.compile(scene, camera);
  setLoadingProgress(72);
  await Promise.all([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 380)),
  ]);
  setLoadingProgress(100);
  await new Promise((resolve) => setTimeout(resolve, 280));
  loading.classList.add('is-done');
  intro.classList.remove('is-hidden');
  if (!lowTier) renderer.shadowMap.autoUpdate = false;
}

function beginWalk() {
  if (hasEntered) return;
  hasEntered = true;
  intro.classList.add('is-hidden');
  hud.classList.remove('is-hidden');
  camera.position.set(0, 1.72, -72);
  camera.rotation.set(-0.002, Math.PI, 0, 'YXZ');
  velocity.set(0, 0, 0);
  hintTimer = 7;
  if (!isTouch) {
    settleInitialView = true;
    controls.lock();
  } else {
    prompt.querySelector('kbd').textContent = '＋';
    showToast('左側移動 · 右側拖曳環視');
  }
}

function openPanel(dialog) {
  if (!hasEntered || dialog.open) return;
  modalOpen = true;
  if (controls.isLocked) controls.unlock();
  storyCard.classList.remove('is-visible');
  dialog.showModal();
}

function closePanel(dialog, relock = true) {
  if (dialog.open) dialog.close();
  modalOpen = false;
  if (relock && hasEntered && !isTouch) controls.lock();
}

function showStory(hotspot) {
  if (!hotspot) return;
  focusBeforeStory = document.activeElement;
  currentHotspot = hotspot;
  modalOpen = true;
  if (controls.isLocked) controls.unlock();
  $('#story-number').textContent = hotspot.index;
  $('#story-eyebrow').textContent = hotspot.eyebrow;
  $('#story-title').textContent = hotspot.title;
  $('#story-body').textContent = hotspot.body;
  $('#story-style').textContent = hotspot.style;
  storyCard.setAttribute('aria-hidden', 'false');
  storyCard.classList.add('is-visible');
  requestAnimationFrame(() => storyClose.focus());
}

function closeStory(relock = true) {
  storyCard.classList.remove('is-visible');
  storyCard.setAttribute('aria-hidden', 'true');
  modalOpen = false;
  focusBeforeStory?.focus?.();
  focusBeforeStory = null;
  if (relock && hasEntered && !isTouch) controls.lock();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

function teleportTo(id) {
  const point = teleports[id];
  if (!point) return;
  camera.position.copy(point.position);
  camera.lookAt(point.target);
  camera.rotation.order = 'YXZ';
  velocity.set(0, 0, 0);
  closePanel(mapDialog, false);
  updateLocation(id);
  showToast(`已抵達 · ${locations[id].name}`);
  if (!isTouch) setTimeout(() => controls.lock(), 120);
}

function updateLocation(id) {
  if (!locations[id] || id === currentLocation) return;
  currentLocation = id;
  locationChip.classList.add('is-changing');
  document.querySelectorAll('.map-pin').forEach((pin) => pin.classList.toggle('is-active', pin.dataset.target === id));
  setTimeout(() => {
    $('.location-index').textContent = locations[id].index;
    locationName.textContent = locations[id].name;
    locationCaption.textContent = locations[id].caption;
    locationChip.classList.remove('is-changing');
  }, 260);
}

function determineLocation() {
  const { x, z } = camera.position;
  let id = 'avenue';
  if (z > 59) id = 'coast';
  else if (Math.hypot(x, z - 15) < 16) id = 'huashi';
  else if (Math.hypot(x, z + 34) < 16) id = 'princess';
  updateLocation(id);
}

function updateHotspot() {
  let nearest = null;
  let nearestDistance = Infinity;
  world.hotspots.forEach((hotspot) => {
    const dx = camera.position.x - hotspot.position.x;
    const dz = camera.position.z - hotspot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < hotspot.radius && distance < nearestDistance) {
      nearest = hotspot;
      nearestDistance = distance;
    }
  });
  currentHotspot = nearest;
  prompt.classList.toggle('is-visible', Boolean(nearest) && !modalOpen);
  if (nearest) prompt.querySelector('span').textContent = `細看 · ${nearest.title}`;
}

function updateCompass() {
  camera.getWorldDirection(cameraDirection);
  let bearing = THREE.MathUtils.radToDeg(Math.atan2(cameraDirection.x, -cameraDirection.z));
  bearing = (bearing + 360) % 360;
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const centerIndex = Math.round(bearing / 45) % 8;
  const key = points[centerIndex];
  if (key === lastCardinal) return;
  lastCardinal = key;
  const labels = [-2, -1, 0, 1, 2].map((offset) => points[(centerIndex + offset + 8) % 8]);
  compassTrack.innerHTML = `<span>${labels[0]}</span><i>·</i><span>${labels[1]}</span><i>·</i><strong>${labels[2]}</strong><i>·</i><span>${labels[3]}</span><i>·</i><span>${labels[4]}</span>`;
  compassTrack.style.transform = 'none';
}

function updateMapPlayer() {
  const xPercent = THREE.MathUtils.clamp(50 + camera.position.x / 1.9, 4, 96);
  const yPercent = THREE.MathUtils.clamp(10 + ((camera.position.z + 120) / 200) * 72, 6, 88);
  mapPlayer.style.setProperty('--x', `${xPercent}%`);
  mapPlayer.style.setProperty('--y', `${yPercent}%`);
}

function updateMovement(delta) {
  if (!hasEntered || modalOpen || (!isTouch && !controls.isLocked)) {
    targetVelocity.set(0, 0, 0);
    velocity.lerp(targetVelocity, 1 - Math.exp(-9 * delta));
    return;
  }

  const keyboardX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const keyboardY = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  moveDirection.set(keyboardX + touchMove.x, 0, keyboardY - touchMove.y);

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.15 : 2.85;
  targetVelocity.set(0, 0, 0);
  if (moveDirection.lengthSq() > 0.01) {
    moveDirection.normalize();
    targetVelocity.addScaledVector(forward, moveDirection.z * speed);
    targetVelocity.addScaledVector(right, moveDirection.x * speed);
    moveTime += delta * speed;
  }
  velocity.lerp(targetVelocity, 1 - Math.exp(-10.5 * delta));

  oldPosition.copy(camera.position);
  trialPosition.copy(camera.position);
  trialPosition.x += velocity.x * delta;
  if (world.isWalkable(trialPosition, oldPosition)) camera.position.x = trialPosition.x;
  else velocity.x = 0;
  trialPosition.copy(camera.position);
  trialPosition.z += velocity.z * delta;
  if (world.isWalkable(trialPosition, oldPosition)) camera.position.z = trialPosition.z;
  else velocity.z = 0;

  const moving = velocity.lengthSq() > 0.15;
  const bob = moving && !reduceMotion ? Math.sin(moveTime * 4.8) * 0.018 + Math.sin(moveTime * 9.6) * 0.006 : 0;
  const groundHeight = world.getGroundHeight(camera.position.x, camera.position.z);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.72 + groundHeight + bob, 1 - Math.exp(-12 * delta));
}

function animateIntro(delta) {
  if (hasEntered || reduceMotion) return;
  introTime += delta;
  const t = (Math.sin(introTime * 0.11) + 1) * 0.5;
  camera.position.set(2.4 + Math.sin(introTime * 0.08) * 1.2, 4.1 + t * 0.35, -72 + t * 5.2);
  camera.lookAt(-1.5, 3.0, 23);
}

function animate(timestamp) {
  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 0.05);
  const elapsed = timer.getElapsed();
  animateIntro(delta);
  updateMovement(delta);
  world.update(delta, elapsed);
  if (hasEntered) {
    determineLocation();
    updateHotspot();
    updateCompass();
    updateMapPlayer();
    soundscape.gull(elapsed);
    if (hintTimer > 0) {
      hintTimer -= delta;
      if (hintTimer <= 0) controlHint.classList.add('is-faded');
    }
  }

  if (!adaptiveDone && hasEntered) {
    adaptiveTimer += delta;
    adaptiveFrames += 1;
    if (adaptiveTimer > 6) {
      const fps = adaptiveFrames / adaptiveTimer;
      if (fps < 42 && renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(1);
        composer?.setPixelRatio(1);
        showToast('已自動調整畫質以保持流暢');
      }
      adaptiveDone = true;
    }
  }

  if (composer) composer.render();
  else renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
}

function onKeyDown(event) {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    keys.add(event.code);
    if (event.code.startsWith('Arrow')) event.preventDefault();
  }
  if (!hasEntered || event.repeat) return;
  if (event.code === 'KeyE' && !modalOpen) showStory(currentHotspot);
  if (event.code === 'KeyM') {
    if (mapDialog.open) closePanel(mapDialog);
    else if (!modalOpen) openPanel(mapDialog);
  }
  if (event.code === 'KeyH' && !modalOpen) openPanel(helpDialog);
  if (event.code === 'Escape' && storyCard.classList.contains('is-visible')) {
    closeStory(false);
    resumeButton.classList.add('is-visible');
  }
}

function onKeyUp(event) {
  keys.delete(event.code);
}

function updateJoystick(event) {
  const bounds = joystick.getBoundingClientRect();
  const x = event.clientX - (bounds.left + bounds.width / 2);
  const y = event.clientY - (bounds.top + bounds.height / 2);
  const max = bounds.width * 0.35;
  const length = Math.hypot(x, y) || 1;
  const scale = Math.min(max, length) / length;
  const px = x * scale;
  const py = y * scale;
  touchMove.set(px / max, py / max);
  joystickKnob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
}

enterButton.addEventListener('click', beginWalk);
resumeButton.addEventListener('click', () => controls.lock());
canvas.addEventListener('click', () => {
  if (hasEntered && !isTouch && !modalOpen && !controls.isLocked) controls.lock();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

controls.addEventListener('lock', () => {
  resumeButton.classList.remove('is-visible');
  controlHint.classList.remove('is-faded');
  hintTimer = Math.max(hintTimer, 2.5);
  if (settleInitialView) {
    camera.rotation.set(-0.002, Math.PI, 0, 'YXZ');
    setTimeout(() => {
      camera.rotation.set(-0.002, Math.PI, 0, 'YXZ');
      settleInitialView = false;
    }, 420);
  }
});
controls.addEventListener('change', () => {
  // Browsers may report one large synthetic movement while centering a newly
  // locked pointer. Keep the carefully composed opening view stable through it.
  if (settleInitialView) camera.rotation.set(-0.002, Math.PI, 0, 'YXZ');
});
controls.addEventListener('unlock', () => {
  keys.clear();
  if (hasEntered && !modalOpen) resumeButton.classList.add('is-visible');
});

audioButton.addEventListener('click', async () => {
  if (soundscape.enabled) {
    soundscape.stop();
    audioButton.classList.remove('is-active');
    audioButton.setAttribute('aria-label', '開啟環境聲音');
    showToast('環境聲景已關閉');
  } else {
    const started = await soundscape.start();
    if (started) {
      audioButton.classList.add('is-active');
      audioButton.setAttribute('aria-label', '關閉環境聲音');
      showToast('海風、松濤與遠處海鳥');
    }
  }
});

mapButton.addEventListener('click', () => openPanel(mapDialog));
helpButton.addEventListener('click', () => openPanel(helpDialog));
storyClose.addEventListener('click', () => closeStory());
prompt.addEventListener('click', () => {
  if (isTouch && currentHotspot && !modalOpen) showStory(currentHotspot);
});
document.querySelectorAll('.dialog-close').forEach((button) => {
  button.addEventListener('click', () => closePanel(button.closest('dialog')));
});
document.querySelectorAll('.map-pin').forEach((button) => {
  button.addEventListener('click', () => teleportTo(button.dataset.target));
});
[mapDialog, helpDialog].forEach((dialog) => {
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePanel(dialog);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closePanel(dialog);
  });
});

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('resize', onResize);
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) keys.clear();
});
document.addEventListener('pointerlockerror', () => {
  if (!hasEntered || isTouch) return;
  resumeButton.classList.add('is-visible');
  showToast('瀏覽器未能鎖定游標，請再點擊畫面');
});

if (isTouch) {
  joystick.addEventListener('pointerdown', (event) => {
    joystickPointer = event.pointerId;
    try { joystick.setPointerCapture(event.pointerId); } catch { /* Some synthetic pointers cannot be captured. */ }
    updateJoystick(event);
  });
  joystick.addEventListener('pointermove', (event) => {
    if (event.pointerId === joystickPointer) updateJoystick(event);
  });
  const stopJoystick = (event) => {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    touchMove.set(0, 0);
    joystickKnob.style.transform = 'translate(-50%, -50%)';
  };
  joystick.addEventListener('pointerup', stopJoystick);
  joystick.addEventListener('pointercancel', stopJoystick);

  canvas.addEventListener('pointerdown', (event) => {
    if (!hasEntered || modalOpen || event.clientX < innerWidth * 0.32) return;
    pointerDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Continue with uncaptured look input. */ }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerDrag || event.pointerId !== pointerDrag.id) return;
    const dx = event.clientX - pointerDrag.x;
    const dy = event.clientY - pointerDrag.y;
    pointerDrag.x = event.clientX;
    pointerDrag.y = event.clientY;
    camera.rotation.y -= dx * 0.0042;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.0038, -1.28, 1.28);
  });
  const stopLook = (event) => {
    if (pointerDrag?.id === event.pointerId) pointerDrag = null;
  };
  canvas.addEventListener('pointerup', stopLook);
  canvas.addEventListener('pointercancel', stopLook);
}

setLoadingProgress(6);
finishLoading();
animate();
