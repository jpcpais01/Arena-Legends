class_name ResultsSheet
extends Sheet
## End of a fight (the web's ui/results.ts, phone landscape layout): the
## verdict, the gems and XP it paid and the buttons on the left, both
## fighters' totals side by side with tug-of-war bars on the right.

signal rematch
signal new_rival
signal menu

const ROWS := [["damageDealt", "Damage"], ["hits", "Hits"], ["biggestHit", "Biggest hit"], ["crits", "Crits"],
	["parries", "Parries"], ["blocks", "Blocks"], ["evades", "Evades"], ["feints", "Feints"], ["healed", "Healed"]]
## Always shown; the rest only when someone did it.
const KEEP := ["damageDealt", "hits", "biggestHit"]
const GEM := Color("#6fe8ff")

var _b
var _head := ""
var _sub := ""
var _rc := UI.GOLD
## {gems, hp} for a win, or null.
var _reward = null
## {gained, from, to} (CharacterProgress.add_xp), or null.
var _xp = null
var _rows: Array = []
var _left: UI.Paint
var _stats: UI.Paint
var _btns: Array[PxButton] = []
var _age := 0.0


func _init(b, reward = null, xp = null) -> void:
	super("", 52.0)
	dismissable = false
	_b = b
	_reward = reward if reward != null and reward.get("gems", 0) > 0 else null
	_xp = xp if xp != null and xp.get("gained", 0) > 0 else null
	var w: int = int(b.winner)
	var f: Array = b.fighters
	if w == -1:
		_head = "Draw"
		_sub = "Time ran out with both fighters level"
		_rc = UI.CYAN
	else:
		_head = "Victory!" if w == 0 else "Defeat"
		_rc = UI.GOLD if w == 0 else UI.RED
		var ko: bool = f.any(func(x): return not x["alive"])
		_sub = ("%s wins by K.O. at %.1fs" % [f[w]["name"], float(b.time)]) if ko else ("%s wins on remaining health" % f[w]["name"])
	for row in ROWS:
		var a := float(f[0]["totals"][row[0]])
		var c := float(f[1]["totals"][row[0]])
		if KEEP.has(row[0]) or a > 0 or c > 0: _rows.append([row[1], a, c])
	_left = UI.Paint.new(_paint_left)
	body.add_child(_left)
	_stats = UI.Paint.new(_paint_stats)
	body.add_child(_stats)
	var bm := PxButton.new("Menu", "home")
	bm.pressed.connect(func(): menu.emit())
	var bn := PxButton.new("New rival", "dice")
	bn.pressed.connect(func(): new_rival.emit())
	var br := PxButton.new("Rematch", "replay", "primary")
	br.font_rem = 1.05
	br.pressed.connect(func(): rematch.emit())
	_btns = [br, bm, bn]
	for x in _btns:
		x.min_h = 2.3
		body.add_child(x)
	br.min_h = 2.7
	set_process(true)


func _process(dt: float) -> void:
	super(dt)
	_age += dt
	if _age < 2.0: _left.queue_redraw()


# --- Sizes ---------------------------------------------------------------------------------

func _foot_h() -> float:
	return UI.r(0.45) + UI.r(2.7) + UI.c(6) + UI.r(2.3) + UI.r(0.3) + UI.px


func _banner_h(w: float) -> float:
	var h := UI.r(0.5) * 2 + UI.r(1.6)
	var sf := UI.font("500")
	var sfs := roundi(UI.r(0.8125))
	h += UI.c(5) + sf.get_multiline_string_size(_sub, HORIZONTAL_ALIGNMENT_CENTER, w - UI.r(0.8) * 2, sfs).y
	if _reward != null: h += UI.c(5) + UI.r(1.25)
	if _xp != null:
		h += UI.c(5) + UI.r(1.1)
		if _ups() > 0: h += UI.c(5) + UI.r(0.8125)
	return h


func _stats_h() -> float:
	return UI.r(0.5) + UI.r(1.0) + UI.c(6) + _rows.size() * _row_h() + maxf(0, _rows.size() - 1) * UI.c(2) + UI.r(0.6)


func _row_h() -> float:
	return maxf(UI.r(0.875) * 1.2, UI.r(0.625) * 1.2 + UI.c(2) + UI.c(6))


func _ups() -> int:
	return int(_xp["to"]["level"]) - int(_xp["from"]["level"]) if _xp != null else 0


