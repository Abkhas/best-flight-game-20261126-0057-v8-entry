// flight.js — WILDFIRE TANKER: arcade flight model and the working systems
// (throttle, scoop, drop, base refill, fuel and BINGO). The capture harness
// flies through setInput, exactly like a keyboard does.
import { WORLD, PLACES, terrainHeight, zoneAcresSaved, totalAcresSaved, recomputeScore, LOADOUTS } from './state.js';

const DEG = Math.PI / 180;
const KT_TO_MS = 0.514444;
const M_TO_FT = 3.28084;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function wrapDeg(a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a; }

// Keyboard state, shared by the real keys and the autopilot hook.
export function makeInput() {
  return {
    throttleUp: false, throttleDown: false,
    pitchUp: false, pitchDown: false,
    bankLeft: false, bankRight: false,
    rudderLeft: false, rudderRight: false,
    drop: false, brake: false,
  };
}

export function bindKeyboard(input, onDropKey, onPauseKey) {
  const map = {
    KeyW: 'throttleUp', KeyS: 'throttleDown',
    ArrowUp: 'pitchDown', ArrowDown: 'pitchUp',
    ArrowLeft: 'bankLeft', ArrowRight: 'bankRight',
    KeyA: 'rudderLeft', KeyD: 'rudderRight',
    KeyB: 'brake',
  };
  const down = (e) => {
    if (e.code === 'Space') { onDropKey(); e.preventDefault(); return; }
    if (e.code === 'KeyP') { onPauseKey(); return; }
    const k = map[e.code];
    if (k) { input[k] = true; e.preventDefault(); }
  };
  const up = (e) => { const k = map[e.code]; if (k) input[k] = false; };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}

// What the HUD and the drop logic need about the plane right now.
export function flightReadout(state) {
  const p = state.plane;
  const ground0 = terrainHeight(p.x, p.z);
  const overLake = (() => {
    const lx = (p.x - PLACES.lake.x) / PLACES.lake.rx;
    const lz = (p.z - PLACES.lake.z) / PLACES.lake.rz;
    return lx * lx + lz * lz < 1;
  })();
  // Over the lake, height is measured from the water, not the lake bed.
  const ground = overLake ? Math.max(ground0, PLACES.lake.waterY) : ground0;
  const aglFt = (p.y - ground) * M_TO_FT;
  const overRunway = Math.abs(p.z - PLACES.base.z) < 45
    && Math.abs(p.x - PLACES.base.x) < PLACES.base.runwayLen / 2;
  return { ground, aglFt, overLake, overRunway };
}

export function canScoop(state, r) {
  const p = state.plane;
  return r.overLake && r.aglFt < WORLD.scoopMaxAglFt && r.aglFt > 4
    && p.speedKt >= WORLD.scoopMinKt && p.speedKt <= WORLD.scoopMaxKt
    && state.tankGal < WORLD.tankGal && !p.onGround;
}
export function canDrop(state, r) {
  const p = state.plane;
  if (state.tankGal < 500) return { ok: false, why: 'TANK EMPTY' };
  if (state.dropCooldownSec > 0) return { ok: false, why: 'RELOADING ' + Math.ceil(state.dropCooldownSec) + 's' };
  if (r.aglFt > WORLD.dropMaxAglFt) return { ok: false, why: 'TOO HIGH — BELOW 350 FT' };
  if (p.speedKt > WORLD.dropMaxKt) return { ok: false, why: 'TOO FAST — BELOW 200 KT' };
  if (p.onGround) return { ok: false, why: 'ON THE GROUND' };
  return { ok: true, why: '' };
}

// A drop release: the tank empties over the fire line, the zone under the
// plane takes the loadout's containment, and the score is recomputed.
export function releaseDrop(state, fx, fz) {
  const loadout = LOADOUTS[state.loadout];
  const before = totalAcresSaved(state);
  let hit = null;
  for (const zone of state.zones) {
    const dx = fx - zone.x, dz = fz - zone.z;
    if (dx * dx + dz * dz < (zone.radius + 60) * (zone.radius + 60)) {
      zone.containment = Math.min(1, zone.containment + loadout.power);
      hit = zone;
    }
  }
  state.drops += 1;
  state.waterDroppedGal += state.tankGal;
  state.tankGal = 0;
  state.dropSec = state.timeSec;
  state.dropCooldownSec = loadout.cooldownSec;
  recomputeScore(state);
  const savedNow = totalAcresSaved(state) - before;
  state.log.push((hit ? 'DROP ON ' + hit.name : 'DROP — NO FIRE UNDERNEATH')
    + ' · +' + savedNow.toLocaleString('en-US') + ' ACRES');
  return { hit, savedNow, loadout };
}

