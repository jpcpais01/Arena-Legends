class_name FighterPreview
extends Control
## A hero standing in a little pixel stage (the web's ui/preview.ts): the
## nameplates, the Armory, the creator. Idles, plays one of its moves when
## tapped (and now and then with `autoplay`), and shows what the battle shows
## around them: the set aura, companions riding along and legendary sparkles.
## The creator and shop also play entrances, finishers and victory poses on
## it (with soft canvas light), and lean the camera in on the face (`zoom`).
##
## `art_w` x `art_h` is the stage in art pixels; it is drawn at the largest
## whole scale that fits the control (or `fixed_scale`), centred, with the feet
## `ground` art pixels above its bottom edge (negative crops to a bust).

const SHOWCASE_SKIP := ["idle", "run", "back", "stop", "stopB", "land", "hurt", "stun", "air", "ko", "roll", "leap", "evade", "blink", "sec.riposte"]
## The ember and frost cores' aura: embers rising, frost glinting round the body.
const EMBER := {"spark": 0xffb040, "spark2": 0xc83a1a, "kind": "flame"}
const FROST := {"spark": 0xe8fbff, "spark2": 0x7ac8f0}

var art_w := 100
var art_h := 90
var ground := 8
var flip := false
var autoplay := false
var still := false
var pedestal := false
## Draw scale override (0: fit the control).
var fixed_scale := 0
## Where the stage sits when the control is larger: 0 top, 0.5 middle, 1 bottom.
var valign := 1.0

var bank
var _clips: Array = []
var _playing = null
var _t := 0.0
var _clock := 0.0
var _next := 0.0
var _special = null
var _sparks: Array = []
var _spark_t := 0.0
var _comp_spot = null
var _out := {"clip": "idle", "frame": 0, "face": null, "secOut": false, "useOut": false, "jitter": 0, "hop": 0, "key": "idle.0."}

## An entrance, or a finisher / victory pose (FinaleShow), playing on the stage.
var _ent = null
var _show = null
var _efx = null
var _soft = null
var _flash_t := 0.0
var _flash_col := 0xffffff
var _shake_t := 0.0
var _shake_a := 0.0
var _shake_x := 0
var _impact_t := 0.0
var _impact_col := 0xffffff
var _last_tip = null
var _view := {}
## Face zoom: 0 the whole stage, 1 leaning in on the head (eased over 320 ms).
var _zoom := 0.0
var _zoom_to := 0.0

var _root: RID
var _layers: Array[RID] = []
var _g: Canvas2D.Gpu
var _drawn := ""


func _init(build = null, w := 100, h := 90, opts := {}) -> void:
	art_w = w
	art_h = h
	flip = opts.get("flip", false)
	still = opts.get("still", false)
	autoplay = opts.get("autoplay", false)
	pedestal = opts.get("pedestal", false)
	ground = opts.get("ground", 12 if pedestal else 8)
	mouse_filter = Control.MOUSE_FILTER_PASS if not still else Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	if autoplay: _next = 2.5
	_view = {"sx": func(x: float) -> float: return roundf(art_w / 2.0) + x * SpriteAnimator.PPM + _shake_x,
		"sy": func(y: float) -> float: return art_h - ground - y * SpriteAnimator.PPM}
	if build != null: set_build(build)


func _enter_tree() -> void:
	if _root.is_valid(): return
	_root = RenderingServer.canvas_item_create()
	RenderingServer.canvas_item_set_parent(_root, get_canvas_item())
	for i in 4:
		var it := RenderingServer.canvas_item_create()
		RenderingServer.canvas_item_set_parent(it, _root)
		_layers.append(it)
	# Behind-drawing (destination-over) goes under the rest.
	RenderingServer.canvas_item_set_draw_index(_layers[2], -1)
	_g = Canvas2D.Gpu.new(_layers, self)
	_drawn = ""


func _exit_tree() -> void:
	if _g != null: _g.release()
	_g = null
	for it in _layers: RenderingServer.free_rid(it)
	_layers.clear()
	if _root.is_valid(): RenderingServer.free_rid(_root)
	_root = RID()


func set_build(build) -> void:
	var art = SpriteLook.make_art(build)
	_special = build["gear"].get("special")
	var set_ = SpriteAnims.clips_for(art)
	if bank != null: bank.release()
	bank = SpriteBankLib.SpriteBank.new(art, set_)
	_clips = []
	for k in (set_["clips"] as Dictionary).keys():
		if not SHOWCASE_SKIP.has(k): _clips.append(k)
	_playing = null
	_t = 0.0
	_sparks.clear()
	_drawn = ""
	queue_redraw()


