class_name TitleScreen
extends Control
## The title over the live arena (the web's ui/title.ts): the logo drops in, a
## ribbon under it and a blinking "Tap to start". Any tap starts the game.

signal start

var _t := 0.0
var _out := -1.0
var _ribbon: Ribbon


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_ribbon = Ribbon.new("1v1 Auto Battler", 1.0, 0.3)
	add_child(_ribbon)


func _gui_input(e: InputEvent) -> void:
	if _out >= 0.0: return
	if e is InputEventMouseButton and e.pressed:
		_out = 0.0
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		start.emit()
		accept_event()


func _process(dt: float) -> void:
	_t += dt
	if _out >= 0.0:
		_out += dt
		modulate.a = clampf(1.0 - _out / 0.3, 0.0, 1.0)
		if _out > 0.4: queue_free()
	queue_redraw()


## The logo's box and scale (it fits min(92vw, 52rem) x min(38vh, 12rem)).
func _logo_rect() -> Rect2:
	var t := UI.logo()
	var box := Vector2(minf(size.x * 0.92, UI.r(52)), minf(size.y * 0.38, UI.r(12)))
	var k := UI.fit_scale(Vector2(t.get_size()), box)
	var w := Vector2(t.get_size()) * k
	var rh := _ribbon.get_combined_minimum_size().y
	var block := box.y + UI.r(0.4) + rh
	var bottom_pad := UI.c(10) + UI.r(2.4) + UI.r(1.2) * 1.4
	var avail := size.y - UI.c(10) - bottom_pad - size.y * 0.04
	var top := UI.c(10) + maxf(0.0, (avail - block) / 2.0)
	return Rect2(Vector2(roundf((size.x - w.x) / 2.0), roundf(top + (box.y - w.y) / 2.0)), w)


func _draw() -> void:
	var ci := get_canvas_item()
	UI.vgrad(ci, Rect2(Vector2.ZERO, size), [[0.0, Color(0.03, 0.02, 0.06, 0.7)], [0.45, Color(0.03, 0.02, 0.06, 0.15)], [0.6, Color(0.03, 0.02, 0.06, 0.0)], [1.0, Color(0.03, 0.02, 0.06, 0.75)]])
	var lr := _logo_rect()
	# The logo drops in with a little overshoot (700 ms).
	var k := clampf(_t / 0.7, 0.0, 1.0)
	var c1 := 1.4
	var e := 1.0 + (c1 + 1.0) * pow(k - 1.0, 3.0) + c1 * pow(k - 1.0, 2.0)
	var s := lerpf(1.15, 1.0, e)
	var off := Vector2(0, -lr.size.y * 0.3 * (1.0 - e))
	var center := lr.get_center() + off
	var r := Rect2(center - lr.size * s / 2.0, lr.size * s)
	draw_texture_rect(UI.logo(), r, false, Color(1, 1, 1, clampf(k * 1.5, 0.0, 1.0)))
	# Ribbon under the logo, fading in.
	var rs := _ribbon.get_combined_minimum_size()
	var box_h := minf(size.y * 0.38, UI.r(12))
	var box_top := lr.position.y - (box_h - lr.size.y) / 2.0
	_ribbon.size = rs
	_ribbon.position = Vector2(roundf((size.x - rs.x) / 2.0), roundf(box_top + box_h + UI.r(0.4)))
	_ribbon.modulate.a = clampf((_t - 0.45) / 0.5, 0.0, 1.0)
	# "Tap to start", blinking (on 65% of each 1.2 s) after 0.8 s.
	var bt := _t - 0.8
	if bt >= 0.0 and fmod(bt, 1.2) / 1.2 < 0.65:
		var fs := roundi(UI.r(1.2))
		var f := UI.spaced("p700", fs, 0.14)
		var txt := "TAP TO START"
		var tw := UI.text_w(f, txt, fs)
		var y := size.y - UI.c(10) - UI.r(2.4)
		UI.draw_text(self, f, Vector2(roundf((size.x - tw) / 2.0), roundf(y)), txt, fs, UI.GOLD_HI, "outline")
	elif bt >= 0.0:
		var fs := roundi(UI.r(1.2))
		var f := UI.spaced("p700", fs, 0.14)
		var txt := "TAP TO START"
		var tw := UI.text_w(f, txt, fs)
		var y := size.y - UI.c(10) - UI.r(2.4)
		draw_set_transform(Vector2.ZERO)
		var faint := Color(UI.GOLD_HI, 0.15)
		draw_string(f, Vector2(roundf((size.x - tw) / 2.0), roundf(y)), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, faint)