// One physics tick. Arcade, not a simulator: throttle sets target speed,
// bank turns the nose, pitch trades speed for climb, and slow flight sinks.
export function stepFlight(state, input, dt) {
  const p = state.plane;
  if (state.crashed) return;
  const r = flightReadout(state);

  // Throttle: W/S move it, it holds where you leave it.
  if (input.throttleUp) p.throttle = clamp(p.throttle + 0.55 * dt, 0, 1);
  if (input.throttleDown) p.throttle = clamp(p.throttle - 0.55 * dt, 0, 1);
  if (state.engineOut) p.throttle = 0;

  // Fuel burns with throttle; empty means the engine quits.
  const burn = (0.10 + p.throttle * 0.34) * dt; // percent per second
  state.fuelPct = Math.max(0, state.fuelPct - burn);
  if (state.fuelPct <= 0 && !state.engineOut) {
    state.engineOut = true;
    state.log.push('FUEL EXHAUSTED — ENGINE OUT, GLIDE TO BASE');
  }
  if (state.fuelPct <= WORLD.bingoFuel && !state.bingoWarned) {
    state.bingoWarned = true;
    state.log.push('BINGO FUEL — DIVERT TO CEDAR FORK BASE');
  }
  if (state.dropCooldownSec > 0) state.dropCooldownSec -= dt;

  // Speed chases the throttle target; drag and climb bleed it.
  const targetKt = p.onGround ? p.throttle * 120 : 55 + p.throttle * 145;
  const accel = p.onGround ? 14 : 9;
  p.speedKt += clamp(targetKt - p.speedKt, -accel * dt, accel * dt);
  if (input.brake && p.onGround) p.speedKt = Math.max(0, p.speedKt - 40 * dt);

  // Bank and pitch ease toward the stick, then hold.
  const bankTarget = (input.bankLeft ? -38 : 0) + (input.bankRight ? 38 : 0);
  const pitchTarget = (input.pitchUp ? 14 : 0) + (input.pitchDown ? -12 : 0);
  p.bankDeg += clamp(bankTarget - p.bankDeg, -90 * dt, 90 * dt);
  p.pitchDeg += clamp(pitchTarget - p.pitchDeg, -45 * dt, 45 * dt);

  // The turn follows the bank; a little rudder sharpens it.
  const turnRate = p.bankDeg * 0.42 + (input.rudderLeft ? -6 : 0) + (input.rudderRight ? 6 : 0);
  p.headingDeg = wrapDeg(p.headingDeg + turnRate * dt * clamp(p.speedKt / 90, 0.25, 1));

  // Climb needs speed: pitch lifts only above 75 kt, and slow flight sinks.
  const hdg = p.headingDeg * DEG;
  const climbMs = p.onGround ? 0
    : Math.sin(p.pitchDeg * DEG) * p.speedKt * KT_TO_MS * clamp((p.speedKt - 55) / 45, 0, 1)
    - (p.speedKt < 70 ? (70 - p.speedKt) * 0.09 : 0);
  p.vspeedMs = climbMs;
  const vMs = p.speedKt * KT_TO_MS;
  p.x += Math.sin(hdg) * vMs * dt;
  p.z += -Math.cos(hdg) * vMs * dt;
  p.y += climbMs * dt;

  // Stay inside the valley; the rim turns you back with a warning, it does
  // not eat the plane.
  const edge = WORLD.size / 2 - 120;
  if (Math.abs(p.x) > edge || Math.abs(p.z) > edge) {
    p.x = clamp(p.x, -edge, edge);
    p.z = clamp(p.z, -edge, edge);
    p.headingDeg = wrapDeg(p.headingDeg + 180);
  }

  // Rotation: pull back above 82 kt and the tanker lifts off the runway.
  if (p.onGround && p.speedKt > 82 && input.pitchUp) {
    p.onGround = false;
    p.y = r.ground + 10;
    state.log.push('ROTATION — TANKER 7 AIRBORNE');
  }

  // Ground contact. While on the ground the tanker is a ground vehicle: it
  // follows the terrain over dips and rises, and only rotation lifts it off.
  // An airborne arrival is a touchdown: runway or lake at sane speed is a
  // landing; rough ground at speed, or a steep arrival, is a crash.
  const ground = r.ground;
  if (p.onGround) {
    p.y = ground + 1.5;
    p.pitchDeg = 0;
    p.bankDeg = 0;
  } else if (p.y <= ground + 1.5) {
    p.y = ground + 1.5;
    const rough = !r.overRunway && !r.overLake;
    if (p.speedKt > 140 || (rough && (p.vspeedMs ?? 0) < -3)) {
      state.crashed = true;
      state.log.push('CRASHED INTO TERRAIN — SORTIE OVER');
      return;
    }
    p.onGround = true;
    state.landed = true;
    state.log.push('TOUCHDOWN — ' + (r.overRunway ? 'CEDAR FORK RUNWAY' : rough ? 'ROUGH FIELD' : 'OFF-FIELD'));
    p.pitchDeg = 0;
    p.bankDeg = 0;
  }

  // Scooping: low and slow over Mirror Lake fills the tank and throws spray.
  if (canScoop(state, r)) {
    const fill = 900 * dt;
    state.tankGal = Math.min(WORLD.tankGal, state.tankGal + fill);
    if (state.scoopSec < 0 || state.tankGal >= WORLD.tankGal - 1) state.scoopSec = state.timeSec;
    p.speedKt = Math.max(WORLD.scoopMinKt - 4, p.speedKt - 6 * dt);
  }
  // Base refill: a slow pass over the runway tops up tank and fuel.
  if (r.overRunway && r.aglFt < 40 && p.speedKt < 120 && !p.onGround) {
    state.tankGal = Math.min(WORLD.tankGal, state.tankGal + 1200 * dt);
    state.fuelPct = Math.min(100, state.fuelPct + 8 * dt);
  }
  if (p.onGround && r.overRunway && p.speedKt < 30) {
    state.tankGal = Math.min(WORLD.tankGal, state.tankGal + 1500 * dt);
    state.fuelPct = Math.min(100, state.fuelPct + 12 * dt);
  }
}
