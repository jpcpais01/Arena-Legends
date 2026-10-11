import { KIND, LIGHT, rgb, type LightKind } from '../render/glfx';

/**
 * Shader layer for the shop scenes (the chest vault and the forge). The
 * scene is painted on a small art-resolution 2D canvas; this redraws it on a
 * WebGL2 canvas at CSS-pixel size, still sampled on the art-pixel grid so it
 * stays pixel art, and adds what 2D can't: soft bloom on everything bright,
 * shockwave refraction, heat haze, a camera that pushes in, zoom blur,
 * colour split, anime impact frames, and additive light (glows, beams,
 * rays, flares, rings). Everything is in art pixels and real seconds.
 *
 * When WebGL2 is missing, `ok` is false and the screens show the 2D canvas
 * as it is.
 */

export interface Glow {
  kind: LightKind;
  x: number;
  y: number;
  /** Follows a point (art px) while it returns one. */
  follow?: () => { x: number; y: number } | null;
  r0: number;
  r1: number;
  w?: number;
  rot?: number;
  sweep?: number;
  squash?: number;
  hi: string;
  lo: string;
  power?: number;
  life: number;
  delay?: number;
  fin?: number;
  seed?: number;
  /** Keeps full power until the last quarter of its life (else it fades from the start). */
  hold?: boolean;
  t?: number;
}

interface Wave { x: number; y: number; r: number; amp: number; life: number; col: string; t: number }

