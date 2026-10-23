class_name SettingsSheet
extends Sheet
## Settings (the web's ui/settings.ts, phone landscape layout): three columns,
## the volume sliders, the battle switches and the arena picker. Every change
## applies at once through `changed`.

## The whole settings dict: {quotes, smallNumbers, volume: {master, music, sfx}, arena}.
signal changed(s: Dictionary)

const SLIDERS := [["master", "soundOn", "Master"], ["music", "music", "Music"], ["sfx", "swords", "Sound effects"]]
const SWITCHES := [["quotes", "quote", "Battle quotes", "Speech bubbles with what each fighter is thinking."],
	["smallNumbers", "eye", "Hide small numbers", "Hides damage, heal and energy numbers under 50."]]
const ARENA_HINT := "Where every fight takes place, and the view behind the menu."
const ROW_LINE := Color(59 / 255.0, 47 / 255.0, 92 / 255.0, 0.6)

var s: Dictionary
var _paint: UI.Paint
var _sliders: Array[VolSlider] = []
var _switches: Array[Switch] = []
var _arenas: Array[ArenaOpt] = []
## What the painter draws, worked out by the layout: [kind, ...].
var _ops: Array = []


func _init(start: Dictionary) -> void:
	super("Settings", 60.0)
	s = start.duplicate(true)
	_paint = UI.Paint.new(_draw_ops)
	body.add_child(_paint)
	for sl in SLIDERS:
		var v := VolSlider.new(float(s["volume"].get(sl[0], 1.0)))
		var key: String = sl[0]
		v.changed.connect(func(x: float):
			s["volume"][key] = x
			_paint.queue_redraw()
			changed.emit(s))
		_sliders.append(v)
		body.add_child(v)
	for sw in SWITCHES:
		var t := Switch.new(bool(s[sw[0]]))
		var key: String = sw[0]
		t.toggled.connect(func(on: bool):
			s[key] = on
			changed.emit(s))
		_switches.append(t)
		body.add_child(t)
	var themes: Array = RenderArenaArt.THEMES
	var randoms: Array = []
	for th in themes: randoms.append(Color.hex((int(th["sky"][2]) << 8) | 0xff))
	for th in themes + [{"id": "random", "name": "Random"}]:
		var o := ArenaOpt.new(th, randoms)
		o.pressed.connect(func():
			if s["arena"] == o.id: return
			s["arena"] = o.id
			for x in _arenas: x.on = x.id == o.id
			changed.emit(s))
		o.on = s["arena"] == o.id
		_arenas.append(o)
		body.add_child(o)


# --- Layout ----------------------------------------------------------------------------------

func _cols(w: float) -> Array:
	var pad := UI.r(0.9)
	var gap := UI.r(1.2)
	var cw := floorf((w - pad * 2 - gap * 2) / 3.0)
	return [pad, pad + cw + gap, pad + (cw + gap) * 2, cw]


func _body_size(avail: Vector2) -> Vector2:
	return Vector2(avail.x, _place(avail.x, false))


func _layout_body(sz: Vector2) -> void:
	_place(sz.x, true)
	_paint.position = Vector2.ZERO
	_paint.size = sz
	_paint.queue_redraw()


