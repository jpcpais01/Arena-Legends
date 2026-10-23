class_name UI
## The menus' look (the web's ui/styles.css and ui/frames.ts): the scale, the
## palette, the fonts, text styles and the pixel frames. Menus are laid out in
## device pixels from three units:
##  - `dp`: device pixels per CSS pixel (the web on a phone held sideways is
##    873x393 CSS px, so the layout matches it at any resolution),
##  - `rem`: the root font size (14 CSS px, as on phones),
##  - `px`: one UI art pixel, a whole number of device pixels (frames, bevels,
##    glyphs and text shadows are drawn in it, so every pixel is the same size).

static var dp := 1.0
static var rem := 14.0
static var px := 3

const BG := Color("#0f0b18")
const PANEL := Color("#1d1630")
const PANEL2 := Color("#281f40")
const PANEL3 := Color("#34294f")
const FACE := Color("#1a1329")
const INK := Color("#0a0612")
const LINE := Color("#3b2f5c")
const LINE_HI := Color("#5c4a8c")
const TEXT := Color("#f6efe0")
const MUTED := Color("#a99cc6")
const DIM := Color("#6f6494")
const GOLD := Color("#f2b542")
const GOLD_HI := Color("#ffe58f")
const GOLD_LO := Color("#b06c1e")
const GOLD_INK := Color("#2a1606")
const RIBBON := Color("#b8293f")
const RIBBON_HI := Color("#e04a5a")
const RIBBON_LO := Color("#6e1428")
const CYAN := Color("#6fd8ff")
const RED := Color("#ef5a62")
const BLUE := Color("#4f94f5")
const GREEN := Color("#62d47a")
const PURPLE := Color("#b47eff")
## Player-facing tier colours by internal rarity id (internal "epic" is shown as Mythic).
const RARITY := {"common": Color("#c8c0d8"), "rare": Color("#5aa8ff"), "mythic": Color("#c27aff"), "legendary": Color("#ffb040"), "epic": Color("#7ff0e0")}


## Sizes the units for a screen (call on start and on every resize).
static func setup(screen: Vector2) -> void:
	dp = clampf(minf(screen.x / 873.0, screen.y / 393.0), 1.0, 8.0)
	rem = 14.0 * dp
	px = maxi(1, roundi(rem / 6.0))


## `n` rem in device pixels.
static func r(n: float) -> float:
	return roundf(n * rem)


## A rect snapped to whole pixels.
static func rround(r: Rect2) -> Rect2:
	return Rect2(r.position.round(), r.size.round())


## `n` CSS pixels in device pixels.
static func c(n: float) -> float:
	return roundf(n * dp)


# --- Fonts ------------------------------------------------------------------------------

static var _fonts := {}

## "500", "600", "700" (Rubik), "900i" (Rubik black italic), "p500".."p700" (Pixelify Sans,
## whose digits come from Rubik: its 5 reads as an S and its 2 as a Z on a phone).
static func font(kind: String = "500") -> Font:
	var f = _fonts.get(kind)
	if f != null: return f
	if kind.begins_with("p"):
		var ff: FontFile = load("res://assets/fonts/pixel-%s.woff2" % kind.substr(1)).duplicate()
		ff.fallbacks = [font("700")]
		f = ff
	else:
		f = load("res://assets/fonts/rubik-%s.woff2" % kind)
	_fonts[kind] = f
	return f


## The font with letter spacing (`em` of the size), as CSS letter-spacing.
static func spaced(kind: String, size: int, em: float) -> Font:
	var sp := roundi(size * em)
	if sp == 0: return font(kind)
	var key := "%s@%d" % [kind, sp]
	var f = _fonts.get(key)
	if f != null: return f
	var v := FontVariation.new()
	v.base_font = font(kind)
	v.spacing_glyph = sp
	_fonts[key] = v
	return v


# --- Text -------------------------------------------------------------------------------

