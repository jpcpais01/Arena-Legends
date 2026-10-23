class_name ShopScreen
extends Control
## The Shop's offers (the web's ui/shop.ts): today's featured Mythic set worn by
## your fighter at a deep discount, and shelves picked on tabs: six skins that
## change every day, entrances, finishers and victory poses (tap one to watch it
## on the featured stage), and every other set priced by the pieces you still
## miss. A price asks once more ("Buy?") before paying, and a buy pops up what it
## unlocked with a button to wear or use it. Chests and the Forge are the other tabs.
##
## The shelves are custom-drawn in one scroller (offers, prices and all), so a
## long shelf costs one canvas item and taps are hit-tested.

signal closed
signal tab(id: String)
signal equip(skin)
signal equip_set(set_id: String)
signal entrance(id: String)
signal finisher(id: String)
signal pose(id: String)

const SHELVES := [["daily", "Daily skins", "New ones every day."], ["ent", "Entrances", "Tap one to watch it on the stage."], ["fin", "Finishers", "Tap one to watch it on the stage."], ["pose", "Poses", "Victory poses: tap one to watch it on the stage."], ["sets", "Mythic sets", "Pay only for the pieces you miss."]]
## The shelf the shop opens on: the one last looked at (this session).
static var last_shelf := "daily"

var player_fn: Callable
var head: ShopKit.Head
var shelf := "daily"
var day := 0.0
var _code: PxButton
var _feat: UI.Paint
var _rays: UI.Paint
var _feat_info: UI.Paint
var _preview: FighterPreview
var _feat_ribbon: Ribbon
var _feat_buy: ShopKit.Btn
var _feat_equip: PxButton
var _offer: Dictionary
var _shelves: UI.Paint
var _tabs: UI.Pad
var _body: ScrollView
## Shelf items (content px): {rect, kind, id, ...} and their buttons {rect, key, price, label, act}.
var _items: Array = []
var _btns: Array = []
var _armed := ""
var _arm_t := 0.0
var _peek := ""
var _t := 0.0
var _tick := 0.0
var _sheets: Array[Sheet] = []
var _unlisten: Callable
# Layout (device px).
var _head_h := 0.0
var _feat_m := {}
var _tab_rects: Array = []


func _init(player: Callable) -> void:
	player_fn = player
	shelf = last_shelf
	day = CharacterShop.shop_day()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED

	_feat = UI.Paint.new(_paint_feat)
	add_child(_feat)
	_rays = UI.Paint.new(_paint_rays)
	_rays.clip_contents = true
	_feat.add_child(_rays)
	_preview = FighterPreview.new(null, 72, 78, {"pedestal": true, "autoplay": true})
	_feat.add_child(_preview)
	_feat_info = UI.Paint.new(_paint_feat_info)
	_feat.add_child(_feat_info)
	_feat_ribbon = Ribbon.new("Featured set", 0.875)
	_feat.add_child(_feat_ribbon)
	_feat_buy = ShopKit.Btn.new([], "primary")
	_feat_buy.between = true
	_feat_buy.glint = true
	_feat_buy.font_rem = 0.95
	_feat_buy.min_h = 2.5
	_feat_buy.min_w = 9.0
	_feat_buy.pressed.connect(_on_feat_buy)
	_feat.add_child(_feat_buy)
	_feat_equip = PxButton.new("Equip set", "bag", "primary")
	_feat_equip.pressed.connect(func(): _ask_equip(_offer))
	_feat.add_child(_feat_equip)

	_shelves = UI.Paint.new(func(ci: CanvasItem, s: Vector2): _frame(ci, s))
	add_child(_shelves)
	_tabs = UI.Pad.new(_paint_tabs)
	_tabs.tapped.connect(_on_tab_tap)
	_shelves.add_child(_tabs)
	_body = ScrollView.new(_paint_body)
	_body.tapped.connect(_on_body_tap)
	_shelves.add_child(_body)

	_code = PxButton.new("Code", "tag")
	_code.min_h = 2.1
	_code.glyph_col = UI.GOLD
	_code.pressed.connect(_open_promo)
	head = ShopKit.Head.new("offers", [_code])
	head.admin = CharacterPromo.is_admin()
	head.tab.connect(func(id: String): tab.emit(id))
	head.done.connect(close)
	add_child(head)
	_unlisten = CharacterCollection.on_collection(_on_collection)
	resized.connect(_layout)


func _ready() -> void:
	_featured()
	_layout()


func _exit_tree() -> void:
	_unlisten.call()


func close() -> void:
	Sfx.sfx.play("back")
	closed.emit()


## Back: closes a popup over the shop, or the shop.
func back() -> void:
	for i in range(_sheets.size() - 1, -1, -1):
		var s := _sheets[i]
		if is_instance_valid(s) and s._closing < 0.0:
			s.close()
			return
	close()


func _open_sheet(s: Sheet) -> void:
	_sheets.append(s)
	s.closed.connect(func(): _sheets.erase(s))
	add_child(s)


func _on_collection() -> void:
	head.count_to(CharacterCollection.gems())
	head.admin = CharacterPromo.is_admin()
	head.relayout()
	_featured()
	_render()


func _process(dt: float) -> void:
	_t += dt
	_tick += dt
	if _tick >= 30.0:
		_tick = 0.0
		if CharacterShop.shop_day() != day:
			day = CharacterShop.shop_day()
			_featured()
			_render()
	if _armed != "":
		_arm_t -= dt
		if _arm_t <= 0.0: _disarm()
	_rays.queue_redraw()
	_feat_info.queue_redraw()
	# Mythic sweeps and the armed blink.
	_body.queue_redraw()


# --- Layout ------------------------------------------------------------------------------------

func _layout() -> void:
	if size.x < 2: return
	var W := size.x
	var H := size.y
	var sl := roundf(W * 0.03)
	head.size = Vector2(W, head.height())
	head.relayout()
	_head_h = head.height()
	var col := maxf(UI.r(15), floorf(W * 0.37))
	var top := _head_h + UI.r(0.25)
	var bottom := H - UI.r(0.35)
	_feat.position = Vector2(sl, top)
	_feat.size = Vector2(col - sl - UI.r(0.25), bottom - top).round()
	_shelves.position = Vector2(col + UI.r(0.25), top).round()
	_shelves.size = Vector2(W - sl - _shelves.position.x, bottom - top).round()
	_layout_feat()
	_layout_shelves()


