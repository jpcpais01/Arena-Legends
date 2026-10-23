
# Frames bake straight to GPU sprites (Raster.compose with no job: Forge.bake_one).
static func proj_sprite(id: String, frame: float, angle = null, skin = null) -> Variant:
	if angle == null: angle = 0
	var a: float = fmod((fmod(TS.round((angle / float((PI * 2))) * STEPS), STEPS)) + STEPS, STEPS)
	var f: float = fmod(frame, (TS.nn((null if art_for(id, skin) == null else art_for(id, skin)["frames"]), 1)))
	var key: String = (id + "." + TS.s(f) + "." + TS.s(a) + "." + (skin if skin != null else ""))
	var s = cache.get(key)
	if s != null:
		return s
	var fr = proj_frame(id, f, ((a / float(STEPS)) * PI) * 2, skin)
	s = {"img": fr["img"], "ox": fr["ox"], "oy": fr["oy"], "w": fr["w"], "h": fr["h"]}
	TS.map_set(cache, key, s)
	return s

##  An empty bottle tumbling through the air (tossed away after drinking), 8 frames per turn, optionally in the item's skin.
static func bottle_sprite(id: String, frame: float, skin = null) -> Variant:
	var f: float = fmod((fmod(frame, 8)) + 8, 8)
	var key: String = (id + "." + TS.s(f) + "." + (skin if skin != null else ""))
	var s = bottles.get(key)
	if s != null:
		return s
	if raster == null:
		raster = PixelRaster.Raster.new(80, 80)
	var r = raster
	r.clear()
	var a = SpriteUsables.usable_art(id, skin)
	var mats = {}
	var h = func(k: String):
		var m = a["mats"].get(k)
		var i = TS.id_get(mats, m)
		if not i:
			i = r.add(m)
			TS.id_set(mats, m, i)
		return i
	a["draw"].call(r, SpriteXform.Xf.new(40, 40, f * (PI / 4.0)), h, {"group": 1, "open": true})
	var fr = r.compose(40, 40, true)
	s = {"img": fr["img"], "ox": fr["ox"], "oy": fr["oy"], "w": fr["w"], "h": fr["h"]}
	TS.map_set(bottles, key, s)
	return s
