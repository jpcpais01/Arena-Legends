class_name Canvas2D
## The slice of the browser's 2D canvas the web game's drawing code uses,
## so that code runs unchanged. Two back ends:
##  - Surface (an offscreen <canvas>): small CPU images painted once (glow
##    sprites, flame frames, pixel buffers), uploaded as textures on first use.
##  - Gpu (the screen): every call becomes a RenderingServer canvas command,
##    batched into canvas items that are reused each frame. A blend mode or
##    clip change starts the next item, so draw order is kept.

## CSS colour → Color, parsed once per distinct string.
static var _css := {}
## Big gradient fills sampled coarsely (Cpu._grad_fast) while true: set around one-off
## backdrops (the shop scenes), never for the pixel-exact arena art.
static var fast_gradients := false


static func color(v) -> Color:
	if v is Color: return v
	if v is String:
		var c = _css.get(v)
		if c != null: return c
		var out := _parse(v)
		if _css.size() > 4096: _css.clear()
		_css[v] = out
		return out
	return Color.BLACK


static func _parse(s: String) -> Color:
	s = s.strip_edges()
	if s.begins_with("#"):
		var h := s.substr(1)
		if h.length() == 3 or h.length() == 4:
			var e := ""
			for ch in h: e += ch + ch
			h = e
		if h.length() == 6: return Color8(h.substr(0, 2).hex_to_int(), h.substr(2, 2).hex_to_int(), h.substr(4, 2).hex_to_int())
		if h.length() == 8: return Color8(h.substr(0, 2).hex_to_int(), h.substr(2, 2).hex_to_int(), h.substr(4, 2).hex_to_int(), h.substr(6, 2).hex_to_int())
		return Color.BLACK
	var open := s.find("(")
	if open > 0:
		var parts := s.substr(open + 1, s.rfind(")") - open - 1).split(",")
		var a := 1.0
		if parts.size() >= 4: a = parts[3].to_float()
		if parts.size() >= 3: return Color(parts[0].to_float() / 255.0, parts[1].to_float() / 255.0, parts[2].to_float() / 255.0, a)
	match s:
		"white": return Color.WHITE
		"black": return Color.BLACK
		"transparent": return Color(0, 0, 0, 0)
	return Color.BLACK


## Packed 0xAABBGGRR pixels (the web's Uint32Array view of ImageData) → Image.
static func image_of(data, w: int, h: int) -> Image:
	var bytes: PackedByteArray
	if data is PackedByteArray: bytes = data
	# Pixels may be floats (numbers in JS); through int64 first, as float → int32 would saturate.
	else: bytes = PackedInt32Array(Array(PackedInt64Array(data))).to_byte_array()
	if bytes.size() < w * h * 4: bytes.resize(w * h * 4)
	elif bytes.size() > w * h * 4: bytes = bytes.slice(0, w * h * 4)
	return Image.create_from_data(maxi(1, w), maxi(1, h), false, Image.FORMAT_RGBA8, bytes)


class ImageData:
	var data
	var width: int
	var height: int
	func _init(d = null, w = 0, h = 0) -> void:
		data = d
		width = int(w)
		height = int(h)


class Gradient2D:
	var radial := false
	## Linear: x0, y0 → x1, y1. Radial: centre x1, y1, radii r0 → r1 (the inner centre is assumed the same).
	var x0: float
	var y0: float
	var r0: float
	var x1: float
	var y1: float
	var r1: float
	var stops: Array = []
	func add_color_stop(t, c) -> void:
		var col := Canvas2D.color(c)
		var i := stops.size()
		while i > 0 and stops[i - 1][0] > float(t): i -= 1
		stops.insert(i, [float(t), col])
	func at(t: float) -> Color:
		if stops.is_empty(): return Color(0, 0, 0, 0)
		if t <= stops[0][0]: return stops[0][1]
		for i in range(1, stops.size()):
			if t <= stops[i][0]:
				var a: Array = stops[i - 1]
				var b: Array = stops[i]
				var k: float = 0.0 if b[0] == a[0] else (t - a[0]) / (b[0] - a[0])
				return (a[1] as Color).lerp(b[1], k)
		return stops[stops.size() - 1][1]


