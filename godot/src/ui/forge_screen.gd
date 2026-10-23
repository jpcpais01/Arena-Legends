class_name ForgeScreen
extends GachaScreen
## The Forge (the web's ui/forge.ts): three spare copies of one rarity are melted
## down and beaten into one skin of the next rarity. The furnace and anvil stand on
## the left, your spares in a row per rarity on the right. Forging plays the whole
## smithing: the spares drop into the fire, molten metal leaps onto the anvil, three
## hammer blows shape it (the best tiers get their omen), and the quench reveals
## the new skin. A tap skips ahead.

var _ribbon: Ribbon
## One per rarity, best first: {tier, n, mine: [[skin, count]], into, strip, btn, rect}.
var _rows: Array = []
var _fly: UI.Paint
## Spares flying into the furnace: {skin, rect (screen), i}.
var _flyers: Array = []
var _fly_t := -1.0


func _init(player: Callable) -> void:
	super(UiForgeFx.ForgeFx.new(), "forge")
	player_fn = player
	fx.on_land = func(n): if not dead: Sfx.sfx.play("clang", 0, n + 1)
	_ribbon = Ribbon.new("Forge")
	panel.add_child(_ribbon)
	var tiers: Array = CharacterSkins.SKIN_RARITIES.duplicate()
	tiers.reverse()
	for r in tiers:
		var row := {"tier": r, "n": 0, "mine": [], "into": CharacterCollection.forge_into(r)}
		var strip := ScrollView.new(func(ci, s, off): _paint_strip(ci, s, off, row))
		strip.horizontal = true
		strip.show_bar = false
		panel.add_child(strip)
		row["strip"] = strip
		if row["into"] != null:
			var into: String = row["into"]
			var b := ShopKit.Btn.new([{"g": "anvil"}, {"t": str(CharacterCollection.FORGE_COST)}, {"g": "play"}, {"t": ShopKit.tier_name(into), "c": ShopKit.TIER_C[into]}])
			b.font_rem = 0.8125
			b.min_h = 2.1
			b.pressed.connect(func(): smith(r))
			panel.add_child(b)
			row["btn"] = b
		_rows.append(row)
	_fly = UI.Paint.new(_paint_flyers)
	_fly.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_fly)
	_render()


func _spot() -> Rect2:
	# The web's .forge-spot: like the chest's, its bottom 16% up.
	var head_h := head.height()
	var sw := _col_w()
	var sh := size.y - head_h
	var w := minf(sw * 0.7, UI.r(18))
	var h := sh * 0.52
	return UI.rround(Rect2(sw / 2.0 - w / 2.0, size.y - sh * 0.16 - h, w, h))


func _layout() -> void:
	if size.x < 2: return
	var pr := _panel_rect()
	panel.position = pr.position
	panel.size = pr.size
	_layout_panel()
	super()


## A row fits its tier name, its button and, when it has spares, their strip
## (an empty row only says "None yet", so it sits shorter, as on the web).
func _row_h(has_spares: bool) -> float:
	var tier_h := roundi(UI.r(0.9375)) + UI.c(3) + roundi(UI.r(0.6875)) * 1.2
	var inner := maxf(tier_h, UI.r(2.1))
	if has_spares: inner = maxf(inner, UI.r(2.1) + UI.c(4))
	return inner + UI.c(7 if UI.short() else 9) + UI.px * 2


## Which rows have spares (the layout depends on it).
func _filled() -> Array:
	var have := {}
	for e in CharacterCollection.spares(): have[e[0]["rarity"]] = true
	var out := []
	for row in _rows: out.append(have.has(row["tier"]))
	return out


