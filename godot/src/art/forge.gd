class_name Forge
## The sprite forge: turns recorded art (px_raster.gd op streams) into
## sprite atlases on the GPU. A Job collects frames; `bake()` packs their
## cells into an atlas, rasterizes and composes every frame in two compute
## passes (forge_raster.glsl, forge_compose.glsl), then reads back only the
## exact crop of each frame and its night sparkle spots. The atlas stays on
## the GPU and is drawn through a Texture2DRD.

const ATLAS_W := 2048
const PAD := 1
const FR := 16
const MR := 16
const SPARKS := 256

static var _rd: RenderingDevice
static var _raster_shader: RID
static var _compose_shader: RID
static var _raster_pipe: RID
static var _compose_pipe: RID


## Jobs baked for one sprite at a time (projectiles, bottles, skinned specials): their
## callers cache the sprites for the whole game, so the atlases stay.
static var _kept: Array[Job] = []
## Every baked job still alive (instance id → weakref), for shutdown().
static var _live := {}


## Lets go of the GPU before the engine shuts down (the game is quitting):
## frees the kept atlases and the pipelines, then forgets the device, so a job
## freed later (with the scripts' statics, after the device is gone) frees nothing.
static func shutdown() -> void:
	if _rd == null: return
	_kept.clear()
	for w in _live.values():
		var j = w.get_ref()
		if j != null: j.close()
	_live.clear()
	for rid in [_raster_pipe, _compose_pipe, _raster_shader, _compose_shader]:
		if rid.is_valid(): _rd.free_rid(rid)
	_rd = null


## Bakes the frame drawn so far on a raster with no job, right away: a sprite
## dictionary (img/glow as Canvas2D.Region, ox, oy, w, h, sparks).
static func bake_one(r: PixelRaster.Raster, ox: float, oy: float, outline: bool, night: bool) -> Dictionary:
	var job := Job.new()
	job.registry = r.registry
	r.job = job
	var f := job.capture(r, ox, oy, outline, night)
	r.job = null
	job.bake()
	_kept.append(job)
	if f.empty(): return {"img": Canvas2D.Region.new(job.color, Rect2()), "glow": null, "ox": 0, "oy": 0, "w": 0, "h": 0, "sparks": null}
	var glowing := false
	for m in job.registry.mats:
		if m["glow"] or float(m.get("shine", 0.0)) > 0.0 or float(m.get("gleam", 0.0)) > 0.0:
			glowing = true
			break
	return {"img": Canvas2D.Region.new(job.color, Rect2(f.region)), "glow": Canvas2D.Region.new(job.glow, Rect2(f.region)) if night and glowing else null,
		"ox": f.ox, "oy": f.oy, "w": f.w, "h": f.h, "sparks": Array(f.sparks) if f.sparks.size() else null}


static func _setup() -> bool:
	if _rd != null: return true
	_rd = RenderingServer.get_rendering_device()
	if _rd == null:
		push_error("Forge: no RenderingDevice (the forge needs the Vulkan renderer)")
		return false
	_raster_shader = _rd.shader_create_from_spirv((load("res://src/art/forge_raster.glsl") as RDShaderFile).get_spirv())
	_compose_shader = _rd.shader_create_from_spirv((load("res://src/art/forge_compose.glsl") as RDShaderFile).get_spirv())
	_raster_pipe = _rd.compute_pipeline_create(_raster_shader)
	_compose_pipe = _rd.compute_pipeline_create(_compose_shader)
	return true


## A finished sprite: a region of a job's atlas plus where its origin (feet) sits.
class Frame extends RefCounted:
	var job: Job
	## Region of the atlas holding the cropped frame.
	var region := Rect2i()
	## Origin inside the cropped frame.
	var ox := 0
	var oy := 0
	var w := 1
	var h := 1
	## Night sparkle spots (x, y pairs, frame space).
	var sparks := PackedInt32Array()
	## Raster-space cell (internal).
	var cell := Rect2i()
	var origin := Vector2i()
	var outline := true
	var night := false
	var phase := 0.0
	var ops_off := 0
	var ops_len := 0

	func empty() -> bool:
		return region.size.x == 0

	func texture() -> Texture2D:
		return job.color

	func glow_texture() -> Texture2D:
		return job.glow


