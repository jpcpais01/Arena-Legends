class_name LoadoutsSheet
extends Sheet
## Saved builds (the web's ui/loadouts.ts): five slots, each with its name
## (tap to rename), its eight items, Save (the current build goes in; asks
## before replacing one) and Load. Kept under al.loadouts like the web.

signal loaded(gear: Dictionary, skins: Dictionary)

const SLOTS := 5
const KEY := "al.loadouts"

## The hero right now (a Callable returning the build dictionary).
var current: Callable
## Asks before replacing a slot: confirm.call(title, text, ok_label, glyph, on_ok).
var confirm: Callable
var _list: Array = []
## Per row: {rect, name: LineEdit, save: PxButton, load: PxButton, socks: [[id, skin]], worn}.
var _rows: Array = []
var _paint: UI.Paint


## The five saved loadouts (null: an empty slot).
static func read() -> Array:
	var raw = Store.get_item(KEY)
	var v = JSON.parse_string(raw) if raw != null else null
	var list: Array = v if v is Array else []
	var out := []
	for i in SLOTS:
		var l = list[i] if i < list.size() else null
		out.append(l if l is Dictionary and l.get("gear") is Dictionary else null)
	return out


static func write(list: Array) -> void:
	Store.set_item(KEY, JSON.stringify(list))


## What a loadout puts on today: items that no longer exist are left out (a missing
## main weapon keeps the current one) and only skins still owned are worn.
static func resolve(l: Dictionary, current_gear: Dictionary) -> Dictionary:
	var gear := {}
	for s in SimGear.GEAR_SLOTS:
		var id = l["gear"].get(s)
		if id is String and SimGear.GEAR_BY_ID.has(id) and SimGear.GEAR_BY_ID[id]["slot"] == s: gear[s] = id
	if not gear.has("main"): gear["main"] = current_gear["main"]
	var skins := {}
	var saved = l.get("skins")
	if saved is Dictionary:
		for g in saved:
			var def = CharacterSkins.skin_on({g: saved[g]}, g)
			if def != null and CharacterCollection.owns(def["id"]): skins[g] = def["id"]
	return {"gear": gear, "skins": skins}


static func _build_key(gear: Dictionary, skins) -> String:
	var parts := []
	for s in SimGear.GEAR_SLOTS:
		var id = gear.get(s)
		parts.append("%s:%s" % [id, skins.get(id, "") if skins is Dictionary else ""] if id != null else "-")
	return "|".join(parts)


static func same_build(l: Dictionary, c: Dictionary) -> bool:
	var r := resolve(l, c["gear"])
	return _build_key(r["gear"], r["skins"]) == _build_key(c["gear"], c.get("skins"))


func _init(cur: Callable, ask: Callable) -> void:
	super("Loadouts", 38.0)
	current = cur
	confirm = ask
	_list = read()
	_paint = UI.Paint.new(_paint_rows)
	body.add_child(_paint)
	panel.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed: get_viewport().gui_release_focus())
	for i in SLOTS:
		var row := {}
		var name := LineEdit.new()
		name.max_length = 18
		name.context_menu_enabled = false
		name.select_all_on_focus = true
		name.add_theme_font_override("font", UI.font("600"))
		name.add_theme_color_override("font_color", UI.TEXT)
		name.add_theme_color_override("font_uneditable_color", UI.MUTED)
		name.add_theme_color_override("font_placeholder_color", UI.MUTED)
		name.add_theme_color_override("caret_color", UI.GOLD_HI)
		name.add_theme_color_override("selection_color", Color(UI.GOLD_LO, 0.6))
		for st in ["normal", "read_only"]:
			name.add_theme_stylebox_override(st, _field_box(Color(0, 0, 0, 0), Color(0, 0, 0, 0)))
		name.add_theme_stylebox_override("focus", _field_box(Color(0, 0, 0, 0.35), UI.GOLD_LO))
		name.text_submitted.connect(func(_t): name.release_focus())
		name.focus_exited.connect(_rename.bind(i))
		body.add_child(name)
		row["name"] = name
		var save := PxButton.new("Save", "bag", "", "sm")
		save.pressed.connect(_on_save.bind(i))
		body.add_child(save)
		row["save"] = save
		var load := PxButton.new("Load", "check", "primary", "sm")
		load.pressed.connect(_on_load.bind(i))
		body.add_child(load)
		row["load"] = load
		_rows.append(row)
	_render()


func _field_box(bg: Color, edge: Color) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = bg
	b.border_color = edge
	b.set_border_width_all(UI.px)
	b.content_margin_left = UI.c(6)
	b.content_margin_right = UI.c(6)
	return b


func _rename(i: int) -> void:
	var l = _list[i]
	if l == null: return
	var t: String = (_rows[i]["name"] as LineEdit).text.strip_edges()
	l = l.duplicate()
	l["name"] = t if t != "" else "Loadout %d" % (i + 1)
	_list[i] = l
	write(_list)
	_rows[i]["name"].text = l["name"]


func _on_save(i: int) -> void:
	var l = _list[i]
	if l == null:
		_put(i)
		return
	confirm.call("Replace %s?" % l["name"], "Save your current build over %s? The items saved there now will be lost." % l["name"], "Save", "check", _put.bind(i))


func _put(i: int) -> void:
	var c: Dictionary = current.call()
	var name: String = _list[i]["name"] if _list[i] != null else "Loadout %d" % (i + 1)
	var gear: Dictionary = c["gear"].duplicate()
	var skins := {}
	var worn = c.get("skins")
	for id in gear.values():
		if worn is Dictionary and worn.get(id): skins[id] = worn[id]
	_list[i] = {"name": name, "gear": gear, "skins": skins}
	write(_list)
	Sfx.sfx.play("equip")
	_render()


