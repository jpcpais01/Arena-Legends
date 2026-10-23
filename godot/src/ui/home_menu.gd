class_name HomeMenu
extends Control
## The home screen over the background duel (the web's ui/menu.ts), kept out
## of the fight's way: a nameplate in each top corner (portrait, name, species
## and form, the gear two to a row; a dice beside the rival's draws a new one),
## the logo between them, and along the bottom a rampart: the Fight crest in
## the middle rising over the wall, Hero and Armory on its left, Online and
## World on its right, the Shop at the right end and the small tools at the
## left end over the version line.

signal fight
signal hero
signal armory
signal online
signal world
signal shop
signal new_rival
signal sound
signal settings
signal notes

var _you: NamePlate
var _rival: NamePlate
var _logo: UI.Paint
var _dock: Control
var _wall: UI.Paint
var _tools: HBoxContainer
var _sound_btn: PxButton
var _version: VersionLine
var _hero_tile: DockTile
var _fight: FightCrest
var _shop: ShopStall
var _wings: Array[Control] = []
var _dice: PxButton
var _enter_t := -1.0


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_you = NamePlate.new(0)
	_rival = NamePlate.new(1)
	add_child(_you)
	add_child(_rival)
	_logo = UI.Paint.new(func(ci: CanvasItem, s: Vector2):
		var t := UI.logo()
		var k := UI.fit_scale(Vector2(t.get_size()), s)
		var w := t.get_size() * k
		ci.draw_texture_rect(t, Rect2(Vector2(roundf((s.x - w.x) / 2.0), 0), w), false))
	add_child(_logo)
	_dice = PxButton.new("", "dice", "", "sm")
	_dice.pressed.connect(func(): new_rival.emit())
	add_child(_dice)
	_wall = UI.Paint.new(_paint_wall)
	add_child(_wall)
	_tools = HBoxContainer.new()
	_tools.add_theme_constant_override("separation", int(UI.c(4)))
	add_child(_tools)
	_sound_btn = PxButton.new("", "soundOn", "", "sm")
	_sound_btn.pressed.connect(func(): sound.emit())
	var set_btn := PxButton.new("", "settings", "", "sm")
	set_btn.pressed.connect(func(): settings.emit())
	_tools.add_child(_sound_btn)
	_tools.add_child(set_btn)
	_version = VersionLine.new()
	_version.notes.connect(func(): notes.emit())
	add_child(_version)
	_hero_tile = DockTile.new("Hero", "crown", ["#2d5aa8", "#5b8ae2", "#16305e", "#d8e8ff"])
	_hero_tile.pressed.connect(func(): hero.emit())
	var armory_tile := DockTile.new("Armory", "shield", ["#4b4f6e", "#8086a8", "#24263a", "#e8ecf8"])
	armory_tile.pressed.connect(func(): armory.emit())
	var online_tile := DockTile.new("Online", "globe", ["#1e7078", "#46b2b0", "#0c3a40", "#c8fff6"])
	online_tile.pressed.connect(func(): online.emit())
	var world_tile := DockTile.new("World", "map", ["#7a5a26", "#b88e48", "#3e2a0e", "#ffeab0"])
	world_tile.pressed.connect(func(): world.emit())
	_wings = [_hero_tile, armory_tile, online_tile, world_tile]
	for t in _wings: add_child(t)
	_fight = FightCrest.new()
	_fight.pressed.connect(func(): fight.emit())
	add_child(_fight)
	_shop = ShopStall.new()
	_shop.pressed.connect(func(): shop.emit())
	add_child(_shop)
	resized.connect(_layout)


func _ready() -> void:
	_layout()


## The fighters on the plates, the record and the rival's name on the crest.
func set_heroes(player, rival, rec: Dictionary) -> void:
	_you.set_hero(player, "You", "%dW %dL" % [int(rec.get("w", 0)), int(rec.get("l", 0))])
	_rival.set_hero(rival, "Rival", "")
	_fight.vs = "vs " + str(rival["name"])
	_fight.queue_redraw()


