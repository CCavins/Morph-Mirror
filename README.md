# Morph Mirror

A full-screen AR mirror that tracks your body in the browser and turns motion into liquid light and particles. Pose estimation runs on-device with MediaPipe — nothing is uploaded.

Live: [https://ccavins.github.io/Morph-Mirror/](https://ccavins.github.io/Morph-Mirror/)

## Use it

1. Open the site in Chrome or Edge (Safari works; grant camera access).
2. Click **Enter the Mirror**.
3. Stand so your upper body or full figure is in frame. The camera is mirrored like a real mirror.

All tracking stays on your machine. The optional audio-reactive glow is off until you enable it in settings.

## Shortcuts

| Key | Action |
| --- | --- |
| `S` or `,` | Settings |
| `Esc` | Close settings |
| `1`–`0` | Switch effects |
| `[` `]` | Cycle color palettes |
| `M` | Toggle mirror |
| `R` | Rotate camera 90° (portrait webcams) |
| `C` | Next camera |
| `F` | Fullscreen |
| `H` | Hide HUD |
| `Space` | Freeze pose |
| `P` | Screenshot |
| `V` | Record / stop clip |
| `L` | Copy a shareable look URL |

Gestures (on by default): both hands up → next effect, hands together → burst, T-pose → next palette.

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
