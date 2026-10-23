class_name SceneGlLib
## The shader layer of the shop scenes (the web's ui/sceneGl.ts): the chest
## grove and the forge are drawn at art resolution (Canvas2D.Gpu into a small
## viewport), then redrawn by a post shader at "CSS pixel" resolution, still
## sampled on the art-pixel grid so it stays pixel art: soft bloom on what is
## bright, shockwave refraction, heat haze, a camera that pushes in, zoom blur,
## colour split, anime impact frames and a vignette. Additive light (glows,
## rings, beams, flares, stars, rays) goes over that, each light drawn only
## inside its own bounds. `display` shows the result scaled to the screen.

const MAX_WAVES := 6
const MAX_LIGHTS := 40
const KIND := {"glow": 0, "ring": 1, "arc": 2, "beam": 3, "flare": 4, "star": 5, "rays": 6}

const POST := """
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D scene : filter_nearest, repeat_disable;
uniform vec2 res;
uniform vec2 buf;
uniform float k;
uniform float time;
uniform vec3 cam;
uniform vec4 wave[6];
uniform vec4 waveC[6];
uniform vec4 zoom;
uniform float ca;
uniform vec4 haze;
uniform float hazeAmp;
uniform float bloom;
uniform vec4 imp;
uniform vec3 impHi;
uniform vec3 impLo;
uniform vec4 vig;

varying vec2 pos;

void vertex() { pos = VERTEX; }

vec3 at(vec2 a) {
	if (a.x < 0.0 || a.y < 0.0 || a.x >= buf.x || a.y >= buf.y) return vec3(0.0);
	return texture(scene, (floor(a) + 0.5) / buf).rgb;
}

vec3 hot(vec2 a) {
	vec3 s = at(a);
	float b = dot(s, vec3(0.3, 0.59, 0.11));
	return s * smoothstep(0.74, 1.0, b);
}

void fragment() {
	vec2 p = pos / k;
	p = (p - cam.xy) / cam.z + cam.xy;
	vec2 q = p;
	vec3 rim = vec3(0.0);
	for (int i = 0; i < 6; i++) {
		vec4 s = wave[i];
		if (s.w == 0.0) continue;
		vec2 d = p - s.xy;
		d.y *= 1.35;
		float l = length(d);
		float w = waveC[i].w;
		float x = (l - s.z) / w;
		float f = exp(-x * x);
		q -= d / max(l, 0.5) * f * s.w;
		rim += waveC[i].rgb * f * 0.3 * min(1.0, abs(s.w) / 2.0);
	}
	if (hazeAmp > 0.0 && p.x > haze.x && p.x < haze.z && p.y > haze.y && p.y < haze.w) {
		float u = (p.x - haze.x) / (haze.z - haze.x);
		float v = (p.y - haze.y) / (haze.w - haze.y);
		float m = sin(u * 3.14159) * smoothstep(0.0, 0.35, v) * smoothstep(1.0, 0.75, v);
		q.x += (sin(p.y * 0.9 - time * 7.0) + 0.6 * sin(p.y * 2.1 + time * 11.0)) * hazeAmp * m;
		q.y += sin(p.x * 1.3 + time * 5.0) * hazeAmp * 0.35 * m;
	}
	vec3 c;
	if (zoom.z > 0.0) {
		vec2 dir = (zoom.xy - q) * zoom.z;
		c = vec3(0.0);
		for (int i = 0; i < 8; i++) c += at(q + dir * (float(i) / 7.0));
		c /= 8.0;
	} else {
		c = at(q);
	}
	if (ca > 0.0) {
		vec2 dir = normalize(p - zoom.xy + 0.001) * ca * smoothstep(0.0, 0.5 * buf.y, length(p - zoom.xy));
		c.r = mix(c.r, at(q + dir).r, 0.85);
		c.b = mix(c.b, at(q - dir).b, 0.85);
	}
	if (bloom > 0.0) {
		vec3 b = vec3(0.0);
		for (int i = 0; i < 8; i++) {
			float a = float(i) * 0.785398 + 0.39;
			vec2 d = vec2(cos(a), sin(a));
			b += hot(q + d * 2.0) * 0.5 + hot(q + d * 4.5) * 0.32 + hot(q + d * 8.0) * 0.18;
		}
		c += b / 8.0 * bloom;
	}
	c += rim;
	float vd = length((p - buf * 0.5) / buf);
	c = mix(c, c * vig.rgb, smoothstep(0.3, 0.8, vd) * vig.w);
	if (imp.x > 0.0) {
		float lum = dot(c, vec3(0.3, 0.59, 0.11));
		float v = step(imp.z, lum);
		c = mix(c, mix(impLo, impHi, v), imp.x);
	}
	COLOR = vec4(c, 1.0);
}
"""

