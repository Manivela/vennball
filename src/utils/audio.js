let ctx = null;
let muted = false;

export function isMuted() { return muted; }
export function setMuted(v) {
  muted = v;
  if (v) stopCrowd();
}

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Unlock AudioContext on first user gesture (required by mobile browsers).
// Playing a silent buffer is the most reliable way to unlock on iOS/Android.
function unlockAudio() {
  const ac = getCtx();
  const buf = ac.createBuffer(1, 1, ac.sampleRate);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(ac.destination);
  src.start(0);
  if (ac.state === "suspended") ac.resume();
  document.removeEventListener("touchstart", unlockAudio);
  document.removeEventListener("click", unlockAudio);
}
document.addEventListener("touchstart", unlockAudio);
document.addEventListener("click", unlockAudio);

function noise(ac, duration) {
  const len = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function playKick() {
  if (muted) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    // Thump (higher freq so mobile speakers can reproduce it)
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.08);
    const g1 = ac.createGain();
    g1.gain.setValueAtTime(0.8, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g1).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    // Impact pop
    const src = ac.createBufferSource();
    src.buffer = noise(ac, 0.04);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4000;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(lp).connect(g2).connect(ac.destination);
    src.start(t);
    src.stop(t + 0.04);
  } catch (_) {}
}

export function playDribble() {
  if (muted) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    // Soft tap
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(250, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.04);
    const g1 = ac.createGain();
    g1.gain.setValueAtTime(0.15, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(g1).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  } catch (_) {}
}

export function playGoal() {
  if (muted) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);
    const g1 = ac.createGain();
    g1.gain.setValueAtTime(0.25, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g1).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.4);

    const src = ac.createBufferSource();
    src.buffer = noise(ac, 0.8);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 600;
    bp.Q.value = 0.5;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.18, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    src.connect(bp).connect(g2).connect(ac.destination);
    src.start(t + 0.05);
    src.stop(t + 0.8);
  } catch (_) {}
}

export function playWhistle() {
  if (muted) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(3200, t);
    const vib = ac.createOscillator();
    vib.frequency.value = 6;
    const vibGain = ac.createGain();
    vibGain.gain.value = 120;
    vib.connect(vibGain).connect(osc.frequency);
    vib.start(t);
    vib.stop(t + 0.45);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.setValueAtTime(0.12, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  } catch (_) {}
}

let crowdSrc = null;
let crowdGain = null;

export function startCrowd() {
  if (muted) return;
  try {
    if (crowdSrc) return;
    const ac = getCtx();
    crowdSrc = ac.createBufferSource();
    crowdSrc.buffer = noise(ac, 4);
    crowdSrc.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 350;
    bp.Q.value = 0.3;
    crowdGain = ac.createGain();
    crowdGain.gain.value = 0.04;
    crowdSrc.connect(bp).connect(crowdGain).connect(ac.destination);
    crowdSrc.start();
  } catch (_) {}
}

export function setCrowdVolume(v) {
  if (crowdGain) crowdGain.gain.value = v;
}

export function stopCrowd() {
  try {
    crowdSrc?.stop();
  } catch (_) {}
  crowdSrc = null;
  crowdGain = null;
}

export function hapticKick() {
  try { navigator.vibrate?.(40); } catch (_) {}
}

export function hapticGoal() {
  try { navigator.vibrate?.([60, 40, 120]); } catch (_) {}
}
