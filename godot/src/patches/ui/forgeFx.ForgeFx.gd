## Device px per CSS px (the art is `k` CSS px a pixel, as on the web).
var _dp := 1.0
var running := false
var _room_key := ""

## Sizes the scene to the screen (device px) at `dp` device px per CSS px.
func layout(box: Vector2, dp: float) -> void:
	_dp = dp
	var cw := box.x / dp
	var ch := box.y / dp
	self.k = maxf(2, floor((ch * 0.62) / 76.0))
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
		self.room = UiForgeFx.smithy_art(self.w, self.h)
		Canvas2D.fast_gradients = false

## Device px per art px.
func px_scale() -> float:
	return _dp * self.k

## The scene stands on the bottom of a screen rect, centred in it.
func anchor(r: Rect2) -> void:
	if r.size.x <= 0: return
	var s := px_scale()
	self.home = {"x": roundf(r.get_center().x / s) + 22, "y": roundf(r.end.y / s) - 6}
	if not self.at["x"]: self.at = self.home.duplicate()

## Art-px point of a screen rect's centre.
func point_of(r: Rect2) -> Variant:
	var s := px_scale()
	return {"x": r.get_center().x / s, "y": r.get_center().y / s}

## Screen point of an art-px point.
func screen_of(p) -> Vector2:
	return Vector2(p["x"], p["y"]) * px_scale()

## Sparkles circling a revealed card (a screen rect); null stops them.
func set_halo(r, tier: String = "legendary") -> void:
	if r == null:
		self.halo = null
		return
	var p = point_of(r)
	self.halo = {"x": p["x"], "y": p["y"], "r": maxf(r.size.x, r.size.y) / px_scale() / 2.0 + 3, "tier": tier}

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
	# Heat shimmer over the furnace, stronger the hotter it burns.
	var ax: float = self.at["x"]
	var ay: float = self.at["y"]
	self.gl.haze = {"x0": ax + UiForgeFx.FURNACE["x0"] + 4, "y0": ay + UiForgeFx.CHIMNEY["top"] - 30, "x1": ax + UiForgeFx.FURNACE["x1"] - 2, "y1": ay + UiForgeFx.MOUTH["top"] + 4, "amp": (0.35 + self.heat * 1.1) * self.scene}
	var b = self.get_bar_at()
	self.gl.cam = {"x": b["x"] - 20, "y": b["y"], "zoom": self.zoom}
	self.gl.render(dt)
