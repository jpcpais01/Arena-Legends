class_name Game
extends Control
## The game's flow (the menu half of the web's main.ts): the title over the
## background duel, the home screen, your hero against the rival with the
## fight controls, the results, and the settings and patch notes sheets. It
## owns the saved state these touch: hero, rival, record, gems, XP, settings.

const SPEEDS := [1, 2, 4]

var battle: BattleScene
var home: HomeMenu
var controls: FightControls
var _title: TitleScreen
var _sheet: Sheet
## A full screen over the frozen arena (the Armory).
var _screen: Control
var _toast: Toast

var player
var rival
var record := {"w": 0, "l": 0}
var speed := 1
var sound_on := true
var volume := {"master": 1.0, "music": 1.0, "sfx": 1.0}
var quotes_on := true
var hide_small := true
var cam_mode := "classic"
var arena_pick := "random"
## "title", "menu", "fight", "results".
var state := "title"


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _ready() -> void:
	if size.x < 2: size = get_viewport_rect().size
	UI.setup(size)
	_load()
	battle = BattleScene.new()
	battle.arena_pick = arena_pick
	battle.cam_mode = cam_mode
	battle.speed = speed
	battle.min_number = 50 if hide_small else 0
	add_child(battle)
	battle.hud.set_bubbles(quotes_on)
	battle.ended.connect(_on_end)
	home = HomeMenu.new()
	home.visible = false
	add_child(home)
	home.fight.connect(start_fight)
	home.new_rival.connect(func():
		_set_rival(CharacterProfile.generate_rival(player["name"]))
		_refresh_menu())
	home.hero.connect(func(): open_creator(_free_points() > 0))
	home.sound.connect(func():
		sound_on = not sound_on
		Store.set_item("al.sound", JSON.stringify(sound_on))
		home.set_sound(sound_on))
	home.settings.connect(open_settings)
	home.notes.connect(open_notes)
	home.armory.connect(open_armory)
	for sig in [home.online, home.world, home.shop]:
		sig.connect(func(): _soon())
	controls = FightControls.new()
	controls.visible = false
	add_child(controls)
	controls.settings.connect(open_settings)
	controls.camera.connect(_cycle_camera)
	controls.speed.connect(func():
		speed = SPEEDS[(SPEEDS.find(speed) + 1) % SPEEDS.size()]
		Store.set_item("al.speed", str(speed))
		battle.set_speed(speed)
		controls.set_speed(speed))
	controls.pause.connect(_toggle_pause)
	controls.leave.connect(to_menu)
	controls.set_speed(speed)
	_toast = Toast.new()
	add_child(_toast)
	_title = TitleScreen.new()
	add_child(_title)
	_title.start.connect(func():
		_title = null
		if player != null:
			to_menu()
			return
		# A first start: the hero creator, then the home screen.
		state = "menu"
		open_creator())
	battle.demo()
	get_viewport().size_changed.connect(func(): UI.setup(get_viewport_rect().size))


# --- Saved state -----------------------------------------------------------------------------

func _saved(key: String, fallback):
	var raw = Store.get_item(key)
	if raw == null: return fallback
	var v = JSON.parse_string(raw)
	return fallback if v == null else v


func _load() -> void:
	# Null until the first hero is made (the title opens the creator).
	player = CharacterProfile.load_character()
	CharacterCollection.load_collection(player.get("skins") if player != null else null)
	var r = _saved("al.record", {})
	if r is Dictionary: record = {"w": int(r.get("w", 0)), "l": int(r.get("l", 0))}
	var sp := int(_saved("al.speed", 1))
	speed = sp if SPEEDS.has(sp) else 1
	sound_on = _saved("al.sound", true) != false
	var vol = _saved("al.volume", {})
	if _saved("al.music", true) == false: volume["music"] = 0.0
	if vol is Dictionary:
		for k in volume:
			if vol.has(k): volume[k] = clampf(float(vol[k]), 0.0, 1.0)
	quotes_on = _saved("al.quotes", true) != false
	hide_small = _saved("al.hideSmallNumbers", true) != false
	cam_mode = str(_saved("al.camera", "classic"))
	if not RenderBattleView.CAM_MODES.any(func(m): return m["id"] == cam_mode): cam_mode = "classic"
	arena_pick = str(_saved("al.arena", "random"))
	if arena_pick != "random" and not RenderArenaArt.THEMES.any(func(t): return t["id"] == arena_pick): arena_pick = "random"
	rival = _load_rival()
	if rival == null: rival = CharacterProfile.generate_rival(player["name"] if player != null else null)
	_set_rival(rival)
	_sync_level()


