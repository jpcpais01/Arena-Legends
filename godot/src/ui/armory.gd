class_name Armory
extends Control
## The Armory (the web's ui/gear.ts), read left to right like a game loadout:
## slot rail, the fighter on a pedestal, the items for that slot, and the
## picked item's card (stats, skills, and its skins along the bottom).
## Picking a slot picks the item worn there, so its card is always in view.
## Tapping another item shows its card and tries it on the fighter; Equip (or
## a second tap) wears it. Every change saves at once (`changed`), with Undo,
## Redo, No skins and five saved Loadouts in the header.
##
## Everything is custom-drawn in device pixels to the web's phone landscape
## CSS; long lists draw only what's on screen, and only the cursor and the
## Mythic sweeps animate.

signal changed(c)
signal closed
## The Shop button under a locked skin.
signal shop

const SHORT := {"main": "Main", "secondary": "Second", "special": "Special", "usable": "Usable", "head": "Head", "chest": "Chest", "legs": "Legs", "boots": "Boots"}
## The slot rail: what you hold and carry in the first column, what you wear in the second.
const HELD := ["main", "secondary", "special", "usable"]
const WORN := ["head", "chest", "legs", "boots"]
const SLOT_INFO := {
	"main": "Basic attack, weapon skill and fighting distance. One- or two-handed.",
	"secondary": "A one-handed weapon or tool with one more skill. A two-handed main goes on the back while it is used.",
	"special": "Works on its own: auras, a familiar, or an attack the item makes by itself.",
	"usable": "A potion or bomb on the belt, used a few times per battle. The free hand grabs it.",
	"head": "Passives and stats.",
	"chest": "Passives and stats; some grant a defensive skill.",
	"legs": "Armour for the legs: stats, and sometimes a passive.",
	"boots": "Movement, and the evade itself.",
}
## The stats a build shows: key, label, format (0 whole, 1 percent, 2 one decimal).
const LINES := [["maxHp", "Health", 0], ["power", "Power", 0], ["armor", "Armor", 0], ["resist", "Resist", 0], ["attackSpeed", "Attack speed", 1], ["moveSpeed", "Move speed", 2], ["critChance", "Crit", 1]]
const MOD_NAMES := {
	"maxHp": "health", "power": "power", "armor": "armor", "resist": "resist", "attackSpeed": "attack speed", "moveSpeed": "move speed",
	"critChance": "crit", "critMult": "crit damage", "lifesteal": "lifesteal", "cdr": "cooldowns", "energyRegen": "energy regen",
	"tenacity": "tenacity", "poise": "poise",
}
const MOD_PCT := ["critChance", "critMult", "lifesteal", "cdr", "tenacity", "poise"]
## Skin tiers: the cell's bottom edge and the names' colours (internal ids; "epic" sweeps).
const SKIN_RC := {"rare": Color("#5aa8ff"), "mythic": Color("#c27aff"), "legendary": Color("#ffb040")}
const SKIN_TEXT := {"rare": Color("#5aa8ff"), "mythic": Color("#c27aff"), "legendary": Color("#ffb040"), "epic": Color("#e8c8ff")}
const PLAIN_RC := Color("#5a5370")

## The hero being dressed.
var c: Dictionary
var slot := "main"
## The item whose card is shown (null: the slot is empty and nothing is picked).
var pick = null
## A locked skin tapped on the card: tried on the fighter until another pick.
var peek = null
var _undos: Array = []
var _redos: Array = []
var _t := 0.0
var _beat := 0
var _pop := 1.0
var _stats_on := false
var _shown_key := ""
var _sheets: Array[Sheet] = []

var _load_btn: PxButton
var _plain_btn: PxButton
var _undo_btn: PxButton
var _redo_btn: PxButton
var _done_btn: PxButton
var _stats_btn: PxButton
var _preview: FighterPreview
var _rail: UI.Pad
var _stats: UI.Paint
var _try: UI.Paint
var _trying := false
var _list_box: UI.Paint
var _items: ScrollView
var _card: UI.Paint
var _card_in: Control
var _deco: UI.Paint
var _sock: UI.Paint
var _act: PxButton
var _body: ScrollView
var _skins: ScrollView
var _info_btn: PxButton

# Layout (device pixels).
var _head_h := 0.0
var _stage_end := 0.0
var _slot_rects: Array = []
## Item tiles: {id, rect, name (Rich.Layout)}.
var _tiles: Array = []
## The card: head and foot pieces, body blocks, skin cells.
var _card_m := {}
var _blocks: Array = []
var _cells: Array = []
var _has_epic_cell := false


func _init(hero: Dictionary) -> void:
	c = hero
	pick = c["gear"].get("main")
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED

	_preview = FighterPreview.new(null, 76, 82, {"pedestal": true})
	add_child(_preview)
	_rail = UI.Pad.new(_paint_rail)
	_rail.tapped.connect(_on_rail_tap)
	add_child(_rail)
	_stats_btn = PxButton.new("Stats", "body", "", "sm")
	_stats_btn.pressed.connect(func():
		_stats_on = not _stats_on
		_stats_btn.set_style("on" if _stats_on else "")
		_stats.visible = _stats_on)
	add_child(_stats_btn)
	_stats = UI.Paint.new(_paint_stats)
	_stats.visible = false
	add_child(_stats)
	_try = UI.Paint.new(_paint_try)
	_try.visible = false
	add_child(_try)

	_list_box = UI.Paint.new(_paint_list_box)
	add_child(_list_box)
	_items = ScrollView.new(_paint_tiles)
	_items.tapped.connect(_on_tile_tap)
	_list_box.add_child(_items)

	_card = UI.Paint.new(func(ci: CanvasItem, s: Vector2): _frame(ci, s))
	add_child(_card)
	_card_in = Control.new()
	_card_in.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card.add_child(_card_in)
	_deco = UI.Paint.new(_paint_deco)
	_card_in.add_child(_deco)
	_sock = UI.Paint.new(_paint_sock)
	_card_in.add_child(_sock)
	_body = ScrollView.new(_paint_body)
	_card_in.add_child(_body)
	_skins = ScrollView.new(_paint_cells)
	_skins.horizontal = true
	_skins.material = UI.gray_material()
	_skins.tapped.connect(_on_cell_tap)
	_card_in.add_child(_skins)
	_act = PxButton.new()
	_act.pressed.connect(_on_act)
	_card_in.add_child(_act)
	_info_btn = PxButton.new("", "", "", "sm")
	_info_btn.pressed.connect(_on_info_btn)
	_card_in.add_child(_info_btn)

	_load_btn = PxButton.new("Loadouts", "bag", "", "sm")
	_load_btn.pressed.connect(_open_loadouts)
	_plain_btn = PxButton.new("No skins", "star", "", "sm")
	_plain_btn.pressed.connect(func():
		if not _skin_map().is_empty():
			peek = null
			_save(TS.merge([c, {"skins": {}}]), false))
	_undo_btn = PxButton.new("", "undo", "", "sm")
	_undo_btn.pressed.connect(func(): _travel(_undos, _redos))
	_redo_btn = PxButton.new("", "redo", "", "sm")
	_redo_btn.pressed.connect(func(): _travel(_redos, _undos))
	_done_btn = PxButton.new("Done", "check", "primary")
	_done_btn.min_w = 6.5
	_done_btn.min_h = 2.4
	_done_btn.pressed.connect(func(): closed.emit())
	for b in [_load_btn, _plain_btn, _undo_btn, _redo_btn, _done_btn]: add_child(b)
	resized.connect(_layout)


func _ready() -> void:
	_layout()
	_render()
	# Long lists put the worn item below the fold.
	_reveal_tile(c["gear"].get(slot))


## Back: closes a popup over the Armory, or the Armory itself.
func back() -> void:
	for i in range(_sheets.size() - 1, -1, -1):
		var s := _sheets[i]
		if is_instance_valid(s) and s._closing < 0.0:
			s.close()
			return
	closed.emit()


func _open_sheet(s: Sheet) -> void:
	_sheets.append(s)
	s.closed.connect(func(): _sheets.erase(s))
	add_child(s)


