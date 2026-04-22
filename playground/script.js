/**
 * FigureFlow – Playground Mode (Piano)
 * ─────────────────────────────────────────────────
 * FIXED: Defensive null checks on all MediaPipe landmarks.
 *        Right hand → white keys, Left hand → black keys.
 *        Optimized for Raspberry Pi 4B.
 * FIX 2: Audio unlock awaits play() promise.
 * FIX 3: Guide-mode hand detection restored (removed pinch block).
 * FIX 4: Play mode no longer auto-hits falling notes.
 * FIX 5: Camera resolution increased to 640×480 for reliable landmark detection.
 */

"use strict";

/* ══════════════════════════════════════════════
CONSTANTS & CONFIG
══════════════════════════════════════════════ */
const HIT_WINDOW = 220;
const NOTE_SPEED = 160;
const FALL_FROM = -28;

const OCTAVES = [3, 4, 5];
const WHITE_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_NOTES = ["C#", "D#", null, "F#", "G#", "A#", null];

const MP_CONF_DET = 0.72;
const MP_CONF_TRK = 0.6;
const MP_MAX_HANDS = 2;
const MP_MODEL_COMPLEXITY = 0;
const CAM_WIDTH = 800; // ← increased for better landmark detection
const CAM_HEIGHT = 400; // ← increased for better landmark detection
const DEBOUNCE_MS = 250;

const HAND_RULES = {
  Right: "white",
  Left: "black",
};