func _layout_feat() -> void:
	var s := _feat.size
	var fw := UI.frame_w("gold")
	var inner := Rect2(Vector2(fw, fw), s - Vector2(fw, fw) * 2)
	_rays.position = inner.position
	_rays.size = inner.size
	_feat_info.size = s
	var pad := Vector2(UI.r(0.45), UI.r(0.3))
	var gap := UI.r(0.25)
	var x0 := inner.position.x + pad.x
	var w := inner.size.x - pad.x * 2
	var y := inner.position.y + pad.y
	_feat_ribbon.size = _feat_ribbon.get_minimum_size()
	_feat_ribbon.position = Vector2(x0 - UI.px * 6, y).round()
	y += _feat_ribbon.size.y + gap
	# From the bottom up: the buy row, the pieces, the name.
	var by := inner.end.y - UI.r(0.45)
	for b in [_feat_buy, _feat_equip]:
		b.size = b.custom_minimum_size
	var bh := maxf(_feat_buy.size.y, _feat_equip.size.y)
	by -= bh
	# Too narrow for one line (CSS flex-wrap): the price sits on its own line above the button.
	var price_h := 0.0
	if _buy_wraps(w):
		price_h = roundf(UI.r(1.6))
		by -= price_h + UI.r(0.35)
	var name_fs := roundi(UI.r(1.15))
	var sock := UI.r(2.05)
	var py := by - gap - sock
	var ny := py - gap - name_fs - UI.px * 3
	_feat_m = {"x0": x0, "w": w, "buy_y": by, "buy_h": bh, "price_h": price_h, "pieces_y": py, "sock": sock, "name_y": ny, "name_fs": name_fs, "top": inner.position.y + pad.y}
	_preview.position = Vector2(x0, y)
	_preview.size = Vector2(w, maxf(UI.r(4), ny - gap - y)).round()
	_feat_m["stage"] = Rect2(_preview.position, _preview.size)
	_place_feat_buy()


## The buy row: the discount, the old price struck out, and the button (centred together).
func _place_feat_buy() -> void:
	if _feat_m.is_empty() or _offer.is_empty(): return
	var by: float = _feat_m["buy_y"]
	var bh: float = _feat_m["buy_h"]
	var cx: float = _feat_m["x0"] + _feat_m["w"] / 2.0
	var gap := UI.r(0.6)
	if (_offer["missing"] as Array).is_empty():
		var tag_w := _owned_w("Set owned")
		var total := tag_w + gap + _feat_equip.size.x
		_feat_equip.position = Vector2(roundf(cx - total / 2.0 + tag_w + gap), by + roundf((bh - _feat_equip.size.y) / 2.0))
		_feat_m["owned_x"] = roundf(cx - total / 2.0)
		return
	var price_w := _price_w()
	var price_h: float = _feat_m.get("price_h", 0.0)
	var x := roundf(cx - (price_w if price_h > 0 else price_w + gap + _feat_buy.size.x) / 2.0)
	_feat_m["off_x"] = x
	var off := _off_pct()
	if off > 0: x += _off_w(off) + gap
	_feat_m["was_x"] = x
	if price_h > 0:
		# Two lines: the price centred on top, the button centred under it.
		_feat_m["price_mid"] = by + price_h / 2.0
		_feat_buy.position = Vector2(roundf(cx - _feat_buy.size.x / 2.0), by + price_h + UI.r(0.35))
		return
	_feat_m["price_mid"] = by + bh / 2.0
	_feat_buy.position = Vector2(roundf(_feat_m["off_x"] + price_w + gap), by + roundf((bh - _feat_buy.size.y) / 2.0))


## The discount stamp and the old price, side by side.
func _price_w() -> float:
	var off := _off_pct()
	var was_w := ShopKit.gem_w(str(int(_offer["full"])), roundi(UI.r(0.9375)))
	return (_off_w(off) + UI.r(0.6) if off > 0 else 0.0) + was_w


func _buy_wraps(w: float) -> bool:
	if _offer.is_empty() or (_offer["missing"] as Array).is_empty(): return false
	return _price_w() + UI.r(0.6) + _feat_buy.size.x > w


func _off_pct() -> int:
	var full: float = _offer.get("full", 0.0)
	return roundi((1.0 - float(_offer["price"]) / full) * 100.0) if full > 0 else 0


func _off_w(off: int) -> float:
	var fs := roundi(UI.r(0.875))
	return UI.text_w(UI.spaced("700", fs, 0.08), "-%d%%" % off, fs) + UI.c(7) * 2 + UI.px * 2


func _owned_w(t: String) -> float:
	var fs := roundi(UI.r(0.8125))
	return UI.glyph_size(fs * 1.1) + fs * 0.3 + UI.text_w(UI.spaced("700", fs, 0.08), t.to_upper(), fs)


func _layout_shelves() -> void:
	var s := _shelves.size
	var fw := UI.frame_w("gold")
	var x0 := fw + UI.r(0.4)
	var w := s.x - x0 * 2
	var y := fw + UI.r(0.3)
	var th := UI.r(2.1)
	_tabs.position = Vector2(x0, y)
	_tabs.size = Vector2(w, th + UI.r(0.3) + UI.px)
	_tab_rects.clear()
	var gap := UI.c(4)
	var tw := (w - gap * (SHELVES.size() - 1)) / SHELVES.size()
	for i in SHELVES.size():
		_tab_rects.append(Rect2(roundf(i * (tw + gap)), 0, roundf(tw), th))
	y += _tabs.size.y + UI.r(0.3)
	_body.position = Vector2(x0, y)
	_body.size = Vector2(w, s.y - fw - UI.r(0.35) - y)
	_render()


# --- The featured set -------------------------------------------------------------------------------

## The build a set is shown on: your fighter (or a default one) wearing every piece.
func _wearing(o: Dictionary) -> Dictionary:
	var base = player_fn.call() if player_fn.is_valid() else null
	if base == null: base = SimLoadout.DEFAULT_BUILDS[0]
	var b: Dictionary = base
	var skins: Dictionary = (b.get("skins") if b.get("skins") is Dictionary else {}).duplicate()
	for p in o["pieces"]:
		b = SimLoadout.with_gear(b, SimGear.gear_of(p["gear"])["slot"], p["gear"])
		skins[p["gear"]] = p["id"]
	return TS.merge([b, {"skins": skins}])


func _featured() -> void:
	_offer = CharacterShop.set_offer(CharacterShop.featured_set(day), true)
	var key := JSON.stringify([_offer["set"]["id"], _wearing(_offer).get("gear"), _wearing(_offer).get("look")])
	if _preview.get_meta("key", "") != key:
		_preview.set_meta("key", key)
		_preview.set_build(_wearing(_offer))
		_peek = ""
	var missing: Array = _offer["missing"]
	var have: int = (_offer["pieces"] as Array).size() - missing.size()
	_feat_buy.visible = not missing.is_empty()
	_feat_equip.visible = missing.is_empty()
	_feat_buy.short = CharacterCollection.gems() < _offer["price"]
	if _armed != "feat": _feat_buy.set_parts([{"t": "Last %d" % missing.size() if have > 0 else "Buy set"}, {"gem": str(int(_offer["price"]))}])
	if not _feat_m.is_empty(): _layout_feat()


func _on_feat_buy() -> void:
	_arm_or_buy("feat", _offer["price"], func(): _buy_set(_offer))


func _paint_rays(ci: CanvasItem, s: Vector2) -> void:
	# The slow conic rays behind the featured set (CSS .shop-feat::before, 40 s a turn).
	var c := Vector2(s.x * 0.5, s.y * 0.46)
	var rad := s.length()
	var turn := fmod(_t, 40.0) / 40.0 * TAU
	var cy := Color(127 / 255.0, 240 / 255.0, 224 / 255.0, 0.1)
	var gd := Color(1, 216 / 255.0, 96 / 255.0, 0.08)
	var pk := Color(1, 122 / 255.0, 200 / 255.0, 0.08)
	for seg in [[6, 9, cy], [19, 22, gd], [31, 34, pk], [44, 47, cy], [56, 59, gd], [69, 72, pk], [81, 84, cy]]:
		# Conic angles start at the top and go clockwise.
		var a0: float = deg_to_rad(seg[0] * 3.6) + turn - PI / 2.0
		var a1: float = deg_to_rad(seg[1] * 3.6) + turn - PI / 2.0
		ci.draw_colored_polygon(PackedVector2Array([c, c + Vector2(cos(a0), sin(a0)) * rad, c + Vector2(cos(a1), sin(a1)) * rad]), seg[2])
	var st: Rect2 = _feat_m.get("stage", Rect2())
	if st.size.x > 0:
		var sc := st.position - _rays.position
		UI.glow(ci.get_canvas_item(), sc + Vector2(st.size.x * 0.5, st.size.y * 0.78), Vector2(st.size.x * 0.5, st.size.y * 0.4) * 0.75, Color(127 / 255.0, 240 / 255.0, 224 / 255.0, 0.22))


