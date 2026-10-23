class_name ScrollView
extends Control
## A custom-drawn vertical scroller: drag (with a fling), the mouse wheel, and
## a thin gold scrollbar. What it shows is drawn by `painter(ci, size, offset)`,
## so a long list costs one canvas item and draws only what's on screen. A tap
## that didn't scroll comes out as `tapped` in content coordinates.

signal scrolled(offset: float)
signal tapped(pos: Vector2)

var painter: Callable
var content_h := 0.0
var offset := 0.0
var _press := false
var _dragging := false
var _start := Vector2.ZERO
var _start_off := 0.0
var _vel := 0.0
var _last_y := 0.0
var _last_t := 0
var _flinging := false


func _init(f: Callable) -> void:
	painter = f
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_process(false)


func max_offset() -> float:
	return maxf(0.0, content_h - size.y)


func set_content_h(h: float) -> void:
	content_h = h
	scroll_to(offset)


func scroll_to(y: float) -> void:
	var o := clampf(y, 0.0, max_offset())
	if o == offset:
		queue_redraw()
		return
	offset = o
	queue_redraw()
	scrolled.emit(offset)


## Scrolls just enough to show content rows y0..y1.
func reveal(y0: float, y1: float) -> void:
	if y0 < offset: scroll_to(y0)
	elif y1 > offset + size.y: scroll_to(y1 - size.y)


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton:
		if e.button_index == MOUSE_BUTTON_WHEEL_DOWN and e.pressed:
			scroll_to(offset + UI.r(4))
		elif e.button_index == MOUSE_BUTTON_WHEEL_UP and e.pressed:
			scroll_to(offset - UI.r(4))
		elif e.button_index == MOUSE_BUTTON_LEFT:
			if e.pressed:
				_press = true
				_dragging = false
				_flinging = false
				_start = e.position
				_start_off = offset
				_vel = 0.0
				_last_y = e.position.y
				_last_t = Time.get_ticks_usec()
			elif _press:
				_press = false
				if _dragging:
					if absf(_vel) > 60.0:
						_flinging = true
						set_process(true)
				else:
					tapped.emit(e.position + Vector2(0, offset))
		accept_event()
	elif e is InputEventMouseMotion and _press:
		if not _dragging and absf(e.position.y - _start.y) > UI.c(8): _dragging = true
		if _dragging:
			var now := Time.get_ticks_usec()
			var dt := maxf(0.001, (now - _last_t) / 1e6)
			var v: float = -(e.position.y - _last_y) / dt
			_vel = lerpf(_vel, v, 0.4)
			_last_y = e.position.y
			_last_t = now
			scroll_to(_start_off - (e.position.y - _start.y))
		accept_event()


func _process(dt: float) -> void:
	if not _flinging:
		set_process(false)
		return
	scroll_to(offset + _vel * dt)
	_vel *= pow(0.04, dt)
	if absf(_vel) < 20.0 or offset <= 0.0 or offset >= max_offset():
		_flinging = false


func _draw() -> void:
	painter.call(self, size, offset)
	if content_h > size.y + 1.0:
		var w := maxf(2.0, UI.c(3))
		var h := maxf(UI.r(2), size.y * size.y / content_h)
		var y := (size.y - h) * offset / max_offset()
		draw_rect(Rect2(size.x - w - UI.c(1), y, w, h), Color(UI.GOLD_LO, 0.85))