/* ══════════════════════════════════════════════
SONG LIBRARY
══════════════════════════════════════════════ */
const SONGS = {
  twinkle: {
    name: "Twinkle Twinkle Little Star",
    notes: [
      { note: "C4", time: 0 },
      { note: "C4", time: 400 },
      { note: "G4", time: 800 },
      { note: "G4", time: 1200 },
      { note: "A4", time: 1600 },
      { note: "A4", time: 2000 },
      { note: "G4", time: 2400 },
      { note: "F4", time: 3200 },
      { note: "F4", time: 3600 },
      { note: "E4", time: 4000 },
      { note: "E4", time: 4400 },
      { note: "D4", time: 4800 },
      { note: "D4", time: 5200 },
      { note: "C4", time: 5600 },
      { note: "G4", time: 6400 },
      { note: "G4", time: 6800 },
      { note: "F4", time: 7200 },
      { note: "F4", time: 7600 },
      { note: "E4", time: 8000 },
      { note: "E4", time: 8400 },
      { note: "D4", time: 8800 },
      { note: "G4", time: 9600 },
      { note: "G4", time: 10000 },
      { note: "F4", time: 10400 },
      { note: "F4", time: 10800 },
      { note: "E4", time: 11200 },
      { note: "E4", time: 11600 },
      { note: "D4", time: 12000 },
      { note: "C4", time: 12800 },
      { note: "C4", time: 13200 },
      { note: "G4", time: 13600 },
      { note: "G4", time: 14000 },
      { note: "A4", time: 14400 },
      { note: "A4", time: 14800 },
      { note: "G4", time: 15200 },
      { note: "F4", time: 16000 },
      { note: "F4", time: 16400 },
      { note: "E4", time: 16800 },
      { note: "E4", time: 17200 },
      { note: "D4", time: 17600 },
      { note: "D4", time: 18000 },
      { note: "C4", time: 18400 },
    ],
  },
  happy: {
    name: "Happy Birthday",
    notes: [
      { note: "C4", time: 0 },
      { note: "C4", time: 300 },
      { note: "D4", time: 600 },
      { note: "C4", time: 1000 },
      { note: "F4", time: 1400 },
      { note: "E4", time: 2000 },
      { note: "C4", time: 3000 },
      { note: "C4", time: 3300 },
      { note: "D4", time: 3600 },
      { note: "C4", time: 4000 },
      { note: "G4", time: 4400 },
      { note: "F4", time: 5000 },
      { note: "C4", time: 6000 },
      { note: "C4", time: 6300 },
      { note: "C5", time: 6600 },
      { note: "A4", time: 7000 },
      { note: "F4", time: 7400 },
      { note: "E4", time: 7800 },
      { note: "D4", time: 8200 },
      { note: "A4", time: 9200 },
      { note: "A4", time: 9500 },
      { note: "G4", time: 9800 },
      { note: "F4", time: 10200 },
      { note: "G4", time: 10600 },
      { note: "F4", time: 11200 },
    ],
  },
  ode: {
    name: "Ode to Joy",
    notes: [
      { note: "E4", time: 0 },
      { note: "E4", time: 400 },
      { note: "F4", time: 800 },
      { note: "G4", time: 1200 },
      { note: "G4", time: 1600 },
      { note: "F4", time: 2000 },
      { note: "E4", time: 2400 },
      { note: "D4", time: 2800 },
      { note: "C4", time: 3200 },
      { note: "C4", time: 3600 },
      { note: "D4", time: 4000 },
      { note: "E4", time: 4400 },
      { note: "E4", time: 4800 },
      { note: "D4", time: 5600 },
      { note: "D4", time: 6400 },
      { note: "E4", time: 7200 },
      { note: "E4", time: 7600 },
      { note: "F4", time: 8000 },
      { note: "G4", time: 8400 },
      { note: "G4", time: 8800 },
      { note: "F4", time: 9200 },
      { note: "E4", time: 9600 },
      { note: "D4", time: 10000 },
      { note: "C4", time: 10400 },
      { note: "C4", time: 10800 },
      { note: "D4", time: 11200 },
      { note: "E4", time: 11600 },
      { note: "D4", time: 12000 },
      { note: "C4", time: 12800 },
      { note: "C4", time: 13600 },
    ],
  },
  tumhiho: {
    name: "Tum Hi Ho (Aashiqui 2)",
    notes: [
      { note: "E4", time: 0 },
      { note: "G4", time: 400 },
      { note: "A4", time: 800 },
      { note: "G4", time: 1200 },
      { note: "F4", time: 1600 },
      { note: "E4", time: 2000 },
      { note: "D4", time: 2400 },
      { note: "C4", time: 2800 },
      { note: "D4", time: 3200 },
      { note: "E4", time: 3600 },
      { note: "G4", time: 4000 },
      { note: "G4", time: 4400 },
      { note: "F4", time: 4800 },
      { note: "E4", time: 5200 },
      { note: "D4", time: 5600 },
      { note: "C4", time: 6000 },
      { note: "D4", time: 6400 },
      { note: "E4", time: 6800 },
      { note: "D4", time: 7200 },
      { note: "C4", time: 7600 },
      { note: "G4", time: 8000 },
      { note: "A4", time: 8400 },
      { note: "G4", time: 8800 },
      { note: "F4", time: 9200 },
      { note: "E4", time: 9600 },
      { note: "D4", time: 10000 },
      { note: "E4", time: 10400 },
      { note: "C4", time: 10800 },
    ],
  },
  janamjanam: {
    name: "Janam Janam (Dilwale)",
    notes: [
      { note: "C4", time: 0 },
      { note: "D4", time: 400 },
      { note: "E4", time: 800 },
      { note: "G4", time: 1200 },
      { note: "G4", time: 1600 },
      { note: "A4", time: 2000 },
      { note: "G4", time: 2400 },
      { note: "F4", time: 2800 },
      { note: "E4", time: 3200 },
      { note: "D4", time: 3600 },
      { note: "C4", time: 4000 },
      { note: "D4", time: 4400 },
      { note: "E4", time: 4800 },
      { note: "G4", time: 5200 },
      { note: "G4", time: 5600 },
      { note: "A4", time: 6000 },
      { note: "G4", time: 6400 },
      { note: "F4", time: 6800 },
      { note: "E4", time: 7200 },
      { note: "D4", time: 7600 },
      { note: "C4", time: 8000 },
      { note: "E4", time: 8400 },
      { note: "G4", time: 8800 },
      { note: "A4", time: 9200 },
      { note: "G4", time: 9600 },
      { note: "F4", time: 10000 },
      { note: "E4", time: 10400 },
      { note: "D4", time: 10800 },
      { note: "C4", time: 11200 },
    ],
  },
  zarazara: {
    name: "Zara Zara Behekta Hai",
    notes: [
      { note: "G4", time: 0 },
      { note: "F4", time: 400 },
      { note: "E4", time: 800 },
      { note: "D4", time: 1200 },
      { note: "E4", time: 1600 },
      { note: "C4", time: 2000 },
      { note: "C4", time: 2400 },
      { note: "D4", time: 2800 },
      { note: "E4", time: 3200 },
      { note: "F4", time: 3600 },
      { note: "G4", time: 4000 },
      { note: "A4", time: 4400 },
      { note: "G4", time: 4800 },
      { note: "F4", time: 5200 },
      { note: "E4", time: 5600 },
      { note: "D4", time: 6000 },
      { note: "C4", time: 6400 },
      { note: "D4", time: 6800 },
      { note: "E4", time: 7200 },
      { note: "F4", time: 7600 },
      { note: "G4", time: 8000 },
      { note: "F4", time: 8400 },
      { note: "E4", time: 8800 },
      { note: "D4", time: 9200 },
      { note: "C4", time: 9600 },
    ],
  },
};

