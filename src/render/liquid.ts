const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform float u_flipY;
uniform float u_spread;

void main() {
  vec2 uv = vec2(v_uv.x, mix(v_uv.y, 1.0 - v_uv.y, u_flipY));
  vec2 step = u_dir * u_spread;
  float w0 = 0.2270270270;
  float w1 = 0.1945945946;
  float w2 = 0.1216216216;
  float w3 = 0.0540540541;
  float w4 = 0.0162162162;
  float s = texture(u_src, uv).r * w0;
  s += texture(u_src, uv + step * 1.0).r * w1;
  s += texture(u_src, uv - step * 1.0).r * w1;
  s += texture(u_src, uv + step * 2.0).r * w2;
  s += texture(u_src, uv - step * 2.0).r * w2;
  s += texture(u_src, uv + step * 3.0).r * w3;
  s += texture(u_src, uv - step * 3.0).r * w3;
  s += texture(u_src, uv + step * 4.0).r * w4;
  s += texture(u_src, uv - step * 4.0).r * w4;
  outColor = vec4(s, s, s, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_mask;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_glowA;
uniform vec3 u_glowB;
uniform float u_speed;
uniform float u_scale;
uniform float u_bright;
uniform float u_filament;
uniform float u_core;
uniform float u_glow;
uniform float u_audio;
uniform float u_bloom;
uniform float u_warp;

float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1,0,0));
  float n010 = hash(i + vec3(0,1,0));
  float n110 = hash(i + vec3(1,1,0));
  float n001 = hash(i + vec3(0,0,1));
  float n101 = hash(i + vec3(1,0,1));
  float n011 = hash(i + vec3(0,1,1));
  float n111 = hash(i + vec3(1,1,1));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float fbm(vec3 p){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += vnoise(p) * a;
    p = p * 2.02 + vec3(0.17, 0.31, 0.11);
    a *= 0.5;
  }
  return s;
}

float sampleBody(vec2 uv){
  return texture(u_mask, uv).r;
}

