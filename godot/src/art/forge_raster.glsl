#[compute]
#version 450

// Sprite forge, pass 1: rasterizes recorded art ops (see px_raster.gd).
// One invocation per pixel of a frame's cell, one z slice per frame. Each
// pixel replays its frame's ops in order (last writer wins), exactly like
// the web game's Raster, and stores its final state for the compose pass.

layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

layout(set = 0, binding = 0, std430) restrict readonly buffer Ops { float ops[]; };
layout(set = 0, binding = 1, std430) restrict readonly buffer Frames { uint frames[]; };
layout(set = 0, binding = 2, std430) restrict readonly buffer Mats { uint mats[]; };
layout(set = 0, binding = 3, std430) restrict readonly buffer Tex { int tex[]; };
layout(set = 0, binding = 4, std430) restrict writeonly buffer State { uvec2 state[]; };
layout(set = 0, binding = 5, std430) restrict buffer Bounds { int bounds[]; };

// Frame record (uints): ops offset, ops length, cell x0, y0 (raster space), cell w, h,
// atlas x, y, state offset, phase.
#define FR 16
// Material record: ramp[5], ink, maxTone, minTone, glow, glowTone, shine, gleam, sparkle, tex offset, tex length.
#define MR 16

// Light from the upper front: (0.42, -0.72, 0.55) normalized.
const float LX = 0.42056815076451187, LY = -0.72097397273916319, LZ = 0.55074400695352754;
const float PI = 3.141592653589793;
#define INF uintBitsToFloat(0x7F800000u)
#define NAN uintBitsToFloat(0x7FC00000u)

const uint FLAG_GLOW = 1u, FLAG_NOLINE = 2u;
// Groups (sprite/draw.ts G).
const uint G_TAIL = 10u, G_CAPE = 12u, G_SMEAR = 15u;

float jsmod(float a, float b) { return a - b * trunc(a / b); }

// -----------------------------------------------------------------------------
// Shapes (px_sdf.gd): postfix programs over a value stack.
// -----------------------------------------------------------------------------

float sdf(uint pc, uint end, float x, float y) {
	float st[32];
	int sp = 0;
	while (pc < end) {
		int op = int(ops[pc]);
		if (op == 1) { // circle
			float dx = x - ops[pc + 1], dy = y - ops[pc + 2];
			st[sp++] = sqrt(dx * dx + dy * dy) - ops[pc + 3];
			pc += 4u;
		} else if (op == 2) { // capsule
			float ax = ops[pc + 1], ay = ops[pc + 2];
			float dx = ops[pc + 3] - ax, dy = ops[pc + 4] - ay;
			float ra = ops[pc + 5], rb = ops[pc + 6];
			float l2 = dx * dx + dy * dy;
			if (l2 == 0.0) l2 = 1e-6;
			float t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0.0, 1.0);
			float qx = x - (ax + dx * t), qy = y - (ay + dy * t);
			st[sp++] = sqrt(qx * qx + qy * qy) - (ra + (rb - ra) * t);
			pc += 7u;
		} else if (op == 3) { // ellipse
			float px = x - ops[pc + 1], py = y - ops[pc + 2];
			float c = ops[pc + 5], s = ops[pc + 6];
			float lx = (px * c + py * s) / ops[pc + 3], ly = (-px * s + py * c) / ops[pc + 4];
			st[sp++] = (sqrt(lx * lx + ly * ly) - 1.0) * ops[pc + 7];
			pc += 8u;
		} else if (op == 4) { // polygon
			uint n = uint(ops[pc + 1]);
			float rnd = ops[pc + 2];
			uint b = pc + 3u;
			float d = (x - ops[b]) * (x - ops[b]) + (y - ops[b + 1]) * (y - ops[b + 1]);
			float sgn = 1.0;
			uint j = n - 1u;
			for (uint i = 0u; i < n; i++) {
				float vix = ops[b + i * 2u], viy = ops[b + i * 2u + 1u];
				float vjx = ops[b + j * 2u], vjy = ops[b + j * 2u + 1u];
				float ex = vjx - vix, ey = vjy - viy;
				float wx = x - vix, wy = y - viy;
				float el = ex * ex + ey * ey;
				if (el == 0.0) el = 1e-6;
				float t = clamp((wx * ex + wy * ey) / el, 0.0, 1.0);
				float bx = wx - ex * t, by = wy - ey * t;
				d = min(d, bx * bx + by * by);
				bool c1 = y >= viy, c2 = y < vjy, c3 = ex * wy > ey * wx;
				if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sgn = -sgn;
				j = i;
			}
			st[sp++] = sgn * sqrt(d) - rnd;
			pc += 3u + n * 2u;
		} else if (op == 5) { // box
			float px = x - ops[pc + 1], py = y - ops[pc + 2];
			float c = ops[pc + 5], s = ops[pc + 6], rnd = ops[pc + 7];
			float lx = abs(px * c + py * s) - ops[pc + 3] + rnd;
			float ly = abs(-px * s + py * c) - ops[pc + 4] + rnd;
			float mx = max(lx, 0.0), my = max(ly, 0.0);
			st[sp++] = sqrt(mx * mx + my * my) + min(max(lx, ly), 0.0) - rnd;
			pc += 8u;
		} else if (op == 6) { // arc
			float px = x - ops[pc + 1], py = y - ops[pc + 2];
			float r = sqrt(px * px + py * py);
			float a = atan(py, px) - ops[pc + 5];
			a = jsmod(jsmod(a + PI, PI * 2.0) + PI * 2.0, PI * 2.0) - PI;
			float radial = max(ops[pc + 3] - r, r - ops[pc + 4]);
			float angular = (abs(a) - ops[pc + 6]) * max(r, 1.0);
			st[sp++] = max(radial, angular);
			pc += 7u;
		} else if (op == 7) { // half plane
			st[sp++] = (x - ops[pc + 1]) * ops[pc + 3] + (y - ops[pc + 2]) * ops[pc + 4];
			pc += 5u;
		} else if (op == 8) { // union
			int k = int(ops[pc + 1]);
			float d = INF;
			for (int i = 0; i < k; i++) { float v = st[--sp]; if (v < d) d = v; }
			st[sp++] = d;
			pc += 2u;
		} else if (op == 9) { // smooth union
			float kk = ops[pc + 1];
			int k = int(ops[pc + 2]);
			int base = sp - k;
			float d = st[base];
			for (int i = 1; i < k; i++) {
				float b = st[base + i];
				float h = max(kk - abs(d - b), 0.0) / kk;
				d = min(d, b) - h * h * kk * 0.25;
			}
			sp = base;
			st[sp++] = d;
			pc += 3u;
		} else if (op == 10) { // subtract
			float b = st[--sp];
			float a = st[--sp];
			st[sp++] = max(a, -b);
			pc += 1u;
		} else if (op == 11) { // intersect
			float b = st[--sp];
			float a = st[--sp];
			st[sp++] = max(a, b);
			pc += 1u;
		} else {
			return 1.0;
		}
	}
	return sp > 0 ? st[0] : 1.0;
}

