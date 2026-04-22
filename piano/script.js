// =====================
// AUTO SCROLL
// =====================
window.onload = () => {
  const wrapper = document.querySelector(".keyboard-wrapper");
  wrapper.scrollLeft = wrapper.scrollWidth / 3;
};

// =====================
// ELEMENTS
// =====================
const video = document.getElementById("inputVideo");
const canvas = document.getElementById("overlayCanvas");
const ctx = canvas.getContext("2d");
const keyboard = document.getElementById("keyboard");
const noteDisplay = document.getElementById("currentNote");

// =====================
// CAMERA
// =====================
navigator.mediaDevices
  .getUserMedia({ video: { width: 320, height: 240 } })
  .then((stream) => {
    video.srcObject = stream;
  });

// =====================
// AUDIO
// =====================
let started = false;
let samplesReady = false;

const players = {};
const BASE_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const MASTER_BOOST_DB = 6;

let currentVolume = 0.85;

const sampleLoads = [];

for (let o = 2; o <= 6; o++) {
  BASE_NOTES.forEach((n) => {
    const note = n + o;
    const player = new Tone.Player({
      url: `audio/${note}.mp3`,
    }).toDestination();
    players[note] = player;
    sampleLoads.push(player.load());
  });
}

players.C7 = new Tone.Player({ url: "audio/C7.mp3" }).toDestination();
sampleLoads.push(players.C7.load());

Promise.allSettled(sampleLoads).then(() => {
  samplesReady = true;
  if (!started) {
    noteDisplay.innerText = "Tap to enable audio";
  }
});

noteDisplay.innerText = "Loading samples...";