const MAX_WAVES = 6;

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const POST = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform vec2 res, buf;
uniform float k, time;
uniform vec3 cam;
uniform vec4 wave[${MAX_WAVES}];
uniform vec4 waveC[${MAX_WAVES}];
uniform vec4 zoom;
uniform float ca;
uniform vec4 haze;
uniform float hazeAmp;
uniform float bloom;
uniform vec4 imp;
uniform vec3 impHi, impLo;
uniform vec4 vig;
out vec4 o;
vec3 at(vec2 a) {
  if (a.x < 0.0 || a.y < 0.0 || a.x >= buf.x || a.y >= buf.y) return vec3(0.0);
  return texture(scene, (floor(a) + 0.5) / buf).rgb;
}
vec3 hot(vec2 a) {
  vec3 s = at(a);
  float b = dot(s, vec3(0.3, 0.59, 0.11));
  return s * smoothstep(0.74, 1.0, b);
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / k;
  p = (p - cam.xy) / cam.z + cam.xy;
  vec2 q = p;
  vec3 rim = vec3(0.0);
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    vec4 s = wave[i];
    if (s.w == 0.0) continue;
    vec2 d = p - s.xy;
    d.y *= 1.35;
    float l = length(d);
    float w = waveC[i].w;
    float f = exp(-pow((l - s.z) / w, 2.0));
    q -= d / max(l, 0.5) * f * s.w;
    rim += waveC[i].rgb * f * 0.3 * min(1.0, abs(s.w) / 2.0);
  }
  if (hazeAmp > 0.0 && p.x > haze.x && p.x < haze.z && p.y > haze.y && p.y < haze.w) {
    float u = (p.x - haze.x) / (haze.z - haze.x);
    float v = (p.y - haze.y) / (haze.w - haze.y);
    float m = sin(u * 3.14159) * smoothstep(0.0, 0.35, v) * smoothstep(1.0, 0.75, v);
    q.x += (sin(p.y * 0.9 - time * 7.0) + 0.6 * sin(p.y * 2.1 + time * 11.0)) * hazeAmp * m;
    q.y += sin(p.x * 1.3 + time * 5.0) * hazeAmp * 0.35 * m;
  }
  vec3 c;
  if (zoom.z > 0.0) {
    vec2 dir = (zoom.xy - q) * zoom.z;
    c = vec3(0.0);
    for (int i = 0; i < 8; i++) c += at(q + dir * (float(i) / 7.0));
    c /= 8.0;
  } else c = at(q);
  if (ca > 0.0) {
    vec2 dir = normalize(p - zoom.xy + 0.001) * ca * smoothstep(0.0, 0.5 * buf.y, length(p - zoom.xy));
    c.r = mix(c.r, at(q + dir).r, 0.85);
    c.b = mix(c.b, at(q - dir).b, 0.85);
  }
  if (bloom > 0.0) {
    vec3 b = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + 0.39;
      vec2 d = vec2(cos(a), sin(a));
      b += hot(q + d * 2.0) * 0.5 + hot(q + d * 4.5) * 0.32 + hot(q + d * 8.0) * 0.18;
    }
    c += b / 8.0 * bloom;
  }
  c += rim;
  float vd = length((p - buf * 0.5) / buf);
  c = mix(c, c * vig.rgb, smoothstep(0.3, 0.8, vd) * vig.w);
  if (imp.x > 0.0) {
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    float v = step(imp.z, lum);
    c = mix(c, mix(impLo, impHi, v), imp.x);
  }
  o = vec4(c, 1.0);
}`;

const hex = (c: string): number => parseInt(c.slice(1, 7), 16);

export class SceneGl {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private post!: WebGLProgram;
  private light!: WebGLProgram;
  private tex!: WebGLTexture;
  private pu: Record<string, WebGLUniformLocation | null> = {};
  private lu: Record<string, WebGLUniformLocation | null> = {};
  private glows: Glow[] = [];
  private waves: Wave[] = [];
  private zoomFx: { x: number; y: number; t: number; life: number; k: number } | null = null;
  private caFx: { t: number; life: number; k: number } | null = null;
  private imp: { t: number; len: number; hi: string; lo: string } | null = null;
  private time = 0;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)');
  /** Camera: pushes in `zoom` times on (cx, cy), art px. */
  cam = { x: 0, y: 0, zoom: 1 };
  /** Heat haze over a box (art px) and its strength in art px. */
  haze = { x0: 0, y0: 0, x1: 0, y1: 0, amp: 0 };
  bloom = 0.9;
  /** Edges darken toward a colour. */
  vignette = { col: '#000000', k: 0 };

  constructor(private readonly src: HTMLCanvasElement) {
    this.canvas = document.createElement('canvas');
    try { this.init(); } catch { this.gl = null; }
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.gl = null; this.onLost?.(); });
  }

  /** Called if the GPU drops the context (the screen falls back to the 2D canvas). */
  onLost: (() => void) | null = null;

  get ok(): boolean {
    return !!this.gl;
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' });
    if (!gl) return;
    const sh = (type: number, s: string) => {
      const x = gl.createShader(type)!;
      gl.shaderSource(x, s);
      gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? 'shader');
      return x;
    };
    const prog = (fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
      return p;
    };
    this.post = prog(POST);
    this.light = prog(LIGHT);
    for (const n of ['scene', 'res', 'buf', 'k', 'time', 'cam', 'wave', 'waveC', 'zoom', 'ca', 'haze', 'hazeAmp', 'bloom', 'imp', 'impHi', 'impLo', 'vig']) this.pu[n] = gl.getUniformLocation(this.post, n);
    for (const n of ['res', 'dxy', 'vs', 'kind', 'c', 'a', 'b', 'hi', 'lo', 'pw']) this.lu[n] = gl.getUniformLocation(this.light, n);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.gl = gl;
  }

  /** Matches the art canvas: `k` CSS px per art px. */
  resize(k: number): void {
    this.k = k;
    const W = this.src.width * k, H = this.src.height * k;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
  }
  private k = 3;

  add(l: Glow): Glow {
    if (!this.gl) return l;
    l.t = -(l.delay ?? 0);
    if (this.glows.length >= 40) this.glows.shift();
    this.glows.push(l);
    return l;
  }

  /** Ends a light early (it fades over a moment). */
  end(l: Glow | null | undefined): void {
    if (!l || l.t === undefined) return;
    l.hold = false;
    l.life = Math.min(l.life, Math.max(0, l.t) + 0.3);
    l.t = Math.max(l.t, l.life - 0.3);
  }

  /** A shockwave: a ring of refraction racing out to radius `r` (art px). */
  shock(x: number, y: number, r: number, amp: number, life: number, col: string): void {
    if (!this.gl) return;
    if (this.waves.length >= MAX_WAVES) this.waves.shift();
    this.waves.push({ x, y, r, amp, life, col, t: 0 });
  }

  zoomBlur(x: number, y: number, k: number, life: number): void {
    if (!this.gl || this.calm.matches) return;
    this.zoomFx = { x, y, t: 0, life, k };
  }

  split(k: number, life: number): void {
    if (!this.gl) return;
    this.caFx = { t: 0, life, k };
  }

  /** An anime impact frame: the picture flips to two-tone ink for a split second. */
  impact(hi: string, lo: string, len = 0.07): void {
    if (!this.gl || this.calm.matches) return;
    this.imp = { t: 0, len, hi, lo };
  }

  clear(): void {
    this.glows.length = 0;
    this.waves.length = 0;
    this.zoomFx = this.caFx = this.imp = null;
  }

  /** Ages everything by `dt` real seconds and draws the frame. */
  render(dt: number): void {
    const gl = this.gl;
    if (!gl) return;
    this.age(dt);
    const W = this.canvas.width, H = this.canvas.height, k = this.k;
    const bw = this.src.width, bh = this.src.height;
    if (!W || !H || !bw || !bh) return;
    const zm = this.calm.matches ? 1 : this.cam.zoom;
    const cx = this.cam.x, cy = this.cam.y;
    gl.viewport(0, 0, W, H);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.src);
    gl.useProgram(this.post);
    const u = this.pu;
    gl.uniform1i(u.scene, 0);
    gl.uniform2f(u.res, W, H);
    gl.uniform2f(u.buf, bw, bh);
    gl.uniform1f(u.k, k);
    gl.uniform1f(u.time, this.time);
    gl.uniform3f(u.cam, cx, cy, zm);
    const wv = new Float32Array(MAX_WAVES * 4), wc = new Float32Array(MAX_WAVES * 4);
    this.waves.forEach((s, i) => {
      const e = s.t / s.life;
      const ease = 1 - (1 - e) ** 3;
      wv.set([s.x, s.y, s.r * (0.08 + 0.92 * ease), s.amp * (1 - e) ** 1.5], i * 4);
      const [r, g, b] = rgb(hex(s.col));
      wc.set([r, g, b, Math.max(1.5, s.r * 0.13 * (1 - e * 0.5))], i * 4);
    });
    gl.uniform4fv(u.wave, wv);
    gl.uniform4fv(u.waveC, wc);
    const z = this.zoomFx;
    if (z) gl.uniform4f(u.zoom, z.x, z.y, z.k * (1 - z.t / z.life) ** 2, 0);
    else gl.uniform4f(u.zoom, bw / 2, bh / 2, 0, 0);
    gl.uniform1f(u.ca, this.caFx ? this.caFx.k * (1 - this.caFx.t / this.caFx.life) ** 2 : 0);
    const hz = this.haze;
    gl.uniform4f(u.haze, hz.x0, hz.y0, hz.x1, hz.y1);
    gl.uniform1f(u.hazeAmp, this.calm.matches ? 0 : hz.amp);
    gl.uniform1f(u.bloom, this.bloom);
    const im = this.imp;
    if (im) {
      gl.uniform4f(u.imp, 0.95, 0, 0.42, 0);
      gl.uniform3f(u.impHi, ...rgb(hex(im.hi)));
      gl.uniform3f(u.impLo, ...rgb(hex(im.lo)));
    } else gl.uniform4f(u.imp, 0, 0, 0, 0);
    const vg = this.vignette;
    gl.uniform4f(u.vig, ...rgb(hex(vg.col)), vg.k);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this.glows.length && !im) {
      gl.useProgram(this.light);
      const l = this.lu;
      const vs = k * zm;
      // Art px -> canvas px through the camera; light snaps to the (zoomed) art-pixel grid.
      const ox = (0 - cx) * vs + cx * k, oy = (0 - cy) * vs + cy * k;
      gl.uniform2f(l.res, W, H);
      gl.uniform2f(l.dxy, ox, oy);
      gl.uniform1f(l.vs, vs);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      for (const li of this.glows) {
        if (li.t! < 0) continue;
        const e = Math.min(1, li.t! / li.life);
        const grow = 1 - (1 - e) ** 3;
        const fin = li.fin ?? 0.08;
        const fade = li.hold ? (e > 0.75 ? (1 - e) / 0.25 : 1) : (1 - e) ** 1.6;
        const pw = (li.power ?? 1) * Math.min(1, fin > 0 ? e / fin : 1) * fade;
        if (pw <= 0.002) continue;
        const R = (li.r0 + (li.r1 - li.r0) * grow) * vs;
        gl.uniform1i(l.kind, KIND[li.kind]);
        gl.uniform2f(l.c, li.x * vs + ox, li.y * vs + oy);
        gl.uniform4f(l.a, R, (li.w ?? 1) * vs, li.kind === 'arc' ? (li.sweep ?? Math.PI) : (li.squash ?? 1), li.rot ?? 0);
        if (li.kind === 'arc') gl.uniform4f(l.b, Math.min(1, e / 0.45), Math.max(0, (e - 0.2) / 0.8) ** 0.8, 0, 0);
        else gl.uniform4f(l.b, 0, 0, li.seed ?? 0, 0);
        gl.uniform3f(l.hi, ...rgb(hex(li.hi)));
        gl.uniform3f(l.lo, ...rgb(hex(li.lo)));
        gl.uniform1f(l.pw, pw);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
  }

  private age(dt: number): void {
    this.time += dt;
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const l = this.glows[i];
      l.t! += dt;
      if (l.follow && l.t! >= 0) {
        const at = l.follow();
        if (at) { l.x = at.x; l.y = at.y; }
      }
      if (l.t! >= l.life) this.glows.splice(i, 1);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) if ((this.waves[i].t += dt) >= this.waves[i].life) this.waves.splice(i, 1);
    if (this.imp && (this.imp.t += dt) >= this.imp.len) this.imp = null;
    if (this.zoomFx && (this.zoomFx.t += dt) >= this.zoomFx.life) this.zoomFx = null;
    if (this.caFx && (this.caFx.t += dt) >= this.caFx.life) this.caFx = null;
  }
}