## Plays a move (a given clip, or a random one).
func showcase(clip = null) -> void:
	if still or _clips.is_empty(): return
	_playing = clip if clip != null else _clips[randi() % _clips.size()]
	_t = 0.0


## Plays a pre-fight entrance on the spot (creator and shop previews), with its sounds.
func play_entrance(id: String) -> void:
	if still or bank == null: return
	_ent = RenderEntrance.Entrance.new(id, _stage(), 0, -1 if flip else 1, {"delay": 0.15, "room": art_h - ground - 64})
	_show = null
	# Hold off the next random move until it's over.
	_t = 0.0
	if _next > 0.0: _next = 4.5


## Acts out a KO finisher on a shadow double of the hero, then the victory pose `pose`.
func play_finisher(id: String, pose: String) -> void:
	if still or bank == null: return
	var cols = RenderSupers.skin_colours(bank.art.get("mainSkin"))
	var opts := {"finisher": id, "pose": pose, "top": (art_h - ground) / SpriteAnimator.PPM, "room": art_w / 2.0 / SpriteAnimator.PPM}
	if cols != null:
		opts["hi"] = cols[0]
		opts["lo"] = cols[1]
	_show = RenderFinaleShow.FinaleShow.new(bank, _stage(), -1 if flip else 1, opts)
	_ent = null
	_t = 0.0
	if _next > 0.0: _next = 6.0


## Strikes a victory pose (with its little extras).
func play_pose(id: String) -> void:
	if still or bank == null: return
	_show = RenderFinaleShow.FinaleShow.new(bank, _stage(), -1 if flip else 1, {"pose": id})
	_ent = null
	_t = 0.0
	if _next > 0.0: _next = 5.0


## Leans the camera in on the face (styling it in the creator), or back out.
func zoom(on: bool) -> void:
	_zoom_to = 1.0 if on else 0.0


## Clears the stage for an entrance or finale and gives it the preview's effects to play through.
func _stage() -> Dictionary:
	if _efx == null: _efx = RenderFx.Fx.new()
	_efx.clear()
	_playing = null
	if _soft == null: _soft = RenderSoftLight.SoftLights.new()
	_soft.clear()
	_impact_t = 0.0
	_flash_t = 0.0
	_last_tip = null
	var noop := func(_a = null, _b = null, _c = null, _d = null): pass
	return {
		"fx": _efx,
		"shake": func(a: float):
			_shake_a = maxf(_shake_a, a)
			_shake_t = 0.25 + a * 0.3,
		"flash": func(c, a: float):
			_flash_col = c
			_flash_t = maxf(_flash_t, a * 0.12),
		"sound": func(name: String, k = null): Sfx.sfx.play(name, 0, k if k != null else 1),
		"light": func(l): _soft.add(l),
		# No shader pass here: shockwaves show as their rings of light, impact frames as a bright wash.
		"shock": noop,
		"impact": func(hi, _lo = null, len_ = 0.06):
			_impact_col = hi
			_impact_t = maxf(_impact_t, float(len_) + 0.03),
		"zoomBlur": noop,
		"split": noop,
		"vignette": noop,
		"focus": noop,
		"tip": func():
			if _last_tip == null: return null
			return [(_last_tip[0] - roundf(art_w / 2.0) - _shake_x) / SpriteAnimator.PPM, (art_h - ground - _last_tip[1]) / SpriteAnimator.PPM],
	}


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT and not still:
		showcase()


func _notification(what: int) -> void:
	if what == NOTIFICATION_PREDELETE and bank != null:
		bank.release()


