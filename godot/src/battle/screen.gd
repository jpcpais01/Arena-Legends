class_name BattleScreen
extends Node
## The pixel-perfect battle screen (the web's render/screen.ts), on the GPU.
##
## The scene is drawn at "art" resolution, chosen so the art is ~340 px tall,
## into four layers (see Canvas2D.Gpu): the sky behind, the world, the tint
## painted over the world, and what comes after the arena's lighting pass.
## A composite shader stacks them, adds the light shafts, and the result is
## shown at a whole-number scale with nearest filtering, cropped and zoomed
## by the battle camera.

const COMPOSITE := """
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D sky_tex : filter_nearest;
uniform sampler2D world_tex : filter_nearest;
uniform sampler2D occl_tex : filter_linear;
uniform sampler2D atop_tex : filter_nearest;
uniform bool use_atop = false;
uniform vec2 size = vec2(800.0, 360.0);
uniform float shaft_power = 0.0;
uniform vec2 shaft_pos = vec2(0.0);
uniform vec3 shaft_color = vec3(1.0);

// The light's glow before anything blocks it (the web's radial gradient stops).
float glow(vec2 p) {
	float d = distance(p, shaft_pos) / (0.8 * size.x);
	if (d < 0.04) return mix(0.9, 0.82, d / 0.04);
	if (d < 0.25) return mix(0.82, 0.6, (d - 0.04) / 0.21);
	if (d < 0.6) return mix(0.6, 0.25, (d - 0.25) / 0.35);
	if (d < 1.0) return mix(0.25, 0.0, (d - 0.6) / 0.4);
	return 0.0;
}

void fragment() {
	vec2 uv = UV;
	vec4 sky = texture(sky_tex, uv);
	vec4 w = texture(world_tex, uv);
	if (use_atop) {
		vec4 a = texture(atop_tex, uv);
		w.rgb = a.rgb * w.a + w.rgb * (1.0 - a.a);
	}
	vec3 c = w.rgb + sky.rgb * (1.0 - w.a);
	if (shaft_power > 0.0) {
		// Zoom blur about the light: what blocks it casts shadows through the air.
		vec2 p = uv * size;
		float s = 0.0;
		for (int k = 0; k < 32; k++) {
			vec2 q = shaft_pos + (p - shaft_pos) * pow(1.018, -2.0 * float(k));
			s += glow(q) * (1.0 - texture(occl_tex, q / size).a);
		}
		vec3 v = shaft_color * (s / 32.0);
		c += v * v * shaft_power;
	}
	COLOR = vec4(c, 1.0);
}
"""

## Art-pixel size of the buffer and device pixels per art pixel.
var w := 1
var h := 1
var scale := 1
## The Control that shows the screen (fills its parent).
var display: Display
var g: Canvas2D.Gpu
var on_resize: Callable = Callable()
## g.canvas: what the drawing code reads its size from.
var surface := Canvas2D.Surface.new()

var _dx := 0
var _dy := 0
var _zoom := 1.0
var _cx := 0.0
var _cy := 0.0
var _ox := 0.0
var _oy := 0.0
var _vs := 1.0

var _final: SubViewport
var _sky: SubViewport
var _world: SubViewport
var _atop: SubViewport
var _composite: RID
var _over: RID
var _mat: ShaderMaterial


class Display extends Control:
	var screen: BattleScreen
	func _draw() -> void:
		screen._paint(self)


func _init() -> void:
	display = Display.new()
	display.screen = self
	display.set_anchors_preset(Control.PRESET_FULL_RECT)
	display.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	display.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_final = _viewport(false)
	add_child(_final)
	_sky = _viewport(false)
	_world = _viewport(true)
	_atop = _viewport(true)
	# Layers inside the final viewport render before it.
	for v in [_sky, _world, _atop]: _final.add_child(v)
	_mat = ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = COMPOSITE
	_mat.shader = sh
	_mat.set_shader_parameter("sky_tex", _sky.get_texture())
	_mat.set_shader_parameter("world_tex", _world.get_texture())
	_mat.set_shader_parameter("occl_tex", _world.get_texture())
	_mat.set_shader_parameter("atop_tex", _atop.get_texture())
	var final_root := RenderingServer.canvas_item_create()
	RenderingServer.canvas_item_set_parent(final_root, _canvas_of(_final))
	_composite = RenderingServer.canvas_item_create()
	RenderingServer.canvas_item_set_parent(_composite, final_root)
	RenderingServer.canvas_item_set_draw_index(_composite, 0)
	RenderingServer.canvas_item_set_material(_composite, _mat.get_rid())
	_over = RenderingServer.canvas_item_create()
	RenderingServer.canvas_item_set_parent(_over, final_root)
	RenderingServer.canvas_item_set_draw_index(_over, 1)
	var roots: Array[RID] = [_root_in(_world), _over, _root_in(_sky), _root_in(_atop)]
	g = Canvas2D.Gpu.new(roots, surface)


