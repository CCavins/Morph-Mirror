export class Camera {
  readonly video: HTMLVideoElement;
  readonly process: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  devices: MediaDeviceInfo[] = [];
  deviceId = "";

  constructor() {
    this.video = document.createElement("video");
    this.video.setAttribute("playsinline", "true");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.style.display = "none";
    document.body.append(this.video);

    this.process = document.createElement("canvas");
    const ctx = this.process.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Could not create processing canvas.");
    this.ctx = ctx;
  }

  async start(deviceId?: string): Promise<void> {
    this.stop();
    if (!window.isSecureContext) {
      throw new Error("Camera access needs HTTPS (or localhost).");
    }
    const video: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (deviceId) {
      video.deviceId = { exact: deviceId };
    } else {
      video.facingMode = "user";
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      if (deviceId) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
      } else {
        throw err;
      }
    }

    this.video.srcObject = this.stream;
    await this.video.play();
    const track = this.stream.getVideoTracks()[0];
    this.deviceId = track?.getSettings().deviceId ?? deviceId ?? "";
    await this.refreshDevices();
  }

  pausePlayback(): void {
    this.video.pause();
  }

  async resumePlayback(): Promise<void> {
    if (!this.stream || !this.video.paused) return;
    try {
      await this.video.play();
    } catch {
      /* autoplay blocked while backgrounded */
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  async refreshDevices(): Promise<MediaDeviceInfo[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    this.devices = all.filter((d) => d.kind === "videoinput");
    return this.devices;
  }

  cycleDevice(): string | null {
    if (this.devices.length < 2) return this.deviceId || null;
    const i = Math.max(0, this.devices.findIndex((d) => d.deviceId === this.deviceId));
    const next = this.devices[(i + 1) % this.devices.length];
    return next.deviceId;
  }

  get ready(): boolean {
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  drawProcess(mirror: boolean, rotation: number, maxSide = 640): boolean {
    if (!this.ready) return false;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const swap = rotation === 90 || rotation === 270;
    const unscaledW = swap ? vh : vw;
    const unscaledH = swap ? vw : vh;
    const s = Math.min(1, maxSide / Math.max(unscaledW, unscaledH));
    const cw = Math.max(2, Math.round(unscaledW * s));
    const ch = Math.max(2, Math.round(unscaledH * s));
    if (this.process.width !== cw) this.process.width = cw;
    if (this.process.height !== ch) this.process.height = ch;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    if (mirror) ctx.scale(-1, 1);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(cw / unscaledW, ch / unscaledH);
    ctx.drawImage(this.video, -vw / 2, -vh / 2, vw, vh);
    ctx.restore();
    return true;
  }
}

export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was blocked. Allow the camera and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError") {
    return "The camera is already in use by another app.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not start the camera.";
}
