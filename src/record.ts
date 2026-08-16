export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  recording = false;

  get supported(): boolean {
    return typeof MediaRecorder !== "undefined";
  }

  start(canvas: HTMLCanvasElement): boolean {
    if (!this.supported || this.recording) return false;
    const stream = canvas.captureStream(30);
    const mime = pickMime();
    try {
      this.chunks = [];
      this.recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
        : new MediaRecorder(stream);
    } catch {
      return false;
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const type = this.recorder?.mimeType || "video/webm";
      const blob = new Blob(this.chunks, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      downloadBlob(blob, `morph-mirror-${Date.now()}.${ext}`);
      this.chunks = [];
      this.recording = false;
    };
    this.recorder.start();
    this.recording = true;
    return true;
  }

  stop(): void {
    if (!this.recorder || this.recorder.state === "inactive") {
      this.recording = false;
      return;
    }
    this.recorder.stop();
  }

  toggle(canvas: HTMLCanvasElement): boolean {
    if (this.recording) {
      this.stop();
      return false;
    }
    return this.start(canvas);
  }
}

function pickMime(): string {
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function screenshotCanvas(canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `morph-mirror-${Date.now()}.png`);
  }, "image/png");
}