## A part of a texture standing in for an <img>/<canvas> (sprite frames in an atlas).
class Region:
	var tex: Texture2D
	var rect: Rect2
	var width: int
	var height: int
	## Drawn as a silhouette in this colour (hit flashes).
	var solid := false
	var tint := Color.WHITE
	func _init(t: Texture2D = null, r := Rect2()) -> void:
		tex = t
		rect = r
		width = int(r.size.x)
		height = int(r.size.y)
	func silhouette(c: Color) -> Region:
		var s := Region.new(tex, rect)
		s.solid = true
		s.tint = c
		return s


# -----------------------------------------------------------------------------
# Shared drawing state
# -----------------------------------------------------------------------------

class State:
	var alpha := 1.0
	var fill = "#000"
	var op := "source-over"
	var xf := Transform2D.IDENTITY
	var clip = null


class Path:
	## Closed subpaths as PackedVector2Array, plus a bounding rect for simple rect clips.
	var polys: Array[PackedVector2Array] = []
	var cur := PackedVector2Array()
	func flush() -> void:
		if cur.size() >= 2: polys.append(cur)
		cur = PackedVector2Array()
	func ellipse(cx: float, cy: float, rx: float, ry: float, rot: float, a0: float, a1: float, ccw := false) -> void:
		var span := a1 - a0
		if ccw: span = -fposmod(-span, TAU) if absf(span) < TAU else -TAU
		elif absf(span) >= TAU: span = TAU
		else: span = fposmod(span, TAU)
		var n := maxi(8, int(ceil(absf(span) / TAU * clampf(maxf(rx, ry) * 0.9, 12, 64))))
		var cr := cos(rot)
		var sr := sin(rot)
		for i in n + 1:
			var a := a0 + span * i / n
			var px := cos(a) * rx
			var py := sin(a) * ry
			cur.append(Vector2(cx + px * cr - py * sr, cy + px * sr + py * cr))


## An offscreen canvas: a CPU image, turned into a texture when drawn.
class Surface:
	var width := 300
	var height := 150
	var class_name_ := ""
	var _ctx: Cpu
	var _img: Image
	var _tex: ImageTexture
	var _dirty := false

	func get_context(_kind = null, _opts = null) -> Cpu:
		if _ctx == null: _ctx = Cpu.new(self)
		return _ctx

	func image() -> Image:
		if _img == null or _img.get_width() != maxi(1, width) or _img.get_height() != maxi(1, height):
			_img = Image.create_empty(maxi(1, width), maxi(1, height), false, Image.FORMAT_RGBA8)
			_tex = null
		_dirty = true
		return _img

	func texture() -> Texture2D:
		if _img == null: image()
		if _tex == null:
			_tex = ImageTexture.create_from_image(_img)
		elif _dirty:
			_tex.update(_img)
		_dirty = false
		return _tex