func _confirm(title: String, text: String, ok_label: String, glyph: String, on_ok: Callable) -> void:
	var s := ConfirmSheet.new(title, text, ok_label, glyph)
	s.ok.connect(on_ok)
	_open_sheet(s)


func _open_loadouts() -> void:
	var s := LoadoutsSheet.new(func(): return c, _confirm)
	s.loaded.connect(func(gear: Dictionary, skins: Dictionary):
		peek = null
		pick = gear.get(slot)
		_save(TS.merge([c, {"gear": gear, "skins": skins}]), true))
	_open_sheet(s)


# --- Changes -----------------------------------------------------------------------------------

func _skin_map() -> Dictionary:
	var s = c.get("skins")
	return s if s is Dictionary else {}


func _skin_of(id: String):
	return CharacterSkins.skin_on(_skin_map(), id)


## Steps back (or forward) one change: the current build goes on the other stack.
func _travel(from: Array, to: Array) -> void:
	if from.is_empty(): return
	to.append(c)
	c = from.pop_back()
	peek = null
	pick = c["gear"].get(slot)
	Sfx.sfx.play("equip")
	changed.emit(c)
	_render()


func _save(next: Dictionary, move: bool) -> void:
	_undos.append(c)
	if _undos.size() > 50: _undos.pop_front()
	_redos.clear()
	c = next
	Sfx.sfx.play("equip" if move else "select")
	changed.emit(c)
	_render()
	# A new usable item is shown being used; anything else plays a random move.
	if move: _preview.showcase(_use_clip(c["gear"].get("usable")) if slot == "usable" else null)


func _use_clip(id):
	if id == null: return null
	var ab = SimGear.gear_of(id).get("abilities")
	if ab is Array and not ab.is_empty() and ab[0].get("anim") != null: return "use." + str(ab[0]["anim"])
	return null


func _equip(id) -> void:
	pick = id
	peek = null
	if c["gear"].get(slot) == id:
		_render()
		return
	_save(SimLoadout.with_gear(c, slot, id), id != null)


## Picks a skin for an item (null: the plain item). Locked ones are only tried on.
func _wear(id: String, skin) -> void:
	if skin != null and not CharacterCollection.owns(skin["id"]):
		peek = null if peek != null and peek["id"] == skin["id"] else skin
		Sfx.sfx.play("select")
		_render()
		return
	peek = null
	var cur = _skin_of(id)
	if (cur["id"] if cur != null else null) == (skin["id"] if skin != null else null):
		_render()
		return
	var next := _skin_map().duplicate()
	if skin != null: next[id] = skin["id"]
	else: next.erase(id)
	_save(TS.merge([c, {"skins": next}]), c["gear"].get(slot) == id)


## Equips every piece of a Mythic set, each in its set skin.
func _wear_set(set_id: String) -> void:
	var next := c
	var skins := _skin_map().duplicate()
	for p in CharacterSkins.set_pieces(set_id):
		next = SimLoadout.with_gear(next, SimGear.gear_of(p["gear"])["slot"], p["gear"])
		skins[p["gear"]] = p["id"]
	_save(TS.merge([next, {"skins": skins}]), true)


## Pieces of a set equipped and wearing their set skin.
func _set_worn(set_id: String) -> int:
	var n := 0
	for p in CharacterSkins.set_pieces(set_id):
		if c["gear"].get(SimGear.gear_of(p["gear"])["slot"]) == p["gear"] and _skin_map().get(p["gear"]) == p["id"]: n += 1
	return n


## Shows an item's card (tries it on); a second tap on an item already shown equips it.
func _choose(id: String) -> void:
	if pick == id and c["gear"].get(slot) != id:
		_equip(id)
		return
	if pick != id: _body.offset = 0.0
	pick = id
	peek = null
	Sfx.sfx.play("select")
	_render()


func _pick_slot(s: String) -> void:
	if s == slot: return
	slot = s
	pick = c["gear"].get(s)
	peek = null
	_body.offset = 0.0
	Sfx.sfx.play("select")
	_items.offset = 0.0
	_render()
	_reveal_tile(c["gear"].get(s))


func _reveal_tile(id) -> void:
	for t in _tiles:
		if t["id"] == id:
			var r: Rect2 = t["rect"]
			_items.reveal(r.position.y - UI.c(2), r.end.y + UI.c(4))


func _on_act() -> void:
	if pick == null: return
	if c["gear"].get(slot) == pick: _equip(null)
	else: _equip(pick)


func _on_info_btn() -> void:
	var a = _card_m.get("info_act")
	if a == "shop": shop.emit()
	elif a is String and a.begins_with("set:"):
		var set_id := (a as String).substr(4)
		var set_ = CharacterSkins.SKIN_SET_BY_ID[set_id]
		_confirm("Equip set?", "Swap your items for the %s pieces and wear their set skins? Undo brings your build back." % set_["name"], "Equip set", "bag", _wear_set.bind(set_id))


# --- Render --------------------------------------------------------------------------------------

func _render() -> void:
	_undo_btn.disabled = _undos.is_empty()
	_redo_btn.disabled = _redos.is_empty()
	_plain_btn.disabled = _skin_map().is_empty()
	_rail.queue_redraw()
	_stats.queue_redraw()
	_list_box.queue_redraw()
	_build_tiles()
	var key := "%s|%s" % [slot, pick]
	if key != _card_m.get("key", ""): _pop = 0.0
	_build_card()
	_card_m["key"] = key
	_sync_preview()
	set_process(true)


## What the stage shows: the saved fighter, or the picked item (and a tried-on skin) on them.
func _sync_preview() -> void:
	var b := c
	if pick != null and c["gear"].get(slot) != pick: b = SimLoadout.with_gear(c, slot, pick)
	if pick != null and peek != null:
		var sk := _skin_map().duplicate()
		sk[pick] = peek["id"]
		b = TS.merge([b, {"skins": sk}])
	var key := JSON.stringify([b["form"], b["gear"], b.get("skins")])
	_trying = key != JSON.stringify([c["form"], c["gear"], c.get("skins")])
	_try.visible = _trying
	if key == _shown_key: return
	var fresh := _shown_key != ""
	_shown_key = key
	_preview.set_build(b)
	if fresh and _trying: _preview.showcase(_use_clip(pick) if slot == "usable" else null)


func _process(dt: float) -> void:
	_t += dt
	var beat := int(_t / 0.45) % 2
	if beat != _beat:
		_beat = beat
		_rail.queue_redraw()
		_items.queue_redraw()
	if _pop < 1.0:
		_pop = minf(1.0, _pop + dt / 0.15)
		# Three steps in from the right (CSS steps(3)).
		_card_in.position.x = UI.px * 4 * (1.0 - floorf(_pop * 3.0) / 3.0)
	if _card_m.get("epic_sock", false): _sock.queue_redraw()
	if _has_epic_cell: _skins.queue_redraw()


# --- Layout --------------------------------------------------------------------------------------

## Grid tracks: `avail` shared by fr among [min, fr] tracks, none below its min.
static func _tracks(avail: float, spec: Array) -> Array:
	var out := []
	var fixed := []
	for s in spec:
		out.append(0.0)
		fixed.append(false)
	for _pass in spec.size():
		var fr := 0.0
		var left := avail
		for i in spec.size():
			if fixed[i]: left -= out[i]
			else: fr += spec[i][1]
		var again := false
		for i in spec.size():
			if fixed[i]: continue
			out[i] = left * spec[i][1] / fr
			if out[i] < spec[i][0]:
				out[i] = spec[i][0]
				fixed[i] = true
				again = true
		if not again: break
	for i in out.size(): out[i] = floorf(out[i])
	return out