## One light (render/glfx.ts LIGHT). Screen blending (ONE, ONE_MINUS_SRC_COLOR) is
## approximated with premultiplied alpha: the light adds, and what is under it
## keeps (1 - its weakest channel).
const LIGHT := """
shader_type canvas_item;
render_mode blend_premul_alpha;

uniform vec2 dxy;
uniform float vs;
uniform int kind;
uniform vec2 c;
uniform vec4 a;
uniform vec4 b;
uniform vec3 hi;
uniform vec3 lo;
uniform float pw;

varying vec2 pos;

void vertex() { pos = VERTEX; }

float hash(float n) { return fract(sin(n) * 43758.5453); }
float ring(float ang, float n, float seed) {
	float x = (ang / 6.2831853 + 0.5) * n;
	float i = floor(x);
	float f = fract(x);
	return mix(hash(mod(i, n) + seed), hash(mod(i + 1.0, n) + seed), f * f * (3.0 - 2.0 * f));
}
float sq(float x) { return x * x; }

void fragment() {
	vec2 p = (floor((pos - dxy) / vs) + 0.5) * vs + dxy;
	vec2 d = p - c;
	float cr = cos(a.w);
	float sr = sin(a.w);
	vec2 q = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y);
	float R = a.x;
	float W = max(a.y, 0.5);
	float v = 0.0;
	float core = 0.0;
	if (kind == 0) {
		float r = length(q) / R;
		v = exp(-r * r * 3.0);
		core = exp(-r * r * 18.0);
	} else if (kind == 1) {
		q.y /= max(a.z, 0.05);
		float ang = atan(q.y, q.x);
		float n1 = ring(ang, 5.0, b.z + floor(b.w * 4.0));
		float n2 = ring(ang, 13.0, b.z + 17.0);
		float n3 = ring(ang, 29.0, b.z + floor(b.w * 9.0) * 3.0);
		float rr = R * (0.8 + 0.3 * n1 + 0.1 * n2 + 0.04 * n3);
		float th = W * (0.3 + 1.2 * n2 * n3 + 0.3 * n1);
		float e = length(q) - rr;
		float broken = smoothstep(0.3, 0.75, n1 * 0.55 + n2 * 0.35 + n3 * 0.3);
		float grain = 0.6 + 0.4 * hash(floor(p.x / vs) * 12.9898 + floor(p.y / vs) * 78.233 + floor(b.w * 12.0));
		float echo = length(q) - rr * (0.72 + 0.1 * n3);
		v = (exp(-sq(e / th)) + 0.3 * exp(-sq(echo / (th * 0.9))) * n2) * broken * grain + 0.1 * exp(-sq(e / (th * 3.0))) * grain;
		core = exp(-sq(e / (th * 0.35))) * broken * n1;
	} else if (kind == 2) {
		float ang = atan(q.y, q.x);
		float sw = a.z;
		float t = (sw >= 0.0 ? ang : -ang);
		t = mod(t + 4.0 * PI, 2.0 * PI) / abs(sw);
		float head = b.x;
		float tail = b.y;
		if (!(t > head || t < tail || t > 1.0)) {
			float u = (t - tail) / max(head - tail, 0.001);
			float taper = sin(u * PI * 0.92 + 0.08) * (0.35 + 0.65 * u);
			float e = length(q) - R;
			float th = W * taper;
			v = exp(-sq(e / max(th, 0.5))) * (0.4 + 0.6 * u) + 0.25 * exp(-sq(e / (th * 3.0 + 1.0))) * u;
			core = exp(-sq(e / max(th * 0.3, 0.5))) * u * u;
		}
	} else if (kind == 3) {
		float L = R;
		float x = clamp(q.x, 0.0, L);
		float e = length(vec2(q.x - x, q.y));
		float u = x / max(L, 1.0);
		float th = W * (0.25 + 0.75 * u);
		v = exp(-sq(e / th)) * (0.3 + 0.7 * u) + 0.3 * exp(-sq(e / (th * 4.0))) * u;
		core = exp(-sq(e / (th * 0.3))) * u;
	} else if (kind == 4) {
		v = exp(-sq(q.y / W)) * exp(-sq(q.x / R) * 2.0) + 0.6 * exp(-dot(q, q) / (W * W * 30.0));
		core = exp(-sq(q.y / (W * 0.3))) * exp(-sq(q.x / R) * 6.0);
	} else if (kind == 5) {
		float r = length(q);
		v = (exp(-abs(q.y) / W) * exp(-abs(q.x) / R) + exp(-abs(q.x) / W) * exp(-abs(q.y) / R)) + exp(-r * r / (W * W * 6.0));
		core = exp(-r * r / (W * W * 1.5));
	} else {
		float r = length(q);
		float ang = atan(q.y, q.x) / (2.0 * PI) + 0.5;
		float n = ang * 26.0;
		float kk = mix(hash(floor(n) + b.z), hash(floor(n) + 1.0 + b.z), smoothstep(0.0, 1.0, fract(n)));
		v = kk * kk * kk * smoothstep(R, R * 0.15, r) * smoothstep(0.0, R * 0.12, r);
	}
	vec3 col = (mix(lo * 1.3, hi, smoothstep(0.45, 1.0, v)) * v * 1.15 + vec3(1.0) * core * 0.45) * pw;
	col = min(col, vec3(1.0));
	COLOR = vec4(col, min(col.r, min(col.g, col.b)));
}
"""