func set_gems(n: int, can_open: bool) -> void:
	_shop.gems = n
	_shop.unseen = can_open
	_shop.update_minimum_size()
	_shop.queue_redraw()
	_layout()


func set_sound(on: bool) -> void:
	_sound_btn.set_glyph("soundOn" if on else "soundOff")


## A dot on the notes button while there's a version the player hasn't read about.
func set_notes_unseen(on: bool) -> void:
	_version.btn.set_unseen(on)


## A dot on Hero while there are stat points to spend.
func set_points(n: int) -> void:
	_hero_tile.unseen = n > 0
	_hero_tile.queue_redraw()


## Slides the plates down and the dock up (after the title, or back from a fight).
func enter() -> void:
	_enter_t = 0.0
	set_process(true)


func _process(dt: float) -> void:
	if _enter_t < 0.0:
		set_process(false)
		return
	_enter_t += dt
	var top_k := clampf(_enter_t / 0.38, 0.0, 1.0)
	var dock_k := clampf(_enter_t / 0.42, 0.0, 1.0)
	var e1 := 1.0 - pow(1.0 - top_k, 3.0)
	var e2 := _back_out(dock_k)
	for c in [_you, _rival, _logo, _dice]:
		c.modulate.a = top_k
		c.position.y = c.get_meta("y", c.position.y) - UI.r(1.5) * (1.0 - e1)
	var dock := [_wall, _tools, _version, _fight, _shop] + _wings
	for c in dock:
		c.modulate.a = dock_k
		c.position.y = c.get_meta("y", c.position.y) + UI.r(2.5) * (1.0 - e2)
	if top_k >= 1.0 and dock_k >= 1.0:
		_enter_t = -1.0
		_layout()


func _back_out(t: float) -> float:
	var c1 := 1.3
	var c3 := c1 + 1.0
	return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0)


func _place(c: Control, pos: Vector2, sz: Vector2) -> void:
	c.position = pos.round()
	c.size = sz.round()
	c.set_meta("y", c.position.y)


func _layout() -> void:
	var W := size.x
	var H := size.y
	if W < 2: return
	var sl := roundf(W * 0.03)
	var st := UI.c(10)
	var sb := UI.c(10)
	# Top: the plates in the corners, the logo between them.
	var ps := _you.get_combined_minimum_size()
	_place(_you, Vector2(sl, st), ps)
	_place(_rival, Vector2(W - sl - ps.x, st), ps)
	var lw := UI.r(10)
	var lh := UI.r(3.3)
	_place(_logo, Vector2((W - lw) / 2.0, st), Vector2(lw, lh))
	var ds := _dice.custom_minimum_size
	_place(_dice, Vector2(W - sl - ps.x - UI.c(6) - ds.x, st + ps.y - ds.y), ds)
	# The rampart along the bottom.
	var wall_h := UI.r(3.3) + sb + UI.r(0.25)
	_place(_wall, Vector2(0, H - wall_h - UI.px * 7), Vector2(W, wall_h + UI.px * 7))
	var base := H - sb - UI.r(0.25)
	var gap := UI.r(0.4)
	var tw := UI.r(3.8)
	var th := UI.r(3.1)
	var fw := UI.r(11.5)
	var fh := UI.r(4.1)
	var cx := W / 2.0
	_place(_fight, Vector2(cx - fw / 2.0, base - fh - UI.r(0.15)), Vector2(fw, fh))
	var tile_gap := UI.c(6)
	_place(_wings[1], Vector2(cx - fw / 2.0 - gap - tw, base - th), Vector2(tw, th))
	_place(_wings[0], Vector2(cx - fw / 2.0 - gap - tw * 2 - tile_gap, base - th), Vector2(tw, th))
	_place(_wings[2], Vector2(cx + fw / 2.0 + gap, base - th), Vector2(tw, th))
	_place(_wings[3], Vector2(cx + fw / 2.0 + gap + tw + tile_gap, base - th), Vector2(tw, th))
	var ss := _shop.get_combined_minimum_size()
	_place(_shop, Vector2(W - sl - ss.x, base - ss.y), ss)
	# Tools over the version line, bottom left.
	var vs := _version.get_combined_minimum_size()
	_place(_version, Vector2(sl, base - vs.y), vs)
	var tsz := _tools.get_combined_minimum_size()
	_place(_tools, Vector2(sl, base - vs.y - UI.c(4) - tsz.y), tsz)