func _layout_panel() -> void:
	var fw := UI.frame_w("gold")
	var x0 := fw + UI.r(0.75)
	var w := panel.size.x - x0 * 2
	var y := fw + UI.r(0.4)
	_ribbon.size = _ribbon.get_minimum_size()
	_ribbon.position = Vector2(x0 - UI.px * 6, y).round()
	y += _ribbon.size.y + UI.r(0.4)
	_filled_m = _filled()
	for k in _rows.size():
		var row: Dictionary = _rows[k]
		var rh := _row_h(_filled_m[k])
		var r := UI.rround(Rect2(x0, y, w, rh))
		row["rect"] = r
		var bx := r.end.x - UI.c(6) - UI.px
		var b = row.get("btn")
		if b != null:
			b.size = b.custom_minimum_size
			bx -= b.size.x
			b.position = Vector2(bx, r.position.y + roundf((rh - b.size.y) / 2.0))
		else:
			bx -= UI.text_w(UI.font("500"), "Top tier", roundi(UI.r(0.75))) + UI.r(0.3)
		var sx := r.position.x + UI.c(6) + UI.px * 2 + UI.r(7.2) + UI.r(0.4)
		var strip: ScrollView = row["strip"]
		strip.position = Vector2(sx, r.position.y + roundf((rh - UI.r(2.1) - UI.c(4)) / 2.0))
		strip.size = Vector2(maxf(0.0, bx - UI.r(0.4) - sx), UI.r(2.1) + UI.c(4))
		y += rh + UI.c(4 if UI.short() else 5)


var _filled_m := []


func _render() -> void:
	if not _filled_m.is_empty() and _filled() != _filled_m: _layout_panel()
	var all = CharacterCollection.spares()
	for row in _rows:
		var mine := []
		var n := 0
		for e in all:
			if e[0]["rarity"] == row["tier"]:
				mine.append(e)
				n += int(e[1])
		row["mine"] = mine
		row["n"] = n
		var strip: ScrollView = row["strip"]
		strip.set_content_h(mine.size() * (UI.r(2.1) + UI.c(4)))
		strip.queue_redraw()
		var b = row.get("btn")
		if b != null:
			var ready: bool = n >= CharacterCollection.FORGE_COST
			b.disabled = not ready
			b.set_style("primary" if ready else "")
	panel.queue_redraw()


func _process(dt: float) -> void:
	super(dt)
	if not opening: panel.queue_redraw()
	if _fly_t >= 0.0 or not _flyers.is_empty():
		if _fly_t >= 0.0: _fly_t += dt
		_fly.queue_redraw()


func _paint_panel(ci: CanvasItem, s: Vector2) -> void:
	frame(ci, s)
	var fs := roundi(UI.r(0.9375))
	var sfs := roundi(UI.r(0.6875))
	var p := float(UI.px)
	for row in _rows:
		if not row.has("rect"): continue
		var r: Rect2 = row["rect"]
		var tier: String = row["tier"]
		GachaScreen.tier_row(ci, r, tier)
		var x := r.position.x + UI.c(6) + p * 2
		var top := r.position.y + (r.size.y - p - (fs + UI.c(3) + sfs * 1.2)) / 2.0
		GachaScreen.tier_word(ci, x, top + fs / 2.0, tier, fs)
		var cy := top + fs + UI.c(3) + sfs * 0.6
		var n: int = row["n"]
		var into = row["into"]
		var cx := x
		if into != null:
			# Three pips, filled per spare.
			for i in CharacterCollection.FORGE_COST:
				var q := Rect2(cx + i * (p * 3 + UI.c(3)), roundf(cy - p * 1.5), p * 3, p * 3)
				ci.draw_rect(q.grow(p), UI.INK)
				ci.draw_rect(q, ShopKit.TIER_C[tier] if i < n else Color("#120c20"))
			cx += CharacterCollection.FORGE_COST * (p * 3 + UI.c(3)) + UI.c(2)
		var f := UI.font("500")
		var t := "%d/%d" % [n, CharacterCollection.FORGE_COST] if into != null and n < CharacterCollection.FORGE_COST else ("%d spare%s" % [n, "" if n == 1 else "s"])
		ci.draw_string(f, Vector2(cx, ShopKit.base_at(f, sfs, cy)), t, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)
		var mid := r.position.y + (r.size.y - p) / 2.0
		var nfs := roundi(UI.r(0.75))
		if (row["mine"] as Array).is_empty():
			var strip: ScrollView = row["strip"]
			ci.draw_string(f, Vector2(strip.position.x, ShopKit.base_at(f, nfs, mid)), "None yet", HORIZONTAL_ALIGNMENT_LEFT, -1, nfs, UI.DIM)
		if into == null:
			var tt := "Top tier"
			ci.draw_string(f, Vector2(r.end.x - UI.c(6) - p - UI.r(0.3) - UI.text_w(f, tt, nfs), ShopKit.base_at(f, nfs, mid)), tt, HORIZONTAL_ALIGNMENT_LEFT, -1, nfs, UI.DIM)


