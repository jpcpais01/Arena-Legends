class_name PixelSdf
## 2D signed distance shapes in pixel space (negative inside), as data.
## The web game builds shapes as closures; here each shape is a small
## postfix program that the forge's compute shader evaluates per pixel
## (forge_raster.glsl). `sdf` still evaluates on the CPU for the few
## places that test single points.

# Opcodes, shared with forge_raster.glsl.
enum { S_CIRCLE = 1, S_CAPSULE, S_ELLIPSE, S_POLY, S_BOX, S_ARC, S_HALF, S_UNION, S_BLEND, S_SUB, S_INTER }


class Shape extends RefCounted:
	var code: PackedFloat32Array
	## Conservative bounds in pixels: {x0, y0, x1, y1}.
	var box: Dictionary
	var sdf: Callable

	func _init(c: PackedFloat32Array, b: Dictionary) -> void:
		code = c
		box = b
		sdf = eval_at

	func eval_at(x: float, y: float) -> float:
		return PixelSdf.eval(code, x, y)

	static func from_dict(d: Dictionary) -> Shape:
		push_error("PixelSdf.Shape.from_dict: custom shapes must be ported by hand")
		return Shape.new(PackedFloat32Array(), d.get("box", {}))


static func _box(x0: float, y0: float, x1: float, y1: float) -> Dictionary:
	return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


static func circle(cx: float, cy: float, r: float) -> Shape:
	return Shape.new(PackedFloat32Array([S_CIRCLE, cx, cy, r]), _box(cx - r, cy - r, cx + r, cy + r))


## Segment a→b whose radius goes from ra to rb (limbs, blades, shafts).
static func capsule(ax: float, ay: float, bx: float, by: float, ra: float, rb = null) -> Shape:
	var rb_: float = ra if rb == null else rb
	var m := maxf(ra, rb_)
	return Shape.new(PackedFloat32Array([S_CAPSULE, ax, ay, bx, by, ra, rb_]),
		_box(minf(ax, bx) - m, minf(ay, by) - m, maxf(ax, bx) + m, maxf(ay, by) + m))


## Ellipse with radii rx, ry rotated by `rot` radians (approximate distance, exact sign).
static func ellipse(cx: float, cy: float, rx: float, ry: float, rot: float = 0.0) -> Shape:
	var m := maxf(rx, ry)
	var k := minf(rx, ry)
	return Shape.new(PackedFloat32Array([S_ELLIPSE, cx, cy, rx, ry, cos(rot), sin(rot), k]), _box(cx - m, cy - m, cx + m, cy + m))


## Exact polygon distance (any simple polygon), points as flat [x0, y0, x1, y1, ...].
static func polygon(pts: Array, round_: float = 0.0) -> Shape:
	var n := pts.size() / 2
	var x0 := INF
	var y0 := INF
	var x1 := -INF
	var y1 := -INF
	var code := PackedFloat32Array([S_POLY, n, round_])
	code.resize(3 + n * 2)
	for i in n:
		var x: float = pts[i * 2]
		var y: float = pts[i * 2 + 1]
		code[3 + i * 2] = x
		code[4 + i * 2] = y
		if x < x0: x0 = x
		if x > x1: x1 = x
		if y < y0: y0 = y
		if y > y1: y1 = y
	return Shape.new(code, _box(x0 - round_, y0 - round_, x1 + round_, y1 + round_))


## Rotated box centred at (cx, cy) with half extents hx, hy and corner rounding.
static func box(cx: float, cy: float, hx: float, hy: float, rot: float = 0.0, round_: float = 0.0) -> Shape:
	var m := sqrt(hx * hx + hy * hy) + round_
	return Shape.new(PackedFloat32Array([S_BOX, cx, cy, hx, hy, cos(rot), sin(rot), round_]), _box(cx - m, cy - m, cx + m, cy + m))


