class_name PixelRaster
## The pixel-art rasterizer's front half. Art code draws into a Raster
## exactly as in the web game (fill shapes with materials, dots, lines), but
## nothing is rasterized here: each call is recorded into a compact op
## stream. `compose()` closes a frame; the GPU forge (forge.gd) rasterizes
## all frames of a job in one compute dispatch, with the same lighting
## ramps, contour lines, ink outlines and night accents.

enum { OP_FILL = 1, OP_DOT, OP_ERASE, OP_SMEAR, OP_RING }

const FLAG_NOLINE := 2

## Five tones: deep shadow, shadow, base, light, highlight (0xRRGGBB).
static func material(spec: Dictionary) -> Dictionary:
	var r = spec.get("ramp")
	if r == null: r = PixelColor.ramp(spec["base"], {"step": spec.get("step")})
	var ink = spec.get("ink")
	return {
		"ramp": r,
		"maxTone": 4 if spec.get("shiny", false) else 3,
		"minTone": spec.get("minTone", 0) if spec.get("minTone") != null else 0,
		"ink": ink if ink != null else PixelColor.ink_for(r[0]),
		"glow": TS.truthy(spec.get("glow")),
		"glowTone": 3,
		"tex": spec.get("tex"),
		"shine": 0.0,
		"gleam": 0.0,
		"sparkle": false,
	}


## Materials of one forge job, deduplicated by content. Each gets a fixed
## slot in the GPU material table; textures compile once per closure.
class Registry extends RefCounted:
	var mats: Array[Dictionary] = []
	var _index := {}
	## Compiled texture code, appended per material (offset, length in words).
	var tex_code := PackedInt32Array()
	var _tex_at := {}

	## Source dictionaries, parallel to `mats` (dedupe compares contents).
	var _src: Array[Dictionary] = []

	func index_of(m: Dictionary) -> int:
		var h := m.hash()
		var bucket = _index.get(h)
		if bucket != null:
			for k in bucket:
				if _src[k] == m: return k
		var i := mats.size()
		var entry := m.duplicate()
		var tex = m.get("tex")
		entry["_tex_off"] = -1
		entry["_tex_len"] = 0
		if tex != null:
			var at = _tex_at.get(tex)
			if at == null:
				var code := TX.compile(tex)
				at = [tex_code.size(), code.size()]
				tex_code.append_array(code)
				_tex_at[tex] = at
			entry["_tex_off"] = at[0]
			entry["_tex_len"] = at[1]
		mats.append(entry)
		_src.append(m)
		if bucket == null: _index[h] = [i]
		else: bucket.append(i)
		return i


