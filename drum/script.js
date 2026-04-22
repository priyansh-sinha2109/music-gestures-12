// =====================
// DOM
// =====================
const video = document.createElement("video");
video.style.display = "none";

const statusEl = document.getElementById("status");
const hitEl = document.getElementById("hit");
const stageEl = document.getElementById("drumStage");
const zoneEls = [...document.querySelectorAll(".zone")];

// =====================
// AUDIO MAP (FIXED ORDER)
// =====================
const SAMPLE_MAP = {
  crash: "audio/crash.mp3",
  ride: "audio/ride.mp3",
  hihat: "audio/hihat_closed.wav",
  snare: "audio/snare.wav",
  kick: "audio/kick.wav",
  tom1: "audio/tom_high.wav",
  tom2: "audio/tom_low.wav",
  floor: "audio/floor_tom.wav",
};

console.log("Loaded samples:", SAMPLE_MAP);

// =====================
// AUDIO LOAD
// =====================
const players = {};
const loadPromises = [];

Object.entries(SAMPLE_MAP).forEach(([zone, url]) => {
  const player = new Tone.Player({ url }).toDestination();
  players[zone] = player;

  loadPromises.push(
    player.load().then(
      () => ({ zone, ok: true }),
      () => ({ zone, ok: false }),
    ),
  );
});

let audioReady = false;
let samplesReady = false;

// =====================
// LOAD STATUS
// =====================
Promise.all(loadPromises).then((results) => {
  const failed = results.filter((r) => !r.ok).map((r) => r.zone);

  samplesReady = failed.length === 0;

  if (samplesReady) {
    statusEl.textContent = "Samples loaded. Tap to start.";
  } else {
    statusEl.textContent = `Missing: ${failed.join(", ")}`;
  }
});

// =====================
// AUDIO UNLOCK (FIXED)
// =====================
async function unlockAudio() {
  if (audioReady) return;

  await Tone.start();
  audioReady = true;

  if (samplesReady) {
    statusEl.textContent = "✅ Ready (Gesture Active)";
  }
}

["click", "touchstart", "keydown"].forEach((evt) => {
  document.body.addEventListener(evt, unlockAudio, { once: true });
});

// =====================
// ZONE DETECTION
// =====================
let zoneCircles = {};
const HIT_RADIUS_SCALE = 0.9;

function rebuildZoneCircles() {
  const stageRect = stageEl.getBoundingClientRect();
  const circles = {};

  zoneEls.forEach((el) => {
    const r = el.getBoundingClientRect();

    const cx = (r.left + r.width / 2 - stageRect.left) / stageRect.width;
    const cy = (r.top + r.height / 2 - stageRect.top) / stageRect.height;
    const radius =
      (Math.min(r.width, r.height) / 2 / stageRect.width) * HIT_RADIUS_SCALE;

    circles[el.dataset.zone] = { cx, cy, radius };
  });

  zoneCircles = circles;
}

function getZoneFromPosition(x, y) {
  let best = null;
  let bestDist = Infinity;

  Object.entries(zoneCircles).forEach(([zone, z]) => {
    const dx = x - z.cx;
    const dy = y - z.cy;
    const dist = dx * dx + dy * dy;

    if (dist < z.radius * z.radius && dist < bestDist) {
      bestDist = dist;
      best = zone;
    }
  });

  return best;
}

// =====================
// HIT LOGIC (SMOOTH + FAST)
// =====================
const PAD_COOLDOWN = 140;
const ACTIVE_TIME = 150;
const ALPHA = 0.4;
const MOVE_THRESHOLD = 0.02;
const VELOCITY_THRESHOLD = 0.03;

let smoothedX = null;
let smoothedY = null;
let filteredX = null;
let filteredY = null;
let lastY = null;
let previousZone = null;

const lastHit = {};

function smooth(prev, curr) {
  if (prev === null) return curr;
  return ALPHA * curr + (1 - ALPHA) * prev;
}

function threshold(prev, curr) {
  if (prev === null) return curr;
  if (Math.abs(curr - prev) < MOVE_THRESHOLD) return prev;
  return curr;
}

function activate(zone) {
  const el = document.querySelector(`.zone[data-zone="${zone}"]`);
  if (!el) return;

  el.classList.add("active");
  setTimeout(() => el.classList.remove("active"), ACTIVE_TIME);
}

function playZone(zone) {
  if (!zone) return;

  const now = performance.now();
  if (now - (lastHit[zone] || 0) < PAD_COOLDOWN) return;

  lastHit[zone] = now;

  if (audioReady && samplesReady && players[zone]) {
    players[zone].stop();
    players[zone].start();
  }

  activate(zone);
  hitEl.textContent = zone.toUpperCase();
}

// =====================
// HAND TRACKING
// =====================
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 0,
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.65,
});

hands.onResults((results) => {
  const lm = results?.multiHandLandmarks?.[0];

  if (!lm) {
    previousZone = null;
    lastY = null;
    return;
  }

  const x = lm[8].x;
  const y = lm[8].y;

  smoothedX = smooth(smoothedX, x);
  smoothedY = smooth(smoothedY, y);

  filteredX = threshold(filteredX, smoothedX);
  filteredY = threshold(filteredY, smoothedY);

  let velocity = 0;
  if (lastY !== null) velocity = filteredY - lastY;
  lastY = filteredY;

  const zone = getZoneFromPosition(filteredX, filteredY);

  if (zone && zone !== previousZone) playZone(zone);
  if (zone && velocity > VELOCITY_THRESHOLD) playZone(zone);

  previousZone = zone;
});

// =====================
// CAMERA (HIDDEN INPUT)
// =====================
navigator.mediaDevices
  .getUserMedia({ video: { width: 320, height: 240 } })
  .then((stream) => {
    video.srcObject = stream;

    rebuildZoneCircles();
    window.addEventListener("resize", rebuildZoneCircles);

    const cam = new Camera(video, {
      onFrame: async () => {
        if (video.readyState === 4) {
          await hands.send({ image: video });
        }
      },
      width: 320,
      height: 240,
    });

    cam.start();
  })
  .catch(() => {
    statusEl.textContent = "❌ Camera permission needed";
  });