func _paint_feat(ci: CanvasItem, s: Vector2) -> void:
	_frame(ci, s)


func _paint_feat_info(ci: CanvasItem, s: Vector2) -> void:
	if _feat_m.is_empty() or _offer.is_empty(): return
	var x0: float = _feat_m["x0"]
	var w: float = _feat_m["w"]
	var cx := x0 + w / 2.0
	var p := float(UI.px)
	# The timer: when the offers turn over.
	var tfs := roundi(UI.r(0.75))
	var tf := UI.spaced("700", tfs, 0.06)
	var tt := _countdown(CharacterShop.ms_to_rotation()).to_upper()
	var gs := UI.glyph_size(tfs * 1.0)
	var rmid: float = _feat_ribbon.position.y + (_feat_ribbon.size.y - p * 3) / 2.0
	var tx := x0 + w - UI.text_w(tf, tt, tfs)
	UI.draw_text(ci, tf, Vector2(tx, ShopKit.base_at(tf, tfs, rmid)), tt, tfs, UI.MUTED)
	UI.draw_glyph(ci, "replay", Vector2(tx - gs - tfs * 0.3, roundf(rmid - gs / 2.0)), gs, UI.GOLD)
	# The set's name in the Mythic sweep.
	var nfs: int = _feat_m["name_fs"]
	var nf := UI.spaced("p700", nfs, 0.04)
	var name: String = _offer["set"]["name"]
	var ny: float = _feat_m["name_y"]
	var nw := UI.text_w(nf, name, nfs)
	ShopKit.sweep_text(ci, nf, Vector2(roundf(cx - nw / 2.0), ny + nf.get_ascent(nfs)), name, nfs, ShopKit.sweep_phase(), "outline")
	# The pieces, owned ones ticked.
	var pieces: Array = _offer["pieces"]
	var sock: float = _feat_m["sock"]
	var pw := pieces.size() * sock + (pieces.size() - 1) * UI.c(3)
	if pw > w:
		sock = floorf((w - (pieces.size() - 1) * UI.c(3)) / pieces.size())
		pw = pieces.size() * sock + (pieces.size() - 1) * UI.c(3)
	var px0 := roundf(cx - pw / 2.0)
	for i in pieces.size():
		var r := Rect2(px0 + i * (sock + UI.c(3)), _feat_m["pieces_y"], sock, sock)
		_piece(ci, r, pieces[i])
	# The price row.
	var by: float = _feat_m["buy_y"]
	var mid: float = by + _feat_m["buy_h"] / 2.0
	if (_offer["missing"] as Array).is_empty():
		_owned_tag(ci, _feat_m.get("owned_x", x0), mid, "Set owned")
		return
	mid = _feat_m.get("price_mid", mid)
	var off := _off_pct()
	if off > 0:
		var ofs := roundi(UI.r(0.875))
		var k := fmod(_t, 2.4) / 2.4
		var pop := k > 0.8 and k < 0.9
		ShopKit.stamp(ci, Vector2(_feat_m["off_x"] + _off_w(off) / 2.0, mid), "-%d%%" % off, ofs, 3.0 if pop else -5.0, 1.08 if pop else 1.0, 1.0, Vector2(7, 3.5))
	var wfs := roundi(UI.r(0.9375))
	var wx: float = _feat_m["was_x"]
	var ww := ShopKit.gem_tag(ci, wx, mid, str(int(_offer["full"])), wfs, UI.DIM, Color("#7aa8b4"))
	ci.draw_rect(Rect2(wx, roundf(mid), ww, UI.c(2)), UI.RED)


func _piece(ci: CanvasItem, r: Rect2, sk: Dictionary) -> void:
	var p := float(UI.px)
	var mine := CharacterCollection.owns(sk["id"])
	UI.sock(ci.get_canvas_item(), r)
	if mine: _ring(ci, r, ShopKit.TIER_C["epic"], p)
	var ic = GearIcons.get_icon(sk["gear"], sk["id"], ci.queue_redraw)
	if ic != null: GearIcons.draw(ci, ic, Rect2(r.position + r.size * 0.09, r.size * 0.82))
	if mine:
		var d := Rect2(r.end.x - p * 3 + UI.c(2), r.end.y - p * 3 + UI.c(2), p * 3, p * 3)
		ci.draw_rect(d.grow(p), UI.INK)
		ci.draw_rect(d, UI.GREEN)


## "✓ OWNED" in green (CSS .owned-tag), its left edge at x, centred on mid.
func _owned_tag(ci: CanvasItem, x: float, mid: float, t: String) -> float:
	var fs := roundi(UI.r(0.8125))
	var f := UI.spaced("700", fs, 0.08)
	var gs := UI.glyph_size(fs * 1.1)
	UI.draw_glyph(ci, "check", Vector2(x, roundf(mid - gs / 2.0)), gs, UI.GREEN, UI.INK)
	UI.draw_text(ci, f, Vector2(x + gs + fs * 0.3, ShopKit.base_at(f, fs, mid)), t.to_upper(), fs, UI.GREEN)
	return _owned_w(t)


static func _countdown(ms: float) -> String:
	var m := maxi(1, ceili(ms / 60000.0))
	return "%dh %dm" % [m / 60, m % 60] if m >= 60 else "%dm" % m


# --- Buying ----------------------------------------------------------------------------------------

## A price asks once: the first tap arms it ("Buy?"), the second pays.
func _arm_or_buy(key: String, price: float, buy: Callable) -> void:
	if CharacterCollection.gems() < price:
		Sfx.sfx.play("back")
		if key == "feat": _feat_buy.nope()
		return
	if _armed != key:
		_disarm()
		_armed = key
		_arm_t = 2.6
		if key == "feat":
			_feat_buy.armed = true
			_feat_buy.set_parts([{"t": "Buy?"}, {"gem": str(int(price))}])
			_place_feat_buy()
		Sfx.sfx.play("select")
		_render()
		return
	_disarm()
	buy.call()


func _disarm() -> void:
	if _armed == "": return
	var was := _armed
	_armed = ""
	if was == "feat":
		_feat_buy.armed = false
		_featured()
	_render()


func _buy_set(o: Dictionary) -> void:
	var ids := []
	for p in o["missing"]: ids.append(p["id"])
	if not CharacterCollection.buy_skins(ids, o["price"]): return
	var set_id: String = o["set"]["id"]
	var got := _celebrate(o["pieces"], o["set"]["name"], "Equip set")
	got.use.connect(func(): _ask_equip(o, got))


func _buy_one(s: Dictionary) -> void:
	if not CharacterCollection.buy_skins([s["id"]], CharacterShop.SKIN_PRICE[s["rarity"]]): return
	var got := _celebrate([s], s["name"], "Equip")
	got.use.connect(func():
		equip.emit(s)
		got.mark("Equipped"))