func _process(dt: float) -> void:
	if bank == null or _g == null or not is_visible_in_tree(): return
	_t += dt
	_clock += dt
	if _zoom != _zoom_to:
		_zoom = move_toward(_zoom, _zoom_to, dt / 0.32)
		_drawn = ""
	var o := _out
	if _shake_t > 0.0:
		_shake_t -= dt
		_shake_x = roundi((randf() - 0.5) * _shake_a * 6.0 * minf(1.0, _shake_t * 3.0)) if _shake_t > 0.0 else 0
	var pose = _ent.update(dt) if _ent != null else null
	if _ent != null and pose == null: _ent = null
	if _show != null:
		if _show.update(dt): pose = _show.hero
		else: _show = null
	if _efx != null: _efx.update(dt)
	if _soft != null: _soft.update(dt, dt)
	if pose != null:
		var cl: String = pose["clip"] if bank.set_["clips"].has(pose["clip"]) else "idle"
		o["clip"] = cl
		o["frame"] = int(RenderEntrance.wrap_frame(pose["frame"], SpriteAnims.clip_length(bank.set_["clips"][cl])))
		o["face"] = pose.get("face")
		o["key"] = "%s.%d.%s" % [cl, o["frame"], o["face"] if o["face"] != null else ""]
		_drawn = ""
		_draw_entrance(dt, pose)
		return
	o["face"] = null
	if still:
		o["clip"] = "idle"
		o["frame"] = 0
	elif _playing != null:
		var c = bank.set_["clips"][_playing]
		var n := int(SpriteAnims.clip_length(c))
		var i := floori(_t * 14.0)
		if i >= n + 3:
			_playing = null
			_t = 0.0
		o["clip"] = _playing if _playing != null else "idle"
		o["frame"] = mini(n - 1, i) if _playing != null else 0
	else:
		o["clip"] = "idle"
		var n: int = (bank.set_["clips"]["idle"]["w"] as Array).size()
		o["frame"] = floori(_t * 0.62 * n) % n
		if _next > 0.0 and _t > _next:
			showcase()
			_next = 3.0 + randf() * 3.0
	o["key"] = "%s.%d." % [o["clip"], o["frame"]]
	# A still portrait, or an idle frame with nothing moving around it, draws once.
	var art = bank.art
	var busy: bool = art.get("set") != null or _special != null or not _sparks.is_empty() or _has_spark_fx(art) or _fx_busy()
	var key: String = o["key"] + str(size) + str(flip)
	if key == _drawn and not busy: return
	_drawn = key
	_frame(dt)


func _has_spark_fx(art) -> bool:
	for k in ["mainSkin", "secSkin", "headSkin", "chestSkin", "bootsSkin", "useSkin", "specialSkin"]:
		var s = art.get(k)
		if s != null and s.get("fx") != null: return true
	return _special == "ember_core" or _special == "frost_core"


## Effects still playing out after an entrance (sparks, light).
func _fx_busy() -> bool:
	return _efx != null and (_efx.ps.size() > 0 or _efx.pulses.size() > 0 or _efx.pops.size() > 0 or _soft.ls.size() > 0)


## The whole scale the stage is drawn at, and where its top-left sits in the control.
func _place() -> Array:
	var k := fixed_scale if fixed_scale > 0 else UI.fit_scale(Vector2(art_w, art_h), size)
	var off := Vector2(roundf((size.x - art_w * k) / 2.0), roundf((size.y - art_h * k) * valign))
	return [k, off]


## Stage transform: the whole-pixel scale, leaning in on the head while zoomed
## (the web's translateY(18%) scale(2) about 50% 26%, eased).
func _place_root() -> void:
	var pl := _place()
	var k: float = pl[0]
	var off: Vector2 = pl[1]
	var e := 1.0 - pow(1.0 - _zoom, 3.0)
	var z := 1.0 + e
	var o := off + Vector2(art_w * k * 0.5, art_h * k * 0.26)
	var at := o + Vector2(0, art_h * k * 0.18 * e) + (off - o) * z
	RenderingServer.canvas_item_set_transform(_root, Transform2D(Vector2(k * z, 0), Vector2(0, k * z), at.round() if e == 0.0 or e == 1.0 else at))


func _frame(dt: float) -> void:
	_place_root()
	var g := _g
	g.begin()
	var s: Dictionary = bank.get_(_out)
	var gx := roundi(art_w / 2.0)
	var gy := art_h - ground
	if pedestal: _pedestal(g, gx, gy)
	g.fill_style = "rgba(0,0,0,0.3)"
	g.fill_rect(gx - 11, gy - 1, 22, 3)
	var art = bank.art
	var facing := -1 if flip else 1
	var set_ = art.get("set")
	if set_ != null: RenderSetAura.draw_set_aura(g, set_, gx, gy, _clock, "back", facing)
	RenderCompanions.draw_companions(g, art, _special, gx, gy, _clock, facing, "back")
	var img = s["img"]
	if flip:
		g.save()
		g.translate(gx + 1, 0)
		g.scale(-1, 1)
		g.draw_image(img, -s["ox"], gy - s["oy"])
		g.restore()
	else:
		g.draw_image(img, gx - s["ox"], gy - s["oy"])
	if set_ != null: RenderSetAura.draw_set_aura(g, set_, gx, gy, _clock, "front", facing)
	_comp_spot = RenderCompanions.draw_companions(g, art, _special, gx, gy, _clock, facing, "front")
	if _efx != null:
		_efx.draw(g, _view)
		_soft.draw(g, _view)
	if not still: _draw_sparks(dt, s, gx, gy)


