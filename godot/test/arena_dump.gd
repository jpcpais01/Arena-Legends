extends SceneTree
## Dumps an arena's painted layers as PNGs: godot -s res://test/arena_dump.gd -- OUT ARENA

func _initialize() -> void:
	var a := OS.get_cmdline_user_args()
	var out: String = a[0]
	DirAccess.make_dir_recursive_absolute(out)
	var theme
	for t in RenderArenaArt.THEMES:
		if t["id"] == a[1]: theme = t
	var t0 := Time.get_ticks_msec()
	var art = RenderArenaArt.paint_arena(theme, 800, 360, 260, 300, 7)
	print("built in %d ms" % (Time.get_ticks_msec() - t0))
	# Through the cache: painted + saved, then loaded back from disk.
	ArenaCache._mem.clear()
	t0 = Time.get_ticks_msec()
	ArenaCache.get_art(theme, 800, 360, 260, 300, 7)
	print("cache miss in %d ms" % (Time.get_ticks_msec() - t0))
	ArenaCache._mem.clear()
	t0 = Time.get_ticks_msec()
	art = ArenaCache.get_art(theme, 800, 360, 260, 300, 7)
	print("cache load in %d ms" % (Time.get_ticks_msec() - t0))
	var i := 0
	for l in art["layers"]:
		var p = l["pix"]
		Canvas2D.image_of(p.data, p.w, p.h).save_png("%s/layer%d.png" % [out, i])
		print("layer %d: %dx%d factor %s y %s" % [i, p.w, p.h, l["factor"], l["y"]])
		i += 1
	var f = art["floor"]
	Canvas2D.image_of(f.data, f.w, f.h).save_png("%s/floor.png" % out)
	print("floor %dx%d top %s end %s" % [f.w, f.h, art["floorTop"], art["floorEnd"]])
	quit()