## Ring sector around (cx, cy) between radii r0 and r1, from angle a0 to a1.
static func arc(cx: float, cy: float, r0: float, r1: float, a0: float, a1: float) -> Shape:
	var lo := minf(a0, a1)
	var hi := maxf(a0, a1)
	return Shape.new(PackedFloat32Array([S_ARC, cx, cy, r0, r1, (lo + hi) / 2.0, (hi - lo) / 2.0]), _box(cx - r1, cy - r1, cx + r1, cy + r1))


static func union(...shapes: Array) -> Shape:
	return union_of(shapes)


static func union_of(shapes: Array) -> Shape:
	if shapes.size() == 1: return shapes[0]
	var code := PackedFloat32Array()
	var b := _box(INF, INF, -INF, -INF)
	for s: Shape in shapes:
		code.append_array(s.code)
		_grow(b, s.box)
	code.append_array([S_UNION, shapes.size()])
	return Shape.new(code, b)


static func _grow(b: Dictionary, s: Dictionary) -> void:
	b["x0"] = minf(b["x0"], s["x0"])
	b["y0"] = minf(b["y0"], s["y0"])
	b["x1"] = maxf(b["x1"], s["x1"])
	b["y1"] = maxf(b["y1"], s["y1"])


## Smooth union (blends shapes into one mass: torsos, muscles).
static func blend(k: float, ...shapes: Array) -> Shape:
	return blend_of(k, shapes)


static func blend_of(k: float, shapes: Array) -> Shape:
	var code := PackedFloat32Array()
	var b := _box(INF, INF, -INF, -INF)
	for s: Shape in shapes:
		code.append_array(s.code)
		_grow(b, s.box)
	code.append_array([S_BLEND, k, shapes.size()])
	return Shape.new(code, _box(b["x0"] - k, b["y0"] - k, b["x1"] + k, b["y1"] + k))


## `a` with `b` carved out.
static func subtract(a: Shape, b: Shape) -> Shape:
	var code := a.code.duplicate()
	code.append_array(b.code)
	code.append(S_SUB)
	return Shape.new(code, a.box)


static func intersect(a: Shape, b: Shape) -> Shape:
	var code := a.code.duplicate()
	code.append_array(b.code)
	code.append(S_INTER)
	return Shape.new(code, _box(maxf(a.box["x0"], b.box["x0"]), maxf(a.box["y0"], b.box["y0"]),
		minf(a.box["x1"], b.box["x1"]), minf(a.box["y1"], b.box["y1"])))


## Half-plane keeping the side the normal (nx, ny) points away from, through (px, py).
static func half_plane(px: float, py: float, nx: float, ny: float) -> Shape:
	var l := sqrt(nx * nx + ny * ny)
	if l == 0.0: l = 1.0
	return half_plane_box(px, py, nx / l, ny / l, _box(-1e4, -1e4, 1e4, 1e4))


## Half-plane with a unit normal and explicit bounds (the web game's hand-made half shapes).
static func half_plane_box(px: float, py: float, ux: float, uy: float, b: Dictionary) -> Shape:
	return Shape.new(PackedFloat32Array([S_HALF, px, py, ux, uy]), b)


# -----------------------------------------------------------------------------
# CPU evaluation (same maths as the shader)
# -----------------------------------------------------------------------------

