class_name ShopKit
## What the Shop's three screens share (the web's ui/gacha.ts helpers and the
## shop CSS): the header with its Offers / Chests / Forge tabs and the gem
## counter, gem prices, price buttons, the skin cards that come out of chests
## and the forge, and the tier name slammed across the screen for the best pulls.

const GEM := Color("#6fe8ff")
## Skin tier colours by internal rarity (internal "epic" is shown as Mythic).
const TIER_C := {"rare": Color("#5aa8ff"), "mythic": Color("#c27aff"), "legendary": Color("#ffb040"), "epic": Color("#7ff0e0")}
## The soft glow of each tier (cards, offers, the forge rows).
const TIER_GLOW := {"rare": Color(90 / 255.0, 168 / 255.0, 1.0, 0.5), "mythic": Color(194 / 255.0, 122 / 255.0, 1.0, 0.55), "legendary": Color(1.0, 176 / 255.0, 64 / 255.0, 0.6), "epic": Color(127 / 255.0, 240 / 255.0, 224 / 255.0, 0.7)}
const REVEAL := {"rare": "revealRare", "mythic": "revealMythic", "legendary": "revealLegendary", "epic": "revealEpic"}


static func tier_name(r: String) -> String:
	return str(CharacterSkins.RARITY_NAME.get(r, r))


static func rank(r: String) -> int:
	return CharacterSkins.SKIN_RARITIES.find(r)


## Where the Mythic gradient has slid to (it loops every 3 s, as the web's epicSweep).
static func sweep_phase(speed := 3.0) -> float:
	return fmod(Time.get_ticks_msec() / 1000.0, speed) / speed * 0.5


## CSS cubic-bezier timing: y at progress `t` (0..1).
static func bez(x1: float, y1: float, x2: float, y2: float, t: float) -> float:
	if t <= 0.0: return 0.0
	if t >= 1.0: return 1.0
	var u := t
	for i in 8:
		var x := _bz(x1, x2, u) - t
		if absf(x) < 1e-4: break
		var d := 3.0 * x1 * (1.0 - u) * (1.0 - u) + 6.0 * (x2 - x1) * u * (1.0 - u) + 3.0 * (1.0 - x2) * u * u
		if absf(d) < 1e-6: break
		u = clampf(u - x / d, 0.0, 1.0)
	return _bz(y1, y2, u)


static func _bz(a: float, b: float, u: float) -> float:
	return 3.0 * a * u * (1.0 - u) * (1.0 - u) + 3.0 * b * u * u * (1.0 - u) + u * u * u