void main(){
  vec2 uv = v_uv;
  float t = u_time * u_speed;

  vec3 wp = vec3(uv * 1.65, t * 0.22);
  vec2 warp = vec2(fbm(wp), fbm(wp + vec3(5.2, 1.7, 0.4))) * 2.0 - 1.0;
  vec2 suv = uv + warp * (0.018 + u_warp * 0.028);

  float d = sampleBody(suv);
  d = max(d, sampleBody(suv + warp * 0.012) * 0.55);

  float inside = smoothstep(0.12, 0.48, d);
  float halo = smoothstep(0.03, 0.26, d) * (1.0 - smoothstep(0.22, 0.62, d));
  float rim = smoothstep(0.16, 0.34, d) * (1.0 - smoothstep(0.34, 0.58, d));

  vec3 lp = vec3(suv * u_scale, t * 0.18);
  lp.xy += vec2(fbm(lp), fbm(lp + 3.1)) * 0.55;
  float field = fbm(lp);
  float field2 = fbm(lp * 1.65 + field);
  float swirl = mix(field, field2, 0.45);
  float filaments = smoothstep(0.38, 0.58, swirl) * smoothstep(0.86, 0.6, swirl);

  vec3 liquid = mix(u_primary, u_secondary, swirl);
  liquid = mix(liquid, mix(u_glowA, u_glowB, field2), filaments * (0.28 + u_filament * 0.18));
  liquid *= u_bright * (0.88 + u_audio * 0.35);
  liquid += u_glowA * u_core * inside * (0.16 + 0.14 * swirl);

  vec3 glow = mix(u_glowA, u_glowB, 0.5 + 0.5 * sin(t * 0.7 + swirl * 3.0));
  glow *= (halo * 0.95 + rim * 0.55) * u_glow * (0.85 + u_bloom * 0.5 + u_audio * 0.35);

  float alpha = clamp(inside * 0.9 + halo * 0.7 + rim * 0.25, 0.0, 1.0);
  vec3 col = liquid * inside + glow;
  outColor = vec4(col * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "compile failed";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  }
  return prog;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

export class LiquidRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private liquidProg: WebGLProgram | null = null;
  private blurProg: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private maskTex: WebGLTexture | null = null;
  private ping: Target | null = null;
  private pong: Target | null = null;
  private maskBytes = new Uint8Array(1);
  private smoothMask: Float32Array | null = null;
  private lastMaskW = 0;
  private lastMaskH = 0;
  private liquidUniforms: Record<string, WebGLUniformLocation | null> = {};
  private blurUniforms: Record<string, WebGLUniformLocation | null> = {};
  ok = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "gl-layer";
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    this.gl = gl;
    if (!gl) return;
    try {
      this.init(gl);
      this.ok = true;
    } catch {
      this.ok = false;
    }
  }

  private init(gl: WebGL2RenderingContext): void {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    this.blurProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, BLUR_FRAG));
    this.liquidProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FRAG));

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.maskTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    for (const n of [
      "u_mask", "u_resolution", "u_time",
      "u_primary", "u_secondary", "u_glowA", "u_glowB",
      "u_speed", "u_scale", "u_bright", "u_filament", "u_core",
      "u_glow", "u_audio", "u_bloom", "u_warp",
    ]) {
      this.liquidUniforms[n] = gl.getUniformLocation(this.liquidProg, n);
    }
    for (const n of ["u_src", "u_dir", "u_flipY", "u_spread"]) {
      this.blurUniforms[n] = gl.getUniformLocation(this.blurProg, n);
    }
  }

  private makeTarget(gl: WebGL2RenderingContext, w: number, h: number): Target {
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error("fbo");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  resize(w: number, h: number): void {
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    const gl = this.gl;
    if (!gl || !this.ok) return;
    if (!this.ping || this.ping.w !== w || this.ping.h !== h) {
      try {
        this.ping = this.makeTarget(gl, w, h);
        this.pong = this.makeTarget(gl, w, h);
      } catch {
        this.ok = false;
      }
    }
  }

  render(opts: {
    mask: Float32Array | null;
    maskW: number;
    maskH: number;
    time: number;
    primary: [number, number, number];
    secondary: [number, number, number];
    glowA: [number, number, number];
    glowB: [number, number, number];
    speed: number;
    scale: number;
    bright: number;
    filament: number;
    core: number;
    glow: number;
    audio: number;
    bloom: number;
    warp: number;
  }): void {
    const gl = this.gl;
    const liquidProg = this.liquidProg;
    const blurProg = this.blurProg;
    if (!gl || !liquidProg || !blurProg || !this.ok || !this.ping || !this.pong) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    if (opts.mask && opts.maskW > 0) {
      const n = opts.maskW * opts.maskH;
      this.lastMaskW = opts.maskW;
      this.lastMaskH = opts.maskH;
      if (!this.smoothMask || this.smoothMask.length !== n) {
        this.smoothMask = new Float32Array(n);
        this.smoothMask.set(opts.mask);
      } else {
        const prev = this.smoothMask;
        for (let i = 0; i < n; i++) prev[i] = prev[i] * 0.78 + opts.mask[i] * 0.22;
      }
    } else if (this.smoothMask) {
      for (let i = 0; i < this.smoothMask.length; i++) this.smoothMask[i] *= 0.88;
    }
    if (this.smoothMask && this.lastMaskW > 0) {
      const n = this.smoothMask.length;
      if (this.maskBytes.length !== n) this.maskBytes = new Uint8Array(n);
      const src = this.smoothMask;
      for (let i = 0; i < n; i++) this.maskBytes[i] = Math.min(255, src[i] * 265);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        this.lastMaskW,
        this.lastMaskH,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        this.maskBytes,
      );
    }

    this.blurPass(gl, this.maskTex, this.ping, 1 / w, 0, 1, 3.4);
    this.blurPass(gl, this.ping.tex, this.pong, 0, 1 / h, 0, 3.4);
    this.blurPass(gl, this.pong.tex, this.ping, 1 / w, 0, 0, 2.2);
    this.blurPass(gl, this.ping.tex, this.pong, 0, 1 / h, 0, 2.2);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(liquidProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pong.tex);
    const u = this.liquidUniforms;
    gl.uniform1i(u.u_mask, 0);
    gl.uniform2f(u.u_resolution, w, h);
    gl.uniform1f(u.u_time, opts.time);
    gl.uniform3f(u.u_primary, opts.primary[0], opts.primary[1], opts.primary[2]);
    gl.uniform3f(u.u_secondary, opts.secondary[0], opts.secondary[1], opts.secondary[2]);
    gl.uniform3f(u.u_glowA, opts.glowA[0], opts.glowA[1], opts.glowA[2]);
    gl.uniform3f(u.u_glowB, opts.glowB[0], opts.glowB[1], opts.glowB[2]);
    gl.uniform1f(u.u_speed, opts.speed);
    gl.uniform1f(u.u_scale, opts.scale);
    gl.uniform1f(u.u_bright, opts.bright);
    gl.uniform1f(u.u_filament, opts.filament);
    gl.uniform1f(u.u_core, opts.core);
    gl.uniform1f(u.u_glow, opts.glow);
    gl.uniform1f(u.u_audio, opts.audio);
    gl.uniform1f(u.u_bloom, opts.bloom);
    gl.uniform1f(u.u_warp, opts.warp);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private blurPass(
    gl: WebGL2RenderingContext,
    src: WebGLTexture | null,
    dest: Target,
    dx: number,
    dy: number,
    flipY: number,
    spread: number,
  ): void {
    if (!this.blurProg || !src) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo);
    gl.viewport(0, 0, dest.w, dest.h);
    gl.useProgram(this.blurProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(this.blurUniforms.u_src, 0);
    gl.uniform2f(this.blurUniforms.u_dir, dx, dy);
    gl.uniform1f(this.blurUniforms.u_flipY, flipY);
    gl.uniform1f(this.blurUniforms.u_spread, spread);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
