class_name PxButton
extends Control
## The web's .btn: a chunky bevelled block with a glyph and/or an uppercase
## label that presses down a pixel when held. Variants set the colours
## (`style`): "" (purple), "primary" (gold), "ghost", "danger", "on" (picked
## tab); sizes (`size_kind`): "", "sm", "big". `glint` sweeps a light across it
## now and then (calls to action); `unseen` puts a red dot in the corner.

signal pressed

var text := ""
var glyph := ""
var style := ""
var size_kind := ""
var glint := false
var unseen := false
var disabled := false:
	set(v):
		disabled = v
		queue_redraw()
## Glyph mirrored (a left arrow from "play").
var flip_glyph := false
## A small second label after the main one (the creator's "Next  BODY"), and the
## glyph after the labels instead of before them.
var sub := ""
var glyph_after := false
## A price after the label (the web's gem tag): a dark chip with a gem and the
## number (-1: none); `tag_col` colours the number.
var gem := -1
var tag_col := UI.TEXT
## Colour overrides (face, hi, lo, fg); null keeps the style's.
var colors = null
## The glyph's colour (null: the label's).
var glyph_col = null
## Size overrides in rem (0 keeps the size kind's): label size, least height and width.
var font_rem := 0.0
var min_h := 0.0
var min_w := 0.0

var _down := false
var _inside := false
var _t := 0.0


func _init(label := "", icon := "", st := "", sz := "") -> void:
	text = label
	glyph = icon
	style = st
	size_kind = sz
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_NONE


func _ready() -> void:
	refit()
	set_process(glint)


## Re-measures after changing a size override.
func refit() -> void:
	_fit()
	queue_redraw()


func set_text(t: String) -> void:
	text = t
	_fit()
	queue_redraw()


func set_glyph(g: String) -> void:
	glyph = g
	queue_redraw()


func set_style(st: String) -> void:
	style = st
	queue_redraw()


func set_unseen(on: bool) -> void:
	unseen = on
	queue_redraw()


func _palette() -> Array:
	if colors != null: return colors
	match style:
		"primary": return [UI.GOLD, UI.GOLD_HI, UI.GOLD_LO, UI.GOLD_INK]
		"ghost": return [Color(0.078, 0.055, 0.133, 0.6), Color(1, 1, 1, 0.06), Color(0, 0, 0, 0.3), UI.MUTED]
		"danger": return [Color("#8a2a3e"), Color("#c04a5c"), Color("#4e1022"), UI.TEXT]
		"on": return [Color("#241b40"), Color("#241b40"), Color("#241b40"), UI.GOLD]
		"teal": return [Color("#1e7078"), Color("#46b2b0"), Color("#0c3a40"), UI.TEXT]
	return [Color("#43357a"), Color("#6a58aa"), Color("#261d48"), UI.TEXT]


func _font_size() -> int:
	if font_rem > 0.0: return roundi(font_rem * UI.rem)
	match size_kind:
		"sm": return roundi(0.75 * UI.rem)
		"big": return roundi(1.3 * UI.rem)
	return roundi(0.9375 * UI.rem)


func _font() -> Font:
	return UI.spaced("700", _font_size(), 0.06)


func _tag_w() -> float:
	var fs := _font_size()
	return UI.c(6) * 2 + UI.glyph_size(fs * 1.05) + roundf(fs * 0.25) + UI.text_w(UI.font("700"), str(gem), fs)


func _sub_size() -> int:
	return roundi(0.6875 * UI.rem)


func _sub_font() -> Font:
	return UI.spaced("600", _sub_size(), 0.06)


func _glyph_px() -> float:
	return UI.glyph_size(_font_size() * (1.0 if size_kind == "big" else 1.15))


func _fit() -> void:
	var fs := _font_size()
	var h := UI.r(2.75)
	var pad := UI.r(1.1)
	match size_kind:
		"sm":
			h = UI.r(2.1)
			pad = UI.r(0.7)
		"big":
			h = UI.r(3.5)
			pad = UI.r(1.6)
	var w := 0.0
	if text != "": w += UI.text_w(_font(), text.to_upper(), fs)
	if sub != "": w += roundf(fs * 0.5) + UI.text_w(_sub_font(), sub.to_upper(), _sub_size())
	if gem >= 0: w += (UI.r(0.5) if text != "" else 0.0) + _tag_w()
	if glyph != "":
		w += _glyph_px()
		if text != "": w += roundf(fs * 0.5)
	if min_h > 0.0: h = UI.r(min_h)
	if text == "":
		pad = UI.r(0.4)
		w = maxf(w + pad * 2, h)
	else:
		w += pad * 2
	if min_w > 0.0: w = maxf(w, UI.r(min_w))
	custom_minimum_size = Vector2(ceilf(w), h)


func _gui_input(e: InputEvent) -> void:
	if disabled: return
	if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		if e.pressed:
			_down = true
			_inside = true
			queue_redraw()
		elif _down:
			_down = false
			queue_redraw()
			if Rect2(Vector2.ZERO, size).has_point(e.position):
				Sfx.sfx.play("ui")
				pressed.emit()
		accept_event()
	elif e is InputEventMouseMotion and _down:
		var inside := Rect2(Vector2.ZERO, size).has_point(e.position)
		if inside != _inside:
			_inside = inside
			queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_MOUSE_EXIT and _down:
		_inside = false
		queue_redraw()


func _process(dt: float) -> void:
	_t += dt
	queue_redraw()


