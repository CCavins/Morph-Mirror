export class AudioPulse {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  energy = 0;
  enabled = false;

  async start(): Promise<void> {
    if (this.enabled) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.72;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.enabled = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.data = null;
    this.enabled = false;
    this.energy = 0;
  }

  sample(): number {
    if (!this.enabled || !this.analyser || !this.data) {
      this.energy *= 0.9;
      return this.energy;
    }
    this.analyser.getByteFrequencyData(this.data);
    let sum = 0;
    const n = Math.min(48, this.data.length);
    for (let i = 0; i < n; i++) sum += this.data[i];
    const rms = sum / (n * 255);
    this.energy = this.energy * 0.65 + rms * 0.35;
    return this.energy;
  }
}
