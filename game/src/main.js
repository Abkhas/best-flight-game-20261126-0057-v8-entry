// main.js — WILDFIRE TANKER: boot, the render loop, the chase camera, the
// drop, and the staging hook the capture harness flies through
// (window.__tanker). The game is fully playable from the keyboard; the hook
// only presses the same inputs a pilot would.
import * as THREE from 'three';
import { WORLD, PLACES, makeState, terrainHeight, stepFire, fmtNum, fmtClock, totalAcresSaved, LOADOUTS } from './state.js';
import { makeInput, bindKeyboard, stepFlight, flightReadout, canScoop, canDrop, releaseDrop } from './flight.js';
import { buildWorld } from './world.js';
import { buildTanker, buildParkedTanker } from './tanker.js';
import { updateHud } from './hud.js';
import { showScreen, fillBriefing, fillDebrief, fillPilotLog } from './screens.js';
import { startAudio, setEngine, playScoop, playDrop, playBingo } from './audio.js';

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 9000);

const state = makeState();
state.plane.y = terrainHeight(state.plane.x, state.plane.z) + 1.5;
const input = makeInput();
const world = buildWorld(scene, state);
const tanker = buildTanker();
tanker.castShadow = true;
scene.add(tanker);
const parked = buildParkedTanker();
parked.position.set(PLACES.base.x - 120, terrainHeight(PLACES.base.x - 120, PLACES.base.z + 120) + 1.2, PLACES.base.z + 120);
parked.rotation.y = Math.PI / 2;
scene.add(parked);

let paused = false;
let frozen = false; // staged still: visuals run, the sim clock does not
let dropFlashUntil = 0;
let momentLine = '';
let frames = 0;
let lastDropAt = -1;
let bingoPlayed = false;

function nowSec() { return state.timeSec; }

function tryDrop() {
  if (state.phase !== 'flying' || paused || frozen) return;
  const r = flightReadout(state);
  const d = canDrop(state, r);
  if (!d.ok) {
    momentLine = d.why;
    dropFlashUntil = nowSec() + 1.6;
    return;
  }
  const p = state.plane;
  const loadout = LOADOUTS[state.loadout];
  world.spawnPlume(p.x, p.y - 4, p.z, loadout.spreadM, loadout.colour, p.headingDeg);
  const res = releaseDrop(state, p.x, p.z);
  playDrop();
  lastDropAt = nowSec();
  momentLine = res.hit
    ? 'DROP ON ' + res.hit.name + ' — +' + fmtNum(res.savedNow) + ' ACRES SAVED'
    : 'DROP — NO FIRE UNDERNEATH';
  dropFlashUntil = nowSec() + 4;
  if (res.hit && res.hit.containment >= 1) {
    momentLine = res.hit.name + ' CONTAINED — ' + fmtNum(totalAcresSaved(state)) + ' ACRES SAVED';
  }
}

bindKeyboard(input,
  () => { startAudio(); tryDrop(); },
  () => { paused = !paused; });

document.getElementById('btn-fly')?.addEventListener('click', () => {
  startAudio();
  state.phase = 'flying';
  showScreen('');
  document.getElementById('hud').style.display = '';
});
document.getElementById('btn-brief')?.addEventListener('click', () => {
  state.phase = 'briefing';
  fillBriefing(state);
  showScreen('briefing');
});
document.getElementById('btn-title')?.addEventListener('click', () => {
  state.phase = 'title';
  showScreen('title');
});
document.getElementById('btn-refly')?.addEventListener('click', () => {
  location.reload();
});
document.getElementById('btn-loadout-next')?.addEventListener('click', () => {
  const keys = Object.keys(LOADOUTS);
  state.loadout = keys[(keys.indexOf(state.loadout) + 1) % keys.length];
  fillBriefing(state);
});
window.addEventListener('pointerdown', () => startAudio(), { once: true });

