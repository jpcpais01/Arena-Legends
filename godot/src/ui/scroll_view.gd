class_name ScrollView
extends Control
## A custom-drawn scroller (vertical, or sideways with `horizontal`): drag
## (with a fling), the mouse wheel, and a thin gold scrollbar. What it shows is drawn by `painter(ci, size, offset)`,
## so a long list costs one canvas item and draws only what's on screen. A tap
## that didn't scroll comes out as `tapped` in content coordinates.

signal scrolled(offset: float)
signal tapped(pos: Vector2)

var painter: Callable
var horizontal := false
## The thin gold scrollbar (off for the strips the web shows bare).
var show_bar := true
## Content length along the scroll axis (its height, or its width when horizontal).
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


func _len() -> float:
	return size.x if horizontal else size.y


func _along(v: Vector2) -> float:
	return v.x if horizontal else v.y


func max_offset() -> float:
	return maxf(0.0, content_h - _len())


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


## Scrolls just enough to show content y0..y1 (x0..x1 sideways).
func reveal(y0: float, y1: float) -> void:
	if y0 < offset: scroll_to(y0)
	elif y1 > offset + _len(): scroll_to(y1 - _len())


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
				_last_y = _along(e.position)
				_last_t = Time.get_ticks_usec()
			elif _press:
				_press = false
				if _dragging:
					if absf(_vel) > 60.0:
						_flinging = true
						set_process(true)
				else:
					tapped.emit(e.position + (Vector2(offset, 0) if horizontal else Vector2(0, offset)))
		accept_event()
	elif e is InputEventMouseMotion and _press:
		var d := _along(e.position) - _along(_start)
		if not _dragging and absf(d) > UI.c(8): _dragging = true
		if _dragging:
			var now := Time.get_ticks_usec()
			var dt := maxf(0.001, (now - _last_t) / 1e6)
			var v: float = -(_along(e.position) - _last_y) / dt
			_vel = lerpf(_vel, v, 0.4)
			_last_y = _along(e.position)
			_last_t = now
			scroll_to(_start_off - d)
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
	if show_bar and content_h > _len() + 1.0:
		var w := maxf(2.0, UI.c(3))
		var n := _len()
		var h := maxf(UI.r(2), n * n / content_h)
		var y := (n - h) * offset / max_offset()
		var bar := Rect2(y, size.y - w, h, w) if horizontal else Rect2(size.x - w - UI.c(1), y, w, h)
		draw_rect(bar, Color(UI.GOLD_LO, 0.85))