class Raster extends RefCounted:
	var w: int
	var h: int
	## Animation frame being drawn (flowing textures).
	var phase := 0
	## Default space for textures when a fill doesn't name one (null = raster space).
	var space = null
	## Materials whose fills and dots are dropped (gear icons draw an item without the body under it).
	var skip = null
	var materials: Array = []
	var registry: Registry
	## Ops of the frame being drawn.
	var ops := PackedFloat32Array()
	## Conservative bounds of everything drawn (raster pixels).
	var bx0 := 1 << 30
	var by0 := 1 << 30
	var bx1 := -1
	var by1 := -1
	var _handles := PackedInt32Array([0])
	var _next_order := 1
	## Set by compose(): frames go to this job.
	var job = null

	func _init(width: float, height: float, reg: Registry = null) -> void:
		w = int(width)
		h = int(height)
		registry = reg if reg != null else Registry.new()

	func clear() -> void:
		ops.clear()
		materials.clear()
		_handles = PackedInt32Array([0])
		_next_order = 1
		space = null
		skip = null
		bx0 = 1 << 30
		by0 = 1 << 30
		bx1 = -1
		by1 = -1

	## Registers a material for this frame and returns its handle.
	func add(m: Dictionary) -> int:
		materials.append(m)
		_handles.append(registry.index_of(m))
		return materials.size()

	func _skipped(handle: int) -> bool:
		return skip != null and TS.id_has(skip, materials[handle - 1])

	func _bounds(box: Dictionary) -> PackedInt32Array:
		var x0 := maxi(0, floori(box["x0"]) - 1)
		var y0 := maxi(0, floori(box["y0"]) - 1)
		var x1 := mini(w - 1, ceili(box["x1"]) + 1)
		var y1 := mini(h - 1, ceili(box["y1"]) + 1)
		return PackedInt32Array([x0, y0, x1, y1])

	func _grow(x0: int, y0: int, x1: int, y1: int) -> void:
		if x0 < bx0: bx0 = x0
		if y0 < by0: by0 = y0
		if x1 > bx1: bx1 = x1
		if y1 > by1: by1 = y1

	## Fills a shape with a material, shaded as a rounded volume.
	func fill(shape: PixelSdf.Shape, m: int, o = null) -> void:
		if _skipped(m): return
		if o == null: o = {}
		var b := _bounds(shape.box)
		if b[0] > b[2] or b[1] > b[3]: return
		_grow(b[0], b[1], b[2], b[3])
		var loc = o.get("local")
		if loc == null: loc = space
		var flat = o.get("flat")
		var g = o.get("group")
		var bevel = o.get("bevel")
		var bias = o.get("toneBias")
		var lb = o.get("lightBias")
		var header := PackedFloat32Array([
			OP_FILL, 0, b[0], b[1], b[2], b[3],
			_handles[m], 1 if g == null else g, _next_order, FLAG_NOLINE if TS.truthy(o.get("noLine")) else 0,
			3.0 if bevel == null else bevel, 0.0 if bias == null else bias, 0.0 if lb == null else lb,
			-1.0 if flat == null else flat, 1.0 if TS.truthy(o.get("softLight")) else 0.0,
		])
		_next_order += 1
		header.append_array(_affine(loc))
		header.append(shape.code.size())
		header[1] = header.size() + shape.code.size()
		ops.append_array(header)
		ops.append_array(shape.code)

	## Texture space as an affine map raster → part space: [has, a, b, c, d, e, f].
	func _affine(loc) -> PackedFloat32Array:
		if loc == null: return PackedFloat32Array([0, 1, 0, 0, 0, 1, 0])
		var f0x: float = loc.ix(0.0, 0.0)
		var f0y: float = loc.iy(0.0, 0.0)
		var fxx: float = loc.ix(1.0, 0.0)
		var fxy: float = loc.iy(1.0, 0.0)
		var fyx: float = loc.ix(0.0, 1.0)
		var fyy: float = loc.iy(0.0, 1.0)
		return PackedFloat32Array([1, fxx - f0x, fyx - f0x, f0x, fxy - f0y, fyy - f0y, f0y])

	## Writes one pixel (eyes, mouths, rivets, glints).
	func dot(x: float, y: float, m: int, tone: float, group = null) -> void:
		var ix := floori(x)
		var iy := floori(y)
		if ix < 0 or iy < 0 or ix >= w or iy >= h: return
		if _skipped(m): return
		_grow(ix, iy, ix, iy)
		ops.append_array([OP_DOT, 10, ix, iy, ix, iy, _handles[m], tone, -1.0 if group == null else group, _next_order])
		_next_order += 1

	## One-pixel line without doubled corners (bowstrings, cracks, trims).
	func line(xa: float, ya: float, xb: float, yb: float, m: int, tone: float, group = null) -> void:
		var x0 := floori(xa)
		var y0 := floori(ya)
		var x1 := floori(xb)
		var y1 := floori(yb)
		var dx := absi(x1 - x0)
		var dy := -absi(y1 - y0)
		var sx := 1 if x0 < x1 else -1
		var sy := 1 if y0 < y1 else -1
		var err := dx + dy
		for guard in 512:
			dot(x0, y0, m, tone, group)
			if x0 == x1 and y0 == y1: break
			var e2 := 2 * err
			if e2 >= dy:
				err += dy
				x0 += sx
			if e2 <= dx:
				err += dx
				y0 += sy

	## Clears pixels inside `s` drawn by the given groups (bit mask).
	func erase(s: PixelSdf.Shape, group_mask: int) -> void:
		var b := _bounds(s.box)
		ops.append_array([OP_ERASE, 0, b[0], b[1], b[2], b[3], group_mask, s.code.size()])
		var at := ops.size() - 8
		ops.append_array(s.code)
		ops[at + 1] = 8 + s.code.size()

	## Weapon smear (sprite/draw.ts drawSmear): a crescent trailing the swing, painted behind the body.
	func smear(arc_shape: PixelSdf.Shape, mat: int, dim: int, cx: float, cy: float, from: float, span: float, tip: float, reach: float, legend: bool) -> void:
		var b := _bounds(arc_shape.box)
		_grow(b[0], b[1], b[2], b[3])
		ops.append_array([OP_SMEAR, 0, b[0], b[1], b[2], b[3], _handles[mat], _handles[dim], _next_order,
			cx, cy, from, span, tip, reach, 1.0 if legend else 0.0, arc_shape.code.size()])
		_next_order += 1
		var at := ops.size() - 17
		ops.append_array(arc_shape.code)
		ops[at + 1] = 17 + arc_shape.code.size()

	## Whirlwind ring (sprite/draw.ts drawRing): a band around the waist, behind the body.
	func ring(mat: int, dim: int, cx: float, cy: float, rx: float, ry: float) -> void:
		var b := PackedInt32Array([maxi(0, floori(cx - rx - 1)), maxi(0, floori(cy - ry - 1)), mini(w - 1, ceili(cx + rx + 1)), mini(h - 1, ceili(cy + ry + 1))])
		_grow(b[0], b[1], b[2], b[3])
		ops.append_array([OP_RING, 13, b[0], b[1], b[2], b[3], _handles[mat], _handles[dim], _next_order, cx, cy, rx, ry])
		_next_order += 1

	## CPU reads of the raster don't exist here (everything is on the GPU).
	func at(_x: float, _y: float) -> int:
		push_error("PixelRaster.Raster.at(): raster state lives on the GPU")
		return 0

	## Closes the frame: queues it on the forge job and returns where it will land.
	## (ox, oy) is the sprite origin in raster space.
	func compose(ox: float, oy: float, outline := true, night := false):
		# No job: baked on its own right away (see Forge.bake_one).
		if job == null: return Forge.bake_one(self, ox, oy, outline, night)
		return job.capture(self, ox, oy, outline, night)