## Draws into a Surface's image (no anti-aliasing: these are pixel sprites).
class Cpu:
	var canvas: Surface
	var global_alpha := 1.0
	var fill_style = "#000"
	var stroke_style = "#000"
	var line_width := 1.0
	var line_cap := "butt"
	var global_composite_operation := "source-over"
	var image_smoothing_enabled := false
	var _stack: Array = []
	var _xf := Transform2D.IDENTITY
	var _path := Path.new()

	func _init(c: Surface) -> void:
		canvas = c

	func save() -> void:
		_stack.append([global_alpha, fill_style, global_composite_operation, _xf])
	func restore() -> void:
		if _stack.is_empty(): return
		var s: Array = _stack.pop_back()
		global_alpha = s[0]; fill_style = s[1]; global_composite_operation = s[2]; _xf = s[3]
	func translate(x, y) -> void: _xf = _xf * Transform2D(0.0, Vector2(x, y))
	func scale(x, y) -> void: _xf = _xf * Transform2D(Vector2(x, 0), Vector2(0, y), Vector2.ZERO)
	func rotate(a) -> void: _xf = _xf * Transform2D(float(a), Vector2.ZERO)
	func set_transform(a, b, c, d, e, f) -> void: _xf = Transform2D(Vector2(a, b), Vector2(c, d), Vector2(e, f))

	func clear_rect(x, y, w, h) -> void:
		var img := canvas.image()
		var r := _irect(x, y, w, h)
		if r.has_area(): img.fill_rect(r, Color(0, 0, 0, 0))

	func fill_rect(x, y, w, h) -> void:
		var img := canvas.image()
		var r := _irect(x, y, w, h)
		if not r.has_area(): return
		if fill_style is Gradient2D:
			var gr: Gradient2D = fill_style
			if Canvas2D.fast_gradients and global_composite_operation == "source-over":
				_grad_fast(img, gr, r)
				return
			for yy in range(r.position.y, r.end.y):
				for xx in range(r.position.x, r.end.x):
					_blend(img, xx, yy, _grad_at(gr, xx + 0.5, yy + 0.5))
			return
		var c := Canvas2D.color(fill_style)
		c.a *= global_alpha
		if global_composite_operation == "copy" or (c.a >= 1.0 and global_composite_operation == "source-over"):
			img.fill_rect(r, c)
			return
		for yy in range(r.position.y, r.end.y):
			for xx in range(r.position.x, r.end.x):
				_blend(img, xx, yy, c)

	## A gradient fill over a large area (backdrops painted once): sampled on a coarse
	## grid (exactly per row or column for straight gradients), stretched, and blended natively.
	func _grad_fast(img: Image, gr: Gradient2D, r: Rect2i) -> void:
		var rw := r.size.x
		var rh := r.size.y
		var vertical := not gr.radial and absf(gr.x1 - gr.x0) < 0.0001
		var horizontal := not gr.radial and absf(gr.y1 - gr.y0) < 0.0001
		var g: Image
		if vertical or horizontal:
			var n := rh if vertical else rw
			g = Image.create_empty(1 if vertical else n, n if vertical else 1, false, Image.FORMAT_RGBA8)
			for i in n:
				var c := _grad_at(gr, r.position.x + 0.5, r.position.y + i + 0.5) if vertical else _grad_at(gr, r.position.x + i + 0.5, r.position.y + 0.5)
				g.set_pixel(0 if vertical else i, i if vertical else 0, c)
			g.resize(rw, rh, Image.INTERPOLATE_NEAREST)
		else:
			var st := maxi(1, ceili(maxf(rw, rh) / 160.0))
			var gw := ceili(float(rw) / st) + 1
			var gh := ceili(float(rh) / st) + 1
			g = Image.create_empty(gw, gh, false, Image.FORMAT_RGBA8)
			for j in gh:
				for i in gw:
					g.set_pixel(i, j, _grad_at(gr, r.position.x + i * st + 0.5, r.position.y + j * st + 0.5))
			if st > 1: g.resize((gw - 1) * st, (gh - 1) * st, Image.INTERPOLATE_BILINEAR)
		img.blend_rect(g, Rect2i(0, 0, rw, rh), r.position)

	func _grad_at(gr: Gradient2D, x: float, y: float) -> Color:
		var p := _xf.affine_inverse() * Vector2(x, y)
		var t: float
		if gr.radial:
			t = (p.distance_to(Vector2(gr.x1, gr.y1)) - gr.r0) / maxf(0.0001, gr.r1 - gr.r0)
		else:
			var d := Vector2(gr.x1 - gr.x0, gr.y1 - gr.y0)
			t = (p - Vector2(gr.x0, gr.y0)).dot(d) / maxf(0.0001, d.length_squared())
		var c := gr.at(clampf(t, 0, 1))
		c.a *= global_alpha
		return c

	func _blend(img: Image, x: int, y: int, c: Color) -> void:
		if c.a <= 0.0 and global_composite_operation != "copy": return
		match global_composite_operation:
			"copy": img.set_pixel(x, y, c)
			"lighter":
				var d := img.get_pixel(x, y)
				img.set_pixel(x, y, Color(minf(1, d.r * d.a + c.r * c.a), minf(1, d.g * d.a + c.g * c.a), minf(1, d.b * d.a + c.b * c.a), minf(1, d.a + c.a)))
			"source-in", "source-atop":
				var d := img.get_pixel(x, y)
				if d.a <= 0.0: return
				if global_composite_operation == "source-in": img.set_pixel(x, y, Color(c.r, c.g, c.b, c.a * d.a))
				else: img.set_pixel(x, y, Color(d.r + (c.r - d.r) * c.a, d.g + (c.g - d.g) * c.a, d.b + (c.b - d.b) * c.a, d.a))
			_:
				var d := img.get_pixel(x, y)
				if d.a <= 0.0: img.set_pixel(x, y, c); return
				var a := c.a + d.a * (1.0 - c.a)
				img.set_pixel(x, y, Color((c.r * c.a + d.r * d.a * (1.0 - c.a)) / a, (c.g * c.a + d.g * d.a * (1.0 - c.a)) / a, (c.b * c.a + d.b * d.a * (1.0 - c.a)) / a, a))

	func _irect(x, y, w, h) -> Rect2i:
		var r := _xf * Rect2(float(x), float(y), float(w), float(h)).abs()
		var x0 := clampi(int(round(r.position.x)), 0, canvas.width)
		var y0 := clampi(int(round(r.position.y)), 0, canvas.height)
		var x1 := clampi(int(round(r.end.x)), 0, canvas.width)
		var y1 := clampi(int(round(r.end.y)), 0, canvas.height)
		return Rect2i(x0, y0, x1 - x0, y1 - y0)

	func put_image_data(d: ImageData, dx, dy) -> void:
		var img := canvas.image()
		var src := Canvas2D.image_of(d.data, d.width, d.height)
		img.blit_rect(src, Rect2i(0, 0, d.width, d.height), Vector2i(int(dx), int(dy)))

	func create_image_data(w, h) -> ImageData:
		return ImageData.new(TS.typed_array(int(w) * int(h)), w, h)

	func draw_image(src, a = null, b = null, c = null, d = null, e = null, f = null, g = null, h = null) -> void:
		var img := canvas.image()
		var simg: Image
		if src is Surface: simg = src.image()
		elif src is Region: simg = src.tex.get_image().get_region(Rect2i(src.rect))
		else: return
		var sr := Rect2i(0, 0, simg.get_width(), simg.get_height())
		var dst := Vector2i(int(a), int(b))
		var dsz := sr.size
		if e != null:
			sr = Rect2i(int(a), int(b), int(c), int(d))
			dst = Vector2i(int(e), int(f))
			dsz = Vector2i(int(g), int(h))
		elif c != null:
			dsz = Vector2i(int(c), int(d))
		var piece := simg.get_region(sr)
		if dsz != sr.size and dsz.x > 0 and dsz.y > 0: piece.resize(dsz.x, dsz.y, Image.INTERPOLATE_BILINEAR if image_smoothing_enabled else Image.INTERPOLATE_NEAREST)
		var t := _xf.origin
		if global_alpha >= 1.0 and global_composite_operation == "source-over":
			img.blend_rect(piece, Rect2i(Vector2i.ZERO, piece.get_size()), dst + Vector2i(t))
		else:
			for yy in piece.get_height():
				for xx in piece.get_width():
					var px := piece.get_pixel(xx, yy)
					px.a *= global_alpha
					var X := dst.x + int(t.x) + xx
					var Y := dst.y + int(t.y) + yy
					if X >= 0 and Y >= 0 and X < canvas.width and Y < canvas.height: _blend(img, X, Y, px)

	func create_linear_gradient(x0, y0, x1, y1) -> Gradient2D:
		var gr := Gradient2D.new()
		gr.x0 = x0; gr.y0 = y0; gr.x1 = x1; gr.y1 = y1
		return gr

	func create_radial_gradient(x0, y0, r0, x1, y1, r1) -> Gradient2D:
		var gr := Gradient2D.new()
		gr.radial = true
		gr.x0 = x0; gr.y0 = y0; gr.r0 = r0; gr.x1 = x1; gr.y1 = y1; gr.r1 = r1
		return gr

	func begin_path() -> void: _path = Path.new()
	func move_to(x, y) -> void: _path.flush(); _path.cur.append(_xf * Vector2(x, y))
	func line_to(x, y) -> void: _path.cur.append(_xf * Vector2(x, y))
	func close_path() -> void: _path.flush()
	func rect(x, y, w, h) -> void:
		_path.flush()
		for p in [Vector2(x, y), Vector2(x + w, y), Vector2(x + w, y + h), Vector2(x, y + h)]: _path.cur.append(_xf * p)
		_path.flush()
	func arc(x, y, r, a0, a1, ccw = false) -> void: ellipse(x, y, r, r, 0, a0, a1, ccw)
	func ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) -> void:
		var tmp := Path.new()
		tmp.ellipse(x, y, rx, ry, rot, a0, a1, ccw)
		for p in tmp.cur: _path.cur.append(_xf * p)
	func fill(_rule = null) -> void:
		_path.flush()
		var img := canvas.image()
		for poly in _path.polys:
			var bb := Rect2(poly[0], Vector2.ZERO)
			for p in poly: bb = bb.expand(p)
			for yy in range(maxi(0, int(floor(bb.position.y))), mini(canvas.height, int(ceil(bb.end.y)))):
				for xx in range(maxi(0, int(floor(bb.position.x))), mini(canvas.width, int(ceil(bb.end.x)))):
					if Geometry2D.is_point_in_polygon(Vector2(xx + 0.5, yy + 0.5), poly):
						var c: Color = _grad_at(fill_style, xx + 0.5, yy + 0.5) if fill_style is Gradient2D else Canvas2D.color(fill_style) * Color(1, 1, 1, global_alpha)
						_blend(img, xx, yy, c)
	func stroke() -> void: pass
	func clip(_rule = null) -> void: pass


