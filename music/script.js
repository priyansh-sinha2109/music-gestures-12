let currentIndex = 0;

// =====================
// ELEMENTS
// =====================
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const keyboard = document.getElementById("keyboard");
const status = document.getElementById("status");
const nowPlaying = document.getElementById("nowPlaying");
const modeButtons = document.querySelectorAll(".mode-btn");

video.style.transform = "scaleX(-1)";
canvas.style.transform = "scaleX(-1)";

// =====================
// CAMERA (Optimized for Raspberry Pi 4B 8GB)
// =====================
// Pi 4B can handle 800x600 @ 30fps smoothly with MediaPipe model complexity 0.
// Higher res = better hand detection at distance, but more CPU load.
// 640x480 is too low for reliable detection; 1280x720 is too heavy for Pi.
navigator.mediaDevices
  .getUserMedia({
    video: {
      width:  { ideal: 800, min: 640 },
      height: { ideal: 600, min: 480 },
      frameRate: { ideal: 30, min: 24 },
      facingMode: "user",
    },
  })
  .then((stream) => {
    video.srcObject = stream;
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    console.log(`Camera running: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);
  })
  .catch(() => {
    status.innerText = "Camera permission required";
  });

// =====================
// AUDIO
// =====================
let started = false;
let audioReady = false;

const BASE_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const buffers = {};
const AVAILABLE_NOTES = [];

for (let o = 2; o <= 6; o++) {
  BASE_NOTES.forEach((n) => {
    const note = n + o;
    buffers[note] = new Tone.ToneAudioBuffer(`audio/${note}.mp3`);
    AVAILABLE_NOTES.push(note);
  });
}
buffers.C7 = new Tone.ToneAudioBuffer("audio/C7.mp3");
AVAILABLE_NOTES.push("C7");

const masterGain = new Tone.Gain(1).toDestination();

Tone.loaded().then(() => {
  audioReady = true;
  Tone.context.lookAhead = 0.01;

  AVAILABLE_NOTES.forEach((note) => {
    const buf = buffers[note];
    if (!buf?.loaded) return;
    const src = new Tone.ToneBufferSource(buf).connect(masterGain);
    src.volume.value = -60;
    src.start(Tone.now());
    src.stop(Tone.now() + 0.02);
    setTimeout(() => src.dispose(), 100);
  });

  status.innerText = "Ready | Point & strike with one or two hands";
});

async function ensureAudioStarted() {
  if (started) return;
  await Tone.start();
  Tone.context.lookAhead = 0.01;
  started = true;
}
["pointerdown", "touchstart", "keydown", "click"].forEach((evt) => {
  document.body.addEventListener(evt, () => ensureAudioStarted().catch(() => {}), { passive: true });
});

// =====================
// UI KEYBOARD
// =====================
let keyViews = [];
function buildKeyboard() {
  keyboard.innerHTML = "";
  keyViews = [];
  for (let o = 2; o <= 6; o++) {
    BASE_NOTES.forEach((n) => {
      const note = n + o;
      const el = document.createElement("div");
      el.className = "white";
      el.innerHTML = `<span>${note}</span>`;
      keyboard.appendChild(el);
      keyViews.push({ note, el });
    });
  }
  const c7 = document.createElement("div");
  c7.className = "white";
  c7.innerHTML = "<span>C7</span>";
  keyboard.appendChild(c7);
  keyViews.push({ note: "C7", el: c7 });
}
buildKeyboard();

function flashKey(note) {
  const key = keyViews.find((k) => k.note === note);
  if (!key) return;
  key.el.classList.add("active");
  setTimeout(() => key.el.classList.remove("active"), 150);
}

// =====================
// MODES
// =====================
const MODES = {
  cinematic: { label: "Cinematic", gainDb: 3 },
  uplift:    { label: "Uplift",    gainDb: 5 },
  chill:     { label: "Chill",     gainDb: 1 },
};
let mode = "cinematic";

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    mode = btn.dataset.mode;
    status.innerText = `Mode: ${MODES[mode].label}`;
  });
});

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function noteFromGesture(x, y) {
  const nx = clamp((x - 0.05) / 0.9, 0, 1);
  const ny = clamp((y - 0.05) / 0.9, 0, 1);
  const degree = clamp(Math.floor(nx * 7), 0, 6);
  const octave = ny < 0.33 ? 5 : ny < 0.66 ? 4 : 3;
  const name = BASE_NOTES[degree];
  const candidate = `${name}${octave}`;
  return buffers[candidate]?.loaded ? candidate : null;
}

function playNote(note, gain) {
  if (!audioReady || !note) return;
  const buf = buffers[note];
  if (!buf?.loaded) return;
  const env = new Tone.Gain(gain).connect(masterGain);
  const src = new Tone.ToneBufferSource(buf).connect(env);
  src.start(Tone.now() + 0.003);
  src.onended = () => { src.dispose(); env.dispose(); };
  flashKey(note);
  nowPlaying.innerText = `${MODES[mode].label} | ${note}`;
}

// =====================
// ONE-EURO (tuned for higher responsiveness)
// =====================
class OneEuro {
  // Lower minCutoff = smoother but laggy; higher = snappier but jittery
  // Higher beta = more responsive to fast motion
  constructor(minCutoff = 2.5, beta = 0.05) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = 1.0;
    this.xPrev = null; this.dxPrev = 0; this.tPrev = null;
  }
  _alpha(c, dt) { const r = 2 * Math.PI * c * dt; return r / (r + 1); }
  filter(x, t) {
    if (this.tPrev === null) { this.tPrev = t; this.xPrev = x; return x; }
    const dt = Math.max((t - this.tPrev) / 1000, 1e-3);
    const dx = (x - this.xPrev) / dt;
    const aD = this._alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this._alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat; this.dxPrev = dxHat; this.tPrev = t;
    return xHat;
  }
  reset() { this.xPrev = null; this.dxPrev = 0; this.tPrev = null; }
}

// =====================
// TRACKED HAND SLOT (independent per hand)
// =====================
class HandSlot {
  constructor(id, color) {
    this.id = id;
    this.color = color;
    this.active = false;
    this.lastX = 0;
    this.lastY = 0;
    this.fx = new OneEuro(2.5, 0.05);
    this.fy = new OneEuro(2.5, 0.05);
    this.yHistory = [];
    this.strikeArmed = true;
    this.lastPlayAt = 0;
    this.lostFrames = 0;
  }
  reset() {
    this.active = false;
    this.fx.reset(); this.fy.reset();
    this.yHistory.length = 0;
    this.strikeArmed = true;
  }
}
const slots = [
  new HandSlot(0, "rgba(30, 240, 213, 0.9)"),
  new HandSlot(1, "rgba(240, 120, 30, 0.9)"),
];

// =====================
// SPATIAL HAND ASSIGNMENT
// =====================
function assignHandsToSlots(detectedHands) {
  const assigned = [null, null];
  const used = new Set();

  if (detectedHands.length === 0) return assigned;

  const activeSlots = slots
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => s.active);

  for (const { i, s } of activeSlots) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let d = 0; d < detectedHands.length; d++) {
      if (used.has(d)) continue;
      const dx = detectedHands[d].centroidX - s.lastX;
      const dy = detectedHands[d].centroidY - s.lastY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; bestIdx = d; }
    }
    // Wider acceptance radius helps when detection flickers
    if (bestIdx >= 0 && bestDist < 0.35 * 0.35) {
      assigned[i] = detectedHands[bestIdx];
      used.add(bestIdx);
    }
  }

  for (let d = 0; d < detectedHands.length; d++) {
    if (used.has(d)) continue;
    for (let i = 0; i < slots.length; i++) {
      if (!assigned[i]) {
        assigned[i] = detectedHands[d];
        used.add(d);
        break;
      }
    }
  }

  return assigned;
}

// =====================
// PER-HAND STRIKE LOGIC (HIGHER SENSITIVITY)
// =====================
// Lower STRIKE_VEL = easier to trigger notes with smaller motion
// Lower REARM_VEL (more negative = harder, less negative = easier)
const STRIKE_VEL = 0.45;      // was 0.6 — more sensitive
const REARM_VEL = -0.25;      // was -0.4 — easier to rearm
const LOST_THRESHOLD = 15;    // was 8 — tolerate longer detection dropouts

function processSlot(slot, detection) {
  if (!detection) {
    slot.lostFrames++;
    if (slot.lostFrames > LOST_THRESHOLD) slot.reset();
    return;
  }
  slot.lostFrames = 0;
  slot.active = true;

  const lm = detection.lm;
  const now = performance.now();

  const rawX = clamp(1 - lm[8].x, 0, 1);
  const rawY = clamp(lm[8].y, 0, 1);

  const fx = slot.fx.filter(rawX, now);
  const fy = slot.fy.filter(rawY, now);

  slot.lastX = detection.centroidX;
  slot.lastY = detection.centroidY;

  // Draw cursor (bigger for visibility at higher res)
  ctx.beginPath();
  ctx.arc((1 - fx) * canvas.width, fy * canvas.height, 14, 0, Math.PI * 2);
  ctx.fillStyle = slot.color;
  ctx.fill();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = slot.color;
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(`H${slot.id + 1}`, (1 - fx) * canvas.width + 18, fy * canvas.height + 6);
  ctx.restore();

  // Velocity calculation with slightly longer window for stability
  slot.yHistory.push({ y: fy, t: now });
  if (slot.yHistory.length > 4) slot.yHistory.shift();

  let velY = 0;
  if (slot.yHistory.length >= 2) {
    const first = slot.yHistory[0];
    const last = slot.yHistory[slot.yHistory.length - 1];
    const dt = Math.max((last.t - first.t) / 1000, 1e-3);
    velY = (last.y - first.y) / dt;
  }

  if (velY < REARM_VEL) slot.strikeArmed = true;

  const strike = velY > STRIKE_VEL;
  const rhythmGate = now - slot.lastPlayAt > 85; // was 100 — faster repeats

  if (slot.strikeArmed && strike && rhythmGate && started && audioReady) {
    const note = noteFromGesture(fx, fy);
    if (note) {
      const gain = clamp(1.25 - fy, 0.4, 1.0) * Tone.dbToGain(MODES[mode].gainDb);
      playNote(note, gain);
      slot.lastPlayAt = now;
      slot.strikeArmed = false;
    }
  }
}

// =====================
// HAND TRACKING (HIGHER SENSITIVITY)
// =====================
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 0,                // keep 0 for Pi 4B performance
  minDetectionConfidence: 0.45,      // was 0.6 — detect hands more easily
  minTrackingConfidence: 0.45,       // was 0.6 — keep tracking through brief occlusions
  selfieMode: true,                  // helps with mirrored front-cam detection
});

let processing = false;

hands.onResults((results) => {
  canvas.width = video.videoWidth || 800;
  canvas.height = video.videoHeight || 600;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const lms = results?.multiHandLandmarks || [];

  const detected = lms.map((lm) => ({
    lm,
    centroidX: 1 - lm[0].x,
    centroidY: lm[0].y,
  }));

  const assigned = assignHandsToSlots(detected);

  for (let i = 0; i < slots.length; i++) {
    processSlot(slots[i], assigned[i]);
  }

  if (detected.length === 0) nowPlaying.innerText = "--";
});

// =====================
// CAMERA LOOP (Pi-optimized)
// =====================
video.onloadedmetadata = () => {
  const camera = new Camera(video, {
    onFrame: async () => {
      if (processing || video.readyState !== 4) return;
      processing = true;
      try {
        await hands.send({ image: video });
      } finally {
        processing = false;
      }
    },
    // Lower camera frame processing to reduce CPU load on Pi
    width: 800,
    height: 600,
  });
  camera.start();
};