## A spare's socket: its tier's edge, the skin's icon and how many you hold.
func _sock(ci: CanvasItem, r: Rect2, s: Dictionary, count: int) -> void:
	var p := float(UI.px)
	var tier: String = s["rarity"]
	UI.sock(ci.get_canvas_item(), r)
	var edge: Color = (ShopKit.TIER_C[tier] as Color).lerp(UI.INK, 0.35)
	ci.draw_rect(Rect2(r.position, Vector2(r.size.x, p)), edge)
	ci.draw_rect(Rect2(r.position.x, r.end.y - p, r.size.x, p), edge)
	ci.draw_rect(Rect2(r.position, Vector2(p, r.size.y)), edge)
	ci.draw_rect(Rect2(r.end.x - p, r.position.y, p, r.size.y), edge)
	var ic = GearIcons.get_icon(s["gear"], s["id"], ci.queue_redraw)
	if ic != null: GearIcons.draw(ci, ic, Rect2(r.position + r.size * 0.09, r.size * 0.82))
	if count > 1:
		var fs := roundi(UI.r(0.625))
		var f := UI.font("700")
		var t := "x%d" % count
		var w := UI.text_w(f, t, fs) + UI.c(4)
		var b := Rect2(r.end.x - w + UI.c(1), r.end.y - fs - UI.c(1) + UI.c(2), w, fs + UI.c(1))
		ci.draw_rect(b, UI.INK)
		ci.draw_string(f, Vector2(b.position.x + UI.c(2), ShopKit.base_at(f, fs, b.get_center().y)), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.TEXT)


func _paint_strip(ci: CanvasItem, s: Vector2, off: float, row: Dictionary) -> void:
	var sz := UI.r(2.1)
	var step := sz + UI.c(4)
	var mine: Array = row["mine"]
	for i in mine.size():
		var x := i * step - off
		if x > s.x or x + sz < 0: continue
		_sock(ci, Rect2(x, UI.c(2), sz, sz), mine[i][0], int(mine[i][1]))


## Where the spares of `ids` sit on screen (for the flight into the fire).
func _sock_rects(tier: String, ids: Array) -> Array:
	var out := []
	for row in _rows:
		if row["tier"] != tier: continue
		var strip: ScrollView = row["strip"]
		var sz := UI.r(2.1)
		var step := sz + UI.c(4)
		var mine: Array = row["mine"]
		for k in ids.size():
			var idx := 0
			for i in mine.size():
				if mine[i][0]["id"] == ids[k]: idx = i
			# Copies of the same skin fan out a little so all three show.
			var dup := 0
			for j in k:
				if ids[j] == ids[k]: dup += 1
			var at := panel.position + strip.position + Vector2(idx * step - strip.offset + dup * UI.c(8), UI.c(2) - dup * UI.c(8))
			out.append(Rect2(at, Vector2(sz, sz)))
	return out


