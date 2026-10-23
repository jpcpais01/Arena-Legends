class_name BattleScene
extends Control
## The arena on screen and the battle in it (the battle half of the web's
## main.ts). Two kinds of match:
##  - the background duel behind the title and the menus (`demo`): random
##    rivals, quiet, the classic camera, a new one shortly after each ends;
##  - a fight (`fight`): both heroes' entrances, 3-2-1, the battle (simulated
##    on its own thread, see BattleFeed) with the HUD, then `ended`.
## The arena is painted (first time on this screen size) or loaded on a
## worker while "loading"; the next one paints ahead during a match.

signal ended(battle)
## The intro is over: the fight is on.
signal fight_started

var screen: BattleScreen
var view
var feed: BattleFeed
var hud: BattleHud
## "idle", "loading", "intro", "battle", "results".
var _state := "idle"
## A fight (with entrances, countdown and HUD) rather than the background duel.
var _fight := false
var _intro_t := 0.0
var _intro_len := 0.0
var _count := -1
var _wait_t := 0.0
var _demo_wait := -1.0
## The match on screen (or loading): seed, fighters, theme, and what to do with it.
var _match := {}
## The next background duel, picked early so its arena paints ahead.
var _next_demo := {}
## Main-thread milliseconds per frame (smoothed): the view and HUD, not the GPU.
var cpu_ms := 0.0
## Frozen: a full screen covers the arena (it stays on its last frame).
var frozen := false
## Fight settings.
var cam_mode := "classic"
var speed := 1
var min_number := 50
## Arena pick: "random" or a theme id.
var arena_pick := "random"
## Tests: fights back to back on a fixed seed and arena.
var auto := false
var seed_override := -1
var arena_override := ""


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if size.x < 2: size = get_viewport_rect().size
	screen = BattleScreen.new()
	add_child(screen.display)
	add_child(screen)
	view = RenderBattleView.BattleView.new(screen)
	view.listener = {"onEnd": func(b): _on_end(b), "onEvent": func(e): _on_event(e)}
	hud = BattleHud.new()
	add_child(hud)
	hud.visible = false
	if auto: _auto.call_deferred()


func _auto() -> void:
	var a = CharacterProfile.generate_rival()
	var b = CharacterProfile.generate_rival(a["name"])
	var s := seed_override if seed_override >= 0 else randi()
	fight(s, [a, b], theme_for(s))


## The arena for a match: the player's pick, or one from the seed.
func theme_for(seed_: int) -> Dictionary:
	var themes: Array = RenderArenaArt.THEMES
	var id := arena_override if arena_override != "" else arena_pick
	for t in themes:
		if t["id"] == id: return t
	return themes[seed_ % themes.size()]


func _random_pair() -> Dictionary:
	var a = CharacterProfile.generate_rival()
	var b = CharacterProfile.generate_rival(a["name"])
	var s := randi()
	return {"seed": s, "fighters": [a, b], "theme": theme_for(s), "fight": false}


## The background duel: random rivals fighting quietly behind the menus.
func demo() -> void:
	var m := _next_demo if not _next_demo.is_empty() else _random_pair()
	_next_demo = {}
	_load(m)


## Forgets the background duel picked ahead (its arena no longer matches the pick).
func reset_next() -> void:
	_next_demo = {}


## A real fight between two builds: entrances, countdown, the HUD, then `ended`.
func fight(seed_: int, fighters: Array, theme: Dictionary) -> void:
	_load({"seed": seed_, "fighters": fighters, "theme": theme, "fight": true})


func _load(m: Dictionary) -> void:
	if screen.display.size.x < 2:
		# Not laid out yet: try again next frame.
		get_tree().process_frame.connect(_load.bind(m), CONNECT_ONE_SHOT)
		return
	screen._layout()
	if feed != null: feed.stop()
	feed = null
	_match = m
	_fight = m["fight"]
	_demo_wait = -1.0
	hud.visible = _fight
	# The arena paints (first time on this screen size) or loads on a worker meanwhile.
	ArenaCache.prepare(m["theme"], screen.w, screen.h)
	_state = "loading"
	_wait_t = 0.0