func _layout() -> void:
	if size.x < 2: return
	var W := size.x
	var H := size.y
	var p := float(UI.px)
	var sl := roundf(W * 0.03)
	var top := UI.c(6)
	var row := UI.r(2.4)
	_head_h = top + row + UI.r(0.2)
	_done_btn.size = _done_btn.custom_minimum_size
	var x := W - sl - _done_btn.size.x
	_done_btn.position = Vector2(x, top + (row - _done_btn.size.y) / 2.0).round()
	x -= UI.r(0.6)
	for b in [_redo_btn, _undo_btn, _plain_btn, _load_btn]:
		b.size = b.custom_minimum_size
		x -= b.size.x
		b.position = Vector2(x, top + (row - b.size.y) / 2.0).round()
		x -= UI.c(6)

	var gap := UI.r(0.35)
	var slot_w := UI.r(3.3)
	var rail_w := sl + slot_w * 2 + UI.c(4)
	var tr := _tracks(W - rail_w - gap * 3, [[UI.r(6.5), 0.85], [UI.r(12.5), 1.0], [UI.r(18.0), 1.45]])
	_stage_end = rail_w + gap + tr[0]
	var bottom := H - UI.c(10)

	# The fighter's stage spans the rail's column too: the rail stands over its empty left edge.
	var stage_h := H - _head_h - UI.r(0.35)
	_preview.position = Vector2(UI.r(2.4), _head_h)
	_preview.size = Vector2(_stage_end - UI.r(2.4), stage_h)
	_stats_btn.size = _stats_btn.custom_minimum_size
	_stats_btn.position = Vector2(roundf(_stage_end / 2.0 - _stats_btn.size.x / 2.0), _head_h)
	var sw := minf(UI.r(15), _stage_end * 0.94)
	_stats.size = Vector2(sw, _stats_h())
	_stats.position = Vector2(roundf(_stage_end / 2.0 - sw / 2.0), _head_h + UI.r(2.4))
	var tw := _try_w()
	_try.size = Vector2(tw, _try_h())
	_try.position = Vector2(roundf(_stage_end / 2.0 - tw / 2.0), roundf(_head_h + stage_h - UI.r(0.6) - _try_h()))

	# The rail: two columns of four, centred down the row.
	var sh := _slot_h()
	var rail_h := sh * 4 + UI.c(4) * 3
	_rail.position = Vector2(sl, roundf(_head_h + (H - _head_h - UI.r(0.3) - rail_h) / 2.0))
	_rail.size = Vector2(slot_w * 2 + UI.c(4), rail_h)
	_slot_rects.clear()
	for i in 8:
		_slot_rects.append(Rect2(floori(i / 4) * (slot_w + UI.c(4)), (i % 4) * (sh + UI.c(4)), slot_w, sh))

	# Item list.
	var lx := _stage_end + gap
	_list_box.position = Vector2(lx, _head_h)
	_list_box.size = Vector2(tr[1], bottom - _head_h)
	var fw := UI.frame_w("gold")
	var ih := _list_head_h()
	_items.position = Vector2(fw + UI.r(0.35), fw + UI.r(0.3) + ih)
	_items.size = Vector2(tr[1] - fw * 2 - UI.r(0.35) * 2, _list_box.size.y - fw * 2 - UI.r(0.3) - UI.r(0.35) - ih)

	# Item card.
	var cx: float = lx + tr[1] + gap
	_card.position = Vector2(cx, _head_h)
	_card.size = Vector2(W - sl - cx, bottom - _head_h)
	_card_in.position = Vector2.ZERO
	_card_in.size = _card.size
	if is_node_ready():
		_build_tiles()
		_build_card()
	queue_redraw()


func _slot_h() -> float:
	return UI.px * 2 + UI.c(3) + UI.r(2.35) + UI.c(3) + roundf(UI.r(0.5625)) + UI.c(4)


func _list_head_h() -> float:
	return roundf(UI.r(0.875)) + UI.r(0.25) + UI.px + UI.r(0.25)


# --- Screen and header -------------------------------------------------------------------------

func _draw() -> void:
	var ci := get_canvas_item()
	var W := size.x
	var H := size.y
	# Over the frozen arena, darkened, with a violet pool of light where the fighter stands.
	UI.vgrad(ci, Rect2(Vector2.ZERO, size), [[0.0, Color(14 / 255.0, 9 / 255.0, 26 / 255.0, 0.88)], [1.0, Color(8 / 255.0, 5 / 255.0, 15 / 255.0, 0.95)]])
	UI.glow(ci, Vector2(W * 0.21, H * 0.62), Vector2(W * 0.45, H * 0.6) * 0.7, Color(90 / 255.0, 64 / 255.0, 160 / 255.0, 0.4))
	UI.vgrad(ci, Rect2(0, 0, W, _head_h), [[0.0, Color(0, 0, 0, 0.5)], [1.0, Color(0, 0, 0, 0)]])
	var fs := roundi(UI.r(1.2))
	var f := UI.spaced("p700", fs, 0.08)
	var row := UI.r(2.4)
	var base := roundf(UI.c(6) + (row + f.get_ascent(fs) - f.get_descent(fs)) / 2.0) - UI.px
	UI.draw_text(self, f, Vector2(roundf(W * 0.03), base), "ARMORY", fs, UI.GOLD_HI, "outline")


## A panel with the gold frame (CSS .frame).
func _frame(ci: CanvasItem, s: Vector2) -> void:
	var p := float(UI.px)
	UI.panel_fill(ci.get_canvas_item(), Rect2(Vector2(p * 2, p * 2), s - Vector2(p * 4, p * 4)))
	UI.draw_frame(ci.get_canvas_item(), Rect2(Vector2.ZERO, s), "gold")


## Draws a ring `w` wide just inside `r`.
static func _ring(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:
	ci.draw_rect(Rect2(r.position, Vector2(r.size.x, w)), col)
	ci.draw_rect(Rect2(r.position.x, r.end.y - w, r.size.x, w), col)
	ci.draw_rect(Rect2(r.position.x, r.position.y + w, w, r.size.y - w * 2), col)
	ci.draw_rect(Rect2(r.end.x - w, r.position.y + w, w, r.size.y - w * 2), col)


## The gold select cursor round a picked tile, pulsing on the beat.
func _cursor(ci: CanvasItem, r: Rect2) -> void:
	var g := r.grow(UI.px * 4)
	if _beat == 1: g = g.grow_individual(g.size.x * 0.025, g.size.y * 0.025, g.size.x * 0.025, g.size.y * 0.025)
	UI.draw_frame(ci.get_canvas_item(), UI.rround(g), "cursor")


## A recessed icon socket with its edge in `edge`.
static func _socket(ci: CanvasItem, r: Rect2, edge: Color) -> void:
	UI.sock(ci.get_canvas_item(), r)
	_ring(ci, r, edge, UI.px)


func _icon(ci: CanvasItem, id: String, skin, r: Rect2, redraw: Callable, mod := Color.WHITE) -> void:
	var ic = GearIcons.get_icon(id, skin, redraw)
	if ic != null: GearIcons.draw(ci, ic, r, mod)


# --- Rail ------------------------------------------------------------------------------------------

func _on_rail_tap(pos: Vector2) -> void:
	for i in _slot_rects.size():
		if (_slot_rects[i] as Rect2).has_point(pos): _pick_slot((HELD + WORN)[i])


func _paint_rail(ci: CanvasItem, _s: Vector2) -> void:
	var p := float(UI.px)
	var slots := HELD + WORN
	var fs := roundi(UI.r(0.5625))
	var f := UI.spaced("700", fs, 0.04)
	var on_rect = null
	for i in slots.size():
		var s: String = slots[i]
		var r: Rect2 = _slot_rects[i]
		var id = c["gear"].get(s)
		var on := s == slot
		ci.draw_rect(r, UI.INK)
		var inner := r.grow(-p)
		if on:
			ci.draw_rect(inner, Color("#4a3410"))
			_ring(ci, inner, UI.GOLD, p)
			ci.draw_rect(Rect2(inner.position.x + p, inner.end.y - p * 3, inner.size.x - p * 2, p * 2), UI.GOLD_LO)
			on_rect = r
		else:
			ci.draw_rect(inner, Color("#2a2046", 1.0 if id != null else 0.8))
			ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p)), Color("#4e3f80"))
			ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), Color("#120c20"))
		var ss := UI.r(2.35)
		var sr := Rect2(roundf(r.get_center().x - ss / 2.0), r.position.y + p + UI.c(3), ss, ss)
		UI.sock(ci.get_canvas_item(), sr)
		var ir := Rect2(sr.get_center() - Vector2.ONE * UI.r(2.1) / 2.0, Vector2.ONE * UI.r(2.1))
		if id != null:
			_icon(ci, id, _skin_map().get(id), ir, _rail.queue_redraw)
		else:
			var cc := sr.get_center().round()
			ci.draw_rect(Rect2(cc.x - roundf(ir.size.x * 0.15), cc.y, roundf(ir.size.x * 0.3), p), UI.LINE)
			ci.draw_rect(Rect2(cc.x, cc.y - roundf(ir.size.y * 0.15), p, roundf(ir.size.y * 0.3)), UI.LINE)
		var t := (SHORT[s] as String).to_upper()
		var tw := UI.text_w(f, t, fs)
		UI.draw_text(ci, f, Vector2(roundf(r.get_center().x - tw / 2.0), sr.end.y + UI.c(3) + roundf(f.get_ascent(fs))), t, fs, UI.GOLD_HI if on else UI.MUTED)
	if on_rect != null: _cursor(ci, on_rect)


