## Clears what the ring just drew inside `s` (groups 6 and 7), keeping the body behind it.
static func clear_shape(r, s: PixelSdf.Shape) -> void:
	r.erase(s, (1 << 6) | (1 << 7))
