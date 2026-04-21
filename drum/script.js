// =====================
// ELEMENTS
// =====================
const video = document.getElementById("inputVideo");
const canvas = document.getElementById("overlayCanvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const soundEl = document.getElementById("sound");

const padElements = {
  kick: document.querySelector('[data-type="kick"]'),
  snare: document.querySelector('[data-type="snare"]'),
  hihat: document.querySelector('[data-type="hihat"]'),
  crash: document.querySelector('[data-type="crash"]'),
  tom: document.querySelector('[data-type="tom"]'),
};

// =====================
// AUDIO (REAL DRUM SAMPLES + DRUM FALLBACK)
// =====================
let audioStarted = false;
let samplesReady = false;

// Local-only candidates to avoid 404 spam from remote URLs.
const sampleCandidates = {
  kick: ["audio/kick.mp3", "audio/kick.wav"],
  snare: ["audio/snare.mp3", "audio/snare.wav"],
  hihat: ["audio/hihat.mp3", "audio/hihat.wav"],
  crash: ["audio/crash.mp3", "audio/crash.wav"],
  tom: ["audio/tom.mp3", "audio/tom.wav"],
};

const drumPlayers = {
  kick: null,
  snare: null,
  hihat: null,
  crash: null,
  tom: null,
};

// Drum-like fallback synths (not piano), used when sample files are missing.
const fallback = {
  kick: new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 8,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.45, sustain: 0.01, release: 0.18 },
  }).toDestination(),
  snare: new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.05 },
  }).toDestination(),
  hihat: new Tone.MetalSynth({
    frequency: 280,
    envelope: { attack: 0.001, decay: 0.07, release: 0.03 },
    harmonicity: 5.1,
    modulationIndex: 28,
    resonance: 3600,
    octaves: 1.4,
  }).toDestination(),
  crash: new Tone.MetalSynth({
    frequency: 430,
    envelope: { attack: 0.001, decay: 0.35, release: 0.32 },
    harmonicity: 5.6,
    modulationIndex: 42,
    resonance: 4200,
    octaves: 2.3,
  }).toDestination(),
  tom: new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 4,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0.01, release: 0.14 },
  }).toDestination(),
};

async function loadOneSample(type) {
  const candidates = sampleCandidates[type] || [];

  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    try {
      const p = new Tone.Player({ url, autostart: false }).toDestination();
      await p.load();
      drumPlayers[type] = p;
      return true;
    } catch (_err) {
      // Try next local candidate.
    }
  }

  return false;
}

async function loadAllSamples() {
  statusEl.innerText = "Loading drum samples...";

  const types = Object.keys(drumPlayers);
  let loadedCount = 0;

  for (let i = 0; i < types.length; i++) {
    const ok = await loadOneSample(types[i]);
    if (ok) loadedCount++;
  }

  samplesReady = loadedCount > 0;

  if (loadedCount === types.length) {
    statusEl.innerText = "Real drum kit ready";
  } else if (loadedCount > 0) {
    statusEl.innerText = `Real+fallback ready (${loadedCount}/5 sample files loaded)`;
  } else {
    statusEl.innerText =
      "Fallback drum kit ready. Add drum/audio/*.mp3 for real samples.";
  }
}

async function ensureAudioStarted() {
  if (audioStarted) return;
  await Tone.start();
  audioStarted = true;

  if (!samplesReady) {
    await loadAllSamples();
  }
}

["pointerdown", "touchstart", "keydown", "click"].forEach((evt) => {
  document.body.addEventListener(
    evt,
    () => {
      ensureAudioStarted().catch(() => {
        statusEl.innerText = "Audio start failed";
      });
    },
    { passive: true },
  );
});

// =====================
// CAMERA
// =====================
navigator.mediaDevices
  .getUserMedia({ video: { width: 320, height: 240 } })
  .then((stream) => {
    video.srcObject = stream;
  })
  .catch(() => {
    statusEl.innerText = "Camera permission required";
  });

// =====================
// GESTURE ENGINE
// =====================
const SMOOTH_ALPHA = 0.45;
const MOVEMENT_THRESHOLD = 0.01;
const STRIKE_VELOCITY = 0.028;
const REARM_UP_VELOCITY = -0.012;
const HAND_DEBOUNCE_MS = 110;
const PAD_DEBOUNCE_MS = 70;

const padCooldown = {
  kick: 0,
  snare: 0,
  hihat: 0,
  crash: 0,
  tom: 0,
};

function createHandState() {
  return {
    x: null,
    y: null,
    lastY: null,
    lastHitAt: 0,
    armed: true,
  };
}