async function ensureAudioStarted() {
  if (started) return;
  await Tone.start();
  started = true;
  if (samplesReady) {
    noteDisplay.innerText = "Ready";
  }
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
// SHARP SYSTEM
// =====================
function getBase(note) {
  const name = note.slice(0, -1);
  const octave = note.slice(-1);

  if (!name.includes("#")) return { base: note, shift: 0 };

  const map = {
    "C#": ["C", 1],
    "D#": ["D", 1],
    "F#": ["F", 1],
    "G#": ["G", 1],
    "A#": ["A", 1],
  };

  const [baseName, shift] = map[name] || [name, 0];
  return { base: baseName + octave, shift };
}

// =====================
// NOTE CONTROL
// =====================
function highlight(note, on) {
  const key = keys.find((k) => k.note === note);
  if (!key?.el) return;

  if (on) {
    key.el.classList.add("active");
    if (note.includes("#")) {
      key.el.style.background = "#ff3b6b";
      key.el.style.boxShadow = "0 0 20px rgba(255, 59, 107, 0.9)";
    } else {
      key.el.style.background = "#39e27d";
      key.el.style.boxShadow = "0 0 20px rgba(57, 226, 125, 0.9)";
    }
  } else {
    key.el.classList.remove("active");
    key.el.style.background = "";
    key.el.style.boxShadow = "";
  }
}

function noteOn(note) {
  highlight(note, true);

  if (!started || !samplesReady) return;

  const { base, shift } = getBase(note);
  const player = players[base];
  if (!player) return;

  const boostedGain = Math.min(1.45, currentVolume * 1.35);
  player.volume.value = Tone.gainToDb(boostedGain) + MASTER_BOOST_DB;
  player.playbackRate = Math.pow(2, shift / 12);

  player.stop();
  player.start();
}

function noteOff(note) {
  if (!note) return;

  const { base } = getBase(note);
  const player = players[base];
  if (player) player.stop();

  highlight(note, false);
}

function stopAllAudioAndUI() {
  Object.values(players).forEach((p) => p.stop());
  keys.forEach((k) => highlight(k.note, false));
}

// =====================
// BUILD PIANO
// =====================
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let keys = [];
let whiteKeys = [];
let blackKeys = [];

function buildPiano() {
  keyboard.innerHTML = "";
  keys = [];
  whiteKeys = [];
  blackKeys = [];

  let whiteIndex = 0;

  for (let o = 2; o <= 6; o++) {
    NOTES.forEach((n) => {
      const note = n + o;

      if (!n.includes("#")) {
        const keyObj = { note, el: null, index: whiteIndex };
        const el = document.createElement("div");
        el.className = "white";

        const label = document.createElement("span");
        label.className = "white-label";
        label.innerText = note;

        el.appendChild(label);
        keyboard.appendChild(el);

        keyObj.el = el;
        whiteKeys.push(keyObj);
        keys.push(keyObj);
        whiteIndex++;
      } else {
        const keyObj = { note, el: null };
        blackKeys.push(keyObj);
        keys.push(keyObj);
      }
    });
  }

  const c7El = document.createElement("div");
  c7El.className = "white";
  c7El.innerHTML = `<span class="white-label">C7</span>`;
  keyboard.appendChild(c7El);

  const c7Key = { note: "C7", el: c7El, index: whiteIndex };
  whiteKeys.push(c7Key);
  keys.push(c7Key);

  whiteKeys.forEach((k, i) => {
    k.pos = (i + 0.5) / whiteKeys.length;
  });

  setTimeout(positionBlackKeys, 50);
}

function positionBlackKeys() {
  const whiteWidth = 52;
  const map = { "C#": 0, "D#": 1, "F#": 3, "G#": 4, "A#": 5 };

  blackKeys.forEach((k) => {
    const name = k.note.slice(0, -1);
    const octave = parseInt(k.note.slice(-1), 10);

    const index = map[name] + (octave - 2) * 7;
    const left = (index + 1) * whiteWidth - 16;

    const el = document.createElement("div");
    el.className = "black";
    el.style.left = left + "px";

    const label = document.createElement("span");
    label.innerText = name;

    el.appendChild(label);
    keyboard.appendChild(el);

    k.pos = (index + 1) / whiteKeys.length;
    k.el = el;
  });
}

buildPiano();

// =====================
// TRACKING
// =====================
const PRESS_ON = 0.62;
const PRESS_OFF = 0.54;
const SMOOTHING_ALPHA = 0.45;
const MOVEMENT_THRESHOLD = 0.018;
const NOTE_CHANGE_DEBOUNCE_MS = 120;
const STABLE_FRAMES_REQUIRED = 3;
const BLACK_KEY_TOLERANCE = 0.04;
const LEFT_BLACK_TOLERANCE = 0.12;
const RELEASE_DELAY_MS = 50;

function makeHandState() {
  return {
    smoothedX: null,
    filteredX: null,
    activeNote: null,
    candidate: null,
    candidateFrames: 0,
    fingerPressed: false,
    lastNoteChangeTime: 0,
    releaseTimer: null,
    releasePending: false,
  };
}

const handState = {
  right: makeHandState(),
  left: makeHandState(),
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothX(state, currentX) {
  if (state.smoothedX === null) {
    state.smoothedX = currentX;
    return state.smoothedX;
  }

  state.smoothedX =
    SMOOTHING_ALPHA * currentX + (1 - SMOOTHING_ALPHA) * state.smoothedX;
  return state.smoothedX;
}

function thresholdX(state, value) {
  if (state.filteredX === null) {
    state.filteredX = value;
    return state.filteredX;
  }

  if (Math.abs(value - state.filteredX) < MOVEMENT_THRESHOLD) {
    return state.filteredX;
  }

  state.filteredX = value;
  return state.filteredX;
}

function detectClosestBlackKey(x) {
  let closest = null;
  let minDist = BLACK_KEY_TOLERANCE;

  for (let i = 0; i < blackKeys.length; i++) {
    const d = Math.abs(x - blackKeys[i].pos);
    if (d < minDist) {
      minDist = d;
      closest = blackKeys[i].note;
    }
  }

  return closest;
}

function detectClosestBlackKeyDetailed(x, tolerance = BLACK_KEY_TOLERANCE) {
  let closest = null;
  let minDist = tolerance;

  for (let i = 0; i < blackKeys.length; i++) {
    const d = Math.abs(x - blackKeys[i].pos);
    if (d < minDist) {
      minDist = d;
      closest = blackKeys[i].note;
    }
  }

  return { note: closest, dist: minDist };
}

function detectClosestWhiteKey(x) {
  let closest = null;
  let minDist = Infinity;

  for (let i = 0; i < whiteKeys.length; i++) {
    const d = Math.abs(x - whiteKeys[i].pos);
    if (d < minDist) {
      minDist = d;
      closest = whiteKeys[i].note;
    }
  }

  return { note: closest, dist: minDist };
}

function detectNoteFromX(x) {
  const white = detectClosestWhiteKey(x);
  const black = detectClosestBlackKeyDetailed(x);

  // White keys are default. Switch to black only when confidently closer.
  if (black.note && black.dist < white.dist * 0.58) {
    return black.note;
  }

  return white.note;
}

function detectWhiteOnlyFromX(x) {
  return detectClosestWhiteKey(x).note;
}

function detectBlackOnlyFromX(x) {
  return detectClosestBlackKeyDetailed(x, LEFT_BLACK_TOLERANCE).note;
}

function setDisplay() {
  const notes = [];
  if (handState.right.activeNote) notes.push(`R:${handState.right.activeNote}`);
  if (handState.left.activeNote) notes.push(`L:${handState.left.activeNote}`);

  if (!notes.length) {
    noteDisplay.innerText = started ? "--" : "Tap to enable audio";
    return;
  }

  noteDisplay.innerText = notes.join("  ");
}

function cancelRelease(state) {
  if (state.releaseTimer) {
    clearTimeout(state.releaseTimer);
    state.releaseTimer = null;
  }
  state.releasePending = false;
}

function releaseNoteSmooth(state) {
  if (!state.activeNote || state.releasePending) return;

  state.releasePending = true;
  state.releaseTimer = setTimeout(() => {
    if (state.activeNote) {
      noteOff(state.activeNote);
      state.activeNote = null;
      setDisplay();
    }
    state.releasePending = false;
    state.releaseTimer = null;
  }, RELEASE_DELAY_MS);
}

function switchNote(state, note, now) {
  if (!note || note === state.activeNote) return;

  if (state.activeNote) noteOff(state.activeNote);
  state.activeNote = note;
  noteOn(note);
  state.lastNoteChangeTime = now;
  setDisplay();
}

function processHand(state, lm, now, role) {
  if (!lm) {
    state.candidate = null;
    state.candidateFrames = 0;
    releaseNoteSmooth(state);
    return;
  }

  const rawX = clamp01(lm[8].x);
  const y = clamp01(lm[8].y);

  const sx = smoothX(state, rawX);
  const x = thresholdX(state, sx);

  currentVolume = Math.max(0.28, Math.min(1, 1 - y));

  if (state.fingerPressed) {
    state.fingerPressed = y > PRESS_OFF;
  } else {
    state.fingerPressed = y > PRESS_ON;
  }

  if (!state.fingerPressed) {
    state.candidate = null;
    state.candidateFrames = 0;
    releaseNoteSmooth(state);
    return;
  }

  cancelRelease(state);

  const detected =
    role === "left" ? detectBlackOnlyFromX(x) : detectWhiteOnlyFromX(x);
  if (!detected) return;

  if (detected !== state.candidate) {
    state.candidate = detected;
    state.candidateFrames = 1;

    if (
      STABLE_FRAMES_REQUIRED <= 1 &&
      now - state.lastNoteChangeTime >= NOTE_CHANGE_DEBOUNCE_MS
    ) {
      switchNote(state, detected, now);
    }
    return;
  }

  state.candidateFrames++;
  if (state.candidateFrames < STABLE_FRAMES_REQUIRED) return;
  if (now - state.lastNoteChangeTime < NOTE_CHANGE_DEBOUNCE_MS) return;

  switchNote(state, detected, now);
}

function resetState(state) {
  cancelRelease(state);
  if (state.activeNote) {
    noteOff(state.activeNote);
  }
  state.smoothedX = null;
  state.filteredX = null;
  state.activeNote = null;
  state.candidate = null;
  state.candidateFrames = 0;
  state.fingerPressed = false;
  state.lastNoteChangeTime = 0;
}

function stopAll() {
  stopAllAudioAndUI();
  resetState(handState.right);
  resetState(handState.left);
  setDisplay();
}

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
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.65,
});

