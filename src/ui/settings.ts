import {
  BACKGROUND_LABELS,
  BACKGROUND_MODES,
  EFFECT_LABELS,
  EFFECT_MODES,
  PALETTE_IDS,
  type EffectMode,
  type Settings,
} from "../types";
import { PALETTES } from "../render/palettes";
import { applyLookPreset, setMode } from "../state";

type SliderKey =
  | "particleCount"
  | "particleSize"
  | "particleLife"
  | "particleSpeed"
  | "gravity"
  | "turbulence"
  | "trailFade"
  | "attract"
  | "bloom"
  | "colorCycle"
  | "cameraMix"
  | "autoRotateSeconds";

const SLIDER_RANGE: Record<SliderKey, { min: number; max: number; step: number }> = {
  particleCount: { min: 400, max: 8000, step: 100 },
  particleSize: { min: 0.4, max: 6, step: 0.1 },
  particleLife: { min: 0.3, max: 6, step: 0.1 },
  particleSpeed: { min: 0.1, max: 3, step: 0.05 },
  gravity: { min: -2, max: 2, step: 0.05 },
  turbulence: { min: 0, max: 2, step: 0.05 },
  trailFade: { min: 0.02, max: 0.6, step: 0.01 },
  attract: { min: 0, max: 2, step: 0.05 },
  bloom: { min: 0, max: 1.5, step: 0.05 },
  colorCycle: { min: 0, max: 3, step: 0.05 },
  cameraMix: { min: 0, max: 1, step: 0.01 },
  autoRotateSeconds: { min: 3, max: 120, step: 1 },
};

interface EffectPanel {
  sliders: Array<{ key: SliderKey; label: string }>;
  skeleton: boolean;
  depthColor: boolean;
}

const PARTICLE_SLIDERS: EffectPanel["sliders"] = [
  { key: "particleCount", label: "Count" },
  { key: "particleSize", label: "Size" },
  { key: "particleLife", label: "Life" },
  { key: "particleSpeed", label: "Speed" },
  { key: "gravity", label: "Gravity" },
  { key: "turbulence", label: "Turbulence" },
  { key: "attract", label: "Attract" },
];

