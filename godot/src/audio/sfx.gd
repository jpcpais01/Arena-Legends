class_name Sfx
## Sound effects (audio/sfx.ts). Silent for now: the procedural sounds come in a later phase.

static var sfx := Engine_.new()


class Engine_:
	func unlock() -> void: pass
	func set_volume(_v) -> void: pass
	func set_muted(_m) -> void: pass
	func kiai(_pan = 0, _pitch = 1) -> void: pass
	func super_hit(_el, _pan = 0, _k = 1) -> void: pass
	func play(_name, _pan = 0, _intensity = 1) -> void: pass