## Equipping a set swaps every piece of the build, so it asks first.
func _ask_equip(o: Dictionary, got: GotSheet = null) -> void:
	var c := ConfirmSheet.new("Equip set?", "Swap your items for the %s pieces and wear their set skins? It replaces the gear you have on now." % o["set"]["name"], "Equip set", "bag")
	c.ok.connect(func():
		equip_set.emit(o["set"]["id"])
		Sfx.sfx.play("equip")
		if got != null and is_instance_valid(got): got.mark("Equipped"))
	_open_sheet(c)


func _celebrate(skins: Array, title: String, use_label: String) -> GotSheet:
	var top := 0
	for s in skins: top = maxi(top, ShopKit.rank(s["rarity"]))
	var tier: String = CharacterSkins.SKIN_RARITIES[top]
	Sfx.sfx.play(ShopKit.REVEAL[tier])
	var icons := []
	for s in skins: icons.append({"skin": s, "tier": s["rarity"]})
	var got := GotSheet.new(title, tier, icons, use_label, "bag")
	_open_sheet(got)
	return got


func _unlocked(e: Dictionary, glyph: String, use: Callable) -> void:
	var tier: String = e["tier"]
	Sfx.sfx.play("revealLegendary" if tier == "legendary" else ("revealMythic" if tier == "mythic" else "revealRare"))
	var got := GotSheet.new(e["name"], tier, [{"glyph": glyph, "col": _hex(e["color"]), "tier": tier}], "Use it", "trophy")
	got.use.connect(func():
		use.call()
		Sfx.sfx.play("equip")
		got.mark("In use")
		_render())
	_open_sheet(got)


static func _hex(c) -> Color:
	return Color.hex((int(c) << 8) | 0xff)


func _open_promo() -> void:
	_open_sheet(PromoSheet.new())


# --- Shelves ---------------------------------------------------------------------------------------

func _shelf_count(id: String) -> int:
	match id:
		"daily": return (CharacterShop.daily_picks(day) as Array).size()
		"ent": return _priced(CharacterEntrances.ENTRANCE_IDS, CharacterEntrances.ENTRANCES).size()
		"fin": return _priced(CharacterFinales.FINISHER_IDS, CharacterFinales.FINISHERS).size()
		"pose": return _priced(CharacterFinales.POSE_IDS, CharacterFinales.POSES).size()
	return CharacterSkins.SKIN_SETS.size() - 1


static func _priced(ids: Array, defs: Dictionary) -> Array:
	return ids.filter(func(id): return float(defs[id]["price"]) > 0)


func _on_tab_tap(pos: Vector2) -> void:
	for i in _tab_rects.size():
		if (_tab_rects[i] as Rect2).has_point(pos):
			var id: String = SHELVES[i][0]
			if id == shelf: return
			shelf = id
			last_shelf = id
			Sfx.sfx.play("select")
			_body.offset = 0.0
			_render()
			return


func _paint_tabs(ci: CanvasItem, s: Vector2) -> void:
	var p := float(UI.px)
	var fs := roundi(UI.r(0.75))
	var f := UI.spaced("700", fs, 0.02)
	for i in _tab_rects.size():
		var r: Rect2 = _tab_rects[i]
		var on: bool = SHELVES[i][0] == shelf
		ci.draw_rect(r, UI.INK)
		var inner := r.grow(-p)
		if on:
			ci.draw_rect(inner, UI.GOLD)
			ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p)), UI.GOLD_HI)
			ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), UI.GOLD_LO)
		else:
			ci.draw_rect(inner, Color("#150f26"))
			ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), Color("#0b0715"))
		var t := (SHELVES[i][1] as String).to_upper()
		while t.length() > 2 and UI.text_w(f, t, fs) > inner.size.x - UI.r(0.5): t = t.substr(0, t.length() - 2) + "…"
		var mid := inner.position.y + (inner.size.y - p) / 2.0
		var x := roundf(r.get_center().x - UI.text_w(f, t, fs) / 2.0)
		if on: ci.draw_string(f, Vector2(x, ShopKit.base_at(f, fs, mid)), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.INK)
		else: UI.draw_text(ci, f, Vector2(x, ShopKit.base_at(f, fs, mid)), t, fs, UI.MUTED)
	ci.draw_rect(Rect2(0, s.y - p, s.x, p), UI.LINE)


## Lays the open shelf out: its offers and their buttons, in content px.
func _render() -> void:
	if _body == null or _body.size.x < 2: return
	_items.clear()
	_btns.clear()
	var w := _body.size.x - UI.c(4)
	var hint_fs := roundi(UI.r(0.6875))
	var y := hint_fs * 1.3 + UI.r(0.3)
	var gap := UI.r(0.35)
	match shelf:
		"daily": y = _lay_daily(w, y, gap)
		"ent": y = _lay_finales(w, y, gap, "ent", CharacterEntrances.ENTRANCE_IDS, CharacterEntrances.ENTRANCES, UiEntranceUi.ENTRANCE_ICON, "Entrance")
		"fin": y = _lay_finales(w, y, gap, "fin", CharacterFinales.FINISHER_IDS, CharacterFinales.FINISHERS, UiFinaleUi.FINISHER_ICON, "Finisher")
		"pose": y = _lay_finales(w, y, gap, "pose", CharacterFinales.POSE_IDS, CharacterFinales.POSES, UiFinaleUi.POSE_ICON, "Pose")
		"sets": y = _lay_sets(w, y, gap)
	_body.set_content_h(y + UI.c(4))
	_body.queue_redraw()
	_tabs.queue_redraw()


func _btn_h() -> float:
	return UI.r(2.1)


func _lay_daily(w: float, y: float, gap: float) -> float:
	var picks: Array = CharacterShop.daily_picks(day)
	var cw := floorf((w - gap * 2) / 3.0)
	var band := _band_h()
	var sock := UI.r(2.7)
	var h := UI.px * 4 + band + UI.c(2) + UI.c(3) + sock + UI.c(3) + _btn_h() + UI.c(2) + UI.c(6)
	for i in picks.size():
		var s: Dictionary = picks[i]
		var r := UI.rround(Rect2((i % 3) * (cw + gap), y + floori(i / 3.0) * (h + gap), cw, h))
		var mine := CharacterCollection.owns(s["id"])
		var it := {"rect": r, "kind": "daily", "skin": s, "tier": s["rarity"], "mine": mine}
		# Name and item laid out once (the shelf redraws every frame for its sweeps).
		var tw := r.size.x - UI.px * 4 - UI.c(10) - sock - UI.c(6)
		var nfs := roundi(UI.r(0.8125))
		var ifs := roundi(UI.r(0.625))
		it["name"] = Rich.layout([Rich.run(s["name"], UI.font("700"), nfs, UI.TEXT, "drop")], tw, roundf(nfs * 1.1), 2)
		var item := (SimGear.gear_of(s["gear"])["name"] as String).to_upper()
		var itf := UI.spaced("500", ifs, 0.05)
		while item.length() > 2 and UI.text_w(itf, item, ifs) > tw: item = item.substr(0, item.length() - 2) + "…"
		it["item_t"] = item
		_items.append(it)
		var br := Rect2(r.position.x + UI.px * 2 + UI.c(5), r.end.y - UI.px * 2 - UI.c(6) - _btn_h(), r.size.x - UI.px * 4 - UI.c(10), _btn_h())
		it["btn_r"] = br
		if not mine:
			var price: float = CharacterShop.SKIN_PRICE[s["rarity"]]
			_btns.append({"rect": br, "key": "d:" + s["id"], "price": price, "act": func(): _arm_or_buy("d:" + s["id"], price, func(): _buy_one(s))})
	return y + ceili(picks.size() / 3.0) * (h + gap) - gap