const EFFECT_PANEL: Record<EffectMode, EffectPanel> = {
  liquid: {
    sliders: [
      { key: "particleSpeed", label: "Flow" },
      { key: "turbulence", label: "Warp" },
      { key: "attract", label: "Filament" },
      { key: "bloom", label: "Glow" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: true,
    depthColor: false,
  },
  particles: {
    sliders: [...PARTICLE_SLIDERS, { key: "colorCycle", label: "Color cycle" }],
    skeleton: true,
    depthColor: false,
  },
  constellation: {
    sliders: [
      { key: "bloom", label: "Glow" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: false,
    depthColor: true,
  },
  neon: {
    sliders: [
      { key: "bloom", label: "Glow" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: false,
    depthColor: true,
  },
  ribbons: {
    sliders: [
      { key: "particleSize", label: "Thickness" },
      { key: "trailFade", label: "Fade" },
      { key: "bloom", label: "Glow" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: true,
    depthColor: true,
  },
  embers: {
    sliders: [
      { key: "particleCount", label: "Count" },
      { key: "particleSize", label: "Size" },
      { key: "particleLife", label: "Life" },
      { key: "particleSpeed", label: "Speed" },
      { key: "gravity", label: "Gravity" },
      { key: "turbulence", label: "Drift" },
      { key: "trailFade", label: "Fade" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: true,
    depthColor: false,
  },
  aurora: {
    sliders: [
      ...PARTICLE_SLIDERS,
      { key: "trailFade", label: "Fade" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: true,
    depthColor: false,
  },
  aura: {
    sliders: [...PARTICLE_SLIDERS, { key: "colorCycle", label: "Color cycle" }],
    skeleton: true,
    depthColor: false,
  },
  kaleido: {
    sliders: [...PARTICLE_SLIDERS, { key: "colorCycle", label: "Color cycle" }],
    skeleton: true,
    depthColor: false,
  },
  pixels: {
    sliders: [
      { key: "turbulence", label: "Wobble" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: true,
    depthColor: false,
  },
  bubbles: {
    sliders: [
      { key: "particleSize", label: "Size" },
      { key: "particleSpeed", label: "Drift" },
      { key: "gravity", label: "Gravity" },
      { key: "turbulence", label: "Wobble" },
      { key: "attract", label: "Cling" },
      { key: "bloom", label: "Shine" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: true,
    depthColor: false,
  },
  metaballs: {
    sliders: [
      { key: "particleSize", label: "Blob size" },
      { key: "colorCycle", label: "Color cycle" },
    ],
    skeleton: true,
    depthColor: true,
  },
};

export function mountSettings(root: HTMLElement, settings: Settings, handlers: {
  onChange: () => void;
  devices: () => { id: string; label: string }[];
}): { refresh: () => void } {
  const render = () => {
    const devices = handlers.devices();
    const panel = EFFECT_PANEL[settings.mode];
    root.innerHTML = `
      <section class="group">
        <h3>Looks</h3>
        <div class="preset-row">
          <button class="chip" data-look="portrait" type="button">Portrait</button>
          <button class="chip" data-look="rave" type="button">Rave</button>
          <button class="chip" data-look="installation" type="button">Installation</button>
          <button class="chip" data-look="ghostly" type="button">Bubbles</button>
        </div>
      </section>
      <section class="group">
        <h3>Camera</h3>
        <label class="row">Device
          <select data-key="deviceId">${deviceOptions(devices, settings.deviceId)}</select>
        </label>
        <label class="row">Rotation
          <select data-key="rotation">
            ${[0, 90, 180, 270].map((r) => `<option value="${r}" ${settings.rotation === r ? "selected" : ""}>${r}°</option>`).join("")}
          </select>
        </label>
        <div class="checks">
          <label><input type="checkbox" data-bool="mirror" ${settings.mirror ? "checked" : ""}/> Mirror (AR)</label>
        </div>
      </section>
      <section class="group">
        <h3>Effect</h3>
        <label class="row">Mode
          <select data-key="mode">
            ${EFFECT_MODES.map((m) => `<option value="${m}" ${settings.mode === m ? "selected" : ""}>${EFFECT_LABELS[m]}</option>`).join("")}
          </select>
        </label>
        <label class="row">Palette
          <select data-key="palette">
            ${PALETTE_IDS.map((id) => `<option value="${id}" ${settings.palette === id ? "selected" : ""}>${PALETTES[id].name}</option>`).join("")}
          </select>
        </label>
        <div class="checks">
          <label><input type="checkbox" data-bool="useCustomColors" ${settings.useCustomColors ? "checked" : ""}/> Custom colors</label>
        </div>
        ${settings.useCustomColors ? `<div class="color-row">
          <label>Primary <input type="color" data-key="customPrimary" value="${settings.customPrimary}"/></label>
          <label>Secondary <input type="color" data-key="customSecondary" value="${settings.customSecondary}"/></label>
          <label>Background <input type="color" data-key="customBackground" value="${settings.customBackground}"/></label>
        </div>` : ""}
      </section>
      <section class="group">
        <h3>${EFFECT_LABELS[settings.mode]}</h3>
        ${panel.sliders.map((s) => slider(s.label, s.key, settings[s.key], SLIDER_RANGE[s.key])).join("")}
        ${panel.skeleton || panel.depthColor ? `<div class="checks">
          ${panel.skeleton ? `<label><input type="checkbox" data-bool="showSkeleton" ${settings.showSkeleton ? "checked" : ""}/> Skeleton overlay</label>` : ""}
          ${panel.depthColor ? `<label><input type="checkbox" data-bool="depthColor" ${settings.depthColor ? "checked" : ""}/> Depth coloring</label>` : ""}
        </div>` : ""}
      </section>
      <section class="group">
        <h3>Scene</h3>
        <label class="row">Background
          <select data-key="background">
            ${BACKGROUND_MODES.map((b) => `<option value="${b}" ${settings.background === b ? "selected" : ""}>${BACKGROUND_LABELS[b]}</option>`).join("")}
          </select>
        </label>
        ${settings.background === "camera" ? slider("Camera opacity", "cameraMix", settings.cameraMix, SLIDER_RANGE.cameraMix) : ""}
        <label class="row">Model
          <select data-key="modelQuality">
            <option value="lite" ${settings.modelQuality === "lite" ? "selected" : ""}>Lite (faster)</option>
            <option value="full" ${settings.modelQuality === "full" ? "selected" : ""}>Full (sharper)</option>
          </select>
        </label>
        <label class="row">People
          <select data-key="numPoses">
            <option value="1" ${settings.numPoses === 1 ? "selected" : ""}>One</option>
            <option value="2" ${settings.numPoses === 2 ? "selected" : ""}>Two</option>
          </select>
        </label>
        <div class="checks">
          <label><input type="checkbox" data-bool="showHud" ${settings.showHud ? "checked" : ""}/> HUD</label>
          <label><input type="checkbox" data-bool="gestures" ${settings.gestures ? "checked" : ""}/> Body gestures</label>
          <label><input type="checkbox" data-bool="audioReactive" ${settings.audioReactive ? "checked" : ""}/> Audio-reactive glow</label>
          <label><input type="checkbox" data-bool="autoRotate" ${settings.autoRotate ? "checked" : ""}/> Auto-rotate effects</label>
        </div>
        ${settings.autoRotate ? slider("Seconds per effect", "autoRotateSeconds", settings.autoRotateSeconds, SLIDER_RANGE.autoRotateSeconds) : ""}
      </section>
      <section class="group">
        <h3>Shortcuts</h3>
        <ul class="shortcuts">
          <li><b>S</b> or <b>,</b> toggle this panel · <b>Esc</b> close</li>
          <li><b>1–9</b> <b>0</b> <b>-</b> <b>=</b> effects · <b>N</b> next · <b>[ ]</b> palettes</li>
          <li><b>B</b> background (solid / motion / camera)</li>
          <li><b>M</b> mirror · <b>R</b> rotate · <b>C</b> camera</li>
          <li><b>F</b> fullscreen · <b>H</b> HUD · <b>Space</b> freeze</li>
          <li><b>P</b> screenshot · <b>V</b> record · <b>L</b> copy look</li>
          <li>Hands together: burst · T-pose: next palette</li>
        </ul>
      </section>
    `;
  };

  render();

  root.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    const key = t.getAttribute("data-key") as keyof Settings | null;
    const bool = t.getAttribute("data-bool") as keyof Settings | null;
    if (bool && t instanceof HTMLInputElement) {
      (settings as unknown as Record<string, unknown>)[bool] = t.checked;
      if (bool === "useCustomColors" || bool === "autoRotate") render();
      handlers.onChange();
      return;
    }
    if (!key) return;
    if (t instanceof HTMLInputElement && t.type === "range") {
      (settings as unknown as Record<string, unknown>)[key] = Number(t.value);
      const label = root.querySelector(`[data-val="${key}"]`);
      if (label) label.textContent = fmt(Number(t.value));
    } else if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) {
      const v = t.value;
      if (key === "mode") {
        setMode(settings, v as EffectMode);
        render();
        handlers.onChange();
        return;
      }
      if (key === "rotation" || key === "numPoses") {
        (settings as unknown as Record<string, unknown>)[key] = Number(v);
      } else {
        (settings as unknown as Record<string, unknown>)[key] = v;
      }
      if (key === "background") render();
    }
    handlers.onChange();
  });

  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-look]") as HTMLElement | null;
    if (!btn) return;
    applyLookPreset(settings, btn.dataset.look ?? "");
    render();
    handlers.onChange();
  });

  return { refresh: render };
}

function slider(label: string, key: string, value: number, range: { min: number; max: number; step: number }): string {
  return `<label class="row">${label}<span data-val="${key}">${fmt(value)}</span></label>
    <input type="range" data-key="${key}" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}"/>`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function deviceOptions(devices: { id: string; label: string }[], selected: string): string {
  if (!devices.length) return `<option value="">Default camera</option>`;
  return devices.map((d, i) => {
    const label = d.label || `Camera ${i + 1}`;
    return `<option value="${d.id}" ${d.id === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
