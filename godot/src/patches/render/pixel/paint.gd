
# Hand-tuned (typed, no calls): every painter runs these per pixel.
static var _BAYER_T := PackedFloat64Array([0.5 / 16, 8.5 / 16, 2.5 / 16, 10.5 / 16, 12.5 / 16, 4.5 / 16, 14.5 / 16, 6.5 / 16, 3.5 / 16, 11.5 / 16, 1.5 / 16, 9.5 / 16, 15.5 / 16, 7.5 / 16, 13.5 / 16, 5.5 / 16])

##  Ordered-dither threshold at a pixel (0..1).
static func bayer(x: float, y: float) -> float:
	return _BAYER_T[((int(y) & 3) << 2) | (int(x) & 3)]