func _on_load(i: int) -> void:
	var l = _list[i]
	if l == null: return
	var r := resolve(l, current.call()["gear"])
	close()
	loaded.emit(r["gear"], r["skins"])


func _render() -> void:
	var c: Dictionary = current.call()
	for i in SLOTS:
		var l = _list[i]
		var row: Dictionary = _rows[i]
		var worn: bool = l != null and same_build(l, c)
		row["worn"] = worn
		var name: LineEdit = row["name"]
		name.text = l["name"] if l != null else ""
		name.placeholder_text = "Loadout %d" % (i + 1) if l != null else "Empty"
		name.editable = l != null
		(row["load"] as PxButton).disabled = l == null or worn
		(row["load"] as PxButton).visible = l != null
		var socks := []
		var r = resolve(l, c["gear"]) if l != null else null
		for s in SimGear.GEAR_SLOTS:
			var id = r["gear"].get(s) if r != null else null
			socks.append([id, r["skins"].get(id) if id != null else null])
		row["socks"] = socks
	if is_inside_tree(): _layout()
	_paint.queue_redraw()


# --- Layout ------------------------------------------------------------------------------------

func _row_h() -> float:
	return UI.px * 2 + UI.c(3) + UI.r(1.4) + UI.c(4) + UI.r(1.45) + UI.c(4)


func _body_size(avail: Vector2) -> Vector2:
	return Vector2(avail.x, UI.r(0.35) + SLOTS * _row_h() + (SLOTS - 1) * UI.c(4) + UI.r(0.5))


func _layout_body(s: Vector2) -> void:
	var fs := roundi(UI.r(0.8125))
	var px := UI.r(0.5)
	var y := UI.r(0.35)
	_paint.position = Vector2.ZERO
	_paint.size = s
	for row in _rows:
		var rc := Rect2(px, y, s.x - px * 2, _row_h())
		row["rect"] = rc
		var load: PxButton = row["load"]
		var save: PxButton = row["save"]
		load.size = load.custom_minimum_size
		save.size = save.custom_minimum_size
		load.position = Vector2(rc.end.x - UI.c(5) - UI.px - load.size.x, rc.position.y + (rc.size.y - load.size.y) / 2.0)
		save.position = Vector2(load.position.x - UI.c(5) - save.size.x, load.position.y)
		var nx := rc.position.x + UI.px + UI.c(5) + UI.r(1.7) + UI.c(6)
		var name: LineEdit = row["name"]
		name.add_theme_font_size_override("font_size", fs)
		name.position = Vector2(nx, rc.position.y + UI.px + UI.c(3))
		name.size = Vector2(save.position.x - UI.c(6) - nx - (UI.r(5.5) if row.get("worn") else 0.0), UI.r(1.4))
		y += _row_h() + UI.c(4)


func _paint_rows(ci: CanvasItem, _s: Vector2) -> void:
	var p := float(UI.px)
	var nf := UI.font("p700")
	var nfs := roundi(UI.r(1.0))
	for i in _rows.size():
		var row: Dictionary = _rows[i]
		if not row.has("rect"): continue
		var rc: Rect2 = row["rect"]
		var l = _list[i]
		var worn: bool = row["worn"]
		ci.draw_rect(rc, Color(0.14, 0.11, 0.06, 0.4) if worn else Color(0, 0, 0, 0.28))
		ci.draw_rect(rc.grow(-p / 2.0), UI.GOLD_LO if worn else Color("#3a2e5a"), false, p)
		# The number badge.
		var n := UI.rround(Rect2(rc.position.x + p + UI.c(5), rc.position.y + (rc.size.y - UI.r(1.7)) / 2.0, UI.r(1.7), UI.r(1.7)))
		ci.draw_rect(n, Color("#241b40"))
		ci.draw_rect(n.grow(-p / 2.0), UI.GOLD_LO if l != null else Color("#3a2e5a"), false, p)
		var t := str(i + 1)
		var tw := UI.text_w(nf, t, nfs)
		UI.draw_text(ci, nf, Vector2(roundf(n.get_center().x - tw / 2.0), roundf(n.get_center().y + (nf.get_ascent(nfs) - nf.get_descent(nfs)) / 2.0)), t, nfs, UI.GOLD_HI if l != null else UI.MUTED)
		var name: LineEdit = row["name"]
		if worn:
			var wf := UI.spaced("700", roundi(UI.r(0.625)), 0.08)
			var wfs := roundi(UI.r(0.625))
			var wx := name.position.x + name.size.x + UI.c(8)
			var cy := name.position.y + name.size.y / 2.0
			var gs := UI.glyph_size(UI.r(0.7))
			UI.draw_glyph(ci, "check", Vector2(wx, cy - gs / 2.0), gs, UI.GOLD)
			ci.draw_string(wf, Vector2(wx + gs + UI.c(4), roundf(cy + (wf.get_ascent(wfs) - wf.get_descent(wfs)) / 2.0)), "WEARING", HORIZONTAL_ALIGNMENT_LEFT, -1, wfs, UI.GOLD)
		# The eight items.
		var ss := UI.r(1.45)
		var x := name.position.x + UI.c(6)
		var y := name.position.y + name.size.y + UI.c(4)
		for sk in row["socks"]:
			var r := UI.rround(Rect2(x, y, ss, ss))
			if sk[0] == null:
				ci.draw_rect(r, Color(UI.INK, 0.4))
				ci.draw_rect(r.grow(-p), Color("#110c1e", 0.4))
			else:
				UI.sock(ci.get_canvas_item(), r)
				var ic = GearIcons.get_icon(sk[0], sk[1], _paint.queue_redraw)
				if ic != null: GearIcons.draw(ci, ic, r.grow(-p))
			x += ss + UI.c(3)
