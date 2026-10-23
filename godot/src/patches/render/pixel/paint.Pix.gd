func set_(x: float, y: float, c: float, a = 255) -> void:
	var xi := int(x)
	var yi := int(y)
	if xi < 0 or yi < 0 or xi >= w or yi >= h: return
	if a == null: a = 255
	var hx := int(c)
	data[yi * int(w) + xi] = float(((int(a) & 255) << 24) | ((hx & 255) << 16) | (hx & 0xff00) | ((hx >> 16) & 255))

func get_(x: float, y: float) -> float:
	if x < 0 or y < 0 or x >= w or y >= h: return 0
	return data[int(y * w + x)]

##  Filled (non-transparent) at x, y.
func has(x: float, y: float) -> bool:
	if x < 0 or y < 0 or x >= w or y >= h: return false
	return data[int(y * w + x)] >= 16777216.0
