class_name BattleHud
extends Control
## The battle HUD (the web's ui/hud.ts) drawn straight onto the screen in
## device pixels: each side's name, framed health bar with the numbers
## inside, the four-cell energy bar and the AI's plan; the clock; big
## centred banners; the super cinematic's letterbox bars. One _draw a frame,
## no nodes per element.

const INK := Color("#0a0612")
const TEXT := Color("#f6efe0")
const MUTED := Color("#a99cc6")
const GOLD := Color("#f2b542")
const RED := Color("#ef5a62")
const BLUE := Color("#4f94f5")
const PANEL := Color("#1d1630")

const STATUS := {
	"burn": ["BURN", "#ff8a3a"], "poison": ["PSN", "#7ad84a"], "chill": ["CHILL", "#9ad8ff"], "frozen": ["ICE", "#d8f4ff"],
	"stun": ["STUN", "#ffe070"], "rage": ["RAGE", "#ff5a4a"], "haste": ["HASTE", "#7af0c8"], "mark": ["MARK", "#d07aff"],
	"ironskin": ["IRON", "#c8d0e0"], "vulnerable": ["VULN", "#ff9ab0"], "silence": ["MUTE", "#b8a0ff"], "root": ["ROOT", "#c8a060"],
	"hidden": ["SMOKE", "#b8b8c8"], "fear": ["FEAR", "#e070a0"], "regen": ["REGEN", "#7ae07a"], "momentum": ["MOMENTUM", "#ffc040"],
	"bleed": ["BLEED", "#ff4a5a"],
}

static var _text_font: FontFile
static var _bold_font: FontFile
static var _pixel_font: FontFile

var _battle
## Per side: trailing ghost of the health bar, the last health (for the jolt), jolt time left.
var _ghost := [1.0, 1.0]
var _last_hp := [-1.0, -1.0]
var _jolt := [0.0, 0.0]
var _full_t := [0.0, 0.0]
var _banner := ""
var _banner_sub := ""
var _banner_t := 0.0
var _banner_age := 0.0
var _bars := 0.0
var _time := 0.0
var _plans := ["", ""]
## Seconds spent waiting for the arena (-1: not waiting).
var _loading := -1.0


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _text_font == null:
		_text_font = load("res://assets/fonts/rubik-600.woff2")
		_bold_font = load("res://assets/fonts/rubik-700.woff2")
		_pixel_font = load("res://assets/fonts/pixelify-700.woff2")


## Waiting for the arena to paint: a dark screen and a line after a moment (a quick load shows nothing).
func loading(t: float) -> void:
	_loading = t
	queue_redraw()


func setup(b, arena_name: String) -> void:
	_loading = -1.0
	_battle = b
	_ghost = [1.0, 1.0]
	_last_hp = [-1.0, -1.0]
	_jolt = [0.0, 0.0]
	_full_t = [0.0, 0.0]
	var f = b.fighters
	banner("%s  VS  %s" % [f[0]["name"], f[1]["name"]], arena_name, 0)


## Big centred text; `seconds` 0 keeps it until replaced.
func banner(text: String, sub := "", seconds := 1.2) -> void:
	_banner = text
	_banner_sub = sub
	_banner_t = seconds
	_banner_age = 0.0


func on_event(_e) -> void:
	pass


func update_from(view, b, dt: float) -> void:
	_battle = b
	_time += dt
	_bars = view.get_bars()
	_plans = b.plans if "plans" in b else ["", ""]
	for i in 2:
		var f: Dictionary = b.fighters[i]
		var hp := maxf(0.0, f["hp"]) / float(f["stats"]["maxHp"])
		if _last_hp[i] >= 0.0 and _last_hp[i] - hp >= 0.04: _jolt[i] = 0.16
		_last_hp[i] = hp
		if _ghost[i] > hp: _ghost[i] = maxf(hp, _ghost[i] - dt * (0.9 if _ghost[i] - hp > 0.2 else 0.45))
		else: _ghost[i] = hp
		_jolt[i] = maxf(0.0, _jolt[i] - dt)
		var full: bool = f["energy"] >= SimConstants.MAX_ENERGY
		_full_t[i] = _full_t[i] + dt if full else 0.0
	if _banner_t > 0.0:
		_banner_t -= dt
		if _banner_t <= 0.0: _banner = ""
	_banner_age += dt
	queue_redraw()


