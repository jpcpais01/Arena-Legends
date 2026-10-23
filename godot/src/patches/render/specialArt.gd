
# A skin's sprite bakes straight to the GPU (Raster.compose with no job: Forge.bake_one);
# the stock pixel-row sprites still come as pixel data.
static func sprite(key: String, make) -> Variant:
	var s = cache.get(key)
	if s != null:
		return s
	var f = make.call()
	if f.get("img") != null:
		s = {"img": f["img"], "ox": f["ox"], "oy": f["oy"], "w": f["w"], "h": f["h"]}
	else:
		s = {"img": canvas_of(f["w"], f["h"], f["data"]), "ox": f["ox"], "oy": f["oy"], "w": f["w"], "h": f["h"]}
	if f["glow"] != null:
		s["glow"] = f["glow"] if f.get("img") != null else canvas_of(f["w"], f["h"], f["glow"])
	if (null if f.get("sparks") == null else f.get("sparks").size()):
		s["sparks"] = f.get("sparks")
	TS.map_set(cache, key, s)
	return s

##  Rasterizes one frame of a skin's sprite around its anchor, with its night layer.
static func skin_frame(art, frame: float) -> Variant:
	if skinRaster == null:
		skinRaster = PixelRaster.Raster.new(112, 112)
	var r = skinRaster
	r.clear()
	r.phase = (int(frame) & 3)
	var handles = {}
	var h = func(m):
		var n = TS.id_get(nightMats, m)
		if n == null:
			n = TS.merge([m, NIGHT_LEGEND])
			TS.id_set(nightMats, m, n)
		var k = TS.id_get(handles, n)
		if not k:
			k = r.add(n)
			TS.id_set(handles, n, k)
		return k
	art["draw"].call(r, SpriteXform.Xf.new(56, 72, 0), fmod((fmod(frame, art["frames"])) + art["frames"], art["frames"]), h)
	return r.compose(56, 72, (art.get("outline") if art.get("outline") != null else true), true)
