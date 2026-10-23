## Smooth union of `s` (same maths as PixelSdf.blend).
static func blend_shapes(k: float, s: Array) -> PixelSdf.Shape:
	return PixelSdf.blend_of(k, s)


## Hair cap: everything of an enlarged head above the brow-to-nape line.
static func hair_cap(H, front: float, back: float, grow: float = 0.9) -> PixelSdf.Shape:
	var cap: PixelSdf.Shape = H.ell(-0.4, 0.9, 6.2 + grow, 6.1 + grow)
	var a: Array = H.p(7, front)
	var b: Array = H.p(-7.5, back)
	# Keep the side of line a→b where the crown is.
	var dx: float = b[0] - a[0]
	var dy: float = b[1] - a[1]
	var nx := -dy
	var ny := dx
	var crown: Array = H.p(0, 6)
	if (crown[0] - a[0]) * nx + (crown[1] - a[1]) * ny > 0:
		nx = -nx
		ny = -ny
	var l := sqrt(nx * nx + ny * ny)
	if l == 0.0: l = 1.0
	return PixelSdf.intersect(cap, PixelSdf.half_plane_box(a[0], a[1], nx / l, ny / l, cap.box))


## Head-space half plane above the line through (−10, back) and (10, front).
static func above(H, front: float, back: float, box: Dictionary) -> PixelSdf.Shape:
	var a: Array = H.p(10, front)
	var b: Array = H.p(-10, back)
	var dx: float = b[0] - a[0]
	var dy: float = b[1] - a[1]
	var nx := -dy
	var ny := dx
	var crown: Array = H.p(0, front + 10)
	if (crown[0] - a[0]) * nx + (crown[1] - a[1]) * ny > 0:
		nx = -nx
		ny = -ny
	var l := sqrt(nx * nx + ny * ny)
	if l == 0.0: l = 1.0
	return PixelSdf.half_plane_box(a[0], a[1], nx / l, ny / l, box)


## Weapon smear: a crescent trailing the swing, behind the body (the GPU paints it pixel by pixel).
static func draw_smear(r, art, sk, s, OX: float, OY: float) -> void:
	if s.get("ring"):
		draw_ring(r, art, sk, OX, OY)
		return
	var sh = sk["shN"]
	var tip: float = art["main"]["tip"]
	var reach: float = sqrt(pow(sk["handN"]["x"] - sh["x"], 2) + pow(sk["handN"]["y"] - sh["y"], 2)) + tip
	var cx: float = OX + sh["x"]
	var cy: float = OY - sh["y"]
	var shape := PixelSdf.arc(cx, cy, maxf(3, reach - tip * 0.75), reach + 1, -s["from"], -s["to"])
	var mat: int = r.add(smear_mat(art))
	var dim: int = r.add(smear_dim(art))
	var legend: bool = art["mainSkin"] != null and art["mainSkin"].get("fx") != null
	r.smear(shape, mat, dim, cx, cy, s["from"], s["to"] - s["from"], tip, reach, legend)


## Whirlwind: a flat band of motion around the waist, behind the body where they overlap.
static func draw_ring(r, art, sk, OX: float, OY: float) -> void:
	var cx: float = OX + sk["hip"]["x"]
	var cy: float = OY - (sk["hip"]["y"] + sk["chest"]["y"]) / 2.0
	var mat: int = r.add(smear_mat(art))
	var dim: int = r.add(smear_dim(art))
	r.ring(mat, dim, cx, cy, art["main"]["tip"] + 10, 5)
