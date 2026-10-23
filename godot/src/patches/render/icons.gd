
## The web crops the composed frame to a square around the piece. On the GPU the
## frame stays as composed; the square's size travels with it and GearIcons
## centres the piece in it when drawing.
static func crop(src, _x0: float, _y0: float, w: float, h: float) -> Dictionary:
	return {"frame": src, "w": int(w), "h": int(h)}
