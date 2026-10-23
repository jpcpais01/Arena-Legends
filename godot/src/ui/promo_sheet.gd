class_name PromoSheet
extends Sheet
## The promo code popup (the web's ui/promo.ts): six letter boxes and a QWERTY
## keyboard under them, so the phone's own keyboard never opens. A real keyboard
## types straight in. Redeem pays the reward right here.

const ROWS := ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"]
const WHY := {"short": "Codes are 6 letters.", "unknown": "That code doesn't exist.", "used": "You already redeemed that code."}
const HINT := "6 letters."

var code := ""
var _msg := HINT
var _bad := false
var _bad_t := 1.0
var _won = null
var _cells: UI.Paint
var _keys: Array[PxButton] = []
var _cancel: PxButton
var _go: PxButton
var _nice: PxButton
var _won_box: UI.Paint


func _init() -> void:
	super("Promo code", 34.0)
	_cells = UI.Paint.new(_paint_cells)
	body.add_child(_cells)
	for row in ROWS:
		for ch in row:
			_add_key(ch, ch, "")
		if row == ROWS[1]: _add_key("clr", "", "close")
	_add_key("del", "", "back")
	_cancel = PxButton.new("Cancel")
	_cancel.pressed.connect(close)
	body.add_child(_cancel)
	_go = PxButton.new("Redeem", "tag", "primary")
	_go.pressed.connect(_submit)
	body.add_child(_go)
	_won_box = UI.Paint.new(_paint_won)
	_won_box.visible = false
	body.add_child(_won_box)
	_nice = PxButton.new("Nice", "check", "primary")
	_nice.visible = false
	_nice.pressed.connect(func():
		Sfx.sfx.play("confirm")
		close())
	body.add_child(_nice)
	_paint()


func _add_key(k: String, label: String, glyph: String) -> void:
	var b := PxButton.new(label, glyph)
	b.font_rem = 1.15
	b.min_h = 2.3
	b.set_meta("k", k)
	b.pressed.connect(func(): _press(k))
	_keys.append(b)
	body.add_child(b)


func _press(k: String) -> void:
	Sfx.sfx.play("select")
	if k == "del": _edit(code.substr(0, maxi(0, code.length() - 1)))
	elif k == "clr": _edit("")
	else: _edit(code + k)


func _edit(next: String) -> void:
	var clean := ""
	for ch in next.to_upper():
		if ch >= "A" and ch <= "Z" and clean.length() < CharacterPromo.CODE_LEN: clean += ch
	if clean == code: return
	code = clean
	_bad = false
	_msg = HINT
	_paint()


func _paint() -> void:
	_go.disabled = code.length() != CharacterPromo.CODE_LEN
	_cells.queue_redraw()
	panel.queue_redraw()


func _submit() -> void:
	var r = CharacterPromo.redeem(code)
	if not r["ok"]:
		Sfx.sfx.play("back")
		_msg = WHY[r["why"]]
		_bad = true
		_bad_t = 0.0
		_paint()
		return
	Sfx.sfx.play("revealEpic" if r["admin"] else "gems")
	_won = r
	for k in _keys: k.visible = false
	_cells.visible = false
	_cancel.visible = false
	_go.visible = false
	_won_box.visible = true
	_nice.visible = true
	_layout()


func _unhandled_key_input(e: InputEvent) -> void:
	if not (e is InputEventKey) or not e.pressed or e.ctrl_pressed or e.alt_pressed or e.meta_pressed: return
	get_viewport().set_input_as_handled()
	var kc: int = e.keycode
	if kc == KEY_ESCAPE: close()
	elif kc == KEY_ENTER or kc == KEY_KP_ENTER:
		if _won != null: close()
		elif not _go.disabled: _submit()
	elif _won != null: return
	elif kc == KEY_BACKSPACE: _edit(code.substr(0, maxi(0, code.length() - 1)))
	elif kc >= KEY_A and kc <= KEY_Z: _edit(code + char(kc))


func _process(dt: float) -> void:
	super(dt)
	_bad_t = minf(1.0, _bad_t + dt / 0.32)
	_cells.queue_redraw()


func _pad() -> Vector2:
	return Vector2(UI.r(0.8), UI.r(0.45))


func _cell_h() -> float:
	return UI.r(2.2)


func _key_h() -> float:
	return UI.r(2.3)


func _foot_h() -> float:
	return UI.r(2.4)


func _body_size(avail: Vector2) -> Vector2:
	var pad := _pad()
	if _won != null:
		return Vector2(avail.x, pad.y + _won_h(avail.x - pad.x * 2) + UI.c(10) + _nice.custom_minimum_size.y + UI.r(0.55))
	return Vector2(avail.x, pad.y + _cell_h() + UI.c(6) + _key_h() * 3 + UI.c(4) * 2 + UI.c(6) + _foot_h() + UI.r(0.55))


