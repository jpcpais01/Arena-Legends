class_name SpriteBankLib
## The web game's SpriteBank (render/sprite/bank.ts) on the GPU forge.
##
## Frames are recorded on the CPU (the converted drawing code fills a
## Raster's op stream) and rasterized on the GPU in batches: `warm` records
## the queued frames within a time budget and bakes them as one atlas when
## the queue runs dry; a frame asked for before that is baked on its own
## right away. Sprites are dictionaries shaped like the web's Sprite, with
## Canvas2D.Region images.

const OX := 88
const OY := 126

static var _shared: PixelRaster.Raster
## The drawing code keeps a little shared state (figure marks, caches): one frame records at a time.
static var draw_lock := Mutex.new()


static func _raster() -> PixelRaster.Raster:
	if _shared == null: _shared = PixelRaster.Raster.new(176, 150)
	return _shared


## A sprite filled with one colour (hit flash, silhouettes).
static func solid_of(s: Dictionary, color) -> Dictionary:
	var o := s.duplicate()
	o["img"] = (s["img"] as Canvas2D.Region).silhouette(Canvas2D.color(color))
	return o


class SpriteBank:
	var art
	var set_
	var sprites := {}
	var flashes := {}
	var queue: Array = []
	## Frames recorded by warm() and not baked yet: [key, frame, tip, secTip].
	var _pending: Array = []
	var _job: Forge.Job
	var _jobs: Array[Forge.Job] = []
	var _glow := false
	var _task := -1
	var _quit := false

	func _init(a, s) -> void:
		art = a
		set_ = s
		var first := ["idle", "run", "back", "hurt"]
		var order: Array = first.duplicate()
		for k in (s["clips"] as Dictionary).keys():
			if not first.has(k): order.append(k)
		for clip in order:
			var c = s["clips"].get(clip)
			if c == null: continue
			for i in int(SpriteAnims.clip_length(c)):
				queue.append([clip, i])

	func get_(o) -> Dictionary:
		var s = sprites.get(o["key"])
		if s != null: return s
		return _now(o["key"], o["clip"], o["frame"], o.get("face"), o.get("secOut", false), o.get("useOut", false))

	func flash(o, color = "#fff") -> Dictionary:
		var k: String = str(o["key"]) + str(color)
		var s = flashes.get(k)
		if s == null:
			s = SpriteBankLib.solid_of(get_(o), color)
			flashes[k] = s
		return s

	## Records the queued frames on a worker thread, then bakes them as one atlas
	## (on the calling thread, which owns the GPU). True once done; call each frame.
	func warm(_budget_ms = 0) -> bool:
		if queue.is_empty() and _task < 0: return true
		if _task < 0:
			_task = WorkerThreadPool.add_task(_record_all, false, "sprite warm-up")
			return false
		if not WorkerThreadPool.is_task_completed(_task): return false
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
		_bake(_job, _pending)
		_job = null
		_pending = []
		queue = []
		return true

	## Worker: every queued frame into one job, with its own raster.
	func _record_all() -> void:
		var r := PixelRaster.Raster.new(176, 150)
		_job = Forge.Job.new()
		for q in queue:
			if _quit: return
			_pending.append(_record(_job, "%s.%d." % [q[0], q[1]], q[0], q[1], null, false, false, r))

	## One frame, drawn and baked right now (a face or pose the warm-up didn't cover).
	func _now(key: String, clip: String, frame, face, sec_out, use_out) -> Dictionary:
		var job := Forge.Job.new()
		var rec := _record(job, key, clip, frame, face, sec_out, use_out)
		_bake(job, [rec])
		return sprites[key]

	func _record(job: Forge.Job, key: String, clip: String, frame, face, sec_out, use_out, r: PixelRaster.Raster = null) -> Array:
		var clips: Dictionary = set_["clips"]
		var c = clips.get(clip)
		if c == null: c = clips["idle"]
		if r == null: r = SpriteBankLib._raster()
		SpriteBankLib.draw_lock.lock()
		job.attach(r)
		r.clear()
		r.phase = floori(float(frame) * 4.0 / maxf(4, c["w"].size())) if clip == "idle" else float(frame)
		SpriteDraw.draw_figure(r, art, SpriteAnims.frame_spec(c, frame, face, sec_out, use_out), OX, OY)
		var marks: Dictionary = SpriteDraw.figureMarks
		var tip = marks["tip"]
		var sec = marks["secTip"]
		var f: Forge.Frame = r.compose(OX, OY, true, true)
		SpriteBankLib.draw_lock.unlock()
		return [key, f, null if tip == null else [tip[0] - OX, tip[1] - OY], null if sec == null else [sec[0] - OX, sec[1] - OY]]

	func _bake(job: Forge.Job, recs: Array) -> void:
		job.bake()
		_jobs.append(job)
		var glow := false
		for m in job.registry.mats:
			if m["glow"] or float(m.get("shine", 0.0)) > 0.0 or float(m.get("gleam", 0.0)) > 0.0:
				glow = true
				break
		for rec in recs:
			var f: Forge.Frame = rec[1]
			var s := {"img": null, "ox": f.ox, "oy": f.oy, "w": f.w, "h": f.h, "tip": rec[2], "secTip": rec[3], "glow": null, "sparks": null}
			if f.empty():
				s["img"] = Canvas2D.Region.new(job.color, Rect2(0, 0, 0, 0))
				s["w"] = 0
				s["h"] = 0
			else:
				s["img"] = Canvas2D.Region.new(job.color, Rect2(f.region))
				if glow: s["glow"] = Canvas2D.Region.new(job.glow, Rect2(f.region))
				if f.sparks.size(): s["sparks"] = Array(f.sparks)
			sprites[rec[0]] = s

	## Frees the atlases (the battle is over).
	func release() -> void:
		if _task >= 0:
			_quit = true
			WorkerThreadPool.wait_for_task_completion(_task)
			_task = -1
		for j in _jobs: j.release()
		_jobs.clear()
		sprites.clear()
		flashes.clear()