# --- Stage --------------------------------------------------------------------------------------

func _stats_h() -> float:
	var fs := roundi(UI.r(0.75))
	return UI.frame_w("iron") * 2 + UI.r(0.25) * 2 + LINES.size() * roundf(fs * 1.25) + (LINES.size() - 1) * UI.c(3)


## A build's stat as the web prints it.
static func fmt(v: float, kind: int) -> String:
	match kind:
		1: return "%d%%" % roundi(v * 100.0)
		2: return String.num(v, 1) if not is_equal_approx(v, roundf(v)) else "%d.0" % roundi(v)
	return str(roundi(v))


func _paint_stats(ci: CanvasItem, s: Vector2) -> void:
	var rid := ci.get_canvas_item()
	var p := float(UI.px)
	UI.vgrad(rid, Rect2(Vector2(p * 2, p * 2), s - Vector2(p * 4, p * 4)), [[0.0, UI.FACE], [1.0, UI.FACE]])
	RenderingServer.canvas_item_add_texture_rect(rid, Rect2(Vector2(p * 2, p * 2), s - Vector2(p * 4, p * 4)), UI.dither().get_rid(), true)
	UI.draw_frame(rid, Rect2(Vector2.ZERO, s), "iron")
	var st = SimLoadout.compute_base_stats(c["form"], c["gear"], c.get("train"))
	var fs := roundi(UI.r(0.75))
	var f := UI.font("500")
	var bf := UI.font("700")
	var lh := roundf(fs * 1.25)
	var x0 := UI.frame_w("iron") + UI.r(0.5)
	var x1 := s.x - UI.frame_w("iron") - UI.r(0.5)
	var y := UI.frame_w("iron") + UI.r(0.25)
	for l in LINES:
		var base := roundf(y + (lh + f.get_ascent(fs) - f.get_descent(fs)) / 2.0)
		ci.draw_string(f, Vector2(x0, base), l[1], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.MUTED)
		var v := fmt(float(st[l[0]]), l[2])
		UI.draw_text(ci, bf, Vector2(x1 - UI.text_w(bf, v, fs), base), v, fs, UI.GOLD_HI)
		y += lh + UI.c(3)


func _try_h() -> float:
	return roundf(UI.r(0.6875)) + UI.c(7) + UI.px * 2


func _try_font() -> Font:
	return UI.spaced("700", roundi(UI.r(0.6875)), 0.1)


func _try_w() -> float:
	var fs := roundi(UI.r(0.6875))
	return UI.c(8) * 2 + UI.px * 2 + UI.glyph_size(UI.r(0.85)) + UI.c(5) + UI.text_w(_try_font(), "TRYING ON", fs)


func _paint_try(ci: CanvasItem, s: Vector2) -> void:
	var p := float(UI.px)
	ci.draw_rect(Rect2(Vector2.ZERO, s), Color(10 / 255.0, 6 / 255.0, 20 / 255.0, 0.8))
	_ring(ci, Rect2(Vector2.ZERO, s), UI.GOLD_LO, p)
	var fs := roundi(UI.r(0.6875))
	var f := _try_font()
	var gs := UI.glyph_size(UI.r(0.85))
	var x := UI.c(8) + p
	UI.draw_glyph(ci, "eye", Vector2(x, roundf((s.y - gs) / 2.0)), gs, UI.GOLD_HI)
	ci.draw_string(f, Vector2(x + gs + UI.c(5), roundf((s.y + f.get_ascent(fs) - f.get_descent(fs)) / 2.0)), "TRYING ON", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.GOLD_HI)


# --- Item list ---------------------------------------------------------------------------------

func _paint_list_box(ci: CanvasItem, s: Vector2) -> void:
	_frame(ci, s)
	var fw := UI.frame_w("gold")
	var x0 := fw + UI.r(0.35) + UI.r(0.2)
	var x1 := s.x - fw - UI.r(0.35) - UI.r(0.2)
	var y := fw + UI.r(0.3)
	var fs := roundi(UI.r(0.875))
	var f := UI.spaced("p700", fs, 0.06)
	var sfs := roundi(UI.r(0.6875))
	var sf := UI.font("600")
	var ids: Array = SimGear.gear_ids_for(slot)
	var n := "%d items" % ids.size()
	var nw := UI.text_w(sf, n, sfs)
	var base := y + roundf(f.get_ascent(fs))
	var title := Rich.layout([Rich.run((SimGear.SLOT_NAMES[slot] as String).to_upper(), f, fs, UI.GOLD_HI, "drop")], x1 - x0 - nw - UI.c(6), fs, 1)
	title.draw(ci, Vector2(x0, y))
	ci.draw_string(sf, Vector2(x1 - nw, base), n, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)
	var ly := y + fs + UI.r(0.25)
	ci.draw_rect(Rect2(fw + UI.r(0.35), ly, s.x - (fw + UI.r(0.35)) * 2, UI.px), UI.LINE)


func _build_tiles() -> void:
	_tiles.clear()
	var w := _items.size.x
	if w < 2: return
	var p := float(UI.px)
	var gap := UI.c(4)
	var pad := UI.c(2)
	var cols := maxi(1, floori((w - pad * 2 + gap) / (UI.r(3.9) + gap)))
	var tw := floorf((w - pad * 2 - gap * (cols - 1)) / cols)
	var fs := roundi(UI.r(0.625))
	var f := UI.font("600")
	var lh := roundf(fs * 1.1)
	var ids: Array = ([] if slot == "main" else [null]) + SimGear.gear_ids_for(slot)
	var y := pad
	var i := 0
	while i < ids.size():
		var row := []
		var lines := 1
		for k in cols:
			if i + k >= ids.size(): break
			var id = ids[i + k]
			var on: bool = c["gear"].get(slot) == id
			var g = SimGear.gear_of(id) if id != null else null
			var col := UI.GOLD_HI if on else (UI.TEXT if g != null else UI.MUTED)
			var name := Rich.layout([Rich.run(g["name"] if g != null else "None", f, fs, col, "drop")], tw - p * 2 - UI.c(2), lh, 2)
			lines = maxi(lines, name.lines.size())
			row.append({"id": id, "name": name, "x": pad + k * (tw + gap)})
		var th := p * 2 + UI.c(4) + UI.r(2.4) + UI.c(3) + lines * lh + UI.c(5)
		for t in row:
			t["rect"] = Rect2(t["x"], y, tw, th)
			_tiles.append(t)
		y += th + gap
		i += cols
	_items.set_content_h(y - gap + UI.c(4))
	_items.queue_redraw()


func _on_tile_tap(pos: Vector2) -> void:
	for t in _tiles:
		if (t["rect"] as Rect2).has_point(pos):
			if t["id"] != null: _choose(t["id"])
			else: _equip(null)
			return


