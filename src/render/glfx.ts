import type { Screen } from './screen';

/**
 * Shader light layer for the big moments (weapon supers): a WebGL2 canvas
 * over the pixel screen that redraws the frame with screen-space effects
 * (shockwave refraction, zoom blur, chromatic split, anime impact frames)
 * and adds soft light on top (glows, blade arcs, beams, rings, flares).
 *
 * It only runs while an effect is alive: the rest of the time the canvas is
 * hidden and costs nothing. The scene comes from the pixel buffer and is
 * sampled on the art-pixel grid, and light is snapped to it too, so even
 * distorted the picture stays pixel art. Lights live in world metres and
 * age with the battle's (slowed) clock; impact frames run on real time.
 */
export type LightKind = 'glow' | 'ring' | 'arc' | 'beam' | 'flare' | 'star' | 'rays';

export interface Light {
  kind: LightKind;
  /** World position (metres, y up), or follows `follow` (null when it is gone: the light fades out). */
  x: number;
  y: number;
  follow?: () => [number, number] | null;
  /** Size in metres: grows from r0 to r1 over its life (ease out). Radius for glow/ring/arc/rays/star, length for beam/flare. */
  r0: number;
  r1: number;
  /** Thickness (metres) for ring, arc, beam, flare, star. */
  w?: number;
  /** Rotation (radians, world: 0 = +x, counter-clockwise). For arc, where the sweep starts. */
  rot?: number;
  /** Arc: signed sweep in radians (world). */
  sweep?: number;
  /** Ring: vertical squash (0.3 = a flat ring on the ground). */
  squash?: number;
  hi: number;
  lo: number;
  /** Peak brightness (1 = full). */
  power?: number;
  life: number;
  /** Seconds before it starts. */
  delay?: number;
  /** Fraction of its life spent fading in. */
  fin?: number;
  /** Seed for the rays' pattern. */
  seed?: number;
  /** Ages on wall-clock time, so it flashes by even in slow motion. */
  real?: boolean;
  t?: number;
  gone?: number;
}

export interface Shock {
  x: number;
  y: number;
  /** Final radius (metres). */
  r: number;
  /** Refraction strength in art pixels. */
  amp: number;
  life: number;
  hi: number;
  t?: number;
  delay?: number;
}

