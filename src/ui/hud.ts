import { EFFECT_LABELS, type EffectMode } from "../types";

interface HudEls {
  hud: HTMLElement;
  mode: HTMLElement;
  status: HTMLElement;
  rec: HTMLElement;
}

let els: HudEls | null = null;
let toastTimer = 0;

function hudEls(): HudEls | null {
  if (els) return els;
  const hud = document.getElementById("hud");
  const mode = document.getElementById("mode-label");
  const status = document.getElementById("status");
  const rec = document.getElementById("rec-dot");
  if (!hud || !mode || !status || !rec) return null;
  els = { hud, mode, status, rec };
  return els;
}

export function setHud(opts: {
  mode: EffectMode;
  status: string;
  hidden: boolean;
  recording: boolean;
}): void {
  const e = hudEls();
  if (!e) return;
  e.hud.classList.toggle("is-hidden", opts.hidden);
  e.hud.hidden = opts.hidden;
  const label = EFFECT_LABELS[opts.mode];
  if (e.mode.textContent !== label) e.mode.textContent = label;
  if (e.status.textContent !== opts.status) e.status.textContent = opts.status;
  e.rec.hidden = !opts.recording;
}

export function toast(message: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 1800);
}