func _draw() -> void:
	var p := float(UI.px)
	var pal := _palette()
	var held := _down and _inside
	var r := Rect2(Vector2(0, p if held else 0.0), size)
	var ci := get_canvas_item()
	var face: Color = pal[0]
	if disabled: modulate.a = 0.5
	else: modulate.a = 1.0
	if style == "on":
		UI.notch_rect(ci, r, UI.INK, p)
		var inner := r.grow(-p)
		RenderingServer.canvas_item_add_rect(ci, inner, face)
		RenderingServer.canvas_item_add_rect(ci, Rect2(inner.position, Vector2(inner.size.x, p * 2)), Color(0, 0, 0, 0.45))
		_outline(ci, inner, UI.GOLD_LO, p)
	else:
		if held: face = face.darkened(0.05)
		UI.bevel(ci, r, face, pal[1], pal[2], 2 if size_kind == "sm" else 3, held)
	if glint: _draw_glint(r, p)
	# Content: glyph then label, centred; the bottom bevel is thicker, so the middle sits a pixel up.
	var fs := _font_size()
	var f := _font()
	var up := text.to_upper()
	var tw := UI.text_w(f, up, fs) if text != "" else 0.0
	var gs := _glyph_px() if glyph != "" else 0.0
	var gap := roundf(fs * 0.5) if (glyph != "" and text != "") else 0.0
	var sfs := _sub_size()
	var sf := _sub_font()
	var sw := roundf(fs * 0.5) + UI.text_w(sf, sub.to_upper(), sfs) if sub != "" else 0.0
	var gw := (UI.r(0.5) if text != "" else 0.0) + _tag_w() if gem >= 0 else 0.0
	var total := gs + gap + tw + sw + gw
	var x0 := roundf(r.position.x + (r.size.x - total) / 2.0)
	var mid := r.position.y + (r.size.y - p * (2.0 if size_kind == "sm" else 3.0) + p) / 2.0
	var fg: Color = pal[3]
	var shade := Color(1, 0.94, 0.75, 0.6) if style == "primary" else Color(0.04, 0.02, 0.07, 0.55)
	var tx := x0 if glyph_after else x0 + gs + gap
	if glyph != "":
		var gp := Vector2(x0 + tw + sw + gap if glyph_after else x0, roundf(mid - gs / 2.0))
		UI.draw_glyph(self, glyph, gp, gs, glyph_col if glyph_col != null else fg, shade, flip_glyph)
	if text != "":
		var asc := f.get_ascent(fs)
		var desc := f.get_descent(fs)
		var base := roundf(mid + (asc - desc) / 2.0)
		draw_string(f, Vector2(tx, base + p), up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, shade)
		draw_string(f, Vector2(tx, base), up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, fg)
		if sub != "":
			draw_string(sf, Vector2(tx + tw + roundf(fs * 0.5), base), sub.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, Color(fg, 0.7))
		if gem >= 0:
			var tr := Rect2(tx + tw + sw + (UI.r(0.5) if text != "" else 0.0), roundf(mid - fs / 2.0 - UI.c(2.5)), _tag_w(), fs + UI.c(5))
			draw_rect(tr, Color(0, 0, 0, 0.35))
			var gsz := UI.glyph_size(fs * 1.05)
			UI.draw_glyph(self, "gem", Vector2(tr.position.x + UI.c(6), roundf(mid - gsz / 2.0)), gsz, Color("#6fe8ff"), UI.INK)
			var bf := UI.font("700")
			UI.draw_text(self, bf, Vector2(tr.position.x + UI.c(6) + gsz + roundf(fs * 0.25), base), str(gem), fs, tag_col)
	if unseen:
		var d := Rect2(r.end.x - p * 5, r.position.y + p * 2, p * 3, p * 3)
		draw_rect(d.grow(p), UI.INK)
		draw_rect(d, UI.RED)


## A light sweeping across now and then (steps, like the web's CSS animation).
func _draw_glint(r: Rect2, p: float) -> void:
	var cyc := fmod(_t, 3.4) / 3.4
	if cyc <= 0.62: return
	var k := floorf((cyc - 0.62) / 0.38 * 18.0) / 18.0
	var x := r.position.x + lerpf(-0.3, 1.2, k) * r.size.x
	var bw := r.size.x * 0.18
	var sk := r.size.y * 0.36
	var poly := PackedVector2Array([Vector2(x + sk, r.position.y + p), Vector2(x + sk + bw, r.position.y + p), Vector2(x + bw, r.end.y - p), Vector2(x, r.end.y - p)])
	var clipped := Geometry2D.intersect_polygons(poly, PackedVector2Array([r.position + Vector2(p, p), Vector2(r.end.x - p, r.position.y + p), r.end - Vector2(p, p), Vector2(r.position.x + p, r.end.y - p)]))
	for cp in clipped: draw_colored_polygon(cp, Color(1, 1, 1, 0.45))


func _outline(ci: RID, r: Rect2, col: Color, p: float) -> void:
	RenderingServer.canvas_item_add_rect(ci, Rect2(r.position, Vector2(r.size.x, p)), col)
	RenderingServer.canvas_item_add_rect(ci, Rect2(r.position.x, r.end.y - p, r.size.x, p), col)
	RenderingServer.canvas_item_add_rect(ci, Rect2(r.position, Vector2(p, r.size.y)), col)
	RenderingServer.canvas_item_add_rect(ci, Rect2(r.end.x - p, r.position.y, p, r.size.y), col)