func _paint_tiles(ci: CanvasItem, s: Vector2, off: float) -> void:
	var p := float(UI.px)
	var cursor = null
	for t in _tiles:
		var r: Rect2 = (t["rect"] as Rect2)
		if r.end.y < off - p * 6 or r.position.y > off + s.y + p * 6: continue
		r.position.y -= off
		var id = t["id"]
		var g = SimGear.gear_of(id) if id != null else null
		var on: bool = c["gear"].get(slot) == id
		var picked: bool = id != null and pick == id and not on
		var rc: Color = UI.GEAR_RC[g["rarity"]] if g != null else PLAIN_RC
		ci.draw_rect(r, UI.INK)
		var inner := r.grow(-p)
		if on:
			ci.draw_rect(inner, Color("#4a3410"))
			_ring(ci, inner, UI.GOLD, p)
			cursor = r
		elif picked:
			ci.draw_rect(inner, Color("#3a2d62"))
			_ring(ci, inner, UI.TEXT, p)
		else:
			ci.draw_rect(inner, Color("#2a2046"))
			ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p)), Color("#4e3f80"))
		ci.draw_rect(Rect2(inner.position.x + (p if on or picked else 0.0), inner.end.y - p * 2, inner.size.x - (p * 2 if on or picked else 0.0), p * 2), rc)
		var name: Rich.Layout = t["name"]
		var ss := UI.r(2.4)
		var content := ss + UI.c(3) + name.h
		var y0 := roundf(inner.position.y + UI.c(4) + (inner.size.y - UI.c(4) - UI.c(5) - content) / 2.0)
		var sr := Rect2(roundf(r.get_center().x - ss / 2.0), y0, ss, ss)
		_socket(ci, sr, rc.lerp(UI.INK, 0.45))
		var ir := Rect2(sr.get_center() - Vector2.ONE * UI.r(2.15) / 2.0, Vector2.ONE * UI.r(2.15))
		if id != null: _icon(ci, id, _skin_map().get(id), ir, _items.queue_redraw)
		else: ci.draw_rect(Rect2(roundf(sr.get_center().x - ir.size.x * 0.2), roundf(sr.get_center().y), roundf(ir.size.x * 0.4), p), UI.LINE)
		name.draw(ci, Vector2(inner.position.x + p, sr.end.y + UI.c(3)), 0.5, inner.size.x - p * 2)
		if on:
			var k := UI.r(0.8)
			UI.check_mark(ci, Rect2(r.end.x - p * 2 - k, r.position.y + p * 2, k, k), UI.GOLD_HI)
	if cursor != null: _cursor(ci, cursor)


# --- Item card -----------------------------------------------------------------------------------

## The picked item's card: head with Equip, the stats and skills scroll, skins along the bottom.
func _build_card() -> void:
	var s := _card.size
	if s.x < 2: return
	var p := float(UI.px)
	var fw := UI.frame_w("gold")
	var inner := Rect2(fw + UI.r(0.35), fw + UI.r(0.3), s.x - fw * 2 - UI.r(0.35) * 2, s.y - fw * 2 - UI.r(0.3) - UI.r(0.35))
	var key = _card_m.get("key", "")
	_card_m = {"key": key, "inner": inner}
	_blocks.clear()
	_cells.clear()
	_has_epic_cell = false
	_deco.position = Vector2.ZERO
	_deco.size = s
	if pick == null:
		_empty_card(inner)
		for n in [_sock, _act, _body, _skins, _info_btn]: n.visible = false
		_deco.queue_redraw()
		return
	_sock.visible = true
	_body.visible = true
	var id: String = pick
	var g: Dictionary = SimGear.gear_of(id)
	var on: bool = c["gear"].get(slot) == id
	var cur = _skin_of(id)
	var shown = peek if peek != null else cur

	# Head: the big icon, name and tags, Equip (or Unequip).
	if on:
		if slot != "main":
			_act.set_text("Unequip")
			_act.set_glyph("")
			_act.style = "ghost"
			_act.size_kind = "sm"
			_act.font_rem = 0.0
			_act.min_w = 0.0
			_act.min_h = 0.0
			_act.visible = true
		else:
			_act.visible = false
	else:
		_act.set_text("Equip")
		_act.set_glyph("check")
		_act.style = "primary"
		_act.size_kind = ""
		_act.font_rem = 0.875
		_act.min_w = 5.6
		_act.min_h = 2.2
		_act.visible = true
	_act.refit()
	_act.size = _act.custom_minimum_size
	var ss := UI.r(2.9)
	var tx := inner.position.x + ss + UI.c(5) + UI.c(4)
	var tw := (inner.end.x - (_act.size.x + UI.c(5) if _act.visible else 0.0)) - tx
	var tfs := roundi(UI.r(1.0))
	var title := Rich.layout([Rich.run(g["name"], UI.font("p700"), tfs, UI.GOLD_HI if on else UI.TEXT, "drop")], tw, roundf(tfs * 1.05), 2)
	var sfs := roundi(UI.r(0.625))
	var sf := UI.spaced("700", sfs, 0.08)
	var slh := roundf(sfs * 1.2)
	var gl := UI.glyph_size(UI.r(0.75))
	var tags := []
	if on:
		tags.append(Rich.layout([Rich.box(gl + UI.c(4), gl, func(ci2, r): UI.draw_glyph(ci2, "check", r.position, gl, UI.GOLD)), Rich.run("EQUIPPED", sf, sfs, UI.GOLD)], tw, slh, 1))
	var w = g.get("weapon")
	var hands := ""
	if w is Dictionary:
		hands = "fists" if w.get("fists") else ("2-hand" if int(w.get("hands", 1)) == 2 else "1-hand")
		if w.get("ranged"): hands += " · ranged"
	else:
		hands = SimGear.SLOT_NAMES[slot]
	tags.append(Rich.layout([Rich.run((g["rarity"] as String).to_upper(), sf, sfs, UI.GEAR_TEXT[g["rarity"]]), Rich.run(" · " + hands.to_upper(), sf, sfs, UI.MUTED)], tw, slh, 2))
	if shown != null:
		var kf := UI.spaced("700", sfs, 0.02)
		var kc: Color = SKIN_TEXT[shown["rarity"]]
		tags.append(Rich.layout([Rich.box(gl + UI.c(4), gl, func(ci2, r): UI.draw_glyph(ci2, "star", r.position, gl, kc)), Rich.run(shown["name"], kf, sfs, kc)], tw, slh, 1))
	var col_h := title.h
	for t in tags: col_h += UI.c(4) + t.h
	var head_h := maxf(maxf(ss, col_h), _act.size.y if _act.visible else 0.0)
	var hy := inner.position.y
	_card_m["sock"] = Rect2(inner.position.x, roundf(hy + (head_h - ss) / 2.0), ss, ss)
	_card_m["title"] = [title, Vector2(tx, roundf(hy + (head_h - col_h) / 2.0))]
	_card_m["tags"] = tags
	_card_m["on"] = on
	_card_m["shown"] = shown
	_card_m["rc"] = UI.GEAR_RC[g["rarity"]]
	_card_m["epic_sock"] = shown != null and shown["rarity"] == "epic"
	_card_m["head_line"] = hy + head_h + UI.r(0.3)
	_sock.position = Vector2.ZERO
	_sock.size = s
	_sock.queue_redraw()
	if _act.visible: _act.position = Vector2(inner.end.x - _act.size.x, roundf(hy + (head_h - _act.size.y) / 2.0))

	# Foot: the skins and the line under them.
	var skins: Array = CharacterSkins.skins_for(id)
	var foot_h := 0.0
	_info_btn.visible = false
	_skins.visible = not skins.is_empty()
	if not skins.is_empty():
		foot_h = _build_foot(id, skins, cur, inner)

	# Body: what it gives, skills, description.
	var body_top: float = _card_m["head_line"] + p
	_body.position = Vector2(inner.position.x, body_top)
	_body.size = Vector2(inner.size.x, inner.end.y - foot_h - body_top)
	_build_body(g, on, inner.size.x - UI.c(2) * 2)
	_deco.queue_redraw()


