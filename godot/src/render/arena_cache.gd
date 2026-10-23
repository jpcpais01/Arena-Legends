class_name ArenaCache
## Painted arenas, kept so a battle never waits for the painters.
##
## Painting an arena (render/*Art, converted from the web) takes seconds in
## GDScript. The result depends only on the theme, the screen's art size and
## the seed, so it is kept in memory and on disk (user://arenas): a phone
## paints each arena once, after that it loads in a blink. prepare() paints
## (or loads) on a worker thread, so a menu or the intro can carry on while
## it runs.

## Bump when the painters change what they draw.
const VERSION := 1
const DIR := "user://arenas"
## Files kept on disk (a few arenas at a couple of screen sizes).
const KEEP := 16

static var _mem := {}
static var _jobs := {}
static var _lock := Mutex.new()


## The arena art for these parameters: from memory, disk, or painted now.
static func get_art(theme, W: float, H: float, gy: float, travel: float, seed_: float) -> Dictionary:
	var key := _key(theme, W, H, gy, travel, seed_)
	# Being painted on a worker already: wait for it rather than paint twice.
	_lock.lock()
	var job = _jobs.get(key, -1)
	_lock.unlock()
	if job >= 0: _finish(key)
	return _fetch(key, theme, W, H, gy, travel, seed_)


static func _fetch(key: String, theme, W: float, H: float, gy: float, travel: float, seed_: float) -> Dictionary:
	_lock.lock()
	var art = _mem.get(key)
	_lock.unlock()
	if art != null: return art
	art = _load(key, theme)
	if art == null:
		art = RenderArenaArt.paint_arena(theme, W, H, gy, travel, seed_)
		_save(key, art)
	_lock.lock()
	_mem[key] = art
	_lock.unlock()
	return art


## Waits for a worker's arena (main thread only: every task is waited on once).
static func _finish(key: String) -> void:
	_lock.lock()
	var job = _jobs.get(key, -1)
	_jobs.erase(key)
	_lock.unlock()
	if job >= 0: WorkerThreadPool.wait_for_task_completion(job)


## The view's arena parameters for a screen of w × h art px (BattleView.layout).
static func params(w: float, h: float) -> Array:
	var lift: float = TS.round(h * 0.1)
	var gy: float = (TS.round(h * 0.6) if h > w else h - maxf(44, TS.round(h * 0.17))) - lift
	var travel: float = maxf(0, ((SimConstants.ARENA_HALF_WIDTH + 1.8) * SpriteAnimator.PPM) - (w / 2.0)) + 12
	return [gy, travel]


## Starts painting (or loading) the arena a battle view of w × h will want.
static func prepare(theme, w: float, h: float) -> void:
	var p := params(w, h)
	var key := _key(theme, w, h, p[0], p[1], 7)
	_lock.lock()
	if not _mem.has(key) and not _jobs.has(key):
		_jobs[key] = WorkerThreadPool.add_task(func(): _fetch(key, theme, w, h, p[0], p[1], 7), true, "arena " + str(theme["id"]))
	_lock.unlock()


## True once prepare()'s arena is ready to use (main thread: call each frame while waiting).
static func is_ready(theme, w: float, h: float) -> bool:
	var p := params(w, h)
	var key := _key(theme, w, h, p[0], p[1], 7)
	_lock.lock()
	var job = _jobs.get(key, -1)
	_lock.unlock()
	if job >= 0:
		if not WorkerThreadPool.is_task_completed(job): return false
		_finish(key)
	_lock.lock()
	var ok: bool = _mem.has(key)
	_lock.unlock()
	return ok


## Forgets the in-memory arenas except `keep` (theme ids), to free their pixels.
static func trim(keep: Array = []) -> void:
	_lock.lock()
	for k in _mem.keys():
		if not keep.has(_mem[k]["theme"]["id"]) and not _jobs.has(k): _mem.erase(k)
	_lock.unlock()


static func _key(theme, W: float, H: float, gy: float, travel: float, seed_: float) -> String:
	return "%s_%d_%d_%d_%d_%d_%s.%d" % [theme["id"], W, H, gy, travel, seed_, ProjectSettings.get_setting("application/config/version", "0"), VERSION]


# --- Disk ---------------------------------------------------------------------

static func _load(key: String, theme) -> Variant:
	var f := FileAccess.open_compressed("%s/%s.bin" % [DIR, key], FileAccess.READ, FileAccess.COMPRESSION_ZSTD)
	if f == null: return null
	var v = f.get_var()
	f.close()
	if not (v is Dictionary): return null
	var art = _dec(v)
	# The theme is shared with the rest of the game, not a copy.
	art["theme"] = theme
	return art


static func _save(key: String, art: Dictionary) -> void:
	var enc = _enc(art)
	if enc == null: return
	DirAccess.make_dir_recursive_absolute(DIR)
	var f := FileAccess.open_compressed("%s/%s.bin" % [DIR, key], FileAccess.WRITE, FileAccess.COMPRESSION_ZSTD)
	if f == null: return
	f.store_var(enc)
	f.close()
	_prune()


## Keeps the newest KEEP files.
static func _prune() -> void:
	var files := []
	for n in DirAccess.get_files_at(DIR):
		var p := "%s/%s" % [DIR, n]
		files.append([FileAccess.get_modified_time(p), p])
	if files.size() <= KEEP: return
	files.sort()
	for i in files.size() - KEEP: DirAccess.remove_absolute(files[i][1])


## Plain data for store_var: pixel buffers become packed bytes. Null when something can't be stored.
static func _enc(v) -> Variant:
	if v is PixelPaint.Pix:
		return {"__pix": PackedInt32Array([int(v.w), int(v.h)]), "d": PackedInt64Array(v.data).to_byte_array()}
	if v is Object or v is Callable: return null
	if v is Dictionary:
		var d := {}
		for k in v:
			var e = _enc(v[k])
			if e == null and v[k] != null: return null
			d[k] = e
		return d
	if v is Array:
		var a := []
		for x in v:
			var e = _enc(x)
			if e == null and x != null: return null
			a.append(e)
		return a
	return v


static func _dec(v) -> Variant:
	if v is Dictionary:
		if v.has("__pix"):
			var p = PixelPaint.Pix.new(0, 0)
			p.w = v["__pix"][0]
			p.h = v["__pix"][1]
			p.data = Array(PackedFloat64Array(Array(v["d"].to_int64_array())))
			return p
		var d := {}
		for k in v: d[k] = _dec(v[k])
		return d
	if v is Array:
		var a := []
		for x in v: a.append(_dec(x))
		return a
	return v
