class_name BattleScene
extends Control
## A battle on screen: the arena, both heroes' entrances, 3-2-1, the fight
## (simulated on its own thread, see BattleFeed) and the KO. For now it runs
## AI duels back to back between generated rivals.

signal ended(winner: int)

var screen: BattleScreen
var view
var feed: BattleFeed
var hud: BattleHud
## Seconds into the intro, the entrances' length, the countdown (-1: not started).
var _intro_t := 0.0
var _intro_len := 0.0
var _count := -1
var _state := "idle"
var _end_wait := -1.0
var _wait_t := 0.0
## Main-thread milliseconds per frame (smoothed): the view and HUD, not the GPU.
var cpu_ms := 0.0
## This match and the next one (picked early so its arena can paint ahead).
var _match := {}
var _next := {}
## Fixed seed and arena for tests (env AL_SEED / AL_ARENA).
var seed_override := -1
var arena_override := ""


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	if size.x < 2: size = get_viewport_rect().size
	screen = BattleScreen.new()
	add_child(screen.display)
	add_child(screen)
	view = RenderBattleView.BattleView.new(screen)
	view.listener = {"onEnd": func(b): _on_end(b), "onEvent": func(e): _on_event(e)}
	hud = BattleHud.new()
	add_child(hud)
	# Once the layout has given the screen its size.
	begin.call_deferred()


func begin() -> void:
	if screen.display.size.x < 2:
		# Not laid out yet: try again next frame.
		get_tree().process_frame.connect(begin, CONNECT_ONE_SHOT)
		return
	screen._layout()
	if feed != null: feed.stop()
	feed = null
	if _next.is_empty(): _next = _pick()
	_match = _next
	_next = {}
	# The arena paints (first time on this screen size) or loads on a worker meanwhile.
	ArenaCache.prepare(_match["theme"], screen.w, screen.h)
	_state = "loading"
	_wait_t = 0.0


## Seed, rivals and arena for a match.
func _pick() -> Dictionary:
	var seed_ := seed_override if seed_override >= 0 else randi()
	var a = CharacterProfile.generate_rival()
	var b = CharacterProfile.generate_rival(a["name"])
	var themes: Array = RenderArenaArt.THEMES
	var theme = themes[seed_ % themes.size()]
	for t in themes:
		if t["id"] == arena_override: theme = t
	return {"seed": seed_, "a": a, "b": b, "theme": theme}


func _start() -> void:
	var a = _match["a"]
	var b = _match["b"]
	var theme = _match["theme"]
	var battle = SimBattle.Battle.new({"seed": _match["seed"], "fighters": [TS.merge([a]), TS.merge([b])]})
	feed = BattleFeed.new(battle)
	view.quiet = false
	view.cam_mode = "action"
	view.focus = 0
	view.hold = true
	view.paused = false
	view.speed = 1
	# The last match's sprite atlases.
	if view.fighters != null:
		for f in view.fighters: f["bank"].release()
	view.start(feed.live, theme)
	ArenaCache.trim([theme["id"]])
	hud.setup(feed.live, theme["name"])
	_intro_len = view.play_entrances([CharacterEntrances.entrance_of(a["look"]), CharacterEntrances.entrance_of(b["look"])])
	view.set_finales([CharacterFinales.finisher_of(a["look"]), CharacterFinales.finisher_of(b["look"])], [CharacterFinales.pose_of(a["look"]), CharacterFinales.pose_of(b["look"])])
	_intro_t = 0.0
	_count = -1
	_end_wait = -1.0
	_state = "intro"
	feed.start()
	# Paint the next match's arena while this one plays.
	_next = _pick()
	ArenaCache.prepare(_next["theme"], screen.w, screen.h)


func _process(dt: float) -> void:
	if _state == "loading":
		_wait_t += dt
		if ArenaCache.is_ready(_match["theme"], screen.w, screen.h): _start()
		else:
			hud.loading(_wait_t)
			return
	if view == null or feed == null: return
	if _state == "intro": _intro(dt)
	if _end_wait >= 0.0:
		_end_wait += dt
		if _end_wait > 3.0:
			begin()
			return
	var t0 := Time.get_ticks_usec()
	# A fresh frame: the last one's draw lists go (the web canvas is simply drawn over).
	screen.g.begin()
	view.frame(dt)
	hud.update_from(view, feed.live, dt)
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
		return
	if _intro_t >= 0.55:
		_intro_t = 0.0
		_count -= 1
		if _count > 0: hud.banner(str(_count), "", 0)
		else:
			hud.banner("FIGHT!", "", 0.8)
			view.hold = false
			_state = "battle"


func _on_event(e) -> void:
	hud.on_event(e)


func _on_end(b) -> void:
	if _state != "battle": return
	_state = "results"
	hud.banner("K.O." if b.fighters.any(func(f): return not f["alive"]) else "TIME", "", 0)
	ended.emit(int(b.winner))
	_end_wait = 0.0


func _exit_tree() -> void:
	if feed != null: feed.stop()
