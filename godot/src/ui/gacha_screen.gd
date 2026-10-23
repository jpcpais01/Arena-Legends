class_name GachaScreen
extends Control
## What the chest and forge screens share (the web's .scr.gacha): their light show
## painted behind everything, the Shop header, the panel on the right that steps
## aside while something opens, the reveal layer (a tap anywhere skips ahead), the
## Skip key, the tier name slammed on screen, and the quake that comes with it.
## A reveal ends on one big card beside your fighter wearing it, or ten small ones.

signal closed
signal tab(id: String)
## Wears a skin that just came out (equipping its item).
signal equip(skin)
signal _woke

## Returns the hero (or null), to show a new skin on.
var player_fn: Callable
var fx
var head: ShopKit.Head
var banner: ShopKit.TierBanner
var panel: UI.Paint
var reveal: Control
var foot: Control
var skip_btn: UI.Pad
var dead := false
## Something is opening (taps skip ahead).
var busy := false
## The reveal layer is up (until Back).
var opening := false
var skipping := false
var previews: Array = []
var cards: Array = []
var _wait := 0.0
var _open_k := 0.0
var _busy_t := 0.0
var _quake := -1.0
var _foot_t := -1.0
var _unlisten: Callable
var _panel_x := 0.0


func _init(fx_obj, tab_on: String) -> void:
	fx = fx_obj
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	add_child(fx.get_canvas())
	_build_stage()
	panel = UI.Paint.new(_paint_panel)
	panel.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(panel)
	reveal = Control.new()
	reveal.set_anchors_preset(Control.PRESET_FULL_RECT)
	reveal.mouse_filter = Control.MOUSE_FILTER_STOP
	reveal.visible = false
	reveal.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: skip())
	add_child(reveal)
	foot = Control.new()
	foot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	reveal.add_child(foot)
	head = ShopKit.Head.new(tab_on)
	head.tab.connect(func(id: String):
		if not busy: tab.emit(id))
	head.done.connect(close)
	add_child(head)
	skip_btn = UI.Pad.new(_paint_skip)
	skip_btn.tapped.connect(func(_p): skip())
	skip_btn.visible = false
	add_child(skip_btn)
	banner = ShopKit.TierBanner.new()
	add_child(banner)
	_unlisten = CharacterCollection.on_collection(_on_collection)
	resized.connect(_layout)


func _ready() -> void:
	_layout()
	fx.start()


func _exit_tree() -> void:
	dead = true
	_wake()
	fx.stop()
	_unlisten.call()
	_clear_reveal()


## The left-hand stage under the panel (override): taps, hints.
func _build_stage() -> void:
	pass


func _paint_panel(_ci: CanvasItem, _s: Vector2) -> void:
	pass


## Lays out the stage and panel (override, then call this).
func _layout() -> void:
	if size.x < 2: return
	head.size = Vector2(size.x, head.height())
	head.relayout()
	var p := UI.r(0.7)
	var fs := roundi(UI.r(0.75))
	var f := UI.spaced("700", fs, 0.14)
	var w := UI.r(0.85) + UI.text_w(f, "SKIP", fs) + UI.r(0.35) + UI.glyph_size(fs * 0.75) * 2 + p + UI.px * 2
	skip_btn.size = Vector2(w, fs + UI.r(0.8) + UI.px * 2).round()
	skip_btn.position = Vector2(size.x - roundf(size.x * 0.03) - UI.r(0.8) - skip_btn.size.x, UI.c(10) + UI.r(0.7)).round()
	fx.layout(size, UI.dp)
	fx.anchor(_spot())
	_panel_x = panel.position.x


## Where the chest (or anvil) stands, in screen px (override).
func _spot() -> Rect2:
	return Rect2()


## The stage column's width (the web's grid: minmax(14rem, 46%)).
func _col_w() -> float:
	return maxf(UI.r(14), floorf(size.x * 0.46))


func _panel_rect() -> Rect2:
	var x := _col_w() + UI.r(0.25)
	var y := head.height() + UI.r(0.25)
	return UI.rround(Rect2(x, y, size.x - roundf(size.x * 0.03) - x, size.y - UI.r(0.5) - y))


func _on_collection() -> void:
	head.count_to(CharacterCollection.gems())
	if not busy:
		head.refresh()
		_render()