## Works out every position for a body `w` wide; returns the height. With
## `apply` it also moves the controls and records what to paint.
func _place(w: float, apply: bool) -> float:
	var c := _cols(w)
	var cw: float = c[3]
	var ops: Array = []
	var top := UI.r(0.2)
	var cap_h := UI.r(0.5) + UI.r(0.75) * 1.0
	var p := float(UI.px)
	var lab_fs := roundi(UI.r(0.9375))
	var hint_fs := roundi(UI.r(0.6875))
	var lf := UI.font("700")
	var hf := UI.font("500")
	# Sound.
	var x: float = c[0]
	var y := top
	ops.append(["cap", Vector2(x, y + UI.r(0.5)), "Sound"])
	y += cap_h
	for i in SLIDERS.size():
		y += UI.r(0.3)
		ops.append(["label", Vector2(x, y), SLIDERS[i][1], SLIDERS[i][2], lab_fs])
		ops.append(["value", Vector2(x + cw, y), i, lab_fs])
		y += roundf(lab_fs * 1.15)
		if apply:
			_sliders[i].position = Vector2(x, y)
			_sliders[i].size = Vector2(cw, UI.r(1.6))
		y += UI.r(1.6) + UI.r(0.3)
		ops.append(["line", Rect2(x, y, cw, UI.c(2))])
		y += UI.c(2)
	var h := y
	# Battle switches.
	x = c[1]
	y = top
	ops.append(["cap", Vector2(x, y + UI.r(0.5)), "Battle"])
	y += cap_h
	var tw := UI.r(3.5)
	var th := UI.r(1.9)
	var text_w := cw - tw - UI.c(14)
	for i in SWITCHES.size():
		var sw: Array = SWITCHES[i]
		y += UI.r(0.3)
		var hint_h := hf.get_multiline_string_size(sw[3], HORIZONTAL_ALIGNMENT_LEFT, text_w, hint_fs).y
		var text_h := roundf(lab_fs * 1.1) + UI.c(3) + hint_h
		var row_h := maxf(text_h, th)
		ops.append(["label", Vector2(x, y + (row_h - text_h) / 2.0), sw[1], sw[2], lab_fs])
		ops.append(["hint", Vector2(x, y + (row_h - text_h) / 2.0 + roundf(lab_fs * 1.1) + UI.c(3)), sw[3], text_w, hint_fs])
		if apply:
			_switches[i].position = Vector2(x + cw - tw, roundf(y + (row_h - th) / 2.0))
			_switches[i].size = Vector2(tw, th)
		y += row_h + UI.r(0.3)
		ops.append(["line", Rect2(x, y, cw, UI.c(2))])
		y += UI.c(2)
	h = maxf(h, y)
	# Arena picker: a hint and a grid of two.
	x = c[2]
	y = top
	ops.append(["cap", Vector2(x, y + UI.r(0.5)), "Arena"])
	y += cap_h + UI.c(4)
	var ah := hf.get_multiline_string_size(ARENA_HINT, HORIZONTAL_ALIGNMENT_LEFT, cw, hint_fs).y
	ops.append(["hint", Vector2(x, y), ARENA_HINT, cw, hint_fs])
	y += ah + UI.c(8)
	var g := UI.c(6)
	var ow := floorf((cw - g) / 2.0)
	var row_y := y
	for i in _arenas.size():
		var col := i % 2
		if col == 0 and i > 0:
			row_y += _arena_row_h(i - 2, ow) + g
		var oh := _arena_row_h(i - col, ow)
		if apply:
			_arenas[i].position = Vector2(x + col * (ow + g), row_y)
			_arenas[i].size = Vector2(ow, oh)
	y = row_y + _arena_row_h((_arenas.size() - 1) - (_arenas.size() - 1) % 2, ow)
	h = maxf(h, y)
	if apply: _ops = ops
	return ceilf(h + UI.r(0.7))


## A row of the arena grid is as tall as its taller option.
func _arena_row_h(first: int, w: float) -> float:
	var h := 0.0
	for j in range(first, mini(first + 2, _arenas.size())):
		h = maxf(h, _arenas[j].height_for(w))
	return h