let currentSongKey = "twinkle";
let SONG = SONGS[currentSongKey].notes;

/* ══════════════════════════════════════════════
AUDIO MODULE – LOCAL ./audio/*.mp3
══════════════════════════════════════════════ */
const Audio = (() => {
  const cache = {};
  const SHARP_FALLBACK = {
    "C#": "D",
    "D#": "E",
    "F#": "G",
    "G#": "A",
    "A#": "B",
  };
  let unlocked = false;

  function resolveFilename(noteStr) {
    const match = noteStr.match(/^([A-G]#?)(\d)/);
    if (!match) return null;
    let [, name, oct] = match;
    if (name.includes("#")) {
      const fb = SHARP_FALLBACK[name];
      name = fb || name[0];
    }
    return `./audio/${name}${oct}.mp3`;
  }

  function getAudio(noteStr) {
    if (cache[noteStr]) return cache[noteStr];
    const path = resolveFilename(noteStr);
    if (!path) return null;
    const a = new window.Audio(path);
    a.preload = "auto";
    cache[noteStr] = a;
    return a;
  }

  function init() {
    const allNotes = new Set();
    Object.values(SONGS).forEach((s) =>
      s.notes.forEach((n) => allNotes.add(n.note)),
    );
    for (const oct of OCTAVES) {
      for (const n of WHITE_NOTES) allNotes.add(`${n}${oct}`);
      for (const n of BLACK_NOTES) if (n) allNotes.add(`${n}${oct}`);
    }
    allNotes.forEach((n) => getAudio(n));
    return Promise.resolve();
  }

  async function unlock() {
    if (unlocked) return;
    for (const a of Object.values(cache)) {
      try {
        a.volume = 0;
        await a.play();
        a.pause();
        a.currentTime = 0;
        a.volume = 1;
        unlocked = true;
        return;
      } catch (e) {}
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        if (ctx.state === "suspended") await ctx.resume();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        unlocked = true;
      }
    } catch (e) {}
  }

  function play(noteStr) {
    const a = getAudio(noteStr);
    if (!a) return;
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {}
  }

  return { init, play, unlock };
})();

/* ══════════════════════════════════════════════
PIANO MODULE
══════════════════════════════════════════════ */
const Piano = (() => {
  const keyMap = {};
  let allWhites = [];
  let containerLeft = 0;
  let keyWidth = 0;

  function build(container) {
    container.innerHTML = "";
    allWhites = [];
    for (const oct of OCTAVES)
      for (const n of WHITE_NOTES) allWhites.push(`${n}${oct}`);

    const parentW = container.offsetWidth || window.innerWidth - 220;
    const totalW = allWhites.length;
    const ww = Math.floor(parentW / totalW);
    const bw = Math.round(ww * 0.62);

    keyWidth = ww;
    containerLeft = container.getBoundingClientRect().left;

    let wx = 0;
    allWhites.forEach((noteStr) => {
      const el = document.createElement("div");
      el.className = "key white";
      el.style.left = `${wx}px`;
      el.style.width = `${ww - 2}px`;
      el.dataset.note = noteStr;
      container.appendChild(el);
      keyMap[noteStr] = { el, isBlack: false, cx: wx + ww / 2, w: ww - 2 };
      wx += ww;
    });

    wx = 0;
    for (const oct of OCTAVES) {
      for (let wi = 0; wi < WHITE_NOTES.length; wi++) {
        const bNote = BLACK_NOTES[wi];
        if (bNote) {
          const noteStr = `${bNote}${oct}`;
          const bx = wx + ww - Math.round(bw / 2);
          const el = document.createElement("div");
          el.className = "key black";
          el.style.left = `${bx}px`;
          el.style.width = `${bw}px`;
          el.dataset.note = noteStr;
          container.appendChild(el);
          keyMap[noteStr] = { el, isBlack: true, cx: bx + bw / 2, w: bw };
        }
        wx += ww;
      }
    }
    containerLeft = container.getBoundingClientRect().left;
  }

  function getKey(noteStr) {
    return keyMap[noteStr];
  }

  function flash(noteStr, cls, ms = 300) {
    const k = keyMap[noteStr];
    if (!k) return;
    k.el.classList.add(cls);
    setTimeout(() => k.el.classList.remove(cls), ms);
  }

  function activate(noteStr) {
    const k = keyMap[noteStr];
    if (k) k.el.classList.add("active");
  }
  function deactivate(noteStr) {
    const k = keyMap[noteStr];
    if (k) k.el.classList.remove("active");
  }

  function showGuide(noteStr) {
    document
      .querySelectorAll(".key.guide-key")
      .forEach((e) => e.classList.remove("guide-key"));
    if (!noteStr) return;
    const k = keyMap[noteStr];
    if (k) k.el.classList.add("guide-key");
  }

  function refreshContainerLeft() {
    const wrap = document.getElementById("pianoWrap");
    if (wrap) containerLeft = wrap.getBoundingClientRect().left;
  }

  return {
    build,
    getKey,
    flash,
    activate,
    deactivate,
    showGuide,
    refreshContainerLeft,
    get containerLeft() {
      return containerLeft;
    },
    get keyWidth() {
      return keyWidth;
    },
  };
})();

/* ══════════════════════════════════════════════
NOTES MODULE – Falling notes canvas
══════════════════════════════════════════════ */
const Notes = (() => {
  let canvas = null,
    ctx = null,
    active = [],
    lastTime = null,
    rafId = null,
    running = false,
    onHitZone = null;
  const COL_WHITE = "#00e5ff",
    COL_BLACK = "#ff4081",
    NOTE_H = 22;

  function init() {
    canvas = document.getElementById("notesCanvas");
    ctx = canvas.getContext("2d");
  }

  function resize() {
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function spawn(noteStr, songTimeMs) {
    if (!canvas) return;
    Piano.refreshContainerLeft();
    const k = Piano.getKey(noteStr);
    if (!k) return;

    const pianoWrap = document.getElementById("pianoWrap");
    const pianoRect = pianoWrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const offsetX = pianoRect.left - canvasRect.left;
    const noteX = offsetX + k.cx - k.w / 2;

    active.push({
      note: noteStr,
      x: noteX,
      w: k.w,
      y: FALL_FROM,
      isBlack: k.isBlack,
      songTime: songTimeMs,
      hit: false,
      passed: false,
    });
  }

  function draw(timestamp) {
    if (!running) return;
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    const H = canvas.height,
      W = canvas.width;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    active = active.filter((n) => !n.passed);

    for (const n of active) {
      n.y += NOTE_SPEED * dt;
      if (!n.hit && n.y + NOTE_H >= H - 10 && n.y <= H + NOTE_H) {
        if (onHitZone) onHitZone(n.note, n.songTime);
        n.hit = true;
      }
      if (n.y > H + NOTE_H + 10) {
        n.passed = true;
        continue;
      }

      const col = n.isBlack ? COL_BLACK : COL_WHITE;
      const r = 5;
      const grd = ctx.createLinearGradient(n.x, n.y, n.x, n.y + NOTE_H);
      grd.addColorStop(0, hexAlpha(col, 0.92));
      grd.addColorStop(1, hexAlpha(col, 0.5));

      ctx.beginPath();
      ctx.moveTo(n.x + r, n.y);
      ctx.lineTo(n.x + n.w - r, n.y);
      ctx.quadraticCurveTo(n.x + n.w, n.y, n.x + n.w, n.y + r);
      ctx.lineTo(n.x + n.w, n.y + NOTE_H - r);
      ctx.quadraticCurveTo(
        n.x + n.w,
        n.y + NOTE_H,
        n.x + n.w - r,
        n.y + NOTE_H,
      );
      ctx.lineTo(n.x + r, n.y + NOTE_H);
      ctx.quadraticCurveTo(n.x, n.y + NOTE_H, n.x, n.y + NOTE_H - r);
      ctx.lineTo(n.x, n.y + r);
      ctx.quadraticCurveTo(n.x, n.y, n.x + r, n.y);
      ctx.closePath();
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.shadowBlur = 12;
      ctx.shadowColor = col;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    rafId = requestAnimationFrame(draw);
  }

  function hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function start() {
    if (!canvas) init();
    resize();
    active = [];
    running = true;
    lastTime = null;
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    active = [];
  }

  function setHitZoneCallback(fn) {
    onHitZone = fn;
  }
  function markHit(noteStr, songTime) {
    const idx = active.findIndex(
      (n) => n.note === noteStr && Math.abs(n.songTime - songTime) < 60,
    );
    if (idx !== -1) active[idx].passed = true;
  }
  function getTravelTimeMs() {
    if (!canvas) return 1500;
    return (canvas.height / NOTE_SPEED) * 1000;
  }

  window.addEventListener("resize", () => {
    if (running) resize();
  });
  return {
    init,
    start,
    stop,
    spawn,
    markHit,
    getTravelTimeMs,
    setHitZoneCallback,
  };
})();

/* ══════════════════════════════════════════════
GESTURE MODULE – MediaPipe Hands (NULL-SAFE)
══════════════════════════════════════════════ */
const Gesture = (() => {
  let video = null,
    canvas = null,
    ctx = null,
    handInfo = null;
  let onNote = null,
    handsInst = null,
    camInst = null;
  let lastDetected = {};
  let gestureEnabled = true;

  function hasLandmarks(lm, ...indices) {
    if (!lm || !Array.isArray(lm)) return false;
    for (const i of indices) if (!lm[i]) return false;
    return true;
  }

  function isIndexPointing(lm) {
    if (!hasLandmarks(lm, 8, 6, 12, 10)) return false;
    const indexExtended = lm[8].y < lm[6].y;
    const middleCurled = lm[12].y > lm[10].y;
    return indexExtended && middleCurled;
  }

  function getActiveKey(xNorm, handLabel) {
    const xMirrored = 1 - xNorm;

    const video = document.getElementById("camVideo");
    const pianoWrap = document.getElementById("pianoWrap");
    if (!video || !pianoWrap) return null;

    const videoRect = video.getBoundingClientRect();
    const pianoRect = pianoWrap.getBoundingClientRect();

    const xScreen = videoRect.left + xMirrored * videoRect.width;

    if (xScreen < pianoRect.left || xScreen > pianoRect.right) return null;

    const y = pianoRect.top + pianoRect.height * 0.4;
    const els = document.elementsFromPoint(xScreen, y);

    const allowed = HAND_RULES[handLabel] || "white";
    for (const el of els) {
      if (el.classList && el.classList.contains("key")) {
        const isBlack = el.classList.contains("black");
        if (
          (allowed === "white" && !isBlack) ||
          (allowed === "black" && isBlack)
        ) {
          return el.dataset.note || null;
        }
      }
    }
    return null;
  }

  function drawOverlay(landmarks, color) {
    if (!landmarks || !ctx || !canvas) return;
    if (!hasLandmarks(landmarks, 8, 0)) return;

    const lm = landmarks;
    const tipX = lm[8].x * canvas.width;
    const tipY = lm[8].y * canvas.height;

    ctx.beginPath();
    ctx.arc(tipX, tipY, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(lm[0].x * canvas.width, lm[0].y * canvas.height);
    ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = color + "88";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function init() {
    video = document.getElementById("camVideo");
    canvas = document.getElementById("camCanvas");
    ctx = canvas ? canvas.getContext("2d") : null;
    handInfo = document.getElementById("handInfo");

    if (!window.Hands) {
      console.warn("MediaPipe Hands not loaded – gesture disabled");
      if (handInfo) handInfo.textContent = "Gesture unavailable (no MediaPipe)";
      return;
    }

    handsInst = new Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });
    handsInst.setOptions({
      maxNumHands: MP_MAX_HANDS,
      modelComplexity: MP_MODEL_COMPLEXITY,
      minDetectionConfidence: MP_CONF_DET,
      minTrackingConfidence: MP_CONF_TRK,
    });

    handsInst.onResults((results) => {
      if (!canvas || !ctx) return;
      canvas.width = video.videoWidth || CAM_WIDTH;
      canvas.height = video.videoHeight || CAM_HEIGHT;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (
        !results ||
        !results.multiHandLandmarks ||
        results.multiHandLandmarks.length === 0
      ) {
        if (handInfo) handInfo.textContent = "No hands detected";
        lastDetected = {};
        return;
      }

      const labels = [];
      results.multiHandLandmarks.forEach((lm, i) => {
        if (
          !lm ||
          !hasLandmarks(lm, 8) ||
          !results.multiHandedness ||
          !results.multiHandedness[i]
        )
          return;

        const handLabelRaw = results.multiHandedness[i].label;
        const isRight = handLabelRaw === "Left"; // mirrored video
        const handKey = isRight ? "Right" : "Left";
        const color = isRight ? "#00e5ff" : "#ff4081";

        drawOverlay(lm, color);
        labels.push(handKey);

        if (!gestureEnabled) return;

        if (!isIndexPointing(lm)) {
          delete lastDetected[handKey];
          return;
        }

        const note = getActiveKey(lm[8].x, handKey);
        const now = performance.now();
        const last = lastDetected[handKey] || { note: null, ts: 0 };

        if (note && (last.note !== note || now - last.ts >= DEBOUNCE_MS)) {
          lastDetected[handKey] = { note, ts: now };
          if (onNote) onNote(note, handKey);
        }
        if (!note) delete lastDetected[handKey];
      });

      if (handInfo)
        handInfo.textContent = labels.length
          ? labels.join(" + ") + " detected"
          : "Hands found, calibrating…";
    });

    if (!window.Camera) {
      console.warn("MediaPipe Camera not found");
      return;
    }
    camInst = new Camera(video, {
      onFrame: async () => {
        if (handsInst) await handsInst.send({ image: video });
      },
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
    });
    camInst.start();
  }

  function setNoteCallback(fn) {
    onNote = fn;
  }
  function enable() {
    gestureEnabled = true;
    lastDetected = {};
  }
  function disable() {
    gestureEnabled = false;
    lastDetected = {};
  }

  return { init, setNoteCallback, enable, disable };
})();

/* ══════════════════════════════════════════════
GAME MODULE
══════════════════════════════════════════════ */
const Game = (() => {
  let score = 0,
    mode = null,
    songStart = null,
    songTimers = [],
    pendingNotes = [],
    guideIndex = 0;
  const POINTS_HIT = 10;

  function reset() {
    score = 0;
    songStart = null;
    pendingNotes = [];
    guideIndex = 0;
    songTimers.forEach((t) => clearTimeout(t));
    songTimers = [];
    Piano.showGuide(null);
    UI.setScore(0);
  }

  function start(modeStr) {
    reset();
    mode = modeStr;
    songStart = performance.now();
    const travelMs = Notes.getTravelTimeMs();

    SONG.forEach(({ note, time }) => {
      const spawnDelay = Math.max(0, time - travelMs);
      songTimers.push(setTimeout(() => Notes.spawn(note, time), spawnDelay));

      if (modeStr === "demo") {
        songTimers.push(
          setTimeout(() => {
            Audio.play(note);
            Piano.flash(note, "active", 300);
          }, time),
        );
      }
      if (modeStr === "play") {
        const tOpen = Math.max(0, time - HIT_WINDOW);
        songTimers.push(
          setTimeout(() => {
            pendingNotes.push({
              note,
              time,
              expires: performance.now() + HIT_WINDOW * 2,
            });
          }, tOpen),
        );
      }
    });

    const songEnd = SONG[SONG.length - 1].time + 2000;
    songTimers.push(
      setTimeout(() => {
        if (modeStr === "demo") _startGuide();
        else _finish();
      }, songEnd),
    );
  }

  function _startGuide() {
    mode = "guide";
    guideIndex = 0;
    Gesture.enable();
    Piano.showGuide(SONG[0].note);
    UI.setMode("guide");
    UI.setStatus("🎯 Guide mode – play the highlighted key!");
  }

  function _finish() {
    mode = null;
    Notes.stop();
    Piano.showGuide(null);
    UI.setMode(null);
    UI.setStatus(`Song finished! 🎉 Score: <strong>${score}</strong>`);
  }

  function stopGame() {
    mode = null;
    Notes.stop();
    Piano.showGuide(null);
    songTimers.forEach((t) => clearTimeout(t));
    songTimers = [];
    pendingNotes = [];
    Gesture.enable();
    UI.setMode(null);
  }

  function handleGestureNote(noteStr, handKey) {
    if (mode === "demo") return;

    const allowed = HAND_RULES[handKey] || "white";
    const isBlack = Piano.getKey(noteStr)?.isBlack;
    if ((allowed === "white" && isBlack) || (allowed === "black" && !isBlack)) {
      Audio.play(noteStr);
      Piano.flash(noteStr, "hit-wrong", 300);
      UI.flash("red");
      UI.setStatus(
        `⚠️ Wrong hand! Use ${allowed === "white" ? "right" : "left"} hand for ${allowed} keys.`,
      );
      return;
    }

    if (mode === "guide") {
      const expected = SONG[guideIndex]?.note;
      if (noteStr === expected) {
        Audio.play(noteStr);
        Piano.flash(noteStr, "hit-correct", 400);
        UI.flash("green");
        score += POINTS_HIT;
        UI.setScore(score, true);
        guideIndex++;
        if (guideIndex >= SONG.length) {
          Piano.showGuide(null);
          UI.setStatus(`🎉 Perfect! Score: <strong>${score}</strong>`);
          mode = null;
          UI.setMode(null);
        } else {
          Piano.showGuide(SONG[guideIndex].note);
        }
      } else {
        Audio.play(noteStr);
        Piano.flash(noteStr, "hit-wrong", 400);
        UI.flash("red");
        UI.setStatus(
          `❌ Wrong key! Try: <strong>${SONG[guideIndex].note}</strong>`,
        );
      }
      return;
    }

    if (mode === "play") {
      const now = performance.now();
      const elapsed = now - songStart;
      pendingNotes = pendingNotes.filter((n) => n.expires > now);
      const idx = pendingNotes.findIndex(
        (n) => n.note === noteStr && Math.abs(n.time - elapsed) <= HIT_WINDOW,
      );
      if (idx !== -1) {
        const n = pendingNotes.splice(idx, 1)[0];
        score += POINTS_HIT;
        UI.setScore(score, true);
        Audio.play(noteStr);
        Piano.flash(noteStr, "hit-correct", 400);
        UI.flash("green");
        Notes.markHit(noteStr, n.time);
      } else {
        Audio.play(noteStr);
        Piano.flash(noteStr, "hit-wrong", 300);
        UI.flash("red");
      }
      return;
    }

    // Free play
    Audio.play(noteStr);
    Piano.flash(noteStr, "active", 250);
  }

  function getMode() {
    return mode;
  }
  return { start, stopGame, handleGestureNote, getMode };
})();

/* ══════════════════════════════════════════════
UI MODULE
══════════════════════════════════════════════ */
const UI = (() => {
  let scoreEl = null,
    statusTx = null,
    flashEl = null;
  let demoBtn = null,
    playBtn = null,
    stopBtn = null;
  let pianoBtn = null,
    drumBtn = null;
  let flashTimeout = null;

  function init() {
    scoreEl = document.getElementById("scoreDisplay");
    statusTx = document.getElementById("statusText");
    flashEl = document.getElementById("feedbackFlash");
    demoBtn = document.getElementById("demoBtn");
    playBtn = document.getElementById("playBtn");
    stopBtn = document.getElementById("stopBtn");
    pianoBtn = document.getElementById("pianoBtn");
    drumBtn = document.getElementById("drumBtn");

    if (pianoBtn)
      pianoBtn.addEventListener("click", () => {
        window.location.href = "./index.html";
      });
    if (drumBtn)
      drumBtn.addEventListener("click", () => {
        window.location.href = "../drum/index.html";
      });
  }

  function setScore(val, bump = false) {
    if (!scoreEl) return;
    scoreEl.textContent = val;
    if (bump) {
      scoreEl.classList.remove("bump");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("bump");
      setTimeout(() => scoreEl.classList.remove("bump"), 200);
    }
  }

  function setStatus(msg) {
    if (statusTx) statusTx.innerHTML = msg;
  }

  function setMode(mode) {
    if (!demoBtn) return;
    const active = !!mode;
    demoBtn.disabled = active;
    playBtn.disabled = active;
    stopBtn.disabled = !active;

    if (mode === "demo") setStatus("⏵ Demo playing… watch the falling notes");
    else if (mode === "play")
      setStatus("🎮 Your turn! Use hand gestures to hit the notes");
    else if (mode === "guide")
      setStatus("🎯 Guide mode – play the highlighted key!");
    else
      setStatus(
        `Press <strong>Demo</strong> to watch · Press <strong>Play</strong> to perform`,
      );
  }

  function flash(type) {
    if (!flashEl) return;
    if (flashTimeout) clearTimeout(flashTimeout);
    flashEl.className = `feedback-flash flash-${type}`;
    flashTimeout = setTimeout(() => {
      flashEl.className = "feedback-flash";
    }, 420);
  }

  return { init, setScore, setStatus, setMode, flash };
})();

/* ══════════════════════════════════════════════
SONG LIST UI
══════════════════════════════════════════════ */
function buildSongList() {
  const container = document.getElementById("songList");
  if (!container) return;
  container.innerHTML = "";
  Object.entries(SONGS).forEach(([key, song]) => {
    const btn = document.createElement("button");
    btn.textContent = song.name;
    btn.className = "song-btn" + (key === currentSongKey ? " active-song" : "");
    btn.dataset.key = key;
    btn.addEventListener("click", () => {
      if (Game.getMode()) return;
      currentSongKey = key;
      SONG = SONGS[key].notes;
      document
        .querySelectorAll(".song-btn")
        .forEach((b) => b.classList.remove("active-song"));
      btn.classList.add("active-song");
      UI.setStatus(
        `Selected: <strong>${song.name}</strong> – press Demo or Play`,
      );
    });
    container.appendChild(btn);
  });
}

/* ══════════════════════════════════════════════
MAIN
══════════════════════════════════════════════ */
(async function main() {
  UI.init();

  const pianoWrap = document.getElementById("pianoWrap");
  Piano.build(pianoWrap);
  buildSongList();
  Notes.init();

  UI.setStatus("🎹 Loading piano audio…");
  await Audio.init();
  UI.setStatus(
    `Press <strong>Demo</strong> to watch · Press <strong>Play</strong> to perform`,
  );

  Gesture.init();
  Gesture.setNoteCallback((noteStr, handKey) => {
    Game.handleGestureNote(noteStr, handKey);
  });

  document.getElementById("demoBtn").addEventListener("click", async () => {
    await Audio.unlock();
    Gesture.disable();
    SONG = SONGS[currentSongKey].notes;
    Notes.start();
    Game.start("demo");
    UI.setMode("demo");
  });

  document.getElementById("playBtn").addEventListener("click", async () => {
    await Audio.unlock();
    Gesture.enable();
    SONG = SONGS[currentSongKey].notes;
    Notes.start();
    Game.start("play");
    UI.setMode("play");
  });

  document.getElementById("stopBtn").addEventListener("click", () => {
    Game.stopGame();
    Gesture.enable();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => Piano.build(pianoWrap), 150);
  });
})();