// -----------------------------------------------------------------------------
// Textures (tx.gd): register bytecode, JS number semantics.
// -----------------------------------------------------------------------------

bool truthy(float v) { return v != 0.0 && !isnan(v); }

int i32(float v) {
	if (isnan(v) || isinf(v)) return 0;
	v = trunc(v);
	if (abs(v) < 2147483648.0) return int(v);
	v = v - 4294967296.0 * floor(v / 4294967296.0);
	return int(uint(v));
}

float jspow(float a, float b) {
	if (b == 0.0) return 1.0;
	if (a == 0.0) return b > 0.0 ? 0.0 : INF;
	if (a < 0.0) {
		if (b != floor(b)) return NAN;
		float m = pow(-a, b);
		return jsmod(b, 2.0) != 0.0 ? -m : m;
	}
	return pow(a, b);
}

float hash2(float x, float y) {
	uint h = uint(i32(x)) * 374761393u + uint(i32(y)) * 668265263u;
	h = (h ^ (h >> 13)) * 1274126177u;
	h = h ^ (h >> 16);
	return float(h) / 4294967296.0;
}

float texture_at(int pc, float x, float y, float ph) {
	float r[48];
	r[0] = x;
	r[1] = y;
	r[2] = ph;
	for (int guard = 0; guard < 8192; guard++) {
		int w0 = tex[pc];
		int w1 = tex[pc + 1];
		pc += 2;
		int op = w0 & 255;
		int dst = (w0 >> 8) & 255;
		if (op == 1) {
			if (dst == 255) return r[w1];
			r[dst] = intBitsToFloat(w1);
			continue;
		}
		float a = r[(w0 >> 16) & 255];
		float b = r[(w0 >> 24) & 255];
		float v = 0.0;
		switch (op) {
			case 2: v = a + b; break;
			case 3: v = a - b; break;
			case 4: v = a * b; break;
			case 5: v = a / b; break;
			case 6: v = jsmod(a, b); break;
			case 7: v = jspow(a, b); break;
			case 8: v = -a; break;
			case 9: v = a < b ? 1.0 : 0.0; break;
			case 10: v = a <= b ? 1.0 : 0.0; break;
			case 11: v = a > b ? 1.0 : 0.0; break;
			case 12: v = a >= b ? 1.0 : 0.0; break;
			case 13: v = a == b ? 1.0 : 0.0; break;
			case 14: v = a != b ? 1.0 : 0.0; break;
			case 15: v = truthy(a) ? b : a; break;
			case 16: v = truthy(a) ? a : b; break;
			case 17: v = truthy(a) ? 0.0 : 1.0; break;
			case 18: v = truthy(a) ? b : r[w1]; break;
			case 19: v = floor(a); break;
			case 20: v = ceil(a); break;
			case 21: v = floor(a + 0.5); break;
			case 22: v = trunc(a); break;
			case 23: v = abs(a); break;
			case 24: v = sign(a); break;
			case 25: v = sqrt(a); break;
			case 26: v = sin(a); break;
			case 27: v = cos(a); break;
			case 28: v = tan(a); break;
			case 29: v = atan(a); break;
			case 30: v = atan(a, b); break;
			case 31: v = exp(a); break;
			case 32: v = min(a, b); break;
			case 33: v = max(a, b); break;
			case 34: v = sqrt(a * a + b * b); break;
			case 35: v = float(i32(a) & i32(b)); break;
			case 36: v = float(i32(a) | i32(b)); break;
			case 37: v = float(i32(a) ^ i32(b)); break;
			case 38: v = float(i32(a) << (i32(b) & 31)); break;
			case 39: v = float(i32(a) >> (i32(b) & 31)); break;
			case 40: v = float(uint(i32(a)) >> uint(i32(b) & 31)); break;
			case 41: v = float(int(uint(i32(a)) * uint(i32(b)))); break;
			case 42: v = float(~i32(a)); break;
			case 43: v = hash2(a, b); break;
			case 44: {
				int n = w1;
				v = NAN;
				if (a == floor(a) && a >= 0.0 && a < float(n)) v = intBitsToFloat(tex[pc + int(a)]);
				pc += n;
				break;
			}
			default: return 0.0;
		}
		r[dst] = v;
	}
	return 0.0;
}