static var _post_shader: Shader
static var _light_shader: Shader


static func _shader(post: bool) -> Shader:
	if post and _post_shader != null: return _post_shader
	if not post and _light_shader != null: return _light_shader
	var sh := Shader.new()
	sh.code = POST if post else LIGHT
	if post: _post_shader = sh
	else: _light_shader = sh
	return sh


static func _rgb(col) -> Vector3:
	var c := Canvas2D.color(col)
	return Vector3(c.r, c.g, c.b)


## Shows the post viewport scaled to the screen (nearest), from the top-left.
class Display extends Control:
	var gl: SceneGl
	var class_name_ := ""

	func _init(g: SceneGl) -> void:
		gl = g
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST

	func _draw() -> void:
		var tex := gl._post.get_texture()
		var s := Vector2(gl._post.size) * gl.scale
		draw_texture_rect(tex, Rect2(Vector2.ZERO, s), false)


class SceneGl:
	## The art canvas (its width and height are the art size).
	var src
	## The Control that shows the scene; add it to the screen.
	var canvas: Display
	var display: Display
	## What draws the art: begin() it every frame, then draw.
	var gpu: Canvas2D.Gpu
	var on_lost = null
	## Camera: pushes in `zoom` times on (x, y), art px.
	var cam := {"x": 0.0, "y": 0.0, "zoom": 1.0}
	## Heat haze over a box (art px) and its strength in art px.
	var haze := {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0, "amp": 0.0}
	var bloom := 0.9
	var vignette := {"col": "#000000", "k": 0.0}
	## Post pixels per art pixel ("CSS px"), and device pixels per post pixel.
	var k := 3
	var scale := 1.0

	var _art: SubViewport
	var _post: SubViewport
	var _mat: ShaderMaterial
	var _post_item: RID
	var _light_items: Array[RID] = []
	var _light_mats: Array[ShaderMaterial] = []
	var _glows: Array = []
	var _waves: Array = []
	var _zoom_fx = null
	var _ca_fx = null
	var _imp = null
	var _time := 0.0

	func _init(s) -> void:
		src = s
		display = Display.new(self)
		canvas = display
		_post = _viewport(false)
		display.add_child(_post)
		_art = _viewport(false)
		# Inside the post viewport, so it renders first.
		_post.add_child(_art)
		var art_root := RenderingServer.canvas_item_create()
		RenderingServer.canvas_item_set_parent(art_root, _art.find_world_2d().canvas)
		var roots: Array[RID] = [art_root, art_root, art_root, art_root]
		gpu = Canvas2D.Gpu.new(roots, src)
		_mat = ShaderMaterial.new()
		_mat.shader = SceneGlLib._shader(true)
		_mat.set_shader_parameter("scene", _art.get_texture())
		var post_root := RenderingServer.canvas_item_create()
		RenderingServer.canvas_item_set_parent(post_root, _post.find_world_2d().canvas)
		_post_item = RenderingServer.canvas_item_create()
		RenderingServer.canvas_item_set_parent(_post_item, post_root)
		RenderingServer.canvas_item_set_material(_post_item, _mat.get_rid())
		for i in MAX_LIGHTS:
			var it := RenderingServer.canvas_item_create()
			RenderingServer.canvas_item_set_parent(it, post_root)
			RenderingServer.canvas_item_set_draw_index(it, i + 1)
			var m := ShaderMaterial.new()
			m.shader = SceneGlLib._shader(false)
			RenderingServer.canvas_item_set_material(it, m.get_rid())
			_light_items.append(it)
			_light_mats.append(m)
		display.tree_exiting.connect(_free)

	func _viewport(transparent: bool) -> SubViewport:
		var v := SubViewport.new()
		v.transparent_bg = transparent
		v.disable_3d = true
		v.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		v.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
		v.size = Vector2i(16, 16)
		return v

	func _free() -> void:
		gpu.release()
		for it in _light_items: RenderingServer.free_rid(it)
		_light_items.clear()
		RenderingServer.free_rid(_post_item)

	func get_ok() -> bool:
		return true

	## Matches the art canvas: `kk` post px per art px, shown `sc` device px per post px.
	func resize(kk, sc := 1.0) -> void:
		k = int(kk)
		scale = sc
		var aw := maxi(1, int(src.width))
		var ah := maxi(1, int(src.height))
		_art.size = Vector2i(aw, ah)
		_post.size = Vector2i(aw * k, ah * k)
		_mat.set_shader_parameter("res", Vector2(_post.size))
		_mat.set_shader_parameter("buf", Vector2(aw, ah))
		_mat.set_shader_parameter("k", float(k))
		RenderingServer.canvas_item_clear(_post_item)
		RenderingServer.canvas_item_add_rect(_post_item, Rect2(Vector2.ZERO, Vector2(_post.size)), Color.WHITE)
		display.queue_redraw()

	func add(l):
		l["t"] = -float(l.get("delay", 0.0))
		if _glows.size() >= MAX_LIGHTS: _glows.pop_front()
		_glows.append(l)
		return l

	## Ends a light early (it fades over a moment).
	func end(l) -> void:
		if l == null or l.get("t") == null: return
		l["hold"] = false
		l["life"] = minf(l["life"], maxf(0.0, l["t"]) + 0.3)
		l["t"] = maxf(l["t"], l["life"] - 0.3)

	## A shockwave: a ring of refraction racing out to radius `r` (art px).
	func shock(x, y, r, amp, life, col) -> void:
		if _waves.size() >= MAX_WAVES: _waves.pop_front()
		_waves.append({"x": float(x), "y": float(y), "r": float(r), "amp": float(amp), "life": float(life), "col": SceneGlLib._rgb(col), "t": 0.0})

	func zoom_blur(x, y, kk, life) -> void:
		_zoom_fx = {"x": float(x), "y": float(y), "t": 0.0, "life": float(life), "k": float(kk)}

	func split(kk, life) -> void:
		_ca_fx = {"t": 0.0, "life": float(life), "k": float(kk)}

	## An anime impact frame: the picture flips to two-tone ink for a split second.
	func impact(hi, lo, len_ = 0.07) -> void:
		_imp = {"t": 0.0, "len": float(len_), "hi": SceneGlLib._rgb(hi), "lo": SceneGlLib._rgb(lo)}

	func clear() -> void:
		_glows.clear()
		_waves.clear()
		_zoom_fx = null
		_ca_fx = null
		_imp = null

	## Ages everything by `dt` real seconds and hands the frame to the shaders.
	func render(dt) -> void:
		_age(float(dt))
		var bw := float(_art.size.x)
		var bh := float(_art.size.y)
		var zm := float(cam["zoom"])
		var cx := float(cam["x"])
		var cy := float(cam["y"])
		var m := _mat
		m.set_shader_parameter("time", _time)
		m.set_shader_parameter("cam", Vector3(cx, cy, zm))
		var wv := PackedVector4Array()
		var wc := PackedVector4Array()
		wv.resize(MAX_WAVES)
		wc.resize(MAX_WAVES)
		for i in _waves.size():
			var s: Dictionary = _waves[i]
			var e: float = s["t"] / s["life"]
			var ease := 1.0 - pow(1.0 - e, 3.0)
			wv[i] = Vector4(s["x"], s["y"], s["r"] * (0.08 + 0.92 * ease), s["amp"] * pow(1.0 - e, 1.5))
			var c: Vector3 = s["col"]
			wc[i] = Vector4(c.x, c.y, c.z, maxf(1.5, s["r"] * 0.13 * (1.0 - e * 0.5)))
		m.set_shader_parameter("wave", wv)
		m.set_shader_parameter("waveC", wc)
		if _zoom_fx != null: m.set_shader_parameter("zoom", Vector4(_zoom_fx["x"], _zoom_fx["y"], _zoom_fx["k"] * pow(1.0 - _zoom_fx["t"] / _zoom_fx["life"], 2.0), 0))
		else: m.set_shader_parameter("zoom", Vector4(bw / 2.0, bh / 2.0, 0, 0))
		m.set_shader_parameter("ca", _ca_fx["k"] * pow(1.0 - _ca_fx["t"] / _ca_fx["life"], 2.0) if _ca_fx != null else 0.0)
		m.set_shader_parameter("haze", Vector4(float(haze["x0"]), float(haze["y0"]), float(haze["x1"]), float(haze["y1"])))
		m.set_shader_parameter("hazeAmp", float(haze["amp"]))
		m.set_shader_parameter("bloom", bloom)
		if _imp != null:
			m.set_shader_parameter("imp", Vector4(0.95, 0, 0.42, 0))
			m.set_shader_parameter("impHi", _imp["hi"])
			m.set_shader_parameter("impLo", _imp["lo"])
		else:
			m.set_shader_parameter("imp", Vector4.ZERO)
		var vc := SceneGlLib._rgb(vignette["col"])
		m.set_shader_parameter("vig", Vector4(vc.x, vc.y, vc.z, float(vignette["k"])))
		_lights(cx, cy, zm)
		display.queue_redraw()

	func _lights(cx: float, cy: float, zm: float) -> void:
		for it in _light_items: RenderingServer.canvas_item_clear(it)
		if _imp != null: return
		var vs := k * zm
		# Art px -> post px through the camera; light snaps to the (zoomed) art-pixel grid.
		var ox := -cx * vs + cx * k
		var oy := -cy * vs + cy * k
		var view := Rect2(Vector2.ZERO, Vector2(_post.size))
		var n := 0
		for li in _glows:
			var t: float = li["t"]
			if t < 0.0: continue
			var e := minf(1.0, t / float(li["life"]))
			var grow := 1.0 - pow(1.0 - e, 3.0)
			var fin := float(li.get("fin", 0.08))
			var fade := ((1.0 - e) / 0.25 if e > 0.75 else 1.0) if li.get("hold", false) else pow(1.0 - e, 1.6)
			var pw := float(li.get("power", 1.0)) * minf(1.0, e / fin if fin > 0.0 else 1.0) * fade
			if pw <= 0.002: continue
			var r0 := float(li["r0"])
			var R := (r0 + (float(li["r1"]) - r0) * grow) * vs
			var W := float(li.get("w", 1.0)) * vs
			var kind: String = li["kind"]
			var rot := float(li.get("rot", 0.0))
			var c := Vector2(float(li["x"]) * vs + ox, float(li["y"]) * vs + oy)
			var box: Rect2
			match kind:
				"beam":
					var tip := c + Vector2(cos(rot), sin(rot)) * R
					box = Rect2(c, Vector2.ZERO).expand(tip).grow(W * 10.0)
				"glow": box = Rect2(c, Vector2.ZERO).grow(R * 1.6)
				"ring": box = Rect2(c, Vector2.ZERO).grow(R * 1.25 + W * 12.0)
				"arc": box = Rect2(c, Vector2.ZERO).grow(R + W * 4.0)
				"flare": box = Rect2(c, Vector2.ZERO).grow(maxf(R * 2.0, W * 14.0))
				"star": box = Rect2(c, Vector2.ZERO).grow(maxf(R * 4.0, W * 8.0))
				_: box = Rect2(c, Vector2.ZERO).grow(R)
			box = box.intersection(view)
			if not box.has_area(): continue
			var mat := _light_mats[n]
			mat.set_shader_parameter("dxy", Vector2(ox, oy))
			mat.set_shader_parameter("vs", vs)
			mat.set_shader_parameter("kind", KIND[kind])
			mat.set_shader_parameter("c", c)
			mat.set_shader_parameter("a", Vector4(R, W, float(li.get("sweep", PI)) if kind == "arc" else float(li.get("squash", 1.0)), rot))
			if kind == "arc": mat.set_shader_parameter("b", Vector4(minf(1.0, e / 0.45), pow(maxf(0.0, (e - 0.2) / 0.8), 0.8), 0, 0))
			else: mat.set_shader_parameter("b", Vector4(0, 0, float(li.get("seed", 0.0)), 0))
			mat.set_shader_parameter("hi", SceneGlLib._rgb(li["hi"]))
			mat.set_shader_parameter("lo", SceneGlLib._rgb(li["lo"]))
			mat.set_shader_parameter("pw", pw)
			RenderingServer.canvas_item_add_rect(_light_items[n], box, Color.WHITE)
			n += 1
			if n >= MAX_LIGHTS: break

	func _age(dt: float) -> void:
		_time += dt
		for i in range(_glows.size() - 1, -1, -1):
			var l: Dictionary = _glows[i]
			l["t"] += dt
			var f = l.get("follow")
			if f != null and l["t"] >= 0.0:
				var p = f.call()
				if p != null:
					l["x"] = p["x"]
					l["y"] = p["y"]
			if l["t"] >= l["life"]: _glows.remove_at(i)
		for i in range(_waves.size() - 1, -1, -1):
			_waves[i]["t"] += dt
			if _waves[i]["t"] >= _waves[i]["life"]: _waves.remove_at(i)
		if _imp != null:
			_imp["t"] += dt
			if _imp["t"] >= _imp["len"]: _imp = null
		if _zoom_fx != null:
			_zoom_fx["t"] += dt
			if _zoom_fx["t"] >= _zoom_fx["life"]: _zoom_fx = null
		if _ca_fx != null:
			_ca_fx["t"] += dt
			if _ca_fx["t"] >= _ca_fx["life"]: _ca_fx = null