## The wall: stone courses, a gold trim, battlements on top. Decoration only.
func _paint_wall(ci: CanvasItem, s: Vector2) -> void:
	var p := float(UI.px)
	var rid := ci.get_canvas_item()
	var top := p * 7
	var r := Rect2(0, top, s.x, s.y - top)
	UI.vgrad(rid, r, [[0.0, Color("#3a2c5e")], [0.45, Color("#241a3e")], [1.0, Color("#140e22")]])
	# Mortar: vertical joints every 16 px, courses every 8.
	var x := p * 15
	while x < s.x:
		ci.draw_rect(Rect2(x, r.position.y, p, r.size.y), Color(0, 0, 0, 0.28))
		x += p * 16
	var y := r.position.y + p * 7
	while y < s.y:
		ci.draw_rect(Rect2(0, y, s.x, p), Color(0, 0, 0, 0.32))
		y += p * 8
	# Gold trim with an ink line over it.
	ci.draw_rect(Rect2(0, top, s.x, p * 2), UI.GOLD_LO)
	ci.draw_rect(Rect2(0, top + p, s.x, p), UI.GOLD)
	ci.draw_rect(Rect2(0, top - p, s.x, p), UI.INK)
	# Battlements: 10 on, 6 off.
	x = 0.0
	while x < s.x:
		ci.draw_rect(Rect2(x, top - p * 7, p * 10, p * 5), Color("#3a2c5e"))
		ci.draw_rect(Rect2(x, top - p * 7, p * 10, p), Color("#5a4a8a"))
		x += p * 16


# --- Pieces --------------------------------------------------------------------------------

