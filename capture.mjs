// capture.mjs — WILDFIRE TANKER: 4-shot capture + checks.
// Headless Chromium over CDP (Node's built-in WebSocket), game/ served from
// localhost, three.js vendored. Run: node capture.mjs
// Output: screenshots/01-cover.jpg, 02-scoop.jpg, 03-debrief.jpg, 04-title.jpg
//         contact-sheet.jpg + checks.json at the repo root.
//
// The harness FLIES ONE REAL SORTIE through the game's own input path: a
// proportional controller sets window.__tanker.setInput (throttle / pitch /
// bank) every poll and the physics + fire + scoring do the rest — take off
// from Cedar Fork, scoop a full tank off Mirror Lake, drop it on the Town
// Edge fire line. The cover score, the drops, the acres saved, the fuel and
// the flight time are earned in that flown run; only the camera is staged,
// and the three later shots are staged from the same frozen record so every
// number agrees across all four frames.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8338;
const CDP_PORT = 9232;
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const BASE = `http://127.0.0.1:${PORT}/game/index.html`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapDeg = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

const checks = {};
const check = (name, ok, detail = '') => {
  checks[name] = { pass: !!ok, detail: String(detail).slice(0, 300) };
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
};

// Minimal CDP client over Node's built-in WebSocket.
class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('cdp timeout ' + method)); }
      }, 30000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  }
  async shot(file, quality = 78) {
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return fs.statSync(file).size;
  }
}

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, (res) => {
          let d = '';
          res.on('data', (c) => { d += c; });
          res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('no CDP page target');
}

const POLL_EXPR = `(() => {
  const t = window.__tanker;
  if (!t) return null;
  const s = t.state, p = s.plane, r = t.readout();
  return { phase: s.phase, x: p.x, z: p.z, y: p.y, hdg: p.headingDeg, spd: p.speedKt,
    thr: p.throttle, tank: s.tankGal, fuel: s.fuelPct, score: s.score, drops: s.drops,
    time: s.timeSec, crashed: s.crashed, onGround: p.onGround, agl: r.aglFt,
    overLake: r.overLake, frames: t.frames,
    zones: s.zones.map(z => ({ c: z.containment, b: Math.round(z.burned) })) };
})()`;

