class_name NotesSheet
extends Sheet
## Patch notes (the web's ui/patchNotes.ts, wide layout): an index of versions
## on the left (tap one to jump to it) beside every version's notes, newest
## first. The text is shaped once into TextParagraphs and only the sections on
## screen are drawn.

const MONTHS := ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

var _index: ScrollView
var _notes: ScrollView
var _on := 0
## Per version: {y, h, chip, title: TextParagraph, title_at, date, date_at, items: [[TextParagraph, Vector2]]}.
var _secs: Array = []
var _laid_w := -1.0


func _init() -> void:
	super("Patch notes", 60.0)
	_index = ScrollView.new(_paint_index)
	_index.tapped.connect(_on_index_tap)
	body.add_child(_index)
	_notes = ScrollView.new(_paint_notes)
	_notes.scrolled.connect(_on_scroll)
	body.add_child(_notes)


func _body_size(avail: Vector2) -> Vector2:
	return avail


func _index_w(w: float) -> float:
	return clampf(roundf(w * 0.25), UI.r(10), UI.r(15))


func _layout_body(s: Vector2) -> void:
	var iw := _index_w(s.x)
	_index.position = Vector2.ZERO
	_index.size = Vector2(iw, s.y)
	_notes.position = Vector2(iw, 0)
	_notes.size = Vector2(s.x - iw, s.y)
	_index.set_content_h(UI.r(0.5) * 2 + Patchnotes.PATCH_NOTES.size() * (_row_h() + UI.c(2)))
	_shape(_notes.size.x)


static func date_text(iso: String) -> String:
	var p := iso.split("-")
	if p.size() != 3: return iso
	var m := int(p[1])
	if m < 1 or m > 12: return iso
	return "%s %d, %s" % [MONTHS[m - 1], int(p[2]), p[0]]


# --- Notes ---------------------------------------------------------------------------------

func _para(text: String, kind: String, fs: int, w: float) -> TextParagraph:
	var t := TextParagraph.new()
	t.add_string(text, UI.font(kind), fs)
	t.width = w
	t.break_flags = TextServer.BREAK_MANDATORY | TextServer.BREAK_WORD_BOUND | TextServer.BREAK_ADAPTIVE
	return t


## Lines of a paragraph at a line height of `lh` times the font size.
func _para_h(t: TextParagraph, fs: int, lh: float) -> float:
	return t.get_line_count() * roundf(fs * lh)


func _shape(w: float) -> void:
	if w == _laid_w: return
	_laid_w = w
	_secs.clear()
	var pad_x := UI.r(1.0)
	var inner := w - pad_x * 2
	var y := UI.r(0.8)
	var chip_fs := roundi(UI.r(0.75))
	var tfs := roundi(UI.r(1.0))
	var dfs := roundi(UI.r(0.75))
	var lfs := roundi(UI.r(0.875))
	var cf := UI.font("700")
	for n in Patchnotes.PATCH_NOTES:
		var sec := {"y": y}
		var chip := "v" + str(n["version"])
		var chip_w := UI.text_w(cf, chip, chip_fs) + UI.r(0.35) * 2
		var chip_h := chip_fs + UI.r(0.25)
		sec["chip"] = [chip, Rect2(pad_x, y, chip_w, chip_h)]
		var tx := pad_x + chip_w + UI.c(8)
		var title := _para(str(n["title"]), "700", tfs, inner - chip_w - UI.c(8))
		var date := date_text(str(n["date"]))
		var dw := UI.text_w(UI.font("500"), date, dfs)
		var head_h := maxf(chip_h, _para_h(title, tfs, 1.2))
		sec["title"] = title
		sec["title_at"] = Vector2(tx, y + (chip_h - roundf(tfs * 1.2)) / 2.0)
		var last_w: float = title.get_line_size(title.get_line_count() - 1).x
		if tx + last_w + UI.c(8) + dw <= pad_x + inner:
			sec["date_at"] = Vector2(tx + last_w + UI.c(8), sec["title_at"].y + (title.get_line_count() - 1) * roundf(tfs * 1.2))
		else:
			sec["date_at"] = Vector2(tx, y + head_h)
			head_h += roundf(dfs * 1.3)
		sec["date"] = date
		y += head_h + UI.c(6)
		var items := []
		for t in n["notes"]:
			y += UI.c(3)
			var para := _para(str(t), "500", lfs, inner - UI.r(1.1))
			items.append([para, Vector2(pad_x + UI.r(1.1), y)])
			y += _para_h(para, lfs, 1.4) + UI.c(3)
		sec["items"] = items
		y += UI.r(1.1)
		sec["h"] = y - sec["y"]
		_secs.append(sec)
	_notes.set_content_h(y)
	_notes.queue_redraw()


