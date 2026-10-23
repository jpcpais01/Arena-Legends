#[compute]
#version 450

// Sprite forge, pass 2: composes rasterized pixels into atlas cells, as the
// web game's Raster.compose does: tones to ramp colours, contour lines where
// a part sits behind a different front part, the ink outline around the
// silhouette, and the night accents layer (alpha = strength).

layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

layout(set = 0, binding = 0, std430) restrict readonly buffer Frames { uint frames[]; };
layout(set = 0, binding = 1, std430) restrict readonly buffer Mats { uint mats[]; };
layout(set = 0, binding = 2, std430) restrict readonly buffer State { uvec2 state[]; };
layout(set = 0, binding = 3, rgba8) restrict uniform writeonly image2D color_out;
layout(set = 0, binding = 4, rgba8) restrict uniform writeonly image2D glow_out;
layout(set = 0, binding = 5, std430) restrict buffer Sparks { uint sparks[]; };

#define FR 16
#define MR 16
#define SPARKS 256u

const uint FLAG_GLOW = 1u, FLAG_NOLINE = 2u;

vec4 rgb(uint c, float a) {
	return vec4(float((c >> 16) & 255u), float((c >> 8) & 255u), float(c & 255u), a) / 255.0;
}

uvec2 at(uint base, int x, int y, int w, int h) {
	if (x < 0 || y < 0 || x >= w || y >= h) return uvec2(0u);
	return state[base + uint(y * w + x)];
}

// A neighbour drawn later, of another group, that may cast a contour line.
bool front_of(uvec2 n, uint o, uint g) {
	uint nf = (n.y >> 16) & 255u;
	return (n.x & 65535u) != 0u && (n.x >> 16) > o && ((n.y >> 8) & 255u) != g && (nf & (FLAG_NOLINE | FLAG_GLOW)) == 0u;
}

void main() {
	uint fi = gl_GlobalInvocationID.z;
	uint fb = fi * FR;
	int cw = int(frames[fb + 4]), ch = int(frames[fb + 5]);
	int lx = int(gl_GlobalInvocationID.x), ly = int(gl_GlobalInvocationID.y);
	if (lx >= cw || ly >= ch) return;
	uint base = frames[fb + 8];
	bool outline = frames[fb + 10] != 0u;
	bool night = frames[fb + 11] != 0u;
	ivec2 dst = ivec2(int(frames[fb + 6]) + lx, int(frames[fb + 7]) + ly);

	uvec2 s = state[base + uint(ly * cw + lx)];
	uint mat = s.x & 65535u;
	vec4 col = vec4(0.0);
	vec4 glw = vec4(0.0);
	if (mat != 0u) {
		uint mb = (mat - 1u) * MR;
		uint o = s.x >> 16;
		uint t = s.y & 255u;
		uint g = (s.y >> 8) & 255u;
		uint f = (s.y >> 16) & 255u;
		bool line = false;
		if ((f & FLAG_GLOW) == 0u) {
			line = front_of(at(base, lx - 1, ly, cw, ch), o, g) || front_of(at(base, lx + 1, ly, cw, ch), o, g) ||
				front_of(at(base, lx, ly - 1, cw, ch), o, g) || front_of(at(base, lx, ly + 1, cw, ch), o, g);
		}
		if (line) {
			// Contour line: the deepest tone pulled toward the ink.
			uint a = mats[mb], b = mats[mb + 5];
			uint r = (((a >> 16) & 255u) + ((b >> 16) & 255u)) >> 1;
			uint gg = (((a >> 8) & 255u) + ((b >> 8) & 255u)) >> 1;
			uint bl = ((a & 255u) + (b & 255u)) >> 1;
			col = rgb((r << 16) | (gg << 8) | bl, 255.0);
		} else {
			col = rgb(mats[mb + t], 255.0);
			if (night) {
				bool glow = mats[mb + 8] != 0u;
				uint maxT = mats[mb + 6];
				float e = glow || (t == 4u && maxT < 4u) ? uintBitsToFloat(mats[mb + 10]) : t == 4u ? uintBitsToFloat(mats[mb + 11]) : 0.0;
				if (e > 0.0) {
					glw = rgb(mats[mb + t], floor(e * 255.0 + 0.5));
					if (mats[mb + 12] != 0u && t >= 3u) {
						uint k = atomicAdd(sparks[fi * SPARKS], 1u);
						if (k < SPARKS - 1u) sparks[fi * SPARKS + 1u + k] = uint(ly * cw + lx);
					}
				}
			}
		}
	} else if (outline) {
		// Ink outline: the colour of the frontmost solid neighbour.
		int best = -1;
		uint bo = 0u;
		bool found = false;
		ivec2 nb[4] = ivec2[4](ivec2(-1, 0), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1));
		for (int k = 0; k < 4; k++) {
			uvec2 n = at(base, lx + nb[k].x, ly + nb[k].y, cw, ch);
			uint nm = n.x & 65535u;
			if (nm != 0u && ((n.y >> 16) & FLAG_GLOW) == 0u && (!found || (n.x >> 16) > bo)) {
				found = true;
				bo = n.x >> 16;
				best = int(nm);
			}
		}
		if (found) col = rgb(mats[uint(best - 1) * MR + 5], 255.0);
	}
	imageStore(color_out, dst, col);
	imageStore(glow_out, dst, glw);
}
