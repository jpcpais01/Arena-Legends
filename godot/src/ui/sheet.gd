class_name Sheet
extends Control
## A modal sheet over everything (the web's .sheet-wrap / .sheet): the screen
## dims, a gold-framed panel pops in with a title bar and a close button, and
## a tap outside or the back button closes it. Subclasses put their content in
## `body` and size it with `_body_size(avail)`; with no title there's no bar.

signal closed

var title := ""
## Panel width in rem (it never exceeds the safe area).
var want_w := 36.0
## A tap on the dim backdrop (or Back) closes it.
var dismissable := true
var panel: Control
var body: Control
var close_btn: PxButton
var _t := 0.0
var _closing := -1.0
var _popped := false


func _init(t := "", w := 36.0) -> void:
	title = t
	want_w = w
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	panel = UI.Paint.new(_paint_panel)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(panel)
	body = Control.new()
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.clip_contents = true
	panel.add_child(body)
	if title != "":
		close_btn = PxButton.new("", "close")
		close_btn.min_h = 2.1
		close_btn.min_w = 2.3
		close_btn.pressed.connect(close)
		panel.add_child(close_btn)
	resized.connect(_layout)


func _ready() -> void:
	_layout()
	# Wrapped text settles its height after the first pass.
	_layout.call_deferred()


## Content size for the body given the room left (override).
func _body_size(avail: Vector2) -> Vector2:
	return avail


## Lays out the body's children once its size is known (override).
func _layout_body(_s: Vector2) -> void:
	pass


func head_h() -> float:
	if title == "": return 0.0
	return UI.r(0.2) + UI.r(2.1) + UI.r(0.35) + UI.px


func _safe() -> Rect2:
	var sl := roundf(size.x * 0.03)
	var st := UI.c(10)
	return Rect2(sl, st, size.x - sl * 2, size.y - st * 2)


func _layout() -> void:
	if size.x < 2: return
	var safe := _safe()
	var fw := UI.frame_w("gold")
	var w := minf(UI.r(want_w), safe.size.x)
	var avail := Vector2(w - fw * 2, safe.size.y - fw * 2 - head_h())
	var bs := _body_size(avail)
	bs = Vector2(minf(bs.x, avail.x), minf(bs.y, avail.y)).round()
	var ps := Vector2(w, bs.y + fw * 2 + head_h()).round()
	panel.position = (safe.position + (safe.size - ps) / 2.0).round()
	panel.size = ps
	panel.pivot_offset = ps / 2.0
	body.position = Vector2(fw, fw + head_h())
	body.size = Vector2(ps.x - fw * 2, bs.y)
	if close_btn != null:
		var cs := close_btn.custom_minimum_size
		close_btn.size = cs
		close_btn.position = Vector2(ps.x - fw - UI.r(0.2) - cs.x, fw + UI.r(0.2))
	_layout_body(body.size)
	queue_redraw()
	panel.queue_redraw()


func close() -> void:
	if _closing >= 0.0: return
	_closing = 0.0
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	closed.emit()


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		accept_event()
		if dismissable and not panel.get_rect().has_point(e.position):
			Sfx.sfx.play("ui")
			close()


func _process(dt: float) -> void:
	_t += dt
	if _closing >= 0.0:
		_closing += dt
		modulate.a = clampf(1.0 - _closing / 0.12, 0.0, 1.0)
		if _closing > 0.14: queue_free()
		return
	if _popped: return
	# Pops in: 200 ms from 92% with a little overshoot, the dim fading in over 160 ms.
	var k := clampf(_t / 0.2, 0.0, 1.0)
	var c1 := 1.4
	var e := 1.0 + (c1 + 1.0) * pow(k - 1.0, 3.0) + c1 * pow(k - 1.0, 2.0)
	panel.scale = Vector2.ONE * lerpf(0.92, 1.0, e)
	panel.modulate.a = k
	modulate.a = clampf(_t / 0.16, 0.0, 1.0)
	if k >= 1.0 and _t > 0.2:
		panel.scale = Vector2.ONE
		_popped = true


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(8 / 255.0, 5 / 255.0, 14 / 255.0, 0.72))


func _paint_panel(ci: CanvasItem, s: Vector2) -> void:
	var rid := ci.get_canvas_item()
	var p := float(UI.px)
	var fw := UI.frame_w("gold")
	UI.panel_fill(rid, Rect2(Vector2(p * 2, p * 2), s - Vector2(p * 4, p * 4)))
	if title != "":
		var hr := Rect2(fw, fw, s.x - fw * 2, head_h())
		UI.vgrad(rid, Rect2(hr.position, hr.size - Vector2(0, p)), [[0.0, Color(184 / 255.0, 41 / 255.0, 63 / 255.0, 0.18)], [1.0, Color(184 / 255.0, 41 / 255.0, 63 / 255.0, 0.0)]])
		ci.draw_rect(Rect2(hr.position.x, hr.end.y - p, hr.size.x, p), UI.INK)
		ci.draw_rect(Rect2(hr.position.x, hr.end.y, hr.size.x, p), Color(92 / 255.0, 74 / 255.0, 140 / 255.0, 0.35))
		var fs := roundi(UI.r(1.1))
		var f := UI.spaced("p700", fs, 0.08)
		var base := roundf(hr.position.y + (hr.size.y - p) / 2.0 + f.get_ascent(fs) * 0.38)
		UI.draw_text(ci, f, Vector2(hr.position.x + UI.r(0.5), base), title.to_upper(), fs, UI.GOLD_HI, "outline")
	_paint_extra(ci, s)
	UI.draw_frame(rid, Rect2(Vector2.ZERO, s), "gold")


## Extra panel art under the frame (override).
func _paint_extra(_ci: CanvasItem, _s: Vector2) -> void:
	pass
