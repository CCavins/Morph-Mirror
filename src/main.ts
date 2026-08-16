import "./style.css";
import { Camera, cameraErrorMessage } from "./camera";
import { PoseTracker } from "./pose";
import { Compositor } from "./render/compositor";
import {
  lookUrl,
  loadSettings,
  nextBackground,
  nextMode,
  nextPalette,
  nextRotation,
  saveSettings,
  setMode,
} from "./state";
import { BACKGROUND_LABELS, EFFECT_MODES, type EffectMode, type Settings } from "./types";
import { mountSettings } from "./ui/settings";
import { setHud, toast } from "./ui/hud";
import { GestureDetector } from "./gestures";
import { AudioPulse } from "./audio";
import { ClipRecorder, screenshotCanvas } from "./record";

const settings: Settings = loadSettings();
const camera = new Camera();
const pose = new PoseTracker();
const view = document.getElementById("view") as HTMLCanvasElement;
const compositor = new Compositor(view);
const gestures = new GestureDetector();
const audio = new AudioPulse();
const recorder = new ClipRecorder();

const gate = document.getElementById("gate") as HTMLElement;
const enter = document.getElementById("enter") as HTMLButtonElement;
const gateError = document.getElementById("gate-error") as HTMLElement;
const settingsEl = document.getElementById("settings") as HTMLElement;
const settingsBody = document.getElementById("settings-body") as HTMLElement;
const closeSettings = document.getElementById("close-settings") as HTMLButtonElement;
const openSettings = document.getElementById("open-settings") as HTMLButtonElement;
const settingsScrim = document.getElementById("settings-scrim") as HTMLElement;

let running = false;
let last = performance.now();
let fpsSmoothed = 60;
let burstQueued = false;
let wakeLock: WakeLockSentinel | null = null;
let statusText = "Stand in the light";
let lastDeviceId = settings.deviceId;
let lastQuality = settings.modelQuality;
let lastPoses = settings.numPoses;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduced = reduceMotion.matches;
reduceMotion.addEventListener("change", () => {
  if (reduceMotion.matches) reduced = true;
});
let lowSince = 0;
let highSince = 0;
let lastHudKey = "";
let lastBgHex = "#070A18";
let rotateAt = performance.now();

const ui = mountSettings(settingsBody, settings, {
  onChange: () => {
    persist();
    void applyRuntime();
    paintHud();
  },
  devices: () => camera.devices.map((d, i) => ({
    id: d.deviceId,
    label: d.label || `Camera ${i + 1}`,
  })),
});

function persist(): void {
  saveSettings(settings);
}

function changeMode(mode: EffectMode): void {
  if (!setMode(settings, mode)) return;
  rotateAt = performance.now();
  persist();
  refreshUi();
  paintHud();
}

function paintHud(): void {
  setHud({
    mode: settings.mode,
    status: statusText,
    hidden: !settings.showHud,
    recording: recorder.recording,
  });
  document.documentElement.style.setProperty("--bg", lastBgHex);
}

const MASK_MODES = new Set([
  "liquid",
  "pixels",
  "particles",
  "aurora",
  "aura",
  "kaleido",
  "bubbles",
]);

function setSettingsOpen(open: boolean): void {
  settingsEl.hidden = !open;
  settingsScrim.hidden = !open;
  if (running) openSettings.hidden = open;
  if (open) ui.refresh();
}

function refreshUi(): void {
  if (!settingsEl.hidden) ui.refresh();
}

function toggleSettings(): void {
  setSettingsOpen(settingsEl.hidden);
}

async function applyRuntime(): Promise<void> {
  if (!running) return;
  if (settings.deviceId && settings.deviceId !== lastDeviceId) {
    lastDeviceId = settings.deviceId;
    try {
      await camera.start(settings.deviceId);
    } catch (err) {
      toast(cameraErrorMessage(err));
    }
    refreshUi();
  }
  if (settings.modelQuality !== lastQuality || settings.numPoses !== lastPoses) {
    lastQuality = settings.modelQuality;
    lastPoses = settings.numPoses;
    statusText = "Loading model…";
    paintHud();
    await pose.configure(settings.modelQuality, settings.numPoses);
    statusText = "Stand in the light";
    paintHud();
  }
  if (settings.audioReactive && !audio.enabled) {
    try {
      await audio.start();
    } catch {
      settings.audioReactive = false;
      toast("Microphone permission was blocked.");
      refreshUi();
    }
  }
  if (!settings.audioReactive && audio.enabled) audio.stop();
}