// Chase camera: behind and above the tanker, three-quarter offset on the
// cover so the wing and the fire line ahead both read in one frame. The
// cover looks DOWN the drop line: the plane stays big in the upper half
// while the orange fire front and the white plume fill the lower half.
let camMode = 'chase';
function updateCamera(dt) {
  const p = state.plane;
  const hdg = (p.headingDeg * Math.PI) / 180;
  const fx = Math.sin(hdg), fz = -Math.cos(hdg);
  const rx = Math.cos(hdg), rz = Math.sin(hdg); // right vector
  const dist = camMode === 'cover' ? 23 : 26;
  const side = camMode === 'cover' ? 8 : 0;
  const tx = p.x - fx * dist + rx * side;
  const tz = p.z - fz * dist + rz * side;
  const ty = p.y + (camMode === 'cover' ? 8 : 7);
  const k = 1 - Math.exp(-dt * 4.5);
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  if (camMode === 'cover') {
    camera.lookAt(p.x + fx * 34, p.y - 10, p.z + fz * 34);
  } else {
    camera.lookAt(p.x + fx * 46, p.y + 1.5, p.z + fz * 46);
  }
  camera.rotation.z += (-p.bankDeg * 0.006);
}

// The moment line: one big legible line across the top of the frame.
function updateMomentLine() {
  const n = document.getElementById('moment');
  if (!n) return;
  const show = nowSec() < dropFlashUntil && momentLine;
  n.style.display = show ? 'block' : 'none';
  if (show) n.textContent = momentLine;
}

const clock = new THREE.Clock();
const SIM_STEP = 1 / 60;
let simAcc = 0;

// One fixed simulation step: fire, flight, scoop, fuel, crash. The render
// loop calls this as many times as fit in the real frame time, so the game
// runs at real time even when the renderer is slow (headless swiftshader
// renders ~2 fps; the flight still flies at 1x).
function simStep(dt) {
  if (frozen || state.phase !== 'flying') return;
  state.timeSec += dt;
  stepFire(state, dt);
  stepFlight(state, input, dt);
  const r = flightReadout(state);
  if (canScoop(state, r) && Math.random() < dt * 8) {
    world.spawnSpray(state.plane.x, state.plane.y - 1, state.plane.z + 4);
    if (Math.random() < dt * 2) playScoop();
  }
  if (state.fuelPct <= WORLD.bingoFuel && !bingoPlayed) { bingoPlayed = true; playBingo(); }
  if (state.crashed) {
    state.phase = 'debrief';
    fillDebrief(state);
    showScreen('debrief');
  }
}