func _empty_card(inner: Rect2) -> void:
	var w := minf(UI.r(20), inner.size.x - UI.r(2))
	var tfs := roundi(UI.r(1.1))
	var fs := roundi(UI.r(0.8125))
	var a := Rich.layout([Rich.run("%s: empty" % SimGear.SLOT_NAMES[slot], UI.font("p700"), tfs, UI.GOLD_HI, "drop")], w, roundf(tfs * 1.1))
	var b := Rich.layout([Rich.run(SLOT_INFO[slot], UI.font("500"), fs, UI.TEXT)], w, roundf(fs * 1.35))
	var m := Rich.layout([Rich.run("Pick an item from the list to see what it does.", UI.font("500"), fs, UI.MUTED)], w, roundf(fs * 1.35))
	var h := a.h + b.h + m.h + UI.c(8) * 2
	_card_m["empty"] = [a, b, m, Vector2(inner.get_center().x - w / 2.0, roundf(inner.get_center().y - h / 2.0)), w]


func _build_foot(id: String, skins: Array, cur, inner: Rect2) -> float:
	var p := float(UI.px)
	var got := 0
	for sk in skins: if CharacterCollection.owns(sk["id"]): got += 1
	# Cells: the plain item, then its skins.
	var cell := UI.c(3) * 2 + p * 2 + UI.r(2.2)
	var gap := UI.c(4)
	var x := UI.c(1)
	var all: Array = [null] + skins
	for sk in all:
		_cells.append({"skin": sk, "rect": Rect2(x, UI.c(1), cell, cell)})
		if sk != null and sk["rarity"] == "epic": _has_epic_cell = true
		x += cell + gap
	var row_h := UI.c(1) + cell + UI.c(3)
	# The line under them, and its button (Shop for a locked skin, Equip set).
	var fs := roundi(UI.r(0.75))
	var lh := roundf(fs * 1.3)
	var f := UI.font("500")
	var bf := UI.font("700")
	var runs := []
	var act = null
	var act_text := ""
	var act_glyph := ""
	if peek != null and skins.has(peek):
		var set_ = CharacterSkins.SKIN_SET_BY_ID.get(peek.get("set")) if peek.get("set") != null else null
		runs = [_skin_run(peek, bf, fs), Rich.run(" ", f, fs, UI.MUTED), Rich.run("Locked.", bf, fs, UI.GOLD),
			Rich.run(" Find it in a skin chest%s." % (", part of the %s set" % set_["name"] if set_ != null else ""), f, fs, UI.MUTED)]
		act = "shop"
		act_text = "Shop"
		act_glyph = "shop"
	elif cur == null:
		runs = [Rich.run("Default look", bf, fs, UI.TEXT), Rich.run(" · %d/%d unlocked. Looks only." % [got, skins.size()], f, fs, UI.MUTED)]
	elif cur.get("set") == null:
		runs = [_skin_run(cur, bf, fs), Rich.run(" · %s. %s" % [CharacterSkins.RARITY_NAME[cur["rarity"]], CharacterSkins.RARITY_INFO[cur["rarity"]]], f, fs, UI.MUTED)]
	else:
		var set_: Dictionary = CharacterSkins.SKIN_SET_BY_ID[cur["set"]]
		var pieces: Array = CharacterSkins.set_pieces(set_["id"])
		var n := pieces.size()
		var worn := _set_worn(set_["id"])
		var have := 0
		for pc in pieces: if CharacterCollection.owns(pc["id"]): have += 1
		var pip := UI.c(6)
		var pips_w := n * pip + (n - 1) * UI.c(2) + UI.c(4)
		var full := worn == n
		runs = [_skin_run(cur, bf, fs), Rich.run(" · ", f, fs, UI.MUTED), Rich.run("%s set" % set_["name"], bf, fs, UI.TEXT, "", true), Rich.run(" ", f, fs, UI.MUTED),
			Rich.box(pips_w, pip, func(ci2: CanvasItem, r: Rect2):
				for i in n:
					var q := Rect2(r.position.x + UI.c(2) + i * (pip + UI.c(2)), r.position.y, pip, pip)
					if i < worn: ci2.draw_rect(q, UI.sweep_at(float(i) / n) if full else Color("#7ff0e0"))
					else:
						ci2.draw_rect(q, Color("#2a2140"))
						_ring(ci2, q, Color("#4a3a6a"), 1.0)),
			Rich.run(" " + ("Full set: aura on." if full else "%d/%d worn%s." % [worn, n, ", %d/%d owned" % [have, n] if have < n else ""]), f, fs, UI.MUTED)]
		if worn < n and have == n:
			act = "set:" + set_["id"]
			act_text = "Equip set"
			act_glyph = "bag"
	var info_w := inner.size.x
	if act != null:
		_info_btn.set_text(act_text)
		_info_btn.set_glyph(act_glyph)
		_info_btn.refit()
		_info_btn.size = _info_btn.custom_minimum_size
		_info_btn.visible = true
		info_w -= _info_btn.size.x + UI.c(6)
	var info := Rich.layout(runs, info_w, lh)
	var info_h := maxf(info.h, _info_btn.size.y if act != null else 0.0)
	var head_fs := roundi(UI.r(0.625))
	var head_h := head_fs + UI.c(4)
	var foot_h := UI.r(0.15) + p + UI.r(0.3) + head_h + UI.c(3) + row_h + UI.c(3) + info_h
	var y0 := inner.end.y - foot_h
	_card_m["foot"] = {"y": y0, "head_h": head_h, "got": "%d/%d" % [got, skins.size()], "info": info, "info_at": Vector2(inner.position.x, roundf(inner.end.y - info_h + (info_h - info.h) / 2.0))}
	_card_m["info_act"] = act
	var ry := y0 + UI.r(0.15) + p + UI.r(0.3) + head_h + UI.c(3)
	_skins.position = Vector2(inner.position.x, ry)
	_skins.size = Vector2(inner.size.x, row_h)
	_skins.set_content_h(x - gap + UI.c(1))
	_skins.queue_redraw()
	if act != null: _info_btn.position = Vector2(inner.end.x - _info_btn.size.x, roundf(inner.end.y - info_h + (info_h - _info_btn.size.y) / 2.0))
	return foot_h


func _skin_run(sk: Dictionary, f: Font, fs: int) -> Dictionary:
	var name: String = sk["name"]
	if sk["rarity"] == "epic": return Rich.run(name, f, fs, UI.TEXT, "", true)
	return Rich.run(name, f, fs, SKIN_RC.get(sk["rarity"], UI.TEXT))


## The card's middle: stat changes, skills and the description, as blocks in a scroll.
func _build_body(g: Dictionary, on: bool, w: float) -> void:
	var p := float(UI.px)
	var y := UI.r(0.3)
	var gap := UI.c(4)
	var x := UI.c(2)
	var fs := roundi(UI.r(0.6875))
	var f := UI.font("500")
	var bf := UI.font("700")
	# Equipped: what the item gives (against the slot left empty). Not equipped: what would change.
	var from: Dictionary = c["gear"] if (on and slot == "main") else (SimLoadout.with_gear(c, slot, null)["gear"] if on else c["gear"])
	var to: Dictionary = c["gear"] if on else SimLoadout.with_gear(c, slot, pick)["gear"]
	var abil: Array = (g.get("abilities", []) as Array).duplicate() if g.get("abilities") is Array else []
	if g.get("evade") is Dictionary: abil.append(g["evade"])
	var bare := on and slot == "main"
	var moved := [] if bare else _compare(from, to)
	var mods := mod_text(g.get("add"), g.get("mul"), null if bare else LINES.map(func(l): return l[0]))
	if not (bare and mods == ""):
		y = _add_sub("Bonuses" if bare else ("What it gives you" if on else "If you equip it"), x, y, w) + gap
	if not moved.is_empty():
		y = _add_stats(moved, x, y, w) + gap
	elif mods == "" and not bare:
		var t := Rich.layout([Rich.run("No stat bonus." if on else "No stat changes.", f, roundi(UI.r(0.75)), UI.MUTED)], w, roundf(UI.r(0.75) * 1.3))
		y = _add_text(t, x, y) + gap
	if mods != "":
		y = _add_text(Rich.layout([Rich.run(mods, UI.font("600"), fs, UI.GREEN)], w, roundf(fs * 1.3)), x, y) + gap
	if not abil.is_empty() or g.get("passive"):
		y = _add_sub("Skills", x, y, w) + gap
	for a in abil:
		var tag := ""
		if a.get("slot") == "basic": tag = "Basic"
		elif a.get("uses"): tag = "%s uses" % UI.num(a["uses"])
		elif a.get("cooldown"): tag = "%ss" % UI.num(a["cooldown"])
		y = _add_ability(a["name"], tag, a.get("desc", ""), UI.GOLD, x, y, w) + gap
	if g.get("passive"):
		y = _add_ability("Passive", "", g["passive"], UI.CYAN, x, y, w) + gap
	var it := _italic()
	y = _add_text(Rich.layout([Rich.run(g.get("desc", ""), it, fs, Color(UI.TEXT, 0.8))], w, roundf(fs * 1.35)), x, y)
	_body.set_content_h(y + UI.r(0.4))
	_body.scroll_to(_body.offset)
	_body.queue_redraw()