func _band_h() -> float:
	return roundi(UI.r(0.625)) + UI.c(5)


func _lay_finales(w: float, y: float, gap: float, kind: String, all: Array, defs: Dictionary, icons: Dictionary, item: String) -> float:
	var ids := _priced(all, defs)
	var cols := maxi(1, floori((w + gap) / (UI.r(6) + gap)))
	var cw := floorf((w - gap * (cols - 1)) / cols)
	var band := _band_h()
	var sock := UI.r(2.7)
	var nfs := roundi(UI.r(0.8125))
	var lh := roundf(nfs * 1.1)
	var rows := []
	var pl = player_fn.call() if player_fn.is_valid() else null
	var look = pl.get("look") if pl != null else null
	for i in ids.size():
		var id: String = ids[i]
		var e: Dictionary = defs[id]
		var name := Rich.layout([Rich.run(e["name"], UI.font("700"), nfs, UI.TEXT, "drop")], cw - UI.px * 4 - UI.c(10), lh, 2)
		var mine := false
		var using := false
		match kind:
			"ent":
				mine = CharacterEntrances.owns_entrance(id)
				using = mine and CharacterEntrances.entrance_of(look, true) == id
			"fin":
				mine = CharacterFinales.owns_finisher(id)
				using = mine and CharacterFinales.finisher_of(look, true) == id
			"pose":
				mine = CharacterFinales.owns_pose(id)
				using = mine and CharacterFinales.pose_of(look, true) == id
		var h := UI.px * 4 + band + UI.c(2) + UI.c(3) + sock + UI.c(3) + name.h + UI.c(3) + roundi(UI.r(0.625)) * 1.2 + UI.c(3) + _btn_h() + UI.c(2) + UI.c(6)
		var it := {"kind": kind, "id": id, "def": e, "tier": e["tier"], "mine": mine, "using": using, "name": name, "glyph": icons.get(id, "star"), "item": item, "h": h}
		_items.append(it)
		if rows.is_empty() or (rows[-1] as Array).size() >= cols: rows.append([])
		rows[-1].append(it)
	for row in rows:
		var rh := 0.0
		for it in row: rh = maxf(rh, it["h"])
		for j in row.size():
			var it: Dictionary = row[j]
			var r := UI.rround(Rect2(j * (cw + gap), y, cw, rh))
			it["rect"] = r
			var br := Rect2(r.position.x + UI.px * 2 + UI.c(5), r.end.y - UI.px * 2 - UI.c(6) - _btn_h(), r.size.x - UI.px * 4 - UI.c(10), _btn_h())
			it["btn_r"] = br
			var id: String = it["id"]
			var e: Dictionary = it["def"]
			if not it["mine"]:
				var key: String = kind + ":" + id
				_btns.append({"rect": br, "key": key, "price": float(e["price"]), "act": func(): _arm_or_buy(key, float(e["price"]), func(): _buy_finale(kind, id))})
			elif not it["using"]:
				_btns.append({"rect": br, "key": "use:" + id, "label": "Use", "glyph": "boot" if kind == "ent" else "trophy", "act": func():
					_use_finale(kind, id)
					Sfx.sfx.play("equip")
					_render()})
		y += rh + gap
	return y - gap


func _buy_finale(kind: String, id: String) -> void:
	match kind:
		"ent":
			if not CharacterEntrances.buy_entrance(id): return
			_unlocked(CharacterEntrances.ENTRANCES[id], UiEntranceUi.ENTRANCE_ICON[id], func(): entrance.emit(id))
		"fin":
			if not CharacterFinales.buy_finisher(id): return
			_unlocked(CharacterFinales.FINISHERS[id], UiFinaleUi.FINISHER_ICON[id], func(): finisher.emit(id))
		"pose":
			if not CharacterFinales.buy_pose(id): return
			_unlocked(CharacterFinales.POSES[id], UiFinaleUi.POSE_ICON[id], func(): pose.emit(id))


func _use_finale(kind: String, id: String) -> void:
	match kind:
		"ent": entrance.emit(id)
		"fin": finisher.emit(id)
		"pose": pose.emit(id)


## Plays an entrance, finisher or pose on the featured stage.
func _watch(kind: String, id: String) -> void:
	_peek = kind + ":" + id
	Sfx.sfx.play("select")
	var pl = player_fn.call() if player_fn.is_valid() else null
	match kind:
		"ent": _preview.play_entrance(id)
		"fin": _preview.play_finisher(id, CharacterFinales.pose_of(pl.get("look") if pl != null else null, true))
		"pose": _preview.play_pose(id)


func _lay_sets(w: float, y: float, gap: float) -> float:
	var feat_id: String = CharacterShop.featured_set(day)["id"]
	var offers := []
	for s in CharacterSkins.SKIN_SETS:
		if s["id"] != feat_id: offers.append(CharacterShop.set_offer(s))
	# Sets you can still complete first, owned ones last (a stable sort).
	var open := offers.filter(func(o): return not (o["missing"] as Array).is_empty())
	var done := offers.filter(func(o): return (o["missing"] as Array).is_empty())
	offers = open + done
	var cols := maxi(1, floori((w + gap) / (UI.r(15) + gap)))
	var cw := floorf((w - gap * (cols - 1)) / cols)
	var name_fs := roundi(UI.r(0.9375))
	var sock := minf(UI.r(2.6), floorf((cw - UI.px * 4 - UI.c(16) - 6 * UI.c(3)) / 7.0))
	var h := UI.px * 4 + UI.c(6) + name_fs + UI.c(5) + sock + UI.c(5) + _btn_h() + UI.c(7)
	for i in offers.size():
		var o: Dictionary = offers[i]
		var r := UI.rround(Rect2((i % cols) * (cw + gap), y + floori(i / float(cols)) * (h + gap), cw, h))
		var it := {"rect": r, "kind": "set", "offer": o, "sock": sock}
		_items.append(it)
		var missing: Array = o["missing"]
		var have: int = (o["pieces"] as Array).size() - missing.size()
		var key: String = "s:" + o["set"]["id"]
		var bd := {"key": key, "y": r.end.y - UI.px * 2 - UI.c(7) - _btn_h()}
		if not missing.is_empty():
			bd["price"] = float(o["price"])
			bd["label"] = "Last %d" % missing.size() if have > 0 else "Set"
			bd["act"] = func(): _arm_or_buy(key, float(o["price"]), func(): _buy_set(o))
		else:
			bd["label"] = "Equip"
			bd["glyph"] = "bag"
			bd["act"] = func(): _ask_equip(o)
		var bw := _btn_w(bd)
		bd["rect"] = Rect2(r.end.x - UI.px * 2 - UI.c(8) - bw, bd["y"], bw, _btn_h())
		_btns.append(bd)
	return y + ceili(offers.size() / float(cols)) * (h + gap) - gap