// -----------------------------------------------------------------------------
// Rasterization
// -----------------------------------------------------------------------------

void main() {
	uint fi = gl_GlobalInvocationID.z;
	uint fb = fi * FR;
	uint cw = frames[fb + 4], ch = frames[fb + 5];
	uint lx = gl_GlobalInvocationID.x, ly = gl_GlobalInvocationID.y;
	if (lx >= cw || ly >= ch) return;
	int px = int(frames[fb + 2] + lx), py = int(frames[fb + 3] + ly);
	float cx = float(px) + 0.5, cy = float(py) + 0.5;
	float phase = uintBitsToFloat(frames[fb + 9]);

	uint mat = 0u, tone = 0u, group = 0u, order = 0u, flags = 0u;
	uint pc = frames[fb];
	uint end = pc + frames[fb + 1];
	while (pc < end) {
		uint kind = uint(ops[pc]);
		uint len = uint(ops[pc + 1]);
		uint next = pc + len;
		if (px < int(ops[pc + 2]) || py < int(ops[pc + 3]) || px > int(ops[pc + 4]) || py > int(ops[pc + 5])) { pc = next; continue; }
		if (kind == 1u) {
			// fill: [.., mat, group, order, flags, bevel, toneBias, lightBias, flat_t, soft, has, a, b, c, d, e, f, shapeLen, shape..]
			uint s0 = pc + 23u;
			float d = sdf(s0, next, cx, cy);
			if (d < 0.0) {
				uint m = uint(ops[pc + 6]);
				uint mb = m * MR;
				bool glow = mats[mb + 8] != 0u;
				float maxT = float(mats[mb + 6]), minT = float(mats[mb + 7]);
				float t;
				float flat_t = ops[pc + 13];
				if (glow) t = uintBitsToFloat(mats[mb + 9]);
				else if (flat_t >= 0.0) t = flat_t;
				else {
					float e = 0.5;
					float gx = sdf(s0, next, cx + e, cy) - sdf(s0, next, cx - e, cy);
					float gy = sdf(s0, next, cx, cy + e) - sdf(s0, next, cx, cy - e);
					float gl = sqrt(gx * gx + gy * gy);
					if (gl == 0.0) gl = 1.0;
					float s = clamp(1.0 + d / ops[pc + 10], 0.0, 1.0);
					float nx = (gx / gl) * s, ny = (gy / gl) * s, nz = sqrt(1.0 - s * s);
					bool soft = ops[pc + 14] != 0.0;
					float lam = (soft ? 0.0 : nx * LX) + ny * LY + nz * LZ + ops[pc + 12];
					if (soft) lam += 0.08;
					t = lam > 0.86 ? 4.0 : lam > 0.6 ? 3.0 : lam > 0.24 ? 2.0 : lam > -0.12 ? 1.0 : 0.0;
				}
				t += ops[pc + 11];
				if (t > maxT && !glow) t = maxT;
				if (t < minT) t = minT;
				uint toff = mats[mb + 14];
				if (mats[mb + 15] != 0u) {
					float tx = cx, ty = cy;
					if (ops[pc + 15] != 0.0) {
						tx = ops[pc + 16] * cx + ops[pc + 17] * cy + ops[pc + 18];
						ty = ops[pc + 19] * cx + ops[pc + 20] * cy + ops[pc + 21];
					}
					t += texture_at(int(toff), tx, ty, phase);
				}
				if (t < 0.0) t = 0.0;
				if (t > 4.0) t = 4.0;
				// Uint8Array store: NaN → 0, fractions truncate.
				tone = isnan(t) ? 0u : uint(t);
				mat = m + 1u;
				group = uint(ops[pc + 7]);
				order = uint(ops[pc + 8]);
				flags = (glow ? FLAG_GLOW : 0u) | uint(ops[pc + 9]);
			}
		} else if (kind == 2u) {
			// dot: [.., mat, tone, group (-1 = none), order]  (bounds = the pixel)
			uint m = uint(ops[pc + 6]);
			float t = ops[pc + 7];
			float g = ops[pc + 8];
			mat = m + 1u;
			tone = isnan(t) ? 0u : uint(clamp(t, 0.0, 4.0));
			if (g >= 0.0 || group == 0u) group = g >= 0.0 ? uint(g) : 1u;
			if (order == 0u) order = uint(ops[pc + 9]);
			flags = mats[m * MR + 8] != 0u ? FLAG_GLOW : FLAG_NOLINE;
		} else if (kind == 3u) {
			// erase: [.., groupMask, shapeLen, shape..]
			if (mat != 0u && ((uint(ops[pc + 6]) >> group) & 1u) != 0u && sdf(pc + 8u, next, cx, cy) < 0.0) {
				mat = 0u;
				order = 0u;
			}
		} else if (kind == 4u) {
			// smear: [.., mat, dim, order, cx, cy, from, span, tip, reach, legend, shapeLen, shape..]
			if (sdf(pc + 17u, next, cx, cy) < 0.0 && !(mat != 0u && group != G_SMEAR && order > 0u && group != G_CAPE && group != G_TAIL)) {
				float ox = ops[pc + 9], oy = ops[pc + 10];
				float from = ops[pc + 11], span = ops[pc + 12], tip = ops[pc + 13], reach = ops[pc + 14];
				bool legend = ops[pc + 15] != 0.0;
				float a = -atan(cy - oy, cx - ox);
				float u = span == 0.0 ? 1.0 : (a - from) / span;
				u = jsmod(jsmod(u, 1.0) + 1.0, 1.0);
				float dx = cx - ox, dy = cy - oy;
				float rr = sqrt(dx * dx + dy * dy);
				float thick = tip * (0.08 + 0.62 * u * u);
				float depth = reach + 0.5 - rr;
				bool skip = depth > thick || u < 0.12 || (u < (legend ? 0.3 : 0.45) && ((px + py) & 1) != 0);
				if (!skip) {
					uint m = depth < (legend ? 3.4 : 2.2) && u > 0.35 ? uint(ops[pc + 6]) : uint(ops[pc + 7]);
					mat = m + 1u;
					tone = 3u;
					group = G_SMEAR;
					if (order == 0u) order = uint(ops[pc + 8]);
					flags = mats[m * MR + 8] != 0u ? FLAG_GLOW : FLAG_NOLINE;
				}
			}
		} else if (kind == 5u) {
			// ring: [.., mat, dim, order, cx, cy, rx, ry]
			float u = (cx - ops[pc + 9]) / ops[pc + 11], v = (cy - ops[pc + 10]) / ops[pc + 12];
			float d = u * u + v * v;
			bool skip = d > 1.0 || d < 0.55 || (mat != 0u && order > 0u && group != G_SMEAR) || (d < 0.7 && ((px + py) & 1) != 0);
			if (!skip) {
				uint m = d > 0.82 && v > 0.0 ? uint(ops[pc + 6]) : uint(ops[pc + 7]);
				mat = m + 1u;
				tone = 3u;
				group = G_SMEAR;
				if (order == 0u) order = uint(ops[pc + 8]);
				flags = mats[m * MR + 8] != 0u ? FLAG_GLOW : FLAG_NOLINE;
			}
		}
		pc = next;
	}
	uint si = frames[fb + 8] + ly * cw + lx;
	state[si] = uvec2(mat | (order << 16), tone | (group << 8) | (flags << 16));
	if (mat != 0u) {
		atomicMin(bounds[fi * 4u], px);
		atomicMin(bounds[fi * 4u + 1u], py);
		atomicMax(bounds[fi * 4u + 2u], px);
		atomicMax(bounds[fi * 4u + 3u], py);
	}
}
