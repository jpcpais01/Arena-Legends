class_name ChestScreen
extends GachaScreen
## Skin chests (the web's chestScreen in ui/gacha.ts): spend gems on random item
## skins. The chest stands on the left in its glade, with the odds and the buy
## buttons beside it. Opening one plays the whole show: the chest shakes while its
## light climbs through the tiers up to the best skin inside, the two best tiers get
## their omen, the lid blows off and the skins come out on cards (ten are dealt and
## turned over one by one, the rare ones teased first). A tap skips ahead.

var _spot_pad: UI.Pad
var _hint: UI.Paint
var _ribbon: Ribbon
var _buy1: ShopKit.Btn
var _buy10: ShopKit.Btn
var _note: Rich.Layout
var _earn: Rich.Layout
var _rattle := -1.0
## Owned and total skins per tier (refreshed on changes, not every frame).
var _prog = {}
## Panel layout (panel px).
var _m := {}


func _init(player: Callable) -> void:
	super(UiChestFx.ChestFx.new(), "chests")
	player_fn = player
	_ribbon = Ribbon.new("Skin chest")
	panel.add_child(_ribbon)
	_buy1 = ShopKit.Btn.new([{"g": "chest"}, {"t": "Open 1"}, {"gem": str(CharacterCollection.PULL_COST)}])
	_buy1.between = true
	_buy1.font_rem = 0.95
	_buy1.min_h = 2.6 if UI.short() else 2.9
	_buy1.pressed.connect(func(): open(1))
	panel.add_child(_buy1)
	_buy10 = ShopKit.Btn.new([{"g": "chest"}, {"t": "Open 10"}, {"gem": str(CharacterCollection.TEN_COST)}], "primary")
	_buy10.between = true
	_buy10.glint = true
	_buy10.font_rem = 0.95
	_buy10.min_h = 2.6 if UI.short() else 2.9
	_buy10.pressed.connect(func(): open(10))
	panel.add_child(_buy10)
	_render()


func _build_stage() -> void:
	_hint = UI.Paint.new(_paint_hint)
	add_child(_hint)
	_spot_pad = UI.Pad.new(func(_ci, _s): pass)
	_spot_pad.tapped.connect(func(_p): open(1))
	add_child(_spot_pad)


func _spot() -> Rect2:
	# The web's .chest-spot: centred in the stage, its bottom 22% up, 52% of the height.
	var head_h := head.height()
	var sw := _col_w()
	var sh := size.y - head_h
	var w := minf(sw * 0.7, UI.r(18))
	var h := sh * 0.52
	return UI.rround(Rect2(sw / 2.0 - w / 2.0, size.y - sh * 0.22 - h, w, h))


func _layout() -> void:
	if size.x < 2: return
	var pr := _panel_rect()
	panel.position = pr.position
	panel.size = pr.size
	var sp := _spot()
	_spot_pad.position = sp.position
	_spot_pad.size = sp.size
	_hint.position = Vector2(0, head.height())
	_hint.size = Vector2(_col_w(), size.y - head.height())
	_layout_panel()
	super()


# The web's short landscape query tightens the panel so its notes stay on screen.
func _odds_fs() -> int:
	return roundi(UI.r(0.8125 if UI.short() else 0.9375))


func _odds_gap() -> float:
	return UI.c(3 if UI.short() else 4)


func _note_fs() -> int:
	return roundi(UI.r(0.6875 if UI.short() else 0.75))


func _layout_panel() -> void:
	var fw := UI.frame_w("gold")
	var s := panel.size
	var x0 := fw + UI.r(0.75)
	var w := s.x - x0 * 2
	var y := fw + UI.r(0.4)
	var gap := UI.r(0.3 if UI.short() else 0.4)
	_ribbon.size = _ribbon.get_minimum_size()
	_ribbon.position = Vector2(x0 - UI.px * 6, y).round()
	y += _ribbon.size.y + gap
	var rh := (UI.c(5) if UI.short() else UI.c(9)) + _odds_fs() + UI.px * 2
	_m = {"x0": x0, "w": w, "odds_y": y, "row_h": rh}
	y += rh * 4 + _odds_gap() * 3 + gap
	_m["pity_y"] = y
	y += roundi(UI.r(0.8125)) * 1.3 + gap
	var bw := floorf((w - UI.r(0.6)) / 2.0)
	for i in 2:
		var b: ShopKit.Btn = [_buy1, _buy10][i]
		b.size = Vector2(bw, b.custom_minimum_size.y)
		b.position = Vector2(x0 + i * (bw + UI.r(0.6)), y)
	y += _buy1.size.y + gap
	var fs := _note_fs()
	var lh := roundf(fs * (1.25 if UI.short() else 1.35))
	var b := UI.font("700")
	var f := UI.font("500")
	_note = Rich.layout([Rich.run("Open 10", b, fs, UI.TEXT), Rich.run(" costs one chest less and holds an Epic or better. Duplicates go to the ", f, fs, UI.MUTED), Rich.run("Forge", b, fs, UI.TEXT), Rich.run(".", f, fs, UI.MUTED)], w, lh)
	_m["note_y"] = y
	y += _note.h + gap
	var gs := UI.glyph_size(fs * 1.1)
	_earn = Rich.layout([Rich.run("Wins pay %d gems, plus up to %d for the health you keep." % [CharacterCollection.WIN_BASE, CharacterCollection.WIN_HP_BONUS], f, fs, UI.TEXT)], w - gs - fs * 0.4, lh)
	_m["earn_y"] = y