func _load_rival():
	var raw = _saved("al.rival", null)
	if not (raw is Dictionary) or not (raw.get("name") is String): return null
	var b = SimLoadout.sanitize_build(raw, SimLoadout.DEFAULT_BUILDS[1])
	# Rivals always fight Balanced.
	return TS.merge([b, {"look": CharacterAppearance.sanitize_appearance(raw.get("look")), "style": "balanced"}])


func _set_rival(r) -> void:
	rival = r
	Store.set_item("al.rival", JSON.stringify(r))


## The rival as they fight: as many stat points as the hero has earned, spent their own way.
func rival_now():
	var lv := int(CharacterProgress.hero_level())
	var r: Dictionary = TS.merge([rival])
	var train = SimTraining.auto_training(CharacterProgress.points_at(lv), SimTraining.str_hash(rival["name"]))
	if train != null: r["train"] = train
	else: r.erase("train")
	if lv > 1: r["level"] = lv
	else: r.erase("level")
	return r


## Keeps the saved hero's level in step with its XP.
func _sync_level() -> void:
	if player == null: return
	var lv := int(CharacterProgress.hero_level())
	if int(player.get("level", 1)) == lv: return
	if lv > 1: player["level"] = lv
	else: player.erase("level")
	CharacterProfile.save_character(player)


func _free_points() -> int:
	if player == null: return 0
	return maxi(0, int(CharacterProgress.points_at(CharacterProgress.hero_level()) - SimTraining.spent_points(player.get("train"))))


func _refresh_menu() -> void:
	_sync_level()
	home.set_heroes(player, rival_now(), record)
	home.set_points(_free_points())
	var g := int(CharacterCollection.gems())
	home.set_gems(g, g >= CharacterCollection.PULL_COST)
	home.set_sound(sound_on)
	home.set_notes_unseen(str(_saved("al.notesSeen", "")) != str(Patchnotes.PATCH_NOTES[0]["version"]))


# --- Flow ------------------------------------------------------------------------------------

func to_menu() -> void:
	var from_fight := state == "fight" or state == "results"
	state = "menu"
	_close_sheet()
	controls.visible = false
	_refresh_menu()
	home.visible = true
	home.enter()
	if from_fight: battle.demo()


func start_fight() -> void:
	_close_sheet()
	state = "fight"
	home.visible = false
	controls.visible = true
	controls.set_paused(false)
	controls.set_speed(speed)
	var seed_ := randi()
	battle.fight(seed_, [player, rival_now()], battle.theme_for(seed_))


func _toggle_pause() -> void:
	if state != "fight": return
	var p: bool = not battle.view.paused
	battle.set_paused(p)
	controls.set_paused(p)


func _cycle_camera() -> void:
	var modes: Array = RenderBattleView.CAM_MODES
	var i := 0
	for j in modes.size():
		if modes[j]["id"] == cam_mode: i = j
	var m: Dictionary = modes[(i + 1) % modes.size()]
	cam_mode = m["id"]
	Store.set_item("al.camera", JSON.stringify(cam_mode))
	battle.set_cam(cam_mode)
	controls.announce(m["name"])


func _on_end(b) -> void:
	if state != "fight": return
	state = "results"
	controls.visible = false
	var w := int(b.winner)
	if w == 0: record["w"] += 1
	elif w == 1: record["l"] += 1
	Store.set_item("al.record", JSON.stringify(record))
	var hp := maxf(0.0, SimFighter.hp_ratio(b.fighters[0]))
	var reward = null
	if w == 0:
		Sfx.sfx.play("win")
		reward = {"gems": CharacterCollection.win_gems(hp), "hp": hp}
		CharacterCollection.add_gems(reward["gems"])
	var xp = CharacterProgress.add_xp(CharacterProgress.quick_xp(w == 0, w == -1, hp))
	_sync_level()
	# The K.O. or TIME banner first, then the sheet.
	await get_tree().create_timer(1.2).timeout
	if state != "results": return
	var r := ResultsSheet.new(b, reward, xp)
	r.rematch.connect(start_fight)
	r.new_rival.connect(func():
		_set_rival(CharacterProfile.generate_rival(player["name"]))
		start_fight())
	r.menu.connect(to_menu)
	_open(r)


# --- Sheets ----------------------------------------------------------------------------------

func _open(s: Sheet) -> void:
	_close_sheet()
	_sheet = s
	s.closed.connect(func(): if _sheet == s: _sheet = null)
	add_child(s)


func _close_sheet() -> void:
	if _sheet != null and is_instance_valid(_sheet):
		_sheet.close()
	_sheet = null


func open_settings() -> void:
	var s := SettingsSheet.new({"quotes": quotes_on, "smallNumbers": hide_small, "volume": volume.duplicate(), "arena": arena_pick})
	s.changed.connect(_apply_settings)
	_open(s)