func _body_size(avail: Vector2) -> Vector2:
	var lw := roundf(avail.x * 0.45)
	return Vector2(avail.x, maxf(_banner_h(lw) + _foot_h(), _stats_h()))


func _layout_body(s: Vector2) -> void:
	var lw := roundf(s.x * 0.45)
	_left.position = Vector2.ZERO
	_left.size = Vector2(lw, s.y)
	_stats.position = Vector2(lw, 0)
	_stats.size = Vector2(s.x - lw, s.y)
	var x0 := UI.r(0.6)
	var x1 := lw - UI.c(2) - UI.r(0.6)
	var y := s.y - UI.r(0.3) - UI.r(2.3)
	var half := roundf((x1 - x0 - UI.c(6)) / 2.0)
	_btns[1].position = Vector2(x0, y)
	_btns[1].size = Vector2(half, UI.r(2.3))
	_btns[2].position = Vector2(x0 + half + UI.c(6), y)
	_btns[2].size = Vector2(x1 - x0 - half - UI.c(6), UI.r(2.3))
	_btns[0].position = Vector2(x0, y - UI.c(6) - UI.r(2.7))
	_btns[0].size = Vector2(x1 - x0, UI.r(2.7))


# --- Drawing -------------------------------------------------------------------------------

func _paint_left(ci: CanvasItem, s: Vector2) -> void:
	var rid := ci.get_canvas_item()
	var p := float(UI.px)
	var bw := UI.c(2)
	var foot_top := s.y - _foot_h()
	UI.vgrad(rid, Rect2(0, 0, s.x - bw, foot_top), [[0.0, Color(_rc, 0.26)], [0.85, Color(_rc, 0.0)], [1.0, Color(_rc, 0.0)]])
	ci.draw_rect(Rect2(s.x - bw, 0, bw, s.y), UI.INK)
	ci.draw_rect(Rect2(0, foot_top, s.x - bw, p), UI.INK)
	ci.draw_rect(Rect2(0, foot_top + p, s.x - bw, p), Color(92 / 255.0, 74 / 255.0, 140 / 255.0, 0.35))
	# The banner's lines, centred as a block in the space over the buttons.
	var w := s.x - bw
	var block := _banner_h(w) - UI.r(0.5) * 2
	var y := roundf(maxf(UI.r(0.5), (foot_top - block) / 2.0))
	var cx := w / 2.0
	# Verdict: big pixel capitals in the mood colour with a thick ink ring.
	var fs := roundi(UI.r(1.6))
	var f := UI.spaced("p700", fs, 0.06)
	var up := _head.to_upper()
	var tw := UI.text_w(f, up, fs)
	var base := y + f.get_ascent(fs) * 0.9
	var o := UI.c(3)
	var at := Vector2(roundf(cx - tw / 2.0), roundf(base))
	for d in [Vector2(o, 0), Vector2(-o, 0), Vector2(0, o), Vector2(0, -o)]:
		ci.draw_string(f, at + d, up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.INK)
	ci.draw_string(f, at, up, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, _rc)
	y += UI.r(1.6) + UI.c(5)
	# How it ended.
	var sf := UI.font("500")
	var sfs := roundi(UI.r(0.8125))
	var sw := w - UI.r(0.8) * 2
	var ss := sf.get_multiline_string_size(_sub, HORIZONTAL_ALIGNMENT_CENTER, sw, sfs)
	ci.draw_multiline_string(sf, Vector2(UI.r(0.8), roundf(y + sf.get_ascent(sfs))), _sub, HORIZONTAL_ALIGNMENT_CENTER, sw, sfs, -1, UI.MUTED)
	y += ss.y + UI.c(5)
	if _reward != null:
		_paint_gems(ci, cx, y)
		y += UI.r(1.25) + UI.c(5)
	if _xp != null:
		_paint_xp(ci, cx, y)