## One frame of an entrance: the effects around the fighter, who may be faded, washed or half in the ground.
func _draw_entrance(dt: float, pose: Dictionary) -> void:
	_place_root()
	var g := _g
	g.begin()
	var v := _view
	var ent = _show if _show != null else _ent
	var gx := roundi(art_w / 2.0) + _shake_x
	var gy := art_h - ground
	if pedestal: _pedestal(g, gx, gy)
	_efx.draw_under(g, v)
	ent.draw(g, v, "under")
	var x := roundf(v["sx"].call(pose["dx"]))
	var y := roundf(v["sy"].call(pose["dy"]))
	var shadow: float = pose["shadow"]
	if shadow > 0.05:
		g.fill_style = Color(0, 0, 0, 0.3 * shadow)
		var r := roundi(11 * (0.4 + 0.6 * shadow))
		g.fill_rect(x - r, gy - 1, r * 2, 3)
	var alpha: float = pose["alpha"]
	var s = null
	var pflip: bool = flip != bool(pose["flip"])
	if alpha > 0.0:
		s = bank.get_(_out)
		var set_ = bank.art.get("set")
		var facing := -1 if pflip else 1
		if pose["clipGround"]:
			g.save()
			g.begin_path()
			g.rect(0, 0, art_w, gy + 1)
			g.clip()
		if set_ != null and alpha >= 1.0: RenderSetAura.draw_set_aura(g, set_, x, y, _clock, "back", facing)
		var k := Vector2(pose["sx"], pose["sy"])
		var ghosts := int(pose["ghosts"])
		for i in range(ghosts, 0, -1):
			g.global_alpha = alpha * 0.55 * (1.0 - float(i) / (ghosts + 1))
			var gs = bank.flash(_out, pose["ghostCol"]) if pose["ghostCol"] != null else s
			_blit(g, gs, s, x - roundf(float(pose["ghostDx"]) * i * SpriteAnimator.PPM), y, pflip, k)
		g.global_alpha = alpha
		_blit(g, s, s, x, y, pflip, k)
		if pose["tint"] != null and float(pose["tintA"]) > 0.0:
			g.global_alpha = alpha * minf(1.0, pose["tintA"])
			_blit(g, bank.flash(_out, pose["tint"]), s, x, y, pflip, k)
		var tip = s.get("tip")
		_last_tip = [x + (-tip[0] if pflip else tip[0]), y + tip[1]] if tip != null else null
		g.global_alpha = 1.0
		if set_ != null and alpha >= 1.0: RenderSetAura.draw_set_aura(g, set_, x, y, _clock, "front", facing)
		if pose["clipGround"]: g.restore()
	ent.draw(g, v, "over")
	_efx.draw(g, v)
	_soft.draw(g, v)
	# Impact frames and flashes wash the hero (the web washes everything drawn; the
	# effects here are mostly light already).
	if s != null and (_impact_t > 0.0 or _flash_t > 0.0):
		var col: int = _impact_col if _impact_t > 0.0 else _flash_col
		g.global_alpha = 0.8 if _impact_t > 0.0 else minf(0.5, _flash_t * 4.0)
		_blit(g, bank.flash(_out, Color.hex((col << 8) | 0xff)), s, x, y, pflip, Vector2(pose["sx"], pose["sy"]))
		g.global_alpha = 1.0
	_impact_t -= dt
	_flash_t -= dt


## Draws a sprite image at its feet; `k` squashes or stretches it about them.
func _blit(g: Canvas2D.Gpu, img: Dictionary, s: Dictionary, x: float, y: float, fl: bool, k := Vector2.ONE) -> void:
	var reg: Canvas2D.Region = img["img"]
	var w := roundf(reg.width * k.x)
	var h := roundf(reg.height * k.y)
	var ox := roundf(float(s["ox"]) * k.x)
	var oy := roundf(float(s["oy"]) * k.y)
	if fl:
		g.save()
		g.translate(x + 1, 0)
		g.scale(-1, 1)
		g.draw_image(reg, -ox, y - oy, w, h)
		g.restore()
	else:
		g.draw_image(reg, x - ox, y - oy, w, h)