func _start() -> void:
	var m := _match
	var fs: Array = m["fighters"]
	var battle = SimBattle.Battle.new({"seed": m["seed"], "fighters": [TS.merge([fs[0]]), TS.merge([fs[1]])]})
	feed = BattleFeed.new(battle)
	view.quiet = not _fight
	view.cam_mode = cam_mode if _fight else "classic"
	view.focus = 0
	view.hold = _fight
	view.paused = false
	view.speed = speed if _fight else 1
	view.min_number = min_number
	# The last match's sprite atlases.
	if view.fighters != null:
		for f in view.fighters: f["bank"].release()
	view.start(feed.live, m["theme"])
	ArenaCache.trim([m["theme"]["id"]])
	if _fight:
		hud.setup(feed.live, m["theme"]["name"])
		var a = fs[0]
		var b = fs[1]
		_intro_len = view.play_entrances([CharacterEntrances.entrance_of(a["look"], true), CharacterEntrances.entrance_of(b["look"], false)])
		view.set_finales([CharacterFinales.finisher_of(a["look"], true), CharacterFinales.finisher_of(b["look"], false)], [CharacterFinales.pose_of(a["look"], true), CharacterFinales.pose_of(b["look"], false)])
		_intro_t = 0.0
		_count = -1
		_state = "intro"
	else:
		_state = "battle"
	feed.start()
	# Paint the next background duel's arena meanwhile.
	if _next_demo.is_empty():
		_next_demo = _random_pair()
		ArenaCache.prepare(_next_demo["theme"], screen.w, screen.h)


## Pauses or resumes the fight.
## Freezes the arena on its last frame while a full screen covers it: nothing
## simulates, draws or renders until it thaws.
func freeze(on: bool) -> void:
	frozen = on
	screen.hold(on)


func set_paused(on: bool) -> void:
	view.paused = on


func set_speed(s: int) -> void:
	speed = s
	if _fight: view.speed = s


func set_cam(mode: String) -> void:
	cam_mode = mode
	if _fight and view.battle != null: view.cam_mode = mode


## A fight is loading, in its intro or running.
func in_fight() -> bool:
	return _fight and _state != "results" and _state != "idle"


func _process(dt: float) -> void:
	if frozen: return
	if _state == "loading":
		_wait_t += dt
		if ArenaCache.is_ready(_match["theme"], screen.w, screen.h): _start()
		else:
			if _fight: hud.loading(_wait_t)
			return
	if view == null or feed == null: return
	if _state == "intro": _intro(dt)
	if _demo_wait >= 0.0:
		_demo_wait -= dt
		if _demo_wait < 0.0:
			demo()
			return
	var t0 := Time.get_ticks_usec()
	# A fresh frame: the last one's draw lists go (the web canvas is simply drawn over).
	screen.g.begin()
	view.frame(dt)
	if hud.visible: hud.update_from(view, feed.live, 0.0 if view.paused else dt)
	cpu_ms += ((Time.get_ticks_usec() - t0) / 1000.0 - cpu_ms) * 0.1


## Names and entrances, sprite warm-up, then 3-2-1. The sim holds until FIGHT.
func _intro(dt: float) -> void:
	_intro_t += dt
	var ready: bool = view.warm(6)
	if _count < 0:
		if _intro_t > maxf(1.3, _intro_len + 0.15) and ready:
			_count = 3
			_intro_t = 0.0
			hud.banner("3", "", 0)
			Sfx.sfx.play("ui")
		return
	if _intro_t >= 0.55:
		_intro_t = 0.0
		_count -= 1
		if _count > 0:
			hud.banner(str(_count), "", 0)
			Sfx.sfx.play("ui")
		else:
			hud.banner("FIGHT!", "", 0.8)
			Sfx.sfx.play("start")
			view.hold = false
			_state = "battle"
			fight_started.emit()


func _on_event(e) -> void:
	if hud.visible: hud.on_event(e)


func _on_end(b) -> void:
	if _state != "battle": return
	if not _fight:
		# The background duel: another one shortly.
		_demo_wait = 1.5
		return
	_state = "results"
	hud.banner("K.O." if b.fighters.any(func(f): return not f["alive"]) else "TIME", "", 0)
	if auto:
		get_tree().create_timer(3.0).timeout.connect(_auto)
	ended.emit(b)


func _exit_tree() -> void:
	if feed != null: feed.stop()
	# Leaving the tree only happens on quit: no worker may still be drawing then.
	if view != null and view.fighters != null:
		for f in view.fighters: f["bank"].release()
	ArenaCache.finish_all()