## Text shadow styles: "" none, "drop" (one art pixel down, ink), "outline" (the web's
## --outline: an ink ring one art pixel wide and a second pixel below), "name"
## (down and right), "soft" (one pixel down, half ink).
static func label_settings(size_rem: float, kind := "500", color := TEXT, shadow := "drop", spacing_em := 0.0) -> LabelSettings:
	var size := maxi(6, roundi(size_rem * rem))
	var ls := LabelSettings.new()
	ls.font = spaced(kind, size, spacing_em)
	ls.font_size = size
	ls.font_color = color
	ls.line_spacing = 0
	match shadow:
		"drop":
			ls.shadow_color = INK
			ls.shadow_size = 0
			ls.shadow_offset = Vector2(0, px)
		"soft":
			ls.shadow_color = Color(INK, 0.55)
			ls.shadow_size = 0
			ls.shadow_offset = Vector2(0, px)
		"name":
			ls.shadow_color = INK
			ls.shadow_size = 0
			ls.shadow_offset = Vector2(px, px)
		"outline":
			ls.outline_color = INK
			ls.outline_size = px * 2
			ls.shadow_color = INK
			ls.shadow_size = px * 2
			ls.shadow_offset = Vector2(0, px * 2)
	return ls


## A label. `upper` sets the text in capitals (CSS text-transform).
static func label(text: String, size_rem: float, kind := "500", color := TEXT, shadow := "drop", spacing_em := 0.0, upper := false) -> Label:
	var l := Label.new()
	l.text = text.to_upper() if upper else text
	l.label_settings = label_settings(size_rem, kind, color, shadow, spacing_em)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## Width of `text` in a font at a size.
static func text_w(f: Font, text: String, size: int) -> float:
	return f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x


## Draws text with the web's ink shadows on a canvas item (custom-drawn controls).
## `pos` is the baseline start.
static func draw_text(ci: CanvasItem, f: Font, pos: Vector2, text: String, size: int, col: Color, shadow := "drop", shadow_col := INK) -> void:
	match shadow:
		"drop":
			ci.draw_string(f, pos + Vector2(0, px), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, shadow_col)
		"name":
			ci.draw_string(f, pos + Vector2(px, px), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, shadow_col)
			ci.draw_string(f, pos + Vector2(0, px), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, shadow_col)
		"outline":
			for d in [Vector2(px, 0), Vector2(-px, 0), Vector2(0, px), Vector2(0, -px), Vector2(px, px), Vector2(-px, px), Vector2(px, -px), Vector2(-px, -px), Vector2(0, px * 2)]:
				ci.draw_string(f, pos + d, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, shadow_col)
	ci.draw_string(f, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)


# --- Drawing helpers ------------------------------------------------------------------

## Vertical gradient over a rect: stops [[t, Color], ...] with t in 0..1.
static func vgrad(ci: RID, r: Rect2, stops: Array) -> void:
	for i in stops.size() - 1:
		var a: Array = stops[i]
		var b: Array = stops[i + 1]
		var y0: float = r.position.y + r.size.y * float(a[0])
		var y1: float = r.position.y + r.size.y * float(b[0])
		if y1 <= y0: continue
		var ca: Color = a[1]
		var cb: Color = b[1]
		RenderingServer.canvas_item_add_polygon(ci, PackedVector2Array([Vector2(r.position.x, y0), Vector2(r.end.x, y0), Vector2(r.end.x, y1), Vector2(r.position.x, y1)]), PackedColorArray([ca, ca, cb, cb]))


## Horizontal gradient (left to right).
static func hgrad(ci: RID, r: Rect2, stops: Array) -> void:
	for i in stops.size() - 1:
		var a: Array = stops[i]
		var b: Array = stops[i + 1]
		var x0: float = r.position.x + r.size.x * float(a[0])
		var x1: float = r.position.x + r.size.x * float(b[0])
		if x1 <= x0: continue
		var ca: Color = a[1]
		var cb: Color = b[1]
		RenderingServer.canvas_item_add_polygon(ci, PackedVector2Array([Vector2(x0, r.position.y), Vector2(x1, r.position.y), Vector2(x1, r.end.y), Vector2(x0, r.end.y)]), PackedColorArray([ca, cb, cb, ca]))