## A fighter's nameplate: the portrait on their backdrop over tag, name, species and form,
## beside their gear two to a row. Side 0 is the blue corner (left), 1 the red (mirrored).
class NamePlate extends Control:
	var side := 0
	var hero
	var tag := ""
	var extra := ""
	var preview: FighterPreview
	var _chip: UI.Paint
	var _icons: Array = []

	func _init(s: int) -> void:
		side = s
		mouse_filter = Control.MOUSE_FILTER_PASS
		texture_repeat = CanvasItem.TEXTURE_REPEAT_DISABLED
		preview = FighterPreview.new(null, RenderBackdrops.BW, RenderBackdrops.BH, {"autoplay": true, "flip": s == 1, "ground": -18})
		add_child(preview)
		# The level chip sits over the portrait.
		_chip = UI.Paint.new(func(ci: CanvasItem, sz: Vector2):
			if hero == null: return
			UI.level_chip(ci, Vector2(UI.c(3), UI.c(3)) if side == 0 else Vector2(sz.x - UI.c(3), UI.c(3)), int(hero.get("level", 1)), side == 1))
		add_child(_chip)

	func _art() -> Vector2:
		return Vector2(UI.r(6.4), UI.r(4.2))

	func _sock() -> float:
		return UI.r(1.95)

	func _get_minimum_size() -> Vector2:
		var a := _art()
		var g := UI.c(3)
		var gear_w := _sock() * 2 + g
		var gear_h := _sock() * 4 + g * 3 + UI.c(6) * 2
		var info_h := UI.r(0.625) * 1.0 + UI.r(0.95) + UI.r(0.75) * 1.1 + UI.c(3) * 2 + UI.c(4) + UI.c(6) + UI.px * 2
		return Vector2(a.x + UI.c(6) + gear_w + UI.c(6) + UI.px * 2, maxf(a.y + info_h, gear_h) + UI.px * 2)

	func set_hero(h, t: String, e: String) -> void:
		hero = h
		tag = t
		extra = e
		preview.set_build(h)
		_icons = []
		for slot in SimGear.GEAR_SLOTS:
			var id = h["gear"].get(slot)
			if id == null:
				_icons.append(null)
				continue
			var skin = CharacterSkins.skin_on(h.get("skins", {}), id)
			var sid = skin["id"] if skin != null else null
			_icons.append([id, sid])
		update_minimum_size()
		_place_preview()
		queue_redraw()

	func _notification(what: int) -> void:
		if what == NOTIFICATION_RESIZED: _place_preview()

	func _art_rect() -> Rect2:
		var p := float(UI.px)
		var a := _art()
		var x := p if side == 0 else size.x - p - a.x
		return Rect2(x, p, a.x, a.y)

	func _place_preview() -> void:
		var r := _art_rect()
		# The art box is the backdrop; the bust stands in it at a whole scale, anchored at the bottom.
		preview.position = r.position
		preview.size = r.size
		_chip.position = r.position
		_chip.size = r.size
		_chip.queue_redraw()

	func _draw() -> void:
		if hero == null: return
		var p := float(UI.px)
		var ci := get_canvas_item()
		var sc: Color = UI.BLUE if side == 0 else UI.RED
		var full := Rect2(Vector2.ZERO, size)
		draw_rect(full, UI.INK)
		var inner := full.grow(-p)
		var dark := Color(0.055, 0.04, 0.1, 0.86)
		var light := Color(0.055, 0.04, 0.1, 0.62)
		UI.hgrad(ci, inner, [[0.0, dark if side == 0 else light], [1.0, light if side == 0 else dark]])
		draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), sc)
		draw_rect(inner, Color(1, 1, 1, 0.05), false, p * 2)
		# The portrait box: the backdrop, covering it and anchored at the bottom, and an ink edge.
		var ar := _art_rect()
		var bt := UI.backdrop(hero["look"].get("backdrop", 0))
		var k := ceilf(maxf(ar.size.x / RenderBackdrops.BW, ar.size.y / RenderBackdrops.BH))
		var bw := Vector2(RenderBackdrops.BW, RenderBackdrops.BH) * k
		var src_w := ar.size.x / k
		var src_h := ar.size.y / k
		draw_texture_rect_region(bt, ar, Rect2((RenderBackdrops.BW - src_w) / 2.0, RenderBackdrops.BH - src_h, src_w, src_h))
		if side == 0: draw_rect(Rect2(ar.end.x, ar.position.y, p, ar.size.y + p), UI.INK)
		else: draw_rect(Rect2(ar.position.x - p, ar.position.y, p, ar.size.y + p), UI.INK)
		draw_rect(Rect2(ar.position.x, ar.end.y, ar.size.x, p), UI.INK)
		# Texts under the portrait.
		var x0 := ar.position.x + (UI.c(6) if side == 0 else UI.c(4))
		var x1 := ar.end.x - (UI.c(4) if side == 0 else UI.c(6))
		var y := ar.end.y + p + UI.c(4)
		var tag_fs := roundi(UI.r(0.625))
		var tf := UI.spaced("700", tag_fs, 0.12)
		var tw := UI.text_w(tf, tag.to_upper(), tag_fs)
		var chip := Rect2(0, y, tw + UI.r(0.35) * 2 + p * 2, tag_fs + UI.c(3) + p * 2)
		chip.position.x = x0 if side == 0 else x1 - chip.size.x
		draw_rect(chip, UI.INK)
		draw_rect(chip.grow(-p), sc)
		draw_rect(Rect2(chip.position.x + p, chip.end.y - p * 2, chip.size.x - p * 2, p), Color("#22488a") if side == 0 else Color("#8a2034"))
		var base := chip.position.y + p + UI.c(1) + tf.get_ascent(tag_fs)
		UI.draw_text(self, tf, Vector2(chip.position.x + p + UI.r(0.35), base), tag.to_upper(), tag_fs, Color.WHITE, "drop", Color("#22488a") if side == 0 else Color("#8a2034"))
		if extra != "":
			var ef := UI.spaced("700", tag_fs, 0.06)
			UI.draw_text(self, ef, Vector2(chip.end.x + UI.c(6), base), extra, tag_fs, UI.GOLD)
		y = chip.end.y + UI.c(3)
		var nfs := roundi(UI.r(0.95))
		var nf := UI.font("p700")
		var name_s := _fit(nf, str(hero["name"]), nfs, x1 - x0)
		var nw := UI.text_w(nf, name_s, nfs)
		UI.draw_text(self, nf, Vector2(x0 if side == 0 else x1 - nw, y + nf.get_ascent(nfs)), name_s, nfs, UI.TEXT, "name")
		y += nfs + UI.c(3)
		var sfs := roundi(UI.r(0.75))
		var sf := UI.font("500")
		var species = CharacterAppearance.SPECIES[hero["look"]["species"]]["name"]
		var sub := _fit(sf, "%s · %s" % [species, SimForms.FORMS[hero["form"]]["name"]], sfs, x1 - x0)
		var sw := UI.text_w(sf, sub, sfs)
		draw_string(sf, Vector2(x0 if side == 0 else x1 - sw, y + sf.get_ascent(sfs)), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)
		# Gear: main, secondary, special, usable down the first column; head, chest, legs, boots down the second.
		var s := _sock()
		var g := UI.c(3)
		var gw := s * 2 + g
		var gh := s * 4 + g * 3
		var gx := ar.end.x + UI.c(6) if side == 0 else ar.position.x - UI.c(6) - gw
		var gy := roundf((size.y - gh) / 2.0)
		for i in _icons.size():
			var col := 0 if i < 4 else 1
			var row := i % 4
			var r := UI.rround(Rect2(gx + col * (s + g), gy + row * (s + g), s, s))
			UI.sock(ci, r)
			var e = _icons[i]
			if e == null: continue
			var ic = GearIcons.get_icon(e[0], e[1], queue_redraw)
			if ic != null: GearIcons.draw(self, ic, r.grow(-p))

	static func _fit(f: Font, s: String, fs: int, w: float) -> String:
		if UI.text_w(f, s, fs) <= w: return s
		while s.length() > 1 and UI.text_w(f, s + "…", fs) > w: s = s.substr(0, s.length() - 1)
		return s.strip_edges() + "…"