# -----------------------------------------------------------------------------
# The screen
# -----------------------------------------------------------------------------

## Draws through RenderingServer canvas items, into four layers the screen
## composites (see BattleScreen): `back` takes what is slipped behind
## ("destination-over": the live sky), `world` everything drawn before the
## arena's lighting pass, `atop` what is painted only over what is already
## there ("source-atop": the hour's tint), and `over` everything after the
## lighting pass. A blend or clip change starts the next canvas item, so draw
## order is kept; items are cleared and reused every frame.
class Gpu:
	enum { WORLD, OVER, BACK, ATOP }
	var canvas
	var global_alpha := 1.0
	var fill_style = "#000"
	var stroke_style = "#000"
	var line_width := 1.0
	var line_cap := "butt"
	var global_composite_operation := "source-over"
	var image_smoothing_enabled := false

	## Root canvas items of the four layers.
	var roots: Array[RID] = []
	## World or over: where plain drawing goes now.
	var phase := WORLD
	## Light shafts asked for this frame (Canvas2D.SHAFTS drawn): strength, where the light is, its colour.
	var shafts := 0.0
	var shaft_pos := Vector2.ZERO
	var shaft_color := Color.WHITE
	var used := [false, false, false, false]

	var _items: Array[RID] = []
	var _used := 0
	var _order := [0, 0, 0, 0]
	var _item: RID
	var _key := ""
	var _xf := Transform2D.IDENTITY
	var _item_xf := Transform2D.IDENTITY
	var _clip = null
	var _stack: Array = []
	var _path := Path.new()
	var _last_fill = null
	var _last_col := Color.BLACK
	var _mats := {}
	var _keep: Array = []

	func _init(layer_roots: Array[RID], surf) -> void:
		roots = layer_roots
		canvas = surf

	## Starts a frame: every item from the last one is cleared and reused.
	func begin() -> void:
		for i in _used: RenderingServer.canvas_item_clear(_items[i])
		_used = 0
		_order = [0, 0, 0, 0]
		used = [false, false, false, false]
		_key = "?"
		_xf = Transform2D.IDENTITY
		_clip = null
		_stack.clear()
		global_alpha = 1.0
		global_composite_operation = "source-over"
		phase = WORLD
		shafts = 0.0

	## The arena's lighting pass begins: from here plain drawing lands over the composited world.
	func enter_light() -> void:
		phase = OVER
		_key = "?"

	func release() -> void:
		for it in _items: RenderingServer.free_rid(it)
		_items.clear()
		_used = 0

	func _mat(blend: String) -> RID:
		if blend == "": return RID()
		var m = _mats.get(blend)
		if m != null: return m
		var mat: Material
		match blend:
			"add":
				var cm := CanvasItemMaterial.new(); cm.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD; mat = cm
			"mul":
				var cm := CanvasItemMaterial.new(); cm.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL; mat = cm
			"solid", "solid_add":
				var sm := ShaderMaterial.new()
				sm.shader = Canvas2D.solid_shader(blend == "solid_add")
				mat = sm
			_:
				return RID()
		_keep.append(mat)
		_mats[blend] = mat.get_rid()
		return mat.get_rid()

	func _next(key: String, layer: int, blend: String) -> void:
		if _used >= _items.size():
			_items.append(RenderingServer.canvas_item_create())
		_item = _items[_used]
		_used += 1
		RenderingServer.canvas_item_set_parent(_item, roots[layer])
		# What goes behind goes behind what went behind before it.
		_order[layer] += 1
		RenderingServer.canvas_item_set_draw_index(_item, -_order[layer] if layer == BACK else _order[layer])
		used[layer] = true
		_key = key
		RenderingServer.canvas_item_set_material(_item, _mat(blend))
		if _clip != null:
			RenderingServer.canvas_item_set_custom_rect(_item, true, _clip)
			RenderingServer.canvas_item_set_clip(_item, true)
		else:
			RenderingServer.canvas_item_set_clip(_item, false)
			RenderingServer.canvas_item_set_custom_rect(_item, false)
		_item_xf = Transform2D.IDENTITY

	## The item for the next command, switched when the layer or blend changes.
	func _use(solid := false) -> RID:
		var op := global_composite_operation
		var layer := phase
		var blend := ""
		match op:
			"destination-over": layer = BACK
			"source-atop": layer = ATOP
			"lighter", "screen": blend = "add"
			"multiply": blend = "mul"
		if solid: blend = "solid_add" if blend == "add" else "solid"
		var key := "%d%s" % [layer, blend]
		if key != _key: _next(key, layer, blend)
		if _item_xf != _xf:
			RenderingServer.canvas_item_add_set_transform(_item, _xf)
			_item_xf = _xf
		return _item

	func save() -> void:
		_stack.append([global_alpha, fill_style, global_composite_operation, _xf, _clip])
	func restore() -> void:
		if _stack.is_empty(): return
		var s: Array = _stack.pop_back()
		global_alpha = s[0]; fill_style = s[1]; global_composite_operation = s[2]; _xf = s[3]
		if s[4] != _clip:
			_clip = s[4]
			_key = "?"
	func translate(x, y) -> void: _xf = _xf * Transform2D(0.0, Vector2(x, y))
	func scale(x, y) -> void: _xf = _xf * Transform2D(Vector2(x, 0), Vector2(0, y), Vector2.ZERO)
	func rotate(a) -> void: _xf = _xf * Transform2D(float(a), Vector2.ZERO)
	func set_transform(a, b, c, d, e, f) -> void: _xf = Transform2D(Vector2(a, b), Vector2(c, d), Vector2(e, f))
	func reset_transform() -> void: _xf = Transform2D.IDENTITY

	func _fill() -> Color:
		var f = fill_style
		if not is_same(f, _last_fill):
			_last_fill = f
			_last_col = Canvas2D.color(f)
		return _last_col

	func fill_rect(x, y, w, h) -> void:
		if fill_style is Gradient2D:
			_grad_rect(fill_style, Rect2(x, y, w, h).abs())
			return
		var c := _fill()
		c.a *= global_alpha
		if c.a <= 0.0: return
		RenderingServer.canvas_item_add_rect(_use(), Rect2(x, y, w, h).abs(), c)

	func clear_rect(_x, _y, _w, _h) -> void:
		pass

	func draw_image(src, a = null, b = null, c = null, d = null, e = null, f = null, g = null, h = null) -> void:
		if global_alpha <= 0.0: return
		if is_same(src, Canvas2D.SHAFTS):
			shafts = global_alpha
			return
		var tex: Texture2D
		var sr: Rect2
		var solid := false
		var mod := Color(1, 1, 1, global_alpha)
		if src is Region:
			tex = src.tex
			sr = src.rect
			if src.solid:
				solid = true
				mod = Color(src.tint.r, src.tint.g, src.tint.b, src.tint.a * global_alpha)
		elif src is Surface:
			tex = src.texture()
			sr = Rect2(0, 0, src.width, src.height)
		else:
			return
		if tex == null: return
		var dst: Rect2
		if e != null:
			sr = Rect2(sr.position.x + float(a), sr.position.y + float(b), float(c), float(d))
			dst = Rect2(float(e), float(f), float(g), float(h))
		elif c != null:
			dst = Rect2(float(a), float(b), float(c), float(d))
		else:
			dst = Rect2(float(a), float(b), sr.size.x, sr.size.y)
		if dst.size.x == 0 or dst.size.y == 0: return
		RenderingServer.canvas_item_add_texture_rect_region(_use(solid), dst, tex.get_rid(), sr, mod, false, true)

	func _grad_rect(gr: Gradient2D, r: Rect2) -> void:
		var it := _use()
		var ga := Color(1, 1, 1, global_alpha)
		if gr.radial:
			# Rings of a triangle strip; past the last ring the last colour (usually clear).
			var cx := gr.x1
			var cy := gr.y1
			var seg := 40
			var steps := 16
			var pts := PackedVector2Array()
			var cols := PackedColorArray()
			var idx := PackedInt32Array()
			for k in steps:
				var t0 := float(k) / steps
				var t1 := float(k + 1) / steps
				var ca := gr.at(t0) * ga
				var cb := gr.at(t1) * ga
				if ca.a <= 0.002 and cb.a <= 0.002: continue
				var ra := gr.r0 + (gr.r1 - gr.r0) * t0
				var rb := gr.r0 + (gr.r1 - gr.r0) * t1
				var base := pts.size()
				for i in seg + 1:
					var an := TAU * i / seg
					var dv := Vector2(cos(an), sin(an))
					pts.append(Vector2(cx, cy) + dv * ra)
					cols.append(ca)
					pts.append(Vector2(cx, cy) + dv * rb)
					cols.append(cb)
				for i in seg:
					var q := base + i * 2
					idx.append_array([q, q + 1, q + 2, q + 1, q + 3, q + 2])
			if idx.size(): RenderingServer.canvas_item_add_triangle_array(it, idx, pts, cols)
			var last := gr.at(1.0) * ga
			if last.a > 0.002: RenderingServer.canvas_item_add_rect(it, r, last)
			return
		var d := Vector2(gr.x1 - gr.x0, gr.y1 - gr.y0)
		var vertical := absf(d.x) < 0.0001
		var horizontal := absf(d.y) < 0.0001
		if not vertical and not horizontal:
			RenderingServer.canvas_item_add_rect(it, r, gr.at(0.5) * ga)
			return
		var p0 := gr.y0 if vertical else gr.x0
		var p1 := gr.y1 if vertical else gr.x1
		var lo := r.position.y if vertical else r.position.x
		var hi := r.end.y if vertical else r.end.x
		# Cut at the rect's edges and at every stop inside it.
		var cuts: Array[float] = [lo, hi]
		for s in gr.stops:
			var p: float = p0 + (p1 - p0) * s[0]
			if p > lo and p < hi: cuts.append(p)
		cuts.sort()
		for i in cuts.size() - 1:
			var a0 := cuts[i]
			var a1 := cuts[i + 1]
			if a1 - a0 <= 0.0: continue
			var c0 := gr.at(clampf((a0 - p0) / (p1 - p0), 0, 1) if p1 != p0 else 0.0) * ga
			var c1 := gr.at(clampf((a1 - p0) / (p1 - p0), 0, 1) if p1 != p0 else 0.0) * ga
			var pts: PackedVector2Array
			if vertical:
				pts = PackedVector2Array([Vector2(r.position.x, a0), Vector2(r.end.x, a0), Vector2(r.end.x, a1), Vector2(r.position.x, a1)])
			else:
				pts = PackedVector2Array([Vector2(a0, r.position.y), Vector2(a1, r.position.y), Vector2(a1, r.end.y), Vector2(a0, r.end.y)])
			var cols := PackedColorArray([c0, c0 if vertical else c1, c1, c1 if vertical else c0])
			RenderingServer.canvas_item_add_polygon(it, pts, cols)

	func create_linear_gradient(x0, y0, x1, y1) -> Gradient2D:
		var gr := Gradient2D.new()
		gr.x0 = x0; gr.y0 = y0; gr.x1 = x1; gr.y1 = y1
		return gr

	func create_radial_gradient(x0, y0, r0, x1, y1, r1) -> Gradient2D:
		var gr := Gradient2D.new()
		gr.radial = true
		gr.x0 = x0; gr.y0 = y0; gr.r0 = r0; gr.x1 = x1; gr.y1 = y1; gr.r1 = r1
		return gr

	func begin_path() -> void: _path = Path.new()
	func move_to(x, y) -> void: _path.flush(); _path.cur.append(Vector2(x, y))
	func line_to(x, y) -> void: _path.cur.append(Vector2(x, y))
	func close_path() -> void: _path.flush()
	func rect(x, y, w, h) -> void:
		_path.flush()
		_path.cur = PackedVector2Array([Vector2(x, y), Vector2(x + w, y), Vector2(x + w, y + h), Vector2(x, y + h)])
		_path.flush()
	func arc(x, y, r, a0, a1, ccw = false) -> void: _path.ellipse(x, y, r, r, 0, a0, a1, ccw)
	func ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) -> void: _path.ellipse(x, y, rx, ry, rot, a0, a1, ccw)

	func fill(_rule = null) -> void:
		_path.flush()
		var it := _use()
		for poly in _path.polys:
			if poly.size() < 3: continue
			var tri := Geometry2D.triangulate_polygon(poly)
			if tri.is_empty(): continue
			var cols := PackedColorArray()
			if fill_style is Gradient2D:
				for p in poly: cols.append(_grad_color(fill_style, p) * Color(1, 1, 1, global_alpha))
			else:
				var c := _fill()
				c.a *= global_alpha
				cols.resize(poly.size())
				cols.fill(c)
			RenderingServer.canvas_item_add_triangle_array(it, tri, poly, cols)

	func _grad_color(gr: Gradient2D, p: Vector2) -> Color:
		if gr.radial: return gr.at(clampf((p.distance_to(Vector2(gr.x1, gr.y1)) - gr.r0) / maxf(0.0001, gr.r1 - gr.r0), 0, 1))
		var d := Vector2(gr.x1 - gr.x0, gr.y1 - gr.y0)
		return gr.at(clampf((p - Vector2(gr.x0, gr.y0)).dot(d) / maxf(0.0001, d.length_squared()), 0, 1))

	func stroke() -> void:
		_path.flush()
		var it := _use()
		var c := Canvas2D.color(stroke_style)
		c.a *= global_alpha
		for poly in _path.polys:
			RenderingServer.canvas_item_add_polyline(it, poly, PackedColorArray([c]), line_width)

	## Rect clips only (the bounds of the current path), as the web game uses them.
	func clip(_rule = null) -> void:
		_path.flush()
		if _path.polys.is_empty(): return
		var bb := Rect2(_path.polys[0][0], Vector2.ZERO)
		for poly in _path.polys:
			for p in poly: bb = bb.expand(p)
		_clip = _xf * bb
		_key = "?"


## Stands in for the light-shaft buffer: drawing it asks the screen's composite for shafts.
static var SHAFTS := Region.new()


static var _solid_mix: Shader
static var _solid_add: Shader


## Silhouette shader: the modulate colour where the texture is opaque.
static func solid_shader(add: bool) -> Shader:
	if add and _solid_add: return _solid_add
	if not add and _solid_mix: return _solid_mix
	var sh := Shader.new()
	sh.code = "shader_type canvas_item;\nrender_mode %s;\nvarying vec4 tint;\nvoid vertex() { tint = COLOR; }\nvoid fragment() { COLOR = vec4(tint.rgb, texture(TEXTURE, UV).a * tint.a); }\n" % ("blend_add" if add else "blend_mix")
	if add: _solid_add = sh
	else: _solid_mix = sh
	return sh