const handStates = {
  right: createHandState(),
  left: createHandState(),
  h0: createHandState(),
  h1: createHandState(),
};

const ZONES = [
  { type: "kick", cx: 0.5, cy: 0.78, rx: 0.26, ry: 0.2 },
  { type: "snare", cx: 0.41, cy: 0.56, rx: 0.2, ry: 0.17 },
  { type: "hihat", cx: 0.23, cy: 0.52, rx: 0.18, ry: 0.18 },
  { type: "tom", cx: 0.64, cy: 0.52, rx: 0.2, ry: 0.18 },
  { type: "crash", cx: 0.23, cy: 0.27, rx: 0.2, ry: 0.2 },
];

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothAxis(prev, current) {
  if (prev === null) return current;
  const smoothed = SMOOTH_ALPHA * current + (1 - SMOOTH_ALPHA) * prev;
  if (Math.abs(smoothed - prev) < MOVEMENT_THRESHOLD) return prev;
  return smoothed;
}

function detectDrumZone(x, y) {
  let best = null;
  let minScore = Infinity;

  for (let i = 0; i < ZONES.length; i++) {
    const zone = ZONES[i];
    const dx = (x - zone.cx) / zone.rx;
    const dy = (y - zone.cy) / zone.ry;
    const score = dx * dx + dy * dy;

    if (score < minScore) {
      minScore = score;
      best = zone.type;
    }
  }

  if (minScore <= 1.35) return best;
  if (y > 0.72) return "kick";
  return null;
}

function playFallback(type) {
  if (type === "kick") fallback.kick.triggerAttackRelease("C1", "8n");
  if (type === "snare") fallback.snare.triggerAttackRelease("16n");
  if (type === "hihat") fallback.hihat.triggerAttackRelease("32n");
  if (type === "crash") fallback.crash.triggerAttackRelease("8n");
  if (type === "tom") fallback.tom.triggerAttackRelease("G2", "8n");
}

function play(type) {
  if (!type) return;

  const now = performance.now();
  if (now - padCooldown[type] < PAD_DEBOUNCE_MS) return;
  padCooldown[type] = now;

  if (audioStarted) {
    const p = drumPlayers[type];
    if (p && p.loaded) {
      p.stop();
      p.start();
    } else {
      playFallback(type);
    }
  }

  soundEl.innerText = type.toUpperCase();
  highlightPad(type);
}

function highlightPad(type) {
  const pad = padElements[type];
  if (!pad) return;

  pad.classList.add("active");
  setTimeout(() => {
    pad.classList.remove("active");
  }, 110);
}

function updateHandState(key, lm, now) {
  const state = handStates[key] || (handStates[key] = createHandState());
  if (!lm || lm.length < 9) return;

  const tip = lm[8];
  const rawX = clamp01(tip.x);
  const rawY = clamp01(tip.y);

  const x = smoothAxis(state.x, rawX);
  const y = smoothAxis(state.y, rawY);

  let velocityY = 0;
  if (state.lastY !== null) {
    velocityY = y - state.lastY;
  }

  if (velocityY < REARM_UP_VELOCITY) {
    state.armed = true;
  }

  if (
    state.armed &&
    velocityY > STRIKE_VELOCITY &&
    now - state.lastHitAt > HAND_DEBOUNCE_MS
  ) {
    const hitType = detectDrumZone(x, y);
    if (hitType) {
      play(hitType);
      state.lastHitAt = now;
      state.armed = false;
    }
  }

  state.x = x;
  state.y = y;
  state.lastY = y;
}

Object.values(padElements).forEach((pad) => {
  pad?.addEventListener("click", () => play(pad.dataset.type));
});

// =====================
// HAND TRACKING
// =====================
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 0,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});

hands.onResults((results) => {
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 240;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const landmarks = results?.multiHandLandmarks || [];
  const handedness = results?.multiHandedness || [];
  const now = performance.now();

  if (!landmarks.length) {
    soundEl.innerText = "--";
    return;
  }

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const label = handedness?.[i]?.label?.toLowerCase();
    const key = label === "left" || label === "right" ? label : `h${i}`;

    updateHandState(key, lm, now);

    const tip = lm[8];
    if (tip) {
      const px = tip.x * canvas.width;
      const py = tip.y * canvas.height;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(23, 232, 211, 0.8)";
      ctx.fill();
    }
  }
});

// =====================
// CAMERA LOOP
// =====================
video.onloadedmetadata = () => {
  const camera = new Camera(video, {
    onFrame: async () => {
      if (video.readyState === 4) {
        await hands.send({ image: video });
      }
    },
  });

  camera.start();
};