const MAX_SHOCKS = 4;
const KIND: Record<LightKind, number> = { glow: 0, ring: 1, arc: 2, beam: 3, flare: 4, star: 5, rays: 6 };

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// The frame, redrawn with refraction, zoom blur, chromatic split, impact frames and a tinted vignette.
const POST = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform vec2 res, buf, dxy, org;
uniform float vs;
uniform vec4 shock[${MAX_SHOCKS}];
uniform vec4 shockC[${MAX_SHOCKS}];
uniform vec4 zoom;
uniform float ca;
uniform vec4 imp;
uniform vec3 impHi, impLo;
uniform vec4 vig;
out vec4 o;
vec3 at(vec2 p) {
  vec2 a = (p - dxy) / vs + org;
  if (a.x < 0.0 || a.y < 0.0 || a.x >= buf.x || a.y >= buf.y) return vec3(0.0);
  return texture(scene, (floor(a) + 0.5) / buf).rgb;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 q = p;
  vec3 rim = vec3(0.0);
  for (int i = 0; i < ${MAX_SHOCKS}; i++) {
    vec4 s = shock[i];
    if (s.w == 0.0) continue;
    vec2 d = p - s.xy;
    float l = length(d);
    float w = shockC[i].w;
    float f = exp(-pow((l - s.z) / w, 2.0));
    q -= d / max(l, 1.0) * f * s.w;
    rim += shockC[i].rgb * f * 0.35 * min(1.0, s.w / (w * 0.25));
  }
  vec3 c;
  if (zoom.z > 0.0) {
    vec2 dir = (zoom.xy - q) * zoom.z;
    c = vec3(0.0);
    for (int i = 0; i < 8; i++) c += at(q + dir * (float(i) / 7.0));
    c /= 8.0;
  } else c = at(q);
  if (ca > 0.0) {
    vec2 dir = normalize(p - zoom.xy + 0.001) * ca * smoothstep(0.0, 0.5 * res.y, length(p - zoom.xy));
    c.r = mix(c.r, at(q + dir).r, 0.85);
    c.b = mix(c.b, at(q - dir).b, 0.85);
  }
  c += rim;
  float vd = length((p - res * 0.5) / res);
  c = mix(c, c * vig.rgb, smoothstep(0.25, 0.75, vd) * vig.w);
  if (imp.x > 0.0) {
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    float v = step(imp.z, lum);
    if (imp.y > 0.5) v = 1.0 - v;
    vec3 ink = impLo, paper = impHi;
    c = mix(c, mix(ink, paper, v), imp.x);
  }
  o = vec4(c, 1.0);
}`;

// One light, drawn additively over the frame. Coordinates are snapped to the art-pixel grid.
const LIGHT = `#version 300 es
precision highp float;
uniform vec2 res, dxy;
uniform float vs;
uniform int kind;
uniform vec2 c;
uniform vec4 a;
uniform vec4 b;
uniform vec3 hi, lo;
uniform float pw;
out vec4 o;
const float PI = 3.14159265;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  p = (floor((p - dxy) / vs) + 0.5) * vs + dxy;
  vec2 d = p - c;
  float cr = cos(a.w), sr = sin(a.w);
  vec2 q = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y);
  float R = a.x, W = max(a.y, 0.5);
  float v = 0.0, core = 0.0;
  if (kind == 0) {
    float r = length(q) / R;
    v = exp(-r * r * 3.0);
    core = exp(-r * r * 18.0);
  } else if (kind == 1) {
    q.y /= max(a.z, 0.05);
    float e = abs(length(q) - R);
    v = exp(-pow(e / W, 2.0)) + 0.35 * exp(-pow(e / (W * 4.0), 2.0));
    core = exp(-pow(e / (W * 0.35), 2.0));
  } else if (kind == 2) {
    // A blade arc: angle along the sweep (0..1), head racing ahead, tail fading behind, tapered ends.
    float ang = atan(q.y, q.x);
    float sw = a.z;
    float t = (sw >= 0.0 ? ang : -ang);
    t = mod(t + 4.0 * PI, 2.0 * PI) / abs(sw);
    float head = b.x, tail = b.y;
    if (t > head || t < tail || t > 1.0) { v = 0.0; }
    else {
      float u = (t - tail) / max(head - tail, 0.001);
      float taper = sin(u * PI * 0.92 + 0.08) * (0.35 + 0.65 * u);
      float e = length(q) - R;
      float th = W * taper;
      v = exp(-pow(e / max(th, 0.5), 2.0)) * (0.4 + 0.6 * u) + 0.25 * exp(-pow(e / (th * 3.0 + 1.0), 2.0)) * u;
      core = exp(-pow(e / max(th * 0.3, 0.5), 2.0)) * u * u;
    }
  } else if (kind == 3) {
    // A beam from the centre along +x, R long, thick at the head end.
    float L = R;
    float x = clamp(q.x, 0.0, L);
    float e = length(vec2(q.x - x, q.y));
    float u = x / max(L, 1.0);
    float th = W * (0.25 + 0.75 * u);
    v = exp(-pow(e / th, 2.0)) * (0.3 + 0.7 * u) + 0.3 * exp(-pow(e / (th * 4.0), 2.0)) * u;
    core = exp(-pow(e / (th * 0.3), 2.0)) * u;
  } else if (kind == 4) {
    // Anamorphic flare: a long thin horizontal streak and a soft core.
    v = exp(-pow(q.y / W, 2.0)) * exp(-pow(q.x / R, 2.0) * 2.0) + 0.6 * exp(-dot(q, q) / (W * W * 30.0));
    core = exp(-pow(q.y / (W * 0.3), 2.0)) * exp(-pow(q.x / R, 2.0) * 6.0);
  } else if (kind == 5) {
    // A four-point star glint.
    float r = length(q);
    v = (exp(-abs(q.y) / W) * exp(-abs(q.x) / R) + exp(-abs(q.x) / W) * exp(-abs(q.y) / R)) + exp(-r * r / (W * W * 6.0));
    core = exp(-r * r / (W * W * 1.5));
  } else {
    // Rays: soft light shafts bursting out, broken up by angle.
    float r = length(q);
    float ang = atan(q.y, q.x) / (2.0 * PI) + 0.5;
    float n = ang * 26.0;
    float k = mix(hash(floor(n) + b.z), hash(floor(n) + 1.0 + b.z), smoothstep(0.0, 1.0, fract(n)));
    v = pow(k, 3.0) * smoothstep(R, R * 0.15, r) * smoothstep(0.0, R * 0.12, r);
    core = 0.0;
  }
  vec3 col = mix(lo, hi, clamp(v, 0.0, 1.0)) * v + vec3(1.0) * core;
  o = vec4(col * pw, 0.0);
}`;

function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

interface Impact { t: number; len: number; hi: number; lo: number; flip: boolean }

export class GlFx {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private post!: WebGLProgram;
  private light!: WebGLProgram;
  private tex!: WebGLTexture;
  private pu: Record<string, WebGLUniformLocation | null> = {};
  private lu: Record<string, WebGLUniformLocation | null> = {};
  private lights: Light[] = [];
  private shocks: Shock[] = [];
  private impact: Impact | null = null;
  private zoomFx: { x: number; y: number; t: number; life: number; k: number } | null = null;
  private caFx: { t: number; life: number; k: number } | null = null;
  private vig: { t: number; life: number; c: number; k: number } | null = null;
  private shown = false;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly screen: Screen) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'glfx';
    this.canvas.style.visibility = 'hidden';
    screen.canvas.after(this.canvas);
    try { this.init(); } catch { this.gl = null; }
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.gl = null; this.hide(); });
  }

  /** True when the shader layer works on this device. */
  get ok(): boolean {
    return !!this.gl;
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default' });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
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
    for (const n of ['scene', 'res', 'buf', 'dxy', 'org', 'vs', 'zoom', 'ca', 'imp', 'impHi', 'impLo', 'vig', 'shock', 'shockC']) this.pu[n] = gl.getUniformLocation(this.post, n);
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

  add(l: Light): Light {
    if (!this.gl) return l;
    l.t = -(l.delay ?? 0);
    if (this.lights.length < 40) this.lights.push(l);
    return l;
  }

  shock(s: Shock): void {
    if (!this.gl) return;
    s.t = -(s.delay ?? 0);
    if (this.shocks.length >= MAX_SHOCKS) this.shocks.shift();
    this.shocks.push(s);
  }

  /** An anime impact frame: the whole picture flips to two-tone ink for a split second (real time). */
  impactFrame(hi: number, lo: number, len = 0.05): void {
    if (!this.gl || this.calm.matches) return;
    this.impact = { t: 0, len, hi, lo, flip: false };
  }

  /** The picture smears toward world (x, y) and settles (real time). */
  zoomBlur(x: number, y: number, k: number, life: number): void {
    if (!this.gl || this.calm.matches) return;
    this.zoomFx = { x, y, t: 0, life, k };
  }

  /** Colour fringes split away from the impact toward the screen's edges (real time). */
  split(k: number, life: number): void {
    if (!this.gl) return;
    this.caFx = { t: 0, life, k };
  }

  /** The screen's edges darken toward a colour (battle time). */
  vignette(color: number, k: number, life: number): void {
    if (!this.gl) return;
    this.vig = { t: 0, life, c: color, k };
  }

  clear(): void {
    this.lights.length = 0;
    this.shocks.length = 0;
    this.impact = this.zoomFx = this.caFx = this.vig = null;
    this.hide();
  }

  private hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.canvas.style.visibility = 'hidden';
  }

  private get busy(): boolean {
    return this.lights.length > 0 || this.shocks.length > 0 || !!this.impact || !!this.zoomFx || !!this.caFx || !!this.vig;
  }

  /**
   * Ages everything (`dt` battle time, `real` wall time) and, while anything
   * is alive, redraws the frame through the shaders. Call right after the
   * pixel screen is presented; `sx`/`sy` map world metres to buffer pixels.
   */
  render(dt: number, real: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const gl = this.gl;
    if (!gl) return;
    this.age(dt, real);
    if (!this.busy) { this.hide(); return; }
    const sc = this.screen, cv = this.canvas, src = sc.canvas;
    if (cv.width !== src.width || cv.height !== src.height) {
      cv.width = src.width;
      cv.height = src.height;
      cv.style.width = src.style.width;
      cv.style.height = src.style.height;
    }
    const { ox, oy, vs, dx, dy } = sc.mapping;
    const ppm = sx(1) - sx(0);
    const dev = (x: number, y: number): [number, number] => [(sx(x) - ox) * vs + dx, (sy(y) - oy) * vs + dy];
    const m = (metres: number) => metres * ppm * vs;
    const W = cv.width, H = cv.height;
    gl.viewport(0, 0, W, H);

    // The frame itself.
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sc.buffer);
    gl.useProgram(this.post);
    const u = this.pu;
    gl.uniform1i(u.scene, 0);
    gl.uniform2f(u.res, W, H);
    gl.uniform2f(u.buf, sc.w, sc.h);
    gl.uniform2f(u.dxy, dx, dy);
    gl.uniform2f(u.org, ox, oy);
    gl.uniform1f(u.vs, vs);
    const sh = new Float32Array(MAX_SHOCKS * 4), sc4 = new Float32Array(MAX_SHOCKS * 4);
    this.shocks.forEach((s, i) => {
      const k = s.t! / s.life;
      if (k < 0) return;
      const e = 1 - (1 - k) ** 3;
      const [px, py] = dev(s.x, s.y);
      sh.set([px, py, m(s.r) * (0.1 + 0.9 * e), s.amp * vs * (1 - k) ** 1.5], i * 4);
      const [r, g, b] = rgb(s.hi);
      sc4.set([r, g, b, Math.max(4, m(s.r) * 0.16 * (1 - k * 0.5))], i * 4);
    });
    gl.uniform4fv(u.shock, sh);
    gl.uniform4fv(u.shockC, sc4);
    const z = this.zoomFx;
    if (z) {
      const [px, py] = dev(z.x, z.y);
      gl.uniform4f(u.zoom, px, py, z.k * (1 - z.t / z.life) ** 2, 0);
    } else gl.uniform4f(u.zoom, W / 2, H / 2, 0, 0);
    gl.uniform1f(u.ca, this.caFx ? this.caFx.k * vs * (1 - this.caFx.t / this.caFx.life) ** 2 : 0);
    const im = this.impact;
    if (im) {
      const [hr, hg, hb] = rgb(im.hi), [lr, lg, lb] = rgb(im.lo);
      gl.uniform4f(u.imp, 0.94, im.flip ? 1 : 0, 0.5, 0);
      gl.uniform3f(u.impHi, hr, hg, hb);
      gl.uniform3f(u.impLo, lr, lg, lb);
    } else gl.uniform4f(u.imp, 0, 0, 0, 0);
    const vg = this.vig;
    if (vg) {
      const k = vg.t / vg.life, env = Math.min(1, k * 6) * (1 - Math.max(0, (k - 0.6) / 0.4));
      const [r, g, b] = rgb(vg.c);
      gl.uniform4f(u.vig, r, g, b, vg.k * env);
    } else gl.uniform4f(u.vig, 1, 1, 1, 0);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Light on top, added.
    if (this.lights.length && !im) {
      gl.useProgram(this.light);
      const l = this.lu;
      gl.uniform2f(l.res, W, H);
      gl.uniform2f(l.dxy, dx, dy);
      gl.uniform1f(l.vs, vs);
      gl.enable(gl.BLEND);
      // Screen blend: bright light adds up without blowing out what is already bright.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      for (const li of this.lights) {
        if (li.t! < 0) continue;
        const k = Math.min(1, li.t! / li.life);
        const e = 1 - (1 - k) ** 3;
        const fin = li.fin ?? 0.08;
        let pw = (li.power ?? 1) * Math.min(1, fin > 0 ? k / fin : 1) * (1 - k) ** 1.6;
        if (li.gone !== undefined) pw *= Math.max(0, 1 - li.gone / 0.2);
        if (pw <= 0.002) continue;
        const [px, py] = dev(li.x, li.y);
        const R = m(li.r0 + (li.r1 - li.r0) * e);
        gl.uniform1i(l.kind, KIND[li.kind]);
        gl.uniform2f(l.c, px, py);
        // Screen y points down: world angles flip.
        gl.uniform4f(l.a, R, m(li.w ?? 0.1), li.kind === 'arc' ? -(li.sweep ?? Math.PI) : (li.squash ?? 1), -(li.rot ?? 0));
        if (li.kind === 'arc') {
          // The head sweeps round in the first 45% of its life, the tail chases it.
          const head = Math.min(1, k / 0.45);
          const tail = Math.max(0, (k - 0.2) / 0.8) ** 0.8;
          gl.uniform4f(l.b, head, tail, 0, 0);
        } else gl.uniform4f(l.b, 0, 0, li.seed ?? 0, 0);
        gl.uniform3f(l.hi, ...rgb(li.hi));
        gl.uniform3f(l.lo, ...rgb(li.lo));
        gl.uniform1f(l.pw, pw);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    if (!this.shown) { this.shown = true; cv.style.visibility = 'visible'; }
  }

  private age(dt: number, real: number): void {
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.t! += l.real ? real : dt;
      if (l.follow && l.t! >= 0) {
        const at = l.gone === undefined ? l.follow() : null;
        if (at) { l.x = at[0]; l.y = at[1]; } else l.gone = (l.gone ?? 0) + dt;
      }
      if (l.t! >= l.life || (l.gone ?? 0) > 0.2) this.lights.splice(i, 1);
    }
    for (let i = this.shocks.length - 1; i >= 0; i--) if ((this.shocks[i].t! += dt) >= this.shocks[i].life) this.shocks.splice(i, 1);
    const im = this.impact;
    if (im) {
      im.t += real;
      im.flip = false;
      if (im.t >= im.len) this.impact = null;
    }
    if (this.zoomFx && (this.zoomFx.t += real) >= this.zoomFx.life) this.zoomFx = null;
    if (this.caFx && (this.caFx.t += real) >= this.caFx.life) this.caFx = null;
    if (this.vig && (this.vig.t += dt) >= this.vig.life) this.vig = null;
  }
}