async function requestWake(): Promise<void> {
  try {
    await wakeLock?.release();
  } catch {
    /* already released */
  }
  wakeLock = null;
  try {
    wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    wakeLock = null;
  }
}

function loop(now: number): void {
  if (!running) return;
  requestAnimationFrame(loop);
  if (document.hidden) {
    last = now;
    rotateAt = now;
    return;
  }

  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const instFps = dt > 0 ? 1 / dt : 60;
  fpsSmoothed = fpsSmoothed * 0.9 + instFps * 0.1;
  compositor.fps = fpsSmoothed;
  if (fpsSmoothed < 26) {
    if (!lowSince) lowSince = now;
    highSince = 0;
    if (now - lowSince > 1400) reduced = true;
  } else if (fpsSmoothed > 40) {
    if (!highSince) highSince = now;
    lowSince = 0;
    if (now - highSince > 2800) reduced = reduceMotion.matches;
  }

  compositor.resize(reduced);
  const drawn = camera.drawProcess(settings.mirror, settings.rotation, reduced ? 480 : 640);
  if (drawn && !settings.frozen) {
    pose.detect(
      camera.process,
      now,
      reduced ? 50 : 33,
      MASK_MODES.has(settings.mode),
      MASK_MODES.has(settings.mode) && !reduced,
    );
  }
  const frame = pose.frame;

  const energy = settings.audioReactive ? audio.sample() : 0;
  const gesturesActive = settings.gestures && !settings.frozen && settingsEl.hidden;
  const g = gestures.update(frame.poses, now, gesturesActive);
  if (g) {
    if (g.name === "tpose") {
      settings.palette = nextPalette(settings.palette, 1);
      persist();
      refreshUi();
    } else {
      burstQueued = true;
    }
    toast(g.name === "tpose" ? "Next palette" : "Burst");
  }

  if (burstQueued) {
    compositor.burst();
    burstQueued = false;
  }

  if (frame.hasPerson) {
    statusText = frame.poses.length > 1 ? "Two figures in the glass" : "Mirroring you";
  } else {
    statusText = "Step closer";
  }

  if (settings.autoRotate && !settings.frozen && settingsEl.hidden) {
    const wait = Math.max(3, settings.autoRotateSeconds) * 1000;
    if (now - rotateAt >= wait) changeMode(nextMode(settings.mode, 1));
  } else if (!settings.autoRotate || !settingsEl.hidden || settings.frozen) {
    rotateAt = now;
  }

  const colors = compositor.render({
    process: camera.process,
    frame,
    settings,
    dt,
    time: now / 1000,
    audio: energy,
    reduced,
  });
  if (colors.backgroundHex !== lastBgHex) {
    lastBgHex = colors.backgroundHex;
    document.documentElement.style.setProperty("--bg", lastBgHex);
  }

  const hudKey = `${settings.mode}|${statusText}|${settings.showHud}|${recorder.recording}`;
  if (hudKey !== lastHudKey) {
    lastHudKey = hudKey;
    paintHud();
  }
}

async function start(): Promise<void> {
  enter.disabled = true;
  enter.textContent = "Opening camera…";
  gateError.hidden = true;
  try {
    await camera.start(settings.deviceId || undefined);
    settings.deviceId = camera.deviceId;
    lastDeviceId = settings.deviceId;
    persist();
    enter.textContent = "Loading body tracker…";
    await pose.init(settings.modelQuality, settings.numPoses);
    lastQuality = settings.modelQuality;
    lastPoses = settings.numPoses;
    refreshUi();
    gate.hidden = true;
    running = true;
    openSettings.hidden = false;
    last = performance.now();
    await requestWake();
    if (settings.audioReactive) {
      try { await audio.start(); } catch { settings.audioReactive = false; }
    }
    paintHud();
    requestAnimationFrame(loop);
  } catch (err) {
    camera.stop();
    audio.stop();
    gateError.hidden = false;
    const msg = err instanceof Error ? err.message : "";
    gateError.textContent = /mediapipe|body tracker|wasm/i.test(msg)
      ? "Could not load the body tracker. Check your connection and try again."
      : cameraErrorMessage(err);
    enter.disabled = false;
    enter.textContent = "Enter the Mirror";
  }
}