func _draw_ops(ci: CanvasItem, _sz: Vector2) -> void:
	var cap_fs := roundi(UI.r(0.75))
	var cf := UI.spaced("700", cap_fs, 0.14)
	var lf := UI.font("700")
	var hf := UI.font("500")
	var vf := UI.font("700")
	for op in _ops:
		match op[0]:
			"cap":
				ci.draw_string(cf, op[1] + Vector2(0, cf.get_ascent(cap_fs)), (op[2] as String).to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, cap_fs, UI.GOLD)
			"label":
				var fs: int = op[4]
				var gs := UI.glyph_size(fs * 1.1)
				var at: Vector2 = op[1]
				UI.draw_glyph(ci, op[2], Vector2(at.x, roundf(at.y + (fs * 1.1 - gs) / 2.0)), gs, UI.GOLD)
				ci.draw_string(lf, Vector2(at.x + gs + UI.c(8), roundf(at.y + lf.get_ascent(fs))), op[3], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.TEXT)
			"value":
				var fs := roundi(UI.r(0.9))
				var t := str(roundi(float(s["volume"][SLIDERS[op[2]][0]]) * 100.0))
				var at: Vector2 = op[1]
				ci.draw_string(vf, Vector2(at.x - UI.text_w(vf, t, fs), roundf(at.y + lf.get_ascent(op[3]))), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.MUTED)
			"hint":
				var fs: int = op[4]
				var at: Vector2 = op[1]
				ci.draw_multiline_string(hf, Vector2(at.x, roundf(at.y + hf.get_ascent(fs))), op[2], HORIZONTAL_ALIGNMENT_LEFT, op[3], fs, -1, UI.MUTED)
			"line":
				ci.draw_rect(op[1], ROW_LINE)


# --- Controls --------------------------------------------------------------------------------

## A volume slider: a recessed track filled gold up to the value and a block thumb; drag or tap.
class VolSlider extends Control:
	signal changed(v: float)
	var value := 1.0
	var _drag := false

	func _init(v: float) -> void:
		value = clampf(v, 0.0, 1.0)
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			_drag = e.pressed
			if e.pressed: _set_from(e.position.x)
			else: Sfx.sfx.play("hit")
			accept_event()
		elif e is InputEventMouseMotion and _drag:
			_set_from(e.position.x)
			accept_event()

	func _set_from(x: float) -> void:
		var tw := UI.r(1.1)
		var v := clampf((x - tw / 2.0) / maxf(1.0, size.x - tw), 0.0, 1.0)
		v = roundf(v * 20.0) / 20.0
		if v == value: return
		value = v
		queue_redraw()
		changed.emit(v)

	func _draw() -> void:
		var b := UI.c(2)
		var th := UI.r(0.7)
		var tr := UI.rround(Rect2(0, (size.y - th) / 2.0, size.x, th))
		draw_rect(tr, UI.INK)
		var inner := tr.grow(-b)
		draw_rect(inner, Color("#0b0814"))
		var tw := UI.r(1.1)
		var cx := roundf(tw / 2.0 + (size.x - tw) * value)
		if cx > inner.position.x: draw_rect(Rect2(inner.position, Vector2(minf(cx, inner.end.x) - inner.position.x, inner.size.y)), UI.GOLD)
		draw_rect(inner.grow(b / 2.0), UI.LINE, false, b)
		var thumb := UI.rround(Rect2(cx - tw / 2.0, (size.y - UI.r(1.5)) / 2.0, tw, UI.r(1.5)))
		draw_rect(thumb, UI.INK)
		draw_rect(thumb.grow(-b), UI.GOLD)


## An On/Off switch: a dark slot with a block knob that slides right and turns gold when on.
class Switch extends Control:
	signal toggled(on: bool)
	var on := false

	func _init(v: bool) -> void:
		on = v
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT and not e.pressed:
			on = not on
			Sfx.sfx.play("ui")
			queue_redraw()
			toggled.emit(on)
			accept_event()

	func _draw() -> void:
		var p := float(UI.px)
		var b := UI.c(2)
		var r := Rect2(Vector2.ZERO, size)
		UI.notch_rect(get_canvas_item(), r, UI.INK, p)
		var inner := r.grow(-b)
		draw_rect(inner, Color("#3a2c10") if on else Color("#0b0814"))
		draw_rect(inner.grow(-b / 2.0), UI.GOLD_LO if on else UI.LINE, false, b)
		var k := size.y - UI.c(12)
		var x := UI.c(4) + (size.x - size.y if on else 0.0)
		var knob := UI.rround(Rect2(x + b, UI.c(4) + b, k, k))
		draw_rect(knob, UI.GOLD if on else UI.DIM)


