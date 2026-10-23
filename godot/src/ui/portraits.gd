class_name Portraits
extends RefCounted
## Still hero portraits for pick cards (the web's still Previews): the first
## idle frame of a build, drawn a few per frame (about 6 ms) so a screen full
## of them doesn't hitch, each frame's batch baked as one forge job. A screen
## owns one of these and frees it (and its atlases) when it closes.

const BUDGET_US := 6000

var _sprites := {}
var _queue: Array = []
var _jobs: Array[Forge.Job] = []
var _waiting: Array[Callable] = []
var _raster: PixelRaster.Raster


## The portrait of `build` (a sprite: img, ox, oy) or null while it is drawn;
## `ready` is called once drawn.
func get_(build: Dictionary, ready := Callable()):
	var key := _key(build)
	var s = _sprites.get(key)
	if s != null: return s
	if ready.is_valid() and not _waiting.has(ready): _waiting.append(ready)
	for q in _queue:
		if q[0] == key: return null
	_queue.append([key, build])
	return null


static func _key(b: Dictionary) -> String:
	return JSON.stringify([b.get("form"), b.get("look"), b.get("gear"), b.get("skins")])


## Draws queued portraits within the frame budget and bakes them. Call every frame.
func poll() -> void:
	if _queue.is_empty(): return
	if _raster == null: _raster = PixelRaster.Raster.new(176, 150)
	var job := Forge.Job.new()
	var recs := []
	var t0 := Time.get_ticks_usec()
	while not _queue.is_empty() and (recs.is_empty() or Time.get_ticks_usec() - t0 < BUDGET_US):
		var q: Array = _queue.pop_front()
		var art = SpriteLook.make_art(q[1])
		var set_ = SpriteAnims.clips_for(art)
		SpriteBankLib.draw_lock.lock()
		job.attach(_raster)
		_raster.clear()
		_raster.phase = 0
		SpriteDraw.draw_figure(_raster, art, SpriteAnims.frame_spec(set_["clips"]["idle"], 0, null, false, false), SpriteBankLib.OX, SpriteBankLib.OY)
		recs.append([q[0], _raster.compose(SpriteBankLib.OX, SpriteBankLib.OY, true, true)])
		SpriteBankLib.draw_lock.unlock()
	job.bake()
	_jobs.append(job)
	for rec in recs:
		var f: Forge.Frame = rec[1]
		_sprites[rec[0]] = {"img": Canvas2D.Region.new(job.color, Rect2(f.region) if not f.empty() else Rect2()), "ox": f.ox, "oy": f.oy, "empty": f.empty()}
	if _queue.is_empty():
		var calls := _waiting
		_waiting = []
		for c in calls:
			if c.is_valid(): c.call()


func release() -> void:
	for j in _jobs: j.release()
	_jobs.clear()
	_sprites.clear()
	_queue.clear()
	_waiting.clear()


## Draws a portrait in `box` (device pixels): an `art` sized stage at whole scale
## `k`, centred along the bottom, feet `ground` art pixels above its bottom (negative crops to a
## bust), with the ground shadow; the sprite is cut to the stage.
static func draw(ci: CanvasItem, s, box: Rect2, art: Vector2, ground: float, k: float) -> void:
	var o := Vector2(roundf(box.position.x + (box.size.x - art.x * k) / 2.0), roundf(box.end.y - art.y * k))
	var gx := roundf(art.x / 2.0)
	var gy := art.y - ground
	var stage := Rect2(Vector2.ZERO, art)
	var sh := Rect2(gx - 11, gy - 1, 22, 3).intersection(stage)
	if sh.has_area(): ci.draw_rect(Rect2(o + sh.position * k, sh.size * k), Color(0, 0, 0, 0.3))
	if s == null or s["empty"]: return
	var reg: Canvas2D.Region = s["img"]
	var at := Rect2(gx - float(s["ox"]), gy - float(s["oy"]), reg.rect.size.x, reg.rect.size.y)
	var vis := at.intersection(stage)
	if not vis.has_area(): return
	var src := Rect2(reg.rect.position + (vis.position - at.position), vis.size)
	ci.draw_texture_rect_region(reg.tex, Rect2(o + vis.position * k, vis.size * k), src)