func _on_body_tap(pos: Vector2) -> void:
	for b in _btns:
		if (b["rect"] as Rect2).grow(UI.c(2)).has_point(pos):
			(b["act"] as Callable).call()
			return
	for it in _items:
		if (it["rect"] as Rect2).has_point(pos) and it["kind"] in ["ent", "fin", "pose"]:
			_watch(it["kind"], it["id"])
			return


# --- Drawing the shelf -----------------------------------------------------------------------------

func _paint_body(ci: CanvasItem, s: Vector2, off: float) -> void:
	var hint: String = ""
	for sh in SHELVES:
		if sh[0] == shelf: hint = sh[2]
	var hfs := roundi(UI.r(0.6875))
	var f := UI.font("500")
	ci.draw_string(f, Vector2(0, roundf(f.get_ascent(hfs)) - off), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, hfs, UI.MUTED)
	var o := Vector2(0, -off)
	for it in _items:
		var r: Rect2 = it["rect"]
		if r.end.y - off < 0 or r.position.y - off > s.y: continue
		match it["kind"]:
			"daily": _draw_daily(ci, it, o)
			"set": _draw_set(ci, it, o)
			_: _draw_finale(ci, it, o)
	for b in _btns:
		var r: Rect2 = b["rect"]
		if r.end.y - off < 0 or r.position.y - off > s.y: continue
		_draw_btn(ci, b, o)


## An offer's card (CSS .offer): its tier's glow and edge, and the tier band on top.
## The tier band's label sits left on the daily cards and centred on the rest (CSS .offer-tier).
func _offer_card(ci: CanvasItem, r: Rect2, tier: String, centre := true) -> Rect2:
	var p := float(UI.px)
	var rid := ci.get_canvas_item()
	UI.notch_rect(rid, r, UI.INK, p)
	var i := r.grow(-p * 2)
	UI.vgrad(rid, i, [[0.0, Color("#241a3c")], [1.0, Color("#110b1e")]])
	var g: Color = ShopKit.TIER_GLOW.get(tier, ShopKit.TIER_GLOW["rare"])
	UI.glow(rid, Vector2(i.get_center().x, i.position.y + i.size.y * 0.38), Vector2(i.size.x * 0.49, i.size.y * 0.28), Color(g, g.a * 0.55), 1.2)
	var rc: Color = ShopKit.TIER_C.get(tier, UI.MUTED)
	_ring(ci, i, rc, p)
	ci.draw_rect(Rect2(i.position.x + p, i.end.y - p * 3, i.size.x - p * 2, p * 2), Color(0, 0, 0, 0.4))
	var band := Rect2(i.position, Vector2(i.size.x, _band_h()))
	if tier == "epic": UI.sweep_band(rid, band, ShopKit.sweep_phase())
	else: ci.draw_rect(band, rc)
	var fs := roundi(UI.r(0.625))
	var f := UI.spaced("700", fs, 0.1)
	var tn := ShopKit.tier_name(tier).to_upper() if tier != "common" else "FREE"
	var tx := roundf(band.get_center().x - UI.text_w(f, tn, fs) / 2.0) if centre else band.position.x + UI.c(4)
	ci.draw_string(f, Vector2(tx, ShopKit.base_at(f, fs, band.get_center().y)), tn, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.INK)
	return i


func _draw_daily(ci: CanvasItem, it: Dictionary, o: Vector2) -> void:
	var r: Rect2 = (it["rect"] as Rect2)
	r.position += o
	var s: Dictionary = it["skin"]
	var i := _offer_card(ci, r, it["tier"], false)
	var sock := UI.r(2.7)
	var x := i.position.x + UI.c(5)
	var y := i.position.y + _band_h() + UI.c(2) + UI.c(3)
	var sr := Rect2(x, y, sock, sock)
	var ic = GearIcons.get_icon(s["gear"], s["id"], _body.queue_redraw)
	var mod := Color(1, 1, 1, 0.55) if it["mine"] else Color.WHITE
	if ic != null: GearIcons.draw(ci, ic, Rect2(sr.position + sr.size * 0.09, sr.size * 0.82), mod)
	# Name and the item it dresses, beside the art.
	var tx := x + sock + UI.c(6)
	var tw := i.end.x - UI.c(5) - tx
	var ifs := roundi(UI.r(0.625))
	var name: Rich.Layout = it["name"]
	var item: String = it["item_t"]
	var itf := UI.spaced("500", ifs, 0.05)
	var bh := name.h + UI.c(3) + ifs * 1.2
	var ty := roundf(y + (sock - bh) / 2.0)
	name.draw(ci, Vector2(tx, ty))
	ci.draw_string(itf, Vector2(tx, ty + name.h + UI.c(3) + itf.get_ascent(ifs)), item, HORIZONTAL_ALIGNMENT_LEFT, -1, ifs, UI.MUTED)
	if it["mine"]:
		var br: Rect2 = it["btn_r"]
		br.position += o
		var tagw := _owned_w("Owned")
		_owned_tag(ci, roundf(br.get_center().x - tagw / 2.0), br.get_center().y, "Owned")


func _draw_finale(ci: CanvasItem, it: Dictionary, o: Vector2) -> void:
	var r: Rect2 = (it["rect"] as Rect2)
	r.position += o
	var e: Dictionary = it["def"]
	var tier: String = it["tier"]
	var i := _offer_card(ci, r, tier)
	var p := float(UI.px)
	if _peek == it["kind"] + ":" + it["id"]:
		# Dashed outline on the one playing on the stage.
		var d := i.grow(-p * 3)
		var rc: Color = ShopKit.TIER_C.get(tier, UI.MUTED)
		var dash := p * 3
		# On the web the top run lies on the tier band in the band's own colour, so it starts under it.
		var x := d.position.x
		while x < d.end.x:
			ci.draw_rect(Rect2(x, d.end.y - p, minf(dash, d.end.x - x), p), rc)
			x += dash * 2
		var yy := i.position.y + _band_h() + p
		while yy < d.end.y:
			ci.draw_rect(Rect2(d.position.x, yy, p, minf(dash, d.end.y - yy)), rc)
			ci.draw_rect(Rect2(d.end.x - p, yy, p, minf(dash, d.end.y - yy)), rc)
			yy += dash * 2
	var sock := UI.r(2.7)
	var y := i.position.y + _band_h() + UI.c(2) + UI.c(3)
	var gs := UI.glyph_size(sock * 0.6)
	var col := _hex(e["color"])
	if it["mine"]: col.a = 0.55
	UI.draw_glyph(ci, it["glyph"], Vector2(roundf(i.get_center().x - gs / 2.0), roundf(y + (sock - gs) / 2.0)), gs, col, UI.INK)
	y += sock + UI.c(3)
	var name: Rich.Layout = it["name"]
	name.draw(ci, Vector2(i.position.x + UI.c(5), y), 0.5, i.size.x - UI.c(10))
	y += name.h + UI.c(3)
	var ifs := roundi(UI.r(0.625))
	var itf := UI.spaced("500", ifs, 0.05)
	var t := (it["item"] as String).to_upper()
	ci.draw_string(itf, Vector2(roundf(i.get_center().x - UI.text_w(itf, t, ifs) / 2.0), y + itf.get_ascent(ifs)), t, HORIZONTAL_ALIGNMENT_LEFT, -1, ifs, UI.MUTED)
	if it["using"]:
		var br: Rect2 = it["btn_r"]
		br.position += o
		var tagw := _owned_w("In use")
		_owned_tag(ci, roundf(br.get_center().x - tagw / 2.0), br.get_center().y, "In use")