## An arena choice: a sky-to-ground swatch and the arena's name; gold when picked.
class ArenaOpt extends Control:
	signal pressed
	var id := ""
	var label := ""
	var sky: Array = []
	var floor_c := Color.BLACK
	## Random: the arenas' skies side by side.
	var randoms: Array = []
	var on := false:
		set(v):
			on = v
			queue_redraw()
	var _down := false

	func _init(th: Dictionary, rnd: Array) -> void:
		id = th["id"]
		label = th["name"]
		if th.has("sky"):
			for c in th["sky"]: sky.append(Color.hex((int(c) << 8) | 0xff))
			floor_c = Color.hex((int(th["floor"]) << 8) | 0xff)
		else:
			randoms = rnd
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _fs() -> int:
		return roundi(UI.r(0.75))

	func height_for(w: float) -> float:
		var f := UI.font("600")
		var th := f.get_multiline_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, w - UI.c(5) * 2 - UI.px * 2, _fs()).y
		return roundf(UI.px + UI.c(5) + UI.r(1.7) + UI.c(6) + th + UI.c(7) + UI.px * 2)

	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			if e.pressed: _down = true
			elif _down:
				_down = false
				if Rect2(Vector2.ZERO, size).has_point(e.position):
					Sfx.sfx.play("ui")
					pressed.emit()
			queue_redraw()
			accept_event()

	func _draw() -> void:
		var p := float(UI.px)
		var ci := get_canvas_item()
		var r := Rect2(Vector2(0, p if _down else 0.0), size)
		if on: UI.bevel(ci, r, UI.GOLD, UI.GOLD_HI, UI.GOLD_LO, 2)
		else: UI.bevel(ci, r, Color("#2e2450"), Color("#4e3f80"), Color("#1a1330"), 2)
		var b := UI.c(2)
		var sw := UI.rround(Rect2(r.position.x + p + UI.c(5), r.position.y + p + UI.c(5), r.size.x - p * 2 - UI.c(5) * 2, UI.r(1.7)))
		draw_rect(sw, UI.GOLD_INK if on else UI.INK)
		var inner := sw.grow(-b)
		if randoms.is_empty():
			# Sky bands over the top 72%, the floor colour under them.
			var n := sky.size()
			var sky_h := inner.size.y * 0.72
			for i in n:
				var y0 := roundf(inner.position.y + sky_h * i / n)
				var y1 := roundf(inner.position.y + sky_h * (i + 1) / n)
				draw_rect(Rect2(inner.position.x, y0, inner.size.x, y1 - y0), sky[i])
			var fy := roundf(inner.position.y + sky_h)
			draw_rect(Rect2(inner.position.x, fy, inner.size.x, inner.end.y - fy), floor_c)
		else:
			var stops := []
			for i in randoms.size(): stops.append([float(i) / maxf(1.0, randoms.size() - 1), randoms[i]])
			UI.hgrad(ci, inner, stops)
		var f := UI.font("600")
		var fs := _fs()
		var tx := r.position.x + p + UI.c(5)
		var tw := r.size.x - p * 2 - UI.c(5) * 2
		var th := f.get_multiline_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, tw, fs).y
		var area_top := sw.end.y + UI.c(6)
		var area_h := r.end.y - p * 2 - UI.c(5) - area_top
		var ty := roundf(area_top + (area_h - th) / 2.0 + f.get_ascent(fs))
		draw_multiline_string(f, Vector2(tx, ty), label, HORIZONTAL_ALIGNMENT_LEFT, tw, fs, -1, UI.GOLD_INK if on else UI.TEXT)
