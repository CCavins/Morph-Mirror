# Morph Mirror

A full-screen AR mirror that tracks your body in the browser and turns motion into liquid light, particles, and bubbles. Pose estimation runs on-device with MediaPipe — nothing is uploaded.

Live: [https://ccavins.github.io/Morph-Mirror/](https://ccavins.github.io/Morph-Mirror/)

## Use it

1. Open the site in Chrome or Edge (Safari works; grant camera access).
2. Click **Enter the Mirror**. On a phone, use the **Settings** button in the corner (or **S** on a keyboard).
3. Stand so your upper body or full figure is in frame. The camera is mirrored like a real mirror.

All tracking stays on your machine. The optional audio-reactive glow is off until you enable it in settings.

Each effect remembers its own sliders, palette, and colors in localStorage. Settings only shows controls that apply to the current effect.

## Shortcuts

| Key | Action |
| --- | --- |
| `S` or `,` | Settings |
| `Esc` | Close settings |
| `1`–`9`, `0`, `-`, `=` | Switch effects (Liquid … Metaballs) |
| `N` | Next effect |
| `[` `]` | Cycle color palettes |
| `B` | Cycle background: solid color, motion graphic, camera |
| `M` | Toggle mirror |
| `R` | Rotate camera 90° (portrait webcams) |
| `C` | Next camera |
| `F` | Fullscreen |
| `H` | Hide HUD |
| `Space` | Freeze pose |
| `P` | Screenshot |
| `V` | Record / stop clip |
| `L` | Copy a shareable look URL |

Gestures (on by default): hands together → burst, T-pose → next palette.

In **Scene**, **Auto-rotate effects** (off by default) walks through every effect on a timer you set.

## Local development

```bash
npm install
npm run dev
```

Then open the printed localhost URL. Camera access requires a secure context (`localhost` is fine).

```bash
npm run build
npm run preview
```

## GitHub Pages

Pushes to `main` build with Vite (`VITE_BASE=/Morph-Mirror/`) and deploy through GitHub Actions. In the repo: **Settings → Pages → Source: GitHub Actions**.