## Pressable custom-drawn pieces: press feedback (down a pixel) and a tap signal.
class Tappable extends Control:
	signal pressed
	var down := false
	var unseen := false

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			if e.pressed:
				down = true
			elif down:
				down = false
				if Rect2(Vector2.ZERO, size).has_point(e.position):
					Sfx.sfx.play("ui")
					pressed.emit()
			queue_redraw()
			accept_event()

	func _dot(r: Rect2) -> void:
		if not unseen: return
		# Blinks like the web's (1.2 s, on 65% of the time).
		if fmod(Time.get_ticks_msec() / 1200.0, 1.0) > 0.65: return
		var p := float(UI.px)
		var d := Rect2(r.end.x - p * 5, r.position.y + p * 2, p * 3, p * 3)
		draw_rect(d.grow(p), UI.INK)
		draw_rect(d, UI.RED)


## Dock tiles: square shields of colour with a big glyph and a label.
class DockTile extends Tappable:
	var label := ""
	var glyph := ""
	var pal: Array

	func _init(l: String, g: String, colors: Array) -> void:
		super()
		label = l
		glyph = g
		pal = colors.map(func(c): return Color(c))

	func _process(_dt: float) -> void:
		if unseen: queue_redraw()

	func _draw() -> void:
		var p := float(UI.px)
		var r := Rect2(Vector2(0, p if down else 0.0), size)
		var ci := get_canvas_item()
		draw_rect(Rect2(r.position + Vector2(0, p * 2), r.size), Color(0, 0, 0, 0.45))
		draw_rect(r, UI.INK)
		var i := r.grow(-p)
		draw_rect(i, pal[0] if not down else (pal[0] as Color).darkened(0.05))
		draw_rect(Rect2(i.position.x, i.end.y - p * 3, i.size.x, p * 3), pal[2])
		draw_rect(Rect2(i.end.x - p, i.position.y, p, i.size.y), pal[2])
		draw_rect(Rect2(i.position, Vector2(i.size.x, p)), pal[1])
		draw_rect(Rect2(i.position, Vector2(p, i.size.y - p * 3)), pal[1])
		var fs := roundi(UI.r(0.625))
		var f := UI.spaced("700", fs, 0.08)
		var up := label.to_upper()
		var lw := UI.text_w(f, up, fs)
		var base := i.end.y - p * 3 - UI.c(2)
		UI.draw_text(self, f, Vector2(roundf(r.position.x + (r.size.x - lw) / 2.0), base), up, fs, UI.TEXT)
		var gs := UI.glyph_size(UI.r(1.45))
		var top := i.position.y + p
		var gy := roundf(top + (base - fs - top - gs) / 2.0)
		UI.draw_glyph(self, glyph, Vector2(roundf(r.position.x + (r.size.x - gs) / 2.0), gy), gs, pal[3], UI.INK)
		_dot(r)