func _draw_set(ci: CanvasItem, it: Dictionary, o: Vector2) -> void:
	var r: Rect2 = (it["rect"] as Rect2)
	r.position += o
	var off: Dictionary = it["offer"]
	var p := float(UI.px)
	var mine := (off["missing"] as Array).is_empty()
	var rid := ci.get_canvas_item()
	ci.draw_rect(r, UI.INK)
	var i := r.grow(-p * 2)
	UI.vgrad(rid, i, [[0.0, Color("#221838")], [1.0, Color("#100a1c")]])
	UI.vgrad(rid, Rect2(i.position, Vector2(i.size.x, i.size.y * 0.6)), [[0.0, Color(127 / 255.0, 240 / 255.0, 224 / 255.0, 0.08)], [1.0, Color(127 / 255.0, 240 / 255.0, 224 / 255.0, 0.0)]])
	_ring(ci, i, Color(98 / 255.0, 212 / 255.0, 122 / 255.0, 0.4) if mine else Color(127 / 255.0, 240 / 255.0, 224 / 255.0, 0.35), p)
	var a := 0.75 if mine else 1.0
	var x0 := i.position.x + UI.c(8)
	var y := i.position.y + UI.c(6)
	var nfs := roundi(UI.r(0.9375))
	var nf := UI.spaced("700", nfs, 0.03)
	var name: String = off["set"]["name"]
	while name.length() > 2 and UI.text_w(nf, name, nfs) > i.size.x - UI.c(16): name = name.substr(0, name.length() - 2) + "…"
	UI.draw_text(ci, nf, Vector2(x0, y + nf.get_ascent(nfs)), name, nfs, Color(UI.TEXT, a), "drop", Color(UI.INK, a))
	y += nfs + UI.c(5)
	var sock: float = it["sock"]
	var pieces: Array = off["pieces"]
	for k in pieces.size():
		_piece(ci, Rect2(x0 + k * (sock + UI.c(3)), y, sock, sock), pieces[k])
	var have := pieces.size() - (off["missing"] as Array).size()
	var sfs := roundi(UI.r(0.75))
	var f := UI.font("500")
	var by := i.end.y - UI.c(7) - _btn_h()
	ci.draw_string(f, Vector2(x0, ShopKit.base_at(f, sfs, by + _btn_h() / 2.0)), "%d/%d owned" % [have, pieces.size()], HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)
	if mine: ci.draw_rect(r, Color(UI.BG, 0.25))


func _btn_w(b: Dictionary) -> float:
	var fs := roundi(UI.r(0.75))
	var f := UI.spaced("700", fs, 0.06)
	var w := UI.r(0.5) * 2
	if b.has("glyph"): w += UI.glyph_size(fs * 1.15) + fs * 0.45
	if b.has("label"): w += UI.text_w(f, (b["label"] as String).to_upper(), fs)
	if b.has("price"): w += (fs * 0.45 if b.has("label") else 0.0) + UI.c(6) * 2 + ShopKit.gem_w(str(int(b["price"])), fs)
	return ceilf(w)


## A drawn button on a shelf: a price (armed: "Buy?" in green; short of gems: grey with
## the price in red), or Use / Equip.
func _draw_btn(ci: CanvasItem, b: Dictionary, o: Vector2) -> void:
	var r: Rect2 = (b["rect"] as Rect2)
	r.position += o
	var p := float(UI.px)
	var price: float = b.get("price", -1.0)
	var armed: bool = b.get("key", "") == _armed and price >= 0
	var short := price >= 0 and CharacterCollection.gems() < price
	var face := Color("#43357a")
	var hi := Color("#6a58aa")
	var lo := Color("#261d48")
	var fg := UI.TEXT
	if armed:
		face = Color("#2f8a4e")
		hi = Color("#5fd07e")
		lo = Color("#144626")
		if fmod(_t, 0.6) >= 0.3:
			face = face.lightened(0.15)
			hi = hi.lightened(0.15)
	elif short:
		face = Color("#3a3150")
		hi = Color("#554a70")
		lo = Color("#1e182e")
		fg = UI.MUTED
	UI.bevel(ci.get_canvas_item(), r, face, hi, lo, 3)
	var fs := roundi(UI.r(0.75))
	var f := UI.spaced("700", fs, 0.06)
	var mid := r.position.y + (r.size.y - p * 2) / 2.0
	var label: String = "Buy?" if armed else b.get("label", "")
	var parts_w := 0.0
	var gs := UI.glyph_size(fs * 1.15)
	if b.has("glyph") and not armed: parts_w += gs + fs * 0.45
	if label != "": parts_w += UI.text_w(f, label.to_upper(), fs)
	var tagw := UI.c(6) * 2 + ShopKit.gem_w(str(int(price)), fs) if price >= 0 else 0.0
	if price >= 0: parts_w += tagw + (fs * 0.45 if label != "" else 0.0)
	var x := roundf(r.get_center().x - parts_w / 2.0)
	var shade := Color(0.04, 0.02, 0.07, 0.55)
	if b.has("glyph") and not armed:
		UI.draw_glyph(ci, b["glyph"], Vector2(x, roundf(mid - gs / 2.0)), gs, fg, shade)
		x += gs + fs * 0.45
	if label != "":
		var base := ShopKit.base_at(f, fs, mid)
		ci.draw_string(f, Vector2(x, base + p), label.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, shade)
		ci.draw_string(f, Vector2(x, base), label.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, fg)
		x += UI.text_w(f, label.to_upper(), fs) + fs * 0.45
	if price >= 0:
		ci.draw_rect(Rect2(x, roundf(mid - fs / 2.0 - UI.c(2)), tagw, fs + UI.c(5)), Color(0, 0, 0, 0.35))
		ShopKit.gem_tag(ci, x + UI.c(6), mid, str(int(price)), fs, UI.RED if short else UI.TEXT)


# --- Bits ---------------------------------------------------------------------------------------------

func _frame(ci: CanvasItem, s: Vector2) -> void:
	var p := float(UI.px)
	UI.panel_fill(ci.get_canvas_item(), Rect2(Vector2(p * 2, p * 2), s - Vector2(p * 4, p * 4)))
	UI.draw_frame(ci.get_canvas_item(), Rect2(Vector2.ZERO, s), "gold")