enter.addEventListener("click", () => { void start(); });
closeSettings.addEventListener("click", () => setSettingsOpen(false));
openSettings.addEventListener("click", () => setSettingsOpen(true));
settingsScrim.addEventListener("click", () => setSettingsOpen(false));

view.addEventListener("dblclick", () => {
  settings.showHud = !settings.showHud;
  persist();
  paintHud();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    camera.pausePlayback();
    return;
  }
  void camera.resumePlayback();
  void requestWake();
});

window.addEventListener("pagehide", (e) => {
  if (e.persisted) return;
  camera.stop();
  audio.stop();
  if (recorder.recording) recorder.stop();
});

navigator.mediaDevices?.addEventListener("devicechange", () => {
  void camera.refreshDevices().then(() => refreshUi());
});

window.addEventListener("keydown", (e) => {
  if (!running) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  const target = e.target;
  if (
    k !== "Escape" &&
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")
  ) {
    return;
  }
  if (k === "s" || k === "S" || k === ",") {
    e.preventDefault();
    toggleSettings();
    return;
  }
  if (k === "Escape") {
    setSettingsOpen(false);
    return;
  }
  if (k >= "1" && k <= "9") {
    const mode = EFFECT_MODES[Number(k) - 1];
    if (mode) changeMode(mode);
    return;
  }
  if (k === "0") {
    changeMode(EFFECT_MODES[9]);
    return;
  }
  if (k === "-") {
    changeMode(EFFECT_MODES[10]);
    return;
  }
  if (k === "=") {
    changeMode(EFFECT_MODES[11]);
    return;
  }
  if (k === "[") {
    settings.palette = nextPalette(settings.palette, -1);
    persist();
    refreshUi();
    return;
  }
  if (k === "]") {
    settings.palette = nextPalette(settings.palette, 1);
    persist();
    refreshUi();
    return;
  }
  if (k === "m" || k === "M") {
    settings.mirror = !settings.mirror;
    persist();
    refreshUi();
    toast(settings.mirror ? "Mirror on" : "Mirror off");
    return;
  }
  if (k === "b" || k === "B") {
    settings.background = nextBackground(settings.background);
    persist();
    refreshUi();
    toast(BACKGROUND_LABELS[settings.background]);
    return;
  }
  if (k === "r" || k === "R") {
    settings.rotation = nextRotation(settings.rotation);
    persist();
    refreshUi();
    toast(`Rotation ${settings.rotation}°`);
    return;
  }
  if (k === "c" || k === "C") {
    const id = camera.cycleDevice();
    if (id) {
      settings.deviceId = id;
      void applyRuntime();
      persist();
      refreshUi();
    }
    return;
  }
  if (k === "f" || k === "F") {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {
        toast("Fullscreen was blocked");
      });
    } else {
      void document.exitFullscreen();
    }
    return;
  }
  if (k === "h" || k === "H") {
    settings.showHud = !settings.showHud;
    persist();
    paintHud();
    return;
  }
  if (k === " ") {
    e.preventDefault();
    settings.frozen = !settings.frozen;
    toast(settings.frozen ? "Frozen" : "Live");
    return;
  }
  if (k === "p" || k === "P") {
    screenshotCanvas(view);
    toast("Screenshot saved");
    return;
  }
  if (k === "v" || k === "V") {
    if (recorder.recording) {
      recorder.stop();
      toast("Clip saved");
    } else if (recorder.start(view)) {
      toast("Recording…");
    } else {
      toast("Recording is not supported here");
    }
    paintHud();
    return;
  }
  if (k === "l" || k === "L") {
    const url = lookUrl(settings);
    history.replaceState(null, "", url);
    void navigator.clipboard?.writeText(url).then(
      () => toast("Look link copied"),
      () => toast("Look link is in the address bar"),
    );
    return;
  }
  if (k === "n" || k === "N") {
    changeMode(nextMode(settings.mode, 1));
  }
});

paintHud();