## UI pixel: ~1 CSS pixel of the web game on a phone held sideways.
func _u() -> float:
	return clampf(minf(size.y / 360.0, size.x / 640.0), 1.0, 4.0)


func _draw() -> void:
	var u := _u()
	if _loading >= 0.0:
		draw_rect(Rect2(Vector2.ZERO, size), INK)
		if _loading > 0.25:
			var txt := "Painting the arena" + ".".repeat(int(_loading * 3.0) % 4)
			var fs := int(16 * u)
			var w := _bold_font.get_string_size("Painting the arena...", HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			draw_string(_bold_font, Vector2(size.x / 2 - w / 2, size.y / 2 + fs * 0.35), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, MUTED)
		return
	if _battle == null: return
	_draw_bars(u)
	var pad := 10.0 * u
	var clock_w := 58.0 * u
	var side_w := (size.x - clock_w - pad * 4) / 2.0
	for i in 2: _draw_side(i, u, pad, side_w)
	_draw_clock(u, pad)
	if _banner != "": _draw_banner(u)


func _draw_bars(u: float) -> void:
	if _bars <= 0.01: return
	var h := roundf(size.y * 0.11 * _bars)
	draw_rect(Rect2(0, 0, size.x, h), Color(0, 0, 0, 0.92))
	draw_rect(Rect2(0, size.y - h, size.x, h), Color(0, 0, 0, 0.92))


func _draw_side(i: int, u: float, pad: float, side_w: float) -> void:
	var f: Dictionary = _battle.fighters[i]
	var right := i == 1
	var top := 8.0 * u
	var bar_w := minf(352.0 * u, side_w)
	var x0 := pad if not right else size.x - pad - bar_w
	var jx := 0.0
	if _jolt[i] > 0.0: jx = (3.0 if right else -3.0) * u * sin(_jolt[i] / 0.16 * PI)
	# Name, with the side's colour chip, and the body form.
	var name_size := int(17.0 * u)
	var chip := 8.0 * u
	var name_y := top + name_size * 0.85
	var nm: String = f["name"]
	var form: String = SimForms.FORMS.get(f["form"], {}).get("name", "").to_upper()
	var col := BLUE if not right else RED
	var nw := _bold_font.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, name_size).x
	var fw := _text_font.get_string_size(form, HORIZONTAL_ALIGNMENT_LEFT, -1, int(11 * u)).x
	var cx := x0 if not right else x0 + bar_w - chip
	draw_rect(Rect2(cx - 2 * u, name_y - name_size * 0.62 - 2 * u, chip + 4 * u, chip + 4 * u), INK)
	draw_rect(Rect2(cx, name_y - name_size * 0.62, chip, chip), col)
	var tx := cx + chip + 8 * u if not right else cx - 8 * u - nw
	_outlined(_bold_font, Vector2(tx, name_y), nm, name_size, TEXT, 2.0 * u)
	var fx := tx + nw + 8 * u if not right else tx - 8 * u - fw
	_outlined(_text_font, Vector2(fx, name_y), form, int(11 * u), Color(TEXT, 0.75), 1.0 * u)
	# Health bar: ink frame, two-tone surround, dark track, fill, ghost, shield, ticks, gloss.
	var by := top + name_size + 6 * u
	var bh := 28.0 * u
	var r := Rect2(x0 + jx, by, bar_w, bh)
	draw_rect(Rect2(r.position + Vector2(0, 3 * u), r.size), Color(0.03, 0.02, 0.04, 0.55))
	draw_rect(r, INK)
	var inner := r.grow(-2 * u)
	draw_rect(Rect2(inner.position, Vector2(inner.size.x, inner.size.y * 0.5)), Color("#8a76c0"))
	draw_rect(Rect2(inner.position + Vector2(0, inner.size.y * 0.5), Vector2(inner.size.x, inner.size.y * 0.5)), Color("#3a2e5c"))
	var tr := inner.grow(-2 * u)
	draw_rect(tr, INK)
	tr = tr.grow(-1 * u)
	_bands(tr, [[0.3, Color("#12070d")], [1.0, Color("#24101a")]])
	var hp := maxf(0.0, f["hp"]) / float(f["stats"]["maxHp"])
	var ghost: float = _ghost[i]
	_fill(tr, ghost, right, [[1.0, Color("#fff6ea")]])
	var greens := [[0.18, Color("#a2f7a8")], [0.66, Color("#46c95e")], [1.0, Color("#2a9a48")]]
	if hp <= 0.25: greens = [[0.18, Color("#ffb0a0")], [0.66, Color("#ec4650")], [1.0, Color("#b02a3a")]]
	elif hp <= 0.5: greens = [[0.18, Color("#ffeaa0")], [0.66, Color("#f4bc34")], [1.0, Color("#c98a1e")]]
	var fr := _fill(tr, hp, right, greens)
	if fr.size.x > 2 * u:
		var edge_x := fr.end.x - 2 * u if not right else fr.position.x
		draw_rect(Rect2(edge_x, fr.position.y, 2 * u, fr.size.y), Color(1, 1, 1, 0.6))
	var sh := minf(1.0, float(f.get("shield", 0.0)) / float(f["stats"]["maxHp"]))
	if sh > 0.0:
		var sw := tr.size.x * sh
		var srect := Rect2(tr.position.x if not right else tr.end.x - sw, tr.position.y, sw, tr.size.y)
		draw_rect(srect, Color(1.0, 0.886, 0.51, 0.9))
		var k := 0.0
		while k < sw:
			draw_rect(Rect2(srect.position.x + k, srect.position.y, minf(3 * u, sw - k), srect.size.y), Color(1.0, 0.965, 0.784, 0.9))
			k += 6 * u
	for t in range(1, 10):
		draw_rect(Rect2(tr.position.x + tr.size.x * t / 10.0 - 1 * u, tr.position.y, 1 * u, tr.size.y), Color(0.04, 0.024, 0.07, 0.32))
	draw_rect(Rect2(tr.position, Vector2(tr.size.x, tr.size.y * 0.34)), Color(1, 1, 1, 0.16))
	draw_rect(Rect2(tr.position + Vector2(0, tr.size.y * 0.78), Vector2(tr.size.x, tr.size.y * 0.22)), Color(0.04, 0.024, 0.07, 0.22))
	if hp <= 0.25 and hp > 0.0:
		var a := 0.5 + 0.5 * sin(_time * TAU / 1.8)
		draw_rect(r.grow(2 * u), Color(RED, a), false, 2 * u)
	# Health numbers inside the bar.
	var now := "0" if (not f["alive"] or f["hp"] <= 0) else str(maxi(1, roundi(f["hp"])))
	var mx := "/ %d" % roundi(f["stats"]["maxHp"])
	var ts := int(13 * u)
	var ss := int(10 * u)
	var w1 := _bold_font.get_string_size(now, HORIZONTAL_ALIGNMENT_LEFT, -1, ts).x
	var w2 := _text_font.get_string_size(mx, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
	var ty := r.position.y + r.size.y * 0.5 + ts * 0.36
	var hx := r.position.x + 7 * u if not right else r.end.x - 7 * u - w1 - 3 * u - w2
	_outlined(_bold_font, Vector2(hx, ty), now, ts, Color.WHITE, 1.0 * u)
	_outlined(_text_font, Vector2(hx + w1 + 3 * u, ty), mx, ss, Color("#e6dcf6"), 1.0 * u)
	# Energy: a slanted ink bar of four cells.
	var ey := r.end.y - 1 * u
	var eh := 14.0 * u
	var ew := minf(240.0 * u, bar_w * 0.68)
	var ex := r.position.x if not right else r.end.x - ew
	_slant(ex, ey, ew, eh, right, INK)
	var tx0 := ex + (2 * u if not right else 3 * u)
	var tw := ew - 5 * u
	var th := eh - 4 * u
	var ty0 := ey + 2 * u
	_slant(tx0, ty0, tw, th, right, Color("#0a0820"), Color("#171236"), 0.4, eh - 4 * u)
	var en := minf(1.0, f["energy"] / float(SimConstants.MAX_ENERGY))
	if en > 0.0:
		var full := en >= 1.0
		var c1 := Color("#fff6c0") if full else Color("#d4f2ff")
		var c2 := Color("#ffcc44") if full else Color("#58b4ff")
		var c3 := Color("#e0921c") if full else Color("#3474e0")
		_slant_fill(tx0, ty0, tw, th, right, en, [[0.22, c1], [0.62, c2], [1.0, c3]], eh - 4 * u)
		if full:
			# A glint sweeping across the full bar.
			var g := fmod(_full_t[i], 1.8) / 1.8
			var gx := tx0 + (tw + tw * 0.3) * g - tw * 0.3
			draw_rect(Rect2(gx, ty0, tw * 0.12, th), Color(1, 1, 1, 0.45 * sin(g * PI)))
	for c in range(1, 4):
		var cx2 := tx0 + tw * c / 4.0 if not right else tx0 + tw - tw * c / 4.0
		draw_rect(Rect2(cx2 - 1 * u, ty0, 2 * u, th), INK)
	# The plan, then statuses.
	var py := ey + eh + 14 * u
	var plan: String = str(_plans[i]).to_upper() if _plans.size() > i else ""
	var px := r.position.x + 9 * u if not right else r.end.x - 9 * u
	if plan != "":
		var pw := _bold_font.get_string_size(plan, HORIZONTAL_ALIGNMENT_LEFT, -1, int(11 * u)).x
		var dx := px - 5 * u if not right else px + 1 * u
		_diamond(Vector2(dx, py - 4 * u), 3.5 * u)
		_outlined(_bold_font, Vector2(px + 2 * u if not right else px - 4 * u - pw, py), plan, int(11 * u), GOLD, 1.0 * u)
	var sx := r.position.x if not right else r.end.x
	var sy := py + 6 * u
	for st in f["statuses"]:
		var info = STATUS.get(st["id"])
		if info == null: continue
		var label: String = info[0] + (str(st["stacks"]) if st.get("stacks", 1) > 1 else "")
		var lw := _bold_font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, int(9 * u)).x + 8 * u
		var rx := sx if not right else sx - lw
		draw_rect(Rect2(rx, sy, lw, 13 * u), INK)
		draw_rect(Rect2(rx + 1 * u, sy + 1 * u, lw - 2 * u, 11 * u), Color(info[1]))
		draw_string(_bold_font, Vector2(rx + 4 * u, sy + 10 * u), label, HORIZONTAL_ALIGNMENT_LEFT, -1, int(9 * u), INK)
		sx = sx + lw + 3 * u if not right else sx - lw - 3 * u