## The Fight crest: a gold banner rising over the wall, with a light sweeping across it.
class FightCrest extends Tappable:
	var vs := ""
	var _t := 0.0

	func _process(dt: float) -> void:
		_t += dt
		queue_redraw()

	func _hex(r: Rect2, cut: float) -> PackedVector2Array:
		return PackedVector2Array([Vector2(r.position.x + cut, r.position.y), Vector2(r.end.x - cut, r.position.y), Vector2(r.end.x, r.position.y + r.size.y / 2.0),
			Vector2(r.end.x - cut, r.end.y), Vector2(r.position.x + cut, r.end.y), Vector2(r.position.x, r.position.y + r.size.y / 2.0)])

	func _draw() -> void:
		var p := float(UI.px)
		var cut := UI.r(0.95)
		var r := Rect2(Vector2(0, p if down else 0.0), size)
		draw_colored_polygon(_hex(Rect2(r.position + Vector2(0, p * 2), r.size), cut), Color(0, 0, 0, 0.5))
		draw_colored_polygon(_hex(r, cut), UI.INK)
		var inner := r.grow(-roundf(p * 1.5))
		var hexi := _hex(inner, cut - 1)
		# Gold: a light top band, the body gradient and a dark bottom band, clipped to the crest.
		var bands := [[0.0, Color("#ffd860")], [0.55, UI.GOLD], [1.0, Color("#d89a28")]]
		_fill_clipped(hexi, inner, bands)
		_band(hexi, Rect2(inner.position, Vector2(inner.size.x, p * 2)), UI.GOLD_HI)
		_band(hexi, Rect2(inner.position.x, inner.end.y - p * 4, inner.size.x, p * 4), UI.GOLD_LO)
		# Inner lines.
		var lx0 := r.position.x + cut + p * 2
		var lx1 := r.end.x - cut - p * 2
		draw_rect(Rect2(lx0, r.position.y + p * 4, lx1 - lx0, p), Color(1, 0.98, 0.86, 0.55))
		draw_rect(Rect2(lx0, r.end.y - p * 5, lx1 - lx0, p), Color(0.47, 0.27, 0.04, 0.45))
		# The shine: a soft band crossing now and then (steps, like the web).
		var cyc := fmod(_t, 3.6) / 3.6
		if cyc > 0.55:
			var k := floorf((cyc - 0.55) / 0.45 * 18.0) / 18.0
			var x := lerpf(-0.4, 1.3, k) * r.size.x
			var bw := r.size.x * 0.22
			var sk := r.size.y * 0.36
			for j in 3:
				var a: float = [0.15, 0.4, 0.15][j]
				var x0 := x + bw * j / 3.0
				var poly := PackedVector2Array([Vector2(x0 + sk, inner.position.y), Vector2(x0 + sk + bw / 3.0, inner.position.y), Vector2(x0 + bw / 3.0, inner.end.y), Vector2(x0, inner.end.y)])
				for cp in Geometry2D.intersect_polygons(poly, hexi): draw_colored_polygon(cp, Color(1, 1, 0.94, a))
		# Swords and FIGHT, the rival's name under them.
		var fs := roundi(UI.r(1.5))
		var f := UI.spaced("p700", fs, 0.12)
		var gs := UI.glyph_size(UI.r(1.35))
		var tw := UI.text_w(f, "FIGHT", fs)
		var gap := UI.r(0.5)
		var vfs := roundi(UI.r(0.6875))
		var vf := UI.spaced("700", vfs, 0.04)
		var total_h := fs + UI.c(1) + vfs
		var top := r.position.y + roundf((r.size.y - total_h) / 2.0) - p
		var x0 := roundf(r.position.x + (r.size.x - gs - gap - tw) / 2.0)
		UI.draw_glyph(self, "swords", Vector2(x0, top + (fs - gs) / 2.0 + p), gs, UI.GOLD_INK, Color(1, 0.94, 0.75, 0.6))
		var base := top + f.get_ascent(fs) * 0.92
		draw_string(f, Vector2(x0 + gs + gap, base + p), "FIGHT", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 0.94, 0.75, 0.7))
		draw_string(f, Vector2(x0 + gs + gap, base), "FIGHT", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.GOLD_INK)
		var vtxt := NamePlate._fit(vf, vs, vfs, r.size.x - cut * 2)
		var vw := UI.text_w(vf, vtxt, vfs)
		draw_string(vf, Vector2(roundf(r.position.x + (r.size.x - vw) / 2.0), top + fs + UI.c(1) + vf.get_ascent(vfs) + p), vtxt, HORIZONTAL_ALIGNMENT_LEFT, -1, vfs, Color("#6a3e08"))

	func _fill_clipped(poly: PackedVector2Array, r: Rect2, stops: Array) -> void:
		for i in stops.size() - 1:
			var y0: float = r.position.y + r.size.y * float(stops[i][0])
			var y1: float = r.position.y + r.size.y * float(stops[i + 1][0])
			var band := PackedVector2Array([Vector2(r.position.x - 4, y0), Vector2(r.end.x + 4, y0), Vector2(r.end.x + 4, y1), Vector2(r.position.x - 4, y1)])
			for cp in Geometry2D.intersect_polygons(band, poly):
				var cols := PackedColorArray()
				for v in cp:
					var t := clampf((v.y - y0) / maxf(1.0, y1 - y0), 0.0, 1.0)
					cols.append((stops[i][1] as Color).lerp(stops[i + 1][1], t))
				draw_polygon(cp, cols)

	func _band(poly: PackedVector2Array, r: Rect2, c: Color) -> void:
		var band := PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])
		for cp in Geometry2D.intersect_polygons(band, poly): draw_colored_polygon(cp, c)


