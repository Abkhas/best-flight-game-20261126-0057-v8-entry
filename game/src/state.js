// state.js — WILDFIRE TANKER: the world model. One source of truth for the
// valley, the fire, the loadouts and the score. Pure numbers, no rendering:
// world.js draws what this file describes, flight.js moves through it.
export const WORLD = {
  size: 4200, // metres, valley is square, centre (0,0)
  windFromDeg: 315, // wind blows FROM the north-west, fire runs south-east
  windKt: 14,
  bingoFuel: 25, // percent — below this the HUD orders a divert to base
  tankGal: 3000, // full water tank
  scoopMinKt: 80,
  scoopMaxKt: 140,
  scoopMaxAglFt: 60,
  dropMaxAglFt: 350,
  dropMaxKt: 200,
};

// Fixed-seed value noise so the valley is the same every load.
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = smooth(fx), v = smooth(fz);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, z) {
  return noise2(x * 0.0011, z * 0.0011) * 0.62
    + noise2(x * 0.0031 + 7, z * 0.0031 - 3) * 0.28
    + noise2(x * 0.009 + 13, z * 0.009 + 5) * 0.10;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

// Named places. Everything the HUD, the minimap and the flight model name
// comes from here, so the names agree everywhere.
export const PLACES = {
  lake: { name: 'MIRROR LAKE', x: -900, z: -700, rx: 380, rz: 280, waterY: 2 },
  base: { name: 'CEDAR FORK AIR BASE', x: 800, z: 900, runwayHeadingDeg: 90, runwayLen: 620 },
  town: { name: 'CEDAR FORK TOWN', x: 300, z: -500, structures: 12 },
  lookout: { name: 'EAGLE LOOKOUT', x: -200, z: 300 },
  ridge: { name: 'BLACK RIDGE', x: -700, z: 600 },
};

// Terrain height in metres above sea level. Valley floor rolls gently, the
// rim rises to mountains, the lake is a bowl, town and runway are graded flat.
export function terrainHeight(x, z) {
  const r = Math.max(Math.abs(x), Math.abs(z));
  let h = 18 + fbm(x, z) * 22;
  const rim = clamp((r - 1500) / 600, 0, 1);
  h += rim * rim * 230 + rim * fbm(x * 2, z * 2) * 40;
  // lookout knoll
  const lk = dist2(x, z, PLACES.lookout.x, PLACES.lookout.z);
  h += 55 * Math.exp(-lk / (260 * 260));
  // ridge spine south-west
  const rg = dist2(x, z, PLACES.ridge.x, PLACES.ridge.z);
  h += 70 * Math.exp(-rg / (420 * 420));
  // lake bowl
  const lx = (x - PLACES.lake.x) / PLACES.lake.rx;
  const lz = (z - PLACES.lake.z) / PLACES.lake.rz;
  const ld = lx * lx + lz * lz;
  if (ld < 1.4) h = h * clamp((ld - 0.7) / 0.7, 0, 1) + (-10) * (1 - clamp((ld - 0.7) / 0.7, 0, 1));
  // graded flats: town and runway
  const td = dist2(x, z, PLACES.town.x, PLACES.town.z);
  if (td < 320 * 320) { const t = clamp(td / (320 * 320), 0, 1); h = 12 * (1 - t) + h * t; }
  const bd = dist2(x, z, PLACES.base.x, PLACES.base.z);
  if (bd < 420 * 420) { const t = clamp(bd / (420 * 420), 0, 1); h = 8 * (1 - t) + h * t; }
  return h;
}

// The three fire zones, in priority order. A zone the tanker ignores keeps
// burning: its burned acres grow with the wind and the town loses structures.
export function makeZones() {
  return [
    {
      id: 'town', name: 'TOWN EDGE', priority: 1, x: 150, z: -350, radius: 220,
      acres: 1550, burned: 118, containment: 0, spreadPerSec: 2.0,
      structures: 12, note: '12 homes on the line',
    },
    {
      id: 'lookout', name: 'EAGLE LOOKOUT', priority: 2, x: -200, z: 300, radius: 180,
      acres: 980, burned: 96, containment: 0, spreadPerSec: 1.6,
      structures: 1, note: 'tower crew of 2',
    },
    {
      id: 'ridge', name: 'BLACK RIDGE', priority: 3, x: -700, z: 600, radius: 260,
      acres: 2100, burned: 210, containment: 0, spreadPerSec: 2.6,
      structures: 0, note: 'timber, no homes',
    },
  ];
}

// Pick-1-of-3 loadout. The choice is made on the briefing screen and can be
// changed at base; each loadout drops a different pattern with its own power.
export const LOADOUTS = {
  water: { name: 'WATER', tag: 'WIDE FAN', power: 0.80, spreadM: 150, cooldownSec: 6, colour: '#bfe8ff',
    blurb: 'Wide fan, fast refill — best for the town edge' },
  retardant: { name: 'RETARDANT', tag: 'LONG LINE', power: 0.95, spreadM: 60, cooldownSec: 14, colour: '#ff5a4e',
    blurb: 'Long red line, holds the ridge — slow to reload' },
  mixed: { name: 'MIXED', tag: 'BALANCED', power: 0.88, spreadM: 100, cooldownSec: 9, colour: '#ffd27a',
    blurb: 'Half water, half retardant — the all-rounder' },
};

export function makeState() {
  return {
    phase: 'title', // title | briefing | flying | debrief
    loadout: 'water',
    timeSec: 0, // flight time since takeoff
    takeoffSec: 0,
    scoopSec: -1, // time of the last scoop, -1 until the first
    dropSec: -1, // time of the last drop
    score: 0,
    drops: 0,
    waterDroppedGal: 0,
    structuresSaved: 12,
    structuresLost: 0,
    fuelPct: 100,
    tankGal: 0, // starts empty on the ramp; scoop or base refill fills it
    dropCooldownSec: 0,
    bingoWarned: false,
    engineOut: false,
    crashed: false,
    landed: false,
    zones: makeZones(),
    plane: {
      x: 800, z: 1080, y: 0, // on the ramp beside the runway, facing east
      headingDeg: 90, speedKt: 0, pitchDeg: 0, bankDeg: 0,
      throttle: 0, onGround: true,
    },
    log: [], // short event lines for the debrief feed
  };
}

export function zoneAcresSaved(zone) {
  return Math.round(zone.acres * zone.containment);
}
export function totalAcresSaved(state) {
  return state.zones.reduce((s, z) => s + zoneAcresSaved(z), 0);
}
export function recomputeScore(state) {
  state.score = totalAcresSaved(state) * 10 + state.drops * 500 + state.structuresSaved * 100;
}
export function turnaroundSec(state) {
  if (state.scoopSec < 0 || state.dropSec < 0) return -1;
  return Math.max(0, state.dropSec - state.scoopSec);
}

// One simulation tick for the fire: un-contained zones keep spreading with
// the wind, and the town loses a home for every 130 acres it burns.
export function stepFire(state, dt) {
  for (const zone of state.zones) {
    if (zone.containment >= 1) continue;
    zone.burned = Math.min(zone.acres, zone.burned + zone.spreadPerSec * (1 - zone.containment) * dt);
  }
  const town = state.zones[0];
  const lost = Math.min(town.structures, Math.floor(town.burned / 130));
  if (lost !== state.structuresLost) {
    state.structuresLost = lost;
    state.structuresSaved = town.structures - lost;
    recomputeScore(state);
  }
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
export function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