## Redraws the panel's contents (override).
func _render() -> void:
	panel.queue_redraw()


func close() -> void:
	if busy: return
	Sfx.sfx.play("back")
	closed.emit()


## Back: skips ahead, leaves a reveal, or closes the screen.
func back() -> void:
	if busy: skip()
	elif opening: _back_to_shop()
	else: close()


func _back_to_shop() -> void:
	Sfx.sfx.play("back")
	_clear_reveal()
	_set_opening(false)
	fx.set_centered(false)
	fx.reset()
	_render()


# --- Timing ----------------------------------------------------------------------------------

## Waits `s` seconds, or less when the player taps to skip.
func wait(s: float) -> void:
	if skipping or dead: return
	_wait = s
	await _woke


func skip() -> void:
	if not busy: return
	skipping = true
	_wake()


func _wake() -> void:
	if _wait > 0.0:
		_wait = 0.0
		_woke.emit()


## Runs `f` after `s` seconds unless the screen has closed.
func later(s: float, f: Callable) -> void:
	# Bound to this screen, so the timer lets go of it once the screen is freed.
	get_tree().create_timer(s).timeout.connect(_run_later.bind(f))


func _run_later(f: Callable) -> void:
	if not dead and is_inside_tree(): f.call()


func _set_busy(on: bool) -> void:
	busy = on
	head.busy = on
	head.hide_gems = on
	skipping = false
	_busy_t = 0.0
	skip_btn.visible = on


func _set_opening(on: bool) -> void:
	opening = on
	reveal.visible = on
	head.hide_done = on


func _process(dt: float) -> void:
	fx.frame(dt)
	if _wait > 0.0:
		_wait -= dt
		if _wait <= 0.0:
			_wait = 0.0
			_woke.emit()
	# The panel steps aside while something opens (250 ms).
	var to := 1.0 if opening else 0.0
	if _open_k != to:
		_open_k = move_toward(_open_k, to, dt / 0.25)
		panel.modulate.a = 1.0 - _open_k
		panel.position.x = _panel_x + UI.r(2) * _open_k
		panel.visible = _open_k < 1.0
		_stage_fade(1.0 - _open_k)
	if busy:
		_busy_t += dt
		skip_btn.modulate.a = clampf((_busy_t - 0.6) / 0.3, 0.0, 1.0)
	if _quake >= 0.0:
		_quake += dt
		var steps := [Vector2(-6, 3), Vector2(5, -4), Vector2(-4, -2), Vector2(3, 2), Vector2.ZERO, Vector2.ZERO]
		var i := int(_quake / 0.075)
		position = (steps[mini(i, 5)] as Vector2) * UI.dp if _quake < 0.45 else Vector2.ZERO
		if _quake >= 0.45: _quake = -1.0
	if _foot_t >= 0.0:
		_foot_t += dt
		var k := clampf((_foot_t - 0.25) / 0.3, 0.0, 1.0)
		foot.modulate.a = k
		foot.position.y = foot.get_meta("y", 0.0) + UI.r(2.5) * (1.0 - ShopKit.bez(0, 0, 0.58, 1, k))
		if k >= 1.0: _foot_t = -1.0


## Fades the stage's own pieces with the panel (override).
func _stage_fade(_a: float) -> void:
	pass


# --- The show --------------------------------------------------------------------------------

## Slams the tier name on screen and shakes everything.
func slam_banner(tier: String) -> void:
	banner.slam(tier)
	_quake = 0.0
	Sfx.sfx.play("slam")
	Sfx.sfx.play(ShopKit.REVEAL[tier])


func _clear_reveal() -> void:
	if fx != null: fx.set_halo(null)
	for p in previews:
		if is_instance_valid(p): p.queue_free()
	previews.clear()
	for c in cards:
		if is_instance_valid(c): c.queue_free()
	cards.clear()
	for c in foot.get_children(): c.queue_free()


## The reveal area (rows: the cards, then the buttons), in screen px.
func _reveal_box() -> Rect2:
	var sl := roundf(size.x * 0.03)
	var top := UI.c(10) + UI.r(2.6)
	return Rect2(sl, top, size.x - sl * 2, size.y - UI.c(10) - top)


func _foot_h() -> float:
	return UI.r(2.6)