## The Shop: a merchant's stall in purple with a striped awning and the gem count.
class ShopStall extends Tappable:
	var gems := 0
	var _t := 0.0

	func _process(dt: float) -> void:
		_t += dt
		queue_redraw()

	func _get_minimum_size() -> Vector2:
		var fs := roundi(UI.r(0.95))
		var f := UI.spaced("p700", fs, 0.1)
		var gfs := roundi(UI.r(0.6875))
		var gf := UI.font("700")
		var text_w := maxf(UI.text_w(f, "SHOP", fs), UI.glyph_size(gfs * 1.05) + UI.c(3) + UI.text_w(gf, str(gems), gfs) + UI.c(5) * 2)
		# Right padding leaves room for the unseen dot in the corner.
		return Vector2(roundf(UI.r(0.45) + UI.glyph_size(UI.r(1.6)) + UI.r(0.5) + text_w + UI.r(0.6) + UI.px * 4), UI.r(3.3))

	func _draw() -> void:
		var p := float(UI.px)
		var r := Rect2(Vector2(0, p if down else 0.0), size)
		draw_rect(Rect2(r.position + Vector2(0, p * 2), r.size), Color(0, 0, 0, 0.45))
		draw_rect(r, UI.INK)
		var i := r.grow(-p)
		draw_rect(i, Color("#6a2fb0"))
		draw_rect(Rect2(i.position.x, i.end.y - p * 3, i.size.x, p * 3), Color("#36125e"))
		draw_rect(Rect2(i.end.x - p, i.position.y, p, i.size.y), Color("#36125e"))
		draw_rect(Rect2(i.position, Vector2(i.size.x, p)), Color("#a868ff"))
		draw_rect(Rect2(i.position, Vector2(p, i.size.y - p * 3)), Color("#a868ff"))
		# Awning stripes.
		var x := r.position.x
		var k := 0
		while x < r.end.x:
			draw_rect(Rect2(x, r.position.y, minf(p * 5, r.end.x - x), p * 3), Color("#f0e6d0") if k % 2 == 0 else Color("#c8304a"))
			x += p * 5
			k += 1
		draw_rect(Rect2(r.position.x, r.position.y + p * 3, r.size.x, p), UI.INK)
		# The chest hops (two steps).
		var gs := UI.glyph_size(UI.r(1.6))
		var hop := -p if fmod(_t, 1.8) < 0.9 else 0.0
		var gx := r.position.x + UI.r(0.45)
		var mid := r.position.y + p * 4 + (r.size.y - p * 7) / 2.0
		UI.draw_glyph(self, "shop", Vector2(gx, roundf(mid - gs / 2.0 + hop)), gs, UI.GOLD, UI.INK)
		var tx := gx + gs + UI.r(0.5)
		var fs := roundi(UI.r(0.95))
		var f := UI.spaced("p700", fs, 0.1)
		var gfs := roundi(UI.r(0.6875))
		var gf := UI.font("700")
		var block := fs + UI.c(3) + gfs + UI.c(2) * 2
		var top := roundf(mid - block / 2.0)
		UI.draw_text(self, f, Vector2(tx, top + f.get_ascent(fs) * 0.92), "SHOP", fs, UI.GOLD_HI)
		var tag := Rect2(tx, top + fs + UI.c(3), UI.glyph_size(gfs * 1.05) + UI.c(3) + UI.text_w(gf, str(gems), gfs) + UI.c(5) * 2, gfs + UI.c(2) * 2)
		draw_rect(tag, Color(0, 0, 0, 0.4))
		var ggs := UI.glyph_size(gfs * 1.05)
		UI.draw_glyph(self, "gem", Vector2(tag.position.x + UI.c(5), roundf(tag.position.y + (tag.size.y - ggs) / 2.0)), ggs, Color("#7ad8ff"), UI.INK)
		draw_string(gf, Vector2(tag.position.x + UI.c(5) + ggs + UI.c(3), tag.position.y + UI.c(2) + gf.get_ascent(gfs)), str(gems), HORIZONTAL_ALIGNMENT_LEFT, -1, gfs, UI.TEXT)
		if unseen:
			var d := Rect2(r.end.x - p * 5, r.position.y + p * 6, p * 3, p * 3)
			if fmod(_t / 1.2, 1.0) <= 0.65:
				draw_rect(d.grow(p), UI.INK)
				draw_rect(d, UI.RED)


## The version line: patch notes button and "vX.Y.Z".
class VersionLine extends HBoxContainer:
	signal notes
	var btn: PxButton

	func _init() -> void:
		add_theme_constant_override("separation", int(UI.c(6)))
		btn = PxButton.new("", "notes", "", "sm")
		btn.pressed.connect(func(): notes.emit())
		add_child(btn)
		var l := UI.label("v" + str(ProjectSettings.get_setting("application/config/version")), 0.75, "600", UI.TEXT, "name")
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		add_child(l)