static var _it: Font

## Rubik slanted (the web's italic description).
static func _italic() -> Font:
	if _it != null: return _it
	var v := FontVariation.new()
	v.base_font = UI.font("500")
	v.variation_transform = Transform2D(Vector2(1, 0.2), Vector2(0, 1), Vector2.ZERO)
	_it = v
	return v


func _add_sub(text: String, x: float, y: float, w: float) -> float:
	var fs := roundi(UI.r(0.625))
	var t := Rich.layout([Rich.run(text.to_upper(), UI.spaced("700", fs, 0.12), fs, UI.GOLD)], w, fs)
	y += UI.c(2)
	_blocks.append({"y": y, "h": t.h, "draw": func(ci: CanvasItem, at: float): t.draw(ci, Vector2(x, at))})
	return y + t.h


func _add_text(t: Rich.Layout, x: float, y: float) -> float:
	_blocks.append({"y": y, "h": t.h, "draw": func(ci: CanvasItem, at: float): t.draw(ci, Vector2(x, at))})
	return y + t.h


func _add_ability(name: String, tag: String, desc: String, col: Color, x: float, y: float, w: float) -> float:
	var p := float(UI.px)
	var nfs := roundi(UI.r(0.8125))
	var tfs := roundi(UI.r(0.625))
	var fs := roundi(UI.r(0.6875))
	var tf := UI.font("700")
	var tag_w := (UI.text_w(tf, tag, tfs) + UI.c(5) * 2) if tag != "" else 0.0
	var iw := w - UI.c(7) * 2 - p * 2
	var nm := Rich.layout([Rich.run(name, UI.font("700"), nfs, col)], iw - tag_w - UI.c(6), roundf(nfs * 1.1), 1)
	var head_h := maxf(nm.h, roundf(tfs * 1.2) + UI.c(3))
	var d := Rich.layout([Rich.run(desc, UI.font("500"), fs, UI.MUTED)], iw, roundf(fs * 1.32)) if desc != "" else null
	var h := p * 2 + UI.c(4) + head_h + (UI.c(2) + d.h if d != null else 0.0) + UI.c(5)
	_blocks.append({"y": y, "h": h, "draw": func(ci: CanvasItem, at: float):
		var r := Rect2(x, at, w, h)
		ci.draw_rect(r, Color(0, 0, 0, 0.25))
		_ring(ci, r, Color("#3a2e5a"), p)
		var hx := x + p + UI.c(7)
		var hy := at + p + UI.c(4)
		nm.draw(ci, Vector2(hx, hy + roundf((head_h - nm.h) / 2.0)))
		if tag != "":
			var th := roundf(tfs * 1.2) + UI.c(3)
			var tr := Rect2(x + w - p - UI.c(7) - tag_w, hy + roundf((head_h - th) / 2.0), tag_w, th)
			ci.draw_rect(tr, Color(0, 0, 0, 0.4))
			ci.draw_string(tf, Vector2(tr.position.x + UI.c(5), roundf(tr.position.y + UI.c(1) + (roundf(tfs * 1.2) + tf.get_ascent(tfs) - tf.get_descent(tfs)) / 2.0)), tag, HORIZONTAL_ALIGNMENT_LEFT, -1, tfs, UI.CYAN)
		if d != null: d.draw(ci, Vector2(hx, hy + head_h + UI.c(2)))})
	return y + h


## Stat cells (the web's statCompare with only the stats that move).
func _compare(from: Dictionary, to: Dictionary) -> Array:
	var a = SimLoadout.compute_base_stats(c["form"], from, c.get("train"))
	var b = SimLoadout.compute_base_stats(c["form"], to, c.get("train"))
	var out := []
	for l in LINES:
		var x := float(a[l[0]])
		var y := float(b[l[0]])
		if fmt(x, l[2]) == fmt(y, l[2]): continue
		var d := ""
		if l[2] == 1: d = str(roundi(y * 100.0) - roundi(x * 100.0))
		elif l[2] == 2: d = UI.num(roundf((y - x) * 10.0) / 10.0)
		else: d = str(roundi(y) - roundi(x))
		if not d.begins_with("-"): d = "+" + d
		if l[2] == 1: d += "%"
		out.append({"label": l[1], "val": fmt(y, l[2]), "d": d, "up": y > x})
	return out


func _add_stats(cells: Array, x: float, y: float, w: float) -> float:
	var p := float(UI.px)
	var cols := 3 if w >= UI.r(30) else 2
	var gap := UI.c(3)
	var cw := floorf((w - gap * (cols - 1)) / cols)
	var fs := roundi(UI.r(0.6875))
	var lh := roundf(fs * 1.2)
	var ch := UI.c(3) + lh + UI.c(4)
	var rows := ceili(cells.size() / float(cols))
	var f := UI.font("500")
	var bf := UI.font("700")
	var h := rows * ch + (rows - 1) * gap
	_blocks.append({"y": y, "h": h, "draw": func(ci: CanvasItem, at: float):
		for i in cells.size():
			var cl: Dictionary = cells[i]
			var r := Rect2(x + (i % cols) * (cw + gap), at + floori(i / cols) * (ch + gap), cw, ch)
			var tone := UI.GREEN if cl["up"] else UI.RED
			ci.draw_rect(r, Color(0, 0, 0, 0.3))
			ci.draw_rect(r, Color(tone, 0.1))
			ci.draw_rect(Rect2(r.position, Vector2(p * 2, r.size.y)), tone)
			var base := roundf(r.position.y + UI.c(3) + (lh + f.get_ascent(fs) - f.get_descent(fs)) / 2.0)
			var vw := UI.text_w(bf, cl["val"], fs)
			var dw := UI.text_w(bf, cl["d"], fs)
			var x1 := r.end.x - UI.c(6)
			ci.draw_string(bf, Vector2(x1 - dw, base), cl["d"], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, tone)
			UI.draw_text(ci, bf, Vector2(x1 - dw - UI.c(6) - vw, base), cl["val"], fs, tone)
			var lw := x1 - dw - UI.c(6) - vw - UI.c(6) - (r.position.x + p * 2 + UI.c(6))
			var lab := Rich.layout([Rich.run(cl["label"], f, fs, UI.MUTED)], lw, lh, 1)
			lab.draw(ci, Vector2(r.position.x + p * 2 + UI.c(6), r.position.y + UI.c(3)))})
	return y + h


## One-line summary of a gear piece's stat changes, e.g. "+10 armor · +6% attack speed".
static func mod_text(add, mul, skip) -> String:
	var out := []
	if add is Dictionary:
		for k in add:
			if not MOD_NAMES.has(k) or (skip != null and skip.has(k)): continue
			var v := float(add[k])
			var sgn := "+" if v >= 0 else ""
			out.append(("%s%d%% %s" % [sgn, roundi(v * 100.0), MOD_NAMES[k]]) if MOD_PCT.has(k) else ("%s%d %s" % [sgn, roundi(v), MOD_NAMES[k]]))
	if mul is Dictionary:
		for k in mul:
			if not MOD_NAMES.has(k) or (skip != null and skip.has(k)): continue
			var d := roundi((float(mul[k]) - 1.0) * 100.0)
			if d != 0: out.append("%s%d%% %s" % ["+" if d > 0 else "", d, MOD_NAMES[k]])
	return " · ".join(out)