## The buttons under a reveal, centred in a row (`sum`: a line of text before them).
func set_foot(items: Array) -> void:
	for c in foot.get_children(): c.queue_free()
	var box := _reveal_box()
	var gap := UI.r(0.6)
	var h := _foot_h()
	var w := 0.0
	for it in items:
		var c: Control = it
		if c is PxButton:
			c.min_h = 2.6
			c.refit()
		w += c.custom_minimum_size.x
	w += gap * maxf(0, items.size() - 1)
	foot.position = Vector2(roundf(box.get_center().x - w / 2.0), box.end.y - h)
	foot.set_meta("y", foot.position.y)
	foot.size = Vector2(w, h)
	var x := 0.0
	for it in items:
		var c: Control = it
		foot.add_child(c)
		c.size = Vector2(c.custom_minimum_size.x, minf(h, c.custom_minimum_size.y) if not (c is PxButton) else c.custom_minimum_size.y)
		c.position = Vector2(x, roundf((h - c.size.y) / 2.0))
		x += c.size.x + gap
	foot.modulate.a = 0.0
	_foot_t = 0.0


## A line of text for the foot (the ten's "3 new · 7 to your spares").
func foot_text(bold: String, rest: String) -> UI.Paint:
	var fs := roundi(UI.r(0.875))
	var bf := UI.font("700")
	var f := UI.font("500")
	var w := UI.text_w(bf, bold, fs) + UI.text_w(f, rest, fs) + UI.r(0.4)
	return UI.Paint.new(func(ci: CanvasItem, s: Vector2):
		var base := ShopKit.base_at(f, fs, s.y / 2.0)
		ci.draw_string(bf, Vector2(0, base), bold, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.TEXT)
		ci.draw_string(f, Vector2(UI.text_w(bf, bold, fs), base), rest, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.MUTED), Vector2(ceilf(w), fs * 1.4))


## Your fighter wearing `s`, on a pedestal beside the big card (or null without a hero).
func try_on(s: Dictionary) -> FighterPreview:
	var pl = player_fn.call() if player_fn.is_valid() else null
	if pl == null: return null
	var g: Dictionary = SimGear.gear_of(s["gear"])
	var build: Dictionary = SimLoadout.with_gear(pl, g["slot"], s["gear"])
	var sk: Dictionary = (pl.get("skins") if pl.get("skins") is Dictionary else {}).duplicate()
	sk[s["gear"]] = s["id"]
	build = TS.merge([build, {"skins": sk}])
	var pv := FighterPreview.new(build, 72, 78, {"pedestal": true})
	previews.append(pv)
	# A usable item skin is shown being used.
	var use = null
	if g["slot"] == "usable":
		var ab = g.get("abilities")
		if ab is Array and not ab.is_empty() and ab[0].get("anim") != null: use = "use." + str(ab[0]["anim"])
	later(0.5, func(): pv.showcase(use))
	return pv


