
# Hand-tuned (typed int maths, no calls): the arena painters' noise runs per pixel.
static func _h(x: int, y: int, s: int) -> float:
	var h: int = ((((x & 0xFFFFFFFF) * 374761393) & 0xFFFFFFFF) + (((y & 0xFFFFFFFF) * 668265263) & 0xFFFFFFFF) + (((s & 0xFFFFFFFF) * 1442695041) & 0xFFFFFFFF)) & 0xFFFFFFFF
	h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
	return float(h ^ (h >> 16)) / 4294967296.0

static func hash_(x: float, y: float, s: float) -> float:
	return _h(int(x), int(y), int(s))

##  Smooth value noise in 0..1, with separate cell sizes per axis.
static func noise(x: float, y: float, cx: float, cy: float, s: float) -> float:
	var gx: float = x / cx
	var gy: float = y / cy if cy > 0 else 0.0
	var fx: float = floor(gx)
	var fy: float = floor(gy)
	var ix := int(fx)
	var iy := int(fy)
	var si := int(s)
	fx = gx - fx
	fy = gy - fy
	var ux: float = fx * fx * (3 - 2 * fx)
	var uy: float = fy * fy * (3 - 2 * fy)
	var a := _h(ix, iy, si)
	var b := _h(ix + 1, iy, si)
	var c := _h(ix, iy + 1, si)
	var d := _h(ix + 1, iy + 1, si)
	return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy

##  Picks a tone from a dark→light palette for lightness `l`, dithered at band edges.
static func tone(pal, l: float, x: float, y: float, spread = 0.18) -> float:
	if spread == null: spread = 0.18
	var t: float = l + (PixelPaint._BAYER_T[((int(y) & 3) << 2) | (int(x) & 3)] - 0.5) * spread
	var n: int = pal.size()
	var i := int(floor(t * n))
	return pal[0 if i < 0 else (n - 1 if i > n - 1 else i)]
