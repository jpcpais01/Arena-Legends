extends SceneTree
class_name SimStateTest
## Deep sim comparison: steps the battle in tools/ref/simstate.ts and prints
## the first state fields that differ from the web, tick by tick.

const SKIP := ["abilities", "has", "base", "gear", "gearIds", "look", "skins", "profile"]

func _init() -> void:
	var path: String = OS.get_cmdline_user_args()[0] if OS.get_cmdline_user_args().size() else "/tmp/simstate.json"
	var states: Array = exact(JSON.parse_string(FileAccess.get_file_as_string(path)))
	var b = SimBattle.Battle.new({"seed": 1000, "fighters": [SimLoadout.DEFAULT_BUILDS[0].duplicate(true), SimLoadout.DEFAULT_BUILDS[1].duplicate(true)]})
	for t in states.size():
		if t > 0:
			b.step()
			b.events.clear()
		var diffs := []
		var want: Dictionary = states[t]
		_cmp("tick", b.tick, want["tick"], diffs)
		_cmp("over", b.over, want["over"], diffs)
		for i in 2:
			var f: Dictionary = b.fighters[i]
			var wf: Dictionary = want["fighters"][i]
			for k in wf:
				if not f.has(k):
					diffs.append("f%d.%s missing" % [i, k])
					continue
				_cmp("f%d.%s" % [i, k], f[k], wf[k], diffs)
			for k in f:
				if not wf.has(k) and not SKIP.has(k) and f[k] != null: diffs.append("f%d.%s extra (%s)" % [i, k, f[k]])
		_cmp("projectiles", b.projectiles.size(), want["projectiles"].size(), diffs)
		if diffs.size():
			print("tick %d: %d diffs" % [t, diffs.size()])
			for d in diffs.slice(0, 12): print("   ", d)
			break
		print("tick %d ok" % t)
	quit()


func _cmp(path: String, got, want, out: Array) -> void:
	if want is Dictionary:
		if not (got is Dictionary):
			out.append("%s: %s vs web %s" % [path, got, want])
			return
		for k in want: _cmp(path + "." + k, got.get(k), want[k], out)
		return
	if want is Array:
		if not (got is Array) or got.size() != want.size():
			out.append("%s: %s vs web %s" % [path, got, want])
			return
		for i in want.size(): _cmp("%s[%d]" % [path, i], got[i], want[i], out)
		return
	if want is float or want is int:
		if not (got is float or got is int) or float(got) != float(want):
			out.append("%s: %s vs web %s" % [path, var_to_str(got), var_to_str(want)])
		return
	if want == null:
		if got != null: out.append("%s: %s vs web null" % [path, got])
		return
	if typeof(got) != typeof(want) or got != want:
		out.append("%s: %s vs web %s" % [path, got, want])


## Floats arrive as "f:<hex of IEEE bits>" (exact); decode them.
static func exact(v):
	if v is String and v.begins_with("f:"): return v.substr(2).hex_decode().decode_double(0)
	if v is Array: return v.map(func(x): return exact(x))
	if v is Dictionary:
		var out := {}
		for k in v: out[k] = exact(v[k])
		return out
	return v