## A soft elliptical glow (radial gradient to clear) as a fan of triangles.
static func glow(ci: RID, center: Vector2, radius: Vector2, col: Color, falloff := 1.0) -> void:
	var seg := 28
	var rings := 6
	for k in rings:
		var t0 := float(k) / rings
		var t1 := float(k + 1) / rings
		var a0 := col.a * pow(1.0 - t0, falloff)
		var a1 := col.a * pow(1.0 - t1, falloff)
		var pts := PackedVector2Array()
		var cols := PackedColorArray()
		var idx := PackedInt32Array()
		for i in seg + 1:
			var an := TAU * i / seg
			var d := Vector2(cos(an) * radius.x, sin(an) * radius.y)
			pts.append(center + d * t0)
			cols.append(Color(col, a0))
			pts.append(center + d * t1)
			cols.append(Color(col, a1))
		for i in seg:
			var q := i * 2
			idx.append_array([q, q + 1, q + 2, q + 1, q + 3, q + 2])
		RenderingServer.canvas_item_add_triangle_array(ci, idx, pts, cols)


## A rect with its four corner pixels cut (CSS .notch), `p` the cut.
static func notch_rect(ci: RID, r: Rect2, col: Color, p: float) -> void:
	RenderingServer.canvas_item_add_rect(ci, Rect2(r.position.x + p, r.position.y, r.size.x - p * 2, r.size.y), col)
	RenderingServer.canvas_item_add_rect(ci, Rect2(r.position.x, r.position.y + p, p, r.size.y - p * 2), col)
	RenderingServer.canvas_item_add_rect(ci, Rect2(r.end.x - p, r.position.y + p, p, r.size.y - p * 2), col)


## The web's bevelled block (buttons, tiles): ink edge with notched corners, a face, a
## light top and left edge, a dark bottom (`lo_h` art pixels) and right edge.
static func bevel(ci: RID, r: Rect2, face: Color, hi: Color, lo: Color, lo_h := 3, pressed := false) -> void:
	var p := float(px)
	notch_rect(ci, r, INK, p)
	var inner := r.grow(-p)
	RenderingServer.canvas_item_add_rect(ci, inner, face)
	if pressed:
		RenderingServer.canvas_item_add_rect(ci, Rect2(inner.position, Vector2(inner.size.x, p)), lo)
		RenderingServer.canvas_item_add_rect(ci, Rect2(inner.position.x, inner.end.y - p, inner.size.x, p), lo)
		return
	RenderingServer.canvas_item_add_rect(ci, Rect2(inner.position.x, inner.end.y - p * lo_h, inner.size.x, p * lo_h), lo)
	RenderingServer.canvas_item_add_rect(ci, Rect2(inner.end.x - p, inner.position.y, p, inner.size.y), lo)
	RenderingServer.canvas_item_add_rect(ci, Rect2(inner.position, Vector2(inner.size.x, p)), hi)
	RenderingServer.canvas_item_add_rect(ci, Rect2(inner.position, Vector2(p, inner.size.y - p * lo_h)), hi)


## A recessed icon socket (CSS .sock).
static func sock(ci: RID, r: Rect2) -> void:
	var p := float(px)
	RenderingServer.canvas_item_add_rect(ci, r, INK)
	var inner := r.grow(-p)
	RenderingServer.canvas_item_add_rect(ci, inner, Color("#110c1e"))
	glow(ci, inner.position + inner.size * Vector2(0.5, 0.6), inner.size * 0.62, Color("#2a2046"), 0.8)
	RenderingServer.canvas_item_add_rect(ci, Rect2(inner.position, Vector2(inner.size.x, p)), Color("#05030a"))
	RenderingServer.canvas_item_add_rect(ci, Rect2(inner.position.x, inner.end.y - p, inner.size.x, p), Color("#4a3b72"))


# --- Pixel frames (ui/frames.ts) ---------------------------------------------------------

const _PAL := {
	"k": "#0a0612", "G": "#ffe58f", "g": "#f2b542", "d": "#b06c1e", "D": "#5a3010",
	"W": "#ffffff", "w": "#d8cff0", "S": "#8a7cb8", "s": "#54467e", "t": "#2c2248", "T": "#1a1330",
	"R": "#ff5a62", "r": "#b02a40", "C": "#9ef4ff", "c": "#3ab0e0", "p": "#1a1329",
}
const _DARKER := {"W": "w", "G": "g", "g": "d", "d": "D", "w": "S", "S": "s", "s": "t", "t": "T", "C": "c", "R": "r"}
const FRAMES := {
	"gold": ["..kkkkk", ".kGGGGG", "kGWGggg", "kGGddkk", "kGgdkpp", "kGgkppp", "kGgkppp"],
	"iron": [".kkkkk", "kSSSSS", "kSwSss", "kSSttt", "kSstkk", "kSstkp"],
	"cursor": ["kkkkkk.", "kGGGGk.", "kGgkkk.", "kGk....", "kGk....", "kkk....", "......."],
	"plaque": [".kkkk", "kdGGG", "kGkkk", "kGkpp", "kGkpp"],
}