async function main() {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tanker-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--window-size=1280,800', '--hide-scrollbars',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP_PORT}`,
    '--enable-logging=stderr', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeLog = '';
  chrome.stderr.on('data', (d) => { chromeLog += d.toString(); });

  try {
    const wsUrl = await getWsUrl();
    const cdp = new Cdp(wsUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: BASE });

    // Boot: the game object appears and the title screen shows.
    let st = null;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      st = await cdp.eval(POLL_EXPR).catch(() => null);
      if (st && st.frames > 5) break;
    }
    check('boot: game object + first frames rendered', st && st.frames > 5, 'frames=' + (st ? st.frames : 0));
    check('boot: title screen visible', st && st.phase === 'title', 'phase=' + (st ? st.phase : 'none'));
    const titleText = await cdp.eval(`document.getElementById('screen-title').innerText`);
    check('boot: title names WILDFIRE TANKER + 3 pilot slots', /WILDFIRE TANKER/.test(titleText) && /MAVERICK REYES/.test(titleText) && /JUNE OKAFOR/.test(titleText) && /ELI VANCE/.test(titleText));
    check('boot: no page errors', !/Uncaught|Failed to load|net::ERR/.test(chromeLog), chromeLog.slice(-200));
    if (!st) throw new Error('game did not boot');

    // Start the sortie.
    await cdp.eval(`window.__tanker.start()`);
    await sleep(500);
    st = await cdp.eval(POLL_EXPR);
    check('play: sortie started, on the ramp', st.phase === 'flying' && st.onGround, 'phase=' + st.phase);

    // --- Autopilot: one proportional controller, same inputs as the keys. ---
    const setInput = (patch) => cdp.eval(`window.__tanker.setInput(${JSON.stringify(patch)})`);
    let autopilotPhase = 'takeoff';
    const t0 = Date.now();
    const deadline = Date.now() + 7 * 60 * 1000;
    let dropped = false;
    let lastLog = 0;
    while (Date.now() < deadline) {
      st = await cdp.eval(POLL_EXPR);
      if (!st) throw new Error('lost game state');
      if (st.crashed) throw new Error('autopilot crashed the tanker');
      const now = Date.now();
      if (now - lastLog > 15000) {
        lastLog = now;
        console.log(`  [${autopilotPhase}] spd=${st.spd.toFixed(0)}kt agl=${st.agl.toFixed(0)}ft tank=${Math.round(st.tank)} fuel=${st.fuel.toFixed(0)}% t=${st.time.toFixed(0)}s`);
      }
      if (autopilotPhase === 'takeoff') {
        await setInput({ throttleUp: true, pitchUp: st.spd > 85, pitchDown: false, bankLeft: false, bankRight: false });
        if (st.agl > 260) { autopilotPhase = 'toLake'; await setInput({ throttleUp: false }); }
      } else if (autopilotPhase === 'toLake' || autopilotPhase === 'scoop' || autopilotPhase === 'toZone') {
        // Glidepath: stay high until close, then descend. The low scoop run
        // only starts once the plane is actually over Mirror Lake — the rim
        // hills east of the lake eat a plane that descends early.
        let target;
        if (autopilotPhase === 'toZone') {
          const d0 = dist2d(st.x, st.z, 150, -350);
          target = d0 < 700
            ? { x: 150, z: -350, altFt: 260, spdKt: 150 }
            : { x: 150, z: -350, altFt: 420, spdKt: 150 };
        } else if (autopilotPhase === 'scoop') {
          const d0 = dist2d(st.x, st.z, -900, -700);
          target = (st.overLake || d0 < 300)
            ? { x: -900, z: -700, altFt: 32, spdKt: 112 }
            : { x: -900, z: -700, altFt: 150, spdKt: 120 };
        } else {
          const d0 = dist2d(st.x, st.z, -900, -700);
          target = d0 < 900
            ? { x: -900, z: -700, altFt: 220, spdKt: 140 }
            : { x: -900, z: -700, altFt: 420, spdKt: 150 };
        }
        const d = dist2d(st.x, st.z, target.x, target.z);
        const wantHdg = (Math.atan2(target.x - st.x, -(target.z - st.z)) * 180) / Math.PI;
        const err = wrapDeg(wantHdg - st.hdg);
        const bank = Math.abs(err) > 6 ? (err > 0 ? 'bankRight' : 'bankLeft') : null;
        // Terrain pull-up: never hold a low altitude over rising ground.
        const pullUp = st.agl < 90 && !st.overLake && autopilotPhase !== 'toZone';
        const pitchUp = pullUp || st.agl < target.altFt - 12;
        const pitchDown = !pullUp && st.agl > target.altFt + 12;
        const thrUp = st.spd < target.spdKt - 6;
        const thrDown = st.spd > target.spdKt + 6;
        await setInput({
          throttleUp: thrUp, throttleDown: thrDown,
          pitchUp, pitchDown,
          bankLeft: bank === 'bankLeft', bankRight: bank === 'bankRight',
        });
        if (autopilotPhase === 'toLake' && d < 700) autopilotPhase = 'scoop';
        if (autopilotPhase === 'scoop' && st.tank >= 2990) {
          autopilotPhase = 'toZone';
          console.log('  scoop complete: tank=' + Math.round(st.tank));
        }
        if (autopilotPhase === 'scoop' && st.time > 300) throw new Error('scoop timed out, tank=' + Math.round(st.tank));
        // The drop gate measures distance to the FIRE ZONE itself — never the
        // stale distance to the previous waypoint (a scoop-phase switch once
        // dropped the whole tank over the lake on that mistake).
        if (autopilotPhase === 'toZone' && dist2d(st.x, st.z, 150, -350) < 110 && st.agl < 320 && st.spd < 195) {
          await setInput({ throttleUp: false, throttleDown: false, pitchUp: false, pitchDown: false, bankLeft: false, bankRight: false });
          await cdp.eval(`window.__tanker.dropNow()`);
          await sleep(300);
          st = await cdp.eval(POLL_EXPR);
          dropped = st.drops >= 1;
          break;
        }
      }
      await sleep(120);
    }
    check('play: took off and reached the lake', autopilotPhase !== 'takeoff', 'phase=' + autopilotPhase);
    check('play: scooped a full tank off Mirror Lake', st.tank >= 2990 || st.drops >= 1, 'tank=' + Math.round(st.tank));
    check('play: dropped on the Town Edge fire line', dropped, 'drops=' + st.drops);

    // The drop moment: let the plume bloom, freeze the record, stage the cover.
    await sleep(700);
    const rec = await cdp.eval(`window.__tanker.record()`);
    check('play: flown record is real (score + acres + water)', rec.score > 5000 && rec.acresSaved > 500 && rec.waterDroppedGal >= 2500,
      `score=${rec.score} acres=${rec.acresSaved} water=${rec.waterDroppedGal} drops=${rec.drops} fuel=${rec.fuelPct}% time=${rec.timeSec}s`);
    await cdp.eval(`window.__tanker.freeze()`);
    await cdp.eval(`window.__tanker.stage('cover', ${JSON.stringify(rec)})`);
    await cdp.eval(`window.__tanker.plumeNow()`);
    await sleep(900);
    let size = await cdp.shot(path.join(OUT, '01-cover.jpg'));
    check('shot: cover written under 256 KiB', size <= 262144, size + ' bytes');

    // Shot 2: the scoop run, staged from the same frozen record.
    await cdp.eval(`window.__tanker.stage('scoop', ${JSON.stringify(rec)})`);
    for (let i = 0; i < 3; i++) { await cdp.eval(`window.__tanker.sprayNow()`); await sleep(300); }
    size = await cdp.shot(path.join(OUT, '02-scoop.jpg'));
    check('shot: scoop written under 256 KiB', size <= 262144, size + ' bytes');

    // Shot 3: the debrief — the proof screen with the flown record.
    await cdp.eval(`window.__tanker.stage('debrief', ${JSON.stringify(rec)})`);
    await sleep(600);
    size = await cdp.shot(path.join(OUT, '03-debrief.jpg'));
    check('shot: debrief written under 256 KiB', size <= 262144, size + ' bytes');

    // Shot 4: the title, carrying the last-sortie record.
    await cdp.eval(`window.__tanker.stage('title', ${JSON.stringify(rec)})`);
    await sleep(600);
    size = await cdp.shot(path.join(OUT, '04-title.jpg'));
    check('shot: title written under 256 KiB', size <= 262144, size + ' bytes');

    // The debrief text must carry the exact flown numbers.
    const deb = await cdp.eval(`window.__tanker.stage('debrief', ${JSON.stringify(rec)}); document.getElementById('screen-debrief').innerText`);
    check('consistency: debrief shows the flown score + acres', deb.includes(rec.score.toLocaleString('en-US')) && deb.includes(rec.acresSaved.toLocaleString('en-US')), 'score=' + rec.score + ' acres=' + rec.acresSaved);

    // Contact sheet: cover large on top, three small beneath (ffmpeg).
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-y',
        '-i', path.join(OUT, '01-cover.jpg'),
        '-i', path.join(OUT, '02-scoop.jpg'),
        '-i', path.join(OUT, '03-debrief.jpg'),
        '-i', path.join(OUT, '04-title.jpg'),
        '-filter_complex',
        '[0:v]scale=768:480[cover];[1:v]scale=256:160[t1];[2:v]scale=256:160[t2];[3:v]scale=256:160[t3];[t1][t2][t3]hstack=inputs=3[row];[cover][row]vstack=inputs=2[out]',
        '-map', '[out]', '-q:v', '4', path.join(ROOT, 'contact-sheet.jpg'),
      ], (err, stdout, stderr) => (err ? reject(new Error(stderr.slice(-500))) : resolve()));
    });
    const sheetSize = fs.statSync(path.join(ROOT, 'contact-sheet.jpg')).size;
    check('sheet: contact-sheet.jpg written under 256 KiB', sheetSize <= 262144, sheetSize + ' bytes');

    console.log('FLOWN RECORD: ' + JSON.stringify(rec));
    const failed = Object.values(checks).filter((c) => !c.pass).length;
    console.log(failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECKS FAILED');
    fs.writeFileSync(path.join(ROOT, 'checks.json'), JSON.stringify({ shots: [rec], checks }, null, 2));
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    chrome.kill('SIGKILL');
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* tmp */ }
  }
}

main().catch((e) => {
  console.error('CAPTURE FAILED:', e.message);
  fs.writeFileSync(path.join(ROOT, 'checks.json'), JSON.stringify({ shots: [], checks, error: e.message }, null, 2));
  process.exit(1);
});
