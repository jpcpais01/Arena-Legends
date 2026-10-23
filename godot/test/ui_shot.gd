extends SceneTree
## Walks the game's screens and saves a screenshot of each (GPU run):
##   xvfb-run -a -s "-screen 0 1600x720x24" godot --path godot --rendering-driver vulkan \
##     --rendering-method mobile --resolution 1600x720 -s res://test/ui_shot.gd -- /tmp/ui
## Title, home, settings, patch notes, the Armory (and its loadouts), a fight,
## and its results (at 4x). With a second argument `creator` it instead starts
## with no hero and walks the hero creator: every step, the reveal, then the
## Stats step of the editor.

var _out := "/tmp/ui"
var _game: Game
var _t := 0.0
var _step := 0
var _wait := 0.0
var _shot := ""
var _ended_at := -1.0
var _creator := false


func _initialize() -> void:
	var a := OS.get_cmdline_user_args()
	_out = a[0] if a.size() > 0 else _out
	DirAccess.make_dir_recursive_absolute(_out)
	_creator = a.size() > 1 and a[1] == "creator"
	if _creator:
		Store.remove_item("al.character")
		Store.set_item("al.progress", JSON.stringify({"xp": 900}))
	Store.set_item("al.speed", "4")
	_game = Game.new()
	root.add_child(_game)


func _snap(name: String) -> void:
	_shot = name


func _process(dt: float) -> bool:
	_t += dt
	if _shot != "":
		root.get_texture().get_image().save_png("%s/%s.png" % [_out, _shot])
		print("shot %s at %.1fs (cpu %.1f ms, %s)" % [_shot, _t, _game.battle.cpu_ms, _game.state])
		_shot = ""
	_wait -= dt
	if _wait > 0.0: return false
	if _creator:
		_creator_step()
		_step += 1
		return false
	match _step:
		0: _wait = 2.5
		1: _snap("01_title")
		2:
			var t := _game._title
			t.start.emit()
			t.queue_free()
			_wait = 1.5
		3: _snap("02_home")
		4:
			_game.open_settings()
			_wait = 0.6
		5: _snap("03_settings")
		6:
			_game._close_sheet()
			_game.open_notes()
			_wait = 0.6
		7: _snap("04_notes")
		8:
			_game._close_sheet()
			_game.open_armory()
			_wait = 2.5
		9: _snap("05_armory")
		10:
			# Try on another weapon, and peek at a locked skin of it.
			var a: Armory = _game._screen
			var ids: Array = SimGear.gear_ids_for("main")
			a._choose(ids[1] if ids[0] == a.c["gear"]["main"] else ids[0])
			var sk: Array = CharacterSkins.skins_for(a.pick)
			if not sk.is_empty(): a._wear(a.pick, sk[-1])
			_wait = 2.0
		11: _snap("06_armory_try")
		12:
			var a: Armory = _game._screen
			a._pick_slot("chest")
			a._stats_btn.pressed.emit()
			_wait = 2.0
		13: _snap("07_armory_chest")
		14:
			var a: Armory = _game._screen
			a._open_loadouts()
			_wait = 1.0
		15: _snap("08_loadouts")
		16:
			_game._close_screen()
			_game.start_fight()
			_wait = 6.0
		17: _snap("09_fight")
		18:
			if _game.state != "results": return false
			_wait = 2.6
		19: _snap("10_results")
		20:
			if _game.battle.feed: _game.battle.feed.stop()
			quit()
	_step += 1
	return false


func _cr() -> Creator:
	return _game._screen as Creator


func _creator_step() -> void:
	match _step:
		0: _wait = 2.5
		1:
			var t := _game._title
			t.start.emit()
			t.queue_free()
			_wait = 3.0
		2: _snap("c01_species")
		3:
			_cr()._advance()
			_wait = 2.5
		4: _snap("c02_body")
		5:
			_cr()._advance()
			_wait = 1.5
		6: _snap("c03_style")
		7:
			_cr()._advance()
			_wait = 2.5
		8: _snap("c04_look")
		9:
			_cr().look_cat = "hair"
			_cr()._refresh()
			_wait = 2.5
		10: _snap("c05_look_hair")
		11:
			_cr()._advance()
			_wait = 1.0
		12: _snap("c06_name_empty")
		13:
			_cr()._name_in.text = "Kael"
			_cr()._name_in.text_changed.emit("Kael")
			_cr()._advance()
			_wait = 1.5
		14: _snap("c07_backdrop")
		15:
			_cr()._advance()
			_wait = 0.9
		16: _snap("c08_entrance")
		17:
			_cr()._advance()
			_wait = 1.2
		18: _snap("c09_finale")
		19:
			_cr()._advance()
			_wait = 1.6
		20: _snap("c10_reveal")
		21:
			_cr()._done()
			_wait = 1.5
		22: _snap("c11_home")
		23:
			_game.open_creator(true)
			_wait = 2.0
		24: _snap("c12_stats")
		25:
			_cr().go(0)
			_wait = 2.0
		26: _snap("c13_edit_species")
		27: quit()
