class_name GearIcons
## Gear icons (the web's render/icons.ts) baked on the GPU. Icons asked for
## during a frame are recorded into one forge job and baked together at the
## end of it, then drawn from that atlas for good (they are small).
##
## An icon is a dictionary: img (Canvas2D.Region of the atlas), w, h (the
## piece) and box (the square the web centres it in: the piece itself for
## weapons and specials, a square around it for worn gear and potions).

static var _icons := {}
static var _job: Forge.Job
## Baked jobs own their atlas textures: kept for as long as their icons are cached.
static var _jobs: Array[Forge.Job] = []
static var _pending: Array = []
static var _waiting: Array[Callable] = []
static var _flush_queued := false


## The icon for gear `id` in `skin` (or null), or null while it bakes; `ready`
## is called once it can be drawn.
static func get_icon(id: String, skin = null, ready := Callable()):
	var key := id + "|" + (str(skin) if skin else "")
	var ic = _icons.get(key)
	if ic != null: return ic
	if ready.is_valid(): _waiting.append(ready)
	for p in _pending:
		if p[0] == key: return null
	if _job == null: _job = Forge.Job.new()
	var r = RenderIcons.R()
	# The drawing code keeps shared state with the sprite warm-up thread.
	SpriteBankLib.draw_lock.lock()
	_job.attach(r)
	var f = RenderIcons.icon_frame(id, skin)
	r.job = null
	SpriteBankLib.draw_lock.unlock()
	# icon_frame caches what it made; the frames are this bank's now.
	RenderIcons.cache.erase(id + "|" + str(skin) if skin else id)
	_pending.append([key, f])
	if not _flush_queued:
		_flush_queued = true
		(Engine.get_main_loop() as SceneTree).process_frame.connect(_flush, CONNECT_ONE_SHOT)
	return null


static func _flush() -> void:
	_flush_queued = false
	if _job == null: return
	var job := _job
	_job = null
	job.bake()
	_jobs.append(job)
	for p in _pending:
		var crop = p[1] if p[1] is Dictionary else null
		var f: Forge.Frame = crop["frame"] if crop != null else p[1]
		var ic := {"img": Canvas2D.Region.new(job.color, Rect2(f.region)), "w": f.w, "h": f.h}
		# A cropped icon is a square around the piece, at least the crop's floor (the
		# frame's size is only known once baked, so the square is settled here).
		var side := maxf(maxf(crop["w"], crop["h"]), maxf(f.w, f.h)) if crop != null else 0.0
		ic["box"] = Vector2(side, side) if crop != null else Vector2(f.w, f.h)
		if f.empty(): ic["w"] = 0
		_icons[p[0]] = ic
	_pending.clear()
	var calls := _waiting
	_waiting = []
	for c in calls:
		if c.is_valid(): c.call()


## Drops every icon and its atlas (the game is quitting; see Forge.shutdown).
static func shutdown() -> void:
	_waiting.clear()
	_pending.clear()
	_icons.clear()
	_job = null
	for j in _jobs: j.release()
	_jobs.clear()


## Draws an icon into `r` the way the web shows it in a slot: the piece at a whole
## scale, about as large as the web's 48px icon canvas stretched to the slot.
static func draw(ci: CanvasItem, ic: Dictionary, r: Rect2, modulate := Color.WHITE) -> void:
	if ic == null or int(ic["w"]) <= 0: return
	var box: Vector2 = ic["box"]
	var s48 := maxf(1.0, floorf(minf(48.0 / box.x, 48.0 / box.y)))
	var k := maxf(1.0, roundf(minf(r.size.x, r.size.y) / 48.0 * s48))
	var w := float(ic["w"]) * k
	var h := float(ic["h"]) * k
	var pos := (r.position + (r.size - Vector2(w, h)) / 2.0).round()
	var img: Canvas2D.Region = ic["img"]
	ci.draw_texture_rect_region(img.tex, Rect2(pos, Vector2(w, h)), img.rect, modulate)