func _paint_flyers(ci: CanvasItem, _s: Vector2) -> void:
	if _flyers.is_empty(): return
	var m = fx.get_mouth_px()
	var to := Vector2(m["x"], m["y"]) * UI.dp
	for f in _flyers:
		var r: Rect2 = f["rect"]
		var i: int = f["i"]
		var k := clampf((_fly_t - i * 0.12) / 0.65, 0.0, 1.0) if _fly_t >= 0.0 else 0.0
		var e := ShopKit.bez(0.5, 0.0, 0.8, 0.4, k)
		var c := r.get_center().lerp(to, e)
		var sc := lerpf(1.0, 0.3, e)
		ci.draw_set_transform(c, deg_to_rad((i - 1) * 120.0) * e, Vector2(sc, sc))
		var a := lerpf(1.0, 0.3, k)
		var local := Rect2(-r.size / 2.0, r.size)
		ci.draw_rect(local, Color(UI.INK, a))
		ci.draw_rect(local.grow(-UI.px), Color(0.07, 0.05, 0.12, a))
		var s: Dictionary = f["skin"]
		var ic = GearIcons.get_icon(s["gear"], s["id"], ci.queue_redraw)
		if ic != null: GearIcons.draw(ci, ic, Rect2(local.position + local.size * 0.09, local.size * 0.82), Color(1, 1, 1, a))
	ci.draw_set_transform(Vector2.ZERO)


# --- Smithing ---------------------------------------------------------------------------------------

func smith(r: String) -> void:
	if busy: return
	var pick = CharacterCollection.forge_pick(r)
	var into = CharacterCollection.forge_into(r)
	if pick == null or into == null: return
	# Where the spares sit, before the list redraws and the panel steps aside.
	var from := _sock_rects(r, pick)
	var pull = CharacterCollection.forge(pick)
	if pull == null: return
	_set_busy(true)
	_clear_reveal()
	_set_opening(true)
	Sfx.sfx.play("confirm")
	fx.reset()
	fx.set_centered(true)
	_flyers.clear()
	for i in pick.size():
		_flyers.append({"skin": CharacterSkins.SKIN_BY_ID.get(pick[i]), "rect": from[i] if i < from.size() else Rect2(size / 2.0, Vector2(UI.r(2.1), UI.r(2.1))), "i": i})
	_fly_t = -1.0
	_fly.queue_redraw()
	await wait(0.5)
	if dead: return
	# Into the fire, one after another.
	_fly_t = 0.0
	Sfx.sfx.play("meld")
	await wait(0.85)
	_flyers.clear()
	_fly_t = -1.0
	_fly.queue_redraw()
	if dead: return
	# The fire roars in their colour and melts them down.
	fx.feed(r)
	Sfx.sfx.play("fire")
	await wait(1.0)
	if dead: return
	# Molten metal onto the anvil.
	fx.pour(into)
	Sfx.sfx.play("whoosh")
	await wait(0.75)
	if dead: return
	# Three blows, each harder.
	for i in 3:
		if dead or skipping: break
		fx.strike(i)
		await wait(0.6 if i < 2 else 0.8)
	if dead: return
	# A legendary or mythic: darkness, a pillar of light out of the metal, and its name.
	if ShopKit.rank(into) >= 2 and not skipping:
		fx.omen(into)
		Sfx.sfx.play("omen", 0, 2 if into == "epic" else 1)
		await wait(1.2 if into == "epic" else 0.9)
		if not dead and not skipping:
			slam_banner(into)
			fx.slam(into)
			await wait(1.5 if into == "epic" else 1.1)
	if dead: return
	# Quench.
	fx.quench(into)
	Sfx.sfx.play("steam")
	later(0.5, func(): Sfx.sfx.play("hiss"))
	await wait(0.35)
	banner.hide_banner()
	if dead: return
	var again: ShopKit.Btn = null
	if CharacterCollection.forge_pick(r) != null:
		again = ShopKit.Btn.new([{"g": "anvil"}, {"t": "Forge again"}], "primary")
		again.glint = true
		again.pressed.connect(func():
			_back_to_shop()
			smith(r))
	var b = fx.get_bar_px()
	show_one(pull, Vector2(b["x"], b["y"]) * UI.dp, again, 0.56)
	_set_busy(false)
	head.refresh()