## "+40 gems" popping in, and how much health the win kept.
func _paint_gems(ci: CanvasItem, cx: float, y: float) -> void:
	var gfs := roundi(UI.r(1.25))
	var gf := UI.font("700")
	var txt := "+%d" % int(_reward["gems"])
	var gs := UI.glyph_size(gfs * 1.05)
	var sfs := roundi(UI.r(0.8125))
	var sf := UI.font("500")
	var note := "Victory with %d%% health left" % roundi(float(_reward["hp"]) * 100.0)
	var tag_w := gs + UI.c(3) + UI.text_w(gf, txt, gfs)
	var total := tag_w + UI.r(0.5) + UI.text_w(sf, note, sfs)
	var x := roundf(cx - total / 2.0)
	var mid := y + UI.r(1.25) / 2.0
	# Pop: from nothing to a little over full size and back (400 ms, after 300 ms).
	var k := clampf((_age - 0.3) / 0.4, 0.0, 1.0)
	var c1 := 2.2
	var e := 1.0 + (c1 + 1.0) * pow(k - 1.0, 3.0) + c1 * pow(k - 1.0, 2.0)
	if k > 0.0:
		var pivot := Vector2(x + tag_w / 2.0, mid)
		ci.draw_set_transform(pivot - pivot * e, 0.0, Vector2.ONE * e)
		UI.draw_glyph(ci, "gem", Vector2(x, roundf(mid - gs / 2.0)), gs, GEM, UI.INK)
		UI.draw_text(ci, gf, Vector2(x + gs + UI.c(3), roundf(mid + (gf.get_ascent(gfs) - gf.get_descent(gfs)) / 2.0)), txt, gfs, GEM)
		ci.draw_set_transform(Vector2.ZERO)
	ci.draw_string(sf, Vector2(x + tag_w + UI.r(0.5), roundf(mid + (sf.get_ascent(sfs) - sf.get_descent(sfs)) / 2.0)), note, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)


## "+25 XP", the level chip and the level bar filling from where it was; a level up flashes.
func _paint_xp(ci: CanvasItem, cx: float, y: float) -> void:
	var p := float(UI.px)
	var fs := roundi(UI.r(0.9375))
	var f := UI.font("700")
	var txt := "+%d XP" % int(_xp["gained"])
	var tw := UI.text_w(f, txt, fs)
	var bar_w := UI.r(9)
	var chip_w := UI.text_w(UI.font("700"), "LV", roundi(UI.r(0.5625))) + UI.c(2) + UI.text_w(UI.font("p700"), str(int(_xp["to"]["level"])), roundi(UI.r(0.75))) + UI.r(0.35) * 2 + p * 2
	var gap := UI.r(0.5)
	var total := tw + gap + chip_w + gap + bar_w
	var x := roundf(cx - total / 2.0)
	var mid := y + UI.r(1.1) / 2.0
	UI.draw_text(ci, f, Vector2(x, roundf(mid + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0)), txt, fs, Color("#8fd8ff"))
	x += tw + gap
	var chip_h := roundi(UI.r(0.75)) + UI.c(3) + p * 2
	UI.level_chip(ci, Vector2(x, roundf(mid - chip_h / 2.0)), int(_xp["to"]["level"]))
	x += chip_w + gap
	var ups := _ups()
	var from = _xp["from"]
	var to = _xp["to"]
	var start := 0.0 if ups > 0 else float(from["into"]) / float(from["need"])
	var end := float(to["into"]) / float(to["need"])
	var k := clampf((_age - 0.45) / 0.9, 0.0, 1.0)
	var e := 1.0 - pow(1.0 - k, 3.0)
	var br := UI.rround(Rect2(x, mid - UI.r(0.35), bar_w, UI.r(0.7)))
	if ups > 0: ci.draw_rect(br.grow(p), UI.GOLD)
	ci.draw_rect(br, UI.INK)
	var inner := br.grow(-p)
	var fw := roundf(inner.size.x * lerpf(start, end, e))
	if fw > 0:
		var fr := Rect2(inner.position, Vector2(fw, inner.size.y))
		ci.draw_rect(fr, Color("#4fb8f5"))
		ci.draw_rect(Rect2(fr.position, Vector2(fw, p)), Color("#b8f0ff"))
		ci.draw_rect(Rect2(fr.position.x, fr.end.y - p, fw, p), Color("#2a6ab0"))
	if ups > 0 and _age > 0.6:
		# Blinks in (three steps), then stays.
		if _age > 1.5 or int((_age - 0.6) / 0.15) % 2 == 0:
			var lfs := roundi(UI.r(0.8125))
			var lt := "Level up! +%d stat points" % (ups * CharacterProgress.POINTS_PER_LEVEL)
			var lw := UI.text_w(f, lt, lfs)
			UI.draw_text(ci, f, Vector2(roundf(cx - lw / 2.0), roundf(y + UI.r(1.1) + UI.c(5) + f.get_ascent(lfs))), lt, lfs, UI.GOLD_HI)


