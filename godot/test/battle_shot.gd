extends SceneTree
## Runs a battle scene and saves screenshots at given seconds:
##   xvfb-run godot --path godot --rendering-driver vulkan -s res://test/battle_shot.gd -- OUT_DIR SEED ARENA t1 t2 ...

var _scene: BattleScene
var _times: Array = []
var _out := ""
var _t := 0.0
var _frames := 0
var _slow := 0
var _pending := -1.0
var _noover := ""


func _initialize() -> void:
	var a := OS.get_cmdline_user_args()
	_out = a[0] if a.size() > 0 else "/tmp/shots"
	DirAccess.make_dir_recursive_absolute(_out)
	_scene = BattleScene.new()
	_scene.seed_override = int(a[1]) if a.size() > 1 else 1234
	_scene.arena_override = a[2] if a.size() > 2 else "isle"
	for i in range(3, a.size()): _times.append(float(a[i]))
	if _times.is_empty(): _times = [3.0, 8.0]
	root.add_child(_scene)


func _process(dt: float) -> bool:
	_frames += 1
	if dt > 0.05: _slow += 1
	_t += dt
	# The frame drawn last time round is the one on screen now.
	if _pending >= 0.0:
		var at := _pending
		_pending = -1.0
		var img := root.get_texture().get_image()
		var path := "%s/shot_%05.1f.png" % [_out, at]
		img.save_png(path)
		if OS.get_environment("AL_LAYERS") != "":
			var sc = _scene.screen
			sc._sky.get_texture().get_image().save_png(path.replace(".png", "_sky.png"))
			sc._world.get_texture().get_image().save_png(path.replace(".png", "_world.png"))
			sc._final.get_texture().get_image().save_png(path.replace(".png", "_final.png"))
			print("day %s zoom %s" % [_scene.view.arena.day if _scene.view.arena else -1, sc._zoom])
			RenderingServer.canvas_item_set_visible(sc._composite, false)
			_noover = path
		var fd = _scene.feed
		print("shot %s (frame %d, %d slow frames, %d stalls, %d ticks ahead, %s)" % [path, _frames, _slow, fd.stalls if fd else 0, fd.ahead() if fd else 0, _scene._state])
	elif _noover != "":
		_scene.screen._final.get_texture().get_image().save_png(_noover.replace(".png", "_nocomp.png"))
		RenderingServer.canvas_item_set_visible(_scene.screen._composite, true)
		_noover = ""
	if not _times.is_empty() and _t >= _times[0]:
		_pending = _times.pop_front()
	if _times.is_empty() and _pending < 0.0 and _noover == "":
		if _scene.feed: _scene.feed.stop()
		quit()
	return false