## Text coloured along the Mythic gradient, letter by letter (the web's background-clip: text).
static func sweep_text(ci: CanvasItem, f: Font, pos: Vector2, text: String, fs: int, phase: float, shadow := "drop", alpha := 1.0) -> void:
	var tw := maxf(1.0, f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x)
	if shadow != "":
		var sc := Color(UI.INK, alpha)
		var offs := [Vector2(0, UI.px)]
		if shadow == "outline": offs = [Vector2(0, UI.px), Vector2(UI.px, 0), Vector2(-UI.px, 0)]
		for d in offs: ci.draw_string(f, pos + d, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, sc)
	for k in text.length():
		var cx := f.get_string_size(text.substr(0, k), HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x if k > 0 else 0.0
		ci.draw_string(f, Vector2(pos.x + cx, pos.y), text[k], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(UI.sweep_at(cx / tw / 3.0 + phase), alpha))


## Baseline that centres a line of `f` at `fs` on `mid`.
static func base_at(f: Font, fs: int, mid: float) -> float:
	return roundf(mid + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0)


## Width of a gem price (glyph and number) at `fs`.
static func gem_w(text: String, fs: int) -> float:
	return UI.glyph_size(fs * 1.05) + roundf(fs * 0.25) + UI.text_w(UI.font("700"), text, fs)


## Draws a gem price (the web's .gem-tag) with its left edge at x, centred on `mid`.
static func gem_tag(ci: CanvasItem, x: float, mid: float, text: String, fs: int, col := UI.TEXT, gem_col := GEM, alpha := 1.0) -> float:
	var gs := UI.glyph_size(fs * 1.05)
	UI.draw_glyph(ci, "gem", Vector2(x, roundf(mid - gs / 2.0)), gs, Color(gem_col, alpha), Color(UI.INK, alpha))
	var f := UI.font("700")
	UI.draw_text(ci, f, Vector2(x + gs + roundf(fs * 0.25), base_at(f, fs, mid)), text, fs, Color(col, alpha), "drop", Color(UI.INK, alpha))
	return gs + roundf(fs * 0.25) + UI.text_w(f, text, fs)


## A soft rectangular glow round `r` (CSS drop-shadow 0 0 blur): stacked fading rings.
static func soft_glow(ci: CanvasItem, r: Rect2, col: Color, blur: float) -> void:
	var n := 5
	for i in n:
		var g := blur * float(n - i) / n
		ci.draw_rect(r.grow(g), Color(col, col.a * 0.22))


## A spinning burst of rays (repeating-conic-gradient masked by a radial fade).
static func rays(ci: CanvasItem, c: Vector2, rad: float, col: Color, on_deg: float, period_deg: float, turn: float, inner := 0.0) -> void:
	var n := int(360.0 / period_deg)
	for i in n:
		var a0 := deg_to_rad(i * period_deg) + turn * TAU
		var a1 := a0 + deg_to_rad(on_deg)
		var pts := PackedVector2Array([c + Vector2(cos(a0), sin(a0)) * inner, c + Vector2(cos(a0), sin(a0)) * rad, c + Vector2(cos(a1), sin(a1)) * rad, c + Vector2(cos(a1), sin(a1)) * inner])
		var ca := Color(col, col.a)
		var cb := Color(col, 0.0)
		ci.draw_polygon(pts, PackedColorArray([ca, cb, cb, ca]))


## Draws the shine band clipped to `clip` (a slanted strip of light at x).
static func band(ci: CanvasItem, clip: Rect2, x: float, w: float, slant: float, cols: PackedColorArray) -> void:
	var poly := PackedVector2Array([Vector2(x + slant, clip.position.y), Vector2(x + slant + w, clip.position.y), Vector2(x + w, clip.end.y), Vector2(x, clip.end.y)])
	var box := PackedVector2Array([clip.position, Vector2(clip.end.x, clip.position.y), clip.end, Vector2(clip.position.x, clip.end.y)])
	for cp in Geometry2D.intersect_polygons(poly, box):
		var cc := PackedColorArray()
		for v in cp:
			# Colour across the band (left to right, following the slant).
			var t := clampf((v.x - x - slant * (1.0 - (v.y - clip.position.y) / maxf(1.0, clip.size.y))) / maxf(1.0, w), 0.0, 1.0)
			var i := t * (cols.size() - 1)
			var j := mini(int(i), cols.size() - 2)
			cc.append(cols[j].lerp(cols[j + 1], i - j))
		ci.draw_polygon(cp, cc)


## A ring `w` wide just inside `r`.
static func ring(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:
	ci.draw_rect(Rect2(r.position, Vector2(r.size.x, w)), col)
	ci.draw_rect(Rect2(r.position.x, r.end.y - w, r.size.x, w), col)
	ci.draw_rect(Rect2(r.position.x, r.position.y + w, w, r.size.y - w * 2), col)
	ci.draw_rect(Rect2(r.end.x - w, r.position.y + w, w, r.size.y - w * 2), col)


## A diamond (the cards' tier stars).
static func diamond(ci: CanvasItem, r: Rect2, col: Color) -> void:
	var c := r.get_center()
	ci.draw_colored_polygon(PackedVector2Array([Vector2(c.x, r.position.y), Vector2(r.end.x, c.y), Vector2(c.x, r.end.y), Vector2(r.position.x, c.y)]), col)


## The red stamp ("New!", "-40%"): a ribbon block with an ink edge, turned a little.
static func stamp(ci: CanvasItem, c: Vector2, text: String, fs: int, rot_deg: float, scale := 1.0, alpha := 1.0, pad := Vector2(6, 2.5), base := Transform2D.IDENTITY) -> void:
	var f := UI.spaced("700", fs, 0.08)
	var w := UI.text_w(f, text, fs) + UI.c(pad.x) * 2
	var h := fs + UI.c(pad.y) * 2 + UI.c(1)
	var p := float(UI.px)
	ci.draw_set_transform_matrix(base * Transform2D(deg_to_rad(rot_deg), Vector2(scale, scale), 0.0, c))
	var r := Rect2(-w / 2.0, -h / 2.0, w, h).grow(p)
	ci.draw_rect(r, Color(UI.INK, alpha))
	var i := r.grow(-p)
	ci.draw_rect(i, Color(UI.RIBBON, alpha))
	ci.draw_rect(Rect2(i.position, Vector2(i.size.x, p)), Color(UI.RIBBON_HI, alpha))
	ci.draw_rect(Rect2(i.position.x, i.end.y - p * 2, i.size.x, p * 2), Color(UI.RIBBON_LO, alpha))
	ci.draw_string(f, Vector2(-w / 2.0 + UI.c(pad.x), base_at(f, fs, -p * 0.5)), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, alpha))
	ci.draw_set_transform_matrix(base)


## The checker weave on card backs (CSS conic-gradient tiles), one tile of 8 art pixels.
static var _weave: Texture2D

static func weave() -> Texture2D:
	if _weave != null and _weave.get_width() == UI.px * 8: return _weave
	var img := Image.create_empty(2, 2, false, Image.FORMAT_RGBA8)
	img.set_pixel(1, 0, Color(1, 1, 1, 0.05))
	img.set_pixel(0, 1, Color(1, 1, 1, 0.05))
	img.resize(UI.px * 8, UI.px * 8, Image.INTERPOLATE_NEAREST)
	_weave = ImageTexture.create_from_image(img)
	return _weave


# --- Header ------------------------------------------------------------------------------------

## The Shop's header (the web's .scr-head with shopTabs and the gem chip): the title,
## the Offers / Chests / Forge tabs (a red dot when the forge has something to melt),
## any extra buttons, the gem counter (it counts to a new amount) and Done.
class Head extends Control:
	signal tab(id: String)
	signal done

	const TABS := [["offers", "star", "Offers"], ["chests", "chest", "Chests"], ["forge", "anvil", "Forge"]]

	var on := "offers"
	## Tabs ignore taps (a chest opening).
	var busy := false
	var hide_done := false:
		set(v):
			hide_done = v
			if done_btn != null: done_btn.visible = not v
	var hide_gems := false
	var admin := false
	var forge_ready := false
	var extras: Array[Control] = []
	var done_btn: PxButton
	var _shown := 0.0
	var _from := 0.0
	var _to := 0.0
	var _count := 1.0
	var _bump := 1.0
	var _t := 0.0
	var _tab_r: Array = []
	var _strip := Rect2()
	var _chip := Rect2()
	var _admin_r := Rect2()

	func _init(tab_on: String, more: Array = []) -> void:
		on = tab_on
		mouse_filter = Control.MOUSE_FILTER_PASS
		for b in more:
			extras.append(b)
			add_child(b)
		done_btn = PxButton.new("Done", "check", "primary")
		done_btn.min_w = 6.5
		done_btn.min_h = 2.4
		done_btn.pressed.connect(func(): done.emit())
		add_child(done_btn)
		_shown = CharacterCollection.gems()
		_to = _shown
		forge_ready = Head.forge_has_work()

	## Whether three spares of some tier wait in the forge.
	static func forge_has_work() -> bool:
		for r in CharacterSkins.SKIN_RARITIES:
			if CharacterCollection.forge_into(r) != null and CharacterCollection.spare_count(r) >= CharacterCollection.FORGE_COST: return true
		return false

	func height() -> float:
		return UI.c(6) + UI.r(2.4) + UI.r(0.2)

	## Counts the gem chip up (or down) to `n`.
	func count_to(n: float) -> void:
		if n == _to: return
		_from = _shown
		_to = n
		_count = 0.0
		_bump = 0.0

	func refresh() -> void:
		forge_ready = Head.forge_has_work()
		queue_redraw()

	func _process(dt: float) -> void:
		_t += dt
		if _count < 1.0:
			_count = minf(1.0, _count + dt / 0.45)
			_shown = roundf(_from + (_to - _from) * (1.0 - pow(1.0 - _count, 3.0)))
		if _bump < 1.0: _bump = minf(1.0, _bump + dt / 0.3)
		queue_redraw()

	func _tab_font() -> Font:
		return UI.spaced("700", _tab_fs(), 0.1)

	func _tab_fs() -> int:
		return roundi(UI.r(0.875))

	func relayout() -> void:
		var W := size.x
		var sl := roundf(W * 0.03)
		var top := UI.c(6)
		var row := UI.r(2.4)
		var fs := roundi(UI.r(1.2))
		var tf := UI.spaced("p700", fs, 0.08)
		var p := float(UI.px)
		# Tabs after the title.
		var x := sl + UI.text_w(tf, "SHOP", fs) + UI.r(0.75)
		var th := UI.r(2.1)
		var sh := th + p * 4 + p * 2
		_strip = UI.rround(Rect2(x, top + (row - sh) / 2.0, 0, sh))
		var tx := x + p * 3
		_tab_r.clear()
		var f := _tab_font()
		var gs := UI.glyph_size(_tab_fs() * 1.15)
		for t in TABS:
			var w := UI.r(0.65) * 2 + gs + roundf(_tab_fs() * 0.4) + UI.text_w(f, (t[2] as String).to_upper(), _tab_fs())
			_tab_r.append(UI.rround(Rect2(tx, _strip.position.y + p * 3, w, th)))
			tx += w
		_strip.size.x = tx + p * 3 - _strip.position.x
		# Right to left: Done, the gem chip, the extras.
		done_btn.size = done_btn.custom_minimum_size
		var rx := W - sl - done_btn.size.x
		done_btn.position = Vector2(rx, top + (row - done_btn.size.y) / 2.0).round()
		rx -= UI.r(0.75)
		var cw := _chip_w()
		var ch := float(roundi(UI.r(1.0))) + p * 5 + p * 2
		_chip = UI.rround(Rect2(rx - cw, top + (row - ch) / 2.0, cw, ch))
		rx = _chip.position.x - UI.r(0.75)
		for b in extras:
			b.size = b.custom_minimum_size
			rx -= b.size.x
			b.position = Vector2(rx, top + (row - b.size.y) / 2.0).round()
			rx -= UI.r(0.75)
		var aw := _admin_w()
		_admin_r = UI.rround(Rect2(rx - aw, top + (row - ch) / 2.0, aw, ch))
		queue_redraw()

	func _chip_fs() -> int:
		return roundi(UI.r(1.0))

	func _chip_w() -> float:
		var fs := _chip_fs()
		# Wide enough for the amount it is counting to, so it doesn't jitter.
		var n := str(int(maxf(_to, _shown)))
		return UI.r(0.8) * 2 + UI.glyph_size(fs * 1.1) + UI.r(0.4) + UI.text_w(UI.font("p700"), n, fs) + UI.px * 2

	func _admin_w() -> float:
		var fs := roundi(UI.r(0.8125))
		return UI.r(0.6) * 2 + UI.glyph_size(fs * 1.15) + roundf(fs * 0.35) + UI.text_w(UI.spaced("700", fs, 0.12), "ADMIN", fs) + UI.px * 2

	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT and not e.pressed:
			for i in _tab_r.size():
				if (_tab_r[i] as Rect2).has_point(e.position):
					accept_event()
					if busy or TABS[i][0] == on: return
					Sfx.sfx.play("select")
					tab.emit(TABS[i][0])
					return

	func _draw() -> void:
		var ci := get_canvas_item()
		var W := size.x
		var p := float(UI.px)
		UI.vgrad(ci, Rect2(0, 0, W, height()), [[0.0, Color(0, 0, 0, 0.5)], [1.0, Color(0, 0, 0, 0)]])
		var fs := roundi(UI.r(1.2))
		var f := UI.spaced("p700", fs, 0.08)
		var row := UI.r(2.4)
		var base := roundf(UI.c(6) + (row + f.get_ascent(fs) - f.get_descent(fs)) / 2.0) - UI.px
		UI.draw_text(self, f, Vector2(roundf(W * 0.03), base), "SHOP", fs, UI.GOLD_HI, "outline")
		# The tab strip: a recessed tray, the picked tab raised in violet.
		draw_rect(_strip, UI.INK)
		var tray := _strip.grow(-p)
		draw_rect(tray, Color("#0b0715"))
		draw_rect(Rect2(tray.position, Vector2(tray.size.x, p)), Color("#05030a"))
		draw_rect(Rect2(_strip.position.x, _strip.end.y, _strip.size.x, p), Color(92 / 255.0, 74 / 255.0, 140 / 255.0, 0.35))
		var tf := _tab_font()
		var tfs := _tab_fs()
		var gs := UI.glyph_size(tfs * 1.15)
		for i in _tab_r.size():
			var r: Rect2 = _tab_r[i]
			var t: Array = TABS[i]
			var picked: bool = t[0] == on
			if picked:
				draw_rect(r.grow(p), UI.INK)
				UI.vgrad(ci, r, [[0.0, Color("#4a3a86")], [1.0, Color("#2c2156")]])
				draw_rect(Rect2(r.position, Vector2(r.size.x, p)), Color("#7a66c0"))
				draw_rect(Rect2(r.position.x, r.end.y - p * 2, r.size.x, p * 2), Color("#1a1236"))
			var mid := r.position.y + (r.size.y - p) / 2.0
			var x := r.position.x + UI.r(0.65)
			UI.draw_glyph(self, t[1], Vector2(x, roundf(mid - gs / 2.0)), gs, UI.GOLD if picked else UI.DIM, UI.INK if picked else Color(0, 0, 0, 0))
			x += gs + roundf(tfs * 0.4)
			UI.draw_text(self, tf, Vector2(x, ShopKit.base_at(tf, tfs, mid)), (t[2] as String).to_upper(), tfs, UI.GOLD_HI if picked else UI.DIM)
			if t[0] == "forge" and forge_ready and fmod(_t, 1.4) < 0.91:
				var d := Rect2(r.end.x - p * 4, r.position.y + p, p * 3, p * 3)
				draw_rect(d.grow(p), UI.INK)
				draw_rect(d, UI.RED)
		if admin: _draw_admin()
		if not hide_gems: _draw_chip()

	func _draw_admin() -> void:
		var r := _admin_r
		var p := float(UI.px)
		var ci := get_canvas_item()
		draw_rect(r, UI.INK)
		var i := r.grow(-p)
		UI.vgrad(ci, i, [[0.0, Color("#5a3f12")], [1.0, Color("#2e1f08")]])
		draw_rect(Rect2(i.position, Vector2(i.size.x, p)), Color(1, 228 / 255.0, 150 / 255.0, 0.35))
		draw_rect(Rect2(i.position.x, i.end.y - p * 2, i.size.x, p * 2), Color(0, 0, 0, 0.45))
		var fs := roundi(UI.r(0.8125))
		var f := UI.spaced("700", fs, 0.12)
		var gs := UI.glyph_size(fs * 1.15)
		var mid := i.position.y + (i.size.y - p) / 2.0
		var x := i.position.x + UI.r(0.6)
		UI.draw_glyph(self, "crown", Vector2(x, roundf(mid - gs / 2.0)), gs, UI.GOLD, UI.INK)
		UI.draw_text(self, f, Vector2(x + gs + roundf(fs * 0.35), ShopKit.base_at(f, fs, mid)), "ADMIN", fs, UI.GOLD_HI)

	func _draw_chip() -> void:
		var r := _chip
		var p := float(UI.px)
		var ci := get_canvas_item()
		# The bump: up to 112% and back over 300 ms.
		var s := 1.0 + 0.12 * (sin(_bump * PI) if _bump < 1.0 else 0.0)
		draw_set_transform(r.get_center() * (1.0 - s), 0.0, Vector2(s, s))
		draw_rect(r, UI.INK)
		var i := r.grow(-p)
		UI.vgrad(ci, i, [[0.0, Color("#1a2a4a")], [1.0, Color("#0e1426")]])
		var ring := Color(111 / 255.0, 232 / 255.0, 1.0, 0.25)
		draw_rect(Rect2(i.position, Vector2(i.size.x, p * 2)), ring)
		draw_rect(Rect2(i.position.x, i.end.y - p * 2, i.size.x, p * 2), ring)
		draw_rect(Rect2(i.position.x, i.position.y + p * 2, p * 2, i.size.y - p * 4), ring)
		draw_rect(Rect2(i.end.x - p * 2, i.position.y + p * 2, p * 2, i.size.y - p * 4), ring)
		draw_rect(Rect2(i.position, Vector2(i.size.x, p)), Color(1, 1, 1, 0.12))
		draw_rect(Rect2(i.position.x, i.end.y - p * 2, i.size.x, p * 2), Color(0, 0, 0, 0.45))
		var fs := _chip_fs()
		var f := UI.font("p700")
		var gs := UI.glyph_size(fs * 1.1)
		var mid := i.position.y + (i.size.y - p) / 2.0
		var x := i.position.x + UI.r(0.8) - p
		UI.draw_glyph(self, "gem", Vector2(x, roundf(mid - gs / 2.0)), gs, ShopKit.GEM)
		UI.draw_text(self, f, Vector2(x + gs + UI.r(0.4), ShopKit.base_at(f, fs, mid)), str(int(_shown)), fs, UI.TEXT)
		draw_set_transform(Vector2.ZERO)


# --- Price buttons ------------------------------------------------------------------------------

## A button made of parts in a row: glyphs, words and gem prices (the web's .btn.buy and
## .buy-btn). `between` pushes the last part to the right end (a price). `armed` blinks it
## green ("Buy?"), `short` greys it with the price in red, `nope()` shakes it.
class Btn extends PxButton:
	## [{"g": glyph} | {"t": text} | {"gem": text}] with optional "c" (colour).
	var parts: Array = []
	var between := false
	var armed := false:
		set(v):
			armed = v
			set_process(true)
			queue_redraw()
	var short := false
	var _nope := 1.0
	var _pad := 0.0

	func _init(p: Array, st := "", sz := "") -> void:
		super("", "", st, sz)
		parts = p

	func set_parts(p: Array) -> void:
		parts = p
		refit()

	func nope() -> void:
		_nope = 0.0
		set_process(true)

	func _ready() -> void:
		refit()
		set_process(true)

	func _palette() -> Array:
		if armed: return [Color("#2f8a4e"), Color("#5fd07e"), Color("#144626"), UI.TEXT]
		if short: return [Color("#3a3150"), Color("#554a70"), Color("#1e182e"), UI.MUTED]
		return super()

	func _part_w(pt: Dictionary, fs: int) -> float:
		if pt.has("g"): return _glyph_px()
		if pt.has("gem"): return UI.c(6) * 2 + ShopKit.gem_w(str(pt["gem"]), fs)
		return UI.text_w(_font(), (pt["t"] as String).to_upper(), fs)

	func _gap(fs: int) -> float:
		return roundf(fs * 0.45)

	func _fit() -> void:
		super()
		var fs := _font_size()
		var w := 0.0
		for i in parts.size():
			w += _part_w(parts[i], fs) + (_gap(fs) if i > 0 else 0.0)
		_pad = UI.r(0.7) if size_kind == "sm" else UI.r(1.1)
		if min_w > 0.0: w = maxf(w + _pad * 2, UI.r(min_w))
		else: w += _pad * 2
		custom_minimum_size.x = ceilf(w)

	func _process(dt: float) -> void:
		_t += dt
		if _nope < 1.0: _nope = minf(1.0, _nope + dt / 0.3)
		queue_redraw()

	func _draw() -> void:
		# The shake (CSS shake 300 ms) and the armed blink (brightness 1.25 every other 300 ms).
		var dx := 0.0
		if _nope < 1.0: dx = UI.c(4) * (-1.0 if _nope < 0.5 else 1.0) * sin(_nope * TAU) * 1.4
		self_modulate = Color(1.25, 1.25, 1.25) if armed and fmod(_t, 0.6) >= 0.3 else Color.WHITE
		draw_set_transform(Vector2(roundf(dx), 0))
		var saved := text
		text = ""
		var g := glyph
		glyph = ""
		var gm := gem
		gem = -1
		super()
		text = saved
		glyph = g
		gem = gm
		_draw_parts()
		draw_set_transform(Vector2.ZERO)

	func _draw_parts() -> void:
		var p := float(UI.px)
		var held := _down and _inside
		var r := Rect2(Vector2(0, p if held else 0.0), size)
		var fs := _font_size()
		var pal := _palette()
		var fg: Color = pal[3]
		var shade := Color(1, 0.94, 0.75, 0.6) if style == "primary" and not armed and not short else Color(0.04, 0.02, 0.07, 0.55)
		var mid := r.position.y + (r.size.y - p * (2.0 if size_kind == "sm" else 3.0) + p) / 2.0
		var total := 0.0
		for i in parts.size(): total += _part_w(parts[i], fs) + (_gap(fs) if i > 0 else 0.0)
		var x := roundf(r.position.x + (r.size.x - total) / 2.0)
		if between: x = r.position.x + _pad
		var f := _font()
		for i in parts.size():
			var pt: Dictionary = parts[i]
			var w := _part_w(pt, fs)
			if between and i == parts.size() - 1 and i > 0: x = r.end.x - _pad - w
			var col: Color = pt.get("c", fg)
			if pt.has("g"):
				var gs := _glyph_px()
				UI.draw_glyph(self, pt["g"], Vector2(x, roundf(mid - gs / 2.0)), gs, col, shade)
			elif pt.has("gem"):
				var tr := Rect2(x, roundf(mid - fs / 2.0 - UI.c(3)), w, fs + UI.c(6))
				draw_rect(tr, Color(0, 0, 0, 0.35))
				var tc: Color = UI.RED if short else pt.get("c", UI.TEXT if style == "primary" and not armed else fg)
				if style == "primary" and not armed and not short: tc = UI.TEXT
				ShopKit.gem_tag(self, x + UI.c(6), mid, str(pt["gem"]), fs, tc)
			else:
				var up := (pt["t"] as String).to_upper()
				var base := ShopKit.base_at(f, fs, mid)
				draw_string(f, Vector2(x, base + p), up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, shade)
				draw_string(f, Vector2(x, base), up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
			x += w + _gap(fs)


# --- Cards ----------------------------------------------------------------------------------------

## A pulled skin's card (the web's .gcard): its back (a weave, gold corners and a wax seal
## with the chest) and its front (tier, stars, the skin's art on a halo, name, item, New! or
## +1 spare). Big: the single reveal. Small: one of ten. It flies in from a point (dealt out
## of the chest, or rising spinning from it), turns over, and the best ones shine.
class Card extends Control:
	var pull: Dictionary
	var skin: Dictionary
	var big := false
	var tier := "rare"
	## Seconds since it was turned over (< 0: face down).
	var flip_t := -1.0
	var tease := false
	var glory_t := -1.0
	var best := false
	var best_t := 0.0
	## The flight in: "deal" or "rise", from `fly_from` (device px from its own centre).
	var fly := ""
	var fly_from := Vector2.ZERO
	var fly_t := 0.0
	var fly_delay := 0.0
	var _t := 0.0
	var _name: Rich.Layout
	var _set = null
	var _pieces: Array = []
	var _owned := 0
	var _turn := randf()
	var _xf := Transform2D.IDENTITY

	func _init(p: Dictionary, is_big: bool) -> void:
		pull = p
		skin = p["skin"]
		big = is_big
		tier = skin["rarity"]
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
		if skin.get("set") != null:
			_set = CharacterSkins.SKIN_SET_BY_ID.get(skin["set"])
			_pieces = CharacterSkins.set_pieces(skin["set"])
			for x in _pieces:
				if CharacterCollection.owns(x["id"]): _owned += 1

	static func small_size() -> Vector2:
		return Vector2(UI.r(5.8), UI.r(7.6))

	static func big_size(screen_h: float) -> Vector2:
		return Vector2(UI.r(12), minf(UI.r(17), screen_h - UI.r(7.6)))

	func flipped() -> bool:
		return flip_t >= 0.0

	func turn_over() -> void:
		if flip_t < 0.0: flip_t = 0.0
		tease = false

	func deal(from: Vector2, delay: float) -> void:
		fly = "deal"
		fly_from = from
		fly_t = 0.0
		fly_delay = delay

	func rise(from: Vector2) -> void:
		fly = "rise"
		fly_from = from
		fly_t = 0.0

	func glory() -> void:
		glory_t = 0.0

	func _process(dt: float) -> void:
		_t += dt
		fly_t += dt
		if flip_t >= 0.0: flip_t += dt
		if glory_t >= 0.0: glory_t += dt
		if best: best_t += dt
		queue_redraw()

	## Where it is drawn now: offset, turn, scale, opacity, and how far it has turned over.
	func _pose() -> Dictionary:
		var off := Vector2.ZERO
		var rot := 0.0
		var s := 1.0
		var a := 1.0
		if fly == "deal":
			var k := (fly_t - fly_delay) / 0.46
			var e := ShopKit.bez(0.2, 1.2, 0.4, 1.0, k)
			off = fly_from * (1.0 - e)
			s = lerpf(0.15, 1.0, e)
			rot = deg_to_rad(-20.0) * (1.0 - e)
			a = clampf((fly_t - fly_delay) / 0.2, 0.0, 1.0)
		elif fly == "rise":
			var k := fly_t / 0.56
			var e := ShopKit.bez(0.2, 1.15, 0.35, 1.0, k)
			off = fly_from * (1.0 - e)
			s = lerpf(0.12, 1.0, e)
			rot = deg_to_rad(-200.0) * (1.0 - e)
			a = clampf(k / 0.25, 0.0, 1.0)
		if big and flip_t >= 0.56:
			# card-land: a little bump once it is down.
			var k := (flip_t - 0.56) / 0.5
			if k < 1.0: s *= 1.0 + 0.08 * (k / 0.3 if k < 0.3 else 1.0 - (k - 0.3) / 0.7)
		if glory_t >= 0.0 and glory_t < 0.6:
			var k := glory_t / 0.6
			s *= 1.0 + 0.25 * (k / 0.4 if k < 0.4 else 1.0 - (k - 0.4) / 0.6)
		if best and best_t > 0.7:
			off.y -= UI.px * 3 * (0.5 - 0.5 * cos(TAU * (best_t - 0.7) / 1.6))
		if tease and flip_t < 0.0:
			var side := 1.0 if int(_t / 0.055) % 2 == 0 else -1.0
			off.x += UI.px * side
			rot += deg_to_rad(2.0) * side
		var ang := PI
		if flip_t >= 0.0: ang = PI * (1.0 - ShopKit.bez(0.3, 1.5, 0.5, 1.0, flip_t / 0.42))
		return {"off": off, "rot": rot, "s": s, "a": a, "cos": cos(ang)}

	func _draw() -> void:
		var q := _pose()
		if q["a"] <= 0.0: return
		modulate.a = q["a"]
		var sx: float = absf(q["cos"])
		var c := size / 2.0
		_xf = Transform2D(q["rot"], Vector2(q["s"] * maxf(0.02, sx), q["s"]), 0.0, c + q["off"])
		draw_set_transform_matrix(_xf)
		var r := Rect2(-c, size)
		if q["cos"] > 0.0: _front(r)
		else: _back(r)
		draw_set_transform(Vector2.ZERO)

	func _rc() -> Color:
		return ShopKit.TIER_C[tier]

	func _glow_c() -> Color:
		return ShopKit.TIER_GLOW[tier]

	# The back: weave, gold rings and corners, the tier glowing through, and the seal.
	func _back(r: Rect2) -> void:
		var ci := get_canvas_item()
		var p := float(UI.px)
		UI.notch_rect(ci, r, UI.INK, p)
		var i := r.grow(-p * 2)
		UI.vgrad(ci, i, [[0.0, Color("#2c2056")], [1.0, Color("#120c24")]])
		draw_texture_rect(ShopKit.weave(), i, true)
		UI.glow(ci, i.get_center(), Vector2(i.size.x, i.size.x) * 0.5, Color(176 / 255.0, 154 / 255.0, 1.0, 0.28))
		# The tier shining in from the edges (stronger while it shakes).
		var gc := _glow_c()
		var depth := UI.r(2.4 if tease else 1.4)
		for k in 6:
			var g := depth * k / 6.0
			_ring(i.grow(-g), Color(gc, gc.a * 0.16 * (1.0 - k / 6.0)), depth / 6.0)
		_ring(i, _rc() if tease else UI.GOLD_LO, p)
		_ring(i.grow(-p), Color("#1a1230"), p)
		_ring(i.grow(-p * 2), Color(UI.GOLD, 0.45), p)
		for k in 2:
			var cr := i.grow(-p * (5 + k * 2))
			var col := Color(UI.GOLD, 1.0 if k == 0 else 0.4)
			for corner in [cr.position, Vector2(cr.end.x - p, cr.position.y), Vector2(cr.position.x, cr.end.y - p), cr.end - Vector2(p, p)]:
				var dx := 1.0 if corner.x < cr.get_center().x else -1.0
				var dy := 1.0 if corner.y < cr.get_center().y else -1.0
				var x0: float = corner.x if dx > 0 else corner.x - p * 4
				var y0: float = corner.y if dy > 0 else corner.y - p * 4
				draw_rect(Rect2(x0, corner.y, p * 5, p), col)
				draw_rect(Rect2(corner.x, y0, p, p * 5), col)
		# The wax seal with the chest pressed in.
		var sr := i.size.x * 0.58 / 2.0
		var sc := i.get_center()
		if tease: UI.glow(ci, sc, Vector2(sr, sr) * 2.4, Color(gc, 0.8))
		UI.glow(ci, sc, Vector2(sr, sr) * 1.9, Color(242 / 255.0, 181 / 255.0, 66 / 255.0, 0.35))
		draw_circle(sc + Vector2(0, p * 2), sr + p, UI.INK)
		draw_circle(sc, sr + p, UI.INK)
		var stops := [[1.0, Color("#7a420e")], [0.8, Color("#b06c1e")], [0.55, Color("#f2b542")], [0.3, Color("#ffd870")], [0.12, Color("#ffe58f")]]
		for st in stops:
			var k: float = st[0]
			draw_circle(sc + Vector2(-0.1, -0.15) * sr * (1.0 - k), sr * k, st[1])
		var gs := UI.glyph_size(sr * 2 * 0.62)
		var gp := sc - Vector2(gs, gs) / 2.0
		UI.draw_glyph(self, "chest", gp, gs, Color("#5a2e08"), Color(1, 240 / 255.0, 180 / 255.0, 0.6))

	func _ring(r: Rect2, col: Color, w: float) -> void:
		draw_rect(Rect2(r.position, Vector2(r.size.x, w)), col)
		draw_rect(Rect2(r.position.x, r.end.y - w, r.size.x, w), col)
		draw_rect(Rect2(r.position.x, r.position.y + w, w, r.size.y - w * 2), col)
		draw_rect(Rect2(r.end.x - w, r.position.y + w, w, r.size.y - w * 2), col)

	# Sizes of the front's pieces (big or small).
	func _m() -> Dictionary:
		if big: return {"pad": Vector2(UI.c(10), UI.c(10)), "gap": UI.c(5), "tier": roundi(UI.r(0.875)), "tpad": Vector2(UI.c(4), UI.c(5)), "star": UI.px * 5, "art": UI.r(6.0), "name": roundi(UI.r(1.05)), "item": roundi(UI.r(0.6875)), "new": roundi(UI.r(0.875)), "dupe": roundi(UI.r(0.8125))}
		return {"pad": Vector2(UI.c(4), UI.c(6)), "gap": UI.c(2), "tier": roundi(UI.r(0.625)), "tpad": Vector2(UI.c(2), UI.c(3)), "star": UI.px * 3, "art": UI.r(2.9), "name": roundi(UI.r(0.75)), "item": 0, "new": roundi(UI.r(0.625)), "dupe": roundi(UI.r(0.625))}

	func _front(r: Rect2) -> void:
		var ci := get_canvas_item()
		var p := float(UI.px)
		var m := _m()
		var rc := _rc()
		var gc := _glow_c()
		var ph := ShopKit.sweep_phase()
		var epic := tier == "epic"
		# The glow round a turned card (brighter for the best of ten).
		ShopKit.soft_glow(self, r, Color(gc, gc.a * (1.0 if best else 0.6)), UI.r(1.2 if best else 0.5))
		if epic:
			var rid := ci
			UI.notch_rect(rid, r, UI.INK, p)
			for s in [Rect2(r.position.x + p, r.position.y, r.size.x - p * 2, p * 2), Rect2(r.position.x + p, r.end.y - p * 2, r.size.x - p * 2, p * 2), Rect2(r.position.x, r.position.y + p, p * 2, r.size.y - p * 2), Rect2(r.end.x - p * 2, r.position.y + p, p * 2, r.size.y - p * 2)]:
				UI.sweep_band(rid, s, ph)
		else:
			UI.notch_rect(ci, r, UI.INK, p)
		var i := r.grow(-p * 2)
		UI.vgrad(ci, i, [[0.0, Color("#241a3c")], [1.0, Color("#0e0918")]])
		UI.glow(ci, Vector2(i.get_center().x, i.position.y + i.size.y * 0.42), Vector2(i.size.x * 0.56, i.size.y * 0.35), gc, 1.2)
		_ring(i, rc, p)
		draw_rect(Rect2(i.position.x + p, i.end.y - p * 3, i.size.x - p * 2, p * 2), Color(0, 0, 0, 0.4))
		# Rows: tier, stars, art (the rest), name, item, set, stamp.
		var pad: Vector2 = m["pad"]
		var gap: float = m["gap"]
		var x0 := i.position.x + pad.x
		var w := i.size.x - pad.x * 2
		var tfs: int = m["tier"]
		var tpad: Vector2 = m["tpad"]
		var tf := UI.spaced("700", tfs, 0.16)
		var band_h := tfs + tpad.x + tpad.y
		var y := i.position.y
		var br := Rect2(x0, y, w, band_h)
		if epic: UI.sweep_band(ci, br, ph)
		else: draw_rect(br, rc)
		var tn := ShopKit.tier_name(tier).to_upper()
		draw_string(tf, Vector2(roundf(br.get_center().x - UI.text_w(tf, tn, tfs) / 2.0), ShopKit.base_at(tf, tfs, br.position.y + tpad.x + tfs / 2.0)), tn, HORIZONTAL_ALIGNMENT_LEFT, -1, tfs, UI.INK)
		y += band_h + gap + UI.c(2)
		var st: float = m["star"]
		var n := ShopKit.rank(tier) + 1
		var sw := n * st + (n - 1) * UI.c(2)
		for k in n:
			var sr := Rect2(roundf(i.get_center().x - sw / 2.0 + k * (st + UI.c(2))), y, st, st)
			ShopKit.diamond(self, Rect2(sr.position + Vector2(0, p), sr.size), UI.INK)
			ShopKit.diamond(self, sr, UI.sweep_at(float(k) / maxf(1, n) / 4.0 + ph) if epic else rc)
		y += st + gap
		# Bottom up: stamp, set, item, name.
		var bottom := i.end.y - pad.y
		var stamp_h := 0.0
		if pull.get("fresh", false): stamp_h = m["new"] + UI.c(6) + p * 2
		else: stamp_h = m["dupe"] + UI.c(2)
		var stamp_y := bottom - stamp_h
		bottom = stamp_y - gap
		var set_h := 0.0
		if big and _set != null:
			set_h = roundi(UI.r(0.8125)) + UI.c(3) + UI.c(6) + UI.c(3) + roundi(UI.r(0.6875)) + UI.c(2)
			bottom -= set_h + gap
		var item_h := 0.0
		if big:
			item_h = m["item"] + UI.c(2)
			bottom -= item_h + gap
		var nfs: int = m["name"]
		if _name == null or _name.lh != roundf(nfs * 1.05):
			_name = Rich.layout([Rich.run(skin["name"], UI.font("700"), nfs, UI.TEXT, "drop")], w, roundf(nfs * 1.05), 2)
		var name_y := bottom - _name.h
		# The art fills what is left, on its halo (and slow rays for the best two tiers).
		var art_r := Rect2(x0, y, w, maxf(0.0, name_y - gap - y))
		var ac := art_r.get_center()
		if ShopKit.rank(tier) >= 2:
			var rr := art_r.size.x * 0.75
			ShopKit.rays(self, ac, rr * 0.62 / 0.62, Color(rc, 0.3), 8, 22, _t / 9.0 + _turn, rr * 0.15)
		UI.glow(ci, ac, Vector2(art_r.size.x * 0.36, art_r.size.y * 0.42), gc, 1.3)
		var ah := minf(art_r.size.y, m["art"])
		var ic = GearIcons.get_icon(skin["gear"], skin["id"], queue_redraw)
		if ic != null: GearIcons.draw(self, ic, Rect2(ac - Vector2(ah, ah) / 2.0, Vector2(ah, ah)))
		_name.draw(self, Vector2(x0, name_y), 0.5, w)
		var yy := name_y + _name.h + gap
		if big:
			var g: Dictionary = SimGear.gear_of(skin["gear"])
			var ifs: int = m["item"]
			var itf := UI.spaced("500", ifs, 0.05)
			var it := ("%s · %s" % [g["name"], SimGear.SLOT_NAMES[g["slot"]]]).to_upper()
			while it.length() > 3 and UI.text_w(itf, it, ifs) > w: it = it.substr(0, it.length() - 2) + "…"
			draw_string(itf, Vector2(roundf(i.get_center().x - UI.text_w(itf, it, ifs) / 2.0), ShopKit.base_at(itf, ifs, yy + item_h / 2.0)), it, HORIZONTAL_ALIGNMENT_LEFT, -1, ifs, UI.MUTED)
			yy += item_h + gap
			if _set != null: _draw_set(i.get_center().x, yy, ph)
		# New! (stamped on) or the spare it became.
		if pull.get("fresh", false):
			var k := clampf((flip_t - 0.25) / 0.35, 0.0, 1.0)
			if k > 0.0:
				var e := ShopKit.bez(0.2, 1.8, 0.4, 1.0, k)
				ShopKit.stamp(self, Vector2(i.get_center().x, stamp_y + stamp_h / 2.0), "NEW!", m["new"], -4.0, lerpf(2.4, 1.0, e), k, Vector2(6, 2.5), _xf)
		else:
			var dfs: int = m["dupe"]
			var df := UI.font("500")
			var t := "Owned · +1 spare" if big else "+1 spare"
			var gs := UI.glyph_size(dfs * 1.1)
			var tw := gs + UI.c(2) + UI.text_w(df, t, dfs)
			var x := roundf(i.get_center().x - tw / 2.0)
			var mid := stamp_y + stamp_h / 2.0
			UI.draw_glyph(self, "anvil", Vector2(x, roundf(mid - gs / 2.0)), gs, UI.GOLD)
			draw_string(df, Vector2(x + gs + UI.c(2), ShopKit.base_at(df, dfs, mid)), t, HORIZONTAL_ALIGNMENT_LEFT, -1, dfs, UI.MUTED)
		# Holo foil over the better tiers, and a moving shine on the best two.
		if ShopKit.rank(tier) >= 1 and flip_t > 0.3:
			var fa := clampf((flip_t - 0.3) / 0.4, 0.0, 1.0) * (0.9 if epic else 0.55) * 0.35
			var u := 0.5 + 0.5 * sin(_t * PI / 3.2)
			var fx := i.position.x + lerpf(-i.size.x * 0.9, i.size.x * 0.9, u)
			ShopKit.band(self, i, fx, i.size.x * 0.9, i.size.y * 0.5, PackedColorArray([Color(1, 0.47, 0.78, 0.0), Color(1, 0.47, 0.78, fa), Color(0.47, 0.86, 1, fa), Color(1, 0.94, 0.55, fa), Color(1, 0.94, 0.55, 0.0)]))
		if ShopKit.rank(tier) >= 2 and flip_t > 0.6:
			var k := fmod(flip_t - 0.6, 2.4) / 2.4
			if k < 0.6:
				var e := k / 0.6
				var sx := i.position.x + lerpf(i.size.x * 1.1, -i.size.x * 0.6, e)
				ShopKit.band(self, i, sx, i.size.x * 0.3, i.size.y * 0.27, PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 0.45), Color(1, 1, 1, 0)]))

	func _draw_set(cx: float, y: float, ph: float) -> void:
		var fs := roundi(UI.r(0.8125))
		var f := UI.font("700")
		var name: String = _set["name"]
		ShopKit.sweep_text(self, f, Vector2(roundf(cx - UI.text_w(f, name, fs) / 2.0), y + f.get_ascent(fs)), name, fs, ph, "")
		y += fs + UI.c(3)
		var n := _pieces.size()
		var pw := n * UI.c(6) + (n - 1) * UI.c(2)
		for k in n:
			var r := Rect2(roundf(cx - pw / 2.0 + k * UI.c(8)), y, UI.c(6), UI.c(6))
			if CharacterCollection.owns(_pieces[k]["id"]):
				draw_rect(r, UI.sweep_at(float(k) / n / 6.0 + ph) if _owned == n else ShopKit.TIER_C["epic"])
			else:
				draw_rect(r, Color("#4a3a6a"))
				draw_rect(r.grow(-1), Color("#2a2140"))
		y += UI.c(6) + UI.c(3)
		var sfs := roundi(UI.r(0.6875))
		var sf := UI.font("500")
		var t := "Set complete!" if _owned == n else "%d/%d owned" % [_owned, n]
		draw_string(sf, Vector2(roundf(cx - UI.text_w(sf, t, sfs) / 2.0), y + sf.get_ascent(sfs)), t, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)


