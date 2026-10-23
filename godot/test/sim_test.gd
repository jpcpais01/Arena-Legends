extends SceneTree
## Sim vs web: replays the battles in a reference trace (tools/ref/simtrace.ts)
## and reports the first tick where the state differs, plus sim speed.
##   godot --headless --path godot -s res://test/sim_test.gd -- TRACE.json

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var path: String = args[0] if args.size() else "/tmp/simtrace.json"
	var runs: Array = SimStateTest.exact(JSON.parse_string(FileAccess.get_file_as_string(path)))
	var same := 0
	for i in runs.size():
		var run: Dictionary = runs[i]
		var b = SimBattle.Battle.new({"seed": run["seed"], "fighters": [run["builds"][0].duplicate(true), run["builds"][1].duplicate(true)]})
		var trace: Array = run["trace"]
		var ti := 0
		var diverged := -1
		var detail := ""
		var t0 := Time.get_ticks_usec()
		var max_steps := ceili((SimConstants.MATCH_TIME + 30) / SimConstants.DT)
		for k in max_steps:
			if b.over: break
			b.step()
			b.events.clear()
			if int(b.tick) % 10 == 0 and diverged < 0 and ti < trace.size():
				var want: Array = trace[ti]
				ti += 1
				var row := [b.tick]
				for f in b.fighters:
					var act = f["action"]
					row.append_array([f["hp"], f["energy"], f["x"], f["y"], f["vx"], act["ability"] if act != null else -1, f["statuses"].size()])
				for c in row.size():
					if float(row[c]) != float(want[c]):
						diverged = int(b.tick)
						detail = "field %d: %s vs web %s" % [c, row[c], want[c]]
						break
		var us := (Time.get_ticks_usec() - t0) / maxf(1, b.tick)
		var ok: bool = diverged < 0 and int(b.tick) == int(run["ticks"]) and int(b.winner) == int(run["winner"])
		if ok: same += 1
		print("run %d: %d ticks (web %d), winner %d (web %d), %.0f us/tick%s" % [i, b.tick, run["ticks"], b.winner, run["winner"], us,
			"" if diverged < 0 else ", diverged at tick %d (%s)" % [diverged, detail]])
	print("sim_test: %d of %d battles identical to the web" % [same, runs.size()])
	quit(0 if same == runs.size() else 1)