class Job extends RefCounted:
	var registry := PixelRaster.Registry.new()
	var frames: Array[Frame] = []
	var ops := PackedFloat32Array()
	var color: Texture2DRD
	var glow: Texture2DRD
	var size := Vector2i()
	var baked := false
	var _color_rid: RID
	var _glow_rid: RID
	var _id := 0

	## Points a raster at this job: its materials and composed frames land here.
	func attach(r: PixelRaster.Raster) -> void:
		r.registry = registry
		r.job = self

	## Raster.compose(): records the frame drawn so far.
	func capture(r: PixelRaster.Raster, ox: float, oy: float, outline: bool, night: bool) -> Frame:
		var f := Frame.new()
		f.job = self
		f.origin = Vector2i(int(ox), int(oy))
		f.outline = outline
		f.night = night
		f.phase = r.phase
		if r.bx1 >= 0:
			var m := 1 if outline else 0
			var x0 := maxi(0, r.bx0 - m)
			var y0 := maxi(0, r.by0 - m)
			var x1 := mini(r.w - 1, r.bx1 + m)
			var y1 := mini(r.h - 1, r.by1 + m)
			f.cell = Rect2i(x0, y0, x1 - x0 + 1, y1 - y0 + 1)
			f.ops_off = ops.size()
			f.ops_len = r.ops.size()
			ops.append_array(r.ops)
		frames.append(f)
		return f

	## Rasterizes every captured frame. Blocks until the GPU is done (load time).
	func bake() -> void:
		if baked: return
		baked = true
		if not Forge._setup(): return
		var rd := Forge._rd
		var live: Array[Frame] = []
		for f in frames:
			if f.cell.size.x > 0: live.append(f)
		if live.is_empty(): return
		# Shelf-pack the cells.
		var x := 0
		var y := 0
		var shelf := 0
		var wmax := 0
		var cells: Array[Vector2i] = []
		for f in live:
			var cw := f.cell.size.x
			var ch := f.cell.size.y
			if x + cw > ATLAS_W:
				x = 0
				y += shelf + PAD
				shelf = 0
			cells.append(Vector2i(x, y))
			x += cw + PAD
			shelf = maxi(shelf, ch)
			wmax = maxi(wmax, x)
		size = Vector2i(maxi(1, wmax), maxi(1, y + shelf))
		# Tables.
		var n := live.size()
		var fr := PackedInt32Array()
		fr.resize(n * FR)
		var state_n := 0
		var max_w := 0
		var max_h := 0
		for i in n:
			var f := live[i]
			var b := i * FR
			fr[b] = f.ops_off
			fr[b + 1] = f.ops_len
			fr[b + 2] = f.cell.position.x
			fr[b + 3] = f.cell.position.y
			fr[b + 4] = f.cell.size.x
			fr[b + 5] = f.cell.size.y
			fr[b + 6] = cells[i].x
			fr[b + 7] = cells[i].y
			fr[b + 8] = state_n
			fr[b + 9] = Forge._bits(f.phase)
			fr[b + 10] = 1 if f.outline else 0
			fr[b + 11] = 1 if f.night else 0
			state_n += f.cell.size.x * f.cell.size.y
			max_w = maxi(max_w, f.cell.size.x)
			max_h = maxi(max_h, f.cell.size.y)
		var mt := _material_table()
		var tex := registry.tex_code if registry.tex_code.size() else PackedInt32Array([0])
		var bounds := PackedInt32Array()
		bounds.resize(n * 4)
		for i in n:
			bounds[i * 4] = 1 << 30
			bounds[i * 4 + 1] = 1 << 30
			bounds[i * 4 + 2] = -1
			bounds[i * 4 + 3] = -1
		var sparks := PackedByteArray()
		sparks.resize(n * SPARKS * 4)
		var b_ops := rd.storage_buffer_create(ops.size() * 4, ops.to_byte_array())
		var b_frames := rd.storage_buffer_create(fr.size() * 4, fr.to_byte_array())
		var b_mats := rd.storage_buffer_create(mt.size() * 4, mt.to_byte_array())
		var b_tex := rd.storage_buffer_create(tex.size() * 4, tex.to_byte_array())
		var b_state := rd.storage_buffer_create(state_n * 8)
		var b_bounds := rd.storage_buffer_create(bounds.size() * 4, bounds.to_byte_array())
		var b_sparks := rd.storage_buffer_create(sparks.size(), sparks)
		_color_rid = _atlas(rd)
		_glow_rid = _atlas(rd)
		var set_a := rd.uniform_set_create([
			Forge._buf(0, b_ops), Forge._buf(1, b_frames), Forge._buf(2, b_mats),
			Forge._buf(3, b_tex), Forge._buf(4, b_state), Forge._buf(5, b_bounds),
		], Forge._raster_shader, 0)
		var set_b := rd.uniform_set_create([
			Forge._buf(0, b_frames), Forge._buf(1, b_mats), Forge._buf(2, b_state),
			Forge._img(3, _color_rid), Forge._img(4, _glow_rid), Forge._buf(5, b_sparks),
		], Forge._compose_shader, 0)
		var gx := ceili(max_w / 8.0)
		var gy := ceili(max_h / 8.0)
		var cl := rd.compute_list_begin()
		rd.compute_list_bind_compute_pipeline(cl, Forge._raster_pipe)
		rd.compute_list_bind_uniform_set(cl, set_a, 0)
		rd.compute_list_dispatch(cl, gx, gy, n)
		rd.compute_list_add_barrier(cl)
		rd.compute_list_bind_compute_pipeline(cl, Forge._compose_pipe)
		rd.compute_list_bind_uniform_set(cl, set_b, 0)
		rd.compute_list_dispatch(cl, gx, gy, n)
		rd.compute_list_end()
		var bb := rd.buffer_get_data(b_bounds).to_int32_array()
		var sp := rd.buffer_get_data(b_sparks).to_int32_array()
		for r in [set_a, set_b, b_ops, b_frames, b_mats, b_tex, b_state, b_bounds, b_sparks]:
			rd.free_rid(r)
		# Frames point back at the job: drop the list (and the op stream) so the job can be freed.
		frames = []
		ops = PackedFloat32Array()
		color = Texture2DRD.new()
		color.texture_rd_rid = _color_rid
		glow = Texture2DRD.new()
		glow.texture_rd_rid = _glow_rid
		_id = get_instance_id()
		Forge._live[_id] = weakref(self)
		# Exact crops, as Raster.compose: drawn pixels, plus the outline ring.
		for i in n:
			var f := live[i]
			var ex0 := bb[i * 4]
			var ey0 := bb[i * 4 + 1]
			var ex1 := bb[i * 4 + 2]
			var ey1 := bb[i * 4 + 3]
			if ex1 < 0: continue
			if f.outline:
				ex0 = maxi(f.cell.position.x, ex0 - 1)
				ey0 = maxi(f.cell.position.y, ey0 - 1)
				ex1 = mini(f.cell.end.x - 1, ex1 + 1)
				ey1 = mini(f.cell.end.y - 1, ey1 + 1)
			f.w = ex1 - ex0 + 1
			f.h = ey1 - ey0 + 1
			f.ox = f.origin.x - ex0
			f.oy = f.origin.y - ey0
			f.region = Rect2i(cells[i].x + ex0 - f.cell.position.x, cells[i].y + ey0 - f.cell.position.y, f.w, f.h)
			var cnt := mini(sp[i * SPARKS], SPARKS - 1)
			if cnt > 0 and f.night:
				var idx := sp.slice(i * SPARKS + 1, i * SPARKS + 1 + cnt)
				idx.sort()
				var step := maxi(1, cnt / 6)
				var k := 0
				while k < cnt and f.sparks.size() < 12:
					var cw := f.cell.size.x
					f.sparks.append(f.cell.position.x + idx[k] % cw - ex0)
					f.sparks.append(f.cell.position.y + idx[k] / cw - ey0)
					k += step
		ops = PackedFloat32Array()

	func _material_table() -> PackedInt32Array:
		var t := PackedInt32Array()
		t.resize(maxi(1, registry.mats.size()) * MR)
		for i in registry.mats.size():
			var m: Dictionary = registry.mats[i]
			var b := i * MR
			var ramp: Array = m["ramp"]
			for k in 5: t[b + k] = int(ramp[k])
			t[b + 5] = int(m["ink"])
			t[b + 6] = int(m["maxTone"])
			t[b + 7] = int(m["minTone"])
			t[b + 8] = 1 if m["glow"] else 0
			t[b + 9] = Forge._bits(m["glowTone"])
			t[b + 10] = Forge._bits(m.get("shine", 0.0))
			t[b + 11] = Forge._bits(m.get("gleam", 0.0))
			t[b + 12] = 1 if m.get("sparkle", false) else 0
			t[b + 14] = m["_tex_off"]
			t[b + 15] = m["_tex_len"]
		return t

	func _atlas(rd: RenderingDevice) -> RID:
		var fmt := RDTextureFormat.new()
		fmt.width = size.x
		fmt.height = size.y
		fmt.format = RenderingDevice.DATA_FORMAT_R8G8B8A8_UNORM
		fmt.usage_bits = RenderingDevice.TEXTURE_USAGE_STORAGE_BIT | RenderingDevice.TEXTURE_USAGE_SAMPLING_BIT | \
			RenderingDevice.TEXTURE_USAGE_CAN_COPY_FROM_BIT | RenderingDevice.TEXTURE_USAGE_CAN_UPDATE_BIT
		var zero := PackedByteArray()
		zero.resize(size.x * size.y * 4)
		return rd.texture_create(fmt, RDTextureView.new(), [zero])

	## The atlas as a CPU image (tests and tools).
	func image(night := false) -> Image:
		var rid := _glow_rid if night else _color_rid
		if not rid.is_valid(): return Image.create_empty(1, 1, false, Image.FORMAT_RGBA8)
		var data := Forge._rd.texture_get_data(rid, 0)
		return Image.create_from_data(size.x, size.y, false, Image.FORMAT_RGBA8, data)

	## One frame cropped out of the atlas as a CPU image.
	func frame_image(f: Frame, night := false) -> Image:
		if f.empty(): return Image.create_empty(1, 1, false, Image.FORMAT_RGBA8)
		return image(night).get_region(f.region)

	func _notification(what: int) -> void:
		# (No method calls while being freed: the RIDs go directly.)
		if what == NOTIFICATION_PREDELETE: Forge._live.erase(_id)
		if what == NOTIFICATION_PREDELETE and Forge._rd != null:
			if _color_rid.is_valid(): Forge._rd.free_rid(_color_rid)
			if _glow_rid.is_valid(): Forge._rd.free_rid(_glow_rid)

	## shutdown(): unhooks the textures (sprite regions may still hold them) from
	## the atlases and frees those, while the renderer is still there.
	func close() -> void:
		for t in [color, glow]:
			if t != null: t.texture_rd_rid = RID()
		release()

	func release() -> void:
		if Forge._rd == null: return
		color = null
		glow = null
		if _color_rid.is_valid(): Forge._rd.free_rid(_color_rid)
		if _glow_rid.is_valid(): Forge._rd.free_rid(_glow_rid)
		_color_rid = RID()
		_glow_rid = RID()


static func _buf(binding: int, rid: RID) -> RDUniform:
	var u := RDUniform.new()
	u.uniform_type = RenderingDevice.UNIFORM_TYPE_STORAGE_BUFFER
	u.binding = binding
	u.add_id(rid)
	return u


static func _img(binding: int, rid: RID) -> RDUniform:
	var u := RDUniform.new()
	u.uniform_type = RenderingDevice.UNIFORM_TYPE_IMAGE
	u.binding = binding
	u.add_id(rid)
	return u


static var _b4 := PackedByteArray([0, 0, 0, 0])

static func _bits(v: float) -> int:
	_b4.encode_float(0, v)
	return _b4.decode_s32(0)
