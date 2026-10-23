extends SceneTree
## Walks the game's screens and saves a screenshot of each (GPU run):
##   xvfb-run -a -s "-screen 0 1600x720x24" godot --path godot --rendering-driver vulkan \
##     --rendering-method mobile --resolution 1600x720 -s res://test/ui_shot.gd -- /tmp/ui
## Title, home, settings, patch notes, the Armory (and its loadouts), a fight,
## and its results (at 4x). With a second argument `creator` it instead starts
## with no hero and walks the hero creator: every step, the reveal, then the
## Stats step of the editor. With `shop` it walks the Shop: offers (armed, the
## shelves, an entrance on the stage, a buy, the promo code), a chest opened to a
## Mythic and ten at once, and the forge smithing three spares.

var _out := "/tmp/ui"
var _game: Game
var _t := 0.0
var _step := 0
var _wait := 0.0
var _shot := ""
var _ended_at := -1.0
var _creator := false
var _shop := false


func _initialize() -> void:
	var a := OS.get_cmdline_user_args()
	_out = a[0] if a.size() > 0 else _out
	DirAccess.make_dir_recursive_absolute(_out)
	_creator = a.size() > 1 and a[1] == "creator"
	_shop = a.size() > 1 and a[1] == "shop"
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
	if _shop:
		_shop_step()
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


func _shop_step() -> void:
	match _step:
		0: _wait = 2.5
		1:
			var t := _game._title
			t.start.emit()
			t.queue_free()
			CharacterCollection.add_gems(9000 - CharacterCollection.gems())
			_wait = 1.0
		2:
			_game.open_shop()
			_wait = 2.5
		3: _snap("s01_offers")
		4:
			var sh: ShopScreen = _game._screen
			sh._on_feat_buy()
			_wait = 0.4
		5: _snap("s02_armed")
		6:
			var sh: ShopScreen = _game._screen
			sh._disarm()
			sh.shelf = "ent"
			sh._render()
			sh._watch("ent", "thunder")
			_wait = 1.2
		7: _snap("s03_entrances")
		8:
			var sh: ShopScreen = _game._screen
			sh.shelf = "fin"
			sh._render()
			sh._watch("fin", "frost")
			_wait = 2.2
		9: _snap("s04_finishers")
		10:
			var sh: ShopScreen = _game._screen
			sh.shelf = "sets"
			sh._render()
			_wait = 0.6
		11: _snap("s05_sets")
		12:
			var sh: ShopScreen = _game._screen
			sh.shelf = "daily"
			sh._render()
			sh._buy_one(CharacterShop.daily_picks(sh.day)[0])
			_wait = 1.0
		13: _snap("s06_got")
		14:
			var sh: ShopScreen = _game._screen
			sh.back()
			sh._open_promo()
			_wait = 0.5
		15:
			var pr: PromoSheet = (_game._screen as ShopScreen)._sheets[-1]
			pr._edit("KELK")
			_wait = 0.3
		16: _snap("s07_promo")
		17:
			_game._shop_tab("chests")
			_wait = 1.5
		18: _snap("s08_chests")
		19:
			# The next chest is a Mythic (the pity counter is one short).
			CharacterCollection.get_()["pity"] = CharacterCollection.EPIC_PITY - 1
			(_game._screen as ChestScreen).open(1)
			_wait = 1.6
		20: _snap("s09_charge")
		21: _wait = 2.4
		22: _snap("s10_omen")
		23: _wait = 1.0
		24: _snap("s11_slam")
		25: _wait = 3.0
		26: _snap("s12_reveal_one")
		27:
			var cs: ChestScreen = _game._screen
			cs._back_to_shop()
			cs.open(10)
			_wait = 3.4
		28: _snap("s13_ten_deal")
		29:
			(_game._screen as ChestScreen).skip()
			_wait = 2.0
		30: _snap("s14_ten")
		31:
			var c = CharacterCollection.get_()
			var rare: Array = CharacterSkins.SKINS.filter(func(x): return x["rarity"] == "rare")
			c["spare"][rare[0]["id"]] = 2
			c["spare"][rare[1]["id"]] = 2
			CharacterCollection.persist()
			_game._shop_tab("forge")
			_wait = 1.5
		32: _snap("s15_forge")
		33:
			(_game._screen as ForgeScreen).smith("rare")
			_wait = 0.9
		34: _snap("s16_fly")
		35: _wait = 1.6
		36: _snap("s17_pour")
		37: _wait = 1.0
		38: _snap("s18_strike")
		39: _wait = 3.0
		40: _snap("s19_forged")
		41: quit()