# --- The omen's banner ------------------------------------------------------------------------------

## The tier name slammed across the screen for a legendary or mythic pull: letters
## dropping in one after another and bobbing, gold bands or the Mythic sweep, and a
## line under it.
class TierBanner extends Control:
	var tier := ""
	var _t := -1.0
	var _mat: ShaderMaterial

	func _init() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		visible = false
		# Letters drawn in the marker colour get the gold bands, by their own height.
		var sh := Shader.new()
		sh.code = """shader_type canvas_item;
uniform float top;
uniform float h;
varying vec4 v_col;
varying float v_y;
void vertex() { v_col = COLOR; v_y = VERTEX.y; }
void fragment() {
	vec4 t = texture(TEXTURE, UV);
	if (v_col.r > 0.99 && v_col.g < 0.01 && v_col.b > 0.99) {
		float k = (v_y - top) / h;
		vec3 c = k < 0.4 ? vec3(1.0, 0.965, 0.753) : (k < 0.75 ? vec3(1.0, 0.69, 0.25) : vec3(0.753, 0.416, 0.063));
		COLOR = vec4(c, t.a * v_col.a);
	} else {
		COLOR = t * v_col;
	}
}
"""
		_mat = ShaderMaterial.new()
		_mat.shader = sh
		material = _mat

	func slam(r: String) -> void:
		tier = r
		_t = 0.0
		visible = true

	func hide_banner() -> void:
		visible = false
		_t = -1.0

	func _process(dt: float) -> void:
		if _t < 0.0: return
		_t += dt
		queue_redraw()

	func _fs() -> int:
		return roundi(minf(UI.r(5.6), maxf(UI.r(2.8), size.x / UI.dp * 0.11 * UI.dp)))

	func _draw() -> void:
		if _t < 0.0: return
		var word := "%s!" % ShopKit.tier_name(tier).to_upper()
		var fs := _fs()
		var f := UI.spaced("p700", fs, 0.06)
		var p := float(UI.px)
		var rc: Color = ShopKit.TIER_C[tier]
		var tw := UI.text_w(f, word, fs)
		var x0 := roundf((size.x - tw) / 2.0)
		var base := roundf(size.y * 0.05 + f.get_ascent(fs))
		_mat.set_shader_parameter("top", -f.get_ascent(fs) * 0.92)
		_mat.set_shader_parameter("h", f.get_ascent(fs) * 0.92)
		UI.glow(get_canvas_item(), Vector2(size.x / 2.0, base - fs * 0.4), Vector2(tw * 0.62, fs * 1.1), Color(rc, 0.35 * clampf(_t / 0.3, 0.0, 1.0)))
		var ph := ShopKit.sweep_phase(2.0)
		for i in word.length():
			var ch := word[i]
			var cx := f.get_string_size(word.substr(0, i), HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x if i > 0 else 0.0
			var cw := f.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			var k := (_t - i * 0.045) / 0.42
			if k <= 0.0: continue
			var e := ShopKit.bez(0.2, 1.7, 0.4, 1.0, k)
			var a := clampf(k * 2.0, 0.0, 1.0)
			var s := lerpf(2.6, 1.0, e)
			var dy := lerpf(-1.2 * fs, 0.0, e)
			var rot := deg_to_rad(lerpf(-12.0, 0.0, e))
			var bob_t := _t - 0.5 - i * 0.08
			if bob_t > 0.0 and int(bob_t / 0.6) % 2 == 1: dy -= p * 2
			# Each letter turns about its own middle.
			var c := Vector2(x0 + cx + cw / 2.0, base + dy - fs * 0.35)
			draw_set_transform(c, rot, Vector2(s, s))
			var o := Vector2(-cw / 2.0, fs * 0.35)
			for d in [Vector2(0, p * 2), Vector2(p * 2, 0), Vector2(-p * 2, 0), Vector2(0, -p * 2), Vector2(p * 2, p * 2), Vector2(-p * 2, p * 2)]:
				draw_string(f, o + d, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(UI.INK, a))
			var col := Color(1, 0, 1, a)
			if tier == "epic": col = Color(UI.sweep_at((cx + cw / 2.0) / tw / 3.0 + ph), a)
			elif tier != "legendary": col = Color(rc, a)
			draw_string(f, o, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
		draw_set_transform(Vector2.ZERO)
		var sa := clampf((_t - 0.45) / 0.4, 0.0, 1.0)
		if sa > 0.0:
			var sfs := roundi(UI.r(0.8125))
			var sf := UI.spaced("700", sfs, 0.2)
			var t := ("The rarest skin of all" if tier == "epic" else "A legendary skin").to_upper()
			UI.draw_text(self, sf, Vector2(roundf((size.x - UI.text_w(sf, t, sfs)) / 2.0), base + f.get_descent(fs) + UI.r(0.3) + sf.get_ascent(sfs)), t, sfs, Color(UI.TEXT, sa), "outline", Color(UI.INK, sa))