static var _frame_tex := {}


## The frame's 9-slice image, one frame pixel per `px` device pixels.
static func frame_texture(name: String) -> Texture2D:
	var key := "%s@%d" % [name, px]
	var t = _frame_tex.get(key)
	if t != null: return t
	var corner: Array = FRAMES[name]
	var k := corner.size()
	var n := k * 2 + 1
	var img := Image.create_empty(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var right := x > k
			var bottom := y > k
			var fx := n - 1 - x if right else x
			var fy := n - 1 - y if bottom else y
			var ch := "."
			if fx == k and fy == k: ch = "."
			elif fx == k: ch = (corner[mini(fy, k - 1)] as String)[k - 1]
			elif fy == k: ch = (corner[k - 1] as String)[mini(fx, k - 1)]
			elif fx < k and fy < k: ch = (corner[fy] as String)[fx]
			var horiz := fy <= fx
			var dark := bottom if horiz else right
			if dark and _DARKER.has(ch): ch = _DARKER[ch]
			if ch == ".": continue
			img.set_pixel(x, y, Color(_PAL[ch]))
	img.resize(n * px, n * px, Image.INTERPOLATE_NEAREST)
	t = ImageTexture.create_from_image(img)
	_frame_tex[key] = t
	return t


## Draws a pixel frame round `r` (its border is `slice` frame pixels thick, inside r).
static func draw_frame(ci: RID, r: Rect2, name: String) -> void:
	var k: int = (FRAMES[name] as Array).size()
	var m := float(k * px)
	RenderingServer.canvas_item_add_nine_patch(ci, r, Rect2(), frame_texture(name).get_rid(), Vector2(m, m), Vector2(m, m),
		RenderingServer.NINE_PATCH_STRETCH, RenderingServer.NINE_PATCH_STRETCH, false)


## Thickness of a frame's border in device pixels.
static func frame_w(name: String) -> float:
	return float((FRAMES[name] as Array).size() * px)


static var _dither: Texture2D

## The panels' faint dither (CSS --tex-panel): an 8-pixel tile with two light dots.
static func dither() -> Texture2D:
	var key := px
	if _dither != null and _dither.get_width() == 8 * key: return _dither
	var img := Image.create_empty(8, 8, false, Image.FORMAT_RGBA8)
	img.set_pixel(0, 0, Color(1, 1, 1, 0.035))
	img.set_pixel(4, 4, Color(1, 1, 1, 0.035))
	img.resize(8 * key, 8 * key, Image.INTERPOLATE_NEAREST)
	_dither = ImageTexture.create_from_image(img)
	return _dither


## The panel fill under a frame (CSS .frame background): a dark gradient and the dither.
## The control drawing it needs texture_repeat enabled for the dither.
static func panel_fill(ci: RID, r: Rect2, top := Color("#221a38"), split := 0.4) -> void:
	vgrad(ci, r, [[0.0, top], [split, FACE], [1.0, FACE]])
	RenderingServer.canvas_item_add_texture_rect(ci, r, dither().get_rid(), true)


## A framed panel StyleBox: fill and frame, with content inset by the frame and `pad`.
static func frame_box(name := "gold", pad := 0.0) -> StyleBox:
	var sb := FrameBox.new()
	sb.frame = name
	var m := frame_w(name) + pad
	sb.content_margin_left = m
	sb.content_margin_right = m
	sb.content_margin_top = m
	sb.content_margin_bottom = m
	return sb


class FrameBox extends StyleBox:
	var frame := "gold"
	var fill := true

	func _draw(ci: RID, r: Rect2) -> void:
		if fill: UI.panel_fill(ci, r.grow(-UI.px * 2))
		UI.draw_frame(ci, r, frame)


## A Control drawn by a callable (custom pieces inside layouts): f(ci: CanvasItem, size: Vector2).
class Paint extends Control:
	var painter: Callable

	func _init(f: Callable, min_size := Vector2.ZERO) -> void:
		painter = f
		custom_minimum_size = min_size
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED

	func _draw() -> void:
		painter.call(self, size)


# --- Glyphs (ui/icons.ts) ---------------------------------------------------------------

static var _glyphs := {}

## A 9x9 pixel glyph as a white texture (tint it with modulate or a draw colour).
static func glyph(name: String) -> Texture2D:
	var t = _glyphs.get(name)
	if t != null: return t
	var rows = UiIcons.GLYPHS.get(name)
	var img := Image.create_empty(9, 9, false, Image.FORMAT_RGBA8)
	if rows != null:
		for y in 9:
			var row: String = rows[y]
			for x in mini(9, row.length()):
				if row[x] == "#": img.set_pixel(x, y, Color.WHITE)
	t = ImageTexture.create_from_image(img)
	_glyphs[name] = t
	return t


## Draws a glyph `s` device pixels square at `pos`, with an optional drop shadow.
static func draw_glyph(ci: CanvasItem, name: String, pos: Vector2, s: float, col: Color, shadow := Color(0, 0, 0, 0), flip := false) -> void:
	var t := glyph(name)
	var q := maxf(1.0, roundf(s / 9.0))
	var sz := Vector2(9, 9) * q
	pos = pos.round()
	var r := Rect2(pos + Vector2(sz.x, 0), Vector2(-sz.x, sz.y)) if flip else Rect2(pos, sz)
	if shadow.a > 0: ci.draw_texture_rect(t, Rect2(r.position + Vector2(0, px), r.size), false, shadow)
	ci.draw_texture_rect(t, r, false, col)


## Glyph size snapped to whole pixels of the 9x9 grid.
static func glyph_size(s: float) -> float:
	return maxf(1.0, roundf(s / 9.0)) * 9.0


## The hero's level as a small gold chip ("LV 3") with its top-left (or top-right) at `at`.
static func level_chip(ci: CanvasItem, at: Vector2, lv: int, right := false, size_rem := 0.75) -> Rect2:
	var p := float(px)
	var fs := roundi(r(size_rem))
	var sfs := roundi(r(size_rem * 0.75))
	var f := font("p700")
	var sf := font("700")
	var t := str(lv)
	var w := text_w(sf, "LV", sfs) + c(2) + text_w(f, t, fs) + r(0.35) * 2 + p * 2
	var h := fs + c(3) + p * 2
	var rc := rround(Rect2(at.x - w if right else at.x, at.y, w, h))
	ci.draw_rect(rc, INK)
	var i := rc.grow(-p)
	ci.draw_rect(i, GOLD)
	ci.draw_rect(Rect2(i.position, Vector2(i.size.x, p)), GOLD_HI)
	ci.draw_rect(Rect2(i.position.x, i.end.y - p, i.size.x, p), GOLD_LO)
	var base := i.position.y + c(1) + f.get_ascent(fs)
	var x := i.position.x + r(0.35)
	ci.draw_string(sf, Vector2(x, base), "LV", HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, GOLD_INK)
	ci.draw_string(f, Vector2(x + text_w(sf, "LV", sfs) + c(2), base), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, GOLD_INK)
	return rc


# --- Logo ----------------------------------------------------------------------------------

static var _logo: Texture2D

## The game logo (the web's ui/logo.ts, baked to assets/ui/logo.png).
static func logo() -> Texture2D:
	if _logo == null: _logo = load("res://assets/ui/logo.png")
	return _logo


## Largest whole scale at which `art` fits in `box`.
static func fit_scale(art: Vector2, box: Vector2) -> int:
	return maxi(1, floori(minf(box.x / art.x, box.y / art.y)))


# --- Portrait backdrops (render/backdrops.ts) ----------------------------------------------

static var _backdrops := {}

## A hero's portrait backdrop (RenderBackdrops.BW x BH art pixels), painted once.
static func backdrop(i) -> Texture2D:
	var k := int(i) if i != null else 0
	var t = _backdrops.get(k)
	if t != null: return t
	var src: Array = RenderBackdrops.paint_backdrop(k)
	var bytes := PackedByteArray()
	bytes.resize(src.size())
	for j in src.size(): bytes[j] = clampi(roundi(float(src[j])), 0, 255)
	var img := Image.create_from_data(RenderBackdrops.BW, RenderBackdrops.BH, false, Image.FORMAT_RGBA8, bytes)
	t = ImageTexture.create_from_image(img)
	_backdrops[k] = t
	return t