## Legendary skins twinkle where they're worn (weapon tips, head, body, feet), like in battle.
func _draw_sparks(dt: float, s: Dictionary, gx: int, gy: int) -> void:
	var art = bank.art
	var fl := func(p) -> Vector2: return Vector2(gx + (-p[0] if flip else p[0]), gy + p[1])
	var top: float = gy - float(s["oy"])
	var spots := [
		[_skin_fx(art, "mainSkin"), fl.call(s["tip"]) if s.get("tip") != null else null, 4],
		[_skin_fx(art, "secSkin"), fl.call(s["secTip"]) if s.get("secTip") != null else null, 4],
		[_skin_fx(art, "headSkin"), Vector2(gx, top + 4), 8],
		[_skin_fx(art, "chestSkin"), Vector2(gx, gy - 30), 14],
		[_skin_fx(art, "bootsSkin"), Vector2(gx, gy - 1), 12],
		[_skin_fx(art, "useSkin"), fl.call([4, -26]), 4],
		[RenderSetAura.SET_FX.get(art.get("set")) if art.get("set") != null else null, Vector2(gx, gy - 1), 30],
		[_skin_fx(art, "specialSkin"), Vector2(_comp_spot[0], _comp_spot[1]) if _comp_spot != null else null, 5],
		[EMBER if _special == "ember_core" else FROST if _special == "frost_core" else null, Vector2(gx, gy - 28), 18],
	]
	_spark_t -= dt
	if _spark_t <= 0.0:
		_spark_t = 0.05 if _playing != null else 0.14
		for sp in spots:
			var fx = sp[0]
			if fx == null or sp[1] == null: continue
			var p: Vector2 = sp[1]
			var spread: float = sp[2]
			_sparks.append({"x": roundf(p.x + (randf() - 0.5) * spread), "y": roundf(p.y + (randf() - 0.5) * spread * 0.6), "t": 0.0,
				"a": fx["spark"], "b": fx.get("spark2", fx["spark"]), "flame": fx.get("kind") == "flame"})
	var g := _g
	var i := _sparks.size() - 1
	while i >= 0:
		var p: Dictionary = _sparks[i]
		p["t"] += dt
		if p["t"] > 0.5:
			_sparks.remove_at(i)
			i -= 1
			continue
		var t: float = p["t"]
		var y := roundf(p["y"] - t * (16.0 if p["flame"] else 8.0))
		g.fill_style = Color.hex((int(p["a"] if t < 0.25 else p["b"]) << 8) | 0xff)
		var x: float = p["x"]
		if p["flame"]:
			g.fill_rect(x, y, 1, 2 if t < 0.28 else 1)
			if t < 0.15: g.fill_rect(x - 1, y + 1, 3, 1)
		else:
			g.fill_rect(x, y, 1, 1)
			if t < 0.2:
				g.fill_rect(x - 1, y, 3, 1)
				g.fill_rect(x, y - 1, 1, 3)
		i -= 1


func _skin_fx(art, k: String):
	var s = art.get(k)
	return s.get("fx") if s != null else null


## A round stone dais, its top face centred on (x, y): a lit top with a gold inlay over a darker side.
func _pedestal(g: Canvas2D.Gpu, x: int, y: int) -> void:
	var rx := 30
	var ry := 6
	var depth := 6
	var half := func(i: int) -> int: return roundi(rx * sqrt(maxf(0.0, 1.0 - pow(i / (ry + 0.5), 2))))
	for d in range(depth, 0, -1):
		g.fill_style = "#1c1530" if d > depth - 2 else "#2c2346"
		for i in ry + 1:
			var hw: int = half.call(i)
			g.fill_rect(x - hw, y + i + d, hw * 2, 1)
	for i in range(-ry, ry + 1):
		g.fill_style = "#8c7cb4" if i <= -ry + 1 else ("#5f5186" if i < 0 else "#524577")
		var hw: int = half.call(i)
		g.fill_rect(x - hw, y + i, hw * 2, 1)
	g.fill_style = "rgba(245,191,69,0.6)"
	for a in 72:
		var t := a / 72.0 * TAU
		g.fill_rect(roundf(x + cos(t) * (rx - 6)), roundf(y + sin(t) * (ry - 2)), 1, 1)