func _render() -> void:
	_prog = CharacterCollection.progress()
	var g := CharacterCollection.gems()
	_buy1.disabled = g < CharacterCollection.PULL_COST
	_buy10.disabled = g < CharacterCollection.TEN_COST
	panel.queue_redraw()


func _process(dt: float) -> void:
	super(dt)
	if not opening:
		_hint.queue_redraw()
		panel.queue_redraw()
	if _rattle >= 0.0:
		_rattle += dt
		if _rattle >= 0.15:
			_rattle = 0.0
			Sfx.sfx.play("rattle", (randf() - 0.5) * 0.6)


func _stage_fade(a: float) -> void:
	_hint.modulate.a = a
	_spot_pad.visible = a >= 1.0


func _paint_hint(ci: CanvasItem, s: Vector2) -> void:
	# "Tap the chest", blinking (CSS blink 1.4 s steps(1)).
	if fmod(Time.get_ticks_msec() / 1000.0, 1.4) >= 0.91: return
	var fs := roundi(UI.r(0.875))
	var f := UI.spaced("700", fs, 0.14)
	var t := "TAP THE CHEST"
	UI.draw_text(ci, f, Vector2(roundf((s.x - UI.text_w(f, t, fs)) / 2.0), roundf(s.y * 0.91 - f.get_descent(fs))), t, fs, UI.GOLD_HI, "outline")


func _paint_panel(ci: CanvasItem, s: Vector2) -> void:
	frame(ci, s)
	if _m.is_empty(): return
	var x0: float = _m["x0"]
	var w: float = _m["w"]
	var rh: float = _m["row_h"]
	var y: float = _m["odds_y"]
	var prog = _prog
	var fs := _odds_fs()
	var sfs := roundi(UI.r(0.6875))
	var p := float(UI.px)
	var tiers: Array = CharacterSkins.SKIN_RARITIES.duplicate()
	tiers.reverse()
	for r in tiers:
		var row := Rect2(x0, y, w, rh)
		GachaScreen.tier_row(ci, row, r)
		var mid := row.position.y + (rh - p) / 2.0
		# Columns: 6.2rem tier, 3.2rem odds, the owned bar, 3.2rem count.
		var cx := row.position.x + UI.c(8)
		GachaScreen.tier_word(ci, cx, mid, r, fs)
		cx += UI.r(6.2) + UI.r(0.5)
		var pct := "%s%%" % UI.num(roundf(float(CharacterCollection.ODDS[r]) * 1000.0) / 10.0)
		var f := UI.font("700")
		ci.draw_string(f, Vector2(cx + UI.r(3.2) - UI.text_w(f, pct, fs), ShopKit.base_at(f, fs, mid)), pct, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.TEXT)
		cx += UI.r(3.2) + UI.r(0.5)
		var got: float = prog[r][0]
		var all: float = prog[r][1]
		var bw := row.end.x - UI.c(8) - UI.r(3.2) - UI.r(0.5) - cx
		var bar := Rect2(cx, roundf(mid - p * 1.5), bw, p * 3)
		ci.draw_rect(bar.grow(p), UI.INK)
		ci.draw_rect(bar, Color("#120c20"))
		if got > 0: ci.draw_rect(Rect2(bar.position, Vector2(maxf(p, bw * got / maxf(1.0, all)), bar.size.y)), ShopKit.TIER_C[r])
		var cnt := "%d/%d" % [got, all]
		var sf := UI.font("500")
		ci.draw_string(sf, Vector2(row.end.x - UI.c(8) - UI.text_w(sf, cnt, sfs), ShopKit.base_at(sf, sfs, mid)), cnt, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)
		y += rh + _odds_gap()
	# Pity: how many chests until a Mythic is certain.
	var pfs := roundi(UI.r(0.8125))
	var left := int(CharacterCollection.EPIC_PITY - CharacterCollection.pity())
	var pm: float = _m["pity_y"] + pfs * 0.65
	var gs := UI.glyph_size(pfs * 1.1)
	var epic: Color = ShopKit.TIER_C["epic"]
	UI.draw_glyph(ci, "star", Vector2(x0, roundf(pm - gs / 2.0)), gs, epic)
	var f5 := UI.font("500")
	var f7 := UI.font("700")
	var px := x0 + gs + pfs * 0.35
	var base := ShopKit.base_at(f5, pfs, pm)
	for part in [[f5, "Mythic guaranteed within ", UI.MUTED], [f7, str(left), epic], [f5, " chest" if left == 1 else " chests", UI.MUTED]]:
		ci.draw_string(part[0], Vector2(px, base), part[1], HORIZONTAL_ALIGNMENT_LEFT, -1, pfs, part[2])
		px += UI.text_w(part[0], part[1], pfs)
	_note.draw(ci, Vector2(x0, _m["note_y"]))
	var nfs := _note_fs()
	var ngs := UI.glyph_size(nfs * 1.1)
	UI.draw_glyph(ci, "swords", Vector2(x0, roundf(_m["earn_y"] + (_earn.lh - ngs) / 2.0)), ngs, UI.GOLD)
	_earn.draw(ci, Vector2(x0 + ngs + nfs * 0.4, _m["earn_y"]))