## Both fighters' totals: names over the rows; each row's numbers either side of
## a label and a bar split in two, filled towards the middle. The better number is gold.
func _paint_stats(ci: CanvasItem, s: Vector2) -> void:
	var f: Array = _b.fighters
	var x0 := UI.r(0.9)
	var x1 := s.x - UI.r(0.9)
	var w := x1 - x0
	var y := roundf((s.y - (_stats_h() - UI.r(0.5) - UI.r(0.6))) / 2.0)
	var nfs := roundi(UI.r(1.0))
	var nf := UI.font("700")
	var vs_fs := roundi(UI.r(0.75))
	var vs_w := UI.text_w(nf, "VS", vs_fs)
	var name_w := (w - vs_w - UI.c(8) * 2) / 2.0
	var a := HomeMenu.NamePlate._fit(nf, str(f[0]["name"]), nfs, name_w)
	var b := HomeMenu.NamePlate._fit(nf, str(f[1]["name"]), nfs, name_w)
	var base := y + nf.get_ascent(nfs)
	ci.draw_string(nf, Vector2(x0, base), a, HORIZONTAL_ALIGNMENT_LEFT, -1, nfs, Color("#8ab8ff"))
	ci.draw_string(nf, Vector2(x1 - UI.text_w(nf, b, nfs), base), b, HORIZONTAL_ALIGNMENT_LEFT, -1, nfs, Color("#ff9a9a"))
	ci.draw_string(nf, Vector2(roundf(x0 + (w - vs_w) / 2.0), roundf(y + (nfs + vs_fs) / 2.0 - nf.get_descent(vs_fs))), "VS", HORIZONTAL_ALIGNMENT_LEFT, -1, vs_fs, UI.DIM)
	y += nfs + UI.c(6)
	var vfs := roundi(UI.r(0.875))
	var lfs := roundi(UI.r(0.625))
	var lf := UI.spaced("500", lfs, 0.1)
	var col_w := UI.r(3.2)
	var mx0 := x0 + col_w + UI.c(8)
	var mx1 := x1 - col_w - UI.c(8)
	var rh := _row_h()
	for row in _rows:
		var va: float = row[1]
		var vb: float = row[2]
		var ta := str(roundi(va))
		var tb := str(roundi(vb))
		var mid := y + rh / 2.0
		var vb_base := roundf(mid + (nf.get_ascent(vfs) - nf.get_descent(vfs)) / 2.0)
		ci.draw_string(nf, Vector2(x0, vb_base), ta, HORIZONTAL_ALIGNMENT_LEFT, -1, vfs, UI.GOLD if va > vb else UI.TEXT)
		ci.draw_string(nf, Vector2(x1 - UI.text_w(nf, tb, vfs), vb_base), tb, HORIZONTAL_ALIGNMENT_LEFT, -1, vfs, UI.GOLD if vb > va else UI.TEXT)
		var label := (row[0] as String).to_upper()
		var lw := UI.text_w(lf, label, lfs)
		var block := lfs * 1.2 + UI.c(2) + UI.c(6)
		var top := roundf(mid - block / 2.0)
		ci.draw_string(lf, Vector2(roundf(mx0 + (mx1 - mx0 - lw) / 2.0), top + lf.get_ascent(lfs)), label, HORIZONTAL_ALIGNMENT_LEFT, -1, lfs, UI.MUTED)
		var by := top + roundf(lfs * 1.2) + UI.c(2)
		var bh := UI.c(6)
		var half := roundf((mx1 - mx0 - UI.c(2)) / 2.0)
		var m := maxf(1.0, maxf(va, vb))
		var ra := Rect2(mx0, by, half, bh)
		var rb := Rect2(mx0 + half + UI.c(2), by, mx1 - mx0 - half - UI.c(2), bh)
		ci.draw_rect(ra, Color("#241b3a"))
		ci.draw_rect(rb, Color("#241b3a"))
		var wa := roundf(half * va / m)
		var wb := roundf(rb.size.x * vb / m)
		ci.draw_rect(Rect2(ra.end.x - wa, by, wa, bh), UI.BLUE)
		ci.draw_rect(Rect2(rb.position.x, by, wb, bh), UI.RED)
		y += rh + UI.c(2)
