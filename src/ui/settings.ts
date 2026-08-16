import {
  BACKGROUND_MODES,
  EFFECT_LABELS,
  EFFECT_MODES,
  PALETTE_IDS,
  type Settings,
} from "../types";
import { PALETTES } from "../render/palettes";
import { applyLookPreset } from "../state";

export function mountSettings(root: HTMLElement, settings: Settings, handlers: {
  onChange: () => void;
  devices: () => { id: string; label: string }[];
}): { refresh: () => void } {
  const render = () => {
    const devices = handlers.devices();
    root.innerHTML = `
      <section class="group">
        <h3>Looks</h3>
        <div class="preset-row">
          <button class="chip" data-look="portrait" type="button">Portrait</button>
          <button class="chip" data-look="rave" type="button">Rave</button>
          <button class="chip" data-look="installation" type="button">Installation</button>
          <button class="chip" data-look="ghostly" type="button">Ghost</button>
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
        <div class="color-row">
          <label>Primary <input type="color" data-key="customPrimary" value="${settings.customPrimary}"/></label>
          <label>Secondary <input type="color" data-key="customSecondary" value="${settings.customSecondary}"/></label>
          <label>Background <input type="color" data-key="customBackground" value="${settings.customBackground}"/></label>
        </div>
      </section>
      <section class="group">
        <h3>Particles</h3>
        ${slider("Count", "particleCount", settings.particleCount, 400, 12000, 100)}
        ${slider("Size", "particleSize", settings.particleSize, 0.4, 6, 0.1)}
        ${slider("Life", "particleLife", settings.particleLife, 0.3, 6, 0.1)}
        ${slider("Speed", "particleSpeed", settings.particleSpeed, 0.1, 3, 0.05)}
        ${slider("Gravity", "gravity", settings.gravity, -2, 2, 0.05)}
        ${slider("Turbulence", "turbulence", settings.turbulence, 0, 2, 0.05)}
        ${slider("Trails", "trailFade", settings.trailFade, 0.02, 0.6, 0.01)}
        ${slider("Attract", "attract", settings.attract, 0, 2, 0.05)}
        ${slider("Bloom", "bloom", settings.bloom, 0, 1.5, 0.05)}
        ${slider("Color cycle", "colorCycle", settings.colorCycle, 0, 3, 0.05)}
        ${slider("Camera mix", "cameraMix", settings.cameraMix, 0, 1, 0.01)}
      </section>
      <section class="group">
        <h3>Scene</h3>
        <label class="row">Background
          <select data-key="background">
            ${BACKGROUND_MODES.map((b) => `<option value="${b}" ${settings.background === b ? "selected" : ""}>${b}</option>`).join("")}
          </select>
        </label>
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
          <label><input type="checkbox" data-bool="showSkeleton" ${settings.showSkeleton ? "checked" : ""}/> Skeleton overlay</label>
          <label><input type="checkbox" data-bool="showHud" ${settings.showHud ? "checked" : ""}/> HUD</label>
          <label><input type="checkbox" data-bool="gestures" ${settings.gestures ? "checked" : ""}/> Body gestures</label>
          <label><input type="checkbox" data-bool="audioReactive" ${settings.audioReactive ? "checked" : ""}/> Audio-reactive glow</label>
          <label><input type="checkbox" data-bool="depthColor" ${settings.depthColor ? "checked" : ""}/> Depth coloring</label>
        </div>
      </section>
      <section class="group">
        <h3>Shortcuts</h3>
        <ul class="shortcuts">
          <li><b>S</b> or <b>,</b> toggle this panel · <b>Esc</b> close</li>
          <li><b>1–0</b> effects · <b>[ ]</b> palettes</li>
          <li><b>M</b> mirror · <b>R</b> rotate · <b>C</b> camera</li>
          <li><b>F</b> fullscreen · <b>H</b> HUD · <b>Space</b> freeze</li>
          <li><b>P</b> screenshot · <b>V</b> record · <b>L</b> copy look</li>
          <li>Hands up: next effect · Hands together: burst · T-pose: next palette</li>
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
      if (key === "rotation" || key === "numPoses") {
        (settings as unknown as Record<string, unknown>)[key] = Number(v);
      } else {
        (settings as unknown as Record<string, unknown>)[key] = v;
      }
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

function slider(label: string, key: string, value: number, min: number, max: number, step: number): string {
  return `<label class="row">${label}<span data-val="${key}">${fmt(value)}</span></label>
    <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}"/>`;
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