# --- The opening ---------------------------------------------------------------------------------

func open(count: int) -> void:
	if busy: return
	var pulls = CharacterCollection.open_chest(count)
	if pulls == null:
		Sfx.sfx.play("back")
		(_buy10 if count == 10 else _buy1).nope()
		return
	_set_busy(true)
	_clear_reveal()
	_set_opening(true)
	Sfx.sfx.play("confirm")
	fx.reset()
	fx.look = "grand" if count == 10 else "wood"
	fx.set_centered(true)
	Sfx.sfx.play("whoosh")
	await wait(0.6)
	if dead: return
	await _play(pulls, count)


func _again(n: int) -> ShopKit.Btn:
	var cost: int = CharacterCollection.PULL_COST if n == 1 else CharacterCollection.TEN_COST
	var b := ShopKit.Btn.new([{"t": "Open another" if n == 1 else "Open 10 more"}, {"gem": str(cost)}], "primary")
	b.between = true
	b.glint = true
	b.disabled = CharacterCollection.gems() < cost
	b.pressed.connect(func(): open(n))
	return b


## The show: the chest charges up to the best pull, a legendary or mythic gets its
## omen, then the lid blows and the cards come out.
func _play(pulls: Array, count: int) -> void:
	var top := 0
	for p in pulls: top = maxi(top, ShopKit.rank(p["skin"]["rarity"]))
	var top_tier: String = CharacterSkins.SKIN_RARITIES[top]
	# Charge: the chest rattles and its light climbs one tier at a time.
	_rattle = 0.0
	for i in top + 1:
		if dead: return
		if skipping:
			fx.tier = top_tier
			fx.glow = 1
			break
		fx.pulse(CharacterSkins.SKIN_RARITIES[i])
		fx.glow = 0.45 + i * 0.18
		fx.shake = 0.6 + i * 0.5
		if i > 0: Sfx.sfx.play("tierUp", 0, i)
		await wait(0.8 if i < top else 0.75)
	_rattle = -1.0
	if dead: return
	# The omen: only for the two best tiers, and never when skipping.
	if top >= 2 and not skipping: await _omen(top_tier)
	if dead: return
	# Light rushes into the chest, then it blows.
	fx.release()
	if not skipping:
		fx.gather(top_tier)
		Sfx.sfx.play("gather", 0, top + 1)
		await wait(0.6)
		if dead: return
	fx.burst(top_tier)
	fx.rays = 1
	Sfx.sfx.play("chestOpen", 0, top + 1)
	later(0.38, func(): Sfx.sfx.play("coins"))
	await wait(0.35)
	banner.hide_banner()
	if dead: return
	var m = fx.screen_of(fx.get_mouth())
	if pulls.size() == 1: show_one(pulls[0], m, _again(1), 0.06 if skipping else 0.56)
	else: await _show_ten(pulls, m)
	if dead: return
	_set_busy(false)
	head.refresh()