func _viewport(transparent: bool) -> SubViewport:
	var v := SubViewport.new()
	v.transparent_bg = transparent
	v.disable_3d = true
	v.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	v.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	v.snap_2d_transforms_to_pixel = true
	v.size = Vector2i(16, 16)
	return v


func _canvas_of(v: SubViewport) -> RID:
	return v.find_world_2d().canvas


func _root_in(v: SubViewport) -> RID:
	var r := RenderingServer.canvas_item_create()
	RenderingServer.canvas_item_set_parent(r, _canvas_of(v))
	return r


func _ready() -> void:
	display.resized.connect(_layout)
	_layout()


func _layout() -> void:
	var W := maxi(1, int(display.size.x))
	var H := maxi(1, int(display.size.y))
	# Aim for ~340 art pixels of height, but keep at least ~420 of width (phones in portrait).
	var s := maxi(1, mini(roundi(H / 340.0), floori(W / 420.0)))
	var nw := ceili(float(W) / s)
	var nh := ceili(float(H) / s)
	scale = s
	_dx = (W - nw * s) / 2
	_dy = (H - nh * s) / 2
	_vs = s
	if nw == w and nh == h and _final.size == Vector2i(nw, nh): return
	w = nw
	h = nh
	surface.width = w
	surface.height = h
	for v in [_final, _sky, _world, _atop]: v.size = Vector2i(w, h)
	_mat.set_shader_parameter("size", Vector2(w, h))
	RenderingServer.canvas_item_clear(_composite)
	RenderingServer.canvas_item_add_rect(_composite, Rect2(0, 0, w, h), Color.WHITE)
	if on_resize.is_valid(): on_resize.call()


func set_view(zoom, cx, cy) -> void:
	_zoom = maxf(1.0, float(zoom))
	_cx = float(cx)
	_cy = float(cy)


## Called once the frame's drawing is done: hands this frame's lighting to the composite.
func present() -> void:
	_mat.set_shader_parameter("use_atop", g.used[Canvas2D.Gpu.ATOP])
	_mat.set_shader_parameter("shaft_power", g.shafts)
	if g.shafts > 0.0:
		_mat.set_shader_parameter("shaft_pos", g.shaft_pos)
		_mat.set_shader_parameter("shaft_color", Vector3(g.shaft_color.r, g.shaft_color.g, g.shaft_color.b))
	display.queue_redraw()


func _paint(c: Control) -> void:
	c.draw_rect(Rect2(Vector2.ZERO, c.size), Color.BLACK)
	var W := float(w * scale)
	var H := float(h * scale)
	var z := _zoom
	if z == 1.0:
		_ox = 0
		_oy = 0
		_vs = scale
		c.draw_texture_rect_region(_final.get_texture(), Rect2(_dx, _dy, W, H), Rect2(0, 0, w, h))
		return
	var sw := w / z
	var sh := h / z
	var ox := clampf(_cx - sw / 2, 0, w - sw)
	var oy := clampf(_cy - sh / 2, 0, h - sh)
	var vs := scale * z
	if absf(vs - roundf(vs)) < 1e-6:
		ox = floorf(ox)
		oy = floorf(oy)
	_ox = ox
	_oy = oy
	_vs = vs
	c.draw_texture_rect_region(_final.get_texture(), Rect2(_dx, _dy, W, H), Rect2(ox, oy, sw, sh))


## How the shown buffer maps to device pixels: device = (art - o) × vs + d.
func get_mapping() -> Dictionary:
	return {"ox": _ox, "oy": _oy, "vs": _vs, "dx": _dx, "dy": _dy}


## Device px → art px.
func to_art(x, y) -> Array:
	return [(float(x) - _dx) / _vs + _ox, (float(y) - _dy) / _vs + _oy]


## Art px → device px.
func to_css(x, y) -> Array:
	return [(float(x) - _ox) * _vs + _dx, (float(y) - _oy) * _vs + _dy]


func get_css_pixel() -> float:
	return _vs