## One skin out: your fighter wearing it and its big card, flying up from `from`
## (screen px) and turning over; then Back, Equip and `again`.
func show_one(p: Dictionary, from: Vector2, again: Control, flip_delay: float) -> ShopKit.Card:
	var s: Dictionary = p["skin"]
	Sfx.sfx.play("whoosh")
	var box := _reveal_box()
	var row_h := box.size.y - _foot_h() - UI.r(0.4)
	var cs := ShopKit.Card.big_size(size.y)
	var fw := UI.r(17)
	var pv := try_on(s)
	var gap := UI.r(1.5)
	var total := cs.x + (fw + gap if pv != null else 0.0)
	var x := roundf(box.get_center().x - total / 2.0)
	var y := roundf(box.position.y + (row_h - cs.y) / 2.0)
	if pv != null:
		var stage := UI.Paint.new(func(ci: CanvasItem, sz: Vector2):
			UI.glow(ci.get_canvas_item(), Vector2(sz.x * 0.5, sz.y * 0.7), Vector2(sz.x * 0.6, sz.y * 0.45) * 0.7, Color(1, 240 / 255.0, 200 / 255.0, 0.18)))
		stage.position = Vector2(x, y)
		stage.size = Vector2(fw, cs.y)
		stage.modulate.a = 0.0
		reveal.add_child(stage)
		previews.append(stage)
		pv.position = Vector2.ZERO
		pv.size = stage.size
		stage.add_child(pv)
		var tw := stage.create_tween()
		tw.tween_interval(0.35)
		tw.tween_property(stage, "modulate:a", 1.0, 0.5)
		x += fw + gap
	var big := ShopKit.Card.new(p, true)
	big.position = Vector2(x, y)
	big.size = cs
	reveal.add_child(big)
	cards.append(big)
	big.rise(from - (big.position + cs / 2.0))
	var eq: PxButton = null
	if pv != null:
		eq = PxButton.new("Equip", "bag")
		eq.pressed.connect(func():
			equip.emit(s)
			Sfx.sfx.play("equip")
			eq.disabled = true
			eq.set_text("Equipped")
			eq.set_glyph("check"))
	var bk := PxButton.new("Back", "back")
	bk.pressed.connect(_back_to_shop)
	var items: Array = [bk]
	if eq != null: items.append(eq)
	if again != null: items.append(again)
	set_foot(items)
	# By id, not captured: the card can be freed (a skip, a new pull) before this runs.
	var big_id := big.get_instance_id()
	later(flip_delay, func():
		var card = instance_from_id(big_id)
		if card == null: return
		card.turn_over()
		Sfx.sfx.play(ShopKit.REVEAL[s["rarity"]])
		var r := Rect2(card.position, card.size)
		var at = fx.point_of(r)
		fx.pop(at["x"], at["y"], s["rarity"], 40)
		_on_big_flip(r, s["rarity"])
		# The best two tiers keep sparkling round the card.
		if ShopKit.rank(s["rarity"]) >= 2:
			later(0.52, func(): if instance_from_id(big_id) != null and opening: fx.set_halo(r, s["rarity"])))
	return big


## Extra light when the big card turns over (override).
func _on_big_flip(_r: Rect2, _tier: String) -> void:
	pass


# --- Shared drawing ----------------------------------------------------------------------------

## The gold-framed panel (CSS .frame).
func frame(ci: CanvasItem, s: Vector2) -> void:
	var p := float(UI.px)
	UI.panel_fill(ci.get_canvas_item(), Rect2(Vector2(p * 2, p * 2), s - Vector2(p * 4, p * 4)))
	UI.draw_frame(ci.get_canvas_item(), Rect2(Vector2.ZERO, s), "gold")


## A tier row's plate (CSS .odds-row / .forge-row): dark, ink edged, the tier's colour down its left.
static func tier_row(ci: CanvasItem, r: Rect2, tier: String) -> void:
	var p := float(UI.px)
	ci.draw_rect(r, UI.INK)
	var i := r.grow(-p)
	ci.draw_rect(i, Color(0.035, 0.024, 0.06))
	ci.draw_rect(Rect2(i.position, Vector2(p * 2, i.size.y)), ShopKit.TIER_C[tier])


## A tier's name in capitals (Mythic sweeps).
static func tier_word(ci: CanvasItem, x: float, mid: float, tier: String, fs: int) -> float:
	var f := UI.spaced("700", fs, 0.06)
	var t := ShopKit.tier_name(tier).to_upper()
	var base := ShopKit.base_at(f, fs, mid)
	if tier == "epic": ShopKit.sweep_text(ci, f, Vector2(x, base), t, fs, ShopKit.sweep_phase(), "")
	else: UI.draw_text(ci, f, Vector2(x, base), t, fs, ShopKit.TIER_C[tier])
	return UI.text_w(f, t, fs)


func _paint_skip(ci: CanvasItem, s: Vector2) -> void:
	var p := float(UI.px)
	var r := Rect2(Vector2.ZERO, s)
	UI.notch_rect(ci.get_canvas_item(), r, Color(1, 1, 1, 0.18), p)
	ci.draw_rect(r.grow(-p), Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.6))
	var fs := roundi(UI.r(0.75))
	var f := UI.spaced("700", fs, 0.14)
	var mid := s.y / 2.0
	var x := UI.r(0.85)
	ci.draw_string(f, Vector2(x, ShopKit.base_at(f, fs, mid)), "SKIP", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.TEXT)
	x += UI.text_w(f, "SKIP", fs) + UI.r(0.35)
	var gs := UI.glyph_size(fs * 0.75)
	for i in 2:
		UI.draw_glyph(ci, "play", Vector2(x + i * (gs - 1), roundf(mid - gs / 2.0)), gs, UI.TEXT)