func _omen(tier: String) -> void:
	var epic := tier == "epic"
	fx.omen(tier)
	Sfx.sfx.play("omen", 0, 2 if epic else 1)
	await wait(1.3 if epic else 0.95)
	if dead or skipping: return
	slam_banner(tier)
	fx.slam(tier)
	await wait(1.5 if epic else 1.1)


func _on_big_flip(r: Rect2, tier: String) -> void:
	fx.glow_at(r, tier, 1.6)
	if ShopKit.rank(tier) >= 2:
		var at = fx.point_of(r)
		fx.impact_at(at["x"], at["y"], tier)


func _show_ten(pulls: Array, mouth: Vector2) -> void:
	var box := _reveal_box()
	var cs := ShopKit.Card.small_size()
	var gx := UI.r(0.55)
	var gy := UI.r(0.4)
	var gw := cs.x * 5 + gx * 4
	var gh := cs.y * 2 + gy
	var row_h := box.size.y - _foot_h() - UI.r(0.4)
	var o := Vector2(roundf(box.get_center().x - gw / 2.0), roundf(box.position.y + (row_h - gh) / 2.0))
	var list: Array = []
	for i in pulls.size():
		var c := ShopKit.Card.new(pulls[i], false)
		c.size = cs
		c.position = o + Vector2((i % 5) * (cs.x + gx), floori(i / 5.0) * (cs.y + gy))
		reveal.add_child(c)
		cards.append(c)
		list.append(c)
		# Dealt out of the chest, face down.
		c.deal(mouth - (c.position + cs / 2.0), i * 0.045)
		later(0.06 + i * 0.045, func(): Sfx.sfx.play("deal", ((i % 5) - 2) * 0.25))
	Sfx.sfx.play("whoosh")
	await wait(0.9)
	# Turned over one by one; anything better than rare shakes first.
	for i in list.size():
		if dead: return
		if skipping: break
		var p: Dictionary = pulls[i]
		var c: ShopKit.Card = list[i]
		var r: String = p["skin"]["rarity"]
		if r != "rare":
			c.tease = true
			Sfx.sfx.play("rattle")
			await wait(0.7 if r == "epic" else 0.4)
			if dead: return
			if skipping: break
		_flip(c, r, true)
		await wait(0.14 if r == "rare" else (1.2 if r == "epic" else (0.9 if r == "legendary" else 0.45)))
	if dead: return
	# Skipped: everything left turns over at once, with the best one's sound.
	var best_left = null
	for i in list.size():
		var c: ShopKit.Card = list[i]
		if c.flipped(): continue
		_flip(c, c.tier, false)
		if best_left == null or ShopKit.rank(c.tier) > ShopKit.rank(best_left.tier): best_left = c
	if best_left != null:
		Sfx.sfx.play(ShopKit.REVEAL[best_left.tier])
		var at = fx.point_of(Rect2(best_left.position, best_left.size))
		fx.pop(at["x"], at["y"], best_left.tier, 30)
	# The best of the ten stays lit.
	var top: ShopKit.Card = list[0]
	for c in list:
		if ShopKit.rank(c.tier) > ShopKit.rank(top.tier): top = c
	if ShopKit.rank(top.tier) >= 1:
		top.best = true
		reveal.move_child(top, -1)
	var fresh := 0
	for p in pulls:
		if p["fresh"]: fresh += 1
	var bk := PxButton.new("Back", "back")
	bk.pressed.connect(_back_to_shop)
	var rest := " · %d to your spares" % (pulls.size() - fresh) if fresh < pulls.size() else ""
	set_foot([foot_text("%d new" % fresh, rest), bk, _again(10)])


func _flip(c: ShopKit.Card, r: String, loud: bool) -> void:
	c.turn_over()
	if ShopKit.rank(r) >= 2:
		c.glory()
		reveal.move_child(c, -1)
	if not loud: return
	Sfx.sfx.play("flip" if r == "rare" else ShopKit.REVEAL[r])
	var rect := Rect2(c.position, c.size)
	var at = fx.point_of(rect)
	fx.pop(at["x"], at["y"], r, 10 if r == "rare" else 30)
	if r != "rare": fx.glow_at(rect, r, 0.7 if r == "mythic" else 1.4)
	if ShopKit.rank(r) >= 2:
		fx.impact_at(at["x"], at["y"], r)
		fx.ray_tier = r


func _back_to_shop() -> void:
	fx.look = "wood"
	super()
