class_name Ribbon
extends Control
## The red banner with forked tails behind a title (the web's .ribbon).

var text := ""
var size_rem := 1.15
var spacing_em := 0.08


func _init(t := "", sz := 1.15, sp := 0.08) -> void:
	text = t
	size_rem = sz
	spacing_em = sp
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_text(t: String) -> void:
	text = t
	update_minimum_size()
	queue_redraw()


func _fs() -> int:
	return roundi(size_rem * UI.rem)


func _font() -> Font:
	return UI.spaced("700", _fs(), spacing_em)


func _get_minimum_size() -> Vector2:
	var p := float(UI.px)
	var fs := _fs()
	var w := UI.text_w(_font(), text.to_upper(), fs) + UI.r(1) * 2
	var h := p * 2 + roundf(fs * 1.1) + p * 3 + p * 2
	# The tails reach 6 art pixels past each end and 3 below.
	return Vector2(ceilf(w + p * 12), ceilf(h + p * 3))


func _draw() -> void:
	var p := float(UI.px)
	var fs := _fs()
	var f := _font()
	var band := Rect2(p * 6, 0, size.x - p * 12, size.y - p * 3)
	# Tails first, behind the band: a notch cut into the outer end.
	for left in [true, false]:
		var tr := Rect2(band.position.x - p * 6 if left else band.end.x - p * 2, p * 2, p * 8, band.size.y + p)
		var notch := Vector2(tr.position.x + tr.size.x * (0.45 if left else 0.55), tr.position.y + tr.size.y / 2.0)
		var poly: PackedVector2Array
		if left: poly = PackedVector2Array([tr.position, Vector2(tr.end.x, tr.position.y), tr.end, Vector2(tr.position.x, tr.end.y), notch])
		else: poly = PackedVector2Array([tr.position, Vector2(tr.end.x, tr.position.y), notch, tr.end, Vector2(tr.position.x, tr.end.y)])
		draw_colored_polygon(poly, UI.INK)
		var inner := _shrink(poly, p)
		if inner.size() >= 3:
			var cols := PackedColorArray()
			for v in inner:
				var t := clampf((v.y - tr.position.y) / tr.size.y, 0.0, 1.0)
				cols.append(Color("#7a1830").lerp(Color("#4e0e1e"), t))
			draw_polygon(inner, cols)
	draw_rect(band, UI.INK)
	var body := Rect2(band.position.x, band.position.y + p, band.size.x, band.size.y - p * 2)
	draw_rect(body, UI.RIBBON)
	draw_rect(Rect2(body.position, Vector2(body.size.x, p)), UI.RIBBON_HI)
	draw_rect(Rect2(body.position.x, body.end.y - p * 2, body.size.x, p * 2), UI.RIBBON_LO)
	var up := text.to_upper()
	var tw := UI.text_w(f, up, fs)
	var x := roundf(band.position.x + (band.size.x - tw) / 2.0)
	var asc := f.get_ascent(fs)
	var base := roundf(body.position.y + p + (body.size.y - p * 3 - (asc + f.get_descent(fs))) / 2.0 + asc)
	draw_string(f, Vector2(x, base + p * 2), up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(UI.INK, 0.6))
	for d in [Vector2(0, p), Vector2(p, 0), Vector2(-p, 0)]:
		draw_string(f, Vector2(x, base) + d, up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.RIBBON_LO)
	draw_string(f, Vector2(x, base), up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#fff1cf"))


static func _shrink(poly: PackedVector2Array, d: float) -> PackedVector2Array:
	var out := Geometry2D.offset_polygon(poly, -d, Geometry2D.JOIN_MITER)
	return out[0] if out.size() > 0 else PackedVector2Array()