func _draw_clock(u: float, _pad: float) -> void:
	var b = _battle
	var ot: bool = b.time >= SimConstants.ROUND_TIME
	var left := maxi(0, ceili((SimConstants.MATCH_TIME if ot else SimConstants.ROUND_TIME) - b.time))
	var txt := str(left)
	var fs := int(28 * u)
	var w := maxf(58.0 * u, _pixel_font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 16 * u)
	var h := fs + 14 * u + (fs * 0.5 if ot else 0.0)
	var r := Rect2(size.x / 2 - w / 2, 8 * u, w, h)
	_plate(r, u)
	var col := TEXT
	if ot: col = Color("#ff7ad0") if left <= 10 else Color("#c8b0ff")
	elif left <= 10: col = RED
	var y := r.position.y + 6 * u + fs * 0.82
	if ot:
		var o := "OT"
		var os := int(fs * 0.5)
		var ow := _pixel_font.get_string_size(o, HORIZONTAL_ALIGNMENT_LEFT, -1, os).x
		draw_string(_pixel_font, Vector2(size.x / 2 - ow / 2, r.position.y + 4 * u + os * 0.85), o, HORIZONTAL_ALIGNMENT_LEFT, -1, os, Color("#a888f0"))
		y += fs * 0.5
	var tw := _pixel_font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	_outlined(_pixel_font, Vector2(size.x / 2 - tw / 2, y), txt, fs, col, 0.0)


