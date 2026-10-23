extends SceneTree
## Forge vs web: draws the builds in the reference dump (tools/ref/dump.ts)
## on the GPU and compares every frame pixel by pixel.
##   xvfb-run godot --path godot -s res://test/forge_test.gd -- REF_DIR [OUT_DIR]

const OX := 88
const OY := 126
const MAX_NEAR := 16

var exact_frames := 0
var near_frames := 0

var _done := false


func _process(_dt: float) -> bool:
	if _done: return true
	_done = true
	var args := OS.get_cmdline_user_args()
	var ref_dir: String = args[0] if args.size() > 0 else "/tmp/forge-ref"
	var out_dir: String = args[1] if args.size() > 1 else ""
	var total_bad := 0
	var bi := 0
	while FileAccess.file_exists("%s/build%d.jsonl" % [ref_dir, bi]):
		var only := OS.get_environment("BUILD")
		if only == "" or only == str(bi): total_bad += _check(ref_dir, bi, out_dir)
		bi += 1
	print("forge_test: %d builds; %d frames exact, %d within float rounding, %d differ" % [bi, exact_frames, near_frames, total_bad])
	quit(1 if total_bad else 0)
	return true


func _check(ref_dir: String, bi: int, out_dir: String) -> int:
	var lines := FileAccess.get_file_as_string("%s/build%d.jsonl" % [ref_dir, bi]).split("\n", false)
	var build: Dictionary = JSON.parse_string(lines[0])["build"]
	var t0 := Time.get_ticks_usec()
	var art = SpriteLook.make_art(build)
	var set_ = SpriteAnims.clips_for(art)
	var t1 := Time.get_ticks_usec()
	var job := Forge.Job.new()
	var r := PixelRaster.Raster.new(176, 150)
	job.attach(r)
	var frames: Array[Forge.Frame] = []
	var refs := []
	for k in range(1, lines.size()):
		var ref: Dictionary = JSON.parse_string(lines[k])
		refs.append(ref)
		var clip: String = ref["clip"]
		var i := int(ref["frame"])
		var c = set_["clips"][clip]
		r.clear()
		r.phase = floori(i * 4.0 / maxf(4, c["w"].size())) if clip == "idle" else i
		SpriteDraw.draw_figure(r, art, SpriteAnims.frame_spec(c, i, null, false), OX, OY)
		frames.append(r.compose(OX, OY, true, true))
	var t2 := Time.get_ticks_usec()
	job.bake()
	var t3 := Time.get_ticks_usec()
	print("build %d (%s): %d frames, %d materials, %d tex words; art %.1f ms, record %.1f ms, gpu bake %.1f ms, atlas %s" % [
		bi, build["name"], frames.size(), job.registry.mats.size(), job.registry.tex_code.size(), (t1 - t0) / 1000.0, (t2 - t1) / 1000.0, (t3 - t2) / 1000.0, job.size])
	var atlas := job.image(false)
	var gatlas := job.image(true)
	var bad := 0
	var worst := []
	for k in frames.size():
		var ref: Dictionary = refs[k]
		var f := frames[k]
		var msg := ""
		if f.w != int(ref["w"]) or f.h != int(ref["h"]) or f.ox != int(ref["ox"]) or f.oy != int(ref["oy"]):
			msg = "size %dx%d o(%d,%d) vs web %dx%d o(%d,%d)" % [f.w, f.h, f.ox, f.oy, ref["w"], ref["h"], ref["ox"], ref["oy"]]
		var diff := _diff(atlas, f, Marshalls.base64_to_raw(ref["data"]), int(ref["w"]), int(ref["h"]), int(ref["ox"]), int(ref["oy"]))
		var gdiff := 0
		if ref["glow"] != null:
			gdiff = _diff(gatlas, f, Marshalls.base64_to_raw(ref["glow"]), int(ref["w"]), int(ref["h"]), int(ref["ox"]), int(ref["oy"]))
		if diff > 0 or gdiff > 0: msg += " %d px differ, %d glow px differ" % [diff, gdiff]
		# float32 on the GPU vs float64 in JS: a texture stripe boundary that falls
		# exactly on a pixel can round either way. A handful of such pixels is fine.
		var near := msg.begins_with(" ") and diff <= MAX_NEAR and gdiff <= MAX_NEAR
		if near: near_frames += 1
		elif msg != "":
			bad += 1
		if msg != "": worst.append([diff, k, "%s.%d" % [ref["clip"], ref["frame"]], msg])
		else: exact_frames += 1
	worst.sort_custom(func(a, b): return a[0] > b[0])
	if bad: print("  build %d: %d of %d frames differ" % [bi, bad, frames.size()])
	for wv in worst.slice(0, 4 if bad else 0):
		print("  ", wv[2], ": ", wv[3])
	if out_dir != "":
		DirAccess.make_dir_recursive_absolute(out_dir)
		atlas.save_png("%s/atlas%d.png" % [out_dir, bi])
		gatlas.save_png("%s/glow%d.png" % [out_dir, bi])
		for wv in worst.slice(0, 4):
			var ref: Dictionary = refs[wv[1]]
			_side_by_side(atlas, frames[wv[1]], ref).save_png("%s/diff%d_%s.png" % [out_dir, bi, wv[2]])
	job.release()
	return bad


## Pixels that differ, comparing in the web frame's coordinates (origin aligned).
func _diff(atlas: Image, f: Forge.Frame, raw: PackedByteArray, w: int, h: int, ox: int, oy: int) -> int:
	var n := 0
	for y in h:
		for x in w:
			var i := (y * w + x) * 4
			var want := Color8(raw[i], raw[i + 1], raw[i + 2], raw[i + 3])
			var gx := x - ox + f.ox
			var gy := y - oy + f.oy
			var got := Color(0, 0, 0, 0)
			if not f.empty() and gx >= 0 and gy >= 0 and gx < f.w and gy < f.h:
				got = atlas.get_pixel(f.region.position.x + gx, f.region.position.y + gy)
			if want.a8 == 0 and got.a8 == 0: continue
			if want.r8 != got.r8 or want.g8 != got.g8 or want.b8 != got.b8 or want.a8 != got.a8: n += 1
	return n


func _side_by_side(atlas: Image, f: Forge.Frame, ref: Dictionary) -> Image:
	var w := int(ref["w"])
	var h := int(ref["h"])
	var raw := Marshalls.base64_to_raw(ref["data"])
	var img := Image.create_empty(w * 3 + 4, h, false, Image.FORMAT_RGBA8)
	img.fill(Color8(106, 122, 138))
	for y in h:
		for x in w:
			var i := (y * w + x) * 4
			var want := Color8(raw[i], raw[i + 1], raw[i + 2], raw[i + 3])
			var gx := x - int(ref["ox"]) + f.ox
			var gy := y - int(ref["oy"]) + f.oy
			var got := Color(0, 0, 0, 0)
			if not f.empty() and gx >= 0 and gy >= 0 and gx < f.w and gy < f.h:
				got = atlas.get_pixel(f.region.position.x + gx, f.region.position.y + gy)
			if want.a8: img.set_pixel(x, y, want)
			if got.a8: img.set_pixel(w + 2 + x, y, got)
			if want != got: img.set_pixel(w * 2 + 4 + x - 2, y, Color.RED)
	return img