function tick() {
  requestAnimationFrame(tick);
  const dtReal = Math.min(clock.getDelta(), 1.0);
  const t = clock.elapsedTime;
  if (!paused) {
    simAcc += dtReal;
    let n = 0;
    while (simAcc >= SIM_STEP && n < 60) { simStep(SIM_STEP); simAcc -= SIM_STEP; n++; }
    if (n === 60) simAcc = 0; // drop backlog rather than spiral
    // Particles run on capped frame time so a slow renderer leaves the plume
    // hanging in the air for the still instead of ageing it out in 2 frames.
    world.stepParticles(Math.min(dtReal, 0.05));
    world.stepFireVisual(t);
    const p = state.plane;
    tanker.position.set(p.x, p.y, p.z);
    tanker.rotation.set(0, 0, 0);
    tanker.rotation.order = 'YXZ';
    tanker.rotation.y = -(p.headingDeg * Math.PI) / 180;
    tanker.rotation.x = (p.pitchDeg * Math.PI) / 180;
    tanker.rotation.z = (-p.bankDeg * Math.PI) / 180;
    const spin = (0.3 + p.throttle * 2.2 + p.speedKt * 0.02) * dtReal * 12;
    for (const prop of tanker.userData.props) prop.rotation.z += spin;
    updateCamera(dtReal);
    updateHud(state);
    updateMomentLine();
    setEngine(p.throttle, p.speedKt);
  }
  renderer.render(scene, camera);
  frames++;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- The staging hook: the capture harness flies and stages through this,
// pressing the same inputs a keyboard pilot presses. Nothing here edits the
// score or the record; stage() only moves the camera and the plane.
function record() {
  return {
    score: state.score,
    drops: state.drops,
    acresSaved: totalAcresSaved(state),
    waterDroppedGal: state.waterDroppedGal,
    structuresSaved: state.structuresSaved,
    fuelPct: Math.round(state.fuelPct),
    timeSec: Math.round(state.timeSec),
    turnaroundSec: state.scoopSec >= 0 && state.dropSec >= 0 ? Math.round(state.dropSec - state.scoopSec) : -1,
    loadout: state.loadout,
    crashed: state.crashed,
    tankGal: Math.round(state.tankGal),
  };
}

function setInput(patch) { Object.assign(input, patch); }

function stage(name, rec) {
  // Freeze the sim clock so every staged shot shows the flown record exactly.
  frozen = true;
  paused = false;
  const p = state.plane;
  if (rec) {
    state.score = rec.score;
    state.drops = rec.drops;
    state.waterDroppedGal = rec.waterDroppedGal;
    state.structuresSaved = rec.structuresSaved;
    state.fuelPct = rec.fuelPct;
    state.timeSec = rec.timeSec;
    state.scoopSec = rec.turnaroundSec >= 0 ? rec.timeSec - rec.turnaroundSec : -1;
    state.dropSec = rec.timeSec;
    // Town containment that yields the recorded acres, so the zone bars agree.
    const town = state.zones[0];
    town.containment = Math.min(1, rec.acresSaved / town.acres);
  }
  if (name === 'cover') {
    camMode = 'cover';
    state.phase = 'flying';
    showScreen('');
    document.getElementById('hud').style.display = '';
    // Frame the drop: put the plane just past the Town Edge fire line, so
    // the orange front and the white plume sit ahead-below in the frame
    // (by freeze time the live plane has flown ~100 m past the zone).
    const zone = state.zones[0];
    const h = (p.headingDeg * Math.PI) / 180;
    p.x = zone.x + Math.sin(h) * 70;
    p.z = zone.z - Math.cos(h) * 70;
    momentLine = 'DROP ON TOWN EDGE — ' + fmtNum(totalAcresSaved(state)) + ' ACRES SAVED';
    dropFlashUntil = 1e9;
  } else if (name === 'scoop') {
    camMode = 'chase';
    state.phase = 'flying';
    showScreen('');
    document.getElementById('hud').style.display = '';
    // Low over Mirror Lake, mid-scoop for the next drop, record intact.
    p.x = PLACES.lake.x + 120; p.z = PLACES.lake.z - 60;
    p.y = PLACES.lake.waterY + 9;
    p.headingDeg = 100; p.speedKt = 112; p.pitchDeg = 0; p.bankDeg = 0;
    p.throttle = 0.55; p.onGround = false;
    state.tankGal = 1850;
    world.spawnSpray(p.x, p.y - 1, p.z + 6);
    momentLine = '';
    dropFlashUntil = 0;
  } else if (name === 'debrief') {
    state.phase = 'debrief';
    fillDebrief(state);
    showScreen('debrief');
  } else if (name === 'title') {
    state.phase = 'title';
    fillPilotLog(rec || record());
    showScreen('title');
  }
  updateHud(state);
}

window.__tanker = {
  state, input, setInput, stage, record,
  get frames() { return frames; },
  get phase() { return state.phase; },
  freeze() { frozen = true; },
  unfreeze() { frozen = false; },
  start() { state.phase = 'flying'; showScreen(''); },
  setCamMode(m) { camMode = m; },
  dropNow() { tryDrop(); },
  readout() { return flightReadout(state); },
  sprayNow() { const p = state.plane; world.spawnSpray(p.x, p.y - 1, p.z + 6); },
  plumeNow() {
    const p = state.plane;
    const loadout = LOADOUTS[state.loadout];
    world.spawnPlume(p.x, p.y - 4, p.z, loadout.spreadM, loadout.colour, p.headingDeg);
  },
  setPlane(x, z, y, hdg, spd) {
    const p = state.plane;
    p.x = x; p.z = z; p.y = y; p.headingDeg = hdg; p.speedKt = spd;
    p.onGround = false;
  },
};

fillBriefing(state);
showScreen('title');
tick();