func _paint_body(ci: CanvasItem, s: Vector2, off: float) -> void:
	for b in _blocks:
		var y: float = b["y"] - off
		if y + b["h"] < 0.0 or y > s.y: continue
		b["draw"].call(ci, y)


## The card's static art: frame lines, head text, the skins header and the line under them.
func _paint_deco(ci: CanvasItem, _s: Vector2) -> void:
	var p := float(UI.px)
	var inner: Rect2 = _card_m.get("inner", Rect2())
	if _card_m.has("empty"):
		var e: Array = _card_m["empty"]
		var at: Vector2 = e[3]
		var w: float = e[4]
		var y := at.y
		for i in 3:
			var l: Rich.Layout = e[i]
			l.draw(ci, Vector2(at.x, y), 0.5, w)
			y += l.h + UI.c(8)
		return
	if not _card_m.has("title"): return
	var t: Array = _card_m["title"]
	var title: Rich.Layout = t[0]
	var at: Vector2 = t[1]
	title.draw(ci, at)
	var y := at.y + title.h
	for tag in _card_m["tags"]:
		y += UI.c(4)
		(tag as Rich.Layout).draw(ci, Vector2(at.x, y))
		y += tag.h
	ci.draw_rect(Rect2(inner.position.x, _card_m["head_line"], inner.size.x, p), UI.LINE)
	var foot = _card_m.get("foot")
	if foot == null: return
	var fy: float = foot["y"] + UI.r(0.15)
	ci.draw_rect(Rect2(inner.position.x, fy, inner.size.x, p), UI.LINE)
	fy += p + UI.r(0.3)
	var fs := roundi(UI.r(0.625))
	var f := UI.spaced("700", fs, 0.12)
	var gs := UI.glyph_size(UI.r(0.75))
	var hh: float = foot["head_h"]
	UI.draw_glyph(ci, "star", Vector2(inner.position.x, roundf(fy + (hh - gs) / 2.0)), gs, UI.GOLD)
	var hx := inner.position.x + gs + UI.c(5)
	var base := roundf(fy + (hh + f.get_ascent(fs) - f.get_descent(fs)) / 2.0)
	ci.draw_string(f, Vector2(hx, base), "SKINS", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.GOLD)
	hx += UI.text_w(f, "SKINS", fs) + UI.c(5)
	var cf := UI.spaced("700", fs, 0.04)
	var got: String = foot["got"]
	var cw := UI.text_w(cf, got, fs) + UI.c(5) * 2
	ci.draw_rect(Rect2(hx, fy, cw, hh), Color(0, 0, 0, 0.45))
	ci.draw_string(cf, Vector2(hx + UI.c(5), base), got, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.TEXT)
	(foot["info"] as Rich.Layout).draw(ci, foot["info_at"])


## The big icon in its socket (its own canvas item: a Mythic skin's edge sweeps).
func _paint_sock(ci: CanvasItem, _s: Vector2) -> void:
	if not _card_m.has("sock"): return
	var p := float(UI.px)
	var r: Rect2 = _card_m["sock"]
	var shown = _card_m["shown"]
	var rc: Color = _card_m["rc"]
	var edge: Color = rc.lerp(UI.INK, 0.25)
	if shown != null and SKIN_RC.has(shown["rarity"]): edge = SKIN_RC[shown["rarity"]]
	var epic: bool = _card_m["epic_sock"]
	var bw := p * 2 if epic else p
	if epic: UI.sweep_band(ci.get_canvas_item(), r, fmod(_t, 3.0) / 3.0 * 0.5)
	else: ci.draw_rect(r, edge)
	var inner := r.grow(-bw)
	ci.draw_rect(inner, Color("#0b0814"))
	UI.glow(ci.get_canvas_item(), inner.position + inner.size * Vector2(0.5, 0.6), inner.size * 0.7, Color(1, 1, 1, 0.12) if epic else Color(rc, 0.4))
	ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p * 3)), Color(0, 0, 0, 0.5))
	var k := UI.r(2.6)
	_icon(ci, pick, shown["id"] if shown != null else null, Rect2(r.get_center() - Vector2(k, k) / 2.0, Vector2(k, k)), _sock.queue_redraw)
	if _card_m["on"]:
		# The gold worn badge on the corner.
		var b := UI.rround(Rect2(r.end.x + UI.c(4) - UI.r(1.0), r.position.y - UI.c(4), UI.r(1.0), UI.r(1.0)))
		ci.draw_rect(b.grow(p), UI.INK)
		ci.draw_rect(b, UI.GOLD_HI)
		var gs := UI.glyph_size(UI.r(0.7))
		UI.draw_glyph(ci, "check", (b.get_center() - Vector2(gs, gs) / 2.0).round(), gs, UI.INK)


func _on_cell_tap(pos: Vector2) -> void:
	for cl in _cells:
		if (cl["rect"] as Rect2).grow(UI.c(2)).has_point(pos):
			_wear(pick, cl["skin"])
			return


func _paint_cells(ci: CanvasItem, s: Vector2, off: float) -> void:
	if pick == null: return
	var p := float(UI.px)
	var cur = _skin_of(pick)
	var phase := fmod(_t, 3.0) / 3.0 * 0.5
	for cl in _cells:
		var r: Rect2 = cl["rect"]
		r.position.x -= off
		if r.end.x < 0.0 or r.position.x > s.x: continue
		var sk = cl["skin"]
		var sel: bool = (cur["id"] if cur != null else null) == (sk["id"] if sk != null else null)
		var locked: bool = sk != null and not CharacterCollection.owns(sk["id"])
		var trying: bool = sk != null and peek != null and peek["id"] == sk["id"]
		ci.draw_rect(r, UI.INK)
		var inner := r.grow(-p)
		ci.draw_rect(inner, Color("#4a3410") if sel else Color("#1c1530"))
		var bottom := Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2)
		if sk != null and sk["rarity"] == "epic": UI.sweep_band(ci.get_canvas_item(), bottom, phase)
		else: ci.draw_rect(bottom, SKIN_RC.get(sk["rarity"], PLAIN_RC) if sk != null else PLAIN_RC)
		if sel: _ring(ci, Rect2(inner.position, inner.size - Vector2(0, p * 2)), UI.GOLD, p)
		var ic := UI.r(2.2)
		var ir := Rect2(roundf(r.get_center().x - ic / 2.0), r.position.y + p + UI.c(3), ic, ic)
		ci.draw_rect(ir, Color("#0b0814"))
		ci.draw_rect(Rect2(ir.position, Vector2(ir.size.x, p)), Color("#05030a"))
		var k := UI.r(2.0)
		_icon(ci, pick, sk["id"] if sk != null else null, Rect2(ir.get_center() - Vector2(k, k) / 2.0, Vector2(k, k)), _skins.queue_redraw, UI.LOCKED if locked and not trying else Color.WHITE)
		if locked:
			var ls := UI.glyph_size(UI.r(0.8))
			UI.draw_glyph(ci, "lock", Vector2(ir.end.x - ls - 1, ir.end.y - ls - 1), ls, UI.GOLD, UI.INK)
		if sel:
			var m := UI.r(0.7)
			UI.check_mark(ci, Rect2(r.end.x - UI.c(3) - m, r.position.y + UI.c(3), m, m), UI.GOLD_HI)
		if trying:
			var d := inner.grow(-UI.c(3) + p)
			var dash := p * 2
			var xx := d.position.x
			while xx < d.end.x:
				ci.draw_rect(Rect2(xx, d.position.y, minf(dash, d.end.x - xx), p), UI.GOLD)
				ci.draw_rect(Rect2(xx, d.end.y - p, minf(dash, d.end.x - xx), p), UI.GOLD)
				xx += dash * 2
			var yy := d.position.y
			while yy < d.end.y:
				ci.draw_rect(Rect2(d.position.x, yy, p, minf(dash, d.end.y - yy)), UI.GOLD)
				ci.draw_rect(Rect2(d.end.x - p, yy, p, minf(dash, d.end.y - yy)), UI.GOLD)
				yy += dash * 2
