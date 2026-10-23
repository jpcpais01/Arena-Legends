
# Hand-tuned (typed, no calls): painters mix and pack per pixel.
static func rgb_of(hex: float) -> Variant:
	var hx := int(hex)
	return [(hx >> 16) & 255, (hx >> 8) & 255, hx & 255]

##  Packs a 0xRRGGBB colour with alpha into ImageData's little-endian Uint32 layout.
static func pack(hex: float, a = 255) -> float:
	if a == null: a = 255
	var hx := int(hex)
	return float(((int(a) & 255) << 24) | ((hx & 255) << 16) | (hx & 0xff00) | ((hx >> 16) & 255))

static func unpack_hex(c: float) -> float:
	var ci := int(c)
	return float(((ci & 255) << 16) | (ci & 0xff00) | ((ci >> 16) & 255))

static func mix(a: float, b: float, t: float) -> float:
	var ai := int(a)
	var bi := int(b)
	var ar := (ai >> 16) & 255
	var ag := (ai >> 8) & 255
	var ab := ai & 255
	var r: float = ar + (((bi >> 16) & 255) - ar) * t
	var g: float = ag + (((bi >> 8) & 255) - ag) * t
	var bb: float = ab + ((bi & 255) - ab) * t
	r = 0.0 if r < 0.0 else (255.0 if r > 255.0 else r)
	g = 0.0 if g < 0.0 else (255.0 if g > 255.0 else g)
	bb = 0.0 if bb < 0.0 else (255.0 if bb > 255.0 else bb)
	return float((int(floor(r + 0.5)) << 16) | (int(floor(g + 0.5)) << 8) | int(floor(bb + 0.5)))
