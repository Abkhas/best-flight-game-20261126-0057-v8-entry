// screens.js — WILDFIRE TANKER: title, briefing and debrief. The briefing is
// the fire map + wind + the pick-1-of-3 loadout; the debrief is the flown
// record, number for number the same as the HUD shows in flight.
import { PLACES, WORLD, LOADOUTS, fmtClock, fmtNum, totalAcresSaved, zoneAcresSaved, turnaroundSec } from './state.js';

function el(id) { return document.getElementById(id); }
function set(id, text) { const n = el(id); if (n) n.textContent = text; }

export function showScreen(name) {
  for (const s of ['title', 'briefing', 'debrief']) {
    const n = el('screen-' + s);
    if (n) n.style.display = s === name ? 'flex' : 'none';
  }
  const hud = el('hud');
  if (hud) hud.style.display = (name === 'title' || name === 'debrief') ? 'none' : '';
}

export function fillBriefing(state) {
  const list = el('brief-zones');
  if (list) {
    list.innerHTML = state.zones.map((z) => (
      '<div class="brief-zone"><b>P' + z.priority + ' · ' + z.name + '</b>'
      + '<span>' + fmtNum(z.acres) + ' AC · ' + z.note + '</span>'
      + '<span>BURNING ' + fmtNum(z.burned) + ' AC · SPREAD ' + z.spreadPerSec.toFixed(1) + ' AC/S</span></div>'
    )).join('');
  }
  set('brief-wind', 'WIND FROM NW ' + WORLD.windKt + ' KT — FIRE RUNS SOUTH-EAST TOWARD TOWN');
  set('brief-base', PLACES.base.name + ' · RUNWAY 09/27 · ' + PLACES.base.runwayLen + ' M');
  set('brief-lake', PLACES.lake.name + ' · SCOOP LOW + 80–140 KT · ' + fmtNum(WORLD.tankGal) + ' GAL');
  renderLoadouts(state);
}

export function renderLoadouts(state) {
  const box = el('brief-loadouts');
  if (!box) return;
  box.innerHTML = Object.entries(LOADOUTS).map(([key, l]) => (
    '<button class="loadout' + (state.loadout === key ? ' picked' : '') + '" data-loadout="' + key + '">'
    + '<b>' + l.name + '</b><i>' + l.tag + '</i>'
    + '<span>' + l.blurb + '</span>'
    + '<span>COVER ' + Math.round(l.power * 100) + '% · COOLDOWN ' + l.cooldownSec + 's</span></button>'
  )).join('');
  box.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.loadout = b.dataset.loadout;
      renderLoadouts(state);
    });
  });
}

export function fillDebrief(state) {
  const turn = turnaroundSec(state);
  set('deb-score', fmtNum(state.score));
  set('deb-acres', fmtNum(totalAcresSaved(state)));
  set('deb-drops', String(state.drops));
  set('deb-water', fmtNum(state.waterDroppedGal) + ' GAL');
  set('deb-homes', state.structuresSaved + ' / 12');
  set('deb-fuel', Math.round(state.fuelPct) + '%');
  set('deb-time', fmtClock(state.timeSec));
  set('deb-turn', turn >= 0 ? fmtClock(turn) : '--:--');
  set('deb-loadout', state.loadout.toUpperCase());
  set('deb-loadout2', state.loadout.toUpperCase());
  const rows = el('deb-zones');
  if (rows) {
    rows.innerHTML = state.zones.map((z) => (
      '<div class="deb-zone"><b>P' + z.priority + ' · ' + z.name + '</b>'
      + '<span>' + Math.round(z.containment * 100) + '% CONTAINED</span>'
      + '<span>' + fmtNum(zoneAcresSaved(z)) + ' AC SAVED · ' + fmtNum(z.burned) + ' AC BURNED</span></div>'
    )).join('');
  }
  const feed = el('deb-log');
  if (feed) feed.innerHTML = state.log.slice(-4).map((l) => '<div>▸ ' + l + '</div>').join('');
  set('deb-grade', state.crashed ? 'SORTIE LOST'
    : totalAcresSaved(state) >= 1200 ? 'TOWN SAVED — OUTSTANDING SORTIE'
    : totalAcresSaved(state) >= 600 ? 'FIRE HELD — GOOD SORTIE'
    : 'FIRE STILL RUNNING — FLY AGAIN');
}

// The title screen's pilot log: the last flown record, so the title, the
// cover and the debrief all show the same numbers.
export function fillPilotLog(record) {
  if (!record) return;
  set('title-last', 'LAST SORTIE · TANKER 7 — SCORE ' + fmtNum(record.score)
    + ' · ' + record.drops + ' DROP' + (record.drops === 1 ? '' : 'S')
    + ' · ' + fmtNum(record.acresSaved) + ' AC SAVED'
    + ' · FUEL ' + Math.round(record.fuelPct) + '% · ' + fmtClock(record.timeSec));
}
