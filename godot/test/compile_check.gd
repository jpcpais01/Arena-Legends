extends SceneTree
## Loads every script under res://src and res://gen and reports the ones that fail to compile.
## godot --headless --path godot -s res://test/compile_check.gd

func _walk(dir: String, out: Array) -> void:
	var d := DirAccess.open(dir)
	if d == null: return
	for f in d.get_files():
		if f.ends_with(".gd"): out.append(dir.path_join(f))
	for s in d.get_directories():
		_walk(dir.path_join(s), out)

func _init() -> void:
	var files := []
	_walk("res://src", files)
	_walk("res://gen", files)
	var bad := 0
	for f in files:
		if f.contains("/patches/"): continue
		var s = load(f)
		if s == null or not (s as GDScript).can_instantiate():
			bad += 1
			print("FAIL ", f)
	print("compile_check: %d scripts, %d failed" % [files.size(), bad])
	quit(1 if bad else 0)
