## Device px per CSS px (the art is `k` CSS px a pixel, as on the web).
var _dp := 1.0
var running := false
var _room_key := ""
## Gold-mask runs per sprite mask: rows of [x0, x1) (the glint slides over them).
var _runs := {}

## Sizes the scene to the screen (device px) at `dp` device px per CSS px; the chest
## stands about a third of the height.
func layout(box: Vector2, dp: float) -> void:
	_dp = dp
	var cw := box.x / dp
	var ch := box.y / dp
	self.k = maxf(2, floor((ch * 0.34) / float(UiChestFx.BODY_H + UiChestFx.LID_H)))
	self.w = ceil(cw / self.k)
	self.h = ceil(ch / self.k)
	self.src.width = self.w
	self.src.height = self.h
	self.g = self.gl.gpu
	self.gl.resize(self.k, dp)
	var key := "%dx%d" % [self.w, self.h]
	if key != _room_key:
		_room_key = key
		Canvas2D.fast_gradients = true
		self.room = UiChestFx.room_art(self.w, self.h)
		Canvas2D.fast_gradients = false

## Device px per art px.
func px_scale() -> float:
	return _dp * self.k

## Where the chest rests: bottom centre of a screen rect.
func anchor(r: Rect2) -> void:
	if r.size.x <= 0: return
	var s := px_scale()
	self.home = {"x": roundf(r.get_center().x / s), "y": roundf(r.end.y / s) - 4}
	if not self.at["x"]: self.at = self.home.duplicate()

## Art-px point for a screen rect's centre.
func point_of(r: Rect2) -> Variant:
	var s := px_scale()
	return {"x": r.get_center().x / s, "y": r.get_center().y / s}

## Screen point of an art-px point.
func screen_of(p) -> Vector2:
	return Vector2(p["x"], p["y"]) * px_scale()

## Sparkles and a soft light around a revealed card (a screen rect); null stops them.
func set_halo(r, tier: String = "legendary") -> void:
	self.gl.end(self.halo_light)
	self.halo_light = null
	if r == null:
		self.halo = null
		return
	var p = point_of(r)
	self.halo = {"x": p["x"], "y": p["y"], "r": maxf(r.size.x, r.size.y) / px_scale() / 2.0 + 3, "tier": tier}
	self.halo_light = self.gl.add({"kind": "glow", "x": p["x"], "y": p["y"], "r0": self.halo["r"] * 1.2, "r1": self.halo["r"] * 1.5, "hi": self.hue(tier, false), "lo": self.hue(tier, false), "power": 0.4, "life": 9999, "fin": 0.0001, "hold": true})

## A soft tier glow behind a screen rect for a while (a revealed card).
func glow_at(r: Rect2, tier: String, life := 1.2) -> void:
	var p = point_of(r)
	var R := maxf(r.size.x, r.size.y) / px_scale() / 2.0
	self.gl.add({"kind": "glow", "x": p["x"], "y": p["y"], "r0": R, "r1": R * 1.6, "hi": self.hue(tier, true), "lo": self.hue(tier, false), "power": 0.7, "life": life})
	self.gl.add({"kind": "rays", "x": p["x"], "y": p["y"], "r0": R * 1.5, "r1": R * 3, "hi": self.hue(tier, true), "lo": self.hue(tier, false), "power": 0.45, "life": life * 1.4, "seed": randf() * 40})

func start() -> void:
	running = true

func stop() -> void:
	running = false
	self.gl.clear()

## One frame: simulate, draw the art and hand it to the shader layer.
func frame(dt: float) -> void:
	if not running or self.w <= 0: return
	dt = minf(0.05, dt)
	self.g.begin()
	self.update(dt)
	self.draw()
	var m = self.get_mouth()
	self.gl.cam = {"x": m["x"], "y": m["y"] - 8, "zoom": self.zoom}
	self.gl.render(dt)

func _mask_runs(s) -> Array:
	if _runs.has(s): return _runs[s]
	var img: Image = s.image()
	var rows := []
	for y in img.get_height():
		var row := []
		var x0 := -1
		for x in img.get_width() + 1:
			var on := x < img.get_width() and img.get_pixel(x, y).a > 0.5
			if on and x0 < 0: x0 = x
			elif not on and x0 >= 0:
				row.append([x0, x])
				x0 = -1
		rows.append(row)
	_runs[s] = rows
	return rows

## A glint sliding across the chest's gold: a slanted band over the metal pixels.
func draw_glint(sp, x0: float, ly: float, y0: float, kk: float) -> void:
	var g = self.g
	var H := UiChestFx.BODY_H + UiChestFx.LID_H
	var x := -20.0 + kk * (UiChestFx.W + 40)
	var top := y0 - UiChestFx.LID_H + 1
	g.global_composite_operation = "lighter"
	g.global_alpha = 0.7
	g.fill_style = "#ffffff"
	for part in [[sp["lid"]["mask"], ly - top], [sp["body"]["mask"], UiChestFx.LID_H - 1]]:
		var rows := _mask_runs(part[0])
		for ry in rows.size():
			var yy: float = part[1] + ry
			if yy < 0 or yy >= H: continue
			var left := x - 20.0 * (yy + 0.5) / H
			var a0 := ceilf(left - 0.5)
			var a1 := ceilf(left + 4.5)
			for run in rows[ry]:
				var a := maxf(run[0], a0)
				var b := minf(run[1], a1)
				if b > a: g.fill_rect(x0 + a, top + yy, b - a, 1)
	g.global_alpha = 1
	g.global_composite_operation = "source-over"
