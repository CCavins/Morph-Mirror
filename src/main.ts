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
} from "./state";
import { BACKGROUND_LABELS, EFFECT_MODES, type Settings } from "./types";
import { mountSettings } from "./ui/settings";
import { setHud, toast } from "./ui/hud";
import { GestureDetector, applyGesture } from "./gestures";
import { AudioPulse } from "./audio";
import { ClipRecorder, screenshotCanvas } from "./record";
import { PALETTES } from "./render/palettes";

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

let running = false;
let last = performance.now();
let fpsSmoothed = 60;
let idleSince = 0;
let attractCycle = 0;
let burstQueued = false;
let wakeLock: WakeLockSentinel | null = null;
let statusText = "Stand in the light";
let lastDeviceId = settings.deviceId;
let lastQuality = settings.modelQuality;
let lastPoses = settings.numPoses;
let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function paintHud(): void {
  setHud({
    mode: settings.mode,
    status: statusText,
    hidden: !settings.showHud,
    recording: recorder.recording,
  });
  document.documentElement.style.setProperty("--bg", PALETTES[settings.palette].background);
}

function setSettingsOpen(open: boolean): void {
  settingsEl.hidden = !open;
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
    ui.refresh();
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
      ui.refresh();
    }
  }
  if (!settings.audioReactive && audio.enabled) audio.stop();
}

async function requestWake(): Promise<void> {
  try {
    wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    wakeLock = null;
  }
}

function loop(now: number): void {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const instFps = dt > 0 ? 1 / dt : 60;
  fpsSmoothed = fpsSmoothed * 0.9 + instFps * 0.1;
  compositor.fps = fpsSmoothed;
  if (fpsSmoothed < 24) reduced = true;
  else if (fpsSmoothed > 40 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reduced = false;
  }

  compositor.resize();
  const drawn = camera.drawProcess(settings.mirror, settings.rotation, reduced ? 480 : 640);
  if (drawn && !settings.frozen) {
    pose.detect(camera.process, now);
  }
  const frame = settings.frozen ? pose.frame : pose.frame;

  const energy = settings.audioReactive ? audio.sample() : 0;
  const g = gestures.update(frame.poses, now, settings.gestures);
  if (g) {
    const next = applyGesture(g.name, settings.mode, settings.palette);
    settings.mode = next.mode;
    settings.palette = next.palette;
    if (next.burst) burstQueued = true;
    persist();
    ui.refresh();
    toast(g.name === "handsUp" ? "Next effect" : g.name === "tpose" ? "Next palette" : "Burst");
  }

  if (burstQueued) {
    compositor.burst();
    burstQueued = false;
  }

  if (frame.hasPerson) {
    idleSince = now;
    statusText = frame.poses.length > 1 ? "Two figures in the glass" : "Mirroring you";
  } else {
    statusText = "Step closer";
    if (now - idleSince > 3500) {
      attractCycle += dt;
      if (attractCycle > 8) {
        attractCycle = 0;
        settings.palette = nextPalette(settings.palette, 1);
      }
    }
  }

  compositor.render({
    process: camera.process,
    frame,
    settings,
    dt,
    time: now / 1000,
    audio: energy,
    reduced,
  });

  paintHud();
  requestAnimationFrame(loop);
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
    ui.refresh();
    gate.hidden = true;
    running = true;
    idleSince = performance.now();
    last = performance.now();
    await requestWake();
    if (settings.audioReactive) {
      try { await audio.start(); } catch { settings.audioReactive = false; }
    }
    paintHud();
    requestAnimationFrame(loop);
  } catch (err) {
    gateError.hidden = false;
    gateError.textContent = cameraErrorMessage(err);
    enter.disabled = false;
    enter.textContent = "Enter the Mirror";
  }
}

enter.addEventListener("click", () => { void start(); });
closeSettings.addEventListener("click", () => setSettingsOpen(false));

view.addEventListener("dblclick", () => {
  settings.showHud = !settings.showHud;
  persist();
  paintHud();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void requestWake();
});

navigator.mediaDevices?.addEventListener("devicechange", () => {
  void camera.refreshDevices().then(() => ui.refresh());
});

window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
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
    settings.mode = EFFECT_MODES[Number(k) - 1] ?? settings.mode;
    persist();
    ui.refresh();
    return;
  }
  if (k === "0") {
    settings.mode = EFFECT_MODES[9];
    persist();
    ui.refresh();
    return;
  }
  if (k === "[") {
    settings.palette = nextPalette(settings.palette, -1);
    persist();
    ui.refresh();
    return;
  }
  if (k === "]") {
    settings.palette = nextPalette(settings.palette, 1);
    persist();
    ui.refresh();
    return;
  }
  if (k === "m" || k === "M") {
    settings.mirror = !settings.mirror;
    persist();
    ui.refresh();
    toast(settings.mirror ? "Mirror on" : "Mirror off");
    return;
  }
  if (k === "b" || k === "B") {
    settings.background = nextBackground(settings.background);
    persist();
    ui.refresh();
    toast(BACKGROUND_LABELS[settings.background]);
    return;
  }
  if (k === "r" || k === "R") {
    settings.rotation = nextRotation(settings.rotation);
    persist();
    ui.refresh();
    toast(`Rotation ${settings.rotation}°`);
    return;
  }
  if (k === "c" || k === "C") {
    const id = camera.cycleDevice();
    if (id) {
      settings.deviceId = id;
      void applyRuntime();
      persist();
      ui.refresh();
    }
    return;
  }
  if (k === "f" || k === "F") {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
    else void document.exitFullscreen();
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
    const on = recorder.toggle(view);
    toast(on ? "Recording…" : "Clip saved");
    paintHud();
    return;
  }
  if (k === "l" || k === "L") {
    const url = lookUrl(settings);
    void navigator.clipboard?.writeText(url);
    toast("Look link copied");
    history.replaceState(null, "", url);
    return;
  }
  if (k === "n" || k === "N") {
    settings.mode = nextMode(settings.mode, 1);
    persist();
    ui.refresh();
  }
});

paintHud();
