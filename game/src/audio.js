// audio.js — WILDFIRE TANKER: procedural sound, no audio files. Engine hum
// follows the throttle, a scoop rush, a drop whoosh and a BINGO beep. Every
// call is guarded: headless runs and muted browsers never throw.
let ctx = null, engineOsc = null, engineGain = null, started = false;

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filt).connect(engineGain).connect(ctx.destination);
    engineOsc.start();
    return true;
  } catch { return false; }
}

export function startAudio() {
  if (started) return;
  started = true;
  if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setEngine(throttle, speedKt) {
  if (!ctx || !engineOsc || !engineGain) return;
  try {
    engineOsc.frequency.value = 48 + throttle * 55 + speedKt * 0.12;
    engineGain.gain.value = 0.015 + throttle * 0.05;
  } catch { /* muted */ }
}

function noiseBurst(durSec, freq, gainVal) {
  if (!ensure()) return;
  try {
    const len = Math.floor(ctx.sampleRate * durSec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  } catch { /* muted */ }
}

export function playScoop() { noiseBurst(1.4, 900, 0.12); }
export function playDrop() { noiseBurst(2.2, 300, 0.2); }
export function playBingo() {
  if (!ensure()) return;
  try {
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'square'; o.frequency.value = 880;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, ctx.currentTime + i * 0.22);
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.22 + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.22);
      o.stop(ctx.currentTime + i * 0.22 + 0.13);
    }
  } catch { /* muted */ }
}