hands.onResults((results) => {
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 240;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const landmarks = results?.multiHandLandmarks || [];
  const handedness = results?.multiHandedness || [];

  if (!landmarks.length) {
    stopAll();
    return;
  }

  const now = performance.now();
  let rightLm = null;
  let leftLm = null;

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const label = handedness?.[i]?.label?.toLowerCase();

    if (label === "right" && !rightLm) rightLm = lm;
    else if (label === "left" && !leftLm) leftLm = lm;
  }

  // Robust fallback when handedness is unstable.
  if (!rightLm && landmarks[0]) rightLm = landmarks[0];
  if (!leftLm && landmarks[1]) leftLm = landmarks[1];

  // One-hand mode: respect handedness for strict role mapping.
  if (landmarks.length === 1) {
    const onlyLm = landmarks[0];
    const onlyLabel = handedness?.[0]?.label?.toLowerCase();

    if (onlyLabel === "left") {
      processHand(handState.right, null, now, "right");
      processHand(handState.left, onlyLm, now, "left");
    } else {
      processHand(handState.right, onlyLm, now, "right");
      processHand(handState.left, null, now, "left");
    }
    setDisplay();
    return;
  }

  // Two-hand mode: right->white only, left->black only.
  processHand(handState.right, rightLm, now, "right");
  processHand(handState.left, leftLm, now, "left");
  setDisplay();
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
// =====================
// 📚 SARGAM LEARNING MODE (Optimized)
// =====================

const SARGAM = [
  { name: "Sa",  note: "C4" },
  { name: "Re",  note: "D4" },
  { name: "Ga",  note: "E4" },
  { name: "Ma",  note: "F4" },
  { name: "Pa",  note: "G4" },
  { name: "Dha", note: "A4" },
  { name: "Ni",  note: "B4" },
  { name: "Sa↑", note: "C5" },
];

let learnMode = false;
let learnIndex = 0;
let learnLocked = false;
let lastCheckedNote = null;
let lastCheckTime = 0;
const LEARN_COOLDOWN_MS = 600; // prevent rapid re-checks

const freestyleBtn = document.getElementById("freestyleBtn");
const learnBtn = document.getElementById("learnBtn");
const sargamBox = document.getElementById("sargamBox");
const sargamDisplay = document.getElementById("sargamDisplay");
const sargamHint = document.getElementById("sargamHint");
const sargamProgress = document.getElementById("sargamProgress");

// --- Mode Switching ---
freestyleBtn.addEventListener("click", () => {
  learnMode = false;
  learnLocked = false;
  lastCheckedNote = null;
  freestyleBtn.classList.add("active");
  learnBtn.classList.remove("active");
  sargamBox.style.display = "none";
  clearLearnTarget();
});

learnBtn.addEventListener("click", async () => {
  await ensureAudioStarted();
  learnMode = true;
  learnIndex = 0;
  learnLocked = false;
  lastCheckedNote = null;
  lastCheckTime = 0;
  learnBtn.classList.add("active");
  freestyleBtn.classList.remove("active");
  sargamBox.style.display = "block";
  showCurrentSargam();
});

function showCurrentSargam() {
  clearLearnTarget();
  const current = SARGAM[learnIndex];
  sargamDisplay.innerText = current.name;
  sargamHint.innerText = "Press " + current.note;
  sargamHint.style.color = "#ffdd00";
  sargamProgress.innerText = `${learnIndex} / ${SARGAM.length}`;
  blinkTargetKey(current.note);
}

function blinkTargetKey(note) {
  const key = keys.find(k => k.note === note);
  if (key?.el) {
    key.el.classList.add("learn-target");
  }
}

function clearLearnTarget() {
  document.querySelectorAll(".learn-target, .learn-correct, .learn-wrong")
    .forEach(el => {
      el.classList.remove("learn-target", "learn-correct", "learn-wrong");
    });
}

// --- Safe lock release (always runs even if error) ---
function releaseLearnLock(delay = 500) {
  setTimeout(() => {
    learnLocked = false;
    lastCheckedNote = null;
  }, delay);
}

function checkLearning(playedNote) {
  if (!learnMode) return;

  const now = performance.now();

  // 🛡️ Safety cooldown: ignore rapid repeats of same note
  if (playedNote === lastCheckedNote && now - lastCheckTime < LEARN_COOLDOWN_MS) {
    return;
  }

  if (learnLocked) return;

  lastCheckedNote = playedNote;
  lastCheckTime = now;
  learnLocked = true;

  const target = SARGAM[learnIndex];
  const key = keys.find(k => k.note === target.note);

  if (playedNote === target.note) {
    // ✅ Correct
    if (key?.el) {
      key.el.classList.remove("learn-target");
      key.el.classList.add("learn-correct");
    }
    sargamHint.innerText = "✅ Correct!";
    sargamHint.style.color = "#39e27d";

    setTimeout(() => {
      // Clear classes safely
      if (key?.el) {
        key.el.classList.remove("learn-correct");
      }

      learnIndex++;

      if (learnIndex >= SARGAM.length) {
        sargamDisplay.innerText = "🏆";
        sargamHint.innerText = "Completed!";
        sargamHint.style.color = "#00ffd0";
        sargamProgress.innerText = `${SARGAM.length} / ${SARGAM.length}`;
        
        setTimeout(() => {
          learnIndex = 0;
          learnLocked = false;
          lastCheckedNote = null;
          showCurrentSargam();
        }, 1800);
      } else {
        learnLocked = false;
        lastCheckedNote = null;
        showCurrentSargam();
      }
    }, 600);

  } else {
    // ❌ Wrong
    const wrongKey = keys.find(k => k.note === playedNote);
    if (wrongKey?.el) {
      wrongKey.el.classList.add("learn-wrong");
      setTimeout(() => {
        wrongKey.el.classList.remove("learn-wrong");
      }, 400);
    }
    sargamHint.innerText = "❌ Try " + target.note;
    sargamHint.style.color = "#ff3366";

    setTimeout(() => {
      if (learnMode) {
        sargamHint.innerText = "Press " + target.note;
        sargamHint.style.color = "#ffdd00";
      }
      learnLocked = false;
      lastCheckedNote = null;
    }, 600);
  }
}

// --- Hook into existing noteOn (safer version) ---
if (typeof noteOn === "function" && !window._learnHooked) {
  const _originalNoteOn = noteOn;
  noteOn = function (note) {
    _originalNoteOn(note);
    if (learnMode) {
      checkLearning(note);
    }
  };
  window._learnHooked = true;
}