func _draw_banner(u: float) -> void:
	var fs := int(64 * u)
	var big := _banner.length() > 6
	if big: fs = int(40 * u)
	# Pops in: a quick overshoot on the first beat.
	var k := clampf(_banner_age / 0.18, 0.0, 1.0)
	var pop := 1.0 + 0.25 * (1.0 - k) * (1.0 - k)
	fs = int(fs * pop)
	var w := _pixel_font.get_string_size(_banner, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var c := Vector2(size.x / 2, size.y * 0.4)
	_outlined(_pixel_font, Vector2(c.x - w / 2, c.y + fs * 0.35), _banner, fs, GOLD, 4.0 * u)
	if _banner_sub != "":
		var ss := int(21.6 * u)
		var sw := _bold_font.get_string_size(_banner_sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
		_outlined(_bold_font, Vector2(c.x - sw / 2, c.y + fs * 0.35 + 10 * u + ss), _banner_sub, ss, TEXT, 2.0 * u)


# --- Drawing helpers ---------------------------------------------------------------

func _outlined(font: Font, pos: Vector2, text: String, fs: int, col: Color, o: float) -> void:
	if o > 0.0:
		var oi := maxi(1, roundi(o))
		for d in [Vector2(oi, 0), Vector2(-oi, 0), Vector2(0, oi), Vector2(0, -oi), Vector2(oi, oi), Vector2(-oi, oi)]:
			draw_string(font, pos + d, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, INK)
	else:
		draw_string(font, pos + Vector2(0, roundf(fs / 16.0)), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, INK)
	draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)


## Horizontal bands top to bottom: [[until (0..1), colour], ...].
func _bands(r: Rect2, bands: Array) -> void:
	var y0 := 0.0
	for b in bands:
		var y1: float = b[0]
		draw_rect(Rect2(r.position.x, r.position.y + r.size.y * y0, r.size.x, r.size.y * (y1 - y0)), b[1])
		y0 = y1


## A fill showing `v` of the track, growing from the outer edge; returns its rect.
func _fill(tr: Rect2, v: float, right: bool, bands: Array) -> Rect2:
	var w := tr.size.x * clampf(v, 0.0, 1.0)
	if w <= 0.0: return Rect2()
	var r := Rect2(tr.position.x if not right else tr.end.x - w, tr.position.y, w, tr.size.y)
	_bands(r, bands)
	return r


## A bar with its inner end cut on a slant (mirrored for the right side).
func _slant(x: float, y: float, w: float, h: float, right: bool, c: Color, c2 := Color(0, 0, 0, 0), split := 0.0, cut := -1.0) -> void:
	if cut < 0.0: cut = h
	var pts := _slant_pts(x, y, w, h, right, cut)
	draw_colored_polygon(pts, c)
	if c2.a > 0.0:
		var pts2 := _slant_pts(x, y + h * split, w - cut * split, h * (1.0 - split), right, cut * (1.0 - split))
		draw_colored_polygon(pts2, c2)


func _slant_pts(x: float, y: float, w: float, h: float, right: bool, cut: float) -> PackedVector2Array:
	if not right: return PackedVector2Array([Vector2(x, y), Vector2(x + w, y), Vector2(x + w - cut, y + h), Vector2(x, y + h)])
	return PackedVector2Array([Vector2(x, y), Vector2(x + w, y), Vector2(x + w, y + h), Vector2(x + cut, y + h)])


func _slant_fill(x: float, y: float, w: float, h: float, right: bool, v: float, bands: Array, cut: float) -> void:
	var fw := w * v
	var y0 := 0.0
	for b in bands:
		var y1: float = b[0]
		var top := y + h * y0
		var bh := h * (y1 - y0)
		# The slant on the inner end: rows lower down end further in.
		var c0 := cut * y0
		var c1 := cut * y1
		var pts: PackedVector2Array
		if not right:
			var e := minf(fw, w - c0)
			var e2 := minf(fw, w - c1)
			pts = PackedVector2Array([Vector2(x, top), Vector2(x + e, top), Vector2(x + e2, top + bh), Vector2(x, top + bh)])
		else:
			var s := maxf(x + w - fw, x + c0)
			var s2 := maxf(x + w - fw, x + c1)
			pts = PackedVector2Array([Vector2(s, top), Vector2(x + w, top), Vector2(x + w, top + bh), Vector2(s2, top + bh)])
		draw_colored_polygon(pts, b[1])
		y0 = y1


func _diamond(c: Vector2, r: float) -> void:
	draw_colored_polygon(PackedVector2Array([c + Vector2(0, -r - 1), c + Vector2(r + 1, 0), c + Vector2(0, r + 1), c + Vector2(-r - 1, 0)]), INK)
	draw_colored_polygon(PackedVector2Array([c + Vector2(0, -r), c + Vector2(r, 0), c + Vector2(0, r), c + Vector2(-r, 0)]), GOLD)


## The game's plate: panel face, ink border, light top edge, dark bottom, violet inner ring.
func _plate(r: Rect2, u: float) -> void:
	var p := 3.0 * u
	draw_rect(r, INK)
	var f := r.grow(-p)
	draw_rect(f, PANEL)
	draw_rect(Rect2(f.position, Vector2(f.size.x, p)), Color(1, 1, 1, 0.08))
	draw_rect(Rect2(f.position + Vector2(0, f.size.y - p * 2), Vector2(f.size.x, p * 2)), Color(0, 0, 0, 0.35))
	draw_rect(f, Color(0.36, 0.29, 0.55, 0.35), false, p * 2)
