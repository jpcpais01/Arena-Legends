class_name GlFxLib
## Shader light layer over the pixel screen (render/glfx.ts): lights, shock
## rings, impact frames, zoom blur, colour split, vignette. Not drawn yet:
## `ok` stays false, so callers fall back to their plain looks.


class GlFx:
	var ok := false
	var screen

	func _init(s = null) -> void:
		screen = s

	func get_ok() -> bool:
		return ok

	func add(l):
		return l

	func shock(_s) -> void: pass
	func impact_frame(_hi, _lo, _len = 0.05) -> void: pass
	func zoom_blur(_x, _y, _k, _life) -> void: pass
	func split(_k, _life) -> void: pass
	func vignette(_c, _k, _life) -> void: pass
	func clear() -> void: pass
	func render(_dt, _real, _sx, _sy) -> void: pass