static func eval(code: PackedFloat32Array, x: float, y: float) -> float:
	var st: Array[float] = []
	var pc := 0
	var n := code.size()
	while pc < n:
		var op := int(code[pc])
		match op:
			S_CIRCLE:
				var dx := x - code[pc + 1]
				var dy := y - code[pc + 2]
				st.append(sqrt(dx * dx + dy * dy) - code[pc + 3])
				pc += 4
			S_CAPSULE:
				var ax := code[pc + 1]
				var ay := code[pc + 2]
				var dx := code[pc + 3] - ax
				var dy := code[pc + 4] - ay
				var ra := code[pc + 5]
				var rb := code[pc + 6]
				var l2 := dx * dx + dy * dy
				if l2 == 0.0: l2 = 1e-6
				var t := clampf(((x - ax) * dx + (y - ay) * dy) / l2, 0.0, 1.0)
				var qx := x - (ax + dx * t)
				var qy := y - (ay + dy * t)
				st.append(sqrt(qx * qx + qy * qy) - (ra + (rb - ra) * t))
				pc += 7
			S_ELLIPSE:
				var px := x - code[pc + 1]
				var py := y - code[pc + 2]
				var c := code[pc + 5]
				var s := code[pc + 6]
				var lx := (px * c + py * s) / code[pc + 3]
				var ly := (-px * s + py * c) / code[pc + 4]
				st.append((sqrt(lx * lx + ly * ly) - 1.0) * code[pc + 7])
				pc += 8
			S_POLY:
				var m := int(code[pc + 1])
				var rnd := code[pc + 2]
				var b := pc + 3
				var d := (x - code[b]) * (x - code[b]) + (y - code[b + 1]) * (y - code[b + 1])
				var sgn := 1.0
				var j := m - 1
				for i in m:
					var vix := code[b + i * 2]
					var viy := code[b + i * 2 + 1]
					var vjx := code[b + j * 2]
					var vjy := code[b + j * 2 + 1]
					var ex := vjx - vix
					var ey := vjy - viy
					var wx := x - vix
					var wy := y - viy
					var el := ex * ex + ey * ey
					if el == 0.0: el = 1e-6
					var t := clampf((wx * ex + wy * ey) / el, 0.0, 1.0)
					var bx := wx - ex * t
					var by := wy - ey * t
					d = minf(d, bx * bx + by * by)
					var c1 := y >= viy
					var c2 := y < vjy
					var c3 := ex * wy > ey * wx
					if (c1 and c2 and c3) or (not c1 and not c2 and not c3): sgn = -sgn
					j = i
				st.append(sgn * sqrt(d) - rnd)
				pc += 3 + m * 2
			S_BOX:
				var px := x - code[pc + 1]
				var py := y - code[pc + 2]
				var c := code[pc + 5]
				var s := code[pc + 6]
				var rnd := code[pc + 7]
				var lx := absf(px * c + py * s) - code[pc + 3] + rnd
				var ly := absf(-px * s + py * c) - code[pc + 4] + rnd
				var mx := maxf(lx, 0.0)
				var my := maxf(ly, 0.0)
				st.append(sqrt(mx * mx + my * my) + minf(maxf(lx, ly), 0.0) - rnd)
				pc += 8
			S_ARC:
				var px := x - code[pc + 1]
				var py := y - code[pc + 2]
				var r := sqrt(px * px + py * py)
				var a := atan2(py, px) - code[pc + 5]
				a = fmod(fmod(a + PI, TAU) + TAU, TAU) - PI
				var radial := maxf(code[pc + 3] - r, r - code[pc + 4])
				var angular := (absf(a) - code[pc + 6]) * maxf(r, 1.0)
				st.append(maxf(radial, angular))
				pc += 7
			S_HALF:
				st.append((x - code[pc + 1]) * code[pc + 3] + (y - code[pc + 2]) * code[pc + 4])
				pc += 5
			S_UNION:
				var k := int(code[pc + 1])
				var d := INF
				for i in k:
					d = minf(d, st.pop_back())
				st.append(d)
				pc += 2
			S_BLEND:
				var kk := code[pc + 1]
				var k := int(code[pc + 2])
				var vals: Array[float] = []
				vals.resize(k)
				for i in range(k - 1, -1, -1):
					vals[i] = st.pop_back()
				var d := vals[0]
				for i in range(1, k):
					var bb := vals[i]
					var h := maxf(kk - absf(d - bb), 0.0) / kk
					d = minf(d, bb) - h * h * kk * 0.25
				st.append(d)
				pc += 3
			S_SUB:
				var bb: float = st.pop_back()
				var aa: float = st.pop_back()
				st.append(maxf(aa, -bb))
				pc += 1
			S_INTER:
				var bb: float = st.pop_back()
				var aa: float = st.pop_back()
				st.append(maxf(aa, bb))
				pc += 1
			_:
				push_error("PixelSdf.eval: bad op %d" % op)
				return 1.0
	return st[0] if st.size() else 1.0
