import { EFFECT_LABELS, type EffectMode } from "../types";

export function setHud(opts: {
  mode: EffectMode;
  status: string;
  hidden: boolean;
  recording: boolean;
}): void {
  const hud = document.getElementById("hud");
  const mode = document.getElementById("mode-label");
  const status = document.getElementById("status");
  const rec = document.getElementById("rec-dot");
  if (!hud || !mode || !status || !rec) return;
  hud.classList.toggle("is-hidden", opts.hidden);
  hud.hidden = opts.hidden;
  mode.textContent = EFFECT_LABELS[opts.mode];
  status.textContent = opts.status;
  rec.hidden = !opts.recording;
}

export function toast(message: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  window.setTimeout(() => {
    el.hidden = true;
  }, 1800);
}