func _paint_notes(ci: CanvasItem, s: Vector2, off: float) -> void:
	var rid := ci.get_canvas_item()
	var chip_fs := roundi(UI.r(0.75))
	var tfs := roundi(UI.r(1.0))
	var dfs := roundi(UI.r(0.75))
	var lfs := roundi(UI.r(0.875))
	var cf := UI.font("700")
	var df := UI.font("500")
	var lh := roundf(lfs * 1.4)
	var th := roundf(tfs * 1.2)
	for sec in _secs:
		var top: float = sec["y"] - off
		if top > s.y: break
		if top + sec["h"] < 0: continue
		var shift := Vector2(0, -off)
		var c: Array = sec["chip"]
		var cr: Rect2 = c[1]
		cr.position += shift
		ci.draw_rect(cr, UI.GOLD)
		ci.draw_string(cf, Vector2(cr.position.x + UI.r(0.35), roundf(cr.position.y + (cr.size.y + cf.get_ascent(chip_fs) - cf.get_descent(chip_fs)) / 2.0)), c[0], HORIZONTAL_ALIGNMENT_LEFT, -1, chip_fs, UI.GOLD_INK)
		var title: TextParagraph = sec["title"]
		var ta: Vector2 = sec["title_at"] + shift
		for i in title.get_line_count():
			title.draw_line(rid, Vector2(ta.x, roundf(ta.y + i * th + (th - title.get_line_size(i).y) / 2.0)), i, UI.TEXT)
		var da: Vector2 = sec["date_at"] + shift
		ci.draw_string(df, Vector2(da.x, roundf(da.y + (th + df.get_ascent(dfs) - df.get_descent(dfs)) / 2.0)), sec["date"], HORIZONTAL_ALIGNMENT_LEFT, -1, dfs, UI.MUTED)
		for it in sec["items"]:
			var para: TextParagraph = it[0]
			var at: Vector2 = it[1] + shift
			if at.y > s.y: break
			if at.y + para.get_line_count() * lh < 0: continue
			# The bullet, gold, on the first line.
			var d := roundf(lfs * 0.3)
			ci.draw_rect(Rect2(at.x - UI.r(0.75), roundf(at.y + (lh - d) / 2.0), d, d), UI.GOLD)
			for i in para.get_line_count():
				var y := at.y + i * lh
				if y > s.y or y + lh < 0: continue
				para.draw_line(rid, Vector2(at.x, roundf(y + (lh - para.get_line_size(i).y) / 2.0)), i, UI.TEXT)


func _on_scroll(off: float) -> void:
	var y := off + UI.c(24)
	var i := _secs.size() - 1
	for j in _secs.size():
		if _secs[j]["y"] + _secs[j]["h"] > y:
			i = j
			break
	if i == _on: return
	_on = i
	var top := UI.r(0.5) + i * (_row_h() + UI.c(2))
	_index.reveal(top, top + _row_h())
	_index.queue_redraw()


# --- Index ---------------------------------------------------------------------------------

func _row_h() -> float:
	return roundf(UI.r(0.35) * 2 + UI.r(0.75) + UI.c(2) + UI.r(0.8125) * 1.2)


func _on_index_tap(pos: Vector2) -> void:
	var i := floori((pos.y - UI.r(0.5)) / (_row_h() + UI.c(2)))
	if i < 0 or i >= _secs.size(): return
	Sfx.sfx.play("select")
	_notes.scroll_to(_secs[i]["y"] - UI.c(6))
	_on = i
	_index.queue_redraw()


func _paint_index(ci: CanvasItem, s: Vector2, off: float) -> void:
	ci.draw_rect(Rect2(Vector2.ZERO, s), Color(0, 0, 0, 0.22))
	var p := float(UI.px)
	var rh := _row_h()
	var vfs := roundi(UI.r(0.75))
	var tfs := roundi(UI.r(0.8125))
	var vf := UI.font("700")
	var tf := UI.font("500")
	var x0 := UI.r(0.4)
	var w := s.x - UI.r(0.4) * 2
	var notes: Array = Patchnotes.PATCH_NOTES
	var first := maxi(0, floori((off - UI.r(0.5)) / (rh + UI.c(2))))
	for i in range(first, notes.size()):
		var y := UI.r(0.5) + i * (rh + UI.c(2)) - off
		if y > s.y: break
		var on := i == _on
		if on:
			ci.draw_rect(Rect2(x0, y, w, rh), Color(UI.GOLD, 0.12))
			ci.draw_rect(Rect2(x0, y, p * 2, rh), UI.GOLD)
		var tx := x0 + p * 2 + UI.r(0.5)
		ci.draw_string(vf, Vector2(tx, roundf(y + UI.r(0.35) + vf.get_ascent(vfs))), "v" + str(notes[i]["version"]), HORIZONTAL_ALIGNMENT_LEFT, -1, vfs, UI.GOLD)
		var t := HomeMenu.NamePlate._fit(tf, str(notes[i]["title"]), tfs, w - (tx - x0) - UI.r(0.5))
		ci.draw_string(tf, Vector2(tx, roundf(y + UI.r(0.35) + UI.r(0.75) + UI.c(2) + tf.get_ascent(tfs))), t, HORIZONTAL_ALIGNMENT_LEFT, -1, tfs, UI.TEXT if on else UI.MUTED)
	ci.draw_rect(Rect2(s.x - UI.c(2), 0, UI.c(2), s.y), UI.INK)
