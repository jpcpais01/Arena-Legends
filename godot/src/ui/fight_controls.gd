class_name FightControls
extends Control
## The buttons in a fight's bottom-right corner (the web's .hud-ctrl):
## settings, camera, speed (1x, 2x, 4x), pause and leave. Changing the camera
## flashes its name over them.

signal settings
signal camera
signal speed
signal pause
signal leave

var _row: HBoxContainer
var _cam: PxButton
var _speed: PxButton
var _pause: PxButton
var _toast := ""
var _toast_t := 0.0


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_row = HBoxContainer.new()
	_row.add_theme_constant_override("separation", int(UI.c(6)))
	add_child(_row)
	var b_set := _btn("", "settings")
	b_set.pressed.connect(func(): settings.emit())
	_cam = _btn("", "camera")
	_cam.pressed.connect(func(): camera.emit())
	_speed = _btn("1x", "fast")
	_speed.pressed.connect(func(): speed.emit())
	_pause = _btn("", "pause")
	_pause.pressed.connect(func(): pause.emit())
	var b_exit := _btn("", "close")
	b_exit.pressed.connect(func(): leave.emit())
	resized.connect(_layout)


func _btn(t: String, g: String) -> PxButton:
	var b := PxButton.new(t, g)
	b.min_h = 2.3
	b.min_w = 2.6
	_row.add_child(b)
	return b


func _ready() -> void:
	_layout()


func _layout() -> void:
	var s := _row.get_combined_minimum_size()
	_row.size = s
	_row.position = Vector2(size.x - roundf(size.x * 0.03) - s.x, size.y - UI.c(10) - s.y)


func set_speed(n: int) -> void:
	_speed.set_text("%dx" % n)
	_speed.set_style("on" if n > 1 else "")
	_layout.call_deferred()


func set_paused(p: bool) -> void:
	_pause.set_glyph("play" if p else "pause")
	_pause.set_style("on" if p else "")


## Flashes the camera mode's name over the buttons.
func announce(name: String) -> void:
	_toast = name.to_upper()
	_toast_t = 1.4
	set_process(true)


func _process(dt: float) -> void:
	if _toast_t <= 0.0:
		set_process(false)
		return
	_toast_t -= dt
	queue_redraw()


func _draw() -> void:
	if _toast_t <= 0.0: return
	var a := clampf(_toast_t / (1.4 * 0.3), 0.0, 1.0)
	var fs := roundi(UI.r(0.8125))
	var f := UI.spaced("700", fs, 0.06)
	var gs := UI.glyph_size(fs * 1.1)
	var w := UI.r(0.7) * 2 + gs + roundf(fs * 0.45) + UI.text_w(f, _toast, fs)
	var h := UI.r(0.35) + UI.r(0.4) + fs
	var r := UI.rround(Rect2(_row.position.x + _row.size.x - w, _row.position.y - UI.c(6) - h, w, h))
	var p := float(UI.px)
	draw_rect(r, Color(UI.INK, a))
	var i := r.grow(-p)
	draw_rect(i, Color(UI.PANEL, a))
	draw_rect(Rect2(i.position, Vector2(i.size.x, p)), Color(1, 1, 1, 0.08 * a))
	draw_rect(Rect2(i.position.x, i.end.y - p * 2, i.size.x, p * 2), Color(0, 0, 0, 0.35 * a))
	var mid := r.position.y + r.size.y / 2.0
	UI.draw_glyph(self, "camera", Vector2(r.position.x + UI.r(0.7), roundf(mid - gs / 2.0)), gs, Color(UI.GOLD, a))
	draw_string(f, Vector2(r.position.x + UI.r(0.7) + gs + roundf(fs * 0.45), roundf(mid + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0)), _toast, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(UI.TEXT, a))
