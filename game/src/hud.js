// hud.js — WILDFIRE TANKER: the four-corner HUD and the minimap. Every panel
// shows live numbers from state.js; nothing here is hard-coded, so the four
// screenshots always agree with the flown record.
import { WORLD, PLACES, fmtClock, fmtNum, totalAcresSaved, zoneAcresSaved, turnaroundSec } from './state.js';
import { flightReadout, canDrop } from './flight.js';

function el(id) { return document.getElementById(id); }
function set(id, text) { const n = el(id); if (n && n.textContent !== text) n.textContent = text; }
function show(id, on) { const n = el(id); if (n) n.style.display = on ? '' : 'none'; }

const ZONE_COLOURS = { town: '#ff7a33', lookout: '#ffb03a', ridge: '#ff4a2a' };

export function updateHud(state) {
  const p = state.plane;
  const r = flightReadout(state);
  const drop = canDrop(state, r);
  const turn = turnaroundSec(state);

  set('hud-score', fmtNum(state.score));
  set('hud-drops', String(state.drops));
  set('hud-acres', fmtNum(totalAcresSaved(state)));
  set('hud-water', fmtNum(state.waterDroppedGal) + ' GAL');
  set('hud-fuel', Math.round(state.fuelPct) + '%');
  set('hud-clock', fmtClock(state.timeSec));
  set('hud-turn', turn >= 0 ? fmtClock(turn) : '--:--');
  set('hud-spd', Math.round(p.speedKt) + ' KT');
  set('hud-alt', Math.round((p.y - r.ground) * 3.28084) + ' FT');
  set('hud-hdg', String(Math.round(((p.headingDeg % 360) + 360) % 360)).padStart(3, '0') + '°');
  set('hud-tank', fmtNum(state.tankGal) + ' / ' + fmtNum(WORLD.tankGal) + ' GAL');
  set('hud-struct', state.structuresSaved + ' / 12 HOMES');
  set('hud-wind', 'WIND NW ' + WORLD.windKt + ' KT');
  set('hud-loadout', state.loadout.toUpperCase());

  const tankFill = el('hud-tankfill');
  if (tankFill) tankFill.style.width = Math.round((state.tankGal / WORLD.tankGal) * 100) + '%';
  const fuelFill = el('hud-fuelfill');
  if (fuelFill) {
    fuelFill.style.width = Math.round(state.fuelPct) + '%';
    fuelFill.style.background = state.fuelPct <= WORLD.bingoFuel ? '#ff3b2f' : '#ffd23e';
  }
  show('hud-bingo', state.fuelPct <= WORLD.bingoFuel && !state.engineOut);
  show('hud-engineout', state.engineOut);
  show('hud-crash', state.crashed);

  const dropBtn = el('hud-dropstate');
  if (dropBtn) {
    dropBtn.textContent = state.tankGal < 500 ? 'TANK EMPTY'
      : state.dropCooldownSec > 0 ? 'RELOADING ' + Math.ceil(state.dropCooldownSec) + 's'
      : drop.ok ? '● DROP READY — SPACE' : '✕ ' + drop.why;
    dropBtn.style.color = drop.ok ? '#7dff8a' : '#ffb03a';
  }
  const scoop = el('hud-scoop');
  if (scoop) {
    scoop.textContent = state.tankGal >= WORLD.tankGal ? 'TANK FULL'
      : (r.overLake && r.aglFt < 120) ? 'SCOOPING… LOW + SLOW OVER THE LAKE'
      : 'SCOOP: LOW + 80–140 KT OVER MIRROR LAKE';
    scoop.style.color = (r.overLake && r.aglFt < 120) ? '#7dff8a' : '#cfe8ff';
  }

  // Zone list: priority, containment bar, acres saved — the mission card.
  state.zones.forEach((zone, i) => {
    set('zone-' + i + '-name', 'P' + zone.priority + ' · ' + zone.name);
    set('zone-' + i + '-pct', Math.round(zone.containment * 100) + '%');
    set('zone-' + i + '-acres', fmtNum(zoneAcresSaved(zone)) + ' AC SAVED');
    const bar = el('zone-' + i + '-bar');
    if (bar) bar.style.width = Math.round(zone.containment * 100) + '%';
    const row = el('zone-' + i);
    if (row) row.style.borderColor = zone.containment >= 1 ? '#7dff8a' : ZONE_COLOURS[zone.id];
  });

  drawMinimap(state, r);
}

function drawMinimap(state, r) {
  const cv = el('minimap');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const S = W / WORLD.size;
  const px = (x) => (x + WORLD.size / 2) * S;
  const pz = (z) => (z + WORLD.size / 2) * S;
  ctx.fillStyle = '#1d3a24';
  ctx.fillRect(0, 0, W, H);
  // lake
  ctx.fillStyle = '#2f6fb4';
  ctx.beginPath();
  ctx.ellipse(px(PLACES.lake.x), pz(PLACES.lake.z), PLACES.lake.rx * S, PLACES.lake.rz * S, 0, 0, Math.PI * 2);
  ctx.fill();
  // runway
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(px(PLACES.base.x) - 14, pz(PLACES.base.z) - 2, 28, 4);
  // town
  ctx.fillStyle = '#d8c9a8';
  ctx.fillRect(px(PLACES.town.x) - 4, pz(PLACES.town.z) - 4, 8, 8);
  // fire zones: orange ring, filled by containment
  state.zones.forEach((zone) => {
    ctx.strokeStyle = ZONE_COLOURS[zone.id];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(zone.x), pz(zone.z), zone.radius * S, 0, Math.PI * 2);
    ctx.stroke();
    if (zone.containment > 0) {
      ctx.fillStyle = 'rgba(125,255,138,0.55)';
      ctx.beginPath();
      ctx.arc(px(zone.x), pz(zone.z), zone.radius * S * zone.containment, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('P' + zone.priority, px(zone.x) - 5, pz(zone.z) + 3);
  });
  // wind arrow
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W - 26, 14); ctx.lineTo(W - 12, 26); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.fillText('NW', W - 30, 10);
  // plane marker: a yellow triangle on its heading
  const h = (state.plane.headingDeg * Math.PI) / 180;
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(px(state.plane.x) + Math.sin(h) * 7, pz(state.plane.z) - Math.cos(h) * 7);
  ctx.lineTo(px(state.plane.x) + Math.sin(h + 2.5) * 5, pz(state.plane.z) - Math.cos(h + 2.5) * 5);
  ctx.lineTo(px(state.plane.x) + Math.sin(h - 2.5) * 5, pz(state.plane.z) - Math.cos(h - 2.5) * 5);
  ctx.closePath();
  ctx.fill();
}
