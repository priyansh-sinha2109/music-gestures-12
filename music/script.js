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

// =====================
// CAMERA
// =====================
navigator.mediaDevices
  .getUserMedia({ video: { width: 320, height: 240 } })
  .then((stream) => {
    video.srcObject = stream;
  })
  .catch(() => {
    status.innerText = "Camera permission required";
  });

// =====================
// AUDIO SYSTEM (REAL SAMPLES)
// =====================
let started = false;
let audioReady = false;

const BASE_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const players = {};
const AVAILABLE_NOTES = [];

for (let o = 2; o <= 6; o++) {
  BASE_NOTES.forEach((n) => {
    const note = n + o;
    players[note] = new Tone.Player({
      url: `audio/${note}.mp3`,
    }).toDestination();
    AVAILABLE_NOTES.push(note);
  });
}
players.C7 = new Tone.Player({ url: "audio/C7.mp3" }).toDestination();
AVAILABLE_NOTES.push("C7");

Tone.loaded().then(() => {
  audioReady = true;
  status.innerText = "Ready | Perform melody with hand gestures";
});

async function ensureAudioStarted() {
  if (started) return;
  await Tone.start();
  started = true;
}

["pointerdown", "touchstart", "keydown", "click"].forEach((evt) => {
  document.body.addEventListener(
    evt,
    () => {
      ensureAudioStarted().catch(() => {});
    },
    { passive: true },
  );
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
  setTimeout(() => key.el.classList.remove("active"), 170);
}

// =====================
// MELODY ENGINE
// =====================
const MODES = {
  cinematic: {
    label: "Cinematic",
    phrase: [0, 2, 4, 7, 4, 2, 5, 4],
    rhythmMs: 210,
    gainDb: 3,
  },
  uplift: {
    label: "Uplift",
    phrase: [0, 2, 4, 5, 7, 9, 7, 5],
    rhythmMs: 150,
    gainDb: 5,
  },
  chill: {
    label: "Chill",
    phrase: [0, 3, 5, 7, 10, 7, 5, 3],
    rhythmMs: 280,
    gainDb: 1,
  },
};

let mode = "cinematic";
let stepIndex = 0;
let lastPlayAt = 0;
let smoothedX = null;
let smoothedY = null;
let filteredX = null;
let filteredY = null;
let lastY = null;
let strikeArmed = true;

const SMOOTH_ALPHA = 0.42;
const MOVE_THRESHOLD = 0.012;
const STRIKE_DOWN_VELOCITY = 0.01;
const REARM_UP_VELOCITY = -0.006;

function smoothAxis(prev, value) {
  if (prev === null) return value;
  return SMOOTH_ALPHA * value + (1 - SMOOTH_ALPHA) * prev;
}

function thresholdAxis(prev, value) {
  if (prev === null) return value;
  if (Math.abs(value - prev) < MOVE_THRESHOLD) return prev;
  return value;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function noteToParts(note) {
  const name = note.slice(0, -1);
  const octave = parseInt(note.slice(-1), 10);
  return { name, octave };
}

function partsToNote(name, octave) {
  const o = clamp(octave, 2, 7);
  const note = `${name}${o}`;
  if (players[note]) return note;

  const fallbackOctave = clamp(o - 1, 2, 7);
  const fallback = `${name}${fallbackOctave}`;
  return players[fallback] ? fallback : null;
}

function getRootFromGesture(x, y) {
  const rootName =
    BASE_NOTES[
      clamp(Math.floor(x * BASE_NOTES.length), 0, BASE_NOTES.length - 1)
    ];

  let octave = 4;
  if (y < 0.3) octave = 5;
  else if (y > 0.7) octave = 3;

  return partsToNote(rootName, octave);
}

function buildPhrase(rootNote) {
  const root = noteToParts(rootNote);
  const rootIdx = BASE_NOTES.indexOf(root.name);

  const config = MODES[mode];
  const phraseLen = 3;
  const notes = [];

  for (let i = 0; i < phraseLen; i++) {
    const degree = config.phrase[(stepIndex + i) % config.phrase.length];
    const absolute = rootIdx + degree;
    const name = BASE_NOTES[absolute % BASE_NOTES.length];
    const octaveShift = Math.floor(absolute / BASE_NOTES.length);
    const note = partsToNote(name, root.octave + octaveShift);
    if (note) notes.push(note);
  }

  stepIndex = (stepIndex + 1) % config.phrase.length;
  return notes;
}

function playSingleNote(note, y) {
  if (!started || !audioReady || !note) return;
  const player = players[note];
  if (!player) return;

  const modeGain = MODES[mode].gainDb;
  const dynamicGain = clamp(1.25 - y, 0.38, 1.0);
  player.volume.value = Tone.gainToDb(dynamicGain) + modeGain;

  player.stop();
  player.start();

  flashKey(note);
  nowPlaying.innerText = `${MODES[mode].label} | ${note}`;
}

function playPhrase(notes, y) {
  const spacing = MODES[mode].rhythmMs;
  for (let i = 0; i < notes.length; i++) {
    setTimeout(() => {
      playSingleNote(notes[i], y);
    }, i * spacing);
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    mode = btn.dataset.mode;
    stepIndex = 0;
    status.innerText = `Mode: ${MODES[mode].label}`;
  });
});

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
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});

hands.onResults((results) => {
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 240;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const lm = results?.multiHandLandmarks?.[0];
  if (!lm) {
    nowPlaying.innerText = "--";
    strikeArmed = true;
    lastY = null;
    return;
  }

  const tip = lm[8];
  const rawX = clamp(tip.x, 0, 1);
  const rawY = clamp(tip.y, 0, 1);

  smoothedX = smoothAxis(smoothedX, rawX);
  smoothedY = smoothAxis(smoothedY, rawY);

  filteredX = thresholdAxis(filteredX, smoothedX);
  filteredY = thresholdAxis(filteredY, smoothedY);

  const px = filteredX * canvas.width;
  const py = filteredY * canvas.height;

  ctx.beginPath();
  ctx.arc(px, py, 9, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(30, 240, 213, 0.85)";
  ctx.fill();

  const now = performance.now();
  let velocityY = 0;
  if (lastY !== null) {
    velocityY = filteredY - lastY;
  }
  lastY = filteredY;

  if (velocityY < REARM_UP_VELOCITY) {
    strikeArmed = true;
  }

  const strike = velocityY > STRIKE_DOWN_VELOCITY;
  const rhythmGate = now - lastPlayAt > MODES[mode].rhythmMs;

  if (strikeArmed && strike && rhythmGate) {
    const root = getRootFromGesture(filteredX, filteredY);
    if (root) {
      const phrase = buildPhrase(root);
      playPhrase(phrase, filteredY);
      lastPlayAt = now;
      strikeArmed = false;
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