func _layout_body(s: Vector2) -> void:
	var pad := _pad()
	var w := s.x - pad.x * 2
	if _won != null:
		_won_box.position = Vector2(pad.x, pad.y)
		_won_box.size = Vector2(w, _won_h(w))
		_nice.size = _nice.custom_minimum_size
		_nice.position = Vector2(roundf((s.x - _nice.size.x) / 2.0), _won_box.position.y + _won_box.size.y + UI.c(10))
		return
	_cells.position = Vector2(pad.x, pad.y)
	_cells.size = Vector2(w, _cell_h())
	# The keyboard: 20 columns, each key two wide, the rows staggered like a real one.
	var gap := UI.c(4)
	var colw := (w - gap * 19) / 20.0
	var y := pad.y + _cell_h() + UI.c(6)
	var i := 0
	var spans := []
	# Row 1: ten keys. Row 2: from column 2, nine keys. Row 3: Clear (3 wide), seven keys, Delete (3 wide).
	for c in 10: spans.append([0, c * 2, 2])
	for c in 9: spans.append([1, 1 + c * 2, 2])
	spans.append([2, 0, 3])
	for c in 7: spans.append([2, 3 + c * 2, 2])
	spans.append([2, 17, 3])
	for sp in spans:
		var b := _keys[i]
		var x0: float = sp[1] * (colw + gap)
		var cols: int = sp[2]
		var ww := cols * colw + (cols - 1) * gap
		b.position = Vector2(pad.x + roundf(x0), y + sp[0] * (_key_h() + gap))
		b.size = Vector2(roundf(ww), _key_h())
		i += 1
	y += _key_h() * 3 + gap * 2 + UI.c(6)
	for b in [_cancel, _go]:
		b.min_h = 2.4
		b.refit()
		b.size = b.custom_minimum_size
	_go.position = Vector2(s.x - pad.x - _go.size.x, y)
	_cancel.position = Vector2(_go.position.x - UI.c(8) - _cancel.size.x, y)
	_m_msg = Rect2(pad.x, y, _cancel.position.x - UI.c(8) - pad.x, _foot_h())


var _m_msg := Rect2()


func _paint_extra(ci: CanvasItem, _s: Vector2) -> void:
	if _won != null or _m_msg.size.x <= 0: return
	var fs := roundi(UI.r(0.8125))
	var f := UI.font("500")
	var r := _m_msg
	r.position += body.position
	var lay := Rich.layout([Rich.run(_msg, f, fs, Color("#ff8a8a") if _bad else UI.MUTED)], r.size.x, roundf(fs * 1.3), 2)
	lay.draw(ci, Vector2(r.position.x, roundf(r.position.y + (r.size.y - lay.h) / 2.0)))


func _paint_cells(ci: CanvasItem, s: Vector2) -> void:
	var n := CharacterPromo.CODE_LEN
	var gap := UI.r(0.4)
	var cw := minf(UI.r(3.2), (s.x - gap * (n - 1)) / n)
	var tw := cw * n + gap * (n - 1)
	# The shake when a code is refused.
	var dx := 0.0
	if _bad_t < 1.0:
		var k := _bad_t
		dx = UI.c(6) * sin(k * TAU * 2.0) * (1.0 - k)
	var x0 := roundf((s.x - tw) / 2.0 + dx)
	var p := float(UI.px)
	var on := mini(code.length(), n - 1)
	var blink := fmod(Time.get_ticks_msec() / 1000.0, 1.0) < 0.5
	var fs := roundi(UI.r(1.3))
	var f := UI.font("p700")
	for i in n:
		var r := UI.rround(Rect2(x0 + i * (cw + gap), 0, cw, s.y))
		ci.draw_rect(r, UI.INK)
		var inner := r.grow(-p)
		ci.draw_rect(inner, Color("#0b0715"))
		ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p * 2)), Color("#05030a"))
		var lit := i == on and _won == null
		ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), UI.GOLD if lit and blink else Color(1, 216 / 255.0, 96 / 255.0, 0.25))
		if lit: ShopKit.ring(ci, r.grow(p), UI.GOLD, p)
		if i < code.length():
			var ch := code[i]
			UI.draw_text(ci, f, Vector2(roundf(r.get_center().x - UI.text_w(f, ch, fs) / 2.0), ShopKit.base_at(f, fs, r.get_center().y)), ch, fs, Color("#ff8a8a") if _bad else UI.GOLD_HI, "outline")


func _won_h(w: float) -> float:
	var h := 0.0
	if _won != null and _won["admin"]: h += roundi(UI.r(1.3)) + UI.r(0.5)
	h += roundi(UI.r(1.5)) + UI.r(0.5)
	return h + _won_text(w).h


func _won_text(w: float) -> Rich.Layout:
	var t := "The gems are in your purse."
	if _won["admin"]: t = "Every skin, entrance, finisher and pose is yours, including future ones. The gems are in your purse."
	elif _won["wasAdmin"]: t = "You're already an admin, so the code gave you the gems."
	var fs := roundi(UI.r(0.9))
	return Rich.layout([Rich.run(t, UI.font("500"), fs, UI.TEXT)], w, roundf(fs * 1.4))


func _paint_won(ci: CanvasItem, s: Vector2) -> void:
	if _won == null: return
	var y := 0.0
	var cx := s.x / 2.0
	if _won["admin"]:
		var fs := roundi(UI.r(1.3))
		var f := UI.spaced("p700", fs, 0.06)
		var gs := UI.glyph_size(fs * 1.2)
		var t := "ADMIN ACCOUNT"
		var w := gs + fs * 0.4 + UI.text_w(f, t, fs)
		var x := roundf(cx - w / 2.0)
		UI.draw_glyph(ci, "crown", Vector2(x, y + (fs - gs) / 2.0), gs, UI.GOLD, UI.INK)
		UI.draw_text(ci, f, Vector2(x + gs + fs * 0.4, y + f.get_ascent(fs) - UI.px), t, fs, UI.GOLD_HI, "outline")
		y += fs + UI.r(0.5)
	var gfs := roundi(UI.r(1.5))
	var amount := "+%d" % int(_won["gems"])
	var gw := ShopKit.gem_w(amount, gfs)
	ShopKit.gem_tag(ci, roundf(cx - gw / 2.0), y + gfs / 2.0, amount, gfs)
	y += gfs + UI.r(0.5)
	var lay := _won_text(s.x)
	lay.draw(ci, Vector2(0, y), 0.5, s.x)
