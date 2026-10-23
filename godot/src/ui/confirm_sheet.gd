class_name ConfirmSheet
extends Sheet
## A small yes/no popup (the web's ui/confirm.ts): a title, a line of text,
## Cancel and the action. A tap outside or Back cancels.

signal ok

var _msg := ""
var _text: Rich.Layout
var _para: UI.Paint
var _cancel: PxButton
var _ok: PxButton


func _init(t: String, text: String, ok_label: String, glyph := "check") -> void:
	super(t, 24.0)
	close_btn.visible = false
	_msg = text
	_para = UI.Paint.new(func(ci: CanvasItem, _s: Vector2): if _text != null: _text.draw(ci, Vector2.ZERO))
	body.add_child(_para)
	_cancel = PxButton.new("Cancel")
	_cancel.pressed.connect(close)
	body.add_child(_cancel)
	_ok = PxButton.new(ok_label, glyph, "primary")
	_ok.pressed.connect(func():
		close()
		ok.emit())
	body.add_child(_ok)


func _pad() -> Vector2:
	return Vector2(UI.r(1.0), UI.r(0.85))


func _body_size(avail: Vector2) -> Vector2:
	var fs := roundi(UI.r(0.9))
	_text = Rich.layout([Rich.run(_msg, UI.font("500"), fs, UI.TEXT)], avail.x - _pad().x * 2, roundf(fs * 1.45))
	return Vector2(avail.x, _pad().y + _text.h + UI.c(14) + _ok.custom_minimum_size.y + UI.r(1.0))


func _layout_body(s: Vector2) -> void:
	var pad := _pad()
	_para.position = pad
	_para.size = Vector2(s.x - pad.x * 2, _text.h)
	var y := pad.y + _text.h + UI.c(14)
	_ok.size = _ok.custom_minimum_size
	_ok.position = Vector2(s.x - pad.x - _ok.size.x, y)
	_cancel.size = _cancel.custom_minimum_size
	_cancel.position = Vector2(_ok.position.x - UI.c(6) - _cancel.size.x, y)