func _apply_settings(s: Dictionary) -> void:
	if s["quotes"] != quotes_on:
		quotes_on = s["quotes"]
		Store.set_item("al.quotes", JSON.stringify(quotes_on))
		battle.hud.set_bubbles(quotes_on)
	if s["smallNumbers"] != hide_small:
		hide_small = s["smallNumbers"]
		Store.set_item("al.hideSmallNumbers", JSON.stringify(hide_small))
		battle.min_number = 50 if hide_small else 0
		if battle.view != null: battle.view.min_number = battle.min_number
	if s["volume"] != volume:
		volume = s["volume"].duplicate()
		Store.set_item("al.volume", JSON.stringify(volume))
		# Raising a slider while muted from the menu switch unmutes.
		if not sound_on and volume["master"] > 0:
			sound_on = true
			Store.set_item("al.sound", "true")
			home.set_sound(true)
	if s["arena"] != arena_pick:
		arena_pick = s["arena"]
		Store.set_item("al.arena", JSON.stringify(arena_pick))
		battle.arena_pick = arena_pick
		battle.reset_next()
		# The menu's view changes at once; a fight keeps its arena.
		if not battle.in_fight(): battle.demo()


# --- Full screens ------------------------------------------------------------------------------

## The hero creator: a new hero (first start, no way out but making one) or editing
## yours, on the Stats step when `stats`.
func open_creator(stats := false) -> void:
	_close_sheet()
	var first: bool = player == null
	var cr := Creator.new(CharacterProfile.new_character() if first else player, not first, stats)
	cr.done.connect(func(c):
		player = c
		CharacterProfile.save_character(c)
		_sync_level()
		_close_screen())
	cr.closed.connect(_close_screen)
	_open_screen(cr)


func open_armory() -> void:
	_close_sheet()
	var a := Armory.new(player)
	a.changed.connect(func(c):
		player = c
		CharacterProfile.save_character(c))
	a.closed.connect(_close_screen)
	a.shop.connect(_soon)
	_open_screen(a)


## A full screen covers the arena (frozen on its last frame) and the home screen.
func _open_screen(s: Control) -> void:
	_close_screen()
	_screen = s
	home.visible = false
	battle.freeze(true)
	add_child(s)
	move_child(_toast, -1)


func _close_screen() -> void:
	if _screen == null: return
	_screen.queue_free()
	_screen = null
	battle.freeze(false)
	if state == "menu":
		_refresh_menu()
		home.visible = true
		home.enter()


func open_notes() -> void:
	Store.set_item("al.notesSeen", JSON.stringify(str(Patchnotes.PATCH_NOTES[0]["version"])))
	home.set_notes_unseen(false)
	_open(NotesSheet.new())


func _soon() -> void:
	_toast.show_text("Coming to Android in the next update")


## Back (Android) closes a sheet, leaves a fight, or quits from the home screen.
func _notification(what: int) -> void:
	if what != NOTIFICATION_WM_GO_BACK_REQUEST: return
	if _screen != null:
		if _screen.has_method("back"): _screen.back()
		else: _close_screen()
	elif _sheet != null and is_instance_valid(_sheet):
		if _sheet.dismissable: _close_sheet()
		elif state == "results": to_menu()
	elif state == "fight": to_menu()
	elif state == "menu": get_tree().quit()


## A short line in a plate over the middle of the screen, fading out.
class Toast extends Control:
	var _text := ""
	var _t := 0.0

	func _init() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_process(false)

	func show_text(t: String) -> void:
		_text = t
		_t = 1.8
		set_process(true)
		queue_redraw()

	func _process(dt: float) -> void:
		_t -= dt
		if _t <= 0.0: set_process(false)
		queue_redraw()

	func _draw() -> void:
		if _t <= 0.0: return
		var a := clampf(_t / 0.4, 0.0, 1.0)
		var fs := roundi(UI.r(0.9375))
		var f := UI.font("700")
		var w := UI.text_w(f, _text, fs) + UI.r(1.2) * 2
		var h := fs + UI.r(0.6) * 2
		var r := UI.rround(Rect2((size.x - w) / 2.0, size.y * 0.42 - h / 2.0, w, h))
		var p := float(UI.px)
		draw_rect(r, Color(UI.INK, a))
		var i := r.grow(-p)
		draw_rect(i, Color(UI.PANEL, a))
		draw_rect(Rect2(i.position, Vector2(i.size.x, p)), Color(1, 1, 1, 0.08 * a))
		draw_rect(Rect2(i.position.x, i.end.y - p * 2, i.size.x, p * 2), Color(0, 0, 0, 0.35 * a))
		draw_rect(i, Color(UI.GOLD_LO, a), false, p)
		UI.draw_text(self, f, Vector2(r.position.x + UI.r(1.2), roundf(r.position.y + (h + f.get_ascent(fs) - f.get_descent(fs)) / 2.0)), _text, fs, Color(UI.TEXT, a), "drop", Color(UI.INK, a))