static func _ring(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:
	ci.draw_rect(Rect2(r.position, Vector2(r.size.x, w)), col)
	ci.draw_rect(Rect2(r.position.x, r.end.y - w, r.size.x, w), col)
	ci.draw_rect(Rect2(r.position.x, r.position.y + w, w, r.size.y - w * 2), col)
	ci.draw_rect(Rect2(r.end.x - w, r.position.y + w, w, r.size.y - w * 2), col)


func _draw() -> void:
	var ci := get_canvas_item()
	var W := size.x
	var H := size.y
	# Over the frozen arena: dark, faint pillars, and a sea-green pool where the set stands.
	UI.vgrad(ci, Rect2(Vector2.ZERO, size), [[0.0, Color(16 / 255.0, 10 / 255.0, 30 / 255.0, 0.92)], [1.0, Color(8 / 255.0, 5 / 255.0, 15 / 255.0, 0.97)]])
	var x := 0.0
	while x < W:
		draw_rect(Rect2(x, 0, UI.c(2), H), Color(1, 1, 1, 0.018))
		x += UI.c(64)
	UI.glow(ci, Vector2(W * 0.19, H * 0.55), Vector2(W * 0.3, H * 0.5) * 0.7, Color(127 / 255.0, 240 / 255.0, 224 / 255.0, 0.16))


## The "Unlocked!" pop-up after a buy: rays turning behind, the new things popping in,
## Nice, and a button to wear or use it at once.
class GotSheet extends Sheet:
	signal use
	var tier := "rare"
	var _name := ""
	var _icons: Array = []
	var _ribbon: Ribbon
	var _icons_box: UI.Paint
	var _nice: PxButton
	var _use: PxButton

	func _init(name: String, t: String, icons: Array, use_label: String, use_glyph: String) -> void:
		super("", 24.0)
		tier = t
		_name = name
		_icons = icons
		_ribbon = Ribbon.new("Unlocked!")
		body.add_child(_ribbon)
		_icons_box = UI.Paint.new(_paint_icons)
		body.add_child(_icons_box)
		_nice = PxButton.new("Nice")
		_nice.min_w = 7.0
		_nice.pressed.connect(close)
		body.add_child(_nice)
		_use = PxButton.new(use_label, use_glyph, "primary")
		_use.min_w = 7.0
		_use.pressed.connect(func(): use.emit())
		body.add_child(_use)

	## The wear/use button done ("Equipped", "In use").
	func mark(t: String) -> void:
		_use.disabled = true
		_use.set_text(t)
		_use.set_glyph("check")
		_layout()

	func _sock_s() -> float:
		return UI.r(2.8)

	func _name_fs() -> int:
		return roundi(UI.r(1.4))

	func _body_size(avail: Vector2) -> Vector2:
		var h := UI.r(0.7) + _ribbon.get_minimum_size().y + UI.r(0.6) + _name_fs() + UI.px * 2 + UI.r(0.6) + _icon_rows(avail.x) * (_sock_s() + UI.c(6)) - UI.c(6) + UI.r(0.6) + _nice.custom_minimum_size.y + UI.r(0.8)
		return Vector2(avail.x, h)

	func _icon_rows(w: float) -> int:
		var per := maxi(1, floori((minf(w, UI.r(30)) + UI.c(6)) / (_sock_s() + UI.c(6))))
		return ceili(_icons.size() / float(per))

	func _layout_body(s: Vector2) -> void:
		var y := UI.r(0.7)
		_ribbon.size = _ribbon.get_minimum_size()
		_ribbon.position = Vector2(roundf((s.x - _ribbon.size.x) / 2.0), y)
		y += _ribbon.size.y + UI.r(0.6) + _name_fs() + UI.px * 2 + UI.r(0.6)
		var rows := _icon_rows(s.x)
		_icons_box.position = Vector2(0, y)
		_icons_box.size = Vector2(s.x, rows * (_sock_s() + UI.c(6)) - UI.c(6))
		y += _icons_box.size.y + UI.r(0.6)
		for b in [_nice, _use]: b.size = b.custom_minimum_size
		var tw := _nice.size.x + UI.r(0.6) + _use.size.x
		_nice.position = Vector2(roundf((s.x - tw) / 2.0), y)
		_use.position = Vector2(_nice.position.x + _nice.size.x + UI.r(0.6), y)

	func _process(dt: float) -> void:
		super(dt)
		panel.queue_redraw()
		_icons_box.queue_redraw()

	func _paint_extra(ci: CanvasItem, s: Vector2) -> void:
		# Rays turning behind (14 s a turn), clipped to the panel.
		var fw := UI.frame_w("gold")
		var inner := Rect2(Vector2(fw, fw), s - Vector2(fw, fw) * 2)
		var c := Vector2(s.x / 2.0, s.y * 0.55)
		var rad := UI.r(23) * 0.55
		var rc: Color = ShopKit.TIER_C.get(tier, UI.GOLD)
		var box := PackedVector2Array([inner.position, Vector2(inner.end.x, inner.position.y), inner.end, Vector2(inner.position.x, inner.end.y)])
		var turn := fmod(_t, 14.0) / 14.0 * TAU
		for i in 24:
			var a0 := deg_to_rad(i * 15.0) + turn - PI / 2.0
			var a1 := a0 + deg_to_rad(5.0)
			var tri := PackedVector2Array([c, c + Vector2(cos(a0), sin(a0)) * rad, c + Vector2(cos(a1), sin(a1)) * rad])
			for cp in Geometry2D.intersect_polygons(tri, box):
				var cols := PackedColorArray()
				for v in cp: cols.append(Color(rc, 0.35 * clampf(1.0 - v.distance_to(c) / rad, 0.0, 1.0)))
				ci.draw_polygon(cp, cols)
		# The name.
		var fs := _name_fs()
		var f := UI.font("p700")
		var y := fw + head_h() + UI.r(0.7) + _ribbon.size.y + UI.r(0.6) + f.get_ascent(fs)
		var w := UI.text_w(f, _name, fs)
		UI.draw_text(ci, f, Vector2(roundf((s.x - w) / 2.0), roundf(y)), _name, fs, UI.GOLD_HI, "outline")

	func _paint_icons(ci: CanvasItem, s: Vector2) -> void:
		var sz := _sock_s()
		var gap := UI.c(6)
		var per := maxi(1, floori((minf(s.x, UI.r(30)) + gap) / (sz + gap)))
		var p := float(UI.px)
		for i in _icons.size():
			var row := i / per
			var in_row := mini(per, _icons.size() - row * per)
			var col := i % per
			var rw := in_row * sz + (in_row - 1) * gap
			var r := Rect2(roundf((s.x - rw) / 2.0) + col * (sz + gap), row * (sz + gap), sz, sz)
			var k := clampf((_t - 0.12 - i * 0.07) / 0.42, 0.0, 1.0)
			if k <= 0.0: continue
			var e := ShopKit.bez(0.2, 1.8, 0.4, 1.0, k)
			var ic: Dictionary = _icons[i]
			var rc: Color = ShopKit.TIER_C.get(ic["tier"], UI.GOLD)
			if ic.has("col"): rc = ShopKit.TIER_C.get(ic["tier"], ic["col"])
			ci.draw_set_transform(r.get_center(), deg_to_rad(-25.0) * (1.0 - e), Vector2.ONE * lerpf(0.2, 1.0, e))
			var lr := Rect2(-r.size / 2.0, r.size)
			ShopKit.soft_glow(ci, lr, Color(rc, 0.3 * k), UI.r(0.7))
			UI.sock(ci.get_canvas_item(), lr)
			ShopKit.ring(ci, lr, rc, p)
			if ic.has("skin"):
				var sk: Dictionary = ic["skin"]
				var g = GearIcons.get_icon(sk["gear"], sk["id"], ci.queue_redraw)
				if g != null: GearIcons.draw(ci, g, Rect2(lr.position + lr.size * 0.09, lr.size * 0.82))
			else:
				var gs := UI.glyph_size(sz * 0.7)
				UI.draw_glyph(ci, ic["glyph"], Vector2(-gs / 2.0, -gs / 2.0), gs, ic["col"], UI.INK)
		ci.draw_set_transform(Vector2.ZERO)
